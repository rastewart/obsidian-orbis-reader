// Every passage you marked and every note you wrote, as a PDF you can send to someone.
//
// **Real text, drawn by `pdf-lib`.** The alternative pure-JS route — render HTML and screenshot it through
// html2canvas — produces a PDF containing IMAGES of text: not searchable, not selectable, not readable by a
// screen reader, hundreds of megabytes for a book, and a memory profile no phone survives. Laying the text out
// here costs a word-wrap loop and buys a file the recipient can search, quote from and open anywhere.
//
// The digest is the marks and notes, grouped by chapter. It parses no EPUB — everything it needs is already in
// the annotation data, the same data reading records and note export read. The whole marked-up document is the
// same machinery plus block layout. See docs/design/marks-pdf.md.

import { type AnnotationMark, isInk, type Treatment } from './annotation-presets';
import type { AnnotationStyle } from './document-pdf';
import { t } from './i18n';
import type { MarkSelection } from './mark-filter';
import type { EmojiPictures } from './pdf-emoji';
import type { FontBytes } from './pdf-fonts';
import { collapseWhitespace, sanitizeForPdf } from './pdf-layout';
import { createPdfWriter, type MarkStyle, type PdfWriter } from './pdf-writer';
import type { Highlight, Note } from './progress';
import { cfiSortKey } from './reader/cfi-sort';
import type { NotesData } from './reader/export-format';
import { markParts } from './reader/export-format';
import { flattenTocWithDisambiguation, groupByTopLevel, type TocItemLike, topLevelChapters } from './toc-utils';

/**
 * Which of the two artifacts to produce.
 *
 * `digest` is the marks and notes with their context; `document` is the book itself with the marks drawn where
 * they were made and the notes as pins. They answer different questions — "what did you mark" and "here is your
 * document back with my comments" — and which one someone wants depends on why they are sending it.
 */
export type MarksPdfScope = 'digest' | 'document';

/** What the dialog decides. */
export interface MarksPdfOptions {
  scope: MarksPdfScope;
  /** Whole-document mode only: which chapters, and how that answer was arrived at. */
  chapterScope: ChapterScope;
  chapters: ChapterChoice[];
  /** Whole-document mode only: the title-and-legend page. Suppressed anyway when nothing is marked. */
  coverSheet: boolean;
  /**
   * Whole-document mode only: draw the marks and notes at all.
   *
   * Off gives a plain PDF of the book. The digest ignores it, because a digest of the marks without the marks is
   * not an artifact — which is also why the switch is shown in document mode only.
   */
  includeMarks: boolean;
  /** Who marked the document up. Optional, and omitted entirely rather than left blank when it is. */
  attribution: string;
  /**
   * Fetch the expanded character set before exporting.
   *
   * Pre-checked, and only ever shown when the fonts are not already on the device — the built-in fonts can draw
   * about 220 characters, so unticking it is choosing a PDF where an arrow, a Greek word or a mathematical symbol
   * prints as `?`. Declining is allowed rather than encouraged: an export offline should still produce a file.
   */
  downloadFonts: boolean;
  /**
   * What this export is narrowed to: which kinds of selection, and which marks on them.
   *
   * **Per export, and never written back to settings.** The dialog departs from the settings page for one run in
   * everything else it offers; a filter is the last thing that should outlive the run, since one left on quietly
   * produces a partial PDF a week later. See `MarkSelection`.
   */
  selection: MarkSelection;
  /** Vault folder, `/` for the root. */
  folder: string;
  /** Base name, no extension. */
  fileName: string;
}

/** One passage or note, flattened out of the two annotation types into the one shape the page draws. */
export interface MarkEntry {
  /** The passage, when there is one. A standalone note has none. */
  passage: string;
  /** What the reader wrote. Empty for a plain highlight. */
  note: string;
  markName: string;
  /** The wash color, or undefined for a mark with no wash. */
  color?: string;
  treatment?: Treatment;
  treatmentColor?: string;
  loc?: number;
  sort: string;
}

/** One contents entry's worth of marks — a chapter, or a subheading beneath one. */
export interface MarkSection {
  title: string;
  entries: MarkEntry[];
}

