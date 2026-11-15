// A widget's name is the Library's heading for it — on the dashboard and in the dashboard's settings list alike.

import { describe, expect, it } from 'vitest';
import { SYSTEM_COLLECTION_ID } from '../library/dashboard';
import { widgetHeading } from '../library/widget-heading';
import type { DashboardWidget, LibraryCollection } from '../settings';

const fixtures = { id: 'fx', name: 'Fixtures', groupBy: 'reading_status' } as unknown as LibraryCollection;
const all = { id: SYSTEM_COLLECTION_ID, name: 'All titles' } as unknown as LibraryCollection;
const widget = (kind: DashboardWidget['kind'], extra: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id: 'w',
  kind,
  collection: 'fx',
  view: 'list',
  enabled: true,
  ...extra,
});

describe('widgetHeading', () => {
  // The settings list used to name both of these "".
  it('names a summary with no heading by its collection and grouping', () => {
    expect(widgetHeading(widget('summary'), [fixtures, all])).toBe('Fixtures by Reading status');
  });

  it('names a titles widget whose collection has gone by its kind', () => {
    expect(widgetHeading(widget('titles', { collection: 'gone' }), [all])).toBe('Collection');
  });

  it('names a titles widget by its collection, and anything else by its kind and collection', () => {
    expect(widgetHeading(widget('titles'), [fixtures])).toBe('Fixtures');
    expect(widgetHeading(widget('search'), [fixtures])).toBe('Search · Fixtures');
    expect(widgetHeading(widget('search', { collection: SYSTEM_COLLECTION_ID }), [all])).toBe('Search');
  });

  it("lets the widget's own heading win", () => {
    expect(widgetHeading(widget('summary', { label: ' Shelf ' }), [fixtures])).toBe('Shelf');
  });
});
