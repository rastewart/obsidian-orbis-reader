import { App, Notice, normalizePath, TFile } from 'obsidian';
import { type BookPreset, migrateMarks, type Treatment } from './annotation-presets';
import { isBookExtension } from './book-formats';
import {
  BOOK_CHANGED_EVENT,
  DEVICE_FILE_KEYS,
  listOf,
  orbisKeysOf,
  type RecordedChange,
  rebuiltState,
  recordChanges,
  rememberHad,
} from './book-marks-store';
import { getOrCreateDeviceId } from './device-store';
import { t } from './i18n';
import { multiDeviceEnabled } from './multi-device';
import {
  ensureFolder,
  ORBIS_FILE_VERSION,
  progressFilePath,
  progressFolderPath,
  progressFolderPathFor,
  readProgressJson,
  rememberOwnWrite,
  serialOrbisWrite,
} from './orbis-io';
import { type BookRecordConfig, parseBookRecordConfig } from './record-config';
import { audioFolderName, sidecarStem, sidecarSuffix } from './sidecar-names';
import { notesSetChanges, recordsChange } from './sync/book-marks';

// Where a book's files are: defined in `orbis-io.ts`, and imported from here by most of the plugin.
export { progressFilePath, progressFilePathFor, progressFolderPath, progressFolderPathFor } from './orbis-io';

export const LS_DEVICE_NAME = 'orbis-device-name';
export const LS_IGNORE_OTHERS = 'orbis-ignore-others';

// ── Path helpers ─────────────────────────────────────────────────────────────

/** Where a book's recorded audio lives: one folder per book, holding one folder per voice edition. */
export function bookAudioFolderPath(bookFile: TFile): string {
  return bookAudioFolderPathFor(bookFile.path);
}

/** The same folder, from a path — for a book that has just been renamed or deleted. */
export function bookAudioFolderPathFor(bookPath: string): string {
  return `${progressFolderPathFor(bookPath)}/audio/${audioFolderName(bookPath)}`;
}

function deviceLocationFilePath(bookFile: TFile, deviceId: string): string {
  return `${progressFolderPath(bookFile)}/${sidecarStem(bookFile.path)}.location.${deviceId}.json`;
}

// Bump when a breaking change is made to this file's shape, and add a migration
// keyed off the old version. Files written before this constant existed have no
// `version` field at all.
const DEVICE_LOCATION_FILE_VERSION = 1;

export interface DeviceLocationRecord {
  deviceId: string;
  deviceName: string;
  location: string;
  lastOpened: number;
  isolated?: boolean;
  version?: number;
}

async function listDeviceLocationFiles(app: App, bookFile: TFile): Promise<string[]> {
  const folder = progressFolderPath(bookFile);
  const stem = sidecarStem(bookFile.path);
  try {
    const listed = await app.vault.adapter.list(normalizePath(folder));
    return listed.files.filter((fp) => sidecarSuffix(stem, fp.split('/').pop() ?? '')?.startsWith('.location.'));
  } catch {
    return [];
  }
}

export async function readAllDeviceLocations(app: App, bookFile: TFile): Promise<DeviceLocationRecord[]> {
  const files = await listDeviceLocationFiles(app, bookFile);
  const results = await Promise.all(
    files.map(async (fp) => {
      try {
        return JSON.parse(await app.vault.adapter.read(fp)) as DeviceLocationRecord;
      } catch {
        return null;
      }
    })
  );
  return results
    .filter((d): d is DeviceLocationRecord => d !== null && typeof d.location === 'string')
    .sort((a, b) => b.lastOpened - a.lastOpened);
}

// ── Read / write ─────────────────────────────────────────────────────────────

export async function readSavedLocation(app: App, bookFile: TFile): Promise<string | null> {
  const path = deviceLocationFilePath(bookFile, getOrCreateDeviceId(app));
  const data = await readProgressJson(app, path);
  const loc = data.location;
  return typeof loc === 'string' && loc ? loc : null;
}

