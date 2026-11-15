// Which stretch of a section one contents entry occupies.
//
// **Because a chapter is a contents entry now, and a file may hold eighty of them.** The player's progress bar,
// its elapsed and remaining readouts and its scrub all measured a spine SECTION — so in a book like this
// stepping through the Days filled the bar left to right across a whole file and started over at the next
// one. The label above the bar named a Day; the bar measured something else entirely.
//
// The spans come from where each entry's anchor lands in the reading units. Everything here is arithmetic on those
// start points, kept apart from the DOM so the rule can be read and tested on its own.

/** Where one part begins, as an index into a section's reading units. */
export interface EntryStart {
  unitIdx: number;
  href: string;
  /**
   * Which part of the book's list this is.
   *
   * **Because an href cannot tell two slices apart.** A chapter divided into four tracks has one contents entry
   * between them, so asking "which part is the reader in?" by href always answers with the first. The position
   * knows, and this is what carries the answer back out of the span arithmetic.
   */
  partIndex: number;
}

/** A half-open range of reading units, `[start, end)`. */
export interface UnitSpan {
  start: number;
  end: number;
  href: string | null;
  /** The part this span belongs to, or -1 for the stretch above a section's first entry. See `EntryStart`. */
  partIndex: number;
}

/**
 * Put entry starts in reading order and drop the ones that cannot begin a span.
 *
 * **Duplicates are not an error to reject but a fact to absorb.** Two contents entries can resolve to the same
 * reading unit — a Part divider and the chapter directly under it, an anchor on a heading and another on the
 * paragraph beneath it in the same block. Keeping both would make a zero-length span that the bar could never sit
 * in and the transport could never leave, so the FIRST at each unit wins: it is the one a reader stepping forward
 * arrives at.
 */
export function normalizeEntryStarts(starts: readonly EntryStart[]): EntryStart[] {
  const seen = new Set<number>();
  return [...starts]
    .sort((a, b) => a.unitIdx - b.unitIdx)
    .filter((s) => {
      if (s.unitIdx < 0 || seen.has(s.unitIdx)) return false;
      seen.add(s.unitIdx);
      return true;
    });
}

/**
 * The span containing `unitIdx`, given the entry starts for a section.
 *
 * **A section with no entries is one span**, which is exactly today's behavior — so an ordinary book, where one
 * file is one chapter, measures what it always measured.
 *
 * A position BEFORE the first entry gets the stretch up to it. That is front matter inside a file whose contents
 * entries begin partway down, and it belongs to no entry: measuring it as part of the first Day would tell a
 * listener they were nine minutes into a chapter they had not reached.
 */
export function entrySpanAt(starts: readonly EntryStart[], unitIdx: number, unitCount: number): UnitSpan {
  if (!starts.length) return { start: 0, end: unitCount, href: null, partIndex: -1 };
  let i = -1;
  while (i + 1 < starts.length && starts[i + 1].unitIdx <= unitIdx) i++;
  const start = i < 0 ? 0 : starts[i].unitIdx;
  const end = i + 1 < starts.length ? starts[i + 1].unitIdx : unitCount;
  return {
    start,
    end,
    href: i < 0 ? null : starts[i].href,
    partIndex: i < 0 ? -1 : starts[i].partIndex,
  };
}

/**
 * Words before `unitIdx` within its span, and the span's total — the two numbers every readout needs.
 *
 * `cumWords` is the section's cumulative word count per unit boundary (`cumWords[i]` = words before unit `i`), so
 * both numbers are subtractions rather than another walk of the text.
 *
 * `frac` is how far into the CURRENT unit the reader is, which the bar needs to move smoothly rather than in
 * paragraph-sized jumps.
 */
export function spanProgress(
  span: UnitSpan,
  cumWords: readonly number[],
  unitWords: readonly number[],
  unitIdx: number,
  frac: number
): { done: number; total: number } {
  const at = (i: number): number => cumWords[Math.max(0, Math.min(i, cumWords.length - 1))] ?? 0;
  const total = Math.max(0, at(span.end) - at(span.start));
  const partial = (unitWords[unitIdx] ?? 0) * Math.max(0, Math.min(1, frac));
  const done = Math.max(0, Math.min(total, at(unitIdx) + partial - at(span.start)));
  return { done, total };
}
