import { describe, expect, it } from 'vitest';
import { moveRowAmongRows, moveRowToIndex, reorderRowsAround, syncReorderEnds } from '../ui-utils';

/**
 * A reorderable settings list as Obsidian renders one: rows that carry move arrows, sharing a parent with furniture
 * that must never be swapped with — a heading above them, an "add" row below, dividers in between.
 *
 * Plain `document.createElement` because `createDiv()` is one of Obsidian's DOM augmentations and does not exist
 * under jsdom — same reason as `bar-keys.test.ts`.
 */
function list(names: string[], opts: { dividers?: boolean } = {}): { parent: HTMLElement; rows: HTMLElement[] } {
  const parent = document.createElement('div');
  const heading = document.createElement('div');
  heading.className = 'setting-item-heading';
  parent.appendChild(heading);
  const rows = names.map((name, i) => {
    if (opts.dividers && i > 0) parent.appendChild(document.createElement('hr'));
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.dataset.name = name;
    for (const dir of ['up', 'down']) {
      const btn = document.createElement('button');
      btn.dataset.orbisFocus = `order-${dir}:${name}`;
      row.appendChild(btn);
    }
    parent.appendChild(row);
    return row;
  });
  const add = document.createElement('div');
  add.className = 'setting-item'; // an "add" row: a row, but not one with arrows
  parent.appendChild(add);
  document.body.appendChild(parent);
  return { parent, rows };
}

const order = (parent: HTMLElement): string[] =>
  Array.from(parent.querySelectorAll<HTMLElement>('.setting-item[data-name]')).map((el) => el.dataset.name ?? '');

describe('reorderRowsAround', () => {
  /** Two lists sharing a parent: a row must only ever count its OWN list's rows. */
  it('separates two lists that share a parent', () => {
    const { parent, rows } = list(['a', 'b', 'c']);
    for (const r of rows) r.dataset.orbisList = 'first';
    const second = list(['x', 'y']);
    for (const r of second.rows) {
      r.dataset.orbisList = 'second';
      parent.appendChild(r);
    }
    expect(reorderRowsAround(rows[1])).toEqual(rows);
    expect(reorderRowsAround(second.rows[0])).toEqual(second.rows);
    expect(moveRowAmongRows(second.rows[0], false)).toEqual({ from: 0, to: 1 });
  });

  it('sees only the rows with arrows, in screen order', () => {
    const { parent, rows } = list(['a', 'b', 'c']);
    expect(reorderRowsAround(rows[1])).toEqual([rows[0], rows[1], rows[2]]);
    expect(parent.children.length).toBe(5); // heading + three rows + the add row
  });

  it('ignores furniture between the rows', () => {
    const { rows } = list(['a', 'b', 'c'], { dividers: true });
    expect(reorderRowsAround(rows[2])).toEqual([rows[0], rows[1], rows[2]]);
  });
});

describe('moveRowAmongRows', () => {
  it('moves a row up', () => {
    const { parent, rows } = list(['a', 'b', 'c']);
    expect(moveRowAmongRows(rows[1], true)).toEqual({ from: 1, to: 0 });
    expect(order(parent)).toEqual(['b', 'a', 'c']);
  });

  /** The bug this file exists for: "down" moved the row BELOW the pressed one, which repainted differently from up. */
  it('moves a row down', () => {
    const { parent, rows } = list(['a', 'b', 'c']);
    expect(moveRowAmongRows(rows[1], false)).toEqual({ from: 1, to: 2 });
    expect(order(parent)).toEqual(['a', 'c', 'b']);
  });

  it('moves the last row up, and the first row down', () => {
    const { parent, rows } = list(['a', 'b', 'c']);
    expect(moveRowAmongRows(rows[2], true)).toEqual({ from: 2, to: 1 });
    expect(order(parent)).toEqual(['a', 'c', 'b']);
    expect(moveRowAmongRows(rows[0], false)).toEqual({ from: 0, to: 1 });
    expect(order(parent)).toEqual(['c', 'a', 'b']);
  });

  it('moves past furniture without disturbing the ends of the list', () => {
    const { parent, rows } = list(['a', 'b', 'c'], { dividers: true });
    expect(moveRowAmongRows(rows[0], false)).toEqual({ from: 0, to: 1 });
    expect(order(parent)).toEqual(['b', 'a', 'c']);
    expect(parent.firstElementChild?.className).toBe('setting-item-heading');
    expect(parent.lastElementChild?.className).toBe('setting-item');
  });

  it('refuses to move off either end, leaving the order alone', () => {
    const { parent, rows } = list(['a', 'b', 'c']);
    expect(moveRowAmongRows(rows[0], true)).toBeNull();
    expect(moveRowAmongRows(rows[2], false)).toBeNull();
    expect(order(parent)).toEqual(['a', 'b', 'c']);
  });

  /** Moving an element in the DOM blurs it — the keyboard has to be picked back up, or a reorder ends nowhere. */
  it('keeps focus on the control that was pressed', () => {
    const { rows } = list(['a', 'b', 'c']);
    const down = rows[1].querySelector<HTMLButtonElement>('[data-orbis-focus^="order-down:"]');
    down?.focus();
    expect(document.activeElement).toBe(down);
    expect(moveRowAmongRows(rows[1], false)).toEqual({ from: 1, to: 2 });
    expect(document.activeElement).toBe(down);
  });

  /**
   * The bug that outlived every other one here: a caller that trusted the index a row was RENDERED at wrote the
   * wrong entry once the row had already moved. Two moves in one direction is the shortest way to show it.
   */
  it('reports positions from the DOM, so a row moved twice reports where it actually is', () => {
    const { parent, rows } = list(['a', 'b', 'c']);
    expect(moveRowAmongRows(rows[0], false)).toEqual({ from: 0, to: 1 });
    expect(moveRowAmongRows(rows[0], false)).toEqual({ from: 1, to: 2 });
    expect(order(parent)).toEqual(['b', 'c', 'a']);
    expect(moveRowAmongRows(rows[0], true)).toEqual({ from: 2, to: 1 });
    expect(order(parent)).toEqual(['b', 'a', 'c']);
  });

  it('refuses a row with no parent', () => {
    expect(moveRowAmongRows(document.createElement('div'), true)).toBeNull();
  });
});

