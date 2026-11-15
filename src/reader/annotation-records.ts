// One saved annotation as one vault note: pure shaping, no I/O.
//
// The counterpart to `export-format.ts`. That module builds DOCUMENTS you read — chapter headings, quoted
// passages, publishable as-is. This one builds RECORDS you query: frontmatter for Obsidian Bases to group,
// sort and filter, so every "show me everything I marked as X, by chapter, since June" is a view the reader
// writes rather than a release we ship. See docs/design/notes-export.md §Per-annotation records.

import { type AnnotationMark, badgeOf, emojiForColor } from '../annotation-presets';
import { sanitizeName } from '../book-extractor';
import { NOTE_KIND_READING_RECORD } from '../library/record';
import type { Bookmark, Highlight, Note } from '../progress';
import { cfiSortKey } from './cfi-sort';
import { buildDeepLink, buildDeepUrl } from './export-format';

/**
 * What a record is a record OF. Also the leading words of its filename.
 *
 * `passage selection`, not `highlight`: a mark drawn as an underline, squiggle or box is not a highlight, and
 * these values are user-visible — Bases shows them as group headers and the `Kind` column. "Selection" is the
 * genus (text singled out of the book) and "passage" the species that carries no note, the other being a note's
 * own selection. Bare `passage` does not stand on its own. See docs/design/reading-records.md.
 */
export type RecordKind = 'passage selection' | 'note' | 'bookmark';

/**
 * The boundary between what this plugin owns and what the reader owns.
 *
 * An HTML comment rather than visible text: a line reading "do not edit above here" is the plugin talking
 * inside someone's note, and it renders in reading view and travels into anything built from it. A comment is
 * invisible rendered and plain in edit mode — exactly when it matters — and carries its own explanation, so
 * it teaches without documentation.
 *
 * Deleting it means the body is never written again (see `mergeRecordBody`). Someone will delete it, and that
 * has to be an opt-out of updates rather than a way to lose work.
 */
export const RECORD_MARKER = '<!-- Orbis: everything above is regenerated from the book. Your own notes go below. -->';

/**
 * The one tag every reading-record note carries. ONE, not a taxonomy: per-mark tags would explode and duplicate
 * the `mark` property, which Bases can group by directly.
 *
 * **Namespaced deliberately.** Both generated bases filter on `file.hasTag(...)`, so this is a query key: a bare
 * `reading-record` would silently pull in any note where the reader had used that tag themselves, and every view
 * would quietly include things that are not records.
 *
 * Not `orbis-annotation`, the legacy tag (a bookmark is not an annotation). Notes carrying it retag themselves —
 * `frontmatterMatches` compares `tags` element by element, so such a note fails the comparison and gets rewritten on
 * the next export pass. The generated bases cannot heal that way, because they
 * are written with `writeIfAbsent` and embed the tag as a literal, so `RecordExporter` migrates their filter
 * text instead; see `LEGACY_RECORD_TAGS`.
 */
export const RECORD_TAG = 'orbis-reading-record';

/** Legacy tags that older records carry instead of `RECORD_TAG`. A base whose filter names one of these matches
 *  nothing once the notes are retagged, so the exporter rewrites it in place — which also keeps any views the
 *  reader added by hand, where deleting the file would not. */
export const LEGACY_RECORD_TAGS = ['orbis-annotation'];

/** Everything a record needs about the book it came from. */
export interface RecordBookContext {
  filePath: string;
  title: string;
  author: string;
  /** Vault path of the extracted cover image, when there is one. */
  coverPath?: string;
  marks?: readonly AnnotationMark[];
  /**
   * Chapter href → its position in the book's table of contents, 1-based.
   *
   * The sort key for `chapter`, which cannot sort itself. A chapter title is text, so sorting it puts
   * "CHAPTER IX." before "CHAPTER V." before "CHAPTER X." — Roman numerals are alphabetically hostile, and a
   * book that titles its chapters at all ("Wired for Adventure") gives no ordering to recover.
   */
  chapterIndex?: ReadonlyMap<string, number>;
}

