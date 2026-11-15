// Where a display slider starts, in the two units it has to keep straight.
//
// Line spacing is the row that exposes both faults, because it is the only one with a `scale`: its slider runs
// 10..30 in tenths while its value runs 1.0..3.0. Everywhere else the two units are the same number, so only an
// empty store on this row shows a mix-up.

import { describe, expect, it } from 'vitest';
import { sliderStart } from '../ui-utils';

/** Line spacing: slider units are tenths of the value. */
const tenths = (v: number) => Math.round(v * 10);
/** Every other slider: the units are the same. */
const same = (v: number) => v;

describe('sliderStart', () => {
  it('reads a stored value and puts the thumb at its slider position', () => {
    expect(sliderStart('1.5', 1.5, tenths)).toEqual({ stored: 1.5, shown: 15 });
    expect(sliderStart('220', 100, same)).toEqual({ stored: 220, shown: 220 });
  });

  /**
   * The fallback is in value units. Running slider units through the wrong transform would give line spacing
   * `stored: 100` on an empty store, a field reading "100.0" and a thumb pinned to the right of a 1.0–3.0 range.
   */
  it('falls back in VALUE units, not slider units', () => {
    expect(sliderStart(null, 1.5, tenths)).toEqual({ stored: 1.5, shown: 15 });
  });

  /**
   * The other half, which applies to every row: the fallback has to be the value the BOOK uses. Falling back to the
   * slider's `min` would show brightness 20 over a book rendering at 100 — and the sample at the bottom of the same
   * page, which reads the real defaults, would disagree with the controls above it.
   */
  it('falls back to the default it was given, which is never assumed to be the minimum', () => {
    expect(sliderStart(null, 100, same).stored).toBe(100);
    expect(sliderStart(null, 3, same).stored).toBe(3);
  });

  // A key holding something unparseable is the same situation as an empty one: nothing usable is stored.
  it('treats a value it cannot read as nothing stored', () => {
    expect(sliderStart('', 1.5, tenths).stored).toBe(1.5);
    expect(sliderStart('wide', 100, same).stored).toBe(100);
  });

  it('keeps a stored zero, which is a real answer for margins', () => {
    expect(sliderStart('0', 3, same)).toEqual({ stored: 0, shown: 0 });
  });
});
