// Which heading level a conversion actually cuts at, given what the reader prefers and what the note contains.
//
// **The two are separate answers.** A note of H3s must not open on a preferred "Heading 2" it cannot use.
// Splitting at a level a note has none of is not an error; it just produces one section, which is exactly what
// "One section" means. So the control says so.
//
// Its own module because it is arithmetic over a count array, the rule has three branches worth stating, and
// neither dialog it serves can be built without Obsidian.

/** `0` is "one section"; `1`–`6` are `h1`–`h6`. */
export type SplitLevel = number;

/** Every level a picker could offer. `0` is always offered; the rest depend on the content. */
const ALL_LEVELS: readonly SplitLevel[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * The levels worth offering: "one section", plus every level the content actually has headings at.
 *
 * **Empty levels are left out rather than shown disabled.** Nobody reads a dropdown as an inventory, so an
 * absent level raises no "is that option missing?" — and a note with one H3 offers two answers instead of six, four
 * of them dead. H5 and H6 are offered too; a dropdown has no layout budget that would cap them.
 */
export function offeredLevels(headingCounts: readonly number[]): SplitLevel[] {
  return ALL_LEVELS.filter((level) => level === 0 || (headingCounts[level - 1] ?? 0) > 0);
}

/**
 * The level to open on: the preferred one if the content has it, else the level that actually organizes the
 * document, else one section.
 *
 * **Nearest deeper, unless something shallower carries more of the document.** Searching deeper first is right
 * and stays: a document nests, so a preference for H2 met by H3s inside H4s wants the H3s, and picking purely by
 * count would take the H4s — which is the sub-structure, not the structure.
 *
 * What proximity alone cannot see is a document that does not nest: a novel with 144 `# CHAPTER n.` headings, no
 * H2s at all, and five stray H3s like `### FOREWORD.` Searching deeper alone would stop at H3 and cut a novel into
 * six sections. The count is what tells those apart — one level is the book's structure and the other is debris —
 * and it is a comparison rather than a cutoff, so there is no invented threshold in here to be wrong about later.
 *
 * **Ties break toward the preference**, deeper or shallower: a note with one H1 title and one H3 has no structure
 * to speak of either way, and the level the reader asked for is the better guess than the far end of the range.
 *
 * **Giving up means `0`, and `0` is honest.** A level with no headings produces one section, so when nothing is
 * available "one section" is not a fallback that hides the preference — it is the same output under the name that
 * describes it.
 */
export function resolveSplitLevel(preferred: SplitLevel, headingCounts: readonly number[]): SplitLevel {
  /**
   * **Coerced, because a settings dropdown hands back a string** and this is where the arithmetic happens.
   * Typed `number` and given `"0"`, the search below would evaluate `"0" + 1` as `"01"` and walk from there.
   * `coerceSettingValue` stores a number, but a value already written to a `data.json` can still be a string, and a
   * function doing arithmetic should not trust its caller to have done the narrowing.
   */
  const from = Math.trunc(Number(preferred));
  const start = Number.isFinite(from) && from >= 0 && from <= 6 ? from : 0;
  const countAt = (level: number): number => (level >= 1 && level <= 6 ? (headingCounts[level - 1] ?? 0) : 0);
  if (start === 0 || countAt(start) > 0) return start;

  // The nearest level BELOW the preference, which is the right answer whenever a document nests the ordinary way:
  // a few outer headings, more inner ones. Asked for H2 and given H3s inside H4s, the reader wants the H3s.
  let nearest: SplitLevel = 0;
  for (let level = start + 1; level <= 6; level++) {
    if (countAt(level) > 0) {
      nearest = level;
      break;
    }
  }

  // The best level ABOVE it. Descending with a strict `>`, so a tie goes to the level nearest the preference.
  let shallower: SplitLevel = 0;
  for (let level = start - 1; level >= 1; level--) if (countAt(level) > countAt(shallower)) shallower = level;

  // A shallower level only wins by carrying MORE of the document, which is the anomaly worth catching: 144 H1
  // chapters against five stray H3s is not a document that nests, it is one whose structure is at the top.
  if (countAt(shallower) > countAt(nearest)) return shallower;
  return nearest || shallower;
}

/** Whether anything at all can be split — false for a note with no headings, where the question cannot apply. */
export function hasAnyHeadings(headingCounts: readonly number[]): boolean {
  return headingCounts.some((n) => n > 0);
}
