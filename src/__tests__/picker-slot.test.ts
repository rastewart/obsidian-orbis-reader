// One annotation bar in the document at a time, owned by whoever is showing it.
//
// The sequence in the second test is the reported bug: two sections set up, then a selection in the FIRST one.

import { beforeEach, describe, expect, it } from 'vitest';
import { claimPickerSlot } from '../reader/picker-slot';

let body: HTMLElement;
const bar = (id: string): HTMLElement => {
  const el = document.createElement('div');
  el.dataset.section = id;
  return el;
};

beforeEach(() => {
  body = document.createElement('div');
});

describe('claiming the annotation bar slot', () => {
  it('attaches a bar that has never been shown', () => {
    const a = bar('a');
    expect(claimPickerSlot(body, a, undefined)).toBe(a);
    expect(a.parentElement).toBe(body);
  });

  /**
   * **The reported bug.** Section A is set up, then section B — a neighbor rendered, or a reflow re-rendering one.
   * Selections are dispatched per document, so selecting in A opens A's bar. Under the old rule B's setup had
   * already taken A's bar out of the DOM, and A's bar was then positioned, made visible, and invisible: a detached
   * element has no layout. Showing has to be what claims the slot.
   */
  it('gives the slot back to a section whose bar was taken out by a later one', () => {
    const a = bar('a');
    const b = bar('b');
    let held = claimPickerSlot(body, a, undefined);
    held = claimPickerSlot(body, b, held);
    expect(a.parentElement).toBeNull(); // B has it now

    held = claimPickerSlot(body, a, held);
    expect(held).toBe(a);
    expect(a.parentElement).toBe(body); // and A can be shown again
    expect(b.parentElement).toBeNull();
  });

  it('never leaves two bars in the document', () => {
    let held = claimPickerSlot(body, bar('a'), undefined);
    for (const id of ['b', 'c', 'd']) held = claimPickerSlot(body, bar(id), held);
    expect(body.children.length).toBe(1);
  });

  /**
   * Re-appending a node already in place is a MOVE, and moving an element drops focus out of it — which the bar
   * takes deliberately on open, so it can answer Escape.
   */
  it('leaves an already-held bar exactly where it is', () => {
    const a = bar('a');
    claimPickerSlot(body, a, undefined);
    const marker = document.createElement('span');
    body.appendChild(marker);
    claimPickerSlot(body, a, a);
    expect(body.children[0]).toBe(a); // not moved to the end
    expect(body.children[1]).toBe(marker);
  });
});
