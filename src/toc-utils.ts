// Chapter labels repeat across parts in many books ("PART I > CHAPTER I",
// "PART II > CHAPTER I") — href is the only thing that's actually unique per
// TOC entry. flattenTocWithDisambiguation() flattens the TOC and qualifies
// only the labels that actually collide, so the common case (no repeated
// labels) renders unchanged.
//
// Many EPUBs (e.g. Project Gutenberg NCX files) declare "PART I", "CHAPTER
// I"..."CHAPTER VII", "PART II", "CHAPTER I"... as a flat list of siblings —
// there's no real parent/child nesting even though the book is structured
// that way. So a colliding label is qualified using whichever comes first:
// its structural parent (if the TOC really is nested), or else the nearest
// preceding entry whose label is unique across the whole book (the nearest
// "PART"-like landmark in document order).
//
// That landmark guess is only trustworthy when it actually disambiguates:
// if two occurrences of a label would land on the same qualifier (or one
// has no qualifier at all — e.g. a duplicate front-matter title with no
// "PART"-like structure before it), qualifying them would either still
// collide or pair the entry with an unrelated landmark. In that case the
// whole group falls back to the plain, unqualified label instead of
// guessing wrong.

export interface TocItemLike {
  label: string;
  href: string;
  subitems?: TocItemLike[] | null;
  /**
   * The spine section this entry is in, set once when the book loads (`markTocSections`) — what tells a contents entry
   * that CONTAINS chapters from one that is a chapter. Absent, or negative where an entry's position does not resolve
   * to a section, and an entry that cannot say is never opened.
   */
  section?: number;
}

/** Record each entry's spine section on the tree itself, so every surface that shapes chapters reads the same one. */
export function markTocSections(items: TocItemLike[], sectionOf: (href: string) => number): void {
  for (const item of items) {
    item.section = sectionOf(item.href);
    if (item.subitems?.length) markTocSections(item.subitems, sectionOf);
  }
}

/**
 * Whether a contents entry CONTAINS chapters rather than being one: at least two children, spread over more than one
 * of the book's files.
 *
 * **Because the top level is not always the chapters.** A Gutenberg novel lists its title page, then its title as a
 * heading with all 26 chapters under it, so a chapter as "a top-level entry and its subtree" would make the whole
 * book one row. An omnibus is the same shape one level up: each of its three novels is a whole book of chapters. Many
 * books have an entry like this.
 *
 * **Files, not text, decide it.** A chapter's subheadings live in its own file — Orbis's converter writes a nav entry
 * per heading, which is why `topLevelChapters` groups by top level at all — while parts, the novels of an omnibus and a
 * cookbook's recipes are files of their own. "No text of its own before its first child" is the wrong test both ways:
 * it splits nonfiction chapters that open straight into a subheading and a converted note into its headings, and keeps
 * whole any part that opens with an epigraph.
 *
 * One child is a heading under the entry, not a set of chapters, so it never opens.
 */
function containsChapters(node: TocItemLike): boolean {
  const kids = node.subitems ?? [];
  if (kids.length < 2) return false;
  const sections = [node, ...kids].map((n) => n.section);
  if (sections.some((s) => s === undefined || s < 0)) return false;
  return new Set(sections).size >= 2;
}

export interface FlatTocChapter {
  href: string;
  label: string;
  displayLabel: string;
}

/** A top-level contents entry, plus every href beneath it — see `topLevelChapters`. */
export interface TocBranch extends FlatTocChapter {
  /** This entry's own href first, then every descendant's, in contents order. */
  hrefs: string[];
}

/**
 * The contents page's TOP level, each entry owning its subtree.
 *
 * **What a chapter is, for a dialog that picks between them.** `flattenTocWithDisambiguation` is every entry at
 * every depth — fine for a Gutenberg EPUB, where the contents page is flat and the two are the same list. A book
 * converted from a folder of notes is not: Orbis's own markdown converter writes a nav entry per heading, so a few
 * dozen documents become hundreds of rows, and nobody is going to tick the right few dozen of those by hand.
 *
 * **The subtree is the point, not the trimming.** Both surfaces USE the selection to decide what gets written, so
 * a row that named only its own href would quietly lose content: the export splits each spine section at every
 * anchor the contents page declares and keeps only the chunks whose href was selected, so a document would export
 * as the paragraph above its first heading; and an annotation is filed under foliate's DEEPEST matching entry, so
 * notes taken under a subheading would match nothing. Ticking a document therefore selects the document and
 * everything under it.
 *
 * A flat contents page is unaffected — every entry is top level and its `hrefs` is just itself.
 */