/**
 * A chapter, its own marks, and the subheadings beneath it that carry any.
 *
 * **Nested rather than a flat list with a depth on each row**: a `level` field makes `chapters.length` count
 * chapters and subheadings together, and that number is printed — "N marks and notes across M chapters" reads off
 * it. A count of the wrong unit is invisible until it isn't. Here the chapter count is the array length by
 * construction, and there is no second unit for it to be confused with.
 */
export interface MarkChapter extends MarkSection {
  /** In contents order, never including the chapter itself. Empty for a flat contents page. */
  sections: MarkSection[];
  /**
   * The contents href this chapter is, which is the key the picker's rows carry.
   *
   * Titles cannot do this job: they repeat across parts, which is the whole reason grouping keys on the href. A
   * chapter whose marks have no placeable href keys on its own title instead, and the picker never offers a row
   * for one — so a selection must keep anything it was not given the chance to tick.
   */
  key: string;
}

/**
 * The marks and notes, grouped by chapter, in reading order.
 *
 * **Chapters are ordered by the table of contents, not by name or by first appearance.** Chapter labels repeat
 * across parts ("PART II > CHAPTER I"), which is why `flattenTocWithDisambiguation` keys on the href — the same
 * identity reading records sort by, so the two features cannot disagree about what order a book is in.
 *
 * Entries inside a chapter sort by `cfiSortKey`, again as the records do: `loc` is too coarse, since a location
 * spans many paragraphs and eight highlights in one chapter routinely share one.
 *
 * Pure, and separated from the drawing for that reason: what ends up on the page in what order is the part worth
 * testing, and testing it should not need a PDF.
 */
export function groupMarksByChapter(data: NotesData): MarkChapter[] {
  const flat = flattenTocWithDisambiguation(data.tocItems ?? []);
  const order = new Map(flat.map((e, i) => [e.href, i]));
  /**
   * The contents' own name for an entry, in both forms.
   *
   * `displayLabel` carries a parent qualifier when the label repeats somewhere in the book — "Plugin Architecture
   * Overview – Commands" — which is what a FLAT list needs to tell two "Commands" apart. Under a chapter heading
   * that qualifier is the chapter's own name said twice, so a section takes the plain `label` and only a chapter
   * takes the qualified one. See `sectionTitle`.
   */
  const tocLabel = new Map(flat.map((e) => [e.href, e]));
  const buckets = new Map<string, MarkSection & { rank: number; key: string; plain: string }>();
  const bucketFor = (chapter: string | undefined, href: string | undefined): MarkSection => {
    const key = href ?? chapter ?? '';
    const existing = buckets.get(key);
    if (existing) return existing;
    const toc = href ? tocLabel.get(href) : undefined;
    const stored = chapter?.trim() || '';
    const made: MarkSection & { rank: number; key: string; plain: string } = {
      // The contents' label in preference to the one stored on the annotation: the two disagree when a book has
      // repeated chapter names, and the disambiguated one is what every other export calls this chapter. Falls
      // back to the stored name for a mark whose href the contents does not have — or never had.
      title: toc?.displayLabel || stored,
      plain: toc?.label || stored,
      entries: [],
      // The map key, carried so the fold below can be handed an identity that survives a mark with no href: those
      // bucket by TITLE, and giving them all an empty href would collapse them into one.
      key,
      // A chapter the contents does not name sorts after everything it does, rather than at the front by accident.
      rank: (href ? order.get(href) : undefined) ?? Number.MAX_SAFE_INTEGER,
    };
    buckets.set(key, made);
    return made;
  };

  const entryFor = (a: Highlight | Note, passage: string, note: string): MarkEntry => {
    const { name } = markParts(a, data.marks);
    const mark = a.markId ? data.marks?.find((m) => m.id === a.markId) : undefined;
    return {
      passage: passage.trim(),
      note: note.trim(),
      markName: name,
      // The mark decides the appearance; the annotation's own color is the fallback for one with no mark,
      // exactly as it is on the reading surface.
      color: mark ? mark.highlightColor : a.color,
      treatment: mark ? mark.treatment : a.treatment,
      treatmentColor: markLineColor(mark, a.color),
      loc: a.loc,
      sort: cfiSortKey(a.cfiRange),
    };
  };

  for (const h of data.highlights) bucketFor(h.chapter, h.chapterHref).entries.push(entryFor(h, h.text, ''));
  for (const n of data.notes) {
    bucketFor(n.chapter, n.chapterHref).entries.push(entryFor(n, n.selectedText ?? '', n.text));
  }

  /**
   * **Fold the buckets into chapters, exactly as a generated note set does.**
   *
   * A mark is filed under the DEEPEST contents entry that matches it, which is the right key for placing one and
   * the wrong one for a heading: grouped by that key alone the digest would be a flat run of subheadings —
   * `Settings storage`, `Phase 7: Accessibility` — with nothing saying which chapter each belonged to.
   * `groupByTopLevel` is the same fold `buildNotesMarkdown` uses, so the two exports of one book cannot disagree
   * about what a chapter is. A flat contents page yields one group per entry with no sections.
   *
   * Only buckets that HAVE marks are offered to the fold, so every group that comes back has at least one
   * non-empty member and no filtering is left to do here. A chapter with nothing marked directly under it and a
   * marked subheading beneath is the ordinary case, and it keeps its heading.
   */
  const withMarks = [...buckets.values()].filter((c) => c.entries.length).sort((a, b) => a.rank - b.rank);
  /** A bucket's marks in reading order, or none — a chapter the fold names may have no bucket of its own. */
  const sorted = (key: string): MarkEntry[] =>
    [...(buckets.get(key)?.entries ?? [])].sort((a, b) => a.sort.localeCompare(b.sort));
  const groups = groupByTopLevel(
    withMarks.map((c) => ({ href: c.key, label: c.plain, displayLabel: c.title })),
    data.tocItems ?? []
  );
  return groups.map((group) => ({
    key: group.chapter.href,
    // The chapter keeps the qualified name: it has no heading above it to be told apart by.
    title: group.chapter.displayLabel,
    // The chapter's own marks — the ones made above its first subheading — belong directly to it.
    entries: sorted(group.chapter.href),
    // `label`, not `displayLabel`: the chapter this sits under is the qualifier, already printed above it.
    sections: group.sections.map((s) => ({ title: s.label || s.displayLabel, entries: sorted(s.href) })),
  }));
}

