/**
 * Gap inserted after each spoken unit, randomly jittered around a base so it isn't metronomic —
 * real inter-sentence pauses vary, and a fixed value reads as robotic. Shared by the on-device
 * (Piper) and system (Web Speech) engines so both cadence the same way.
 *
 * Base is tunable via localStorage `orbis-piper-pause-ms` (default 275); actual = base ±
 * PAUSE_JITTER, i.e. 225–325 ms by default.
 *
 * `kind` makes the pause structure-aware: a beat longer at a paragraph break, a clear rest at a
 * chapter (section) end. The extra is added on top of the jittered base so the natural variation
 * is preserved. The controller passes the kind based on each unit's position in the document.
 */
import { readDeviceValue } from '../../device-store';

const PAUSE_JITTER = 50;
const PARAGRAPH_EXTRA_MS = 300; // added at a paragraph boundary
const CHAPTER_EXTRA_MS = 900; // added at a chapter/section end (on top of the section's load delay)

export type PauseKind = 'sentence' | 'paragraph' | 'chapter';

export const DEFAULT_PAUSE_MS = 275;

/** The base pause before jitter — this device's `orbis-piper-pause-ms`, else `DEFAULT_PAUSE_MS`. */
export function pauseBaseMs(): number {
  try {
    const n = Number.parseInt(readDeviceValue('orbis-piper-pause-ms') ?? '', 10);
    if (Number.isFinite(n) && n >= 0) return n;
  } catch {
    /* default */
  }
  return DEFAULT_PAUSE_MS;
}

export function interClipPauseMs(kind: PauseKind = 'sentence'): number {
  return jitteredPauseMs(pauseBaseMs(), kind);
}

/**
 * One pause, jittered around `base`. Apart from `interClipPauseMs` because the Piper worker needs it too — it joins
 * a long chunk's sentences with the same pauses the engines put between clips (see `synth-pieces.ts`) — and a worker
 * cannot read the device's settings, so it is handed the base.
 */
export function jitteredPauseMs(base: number, kind: PauseKind = 'sentence'): number {
  const jittered = Math.max(0, base - PAUSE_JITTER + Math.floor(Math.random() * (2 * PAUSE_JITTER + 1)));
  const extra = kind === 'paragraph' ? PARAGRAPH_EXTRA_MS : kind === 'chapter' ? CHAPTER_EXTRA_MS : 0;
  return jittered + extra;
}

/**
 * Narration pace in words per minute, at rate 1.0.
 *
 * **One constant, because it was three.** `OrbisReaderView` had `NARRATION_WPM = 155` with a comment saying the
 * places that use it "have to agree"; `TtsController` had `BASE_WPM = 155` a file away, and the recording library
 * had the view's. They agreed by luck. Everything that turns a word count into a length reads this: the Record and
 * Edit-mix rows, the generation-speed estimate, the trigger that decides a chapter is too long for one track, and
 * the player's own remaining-time readouts (which scale it by the playback rate).
 *
 * A row saying 61 minutes beside a trigger reading 58 would split a chapter the list called whole.
 */
export const NARRATION_WPM = 155;
