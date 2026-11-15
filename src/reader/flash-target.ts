// What, if anything, to flash when a jump into a book lands. See docs/design/reading-progress-system.md.
//
// **A flash outlines a range, so only a CFI can have one.** A destination may also name a chapter (`href`), a
// location number or a percentage — each of which lands you on a page without saying which lines were the point.
// Outlining a whole chapter, or guessing at a line from a percentage, would be noise sold as precision.
//
// Its own module, and pure, because this is the rule that decides whether the reader gets an answer to "why am I
// here?" — and the alternative home for it is inside a function that also opens files, waits for renderers and
// retries on a timer.

/**
 * The color of "you landed here": deep pink, drawn as an outline.
 *
 * **One constant, because it is one event.** Search results, a highlight or note opened from the content panel, and a
 * link arriving from a note or the Library are the same question answered — which lines on this page were the point —
 * and they were on their way to three copies of the same hex. Outlined rather than filled: what you land on is
 * usually already highlighted, and a translucent fill over a colored selection barely reads.
 *
 * A bookmark keeps its own amber fill. It is the one landing where nothing is highlighted underneath, and the fill is
 * what has always said "this line".
 */
export const LANDING_FLASH_COLOR = '#FF1493';

/** A place in a book, as every route into one names it. */
export interface FlashDestination {
  cfi?: string | null;
  href?: string | null;
  loc?: number | null;
  pct?: number | null;
}

/**
 * The CFI to flash on arrival, or `null` when this destination has no passage in it.
 *
 * Blank is nothing: a link carrying `cfi=` with an empty value is a link with no position, and treating the empty
 * string as a target would ask the overlay to resolve nothing.
 */
export function flashTarget(to: FlashDestination): string | null {
  const cfi = to.cfi?.trim();
  return cfi ? cfi : null;
}
