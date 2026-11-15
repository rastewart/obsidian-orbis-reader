import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ArrangeContext,
  arrangeRecords,
  dedupeValues,
  effectiveValues,
  groupRecords,
  KEY_AUTHOR,
  KEY_LETTER_AUTHOR,
  KEY_LETTER_TITLE,
  KEY_SERIES,
  KEY_TAG,
  KEY_TITLE,
  NONE_VALUE,
  noneLabelKey,
  orderGroups,
  sortRecords,
  surnameOf,
  withEmptyGroups,
} from '../library/arrange';
import { setLibraryFields } from '../library/fields';
import { type LibraryRecord, parseRecord } from '../library/record';

const rec = (fm: Record<string, unknown>, path = `Library/Titles/${String(fm.title)}.md`): LibraryRecord => {
  const parsed = parseRecord(path, { orbis_note: 'title', ...fm });
  if (!parsed) throw new Error('fixture is not a record');
  return parsed;
};

const ctx: ArrangeContext = { lastOpenedOf: () => 0 };

describe('sortRecords', () => {
  it('sorts by title, ignoring a leading article', () => {
    const records = [rec({ title: 'The Third Book' }), rec({ title: 'Another Book' }), rec({ title: 'A Sample Book' })];
    expect(sortRecords(records, [{ key: KEY_TITLE }], ctx).map((r) => r.title)).toEqual([
      'Another Book',
      'A Sample Book',
      'The Third Book',
    ]);
  });

  it('sorts by author then title', () => {
    const records = [
      rec({ title: 'Zeta', authors: ['Doe, Jane'] }),
      rec({ title: 'Alpha', authors: ['Tester, Orbis'] }),
      rec({ title: 'Beta', authors: ['Doe, Jane'] }),
    ];
    const sorted = sortRecords(records, [{ key: KEY_AUTHOR }, { key: KEY_TITLE }], ctx);
    expect(sorted.map((r) => r.title)).toEqual(['Beta', 'Zeta', 'Alpha']);
  });

  // "Sort by series" means reading order. A bare name comparison interleaves books 1, 10 and 2.
  it('sorts a series by its position, not its label', () => {
    const records = [
      rec({ title: 'C', series: 'Saga', series_index: 10 }),
      rec({ title: 'A', series: 'Saga', series_index: 2 }),
      rec({ title: 'B', series: 'Saga', series_index: '1.5' }),
    ];
    expect(sortRecords(records, [{ key: KEY_SERIES }], ctx).map((r) => r.title)).toEqual(['B', 'A', 'C']);
  });

  it('reverses when asked', () => {
    const records = [rec({ title: 'A' }), rec({ title: 'B' })];
    expect(sortRecords(records, [{ key: KEY_TITLE, desc: true }], ctx).map((r) => r.title)).toEqual(['B', 'A']);
  });

  // A collection by publication date should start with the oldest book, not the two hundred that never said.
  it('keeps absent values last in both directions', () => {
    const records = [rec({ title: 'No date' }), rec({ title: 'Old', publication_date: '1851' })];
    expect(sortRecords(records, [{ key: 'publication_date' }], ctx).map((r) => r.title)).toEqual(['Old', 'No date']);
    expect(sortRecords(records, [{ key: 'publication_date', desc: true }], ctx).map((r) => r.title)).toEqual([
      'Old',
      'No date',
    ]);
  });

  it('uses facts the record does not carry', () => {
    const a = rec({ title: 'A' });
    const b = rec({ title: 'B' });
    const opened: ArrangeContext = { lastOpenedOf: (r) => (r.title === 'B' ? 500 : 100) };
    expect(sortRecords([a, b], [{ key: 'file.last-opened', desc: true }], opened).map((r) => r.title)).toEqual([
      'B',
      'A',
    ]);
  });

  // Two books alike on every sort key must not swap places between repaints.
  it('is stable, by path, when everything else ties', () => {
    const first = rec({ title: 'Same' }, 'a.md');
    const second = rec({ title: 'Same' }, 'b.md');
    expect(sortRecords([second, first], [{ key: KEY_TITLE }], ctx).map((r) => r.notePath)).toEqual(['a.md', 'b.md']);
  });

  it('defaults to title when given no sort at all', () => {
    const records = [rec({ title: 'B' }), rec({ title: 'A' })];
    expect(sortRecords(records, [], ctx).map((r) => r.title)).toEqual(['A', 'B']);
  });
});

