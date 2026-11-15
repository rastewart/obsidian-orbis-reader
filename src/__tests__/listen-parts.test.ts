// The three pieces split out of the listening controller — the OS media controls, pocket mode's lock, and the voice
// gate — each driven on its own, which inside the controller none of them could be.

import type { App } from 'obsidian';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MediaSessionBridge, type MediaSessionTransport } from '../reader/tts/media-session';
import {
  lockPocket,
  PocketLock,
  PocketMode,
  type PocketScene,
  unlockPocket,
  wantsScreenOn,
} from '../reader/tts/pocket-lock';
import { buildSpeedControl } from '../reader/tts/speed-control';
import { VoiceGate, type VoiceGateDeps } from '../reader/tts/voice-gate';
import { augmentDom } from './dom-augment';

beforeAll(() => {
  augmentDom();
  (globalThis as { activeDocument?: Document }).activeDocument = document;
});

describe('the OS media controls', () => {
  const handlers = new Map<string, ((d: { seekTime?: number }) => void) | null>();
  const transport = (): MediaSessionTransport & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      isPlaying: () => false,
      togglePlayPause: () => calls.push('toggle'),
      skipTrack: (d) => calls.push(`track ${d}`),
      skipSeconds: (s) => calls.push(`seconds ${s}`),
      skipBackSeconds: () => 15,
      skipForwardSeconds: () => 30,
      trackDurationSec: () => 200,
      seekToTrackFraction: (f) => calls.push(`fraction ${f}`),
    };
  };

  beforeAll(() => {
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: { setActionHandler: (a: string, h: (d: { seekTime?: number }) => void) => handlers.set(a, h) },
    });
  });

  it('hands the OS buttons to the player', () => {
    const tr = transport();
    const bridge = new MediaSessionBridge(tr);
    bridge.install(document.createElement('div'));
    handlers.get('play')?.({});
    handlers.get('nexttrack')?.({});
    handlers.get('seekbackward')?.({});
    handlers.get('seekto')?.({ seekTime: 50 });
    expect(tr.calls).toEqual(['toggle', 'track 1', 'seconds -15', 'fraction 0.25']);
  });

  it('takes the handlers and the keepalive element back on clear', () => {
    const host = document.createElement('div');
    const bridge = new MediaSessionBridge(transport());
    bridge.install(host);
    expect(host.querySelector('audio')).not.toBeNull();
    bridge.clear();
    expect(host.querySelector('audio')).toBeNull();
    expect(handlers.get('play')).toBeNull();
  });
});

