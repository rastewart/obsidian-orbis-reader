// A printed edition's page numbers: where each page of a book's page list starts, and which page a position is on.
//
// See docs/design/page-numbers.md. The page list is foliate's `book.pageList` (EPUB 3's nav `page-list`, EPUB 2's NCX
// `<pageList>`): a label and an href per page, in reading order. The location index's measuring pass, which already
// opens every section, resolves each href to a CFI here (`placePageTargets`), and the result is cached beside the
// locations as `{ label, cfi }` in list order.
//
// **A target that is not in the book is dropped**, so a list whose targets are all missing leaves no pages, and the
// book reads as one without page numbers. foliate keeps such entries: a missing file, and an id its file does not
// have, which foliate would otherwise open at the top of that file.
//
// **Counting is by position in the list**, never by label: labels are text (`xii`, `A-3`, `[42]`), can skip and can
// repeat. `pageAtCfi` answers a position in the list. Only the total reads a label as a number (`pageTotal`).
//
// Pure, so the data view and the device-location dialog can answer from a cache file before a book's index is up,
// as `loc-lookup` does for locations.

import { compare as cfiCompare, fromRange as cfiFromRange, joinIndir as cfiJoinIndir } from 'foliate-js/epubcfi.js';
import { hrefAnchor } from '../book-chapters';

/** One page of the printed edition: its label as the book writes it, and where its text starts. */
export interface PageStart {
  label: string;
  cfi: string;
}

/** A page-list entry waiting to be placed: its position in the list, its label, and the id it points at, if any. */
export interface PageTarget {
  index: number;
  label: string;
  /** Null for an entry naming a whole file: the page starts where the file does. */
  anchor: string | null;
}

/**
 * The page-list entries, by the section each points into. An entry with no label, no href, or a file the book does
 * not have is left out here; one whose id is missing is left out by `placePageTargets`.
 */
export function pageTargetsBySection(
  pageList: ReadonlyArray<{ label?: unknown; href?: unknown }> | null | undefined,
  sectionOf: (href: string) => number
): Map<number, PageTarget[]> {
  const out = new Map<number, PageTarget[]>();
  for (const [index, entry] of (pageList ?? []).entries()) {
    const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
    const href = typeof entry?.href === 'string' ? entry.href : '';
    if (!label || !href) continue;
    const section = sectionOf(href);
    if (section < 0) continue;
    const anchor = hrefAnchor(href);
    const target: PageTarget = { index, label, anchor: anchor ? safeDecode(anchor) : null };
    const list = out.get(section);
    if (list) list.push(target);
    else out.set(section, [target]);
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Where each target in one section starts, as a CFI: list index → CFI. A target whose id the section does not have is
 * missing from the result.
 *
 * **A page starts at the first text at or after its marker.** A page-break marker is usually an empty element, and a
 * CFI to a point beside an element is not one foliate reads back as written. The first character of the page's text is
 * a plain text position, the same kind the locations start at, so the two compare in reading order with each other
 * and with the top of the page. A marker with text of its own (a visible page number) starts at that text. One after
 * the last text in its section starts at the section's end.
 *
 * **A page that opens its file starts at the file's start** (`baseCfi`, which sorts before every position inside the
 * file): an entry naming the whole file, and a marker with nothing but white space before it — the usual marker,
 * inside a chapter's heading. Otherwise the line break before the heading would be left on the page before, and so
 * would the top of the chapter, wherever the reader puts the top of the page.
 */
export function placePageTargets(doc: Document, baseCfi: string, targets: readonly PageTarget[]): Map<number, string> {
  const out = new Map<number, string>();
  if (!targets.length || !doc.body) return out;
  const texts: Text[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  // The first text that is not white space: a marker at or before it opens the file.
  const content = texts.findIndex((t) => /\S/.test(t.data));
  for (const target of targets) {
    if (!target.anchor) {
      out.set(target.index, baseCfi);
      continue;
    }
    const el = doc.getElementById(target.anchor) ?? doc.getElementsByName(target.anchor)[0] ?? null;
    if (!el || !doc.body.contains(el)) continue;
    const first = firstTextFrom(el, texts);
    if (first >= 0 && (content < 0 || first <= content)) out.set(target.index, baseCfi);
    else if (first >= 0) out.set(target.index, at(doc, baseCfi, texts[first], 0));
    else if (texts.length) {
      const last = texts[texts.length - 1];
      out.set(target.index, at(doc, baseCfi, last, last.length));
    } else out.set(target.index, baseCfi);
  }
  return out;
}

/**
 * The placed pages, as the index keeps them: in reading order, which a page list almost always is already. Sorted
 * anyway, keeping list order where two start at the same point, because `pageAtCfi` searches by position and one
 * entry out of place would make it answer wrong pages near it.
 */
export function pagesInOrder(targets: Iterable<PageTarget>, placed: ReadonlyMap<number, string>): PageStart[] {
  const pages: Array<PageStart & { index: number }> = [];
  for (const t of targets) {
    const cfi = placed.get(t.index);
    if (cfi) pages.push({ index: t.index, label: t.label, cfi });
  }
  pages.sort((a, b) => a.index - b.index);
  try {
    pages.sort((a, b) => cfiCompare(a.cfi, b.cfi));
  } catch {
    /* list order, then */
  }
  return pages.map(({ label, cfi }) => ({ label, cfi }));
}

/** The first text node inside or after `el`, by a binary search over the section's text nodes in document order. */
function firstTextFrom(el: Element, texts: readonly Text[]): number {
  let lo = 0;
  let hi = texts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    // FOLLOWING is set for a node after `el`, and for one inside it (CONTAINED_BY comes with FOLLOWING).
    if (el.compareDocumentPosition(texts[mid]) & Node.DOCUMENT_POSITION_FOLLOWING) {
      found = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return found;
}

function at(doc: Document, baseCfi: string, node: Text, offset: number): string {
  const range = doc.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  return cfiJoinIndir(baseCfi, cfiFromRange(range));
}

/**
 * The page a position is on: its index in `pages`, the last page that starts at or before it. Null before the first
 * page (a cover), with no pages, or for a CFI that cannot be read.
 */
export function pageAtCfi(pages: readonly PageStart[], cfi: string): number | null {
  if (!pages.length || !cfi) return null;
  let lo = 0;
  let hi = pages.length - 1;
  let found = -1;
  try {
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cfiCompare(pages[mid].cfi, cfi) <= 0) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
  } catch {
    return null;
  }
  return found < 0 ? null : found;
}

/**
 * "Of N": the highest label that is a plain number — an index numbered on from the text counts, an unnumbered `[42]`
 * after it does not. A book whose labels include no plain number uses the number of pages in its list.
 */
export function pageTotal(pages: readonly PageStart[]): number {
  let highest = 0;
  for (const { label } of pages) if (/^\d+$/.test(label)) highest = Math.max(highest, Number(label));
  return highest > 0 ? highest : pages.length;
}
