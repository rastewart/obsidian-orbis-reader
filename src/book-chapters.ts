// The book's chapters, as the reader counts them — one ordered list every surface shares.
//
// **An entry here is a chapter PART: one recordable stretch, one MP3, one stop for ⏮/⏭.** Almost always a chapter
// has exactly one part and the two words mean the same thing. A chapter has more than one only when a publisher's
// flow split landed mid-chapter — a book of daily readings has its Tenth Day's heading at the tail of one file and
// its reading at the head of the next — or, later, when a chapter runs past the recording length cap.
//
// **There is no Chapter type.** A chapter is a maximal run of parts sharing `chapterHref`, and the two things that
// care about the group — the name and the identity — are carried on every part instead. A second structure would
// make every consumer choose which one it wanted, and nearly all of them want the flat list.
//
// **Because three surfaces have to count the same thing.** The contents panel lists the contents entries, the
// player's ⏮/⏭ steps between chapters, and Record / Edit mix list one row per chapter. Counting by spine file
// agrees on an ordinary book, because one file IS one chapter; on a book that keeps eighty devotional Days inside
// seven files it disagrees completely: eighty chapters to read, seven rows to record, and each row an MP3 you could
// not skip within.
//
// The rule here is the one `collectByTocAnchors` uses on the export side: walk the SPINE, and let each section
// contribute the contents entries that land in it — or, when the contents mention it nowhere, contribute itself.
// That keeps front matter (a cover, a title page) in the list and in its place, and it leaves an ordinary book with
// exactly one chapter per section.
//
// **The entries are the contents page's TOP LEVEL, each covering its subtree** — the caller decides, by whether it
// passes `hrefs` (see `topLevelChapters`), and every surface that picks between chapters passes them. A book
// converted from a folder of notes is why: Orbis's own markdown converter writes a nav entry per heading, so a flat
// list would make hundreds of tracks of a few minutes each, which is not a set of tracks. An ordinary novel is
// unaffected — its contents page is flat, so its top level IS every entry — and a chapter that still runs past
// `LONG_MINUTES` is divided.
//
// Nothing here touches the vault. `chapterParts` needs only the spine and the contents; `splitLeadIns` and
// `mergeStubs` need where each part begins and how much text it holds, measured off the parsed documents the
// location index already opens (`anchorCharOffsets`). The passes run in that order and the order matters — see
// `mergeStubs`.

import { qualifyRepeatedNames } from './unlisted-sections';

/**
 * How much text above a file's first anchor counts as a chapter continuing, rather than page furniture.
 *
 * **A threshold, because the stub merge cannot absorb page furniture.** "Empty" for the merge means a handful of
 * characters, while a running header or a page-number artifact is fifty to five hundred — reassigning every lead-in
 * would turn each of those into a junk row.
 *
 * 2,000 characters is roughly 330 words, or twenty seconds read aloud: comfortably above any header, and far below
 * the chapter text a flow split strands, which runs to many minutes. Save as Markdown asks the same question of the
 * same text (`collectByTocAnchors`), so the two agree on where a chapter's words are.
 */
export const LEAD_IN_CHARS = 2000;

/**
 * Above this many estimated minutes, a chapter is too long to be one track and gets divided.
 *
 * **An hour, because it divides outliers rather than whole books.** A chapter over an hour is common; a book whose
 * average chapter is over an hour is rare, so this touches an unusual chapter rather than restructuring the book. A
 * higher trigger leaves single tracks too long to navigate with a scrub bar and skip buttons.
 */
const LONG_MINUTES = 60;

/**
 * Target length of each slice of a divided chapter.
 *
 * **Being exactly half the trigger is what makes a minimum-length rule unnecessary.** Slices are even — a chapter
 * of `total` becomes `ceil(total / 30)` pieces of `total / ceil(total / 30)` — so the shortest slice possible is at
 * the trigger itself: 60.1 minutes gives three of 20.0. Part length then oscillates between 20 and 30 as chapters
 * grow, and never falls below 20. Had the trigger equalled the chunk, a 30.1-minute chapter would give two of 15
 * and a floor would be needed; here one could never fire.
 *
 * Even rather than greedy for the same reason the rest of this file exists: greedy filling leaves a one-minute tail
 * on a 91-minute chapter, and a junk row is what this file exists to avoid.
 */
const SLICE_MINUTES = 30;

/**
 * How little text a part must cover to be a label rather than a chapter.
 *
 * **A threshold, because the markup cannot say.** Measuring the anchored element's own text works when the anchor
 * wraps its label; it breaks when the anchor wraps the whole chapter, and it measures nothing when the anchor is an
 * empty `<a id>` before the heading. Publishers write a label in whatever markup they like, so no rule over the
 * markup can find one.
 *
 * 250 characters is about 40 words, or sixteen seconds read aloud. A label runs to a few dozen characters and a real
 * chapter to well over a thousand, so the number sits in wide clear air on both sides.
 *
 * Getting it wrong is cosmetic: a book of genuinely one-line chapters would fold two rows into one, keeping both
 * names and recording all of the text. It costs a row and a skip point, never any audio.
 */
export const LABEL_CHARS = 250;

