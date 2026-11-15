// Searching the catalog by hand. See docs/design/library.md.
//
// **This is not Obsidian's search and does not try to be.** That one reads the whole note and is a keystroke away
// already; this one narrows a set of titles to the ones you are looking at, in the view you are looking at them
// in, so the result can be read, listened to or opened as a shelf. Title, author and series only — the fields you
// would name a book by.

import type { LibraryRecord, ReadingRecord } from './record';

/** Lower-cased, whitespace-collapsed terms. Empty when the query is only spaces. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Whether a record matches every term.
 *
 * **All terms, anywhere in the haystack** — "tester harbor" finds the book, and so does "harbor tester",
 * because nobody remembers which field they are typing. Substring rather than word-prefix so "harb" finds
 * *Harbor*: a catalog is full of titles you half-remember.
 */
export function matchesQuery(record: LibraryRecord, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const haystack = [record.title, ...record.authors, record.series].join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/**
 * The matching records, best first.
 *
 * A title that STARTS with what you typed comes before one that merely contains it, and a match in the title
 * before one that is only in the author or series — otherwise typing "harbor" puts thirty books about harbors
 * ahead of one titled *Harbor*. Everything after that is alphabetical, so the tail of a broad search is at least
 * predictable.
 */
export function searchRecords(records: LibraryRecord[], query: string): LibraryRecord[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return records
    .filter((record) => matchesQuery(record, terms))
    .map((record) => ({ record, rank: matchRank(record, terms) }))
    .sort((a, b) => a.rank - b.rank || a.record.title.localeCompare(b.record.title))
    .map((entry) => entry.record);
}

function matchRank(record: LibraryRecord, terms: string[]): number {
  const title = record.title.toLowerCase();
  if (terms.every((term) => title.startsWith(term))) return 0;
  if (terms.every((term) => title.includes(term))) return 1;
  return 2;
}

/**
 * The reading records matching every term, in reading order.
 *
 * **The passage, your note, the book and the chapter** — what someone would type to find a highlight again. `mark`
 * is in the haystack too, so "important" finds the ones you marked that way even though the mark is a chip on the
 * row rather than words in it.
 *
 * **No ranking, unlike a title search.** A record has no single field that IS its name — a highlight is a sentence
 * from the middle of a book — so "matched in the title" has no meaning here, and reading order is the answer that
 * can be read: the passages come back in the order they appear in the books they came from. Callers pass them
 * through the collection's own sort afterwards if it asked for one.
 */
export function searchReadingRecords(records: readonly ReadingRecord[], query: string): ReadingRecord[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return records.filter((record) => {
    const haystack = [record.excerpt, record.noteText, record.bookTitle, record.chapter, record.mark]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
