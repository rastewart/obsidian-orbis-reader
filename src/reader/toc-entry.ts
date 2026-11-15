// The contents entry an annotation belongs to.
//
// **The passage's own entry, not the page's.** foliate reports one entry per page — the last entry whose heading
// starts on or before the END of the visible page (`TOCProgress.getProgress` in vendor/foliate-js/progress.js).
// That is the right answer for "where am I", and the wrong one for a passage: a page holding the end of one section
// and the heading of the next would file everything marked in the first section under the second, and under the
// third when two headings start on the page. So the range is collapsed to its START before foliate is asked, and the
// answer is the entry whose heading comes at or before the first character of the passage.

import type { FoliateViewEl } from './foliate-view';

export interface PassageEntry {
  href: string;
  label: string;
}

/** The entry holding the start of `range` in section `sectionIndex`, or null before the book's first entry. */
export function tocEntryAt(
  view: Pick<FoliateViewEl, 'getProgressOf'> | null | undefined,
  sectionIndex: number,
  range: Range
): PassageEntry | null {
  const item = view?.getProgressOf(sectionIndex, firstTextPoint(range))?.tocItem;
  return item?.href ? { href: item.href, label: item.label ?? '' } : null;
}

/**
 * The first character at or after `range`'s start that is not whitespace, as a collapsed range — where the text visibly
 * begins. The start itself when there is no such character after it.
 *
 * **Because a page can begin before its heading.** A file Calibre made starts with an empty page-break `<div>`, then a
 * line break, then `<h3>CHAPTER III.</h3>`; the first page's range starts in that line break, which lies BEFORE the
 * heading, so foliate files the page under the chapter before it — the chapter counter read CHAPTER II's 13 / 13 over
 * CHAPTER III's heading, and a bookmark there was filed under CHAPTER II. Whitespace between blocks is not text anyone
 * reads, so the point moves past it to the heading's first letter.
 */
function firstTextPoint(range: Range): Range {
  const start = range.cloneRange();
  start.collapse(true);
  const doc = start.startContainer.ownerDocument;
  const root = doc?.body ?? doc?.documentElement;
  if (!doc || !root) return start;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = start.startContainer;
  let offset = start.startOffset;
  if (node.nodeType !== Node.TEXT_NODE) {
    // An element and a child index: the text begins at that child, or after the element when the index is its end.
    const child: Node | undefined = node.childNodes[offset];
    walker.currentNode = child ?? node;
    if (child?.nodeType === Node.TEXT_NODE) node = child;
    else {
      let next = walker.nextNode();
      if (!child) while (next && node.contains(next)) next = walker.nextNode();
      node = next;
    }
    offset = 0;
  } else walker.currentNode = node;
  for (; node; node = walker.nextNode(), offset = 0) {
    const at = (node.nodeValue ?? '').slice(offset).search(/\S/);
    if (at < 0) continue;
    const point = doc.createRange();
    point.setStart(node, offset + at);
    point.collapse(true);
    return point;
  }
  return start;
}
