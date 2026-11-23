// What Scan annotation data for problems finds. A device run can only see the clean answer: a broken range or a
// duplicate cannot be made from the reader, so the problems are checked here.

import { describe, expect, it } from 'vitest';
import type { Highlight, Note } from '../progress';
import {
  collapsedElementPath,
  elementAtSteps,
  scanAnnotationData,
  storedText,
  textRangeOf,
} from '../reader/annotation-repair';

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

describe('collapsedElementPath', () => {
  it('finds the paragraph an empty element range was made on', () => {
    expect(collapsedElementPath('epubcfi(/6/10!/4,/4,/4)')).toEqual({ point: 'epubcfi(/6/10!/4/4)', steps: [4, 4] });
  });

  it('keeps an id on a step', () => {
    expect(collapsedElementPath('epubcfi(/6/4[ch1]!/4[body]/2,/6[p3],/6[p3])')).toEqual({
      point: 'epubcfi(/6/4[ch1]!/4[body]/2/6[p3])',
      steps: [4, 2, 6],
    });
  });

  it('leaves a range that covers text alone', () => {
    expect(collapsedElementPath('epubcfi(/6/4!/4/6,/1:0,/1:434)')).toBeNull();
  });

  it('leaves an empty range whose ends are in text alone', () => {
    // Not the mistake this repairs: a collapsed point in text names no passage.
    expect(collapsedElementPath('epubcfi(/6/4!/4/6,/1:12,/1:12)')).toBeNull();
  });

  it('leaves a point, and anything that is not a CFI, alone', () => {
    expect(collapsedElementPath('epubcfi(/6/4!/4/6)')).toBeNull();
    expect(collapsedElementPath('')).toBeNull();
  });
});

describe('putting a paragraph back', () => {
  const doc = new DOMParser().parseFromString(
    '<html><head></head><body><h1>Chapter</h1><p>\n Nobody in <em>Thistlecombe</em> could say why. </p></body></html>',
    'text/html'
  );

  it('walks CFI steps from the root element', () => {
    expect(elementAtSteps(doc, [4, 4])?.tagName).toBe('P');
    expect(elementAtSteps(doc, [4, 2])?.tagName).toBe('H1');
  });

  it('leads nowhere on an odd step or one past the last child', () => {
    expect(elementAtSteps(doc, [4, 3])).toBeNull();
    expect(elementAtSteps(doc, [4, 8])).toBeNull();
  });

  it('covers the element from its first character to its last', () => {
    const range = textRangeOf(elementAtSteps(doc, [4, 4]) as Element);
    expect(range?.toString()).toBe('Nobody in Thistlecombe could say why.');
    expect(storedText(range?.toString() ?? '')).toBe(storedText(' Nobody in  Thistlecombe could say why.\n'));
  });
});
