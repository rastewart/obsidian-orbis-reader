import { describe, expect, it } from 'vitest';
import type { ReadingRecord } from '../library/record';
import {
  clampToWords,
  DEFAULT_RECORD_FIELDS,
  recordCells,
  recordHeadline,
  recordMetaLine,
} from '../library/record-row';

const record = (over: Partial<ReadingRecord> = {}): ReadingRecord => ({
  notePath: 'Records/highlight — ferry — 8f2c4a.md',
  kind: 'passage selection',
  excerpt: 'The ferry will not wait for anyone',
  mark: 'Important',
  markBadge: '⭐',
  book: '[[Books/Sample Book.epub]]',
  bookTitle: 'Sample Book',
  author: 'Orbis Tester',
  chapter: 'CHAPTER I.',
  chapterIndex: 3,
  loc: '12',
  cfi: 'epubcfi(/6/4!/4/2/2,/1:0,/1:37)',
  created: '2026-08-16',
  noteText: '',
  cover: null,
  orphaned: false,
  tags: ['reading-record'],
  raw: {},
  ...over,
});

const labels = { location: (loc: string) => `Location ${loc}`, untitled: 'Untitled record' };

describe('recordHeadline', () => {
  it('leads with the passage', () => {
    expect(recordHeadline(record(), labels).text).toBe('The ferry will not wait for anyone');
  });

  // A standalone note has no passage — only what you wrote — and that is what identifies it.
  it('falls back to your own words', () => {
    expect(recordHeadline(record({ excerpt: '', noteText: 'Compare with Another Book' }), labels).text).toBe(
      'Compare with Another Book'
    );
  });

  // **A bookmark is a place, not an annotation about text**, and an export writes no `excerpt` for one. Both parts
  // of where it is, because three bookmarks in one chapter reading "CHAPTER I." three times is the same as having
  // no lead line at all.
  it('leads a bookmark with where it is, chapter and location', () => {
    const bookmark = record({ kind: 'bookmark', excerpt: '', mark: '', noteText: '' });
    expect(recordHeadline(bookmark, labels).text).toBe('CHAPTER I. · Location 12');
    expect(recordHeadline({ ...bookmark, loc: '' }, labels).text).toBe('CHAPTER I.');
    expect(recordHeadline({ ...bookmark, chapter: '' }, labels).text).toBe('Location 12');
    expect(recordHeadline({ ...bookmark, chapter: '', loc: '' }, labels).text).toBe('Sample Book');
    expect(recordHeadline({ ...bookmark, chapter: '', loc: '', bookTitle: '' }, labels).text).toBe('Untitled record');
  });

  // Which fields it used, so the line beneath does not print them again.
  it('says which fields it was built from', () => {
    expect(recordHeadline(record(), labels).keys).toEqual(['excerpt']);
    const bookmark = record({ kind: 'bookmark', excerpt: '', noteText: '' });
    expect(recordHeadline(bookmark, labels).keys).toEqual(['chapter', 'loc']);
    expect(recordHeadline({ ...bookmark, chapter: '', loc: '', bookTitle: '' }, labels).keys).toEqual([]);
  });

  it('ignores a field that holds only whitespace', () => {
    expect(recordHeadline(record({ excerpt: '   ', noteText: 'Mine' }), labels).text).toBe('Mine');
  });
});

describe('recordCells', () => {
  it('reads a record’s own fields', () => {
    expect(recordCells(record(), 'book_title')).toEqual(['Sample Book']);
    expect(recordCells(record(), 'chapter')).toEqual(['CHAPTER I.']);
    expect(recordCells(record(), 'mark')).toEqual(['Important']);
    expect(recordCells(record(), 'kind')).toEqual(['passage selection']);
    expect(recordCells(record(), 'created')).toEqual(['2026-08-16']);
    expect(recordCells(record(), 'loc')).toEqual(['12']);
  });

  it('says nothing rather than something empty', () => {
    expect(recordCells(record({ mark: '' }), 'mark')).toEqual([]);
    expect(recordCells(record({ noteText: '  ' }), 'note_text')).toEqual([]);
  });

  // Facts about the file rather than about the passage — the two derived keys a record can be arranged by.
  it('answers for the folder and the tags', () => {
    expect(recordCells(record(), 'file.folder')).toEqual(['Records']);
    expect(recordCells(record(), 'file.tag')).toEqual(['reading-record']);
  });

  // A reader's own field on a record reads exactly as it does on a title: through the frontmatter.
  it('reads a field nobody built in', () => {
    expect(recordCells(record({ raw: { shelf: 'Study' } }), 'shelf')).toEqual(['Study']);
    expect(recordCells(record(), 'shelf')).toEqual([]);
  });
});

