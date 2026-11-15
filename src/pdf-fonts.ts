// The fonts a PDF export can draw with, and getting them onto the device.
//
// **Why this file exists.** pdf-lib's built-in fonts are WinAnsi — about 220 characters — and `drawText` throws on
// anything outside that, so every export sanitized its own text down to what CP1252 could hold. An arrow came out
// as `?`, Greek and Cyrillic came out as a row of them, and a book in either was unreadable. DejaVu carries about
// 3,400 characters in the serif faces and 5,900 in the sans, which covers everything a Western-language EPUB
// throws at a page: arrows, mathematics, currency, Greek, Cyrillic, and the typography a word processor inserts.
//
// **Downloaded rather than bundled.** Seven faces is 3.1 MB. Bundling them would put that in `main.js`, loaded on
// every device for every user, including everyone who never exports a PDF. So they are fetched once and cached
// beside the Piper voices, which is the pattern this plugin already uses for large assets: bundle the code,
// download the data.
//
// See docs/design/marks-pdf.md §Fonts.

import type { DataAdapter } from 'obsidian';
import { requestUrl } from 'obsidian';
import { WrongFileError } from './reader/tts/asset-integrity';

/** The faces the writer draws with. Mirrors `FontName` in `pdf-writer.ts`. */
export type FontSlot = 'body' | 'italic' | 'bodyBold' | 'bodyBoldItalic' | 'bold' | 'sans' | 'mono';

export interface FontAsset {
  slot: FontSlot;
  file: string;
  /**
   * SHA-256 of the file as published.
   *
   * Checked on every download, because these bytes are fetched from a CDN and then embedded in a document the
   * reader sends to someone else. Pinning the version says which file we asked for; the hash is what says we got
   * it. A mismatch fails the download rather than caching it.
   */
  sha256: string;
}

/** Pinned, for the same reason the hashes exist: `latest` is a moving target and this is a supply chain. */
const BASE = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf';

/**
 * Serif for the book, sans for the commentary and headings, mono for code — the same scheme the built-in fonts
 * were arranged in, so nothing about the page design changes when these are installed.
 */
export const FONT_ASSETS: readonly FontAsset[] = [
  { slot: 'body', file: 'DejaVuSerif.ttf', sha256: '42d1edeb7952f31b1f96d767ed7030b08a39e0c372b0071641518864e2bffb51' },
  {
    slot: 'italic',
    file: 'DejaVuSerif-Italic.ttf',
    sha256: '2e39b1d50f90b933b00c7bb54a96afd3f86419b3d717c7cf202e36f2d4973e47',
  },
  {
    slot: 'bodyBold',
    file: 'DejaVuSerif-Bold.ttf',
    sha256: 'c47b5527bcdc8dcf9ea8c77054454c5a884beaca2f44851a2a823ee639cbf07f',
  },
  {
    slot: 'bodyBoldItalic',
    file: 'DejaVuSerif-BoldItalic.ttf',
    sha256: '8d3dd3d31350309042ed226af82b34539bd773518e6107cb352712853ba80308',
  },
  {
    slot: 'bold',
    file: 'DejaVuSans-Bold.ttf',
    sha256: 'e6476c1b80502924294eed40894c5b18e06c181444ca953e5334262df9c27724',
  },
  { slot: 'sans', file: 'DejaVuSans.ttf', sha256: '7da195a74c55bef988d0d48f9508bd5d849425c1770dba5d7bfc6ce9ed848954' },
  {
    slot: 'mono',
    file: 'DejaVuSansMono.ttf',
    sha256: 'b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582',
  },
];

/** What the reader is being asked to download, for the dialog to say out loud. */
export const FONT_DOWNLOAD_MB = 3.1;

export type FontBytes = Record<FontSlot, Uint8Array>;

const pathOf = (dir: string, file: string): string => `${dir}/${file}`;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Are all seven faces already on this device? Anything missing means the set is incomplete and has to be fetched
 *  again — a partial set would embed some faces and fall back for others, mid-document. */
export async function fontsInstalled(adapter: DataAdapter, dir: string): Promise<boolean> {
  for (const asset of FONT_ASSETS) {
    if (!(await adapter.exists(pathOf(dir, asset.file)))) return false;
  }
  return true;
}

/**
 * Fetch the faces that are missing and cache them.
 *
 * Throws on a hash mismatch, and leaves nothing behind when it does: a font that is not what we asked for is not
 * something to write to disk and use tomorrow.
 */
export async function downloadFonts(
  adapter: DataAdapter,
  dir: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
  let done = 0;
  for (const asset of FONT_ASSETS) {
    const path = pathOf(dir, asset.file);
    if (!(await adapter.exists(path))) {
      const res = await requestUrl({ url: `${BASE}/${asset.file}` });
      const bytes = new Uint8Array(res.arrayBuffer);
      const hash = await sha256Hex(bytes);
      if (hash !== asset.sha256) throw new WrongFileError(asset.file);
      await adapter.writeBinary(path, res.arrayBuffer);
    }
    onProgress?.(++done, FONT_ASSETS.length);
  }
}

/** The cached faces, or `undefined` when they are not all there — which is the signal to draw with the built-in
 *  fonts instead. Never throws: a missing font is a plainer PDF, not a failed export. */
export async function loadFonts(adapter: DataAdapter, dir: string): Promise<FontBytes | undefined> {
  try {
    const entries = await Promise.all(
      FONT_ASSETS.map(
        async (asset) => [asset.slot, new Uint8Array(await adapter.readBinary(pathOf(dir, asset.file)))] as const
      )
    );
    return Object.fromEntries(entries) as FontBytes;
  } catch {
    return undefined;
  }
}

/** Delete the cache, for a reader who wants the 3.1 MB back. */
export async function removeFonts(adapter: DataAdapter, dir: string): Promise<void> {
  for (const asset of FONT_ASSETS) {
    const path = pathOf(dir, asset.file);
    if (await adapter.exists(path)) await adapter.remove(path);
  }
}
