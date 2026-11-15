// Book-level recording EDITIONS: a book can have several full-book generations (a Kokoro edition,
// a Piper edition, the same book in two voices…), and the user picks which one to play. Each edition
// is a self-contained folder under the book's audio dir — today's per-chapter manifest + MP3s,
// unchanged — so editions generate, play, and delete independently:
//
//   <audioDir>/editions.json                 ← the list + which edition is active for playback
//   <audioDir>/<editionKey>/manifest.json     ← one edition (engine + model + voice)
//   <audioDir>/<editionKey>/ch0000.mp3 …
//
// The folder name (editionKey) encodes engine/model/voice, so the layout is self-describing on disk.
//
// A chapter here is a CONTENTS ENTRY, not a spine section — `ch0000.mp3` is the book's first chapter as the
// contents panel counts them, and a mix pointer's `index` is the same ordinal (see `book-chapters`). A manifest
// from an older version carries section numbers under the same names, so it is rejected by version rather than
// reinterpreted: the book simply reads as unrecorded and can be recorded again.

import { type App, normalizePath } from 'obsidian';
import { loadRecordedChapter, type RecordedChapter } from './recorded-audio';
import { type RecordingManifest, readRecordingManifest } from './recording';

export interface EditionMeta {
  /** Folder-safe identity: for a voice edition, derived from engine+model+voice; for a mix, a
   *  timestamp-based id (a mix has no single voice — it points at other editions' chapters). */
  key: string;
  engine: string; // e.g. 'openai-compatible', 'piper-ondevice' (unused/'' for a mix)
  model: string;
  voice: string;
  createdAt: number;
  /** 'voice' (default) = a normal single-voice recording; 'mix' = a composition that references
   *  chapters from other (voice) editions, chosen per chapter. */
  kind?: 'voice' | 'mix';
  /** Human label for the picker. Voice editions leave it undefined (the UI derives it from the
   *  voice); a mix sets it explicitly (the user-typed name). */
  label?: string;
}

/** A live voice a mix chapter can use (read in real time, not from an MP3): a specific on-device
 *  Piper voice, a specific OS voice, or 'default' = whatever the user's current live voice is. */
export type MixLiveVoice =
  | { kind: 'orbis'; voiceId: string } // catalog id, optionally with a `#N` speaker suffix
  | { kind: 'system'; voiceURI: string }
  | { kind: 'default' };

/** A mix chapter points at EITHER a recorded source edition's MP3 (`sourceKey`) or a live voice
 *  (`live`) — never both. */
export interface MixChapter {
  index: number;
  sourceKey?: string;
  live?: MixLiveVoice;
}

/** A mix's per-chapter pointers: which source supplies each chapter. Stored as
 *  `<audioDir>/<mixKey>/mix.json` — NO audio files, so a mix never duplicates an MP3. */
export interface MixManifest {
  version: number;
  chapters: MixChapter[];
}

export interface EditionsIndex {
  version: number;
  /** Edition to use for playback + the modal's default view; null when there are none. */
  active: string | null;
  editions: EditionMeta[];
}

const EDITIONS_VERSION = 1;
const EDITIONS_FILE = 'editions.json';

const indexPath = (audioDir: string): string => normalizePath(`${audioDir}/${EDITIONS_FILE}`);

/**
 * Whether `key` can name an edition folder: one plain name, never a path.
 *
 * **Asked of every key read back from disk**, not only of the ones `editionKey` makes. `editions.json` and `mix.json`
 * live in the vault beside the book, so a shared or synced vault can hand over ones someone else wrote, and a key
 * becomes a folder that is read and recursively deleted. `normalizePath` keeps a `..` segment and the desktop adapter
 * resolves it, so `../../..` would leave the book's folder and then the vault. No leading dot, so neither `.` nor `..`
 * passes; no separator of either kind, because Windows reads `\` as one.
 */
function isSafeEditionKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(key);
}

/** Absolute vault path of one edition's own folder (where its manifest + MP3s live). Throws on a key that is not one
 *  plain name — the readers below drop those already, so reaching here with one is a bug, not a book. */
