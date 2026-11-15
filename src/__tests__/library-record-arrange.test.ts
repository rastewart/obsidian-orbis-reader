import { describe, expect, it } from 'vitest';
import type { ReadingRecord } from '../library/record';
import {
  arrangeReadingRecords,
  compareReadingOrder,
  recentReadingRecords,
  sortReadingRecords,
} from '../library/record-arrange';
import { searchReadingRecords } from '../library/search';

const record = (over: Partial<ReadingRecord> & { cfiSort?: string } = {}): ReadingRecord => {
  const { cfiSort, ...rest } = over;
  return {
    notePath: 'Records/one.md',
    kind: 'passage selection',
    excerpt: 'a passage',
    mark: '',
    markBadge: '',
    book: '[[Books/Alpha.epub]]',
    bookTitle: 'Alpha',
    author: 'Someone',
    chapter: 'CHAPTER I.',
    chapterIndex: 1,
    loc: '',
    cfi: '',
    created: '',
    noteText: '',
    cover: null,
    orphaned: false,
    tags: [],
    raw: cfiSort ? { cfi_sort: cfiSort } : {},
    ...rest,
  };
};

describe('compareReadingOrder', () => {
  // The book, then where in the book, then the path. `cfi_sort` is what an export writes for exactly this — and the
  // path tie-break is what keeps a repaint from reshuffling two highlights that share a position.
  it('is the book, then the position in it', () => {
    const list = [
      record({ notePath: 'c.md', bookTitle: 'Beta', cfiSort: '0001' }),
      record({ notePath: 'b.md', bookTitle: 'Alpha', cfiSort: '0009' }),
      record({ notePath: 'a.md', bookTitle: 'Alpha', cfiSort: '0002' }),
      record({ notePath: 'a0.md', bookTitle: 'Alpha', cfiSort: '0002' }),
    ];
    expect([...list].sort(compareReadingOrder).map((r) => r.notePath)).toEqual(['a.md', 'a0.md', 'b.md', 'c.md']);
  });
});

describe('sortReadingRecords', () => {
  const first = record({ notePath: 'a.md', chapter: 'Anna', loc: '3', created: '2026-08-01' });
  const second = record({ notePath: 'b.md', chapter: 'Beta', loc: '12', created: '2026-08-16' });

  it('sorts on a record’s own fields, either way', () => {
    expect(sortReadingRecords([second, first], [{ key: 'chapter' }]).map((r) => r.notePath)).toEqual(['a.md', 'b.md']);
    expect(sortReadingRecords([first, second], [{ key: 'chapter', desc: true }]).map((r) => r.notePath)).toEqual([
      'b.md',
      'a.md',
    ]);
  });

  // A frontmatter field is text as far as the schema knows, so comparing as text puts location 12 before 3.
  it('compares numbers as numbers', () => {
    expect(sortReadingRecords([second, first], [{ key: 'loc' }]).map((r) => r.loc)).toEqual(['3', '12']);
  });

  // The rule the titles' own sort follows: a collection sorted by chapter should begin with the first chapter,
  // not with the bookmarks that named none — and flipping the arrow is a request about the ones that answered.
  it('puts records that say nothing last, whichever way the arrow points', () => {
    const silent = record({ notePath: 'z.md', chapter: '' });
    expect(sortReadingRecords([silent, second, first], [{ key: 'chapter' }]).map((r) => r.notePath)).toEqual([
      'a.md',
      'b.md',
      'z.md',
    ]);
    expect(
      sortReadingRecords([silent, first, second], [{ key: 'chapter', desc: true }]).map((r) => r.notePath)
    ).toEqual(['b.md', 'a.md', 'z.md']);
  });

  // Reading order is what settles the ties, and for highlights that is most of them: a location spans paragraphs,
  // so several passages in one chapter routinely share one.
  it('falls back to reading order', () => {
    const a = record({ notePath: 'x.md', chapter: 'Same', cfiSort: '0002' });
    const b = record({ notePath: 'y.md', chapter: 'Same', cfiSort: '0001' });
    expect(sortReadingRecords([a, b], [{ key: 'chapter' }]).map((r) => r.notePath)).toEqual(['y.md', 'x.md']);
  });

  it('is reading order when the collection asked for nothing', () => {
    const a = record({ notePath: 'x.md', cfiSort: '0009' });
    const b = record({ notePath: 'y.md', cfiSort: '0001' });
    expect(sortReadingRecords([a, b], []).map((r) => r.notePath)).toEqual(['y.md', 'x.md']);
  });
});

describe('recentReadingRecords', () => {
  it('is newest first, by the day the annotation was made', () => {
    const list = [
      record({ notePath: 'old.md', created: '2026-01-02' }),
      record({ notePath: 'new.md', created: '2026-08-16' }),
      record({ notePath: 'mid.md', created: '2026-04-04' }),
    ];
    expect(recentReadingRecords(list).map((r) => r.notePath)).toEqual(['new.md', 'mid.md', 'old.md']);
  });

  // Not new — undated. A record with no date is left out of "what have I been marking lately" rather than being
  // treated as the oldest thing in the vault.
  it('leaves out the undated', () => {
    expect(recentReadingRecords([record({ notePath: 'x.md' })])).toEqual([]);
  });

  it('caps the tail', () => {
    const many = Array.from({ length: 5 }, (_, i) => record({ notePath: `${i}.md`, created: '2026-08-16' }));
    expect(recentReadingRecords(many, 2)).toHaveLength(2);
  });
});