/** A contents entry, already disambiguated (see `flattenTocWithDisambiguation`). */
export interface ChapterTocEntry {
  href: string;
  displayLabel: string;
  /**
   * Every contents href this entry stands for, its own first — the subtree, when the caller supplies top-level
   * entries rather than a flat list (see `topLevelChapters`).
   *
   * **The aliases are what let a chapter be coarser than the contents page.** A reader inside a heading that is no
   * longer a chapter of its own still has to be named and placed, and `partIndexAt` answers by asking which part
   * COVERS an href. Absent, an entry stands only for itself, which is what a flat contents page means anyway.
   */
  hrefs?: readonly string[];
}

/** One recordable stretch of the book: one MP3, one row, one stop for ⏮/⏭. See the note at the top of the file. */
export interface ChapterPart {
  /** Ordinal in this list. A runtime convenience for iteration and rows — NOT the identity; see `chapterHref`. */
  index: number;
  /**
   * The identity of the chapter this part belongs to, and what a recording and a mix pointer are keyed on.
   *
   * **The href rather than the ordinal, because ordinals move.** Merging a stub into its body or splitting a long
   * chapter shifts every number after it, which would silently re-point every MP3 and every mix assignment. An
   * href does not move. A chapter no contents entry names has none, so it gets `section:<n>` — stable for the same
   * reason.
   */
  chapterHref: string;
  /**
   * EVERY contents href this part covers, `chapterHref` first.
   *
   * **Because a merged part must still be findable by the href it absorbed.** `tocHrefForRange` answers with the
   * deepest contents entry at a position, so a reader in the body of the First Day gets the body entry's href — and
   * after that entry is merged away, nothing has it as a `chapterHref`. Without the aliases the lookup falls
   * through to the section's first part and the player names the wrong chapter.
   */
  hrefs: readonly string[];
  /** 1-based position within its chapter, and how many parts the chapter has. `1` and `1` for almost every part. */
  part: number;
  partCount: number;
  /**
   * When this part is one slice of a longer stretch, which slice and how many — see `splitLongParts`.
   *
   * Absent for almost every part. A part with `slice` shares its `anchor` and `sectionIndex` with its siblings and
   * covers an even fraction of the range they'd otherwise share, so the length shown beside it and the units its
   * MP3 records are both that fraction. Slices are always consecutive in the list.
   */
  slice?: { index: number; count: number };
  /** The spine section this part lives in. Every part lives in exactly one — that is what keeps parts cheap. */
  sectionIndex: number;
  /** Where this part begins inside its section: an anchor, or null for the section's start. */
  anchor: string | null;
  /** The chapter's own name, without any part affix. */
  baseLabel: string;
  /** What a row shows: `baseLabel`, plus "N of M" when the chapter has more than one part. */
  label: string;
}

export interface ChapterSource {
  /** Number of spine sections. */
  sectionCount: number;
  /** The flattened contents, in reading order. */
  toc: readonly ChapterTocEntry[];
  /** Resolve a contents href to its spine section; negative when this format cannot place it. */
  sectionIndexForHref: (href: string) => number;
  /**
   * The id a contents href points at inside its section, or null when it starts the section. Its own `#fragment`
   * when absent; the reader passes `LocationIndex.anchorOf`, which also knows a Kindle entry's.
   */
  anchorForHref?: (href: string) => string | null;
  /** Name for a section the contents say nothing about — its own heading, else its number. */
  sectionLabel: (sectionIndex: number) => string;
  /**
   * Whether a section has a name of its own — a contents entry, or a heading read off the page.
   *
   * When false, `sectionLabel` is only giving back the section's number, which reads like a chapter number and is
   * not one. Told apart so untitled front matter can be named for what it is; see `groupFrontMatter`. Defaults to
   * true.
   */
  sectionHasOwnName?: (sectionIndex: number) => boolean;
  /** What untitled front matter is called — see `groupFrontMatter`. Left out to keep numbering it instead. */
  frontMatterLabel?: string;
  /** How a part reads when its chapter has several: `Tenth Day 2 of 2`. Supplied so the wording stays translated. */
  partLabel?: (baseLabel: string, part: number, partCount: number) => string;
  /**
   * The book's own title, used when the book has no chapter structure to name.
   *
   * **Because "Section 2" names nothing.** Set only when the contents name nothing usable, and then every unnamed
   * section belongs to one chapter called this — see `bookChapterHref`. An unnamed section inside a book that DOES
   * have contents is not the book and must not claim its title, so this stays undefined there and such a section
   * keeps its heading or its number.
   */
  bookLabel?: string;
  /**
   * Whether an unlisted section is the chapter before it continuing — see `continuationSections`, which is where
   * every list gets this answer. Left out, every unlisted section is a chapter of its own.
   */
  continues?: (sectionIndex: number) => boolean;
}

/** The fragment of an href, or null when it names a whole file. */
export function hrefAnchor(href: string): string | null {
  const i = href.indexOf('#');
  return i >= 0 && i < href.length - 1 ? href.slice(i + 1) : null;
}

/** The identity of a chapter no contents entry names — stable for the same reason an href is. */
export const sectionChapterHref = (sectionIndex: number): string => `section:${sectionIndex}`;

/** The identity of the chapter untitled front matter amounts to — see `groupFrontMatter`. */
export const frontMatterChapterHref = 'front-matter';

