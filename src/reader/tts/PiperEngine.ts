import { type DataAdapter, requestUrl } from 'obsidian';
import { verifyAsset } from './asset-integrity';
import { ClipCache } from './clip-cache';
import { interClipPauseMs, pauseBaseMs } from './pacing';
import type { TtsEngine } from './TtsEngine';

// The worker's bundled source, inlined at build time (esbuild.config.mjs) and run via a Blob
// URL — Obsidian plugins ship a single main.js with no side-car files.
declare const __PIPER_WORKER_SRC__: string;

/** Fatal, whole-session load failure (offline first run, missing asset) — must stop
 *  playback with a message, not silently skip a sentence. */
class PiperInitError extends Error {}

/**
 * On-device neural TTS via Piper (VITS + espeak-ng phonemizer), running fully in the WebView —
 * the only live engine that works on Android (which has no Web Speech).
 *
 * Synthesis (phonemize + ONNX inference — the heavy ~1–18s work) runs in a Web Worker
 * (piper-worker.ts) so it never blocks the main thread's UI or audio scheduling. This engine
 * (main thread) does the parts that need Obsidian's main-thread APIs — reading the model/wasm
 * bytes via requestUrl + the vault adapter, and Web Audio playback — and hands the bytes to
 * the worker; the worker needs zero network. See docs/design/text-to-speech.md (Piper on-device).
 *
 * Hard-won techniques (now applied inside the worker): the phonemizer gets its .wasm/.data as
 * in-memory bytes (Emscripten wasmBinary + getPreloadedPackage); the model is fetched in ranged
 * CHUNKS here (mobile requestUrl base64-inflates and OOMs the Android WebView on a whole-file
 * buffer); 256-symbol voices only; `prime()` synthesizes ahead so gaps hide behind playback.
 */

const HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
const ONNX = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';
const PHON = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
// The active voice is chosen in Settings → Listening and passed into the engine (constructor
// below); this is only the ultimate fallback if none was supplied. MUST be a MEDIUM / 256-symbol
// model — the 130-symbol high/low tiers crash ORT on rarer phonemes (idx out of bounds), and
// high-tier inference takes 6-18s/sentence on Android (freezes the UI, drains the prefetch
// buffer). Medium tier is ~0.7-2s/sentence, which the prefetch hides. See voice-catalog.ts.
const DEFAULT_VOICE = 'en/en_US/amy/medium/en_US-amy-medium.onnx';

/** Base filename of a voice path — the on-disk cache key, e.g. 'en_US-amy-medium.onnx'. */
function voiceFileName(voice: string): string {
  return voice.slice(voice.lastIndexOf('/') + 1);
}

const CHUNK = 4 * 1024 * 1024;

// How many decoded clips to keep (current + lookahead + already-played, LRU). Bigger =
// more skip targets replay without re-synthesis, at the cost of memory (a paragraph-mode
// clip can be several MB); this window keeps a few behind and a few ahead of the cursor.
const CACHE_MAX = 8;
// How many pinned (pre-cached adjacent-chapter start) clips to keep. Bounded by evicting the
// oldest pin, so arriving at a chapter never unpins its own just-arrived start clips.
const PIN_MAX = 8;
// Inter-clip pause lives in ./pacing (shared with Web Speech). Synthesized clips concatenate
// with zero silence and sound rushed without it; the jitter keeps the gaps from being metronomic.

// The ORT-web 1.18 wasm the worker loads — SIMD, single-threaded (matches numThreads=1, no
// WebGPU). Fetched here and handed to the worker (which can't reach the network).
const ORT_WASM = 'ort-wasm-simd.wasm';

interface SynthResult {
  pcm: Float32Array;
  sampleRate: number;
  phonemes: number;
  /** How many ORT runs the text took, and the phonemes in the largest — see `synth-pieces.ts`. */
  pieces: number;
  longest: number;
}

/** The synthesis worker, warmed once and reused for the whole session. `pending` correlates
 *  each synth request id with its awaiting promise. */
