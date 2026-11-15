import { describe, expect, it } from 'vitest';
import type { Bookmark } from '../progress';
import { findCurrentBookmark } from '../reader/bookmark-utils';

let n = 0;
function bm(partial: Partial<Bookmark>): Bookmark {
  n += 1;
  return {
    id: `id${n}`,
    cfi: partial.cfi ?? 'cfi',
    label: partial.label ?? 'Bookmark',
    createdAt: partial.createdAt ?? n,
    ...partial,
  };
}

describe('findCurrentBookmark', () => {
  it('matches by exactCfi (ground truth)', () => {
    const target = bm({ exactCfi: 'CFI-A' });
    const bookmarks = [bm({ exactCfi: 'CFI-B' }), target];
    expect(findCurrentBookmark(bookmarks, 'CFI-A', null)).toBe(target);
  });

  it('prefers the exactCfi match over a page-number match', () => {
    const byCfi = bm({ exactCfi: 'CFI-A', loc: 99 });
    const byLoc = bm({ loc: 5 });
    expect(findCurrentBookmark([byLoc, byCfi], 'CFI-A', { current: 5 })).toBe(byCfi);
  });

  it('never falls back to page number for a bookmark that has an exactCfi', () => {
    // exactCfi present but does NOT match the current CFI; its loc matches — must be ignored.
    const stale = bm({ exactCfi: 'CFI-OTHER', loc: 5 });
    expect(findCurrentBookmark([stale], 'CFI-CURRENT', { current: 5 })).toBeNull();
  });

  it('falls back to page number only for legacy bookmarks (no exactCfi)', () => {
    const legacy = bm({ loc: 5 }); // no exactCfi
    expect(findCurrentBookmark([legacy], 'CFI-CURRENT', { current: 5 })).toBe(legacy);
  });

  it('returns null when nothing matches', () => {
    const bookmarks = [bm({ exactCfi: 'CFI-A', loc: 1 }), bm({ loc: 2 })];
    expect(findCurrentBookmark(bookmarks, 'CFI-Z', { current: 99 })).toBeNull();
  });

  it('uses the loc fallback when there is no current CFI', () => {
    const legacy = bm({ loc: 7 });
    expect(findCurrentBookmark([legacy], null, { current: 7 })).toBe(legacy);
  });

  it('returns null when there is no CFI and no location', () => {
    expect(findCurrentBookmark([bm({ exactCfi: 'X' }), bm({ loc: 3 })], null, null)).toBeNull();
  });

  it('returns null on an empty bookmark list', () => {
    expect(findCurrentBookmark([], 'CFI-A', { current: 5 })).toBeNull();
  });

  // ── anchorCfi (precise) detection ──────────────────────────────────────────
  const PAGE = 'epubcfi(/6/4!/4/2,/2/1:0,/8/1:100)'; // page spans /2 … /8 within the section

  it('matches a precise bookmark whose anchor sentence falls within the page', () => {
    const target = bm({ anchorCfi: 'epubcfi(/6/4!/4/2,/4/1:0,/4/1:30)', kind: 'reading' });
    expect(findCurrentBookmark([target], PAGE, null)).toBe(target);
  });

  it('matches when the page opens mid-sentence (anchor starts before the page start)', () => {
    // The top-of-page sentence began on the previous page, so its start precedes the
    // page start but it is still visible on this page. Start-containment misses it, leaving the
    // button unlit and inviting a duplicate bookmark; overlap catches it.
    const midPage = 'epubcfi(/6/4!/4/2,/4/1:50,/8/1:100)';
    const anchor = bm({ anchorCfi: 'epubcfi(/6/4!/4/2,/4/1:0,/6/1:20)', kind: 'reading' });
    expect(findCurrentBookmark([anchor], midPage, null)).toBe(anchor);
  });

  it('does not match a precise bookmark anchored after the page', () => {
    const after = bm({ anchorCfi: 'epubcfi(/6/4!/4/2,/10/1:0,/10/1:5)', kind: 'audio' });
    expect(findCurrentBookmark([after], PAGE, null)).toBeNull();
  });

  it('does not match a precise bookmark anchored before the page', () => {
    const before = bm({ anchorCfi: 'epubcfi(/6/4!/4/2,/1/1:0,/1/1:5)', kind: 'reading' });
    expect(findCurrentBookmark([before], PAGE, null)).toBeNull();
  });

  it('never falls back to loc for a precise bookmark on a different page', () => {
    const stale = bm({ anchorCfi: 'epubcfi(/6/4!/4/2,/10/1:0,/10/1:5)', loc: 5 });
    expect(findCurrentBookmark([stale], PAGE, { current: 5 })).toBeNull();
  });

  it('matches an audio bookmark by anchor even when exactCfi is a stale section-start page', () => {
    // The player parks the view at the section start, so exactCfi would be wrong — anchor wins.
    const audio = bm({
      anchorCfi: 'epubcfi(/6/4!/4/2,/4/1:0,/4/1:30)',
      exactCfi: 'epubcfi(/6/4!/4/2,/1/1:0,/1/1:1)',
      kind: 'audio',
    });
    expect(findCurrentBookmark([audio], PAGE, null)).toBe(audio);
  });

  it('matches an audio bookmark by exactCfi after navigation even when its anchor is off-page', () => {
    // Android: navigating to an audio bookmark lands on a page whose CFI does NOT overlap the
    // mid-content sentence anchor (offset 122–387 vs page 586–1107). calibrateOnRelocate stamps
    // exactCfi = the landed page, and that exact match must still light the toolbar icon.
    const landed = 'epubcfi(/6/18!/4/2,/18/1:586,/18/1:1107)';
    const audio = bm({ anchorCfi: 'epubcfi(/6/18!/4/2,/18/1:122,/18/1:387)', exactCfi: landed, kind: 'audio' });
    expect(findCurrentBookmark([audio], landed, null)).toBe(audio);
  });

  it('gracefully ignores a malformed anchor CFI', () => {
    const bad = bm({ anchorCfi: 'not-a-cfi', kind: 'reading' });
    expect(findCurrentBookmark([bad], PAGE, null)).toBeNull();
  });
});