/**
 * A record's frontmatter — the durable commitment of this whole design.
 *
 * Readers write their own Bases views and formulas against these names, so renaming one later breaks their
 * work. Names reuse the line-template placeholder tokens wherever they mean the same thing.
 *
 * `mark` is empty when the annotation has none, which is a permanent valid state (a note without a highlight
 * has no mark, and a bookmark never does) and the group Bases shows for it. That emptiness is the whole
 * reason grouping lives here rather than in a document: a document would need an invented "Unmarked" heading.
 */
export interface RecordProperties {
  /**
   * Which species of note this is, for the library — `reading_record`, as a title note says `title`.
   *
   * **Written by every builder, and the only thing that makes a record a record.** The library gathers notes by
   * this key; a note without it is not a reading record however much of one it looks like. See
   * docs/design/library.md §Reading records on dashboards.
   */
  orbis_note: typeof NOTE_KIND_READING_RECORD;
  kind: RecordKind;
  /**
   * The passage, readable, for a table column to lead with.
   *
   * This duplicates the body. Having the base read `file.name` through a formula instead would avoid that, but a
   * filename is sanitized, so `"Do not you want to know who has taken it?" cried` would arrive in the column as
   * `Do not you want to know who has taken it cried`.
   * Stripping the punctuation out of the middle of a sentence is not a display detail — it reads as broken
   * English. The filename still needs sanitizing; a column does not.
   */
  excerpt: string;
  mark: string;
  mark_badge: string;
  book: string;
  book_title: string;
  author: string;
  chapter: string;
  /** Reading order, for sorting. A POSITION in the table of contents, not a chapter number: front matter
   *  occupies the first entries, so this is 3 for a book's first chapter as often as it is 1. */
  chapter_index: number | null;
  loc: number | null;
  /**
   * Reading order WITHIN a chapter — the sort key `loc` is too coarse to be.
   *
   * A location spans many paragraphs, so eight highlights in one chapter routinely share one. When the sort
   * ties, Bases falls back to `file.name`, which for a record begins with the kind and then the passage — so
   * the rows come back alphabetized, which can put a novel's famous first sentence fourth in its own chapter.
   *
   * Opaque, and never displayed. See `cfiSortKey` for why it is a derived string rather than a sequence number.
   */
  cfi_sort: string;
  created: string;
  link: string;
  /**
   * The same destination as `link`, as a bare URL.
   *
   * Both shapes, because Bases renders markdown in a **table** cell but not in a list or cards view — there a
   * `html()` formula does the rendering, and a formula must build an `href`, which cannot be recovered from a
   * markdown link. The same split, for the same reason, as `book` beside `book_title`: one shape renders, the
   * other is machine-usable. See docs/design/reading-records.md §Links.
   */
  link_url: string;
  note_text?: string;
  /**
   * The book's cover, as a vault link — one image per book, shared by all its records.
   *
   * Only a Bases **cards** view uses it, via `image: note.cover`, and only usefully at the global scope: in a
   * per-book base every card carries the same picture. Absent when the cover could not be extracted, which is
   * silent by design — a cover is decoration and must never fail an export.
   */
  cover?: string;
  orbis_id: string;
  orbis_cfi: string;
  /**
   * The annotation this came from is gone from the book.
   *
   * **Always written, never absent.** A filter of `orphaned != true` has to mean something definite for every
   * record, and a property that is missing on most of them makes that depend on how Bases treats an absent value
   * in a comparison. One key of noise in exchange for a filter that cannot be subtly wrong.
   *
   * Set instead of trashing the file whenever the reader has anything invested in the record — see
   * `recordKeepReason`. A record they have never touched is removed when its annotation is deleted; this flag is
   * what the other cases get, and what the cleanup action lists.
   */
  orphaned: boolean;
  tags: string[];
}

/**
 * Every frontmatter key an export writes. **A record carrying any other key was edited by the reader**, which is
 * one of the reasons a deleted annotation's record is kept and flagged rather than removed.
 *
 * A literal list rather than something derived, because `RecordProperties` is a type and types do not exist at
 * runtime — and it is the *runtime* set that decides whether a file gets deleted. `record-properties.test.ts`
 * asserts it against the keys the three builders actually produce, so adding a property to the interface without
 * adding it here fails the suite rather than quietly making every record look reader-edited.
 */
