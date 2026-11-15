// The line at the top of the Save as PDF dialog, which is the only place that says what the file will hold.
//
// The fault it exists to prevent: a static description that goes on promising "your marks drawn where you made
// them" with "Include marks and notes" switched off. The report lives here, where it can see every control at once,
// and the cases below are the combinations a static line cannot represent: marks off, and a chapter subset, which
// "The whole document" would claim to include whatever was ticked.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { digestSelection, summaryLine } from '../MarksPdfModal';
import { everything } from '../mark-filter';
import type { ChapterChoice, MarkChapter, MarksPdfOptions } from '../marks-pdf';

const chapter = (i: number, included: boolean, marks = 0): ChapterChoice => ({
  key: `ch${i}.xhtml`,
  hrefs: [`ch${i}.xhtml`],
  title: `Chapter ${i + 1}`,
  marks,
  included,
  unlisted: false,
});

/** A book of `total` chapters with the first `included` of them ticked. */
const options = (partial: Partial<MarksPdfOptions>, total = 45, included = 45): MarksPdfOptions => ({
  scope: 'document',
  chapterScope: 'all',
  chapters: Array.from({ length: total }, (_, i) => chapter(i, i < included)),
  selection: everything(),
  attribution: '',
  coverSheet: true,
  includeMarks: true,
  downloadFonts: false,
  folder: '/',
  fileName: 'Book',
  ...partial,
});

describe('the digest', () => {
  it('counts the marks and the chapters that hold them', () => {
    // `markedChapters` is what `groupMarksByChapter` returns, which is already only the chapters with marks — the
    // number a digest is measured in, not the length of the spine.
    expect(summaryLine(options({ scope: 'digest' }), 12, 6)).toBe(t('marks_pdf.summary', { n: '12', chapters: '6' }));
  });

  it('says nothing is marked rather than counting zero', () => {
    expect(summaryLine(options({ scope: 'digest' }), 0, 0)).toBe(t('marks_pdf.summary_none'));
  });

  it('ignores the marks switch, which belongs to the other scope', () => {
    // A digest IS its marks; `includeMarks` cannot empty it, so it must not change what this line says.
    const off = summaryLine(options({ scope: 'digest', includeMarks: false }), 12, 6);
    expect(off).toBe(summaryLine(options({ scope: 'digest', includeMarks: true }), 12, 6));
  });

  it('ignores the chapter selection, which the digest has no picker for', () => {
    const some = summaryLine(options({ scope: 'digest' }, 45, 12), 12, 6);
    expect(some).toBe(summaryLine(options({ scope: 'digest' }, 45, 45), 12, 6));
  });
});

describe('the book text', () => {
  it('follows the marks switch — the fault this line was added for', () => {
    expect(summaryLine(options({ includeMarks: true }), 12, 6)).toBe(t('marks_pdf.summary_book_marks'));
    expect(summaryLine(options({ includeMarks: false }), 12, 6)).toBe(t('marks_pdf.summary_book_plain'));
  });

  it('stops claiming the whole book once chapters are deselected', () => {
    expect(summaryLine(options({ includeMarks: true }, 45, 12), 12, 6)).toBe(
      t('marks_pdf.summary_some_marks', { n: '12', total: '45' })
    );
    expect(summaryLine(options({ includeMarks: false }, 45, 12), 12, 6)).toBe(
      t('marks_pdf.summary_some_plain', { n: '12', total: '45' })
    );
  });

  it('says nothing about marks when the book has none', () => {
    // The switch that would decide it is hidden in this state, and so is the cover sheet. Announcing the absence
    // of something the reader cannot ask for reads as a fault rather than a description.
    expect(summaryLine(options({ includeMarks: true }), 0, 0)).toBe(t('marks_pdf.summary_book'));
    expect(summaryLine(options({ includeMarks: false }), 0, 0)).toBe(t('marks_pdf.summary_book'));
    expect(summaryLine(options({ includeMarks: true }, 45, 12), 0, 0)).toBe(
      t('marks_pdf.summary_some', { n: '12', total: '45' })
    );
  });

  it('counts the whole spine, including chapters with nothing marked in them', () => {
    // The picker chooses from every chapter, so this line has to measure against every chapter — a book where only
    // six chapters hold marks still exports forty-five.
    expect(summaryLine(options({ includeMarks: true }, 45, 45), 12, 6)).toBe(t('marks_pdf.summary_book_marks'));
  });

  it('treats a single deselected chapter as a subset', () => {
    expect(summaryLine(options({ includeMarks: true }, 45, 44), 12, 6)).toBe(
      t('marks_pdf.summary_some_marks', { n: '44', total: '45' })
    );
  });
});

