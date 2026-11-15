// Piper synthesis worker: runs phonemization (espeak-ng) + ONNX inference OFF the main
// thread, so the ~1–18s synthesis never blocks the UI or audio scheduling. The main thread
// (PiperEngine) reads the model/wasm bytes from disk/network — which needs Obsidian's
// requestUrl + vault adapter, both main-thread only — and hands the bytes here; this worker
// needs zero network. Bundled to a self-contained IIFE and embedded in main.js (see
// esbuild.config.mjs), instantiated via a Blob URL.
//
// Two tricks mirror PiperEngine's main-thread approach:
//  - the phonemizer gets its .wasm/.data as in-memory bytes (Emscripten wasmBinary +
//    getPreloadedPackage), so it never touches fetch/fs; and
//  - ORT loads its wasm from a Blob URL built here from the injected bytes (ORT-web has no
//    byte-injection API, but a same-origin blob URL isn't CSP-blocked).
//
// Node must look absent or the bundled Emscripten/ORT code takes its Node branch (require
// 'fs') — Electron workers can expose `process`, so hide it before anything else runs.
try {
  (self as unknown as { process?: unknown }).process = undefined;
} catch {
  /* ignore */
}

// This file runs in a DedicatedWorkerGlobalScope, but the project's tsconfig uses the DOM lib
// (where `self` is a Window). Cast to the worker-scope shape we use to get the right
// postMessage/onmessage signatures without pulling in the conflicting webworker lib.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

import { createPiperPhonemize } from '../../vendor/piper-phonemize';
import { DEFAULT_PAUSE_MS, jitteredPauseMs } from './pacing';
import { splitForSynthesis } from './synth-pieces';

// Minimal hand-written types for the ORT-web surface we touch (its own types are messy and
// miss env.wasm.proxy/wasmPaths-as-object), so we cast the dynamic import to this once.
interface OrtTensor {
  readonly data: Float32Array;
}
type OrtTensorCtor = new (type: string, data: number[] | Float32Array, dims?: number[]) => OrtTensor;
interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
interface OrtModule {
  env: { wasm: { numThreads: number; proxy: boolean; wasmPaths: Record<string, string> } };
  Tensor: OrtTensorCtor;
  InferenceSession: { create(model: ArrayBuffer): Promise<OrtSession> };
}
interface VoiceCfg {
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  audio: { sample_rate: number };
  espeak: { voice: string };
  speaker_id_map?: Record<string, number>;
}
interface PhonemizeModule {
  callMain(args: string[]): void;
}

interface InitMsg {
  type: 'init';
  ortWasm: Record<string, ArrayBuffer>; // filename → bytes (whatever ORT fetched, cached)
  model: ArrayBuffer;
  phonWasm: ArrayBuffer;
  phonData: ArrayBuffer;
  cfg: VoiceCfg;
}
interface SynthMsg {
  type: 'synth';
  id: number;
  text: string;
  rate: number;
  sid: number;
  /** This device's pause base, which a worker cannot read itself — see `pauseBaseMs`. */
  pauseBaseMs?: number;
}

let ort: OrtModule;
let session: OrtSession;
let phonWasm: ArrayBuffer;
let phonData: ArrayBuffer;
let cfg: VoiceCfg;

// Below this phoneme-id count an input is treated as "short" (e.g. a chapter heading) and its
// duration noise is zeroed — see the `scales` note in synth(). The count includes the pad token
// interleaved between phonemes, so a heading like "Chapter 1" is ~27; prose sentences run into
// the hundreds. 48 clears typical headings/one-liners while leaving real prose untouched.
const SHORT_INPUT_PHONEMES = 48;

function phonemize(text: string): Promise<number[]> {
  const input = JSON.stringify([{ text }]);
  return new Promise<number[]>((resolve, reject) => {
    const ids: number[] = [];
    const warnings: string[] = [];
    createPiperPhonemize({
      wasmBinary: phonWasm,
      getPreloadedPackage: () => phonData,
      print: (line: string) => {
        try {
          const parsed = (JSON.parse(line) as { phoneme_ids?: number[] }).phoneme_ids;
          if (parsed?.length) ids.push(...parsed);
        } catch {
          /* non-JSON stdout — ignore */
        }
      },
      printErr: (line: string) => warnings.push(line),
      locateFile: (p: string) => p,
    })
      .then((mod: PhonemizeModule) => {
        try {
          mod.callMain(['-l', cfg.espeak.voice, '--input', input, '--espeak_data', '/espeak-ng-data']);
        } catch {
          /* Emscripten throws ExitStatus on normal exit — decide by ids below */
        }
        if (ids.length) resolve(ids);
        else reject(new Error(`no phonemes${warnings.length ? ` (${warnings.join('; ')})` : ''}`));
      })
      .catch(reject);
  });
}

