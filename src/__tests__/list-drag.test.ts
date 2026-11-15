import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX, insertIndexAt, isDragIntent, type RowBand } from '../list-drag';

/** Four 40px rows starting at y=100, with no gaps — the ordinary case. */
const rows: RowBand[] = [
  { top: 100, bottom: 140 },
  { top: 140, bottom: 180 },
  { top: 180, bottom: 220 },
  { top: 220, bottom: 260 },
];

describe('isDragIntent', () => {
  it('ignores the wobble of a press', () => {
    expect(isDragIntent(200, 200)).toBe(false);
    expect(isDragIntent(200, 200 + DRAG_THRESHOLD_PX - 1)).toBe(false);
  });

  it('accepts a deliberate move, in either direction', () => {
    expect(isDragIntent(200, 200 + DRAG_THRESHOLD_PX)).toBe(true);
    expect(isDragIntent(200, 200 - DRAG_THRESHOLD_PX)).toBe(true);
  });
});

describe('insertIndexAt', () => {
  /** The behavior the row-under-the-pointer version could not give: one place per row crossed. */
  it('changes slot at each midpoint, so crossing one boundary moves one place', () => {
    expect(insertIndexAt(101, rows)).toBe(0); // top of the first row
    expect(insertIndexAt(119, rows)).toBe(0); // still above its midpoint
    expect(insertIndexAt(121, rows)).toBe(1); // just past it
    expect(insertIndexAt(159, rows)).toBe(1);
    expect(insertIndexAt(161, rows)).toBe(2);
  });

  it('resolves the ends to before-the-first and after-the-last', () => {
    expect(insertIndexAt(0, rows)).toBe(0);
    expect(insertIndexAt(9999, rows)).toBe(rows.length);
  });

  it('has no slot in an empty list', () => {
    expect(insertIndexAt(100, [])).toBe(0);
  });
});