// The reader's own names and order for a field's values, applied wherever that field decides an order.
describe('a field whose values the reader has ordered', () => {
  const status = [
    { value: 'reading', label: 'Reading now' },
    { value: 'interested', label: 'Flag for later' },
    { value: 'read', label: 'Finished' },
  ];
  const records = [
    rec({ title: 'A', reading_status: 'read' }),
    rec({ title: 'B', reading_status: 'interested' }),
    rec({ title: 'C', reading_status: 'reading' }),
  ];

  it('heads each group with the reader’s word for the value', () => {
    const groups = groupRecords(records, 'reading_status', 'None', status);
    expect(groups.map((g) => g.label)).toEqual(['Reading now', 'Flag for later', 'Finished']);
  });

  // Alphabetically this would be interested, read, reading — which is nobody's reading order.
  it('orders the groups the way they were placed, not alphabetically', () => {
    const groups = groupRecords(records, 'reading_status', 'None', status);
    expect(groups[0].records.map((r) => r.title)).toEqual(['C']);
  });

  // A value that turns up later must appear, and must not jump the queue.
  it('puts values nobody placed after the placed ones, alphabetically', () => {
    const withStrays = [
      ...records,
      rec({ title: 'D', reading_status: 'abandoned' }),
      rec({ title: 'E', reading_status: 'zzz' }),
    ];
    const groups = groupRecords(withStrays, 'reading_status', 'None', status);
    expect(groups.map((g) => g.label)).toEqual(['Reading now', 'Flag for later', 'Finished', 'abandoned', 'zzz']);
  });

  // Sorting by the same field has to agree with grouping by it, or one dialog gives two different sequences.
  it('sorts by the same order, and reverses it on demand', () => {
    const ordered = sortRecords(records, [{ key: 'reading_status' }], {
      ...ctx,
      fieldValues: { reading_status: status },
    });
    expect(ordered.map((r) => r.title)).toEqual(['C', 'B', 'A']);
    const flipped = sortRecords(records, [{ key: 'reading_status', desc: true }], {
      ...ctx,
      fieldValues: { reading_status: status },
    });
    expect(flipped.map((r) => r.title)).toEqual(['A', 'B', 'C']);
  });

  // Renaming a heading must never regroup anything: records are grouped by the VALUE, labeled after the fact.
  it('groups by the value even when two labels would collide', () => {
    const same = [
      { value: 'reading', label: 'Same' },
      { value: 'read', label: 'Same' },
    ];
    const groups = groupRecords(records, 'reading_status', 'None', same);
    expect(groups.filter((g) => g.label === 'Same')).toHaveLength(2);
  });
});

// The records that answer with nothing are a group like any other, and the reader can name it and say where it
// goes. Unplaced, it stays at the end — leftovers with no instruction are leftovers.
describe('the no-value row', () => {
  const records = [
    rec({ title: 'A', reading_status: 'read' }),
    rec({ title: 'B' }),
    rec({ title: 'C', reading_status: 'reading' }),
  ];

  it('is named and placed like any other value', () => {
    const values = [{ value: NONE_VALUE, label: 'Unread' }, { value: 'reading' }, { value: 'read' }];
    const groups = groupRecords(records, 'reading_status', 'No status', values);
    expect(groups.map((g) => g.label)).toEqual(['Unread', 'reading', 'read']);
    expect(groups[0].records.map((r) => r.title)).toEqual(['B']);
  });

  it('falls back to the collection’s own word when it is placed but not named', () => {
    const values = [{ value: NONE_VALUE }, { value: 'read' }];
    expect(groupRecords(records, 'reading_status', 'No status', values)[0].label).toBe('No status');
  });

  it('stays last when nobody has placed it', () => {
    const values = [{ value: 'read' }, { value: 'reading' }];
    const groups = groupRecords(records, 'reading_status', 'No status', values);
    expect(groups.map((g) => g.label)).toEqual(['read', 'reading', 'No status']);
  });

  // Sorting has to agree with grouping, or one collection produces two sequences for the same field.
  it('sorts where it was placed, rather than always last', () => {
    const placed: ArrangeContext = {
      ...ctx,
      fieldValues: { reading_status: [{ value: NONE_VALUE }, { value: 'reading' }, { value: 'read' }] },
    };
    expect(sortRecords(records, [{ key: 'reading_status' }], placed).map((r) => r.title)).toEqual(['B', 'C', 'A']);
    // And absent still sorts last when the reader has said nothing about it.
    expect(sortRecords(records, [{ key: 'reading_status' }], ctx).map((r) => r.title)).toEqual(['C', 'A', 'B']);
  });
});

