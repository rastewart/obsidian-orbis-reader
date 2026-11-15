import {
  collapse as cfiCollapse,
  compare as cfiCompare,
  fake as cfiFake,
  fromRange as cfiFromRange,
  joinIndir as cfiJoinIndir,
} from 'foliate-js/epubcfi.js';
import { Overlayer } from 'foliate-js/overlayer.js';
import { Platform } from 'obsidian';
import { actionButton, actionRow } from '../controls';
import { t } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { marksInUse, markUsage, NO_MARK } from '../mark-filter';
import { renderMarkChips, renderMarkChoiceList } from '../mark-filter-ui';
import { annotationsSvg } from '../system-glyphs';
import { captureFocus, createOrbisPopup, setSvgIcon } from '../ui-utils';
import { isForwardRangeCfi } from './bookmark-utils';
import { LANDING_FLASH_COLOR } from './flash-target';
import type { FoliateViewEl } from './foliate-view';
import type { ReaderContext } from './ReaderContext';
import { SecondaryBar, type SecondaryBarRegistry } from './SecondaryBar';
import { entryAt, excerptAround, firstResultSettled, sectionIndexFromCfi } from './search-utils';

// The search glyph: the toolbar button, and the Advanced dialog that belongs to the same feature.
const SEARCH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
const SEARCH_HIT_COLOR = '#FF9500'; // amber — active hit
const SEARCH_OTHER_COLOR = '#5BC4D4'; // cyan — other hits in same section
// Bright, saturated flash for result navigation — distinct from the amber/cyan search markers and
// from every highlight color, so it stands out even when it plays over an existing highlight/note.

// Sliders/filter glyph for the Advanced-search button (Lucide sliders-horizontal).
const ADV_SEARCH_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="8" y2="6"/><line x1="6" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="10" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="16" y2="18"/><line x1="14" y1="18" x2="3" y2="18"/><circle cx="7" cy="6" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="15" cy="18" r="2"/></svg>';

// The "carries no mark" sentinel and the counting live in `mark-filter.ts`, shared with the export dialogs that
// offer the same filter — see there for why the sentinel exists at all.

// A "word" character for the whole-word match modifier (Unicode letters, digits, underscore).
const WORD_CHAR = /[\p{L}\p{N}_]/u;

// Text-match modifier glyphs for the Advanced modal (Lucide case-sensitive + whole-word).
const MATCH_CASE_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8"/><path d="M4 13h6"/><circle cx="18" cy="12" r="3"/><path d="M21 9v6"/></svg>';
const WHOLE_WORD_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3"/><path d="M10 9v6"/><circle cx="17" cy="12" r="3"/><path d="M14 7v8"/><path d="M22 17v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/></svg>';

// Prev/next result arrows — up/down to match Obsidian's in-note find bar (not left/right).
const ARROW_UP_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';
const ARROW_DOWN_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';

/** What a result matched — book text, or one of the annotation scopes (advanced search). */
type HitKind = 'book' | 'passage' | 'note-anchor' | 'note-content';

/** Which sources the next search covers. Book text is the default; the annotation scopes
 *  (advanced search) filter the in-memory highlights/notes. Persists for the view session; not
 *  persisted to disk. */
interface SearchScope {
  bookText: boolean;
  /** Passage selections — a marked passage with no note on it. */
  passages: boolean;
  noteAnchors: boolean;
  noteContent: boolean;
}
const DEFAULT_SCOPE: SearchScope = { bookText: true, passages: false, noteAnchors: false, noteContent: false };
const isDefaultScope = (s: SearchScope): boolean => s.bookText && !s.passages && !s.noteAnchors && !s.noteContent;
/** Is a scope on that marks can filter? Book text carries no marks. */
const marksCanApply = (s: SearchScope): boolean => s.passages || s.noteAnchors || s.noteContent;

const KIND_LABEL: Record<HitKind, TranslationKey> = {
  book: 'search_tab.kind_book',
  passage: 'search_tab.kind_passage',
  'note-anchor': 'search_tab.kind_note',
  'note-content': 'search_tab.kind_note_text',
};

// Distinct glyphs for the bar's per-result kind indicator (book / highlighter / text-selection
// brackets / note-with-lines).
const KIND_ICON: Record<HitKind, string> = {
  book: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  passage:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>',
  'note-anchor':
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/></svg>',
  'note-content':
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>',
};

interface SearchHit {
  cfi: string;
  excerpt: string;
  chapterTitle: string;
  /** Unique chapter identity — labels repeat across Parts, so results are grouped by this, not by
   *  chapterTitle (which is only for display). A contents href where the book has one, else a
   *  `section:N` sentinel that collides with nothing. Grouping is all it is ever used for; hits
   *  navigate by `cfi`. */
  chapterHref: string;
  /** What matched — drives the per-result kind indicator. */
  kind: HitKind;
  /** Highlight / note color, for the result's swatch (annotation kinds only). */
  color?: string;
  /** Owning note id (note kinds) — reserved for a future "open the note" action. */
  noteId?: string;
}

type RawSection = { cfi?: string; createDocument?(): Promise<Document>; unload?(): void };

// The `draw-annotation` event detail, as much of it as the search hit path uses.
type DrawDetail = {
  draw: (fn: typeof Overlayer.highlight, opts: unknown) => void;
  annotation: { value: string; color?: string };
  range: Range;
};

/**
 * Full-text search: the algorithm (walks each spine section's document), the
 * result state, both UI surfaces (the standalone bar and the content-panel tab),
 * and hit-to-hit navigation. Search highlights ride the annotation-overlay path,
 * so the view's Foliate handlers call into `reapplyAnnotations`/`tryDrawHit` here
 * rather than reaching into search state. See docs/design/reader-architecture.md.
 */
export class SearchController {
  private results: SearchHit[] = [];
  private activeIndex = 0;
  private loading = false;
  private query = '';
  private lastQuery = '';
  /** The active hit's cfi — tracks the current result for re-anchoring after a sort and for the
   *  bar's kind indicator. NOT used to add/remove overlays (see activeOverlayCfi). */
  private activeCfi: string | null = null;
  /** The cfi of the search-drawn amber overlay (BOOK hits only). Kept separate from activeCfi so
   *  cleanup never deletes a real highlight/note when the active result is an annotation. */
  private activeOverlayCfi: string | null = null;
  private secondaryAnnotations: string[] = [];
  private pendingNavCfi: string | null = null;

  /** Current search scope (advanced search). Persists for the life of this reader view (a lit
   *  Advanced button signals a non-default scope); resets to book-text-only on view reopen /
   *  reload. In-memory only — never persisted. */
  private scope: SearchScope = { ...DEFAULT_SCOPE };
  /** Highlight-color filter (advanced search). Empty = any color; otherwise a set of hex colors
   *  and/or the NO_MARK sentinel. Narrows annotation hits only (book text carries no mark). Persists
   *  for the view session like `scope`. */
  private markFilter = new Set<string>();
  /** Text-match modifiers (advanced search) — apply to book + annotation text matching, not the
   *  color-only path. Persist for the view session like `scope`. */
  private caseSensitive = false;
  private wholeWord = false;
  /** The Advanced buttons (standalone bar + panel search tab), so their active-scope indicator
   *  can be refreshed together. */
  private advBtns: HTMLButtonElement[] = [];

