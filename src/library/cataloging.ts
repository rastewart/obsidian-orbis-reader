// Finding books the catalog does not describe, and writing the notes that describe them. See
// docs/design/library.md.
//
// The whole notes-as-records model rests on this. A vault full of books and no notes shows an empty Library, which
// is the one way a notes-keyed model is worse than a file-keyed one — so cataloging has to be cheap, obvious, and
// available in bulk.

import { strFromU8, unzipSync, unzlibSync } from 'fflate';
import { MOBI } from 'foliate-js/mobi.js';
import { type App, normalizePath, TFile } from 'obsidian';
import { isBookExtension } from '../book-formats';
import { progressFilePath } from '../progress';
import { vaultCandidates } from './candidates';
import { extractCoverTo } from './cover-extract';
import { isoToday } from './dates';
import { metadataFromFb2 } from './fb2';
import { findMatches, type RecordForMatch } from './match';
import { metadataFromOpf, type OpfMetadata, opfPathFromContainer } from './opf';
import { type LibraryRecord, linkTarget, parseRecord, toStringList, toText } from './record';
import { type RecordNoteFields, recordLinkText, recordNoteContent, uniqueNotePath, wikilink } from './record-note';
import { resolveRecordFile } from './resolve';

/** Records with their files resolved — what matching needs, and what only the vault can answer. */
export function recordsWithFiles(app: App, records: LibraryRecord[]): RecordForMatch[] {
  return records.map((record) => ({
    record,
    filePaths: record.files
      .map((link) => resolveRecordFile(app, link, record.notePath))
      .filter((f): f is TFile => f !== null)
      .map((f) => f.path),
  }));
}

/** Every book file no record links to — a set difference over data already in memory. */
export function uncatalogedBooks(app: App, records: LibraryRecord[]): TFile[] {
  const linked = new Set<string>();
  for (const record of records) {
    for (const link of record.files) {
      const target = resolveRecordFile(app, link, record.notePath);
      if (target) linked.add(target.path);
    }
  }
  return app.vault
    .getFiles()
    .filter((file) => isBookExtension(file.extension) && !linked.has(file.path))
    .sort((a, b) => a.basename.localeCompare(b.basename));
}

/**
 * What a Kindle book says about itself, through the parser the reader already uses.
 *
 * MOBI and AZW3 keep their metadata in an EXTH block inside a Palm database, so there is no text to pattern-match
 * and no entry to inflate. `foliate-js/mobi.js` reads it, and it is already in the bundle for the reader's sake.
 *
 * Its `open()` initializes the whole book to get there, which is why this is the one format where asking the
 * question is expensive. Everything the record schema wants except a series, which MOBI has no field for.
 */
async function mobiMetadata(app: App, file: TFile): Promise<Partial<OpfMetadata>> {
  const blob = new Blob([await app.vault.readBinary(file)]);
  const book = await new MOBI({ unzlib: unzlibSync }).open(blob);
  const m = book.metadata;
  if (!m) return {};
  return {
    title: (m.title ?? '').trim(),
    authors: (m.author ?? []).map((name) => name.trim()).filter(Boolean),
    publisher: (m.publisher ?? '').trim(),
    // `2001-07-02T00:00:00+00:00` is what a Kindle book actually carries, and a publication DATE is the useful part
    // — the hour a converter stamped is noise in a catalog, and it makes the field wrap on a row.
    published: (m.published ?? '').trim().slice(0, 10),
    // A string in some books, a list in others: the MOBI header holds one language and EXTH can hold several.
    language: (Array.isArray(m.language) ? m.language[0] : m.language)?.trim() ?? '',
  };
}

/** One entry out of a zip, decoded as text, or null. Only the named entry is inflated. */
function readZipEntry(bytes: Uint8Array, name: string): string | null {
  try {
    const found = unzipSync(bytes, { filter: (f) => f.name === name });
    const data = found[name];
    return data ? strFromU8(data) : null;
  } catch {
    return null;
  }
}

/**
 * What a book says about itself.
 *
 * Three sources, richest first. An EPUB carries an OPF, which costs inflating two entries — not the archive,
 * because `unzipSync` takes a filter. A book that has been opened has its title and author in the `.orbis`
 * sidecar, which is the only metadata a `mobi`, `azw3` or `cbz` offers us without a format parser each. Anything
 * left falls back to the filename, which is a poor title and an honest one: inventing an author from a filename
 * would put a fiction in the catalog.
 */
