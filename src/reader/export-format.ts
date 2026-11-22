import { type AnnotationMark, badgeOf, emojiForColor } from '../annotation-presets';
import { sanitizeName } from '../book-extractor';
import { chapterNoteTitle } from '../chapter-name';
import { resolveFrontmatterKey, resolveToken } from '../i18n';
import { isoToday } from '../library/dates';
import { yamlString } from '../library/record-note';
import { bookTextLine } from '../markdown-line';
import type { Bookmark, Highlight, Note } from '../progress';
import { DEFAULT_CHAPTER_FILE_TEMPLATE, DEFAULT_NOTE_STYLE_CONFIG, type NoteStyle } from '../settings';
import {
  chapterKey,
  type FlatTocChapter,
  flattenTocWithDisambiguation,
  groupByTopLevel,
  type TocItemLike,
} from '../toc-utils';
import { inReadingOrder, markCfi } from './cfi-sort';
import { chapterHeadingMark, contentsEntry, resolveChapterAnchors, resolveChapterWikiLinks } from './contents-links';
import { bookLinkLabel, plainVaultLinks } from './portable-markdown';

// Pure formatting for notes export and clipboard copy. Every function here is a pure function of its arguments — no
// `this`, no Obsidian API, no vault I/O — so it can be unit-tested by constructing a NotesData literal. The view
// assembles that snapshot (ReaderContext.notesData()); NotesExporter/ClipboardExporter call these builders and handle
// the I/O. See docs/design/reader-architecture.md.

export interface NotesBookMeta {
  title: string;
  author: string;
  publisher: string;
  language: string;
  pubdate: string;
  description: string;
}

/** Immutable snapshot of the reader state that export formatting reads. */
export interface NotesData {
  filePath: string;
  fileBasename: string;
  meta: NotesBookMeta;
  highlights: Highlight[];
  notes: Note[];
  bookmarks: Bookmark[];
  tocItems: TocItemLike[];
  bookSectionCount: number;
  frontmatterKeyLanguage: string;
  /**
   * The book's own marks, for resolving each annotation's `markId` into a badge and a name.
   *
   * Markdown has no color, so the badge and the name are the ONLY things about a mark that survive an export — which is
   * why `AnnotationMark.badge` exists at all. An annotation with no mark falls back to the color's own emoji.
   */
  marks?: readonly AnnotationMark[];
}

export type ChapterBucket = {
  title: string;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  notes: Note[];
  minLoc: number;
};

export type AnnotBucket = { bookmarks: Bookmark[]; highlights: Highlight[]; notes: Note[] };
export type FlatTocEntry = FlatTocChapter & { tocIndex: number };
export type ChapterPlan = FlatTocEntry & { fileName: string; filePath: string; sectionIndex: number };

/**
 * Whether a book holds anything `Save annotations as PDF` could draw.
 *
 * **Bookmarks do not count.** `marks-pdf.ts` groups `highlights` and `notes` and never reads `bookmarks`, so a
 * book carrying three bookmarks and nothing else would produce an empty digest.
 *
 * **This gates that one command and no others.** The obvious generalization — gray out everything that exports what you
 * added to a book — is wrong: a notes style outlines the whole book by default, so `Generate notes` is useful on a book
 * nobody has marked and withholding it removes the reason some readers generate notes at all.
 *
 * Synchronous, because a menu is built synchronously and `notesData()` is already in memory — which is what makes
 * the rule affordable on every open of the ⋯ menu.
 */
export function hasMarksToExport(data: Pick<NotesData, 'highlights' | 'notes'>): boolean {
  return data.highlights.length + data.notes.length > 0;
}

/**
 * What an exported annotation says about its mark: `🟡➖ Follow up: ` — badge, name, colon.
 *
 * Markdown carries no color, so this is the whole of a mark that survives leaving the reader. The badge
 * (`badgeOf`) covers the appearance and the name covers the meaning; an unnamed mark contributes just its
 * badge, and the colon only appears when there is a name to separate.
 *
 * A color-only glyph is not enough on its own: two marks can share a color and differ by treatment, which a color-only
 * glyph flattens precisely where it travels furthest. `emojiForColor` handles the whole palette plus hue-bucketing for
 * a custom color, and is the fallback for an annotation with no `markId`.
 */
export function markPrefix(annot: { markId?: string; color?: string }, marks?: readonly AnnotationMark[]): string {
  const { badge, name } = markParts(annot, marks);
  if (!badge) return '';
  return name ? `${badge} ${name}: ` : `${badge} `;
}

/** The badge and name separately, for a template that wants its own arrangement. */
export function markParts(
  annot: { markId?: string; color?: string },
  marks?: readonly AnnotationMark[]
): { badge: string; name: string } {
  const mark = annot.markId ? marks?.find((m) => m.id === annot.markId) : undefined;
  if (!mark) return { badge: annot.color ? emojiForColor(annot.color) : '', name: '' };
  return { badge: badgeOf(mark), name: mark.name.trim() };
}