  private toolbarBtn: HTMLButtonElement | null = null;
  private bar: SecondaryBar | null = null;
  private barEl_: HTMLElement | null = null;
  private barInputEl: HTMLInputElement | null = null;
  private panelInputEl: HTMLInputElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private barKindEl: HTMLElement | null = null;
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  private resultBtns: HTMLButtonElement[] = [];

  constructor(
    private readonly ctx: ReaderContext,
    private readonly registry: SecondaryBarRegistry
  ) {}

  /** The toolbar search-toggle button, for visibility toggling by the toolbar. */
  get toolbarButton(): HTMLButtonElement | null {
    return this.toolbarBtn;
  }

  /** The standalone search bar element, for the host to re-parent into the overlay. */
  get barEl(): HTMLElement | null {
    return this.barEl_;
  }

  // ── DOM construction ──────────────────────────────────────────────────────

  /** Build the toolbar search-toggle button into `container`. */
  buildToolbarButton(container: HTMLElement): void {
    this.toolbarBtn = container.createEl('button', { cls: 'orbis-ctrl-btn', attr: { 'data-orbis-opens': 'search' } });
    this.toolbarBtn.setAttribute('aria-label', t('toolbar.search_in_book'));
    setSvgIcon(this.toolbarBtn, SEARCH_ICON);
    this.toolbarBtn.addEventListener('click', () => {
      if (this.barEl_?.isShown()) this.closeBar();
      else this.openBar();
    });
  }

