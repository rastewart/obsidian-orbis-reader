import type { App, TFile } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../progress';
import type { AnnotationHost } from '../reader/AnnotationHost';
import { BookmarkController } from '../reader/BookmarkController';
import type { ReaderContext } from '../reader/ReaderContext';

// Stub persistence so no vault I/O happens; assert it's called.
const saveBookmarks = vi.hoisted(() => vi.fn(async () => {}));
const readBookmarks = vi.hoisted(() => vi.fn(async () => [] as Bookmark[]));
vi.mock('../progress', () => ({ saveBookmarks, readBookmarks }));

// Only the slice of ReaderContext that BookmarkController reads. Mutable so tests can
// simulate a relocate (position change) between actions.
interface MockCtx {
  currentFile: TFile | null;
  app: App;
  lastCfi: string | null;
  lastLocation: { current: number } | null;
  lastLocationCfi: string;
  /** The index's location for a position — null before it is up. */
  getLocForCfi: (cfi: string) => number | null;
  currentTocLabel: string | null;
  tocItemHref: string;
  tocEntryAt: (cfi: string) => { href: string; label: string } | null;
  debug: (msg: string, cat: string) => void;
  topOfPageAnchor: () => { cfi: string; text: string } | null;
  flashAnchor: (cfi: string) => void;
  audioBookmarkTarget: () => { anchorCfi: string; chapter: string; chapterHref?: string; loc?: number } | null;
  recordsChanged: () => void;
}

function makeCtx(overrides: Partial<MockCtx> = {}): MockCtx {
  return {
    currentFile: { path: 'book.epub' } as unknown as TFile,
    app: {} as App,
    lastCfi: null,
    lastLocation: null,
    lastLocationCfi: '',
    getLocForCfi: () => null,
    currentTocLabel: null,
    tocItemHref: '',
    tocEntryAt: () => null,
    debug: () => {},
    topOfPageAnchor: () => null,
    flashAnchor: () => {},
    audioBookmarkTarget: () => null,
    recordsChanged: () => {},
    ...overrides,
  };
}

function makeController(ctx: MockCtx): { c: BookmarkController; refreshSaved: ReturnType<typeof vi.fn> } {
  const refreshSaved = vi.fn();
  const host = { refreshSavedPanelIfOpen: refreshSaved } as unknown as AnnotationHost;
  // No buildButton() call → btn stays null → updateBtn() safely no-ops (no DOM needed).
  const c = new BookmarkController(ctx as unknown as ReaderContext, host);
  return { c, refreshSaved };
}

beforeEach(() => {
  saveBookmarks.mockClear();
});