/** `INK` means "whatever color the text is", which on a white page is black. Resolved here so the drawing code
 *  never sees the sentinel. */
function markLineColor(mark: AnnotationMark | undefined, fallback: string | undefined): string | undefined {
  const raw = mark ? (mark.treatmentColor ?? mark.highlightColor) : fallback;
  return isInk(raw) ? '#000000' : raw;
}

/**
 * Which chapters go into the whole document.
 *
 * `all` and `marked` are the two answers worth having as answers; `custom` is what the picker becomes once
 * individual chapters are ticked, so the control never claims a selection it no longer describes. Same shape as
 * the EPUB dialog's order picker, and for the same reason.
 */
export type ChapterScope = 'all' | 'marked' | 'custom';

/** One chapter of the book, for the dialog to list and the export to filter by. */
/**
 * One tickable chapter in the whole-document export.
 *
 * **A row is a top-level contents entry owning its subtree**, which is what Export to vault, Generate notes and
 * the digest already pick between — see `topLevelChapters`. Keying on SPINE INDEX would give one dialog two
 * unrelated notions of "chapter": a book of daily readings would offer 7 rows holding 1, 12, 9, 10, 3 and 1
 * chapters, so one tick would take twelve and "only chapter 1" could not be asked for.
 *
 * Deliberately the same shape as `ExportRow` in `BookExportModal`, field for field, because the two lists are
 * meant to be the same list.
 */
export interface ChapterChoice {
  /** The branch's own href — or, for an unlisted section, the key `sectionKeyOf` gives it. */
  key: string;
  /**
   * Every href this row owns: its own, then each contents entry beneath it.
   *
   * A row is a document, not a heading. Slicing happens at every anchor the contents declares, so a row naming
   * only its own href would take the text above the first subheading and drop the rest of the file.
   */
  hrefs: string[];
  title: string;
  marks: number;
  included: boolean;
  /** True for a spine section no contents entry points at — a cover, a title page. Named from the section itself. */
  unlisted: boolean;
  /** The spine index, for an unlisted row only: carried so naming does not have to search for the section. */
  index?: number;
}

/**
 * The chapter rows for a book, before anything has counted its marks.
 *
 * **Pure, and separated from the reader for one reason: it has to be comparable with `exportRows`.** The two
 * lists are meant to be the same list, and "meant to" is not a property a reader can check — a test can, over
 * real books, only if the walk is something a test can call. See `chapter-rows.test.ts`.
 *
 * The walk is the spine, not the contents page: a section nothing points at is exactly what the contents cannot
 * tell you about.
 */
