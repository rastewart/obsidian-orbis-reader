import {
  fake as cfiFake,
  fromRange as cfiFromRange,
  joinIndir as cfiJoinIndir,
  withIndexCache,
} from 'foliate-js/epubcfi.js';
import {
  anchorCharOffsets as anchorCharOffsetsIn,
  anchorTextStarts,
  elementCharOffsets,
  hrefAnchor,
} from '../book-chapters';
import { headingOf } from '../book-extractor';
import { readLocsCache, saveLocation, saveLocsCache } from '../progress';
import type { LocationIndexHost } from './LocationIndexHost';
import { type LocStarts, locAtCfi, locStartsOf } from './loc-lookup';
import { computeLocWordCounts, computeSectionLocInfo, locAtChar } from './location-math';
import type { ReaderContext } from './ReaderContext';
import type { StatsTocItem } from './StatsHost';

type RawSection = { size?: number; cfi?: string; createDocument?(): Promise<Document>; unload?(): void };

/** What the index asks of foliate's book object for a contents entry it cannot place itself. MOBI's resolver is
 *  synchronous and KF8's asynchronous, so its answer is awaited either way; MOBI's throws on anything but `filepos:`. */
type FoliateBook = {
  splitTOCHref?(href: string): unknown;
  resolveHref?(href: string): unknown;
};

/** An element finder per contents entry, by section — the entries only foliate can place. */
type PlacedAnchors = Map<number, Array<[string, (doc: Document) => Element | null]>>;

/**
 * The character-counting location index: maps book locations to CFIs and per-section
 * start locations / word counts, so `loc. N`, go-to-by-location, chapter %/loc,
 * and WPM word math all work. Built by loading every section's DOM off-screen once
 * (or restored from a per-book cache).
 *
 * The largest and lowest-in-the-stack collaborator: it OWNS the index data that
 * ReadingStats (via StatsHost) and LinkPreview (via LinkPreviewHost) read — the view's
 * getters for that data delegate here. It reads a little book-level state via
 * `LocationIndexHost`/`ReaderContext`, and notifies ReadingStats to recompute through
 * two host callbacks (no direct sibling reference). The view's relocate handler drives
 * the build trigger + chapter calibration by calling `maybeBuild` / `calibrateChapter`,
 * and `navigateToLoc` / query helpers keep thin view wrappers for the command palette.
 * See docs/design/reader-architecture.md (final phase).
 */
export class LocationIndex {
  // ── Owned data (read by the view's StatsHost / LinkPreviewHost getters) ──
  sectionLocInfo: Array<{ startLoc: number; locCount: number }> = [];
  locNavCache = new Map<number, string>(); // loc → CFI
  sectionWordCounts: number[] = [];
  sectionCharCounts: number[] = [];
  /** Each section's own first heading, '' where it has none. The one chapter name that cannot drift, because it
   *  is read from the section it names rather than matched to it — see `chapterDisplayForSection`. */
  sectionHeadings: string[] = [];
  /** Contents href → characters of text before it within its own section. What lets a book that keeps many
   *  chapters in one file size each of them separately — see `book-chapters`. */
  anchorCharOffsets = new Map<string, number>();
  /** Contents href → the id of the element it points at, for the entries only foliate can place (`anchorOf`). */
  tocAnchorIds = new Map<string, string>();
  totalBookChars = 0;
  totalBookWords = 0;
  locWordCounts = new Map<number, number>(); // loc → word count (rebuilt each layout)
  sectionHrefMap = new Map<string, number>(); // resolved section path → spine index
  tocStartFractions = new Map<string, number>(); // href → content fraction (0–1) at chapter start