/**
 * The identity of the one chapter a book has when its contents name nothing usable.
 *
 * **Because there is no chapter structure to represent.** Many books name one contents entry or none, so every
 * section of them is unnamed — and `Section 2` is a name Orbis invents for something the book never names, appearing in
 * no contents panel and no heading. There the book IS the chapter: its sections all belong to it and its tracks number
 * continuously, so a novel in one Calibre split reads `<Title> 1 of 46` through `46 of 46` rather than `Section 2`,
 * `Section 3` and forty-four slices of `Section 4`.
 */
export const bookChapterHref = 'book';

/** Renumber `index`, and set `part`/`partCount`/`label` from runs of parts sharing a `chapterHref`. */
function renumber(parts: ChapterPart[], src: ChapterSource): ChapterPart[] {
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(p.chapterHref, (counts.get(p.chapterHref) ?? 0) + 1);
  const seen = new Map<string, number>();
  return parts.map((p, index) => {
    const partCount = counts.get(p.chapterHref) ?? 1;
    const part = (seen.get(p.chapterHref) ?? 0) + 1;
    seen.set(p.chapterHref, part);
    // No affix on a chapter that has only one part — which is nearly all of them, so nearly every book reads with
    // no affix at all.
    const label = partCount > 1 && src.partLabel ? src.partLabel(p.baseLabel, part, partCount) : p.baseLabel;
    return { ...p, index, part, partCount, label };
  });
}

/**
 * Build the book's chapter list, before any measuring.
 *
 * **The spine is walked, not the contents page.** Iterating the contents instead would skip every section nothing
 * points at — and would put front matter wherever the contents happen to mention it rather than at the front.
 * `collectByTocAnchors` walks the spine for the same reason, or a ticked "Cover" row would export no file.
 *
 * Two contents entries with the same href are one chapter: the first wins, because it is the one a reader stepping
 * forward arrives at. Entries that resolve to the same PLACE by different hrefs are not detectable here — that
 * needs the document — and are folded in by `mergeStubs` once the text has been measured.
 *
 * On a book with real contents every part comes back as `1 of 1`, and the passes that follow are what create real
 * parts. On a book with none, the sections are already parts of one chapter — see `bookChapterHref`.
 */
export function chapterParts(src: ChapterSource): ChapterPart[] {
  /**
   * Where an entry begins: the first of its hrefs this format can place, and the anchor from that same href.
   *
   * **Not the head href alone.** A top-level entry stands for its whole subtree, and a book is a file somebody else
   * made: the head can be an unanchored file the format cannot resolve while the headings under it resolve
   * perfectly. Placing it by the first href that answers keeps the chapter in the list, and in its place, rather
   * than dropping it and leaving its section to report itself as `Section 12`. The same rule as `exportRows`.
   */
  const placeOf = (entry: ChapterTocEntry): { sIdx: number; at: string } | null => {
    for (const href of entry.hrefs ?? [entry.href]) {
      if (!href) continue;
      const sIdx = src.sectionIndexForHref(href);
      if (sIdx >= 0 && sIdx < src.sectionCount) return { sIdx, at: href };
    }
    return null;
  };

  const bySection = new Map<number, Array<{ entry: ChapterTocEntry; at: string }>>();
  const seenHref = new Set<string>();
  for (const entry of src.toc) {
    if (!entry.href || seenHref.has(entry.href)) continue;
    const place = placeOf(entry);
    if (!place) continue; // an entry this format cannot place
    seenHref.add(entry.href);
    const list = bySection.get(place.sIdx);
    if (list) list.push({ entry, at: place.at });
    else bySection.set(place.sIdx, [{ entry, at: place.at }]);
  }

  const parts: ChapterPart[] = [];
  const push = (p: Omit<ChapterPart, 'index' | 'part' | 'partCount' | 'label'>): void => {
    parts.push({ ...p, index: parts.length, part: 1, partCount: 1, label: p.baseLabel });
  };
  for (let sIdx = 0; sIdx < src.sectionCount; sIdx++) {
    const entries = bySection.get(sIdx);
    const prev = parts[parts.length - 1];
    if (!entries?.length && prev && src.continues?.(sIdx)) {
      // The chapter before it, continuing: one more part of that chapter, as a lead-in is — see `splitLeadIns`. It
      // owns no contents href, because no contents entry points at it.
      push({ ...prev, hrefs: [], sectionIndex: sIdx, anchor: null });
      continue;
    }
    if (!entries?.length) {
      // A section the contents say nothing about. In a book with no usable contents at all it is part of the one
      // chapter the book amounts to (see `bookChapterHref`); otherwise it is a chapter of its own, named by its
      // heading or its number.
      push({
        chapterHref: src.bookLabel ? bookChapterHref : sectionChapterHref(sIdx),
        hrefs: [],
        sectionIndex: sIdx,
        anchor: null,
        baseLabel: src.bookLabel ?? src.sectionLabel(sIdx),
      });
      continue;
    }
    for (const { entry, at } of entries) {
      push({
        chapterHref: entry.href,
        // Every href the chapter covers, so a position under one of its headings still finds it — see `partIndexAt`.
        hrefs: entry.hrefs?.length ? [...entry.hrefs] : [entry.href],
        sectionIndex: sIdx,
        // The href that placed it, which is the head unless the head could not be resolved.
        anchor: (src.anchorForHref ?? hrefAnchor)(at),
        baseLabel: entry.displayLabel,
      });
    }
  }
  // Numbered here as well as after each later pass: a book with no usable contents already has several parts of
  // one chapter at this stage, and without the affix they would be identical rows. This is also the list the
  // reader sees before the location index lands.
  return renumber(qualifyPartNames(parts), src);
}