interface Warm {
  worker: Worker;
  pending: Map<number, { resolve: (r: SynthResult) => void; reject: (e: Error) => void }>;
}
// The warmed worker is for one voice at a time (`WARM_VOICE`); doSynth re-warms when the
// selected voice changes (a fresh engine with a different voice, after picking one in Settings).
let WARM: Promise<Warm> | null = null;
let WARM_VOICE: string | null = null;
let synthId = 0;

/** Rejection marker for a synth job cancelled by stop() — not a real error (see synth/speak). */
const STALE_SYNTH = new Error('stale-synth');

/** Drop the warmed worker so the next playback re-loads with a changed voice. */
export function resetPiperWarm(): void {
  WARM?.then(
    (w) => w.worker.terminate(),
    () => {}
  );
  WARM = null;
  WARM_VOICE = null;
}

const ab = async (url: string): Promise<ArrayBuffer> => (await requestUrl({ url })).arrayBuffer;

/**
 * Read `name` from the on-disk cache, else run `dl()` and cache the result. Lets the model
 * (and phonemizer assets) download once, then load from disk — instantly and offline — on
 * later sessions. Caching is best-effort: any adapter error falls back to a plain download.
 *
 * **The WASM assets are verified against a pinned digest, on both paths.** A cached file fails closed by being
 * treated as absent — it is deleted and re-downloaded, which is right for the ordinary cause (a truncated write)
 * and safe for the alarming one. A fresh download that fails throws instead: re-fetching from the same URL would
 * only produce the same bytes, and silently falling back to running them is the thing being prevented. Assets with
 * no pinned digest — voice models — are unaffected. See `asset-integrity.ts`.
 */
async function cachedBytes(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  name: string,
  dl: () => Promise<ArrayBuffer>
): Promise<ArrayBuffer> {
  if (!adapter || !dir) {
    const direct = await dl();
    if (!(await verifyAsset(name, direct))) throw new Error(`Integrity check failed for ${name}`);
    return direct;
  }
  const path = `${dir}/${name}`;
  try {
    if (await adapter.exists(path)) {
      const cached = await adapter.readBinary(path);
      if (await verifyAsset(name, cached)) return cached;
      // Corrupt or tampered: drop it and take the download path below.
      await adapter.remove(path).catch(() => undefined);
    }
  } catch {
    /* unreadable cache — re-download */
  }
  const buf = await dl();
  if (!(await verifyAsset(name, buf))) throw new Error(`Integrity check failed for ${name}`);
  try {
    if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    await adapter.writeBinary(path, buf);
  } catch {
    /* cache write is best-effort */
  }
  return buf;
}

/** Ranged/chunked download — keeps the mobile base64 peak to one chunk at a time. `onProgress`
 *  reports 0..1 as chunks land (for the Settings download UI). */
async function abChunked(url: string, onProgress?: (fraction: number) => void): Promise<ArrayBuffer> {
  let out: Uint8Array | null = null;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const res = await requestUrl({ url, headers: { Range: `bytes=${offset}-${offset + CHUNK - 1}` } });
    const chunk = new Uint8Array(res.arrayBuffer);
    if (!out) {
      const cr = res.headers['content-range'] ?? res.headers['Content-Range'];
      const m = cr ? /\/(\d+)/.exec(cr) : null;
      total = res.status === 200 || !m ? chunk.byteLength : Number.parseInt(m[1], 10);
      out = new Uint8Array(total);
    }
    if (chunk.byteLength === 0) break; // no progress — bail (fails the completeness check below)
    out.set(chunk, offset);
    offset += chunk.byteLength;
    if (Number.isFinite(total) && total > 0) onProgress?.(Math.min(offset / total, 1));
    if (res.status === 200) break; // Range ignored — the whole file came back in one response
    // NB: do NOT break on a short (< CHUNK) chunk. A CDN can return fewer bytes than requested
    // mid-file; breaking there would leave the model zero-padded (corrupt) and cache it. The
    // `offset < total` loop condition ends us on the genuine last chunk instead.
  }
  // Guard: a truncated model synthesizes as garbage, so never return/cache a short buffer.
  if (out && Number.isFinite(total) && offset < total) {
    throw new Error(`incomplete download (${offset}/${total} bytes): ${url}`);
  }
  return (out ?? new Uint8Array(0)).buffer as ArrayBuffer;
}

