// Which notes a Replace of a book folder takes away. See docs/design/notes-export.md, "Conflict resolution".

import { GENERATED_NOTE_SET } from './export-format';

/** A note already in a set's folder, with the properties the metadata cache read from it. */
export interface FolderNote {
  path: string;
  frontmatter: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The notes a **Replace** takes away: what an earlier export of this book wrote as this set — `orbis_generated:
 * note-set`, this set's `note_set` and a `book` that is this book. Whatever this run writes again is overwritten
 * rather than removed; the caller leaves those out.
 *
 * **Replace means this run's notes are the whole set.** Chapter files are numbered in the order they are written, so
 * a chapter dropped or added renumbers every one after it, and an earlier run's notes left behind would sit beside
 * the new ones — listed twice in the contents note, whose Base finds the set by `note_set`. Anything else in the
 * folder is someone else's: the reader's own notes, Save as Markdown's, another book's set.
 *
 * **Only the folder's own notes are passed in**, never a search of the vault: a merge writes its draft to a folder
 * of its own carrying the SAME `note_set`, and a match across the vault would take the draft for leftovers of the
 * set, or the set for leftovers of the draft. `key` gives the name a chapter note's key was written under, for a set
 * whose keys follow the vault's language; the English name is read too.
 */
export function earlierSetNotes(
  notes: readonly FolderNote[],
  noteSetSlug: string,
  isThisBook: (link: string, notePath: string) => boolean,
  key: (canonical: string) => string = (k) => k
): string[] {
  const read = (fm: Readonly<Record<string, unknown>>, canonical: string): unknown =>
    fm[key(canonical)] ?? fm[canonical];
  return notes
    .filter(({ path, frontmatter: fm }) => {
      if (fm?.orbis_generated !== GENERATED_NOTE_SET || read(fm, 'note_set') !== noteSetSlug) return false;
      const book = read(fm, 'book');
      return typeof book === 'string' && isThisBook(book, path);
    })
    .map((n) => n.path);
}
