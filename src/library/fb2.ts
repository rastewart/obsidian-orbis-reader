// Reading an FB2's own metadata, without opening the book. See docs/design/library.md.
//
// FB2 is a single XML document: the book, its metadata and its images (base64) in one file. Everything worth
// cataloging is in the `<description>` block at the very top, which is why this parses a SLICE rather than the
// document — a novel with illustrations runs to tens of megabytes, and handing all of it to `DOMParser` to read six
// fields would build a DOM of every embedded image to throw away.
//
// Pure string in, object out, like `opf.ts`: every shape of real-world FB2 can then be pinned by a test rather than
// by finding a book that has one.

import { EMPTY_OPF_METADATA, type OpfMetadata } from './opf';

/** How much of the file to look at. The description block is first; this is generous room for a verbose one. */
const HEADER_CHARS = 64_000;

/**
 * What an FB2 says about itself.
 *
 * `title-info` only, deliberately. FB2 also carries `document-info` (who typed it up, with which tool) and
 * `publish-info` (the paper edition it came from) — and `document-info` has an `<author>` element too, which is the
 * person who made the FILE. Reading authors from anywhere but `title-info` is how a catalog ends up crediting a
 * novel to whoever ran Calibre.
 */
export function metadataFromFb2(xml: string): OpfMetadata {
  const header = xml.slice(0, HEADER_CHARS);
  const doc = parseSlice(header);
  const info = doc?.getElementsByTagName('title-info')[0];
  if (!info) return { ...EMPTY_OPF_METADATA };

  const sequence = info.getElementsByTagName('sequence')[0];
  // `publish-info` is the printed edition: its publisher and year are the book's, where `document-info`'s date is
  // the day someone converted it.
  const publish = doc?.getElementsByTagName('publish-info')[0];
  return {
    title: text(info, 'book-title'),
    authors: [...info.getElementsByTagName('author')].map(personName).filter(Boolean),
    publisher: publish ? text(publish, 'publisher') : '',
    published: publish ? text(publish, 'year') : '',
    language: text(info, 'lang'),
    isbn: publish ? text(publish, 'isbn') : '',
    series: sequence?.getAttribute('name')?.trim() ?? '',
    seriesIndex: sequence?.getAttribute('number')?.trim() ?? '',
  };
}

/**
 * A person, as a catalog would name them.
 *
 * FB2 splits a name into first, middle and last, so the natural order has to be reassembled — which is also why a
 * nickname is the fallback rather than an extra: a translator credited only as `<nickname>` still has a name.
 */
function personName(author: Element): string {
  const parts = ['first-name', 'middle-name', 'last-name'].map((tag) => text(author, tag)).filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : text(author, 'nickname');
}

function text(scope: Element, tag: string): string {
  return scope.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
}

/**
 * Parse the front of the file, closing the tags the slice cut through.
 *
 * A slice of XML is not valid XML, so the parser would reject it outright. Everything wanted lives inside
 * `<description>`, which means keeping the text up to its closing tag and shutting the root — and if the block is
 * somehow longer than the slice, there is nothing here to read anyway.
 */
function parseSlice(header: string): Document | null {
  const end = header.indexOf('</description>');
  if (end === -1) return null;
  const xml = `${header.slice(0, end)}</description></FictionBook>`;
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return doc.querySelector('parsererror') ? null : doc;
  } catch {
    return null;
  }
}
