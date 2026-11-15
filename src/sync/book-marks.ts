// A book's marks, notes, bookmarks, preset, reading-speed samples, generated notes sets and reading-records decision,
// kept per device and rebuilt into its `.orbis`.
//
// Pure: records in, records out, and a book's state in, a book's state out. Nothing here touches a vault, so every
// case in docs/design/book-annotation-sync.md is a test before it is a device test. The file I/O is `progress.ts`'s.
//
// The records are the sync engine's own (`SyncRecord`, `compareVersions`, `newestOf`): the same versions, the same
// newest-wins rule and the same tombstones that dashboards and presets already travel by.

import type { BookMark, BookPreset } from '../annotation-presets';
import type { Bookmark, Highlight, Note, NotesFileSet, ReadingStats } from '../progress';
import type { BookRecordConfig } from '../record-config';
import { compareVersions, newestOf, type SyncRecord, type SyncVersion } from './records';

/** The kinds of item a device file holds — one of each record's `type`. */
export type BookItemType =
  | 'highlight'
  | 'note'
  | 'bookmark'
  | 'preset'
  | 'readingStats'
  | 'notesSet'
  | 'records'
  | 'clear';

/** The part of `.orbis` that device files decide. Everything else in the file is left alone. */
export interface BookState {
  highlights: Highlight[];
  notes: Note[];
  bookmarks: Bookmark[];
  preset: BookPreset | null;
  readingStats: ReadingStats | null;
  /** The notes Generate notes wrote, which Open notes offers. */
  notesFiles: NotesFileSet[];
  /** The book's own reading-records decision; null when it has never been asked. */
  records: BookRecordConfig | null;
}

/** One device's file for one book: `<book stem>.marks.<deviceId>.json`. */
export interface DeviceMarksFile {
  version: 1;
  device: string;
  records: SyncRecord[];
}

/** The id the book's preset is recorded under — one item, whole: see the design's §The book's preset. */
const PRESET_ID = 'preset';
/** The id a clear of the book is recorded under — see `clearRecord`. */
const CLEAR_ID = 'book';
/** The id a device's own reading-speed samples are recorded under. One per device, so never in conflict. */
const READING_STATS_ID = 'readingStats';
/** The id the book's reading-records decision is recorded under — one value, like the preset. */
const RECORDS_ID = 'records';
/** How many reading-speed samples the book keeps — `ReadingStats.wpmSamples`, newest last. */
const MAX_SAMPLES = 15;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The records for what changed between `before` and `after` in one list — added, changed or removed, by id.
 *
 * **`before` is what this device last had, never the file on disk.** An item another device added that this one has
 * not loaded is in neither, so it produces nothing. Diffed against the disk, it would look like a deletion by this
 * device, and that deletion would travel everywhere.
 */
export function listChanges<T extends { id: string }>(
  type: BookItemType,
  before: readonly T[],
  after: readonly T[],
  device: string,
  version: () => SyncVersion
): SyncRecord<T>[] {
  const was = new Map(before.map((item) => [item.id, item]));
  const now = new Map(after.map((item) => [item.id, item]));
  const out: SyncRecord<T>[] = [];
  for (const [id, item] of now) {
    if (!same(was.get(id), item)) out.push({ id, type, device, version: version(), deleted: false, item });
  }
  for (const id of was.keys()) {
    if (!now.has(id)) out.push({ id, type, device, version: version(), deleted: true });
  }
  return out;
}

/** The record for the book's preset, if it changed. A preset set to none is recorded as a deletion. */
export function presetChange(
  before: BookPreset | null,
  after: BookPreset | null,
  device: string,
  version: () => SyncVersion
): SyncRecord<BookPreset> | null {
  if (same(before, after)) return null;
  return after
    ? { id: PRESET_ID, type: 'preset', device, version: version(), deleted: false, item: after }
    : { id: PRESET_ID, type: 'preset', device, version: version(), deleted: true };
}

/**
 * The record for this device's own reading-speed samples: the ones it has recorded, newest last.
 *
 * **Only its own**, never the combined list it read from `.orbis` — that list already holds every other device's
 * samples, and recording it would count them twice at the next rebuild.
 */
export function samplesRecord(own: readonly number[], device: string, version: SyncVersion): SyncRecord<number[]> {
  return {
    id: READING_STATS_ID,
    type: 'readingStats',
    device,
    version,
    deleted: false,
    item: own.slice(-MAX_SAMPLES),
  };
}

/**
 * The samples a save added: what `after` has beyond the end of `before`.
 *
 * The reader keeps a rolling list — the oldest drop off the front as new ones arrive at the back — so `after` begins
 * with the tail of `before`. The longest such overlap is taken off; what follows it is new.
 */
export function addedSamples(before: readonly number[], after: readonly number[]): number[] {
  for (let k = Math.min(before.length, after.length); k > 0; k--) {
    if (same(before.slice(before.length - k), after.slice(0, k))) return after.slice(k);
  }
  return [...after];
}

