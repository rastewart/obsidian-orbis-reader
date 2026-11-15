// The operating system's media controls — media keys, Bluetooth buttons, the Now Playing card — for listening.
//
// Its own file because none of it is about reading: the controller decides what is playing and where, and this
// says so to the OS and hands the OS's buttons back. Split out of `TtsController.ts`.

import { Platform } from 'obsidian';

/** What the OS buttons do, and what they need to know to do it — the listening controller, seen from here. */
export interface MediaSessionTransport {
  isPlaying(): boolean;
  togglePlayPause(): void;
  skipTrack(direction: 1 | -1): void;
  skipSeconds(seconds: number): void;
  skipBackSeconds(): number;
  skipForwardSeconds(): number;
  /** The current track's length in seconds — what an OS scrubber's position is a fraction of. 0 when unknown. */
  trackDurationSec(): number;
  /** Seek to a fraction (0..1) of the current track. */
  seekToTrackFraction(fraction: number): void;
}

/** What the Now Playing card shows. */
export interface NowPlaying {
  title: string;
  artist: string;
  /** The track's name. */
  album: string;
  artworkUrl: string | null;
}

const ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'] as const;

export class MediaSessionBridge {
  /** Whether the action handlers are installed (see `install`). */
  private installed = false;
  /** The keepalive element the OS attaches its controls to — see `silentWavUri`. */
  private keepAliveEl: HTMLAudioElement | null = null;

  constructor(private readonly transport: MediaSessionTransport) {}

  /** The OS Media Session, or null when we deliberately don't use it. Disabled on iOS/iPadOS:
   *  its WKWebView suspends our audio (Web Audio + speechSynthesis) the moment the screen locks, so
   *  the lock-screen card can't actually play in the background — and pressing its play button
   *  races the read-loop through the book at "warp speed" (the suspended engine reports every clip
   *  as finishing instantly). Better to show no controls there than a runaway one. */
  private session(): MediaSession | null {
    if (Platform.isIosApp) return null;
    return navigator.mediaSession ?? null;
  }

  /** Wire the OS transport buttons to the player. Idempotent; undone by `clear`. The keepalive element goes in
   *  `container`. */
  install(container: HTMLElement): void {
    const ms = this.session();
    if (!ms || this.installed) return;
    this.installed = true;
    // The keepalive media element — a real, in-DOM, playing <audio> the OS can attach controls to
    // (renders nothing; no `controls` attribute). Playback is mirrored in `setPlaying`.
    if (!this.keepAliveEl) {
      const el = container.createEl('audio');
      el.loop = true;
      el.src = silentWavUri();
      this.keepAliveEl = el;
    }
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler): void => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action unsupported on this platform */
      }
    };
    const tr = this.transport;
    set('play', () => {
      if (!tr.isPlaying()) tr.togglePlayPause();
    });
    set('pause', () => {
      if (tr.isPlaying()) tr.togglePlayPause();
    });
    set('previoustrack', () => tr.skipTrack(-1));
    set('nexttrack', () => tr.skipTrack(1));
    set('seekbackward', () => tr.skipSeconds(-tr.skipBackSeconds()));
    set('seekforward', () => tr.skipSeconds(tr.skipForwardSeconds()));
    set('seekto', (details) => {
      const dur = tr.trackDurationSec();
      if (details.seekTime != null && dur > 0) tr.seekToTrackFraction(details.seekTime / dur);
    });
  }

  /** The Now Playing card's text and picture. */
  setNowPlaying(now: NowPlaying): void {
    const ms = this.session();
    if (!ms || typeof MediaMetadata === 'undefined') return;
    ms.metadata = new MediaMetadata({
      title: now.title,
      artist: now.artist,
      album: now.album,
      artwork: now.artworkUrl ? [{ src: now.artworkUrl }] : [],
    });
  }

  setPlaybackState(state: 'playing' | 'paused' | 'none'): void {
    const ms = this.session();
    if (!ms) return;
    ms.playbackState = state;
    // Mirror to the keepalive element so the OS keeps the media session alive while playing and
    // reflects pause. The first play() rides the user's play-button gesture (autoplay-allowed).
    const el = this.keepAliveEl;
    if (el) {
      if (state === 'playing') void el.play().catch(() => {});
      else el.pause();
    }
  }

  /** The OS scrubber: how long the track is and how far into it, in seconds. A duration of 0 clears it. */
  setPosition(durationSec: number, positionSec: number, rate: number): void {
    const ms = this.session();
    if (!ms || typeof ms.setPositionState !== 'function') return;
    try {
      if (durationSec <= 0) {
        ms.setPositionState();
        return;
      }
      ms.setPositionState({ duration: durationSec, position: Math.min(positionSec, durationSec), playbackRate: rate });
    } catch {
      /* invalid state (e.g. position>duration mid-update) — skip this tick */
    }
  }

  /** Take everything back: the card, the scrubber, the handlers and the keepalive element. */
  clear(): void {
    const ms = this.session();
    if (!ms) return;
    ms.playbackState = 'none';
    ms.metadata = null;
    if (typeof ms.setPositionState === 'function') {
      try {
        ms.setPositionState();
      } catch {
        /* no-op */
      }
    }
    for (const a of ACTIONS) {
      try {
        ms.setActionHandler(a, null);
      } catch {
        /* no-op */
      }
    }
    this.installed = false;
    if (this.keepAliveEl) {
      this.keepAliveEl.pause();
      this.keepAliveEl.remove();
      this.keepAliveEl = null;
    }
  }
}

// A near-silent looping WAV for the Media Session keepalive element. A pure Web Audio graph
// surfaces no OS media controls (and, on mobile, none at all); giving the OS a real, playing
// <audio> element to attach to is what makes the Now Playing card / lock-screen controls appear.
// The real narration stays on the AudioContext untouched — this element carries no audible
// content (a ~-84 dBFS 100 Hz tone, seamless-looping, non-zero so silence-detection doesn't
// drop it). Built once, lazily.
let SILENT_WAV_URI: string | null = null;
function silentWavUri(): string {
  if (SILENT_WAV_URI) return SILENT_WAV_URI;
  const sampleRate = 8000;
  const n = sampleRate; // 1 second; 100 Hz tiles evenly (80 samples/period) for a seamless loop
  const amp = 2; // out of 32767 — inaudible, but not digital silence
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits/sample
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 100 * i) / sampleRate) * amp), true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  SILENT_WAV_URI = `data:audio/wav;base64,${btoa(binary)}`;
  return SILENT_WAV_URI;
}