export async function bookMetadata(app: App, file: TFile): Promise<OpfMetadata> {
  const meta: OpfMetadata = {
    title: '',
    authors: [],
    publisher: '',
    published: '',
    language: '',
    isbn: '',
    series: '',
    seriesIndex: '',
  };

  const ext = file.extension.toLowerCase();
  try {
    if (ext === 'epub') {
      const bytes = new Uint8Array(await app.vault.readBinary(file));
      const container = readZipEntry(bytes, 'META-INF/container.xml');
      const opfPath = container ? opfPathFromContainer(container) : null;
      const opf = opfPath ? readZipEntry(bytes, opfPath) : null;
      if (opf) Object.assign(meta, metadataFromOpf(opf));
    } else if (ext === 'fb2') {
      // The whole file as text: an FB2 is one document, and `metadataFromFb2` reads only the front of it. Decoded
      // as UTF-8 whatever the file declares — a windows-1251 book mangles its prose this way, but the tags and the
      // Latin metadata survive, and this is metadata rather than reading.
      const xml = new TextDecoder().decode(new Uint8Array(await app.vault.readBinary(file)));
      Object.assign(meta, metadataFromFb2(xml));
    } else if (ext === 'mobi' || ext === 'azw3') {
      Object.assign(meta, await mobiMetadata(app, file));
    }
  } catch {
    // A book that cannot be read is still worth cataloging under its filename — the record is about the title, and
    // a damaged file is a reason to have a record rather than a reason to skip one.
  }

  if (!meta.title || meta.authors.length === 0) {
    try {
      const sidecar = normalizePath(progressFilePath(file));
      if (await app.vault.adapter.exists(sidecar)) {
        const data = JSON.parse(await app.vault.adapter.read(sidecar)) as { title?: unknown; author?: unknown };
        // a11y-audit-disable-next-line -- `title` here is a key in the .orbis JSON, not a DOM title attribute
        if (!meta.title && typeof data.title === 'string') meta.title = data.title.trim();
        if (meta.authors.length === 0 && typeof data.author === 'string' && data.author.trim()) {
          meta.authors = [data.author.trim()];
        }
      }
    } catch {
      // An unreadable sidecar is no reason to skip the book; the filename below still gives it a record.
    }
  }

  if (!meta.title) meta.title = file.basename;
  return meta;
}

/**
 * The cover's link text.
 *
 * The file it points at was written moments ago and the vault's file list is not always caught up, so the path we
 * just wrote to is the fallback — which is what `recordLinkText` would have produced from the file anyway.
 */
function coverLink(app: App, coverPath: string, from: string): string {
  const file = app.vault.getAbstractFileByPath(coverPath);
  return file instanceof TFile ? recordLinkText(file) : coverPath;
}

/**
 * Write a record for one book, and return where it went.
 *
 * `taken` is the caller's running set of paths, so a bulk run cannot collide with a note it wrote a moment ago —
 * the vault's own file list does not update fast enough to be asked between writes.
 */
export async function catalogBook(
  app: App,
  file: TFile,
  folder: string,
  type: string,
  taken: Set<string>,
  added: string,
  known?: OpfMetadata,
  coversFolder?: string | null,
  /** Artwork to use when the file has none — a download's cover as its catalog published it. See `extractCoverTo`. */
  coverElsewhere?: () => Promise<{ bytes: Uint8Array; entry: string } | null>
): Promise<string> {
  const meta = known ?? (await bookMetadata(app, file));
  const dir = folder.replace(/^\/+|\/+$/g, '');
  if (dir && !(await app.vault.adapter.exists(normalizePath(dir)))) await app.vault.createFolder(normalizePath(dir));
  const path = uniqueNotePath(dir, meta.title, taken);
  // Before the note is written, so `cover:` is in it from the start rather than added by a second pass. A book
  // whose artwork cannot be found still gets its record — the generated tile is the answer for those.
  const cover = coversFolder
    ? await extractCoverTo(
        app,
        file,
        coversFolder,
        { title: meta.title, author: meta.authors[0] ?? '' },
        { elsewhere: coverElsewhere }
      )
    : null;
  const fields: RecordNoteFields = {
    title: meta.title,
    authors: meta.authors,
    type,
    publisher: meta.publisher,
    publicationDate: meta.published,
    language: meta.language,
    series: meta.series,
    seriesIndex: meta.seriesIndex,
    isbn: meta.isbn,
    cover: cover ? coverLink(app, cover, path) : undefined,
    files: [recordLinkText(file)],
    source: 'vault',
    added,
  };
  await app.vault.create(normalizePath(path), recordNoteContent(fields));
  taken.add(path);
  return path;
}

/**
 * Add a file to a record that already exists, instead of writing a second record for the same title.
 *
 * `processFrontMatter` so everything else in the note survives — including keys Orbis has never heard of, which
 * is the promise made to anyone whose records come out of their own script.
 *
 * **A record still using the single-file key keeps its file.** Reading prefers `files` when both are present, so
 * writing `files` beside an `epub_link` without carrying it over would silently drop the book the record already
 * pointed at. `epub_link` is left where it is rather than deleted: it is not ours to remove.
 */