/**
 * Narrowing a DIGEST to some of its chapters — "a PDF of just my notes on chapter 1".
 *
 * The digest's picker offers only the chapters that hold marks, so the list it shows moves as the mark filter
 * does. `digestSelection` is the one rule both the dialog's reporting and the export narrow by, because two
 * rules is how a summary line ends up describing a different file than the one that gets written.
 */
describe('digestSelection', () => {
  const chapter = (key: string, marks: number, included: boolean): ChapterChoice => ({
    key,
    hrefs: [key],
    title: key,
    marks,
    included,
    unlisted: false,
  });
  const digest = (key: string): MarkChapter => ({ key, title: key, entries: [], sections: [] });

  const opts = (rows: ChapterChoice[]): MarksPdfOptions =>
    ({ scope: 'digest', chapters: rows }) as unknown as MarksPdfOptions;

  it('keeps the chapters that are ticked and drops the rest', () => {
    const o = opts([chapter('a', 2, true), chapter('b', 3, false), chapter('c', 1, true)]);
    const kept = digestSelection(o, [digest('a'), digest('b'), digest('c')]);
    expect(kept.map((c) => c.key)).toEqual(['a', 'c']);
  });

  it('KEEPS a chapter the picker never offered', () => {
    // A chapter whose marks carry no placeable href is keyed on its own title and has no row, so it could never
    // have been ticked. Dropping it would lose marks over a control the reader was never shown.
    const o = opts([chapter('a', 2, true)]);
    const kept = digestSelection(o, [digest('a'), digest('Appendix')]);
    expect(kept.map((c) => c.key)).toEqual(['a', 'Appendix']);
  });

  it('still drops an offered chapter that was unticked, even with nothing else ticked', () => {
    const o = opts([chapter('a', 2, false)]);
    expect(digestSelection(o, [digest('a')])).toEqual([]);
  });

  it('leaves the whole document alone — its own picker already narrowed it', () => {
    const o = { ...opts([chapter('a', 2, false)]), scope: 'document' } as MarksPdfOptions;
    expect(digestSelection(o, [digest('a')]).map((c) => c.key)).toEqual(['a']);
  });
});

/**
 * Both numbers in the digest's line can be one, and choosing chapters makes that ordinary rather than a corner: a
 * digest of a single chapter must not read "2 marks and notes across 1 chapters".
 */
describe('the digest summary when a number is one', () => {
  const digestOpts = { scope: 'digest', chapters: [] } as unknown as MarksPdfOptions;

  it('says one chapter rather than "1 chapters"', () => {
    expect(summaryLine(digestOpts, 2, 1)).toBe(t('marks_pdf.summary_one_chapter', { n: '2' }));
    expect(summaryLine(digestOpts, 2, 1)).not.toContain('1 chapters');
  });

  it('says one mark rather than "1 marks and notes"', () => {
    expect(summaryLine(digestOpts, 1, 3)).toBe(t('marks_pdf.summary_one_mark', { chapters: '3' }));
    expect(summaryLine(digestOpts, 1, 3)).not.toContain('1 marks');
  });

  it('says both when both are one', () => {
    expect(summaryLine(digestOpts, 1, 1)).toBe(t('marks_pdf.summary_one_both'));
  });

  it('still counts plainly when neither is', () => {
    expect(summaryLine(digestOpts, 10, 4)).toBe(t('marks_pdf.summary', { n: '10', chapters: '4' }));
  });

  it('says nothing about numbers for a book with no marks', () => {
    expect(summaryLine(digestOpts, 0, 0)).toBe(t('marks_pdf.summary_none'));
  });
});