describe('BookmarkController.toggle → add', () => {
  it('stores the index location of where the top-of-page lines begin, and the page as its CFI', () => {
    const asked: string[] = [];
    const ctx = makeCtx({
      lastCfi: 'cfiA',
      lastLocationCfi: 'cfiA',
      lastLocation: { current: 4 },
      topOfPageAnchor: () => ({ cfi: 'anchorA', text: 'The opening lines.' }),
      getLocForCfi: (cfi) => {
        asked.push(cfi);
        return 5;
      },
      tocEntryAt: () => ({ href: 'ch1.html', label: 'Chapter 1' }),
    });
    const { c, refreshSaved } = makeController(ctx);

    c.toggle();

    expect(c.all).toHaveLength(1);
    const b = c.all[0];
    expect(asked).toEqual(['anchorA']);
    expect(b.exactCfi).toBe('cfiA');
    expect(b.loc).toBe(5); // the index's, not the page number it would otherwise fall back to
    expect(b.cfi).toBe('cfiA');
    expect(b.chapter).toBe('Chapter 1');
    expect(b.chapterHref).toBe('ch1.html');
    expect(b.label).toBe('Chapter 1 · loc. 5');
    expect(saveBookmarks).toHaveBeenCalledOnce();
    expect(refreshSaved).toHaveBeenCalledOnce();
  });

  it('files the bookmark under the heading at the top of the page, not the last heading on it', () => {
    const anchorCfi = 'epubcfi(/6/4!/4/2,/4/1:0,/4/1:30)';
    const asked: string[] = [];
    const ctx = makeCtx({
      lastCfi: 'cfiA',
      // The page's own entry: a heading further down the page.
      currentTocLabel: 'Chapter 2',
      tocItemHref: 'ch2.html',
      topOfPageAnchor: () => ({ cfi: anchorCfi, text: 'The last lines of chapter 1.' }),
      tocEntryAt: (cfi) => {
        asked.push(cfi);
        return { href: 'ch1.html', label: 'Chapter 1' };
      },
    });
    const { c } = makeController(ctx);

    c.toggle();

    expect(asked).toEqual([anchorCfi]);
    expect(c.all[0].chapterHref).toBe('ch1.html');
    expect(c.all[0].chapter).toBe('Chapter 1');
  });

  it('tags a reader bookmark kind:reading with the top-of-page lines anchor', () => {
    const ctx = makeCtx({
      lastCfi: 'cfiA',
      lastLocationCfi: 'cfiA',
      lastLocation: { current: 5 },
      topOfPageAnchor: () => ({ cfi: 'epubcfi(/6/4!/4/2,/4/1:0,/4/1:30)', text: 'The opening lines of the page.' }),
    });
    const { c } = makeController(ctx);

    c.toggle();

    const b = c.all[0];
    expect(b.kind).toBe('reading');
    expect(b.anchorCfi).toBe('epubcfi(/6/4!/4/2,/4/1:0,/4/1:30)');
    expect(b.text).toBe('The opening lines of the page.');
  });

  it('leaves anchorCfi undefined when the top-of-page anchor is unavailable', () => {
    const ctx = makeCtx({ lastCfi: 'cfiA', topOfPageAnchor: () => null });
    const { c } = makeController(ctx);

    c.toggle();

    expect(c.all[0].anchorCfi).toBeUndefined();
    expect(c.all[0].kind).toBe('reading');
  });

  it('before the index is up, ignores a stale location (lastLocationCfi !== lastCfi): no loc', () => {
    const ctx = makeCtx({
      lastCfi: 'cfiA',
      lastLocationCfi: 'DIFFERENT', // stale — relocate fired a new CFI without location data
      lastLocation: { current: 5 },
      tocEntryAt: () => ({ href: 'ch1.html', label: 'Chapter 1' }),
    });
    const { c } = makeController(ctx);

    c.toggle();

    const b = c.all[0];
    expect(b.loc).toBeUndefined();
    expect(b.cfi).toBe('cfiA');
    expect(b.label).toBe('Chapter 1');
  });

  it('before the index is up, takes the page number the indicator shows when it is fresh', () => {
    const ctx = makeCtx({ lastCfi: 'cfiA', lastLocationCfi: 'cfiA', lastLocation: { current: 9 } });
    const { c } = makeController(ctx);

    c.toggle();

    const b = c.all[0];
    expect(b.loc).toBe(9);
    expect(b.cfi).toBe('cfiA');
    expect(b.label).toBe('loc. 9'); // no chapter → just the location
  });

  it('does nothing when there is no current CFI', () => {
    const { c } = makeController(makeCtx({ lastCfi: null }));
    c.toggle();
    expect(c.all).toHaveLength(0);
    expect(saveBookmarks).not.toHaveBeenCalled();
  });

  it('does nothing when there is no open file', () => {
    const { c } = makeController(makeCtx({ lastCfi: 'cfiA', currentFile: null }));
    c.toggle();
    expect(c.all).toHaveLength(0);
    expect(saveBookmarks).not.toHaveBeenCalled();
  });
});

describe('BookmarkController.toggle → remove', () => {
  it('removes the bookmark at the current position on a second toggle', () => {
    const ctx = makeCtx({
      lastCfi: 'cfiA',
      lastLocationCfi: 'cfiA',
      lastLocation: { current: 5 },
    });
    const { c } = makeController(ctx);

    c.toggle(); // add (exactCfi === 'cfiA')
    expect(c.all).toHaveLength(1);
    c.toggle(); // current() matches by exactCfi → remove
    expect(c.all).toHaveLength(0);
  });

  it('remove() deletes by id and persists', () => {
    const ctx = makeCtx({ lastCfi: 'cfiA', lastLocationCfi: 'cfiA', lastLocation: { current: 5 } });
    const { c } = makeController(ctx);
    c.toggle();
    const id = c.all[0].id;
    saveBookmarks.mockClear();

    c.remove(id);

    expect(c.all).toHaveLength(0);
    expect(saveBookmarks).toHaveBeenCalledOnce();
  });
});

