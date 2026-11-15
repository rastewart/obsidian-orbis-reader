import { describe, expect, it } from 'vitest';
import type { StatsTocItem } from '../reader/StatsHost';
import {
  chapterBoundaries,
  chapterLocs,
  chapterProgressFromBoundaries,
  computeWpmSample,
  cycleLocMode,
  formatLocLabel,
  formatReadingTime,
  formatWordCount,
  LOC_MODE_MAP,
  type LocLabelState,
  pushWpmSample,
  resolveLocMode,
  sectionProgress,
  trimmedMeanWpm,
  WPM_MIN_SAMPLES,
  wordsInFractionRange,
} from '../reader/stats-math';

// LOC_MODE_MAP = [book-percent, book-locs, chapter-percent, chapter-locs, book-time, chapter-time, blank]
const ALL_MODES = [
  'book-percent',
  'book-locs',
  'chapter-percent',
  'chapter-locs',
  'book-time',
  'chapter-time',
] as const;

describe('formatWordCount', () => {
  it('renders < 1000 as a plain rounded integer', () => {
    expect(formatWordCount(0)).toBe('0');
    expect(formatWordCount(42)).toBe('42');
    expect(formatWordCount(999)).toBe('999');
    expect(formatWordCount(123.6)).toBe('124');
  });
  it('renders 1000–9999 with one decimal k', () => {
    expect(formatWordCount(1000)).toBe('1.0k');
    expect(formatWordCount(1500)).toBe('1.5k');
    expect(formatWordCount(9499)).toBe('9.5k');
  });
  it('renders >= 10000 as rounded k', () => {
    expect(formatWordCount(10000)).toBe('10k');
    expect(formatWordCount(12345)).toBe('12k');
    expect(formatWordCount(999999)).toBe('1000k');
  });
});

describe('formatReadingTime', () => {
  it('renders under a minute as <1m', () => {
    expect(formatReadingTime(0)).toBe('<1m');
    expect(formatReadingTime(0.5)).toBe('<1m');
    expect(formatReadingTime(0.99)).toBe('<1m');
  });
  it('renders minutes under an hour', () => {
    expect(formatReadingTime(1)).toBe('1m');
    expect(formatReadingTime(30)).toBe('30m');
    expect(formatReadingTime(59.4)).toBe('59m');
  });
  it('renders whole hours without minutes', () => {
    expect(formatReadingTime(60)).toBe('1h');
    expect(formatReadingTime(120)).toBe('2h');
  });
  it('renders hours and minutes', () => {
    expect(formatReadingTime(61)).toBe('1h 1m');
    expect(formatReadingTime(90)).toBe('1h 30m');
    expect(formatReadingTime(145)).toBe('2h 25m');
  });
});

describe('trimmedMeanWpm', () => {
  /**
   * The threshold is shared, not retyped: the Stats tab's *Estimated pace* and the reading-data page's *Average
   * reading speed* are one figure by one rule, and a second literal `8` would let them drift apart.
   */
  it('is the same threshold both surfaces report against', () => {
    expect(WPM_MIN_SAMPLES).toBe(8);
    expect(trimmedMeanWpm(new Array(WPM_MIN_SAMPLES - 1).fill(100), WPM_MIN_SAMPLES)).toBe(0);
    expect(trimmedMeanWpm(new Array(WPM_MIN_SAMPLES).fill(100), WPM_MIN_SAMPLES)).toBe(100);
  });
  it('returns 0 below the minimum sample count', () => {
    expect(trimmedMeanWpm([100, 200], 8)).toBe(0);
    expect(trimmedMeanWpm(new Array(7).fill(100), 8)).toBe(0);
  });
  it('returns the mean once the sample count is met (no trim under 10)', () => {
    expect(trimmedMeanWpm(new Array(8).fill(100), 8)).toBe(100);
  });
  it('trims 10% from each end before averaging', () => {
    // 10 samples → trim floor(1) each end; the min (1) and max (1000) drop out.
    const samples = [3, 4, 5, 6, 7, 8, 9, 2, 1, 1000];
    // sorted: [1,2,3,4,5,6,7,8,9,1000] → keep [2..9] → mean 5.5
    expect(trimmedMeanWpm(samples, 8)).toBe(5.5);
  });
  it('is order-independent (sorts internally)', () => {
    expect(trimmedMeanWpm([1000, 5, 3, 8, 2, 9, 7, 6, 4, 1], 8)).toBe(5.5);
  });
});

