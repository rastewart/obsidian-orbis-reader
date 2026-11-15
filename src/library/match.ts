// Deciding whether a stray file belongs to a record you already have. See docs/design/library.md.
//
// **Suggest, never decide.** The two mistakes are not symmetrical: a wrong attach corrupts a record someone
// curated — it now claims a file that is not that book, and it has to be noticed before it can be undone —
// while a wrong create leaves a note you delete in seconds. So creating is the default and matching only ever
// produces an offer.
//
// Signals are ranked by how hard they are to get wrong, and each one is a rule you could explain to the person
// being asked. Anything fuzzier than these belongs to a human looking at two titles.

import type { LibraryRecord } from './record';

/** A record, plus where its files actually are — resolution needs the vault, so the caller does it. */
export interface RecordForMatch {
  record: LibraryRecord;
  filePaths: string[];
}

/** What we know about the file being cataloged. `title` is the OPF's, not the filename's, wherever possible. */
export interface MatchCandidate {
  path: string;
  title: string;
  authors: string[];
  isbn: string;
}

/** Why a record was offered, strongest first. Shown to the reader, so each has to be explainable. */
export type MatchReason = 'sibling' | 'isbn' | 'title-author';

export interface RecordMatch {
  record: LibraryRecord;
  reason: MatchReason;
}

/** Folder and basename of a path, for the sibling test. */
function splitPath(path: string): { folder: string; base: string } {
  const parts = path.split('/');
  const name = parts.pop() ?? '';
  return { folder: parts.join('/').toLowerCase(), base: name.replace(/\.[^.]+$/, '').toLowerCase() };
}

/**
 * A title reduced to what two spellings of the same book share.
 *
 * Folds case, diacritics and punctuation, and drops a leading article. **Trailing parentheticals stay**, because
 * `(Sample Series Book #3)` is precisely what distinguishes one book in a series from the next — stripping
 * them would merge a whole series into one book.
 */
export function normalizeTitle(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      // After collapsing, not before: punctuation becomes a space, so `"The Whale"` arrives here with a leading
      // one and an article stripped first would never match.
      .replace(/^(the|a|an)\s+/, '')
  );
}

/**
 * A person's name, in a form that survives the two orders catalogs write.
 *
 * An OPF says `Jane Doe` and a Calibre export says `Doe, Jane`; sorting the parts makes those the same string. It
 * also makes `Doe Jane` match a hypothetical `Jane Doe` that is a different person,
 * which is a trade worth taking: an author name is only ever used here to CONFIRM a title match, never to make
 * one on its own.
 */
export function normalizeAuthor(author: string): string {
  return author
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .sort()
    .join(' ');
}

/** Do these two author lists name anyone in common? */
function sharesAuthor(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const left = new Set(a.map(normalizeAuthor).filter((v) => v.length > 0));
  return b.map(normalizeAuthor).some((name) => name.length > 0 && left.has(name));
}

/**
 * Records this file might already belong to, best first.
 *
 * - **`sibling`** — a record already links a file with the same name in the same folder, differing only by
 *   extension. That is the two-format case `files` exists for, it costs no metadata at all, and it is very hard
 *   to get wrong.
 * - **`isbn`** — both sides carry the same ISBN. An ISBN identifies an edition, so a match is near-certain; an
 *   absence means nothing, which is why this cannot be the only test.
 * - **`title-author`** — the normalized titles are equal AND a normalized author is shared. Title alone is
 *   deliberately not enough: `Collected Poems` is two hundred different books.
 */
export function findMatches(candidate: MatchCandidate, records: RecordForMatch[]): RecordMatch[] {
  const here = splitPath(candidate.path);
  const title = normalizeTitle(candidate.title);
  const isbn = candidate.isbn.trim().toLowerCase();
  const matches: RecordMatch[] = [];

  for (const entry of records) {
    // A record that already links this exact file is not a match, it is the answer — and the caller would not be
    // asking about a file that is already cataloged.
    if (entry.filePaths.some((p) => p.toLowerCase() === candidate.path.toLowerCase())) continue;

    const sibling = entry.filePaths.some((p) => {
      const there = splitPath(p);
      return there.folder === here.folder && there.base === here.base;
    });
    if (sibling) {
      matches.push({ record: entry.record, reason: 'sibling' });
      continue;
    }
    if (isbn && entry.record.isbn.toLowerCase() === isbn) {
      matches.push({ record: entry.record, reason: 'isbn' });
      continue;
    }
    if (
      title &&
      normalizeTitle(entry.record.title) === title &&
      sharesAuthor(candidate.authors, entry.record.authors)
    ) {
      matches.push({ record: entry.record, reason: 'title-author' });
    }
  }

  const rank: Record<MatchReason, number> = { sibling: 0, isbn: 1, 'title-author': 2 };
  return matches.sort((a, b) => rank[a.reason] - rank[b.reason]);
}
