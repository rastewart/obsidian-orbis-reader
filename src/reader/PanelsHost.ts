import type { TocItemLike } from '../toc-utils';

/**
 * The narrow host contract `ReaderPanels` needs from `OrbisReaderView` for the few
 * view-owned bits it can't reach through `ReaderContext` or its sibling collaborators:
 * the book's TOC (book data the view also uses), the panel-tab visibility config, and
 * two focus/close callbacks. See docs/design/reader-architecture.md (Phase 7).
 */
export interface PanelsHost {
  /** The book's TOC tree (owned by the view; read for the Saved-tab chapter grouping). */
  readonly tocItems: TocItemLike[];
  /** Reopen the standalone search bar (closing the panel while a search is active). */
  openSearchBar(): void;
  /** Focus the toolbar's contents/panel toggle button (close focus target). */
  focusTocButton(): void;
  /** Put the keyboard back on the book — after navigating to a place in it, rather than after dismissing a panel. */
  focusReader(): void;
}