export function topLevelChapters(items: TocItemLike[]): TocBranch[] {
  const flat = flattenTocWithDisambiguation(items);
  const labelFor = new Map(flat.map((e) => [e.href, e.displayLabel]));
  const subtree = (node: TocItemLike): string[] => {
    const out = [node.href];
    for (const child of node.subitems ?? []) out.push(...subtree(child));
    return out;
  };
  const rows: TocBranch[] = [];
  const row = (node: TocItemLike, hrefs: string[]): void => {
    // The disambiguated label, so a picker reads the same as the contents panel and the export list — and two
    // "Chapter 1"s from two novels of an omnibus stay two names.
    rows.push({ href: node.href, label: node.label, displayLabel: labelFor.get(node.href) ?? node.label, hrefs });
  };
  /**
   * A container opens into its children, and keeps a row of its own: its own text, which a part that opens with its
   * first chapter or an epigraph does have — or only its title, which the exports already treat as a divider (a heading
   * above the chapters it covers). Nothing is lost either way.
   */
  const visit = (node: TocItemLike): void => {
    if (!containsChapters(node)) return row(node, subtree(node));
    row(node, [node.href]);
    for (const child of node.subitems ?? []) visit(child);
  };
  for (const node of items) visit(node);
  return rows;
}

/**
 * Which row of `topLevelChapters` each href belongs to, by index. An href listed under two rows belongs to the first,
 * the one the contents names it under first.
 */
export function branchIndexByHref(branches: readonly TocBranch[]): Map<string, number> {
  const branchOf = new Map<string, number>();
  branches.forEach((branch, idx) => {
    for (const href of branch.hrefs) if (!branchOf.has(href)) branchOf.set(href, idx);
  });
  return branchOf;
}

/** A chapter and the finer contents entries beneath it — see `groupByTopLevel`. */
export interface TocChapterGroup {
  /** The chapter: a top-level contents entry. */
  chapter: FlatTocChapter;
  /** The entries under it that the caller listed, in the caller's order, never including the chapter itself. */
  sections: FlatTocChapter[];
}

/**
 * Fold an ordered, already-filtered list of contents entries into chapters with their sections.
 *
 * **Because a generated note has to say where a chapter starts.** Notes are filed under the DEEPEST contents entry
 * that matches, so a single note file grouped by that key is a flat run of subheadings — `Settings storage`,
 * `Phase 7: Accessibility` — with nothing marking which document each belongs to or where one ends. The chapter is
 * the heading, and the subheading sits under it.
 *
 * A flat contents page yields one group per entry with no sections.
 *
 * **An entry under no top-level node becomes its own chapter.** The uncategorized bucket (`''`) and an href the
 * format could not place both land here, and a heading of their own is the honest place for them: filing them under
 * a chapter they are not part of would be a claim the book never made.
 */
export function groupByTopLevel(order: readonly FlatTocChapter[], items: TocItemLike[]): TocChapterGroup[] {
  const branches = topLevelChapters(items);
  const branchOf = branchIndexByHref(branches);
  const groups: TocChapterGroup[] = [];
  const groupAt = new Map<number, TocChapterGroup>();
  for (const entry of order) {
    const idx = branchOf.get(entry.href);
    if (idx === undefined) {
      groups.push({ chapter: entry, sections: [] });
      continue;
    }
    let group = groupAt.get(idx);
    if (!group) {
      // Created by whichever of its entries came first — so a chapter appears even when only its subheadings were
      // annotated, which is the ordinary case.
      const branch = branches[idx];
      group = { chapter: { href: branch.href, label: branch.label, displayLabel: branch.displayLabel }, sections: [] };
      groupAt.set(idx, group);
      groups.push(group);
    }
    if (entry.href !== group.chapter.href) group.sections.push(entry);
  }
  return groups;
}

/**
 * How many ROWS a selection covers — the count a picker's header shows.
 *
 * **One definition, because reporting the wrong unit is invisible until it isn't.** A selection set holds a whole
 * subtree per ticked row, so its `size` counts hrefs, and shown beside a row total it claims more chosen than the list
 * has rows. Both dialogs ask this question and both must answer it the same way.
 *
 * Testing the head href is sufficient, and deliberately not "any descendant": selection only ever moves whole
 * subtrees, so the head is present exactly when the row is ticked, whereas a descendant test would report a row
 * as chosen on the strength of a leftover href.
 *
 * Takes the head href and nothing else, so both a `TocBranch` and the export dialog's own `ExportRow` fit — the
 * question is about rows, not about what a row happens to carry.
 */
