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
// The files are read once, kept in memory, and added to each chapter's document with the `FontFace` API: nothing
// has to resolve a file address inside the book's frame, which works the same on every platform.
//
// See docs/design/fonts.md.

import { type App, type EventRef, normalizePath, Platform, TFile, TFolder } from 'obsidian';
import { FACE_SLOTS, type FaceSlot, type FontFileInfo, facesCovered, readFontFile } from './font-file';
import { t } from './i18n';
import { ensureVaultFolder } from './reader/record-move';
import { FONT_FAMILY_OPTIONS } from './settings';

/** Where fonts go when the reader has not picked a folder. Beside the configuration folder, `!orbis-data/sync`. */
export const DEFAULT_FONTS_FOLDER = '!orbis-data/fonts';

/** The folder a setting names, with the default for an empty one. */
export function fontsFolderOf(setting: string | undefined): string {
  const trimmed = normalizePath((setting ?? '').trim()).replace(/\/+$/, '');
  return trimmed && trimmed !== '/' ? trimmed : DEFAULT_FONTS_FOLDER;
}

/** The file types a font in the folder may be. See `font-file.ts` for why not WOFF. */
export const FONT_EXTENSIONS = ['ttf', 'otf'] as const;

/** One file of a family in the vault. */
export interface VaultFace extends Pick<FontFileInfo, 'weight' | 'italic' | 'weightRange' | 'fsType' | 'subfamily'> {
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
/** Parsed headers, by path and modification time, so a rescan reads only what changed. */
const headers = new Map<string, { mtime: number; info: FontFileInfo | null }>();
/** File bytes, by path and modification time. Fonts are small; a few families are a few megabytes. */
const bytes = new Map<string, { mtime: number; data: ArrayBuffer }>();
const listeners = new Set<() => void>();
/** The families already added to each document, so a chapter is not given the same fonts twice. */
const added = new WeakMap<Document, Set<string>>();

/** Point the library at a vault. Called once when the plugin loads. */
export function initFonts(next: FontHost): void {
  host = next;
  known = [];
  scanning = null;
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

/** The font files in the folder, as the vault lists them. */
export function fontFilesIn(app: App, folder: string): TFile[] {
  const prefix = `${folder}/`;
  return app.vault
    .getFiles()
    .filter(
      (f) => f.path.startsWith(prefix) && (FONT_EXTENSIONS as readonly string[]).includes(f.extension.toLowerCase())
    );
}

/** Asked for while a look was under way: the vault changed after that look began, so it may be out of date. */
let again = false;

/**
 * Look through the folder again.
 *
 * **A request during a look is answered by one more look**, not by the one under way. The vault can change after a
 * look has listed the folder — moving the folder fires an event per file before the one for the folder, and the
 * setting follows only on the last — so sharing the look in progress would answer with the old folder's contents.
 */
export function scanFonts(): Promise<VaultFont[]> {
  if (scanning) {
    again = true;
    return scanning.then(() => scanFonts());
  }
  const run = async (): Promise<VaultFont[]> => {
    if (!host) return [];
    const { app } = host;
    const families = new Map<string, VaultFont>();
    for (const file of fontFilesIn(app, host.folder())) {
      const info = await headerOf(app, file);
      if (!info) continue;
      const key = info.family.toLowerCase();
      const font = families.get(key) ?? { family: info.family, faces: [] };
      font.faces.push({
        path: file.path,
        weight: info.weight,
        italic: info.italic,
        weightRange: info.weightRange,
        fsType: info.fsType,
        subfamily: info.subfamily,
      });
      families.set(key, font);
    }
    return [...families.values()].sort((a, b) => a.family.localeCompare(b.family));
  };
  scanning = run().then(
    (fonts) => {
      scanning = null;
      if (again) {
        // Out of date before it finished: the queued look will answer, and tell the listeners if it differs.
        again = false;
        return fonts;
      }
      const changed = JSON.stringify(fonts) !== JSON.stringify(known);
      known = fonts;
      if (changed) for (const fn of [...listeners]) fn();
      return fonts;
    },
    (err: unknown) => {
      scanning = null;
      console.error('[Orbis] could not read the fonts folder —', err);
      return known;
    }
  );
  return scanning;
}

async function headerOf(app: App, file: TFile): Promise<FontFileInfo | null> {
  const cached = headers.get(file.path);
  if (cached && cached.mtime === file.stat.mtime) return cached.info;
  const data = await readBytes(app, file);
  const result = readFontFile(new Uint8Array(data));
  const info = result.ok ? result.info : null;
  headers.set(file.path, { mtime: file.stat.mtime, info });
  return info;
}

async function readBytes(app: App, file: TFile): Promise<ArrayBuffer> {
  const cached = bytes.get(file.path);
  if (cached && cached.mtime === file.stat.mtime) return cached.data;
  const data = await app.vault.readBinary(file);
  bytes.set(file.path, { mtime: file.stat.mtime, data });
  return data;
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
  for (let i = 0; i < 60 && !el.isConnected; i++) await new Promise((r) => window.setTimeout(r, 16));
  if (el.isConnected) await useFontIn(el.ownerDocument, value);
}

/**
 * Give a document the faces of the vault font a value names — a chapter of a book, or a settings preview. Does
 * nothing for a system font, for the book's own, or for a family not in the vault.
 *
 * Returns once the faces have loaded, so a caller that lays text out by its size can wait for them.
 */
export async function useFontIn(doc: Document, value: string): Promise<void> {
  if (!host) return;
  const font = vaultFontFor(value) ?? (familyOfValue(value) ? findAfterScan(await scanFonts(), value) : null);
  if (!font) return;
  const done = added.get(doc) ?? new Set<string>();
  const key = font.family.toLowerCase();
  if (done.has(key)) return;
  done.add(key);
  added.set(doc, done);
  // The document's own constructor: a FontFace made in the plugin's window belongs to that window.
  const FontFaceIn = doc.defaultView?.FontFace;
  if (!FontFaceIn || !doc.fonts) return;
  const { app } = host;
  const loads = font.faces.map(async (face) => {
    const file = app.vault.getAbstractFileByPath(face.path);
    if (!(file instanceof TFile)) return;
    const [low, high] = face.weightRange ?? [face.weight, face.weight];
    const fontFace = new FontFaceIn(font.family, await readBytes(app, file), {
      weight: low === high ? String(low) : `${low} ${high}`,
      style: face.italic ? 'italic' : 'normal',
    });
    doc.fonts.add(fontFace);
    await fontFace.load();
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
}

/**
 * Move what the fonts folder holds from `from` to `to`, when the reader changes the setting.
 *
 * **Renamed through Obsidian's file manager**, one entry of the old folder at a time — a family's folder, or a file
 * at the top — so a sync tool sees a move rather than a deletion and a new file. An entry whose name is already
 * taken in the new folder stays where it was, and is counted. The old folder is removed when nothing is left in it.
 *
 * Refuses a move into itself or out of a folder inside the new one; the caller checks `moveProblem` first.
 */
export async function moveFontsFolder(app: App, from: string, to: string): Promise<FolderMove> {
  const result: FolderMove = { moved: 0, skipped: 0 };
  const source = app.vault.getAbstractFileByPath(from);
  if (!(source instanceof TFolder) || moveProblem(from, to)) return result;
  const countFonts = (entry: TFile | TFolder): number =>
    entry instanceof TFile
      ? (FONT_EXTENSIONS as readonly string[]).includes(entry.extension.toLowerCase())
        ? 1
        : 0
      : entry.children.reduce((n, c) => n + (c instanceof TFile || c instanceof TFolder ? countFonts(c) : 0), 0);
  if (!app.vault.getAbstractFileByPath(to)) {
    await ensureVaultFolder(app, parentOf(to));
    const all = countFonts(source);
    await app.fileManager.renameFile(source, to);
    result.moved = all;
    return result;
  }
  for (const entry of [...source.children]) {
    if (!(entry instanceof TFile || entry instanceof TFolder)) continue;
    const dest = normalizePath(`${to}/${entry.name}`);
    if (app.vault.getAbstractFileByPath(dest)) {
      result.skipped += countFonts(entry);
      continue;
    }
    const n = countFonts(entry);
    await app.fileManager.renameFile(entry, dest);
    result.moved += n;
  }
  if (source.children.length === 0) await app.fileManager.trashFile(source);
  return result;
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