/**
 * One exported annotation, rendered through its style's template.
 *
 * Substitution matches `applyFrontmatterTemplate`: `{{token}}`, unknown or absent tokens resolve to EMPTY.
 * That is what makes a template safe to edit — a typo loses a value, it never breaks the file — and it is
 * also the mechanism for turning a part off. Removing `{{mark}}` is how a style stops exporting marks at all,
 * which is why no boolean sits beside this: a token that sometimes silently resolves to nothing because of a checkbox
 * elsewhere is not a template anyone can reason about.
 */
export function renderAnnotationLine(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}

/** The tokens one highlight or note offers a template. `selection` is empty for a highlight. */
export function annotationVars(
  annot: { markId?: string; color?: string; loc?: number; chapter?: string; createdAt?: number },
  link: string,
  marks: readonly AnnotationMark[] | undefined
): Record<string, string> {
  const { badge, name } = markParts(annot, marks);
  return { ...commonVars(annot, link), mark: markPrefix(annot, marks), mark_badge: badge, mark_name: name };
}

/** What every kind of saved content can say about itself: where it is, when it was made. `{{date}}` is ISO,
 *  matching the frontmatter template's `{{today}}` rather than inventing a second date format. */
export function commonVars(
  annot: { loc?: number; chapter?: string; createdAt?: number },
  link: string
): Record<string, string> {
  return {
    link,
    loc: annot.loc != null ? String(annot.loc) : '',
    chapter: annot.chapter ?? '',
    date: annot.createdAt ? new Date(annot.createdAt).toISOString().split('T')[0] : '',
  };
}

/** A bookmark's line. No mark and no text of its own — see BOOKMARK_LINE_VARIABLES for why no `{{label}}`. */
/** How a line links into the book: a deep link in the vault, the location as text in a copy that leaves it. */
type BookLink = (cfi: string, loc?: number) => string;

function bookmarkLine(b: Bookmark, config: NoteStyle['config'], link: BookLink): string {
  return renderAnnotationLine(config.bookmarkLineTemplate, {
    ...commonVars(b, link(b.exactCfi ?? b.cfi, b.loc)),
    // A bookmark with no `kind` was made while reading.
    kind: b.kind ?? 'reading',
  });
}

/**
 * The book's words, in the two shapes a template might want them: raw, and as a `> "…"` block.
 *
 * The same pair on both templates, because a highlight's passage and the passage a note hangs on are the
 * same thing. The block exists as its own token because a single-line template cannot express "this line
 * only when the value exists" — a note with no passage must leave no stray `> ""` behind — and because a
 * shape is not a meaning: one token resolving to raw text here and a quoted block there would be one name for two
 * things.
 *
 * **Takes the passage as the book has it, newlines and all**, and does the shaping here — a caller that flattened it
 * first would export a highlight that began on a heading as `Settings storage Plugin settings are an…`. Every break the
 * book gave it is a break the author meant, and the two shapes differ in what they can do with one:
 *
 * - `selection_block` carries it, by putting `> ` on every line. A blockquote whose second line lacks the marker
 *   stops being a blockquote at that line, so the prefix is what keeps a two-paragraph quote one quote.
 * - `selection` cannot: it is substituted mid-line — the stock highlight template is `- {{mark}}"{{selection}}"
 *   — {{link}}` — and a raw newline there ends the list item. It stays one line, which is a property of where it
 *   goes rather than a judgment about the passage.
 */
export function selectionVars(selection: string | undefined): Record<string, string> {
  const passage = selection?.trim() ?? '';
  if (!passage) return { selection: '', selection_block: '' };
  return {
    selection: passage.replace(/\n/g, ' '),
    // `> ` on the blank line between paragraphs too, or the quote ends there.
    selection_block: `> "${passage.split('\n').join('\n> ')}"\n\n`,
  };
}

/** What `orbis_generated` says on every note a note set is made of: a book's annotations, not a record of a book. */
export const GENERATED_NOTE_SET = 'note-set';

/** The heading a note set opens with — the book's own title, or the file's name when it has none. */
function noteSetHeading(data: Pick<NotesData, 'meta' | 'fileBasename'>): string {
  return data.meta.title.trim() || data.fileBasename;
}

/**
 * The same pair a reading record carries: `book` to open the book, `book_title` for a Base to group on. Written by
 * Orbis on the chapter and contents notes, whose frontmatter is its own; a single note's comes from the style's
 * template, whose default has both.
 */
function bookIdentityLines(linkPath: string, title: string, key: (canonical: string) => string = (k) => k): string[] {
  return [`${key('book')}: ${yamlString(`[[${linkPath}]]`)}`, `${key('book_title')}: ${yamlString(title)}`];
}

/**
 * A frontmatter template with its placeholders filled, each value **escaped for YAML's double-quoted form** — how the
 * default template quotes every text value. Book metadata is the book's to write: an unescaped `"` in a chapter title
 * ends the string early, and a multi-line `dc:title` makes invalid YAML, so Obsidian drops the whole property block.
 * See `yamlString` and docs/design/security.md. A value placed unquoted gains visible escapes, but only a value that
 * would have broken the YAML unquoted anyway.
 */
