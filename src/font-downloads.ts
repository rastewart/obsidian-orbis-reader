// The fonts Orbis offers to download: which they are, what each is for, and getting one into the vault.
//
// **One zip per font, from this repository's `fonts` release** — built by `scripts/build-fonts.ts`, which packs each
// project's own static files with its license. The zip's size and SHA-256 are pinned in `font-pins.ts`, so a download
// is refused unless it is exactly the file this build was made with, and nothing is written when it is not.
//
// **Unpacked into the fonts folder**, a folder per font, so a download is a font in the vault like any other: it
// reaches the reader's other devices through sync, shows on the Fonts page, and can be deleted there.
//
// See docs/design/fonts.md § Downloads.

import { unzipSync } from 'fflate';
import { type App, normalizePath, requestUrl, TFile } from 'obsidian';
import { FACE_SLOTS, type FaceSlot, facesCovered } from './font-file';
import { FONT_PINS, type FontPackageId } from './font-pins';
import type { VaultFont } from './fonts';
import { scanFonts } from './fonts';
import type { TranslationKey } from './i18n/en';
import { ensureVaultFolder } from './reader/record-move';
import { sha256Hex, WrongFileError } from './reader/tts/asset-integrity';

/** Where the zips are. Every zip the release has held stays there, so an older build still finds its own. */
export const FONT_RELEASE = 'https://github.com/rastewart/obsidian-orbis-reader/releases/download/fonts';

/** A font offered for download. */
export interface FontPackage {
  id: FontPackageId;
  /** The name a reader knows it by. */
  name: string;
  /** The families its files hold, and the faces of each. It is downloaded when every one of them is in the vault. */
  families: Readonly<Record<string, readonly FaceSlot[]>>;
  /** What it is for, in a line: under Downloadable fonts, and on its families' rows once it is in the vault. */
  purpose: TranslationKey;
  /** Used by the PDF export to draw characters the chosen font lacks — its purpose says so. */
  pdf?: true;
  /** Files it is downloaded only with, by name, for a use that finds them so: the PDF export. */
  files?: readonly string[];
}

/** DejaVu's files, which the PDF export finds by these names (`pdf-fonts.ts`). */
export const DEJAVU_FILES = {
  body: 'DejaVuSerif.ttf',
  italic: 'DejaVuSerif-Italic.ttf',
  bodyBold: 'DejaVuSerif-Bold.ttf',
  bodyBoldItalic: 'DejaVuSerif-BoldItalic.ttf',
  bold: 'DejaVuSans-Bold.ttf',
  sans: 'DejaVuSans.ttf',
  mono: 'DejaVuSansMono.ttf',
} as const;

/**
 * The fonts offered, in the order the Fonts page lists them: those made for how a reader reads first, then the book
 * faces, then DejaVu, which is there for the PDF export.
 */
export const FONT_PACKAGES: readonly FontPackage[] = [
  {
    id: 'opendyslexic',
    name: 'OpenDyslexic',
    families: { OpenDyslexic: FACE_SLOTS },
    purpose: 'fonts.purpose_opendyslexic',
  },
  {
    id: 'atkinson-hyperlegible',
    name: 'Atkinson Hyperlegible',
    families: { 'Atkinson Hyperlegible': FACE_SLOTS },
    purpose: 'fonts.purpose_atkinson',
  },
  { id: 'lexend', name: 'Lexend', families: { Lexend: ['regular', 'bold'] }, purpose: 'fonts.purpose_lexend' },
  { id: 'literata', name: 'Literata', families: { Literata: FACE_SLOTS }, purpose: 'fonts.purpose_literata' },
  {
    id: 'source-serif-4',
    name: 'Source Serif 4',
    families: { 'Source Serif 4': FACE_SLOTS },
    purpose: 'fonts.purpose_source_serif',
  },
  {
    id: 'eb-garamond',
    name: 'EB Garamond',
    families: { 'EB Garamond': FACE_SLOTS },
    purpose: 'fonts.purpose_eb_garamond',
  },
  {
    id: 'dejavu',
    name: 'DejaVu',
    families: { 'DejaVu Serif': FACE_SLOTS, 'DejaVu Sans': ['regular', 'bold'], 'DejaVu Sans Mono': ['regular'] },
    purpose: 'fonts.purpose_dejavu',
    pdf: true,
    files: Object.values(DEJAVU_FILES),
  },
];

/**
 * Whether the vault has everything a package holds: every family, and every face of it, whatever files they are in.
 *
 * **Every face, so a font that has lost one is offered again.** A file deleted by hand, or damaged by a sync, is not
 * among the vault's fonts, and downloading again is how the reader gets it back.
 */
export function packageInstalled(pkg: FontPackage, fonts: readonly VaultFont[]): boolean {
  const byFamily = new Map(fonts.map((f) => [f.family.toLowerCase(), f]));
  const whole = Object.entries(pkg.families).every(([family, slots]) => {
    const covered = facesCovered(byFamily.get(family.toLowerCase())?.faces ?? []);
    return slots.every((slot) => covered.has(slot));
  });
  if (!whole || !pkg.files) return whole;
  const names = new Set(fonts.flatMap((f) => f.faces.map((face) => face.path.slice(face.path.lastIndexOf('/') + 1))));
  return pkg.files.every((name) => names.has(name));
}

/** The package a family belongs to, if it is one of the downloads. */
export function packageOf(family: string): FontPackage | undefined {
  const key = family.toLowerCase();
  return FONT_PACKAGES.find((p) => Object.keys(p.families).some((f) => f.toLowerCase() === key));
}

/** A download's size in megabytes, to one decimal place. */
export function packageMegabytes(id: FontPackageId): string {
  return (FONT_PINS[id].bytes / 1_000_000).toFixed(1);
}

/**
 * Download a package and unpack it into `folder`.
 *
 * Throws `WrongFileError` when the bytes are not the pinned ones, and writes nothing then: a font that is not what
 * was asked for is not something to put in a vault that syncs it everywhere.
 */
export async function downloadFontPackage(app: App, id: FontPackageId, folder: string): Promise<void> {
  const pin = FONT_PINS[id];
  const res = await requestUrl({ url: `${FONT_RELEASE}/${pin.zip}` });
  const data = res.arrayBuffer;
  if (data.byteLength !== pin.bytes || (await sha256Hex(data)) !== pin.sha256) throw new WrongFileError(pin.zip);
  await installFontZip(app, new Uint8Array(data), folder);
  await scanFonts();
}

/**
 * Write every file of a zip into `folder`, keeping the zip's folders: `Literata/Literata-Regular.ttf` lands in
 * `<folder>/Literata/`. A file already there is replaced, so downloading again repairs a damaged copy.
 */
export async function installFontZip(app: App, zip: Uint8Array, folder: string): Promise<string[]> {
  const written: string[] = [];
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    if (name.endsWith('/')) continue;
    const path = normalizePath(`${folder}/${name}`);
    await ensureVaultFolder(app, path.slice(0, path.lastIndexOf('/')));
    const data = bytes.slice().buffer;
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await app.vault.modifyBinary(existing, data);
    else await app.vault.createBinary(path, data);
    written.push(path);
  }
  return written;
}
