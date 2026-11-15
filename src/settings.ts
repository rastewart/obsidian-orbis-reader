import { App, Plugin } from 'obsidian';
import type { AnnotationPreset, BookPreset, PromotedPreset, RemapChoice } from './annotation-presets';
import { TranslationKey } from './i18n/en';
import type { FieldValues, GroupKey, GroupOrder, SortSpec } from './library/arrange';
import type { TimeFrame } from './library/dates';
import type { FieldDefinition } from './library/fields';
import { BODY_TEXT, KEEP_FONT } from './reader/body-text';
import type { Dictionaries } from './reader/lookup/DictionaryService';
import type { Pronouncer, Pronunciation } from './reader/tts/pronunciations';
import { MAX_PIECE_CHARS } from './reader/tts/synth-pieces';
import { defaultThemeList, type ListedTheme, type ThemeColors } from './reader-themes';
import type { RecordKinds, RecordsMode } from './record-config';
import type { DeviceInfo } from './sync/devices';
import type { VersionMap } from './sync/stamp';
import { parseTextAlign, STORAGE_KEY_TEXT_ALIGN, type TextAlign } from './text-align';

/**
 * A reader theme's id: one of the five always offered, a provided extra, or one the reader made — see
 * `reader-themes.ts`, which is the only thing that knows which. A string, because the reader's own are minted ids.
 */
export type Theme = string;

export type DebugCategory =
  | 'relocate' // relocate events, fraction, location, section changes
  | 'index' // buildLocationIndex, loadOrBuildLocationIndex, page cache
  | 'pace' // WPM sampling, reading time estimates
  | 'display' // applyDocStyles, applyRenderer, brightness, font, theme
  | 'nav' // goToSection, prevSection, nextSection, navigateToPage
  | 'annot' // highlights/notes/bookmarks create/edit/delete
  | 'search' // search start/done, hit counts
  | 'export' // book export chapter/image progress
  | 'backlinks' // backlinks scan, cache hit/miss
  | 'sync' // device location save/load, prompt shown
  | 'select' // mobile selection snapback / quote-expansion debug
  | 'annot-nav' // post-navigation CFI/text correction for annotation panel taps
  | 'tts' // read-aloud: reading-unit segmentation + playback
  | 'library' // library repaints: what asked for one, and what was skipped
  | 'sources' // book sources: every request, its answer, and what came back
  | 'settings'; // settings pages: what a control changed, and what it refused to do
export type Flow = 'paginated' | 'scrolled';
export type FontFamily = string;
export type ProgressMode =
  | 'book-percent'
  | 'book-locs'
  | 'chapter-percent'
  | 'chapter-locs'
  | 'book-time'
  | 'chapter-time';

export type NotesSectionId = 'bookmarks' | 'highlights' | 'notes';

// `ebook`, not `epub`: Orbis reads five formats, and a note generated from a .mobi tagged `epub` is
// simply wrong. Only the default — an existing user's saved template is untouched, so their notes keep
// whatever tag they've been getting.
export const DEFAULT_FRONTMATTER_TEMPLATE = `tags:
  - ebook
title: "{{subject}} Notes"
author: "{{author}}"
publisher: "{{publisher}}"
publication_date: "{{publication_date}}"
language: "{{language}}"
filename: "{{filename}}"
book: "{{book_link}}"
book_title: "{{title}}"
reading_status: ""
date_read: ""
import_date: {{today}}`;

/**
 * How one exported annotation is laid out. A template rather than a hard-coded string because note
 * conventions are personal — bullets, quoting, Dataview inline fields, callouts — and the format is not
 * ours to choose on everyone's behalf.
 *
 * `{{mark}}` is the composed `badge name: ` prefix; `{{badge}}` and `{{name}}` are its parts, for a
 * different arrangement. An absent token resolves to empty, so removing the quotes around `{{text}}` is how
 * you stop dialogue exporting as `""He said," she said"` — the doubled quote a fixed format cannot avoid.
 */
export const DEFAULT_HIGHLIGHT_LINE_TEMPLATE = '- {{mark}}"{{selection}}" — {{link}}';

/** As above. `{{selection}}` is the quoted passage a note is attached to, as its own block — empty when the
 *  note has none, which is why the quoting lives in the token rather than in the template. */
export const DEFAULT_NOTE_LINE_TEMPLATE = '{{selection_block}}{{mark}}{{note_text}} — {{link}}';

/** The plain line: a bookmark has nothing of its own to say, so the link is the line. The tokens
 *  exist for anyone who wants more. */
export const DEFAULT_BOOKMARK_LINE_TEMPLATE = '- {{link}}';

/**
 * Shared by both line templates, and shared BY NAME on purpose: one thing is called one thing wherever it
 * appears. `{{selection}}` is the book's words — the passage you highlighted, or the passage a note hangs on,
 * which are the same thing seen from either side. `{{selection_block}}` is that passage rendered as a
 * `> "…"` block; a different thing, so a different name rather than one token meaning two shapes.
 *
 * There is no `{{text}}`: it would mean the book's words on the highlight template and the reader's on the
 * note one — exactly the trap a template exists to remove.
 */
const COMMON_VARIABLES = ['{{link}}', '{{loc}}', '{{chapter}}', '{{date}}'] as const;

const LINE_VARIABLES = [
  // Prefixed so the three read as a family. Bare `{{badge}}` and `{{name}}` would give no hint they belong to
  // the mark — `{{name}}` in particular could as easily mean the book's or the chapter's.
  '{{mark}}',
  '{{mark_badge}}',
  '{{mark_name}}',
  '{{selection}}',
  '{{selection_block}}',
  ...COMMON_VARIABLES,
] as const;

export const HIGHLIGHT_LINE_VARIABLES = LINE_VARIABLES;

/** A note has a second text of its own: what the reader typed. */
export const NOTE_LINE_VARIABLES = [...LINE_VARIABLES, '{{note_text}}'] as const;

/**
 * A bookmark has no mark and no text, so it shares only the common four — plus `{{kind}}`, which says
 * whether it was made while reading or while listening and is the one thing about a bookmark that nothing
 * else in an export can tell you.
 *
 * No `{{label}}`, deliberately. `Bookmark.label` looks like a name but is a breadcrumb derived at creation
 * time (`CHAPTER IX. · loc. 51`), so it says nothing `{{chapter}}` and `{{loc}}` do not — and being frozen
 * when it was written, it can be staler than they are.
 */
export const BOOKMARK_LINE_VARIABLES = [...COMMON_VARIABLES, '{{kind}}'] as const;

/**
 * The frontmatter tokens, each with what it stands for.
 *
 * `{token, labelKey}` like the file-name lists rather than bare strings: the editor builds both the chips and the
 * "Placeholder details" fold from this, so a token cannot exist without an explanation of it.
 */
export const FRONTMATTER_VARIABLES: { token: string; labelKey: TranslationKey }[] = [
  { token: '{{title}}', labelKey: 'notes_styles_page.token_book_title' },
  // What the note is about, so ONE template titles both formats: the book in a single note, the book and chapter
  // in a chapter note. `{{title}}` stays the book everywhere, which is what `book_title` needs.
  { token: '{{subject}}', labelKey: 'notes_styles_page.token_subject' },
  { token: '{{author}}', labelKey: 'notes_styles_page.token_author' },
  { token: '{{publisher}}', labelKey: 'notes_styles_page.token_publisher' },
  { token: '{{publication_date}}', labelKey: 'notes_styles_page.token_publication_date' },
  { token: '{{language}}', labelKey: 'notes_styles_page.token_language' },
  { token: '{{description}}', labelKey: 'notes_styles_page.token_description' },
  { token: '{{filename}}', labelKey: 'notes_styles_page.token_filename' },
  { token: '{{book_link}}', labelKey: 'notes_styles_page.token_book_link' },
  { token: '{{today}}', labelKey: 'notes_styles_page.token_todays_date' },
];

export const DEFAULT_FILE_NAME_TEMPLATE = '{{title}} Notes';
export const DEFAULT_FOLDER_NAME_TEMPLATE = '{{title}} Notes';
export const DEFAULT_CHAPTER_FILE_TEMPLATE = '{{index}} - {{chapter}}';

