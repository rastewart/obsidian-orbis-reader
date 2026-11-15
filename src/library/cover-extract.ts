// Pulling a book's cover out of its file and into the vault. See docs/design/library.md.
//
// **A cover is a real image file in the vault, and `cover:` points at it.** A per-device cache would render a grid
// perfectly well and be invisible everywhere else — Properties, Bases cards, hover previews, and any device that
// has not built its cache. Since the argument for notes-as-records is that the catalog should work in Obsidian's
// own surfaces, a cover only Orbis can see would undercut it.
//
// The cost is real and worth stating: an extracted cover is tens of kilobytes and the vault syncs. Downscaling on
// the way in is what keeps a large catalog in tens of megabytes rather than hundreds.

import { unzipSync, unzlibSync } from 'fflate';
import { MOBI } from 'foliate-js/mobi.js';
import { type App, normalizePath, TFile } from 'obsidian';
import { renderCoverJpeg } from './cover-render';
import {
  cbzCoverEntry,
  coverExtension,
  coverHrefFromOpf,
  extensionForMime,
  fb2CoverBinary,
  sniffImageExtension,
  zipEntryForHref,
} from './cover-source';
import { opfPathFromContainer } from './opf';

/** Longest edge of a stored cover. Big enough for a full-screen player, small enough to sync a thousand of them. */
const MAX_EDGE = 600;

/** JPEG quality for a downscaled cover. Artwork, not a document scan — 0.82 is where the artifacts stop showing. */
const JPEG_QUALITY = 0.82;

/**
 * The cover image inside a book, as bytes, or null when it has none we can find.
 *
 * Four shapes, because the formats have nothing in common. **EPUB and CBZ are zips**, so only the entries needed
 * are inflated, never the archive — `unzipSync`'s filter is what makes this cheap enough to run over a folder of
 * books. **MOBI and AZW3 are Palm databases**, read through the parser the reader already ships. **FB2 is one XML
 * document** with its images inlined as base64. A PDF has no cover to find without rendering a page, and gets a
 * generated tile — which is not a failure.
 */
async function coverBytesFrom(app: App, file: TFile): Promise<{ bytes: Uint8Array; entry: string } | null> {
  const ext = file.extension.toLowerCase();
  try {
    if (ext === 'epub' || ext === 'cbz') {
      const zip = new Uint8Array(await app.vault.readBinary(file));
      const entry = ext === 'epub' ? epubCoverEntry(zip) : cbzCoverEntry(entryNames(zip));
      if (!entry) return null;
      const found = unzipSync(zip, { filter: (f) => f.name === entry });
      const bytes = found[entry];
      return bytes?.length ? { bytes, entry } : null;
    }
    if (ext === 'mobi' || ext === 'azw3') return await mobiCover(app, file);
    if (ext === 'fb2') return await fb2Cover(app, file);
    return null;
  } catch {
    // A book that cannot be read still deserves a record; the cover is the part that is decoration.
    return null;
  }
}

/**
 * A Kindle book's cover, through the parser the reader already uses.
 *
 * MOBI and AZW3 are Palm databases rather than archives — a record table and an EXTH metadata block, with the
 * cover reachable only by offset — so there is no entry to inflate and nothing a zip library can do. Reusing
 * `foliate-js/mobi.js` costs nothing in bundle size (the reader ships it either way) and is a parser that has met
 * far more real files than one written here would have.
 *
 * It is heavier than the other formats all the same: `open()` initializes the whole book, not just its headers,
 * because the cover accessor is bound during that setup. Acceptable for a book at a time; worth knowing before
 * anyone points it at a folder of thousands.
 */
async function mobiCover(app: App, file: TFile): Promise<{ bytes: Uint8Array; entry: string } | null> {
  const blob = new Blob([await app.vault.readBinary(file)]);
  const book = await new MOBI({ unzlib: unzlibSync }).open(blob);
  const cover = await book.getCover?.();
  if (!cover) return null;
  // The format stores the image and nothing about it, so the blob usually has no type: the bytes are the only
  // honest answer, and the declared type is the fallback rather than the other way round.
  const bytes = new Uint8Array(await cover.arrayBuffer());
  const ext = sniffImageExtension(bytes) ?? extensionForMime(cover.type);
  return { bytes, entry: `cover.${ext}` };
}

/**
 * An FB2's cover, decoded from the base64 the document carries inline.
 *
 * Decoded as UTF-8 whatever the file declares — a Russian FB2 is often windows-1251, and reading it as UTF-8
 * mangles its prose. That does not matter here: the tags and the base64 payload are ASCII either way, and the
 * prose is not what is being read.
 */
async function fb2Cover(app: App, file: TFile): Promise<{ bytes: Uint8Array; entry: string } | null> {
  const xml = new TextDecoder().decode(new Uint8Array(await app.vault.readBinary(file)));
  const found = fb2CoverBinary(xml);
  if (!found) return null;
  const binary = atob(found.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, entry: `cover.${extensionForMime(found.mime)}` };
}