export async function attachFileToRecord(
  app: App,
  notePath: string,
  file: TFile,
  coversFolder?: string | null
): Promise<void> {
  const note = app.vault.getAbstractFileByPath(notePath);
  if (!(note instanceof TFile)) return;
  // The full vault path, as a new record names its file — see `recordLinkText`. This used Obsidian's shortest form,
  // so an attached file was named `[[volumes 1.epub]]` beside a catalogued one's full path: right today, and silently
  // a different file the day a second `volumes 1.epub` lands in another folder.
  const link = wikilink(recordLinkText(file));
  // Extracted before the frontmatter is touched, because it is the slow part and a record should not be left
  // half-updated if it fails. A record that already has one keeps it: the reader's own choice of artwork, or an
  // import's, is not ours to replace with whatever this file happens to carry.
  const wanted = coversFolder && !toText(app.metadataCache.getFileCache(note)?.frontmatter?.cover);
  // The record's own title and author for the drawn fallback, not the file's: the note is what this cover is FOR,
  // and its title is the one someone curated.
  const record = parseRecord(notePath, app.metadataCache.getFileCache(note)?.frontmatter);
  const cover = wanted
    ? await extractCoverTo(app, file, coversFolder, {
        title: record?.title ?? file.basename,
        author: record?.authors[0] ?? '',
      })
    : null;
  await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
    const existing = toStringList(fm.files).length > 0 ? toStringList(fm.files) : toStringList(fm.epub_link);
    const already = existing.some((value) => linkTarget(value) === linkTarget(link));
    fm.files = already ? existing : [...existing, link];
    if (cover && !toText(fm.cover)) fm.cover = wikilink(coverLink(app, cover, notePath));
  });
}

/**
 * Where covers go: the folder if one is set, else `covers` beside the record notes.
 *
 * Derived rather than defaulted into settings, so it follows the records folder until someone says otherwise — a
 * stored default would go stale the moment they moved their catalog.
 */
export function coversFolderFor(settings: { libraryCoversFolder: string; libraryRecordsFolder: string }): string {
  const set = settings.libraryCoversFolder.trim();
  if (set) return set;
  const records = settings.libraryRecordsFolder.replace(/^\/+|\/+$/g, '');
  return records ? `${records}/covers` : 'covers';
}

/**
 * Take the book's cover again, and point its title note at it.
 *
 * **The one action that reaches a record already written.** Cataloging takes a cover once; this is how everything
 * after that asks again — a book whose artwork is a converter's placeholder, a catalog imported without covers, a
 * file replaced with a better edition.
 *
 * `drawOnly` skips the book's own artwork and draws from the title and author instead. That is a judgment about a
 * particular book ("this cover is a generic icon"), which is why it is a separate thing to ask for rather than
 * something guessed at: nothing in the bytes distinguishes a bad cover from a plain one.
 */
export async function refreshCover(
  app: App,
  book: TFile,
  notePath: string,
  coversFolder: string,
  opts?: { drawOnly?: boolean }
): Promise<string | null> {
  const note = app.vault.getAbstractFileByPath(notePath);
  if (!(note instanceof TFile)) return null;
  const record = parseRecord(notePath, app.metadataCache.getFileCache(note)?.frontmatter);
  const path = await extractCoverTo(
    app,
    book,
    coversFolder,
    { title: record?.title ?? book.basename, author: record?.authors[0] ?? '' },
    { overwrite: true, drawOnly: opts?.drawOnly }
  );
  if (!path) return null;
  // Written even when the note already pointed here: the file behind the link has changed, and a note whose
  // `cover` was a stale link to a deleted image would otherwise keep it.
  await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
    fm.cover = wikilink(coverLink(app, path, notePath));
  });
  return path;
}

/** Every note path in the vault, for `uniqueNotePath` to avoid. */
export function takenNotePaths(app: App): Set<string> {
  return new Set(app.vault.getMarkdownFiles().map((f) => f.path));
}

/**
 * Catalog ONE book someone asked about — *Catalog this book*, or a status or rating set on a book nothing describes.
 *
 * **Written at once, unless it looks like a title you already have.** The folder and the cover are settings and a
 * single book needs no tick, so the review's only essential question for one book is the match: attach this file
 * to that note, or give it a note of its own. Guessing either way makes a duplicate or merges two books, so a
 * likely match comes back as `matched` for the caller to put to the reader; everything else is written here.
 */
export async function catalogOneBook(
  app: App,
  file: TFile,
  folder: string,
  coversFolder: string | null
): Promise<{ path: string; title: string } | 'matched'> {
  const meta = await bookMetadata(app, file);
  const records = vaultCandidates(app)
    .map((note) => parseRecord(note.path, note.frontmatter))
    .filter((record): record is LibraryRecord => record !== null);
  if (findMatches(matchCandidateFor(file, meta), recordsWithFiles(app, records)).length > 0) return 'matched';
  const path = await catalogBook(app, file, folder, 'book', takenNotePaths(app), isoToday(), meta, coversFolder);
  return { path, title: meta.title || file.basename };
}

/** What a file looks like to the matcher, once its metadata is known. */
export function matchCandidateFor(file: TFile, meta: OpfMetadata): Parameters<typeof findMatches>[0] {
  return { path: file.path, title: meta.title, authors: meta.authors, isbn: meta.isbn };
}
