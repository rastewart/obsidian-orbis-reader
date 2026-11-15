// Ordering a collection and cutting it into groups. See docs/design/library.md.
//
// **Any frontmatter field can group or sort a collection.** A catalog carries whatever its exporter thought worth
// writing — `publisher`, `use_count`, `copyright`, `purchase_date` — and a fixed list of six would be a list of
// the fields we happened to think of. A handful of keys mean something more than a field lookup (a series sorts by
// its position, a letter group comes from the sort title), and those are named; everything else is read from the
// record's own frontmatter.
//
// Pure: records in, arranged records out, with anything the vault knows passed in as values. That keeps the rules
// — which of two books comes first, which group a book with three authors belongs to — testable without a vault,
// and they are exactly the rules people notice when they are wrong.

import { bucketOf, type CalendarDate, parseRecordDate, type TimeBucket, type TimeFrame, today } from './dates';
import { fieldKeys, fieldValuesFor } from './fields';
import { type LibraryRecord, titleSortKey, toStringList } from './record';

/** Grouping and sorting keys that mean more than "read this frontmatter field". */
export const GROUP_NONE = 'none';
export const KEY_FOLDER = 'file.folder';
export const KEY_TAG = 'file.tag';
export const KEY_LETTER_TITLE = 'file.letter-title';
export const KEY_LETTER_AUTHOR = 'file.letter-author';
export const KEY_TITLE = 'title';
export const KEY_AUTHOR = 'authors';
export const KEY_SERIES = 'series';
export const KEY_LAST_OPENED = 'file.last-opened';
export const KEY_RATING = 'rating';

/** A frontmatter field name, one of the keys above, or `none` for no grouping. */
export type GroupKey = string;

/**
 * What the group of records with no value is called, by the field it groups on — "No author" rather than
 * "Everything else" where the field has a name for its absence.
 *
 * **Keyed by the constants above, never retyped.** The list this replaced matched `'author'` and `'tag'`, which are
 * not the keys (`authors`, `file.tag`), so grouping by either said "Everything else".
 */
export function noneLabelKey(
  groupBy: GroupKey
):
  | 'library.group_none_author'
  | 'library.group_none_series'
  | 'library.group_none_type'
  | 'library.group_none_tag'
  | 'library.group_none_other' {
  switch (groupBy) {
    case KEY_AUTHOR:
      return 'library.group_none_author';
    case KEY_SERIES:
      return 'library.group_none_series';
    case 'type':
      return 'library.group_none_type';
    case KEY_TAG:
      return 'library.group_none_tag';
    default:
      return 'library.group_none_other';
  }
}
/**
 * The order groups come in: the field's own value order, or by how many records each holds.
 *
 * `value` is the default and the only one that is stable while you read — the counts move, the value order does
 * not, so a summary you scan every morning keeps its shape. The other two are for a field with more values than
 * you can hold in your head, where "which are the big ones" is the question.
 */
export type GroupOrder = 'value' | 'most' | 'fewest' | 'reverse';
/** A frontmatter field name, or one of the keys above. */
export type SortKey = string;

export interface SortSpec {
  key: SortKey;
  desc?: boolean;
}

export interface RecordGroup<T = LibraryRecord> {
  /** Shown as the group's heading. Empty for the ungrouped case. */
  label: string;
  records: T[];
  /**
   * The value behind the heading, before it was named — absent when there is no grouping.
   *
   * **A label is not an identity.** Two values can carry one name: a vault mid-migration has `reading` and
   * `01-reading` both shown as "Reading", and code that matched groups by their heading treated them as the same
   * group. Anything asking "is this value already here" has to ask about the value.
   */
  value?: string;
}

/**
 * A value of some field, as the reader wants it seen: what it is called, and where it comes in the order.
 *
 * Position is the array's own order. Keyed by field name wherever these are stored, so the same table can later be
 * lifted out of a collection and into a fields manager without changing its shape.
 */
export interface FieldValue {
  value: string;
  /** What to show instead of the raw value. Absent or empty means the value speaks for itself. */
  label?: string;
}