/**
 * Whether this device keeps its reading position to itself.
 *
 * **Two reasons, and either is enough.** The reader asked for isolation, or this device is not taking part in
 * multi-device use at all — the switch above both features governs rather than hides, so a device that has left
 * must stop reading the others, not merely stop showing the row that says so.
 *
 * The file is still written either way: it is also how THIS device remembers its own place, so there is nothing to
 * turn off. `isolated: true` in it is what tells the others to leave this one alone.
 */
export function isolatedHere(app: App): boolean {
  return !multiDeviceEnabled() || app.loadLocalStorage(LS_IGNORE_OTHERS) === 'true';
}

export async function saveLocation(app: App, bookFile: TFile, cfi: string): Promise<void> {
  await ensureFolder(app, bookFile);
  const deviceId = getOrCreateDeviceId(app);
  const deviceName = (app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '';
  const isolated = isolatedHere(app);
  const record: Record<string, unknown> = {
    deviceId,
    deviceName,
    location: cfi,
    lastOpened: Date.now(),
    version: DEVICE_LOCATION_FILE_VERSION,
  };
  if (isolated) record.isolated = true;
  await app.vault.adapter.write(deviceLocationFilePath(bookFile, deviceId), JSON.stringify(record, null, 2));
}

// Write (or update) the device location file on book open, stamping lastOpened.
// Preserves the existing saved CFI so the file is valid for other devices to read.
// Returns the PREVIOUS lastOpened (before this open), used to detect "other device is newer":
// the caller compares other devices' lastOpened against this to find devices that read
// more recently than we did. Returning Date.now() would make that check always fail.
// Returns 0 if this device has no prior open record (first open — any other device qualifies).
export async function writeLocationOnOpen(app: App, bookFile: TFile): Promise<number> {
  await ensureFolder(app, bookFile);
  const deviceId = getOrCreateDeviceId(app);
  const deviceName = (app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '';
  const isolated = isolatedHere(app);
  const path = deviceLocationFilePath(bookFile, deviceId);
  let location = '';
  const existingData = await readProgressJson(app, path);
  if (typeof existingData.location === 'string') location = existingData.location;
  const previousLastOpened = typeof existingData.lastOpened === 'number' ? existingData.lastOpened : 0;
  const record: Record<string, unknown> = {
    deviceId,
    deviceName,
    location,
    lastOpened: Date.now(),
    version: DEVICE_LOCATION_FILE_VERSION,
  };
  if (isolated) record.isolated = true;
  await app.vault.adapter.write(path, JSON.stringify(record, null, 2));
  return previousLastOpened;
}

// Scan vault for all location files belonging to deviceId and update deviceName in each.
export async function updateDeviceNameInVault(app: App, deviceId: string, newName: string): Promise<void> {
  const bookFiles = app.vault.getFiles().filter((f) => isBookExtension(f.extension));
  for (const bookFile of bookFiles) {
    const path = deviceLocationFilePath(bookFile, deviceId);
    if (!(await app.vault.adapter.exists(normalizePath(path)))) continue;
    try {
      const data = JSON.parse(await app.vault.adapter.read(path)) as Record<string, unknown>;
      data.deviceName = newName;
      data.version = DEVICE_LOCATION_FILE_VERSION;
      await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
    } catch {
      /* skip */
    }
  }
}

// ── TOC ──────────────────────────────────────────────────────────────────────

export interface TocEntry {
  label: string;
  cfi: string; // precomputed epubcfi for the section start; empty if no match
  href?: string; // raw in-book href (may include anchor, e.g. chapter.xhtml#id); preferred for navigation
  subitems?: TocEntry[];
}

// ── Notes ────────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  cfiRange: string;
  text: string;
  selectedText?: string;
  color?: string;
  /** The annotation preset mark this note carries, resolved against the book's `preset`. Optional
   *  forever, not just on legacy data — a note with no highlight has no mark either, and that is a
   *  supported permanent state. `color` and `treatment` remain the render fallback. */
  markId?: string;
  /** How it was drawn when made — the appearance half of the fallback, beside `color`.
   *
   *  Both are read ONLY when `markId` fails to resolve (mark deleted, preset switched, book shared from
   *  another vault). The mark wins whenever it resolves, so recoloring or re-treating a mark still carries
   *  every annotation already using it. Without this an orphaned annotation would keep its color but revert
   *  to a plain highlight — losing its shape as well as its name, when shape carries meaning. */
  treatment?: Treatment;
  createdAt: number;
  chapter?: string;
  // Unique chapter identity — chapter labels repeat across parts in many
  // books ("PART I > CHAPTER I", "PART II > CHAPTER I"), so anything that
  // groups annotations by chapter must key on this, not on `chapter`.
  chapterHref?: string;
  loc?: number;
}

export async function readNotes(app: App, bookFile: TFile): Promise<Note[]> {
  const raw = await readProgressJson(app, progressFilePath(bookFile));
  // Normalize: the epub.js plugin saves highlight color as 'highlightColor';
  // map to 'color' so annotation drawing and the note editor work correctly.
  const notes = listOf<Record<string, unknown>>(raw.notes).map((n) => {
    const note = n as unknown as Note;
    const color = (n.color as string | undefined) ?? (n.highlightColor as string | undefined);
    return { ...note, color };
  });
  rememberHad(bookFile, { notes });
  return notes;
}

export async function saveNotes(app: App, bookFile: TFile, notes: Note[]): Promise<void> {
  await writeOrbisFile(app, bookFile, { notes });
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export interface Bookmark {
  id: string;
  cfi: string;
  exactCfi?: string; // ground-truth CFI foliate reports when AT the bookmark page
  label: string;
  createdAt: number;
  loc?: number;
  chapter?: string;
  // See Note.chapterHref — unique chapter identity, label text is not unique.
  chapterHref?: string;
  /** How the bookmark was made: from the reader (top-of-page sentence) or the audio
   *  player (the sentence being read). Undefined on legacy bookmarks → treat as 'reading'. */
  kind?: 'reading' | 'audio';
  /** Range CFI of the anchored sentence — precise to a sentence, not just a page. Drives
   *  containment-based detection and the navigation flash. Absent on legacy bookmarks. */
  anchorCfi?: string;
  /** The words at the anchor — the page's opening lines, or the sentence being read — kept so a bookmark's reading
   *  record has an excerpt like every other record. Absent on bookmarks made before it was kept. */
  text?: string;
}

export async function readBookmarks(app: App, bookFile: TFile): Promise<Bookmark[]> {
  const raw = await readProgressJson(app, progressFilePath(bookFile));
  const bookmarks = listOf<Bookmark>(raw.bookmarks);
  rememberHad(bookFile, { bookmarks });
  return bookmarks;
}

export async function saveBookmarks(app: App, bookFile: TFile, bookmarks: Bookmark[]): Promise<void> {
  await writeOrbisFile(app, bookFile, { bookmarks });
}

// ── Notes files tracking ─────────────────────────────────────────────────────

export interface NotesFileChapter {
  chapter: number; // 1-based index in the generated file list
  title: string; // label from book.toc (displayed in picker)
  href?: string; // unique TOC entry identity — see Note.chapterHref
  sectionIndex: number; // index into book.sections — used to match reading position
  path: string; // vault path to this chapter's notes file
}

export interface NotesFileSet {
  id: string;
  styleName: string;
  styleId: string;
  createdAt: number;
  mode: 'single' | 'per-chapter';
  // single-file mode
  path?: string;
  // per-chapter mode
  folder?: string;
  mocPath?: string;
  noteSetSlug?: string;
  chapters?: NotesFileChapter[];
  // conflict review (both modes)
  pendingReview?: boolean;
  compareWith?: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function upgradeNotesRecord(r: unknown): NotesFileSet {
  const rec = r as Record<string, unknown>;
  if (rec.mode) return rec as unknown as NotesFileSet;
  return {
    id: typeof rec.id === 'string' ? rec.id : generateId(),
    styleName: typeof rec.styleName === 'string' ? rec.styleName : '',
    styleId: '',
    createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
    mode: 'single',
    path: typeof rec.path === 'string' ? rec.path : undefined,
  };
}

export async function readNotesFiles(app: App, bookFile: TFile): Promise<NotesFileSet[]> {
  const raw = await readProgressJson(app, progressFilePath(bookFile));
  if (!Array.isArray(raw.notesFiles)) return [];
  return (raw.notesFiles as unknown[]).map(upgradeNotesRecord);
}

/** Record a notes set just written, replacing any set recorded at the same file or folder — see `notesSetChanges`. */
export async function recordNotesFileSet(app: App, bookFile: TFile, set: NotesFileSet): Promise<void> {
  await writeOrbisFile(app, bookFile, {}, (orbis, device, version) =>
    notesSetChanges(orbis.notesFiles, set, device, version)
  );
}

// ── Highlights ────────────────────────────────────────────────────────────────

export interface Highlight {
  id: string;
  cfiRange: string;
  text: string;
  color: string;
  /** See Note.markId / Note.treatment — the mark this highlight means, with color + treatment as the
   *  render fallback for when it no longer resolves. */
  markId?: string;
  treatment?: Treatment;
  createdAt: number;
  chapter?: string;
  // See Note.chapterHref — unique chapter identity, label text is not unique.
  chapterHref?: string;
  loc?: number;
}

// Every write to the .orbis file goes through here so the version stamp can never
// be forgotten by a future save*() function.
//
// A write that touches a key device files decide (`DEVICE_FILE_KEYS`) records the change in this device's file first,
// and writes those keys as the rebuild of every device's file — never as the patch alone. `recorded` is a change
// stated outright rather than found in the patch.
async function writeOrbisFile(
  app: App,
  bookFile: TFile,
  patch: Record<string, unknown>,
  recorded?: RecordedChange
): Promise<void> {
  const path = progressFilePath(bookFile);
  await serialOrbisWrite(path, async () => {
    await ensureFolder(app, bookFile);
    const existing = await readProgressJson(app, path);
    const decided = !!recorded || DEVICE_FILE_KEYS.some((key) => key in patch);
    if (decided) await recordChanges(app, bookFile, existing, patch, recorded);
    // Rebuilt over the file WITH this save applied, so what is being saved stands even where a change went unnoticed
    // — a record of what the book had can be stale — and only another device's newer record overrides it.
    const rebuilt = decided ? await rebuiltState(app, bookFile, { ...existing, ...patch }) : null;
    Object.assign(existing, patch, rebuilt ? orbisKeysOf(rebuilt) : {}, { version: ORBIS_FILE_VERSION });
    const text = JSON.stringify(existing, null, 2);
    rememberOwnWrite(path, text);
    await app.vault.adapter.write(path, text);
    if (rebuilt) {
      rememberHad(bookFile, rebuilt);
      app.workspace.trigger(BOOK_CHANGED_EVENT, bookFile.path);
    }
  }).catch((err: unknown) => {
    tellSaveFailed(bookFile, err);
    throw err;
  });
}

/** Books whose failed save the reader has been told about this session — once each, as a save repeats with every mark. */
const toldSaveFailed = new Set<string>();

/**
 * Say that a book's changes were not saved. The callers only wrote it to the debug log, so a mark or note that was
 * never saved looked saved until the book was opened again.
 */
function tellSaveFailed(bookFile: TFile, err: unknown): void {
  if (toldSaveFailed.has(bookFile.path)) return;
  toldSaveFailed.add(bookFile.path);
  new Notice(t('notices.book_changes_not_saved', { book: bookFile.basename, reason: String(err) }));
}

// Bootstraps an empty, correctly-versioned .orbis file so callers (e.g. opening the
// DataView for a book with no reading data yet) have a TFile to open. A no-op if
// the file already exists — never overwrites real data.
export async function ensureOrbisFileExists(app: App, bookFile: TFile): Promise<void> {
  const path = progressFilePath(bookFile);
  await serialOrbisWrite(path, async () => {
    if (await app.vault.adapter.exists(normalizePath(path))) return;
    await ensureFolder(app, bookFile);
    const text = JSON.stringify({ version: ORBIS_FILE_VERSION }, null, 2);
    rememberOwnWrite(path, text);
    await app.vault.adapter.write(path, text);
  });
}

// ── Pages cache ───────────────────────────────────────────────────────────────

function locsCacheFilePath(bookFile: TFile): string {
  return `${progressFolderPath(bookFile)}/${sidecarStem(bookFile.path)}.pages.json`;
}

// Single source of truth for both the read-side check and the write-side stamp —
// bump this and both sides stay in sync automatically. Two separate numbers would
// let every cache write be rejected on the very next read, silently rebuilding the
// cache on every book open. A cache file carrying any other number misses the
// check once and is rebuilt.
//
// 2: added sectionHeadings. A cache without them would leave a book stuck on the
// guessed chapter names this field exists to replace, so the old file is dropped
// and the next open measures headings alongside the word counts it was measuring
// anyway.
//
// 3: added anchorCharOffsets. Without them a book whose contents anchor several
// chapters inside one file has no way to size those chapters, and every one of
// them would be estimated as the whole file. Measured in the same pass, off the
// same open document.
//
// 4: one location numbering (`locAtChar`). Each location's start is now where its own text begins — no longer pulled
// forward to the start of the next section — and `sectionLocInfo` counts the locations that start in a section rather
// than a share rounded section by section, which had drifted from the positions beside it.
//
// 5: `anchorCharOffsets` also holds the contents entries only foliate can place — a Kindle book's `kindle:pos:` links,
// a MOBI's `filepos:` — so chapter locations on those books count from where each chapter begins.
//
// 6: added tocAnchorIds — the id each of those entries points at, which is what lets a chapter partway down a Kindle
// book's file be cut where it starts, by every chapter split, as an EPUB anchor is.
//
// 7: a cache built before the reader had its contents list measured no chapter starts at all (the build begins on the
// first page, which came before the list). The list now comes first; this drops every cache built in that race.
//
// 8: sectionHeadings names a book's first page "Cover" when it holds only a picture — an old MOBI's cover page, which
// has neither a heading nor a title of its own.
const LOCS_CACHE_VERSION = 8;

export interface LocationsCache {
  version: number;
  totalLocs: number;
  sectionLocInfo: Array<{ startLoc: number; locCount: number }>;
  locNavCache: Record<string, string>; // page number (as string) → CFI
  // Per-section word and character counts — layout-independent source of truth for
  // word estimates.  locWordCounts is rebuilt from these on load so it stays in sync
  // with the current layout even when the font or screen size changes.
  sectionWordCounts?: number[];
  sectionCharCounts?: number[];
  // Layout-independent chapter start positions: href → fraction of total content (0–1).
  tocStartFractions?: Record<string, number>;
  // Each section's own first heading, '' where it has none. Measured from the same parsed document as
  // the word counts, because naming a section by reading it is the only method that cannot drift — see
  // `chapterDisplayForSection`.
  sectionHeadings?: string[];
  // Contents href → characters of text before it within its own section. How a book that keeps many
  // chapters in one file gets a size for each of them — see `book-chapters`.
  anchorCharOffsets?: Record<string, number>;
  // Contents href → the id of the element it points at, for the entries only foliate can place (Kindle `kindle:pos:`,
  // MOBI `filepos:`) — see `LocationIndex.anchorOf`.
  tocAnchorIds?: Record<string, string>;
}

export async function readLocsCache(app: App, bookFile: TFile): Promise<LocationsCache | null> {
  const data = await readProgressJson(app, locsCacheFilePath(bookFile));
  if (data.version !== LOCS_CACHE_VERSION) return null;
  if (!Array.isArray(data.sectionLocInfo) || typeof data.totalLocs !== 'number') return null;
  if (typeof data.locNavCache !== 'object' || data.locNavCache === null || Array.isArray(data.locNavCache)) return null;
  if (!Array.isArray(data.sectionWordCounts)) return null;
  return data as unknown as LocationsCache;
}

/** What one book's measuring pass produced. Named rather than positional: five of these are optional arrays of
 *  the same shape, and a caller that lines them up wrongly writes a cache that reads back as nonsense. */
export interface LocsCacheInput {
  sectionLocInfo: Array<{ startLoc: number; locCount: number }>;
  locNavCache: Map<number, string>;
  totalLocs: number;
  sectionWordCounts?: number[];
  sectionCharCounts?: number[];
  tocStartFractions?: Map<string, number>;
  sectionHeadings?: string[];
  anchorCharOffsets?: Map<string, number>;
  tocAnchorIds?: Map<string, string>;
}

export async function saveLocsCache(app: App, bookFile: TFile, input: LocsCacheInput): Promise<void> {
  await ensureFolder(app, bookFile);
  const cache: LocationsCache = {
    version: LOCS_CACHE_VERSION,
    totalLocs: input.totalLocs,
    sectionLocInfo: input.sectionLocInfo,
    locNavCache: Object.fromEntries([...input.locNavCache.entries()].map(([k, v]) => [String(k), v])),
  };
  if (input.sectionWordCounts?.length) cache.sectionWordCounts = input.sectionWordCounts;
  if (input.sectionCharCounts?.length) cache.sectionCharCounts = input.sectionCharCounts;
  if (input.tocStartFractions?.size) {
    cache.tocStartFractions = Object.fromEntries(input.tocStartFractions.entries());
  }
  // Kept even when every heading is '' — an empty array says "measured, found none", where a missing one says
  // "never measured" and would send the next open back to guessing.
  if (input.sectionHeadings) cache.sectionHeadings = input.sectionHeadings;
  if (input.anchorCharOffsets?.size) {
    cache.anchorCharOffsets = Object.fromEntries(input.anchorCharOffsets.entries());
  }
  if (input.tocAnchorIds?.size) cache.tocAnchorIds = Object.fromEntries(input.tocAnchorIds.entries());
  await app.vault.adapter.write(locsCacheFilePath(bookFile), JSON.stringify(cache, null, 2));
}

// ── Reading stats ─────────────────────────────────────────────────────────────

export interface ReadingStats {
  wpmSamples: number[]; // circular buffer, max 15, newest last
  lastUpdated: string; // ISO date string
}

export async function readReadingStats(app: App, bookFile: TFile): Promise<ReadingStats | null> {
  const raw = await readProgressJson(app, progressFilePath(bookFile));
  const rs = raw.readingStats as Record<string, unknown> | undefined;
  const readingStats =
    rs && Array.isArray(rs.wpmSamples)
      ? { wpmSamples: rs.wpmSamples as number[], lastUpdated: (rs.lastUpdated as string) ?? '' }
      : null;
  rememberHad(bookFile, { readingStats });
  return readingStats;
}

export async function saveReadingStats(app: App, bookFile: TFile, stats: ReadingStats): Promise<void> {
  await writeOrbisFile(app, bookFile, { readingStats: stats });
}

export async function saveBookInfo(
  app: App,
  bookFile: TFile,
  info: { title?: string; author?: string; coverImage?: string; toc?: TocEntry[] }
): Promise<void> {
  const existing = await readProgressJson(app, progressFilePath(bookFile));
  const patch: Record<string, unknown> = {};
  if (info.title && !existing.title) patch.title = info.title;
  if (info.author && !existing.author) patch.author = info.author;
  if (info.coverImage && !existing.coverImage) patch.coverImage = info.coverImage;
  if (info.toc && !existing.toc) patch.toc = info.toc;
  if (Object.keys(patch).length) await writeOrbisFile(app, bookFile, patch);
}

export async function readHighlights(app: App, bookFile: TFile): Promise<Highlight[]> {
  const raw = await readProgressJson(app, progressFilePath(bookFile));
  const highlights = listOf<Highlight>(raw.highlights);
  rememberHad(bookFile, { highlights });
  return highlights;
}

export async function saveHighlights(app: App, bookFile: TFile, highlights: Highlight[]): Promise<void> {
  await writeOrbisFile(app, bookFile, { highlights });
}

// ── Annotation preset (the book's own copy) ───────────────────────────────────
// See docs/design/annotation-presets.md. The book's copy is authoritative for rendering and export, so
// a shared book keeps its marks on a device that has never seen the global template.

/**
 * The book's assigned preset, or null when it has never been assigned one (the permanent default —
 * annotations then render from their stored color).
 *
 * Read defensively per docs/design/data-migration.md: a `preset` key that isn't the expected shape is
 * treated as absent rather than trusted, and marks are filtered to the ones that can actually draw.
 */
export async function readBookPreset(app: App, bookFile: TFile): Promise<BookPreset | null> {
  const raw = await readProgressJson(app, progressFilePath(bookFile));
  const preset = parseBookPreset(raw.preset);
  rememberHad(bookFile, { preset });
  return preset;
}

/** A `preset` key as `.orbis` holds it, read defensively — see `readBookPreset`. */
function parseBookPreset(value: unknown): BookPreset | null {
  const p = value as Partial<BookPreset> | undefined;
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !Array.isArray(p.marks)) return null;
  // Converts marks written before the wash/line split, and drops any that cannot draw.
  const migrated = migrateMarks(p.marks);
  // Per-mark provenance for copies written before it existed. A `customized: true` book gives no way to
  // know WHICH marks were edited, so read them all as local: nothing is lost, the book simply stops
  // tracking, and deleting a mark re-inherits it. `false` reads as all tracked, which is exactly true.
  const wasCustomized = p.customized === true;
  // Read `local` off the RAW marks, not the migrated ones: `migrateMark` rebuilds each mark field by field
  // and does not carry it, so the migrated object always reads `undefined` and every local mark would come
  // back tracked — a mark created in the book turning read-only once the file is re-read, and one the
  // survivor rule could delete, since the template it appears to track has no such mark. By id rather than
  // by index, because migration drops marks that cannot draw.
  const localIds = new Set(
    (p.marks as unknown[])
      .map((r) => r as { id?: unknown; local?: unknown } | null)
      .filter((m) => !!m && typeof m.id === 'string' && m.local === true)
      .map((m) => m?.id as string)
  );
  // `copyOf` the same way, off the raw marks: `migrateMark` drops it too, and a reloaded copy that no longer says
  // which preset mark it replaced would have that mark added back beside it by the next merge.
  const copyOf = new Map(
    (p.marks as unknown[])
      .map((r) => r as { id?: unknown; copyOf?: unknown } | null)
      .filter((m) => !!m && typeof m.id === 'string' && typeof m.copyOf === 'string')
      .map((m) => [m?.id as string, m?.copyOf as string])
  );
  const marks = migrated.map((m) => {
    const local = localIds.has(m.id) || wasCustomized;
    const source = copyOf.get(m.id);
    if (!local) return m;
    return source ? { ...m, local: true as const, copyOf: source } : { ...m, local: true as const };
  });
  return {
    id: p.id,
    // Empty when the copy predates the field — the UI treats that as "name unknown", which is different
    // from "no preset".
    name: typeof p.name === 'string' ? p.name : '',
    revision: typeof p.revision === 'number' ? p.revision : 1,
    customized: p.customized === true,
    marks,
    hiddenMarkIds: Array.isArray(p.hiddenMarkIds)
      ? p.hiddenMarkIds.filter((id): id is string => typeof id === 'string')
      : undefined,
    // Role pointers. A pointer at a mark that didn't survive the filter above resolves to unset, so they
    // need no validation of their own beyond being strings.
    noteMarkId: typeof p.noteMarkId === 'string' ? p.noteMarkId : undefined,
    audioMarkId: typeof p.audioMarkId === 'string' ? p.audioMarkId : undefined,
    /**
     * **Read back, or detaching undoes itself on the next reload.**
     *
     * `BookPreset.detached` exists precisely so "this book follows nothing" can be told apart from "this book
     * has never been assigned one" — and both store an empty `id`. Dropped here, the flag would be written to
     * the file and then thrown away on the way back in, so `ensureBookAnnotationPreset` would see an unassigned
     * book and hand it the default — the failure the flag exists to prevent, arriving through the read path.
     *
     * `true` only: absent and `false` are the same state, and the type says `true | undefined` so a stray
     * `false` in a file cannot become a third one.
     */
    detached: p.detached === true ? true : undefined,
  };
}

/** Assign (or re-assign) the book's preset. `null` unassigns — `JSON.stringify` drops the undefined,
 *  so the key leaves the file entirely rather than lingering as a tombstone. */
export async function saveBookPreset(app: App, bookFile: TFile, preset: BookPreset | null): Promise<void> {
  await writeOrbisFile(app, bookFile, { preset: preset ?? undefined });
}

// ── Reading records (per book) ────────────────────────────────────────────────
//
// In the `.orbis` file, not in plugin settings, for two reasons: it travels with the book (a book copied to
// another vault arrives with its answer, and one moved between folders keeps it), and it is a fact about the
// book rather than about this device — unlike the Listen voice, which is deliberately device-local. The
// shape and its defensive reading live in `record-config.ts`; this only knows the key.

/** The book's own records decision, or null when it has never been asked (→ the global default applies). */
export async function readBookRecords(app: App, bookFile: TFile): Promise<BookRecordConfig | null> {
  const raw = await readProgressJson(app, progressFilePath(bookFile));
  return parseBookRecordConfig(raw.records);
}

/** Store the book's decision. `null` un-decides it, so the next prompt asks again — same `undefined` trick
 *  as `saveBookPreset`, and the reason "never asked" and "asked, said no" stay distinguishable. */
export async function saveBookRecords(app: App, bookFile: TFile, config: BookRecordConfig | null): Promise<void> {
  await writeOrbisFile(app, bookFile, {}, (_orbis, device, version) => [recordsChange(config, device, version())]);
}

/**
 * Write a preset copy and the annotations that move with it in ONE go.
 *
 * Copying a preset mark into a book, remapping on a preset switch and promoting a book's marks to a new
 * preset all do the same three things: change the copy, and rewrite the `markId` on highlights and notes.
 * As three separate `writeOrbisFile` calls that is three read-modify-writes, and a failure between them
 * leaves annotations pointing at a mark that does not exist yet — or at one that has left the book. One patch,
 * one write, no half-applied state.
 */
export async function saveBookPresetAndAnnotations(
  app: App,
  bookFile: TFile,
  data: { preset: BookPreset | null; highlights: Highlight[]; notes: Note[] }
): Promise<void> {
  await writeOrbisFile(app, bookFile, {
    preset: data.preset ?? undefined,
    highlights: data.highlights,
    notes: data.notes,
  });
}

// ── Backlinks ─────────────────────────────────────────────────────────────────

export interface BacklinkEntry {
  noteTitle: string;
  notePath: string;
}

/**
 * Finds all vault notes that link to a given book via either:
 *   1. A regular file link (wiki-link or markdown path) — detected via metadataCache.resolvedLinks.
 *   2. An obsidian://orbis-nav deep link — detected by content scan for the encoded file param.
 *
 * Results are deduplicated (a note using both link types appears once) and sorted alphabetically.
 */
export async function scanBacklinks(bookPath: string, app: App): Promise<BacklinkEntry[]> {
  const matched = new Map<string, BacklinkEntry>();

  // Type 1: regular vault links to the book file (wiki-links, [text](path) markdown links)
  const resolvedLinks = app.metadataCache.resolvedLinks;
  for (const [fromPath, targets] of Object.entries(resolvedLinks)) {
    if ((targets[bookPath] ?? 0) > 0) {
      const f = app.vault.getAbstractFileByPath(fromPath);
      if (f instanceof TFile) matched.set(fromPath, { noteTitle: f.basename, notePath: fromPath });
    }
  }

  // Type 2: obsidian://orbis-nav deep links (requires content scan). Matched on the encoded path alone: a deep link
  // carries the book's name only encoded (`Sample%20Book.epub`) and as link text without its extension, so a note
  // holding nothing but a copied link never contains the raw file name.
  const fileParam = `file=${encodeURIComponent(bookPath)}`;
  const markdownFiles = app.vault.getMarkdownFiles();

  const processFile = async (file: TFile): Promise<void> => {
    if (matched.has(file.path)) return;
    if (file.stat.size < 50) return;
    let content: string;
    try {
      content = await app.vault.cachedRead(file);
    } catch {
      return;
    }
    if (!content.includes(fileParam)) return;
    matched.set(file.path, { noteTitle: file.basename, notePath: file.path });
  };

  const BATCH = 200;
  for (let i = 0; i < markdownFiles.length; i += BATCH) {
    await Promise.all(markdownFiles.slice(i, i + BATCH).map(processFile));
  }

  return [...matched.values()].sort((a, b) => a.noteTitle.localeCompare(b.noteTitle));
}