export const FILE_NAME_VARIABLES: { token: string; labelKey: TranslationKey }[] = [
  { token: '{{title}}', labelKey: 'notes_styles_page.token_book_title' },
  { token: '{{author}}', labelKey: 'notes_styles_page.token_author' },
  { token: '{{filename}}', labelKey: 'notes_styles_page.token_filename' },
  { token: '{{style}}', labelKey: 'notes_styles_page.token_style_name' },
  { token: '{{today}}', labelKey: 'notes_styles_page.token_todays_date' },
];

export const FOLDER_NAME_VARIABLES: { token: string; labelKey: TranslationKey }[] = [
  { token: '{{title}}', labelKey: 'notes_styles_page.token_book_title' },
  { token: '{{author}}', labelKey: 'notes_styles_page.token_author' },
  { token: '{{filename}}', labelKey: 'notes_styles_page.token_filename' },
  { token: '{{style}}', labelKey: 'notes_styles_page.token_style_name' },
  { token: '{{today}}', labelKey: 'notes_styles_page.token_todays_date' },
];

export const CHAPTER_FILE_VARIABLES: { token: string; labelKey: TranslationKey }[] = [
  { token: '{{index}}', labelKey: 'notes_styles_page.token_chapter_number' },
  { token: '{{chapter}}', labelKey: 'notes_styles_page.token_chapter_title' },
  { token: '{{title}}', labelKey: 'notes_styles_page.token_book_title' },
  { token: '{{style}}', labelKey: 'notes_styles_page.token_style_name' },
];

export const FONT_FAMILY_OPTIONS: { value: FontFamily; labelKey: TranslationKey }[] = [
  { value: 'default', labelKey: 'appearance_page.default_use_book_fonts' },
  { value: 'obsidian', labelKey: 'appearance_page.follow_obsidian' },
  { value: 'Georgia, serif', labelKey: 'appearance_page.georgia' },
  { value: '"Palatino Linotype", Palatino, serif', labelKey: 'appearance_page.palatino' },
  { value: '"Times New Roman", Times, serif', labelKey: 'appearance_page.times_new_roman' },
  { value: 'Arial, Helvetica, sans-serif', labelKey: 'appearance_page.arial' },
  { value: 'Verdana, Geneva, sans-serif', labelKey: 'appearance_page.verdana' },
  { value: '"Trebuchet MS", sans-serif', labelKey: 'appearance_page.trebuchet_ms' },
];

// ── Note styles ──────────────────────────────────────────────────────────────

/**
 * The name suggested when creating the folder, and the stem of the global base's filename.
 *
 * Not the default SETTING value — that starts empty so the reader has to choose. Used for the base filename so
 * that renaming their folder does not orphan a base which is never overwritten.
 */
export const DEFAULT_RECORDS_FOLDER = 'Reading records';

export interface NoteStyle {
  id: string;
  name: string;
  isDefault: boolean;
  /**
   * The style Orbis ships, rather than one the reader made. It cannot be deleted: nothing reseeds it once other
   * styles exist, so deleting it loses the baseline the others were built from.
   *
   * **Stated, not inferred.** The id is identity, the name is presentation, and neither is a claim about
   * provenance, so a flag says it. A vault set up before `SEEDED_NOTE_STYLE_ID` existed carries a generated id;
   * `adoptShippedNoteStyle` stamps the flag once from the id or the name, and after that they are never consulted
   * again.
   *
   * Optional because styles written before it exists have no opinion — absent means "a reader's style".
   */
  isSystem?: boolean;
  createdAt: number;
  config: {
    useSameFolder: boolean;
    notePath: string;
    fileNameTemplate: string;
    frontmatterTemplate: string;
    includeChapterHeadings: boolean;
    chapterScope: 'all' | 'with-content';
    includeBookmarks: boolean;
    includeHighlights: boolean;
    includeNotes: boolean;
    /** One exported highlight / note. See DEFAULT_HIGHLIGHT_LINE_TEMPLATE. */
    highlightLineTemplate: string;
    noteLineTemplate: string;
    bookmarkLineTemplate: string;
    sectionOrder: NotesSectionId[];
    perChapter: boolean;
    folderNameTemplate: string;
    chapterFileTemplate: string;
    chapterFilesScope: 'all' | 'with-content';
  };
}

export const DEFAULT_NOTE_STYLE_CONFIG: NoteStyle['config'] = {
  useSameFolder: true,
  notePath: '/',
  fileNameTemplate: DEFAULT_FILE_NAME_TEMPLATE,
  frontmatterTemplate: DEFAULT_FRONTMATTER_TEMPLATE,
  includeChapterHeadings: true,
  chapterScope: 'all',
  includeBookmarks: true,
  includeHighlights: true,
  includeNotes: true,
  highlightLineTemplate: DEFAULT_HIGHLIGHT_LINE_TEMPLATE,
  noteLineTemplate: DEFAULT_NOTE_LINE_TEMPLATE,
  bookmarkLineTemplate: DEFAULT_BOOKMARK_LINE_TEMPLATE,
  sectionOrder: ['bookmarks', 'highlights', 'notes'],
  perChapter: false,
  folderNameTemplate: DEFAULT_FOLDER_NAME_TEMPLATE,
  chapterFileTemplate: DEFAULT_CHAPTER_FILE_TEMPLATE,
  chapterFilesScope: 'all',
};

export function generateNoteStyleId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Display styles ───────────────────────────────────────────────────────────

export interface DisplayStyle {
  id: string;
  name: string;
  deviceId?: string; // set only for auto-created device-default styles
  settings: {
    theme: Theme;
    fontFamily: FontFamily;
    fontSize: number;
    lineHeight: number;
    textAlign: TextAlign;
    margins: number;
    brightness: number;
    flow: Flow;
    columns: 1 | 2;
  };
  createdAt: number;
}

// ── Book export settings ─────────────────────────────────────────────────────

export interface BookExportSettings {
  defaultExportFolder: string;
  perChapter: boolean;
  includeImages: boolean;
  imageFormat: 'wiki' | 'markdown';
}

// ── Progress indicator modes ──────────────────────────────────────────────────

export interface ProgressModeConfig {
  id: ProgressMode;
  visible: boolean;
}

// The settings row for each mode: its name and description, as translation keys.
export const PROGRESS_MODE_GRID_LABELS: Record<ProgressMode, { main: TranslationKey; sub: TranslationKey }> = {
  'book-percent': { main: 'progress_modes.book_percent', sub: 'progress_modes.book_percent_desc' },
  'book-locs': { main: 'progress_modes.book_locs', sub: 'progress_modes.book_locs_desc' },
  'book-time': { main: 'progress_modes.book_time', sub: 'progress_modes.book_time_desc' },
  'chapter-percent': { main: 'progress_modes.chapter_percent', sub: 'progress_modes.chapter_percent_desc' },
  'chapter-locs': { main: 'progress_modes.chapter_locs', sub: 'progress_modes.chapter_locs_desc' },
  'chapter-time': { main: 'progress_modes.chapter_time', sub: 'progress_modes.chapter_time_desc' },
};

// Display order for settings UI: alternates so book modes fill the left column
// and chapter modes fill the right column.
export const PROGRESS_MODE_DISPLAY_ORDER: ProgressMode[] = [
  'book-percent',
  'chapter-percent',
  'book-locs',
  'chapter-locs',
  'book-time',
  'chapter-time',
];

export const DEFAULT_PROGRESS_MODES: ProgressModeConfig[] = PROGRESS_MODE_DISPLAY_ORDER.map((id) => ({
  id,
  visible: true,
}));

// ── Plugin-level settings (synced across devices via Obsidian Sync) ──────────
// Reading display settings live in localStorage (see STORAGE_KEY_* below).

// Bump when a change to OrbisPluginSettings would be considered breaking, and add
// a migration in main.ts's loadSettings() keyed off the old version. Existing
// users' data.json predates this field and has no settingsVersion of its own —
// Object.assign against DEFAULT_PLUGIN_SETTINGS in loadSettings() fills it in.
const CURRENT_SETTINGS_VERSION = 1;

/**
 * Per-device Listen voice preference. Keyed by `deviceId` (see getOrCreateDeviceId) so that even
 * when data.json is synced, each device keeps its own voice — a voice chosen on the Mac never
 * bricks Listen on Android (which has no system voices) or vice-versa.
 */
export interface VoicePref {
  deviceId: string;
  /** 'orbis' = downloaded on-device neural voice; 'system' = an OS-provided voice. */
  source: 'orbis' | 'system';
  /** Orbis catalog voice id (when source === 'orbis'). */
  orbisVoiceId?: string;
  /** Speaker id (0-based) for a multi-speaker Orbis model; omitted/0 for single-speaker voices. */
  orbisSid?: number;
  /** System voice URI from speechSynthesis (when source === 'system'). */
  systemVoiceURI?: string;
}