/** Messages the worker posts back to the main thread. */
type FromWorker =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | {
      type: 'synth-result';
      id: number;
      pcm: ArrayBuffer;
      sampleRate: number;
      phonemes: number;
      pieces: number;
      longest: number;
    }
  | { type: 'synth-error'; id: number; message: string };

interface WarmOpts {
  /** Reports the model download 0..1 (for the Settings preview/download UI). */
  onProgress?: (fraction: number) => void;
}

async function warmUp(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  voice: string,
  opts: WarmOpts = {}
): Promise<Warm> {
  const vName = voiceFileName(voice); // e.g. en_US-amy-medium.onnx
  try {
    // Read every asset here (needs requestUrl + adapter, main-thread only); the worker gets bytes.
    const phonWasm = await cachedBytes(adapter, dir, 'piper_phonemize.wasm', () => ab(`${PHON}.wasm`));
    const phonData = await cachedBytes(adapter, dir, 'piper_phonemize.data', () => ab(`${PHON}.data`));
    const cfgBuf = await cachedBytes(adapter, dir, `${vName}.json`, () => ab(`${HF}/${voice}.json`));
    const cfg: unknown = JSON.parse(new TextDecoder().decode(cfgBuf));
    const model = await cachedBytes(adapter, dir, vName, () => abChunked(`${HF}/${voice}`, opts.onProgress));
    const ortWasm = await cachedBytes(adapter, dir, ORT_WASM, () => ab(`${ONNX}${ORT_WASM}`));

    const worker = new Worker(URL.createObjectURL(new Blob([__PIPER_WORKER_SRC__], { type: 'text/javascript' })));
    const pending: Warm['pending'] = new Map();
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type !== 'synth-result' && m.type !== 'synth-error') return;
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.type === 'synth-result')
        p.resolve({
          pcm: new Float32Array(m.pcm),
          sampleRate: m.sampleRate,
          phonemes: m.phonemes,
          pieces: m.pieces,
          longest: m.longest,
        });
      else p.reject(new Error(m.message));
    };

    await new Promise<void>((resolve, reject) => {
      const onInit = (e: MessageEvent<FromWorker>) => {
        if (e.data.type === 'ready') {
          worker.removeEventListener('message', onInit);
          resolve();
        } else if (e.data.type === 'init-error') {
          worker.removeEventListener('message', onInit);
          reject(new Error(e.data.message));
        }
      };
      worker.addEventListener('message', onInit);
      // Transfer the big buffers so they aren't copied into the worker.
      worker.postMessage({ type: 'init', ortWasm: { [ORT_WASM]: ortWasm }, model, phonWasm, phonData, cfg }, [
        ortWasm,
        model,
        phonWasm,
        phonData,
      ]);
    });

    return { worker, pending };
  } catch (e) {
    throw new PiperInitError(String(e));
  }
}

// ── Voice management (Settings → Listening picker) ───────────────────────────

/** True if the voice's model is already cached on disk (so it's selectable without a download). */
export async function isOrbisVoiceDownloaded(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  voice: string
): Promise<boolean> {
  if (!adapter || !dir) return false;
  try {
    return await adapter.exists(`${dir}/${voiceFileName(voice)}`);
  } catch {
    return false;
  }
}

/** Number of speakers in a downloaded multi-speaker model (from its cached config's
 *  `num_speakers`); 1 if not downloaded or unreadable. */