export function editionDir(audioDir: string, key: string): string {
  if (!isSafeEditionKey(key)) throw new Error(`Not an edition key: ${JSON.stringify(key)}`);
  return normalizePath(`${audioDir}/${key}`);
}

/** Folder-safe identity for an edition. Distinct engine/model/voice → distinct key (so two voices of
 *  the same book are separate editions), collapsed to `[a-z0-9._-]` joined by `__`. Stable: the same
 *  inputs always produce the same key, so regenerating an edition targets its existing folder. That holds for the keys
 *  made here; a key read back from disk is checked separately, by `isSafeEditionKey`. */
export function editionKey(engine: string, model: string, voice: string): string {
  const slug = (s: string): string =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return [slug(engine), slug(model), slug(voice)].filter(Boolean).join('__') || 'default';
}

async function exists(app: App, path: string): Promise<boolean> {
  try {
    return await app.vault.adapter.exists(normalizePath(path));
  } catch {
    return false;
  }
}

async function readEditionsIndex(app: App, audioDir: string): Promise<EditionsIndex | null> {
  try {
    const path = indexPath(audioDir);
    if (!(await app.vault.adapter.exists(path))) return null;
    const idx = JSON.parse(await app.vault.adapter.read(path)) as EditionsIndex;
    if (!Array.isArray(idx?.editions)) return null;
    // A key that is not one plain name is dropped here, before anything makes a path of it — see `isSafeEditionKey`.
    idx.editions = idx.editions.filter((e) => isSafeEditionKey(e?.key));
    if (!isSafeEditionKey(idx.active)) idx.active = null;
    return idx;
  } catch {
    return null;
  }
}

async function writeEditionsIndex(app: App, audioDir: string, idx: EditionsIndex): Promise<void> {
  // The folder first, because on a book's FIRST-EVER recording nothing has created it yet: `upsertEdition`
  // runs before the generator and its own `ensureFolder` makes `<book>/!orbis-data/audio/<basename>/`.
  // Writing into a missing folder rejects, there is no catch above it, and the dialog would sit on
  // "Starting…" for ever with nothing in the log. Recursive: `audio/` and `<basename>/` are both usually missing.
  await ensureFolder(app, audioDir);
  await app.vault.adapter.write(indexPath(audioDir), JSON.stringify(idx, null, 2));
}

/** Create `dir` and every missing parent. `adapter.mkdir` makes ONE level, so a two-deep path needs this. */
async function ensureFolder(app: App, dir: string): Promise<void> {
  const parts = normalizePath(dir).split('/');
  let cur = '';
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (await exists(app, cur)) continue;
    try {
      await app.vault.adapter.mkdir(cur);
    } catch {
      /* concurrent create / already exists */
    }
  }
}

/** The editions index for a book. Returns an empty index (no editions) when nothing has been generated. */
export async function listEditions(app: App, audioDir: string): Promise<EditionsIndex> {
  return (await readEditionsIndex(app, audioDir)) ?? { version: EDITIONS_VERSION, active: null, editions: [] };
}

/** Remove editions that have no recorded chapters (an empty folder + index entry left behind when a
 *  run was cancelled before its first chapter finished), deleting each empty folder. `protectedKey`
 *  is skipped — pass the currently-generating edition so an in-progress run isn't pruned before its
 *  first chapter lands. Best-effort; keeps `active` valid — an empty edition that was selected leaves None selected,
 *  never another recording (see `deleteEdition`). */
export async function pruneEmptyEditions(app: App, audioDir: string, protectedKey?: string | null): Promise<void> {
  const idx = await listEditions(app, audioDir);
  const empties: string[] = [];
  for (const e of idx.editions) {
    if (e.key === protectedKey || e.kind === 'mix') continue; // never prune a mix — it has no
    // manifest.json (uses mix.json) and is a deliberate, named edition managed via "Delete mix".
    const m = await readEditionManifest(app, audioDir, e.key);
    if (!m || m.chapters.length === 0) empties.push(e.key);
  }
  if (!empties.length) return;
  for (const key of empties) {
    try {
      const dir = editionDir(audioDir, key);
      if (await exists(app, dir)) await app.vault.adapter.rmdir(dir, true);
    } catch {
      /* best-effort */
    }
  }
  idx.editions = idx.editions.filter((e) => !empties.includes(e.key));
  if (idx.active && empties.includes(idx.active)) idx.active = null;
  await writeEditionsIndex(app, audioDir, idx);
}