/** Which entry holds an EPUB's cover: container.xml → OPF → the manifest. Two small entries answer it. */
function epubCoverEntry(zip: Uint8Array): string | null {
  const container = textEntry(zip, 'META-INF/container.xml');
  const opfPath = container ? opfPathFromContainer(container) : null;
  if (!opfPath) return null;
  const opf = textEntry(zip, opfPath);
  const href = opf ? coverHrefFromOpf(opf) : null;
  return href ? zipEntryForHref(opfPath, href) : null;
}

function textEntry(zip: Uint8Array, name: string): string | null {
  const found = unzipSync(zip, { filter: (f) => f.name === name });
  const bytes = found[name];
  return bytes ? new TextDecoder().decode(bytes) : null;
}

/** Every entry name, without inflating any of them — the filter rejects all, and reports what it saw. */
function entryNames(zip: Uint8Array): string[] {
  const names: string[] = [];
  unzipSync(zip, {
    filter: (f) => {
      names.push(f.name);
      return false;
    },
  });
  return names;
}

/**
 * A cover image, downscaled to something a vault can carry.
 *
 * Returns JPEG bytes, or the original when the browser cannot decode it — an image that survives as-is is better
 * than no cover, and a format we failed to decode is one an `<img>` may still render.
 *
 * Drawn through an `ImageBitmap` rather than an `Image` element: it decodes off the main thread and does not need
 * the element to be in a document, which matters when this runs a few hundred times in a row.
 */
async function downscaleCover(bytes: Uint8Array, entry: string): Promise<{ data: ArrayBuffer; ext: string }> {
  const original = { data: toArrayBuffer(bytes), ext: coverExtension(entry) };
  try {
    const bitmap = await createImageBitmap(new Blob([toArrayBuffer(bytes)]));
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small enough: re-encoding it would cost quality to save nothing.
    if (scale === 1) {
      bitmap.close();
      return original;
    }
    const canvas = createEl('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return original;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return original;
    return { data: await blob.arrayBuffer(), ext: 'jpg' };
  } catch {
    return original;
  }
}

/**
 * Extract, downscale and write one book's cover, returning its vault path.
 *
 * **A cover already written is left alone.** Cataloging the same folder twice, or attaching a second edition to a
 * record, must not re-read a zip and rewrite a file that is already correct — and on a synced vault, rewriting is
 * not free even when the bytes match.
 */
export async function extractCoverTo(
  app: App,
  file: TFile,
  folder: string,
  fallback?: { title: string; author: string },
  opts?: {
    overwrite?: boolean;
    drawOnly?: boolean;
    /**
     * Artwork from somewhere other than the file, tried only when the file has none — a downloaded book's cover as its
     * catalog published it. Before a drawn tile, because a real cover beats a title on a color.
     */
    elsewhere?: () => Promise<{ bytes: Uint8Array; entry: string } | null>;
  }
): Promise<string | null> {
  const dir = folder.replace(/^\/+|\/+$/g, '');
  const stem = coverStem(file);
  const existing = app.vault.getFiles().filter((f) => f.parent?.path === (dir || '/') && f.basename === stem);
  if (existing.length > 0 && !opts?.overwrite) return existing[0].path;

  // `drawOnly` is someone saying the book's own artwork is not worth having — a converter's generic device icon,
  // a scan of a blank page. Asked for explicitly, never inferred: there is no way to tell a bad cover from a
  // minimalist one by looking at the bytes.
  const found = opts?.drawOnly ? null : ((await coverBytesFrom(app, file)) ?? (await opts?.elsewhere?.()) ?? null);
  // Nothing inside the book, so draw one — a title and a color beat an empty frame, and an image in the vault is
  // visible in Properties and in a Bases card where a tile rendered inside Orbis is not. `null` only when there was
  // no artwork AND nothing to draw with, which is a book with no title at all.
  const made = found ? null : fallback ? await renderCoverJpeg(fallback.title, fallback.author) : null;
  if (!found && !made) return null;
  const { data, ext } = found
    ? await downscaleCover(found.bytes, found.entry)
    : { data: made as ArrayBuffer, ext: 'jpg' };
  const path = normalizePath(dir ? `${dir}/${stem}.${ext}` : `${stem}.${ext}`);
  if (dir && !(await app.vault.adapter.exists(normalizePath(dir)))) await app.vault.createFolder(normalizePath(dir));
  // Anything already written for this book goes, including a file with a different extension: a refresh that left
  // `sample.png` beside a new `sample.jpg` would leave the record pointing at whichever Obsidian resolved first.
  for (const stale of existing) await app.fileManager.trashFile(stale);
  const at = app.vault.getAbstractFileByPath(path);
  if (at instanceof TFile) await app.vault.modifyBinary(at, data);
  else await app.vault.createBinary(path, data);
  return path;
}

/**
 * What a cover file is called: the book's own filename.
 *
 * Named after the FILE rather than the title, because two books can share a title and no two files in a folder can
 * share a name — and because it makes the pairing legible in the covers folder without opening anything.
 */
function coverStem(file: TFile): string {
  return file.basename.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim() || 'cover';
}

/** `Blob` and `createBinary` both want an ArrayBuffer, and a Uint8Array view may be a window onto a larger one. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
