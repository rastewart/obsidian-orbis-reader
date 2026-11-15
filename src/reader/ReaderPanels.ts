import { normalizePath, Platform, TFile } from 'obsidian';
import { t } from '../i18n';
import { scanBacklinks } from '../progress';
import { chapterKey, flattenTocWithDisambiguation, type TocItemLike } from '../toc-utils';
import { applyMarkPreview, claimFocusSoon, onActivate, setSvgIcon, trapTab } from '../ui-utils';
import type { AnnotationController } from './AnnotationController';
import type { BookmarkController } from './BookmarkController';
import { LANDING_FLASH_COLOR } from './flash-target';
import type { PanelsHost } from './PanelsHost';
import { PANEL_TAB_SVGS } from './panel-tab-icons';
import { ALL_PANEL_TAB_IDS, type PanelTabId } from './panel-utils';
import type { ReaderContext } from './ReaderContext';
import type { ReadingStats } from './ReadingStats';
import type { SearchController } from './SearchController';
import { navbarClearance } from './viewport-insets';

type TabId = PanelTabId;
const ALL_TAB_IDS = ALL_PANEL_TAB_IDS;

// Saved-panel bookmark kind glyphs: a bookmark for reading, headphones for audio (made while listening).
const READING_BOOKMARK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-3.5L5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z"/></svg>';
const AUDIO_BOOKMARK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z"/></svg>';

/** The sibling collaborators ReaderPanels coordinates (renders / activates their tabs). */
export interface PanelDeps {
  search: SearchController;
  stats: ReadingStats;
  bookmarks: BookmarkController;
  annot: AnnotationController;
}

/**
 * The content panel: the tab framework (Contents / Search / Saved / Backlinks /
 * Stats), open/close/backdrop lifecycle, and the two tabs with no other owner —
 * Contents (TOC) and Backlinks. The three data tabs delegate to their owners:
 * Search → SearchController, Stats → ReadingStats, Saved → Bookmark/Annotation.
 *
 * The only collaborator that depends on other collaborators — it is the top of
 * the stack, coordinating them. Dependencies point down (no cycles): the view's
 * `ReaderContext.closePanel`, `AnnotationHost.refreshSavedPanelIfOpen`, and
 * `StatsHost.statsPaneEl/isStatsPaneOpen` are thin delegators here. See
 * docs/design/reader-architecture.md.
 */
export class ReaderPanels {
  private tocPanel: HTMLElement | null = null;
  private tocBackdrop: HTMLElement | null = null;
  private activeTab: TabId = 'contents';
  private tabBtns: Partial<Record<TabId, HTMLButtonElement>> = {};
  private tabPanes: Partial<Record<TabId, HTMLElement>> = {};
  private savedItemsEl: HTMLElement | null = null;
  private savedCollapsed: Record<string, boolean> = {};
  private backlinksData: { noteTitle: string; notePath: string }[] | null = null;
  private backlinksLoading = false;
  private backlinksCache = new Map<string, { noteTitle: string; notePath: string }[]>();
  private backlinksPreScanTimer: number | null = null;

