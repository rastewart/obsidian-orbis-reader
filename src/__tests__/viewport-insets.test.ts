import { beforeEach, describe, expect, it } from 'vitest';
import {
  bottomClearance,
  forgetSystemBar,
  rememberedSystemBar,
  sampleSystemBar,
  systemBarBelow,
  type ViewportSample,
} from '../reader/viewport-insets';

const sample = (over: Partial<ViewportSample> = {}): ViewportSample => ({
  innerHeight: 800,
  clientHeight: 800,
  visualHeight: 800,
  visualOffsetTop: 0,
  safeTop: 0,
  safeBottom: 0,
  ...over,
});

describe('bottomClearance', () => {
  /**
   * **The bug, as numbers.** Android reports no safe-area inset, so the only evidence that a navigation bar is now
   * overlapping us is that the layout viewport grew when the overlay turned on.
   */
  it('takes the growth when the platform reports no inset', () => {
    expect(bottomClearance(sample({ innerHeight: 800 }), sample({ innerHeight: 848 }))).toBe(48);
  });

  /**
   * **A platform that answers is believed.** iOS reports a real inset for the home indicator, and that number
   * describes the device rather than being inferred from a resize that a keyboard could also have caused.
   */
  it('prefers the platform’s own inset over the measurement', () => {
    const after = sample({ innerHeight: 848, safeBottom: 34 });
    expect(bottomClearance(sample({ innerHeight: 800 }), after)).toBe(34);
  });

  it('reserves nothing when the viewport did not change — a desktop, or a build that never overlays', () => {
    expect(bottomClearance(sample(), sample())).toBe(0);
  });

  it('reserves nothing when the viewport shrank, which no system bar can cause', () => {
    expect(bottomClearance(sample({ innerHeight: 800 }), sample({ innerHeight: 700 }))).toBe(0);
  });

  /**
   * **A keyboard resizes this viewport too**, and it is far bigger than any pair of system bars. Reserving a
   * keyboard's height at the bottom of the page would be worse than reserving nothing, so an implausible growth
   * is discarded rather than trusted.
   */
  it('discards a growth too large to be system bars', () => {
    expect(bottomClearance(sample({ innerHeight: 500 }), sample({ innerHeight: 900 }))).toBe(0);
  });

  it('accepts a growth at the edge of plausible, and rejects one past it', () => {
    expect(bottomClearance(sample({ innerHeight: 800 }), sample({ innerHeight: 960 }))).toBe(160);
    expect(bottomClearance(sample({ innerHeight: 800 }), sample({ innerHeight: 961 }))).toBe(0);
  });
});

describe('systemBarBelow', () => {
  const win = (opts: { innerHeight: number; navbar?: { bottom: number; height: number } }): Window => {
    const bar = opts.navbar;
    return {
      innerHeight: opts.innerHeight,
      document: {
        querySelector: () =>
          bar ? { getBoundingClientRect: () => ({ bottom: bar.bottom, height: bar.height }) } : null,
      },
    } as unknown as Window;
  };

  /**
   * **The measurement that works.** Obsidian keeps its navbar clear of Android's system bar, so the gap under it
   * is that bar — an absolute reading, where watching for the viewport to resize found nothing because Obsidian
   * mobile is already edge to edge.
   */
  it('reads the gap between Obsidian’s navbar and the bottom of the viewport', () => {
    expect(systemBarBelow(win({ innerHeight: 900, navbar: { bottom: 852, height: 48 } }))).toBe(48);
  });

  it('answers 0 on a desktop, where there is no navbar at all', () => {
    expect(systemBarBelow(win({ innerHeight: 900 }))).toBe(0);
  });

  /** A hidden element measures 0 in every direction, which would read as a navbar flush with the bottom. */
  it('answers 0 for a navbar that is already hidden, rather than trusting its zero rect', () => {
    expect(systemBarBelow(win({ innerHeight: 900, navbar: { bottom: 0, height: 0 } }))).toBe(0);
  });

  it('answers 0 when the navbar already sits on the bottom — gesture navigation with nothing reserved', () => {
    expect(systemBarBelow(win({ innerHeight: 900, navbar: { bottom: 900, height: 48 } }))).toBe(0);
  });

  it('discards an implausible gap, the same bound the inferred path uses', () => {
    expect(systemBarBelow(win({ innerHeight: 900, navbar: { bottom: 700, height: 48 } }))).toBe(0);
  });
});

describe('rememberedSystemBar', () => {
  const win = (navbar?: { bottom: number; height: number }): Window =>
    ({
      innerHeight: 900,
      document: {
        querySelector: () =>
          navbar ? { getBoundingClientRect: () => ({ bottom: navbar.bottom, height: navbar.height }) } : null,
      },
    }) as unknown as Window;

  beforeEach(() => forgetSystemBar());

  /**
   * **The whole reason this exists.** `systemBarBelow` reads Obsidian's navbar, and both a soft keyboard and
   * focus mode itself hide that element — so the reading is unavailable at exactly the moment focus mode wants
   * it. A page turn samples it while neither is true; this is what that sample is for.
   */
  it('answers with the last good reading when the current one is unavailable', () => {
    sampleSystemBar(win({ bottom: 854, height: 46 }));
    expect(rememberedSystemBar(win())).toBe(46);
  });

  it('answers 0 while it has never had a reading — a desktop stays a desktop', () => {
    expect(rememberedSystemBar(win())).toBe(0);
  });

  /** Switching Android between gesture and three-button navigation corrects on the next page turn. */
  it('prefers a reading it can take now over the remembered one', () => {
    sampleSystemBar(win({ bottom: 854, height: 46 }));
    expect(rememberedSystemBar(win({ bottom: 888, height: 12 }))).toBe(12);
    expect(rememberedSystemBar(win())).toBe(12);
  });

  it('never remembers a zero, which is "could not read it" rather than "there is none"', () => {
    sampleSystemBar(win({ bottom: 854, height: 46 }));
    sampleSystemBar(win());
    expect(rememberedSystemBar(win())).toBe(46);
  });
});
