import { describe, expect, it } from 'vitest';
import {
  changedKeys,
  collectionsDependOn,
  DISPLAYED_FIELDS,
  widgetPoolFields,
  widgetsDisplay,
} from '../library/depends';
import { setLibraryFields } from '../library/fields';
import type { LibraryCollection } from '../settings';

const collection = (over: Partial<LibraryCollection> = {}): LibraryCollection => ({
  id: 'c',
  name: 'C',
  ruleSets: [{ match: 'all', rules: [{ field: 'tags', op: 'contains', value: 'fiction' }] }],
  ...over,
});

describe('changedKeys', () => {
  it('names what differs, in both directions', () => {
    expect(changedKeys({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
    expect(changedKeys({ a: 1 }, { a: 1, cover: 'x.jpg' })).toEqual(['cover']);
    expect(changedKeys({ a: 1, gone: 'x' }, { a: 1 })).toEqual(['gone']);
  });

  // A list rewritten in the same order has not changed — otherwise every save of a note would repaint.
  it('compares values rather than identity', () => {
    expect(changedKeys({ authors: ['A', 'B'] }, { authors: ['A', 'B'] })).toEqual([]);
    expect(changedKeys({ authors: ['A'] }, { authors: ['A', 'B'] })).toEqual(['authors']);
  });

  it('treats an absent key and an empty one as the same nothing', () => {
    expect(changedKeys({ a: 1 }, { a: 1, b: null })).toEqual([]);
  });
});

describe('collectionsDependOn', () => {
  it('finds a field named in a condition', () => {
    expect(collectionsDependOn([collection()], 'tags')).toBe(true);
    expect(collectionsDependOn([collection()], 'reading_status')).toBe(false);
  });

  it('finds one named in the grouping, the sort, or a value order', () => {
    expect(collectionsDependOn([collection({ groupBy: 'reading_status' })], 'reading_status')).toBe(true);
    expect(collectionsDependOn([collection({ sort: [{ key: 'rating' }] })], 'rating')).toBe(true);
    expect(collectionsDependOn([collection({ fieldValues: { type: [{ value: 'Book' }] } })], 'type')).toBe(true);
  });

  // The worst kind of wrong here is a widget that quietly stops following the vault: a collection filtering on
  // `type` is affected by a change to `type_label` once the reader has mapped the two, because that is then the
  // key the record actually read.
  it('follows the reader’s field table in both directions', () => {
    setLibraryFields([{ key: 'type', keys: ['type_label', 'type'] }]);
    expect(collectionsDependOn([collection({ groupBy: 'type' })], 'type_label')).toBe(true);
    setLibraryFields([]);
    expect(collectionsDependOn([collection({ groupBy: 'type' })], 'type_label')).toBe(false);
  });

  it('is false for a field nothing mentions', () => {
    expect(collectionsDependOn([collection()], 'reading_status')).toBe(false);
    expect(collectionsDependOn([], 'anything')).toBe(false);
  });
});

describe('DISPLAYED_FIELDS', () => {
  // What a row draws is a dependency whether a collection says so or not.
  it('covers the fields a row and a tile show', () => {
    for (const field of ['title', 'authors', 'series', 'cover', 'files']) {
      expect(DISPLAYED_FIELDS).toContain(field);
    }
    // And not the one this exists to skip.
    expect(DISPLAYED_FIELDS).not.toContain('reading_status');
  });
});

// **What a row shows is configurable now, so the static list is not the whole answer.** A widget told to show
// `rating` is changed by a rating being set, and the repaint was skipped as "nothing shows this" while a column
// showed exactly that.
describe('widgetsDisplay', () => {
  it('says yes for a field a widget was told to show', () => {
    expect(widgetsDisplay(['rating', 'publisher'], 'rating')).toBe(true);
  });

  it('says no for a field nothing on screen shows', () => {
    expect(widgetsDisplay(['rating'], 'publisher')).toBe(false);
    expect(widgetsDisplay([], 'rating')).toBe(false);
  });

  // The key the note actually answered with is the one that changed — the same rule the collection check follows.
  it('follows the aliases the reader mapped', () => {
    setLibraryFields([{ key: 'rating', keys: ['rating', 'user_rating'] }]);
    expect(widgetsDisplay(['rating'], 'user_rating')).toBe(true);
    expect(widgetsDisplay(['user_rating'], 'rating')).toBe(true);
  });
});

describe('widgetPoolFields', () => {
  /**
   * **A pick's population depends on a field nothing displays.** Set a status from inside the book and the
   * suggestion has to stop offering it, even on a dashboard where no row shows a status — which is exactly the
   * repaint the skip logic would otherwise swallow as "nothing shows this".
   */
  it('reads reading status for a pick that filters on it', () => {
    expect(widgetPoolFields({ kind: 'pick' })).toEqual(['reading_status']);
    expect(widgetPoolFields({ kind: 'pick', pickPool: 'no-status' })).toEqual(['reading_status']);
  });

  it('reads nothing for a pick that takes anything', () => {
    expect(widgetPoolFields({ kind: 'pick', pickPool: 'any' })).toEqual([]);
  });

  // A dashboard without a pick pays nothing: every other kind's population comes from its collection, which
  // `collectionsDependOn` already answers for.
  it('reads nothing for every other kind', () => {
    expect(widgetPoolFields({ kind: 'titles' })).toEqual([]);
    expect(widgetPoolFields({ kind: 'continue' })).toEqual([]);
  });
});