function fillFrontmatterTemplate(template: string, vars: Record<string, string>): string {
  const clean = template
    .trim()
    .replace(/^---\s*\n/, '')
    .replace(/\n\s*---$/, '')
    .trim();
  return clean.replace(/\{\{(\w+)\}\}/g, (_, k: string) => yamlString(vars[resolveToken(k)] ?? '').slice(1, -1));
}

/** The keys Orbis writes on a chapter note, and drops from the template. Not `title`: that is the template's, and
 *  `{{subject}}` is what lets one template title a single note and a chapter note both. */
const SYSTEM_CHAPTER_KEYS = new Set([
  'orbis_generated',
  'chapter',
  'book',
  'book_title',
  'note_set',
  'has_bookmarks',
  'has_passage_selections',
  'has_notes',
  'prev',
  'next',
  'toc',
  'open_chapter',
]);

export function resolveChapterFileName(
  template: string,
  ctx: { index: string; chapter: string; title: string; style: string }
): string {
  let name = template
    .replace(/\{\{index\}\}/g, ctx.index)
    .replace(/\{\{chapter\}\}/g, ctx.chapter)
    .replace(/\{\{title\}\}/g, ctx.title)
    .replace(/\{\{style\}\}/g, ctx.style);
  name = sanitizeName(name);
  return name || `${ctx.index} - ${ctx.chapter}`;
}

export function makeNoteSetSlug(bookBasename: string, styleId: string): string {
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slugify(bookBasename)}--${styleId}`;
}

export function buildMocContent(ctx: {
  bookTitle: string;
  bookLinkPath: string;
  author: string;
  styleName: string;
  noteSetSlug: string;
}): string {
  const today = isoToday();
  return [
    '---',
    `orbis_generated: "${GENERATED_NOTE_SET}"`,
    // What the default template titles a single note, so the two formats' front pages read alike — and neither
    // reads the same as the book's own text exported by Save as Markdown.
    `title: ${yamlString(`${ctx.bookTitle} Notes`)}`,
    `author: ${yamlString(ctx.author)}`,
    ...bookIdentityLines(ctx.bookLinkPath, ctx.bookTitle),
    // The set's id, as every chapter note carries it, so a Replace finds this note among the set's own — see
    // `earlierSetNotes`. The Base below then has to leave this note out of its own table.
    `note_set: ${yamlString(ctx.noteSetSlug)}`,
    `style: ${yamlString(ctx.styleName)}`,
    `generated: "${today}"`,
    '---',
    '',
    `# ${bookTextLine(ctx.bookTitle)} — Notes`,
    '',
    '```base',
    'filters:',
    '  and:',
    `    - note_set == "${ctx.noteSetSlug}"`,
    '    - file.path != this.file.path',
    'properties:',
    '  note.chapter:',
    '    displayName: "#"',
    '  file:',
    '    displayName: Chapter',
    '  note.has_bookmarks:',
    '    displayName: Bookmarks',
    '  note.has_passage_selections:',
    '    displayName: Passage selections',
    '  note.has_notes:',
    '    displayName: Notes',
    'views:',
    '  - type: table',
    '    name: Chapters',
    '    order:',
    '      - chapter',
    '      - file',
    '      - has_bookmarks',
    '      - has_passage_selections',
    '      - has_notes',
    '    sort:',
    '      - property: chapter',
    '        direction: ASC',
    '```',
  ].join('\n');
}

/**
 * The bare `obsidian://orbis-nav` URL for one spot in a book.
 *
 * Split out from `buildDeepLink` because a reading record needs BOTH shapes. Markdown renders as a link in a
 * Bases *table* cell but not in a list or cards view, where a `html()` formula does — and a formula has to build
 * an `href`, which cannot be done from a markdown link. Same split, and the same reason, as `book` beside
 * `book_title`: one shape renders, the other is machine-usable.
 */
export function buildDeepUrl(filePath: string, cfi: string): string {
  // An empty `cfi` is omitted rather than written as `&cfi=`: the handler already reads that as "no position", but
  // a link to a whole book — one book of a converted set linking to another — should not carry a parameter that
  // says nothing.
  const at = cfi ? `&cfi=${encodeURIComponent(cfi)}` : '';
  return `obsidian://orbis-nav?file=${encodeURIComponent(filePath)}${at}`;
}

export function buildDeepLink(filePath: string, cfi: string, loc?: number): string {
  return `[${loc != null ? `loc. ${loc}` : 'View in book'}](${buildDeepUrl(filePath, cfi)})`;
}

/** `portable`: for a note leaving the vault, where `{{book_link}}` names the book's file as text — see portable-markdown.ts. */
export function applyFrontmatterTemplate(template: string, data: NotesData, portable = false): string {
  const m = data.meta;
  const bookTitle = data.fileBasename;
  const bookLinkPath = data.filePath || bookTitle;
  const vars: Record<string, string> = {
    title: m.title || bookTitle,
    // What a single note covers is the book; a chapter note's `subject` adds the chapter.
    subject: m.title || bookTitle,
    author: m.author,
    publisher: m.publisher,
    publication_date: m.pubdate,
    language: m.language,
    description: m.description,
    filename: bookTitle,
    book_link: portable ? (bookLinkPath.split('/').pop() ?? bookLinkPath) : `[[${bookLinkPath}]]`,
    today: new Date().toISOString().split('T')[0],
  };
  return fillFrontmatterTemplate(template, vars);
}

