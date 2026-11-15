// Finding the cover image inside a book file. See docs/design/library.md.
//
// Pure: strings and entry names in, an entry name out. Which entry of a zip holds the artwork is exactly the kind
// of question with a dozen real-world answers and no way to check them except against real files — so it is
// answered here, where a test can hold one of each, rather than inside the unzip.

/**
 * The manifest href of an EPUB's cover image, or null.
 *
 * Three ways of saying it, in order of how much they mean:
 *
 * 1. **`<meta name="cover" content="id">`** — EPUB 2's convention, and still the most common thing in the wild.
 *    It names a manifest id, which is what actually holds the href.
 * 2. **`properties="cover-image"`** — EPUB 3's way, and the only one that is spelled out in a standard.
 * 3. **An image whose id or href says "cover"** — a guess, and last, because it is one. Plenty of books use
 *    neither declaration and still ship `cover.jpeg`; refusing to look would mean a generated tile for a book
 *    with perfectly good artwork.
 */
export function coverHrefFromOpf(opfXml: string): string | null {
  const doc = parseXml(opfXml);
  if (!doc) return null;
  const items = [...doc.getElementsByTagName('item')];
  const hrefOf = (item: Element | undefined) => item?.getAttribute('href')?.trim() || null;

  const metaId = [...doc.getElementsByTagName('meta')]
    .find((meta) => meta.getAttribute('name')?.toLowerCase() === 'cover')
    ?.getAttribute('content')
    ?.trim();
  if (metaId) {
    const byId = hrefOf(items.find((item) => item.getAttribute('id') === metaId));
    if (byId) return byId;
  }

  const declared = items.find((item) => (item.getAttribute('properties') ?? '').split(/\s+/).includes('cover-image'));
  if (declared) {
    const href = hrefOf(declared);
    if (href) return href;
  }

  const guessed = items.find((item) => {
    const type = item.getAttribute('media-type') ?? '';
    if (!type.startsWith('image/')) return false;
    return /cover/i.test(item.getAttribute('id') ?? '') || /cover/i.test(item.getAttribute('href') ?? '');
  });
  return hrefOf(guessed);
}

/**
 * An OPF-relative href as a zip entry name.
 *
 * Hrefs are relative to the OPF, which is usually a folder deep, and they are URL-encoded — `Images/cover%20a.jpg`
 * is an entry called `Images/cover a.jpg`. `..` is resolved rather than left in place: a zip has no notion of one,
 * so an unresolved segment simply fails to match anything.
 */
export function zipEntryForHref(opfPath: string, href: string): string {
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const decoded = safeDecode(href.split('#')[0].split('?')[0]);
  const parts = decoded.startsWith('/')
    ? decoded.slice(1).split('/')
    : [...(base ? base.split('/') : []), ...decoded.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * The cover of a comic archive: its first image in reading order.
 *
 * A CBZ is a folder of pages with no manifest of any kind, so "the cover" means "page one" — and page one is
 * whichever name sorts first the way a person would sort it, which is not the way a computer does: `page10.jpg`
 * belongs after `page2.jpg`. The same natural ordering the reader pages through.
 */
export function cbzCoverEntry(names: string[]): string | null {
  const images = names.filter((name) => !name.includes('__MACOSX') && /\.(jpe?g|png|webp|gif)$/i.test(name));
  if (images.length === 0) return null;
  return images.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))[0];
}

/**
 * An FB2's cover: the base64 payload of the `<binary>` its `<coverpage>` names.
 *
 * FB2 is one XML document with its images inlined as base64 at the end, so there is no entry to inflate and
 * nothing to seek to — the cover is a string inside the file.
 *
 * **Matched with expressions rather than parsed.** A whole-document parse would materialise every embedded image
 * as a DOM node to reach one of them, and these files run to tens of megabytes. The href carries a namespace
 * prefix that varies by producer (`l:href`, `xlink:href`, bare `href`), which a parser would handle and a
 * pattern has to be written for — hence the loose prefix here.
 *
 * **Every pattern is bounded, and none spans the file.** The `<coverpage>` element is cut out first and searched on
 * its own, and a tag is read to at most `MAX_TAG` characters. A pattern that ran from `<coverpage>` across the whole
 * file backtracked once for every `<image` after it: a crafted file of 16 KB took over twenty seconds, and a catalog
 * download runs this before the book is ever opened.
 */
