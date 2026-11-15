// Getting a book from a source into the vault, and — when the library is on — cataloging it as it lands.
//
// **One at a time.** A reader selects several and they are fetched in order, because a batch is one user action and a
// burst of parallel requests is what Gutenberg's robot policy calls automated access. It is also the only way a
// progress line can say anything true about where a batch is up to.
//
// **Nothing is overwritten and nothing is fetched twice.** A file already in the folder is skipped and said so: it may
// be one the reader has started, with a position, marks and a title note pointing at it, and replacing it with bytes
// from a server is the one mistake here that cannot be undone.
//
// See docs/design/book-sources.md.

import { type App, normalizePath, TFile } from 'obsidian';
import { catalogBook, coversFolderFor, takenNotePaths } from '../library/cataloging';
import { isoToday } from '../library/dates';
import { destinationFolder } from '../library/destination';
import { titleNoteFolders } from '../library/title-note';
import type { BookSource, OrbisPluginSettings } from '../settings';
import { fetchBook, type SourceFailure } from './client';
import { alreadyDownloaded, downloadFileName, uniqueDownloadPath } from './download-name';
import { downloadEdition } from './quirks';

/**
 * The most one book may weigh.
 *
 * Generous, because a scanned comic or an illustrated encyclopedia legitimately runs to hundreds of megabytes — and a
 * limit that refused those would refuse exactly the books that are hard to get elsewhere. It exists for the URL that
 * turns out to be a video stream, not to police what a reader downloads.
 */
const MAX_BOOK_BYTES = 512 * 1024 * 1024;

/** A cover is a picture, not a book: anything bigger is not what the catalog meant by one. */
const MAX_COVER_BYTES = 10 * 1024 * 1024;

/**
 * One book to fetch, as the browser resolved it.
 *
 * **Resolved by the caller, not here.** A basket is filled across several pages of a catalog, and an href is only
 * meaningful against the document it came from — so the URL is settled when the book is chosen, while the page it was
 * chosen on is still known. By the time a batch runs, that page may be three navigations ago.
 */
export interface DownloadRequest {
  title: string;
  authors: readonly string[];
  /** The absolute acquisition URL. */
  url: string;
  /** The extension the media type means for us — see `extensionForType`. */
  ext: string;
  /** What the feed called this file, and how big it said it was — for the review, which is where a size is decided on. */
  label: string;
  size: number;
  /**
   * The cover the catalog published for this entry, resolved like `url` — used only when the downloaded file has
   * none of its own. Absent when the entry has no image.
   */
  coverUrl?: string;
}

/** What became of one book. `skipped` is a success: the file was already there. */
export type DownloadOutcome =
  | { kind: 'saved'; title: string; path: string; notePath: string | null }
  | { kind: 'skipped'; title: string; path: string }
  | { kind: 'failed'; title: string; reason: SourceFailure | 'write-failed'; detail?: string };

export interface DownloadDeps {
  app: App;
  settings: OrbisPluginSettings;
  /** The `sources` debug channel — every request and its answer, see `fetchSourceBody`. */
  log?: (msg: string) => void;
  /** Called before each book so a dialog can say what it is doing. */
  onProgress?: (title: string, done: number, total: number) => void;
  /** Asked before each book: **Stop** ends the batch after the book in hand, which no request can be cut short of. */
  shouldStop?: () => boolean;
  /** What the without-images edition is called in a file name — see `downloadEdition`. */
  noImagesLabel?: string;
}

/** A batch's outcomes, and how many books **Stop** left untried. */
export interface DownloadBatch {
  outcomes: DownloadOutcome[];
  notTried: number;
}

/**
 * Download the chosen books, in order, reporting what became of each.
 *
 * Errors are per book and never stop the batch: a feed with one dead link should not cost the reader the other four
 * books they asked for. Every outcome is returned rather than announced from here, so the dialog can report a batch as
 * one summary instead of five notices.
 */