export async function orbisVoiceSpeakerCount(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  voice: string
): Promise<number> {
  if (!adapter || !dir) return 1;
  try {
    const path = `${dir}/${voiceFileName(voice)}.json`;
    if (!(await adapter.exists(path))) return 1;
    const cfg = JSON.parse(new TextDecoder().decode(await adapter.readBinary(path))) as {
      num_speakers?: number;
    };
    return typeof cfg.num_speakers === 'number' && cfg.num_speakers > 0 ? cfg.num_speakers : 1;
  } catch {
    return 1;
  }
}

/** Download a voice's model + config to the on-disk cache. Idempotent — skips files already
 *  cached; `onProgress` reports the (large) model download 0..1. */
export async function downloadOrbisVoice(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  voice: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const vName = voiceFileName(voice);
  await cachedBytes(adapter, dir, `${vName}.json`, () => ab(`${HF}/${voice}.json`));
  await cachedBytes(adapter, dir, vName, () => abChunked(`${HF}/${voice}`, onProgress));
}

/** Delete a downloaded voice's cached files to reclaim disk. */
export async function deleteOrbisVoice(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  voice: string
): Promise<void> {
  if (!adapter || !dir) return;
  const vName = voiceFileName(voice);
  for (const name of [vName, `${vName}.json`]) {
    const path = `${dir}/${name}`;
    try {
      if (await adapter.exists(path)) await adapter.remove(path);
    } catch {
      /* best-effort */
    }
  }
}

/** Handle to a running preview — call `stop()` to end playback and free the throwaway worker. */
export interface PreviewHandle {
  stop: () => void;
}

export interface VoiceProbe {
  text: string;
  phonemes: number;
  samples: number;
}

/**
 * Synthesize each `text` with `voice` on a throwaway worker and return its phoneme + sample
 * counts — no playback. Used by the voice-vetting command to score duration stability
 * (samples-per-phoneme) without disturbing the active engine.
 */
export async function probeOrbisVoice(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  voice: string,
  texts: string[],
  rate: number
): Promise<VoiceProbe[]> {
  const warm = await warmUp(adapter, dir, voice);
  const out: VoiceProbe[] = [];
  try {
    for (const text of texts) {
      const id = ++synthId;
      const r = await new Promise<SynthResult>((resolve, reject) => {
        warm.pending.set(id, { resolve, reject });
        warm.worker.postMessage({ type: 'synth', id, text, rate, sid: 0, pauseBaseMs: pauseBaseMs() });
      });
      out.push({ text, phonemes: r.phonemes, samples: r.pcm.length });
    }
  } finally {
    warm.worker.terminate();
  }
  return out;
}

/** A persistent Piper synth for recording generation: warms one worker for `voice` (downloading the
 *  model first if needed), synthesizes many sentences to raw PCM, then `dispose()` terminates it.
 *  Separate from the live playback engine's warmed worker, so recording a book never disturbs — or is
 *  disturbed by — playback. `rate` is baked in; recordings are normally generated at 1 (playback
 *  applies speed on top). */
export interface PiperGenerator {
  synth(text: string): Promise<{ pcm: Float32Array; sampleRate: number }>;
  dispose(): void;
}

export async function createPiperGenerator(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  voice: string,
  sid: number,
  rate: number,
  onProgress?: (fraction: number) => void
): Promise<PiperGenerator> {
  const warm = await warmUp(adapter, dir, voice, { onProgress });
  return {
    async synth(text: string): Promise<{ pcm: Float32Array; sampleRate: number }> {
      const id = ++synthId;
      const r = await new Promise<SynthResult>((resolve, reject) => {
        warm.pending.set(id, { resolve, reject });
        warm.worker.postMessage({ type: 'synth', id, text, rate, sid, pauseBaseMs: pauseBaseMs() });
      });
      return { pcm: r.pcm, sampleRate: r.sampleRate };
    },
    dispose(): void {
      warm.worker.terminate();
    },
  };
}

/**
 * Synthesize + play a short sample with `voice` on a THROWAWAY worker, so auditioning in
 * Settings never disturbs the active playback engine's warmed worker. Downloads the model first
 * if needed (onProgress reports that). Resolves once playback has started.
 */