export function buildAnnotationBuckets(config: NoteStyle['config'], data: NotesData): Map<string, ChapterBucket> {
  const buckets = new Map<string, ChapterBucket>();
  const get = (href: string | undefined, label: string | undefined): ChapterBucket => {
    const key = chapterKey({ chapterHref: href, chapter: label });
    if (!buckets.has(key))
      buckets.set(key, {
        title: label || 'Uncategorized',
        bookmarks: [],
        highlights: [],
        notes: [],
        minLoc: Infinity,
      });
    return buckets.get(key)!;
  };
  if (config.includeBookmarks) {
    for (const b of data.bookmarks) {
      const bk = get(b.chapterHref, b.chapter);
      bk.bookmarks.push(b);
      if (b.loc != null && b.loc < bk.minLoc) bk.minLoc = b.loc;
    }
  }
  if (config.includeHighlights) {
    for (const h of data.highlights) {
      const bk = get(h.chapterHref, h.chapter);
      bk.highlights.push(h);
      if (h.loc != null && h.loc < bk.minLoc) bk.minLoc = h.loc;
    }
  }
  if (config.includeNotes) {
    for (const n of data.notes) {
      const bk = get(n.chapterHref, n.chapter);
      bk.notes.push(n);
      if (n.loc != null && n.loc < bk.minLoc) bk.minLoc = n.loc;
    }
  }
  return buckets;
}

export function resolveChapterOrder(
  config: NoteStyle['config'],
  buckets: Map<string, ChapterBucket>,
  anyContent: boolean,
  data: NotesData,
  /**
   * A hand-made chapter selection, by contents href — or absent to follow `chapterScope`'s rule.
   *
   * **A chapter the contents does not name is always kept.** The picker lists what the contents names, so an
   * "Uncategorized" bucket has no row to untick and excluding it would drop content nobody could see they were
   * dropping. The same reasoning as the PDF's list, which offers spine sections and nothing else.
   */
  chosen?: ReadonlySet<string>
): { order: FlatTocChapter[]; hadAllTitles: boolean } {
  const fullToc = flattenTocWithDisambiguation(data.tocItems ?? []);
  const allTitles = config.includeChapterHeadings && (config.chapterScope === 'all' || !anyContent) ? fullToc : [];
  const hrefToDisplayLabel = new Map(fullToc.map((e) => [e.href, e.displayLabel]));
  const seen = new Set<string>();
  const order: FlatTocChapter[] = [];
  for (const t of allTitles) {
    if (!seen.has(t.href)) {
      seen.add(t.href);
      order.push(t);
    }
  }
  /**
   * **The chapters a bucket brought, in the BOOK's order — not in the order they were annotated.**
   *
   * `buckets` is a `Map`, so its keys come out in insertion order, and insertion order is the order the annotations are
   * stored in: when they were made. With `chapterScope: 'all'` the walk above lays every chapter down in contents order
   * first and this loop only picks up strays. With *only chapters with content* — or with chapter headings off —
   * `allTitles` is empty and this loop IS the order, so unsorted, a book annotated out of order would come back out of
   * order: Chapter IV above Chapter III, loc 86 above loc 56.
   *
   * Sorted by the contents, with `minLoc` breaking ties — the same key `groupMarksByChapter` uses for the PDF, whose
   * own comment says the two features must not disagree about what order a book is in. A chapter the contents does not
   * name sorts after everything it does, on its first location, as the clipboard export does.
   */
  const tocRank = new Map(fullToc.map((e, i) => [e.href, i]));
  const extras: FlatTocChapter[] = [];
  for (const k of buckets.keys()) {
    if (!seen.has(k)) {
      seen.add(k);
      // Bucket-only key (e.g. '' for uncategorized) — not in the TOC walk above
      // (chapterScope !== 'all' skips it), so synthesize a display entry from the
      // bucket's own stored title, qualified via the full TOC's disambiguation
      // when this href has a match there (chapter labels repeat across parts).
      const title = buckets.get(k)!.title;
      extras.push({ href: k, label: title, displayLabel: hrefToDisplayLabel.get(k) ?? title });
    }
  }
  const rankOf = (href: string): number => tocRank.get(href) ?? Number.MAX_SAFE_INTEGER;
  const locOf = (href: string): number => buckets.get(href)?.minLoc ?? Number.MAX_SAFE_INTEGER;
  extras.sort((a, b) => rankOf(a.href) - rankOf(b.href) || locOf(a.href) - locOf(b.href));
  order.push(...extras);
  const picked = chosen ? order.filter((e) => chosen.has(e.href) || !tocRank.has(e.href)) : order;
  return { order: picked, hadAllTitles: allTitles.length > 0 };
}

/**
 * A highlight's rendered line.
 *
 * **No length cap.** A cap would cut a long marked passage mid-word, while the same passage prints in full in a marks
 * PDF and is kept whole in the note a highlight generates. A reader who marks three paragraphs means to keep three
 * paragraphs; a length limit on the book's own words is a decision this export has no standing to make.
 *
 * Shaping is `selectionVars`'s, and it needs the newlines to do it.
 */