export function chapterRowsFrom(opts: {
  toc: TocItemLike[];
  sections: readonly { id?: unknown; createDocument?: unknown }[];
  /** A contents href to a spine index, or -1 — `hrefToSectionIndex`, never a bare path lookup. */
  sectionIndexOf: (href: string) => number;
  /** A spine section's own key, for one the contents never reaches. */
  sectionKey: (section: { id?: unknown } | undefined, index: number) => string;
  /** Whether a section is the chapter before it continuing — see `continuationSections`. It belongs to that row. */
  continues?: (index: number) => boolean;
}): { rows: ChapterChoice[]; rowOfHref: Map<string, string>; rowOfSection: Map<number, string> } {
  const branches = topLevelChapters(opts.toc);
  const branchOf = new Map<string, number>();
  branches.forEach((branch, idx) => {
    for (const href of branch.hrefs) if (!branchOf.has(href)) branchOf.set(href, idx);
  });
  const bySection = new Map<number, string[]>();
  for (const entry of flattenTocWithDisambiguation(opts.toc)) {
    const index = opts.sectionIndexOf(entry.href);
    if (index < 0) continue;
    const list = bySection.get(index);
    if (list) list.push(entry.href);
    else bySection.set(index, [entry.href]);
  }

  const rowOfHref = new Map<string, string>();
  for (const [href, idx] of branchOf) rowOfHref.set(href, branches[idx].href);
  const rowOfSection = new Map<number, string>();
  const rows: ChapterChoice[] = [];
  const emitted = new Set<number>();
  for (let i = 0; i < opts.sections.length; i++) {
    const raw = opts.sections[i];
    // A section that will not render is one the export would skip anyway, so it is not offered. A non-linear one is
    // offered like any other — see `RawSection.linear` for why.
    if (!raw.createDocument) continue;
    const entries = bySection.get(i);
    if (entries) {
      for (const href of entries) {
        const idx = branchOf.get(href);
        // An entry under no top-level node cannot happen from a well-formed nav, but a book is a file somebody
        // else made: it becomes its own row rather than vanishing.
        if (idx === undefined) {
          rows.push({ key: href, hrefs: [href], title: href, marks: 0, included: true, unlisted: false });
          rowOfHref.set(href, href);
          continue;
        }
        if (emitted.has(idx)) continue;
        emitted.add(idx);
        const branch = branches[idx];
        rows.push({
          key: branch.href,
          hrefs: branch.hrefs,
          title: branch.displayLabel,
          marks: 0,
          included: true,
          unlisted: false,
        });
      }
      continue;
    }
    // The chapter before it, continuing: no row of its own, and its marks count toward that row.
    const previous = rows[rows.length - 1];
    if (previous && opts.continues?.(i)) {
      rowOfSection.set(i, previous.key);
      continue;
    }
    // A section the contents page says nothing about. Its name is read from the section itself afterwards; an
    // empty title is what that pass looks for.
    const key = opts.sectionKey(raw, i);
    rowOfSection.set(i, key);
    rows.push({ key, hrefs: [key], title: '', marks: 0, included: true, unlisted: true, index: i });
  }
  return { rows, rowOfHref, rowOfSection };
}

/**
 * Apply a scope to the chapter list, in place.
 *
 * `custom` deliberately does nothing: it is the state the list is already in, and re-deriving it from a rule would
 * discard the ticks that produced it.
 */
export function applyChapterScope(chapters: ChapterChoice[], scope: ChapterScope): void {
  if (scope === 'custom') return;
  for (const chapter of chapters) chapter.included = scope === 'all' || chapter.marks > 0;
}

/** One mark, as the legend explains it: the name, drawn wearing its own appearance. */
export interface LegendEntry extends MarkStyle {
  name: string;
}

/**
 * The marks this book actually uses, for the legend.
 *
 * **Only NAMED marks.** A mark's meaning lives in its name; a legend line showing a color with nothing beside it
 * explains nothing and takes a row to do it. An annotation with no mark has a color and no name, so it is drawn
 * on the page and left out of the legend — which is honest: there is no meaning attached to it.
 *
 * Deduped by mark id, so a mark used forty times is one line.
 */
