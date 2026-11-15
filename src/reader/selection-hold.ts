// Where the page is held while a selection lasts on mobile — see `ReaderDom.installMobileSelectionSnapback`.
//
// Pure: frame in, decision out. The caller owns the animation-frame loop and the paginator; this decides, each
// frame, whether to force the saved position or wait out a layout change, so the rule can be tested without a
// device, a WebView or a rotation.

/** How many frames the position and page width must hold still before a new layout counts as settled. */
const STILL_FRAMES = 2;
/** The most frames to wait for a layout to settle before taking wherever it is. */
const MAX_SETTLE_FRAMES = 30;

/** What the page is being held at: a position, and the page width it was measured at. */
export interface HeldPosition {
  pos: number;
  size: number;
}

interface Settling {
  pos: number;
  size: number;
  still: number;
  frames: number;
}

/**
 * One frame's decision. `hold` means set the position to it. `relayout` is the first frame of a width change: the
 * caller brings the selection back into view, then waits. `moved` ends the wait, and says where the hold went.
 */
export type HoldFrame =
  | { kind: 'hold'; pos: number }
  | { kind: 'relayout' }
  | { kind: 'wait' }
  | { kind: 'moved'; from: HeldPosition; to: HeldPosition; frames: number };

/**
 * **A position is pixels at one page width.** Rotating the device, or anything else that re-lays the book out,
 * changes the width, and the old pixels then point partway into a different page — forcing them back every frame
 * is what left a rotated book showing half of its title page. So a width change stops the hold, the caller brings
 * the selection into view in the new layout, and once the position and width have held still, the hold resumes
 * from there.
 */
export class SelectionHold {
  private held: HeldPosition = { pos: 0, size: 0 };
  private settling: Settling | null = null;

  /** Save where the page is before a selection starts. */
  save(at: HeldPosition): void {
    this.held = { ...at };
    this.settling = null;
  }

  /** The selection ended: nothing is being waited out any more. */
  release(): void {
    this.settling = null;
  }

  /** Decide one frame, given where the paginator is now. */
  frame(now: HeldPosition): HoldFrame {
    const unchanged = !now.size || !this.held.size || now.size === this.held.size;
    if (!this.settling && unchanged) return { kind: 'hold', pos: this.held.pos };
    if (!this.settling) {
      this.settling = { pos: now.pos, size: now.size, still: 0, frames: 0 };
      return { kind: 'relayout' };
    }
    const s = this.settling;
    s.frames++;
    s.still = now.pos === s.pos && now.size === s.size ? s.still + 1 : 0;
    s.pos = now.pos;
    s.size = now.size;
    if (s.still < STILL_FRAMES && s.frames < MAX_SETTLE_FRAMES) return { kind: 'wait' };
    const from = this.held;
    this.held = { pos: now.pos, size: now.size };
    this.settling = null;
    return { kind: 'moved', from, to: { ...this.held }, frames: s.frames };
  }
}