export const RECORD_PROPERTY_KEYS: readonly string[] = [
  'orbis_note',
  'kind',
  'excerpt',
  'mark',
  'mark_badge',
  'book',
  'book_title',
  'author',
  'chapter',
  'chapter_index',
  'loc',
  'cfi_sort',
  'created',
  'link',
  'link_url',
  'note_text',
  'cover',
  'orbis_id',
  'orbis_cfi',
  'orphaned',
  'tags',
];

const isoDate = (ms: number): string => new Date(ms).toISOString().split('T')[0];

/** Long enough to recognize a passage in a table, short enough not to bloat every file's frontmatter. */
const EXCERPT_PROP_MAX = 200;

function excerptOf(text: string | undefined): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_PROP_MAX ? `${flat.slice(0, EXCERPT_PROP_MAX).trimEnd()}…` : flat;
}

/** `book` is a LINK for navigation and backlinks; `book_title` is the same fact as plain text, because Bases
 *  groups on a property and grouping by a link would show link markup as the group name. */
function bookProps(book: RecordBookContext): Pick<RecordProperties, 'book' | 'book_title' | 'author' | 'cover'> {
  return {
    book: `[[${book.filePath}]]`,
    book_title: book.title,
    author: book.author,
    cover: book.coverPath ? `[[${book.coverPath}]]` : undefined,
  };
}

function chapterProps(
  annot: { chapter?: string; chapterHref?: string },
  book: RecordBookContext
): Pick<RecordProperties, 'chapter' | 'chapter_index'> {
  const at = annot.chapterHref ? book.chapterIndex?.get(annot.chapterHref) : undefined;
  return { chapter: annot.chapter ?? '', chapter_index: at ?? null };
}

/**
 * Everything derived from the annotation's CFI: the CFI itself, its sort key, and both link shapes.
 *
 * One helper rather than four fields, so they cannot be built from DIFFERENT CFIs — a live risk for a bookmark,
 * whose position is `exactCfi ?? cfi`, and the reason the caller does not pass a pre-built link in.
 */
function positionProps(
  cfi: string,
  bookPath: string,
  loc: number | null
): Pick<RecordProperties, 'orbis_cfi' | 'cfi_sort' | 'link' | 'link_url'> {
  return {
    orbis_cfi: cfi,
    cfi_sort: cfiSortKey(cfi),
    link: buildDeepLink(bookPath, cfi, loc ?? undefined),
    link_url: buildDeepUrl(bookPath, cfi),
  };
}

function markProps(
  annot: { markId?: string; color?: string },
  marks: readonly AnnotationMark[] | undefined
): Pick<RecordProperties, 'mark' | 'mark_badge'> {
  const mark = annot.markId ? marks?.find((m) => m.id === annot.markId) : undefined;
  if (mark) return { mark: mark.name.trim(), mark_badge: badgeOf(mark) };
  // No mark, or one this book no longer has: the color is still known, and its emoji is still the best
  // stand-in Markdown can show.
  return { mark: '', mark_badge: annot.color ? emojiForColor(annot.color) : '' };
}

export function highlightRecord(h: Highlight, book: RecordBookContext): RecordProperties {
  return {
    orbis_note: NOTE_KIND_READING_RECORD,
    kind: 'passage selection',
    excerpt: excerptOf(h.text),
    ...markProps(h, book.marks),
    ...bookProps(book),
    ...chapterProps(h, book),
    loc: h.loc ?? null,
    created: isoDate(h.createdAt),
    orbis_id: h.id,
    orphaned: false,
    ...positionProps(h.cfiRange, book.filePath, h.loc ?? null),
    tags: [RECORD_TAG],
  };
}

export function noteRecord(n: Note, book: RecordBookContext): RecordProperties {
  return {
    orbis_note: NOTE_KIND_READING_RECORD,
    kind: 'note',
    // The passage when there is one; a standalone note has only its own words to show.
    excerpt: excerptOf(n.selectedText || n.text),
    ...markProps(n, book.marks),
    ...bookProps(book),
    ...chapterProps(n, book),
    loc: n.loc ?? null,
    created: isoDate(n.createdAt),
    // Duplicates the body deliberately: Bases cannot read a note's body, so a table column needs a property.
    // Both are written in the same pass from the same source and cannot drift.
    note_text: n.text.trim(),
    orbis_id: n.id,
    orphaned: false,
    ...positionProps(n.cfiRange, book.filePath, n.loc ?? null),
    tags: [RECORD_TAG],
  };
}

