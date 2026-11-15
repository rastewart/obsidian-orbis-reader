import { describe, expect, it } from 'vitest';
import { computeLocWordCounts, computeSectionLocInfo, locAtChar, type SectionLoc } from '../reader/location-math';

describe('locAtChar', () => {
  it('starts location L at character round((L - 1) × charsPerLoc), counting from 1', () => {
    // 2.6 characters a location: location 5 starts at round(10.4) = 10.
    expect(locAtChar(0, 2.6, 100)).toBe(1);
    expect(locAtChar(9, 2.6, 100)).toBe(4);
    expect(locAtChar(10, 2.6, 100)).toBe(5);
  });

  it('puts every location’s own first character in that location, and the one before it in the previous', () => {
    for (const [chars, total] of [
      [1000, 100],
      [12_345, 678],
      [99_991, 4_096],
      [5_000, 4_999],
    ]) {
      const per = chars / total;
      for (let loc = 2; loc <= total; loc++) {
        const start = Math.round((loc - 1) * per);
        expect(locAtChar(start, per, total)).toBe(loc);
        expect(locAtChar(start - 1, per, total)).toBe(loc - 1);
      }
      expect(locAtChar(chars - 1, per, total)).toBe(total);
    }
  });

  it('never answers past the total or below 1', () => {
    expect(locAtChar(10_000, 10, 100)).toBe(100);
    expect(locAtChar(-5, 10, 100)).toBe(1);
  });
});

describe('computeSectionLocInfo', () => {
  it('counts the locations that start in each section', () => {
    // 200 / 300 / 500 chars of 1000 total, 100 locations → 20 / 30 / 50.
    expect(computeSectionLocInfo([200, 300, 500], 1000, 100)).toEqual([
      { startLoc: 1, locCount: 20 },
      { startLoc: 21, locCount: 30 },
      { startLoc: 51, locCount: 50 },
    ]);
  });

  it('counts every location exactly once, however the sections fall', () => {
    const counts = [37, 1, 1, 912, 4, 3_000, 2, 58];
    const total = counts.reduce((a, b) => a + b, 0);
    const info = computeSectionLocInfo(counts, total, 517);
    let next = 1;
    for (const s of info) {
      expect(s.startLoc).toBe(next);
      next += s.locCount;
    }
    expect(next - 1).toBe(517);
  });

  it('agrees with locAtChar on where each section’s first location starts', () => {
    const counts = [37, 1, 1, 912, 4, 3_000, 2, 58];
    const total = counts.reduce((a, b) => a + b, 0);
    const per = total / 517;
    const info = computeSectionLocInfo(counts, total, 517);
    let start = 0;
    for (const [i, chars] of counts.entries()) {
      const { startLoc, locCount } = info[i];
      if (locCount > 0) {
        expect(locAtChar(Math.round((startLoc - 1) * per), per, 517)).toBe(startLoc);
        expect(Math.round((startLoc - 1) * per)).toBeGreaterThanOrEqual(start);
        expect(Math.round((startLoc + locCount - 1) * per)).toBeGreaterThanOrEqual(start + chars);
      }
      start += chars;
    }
  });

  it('gives a section too short for a location to start in none, and the next section starts where it would', () => {
    // 10 characters a location: the 3-character section holds no location's start.
    expect(computeSectionLocInfo([95, 3, 102], 200, 20)).toEqual([
      { startLoc: 1, locCount: 10 },
      { startLoc: 11, locCount: 0 },
      { startLoc: 11, locCount: 10 },
    ]);
  });

  it('handles a single section (all locations)', () => {
    expect(computeSectionLocInfo([500], 500, 42)).toEqual([{ startLoc: 1, locCount: 42 }]);
  });

  it('returns an empty array for no sections', () => {
    expect(computeSectionLocInfo([], 0, 10)).toEqual([]);
  });

  it('gives no locations when totalLocs is 0 (fraction-only path never calls it, but stays total)', () => {
    const info = computeSectionLocInfo([200, 800], 1000, 0);
    expect(info.map((s) => s.locCount)).toEqual([0, 0]);
    expect(info.every((s) => Number.isFinite(s.startLoc))).toBe(true);
  });
});

describe('computeLocWordCounts', () => {
  it('spreads each section’s words evenly across its locations, keyed by absolute location', () => {
    const info: SectionLoc[] = [
      { startLoc: 1, locCount: 2 },
      { startLoc: 3, locCount: 1 },
    ];
    const map = computeLocWordCounts(info, [10, 6]);
    expect(map.get(1)).toBe(5);
    expect(map.get(2)).toBe(5);
    expect(map.get(3)).toBe(6);
    expect(map.size).toBe(3);
  });

  it('produces one key per location across the full numbering', () => {
    const info: SectionLoc[] = [
      { startLoc: 1, locCount: 3 },
      { startLoc: 4, locCount: 2 },
    ];
    const map = computeLocWordCounts(info, [30, 10]);
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(map.get(3)).toBe(10); // 30 / 3
    expect(map.get(5)).toBe(5); // 10 / 2
  });

  it('treats a missing per-section word count as 0 words', () => {
    const info: SectionLoc[] = [
      { startLoc: 1, locCount: 1 },
      { startLoc: 2, locCount: 2 },
    ];
    const map = computeLocWordCounts(info, [10]); // second section has no entry
    expect(map.get(1)).toBe(10);
    expect(map.get(2)).toBe(0);
    expect(map.get(3)).toBe(0);
  });

  it('maps a zero-word section to 0 for all its locations', () => {
    const map = computeLocWordCounts([{ startLoc: 1, locCount: 3 }], [0]);
    expect([...map.values()]).toEqual([0, 0, 0]);
  });

  it('returns an empty map for no sections', () => {
    expect(computeLocWordCounts([], []).size).toBe(0);
  });

  it('stays aligned with computeSectionLocInfo’s numbering end-to-end', () => {
    const info = computeSectionLocInfo([200, 300, 500], 1000, 100);
    const map = computeLocWordCounts(info, [400, 600, 1000]);
    // section 1: locs 1..20 each 400/20 = 20 words
    expect(map.get(1)).toBe(20);
    expect(map.get(20)).toBe(20);
    // section 2: locs 21..50 each 600/30 = 20 words
    expect(map.get(21)).toBe(20);
    // section 3: locs 51..100 each 1000/50 = 20 words
    expect(map.get(100)).toBe(20);
    expect(map.size).toBe(100);
  });
});