describe('computeWpmSample', () => {
  it('rejects intervals shorter than 5s or longer than 180s', () => {
    expect(computeWpmSample(100, 4)).toBeNull();
    expect(computeWpmSample(100, 181)).toBeNull();
  });
  it('accepts the 5s and 180s boundaries', () => {
    expect(computeWpmSample(50, 30)).toBe(100); // 50/30*60
    expect(computeWpmSample(300, 180)).toBe(100); // boundary ok
  });
  it('rejects fewer than 20 words', () => {
    expect(computeWpmSample(19, 30)).toBeNull();
  });
  it('rejects wpm outside (50, 1000)', () => {
    expect(computeWpmSample(25, 30)).toBeNull(); // exactly 50 → excluded
    expect(computeWpmSample(500, 30)).toBeNull(); // exactly 1000 → excluded
    expect(computeWpmSample(600, 30)).toBeNull(); // 1200 → excluded
  });
  it('returns wpm for a plausible interval', () => {
    expect(computeWpmSample(30, 30)).toBe(60);
    expect(computeWpmSample(100, 60)).toBe(100);
  });
});

describe('pushWpmSample', () => {
  it('appends to a short buffer', () => {
    expect(pushWpmSample([1, 2], 3)).toEqual([1, 2, 3]);
  });
  it('caps the buffer at 15, dropping the oldest', () => {
    const full = Array.from({ length: 15 }, (_, i) => i + 1); // [1..15]
    const next = pushWpmSample(full, 16);
    expect(next).toHaveLength(15);
    expect(next[0]).toBe(2);
    expect(next[14]).toBe(16);
  });
  it('does not mutate the input buffer', () => {
    const buf = [1, 2, 3];
    pushWpmSample(buf, 4);
    expect(buf).toEqual([1, 2, 3]);
  });
});

describe('cycleLocMode', () => {
  const all = [...ALL_MODES];
  it('advances through enabled modes then blank, then wraps', () => {
    expect(cycleLocMode(0, all)).toBe(1); // book-percent → book-locs
    expect(cycleLocMode(5, all)).toBe(6); // chapter-time → blank
    expect(cycleLocMode(6, all)).toBe(0); // blank → book-percent (wrap)
  });
  it('cycles only enabled modes (+ blank)', () => {
    const enabled = ['chapter-percent'] as const;
    expect(cycleLocMode(2, [...enabled])).toBe(6); // chapter-percent → blank
    expect(cycleLocMode(6, [...enabled])).toBe(2); // blank → chapter-percent
  });
  it('jumps to the first enabled mode when current is not enabled', () => {
    // current mode 0 (book-percent) not in the enabled set → next after "not found" is index 0
    expect(cycleLocMode(0, ['chapter-percent'])).toBe(2);
  });
});

describe('resolveLocMode', () => {
  const all = [...ALL_MODES];
  it('adopts the persisted mode when it is enabled', () => {
    expect(resolveLocMode(0, 'chapter-percent', all)).toEqual({ mode: 2, persist: null });
  });
  it('keeps blank without reconciling (it is exempt)', () => {
    expect(resolveLocMode(0, 'blank', all)).toEqual({ mode: 6, persist: null });
  });
  it('jumps off a just-disabled mode to the first enabled and reports it to persist', () => {
    expect(resolveLocMode(3, 'book-percent', ['chapter-percent'])).toEqual({
      mode: 2,
      persist: 'chapter-percent',
    });
  });
  it('does nothing when no modes are enabled', () => {
    expect(resolveLocMode(0, 'book-percent', [])).toEqual({ mode: 0, persist: null });
  });
});