describe('BookmarkController.toggleAudioBookmark', () => {
  const ANCHOR = 'epubcfi(/6/12!/4/2,/8/1:0,/8/1:40)';

  it('adds an audio bookmark keyed by the sentence anchor', () => {
    const { c } = makeController(makeCtx());
    const added = c.toggleAudioBookmark(ANCHOR, 'Chapter 2', 'ch2.html', 42, 'The sentence being read.');

    expect(added).toBe(true);
    expect(c.all).toHaveLength(1);
    const b = c.all[0];
    expect(b.kind).toBe('audio');
    expect(b.anchorCfi).toBe(ANCHOR);
    expect(b.cfi).toBe(ANCHOR); // nav target is the sentence itself (no reliable page CFI)
    expect(b.loc).toBe(42);
    expect(b.chapter).toBe('Chapter 2');
    expect(b.chapterHref).toBe('ch2.html');
    expect(b.label).toBe('Chapter 2 · loc. 42');
    expect(b.text).toBe('The sentence being read.');
  });

  it('toggle() makes an audio bookmark on the active sentence while audio is playing', () => {
    const ctx = makeCtx({
      lastCfi: 'cfiA',
      audioBookmarkTarget: () => ({ anchorCfi: ANCHOR, chapter: 'Chapter 2', chapterHref: 'ch2.html', loc: 7 }),
    });
    const { c } = makeController(ctx);

    c.toggle();

    expect(c.all).toHaveLength(1);
    expect(c.all[0].kind).toBe('audio');
    expect(c.all[0].anchorCfi).toBe(ANCHOR);
    // A second toggle of the same sentence removes it.
    c.toggle();
    expect(c.all).toHaveLength(0);
  });

  it('removes the audio bookmark on a second toggle of the same sentence', () => {
    const { c } = makeController(makeCtx());
    c.toggleAudioBookmark(ANCHOR, 'Chapter 2', 'ch2.html', 42);
    const removed = c.toggleAudioBookmark(ANCHOR, 'Chapter 2', 'ch2.html', 42);

    expect(removed).toBe(false);
    expect(c.all).toHaveLength(0);
  });

  it('labels with the chapter alone when no location is known', () => {
    const { c } = makeController(makeCtx());
    c.toggleAudioBookmark(ANCHOR, 'Chapter 2', undefined, undefined);
    expect(c.all[0].label).toBe('Chapter 2');
  });

  it('does nothing when there is no open file', () => {
    const { c } = makeController(makeCtx({ currentFile: null }));
    expect(c.toggleAudioBookmark(ANCHOR, 'Chapter 2', undefined, 1)).toBe(false);
    expect(c.all).toHaveLength(0);
  });
});

describe('BookmarkController.calibrate (via setPendingNav + calibrateOnRelocate)', () => {
  // The landed page's number is the top of a page in today's layout; the bookmark's is where its lines begin, which
  // no layout moves. Overwriting one with the other made a bookmark's number follow the font size.
  it('updates exactCfi to the landed page and leaves the location and label alone', () => {
    const ctx = makeCtx({
      lastCfi: 'cfiOld',
      lastLocationCfi: 'cfiOld',
      lastLocation: { current: 5 },
      tocEntryAt: () => ({ href: 'ch2.html', label: 'Ch 2' }),
    });
    const { c } = makeController(ctx);
    c.toggle();
    const id = c.all[0].id;

    // Simulate the relocate after navigating to the bookmark: new CFI, nearby location.
    ctx.lastCfi = 'cfiNew';
    ctx.lastLocation = { current: 6 };
    c.setPendingNav(id);
    saveBookmarks.mockClear();

    c.calibrateOnRelocate();

    const b = c.all[0];
    expect(b.exactCfi).toBe('cfiNew');
    expect(b.loc).toBe(5);
    expect(b.label).toBe('Ch 2 · loc. 5');
    expect(saveBookmarks).toHaveBeenCalledOnce();
  });

  it('does nothing when no navigation is pending', () => {
    const ctx = makeCtx({ lastCfi: 'cfiA', lastLocationCfi: 'cfiA', lastLocation: { current: 5 } });
    const { c } = makeController(ctx);
    c.toggle();
    saveBookmarks.mockClear();

    c.calibrateOnRelocate();

    expect(saveBookmarks).not.toHaveBeenCalled();
  });

  it('calibrates only once — the pending nav is cleared after firing', () => {
    const ctx = makeCtx({ lastCfi: 'cfiOld', lastLocationCfi: 'cfiOld', lastLocation: { current: 5 } });
    const { c } = makeController(ctx);
    c.toggle();
    c.setPendingNav(c.all[0].id);
    ctx.lastCfi = 'cfiNew';
    c.calibrateOnRelocate();
    saveBookmarks.mockClear();

    c.calibrateOnRelocate(); // pending already consumed

    expect(saveBookmarks).not.toHaveBeenCalled();
  });
});

describe('BookmarkController.replaceAll', () => {
  it('replaces the whole list and persists', () => {
    const { c } = makeController(makeCtx());
    const bms: Bookmark[] = [
      { id: '1', cfi: 'c1', label: 'L1', createdAt: 1 },
      { id: '2', cfi: 'c2', label: 'L2', createdAt: 2 },
    ];

    c.replaceAll(bms);

    expect(c.all).toEqual(bms);
    expect(saveBookmarks).toHaveBeenCalledOnce();
  });
});