function highlightLine(h: Highlight, config: NoteStyle['config'], data: NotesData, link: BookLink): string {
  return renderAnnotationLine(config.highlightLineTemplate, {
    ...annotationVars(h, link(h.cfiRange, h.loc), data.marks),
    ...selectionVars(h.text),
  });
}

/** A note's rendered line, including its quoted passage when it has one. */
function noteLine(n: Note, config: NoteStyle['config'], data: NotesData, link: BookLink, portable: boolean): string {
  return renderAnnotationLine(config.noteLineTemplate, {
    ...annotationVars(n, link(n.cfiRange, n.loc), data.marks),
    ...selectionVars(n.selectedText),
    // The note's own second text — what the reader typed, as opposed to what the book says. Leaving the vault, its
    // links into the vault become their words.
    note_text: portable ? plainVaultLinks(n.text.trim()) : n.text.trim(),
  });
}

/**
 * One chapter's (or one section's) annotations, under their kind headings.
 *
 * `level` is the depth of those kind headings, because the same block is written at two depths in each format: in a
 * single note a chapter's own marks sit at `###` and a subheading's one deeper, and a chapter FILE puts its own at
 * `##`. Passing the level keeps one renderer rather than a copy per depth — a copy would let the folder format drift
 * away from the single note.
 */
export function renderChapterSection(
  bucket: AnnotBucket | undefined,
  config: NoteStyle['config'],
  data: NotesData,
  level = 3,
  /** A copy leaving the vault — see portable-markdown.ts. */
  portable = false
): string[] {
  if (!bucket) return [];
  const fp = data.filePath;
  const link: BookLink = portable ? (_cfi, loc) => bookLinkLabel(loc) : (cfi, loc) => buildDeepLink(fp, cfi, loc);
  const h = '#'.repeat(level);
  const lines: string[] = [];
  for (const sectionId of config.sectionOrder) {
    if (sectionId === 'bookmarks' && bucket.bookmarks.length > 0) {
      lines.push(`${h} Bookmarks`, '');
      for (const b of inReadingOrder(bucket.bookmarks, markCfi)) lines.push(bookmarkLine(b, config, link));
      lines.push('');
    }
    if (sectionId === 'highlights' && bucket.highlights.length > 0) {
      lines.push(`${h} Passage selections`, '');
      for (const h2 of inReadingOrder(bucket.highlights, markCfi)) lines.push(highlightLine(h2, config, data, link));
      lines.push('');
    }
    if (sectionId === 'notes' && bucket.notes.length > 0) {
      lines.push(`${h} Notes`, '');
      // The template owns the quoted passage too (`{{selection}}`), so the block is part of the rendered
      // string rather than a line pushed ahead of it.
      for (const n of inReadingOrder(bucket.notes, markCfi)) lines.push(noteLine(n, config, data, link, portable), '');
    }
  }
  return lines;
}

/**
 * A chapter heading, then the jump back into the book on a line of its own — never inside the heading.
 *
 * **Obsidian matches a link to a heading against the heading's SOURCE text** (its metadata cache stores the raw
 * Markdown; `resolveSubpath` compares the two through `stripHeading` — read from the 1.14.4 bundle). A heading of
 * `[↗](obsidian://orbis-nav?file=…) Chapter One` is, to every link, a heading about `obsidian orbis-nav file …`, so the
 * note's own Contents list and any `[[Notes#Chapter One]]` written elsewhere went nowhere.
 */
function headingWithJump(level: number, label: string, filePath: string, href: string | undefined): string {
  const heading = `${'#'.repeat(level)} ${label}`;
  if (!href) return heading;
  const url = `obsidian://orbis-nav?file=${encodeURIComponent(filePath)}&href=${encodeURIComponent(href)}`;
  return `${heading}\n\n[↗ Open in book](${url})`;
}

/**
 * A heading's name as a `[[#…]]` target — Obsidian's own `stripHeadingForLink`, which is what it writes when you pick
 * a heading from its link suggestions. A `|` or `#` left in would make the rest an alias or a second heading; the
 * punctuation removed here is removed from the heading too when the two are compared, so the link still lands.
 */
