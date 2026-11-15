import type { StatsTocItem } from './StatsHost';

/**
 * The narrow host contract `LocationIndex` needs from `OrbisReaderView` for the few
 * book-level things it doesn't own: `totalBookSize` (set on book open), the TOC, the
 * current section, the nav guard, and two recompute notifications routed to
 * ReadingStats. Keeps LocationIndex free of a direct sibling reference. See
 * docs/design/reader-architecture.md.
 */
export interface LocationIndexHost {
  /** Sum of section byte sizes, set on book open (the index reads it, doesn't own it). */
  readonly totalBookSize: number;
  /** The book's TOC tree (for resolving chapter start fractions). */
  readonly tocItems: ReadonlyArray<StatsTocItem>;
  /** The section reported by the most recent relocate, or null. */
  readonly lastSection: { current: number; total: number } | null;
  /** The book's own title — so a section whose only name IS the book's is read as having none. */
  bookTitle(): string;
  /** Set the reader's "navigating" guard while page-navigation is in flight. */
  setNavigating(v: boolean): void;
  /** Notify ReadingStats that chapter fractions changed (recompute boundaries). */
  invalidateChapterBoundaries(): void;
  /** The index became ready: renumber the current page and stored locations, and refresh the progress chip. */
  indexReady(): void;
}