/** How much text a live voice prepares at a time. */
export type ReadAhead = 'sentence' | 'few-sentences';

/**
 * Narrow a stored value to a Read ahead choice. `paragraph`, a choice that no longer exists, reads as the nearest one
 * left; anything else as the default.
 */
export function asReadAhead(v: unknown): ReadAhead {
  return v === 'few-sentences' || v === 'paragraph' ? 'few-sentences' : 'sentence';
}

/**
 * Map the Read-ahead setting to a chunk-size cap in characters (0 = per sentence).
 *
 * **A few sentences stops where the voice would start cutting** (`MAX_PIECE_CHARS`): a chunk up to that length is
 * prepared in one pass, which is what lets its sentences flow into each other. A longer chunk is prepared sentence by
 * sentence and joined, so a larger cap here would only make the wait before it plays longer.
 */
export function readAheadMaxChars(v: unknown): number {
  return asReadAhead(v) === 'sentence' ? 0 : MAX_PIECE_CHARS;
}

/** Jump sizes offered for the rewind / forward buttons, in seconds. */
export const SKIP_SECONDS_OPTIONS = [5, 10, 15, 30, 45, 60] as const;
export type SkipSeconds = (typeof SKIP_SECONDS_OPTIONS)[number];

/** Narrow a persisted/raw value to an offered jump size, falling back to 15. */
export function asSkipSeconds(v: unknown): SkipSeconds {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseInt(v, 10) : Number.NaN;
  return (SKIP_SECONDS_OPTIONS as readonly number[]).includes(n) ? (n as SkipSeconds) : 15;
}

/** How much text the reading highlight spans while listening. */
export type ReadingHighlightMode = 'off' | 'word' | 'sentence' | 'paragraph';

/** Narrow a persisted/raw value to a reading-highlight mode, falling back to the default. */
export function asReadingHighlightMode(v: unknown): ReadingHighlightMode {
  return v === 'off' || v === 'word' || v === 'paragraph' ? v : 'sentence';
}

export type LookupSectionId = 'definition' | 'vault' | 'web';
export interface LookupSection {
  id: LookupSectionId;
  visible: boolean;
}
/**
 * The two fields a rule can name that are not frontmatter.
 *
 * Spelled `file.` after Bases' own convention, which also keeps them from colliding with a frontmatter key
 * someone happens to have called `folder` or `tag`.
 */
export const RULE_FIELD_FOLDER = 'file.folder';
export const RULE_FIELD_TAG = 'file.tag';

/**
 * How a rule compares. Which of these apply depends on the field — a folder is not "contained", it is entered.
 *
 * `under` includes subfolders; `directly-in` is the immediate children only.
 */
/** What a pick draws from: everything the collection holds, or only titles nobody has decided about. */
export type PickPool = 'any' | 'no-status';

export type RuleOperator =
  | 'under'
  | 'directly-in'
  | 'is'
  | 'is-not'
  | 'contains'
  | 'exists'
  | 'not-exists'
  // The five over a date, reading the same parser the groupings use — see `library/dates.ts`. A relative one is
  // answered against today, so a collection re-decides as time passes, which is the whole point of it.
  | 'in-last-days'
  | 'older-than-days'
  | 'in-period'
  | 'before'
  | 'after'
  | 'on-date-annually'
  // The four over a number, for the fields where `is` alone means writing one condition per value: a rating of at
  // least four would otherwise be four `any` conditions.
  | 'greater-than'
  | 'at-least'
  | 'less-than'
  | 'at-most';

/** A named stretch of the calendar, for `in-period`. Weeks start on Monday, as they do everywhere here. */
export type RulePeriod =
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'this-year'
  | 'last-year';

/** One condition: a field, an operator, and a value the last two operators ignore. */
export interface CollectionRule {
  /** `file.folder`, `file.tag`, or a frontmatter key exactly as the note writes it. */
  field: string;
  op: RuleOperator;
  value: string;
}

/** Rules combined with `all` (and) or `any` (or) — chosen per set. */
export interface CollectionRuleSet {
  match: 'all' | 'any';
  rules: CollectionRule[];
}

/**
 * How a widget presents its titles: a list of rows, or a grid of covers.
 *
 * Kept as a union rather than a boolean so adding a third presentation is an addition rather than a rewrite.
 */
/**
 * How a widget draws its titles: a row each, a shelf of covers, or a grid with a column per field.
 *
 * A table is a list with the chosen fields turned sideways — same fields, same order, same first column — so
 * switching between them is a change of shape and never of content.
 */
/** The two kinds of note the library gathers: a note describing a work, and a note describing a passage of one. */
export type NoteSpecies = 'title' | 'reading_record';

export type LibraryViewType = 'list' | 'covers' | 'table';

/**
 * What sort of widget this is.
 *
 * **Every widget shows a collection; the kind says which slice of it.** Collection is the population, kind is the
 * question asked of it, view is how the answer looks. A kind that skipped the collection would make "search,
 * but only inside this folder" inexpressible — the thing a catalog of thousands most wants. The provided widgets
 * point at the system collection, every title in the vault.
 *
 * The derived kinds cannot BE collections: **continue**, **recordings** and **a pick** come from what sits beside
 * the book on disk (location files, an audio folder) or from a choice, none of which a filter over frontmatter
 * could express. `recent` is the exception that proves it — sorting by a field is something a collection can do,
 * and it is a kind anyway so a dashboard need not have one built by hand to show what just arrived.
 *
 * There is no `uncataloged` kind listing books with no title note: it would be the only widget that ACTS rather
 * than shows, and the only one whose population is FILES rather than title notes — the one kind that could never
 * take a collection.
 */
/**
 * `records` is `titles` for the other species: the collection itself, drawn as rows.
 *
 * A separate kind rather than reusing `titles`, because a widget's kind is what says which species it draws — and a
 * kind that meant "titles here, records there depending on the collection" would be a name that lies about half the
 * dashboards it appears on. Which kinds a collection can offer is `widgetKindsFor`.
 */
export type WidgetKind = 'titles' | 'records' | 'continue' | 'recordings' | 'pick' | 'recent' | 'search' | 'summary';

/** How a summary widget ends its list: with nothing, with the rows added up, or with the collection's own size. */
export type SummaryTotals = 'off' | 'sum' | 'collection';

/**
 * One appearance of something on a dashboard.
 *
 * The collection says WHAT; the widget says HOW. That is what lets one collection appear twice on a dashboard —
 * five titles as covers at the top, all of them as a list below — and it is why the view lives here rather than on
 * the collection. See docs/design/library.md.
 */
export interface DashboardWidget {
  id: string;
  kind: WidgetKind;
  /** Heading. Absent falls back to the collection's name, or to the kind's own word. */
  label?: string;
  /**
   * The collection this widget draws from. Always set — the system collection is every title in the vault.
   *
   * Every kind is scoped by it, not only the one that shows a collection outright: "what I am part-way through, in
   * this shelf", "search, but only these". That is what makes collection / kind / view three independent axes
   * rather than two and a half.
   */
  collection: string;
  view: LibraryViewType;
  /** How many titles to show here. **Absent means all of them.** */
  count?: number;
  /**
   * How the expanded view looks — and, by being absent, whether there is one at all.
   *
   * One field rather than a flag plus a type: those two can disagree (expansion on with no view, a view set on a
   * widget that never expands) and something would then have to decide what that means.
   */
  expandedView?: LibraryViewType;
  /**
   * How search results are ordered: by how well they match, or by the collection's own sort.
   *
   * Search is the one kind that generates an ordering of its own — a title that STARTS with what you typed ranks
   * above one that merely contains it — so it is the one kind where its answer and the collection's sort can
   * disagree. Absent means best match.
   */
  searchOrder?: 'match' | 'collection';
  /**
   * The fields shown beside a title: under it in a list, in its tooltip on a cover, one column each in a table.
   *
   * **One list for every view**, so switching a widget from list to table and back does not lose the choice —
   * the view decides how they are shown, never which. Absent means the default pair, its authors and its
   * series; empty means none at all, which is a legitimate thing to ask for on a shelf of covers.
   */
  fields?: string[];
  /**
   * The total under a summary's rows. Absent is `off`.
   *
   * Two totals rather than one, because they answer different questions and only agree for a single-valued
   * grouping: `sum` always matches the numbers above it, and `collection` always matches the collection's size
   * wherever else it is shown. A book with three authors is in three rows and is one item, and neither number is
   * wrong — so the row is labeled for the one chosen.
   */
  totals?: SummaryTotals;
  /**
   * Whether a summary lists values nothing in the collection uses.
   *
   * Only meaningful where the grouping field HAS a list of possible values — group by author and there is no
   * universe to compare against, so the editor does not offer it. Empty rows take their place in the value order
   * like any other, rather than being pushed to the end: the order set in the fields table is the answer to where
   * a value goes, and having none of something does not move it.
   */
  showEmptyGroups?: boolean;
  /**
   * Which titles a pick may suggest. **Absent means only titles with no reading status** — the default rule, said in
   * the vocabulary the library actually has.
   *
   * A status is a decision about a book, and a suggestion is for books nobody has decided about: that includes
   * "flagged for later", because a book you have flagged is one you have already picked. What you have been meaning
   * to read is a different question, and the answer to it is a collection of that status with a pick of its own.
   */
  pickPool?: PickPool;
  /**
   * Whether a pick suggests only titles with a book file in the vault. Absent is false.
   *
   * The one thing a collection cannot express: a frontmatter link says nothing about whether its target exists. Off
   * by default because a library item is a note and its file is optional — a book owned in print or held in another
   * app is a title you can be reminded of, even though there is nothing here to open.
   */
  pickRequiresFile?: boolean;
  enabled: boolean;
  /** System widgets can be disabled but never deleted. */
  system?: boolean;
}

