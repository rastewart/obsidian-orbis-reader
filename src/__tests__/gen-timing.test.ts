import { beforeEach, describe, expect, it } from 'vitest';
import { estimateGenSeconds, recordGenSample } from '../reader/tts/gen-timing';

// This Node/jsdom env ships without a working localStorage; give the module an in-memory one.
function installFakeLocalStorage(): void {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  Object.defineProperty(window, 'localStorage', { value: fake, configurable: true, writable: true });
}

describe('gen-timing', () => {
  beforeEach(() => installFakeLocalStorage());

  it('returns null with no samples', () => {
    expect(estimateGenSeconds('openai-compatible', 'kokoro', 100)).toBeNull();
  });

  it('estimates words × average seconds-per-word', () => {
    // 100 words in 50 s → 0.5 s/word. 200 words → ~100 s.
    recordGenSample('openai-compatible', 'kokoro', 100, 50_000);
    expect(estimateGenSeconds('openai-compatible', 'kokoro', 200)).toBeCloseTo(100, 5);
  });

  it('averages multiple samples', () => {
    recordGenSample('e', 'm', 100, 100_000); // 1.0 s/word
    recordGenSample('e', 'm', 100, 300_000); // 3.0 s/word
    expect(estimateGenSeconds('e', 'm', 10)).toBeCloseTo(20, 5); // avg 2.0 s/word × 10
  });

  it('keeps only the last 5 samples', () => {
    // Six samples; the first (slow) one should fall out of the window.
    recordGenSample('e', 'm', 1, 100_000); // 100 s/word — should be dropped
    for (let i = 0; i < 5; i++) recordGenSample('e', 'm', 1, 1_000); // 1 s/word ×5
    expect(estimateGenSeconds('e', 'm', 1)).toBeCloseTo(1, 5);
  });

  it('keys estimates by engine + model (no cross-contamination)', () => {
    recordGenSample('piper-ondevice', 'amy', 10, 100_000); // 10 s/word
    expect(estimateGenSeconds('openai-compatible', 'kokoro', 10)).toBeNull();
    expect(estimateGenSeconds('piper-ondevice', 'amy', 10)).toBeCloseTo(100, 5);
  });

  it('ignores implausible samples (0 words / 0 ms)', () => {
    recordGenSample('e', 'm', 0, 5_000);
    recordGenSample('e', 'm', 100, 0);
    expect(estimateGenSeconds('e', 'm', 100)).toBeNull();
  });
});
