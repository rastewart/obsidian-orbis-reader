import { describe, expect, it } from 'vitest';
import {
  activeDashboard,
  CONTINUE_COUNT,
  CONTINUE_WIDGET_ID,
  DEFAULT_DASHBOARD_ID,
  dashboardOffered,
  defaultDashboard,
  defaultKindFor,
  defaultWidgetCollection,
  enabledDashboards,
  expandLabelKey,
  PICK_WIDGET_ID,
  RECENT_WIDGET_ID,
  RECORDINGS_WIDGET_ID,
  SEARCH_WIDGET_ID,
  SYSTEM_COLLECTION_ID,
  systemCollection,
  visibleWidgets,
  widgetCanExpand,
  widgetKindsFor,
  widgetLabel,
  widgetShown,
  widgetSlice,
  widgetTakesArrangement,
  widgetViewsFor,
} from '../library/dashboard';
import type { DashboardWidget, LibraryCollection, LibraryDashboard } from '../settings';

const collection = (id: string, name: string): LibraryCollection => ({ id, name, ruleSets: [] });

const widget = (over: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id: 'w',
  kind: 'titles',
  collection: 'a',
  view: 'list',
  enabled: true,
  ...over,
});

const KIND_LABELS = { continue: 'Continue', titles: 'Titles' };

describe('defaultDashboard', () => {
  it('is the five Orbis provides, in order', () => {
    const dash = defaultDashboard('Library');
    expect(dash.widgets.map((w) => w.kind)).toEqual(['continue', 'search', 'pick', 'recordings', 'recent']);
    expect(dash.widgets[0].count).toBe(CONTINUE_COUNT);
    // What you are in the middle of is the one place artwork beats a row: a handful of covers, recognized rather
    // than read.
    expect(dash.widgets[0].view).toBe('covers');
    expect(dash.id).toBe(DEFAULT_DASHBOARD_ID);
    expect(dash.system).toBe(true);
  });

  // An alphabetical window onto thousands of titles answers no question anyone actually has — the search box is
  // what a catalog that size is looked at THROUGH. The collection such a widget would show still exists to build on.
  it('shows no everything-widget', () => {
    expect(defaultDashboard('Library').widgets.some((w) => w.kind === 'titles')).toBe(false);
    expect(systemCollection('All titles').id).toBe(SYSTEM_COLLECTION_ID);
  });

  // Every kind is scoped by a collection, so every provided widget names one — the system collection, which is
  // every title in the vault.
  it('draws every widget from the system collection', () => {
    expect(defaultDashboard('Library').widgets.every((w) => w.collection === SYSTEM_COLLECTION_ID)).toBe(true);
  });

  // Every limited widget on the provided dashboard can be opened in full: a count you cannot get past is a dead
  // end. The pick is the exception — it holds nothing back, it chooses, and its button asks for another.
  it('gives every widget that holds titles back a way to see them', () => {
    for (const w of defaultDashboard('Library').widgets) {
      if (w.count !== undefined && w.kind !== 'pick') expect(w.expandedView).toBeDefined();
    }
  });

  // Nothing about it is read back from disk, so every widget is Orbis's to replace on the next update.
  it('marks every widget as its own', () => {
    expect(defaultDashboard('Library').widgets.every((w) => w.system)).toBe(true);
    expect(defaultDashboard('Library').widgets.map((w) => w.id)).toEqual([
      CONTINUE_WIDGET_ID,
      SEARCH_WIDGET_ID,
      PICK_WIDGET_ID,
      RECORDINGS_WIDGET_ID,
      RECENT_WIDGET_ID,
    ]);
  });
});

describe('systemCollection', () => {
  // "Everything" said in the same language as every other collection, so it can be read and understood rather than
  // taken on trust — and so the matcher needs no branch for it.
  it('is one ordinary condition: a note with a title', () => {
    const collection = systemCollection('All titles');
    expect(collection.ruleSets).toEqual([{ match: 'all', rules: [{ field: 'title', op: 'exists', value: '' }] }]);
    expect(collection.id).toBe(SYSTEM_COLLECTION_ID);
    expect(collection.system).toBe(true);
  });
});

