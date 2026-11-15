// The full-screen player's progress bar as a control: dragged to seek, and a slider a keyboard can reach.
//
// Split out of `TtsController.ts`. The controller says what a position MEANS — what a drag previews, where a
// release seeks, what an arrow does; this owns the gestures and keys that produce them.

import { t } from '../../i18n';
import { guardDragSwipe } from '../../ui-utils';

/**
 * How far an arrow key moves the scrubber, in seconds — and Shift for the coarse one.
 *
 * Seconds rather than a percentage of the chapter, so the same press moves the same distance whether the chapter
 * runs four minutes or forty. Ten is what every audio player uses for a nudge; a minute is the coarse step that
 * makes crossing a long chapter possible without holding a key down.
 */
export const SCRUB_STEP_SEC = 10;
export const SCRUB_STEP_LARGE_SEC = 60;

/** A keyboard move on the scrubber: seconds to skip, or one end of the track. */
export type ScrubMove = number | 'start' | 'end';

/** What a key does to the scrubber, or null for a key it leaves alone. */
export function scrubMoveFor(key: string, shift: boolean): ScrubMove | null {
  const step = shift ? SCRUB_STEP_LARGE_SEC : SCRUB_STEP_SEC;
  if (key === 'ArrowRight' || key === 'ArrowUp') return step;
  if (key === 'ArrowLeft' || key === 'ArrowDown') return -step;
  if (key === 'Home') return 'start';
  if (key === 'End') return 'end';
  return null;
}

export interface ScrubDeps {
  /** Whether there is anything to scrub through yet — a live track's model is built once its text is read. */
  canScrub(): boolean;
  /** A drag is on (or over): the readouts stop following playback while it is. */
  setScrubbing(on: boolean): void;
  /** Show what releasing at `fraction` would give — the bar and the times — while playback carries on. */
  preview(fraction: number): void;
  /** The drag let go at `fraction`: seek there. */
  seek(fraction: number): void;
  /** A key: an arrow skips by seconds, Home and End go to the ends. */
  nudge(move: ScrubMove, key: string): void;
}

/** Make the progress bar draggable to seek. A drag shows a live fill + elapsed/remaining preview (playback keeps
 *  going); the actual jump happens on release, so the voice re-synthesizes once. */
export function wireProgressScrub(track: HTMLElement, deps: ScrubDeps): void {
  let scrubbing = false;
  const fracAt = (clientX: number): number => {
    const r = track.getBoundingClientRect();
    return r.width > 0 ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) : 0;
  };
  track.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!deps.canScrub()) return;
    scrubbing = true;
    deps.setScrubbing(true);
    track.setPointerCapture(e.pointerId);
    deps.preview(fracAt(e.clientX));
    /**
     * **`preventDefault` costs the focus, so take it back.**
     *
     * Suppressing the default is what stops a drag from selecting text and from starting Obsidian's own gestures
     * — but the default it suppresses includes moving focus to what was pressed. So clicking the bar would scrub
     * it and leave the keyboard wherever it had been, and the arrows would appear not to work on a scrubber the
     * mouse had just moved: the keystrokes would be going somewhere else entirely.
     */
    e.preventDefault();
    track.focus();
  });
  track.addEventListener('pointermove', (e: PointerEvent) => {
    if (scrubbing) deps.preview(fracAt(e.clientX));
  });
  const end = (e: PointerEvent): void => {
    if (!scrubbing) return;
    scrubbing = false;
    deps.setScrubbing(false);
    try {
      track.releasePointerCapture(e.pointerId);
    } catch {
      /* capture already released */
    }
    deps.seek(fracAt(e.clientX));
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  /**
   * **A slider a keyboard can reach.** A `div` with pointer handlers is invisible to the keyboard however well it
   * drags — Tab walks past it — which would make the one control in the player that sets a POSITION the one
   * control nobody could operate without a pointer.
   *
   * `role="slider"` with the value attributes, because that is what it is — the alternative, an
   * `<input type="range">`, would bring focus and arrows for free but not the 4px bar inside a 26px touch
   * target, which is the shape this whole control exists to be.
   */
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-label', t('tts.scrub_label'));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', '0');
  track.addEventListener('keydown', (e: KeyboardEvent) => {
    const move = scrubMoveFor(e.key, e.shiftKey);
    if (move === null) return;
    // Before the seek, and both: an arrow inside the reader would otherwise also turn the page, and Home would
    // scroll the panel this sits in.
    e.preventDefault();
    e.stopPropagation();
    deps.nudge(move, e.key);
  });
  // A scrub is a precise horizontal drag, which on iPadOS also reads as Obsidian's edge-swipe and
  // pulls in the side drawers. `touch-action: none` on the track isn't enough — that only stops the
  // browser's own panning, while Obsidian's gesture is JS on touch events. Same guard the
  // Display-settings sliders use.
  guardDragSwipe(track);
}
