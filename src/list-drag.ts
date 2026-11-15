// Where a dragged row lands.
//
// Split out from `wireListDrag` because this is the part that goes wrong: which row the pointer is over, and the
// asymmetry between dragging up and dragging down. Verifying that by dragging rows around on three devices is
// slow and unconvincing, and every failure looks like "it moved to the wrong place" without saying why. Here it
// is arithmetic over rectangles, and a test can state each case.

/** A row's vertical extent in viewport coordinates — `getBoundingClientRect()`, narrowed to what matters. */
export interface RowBand {
  top: number;
  bottom: number;
}

/**
 * Where a dragged row would be INSERTED, as a slot between rows: 0 is before the first, `bands.length` is after the
 * last.
 *
 * **By midpoints, not by which row the pointer is inside.** Answering "which row am I over" means, for a tall row,
 * dragging the better part of two rows before the target changes. Crossing the line between two rows is what a
 * reader means by moving one place, and the line between two rows is the midpoint of each.
 */
export function insertIndexAt(y: number, bands: readonly RowBand[]): number {
  let slot = 0;
  for (const band of bands) {
    if (y > (band.top + band.bottom) / 2) slot++;
    else break;
  }
  return slot;
}

/**
 * Whether a pointer has moved far enough to mean a drag rather than a tap.
 *
 * A handle is also a button-sized target, and a finger never presses one perfectly still — without a threshold
 * every tap on the handle starts a zero-distance drag, which at best does nothing and at worst swallows the tap.
 * Six pixels is about the wobble of a deliberate press and well under the distance of an intended move.
 */
export const DRAG_THRESHOLD_PX = 6;

export function isDragIntent(startY: number, y: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return Math.abs(y - startY) >= threshold;
}