describe('recordMetaLine', () => {
  it('is the book and the chapter until a widget says otherwise', () => {
    expect(DEFAULT_RECORD_FIELDS).toEqual(['book_title', 'chapter']);
    expect(recordMetaLine(record(), undefined, ' · ')).toBe('Sample Book · CHAPTER I.');
  });

  it('is the widget’s fields, in its order', () => {
    expect(recordMetaLine(record(), ['mark', 'created'], ' · ')).toBe('Important · 2026-08-16');
    expect(recordMetaLine(record(), ['created', 'mark'], ' · ')).toBe('2026-08-16 · Important');
  });

  // A widget that chose no fields shows none — which is not the same as never having chosen.
  it('is empty when the widget chose nothing', () => {
    expect(recordMetaLine(record(), [], ' · ')).toBe('');
  });

  it('leaves out what this record does not say', () => {
    expect(recordMetaLine(record({ chapter: '' }), undefined, ' · ')).toBe('Sample Book');
  });

  // A bookmark's row leads with its chapter, so showing `chapter` beneath would print the same words twice — once
  // as the row's identity and once as a detail of itself.
  it('never repeats what the headline already said', () => {
    const bookmark = record({ kind: 'bookmark', excerpt: '', noteText: '' });
    const headline = recordHeadline(bookmark, labels);
    expect(recordMetaLine(bookmark, undefined, ' · ', headline)).toBe('Sample Book');
  });

  it('keeps a field the headline did not use', () => {
    const headline = recordHeadline(record(), labels);
    expect(recordMetaLine(record(), undefined, ' · ', headline)).toBe('Sample Book · CHAPTER I.');
  });

  // **Matching words are not one fact.** An annotation on a chapter HEADING has the heading as its passage, so the
  // row reads "CHAPTER I." over "· CHAPTER I." — what was selected, and which chapter it is in. Both are true and
  // the row shows both; dropping the second would make it say less than it knows.
  it('keeps a chapter that reads the same as the passage', () => {
    const onHeading = record({ excerpt: 'CHAPTER I.' });
    const headline = recordHeadline(onHeading, labels);
    expect(recordMetaLine(onHeading, undefined, ' · ', headline)).toBe('Sample Book · CHAPTER I.');
  });
});

// **The CSS cannot cut at a word.** `-webkit-line-clamp` and `text-overflow: ellipsis` both end the line at
// whichever character overflows — "coming into view ea…" — which is what a reader notices immediately.
describe('clampToWords', () => {
  const sentence = 'The keeper of the ferry landing was at another pier, but she often came back across the water';

  it('leaves a passage that already fits alone', () => {
    expect(clampToWords('Short enough', 40)).toBe('Short enough');
    expect(clampToWords('Short enough', 12)).toBe('Short enough');
  });

  it('cuts at a word and marks the cut', () => {
    const out = clampToWords(sentence, 40);
    expect(out).toBe('The keeper of the ferry landing was at…');
    expect(out.length).toBeLessThanOrEqual(41);
  });

  // Trailing punctuation before an ellipsis reads as a typo: "in hesitation,…".
  it('does not leave punctuation hanging before the ellipsis', () => {
    expect(clampToWords('was at another pier, but she often', 22)).toBe('was at another pier…');
  });

  it('collapses the whitespace an export may have left in', () => {
    expect(clampToWords('  two   words  ', 40)).toBe('two words');
  });

  // A single very long word — a URL, a German compound — would otherwise clamp to nothing at all.
  it('falls back to a hard cut rather than to an empty line', () => {
    const word = 'a'.repeat(60);
    expect(clampToWords(word, 20)).toBe(`${'a'.repeat(20)}…`);
  });
});
