// Reading an EPUB's own metadata, without opening the book. See docs/design/library.md.
//
// Cataloging a folder of books means asking hundreds of them what they are, and the reader's answer to that
// question costs a whole foliate view. An EPUB carries its metadata in an OPF document listed by
// `META-INF/container.xml`, so two small XML files answer it — which is the difference between a bulk catalog
// being a background job and being a bad idea.
//
// Pure string in, object out: no vault, no zip, so every shape of real-world OPF can be pinned by a test rather
// than by finding a book that has one.

/** What an OPF can tell us, mapped onto the record schema. Everything is optional; most books omit most of it. */
export interface OpfMetadata {
  title: string;
  authors: string[];
  publisher: string;
  published: string;
  language: string;
  isbn: string;
  series: string;
  seriesIndex: string;
}

export const EMPTY_OPF_METADATA: OpfMetadata = {
  title: '',
  authors: [],
  publisher: '',
  published: '',
  language: '',
  isbn: '',
  series: '',
  seriesIndex: '',
};

function parseXml(xml: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    // A parse failure is reported as a document containing `parsererror` rather than by throwing, so a malformed
    // file would otherwise sail through and produce an empty record with no sign anything went wrong.
    return doc.querySelector('parsererror') ? null : doc;
  } catch {
    return null;
  }
}

/**
 * Where the OPF lives, from `META-INF/container.xml`.
 *
 * The path is read rather than assumed: `OEBPS/content.opf` is a convention, not a rule, and enough books put it
 * elsewhere that guessing would quietly skip them.
 */
export function opfPathFromContainer(xml: string): string | null {
  const doc = parseXml(xml);
  if (!doc) return null;
  // Namespace-agnostic: `rootfile` is in the container namespace, and `getElementsByTagName` with a namespace
  // prefix fails on documents that declare it differently. Every container in the wild has exactly one.
  const rootfile = doc.getElementsByTagName('rootfile')[0];
  const path = rootfile?.getAttribute('full-path')?.trim();
  return path || null;
}

/** Text of the first element with this local name, ignoring namespace prefixes. */
function firstText(doc: Document, localName: string): string {
  const el = [...doc.getElementsByTagName('*')].find((e) => e.localName === localName);
  return el?.textContent?.trim() ?? '';
}

/** Text of every element with this local name, in document order. */
function allText(doc: Document, localName: string): string[] {
  return [...doc.getElementsByTagName('*')]
    .filter((e) => e.localName === localName)
    .map((e) => e.textContent?.trim() ?? '')
    .filter((v) => v.length > 0);
}

/** A `<meta name="..." content="...">` value — EPUB 2 style, which is where Calibre writes series. */
function metaByName(doc: Document, name: string): string {
  const el = [...doc.getElementsByTagName('*')].find((e) => e.localName === 'meta' && e.getAttribute('name') === name);
  return el?.getAttribute('content')?.trim() ?? '';
}

/**
 * Everything the record schema wants, from an OPF.
 *
 * **Namespaces are ignored on purpose.** `dc:title`, `title` and a differently-prefixed `foo:title` all mean the
 * same thing here, and matching on the local name is what makes this work across the varied and often careless
 * XML that real books ship with. The risk is matching something unintended, which is why each lookup names an
 * element that only means one thing inside an OPF.
 */
export function metadataFromOpf(xml: string): OpfMetadata {
  const doc = parseXml(xml);
  if (!doc) return { ...EMPTY_OPF_METADATA };
  const identifiers = allText(doc, 'identifier');
  return {
    title: firstText(doc, 'title'),
    // Every creator, not just the first: an anthology or a translated work names several, and the record's
    // `authors` is a list precisely so it does not have to choose.
    authors: allText(doc, 'creator'),
    publisher: firstText(doc, 'publisher'),
    published: firstText(doc, 'date'),
    language: firstText(doc, 'language'),
    // The one identifier worth naming, found by shape rather than by attribute: a book's `dc:identifier` may be
    // a UUID, a URL or an ISBN, and only the last is a fact about the book rather than about the file.
    isbn: identifiers.map(normalizeIsbn).find((v) => v.length > 0) ?? '',
    series: metaByName(doc, 'calibre:series'),
    seriesIndex: metaByName(doc, 'calibre:series_index'),
  };
}

/** An ISBN if this identifier is one, else empty. Accepts the `urn:isbn:` and `ISBN:` forms books use. */
export function normalizeIsbn(identifier: string): string {
  const digits = identifier
    .replace(/^(urn:)?isbn:?/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
  return /^(\d{9}[\dX]|\d{13})$/.test(digits) ? digits : '';
}
