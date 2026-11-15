import { describe, expect, it } from 'vitest';
import { buildCatalog, type CatalogCandidate } from '../library/catalog';
import { type CollectionRule, type LibraryCollection, RULE_FIELD_FOLDER, RULE_FIELD_TAG } from '../settings';

/** A collection of one `all` set, which is what almost every collection is. */
const collection = (over: Partial<LibraryCollection> & { rules?: CollectionRule[] }): LibraryCollection => {
  const { rules, ...rest } = over;
  return {
    id: 's',
    name: 'Collection',
    ruleSets: rules ? [{ match: 'all', rules }] : [],
    enabled: true,
    ...rest,
  };
};

const inFolder = (value: string): CollectionRule => ({ field: RULE_FIELD_FOLDER, op: 'under', value });
const hasTag = (value: string): CollectionRule => ({ field: RULE_FIELD_TAG, op: 'is', value });

const note = (path: string, title: string | null, tags: string[] = []): CatalogCandidate => ({
  path,
  frontmatter: title === null ? null : { orbis_note: 'title', title },
  tags,
});

describe('buildCatalog', () => {
  it('puts records on the collections that claim them', () => {
    const collections = [collection({ id: 'books', name: 'Books', rules: [inFolder('Books')] })];
    const catalog = buildCatalog(collections, [note('Books/a.md', 'Alpha'), note('Other/b.md', 'Beta')]);
    expect(catalog.groups).toHaveLength(1);
    expect(catalog.groups[0].records.map((r) => r.title)).toEqual(['Alpha']);
    expect(catalog.totalRecords).toBe(1);
  });

  it('skips notes that are not records', () => {
    const catalog = buildCatalog(
      [collection({ rules: [inFolder('Books')] })],
      [note('Books/README.md', null), note('Books/index.md', ''), note('Books/a.md', 'Alpha')]
    );
    expect(catalog.groups[0].records.map((r) => r.title)).toEqual(['Alpha']);
  });

  // Collections are sources, not folders. Hiding a book from the second collection that gathers it would make that collection
  // lie about what it contains.
  it('lists one note on every collection that matches, counting it once', () => {
    const collections = [
      collection({ id: 'a', rules: [inFolder('Books')] }),
      collection({ id: 'b', rules: [hasTag('scifi')] }),
    ];
    const catalog = buildCatalog(collections, [note('Books/a.md', 'Alpha', ['scifi'])]);
    expect(catalog.groups[0].records).toHaveLength(1);
    expect(catalog.groups[1].records).toHaveLength(1);
    expect(catalog.totalRecords).toBe(1);
  });

  // Every collection gets a group, with no notion of being switched off: a collection is a definition, and whether
  // one APPEARS is a question about the widget showing it. Filtering here would make a widget render an empty
  // heading for a collection that is merely off, which reads as "empty" rather than "off".
  it('builds a group for every collection, leaving display to the widgets', () => {
    const collections = [
      collection({ id: 'a', rules: [inFolder('Books')] }),
      collection({ id: 'b', rules: [inFolder('Books')] }),
    ];
    const catalog = buildCatalog(collections, [note('Books/a.md', 'Alpha')]);
    expect(catalog.groups.map((g) => g.collection.id)).toEqual(['a', 'b']);
  });

  it('orders by title ignoring a leading article, tie-breaking on path', () => {
    const catalog = buildCatalog(
      [collection({ rules: [inFolder('B')] })],
      [
        note('B/3.md', 'The Third Book'),
        note('B/1.md', 'Another Book'),
        note('B/2.md', 'A Sample Book'),
        note('B/0.md', 'Another Book'),
      ]
    );
    expect(catalog.groups[0].records.map((r) => r.notePath)).toEqual(['B/0.md', 'B/1.md', 'B/2.md', 'B/3.md']);
  });

  it('has no groups when no collections are configured', () => {
    const catalog = buildCatalog([], [note('Books/a.md', 'Alpha')]);
    expect(catalog.groups).toEqual([]);
    expect(catalog.totalRecords).toBe(0);
  });
});

// The second species on the same pass. Both live in `Books/` and both carry tags, so the conditions a reader writes
// routinely match each other's notes — which is why the split is by species FIRST and the conditions second.
describe('buildCatalog with both species', () => {
  const record = (path: string, over: Record<string, unknown> = {}): CatalogCandidate => ({
    path,
    frontmatter: {
      orbis_note: 'reading_record',
      kind: 'highlight',
      book_title: 'Alpha',
      excerpt: 'a passage',
      cfi_sort: '0002',
      ...over,
    },
    tags: [],
  });

  it('keeps each collection to the species it gathers', () => {
    const catalog = buildCatalog(
      [
        collection({ id: 'titles', rules: [inFolder('Books')] }),
        collection({ id: 'marks', species: 'reading_record', rules: [inFolder('Books')] }),
      ],
      [note('Books/a.md', 'Alpha'), record('Books/marks/one.md')]
    );
    expect(catalog.groups[0].records.map((r) => r.notePath)).toEqual(['Books/a.md']);
    expect(catalog.recordGroups[0].records.map((r) => r.notePath)).toEqual(['Books/marks/one.md']);
  });

  // Reading order, which is what a collection of passages is worth reading in: the book, then where in it. Path is
  // the tie-break, so a rebuild does not reshuffle two highlights that share a position.
  it('orders records by book, then by where in the book they are', () => {
    const catalog = buildCatalog(
      [collection({ id: 'marks', species: 'reading_record', rules: [] })],
      [
        record('z.md', { book_title: 'Beta', cfi_sort: '0001' }),
        record('c.md', { cfi_sort: '0009' }),
        record('b.md', { cfi_sort: '0002' }),
        record('a.md', { cfi_sort: '0002' }),
      ]
    );
    expect(catalog.recordGroups[0].records.map((r) => r.notePath)).toEqual(['a.md', 'b.md', 'c.md', 'z.md']);
  });

  // A vault with no record collections parses no records at all, so the second species costs it nothing. Worth
  // pinning because the early `continue` that buys it is easy to lose in a refactor.
  it('leaves the totals to the titles', () => {
    const catalog = buildCatalog(
      [collection({ id: 'titles', rules: [] }), collection({ id: 'marks', species: 'reading_record', rules: [] })],
      [note('Books/a.md', 'Alpha'), record('Books/marks/one.md')]
    );
    expect(catalog.totalRecords).toBe(1);
  });
});
