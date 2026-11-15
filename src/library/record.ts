// A library record, read out of a note's frontmatter. See docs/design/library.md.
//
// The catalog is notes, not files: a record describes a title whether or not a copy of it is in the vault, which
// is why nothing here touches the filesystem. Everything is a pure function of frontmatter plus a path, so the
// whole schema can be pinned by tests rather than by opening a vault and looking.
//
// **Frontmatter is user data, so every field is defensive.** These notes are written by hand, by other plugins,
// and by people's own scripts against another tool's database — so a field that should be a list arrives as a
// string, a number arrives quoted, and a key is absent as often as it is present. A parser that throws on any of
// that would take the whole view down over one bad note.

import { fieldKeys, fieldValuesFor } from './fields';

/**
 * Reading status, derived where possible and overridden by the note.
 *
 * **There is no `unread`.** Nothing would write it: clearing a status empties the field, and cataloging writes
 * none at all. A value with no writer sits at a count of zero forever, and it would make two ways to be unread —
 * the field absent, or the field saying so. The books nobody has flagged are named
 * and placed as the `NONE_VALUE` row instead, which is what they actually are.
 */
export type ReadingStatus = string;

/**
 * The four Orbis ships, which every vault has whether or not anyone has said so.
 *
 * They keep their meanings in code — finishing a book stamps `date_read`, and nothing else does — while a value the
 * reader declares on the Fields page is theirs and means whatever they meant. That is the whole difference between
 * a built-in status and one of your own: ours have behavior attached, yours have a name and a place in the order.
 */
const BUILT_IN_STATUSES: readonly ReadingStatus[] = ['interested', 'reading', 'read', 'abandoned'];

export interface LibraryRecord {
  /** Path of the note that IS this record — its identity. */
  notePath: string;
  title: string;
  /** Never empty when absent — an empty array, so callers never branch on null. */
  authors: string[];
  /** The medium: book, document, dvd, audiobook — whatever the reader's vocabulary holds. */
  type: string;
  /** What sort of work it is: novel, commentary, reference, documentary. Entirely the reader's vocabulary. */
  genre: string;
  publisher: string;
  publicationDate: string;
  language: string;
  series: string;
  seriesIndex: string;
  subjects: string[];
  tags: string[];
  /** Normalized to digits by the writer; read as written, since a hand-typed one may carry hyphens. */
  isbn: string;
  /** 1–5, or null when unrated. Out-of-range and unparseable values are null rather than clamped. */
  rating: number | null;
  /** Raw link text from `cover`, unresolved — resolving needs the vault. */
  cover: string | null;
  /** Raw link texts from `files`, unresolved and in the order written. */
  files: string[];
  source: string;
  sourceId: string;
  sourceUrl: string;
  /** Notes a converted book was made from, as raw link targets. Written by the EPUB converter; see its design. */
  sourceNotes: string[];
  /** The note's own status when it states one, else null and the caller derives it. */
  status: ReadingStatus | null;
  dateRead: string;
  added: string;
  /**
   * The note's frontmatter as written.
   *
   * Kept because grouping and sorting are not limited to the fields this interface names: a catalog carries
   * `publisher`, `use_count`, `copyright` and whatever else its exporter thought worth writing, and a collection
   * should be able to arrange by any of them. Read-only by convention — the parsed fields above are what code
   * should reach for when it knows what it wants.
   */
  raw: Frontmatter;
}

/** Frontmatter as Obsidian hands it over: parsed YAML of unknown shape. */
export type Frontmatter = Record<string, unknown>;

/**
 * One value, or many, as a list of non-empty strings.
 *
 * `authors: "Doe, Jane"` and `authors: ["Doe, Jane"]` mean the same thing to a person, and both
 * appear in the wild — a single author is the case people write unbracketed. Numbers survive as their text so a
 * `series_index: 2` does not vanish.
 */
export function toStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
}

/** One value as trimmed text. A number keeps its digits; anything else is empty. */
export function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

