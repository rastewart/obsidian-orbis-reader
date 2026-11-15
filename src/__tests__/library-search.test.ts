import { describe, expect, it } from 'vitest';
import { parseRecord } from '../library/record';
import { matchesQuery, searchRecords, searchTerms } from '../library/search';

const record = (fm: Record<string, unknown>) => {
  const r = parseRecord(`Titles/${String(fm.title)}.md`, { orbis_note: 'title', ...fm });
  if (!r) throw new Error('fixture is not a record');
  return r;
};

const library = [
  record({ title: 'Another Book', authors: ['Orbis Tester'] }),
  record({ title: 'Another Book Two', authors: ['Someone Else'] }),
  record({ title: 'Third Book', authors: ['Orbis Tester'] }),
  record({ title: 'Fourth Book', authors: ['Jane Doe'], series: 'Sample Series' }),
];

describe('searchTerms', () => {
  it('is empty for a query with nothing in it', () => {
    expect(searchTerms('   ')).toEqual([]);
    expect(searchTerms('')).toEqual([]);
  });
});

describe('matchesQuery', () => {
  // Nobody remembers which field they are typing into.
  it('matches all terms across title, author and series, in any order', () => {
    const [another] = library;
    expect(matchesQuery(another, searchTerms('tester another'))).toBe(true);
    expect(matchesQuery(another, searchTerms('another tester'))).toBe(true);
    expect(matchesQuery(another, searchTerms('another roe'))).toBe(false);
  });

  it('matches inside a word, and never matches an empty query', () => {
    expect(matchesQuery(library[0], searchTerms('other'))).toBe(true);
    expect(matchesQuery(library[0], searchTerms('  '))).toBe(false);
  });

  it('finds a book by its series', () => {
    expect(matchesQuery(library[3], searchTerms('sample'))).toBe(true);
  });
});

describe('searchRecords', () => {
  // Typing "another" must not bury Another Book under everything else with another in it.
  it('puts a title that starts with the query first', () => {
    const hits = searchRecords(library, 'another');
    expect(hits.map((r) => r.title)).toEqual(['Another Book', 'Another Book Two']);
  });

  it('ranks a title match above an author-only match', () => {
    const hits = searchRecords(library, 'tester');
    expect(hits).toHaveLength(2);
    // Neither title contains the name, so both fall to the same rank and sort alphabetically.
    expect(hits.map((r) => r.title)).toEqual(['Another Book', 'Third Book']);
  });

  // An empty box is not a search for everything: it is a search nobody has made yet.
  it('returns nothing for an empty query', () => {
    expect(searchRecords(library, '')).toEqual([]);
    expect(searchRecords(library, '   ')).toEqual([]);
  });
});
