import { describe, expect, it } from 'vitest';
import {
  findMatches,
  type MatchCandidate,
  normalizeAuthor,
  normalizeTitle,
  type RecordForMatch,
} from '../library/match';
import { parseRecord } from '../library/record';

const record = (fm: Record<string, unknown>, filePaths: string[] = []): RecordForMatch => {
  const parsed = parseRecord('Library/Titles/r.md', { orbis_note: 'title', title: 'T', ...fm });
  if (!parsed) throw new Error('fixture is not a record');
  return { record: parsed, filePaths };
};

const candidate = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  path: 'Library/epub/Sample-Book.azw3',
  title: 'Sample-Book',
  authors: ['Orbis Tester'],
  isbn: '',
  ...over,
});

describe('normalizeTitle', () => {
  it('folds case, punctuation, diacritics and a leading article', () => {
    expect(normalizeTitle('The Café Book')).toBe('cafe book');
    expect(normalizeTitle('Sample-Book; Or, The Subtitle')).toBe('sample book or the subtitle');
    expect(normalizeTitle('  A   Sample  ')).toBe('sample');
  });

  // Stripping trailing parentheticals would merge eight different books into one.
  it('keeps what distinguishes one book in a series from the next', () => {
    expect(normalizeTitle('Sample Series (Book #3)')).not.toBe(normalizeTitle('Sample Series (Book #4)'));
  });
});

describe('normalizeAuthor', () => {
  // An OPF writes `Orbis Tester`; a Calibre export writes `Tester, Orbis`.
  it('survives both orders catalogs write', () => {
    expect(normalizeAuthor('Tester, Orbis')).toBe(normalizeAuthor('Orbis Tester'));
    expect(normalizeAuthor('Doé, Jane')).toBe(normalizeAuthor('Jane Doe'));
  });

  it('still tells different people apart', () => {
    expect(normalizeAuthor('Orbis Tester')).not.toBe(normalizeAuthor('Orbis Roe'));
  });
});

describe('findMatches', () => {
  // The two-format case `files` exists for, and it costs no metadata at all.
  it('offers a record that links the same name in the same folder', () => {
    const records = [record({ title: 'Sample-Book' }, ['Library/epub/Sample-Book.epub'])];
    const matches = findMatches(candidate(), records);
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toBe('sibling');
  });

  it('does not call a same-named file in another folder a sibling', () => {
    const records = [record({ title: 'Something Else' }, ['Other/Sample-Book.epub'])];
    expect(findMatches(candidate(), records)).toEqual([]);
  });

  it('offers a record with the same ISBN', () => {
    const records = [record({ title: 'Different Spelling', isbn: '9780000000002' })];
    const matches = findMatches(candidate({ isbn: '9780000000002' }), records);
    expect(matches[0]?.reason).toBe('isbn');
  });

  it('offers a record whose title matches and shares an author', () => {
    const records = [record({ title: 'Sample-Book', authors: ['Tester, Orbis'] })];
    expect(findMatches(candidate(), records)[0]?.reason).toBe('title-author');
  });

  // `Collected Poems` is two hundred different books, so a title alone is deliberately not enough.
  it('refuses a title match with no author in common', () => {
    const sameTitle = [record({ title: 'Collected Poems', authors: ['Someone Else'] })];
    expect(findMatches(candidate({ title: 'Collected Poems' }), sameTitle)).toEqual([]);
    const noAuthors = [record({ title: 'Collected Poems' })];
    expect(findMatches(candidate({ title: 'Collected Poems', authors: [] }), noAuthors)).toEqual([]);
  });

  it('ignores a record that already links this very file', () => {
    const records = [record({ title: 'Sample-Book' }, ['Library/epub/Sample-Book.azw3'])];
    expect(findMatches(candidate(), records)).toEqual([]);
  });

  it('ranks a sibling above a title match', () => {
    const records = [
      record({ title: 'Sample-Book', authors: ['Orbis Tester'] }),
      record({ title: 'Whatever' }, ['Library/epub/Sample-Book.epub']),
    ];
    expect(findMatches(candidate(), records).map((m) => m.reason)).toEqual(['sibling', 'title-author']);
  });

  it('offers nothing when nothing matches', () => {
    expect(findMatches(candidate(), [record({ title: 'Unrelated', authors: ['Nobody'] })])).toEqual([]);
    expect(findMatches(candidate(), [])).toEqual([]);
  });
});