describe('searchReadingRecords', () => {
  const list = [
    record({ notePath: 'a.md', excerpt: 'The truth was that the ferry never waited', cfiSort: '0001' }),
    record({ notePath: 'b.md', excerpt: '', noteText: 'Compare with Wren', cfiSort: '0002' }),
    record({ notePath: 'c.md', excerpt: 'nothing here', bookTitle: 'Beta', chapter: 'Truth and lies' }),
  ];

  // All terms, anywhere — nobody remembers which field they are typing, and a record has no one field that is its
  // name.
  it('matches the passage, your note, the book and the chapter', () => {
    expect(searchReadingRecords(list, 'truth').map((r) => r.notePath)).toEqual(['a.md', 'c.md']);
    expect(searchReadingRecords(list, 'wren').map((r) => r.notePath)).toEqual(['b.md']);
    expect(searchReadingRecords(list, 'beta').map((r) => r.notePath)).toEqual(['c.md']);
  });

  it('requires every term', () => {
    expect(searchReadingRecords(list, 'truth lies').map((r) => r.notePath)).toEqual(['c.md']);
    expect(searchReadingRecords(list, 'truth nonsense')).toEqual([]);
  });

  it('finds a mark, which the row shows rather than spells out', () => {
    const marked = [record({ notePath: 'm.md', mark: 'Important', excerpt: 'a line' })];
    expect(searchReadingRecords(marked, 'important').map((r) => r.notePath)).toEqual(['m.md']);
  });

  // An empty query has no results rather than every result: painting thousands of rows to say "you typed nothing"
  // would be the most expensive way to say it.
  it('matches nothing at all on an empty query', () => {
    expect(searchReadingRecords(list, '   ')).toEqual([]);
  });
});

// **One arranger, two species.** Everything below is the title arranger's own behavior, reached through the
// record access — the point being that a rule proved once holds for both, rather than nearly holding twice.
describe('arrangeReadingRecords', () => {
  const list = [
    record({ notePath: 'a.md', chapter: 'CHAPTER I.', mark: 'Important', created: '2026-08-16' }),
    record({ notePath: 'b.md', chapter: 'CHAPTER II.', mark: '', created: '2026-01-05' }),
    record({ notePath: 'c.md', chapter: 'CHAPTER I.', mark: 'Important', created: '2025-11-30' }),
  ];

  it('cuts a collection into groups on a record’s own field', () => {
    const groups = arrangeReadingRecords(list, 'chapter', [], 'No chapter');
    expect(groups.map((g) => [g.label, g.records.length])).toEqual([
      ['CHAPTER I.', 2],
      ['CHAPTER II.', 1],
    ]);
  });

  // The leftovers row, named for what the field lacks — the same row a title collection gets, and the reason a
  // second arranger would have had to reimplement it.
  it('names the records that answer with nothing', () => {
    const groups = arrangeReadingRecords(list, 'mark', [], 'Unmarked');
    expect(groups.map((g) => g.label)).toEqual(['Important', 'Unmarked']);
    expect(groups[1].records.map((r) => r.notePath)).toEqual(['b.md']);
  });

  // Value naming and ordering, inherited whole: the collection says what a value is called and where it comes.
  it('takes the collection’s names and order for a field’s values', () => {
    const groups = arrangeReadingRecords(list, 'chapter', [], 'None', {
      chapter: [
        { value: 'CHAPTER II.', label: 'The second one' },
        { value: 'CHAPTER I.', label: 'The first one' },
      ],
    });
    expect(groups.map((g) => g.label)).toEqual(['The second one', 'The first one']);
  });

  // Time frames, which is what makes "my highlights by month" a grouping rather than a widget of its own.
  it('groups a record’s dates by a time frame', () => {
    const groups = arrangeReadingRecords(list, 'created', [], 'No date', undefined, undefined, 'year');
    expect(groups.map((g) => g.label)).toEqual(['2025', '2026']);
    expect(groups.map((g) => g.records.length)).toEqual([1, 2]);
  });

  it('reverses the groups when the collection asks', () => {
    const groups = arrangeReadingRecords(list, 'created', [], 'No date', undefined, 'reverse', 'year');
    expect(groups.map((g) => g.label)).toEqual(['2026', '2025']);
  });

  // Sorted before it is cut, so a group's contents keep the collection's own ordering.
  it('sorts within each group', () => {
    const groups = arrangeReadingRecords(list, 'chapter', [{ key: 'created', desc: true }], 'None');
    expect(groups[0].records.map((r) => r.notePath)).toEqual(['a.md', 'c.md']);
  });
});