describe('sectionProgress', () => {
  const base = { totalBookSize: 200, sectionSizes: [100, 100], currentSection: 0, totalLocs: null as number | null };
  it('returns null without a fraction or book size', () => {
    expect(sectionProgress({ ...base, fraction: null })).toBeNull();
    expect(sectionProgress({ ...base, fraction: 0.25, totalBookSize: 0 })).toBeNull();
  });
  it('returns null when the current section has no size', () => {
    expect(sectionProgress({ ...base, sectionSizes: [100, 0], currentSection: 1, fraction: 0.6 })).toBeNull();
  });
  it('computes pct within the section, without locs', () => {
    expect(sectionProgress({ ...base, fraction: 0.25 })).toEqual({ loc: 0, total: 0, pct: 50 });
  });
  it('derives loc/total from totalLocs and section width', () => {
    expect(sectionProgress({ ...base, fraction: 0.25, totalLocs: 100 })).toEqual({ loc: 25, total: 50, pct: 50 });
  });
  it('clamps progress into [0,1] for out-of-section fractions', () => {
    expect(sectionProgress({ ...base, fraction: 0.9 })?.pct).toBe(100); // past section 0's end
    expect(sectionProgress({ ...base, currentSection: 1, fraction: 0.3 })?.pct).toBe(0); // before section 1's start
  });
});

describe('chapterBoundaries', () => {
  const noSection = () => -1;
  const empty = {
    sectionLocInfo: [] as { startLoc: number }[],
    tocStartFractions: new Map<string, number>(),
    totalLocs: 0,
    sectionSizes: [] as number[],
    totalBookSize: 0,
    hrefToSectionIndex: noSection,
  };

  it('returns empty when there is no TOC', () => {
    expect(chapterBoundaries({ ...empty, tocItems: [] })).toEqual({ boundaries: [], flatHrefs: [] });
  });
  it('returns empty when there is no position data at all', () => {
    const tocItems: StatsTocItem[] = [{ href: 'a' }];
    expect(chapterBoundaries({ ...empty, tocItems })).toEqual({ boundaries: [], flatHrefs: [] });
  });
  it('assigns starts from tocStartFractions, end = next start (last = 1.0)', () => {
    const tocItems: StatsTocItem[] = [{ href: 'a' }, { href: 'b' }];
    const res = chapterBoundaries({
      ...empty,
      tocItems,
      sectionLocInfo: [{ startLoc: 0 }],
      tocStartFractions: new Map([
        ['a', 0],
        ['b', 0.5],
      ]),
    });
    expect(res.flatHrefs).toEqual(['a', 'b']);
    expect(res.boundaries).toEqual([
      { startFraction: 0, endFraction: 0.5 },
      { startFraction: 0.5, endFraction: 1.0 },
    ]);
  });
  it('falls back to byte offset when a chapter has no stored fraction', () => {
    const tocItems: StatsTocItem[] = [{ href: 'ch1' }, { href: 'ch2' }];
    const res = chapterBoundaries({
      ...empty,
      tocItems,
      sectionLocInfo: [{ startLoc: 0 }, { startLoc: 0 }], // just to pass the guard
      sectionSizes: [100, 100],
      totalBookSize: 200,
      hrefToSectionIndex: (h) => (h === 'ch1' ? 0 : 1),
    });
    expect(res.boundaries.map((b) => b.startFraction)).toEqual([0, 0.5]);
  });
  it('falls back to section-loc start when byte sizes are unavailable', () => {
    const tocItems: StatsTocItem[] = [{ href: 'ch1' }, { href: 'ch2' }];
    const res = chapterBoundaries({
      ...empty,
      tocItems,
      sectionLocInfo: [{ startLoc: 0 }, { startLoc: 50 }],
      totalLocs: 100,
      totalBookSize: 0,
      hrefToSectionIndex: (h) => (h === 'ch1' ? 0 : 1),
    });
    expect(res.boundaries.map((b) => b.startFraction)).toEqual([0, 0.5]);
  });
  it('distributes unvisited chapters evenly so none share a fraction (no false 100%)', () => {
    const tocItems: StatsTocItem[] = [{ href: 'a' }, { href: 'b' }, { href: 'c' }];
    const res = chapterBoundaries({
      ...empty,
      tocItems,
      tocStartFractions: new Map([['a', 0]]), // only 'a' known; b,c unresolved
    });
    const starts = res.boundaries.map((b) => b.startFraction);
    expect(starts).toEqual([0, 0.5, 1.0]);
    // adjacent unvisited chapters must differ
    expect(starts[1]).not.toBe(starts[2]);
  });
  it('flattens nested subitems in reading order', () => {
    const tocItems: StatsTocItem[] = [{ href: 'a', subitems: [{ href: 'a1' }] }, { href: 'b' }];
    const res = chapterBoundaries({
      ...empty,
      tocItems,
      sectionLocInfo: [{ startLoc: 0 }],
      tocStartFractions: new Map([
        ['a', 0],
        ['a1', 0.25],
        ['b', 0.5],
      ]),
    });
    expect(res.flatHrefs).toEqual(['a', 'a1', 'b']);
    expect(res.boundaries).toEqual([
      { startFraction: 0, endFraction: 0.25 },
      { startFraction: 0.25, endFraction: 0.5 },
      { startFraction: 0.5, endFraction: 1.0 },
    ]);
  });
});