describe('groupRecords', () => {
  // Filing a co-authored book under its first author hides it from the other person who wrote it.
  it('puts a book under every author it names', () => {
    const records = [rec({ title: 'Together', authors: ['Doe, Jane', 'Tester, Orbis'] })];
    const groups = groupRecords(records, KEY_AUTHOR, 'No author');
    expect(groups.map((g) => g.label)).toEqual(['Doe, Jane', 'Tester, Orbis']);
    expect(groups[0].records).toHaveLength(1);
    expect(groups[1].records).toHaveLength(1);
  });

  it('collects what has no value into a last group', () => {
    const records = [rec({ title: 'A', series: 'Saga' }), rec({ title: 'B' })];
    const groups = groupRecords(records, KEY_SERIES, 'No series');
    expect(groups.map((g) => g.label)).toEqual(['Saga', 'No series']);
  });

  it('groups by first letter, with anything non-alphabetic together', () => {
    const records = [rec({ title: 'The Sample Book' }), rec({ title: '4321' }), rec({ title: 'Another Book' })];
    expect(groupRecords(records, KEY_LETTER_TITLE, 'None').map((g) => g.label)).toEqual(['#', 'A', 'S']);
  });

  // `Book` and `book` are one shelf. Grouping on the raw text would give two headings that look identical, each
  // holding half the books — while a rule matching `type is book` catches them both.
  it('groups spellings that differ only in case together, under the first one seen', () => {
    const records = [rec({ title: 'A', type: 'Book' }), rec({ title: 'B', type: 'book' })];
    const groups = groupRecords(records, 'type', 'None');
    expect(groups.map((g) => g.label)).toEqual(['Book']);
    expect(groups[0].records).toHaveLength(2);
  });

  // And the reader's own name for a value applies however their notes spelled it.
  it('matches a placed value whatever case the note used', () => {
    const records = [rec({ title: 'A', type: 'DVD' })];
    const groups = groupRecords(records, 'type', 'None', [{ value: 'dvd', label: 'On disc' }]);
    expect(groups.map((g) => g.label)).toEqual(['On disc']);
  });

  it('leaves the list alone when not grouping', () => {
    const records = [rec({ title: 'B' }), rec({ title: 'A' })];
    const groups = groupRecords(records, 'none', 'None');
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('');
    expect(groups[0].records.map((r) => r.title)).toEqual(['B', 'A']);
  });
});

describe('arrangeRecords', () => {
  // Sorting first is what lets a group of a series read in reading order.
  it('sorts before grouping, so each group keeps the collection ordering', () => {
    const records = [
      rec({ title: 'Third', series: 'Saga', series_index: 3 }),
      rec({ title: 'First', series: 'Saga', series_index: 1 }),
      rec({ title: 'Other', series: 'Elsewhere', series_index: 1 }),
    ];
    const groups = arrangeRecords(records, 'series', [{ key: KEY_SERIES }], 'No series', ctx);
    expect(groups.map((g) => g.label)).toEqual(['Elsewhere', 'Saga']);
    expect(groups[1].records.map((r) => r.title)).toEqual(['First', 'Third']);
  });
});

// Any field an exporter wrote can arrange a collection — a fixed list of six would be a list of the fields we happened
// to think of.
describe('arbitrary frontmatter fields', () => {
  it('groups by a field the schema has never heard of', () => {
    const records = [
      rec({ title: 'A', publisher: 'Sample Press' }),
      rec({ title: 'B', publisher: 'Another Press' }),
      rec({ title: 'C', publisher: 'Sample Press' }),
    ];
    const groups = groupRecords(records, 'publisher', 'No publisher');
    expect(groups.map((g) => `${g.label}:${g.records.length}`)).toEqual(['Another Press:1', 'Sample Press:2']);
  });

  // A frontmatter value is text as far as the schema knows, and comparing text puts 12 before 3.
  it('sorts a numeric field as numbers', () => {
    const records = [rec({ title: 'A', use_count: 3 }), rec({ title: 'B', use_count: 12 })];
    expect(sortRecords(records, [{ key: 'use_count', desc: true }], ctx).map((r) => r.title)).toEqual(['B', 'A']);
  });

  it('puts records missing the field last', () => {
    const records = [rec({ title: 'A' }), rec({ title: 'B', publisher: 'Another Press' })];
    expect(sortRecords(records, [{ key: 'publisher' }], ctx).map((r) => r.title)).toEqual(['B', 'A']);
  });
});