/** An ordered list of widgets. The ribbon icon opens whichever one is active. */
export interface LibraryDashboard {
  id: string;
  name: string;
  widgets: DashboardWidget[];
  /**
   * Whether it can be opened at all — **read once and then per device**.
   *
   * On/off is a statement about a device, not about a dashboard, and syncing it would mean switching one off on the
   * desktop switches it off on the phone. `libraryDashboardOrder` holds it; this is kept only so an answer written
   * here by an older version survives the move.
   *
   * Separate from which one is *showing*: this says "available", `libraryActiveDashboard` says "current".
   */
  enabled?: boolean;
  /**
   * When this dashboard was built, ISO. Written once and never edited.
   *
   * **A device that has never seen this vault orders by it.** Without it, the first order on a fresh device is
   * whatever the filesystem returned — which is neither stable nor the same as the other device's.
   */
  created?: string;
  /** The one that ships. It can be copied and set aside, but not deleted. */
  system?: boolean;
}

/**
 * A collection in the Library view: a SOURCE of records, not a container.
 *
 * Nothing moves to be gathered, so one note can appear on two collections. See docs/design/library.md.
 *
 * **Rule sets are combined with `any`, and the rules inside one with the set's own `all`/`any`** — sum of
 * products. Any flat boolean condition can be written that way, which is exactly why there is no nesting and no
 * expression to type.
 *
 * The `folder` / `tag` / `property` fields are what collections looked like before rules existed; they are read once
 * to build `ruleSets` and never again.
 */
export interface LibraryCollection {
  id: string;
  name: string;
  /**
   * Provided by Orbis, rebuilt from code on every load.
   *
   * It can be used anywhere and deleted nowhere. Nothing about it is read back from disk, so an update can change
   * what it means without a migration — and nothing a reader could edit would survive, which is why editing is not
   * offered rather than offered and then undone.
   */
  system?: boolean;
  /**
   * Which species of note this collection gathers. Absent means title notes, which is every collection that
   * existed before records did — so nothing has to be migrated.
   *
   * **Fixed when the collection is made, never switched.** Its conditions, grouping, time frame, sort and value
   * names are all about one species, so changing this would invalidate all of them at once rather than one of
   * them. Settings offers two lists instead of a dropdown, which makes that state unrepresentable — see
   * docs/design/library.md §Reading records on dashboards.
   */
  species?: NoteSpecies;
  ruleSets?: CollectionRuleSet[];
  /** How the collection is cut up, and in what order — see `src/library/arrange.ts`. Absent means title order,
   *  ungrouped. */
  groupBy?: GroupKey;
  /**
   * The order the GROUPS come in — not the records inside them, which is `sort`.
   *
   * On the collection rather than on the widget that wanted it: a summary widget lists groups, and a grouped list
   * widget prints the same groups as headings, so "biggest genre first" means the same thing in both. Arrangement
   * comes from the collection, and one setting keeps it that way.
   *
   * Absent means the field's own value order — the sequence set in the fields table, which is what makes reading
   * statuses read in reading order rather than alphabetically. Ordering by size overrides a placed "no value" row,
   * since its count is as real as any other.
   */
  groupOrder?: GroupOrder;
  /**
   * How a date field is cut up — see `TimeFrame`. Absent means the values group as they are written.
   *
   * Beside `groupBy` rather than encoded into it (`added:month`), so nothing has to parse a key to know what it
   * means, and the editor can offer the row only when the field being grouped actually holds dates.
   */
  groupBucket?: TimeFrame;
  sort?: SortSpec[];
  /**
   * What this collection calls a field's values, and the order it wants them in — keyed by field name.
   *
   * Per collection, because it is part of how THIS collection is arranged; keyed by field so the same table can be
   * lifted into a fields manager later and become a default without changing shape. Copying a collection carries it,
   * which is the answer to setting it up twice.
   */
  fieldValues?: FieldValues;
  /**
   * Whether it showed, before widgets had their own switch.
   *
   * Read once at load to disable the widgets pointing at it, then deleted. A collection is a definition; whether it
   * appears is a question about a place it appears in, and two switches for that were one too many.
   */
  enabled?: boolean;
  // The five fields below are the shape collections had before rules existed. They are read exactly once, by
  // `rulesFromLegacyCollection` during load, and never written again. Not marked `@deprecated`: the only site that
  // touches them is the migration, and warning there would put a squiggle on the one correct use.
  folder?: string;
  includeSubfolders?: boolean;
  tag?: string;
  property?: string;
  value?: string;
}

/** A "Search the web" destination in the lookup popup. Built-ins can be enabled/disabled but not
 *  deleted or edited; user-added ones can be edited/deleted. `url` contains a `{{query}}` token. */
export interface LookupWebDestination {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  builtin: boolean;
}

/**
 * An OPDS catalog you can browse and download books from. See docs/design/book-sources.md.
 *
 * Built-ins can be switched off but not edited or deleted — the same contract the look-up destinations have, and for
 * the same reason: their URL is ours to keep correct, and a reader who has broken one has no way back to it.
 *
 * **No credential is in here, neither half.** Both the username and the password live in `app.secretStorage`, keyed by
 * this source's id — see `usernameIdFor` and `passwordIdFor`. A credential is a pair, and this list travels between
 * devices where a credential must not, so a source arrives on another device usable and unauthenticated.
 */
export interface BookSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  builtin: boolean;
  /**
   * A language code to ask this catalog for — `en`, `fr` — when the catalog has a way of being asked.
   *
   * **Per source, because it is a fact about the catalog rather than about the reader.** Gutenberg holds books in
   * seventy languages and a search for "Finn" comes back mostly Finnish; a Calibre server holds what its owner put in
   * it and needs no filter. So the setting appears only for sources whose syntax Orbis knows — see `takesLanguage`.
   */
  language?: string;
}

/**
 * The sources Orbis ships, in display order.
 *
 * One: Gutenberg's search endpoint, which is public and needs no account. Calibre is deliberately absent — its URL is
 * the reader's own server, so there is nothing for us to fill in. So is Standard Ebooks: every one of its OPDS feeds
 * needs a paid membership, so a shipped entry would be a row most readers cannot open. The book-sources user guide
 * shows how to add it.
 *
 * **Enabled, and still inert.** Nothing reaches the network until the feature is switched on, and then only when a
 * reader taps something: see the one-request-per-action rule in the design doc. Enabled here means "ready", not
 * "running".
 *
 * The URL comes from published documentation and is worth re-checking rather than trusted — Gutenberg expects to
 * sunset its XML feeds in 2027.
 */
export const BUILTIN_BOOK_SOURCES: BookSource[] = [
  {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    url: 'https://www.gutenberg.org/ebooks/search.opds/',
    enabled: true,
    builtin: true,
  },
];

export const DEFAULT_LOOKUP_SECTIONS: LookupSection[] = [
  { id: 'definition', visible: true },
  { id: 'vault', visible: true },
  { id: 'web', visible: true },
];

