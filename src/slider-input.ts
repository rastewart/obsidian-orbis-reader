// A slider and its number field, applying what they set at a pace the book can keep up with.
//
// Every display slider — the display bar's and Settings' — and read-aloud's speed slider are bound here. See
// docs/design/display-styles.md, "Change propagation".

import { guardDragSwipe } from './ui-utils';

/** The least time between two values a slider applies while it is being dragged or typed into. */
export const SLIDER_APPLY_EVERY_MS = 250;

/**
 * An apply that took longer than this makes the slider wait to be let go. Restyling an ordinary chapter takes a
 * millisecond or two; a 3 MB chapter takes a hundred or more, and the page then lays itself out again, so a drag that
 * applied as it went stalled the thumb under the hand.
 */
export const SLOW_APPLY_MS = 50;

const DRAGGING = 'orbisDragging';

/**
 * Whether the reader's pointer is down on this slider. A surface writing an outside change into its controls leaves
 * such a slider alone: written mid-drag, the thumb jumped back under the hand, and the drag's next step read the
 * written value instead of the hand's and applied it again.
 */
export function isSliderDragging(slider: HTMLInputElement): boolean {
  return slider.dataset[DRAGGING] === 'true';
}

/** Mark `slider` while the pointer is down on it — see `isSliderDragging`. */
function markDragging(slider: HTMLInputElement): void {
  slider.addEventListener('pointerdown', () => {
    slider.dataset[DRAGGING] = 'true';
    const win = slider.ownerDocument.defaultView ?? window;
    const up = (): void => {
      delete slider.dataset[DRAGGING];
      win.removeEventListener('pointerup', up, true);
      win.removeEventListener('pointercancel', up, true);
    };
    win.addEventListener('pointerup', up, true);
    win.addEventListener('pointercancel', up, true);
  });
}

/**
 * `apply`, at most every `SLIDER_APPLY_EVERY_MS` while values keep coming, and the last one always.
 *
 * **Why a slider waits.** A slider reports every step of a drag, and some of what it sets restyles and lays out the
 * whole chapter: on a book with a 3 MB chapter, a font-size drag restyled it dozens of times and the slider lagged
 * behind the hand. `soon` applies the first value at once, then at most one value every `SLIDER_APPLY_EVERY_MS` —
 * counted from when the last one FINISHED applying, so a slow book is given room — and the latest value is the one that
 * applies. `now` applies at once, for letting go or leaving the field, and skips a value the drag already applied.
 *
 * **On a slow book, only on letting go.** Once an apply has taken longer than `SLOW_APPLY_MS`, `soon` only holds the
 * value and `now` applies it: the thumb moves freely, and the book changes once, where the hand stopped.
 */
export function paced(apply: (value: number) => void): { soon: (value: number) => void; now: (value: number) => void } {
  let timer: number | null = null;
  let pending: number | null = null;
  let last: number | null = null;
  let finishedAt = Number.NEGATIVE_INFINITY;
  let slow = false;
  const run = (value: number): void => {
    pending = null;
    last = value;
    const started = performance.now();
    apply(value);
    finishedAt = performance.now();
    slow = finishedAt - started > SLOW_APPLY_MS;
  };
  return {
    soon: (value) => {
      pending = value;
      if (slow || timer !== null) return;
      const wait = SLIDER_APPLY_EVERY_MS - (performance.now() - finishedAt);
      if (wait <= 0) {
        run(value);
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        if (pending !== null) run(pending);
      }, wait);
    },
    now: (value) => {
      const waiting = timer !== null || (slow && pending !== null);
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      // A value the drag's last step already applied is not applied twice on letting go.
      if (!waiting && value === last) return;
      run(value);
    },
  };
}

export function bindRealTimeSliderInput(
  inputEl: HTMLInputElement,
  sliderEl: HTMLInputElement,
  sliderMin: number,
  sliderMax: number,
  fallbackSliderVal: number,
  onValidInput: (val: number) => void,
  sliderToInput: (v: number) => number = (v) => v,
  inputToSlider: (v: number) => number = (v) => v
): void {
  // Keep dragging the slider from also opening Obsidian's file/backlinks drawers on mobile.
  guardDragSwipe(sliderEl);
  markDragging(sliderEl);
  const apply = paced(onValidInput);

  // When slider is dragged, update input at once and apply the value at a pace the book can keep up with.
  sliderEl.addEventListener('input', () => {
    const val = Number(sliderEl.value);
    inputEl.value = String(sliderToInput(val));
    apply.soon(val);
  });
  // Let go (or a key press): the value the thumb rests on, now.
  sliderEl.addEventListener('change', () => apply.now(Number(sliderEl.value)));

  // Real-time keystroke evaluation
  inputEl.addEventListener('input', () => {
    const parsedInput = parseFloat(inputEl.value);
    if (isNaN(parsedInput)) return; // Ignore partial typings like '-' or empty
    const parsedSlider = inputToSlider(parsedInput);
    if (parsedSlider >= sliderMin && parsedSlider <= sliderMax) {
      sliderEl.value = String(parsedSlider);
      apply.soon(parsedSlider);
    }
  });

  // Final hard clamp on blur/enter
  const clampAndApply = () => {
    const parsedInput = parseFloat(inputEl.value);
    const parsedSlider = isNaN(parsedInput)
      ? fallbackSliderVal
      : Math.max(sliderMin, Math.min(sliderMax, inputToSlider(parsedInput)));
    inputEl.value = String(sliderToInput(parsedSlider));
    sliderEl.value = String(parsedSlider);
    apply.now(parsedSlider);
  };

  inputEl.addEventListener('blur', clampAndApply);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inputEl.blur();
  });
}
