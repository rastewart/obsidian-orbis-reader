/**
 * Pure location-index distribution math, extracted from `LocationIndex` so the
 * edge-case-heavy arithmetic can be unit-tested without Foliate/DOM. `LocationIndex`
 * owns the state and calls these to (re)compute it. These are layout-independent and
 * a device smoke test cannot validate them (you can't eyeball whether an AZW3's
 * location distribution is right), which is exactly why they are worth covering
 * densely. See docs/design/integration-test-strategy.md.
 */

/** Per-section location range: the first location number in the section and how many it spans. */
export interface SectionLoc {
  startLoc: number;
  locCount: number;
}

/**
 * The location `char` is in: the last one that starts at or before it.
 *
 * **The one rule every location number follows.** Location `L` starts at character `round((L - 1) × charsPerLoc)` of
 * the book's text, so the book's text is cut into `totalLocs` equal runs. The indicator, the Stats tab, a passage's
 * or a bookmark's location, Go to location and a deep link all count by it — through the index's per-location
 * positions (`locAtCfi`), which are placed by this same rule, or through this function directly. Counts from 1.
 *
 * `round(x) ≤ char` exactly when `x < char + 0.5`, which is where the ceiling comes from.
 */
export function locAtChar(char: number, charsPerLoc: number, totalLocs: number): number {
  return Math.min(totalLocs, Math.max(1, Math.ceil((char + 0.5) / charsPerLoc)));
}

/**
 * The locations that START inside each section: `startLoc` the first, `locCount` how many — 0 for a section too short
 * for one to start in it. By `locAtChar`, so a section's numbers are the ones its pages show. A location that begins
 * at the end of one section and runs into the next belongs to the first: no location is counted twice.
 */
export function computeSectionLocInfo(
  charCounts: ReadonlyArray<number>,
  totalChars: number,
  totalLocs: number
): SectionLoc[] {
  const charsPerLoc = totalChars / totalLocs;
  let start = 0;
  return charCounts.map((chars) => {
    const startLoc = start === 0 ? 1 : locAtChar(start - 1, charsPerLoc, totalLocs) + 1;
    const lastLoc = chars > 0 ? locAtChar(start + chars - 1, charsPerLoc, totalLocs) : startLoc - 1;
    start += chars;
    return { startLoc, locCount: Math.max(0, lastLoc - startLoc + 1) };
  });
}

/**
 * Bucket per-section word counts into per-location word counts: each location in a
 * section carries an equal share (`sectionWords / locCount`) of that section's words.
 * Keyed by absolute location number. Feeds WPM sampling, so it must stay aligned with
 * the location numbering produced by {@link computeSectionLocInfo}.
 *
 * A missing entry in `sectionWordCounts` is treated as 0 words.
 */
export function computeLocWordCounts(
  sectionLocInfo: ReadonlyArray<SectionLoc>,
  sectionWordCounts: ReadonlyArray<number>
): Map<number, number> {
  const out = new Map<number, number>();
  for (let sIdx = 0; sIdx < sectionLocInfo.length; sIdx++) {
    const { startLoc, locCount } = sectionLocInfo[sIdx];
    const wordsPerLoc = locCount > 0 ? (sectionWordCounts[sIdx] ?? 0) / locCount : 0;
    for (let p = 0; p < locCount; p++) {
      out.set(startLoc + p, wordsPerLoc);
    }
  }
  return out;
}
