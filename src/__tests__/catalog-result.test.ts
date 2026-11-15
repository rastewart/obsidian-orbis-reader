// The line over a cataloging run's report.

import { describe, expect, it } from 'vitest';
import { catalogResultSummary } from '../library/catalog-summary';

describe('catalogResultSummary', () => {
  it('counts each kind on its own, singular included, and says nothing of a zero', () => {
    // Was "Wrote 1 title notes and attached 0 files".
    expect(catalogResultSummary(1, 0, 0)).toBe('Wrote 1 title note.');
    expect(catalogResultSummary(3, 1, 0)).toBe('Wrote 3 title notes. Attached 1 file.');
    expect(catalogResultSummary(0, 2, 1)).toBe('Attached 2 files. Updated 1 title note.');
  });

  it('says so when nothing was written', () => {
    expect(catalogResultSummary(0, 0, 0)).toBe('Nothing was written.');
  });
});