export function selectedBranchCount(rows: readonly { href: string }[], selected: ReadonlySet<string>): number {
  return rows.filter((r) => selected.has(r.href)).length;
}

export function flattenTocWithDisambiguation(items: TocItemLike[]): FlatTocChapter[] {
  const flat: Array<{ href: string; label: string; parentLabel: string; parent: TocItemLike | null }> = [];
  const walk = (nodes: TocItemLike[], parent: TocItemLike | null) => {
    for (const node of nodes) {
      flat.push({ href: node.href, label: node.label, parentLabel: parent?.label ?? '', parent });
      if (node.subitems?.length) walk(node.subitems, node);
    }
  };
  walk(items, null);

  const counts = new Map<string, number>();
  for (const e of flat) counts.set(e.label, (counts.get(e.label) ?? 0) + 1);

  /**
   * **A top-level entry borrows no name when its twin is nested.** Borrowing the nearest unique entry before it is a
   * guess for a contents page with no nesting. Where another copy of the name sits under a real parent, that parent
   * already tells the two apart, and the guess named a page after the last section of the page before it: the user
   * guide's `Pronunciation – Library dashboards`. The top-level copy keeps its own name instead.
   */
  const nested = new Set(flat.filter((e) => e.parent).map((e) => e.label));

  let lastUniqueLabel = '';
  const withQualifier = flat.map((e) => {
    const collides = (counts.get(e.label) ?? 0) > 1;
    const qualifier = e.parentLabel || (nested.has(e.label) ? '' : lastUniqueLabel);
    if (!collides) lastUniqueLabel = e.label;
    return { ...e, qualifier };
  });

  const qualifiersByLabel = new Map<string, string[]>();
  for (const e of withQualifier) {
    if ((counts.get(e.label) ?? 0) > 1) {
      const list = qualifiersByLabel.get(e.label) ?? [];
      list.push(e.qualifier);
      qualifiersByLabel.set(e.label, list);
    }
  }
  // Every copy needs a qualifier of its own, except one top-level copy of a nested name, which keeps the plain name.
  const trustworthy = new Set<string>();
  for (const [label, qualifiers] of qualifiersByLabel) {
    const named = qualifiers.filter((q) => q);
    const plain = qualifiers.length - named.length;
    if (plain <= (nested.has(label) ? 1 : 0) && new Set(named).size === named.length) trustworthy.add(label);
  }

  /**
   * **A unique name never borrows a name from a flat neighbour.** The nearest unique entry before it is a guess at what
   * it belongs to, worth making only to tell a repeated name apart. Lending a structure word's name (PART, BOOK, …,
   * EPILOGUE) to whatever unique entry came next — once meant to keep a Part's chapters consistent — reached only the
   * first chapter after each Part, and ran across levels and into back matter: the next novel of a trilogy named after
   * the last Part of the one before, `Epilogue – Acknowledgments`, `Prologue – Chapter 1`, `Book Three – Appendix I`.
   * Dropping it removes many such names and adds none.
   *
   * A structure word still lends its name to its own nested children — `EPILOGUE – I` — since nesting is the book's
   * own statement. Prefixing a flat Part's whole run when any chapter in it repeats was measured too, and refused: one
   * repeated "Summary" put the Part's name on every chapter of a technical book, and a section called "Book of Days"
   * passed for a structure word. The narrower rule that survived is `nameNumberedRunsAlike`.
   */
  /**
   * **A parent any of whose children needs its name, lends it to all of them.** The same consistency the landmark rule
   * below gives a Part, for a parent whose name is not a structure word: an omnibus's novels. In a three-novel omnibus,
   * the first novel's "Chapter 01"–"Chapter 09" are unique and "Chapter 10" on repeat in the next, so without this the
   * list reads "Chapter 09", then "Novel One – Chapter 10". Only under a REAL parent in the tree — a flat contents
   * page's borrowed qualifier is a guess, and a group of guesses is not a group.
   */
  const lends = new Set<TocItemLike>();
  for (const e of withQualifier) if (e.parent && trustworthy.has(e.label)) lends.add(e.parent);

  const prefixes = withQualifier.map((e) => {
    const underPart = !!e.parent && isStructuralLandmark(e.parentLabel);
    const qualify =
      !!e.qualifier &&
      !isStructuralLandmark(e.label) &&
      (trustworthy.has(e.label) || underPart || (!!e.parent && lends.has(e.parent)));
    return qualify ? e.qualifier : '';
  });
  nameNumberedRunsAlike(withQualifier, prefixes);

  return withQualifier.map((e, i) => ({
    href: e.href,
    label: e.label,
    displayLabel: prefixes[i] ? `${prefixes[i]} – ${e.label}` : e.label,
  }));
}

