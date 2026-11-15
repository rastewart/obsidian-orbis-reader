// Stored locations onto the index's numbering, run on every open: only what changed is touched, so an open with
// nothing to correct writes nothing.

import { describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../progress';
import { restampLocs } from '../reader/restamp-locs';

const locs: Record<string, number> = { anchorA: 12, pageB: 30, anchorC: 41 };
const getLoc = (cfi: string): number | undefined => locs[cfi];

function bookmarks(all: Bookmark[]) {
  return { all, replaceAll: vi.fn() };
}

describe('restampLocs', () => {
  it('moves a bookmark onto where its anchor begins, and renames it to match', () => {
    const b = bookmarks([
      { id: '1', cfi: 'pageA', anchorCfi: 'anchorA', label: 'Ch 1 · loc. 11', chapter: 'Ch 1', loc: 11, createdAt: 1 },
    ]);
    expect(restampLocs(getLoc, { remapLocs: () => 0 }, b)).toBe(1);
    expect(b.replaceAll).toHaveBeenCalledWith([expect.objectContaining({ loc: 12, label: 'Ch 1 · loc. 12' })]);
  });

  it('places a bookmark from before anchors by its page', () => {
    const b = bookmarks([{ id: '1', cfi: 'pageB', label: 'loc. 29', loc: 29, createdAt: 1 }]);
    restampLocs(getLoc, { remapLocs: () => 0 }, b);
    expect(b.replaceAll).toHaveBeenCalledWith([expect.objectContaining({ loc: 30, label: 'loc. 30' })]);
  });

  it('writes nothing when every number is already right, and counts the passages and notes it changed', () => {
    const b = bookmarks([{ id: '1', cfi: 'pageC', anchorCfi: 'anchorC', label: 'loc. 41', loc: 41, createdAt: 1 }]);
    const remapLocs = vi.fn(() => 3);
    expect(restampLocs(getLoc, { remapLocs }, b)).toBe(3);
    expect(remapLocs).toHaveBeenCalledWith(getLoc);
    expect(b.replaceAll).not.toHaveBeenCalled();
  });
});
