// ORBIS patch 16: foliate reports the book fraction at the top of the page as well as at its end.
//
// Found on a wide window: CHAPTER 1's first page read 28% in chapter-percent mode. foliate's `fraction` adds the
// page's own share, so it is where the page ENDS; every Orbis location is read at the top of the page.

import { SectionProgress } from 'foliate-js/progress.js';
import { describe, expect, it } from 'vitest';

describe('SectionProgress.getProgress', () => {
  // Four sections of 1000 bytes; the reader is on the first page of the third, a page a quarter of the section long.
  const progress = new SectionProgress([{ size: 1000 }, { size: 1000 }, { size: 1000 }, { size: 1000 }], 1500, 1600);

  it('starts a section’s first page exactly where the section starts', () => {
    expect(progress.getProgress(2, 0, 0.25).startFraction).toBe(0.5);
  });

  it('still reports the page’s end as `fraction`, for foliate’s own uses', () => {
    expect(progress.getProgress(2, 0, 0.25).fraction).toBe(0.5625);
  });
});
