// Which level a conversion opens on, and which levels the picker offers.
//
// The fault these prevent: a dialog that selects the preferred level whether or not the note has headings there.
// A note whose only headings are H3s would open on a lit, disabled "Heading 2" and produce one section — the
// control naming a reason that is not the reason.

import { describe, expect, it } from 'vitest';
import { hasAnyHeadings, offeredLevels, resolveSplitLevel } from '../split-level';

/** `[h1, h2, h3, h4, h5, h6]`. */
const counts = (...levels: number[]): number[] => [0, 0, 0, 0, 0, 0].map((zero, i) => levels[i] ?? zero);

describe('offeredLevels', () => {
  it('offers one section plus every level with headings', () => {
    expect(offeredLevels(counts(0, 6, 40))).toEqual([0, 2, 3]);
  });

  it('leaves out the levels a note has none of', () => {
    // One H3 and nothing else: two options, not six with four of them dead.
    expect(offeredLevels(counts(0, 0, 1))).toEqual([0, 3]);
  });

  it('always offers one section, even for a note with no headings at all', () => {
    expect(offeredLevels(counts())).toEqual([0]);
  });

  it('reaches h5 and h6, which the button row could not fit', () => {
    expect(offeredLevels(counts(0, 0, 0, 0, 3, 2))).toEqual([0, 5, 6]);
  });
});

describe('resolveSplitLevel', () => {
  it('keeps the preferred level when the content has it', () => {
    expect(resolveSplitLevel(2, counts(1, 6, 40))).toBe(2);
  });

  it('goes DEEPER when the preferred level is absent', () => {
    // Preference H2, headings only at H3. Cutting at H3 is the split that was asked for, one level down — not a
    // single section produced silently.
    expect(resolveSplitLevel(2, counts(0, 0, 1))).toBe(3);
  });

  it('takes the nearest deeper level, not the deepest', () => {
    expect(resolveSplitLevel(2, counts(0, 0, 5, 9))).toBe(3);
  });

  it('goes shallower only when nothing deeper has headings', () => {
    // A note whose headings are all H1 must not collapse to one section: there is a perfectly good split there.
    expect(resolveSplitLevel(2, counts(4))).toBe(1);
    expect(resolveSplitLevel(4, counts(0, 7))).toBe(2);
  });

  it('prefers deeper over shallower when both are available', () => {
    expect(resolveSplitLevel(3, counts(2, 0, 0, 8))).toBe(4);
  });

  /**
   * **A document that does not nest, which proximity alone could not see.**
   *
   * A long Project Gutenberg novel exported to Markdown: 144 `# CHAPTER n.` headings, no H2s at all, and five
   * stray H3s like `### EXTRACTS.` A rule that takes the nearest deeper level finds H3 first and stops, turning a
   * novel of well over a hundred chapters into a book of six sections.
   *
   * The count is what tells the two levels apart — one is the book's structure and the other is debris — and a
   * shallower level has to carry strictly MORE to win, which is what keeps the ordinary nesting cases above
   * unchanged.
   */
  it('takes a shallower level that carries far more of the document', () => {
    expect(resolveSplitLevel(2, counts(144, 0, 5, 1))).toBe(1);
  });

  it('still prefers the nearer deeper level when the shallow one is only a title', () => {
    // The clipped-article shape this feature exists for: one H1 naming the piece, sections below it.
    expect(resolveSplitLevel(2, counts(1, 0, 6))).toBe(3);
  });

  it('breaks a tie toward the preference rather than the far end of the range', () => {
    // One H1 and one H3 is no structure either way; the level asked for is the better guess.
    expect(resolveSplitLevel(2, counts(1, 0, 1))).toBe(3);
  });

  it('answers one section when the content has no headings anywhere', () => {
    // Not a fallback that hides the preference: splitting at an absent level produces one section, so this is
    // the same output under the name that describes it.
    expect(resolveSplitLevel(2, counts())).toBe(0);
  });

  it('leaves an explicit "one section" alone, whatever the content holds', () => {
    expect(resolveSplitLevel(0, counts(1, 6, 40))).toBe(0);
  });

  it('survives the STRING a settings dropdown hands back', () => {
    // The sharpest edge in this function: typed `number`, given `"0"`, a search doing `"0" + 1` — string
    // concatenation — walks from `"01"` to Heading 3, so a preference for one section opens on a split.
    // `coerceSettingValue` stores a number, but a `data.json` can still hold a string.
    expect(resolveSplitLevel('0' as unknown as number, counts(0, 0, 1))).toBe(0);
    expect(resolveSplitLevel('2' as unknown as number, counts(0, 0, 1))).toBe(3);
    expect(resolveSplitLevel('3' as unknown as number, counts(0, 0, 1))).toBe(3);
  });

  it('answers one section for a level outside 0–6', () => {
    // A hand-edited `data.json`, or a value from a version that offered more levels.
    expect(resolveSplitLevel(9, counts(0, 6))).toBe(0);
    expect(resolveSplitLevel(-1, counts(0, 6))).toBe(0);
    expect(resolveSplitLevel(Number.NaN, counts(0, 6))).toBe(0);
  });

  it('resolves to a level the picker actually offers', () => {
    // The property that matters: these two functions must agree, or the dropdown is set to a value it has no
    // option for and the browser silently shows the first one instead.
    const shapes = [counts(0, 0, 1), counts(4), counts(), counts(0, 6, 40), counts(0, 0, 0, 0, 3)];
    for (const shape of shapes) {
      for (const preferred of [0, 1, 2, 3, 4, 5, 6]) {
        expect(offeredLevels(shape)).toContain(resolveSplitLevel(preferred, shape));
      }
    }
  });
});

describe('hasAnyHeadings', () => {
  it('is false for a note the split question cannot apply to', () => {
    expect(hasAnyHeadings(counts())).toBe(false);
  });

  it('is true as soon as one level has one heading', () => {
    expect(hasAnyHeadings(counts(0, 0, 1))).toBe(true);
  });
});
