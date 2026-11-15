import type { PanelTabId } from './panel-utils';

/**
 * The content panel's five tab glyphs, in one place.
 *
 * **Shared rather than copied**, for the reason `TOOLBAR_BUTTON_SVGS` gives about the toolbar's: the settings page
 * that lets a reader turn these tabs off shows each one's glyph beside its name, and a settings row wearing a
 * different picture from the tab it governs is worse than no picture at all. They lived inline in `ReaderPanels`,
 * where the settings page could not reach them — which is why those rows had no icon.
 */
export const PANEL_TAB_SVGS: Record<PanelTabId, string> = {
  // Bulleted list (dots + lines) — a table-of-contents glyph, distinct from the toolbar's plain hamburger that
  // opens the panel.
  contents:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="4" cy="6" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="4" cy="18" r="1.6"/><rect x="8" y="4.75" width="13" height="2.5" rx="1.25"/><rect x="8" y="10.75" width="13" height="2.5" rx="1.25"/><rect x="8" y="16.75" width="13" height="2.5" rx="1.25"/></svg>',
  search:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>',
  // Star — a saved collection (bookmarks + highlights + notes), not just bookmarks; also avoids clashing with the
  // bookmark glyph used for "bookmark this location" in the toolbar.
  saved:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94z"/></svg>',
  backlinks:
    '<svg width="24" height="16" viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><path d="M34 12H28"/><polyline points="31 8 27 12 31 16"/></svg>',
  stats:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="14" width="4" height="8" rx="1"/><rect x="16" y="4" width="4" height="18" rx="1"/><rect x="9" y="9" width="4" height="13" rx="1"/></svg>',
};
