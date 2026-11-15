import { describe, expect, it } from 'vitest';
import { onTap, TapTracker, withinTapSlop } from '../reader/tap';

describe('TapTracker', () => {
  it('counts a touch that lifts where it came down as a tap', () => {
    const t = new TapTracker();
    t.down(100, 200, 1);
    expect(t.isTap(104, 203)).toBe(true);
  });

  // A page swipe ends in a touchend too, and used to open whatever mark or note it lifted over.
  it('does not count a swipe as a tap', () => {
    const t = new TapTracker();
    t.down(300, 200, 1);
    expect(t.isTap(80, 205)).toBe(false);
  });

  it('does not count a pinch as a tap, even one that ends where it began', () => {
    const t = new TapTracker();
    t.down(100, 200, 1);
    t.down(180, 260, 2);
    expect(t.isTap(100, 200)).toBe(false);
  });

  it('starts over with the next touch', () => {
    const t = new TapTracker();
    t.down(100, 200, 1);
    t.down(180, 260, 2);
    t.down(50, 50, 1);
    expect(t.isTap(52, 51)).toBe(true);
  });

  // A quick flick of a few pixels turns the page: foliate snaps by the swipe's speed, not its length.
  it('knows a touch turned the page when the page moved, however short the swipe', () => {
    const t = new TapTracker();
    t.down(100, 200, 1, 2000);
    expect(t.isTap(106, 200)).toBe(true);
    expect(t.turnedPage(2800)).toBe(true);
  });

  it('knows a tap left the page where it was, even after a wobble dragged it and it sprang back', () => {
    const t = new TapTracker();
    t.down(100, 200, 1, 2000);
    expect(t.turnedPage(2000)).toBe(false);
  });

  it('is not a tap before any touch has come down', () => {
    expect(new TapTracker().isTap(10, 10)).toBe(false);
  });
});

describe('withinTapSlop', () => {
  it('allows ten pixels in any direction, and not eleven', () => {
    expect(withinTapSlop({ x: 0, y: 0 }, { x: 6, y: 8 })).toBe(true);
    expect(withinTapSlop({ x: 0, y: 0 }, { x: 11, y: 0 })).toBe(false);
  });
});

describe('onTap', () => {
  const press = (el: HTMLElement, from: [number, number], to: [number, number]): void => {
    el.dispatchEvent(new MouseEvent('pointerdown', { clientX: from[0], clientY: from[1] }));
    el.dispatchEvent(new MouseEvent('click', { clientX: to[0], clientY: to[1] }));
  };

  it('runs the handler on a tap', () => {
    const el = document.createElement('button');
    let taps = 0;
    onTap(el, () => taps++);
    press(el, [10, 10], [12, 11]);
    expect(taps).toBe(1);
  });

  it('ignores a click that ends a swipe begun on the element', () => {
    const el = document.createElement('button');
    let taps = 0;
    onTap(el, () => taps++);
    press(el, [10, 10], [140, 12]);
    expect(taps).toBe(0);
  });

  // Enter or Space on a focused button clicks it with no pointer at all.
  it('runs the handler on a keyboard click', () => {
    const el = document.createElement('button');
    let taps = 0;
    onTap(el, () => taps++);
    el.dispatchEvent(new MouseEvent('click'));
    expect(taps).toBe(1);
  });
});