export function bookmarkRecord(b: Bookmark, book: RecordBookContext): RecordProperties {
  return {
    orbis_note: NOTE_KIND_READING_RECORD,
    kind: 'bookmark',
    // The words it marks — the page's opening lines, or the sentence being read — so a bookmark reads like the
    // passages and notes beside it. An empty excerpt also made Obsidian's list view drop the entry entirely, leaving
    // its group heading over nothing. Bookmarks from before the words were kept fall back to their label.
    excerpt: excerptOf(b.text) || b.label,
    // A bookmark is a place, not an annotation about text, so it never has a mark.
    mark: '',
    mark_badge: '',
    ...bookProps(book),
    ...chapterProps(b, book),
    loc: b.loc ?? null,
    created: isoDate(b.createdAt),
    orbis_id: b.id,
    orphaned: false,
    ...positionProps(b.exactCfi ?? b.cfi, book.filePath, b.loc ?? null),
    tags: [RECORD_TAG],
  };
}

/** How much of a passage goes in a filename. Paths have OS length limits and a passage can be 300 characters. */
const EXCERPT_MAX = 60;

/**
 * `highlight — Elizabeth passed the chief of the night — 8f2c4a.md`
 *
 * Kind first, which groups the kinds in the file explorer — the reason to have it in the name at all. A table
 * column leads with the passage via the `excerpt` PROPERTY instead: a filename has to be sanitized, and
 * punctuation stripped out of the middle of a sentence reads as broken English.
 *
 * The short id is what actually makes the name unique and stable. The passage never changes, so the name never
 * needs to — which matters because renaming a file breaks every link into it.
 */
export function recordFileName(kind: RecordKind, excerpt: string, id: string): string {
  const words = sanitizeName(excerpt.replace(/\s+/g, ' ').trim()).slice(0, EXCERPT_MAX).trim();
  const short = id.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'record';
  return [kind, words, short].filter(Boolean).join(' — ');
}

/**
 * The derived half of a record's body: the passage, a note's own text under it, and the way back to the book.
 *
 * Everything here is rewritten when it changes. Everything after `RECORD_MARKER` is the reader's and is never
 * touched — see `mergeRecordBody`.
 *
 * The link is in the BODY and not only in frontmatter because the record is a navigation destination, not just a
 * row's backing file: a Bases list or cards view cannot render a link at all, so clicking there lands you
 * here — and a landing page with no way onward to the passage is a dead end. Markdown, because this is a note
 * and Obsidian renders it.
 */
export function derivedBody(props: RecordProperties, selection: string | undefined): string {
  const lines: string[] = [];
  // Collapsed first, then stripped: the other way round, a marker broken by a double space became whole again.
  if (selection) lines.push(`> "${withoutMarker(selection.replace(/\s+/g, ' ').trim())}"`, '');
  if (props.note_text) lines.push(withoutMarker(props.note_text), '');
  lines.push(props.link, '');
  return lines.join('\n');
}

/**
 * Remove `RECORD_MARKER` from text that goes into the derived half.
 *
 * **The marker is the only thing separating what Orbis rewrites from what the reader wrote**, and it is found by
 * `indexOf` — so a second copy of it, arriving in a passage selected out of a book, moves that boundary. The next
 * regeneration then either overwrites the reader's notes or refuses to touch its own half, depending on which copy
 * came first. Data loss, from a string in an EPUB.
 *
 * It is eighty-eight characters of specific English, so this will never fire by accident. It fires for a book that
 * embedded it deliberately, and it costs one pass over text that was about to be written anyway.
 *
 * **Until none is left**, not once: a marker nested inside another came out whole when the inner one was removed.
 */
export function withoutMarker(text: string): string {
  let out = text;
  while (out.includes(RECORD_MARKER)) out = out.split(RECORD_MARKER).join('');
  return out;
}

/**
 * Whether the reader has written anything of their own in this record.
 *
 * Everything after `RECORD_MARKER` is theirs. **No marker counts as theirs** — the same safe direction
 * `mergeRecordBody` takes, and for the same reason: without the marker there is no way to know where their
 * writing starts, so the whole file has to be assumed to contain some.
 *
 * One of the three tests in `recordKeepReason`, which is what both the live delete and the cleanup action split on.
 * A record with nothing of theirs can be removed; one with something of theirs is only ever listed, never deleted
 * for them.
 */
