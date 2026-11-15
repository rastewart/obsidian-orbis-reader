// A folder of Markdown notes → one EPUB, where the notes are chapters and the links between them still work.
//
// This file is the part that decides WHAT the book is: which notes, in what order, called what. The conversion
// itself reuses the single-note pipeline in `markdown-epub.ts` a note at a time. See
// docs/design/markdown-to-epub.md §A folder of notes.
//
// Deliberately free of `App`: everything here takes plain data, so the ordering rule — the piece most likely to be
// argued with — is testable without a vault. Link resolution needs the vault's own answer, so the caller passes it
// in as a function rather than this module reaching for `metadataCache`.

import type { AnchorMap, NoteLinkResolver } from './markdown-xhtml';
import { slugify } from './markdown-xhtml';

/** One candidate note, as this module needs it. A `TFile` satisfies it structurally. */
export interface FolderNote {
  path: string;
  basename: string;
}

/**
 * The note that names the order, if the folder has one.
 *
 * `README`, `index`, `home`, in that precedence and case-insensitively — the three names a folder of documents
 * actually uses. First match wins rather than "error if two exist": a folder with both a README and an index has
 * not done anything wrong, and refusing to convert it would be pedantry.
 */
const INDEX_NAMES = ['readme', 'index', 'home'];

/**
 * @param contentsNotePath the contents note an Orbis export's chapters name in their `toc` — found by the caller,
 *   because it takes the metadata cache. **A folder Orbis wrote has no README**: its index is `000 - {Book}`, so
 *   without this a novel's export would go back to an EPUB titled after its folder with no author, while the note
 *   holding both sits first in the list.
 */
export function findIndexNote<T extends FolderNote>(
  notes: readonly T[],
  contentsNotePath: string | null = null
): T | null {
  // Matched on the DE-PREFIXED name, because this feature is the reason the prefix is there: the ordering rule
  // encourages `001-`, and `001-README.md` failing to be recognized as the index would make the rule quietly inert —
  // the book would fall back to filename order and take its title from the folder.
  const name = (n: FolderNote): string => stripOrderPrefix(n.basename).toLowerCase();
  for (const want of INDEX_NAMES) {
    const hit = notes.find((n) => name(n) === want);
    if (hit) return hit;
  }
  return contentsNotePath ? (notes.find((n) => n.path === contentsNotePath) ?? null) : null;
}

/** What `orbis_generated` says on the chapter notes of a set Orbis wrote from a book: Save as Markdown's
 *  `book-export`, Generate notes' `note-set`. Both title a chapter "Book: Chapter" and both name a contents note. */
export function isOrbisChapterSet(generated: string): boolean {
  return generated === 'book-export' || generated === 'note-set';
}

/**
 * Filename order, **numeric-aware**.
 *
 * `localeCompare` with `numeric` so `10-` sorts after `9-`. The ordering rule encourages numeric prefixes, and an
 * unpadded folder sorting its tenth chapter second would look like the feature was ignoring the numbers.
 */
function byFileName(a: FolderNote, b: FolderNote): number {
  return a.basename.localeCompare(b.basename, undefined, { numeric: true, sensitivity: 'base' });
}

/** Generic in the note type so a caller holding `TFile`s gets `TFile`s back — the alternative is a cast at every
 *  call site, which is how a structural match turns into a lie. */
export interface NoteOrder<T extends FolderNote> {
  ordered: T[];
  /** The index note, when one named the order. Null when this is plain filename order. */
  index: T | null;
  /** Notes the index did not link to, appended rather than dropped. The preview reports this. */
  appended: number;
}

/**
 * The reading order.
 *
 * The index note first — it is chapter one, and the thing that explains the book belongs at the front of it — then
 * the notes it links to, in the order it links to them, then everything it missed in filename order.
 *
 * **A note the index does not name is appended, never dropped.** Losing a chapter because someone forgot a link is
 * a failure discovered three chapters into reading, long after the conversion that caused it.
 *
 * `linkedPaths` is what the caller resolved the index note's links to, in document order — resolution needs a vault,
 * so it happens above this. Anything in it that is not a note being converted (a link out of the folder, a link to
 * an attachment, a duplicate) is ignored here rather than filtered by the caller.
 *
 * **`index` is the caller's, not found again here.** Looking for a README itself would ignore the links of a note
 * picked in the dialog's *Chapter order* whenever it is not called README, index or home — the order would fall
 * back to file names while the control said otherwise.
 */