export const LOOKUP_SECTION_LABELS: Record<LookupSectionId, TranslationKey> = {
  definition: 'lookup.section_definition',
  vault: 'lookup.section_vault',
  web: 'lookup.section_web',
};

// Built-in web destinations, in display order. `enabled` here is the default for a fresh install;
// loadSettings re-merges by id so a user's enabled flags survive and new built-ins get added.
export const BUILTIN_LOOKUP_DESTINATIONS: LookupWebDestination[] = [
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    url: 'https://en.wikipedia.org/w/index.php?search={{query}}',
    enabled: true,
    builtin: true,
  },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={{query}}', enabled: true, builtin: true },
  {
    id: 'wiktionary',
    name: 'Wiktionary',
    url: 'https://en.wiktionary.org/wiki/{{query}}',
    enabled: true,
    builtin: true,
  },
  {
    id: 'merriam-webster',
    name: 'Merriam-Webster',
    url: 'https://www.merriam-webster.com/dictionary/{{query}}',
    enabled: true,
    builtin: true,
  },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={{query}}', enabled: false, builtin: true },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={{query}}', enabled: false, builtin: true },
  {
    id: 'google-books',
    name: 'Google Books',
    url: 'https://www.google.com/search?tbm=bks&q={{query}}',
    enabled: false,
    builtin: true,
  },
  {
    id: 'etymonline',
    name: 'Etymonline',
    url: 'https://www.etymonline.com/search?q={{query}}',
    enabled: false,
    builtin: true,
  },
  {
    id: 'wikiquote',
    name: 'Wikiquote',
    url: 'https://en.wikiquote.org/w/index.php?search={{query}}',
    enabled: false,
    builtin: true,
  },
  {
    id: 'google-translate',
    name: 'Google Translate',
    url: 'https://translate.google.com/?sl=auto&tl=en&text={{query}}&op=translate',
    enabled: false,
    builtin: true,
  },
  {
    id: 'thesaurus',
    name: 'Thesaurus.com',
    url: 'https://www.thesaurus.com/browse/{{query}}',
    enabled: false,
    builtin: true,
  },
  {
    id: 'britannica',
    name: 'Britannica',
    url: 'https://www.britannica.com/search?query={{query}}',
    enabled: false,
    builtin: true,
  },
];

