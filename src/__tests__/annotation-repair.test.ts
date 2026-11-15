// What Scan annotation data for problems finds. A device run can only see the clean answer: a broken range or a
// duplicate cannot be made from the reader, so the problems are checked here.

import { describe, expect, it } from 'vitest';
import type { Highlight, Note } from '../progress';
import { scanAnnotationData } from '../reader/annotation-repair';

const RANGE = 'epubcfi(/6/4!/4/2,/1:0,/1:12)';
const BACKWARDS = 'epubcfi(/6/4!/4/2,/1:12,/1:0)';

const selection = (id: string, cfiRange: string, text = 'A sentence.'): Highlight =>
  ({ id, cfiRange, text }) as unknown as Highlight;
const note = (id: string, cfiRange: string, selectedText = 'A sentence.'): Note =>
  ({ id, cfiRange, selectedText, text: 'What I wrote.' }) as unknown as Note;

describe('scanAnnotationData', () => {
  it('finds nothing wrong with sound, distinct marks', () => {
    expect(scanAnnotationData({ highlights: [selection('a', RANGE)], notes: [note('b', RANGE)] })).toEqual([]);
  });

  it('flags an empty or backwards range as broken', () => {
    const found = scanAnnotationData({ highlights: [selection('a', ''), selection('b', BACKWARDS)], notes: [] });
    expect(found.map((p) => [p.id, p.reason])).toEqual([
      ['a', 'malformed-range'],
      ['b', 'malformed-range'],
    ]);
  });

  // The first is kept; only the copies after it are offered for removal.
  it('flags the second of two identical selections as a duplicate', () => {
    const found = scanAnnotationData({ highlights: [selection('a', RANGE), selection('b', RANGE)], notes: [] });
    expect(found.map((p) => [p.id, p.reason])).toEqual([['b', 'duplicate']]);
  });

  // A selection and a note on the same passage are two things, not one twice.
  it('does not call a note a duplicate of a selection on the same passage', () => {
    expect(scanAnnotationData({ highlights: [selection('a', RANGE)], notes: [note('b', RANGE)] })).toEqual([]);
  });

  it('does not call two selections on one range duplicates when their text differs', () => {
    const found = scanAnnotationData({
      highlights: [selection('a', RANGE, 'One.'), selection('b', RANGE, 'Two.')],
      notes: [],
    });
    expect(found).toEqual([]);
  });
});
