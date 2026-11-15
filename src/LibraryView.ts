// The Library view: a catalog of what you have, whether or not it is in the vault.
//
// Full design: docs/design/library.md. Collections and records, dashboards of widgets, and two ways to show a set
// of titles: a list of rows and a grid of covers.
//
// **It opens in the main window, not a sidebar.** A cover grid and a filter row want width, and on a phone the
// sidebar is a drawer that closes the moment you tap something in it. A user who prefers it docked can still drag
// the tab there.
//
// **The index is `metadataCache`.** Every note's frontmatter and tags are already parsed and in memory, so a
// rebuild reads no files and can simply be re-run when the vault changes. That is why there is no cache to
// invalidate here and no database anywhere.

import { type CachedMetadata, ItemView, Menu, Notice, setIcon, TFile, type WorkspaceLeaf } from 'obsidian';
import { openBookDataFile } from './book-data-file';
import { isBookExtension } from './book-formats';
import { openCatalogReview } from './CatalogModal';
import { deviceSetting, setDeviceSetting } from './device-settings';
import { t } from './i18n';
import {
  arrangeRecords,
  effectiveValues,
  GROUP_NONE,
  type GroupKey,
  labelOf,
  noneLabelKey,
  orderGroups,
  type RecordGroup,
  type SortSpec,
  sortRecords,
  withEmptyGroups,
} from './library/arrange';
import { type BookState, bookStateFor, buildBookStates } from './library/book-state';
import { libraryNotes, vaultCandidates } from './library/candidates';
import { type Capabilities, capabilitiesOf } from './library/capabilities';
import { buildCatalog, type Catalog } from './library/catalog';
import { uncatalogedBooks } from './library/cataloging';
import { statusChoices } from './library/choices';
import { speciesOf } from './library/collection-species';
import {
  activeDashboard,
  enabledDashboards,
  expandLabelKey,
  visibleWidgets,
  widgetCanExpand,
  widgetShown,
  widgetSlice,
  widgetTakesArrangement,
} from './library/dashboard';
import { readActiveDashboard, readDashboardOrder, writeActiveDashboard } from './library/dashboard-place';
import { leftoversKeyFor, type TimeFrame } from './library/dates';
import {
  changedKeys,
  collectionsDependOn,
  DISPLAYED_FIELDS,
  widgetPoolFields,
  widgetsDisplay,
} from './library/depends';
import { DEFAULT_DISPLAY_FIELDS, fieldCells, fieldHeading, metaLineFor, sortedByField } from './library/display-fields';
import { fieldValuesFor, libraryFields } from './library/fields';
import { renderGeneratedCover } from './library/generated-cover';
import { namedKeyLabel } from './library/keys';
import { pickable, pickTitles } from './library/pick';
import { nextRating, OFFERED_RATINGS, setRating } from './library/rating';
import { type LibraryRecord, linkTarget, parseRecord, type ReadingRecord, type ReadingStatus } from './library/record';
import { arrangeReadingRecords, recentReadingRecords, sortReadingRecords } from './library/record-arrange';
import { clampToWords, DEFAULT_RECORD_FIELDS, recordCells, recordHeadline, recordMetaLine } from './library/record-row';
import { resolveRecordFile } from './library/resolve';
import { searchReadingRecords, searchRecords } from './library/search';
import { nextStatus, setReadingStatus } from './library/status';
import { type PrimaryAction, primaryActionFor } from './library/tile';
import { shouldAlert, uncatalogedSignature } from './library/uncataloged';
import { widgetHeading } from './library/widget-heading';
import { openBookAt, openBookForReading, startListeningTo } from './OrbisReaderView';
import { openNoteBeside } from './panes';
import { DebugLog } from './reader/DebugLog';
import type {
  DashboardWidget,
  DebugCategory,
  IOrbisReaderPlugin,
  LibraryCollection,
  LibraryViewType,
  NoteSpecies,
} from './settings';
import { captureFocus, guardDragSwipe, onActivate } from './ui-utils';
import { VIEW_TYPE_ORBIS_LIBRARY } from './view-types';

export { VIEW_TYPE_ORBIS_LIBRARY };

/**
 * What a heading says about how many titles are underneath it.
 *
 * **A bare total next to a short list is a lie by omission**: "2,000 titles" above fifteen rows reads as a list that
 * failed rather than a list that was cut. Saying both numbers is what makes the cut visible, and it makes the button
 * beside it legible too — you can see what Show all is going to show you.
 *
 * Digits are grouped, because four figures unbroken take a moment to read and the number is here to be read at a
 * glance.
 */
function groupCountText(total: number, shown: number): string {
  if (shown < total) {
    return t('library.count_showing_groups', { shown: shown.toLocaleString(), count: total.toLocaleString() });
  }
  return total === 1 ? t('library.count_groups_one') : t('library.count_groups', { count: total.toLocaleString() });
}

/**
 * Where a second menu should open, read from the gesture that asked for it.
 *
 * **Read synchronously**, because the menu it belongs to opens a tick later and the event is spent by then. A
 * keyboard activation carries no coordinates, so the item's own box stands in — the menu then appears under the
 * item that was chosen rather than in the corner of the screen.
 */
/**
 * How long to wait before opening the second step of a menu.
 *
 * Long enough to outlast the parent's own teardown — at 0ms the dismissal that follows the click reaches the new menu
 * and closes it — and short enough that the two steps read as one gesture.
 */
const MENU_STEP_MS = 60;

function menuPointOf(event: MouseEvent | KeyboardEvent): { x: number; y: number } {
  // **Duck-typed, never `instanceof`.** Obsidian's menus can be built in another window — a popout, or simply a
  // different document context — and that window's `MouseEvent` is a different constructor from this one's, so `event
  // instanceof MouseEvent` answers false for an ordinary click. The point would fall through to the keyboard branch and
  // the menu open at 0,0, and a menu in the far corner of the screen reads as nothing having happened.
  const pointer = event as Partial<MouseEvent>;
  // 0,0 counts as "no coordinates": a synthesised click reports it, and the top-left corner of the screen is never
  // where anyone pointed.
  if (typeof pointer.clientX === 'number' && (pointer.clientX !== 0 || pointer.clientY !== 0)) {
    return { x: pointer.clientX, y: pointer.clientY ?? 0 };
  }
  // A keyboard activation carries no coordinates, so the item's own box stands in.
  const box = (event.target as HTMLElement | null)?.getBoundingClientRect();
  return box ? { x: box.left, y: box.bottom } : { x: 0, y: 0 };
}

function countText(total: number, shown: number): string {
  if (shown < total) {
    return t('library.count_showing', { shown: shown.toLocaleString(), count: total.toLocaleString() });
  }
  return total === 1 ? t('library.count_one') : t('library.count', { count: total.toLocaleString() });
}

/**
 * The same, counting reading records.
 *
 * **A count has to stand on its own.** This line sits under a heading that is the collection's name — "Sandershelf
 * highlights", "Marked in July" — so "29 titles" under a list of passages is not a small imprecision, it is the
 * only word on screen saying what was counted, and it says the wrong one.
 */
function recordCountText(total: number, shown: number): string {
  if (shown < total) {
    return t('library.count_showing', { shown: shown.toLocaleString(), count: total.toLocaleString() });
  }
  return total === 1 ? t('library.count_records_one') : t('library.count_records', { count: total.toLocaleString() });
}

/**
 * How much of a passage a table column shows.
 *
 * Enough to recognize which highlight it is — the opening clause is what anyone reads to know that — and short
 * enough that the column stays a column. The rest is a hover away, and the row opens the book at the passage
 * itself, which is the real way to read it.
 */
const PASSAGE_COLUMN_CHARS = 120;

/**
 * How one species is drawn in a table.
 *
 * **The table's rules are the same for both; only the reading differs** — the same seam the arranger got, for the
 * same reason. Which column leads, that it is the only one that acts, that a heading tap sorts transiently and
 * within each group, that the `⋯` at the far end opens the row's own menu: none of that is about titles. What is
 * species-specific is what the leading column says, which cells answer a key, and what a tap does.
 */
interface TableSpec<T> {
  /** The key the leading column sorts by — `title` for a book, the passage for a record. */
  leadKey: string;
  leadHeading: string;
  leadText(record: T): string;
  /**
   * How many characters of the leading column to draw, with the whole of it on hover.
   *
   * For a passage, which runs to two hundred: drawn whole, every row is a different height and the table becomes a
   * wall of prose you cannot scan down — and the column grows to fit the longest one, since a table cell in auto
   * layout ignores `max-width`. A title is a few words, so it is drawn as it is.
   */
  leadClamp?: number;
  /** The fields shown when the widget has not chosen any. */
  defaultFields: readonly string[];
  cells(record: T, key: string): string[];
  activate(record: T): void;
  menu(record: T, event: MouseEvent): void;
  /** Fill a cell some other way — a cover is a picture, not a word. True when it handled the cell. */
  renderCell?(cell: HTMLElement, record: T, key: string): boolean;
}

export class LibraryView extends ItemView {
  private readonly plugin: IOrbisReaderPlugin;
  /** Set while a repaint is already queued, so a burst of vault events paints once. */
  private repaintQueued = false;
  /** Per-book sidecar state for this paint, built once in `render()`. */
  private states = new Map<string, BookState>();
  /** The widget whose expanded view is showing, or null for the dashboard itself. */
  private expanded: string | null = null;
  /**
   * The summary category being looked at, or null.
   *
   * **Back needs no memory of where you came from**, because `expanded` still holds it: tap a category on the
   * dashboard and nothing was expanded, so clearing this lands on the dashboard; tap one from the expanded list
   * of categories and that expansion is still set, so clearing this lands back on the list. Browsing a summary is
   * "5 reading, back, 10 interested", and it falls out rather than being arranged.
   */
  private drill: { widget: string; group: string } | null = null;
  /** Which page the last paint drew, so a repaint of the SAME page can keep its scroll position. */
  private paintedExpanded: string | null = null;
  /** The seed behind the suggestion. Random per view, and re-rolled on request — see `pickTitles`. */
  private pickSeed = Math.floor(Math.random() * 0x7fffffff);
  /** What is in the search box. Held on the view, not in settings: a search is where you are, not what you keep. */
  private searchQuery = '';
  /** When a record menu last closed — see the click guard in `wireMenuGesture`. */
  private menuClosedAt = 0;
  /** The frontmatter each note had when it was last seen, so a change can say WHAT changed. See `onNoteChanged`. */
  private readonly seenFrontmatter = new Map<string, Record<string, unknown> | null>();
  /** Whether the vault has finished indexing once — see the `resolved` handler. */
  private warmed = false;
  /**
   * The same debug panel the reader has, on the same chip.
   *
   * TEMPORARY while the iPad menu behavior is being tracked down — a flash on every choice, and the row beneath the
   * menu taking focus. It records what actually happens where it can be read on a tablet with no console attached.
   */
  private readonly debugLog = new DebugLog(this.app);
  /**
   * A table's heading sort, per widget, for as long as the view is open.
   *
   * On the view rather than in settings: the collection owns the order, and a heading tapped while reading is a
   * way of looking rather than a change to the widget. Lost on close, which is the point.
   */
  private readonly tableSort = new Map<string, { key: string; desc: boolean }>();
  /** The title notes this paint parsed, so nothing walks the vault twice for them. Null before the first paint. */
  private paintedTitles: LibraryRecord[] | null = null;
  /** A catalog run is in flight; a second must not start beside it and write the same paths. */
  private cataloging = false;
  private cancelCataloging = false;

  constructor(leaf: WorkspaceLeaf, plugin: IOrbisReaderPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_ORBIS_LIBRARY;
  }

  getDisplayText(): string {
    return t('library.title');
  }