describe('chapterProgressFromBoundaries', () => {
  const boundaries = [
    { startFraction: 0, endFraction: 0.5 },
    { startFraction: 0.5, endFraction: 1.0 },
  ];
  it('locates the chapter by tocItemHref', () => {
    expect(
      chapterProgressFromBoundaries({
        fraction: 0.75,
        boundaries,
        flatHrefs: ['a', 'b'],
        tocItemHref: 'b',
        totalLocs: 100,
      })
    ).toEqual({ loc: 25, total: 50, pct: 50 });
  });
  it('scans by fraction when there is no href match', () => {
    const three = [
      { startFraction: 0, endFraction: 0.3 },
      { startFraction: 0.3, endFraction: 0.6 },
      { startFraction: 0.6, endFraction: 1.0 },
    ];
    expect(
      chapterProgressFromBoundaries({
        fraction: 0.65,
        boundaries: three,
        flatHrefs: ['a', 'b', 'c'],
        tocItemHref: '',
        totalLocs: 100,
      })
    ).toEqual({ loc: 5, total: 40, pct: 13 });
  });
  it('guards a zero-width chapter (no divide-by-zero / NaN)', () => {
    const res = chapterProgressFromBoundaries({
      fraction: 0.5,
      boundaries: [{ startFraction: 0.5, endFraction: 0.5 }],
      flatHrefs: ['a'],
      tocItemHref: 'a',
      totalLocs: 100,
    });
    expect(res).toEqual({ loc: 1, total: 1, pct: 0 });
  });
  it('clamps ratio when the fraction precedes the chapter start', () => {
    const res = chapterProgressFromBoundaries({
      fraction: 0.3,
      boundaries: [{ startFraction: 0.5, endFraction: 1.0 }],
      flatHrefs: ['a'],
      tocItemHref: 'a',
      totalLocs: 100,
    });
    expect(res.pct).toBe(0);
    expect(res.loc).toBe(1);
  });
});

describe('wordsInFractionRange', () => {
  const byteInput = {
    sectionSizes: [100, 100],
    totalBookSize: 200,
    sectionWordCounts: [1000, 2000],
    sectionCharCounts: [] as number[],
    totalBookChars: 0,
  };
  it('returns 0 for an empty or inverted range', () => {
    expect(wordsInFractionRange(0.5, 0.5, byteInput)).toBe(0);
    expect(wordsInFractionRange(0.6, 0.4, byteInput)).toBe(0);
  });
  it('returns 0 when there are no word counts', () => {
    expect(wordsInFractionRange(0, 1, { ...byteInput, sectionWordCounts: [] })).toBe(0);
  });
  it('sums word density across the full book (byte path)', () => {
    expect(wordsInFractionRange(0, 1.0, byteInput)).toBe(3000);
  });
  it('weights partial overlaps', () => {
    expect(wordsInFractionRange(0.25, 0.75, byteInput)).toBe(1500);
  });
  it('skips zero-size sections', () => {
    const input = {
      ...byteInput,
      sectionSizes: [100, 0, 100],
      sectionWordCounts: [1000, 999, 2000],
    };
    expect(wordsInFractionRange(0, 1, input)).toBe(3000); // the 999 in the zero-size section is ignored
  });
  it('falls back to char-based density when byte sizes are unavailable', () => {
    const input = {
      sectionSizes: [] as number[],
      totalBookSize: 0,
      sectionWordCounts: [1000, 2000],
      sectionCharCounts: [100, 100],
      totalBookChars: 200,
    };
    expect(wordsInFractionRange(0, 1, input)).toBe(3000);
  });
  it('returns 0 in the char path when there are no chars', () => {
    const input = {
      sectionSizes: [] as number[],
      totalBookSize: 0,
      sectionWordCounts: [1000],
      sectionCharCounts: [] as number[],
      totalBookChars: 0,
    };
    expect(wordsInFractionRange(0, 1, input)).toBe(0);
  });
});

