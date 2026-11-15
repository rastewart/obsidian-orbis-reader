// A CFI flattened into a string that sorts in reading order.
//
// Obsidian Bases sorts on a property. It cannot call a comparator, so `compare()` from foliate's epubcfi —
// which is what puts search hits and the Saved pane in reading order — is unavailable to a `.base` view. The
// only way a view can order annotations by position in the book is a property whose ORDINARY sort already
// matches document order. That is what this builds.
//
// See docs/design/reading-records.md §Reading order.

import { type CfiPart, collapse as cfiCollapse, parse as cfiParse } from 'foliate-js/epubcfi.js';

/**
 * Fixed field widths, because the whole trick is that lexical order equals numeric order.
 *
 * `48` beside `2` sorts wrongly as text — the string `"10"` precedes `"2"` — so every number is padded to a
 * constant width and compared digit by digit. Five digits covers element steps in any real book (a spine of
 * 99,999 documents, a node with 99,999 children); six covers a character offset inside one text node. A value
 * past either would produce a longer field and break alignment for that one annotation rather than corrupt the
 * others, which is why nothing here clamps: a silently wrong position is worse than one obviously misplaced row.
 */
const STEP_WIDTH = 5;
const OFFSET_WIDTH = 6;

/**
 * The key for a CFI we cannot parse: one maxed-out step, so it lands at the END of its group rather than
 * leading it. Broken machinery should not be the first thing the reader sees.
 *
 * Digits, deliberately — NOT a punctuation sentinel like `~`. Under locale collation (which is what
 * `localeCompare` and, as far as we can tell, Bases both use) punctuation carries a variable weight and
 * `'~'.localeCompare('0')` comes out NEGATIVE, so a `~` key would have sorted first and quietly done the
 * opposite of what it says. The digit fields elsewhere in a key are immune to this, which is the other reason
 * they are fixed width: even a collation that ignores the `.` and `:` separators entirely still compares the
 * same digits at the same positions.
 */
export const CFI_SORT_UNPLACEABLE = '9'.repeat(STEP_WIDTH);

const pad = (n: number, width: number): string => String(Math.max(0, Math.trunc(n))).padStart(width, '0');

/** `/48` → `00048`; `/1:92` → `00001:000092`. The offset rides its own step, after the index that is compared
 *  first, so a `:` can never be weighed against a `.` for the same position. */
const partKey = (p: CfiPart): string =>
  p.offset == null ? pad(p.index, STEP_WIDTH) : `${pad(p.index, STEP_WIDTH)}:${pad(p.offset, OFFSET_WIDTH)}`;

/**
 * `epubcfi(/6/4!/4/48,/1:0,/1:92)` → `00006.00004.00004.00048.00001:000000`
 *
 * Sorts identically to `compare()`, including the shallow-before-deep case: a shorter key is a PREFIX of the
 * longer one, and a prefix sorts first — which is the same answer `compare()` gives when it runs out of steps
 * on one side.
 *
 * **Range CFIs collapse to their start**, matching how reading order is decided everywhere else in the plugin
 * (`SearchController` sorts hits by `collapse(cfi, false)`). A highlight is placed by where it begins.
 *
 * The property that makes this worth an opaque string: the key depends only on the annotation's OWN CFI, never
 * on its neighbors. A sequence number would be more readable and would have to be rewritten across every
 * later record each time a highlight is inserted mid-book — hundreds of files re-synced per new annotation,
 * which is exactly what live export cannot afford. Here a new annotation writes one file, forever.
 *
 * Indirection levels are flattened. `compare()` also walks levels in sequence, so ordering is unaffected, and
 * two CFIs within one book cannot differ only in where their `!` falls.
 */
export function cfiSortKey(cfi: string): string {
  try {
    const parsed = cfiParse(cfiCollapse(cfi, false));
    // Collapsing already resolved any range, so the object form should be gone. Guarding rather than casting:
    // a malformed CFI that survives `collapse` must not sort as though it had been understood.
    if (!Array.isArray(parsed)) return CFI_SORT_UNPLACEABLE;
    return parsed.flat().map(partKey).join('.') || CFI_SORT_UNPLACEABLE;
  } catch {
    return CFI_SORT_UNPLACEABLE;
  }
}