describe('surnameOf', () => {
  it('takes the surname a comma gives away', () => {
    expect(surnameOf('Tester, Orbis')).toBe('Tester');
  });

  // Named a heuristic rather than dressed up as knowledge: nothing short of a name database gets this right.
  it('guesses the last word otherwise, and is sometimes wrong', () => {
    expect(surnameOf('Orbis Tester')).toBe('Tester');
    expect(surnameOf('Anna de la Cruz')).toBe('Cruz'); // wrong, and knowably so
  });
});

describe('grouping by author letter', () => {
  it('uses the surname, whichever order the name was written in', () => {
    const records = [rec({ title: 'A', authors: ['Tester, Orbis'] }), rec({ title: 'B', authors: ['Jane Doe'] })];
    expect(groupRecords(records, KEY_LETTER_AUTHOR, 'None').map((g) => g.label)).toEqual(['D', 'T']);
  });
});

// Guards against grouping and sorting reading the raw frontmatter, which would group a field the reader has mapped
// entirely under "none" while the rows show the value perfectly well. Whatever reads a note reads it the same way.
describe('a plain field the reader has described', () => {
  beforeEach(() => setLibraryFields([{ key: 'shelf', keys: ['shelf_name', 'shelf'] }]));
  afterEach(() => setLibraryFields([]));

  it('groups on the key the note actually carries', () => {
    const records = [rec({ title: 'A', shelf_name: 'Study' }), rec({ title: 'B', shelf: 'Attic' })];
    expect(groupRecords(records, 'shelf', 'No shelf').map((g) => g.label)).toEqual(['Attic', 'Study']);
  });

  // Both write the alias, so a sort that ignored the table sees two records with no value at all and leaves them
  // in the order they arrived — which is the answer this has to be able to fail.
  // Named once, named everywhere: described per collection, the same status reads three ways on three dashboards
  // and every new collection starts by retyping them.
  it('takes the field’s own value order and names when the collection has placed none', () => {
    setLibraryFields([
      {
        key: 'shelf',
        keys: ['shelf_name', 'shelf'],
        values: [{ value: 'Study', label: 'The study' }, { value: 'Attic' }],
      },
    ]);
    const records = [rec({ title: 'A', shelf_name: 'Attic' }), rec({ title: 'B', shelf_name: 'Study' })];
    const groups = arrangeRecords(records, 'shelf', [{ key: KEY_TITLE }], 'No shelf', ctx);
    expect(groups.map((g) => g.label)).toEqual(['The study', 'Attic']);
  });

  // And a collection that has placed its own list still wins — that is what makes one dashboard able to order
  // statuses its own way without renaming them for everyone.
  it('lets a collection’s own list override the field’s', () => {
    setLibraryFields([
      { key: 'shelf', keys: ['shelf_name', 'shelf'], values: [{ value: 'Study', label: 'The study' }] },
    ]);
    const records = [rec({ title: 'A', shelf_name: 'Study' })];
    const own: ArrangeContext = { ...ctx, fieldValues: { shelf: [{ value: 'Study', label: 'Upstairs' }] } };
    expect(arrangeRecords(records, 'shelf', [{ key: KEY_TITLE }], 'No shelf', own).map((g) => g.label)).toEqual([
      'Upstairs',
    ]);
  });

  it('sorts on it too', () => {
    const records = [rec({ title: 'A', shelf_name: 'Study' }), rec({ title: 'B', shelf_name: 'Attic' })];
    expect(sortRecords(records, [{ key: 'shelf' }], ctx).map((r) => r.title)).toEqual(['B', 'A']);
  });
});