export function legendFor(data: NotesData): LegendEntry[] {
  const seen = new Map<string, LegendEntry>();
  for (const a of [...data.highlights, ...data.notes]) {
    const mark = a.markId ? data.marks?.find((m) => m.id === a.markId) : undefined;
    const name = mark?.name.trim();
    if (!mark || !name || seen.has(mark.id)) continue;
    seen.set(mark.id, {
      name,
      color: mark.highlightColor,
      treatment: mark.treatment,
      treatmentColor: markLineColor(mark, a.color),
    });
  }
  return [...seen.values()];
}

/** How many entries a document holds, for the dialog to state before anything is written. */
/** What a narrowed export looks like: the digest's chapters, and how many marks each SPINE section still holds. */
export interface RegroupedMarks {
  chapters: MarkChapter[];
  /** Keyed by chapter ROW key, for the list's per-row counts and the "only chapters with marks" rule. */
  perChapter: Map<string, number>;
}

/**
 * **Counts the subheadings too.** Most of a book's marks are filed under one, so summing only each chapter's own
 * entries would report a fraction of them — and this number is not just displayed: `!counts.entries` is the guard
 * that decides whether there is anything to write at all, so a digest full of marks would refuse to export.
 */
export function countMarks(chapters: readonly MarkChapter[]): { entries: number; notes: number } {
  const all = chapters.flatMap((c) => [c.entries, ...c.sections.map((s) => s.entries)]).flat();
  return { entries: all.length, notes: all.filter((e) => e.note).length };
}

// ── Drawing ───────────────────────────────────────────────────────────────────

export interface MarksPdfMeta {
  title: string;
  author: string;
  attribution: string;
  /** Rendered date, formatted by the caller so this stays free of locale decisions. */
  date: string;
  /** Heading above the legend, passed in so this file holds no user-facing strings. */
  legendHeading: string;
  /** `page 4 of 12`, formatted by the caller for the same reason. */
  pageLabel: (page: number, total: number) => string;
}

/**
 * Draw the digest and return the file's bytes.
 *
 * The page cursor, the wrapping and the mark drawing all live in `pdf-writer.ts`, shared with the whole-document
 * builder — they differ in what goes on the page and in nothing about how a page works.
 */
