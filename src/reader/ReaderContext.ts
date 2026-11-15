import type { App, TFile } from 'obsidian';
import type { RecordKinds } from '../record-config';
import type { DebugCategory } from '../settings';
import type { NotesData } from './export-format';
import type { FoliateViewEl } from './foliate-view';
import type { NavSuppressor } from './NavSuppressor';
import type { PassageEntry } from './toc-entry';

/** The sentence being read, as an audio bookmark would anchor to it — with its words, for the bookmark's record. */
export interface AudioBookmarkTarget {
  anchorCfi: string;
  text?: string;
  chapter: string;
  chapterHref?: string;
  loc?: number;
}

/**
 * The narrow dependency surface that reader subsystems (`src/reader/*`) receive
 * in place of the full `OrbisReaderView`. `OrbisReaderView` implements this, and
 * passes `this` to each collaborator's constructor — so collaborators depend on
 * this interface, never on the view class directly (which would reintroduce the
 * God-object coupling this refactor is removing, and risk circular imports).
 *
 * Kept deliberately small. It grows only when a collaborator has a legitimate,
 * reviewed need — a new member here is a decision, not a reflex. See
 * `docs/design/reader-architecture.md`.
 */
export interface ReaderContext {
  readonly app: App;
  readonly contentEl: HTMLElement;
  /** The file currently open in this leaf, or null between books. */
  readonly currentFile: TFile | null;
  /** Append a line to the debug log (no-op unless `category` is enabled). */
  debug(msg: string, category: DebugCategory): void;
  /** Snapshot the current book/annotation/position state for export formatting. */
  notesData(): NotesData;
  /** Open the read-only note view for a note (by id), optionally with a search query to mark in the
   *  quote/body. Used by advanced search to open a note result. No-op if the id doesn't resolve. */
  openNoteView(noteId: string, opts?: { highlight?: string }): void;
  /** Close the read-only note view if open (e.g. navigating to a non-note search result). */
  closeNoteView(): void;
  /** The active search query text, or '' when no search is active — so tapping a note during a
   *  search marks the same term the search-result click would. */
  activeSearchTerm(): string;
  /** Drop the cached backlinks scan for `path` (e.g. after writing notes into it). */
  invalidateBacklinks(path: string): void;
  /** The current book's cover image, or null when it has none / cannot be extracted. Live extraction with the
   *  `.orbis` cached copy as a fallback, because extraction is not uniformly reliable across formats. Already
   *  implemented for the TTS host (recorded-audio cover art); surfaced here for `RecordExporter`, which writes
   *  one cover per book for a Bases cards view. */
  bookCover(): Promise<Blob | null>;
  /**
   * The reader's current page background/foreground and brightness filter, so a surface drawn over the book can be
   * painted to match it.
   *
   * Promoted here from two host interfaces that declared it identically once a third collaborator wanted it —
   * `AnnotationController` (mark drawing, the note view's quote), `LinkPreview` and `ImageViewer`. A third duplicate
   * declaration would have been the wrong answer to "several collaborators need the page's own colors".
   */
  readerColors(): { bg: string; fg: string; filter: string };
  /**
   * Saved content changed — write reading records, if the reader has them switched on.
   *
   * Called from the two annotation persist methods and the bookmark one, i.e. every place saved content reaches
   * disk. Debounced and gated on the setting by the implementation; a no-op otherwise, so callers never have to
   * ask whether records are enabled.
   *
   * `deleted` names the ids that were just removed, so their records can be removed too. Passed here rather than
   * hooked at each delete site for the same reason the persist methods exist at all: one seam that cannot be
   * half-remembered. Only a deletion the reader performed in this session belongs in it — see `recordsDeleted`.
   */
  /** `kind` is what was saved, so a book still to be asked is asked only by something that would be recorded. */
  recordsChanged(deleted?: readonly string[], kind?: keyof RecordKinds): void;
  /** Whether the library exists, which is what decides where a reading record's cover comes from — see
   *  `RecordExporter.libraryCover`. Records take the title note's image and never write one of their own. */
  readonly libraryEnabled: boolean;
  /** Which kinds of saved content get a record. See `recordKinds` in settings for why bookmarks default off. */
  readonly recordKinds: { passages: boolean; notes: boolean; bookmarks: boolean };

