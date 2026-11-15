// The stretch of a section one contents entry occupies — what the player's bar, readouts and scrub measure.
//
// The book behind these numbers had 80 contents entries inside 7 files, so a bar measuring the
// FILE filled left to right as the reader stepped through the Days and started over at the next file.

import { describe, expect, it } from 'vitest';
import { type EntryStart, entrySpanAt, normalizeEntryStarts, spanProgress } from '../reader/tts/entry-span';

const starts: EntryStart[] = [
  { unitIdx: 0, href: 'text.xhtml#day10', partIndex: 0 },
  { unitIdx: 40, href: 'text.xhtml#day11', partIndex: 1 },
  { unitIdx: 90, href: 'text.xhtml#day12', partIndex: 2 },
];

describe('entrySpanAt', () => {
  it('gives the span the position is inside', () => {
    expect(entrySpanAt(starts, 50, 120)).toEqual({ start: 40, end: 90, href: 'text.xhtml#day11', partIndex: 1 });
  });

  it('runs the last entry to the end of the section', () => {
    expect(entrySpanAt(starts, 100, 120)).toEqual({ start: 90, end: 120, href: 'text.xhtml#day12', partIndex: 2 });
  });

  it('counts an entry from its own first unit', () => {
    expect(entrySpanAt(starts, 40, 120).start).toBe(40);
  });

  /**
   * A file whose contents entries begin partway down — front matter above the first Day. It belongs to no entry:
   * measuring it as part of the first would tell a listener they were minutes into a chapter they had not reached.
   */
  it('treats what comes before the first entry as its own stretch', () => {
    const later: EntryStart[] = [{ unitIdx: 12, href: 'text.xhtml#day1', partIndex: 0 }];
    expect(entrySpanAt(later, 3, 60)).toEqual({ start: 0, end: 12, href: null, partIndex: -1 });
  });

  // An ordinary book, where one file is one chapter, measures exactly what it always measured.
  it('is the whole section when the section has no entries', () => {
    expect(entrySpanAt([], 7, 60)).toEqual({ start: 0, end: 60, href: null, partIndex: -1 });
  });
});

describe('normalizeEntryStarts', () => {
  it('puts entries in reading order', () => {
    const out = normalizeEntryStarts([starts[2], starts[0], starts[1]]);
    expect(out.map((s) => s.unitIdx)).toEqual([0, 40, 90]);
  });

  /**
   * A Part divider and the chapter beneath it can land on the same reading unit. Keeping both would make a
   * zero-length span the bar could never sit in and the transport could never leave.
   */
  it('keeps the first of two entries that land on one unit', () => {
    const out = normalizeEntryStarts([
      { unitIdx: 5, href: 'a#part2', partIndex: 0 },
      { unitIdx: 5, href: 'a#ch1', partIndex: 1 },
    ]);
    expect(out).toEqual([{ unitIdx: 5, href: 'a#part2', partIndex: 0 }]);
  });

  it('drops an anchor that resolved to nothing', () => {
    expect(normalizeEntryStarts([{ unitIdx: -1, href: 'a#gone', partIndex: 0 }])).toEqual([]);
  });
});

describe('spanProgress', () => {
  // cumWords[i] = words before unit i. Four units of 10 words each.
  const cum = [0, 10, 20, 30, 40];
  const words = [10, 10, 10, 10];

  it('measures from the span, not from the section', () => {
    const span = { start: 2, end: 4, href: 'a#two', partIndex: 0 };
    expect(spanProgress(span, cum, words, 2, 0)).toEqual({ done: 0, total: 20 });
    expect(spanProgress(span, cum, words, 3, 0)).toEqual({ done: 10, total: 20 });
  });

  // Arriving at an entry reads as zero, which is the whole point: each step starts the bar again.
  it('starts at zero on the entry it just stepped to', () => {
    expect(spanProgress({ start: 2, end: 4, href: 'a', partIndex: 0 }, cum, words, 2, 0).done).toBe(0);
  });

  it('moves within a unit rather than jumping a paragraph at a time', () => {
    expect(spanProgress({ start: 0, end: 4, href: null, partIndex: 0 }, cum, words, 1, 0.5).done).toBe(15);
  });

  it('never reports more than the span holds', () => {
    expect(spanProgress({ start: 0, end: 2, href: null, partIndex: 0 }, cum, words, 3, 1).done).toBe(20);
  });
});

/**
 * Why every "which chapter is this?" answer goes through the span rather than the href.
 *
 * A chapter divided into tracks has ONE contents entry between all of them, so `partIndexAt` — which asks by href
 * — can only ever name the first. Three separate places asked by href and were wrong in three different ways: ▶
 * from idle started track 1, the transport's label said "1 of 4" throughout, and a mix stepping out of a recorded
 * track into a live one loaded the recorded track again and played it from the top.
 *
 * `EntryStart.partIndex` exists to carry the answer the position knows. These pin the difference so the reason
 * survives the next person to look at it.
 */
describe('a divided chapter: href versus position', () => {
  /** "CHAPTER III" as four tracks — one contents entry, four parts, four span starts. */
  const starts: EntryStart[] = [
    { unitIdx: 0, href: 'ch3.xhtml#c3', partIndex: 9 },
    { unitIdx: 175, href: 'ch3.xhtml#c3', partIndex: 10 },
    { unitIdx: 350, href: 'ch3.xhtml#c3', partIndex: 11 },
    { unitIdx: 525, href: 'ch3.xhtml#c3', partIndex: 12 },
  ];

  it('cannot tell the tracks apart by href — every one of them names the same entry', () => {
    expect(new Set(starts.map((s) => s.href)).size).toBe(1);
  });

  it('names the track the position is in', () => {
    expect(entrySpanAt(starts, 0, 698).partIndex).toBe(9);
    // The first unit OF a track belongs to that track, not to the one that ended at it. This boundary is the
    // whole bug: ⏭ lands exactly on it, and answering with the previous part is what restarted the audio.
    expect(entrySpanAt(starts, 175, 698).partIndex).toBe(10);
    expect(entrySpanAt(starts, 174, 698).partIndex).toBe(9);
    expect(entrySpanAt(starts, 349, 698).partIndex).toBe(10);
    expect(entrySpanAt(starts, 525, 698).partIndex).toBe(12);
    expect(entrySpanAt(starts, 697, 698).partIndex).toBe(12);
  });

  it('keeps each track to its own stretch of the section', () => {
    expect(entrySpanAt(starts, 200, 698)).toMatchObject({ start: 175, end: 350, partIndex: 10 });
    expect(entrySpanAt(starts, 600, 698)).toMatchObject({ start: 525, end: 698, partIndex: 12 });
  });
});