export async function downloadBooks(
  deps: DownloadDeps,
  source: BookSource,
  books: readonly DownloadRequest[]
): Promise<DownloadBatch> {
  const { app, settings } = deps;
  const folder = settings.bookSourcesFolder.trim();
  // **A vault that will not take the file is a failure like any other**, said on each book's line — not a throw that
  // left the dialog on "Downloading…" for good.
  try {
    await ensureFolder(app, folder);
  } catch (err) {
    const detail = message(err);
    deps.log?.(`could not make the downloads folder "${folder}": ${detail}`);
    return {
      outcomes: books.map((book) => ({
        kind: 'failed',
        title: book.title || 'Untitled',
        reason: 'write-failed',
        detail,
      })),
      notTried: 0,
    };
  }
  // Read once, then kept current by hand: `getFiles()` is an index that lags a write by a tick, so two copies of one
  // book in a batch would otherwise land on the same path.
  const taken = new Set(app.vault.getFiles().map((f) => f.path));
  const outcomes: DownloadOutcome[] = [];

  let done = 0;
  for (const book of books) {
    if (deps.shouldStop?.()) {
      deps.log?.(`stopped with ${books.length - done} still to go`);
      return { outcomes, notTried: books.length - done };
    }
    const title = book.title || 'Untitled';
    deps.onProgress?.(title, done, books.length);
    done += 1;
    const edition = downloadEdition(book.url) === 'no-images' ? (deps.noImagesLabel ?? 'no images') : '';
    const fileName = downloadFileName(title, book.authors, book.ext, edition);
    const existing = alreadyDownloaded(folder, fileName, taken);
    if (existing) {
      deps.log?.(`skipped "${title}": ${existing} is already here`);
      outcomes.push({ kind: 'skipped', title, path: existing });
      continue;
    }
    const got = await fetchBook(app, source, book.url, MAX_BOOK_BYTES, deps.log);
    if (!got.ok) {
      deps.log?.(`failed "${title}": ${got.reason}${got.status ? ` (${got.status})` : ''}`);
      outcomes.push({ kind: 'failed', title, reason: got.reason, detail: got.detail });
      continue;
    }
    const path = uniqueDownloadPath(folder, fileName, taken);
    try {
      await app.vault.createBinary(normalizePath(path), got.data);
    } catch (err) {
      deps.log?.(`could not save "${title}" to ${path}: ${message(err)}`);
      outcomes.push({ kind: 'failed', title, reason: 'write-failed', detail: message(err) });
      continue;
    }
    taken.add(path);
    deps.log?.(`saved "${title}" → ${path} (${got.data.byteLength} bytes)`);
    outcomes.push({ kind: 'saved', title, path, notePath: await catalogIfLibraryOn(deps, source, path, book) });
  }
  return { outcomes, notTried: 0 };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Write the title note for a book that just landed, when the library is on.
 *
 * **Through `catalogBook`, the function the cataloging review uses.** The file is on disk and its own OPF is more
 * authoritative than a feed entry, and going through the same function means the note has the same shape, the same
 * cover extraction and the same collision handling as every other title note. A second note-writing path would be a
 * second kind of title note.
 *
 * A failure here is reported and not fatal: the book is downloaded either way, and the catalog review can describe it
 * later. Losing the note is an inconvenience; losing the download would be the reader's data.
 */
async function catalogIfLibraryOn(
  deps: DownloadDeps,
  source: BookSource,
  path: string,
  book: DownloadRequest
): Promise<string | null> {
  const { app, settings } = deps;
  if (!settings.libraryEnabled) return null;
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) return null;
  try {
    return await catalogBook(
      app,
      file,
      // Where the configuration files go, by the same rule: the records folder when set, else the folder most title
      // notes are in, else the vault root.
      destinationFolder(settings.libraryRecordsFolder, titleNoteFolders(app)),
      'book',
      takenNotePaths(app),
      isoToday(),
      undefined,
      settings.libraryExtractCovers ? coversFolderFor(settings) : null,
      book.coverUrl ? () => feedCover(deps, source, book.coverUrl ?? '') : undefined
    );
  } catch (err) {
    deps.log?.(`cataloging "${path}" failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * The cover the catalog published, for a book whose file has none of its own — the fallback the design promises,
 * before a drawn tile. A `data:` image is read where it is; anything else is one more request, made only when the
 * file had nothing, and under the same rules as the book (`fetchBook`). Nothing usable is `null`, never a failure: the
 * book is downloaded either way.
 */
async function feedCover(
  deps: DownloadDeps,
  source: BookSource,
  url: string
): Promise<{ bytes: Uint8Array; entry: string } | null> {
  if (url.startsWith('data:')) return dataUrlImage(url);
  const got = await fetchBook(deps.app, source, url, MAX_COVER_BYTES, deps.log);
  if (!got.ok) {
    deps.log?.(`no cover from the feed: ${got.reason}`);
    return null;
  }
  return { bytes: new Uint8Array(got.data), entry: `cover.${imageExtension(got.type, url)}` };
}

/** A `data:` URL's image, or null when it is not one. */
export function dataUrlImage(url: string): { bytes: Uint8Array; entry: string } | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
  if (!match || !match[1].startsWith('image/')) return null;
  try {
    const bytes = match[2]
      ? Uint8Array.from(atob(match[3]), (ch) => ch.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(match[3]));
    return bytes.length ? { bytes, entry: `cover.${imageExtension(match[1], '')}` } : null;
  } catch {
    return null;
  }
}

/** The extension an image's media type means, else its address's, else `jpg`. */
export function imageExtension(type: string, url: string): string {
  const fromType = /^image\/(jpe?g|png|gif|webp)/i.exec(type.trim())?.[1]?.toLowerCase();
  if (fromType) return fromType === 'jpeg' ? 'jpg' : fromType;
  const fromUrl = /\.(jpe?g|png|gif|webp)(?:$|[?#])/i.exec(url)?.[1]?.toLowerCase();
  return fromUrl ? (fromUrl === 'jpeg' ? 'jpg' : fromUrl) : 'jpg';
}

/** The download folder, made if it is not there yet. The vault root needs no making. */
async function ensureFolder(app: App, folder: string): Promise<void> {
  const dir = folder.replace(/^\/+|\/+$/g, '');
  if (!dir) return;
  if (!(await app.vault.adapter.exists(normalizePath(dir)))) await app.vault.createFolder(normalizePath(dir));
}