describe('activeDashboard', () => {
  const dashboards: LibraryDashboard[] = [
    { id: 'one', name: 'One', widgets: [] },
    { id: 'two', name: 'Two', widgets: [] },
  ];

  it('opens the one named', () => {
    expect(activeDashboard(dashboards, 'two')?.id).toBe('two');
  });

  // A synced vault can reach this state on its own, and a blank Library is a worse answer than the wrong
  // dashboard.
  it('falls back to the first when the active one is gone', () => {
    expect(activeDashboard(dashboards, 'deleted')?.id).toBe('one');
    expect(activeDashboard(dashboards, '')?.id).toBe('one');
  });

  it('is null only when there are none', () => {
    expect(activeDashboard([], 'one')).toBeNull();
  });
});

describe('visibleWidgets', () => {
  it('drops the disabled ones and keeps the order', () => {
    const dash: LibraryDashboard = {
      id: 'd',
      name: 'D',
      widgets: [widget({ id: 'a' }), widget({ id: 'b', enabled: false }), widget({ id: 'c' })],
    };
    expect(visibleWidgets(dash).map((w) => w.id)).toEqual(['a', 'c']);
    expect(visibleWidgets(null)).toEqual([]);
  });
});

describe('widgetLabel', () => {
  const collections = [collection('a', 'Orbis Tester')];

  it('prefers its own label, so one collection can appear twice with different headings', () => {
    expect(widgetLabel(widget({ label: 'Recently added', collection: 'a' }), collections, KIND_LABELS)).toBe(
      'Recently added'
    );
  });

  it('falls back to the collection name, then to the kind', () => {
    expect(widgetLabel(widget({ collection: 'a' }), collections, KIND_LABELS)).toBe('Orbis Tester');
    // A derived kind is named for what it selects, not for the collection it selects from — "Orbis Tester" over a
    // shelf of what you are part-way through would be a lie about which titles are underneath it.
    expect(widgetLabel(widget({ kind: 'continue' }), collections, KIND_LABELS)).toBe('Continue');
    // A collection that has been deleted leaves a widget behind; it should still say something.
    expect(widgetLabel(widget({ collection: 'gone' }), collections, KIND_LABELS)).toBe('Titles');
  });

  it('ignores a label that is only whitespace', () => {
    expect(widgetLabel(widget({ label: '   ', collection: 'a' }), collections, KIND_LABELS)).toBe('Orbis Tester');
  });
});

// A kind that IS an ordering ignores the collection's; a kind that is only a filter takes it.
describe('widgetTakesArrangement', () => {
  it('lets a filtering kind be arranged by its collection', () => {
    expect(widgetTakesArrangement(widget({ kind: 'titles' }))).toBe(true);
    expect(widgetTakesArrangement(widget({ kind: 'recordings' }))).toBe(true);
  });

  it('refuses for a kind that is an ordering of its own', () => {
    expect(widgetTakesArrangement(widget({ kind: 'continue' }))).toBe(false);
    expect(widgetTakesArrangement(widget({ kind: 'recent' }))).toBe(false);
    expect(widgetTakesArrangement(widget({ kind: 'pick' }))).toBe(false);
  });

  // Search is the one that can go either way, because it produces a ranking the collection's sort would flatten.
  it('lets search choose, defaulting to best match', () => {
    expect(widgetTakesArrangement(widget({ kind: 'search' }))).toBe(false);
    expect(widgetTakesArrangement(widget({ kind: 'search', searchOrder: 'match' }))).toBe(false);
    expect(widgetTakesArrangement(widget({ kind: 'search', searchOrder: 'collection' }))).toBe(true);
  });
});