/**
 * `qualifyRepeatedNames`, over chapters rather than parts: a chapter's parts share its name on purpose, so the
 * question is asked of each chapter's first part and the answer given to all of them.
 */
function qualifyPartNames(parts: ChapterPart[]): ChapterPart[] {
  const firsts: ChapterPart[] = [];
  const seen = new Set<string>();
  for (const p of parts) if (!seen.has(p.chapterHref) && seen.add(p.chapterHref)) firsts.push(p);
  const names = qualifyRepeatedNames(
    // An unlisted section is its own chapter under a `section:` identity; anything else came from the contents.
    firsts.map((p) => ({ name: p.baseLabel, listed: p.chapterHref !== sectionChapterHref(p.sectionIndex) }))
  );
  const nameOf = new Map(firsts.map((p, i) => [p.chapterHref, names[i]]));
  return parts.map((p) => ({ ...p, baseLabel: nameOf.get(p.chapterHref) ?? p.baseLabel }));
}

/**
 * Where each of `anchors` sits in its document, counted in characters of text before it.
 *
 * **One walk, not one Range per anchor.** A file holding eighty Days would otherwise measure itself eighty times
 * over; here the text is crossed once and every anchor's offset falls out of the same count. The unit is the
 * character, because that is what the location index already measures a section in — so a chapter's share of its
 * section's words is a subtraction rather than a second pass over the text.
 *
 * `name=` is accepted alongside `id=`, since older EPUBs anchor their contents with `<a name="ch1">`. An anchor
 * that resolves to nothing is simply absent from the result: the chapter it belongs to then measures from wherever
 * the previous one ended, which is the honest answer when the book does not say.
 */
export function anchorCharOffsets(doc: Document, anchors: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  const body = doc.body;
  if (!body || !anchors.length) return out;

  const wanted = new Map<Element, string[]>();
  for (const anchor of anchors) {
    let el: Element | null;
    try {
      el = doc.getElementById(anchor) ?? doc.querySelector(`[name="${anchor.replace(/["\\]/g, '\\$&')}"]`);
    } catch {
      el = null; // an anchor that is not a usable selector
    }
    if (!el) continue;
    const list = wanted.get(el);
    if (list) list.push(anchor);
    else wanted.set(el, [anchor]);
  }
  return elementCharOffsets(doc, wanted);
}

/**
 * Characters of text before each element, in one walk — `anchorCharOffsets` for elements found some other way than
 * by id: foliate's own resolver, for the contents entries of a Kindle book (`kindle:pos:`) or a MOBI (`filepos:`).
 * Each element's keys are answered with its offset; an element outside `<body>` is absent.
 */
export function elementCharOffsets(
  doc: Document,
  wanted: ReadonlyMap<Element, readonly string[]>
): Map<string, number> {
  const out = new Map<string, number>();
  if (!doc.body || !wanted.size) return out;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.nodeValue?.length ?? 0;
      continue;
    }
    const names = wanted.get(node as Element);
    if (names) {
      for (const name of names) out.set(name, offset);
    }
  }
  return out;
}

/**
 * Where each anchor's text begins, in characters into its document — for anchors with text at or after them.
 *
 * The first text node inside or after an anchor starts exactly as many characters in as there are before the anchor,
 * so this is `anchorCharOffsets` plus the two edges it leaves: an anchor on `<body>` itself (Calibre's way, above
 * where that walk starts) begins the text, and one with no text after it has nowhere to begin. The location index
 * found the same node by `compareDocumentPosition` against each text node in turn, which was 32 s of one first open.
 */
export function anchorTextStarts(doc: Document, anchors: readonly string[]): Map<string, number> {
  const offsets = anchorCharOffsets(doc, anchors);
  const textLength = doc.body?.textContent?.length ?? 0;
  const out = new Map<string, number>();
  for (const anchor of anchors) {
    const at = doc.body && doc.getElementById(anchor) === doc.body ? 0 : offsets.get(anchor);
    if (at !== undefined && at < textLength) out.set(anchor, at);
  }
  return out;
}

/**
 * Which parts are a LABEL rather than a chapter — the question the merge asks.
 *
 * **Not the question the Record list asks.** A row is hidden when it holds NO text; a part is merged when it is too
 * short to be a chapter — which in practice means a contents entry pointing at a heading whose body the entry below
 * it claims. A book of daily readings has Day headings of about five words, so they pass the "any text" test and have
 * to fail this one. See `LABEL_CHARS` for the number, and for why no rule over the markup can find one instead.
 */
export function partIsLabelOnly(
  parts: readonly ChapterPart[],
  sectionChars: readonly number[],
  charOffsetOf: (href: string) => number | undefined
): boolean[] {
  const spans = partCharSpans(parts, sectionChars, charOffsetOf);
  return spans.map((span) => span.end - span.start < LABEL_CHARS);
}