describe('syncReorderEnds', () => {
  const arrows = (row: HTMLElement) => ({
    up: row.querySelector<HTMLButtonElement>('[data-orbis-focus^="order-up:"]'),
    down: row.querySelector<HTMLButtonElement>('[data-orbis-focus^="order-down:"]'),
  });

  it('disables only the arrows at the ends', () => {
    const { rows } = list(['a', 'b', 'c']);
    syncReorderEnds(rows[1]);
    expect(arrows(rows[0]).up?.disabled).toBe(true);
    expect(arrows(rows[0]).down?.disabled).toBe(false);
    expect(arrows(rows[1]).up?.disabled).toBe(false);
    expect(arrows(rows[1]).down?.disabled).toBe(false);
    expect(arrows(rows[2]).down?.disabled).toBe(true);
  });

  /** Moving DOWN through the middle of a list has to leave the keyboard on the DOWN arrow, or the next press is a
   *  different control — the asymmetry that made repeated down-moves impossible while up-moves worked. */
  it('leaves focus alone when the pressed arrow is still usable', () => {
    const { rows } = list(['a', 'b', 'c', 'd']);
    const down = arrows(rows[0]).down;
    down?.focus();
    expect(moveRowAmongRows(rows[0], false)).toEqual({ from: 0, to: 1 });
    syncReorderEnds(rows[0]);
    expect(document.activeElement).toBe(down);
    expect(down?.disabled).toBe(false);
  });

  it('hops to the other arrow in the row when the pressed one goes dead', () => {
    const { rows } = list(['a', 'b', 'c']);
    const { up, down } = arrows(rows[2]);
    down?.focus();
    expect(moveRowAmongRows(rows[2], true)).toEqual({ from: 2, to: 1 });
    expect(moveRowAmongRows(rows[2], true)).toEqual({ from: 1, to: 0 });
    syncReorderEnds(rows[2]);
    expect(down?.disabled).toBe(false);
    expect(up?.disabled).toBe(true); // it reached the top
    expect(document.activeElement).toBe(down);
  });
});

describe('moveRowToIndex', () => {
  it('moves a row down to a distant position', () => {
    const { parent, rows } = list(['a', 'b', 'c', 'd']);
    expect(moveRowToIndex(rows[0], 2)).toEqual({ from: 0, to: 2 });
    expect(order(parent)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a row up to a distant position', () => {
    const { parent, rows } = list(['a', 'b', 'c', 'd']);
    expect(moveRowToIndex(rows[3], 1)).toEqual({ from: 3, to: 1 });
    expect(order(parent)).toEqual(['a', 'd', 'b', 'c']);
  });

  /** The index the row was rendered at is stale after any move, so `from` has to come from the DOM. */
  it('reports where the row actually is, not where it started', () => {
    const { parent, rows } = list(['a', 'b', 'c', 'd']);
    expect(moveRowAmongRows(rows[0], false)).toEqual({ from: 0, to: 1 });
    expect(moveRowToIndex(rows[0], 3)).toEqual({ from: 1, to: 3 });
    expect(order(parent)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('refuses a position that is not a row, or the row it is already at', () => {
    const { parent, rows } = list(['a', 'b', 'c']);
    expect(moveRowToIndex(rows[1], 1)).toBeNull();
    expect(moveRowToIndex(rows[1], 9)).toBeNull();
    expect(moveRowToIndex(rows[1], -1)).toBeNull();
    expect(order(parent)).toEqual(['a', 'b', 'c']);
  });
});
