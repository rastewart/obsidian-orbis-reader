// The fonts a PDF export can draw with, and where they come from.
//
// **Why this file exists.** pdf-lib's built-in fonts are WinAnsi — about 220 characters — and `drawText` throws on
// anything outside that, so every export sanitized its own text down to what CP1252 could hold. An arrow came out
// as `?`, Greek and Cyrillic came out as a row of them, and a book in either was unreadable. DejaVu carries about
// 3,400 characters in the serif faces and 5,900 in the sans, which covers everything a Western-language EPUB
// throws at a page: arrows, mathematics, currency, Greek, Cyrillic, and the typography a word processor inserts.
//
// **Downloaded rather than bundled**, into the vault's fonts folder like every other font Orbis offers — see
// `font-downloads.ts`. So it is downloaded once for every device, shows on the Fonts page, and can be read in.
//
// **The old copy.** Before the Fonts page, each device downloaded DejaVu into the plugin's own `font-cache` folder.
// That copy is still used until DejaVu is in the vault, and then deleted. It is not moved into the vault: two
// devices moving the same files into a synced folder at once is how sync conflicts begin, while deleting a device's
// own cache touches nothing another device reads.
//
// See docs/design/marks-pdf.md §Fonts and docs/design/fonts.md § Downloads.

import type { App, DataAdapter, TFile } from 'obsidian';
import { downloadFontPackage, packageMegabytes } from './font-downloads';
import { fontFilesIn, fontsFolderOf } from './fonts';

/** The faces the writer draws with. Mirrors `FontName` in `pdf-writer.ts`. */
export type FontSlot = 'body' | 'italic' | 'bodyBold' | 'bodyBoldItalic' | 'bold' | 'sans' | 'mono';

/**
 * Serif for the book, sans for the commentary and headings, mono for code — the same scheme the built-in fonts
 * were arranged in, so nothing about the page design changes when these are installed. Found by these file names,
 * which the `dejavu` zip of the `fonts` release keeps, wherever in the fonts folder they are.
 */
export const FONT_ASSETS: readonly { slot: FontSlot; file: string }[] = [
  { slot: 'body', file: 'DejaVuSerif.ttf' },
  { slot: 'italic', file: 'DejaVuSerif-Italic.ttf' },
  { slot: 'bodyBold', file: 'DejaVuSerif-Bold.ttf' },
  { slot: 'bodyBoldItalic', file: 'DejaVuSerif-BoldItalic.ttf' },
  { slot: 'bold', file: 'DejaVuSans-Bold.ttf' },
  { slot: 'sans', file: 'DejaVuSans.ttf' },
  { slot: 'mono', file: 'DejaVuSansMono.ttf' },
];

/** What the reader is being asked to download, for the dialog to say out loud. */
export const FONT_DOWNLOAD_MB = packageMegabytes('dejavu');

export type FontBytes = Record<FontSlot, Uint8Array>;

/** Where versions before the Fonts page kept DejaVu, on each device. */
export function legacyFontDir(app: App): string {
  return `${app.vault.configDir}/plugins/orbis-reader/font-cache`;
}

/** The seven files in the vault's fonts folder, by slot, or null when any is missing. */
function inVault(app: App, folderSetting: string): Record<FontSlot, TFile> | null {
  const byName = new Map(fontFilesIn(app, fontsFolderOf(folderSetting)).map((f) => [f.name, f]));
  const found = FONT_ASSETS.map((a) => [a.slot, byName.get(a.file)] as const);
  if (found.some(([, file]) => !file)) return null;
  return Object.fromEntries(found) as Record<FontSlot, TFile>;
}

/** Whether all seven faces are in the old cache. */
async function inLegacyCache(adapter: DataAdapter, dir: string): Promise<boolean> {
  for (const asset of FONT_ASSETS) if (!(await adapter.exists(`${dir}/${asset.file}`))) return false;
  return true;
}

/**
 * Whether a PDF can be drawn with DejaVu on this device: in the vault, or still in the old cache. Anything missing
 * means the set is incomplete — a partial set would embed some faces and fall back for others, mid-document.
 */
export async function pdfFontsReady(app: App, folderSetting: string): Promise<boolean> {
  return inVault(app, folderSetting) !== null || (await inLegacyCache(app.vault.adapter, legacyFontDir(app)));
}

/**
 * DejaVu's faces, from the vault or else from the old cache, or `undefined` when neither has all seven — the signal
 * to draw with the built-in fonts instead. Never throws: a missing font is a plainer PDF, not a failed export.
 */
export async function loadPdfFonts(app: App, folderSetting: string): Promise<FontBytes | undefined> {
  try {
    const files = inVault(app, folderSetting);
    if (files) {
      const entries = await Promise.all(
        FONT_ASSETS.map(async (a) => [a.slot, new Uint8Array(await app.vault.readBinary(files[a.slot]))] as const)
      );
      return Object.fromEntries(entries) as FontBytes;
    }
    const dir = legacyFontDir(app);
    const entries = await Promise.all(
      FONT_ASSETS.map(
        async (a) => [a.slot, new Uint8Array(await app.vault.adapter.readBinary(`${dir}/${a.file}`))] as const
      )
    );
    return Object.fromEntries(entries) as FontBytes;
  } catch {
    return undefined;
  }
}

/** Download DejaVu into the fonts folder, then let the old cache go. Throws as `downloadFontPackage` does. */
export async function downloadPdfFonts(app: App, folderSetting: string): Promise<void> {
  await downloadFontPackage(app, 'dejavu', fontsFolderOf(folderSetting));
  await forgetLegacyPdfFonts(app, folderSetting);
}

/**
 * Delete the old cache once DejaVu is in the vault — downloaded here, or arrived from another device. Only this
 * device's plugin folder is touched. Never throws: a cache left behind costs space, not a PDF.
 */
export async function forgetLegacyPdfFonts(app: App, folderSetting: string): Promise<void> {
  const dir = legacyFontDir(app);
  try {
    if (!inVault(app, folderSetting) || !(await app.vault.adapter.exists(dir))) return;
    await app.vault.adapter.rmdir(dir, true);
  } catch (err) {
    console.error('[Orbis] could not remove the old PDF font cache —', err);
  }
}
