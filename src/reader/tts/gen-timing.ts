// Device-and-vault-local generation-speed samples so the Generate dialog can estimate how long a run will
// take. We store seconds-per-word (stable across chapter lengths), keyed by engine+model, keeping a
// rolling window of the most recent samples. Device-local (localStorage) because speed is a property
// of THIS device talking to its server — a CPU-only Kokoro box, a GPU server, and on-device Piper
// differ by ~10× — so a synced value would be wrong on other devices. A fresh device has no samples
// → no estimate until the first run self-calibrates it.

import { readDeviceValue, writeDeviceValue } from '../../device-store';

const KEY = 'orbis-tts-gen-timing';
const MAX_SAMPLES = 5;

type TimingStore = Record<string, number[]>; // "engine|model" → seconds-per-word samples (newest last)

function timingKey(engine: string, model: string): string {
  return `${engine}|${model}`;
}

function readStore(): TimingStore {
  try {
    const raw = readDeviceValue(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as TimingStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: TimingStore): void {
  try {
    writeDeviceValue(KEY, JSON.stringify(store));
  } catch {
    /* private mode / storage disabled — samples just won't persist */
  }
}

/** Record one chapter's generation speed (seconds per word). Ignores implausible samples so a
 *  zero-word section or a bogus 0 ms doesn't poison the average. */
export function recordGenSample(engine: string, model: string, words: number, elapsedMs: number): void {
  if (words <= 0 || elapsedMs <= 0) return;
  const secondsPerWord = elapsedMs / 1000 / words;
  const store = readStore();
  const key = timingKey(engine, model);
  store[key] = [...(store[key] ?? []), secondsPerWord].slice(-MAX_SAMPLES);
  writeStore(store);
}

/** Estimated seconds to generate `words` with this engine/model, or null when there's no sample data
 *  yet (so callers can show a generic "this can take a while" instead of a fabricated number). */
export function estimateGenSeconds(engine: string, model: string, words: number): number | null {
  const list = readStore()[timingKey(engine, model)];
  if (!list?.length || words <= 0) return null;
  const avg = list.reduce((a, b) => a + b, 0) / list.length;
  return words * avg;
}
