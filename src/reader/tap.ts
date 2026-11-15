// Telling a tap from a swipe on a touch screen.
//
// A swipe to turn the page ends in a `touchend` like a tap does, and a handler that reads only where the finger
// lifted opens whatever mark or note it lifted over. Two tests, and a tap passes both: the finger stayed within a
// few pixels of where it came down, with no second finger, and the page is still where it was.
//
// **Distance alone is not enough.** Foliate drags the page with any movement and, when the finger lifts, snaps to
// a page chosen by the swipe's SPEED — so a quick flick of a few pixels turns the page, which Android reports and
// iOS apparently does not. The page not having moved is foliate's own answer, so it cannot disagree with it.

/** How far a finger may move and still be a tap — about the platforms' own touch slop (Android 8dp, iOS ~10pt). */
const TAP_SLOP_PX = 10;

/** Is a touch that went down at `from` and came up at `to` a tap? */
export function withinTapSlop(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) <= TAP_SLOP_PX;
}

/**
 * Follows one touch sequence on a document: `down` on every `touchstart`, `isTap` on the `touchend`.
 *
 * **A second finger ends any chance of a tap**, for the whole sequence — a pinch that ends with both fingers where they
 * started is still not a tap on whatever is under them.
 */
export class TapTracker {
  private from: { x: number; y: number } | null = null;
  private multi = false;
  private pageAt = 0;

  /**
   * A `touchstart`: where the first finger came down, how many fingers are on the screen now, and where the page
   * was — the paginator's scroll position.
   */
  down(x: number, y: number, fingers: number, page = 0): void {
    if (fingers > 1) {
      this.multi = true;
      return;
    }
    this.from = { x, y };
    this.multi = false;
    this.pageAt = page;
  }

  /** After foliate has snapped: has the page moved since the finger came down? Then the touch turned it. */
  turnedPage(page: number): boolean {
    return Math.abs(page - this.pageAt) >= 1;
  }

  /** The `touchend`: was the sequence a tap, lifting at `(x, y)`? */
  isTap(x: number, y: number): boolean {
    return !this.multi && this.from !== null && withinTapSlop(this.from, { x, y });
  }
}

/**
 * Run `handler` when `el` is tapped or clicked, but not when a touch that began on it moved away — a swipe that
 * happened to start on the element.
 */
export function onTap(el: HTMLElement, handler: () => void): void {
  let from: { x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    from = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener('click', (e) => {
    const moved = from !== null && !withinTapSlop(from, { x: e.clientX, y: e.clientY });
    from = null;
    if (!moved) handler();
  });
}
