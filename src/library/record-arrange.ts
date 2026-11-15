// Ordering a collection of reading records. See docs/design/library.md §Reading records on dashboards.
//
// **Reading order is the default and the tie-break.** A collection of passages is worth reading in the order they
// were read in — the book, then where in the book — and `cfi_sort` is what an export writes for exactly that. Any
// sort the collection asks for runs first; this is what settles the ties, which for highlights is most of them: a
// location spans paragraphs, so eight highlights in one chapter routinely share one.
//
// Pure, like `arrange.ts` next door — and built ON it rather than beside it. The rules a collection is arranged by
// are the same for both species: which group a value belongs to, where the ones that say nothing go, what a value
// is called, whether a number sorts as a number. Only the READING differs, so this file is a `ArrangeAccess` and
// two thin entry points, and there is exactly one arranger for the two of them to agree with.

import type {
  ArrangeAccess,
  ArrangeContext,
  FieldValues,
  GroupKey,
  GroupOrder,
  RecordGroup,
  SortSpec,
} from './arrange';
import { arrangeRecords, sortRecords } from './arrange';
import type { TimeFrame } from './dates';
import type { ReadingRecord } from './record';
import { recordCells } from './record-row';

/** The sort key an export wrote for a passage — opaque, derived, and never displayed. */
function cfiSortOf(record: ReadingRecord): string {
  const raw = record.raw.cfi_sort;
  return typeof raw === 'string' ? raw : '';
}

/**
 * Where two records sit relative to each other in the reading: the book, then the position, then the path.
 *
 * The path is what makes a repaint stable rather than dependent on the order the vault happened to list files in.
 */
export function compareReadingOrder(a: ReadingRecord, b: ReadingRecord): number {
  return (
    a.bookTitle.localeCompare(b.bookTitle) ||
    cfiSortOf(a).localeCompare(cfiSortOf(b)) ||
    a.notePath.localeCompare(b.notePath)
  );
}

/**
 * How a reading record is read, for the shared arranger.
 *
 * **Narrow, which is the point of the seam.** Everything the title access has to say about series positions,
 * ratings and first letters is absent here — a record has none of them — so what is left is "which cells answer
 * this key" and "what settles a tie", and every rule around those is the one both species already share.
 */
const recordAccess: ArrangeAccess<ReadingRecord> = {
  valuesOf: (record, key) => recordCells(record, key),
  textOf: (record, key) => recordCells(record, key)[0]?.trim() ?? '',
  tieBreak: compareReadingOrder,
};

/**
 * Arrange a collection of records: sorted, then cut into groups, in the order the collection asked for.
 *
 * The record species' entry point into the shared arranger, so nothing but this file has to know the access
 * exists — and so a caller cannot arrange records with the titles' reading by forgetting an argument.
 */
export function arrangeReadingRecords(
  records: ReadingRecord[],
  groupBy: GroupKey,
  sort: SortSpec[],
  noneLabel: string,
  fieldValues?: FieldValues,
  order?: GroupOrder,
  bucket?: TimeFrame
): RecordGroup<ReadingRecord>[] {
  // A record has no reading position of its own — `file.last-opened` is a book's, from the sidecars — so there is
  // no timestamp to supply and the key is never offered for a record collection.
  const ctx: ArrangeContext<ReadingRecord> = { lastOpenedOf: () => 0, fieldValues };
  return arrangeRecords(records, groupBy, sort, noneLabel, ctx, order, bucket, recordAccess);
}

/**
 * Sort records by each key in turn, then by where they sit in the book.
 *
 * The rules are the ones the title arranger settled on, because a reader who has learnt them on one shelf should
 * not have to relearn them on another: **absent values sort last whichever way the arrow points** — a collection
 * sorted by chapter should begin with the first chapter, not with the bookmarks that named none — and **numbers
 * compare as numbers**, so `loc: 12` follows `loc: 3` rather than preceding it.
 */
export function sortReadingRecords(
  records: readonly ReadingRecord[],
  sort: readonly SortSpec[],
  fieldValues?: FieldValues
): ReadingRecord[] {
  return sortRecords([...records], [...sort], { lastOpenedOf: () => 0, fieldValues }, recordAccess);
}

/**
 * The records made most recently, newest first.
 *
 * `created` is the date the annotation was made, written by the export as a plain ISO day — so this is "what have I
 * been marking lately", which is a different question from where in a book a passage sits. Records with no date go
 * last: they are not new, they are undated.
 *
 * Capped, like the titles' own recent shelf: a year of reading is thousands of records, and a widget showing the
 * most recent of them has no use for the tail.
 */
export function recentReadingRecords(records: readonly ReadingRecord[], cap = 200): ReadingRecord[] {
  const when = (record: ReadingRecord): number => {
    const parsed = Date.parse(record.created);
    return Number.isNaN(parsed) ? -Infinity : parsed;
  };
  return [...records]
    .filter((record) => record.created.trim())
    .sort((a, b) => when(b) - when(a) || compareReadingOrder(a, b))
    .slice(0, cap);
}