export async function previewOrbisVoice(
  adapter: DataAdapter | undefined,
  dir: string | undefined,
  voice: string,
  sid: number,
  text: string,
  rate: number,
  onProgress?: (fraction: number) => void,
  onDone?: () => void
): Promise<PreviewHandle> {
  const warm = await warmUp(adapter, dir, voice, { onProgress });
  let result: SynthResult;
  try {
    const id = ++synthId;
    result = await new Promise<SynthResult>((resolve, reject) => {
      warm.pending.set(id, { resolve, reject });
      warm.worker.postMessage({ type: 'synth', id, text, rate, sid, pauseBaseMs: pauseBaseMs() });
    });
  } catch (e) {
    warm.worker.terminate();
    throw e;
  }
  const ctx = new AudioContext();
  const buf = ctx.createBuffer(1, result.pcm.length, result.sampleRate);
  buf.getChannelData(0).set(result.pcm);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    try {
      src.onended = null;
      src.stop();
    } catch {
      /* not started / already stopped */
    }
    src.disconnect();
    void ctx.close();
    warm.worker.terminate();
    onDone?.();
  };
  src.onended = cleanup;
  src.start();
  return { stop: cleanup };
}

export class PiperEngine implements TtsEngine {
  readonly id = 'piper' as const;
  readonly label = 'Piper (on-device)';

  private rate = 1;
  /** Web Audio playback — AudioBufferSourceNode.start() is instant, so there's no
   *  per-sentence media-element startup gap (the pause HTMLAudioElement caused). */
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private pauseTimer: number | null = null;
  private progressTimer: number | null = null;
  private lastEndAt = 0; // Date.now() when the previous clip's audio ended (for gap logging)
  onProgress?: (fraction: number) => void;
  private resolveCurrent: (() => void) | null = null;
  /** True while paused. */
  private paused = false;
  /** If a clip's synth finished while paused, its start is deferred here until resume(). */
  private pendingStart: (() => void) | null = null;
  /** Set when paused during the inter-clip gap: completes the finished clip on resume so playback
   *  advances to the next sentence rather than re-speaking the one that just ended. */
  private pendingGapResolve: (() => void) | null = null;
  /** Serializes ORT runs (one session, one run at a time). */
  private synthChain: Promise<unknown> = Promise.resolve();
  /** Prefetch buffer of decoded audio, keyed by sentence text (current + lookahead), with the pinned chapter starts. */
  private cache = new ClipCache<Promise<AudioBuffer>>(CACHE_MAX, PIN_MAX);
  /** Count of synth jobs queued or in flight — 0 means the worker is idle. */
  private pending = 0;
  /** Bumped by stop(): queued synth jobs from before the stop are now irrelevant (a skip moved
   *  the position), so they skip their ORT run instead of making the post-skip sentence wait
   *  behind the old prefetch backlog. */
  private synthGen = 0;
  /** Texts whose synth is queued/running (not yet settled) — dropped from the cache on stop() so
   *  post-skip playback re-synthesizes rather than reusing a stale, still-queued promise. */
  private inflight = new Set<string>();
  private log: (msg: string) => void = () => {};

  /**
   * @param adapter/cacheDir — where to persist downloaded models (offline reuse).
   * @param voice — HF path of the selected voice model (from Settings → Listening).
   * @param sid — speaker id for multi-speaker models (0 for the single-speaker catalog voices).
   */
  constructor(
    private readonly adapter?: DataAdapter,
    private readonly cacheDir?: string,
    private readonly voice: string = DEFAULT_VOICE,
    private readonly sid = 0
  ) {}

  setLogger(fn: (msg: string) => void): void {
    this.log = fn;
  }

  isAvailable(): boolean {
    return true; // works everywhere once the model is downloaded
  }

  setRate(rate: number): void {
    if (rate === this.rate) return;
    this.rate = rate;
    this.cache.clear('rate'); // length-scale is baked into synth
  }

  isSynthIdle(): boolean {
    return this.pending === 0;
  }

