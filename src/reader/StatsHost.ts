import type { ProgressMode } from '../settings';

/** Minimal structural TOC node — ReadingStats only needs href + nesting. */
export interface StatsTocItem {
  href: string;
  subitems?: StatsTocItem[] | null;
}

/**
 * The narrow host contract `ReadingStats` needs from `OrbisReaderView`. Wider than
 * the other host interfaces because the reading-position index (which stays in the
 * view — it produces this data) feeds a lot of book-structure into the progress and
 * pace math. Kept off the shared `ReaderContext` because it is single-consumer: only
 * ReadingStats reads these. See docs/design/reader-architecture.md (Phase 6).
 */
export interface StatsHost {
  // ── Index / book data (produced by the view's location index; read-only here) ──
  /** Per-section start page + page count, built by the location index. */
  readonly sectionLocInfo: ReadonlyArray<{ startLoc: number; locCount: number }>;
  /** Sum of section byte sizes (fallback fraction denominator). */
  readonly totalBookSize: number;
  /** Sum of section character counts. */
  readonly totalBookChars: number;
  /** Sum of section word counts. */
  readonly totalBookWords: number;
  /** Per-section word counts (content-based, layout-independent). */
  readonly sectionWordCounts: ReadonlyArray<number>;
  /** Per-section character counts. */
  readonly sectionCharCounts: ReadonlyArray<number>;
  /** loc → word count, rebuilt each layout for WPM sampling. */
  readonly locWordCounts: ReadonlyMap<number, number>;
  /** Resolved section href/path → spine index. */
  readonly sectionHrefMap: ReadonlyMap<string, number>;
  /** The book's TOC tree. */
  readonly tocItems: ReadonlyArray<StatsTocItem>;
  /** href → content fraction (0–1) at the chapter's start, from the DOM parse. */
  readonly tocStartFractions: ReadonlyMap<string, number>;
  /** Resolve a TOC href (may include #anchor) to a spine section index, or -1. */
  hrefToSectionIndex(href: string | undefined): number;
  /** The location a contents entry / a section begins in, by the index — null until it is up. */
  chapterStartLoc(href: string): number | null;
  sectionStartLoc(sIdx: number): number | null;

  // ── Progress-mode settings (plugin-level) ──
  /** The persisted progress-display mode ('blank' = user-hidden). */
  readonly progressModeSetting: ProgressMode | 'blank';
  /** The user's enabled/visible progress modes, or undefined for the default set. */
  progressModesConfig(): Array<{ id: ProgressMode; visible: boolean }> | undefined;
  /** Persist the active progress mode and save plugin settings. */
  persistProgressMode(mode: ProgressMode | 'blank'): void;

  // ── Callbacks ──
  /** Mirror the progress text into the focus-mode chip. */
  setFocusProgressText(text: string): void;
  /** The Stats panel's content element, or null when the panel isn't built. */
  readonly statsPaneEl: HTMLElement | null;
  /** Whether the Stats tab is currently open (so live updates can re-render it). */
  isStatsPaneOpen(): boolean;
}
