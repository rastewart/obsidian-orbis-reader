// Searching a book finds what it should, a result lands on its words, and the book closes cleanly afterwards.

import { closeBooks, nextSearchResult, openBook, searchFor, settledPlace } from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

/** A CFI's steps as numbers, so two positions can be put in book order: `/6/12!/4/10/1:5` is 6, 12, 4, 10, 1, 5. */
function steps(cfi: string): number[] {
  return [...cfi.matchAll(/[/:](\d+)/g)].map((m) => Number(m[1]));
}

/** Where a CFI starts and ends. A range is `epubcfi(parent,start,end)`; a point starts and ends in one place. */
function ends(cfi: string): [number[], number[]] {
  const parts = cfi.replace(/^epubcfi\(|\)$/g, '').split(',');
  return parts.length === 3 ? [steps(parts[0] + parts[1]), steps(parts[0] + parts[2])] : [steps(cfi), steps(cfi)];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export const searchTests: E2eTest[] = [
  {
    name: 'search finds a word and a result lands on it',
    async run({ page, golden }) {
      await page.run(openBook, 'fixtures/annotation-workhorse.epub', 30_000);
      await dismissDialogs(page);
      const results = await page.run(searchFor, 'boathouse', 30_000);
      expect(results.length > 1, `searching for "boathouse" found ${results.length} results`);
      expect(
        results.every((r) => /boathouse/i.test(r.excerpt)),
        'a result does not show the word it was found by'
      );
      golden('search-boathouse.txt', `${results.map((r) => `${r.chapter} | ${r.excerpt}`).join('\n')}\n`);

      // The first Enter searched; the next goes to a result.
      await page.run(nextSearchResult);
      const place = await page.run(settledPlace, 15_000);
      const [shownFrom, shownTo] = ends(place.cfi ?? '');
      const onPage = results.some((r) => {
        const [hit] = ends(r.cfi);
        return compare(shownFrom, hit) <= 0 && compare(hit, shownTo) <= 0;
      });
      expect(onPage, `after going to a result, the page shown (${place.cfi}) holds none of the results`);

      // Closing the book with its results on screen once threw an error for each of them.
      await page.run(closeBooks);
      await new Promise((r) => setTimeout(r, 1500));
    },
  },
];