  // ── Reading surface (added Phase 3 for SearchController; shared by later phases) ──
  /** The live `<foliate-view>` element, or null between books. */
  readonly foliateView: FoliateViewEl | null;
  /** The book's spine sections (foliate raw sections carry more, cast as needed). */
  readonly bookSections: { id: string }[];
  /** Index of the section currently on screen. */
  readonly currentSectionIndex: number;
  /** The reader host element (the Foliate iframe container). */
  readonly hostEl: HTMLElement | null;
  /** Whether focus mode is active. */
  readonly focusMode: boolean;
  /** Shared focusin-suppression state machine for programmatic navigation. */
  readonly navSuppressor: NavSuppressor;
  /** Close the content panel (contents/search/saved/…). */
  closePanel(): void;
  /** Resolve a section index to its chapter label via the TOC. */
  chapterForSection(sIdx: number): string;
  /** Unique chapter identity (TOC href) for a section — labels like "CHAPTER II" repeat across
   *  Parts, so callers that group/dedupe by chapter must key on this, not the label. */
  hrefForSection(sIdx: number): string;
  /** Like `hrefForSection`, but '' rather than a guess when nothing in the contents page resolves to
   *  this section. A caller grouping by chapter needs to know the difference: a guessed href is shared
   *  by whichever sections guessed the same way, which silently merges unrelated chapters. */
  exactHrefForSection(sIdx: number): string;
  /** Disambiguated display label for a section (e.g. "PART II – CHAPTER III"), falling back to the
   *  plain label. Use for showing chapters where labels repeat across Parts. */
  chapterDisplayForSection(sIdx: number): string;
  /** Disambiguated display label for a stored chapter href (as saved on annotations) — the
   *  href-keyed counterpart to chapterDisplayForSection. '' when the href isn't in the TOC. */
  chapterDisplayForHref(href: string): string;
  /** The contents entries that resolve to a section, in contents order, with their disambiguated labels. */
  contentsEntriesInSection(sIdx: number): { href: string; label: string; fragment: string }[];
  /** Freeze / restore reader heights around a mobile keyboard opening (per-input legacy protection). */
  lockMobileHeights(): void;
  unlockMobileHeights(): void;

  // ── Reading position (added Phase 5 for BookmarkController; ReadingStats will own these) ──
  /** CFI of the current page, or null before the first relocate. */
  readonly lastCfi: string | null;
  /** The top of the page's location + the book's total, or null (foliate sometimes relocates without it). The
   *  index's location once it is up; foliate's, counted from 1, before. */
  readonly lastLocation: { current: number; total: number } | null;
  /** CFI that was current when `lastLocation` was last reported (to detect stale location). */
  readonly lastLocationCfi: string;
  /** The location a position is in, by the index — null until it is up. See `LocationIndex.getLocForCfi`. */
  getLocForCfi(cfi: string): number | null;
  /** The first ~two visible lines at the top of the current page — their range CFI (a precise bookmark anchor)
   *  and their text — or null if unavailable. */
  topOfPageAnchor(): { cfi: string; text: string } | null;
  /** Briefly pulse a highlight over the lines at `anchorCfi` — the bookmark landing cue. */
  flashAnchor(anchorCfi: string, color?: string, outline?: boolean): void;
  /** Mark that the *user* is navigating (content panel / search / go-to), so the next relocate
   *  moves the audio player to the landing spot. Pass `targetCfi` for a precise destination (a
   *  bookmark/highlight/note/search-hit sentence) so the player seeks to that exact sentence
   *  rather than the top-of-page one; omit it for coarse jumps (a chapter, a %). */
  markUserNavigation(targetCfi?: string): void;
  /** When audio is actively playing, the bookmark target for the sentence being read (so the
   *  main toolbar bookmark marks the active sentence, like the player's bookmark button).
   *  Null when audio isn't playing — the toolbar then makes an ordinary reading bookmark. */
  audioBookmarkTarget(): AudioBookmarkTarget | null;
  /** The contents entry holding the start of `cfi`, for filing an annotation under the heading its passage is in.
   *  Not `tocItemHref`, which is the PAGE's entry — the last heading anywhere on it. See `toc-entry.ts`. */
  tocEntryAt(cfi: string): PassageEntry | null;
  /** Current chapter label, or null. */
  readonly currentTocLabel: string | null;
  /** Current chapter's TOC href (unique chapter identity), or '' . */
  readonly tocItemHref: string;

  // ── Display / annotation settings (added Phase 5 for AnnotationController) ──
  /** Current flow mode ('paginated' | 'scrolled'); annotations skip storing loc in scrolled. */
  readonly flow: string;
  /** Whether deleting a note asks for confirmation first (plugin setting). */
  readonly confirmDeleteNote: boolean;
  /** Whether the reading keys turn the page inside the book without being bound (plugin setting). */
  readonly keyboardPageTurn: boolean;
  /** Turn a page from inside the book, in whichever flow is current. */
  turnPage(direction: 1 | -1): void;
  /** Grow or shrink the selection by a character or a line. Returns false when there is nothing to refine. */
  extendSelection(key: string): boolean;
  /** Drop the selection, and the annotation bar with it. Returns whether there was one to drop. */
  clearSelection(): boolean;
  /** Run whatever command the reader has bound to this keystroke. Returns false if nothing is bound. */
  runBoundCommand(e: KeyboardEvent): boolean;
}
