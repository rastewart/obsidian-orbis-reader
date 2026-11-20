// A swipe turns the page of a CBZ comic or a fixed-layout EPUB (ORBIS patch 37). foliate's fixed-layout renderer had
// no touch handling, so on a phone or tablet only the page buttons turned its pages.

import { beforeAll, describe, expect, it, vi } from 'vitest';

type Fxl = HTMLElement & { rtl: boolean; next: () => unknown; prev: () => unknown };

beforeAll(async () => {
  // jsdom has no ResizeObserver; the renderer only needs one to exist.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await import('../vendor/foliate-js/fixed-layout.js');
});

/** A renderer whose page turns are counted rather than made. */
function renderer(rtl = false) {
  const el = document.createElement('foliate-fxl') as Fxl;
  el.rtl = rtl;
  const next = vi.fn();
  const prev = vi.fn();
  el.next = next;
  el.prev = prev;
  return { el, next, prev };
}

/** A touch event with the fields the renderer reads: jsdom cannot construct a Touch. */
function touch(type: string, x: number, y: number, timeStamp: number, fingers = 1) {
  const e = new Event(type, { cancelable: true });
  const point = { screenX: x, screenY: y };
  Object.defineProperties(e, {
    changedTouches: { value: [point] },
    touches: { value: type === 'touchend' ? [] : Array(fingers).fill(point) },
    timeStamp: { value: timeStamp },
  });
  return e;
}

/** One finger from `from` to `to` over `ms` milliseconds. Returns the touchmove, to see whether it was cancelled. */
function swipe(el: HTMLElement, from: [number, number], to: [number, number], ms = 300, fingers = 1) {
  el.dispatchEvent(touch('touchstart', from[0], from[1], 1000, fingers));
  const move = touch('touchmove', to[0], to[1], 1000 + ms / 2, fingers);
  el.dispatchEvent(move);
  el.dispatchEvent(touch('touchend', to[0], to[1], 1000 + ms));
  return move;
}

describe('a swipe on a fixed-layout page', () => {
  it('turns to the next page when the finger moves left, and back when it moves right', () => {
    const { el, next, prev } = renderer();
    swipe(el, [300, 400], [200, 410]);
    expect(next).toHaveBeenCalledTimes(1);
    swipe(el, [200, 400], [300, 390]);
    expect(prev).toHaveBeenCalledTimes(1);
  });

  it('turns the other way in a right-to-left book, bringing in what is to the right', () => {
    const { el, next, prev } = renderer(true);
    swipe(el, [300, 400], [200, 400]);
    expect(prev).toHaveBeenCalledTimes(1);
    swipe(el, [200, 400], [300, 400]);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('turns on a short flick, but not on a short slow drag', () => {
    const { el, next } = renderer();
    swipe(el, [300, 400], [280, 400], 1000);
    expect(next).not.toHaveBeenCalled();
    swipe(el, [300, 400], [280, 400], 40);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves a drag up or down, and two fingers, alone', () => {
    const { el, next, prev } = renderer();
    swipe(el, [300, 400], [250, 200]);
    swipe(el, [300, 400], [100, 400], 300, 2);
    expect(next).not.toHaveBeenCalled();
    expect(prev).not.toHaveBeenCalled();
  });

  it('keeps the drag from the browser, so it neither scrolls nor bounces', () => {
    const { el } = renderer();
    expect(swipe(el, [300, 400], [200, 400]).defaultPrevented).toBe(true);
  });

  it('is not also a tap: the click that ends a flick reaches nothing, and the next one does', () => {
    vi.useFakeTimers();
    try {
      const { el } = renderer();
      const child = el.appendChild(document.createElement('div'));
      const tapped = vi.fn();
      child.addEventListener('click', tapped);
      swipe(el, [300, 400], [288, 400], 40);
      child.click();
      expect(tapped).not.toHaveBeenCalled();
      child.click();
      expect(tapped).toHaveBeenCalledTimes(1);
      // A flick with no click after it does not swallow a real tap later on.
      swipe(el, [300, 400], [288, 400], 40);
      vi.advanceTimersByTime(500);
      child.click();
      expect(tapped).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