  getIcon(): string {
    return 'library';
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('orbis-library');
    // Frontmatter is the store, so a metadata change IS a record change — including one made in the Properties
    // editor or by someone's script, which is the point of building on notes. `resolved` covers the initial
    // cache warm-up on a cold start, when the view can open before the vault has been indexed.
    this.registerEvent(this.app.metadataCache.on('changed', (file, _data, cache) => this.onNoteChanged(file, cache)));
    // `resolved` fires whenever the cache finishes a batch, INCLUDING one we just caused — so repainting on it would
    // repaint for every change `changed` has already decided to skip. It is here for the cold start, when the view can
    // open before the vault is indexed, and that is a thing that happens once.
    this.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        if (this.warmed) return;
        this.warmed = true;
        this.queueRepaint();
      })
    );
    this.registerEvent(this.app.vault.on('delete', () => this.queueRepaint()));
    this.registerEvent(this.app.vault.on('rename', () => this.queueRepaint()));
    this.render();
  }

  /**
   * A note changed: repaint, unless nothing on screen could be reading what changed about it.
   *
   * **The Library repaints on every metadata event, and that is right** — frontmatter is the store, so a note changing
   * IS a record changing. But a repaint rebuilds every row and every cover, and setting a reading status from the row
   * menu would produce one for a field no visible widget uses: a flash on a tablet in exchange for nothing on screen.
   *
   * So the changed keys are compared against what the dashboard's collections mention and what a row draws.
   * Conservative in both directions: an unreadable cache, a note nobody has seen before, or a key nobody
   * recognizes all repaint. The only thing skipped is a change we can name and nothing can be reading.
   */
  private onNoteChanged(file: TFile, cache: CachedMetadata | null): void {
    const before = this.seenFrontmatter.get(file.path);
    const after = cache?.frontmatter ?? null;
    this.seenFrontmatter.set(file.path, after);
    if (!before || !after) return this.queueRepaint();

    const changed = changedKeys(before, after);
    if (changed.length === 0) return this.queueRepaint(); // tags, links, headings — not ours to reason about
    const matters = changed.some(
      (key) =>
        DISPLAYED_FIELDS.includes(key) ||
        widgetsDisplay(this.fieldsOnScreen(), key) ||
        collectionsDependOn(this.collectionsOnScreen(), key)
    );
    if (matters) return this.queueRepaint();
    this.dbg(`skip repaint: ${changed.join(',')}`);
  }

  /** What the note says its status is right now, whatever the painted record was carrying. */
  private currentStatus(record: LibraryRecord): ReadingStatus | null {
    const note = this.app.vault.getAbstractFileByPath(record.notePath);
    if (!(note instanceof TFile)) return record.status;
    const fm = this.app.metadataCache.getFileCache(note)?.frontmatter;
    const fresh = parseRecord(record.notePath, fm);
    // A `null` status from a note we could read means "none", which is an answer: falling back to the painted
    // record there would put the tick back on the status that was just cleared.
    return fresh ? fresh.status : record.status;
  }

  /**
   * The fields the widgets on screen read — the ones they were told to show, and the ones they filter on.
   *
   * A widget that chose none is not represented here: its defaults are authors and series for a title and the book
   * and chapter for a record, all of which the static list already covers. What is not optional is
   * `widgetPoolFields`: a pick filtering on reading status has to repaint when a status changes even though nothing
   * on the dashboard displays one.
   */
  private fieldsOnScreen(): string[] {
    const dashboard = activeDashboard(
      this.plugin.settings.libraryDashboards,
      readActiveDashboard(),
      readDashboardOrder()
    );
    return visibleWidgets(dashboard).flatMap((widget) => [...(widget.fields ?? []), ...widgetPoolFields(widget)]);
  }

  /**
   * The collections the visible dashboard actually draws from.
   *
   * **What is on screen, not what exists.** Asking every collection in settings would let a collection left on a
   * dashboard nobody has open force a repaint — a status change would rebuild the default dashboard because some other
   * dashboard groups by status. A widget that is switched off, or on a dashboard that is not showing, is not something
   * the view can be wrong about.
   */
  private collectionsOnScreen(): LibraryCollection[] {
    const settings = this.plugin.settings;
    const dashboard = activeDashboard(settings.libraryDashboards, readActiveDashboard(), readDashboardOrder());
    const shown = visibleWidgets(dashboard).filter((widget) => !this.expanded || widget.id === this.expanded);
    const ids = new Set(shown.map((widget) => widget.collection));
    return settings.libraryCollections.filter((collection) => ids.has(collection.id));
  }

  /**
   * Repaint after the current burst of events, not once per event: renaming a folder fires one per file.
   *
   * **Never while the search box has focus.** A repaint rebuilds the box, and a box rebuilt under a moving cursor
   * loses the caret and eats the keystroke that arrives next. Cataloging a book writes a note per title, so this
   * is not hypothetical — a background catalog run would otherwise fight whoever is typing. The repaint is not
   * dropped, only deferred until they stop.
   */
  private queueRepaint(delay = 120): void {
    this.dbg('queue');
    if (this.repaintQueued) return;
    this.repaintQueued = true;
    window.setTimeout(() => {
      this.repaintQueued = false;
      const active = activeDocument.activeElement;
      if (active?.instanceOf(HTMLElement) && active.hasClass('orbis-library-search')) {
        this.queueRepaint(1000);
        return;
      }
      if (this.contentEl.isShown()) this.render();
    }, delay);
  }

  /** One line in the debug panel. TEMPORARY — see `debugLog`. */
  private dbg(tag: string): void {
    this.debugLog.add(tag, 'library');
  }

  /** One line in this dashboard's debug panel, from outside the view — see `logToLibrary`. */
  log(msg: string, category: DebugCategory = 'library'): void {
    this.debugLog.add(msg, category);
  }

  /** Called by the plugin when settings change, since collections live in settings. */
  refresh(): void {
    this.render();
  }

  /**
   * Paint the active dashboard, or one widget expanded.
   *
   * **The order of the page is data, not code.** Continue, then every collection, then uncataloged, is the system
   * dashboard's widget list — so the same painting code serves a dashboard someone built themselves, and removing
   * Rummage is a matter of disabling a widget rather than of us providing a setting for it.
   */
  private render(): void {
    const { contentEl } = this;
    // Emptying the scroller sends it back to the top, and this view repaints for reasons that have nothing to do
    // with the reader: a vault event, a settings change, Pick another. Landing back at the top of a dashboard you
    // had scrolled halfway down is the whole page moving under a finger that only pressed one button. Kept unless
    // the page itself changed — opening or leaving an expanded widget IS a new page, and starts at its top.
    const samePage = this.paintedExpanded === this.pageKey();
    const scrollTop = samePage ? contentEl.scrollTop : 0;
    this.paintedExpanded = this.pageKey();
    // **Built offscreen, then swapped in.** Emptying the view and filling it again leaves a frame with nothing in it:
    // imperceptible on a desktop, a visible flash on a tablet — and this view repaints whenever the vault changes, so
    // every status set from the menu would produce one.
    /**
     * **The keyboard survives the swap.** This view repaints itself on every vault change, and one of its own controls
     * asks for a repaint: switching dashboard rebuilds the page, which destroys the dropdown that did the switching —
     * so tabbing to it and choosing would drop focus to the document, where Tab walks the app behind the view.
     * `captureFocus` rather than `rebuildKeepingFocus` because the scroll is already handled here, with a rule of its
     * own about which repaints keep it (see `samePage` above) that the shared helper would override.
     */
    const restoreFocus = captureFocus(contentEl);
    const staging = createDiv();
    // Timed, because this pass walks the whole vault and runs on every vault change — see `paintPage`.
    const started = performance.now();
    this.paintPage(staging);
    this.dbg(
      `render — ${this.app.vault.getFiles().length} files, painted in ${Math.round(performance.now() - started)} ms`
    );
    contentEl.empty();
    contentEl.append(...Array.from(staging.children));
    // **On the view's root, not on the scrolling content.** An overlay absolutely positioned inside a scroller is sized
    // to the whole scrollable page and scrolls away with it — and `.orbis-library` is not positioned at all, so `inset:
    // 0` would escape to whichever ancestor is, which on Android is bigger than the view: the panel would sit over the
    // status bar with its Close button past the right edge. The leaf's own container is positioned and does not scroll.
    // Both calls remove any previous copy, so a repaint replaces rather than stacks.
    this.debugLog.buildPanel(this.containerEl);
    this.debugLog.buildChip(this.containerEl);
    // Anything the plugin logged while no dashboard was open — the deletes and conversions this panel exists to
    // explain all happen with the library closed. Empty on every paint after the first.
    // Set after painting, and synchronously: the page is fully built by now, and a taller-or-shorter page clamps
    // this itself. Covers reserve their space through `aspect-ratio`, so a lazily loaded image cannot shift it.
    contentEl.scrollTop = scrollTop;
    // After the scroll, never before: `focus()` scrolls its element into view when it has to, and putting the old
    // position back afterwards would undo that. Same ordering rule as `keepScroll`.
    restoreFocus();
  }

  private paintPage(contentEl: HTMLElement): void {
    const collections = this.plugin.settings.libraryCollections;
    // **One walk of the vault per paint, both species.** The candidates, the titles and the reading records all come
    // from the same pass — see `libraryNotes`.
    const { candidates, titles } = libraryNotes(this.app);
    this.paintedTitles = titles;
    // The baseline every later change is compared against. Taken here rather than lazily, because otherwise a note's
    // FIRST change has nothing to compare with and so always repaints — which is every change that matters in practice.
    for (const note of candidates) this.seenFrontmatter.set(note.path, note.frontmatter);
    const catalog = buildCatalog(collections, candidates);
    // Built once per paint and shared by every row: one pass over the file list answers "started, when, recorded,
    // has data" for the whole vault, and doing it per row would be that pass per record.
    this.states = buildBookStates(this.app.vault.getFiles().map((f) => ({ path: f.path, mtime: f.stat.mtime })));

    const dashboard = activeDashboard(
      this.plugin.settings.libraryDashboards,
      readActiveDashboard(),
      readDashboardOrder()
    );
    const widgets = visibleWidgets(dashboard);

    // A category page paints only while its category still exists. When the last title in it changes status the group
    // is gone, and the answer is the summary it came from — reached by falling THROUGH to it here rather than by
    // re-rendering: `render` builds the page offscreen and swaps it in, so a second `render` started from inside the
    // first has its work discarded by the outer swap, and the tab goes blank.
    if (this.drill) {
      const widget = widgets.find((w) => w.id === this.drill?.widget);
      if (widget && this.renderDrill(contentEl, widget, catalog, this.drill.group)) return;
      this.drill = null;
    }
    if (this.expanded) {
      const widget = widgets.find((w) => w.id === this.expanded);
      if (widget) {
        this.renderExpanded(contentEl, widget, catalog);
        return;
      }
      // The widget was disabled or deleted while expanded — fall back to the dashboard rather than to a blank page.
      this.expanded = null;
    }

    this.renderHeader(contentEl, catalog);
    // Above the widgets, because it is about the library rather than part of it — and cheap: the uncataloged set is
    // the vault's book files minus the ones records link, which is a set difference rather than a metadata read.
    this.renderUncatalogedAlert(contentEl, uncatalogedBooks(this.app, this.allRecords()));
    if (widgets.length === 0) {
      contentEl.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.no_widgets') });
      return;
    }
    for (const widget of widgets) this.renderWidget(contentEl, widget, catalog);
  }

  /** One widget on the dashboard: its heading, its titles, and a way to see the rest when it holds more. */
  private renderWidget(parent: HTMLElement, widget: DashboardWidget, catalog: Catalog): void {
    // **Which species a widget draws is its collection's, not a field of its own.** One source of truth, so a
    // widget repointed at the other species cannot be left claiming to draw something it no longer does.
    if (this.speciesOf(widget) === 'reading_record') {
      this.renderRecordWidget(parent, widget, catalog, false);
      return;
    }
    if (widget.kind === 'search') {
      this.renderSearch(parent, widget, catalog);
      return;
    }
    if (widget.kind === 'summary') {
      this.renderSummary(parent, widget, catalog, false);
      return;
    }
    const records = this.recordsFor(widget, catalog);
    if (records === null) {
      // Deleted is different from switched off: a widget pointing at nothing says so, because the fix is to point
      // it somewhere or to remove it, and silence would leave someone hunting for a section that never appears.
      const section = parent.createDiv({ cls: 'orbis-library-collection' });
      section.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
      section.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_missing') });
      return;
    }
    // **Sorted before it is cut.** `count` means "the first ten of this collection", and the collection decides what
    // first means — so slicing an unsorted pool would show ten arbitrary records and then order those ten. That looks
    // right at a glance and is wrong in the way that matters: a shelf of "series number at least 3" would open on ten
    // titles that all began with "1", because the pool arrives in path order.
    //
    // A kind that IS an ordering does its own — Continue is already newest-first, a pick is already chosen — so
    // this applies to the kinds that take the collection's arrangement.
    const shown = widgetShown(records, widget, (items) => this.sortedFor(widget, items));
    this.renderSection(parent, this.labelFor(widget), records.length, shown, {
      // A kind that IS an ordering ignores the collection's — see `widgetTakesArrangement`.
      arrange: widgetTakesArrangement(widget) ? this.collectionOf(widget) : null,
      more: widgetCanExpand(records.length, widget) ? () => this.expand(widget) : null,
      moreLabel: t(expandLabelKey(widget)),
      // A suggestion you cannot decline is not a suggestion.
      action:
        widget.kind === 'pick'
          ? {
              label: t('library.pick_again'),
              run: () => {
                this.pickSeed = Math.floor(Math.random() * 0x7fffffff);
                this.render();
              },
            }
          : null,
      view: widget.view,
      expanded: false,
      primary: this.primaryFor(widget),
      fields: widget.fields,
      widgetId: widget.id,
    });
  }

  /**
   * A summary: one row per group, with its count, and a way into each.
   *
   * **The grouping is the collection's, not the widget's.** Every other kind takes its arrangement from the
   * collection and this one is no exception — which means one collection grouped two ways is two collections,
   * and a collection that groups by nothing summarizes to a single row saying how much of it there is. That row
   * is still worth having, and still opens.
   *
   * `count` means what it means everywhere else: how many rows are on the dashboard, with the rest behind the
   * expand. What it does NOT do is limit the page you land on — having asked for one category, you want all of
   * it.
   */
  private renderSummary(parent: HTMLElement, widget: DashboardWidget, catalog: Catalog, expanded: boolean): void {
    const section = parent.createDiv({ cls: 'orbis-library-collection' });
    const records = this.recordsFor(widget, catalog);
    if (records === null) {
      section.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
      section.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_missing') });
      return;
    }
    const groups = this.summaryGroups(widget, records);
    const shown = expanded ? groups : widgetSlice(groups, widget);

    const head = section.createDiv({ cls: 'orbis-library-collection-head' });
    head.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
    // Its own count, because a summary's rows are not titles: "5 titles" over five categories holding eight
    // books between them is wrong twice over, and the number beside a heading is read as describing what is
    // under it.
    head.createDiv({ cls: 'orbis-library-collection-count', text: groupCountText(groups.length, shown.length) });
    // Expansion here is about ROWS, not about a different view of them: a summary looks the same either way, so
    // the only reason to offer it is that some of it is not on screen.
    if (!expanded && shown.length < groups.length) {
      const more = head.createEl('button', { cls: 'orbis-rule-add', text: t('library.show_all') });
      more.addEventListener('click', () => this.expand(widget));
    }

    if (groups.length === 0) {
      section.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_empty') });
      return;
    }
    for (const group of shown) this.renderSummaryRow(section, widget, group);
    this.renderSummaryTotal(section, widget, groups, records.length);
  }

  /** The groups a summary lists: the collection's arrangement, plus the values it uses none of when asked. */
  private summaryGroups(widget: DashboardWidget, records: LibraryRecord[]): RecordGroup[] {
    const collection = this.collectionOf(widget);
    const groupBy = collection?.groupBy ?? GROUP_NONE;
    const groups = arrangeRecords(
      records,
      groupBy,
      collection?.sort ?? [{ key: 'title' }],
      collection?.groupBucket ? this.leftoversFor(collection.groupBucket) : this.noneLabel(groupBy),
      { lastOpenedOf: (record) => this.capabilities(record).lastOpened, fieldValues: collection?.fieldValues },
      collection?.groupOrder,
      collection?.groupBucket
    );
    // An ungrouped collection summarizes to itself: one row, the whole count, and it opens like any other.
    if (groupBy === GROUP_NONE) return [{ label: t('library.summary_all'), records }];
    if (!widget.showEmptyGroups) return groups;
    // The field's list says what values EXIST; the collection's says what they are called and in what order. A
    // collection's list also holds whatever its records once contained, which is not the same question.
    return orderGroups(
      withEmptyGroups(
        groups,
        fieldValuesFor(groupBy),
        effectiveValues(collection?.fieldValues?.[groupBy], fieldValuesFor(groupBy))
      ),
      collection?.groupOrder
    );
  }

  /** One row: what it is, how many, and — when there are any — a way in. */
  private renderSummaryRow(parent: HTMLElement, widget: DashboardWidget, group: RecordGroup<unknown>): void {
    const empty = group.records.length === 0;
    const row = parent.createDiv({ cls: `orbis-summary-row${empty ? ' is-empty' : ''}` });
    row.createDiv({ cls: 'orbis-summary-label', text: group.label });
    row.createDiv({ cls: 'orbis-summary-count', text: group.records.length.toLocaleString() });
    if (empty) {
      // Nothing to open, so it is not offered as openable: no chevron, no tap, and the row reads as the report it
      // is — "you have none of these".
      row.setAttribute('aria-label', t('library.summary_row_empty', { label: group.label }));
      return;
    }
    setIcon(row.createDiv({ cls: 'orbis-summary-chevron' }), 'chevron-right');
    // One string, not two cells: a screen reader should say "Reading now, 5 titles", which is how the row is read
    // by eye as well.
    row.setAttribute(
      'aria-label',
      t('library.summary_row', { label: group.label, count: group.records.length.toLocaleString() })
    );
    onActivate(row, () => {
      this.drill = { widget: widget.id, group: group.label };
      this.render();
    });
  }

  /**
   * The total under the rows, when the widget asks for one.
   *
   * Two totals that only differ for a multi-valued grouping, each labeled for what it counts — a book with three
   * authors is in three rows and is one item, and a number that says which it is needs no explaining.
   */
  private renderSummaryTotal(
    parent: HTMLElement,
    widget: DashboardWidget,
    groups: RecordGroup<unknown>[],
    inCollection: number
  ): void {
    if (!widget.totals || widget.totals === 'off') return;
    const sum = widget.totals === 'sum';
    const row = parent.createDiv({ cls: 'orbis-summary-row is-total' });
    row.createDiv({ cls: 'orbis-summary-label', text: t(sum ? 'library.summary_total' : 'library.summary_in') });
    const count = sum ? groups.reduce((n, group) => n + group.records.length, 0) : inCollection;
    row.createDiv({ cls: 'orbis-summary-count', text: count.toLocaleString() });
  }

  /**
   * One category of a summary, as a page: its titles, flat, with a way back to where you tapped.
   *
   * **Returns false when the category is no longer there** — emptied while you stood in it, by a status you
   * changed or a note you deleted. The caller falls back to the summary, which is where the answer now is.
   */
  private renderDrill(parent: HTMLElement, widget: DashboardWidget, catalog: Catalog, group: string): boolean {
    if (this.speciesOf(widget) === 'reading_record') return this.renderRecordDrill(parent, widget, catalog, group);
    const records = this.recordsFor(widget, catalog);
    const found =
      records === null ? null : (this.summaryGroups(widget, records).find((g) => g.label === group) ?? null);
    if (!found || found.records.length === 0) return false;
    const bar = parent.createDiv({ cls: 'orbis-library-header' });
    const back = bar.createEl('button', { cls: 'clickable-icon orbis-library-back' });
    setIcon(back, 'arrow-left');
    back.setAttribute('aria-label', t('action.back'));
    back.addEventListener('click', () => {
      this.drill = null;
      this.render();
    });
    bar.createDiv({ cls: 'orbis-library-title', text: found.label });

    // **Not re-grouped.** You are here because you picked this category, so grouping it again would print one
    // heading repeating the row you tapped. The collection's SORT is already in these records, from the arrange
    // that grouped them.
    //
    // The widget's own `view` decides how these titles look — it describes nothing on the dashboard, where the
    // widget draws category rows rather than titles, so it is free to mean the page a category opens into.
    this.renderSection(parent, '', found.records.length, found.records, {
      arrange: null,
      more: null,
      view: widget.view,
      expanded: true,
      primary: this.primaryFor(widget),
      fields: widget.fields,
      widgetId: widget.id,
    });
    return true;
  }

  /** The same, for a category of records: the passages in it, under a bar that names the category. */
  private renderRecordDrill(parent: HTMLElement, widget: DashboardWidget, catalog: Catalog, group: string): boolean {
    const records = this.readingRecordsFor(widget, catalog);
    const found =
      records === null ? null : (this.recordSummaryGroups(widget, records).find((g) => g.label === group) ?? null);
    if (!found || found.records.length === 0) return false;
    const bar = parent.createDiv({ cls: 'orbis-library-header' });
    const back = bar.createEl('button', { cls: 'clickable-icon orbis-library-back' });
    setIcon(back, 'arrow-left');
    back.setAttribute('aria-label', t('action.back'));
    back.addEventListener('click', () => {
      this.drill = null;
      this.render();
    });
    bar.createDiv({ cls: 'orbis-library-title', text: found.label });
    // Not re-grouped, for the reason the titles' drill is not: you are here because you picked this category, so
    // a heading repeating the row you tapped says nothing. The collection's sort is already in these records.
    if (widget.view === 'table') {
      this.renderTable(
        parent,
        [{ label: '', records: found.records }],
        { expanded: true, fields: widget.fields, widgetId: widget.id },
        this.recordTable(this.collectionOf(widget))
      );
      return true;
    }
    this.renderRecordRows(parent, found.records, widget);
    return true;
  }

  /** The expanded view of one widget: everything it holds, in the view the widget chose, with a way back. */
  private renderExpanded(parent: HTMLElement, widget: DashboardWidget, catalog: Catalog): void {
    const bar = parent.createDiv({ cls: 'orbis-library-header' });
    const back = bar.createEl('button', { cls: 'clickable-icon orbis-library-back' });
    setIcon(back, 'arrow-left');
    back.setAttribute('aria-label', t('action.back'));
    back.addEventListener('click', () => {
      this.expanded = null;
      this.render();
    });
    bar.createDiv({ cls: 'orbis-library-title', text: this.labelFor(widget) });

    if (this.speciesOf(widget) === 'reading_record') {
      this.renderRecordWidget(parent, widget, catalog, true);
      return;
    }
    // Search keeps its box when it expands, with whatever was typed still in it. Show all on a search is "the rest
    // of these results", and landing on a page of results with no way to refine them means going back, retyping,
    // and expanding again.
    if (widget.kind === 'search') {
      this.renderSearch(parent, widget, catalog, true);
      return;
    }
    // Expanded, a summary is the same rows with none of them held back — there is no second way to look at it.
    if (widget.kind === 'summary') {
      this.renderSummary(parent, widget, catalog, true);
      return;
    }

    const records = this.recordsFor(widget, catalog);
    if (records === null) return;
    // The expanded view is the widget's own when it named one — that is the whole point of the field — and its
    // dashboard view otherwise, so expanding never changes what the titles look like without being asked to.
    this.renderSection(parent, '', records.length, records, {
      arrange: widgetTakesArrangement(widget) ? this.collectionOf(widget) : null,
      more: null,
      view: widget.expandedView ?? widget.view,
      expanded: true,
      primary: this.primaryFor(widget),
      fields: widget.fields,
      widgetId: widget.id,
    });
  }

  /**
   * What page is on screen, as one string — the dashboard, an expanded widget, or a summary's category.
   *
   * Scroll position is kept across a repaint of the SAME page and reset when the page changes, so a category
   * opening at the position you left the dashboard at would be the bug this prevents.
   */
  private pageKey(): string | null {
    if (this.drill) return `${this.drill.widget}/${this.drill.group}`;
    return this.expanded;
  }

  private expand(widget: DashboardWidget): void {
    this.expanded = widget.id;
    this.render();
  }

  /**
   * What a tap does on this widget's titles.
   *
   * Only the recordings shelf overrides it: those titles are there BECAUSE they have audio, so opening the text
   * would be answering a question nobody asked. Everywhere else the ordinary chain applies.
   */
  private primaryFor(widget: DashboardWidget): PrimaryAction | undefined {
    return widget.kind === 'recordings' ? 'listen' : undefined;
  }

  /** The collection a widget draws from, or null when it points at one that no longer exists. */
  private collectionOf(widget: DashboardWidget): LibraryCollection | null {
    return this.plugin.settings.libraryCollections.find((c) => c.id === widget.collection) ?? null;
  }

  /**
   * Which species a widget draws.
   *
   * Its collection's, always. A widget pointing at a collection that no longer exists reads as titles, which is
   * what puts it down the ordinary path to the row that says the collection is missing — the honest report — rather
   * than into the record path, where the same absence would look like an empty shelf.
   */
  private speciesOf(widget: DashboardWidget): NoteSpecies {
    const collection = this.collectionOf(widget);
    return collection ? speciesOf(collection) : 'title';
  }

  /**
   * A widget of reading records: a heading, the passages, and a way to the rest.
   *
   * **A path of its own rather than a generic one over both species.** A record is not a thinner title: it has no
   * cover, no reading status and no series, its row leads with a sentence from the middle of a book, and tapping it
   * opens the book *there*. Code that had to ask which species it was holding at every step would be code that
   * could get it wrong at any of them.
   */
  private renderRecordWidget(parent: HTMLElement, widget: DashboardWidget, catalog: Catalog, expanded: boolean): void {
    const section = parent.createDiv({ cls: 'orbis-library-collection' });
    const records = this.readingRecordsFor(widget, catalog);
    if (records === null) {
      section.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
      section.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_missing') });
      return;
    }
    // A search box first, if that is what this widget is — the same shape the titles' search has, and for the same
    // reason: typing repaints the results and nothing else, or the input is rebuilt under the cursor.
    if (widget.kind === 'search') {
      this.renderRecordSearch(section, widget, records, expanded);
      return;
    }
    if (widget.kind === 'summary') {
      this.renderRecordSummary(section, widget, records, expanded);
      return;
    }
    const shown = expanded ? records : widgetShown(records, widget, (list) => this.sortedRecordsFor(widget, list));
    const head = section.createDiv({ cls: 'orbis-library-collection-head' });
    if (!expanded) head.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
    head.createDiv({ cls: 'orbis-library-collection-count', text: recordCountText(records.length, shown.length) });
    if (!expanded && widgetCanExpand(records.length, widget)) {
      const more = head.createEl('button', { cls: 'orbis-rule-add', text: t('library.show_all') });
      more.addEventListener('click', () => this.expand(widget));
    }
    // Expanded means all of them in the collection's own order — `widgetShown` was skipped above, so the sort has
    // not happened yet.
    this.renderRecordGroups(section, expanded ? this.sortedRecordsFor(widget, shown) : shown, widget, expanded);
  }

  /**
   * The records under their group headings, or as one run when the collection groups by nothing.
   *
   * The arrangement is the collection's, exactly as it is for titles — and through the same arranger, so a
   * grouping means the same thing on both species rather than nearly the same thing twice.
   */
  private renderRecordGroups(
    parent: HTMLElement,
    records: ReadingRecord[],
    widget: DashboardWidget,
    expanded: boolean
  ): void {
    if (records.length === 0) {
      parent.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_empty') });
      return;
    }
    const collection = widgetTakesArrangement(widget) ? this.collectionOf(widget) : null;
    const groupBy = collection?.groupBy ?? GROUP_NONE;
    // Sorted already by `sortedRecordsFor`, so this only cuts: passing an empty sort leaves the order alone.
    const groups =
      collection && groupBy !== GROUP_NONE
        ? this.recordGroupsOf(collection, records, [])
        : [{ label: '', records } as RecordGroup<ReadingRecord>];
    // **A table draws every group at once**, for the reason the titles' table does: one column model, and columns
    // that line up down the whole widget rather than being auto-sized per block.
    const view = (expanded ? widget.expandedView : undefined) ?? widget.view;
    if (view === 'table') {
      this.renderTable(
        parent,
        groups,
        { expanded, fields: widget.fields, widgetId: widget.id },
        this.recordTable(this.collectionOf(widget))
      );
      return;
    }
    for (const group of groups) {
      if (group.label) {
        const head = parent.createDiv({ cls: 'orbis-library-group' });
        head.createDiv({ cls: 'orbis-library-group-name', text: group.label });
        head.createDiv({ cls: 'orbis-library-group-count', text: String(group.records.length) });
      }
      this.renderRecordRows(parent, group.records, widget);
    }
  }

  /** One collection's records, grouped the way it says — the record species' `summaryGroups`. */
  private recordGroupsOf(
    collection: LibraryCollection,
    records: ReadingRecord[],
    sort: SortSpec[] = collection.sort ?? []
  ): RecordGroup<ReadingRecord>[] {
    const groupBy = collection.groupBy ?? GROUP_NONE;
    return arrangeReadingRecords(
      records,
      groupBy,
      sort,
      collection.groupBucket ? this.leftoversFor(collection.groupBucket) : this.noneLabel(groupBy),
      collection.fieldValues,
      collection.groupOrder,
      collection.groupBucket
    );
  }

  /**
   * A summary of a collection of records: one row per group, with a way into each.
   *
   * The same rows a summary of titles draws, from the same arranger — what differs is only what a category opens
   * into, which is a list of passages rather than a shelf of books.
   */
  private renderRecordSummary(
    section: HTMLElement,
    widget: DashboardWidget,
    records: ReadingRecord[],
    expanded: boolean
  ): void {
    const groups = this.recordSummaryGroups(widget, records);
    const shown = expanded ? groups : widgetSlice(groups, widget);
    const head = section.createDiv({ cls: 'orbis-library-collection-head' });
    if (!expanded) head.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
    head.createDiv({ cls: 'orbis-library-collection-count', text: groupCountText(groups.length, shown.length) });
    if (!expanded && shown.length < groups.length) {
      const more = head.createEl('button', { cls: 'orbis-rule-add', text: t('library.show_all') });
      more.addEventListener('click', () => this.expand(widget));
    }
    if (groups.length === 0) {
      section.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_empty') });
      return;
    }
    for (const group of shown) this.renderSummaryRow(section, widget, group);
    this.renderSummaryTotal(section, widget, groups, records.length);
  }

  /** The groups a record summary lists — the collection's arrangement, plus the values it uses none of. */
  private recordSummaryGroups(widget: DashboardWidget, records: ReadingRecord[]): RecordGroup<ReadingRecord>[] {
    const collection = this.collectionOf(widget);
    const groupBy = collection?.groupBy ?? GROUP_NONE;
    if (!collection || groupBy === GROUP_NONE) return [{ label: t('library.summary_all'), records }];
    const groups = this.recordGroupsOf(collection, records);
    if (!widget.showEmptyGroups) return groups;
    return orderGroups(
      withEmptyGroups(
        groups,
        fieldValuesFor(groupBy),
        effectiveValues(collection.fieldValues?.[groupBy], fieldValuesFor(groupBy))
      ),
      collection.groupOrder
    );
  }

  /** The search box over a collection of records, and whatever it matches beneath it. */
  private renderRecordSearch(
    section: HTMLElement,
    widget: DashboardWidget,
    records: ReadingRecord[],
    expanded: boolean
  ): void {
    const head = section.createDiv({ cls: 'orbis-library-collection-head' });
    if (!expanded) head.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
    const countEl = head.createDiv({ cls: 'orbis-library-collection-count' });
    const more = expanded ? null : head.createEl('button', { cls: 'orbis-rule-add', text: t('library.show_all') });
    more?.addEventListener('click', () => this.expand(widget));

    const box = section.createEl('input', { cls: 'orbis-library-search' });
    box.type = 'search';
    box.placeholder = t('library.search_records_placeholder');
    box.value = this.searchQuery;
    const body = section.createDiv();
    const paint = () => {
      body.empty();
      const hits = this.sortedRecordsFor(widget, searchReadingRecords(records, this.searchQuery));
      const shown = expanded ? hits : widgetSlice(hits, widget);
      countEl.setText(this.searchQuery.trim() ? recordCountText(hits.length, shown.length) : '');
      more?.toggle(hits.length > shown.length);
      if (!this.searchQuery.trim()) {
        body.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.search_records_hint') });
        return;
      }
      if (hits.length === 0) {
        body.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.search_none') });
        return;
      }
      this.renderRecordGroups(body, shown, widget, expanded);
    };
    box.addEventListener('input', () => {
      this.searchQuery = box.value;
      paint();
    });
    paint();
  }

  /**
   * The records this widget shows, or null when its collection is gone.
   *
   * The pool is a lookup into the catalog, as it is for titles — one pass has already matched every note against
   * every collection.
   */
  private readingRecordsFor(widget: DashboardWidget, catalog: Catalog): ReadingRecord[] | null {
    const collection = this.collectionOf(widget);
    if (!collection) return null;
    const pool = catalog.recordGroups.find((g) => g.collection.id === collection.id)?.records ?? [];
    // `search` filters in its own render, where the box lives.
    return widget.kind === 'recent' ? recentReadingRecords(pool) : pool;
  }

  /** A widget's records in its collection's sort — reading order where it asked for none. */
  private sortedRecordsFor(widget: DashboardWidget, records: ReadingRecord[]): ReadingRecord[] {
    const collection = widgetTakesArrangement(widget) ? this.collectionOf(widget) : null;
    if (!collection) return records;
    return sortReadingRecords(records, collection.sort ?? [], collection.fieldValues);
  }

  private renderRecordRows(parent: HTMLElement, records: ReadingRecord[], widget: DashboardWidget): void {
    if (records.length === 0) {
      parent.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_empty') });
      return;
    }
    for (const record of records) this.renderReadingRecord(parent, record, widget.fields);
  }

  /**
   * One reading record as a row: the passage, where it came from, and the way back into the book.
   *
   * **Tapping it opens the book at that passage** — the thing no Base or Dataview table can do, and the reason
   * records are worth a widget at all rather than being left to a table. The row is a button for the same reason a
   * title's row is: it is one of a list of things you activate.
   */
  private renderReadingRecord(parent: HTMLElement, record: ReadingRecord, fields?: readonly string[]): void {
    const row = parent.createDiv({ cls: 'orbis-library-row' });
    const main = row.createEl('button', { cls: 'orbis-library-row-main' });
    const headline = recordHeadline(record, {
      location: (loc) => t('library.record_at_location', { loc }),
      untitled: t('library.record_untitled'),
    });
    main.setAttribute('aria-label', headline.text);
    main.createDiv({ cls: 'orbis-library-row-title', text: headline.text });
    const meta = [
      // Whatever the headline already said is left out of the line beneath it — see `recordMetaLine`.
      recordMetaLine(record, fields ?? DEFAULT_RECORD_FIELDS, ' · ', headline),
      // Said on the row rather than left to be discovered: the ANNOTATION is gone — deleted from the book — while
      // the book's own text is untouched, so the tap still opens the book at the passage and simply lands on
      // unmarked words. The record is kept because you have written in it.
      record.orphaned ? t('library.record_orphaned') : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (meta) main.createDiv({ cls: 'orbis-library-row-meta', text: meta });
    main.addEventListener('click', () => void this.openRecordPassage(record));

    const actions = row.createDiv({ cls: 'orbis-library-row-actions' });
    const more = this.actionButton(actions, 'more-horizontal', t('library.more_actions'), () => {});
    more.addEventListener('click', (e) => this.showReadingRecordMenu(record, e));
    this.wireMenuGesture(row, (e) => this.showReadingRecordMenu(record, e));
  }

  /** What you can do with a record: go there, go to the book, or read the note it lives in. */
  private showReadingRecordMenu(record: ReadingRecord, event: MouseEvent): void {
    const menu = new Menu();
    // Keyboard activation carries no coordinates — see the note on `showAtPosition` in `showRecordMenu`.
    const at = menuPointOf(event);
    const book = this.bookFileOf(record);
    if (book) {
      menu.addItem((item) =>
        item
          .setTitle(t('library.record_open_passage'))
          .setIcon('book-open')
          .onClick(() => void this.openRecordPassage(record))
      );
      // **Not "at the start" — a plain open.** The reader restores where you left off, so this is the book opened
      // the way it opens from anywhere else, and the item above is the one that overrides that to land on the
      // passage. Two ways in, and both are ones someone actually wants: read on from here, or read on from where
      // I was.
      menu.addItem((item) =>
        item
          .setTitle(t('library.record_open_book'))
          .setIcon('book')
          .onClick(() => void openBookForReading(this.app, book))
      );
    }
    // The book's own note, when the vault has one. A record and a title note are two different notes about the
    // same book — where the passage is, and what the book IS — and a reader following a highlight back often wants
    // the second: the rating, the series, everything the catalog knows.
    const titleNote = book ? this.titleNoteFor(book) : null;
    if (titleNote) {
      menu.addItem((item) =>
        item
          .setTitle(t('library.open_note'))
          .setIcon('book-marked')
          .onClick(() => void this.openNoteAt(titleNote.path))
      );
    }
    menu.addItem((item) =>
      item
        .setTitle(t('library.record_open_note'))
        .setIcon('file-text')
        .onClick(() => void this.openNoteAt(record.notePath))
    );
    menu.onHide(() => {
      this.menuClosedAt = Date.now();
    });
    menu.showAtPosition(at, this.containerEl.doc);
  }

  /**
   * Open the book this record came from, at the passage it marks.
   *
   * The CFI is what a record carries for exactly this. A record whose book has left the vault says so rather than
   * doing nothing: the note is still there and still readable, and the missing half is the book.
   */
  private async openRecordPassage(record: ReadingRecord): Promise<void> {
    const book = this.bookFileOf(record);
    if (!book) {
      new Notice(t('library.record_book_missing'));
      return;
    }
    await openBookAt(this.app, book, { cfi: record.cfi });
  }

  /** The book a record was made from, resolved through its own `book` link. */
  private bookFileOf(record: ReadingRecord): TFile | null {
    if (!record.book.trim()) return null;
    return resolveRecordFile(this.app, linkTarget(record.book), record.notePath);
  }

  /**
   * The title note describing this book, or null when nothing catalogs it.
   *
   * Matched the way Read and Listen match — each title's `files` resolved against the vault — because "the note
   * about this book" has to mean the same thing everywhere; comparing paths alone would miss a note that links the
   * file by a different but equivalent link text. Read from the titles this paint already parsed, so a right-click
   * costs a comparison rather than a walk of the vault.
   */
  private titleNoteFor(book: TFile): TFile | null {
    for (const title of this.allRecords()) {
      for (const link of title.files) {
        if (resolveRecordFile(this.app, link, title.notePath)?.path !== book.path) continue;
        const note = this.app.vault.getAbstractFileByPath(title.notePath);
        if (note instanceof TFile) return note;
      }
    }
    return null;
  }

  private async openNoteAt(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await openNoteBeside(this.app, file);
  }

  /**
   * The titles this widget's collection gathers — the population every kind then asks its question of.
   *
   * Taken from the catalog rather than filtered here: one pass has already matched every note against every
   * collection, so this is a lookup. Null when the collection is gone, which is a state a synced vault can reach
   * and which the widget reports rather than papering over with an empty list.
   */
  private poolFor(widget: DashboardWidget, catalog: Catalog): LibraryRecord[] | null {
    const collection = this.collectionOf(widget);
    if (!collection) return null;
    return catalog.groups.find((g) => g.collection.id === collection.id)?.records ?? [];
  }

  /** A widget's heading — see `widgetHeading`, which the dashboard's settings list names it by too. */
  private labelFor(widget: DashboardWidget): string {
    return widgetHeading(widget, this.plugin.settings.libraryCollections);
  }

  /**
   * A widget's records in its collection's sort, before the count cuts them down.
   *
   * The same sort `renderSection` applies when it groups them, run early so that "the first ten" means the first
   * ten of the order the reader asked for.
   */
  private sortedFor(widget: DashboardWidget, records: LibraryRecord[]): LibraryRecord[] {
    const collection = this.collectionOf(widget);
    if (!collection) return records;
    return sortRecords(records, collection.sort ?? [{ key: 'title' }], {
      lastOpenedOf: (record) => this.capabilities(record).lastOpened,
      fieldValues: collection.fieldValues,
    });
  }

  /** Search results in the collection's sort, when the widget asked for that rather than for best-match order. */
  private arrangeHits(widget: DashboardWidget, hits: LibraryRecord[]): LibraryRecord[] {
    const collection = widgetTakesArrangement(widget) ? this.collectionOf(widget) : null;
    if (!collection) return hits;
    const groups = arrangeRecords(hits, 'none', collection.sort ?? [{ key: 'title' }], '', {
      lastOpenedOf: (record) => this.capabilities(record).lastOpened,
      fieldValues: collection.fieldValues,
    });
    return groups[0]?.records ?? hits;
  }

  /**
   * Every title note in the vault — the catalog, as opposed to whatever the collections currently gather.
   *
   * Read from the pass this paint already did rather than walking again. Falls back to a walk for the one caller
   * that can run before a paint has happened.
   */
  private allRecords(): LibraryRecord[] {
    if (this.paintedTitles) return this.paintedTitles;
    return vaultCandidates(this.app)
      .map((note) => parseRecord(note.path, note.frontmatter))
      .filter((record): record is LibraryRecord => record !== null);
  }

  /**
   * Write a record per book, one at a time, with a running count and a way out.
   *
   * Sequential rather than parallel: each book is a read, an unzip and a note, and firing hundreds at once on a
   * phone is how a background job becomes a frozen app. Cancelling stops before the next book rather than undoing
   * the ones already written — those are real notes now, and quietly deleting them would be the surprise.
   */
  /**
   * The notice about books nothing describes yet.
   *
   * **A notice, not a widget.** Cataloging is a job you finish, and it would be the one section of the dashboard that
   * acts rather than shows — a permanent slot for it says "this is part of your library" when what it means is "there
   * is something to tidy". So the dashboard mentions it and settings holds the tool.
   *
   * Dismissing remembers WHICH books were waved away (see `uncatalogedSignature`), so this is quiet about a set
   * someone has considered and speaks up again the moment a new book arrives — where a flag would have turned the
   * notice off for good the first time it was inconvenient.
   */
  private renderUncatalogedAlert(parent: HTMLElement, files: TFile[]): void {
    // A notice and its dismissal belong to this device — see `device-settings.ts`. Waving it away here must not tell
    // the phone that a question it never asked has been answered.
    if (
      !shouldAlert(
        files.map((f) => f.path),
        deviceSetting('libraryUncatalogedDismissed'),
        deviceSetting('libraryUncatalogedAlert')
      )
    ) {
      return;
    }
    const alert = parent.createDiv({ cls: 'orbis-library-alert' });
    alert.createDiv({
      cls: 'orbis-library-alert-text',
      text:
        files.length === 1
          ? t('library.alert_uncataloged_one')
          : t('library.alert_uncataloged', { count: String(files.length) }),
    });
    const review = alert.createEl('button', { cls: 'orbis-rule-add', text: t('library.alert_review') });
    review.addEventListener('click', () => openCatalogReview(this.app, this.plugin, () => this.render()));
    const dismiss = alert.createEl('button', { cls: 'clickable-icon orbis-library-act' });
    setIcon(dismiss, 'x');
    dismiss.setAttribute('aria-label', t('library.alert_dismiss'));
    dismiss.addEventListener('click', () => {
      setDeviceSetting('libraryUncatalogedDismissed', uncatalogedSignature(files.map((f) => f.path)));
      this.render();
    });
  }

  /**
   * What you are part-way through, newest first.
   *
   * **Not expressible as a collection**, which is why it is a widget kind: "started" comes from location files and
   * "when" from their mtimes, neither of which is frontmatter, so no filter over notes could say it.
   *
   * **Measured over the whole catalog, not over what the collections gather.** What you are part-way through is a fact
   * about your reading, not about how you have chosen to file things — and built from the collections it would be empty
   * for anyone whose collections happen to be narrow, which is every reason to have collections at all.
   */
  /**
   * The titles a widget shows, or null when it points at a collection that no longer exists.
   *
   * Each derived kind answers a question the frontmatter cannot: what you were in the middle of, what has audio
   * beside it, what you have not started. They all begin from the same pass over the vault's records, so adding
   * one costs a filter rather than a scan.
   */
  private recordsFor(widget: DashboardWidget, catalog: Catalog): LibraryRecord[] | null {
    const pool = this.poolFor(widget, catalog);
    if (pool === null) return null;
    switch (widget.kind) {
      case 'continue':
        return this.continueRecords(pool);
      case 'recordings':
        return this.recordedRecords(pool);
      case 'recent':
        return this.recentRecords(pool);
      case 'pick':
        return this.pickRecords(pool, widget, widget.count ?? 1);
      case 'search':
        return searchRecords(pool, this.searchQuery);
      default:
        return pool;
    }
  }

  /**
   * The search widget: a box, and whatever it matches beneath it.
   *
   * **Typing repaints the results and nothing else.** A full repaint would rebuild the input, and an input that is
   * rebuilt under a moving cursor loses focus and swallows keystrokes. So the box is built once and the body is what
   * changes.
   *
   * An empty box shows nothing rather than everything: a search nobody has made yet has no results, and painting
   * three thousand rows to say so would be the most expensive way to say it.
   */
  private renderSearch(parent: HTMLElement, widget: DashboardWidget, catalog: Catalog, expanded = false): void {
    const records = this.poolFor(widget, catalog);
    if (records === null) {
      const gone = parent.createDiv({ cls: 'orbis-library-collection' });
      gone.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
      gone.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_missing') });
      return;
    }
    const section = parent.createDiv({ cls: 'orbis-library-collection' });
    const head = section.createDiv({ cls: 'orbis-library-collection-head' });
    // Expanded, the page's own bar carries the heading; a second copy of it above the box would be the same word
    // twice with nothing between them.
    if (!expanded) head.createDiv({ cls: 'orbis-library-collection-name', text: this.labelFor(widget) });
    const countEl = head.createDiv({ cls: 'orbis-library-collection-count' });
    const more = expanded ? null : head.createEl('button', { cls: 'orbis-rule-add', text: t('library.show_all') });
    more?.addEventListener('click', () => this.expand(widget));

    const box = section.createEl('input', { cls: 'orbis-library-search' });
    box.type = 'search';
    box.placeholder = t('library.search_placeholder');
    box.value = this.searchQuery;

    const body = section.createDiv();
    const paint = () => {
      body.empty();
      // Ranked by how well each matches, unless the widget asked for the collection's own order instead — the one
      // place where a kind's answer and a collection's arrangement genuinely disagree. Grouping is left out either
      // way: a heading between search results is a subdivision of an answer nobody asked to have subdivided.
      const hits = this.arrangeHits(widget, searchRecords(records, this.searchQuery));
      // Expanded means all of them — that is what Show all promised — and the count then has one number to report.
      const shown = expanded ? hits : widgetSlice(hits, widget);
      countEl.setText(this.searchQuery.trim() ? countText(hits.length, shown.length) : '');
      more?.toggle(hits.length > shown.length);
      if (!this.searchQuery.trim()) {
        body.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.search_hint') });
        return;
      }
      if (hits.length === 0) {
        body.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.search_none') });
        return;
      }
      this.renderBody(body, shown, {
        view: (expanded ? widget.expandedView : undefined) ?? widget.view,
        expanded,
        fields: widget.fields,
        naming: this.collectionOf(widget),
        widgetId: widget.id,
      });
    };
    box.addEventListener('input', () => {
      this.searchQuery = box.value;
      paint();
    });
    paint();
  }

  /**
   * Titles with generated audio.
   *
   * The one shelf nothing else in Obsidian could build: a recording is a folder of MP3s beside the book, not a
   * property of the note, so this is derived from the vault's files rather than from anything anyone wrote down.
   */
  private recordedRecords(pool: LibraryRecord[]): LibraryRecord[] {
    // No sort of its own: this is a FILTER over a collection, so how the survivors are arranged is the collection's
    // business — see `widgetTakesArrangement`.
    return pool.filter((record) => this.capabilities(record).recorded);
  }

  /**
   * What arrived most recently, by the record's own `added` date.
   *
   * A real date where there is one, and the string otherwise: an import writes ISO dates, a person might write
   * "March 2024", and sorting the parseable ones properly while leaving the rest in a stable order beats refusing
   * to sort at all. Records with no date go last — they are not new, they are undated.
   */
  private recentRecords(pool: LibraryRecord[]): LibraryRecord[] {
    const when = (record: LibraryRecord): number => {
      const parsed = Date.parse(record.added);
      return Number.isNaN(parsed) ? -Infinity : parsed;
    };
    return pool
      .filter((record) => record.added)
      .sort((a, b) => when(b) - when(a) || a.title.localeCompare(b.title))
      .slice(0, 200);
  }

  /**
   * A title nobody has decided about, chosen at random and held until you ask for another.
   *
   * **What is eligible is the widget's to say** — see `pickable` for the two rules and `pickPool` for why a status of
   * any kind, flagged-for-later included, takes a title out of the default pool. A pool of "has a file and has never
   * been opened" would make two decisions on the reader's behalf: it would never suggest a book owned in print, nor one
   * that had been opened for thirty seconds and put down.
   *
   * The seed is what keeps the same title on screen while the vault changes underneath it, so a suggestion survives
   * long enough to be considered; Pick another draws a new one.
   */
  private pickRecords(pool: LibraryRecord[], widget: DashboardWidget, count: number): LibraryRecord[] {
    const eligible = pickable(pool, { pool: widget.pickPool, requiresFile: widget.pickRequiresFile }, (record) => ({
      // The note as it stands, not the painted row — the same reason the row menu's ticks read the note.
      status: this.currentStatus(record),
      hasFile: this.capabilities(record).readPath !== null,
    }));
    return pickTitles(eligible, this.pickSeed, count);
  }

  private continueRecords(pool: LibraryRecord[]): LibraryRecord[] {
    const started: Array<{ record: LibraryRecord; lastOpened: number }> = [];
    for (const record of pool) {
      const caps = this.capabilities(record);
      if (caps.started) started.push({ record, lastOpened: caps.lastOpened });
    }
    started.sort((a, b) => b.lastOpened - a.lastOpened);
    return started.map((entry) => entry.record);
  }

  /** Everything a row can do, resolving the record's links through Obsidian's own link rules. */
  private capabilities(record: LibraryRecord): Capabilities {
    const resolved = record.files
      .map((link) => resolveRecordFile(this.app, link, record.notePath))
      .filter((f): f is TFile => f instanceof TFile)
      .map((f) => ({ path: f.path, readable: isBookExtension(f.extension) }));
    return capabilitiesOf(record, resolved, (bookPath) => bookStateFor(this.states, bookPath));
  }

  private renderHeader(parent: HTMLElement, catalog: Catalog): void {
    const header = parent.createDiv({ cls: 'orbis-library-header' });
    // With one dashboard the name is a title; with several it is a choice. A dropdown that never has a second
    // option is a control pretending to be one, so it only appears when there is somewhere to switch to.
    // This device's order and this device's decisions — see `orderedDashboards`.
    const available = enabledDashboards(this.plugin.settings.libraryDashboards, readDashboardOrder());
    if (available.length > 1) {
      const dashboard = activeDashboard(this.plugin.settings.libraryDashboards, readActiveDashboard());
      const select = header.createEl('select', { cls: 'dropdown orbis-library-switcher' });
      select.setAttribute('aria-label', t('library.switch_dashboard'));
      // Keyed, so focus follows the control through the repaint it causes — the page below it changes shape
      // entirely, so a positional match is a guess. See `render`.
      select.dataset.orbisFocus = 'library-switcher';
      for (const option of available) select.createEl('option', { value: option.id, text: option.name });
      select.value = dashboard?.id ?? available[0].id;
      select.addEventListener('change', () => {
        // Remembered, so the icon opens where you last were: which dashboard shows is a consequence of use rather
        // than a setting to maintain.
        writeActiveDashboard(select.value);
        this.expanded = null;
        this.render();
      });
    } else {
      header.createDiv({ cls: 'orbis-library-title', text: t('library.title') });
    }
    header.createDiv({
      cls: 'orbis-library-count',
      text: countText(catalog.totalRecords, catalog.totalRecords),
    });
  }

  /**
   * One heading and its rows — what every widget paints, whatever produced the records.
   *
   * `arrange` is the collection whose grouping and sort apply, or null for a widget that is already an ordering:
   * grouping Continue by author would answer a question nobody asked. `more` is the expand action, present only when
   * the widget is holding titles back.
   */
  private renderSection(
    parent: HTMLElement,
    heading: string,
    total: number,
    records: LibraryRecord[],
    opts: {
      arrange: LibraryCollection | null;
      more: (() => void) | null;
      /** What the expand button says, when there is one. */
      moreLabel?: string;
      /** A second button beside it, for a widget that does something other than expand. */
      action?: { label: string; run: () => void } | null;
      view: LibraryViewType;
      /** Expanded means this widget is the whole page; on a dashboard it is one section among several. */
      expanded: boolean;
      /** What tapping a title here does, when this widget's titles are about something other than reading. */
      primary?: PrimaryAction;
      /** The fields shown beside each title — the widget's choice, or the default pair when it has none. */
      fields?: readonly string[];
      /** Whose section this is — see `renderBody`. */
      widgetId?: string;
    }
  ): void {
    const section = parent.createDiv({ cls: 'orbis-library-collection' });
    if (heading) {
      const head = section.createDiv({ cls: 'orbis-library-collection-head' });
      head.createDiv({ cls: 'orbis-library-collection-name', text: heading });
      head.createDiv({ cls: 'orbis-library-collection-count', text: countText(total, records.length) });
      if (opts.more) {
        const more = head.createEl('button', {
          cls: 'orbis-rule-add',
          text: opts.moreLabel ?? t('library.show_all'),
        });
        more.addEventListener('click', opts.more);
      }
      if (opts.action) {
        const act = head.createEl('button', { cls: 'orbis-rule-add', text: opts.action.label });
        act.addEventListener('click', opts.action.run);
      }
    }
    if (records.length === 0) {
      section.createDiv({ cls: 'orbis-library-collection-empty', text: t('library.collection_empty') });
      return;
    }
    const collection = opts.arrange;
    const groupBy = collection?.groupBy ?? 'none';
    const groups = collection
      ? arrangeRecords(
          records,
          groupBy,
          collection.sort ?? [{ key: 'title' }],
          // A bucketed field names its leftovers for what the frame NEEDED and the note did not say — see
          // `leftoversFor`. Otherwise the field's own word for nothing.
          collection.groupBucket ? this.leftoversFor(collection.groupBucket) : this.noneLabel(groupBy),
          {
            lastOpenedOf: (record) => this.capabilities(record).lastOpened,
            fieldValues: collection.fieldValues,
          },
          collection.groupOrder,
          collection.groupBucket
        )
      : [{ label: '', records }];
    // **A table draws every group at once.** One table means one column model, and columns that line up down the whole
    // widget — a table per group would auto-size each block to its own contents, so Authors would start at a different
    // place under every heading and a column could not be read down the page, which is the one thing a table is for. It
    // also means one horizontal scroller rather than one per group, each panned separately.
    if (opts.view === 'table') {
      this.renderTable(
        section,
        groups,
        { expanded: opts.expanded, fields: opts.fields, widgetId: opts.widgetId },
        this.titleTable(opts.arrange, opts.primary)
      );
      return;
    }
    for (const group of groups) {
      // A heading only where there is grouping to show. Ungrouped, the widget's own name is the heading.
      if (group.label) {
        const groupHead = section.createDiv({ cls: 'orbis-library-group' });
        groupHead.createDiv({ cls: 'orbis-library-group-name', text: group.label });
        groupHead.createDiv({ cls: 'orbis-library-group-count', text: String(group.records.length) });
      }
      this.renderBody(section, group.records, {
        view: opts.view,
        expanded: opts.expanded,
        primary: opts.primary,
        fields: opts.fields,
        // The collection arranging this section is the one whose value names apply — a status column and a status
        // heading in one widget have to agree about what `read` is called.
        naming: opts.arrange,
        widgetId: opts.widgetId,
      });
    }
  }

  /**
   * The titles themselves, as rows or as covers.
   *
   * **On a dashboard, covers are a strip you swipe; expanded, they are a grid.** A widget on a dashboard is a
   * sample of a collection sitting above other widgets, so it has to stay one row tall whatever its count — ten
   * covers wrapping into four rows is what pushes everything below it off the screen. Expanded there is nothing
   * below to push, and a grid is the better use of a page.
   */
  private renderBody(
    parent: HTMLElement,
    records: LibraryRecord[],
    opts: {
      view: LibraryViewType;
      expanded: boolean;
      primary?: PrimaryAction;
      /** The fields this widget shows beside a title — see `metaLine`. */
      fields?: readonly string[];
      /** The collection whose value names apply to those fields. */
      naming?: LibraryCollection | null;
      /** Whose table this is, so a heading sort is remembered per widget while the view is open. */
      widgetId?: string;
    }
  ): void {
    // A table is drawn by `renderSection` from every group at once — see the note there — so it never arrives
    // here one group at a time. Reached only by a caller with no grouping to speak of, where one group IS the set.
    if (opts.view === 'table') {
      this.renderTable(
        parent,
        [{ label: '', records }],
        { expanded: opts.expanded, fields: opts.fields, widgetId: opts.widgetId },
        this.titleTable(opts.naming, opts.primary)
      );
      return;
    }
    if (opts.view !== 'covers') {
      for (const record of records) {
        this.renderRecord(parent, record, this.capabilities(record), opts.primary, opts.fields, opts.naming);
      }
      return;
    }
    const strip = !opts.expanded;
    const wrap = parent.createDiv({ cls: strip ? 'orbis-library-strip' : 'orbis-library-grid' });
    // A sideways drag on a phone is also Obsidian's edge-swipe for its drawers, and the two race. Stopping
    // propagation (never preventDefault) leaves the native horizontal scroll alone — the same guard the player's
    // scrubber and the image viewer use.
    if (strip) guardDragSwipe(wrap);
    for (const record of records) {
      this.renderTile(wrap, record, this.capabilities(record), opts.primary, opts.fields, opts.naming);
    }
  }

  /** What the leftovers group is called — named for what it lacks, rather than a generic "other". */
  /**
   * What a time frame's leftovers row is called.
   *
   * Named for what is missing rather than for the field: a note dated `2017` grouped by month has a date and no
   * month, and a row calling that "No date" argues with the year printed beside it.
   */
  private leftoversFor(frame: TimeFrame): string {
    switch (leftoversKeyFor(frame)) {
      case 'month':
        return t('library.group_none_month');
      case 'full':
        return t('library.group_none_full_date');
      default:
        return t('library.group_none_date');
    }
  }

  private noneLabel(groupBy: GroupKey): string {
    return t(noneLabelKey(groupBy));
  }

  /**
   * One record as a row.
   *
   * A button, not a div with a click handler: it is one of a list of things you activate, so it should be
   * reachable by Tab and by Enter without any of that being reimplemented here.
   */
  private renderRecord(
    parent: HTMLElement,
    record: LibraryRecord,
    caps: Capabilities,
    primary?: PrimaryAction,
    fields?: readonly string[],
    naming?: LibraryCollection | null
  ): void {
    const row = parent.createDiv({ cls: 'orbis-library-row' });
    // The row's own body is the button, and the actions are siblings of it: a button inside a button is invalid
    // and the inner one stops working.
    const main = row.createEl('button', { cls: 'orbis-library-row-main' });
    main.setAttribute('aria-label', record.title);
    main.createDiv({ cls: 'orbis-library-row-title', text: record.title });
    const metaText = this.metaLine(record, fields, naming);
    if (metaText) main.createDiv({ cls: 'orbis-library-row-meta', text: metaText });
    main.addEventListener('click', () => this.activate(record, caps, primary));

    // **Two affordances, not five.** Read would be a second copy of the row's own tap; the data view and the note are
    // things nobody reaches often. Listening stays a peer of reading and keeps its button — and its tint, which says
    // whether a recording or a live voice is about to start. Everything else is behind ⋯, which is also what a long
    // press on a cover opens, so the actions are the same set wherever you are.
    const actions = row.createDiv({ cls: 'orbis-library-row-actions' });
    if (caps.readPath) {
      const readPath = caps.readPath;
      const listen = this.actionButton(
        actions,
        'headphones',
        caps.recorded ? t('library.listen_recorded') : t('library.listen'),
        () => void this.listenToBook(readPath)
      );
      if (caps.recorded) listen.addClass('is-recorded');
    }
    const more = this.actionButton(actions, 'more-horizontal', t('library.more_actions'), () => {});
    more.addEventListener('click', (e) => this.showRecordMenu(record, caps, e));

    // A right-click or a press anywhere on the row opens the same menu, so neither habit has to find ⋯ first.
    this.wireMenuGesture(row, (e) => this.showRecordMenu(record, caps, e));
  }

  /**
   * Everything you can do to a title, from a row's ⋯ or a long press on its cover.
   *
   * One menu for both, because they are the same question asked of the same record — and because a tile has no
   * room for buttons, which is the whole reason it is a menu rather than a strip.
   *
   * Statuses sit in their own section as checkable items: the menu then says what a book IS as well as what it
   * could be, and choosing the one already ticked clears it, so flagging and un-flagging are one gesture.
   */
  private showRecordMenu(record: LibraryRecord, caps: Capabilities, event: MouseEvent): void {
    const menu = new Menu();
    // **Where a second menu will open, taken from THIS gesture.** A menu item's own click event carries no
    // coordinates — Obsidian synthesises it, and `clientX`/`clientY` arrive as 0 — so the right-click or long press
    // that opened this menu is the only thing that knows where the reader is pointing.
    const at = menuPointOf(event);
    if (caps.readPath) {
      const readPath = caps.readPath;
      menu.addItem((item) =>
        item
          .setTitle(t('library.read'))
          .setIcon('book-open')
          .onClick(() => void this.openBook(readPath))
      );
      menu.addItem((item) =>
        item
          .setTitle(caps.recorded ? t('library.listen_recorded') : t('library.listen'))
          .setIcon('headphones')
          .onClick(() => void this.listenToBook(readPath))
      );
      if (caps.hasData) {
        menu.addItem((item) =>
          item
            .setTitle(t('library.show_data'))
            .setIcon('database')
            .onClick(() => void this.openData(readPath))
        );
      }
    } else if (caps.sourceUrl) {
      // **Named as a pair with the item below it.** This is `source_url` — where a title with no file in the vault can
      // actually be read: a Logos URI, a publisher's page, a library loan. "Open the title link" beside "Open the title
      // note" says which of the title's two destinations you are choosing.
      menu.addItem((item) =>
        item
          .setTitle(t('library.open_source'))
          .setIcon('external-link')
          .onClick(() => this.openSource(caps.sourceUrl))
      );
    }
    menu.addItem((item) =>
      item
        .setTitle(t('library.open_note'))
        .setIcon('file-text')
        .onClick(() => void this.openRecord(record))
    );

    menu.addSeparator();
    // **A drill-down rather than a nested submenu.** `MenuItem` has no `setSubmenu` in the public API, and the
    // internal one is an untyped call that breaks on an update — so choosing this closes the menu and opens the
    // ratings at the same point. Two taps, and on a phone that beats hovering a nested menu with a thumb.
    // **The rating is on the parent item when there is one.** Otherwise the only way to see what a title is rated
    // is to open the submenu and look for the tick, which is a menu you have to enter to read.
    const rated = this.currentRating(record);
    menu.addItem((item) =>
      item
        .setTitle(rated === null ? t('library.rating') : t('library.rating_set', { value: `${rated}/5` }))
        .setIcon('star')
        .onClick(() => this.openRatingMenu(record, at))
    );
    // **The same drill-down, and no separator between them.** As two peers — what you thought of it, where you are with
    // it — they belong in one group, below the separator that divides both from the open actions.
    const status = this.currentStatus(record);
    const named = statusChoices().find((choice) => choice.status === status);
    menu.addItem((item) =>
      item
        .setTitle(named ? t('library.status_set', { value: named.label }) : t('library.reading_status'))
        // Matches the reader's ⋯ menu for the same action — see there for why it is not a book with a tick.
        .setIcon('flag')
        .onClick(() => this.openStatusMenu(record, at))
    );

    // The tap that dismisses a menu on iOS lands on whatever was underneath it, which arrives as a stray focus ring —
    // and, on a row, as the book opening. Clicks are swallowed for a moment after the menu goes.
    menu.onHide(() => {
      this.menuClosedAt = Date.now();
    });
    /**
     * **`showAtPosition(at)`, not `showAtMouseEvent(event)`.** Enter or Space on a focused ⋯ fires a click with no
     * coordinates, and `showAtMouseEvent` reads `clientX`/`clientY` — so the menu would open in the top-left corner of
     * the screen, far enough from where the reader was looking to read as nothing happening at all.
     *
     * `at` is `menuPointOf(event)`, which handles both cases and is also what the submenus this menu opens use. For a
     * real click the two are the same point.
     *
     * **In this view's own window**, passed as the second argument to every menu here. Without it Obsidian shows the
     * menu in the ACTIVE window — so with Settings open in a window of its own and focused, a right-click on a cover
     * opened its menu over Settings, at the same coordinates.
     */
    menu.showAtPosition(at, this.containerEl.doc);
  }

  /**
   * The ratings, as the second step of the row menu.
   *
   * Headed by a label saying what is being chosen, since a bare column of numbers arriving where a menu just closed
   * gives no clue what it is about — the parent item is gone by the time this is on screen.
   *
   * The tick is read from the NOTE, like the status ticks beside it: setting one deliberately does not repaint, so
   * the painted row is a change behind by design.
   */
  private openRatingMenu(record: LibraryRecord, at: { x: number; y: number }): void {
    // **Opened on the next tick, not inside the parent's click handler.** The click that chooses an item also dismisses
    // the menu it is in, and that dismissal closes anything opened during the same event — so building the second menu
    // synchronously produces a menu that appears and vanishes, which is to say nothing at all.
    window.setTimeout(() => {
      // **Nothing said about native or DOM**, so this renders the way the menu it came from renders — which is the
      // reader's "Native menus" setting. Forcing a DOM menu would make the ratings gray against a black native parent
      // in the dark theme and light gray against it in the light one: two menus in one gesture, wearing two skins.
      const menu = new Menu();
      menu.addItem((item) => item.setTitle(t('library.rating')).setIsLabel(true));
      const current = this.currentRating(record);
      for (const value of OFFERED_RATINGS) {
        menu.addItem((item) =>
          item
            .setTitle(String(value))
            .setChecked(current === value)
            // No repaint of our own: writing frontmatter fires the metadata event this view already listens for.
            .onClick(() => void setRating(this.app, record.notePath, nextRating(current, value)))
        );
      }
      menu.onHide(() => {
        this.menuClosedAt = Date.now();
      });
      menu.showAtPosition(at, this.containerEl.doc);
      // Long enough to outlast the parent menu's own teardown, short enough to read as one gesture. At 0ms the
      // dismissal that follows the click reaches the new menu and closes it.
    }, MENU_STEP_MS);
  }

  /**
   * The reading statuses, as the second step of the row menu — the rating's twin.
   *
   * The tick is read from the note rather than from the painted row: setting a status deliberately does not repaint, so
   * the row is a change behind by design, and a status set in the Properties editor or arriving over sync shows here
   * without a repaint having to happen first.
   */
  private openStatusMenu(record: LibraryRecord, at: { x: number; y: number }): void {
    // Opened a tick later, for the reason `openRatingMenu` explains: the click that chooses an item also dismisses
    // the menu it is in, and that dismissal closes anything opened during the same event.
    window.setTimeout(() => {
      const menu = new Menu();
      menu.addItem((item) => item.setTitle(t('library.reading_status')).setIsLabel(true));
      const current = this.currentStatus(record);
      for (const { status, label } of statusChoices()) {
        menu.addItem((item) =>
          item
            .setTitle(label)
            .setChecked(current === status)
            // No repaint of our own: writing frontmatter fires the metadata event this view already listens for.
            .onClick(() => void setReadingStatus(this.app, record.notePath, nextStatus(current, status)))
        );
      }
      menu.onHide(() => {
        this.menuClosedAt = Date.now();
      });
      menu.showAtPosition(at, this.containerEl.doc);
    }, MENU_STEP_MS);
  }

  /** What the note says its rating is — see `currentStatus` for why the note is asked rather than the row. */
  private currentRating(record: LibraryRecord): number | null {
    const note = this.app.vault.getAbstractFileByPath(record.notePath);
    if (!(note instanceof TFile)) return record.rating;
    const fresh = parseRecord(record.notePath, this.app.metadataCache.getFileCache(note)?.frontmatter);
    return fresh ? fresh.rating : record.rating;
  }

  /**
   * The same titles and the same fields, turned sideways.
   *
   * **The title is always the first column**, and it is the only one that acts: it carries the tap, the accessible
   * name and — with the `⋯` at the far end — every action a list row has. Making the leading column configurable
   * would make the list's leading line configurable too, since the two read one list of fields, and a row whose
   * identity moves is a row you have to read twice.
   *
   * Sorting from a heading is **transient**, held on the view for as long as you are looking at it. The
   * collection owns the order; a tap on a heading is a way of reading, not a change to the widget — and a widget
   * that quietly rewrote its own configuration when you glanced at a column would be a surprise you could not
   * undo.
   */
  private renderTable<T>(
    parent: HTMLElement,
    groups: readonly RecordGroup<T>[],
    opts: {
      expanded: boolean;
      fields?: readonly string[];
      /** Which widget this is, so its heading sort is remembered while the view is open. */
      widgetId?: string;
    },
    /** How to read this species — see `TableSpec`. */
    spec: TableSpec<T>
  ): void {
    const fields = [...(opts.fields ?? spec.defaultFields)];
    const sort = opts.widgetId ? (this.tableSort.get(opts.widgetId) ?? null) : null;
    // Sorted WITHIN each group, never across them: the grouping is the collection's and a heading tap is a way of
    // reading the rows under it, not a request to dissolve the groups.
    const blocks = groups.map((group) => ({
      label: group.label,
      records: sort
        ? sortedByField(
            group.records,
            sort.key,
            sort.desc,
            // Wrapped rather than passed: a method handed over as a value loses its object, and the two here read
            // from the spec they belong to.
            (record, key) => spec.cells(record, key),
            { key: spec.leadKey, text: (record) => spec.leadText(record) }
          )
        : group.records,
    }));

    // The scroller is the table's own, so a wide table scrolls sideways inside the dashboard rather than making
    // the whole page scroll. `guardDragSwipe` for the same reason the cover strip needs it: a sideways drag on a
    // phone is also Obsidian's edge-swipe for its drawers, and the two race.
    const scroller = parent.createDiv({ cls: 'orbis-table-scroll' });
    guardDragSwipe(scroller);
    const table = scroller.createEl('table', { cls: 'orbis-table' });
    const head = table.createEl('thead').createEl('tr');
    this.renderHeaderCell(head, spec.leadKey, spec.leadHeading, opts.widgetId, sort);
    for (const key of fields) {
      this.renderHeaderCell(head, key, this.headingFor(key), opts.widgetId, sort);
    }
    // The actions column has no heading: there is nothing to sort by, and a word over a menu button would read
    // as a column of something.
    head.createEl('th', { cls: 'orbis-table-actions-head' });

    const body = table.createEl('tbody');
    for (const block of blocks) {
      // The heading, as a row of the table rather than a block above it — which is what keeps one column model
      // for every group. Sticky to the left like the title column, or panning right leaves the group nameless.
      if (block.label) {
        const groupRow = body.createEl('tr', { cls: 'orbis-table-group' });
        const cell = groupRow.createEl('td', { attr: { colspan: String(fields.length + 2) } });
        cell.createSpan({ cls: 'orbis-library-group-name', text: block.label });
        cell.createSpan({ cls: 'orbis-library-group-count', text: String(block.records.length) });
      }
      for (const record of block.records) {
        const row = body.createEl('tr');
        const titleCell = row.createEl('td', {
          cls: `orbis-table-title${spec.leadClamp ? ' is-clamped' : ''}`,
        });
        const lead = spec.leadText(record);
        const shown = spec.leadClamp ? clampToWords(lead, spec.leadClamp) : lead;
        const open = titleCell.createEl('button', { cls: 'orbis-table-title-btn', text: shown });
        // The whole passage on hover and in the accessible name, since the cell holds only its opening.
        //
        // **`aria-label` alone.** Obsidian draws its own tooltip from it, and a `title` beside it makes the browser
        // draw a second, native one over the top — two boxes of the same sentence, offset from each other.
        if (shown !== lead) open.setAttribute('aria-label', lead);
        open.addEventListener('click', () => spec.activate(record));
        // A right-click or a long press anywhere on the row opens the same menu the ⋯ does — the gesture a list row
        // and a cover both answer, so a row behaves the same way whichever shape it is drawn in.
        this.wireMenuGesture(row, (e) => spec.menu(record, e));
        for (const key of fields) {
          const cell = row.createEl('td');
          // A picture rather than a word, for the one field that is one. Species that have no such field say so by
          // answering false and the cell is filled with text like every other.
          if (spec.renderCell?.(cell, record, key)) continue;
          cell.setText(spec.cells(record, key).join(', '));
        }
        const actions = row.createEl('td', { cls: 'orbis-table-actions' });
        // The same button a list row ends with, so one ⋯ is one ⋯ wherever a row is drawn.
        const menu = this.actionButton(actions, 'more-horizontal', t('library.more_actions'), () => {});
        menu.addEventListener('click', (e) => spec.menu(record, e));
      }
    }
  }

  /** How a title note is drawn in a table: the title leads, and every action a list row has hangs off it. */
  private titleTable(naming?: LibraryCollection | null, primary?: PrimaryAction): TableSpec<LibraryRecord> {
    return {
      leadKey: 'title',
      leadHeading: t('field_heading.title'),
      leadText: (record) => record.title,
      defaultFields: DEFAULT_DISPLAY_FIELDS,
      cells: (record, key) => this.cellsOf(record, key, naming),
      activate: (record) => this.activate(record, this.capabilities(record), primary),
      menu: (record, event) => this.showRecordMenu(record, this.capabilities(record), event),
      renderCell: (cell, record, key) => {
        if (key !== 'cover') return false;
        this.renderCoverCell(cell, record);
        return true;
      },
    };
  }

  /**
   * How a reading record is drawn in a table.
   *
   * **The passage leads**, which is the same rule the list obeys: the leading column is the row's identity, and for
   * a record that is what it says rather than what it is filed under. It is what the tap acts on, so a table of
   * highlights opens the book at one exactly as a list of them does.
   *
   * No cover cell — `cover` is the BOOK's, shared by every record from it, so it is not one of a record's fields.
   */
  private recordTable(collection: LibraryCollection | null): TableSpec<ReadingRecord> {
    return {
      leadKey: 'excerpt',
      leadHeading: t('field_heading.excerpt'),
      leadClamp: PASSAGE_COLUMN_CHARS,
      leadText: (record) =>
        recordHeadline(record, {
          location: (loc) => t('library.record_at_location', { loc }),
          untitled: t('library.record_untitled'),
        }).text,
      defaultFields: DEFAULT_RECORD_FIELDS,
      // Named as the collection names them, exactly as a title's cells are: a `mark` column and a `mark` grouping
      // in one widget have to agree about what a value is called.
      cells: (record, key) =>
        recordCells(record, key).map((value) =>
          labelOf(effectiveValues(collection?.fieldValues?.[key], fieldValuesFor(key)), value)
        ),
      activate: (record) => void this.openRecordPassage(record),
      menu: (record, event) => this.showReadingRecordMenu(record, event),
    };
  }

  /** One heading: what the column is called, and a tap to order by it. */
  private renderHeaderCell(
    row: HTMLElement,
    key: string,
    label: string,
    widgetId: string | undefined,
    sort: { key: string; desc: boolean } | null
  ): void {
    const cell = row.createEl('th');
    const active = sort?.key === key;
    const btn = cell.createEl('button', { cls: `orbis-table-head${active ? ' is-sorted' : ''}`, text: label });
    // Said in the accessible name rather than only in an arrow, since the arrow is the one part of a heading a
    // screen reader cannot describe.
    btn.setAttribute(
      'aria-label',
      active ? t(sort.desc ? 'library.sorted_desc' : 'library.sorted_asc', { label }) : t('library.sort_by', { label })
    );
    if (active) setIcon(cell.createSpan({ cls: 'orbis-table-head-arrow' }), sort.desc ? 'arrow-down' : 'arrow-up');
    if (!widgetId) return;
    btn.addEventListener('click', () => {
      // Ascending, then descending, then back to the collection's own order — so a heading tapped by accident
      // has a way out that does not require knowing what the order was before.
      const next = !active ? { key, desc: false } : sort.desc ? null : { key, desc: true };
      if (next) this.tableSort.set(widgetId, next);
      else this.tableSort.delete(widgetId);
      this.render();
    });
  }

  /** A cover, small, in a cell — the one field whose value is a picture rather than a word. */
  private renderCoverCell(cell: HTMLElement, record: LibraryRecord): void {
    const url = this.coverUrl(record);
    if (!url) return;
    const img = cell.createEl('img', { cls: 'orbis-table-cover' });
    img.src = url;
    img.alt = '';
  }

  /** This record's values for a field, named as the arranging collection names them. */
  private cellsOf(record: LibraryRecord, key: string, naming?: LibraryCollection | null): string[] {
    return fieldCells(record, key, effectiveValues(naming?.fieldValues?.[key], fieldValuesFor(key)));
  }

  /** What a column of this field is called — the reader's caption, our own word, or the key made readable. */
  private headingFor(key: string): string {
    const named = namedKeyLabel(key);
    const field = libraryFields().find((entry) => entry.key === key);
    return fieldHeading(key, field?.label, named ? t(named) : '');
  }

  /**
   * One record as a cover tile.
   *
   * **No buttons under the art.** A grid of covers with an action strip on every tile is a list with pictures, and
   * the thing a shelf is good at — recognizing a book without reading anything — is exactly what the clutter
   * destroys. The tap does the obvious thing; a widget set to the list view is where the rest of the actions live.
   */
  private renderTile(
    parent: HTMLElement,
    record: LibraryRecord,
    caps: Capabilities,
    primary?: PrimaryAction,
    fields?: readonly string[],
    naming?: LibraryCollection | null
  ): void {
    /**
     * **A wrapper, and the cover and the ⋯ as siblings inside it** — the same shape as `orbis-library-row` and for the
     * same reason its comment gives: a button inside a button is invalid and the inner one stops working.
     *
     * The wrapper takes the grid/strip layout, so `.orbis-library-grid` and `.orbis-library-strip` lay out one box per
     * title.
     */
    const wrap = parent.createDiv({ cls: 'orbis-library-tile-wrap' });
    const tile = wrap.createEl('button', { cls: 'orbis-library-tile' });
    const meta = this.metaLine(record, fields, naming);
    // A cover carries no text a screen reader or a hover can use, and an unrecognised one is the whole reason to ask.
    //
    // **`aria-label` alone.** Obsidian draws its own tooltip from it, and a `title` beside it makes the browser draw a
    // second, native one below — two boxes of the same sentence at once.
    tile.setAttribute('aria-label', meta ? `${record.title} — ${meta}` : record.title);
    const url = this.coverUrl(record);
    if (url) {
      const img = tile.createEl('img', { cls: 'orbis-library-tile-cover' });
      img.alt = '';
      // Belt to the CSS's braces: WebKit's long-press drag starts from the element's own draggable state, and an
      // image is draggable by default.
      img.draggable = false;
      // Thousands of tiles on a Show all, of which a phone screen holds a dozen: decoding the rest is work done
      // for nothing, and on a large catalog it is the difference between a grid and a stall.
      img.loading = 'lazy';
      img.src = url;
      // A `cover:` pointing at something that is not an image, or at a file that has gone: the generated tile is
      // already the answer for a record with no cover at all, so a broken one becomes the same thing.
      img.addEventListener('error', () => {
        img.remove();
        this.renderGeneratedTile(tile, record);
      });
    } else {
      this.renderGeneratedTile(tile, record);
    }
    tile.addEventListener('click', () => this.activate(record, caps, primary));

    /**
     * **The second tab stop, and the only keyboard route to a cover's menu.**
     *
     * A right-click and a long press both open this menu, and on Windows and Linux so does Shift+F10 — the browser
     * synthesises `contextmenu` from it. macOS has neither that binding nor a Menu key, so without this a cover could
     * be focused and opened and nothing else. It carries the same label as the row's ⋯, so one thing has one name in
     * both views.
     *
     * Hidden until the wrapper is hovered or something inside it has focus — see the CSS, which also keeps it out
     * of the layout so a grid does not reflow as focus moves through it.
     */
    const more = this.actionButton(wrap, 'more-horizontal', t('library.more_actions'), () => {});
    more.addClass('orbis-library-tile-more');
    more.addEventListener('click', (e) => {
      // The wrapper is not the tile, but a click here would still reach the strip's own handlers.
      e.stopPropagation();
      this.showRecordMenu(record, caps, e);
    });

    this.wireTileMenu(tile, record, caps);
  }

  /**
   * The same menu as a row's ⋯, from a right-click or a long press.
   *
   * **`contextmenu` is all of it, on every platform.** A long press fires it in Obsidian's webview on Android and on
   * iOS as well as with a right-click on the desktop. A press timer of its own here would open the menu on iPad a
   * second time after WebKit's long press, and the touch that ended the gesture would dismiss what was left. One event,
   * one menu.
   */
  private wireTileMenu(tile: HTMLElement, record: LibraryRecord, caps: Capabilities): void {
    this.wireMenuGesture(tile, (e) => this.showRecordMenu(record, caps, e));
  }

  /**
   * Open a menu from a right-click, and from a press that does not have to be held as long as WebKit wants.
   *
   * **Both paths, with a guard between them.** `contextmenu` is the whole story on the desktop and on Android, and
   * it fires on iOS too — but only after WebKit's own ~700ms long press, which reads as the app not answering. So
   * a touch also starts a timer of our own at less than half that, and whichever fires first wins: the timer marks
   * a short window in which the `contextmenu` that follows is swallowed, which is what stops iPad opening the menu
   * twice and dismissing it on the way out.
   *
   * The press cancels on movement, so a swipe along a strip of covers stays a swipe, and the tap that ends the
   * gesture is suppressed in the capture phase — otherwise letting go would also open the book.
   */
  private wireMenuGesture(el: HTMLElement, open: (event: MouseEvent) => void): void {
    let suppressUntil = 0;
    let opened = false;
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (Date.now() < suppressUntil) return;
      open(e);
    });

    let timer: number | null = null;
    let start: { x: number; y: number } | null = null;
    const cancel = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      start = null;
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // the right-click above is the pointer's way in
      opened = false;
      start = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        opened = true;
        // Long enough to cover WebKit's own long press arriving after ours, short enough that a deliberate second
        // press is never eaten.
        suppressUntil = Date.now() + 1500;
        open(e);
      }, 320);
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8) cancel();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, cancel);
    // The tap that dismissed a menu falls through to whatever was under it, and preventing its CLICK is not
    // enough: iOS has already focused the button by then, which is the outline that appeared on the row below.
    // Taking the pointerdown is what stops the focus, and with it the click that would have followed.
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (Date.now() - this.menuClosedAt > 400) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
    el.addEventListener(
      'click',
      (e) => {
        // Ours to swallow twice over: the tap that ends the press, and the one that dismissed a menu a moment ago.
        if (!opened && Date.now() - this.menuClosedAt > 400) return;
        opened = false;
        e.preventDefault();
        e.stopPropagation();
        const focused = activeDocument.activeElement;
        if (focused?.instanceOf(HTMLElement)) focused.blur();
      },
      true
    );
  }

  /**
   * A tile for a title with no cover image: the title, the author, and a color derived from the title.
   *
   * Laid out as a plain typographic cover — title at the top, author at the foot — because that is what a cover
   * Laid out as a plain typographic cover — title at the top, author at the foot — because that is what a cover with no
   * artwork IS, and because the thing being asked of it is to be read. A large monogram of the title's initials would
   * take the space the title needs to wrap into and say less than the two letters it costs ("SB" for Sample Book).
   *
   * Rendered rather than drawn into an image, so it costs nothing to produce, follows the theme's fonts and stays
   * legible at any tile size. The color is the point — it makes a coverless shelf learnable instead of uniform.
   */
  private renderGeneratedTile(tile: HTMLElement, record: LibraryRecord): void {
    // Straight onto the tile: it already has the 2:3 footprint every generated cover wants, and the renderer
    // makes its own child to fill it.
    renderGeneratedCover(tile, record.title, record.authors[0]);
  }

  /** The record's cover as something an `<img>` can load, or null when it has none that resolves. */
  private coverUrl(record: LibraryRecord): string | null {
    if (!record.cover) return null;
    const file = resolveRecordFile(this.app, record.cover, record.notePath);
    return file ? this.app.vault.getResourcePath(file) : null;
  }

  /**
   * What tapping a title does, in every view.
   *
   * The rule itself is in `primaryActionFor`, where it can be read and tested; this is only the wiring. Rows and
   * tiles share it so that switching a widget between views never changes what a tap means.
   */
  private activate(record: LibraryRecord, caps: Capabilities, prefer?: PrimaryAction): void {
    switch (primaryActionFor(caps, prefer)) {
      case 'read':
        if (caps.readPath) void this.openBook(caps.readPath);
        return;
      case 'listen':
        if (caps.readPath) void this.listenToBook(caps.readPath);
        return;
      case 'source':
        this.openSource(caps.sourceUrl);
        return;
      default:
        void this.openRecord(record);
    }
  }

  /** An icon button in a row's action strip, on Obsidian's own clickable-icon styling. */
  private actionButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLElement {
    const btn = parent.createEl('button', { cls: 'clickable-icon orbis-library-act' });
    setIcon(btn, icon);
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private async openBook(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await openBookForReading(this.app, file);
  }

  private async listenToBook(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await startListeningTo(this.app, file);
  }

  /** The book's `.orbis` view — highlights, notes, bookmarks and stats, in the view already built for them. */
  private async openData(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await openBookDataFile(this.app, file);
  }

  private openSource(url: string): void {
    try {
      window.open(url);
    } catch {
      new Notice(t('library.open_source_failed', { url }));
    }
  }

  /**
   * Authors, then whatever else identifies the title, joined with the separator used elsewhere in the reader.
   *
   * **Neither `type` nor `genre` is here.** Every cataloged title is a `book`, so `type` would put the same word on
   * the end of every row in the library.
   */
  /**
   * The line under a title, or a cover's tooltip: the fields this widget was told to show.
   *
   * `naming` is the collection whose value names apply — a status column and a status heading in the same widget
   * have to agree about what `read` is called.
   */
  private metaLine(record: LibraryRecord, fields?: readonly string[], naming?: LibraryCollection | null): string {
    return metaLineFor(record, fields, (key) => effectiveValues(naming?.fieldValues?.[key], fieldValuesFor(key)));
  }

  /**
   * Open the record's note.
   */
  private async openRecord(record: LibraryRecord): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(record.notePath);
    if (file instanceof TFile) await openNoteBeside(this.app, file);
  }
}

/** Open the Library, reusing its tab when one is already open. */
export async function openLibraryView(plugin: IOrbisReaderPlugin): Promise<void> {
  const existing = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS_LIBRARY);
  if (existing.length > 0) {
    await plugin.app.workspace.revealLeaf(existing[0]);
    return;
  }
  const leaf = plugin.app.workspace.getLeaf(true);
  await leaf.setViewState({ type: VIEW_TYPE_ORBIS_LIBRARY, active: true });
  await plugin.app.workspace.revealLeaf(leaf);
}

/** Repaint every open Library — called when collections change in settings. */
export function refreshLibraryViews(plugin: IOrbisReaderPlugin): void {
  for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS_LIBRARY)) {
    const view = leaf.view;
    if (view instanceof LibraryView) view.refresh();
  }
}
