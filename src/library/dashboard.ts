// Dashboards and the widgets on them. See docs/design/library.md.
//
// A dashboard is an ordered list of widgets; a widget shows something in a view, with a count. The collection says
// WHAT, the widget says HOW — which is what lets one collection appear twice on a dashboard, five titles as covers
// and all of them as a list, and why the view is not a property of the collection.
//
// Pure: no vault, no settings object being mutated in place. The interesting parts are the default dashboard's
// contents and what happens when the active one is missing, and both are exactly the kind of thing that should be
// pinned by a test rather than discovered on someone's install.

import type {
  DashboardWidget,
  LibraryCollection,
  LibraryDashboard,
  LibraryViewType,
  NoteSpecies,
  WidgetKind,
} from '../settings';
import { collectionsOfSpecies } from './collection-species';
import { type DashboardPlace, dashboardEnabled, orderedDashboards } from './dashboard-order';

/** Stable ids for the things Orbis owns, so each load can recognize its own work and replace it. */
export const SYSTEM_COLLECTION_ID = 'collection-all-titles';
export const SYSTEM_RECORD_COLLECTION_ID = 'collection-all-reading-records';
export const DEFAULT_DASHBOARD_ID = 'dashboard-default';
export const CONTINUE_WIDGET_ID = 'widget-continue';
export const RECORDINGS_WIDGET_ID = 'widget-recordings';
export const PICK_WIDGET_ID = 'widget-pick';
export const RECENT_WIDGET_ID = 'widget-recent';

/**
 * How many titles Continue shows: a way back to what you were doing, not a second copy of the catalog.
 *
 * Ten as covers, where twelve rows read as a second catalog: artwork is recognized at a glance rather than read,
 * so a few more of it costs less attention than a few more rows. Everything past it is one tap away behind
 * Show all.
 */
export const CONTINUE_COUNT = 10;

/**
 * Everything in the catalog, as an ordinary collection.
 *
 * **No special case in the matcher**: a record IS a note with a title, so "everything" is the single condition
 * `title exists`. Saying it in the same language every other collection uses means you can open this one and see
 * why it works.
 */
export function systemCollection(name: string): LibraryCollection {
  return {
    id: SYSTEM_COLLECTION_ID,
    name,
    // Redundant, since no conditions means every title — kept so an existing vault's copy and a fresh one are the
    // same collection, and because `title exists` is true of every title note anyway.
    ruleSets: [{ match: 'all', rules: [{ field: 'title', op: 'exists', value: '' }] }],
    sort: [{ key: 'title' }],
    system: true,
  };
}

/**
 * The provided collection for the other species: every reading record in the vault.
 *
 * **Records need one of their own, on the same terms.** A reader making their first record collection has nothing
 * to copy otherwise, and "everything, arranged my way" is the commonest thing to want first. No conditions, since
 * none means every note of the species.
 */
export function systemRecordCollection(name: string): LibraryCollection {
  return {
    id: SYSTEM_RECORD_COLLECTION_ID,
    name,
    species: 'reading_record',
    // Reading order within each book — the order a record collection is worth reading in, and what `buildCatalog`
    // already sorts by.
    sort: [{ key: 'book_title' }],
    system: true,
  };
}

/**
 * The collection a new widget starts on: **the provided All titles**, whatever order the vault listed things in.
 *
 * Not `collections[0]`: a collection is a file of its own, so the array's order is whatever the vault happens to
 * return, and whichever file was read first is neither a default nor an accident anyone can predict.
 *
 * Falls back to the first title collection by name, then to whatever there is, so a vault whose provided collection
 * has been deleted still opens the dialog on something drawable. The kind a new widget starts as is a title kind, so
 * the species is not a parameter: a record collection here would be a widget that cannot answer its own question.
 */
export function defaultWidgetCollection(collections: readonly LibraryCollection[]): string {
  if (collections.some((collection) => collection.id === SYSTEM_COLLECTION_ID)) return SYSTEM_COLLECTION_ID;
  return collectionsOfSpecies(collections, 'title')[0]?.id ?? collections[0]?.id ?? '';
}

/**
 * Which kinds a widget can be, given the species its collection gathers.
 *
 * **A kind is a question, and half the questions are about books.** "What am I part-way through", "what has audio
 * beside it", "suggest one I have never opened" — none of those means anything for a highlight, and a `covers` view
 * of records would be a strip of the same cover repeated. A record collection offers the kinds that are about a set
 * of notes: all of them, the newest, and a search.
 *
 * `summary` counts groups rather than showing them, so it applies to any species that can be grouped — which
 * both can, through one arranger. `pick`, `continue` and `recordings` remain title-only because the questions
 * themselves are about books.
 */
export function widgetKindsFor(species: NoteSpecies): WidgetKind[] {
  if (species === 'reading_record') return ['records', 'recent', 'search', 'summary'];
  return ['titles', 'search', 'continue', 'recent', 'recordings', 'pick', 'summary'];
}

/**
 * Which views a species can be drawn in.
 *
 * A record has no artwork of its own — `cover` is the book's, shared by every record from it — so a strip of covers
 * over a collection of highlights would be one picture repeated with no way to tell the rows apart. Everything else
 * a species can be drawn as, it can be drawn as.
 */
