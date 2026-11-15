import { describe, expect, it } from 'vitest';
import { SelectionHold } from '../reader/selection-hold';

describe('SelectionHold', () => {
  it('holds the saved position while the page width stays the same', () => {
    const hold = new SelectionHold();
    hold.save({ pos: 900, size: 900 });
    // iOS scrolled to follow a selection handle; the hold puts the page back.
    expect(hold.frame({ pos: 1350, size: 900 })).toEqual({ kind: 'hold', pos: 900 });
  });

  // Forcing portrait pixels onto a landscape page left the book showing half of its title page.
  it('stops forcing the old pixels when the page width changes, and holds where the new layout settles', () => {
    const hold = new SelectionHold();
    hold.save({ pos: 900, size: 900 });
    expect(hold.frame({ pos: 900, size: 2000 }).kind).toBe('relayout');
    expect(hold.frame({ pos: 2000, size: 2000 }).kind).toBe('wait');
    expect(hold.frame({ pos: 2000, size: 2000 }).kind).toBe('wait');
    expect(hold.frame({ pos: 2000, size: 2000 })).toEqual({
      kind: 'moved',
      from: { pos: 900, size: 900 },
      to: { pos: 2000, size: 2000 },
      frames: 3,
    });
    expect(hold.frame({ pos: 2600, size: 2000 })).toEqual({ kind: 'hold', pos: 2000 });
  });

  it('asks for the selection to be shown once per width change, not on every frame of it', () => {
    const hold = new SelectionHold();
    hold.save({ pos: 900, size: 900 });
    const kinds = [
      hold.frame({ pos: 900, size: 2000 }),
      hold.frame({ pos: 2000, size: 2000 }),
      hold.frame({ pos: 2000, size: 2000 }),
      hold.frame({ pos: 2000, size: 2000 }),
    ].map((f) => f.kind);
    expect(kinds).toEqual(['relayout', 'wait', 'wait', 'moved']);
  });

  it('keeps waiting while the width is still changing', () => {
    const hold = new SelectionHold();
    hold.save({ pos: 900, size: 900 });
    hold.frame({ pos: 900, size: 1500 });
    hold.frame({ pos: 1500, size: 1500 });
    hold.frame({ pos: 1500, size: 1500 });
    // The rotation animation is not over: a new width starts the count again.
    expect(hold.frame({ pos: 2000, size: 2000 }).kind).toBe('wait');
    expect(hold.frame({ pos: 2000, size: 2000 }).kind).toBe('wait');
    expect(hold.frame({ pos: 2000, size: 2000 }).kind).toBe('moved');
  });

  it('takes wherever the page is if the layout never settles', () => {
    const hold = new SelectionHold();
    hold.save({ pos: 0, size: 900 });
    hold.frame({ pos: 0, size: 1000 });
    let last = hold.frame({ pos: 1, size: 1000 });
    for (let i = 2; last.kind === 'wait' && i < 100; i++) last = hold.frame({ pos: i, size: 1000 });
    expect(last).toMatchObject({ kind: 'moved', frames: 30 });
  });

  it('forgets a layout change it was waiting out once the selection ends', () => {
    const hold = new SelectionHold();
    hold.save({ pos: 900, size: 900 });
    hold.frame({ pos: 900, size: 2000 });
    hold.release();
    hold.save({ pos: 4000, size: 2000 });
    expect(hold.frame({ pos: 4100, size: 2000 })).toEqual({ kind: 'hold', pos: 4000 });
  });
});