/**
 * The records for a notes set just written: the set itself, and a deletion for every set recorded at the same place,
 * which the new one replaces.
 *
 * **Recorded as what was done, not found by comparing lists.** The writer knows the one set it wrote; a list it read
 * may lack another device's newest set, and a comparison would record that set's deletion.
 */
export function notesSetChanges(
  current: readonly NotesFileSet[],
  set: NotesFileSet,
  device: string,
  version: () => SyncVersion
): SyncRecord[] {
  const place = (s: NotesFileSet): string => (s.mode === 'per-chapter' ? `folder:${s.folder}` : `file:${s.path}`);
  const replaced = current.filter((s) => s.id !== set.id && place(s) === place(set));
  return [
    ...replaced.map((s): SyncRecord => ({ id: s.id, type: 'notesSet', device, version: version(), deleted: true })),
    { id: set.id, type: 'notesSet', device, version: version(), deleted: false, item: set },
  ];
}

/** The record for the book's reading-records decision. null un-decides it, recorded as a deletion. */
export function recordsChange(config: BookRecordConfig | null, device: string, version: SyncVersion): SyncRecord {
  return config
    ? { id: RECORDS_ID, type: 'records', device, version, deleted: false, item: config }
    : { id: RECORDS_ID, type: 'records', device, version, deleted: true };
}

/** A device's records with `changes` applied: each replaces the record it supersedes, by type and id. */
export function withChanges(records: readonly SyncRecord[], changes: readonly SyncRecord[]): SyncRecord[] {
  const key = (r: SyncRecord): string => `${r.type}:${r.id}`;
  const out = new Map(records.map((r) => [key(r), r]));
  for (const c of changes) out.set(key(c), c);
  return [...out.values()];
}

