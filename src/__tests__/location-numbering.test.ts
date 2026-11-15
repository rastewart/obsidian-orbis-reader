// One location numbering, whichever surface asks.
//
// The indicator showed foliate's location — bytes, from 0 — while a bookmark stored the index's section start and Go
// to location went by bytes again: `loc. 0` on a first page, and a passage, its page and Go to all a few locations
// apart. Now every number is the index's: the page's (`getLocForCfi`), a passage's (the same), Go to's target (its
// own start in `locNavCache`), and a chapter's or a section's start (`sectionStartLoc`). This builds a real index over
// sample sections and checks they all agree with the one rule, `locAtChar`.

import { fake as cfiFake, fromRange as cfiFromRange, joinIndir as cfiJoinIndir } from 'foliate-js/epubcfi.js';
import { describe, expect, it, vi } from 'vitest';
import { LocationIndex } from '../reader/LocationIndex';
import type { LocationIndexHost } from '../reader/LocationIndexHost';
import { locAtChar } from '../reader/location-math';
import type { ReaderContext } from '../reader/ReaderContext';

/** Sections of varied length and markup: several text nodes each, one too short to hold a location's start, and an
 *  image with no text at all. */
const BODIES = [
  `<h1>Opening</h1>${'<p>The lantern swung on its <em>iron</em> hook above the door. </p>'.repeat(14)}`,
  '<p>Hi.</p>',
  '<p><img src="plate.png" alt=""></p>',
  // Ids as a Kindle book carries them, on the heading and on each paragraph a contents entry could point at.
  `<h2 id="second">Second</h2>${Array.from(
    { length: 31 },
    (_, i) => `<p id="p${i}">Rain on the <b>slate</b> roof, and the <i>river</i> rising under it. </p>`
  ).join('')}`,
  `${'<p>A short paragraph. </p>'.repeat(9)}`,
];
const TOTAL_LOCS = 61;

function documentOf(body: string): Document {
  return new DOMParser().parseFromString(`<html><head><title>t</title></head><body>${body}</body></html>`, 'text/html');
}

/** A Kindle-style contents entry foliate's resolver places: section 3's `<h2>`, and a paragraph partway down it. */
const KINDLE_TOC = [
  { href: 'kindle:pos:fid:0004:off:0000000000', label: 'Second' },
  { href: 'kindle:pos:fid:0004:off:000000001A', label: 'Partway' },
];
const KINDLE_PLACES: Record<string, { index: number; find: (doc: Document) => Element | null }> = {
  'kindle:pos:fid:0004:off:0000000000': { index: 3, find: (doc) => doc.querySelector('h2') },
  'kindle:pos:fid:0004:off:000000001A': { index: 3, find: (doc) => doc.querySelectorAll('p')[12] ?? null },
};

/** foliate's book object, as far as the index asks it: KF8's resolver is asynchronous, its splitter is not. */
const kindleBook = {
  splitTOCHref: (href: string) => [KINDLE_PLACES[href]?.index ?? -1, null],
  resolveHref: async (href: string) => {
    const place = KINDLE_PLACES[href];
    return place ? { index: place.index, anchor: place.find } : undefined;
  },
};

async function builtIndex(kindle = false): Promise<{ index: LocationIndex; docs: Document[] }> {
  const docs = BODIES.map(documentOf);
  const bookSections = BODIES.map((body, i) => ({ size: body.length + 120, createDocument: async () => docs[i] }));
  const ctx = {
    bookSections,
    lastLocation: { current: 1, total: TOTAL_LOCS },
    currentFile: null,
    tocItemHref: '',
    foliateView: kindle ? { book: kindleBook } : null,
    debug: () => {},
  } as unknown as ReaderContext;
  const host: LocationIndexHost = {
    totalBookSize: bookSections.reduce((n, s) => n + s.size, 0),
    tocItems: kindle ? KINDLE_TOC : [],
    lastSection: null,
    bookTitle: () => '',
    setNavigating: () => {},
    invalidateChapterBoundaries: () => {},
    indexReady: vi.fn(),
  };
  const index = new LocationIndex(ctx, host);
  await index.rebuild();
  expect(index.isReady).toBe(true);
  return { index, docs };
}

/** The CFI foliate reports for a position `offset` characters into section `sIdx`'s text, and that position. */
function cfiAt(doc: Document, sIdx: number, offset: number): string {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let at = 0;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (offset < at + n.length) {
      const range = doc.createRange();
      range.setStart(n, offset - at);
      range.collapse(true);
      return cfiJoinIndir(cfiFake.fromIndex(sIdx), cfiFromRange(range));
    }
    at += n.length;
  }
  throw new Error(`offset ${offset} is past section ${sIdx}`);
}