/** Custom labels and ordering per field name — `{ reading_status: [{ value: 'reading', label: 'Reading now' }] }`. */
export type FieldValues = Record<string, FieldValue[]>;

/** Extra facts a sort may need that the record itself does not carry. */
export interface ArrangeContext<T = LibraryRecord> {
  lastOpenedOf: (record: T) => number;
  /**
   * The reader's own ordering and naming of a field's values.
   *
   * **Listed values come first, in this order; everything else follows alphabetically.** Never a filter: a value
   * that is not listed is one nobody has got round to, not one to hide — and a stored list goes stale the moment
   * a new value appears in the vault, which must not be the moment titles start vanishing.
   */
  fieldValues?: FieldValues;
}

/**
 * The stand-in for "this record says nothing here" — a value the reader can name and place like any other.
 *
 * **Every field has a group of records that answer it with nothing**, and that group needs a name and a position
 * as much as the others do. The absence is the honest thing to name: a stored value such as `unread` would have
 * no writer, sit at a count of zero forever, and be a second way to be unread beside the field simply being absent.
 *
 * Empty string, because a real value cannot be one: everything that reads frontmatter drops blanks before they
 * reach here, so this can never collide with something a note actually said.
 */
export const NONE_VALUE = '';

/**
 * One value reduced to what two spellings of it share.
 *
 * **`Book`, `book` and `BOOK` are one shelf.** Notes are written by hand and by half a dozen exporters, and the
 * same word arrives capitalized differently from each — so grouping on the raw text would produce two headings
 * that look identical, each with half the books. Collection rules fold case too, so `type is book` catches both.
 */
export function foldValue(value: string): string {
  return value.trim().toLowerCase();
}

/** Where a value sits in the reader's order, or `null` when they have not placed it. */
function orderOf(values: FieldValue[] | undefined, value: string): number | null {
  if (!values) return null;
  const at = values.findIndex((entry) => foldValue(entry.value) === foldValue(value));
  return at === -1 ? null : at;
}

/** What a value is called: the reader's label, or the value itself. */
export function labelOf(values: FieldValue[] | undefined, value: string): string {
  return values?.find((entry) => foldValue(entry.value) === foldValue(value))?.label?.trim() || value;
}

/**
 * One entry per value, keeping the first of any repeat.
 *
 * **Two sources can name the same value.** The fields editor offers what Orbis provides AND what the vault
 * actually holds, and `reading` is both — so without this every built-in status appears twice in the list, once
 * in its placed position and once alphabetically among the scanned ones. Folded, so `Read` and `read` are one value
 * here exactly as they are one group when the records are arranged.
 */