export interface OrbisPluginSettings {
  settingsVersion: number;
  styles: DisplayStyle[];
  noteStyles: NoteStyle[];
  /** Global annotation presets. Seeded on first run (see initializeDefaultAnnotationPreset).
   *  ORDERED array per preset — see annotation-presets.ts. */
  annotationPresets: AnnotationPreset[];
  /** Whether the listening Highlight button highlights the current sentence or paragraph. */
  audioHighlightGranularity: 'sentence' | 'paragraph';
  /** Whether the listening Note button annotates the current sentence or paragraph. */
  audioNoteGranularity: 'sentence' | 'paragraph';
  /** Phonetic respellings substituted just before synthesis, so a voice that mangles a name can be
   *  told how to say it. Global (a proper name sounds the same in every book) — see
   *  reader/tts/pronunciations.ts. Applies to live voices and to newly recorded audio; changing an
   *  entry does not alter MP3s that were already recorded. */
  pronunciations: Pronunciation[];
  /** Order + visibility of the word-lookup popup's sections (array order = display order). */
  lookupSections: LookupSection[];
  /** Web-search destinations for the lookup popup's "Search the web" section. */
  lookupWebDestinations: LookupWebDestination[];
  /** The catalogs, in the reader's order — see `BookSource`. */
  bookSources: BookSource[];
  /**
   * Where downloaded books are written. Empty means the vault root, which is nobody's intention — so the switch asks
   * for it before the feature is on, the way the Library asks where title notes go.
   */
  bookSourcesFolder: string;
  /** Library collections, in display order. Empty until the reader adds one — a library with no collections has
   *  nothing to show, and guessing which folders hold books would gather fixtures and scratch folders. */
  libraryCollections: LibraryCollection[];
  /** Where cataloging writes new record notes. Empty until the reader picks one, which the catalog dialog
   *  asks for before it writes anything — a default would scatter notes into someone's vault unasked. */
  libraryRecordsFolder: string;
  /**
   * What the reader has told the library about their fields: other keys that mean the same thing, what to call a
   * field, and the values it offers.
   *
   * **Layered over what Orbis knows, never replacing it** — see `mergeFields`. Empty is the normal state: every
   * part of the library works with no declarations at all, and this only makes the pickers shorter and the labels
   * friendlier.
   */
  libraryFields: FieldDefinition[];
  /**
   * Where extracted cover images go. Empty means `covers` beside the record notes.
   *
   * One folder for the whole catalog, not one per book: a cover belongs to a title, several records can point at
   * the same image, and a vault-wide grid is easier to reason about — and to delete — when the artwork is in one
   * place. Reading records keep their own covers folder for now; merging the two is a migration of a shipped
   * feature and is named in the design rather than done quietly here.
   */
  libraryCoversFolder: string;
  /**
   * Whether the first-run questions have been answered.
   *
   * Set by the setup dialog, and inferred once for a vault that had already answered them before the dialog
   * existed — a records folder, or a collection or dashboard of the reader's own, is an answer. Turning the
   * library off and on again does not ask twice: the answers are still true.
   */
  librarySetupDone?: boolean;
  /**
   * Set once `migrateSidecarNames` has renamed this vault's sidecars from the old basename names to names built from
   * the whole file name (`sidecarStem`), so the rename runs once. Remove with the migration, before 1.0.
   */
  sidecarsNamedByFile?: boolean;
  /**
   * Set once each recordings folder has been given its `.audio` suffix (`audioFolderName`) — by the same once-per-vault
   * pass, and synced like the flag above, so a second device finds the folders already moved. Remove with it.
   */
  audioFoldersSuffixed?: boolean;
  /**
   * Whether a bulk catalog run also extracts covers.
   *
   * Off by default, and remembered once answered: a cover is tens of kilobytes on a vault that syncs, so paying it
   * across a folder of hundreds of books is a cost to be asked for rather than assumed. Cataloging ONE book always
   * extracts — that is a deliberate act on a book someone chose.
   */
  libraryExtractCovers: boolean;
  /**
   * Whether the Library exists at all: the ribbon icon, the command, and its settings beyond this switch.
   *
   * **Off until asked, like every other capability here** — records, book sources, multi-device and sync are all
   * off until someone answers for them, and a reader who opens books from the Files pane should not have to learn
   * what a collection is, let alone acquire a note per title.
   *
   * **Getting started** is how a reader finds it. On by default would be incoherent: the switch would read on while
   * `librarySetupDone` read false, so the checklist would list Library as an unfinished task whose action is
   * `chooseLibraryOn(true, …)` — turning on something already on — and cancelling that dialog would leave a ribbon icon
   * over a library with nowhere to write a title note.
   *
   * That is the state §"Turning it on" in the design doc forbids for reading records, in those words: *a
   * dropdown reading "On" over a setting that stayed off is the lie the dialog exists to remove.*
   */
  libraryEnabled: boolean;
  /** Dashboards, in display order. Seeded with a system default at load rather than shipped empty. */
  libraryDashboards: LibraryDashboard[];
  /**
   * Where published copies are written. Empty means `!orbis-data/sync`.
   *
   * **A folder is a fact about the vault**, so this travels with the rest of the destinations — see
   * docs/design/multi-device-sync.md §Where things are written. It can travel *because* nothing depends on it to find
   * anything: copies are identified by name and found wherever they are, which is what lets a device that has never
   * heard of your folder still read what you published. The setting says where new ones go.
   */
  syncFolder?: string;
  /**
   * Every device that has published into this vault: its id, its name, and roughly when it was last here.
   *
   * Written by each device for ITSELF and adopted like any other item, so this is the merged roster rather than a
   * list this device maintains. It is what turns an id into a name — see `sync/devices.ts`.
   */
  syncDevices?: DeviceInfo[];
  /**
   * The version this device holds for each syncable item, by type and then by id.
   *
   * **Beside the items rather than inside them**, so an item's own shape says nothing about sync and a tombstone has
   * somewhere to live after its item is gone. Written by `stampType`, which derives a version from the payload rather
   * than being told about edits — see `sync/stamp.ts`.
   */
  syncVersions?: Record<string, VersionMap>;
  // Toolbar visibility is NOT here: which buttons a device shows is a statement about a screen, and `data.json` is
  // the set that travels. See `device-settings.ts`.
  /**
   * What to do about a book that has never been asked about reading records.
   *
   * Off until the reader turns it on and picks a folder — this writes hundreds of notes into their vault, which
   * is not something to start doing because they installed a reader.
   *
   * A **default**, not a switch: a book with its own decision (in its `.orbis` file) ignores this entirely, so
   * turning it off later does not stop a book that was set up individually. `resolveRecords` in
   * `record-config.ts` is the single place that precedence is expressed.
   */
  recordsMode: RecordsMode;
  /**
   * Where reading records live — one vault note per selection, note and bookmark, plus generated Bases views.
   *
   * Its OWN folder, deliberately not borrowed from a note style's. Note export produces documents you read, on
   * demand, for one book; this produces a queryable database, continuously, for every book. Two mechanisms
   * writing one folder is a bug waiting to happen. See docs/design/reading-records.md.
   *
   * Empty until chosen, rather than defaulting to `DEFAULT_RECORDS_FOLDER`: a default would name a folder that
   * does not exist, so the dropdown would show a value absent from its own options.
   */
  recordsFolder: string;
  /**
   * Where records go by default: beside each book, or in `recordsFolder`.
   *
   * A boolean of the same shape as `epubSameFolderAsNote`, and offered as the same two-option dropdown, because
   * it is the same question ("beside the source, or in one folder?") and the plugin should ask it one way. Only
   * two options at this level: a chosen folder IS the shared folder here, so a third would be a second name for
   * one answer. A book can still override with a different root of its own.
   */
  recordsSameFolderAsBook: boolean;
  /**
   * Folder for the base covering every book — **empty means don't create one**.
   *
   * Its own folder, not a reference to the records folder. An option reading "in the shared folder" is incoherent
   * when the records live beside their books: that folder would then hold exactly one file, so nothing about it
   * would be shared and the row it pointed at would exist only for its sake. Two things with two homes, each named
   * for what it holds, is the version that survives every combination.
   *
   * The trade: the base does not follow the records folder when that is renamed. Rare, and visible when it
   * happens, against a cross-reference that would confuse every time the dialog opened.
   */
  recordsAllBooksBaseFolder: string;
  /**
   * Whether the destination question has been answered.
   *
   * A stored flag rather than an inference: an empty `recordsFolder` cannot stand for "never asked", because "no shared
   * folder, records beside the books, no aggregate base" is a legitimate answer. Two states that look identical need
   * something to tell them apart, and a flag is the honest thing rather than the lazy one.
   */
  recordsSetupDone: boolean;
  /** Where `Save note as EPUB` proposes putting the file: beside the note, or `epubFolder`. Either way the dialog
   *  shows the choice and lets it be changed per conversion. */
  epubSameFolderAsNote: boolean;
  epubFolder: string;
  /**
   * The medium written onto the title note of a converted book.
   *
   * **A default the dialog starts from, like every other setting here.** The converter never writes it back, so
   * exporting once does not silently rewrite the value on the settings page: a setting is a starting point a dialog may
   * depart from for one export, and two rules for one kind of question is the harder thing to learn.
   */
  epubDefaultType: string;
  /**
   * The Type written onto a book *Read in Orbis Reader* makes — its own, not `epubDefaultType`.
   *
   * **The settings fork where the conversions differ, and this is one of the places they do.** A book made by
   * *Save note as EPUB…* is whatever you were exporting; one made by this command came from a note you are about
   * to read, and `obsidian-note` says so in the Library without you choosing it each time.
   *
   * **Shared, where the two rows beside it are per device.** It is written into a title note that every device
   * reads, so a device-local answer would put the same book under two Types depending on which one made it. The
   * general rule: settings that decide what is WRITTEN INTO THE VAULT travel; settings that decide what THIS
   * DEVICE does with it do not.
   */
  readInOrbisType: string;
  /**
   * Which heading level a conversion cuts chapters at, preferred: `0` for one section, `1`–`6` for `h1`–`h6`.
   *
   * **A preference, not an instruction.** The default is `2`, because an article's own H1 is usually its title so
   * cutting there gains nothing — true of clipped articles and wrong for anyone whose notes are organized
   * differently, who can say so here.
   *
   * The dialog resolves it against what the content actually has: a note with no H2s opens on the nearest level
   * that does have headings, or on one section when it has none at all. See `resolveSplitLevel` for why deeper is
   * searched before shallower. So this is never silently disobeyed — it just cannot pick a level that is not there.
   */
  epubSplitLevel: number;
  /**
   * Where `Save annotations as PDF` proposes putting the file: beside the book, or `marksPdfFolder`.
   *
   * The same pair as `epubSameFolderAsNote` and `recordsSameFolderAsBook`, and offered as the same two-option
   * dropdown, because it is the same question. Beside the book is a reasonable answer, and it is still the
   * reader's to change.
   */
  marksPdfSameFolderAsBook: boolean;
  marksPdfFolder: string;
  /**
   * The same pair again for `Save as PDF`, the book itself.
   *
   * **Two destinations, not one, and that is the point of duplicating them.** A digest of your marks and a PDF of
   * the whole book are different artifacts with different audiences — one you send to someone, one you keep — so
   * they are the two settings most likely to want different folders.
   */
  bookPdfSameFolderAsBook: boolean;
  bookPdfFolder: string;
  /**
   * The same pair once more for `Save as Markdown`, whose folder is `bookExport.defaultExportFolder`.
   *
   * **Top level, not inside `bookExport`.** Settings load merges defaults one level deep, and `writeSettingKey`
   * refuses a nested property the stored object lacks, so a field added to `bookExport` would read `undefined` on
   * every vault saved before it and could not be written back.
   */
  markdownSameFolderAsBook: boolean;
  /**
   * Who the marks are attributed to: the byline under the title.
   *
   * A person has one name and a vault has one owner, so this is worth setting once — but in settings, where you
   * can find it and clear it, rather than by typing it into a dialog that would quietly keep it. Optional; empty means
   * the PDF carries no byline.
   *
   * **One key behind a row on both PDF pages**, each saying so. A person has one name; two fields would be the
   * same answer stored twice, and the copies would drift the first time one was corrected.
   */
  pdfAttribution: string;
  /**
   * Whether the whole-document PDF opens on a cover sheet.
   *
   * On by default, because the legend it carries is the only thing explaining what the marks mean. Off for someone
   * who wants the marked-up book and nothing else — a reviewer sending a draft back to its author, where the cover
   * is a page the author has to turn past every time.
   *
   * Suppressed regardless when the export carries no marks: a cover whose job is explaining marks has nothing to
   * say about a document that has none.
   *
   * `bookPdf`, not `marksPdf`: this governs only the whole-document artifact, and `marksPdf` names the other
   * command.
   */
  bookPdfCoverSheet: boolean;
  /**
   * Whether a PDF of the book carries the reader's marks and notes.
   *
   * On by default — marks are why this export exists. Off produces a plain PDF of the book, which is the other
   * thing people want from it.
   *
   * Belongs to `Save as PDF` alone. `Save annotations as PDF` has no use for it: a digest of the marks with the
   * marks left out is not an artifact, which is why the row is hidden for that scope.
   */
  bookPdfIncludeMarks: boolean;
  /**
   * Which kinds get a record. **Bookmarks off**, deliberately.
   *
   * Global, always-on export is potentially thousands of notes, and they land in ordinary search results, the
   * quick switcher and the graph. That is either the whole point — saved content findable by normal Obsidian
   * search — or noise in every unrelated search, and the difference is which kinds you let in. A bookmark is a
   * location with almost no content of its own, so it is the one that can triple the file count for the least
   * search value.
   */
  recordKinds: RecordKinds;
  // Recording-generation config (server URL / model / voice / concurrency) is device-local, stored
  // in localStorage — see reader/tts/gen-config.ts.
  frontmatterKeyLanguage: 'native' | 'english';
  // Book export
  bookExport: BookExportSettings;
  /** Every theme but the two that match Obsidian, in dropdown order, each with its switch — see `reader-themes.ts`. */
  readerThemes: ListedTheme[];
}