export function orderNotes<T extends FolderNote>(
  notes: readonly T[],
  index: T | null = null,
  linkedPaths: readonly string[] = []
): NoteOrder<T> {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const ordered: T[] = [];
  const taken = new Set<string>();
  const take = (note: T | undefined): void => {
    if (!note || taken.has(note.path)) return;
    taken.add(note.path);
    ordered.push(note);
  };

  take(index ?? undefined);
  if (index) for (const path of linkedPaths) take(byPath.get(path));
  const rest = notes.filter((n) => !taken.has(n.path)).sort(byFileName);
  for (const note of rest) take(note);

  // Only meaningful when an index actually ordered something — with no index every note is "appended" and the
  // number would be noise.
  return { ordered, index, appended: index ? rest.length : 0 };
}

/**
 * `002-roadmap` → `roadmap`.
 *
 * Not cosmetic. The ordering rule encourages numeric prefixes, so a table of contents reading "002-roadmap" would
 * be the feature advertising its own workaround. Only a leading run of digits followed by a separator counts, so
 * `2048` alone is a title and stays. A year followed by a separator — `1999-a-year-at-sea` — does lose it: the rule
 * cannot tell a year from a sorting prefix, and prefixes are the common case.
 */
export function stripOrderPrefix(basename: string): string {
  const stripped = basename.replace(/^\d{2,}[-_.\s]+/, '');
  return stripped.trim() || basename;
}

/**
 * A heading as plain words: its links unwrapped, its emphasis dropped.
 *
 * **A heading is Markdown, and a title is text.** A heading such as `# [↗](obsidian://orbis-nav?…) CHAPTER ONE` — a
 * jump back into a book, then the name — would otherwise produce a chapter called
 * `[↗](obsidian://orbis-nav?file=fixtures%2F…`, in the dialog and in the EPUB's own table of contents.
 *
 * Inline links become their text, wikilinks become their label (after any `|`), and `*`/`_`/`` ` `` are dropped. A
 * link whose text carries no word character — which is what the ↗ is — is dropped entirely rather than unwrapped:
 * the glyph is a control, not part of the chapter's name.
 */
function headingText(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, (_m, text: string) => (/\w/.test(text) ? text : '')) // [text](url)
    .replace(/\[\[([^\]]*)\]\]/g, (_m, inner: string) => inner.split('|').pop() ?? '') // [[a|b]] → b
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What one section is called: the note's own `h1`, then its frontmatter `title`, then its de-prefixed basename.
 *
 * The heading wins over the frontmatter because it is what a reader of the note sees at the top of it, and the two
 * disagreeing is common in notes written for humans rather than for export. It is read as TEXT — see `headingText` —
 * because a heading may carry links and emphasis that a title must not.
 */
export function sectionTitleOf(note: { heading?: string; frontmatterTitle?: string; basename: string }): string {
  return headingText(note.heading ?? '') || note.frontmatterTitle?.trim() || stripOrderPrefix(note.basename);
}

/**
 * The frontmatter's answer to what a section is called — its `title`, except on a chapter note Orbis wrote.
 *
 * **Those put the book in front of the chapter** (`chapterNoteTitle`), so a set going back to an EPUB would read
 * "<Title>: PART I – CHAPTER I" as a section name, once per section. Only notes that SAY they are Orbis's are
 * read back — a note of the reader's own called "<Title>: a reading" means what it says:
 *
 * - `book-export` (Save as Markdown) keeps the chapter's name alone in `chapter`, which is exact.
 * - `note-set` (Generate notes) keeps a NUMBER there, so the book is taken back off the front instead. Its notes
 *   open with the chapter as a heading, which wins over this anyway; this is for one whose heading was deleted.
 */
export function frontmatterSectionTitle(fm: {
  generated: string;
  title: string;
  chapter: string;
  bookTitle: string;
}): string {
  if (fm.generated === 'book-export' && fm.chapter) return fm.chapter;
  const prefix = `${fm.bookTitle}: `;
  if (isOrbisChapterSet(fm.generated) && fm.bookTitle && fm.title.startsWith(prefix)) {
    return fm.title.slice(prefix.length).trim();
  }
  return fm.title;
}

/**
 * What the book is called: the index note's frontmatter `title`, then its first `h1`, then the folder's name.
 *
 * The opposite precedence to a section title, and deliberately: frontmatter is the metadata the reader wrote *for*
 * export (it is the same key Book Export writes), while an index note's `h1` is often a page heading. A folder name
 * is a last resort — `linked-notes-test` is a folder name, "Orbis Reader — Design Documentation" is a book.
 */
export function bookTitleOf(opts: { frontmatterTitle?: string; heading?: string; folderName: string }): string {
  return opts.frontmatterTitle?.trim() || opts.heading?.trim() || opts.folderName;
}