async function init(msg: InitMsg): Promise<void> {
  phonWasm = msg.phonWasm;
  phonData = msg.phonData;
  cfg = msg.cfg;
  ort = (await import('onnxruntime-web')) as unknown as OrtModule;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const paths: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(msg.ortWasm)) {
    paths[name] = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
  }
  ort.env.wasm.wasmPaths = paths;
  session = await ort.InferenceSession.create(msg.model);
}

/**
 * The text's audio, synthesized a piece at a time and joined — see `synth-pieces.ts` for why no single ORT run gets a
 * whole paragraph. Pieces run one after another, so only one piece's working memory exists at a time.
 */
async function synth(msg: SynthMsg): Promise<void> {
  const pieces = splitForSynthesis(msg.text, cfg.espeak.voice);
  // A fresh draw at every join, as between clips — not one length repeated through the paragraph.
  const gap = (): Float32Array =>
    new Float32Array(Math.round((jitteredPauseMs(msg.pauseBaseMs ?? DEFAULT_PAUSE_MS) / 1000) * cfg.audio.sample_rate));
  const clips: Float32Array[] = [];
  let phonemes = 0;
  let longest = 0;
  for (const [i, piece] of pieces.entries()) {
    const { pcm, count } = await synthPiece(piece.text, msg);
    clips.push(pcm);
    phonemes += count;
    longest = Math.max(longest, count);
    if (piece.endsSentence && i < pieces.length - 1) clips.push(gap());
  }
  const joined = new Float32Array(clips.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of clips) {
    joined.set(c, at);
    at += c.length;
  }
  const buf = joined.buffer; // a fresh buffer, nothing else holds it → transferable
  ctx.postMessage(
    {
      type: 'synth-result',
      id: msg.id,
      pcm: buf,
      sampleRate: cfg.audio.sample_rate,
      phonemes,
      pieces: pieces.length,
      longest,
    },
    [buf]
  );
}

async function synthPiece(text: string, msg: SynthMsg): Promise<{ pcm: Float32Array; count: number }> {
  const phonemeIds = await phonemize(text);
  const feeds: Record<string, OrtTensor> = {
    input: new ort.Tensor('int64', phonemeIds, [1, phonemeIds.length]),
    input_lengths: new ort.Tensor('int64', [phonemeIds.length]),
    scales: new ort.Tensor('float32', [
      cfg.inference.noise_scale,
      cfg.inference.length_scale / msg.rate,
      // Duration-predictor noise. On short inputs (chapter headings, one-word lines) the
      // stochastic predictor occasionally picks a wildly-too-long duration and fills it with
      // garbled audio (e.g. 3.5s for "Chapter one"). Zero it for short inputs so their
      // durations are deterministic; keep the natural variation (0.8) for normal prose.
      phonemeIds.length < SHORT_INPUT_PHONEMES ? 0 : cfg.inference.noise_w,
    ]),
  };
  if (cfg.speaker_id_map && Object.keys(cfg.speaker_id_map).length) {
    feeds.sid = new ort.Tensor('int64', [msg.sid]);
  }
  const outMap = await session.run(feeds);
  return { pcm: outMap.output.data.slice(), count: phonemeIds.length }; // own copy — ORT may reuse its output
}

ctx.onmessage = (e: MessageEvent<InitMsg | SynthMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    init(msg).then(
      () => ctx.postMessage({ type: 'ready' }),
      (err: unknown) => ctx.postMessage({ type: 'init-error', message: String(err) })
    );
  } else if (msg.type === 'synth') {
    synth(msg).catch((err: unknown) => ctx.postMessage({ type: 'synth-error', id: msg.id, message: String(err) }));
  }
};