/**
 * A wikilink's target, or the text itself when it is a plain path.
 *
 * `"[[covers/x.jpg]]"` → `covers/x.jpg`, `"[[a/b.epub|Label]]"` → `a/b.epub`. A bare path is returned as written
 * because a script may emit one, and refusing it would silently drop the only link on the record.
 *
 * **A `#` is kept.** These fields point at files, and a heading inside an EPUB is not a thing you can link to — so a
 * hash here is far more likely to be part of a filename (`Sample Series Book #3.epub`) than a heading reference.
 * Stripping it would produce a path to nothing and make those books look uncataloged. `resolveRecordFile` is where the
 * ambiguity is settled, because settling it needs the vault.
 */
export function linkTarget(value: string): string {
  // Greedy to the LAST `]]`, not stopping at the first `]`: a filename may contain brackets
  // (`The Complete Fairy Tales [168 Tales].epub`), and a pattern that stops early fails to match at all —
  // returning the raw `[[...]]` text, which resolves to nothing. Obsidian cannot follow such a link either; this
  // is the same tolerance the `#` case needs, for the same reason.
  const wiki = value.match(/^!?\[\[(.+)\]\]$/);
  if (wiki) {
    const inner = wiki[1];
    // The alias is after the FIRST pipe: a vault filename cannot contain one, so there is no ambiguity.
    const pipe = inner.indexOf('|');
    return (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  }
  const md = value.match(/^!?\[[^\]]*\]\((.+)\)$/);
  if (md) return decodeURIComponent(md[1].trim());
  return value.trim();
}

/**
 * A linked value as its NAME: the alias where there is one, otherwise the basename.
 *
 * A vault that keeps a note per author writes `authors: ["[[people/John Roe|Johnny]]"]`, and read raw the
 * library would show the brackets and group a book under a folder path. **Not `linkTarget`**, which answers "which
 * file does this point at" — right for `cover` and `files`, wrong for a name.
 *
 * Applied to the fields that hold names rather than pointers: authors, series, publisher and subjects. A vault
 * that links one of those probably links the others.
 */