// ── Links between notes ───────────────────────────────────────────────────────

/** One note as it exists IN the book: where its section landed, and the anchors inside it. */
export interface BookNote {
  /** Vault path, which is what link resolution produces and therefore what this is keyed by. */
  path: string;
  /** The section file it was written to — `sect3.xhtml`. */
  file: string;
  /** Its OWN anchor map. Per note, never pooled: two notes with a `## Overview` produce the same id. */
  anchors: AnchorMap;
}

/**
 * Resolve a link from `from` to another note in the same book.
 *
 * This is what makes a folder a book rather than N documents that happen to share a file. Three cases:
 *
 * - **`roadmap.md`** → that note's section file. The single-note pipeline returns null here (no `#`, nothing in
 *   this book to point at), which is right for one note and exactly wrong for a folder.
 * - **`roadmap.md#the-plan`** → a position inside it, looked up in the TARGET note's anchors.
 * - **A target this book does not hold** — outside the folder, unchecked, an attachment — → null, so the caller
 *   flattens it to text and counts it.
 *
 * `resolvePath` is `metadataCache.getFirstLinkpathDest` in production: the same href means different files from
 * different folders, and reimplementing that resolution rather than asking Obsidian for it would be a second,
 * subtly different answer. Passed in so this stays testable.
 *
 * **A fragment that cannot be placed still links to the file.** A link that lands at the top of the right chapter
 * is a working link; flattening it to text because one heading was renamed is a worse outcome than an imprecise
 * jump.
 */
export function crossNoteResolver(opts: {
  from: string;
  notes: ReadonlyMap<string, BookNote>;
  resolvePath: (href: string, from: string) => string | null;
}): NoteLinkResolver {
  return (href) => {
    // A bare `#anchor` belongs to the note that wrote it, and `domToXhtml` has already tried it there.
    if (!href || href.startsWith('#')) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null; // http:, mailto:, obsidian: — not a note
    const hash = href.indexOf('#');
    const target = hash === -1 ? href : href.slice(0, hash);
    const fragment = hash === -1 ? '' : decodeURIComponent(href.slice(hash + 1)).trim();
    if (!target) return null;

    const path = opts.resolvePath(target, opts.from);
    const note = path ? opts.notes.get(path) : null;
    if (!note) return null;
    if (!fragment) return { file: note.file };
    // The target's own anchors, by real id then by heading slug — the same two keys a link may be written with.
    const hit = note.anchors.get(fragment) ?? note.anchors.get(slugify(fragment));
    return hit ? { file: hit.file, id: hit.id } : { file: note.file };
  };
}

// ── A book per note ───────────────────────────────────────────────────────────
//
// The other output mode: N EPUBs instead of one, plus a Markdown note that links to them. See
// docs/design/markdown-to-epub.md §A book per note.

/**
 * The contents note: a heading and a list of every EPUB, in order. **Always generated, never adopted.**
 *
 * **Not a copy of the folder's index note.** Copying it and rewriting its links would keep the tables and
 * descriptions someone had already written, but it would **duplicate something the conversion already produces.**
 * The index note is itself converted, so `001-README.epub` already holds that curation, with deep links to the other
 * books. Two curated indexes in two formats, one of them a copy, is worse than one of each — a flat directory of
 * files in the vault, and the author's own guide as a book.
 *
 * Generating it means the order in the dialog always means something, every converted EPUB is listed, and
 * unchecking a note has one consistent outcome.
 *
 * `notice` is the "this file is regenerated" comment. Passed in rather than built here so the wording stays with
 * the rest of the user-facing strings.
 */
export function generatedTocMarkdown(
  title: string,
  books: readonly { link: string; title: string }[],
  notice?: string
): string {
  // **Marked as ours, so nothing mistakes it for a record.** It has a title and a list of links, which is exactly
  // record-shaped, and it is not a book — `orbis_generated` is the key every note Orbis writes from a book carries,
  // and it keeps this one out of the catalog AND out of the review's adopt list without either needing to know
  // what a contents note is.
  const lines = ['---', 'orbis_generated: epub-index', '---', ''];
  // An HTML comment: invisible in reading view, plain in edit mode, exactly where someone about to type into this
  // file will see it. Same idiom and same reasoning as `RECORD_MARKER` in reading records.
  if (notice) lines.push(`<!-- ${notice} -->`, '');
  lines.push(`# ${title}`, '');
  for (const book of books) lines.push(`- [[${book.link}|${book.title}]]`);
  lines.push('');
  return lines.join('\n');
}
