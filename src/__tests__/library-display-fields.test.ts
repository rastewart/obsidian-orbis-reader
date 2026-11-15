import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_FIELDS,
  displayableFields,
  fieldCells,
  fieldHeading,
  metaLineFor,
  sortedByField,
} from '../library/display-fields';
import { setLibraryFields } from '../library/fields';
import { type LibraryRecord, parseRecord } from '../library/record';

const rec = (fm: Record<string, unknown>): LibraryRecord => {
  const title = typeof fm.title === 'string' ? fm.title : 'A Title';
  const parsed = parseRecord(`Library/Titles/${title}.md`, { orbis_note: 'title', title, ...fm });
  if (!parsed) throw new Error('fixture is not a record');
  return parsed;
};

const noNames = () => undefined;

beforeEach(() => setLibraryFields([]));

describe('displayableFields', () => {
  // The row's own heading, and a table's first column. Offering it would be offering a duplicate of the label.
  it('never offers title', () => {
    expect(displayableFields()).not.toContain('title');
    expect(displayableFields()).toContain('authors');
  });

  // A table of titles and their EPUB paths is a reasonable thing to want; refusing it because the value is a
  // link would be an artificial line.
  it('offers cover and files', () => {
    expect(displayableFields()).toEqual(expect.arrayContaining(['cover', 'files']));
  });

  it('offers the reader’s own fields after ours, without repeating one', () => {
    expect(displayableFields(['shelf', 'authors'])).toContain('shelf');
    expect(displayableFields(['shelf', 'authors']).filter((k) => k === 'authors')).toHaveLength(1);
  });
});

describe('fieldCells', () => {
  it('reads a list field as its values', () => {
    expect(fieldCells(rec({ authors: ['Doe, Jane', 'Someone Else'] }), 'authors')).toEqual([
      'Doe, Jane',
      'Someone Else',
    ]);
  });

  // Two frontmatter keys, one fact: a row saying "Saga" without "#2" is missing the half that says where you are.
  it('carries the series number with the series', () => {
    expect(fieldCells(rec({ series: 'Saga', series_index: 2 }), 'series')).toEqual(['Saga #2']);
    expect(fieldCells(rec({ series: 'Saga' }), 'series')).toEqual(['Saga']);
  });

  // A bare `4` in a column of numbers is a rating, a page count or a year.
  it('says what a rating is out of', () => {
    expect(fieldCells(rec({ rating: 4 }), 'rating')).toEqual(['4/5']);
    expect(fieldCells(rec({ title: 'x' }), 'rating')).toEqual([]);
  });

  // The same naming the group headings use, so a status column and a status heading cannot disagree.
  it('names a value as the reader named it', () => {
    const values = [{ value: 'read', label: 'Finished reading' }];
    expect(fieldCells(rec({ reading_status: 'read' }), 'reading_status', values)).toEqual(['Finished reading']);
    expect(fieldCells(rec({ reading_status: 'read' }), 'reading_status')).toEqual(['read']);
  });

  it('says nothing for a field the note lacks', () => {
    expect(fieldCells(rec({ title: 'x' }), 'publisher')).toEqual([]);
  });

  // A field of the reader's own, read through whatever keys they said mean it.
  it('reads a custom field through its aliases', () => {
    setLibraryFields([{ key: 'shelf', keys: ['shelf', 'bookcase'] }]);
    expect(fieldCells(rec({ bookcase: 'Study' }), 'shelf')).toEqual(['Study']);
  });
});

describe('metaLineFor', () => {
  it('falls back to the author and the series', () => {
    const line = metaLineFor(rec({ authors: ['Doe'], series: 'Saga', series_index: 1 }), undefined, noNames);
    expect(line).toBe('Doe · Saga #1');
    expect(DEFAULT_DISPLAY_FIELDS).toEqual(['authors', 'series']);
  });

  it('shows the chosen fields, in the order chosen', () => {
    const record = rec({ authors: ['Doe'], publisher: 'Sample Press', language: 'en' });
    expect(metaLineFor(record, ['language', 'publisher'], noNames)).toBe('en · Sample Press');
  });

  // Skipped, not spaced over: a row is never a trail of separators describing the widget's configuration.
  it('skips a field this title has nothing for', () => {
    const record = rec({ authors: ['Doe'] });
    expect(metaLineFor(record, ['publisher', 'authors', 'isbn'], noNames)).toBe('Doe');
  });

  // A legitimate thing to ask for on a shelf of covers, and different from never having chosen.
  it('shows nothing when nothing was chosen', () => {
    expect(metaLineFor(rec({ authors: ['Doe'] }), [], noNames)).toBe('');
  });
});