  private readonly search: SearchController;
  private readonly stats: ReadingStats;
  private readonly bookmarks: BookmarkController;
  private readonly annot: AnnotationController;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: PanelsHost,
    deps: PanelDeps
  ) {
    this.search = deps.search;
    this.stats = deps.stats;
    this.bookmarks = deps.bookmarks;
    this.annot = deps.annot;
  }

  // ── StatsHost / AnnotationHost delegation targets ───────────────────────────

  get statsPaneEl(): HTMLElement | null {
    return this.tabPanes['stats'] ?? null;
  }

  isStatsOpen(): boolean {
    return !!(this.tocPanel?.classList.contains('is-open') && this.activeTab === 'stats');
  }

  get isOpen(): boolean {
    return this.tocPanel?.classList.contains('is-open') ?? false;
  }

  refreshSavedIfOpen(): void {
    if (this.tocPanel?.classList.contains('is-open') && this.activeTab === 'saved') {
      this.renderSavedPanel();
    }
  }

  /** Re-render the Saved lists unconditionally (e.g. after recalculateLocations). */
  renderSaved(): void {
    this.renderSavedPanel();
  }

  invalidateBacklinks(path: string): void {
    this.backlinksCache.delete(path);
  }

  // ── Open / close / activate ─────────────────────────────────────────────────

  /**
   * Show one tab's pane and mark its button current.
   *
   * `focusInput` is passed through to the search tab alone, and only when the panel was opened onto it — see
   * `onPanelTabActivated`. Every other route here (the tab bar's arrows, a click on a tab) leaves focus where the
   * reader put it.
   */
  private activatePanelTab(tab: TabId, focusInput = false): void {
    this.activeTab = tab;
    for (const [id, btn] of Object.entries(this.tabBtns)) {
      if (!btn) continue;
      const isActive = id === tab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    }
    for (const [id, pane] of Object.entries(this.tabPanes)) {
      if (pane) pane.toggle(id === tab);
    }
    if (tab === 'saved') this.renderSavedPanel();
    if (tab === 'backlinks') {
      this.renderBacklinksPane();
      if (this.backlinksData === null && !this.backlinksLoading) void this.loadBacklinks();
    }
    if (tab === 'search') this.search.onPanelTabActivated(focusInput);
    if (tab === 'stats') this.stats.renderStatsPane();
    if (tab === 'contents') this.revealActiveTocRow();
  }

  open(tab: TabId = this.activeTab): void {
    // Opened ONTO search: the reader pressed the search key, so the caret is what they asked for.
    this.activatePanelTab(tab, tab === 'search');
    if (Platform.isMobile) this.applyMobileNavbarClearance();
    this.tocPanel?.classList.add('is-open');
    this.tocBackdrop?.classList.add('is-open');
    // Again now the panel is shown: the pass in `activatePanelTab` ran while it was still `display: none`.
    if (tab === 'contents') this.revealActiveTocRow();
    // Hide the standalone search bar while the panel is open — panel has its own search input.
    this.search.hideBar();
    // The search tab focuses its own input (see activatePanelTab); every other tab has no natural
    // focus target, so land on its own tab button — keyboard/screen-reader focus has to enter the
    // panel somewhere.
    /**
     * **Claimed rather than set once**, because a command that opens the panel is run from the palette, and the
     * palette hands focus back to whatever it interrupted AFTER the command returns. Set once, opening Stats from the
     * palette would leave the keyboard on the book, where ← and → turn pages while an open panel sits over them.
     *
     * Withdraws once anything inside the panel holds focus, or if the panel is closed again first.
     */
    if (tab !== 'search') {
      const btn = this.tabBtns[tab];
      if (btn) {
        claimFocusSoon(btn, () => {
          const now = btn.ownerDocument.activeElement;
          return this.isOpen && !(now?.instanceOf(Node) && this.tocPanel?.contains(now));
        });
      }
    }
  }

  /**
   * The rows of the pane showing now, in the order they are drawn.
   *
   * Rows only — not the delete button inside one, and not the tab bar above them. Arrow keys walk a list, and a list
   * whose arrows also visited every × on the way down would be a list nobody drives twice. Those stay reachable by Tab,
   * which is the key for "everything here", where arrows are the key for "the next one of these".
   *
   * Hidden panes are excluded by `offsetParent`: every tab's pane exists at once and only one is shown.
   */
  private paneRows(): HTMLElement[] {
    const pane = this.tabPanes[this.activeTab];
    if (!pane) return [];
    // Every shape of row the panel draws: a contents entry, a saved item, a collapsible header, a search hit. A list
    // this misses is a list the arrows walk past, reachable by Tab and by nothing else.
    return Array.from(
      pane.querySelectorAll<HTMLElement>('.orbis-toc-item, .orbis-saved-item, .orbis-saved-hdr, .orbis-search-result')
    ).filter((el) => el.offsetParent !== null);
  }

  /**
   * Up and down move through the list; Home and End jump to its ends; Enter is the row's own business.
   *
   * **Because a list is a list.** Tab reaches everything in the panel one stop at a time — a row, its delete button,
   * the next row — which is correct and tedious for forty highlights. Arrows are how a reader expects to walk a list,
   * and the row under the cursor is activated by the Enter that `onActivate` already handles.
   *
   * A text field keeps its own arrows: the search box needs them to move a caret, and stealing that would be trading
   * one keyboard for another. Nothing here fights the reader's page-turn keys, because the panel takes the keyboard
   * while focus is inside it — see `readerHasKeyboard`.
   */
  private wireArrowKeys(panel: HTMLElement): void {
    panel.addEventListener('keydown', (e: KeyboardEvent) => {
      /**
       * **Escape leaves the panel**, putting the keyboard back on the button that opened it — see `close`.
       *
       * Without it the only ways out are the toolbar icon, a click in the book, or the backdrop, and a reader who has
       * tabbed into a list has no way back out without a pointer.
       *
       * `stopPropagation`, because the reader has its own Escape handling and this key has been answered.
       */
      if (e.key === 'Escape') {
        this.close('dismissed');
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? '')) return;

      /**
       * **Left and right change tab, from anywhere in the panel.**
       *
       * On the tab bar it would work only while a tab button has focus — rarely where focus is once the rows are
       * reachable, and never after a click on the panel's empty space. One handler on the panel covers a focused row, a
       * focused header and the panel itself, and it is the only one, so a key cannot be handled twice on its way up.
       */
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const keys = ALL_TAB_IDS;
        const at = keys.indexOf(this.activeTab);
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const nextId = keys[at === -1 ? 0 : (at + step + keys.length) % keys.length];
        if (nextId) {
          this.activatePanelTab(nextId);
          this.tabBtns[nextId]?.focus();
        }
        e.preventDefault();
        return;
      }

      const rows = this.paneRows();
      if (rows.length === 0) return;
      const active = activeDocument.activeElement;
      const at = rows.findIndex((row) => row === active || row.contains(active));
      /**
       * **Up off the top of the list goes back to the field the list came from.**
       *
       * The search tab's input sends Down into the results (see `buildPanelTab`), and a way in needs a way back:
       * Up clamped at the first row would make the pair read as half a feature.
       *
       * Asked of the pane rather than named, so a tab that grows a field of its own inherits this; a tab with no
       * field falls through to the clamp below, which is the right answer when there is nowhere to go.
       */
      if (e.key === 'ArrowUp' && at === 0) {
        const field = this.tabPanes[this.activeTab]?.querySelector<HTMLElement>('input[type="text"]');
        if (field) {
          field.focus();
          e.preventDefault();
          return;
        }
      }
      // Arriving from the tab bar — nothing in the list has focus yet — starts at the top going down and the bottom
      // going up, which is what an arrow means when there is no cursor to move. Except down in Contents, which starts
      // at the chapter being read: the pane opened scrolled to it, and the top row would scroll it away again.
      const current = rows.findIndex((row) => row.matches('.orbis-toc-item.is-active'));
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? rows.length - 1
            : at < 0
              ? e.key === 'ArrowDown'
                ? Math.max(current, 0)
                : rows.length - 1
              : e.key === 'ArrowDown'
                ? Math.min(at + 1, rows.length - 1)
                : Math.max(at - 1, 0);
      rows[next]?.focus();
      // `preventDefault` because the pane would otherwise scroll under the row we just focused, and the browser's
      // scroll-into-view has already put it where it belongs.
      e.preventDefault();
    });
  }

  /** Stop the panel above Obsidian's floating mobile navbar (bottom nav pill) so it doesn't cover
   *  the last list items. When the navbar is off/absent, the panel goes full height. `navbarClearance`
   *  measures from the navbar's top edge, so it covers whatever the navbar's own height + safe-area
   *  inset is; the pinned dialogs stop above the same bar by the same reading. */
  private applyMobileNavbarClearance(): void {
    if (!this.tocPanel) return;
    const clearance = navbarClearance(activeWindow);
    this.tocPanel.style.bottom = clearance > 0 ? `${clearance}px` : '';
  }

  /**
   * @param reason why it is closing. **Dismissed** returns focus to the control that opened it, which is what a
   *   keyboard reader expects on Escape. **Navigated** puts focus on the book instead: the panel was a way of
   *   getting somewhere, and leaving the keyboard on the toolbar would mean Tab walks the buttons rather than
   *   entering the text you have just jumped to.
   */
  close(reason: 'dismissed' | 'navigated' = 'dismissed'): void {
    const wasOpen = this.tocPanel?.classList.contains('is-open') ?? false;
    this.tocPanel?.classList.remove('is-open');
    this.tocBackdrop?.classList.remove('is-open');
    // openDisplayMenu() calls this defensively even when the panel was never
    // open — don't steal focus from whatever the user was actually doing.
    if (!wasOpen) return;
    if (reason === 'navigated') {
      this.host.focusReader();
      return;
    }
    if (this.search.hasActiveSearch()) {
      // Takes focus itself (into the reopened standalone search bar's input).
      this.host.openSearchBar();
    } else {
      this.host.focusTocButton();
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  /**
   * @param currentHref the contents entry of the page showing. The book's first page is shown, and its chapter
   *   announced, before the panel exists, so without it no row would be marked until the first page turn.
   */
  build(host: HTMLElement, toc: TocItemLike[], currentHref: string): void {
    // Parented under hostEl, not filterWrapperEl: filterWrapperEl carries the
    // brightness filter (--orbis-host-filter) for the book content, and a CSS
    // filter dims its entire rendered subtree as a single compositing layer —
    // there's no way to selectively exempt a descendant from it. hostEl and
    // filterWrapperEl occupy the exact same box (filterWrapperEl is inset:0
    // within hostEl), so this doesn't change the panel's positioning at all.
    this.tocBackdrop = host.createDiv({ cls: 'orbis-toc-backdrop' });
    // A backdrop is not a control: Escape closes the panel, and making the dimmed area focusable would put a tab stop
    // between the reader and the list they came for.
    // keyboard-audit-disable-next-line -- a backdrop, dismissed by Escape
    this.tocBackdrop.addEventListener('click', () => this.close());

    this.tocPanel = host.createDiv({ cls: 'orbis-toc-panel' });
    // The panel is a place you are in until you leave it: Tab wraps inside it, Escape closes it, and closing returns
    // focus to whatever opened it. Without the wrap, Tab walks from the last row straight into Obsidian's sidebar.
    trapTab(this.tocPanel);
    this.wireArrowKeys(this.tocPanel);
    /**
     * **Focusable, so a click on the panel's empty space stays in the panel.**
     *
     * The panel is built inside the reading host, and the host carries a `tabindex` so the reading keys work without a
     * click first. A click below the last row would therefore walk up to the nearest focusable ancestor — the book —
     * and the arrow keys would turn pages while an open panel sits under the cursor. `-1` keeps it out of the Tab
     * order while making it a place focus can land.
     */
    this.tocPanel.tabIndex = -1;

    // Header: tab bar only. No close × — tapping/clicking the page dismisses the panel (the
    // backdrop above), as does the toolbar icon and Escape, so a × would be redundant chrome.
    const header = this.tocPanel.createDiv({ cls: 'orbis-toc-header' });
    const tabBar = header.createDiv({ cls: 'orbis-panel-tabs' });
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', t('navigator.tabs'));

    // Titles here, glyphs in `panel-tab-icons.ts` — the settings page that turns these tabs off draws the same
    // glyph beside each name, and a copy in two files is a copy that drifts.
    const allTabDefs: { id: TabId; title: string; svg: string }[] = [
      { id: 'contents', title: t('tab_tooltips.table_of_contents'), svg: PANEL_TAB_SVGS.contents },
      { id: 'search', title: t('tab_tooltips.search'), svg: PANEL_TAB_SVGS.search },
      { id: 'saved', title: t('tab_tooltips.annotations_bookmarks_selections_notes'), svg: PANEL_TAB_SVGS.saved },
      { id: 'backlinks', title: t('tab_tooltips.backlinks'), svg: PANEL_TAB_SVGS.backlinks },
      { id: 'stats', title: t('tab_tooltips.reading_stats'), svg: PANEL_TAB_SVGS.stats },
    ];
    /**
     * **All five tabs, always.**
     *
     * Not individually hidable: four commands open the panel on a named tab (Contents, Saved, Backlinks, Stats), so a
     * hidden tab's pane could be shown with no button in the strip to say where you were — and `open` focuses that
     * button, which would land the keyboard on something not displayed. Hiding a toolbar button earns its keep,
     * because the top bar is one narrow row on a phone; five small icons inside a panel the reader deliberately opened
     * compete with nothing, and an unused tab costs nothing until it is clicked.
     */
    this.tabBtns = {};
    this.tabPanes = {};
    for (const { id, title, svg } of allTabDefs) {
      const btn = tabBar.createEl('button', { cls: 'orbis-panel-tab' });
      btn.id = `orbis-panel-tab-${id}`;
      btn.setAttribute('aria-label', title);
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('tabindex', '-1');
      btn.setAttribute('aria-controls', `orbis-panel-pane-${id}`);
      setSvgIcon(btn, svg);
      this.tabBtns[id] = btn;
      btn.addEventListener('click', () => this.activatePanelTab(id));
      const pane = this.tocPanel.createDiv({ cls: 'orbis-toc-items' });
      pane.id = `orbis-panel-pane-${id}`;
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', `orbis-panel-tab-${id}`);
      pane.hide();
      this.tabPanes[id] = pane;
    }

    // Contents pane
    const contentsPane = this.tabPanes['contents']!;
    if (toc.length === 0) {
      contentsPane.createDiv({ cls: 'orbis-saved-empty', text: t('contents_tab.no_table_of_contents') });
    } else {
      const renderItems = (items: TocItemLike[], depth: number): void => {
        for (const item of items) {
          const btn = contentsPane.createEl('button', { cls: 'orbis-toc-item', text: item.label.trim() });
          btn.dataset.href = item.href;
          btn.setCssProps({ '--orbis-toc-indent': `${12 + depth * 16}px` });
          btn.addClass('orbis-toc-row');
          if (depth > 0) btn.classList.add('orbis-toc-item--sub');
          btn.addEventListener('click', () => {
            this.ctx.markUserNavigation();
            void this.ctx.foliateView?.goTo(item.href);
            this.close('navigated');
          });
          if (item.subitems?.length) renderItems(item.subitems, depth + 1);
        }
      };
      renderItems(toc, 0);
      this.updateTocActive(currentHref);
    }

    // Search pane — flex column: controls row + scrollable results
    this.search.buildPanelTab(this.tabPanes['search']!);

    // Saved pane — savedItemsEl is the scrollable pane
    this.savedItemsEl = this.tabPanes['saved']!;

    // The tab the panel opens on. All five are always present — see the note on `open`.
    this.activatePanelTab(this.activeTab);
  }

  // ── TOC active-chapter highlight ────────────────────────────────────────────

  /**
   * Mark the contents entry of the page showing.
   *
   * **No entry means the page comes before the first one** — a cover, or a title page the contents do not list — and
   * those pages count as the first entry's. foliate names an entry for every page from the first entry on (the entry
   * pointing into the page's part of the book, or the one before it), so nothing else arrives here empty. Left
   * unmarked, a book opened for the first time showed no chapter at all, and turning back to the cover kept the
   * highlight on Chapter 1.
   */
  updateTocActive(href: string | undefined): void {
    const rows = this.tabPanes['contents']?.querySelectorAll<HTMLElement>('.orbis-toc-item');
    if (!rows?.length) return;
    const at = href ? Array.from(rows).findIndex((btn) => btn.dataset.href === href) : 0;
    rows.forEach((btn, i) => btn.classList.toggle('is-active', i === at));
  }

  /**
   * Scroll the Contents pane so the chapter being read sits in the middle of it.
   *
   * **Opening the contents is how a reader asks where they are**, and a long book's current chapter is far below the
   * first screen of the list. Centered rather than merely brought into view, so the chapters either side show too.
   *
   * The pane's own `scrollTop`, not `scrollIntoView`, which also scrolls every scrollable ancestor — the reader's host
   * and Obsidian's workspace among them. Does nothing while the pane is hidden, where nothing has a size: `open` asks
   * again once the panel is shown.
   */
  private revealActiveTocRow(): void {
    const pane = this.tabPanes['contents'];
    const row = pane?.querySelector<HTMLElement>('.orbis-toc-item.is-active');
    if (!pane || !row || pane.clientHeight === 0) return;
    const offset = row.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    pane.scrollTop += offset - (pane.clientHeight - row.offsetHeight) / 2;
  }

  // ── Saved tab ────────────────────────────────────────────────────────────────

  /**
   * The mark, rendered as itself — an `Aa` in the mark's own color and treatment.
   *
   * Not a color dot, which can only ever show one of a mark's two channels: a mark drawn as a black underline with
   * no wash would show as a dot of nothing. The rendered sample is the same specimen the mark bar,
   * the picker and the note view use, so one row of the panel says the same thing they do.
   *
   * The mark's NAME is not shown — rows are tight, and the name is in the tooltip. That leaves two marks of
   * identical appearance indistinguishable here, which is cosmetic in a list and would not be in a filter.
   *
   * Nothing resolves → the no-color swatch, so an unmarked note keeps its place in the column rather than
   * leaving the row's text shifted left of every other row's.
   */
  private savedMark(row: HTMLElement, annot: { color?: string; markId?: string }): void {
    const mark = this.annot.markFor(annot);
    if (mark) {
      // The "Aa" is the element's own CONTENT — `applyMarkPreview` only styles what is already there. Without
      // the text this renders as a bare treatment line with nothing under it.
      const el = row.createSpan({ cls: 'orbis-saved-mark', text: t('annotation_picker.mark_sample') });
      applyMarkPreview(el, mark);
      el.setAttribute('aria-label', mark.name || t('presets.unnamed_mark'));
      return;
    }
    const swatch = row.createDiv({ cls: 'orbis-saved-swatch orbis-note-swatch' });
    swatch.setCssProps({ '--orbis-note-swatch-color': annot.color ?? 'transparent' });
    swatch.toggleClass('has-no-color', !annot.color);
    // Named like every other swatch in the column, so hovering one is not a dead spot.
    swatch.setAttribute('aria-label', t('presets.no_mark'));
  }

  /**
   * One collapsible section of the Saved tab.
   *
   * **The key is passed, not derived from the title.** Deriving the collapsed-state key from the displayed string
   * would tie the title to hardcoded English, and make that state locale-dependent the moment the title is
   * translated. So the two are separate arguments: `key` is what this device remembers, `title` is what the reader
   * sees.
   */
  private renderSavedSection(key: string, title: string, count: number, renderItems: (el: HTMLElement) => void): void {
    if (!this.savedItemsEl) return;
    const collapsed = this.savedCollapsed[key] ?? false;

    const hdr = this.savedItemsEl.createDiv({ cls: 'orbis-saved-hdr' });
    hdr.createSpan({ cls: 'orbis-saved-chevron', text: collapsed ? '▶' : '▼' });
    hdr.createSpan({ text: `  ${title}` });
    if (count > 0) hdr.createSpan({ cls: 'orbis-saved-badge', text: String(count) });
    // A header that opens and closes a section: focusable, and it says which state it is in — a chevron is a picture,
    // and `aria-expanded` is the same fact for anyone who cannot see it.
    hdr.setAttribute('aria-expanded', String(!collapsed));
    onActivate(hdr, () => {
      this.savedCollapsed[key] = !collapsed;
      this.renderSavedPanel();
    });

    if (!collapsed) {
      const body = this.savedItemsEl.createDiv();
      if (count === 0) {
        body.createDiv({ cls: 'orbis-saved-empty', text: t('annotations_tab.none_yet') });
      } else {
        renderItems(body);
      }
    }
  }

  // Group items by chapter and render them with a chapter sub-header.
  // Items without a chapter appear last under an empty header.
  // Within each chapter, items are sorted by page number (then createdAt as tiebreaker).
  private renderChapterGrouped<T extends { chapter?: string; chapterHref?: string; loc?: number; createdAt: number }>(
    el: HTMLElement,
    items: T[],
    renderRow: (container: HTMLElement, item: T) => void
  ): void {
    // Group by chapterHref, not chapter label — chapter labels repeat across
    // parts in many books ("PART I > CHAPTER I", "PART II > CHAPTER I").
    const hrefToDisplayLabel = new Map(
      flattenTocWithDisambiguation(this.host.tocItems ?? []).map((e) => [e.href, e.displayLabel])
    );
    const grouped = new Map<string, T[]>();
    for (const item of items) {
      const key = chapterKey(item);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }
    const chapterKeys = [...grouped.keys()].sort((a, b) => {
      const aMin = Math.min(...grouped.get(a)!.map((i) => i.loc ?? Infinity));
      const bMin = Math.min(...grouped.get(b)!.map((i) => i.loc ?? Infinity));
      return aMin - bMin;
    });
    for (const key of chapterKeys) {
      const groupItems = grouped.get(key)!;
      const label = hrefToDisplayLabel.get(key) ?? groupItems[0]?.chapter ?? '';
      if (label) el.createDiv({ cls: 'orbis-saved-chapter-hdr', text: label });
      const sorted = [...groupItems].sort(
        (a, b) => (a.loc ?? Infinity) - (b.loc ?? Infinity) || a.createdAt - b.createdAt
      );
      for (const item of sorted) renderRow(el, item);
    }
  }

  private renderSavedPanel(): void {
    if (!this.savedItemsEl) return;
    this.savedItemsEl.empty();

    // Bookmarks
    this.renderSavedSection('bookmarks', t('annotations_tab.bookmarks'), this.bookmarks.all.length, (el) => {
      this.renderChapterGrouped(el, this.bookmarks.all, (container, bm) => {
        const row = container.createDiv({ cls: 'orbis-saved-item' });
        const icon = row.createDiv({ cls: 'orbis-saved-bookmark-icon' });
        setSvgIcon(icon, bm.kind === 'audio' ? AUDIO_BOOKMARK_ICON : READING_BOOKMARK_ICON);
        icon.setAttribute('aria-label', bm.kind === 'audio' ? t('tts.bookmark') : t('toolbar.bookmark_this_location'));
        const main = row.createDiv({ cls: 'orbis-saved-item-main' });
        const locText = bm.loc != null ? `loc. ${bm.loc}` : '';
        main.createDiv({ cls: 'orbis-saved-item-label', text: locText || bm.label });
        const del = row.createEl('button', { cls: 'orbis-saved-del', text: '×' });
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          this.bookmarks.remove(bm.id);
          this.renderSavedPanel();
        });
        onActivate(row, () => {
          this.bookmarks.navigateTo(bm);
          this.close('navigated');
        });
      });
    });

    // Passage selections
    this.renderSavedSection(
      'highlights',
      t('annotations_tab.passage_selections'),
      this.annot.highlights.length,
      (el) => {
        this.renderChapterGrouped(el, this.annot.highlights, (container, hl) => {
          const row = container.createDiv({ cls: 'orbis-saved-item' });
          this.savedMark(row, hl);
          const main = row.createDiv({ cls: 'orbis-saved-item-main' });
          if (hl.loc != null)
            main.createDiv({ cls: 'orbis-saved-item-page', text: t('annotations_tab.loc_n', { n: hl.loc }) });
          main.createDiv({
            cls: 'orbis-saved-item-excerpt',
            text: hl.text.length > 100 ? hl.text.slice(0, 100) + '…' : hl.text,
          });
          const del = row.createEl('button', { cls: 'orbis-saved-del', text: '×' });
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            this.annot.removeHighlight(hl.cfiRange);
            this.renderSavedPanel();
          });
          onActivate(row, () => this.goToSaved(hl.cfiRange));
        });
      }
    );

    // Notes
    this.renderSavedSection('notes', t('annotations_tab.notes'), this.annot.notes.length, (el) => {
      this.renderChapterGrouped(el, this.annot.notes, (container, note) => {
        const row = container.createDiv({ cls: 'orbis-saved-item' });
        this.savedMark(row, note);
        const main = row.createDiv({ cls: 'orbis-saved-item-main' });
        if (note.loc != null)
          main.createDiv({ cls: 'orbis-saved-item-page', text: t('annotations_tab.loc_n', { n: note.loc }) });
        main.createDiv({
          cls: 'orbis-saved-item-label',
          text: note.text.length > 80 ? note.text.slice(0, 80) + '…' : note.text,
        });
        if (note.selectedText) {
          main.createDiv({
            cls: 'orbis-saved-item-excerpt',
            text: note.selectedText.length > 80 ? note.selectedText.slice(0, 80) + '…' : note.selectedText,
          });
        }
        const del = row.createEl('button', { cls: 'orbis-saved-del', text: '×' });
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          // Shared confirm (respects the "confirm before deleting notes" setting), same as the view.
          this.annot.requestDeleteNote(note.id, () => this.renderSavedPanel());
        });
        onActivate(row, () => this.goToSaved(note.cfiRange));
      });
    });
  }

  /**
   * Go to a highlight or a note from the Saved panel, and flash where it lands.
   *
   * **One method for both rows.** Copies drift: a landing cue added to search, to bookmarks and to links from outside
   * has no reason to visit a copy. The panel is where a reader looks for their own marks most often, so it must not
   * be the one that misses the flash.
   *
   * Outlined and in the landing color, like every other arrival — the passage under it is already highlighted, which
   * is exactly the case a translucent fill cannot show.
   */
  private goToSaved(cfiRange: string): void {
    this.ctx.markUserNavigation(cfiRange);
    this.ctx.navSuppressor.beginTargetNav(cfiRange);
    void this.ctx.foliateView?.goTo(cfiRange);
    this.ctx.flashAnchor(cfiRange, LANDING_FLASH_COLOR, true);
    this.close('navigated');
  }

  // ── Backlinks tab ────────────────────────────────────────────────────────────

  /** Pre-scan backlinks in the background so they're ready when the tab is opened. */
  schedulePreScan(): void {
    this.backlinksPreScanTimer = window.setTimeout(() => {
      this.backlinksPreScanTimer = null;
      const f = this.ctx.currentFile;
      if (f && !this.backlinksCache.has(f.path) && !this.backlinksLoading) {
        void this.loadBacklinks();
      }
    }, 5000);
  }

  private async loadBacklinks(): Promise<void> {
    const bookPath = this.ctx.currentFile?.path;
    if (!bookPath) return;
    if (this.backlinksCache.has(bookPath)) {
      this.ctx.debug('backlinks: serving from cache', 'backlinks');
      this.backlinksData = this.backlinksCache.get(bookPath)!;
      this.renderBacklinksPane();
      return;
    }
    this.backlinksLoading = true;
    this.renderBacklinksPane();
    const t0 = Date.now();
    try {
      this.ctx.debug(`backlinks: scanning for "${bookPath}"`, 'backlinks');
      const matches = await scanBacklinks(bookPath, this.ctx.app);
      const elapsed = Date.now() - t0;
      this.ctx.debug(`backlinks: done in ${elapsed}ms — ${matches.length} notes found`, 'backlinks');
      this.backlinksCache.set(bookPath, matches);
      this.backlinksData = matches;
    } finally {
      this.backlinksLoading = false;
      this.renderBacklinksPane();
    }
  }

  private renderBacklinksPane(): void {
    const pane = this.tabPanes['backlinks'];
    if (!pane) return;
    pane.empty();
    if (this.backlinksLoading) {
      pane.createDiv({ cls: 'orbis-saved-empty', text: t('backlinks_tab.scanning_vault') });
      return;
    }
    if (!this.backlinksData || this.backlinksData.length === 0) {
      pane.createDiv({ cls: 'orbis-saved-empty', text: t('backlinks_tab.no_notes_link_to_this_book_yet') });
      return;
    }
    for (const link of this.backlinksData) {
      const row = pane.createDiv({ cls: 'orbis-toc-item orbis-panel-row' });
      const iconWrap = row.createDiv({ cls: 'orbis-panel-icon-wrap' });
      setSvgIcon(
        iconWrap,
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>'
      );
      row.createSpan({ text: link.noteTitle, cls: 'orbis-panel-label' });
      row.title = link.notePath;
      onActivate(row, () => {
        const tfile = this.ctx.app.vault.getAbstractFileByPath(normalizePath(link.notePath));
        if (tfile instanceof TFile) void this.ctx.app.workspace.getLeaf(false).openFile(tfile);
        this.close();
      });
    }
  }

  /** Reset per-book panel state and DOM handles on book close / leaf teardown. */
  dispose(): void {
    this.tocPanel = null;
    this.tocBackdrop = null;
    this.savedItemsEl = null;
    this.tabBtns = {};
    this.tabPanes = {};
    if (this.backlinksPreScanTimer !== null) {
      window.clearTimeout(this.backlinksPreScanTimer);
      this.backlinksPreScanTimer = null;
    }
    this.backlinksData = null;
    this.backlinksLoading = false;
  }
}
