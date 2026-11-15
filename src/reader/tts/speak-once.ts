// One-shot speech for an arbitrary string in the device's live voice — the lookup popup's "Speak"
// button, and the pronunciation-respelling preview that builds on it.
//
// Deliberately built on the voice-*preview* functions rather than on TtsController's engine:
// previewOrbisVoice spins up a throwaway Piper worker, so speaking a selection never disturbs the
// reading engine's warmed worker, its in-memory synth cache, or the playback state machine (epochs,
// units, highlight). The cost is that a first Piper utterance pays model load/warm-up — callers
// should show a pending state, which is why `speakOnce` resolves only once audio is under way.
//
// Competing audio is the caller's problem to stop first (plugin.pauseListening() /
// TtsController.pauseIfPlaying()), matching the convention VoicePickerHost.pauseAudio() uses.

import type { DataAdapter } from 'obsidian';
import type { VoicePref } from '../../settings';
import { isOrbisVoiceDownloaded, type PreviewHandle, previewOrbisVoice } from './PiperEngine';
import type { Pronouncer } from './pronunciations';
import { previewServerVoice } from './server-voices';
import { normalizeForSpeech } from './tts-blocks';
import { ORBIS_VOICES, orbisVoiceOrDefault } from './voice-catalog';
import { previewSystemVoice } from './WebSpeechEngine';

/** The device's resolved live voice — the same resolution the reading engine performs, passed in
 *  rather than recomputed so the spoken selection always matches the narration voice. */
export type ResolvedLiveVoice =
  | { source: 'orbis'; path: string; sid: number }
  | { source: 'system'; uri: string | undefined };

/** Any voice a one-shot utterance can use. The server variant exists so a respelling can be
 *  auditioned against the *recording* voice (Kokoro et al.) without recording a chapter — Piper and
 *  Kokoro have different text frontends, so the same respelling can genuinely land differently. */
export type SpeakVoice = ResolvedLiveVoice | { source: 'server'; url: string; model: string; voice: string };

/** Resolve this device's live-voice preference. Mirrors TtsController.resolveSource()'s precedence
 *  (stored preference, else system when available) and is shared so the reader, the settings modal
 *  and the respelling editor all audition the same voice the book is read in. */
export function resolveDeviceLiveVoice(pref: VoicePref | undefined, systemSupported: boolean): ResolvedLiveVoice {
  /**
   * **No preference means an Orbis voice**, on every device, whether or not the OS has voices of its own.
   *
   * Defaulting to a system voice wherever Web Speech exists would quietly make the OS the product's default
   * narrator on desktop and iPad — and hide `FirstVoiceModal`, the prompt that offers the recommended voice the
   * first time anyone listens, because system would win without being chosen. The picker says the same thing with
   * its tab order: Orbis voices first, system voices second.
   *
   * A stored `system` preference still needs Web Speech to be honored; on a device without it that falls through
   * to Orbis, which is the guard this shares with `TtsController.resolveSource`.
   */
  const useSystem = pref?.source === 'system' && systemSupported;
  if (useSystem) return { source: 'system', uri: pref?.systemVoiceURI };
  const v = orbisVoiceOrDefault(pref?.orbisVoiceId);
  return { source: 'orbis', path: v.path, sid: v.multiSpeaker ? (pref?.orbisSid ?? 0) : 0 };
}

export interface SpeakOnceDeps {
  adapter: DataAdapter;
  /** Piper model cache dir (`<config>/plugins/orbis-reader/piper-cache`). */
  cacheDir: string;
  rate: () => number;
  voice: () => SpeakVoice;
  /** Compiled respellings, so a spoken selection matches how narration says it. Omit (or return
   *  null) to speak the text verbatim — which is what the respelling editor's own preview wants,
   *  since there the text *is* the replacement. */
  pronouncer?: () => Pronouncer | null;
  /**
   * Ask for an Orbis voice that is not on this device, resolving whether it arrived — `askForOrbisVoice`, or the
   * player's own question. Without one, speaking in a missing voice is refused (`VoiceNotHereError`): nothing here
   * downloads a voice that nobody asked for.
   */
  askForVoice?: (voice: { name: string; sizeMB: number; path: string }) => Promise<boolean>;
}

/** Speaking was refused because the voice is not on this device and was not fetched — not a failure to report. */
export class VoiceNotHereError extends Error {
  constructor() {
    super('voice not on this device');
    this.name = 'VoiceNotHereError';
  }
}

