// A file inside a MOBI or AZW3 book — a picture, or a stylesheet — for the exports.
//
// An EPUB is a zip, and foliate's book object reads any file in it by path (`loadBlob`). A Kindle book has no paths:
// its files are records, and the two formats name them differently.
//
// - **AZW3 (KF8)** writes `kindle:embed:0001?mime=image/jpeg` for a picture and `kindle:flow:0004?mime=text/css` for
//   a stylesheet. foliate's `loadResourceBlob` reads either.
// - **MOBI** writes `<img recindex="00001">` with no `src` at all; foliate fills `src` in only when it lays a page
//   out (`replaceResources`). The exports open each section themselves (`createDocument`), so they see the bare
//   `recindex`, which `mobiPictureHref` turns into `recindex:00001` for `kindleResource` to read.
//
// Without this, Save as Markdown and Save as PDF asked an EPUB loader the book did not have, and every picture in a
// Kindle book was dropped — a cover page that holds nothing but its picture went with it.

/** What this asks of foliate's KF8 or MOBI book object. */
export interface KindleBook {
  /** MOBI's record reader answers a record as an `ArrayBuffer`. */
  mobi?: {
    decode(raw: ArrayBuffer | Uint8Array): string;
    loadResource(index: number): Promise<ArrayBuffer | Uint8Array>;
  };
  loadFlow?(index: number): Promise<ArrayBuffer | Uint8Array> | undefined;
  loadResourceBlob?(href: string): Promise<[Blob, unknown]>;
}

/** The href an old MOBI picture is exported by, read off its `recindex`; null for anything else. */
export function mobiPictureHref(el: Element): string | null {
  const recindex = el.getAttribute('recindex');
  return recindex ? `recindex:${recindex}` : null;
}

/**
 * The type a picture's first bytes say it is. A MOBI record carries no type, and an export names the file and decides
 * whether a PDF can embed it by its type.
 */
function pictureType(bytes: Uint8Array): string {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x42, 0x4d)) return 'image/bmp';
  return '';
}

/**
 * The file `href` names in a Kindle book, or null when it names none this can read.
 *
 * **A picture wrapped in SVG is read as the picture.** Calibre writes an AZW3's cover page as
 * `<img src="kindle:flow:…?mime=image/svg+xml">`, an SVG whose `<image>` points at the real picture by a `kindle:embed`
 * link. That SVG means nothing outside the book — in a vault note or a PDF its picture is a dead reference — so the
 * picture inside it is what an export keeps.
 */
export async function kindleResource(book: KindleBook | null | undefined, href: string): Promise<Blob | null> {
  if (!book) return null;
  const recindex = /^recindex:(\d+)$/.exec(href);
  if (recindex) {
    if (!book.mobi) return null;
    const bytes = new Uint8Array(await book.mobi.loadResource(Number(recindex[1]) - 1));
    return new Blob([bytes], { type: pictureType(bytes) });
  }
  const resource = /^kindle:(flow|embed):(\w+)(?:\?mime=([\w/+.-]+))?/.exec(href);
  if (!resource) return null;
  const [, kind, id, type = ''] = resource;
  if (kind === 'flow' && type === 'image/svg+xml' && book.loadFlow && book.mobi) {
    const raw = await book.loadFlow(Number.parseInt(id, 32));
    const inner = raw ? /kindle:embed:\w+(?:\?mime=[\w/+.-]+)?/.exec(book.mobi.decode(raw))?.[0] : undefined;
    if (inner) return kindleResource(book, inner);
  }
  if (!book.loadResourceBlob) return null;
  const [blob] = await book.loadResourceBlob(href);
  return blob;
}