export function widgetViewsFor(species: NoteSpecies): LibraryViewType[] {
  return species === 'reading_record' ? ['list', 'table'] : ['list', 'covers', 'table'];
}

/** What a widget of this species is by default: the plain "all of it" kind, and a list. */
export function defaultKindFor(species: NoteSpecies): WidgetKind {
  return species === 'reading_record' ? 'records' : 'titles';
}

export const SEARCH_WIDGET_ID = 'widget-search';

/** How many titles the shelves below Continue hold: a strip's worth, and the rest is a tap away. */
const SHELF_COUNT = 10;

/** How many books the pick suggests. One is a suggestion; a row of them is another shelf. */
const PICK_COUNT = 1;

/** How many search results to show before it becomes a list to scroll rather than an answer. */
const SEARCH_COUNT = 20;

/**
 * The dashboard Orbis provides: what you are reading, a way to look for anything, what you could start, what you
 * can listen to, what just arrived, and anything not yet cataloged.
 *
 * **Rebuilt from this code on every load, never read back from disk.** Only its on/off flag is remembered. That is
 * what makes it safe for an update to change — there is no stored copy to migrate and no user edit to overwrite,
 * because editing it is not offered. Anyone who wants it different copies it, and their copy is theirs forever.
 *
 * Continue leads because it is the most likely reason the view was opened; search follows, because a catalog of
 * thousands is looked at THROUGH a box; the shelves after it are what to do when nothing particular is in mind.
 */
export function defaultDashboard(name: string): LibraryDashboard {
  const widgets: DashboardWidget[] = [
    {
      id: CONTINUE_WIDGET_ID,
      kind: 'continue',
      collection: SYSTEM_COLLECTION_ID,
      view: 'covers',
      count: CONTINUE_COUNT,
      // Expands to a list: past the handful you are actually in the middle of, "which book was that" gives way to
      // "show me all of them", and a list says more per row than a cover does.
      expandedView: 'list',
      enabled: true,
      system: true,
    },
  ];
  // Between the two: a search box, a book to start, what can be listened to, and what just arrived. Search leads
  // because a catalog of thousands is a thing you look INTO — the shelves below it are what to do when you have
  // nothing particular in mind.
  widgets.splice(
    1,
    0,
    {
      id: SEARCH_WIDGET_ID,
      kind: 'search',
      collection: SYSTEM_COLLECTION_ID,
      view: 'list',
      count: SEARCH_COUNT,
      expandedView: 'list',
      enabled: true,
      system: true,
    },
    {
      id: PICK_WIDGET_ID,
      kind: 'pick',
      collection: SYSTEM_COLLECTION_ID,
      view: 'covers',
      count: PICK_COUNT,
      enabled: true,
      system: true,
    },
    {
      id: RECORDINGS_WIDGET_ID,
      kind: 'recordings',
      collection: SYSTEM_COLLECTION_ID,
      view: 'covers',
      count: SHELF_COUNT,
      expandedView: 'list',
      enabled: true,
      system: true,
    },
    {
      id: RECENT_WIDGET_ID,
      kind: 'recent',
      collection: SYSTEM_COLLECTION_ID,
      view: 'list',
      count: SHELF_COUNT,
      expandedView: 'list',
      enabled: true,
      system: true,
    }
  );
  return { id: DEFAULT_DASHBOARD_ID, name, widgets, system: true };
}

/** The dashboards that can be opened. A missing flag means yes, so anything written earlier still works. */
export function enabledDashboards(
  dashboards: LibraryDashboard[],
  order?: readonly DashboardPlace[]
): LibraryDashboard[] {
  // **This device's list decides, not the dashboard.** On/off is a statement about a device — switch one off on the
  // desktop and it should stay live on the phone — so it lives in `libraryDashboardOrder`, not in the synced file.
  //
  // **With no list, nothing is reordered.** That case is the load between an upgrade and the list being settled,
  // where the array IS this device's order and its flags are the answer it already gave. The created-stamp fallback
  // belongs to `settledOrder`, which runs when a device meets these dashboards for the first time — applying it
  // here would reshuffle a list the reader arranged, on the one load before their order was written down.
  if (!order) return dashboards.filter((d) => dashboardOffered(d));
  return orderedDashboards(dashboards, order).filter((d) => dashboardOffered(d, order));
}

/**
 * Whether this device offers a dashboard: the question `enabledDashboards` asks of each, and the one the settings
 * row answers with "Switched off". The row used to read the dashboard's own flag, which the switch no longer writes,
 * so a dashboard switched off here never said so.
 */
export function dashboardOffered(dashboard: LibraryDashboard, order?: readonly DashboardPlace[]): boolean {
  return order ? dashboardEnabled(dashboard.id, order) : dashboard.enabled !== false;
}

/**
 * The dashboard to open.
 *
 * Falls back to the first available rather than to nothing: an id pointing at a deleted or switched-off dashboard
 * is a state a synced vault can reach on its own, and a blank Library would be a worse answer than a different
 * dashboard. Falls back to the whole list only if every one is switched off, because showing something the reader
 * turned off beats showing nothing with no way back.
 */