// **The order of the two operations is what this pins.** Slicing first would take ten arbitrary records and sort
// those, so a shelf of "series number at least 3" would open on ten titles that all begin with "1": the pool
// arrives in path order and the sort would only ever see the ten it was handed.
describe('widgetShown', () => {
  const items = ['d', 'a', 'c', 'b'];
  const sorted = (list: string[]): string[] => [...list].sort();

  it('arranges before it cuts', () => {
    expect(widgetShown(items, widget({ kind: 'titles', count: 2 }), sorted)).toEqual(['a', 'b']);
  });

  // The other way round, for contrast: this is what cutting first would produce.
  it('is not the same as cutting before arranging', () => {
    expect(sorted(items.slice(0, 2))).toEqual(['a', 'd']);
    expect(widgetShown(items, widget({ kind: 'titles', count: 2 }), sorted)).not.toEqual(['a', 'd']);
  });

  // Continue is already newest-first and a pick is already chosen: re-sorting either would contradict the question
  // it answers.
  it('leaves a kind that is its own ordering alone', () => {
    expect(widgetShown(items, widget({ kind: 'continue', count: 2 }), sorted)).toEqual(['d', 'a']);
  });

  it('shows everything when the widget names no count', () => {
    expect(widgetShown(items, widget({ kind: 'titles' }), sorted)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('widgetSlice / widgetCanExpand', () => {
  const items = [1, 2, 3, 4, 5];

  it('shows all of them when the widget says no count', () => {
    expect(widgetSlice(items, widget())).toEqual(items);
  });

  it('takes the first n when it does', () => {
    expect(widgetSlice(items, widget({ count: 2 }))).toEqual([1, 2]);
    expect(widgetSlice(items, widget({ count: 0 }))).toEqual([]);
  });

  // Offering an expanded view identical to the one on screen is a button that does nothing.
  it('offers more only when there is more, and only when expansion is configured', () => {
    expect(widgetCanExpand(5, widget({ count: 2, expandedView: 'list' }))).toBe(true);
    expect(widgetCanExpand(2, widget({ count: 2, expandedView: 'list' }))).toBe(false);
    expect(widgetCanExpand(5, widget({ count: 2 }))).toBe(false);
    expect(widgetCanExpand(5, widget({ expandedView: 'list' }))).toBe(false);
  });

  // A strip of covers shows artwork and nothing else, so reading the titles is a reason to expand on its own —
  // even when the list would hold exactly the titles already on screen.
  it('offers a different view of the same titles', () => {
    expect(widgetCanExpand(3, widget({ view: 'covers', count: 10, expandedView: 'list' }))).toBe(true);
    expect(widgetCanExpand(3, widget({ view: 'covers', expandedView: 'list' }))).toBe(true);
  });
});

// Available and current are different questions: one says whether a dashboard can be opened, the other says which
// one is open. Conflating them is what a per-dashboard "active" flag would have done.
describe('enabled dashboards', () => {
  const list: LibraryDashboard[] = [
    { id: 'one', name: 'One', widgets: [], enabled: false },
    { id: 'two', name: 'Two', widgets: [] },
    { id: 'three', name: 'Three', widgets: [], enabled: true },
  ];

  it('offers only the ones switched on, treating a missing flag as on', () => {
    expect(enabledDashboards(list).map((d) => d.id)).toEqual(['two', 'three']);
  });

  // The settings row says "Switched off" from this — it used to read the synced flag the switch no longer writes.
  it("asks this device's list, not the dashboard's own flag, once there is a list", () => {
    const order = [
      { id: 'one', enabled: true },
      { id: 'two', enabled: false },
    ];
    expect(dashboardOffered(list[0], order)).toBe(true);
    expect(dashboardOffered(list[1], order)).toBe(false);
    expect(dashboardOffered(list[0])).toBe(false);
  });

  it('will not open one that is switched off', () => {
    expect(activeDashboard(list, 'one')?.id).toBe('two');
  });

  // Showing something the reader turned off beats showing nothing with no way back.
  it('falls back to the whole list when every one is off', () => {
    const allOff = list.map((d) => ({ ...d, enabled: false }));
    expect(activeDashboard(allOff, 'two')?.id).toBe('one');
  });
});

// **A kind is a question, and half of them are about books.** Offering "what am I part-way through" over a
// collection of highlights would be offering a widget that can only ever be empty.
describe('widgetKindsFor / widgetViewsFor', () => {
  it('offers a record collection the kinds that are about a set of notes', () => {
    expect(widgetKindsFor('reading_record')).toEqual(['records', 'recent', 'search', 'summary']);
  });

  // A summary counts groups rather than showing them, so it applies wherever grouping does — which is both
  // species, since there is one arranger between them.
  it('offers a summary of either species', () => {
    expect(widgetKindsFor('reading_record')).toContain('summary');
    expect(widgetKindsFor('title')).toContain('summary');
  });

  it('leaves the title kinds alone', () => {
    const kinds = widgetKindsFor('title');
    expect(kinds).toContain('continue');
    expect(kinds).toContain('recordings');
    expect(kinds).toContain('pick');
    expect(kinds).not.toContain('records');
  });

  // A record has no artwork of its own — `cover` is the book's, shared by every record from it — so a strip of
  // covers over a collection of highlights is one picture repeated. A table of them is another matter.
  it('will not draw records as covers, but will as a table', () => {
    expect(widgetViewsFor('reading_record')).toEqual(['list', 'table']);
    expect(widgetViewsFor('title')).toEqual(['list', 'covers', 'table']);
  });

  it('starts each species on its own plain kind', () => {
    expect(defaultKindFor('reading_record')).toBe('records');
    expect(defaultKindFor('title')).toBe('titles');
  });
});

// `records` is the record species' `titles`: the collection itself, so the collection's order is the whole point.
describe('widgetTakesArrangement for records', () => {
  it('lets a record widget be arranged by its collection', () => {
    expect(widgetTakesArrangement(widget({ kind: 'records' }))).toBe(true);
    expect(widgetTakesArrangement(widget({ kind: 'recent' }))).toBe(false);
  });
});

describe('defaultWidgetCollection', () => {
  const all = systemCollection('All titles');
  const records: LibraryCollection = { id: 'c-records', name: 'A records', ruleSets: [], species: 'reading_record' };

  /**
   * **By id, not by position.** A collection is a file of its own, so the array's order is whatever the vault
   * returned — and by position a new widget would open on whichever file happened to be read first.
   */
  it('starts a new widget on the provided collection wherever it sits in the list', () => {
    const listed = [collection('c-test', 'Test books'), all, collection('c-logos', 'Logos')];
    expect(defaultWidgetCollection(listed)).toBe(SYSTEM_COLLECTION_ID);
  });

  // A vault whose provided collection has been deleted still has to open the dialog on something a title widget can
  // draw — the first by name, since that is the order the dropdown shows.
  it('falls back to the first title collection by name', () => {
    const listed = [collection('c-zeta', 'Zeta'), collection('c-alpha', 'Alpha')];
    expect(defaultWidgetCollection(listed)).toBe('c-alpha');
  });

  // Never a record collection while there is a title one: a new widget's kind is a title kind, and a record
  // collection under it would be a widget that cannot answer its own question.
  it('prefers a title collection over a record one', () => {
    expect(defaultWidgetCollection([records, collection('c-t', 'Titles')])).toBe('c-t');
    // With nothing else it is better than nothing: the dialog opens, and the kind dropdown corrects itself.
    expect(defaultWidgetCollection([records])).toBe('c-records');
    expect(defaultWidgetCollection([])).toBe('');
  });
});

describe('the expand button', () => {
  it('says Show all when it opens the same view, and otherwise names the view it opens', () => {
    expect(expandLabelKey({ view: 'covers' })).toBe('library.show_all');
    expect(expandLabelKey({ view: 'covers', expandedView: 'covers' })).toBe('library.show_all');
    expect(expandLabelKey({ view: 'covers', expandedView: 'list' })).toBe('library.show_as_list');
    expect(expandLabelKey({ view: 'list', expandedView: 'covers' })).toBe('library.show_as_covers');
    // Fell through to "Cover view".
    expect(expandLabelKey({ view: 'covers', expandedView: 'table' })).toBe('library.show_as_table');
  });
});
