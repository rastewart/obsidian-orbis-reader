// Which location a position in the book is in, from the index's per-location positions.
//
// The index stores where each location starts as a CFI (`LocationIndex.locNavCache`, saved in the book's locations
// cache), placed by `locAtChar`'s rule. A position's location is the last one that starts at or before it — found
// by a binary search in reading order, which `compare()` from foliate's epubcfi decides. A range is placed by where
// it begins, as everywhere else in the plugin.
//
// Pure, so the data view and the device-location dialog can answer from a cache file before a book's index is up.

import { compare as cfiCompare } from 'foliate-js/epubcfi.js';

/** Location → CFI, in location order. From the live index's map, or from a cache file's record. */
export type LocStarts = ReadonlyArray<readonly [number, string]>;

/** A cache file's `locNavCache` (location as a string key) or the live index's map, as starts in location order. */
export function locStartsOf(source: ReadonlyMap<number, string> | Readonly<Record<string, string>>): LocStarts {
  const entries: Array<[number, string]> = [];
  if (source instanceof Map) for (const [loc, cfi] of source as ReadonlyMap<number, string>) entries.push([loc, cfi]);
  else
    for (const [loc, cfi] of Object.entries<string>(source as Readonly<Record<string, string>>))
      entries.push([Number(loc), cfi]);
  return entries.filter(([loc]) => Number.isFinite(loc)).sort((a, b) => a[0] - b[0]);
}

/**
 * The location `cfi` is in: the last one that starts at or before it, or the first location for a position before
 * any (a cover with no text). Null when there are no locations, or the CFI cannot be read.
 */
export function locAtCfi(starts: LocStarts, cfi: string): number | null {
  if (!starts.length || !cfi) return null;
  let lo = 0;
  let hi = starts.length - 1;
  let found = 0;
  try {
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cfiCompare(starts[mid][1], cfi) <= 0) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
  } catch {
    return null;
  }
  return starts[found][0];
}
