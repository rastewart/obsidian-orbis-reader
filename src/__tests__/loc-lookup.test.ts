// The location lookup over a cache file's record, which is how the data view and the device-location dialog number
// a position before a book's index is up. The live index's own use is covered end to end in location-numbering.test.

import { describe, expect, it } from 'vitest';
import { locAtCfi, locStartsOf } from '../reader/loc-lookup';

const record = {
  // A cache file's keys are strings, and JSON keeps no order a reader can rely on.
  '3': 'epubcfi(/6/4!/4/2/1:0)',
  '1': 'epubcfi(/6/2!/4/2/1:0)',
  '10': 'epubcfi(/6/4!/4/8/1:40)',
  '2': 'epubcfi(/6/2!/4/6/1:12)',
};

describe('locAtCfi over a cache record', () => {
  const starts = locStartsOf(record);

  it('orders the starts by location number, not by key text', () => {
    expect(starts.map(([loc]) => loc)).toEqual([1, 2, 3, 10]);
  });

  it('answers the last location that starts at or before the position', () => {
    expect(locAtCfi(starts, 'epubcfi(/6/2!/4/2/1:0)')).toBe(1);
    expect(locAtCfi(starts, 'epubcfi(/6/2!/4/6/1:11)')).toBe(1);
    expect(locAtCfi(starts, 'epubcfi(/6/2!/4/6/1:12)')).toBe(2);
    expect(locAtCfi(starts, 'epubcfi(/6/4!/4/6/1:0)')).toBe(3);
    expect(locAtCfi(starts, 'epubcfi(/6/8!/4/2/1:0)')).toBe(10);
  });

  it('places a range by where it begins', () => {
    expect(locAtCfi(starts, 'epubcfi(/6/2!/4,/2/1:5,/8/1:3)')).toBe(1);
  });

  it('answers the first location for a position before any, and nothing without locations', () => {
    expect(locAtCfi(starts, 'epubcfi(/6/2!/2)')).toBe(1);
    expect(locAtCfi([], 'epubcfi(/6/2!/4/2/1:0)')).toBeNull();
    expect(locAtCfi(starts, '')).toBeNull();
  });
});
