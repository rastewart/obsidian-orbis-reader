// The copies foliate makes of a book's files run nothing, whoever opens them. See docs/design/security.md, "Copies of
// a book's files".
//
// **Why a copy matters.** foliate gives each file a chapter uses — a picture, a stylesheet, a font, another chapter —
// a `blob:` address, made in Obsidian's window and so of Obsidian's own origin. A chapter is meant to reach those
// files only as what they are: a picture drawn, a font used. But a frame sent to one of those addresses shows it as a
// page of its own, and the guard never sees it: a chapter is hardened on its way into the frame (`foliate-patches.ts`),
// not when foliate makes the copy. On iPhone and iPad a book did exactly that, with a link the reader's link handler
// could not see, and a script in the copy ran in Obsidian's window with the vault in reach (frame-navigation.epub).
//
// **So a copy keeps its type only when nothing of that type can run.** Pictures, sound, video, fonts and stylesheets
// keep theirs. An SVG file keeps its type, since a picture needs it, and loses its scripts (`hardenSvgText`).
// Everything else is served as plain text: HTML and XHTML, and any XML type, since an XML document runs an XHTML
// `<script>` inside it and can name an XSLT sheet that writes a page. Nothing reads those as pages: the reader
// takes a chapter's text from its copy and hardens that (`loadViaSrcdoc`), and a frame inside a chapter is removed.
//
// foliate offers one place to do it for every copy: the `data` event each EPUB and KF8 file passes through on its way
// to a `blob:` address (`createURL` in epub.js, `loadResourceBlob` in mobi.js). MOBI and FB2 make copies too, of their
// pictures and of the chapters themselves, but nothing in a book can name those addresses, so no link reaches them.

import { hardenSvgText } from './book-html-guard';

/** How a copy that could be read as a page is served instead. The charset keeps the chapter text the reader reads. */
export const PLAIN_TEXT_COPY = 'text/plain;charset=utf-8';

/** Font types books declare, beside `font/*`. A font is drawn from, never shown as a page. */
const FONT_TYPES = new Set([
  'application/font-sfnt',
  'application/font-woff',
  'application/font-woff2',
  'application/vnd.ms-opentype',
  'application/x-font-opentype',
  'application/x-font-otf',
  'application/x-font-truetype',
  'application/x-font-ttf',
  'application/octet-stream', // what many books declare their fonts as; a frame sent to it downloads, never runs
]);

const SVG = 'image/svg+xml';

/** The type a copy is served as. An SVG file keeps its type, and is hardened separately. */
export function copyType(declared: string | undefined): string {
  const type = (declared ?? '').split(';')[0].trim().toLowerCase();
  if (type === SVG || type === 'text/css' || FONT_TYPES.has(type)) return declared ?? type;
  if (/^(image|audio|video|font)\//.test(type)) return declared ?? type;
  return PLAIN_TEXT_COPY;
}

/** A file's contents as text: foliate hands over a string, a `Blob` or raw bytes, depending on the format. */
async function asText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return '';
}

interface CopyDetail {
  data: unknown;
  type: string | undefined;
}

/**
 * Harden every copy `book` makes from now on. Before its first chapter loads, so no copy is made without it.
 *
 * Returns false for a format with no `data` event (MOBI, FB2, CBZ) — see the head of this file for why that is safe.
 */
export function hardenBookCopies(book: unknown): boolean {
  const target = (book as { transformTarget?: EventTarget } | null)?.transformTarget;
  if (!target) return false;
  target.addEventListener('data', (event) => {
    const detail = (event as CustomEvent<CopyDetail>).detail;
    const served = copyType(detail.type);
    if (served.split(';')[0].trim().toLowerCase() === SVG) {
      detail.data = Promise.resolve(detail.data).then(asText).then(hardenSvgText);
    } else detail.type = served;
  });
  return true;
}
