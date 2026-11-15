import { describe, expect, it } from 'vitest';
import type { ReaderContext } from '../reader/ReaderContext';
import { ReaderDom } from '../reader/ReaderDom';

/** A reader with nothing selected unless `selected` says so, and a record of every page it turned. */
const reader = (keyboardPageTurn: boolean, selected = false) => {
  const turned: number[] = [];
  let hasSelection = selected;
  const ctx = {
    keyboardPageTurn,
    clearSelection: () => {
      const had = hasSelection;
      hasSelection = false;
      return had;
    },
    turnPage: (d: 1 | -1) => turned.push(d),
  } as unknown as ReaderContext;
  return { dom: new ReaderDom(ctx), turned };
};

const press = (key: string) => new KeyboardEvent('keydown', { key, cancelable: true });

describe('the page keys', () => {
  it('turn the page with the setting on', () => {
    const { dom, turned } = reader(true);
    for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' '])
      expect(dom.turnPageFor(press(key))).toBe(true);
    expect(turned).toEqual([1, -1, 1, -1, 1]);
  });

  // Turned off, none of them turns the page — the arrows included, which are still let in only to end a selection.
  it('turn nothing with the setting off, and leave the key to whatever else is bound to it', () => {
    const { dom, turned } = reader(false);
    for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' ']) {
      const e = press(key);
      expect(dom.turnPageFor(e)).toBe(false);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(turned).toEqual([]);
  });

  it('still let an arrow end a selection with the setting off', () => {
    const { dom, turned } = reader(false, true);
    expect(dom.turnPageFor(press('ArrowRight'))).toBe(true);
    expect(turned).toEqual([]);
  });
});
