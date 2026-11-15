// Which chapter the progress indicator counts: the one at the top of the page.
//
// Found on Android: on the page before a chapter break, the chapter-locations mode read 1 / 4 — the NEXT chapter's
// first location — where this chapter's 5 / 5 belonged. foliate's page entry (`tocItemHref`) is the last heading
// starting at or before the page's end, which there is already the next chapter's.

import { describe, expect, it } from 'vitest';
import type { ReaderContext } from '../reader/ReaderContext';
import { ReadingStats } from '../reader/ReadingStats';
import type { StatsHost } from '../reader/StatsHost';

const STARTS: Record<string, number> = { 'ch1.html': 50, 'ch2.html': 60 };

function statsAt(page: { loc: number; topEntry: string; foliateEntry: string }): ReadingStats {
  const ctx = {
    app: { loadLocalStorage: () => null },
    bookSections: [{ size: 500 }, { size: 500 }],
    currentSectionIndex: 0,
    lastCfi: 'epubcfi(/6/2!/4/2/1:0)',
    lastLocation: { current: page.loc, total: 113 },
    tocItemHref: page.foliateEntry,
    tocEntryAt: () => ({ href: page.topEntry, label: '' }),
    debug: () => {},
  } as unknown as ReaderContext;
  const host = {
    sectionLocInfo: [
      { startLoc: 1, locCount: 59 },
      { startLoc: 60, locCount: 54 },
    ],
    totalBookSize: 1000,
    totalBookChars: 1000,
    totalBookWords: 200,
    sectionWordCounts: [100, 100],
    sectionCharCounts: [500, 500],
    locWordCounts: new Map(),
    sectionHrefMap: new Map(),
    tocItems: [
      { href: 'ch1.html', label: 'One' },
      { href: 'ch2.html', label: 'Two' },
    ],
    tocStartFractions: new Map([
      ['ch1.html', 0.44],
      ['ch2.html', 0.53],
    ]),
    hrefToSectionIndex: (href: string | undefined) => (href === 'ch2.html' ? 1 : 0),
    chapterStartLoc: (href: string) => STARTS[href] ?? null,
    sectionStartLoc: () => null,
    progressModeSetting: 'chapter-locs',
    progressModesConfig: () => undefined,
  } as unknown as StatsHost;
  const stats = new ReadingStats(ctx, host);
  stats.initModeFromSettings();
  stats.setFraction(0.52);
  return stats;
}

describe('ReadingStats chapter locations', () => {
  it('counts the chapter at the top of the page, not the one whose heading foliate saw at its end', () => {
    expect(statsAt({ loc: 59, topEntry: 'ch1.html', foliateEntry: 'ch2.html' }).formatLocLabel()).toBe('📑 10 / 10');
  });

  it('counts a new chapter from 1 on the page it starts', () => {
    expect(statsAt({ loc: 60, topEntry: 'ch2.html', foliateEntry: 'ch2.html' }).formatLocLabel()).toBe('📑 1 / 54');
  });
});