  private audioCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private synth(text: string): Promise<AudioBuffer> {
    // Chain so only one ORT run happens at a time even when prime() overlaps speak().
    this.pending++;
    this.inflight.add(text);
    const gen = this.synthGen;
    const next = this.synthChain.then(() => {
      // A stop()/skip since this job was queued makes it irrelevant. Skip the (expensive) ORT run
      // so the chain drains instantly and the post-skip sentence synthesizes right away instead of
      // waiting behind the old prefetch backlog. Drop any cache entry so it re-synthesizes if
      // played later.
      if (this.synthGen !== gen) {
        this.cache.delete(text, 'stale');
        return Promise.reject(STALE_SYNTH);
      }
      return this.doSynth(text);
    });
    this.synthChain = next.catch((e) => {
      if (e !== STALE_SYNTH) this.log(`synth FAILED "${text.slice(0, 32)}…": ${String(e)}`);
    });
    next.then(
      () => {
        this.pending--;
        this.inflight.delete(text);
      },
      () => {
        this.pending--;
        this.inflight.delete(text);
      }
    );
    return next;
  }

  private async doSynth(text: string): Promise<AudioBuffer> {
    let w: Warm;
    try {
      if (!WARM || WARM_VOICE !== this.voice) {
        resetPiperWarm(); // tear down the previous voice's worker before switching
        WARM = warmUp(this.adapter, this.cacheDir, this.voice);
        WARM_VOICE = this.voice;
      }
      w = await WARM;
    } catch (e) {
      WARM = null; // allow a retry (e.g. after reconnecting) on the next play
      WARM_VOICE = null;
      throw e;
    }
    const t0 = Date.now();
    const id = ++synthId;
    const result = await new Promise<SynthResult>((resolve, reject) => {
      w.pending.set(id, { resolve, reject });
      w.worker.postMessage({ type: 'synth', id, text, rate: this.rate, sid: this.sid, pauseBaseMs: pauseBaseMs() });
    });
    this.log(
      `synth "${text.slice(0, 32)}…" ${Date.now() - t0}ms · ${result.phonemes}ph · ${result.pcm.length} samples` +
        ` · pieces ${result.pieces}, longest ${result.longest}ph`
    );
    const buf = this.audioCtx().createBuffer(1, result.pcm.length, result.sampleRate);
    buf.getChannelData(0).set(result.pcm);
    return buf;
  }

  /** Prepare a clip ahead of its turn — or, when it is already prepared, mark it used, so asking for the clips around
   *  the cursor keeps them from being the ones evicted (see `ClipCache`). */
  prime(text: string): void {
    if (!text || this.cache.touch(text)) return;
    this.cache.set(text, this.synth(text));
  }

  /** Like prime(), but pin the clip so it survives LRU eviction — for opportunistic
   *  pre-caching of adjacent chapters' first paragraphs (see TtsController). Bounded by
   *  evicting the oldest pin (which is the farthest-away chapter, never the current one). */
  primePinned(text: string): void {
    if (!text) return;
    this.cache.pin(text);
    if (!this.cache.has(text)) this.cache.set(text, this.synth(text));
  }

