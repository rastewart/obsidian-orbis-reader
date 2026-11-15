// Turning the vault's notes into collections of records. See docs/design/library.md.
//
// This is the projection the Library view renders — the "index", which needs no database because the input is
// already in memory: Obsidian's `metadataCache` holds every note's parsed frontmatter and tags, so building this
// costs no file reads at all.
//
// Kept pure, taking candidates rather than an `App`, so the grouping and ordering rules are testable and the view
// is left with nothing but gathering and painting.

import type { LibraryCollection } from '../settings';
import { matchesCollection } from './collection';
import {
  type Frontmatter,
  type LibraryRecord,
  parseReadingRecord,
  parseRecord,
  type ReadingRecord,
  titleSortKey,
} from './record';
import { compareReadingOrder } from './record-arrange';

/** One note, as much of it as gathering and parsing need. */
export interface CatalogCandidate {
  path: string;
  frontmatter: Frontmatter | null;
  /** Every tag on the note, frontmatter and inline, without the leading `#`. */
  tags: string[];
}

export interface CollectionGroup {
  collection: LibraryCollection;
  records: LibraryRecord[];
}

/**
 * A collection of reading records, gathered the same way.
 *
 * A separate group type rather than a generic one over both species, because a caller always knows which it wants:
 * a widget draws titles or it draws records, and code that had to ask which would be code that could get it wrong.
 */
export interface RecordCollectionGroup {
  collection: LibraryCollection;
  records: ReadingRecord[];
}

export interface Catalog {
  groups: CollectionGroup[];
  /** The same, for the collections that gather reading records. */
  recordGroups: RecordCollectionGroup[];
  /** Distinct records across all collections — a note on two collections is counted once. */
  totalRecords: number;
}

/**
 * Group every record onto the collections that claim it.
 *
 * A note appears on **every** matching collection rather than the first: collections are sources, not folders, so
 * "everything tagged #scifi" and "everything in Books/" both legitimately contain the same book, and hiding it
 * from the second would make a collection lie about what it gathers.
 *
 * Records are ordered by title, ignoring a leading article, with the note path as a tie-break so the order is
 * stable across rebuilds rather than dependent on the order the vault happened to list files in.
 */
export function buildCatalog(collections: LibraryCollection[], candidates: CatalogCandidate[]): Catalog {
  // Every collection, with no enabled filter: a collection is a definition, and whether one APPEARS is a question
  // about the widget showing it. Filtering here once meant a widget rendered an empty heading for a collection that
  // was merely switched off, which reads as "empty" rather than "off".
  //
  // **Split by species first**, so a title collection never gathers a record and the reverse: the conditions would
  // often match — both species carry `book`-ish and `tags` — and a collection of highlights turning up on a shelf
  // of titles is not a filter someone can debug.
  const groups: CollectionGroup[] = collections
    .filter((collection) => (collection.species ?? 'title') === 'title')
    .map((collection) => ({ collection, records: [] }));
  const recordGroups: RecordCollectionGroup[] = collections
    .filter((collection) => collection.species === 'reading_record')
    .map((collection) => ({ collection, records: [] }));
  const seen = new Set<string>();

  for (const candidate of candidates) {
    let record: LibraryRecord | null | undefined;
    for (const group of groups) {
      if (!matchesCollection(group.collection, candidate)) continue;
      // Parsed lazily and once: most notes in a vault are not records, and parsing every note for every collection
      // would multiply the only real work here by the number of collections.
      if (record === undefined) record = parseRecord(candidate.path, candidate.frontmatter);
      if (!record) break;
      group.records.push(record);
      seen.add(record.notePath);
    }
    // The same, for the other species — and only when something asks: a vault with no record collections parses no
    // records here at all.
    if (recordGroups.length === 0) continue;
    let reading: ReadingRecord | null | undefined;
    for (const group of recordGroups) {
      if (!matchesCollection(group.collection, candidate)) continue;
      if (reading === undefined) reading = parseReadingRecord(candidate.path, candidate.frontmatter);
      if (!reading) break;
      group.records.push(reading);
    }
  }

  // Ordered by where each passage sits in its book, then by the book, so a collection of highlights reads in
  // reading order rather than in whatever order the vault listed files. `cfi_sort` is what the exporter writes for
  // exactly this, and the note path is the tie-break that keeps a rebuild stable.
  // Reading order, from the one comparison that defines it — a widget that sorts records its own way falls back to
  // the same rule, so the default here and the tie-break there cannot disagree.
  for (const group of recordGroups) group.records.sort(compareReadingOrder);

  for (const group of groups) {
    group.records.sort(
      (a, b) => titleSortKey(a.title).localeCompare(titleSortKey(b.title)) || a.notePath.localeCompare(b.notePath)
    );
  }
  return { groups, recordGroups, totalRecords: seen.size };
}