export function fb2CoverBinary(xml: string): { base64: string; mime: string } | null {
  const id = coverpageImageId(xml);
  const byId = id ? findBinary(xml, (tagId) => tagId === id) : null;
  if (byId) return byId;
  // No coverpage, or it names something that is not there: an image that calls itself a cover is the next best
  // answer, and plenty of converters write exactly that.
  return findBinary(xml, (tagId) => /cover/i.test(tagId));
}

/** The longest tag read for its attributes. A real `<binary>` or `<image>` tag is well under it. */
const MAX_TAG = 2000;
/** The longest `<coverpage>` element searched. One holds an `<image>` or two. */
const MAX_COVERPAGE = 16_384;

/** The id the `<coverpage>`'s first `<image>` names, without its `#`. */
function coverpageImageId(xml: string): string | null {
  const open = /<coverpage\b/i.exec(xml);
  if (!open) return null;
  const slice = xml.slice(open.index, open.index + MAX_COVERPAGE);
  const close = slice.search(/<\/coverpage\s*>/i);
  const element = close === -1 ? slice : slice.slice(0, close);
  const image = new RegExp(`<image\\b[^>]{0,${MAX_TAG}}>`, 'i').exec(element);
  return image ? (/(?:[a-z]+:)?href\s*=\s*["']#([^"']+)["']/i.exec(image[0])?.[1] ?? null) : null;
}

/** The first `<binary>` whose id `matches`, as base64 and its type. */
function findBinary(xml: string, matches: (id: string) => boolean): { base64: string; mime: string } | null {
  const tags = new RegExp(`<binary\\b([^>]{0,${MAX_TAG}})>`, 'gi');
  for (let tag = tags.exec(xml); tag; tag = tags.exec(xml)) {
    const id = /\sid\s*=\s*["']([^"']*)["']/i.exec(tag[1])?.[1];
    if (id === undefined || !matches(id)) continue;
    const start = tag.index + tag[0].length;
    const close = /<\/binary\s*>/gi;
    close.lastIndex = start;
    const end = close.exec(xml);
    if (!end) return null;
    const base64 = xml.slice(start, end.index).replace(/\s+/g, '');
    if (!base64) return null;
    const mime = /content-type\s*=\s*["']([^"']+)["']/i.exec(tag[1])?.[1] ?? 'image/jpeg';
    return { base64, mime };
  }
  return null;
}

/**
 * The extension for image bytes, from the bytes themselves.
 *
 * A MOBI hands back its cover with no media type at all — the format stores the image and nothing about it — so
 * the only honest source is the first few bytes. Naming a PNG `.jpg` would still render (browsers sniff content),
 * but it would be a lie sitting in someone's covers folder.
 */
export function sniffImageExtension(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg';
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return 'gif';
  // RIFF....WEBP
  if (at(0) === 0x52 && at(1) === 0x49 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42) return 'webp';
  return null;
}

/** The extension for a mime type an FB2 or a MOBI reports. Same shortlist as `coverExtension`, different input. */
export function extensionForMime(mime: string): string {
  const sub = mime.split('/')[1]?.toLowerCase() ?? '';
  return sub === 'png' || sub === 'webp' || sub === 'gif' ? sub : 'jpg';
}

/** The file extension for a cover, from what the archive said it was. JPEG unless it is something else entirely. */
export function coverExtension(entryName: string): string {
  const ext = entryName.slice(entryName.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'png' || ext === 'webp' || ext === 'gif' ? ext : 'jpg';
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // a stray % is a character here, not an escape
  }
}

function parseXml(xml: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return doc.querySelector('parsererror') ? null : doc;
  } catch {
    return null;
  }
}