/** Register (or refresh createdAt of) an edition. Called when a generation run targets an edition, so the folder +
 *  index stay in sync. Selected only when it is the book's first edition. */
export async function upsertEdition(
  app: App,
  audioDir: string,
  meta: Omit<EditionMeta, 'key'> & { key?: string }
): Promise<EditionMeta> {
  const key = meta.key ?? editionKey(meta.engine, meta.model, meta.voice);
  const idx = await listEditions(app, audioDir);
  const entry: EditionMeta = {
    key,
    engine: meta.engine,
    model: meta.model,
    voice: meta.voice,
    createdAt: meta.createdAt,
    ...(meta.label ? { label: meta.label } : {}),
  };
  // Don't hijack playback: the active (playback) edition and the recording target are independent. Only the book's
  // first edition is selected, since there was nothing to choose before it; once the book has any, an empty `active`
  // is the reader's choice of None and recording another voice leaves it alone.
  const first = idx.editions.length === 0;
  idx.editions = [...idx.editions.filter((e) => e.key !== key), entry].sort((a, b) => a.createdAt - b.createdAt);
  if (first) idx.active = key;
  await writeEditionsIndex(app, audioDir, idx);
  return entry;
}

/** Switch which edition plays back. No-op if the key isn't a known edition. */
export async function setActiveEdition(app: App, audioDir: string, key: string): Promise<void> {
  const idx = await listEditions(app, audioDir);
  if (!idx.editions.some((e) => e.key === key)) return;
  idx.active = key;
  await writeEditionsIndex(app, audioDir, idx);
}

/** Rename an edition (its display label — e.g. a mix's name). No-op if the key isn't known. */
export async function setEditionLabel(app: App, audioDir: string, key: string, label: string): Promise<void> {
  const idx = await listEditions(app, audioDir);
  const e = idx.editions.find((x) => x.key === key);
  if (!e) return;
  e.label = label;
  await writeEditionsIndex(app, audioDir, idx);
}

/** Clear the active edition (active = null) — the book plays with the live voice even though it has
 *  recordings (the reader's "None" recording option). Playback resolves a null active to the live
 *  engine per chapter (see loadEditionChapter callers). No-op when there are no editions. */
export async function clearActiveEdition(app: App, audioDir: string): Promise<void> {
  const idx = await listEditions(app, audioDir);
  if (!idx.editions.length) return;
  idx.active = null;
  await writeEditionsIndex(app, audioDir, idx);
}

/**
 * Delete one whole edition (its folder + index entry).
 *
 * **Deleting the selected one selects None, never another.** It used to fall to the newest remaining edition, which
 * changed what plays to something the reader never chose; None — the live voice — is what the book did before any
 * recording existed.
 */
export async function deleteEdition(app: App, audioDir: string, key: string): Promise<void> {
  const idx = await listEditions(app, audioDir);
  try {
    const dir = editionDir(audioDir, key);
    if (await exists(app, dir)) await app.vault.adapter.rmdir(dir, true);
  } catch {
    /* best-effort */
  }
  idx.editions = idx.editions.filter((e) => e.key !== key);
  if (idx.active === key) idx.active = null;
  await writeEditionsIndex(app, audioDir, idx);
}

/** Resolve the active edition's folder for playback/status, or null when the book has no editions.
 *  Falls back to the first edition if the index somehow has no active key. */
async function activeEditionDir(app: App, audioDir: string): Promise<string | null> {
  const idx = await listEditions(app, audioDir);
  const key = idx.active ?? idx.editions[0]?.key ?? null;
  return key ? editionDir(audioDir, key) : null;
}

