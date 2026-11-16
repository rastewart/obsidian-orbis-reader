import type { App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoicePref } from '../settings';

// Web Speech availability is the pivot for almost every decision in here (whether a System method is
// offered at all, and which source is active by default), so it's the one thing the tests control.
// voice-providers imports from this module too, hence the extra exports it needs.
const systemSupported = { value: true };
const systemVoices: { voiceURI: string; name: string }[] = [];
vi.mock('../reader/tts/WebSpeechEngine', () => ({
  WebSpeechEngine: class {
    static isSupported() {
      return systemSupported.value;
    }
  },
  listSystemVoices: () => systemVoices,
  findSystemVoice: (uri?: string) => systemVoices.find((v) => v.voiceURI === uri),
  previewSystemVoice: () => ({ stop: () => {} }),
  onVoicesChanged: () => () => {},
}));

const { liveVoicePicker } = await import('../reader/tts/live-voice-picker');
const { DEFAULT_ORBIS_VOICE_ID } = await import('../reader/tts/voice-catalog');

/** A picker bound to an in-memory pref + localStorage, so assertions can read what it persisted. */
function harness(pref?: Partial<VoicePref>) {
  const store: Record<string, string> = {};
  let current: VoicePref | undefined = pref ? { deviceId: 'dev', source: 'orbis', ...pref } : undefined;
  const patches: Partial<VoicePref>[] = [];
  const app = {
    loadLocalStorage: (k: string) => store[k] ?? null,
    saveLocalStorage: (k: string, v: string) => {
      store[k] = v;
    },
    vault: { adapter: {} },
  } as unknown as App;
  const pauseAudio = vi.fn();
  const { host, methods } = liveVoicePicker({
    app,
    cacheDir: '/cache',
    rate: () => 1,
    getPref: () => current,
    setPref: (patch) => {
      patches.push(patch);
      current = { deviceId: 'dev', source: 'orbis', ...current, ...patch };
    },
    pauseAudio,
  });
  return { host, methods, patches, store, pauseAudio, pref: () => current };
}

beforeEach(() => {
  systemSupported.value = true;
  systemVoices.length = 0;
});

describe('liveVoicePicker — offered methods', () => {
  it('offers Orbis and System when Web Speech is available, Orbis first', () => {
    const { methods } = harness();
    expect(methods.map((m) => m.method)).toEqual(['orbis', 'system']);
  });

  it('offers only Orbis where Web Speech is absent (Android)', () => {
    systemSupported.value = false;
    expect(harness().methods.map((m) => m.method)).toEqual(['orbis']);
  });

  it('gives every method a provider', () => {
    for (const m of harness().methods) expect(m.provider).toBeTruthy();
  });
});

describe('liveVoicePicker — which source is active', () => {
  /**
   * **Orbis with nothing saved, even where Web Speech exists.** Defaulting to `system` would make the OS the
   * product's narrator by omission on desktop and iPad, and hide `FirstVoiceModal` on exactly the devices where a
   * 60 MB download most wants asking about. The picker's own tab order says Orbis first too.
   */
  it('defaults to Orbis when nothing is saved, whatever the system offers', () => {
    expect(harness().host.getMethod?.()).toBe('orbis');
    systemSupported.value = false;
    expect(harness().host.getMethod?.()).toBe('orbis');
  });

  it('honours a saved preference', () => {
    expect(harness({ source: 'orbis' }).host.getMethod?.()).toBe('orbis');
    expect(harness({ source: 'system' }).host.getMethod?.()).toBe('system');
  });

  it('falls back to Orbis for a saved system preference on a device without Web Speech', () => {
    // Otherwise the picker reports a method that isn't in its own `methods` list, and disagrees with
    // TtsController.resolveSource(), which does guard this — so the UI would claim System while the
    // engine actually speaks with Piper.
    systemSupported.value = false;
    expect(harness({ source: 'system' }).host.getMethod?.()).toBe('orbis');
  });
});

describe('liveVoicePicker — getVoice', () => {
  it('returns the system voice URI when system is active', () => {
    expect(harness({ source: 'system', systemVoiceURI: 'Tom' }).host.getVoice()).toBe('Tom');
  });

  it('returns empty when system is active with no voice chosen', () => {
    expect(harness({ source: 'system' }).host.getVoice()).toBe('');
  });

  it('returns the catalog default when no Orbis voice is chosen', () => {
    systemSupported.value = false;
    expect(harness().host.getVoice()).toBe(DEFAULT_ORBIS_VOICE_ID);
  });

  it('returns a bare id for speaker 0', () => {
    const h = harness({ source: 'orbis', orbisVoiceId: 'en_US-amy-medium', orbisSid: 0 });
    expect(h.host.getVoice()).toBe('en_US-amy-medium');
  });

  it('appends #N for a multi-speaker selection', () => {
    const h = harness({ source: 'orbis', orbisVoiceId: 'en_US-libritts_r-medium', orbisSid: 11 });
    expect(h.host.getVoice()).toBe('en_US-libritts_r-medium#11');
  });
});

