// Narrowing an export to particular marks. The rules live in one module because three consumers share them — the
// digest PDF, the whole marked-up document and the notes export all read the same two arrays off `NotesData` — so
// getting them right once is what keeps the three from drifting.

import { describe, expect, it } from 'vitest';
import type { AnnotationMark } from '../annotation-presets';
import {
  applySelection,
  chosenMarkNames,
  everything,
  filterNotesDataByMarks,
  type MarkSelection,
  markKeyOf,
  marksInUse,
  markUsage,
  NO_MARK,
  narrowsAnything,
} from '../mark-filter';

const mark = (id: string, name: string): AnnotationMark => ({ id, name, highlightColor: '#FFEB3B', enabled: true });

const MARKS = [mark('key', 'Key point'), mark('quote', 'Quote'), mark('unused', 'Question')];

/** Only the fields the filter reads — the rest of `NotesData` is passed through untouched. */
const data = () => ({
  highlights: [
    { id: 'h1', markId: 'key' },
    { id: 'h2', markId: 'quote' },
    { id: 'h3' }, // never marked
  ],
  notes: [{ id: 'n1', markId: 'key' }, { id: 'n2' }],
  bookmarks: [{ id: 'b1' }],
  marks: MARKS,
});

describe('markUsage', () => {
  it('counts highlights and notes together, under the mark they carry', () => {
    const usage = markUsage(data());
    expect(usage.get('key')).toBe(2); // one highlight, one note
    expect(usage.get('quote')).toBe(1);
  });

  /**
   * The unmarked group is counted, not skipped. Filtering to *Key point* drops every unmarked highlight, and a
   * reader has to be able to see that group and choose it — "only the ones I never marked" is a real thing to want.
   */
  it('counts what carries no mark at all, under the sentinel', () => {
    expect(markUsage(data()).get(NO_MARK)).toBe(2);
    expect(markKeyOf({})).toBe(NO_MARK);
  });

  it('leaves out a mark nothing carries', () => {
    expect(markUsage(data()).has('unused')).toBe(false);
  });
});

describe('marksInUse', () => {
  /** A mark nothing carries can only ever narrow an export to nothing, so it is not offered. */
  it('offers only the marks something carries, in the preset’s order', () => {
    expect(marksInUse(data()).map((m) => m.id)).toEqual(['key', 'quote']);
  });
});

describe('filterNotesDataByMarks', () => {
  /**
   * **"No filter" is the identity, and that is what makes the ordinary run cost nothing.** Every consumer would
   * otherwise need its own "if nothing is chosen" branch, and one of them would eventually forget.
   */
  it('returns the very same object when nothing is chosen', () => {
    const d = data();
    expect(filterNotesDataByMarks(d, new Set())).toBe(d);
  });

  it('keeps only the annotations carrying a chosen mark', () => {
    const out = filterNotesDataByMarks(data(), new Set(['key']));
    expect(out.highlights.map((h) => h.id)).toEqual(['h1']);
    expect(out.notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('takes several marks at once', () => {
    const out = filterNotesDataByMarks(data(), new Set(['key', 'quote']));
    expect(out.highlights.map((h) => h.id)).toEqual(['h1', 'h2']);
  });

  it('can select the unmarked ones, and only those', () => {
    const out = filterNotesDataByMarks(data(), new Set([NO_MARK]));
    expect(out.highlights.map((h) => h.id)).toEqual(['h3']);
    expect(out.notes.map((n) => n.id)).toEqual(['n2']);
  });

  /** A mark filter has nothing to say about a bookmark, which carries none. */
  it('never touches the bookmarks', () => {
    const out = filterNotesDataByMarks(data(), new Set(['key']));
    expect(out.bookmarks.map((b) => b.id)).toEqual(['b1']);
  });

  it('does not mutate what it was given', () => {
    const d = data();
    filterNotesDataByMarks(d, new Set(['key']));
    expect(d.highlights).toHaveLength(3);
  });

  it('narrows to nothing when the chosen mark is on nothing', () => {
    const out = filterNotesDataByMarks(data(), new Set(['unused']));
    expect(out.highlights).toHaveLength(0);
    expect(out.notes).toHaveLength(0);
  });
});

describe('chosenMarkNames', () => {
  const labels = { noMark: 'No mark', unnamed: '(unnamed)' };

  /**
   * **The preset's order, not the order they were ticked.** The same two marks must read the same way however they
   * were chosen, or a fold header that exists to be recognized at a glance says something different between two
   * runs that produce identical files.
   */
  it('reads in the preset’s order whatever order they were chosen in', () => {
    expect(chosenMarkNames(new Set(['quote', 'key']), MARKS, labels)).toEqual(['Key point', 'Quote']);
  });

  it('leads with the unmarked group, where its row sits', () => {
    expect(chosenMarkNames(new Set(['quote', NO_MARK]), MARKS, labels)).toEqual(['No mark', 'Quote']);
  });

  it('names a mark that was never named', () => {
    expect(chosenMarkNames(new Set(['x']), [mark('x', '  ')], labels)).toEqual(['(unnamed)']);
  });

  it('is empty when nothing is chosen, so the header can say so in its own words', () => {
    expect(chosenMarkNames(new Set(), MARKS, labels)).toEqual([]);
  });
});

/**
 * Two axes, because they answer different questions and neither can express the other: "only my passages" and
 * "only the ones marked Key point" are different narrowings, and a reader routinely wants both at once.
 */
describe('applySelection', () => {
  const sel = (over: Partial<MarkSelection> = {}): MarkSelection => ({ ...everything(), ...over });

  it('is the identity when it narrows nothing', () => {
    const d = data();
    expect(applySelection(d, everything())).toBe(d);
    expect(narrowsAnything(everything())).toBe(false);
  });

  it('drops the notes when only passages are wanted', () => {
    const out = applySelection(data(), sel({ notes: false }));
    expect(out.highlights).toHaveLength(3);
    expect(out.notes).toHaveLength(0);
  });

  it('drops the passages when only notes are wanted', () => {
    const out = applySelection(data(), sel({ passages: false }));
    expect(out.highlights).toHaveLength(0);
    expect(out.notes).toHaveLength(2);
  });

  it('applies both axes together', () => {
    const out = applySelection(data(), sel({ notes: false, marks: new Set(['key']) }));
    expect(out.highlights.map((h) => h.id)).toEqual(['h1']);
    expect(out.notes).toHaveLength(0);
  });

  /** Order cannot matter — kinds then marks is the same set as marks then kinds — but it is asserted rather than argued. */
  it('gives the same answer whichever axis is applied first', () => {
    const both = sel({ passages: false, marks: new Set(['key']) });
    const marksFirst = filterNotesDataByMarks(data(), both.marks);
    expect(applySelection(data(), both).notes.map((n) => n.id)).toEqual(marksFirst.notes.map((n) => n.id));
  });

  it('narrows to nothing when both kinds are off', () => {
    const out = applySelection(data(), sel({ passages: false, notes: false }));
    expect(out.highlights).toHaveLength(0);
    expect(out.notes).toHaveLength(0);
  });

  it('says when it would narrow something, so a caller can offer to say so', () => {
    expect(narrowsAnything(sel({ notes: false }))).toBe(true);
    expect(narrowsAnything(sel({ marks: new Set(['key']) }))).toBe(true);
  });
});