describe('one location numbering', () => {
  it('gives a position the location locAtChar puts its character in, in every section with text', async () => {
    const { index, docs } = await builtIndex();
    const counts = index.sectionCharCounts;
    const perLoc = index.totalBookChars / TOTAL_LOCS;
    let sectionStart = 0;
    for (const [sIdx, doc] of docs.entries()) {
      const chars = doc.body.textContent?.length ?? 0;
      for (let offset = 0; offset < chars; offset += 7) {
        expect(index.getLocForCfi(cfiAt(doc, sIdx, offset))).toBe(locAtChar(sectionStart + offset, perLoc, TOTAL_LOCS));
      }
      sectionStart += counts[sIdx];
    }
  });

  it('starts the book at location 1 and ends it at the total', async () => {
    const { index, docs } = await builtIndex();
    expect(index.getLocForCfi(cfiAt(docs[0], 0, 0))).toBe(1);
    const last = docs[4];
    expect(index.getLocForCfi(cfiAt(last, 4, (last.body.textContent?.length ?? 1) - 1))).toBe(TOTAL_LOCS);
    expect(index.getTotalLocs()).toBe(TOTAL_LOCS);
  });

  it('sends Go to location N to a place that reads as location N', async () => {
    const { index } = await builtIndex();
    for (let loc = 1; loc <= TOTAL_LOCS; loc++) {
      const start = index.locNavCache.get(loc);
      expect(start, `location ${loc}`).toBeDefined();
      expect(index.getLocForCfi(start as string)).toBe(loc);
    }
  });

  it('counts a section from the location its first character is in', async () => {
    const { index, docs } = await builtIndex();
    for (const sIdx of [0, 1, 3, 4]) {
      expect(index.sectionStartLoc(sIdx)).toBe(index.getLocForCfi(cfiAt(docs[sIdx], sIdx, 0)));
    }
  });

  it('places a range by where it begins, as a passage is', async () => {
    const { index, docs } = await builtIndex();
    const doc = docs[3];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
    const range = doc.createRange();
    range.setStart(texts[20], 2);
    range.setEnd(texts[60], 3);
    const passage = cfiJoinIndir(cfiFake.fromIndex(3), cfiFromRange(range));
    range.collapse(true);
    const start = cfiJoinIndir(cfiFake.fromIndex(3), cfiFromRange(range));
    expect(index.getLocForCfi(passage)).toBe(index.getLocForCfi(start));
  });
});

/** Characters of text before `el` in its document — where a chapter starting at it begins. */
function textBefore(doc: Document, el: Element): number {
  const range = doc.createRange();
  range.setStart(doc.body, 0);
  range.setEndBefore(el);
  return range.toString().length;
}

// A Kindle book's contents entries are `kindle:pos:` links, which the index's own lookup cannot place; foliate's
// resolver can. Without it a chapter's start was unknown and chapter locations fell back to counting bytes.
describe('chapter starts in a Kindle book', () => {
  it('starts each chapter in the location its first character is in, by foliate’s placing of the entry', async () => {
    const { index, docs } = await builtIndex(true);
    const perLoc = index.totalBookChars / TOTAL_LOCS;
    const sectionStart = index.sectionCharCounts.slice(0, 3).reduce((a, b) => a + b, 0);
    for (const { href } of KINDLE_TOC) {
      const el = KINDLE_PLACES[href].find(docs[3]) as Element;
      const expected = locAtChar(sectionStart + textBefore(docs[3], el), perLoc, TOTAL_LOCS);
      expect(index.chapterStartLoc(href), href).toBe(expected);
    }
    // The partway entry is a later location than the chapter heading, not the section's start again.
    const [heading, partway] = KINDLE_TOC.map(({ href }) => index.chapterStartLoc(href) as number);
    expect(partway).toBeGreaterThan(heading);
  });
});

// The same entries, for everything else that splits a book into chapters: the section through foliate, the id the
// entry points at, and a chapter's start fraction measured from that element rather than from its file's top.
describe('Kindle contents entries for every chapter split', () => {
  const [heading, partway] = KINDLE_TOC.map((e) => e.href);

  it('places each entry in its section and records the id it points at', async () => {
    const { index } = await builtIndex(true);
    expect(index.hrefToSectionIndex(heading)).toBe(3);
    expect(index.hrefToSectionIndex(partway)).toBe(3);
    expect(index.anchorOf(heading)).toBe('second');
    expect(index.anchorOf(partway)).toBe('p12');
  });

  it('starts a chapter partway down its file later than one at its top', async () => {
    const { index } = await builtIndex(true);
    const at = (href: string) => index.tocStartFractions.get(href) as number;
    expect(at(partway)).toBeGreaterThan(at(heading));
  });

  // Entering a chapter pulls its start back to its file's start, correcting the byte estimate before a file's text.
  // A chapter anchored partway down is measured from its own element; its file's start belongs to the one before.
  it('leaves an anchored chapter’s start where it was measured when the reader arrives in its file', async () => {
    const { index } = await builtIndex(true);
    const before = index.tocStartFractions.get(partway);
    index.calibrateChapter(partway, { section: { current: 3 } });
    expect(index.tocStartFractions.get(partway)).toBe(before);
  });
});