  speak(text: string, startFraction = 0, pauseAfterMs?: number): Promise<void> {
    const cached = this.cache.get(text);
    // A clip missing at its turn means a wait as long as its synthesis — the sign of the eviction `ClipCache` prevents.
    if (!cached) this.log(`cache miss at play "${text.slice(0, 32)}…"`);
    const bufP = cached ?? this.synth(text);
    // Kept (LRU) once played, so skipping back replays it rather than preparing it again.
    this.cache.set(text, bufP);
    return new Promise<void>((resolve, reject) => {
      this.resolveCurrent = resolve;
      bufP
        .then((buf) => {
          if (this.resolveCurrent !== resolve) return; // stopped/skipped while synthesizing
          const ctx = this.audioCtx();
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          const dur = buf.duration;
          // Seek: begin the clip at startFraction of its duration (≈15s mid-clip landing).
          const offset = startFraction > 0 ? Math.min(startFraction * dur, Math.max(0, dur - 0.05)) : 0;
          const clipPauseMs = pauseAfterMs ?? interClipPauseMs(); // structural pause or jittered base
          src.onended = () => {
            if (this.source === src) this.source = null;
            this.clearProgress();
            this.lastEndAt = Date.now();
            if (this.resolveCurrent !== resolve) return;
            // Hold briefly before resolving so the next sentence doesn't start instantly.
            this.pauseTimer = window.setTimeout(() => {
              this.pauseTimer = null;
              if (this.resolveCurrent !== resolve) return;
              const finish = () => {
                if (this.resolveCurrent === resolve) {
                  this.resolveCurrent = null;
                  resolve();
                }
              };
              // If paused during the inter-clip gap (paused right at a sentence end), defer
              // completing the clip until resume — so playback advances to the NEXT sentence
              // instead of re-speaking this finished one.
              if (this.paused) this.pendingGapResolve = finish;
              else finish();
            }, clipPauseMs);
          };
          // Start playback now — unless paused (synth finished while paused): defer the actual
          // start until resume(), so a pending clip never overrides a pause.
          const begin = () => {
            this.pendingStart = null;
            this.source = src;
            void ctx.resume(); // in case the WebView suspended it (autoplay / our pause)
            src.start(0, offset);
            const gap = this.lastEndAt ? Date.now() - this.lastEndAt : 0;
            this.log(
              `play "${text.slice(0, 32)}…" clip=${dur.toFixed(2)}s${offset ? ` @${offset.toFixed(1)}s` : ''} gap=${gap}ms pause=${clipPauseMs}ms`
            );
            const startAt = ctx.currentTime;
            this.progressTimer = window.setInterval(() => {
              if (this.source !== src || dur <= 0) return;
              this.onProgress?.(Math.min((offset + ctx.currentTime - startAt) / dur, 1));
            }, 120);
          };
          if (this.paused) this.pendingStart = begin;
          else begin();
        })
        .catch((err: unknown) => {
          if (this.resolveCurrent !== resolve) return;
          this.resolveCurrent = null;
          // Fatal load failure → reject so the controller stops with a message. A single bad
          // sentence (rare synth error) → resolve, skipping just that sentence.
          if (err instanceof PiperInitError) reject(err);
          else resolve();
        });
    });
  }

  pause(): void {
    this.paused = true;
    void this.ctx?.suspend();
  }

  resume(): void {
    this.paused = false;
    void this.ctx?.resume();
    // If a clip finished synthesizing while paused, start it now.
    const start = this.pendingStart;
    this.pendingStart = null;
    start?.();
    // If we paused during the inter-clip gap, complete it now so the loop advances to the next
    // sentence instead of re-speaking the finished one.
    const gap = this.pendingGapResolve;
    this.pendingGapResolve = null;
    gap?.();
  }

  stop(): void {
    // Invalidate queued prefetch synths (a skip moved the position); they'll skip their ORT run.
    // Drop their not-yet-finished cache entries so post-skip playback re-synthesizes fresh rather
    // than awaiting a stale, backlogged promise. Finished (pinned or fully synthesized) clips stay
    // cached so skipping back still replays instantly.
    this.synthGen++;
    for (const text of this.inflight) this.cache.delete(text, 'stale');
    const resolve = this.resolveCurrent;
    this.resolveCurrent = null;
    this.paused = false;
    this.pendingStart = null;
    this.pendingGapResolve = null;
    this.stopSource();
    resolve?.();
  }

  canPauseMidUtterance(): boolean {
    return true;
  }

  private clearProgress(): void {
    if (this.progressTimer !== null) {
      window.clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private stopSource(): void {
    this.lastEndAt = 0;
    this.clearProgress();
    if (this.pauseTimer !== null) {
      window.clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* not started / already stopped */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    // Keep WARM alive at module scope so reopening the bar is instant this session.
  }
}
