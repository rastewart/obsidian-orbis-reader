// Reading a whole section must cost time proportional to its SIZE, not to its size squared.
//
// **A book with one huge section must not freeze Obsidian.** A novel can ship as a single 1 MB `index.html` with
// thousands of paragraphs, and tapping the Listen bar runs `getReadingUnits` over all of it on the main thread.
//
// There are TWO ways for it to go quadratic. Rooting `collectRangeTextNodes`'s TreeWalker at the block range's
// `commonAncestorContainer` — `<body>` for sibling paragraphs — re-walks the document from the top once per block:
// work proportional to each block's POSITION, summed over every block. And `rangeIsEmpty` calling
// `Range.toString()`, which costs time proportional to the DOCUMENT rather than to the range, once per block.
//
// **This asserts the complexity class, not a duration.** A wall-clock budget would pass or fail on how busy the
// machine is; a ratio between two sizes on the same machine, in the same run, is a property of the algorithm. Four
// times the input should cost roughly four times the time. Quadratic would be sixteen.

import { describe, expect, it } from 'vitest';
import { getReadingUnits } from '../reader/tts/tts-blocks';

/** A section of `n` paragraphs, each a couple of sentences — the shape of a novel in one file. */
function section(n: number): Document {
  const paras: string[] = [];
  for (let i = 0; i < n; i++) {
    paras.push(
      `<p>Chapter ${i}. On an unusually still evening late in April a ferryman came down from the mill. ` +
        `He walked on slowly, as though in two minds, towards the landing, and paragraph ${i} ended there.</p>`
    );
  }
  return new DOMParser().parseFromString(`<html><body>${paras.join('')}</body></html>`, 'text/html');
}

function msFor(n: number): number {
  const doc = section(n);
  const started = performance.now();
  const units = getReadingUnits(doc, 0);
  const elapsed = performance.now() - started;
  // Guard the measurement itself: timing a function that returned nothing would prove nothing.
  expect(units.length).toBeGreaterThanOrEqual(n);
  return elapsed;
}

describe('getReadingUnits scales with the size of a section', () => {
  it('costs about four times as much for four times the paragraphs, not sixteen', () => {
    msFor(50); // warm the JIT, so the first real measurement is not inflated and the ratio is honest
    const small = Math.max(msFor(300), 1);
    const large = msFor(1200);
    const ratio = large / small;
    // Linear is ~4. Quadratic is ~16. Ten leaves room for a slow or noisy machine — a full local run under load
    // reaches about 8.6, and a shared CI runner is noisier still — while still failing if either quadratic returns:
    // that ratio is above 11 and rises with size.
    expect(ratio).toBeLessThan(10);
  });

  /**
   * The output must not depend on how the walker gets there. Seeking it to the range's start rather than walking to
   * it is meant to skip only work, never content — so a paragraph's own words still have to come back.
   */
  it('still finds every paragraph, and their words, in order', () => {
    const units = getReadingUnits(section(40), 0);
    expect(units.length).toBeGreaterThanOrEqual(40);
    const text = units.map((u) => u.text).join(' ');
    expect(text).toContain('Chapter 0.');
    expect(text).toContain('paragraph 39 ended there');
    // First unit belongs to the first paragraph, so nothing before the range leaked in.
    expect(units[0].text).toContain('Chapter 0.');
    expect(units[0].text).not.toContain('Chapter 1.');
  });

  /** A paragraph whose text begins in a nested inline element: the range's start container is then a text node
   *  inside `<em>`, which `nextNode()` would step PAST if it were used as the seek point without being offered
   *  to the collector first. */
  it('keeps text that starts inside inline markup', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><p><em>Emphasised opening.</em> Then the rest of it.</p><p>Second paragraph here.</p></body></html>',
      'text/html'
    );
    const units = getReadingUnits(doc, 0);
    const all = units.map((u) => u.text).join(' ');
    expect(all).toContain('Emphasised opening.');
    expect(all).toContain('Then the rest of it.');
    expect(all).toContain('Second paragraph here.');
  });
});