describe('formatLocLabel', () => {
  const label = (mode: number, partial: Partial<LocLabelState>): string =>
    formatLocLabel(mode, {
      fraction: null,
      location: null,
      chapterProgress: null,
      wpm: 0,
      wordsRemainingBook: 0,
      wordsRemainingChapter: 0,
      ...partial,
    });

  it('mode 0 — book percent', () => {
    expect(label(0, { fraction: 0.42 })).toBe('📖 42%');
    expect(label(0, { fraction: null })).toBe('—');
  });
  it('mode 1 — book page / total, falling back to percent', () => {
    expect(label(1, { location: { current: 12, total: 30 } })).toBe('📖 12 / 30');
    expect(label(1, { location: null, fraction: 0.42 })).toBe('📖 42%');
    expect(label(1, { location: { current: 5, total: 0 }, fraction: 0.42 })).toBe('📖 42%'); // total 0 → fallback
    expect(label(1, {})).toBe('—');
  });
  it('mode 2 — chapter percent', () => {
    expect(label(2, { chapterProgress: { loc: 1, total: 10, pct: 33 } })).toBe('📑 33%');
    expect(label(2, { chapterProgress: null })).toBe('—');
  });
  it('mode 3 — chapter page / total', () => {
    expect(label(3, { chapterProgress: { loc: 5, total: 20, pct: 25 } })).toBe('📑 5 / 20');
    expect(label(3, { chapterProgress: { loc: 1, total: 0, pct: 0 } })).toBe('');
    expect(label(3, { chapterProgress: null })).toBe('');
  });
  it('mode 4 — time remaining in book (needs pace)', () => {
    expect(label(4, { wpm: 0 })).toBe('📖 —');
    expect(label(4, { wpm: 200, wordsRemainingBook: 2000 })).toBe('📖 ~10m');
    expect(label(4, { wpm: 200, wordsRemainingBook: 24000 })).toBe('📖 ~2h');
  });
  it('mode 5 — time remaining in chapter (needs pace)', () => {
    expect(label(5, { wpm: 0 })).toBe('📑 —');
    expect(label(5, { wpm: 200, wordsRemainingChapter: 400 })).toBe('📑 ~2m');
  });
  it('mode 6 — blank', () => {
    expect(label(6, { fraction: 0.5 })).toBe('');
  });
  /**
   * **An em dash, never three periods.** `'...'` reads as a string that has run out of room, so a chip showing
   * `📖 ...` looks too narrow. The Stats tab uses `—` for the same "no value yet", so this is one symbol for one
   * state. See `NO_VALUE_YET`.
   */
  it('unknown mode — placeholder', () => {
    expect(label(7, { fraction: 0.5 })).toBe('—');
  });
});

describe('LOC_MODE_MAP', () => {
  it('has the six modes plus blank in order', () => {
    expect(LOC_MODE_MAP).toEqual([...ALL_MODES, 'blank']);
  });
});

describe('chapterLocs', () => {
  it('counts the chapter from 1 in the book’s own locations, so start + chapter location − 1 = book location', () => {
    expect(chapterLocs(120, 100, 150)).toEqual({ loc: 21, total: 50 });
    expect(chapterLocs(100, 100, 150)).toEqual({ loc: 1, total: 50 });
    expect(chapterLocs(149, 100, 150)).toEqual({ loc: 50, total: 50 });
  });

  it('keeps a page outside the chapter’s range on its first or last location', () => {
    expect(chapterLocs(98, 100, 150)).toEqual({ loc: 1, total: 50 }); // a title page the contents skips
    expect(chapterLocs(150, 100, 150)).toEqual({ loc: 50, total: 50 }); // the location the next chapter starts in
  });

  it('gives a chapter shorter than a location one location, never zero or less', () => {
    expect(chapterLocs(7, 7, 7)).toEqual({ loc: 1, total: 1 });
    expect(chapterLocs(7, 9, 7)).toEqual({ loc: 1, total: 1 });
  });
});
