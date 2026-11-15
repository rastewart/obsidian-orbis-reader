// The title note a converted book gets, written as the book is written.
//
// **Both EPUB generators are ours, so a converted book should not have to be discovered.** Cataloging exists for
// files that arrived from somewhere else and have to be guessed at; a book Orbis just made from a note in this
// vault knows its own title, its author, where it came from and — because the dialog asks — what kind of thing it
// is. Leaving it to the scanner would mean guessing at facts we were holding a moment earlier.
//
// **The record is about the EPUB, so the EPUB is its identity.** Same output path means update that note; a new
// path means a new one. Convert a note twice to two destinations and there are two books, two records and one
// source note linked from both — honest, because they are two books with two reading positions. It also means a
// record the converter did not write can be updated: regenerate over a cataloged book and its record follows the
// file, gaining `source_notes` it never had.
//
// See docs/design/markdown-to-epub.md §The library.

import { type App, TFile } from 'obsidian';
import { vaultCandidates } from './candidates';
import { takenNotePaths } from './cataloging';
import { linkTarget, parseRecord, toStringList } from './record';
import { recordFrontmatter, recordLinkText, uniqueNotePath } from './record-note';
import { resolveRecordFile } from './resolve';

/** What the converter knows about the book it just wrote. Everything here came from the dialog or from the run. */
export interface ConvertedBook {
  /** The EPUB, already written. Its path is the record's identity. */
  file: TFile;
  title: string;
  author: string;
  language: string;
  publisher: string;
  publicationDate: string;
  /** The medium the reader picked. */
  type: string;
  /** Notes this book was made from: one, or one per note for a folder converted into one book. */
  sourceNotes: readonly TFile[];
  /** `markdown-note` for one note and for each book of a split; `markdown-folder` for a folder as one book. */
  source: 'markdown-note' | 'markdown-folder';
  /** Read from the source note and written only when creating — see `sourceUrl` below. */
  sourceUrl?: string;
}

/**
 * The record that already describes this file, if there is one.
 *
 * The same lookup Read and Listen do — a record's `files` resolved against the vault — because "the record about
 * this book" has to mean the same thing everywhere. Path comparison alone would miss a record that links the file
 * by a different but equivalent link text.
 */
function recordForFile(app: App, file: TFile): TFile | null {
  for (const note of vaultCandidates(app)) {
    const record = parseRecord(note.path, note.frontmatter);
    if (!record) continue;
    for (const link of record.files) {
      if (resolveRecordFile(app, link, note.path)?.path === file.path) {
        const found = app.vault.getAbstractFileByPath(note.path);
        if (found instanceof TFile) return found;
      }
    }
  }
  return null;
}

/**
 * Write or update the title note for a book the converter just made.
 *
 * **The dialog's fields are authoritative; everything else on the note is untouched.** Retype the author and
 * regenerate and the record says the new one — a note that kept the old would be a defect, not a courtesy. But a
 * rating, a reading status, tags and a hand-written body all survive, because the dialog has no opinion about
 * them. `aliases` follows the title since it is a copy of it; the note's **filename does not**, because renaming
 * a note to match a retitled book breaks every link into it.
 */
export async function writeConvertedTitleNote(
  app: App,
  book: ConvertedBook,
  opts: { folder: string; added: string; taken?: Set<string> }
): Promise<string> {
  const existing = recordForFile(app, book.file);
  if (existing) {
    await app.fileManager.processFrontMatter(existing, (fm: Record<string, unknown>) => {
      fm.title = book.title;
      fm.aliases = [book.title];
      if (book.author) fm.authors = [book.author];
      if (book.language) fm.language = book.language;
      if (book.publisher) fm.publisher = book.publisher;
      if (book.publicationDate) fm.publication_date = book.publicationDate;
      if (book.type) fm.type = book.type;
      fm.source = book.source;
      fm.source_notes = book.sourceNotes.map((note) => `[[${recordLinkText(note)}]]`);
      // Only when the note has none: it was read from the source note rather than typed into the dialog, so a
      // value the reader has since corrected on the record is theirs and not ours to overwrite.
      if (book.sourceUrl && !fm.source_url) fm.source_url = book.sourceUrl;
      // The file it already links, kept — unless the book landed somewhere new, which is a different record.
      //
      // **Compared by what each link RESOLVES to, not by its text.** `linkTarget` returns the link as written —
      // `5 Conversations….epub`, shortest-form, as Obsidian writes it — which never equals a vault path like
      // `notes/5 Conversations….epub`. So the test never matched, and every regeneration appended the same book
      // again: three conversions, three identical rows in `files`. This is the same lookup `recordForFile` uses
      // to decide the record belongs to this book, and the two have to agree.
      //
      // Duplicates already written are collapsed on the way past, which is the only repair the reader gets: the
      // rows are identical and no information distinguishes them, so keeping the first is a complete answer. A
      // link that resolves to nothing is kept as written — a book that is missing today may be back tomorrow,
      // and its row is the only record that it was ever here.
      const seen = new Set<string>();
      const files = toStringList(fm.files).filter((link) => {
        const key = resolveRecordFile(app, linkTarget(link), existing.path)?.path ?? link;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      fm.files = seen.has(book.file.path) ? files : [...files, `[[${recordLinkText(book.file)}]]`];
    });
    return existing.path;
  }

  const dir = opts.folder.replace(/^\/+|\/+$/g, '');
  const taken = opts.taken ?? takenNotePaths(app);
  const path = uniqueNotePath(dir, book.title, taken);
  const content = recordFrontmatter({
    title: book.title,
    authors: book.author ? [book.author] : undefined,
    type: book.type,
    publisher: book.publisher,
    publicationDate: book.publicationDate,
    language: book.language,
    files: [recordLinkText(book.file)],
    source: book.source,
    sourceUrl: book.sourceUrl,
    sourceNotes: book.sourceNotes.map((note) => recordLinkText(note)),
    added: opts.added,
  });
  await app.vault.create(path, content);
  return path;
}
