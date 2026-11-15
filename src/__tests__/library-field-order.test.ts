// The words Group order and Sort by's direction use: named for the field, as grouping and sorting run it.

import { describe, expect, it } from 'vitest';
import { orderWords } from '../library/field-order';

describe('orderWords', () => {
  it('names a date grouping by its time frame', () => {
    expect(orderWords({ shape: 'dates', listed: null, frame: 'year' })).toEqual({
      forward: 'library_page.order_oldest_first',
      backward: 'library_page.order_newest_first',
    });
    // "How long ago" runs from Upcoming back, so its own order is newest first.
    expect(orderWords({ shape: 'dates', listed: null, frame: 'aging' }).forward).toBe(
      'library_page.order_newest_first'
    );
    expect(orderWords({ shape: 'dates', listed: null, frame: 'month-of-year' }).forward).toBe(
      'library_page.order_january_first'
    );
  });

  it("puts a value list's order before the values themselves, and says whose list it is", () => {
    expect(orderWords({ shape: 'text', listed: 'field' })).toEqual({
      forward: 'library_page.order_property',
      backward: 'library_page.order_property_reversed',
    });
    expect(orderWords({ shape: 'text', listed: 'collection' })).toEqual({
      forward: 'library_page.order_collection',
      backward: 'library_page.order_collection_reversed',
    });
  });

  it('names dates, numbers and text by what they are', () => {
    expect(orderWords({ shape: 'dates', listed: null }).forward).toBe('library_page.order_oldest_first');
    expect(orderWords({ shape: 'numbers', listed: null })).toEqual({
      forward: 'library_page.order_lowest_first',
      backward: 'library_page.order_highest_first',
    });
    expect(orderWords({ shape: 'text', listed: null })).toEqual({
      forward: 'library_page.order_a_z',
      backward: 'library_page.order_z_a',
    });
  });
});