/** Read a specific edition's chapter manifest (or the active one when `key` is omitted). */
export async function readEditionManifest(app: App, audioDir: string, key?: string): Promise<RecordingManifest | null> {
  const dir = key ? editionDir(audioDir, key) : await activeEditionDir(app, audioDir);
  if (!dir) return null;
  return readRecordingManifest(app, normalizePath(`${dir}/manifest.json`));
}

// ── Mixes: an edition that references chapters from other (voice) editions ────────────────────────

// 2: a mix pointer's `index` is a CHAPTER ordinal, not a spine section — see MANIFEST_VERSION. A version-1 mix
// assigns voices by file, so on any book where the two lists differ its pointers name different chapters: in a
// novel in parts, with more chapters than files, a mix built by file would quietly re-voice the wrong ones.
// Rejected rather than reinterpreted, on the same grounds as the manifest — a mix reads as unassigned, which is
// exactly what an unassigned mix does anyway (every chapter falls back to the live voice).
const MIX_VERSION = 2;
const mixPath = (audioDir: string, key: string) => normalizePath(`${editionDir(audioDir, key)}/mix.json`);

/**
 * Read a mix's pointer file, or null when the key isn't a mix (no mix.json).
 *
 * A mix from an older version keeps its identity and its name — it is still a mix, and still listed — but its
 * per-chapter assignments are dropped, because they were made against a different chapter list. See MIX_VERSION.
 */
export async function readMix(app: App, audioDir: string, key: string): Promise<MixManifest | null> {
  try {
    const path = mixPath(audioDir, key);
    if (!(await exists(app, path))) return null;
    const m = JSON.parse(await app.vault.adapter.read(path)) as MixManifest;
    if (!Array.isArray(m?.chapters)) return null;
    if (m.version !== MIX_VERSION) return { version: MIX_VERSION, chapters: [] };
    // A pointer is a folder too: a source key that is not one plain name is dropped, as in the index.
    m.chapters = m.chapters.filter((c) => c?.sourceKey === undefined || isSafeEditionKey(c.sourceKey));
    return m;
  } catch {
    return null;
  }
}

async function writeMix(app: App, audioDir: string, key: string, mix: MixManifest): Promise<void> {
  const dir = editionDir(audioDir, key);
  if (!(await exists(app, dir))) await app.vault.adapter.mkdir(dir);
  await app.vault.adapter.write(mixPath(audioDir, key), JSON.stringify(mix, null, 2));
}

/** Create a new (empty) mix edition with the given display name. Never selected — creating a mix doesn't change what
 *  plays, not even when None is selected (an empty `active`). Returns its EditionMeta. */
export async function createMix(app: App, audioDir: string, name: string, createdAt: number): Promise<EditionMeta> {
  const key = `mix__${createdAt}`;
  const idx = await listEditions(app, audioDir);
  const entry: EditionMeta = { key, engine: '', model: '', voice: '', createdAt, kind: 'mix', label: name };
  idx.editions = [...idx.editions.filter((e) => e.key !== key), entry].sort((a, b) => a.createdAt - b.createdAt);
  await writeEditionsIndex(app, audioDir, idx);
  await writeMix(app, audioDir, key, { version: MIX_VERSION, chapters: [] });
  return entry;
}

/** Point the given chapters of a mix at a source (voice) edition — but only the chapters that source
 *  has actually recorded. Replaces any existing pointer for those indices. Returns the updated mix. */
export async function setMixSource(
  app: App,
  audioDir: string,
  mixKey: string,
  sourceKey: string,
  indices: readonly number[]
): Promise<MixManifest> {
  const mix = (await readMix(app, audioDir, mixKey)) ?? { version: MIX_VERSION, chapters: [] };
  const recorded = new Set((await readEditionManifest(app, audioDir, sourceKey))?.chapters.map((c) => c.index) ?? []);
  const targets = indices.filter((i) => recorded.has(i));
  const drop = new Set(targets);
  mix.chapters = [
    ...mix.chapters.filter((c) => !drop.has(c.index)),
    ...targets.map((index) => ({ index, sourceKey })),
  ].sort((a, b) => a.index - b.index);
  await writeMix(app, audioDir, mixKey, mix);
  return mix;
}