const NUMBER_WORDS =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|' +
  'eighteen|nineteen|twenty|thirty|forty|fifty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth';
const NUMBERED_NAME = new RegExp(
  `^\\s*(\\p{L}+)\\.?\\s+(?:[ivxlcdm]+|\\d+|(?:${NUMBER_WORDS})(?:[- ](?:${NUMBER_WORDS}))?)\\b`,
  'iu'
);

/** The word before a name's number — `CHAPTER VI` and `Chapter 6: The Storm` both give "chapter" — or null without one. */
function numberedShape(label: string): string | null {
  return NUMBERED_NAME.exec(label)?.[1].toLowerCase() ?? null;
}

/**
 * **A unique chapter named like its flat Part's named chapters takes the Part's name too.** A first Part often has more
 * chapters than the rest, so its last few never repeat: PART I's `CHAPTER VI` stayed plain between `PART I – CHAPTER V`
 * and `PART II – CHAPTER I`, in the contents, the book folder's note names and the recording's tracks.
 *
 * Two conditions keep this from being the run-wide prefix that was refused. A chapter in the same Part must already
 * carry the Part's name, so a Part with nothing repeated lends nothing; and the two names must share a word before
 * their numbers, so an Acknowledgments, an appendix after a Part's chapters, a novel's title or a technical book's
 * unrepeated chapters beside a repeated "Summary" keep their own. The run ends at the next top-level structure word.
 * It renames very few chapters, each among the last chapters of a Volume longer than the ones before it, and none
 * wrongly.
 *
 * Only a top-level run: nesting already names a Part's children (`underPart`).
 */
function nameNumberedRunsAlike(
  entries: ReadonlyArray<{ label: string; parent: TocItemLike | null }>,
  prefixes: string[]
) {
  for (let i = 0; i < entries.length; i++) {
    const part = entries[i];
    if (part.parent || !isStructuralLandmark(part.label)) continue;
    const run: number[] = [];
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[j].parent) continue;
      if (isStructuralLandmark(entries[j].label)) break;
      run.push(j);
    }
    const named = new Set(run.filter((k) => prefixes[k] === part.label).map((k) => numberedShape(entries[k].label)));
    for (const k of run) {
      const shape = numberedShape(entries[k].label);
      if (!prefixes[k] && shape && named.has(shape)) prefixes[k] = part.label;
    }
  }
}

/** Whether a TOC label reads as a book-structure divider (Part/Book/Volume/…/Epilogue) — used to
 *  decide when its chapters should be prefixed with it for consistency. */
function isStructuralLandmark(label: string): boolean {
  return /^(part|book|volume|section|epilogue|prologue|act|canto)\b/i.test(label.trim());
}

/**
 * The next or previous chapter in the CONTENTS, as a reader counts them.
 *
 * **Because a spine section is not a chapter.** Moving the player's ⏮/⏭ by spine index is right only for books
 * where one file is one chapter. A book can have 80 contents entries inside 7 files — anchors within shared
 * documents — where three or four presses by spine index would run out of book while the panel beside it lists
 * eighty. The label over those buttons names the contents entry, so the buttons count the same thing.
 *
 * `from` is where the audio is, which may be an anchored href (`text.html#day23`) or a bare file. An exact match
 * comes first; failing that the first entry in the same FILE, so a position with no anchor of its own still finds
 * its place in the list — the same two-step `chapterDisplayLabel` uses to name it.
 *
 * Returns null at either end, and for a `from` that is in no entry at all: a caller with no answer here can fall
 * back to moving a whole section, which is what a book with no usable contents needs anyway.
 */
export function tocNeighbourHref(flat: readonly FlatTocChapter[], from: string, dir: 1 | -1): string | null {
  if (!flat.length) return null;
  const base = (h: string): string => h.split('#')[0];
  let idx = flat.findIndex((t) => t.href === from);
  if (idx < 0 && from) idx = flat.findIndex((t) => base(t.href) === base(from));
  if (idx < 0) return null;
  const next = idx + dir;
  return next >= 0 && next < flat.length ? flat[next].href : null;
}

// The grouping key for a bookmark/highlight/note: chapterHref when present,
// falling back to the (possibly non-unique) label for annotations saved
// without a chapterHref, and finally '' for anything uncategorized.
export function chapterKey(item: { chapterHref?: string; chapter?: string }): string {
  return item.chapterHref || item.chapter || '';
}
