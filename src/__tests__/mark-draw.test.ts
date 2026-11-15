import type { OverlayRect } from 'foliate-js/overlayer.js';
import { describe, expect, it } from 'vitest';
import { mergeLineRects } from '../reader/mark-draw';

/** A client rect, built the way an engine reports one: position plus derived width/height. */
function rect(left: number, top: number, width: number, height = 20): OverlayRect {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

describe('mergeLineRects', () => {
  it('joins the run fragments WebKit splits a line into', () => {
    // The iPad case: one line reported as two runs, which would draw two boxes with a seam between them.
    const merged = mergeLineRects([rect(0, 100, 120), rect(120, 100, 200)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ left: 0, right: 320, width: 320, top: 100, bottom: 120 });
  });

  it('keeps consecutive lines apart', () => {
    // The whole point of merging by overlap rather than proximity: adjacent lines must never join, or a
    // three-line selection would draw one box over the paragraph.
    expect(mergeLineRects([rect(0, 100, 300), rect(0, 120, 300)])).toHaveLength(2);
  });

  it('tolerates a rect that is slightly taller — a bigger glyph on the same line', () => {
    const merged = mergeLineRects([rect(0, 100, 100, 20), rect(100, 96, 100, 24)]);
    expect(merged).toHaveLength(1);
    // The union spans both, so a box drawn from it encloses the tall glyph too.
    expect(merged[0]).toMatchObject({ top: 96, bottom: 120, height: 24 });
  });

  it('does not care what order the engine reported them in', () => {
    const merged = mergeLineRects([rect(120, 100, 200), rect(0, 140, 80), rect(0, 100, 120)]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ top: 100, left: 0, right: 320 });
    expect(merged[1]).toMatchObject({ top: 140, left: 0, right: 80 });
  });

  it('leaves an already-merged single rect per line alone (Chromium)', () => {
    // Chromium reports one rect per line, so merging has to be a no-op there.
    const input = [rect(0, 100, 300), rect(0, 130, 300), rect(0, 160, 140)];
    expect(mergeLineRects(input)).toEqual(input);
  });

  it('returns a new array and never mutates the caller’s rects', () => {
    const input = [rect(0, 100, 120), rect(120, 100, 200)];
    const copy = structuredClone(input);
    mergeLineRects(input);
    expect(input).toEqual(copy);
  });

  it('handles the empty case, which is what a range with no boxes reports', () => {
    expect(mergeLineRects([])).toEqual([]);
  });
});
