import { getActiveLang, t } from '../../i18n';
import { interClipPauseMs } from './pacing';
import type { TtsEngine } from './TtsEngine';

// macOS exposes its low-quality "novelty" and legacy voices to Web Speech (the good Siri /
// Premium / Enhanced voices are NOT exposed) — hide them so the picker isn't a circus. Matched
// on the base name (before any "(English (US))"-style suffix), case-insensitive.
const HIDDEN_SYSTEM_VOICES = new Set([
  'albert',
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'good news',
  'jester',
  'organ',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox', // classic novelties
  'eddy',
  'flo',
  'grandma',
  'grandpa',
  'reed',
  'rocko',
  'sandy',
  'shelley', // newer novelties
  'fred',
  'ralph',
  'kathy',
  'junior',
  'princess',
  'agnes',
  'bruce',
  'vicki',
  'victoria', // legacy low-quality
]);

const baseVoiceName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, '')
    .trim();

/** System voices for the "System voices" picker, scoped to the active UI locale's language
 *  (English today; the localization plumbing lets future locales scope to their own voices) and
 *  with the junk novelty/legacy voices filtered out. May be empty until voices load (see
 *  onVoicesChanged) and is always empty on Android (no speechSynthesis). */
export function listSystemVoices(): SpeechSynthesisVoice[] {
  if (!WebSpeechEngine.isSupported()) return [];
  const lang = getActiveLang();
  return bestOfEachVoice(
    window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith(lang) && !HIDDEN_SYSTEM_VOICES.has(baseVoiceName(v.name)))
  ).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * How good an Apple voice is, from its identifier: `…super-compact…` < `…compact…` < `…enhanced…` < `…premium…`.
 * An identifier that names no tier (the Mac reports bare names) ranks with compact.
 */
function voiceTier(uri: string): number {
  if (uri.includes('super-compact')) return 0;
  if (uri.includes('premium')) return 3;
  if (uri.includes('enhanced')) return 2;
  return 1;
}

/**
 * One entry per voice: the best quality the device has of each name and language.
 *
 * **iOS reports a voice once per quality it has installed** — `com.apple.voice.super-compact.en-GB.Daniel` and
 * `com.apple.voice.compact.en-GB.Daniel` side by side, the same name and language — so the iPhone's list showed most
 * of its voices twice with nothing to tell the two apart. Measured with *Dump system voices (dev)*, which prints each
 * voice's identifier for exactly this.
 */
export function bestOfEachVoice<V extends Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'voiceURI'>>(
  voices: readonly V[]
): V[] {
  const best = new Map<string, V>();
  for (const v of voices) {
    const key = `${v.name}|${v.lang}`;
    const held = best.get(key);
    if (!held || voiceTier(v.voiceURI) > voiceTier(held.voiceURI)) best.set(key, v);
  }
  return [...best.values()];
}

/**
 * The system voice a saved identifier means: the one the list shows for it, else the device's voice of that exact
 * identifier (one outside the list's language), else nothing.
 *
 * **A choice saved before the list showed one copy of each voice can name a copy it now hides** — the iPad's chip read
 * `com.apple.voice.super-compact…` because every lookup searched the list for that identifier and found nothing. It
 * means the voice of the same name and language, so it resolves to the copy the list shows, and speaks as it too.
 */
export function findSystemVoice(uri: string | undefined): SpeechSynthesisVoice | undefined {
  if (!uri || !WebSpeechEngine.isSupported()) return undefined;
  const listed = listSystemVoices();
  const exact = listed.find((v) => v.voiceURI === uri);
  if (exact) return exact;
  const saved = window.speechSynthesis.getVoices().find((v) => v.voiceURI === uri);
  if (!saved) return undefined;
  return listed.find((v) => v.name === saved.name && v.lang === saved.lang) ?? saved;
}

/** Diagnostic: every system voice the OS exposes, with why it's shown or hidden — for the
 *  "Dump system voices" command, so a downloaded voice that's missing can be traced. */
export function systemVoiceReport(): string[] {
  if (!WebSpeechEngine.isSupported()) return ['no speechSynthesis on this device'];
  const lang = getActiveLang();
  const all = window.speechSynthesis.getVoices();
  if (!all.length) return ['no voices reported yet (still loading?)'];
  const listed = new Set(listSystemVoices());
  return all
    .slice()
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
    .map((v) => {
      const status = !v.lang.toLowerCase().startsWith(lang)
        ? `hidden (lang≠${lang})`
        : HIDDEN_SYSTEM_VOICES.has(baseVoiceName(v.name))
          ? 'hidden (suppressed as low-quality)'
          : listed.has(v)
            ? 'shown'
            : 'hidden (a better quality of it is listed)';
      // The URI and local/remote too: iOS reports some voices twice under one name, and these are what tell them apart.
      return `${v.name} [${v.lang}]${v.default ? ' *default' : ''}${v.localService ? '' : ' remote'} ${v.voiceURI} — ${status}`;
    });
}

/** Subscribe to the async voice list populating (Chrome/Electron load it lazily). Returns an
 *  unsubscribe fn. Fires once immediately if voices are already available. */