// A field's name is shown in one place — a table column heading — and a table has to be legible before anyone
// configures anything, which is what the fallbacks are for.
describe('fieldHeading', () => {
  it('takes the reader’s caption when there is one', () => {
    expect(fieldHeading('publication_date', 'Published', 'Publication date')).toBe('Published');
  });

  it('falls back to the plugin’s own word for a named key', () => {
    expect(fieldHeading('authors', '', 'Author')).toBe('Author');
  });

  it('falls back to the key, humanised', () => {
    expect(fieldHeading('publication_date')).toBe('Publication date');
    expect(fieldHeading('series_index')).toBe('Series index');
    expect(fieldHeading('publisher')).toBe('Publisher');
  });

  // Whitespace is not a caption. A box someone opened, spaced and closed should read as untouched.
  it('ignores a caption of nothing but space', () => {
    expect(fieldHeading('publisher', '   ')).toBe('Publisher');
  });
});

// Tapping a heading orders by what the COLUMN shows, not by the raw frontmatter — a status column sorts by the
// name it displays, and a series sorts the way "Saga #2" reads.
describe('sortedByField', () => {
  const cells = (record: LibraryRecord, key: string): string[] => fieldCells(record, key);
  const titles = (list: LibraryRecord[]): string[] => list.map((r) => r.title);

  it('orders by a field, and reverses', () => {
    const records = [rec({ title: 'B', publisher: 'Zed' }), rec({ title: 'A', publisher: 'Acme' })];
    expect(titles(sortedByField(records, 'publisher', false, cells))).toEqual(['A', 'B']);
    expect(titles(sortedByField(records, 'publisher', true, cells))).toEqual(['B', 'A']);
  });

  // #2 before #10. A plain string comparison puts 10 first, which is wrong in the one place a series number is
  // read at all.
  it('compares numbers inside the text as numbers', () => {
    const records = [
      rec({ title: 'ten', series: 'Saga', series_index: 10 }),
      rec({ title: 'two', series: 'Saga', series_index: 2 }),
    ];
    expect(titles(sortedByField(records, 'series', false, cells))).toEqual(['two', 'ten']);
  });

  // A title with nothing to say about this column is not the top of the list, and flipping the arrow must not
  // make it so.
  it('keeps empty cells last in both directions', () => {
    const records = [rec({ title: 'none' }), rec({ title: 'has', publisher: 'Acme' })];
    expect(titles(sortedByField(records, 'publisher', false, cells))).toEqual(['has', 'none']);
    expect(titles(sortedByField(records, 'publisher', true, cells))).toEqual(['has', 'none']);
  });

  it('sorts the title column by the title itself', () => {
    const records = [rec({ title: 'Beta' }), rec({ title: 'alpha' })];
    expect(titles(sortedByField(records, 'title', false, cells))).toEqual(['alpha', 'Beta']);
  });
});

// The leading column of a table is the row's identity and the one column whose text does not come from a field —
// a title for a book, the passage for a reading record. Sorting on it has to read that same text.
describe('sortedByField with a species of its own', () => {
  const record = (excerpt: string, chapter: string): { excerpt: string; chapter: string } => ({ excerpt, chapter });
  const cells = (r: { excerpt: string; chapter: string }, key: string): string[] =>
    key === 'chapter' ? [r.chapter] : [];
  const lead = { key: 'excerpt', text: (r: { excerpt: string; chapter: string }) => r.excerpt };

  it('sorts on the leading column through the text it shows', () => {
    const list = [record('Zeta', 'II'), record('Alpha', 'I')];
    expect(sortedByField(list, 'excerpt', false, cells, lead).map((r) => r.excerpt)).toEqual(['Alpha', 'Zeta']);
    expect(sortedByField(list, 'excerpt', true, cells, lead).map((r) => r.excerpt)).toEqual(['Zeta', 'Alpha']);
  });

  it('sorts on any other column through its cells', () => {
    const list = [record('Zeta', 'II'), record('Alpha', 'I')];
    expect(sortedByField(list, 'chapter', false, cells, lead).map((r) => r.chapter)).toEqual(['I', 'II']);
  });
});
