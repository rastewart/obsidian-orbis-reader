// Fonts: the ones in the vault, the ones the system has, and which of them the Font list offers.
//
// **Fonts live in the vault**, in one folder (`!orbis-data/fonts` unless the reader picks another), so a font
// downloaded or imported on one device reaches the others with the rest of the vault. The folder is looked through,
// not listed in a setting: a font file the reader drops in by hand is a font, and a family is whatever the files say
// they are (`font-file.ts`), however the folder is arranged.
//
// **A display style names a font by family**, as CSS does: `"Literata"`. So moving the folder, or a font arriving a
// little later through sync, never breaks a style; until the files are here, the book is drawn with the default font
// and the Font list says the font is not on this device.
//
// **Loaded into each page, not linked.** A book's chapters are separate documents, each with its own set of fonts.
// The files of the fonts being read in are kept in memory, and added to each chapter's document with the `FontFace`
// API: nothing has to resolve a file address inside the book's frame, which works the same on every platform.
//
// See docs/design/fonts.md.

import { type App, type EventRef, normalizePath, Platform, TFile, TFolder, Vault } from 'obsidian';
import { FACE_SLOTS, type FaceSlot, type FontFileInfo, facesCovered, isLicenseFile, readFontFile } from './font-file';
import { t } from './i18n';
import { ensureVaultFolder } from './reader/record-move';
import { FONT_FAMILY_OPTIONS } from './settings';

/** Where fonts go when the reader has not picked a folder. Beside the configuration folder, `!orbis-data/sync`. */
export const DEFAULT_FONTS_FOLDER = '!orbis-data/fonts';

/** The folder a setting names, with the default for an empty one. */
export function fontsFolderOf(setting: unknown): string {
  const trimmed = normalizePath(typeof setting === 'string' ? setting.trim() : '').replace(/\/+$/, '');
  return trimmed && trimmed !== '/' ? trimmed : DEFAULT_FONTS_FOLDER;
}

/** The file types a font in the folder may be. See `font-file.ts` for why not WOFF. */
export const FONT_EXTENSIONS = ['ttf', 'otf'] as const;

/** One file of a family in the vault. */
export interface VaultFace
  extends Pick<FontFileInfo, 'weight' | 'italic' | 'weightRange' | 'width' | 'fsType' | 'subfamily'> {
  path: string;
}

/** A family in the fonts folder: every file that names it, wherever in the folder it is. */
export interface VaultFont {
  family: string;
  faces: VaultFace[];
}

/** The four faces, and which this family has. */
export function slotsOf(font: VaultFont): Record<FaceSlot, boolean> {
  const covered = facesCovered(font.faces);
  return Object.fromEntries(FACE_SLOTS.map((slot) => [slot, covered.has(slot)])) as Record<FaceSlot, boolean>;
}

/** The value a display style stores for a vault font: the family, quoted as CSS wants it. */
export function vaultFontValue(family: string): string {
  return `"${family.replace(/["\\]/g, '')}"`;
}

/** The family a stored value names when it is a single quoted family — a vault font's form — or null. */
export function familyOfValue(value: string): string | null {
  const m = /^"([^"]+)"$/.exec(value.trim());
  return m ? m[1] : null;
}

/** The fonts the system may have: every entry of the Font list but the book's own and Obsidian's. */
export const SYSTEM_FONTS = FONT_FAMILY_OPTIONS.filter((o) => o.value !== 'default' && o.value !== 'obsidian');

