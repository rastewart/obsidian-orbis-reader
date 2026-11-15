// What a downloaded book is called, and where it goes. See docs/design/book-sources.md.
//
// **Not the name the URL gives.** An acquisition URL is usually `download.epub`, a bare id, or something with no
// extension at all — `https://www.gutenberg.org/ebooks/1342.epub.noimages` is a real one. Title and author is what a
// vault is organized by and what a reader recognizes in a file list, and it is what the entry already told us.
//
// Pure: a name in, a name out. The vault decides what already exists; this decides what to call the thing and how to
// step aside when the name is taken.

import { sanitizeNoteName } from '../library/record-note';

/**
 * The filename for a book, without its folder: `Title - Author.epub`.
 *
 * **Title first**, because a folder of downloads is scanned by title far more often than by author, and a list sorted
 * by name is then sorted by the thing you are looking for.
 *
 * The author is the first one only. A book with four authors gives a filename nobody can read, and the note that
 * describes it carries all four — which is the division of labor the whole library rests on: the file is a file, the
 * note is the record.
 *
 * Sanitized by the same function that names a title note, so a book and its note cannot disagree about which
 * characters a filesystem tolerates.
 */
export function downloadFileName(title: string, authors: readonly string[], ext: string, edition = ''): string {
  const author = authors[0]?.trim() ?? '';
  const named = author ? `${title} - ${author}` : title;
  // The edition after the author, so two editions of one book sort side by side — see `downloadEdition`. Room is made
  // for it under the 120-character cap: cut off, two editions of a long title would share a name again.
  const suffix = edition ? ` (${sanitizeNoteName(edition)})` : '';
  const stem = suffix
    ? `${sanitizeNoteName(named)
        .slice(0, 120 - suffix.length)
        .trimEnd()}${suffix}`
    : sanitizeNoteName(named);
  return `${stem}.${ext}`;
}

/**
 * Where the file goes, stepping aside from anything already there: `Books/Sample Book - Orbis Tester (2).epub`.
 *
 * **Never overwrites.** A file in the vault may be one the reader has already started, with a reading position, marks
 * and a title note pointing at it — and replacing it with bytes from a server is the one mistake here that cannot be
 * undone. When the intent really is "get this again", deleting the old one first says so.
 *
 * `taken` is compared case-insensitively: `sample.epub` and `Sample.epub` are one file on macOS and two on
 * Android, and a name that collides on one device has to collide on both or a synced vault grows near-duplicates.
 */
export function uniqueDownloadPath(folder: string, fileName: string, taken: ReadonlySet<string>): string {
  const dir = folder.replace(/^\/+|\/+$/g, '');
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  const lower = new Set([...taken].map((p) => p.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${stem}${ext}` : `${stem} (${n})${ext}`;
    const path = dir ? `${dir}/${name}` : name;
    if (!lower.has(path.toLowerCase())) return path;
  }
}

/**
 * Whether this exact book is already in the download folder — the same name, whatever its case.
 *
 * **Skipping is the answer, not a second copy.** A reader who taps five books, three of which they already have, wants
 * the two; and with the library on, a second copy would mean a second title note for a book they already cataloged.
 * The one thing that must not happen is silence: the row says it was skipped, and why.
 */
export function alreadyDownloaded(folder: string, fileName: string, taken: ReadonlySet<string>): string | null {
  const dir = folder.replace(/^\/+|\/+$/g, '');
  const path = dir ? `${dir}/${fileName}` : fileName;
  const wanted = path.toLowerCase();
  for (const candidate of taken) if (candidate.toLowerCase() === wanted) return candidate;
  return null;
}