// The summary widget lists the groups themselves, so how they are ordered and whether the empty ones show up
// stop being cosmetic: they are the widget's whole content.
describe('orderGroups', () => {
  const groups = [
    { label: 'Reading now', records: [rec({ title: 'A' }), rec({ title: 'B' })] },
    { label: 'Flag for later', records: [rec({ title: 'C' })] },
    { label: 'Finished', records: [rec({ title: 'D' }), rec({ title: 'E' }), rec({ title: 'F' })] },
  ];

  it('leaves the value order alone by default', () => {
    expect(orderGroups(groups, undefined).map((g) => g.label)).toEqual(['Reading now', 'Flag for later', 'Finished']);
    expect(orderGroups(groups, 'value').map((g) => g.label)).toEqual(['Reading now', 'Flag for later', 'Finished']);
  });

  // Reversed, a list of years opened on "No date" above the newest one.
  it('keeps the group with no value last when reordered, and where it was in value order', () => {
    const years = [
      { label: '2006', value: '2006', records: [rec({ title: 'A' })] },
      { label: '2026', value: '2026', records: [rec({ title: 'B' })] },
      { label: 'No date', value: NONE_VALUE, records: [rec({ title: 'C' }), rec({ title: 'D' }), rec({ title: 'E' })] },
    ];
    expect(orderGroups(years, 'value').map((g) => g.label)).toEqual(['2006', '2026', 'No date']);
    expect(orderGroups(years, 'reverse').map((g) => g.label)).toEqual(['2026', '2006', 'No date']);
    expect(orderGroups(years, 'most').map((g) => g.label)).toEqual(['2006', '2026', 'No date']);
    expect(orderGroups(years, 'fewest').map((g) => g.label)).toEqual(['2006', '2026', 'No date']);
  });

  it('puts the biggest first, or the smallest', () => {
    expect(orderGroups(groups, 'most').map((g) => g.label)).toEqual(['Finished', 'Reading now', 'Flag for later']);
    expect(orderGroups(groups, 'fewest').map((g) => g.label)).toEqual(['Flag for later', 'Reading now', 'Finished']);
  });

  // Otherwise two equal groups could swap places between paints, and a summary read every morning would not sit
  // still — the one thing a summary has to do.
  it('keeps equal groups in the order they came in', () => {
    const tied = [
      { label: 'B', records: [rec({ title: 'x' })] },
      { label: 'A', records: [rec({ title: 'y' })] },
    ];
    expect(orderGroups(tied, 'most').map((g) => g.label)).toEqual(['B', 'A']);
    expect(orderGroups(tied, 'fewest').map((g) => g.label)).toEqual(['B', 'A']);
  });
});

describe('withEmptyGroups', () => {
  const values = [
    { value: 'reading', label: 'Reading now' },
    { value: 'interested', label: 'Flag for later' },
    { value: 'read', label: 'Finished' },
  ];

  it('adds a row for a value nothing uses, in its placed position', () => {
    const groups = [{ label: 'Finished', value: 'read', records: [rec({ title: 'A' })] }];
    const out = withEmptyGroups(groups, values);
    expect(out.map((g) => g.label)).toEqual(['Reading now', 'Flag for later', 'Finished']);
    expect(out.map((g) => g.records.length)).toEqual([0, 0, 1]);
  });

  it('does nothing for a field with no list of values', () => {
    const groups = [{ label: 'Doe, Jane', value: 'Doe, Jane', records: [rec({ title: 'A' })] }];
    expect(withEmptyGroups(groups, undefined)).toEqual(groups);
    expect(withEmptyGroups(groups, [])).toEqual(groups);
  });

  it('leaves a full list untouched', () => {
    const groups = values.map((v) => ({ label: v.label, value: v.value, records: [rec({ title: v.value })] }));
    expect(withEmptyGroups(groups, values).map((g) => g.label)).toEqual(groups.map((g) => g.label));
  });

  // A vault mid-migration has `01-reading` labeled "Reading" beside `reading`, and matching on the heading would
  // treat them as one group and drop the second.
  it('matches on the value, not on what it is called', () => {
    const naming = [
      { value: 'reading', label: 'Reading' },
      { value: '01-reading', label: 'Reading' },
    ];
    const groups = [{ label: 'Reading', value: 'reading', records: [rec({ title: 'A' })] }];
    const out = withEmptyGroups(groups, naming, naming);
    expect(out.map((g) => g.value)).toEqual(['reading', '01-reading']);
  });

  // What EXISTS is the field's vocabulary. A collection's own list accumulates whatever its records once held,
  // and enumerating that would invent rows for values the collection can no longer contain.
  it('takes the vocabulary from the field and the naming from the collection', () => {
    const declared = [{ value: 'reading' }, { value: 'read' }];
    const naming = [
      { value: 'read', label: 'Finished reading' },
      { value: 'reading', label: 'Reading' },
      { value: '03-read', label: '' },
    ];
    const groups = [{ label: 'Reading', value: 'reading', records: [rec({ title: 'A' })] }];
    const out = withEmptyGroups(groups, declared, naming);
    expect(out.map((g) => g.value)).toEqual(['read', 'reading']);
    expect(out.find((g) => g.value === 'read')?.label).toBe('Finished reading');
  });
});