export async function buildMarksPdf(
  chapters: readonly MarkChapter[],
  meta: MarksPdfMeta,
  legend: readonly LegendEntry[] = [],
  fonts?: FontBytes,
  /** Where an emoji's picture comes from — see pdf-emoji.ts. */
  pictures?: EmojiPictures
): Promise<Uint8Array> {
  const w = await createPdfWriter(fonts, pictures);
  w.doc.setTitle(sanitizeForPdf(meta.title));
  if (meta.author) w.doc.setAuthor(sanitizeForPdf(meta.author));
  w.doc.setCreator('Orbis Reader');

  const grey = { r: 0.35, g: 0.35, b: 0.35 };
  w.text(meta.title, { font: 'bold', size: 20 });
  const byline = [
    meta.author,
    meta.attribution && t('marks_pdf.attribution_byline', { name: meta.attribution }),
    meta.date,
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (byline) {
    w.space(4);
    w.text(byline, { font: 'sans', size: 9, color: grey });
  }
  // Inline rather than on a cover sheet of its own: a full page of front matter in front of a two-page list is
  // heavier than the list. The whole document gets the page, because a book starts on the next one.
  drawLegend(w, legend, meta.legendHeading);
  w.space(16);

  /**
   * A heading, at one of the two depths this digest has.
   *
   * **Size and weight, because a PDF has no `##`.** A generated note says the depth in its markup; here the only
   * vocabulary is how the line looks, so a subheading is the same bold face two points down with less air above
   * it. `level` is the outline depth as well — `pdf-writer` builds a nested sidebar, so the digest's contents tree
   * comes free with the second heading.
   */
  const heading = (title: string, level: 0 | 1): void => {
    if (!title) return;
    w.ensure(30);
    w.space(level ? 6 : 10);
    // The digest gets an outline too: it is shorter than the document but read the same way, by looking for the
    // chapter you remember marking.
    // `collapseGaps` because a heading is the one place the sanitizer's length-preserving filler shows: the
    // outline entry keeps the emoji (outline strings are UTF-16), the drawn line closes up after it.
    w.text(title, { font: 'bold', size: level ? 11 : 13, collapseGaps: true, outline: { title, level } });
    w.space(4);
  };

  /**
   * A quoted passage, ready to draw — **with every line break the book gave it.**
   *
   * No re-flowing of newlines that look like an editor's hard wrap: deciding which of an author's breaks were meant
   * is an inference about a book nobody here has read, and a rule for it needs a measured length ratio plus a
   * list-marker escape hatch to be right about two of them. A digest quotes the book; where the book breaks a line,
   * so does the quote, even where that reads oddly. `collapseWhitespace` still tidies runs of spaces, which is
   * typography rather than structure.
   */
  const flow = (text: string): string => collapseWhitespace(text);

  const drawEntries = (entries: readonly MarkEntry[]): void => {
    for (const entry of entries) {
      // A passage and its note are one thing; starting a page between them reads as two.
      w.ensure(30);
      w.space(8);
      if (entry.passage) {
        const text = flow(entry.passage);
        w.text(text, {
          font: 'body',
          size: 11,
          indent: 14,
          // The whole passage is the mark: in a digest there is no surrounding text for it to be part of.
          spans: [{ start: 0, end: text.length, style: entry }],
        });
      }
      if (entry.note) {
        w.space(2);
        w.text(collapseWhitespace(entry.note), {
          font: 'italic',
          size: 11,
          indent: 14,
          color: { r: 0.15, g: 0.15, b: 0.15 },
        });
      }
      // The mark's NAME, not its badge: a badge is an emoji, which a built-in PDF font cannot draw.
      const trail = [entry.markName, entry.loc != null ? `loc. ${entry.loc}` : ''].filter(Boolean).join('  ·  ');
      if (trail) {
        w.space(2);
        w.text(trail, { font: 'sans', size: 9, indent: 14, color: grey });
      }
    }
  };

  for (const chapter of chapters) {
    heading(chapter.title, 0);
    // The chapter's own marks first — they were made above its first subheading, so that is where they read.
    drawEntries(chapter.entries);
    for (const section of chapter.sections) {
      heading(section.title, 1);
      drawEntries(section.entries);
    }
  }

  w.numberPages({ label: meta.pageLabel });
  return w.save();
}

/**
 * Every annotation's appearance and note, keyed by id — what the whole-document builder needs to turn a block's
 * marks into something drawable.
 *
 * The same resolution the digest uses, and deliberately in the same file: the rule for what a mark looks like
 * when its `markId` no longer resolves is one rule, and having it in two places is how two exports of one book
 * come out different.
 */
export function annotationStyles(data: NotesData): Map<string, AnnotationStyle> {
  const styles = new Map<string, AnnotationStyle>();
  const add = (a: Highlight | Note, note: string): void => {
    const mark = a.markId ? data.marks?.find((m) => m.id === a.markId) : undefined;
    styles.set(a.id, {
      color: mark ? mark.highlightColor : a.color,
      treatment: mark ? mark.treatment : a.treatment,
      treatmentColor: markLineColor(mark, a.color),
      note,
      markName: markParts(a, data.marks).name,
    });
  };
  for (const h of data.highlights) add(h, '');
  for (const n of data.notes) add(n, n.text.trim());
  return styles;
}

/**
 * The legend: every named mark, drawn wearing its own appearance.
 *
 * **The name is the sample.** Drawing the word "Follow up" in the Follow up mark shows the color, the treatment
 * and the meaning in one line, and it is the same idea the mark manager uses on screen — the thing you pick looks
 * like the thing you configured.
 *
 * It exists because in a PDF a mark's meaning is otherwise carried only by its color and treatment. A recipient
 * opening this in a viewer that shows no annotation subjects has no other way to learn that blue means one thing
 * and purple another, and a plain highlight carries no note to explain itself at all.
 */
export function drawLegend(w: PdfWriter, entries: readonly LegendEntry[], heading: string): void {
  if (!entries.length) return;
  w.space(18);
  w.text(heading, { font: 'bold', size: 11 });
  w.space(4);
  for (const entry of entries) {
    w.space(4);
    w.text(entry.name, {
      font: 'body',
      size: 11,
      indent: 10,
      spans: [{ start: 0, end: entry.name.length, style: entry }],
    });
  }
}