function headingLinkTarget(label: string): string {
  return label
    .replace(/([:#|^\\\r\n]|%%|\[\[|]])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildNotesMarkdown(
  config: NoteStyle['config'],
  data: NotesData,
  includeFrontmatter = true,
  /** The reader's chapter selection for this run, or absent to follow the style's rule. */
  chosen?: ReadonlySet<string>,
  /** A copy leaving the vault — Export or Share. See portable-markdown.ts for what changes. */
  portable = false
): string {
  const buckets = buildAnnotationBuckets(config, data);
  const anyContent = config.includeBookmarks || config.includeHighlights || config.includeNotes;
  const { order: chapterOrder, hadAllTitles } = resolveChapterOrder(config, buckets, anyContent, data, chosen);
  const lines: string[] = [];

  if (includeFrontmatter) {
    const frontmatter = applyFrontmatterTemplate(config.frontmatterTemplate, data, portable);
    // Outside the template on purpose: the template is the reader's to rewrite, and a note that stops saying what
    // it is would reappear in the catalog as a second copy of the book it was made from.
    //
    // **The book's title, falling back to the file's name.** The EPUB's basename is the weakest of the three
    // identifiers to hand: not the book's title, not the note's own filename, and already stated in the frontmatter as
    // `filename`. It remains the fallback for a book whose metadata has no title.
    lines.push(
      '---',
      `orbis_generated: "${GENERATED_NOTE_SET}"`,
      frontmatter,
      '---',
      '',
      `# ${bookTextLine(noteSetHeading(data))}`,
      ''
    );
  }

  /**
   * @param plain take the contents' bare label rather than its disambiguated one — for a SUBHEADING, whose
   *   chapter is printed directly above it. `displayLabel` qualifies a repeated label with its parent, which is
   *   what a flat list needs and what nesting makes redundant: "Plugin Architecture Overview – Commands" under
   *   the heading "Plugin Architecture Overview" is the chapter's name twice. A chapter keeps the qualified form,
   *   having no heading above it to be told apart by.
   */
  const chapterHeading = (entry: FlatTocChapter, level = 2, plain = false, n?: number) => {
    // Marked when the Contents links to it, so the link can find its chapter once the note exists — contents-links.ts.
    const label = `${bookTextLine((plain ? entry.label : entry.displayLabel) || entry.displayLabel)}${n != null ? chapterHeadingMark(n) : ''}`;
    // Leaving the vault there is no book to open.
    if (portable) return `${'#'.repeat(level)} ${label}`;
    return headingWithJump(level, label, data.filePath, entry.href);
  };

  /**
   * **Chapters, each with the subheadings its notes were filed under.**
   *
   * An annotation belongs to the deepest contents entry that matches it, which is the right answer for placing one
   * and the wrong one for a heading: grouped by that key alone, this file would be a flat run of subheadings with
   * nothing saying which document each came from or where one ended. See `groupByTopLevel`.
   */
  const groups = groupByTopLevel(chapterOrder, data.tocItems ?? []);

  if (!anyContent && config.includeChapterHeadings) {
    for (const group of groups) {
      lines.push(chapterHeading(group.chapter), '');
      for (const section of group.sections) lines.push(chapterHeading(section, 3, true), '');
    }
    return lines.join('\n');
  }

  if (chapterOrder.length === 0) {
    lines.push('*No content to export.*');
    return lines.join('\n');
  }

  const hasAnyItems = [...buckets.values()].some((b) => b.bookmarks.length + b.highlights.length + b.notes.length > 0);
  if (hasAnyItems || hadAllTitles) {
    lines.push('## Contents', '');
    // The chapters, not every subheading under them — the list is for finding a chapter, and each chapter's own
    // headings are visible once you are in it.
    groups.forEach((_group, n) => lines.push(`- ${contentsEntry(n)}`));
    lines.push('', '---', '');
  }

  groups.forEach((group, n) => {
    lines.push(chapterHeading(group.chapter, 2, false, n), '');
    // Marks made on the chapter itself — above its own first subheading — belong directly to it, so their kind
    // headings sit one level under the chapter rather than under a subheading they are not part of.
    lines.push(...renderChapterSection(buckets.get(group.chapter.href), config, data, 3, portable));
    for (const section of group.sections) {
      lines.push(chapterHeading(section, 3, true), '');
      lines.push(...renderChapterSection(buckets.get(section.href), config, data, 4, portable));
    }
  });

  const text = lines.join('\n');
  return portable
    ? resolveChapterAnchors(
        text,
        groups.map((g) => bookTextLine(g.chapter.displayLabel))
      )
    : resolveChapterWikiLinks(
        text,
        groups.map((g) => headingLinkTarget(g.chapter.displayLabel))
      );
}

export function buildChapterFrontmatterBlock(
  chapterNum: number,
  chapterTitle: string,
  sectionIndex: number,
  noteSetSlug: string,
  prevPath: string | null,
  nextPath: string | null,
  hasBookmarks: boolean,
  hasHighlights: boolean,
  hasNotes: boolean,
  userTemplate: string,
  chapterPath: string,
  tocHref: string | undefined,
  data: NotesData
): string {
  const m = data.meta;
  const bookTitle = m.title || data.fileBasename;
  const bookBasename = data.fileBasename;
  const bookLinkPath = data.filePath;

  // System block (always generated, not editable by user). Key names honor the
  // frontmatterKeyLanguage setting; canonical names below are always what
  // SYSTEM_CHAPTER_KEYS filters against, regardless of the resolved key written.
  const keyLang = data.frontmatterKeyLanguage;
  const fmKey = (canonicalKey: string) => resolveFrontmatterKey(canonicalKey, keyLang);
  const systemLines = [
    // First, and never from the user's template: it says what this note is, and the Library reads it to keep a
    // note set's chapters out of the catalog.
    `orbis_generated: "${GENERATED_NOTE_SET}"`,
    `${fmKey('chapter')}: ${chapterNum}`,
    ...bookIdentityLines(bookLinkPath, bookTitle, fmKey),
    `${fmKey('note_set')}: ${yamlString(noteSetSlug)}`,
    `${fmKey('has_bookmarks')}: ${hasBookmarks}`,
    `${fmKey('has_passage_selections')}: ${hasHighlights}`,
    `${fmKey('has_notes')}: ${hasNotes}`,
  ];
  if (prevPath) {
    const prevBase = prevPath.split('/').pop()?.replace(/\.md$/, '') ?? prevPath;
    systemLines.push(`${fmKey('prev')}: ${yamlString(`[[${prevBase}]]`)}`);
  }
  if (nextPath) {
    const nextBase = nextPath.split('/').pop()?.replace(/\.md$/, '') ?? nextPath;
    systemLines.push(`${fmKey('next')}: ${yamlString(`[[${nextBase}]]`)}`);
  }
  const mocFileName = '000 - ' + sanitizeName(bookTitle);
  systemLines.push(`${fmKey('toc')}: ${yamlString(`[[${mocFileName}]]`)}`);
  if (tocHref) {
    const navUrl = `obsidian://orbis-nav?file=${encodeURIComponent(bookLinkPath)}&href=${encodeURIComponent(tocHref)}`;
    systemLines.push(`${fmKey('open_chapter')}: "${navUrl}"`);
  }

  // User template — strip conflicting keys. `title` is the template's: `{{subject}}` is the book AND the chapter (see
  // `chapterNoteTitle`), because the chapter alone would read the same in every book's set.
  const vars: Record<string, string> = {
    title: bookTitle,
    subject: chapterNoteTitle(bookTitle, chapterTitle),
    author: m.author,
    publisher: m.publisher,
    publication_date: m.pubdate,
    language: m.language,
    description: m.description,
    filename: bookBasename,
    book_link: `[[${bookLinkPath}]]`,
    today: new Date().toISOString().split('T')[0],
  };
  const rendered = fillFrontmatterTemplate(userTemplate, vars);
  const userLines = rendered.split('\n').filter((line) => {
    const key = line.match(/^(\w+)\s*:/)?.[1];
    return !key || !SYSTEM_CHAPTER_KEYS.has(key);
  });

  const allLines = [...systemLines, ...userLines.filter((l) => l.trim())];
  return '---\n' + allLines.join('\n') + '\n---';
}

export function buildPerChapterAnnotBuckets(config: NoteStyle['config'], data: NotesData): Map<string, AnnotBucket> {
  const buckets = new Map<string, AnnotBucket>();
  const get = (key: string): AnnotBucket => {
    if (!buckets.has(key)) buckets.set(key, { bookmarks: [], highlights: [], notes: [] });
    return buckets.get(key)!;
  };
  if (config.includeBookmarks) for (const b of data.bookmarks) get(chapterKey(b)).bookmarks.push(b);
  if (config.includeHighlights) for (const h of data.highlights) get(chapterKey(h)).highlights.push(h);
  if (config.includeNotes) for (const n of data.notes) get(chapterKey(n)).notes.push(n);
  return buckets;
}

export function resolveChapterFilePlans(
  chaptersToGenerate: FlatTocEntry[],
  flatTocLength: number,
  folderPath: string,
  config: NoteStyle['config'],
  styleName: string,
  data: NotesData
): ChapterPlan[] {
  const T = flatTocLength;
  const N = data.bookSectionCount;
  const usedNames = new Set<string>();
  return chaptersToGenerate.map((entry, i) => {
    const index = String(i + 1).padStart(3, '0');
    const sectionIndex = T > 1 ? Math.round((entry.tocIndex * (N - 1)) / (T - 1)) : 0;
    let fileName = resolveChapterFileName(config.chapterFileTemplate?.trim() || DEFAULT_CHAPTER_FILE_TEMPLATE, {
      index,
      chapter: entry.displayLabel,
      title: data.meta.title || data.fileBasename,
      style: styleName,
    });
    if (usedNames.has(fileName)) {
      let n = 2;
      while (usedNames.has(`${fileName}-${n}`)) n++;
      fileName = `${fileName}-${n}`;
    }
    usedNames.add(fileName);
    return { ...entry, sectionIndex, fileName, filePath: `${folderPath}/${fileName}.md` };
  });
}

/**
 * The chapters a book folder writes a note for: the hand-picked ones, else the style's rule — every chapter, or only
 * those holding content.
 *
 * **With no content kinds on, every chapter.** Nothing can be "with content" then, and the folder is still worth
 * making: one empty chapter note per chapter, to write your own notes along the book's structure.
 */
export function chapterFilesToWrite<G extends { chapter: { href: string } }>(
  groups: readonly G[],
  config: Pick<NoteStyle['config'], 'chapterFilesScope' | 'includeBookmarks' | 'includeHighlights' | 'includeNotes'>,
  picked: ReadonlySet<string> | null | undefined,
  contentIn: (group: G) => number
): G[] {
  const anyKind = config.includeBookmarks || config.includeHighlights || config.includeNotes;
  return groups.filter((group) => {
    if (picked) return picked.has(group.chapter.href);
    if (config.chapterFilesScope !== 'with-content' || !anyKind) return true;
    return contentIn(group) > 0;
  });
}

export function buildChapterFileContent(
  plan: ChapterPlan,
  chapterNum: number,
  prevPath: string | null,
  nextPath: string | null,
  bk: AnnotBucket | undefined,
  config: NoteStyle['config'],
  noteSetSlug: string,
  data: NotesData,
  /** The subheadings beneath this chapter that carry marks, in contents order — see `groupByTopLevel`. */
  sections: ReadonlyArray<{ entry: FlatTocChapter; bucket: AnnotBucket | undefined }> = []
): string {
  const fp = data.filePath;
  // Counted across the whole chapter, subheadings included: a chapter whose every note sits under a heading would
  // otherwise write `has_notes: false` into the file that holds them, and the bases read these flags.
  const inChapter = [bk, ...sections.map((s) => s.bucket)];
  const hasBookmarks = inChapter.some((b) => (b?.bookmarks.length ?? 0) > 0);
  const hasHighlights = inChapter.some((b) => (b?.highlights.length ?? 0) > 0);
  const hasNotes = inChapter.some((b) => (b?.notes.length ?? 0) > 0);

  const frontmatter = buildChapterFrontmatterBlock(
    chapterNum,
    plan.displayLabel,
    plan.sectionIndex,
    noteSetSlug,
    prevPath,
    nextPath,
    hasBookmarks,
    hasHighlights,
    hasNotes,
    config.frontmatterTemplate,
    plan.filePath,
    plan.href,
    data
  );

  const lines: string[] = [frontmatter, '', headingWithJump(1, bookTextLine(plan.displayLabel), fp, plan.href), ''];

  // The chapter's own marks, at `##` — a chapter file's own depth.
  lines.push(...renderChapterSection(bk, config, data, 2));
  /**
   * Then each subheading the chapter's notes were filed under, one level down.
   *
   * **A chapter file is a chapter, so its subheadings are headings inside it** — a file per contents entry at any depth
   * would make a document's headings sibling FILES, with the document itself nowhere. See `groupByTopLevel`.
   */
  for (const section of sections) {
    if (!section.bucket) continue;
    // The bare label, not the disambiguated one: this file IS the chapter, named at the top, so a subheading
    // qualified with its parent would say the file's own name again. Same rule as `chapterHeading`'s `plain`.
    lines.push(
      headingWithJump(2, bookTextLine(section.entry.label || section.entry.displayLabel), fp, section.entry.href),
      ''
    );
    lines.push(...renderChapterSection(section.bucket, config, data, 3));
  }

  return lines.join('\n');
}

export function buildClipboardMarkdown(
  section: 'highlights' | 'notes' | 'bookmarks',
  data: NotesData,
  /** The style whose line templates to use. Omitted means the defaults — a clipboard copy has no note style
   *  of its own, and matching the default export is better than a second hard-coded format. */
  config: NoteStyle['config'] = DEFAULT_NOTE_STYLE_CONFIG
): string {
  const filePath = data.filePath;
  type Bucket = { title: string; minLoc: number; rows: string[] };
  const buckets = new Map<string, Bucket>();
  const hrefToDisplayLabel = new Map(
    flattenTocWithDisambiguation(data.tocItems ?? []).map((e) => [e.href, e.displayLabel])
  );
  // Keyed by chapterHref, not chapter label — chapter labels repeat across
  // parts in many books ("PART I > CHAPTER I", "PART II > CHAPTER I").
  const getBucket = (href: string | undefined, label: string | undefined): Bucket => {
    const key = chapterKey({ chapterHref: href, chapter: label });
    if (!buckets.has(key)) {
      const title = (href && hrefToDisplayLabel.get(href)) || label || 'Uncategorized';
      buckets.set(key, { title, minLoc: Infinity, rows: [] });
    }
    return buckets.get(key)!;
  };
  const link: BookLink = (cfi, loc) => buildDeepLink(filePath, cfi, loc);
  if (section === 'highlights') {
    const sorted = inReadingOrder(data.highlights, markCfi);
    for (const h of sorted) {
      const bk = getBucket(h.chapterHref, h.chapter);
      if (h.loc != null && h.loc < bk.minLoc) bk.minLoc = h.loc;
      bk.rows.push(highlightLine(h, config, data, link));
    }
  } else if (section === 'notes') {
    const sorted = inReadingOrder(data.notes, markCfi);
    for (const n of sorted) {
      const bk = getBucket(n.chapterHref, n.chapter);
      if (n.loc != null && n.loc < bk.minLoc) bk.minLoc = n.loc;
      bk.rows.push(noteLine(n, config, data, link, false));
    }
  } else {
    const sorted = inReadingOrder(data.bookmarks, markCfi);
    for (const b of sorted) {
      const bk = getBucket(b.chapterHref, b.chapter);
      if (b.loc != null && b.loc < bk.minLoc) bk.minLoc = b.loc;
      bk.rows.push(bookmarkLine(b, config, link));
    }
  }
  const chapters = [...buckets.values()].sort((a, b) => a.minLoc - b.minLoc);
  const lines: string[] = [];
  for (const ch of chapters) {
    lines.push(`## ${bookTextLine(ch.title)}`, '', ...ch.rows, '');
  }
  return lines.join('\n').trim();
}
