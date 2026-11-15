// Whether any second-level surface is on screen — the one question the top of the reader turns on.
//
// **A bar and the floating history back/forward pair cannot share that space.** The pair sits at `top: 8px` over
// the book; the bars are of different heights by design (the Display Styles bar is deliberately minimal to leave
// room for its third level). So a tall bar covers the pair completely and a short one clips it, leaving a sliver
// of two buttons showing; every bar has to hide the pair, not just one.
//
// The class is derived from `anyOpen()`, which is what these cover: the answer, and the failure a remembered
// version would have.

import { describe, expect, it, vi } from 'vitest';
import { type ClosableBar, SecondaryBarRegistry } from '../reader/SecondaryBar';

/** A surface whose `isOpen()` reads its own state, exactly as every real one does. */
function surface(open = false): ClosableBar & { open: () => void } {
  let shown = open;
  return {
    isOpen: () => shown,
    close: () => {
      shown = false;
    },
    open: () => {
      shown = true;
    },
  };
}

describe('anyOpen', () => {
  it('is false with nothing registered', () => {
    expect(new SecondaryBarRegistry().anyOpen()).toBe(false);
  });

  it('is false while every surface is closed', () => {
    const reg = new SecondaryBarRegistry();
    reg.register(surface());
    reg.register(surface());
    expect(reg.anyOpen()).toBe(false);
  });

  it('is true when any one of them is open', () => {
    const reg = new SecondaryBarRegistry();
    const search = surface();
    reg.register(search);
    reg.register(surface());
    search.open();
    expect(reg.anyOpen()).toBe(true);
  });

  /**
   * **A remembered answer strands.** A host class a bar adds and removes along its own paths stays set when one
   * path hides the bar without clearing it — and the history buttons stay invisible for the rest of the session. A
   * derived answer cannot strand: it reads the surface, so hiding by any route is visible to it immediately.
   */
  it('follows a surface that hides itself without telling anyone', () => {
    const reg = new SecondaryBarRegistry();
    const bar = surface();
    reg.register(bar);
    bar.open();
    expect(reg.anyOpen()).toBe(true);
    bar.close(); // no `changed()` call — the state moved behind the registry's back
    expect(reg.anyOpen()).toBe(false);
  });

  it('stops counting a surface once it is unregistered', () => {
    const reg = new SecondaryBarRegistry();
    const bar = surface(true);
    reg.register(bar);
    expect(reg.anyOpen()).toBe(true);
    reg.unregister(bar);
    expect(reg.anyOpen()).toBe(false);
  });

  /** Four surfaces register in the reader; only one is open at a time, and it must not matter which. */
  it('is true for whichever surface is the open one', () => {
    const reg = new SecondaryBarRegistry();
    const bars = [surface(), surface(), surface(), surface()];
    for (const b of bars) reg.register(b);
    for (const b of bars) {
      b.open();
      expect(reg.anyOpen()).toBe(true);
      b.close();
      expect(reg.anyOpen()).toBe(false);
    }
  });
});

describe('changed', () => {
  it('runs the listener so it can re-read the answer', () => {
    const reg = new SecondaryBarRegistry();
    const bar = surface();
    reg.register(bar);
    const seen: boolean[] = [];
    reg.onChanged = () => seen.push(reg.anyOpen());
    bar.open();
    reg.changed();
    bar.close();
    reg.changed();
    expect(seen).toEqual([true, false]);
  });

  it('is harmless with no listener', () => {
    expect(() => new SecondaryBarRegistry().changed()).not.toThrow();
  });
});

describe('closeOthers', () => {
  it('closes every open surface but the one being opened', () => {
    const reg = new SecondaryBarRegistry();
    const keep = surface(true);
    const other = surface(true);
    reg.register(keep);
    reg.register(other);
    reg.closeOthers(keep);
    expect(keep.isOpen()).toBe(true);
    expect(other.isOpen()).toBe(false);
  });

  /** Only the open ones are asked to close — a closed surface's `close()` may do real work. */
  it('leaves an already-closed surface alone', () => {
    const reg = new SecondaryBarRegistry();
    const keep = surface(true);
    const shut = { isOpen: () => false, close: vi.fn() };
    reg.register(keep);
    reg.register(shut);
    reg.closeOthers(keep);
    expect(shut.close).not.toHaveBeenCalled();
  });
});