export function dedupeValues(values: readonly FieldValue[]): FieldValue[] {
  const seen = new Set<string>();
  const out: FieldValue[] = [];
  for (const entry of values) {
    const key = foldValue(entry.value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/**
 * One list of values from two: what a collection says, over what the field says.
 *
 * **Inheritance per value, not per list.** An all-or-nothing list would stop the field's names applying to every
 * value in it, so renaming `read` on the Fields page would leave a collection that had once been reordered still
 * saying `read`. The two lists answer different halves of the question: the
 * field is where a value gets its name, and the collection is where THIS dashboard disagrees, about a name or
 * about the order.
 *
 * So a collection entry with no label of its own inherits the field's, and a value the collection never mentions
 * keeps its name and joins the end in the field's own order. Clearing a name in a collection is therefore how you
 * go back to the field's — there is no reset to press, because an empty override is not an override.
 */
export function effectiveValues(
  collection: readonly FieldValue[] | undefined,
  field: readonly FieldValue[] | undefined
): FieldValue[] | undefined {
  if (!collection?.length) return field ? [...field] : undefined;
  const named = (value: string): string | undefined =>
    field?.find((entry) => foldValue(entry.value) === foldValue(value))?.label?.trim() || undefined;
  const mine = collection.map((entry) => ({ ...entry, label: entry.label?.trim() || named(entry.value) }));
  const placed = new Set(collection.map((entry) => foldValue(entry.value)));
  const rest = (field ?? []).filter((entry) => !placed.has(foldValue(entry.value)));
  return [...mine, ...rest];
}

/**
 * Compare two values of one field, honoring the reader's order.
 *
 * Placed values sort by position; unplaced ones sort among themselves alphabetically and always after — so
 * "Reading now" leads whatever it is called, and a value that appeared this morning is at the bottom rather than
 * silently in the middle.
 */
function compareValues(values: FieldValue[] | undefined, a: string, b: string): number | null {
  if (!values?.length) return null;
  const left = orderOf(values, a);
  const right = orderOf(values, b);
  if (left === null && right === null) return null;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

/**
 * A person's surname, for grouping by letter.
 *
 * `Doe, Jane` gives its surname away with the comma; `Jane Doe` has to be guessed at, and the last
 * word is the guess that is right most of the time in the languages this can claim to handle. Named as a
 * heuristic rather than dressed up as knowledge — `Anna de la Cruz` files under C, which is wrong, and no rule
 * short of a name database gets it right.
 */
export function surnameOf(author: string): string {
  const comma = author.indexOf(',');
  if (comma > 0) return author.slice(0, comma).trim();
  const parts = author.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

/** First letter for a letter group: A–Z, or `#` for anything else. */
function letterOf(text: string): string {
  const first = text.trim().charAt(0).toUpperCase();
  if (!first) return '';
  return /[A-Z]/.test(first) ? first : '#';
}

/**
 * A plain frontmatter field, read through the reader's field table.
 *
 * The same walk parsing does, for the same reason: a collection grouped on `source_url` has to see the note that
 * writes it as `logos_link`, or the group everyone can see on a row is empty when they group by it.
 */
function rawField(record: LibraryRecord, key: string): string[] {
  for (const alias of fieldKeys(key)) {
    const found = toStringList(record.raw[alias]);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * How to read one species of note, for the rules below.
 *
 * **The rules are the same for both species; only the reading differs.** Which group a record belongs to, which of
 * two comes first, where the ones that say nothing go, what a value is called and in what order — none of that is
 * about titles, and writing a second arranger to say it again for reading records is how two of them come to
 * disagree. What IS species-specific is narrow: which field answers a key, and which keys mean something more than
 * a frontmatter lookup.
 *
 * `compareSpecial` is given the same `text` and `num` helpers the general path uses, so an implementation gets the
 * direction, the reader's value order and the missing-last rule for free rather than restating them.
 */
export interface ArrangeAccess<T> {
  /** The values this record contributes to a grouping on `key` — more than one where the field is a list. */
  valuesOf(record: T, key: GroupKey): string[];
  /** The text this record sorts by on `key`, or empty when it says nothing. */
  textOf(record: T, key: SortKey): string;
  /** A comparison for a key that is not plain text — a rating, a position in a series. Null falls back to text. */
  compareSpecial?(a: T, b: T, spec: SortSpec, helpers: CompareHelpers, ctx: ArrangeContext<T>): number | null;
  /** What settles two records the sort could not separate, so a repaint is stable. */
  tieBreak(a: T, b: T): number;
}

/** The comparisons every key shares: direction, the reader's value order, and absent-sorts-last. */
export interface CompareHelpers {
  text(value: string, other: string): number;
  num(value: number | null, other: number | null): number;
}

/** The values a record contributes to a grouping — more than one where the field is a list. */
function groupValues(record: LibraryRecord, key: GroupKey): string[] {
  switch (key) {
    case KEY_TAG:
      return record.tags;
    case KEY_FOLDER:
      return [record.notePath.split('/').slice(0, -1).join('/')];
    case KEY_LETTER_TITLE:
      return [letterOf(titleSortKey(record.title))].filter((v) => v.length > 0);
    case KEY_LETTER_AUTHOR:
      // Every author, as with grouping by author itself: a co-written book belongs under both letters.
      return record.authors.map((author) => letterOf(surnameOf(author))).filter((v) => v.length > 0);
    case KEY_TITLE:
      return record.title ? [record.title] : [];
    case KEY_AUTHOR:
      return record.authors;
    default:
      return rawField(record, key);
  }
}

/** The value a record sorts by, as text, for a key with no special meaning. */
function fieldText(record: LibraryRecord, key: SortKey): string {
  switch (key) {
    case KEY_TITLE:
      return titleSortKey(record.title);
    case KEY_AUTHOR:
      return record.authors[0] ?? '';
    case KEY_FOLDER:
      return record.notePath.split('/').slice(0, -1).join('/');
    case KEY_LETTER_TITLE:
      return letterOf(titleSortKey(record.title));
    case KEY_LETTER_AUTHOR:
      return letterOf(surnameOf(record.authors[0] ?? ''));
    case KEY_TAG:
      return record.tags[0] ?? '';
    default:
      return rawField(record, key)[0] ?? '';
  }
}

/** Two group values with no list to order them: as numbers when both are, else as text. */
function compareGroupValues(a: string, b: string): number {
  const left = numberOf(a);
  const right = numberOf(b);
  return left !== null && right !== null ? left - right : a.localeCompare(b);
}

/** A number for `series_index`, or null. `2` and `2.5` both occur; `""` and `"Part 2"` do not sort. */
function seriesIndexOf(record: LibraryRecord): number | null {
  const n = Number.parseFloat(record.seriesIndex);
  return Number.isFinite(n) ? n : null;
}

/** The number a value holds, or null when it is not one — so `use_count: 12` sorts above `use_count: 3`. */
function numberOf(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compare two records on one key.
 *
 * **Absent values always sort last**, whichever direction is asked for. A collection sorted by publication date should
 * begin with the oldest book, not with the two hundred that never said — flipping the direction is a request
 * about the books that answered.
 *
 * **Numbers compare as numbers when both sides are numbers.** A frontmatter field is text as far as the schema is
 * concerned, and comparing `use_count` as text puts 12 before 3.
 */
function compareOn<T>(a: T, b: T, spec: SortSpec, ctx: ArrangeContext<T>, access: ArrangeAccess<T>): number {
  const dir = spec.desc ? -1 : 1;
  // The collection's own order where it has one, else the field's — a value named once is named everywhere.
  const placed = ctx.fieldValues?.[spec.key] ?? fieldValuesFor(spec.key);
  // Absent sorts last unless the reader has placed the "no value" row, in which case they have said where it
  // goes and sorting follows the same order grouping does — otherwise one collection produces two sequences.
  const nonePlaced = placed?.some((entry) => entry.value === NONE_VALUE) ?? false;
  const text = (value: string, other: string): number => {
    if (!value && !other) return 0;
    if (!value && !nonePlaced) return 1; // missing last, regardless of direction
    if (!other && !nonePlaced) return -1;
    // The reader's own order for this field, where they gave one. Sorting by a field whose values are ordered has
    // to agree with grouping by it, or one dialog produces two different sequences for the same column.
    const placedBy = compareValues(placed, value, other);
    if (placedBy !== null) return placedBy * dir;
    const left = numberOf(value);
    const right = numberOf(other);
    if (left !== null && right !== null) return (left - right) * dir;
    return value.localeCompare(other) * dir;
  };
  const num = (value: number | null, other: number | null): number => {
    if (value === null && other === null) return 0;
    if (value === null) return 1;
    if (other === null) return -1;
    return (value - other) * dir;
  };

  const special = access.compareSpecial?.(a, b, spec, { text, num }, ctx);
  if (special !== null && special !== undefined) return special;
  return text(access.textOf(a, spec.key), access.textOf(b, spec.key));
}

/**
 * How a title note is read — the keys that mean more than a frontmatter lookup, and the fields behind them.
 *
 * The default everywhere, so a caller arranges titles without saying so. The reading records' own
 * access lives beside their row code, in `record-arrange.ts`.
 */
const titleAccess: ArrangeAccess<LibraryRecord> = {
  valuesOf: groupValues,
  textOf: fieldText,
  compareSpecial(a, b, spec, helpers, ctx) {
    // Destructured inside rather than in the parameter list: pulling `text` and `num` out of the object they belong
    // to is exactly the unbound-method shape the lint rule objects to, even where the helpers do not use `this`.
    const text = (left: string, right: string): number => helpers.text(left, right);
    const num = (left: number | null, right: number | null): number => helpers.num(left, right);
    switch (spec.key) {
      case KEY_SERIES:
        // Series name first, then position within it — "sort by series" means reading order, and a bare name
        // comparison would interleave books 1, 10 and 2.
        return text(a.series, b.series) || num(seriesIndexOf(a), seriesIndexOf(b));
      case KEY_RATING:
        return num(a.rating, b.rating);
      case KEY_LAST_OPENED:
        return num(ctx.lastOpenedOf(a) || null, ctx.lastOpenedOf(b) || null);
      default:
        return null;
    }
  },
  // Title, then path: two books with the same author and title would otherwise swap places depending on the
  // order the vault happened to list files in.
  tieBreak: (a, b) =>
    titleSortKey(a.title).localeCompare(titleSortKey(b.title)) || a.notePath.localeCompare(b.notePath),
};

/**
 * Sort by each key in turn, falling back to title and then to the note's path.
 *
 * The path tie-break is what makes the order STABLE across repaints: two books with the same author and title
 * would otherwise swap places depending on the order the vault happened to list files in.
 */
export function sortRecords<T = LibraryRecord>(
  records: T[],
  sort: SortSpec[],
  ctx: ArrangeContext<T>,
  access: ArrangeAccess<T> = titleAccess as unknown as ArrangeAccess<T>
): T[] {
  const specs = sort.filter((spec) => spec.key);
  // A collection that named no sort is sorted by whatever the species considers its identity — the tie-break,
  // which for a title is its own name and for a record is where in the book it sits.
  return [...records].sort((a, b) => {
    for (const spec of specs) {
      const result = compareOn(a, b, spec, ctx, access);
      if (result !== 0) return result;
    }
    return access.tieBreak(a, b);
  });
}

/**
 * Cut a sorted list into groups.
 *
 * **A book with three authors appears under all three.** Filing it under the first would hide it from two of the
 * people who wrote it, and a grouped collection is how someone browses by author — the counts summing to more than the
 * collection is the honest consequence, not a bug.
 *
 * Groups are ordered by label, with the unlabelled one ("no series", "no author") last: it is the leftovers, and
 * leftovers go at the end.
 */
export function groupRecords<T = LibraryRecord>(
  records: T[],
  key: GroupKey,
  noneLabel: string,
  values?: FieldValue[],
  dates?: DateGrouping<T>,
  access: ArrangeAccess<T> = titleAccess as unknown as ArrangeAccess<T>
): RecordGroup<T>[] {
  if (!key || key === GROUP_NONE) return [{ label: '', records }];
  if (dates?.bucket) return groupByDate(records, key, noneLabel, dates, access);
  // Keyed by the folded value, so `Book` and `book` are one group — but the heading keeps the spelling the first
  // record used, because lowercasing every heading would file "Biography" under "biography".
  const groups = new Map<string, { spelling: string; records: T[] }>();
  const ungrouped: T[] = [];
  for (const record of records) {
    const values = access.valuesOf(record, key).filter((v) => v.trim().length > 0);
    if (values.length === 0) {
      ungrouped.push(record);
      continue;
    }
    for (const value of values) {
      const group = groups.get(foldValue(value));
      if (group) group.records.push(record);
      else groups.set(foldValue(value), { spelling: value.trim(), records: [record] });
    }
  }
  // The heading is the reader's word for the value where they gave one; the records are grouped by the value
  // itself, so renaming a heading never regroups anything.
  const rows = [...groups.values()].map(({ spelling, records: list }) => ({ value: spelling, records: list }));
  // A reader who has placed the "no value" row has said where the leftovers go, and it is not always last:
  // unflagged books belong at the top of a shelf ordered by reading status. Unplaced, they stay at the end,
  // because leftovers with no instruction are leftovers.
  const placedNone = values?.some((entry) => entry.value === NONE_VALUE) ?? false;
  if (ungrouped.length > 0 && placedNone) rows.push({ value: NONE_VALUE, records: ungrouped });
  // Numbers as numbers, as sorting compares them (`compareOn`): compared as text, groups of 3 and 12 ran "12, 3".
  rows.sort((a, b) => compareValues(values, a.value, b.value) ?? compareGroupValues(a.value, b.value));
  // `labelOf` answers with the value itself when nothing was named, which for the none row is the empty string —
  // so the collection's own word for the leftovers is what fills in.
  const out = rows.map(({ value, records: list }) => ({
    label: labelOf(values, value) || noneLabel,
    records: list,
    value,
  }));
  if (ungrouped.length > 0 && !placedNone) out.push({ label: noneLabel, records: ungrouped, value: NONE_VALUE });
  return out;
}

/** What a date grouping needs: which bucket, when "now" is, and where a timestamp comes from. */
export interface DateGrouping<T = LibraryRecord> {
  bucket?: TimeFrame;
  /** Passed in rather than read from the clock, so an aging grouping can be tested at its boundaries. */
  now?: CalendarDate;
  /** For `file.last-opened`, which lives in the sidecars rather than in frontmatter. */
  timestampOf?: (record: T) => number | null;
}

/**
 * Group by where a date falls rather than by what it says.
 *
 * **The bucket's key is the group's value**, so ordering is chronological without anyone comparing "August" to
 * "December" — and `reverse` then reads newest-first for free. The label is written for a reader and never
 * sorted on.
 *
 * A value that is not a date joins the leftovers, which a bucketed field names "No date": having nothing there is
 * a different fact from having something unreadable, but neither is a month.
 */
function groupByDate<T>(
  records: T[],
  key: GroupKey,
  noneLabel: string,
  dates: DateGrouping<T>,
  access: ArrangeAccess<T>
): RecordGroup<T>[] {
  const frame = dates.bucket;
  if (!frame) return [{ label: '', records }];
  const now = dates.now ?? today();
  const groups = new Map<string, { label: string; records: T[] }>();
  const ungrouped: T[] = [];
  for (const record of records) {
    // `file.last-opened` is not in frontmatter — it is what the sidecars know, so the caller supplies it.
    const raw: Array<string | number | null> =
      key === KEY_LAST_OPENED ? [dates.timestampOf?.(record) ?? null] : access.valuesOf(record, key);
    const buckets = raw
      .map((value) => parseRecordDate(value))
      .filter((date): date is CalendarDate => date !== null)
      // A date that does not say enough for this frame — a year-only value asked which month — answers null and
      // joins the leftovers, where it is counted rather than filling January.
      .map((date) => bucketOf(date, frame, now))
      .filter((bucket): bucket is TimeBucket => bucket !== null);
    if (buckets.length === 0) {
      ungrouped.push(record);
      continue;
    }
    for (const bucket of buckets) {
      const found = groups.get(bucket.key);
      if (found) found.records.push(record);
      else groups.set(bucket.key, { label: bucket.label, records: [record] });
    }
  }
  const out = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, group]) => ({ label: group.label, records: group.records, value }));
  if (ungrouped.length > 0) out.push({ label: noneLabel, records: ungrouped, value: NONE_VALUE });
  return out;
}

/**
 * Put the groups in the order the collection asked for.
 *
 * **Ties keep the order they arrived in**, which is the value order — so ordering by size never scrambles two
 * equal groups differently between paints, and a summary read every morning stays where it was.
 *
 * **The group with no value stays last when reordered.** It is not a value, so it has no place in a value's order
 * read backwards or by size: reversed, a list of years opened on "No date" above the newest year. Value order
 * leaves it where it is, because there it may be where the reader put it (the Fields page places "No value").
 */
export function orderGroups<T = LibraryRecord>(
  groups: RecordGroup<T>[],
  order: GroupOrder | undefined
): RecordGroup<T>[] {
  if (!order || order === 'value') return groups;
  const none = groups.filter((group) => group.value === NONE_VALUE);
  const named = groups.filter((group) => group.value !== NONE_VALUE);
  // Reverse is the value order read backwards — newest-first for a date bucket, Z–A for anything else. A
  // date-only rule would mean one setting quietly meaning "oldest first" for one field and "newest first" for
  // another, which is fine to write and horrible to explain.
  if (order === 'reverse') return [...named.reverse(), ...none];
  const sign = order === 'most' ? -1 : 1;
  const sized = named
    .map((group, index) => ({ group, index }))
    .sort((a, b) => sign * (a.group.records.length - b.group.records.length) || a.index - b.index)
    .map((entry) => entry.group);
  return [...sized, ...none];
}

/**
 * Add a row for every value nothing in the collection uses.
 *
 * **`declared` is the vocabulary; `naming` is what this collection calls it.** They are different lists and the
 * difference matters: a collection's own value list accumulates whatever its records once held — a vault
 * mid-migration leaves `01-reading` and `03-read` in it long after the last note carrying them was changed — and
 * enumerating THAT list would invent rows for values the collection can no longer contain. What exists is the
 * field's list, which the reader owns on the Fields page. What it is called and what order it comes in is the
 * collection's business.
 *
 * **Matched by value, never by label.** Two values can share a name: `01-reading` can also be shown as
 * "Reading", so keying on the heading would treat it as a group already present and drop it.
 *
 * Empty rows sit in value order with the rest rather than at the end: the fields table decides where a value
 * goes, and having none of something is not a reason to move it.
 */
export function withEmptyGroups<T = LibraryRecord>(
  groups: RecordGroup<T>[],
  declared: FieldValue[] | undefined,
  naming?: FieldValue[]
): RecordGroup<T>[] {
  if (!declared?.length) return groups;
  const order = naming?.length ? naming : declared;
  const present = new Set(groups.map((group) => group.value).filter((value): value is string => value !== undefined));
  const added: RecordGroup<T>[] = [];
  for (const entry of declared) {
    // The leftovers row is placed by `groupRecords`, which knows whether there are any — it is not a value the
    // vocabulary can be missing.
    if (entry.value === NONE_VALUE || present.has(entry.value)) continue;
    added.push({ label: labelOf(order, entry.value) || entry.value, records: [], value: entry.value });
  }
  if (added.length === 0) return groups;
  return [...groups, ...added].sort((a, b) => {
    if (a.value === undefined || b.value === undefined) return 0;
    return compareValues(order, a.value, b.value) ?? a.label.localeCompare(b.label);
  });
}

/** Sort, then group — in that order, so a group's contents keep the collection's own ordering. */
export function arrangeRecords<T = LibraryRecord>(
  records: T[],
  groupBy: GroupKey,
  sort: SortSpec[],
  noneLabel: string,
  ctx: ArrangeContext<T>,
  order?: GroupOrder,
  bucket?: TimeFrame,
  /** How to read this species — see `ArrangeAccess`. Titles by default, so a caller that names none arranges titles. */
  access: ArrangeAccess<T> = titleAccess as unknown as ArrangeAccess<T>
): RecordGroup<T>[] {
  return orderGroups(
    groupRecords(
      sortRecords(records, sort, ctx, access),
      groupBy,
      noneLabel,
      // The collection's list over the field's, per value — see `effectiveValues`. A collection that names two
      // statuses of six still gets the field's names for the other four.
      effectiveValues(ctx.fieldValues?.[groupBy], fieldValuesFor(groupBy)),
      // A bucketed field takes its headings from the calendar instead, so the value names above do not apply —
      // `groupByDate` never consults them.
      { bucket, timestampOf: (record) => ctx.lastOpenedOf(record) || null },
      access
    ),
    order
  );
}
