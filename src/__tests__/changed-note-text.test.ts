import { describe, expect, it } from 'vitest';
import type { NoteBook } from '../book-origin';
import { annotationCount, changedNoteText, versionLabel } from '../ChangedNoteModal';

/**
 * The words of the one question *Read in Orbis Reader* asks.
 *
 * **Here because of the singular.** The design's own note on the count is that "12 annotations" and "1
 * annotation" are different decisions and that a book with exactly one is the case nobody tests — so it is
 * tested, along with the shape that replaces both when several versions are annotated.
 */
const book = (annotations: number, path = 'Clippings/Sample Book review.epub', version = 1): NoteBook => ({
  path,
  origin: { note: 'Clippings/Sample Book review.md', hash: 'h', created: '2026-09-20T10:00:00.000Z', feature: 'x' },
  annotations,
  version,
});

describe('annotationCount', () => {
  it('has a real singular, never "annotation(s)"', () => {
    expect(annotationCount(1)).toBe('1 annotation');
    expect(annotationCount(12)).toBe('12 annotations');
  });

  it('is plural for none, which is how English works', () => {
    expect(annotationCount(0)).toBe('0 annotations');
  });
});

describe('versionLabel', () => {
  /** The row has to read like the file list, or choosing between versions means matching a dialog against a
   *  folder by arithmetic — which is why the names carry no date. */
  it('names the version the lookup recorded', () => {
    expect(versionLabel(book(3, 'Clippings/Sample Book review.epub', 1))).toBe('Version 1');
    expect(versionLabel(book(3, 'Clippings/Sample Book review - v002.epub', 2))).toBe('Version 2');
    expect(versionLabel(book(3, 'Clippings/Sample Book review - v017.epub', 17))).toBe('Version 17');
  });
});

describe('changedNoteText', () => {
  /**
   * **The body carries no number, so it needs no plural forms.** The count sits on each row instead, where it is
   * per book rather than summarized — so one wording covers one annotated book and five.
   */
  it('says the same thing however many books there are', () => {
    const one = changedNoteText([book(12)]);
    const several = changedNoteText([book(3), book(9, 'Clippings/Sample Book review - v002.epub')]);
    expect(one.body).toBe(several.body);
    expect(one.kept).toBe(several.kept);
    expect(one.body).toContain("note's current text");
  });

  it('carries no count in prose, so there is no singular to get wrong', () => {
    for (const n of [1, 2, 12]) {
      const { body, kept } = changedNoteText([book(n)]);
      expect(body).not.toMatch(/\d/);
      expect(body).not.toContain('(s)');
      expect(kept).not.toMatch(/\d/);
    }
  });

  it('keeps the title honest about how many it is talking about', () => {
    expect(changedNoteText([book(3)]).title).toBe('This note changed after the book was created');
    expect(changedNoteText([book(3), book(1, 'b.epub')]).title).toBe(
      'This note changed after these versions were created'
    );
  });

  /**
   * **One word for one thing.** The body defines the term once, *a version of the book*, and every other line
   * inherits it, so the dialog never spends several words on two concepts.
   */
  it('does not call them books once it has called them versions', () => {
    const { body, kept } = changedNoteText([book(3)]);
    expect(body).toContain('A new version of the book');
    expect(kept).toContain('versions');
    expect(kept).not.toContain('book');
  });

  /**
   * Every shape ends on the same promise, and it is the last thing read before the buttons: nothing is destroyed
   * on either path. A wording change that dropped it would be the one that matters.
   */
  it('always says the annotated books survive', () => {
    for (const books of [[book(1)], [book(12)], [book(1), book(2, 'b.epub')]]) {
      expect(changedNoteText(books).kept).toContain('kept either way');
    }
  });
});