export function onVoicesChanged(cb: () => void): () => void {
  if (!WebSpeechEngine.isSupported()) return () => {};
  const synth = window.speechSynthesis;
  synth.addEventListener('voiceschanged', cb);
  if (synth.getVoices().length) cb();
  return () => synth.removeEventListener('voiceschanged', cb);
}

/** Speak a short sample with a specific system voice (for auditioning in Settings). `onDone`
 *  fires when it finishes or is cancelled. Returns a handle whose stop() cancels it. */
export function previewSystemVoice(
  voiceURI: string,
  text: string,
  rate: number,
  onDone?: () => void
): { stop: () => void } {
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;
  const voice = findSystemVoice(voiceURI);
  if (voice) utter.voice = voice;
  utter.onend = () => onDone?.();
  window.speechSynthesis.speak(utter);
  return {
    stop: () => {
      utter.onend = null;
      window.speechSynthesis.cancel();
      onDone?.();
    },
  };
}

/**
 * TTS via the Web Speech API (`speechSynthesis`) using the OS's system voices.
 * Available on desktop (Electron) and iOS/iPadOS WebViews; absent on Android's
 * WebView (see the feasibility spike results). Supports true mid-utterance
 * pause/resume.
 */
export class WebSpeechEngine implements TtsEngine {
  readonly id = 'web-speech' as const;
  readonly label = t('tts.engine_system_voice');

  onProgress?: (fraction: number) => void;

  private rate = 1;
  private current: SpeechSynthesisUtterance | null = null;
  private resolveCurrent: (() => void) | null = null;
  private pauseTimer: number | null = null;
  private paused = false;
  /** Set when paused during the inter-clip gap: completes the finished utterance on resume so
   *  playback advances to the next sentence instead of re-speaking the finished one. */
  private pendingGapResolve: (() => void) | null = null;

  /** @param voiceURI — chosen system voice (Settings → Listening); OS default if omitted. */
  constructor(private readonly voiceURI?: string) {}

  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  isAvailable(): boolean {
    return WebSpeechEngine.isSupported();
  }

  setRate(rate: number): void {
    this.rate = rate;
  }

  speak(text: string, startFraction = 0, pauseAfterMs?: number): Promise<void> {
    // Seeking: begin at the word nearest startFraction by speaking only the remainder.
    // Progress maps the sliced utterance's char index back onto the full text.
    const gapMs = pauseAfterMs ?? interClipPauseMs(); // structural pause or jittered base
    const fullLen = Math.max(text.length, 1);
    let startChar = startFraction > 0 ? Math.min(Math.round(startFraction * text.length), text.length) : 0;
    if (startChar > 0) {
      while (startChar < text.length && !/\s/.test(text[startChar - 1])) startChar++; // to a word boundary
    }
    const spoken = startChar > 0 ? text.slice(startChar) : text;
    return new Promise((resolve) => {
      this.resolveCurrent = resolve;
      const utter = new SpeechSynthesisUtterance(spoken);
      utter.rate = this.rate;
      if (this.voiceURI) {
        const v = findSystemVoice(this.voiceURI);
        if (v) utter.voice = v;
      }
      this.current = utter;
      const finish = () => {
        if (this.current === utter) {
          this.current = null;
          this.resolveCurrent = null;
        }
        resolve();
      };
      // A jittered gap after each utterance so sentences don't run together — same natural,
      // variable cadence Piper uses (the OS voice adds almost none on its own).
      utter.onend = () => {
        this.pauseTimer = window.setTimeout(() => {
          this.pauseTimer = null;
          // Paused right at the sentence end → defer completing until resume, so playback advances
          // to the next sentence rather than re-speaking this finished one.
          if (this.paused) this.pendingGapResolve = finish;
          else finish();
        }, gapMs);
      };
      utter.onerror = finish; // no added gap on error
      utter.onboundary = (e) => this.onProgress?.(Math.min((startChar + e.charIndex) / fullLen, 1));
      window.speechSynthesis.speak(utter);
    });
  }

  pause(): void {
    this.paused = true;
    window.speechSynthesis.pause();
  }

  resume(): void {
    this.paused = false;
    window.speechSynthesis.resume();
    const gap = this.pendingGapResolve;
    this.pendingGapResolve = null;
    gap?.();
  }

  stop(): void {
    this.paused = false;
    this.pendingGapResolve = null;
    if (this.pauseTimer !== null) {
      window.clearTimeout(this.pauseTimer); // cancel a pending inter-clip gap
      this.pauseTimer = null;
    }
    // Detach handlers so cancel() doesn't race a stale onend, then resolve the
    // outstanding promise ourselves.
    if (this.current) {
      this.current.onend = null;
      this.current.onerror = null;
      this.current = null;
    }
    window.speechSynthesis.cancel();
    const resolve = this.resolveCurrent;
    this.resolveCurrent = null;
    resolve?.();
  }

  canPauseMidUtterance(): boolean {
    return true;
  }

  dispose(): void {
    this.stop();
  }
}