/** Drop any RECORDED mix pointers to a source edition that no longer has the referenced chapter (the
 *  source edition or chapter was deleted). Live pointers are always kept (no file dependency). Leaves
 *  gaps that fall back to the live voice. */
export async function pruneMixPointers(app: App, audioDir: string, mixKey: string): Promise<void> {
  const mix = await readMix(app, audioDir, mixKey);
  if (!mix) return;
  const bySource = new Map<string, Set<number>>();
  const kept: MixChapter[] = [];
  for (const c of mix.chapters) {
    if (!c.sourceKey) {
      kept.push(c); // a live pointer — nothing to dangle
      continue;
    }
    let have = bySource.get(c.sourceKey);
    if (!have) {
      have = new Set((await readEditionManifest(app, audioDir, c.sourceKey))?.chapters.map((x) => x.index) ?? []);
      bySource.set(c.sourceKey, have);
    }
    if (have.has(c.index)) kept.push(c);
  }
  if (kept.length !== mix.chapters.length) await writeMix(app, audioDir, mixKey, { ...mix, chapters: kept });
}

/** Point the given chapters of a mix at a LIVE voice (real-time playback, no coverage constraint —
 *  any chapter can use a live voice). Replaces any existing pointer for those indices. */
export async function setMixLive(
  app: App,
  audioDir: string,
  mixKey: string,
  live: MixLiveVoice,
  indices: readonly number[]
): Promise<MixManifest> {
  const mix = (await readMix(app, audioDir, mixKey)) ?? { version: MIX_VERSION, chapters: [] };
  const drop = new Set(indices);
  mix.chapters = [...mix.chapters.filter((c) => !drop.has(c.index)), ...indices.map((index) => ({ index, live }))].sort(
    (a, b) => a.index - b.index
  );
  await writeMix(app, audioDir, mixKey, mix);
  return mix;
}

/** Load one chapter of an edition for playback, resolving mixes: a mix chapter's audio + segments
 *  come from its source (voice) edition, while chapterCount + laterRecorded span the MIX. */
export async function loadEditionChapter(
  app: App,
  audioDir: string,
  key: string,
  index: number
): Promise<RecordedChapter | null> {
  const mix = await readMix(app, audioDir, key);
  if (!mix) return loadRecordedChapter(app, editionDir(audioDir, key), index);
  const ptr = mix.chapters.find((c) => c.index === index);
  // No pointer, or a LIVE chapter → no recorded audio; the controller reads it with the live engine
  // (using the per-chapter voice override for a specific live voice, else the default live voice).
  if (!ptr?.sourceKey) return null;
  const chapter = await loadRecordedChapter(app, editionDir(audioDir, ptr.sourceKey), index);
  if (!chapter) return null;
  chapter.chapterCount = mix.chapters.length;
  chapter.laterRecorded = await mixLaterRecorded(app, audioDir, mix, index);
  return chapter;
}

/** The mix's recorded tracks after `index`, each with its length (s) from its source edition. */
async function mixLaterRecorded(
  app: App,
  audioDir: string,
  mix: MixManifest,
  index: number
): Promise<Map<number, number>> {
  const bySource = new Map<string, RecordingManifest | null>();
  const out = new Map<number, number>();
  for (const c of mix.chapters) {
    if (c.index <= index || !c.sourceKey) continue; // a live track has no recorded length; it is estimated
    let sm = bySource.get(c.sourceKey);
    if (sm === undefined) {
      sm = await readEditionManifest(app, audioDir, c.sourceKey);
      bySource.set(c.sourceKey, sm);
    }
    const duration = sm?.chapters.find((x) => x.index === c.index && x.complete)?.duration;
    if (duration != null) out.set(c.index, duration);
  }
  return out;
}