/** Longest text we'll speak in one go. A selection can be arbitrarily large (a whole chapter is a
 *  few keystrokes away), and Piper synthesizes the whole string before any audio plays — so an
 *  unbounded selection would look like a hang. Truncated at a word boundary. */
export const SPEAK_ONCE_MAX_CHARS = 1200;

/**
 * Trim `text` to at most `max` chars, breaking at the last word boundary rather than mid-word.
 *
 * Always prefers the word boundary when one exists, even if that discards a lot: a short but
 * correctly-pronounced fragment beats a mangled token, which espeak would read as gibberish. The
 * hard cut is reserved for a single unbroken token with no space to break at.
 */
export function clampSpeechText(text: string, max = SPEAK_ONCE_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Sentence-final punctuation, allowing a trailing quote/bracket after it ("…done." / "…done!”). */
const TERMINAL_PUNCT = /[.!?…][\p{Pf}\p{Pe}"'’”)\]]*$/u;

/**
 * Give the synthesizer a complete utterance by adding a full stop when the text has none.
 *
 * Piper/VITS clips very short inputs that aren't sentence-shaped: selecting a bare word like
 * "doctor" could come back as just its first phoneme, worst on multi-speaker models (LibriTTS).
 * The worker already zeroes duration-predictor noise below SHORT_INPUT_PHONEMES for this class of
 * problem, but that isn't enough for a one-word input — espeak also needs the sentence boundary to
 * phonemize it as a finished utterance rather than a fragment. Harmless for system voices.
 *
 * Any dangling non-terminal punctuation is dropped first, so a selection ending mid-clause doesn't
 * become ",." — which espeak reads as a pause rather than an end.
 */
export function asCompleteUtterance(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || TERMINAL_PUNCT.test(trimmed)) return trimmed;
  return `${trimmed.replace(/[,;:\-–—]+$/, '').trimEnd()}.`;
}

/** The exact string handed to an engine for a one-shot utterance: normalized the same way the
 *  narration path normalizes book text (so Speak sounds like the narration, and so the
 *  pronunciation dictionary will apply here too), clamped, then closed off as a full sentence. */
export function prepareSpeechText(text: string, pronouncer?: Pronouncer | null, max = SPEAK_ONCE_MAX_CHARS): string {
  return asCompleteUtterance(normalizeForSpeech(clampSpeechText(text, max), pronouncer));
}

/**
 * Speak `text` once in the device's live voice. Resolves with a handle whose `stop()` silences it;
 * `onDone` fires when the utterance finishes on its own (not when stopped).
 *
 * Rejects if no usable voice is configured (a speech server with no address or voice) — callers surface that rather
 * than failing silently. A system source with no voice chosen speaks in the system's default voice, as listening does
 * (`WebSpeechEngine` with no URI): "Use a system voice" in the first-listen prompt chooses the source, not a voice.
 */
export async function speakOnce(deps: SpeakOnceDeps, text: string, onDone?: () => void): Promise<PreviewHandle> {
  const spoken = prepareSpeechText(text, deps.pronouncer?.() ?? null);
  if (!spoken) throw new Error('nothing to speak');
  const rate = deps.rate() || 1;
  const voice = deps.voice();
  if (voice.source === 'system') {
    return previewSystemVoice(voice.uri ?? '', spoken, rate, onDone);
  }
  if (voice.source === 'server') {
    if (!voice.url || !voice.voice) throw new Error('no recording server voice configured');
    return previewServerVoice(voice.url, voice.model, voice.voice, spoken, rate, onDone);
  }
  // **Never a silent download.** Piper would fetch a missing model to have something to play; a Speak button is not
  // consent to 60 MB, so the reader is asked first — or, with nobody to ask, nothing is spoken.
  if (!(await isOrbisVoiceDownloaded(deps.adapter, deps.cacheDir, voice.path))) {
    const entry = ORBIS_VOICES.find((v) => v.path === voice.path);
    const asked = entry && deps.askForVoice ? await deps.askForVoice(entry) : false;
    if (!asked) throw new VoiceNotHereError();
    // The answer may have been another voice — Browse, or a system voice — so speak in whatever is chosen now, asking
    // no second time.
    const now = deps.voice();
    if (now.source !== 'orbis' || now.path !== voice.path)
      return speakOnce({ ...deps, askForVoice: undefined }, text, onDone);
  }
  return previewOrbisVoice(deps.adapter, deps.cacheDir, voice.path, voice.sid, spoken, rate, undefined, onDone);
}