  private locationIndexReady = false;
  private locationIndexBuilding = false;
  /**
   * The one in-flight attempt to load-or-build, shared by every caller that asks while it runs.
   *
   * **Because `locationIndexBuilding` is set too late to stop them.** `maybeBuild` runs on every foliate
   * `relocate`, and pagination settling on book open fires about fifteen of them inside 55ms — every one of which
   * passed the ready/building guard, because none had reached its first `await` to set either. So a 928-page
   * book read and re-hydrated its whole location cache fifteen times over, on the open of every book.
   */
  private loadOrBuildInFlight: Promise<void> | null = null;
  /** `locNavCache` in location order, for `locAt` — made on first use, dropped whenever the map is refilled. */
  private locStarts: LocStarts | null = null;
  private isMobiFormat = false; // true for MOBI/AZW3 (sections lack resolveHref; no location.total)
  private relocateCount = 0;
  private hasSeenLocationTotal = false;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: LocationIndexHost
  ) {}

  get isReady(): boolean {
    return this.locationIndexReady;
  }

  /** Reset all per-book index state (called from the view's resetFileState). */
  reset(): void {
    this.sectionHrefMap = new Map();
    this.isMobiFormat = false;
    this.relocateCount = 0;
    this.hasSeenLocationTotal = false;
    this.sectionLocInfo = [];
    this.sectionWordCounts = [];
    this.sectionCharCounts = [];
    this.sectionHeadings = [];
    this.anchorCharOffsets = new Map();
    this.tocAnchorIds = new Map();
    this.totalBookChars = 0;
    this.totalBookWords = 0;
    this.tocStartFractions = new Map();
    this.locationIndexReady = false;
    this.locationIndexBuilding = false;
    this.loadOrBuildInFlight = null;
    this.locNavCache = new Map();
    this.locStarts = null;
    this.locWordCounts = new Map();
  }

  // ── Href resolution ──────────────────────────────────────────────────────────

  buildSectionHrefMap(): void {
    this.sectionHrefMap.clear();
    let mobiCount = 0;
    const rawSections = this.ctx.bookSections as unknown as Array<{ resolveHref?: (h: string) => string }>;
    for (let i = 0; i < rawSections.length; i++) {
      const resolve = rawSections[i].resolveHref;
      if (!resolve) {
        // MOBI sections use numeric indices rather than URL paths — store by string index
        // so href="2" → section 2 lookups work in LinkPreview.loadAndShowLinkPreview.
        this.sectionHrefMap.set(String(i), i);
        mobiCount++;
        continue;
      }
      try {
        const withFrag = resolve('#__sentinel');
        const path = withFrag.split('#')[0];
        if (path) this.sectionHrefMap.set(path, i);
      } catch {
        /* skip */
      }
    }
    this.isMobiFormat = mobiCount > 0 && mobiCount === this.ctx.bookSections.length;
    this.ctx.debug(`buildSectionHrefMap: ${this.sectionHrefMap.size} entries isMobi:${this.isMobiFormat}`, 'index');
  }

  /**
   * A contents href → the spine section holding it, or -1: the index's own lookup, else foliate's.
   *
   * **foliate places what a path cannot.** A Kindle book's `kindle:pos:` links and a MOBI's `filepos:` name a
   * position, not a file; foliate's `splitTOCHref` — what it names the page's chapter by — maps one to its section
   * through the book's own table of fragments. The fid in a `kindle:pos:` link is not a section number, which is
   * why reading the link itself cannot answer.
   */
  hrefToSectionIndex(href: string | undefined): number {
    if (!href) return -1;
    const own = this.ownSectionIndex(href);
    if (own >= 0) return own;
    try {
      const split = this.foliateBook()?.splitTOCHref?.(href);
      const index = Array.isArray(split) ? (split[0] as unknown) : undefined;
      return typeof index === 'number' && index >= 0 && index < this.ctx.bookSections.length ? index : -1;
    } catch {
      return -1; // MOBI's splitter throws on anything but `filepos:`
    }
  }

  /**
   * The id a contents entry points at inside its section, or null for one that starts its section: its own
   * `#fragment`, else — for an entry only foliate can place — the id of the element foliate finds there, recorded by
   * the measuring pass. Every chapter split asks this rather than reading the href, so a Kindle chapter that starts
   * partway down a file is cut where it starts, as an EPUB one is.
   */
  anchorOf(href: string): string | null {
    return hrefAnchor(href) ?? this.tocAnchorIds.get(href) ?? null;
  }

  private ownSectionIndex(href: string): number {
    const basename = href.split('#')[0].split('/').pop() ?? href;
    const clean = href.split('#')[0];
    const fromMap = this.sectionHrefMap.get(clean) ?? this.sectionHrefMap.get(basename);
    if (fromMap !== undefined) return fromMap;
    const rawSections = this.ctx.bookSections as unknown as Array<{ id?: unknown }>;
    return rawSections.findIndex((s) => {
      const sId = typeof s.id === 'string' ? s.id : '';
      return sId.split('/').pop() === basename || sId === clean;
    });
  }

  /**
   * The section a bare `#id` lands in when the book's ids are book-wide — or undefined, when a bare fragment means
   * the section it is written in, as it does in every other format.
   *
   * **FB2 is the one that differs.** It is one XML file that foliate cuts into sections, so its ids are unique across
   * the book and a note reference `#n1` points into the notes body, a section of its own. Its sections have no
   * `resolveHref`; foliate's book-level one answers from the id table it built. Asked of no other format: MOBI's
   * throws on anything but `filepos:`, and AZW3's is asynchronous. One answer for the link preview and both exports.
   */
  fragmentSectionIndex(id: string): number | undefined {
    if (this.ctx.currentFile?.extension.toLowerCase() !== 'fb2') return undefined;
    const book = (this.ctx.foliateView as { book?: { resolveHref?(href: string): { index?: unknown } | null } } | null)
      ?.book;
    const index = book?.resolveHref?.(`#${id}`)?.index;
    return typeof index === 'number' && index >= 0 && index < this.ctx.bookSections.length ? index : undefined;
  }

  // ── Relocate coupling (called from the view's relocate handler) ──────────────

  /** On each relocate, trigger the index build/load once when the format's data is ready. */
  maybeBuild(detail: { location?: { current?: number; total?: number }; fraction?: number }): void {
    // Track whether this format ever provides location.total (set before trigger check so
    // a first-time location.total on event 3 blocks the fraction-only path on the same event).
    if (detail.location?.total) this.hasSeenLocationTotal = true;
    this.relocateCount++;
    if (!this.locationIndexReady && !this.locationIndexBuilding) {
      if (detail.location?.current != null && detail.location?.total) {
        void this.loadOrBuildLocationIndex(detail.location.total);
      } else if (detail.fraction != null && !this.hasSeenLocationTotal && this.relocateCount >= 3) {
        void this.loadOrBuildLocationIndex(0);
      }
    }
  }

  /** Correct a chapter's stored start fraction from the actual relocate position. */
  calibrateChapter(newTocHref: string, detail: { section?: { current?: number } }): void {
    if (!(this.locationIndexReady && newTocHref && this.host.totalBookSize > 0)) return;
    if (detail.section?.current != null) this.calibrateToSectionStart(newTocHref, detail.section.current);
  }

  /**
   * Pull a whole-file chapter's start fraction back to its section's start, correcting the measuring pass's estimate
   * of the bytes before a section's text.
   *
   * **Not for a chapter that starts partway down its file**: its start is measured from its own element, and its
   * section's start belongs to the chapter before it. Every format alike — a Kindle book's `kindle:pos:` entries are
   * placed when the index is built, through foliate (`hrefToSectionIndex`, `anchorOf`), so none waits for the reader
   * to arrive at it.
   */
  private calibrateToSectionStart(href: string, sIdx: number): void {
    if (this.anchorOf(href)) return;
    const rawSec = this.ctx.bookSections as unknown as Array<{ size?: number }>;
    let cumBytes = 0;
    for (let j = 0; j < sIdx; j++) cumBytes += rawSec[j]?.size ?? 0;
    const sectionFrac = cumBytes / this.host.totalBookSize;
    const existing = this.tocStartFractions.get(href);
    if (existing === undefined || sectionFrac < existing) {
      this.tocStartFractions.set(href, sectionFrac);
      this.host.invalidateChapterBoundaries();
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  private async buildLocationIndex(): Promise<void> {
    if (this.locationIndexBuilding || this.locationIndexReady) return;
    if (this.ctx.bookSections.length === 0) return;
    this.locationIndexBuilding = true;

    // totalLocs = 0 for MOBI/AZW3 (no location.total); builds fraction-only index
    const totalLocs = this.ctx.lastLocation?.total ?? 0;
    const sections = this.ctx.bookSections as unknown as RawSection[];

    // Timed, because a first open is where a large book stalls: the log says which pass, and how long.
    const started = performance.now();
    const measured = await this.measureSectionSizes(sections);
    const measuredAt = performance.now();
    if (!measured) {
      this.locationIndexBuilding = false;
      return;
    }
    const { charCounts, sectionWordCounts, sectionHeadings, anchorCharOffsets, totalChars } = measured;
    // Before the placing pass, which asks `anchorOf` where each contents entry starts.
    this.tocAnchorIds = measured.tocAnchorIds;

    if (totalLocs > 0) {
      this.buildSectionLocInfo(charCounts, sectionWordCounts, totalChars, totalLocs);
    }
    await this.buildLocNavCache(sections, charCounts, totalChars, totalLocs);
    const placedAt = performance.now();

    this.sectionCharCounts = charCounts;
    this.sectionWordCounts = sectionWordCounts;
    this.sectionHeadings = sectionHeadings;
    this.anchorCharOffsets = anchorCharOffsets;
    this.totalBookChars = totalChars;
    this.totalBookWords = sectionWordCounts.reduce((s, v) => s + v, 0);

    this.locStarts = null;
    this.locationIndexReady = true;
    this.locationIndexBuilding = false;
    // Calibrate the chapter that was current while the index was building.
    // relocate events during the build are skipped (locationIndexReady was false then).
    if (this.ctx.tocItemHref && this.host.lastSection?.current != null && this.host.totalBookSize > 0) {
      this.calibrateToSectionStart(this.ctx.tocItemHref, this.host.lastSection.current);
    }
    this.ctx.debug(
      `buildLocationIndex done — pages:${this.locNavCache.size} fractions:${this.tocStartFractions.size} totalLocs:${totalLocs}` +
        ` measure:${Math.round(measuredAt - started)}ms place:${Math.round(placedAt - measuredAt)}ms`,
      'index'
    );
    if (this.ctx.currentFile) {
      void saveLocsCache(this.ctx.app, this.ctx.currentFile, {
        sectionLocInfo: this.sectionLocInfo,
        locNavCache: this.locNavCache,
        totalLocs,
        sectionWordCounts: this.sectionWordCounts,
        sectionCharCounts: this.sectionCharCounts,
        tocStartFractions: this.tocStartFractions,
        sectionHeadings: this.sectionHeadings,
        anchorCharOffsets: this.anchorCharOffsets,
        tocAnchorIds: this.tocAnchorIds,
      });
    }
    this.host.indexReady();
  }

  // Pass 1: load each section DOM once to measure character and word counts.
  // Falls back to byte-size estimate when createDocument is unavailable or throws.
  // Returns null if total character count is zero (nothing to index).
  //
  // Each section's own first heading comes out of this pass too. It is not free information anywhere else in the
  // plugin — reading a section means parsing it — but here the document is already open to be counted, so taking
  // its heading costs one more call. Everything that names a chapter is downstream of this array.
  private async measureSectionSizes(sections: RawSection[]): Promise<{
    charCounts: number[];
    sectionWordCounts: number[];
    sectionHeadings: string[];
    anchorCharOffsets: Map<string, number>;
    tocAnchorIds: Map<string, string>;
    totalChars: number;
  } | null> {
    const charCounts: number[] = [];
    const sectionWordCounts: number[] = [];
    const sectionHeadings: string[] = [];
    const anchorCharOffsets = new Map<string, number>();
    const tocAnchorIds = new Map<string, string>();
    // Which contents anchors to look for in each section — grouped once, ahead of the walk, so a section with none
    // (which is most of them, on most books) costs nothing extra.
    const anchorsBySection = this.tocAnchorsBySection();
    const placedByFoliate = await this.foliatePlacedAnchors();
    // What the pass had to work from: a build that saw no contents measures no chapter starts, silently.
    const count = (m: Map<number, unknown[]>): number => [...m.values()].reduce((n, l) => n + l.length, 0);
    this.ctx.debug(
      `measure — contents:${this.host.tocItems.length} anchored:${count(anchorsBySection)} placed-by-foliate:${count(placedByFoliate)}`,
      'index'
    );
    let totalChars = 0;
    for (const [index, section] of sections.entries()) {
      let chars = 0;
      let words = 0;
      let heading = '';
      try {
        if (section.createDocument) {
          const doc = await section.createDocument();
          const text = doc.body?.textContent ?? '';
          chars = text.length;
          words = text.trim() ? text.trim().split(/\s+/).length : 0;
          heading = headingOf(doc, this.host.bookTitle(), index);
          const anchors = anchorsBySection.get(index);
          if (anchors?.length) {
            const offsets = anchorCharOffsetsIn(
              doc,
              anchors.map(([, a]) => a)
            );
            for (const [href, anchor] of anchors) {
              const at = offsets.get(anchor);
              if (at !== undefined) anchorCharOffsets.set(href, at);
            }
          }
          const placed = placedByFoliate.get(index);
          if (placed?.length) {
            const wanted = new Map<Element, string[]>();
            for (const [href, find] of placed) {
              let el: Element | null = null;
              try {
                el = find(doc);
              } catch {
                el = null;
              }
              if (!el) continue;
              wanted.set(el, [...(wanted.get(el) ?? []), href]);
              // Every Kindle and MOBI entry measured so far points at an element with an id — the book's own, or the
              // `filepos…` anchor foliate writes into a MOBI — which is what lets it be cut like an EPUB anchor.
              if (el.id) tocAnchorIds.set(href, el.id);
            }
            for (const [href, at] of elementCharOffsets(doc, wanted)) anchorCharOffsets.set(href, at);
          }
          section.unload?.();
        }
      } catch {
        /* fall through to byte estimate */
      }
      if (chars === 0) chars = Math.round((section.size ?? 0) / 4);
      chars = Math.max(1, chars);
      charCounts.push(chars);
      sectionWordCounts.push(Math.max(0, words));
      sectionHeadings.push(heading);
      // The total is the sum of the counts the numbering is cut from, so a cache restore — which re-adds them — and a
      // build divide by the same figure.
      totalChars += chars;
    }
    return totalChars === 0
      ? null
      : { charCounts, sectionWordCounts, sectionHeadings, anchorCharOffsets, tocAnchorIds, totalChars };
  }

  /** Section index → the [href, anchor] pairs of the contents entries that land in it and carry a fragment. A
   *  whole-file entry has no fragment and needs no offset: it starts where its section does. */
  private tocAnchorsBySection(): Map<number, Array<[string, string]>> {
    const out = new Map<number, Array<[string, string]>>();
    const seen = new Set<string>();
    const walk = (items: ReadonlyArray<StatsTocItem>): void => {
      for (const item of items) {
        const anchor = item.href ? hrefAnchor(item.href) : null;
        if (anchor && !seen.has(item.href)) {
          seen.add(item.href);
          const sIdx = this.hrefToSectionIndex(item.href);
          if (sIdx >= 0) {
            const list = out.get(sIdx);
            if (list) list.push([item.href, anchor]);
            else out.set(sIdx, [[item.href, anchor]]);
          }
        }
        if (item.subitems?.length) walk(item.subitems);
      }
    };
    walk(this.host.tocItems);
    return out;
  }

  /**
   * The contents entries only foliate can place — a Kindle book's `kindle:pos:` links, a MOBI's `filepos:` — with
   * the element each one points at, by section. Measured in the same pass as `tocAnchorsBySection`'s, into the same
   * `anchorCharOffsets`, so a chapter's start is found the same way whatever the format (`chapterStartLoc`).
   * Resolved before the walk because KF8's resolver reads the book's records asynchronously.
   */
  private async foliatePlacedAnchors(): Promise<PlacedAnchors> {
    const out: PlacedAnchors = new Map();
    const book = this.foliateBook();
    if (!book?.resolveHref) return out;
    const hrefs = new Set<string>();
    const walk = (items: ReadonlyArray<StatsTocItem>): void => {
      for (const item of items) {
        if (item.href && this.ownSectionIndex(item.href) < 0) hrefs.add(item.href);
        if (item.subitems?.length) walk(item.subitems);
      }
    };
    walk(this.host.tocItems);
    for (const href of hrefs) {
      try {
        const at = (await book.resolveHref(href)) as { index?: unknown; anchor?: unknown } | null | undefined;
        if (typeof at?.index !== 'number' || at.index < 0 || typeof at.anchor !== 'function') continue;
        const find = at.anchor as (doc: Document) => Element | null;
        out.set(at.index, [...(out.get(at.index) ?? []), [href, find]]);
      } catch {
        /* an entry foliate cannot place either */
      }
    }
    return out;
  }

  private foliateBook(): FoliateBook | undefined {
    return (this.ctx.foliateView as { book?: FoliateBook } | null)?.book;
  }

  // Populate sectionLocInfo (location ranges per section) and rebuild per-loc word counts.
  // The distribution math lives in the pure, unit-tested `location-math` module.
  private buildSectionLocInfo(
    charCounts: number[],
    sectionWordCounts: number[],
    totalChars: number,
    totalLocs: number
  ): void {
    this.sectionLocInfo = computeSectionLocInfo(charCounts, totalChars, totalLocs);
    this.rebuildLocWordCounts(sectionWordCounts);
  }

  // Rebuild locWordCounts from the already-set sectionLocInfo + per-section word counts,
  // so the per-loc buckets always match the current layout's location numbering.
  private rebuildLocWordCounts(sectionWordCounts: number[]): void {
    this.locWordCounts = computeLocWordCounts(this.sectionLocInfo, sectionWordCounts);
  }

  // Pass 2: generate a CFI for each location boundary by locating the target character
  // offset within the section's text nodes. Also computes exact start fractions for
  // anchored TOC entries (href#anchor → fraction).
  private async buildLocNavCache(
    sections: RawSection[],
    charCounts: number[],
    totalChars: number,
    totalLocs: number
  ): Promise<void> {
    const sectionAnchorMap = new Map<number, Array<{ href: string; anchorId: string }>>();
    const sectionLevelMap = new Map<number, string[]>(); // sIdx → hrefs without anchor
    const collectTocEntries = (items: ReadonlyArray<StatsTocItem>): void => {
      for (const item of items) {
        if (item.href) {
          const anchorId = this.anchorOf(item.href);
          const sIdx = this.hrefToSectionIndex(item.href);
          if (sIdx >= 0) {
            if (anchorId) {
              if (!sectionAnchorMap.has(sIdx)) sectionAnchorMap.set(sIdx, []);
              sectionAnchorMap.get(sIdx)!.push({ href: item.href, anchorId });
            } else {
              if (!sectionLevelMap.has(sIdx)) sectionLevelMap.set(sIdx, []);
              sectionLevelMap.get(sIdx)!.push(item.href);
            }
          }
        }
        if (item.subitems?.length) collectTocEntries(item.subitems);
      }
    };
    collectTocEntries(this.host.tocItems);

    const totalBookSize = this.host.totalBookSize;
    const charsPerLoc = totalChars / totalLocs;
    let globalCharOffset = 0;
    let cumulativeBytes = 0; // tracks byte position for fraction alignment with lastFraction
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];
      const sectionChars = charCounts[sIdx];
      const sectionBytes = section.size ?? 0;
      const sectionStart = globalCharOffset;
      // The locations that start in this section, by the one rule (`locAtChar`) — the same ranges the section's
      // pages are numbered by. None for a book foliate gives no location total (some MOBI/AZW3).
      const own = this.sectionLocInfo[sIdx];
      const firstLoc = own?.startLoc ?? 1;
      const lastLoc = own ? own.startLoc + own.locCount - 1 : 0;
      const baseCFI = section.cfi ?? cfiFake.fromIndex(sIdx);
      const anchorsInSection = sectionAnchorMap.get(sIdx) ?? [];

      // Preliminary fraction for sections without DOM access.
      const sectionHrefs = sectionLevelMap.get(sIdx) ?? [];
      const sectionByteStartFrac =
        totalBookSize > 0 ? cumulativeBytes / totalBookSize : totalChars > 0 ? sectionStart / totalChars : 0;
      for (const href of sectionHrefs) {
        this.tocStartFractions.set(href, sectionByteStartFrac);
      }

      // Enter DOM block when pages are present OR when this section has TOC entries to resolve.
      // The latter covers MOBI/AZW3 (totalLocs = 0) where we need fractions but have no pages.
      const hasTocEntries = sectionHrefs.length > 0 || anchorsInSection.length > 0;
      if (section.createDocument && (firstLoc <= lastLoc || hasTocEntries)) {
        try {
          const doc = await section.createDocument();

          // Estimate bytes before the first text node (head + xml/DOCTYPE/html/body open tags).
          // Foliate's fraction at page 1 is at the first text character, not byte 0.
          const headLen = doc.head?.outerHTML?.length ?? 0;
          const preambleEst = headLen + 200; // 200 ≈ xml declaration + DOCTYPE + html/body open tags

          // Refine section-level fractions now that we know the preamble size.
          if (sectionHrefs.length > 0 && totalBookSize > 0) {
            const refinedFrac = (cumulativeBytes + preambleEst) / totalBookSize;
            for (const href of sectionHrefs) {
              this.tocStartFractions.set(href, refinedFrac);
            }
          }

          const textNodes: Array<{ node: Text; start: number }> = [];
          let pos = 0;
          const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
          let tn: Node | null;
          while ((tn = walker.nextNode()) !== null) {
            textNodes.push({ node: tn as Text, start: pos });
            pos += (tn as Text).length;
          }
          /**
           * **Linear in the section, not in its locations times its size.** Locations rise, so one pointer walks
           * the text nodes once; and every CFI here is in this one unchanging document, so each parent's children
           * are indexed once (ORBIS patch 10). Each was redone per location before: a 3.9 MB section of 73,000 text
           * nodes and 2,500 locations took 12 s, all of it on the main thread — 0.1 s now, with identical CFIs.
           */
          if (firstLoc <= lastLoc) {
            withIndexCache(() => {
              let i = 0;
              for (let loc = firstLoc; loc <= lastLoc; loc++) {
                const targetOffset = Math.round((loc - 1) * charsPerLoc) - sectionStart;
                while (i < textNodes.length && textNodes[i].start + textNodes[i].node.length < targetOffset) i++;
                const hit = textNodes[i];
                if (hit && hit.start <= targetOffset) {
                  const range = doc.createRange();
                  range.setStart(hit.node, targetOffset - hit.start);
                  range.collapse(true);
                  // Same API as view.js: joinIndir(sectionBaseCFI, fromRange(range))
                  this.locNavCache.set(loc, cfiJoinIndir(baseCFI, cfiFromRange(range)));
                } else this.locNavCache.set(loc, baseCFI);
              }
            });
          }
          /**
           * Resolve start fractions for anchored TOC entries, from where each one's text begins — one walk for all of
           * them (`anchorTextStarts`). A search per anchor, comparing it with each text node in turn, was 32 s of a
           * first open on a section of 73,000 text nodes (DevTools profile, 2026-10-08).
           */
          const starts = anchorsInSection.length
            ? anchorTextStarts(
                doc,
                anchorsInSection.map((a) => a.anchorId)
              )
            : new Map<string, number>();
          for (const { href, anchorId } of anchorsInSection) {
            const nodeStart = starts.get(anchorId);
            if (nodeStart === undefined) continue;
            let frac: number;
            if (totalBookSize > 0 && sectionChars > 0 && sectionBytes > 0) {
              const bodyBytes = Math.max(1, sectionBytes - preambleEst);
              const byteOffset = preambleEst + (nodeStart / sectionChars) * bodyBytes;
              frac = (cumulativeBytes + byteOffset) / totalBookSize;
            } else {
              frac = totalChars > 0 ? (sectionStart + nodeStart) / totalChars : 0;
            }
            this.tocStartFractions.set(href, frac);
          }
          section.unload?.();
        } catch {
          if (firstLoc <= lastLoc) {
            for (let loc = firstLoc; loc <= lastLoc; loc++) {
              this.locNavCache.set(loc, baseCFI);
            }
          }
        }
      } else {
        for (let loc = firstLoc; loc <= lastLoc; loc++) {
          this.locNavCache.set(loc, baseCFI);
        }
      }
      globalCharOffset += sectionChars;
      cumulativeBytes += sectionBytes;
    }
  }

  /** Load-or-build, at most once at a time. See `loadOrBuildInFlight` for why the flags below cannot do this. */
  private loadOrBuildLocationIndex(totalLocs: number): Promise<void> {
    if (this.locationIndexReady) return Promise.resolve();
    // A later caller joins the attempt already running rather than starting a second one. Cleared on settle, so a
    // load that finds a stale cache — or fails — can be retried by the next relocate.
    this.loadOrBuildInFlight ??= this.loadOrBuildOnce(totalLocs).finally(() => {
      this.loadOrBuildInFlight = null;
    });
    return this.loadOrBuildInFlight;
  }

  private async loadOrBuildOnce(totalLocs: number): Promise<void> {
    if (this.locationIndexBuilding || this.locationIndexReady) return;
    if (this.ctx.currentFile) {
      const cache = await readLocsCache(this.ctx.app, this.ctx.currentFile);
      // Full cache: page navigation + word counts (EPUB / formats with location.total)
      if (
        cache &&
        totalLocs > 0 &&
        cache.totalLocs === totalLocs &&
        cache.sectionLocInfo.length > 0 &&
        cache.sectionWordCounts?.length &&
        // A cache with no headings would restore a book straight back to guessed chapter names, silently. Rebuild
        // instead: the measuring pass that produces them is the same one that produced the counts beside them.
        cache.sectionHeadings?.length
      ) {
        this.sectionLocInfo = cache.sectionLocInfo;
        this.locNavCache.clear();
        this.locStarts = null;
        for (const [k, v] of Object.entries(cache.locNavCache)) {
          this.locNavCache.set(parseInt(k), v);
        }
        this.sectionWordCounts = cache.sectionWordCounts;
        this.sectionCharCounts = cache.sectionCharCounts ?? [];
        this.sectionHeadings = cache.sectionHeadings ?? [];
        this.totalBookChars = this.sectionCharCounts.reduce((s, v) => s + v, 0);
        this.totalBookWords = this.sectionWordCounts.reduce((s, v) => s + v, 0);
        // Rebuild per-loc word counts for WPM sampling using the current layout's pages.
        this.rebuildLocWordCounts(this.sectionWordCounts);
        if (cache.tocStartFractions) {
          this.tocStartFractions = new Map(Object.entries(cache.tocStartFractions));
        }
        if (cache.anchorCharOffsets) {
          this.anchorCharOffsets = new Map(Object.entries(cache.anchorCharOffsets));
        }
        if (cache.tocAnchorIds) this.tocAnchorIds = new Map(Object.entries(cache.tocAnchorIds));
        this.locationIndexReady = true;
        this.ctx.debug(
          `locsCache load — pages:${this.locNavCache.size} sections:${this.sectionLocInfo.length}`,
          'index'
        );
        this.host.indexReady();
        return;
      }
      // Fraction-only cache: chapter fractions + word counts, no page navigation (AZW3/MOBI)
      if (
        totalLocs === 0 &&
        cache &&
        cache.totalLocs === 0 &&
        cache.sectionWordCounts?.length &&
        cache.sectionHeadings?.length && // see the full-cache branch above
        cache.tocStartFractions
      ) {
        this.sectionWordCounts = cache.sectionWordCounts;
        this.sectionCharCounts = cache.sectionCharCounts ?? [];
        this.sectionHeadings = cache.sectionHeadings ?? [];
        this.totalBookChars = this.sectionCharCounts.reduce((s, v) => s + v, 0);
        this.totalBookWords = this.sectionWordCounts.reduce((s, v) => s + v, 0);
        this.tocStartFractions = new Map(Object.entries(cache.tocStartFractions));
        if (cache.anchorCharOffsets) {
          this.anchorCharOffsets = new Map(Object.entries(cache.anchorCharOffsets));
        }
        if (cache.tocAnchorIds) this.tocAnchorIds = new Map(Object.entries(cache.tocAnchorIds));
        this.locationIndexReady = true;
        this.ctx.debug(
          `locsCache load (fraction-only) — sections:${cache.sectionWordCounts.length} fractions:${this.tocStartFractions.size}`,
          'index'
        );
        this.host.indexReady();
        return;
      }
      const reason = !cache
        ? 'no cache file'
        : totalLocs > 0 && cache.totalLocs !== totalLocs
          ? `totalLocs mismatch (cached:${cache.totalLocs} current:${totalLocs})`
          : totalLocs > 0 && !cache.sectionWordCounts?.length
            ? 'missing sectionWordCounts'
            : totalLocs > 0 && !cache.sectionLocInfo.length
              ? 'sectionLocInfo empty'
              : 'fraction-only cache miss';
      this.ctx.debug(`locsCache miss — ${reason}`, 'index');
    }
    void this.buildLocationIndex();
  }

  /** Discard the index and rebuild from scratch (the "rebuild locations" command). */
  async rebuild(): Promise<void> {
    this.locationIndexReady = false;
    this.locationIndexBuilding = false;
    this.sectionLocInfo = [];
    this.locNavCache.clear();
    this.locStarts = null;
    await this.buildLocationIndex();
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  /**
   * Go to where location `loc` starts. Returns false if the view isn't ready.
   *
   * **By the index once it is up**: the location's own start, so the page that opens is the one the number is on —
   * the same numbers the indicator shows. Before then, by foliate's byte positions, which count from 0 where the
   * indicator counts from 1.
   */
  navigateToLoc(loc: number): boolean {
    if (!this.ctx.foliateView || !this.ctx.lastLocation?.total) return false;
    const start = this.locationIndexReady ? this.locNavCache.get(loc) : undefined;
    if (start) {
      void this.ctx.foliateView.goTo(start);
      return true;
    }
    return this.navigateToByteLoc(loc - 1);
  }

  private navigateToByteLoc(loc: number): boolean {
    if (!this.ctx.foliateView || !this.ctx.lastLocation?.total) return false;
    // (page-1)/total undershoots because total=ceil(sizeTotal/1500) rounds up. Computing
    // the fraction directly as page*1500/sizeTotal (Foliate's 1500-byte location constant)
    // gives floor(frac*sizeTotal/1500)=page exactly, matching location.current after navigation.
    // Linear-only section sizes match Foliate's internal sizeTotal (linear=false excluded).
    const sections = this.ctx.bookSections as unknown as Array<{ size?: number; linear?: string }>;
    const linearSizeTotal = sections.reduce(
      (sum, s) => sum + (s.linear !== 'no' && (s.size ?? 0) > 0 ? (s.size ?? 0) : 0),
      0
    );
    const frac =
      linearSizeTotal > 0
        ? Math.max(0, Math.min(1, (loc * 1500) / linearSizeTotal))
        : Math.max(0, Math.min(1, loc / this.ctx.lastLocation.total));
    void this.ctx.foliateView.goToFraction(frac).then(() => {
      // In paginated mode the renderer snaps to the displayed-page start before our
      // target fraction. If we landed short, nudge forward one screen-page at a time.
      // Compared in the indicator's numbers, which count from 1 while the index is still being built.
      const landed = this.ctx.lastLocation?.current;
      if (landed != null && landed < loc + 1) void this.nudgeToLoc(loc + 1);
    });
    return true;
  }

  private async nudgeToLoc(target: number): Promise<void> {
    if (!this.ctx.foliateView) return;
    this.host.setNavigating(true);
    try {
      for (let i = 0; i < 3; i++) {
        if (!this.ctx.foliateView) break;
        const before = this.ctx.lastLocation?.current;
        await this.ctx.foliateView.next();
        const after = this.ctx.lastLocation?.current;
        if (after == null || after >= target || after === before) break;
      }
    } finally {
      this.host.setNavigating(false);
      if (this.ctx.lastCfi && this.ctx.currentFile) {
        void saveLocation(this.ctx.app, this.ctx.currentFile, this.ctx.lastCfi);
      }
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  getTotalLocs(): number | null {
    if (!this.locationIndexReady || this.sectionLocInfo.length === 0) return null;
    return Math.max(...this.sectionLocInfo.map((s) => s.startLoc + s.locCount - 1));
  }

  /**
   * The location a position is in — the last one that starts at or before it (`locAtCfi`). What the indicator shows
   * for the top of the page, and what a passage, a note or a bookmark stores for where it begins. Null until the
   * index is up, and for a book with no locations (some MOBI/AZW3, which foliate gives no total).
   */
  getLocForCfi(cfi: string): number | null {
    if (!this.locationIndexReady || this.locNavCache.size === 0) return null;
    this.locStarts ??= locStartsOf(this.locNavCache);
    return locAtCfi(this.locStarts, cfi);
  }

  /**
   * The location a contents entry begins in, by the same rule as every other number: from the characters before it —
   * the sections ahead of it, and its anchor's offset within its own. What chapter locations count from.
   */
  chapterStartLoc(href: string): number | null {
    const sIdx = this.hrefToSectionIndex(href);
    return sIdx < 0 ? null : this.locInSection(sIdx, this.anchorCharOffsets.get(href) ?? 0);
  }

  /** The location section `sIdx` begins in — for a book whose contents do not divide it into chapters. */
  sectionStartLoc(sIdx: number): number | null {
    return sIdx < 0 || sIdx >= this.sectionCharCounts.length ? null : this.locInSection(sIdx, 0);
  }

  private locInSection(sIdx: number, offset: number): number | null {
    const totalLocs = this.ctx.lastLocation?.total;
    if (!this.locationIndexReady || !totalLocs || this.totalBookChars <= 0) return null;
    let chars = offset;
    for (let k = 0; k < sIdx; k++) chars += this.sectionCharCounts[k] ?? 0;
    return locAtChar(chars, this.totalBookChars / totalLocs, totalLocs);
  }
}
