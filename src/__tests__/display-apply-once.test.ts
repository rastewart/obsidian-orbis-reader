// A display change is applied as few times as it can be: a dragged slider at a pace a large chapter can keep up with,
// and a whole display style at once. On a book with a 3 MB chapter each restyle and layout is felt, and a slider that
// applied every step, or a style that applied its nine values one by one, made the reader lag behind the hand.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyStyleToLocalStorage, DISPLAY_DEFAULTS, DISPLAY_STYLE_APPLIED, displayStyleEntries } from '../settings';
import {
  bindRealTimeSliderInput,
  isSliderDragging,
  paced,
  SLIDER_APPLY_EVERY_MS,
  SLOW_APPLY_MS,
} from '../slider-input';

describe('paced', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('applies the first value at once, then at most one per interval, always ending on the latest', () => {
    const applied: number[] = [];
    const apply = paced((v) => applied.push(v));
    apply.soon(100);
    for (const v of [101, 102, 103, 104]) apply.soon(v);
    expect(applied).toEqual([100]);
    vi.advanceTimersByTime(SLIDER_APPLY_EVERY_MS);
    expect(applied).toEqual([100, 104]);
  });

  it('applies at once on letting go, and drops the step still waiting', () => {
    const applied: number[] = [];
    const apply = paced((v) => applied.push(v));
    apply.soon(100);
    apply.soon(150);
    apply.now(160);
    vi.advanceTimersByTime(SLIDER_APPLY_EVERY_MS * 2);
    expect(applied).toEqual([100, 160]);
  });

  it('does not apply on letting go a value the drag has just applied', () => {
    const applied: number[] = [];
    const apply = paced((v) => applied.push(v));
    apply.soon(120);
    apply.now(120);
    expect(applied).toEqual([120]);
  });

  it('applies a value typed or set after the drag, even one it applied before', () => {
    const applied: number[] = [];
    const apply = paced((v) => applied.push(v));
    apply.soon(120);
    vi.advanceTimersByTime(SLIDER_APPLY_EVERY_MS);
    apply.soon(140);
    vi.advanceTimersByTime(SLIDER_APPLY_EVERY_MS);
    apply.soon(120);
    expect(applied).toEqual([120, 140, 120]);
  });
});

describe('paced, on a slow book', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('once an apply has been slow, holds the drag and applies where the hand let go', () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const applied: number[] = [];
    const apply = paced((v) => {
      applied.push(v);
      clock += SLOW_APPLY_MS + 50; // a restyle of a very large chapter
    });
    apply.soon(100); // the first step applies, and is found slow
    clock += 1000;
    for (const v of [110, 120, 130]) apply.soon(v);
    vi.advanceTimersByTime(SLIDER_APPLY_EVERY_MS * 4);
    expect(applied).toEqual([100]);
    apply.now(130);
    expect(applied).toEqual([100, 130]);
  });

  it('on an ordinary book, keeps following the drag', () => {
    const applied: number[] = [];
    const apply = paced((v) => applied.push(v));
    apply.soon(100);
    vi.advanceTimersByTime(SLIDER_APPLY_EVERY_MS);
    apply.soon(110);
    expect(applied).toEqual([100, 110]);
  });
});

describe('a slider being dragged', () => {
  it('is marked from pointer down to pointer up, so a sync leaves it alone', () => {
    const slider = document.createElement('input');
    slider.type = 'range';
    const num = document.createElement('input');
    document.body.append(slider, num);
    bindRealTimeSliderInput(num, slider, 80, 300, 100, () => {});
    expect(isSliderDragging(slider)).toBe(false);
    slider.dispatchEvent(new Event('pointerdown'));
    expect(isSliderDragging(slider)).toBe(true);
    window.dispatchEvent(new Event('pointerup'));
    expect(isSliderDragging(slider)).toBe(false);
    slider.remove();
    num.remove();
  });
});

describe('applyStyleToLocalStorage', () => {
  it('writes every value of the style, then announces the whole style once', () => {
    const stored = new Map<string, string>();
    const announced: [string, string][] = [];
    const app = {
      saveLocalStorage: (key: string, value: string) => void stored.set(key, value),
      workspace: { trigger: (_name: string, key: string, value: string) => void announced.push([key, value]) },
    };
    const style = { ...DISPLAY_DEFAULTS, fontSize: 213, theme: 'sepia' };
    applyStyleToLocalStorage(app as never, style);
    expect(announced).toEqual([[DISPLAY_STYLE_APPLIED, '']]);
    for (const [key, value] of displayStyleEntries(style)) expect(stored.get(key)).toBe(value);
    expect(stored.size).toBe(9);
  });
});