describe('liveVoicePicker — setVoice', () => {
  it('saves a system voice URI when system is active', () => {
    const h = harness({ source: 'system' });
    h.host.setVoice('Ava (Premium)');
    expect(h.patches).toEqual([{ source: 'system', systemVoiceURI: 'Ava (Premium)' }]);
  });

  it('splits id#N into voice + speaker', () => {
    const h = harness({ source: 'orbis' });
    h.host.setVoice('en_US-libritts_r-medium#42');
    expect(h.patches).toEqual([{ source: 'orbis', orbisVoiceId: 'en_US-libritts_r-medium', orbisSid: 42 }]);
  });

  it('treats a bare id as speaker 0', () => {
    const h = harness({ source: 'orbis' });
    h.host.setVoice('en_US-amy-medium');
    expect(h.patches).toEqual([{ source: 'orbis', orbisVoiceId: 'en_US-amy-medium', orbisSid: 0 }]);
  });

  it('remembers the speaker per model, so switching models and back restores it', () => {
    const h = harness({ source: 'orbis' });
    h.host.setVoice('en_US-libritts_r-medium#42');
    h.host.setVoice('en_US-amy-medium');
    expect(h.host.rememberedSpeaker?.('en_US-libritts_r-medium')).toBe(42);
    expect(h.host.rememberedSpeaker?.('en_US-amy-medium')).toBe(0);
  });
});

describe('liveVoicePicker — setMethod', () => {
  it('switching to system keeps an already-chosen voice', () => {
    const h = harness({ source: 'orbis', systemVoiceURI: 'Tom' });
    h.host.setMethod?.('system');
    expect(h.patches).toEqual([{ source: 'system', systemVoiceURI: 'Tom' }]);
  });

  it('switching to system picks the first available voice when none is chosen', () => {
    systemVoices.push({ voiceURI: 'Samantha', name: 'Samantha' });
    const h = harness({ source: 'orbis' });
    h.host.setMethod?.('system');
    expect(h.patches).toEqual([{ source: 'system', systemVoiceURI: 'Samantha' }]);
  });

  it('switching to system with no voices at all yields empty rather than undefined', () => {
    const h = harness({ source: 'orbis' });
    h.host.setMethod?.('system');
    expect(h.patches).toEqual([{ source: 'system', systemVoiceURI: '' }]);
  });

  it('switching to Orbis preserves the previously chosen model and speaker', () => {
    const h = harness({ source: 'system', orbisVoiceId: 'en_US-libritts_r-medium', orbisSid: 7 });
    h.host.setMethod?.('orbis');
    expect(h.patches).toEqual([{ source: 'orbis', orbisVoiceId: 'en_US-libritts_r-medium', orbisSid: 7 }]);
  });

  it('switching to Orbis with nothing chosen uses the catalog default', () => {
    const h = harness({ source: 'system' });
    h.host.setMethod?.('orbis');
    expect(h.patches).toEqual([{ source: 'orbis', orbisVoiceId: DEFAULT_ORBIS_VOICE_ID, orbisSid: 0 }]);
  });
});

describe('liveVoicePicker — rememberedSpeaker', () => {
  it('is 0 for a model never chosen', () => {
    expect(harness().host.rememberedSpeaker?.('en_US-amy-medium')).toBe(0);
  });

  it('is 0 for a non-numeric or negative stored value', () => {
    const h = harness();
    h.store['orbis-voice-sid-bad'] = 'nope';
    h.store['orbis-voice-sid-neg'] = '-3';
    expect(h.host.rememberedSpeaker?.('bad')).toBe(0);
    expect(h.host.rememberedSpeaker?.('neg')).toBe(0);
  });

  it('reads a stored speaker index, including 0', () => {
    const h = harness();
    h.store['orbis-voice-sid-en_US-libritts_r-medium'] = '11';
    h.store['orbis-voice-sid-zero'] = '0';
    expect(h.host.rememberedSpeaker?.('en_US-libritts_r-medium')).toBe(11);
    expect(h.host.rememberedSpeaker?.('zero')).toBe(0);
  });
});

describe('liveVoicePicker — pass-throughs', () => {
  it('forwards pauseAudio so a preview can duck book playback', () => {
    const h = harness();
    h.host.pauseAudio();
    expect(h.pauseAudio).toHaveBeenCalledOnce();
  });

  it('exposes a control label', () => {
    expect(harness().host.controlLabel).toBeTruthy();
  });
});

/**
 * Setup suggests the default Orbis voice with nothing stored. Downloading it there left nothing stored, so the
 * voice was on the device and shown as chosen while no choice existed — and look-up's Speak, reading the preference,
 * fell back to a system voice. Downloading the voice on screen now stores it.
 */
describe('liveVoicePicker — a downloaded voice is the chosen voice', () => {
  it('stores the default voice downloaded with nothing chosen', () => {
    const h = harness();
    h.host.voiceDownloaded?.(h.host.getVoice());
    expect(h.patches).toEqual([{ source: 'orbis', orbisVoiceId: DEFAULT_ORBIS_VOICE_ID, orbisSid: 0 }]);
    expect(h.pref()?.orbisVoiceId).toBe(DEFAULT_ORBIS_VOICE_ID);
  });

  it("stores a multi-speaker voice's speaker with it", () => {
    const h = harness();
    h.host.voiceDownloaded?.('en_US-libritts_r-medium#7');
    expect(h.patches).toEqual([{ source: 'orbis', orbisVoiceId: 'en_US-libritts_r-medium', orbisSid: 7 }]);
  });

  // Storing it again would only run setPref's side effects (freeing the warm worker) as the sample starts.
  it('leaves a stored Orbis choice alone', () => {
    const h = harness({ source: 'orbis', orbisVoiceId: 'en_GB-alba-medium', orbisSid: 0 });
    h.host.voiceDownloaded?.(h.host.getVoice());
    expect(h.patches).toEqual([]);
  });
});