// Two lists, one answer: the field names a value, the collection disagrees about some of them. Inheritance is
// per VALUE, so naming one status in a collection does not orphan the other five.
describe('effectiveValues', () => {
  const field = [
    { value: 'reading', label: 'Reading' },
    { value: 'read', label: 'Finished reading' },
    { value: 'abandoned', label: 'Stopped reading' },
  ];

  it('takes the field’s list when the collection has none', () => {
    expect(effectiveValues(undefined, field)).toEqual(field);
    expect(effectiveValues([], field)).toEqual(field);
  });

  it('lets the collection rename one value and inherit the rest', () => {
    const out = effectiveValues([{ value: 'read', label: 'Done' }], field) ?? [];
    expect(out.find((v) => v.value === 'read')?.label).toBe('Done');
    expect(out.find((v) => v.value === 'reading')?.label).toBe('Reading');
  });

  // Clearing a name in a collection is how you go back to the field's, so an
  // entry with no label of its own has to inherit rather than fall through to the raw value.
  it('inherits the field’s name for an entry the collection left blank', () => {
    const out = effectiveValues([{ value: 'read' }, { value: 'reading', label: '  ' }], field) ?? [];
    expect(out.find((v) => v.value === 'read')?.label).toBe('Finished reading');
    expect(out.find((v) => v.value === 'reading')?.label).toBe('Reading');
  });

  // The collection's list is also its ORDER, so what it places comes first — and what it never mentions keeps
  // the field's name and joins the end rather than vanishing.
  it('keeps the collection’s order, with the unplaced values after', () => {
    const out = effectiveValues([{ value: 'abandoned' }, { value: 'read', label: 'Done' }], field) ?? [];
    expect(out.map((v) => v.value)).toEqual(['abandoned', 'read', 'reading']);
    expect(out[0].label).toBe('Stopped reading');
  });

  it('has nothing to say about a field with no values', () => {
    expect(effectiveValues(undefined, undefined)).toBeUndefined();
  });
});

// The fields editor offers what Orbis provides AND what the vault holds, and `reading` is both — so without
// deduplication every built-in status is listed twice, once placed and once alphabetically among the scanned values.
describe('dedupeValues', () => {
  it('keeps the first of a repeated value', () => {
    const out = dedupeValues([{ value: 'reading', label: 'Reading now' }, { value: 'read' }, { value: 'reading' }]);
    expect(out.map((v) => v.value)).toEqual(['reading', 'read']);
    expect(out[0].label).toBe('Reading now');
  });

  // Folded, exactly as grouping folds: one group means one row.
  it('treats two spellings of a value as one', () => {
    expect(dedupeValues([{ value: 'Read' }, { value: 'read' }, { value: ' read ' }]).map((v) => v.value)).toEqual([
      'Read',
    ]);
  });

  it('leaves a list with nothing repeated alone', () => {
    const values = [{ value: 'a' }, { value: 'b' }];
    expect(dedupeValues(values)).toEqual(values);
  });
});