export const DEFAULT_PLUGIN_SETTINGS: OrbisPluginSettings = {
  settingsVersion: CURRENT_SETTINGS_VERSION,
  styles: [],
  noteStyles: [],
  annotationPresets: [], // seeded on first run, like noteStyles
  audioHighlightGranularity: 'sentence',
  audioNoteGranularity: 'sentence',
  pronunciations: [], // none: every word is spoken as written
  lookupSections: DEFAULT_LOOKUP_SECTIONS.map((s) => ({ ...s })),
  lookupWebDestinations: BUILTIN_LOOKUP_DESTINATIONS.map((d) => ({ ...d })),
  bookSources: BUILTIN_BOOK_SOURCES.map((b) => ({ ...b })),
  bookSourcesFolder: '',
  libraryCollections: [],
  libraryRecordsFolder: '',
  libraryFields: [],
  libraryCoversFolder: '',
  libraryExtractCovers: false,
  libraryEnabled: false,
  libraryDashboards: [],
  recordsMode: 'off',
  recordsFolder: '',
  recordsSameFolderAsBook: false,
  recordsAllBooksBaseFolder: '',
  recordsSetupDone: false,
  epubSameFolderAsNote: true,
  epubFolder: '/',
  epubDefaultType: 'book',
  readInOrbisType: 'obsidian-note',
  // H2: an article's own H1 is usually its title, so cutting there yields one section and nothing gained.
  epubSplitLevel: 2,
  // True: beside the book is where its other exports go and where someone will look for it.
  marksPdfSameFolderAsBook: true,
  marksPdfFolder: '/',
  bookPdfSameFolderAsBook: true,
  bookPdfFolder: '/',
  markdownSameFolderAsBook: true,
  pdfAttribution: '',
  bookPdfCoverSheet: true,
  bookPdfIncludeMarks: true,
  recordKinds: { passages: true, notes: true, bookmarks: false },
  frontmatterKeyLanguage: 'native',
  bookExport: { defaultExportFolder: '', perChapter: true, includeImages: true, imageFormat: 'wiki' },
  // Light, Sepia and Dark on; the extras stay out of the theme lists until a reader switches one on.
  readerThemes: defaultThemeList(),
  // **Here because a declarative control cannot write a key that is absent.** `writeSettingKey` refuses a key not
  // already in the settings object — an unknown key is a typo, and writing it would create a field nothing reads —
  // so an optional setting bound to a control has to have a default even when the default is "empty". Without it the
  // folder dropdown would appear to work and save nothing, silently. See `src/settings-keys.ts`.
  //
  // The switch that goes with it is NOT here: it is per device, in `sync/enabled.ts`.
  syncFolder: '',
};

// Interface so views can reference the plugin without a circular import.
export interface IOrbisReaderPlugin extends Plugin {
  settings: OrbisPluginSettings;
  saveSettings(): Promise<void>;
  refreshViews(): void;
  /** Redraw the mark bars showing in every open book, after the Marks dialog closes. */
  repaintMarkBars(): void;
  /** Show or hide the Library's entry points after its switch changes, and close it if it is open. */
  applyLibraryEnabled(): void;
  /** Show or hide the book-sources ribbon icon after its switch changes. */
  applyBookSourcesEnabled(): void;
  /** Books already asked about reading records this session — see the field on the plugin for why it is
   *  session-scoped and why dismissal deliberately leaves the book undecided. */
  readonly recordsAsked: Set<string>;
  /**
   * Freeze / release the reader pane's mobile heights around a Modal that takes text input.
   *
   * When the keyboard opens, Obsidian's mobile WebView reflows and the reader pane collapses, leaving a
   * black gap behind the dialog. createOrbisPopup already guards against this via
   * OrbisPopupHost.lockMobileHeights; an Obsidian Modal has no such host, so it asks the plugin, which
   * forwards to every open reader view. No-op on desktop or with no book open.
   */
  lockMobileHeights(): void;
  unlockMobileHeights(): void;
  /** Pause listening playback in all open reader views (e.g. before a voice preview). */
  pauseListening(): void;
  /** Re-seat listening playback onto the current playback source (after the "always live" toggle). */
  reloadListeningSource(): void;
  updateActiveStyle(): void;
  switchToStyle(styleId: string): void;
  /** The open book and its own copy of a preset, for the preset manager's "This book" scope. Null when no
   *  book is open (or two are and none is active). */
  activeBookForPresets(): { name: string; preset: BookPreset | null } | null;
  /** Hold the reader a preset dialog is about for that dialog's lifetime — the returned function releases it.
   *  Without it the target is re-resolved from workspace focus on every call, which a modal changes. */
  pinPresetTarget(): () => void;
  /** Assign an annotation preset to the open book — `null` unassigns. */
  assignActivePreset(preset: AnnotationPreset | null): Promise<void>;
  /** Catch the open book up with a preset that just changed — a per-mark merge, not a whole-copy replace. */
  mergeActivePreset(preset: AnnotationPreset): Promise<void>;
  /** Copy a preset mark into the open book so it can be changed there — mints a new id that replaces the
   *  original in the book, and moves the book's annotations onto it. Returns the new mark's id. */
  copyMarkIntoBook(markId: string): Promise<string | undefined>;
  /** Show or hide one of the open book's marks. Visibility is the book's; it never forks a definition. */
  setBookMarkHidden(markId: string, hidden: boolean): Promise<void>;
  /** Which marks the open book's annotations depend on, and how many carry each — the remap dialog's input. */
  bookMarkUsage(): { markId: string; count: number }[];
  /** Point the open book at a different preset. The plan says what happens to each mark in use: a target
   *  mark, or `'local'` to carry it into the book. */
  changeBookPreset(next: AnnotationPreset, plan: Map<string, RemapChoice>): Promise<void>;
  detachBookPreset(detached: { book: BookPreset; idMap: Map<string, string> }): Promise<void>;
  deleteLocalMark(markId: string, choice: RemapChoice | 'remove'): Promise<void>;
  /** Promote the open book's marks into a new library preset — see `promoteBookToPreset`. */
  promoteActiveBook(promoted: PromotedPreset): Promise<void>;
  /** Save marks edited for the open book only, without touching the global preset. */
  saveActiveBookPreset(next: BookPreset | null): Promise<void>;
  /** Every style this device can choose from: the named ones, plus its own — see `device-style.ts`. */
  stylesForThisDevice(): DisplayStyle[];
  /** This device's own style, which cannot be renamed, deleted or shared. */
  deviceStyle(): DisplayStyle | undefined;
  /**
   * Turn publishing on or off for THIS device, and — when setup has just answered it — record the folder.
   *
   * The switch itself lives beside the device (`sync/enabled.ts`), not in `data.json`: where files go is a fact about
   * the vault and travels; whether this device writes them is consent, and consent does not travel.
   */
  setSyncEnabled(on: boolean, folder?: string): Promise<void>;
  /** Offer multi-device setup on a book open, when this vault is used elsewhere and this device is not. */
  offerFirstRun(): Promise<void>;
  /**
   * Ask for a scan shortly, for a change that does not pass through `saveSettings`.
   *
   * The device name is the case that needs it: it lives beside the device, so renaming it saves no settings and
   * nothing would schedule the scan that publishes the new name.
   */
  syncSoon(reason: string): void;
  getDeviceVoicePref(): VoicePref | undefined;
  setDeviceVoicePref(patch: Partial<Omit<VoicePref, 'deviceId'>>): Promise<void>;
  dictionaries: Dictionaries;
  /** Compiled pronunciation respellings (cached; invalidated by saveSettings). */
  pronouncer(): Pronouncer | null;
  /**
   * Repaint every open Library dashboard — after anything that changes what one would show.
   *
   * **On the interface rather than imported, because the callers are dialogs.** `refreshLibraryViews` needs the
   * `LibraryView` class to know which leaves are dashboards, so importing it from a dialog would drag the whole
   * view in — and from `TitleFieldModal` would close a cycle back through `OrbisReaderView`. This interface is
   * exactly the seam for "a dialog needs something the plugin can do"; the plugin already imports the view.
   */
  refreshLibraryViews(): void;
}

// ── Device-specific display settings (vault-scoped via App#saveLocalStorage, not synced) ────

export const STORAGE_KEY_FONT_SIZE = 'orbis-font-size';
export const STORAGE_KEY_BRIGHTNESS = 'orbis-brightness';
export const STORAGE_KEY_MARGINS = 'orbis-margins';
export const STORAGE_KEY_LINE_HEIGHT = 'orbis-line-height';
export const STORAGE_KEY_THEME = 'orbis-theme';
export const STORAGE_KEY_FONT_FAMILY = 'orbis-font-family';
export const STORAGE_KEY_FLOW = 'orbis-flow';
export const STORAGE_KEY_COLUMNS = 'orbis-columns';
export const STORAGE_KEY_ACTIVE_STYLE = 'orbis-active-style-id';
export { parseTextAlign, STORAGE_KEY_TEXT_ALIGN, type TextAlign } from './text-align';