/**
 * Where each chapter of ONE section begins, from its raw resolved start positions.
 *
 * The unit is whatever the caller measures in — characters when sizing a chapter for the Record list, reading units
 * when recording one — and the same normalization is applied either way, so what a row says it holds and what its
 * MP3 contains are the same stretch of the book by construction rather than by coincidence.
 *
 * Three rules, each for a book a simpler version gets wrong:
 * - **The first chapter of a section starts at 0**, so content above the file's first anchor belongs to the chapter
 *   that opens the file rather than to nobody.
 * - **Starts never run backwards.** A contents page whose anchors are out of document order cannot hand a later
 *   chapter a negative length.
 * - **An unknown start becomes the next known one**, so a chapter whose anchor resolved to nothing reads as empty
 *   and the chapter above it keeps the text up to that boundary. Filling forwards instead would give the unknown
 *   chapter everything its predecessor owned — the wrong one to shorten, since we know where the predecessor began.
 */
export function chapterBoundaries(raw: readonly (number | undefined)[], total: number): number[] {
  const starts: Array<number | undefined> = raw.map((v, k) => (k === 0 ? 0 : v));
  let lo = 0;
  for (let k = 0; k < starts.length; k++) {
    const at = starts[k];
    if (at === undefined) continue;
    lo = Math.max(lo, Math.min(at, total));
    starts[k] = lo;
  }
  let hi = total;
  for (let k = starts.length - 1; k >= 0; k--) {
    if (starts[k] === undefined) starts[k] = hi;
    else hi = starts[k] as number;
  }
  return starts as number[];
}

/**
 * How many words each PART holds.
 *
 * **Because the Record and Edit mix lists show a length beside every row**, and with one row per FILE that length
 * would be the file's — so eighty Days would each be offered as "1 hr 40 min" of the same seven files. The
 * measured character offsets say where each chapter starts; its share of its section's words follows from that.
 *
 * Words are apportioned by CHARACTERS rather than counted again, which is the same trade the location index makes
 * everywhere else: the count is already known per section, and a chapter's slice of it is a subtraction.
 *
 * **An anchor that never resolved reads as empty, not as long.** Where a chapter's start is unknown it is taken to
 * be the next known start — so the chapter measures nothing and the one before it keeps the stretch up to that
 * boundary. Filling it forwards instead would hand it everything its predecessor owned, which is the wrong chapter
 * to shorten: we know where the predecessor began and we do not know where this one does. Either way the section's
 * total stays whole, however many of its anchors were found.
 */
/**
 * The stretch of characters each part covers within its own section — the shared basis for every measurement.
 *
 * Boundaries come from the DISTINCT start positions in a section, because slices of one part share a position
 * (see `splitLongParts`): the group's range is worked out once from its neighbors, then divided evenly among its
 * slices. Doing it the other way round — treating every part as its own boundary — would give a sliced group's
 * first slice the whole range and the rest nothing.
 */
export function partCharSpans(
  parts: readonly ChapterPart[],
  sectionChars: readonly number[],
  charOffsetOf: (href: string) => number | undefined
): Array<{ start: number; end: number }> {
  const out = parts.map(() => ({ start: 0, end: 0 }));
  for (let i = 0; i < parts.length; ) {
    const sIdx = parts[i].sectionIndex;
    let j = i;
    while (j < parts.length && parts[j].sectionIndex === sIdx) j++;
    const chars = Math.max(1, sectionChars[sIdx] ?? 0);

    // One entry per distinct start: a run of slices contributes a single boundary, and remembers its own extent.
    const groups: Array<{ from: number; to: number; at: number | undefined }> = [];
    for (let k = i; k < j; k++) {
      const slice = parts[k].slice;
      if (slice && slice.index > 0 && groups.length) {
        groups[groups.length - 1].to = k + 1; // another slice of the group already open
        continue;
      }
      // A part with no anchor starts where its section does: an unreferenced section, a bare-file contents entry,
      // or a lead-in handed back to the previous chapter by `splitLeadIns`.
      const anchored = parts[k].anchor && parts[k].hrefs.length ? parts[k].hrefs[0] : null;
      groups.push({ from: k, to: k + 1, at: anchored ? charOffsetOf(anchored) : 0 });
    }

    const starts = chapterBoundaries(
      groups.map((g) => g.at),
      chars
    );
    for (let g = 0; g < groups.length; g++) {
      const from = starts[g];
      const to = g + 1 < groups.length ? starts[g + 1] : chars;
      const count = groups[g].to - groups[g].from;
      const step = (to - from) / count;
      for (let n = 0; n < count; n++) {
        out[groups[g].from + n] = { start: from + step * n, end: n + 1 === count ? to : from + step * (n + 1) };
      }
    }
    i = j;
  }
  return out;
}

/**
 * Gather untitled sections at the front of a book into one chapter, called what they are.
 *
 * **Because "Section 2" reads like a chapter number and is a file number.** Most books have more spine files than
 * contents entries, so a section with no name is the norm rather than the exception — a title page, a
 * copyright notice, a contents list rendered as plain text. Most hold no text and never appear, but the ones that
 * do would show up as `Section 2` at row 1, with no Section 1 or 3 anywhere near it, which reads as an off-by-one bug.
 *
 * Only at the FRONT. Untitled sections cluster there — a publisher who includes an appendix or a license almost
 * always lists it, while title and copyright pages routinely go unlisted — so naming a trailing one would invent a
 * term readers know less well for a case that barely happens. Those keep their number.
 *
 * **A measured pass, because an empty section must not take a number in the run.** A cover and a title page with
 * no text on them and are hidden from the recording list; counting them would leave
 * "Front matter 2 of 2" sitting alone with no 1 of 2 above it. So only sections with something to say are
 * gathered, and one on its own gets no affix at all.
 */