/** The first family a CSS font list names, unquoted: `Palatino Linotype` for `"Palatino Linotype", Palatino, serif`. */
function firstFamily(value: string): string {
  return (value.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

/**
 * What a device does with a system font's name.
 *
 * - `here`: it has the font.
 * - `missing`: it does not, and draws the default font.
 * - `serif`, `sans-serif`: it answers the name with its own serif or sans-serif font. Android does this for
 *   Georgia, Times New Roman, Palatino, Arial and Verdana, so those look the same as each other there.
 */
export type SystemFontStatus = 'here' | 'missing' | 'serif' | 'sans-serif';

const systemAnswers = new Map<string, SystemFontStatus>();

/**
 * What this device has for a system font, for any family in its list but the generic one at the end.
 *
 * **Measured, not asked.** `document.fonts.check()` answers true for a font that does not exist — there is nothing
 * to load — so the test is the old one: draw a line of text in the font with a fallback behind it, and see whether
 * the width differs from the fallback alone. Two fallbacks, so a font that happens to match one of them is not
 * mistaken for missing.
 *
 * **Stand-ins are looked for on Android only.** There a present font is compared with the device's own serif and
 * sans-serif too. Elsewhere that test would be wrong: on Windows and macOS, Times New Roman and Arial ARE the default
 * serif and sans-serif, and would be called stand-ins for themselves.
 */
export function systemFontStatus(
  value: string,
  doc: Document = activeDocument,
  standIns: boolean = Platform.isAndroidApp
): SystemFontStatus {
  const known = systemAnswers.get(value);
  if (known !== undefined) return known;
  const ctx = doc.createElement('canvas').getContext('2d');
  if (!ctx) return 'here';
  const sample = 'mmmmmmmmmmlliWWQq 0123456789';
  const width = (font: string) => {
    ctx.font = `72px ${font}`;
    return ctx.measureText(sample).width;
  };
  const families = value
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f && !/^(serif|sans-serif|monospace|cursive|fantasy)$/.test(f));
  const present = families.find((family) =>
    ['monospace', 'serif'].some((fallback) => width(`${family}, ${fallback}`) !== width(fallback))
  );
  let answer: SystemFontStatus = present ? 'here' : 'missing';
  if (present && standIns) {
    const drawn = width(`${present}, monospace`);
    if (drawn === width('serif')) answer = 'serif';
    else if (drawn === width('sans-serif')) answer = 'sans-serif';
  }
  systemAnswers.set(value, answer);
  return answer;
}

/** A system font's name as the Font list shows it: marked when the device does not have it or stands in for it. */
function systemLabel(name: string, status: SystemFontStatus): string {
  if (status === 'missing') return t('fonts.not_on_device', { name });
  if (status === 'serif') return t('fonts.same_as_serif_list', { name });
  if (status === 'sans-serif') return t('fonts.same_as_sans_list', { name });
  return name;
}

// ── The library ──────────────────────────────────────────────────────────────

/** What the rest of the plugin needs from the vault and the settings. */
interface FontHost {
  app: App;
  folder: () => string;
}

let host: FontHost | null = null;
/** The last answer, so a dropdown built without waiting has something to show. */
let known: VaultFont[] = [];
let scanning: Promise<VaultFont[]> | null = null;
/** Parsed headers, by path and `stampOf`, so a rescan reads only what changed. */
const headers = new Map<string, { stamp: string; info: FontFileInfo | null }>();
/**
 * File bytes, by path and `stampOf`, for the families in `kept` only: the fonts books are being read in. A folder can
 * hold far more than that, and a phone has little memory to spare for fonts nobody is reading in.
 */
const bytes = new Map<string, { stamp: string; data: ArrayBuffer }>();
/** The families books last used, newest first. Two, so a book in a window of its own can have another font. */
let kept: string[] = [];
const KEEP = 2;
const listeners = new Set<() => void>();

/** A face given to a document: which file it came from, as it was, and the promise of it being loaded. */
interface AddedFace {
  family: string;
  stamp: string;
  face: FontFace;
  loaded: Promise<unknown>;
}
/** The faces each document has been given, by path, so a chapter is not given the same one twice. */
const added = new WeakMap<Document, Map<string, AddedFace>>();

/** What tells one version of a file from another. */
function stampOf(file: TFile): string {
  return `${file.stat.mtime}:${file.stat.size}`;
}

/** Point the library at a vault. Called once when the plugin loads. */
export function initFonts(next: FontHost): void {
  host = next;
  known = [];
  void scanFonts();
}

/** Run `fn` whenever the fonts in the folder change. Returns the way to stop. */
export function onFontsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The fonts found last time, without waiting. */
export function knownFonts(): readonly VaultFont[] {
  return known;
}

/** Whether a file is a font, by its extension in any case. */
function isFontFile(file: TFile): boolean {
  return (FONT_EXTENSIONS as readonly string[]).includes(file.extension.toLowerCase());
}

/** Every file in a folder, at any depth. */
function filesUnder(folder: TFolder): TFile[] {
  const files: TFile[] = [];
  Vault.recurseChildren(folder, (f) => {
    if (f instanceof TFile) files.push(f);
  });
  return files;
}

/** The font files in the folder, at any depth. Only that folder is looked through, not the vault. */
export function fontFilesIn(app: App, folder: string): TFile[] {
  const root = app.vault.getAbstractFileByPath(folder);
  return root instanceof TFolder ? filesUnder(root).filter(isFontFile) : [];
}

/** Asked for while a look was under way: the vault changed after that look began, so it may be out of date. */
let again = false;

/**
 * Look through the folder again.
 *
 * **Requests during a look are answered by one more look**, however many there are, and not by the one under way. The
 * vault can change after a look has listed the folder — moving the folder fires an event per file before the one for
 * the folder, and the setting follows only on the last — so an answer from the look in progress could be the old
 * folder's contents.
 */
export function scanFonts(): Promise<VaultFont[]> {
  if (scanning) {
    again = true;
    return scanning;
  }
  const run = async (): Promise<VaultFont[]> => {
    let fonts: VaultFont[];
    do {
      again = false;
      fonts = await look();
      if (!again) publish(fonts);
      // Once more when a listener asked, too.
    } while (again);
    return fonts;
  };
  scanning = run()
    .catch((err: unknown) => {
      console.error('[Orbis] could not read the fonts folder —', err);
      return known;
    })
    .finally(() => {
      scanning = null;
    });
  return scanning;
}

function publish(fonts: VaultFont[]): void {
  const changed = JSON.stringify(fonts) !== JSON.stringify(known);
  known = fonts;
  if (changed) for (const fn of [...listeners]) fn();
}

/** The families in the folder now. A file that cannot be read, or is not a whole font, is left out. */
async function look(): Promise<VaultFont[]> {
  if (!host) return [];
  const { app } = host;
  const families = new Map<string, VaultFont>();
  const files = fontFilesIn(app, host.folder());
  for (const file of files) {
    const info = await fontInfoOf(app, file);
    if (!info) continue;
    const key = info.family.toLowerCase();
    const font = families.get(key) ?? { family: info.family, faces: [] };
    font.faces.push({
      path: file.path,
      weight: info.weight,
      italic: info.italic,
      weightRange: info.weightRange,
      width: info.width,
      fsType: info.fsType,
      subfamily: info.subfamily,
    });
    families.set(key, font);
  }
  const paths = new Set(files.map((f) => f.path));
  for (const cache of [headers, bytes]) for (const path of [...cache.keys()]) if (!paths.has(path)) cache.delete(path);
  return [...families.values()].sort((a, b) => a.family.localeCompare(b.family));
}

/**
 * What a font file says about itself, or null when it is not a whole font this can use or cannot be read now — as one
 * that has not finished syncing cannot. One such file says nothing about the others.
 */
export async function fontInfoOf(app: App, file: TFile): Promise<FontFileInfo | null> {
  const stamp = stampOf(file);
  const cached = headers.get(file.path);
  if (cached?.stamp === stamp) return cached.info;
  let data: ArrayBuffer;
  try {
    data = await app.vault.readBinary(file);
  } catch (err) {
    // Not remembered: the next look tries again.
    console.warn(`[Orbis] could not read the font file ${file.path} —`, err);
    return null;
  }
  const result = readFontFile(new Uint8Array(data));
  const info = result.ok ? result.info : null;
  headers.set(file.path, { stamp, info });
  return info;
}

/** A font file's bytes, from memory when its family is one books are being read in. */
async function readBytes(app: App, file: TFile, family: string): Promise<ArrayBuffer> {
  const stamp = stampOf(file);
  const cached = bytes.get(file.path);
  if (cached?.stamp === stamp) return cached.data;
  const data = await app.vault.readBinary(file);
  if (kept.includes(family)) bytes.set(file.path, { stamp, data });
  return data;
}

/** Keep the bytes of `font` in memory, for the chapters still to come, and let go of those of a font left behind. */
function keepBytes(font: VaultFont): void {
  kept = [font.family.toLowerCase(), ...kept.filter((f) => f !== font.family.toLowerCase())].slice(0, KEEP);
  const paths = new Set(
    known.filter((f) => kept.includes(f.family.toLowerCase())).flatMap((f) => f.faces.map((face) => face.path))
  );
  for (const path of [...bytes.keys()]) if (!paths.has(path)) bytes.delete(path);
}

/**
 * Whether a path is the fonts folder or inside it — what the vault watcher asks before rescanning.
 */
export function inFontsFolder(path: string): boolean {
  if (!host) return false;
  const folder = host.folder();
  return path === folder || path.startsWith(`${folder}/`);
}

/** The vault font a stored value names, if it is one and it is here. */
export function vaultFontFor(value: string): VaultFont | null {
  const family = familyOfValue(value);
  if (!family) return null;
  return known.find((f) => f.family.toLowerCase() === family.toLowerCase()) ?? null;
}

/**
 * Give the faces of a vault font to whichever document `el` ends up in, once it is in one.
 *
 * **For anything drawn in Settings.** On a computer, Settings is a window of its own, and a settings page is built
 * into an element before that element is placed in the window. Its document at build time is the main window's, so
 * fonts added then go to the wrong window, and the element arrives in Settings without them. Waiting until the
 * element is in the page it will be seen in, a frame or two, puts them where it is.
 */
export async function useFontFor(el: HTMLElement, value: string): Promise<void> {
  if (!familyOfValue(value)) return;
  for (let i = 0; i < 60 && !el.isConnected; i++) await new Promise((r) => window.setTimeout(r, 16));
  if (el.isConnected) await useFontIn(el.ownerDocument, value, false);
}

/**
 * Give a document the faces of the vault font a value names — a chapter of a book, or a settings preview. Does
 * nothing for a system font, for the book's own, or for a family not in the vault.
 *
 * **Called again, it brings the document up to date**: a face added to the family since is given, one whose file
 * changed is given again, one whose file is gone is taken back, and one that failed to load is tried again.
 *
 * `reading` says a book is being read in the font, whose other chapters will want the same bytes soon.
 *
 * Returns once the faces have loaded, so a caller that lays text out by its size can wait for them.
 */
export async function useFontIn(doc: Document, value: string, reading = true): Promise<void> {
  const family = familyOfValue(value);
  if (!host || !family) return;
  const font = vaultFontFor(value) ?? findAfterScan(await scanFonts(), value);
  // The document's own constructor: a FontFace made in the plugin's window belongs to that window.
  const FontFaceIn = doc.defaultView?.FontFace;
  if (!FontFaceIn || !doc.fonts) return;
  const { app } = host;
  const faces = added.get(doc) ?? new Map<string, AddedFace>();
  added.set(doc, faces);
  const wanted = new Set(font?.faces.map((f) => f.path));
  for (const [path, was] of [...faces]) {
    if (was.family !== family.toLowerCase() || wanted.has(path)) continue;
    doc.fonts.delete(was.face);
    faces.delete(path);
  }
  if (!font) return;
  if (reading) keepBytes(font);
  const loads = font.faces.map(async (face) => {
    const file = app.vault.getAbstractFileByPath(face.path);
    if (!(file instanceof TFile)) return;
    const stamp = stampOf(file);
    const was = faces.get(face.path);
    if (was?.stamp === stamp) return was.loaded;
    const data = await readBytes(app, file, family.toLowerCase());
    // Another call may have given it while the file was read.
    const now = faces.get(face.path);
    if (now?.stamp === stamp) return now.loaded;
    if (now) doc.fonts.delete(now.face);
    const [low, high] = face.weightRange ?? [face.weight, face.weight];
    const fontFace = new FontFaceIn(font.family, data, {
      weight: low === high ? String(low) : `${low} ${high}`,
      style: face.italic ? 'italic' : 'normal',
      stretch: `${face.width}%`,
    });
    doc.fonts.add(fontFace);
    const loaded = fontFace.load().catch(() => {
      // Not left as given, so the next call tries again.
      doc.fonts.delete(fontFace);
      if (faces.get(face.path)?.face === fontFace) faces.delete(face.path);
    });
    faces.set(face.path, { family: family.toLowerCase(), stamp, face: fontFace, loaded });
    return loaded;
  });
  await Promise.allSettled(loads);
}

function findAfterScan(fonts: readonly VaultFont[], value: string): VaultFont | null {
  const family = familyOfValue(value)?.toLowerCase();
  return fonts.find((f) => f.family.toLowerCase() === family) ?? null;
}

/**
 * Keep the library current as the vault changes: a font file added, removed, renamed or replaced in the folder —
 * by an import, by sync, or by hand — is looked for again, and every open book is told.
 *
 * **And follow the folder when the reader moves it in the file explorer**, so the setting and the folder cannot
 * part. A move made by the Fonts page changes the setting first, so it is not followed twice.
 */
export function watchFonts(plugin: {
  app: App;
  registerEvent: (ref: EventRef) => void;
  settings: { fontsFolder: string };
  saveSettings: () => Promise<void>;
  refreshViews: () => void;
}): void {
  const { vault } = plugin.app;
  const changed = (path: string, oldPath?: string) => {
    if (!inFontsFolder(path) && !(oldPath && inFontsFolder(oldPath))) return;
    void scanFonts();
  };
  plugin.registerEvent(vault.on('create', (f) => changed(f.path)));
  plugin.registerEvent(vault.on('delete', (f) => changed(f.path)));
  plugin.registerEvent(vault.on('modify', (f) => changed(f.path)));
  plugin.registerEvent(
    vault.on('rename', (f, oldPath) => {
      if (f instanceof TFolder && oldPath === fontsFolderOf(plugin.settings.fontsFolder)) {
        plugin.settings.fontsFolder = f.path;
        void plugin.saveSettings();
      }
      changed(f.path, oldPath);
    })
  );
  onFontsChanged(() => plugin.refreshViews());
}

/** Forget what was read, so the next look reads every file again — after the folder moves. */
export function forgetFontFiles(): void {
  headers.clear();
  bytes.clear();
}

// ── The Font list ────────────────────────────────────────────────────────────

export interface FontChoice {
  value: string;
  label: string;
}

/**
 * What the Font list offers: the book's own fonts and Obsidian's, then every font switched on, system fonts and the
 * vault's together, in alphabetical order. The first two lead because they choose WHICH font rather than being one.
 *
 * - **A system font this device does not have**, or answers with its own serif or sans-serif, stays in the list,
 *   marked, so a reader can see why choosing it changes nothing — and switch it off on the Fonts page.
 * - **The font in use is always offered**, switched off or not here yet, so the list never shows a value it cannot
 *   hold.
 */
export function fontChoices(hidden: readonly string[], current: string, doc?: Document): FontChoice[] {
  const off = new Set(hidden);
  const lead: FontChoice[] = [];
  const fonts: (FontChoice & { name: string })[] = [];
  for (const option of FONT_FAMILY_OPTIONS) {
    const name = t(option.labelKey);
    if (option.value === 'default' || option.value === 'obsidian') {
      lead.push({ value: option.value, label: name });
      continue;
    }
    if (off.has(option.value) && option.value !== current) continue;
    fonts.push({ value: option.value, name, label: systemLabel(name, systemFontStatus(option.value, doc)) });
  }
  for (const font of known) {
    const value = vaultFontValue(font.family);
    if (off.has(value) && value !== current) continue;
    fonts.push({ value, name: font.family, label: font.family });
  }
  if (current && !lead.some((c) => c.value === current) && !fonts.some((c) => c.value === current)) {
    const name = familyOfValue(current) ?? firstFamily(current);
    fonts.push({ value: current, name, label: t('fonts.not_on_device', { name }) });
  }
  fonts.sort((a, b) => a.name.localeCompare(b.name));
  return [...lead, ...fonts.map(({ value, label }) => ({ value, label }))];
}

// ── Moving the folder ────────────────────────────────────────────────────────

export interface FolderMove {
  /** Font files now in the new folder. */
  moved: number;
  /** Left where they were, because something of the same name is already there. */
  skipped: number;
  /** Left where they were, because moving them failed. */
  failed: number;
}

/**
 * Move the fonts in the folder from `from` to `to`, with their license files, when the reader changes the setting.
 *
 * **Only the fonts.** The setting can name any folder of the vault, one with books and notes in it too, and those are
 * not the fonts' to move: a folder that holds nothing but fonts and licenses moves whole, and from any other the fonts
 * move and the rest stays.
 *
 * **Renamed through Obsidian's file manager**, a folder at a time where that can be, so a sync tool sees a move rather
 * than a deletion and a new file. A file whose name is already taken in the new folder stays where it was, and is
 * counted, as is one that could not be moved. A folder left empty is removed.
 *
 * Refuses a move into itself or out of a folder inside the new one; the caller checks `moveProblem` first.
 */
export async function moveFontsFolder(app: App, from: string, to: string): Promise<FolderMove> {
  const result: FolderMove = { moved: 0, skipped: 0, failed: 0 };
  const source = app.vault.getAbstractFileByPath(from);
  if (!(source instanceof TFolder) || moveProblem(from, to)) return result;
  await moveFonts(app, source, to, result);
  return result;
}

async function moveFonts(app: App, entry: TFile | TFolder, dest: string, result: FolderMove): Promise<void> {
  const fonts = entry instanceof TFolder ? filesUnder(entry).filter(isFontFile).length : isFontFile(entry) ? 1 : 0;
  if (entry instanceof TFolder && fonts === 0) return;
  const taken = app.vault.getAbstractFileByPath(dest) !== null;
  if (entry instanceof TFolder && (taken || !holdsOnlyFonts(entry))) {
    const hadFonts = entry.children.some((c) => c instanceof TFile && isFontFile(c));
    for (const child of [...entry.children]) {
      const license = child instanceof TFile && hadFonts && isLicenseFile(child.name);
      const font = child instanceof TFolder || (child instanceof TFile && isFontFile(child));
      if (font || license) await moveFonts(app, child, normalizePath(`${dest}/${child.name}`), result);
    }
    // An empty folder left behind is untidy, not a failed move.
    if (entry.children.length === 0) await app.fileManager.trashFile(entry).catch(() => {});
    return;
  }
  if (taken) {
    result.skipped += fonts;
    return;
  }
  try {
    await ensureVaultFolder(app, parentOf(dest));
    await app.fileManager.renameFile(entry, dest);
    result.moved += fonts;
  } catch (err) {
    console.error(`[Orbis] could not move ${entry.path} to ${dest} —`, err);
    result.failed += fonts;
  }
}

/** Whether a folder holds fonts, their licenses, and nothing else. */
function holdsOnlyFonts(folder: TFolder): boolean {
  return filesUnder(folder).every((f) => isFontFile(f) || isLicenseFile(f.name));
}

// ── Deleting a font ──────────────────────────────────────────────────────────

/**
 * Move a family's files to the trash, and nothing else but the license that came with them.
 *
 * **A folder goes as a whole only when all it holds, at any depth, is this family and licenses**: the folder an import
 * or a download made, or the one around it. From any other folder — one with another family in it, or the reader's
 * own files — only this family's files go. The fonts folder itself always stays. The trash is Obsidian's, so the
 * reader's own trash setting decides where they land.
 */
export async function deleteFontFiles(app: App, root: string, font: VaultFont): Promise<void> {
  const paths = new Set(font.faces.map((f) => f.path));
  const allOurs = (folder: TFolder) => filesUnder(folder).every((f) => paths.has(f.path) || isLicenseFile(f.name));
  const doomed = new Map<string, TFile | TFolder>();
  for (const path of paths) {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) continue;
    let target: TFile | TFolder = file;
    for (let up = file.parent; up?.path.startsWith(`${root}/`) && allOurs(up); up = up.parent) target = up;
    doomed.set(target.path, target);
  }
  for (const target of doomed.values()) await app.fileManager.trashFile(target);
}

/** Why the folder cannot move from `from` to `to`, or null when it can. */
export function moveProblem(from: string, to: string): 'inside' | null {
  if (from === to) return null;
  return to.startsWith(`${from}/`) || from.startsWith(`${to}/`) ? 'inside' : null;
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}
