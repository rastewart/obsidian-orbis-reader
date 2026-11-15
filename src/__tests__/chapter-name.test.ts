import { describe, expect, it } from 'vitest';
import { chapterName, chapterNoteTitle } from '../chapter-name';

const numbered = (n: number) => `Section ${n}`;

describe('chapterName', () => {
  it('believes the contents entry that resolved to this section over everything else', () => {
    const name = chapterName(
      { tocLabel: 'PART II – CHAPTER III', heading: 'CHAPTER III', basenameLabel: 'CHAPTER III' },
      6,
      numbered
    );
    expect(name).toBe('PART II – CHAPTER III');
  });

  // The MOBI/AZW3/FB2 case: their section ids are numbers, so nothing href-based resolves and the section's own
  // heading is the only real evidence there is.
  it('reads the section its own heading when no contents entry resolves to it', () => {
    expect(chapterName({ heading: 'CHAPTER 1. The Ferry.' }, 5, numbered)).toBe('CHAPTER 1. The Ferry.');
  });

  // A heading comes from the section; a basename match is inferred from a filename two sections could share.
  it('prefers the section heading to a basename match', () => {
    expect(chapterName({ heading: 'PREFACE.', basenameLabel: 'FOREWORD.' }, 3, numbered)).toBe('PREFACE.');
  });

  it('falls back to a basename match when the section offers no heading', () => {
    expect(chapterName({ heading: '', basenameLabel: 'INTRODUCTION.' }, 4, numbered)).toBe('INTRODUCTION.');
  });

  /**
   * The failure this module exists to prevent.
   *
   * A proportional guess (`flatToc[floor(sIdx * flatToc.length / sectionCount)]`) always produces a name, and names
   * a section after another chapter. Nothing may be invented here: with no evidence the answer is the section's
   * number.
   */
  it('numbers a section it knows nothing about, rather than naming it after another one', () => {
    expect(chapterName({}, 0, numbered)).toBe('Section 1');
    expect(chapterName({}, 42, numbered)).toBe('Section 43');
  });

  it('treats a blank or whitespace candidate as no candidate', () => {
    expect(chapterName({ tocLabel: '   ', heading: '\n', basenameLabel: '' }, 7, numbered)).toBe('Section 8');
    expect(chapterName({ tocLabel: ' ', heading: 'Contents' }, 2, numbered)).toBe('Contents');
  });

  it('trims a candidate it accepts', () => {
    expect(chapterName({ heading: '  BOOK I. WREN PELLOW.  ' }, 5, numbered)).toBe('BOOK I. WREN PELLOW.');
  });
});

/**
 * The `title` on a note holding one chapter.
 *
 * **Book and chapter together.** The book's title alone makes every chapter note of a novel look identical anywhere
 * a title shows; the chapter alone reads the same in every book's set. One definition serves both Save as Markdown
 * and Generate notes.
 */
describe('chapterNoteTitle', () => {
  it('puts the book first and the chapter after it', () => {
    expect(chapterNoteTitle('Sample Book', 'PART I \u2013 CHAPTER V')).toBe('Sample Book: PART I \u2013 CHAPTER V');
  });

  /** Chapter names are full of en dashes, so a dash between book and chapter would be a third in a row. */
  it('separates them with a colon, which nothing in a chapter name is using', () => {
    expect(chapterNoteTitle('Another Book', 'PART I \u2013 CHAPTER V')).not.toMatch(/Another Book [-\u2013\u2014]/);
  });

  it('does not repeat the book when the chapter already names it', () => {
    // A title page, and a Project Gutenberg header — both already say which book.
    expect(chapterNoteTitle('Sample Book', 'SAMPLE BOOK')).toBe('SAMPLE BOOK');
    expect(chapterNoteTitle('Sample Book', 'The Project Gutenberg eBook of Sample Book')).toBe(
      'The Project Gutenberg eBook of Sample Book'
    );
  });

  it('gives the book alone for an unnamed chapter, not a title ending in a colon', () => {
    expect(chapterNoteTitle('Sample Book', '')).toBe('Sample Book');
    expect(chapterNoteTitle('Sample Book', '   ')).toBe('Sample Book');
  });

  it('gives the chapter alone for a book with no title', () => {
    expect(chapterNoteTitle('', 'The Ferry')).toBe('The Ferry');
  });

  it('trims both halves', () => {
    expect(chapterNoteTitle('  Third Book  ', '  The Ferry  ')).toBe('Third Book: The Ferry');
  });
});