/**
 * Which rows at the front of a book are front matter — the rule, on its own, so two lists cannot disagree about it.
 *
 * **Shared because two lists need it, and a copy would diverge.** The recording list folds an unnamed prelude into
 * one honest label; if *Export to vault* did not, the same book would offer `Front matter` in one dialog and
 * `Section 2` in the other — a spine position shown next to real chapter names, which reads as an off-by-one rather
 * than as "the publisher never named this".
 *
 * Three conditions, and each one is load-bearing:
 *
 * - **Before the first row the contents names.** Front matter is a position, not a kind. Untitled sections cluster
 *   at the front — a publisher who includes an appendix or a license almost always lists it, while title and
 *   copyright pages routinely go unlisted — so a trailing unnamed section keeps its number rather than being given
 *   a term that would be wrong for it.
 * - **No name of its own.** A section carrying a heading has already told you what it is; `Cover` is a better label
 *   than `Front matter` and folding it would throw away the better one.
 * - **It has text.** An empty section takes no place in the run, or `Front matter 2 of 2` ends up sitting alone
 *   with no `1 of 2` above it.
 *
 * Returns a mask rather than new rows, because the two callers dispose of the answer differently: the recording
 * list MERGES the run into one part, while the export keeps its rows — they are separate files — and only relabels
 * them. Generic over the row, so neither caller has to speak the other's shape.
 */
export function frontMatterMask<T>(
  rows: readonly T[],
  spec: {
    /** Whether the contents names this row. The run ends at the first one that does. */
    named: (row: T, index: number) => boolean;
    /** Whether the row carries a name of its own — a heading the book marks up. */
    hasOwnName: (row: T, index: number) => boolean;
    /** Whether it holds any text at all. */
    hasText: (row: T, index: number) => boolean;
  }
): boolean[] {
  const firstNamed = rows.findIndex((row, i) => spec.named(row, i));
  // Nothing before the first named row, or nothing named at all: no front matter either way.
  if (firstNamed <= 0) return rows.map(() => false);
  return rows.map((row, i) => i < firstNamed && !spec.hasOwnName(row, i) && spec.hasText(row, i));
}

export function groupFrontMatter(
  parts: readonly ChapterPart[],
  src: ChapterSource,
  hasText: (index: number) => boolean
): ChapterPart[] {
  if (!src.frontMatterLabel || !src.sectionHasOwnName) return [...parts];
  const hasOwnName = src.sectionHasOwnName;
  const label = src.frontMatterLabel;
  // The rule itself lives in `frontMatterMask`, shared with the export dialog's list.
  const isFront = frontMatterMask(parts, {
    named: (part) => part.hrefs.length > 0,
    hasOwnName: (part) => hasOwnName(part.sectionIndex),
    hasText: (_part, i) => hasText(i),
  });
  const out = parts.map((part, i) =>
    isFront[i] ? { ...part, chapterHref: frontMatterChapterHref, baseLabel: label } : part
  );
  return renumber(out, src);
}

/**
 * Divide a chapter too long to be one track into even slices.
 *
 * **Because some chapters are the whole book.** A book that names one contents entry or none arrives as a single
 * chapter: a novel can be many hours in one file with no headings, no anchors and no page breaks, or one Calibre
 * split. Nothing can be detected in those, only divided.
 * And it is not only the pathological ones — a chapter over an hour is common.
 *
 * `ceil(total / SLICE_MINUTES)` slices of equal length, so every slice lands between 20 and 30 minutes and there is
 * no short tail. Slices carry no anchor of their own — nothing in the contents points at a point 40 minutes into a
 * chapter — so they share their parent's start and are told apart by `slice`, which both the length estimate and
 * the recorder divide by.
 *
 * Runs LAST of the three passes: `mergeStubs` can lengthen a part by folding a label into it, and a chapter's
 * total is not known until it has.
 */
export function splitLongParts(
  parts: readonly ChapterPart[],
  src: ChapterSource,
  minutesOf: (index: number) => number
): ChapterPart[] {
  const out: ChapterPart[] = [];
  for (const part of parts) {
    const count = Math.ceil(minutesOf(part.index) / SLICE_MINUTES);
    if (minutesOf(part.index) <= LONG_MINUTES || count < 2) {
      out.push({ ...part, index: out.length });
      continue;
    }
    for (let n = 0; n < count; n++) {
      out.push({
        ...part,
        index: out.length,
        // Only the first slice answers to the contents hrefs: a position resolved to this chapter's entry should
        // land at its beginning, not in the middle of it.
        hrefs: n === 0 ? part.hrefs : [],
        slice: { index: n, count },
      });
    }
  }
  return renumber(out, src);
}