  /** Build the standalone search bar into `container` (hidden until opened). */
  buildBar(container: HTMLElement): void {
    // Standalone search bar — between toolbar and host, shown when a search is active.
    this.bar = new SecondaryBar(this.ctx, this.registry, {
      cls: 'orbis-search-bar',
      reserveFocusSpace: true, // reserve top space in focus mode so it doesn't cover text
      onClose: () => {
        this.clear();
        if (this.panelInputEl) this.panelInputEl.value = '';
        if (this.barInputEl) this.barInputEl.value = '';
        this.query = '';
        this.toolbarBtn?.classList.remove('is-active');
        this.toolbarBtn?.focus();
      },
    });
    const searchBar = this.bar.build(container);
    this.barEl_ = searchBar;

    const sbInput = searchBar.createEl('input');
    sbInput.type = 'text';
    sbInput.placeholder = t('standalone_search_bar.search');
    // Placeholder alone isn't a reliable accessible name (it disappears once
    // typed, and screen reader support for placeholder-as-name is inconsistent).
    sbInput.setAttribute('aria-label', t('standalone_search_bar.search'));
    sbInput.className = 'orbis-search-input';
    this.barInputEl = sbInput;
    this.bar.registerInput(sbInput); // mobile keyboard-lock

    sbInput.addEventListener('input', () => {
      this.query = sbInput.value;
      if (this.panelInputEl) this.panelInputEl.value = sbInput.value;
      this.updateUI();
    });
    sbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (this.query.trim() === this.lastQuery && this.results.length > 0) {
          this.next();
        } else {
          void this.handleEnter();
        }
      } else if (e.key === 'Escape') {
        this.closeBar();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        /**
         * **The arrows step results, because the buttons beside them do.** A find bar is a field between a previous
         * and a next button, and without this the only route through the hits would be the pointer.
         * Nothing is taken away: in a SINGLE-line input those keys only jump the caret to the start or the end,
         * which Home and End still do. See `wireArrowKeys` for the other half, where Up walks back out of the list.
         */
        if (e.key === 'ArrowUp') this.prev();
        else this.next();
        e.preventDefault();
      }
    });

    // No Go button — Enter submits on every platform, and a Go button beside Advanced would be easy
    // to misclick. Advanced options sit right after the input.
    this.makeAdvBtn(searchBar);

    const sbNav = searchBar.createDiv({ cls: 'orbis-sb-nav' });
    this.prevBtn = sbNav.createEl('button', { cls: 'orbis-ctrl-btn orbis-sb-btn' });
    setSvgIcon(this.prevBtn, ARROW_UP_ICON);
    this.prevBtn.setAttribute('aria-label', t('standalone_search_bar.previous_result'));
    this.prevBtn.disabled = true;
    this.prevBtn.addEventListener('click', () => this.prev());

    // Kind indicator for the current result (book / highlight / note selection / note text) — an
    // extra cue alongside the count, useful when a search spans multiple scopes.
    this.barKindEl = sbNav.createSpan({ cls: 'orbis-search-kind-icon' });
    this.barKindEl.hide();

    this.countEl = sbNav.createSpan({ cls: 'orbis-search-count' });
    this.countEl.setAttribute('aria-live', 'polite');

    this.nextBtn = sbNav.createEl('button', { cls: 'orbis-ctrl-btn orbis-sb-btn' });
    setSvgIcon(this.nextBtn, ARROW_DOWN_ICON);
    this.nextBtn.setAttribute('aria-label', t('standalone_search_bar.next_result'));
    this.nextBtn.disabled = true;
    this.nextBtn.addEventListener('click', () => this.next());

    const sbClose = searchBar.createEl('button', { cls: 'orbis-ctrl-btn orbis-sb-close', text: '×' });
    sbClose.setAttribute('aria-label', t('standalone_search_bar.close_search'));
    sbClose.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.closeBar();
    });
  }

  /** Build the content-panel search tab (input row + scrollable results) into `pane`. */
  buildPanelTab(pane: HTMLElement): void {
    pane.classList.add('orbis-search-pane');
    const searchBarDiv = pane.createDiv({ cls: 'orbis-search-bar' });
    searchBarDiv.show();

    const searchInput = searchBarDiv.createEl('input');
    searchInput.type = 'text';
    searchInput.placeholder = t('standalone_search_bar.search');
    searchInput.setAttribute('aria-label', t('standalone_search_bar.search'));
    searchInput.className = 'orbis-search-input';
    this.panelInputEl = searchInput;

    // Prevent the background from going black when the keyboard opens on mobile
    searchInput.addEventListener('focus', () => {
      if (Platform.isMobile) this.ctx.lockMobileHeights();
    });
    searchInput.addEventListener('blur', () => {
      if (Platform.isMobile) {
        // slight delay to ensure keyboard is closing
        window.setTimeout(() => this.ctx.unlockMobileHeights(), 100);
      }
    });

    searchInput.addEventListener('input', () => {
      this.query = searchInput.value;
      if (!searchInput.value.trim()) this.clear();
      this.updateUI();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.handleEnter();
      else if (e.key === 'Escape') this.closeBar();
      /**
       * **Down goes into the results.** It is what a search box does everywhere, and here it is the difference between
       * "type, then hunt for the list with Tab" and "type, then walk what came back". A single-line input has nothing
       * of its own to do with Down, so nothing is taken away — and the panel's own arrow handler stands off text
       * fields, which is why this has to be wired here rather than there.
       */ else if (e.key === 'ArrowDown') {
        const first = this.resultsEl?.querySelector<HTMLElement>('.orbis-search-result');
        if (first) {
          first.focus();
          e.preventDefault();
        }
      }
    });

    // Advanced search sits where a Go button would — Enter submits, so Go would be redundant.
    this.makeAdvBtn(searchBarDiv);

    // Scrollable results list below the input row
    this.resultsEl = pane.createDiv({ cls: 'orbis-search-results-list' });
  }

  /** Called when the panel's search tab becomes active: sync + focus the input. */
  /**
   * The search tab is showing.
   *
   * `focusInput` is true only when the panel was OPENED onto search — a reader who pressed the search key wants the
   * caret. Arrowing across the tab bar is a different act: focus belongs on the tab you moved to, as it does for every
   * other tab, and Tab is how you reach the field from there. Grabbing the caret on the way past would make Search the
   * one tab you could not simply look at.
   */
  onPanelTabActivated(focusInput = false): void {
    if (this.panelInputEl) this.panelInputEl.value = this.query;
    if (focusInput) window.setTimeout(() => this.panelInputEl?.focus(), 50);
  }

  // ── Bar open/close ────────────────────────────────────────────────────────

  /** Open the standalone bar. `focusInput` (default) puts the caret in the query field — right when
   *  the user opens search to type. Pass false when the bar is opened as a side effect of picking a
   *  result from the panel list: focus the next-result arrow instead, so the mobile keyboard doesn't
   *  pop up over the passage the user just navigated to. */
  openBar(focusInput = true): void {
    if (!this.bar) return;
    // Scope persists for the session — a lit Advanced button flags a non-default scope. It only
    // resets when the view is reopened/reloaded (the controller, and this field, are recreated).
    this.refreshAdvIndicator();
    // Close the content panel too — bar.open() only closes the other secondary bars, so without
    // this the search bar opened behind an open panel (the panel already hides the bar on its open,
    // so this makes the exclusion symmetric).
    this.ctx.closePanel();
    this.bar.open(); // closes the other secondary bars + reserves focus-mode space
    this.toolbarBtn?.classList.add('is-active');
    if (this.barInputEl) this.barInputEl.value = this.query;
    window.setTimeout(() => (focusInput ? this.barInputEl : this.nextBtn)?.focus(), 50);
  }

  /** Whether the standalone search bar is currently shown. */
  isBarOpen(): boolean {
    return !!this.barEl_?.isShown();
  }

  /** Close the standalone bar (state + UI cleanup runs in the bar's onClose). */
  closeBar(): void {
    this.bar?.close();
  }

  /** Build an Advanced-search button (bar + panel tab share this), registered so its active-scope
   *  indicator refreshes with the others. */
  private makeAdvBtn(parent: HTMLElement): HTMLButtonElement {
    const btn = parent.createEl('button', { cls: 'orbis-ctrl-btn' });
    btn.setAttribute('aria-label', t('search_tab.advanced'));
    setSvgIcon(btn, ADV_SEARCH_ICON);
    btn.addEventListener('click', () => this.openAdvancedModal());
    this.advBtns.push(btn);
    this.refreshAdvIndicator();
    return btn;
  }

  /** Is anything in Advanced search other than its default — a scope, a mark filter or a match option? */
  get advancedActive(): boolean {
    return !isDefaultScope(this.scope) || this.filtersByMark || this.caseSensitive || this.wholeWord;
  }

  /**
   * Is the mark filter in force? Only with a scope it can filter on. With Book text alone the section dims and the
   * marks picked are kept, to come back when a saved-item scope does — but they filter nothing, so they must not
   * light the sliders button or count as something to search for.
   */
  private get filtersByMark(): boolean {
    return this.markFilter.size > 0 && marksCanApply(this.scope);
  }

  /** Light the Advanced buttons when `advancedActive`, so scoped results — which look like ordinary results — aren't
   *  a silent surprise. */
  private refreshAdvIndicator(): void {
    for (const btn of this.advBtns) btn.classList.toggle('is-active', this.advancedActive);
  }

  /**
   * Whether an annotation passes the current mark filter. Empty filter → everything passes.
   *
   * By mark IDENTITY, not by color. Two marks can share a color and mean different things, which is the whole
   * point of marks having names — so "everything yellow" was never the question anyone was asking.
   */
  private markMatches(markId: string | undefined): boolean {
    if (this.markFilter.size === 0) return true;
    return this.markFilter.has(markId ?? NO_MARK);
  }

  /** Index of the query in `haystack` at/after `fromIndex`, honoring the case-sensitive and
   *  whole-word modifiers; -1 if none. Empty query → -1 (the color-only path is handled by the
   *  callers separately). */
  private matchIndex(haystack: string, fromIndex = 0): number {
    const q = this.query.trim();
    if (!q) return -1;
    const hay = this.caseSensitive ? haystack : haystack.toLowerCase();
    const ndl = this.caseSensitive ? q : q.toLowerCase();
    let i = hay.indexOf(ndl, fromIndex);
    if (!this.wholeWord) return i;
    while (i >= 0) {
      const before = i > 0 ? haystack[i - 1] : '';
      const after = haystack[i + q.length] ?? '';
      if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return i;
      i = hay.indexOf(ndl, i + 1);
    }
    return i;
  }

  /**
   * Advanced search: which sources to search, which marks to narrow to, and the text-match options.
   *
   * **Two stages in one dialog, not two dialogs.** Picking marks replaces the body and Done swaps it back. A
   * second `createOrbisPopup` over this one is untested and there is a guard elsewhere that refuses exactly that
   * stacking; a stage sidesteps the question, gives the mark list the full dialog height it needs for names and
   * counts, and follows the change-preset flow in `AnnotationPresetsModal`, which repaints a stage the same way.
   *
   * Drafts live out here so a trip through the picker does not lose them, and so Cancel discards everything —
   * "Done" commits to the draft, `OK` commits the draft.
   */
  private openAdvancedModal(): void {
    const { popupEl, close } = createOrbisPopup(this.ctx, {
      title: t('search_tab.advanced_title'),
      icon: SEARCH_ICON,
      dismissOnOutsideClick: true,
      desktopWidth: '360px',
      // No text input here, so no keyboard to reserve for — use the full height so every section fits
      // without the dialog scrolling to reach OK on mobile.
      mobileFillHeight: true,
    });
    const body = popupEl.createDiv({ cls: 'orbis-adv-search' });
    const stage = body.createDiv();

    const draft: SearchScope = { ...this.scope };
    const draftMarks = new Set(this.markFilter);
    const draftOpts = { caseSensitive: this.caseSensitive, wholeWord: this.wholeWord };

    const data = this.ctx.notesData();
    const marks = data.marks ?? [];
    // Shared with the export dialogs, which offer the same filter over the same two arrays — see `mark-filter.ts`.
    const usage = markUsage(data);
    const inUse = marksInUse(data);
    const markById = new Map(marks.map((m) => [m.id, m]));
    const pillLabels = {
      sample: t('annotation_picker.mark_sample'),
      noMark: t('mark_filter.no_mark'),
      unnamed: t('presets.unnamed_mark'),
    };

    const marksApply = () => marksCanApply(draft);

    /**
     * One word per line, so every button in the grid is the same shape.
     *
     * Letting them wrap naturally would leave "Book text" on one line beside "Passage selections" on two — same
     * height, because grid rows stretch, but visibly different. Splitting on whitespace makes the break
     * deterministic instead of dependent on how wide the screen happens to be, which is also what would truncate
     * the labels. Every scope and match label is two words, so in English this is exactly two lines each.
     */
    const wordLines = (parent: HTMLElement, label: string): void => {
      const el = parent.createSpan({ cls: 'orbis-adv-scope-label orbis-adv-scope-label-lines' });
      for (const word of label.split(/\s+/)) el.createSpan({ text: word });
    };

    const renderSearch = (): void => {
      /**
       * **A scope toggle redraws this stage, so the keyboard has to be carried across.**
       *
       * The mark section's enabled state follows the scopes, so toggling one rebuilds the screen — and the button
       * that did it goes with it, which reads as Space losing focus. The buttons carry keys below; this puts the
       * reader back on the one they pressed. See `captureFocus`.
       */
      const restoreFocus = captureFocus(stage);
      stage.empty();

      stage.createDiv({ cls: 'orbis-adv-search-heading', text: t('search_tab.scope_heading') });
      // One column on a phone. Two fits "Highlights" but not "Passage selections", which would truncate the longer
      // labels — and four rows of vertical space is cheaper here than a label you cannot read.
      const scopes = stage.createDiv({ cls: 'orbis-adv-search-scopes orbis-adv-scope-grid' });
      const defs: { key: keyof SearchScope; label: TranslationKey; kind: HitKind }[] = [
        { key: 'bookText', label: 'search_tab.scope_book', kind: 'book' },
        { key: 'passages', label: 'search_tab.scope_passages', kind: 'passage' },
        { key: 'noteAnchors', label: 'search_tab.scope_note_anchors', kind: 'note-anchor' },
        { key: 'noteContent', label: 'search_tab.scope_note_content', kind: 'note-content' },
      ];
      for (const def of defs) {
        const btn = scopes.createEl('button', {
          cls: 'orbis-adv-scope-toggle',
          // The label is split across spans for layout, so the accessible name is spelled out here rather than
          // left to how a screen reader joins them.
          attr: {
            type: 'button',
            'aria-pressed': String(draft[def.key]),
            'aria-label': t(def.label),
            // Keyed by the scope it toggles, so the redraw its press causes lands back on it.
            'data-orbis-focus': `scope:${def.key}`,
          },
        });
        setSvgIcon(btn.createSpan({ cls: 'orbis-adv-scope-icon' }), KIND_ICON[def.kind]);
        wordLines(btn, t(def.label));
        // The last scope on cannot be turned off: disabled, with the reason below the row — as every "at least one"
        // list does, rather than offered and then refused with a notice.
        if (draft[def.key] && !defs.some((d) => d.key !== def.key && draft[d.key])) btn.disabled = true;
        btn.addEventListener('click', () => {
          draft[def.key] = !draft[def.key];
          renderSearch(); // the mark section's enabled state follows the scope
        });
        btn.toggleClass('is-active', draft[def.key]);
      }
      if (defs.filter((d) => draft[d.key]).length === 1) {
        stage.createDiv({ cls: 'orbis-adv-mark-hint', text: t('search_tab.scope_min_one') });
      }

      // Mark filter — narrows annotation hits to the chosen mark(s); none chosen = any mark. Also enables a
      // mark-only search (see OK). Only applies to annotation scopes, so the whole section dims when Book text is
      // the only one on.
      const markSection = stage.createDiv({ cls: 'orbis-adv-mark-section' });
      markSection.toggleClass('is-disabled', !marksApply());
      markSection.createDiv({ cls: 'orbis-adv-search-heading', text: t('search_tab.mark_heading') });
      renderMarkChips(markSection, {
        chosen: draftMarks,
        order: marks,
        marks: markById,
        labels: {
          ...pillLabels,
          any: t('search_tab.mark_any'),
          remove: (name) => t('search_tab.remove_mark', { name }),
        },
        // The landing after a removal is the shared component's job — see `MarkChipsSpec.landing`.
        landing: { key: 'pick-marks', root: () => stage },
        onRemove: (id) => {
          draftMarks.delete(id);
          renderSearch();
        },
      });
      const pick = markSection.createEl('button', {
        cls: 'orbis-adv-scope-toggle',
        attr: { type: 'button', 'data-orbis-focus': 'pick-marks' },
      });
      setSvgIcon(pick.createSpan({ cls: 'orbis-adv-scope-icon' }), annotationsSvg(14));
      pick.createSpan({ cls: 'orbis-adv-scope-label', text: t('search_tab.select_marks') });
      pick.disabled = !marksApply();
      pick.addEventListener('click', renderMarkPicker);

      stage.createDiv({ cls: 'orbis-adv-search-heading', text: t('search_tab.match_heading') });
      const matchRow = stage.createDiv({ cls: 'orbis-adv-search-scopes' });
      const mkOpt = (key: keyof typeof draftOpts, label: string, icon: string) => {
        const btn = matchRow.createEl('button', {
          cls: 'orbis-adv-scope-toggle',
          attr: {
            type: 'button',
            'aria-label': label,
            'aria-pressed': String(draftOpts[key]),
            // Keyed, like the scope buttons: pressing one redraws the stage it lives on.
            'data-orbis-focus': `match:${key}`,
          },
        });
        setSvgIcon(btn.createSpan({ cls: 'orbis-adv-scope-icon' }), icon);
        // One line: "Match case" and "Whole word" fit two-up even on a phone. Only the scope labels needed the
        // forced break, and giving these it too would make them needlessly tall.
        btn.createSpan({ cls: 'orbis-adv-scope-label', text: label });
        btn.toggleClass('is-active', draftOpts[key]);
        btn.addEventListener('click', () => {
          draftOpts[key] = !draftOpts[key];
          renderSearch();
        });
      };
      mkOpt('caseSensitive', t('search_tab.match_case'), MATCH_CASE_ICON);
      mkOpt('wholeWord', t('search_tab.whole_word'), WHOLE_WORD_ICON);

      // `actionButton`, not the search BAR's own classes. `orbis-ctrl-btn` is the toolbar's flat, borderless
      // button and `orbis-search-go` its accent one — right in a strip of icons, wrong as a dialog's Cancel and
      // OK, which would come out as bare text beside a gray box while every other dialog shows a button and a colored
      // primary. The buttons a dialog ends with are the shared ones.
      const btnRow = actionRow(stage, { placement: 'footer' });
      actionButton(btnRow, { label: t('action.cancel'), onClick: () => close() });
      // OK applies the chosen scope + mark filter (both persist for the session) and closes. It never submits a
      // TEXT search — those are run from the toolbar (Enter / Go). The one exception: a mark filter with no query
      // has nothing to Enter on, so OK runs that mark-only search.
      actionButton(btnRow, {
        label: t('action.ok'),
        cta: true,
        onClick: () => {
          const scopeChanged = (Object.keys(draft) as (keyof SearchScope)[]).some((k) => draft[k] !== this.scope[k]);
          const marksChanged =
            draftMarks.size !== this.markFilter.size || [...draftMarks].some((m) => !this.markFilter.has(m));
          const optsChanged = draftOpts.caseSensitive !== this.caseSensitive || draftOpts.wholeWord !== this.wholeWord;
          this.scope = { ...draft };
          this.markFilter = new Set(draftMarks);
          this.caseSensitive = draftOpts.caseSensitive;
          this.wholeWord = draftOpts.wholeWord;
          this.refreshAdvIndicator();
          close();
          if (!this.query.trim() && this.filtersByMark) {
            void this.run(); // mark-only search — nothing to Enter on, so OK is the trigger
          } else if ((scopeChanged || marksChanged || optsChanged) && this.results.length) {
            // On-screen results were collected under the old scope/filter/options — clear the now-stale hits
            // (keeping the typed query); the user re-runs from the toolbar.
            this.clear();
          }
        },
      });
      restoreFocus();
    };

    /** The picker stage: every mark something in this book carries, plus "No mark" when anything is unmarked. */
    const renderMarkPicker = (): void => {
      // Choosing a mark redraws this stage, so the keyboard has to be carried across — the rows are keyed for it.
      const restoreFocus = captureFocus(stage);
      stage.empty();
      stage.createDiv({ cls: 'orbis-adv-search-heading', text: t('search_tab.mark_heading') });

      renderMarkChoiceList(stage, {
        inUse,
        usage,
        marks: markById,
        chosen: draftMarks,
        labels: {
          ...pillLabels,
          count: (n) => t('search_tab.mark_usage', { count: String(n) }),
          empty: t('search_tab.no_marks_in_book'),
        },
        onToggle: renderMarkPicker,
      });

      const btnRow = actionRow(stage, { placement: 'footer' });
      actionButton(btnRow, {
        label: t('action.done'),
        cta: true,
        onClick: () => {
          renderSearch();
          // Back to the button that opened this stage, which is the one that says what it holds now — the same rule
          // the sources stack and the recordings library follow.
          stage.querySelector<HTMLElement>('[data-orbis-focus="pick-marks"]')?.focus();
        },
      });
      restoreFocus();
      /**
       * **The first mark, but only on the way IN.**
       *
       * Arriving here from the scope screen there is nothing to restore — the button that opened this stage does not
       * exist on it — and the first mark is what a reader came for. On a redraw caused by choosing a mark there IS
       * something to restore, and jumping to the top of the list instead would be wrong: pick the fourth mark and
       * the keyboard would go to the first.
       */
      if (!stage.contains(activeDocument.activeElement)) {
        stage.querySelector<HTMLElement>('.orbis-adv-mark-row')?.focus();
      }
    };

    renderSearch();
  }

  /** Focus mode toggled: reserve/release the top space, but only if the bar is open. */
  onFocusModeToggled(active: boolean): void {
    this.bar?.onFocusModeToggled(active);
  }

  /** Hide the standalone bar (e.g. when the panel opens — it has its own search input). Also drops
   *  the toolbar button's active state so its icon isn't left illuminated while the bar is hidden;
   *  openBar() re-adds it if the bar comes back (e.g. on panel close). */
  hideBar(): void {
    this.barEl_?.hide();
    this.toolbarBtn?.classList.remove('is-active');
    /**
     * **The registry is told, because this path hides the element without going through
     * `SecondaryBar.close()`.** What hides the floating history pair — the two cannot share the top
     * of the reader — is `.orbis-bar-open`, derived from `SecondaryBarRegistry.anyOpen()`.
     *
     * A host class this controller added and removed itself would strand right here: open the bar
     * with no query, open the content panel (which calls this), then close the panel —
     * `hasActiveSearch()` is false so the bar never reopens to clear the class, and the back/forward
     * buttons would stay invisible for the rest of the session. A derived answer cannot strand; see
     * `anyOpen`.
     */
    this.registry.changed();
  }

  /** True once a search has been run — used to decide whether to reopen the bar on panel close.
   *  Also true for a color-only (no query text) search. */
  hasActiveSearch(): boolean {
    return this.lastQuery !== '' || this.results.length > 0;
  }

  /** The active search query text (empty if no active text search) — so tapping a note during a
   *  search can mark the same term the search-result click would. */
  activeQuery(): string {
    return this.hasActiveSearch() ? this.lastQuery : '';
  }

  // ── Core search ───────────────────────────────────────────────────────────

  private updateUI(): void {
    const hasResults = this.results.length > 0;
    // Count in standalone bar
    if (this.countEl) {
      if (this.loading)
        this.countEl.textContent = hasResults ? `${this.activeIndex + 1} / ${this.results.length}+` : '…';
      else if (hasResults) this.countEl.textContent = `${this.activeIndex + 1} / ${this.results.length}`;
      else if (this.lastQuery || this.filtersByMark) this.countEl.textContent = '0';
      else this.countEl.textContent = '';
    }
    if (this.prevBtn) this.prevBtn.disabled = !hasResults;
    if (this.nextBtn) this.nextBtn.disabled = !hasResults;
    // Sync bar input without stealing focus
    if (this.barInputEl && this.barInputEl !== activeDocument.activeElement) {
      this.barInputEl.value = this.query;
    }
    this.updateBarKind();
    // Bar visibility is managed explicitly (openBar / closeBar / openPanel).
  }

  /** Set the bar's kind indicator to the active result's kind (hidden when there are no results). */
  private updateBarKind(): void {
    if (!this.barKindEl) return;
    const hit = this.results[this.activeIndex];
    if (!hit) {
      this.barKindEl.empty();
      this.barKindEl.hide();
      return;
    }
    this.barKindEl.show();
    setSvgIcon(this.barKindEl, KIND_ICON[hit.kind]);
    const label = t(KIND_LABEL[hit.kind]);
    this.barKindEl.setAttribute('aria-label', label);
  }

  /** Remove the amber active-hit and cyan same-section annotations from the view. Only removes the
   *  search-drawn overlays (activeOverlayCfi / secondaries) — never a real annotation, so navigating
   *  to a highlight/note result leaves its own highlight intact. */
  clearAnnotations(): void {
    if (this.activeOverlayCfi) {
      void this.ctx.foliateView?.deleteAnnotation({ value: this.activeOverlayCfi });
      this.activeOverlayCfi = null;
    }
    for (const cfi of this.secondaryAnnotations) {
      void this.ctx.foliateView?.deleteAnnotation({ value: cfi });
    }
    this.secondaryAnnotations = [];
  }

  /** Redraw the on-page search markers for the active hit's section: cyan on every OTHER book hit
   *  in that section (so the book matches stay highlighted regardless of the active result's kind),
   *  amber on the active hit when it's a book hit. Clears the previous markers first. Also called as
   *  book hits stream in, so the markers appear even when the first result was an annotation (which
   *  navigates before the book walk has collected that section's hits). */
  private drawSectionMarkers(): void {
    this.clearAnnotations();
    const hit = this.results[this.activeIndex];
    if (!hit) return;
    const secIdx = sectionIndexFromCfi(hit.cfi);
    if (secIdx !== null) {
      for (const r of this.results) {
        if (r.kind === 'book' && r.cfi !== hit.cfi && sectionIndexFromCfi(r.cfi) === secIdx) {
          void this.ctx.foliateView?.addAnnotation({ value: r.cfi, color: SEARCH_OTHER_COLOR });
          this.secondaryAnnotations.push(r.cfi);
        }
      }
    }
    if (hit.kind === 'book') {
      void this.ctx.foliateView?.addAnnotation({ value: hit.cfi, color: SEARCH_HIT_COLOR });
      this.activeOverlayCfi = hit.cfi;
    }
  }

  private clear(): void {
    this.clearAnnotations();
    this.activeCfi = null;
    this.ctx.navSuppressor.reset();
    this.pendingNavCfi = null;
    this.results = [];
    this.activeIndex = 0;
    this.lastQuery = '';
    this.updateUI();
    this.renderResults();
  }

  private goTo(idx: number): void {
    if (!this.results.length) return;
    this.ctx.debug(
      `searchGoTo(${idx}) total:${this.results.length} fv:${!!this.ctx.foliateView} loading:${this.loading}`,
      'search'
    );
    this.ctx.markUserNavigation(this.results[idx].cfi); // seek the player to the hit's sentence
    this.resultBtns[this.activeIndex]?.classList.remove('is-active'); // drawSectionMarkers() clears overlays
    this.activeIndex = idx;
    this.resultBtns[idx]?.classList.add('is-active');
    const hit = this.results[idx];
    this.ctx.debug(`searchGoTo cfi:${hit?.cfi?.slice(0, 80)}`, 'search');
    this.activeCfi = hit.cfi;
    const activeSectionIdx = sectionIndexFromCfi(hit.cfi);
    this.drawSectionMarkers();
    // Book hits flash immediately (their nav paths keep the flash). Annotation hits flash AFTER
    // navigation instead (see below), so the flash lands where the hit actually is. A bright outline
    // (not a translucent fill) so it stays visible even over an existing highlight.
    if (hit.kind === 'book') this.ctx.flashAnchor(hit.cfi, LANDING_FLASH_COLOR, true);

    const sameSection = activeSectionIdx !== null && activeSectionIdx === this.ctx.currentSectionIndex;
    if (hit.kind === 'book' && sameSection) {
      // Book hit, same section: goTo() resolves the CFI to an element-level anchor whose rect.left
      // can differ from the annotation range's rect (wrong column). Use the annotation range from
      // draw-annotation directly (tryDrawHit) — it has the correct position and scrolls to the hit's
      // page (a no-op if already on it, so no wasted re-render). addAnnotation is async, so
      // draw-annotation fires in a later microtask; setting the suppressor + pendingNavCfi here
      // (synchronous) ensures they're active when draw-annotation's scrollToAnchor executes.
      this.ctx.navSuppressor.suppressThenClearSoon();
      this.pendingNavCfi = hit.cfi;
      this.ctx.debug(
        `search-nav: same-section → annotation-range nav, idx=${idx} cfi:${hit.cfi.slice(0, 60)}`,
        'search'
      );
    } else if (hit.kind === 'book') {
      // Different section: load it via goTo, which scrolls to the CFI.
      this.ctx.navSuppressor.beginTargetNav(hit.cfi);
      this.ctx.debug(`search-nav: diff-section goTo idx=${idx} cfi:${hit.cfi.slice(0, 60)}`, 'search');
      void this.ctx.foliateView?.goTo(hit.cfi);
    } else {
      // Annotation hit. Always navigate — foliate's relocate range over-reports the visible page (a
      // next-page hit can read as "on page"), so we can't reliably skip nav. goTo is ~a no-op when
      // the hit is already visible. Flash AFTER goTo resolves so the flash survives any re-render and
      // lands on the hit's real page (a flash before the nav would be wiped by it, so an on-page
      // highlight would not flash).
      const cfi = hit.cfi;
      this.ctx.navSuppressor.beginTargetNav(cfi);
      this.ctx.debug(`search-nav: annotation goTo idx=${idx} cfi:${cfi.slice(0, 60)}`, 'search');
      void (this.ctx.foliateView?.goTo(cfi) ?? Promise.resolve()).then(() => {
        this.ctx.flashAnchor(cfi, LANDING_FLASH_COLOR, true);
      });
    }

    // Navigating/stepping dismisses any open note view (it's opened explicitly on a result click —
    // see openResult — since a full-screen view can't coexist with bar stepping, esp. on mobile).
    this.ctx.closeNoteView();

    this.updateUI();
  }

  private next(): void {
    if (!this.results.length) return;
    this.ctx.debug(`searchNext activeIndex:${this.activeIndex} total:${this.results.length}`, 'search');
    this.goTo((this.activeIndex + 1) % this.results.length);
  }

  private prev(): void {
    if (!this.results.length) return;
    this.goTo((this.activeIndex - 1 + this.results.length) % this.results.length);
  }

  private async handleEnter(): Promise<void> {
    const q = this.query.trim();
    if (!q && !this.filtersByMark) return; // nothing to search
    if (q && q === this.lastQuery && this.results.length > 0) {
      this.next();
    } else {
      await this.run();
    }
  }

  /** Build hits from the in-memory annotations (advanced-search scopes) — instant, no doc walk.
   *  With an empty query but an active mark filter (which requires an annotation scope), this is a
   *  mark-only listing: every scoped annotation carrying the chosen mark(s). */
  private collectAnnotationHits(q: string): void {
    if (!this.scope.passages && !this.scope.noteAnchors && !this.scope.noteContent) return;
    const data = this.ctx.notesData();
    // The annotation itself rather than its color: the filter is by mark identity, while the RESULT still
    // carries a color for its swatch. Both Highlight and Note satisfy this shape.
    const push = (
      text: string,
      cfi: string,
      href: string | undefined,
      kind: HitKind,
      annot?: { color?: string; markId?: string },
      noteId?: string
    ) => {
      const color = annot?.color;
      // No query = mark-only listing: every annotation qualifies (position 0), the mark decides.
      const i = q ? this.matchIndex(text ?? '') : 0;
      if (i < 0) return;
      if (!this.markMatches(annot?.markId)) return;
      // Skip annotations whose range is malformed (empty or backwards — start not strictly before
      // end). A highlight/note made from a whole-element/paragraph selection can encode its range
      // backwards, so it collapses to nothing: an un-navigable, un-flashable dead result.
      if (!isForwardRangeCfi(cfi)) return;
      const excerpt = excerptAround(text, i, q.length);
      const chapterHref = href ?? '';
      this.results.push({
        cfi,
        excerpt,
        chapterHref,
        chapterTitle: this.ctx.chapterDisplayForHref(chapterHref),
        kind,
        color,
        noteId,
      });
    };
    if (this.scope.passages) for (const h of data.highlights) push(h.text, h.cfiRange, h.chapterHref, 'passage', h);
    if (q) {
      // Text search: a note's selection and body are distinct targets, so the same note can
      // legitimately hit in both (the word appears in the passage AND in the typed note).
      if (this.scope.noteAnchors)
        for (const n of data.notes)
          if (n.selectedText) push(n.selectedText, n.cfiRange, n.chapterHref, 'note-anchor', n, n.id);
      if (this.scope.noteContent)
        for (const n of data.notes) push(n.text, n.cfiRange, n.chapterHref, 'note-content', n, n.id);
    } else if (this.scope.noteAnchors || this.scope.noteContent) {
      // Color-only: color is a property of the whole note, not the selection-vs-body split, so emit
      // ONE hit per note — prefer the selection (real book context + note-selection glyph), else the
      // note text. Avoids the double hit when both note scopes are on.
      for (const n of data.notes) {
        if (this.scope.noteAnchors && n.selectedText)
          push(n.selectedText, n.cfiRange, n.chapterHref, 'note-anchor', n, n.id);
        else if (this.scope.noteContent) push(n.text, n.cfiRange, n.chapterHref, 'note-content', n, n.id);
      }
    }
  }

  /** Sort results into document (CFI) order so book + annotation hits interleave correctly and
   *  group cleanly by chapter; re-anchor activeIndex to the currently-active hit afterwards. */
  private sortResults(): void {
    this.results.sort((a, b) => {
      try {
        return cfiCompare(cfiCollapse(a.cfi, false), cfiCollapse(b.cfi, false));
      } catch {
        return 0;
      }
    });
    if (this.activeCfi) {
      const i = this.results.findIndex((r) => r.cfi === this.activeCfi);
      if (i >= 0) this.activeIndex = i;
    }
  }

  private async run(): Promise<void> {
    const q = this.query.trim();
    // A color filter makes an empty query meaningful (list all annotations of that color); an
    // empty query with no filter has nothing to search.
    const filterOnly = !q && this.filtersByMark;
    if ((!q && !filterOnly) || !this.ctx.foliateView || !this.ctx.bookSections.length) return;
    this.clearAnnotations();
    this.results = [];
    this.activeIndex = 0;
    this.loading = this.scope.bookText && !!q; // only a text search walks the book (async/streamed)
    this.lastQuery = q;

    // Annotation scopes are instant (in-memory) — collect + show them before the book walk.
    this.collectAnnotationHits(q);
    this.sortResults();
    this.updateUI();
    this.renderResults();
    this.ctx.debug(
      `search start "${q}" sections:${this.ctx.bookSections.length} scope:${JSON.stringify(this.scope)}`,
      'search'
    );

    let navigated = false;
    if (!this.scope.bookText || !q) {
      // Nothing is still coming, so the first result is the first in reading order now. With book text in the
      // search it waits for the walk — see `firstResultSettled`.
      if (this.results.length > 0) this.goTo(0);
      this.loading = false;
      this.sortResults();
      this.renderResults();
      this.updateUI();
      return;
    }

    const sections = this.ctx.bookSections as unknown as RawSection[];

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];
      this.ctx.debug(`search s${sIdx}: hasCreateDoc=${!!section.createDocument}`, 'search');
      if (!section.createDocument) continue;
      try {
        this.ctx.debug(`search s${sIdx}: chapterForSection start`, 'search');
        // Disambiguated label for display + unique href for grouping — "CHAPTER II" repeats across
        // Parts, so grouping by the label alone merged hits from different Parts (see notes-export).
        const chapterTitle = this.ctx.chapterDisplayForSection(sIdx);
        // The section's OWN href, never the proportional guess — a guessed href is shared by every section that
        // guessed the same way, and grouping by it puts hits from different chapters under one heading. Where
        // the contents page claims nothing, this section is its own group: `section:12` collides with nothing.
        const chapterHref = this.ctx.exactHrefForSection(sIdx) || `section:${sIdx}`;
        this.ctx.debug(`search s${sIdx}: createDocument start`, 'search');
        const doc = await section.createDocument();
        this.ctx.debug(`search s${sIdx}: doc ready body=${!!doc?.body}`, 'search');
        const baseCFI = section.cfi ?? cfiFake.fromIndex(sIdx);
        // Each match is headed by the contents entry it falls under, not by the file it is in — see `entryAt`.
        const entries = this.ctx.contentsEntriesInSection(sIdx);
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode()) !== null) {
          const text = (node as Text).textContent ?? '';
          let pos = 0;
          let idx: number;
          while ((idx = this.matchIndex(text, pos)) >= 0) {
            try {
              const range = doc.createRange();
              range.setStart(node, idx);
              range.setEnd(node, idx + q.length);
              const cfi = cfiJoinIndir(baseCFI, cfiFromRange(range));
              const excerpt = excerptAround(text, idx, q.length);
              const entry = entries.length ? entryAt(doc, node, idx, entries) : null;
              this.results.push({
                cfi,
                excerpt,
                chapterTitle: entry?.label ?? chapterTitle,
                chapterHref: entry?.href ?? chapterHref,
                kind: 'book',
              });
            } catch {
              /* skip this match */
            }
            pos = idx + q.length;
          }
        }
        section.unload?.();
        this.ctx.debug(`search s${sIdx}: done hits=${this.results.length}`, 'search');
        this.sortResults(); // keep book + annotation hits in document order as sections stream in
        if (!navigated && firstResultSettled(this.results, sIdx)) {
          navigated = true;
          this.renderResults();
          this.goTo(0);
        } else {
          // If we already navigated and this section holds the active hit, its book markers just became
          // available — draw them without re-navigating.
          if (this.activeCfi && sectionIndexFromCfi(this.activeCfi) === sIdx) this.drawSectionMarkers();
          this.renderResults();
          this.updateUI();
        }
      } catch (e) {
        this.ctx.debug(`search s${sIdx}: ERROR ${String(e)}`, 'search');
      }
    }

    this.loading = false;
    this.ctx.debug(`search done "${q}" hits:${this.results.length}`, 'search');
    this.sortResults();
    this.renderResults();
    // A first result whose section never finished — unreadable, or skipped — is settled now the walk is over.
    if (!navigated && this.results.length > 0) this.goTo(0);
    this.updateUI();
  }

  private renderResults(): void {
    if (!this.resultsEl) return;
    this.resultsEl.empty();

    if (this.loading && !this.results.length) {
      this.resultsEl.createDiv({ cls: 'orbis-saved-empty', text: t('search_tab.searching') });
      return;
    }

    if (!this.results.length) {
      if (this.lastQuery) {
        this.resultsEl.createDiv({ cls: 'orbis-saved-empty', text: t('search_tab.no_results_found') });
      }
      return;
    }

    // Group by unique chapter identity (href), preserving order — NOT by the label, which repeats
    // across Parts and would merge e.g. Part I / Part II "CHAPTER III" into one group. The header
    // shows the disambiguated chapterTitle.
    const grouped: { chapter: string; hits: SearchHit[] }[] = [];
    const chapterIndex = new Map<string, number>();
    for (const hit of this.results) {
      const key = hit.chapterHref || hit.chapterTitle;
      if (!chapterIndex.has(key)) {
        chapterIndex.set(key, grouped.length);
        grouped.push({ chapter: hit.chapterTitle, hits: [] });
      }
      grouped[chapterIndex.get(key)!].hits.push(hit);
    }

    this.resultBtns = [];
    let globalIdx = 0;
    for (const { chapter, hits } of grouped) {
      if (chapter) {
        this.resultsEl.createDiv({ cls: 'orbis-saved-chapter-hdr', text: `${chapter} (${hits.length})` });
      }
      for (const hit of hits) {
        const idx = globalIdx++;
        const btn = this.resultsEl.createEl('button', { cls: 'orbis-search-result' });
        // Kind indicator (advanced search) — the same glyph used in the Advanced modal and the bar,
        // tinted with the annotation's color, plus a short label. Book hits get no badge.
        if (hit.kind !== 'book') {
          const label = KIND_LABEL[hit.kind];
          const kindEl = btn.createSpan({ cls: `orbis-search-kind orbis-search-kind--${hit.kind}` });
          const glyph = kindEl.createSpan({ cls: 'orbis-search-kind-glyph' });
          setSvgIcon(glyph, KIND_ICON[hit.kind]);
          if (hit.color) glyph.style.color = hit.color;
          kindEl.createSpan({ cls: 'orbis-search-kind-label', text: t(label) });
          btn.setAttribute('aria-label', `${t(label)}: ${hit.excerpt}`);
        }
        // Highlight matching term in excerpt
        const q = this.lastQuery;
        const text = hit.excerpt;
        const exc = btn.createSpan({ cls: 'orbis-search-excerpt' });
        const hay = this.caseSensitive ? text : text.toLowerCase();
        const ndl = this.caseSensitive ? q : q.toLowerCase();
        const qi = q ? hay.indexOf(ndl) : -1;
        if (qi >= 0) {
          if (qi > 0) exc.appendText(text.slice(0, qi));
          const mark = exc.createEl('mark', { cls: 'orbis-search-mark' });
          mark.textContent = text.slice(qi, qi + q.length);
          exc.appendText(text.slice(qi + q.length));
        } else {
          exc.textContent = text;
        }
        if (idx === this.activeIndex) btn.classList.add('is-active');
        btn.addEventListener('click', () => {
          this.goTo(idx); // navigates + flashes + closes any prior note view
          this.ctx.closePanel();
          // The field on a desktop, where Up and Down in it step on through the results; the next-result button on a
          // touch device, so the on-screen keyboard does not come up over the result just reached.
          this.openBar(!Platform.isMobile);
          // #6: opening a note result shows the note itself with the matched text marked — so a
          // note-text hit (whose match isn't in the book) is readable.
          const clicked = this.results[idx];
          if ((clicked.kind === 'note-anchor' || clicked.kind === 'note-content') && clicked.noteId) {
            this.ctx.openNoteView(clicked.noteId, { highlight: this.lastQuery });
          }
        });
        this.resultBtns.push(btn);
      }
    }

    if (this.loading) {
      this.resultsEl.createDiv({ cls: 'orbis-saved-empty', text: t('search_tab.searching_for_more') });
    }
  }

  // ── Foliate overlay-event hooks (called from the view's handlers) ─────────

  /** Re-add the search highlights when a section's overlayer is (re)created. */
  reapplyAnnotations(view: FoliateViewEl): void {
    for (const cfi of this.secondaryAnnotations) {
      void view.addAnnotation({ value: cfi, color: SEARCH_OTHER_COLOR });
    }
    if (this.activeOverlayCfi) {
      void view.addAnnotation({ value: this.activeOverlayCfi, color: SEARCH_HIT_COLOR });
    }
  }

  /**
   * If `d` is the pending same-section search hit, scroll to it and draw it.
   * Returns true when it handled the draw (so the view's default draw is skipped).
   */
  tryDrawHit(d: DrawDetail): boolean {
    if (
      this.pendingNavCfi === null ||
      d.annotation.value !== this.pendingNavCfi ||
      d.annotation.color !== SEARCH_HIT_COLOR ||
      !d.range
    ) {
      return false;
    }
    // Same-section search navigation: scroll to the page containing this annotation.
    // Skip if already on the correct page (annotation added in same-section refresh).
    this.pendingNavCfi = null;
    const rendererEx = this.ctx.foliateView?.renderer as unknown as {
      scrollToAnchor?: (anchor: unknown, select?: boolean) => Promise<void>;
      containerPosition?: number;
      size?: number;
    };
    const sz = rendererEx?.size ?? 0;
    if (sz > 0 && rendererEx?.scrollToAnchor) {
      const cp = rendererEx.containerPosition ?? -1;
      const rect = Array.from(d.range.getClientRects()).find((r) => r.width > 0 && r.height > 0);
      const tgt = rect ? Math.floor((rect.left + 0.5) / sz) + 1 : -1;
      const cur = Math.round(cp / sz);
      if (tgt > 0 && tgt !== cur) {
        void rendererEx.scrollToAnchor(d.range, false);
      }
    }
    d.draw(Overlayer.highlight, { color: SEARCH_HIT_COLOR });
    return true;
  }

  /** Reset all per-book search state and DOM handles on book close. */
  dispose(): void {
    // **Advanced search lasts as long as the book**, so a book closing takes it too. This controller outlives the
    // book — the same one serves the next book opened in the tab — and a mark filter carried over names marks the
    // next book may not have, so its searches would come back empty with nothing on screen to say why.
    this.scope = { ...DEFAULT_SCOPE };
    this.markFilter = new Set();
    this.caseSensitive = false;
    this.wholeWord = false;
    this.results = [];
    this.activeIndex = 0;
    this.loading = false;
    this.query = '';
    this.lastQuery = '';
    this.activeCfi = null;
    this.activeOverlayCfi = null;
    this.secondaryAnnotations = [];
    this.pendingNavCfi = null;
    this.toolbarBtn = null;
    this.bar?.dispose();
    this.bar = null;
    this.barEl_ = null;
    this.barInputEl = null;
    this.panelInputEl = null;
    this.advBtns = [];
    this.resultsEl = null;
    this.countEl = null;
    this.prevBtn = null;
    this.nextBtn = null;
    this.resultBtns = [];
  }
}
