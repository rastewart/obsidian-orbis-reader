// What happens to a title note when its book leaves the vault.
//
// **A record whose book is gone is a record of nothing.** Deleting a book already removes its reading data; a note
// describing it left behind would point at a file that no longer exists, and the catalog would count it as a title.
//
// **But the note may be the reader's now.** This is the same veto the reading records use when an annotation is
// deleted (`recordKeepReason` in reader/annotation-records.ts), for the same reason and with the same three
// answers: they wrote in it, they added properties of their own, or something links to it. A note that is purely what
// ORBIS wrote — the frontmatter, and the `%%orbis:begin%%` region holding the book's embed — is ours to remove; anything
// else stays, and the reader deletes it if they want to.
//
// See docs/design/library.md §When a book is deleted.

import { ORBIS_REGION_END, ORBIS_REGION_START } from './record-note';
import { candidatePaths } from './resolve';

/**
 * Whether this record link names the book at `bookPath` — **without needing the file to exist**.
 *
 * `resolveRecordFile` cannot answer this question at delete time: the book has already left the vault, so both
 * `getAbstractFileByPath` and Obsidian's linkpath search come back empty, every record fails to match, and the
 * cleanup would silently conclude the book had no title note.
 *
 * So the comparison is textual, in two steps. An exact path hit — the link read as a path from any ancestor of
 * the note — is unambiguous and tried first. Failing that, the final segment: a shortest-form `[[Book.epub]]` is
 * only valid in Obsidian when that name is unique in the vault, so the name IS the identity. The caller still
 * has to handle two records naming one book, since uniqueness is Obsidian's rule and not a guarantee.
 *
 * **Only a shortest-form link is matched by name.** A link with a folder in it names that path and nothing else —
 * Obsidian writes one exactly when the name alone is not unique — so a book of the same name in another folder is a
 * different book, and its title note is not this one's to trash or re-point.
 *
 * **Nor is a name that is still a file's path.** A book at the top of the vault has no folder in its link, so its
 * `[[Book.epub]]` looks shortest-form — and deleting a book of the same name in another folder trashed or trimmed the
 * top-level book's note. A link that still reads as the path of a file that `exists` names that file, not this book.
 */
export function linkNamesFile(
  link: string,
  bookPath: string,
  fromPath: string,
  exists: (path: string) => boolean
): boolean {
  const clean = link.split('#')[0].trim();
  if (!clean) return false;
  const paths = candidatePaths(clean, fromPath);
  if (paths.includes(bookPath)) return true;
  if (clean.includes('/')) return false;
  if (paths.some(exists)) return false;
  const linkName = clean.split('/').pop() ?? '';
  const bookName = bookPath.split('/').pop() ?? '';
  return linkName !== '' && linkName === bookName;
}

/**
 * The body with Orbis's own region taken out — what is left is the reader's.
 *
 * Markers rather than a heuristic, and the same constants `recordNoteContent` writes, so the two cannot drift. An
 * unterminated region — a note edited into an odd state — takes everything after the opening marker with it, because
 * the alternative reads half of our own block as somebody's writing.
 */
function withoutOwnedRegion(body: string): string {
  const start = body.indexOf(ORBIS_REGION_START);
  if (start === -1) return body;
  const endMarker = body.indexOf(ORBIS_REGION_END, start);
  const end = endMarker === -1 ? body.length : endMarker + ORBIS_REGION_END.length;
  return body.slice(0, start) + body.slice(end);
}

/** Why a title note outlived its book. Null = nothing of the reader's in it, so it can go. */
export type TitleNoteKeepReason = 'wrote' | 'properties' | 'linked' | 'other-files';

/**
 * Every frontmatter key the library itself writes into a title note.
 *
 * A literal list for the same reason the records have one: it is the *runtime* set that decides whether a file is
 * deleted, and a type does not exist at runtime. `title-note-cleanup.test.ts` asserts it against what
 * `recordFrontmatter` actually emits, so a new property that is not listed here fails the suite rather than
 * quietly making every record look reader-edited.
 */
export const TITLE_NOTE_PROPERTY_KEYS: readonly string[] = [
  'orbis_note',
  'title',
  'aliases',
  'type',
  'genre',
  'authors',
  'publisher',
  'publication_date',
  'language',
  'series',
  'series_index',
  'isbn',
  'cover',
  'files',
  'source',
  'source_id',
  'source_url',
  'source_notes',
  'added',
];

/**
 * Whether this title note has to survive the book it describes — and if so, why.
 *
 * `otherFiles` is the case the reading records do not have: one record can list several editions of a title, and
 * deleting the EPUB is not a statement about the PDF beside it. The note stays, minus the link to what left.
 *
 * `reading_status`, a rating, a review below the frontmatter — all of that reads as `properties` or `wrote`, which
 * is the intent: a book you finished and rated is a book you have something to say about, whether or not a copy
 * of it is still in the vault.
 */
export function titleNoteKeepReason(args: {
  /** Everything below the frontmatter. */
  body: string;
  frontmatter: Record<string, unknown> | undefined;
  /** `metadataCache.resolvedLinks`: source path → target path → count. */
  resolvedLinks: Record<string, Record<string, number>>;
  path: string;
  /** Files the record still lists once the deleted book's link is taken out. */
  otherFiles: readonly string[];
}): TitleNoteKeepReason | null {
  if (args.otherFiles.length > 0) return 'other-files';
  // Prose the READER wrote — which is everything except the region Orbis owns. `recordNoteContent` writes
  // `%%orbis:begin%% … %%orbis:end%%` around the book's embed; counting that region would make a note the cataloging
  // review just wrote read as "you wrote in this" and be kept, with its `files` trimmed to nothing. A rule that
  // decides whether somebody's note survives has to know its own handwriting.
  if (withoutOwnedRegion(args.body).trim().length > 0) return 'wrote';
  const extra = Object.keys(args.frontmatter ?? {}).some((key) => !TITLE_NOTE_PROPERTY_KEYS.includes(key));
  if (extra) return 'properties';
  // A title note links to its book, its cover and its source notes, never to another title note — so its own
  // entry is skipped rather than trusted to be absent.
  for (const [source, targets] of Object.entries(args.resolvedLinks)) {
    if (source !== args.path && targets[args.path]) return 'linked';
  }
  return null;
}