export function partWordCounts(
  parts: readonly ChapterPart[],
  sectionChars: readonly number[],
  sectionWords: readonly number[],
  charOffsetOf: (href: string) => number | undefined
): number[] {
  const spans = partCharSpans(parts, sectionChars, charOffsetOf);
  return parts.map((part, i) => {
    const chars = Math.max(1, sectionChars[part.sectionIndex] ?? 0);
    const words = sectionWords[part.sectionIndex] ?? 0;
    return Math.round((words * (spans[i].end - spans[i].start)) / chars);
  });
}

/**
 * Give a file's lead-in to the chapter it actually belongs to, as a second part.
 *
 * **Because a flow split can land mid-chapter.** A book of daily readings can have a Day's heading at the very end of
 * one file and its reading at the head of the NEXT file — above that file's own first anchor. The Day then measures
 * one second while its reading is filed under the next Day's name.
 *
 * Two conditions:
 * - **The lead-in must be big enough to be prose** rather than a running header — see `LEAD_IN_CHARS`. Reassigning
 *   every lead-in, and trusting the stub merge to absorb the trivial ones, would make junk rows instead.
 * - **The previous part must be ANCHORED.** A part with no anchor already owns its whole file — a cover, a title page,
 *   a contents entry naming a bare file — so none of it can be sitting in the next one. When a cover is followed by a
 *   file that opens with Project Gutenberg's boilerplate header, without this the header would be handed to the cover,
 *   which would then read as "Section 1 2 of 2" with its first part hidden for holding no text.
 *
 * The book's FIRST section is left alone — its lead-in has no previous chapter to belong to.
 */
export function splitLeadIns(
  parts: readonly ChapterPart[],
  src: ChapterSource,
  charOffsetOf: (href: string) => number | undefined
): ChapterPart[] {
  const out: ChapterPart[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    const opensSection = !prev || prev.sectionIndex !== part.sectionIndex;
    const leadIn = opensSection && part.anchor ? (charOffsetOf(part.hrefs[0] ?? '') ?? 0) : 0;
    /**
     * **Only an ANCHORED part can have been cut off.** A part with no anchor already owns its whole file — a
     * cover, a title page, a contents entry naming a bare file — so none of it can be sitting in the next one,
     * and the lead-in there is unclaimed front matter rather than its continuation.
     *
     * The case is a cover that is an unreferenced section, followed by a file that opens with Project Gutenberg's
     * boilerplate header. Without this the header would be handed to the cover, which would then read as
     * "Section 1 2 of 2" — a second part whose first part is hidden for holding no text.
     */
    if (prev?.anchor && leadIn > LEAD_IN_CHARS) {
      // The stretch above this file's first anchor is the previous chapter continuing. It carries that chapter's
      // identity and name; it owns no contents href of its own, because no contents entry points at it.
      out.push({
        ...prev,
        index: out.length,
        hrefs: [],
        anchor: null,
        sectionIndex: part.sectionIndex,
      });
    }
    out.push({ ...part, index: out.length });
  }
  return renumber(out, src);
}

/**
 * Fold a part with nothing to say into the part below it, within the same file.
 *
 * **A contents entry holding only its own heading is not a chapter.** A Gutenberg book of daily readings nests each Day
 * under the previous reading's title in its NCX, and points at the Day's heading and its body separately, so every Day
 * would be two rows: a two-second stub and the reading. A novel in parts does it too, with `PART II`…`EPILOGUE`
 * sitting in the same file as their first chapter.
 *
 * **The earlier part's identity wins**, because it is the one ⏭ arrives at and the one the contents panel
 * highlights — and the absorbed href is kept as an alias so a position resolved to the body still finds the merged
 * part. The name joins, unless the later name already contains the earlier one (which the contents
 * disambiguator often arranges: `[p11] First Day. Contents – <RUNNING TITLE>.`).
 *
 * **Only within a file**, so a part never spans two documents and generation, the transport and the progress bar
 * all stay simple. A stub with nothing after it in its own file stays a short part — which is how a novel in
 * parts' `PART I` keeps its own one-second track, correctly: the publisher put it in a file of
 * its own, and that is the book saying it stands alone.
 *
 * **Runs backwards on purpose.** Several stubs can sit in a row, and walking from the end means each one folds into
 * an already-folded successor in a single pass. It must also run AFTER `splitLeadIns`, which creates new stubs: once
 * the Tenth Day's reading is taken back, the Eleventh Day's heading is left holding nothing but itself.
 */
export function mergeStubs(
  parts: readonly ChapterPart[],
  hasText: (index: number) => boolean,
  src: ChapterSource,
  joinLabels: (earlier: string, later: string) => string
): ChapterPart[] {
  const kept: ChapterPart[] = [];
  /**
   * Identities this pass retired, and what replaced them.
   *
   * **Because a chapter can have a part in ANOTHER file.** `splitLeadIns` builds a lead-in by cloning the part
   * before it, so the lead-in carries that part's identity — and when the merge then hands that part the earlier
   * stub's href, the lead-in is left behind in the next section holding the retired one. The two halves of one
   * chapter would never group, and a Tenth Day would read as two unrelated chapters rather than 1 and 2 of 2.
   */
  const renamed = new Map<string, string>();
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const next = kept[0]; // the part after this one, already folded
    const sameFile = !!next && next.sectionIndex === part.sectionIndex;
    if (hasText(part.index) || !sameFile) {
      kept.unshift(part);
      continue;
    }
    renamed.set(next.chapterHref, part.chapterHref);
    kept[0] = {
      ...next,
      chapterHref: part.chapterHref,
      hrefs: [...part.hrefs, ...next.hrefs],
      anchor: part.anchor, // the merged part starts where the stub did
      baseLabel: joinLabels(part.baseLabel, next.baseLabel),
    };
  }
  // Chase the chains: a run of three stubs retires two identities, the first pointing at the second.
  const resolve = (href: string): string => {
    let at = href;
    for (let hops = 0; hops < renamed.size + 1; hops++) {
      const to = renamed.get(at);
      if (!to || to === at) break;
      at = to;
    }
    return at;
  };
  return renumber(
    kept.map((p) => (renamed.has(p.chapterHref) ? { ...p, chapterHref: resolve(p.chapterHref) } : p)),
    src
  );
}