// The other end of the same parser the filters will use: a date field grouped by where its dates fall.
describe('grouping by a time frame', () => {
  const ctx: ArrangeContext = { lastOpenedOf: () => 0 };
  const records = [
    rec({ title: 'A', added: '2026-08-16' }),
    rec({ title: 'B', added: '2026-08-02' }),
    rec({ title: 'C', added: '2025-12-30' }),
    rec({ title: 'D', added: 'sometime' }),
  ];

  it('heads each group with the month, and keys it so months sort', () => {
    const groups = arrangeRecords(records, 'added', [{ key: 'title' }], 'No date', ctx, undefined, 'month');
    expect(groups.map((g) => g.label)).toEqual(['December 2025', 'August 2026', 'No date']);
    expect(groups[0].value).toBe('2025-12');
  });

  // Two records, one month: the bucket is the group, not the value.
  it('gathers a month rather than a written value', () => {
    const groups = arrangeRecords(records, 'added', [{ key: 'title' }], 'No date', ctx, undefined, 'month');
    expect(groups.find((g) => g.label === 'August 2026')?.records.map((r) => r.title)).toEqual(['A', 'B']);
  });

  // A value that is not a date is a different fact from having no value, but neither is a month.
  it('puts what does not parse in the leftovers', () => {
    const groups = arrangeRecords(records, 'added', [{ key: 'title' }], 'No date', ctx, undefined, 'month');
    expect(groups.at(-1)).toMatchObject({ label: 'No date' });
    expect(groups.at(-1)?.records.map((r) => r.title)).toEqual(['D']);
  });

  // What "reverse" is for: a by-month grouping almost always wants the newest at the top — and the leftovers stay at
  // the bottom, where they were before it was reversed.
  it('reads newest first when the collection asks for reverse', () => {
    const groups = arrangeRecords(records, 'added', [{ key: 'title' }], 'No date', ctx, 'reverse', 'month');
    expect(groups.map((g) => g.label)).toEqual(['August 2026', 'December 2025', 'No date']);
  });

  it('drops the year where that is the question', () => {
    const groups = arrangeRecords(records, 'added', [{ key: 'title' }], 'No date', ctx, undefined, 'month-of-year');
    expect(groups.map((g) => g.label)).toEqual(['August', 'December', 'No date']);
  });

  // Without a bucket the field groups by what it SAYS, which is what every other field does — and `sometime` is
  // then an ordinary value with a group of its own, not leftovers. The unreadable-date reading exists only
  // inside a time frame.
  it('groups by the written value when no time frame is set', () => {
    const groups = arrangeRecords(records, 'added', [{ key: 'title' }], 'No date', ctx);
    expect(groups.map((g) => g.label)).toEqual(['2025-12-30', '2026-08-02', '2026-08-16', 'sometime']);
  });

  // Many publication dates are year-only, and reading them as 1 January would put most of a catalog in one month.
  it('sends a year-only date to the leftovers rather than to January', () => {
    const mixed = [
      rec({ title: 'Y', added: '2016' }),
      rec({ title: 'M', added: '2016-08-04' }),
      rec({ title: 'N', added: '2016-01-09' }),
    ];
    const groups = arrangeRecords(mixed, 'added', [{ key: 'title' }], 'No date', ctx, undefined, 'month-of-year');
    expect(groups.map((g) => `${g.label}:${g.records.length}`)).toEqual(['January:1', 'August:1', 'No date:1']);
    expect(groups.find((g) => g.label === 'January')?.records.map((r) => r.title)).toEqual(['N']);
  });

  // The same date still groups by year, which needs no more than it has.
  it('still groups a year-only date by year', () => {
    const groups = arrangeRecords([rec({ title: 'Y', added: '2016' })], 'added', [], 'No date', ctx, undefined, 'year');
    expect(groups.map((g) => g.label)).toEqual(['2016']);
  });
});

describe('the group of records with no value', () => {
  // Grouping by Authors or by Tag said "Everything else": the names were matched against 'author' and 'tag'.
  it('is named for the field it groups on', () => {
    expect(noneLabelKey(KEY_AUTHOR)).toBe('library.group_none_author');
    expect(noneLabelKey(KEY_TAG)).toBe('library.group_none_tag');
    expect(noneLabelKey(KEY_SERIES)).toBe('library.group_none_series');
    expect(noneLabelKey('type')).toBe('library.group_none_type');
    expect(noneLabelKey('genre')).toBe('library.group_none_other');
  });
});

describe('groups of numbers', () => {
  // Compared as text, groups of 3 and 12 ran "12, 3" — while sorting by the same field put 3 first.
  it('run lowest first, as sorting does', () => {
    const records = [
      rec({ title: 'A', use_count: 12 }),
      rec({ title: 'B', use_count: 3 }),
      rec({ title: 'C', use_count: 3 }),
    ];
    expect(groupRecords(records, 'use_count', 'None').map((g) => g.label)).toEqual(['3', '12']);
  });
});
