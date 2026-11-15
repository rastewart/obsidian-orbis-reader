import { describe, expect, it } from 'vitest';
import { type ChapterPart, chapterStep, chapterStepFromPage, hasOneChapter } from '../book-chapters';

/** A part with only what the step reads: its chapter, and the file it is in. */
function part(index: number, chapterHref: string, sectionIndex: number): ChapterPart {
  return {
    index,
    chapterHref,
    hrefs: [chapterHref],
    part: 1,
    partCount: 1,
    sectionIndex,
    anchor: null,
    baseLabel: chapterHref,
    label: chapterHref,
  };
}

/** Three chapters to a file, as a sample book packs them: the shape that made stepping the spine skip chapters. */
const packed = [
  part(0, 'text-0.xhtml#c1', 0),
  part(1, 'text-0.xhtml#c2', 0),
  part(2, 'text-0.xhtml#c3', 0),
  part(3, 'text-1.xhtml#c4', 1),
  part(4, 'text-1.xhtml#c5', 1),
];

describe('chapterStep', () => {
  it('steps one chapter at a time when a file holds several', () => {
    expect(chapterStep(packed, 0, 1)).toBe(1);
    expect(chapterStep(packed, 1, 1)).toBe(2);
    expect(chapterStep(packed, 2, 1)).toBe(3);
    expect(chapterStep(packed, 3, -1)).toBe(2);
    expect(chapterStep(packed, 2, -1)).toBe(1);
  });

  it('does nothing past either end', () => {
    expect(chapterStep(packed, 4, 1)).toBeNull();
    expect(chapterStep(packed, 0, -1)).toBeNull();
    expect(chapterStep(packed, -1, 1)).toBeNull();
  });

  /** A long chapter listening divides into parts is still one chapter: Next skips its other parts. */
  const divided = [part(0, 'a', 0), part(1, 'b', 1), part(2, 'b', 1), part(3, 'b', 2), part(4, 'c', 3)];

  it('skips the rest of a chapter divided into parts', () => {
    expect(chapterStep(divided, 1, 1)).toBe(4);
    expect(chapterStep(divided, 2, 1)).toBe(4);
  });

  it('goes back to the start of the previous chapter from anywhere in this one', () => {
    expect(chapterStep(divided, 4, -1)).toBe(1);
    expect(chapterStep(divided, 3, -1)).toBe(0);
    expect(chapterStep(divided, 1, -1)).toBe(0);
  });
});

/**
 * A page showing the end of one chapter and the start of the next — where Next chapter lands whenever a chapter starts
 * part-way down a page. The page's TOP is still c1; foliate's page entry, its END, is c2.
 */
describe('chapterStepFromPage', () => {
  it('moves on from a page where the next chapter has already begun', () => {
    // Judged from the top (c1), Next was c2 — the page already on screen, so every press came back here.
    expect(chapterStep(packed, 0, 1)).toBe(1);
    expect(chapterStepFromPage(packed, 0, 'text-0.xhtml#c2', 1)).toBe(2);
  });

  it('goes back to the chapter that ends on the page', () => {
    expect(chapterStepFromPage(packed, 0, 'text-0.xhtml#c2', -1)).toBe(0);
  });

  it('reads a page wholly inside one chapter as before', () => {
    expect(chapterStepFromPage(packed, 1, 'text-1.xhtml#c4', 1)).toBe(4);
    expect(chapterStepFromPage(packed, 1, 'text-1.xhtml#c4', -1)).toBe(2);
  });

  it('falls back to the section when the page has no contents entry yet', () => {
    expect(chapterStepFromPage(packed, 1, null, 1)).toBe(4);
  });
});

describe('hasOneChapter', () => {
  it('is true for a book whose sections all belong to one chapter, and false otherwise', () => {
    expect(hasOneChapter([part(0, 'book', 0), part(1, 'book', 1)])).toBe(true);
    expect(hasOneChapter([])).toBe(true);
    expect(hasOneChapter(packed)).toBe(false);
  });
});
