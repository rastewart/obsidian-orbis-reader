// The files beside a book, at the level every reader and writer of them shares: where they are, reading one, making
// the folder, and knowing which versions of a `.orbis` this device wrote itself.
//
// Its own module so that `progress.ts` (the book's data) and `book-marks-store.ts` (the device files it is rebuilt
// from) can both build on it without either importing the other.

import { type App, normalizePath, type TFile } from 'obsidian';
import { writeFolderReadme } from './orbis-readme';
import { sidecarStem } from './sidecar-names';

/**
 * The `!orbis-data` folder beside a book.
 *
 * **`parent` is read from the path, not from `TFile.parent`.** A file being DELETED arrives at the vault's own
 * `delete` event already detached — `parent` is null — and a fallback to `!orbis-data` at the vault ROOT would send
 * the cleanup for `notes/Book.epub` to the wrong folder, where it matches nothing and the sidecars beside the book
 * survive. The path still holds the answer at that moment, so it is the reliable source and `parent` is only a
 * shortcut to the same string.
 */
export function progressFolderPath(bookFile: TFile): string {
  return progressFolderPathFor(bookFile.path);
}

/**
 * The same folder, for a book that may not exist yet.
 *
 * **A path, because a caller can have one without a `TFile`.** Deciding whether an EPUB about to be written
 * would land on an annotated book means asking about a file that is not in the vault — there is no `TFile` to
 * pass. The `TFile` form above delegates here: `parent.path` is only a shortcut to the string this reads, so there
 * is one rule with two spellings.
 */
export function progressFolderPathFor(bookPath: string): string {
  const parent = bookPath.split('/').slice(0, -1).join('/');
  if (!parent || parent === '/') return '!orbis-data';
  return `${parent}/!orbis-data`;
}

export function progressFilePath(bookFile: TFile): string {
  return progressFilePathFor(bookFile.path);
}

/** A book's `.orbis`, from its path alone — see `progressFolderPathFor`, and `sidecarStem` for the name. */
export function progressFilePathFor(bookPath: string): string {
  return `${progressFolderPathFor(bookPath)}/${sidecarStem(bookPath)}.orbis`;
}

export async function ensureFolder(app: App, bookFile: TFile): Promise<void> {
  await ensureDataFolderAt(app, progressFolderPath(bookFile));
}

/**
 * Make an `!orbis-data` folder if it is missing, with its readme. **Every route that makes one comes here**, so no
 * folder appears in a vault without the file that says what it is.
 */
export async function ensureDataFolderAt(app: App, folder: string): Promise<void> {
  const path = normalizePath(folder);
  if (await app.vault.adapter.exists(path)) return;
  await app.vault.adapter.mkdir(path);
  await writeFolderReadme(app, path);
}

// Returns {} for a missing or unparseable file, or one that parses to something other than an object — `null`, a
// number, a list — since every caller reads fields off the result. All read/save functions use this to avoid
// repeating the exists-check + JSON.parse + catch pattern.
export async function readProgressJson(app: App, path: string): Promise<Record<string, unknown>> {
  if (!(await app.vault.adapter.exists(normalizePath(path)))) return {};
  try {
    const parsed: unknown = JSON.parse(await app.vault.adapter.read(path));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// Bump when a change to any field this file carries (bookmarks/highlights/notes/
// notesFiles/readingStats/preset/records, plus the cached book metadata
// title/author/coverImage/toc —
// saveBookInfo() writes those at the TOP level, there is no `bookInfo` object) would be
// considered breaking, and add
// a migration keyed off the old version. Files written before this constant existed
// have no `version` field at all.
export const ORBIS_FILE_VERSION = 1;

/**
 * What this device wrote to each Orbis file, most recent last — the last few versions per file.
 *
 * **So a book open here can tell another device's version, arriving by sync, from the echo of its own save.** By
 * content rather than by time, and more than one: two saves in quick succession can be reported out of order, and
 * reading an older save of our own back as news would put the book back a step and drop the newer change.
 */
const ownWrites = new Map<string, string[]>();
const OWN_WRITES_KEPT = 8;

export function rememberOwnWrite(path: string, text: string): void {
  const key = normalizePath(path);
  const kept = [...(ownWrites.get(key) ?? []).filter((t) => t !== text), text];
  ownWrites.set(key, kept.slice(-OWN_WRITES_KEPT));
}

/** Did this device write exactly this to the Orbis file at `path`? */
export function isOwnOrbisWrite(path: string, text: string): boolean {
  return ownWrites.get(normalizePath(path))?.includes(text) ?? false;
}

/**
 * Writes to one Orbis file, one at a time: each starts only once the one before it has finished.
 *
 * **A write reads the file, changes it and writes the whole file back**, so two that overlap both read the same
 * version and the second writes it back without the first one's change. A reading-speed save 23ms after Generate
 * notes recorded its set did exactly that, and Open notes lost the set.
 */
const writeQueues = new Map<string, Promise<unknown>>();

export function serialOrbisWrite<T>(path: string, task: () => Promise<T>): Promise<T> {
  const key = normalizePath(path);
  const run = (writeQueues.get(key) ?? Promise.resolve()).then(task, task);
  const settled = run.catch(() => undefined);
  writeQueues.set(key, settled);
  void settled.then(() => {
    if (writeQueues.get(key) === settled) writeQueues.delete(key);
  });
  return run;
}
