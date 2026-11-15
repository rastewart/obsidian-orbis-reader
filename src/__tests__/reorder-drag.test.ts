import { beforeAll, describe, expect, it, vi } from 'vitest';
import { reorderControls } from '../reorder-controls';
import { augmentDom, pointer, stubBand } from './dom-augment';

/**
 * Dropping a dragged row, through the controls every list uses.
 *
 * **Tested here rather than on `insertIndexAt` alone**, which already had tests and was not where the bug was: a drop
 * in a list that does not repaint saved the new order and left the screen showing the old one, because `wireListDrag`
 * reports a drop and touches no DOM. Both halves of that only meet in `reorderControls`, so this builds a real list
 * and drags a real row.
 */
beforeAll(() => {
  augmentDom();
});

const ROW_HEIGHT = 100;

function list(
  names: string[],
  opts: { inPlace?: boolean } = {}
): { parent: HTMLElement; move: ReturnType<typeof vi.fn> } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const drag = { from: null as number | null };
  const move = vi.fn();
  names.forEach((name, index) => {
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.dataset.name = name;
    stubBand(row, index * ROW_HEIGHT, ROW_HEIGHT);
    const control = document.createElement('div');
    control.className = 'setting-item-control';
    row.appendChild(control);
    parent.appendChild(row);
    reorderControls({
      row,
      into: control,
      key: name,
      index,
      count: names.length,
      labels: { up: 'Move up', down: 'Move down', drag: 'Drag to reorder' },
      drag,
      move,
      inPlace: opts.inPlace !== false,
    });
  });
  return { parent, move };
}

const order = (parent: HTMLElement): string[] =>
  Array.from(parent.querySelectorAll<HTMLElement>('.setting-item[data-name]')).map((el) => el.dataset.name ?? '');

/** Grab a row's handle and drop it at `y`. The threshold means a drag has to travel before it counts as one. */
function dragTo(parent: HTMLElement, name: string, y: number): void {
  const row = parent.querySelector<HTMLElement>(`[data-name="${name}"]`);
  const handle = row?.querySelector<HTMLElement>('.orbis-reorder-handle');
  if (!handle) throw new Error(`no handle on ${name}`);
  handle.dispatchEvent(pointer('pointerdown', 10));
  handle.dispatchEvent(pointer('pointermove', y));
  handle.dispatchEvent(pointer('pointerup', y));
}

describe('reorderControls, dropping a dragged row', () => {
  it('moves the row and reports the move', () => {
    const { parent, move } = list(['a', 'b', 'c']);
    dragTo(parent, 'a', 250);
    expect(order(parent)).toEqual(['b', 'a', 'c']);
    expect(move).toHaveBeenCalledWith(0, 1);
  });

  it('carries a row to the end', () => {
    const { parent, move } = list(['a', 'b', 'c']);
    dragTo(parent, 'a', 290);
    expect(order(parent)).toEqual(['b', 'c', 'a']);
    expect(move).toHaveBeenCalledWith(0, 2);
  });

  it('leaves the row where it was when it does not cross a midpoint', () => {
    const { parent, move } = list(['a', 'b', 'c']);
    dragTo(parent, 'a', 40);
    expect(order(parent)).toEqual(['a', 'b', 'c']);
    expect(move).not.toHaveBeenCalled();
  });

  // The ends stay honest without a repaint: the row now at the top must not offer to go further up.
  it('disables the arrows at the ends after a drop', () => {
    const { parent } = list(['a', 'b', 'c']);
    dragTo(parent, 'a', 250);
    const upOf = (name: string) =>
      parent.querySelector<HTMLButtonElement>(`[data-orbis-focus="order-up:${name}"]`)?.disabled;
    const downOf = (name: string) =>
      parent.querySelector<HTMLButtonElement>(`[data-orbis-focus="order-down:${name}"]`)?.disabled;
    expect(upOf('b')).toBe(true);
    expect(upOf('a')).toBe(false);
    expect(downOf('c')).toBe(true);
  });

  /**
   * A list in a dialog repaints instead, so the controls must NOT move the element: doing both would move the row
   * twice — once here and once by the caller's redraw — which is a two-place jump for a one-place drag.
   */
  it('leaves the DOM alone for a list that repaints', () => {
    const { parent, move } = list(['a', 'b', 'c'], { inPlace: false });
    dragTo(parent, 'a', 250);
    expect(order(parent)).toEqual(['a', 'b', 'c']);
    expect(move).toHaveBeenCalledWith(0, 1);
  });
});