/** Creation order, then id — the same on every device, which is what keeps a rebuild byte-for-byte deterministic. */
function byCreation<T extends { id: string; createdAt?: number }>(items: T[]): T[] {
  return items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Whether a record from a device's file is one the rebuild can read — the fields it relies on, of the types it relies
 * on. The rest are skipped, so one damaged record cannot stop a book saving: a `null`
 * among the records, or one with no version, threw inside every save of that book's marks and notes, and the save was
 * lost with nothing said. A preset must hold its marks, which the rebuild reads when an annotation's mark is missing.
 */
export function usableRecord(record: unknown): record is SyncRecord {
  if (!isObject(record)) return false;
  const { id, type, device, version, item, deleted } = record;
  if (typeof id !== 'string' || typeof type !== 'string' || typeof device !== 'string') return false;
  if (!isObject(version) || typeof version.clock !== 'number' || typeof version.at !== 'string') return false;
  if (item !== undefined && !isObject(item)) return false;
  return !(type === 'preset' && deleted !== true && item !== undefined && !Array.isArray(item.marks));
}

/** For each item of one type, the newest record anywhere. */
function winners(files: readonly DeviceMarksFile[], type: BookItemType): Map<string, SyncRecord> {
  const all = new Map<string, SyncRecord[]>();
  for (const file of files) {
    for (const r of file.records) {
      if (r.type !== type) continue;
      const list = all.get(r.id);
      if (list) list.push(r);
      else all.set(r.id, [r]);
    }
  }
  const out = new Map<string, SyncRecord>();
  for (const [id, list] of all) {
    const best = newestOf(list);
    if (best) out.set(id, best);
  }
  return out;
}

/**
 * `base`'s items with every winning record applied: a deletion removes, anything else replaces or adds.
 *
 * After a clear (`cut`), only what was recorded since counts: an item whose newest record is older is deleted, and an
 * item in `base` with no record at all is from before it too.
 */
function applyWinners<T extends { id: string; createdAt?: number }>(
  base: readonly T[],
  won: Map<string, SyncRecord>,
  cut: SyncRecord | null
): T[] {
  const out = new Map(cut ? [] : base.map((item) => [item.id, item]));
  for (const [id, r] of won) {
    if (r.deleted || !after(r, cut)) out.delete(id);
    else if (r.item) out.set(id, r.item as T);
  }
  return byCreation([...out.values()]);
}

/**
 * Every device's reading-speed samples as one list: the devices in the order they last recorded, the newest 15.
 *
 * A sample is a number with no time on it, so the devices' own order is the only order there is. `base` is used only
 * when no device has recorded any: it is `.orbis`'s combined list from before, and adding it to the device records
 * would count every sample in it twice.
 */
function combinedSamples(base: ReadingStats | null, files: readonly DeviceMarksFile[]): ReadingStats | null {
  const all = files.flatMap((f) => f.records);
  const cut = newestClear(all);
  const recs = all
    .filter(
      (r): r is SyncRecord<number[]> =>
        r.type === 'readingStats' && !r.deleted && Array.isArray(r.item) && after(r, cut)
    )
    .sort((a, b) => compareVersions(a.version, b.version, a.device, b.device));
  // After a clear, the old combined list is from before it — see `clearingRecords`.
  if (!recs.length) return cut ? null : base;
  const newest = recs[recs.length - 1];
  return {
    wpmSamples: recs.flatMap((r) => r.item ?? []).slice(-MAX_SAMPLES),
    lastUpdated: newest.version.at,
  };
}

/** The newest clear of the book anywhere — see `clearRecord`. */
function newestClear(records: readonly SyncRecord[]): SyncRecord | null {
  return newestOf(records.filter((r) => r.type === 'clear'));
}

/** Is `r` newer than the clear `cut`, or is there none? */
function after(r: SyncRecord, cut: SyncRecord | null): boolean {
  return !cut || compareVersions(r.version, cut.version, r.device, cut.device) > 0;
}

/**
 * The samples this device has recorded itself, to add a save's new ones to — none if its list is from before the
 * newest clearing, whichever device made it. Kept, it would put the old samples back at this device's next save.
 */
export function ownSamples(files: readonly DeviceMarksFile[], device: string): number[] {
  const all = files.flatMap((f) => f.records);
  const mine = all.find((r) => r.type === 'readingStats' && r.device === device && !r.deleted && Array.isArray(r.item));
  return mine && after(mine, newestClear(all)) ? [...(mine.item as number[])] : [];
}

/**
 * The record that clears a book: the moment of the clear, after which only what was recorded since counts — for
 * everything a device file holds alike. Written when the book's `.orbis` is deleted,
 * which, before device files, cleared the book, and has to still.
 *
 * **A cut-off, not a list of deletions.** A device that was offline when the book was cleared may hold marks the
 * clearing device never saw; a deletion per known item would leave those standing, and they would reappear when it
 * reconnects. Everything recorded before the moment goes, wherever it was made. The moment is compared by the devices'
 * clocks, so a device whose clock runs fast can have a mark made just before the clear count as made after it.
 */
export function clearRecord(device: string, version: SyncVersion): SyncRecord {
  return { id: CLEAR_ID, type: 'clear', device, version, deleted: false };
}

/**
 * **No annotation is left without a mark.** Any annotation whose mark the winning preset lacks keeps it, as a mark of
 * the book's own, defined as the newest preset version that had it — which is always in some device's file, since a
 * device only records an annotation with a mark from the preset it held.
 *
 * The case: the phone, offline, switches the book to another preset while the Mac adds a highlight with a mark from
 * the old one. The phone's switch wins the preset; the Mac's highlight wins as an item, and keeps its mark.
 */
function keepAnnotationMarks(
  preset: BookPreset | null,
  annotations: readonly { markId?: string }[],
  files: readonly DeviceMarksFile[],
  base: BookPreset | null
): BookPreset | null {
  if (!preset) return preset;
  const have = new Set(preset.marks.map((m) => m.id));
  const missing = [...new Set(annotations.map((a) => a.markId).filter((id): id is string => !!id && !have.has(id)))];
  if (!missing.length) return preset;
  const versions = files
    .flatMap((f) => f.records)
    .filter((r): r is SyncRecord<BookPreset> => r.type === 'preset' && !r.deleted && !!r.item)
    .sort((a, b) => compareVersions(b.version, a.version, b.device, a.device))
    .map((r) => r.item as BookPreset);
  if (base) versions.push(base);
  const added: BookMark[] = [];
  for (const id of missing.sort()) {
    const found = versions.map((v) => v.marks.find((m) => m.id === id)).find((m) => !!m);
    if (found) added.push({ ...found, local: true });
  }
  return added.length ? { ...preset, marks: [...preset.marks, ...added] } : preset;
}

/**
 * The book as every device's records say it is — `base` is the current `.orbis`, and `files` every device's file.
 *
 * For each item, the newest record anywhere wins, and a winning deletion removes it; an item in `base` with no record
 * stands as it is, which is why no migration is needed — until the book is cleared, after which only what was
 * recorded since counts (`clearRecord`). The same inputs in any order give the same result.
 */
export function rebuildBook(base: BookState, files: readonly DeviceMarksFile[]): BookState {
  const sorted = [...files].sort((a, b) => (a.device < b.device ? -1 : a.device > b.device ? 1 : 0));
  const cut = newestClear(sorted.flatMap((f) => f.records));
  const highlights = applyWinners(base.highlights, winners(sorted, 'highlight'), cut);
  const notes = applyWinners(base.notes, winners(sorted, 'note'), cut);
  const bookmarks = applyWinners(base.bookmarks, winners(sorted, 'bookmark'), cut);
  const preset = singleValue(winners(sorted, 'preset').get(PRESET_ID), cut, base.preset);
  return {
    highlights,
    notes,
    bookmarks,
    preset: keepAnnotationMarks(preset, [...highlights, ...notes], sorted, base.preset),
    readingStats: combinedSamples(base.readingStats, sorted),
    notesFiles: applyWinners(base.notesFiles, winners(sorted, 'notesSet'), cut),
    records: singleValue(winners(sorted, 'records').get(RECORDS_ID), cut, base.records),
  };
}

/** One value recorded whole — the preset, the records decision: its winning record, else `base` unless cleared. */
function singleValue<T>(won: SyncRecord | undefined, cut: SyncRecord | null, base: T | null): T | null {
  if (won && after(won, cut)) return won.deleted ? null : ((won.item as T) ?? null);
  return cut ? null : base;
}