describe('pocket mode’s lock', () => {
  afterEach(() => document.body.classList.remove('orbis-listen-locked'));

  const touch = (): boolean => {
    const e = new Event('touchstart', { cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it('locks the player, darkens the reader and swallows stray touches', () => {
    const blackout = vi.fn();
    const lock = new PocketLock(blackout, () => {});
    const player = document.body.appendChild(document.createElement('div'));
    lock.buildHint(player);
    lock.buildRail(player);
    lock.setLocked(true);
    expect(lock.isLocked()).toBe(true);
    expect(player.classList.contains('orbis-locked')).toBe(true);
    expect(document.body.classList.contains('orbis-listen-locked')).toBe(true);
    expect(blackout).toHaveBeenCalledWith(true);
    expect(touch()).toBe(true);
    lock.dispose();
  });

  // Closing the view while locked used to leave the touch guard on the document: every touch after it swallowed.
  it('takes its body class and touch guard with it when the view goes', () => {
    const lock = new PocketLock(
      () => {},
      () => {}
    );
    const player = document.body.appendChild(document.createElement('div'));
    lock.buildRail(player);
    lock.setLocked(true);
    lock.dispose();
    expect(document.body.classList.contains('orbis-listen-locked')).toBe(false);
    expect(touch()).toBe(false);
  });
});

/**
 * Pocket mode in one step from wherever listening is, and back to where it was. It took five steps — the last a command
 * that existed only in Focus mode with the full player open.
 */
describe('turning Pocket mode on and off', () => {
  /** A reader showing the listening bar or the full player, in or out of Focus mode, that records what is done to it. */
  function reader(start: { focusMode: boolean; fullPlayer: boolean }, opens = true) {
    const state = { ...start, locked: false };
    const done: string[] = [];
    const scene: PocketScene = {
      focusMode: () => state.focusMode,
      fullPlayerShowing: () => state.fullPlayer,
      openFullPlayer: () => {
        done.push('open player');
        if (opens) state.fullPlayer = true;
        return opens;
      },
      toggleFocusMode: () => {
        state.focusMode = !state.focusMode;
        done.push(state.focusMode ? 'enter focus' : 'leave focus');
      },
      showText: () => {
        state.fullPlayer = false;
        done.push('show text');
      },
      setLocked: (locked) => {
        state.locked = locked;
        done.push(locked ? 'lock' : 'unlock');
      },
    };
    return { scene, state, done };
  }

  it('locks the full player in Focus mode from the standard player, and puts Focus mode back off', () => {
    const { scene, state, done } = reader({ focusMode: false, fullPlayer: true });
    const back = lockPocket(scene);
    expect(state).toEqual({ focusMode: true, fullPlayer: true, locked: true });
    unlockPocket(scene, back);
    expect(state).toEqual({ focusMode: false, fullPlayer: true, locked: false });
    expect(done).toEqual(['enter focus', 'lock', 'unlock', 'leave focus']);
  });

  it('leaves Focus mode on after unlocking when it was on before', () => {
    const { scene, state } = reader({ focusMode: true, fullPlayer: true });
    unlockPocket(scene, lockPocket(scene));
    expect(state).toEqual({ focusMode: true, fullPlayer: true, locked: false });
  });

  it('opens the full player from the listening bar, and returns to the text with the bar', () => {
    const { scene, state, done } = reader({ focusMode: false, fullPlayer: false });
    const back = lockPocket(scene);
    expect(state).toEqual({ focusMode: true, fullPlayer: true, locked: true });
    unlockPocket(scene, back);
    expect(state).toEqual({ focusMode: false, fullPlayer: false, locked: false });
    expect(done).toEqual(['open player', 'enter focus', 'lock', 'unlock', 'leave focus', 'show text']);
  });

  it('does not lock when the player cannot open yet, and changes nothing', () => {
    const { scene, state } = reader({ focusMode: false, fullPlayer: false }, false);
    expect(lockPocket(scene)).toBeNull();
    expect(state).toEqual({ focusMode: false, fullPlayer: false, locked: false });
  });

  it('locks and unlocks from the command, putting back the text with the bar', () => {
    const { scene, state } = reader({ focusMode: false, fullPlayer: false });
    const pocket = new PocketMode(scene, () => state.locked);
    pocket.toggle();
    expect(state).toEqual({ focusMode: true, fullPlayer: true, locked: true });
    pocket.toggle();
    expect(state).toEqual({ focusMode: false, fullPlayer: false, locked: false });
  });

  it('forgets what to put back when the book changes', () => {
    const { scene, state, done } = reader({ focusMode: false, fullPlayer: true });
    const pocket = new PocketMode(scene, () => state.locked);
    pocket.lock();
    pocket.reset();
    pocket.unlock();
    expect(done.slice(-1)).toEqual(['unlock']);
    expect(state.focusMode).toBe(true);
  });

  it('only unlocks when nothing was recorded — a lock the reader did not turn on from here', () => {
    const { scene, state, done } = reader({ focusMode: true, fullPlayer: true });
    unlockPocket(scene, null);
    expect(state.focusMode).toBe(true);
    expect(done).toEqual(['unlock']);
  });
});

// Found on an iPhone: in Pocket mode with Keep screen awake off, the screen went dark and the audio stopped with it.
describe('holding the screen on while listening', () => {
  it('holds it while Pocket mode is locked, playing or paused, whatever the setting says', () => {
    for (const playing of [true, false]) {
      expect(wantsScreenOn({ keepScreenAwake: false, playing, pocketLocked: true })).toBe(true);
    }
  });

  it('otherwise holds it only while audio plays with Keep screen awake on', () => {
    expect(wantsScreenOn({ keepScreenAwake: true, playing: true, pocketLocked: false })).toBe(true);
    expect(wantsScreenOn({ keepScreenAwake: true, playing: false, pocketLocked: false })).toBe(false);
    expect(wantsScreenOn({ keepScreenAwake: false, playing: true, pocketLocked: false })).toBe(false);
  });
});

// The speed moved off the listening bar into Voice and source, as the Display menu's slider-and-field control.
describe('the speed control', () => {
  function control(rate = 1) {
    const set = vi.fn();
    const box = document.body.appendChild(document.createElement('div'));
    buildSpeedControl(box, { rate, range: [0.5, 3], setRate: set, lockHeights: () => {}, unlockHeights: () => {} });
    const [slider, field] = Array.from(box.querySelectorAll('input'));
    return { set, slider, field };
  }

  it('shows the speed in the field and the slider, in tenths on the slider', () => {
    const { slider, field } = control(1.5);
    expect(field.value).toBe('1.5');
    expect(slider.value).toBe('15');
  });

  it('sets the speed as the field is typed in, moving the slider', () => {
    const { set, slider, field } = control();
    field.value = '2';
    field.dispatchEvent(new Event('input'));
    expect(set).toHaveBeenLastCalledWith(2);
    expect(slider.value).toBe('20');
  });

  it('settles a speed out of range on the nearest end when the field is left', () => {
    const { set, field } = control();
    field.value = '9';
    field.dispatchEvent(new Event('blur'));
    expect(field.value).toBe('3');
    expect(set).toHaveBeenLastCalledWith(3);
  });

  it('sets the speed as the slider moves, showing it in the field', () => {
    const { set, slider, field } = control();
    slider.value = '12';
    slider.dispatchEvent(new Event('input'));
    expect(set).toHaveBeenLastCalledWith(1.2);
    expect(field.value).toBe('1.2');
  });
});

describe('the voice gate', () => {
  const gate = (over: Partial<VoiceGateDeps['host']> = {}, source: 'orbis' | 'system' = 'orbis') =>
    new VoiceGate({
      app: { vault: { configDir: '.obsidian', adapter: { exists: async () => false } } } as unknown as App,
      host: {
        mixLiveVoiceOnDevice: async () => ({ voice: null }),
        deviceVoicePref: () => undefined,
        setDeviceVoicePref: async () => {},
        openLiveVoicePicker: () => {},
        ...over,
      },
      partIndex: () => 2,
      deviceSource: () => source,
      resolveSource: () => source,
      resetEngine: () => {},
    });

  it('can speak when a mix’s voice for this track is here, whatever the device’s own', async () => {
    const g = gate({ mixLiveVoiceOnDevice: async () => ({ voice: { source: 'system' } as never }) });
    expect(await g.canSpeakNow()).toBe(true);
  });

  it('cannot speak with an Orbis voice that is not downloaded', async () => {
    expect(await gate().canSpeakNow()).toBe(false);
  });

  it('carries straight on, without asking, when there is a voice', async () => {
    const then = vi.fn();
    await gate({ mixLiveVoiceOnDevice: async () => ({ voice: { source: 'system' } as never }) }).withVoice(then);
    expect(then).toHaveBeenCalledWith(false);
  });
});
