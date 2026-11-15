// A book's device files for marks: one per device, each holding only that device's own changes, and the `.orbis`
// rebuilt from all of them.
//
// A book's marks, notes, bookmarks, preset, reading-speed samples, notes sets and records decision are recorded per
// device and rebuilt into its `.orbis`, so changes made on two devices while apart all survive. See docs/design/book-annotation-sync.md; the
// rules are `sync/book-marks.ts`, and this is their file I/O.

import { type App, normalizePath, type TFile } from 'obsidian';
import type { BookPreset } from './annotation-presets';
import { getOrCreateDeviceId } from './device-store';
import {
  ensureFolder,
  ORBIS_FILE_VERSION,
  progressFilePath,
  progressFolderPath,
  readProgressJson,
  rememberOwnWrite,
  serialOrbisWrite,
} from './orbis-io';
import type { Bookmark, Highlight, Note, NotesFileSet, ReadingStats } from './progress';
import type { BookRecordConfig } from './record-config';
import { sidecarStem } from './sidecar-names';
import {
  addedSamples,
  type BookState,
  clearRecord,
  type DeviceMarksFile,
  listChanges,
  ownSamples,
  presetChange,
  rebuildBook,
  samplesRecord,
  usableRecord,
  withChanges,
} from './sync/book-marks';
import { nextVersion, observeVersion } from './sync/clock';
import { compareVersions, type SyncRecord, type SyncVersion } from './sync/records';

/** The `.orbis` keys device files decide. Anything else in the file is written as it always was. */
export const DEVICE_FILE_KEYS = [
  'highlights',
  'notes',
  'bookmarks',
  'preset',
  'readingStats',
  'notesFiles',
  'records',
] as const;

/** One device's records for one book, beside the book's location files and named the same way. */
function marksFilePath(bookFile: TFile, deviceId: string): string {
  return `${progressFolderPath(bookFile)}/${sidecarStem(bookFile.path)}.marks.${deviceId}.json`;
}

/** Every device's file for this book, this device's included. A file that cannot be read is skipped, not fatal. */
async function readMarksFiles(app: App, bookFile: TFile): Promise<DeviceMarksFile[]> {
  const folder = normalizePath(progressFolderPath(bookFile));
  if (!(await app.vault.adapter.exists(folder))) return [];
  const prefix = `${sidecarStem(bookFile.path)}.marks.`;
  const out: DeviceMarksFile[] = [];
  for (const path of (await app.vault.adapter.list(folder)).files) {
    const name = path.split('/').pop() ?? '';
    if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
    try {
      const data = JSON.parse(await app.vault.adapter.read(path)) as Partial<DeviceMarksFile>;
      if (typeof data.device === 'string' && Array.isArray(data.records)) {
        // Only the records the rebuild can read: one damaged record stopped every save of the book's marks.
        out.push({ version: 1, device: data.device, records: data.records.filter(usableRecord) });
      }
    } catch {
      /* a half-synced or damaged file: the next rebuild reads it again */
    }
  }
  return out;
}

/**
 * What the open book last loaded or saved, per book: the "before" that a save's changes are measured against.
 *
 * **Set only by the read functions below and by a save**, whose one caller is the open book. Anything else reading
 * a book's marks through these functions would make this stand for a state the saving view never had — and an item
 * in it that the view lacks is recorded as a deletion made here. See `listChanges`.
 */
const lastHad = new Map<string, Partial<BookState>>();

/**
 * **A copy, never the caller's own lists.** The read functions hand the same list to the open book, which adds to it
 * in place; kept by reference, the "before" would gain every mark the reader added, the save would record no change,
 * and after a clear the rebuild would take the new mark away as from before it.
 */
export function rememberHad(bookFile: TFile, part: Partial<BookState>): void {
  const key = normalizePath(bookFile.path);
  lastHad.set(key, { ...lastHad.get(key), ...structuredClone(part) });
}

export const listOf = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** The part of `.orbis` device files decide, as the file holds it now. */
function stateOf(orbis: Record<string, unknown>): BookState {
  return {
    highlights: listOf<Highlight>(orbis.highlights),
    notes: listOf<Note>(orbis.notes),
    bookmarks: listOf<Bookmark>(orbis.bookmarks),
    preset: (orbis.preset as BookPreset | undefined) ?? null,
    readingStats: (orbis.readingStats as ReadingStats | undefined) ?? null,
    notesFiles: listOf<NotesFileSet>(orbis.notesFiles),
    records: (orbis.records as BookRecordConfig | undefined) ?? null,
  };
}

/**
 * A change recorded as what was done rather than found by comparing lists — a notes set written, the records decision
 * given. Handed the book as the file holds it now, this device's id and a source of versions.
 */
export type RecordedChange = (orbis: BookState, device: string, version: () => SyncVersion) => SyncRecord[];

/**
 * Add this save's changes to this device's file: what `patch` holds, measured against what the open book had.
 *
 * Reading-speed samples are the exception to "changes": the reader saves its whole rolling list, so what this device
 * recorded is what was appended since, added to the samples it had already recorded itself. `recorded` adds changes
 * that need no comparing.
 */