/**
 * The chapter a position is in, given its section and (optionally) the contents href it is under.
 *
 * The href is the precise answer and is tried first; without one — a position read straight from the text, with no
 * contents entry attached — the FIRST chapter of the section is the honest fallback, since that is the chapter a
 * section's start belongs to. Returns -1 when the section holds no chapter at all.
 */
export function partIndexAt(parts: readonly ChapterPart[], sectionIndex: number, href?: string | null): number {
  if (href) {
    // Every href the part covers, not just its identity — a merged part answers to the entry it absorbed.
    const exact = parts.findIndex((p) => p.hrefs.includes(href));
    if (exact >= 0) return exact;
  }
  return parts.findIndex((p) => p.sectionIndex === sectionIndex);
}

/**
 * Name a merged chapter, given the name of the part that was folded away and the name of the part that took it in.
 *
 * **Keep the later name when it already contains the earlier**, which the contents disambiguator often arranges:
 * `[p11] First Day. Contents` folded into `[p11] First Day. Contents – <RUNNING TITLE>.` needs no join, and joining
 * would print the Day twice. Otherwise both halves carry information neither has alone — `NOTE A.` names the note
 * and `Patience as Ownership.` says what it is — so they join.
 */
export function joinChapterLabels(earlier: string, later: string): string {
  if (!earlier) return later;
  if (!later || later.includes(earlier)) return later || earlier;
  return `${earlier} – ${later}`;
}

/**
 * The contents href to navigate to for this part's start, or null when it starts where its file does.
 *
 * **Not `chapterHref`, which is an identity and not always a destination.** A lead-in part carries the identity of
 * a chapter whose first part is in the PREVIOUS file, so navigating to it would jump backwards; a part standing for
 * a whole unreferenced section carries a synthetic `section:<n>` that is no href at all. Both start at the head of
 * their own file, which is what a null answer means — take the section's start instead.
 */
export function partStartHref(part: ChapterPart): string | null {
  return part.anchor && part.hrefs.length ? part.hrefs[0] : null;
}

/**
 * The part a **Next chapter** or **Previous chapter** command lands on, from the part at `from`; null when there is
 * none in that direction.
 *
 * **Chapters, not parts or files.** A chapter's parts share its `chapterHref` and are consecutive, so stepping skips
 * the rest of the one you are in; and one file can hold several chapters, so stepping the spine would skip them.
 * Previous goes to the start of the chapter BEFORE this one, from anywhere in this one — the Contents tab is how to
 * get back to the start of this one.
 */
export function chapterStep(parts: readonly ChapterPart[], from: number, direction: 1 | -1): number | null {
  if (from < 0 || from >= parts.length) return null;
  const here = parts[from].chapterHref;
  if (direction === 1) {
    for (let i = from + 1; i < parts.length; i++) if (parts[i].chapterHref !== here) return i;
    return null;
  }
  let start = from;
  while (start > 0 && parts[start - 1].chapterHref === here) start--;
  if (start === 0) return null;
  let prev = start - 1;
  while (prev > 0 && parts[prev - 1].chapterHref === parts[start - 1].chapterHref) prev--;
  return prev;
}

/**
 * `chapterStep` from the page on screen, judged by the contents entry at the page's END — foliate's page entry, the
 * last heading that starts at or before what the page shows.
 *
 * **The end, not the top**, which is what the chapter counter reads. A chapter starts wherever the text before it
 * ends, so Next chapter lands with the heading part-way down a page whose top is still the chapter before; judged from
 * the top, the next chapter was the one just arrived at, and every Next went back to the same page. From the end, a
 * chapter you can already see has been reached: Next goes to the first one starting beyond the page, and Previous to
 * the start of the chapter before the last one on screen.
 */
export function chapterStepFromPage(
  parts: readonly ChapterPart[],
  sectionIndex: number,
  pageEndHref: string | null,
  direction: 1 | -1
): number | null {
  return chapterStep(parts, partIndexAt(parts, sectionIndex, pageEndHref), direction);
}

/** Whether the book has one chapter to step between at most — a book whose contents name nothing usable. */
export function hasOneChapter(parts: readonly ChapterPart[]): boolean {
  return new Set(parts.map((p) => p.chapterHref)).size <= 1;
}

/** The parts of one chapter, in order — for the few callers that need the group rather than the flat list. */
export function partsOfChapter(parts: readonly ChapterPart[], chapterHref: string): ChapterPart[] {
  return parts.filter((p) => p.chapterHref === chapterHref);
}
