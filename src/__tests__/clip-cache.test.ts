import { describe, expect, it } from 'vitest';
import { ClipCache, type DropReason } from '../reader/tts/clip-cache';

/**
 * The live engine's use of the cache, as `TtsController.primeAhead` drives it when each paragraph starts: the
 * current clip and three ahead, then two behind, then the current one played. `touches` is the fix — whether asking
 * for a clip already prepared marks it used.
 */
function listen(from: number, to: number, touches: boolean) {
  const drops: string[] = [];
  const cache = new ClipCache<string>(8, 8, (k, why: DropReason) => drops.push(`${k}:${why}`));
  const prime = (i: number) => {
    if (i < 0) return;
    const k = `p${i}`;
    if (touches ? cache.touch(k) : cache.has(k)) return;
    cache.set(k, k);
  };
  const missedAtPlay: string[] = [];
  prime(from); // the bar opening prepares the paragraph it will start on
  for (let i = from; i <= to; i++) {
    for (const j of [i, i + 1, i + 2, i + 3, i - 1, i - 2]) prime(j);
    if (!cache.has(`p${i}`)) missedAtPlay.push(`p${i}`);
    cache.set(`p${i}`, `p${i}`);
  }
  return { missedAtPlay, drops };
}

describe('ClipCache', () => {
  it('kept evicting the paragraph about to play when asking left its place unchanged (the 24.6 s silence)', () => {
    // Listening from paragraph 2, as in the iPhone log: by paragraph 5, preparing paragraph 8 evicted paragraph 5.
    expect(listen(2, 5, false).drops).toContain('p5:evicted');
  });

  it('never evicts a clip around the cursor once asking marks it used', () => {
    const { missedAtPlay, drops } = listen(2, 40, true);
    expect(missedAtPlay).toEqual([]);
    // What goes is something already played and out of the window — never one of the three ahead.
    for (const d of drops) {
      const n = Number(d.slice(1, d.indexOf(':')));
      expect(d.endsWith(':evicted')).toBe(true);
      expect(n).toBeLessThan(40 - 2);
    }
  });

  it('keeps pinned clips through eviction, and drops the oldest pin past the limit', () => {
    const drops: string[] = [];
    const cache = new ClipCache<number>(2, 2, (k, why) => drops.push(`${k}:${why}`));
    cache.pin('chapter-2');
    cache.set('chapter-2', 0);
    for (let i = 0; i < 5; i++) cache.set(`p${i}`, i);
    expect(cache.has('chapter-2')).toBe(true);
    cache.pin('chapter-3');
    cache.pin('chapter-4');
    expect(drops).toContain('chapter-2:unpinned');
  });

  it('says why each clip went', () => {
    const drops: string[] = [];
    const cache = new ClipCache<number>(8, 8, (k, why) => drops.push(`${k}:${why}`));
    cache.set('a', 1);
    cache.set('b', 2);
    cache.delete('a', 'stale');
    cache.clear('rate');
    expect(drops).toEqual(['a:stale', 'b:rate']);
  });
});