export async function recordChanges(
  app: App,
  bookFile: TFile,
  orbis: Record<string, unknown>,
  patch: Record<string, unknown>,
  recorded?: RecordedChange
): Promise<void> {
  const device = getOrCreateDeviceId(app);
  const had = { ...stateOf(orbis), ...lastHad.get(normalizePath(bookFile.path)) };
  const version = (): SyncVersion => nextVersion(Date.now());
  const changes: SyncRecord[] = [];
  if ('highlights' in patch)
    changes.push(...listChanges('highlight', had.highlights, listOf(patch.highlights), device, version));
  if ('notes' in patch) changes.push(...listChanges('note', had.notes, listOf(patch.notes), device, version));
  if ('bookmarks' in patch)
    changes.push(...listChanges('bookmark', had.bookmarks, listOf(patch.bookmarks), device, version));
  if ('preset' in patch) {
    const change = presetChange(had.preset, (patch.preset as BookPreset | undefined) ?? null, device, version);
    if (change) changes.push(change);
  }
  if (recorded) changes.push(...recorded(stateOf(orbis), device, version));
  const path = marksFilePath(bookFile, device);
  const files = await readMarksFiles(app, bookFile);
  const mine = files.find((f) => f.device === device)?.records ?? [];
  if ('readingStats' in patch) {
    const added = addedSamples(
      had.readingStats?.wpmSamples ?? [],
      (patch.readingStats as ReadingStats | undefined)?.wpmSamples ?? []
    );
    if (added.length) changes.push(samplesRecord([...ownSamples(files, device), ...added], device, version()));
  }
  if (!changes.length) return;
  const file: DeviceMarksFile = { version: 1, device, records: withChanges(mine, changes) };
  await app.vault.adapter.write(normalizePath(path), JSON.stringify(file, null, 2));
}

/**
 * The book as every device's file says it is, rebuilt over `orbis`. Seeing another device's records lifts this
 * device's clock past them, so the next change made here sorts after what it was made on top of.
 */
export async function rebuiltState(app: App, bookFile: TFile, orbis: Record<string, unknown>): Promise<BookState> {
  const files = await readMarksFiles(app, bookFile);
  const device = getOrCreateDeviceId(app);
  let newest: SyncVersion | null = null;
  for (const r of files.filter((f) => f.device !== device).flatMap((f) => f.records)) {
    if (!newest || compareVersions(r.version, newest) > 0) newest = r.version;
  }
  if (newest) observeVersion(newest, Date.now());
  return rebuildBook(stateOf(orbis), files);
}

/** The rebuilt state as `.orbis` keys: a book with no preset or no samples has no key for them at all. */
export function orbisKeysOf(state: BookState): Record<string, unknown> {
  return {
    highlights: state.highlights,
    notes: state.notes,
    bookmarks: state.bookmarks,
    preset: state.preset ?? undefined,
    readingStats: state.readingStats ?? undefined,
    notesFiles: state.notesFiles.length ? state.notesFiles : undefined,
    records: state.records ?? undefined,
  };
}

/** Announce that a book's `.orbis` was written, so every open view of it can catch up — see `watchBookChanges`. */
export const BOOK_CHANGED_EVENT = 'orbis:book-changed';

/**
 * Rebuild a book's `.orbis` from every device's file, after another device's file or `.orbis` arrived. Writes only
 * when the result differs, so two devices that have seen the same changes stop writing, and returns whether it wrote.
 *
 * **Does not touch what the open book had** — `lastHad` stands for the open view, which has not reloaded yet. It does
 * so on the announcement that follows, through the read functions.
 */
/**
 * Clear a book whose `.orbis` was deleted: record the moment in this device's file — see `clearRecord` — after which
 * only what is recorded since counts, on every device.
 *
 * Recorded even for a book no device file mentions yet: another device may still hold a `.orbis` from before device
 * files, and only a clear keeps its marks from being rebuilt back in. The `.orbis` is not written back; the book reads
 * as empty until its next save rebuilds the file.
 */
export async function clearBook(app: App, bookFile: TFile): Promise<void> {
  const files = await readMarksFiles(app, bookFile);
  const device = getOrCreateDeviceId(app);
  const mine = files.find((f) => f.device === device)?.records ?? [];
  const cleared = [clearRecord(device, nextVersion(Date.now()))];
  await ensureFolder(app, bookFile);
  const file: DeviceMarksFile = { version: 1, device, records: withChanges(mine, cleared) };
  await app.vault.adapter.write(normalizePath(marksFilePath(bookFile, device)), JSON.stringify(file, null, 2));
  lastHad.delete(normalizePath(bookFile.path));
}

export async function rebuildBookFromDevices(app: App, bookFile: TFile): Promise<boolean> {
  const path = progressFilePath(bookFile);
  return serialOrbisWrite(path, async () => {
    const existing = await readProgressJson(app, path);
    const keys = orbisKeysOf(await rebuiltState(app, bookFile, existing));
    if (DEVICE_FILE_KEYS.every((key) => JSON.stringify(existing[key]) === JSON.stringify(keys[key]))) return false;
    await ensureFolder(app, bookFile);
    Object.assign(existing, keys, { version: ORBIS_FILE_VERSION });
    const text = JSON.stringify(existing, null, 2);
    rememberOwnWrite(path, text);
    await app.vault.adapter.write(path, text);
    return true;
  });
}

/** Is `path` a book's device file for marks — and whose? `<book stem>.marks.<deviceId>.json` in `!orbis-data`. */
export function marksFileParts(path: string): { bookPath: string; device: string } | null {
  const m = /^(?:(.*)\/)?!orbis-data\/(.+)\.marks\.([a-z0-9]+)\.json$/.exec(path);
  return m ? { bookPath: m[1] ? `${m[1]}/${m[2]}` : m[2], device: m[3] } : null;
}

/** Is `path` a book's `.orbis` — and for which book? */
export function orbisFileBook(path: string): string | null {
  const m = /^(?:(.*)\/)?!orbis-data\/(.+)\.orbis$/.exec(path);
  return m ? (m[1] ? `${m[1]}/${m[2]}` : m[2]) : null;
}
