import { describe, expect, it } from 'vitest';
import { entryAt, excerptAround, firstResultSettled, sectionIndexFromCfi } from '../reader/search-utils';

// A search with book text in it finds saved items at once and book text a section at a time. Going to the first
// result before the walk could still find one ahead of it landed on a marked passage in the first chapter, when a
// book-text match came earlier on the same page: the reader arrived at 2 / N.
describe('firstResultSettled', () => {
  const inSection = (n: number) => ({ cfi: `epubcfi(/6/${2 * (n + 1)}!/4/2)` });

  it('holds a saved item back until the walk has searched its section', () => {
    // A marked passage in section 3, nothing else found yet: sections 0 to 2 could still hold a match, and so
    // could section 3 itself, ahead of the passage.
    expect(firstResultSettled([inSection(3)], -1)).toBe(false);
    expect(firstResultSettled([inSection(3)], 2)).toBe(false);
    expect(firstResultSettled([inSection(3)], 3)).toBe(true);
  });

  it('settles on a book-text match as soon as its own section is done', () => {
    // Section 0 found a match ahead of the passage in section 3: nothing can come before section 0's.
    expect(firstResultSettled([inSection(0), inSection(3)], 0)).toBe(true);
  });

  it('waits while there is nothing to go to', () => {
    expect(firstResultSettled([], 5)).toBe(false);
  });

  it('does not hold the search back for a result it cannot place', () => {
    expect(firstResultSettled([{ cfi: 'not-a-cfi' }], -1)).toBe(true);
  });
});

describe('sectionIndexFromCfi', () => {
  it('maps /6/N to floor(N/2) - 1', () => {
    expect(sectionIndexFromCfi('epubcfi(/6/2!/4)')).toBe(0);
    expect(sectionIndexFromCfi('epubcfi(/6/4!/2)')).toBe(1);
    expect(sectionIndexFromCfi('epubcfi(/6/16!/4/2)')).toBe(7);
    expect(sectionIndexFromCfi('/6/14')).toBe(6);
  });

  it('uses the first /6/N step and ignores later path segments', () => {
    expect(sectionIndexFromCfi('epubcfi(/6/8!/4/10/2,/1:0,/1:5)')).toBe(3);
  });

  it('returns null when there is no /6/N step', () => {
    expect(sectionIndexFromCfi('epubcfi(/4/2)')).toBeNull();
    expect(sectionIndexFromCfi('nonsense')).toBeNull();
    expect(sectionIndexFromCfi('')).toBeNull();
  });
});

// One file, several chapters — the book's title page first, then a chapter per anchor.
describe('entryAt', () => {
  const doc = new DOMParser().parseFromString(
    '<html><body><h1>Title</h1><p>front kettle</p><h2 id="c1">One</h2><p>first kettle</p><h2 id="c2">Two</h2><p>second kettle</p></body></html>',
    'text/html'
  );
  const entries = [
    { href: 'text.xhtml', label: 'TITLE', fragment: '' },
    { href: 'text.xhtml#c1', label: 'ONE', fragment: 'c1' },
    { href: 'text.xhtml#c2', label: 'TWO', fragment: 'c2' },
  ];
  const textOf = (i: number) => doc.querySelectorAll('p')[i].firstChild as Node;

  it('heads each match with the entry it falls under, not the file’s first', () => {
    expect(entryAt(doc, textOf(0), 6, entries)?.label).toBe('TITLE');
    expect(entryAt(doc, textOf(1), 6, entries)?.label).toBe('ONE');
    expect(entryAt(doc, textOf(2), 7, entries)?.label).toBe('TWO');
  });

  it('answers nothing before the first anchor when the file has no entry of its own', () => {
    expect(entryAt(doc, textOf(0), 6, entries.slice(1))).toBeNull();
  });
});

// The Search tab shows one line per row, so the match has to come early in it.
describe('excerptAround', () => {
  const text = `${'a'.repeat(60)}kettle${'b'.repeat(200)}`;

  it('starts fifteen characters before the match, marking the cut', () => {
    const e = excerptAround(text, 60, 6);
    expect(e.startsWith(`…${'a'.repeat(15)}kettle`)).toBe(true);
    expect(e.endsWith('…')).toBe(true);
  });

  it('marks no cut at a start or end it reaches', () => {
    expect(excerptAround('kettle on', 0, 6)).toBe('kettle on');
  });
});
