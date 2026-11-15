/**
 * A pluggable text-to-speech backend. The `TtsController` owns text extraction,
 * paragraph iteration and highlighting; an engine only has to speak a chunk of
 * text and report when it's done. This keeps a third engine (e.g. an HTTP
 * OpenAI-compatible server / Kokoro) addable later without touching the
 * controller — see docs/design/text-to-speech.md.
 */
export type TtsEngineId = 'web-speech' | 'piper';

export interface TtsEngine {
  readonly id: TtsEngineId;
  /** Human-readable label for the UI (already localized). */
  readonly label: string;
  /** Whether this engine can run in the current environment. */
  isAvailable(): boolean;
  /**
   * Speak `text`. Resolves when playback finishes naturally OR when stopped.
   * `startFraction` (0..1) begins playback partway through — for ≈15s seeking that
   * lands mid-clip: Piper offsets into the decoded buffer, Web Speech re-speaks from
   * the corresponding word. Progress is still reported as a fraction of the whole text.
   * `pauseAfterMs` overrides the gap held after this clip (the controller sets it for
   * structure-aware pauses — longer at paragraph/chapter breaks); defaults to the base
   * jittered inter-clip pause when omitted.
   */
  speak(text: string, startFraction?: number, pauseAfterMs?: number): Promise<void>;
  /**
   * Optional: hint that `text` is likely the next thing to be spoken, so a slow
   * engine can synthesize it in the background while the current utterance plays
   * (a 1-ahead pipeline that hides synthesis latency). No-op for instant engines.
   */
  prime?(text: string): void;
  /**
   * Optional: like prime(), but the clip is *pinned* — kept beyond the normal cache bound —
   * for opportunistic chapter-start pre-caching (pins are internally bounded oldest-first).
   * Slow engines only; instant ones omit it.
   */
  primePinned?(text: string): void;
  /** Optional: true when no synthesis is queued or in flight — safe to start low-priority
   *  background work (chapter-start pre-cache) without delaying playback. */
  isSynthIdle?(): boolean;
  /**
   * Optional: called by the engine while speaking with progress 0..1 through the current
   * utterance, so the controller can page-follow *within* a long sentence. The controller
   * assigns this before playback; engines that can report progress (Web Speech word
   * boundaries, Piper elapsed time) invoke it, others leave it unused.
   */
  onProgress?: (fraction: number) => void;
  /** Pause mid-utterance if supported; otherwise a no-op (see canPauseMidUtterance). */
  pause(): void;
  /** Resume after pause(), if supported. */
  resume(): void;
  /** Cancel current playback; the outstanding speak() promise resolves without error. */
  stop(): void;
  /** Playback rate multiplier (1 = normal). Applies from the next speak(). */
  setRate(rate: number): void;
  /**
   * True if pause()/resume() suspend the current utterance in place. When false,
   * the controller treats pause as "stop and re-speak the current sentence on resume".
   */
  canPauseMidUtterance(): boolean;
  /** Release any resources. */
  dispose(): void;
}