export interface DisplaySettings {
  theme: Theme;
  fontSize: number; // percentage, e.g. 100
  fontFamily: FontFamily;
  columns: 1 | 2;
  flow: Flow;
  brightness: number; // percentage, e.g. 100
  margins: number; // renderer gap %, e.g. 3
  lineHeight: number; // e.g. 1.5
  textAlign: TextAlign;
}

/**
 * The nine display values a book uses when nothing is stored.
 *
 * **Exported because the settings page has to agree with the book.** Sliders falling back to their own `min`
 * would show a fresh vault brightness 20 over a book rendering at 100.
 * One source, read by `readCurrentDisplaySettings`, by `loadSettings`, and by the rows that let you change them.
 */
export const DISPLAY_DEFAULTS = {
  theme: 'auto' as Theme,
  fontFamily: 'default' as FontFamily,
  flow: 'paginated' as Flow,
  columns: 2 as 1 | 2,
  fontSize: 100,
  brightness: 100,
  margins: 3,
  lineHeight: 1.5,
  textAlign: 'book' as TextAlign,
};

export function loadSettings(app: App, _ps: OrbisPluginSettings): DisplaySettings {
  const ls = (key: string) => app.loadLocalStorage(key) as string | null;
  const getStr = (key: string, fb: string) => ls(key) ?? fb;
  const getInt = (key: string, fb: number) => {
    const v = ls(key);
    return v != null ? parseInt(v) : fb;
  };
  const getFloat = (key: string, fb: number) => {
    const v = ls(key);
    return v != null ? parseFloat(v) : fb;
  };
  return {
    theme: getStr(STORAGE_KEY_THEME, DISPLAY_DEFAULTS.theme),
    fontFamily: getStr(STORAGE_KEY_FONT_FAMILY, DISPLAY_DEFAULTS.fontFamily),
    flow: getStr(STORAGE_KEY_FLOW, DISPLAY_DEFAULTS.flow) as Flow,
    columns: getInt(STORAGE_KEY_COLUMNS, DISPLAY_DEFAULTS.columns) as 1 | 2,
    fontSize: getInt(STORAGE_KEY_FONT_SIZE, DISPLAY_DEFAULTS.fontSize),
    brightness: getInt(STORAGE_KEY_BRIGHTNESS, DISPLAY_DEFAULTS.brightness),
    margins: getInt(STORAGE_KEY_MARGINS, DISPLAY_DEFAULTS.margins),
    lineHeight: getFloat(STORAGE_KEY_LINE_HEIGHT, DISPLAY_DEFAULTS.lineHeight),
    textAlign: parseTextAlign(ls(STORAGE_KEY_TEXT_ALIGN)),
  };
}

export function generateStyleId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function readCurrentDisplaySettings(app: App): DisplayStyle['settings'] {
  const ls = (key: string) => app.loadLocalStorage(key) as string | null;
  return {
    theme: ls(STORAGE_KEY_THEME) ?? DISPLAY_DEFAULTS.theme,
    fontFamily: ls(STORAGE_KEY_FONT_FAMILY) ?? DISPLAY_DEFAULTS.fontFamily,
    fontSize: parseInt(ls(STORAGE_KEY_FONT_SIZE) ?? String(DISPLAY_DEFAULTS.fontSize)),
    lineHeight: parseFloat(ls(STORAGE_KEY_LINE_HEIGHT) ?? String(DISPLAY_DEFAULTS.lineHeight)),
    textAlign: parseTextAlign(ls(STORAGE_KEY_TEXT_ALIGN)),
    margins: parseInt(ls(STORAGE_KEY_MARGINS) ?? String(DISPLAY_DEFAULTS.margins)),
    brightness: parseInt(ls(STORAGE_KEY_BRIGHTNESS) ?? String(DISPLAY_DEFAULTS.brightness)),
    flow: (ls(STORAGE_KEY_FLOW) ?? DISPLAY_DEFAULTS.flow) as Flow,
    columns: parseInt(ls(STORAGE_KEY_COLUMNS) ?? String(DISPLAY_DEFAULTS.columns)) as 1 | 2,
  };
}

/**
 * Announced, as the key of an `orbis:settings-change`, once a whole display style has been written: every display
 * value may have moved at once. Not a storage key — nothing is stored under it.
 */
export const DISPLAY_STYLE_APPLIED = 'orbis-display-style-applied';

/** A display style's values as the storage keys hold them, in the order a reader applies them. */
export function displayStyleEntries(settings: DisplayStyle['settings']): [string, string][] {
  return [
    [STORAGE_KEY_THEME, settings.theme],
    [STORAGE_KEY_FONT_FAMILY, settings.fontFamily],
    [STORAGE_KEY_FONT_SIZE, String(settings.fontSize)],
    [STORAGE_KEY_LINE_HEIGHT, String(settings.lineHeight)],
    [STORAGE_KEY_TEXT_ALIGN, parseTextAlign(settings.textAlign)],
    [STORAGE_KEY_MARGINS, String(settings.margins)],
    [STORAGE_KEY_BRIGHTNESS, String(settings.brightness)],
    [STORAGE_KEY_FLOW, settings.flow],
    [STORAGE_KEY_COLUMNS, String(settings.columns)],
  ];
}

/**
 * Make `settings` the live display values, and announce them once.
 *
 * **One announcement for the whole style.** Each value announced on its own was applied on its own — nine changes,
 * five of them restyling every open chapter and three laying it out again — so on a book with a 3 MB chapter one
 * style switch cost seconds. Written together and announced as `DISPLAY_STYLE_APPLIED`, an open book restyles and
 * lays out once, and Settings and the display bar each read all their controls once.
 */
export function applyStyleToLocalStorage(app: App, settings: DisplayStyle['settings']): void {
  for (const [key, value] of displayStyleEntries(settings)) app.saveLocalStorage(key, value);
  app.workspace.trigger('orbis:settings-change', DISPLAY_STYLE_APPLIED, '');
}

/** Build the CSS string to inject into each book iframe document. */
export function buildBookCss(settings: DisplaySettings, colors: ThemeColors, resolvedFont = ''): string {
  const lines: string[] = [
    `html, body { background: ${colors.bg} !important; color: ${colors.fg} !important; }`,
    `html { font-size: ${settings.fontSize}% !important; }`,
    `body { line-height: ${settings.lineHeight} !important; }`,
    /**
     * **On body text itself, not only on `body`.** An `!important` on `body` loses to any rule the book writes for the
     * paragraph, since a declaration on the element beats an inherited one, and many books set line-height or a
     * font on their paragraphs. Body text is tagged by `tagBodyText` when the chapter loads; headings
     * keep the book's own spacing.
     */
    `.${BODY_TEXT} { line-height: ${settings.lineHeight} !important; }`,
    // Reset the book body centering so text fills the iframe; outer spacing via foliate renderer gap.
    `body { margin-left: 0 !important; margin-right: 0 !important; max-width: none !important; }`,
    `body > div { max-width: none !important; margin-left: 0 !important; margin-right: 0 !important; }`,
  ];

  if (resolvedFont) {
    lines.push(`html, body { font-family: ${resolvedFont} !important; }`);
    // Into the paragraph too: many books wrap most of their words in spans that set a font (Word and InDesign
    // exports), where a rule on the paragraph never reaches the text. Code and the book's monospace and symbol fonts
    // keep theirs — see `keepsOwnFont`.
    lines.push(
      `.${BODY_TEXT}, .${BODY_TEXT} :not(code, kbd, samp, tt, pre, .${KEEP_FONT}) { font-family: ${resolvedFont} !important; }`
    );
  }

  // Only body text, which is tagged only where the book aligns it left, justified or not at all — so a centered title
  // line or a right-aligned signature keeps its alignment. Justifying every paragraph would left-align a
  // one-line centered one, and many books center some paragraphs.
  if (settings.textAlign !== 'book') {
    lines.push(`.${BODY_TEXT} { text-align: ${settings.textAlign} !important; }`);
  }

  if (colors.link) lines.push(`a { color: ${colors.link} !important; }`);
  if (colors.visited) lines.push(`a:visited { color: ${colors.visited} !important; }`);

  return lines.join('\n');
}
