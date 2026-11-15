import { collapse as cfiCollapse, compare as cfiCompare } from 'foliate-js/epubcfi.js';
import type { Bookmark } from '../progress';

/**
 * Where a bookmark's location is counted from: where its anchor — the lines it marks, at the top of the page or the
 * sentence being read — begins. Placed by text, so no font size or screen moves it, as a passage is placed by where
 * it begins. A bookmark from before anchors falls back to its page.
 */
export function bookmarkLocCfi(b: Pick<Bookmark, 'anchorCfi' | 'cfi'>): string {
  return b.anchorCfi ?? b.cfi;
}

/** A bookmark's name in the Saved pane: its chapter and location, whichever it has. */
export function bookmarkLabel(chapter: string | undefined, loc: number | undefined): string {
  return [chapter || null, loc != null ? `loc. ${loc}` : null].filter(Boolean).join(' · ') || 'Bookmark';
}

/** Whether the anchored sentence at `anchorCfi` is visible on the current page
 *  `pageCfi` (both range CFIs) — i.e. the two ranges overlap. Overlap, not
 *  start-containment: a page that opens mid-sentence has a top-of-page anchor whose
 *  *start* precedes the page start (the sentence began on the previous page), so a
 *  start-only test would miss it. Font-size independent, and unlike exact-CFI
 *  equality it works for audio bookmarks whose parked page CFI never matched the
 *  sentence's real page. */
/** Whether two range CFIs overlap (font-size independent; false for malformed / cross-document
 *  CFIs). Overlap — not start-containment — so it catches ranges that begin before but extend
 *  into each other. Used for bookmark page-matching and for the selection/annotation overlap
 *  test that drives the look-up interaction model (see docs/design/annotations.md). */
export function cfiRangesOverlap(a: string, b: string): boolean {
  try {
    const aStart = cfiCollapse(a, false);
    const aEnd = cfiCollapse(a, true);
    const bStart = cfiCollapse(b, false);
    const bEnd = cfiCollapse(b, true);
    return cfiCompare(aEnd, bStart) >= 0 && cfiCompare(aStart, bEnd) <= 0;
  } catch {
    return false; // CFIs in different documents / malformed — not a match.
  }
}

/** Like `cfiRangesOverlap` but excludes ranges that merely TOUCH at a boundary (adjacent sentences
 *  share an endpoint). Used by the read-aloud add-highlight/add-note guard: a clean sentence sitting
 *  right after a highlighted one touches its boundary, which the inclusive test wrongly flags as an
 *  overlap. Strict interior overlap only. */
export function cfiRangesOverlapStrict(a: string, b: string): boolean {
  try {
    const aStart = cfiCollapse(a, false);
    const aEnd = cfiCollapse(a, true);
    const bStart = cfiCollapse(b, false);
    const bEnd = cfiCollapse(b, true);
    return cfiCompare(aEnd, bStart) > 0 && cfiCompare(aStart, bEnd) < 0;
  } catch {
    return false;
  }
}

/** A range CFI is usable only if its start is strictly before its end. Malformed annotations (e.g.
 *  older whole-paragraph selections encoded with the end above the start) collapse to nothing and
 *  can't be shown or navigated. Returns false on any parse error too. */
export function isForwardRangeCfi(cfi: string): boolean {
  try {
    return cfiCompare(cfiCollapse(cfi, false), cfiCollapse(cfi, true)) < 0;
  } catch {
    return false;
  }
}

const anchorOnPage = cfiRangesOverlap;

/**
 * The bookmark (if any) at the current reading position.
 *
 * Three matchers, in order of trust:
 *  1. `exactCfi === lastCfi` — the visual page the bookmark was last calibrated to. Set on
 *     creation and re-stamped by `calibrateOnRelocate` to the landed page, so navigating to a
 *     bookmark always lights the toolbar icon. This is essential for *audio* bookmarks: their
 *     anchor is a mid-content sentence, and foliate doesn't land page-aligned to it, so the
 *     landed page CFI often doesn't overlap the sentence range (confirmed on Android).
 *  2. `anchorCfi` sentence-in-page overlap — catches paging *onto* a bookmarked spot naturally,
 *     when there's no fresh exactCfi for the current page.
 *  3. page-number `loc` — legacy bookmarks made before `exactCfi`. Never used for a bookmark that
 *     has an `exactCfi`/`anchorCfi`, since `lastLocation.current` can be stale (foliate sometimes
 *     relocates with a cfi but no location data), producing false positives on the wrong page.
 * See docs/design/integration-test-strategy.md.
 */
export function findCurrentBookmark(
  bookmarks: readonly Bookmark[],
  lastCfi: string | null,
  lastLocation: { current: number } | null
): Bookmark | null {
  if (lastCfi) {
    const byExact = bookmarks.find((b) => b.exactCfi === lastCfi);
    if (byExact) return byExact;
    const byAnchor = bookmarks.find((b) => b.anchorCfi && anchorOnPage(b.anchorCfi, lastCfi));
    if (byAnchor) return byAnchor;
  }
  const loc = lastLocation?.current;
  if (loc != null) return bookmarks.find((b) => !b.exactCfi && !b.anchorCfi && b.loc === loc) ?? null;
  return null;
}