export function activeDashboard(
  dashboards: LibraryDashboard[],
  activeId: string,
  order?: readonly DashboardPlace[]
): LibraryDashboard | null {
  if (dashboards.length === 0) return null;
  const available = enabledDashboards(dashboards, order);
  const named = available.find((d) => d.id === activeId);
  return named ?? available[0] ?? dashboards[0];
}

/**
 * Whether a widget takes the collection's grouping and sort, as well as its filters.
 *
 * **A kind that IS an ordering ignores the collection's ordering; a kind that is only a filter takes it.** Continue
 * means "most recently opened", recently-added means "by the date the record carries", a pick means "one, chosen" —
 * a collection's sort applied to any of those would be a contradiction someone could configure and nobody could
 * want. Titles and recorded-audio are filters over a population, so how that population is arranged is exactly the
 * collection's business.
 *
 * Search is the awkward one and gets a switch of its own: it generates an ordering (best match first) that the
 * collection's sort would flatten, so `searchOrder` decides, defaulting to the ranking search worked out.
 */
export function widgetTakesArrangement(widget: DashboardWidget): boolean {
  if (widget.kind === 'search') return widget.searchOrder === 'collection';
  // `records` is the record species' `titles`: the collection itself, so the collection's order is the whole point.
  return widget.kind === 'titles' || widget.kind === 'records' || widget.kind === 'recordings';
}

/** The widgets that should actually paint, in order. */
export function visibleWidgets(dashboard: LibraryDashboard | null): DashboardWidget[] {
  return (dashboard?.widgets ?? []).filter((widget) => widget.enabled);
}

/**
 * A widget's heading.
 *
 * Its own label wins, then the collection's name, then the word for its kind. The label exists because one
 * collection can appear twice on a dashboard and the two headings have to differ — and because "Continue" reads
 * better than whatever its underlying collection would be called.
 */
export function widgetLabel(
  widget: Pick<DashboardWidget, 'kind' | 'collection' | 'label'>,
  collections: LibraryCollection[],
  kindLabels: Record<string, string>
): string {
  if (widget.label?.trim()) return widget.label.trim();
  if (widget.kind === 'titles') {
    const collection = collections.find((c) => c.id === widget.collection);
    if (collection) return collection.name;
  }
  return kindLabels[widget.kind] ?? '';
}

/** How many titles to show: the widget's count, or all of them when it does not say. */
export function widgetSlice<T>(items: T[], widget: DashboardWidget): T[] {
  return widget.count === undefined ? items : items.slice(0, Math.max(0, widget.count));
}

/**
 * What a widget actually shows: its collection's order, then its count — **in that order**.
 *
 * The order of these two operations is the whole function. Slicing first takes ten arbitrary records and sorts
 * those, which looks right and is wrong in the way that matters: a shelf of "series number at least 3" would open
 * on ten titles that all begin with "1", because the pool arrives in path order and the sort would only see the ten.
 *
 * `arrange` is passed in rather than done here, because sorting needs the vault — what a record's last-opened time
 * is, what a collection calls a value. A kind that IS an ordering skips it: Continue is already newest-first and a
 * pick is already chosen, so re-sorting them would contradict the question they answer.
 */
export function widgetShown<T>(records: T[], widget: DashboardWidget, arrange: (items: T[]) => T[]): T[] {
  return widgetSlice(widgetTakesArrangement(widget) ? arrange(records) : records, widget);
}

/**
 * What a widget's expand button says: "Show all" when it opens the same view, and otherwise the view it opens —
 * "List view" under a shelf of covers says what the button is FOR, where "Show all" would promise more titles and
 * deliver the same ten in words. A table used to fall through to "Cover view".
 */
export function expandLabelKey(
  widget: Pick<DashboardWidget, 'view' | 'expandedView'>
): 'library.show_all' | 'library.show_as_list' | 'library.show_as_covers' | 'library.show_as_table' {
  if (!widget.expandedView || widget.expandedView === widget.view) return 'library.show_all';
  const keys = {
    list: 'library.show_as_list',
    covers: 'library.show_as_covers',
    table: 'library.show_as_table',
  } as const;
  return keys[widget.expandedView];
}

/**
 * Whether to offer the expanded view.
 *
 * Two reasons to offer it, and only one of them is about counting. **More titles than are showing** is the obvious
 * one. **A different view of the same titles** is the other: a strip of covers shows artwork and nothing else, so
 * "see these as a list" is worth offering even when the list would hold exactly the same ten titles. Offering it
 * only when something is held back would leave no way to read the titles under a shelf of covers except hoping
 * there are enough of them.
 *
 * Same view and nothing held back is the one case with nothing to offer — there the button would open a page
 * identical to the one you are looking at.
 */
export function widgetCanExpand(total: number, widget: DashboardWidget): boolean {
  if (widget.expandedView === undefined) return false;
  if (widget.expandedView !== widget.view) return true;
  return widget.count !== undefined && total > widget.count;
}