export function displayName(value: string): string {
  const wiki = value.trim().match(/^!?\[\[(.+)\]\]$/);
  if (!wiki) return value.trim();
  const inner = wiki[1];
  const pipe = inner.indexOf('|');
  if (pipe !== -1) return inner.slice(pipe + 1).trim();
  const path = inner.trim();
  const slash = path.lastIndexOf('/');
  return (slash === -1 ? path : path.slice(slash + 1)).replace(/#.*$/, '').trim();
}

/**
 * A reading status, tolerating a sort prefix.
 *
 * Numeric prefixes (`01-reading`) are a real convention: Bases orders groups by the value grouped on, so
 * numbering the values is the way to get reading order out of a table. Orbis reads through the prefix and writes
 * back whatever the note already used, but never introduces one — see docs/design/library.md.
 */
export function parseStatus(value: unknown): ReadingStatus | null {
  const text = toText(value).trim();
  if (!text) return null;
  const folded = text.toLowerCase();
  const bare = folded.replace(/^\d+\s*[-_.\s]\s*/, '');
  if (BUILT_IN_STATUSES.includes(bare)) return bare;
  // **A status the reader declared is a status.** Grouping and filtering accept any value — they read the
  // frontmatter — so refusing everything but the four would leave a value someone added on the Fields page with a
  // group, a name and an order, and no tick in the menu that sets it. Declared values are matched as written, folded
  // for case the way every other value comparison in the library is.
  //
  // A value the reader has switched OFF is not among these — `fieldValuesFor` drops disabled ones — so a note
  // carrying a retired status reads as none, and setting a new one from the menu is what puts it right.
  const declared = fieldValuesFor('reading_status') ?? [];
  const match = declared.find((entry) => entry.value.trim().toLowerCase() === folded);
  return match ? match.value : null;
}

/**
 * A rating out of five in half steps — `0`, `0.5` … `5` — or null for a title nobody has rated.
 *
 * **Zero is a rating and is not the absence of one.** "I really did not like it" is an opinion, and reading it as
 * "unrated" loses the strongest thing a reader ever says about a book. Everything downstream therefore has to test
 * `=== null` rather than truthiness, since `0` is falsy: the row cell, the menu's label, and the write that clears.
 *
 * **Halves, because five buckets are too few.** Rounded to the nearest half rather than refused, so a catalog that
 * wrote `3.7` is read as 3.5 instead of vanishing — and rounded rather than truncated, so 4.9 is not a 4.
 *
 * Out of range stays null, not clamped: 8 is a mistake, not an opinion, and clamping it to 5 invents a rating
 * nobody gave. That also means a Calibre-style 0–10 scale reads as nothing rather than as wrong — `rating: 7` is
 * not 7 stars, and guessing that it means 3.5 is the kind of guess this plugin does not make.
 */
export function parseRating(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(toText(value));
  if (!Number.isFinite(n)) return null;
  const halves = Math.round(n * 2) / 2;
  return halves >= 0 && halves <= 5 ? halves : null;
}

/**
 * Where each field is read from, in precedence order: first key with a value wins.
 *
 * **Aliases are not a compatibility nicety, they are what makes the Library work against real notes.** People
 * generate these records from a library manager or a reference application, and an alias that looks optional can
 * be load-bearing — without `type_label` a collection reads
 * `text.monograph.biography`, and without `epub_link` no record resolves to a file, so nothing can be read
 * or listened to and Continue is always empty.
 *
 * Each ordering is a decision, not a default, so each is justified here:
 *
 * - **`type_label` beats `type`.** A generator emitting both uses `type` for a machine taxonomy id and the label
 *   for display. A note with only `type` is using the canonical schema, where `type` IS the label — so preferring
 *   the label reads both shapes and preferring `type` reads one.
 * - **`subject_groups` beats `subjects`** for the same reason: emitted together, the grouped one is the cleaned
 *   list and the raw one can be a single string with delimiters still inside it.
 * - **`files` beats `epub_link`**, because the canonical key is the richer one — a title can have two formats,
 *   and a key named for one cannot say so.
 * - **`user_rating`, not `community_rating`.** A rating is the reader's own opinion; the crowd's average is a
 *   different fact, and quietly showing it as yours would be a lie the interface cannot walk back.
 * - **`user_tags` after `tags`**, and `languages` after `language`: same meaning, different exporters.
 * - **`source_id` and `added` collapse the per-tool keys** (`calibre_id`, `resource_id`, `added_to_calibre`,
 *   `added_to_logos`, `import_date`) so that facets and sorts never have to know a tool by name.
 */
/** The first aliased key holding a non-empty list. An empty list is not an answer — it is an absent one. */
function pickList(fm: Frontmatter, field: string): string[] {
  for (const key of fieldKeys(field)) {
    const found = toStringList(fm[key]);
    if (found.length > 0) return found;
  }
  return [];
}

/** The first aliased key holding non-empty text. A list yields its first entry, so `languages` reads as one. */
export function pickText(fm: Frontmatter, field: string): string {
  return pickList(fm, field)[0] ?? '';
}

/**
 * The medium, as a person would say it: book, dvd, audiobook, whitepaper.
 *
 * **There is no separate `kind`.** A second medium field beside `type` would be a synonym in English, and nobody
 * could remember which answered what. So there is one field for the medium and one for the genre, and the words are
 * the ones a catalog uses.
 */
export function parseType(fm: Frontmatter): string {
  return pickText(fm, 'type');
}

/** The files attached to a record, as raw link texts, in the order the record lists them. */
export function parseFiles(fm: Frontmatter): string[] {
  return pickList(fm, 'files').map(linkTarget);
}

/**
 * What a note says it is: `title` for a record, and later `reading_record` for what the reading notes write.
 *
 * **One key with a value, not a family of booleans.** Two flags permit a note that claims to be both, and every
 * new species would mean another key for the parser to know about. One key is one question, and a collection can
 * filter on it directly the day dashboards learn to gather something other than titles.
 */
export const NOTE_KIND_KEY = 'orbis_note';

/** What a note must say to be a record of a title. */
export const NOTE_KIND_TITLE = 'title';

/**
 * What a note must say to be one of the reading records the reader export writes.
 *
 * **Said outright, not inferred.** A record could be recognized by its `orbis_cfi`, and that is the heuristic the
 * title notes refused for the same reason: "is this one of ours" is the question the library cannot afford to
 * guess at, and a note someone wrote by hand about a passage would be swept in by the guess and not by the key.
 *
 * See docs/design/library.md §Reading records on dashboards.
 */
export const NOTE_KIND_READING_RECORD = 'reading_record';

/**
 * One of the reader export's records, as the library reads it.
 *
 * **A different species, not a variant of a title.** A title note describes a work; a record describes a passage
 * of one — so it carries where in the book it is (`orbis_cfi`, `loc`, a chapter) and which book that is, and it
 * carries none of the things a title has (no authors list of its own beyond the book's, no files, no series).
 *
 * The raw frontmatter travels with it, exactly as it does for a title, so a reader's own field on a record is
 * readable without this interface having to know about it.
 */
export interface ReadingRecord {
  /** Path of the note that IS this record — its identity. */
  notePath: string;
  /** `passage selection`, `note` or `bookmark`, as the exporter wrote it. */
  kind: string;
  /** The passage, readable — what a table column leads with. */
  excerpt: string;
  /** The mark's name as it stood when this was exported, and its badge. */
  mark: string;
  markBadge: string;
  /** The book, as a link, and its title as text. */
  book: string;
  bookTitle: string;
  author: string;
  chapter: string;
  chapterIndex: number | null;
  /** Where in the book, as the reader's own location number. */
  loc: string;
  /** The CFI, which is what lets a row open the book at this passage. */
  cfi: string;
  created: string;
  /** The reader's own words, where they wrote any. */
  noteText: string;
  cover: string | null;
  /** Set by the cleanup when the annotation this came from is gone from the book. */
  orphaned: boolean;
  tags: string[];
  raw: Frontmatter;
}

/**
 * Read a note as a reading record, or null.
 *
 * **The species key is the whole test** — `orbis_note: reading_record`, as `title` is for a title note. Nothing
 * else qualifies a note, however much like a record it looks: a note someone wrote by hand about a passage is
 * theirs, and a guess based on `orbis_cfi` would take it.
 */
export function parseReadingRecord(notePath: string, raw: Frontmatter | null | undefined): ReadingRecord | null {
  if (noteKind(raw) !== NOTE_KIND_READING_RECORD) return null;
  const fm: Frontmatter = raw ?? {};
  const index = Number(pickText(fm, 'chapter_index'));
  return {
    notePath,
    kind: pickText(fm, 'kind'),
    excerpt: pickText(fm, 'excerpt'),
    mark: pickText(fm, 'mark'),
    markBadge: pickText(fm, 'mark_badge'),
    book: pickText(fm, 'book'),
    bookTitle: pickText(fm, 'book_title'),
    author: pickText(fm, 'author'),
    chapter: pickText(fm, 'chapter'),
    chapterIndex: Number.isFinite(index) && pickText(fm, 'chapter_index') !== '' ? index : null,
    loc: pickText(fm, 'loc'),
    cfi: pickText(fm, 'orbis_cfi'),
    created: pickText(fm, 'created'),
    noteText: pickText(fm, 'note_text'),
    cover: pickText(fm, 'cover') ? linkTarget(pickText(fm, 'cover')) : null,
    // Always written, so a missing one is a record from before the flag existed rather than an un-orphaned one.
    orphaned: fm.orphaned === true,
    tags: toStringList(fm.tags),
    raw: fm,
  };
}

/**
 * Notes that look like they were generated FROM a book rather than describing one.
 *
 * **A suggestion, not a rule.** Whether a note is a record is what the note says about itself (see `parseRecord`),
 * so this guesswork is used only where guessing is the job: the adopt list, deciding which unflagged notes are
 * worth OFFERING as titles.
 *
 * `book` is the file a note was made from (a record links its files as `files`); the rest name a position in a
 * book or a generation event.
 */
const DERIVED_FROM_BOOK = [
  'orbis_generated',
  'book',
  'chapter',
  'note_set',
  'open_chapter',
  'export_date',
  'generated',
] as const;

/** True when a note looks generated from a book, so the adopt list should leave it alone. */
export function looksGenerated(fm: Frontmatter): boolean {
  return DERIVED_FROM_BOOK.some((key) => {
    const value = fm[key];
    if (value === null || value === undefined) return false;
    return typeof value === 'string' ? value.trim() !== '' : true;
  });
}

/** What this note declares itself to be, trimmed and folded, or empty when it says nothing. */
export function noteKind(fm: Frontmatter | null | undefined): string {
  return toText(fm?.[NOTE_KIND_KEY]).toLowerCase();
}

/**
 * A record from a note's frontmatter, or null when the note is not one.
 *
 * **`orbis_note: title`, and a title. That is the whole rule.**
 *
 * Not a heuristic: treating any note with a `title:` line as a record would make templates, daily notes and other
 * plugins' exports into library rows, and could not tell a record from a reading record.
 *
 * The cost is that a note nobody has stamped is invisible, rather than found and sometimes wrong.
 * Silent-and-fixable is the better failure, and the catalog review is where it gets fixed: it offers every
 * unflagged note that looks like a title, and stamps the ones you accept.
 *
 * A title is still required. What a note declares says which species it is; the title says what to call it, and a
 * nameless row helps nobody.
 */
export function parseRecord(notePath: string, fm: Frontmatter | null | undefined): LibraryRecord | null {
  if (!fm) return null;
  if (noteKind(fm) !== NOTE_KIND_TITLE) return null;
  const title = pickText(fm, 'title');
  if (!title) return null;
  return {
    notePath,
    title,
    authors: pickList(fm, 'authors').map(displayName),
    type: parseType(fm),
    genre: pickText(fm, 'genre'),
    publisher: displayName(pickText(fm, 'publisher')),
    publicationDate: pickText(fm, 'publication_date'),
    language: pickText(fm, 'language'),
    series: displayName(pickText(fm, 'series')),
    seriesIndex: pickText(fm, 'series_index'),
    subjects: pickList(fm, 'subjects').map(displayName),
    tags: pickList(fm, 'tags'),
    isbn: pickText(fm, 'isbn'),
    rating: parseRating(pickText(fm, 'rating')),
    cover: pickText(fm, 'cover') ? linkTarget(pickText(fm, 'cover')) : null,
    files: parseFiles(fm),
    source: pickText(fm, 'source'),
    sourceId: pickText(fm, 'source_id'),
    sourceUrl: pickText(fm, 'source_url'),
    // Link targets rather than the raw text, like `files` and `cover`: these point AT notes, and a caller that
    // wants to open one needs the path rather than the brackets around it.
    sourceNotes: pickList(fm, 'source_notes').map(linkTarget),
    status: parseStatus(pickText(fm, 'reading_status')),
    dateRead: pickText(fm, 'date_read'),
    added: pickText(fm, 'added'),
    raw: fm,
  };
}

/**
 * Sort key for a title, ignoring a leading article.
 *
 * A collection sorted by raw title files every English book under T, and the reader is looking for the word they
 * remember. Only the articles of the note's own language would be right; this handles English, which is what the
 * base locale can honestly claim.
 */
export function titleSortKey(title: string): string {
  return title
    .toLocaleLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/, '');
}
