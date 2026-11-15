// Mid-sentence page-follow: keep the rendered page in step with the audio *within* a long
// sentence — page forward when the point being read (an elapsed fraction through the sentence)
// has scrolled off the current column/page. The sentence highlight stays whole; only the page
// follows. Shared by live read-aloud (fraction from engine progress) and generated playback
// (fraction from audio timing). Paginated mode only — scrolled mode needs no column paging.

/** The foliate renderer surface this module reads (column geometry + scroll). */
export interface PageFollowRenderer {
  scrollToAnchor?: (anchor: unknown, select?: boolean) => Promise<void>;
  containerPosition?: number;
  size?: number;
}

/** A 1-character `Range` at ~fraction `f` (0..1) through `range`'s text, or null. */
export function anchorAtFraction(range: Range, f: number): Range | null {
  const doc = range.startContainer.ownerDocument;
  if (!doc) return null;
  const total = range.toString().length;
  if (total === 0) return null;
  const target = Math.min(Math.floor(f * total), total - 1);

  // Common case: the whole sentence is one text node — its commonAncestorContainer IS that
  // text node, so a descendant TreeWalker finds nothing. Handle directly.
  const cac = range.commonAncestorContainer;
  if (cac.nodeType === 3) {
    const node = cac as Text;
    const off = Math.min(range.startOffset + target, Math.max(range.startOffset, range.endOffset - 1));
    const r = doc.createRange();
    r.setStart(node, off);
    r.setEnd(node, Math.min(off + 1, range.endOffset));
    return r;
  }

  const walker = doc.createTreeWalker(cac, NodeFilter.SHOW_TEXT);
  let acc = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n)) continue;
    const node = n as Text;
    const nodeLen = node.textContent?.length ?? 0;
    const startOff = node === range.startContainer ? range.startOffset : 0;
    const endOff = node === range.endContainer ? range.endOffset : nodeLen;
    const len = endOff - startOff;
    if (len <= 0) continue;
    if (acc + len > target) {
      const off = Math.min(startOff + (target - acc), Math.max(0, nodeLen - 1));
      const r = doc.createRange();
      r.setStart(node, off);
      r.setEnd(node, Math.min(off + 1, nodeLen));
      return r;
    }
    acc += len;
  }
  return null;
}

/**
 * Page the reader toward `frac` through `range` if the point being read has scrolled off the
 * current page. `lastPagedTo` guards against repeat scrolls within one sentence — pass the
 * previous return value back in; returns the (possibly updated) page we've paged to. `scroll`
 * runs the actual scroll (callers wrap it in a nav-suppressor so it doesn't trip selection
 * handlers). Returns `lastPagedTo` unchanged (no-op) in scrolled mode or when nothing to do.
 */
export function pageTowardFraction(
  renderer: PageFollowRenderer,
  range: Range,
  frac: number,
  lastPagedTo: number,
  scroll: (anchor: Range) => void
): number {
  const size = renderer.size ?? 0;
  if (size <= 0) return lastPagedTo; // scrolled mode / unknown geometry
  const anchor = anchorAtFraction(range, frac);
  if (!anchor) return lastPagedTo;
  const rect = Array.from(anchor.getClientRects()).find((r) => r.width > 0 && r.height > 0);
  if (!rect) return lastPagedTo;
  // Same page math as the search-hit scroll (SearchController.tryDrawHit).
  const target = Math.floor((rect.left + 0.5) / size) + 1;
  const current = Math.round((renderer.containerPosition ?? 0) / size);
  if (target > 0 && target !== current && target !== lastPagedTo) {
    scroll(anchor);
    return target;
  }
  return lastPagedTo;
}