export function readerWroteInRecord(body: string): boolean {
  const at = body.indexOf(RECORD_MARKER);
  if (at === -1) return true;
  return body.slice(at + RECORD_MARKER.length).trim().length > 0;
}

/** A leading YAML frontmatter block, if there is one — matched the way Obsidian delimits it: `---` on the first
 *  line, and the first `---` line after it. */
const FRONTMATTER_BLOCK = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Splice a new derived region into an existing file, keeping the frontmatter above it and everything the reader
 * wrote below it.
 *
 * **Three regions, not two.** What `vault.read` hands this is the whole file: the properties, then the derived
 * region, then the reader's own writing after the marker. Only the middle one is ours to replace. Rebuilding the
 * file as `derived + fromTheMarkerOn` would delete the frontmatter of every record whose derived half changed — a
 * record would lose its properties when someone edited its mark, and with them its tag, which drops it out of every
 * base. The next pass would rewrite the properties and the one after would lose them again, so the file would flip
 * state on every edit.
 *
 * The marker is searched for **below** the frontmatter, so a property whose value happens to contain the marker
 * text cannot become the split point.
 *
 * Returns null when there is nothing to write — either the file is already right, or the marker is gone. A missing
 * marker is the opt-out: without it there is no way to know where the reader's writing starts, and the safe
 * direction is to leave the file alone rather than guess.
 */
export function mergeRecordBody(existing: string, derived: string): string | null {
  const front = FRONTMATTER_BLOCK.exec(existing)?.[0].length ?? 0;
  const at = existing.indexOf(RECORD_MARKER, front);
  if (at === -1) return null;
  const next = `${existing.slice(0, front)}${derived}${existing.slice(at)}`;
  return next === existing ? null : next;
}

/** Why a deleted annotation's record was kept instead of removed. Null = nothing of the reader's in it. */
export type RecordKeepReason = 'wrote' | 'properties' | 'linked';

/**
 * Whether the reader has anything invested in this record — and if so, what.
 *
 * This is the veto on removing a record whose annotation has been deleted, and it is deliberately wider than
 * "wrote below the marker". Three ways to have made a record yours:
 *
 * - **`wrote`** — anything below the marker. The main test.
 * - **`properties`** — a frontmatter key an export does not write, so it was added by hand. Someone who put
 *   `status:` or `project:` on a record is using it as a note of their own. A key we DO own cannot be the signal,
 *   `tags` included: every export rewrites those, so a value edited there was never going to survive anyway.
 * - **`linked`** — another file links to it. Removing it would leave a broken `[[link]]` in a note we never looked
 *   at, which is a failure the reader discovers later and somewhere else.
 *
 * `note_text` deliberately does **not** count, even though the reader typed it. It is a mirror of the annotation's
 * own text, and the annotation is what was just deleted — keeping a copy of prose they deleted in the reader is
 * clutter, not preservation. Their writing *in the note file* is what `wrote` covers.
 *
 * Pure, so both callers share one answer: the live delete and the cleanup action's removable/yours split, which
 * must agree — a record the live path refuses to remove must not then be offered as removable.
 */
export function recordKeepReason(args: {
  body: string;
  frontmatter: Record<string, unknown> | undefined;
  /** `metadataCache.resolvedLinks`: source path → target path → count. */
  resolvedLinks: Record<string, Record<string, number>>;
  path: string;
}): RecordKeepReason | null {
  if (readerWroteInRecord(args.body)) return 'wrote';
  const extra = Object.keys(args.frontmatter ?? {}).some((k) => !RECORD_PROPERTY_KEYS.includes(k));
  if (extra) return 'properties';
  // A record links to its book and its cover, never to another record — so its own entry is skipped rather than
  // trusted to be absent.
  for (const [source, targets] of Object.entries(args.resolvedLinks)) {
    if (source !== args.path && targets[args.path]) return 'linked';
  }
  return null;
}

/** A record's body at creation time: the derived region, the marker, then room for the reader. */
export function newRecordBody(derived: string): string {
  return `${derived}${RECORD_MARKER}\n`;
}
