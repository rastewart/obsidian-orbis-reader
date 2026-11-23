// Searching a book finds what it should, a result lands on its words, and the book closes cleanly afterwards.

import {
  closeBooks,
  copyVaultFile,
  markParagraphs,
  nextSearchResult,
  noteParagraph,
  openBook,
  searchFor,
  setSearchOptions,
  settledPlace,
} from '../in-page';
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
  {
    name: 'a search with no match finds none, and a new search replaces the last',
    async run({ page }) {
      await page.run(openBook, 'fixtures/annotation-workhorse.epub', 30_000);
      await dismissDialogs(page);
      const none = await page.run(searchFor, 'zzzq', 5000);
      expect(none.length === 0, `searching for "zzzq" found ${none.length} results`);
      const kettle = await page.run(searchFor, 'kettle', 30_000);
      expect(kettle.length > 0, 'searching for "kettle" found nothing');
      const kettleby = await page.run(searchFor, 'Kettleby', 30_000);
      expect(
        kettleby.length > 0 && kettleby.length < kettle.length,
        `"Kettleby" found ${kettleby.length} results, "kettle" ${kettle.length}: the new search did not replace the old`
      );
      expect(
        kettleby.every((r) => /kettleby/i.test(r.excerpt)),
        'a result of the new search does not show the word it was found by'
      );
      await page.run(closeBooks);
    },
  },
  {
    name: 'advanced search finds marks and notes, and matches case and whole words',
    async run({ page }) {
      const path = 'fixtures/resilience/Search Copy.epub';
      await page.run(copyVaultFile, 'fixtures/annotation-workhorse.epub', path, null);
      await page.run(openBook, path, 30_000);
      await dismissDialogs(page);
      const { starts } = await page.run(markParagraphs, [0], 300);
      // "lighthouse" is nowhere in the book, so a result for it can only come from the note.
      await page.run(noteParagraph, 1, 'Remember the lighthouse.', null);
      const word = (starts[0].match(/[A-Za-z]{6,}/g) ?? [])[0] ?? '';
      expect(!!word, `the marked paragraph has no word to search for: "${starts[0]}"`);

      await page.run(setSearchOptions, { bookText: false, passages: true });
      const marked = await page.run(searchFor, word, 15_000);
      expect(marked.length >= 1, `with passage selections the only scope, "${word}" found nothing`);
      expect(
        marked.every((r) => r.kind === 'passage'),
        `with passage selections the only scope, results were ${marked.map((r) => r.kind).join(', ')}`
      );

      await page.run(setSearchOptions, { bookText: true });
      const inText = await page.run(searchFor, 'lighthouse', 5000);
      expect(inText.length === 0, `"lighthouse" was found ${inText.length} times in the book's own text`);
      await page.run(setSearchOptions, { bookText: false, noteContent: true });
      const inNotes = await page.run(searchFor, 'lighthouse', 15_000);
      expect(
        inNotes.length === 1 && inNotes[0].kind === 'note-content',
        `in note text, "lighthouse" found ${JSON.stringify(inNotes.map((r) => r.kind))}`
      );

      // Match case: "Kettle" is only Kettleby. Whole word: "kettle" is never Kettleby.
      await page.run(setSearchOptions, { bookText: true });
      const anyCase = await page.run(searchFor, 'kettle', 30_000);
      await page.run(setSearchOptions, { bookText: true, caseSensitive: true });
      const capital = await page.run(searchFor, 'Kettle', 30_000);
      expect(
        capital.length > 0 && capital.length < anyCase.length,
        `with Match case, "Kettle" found ${capital.length} results, "kettle" without it ${anyCase.length}`
      );
      expect(
        capital.every((r) => r.excerpt.includes('Kettle')),
        'with Match case, a result shows no "Kettle"'
      );
      await page.run(setSearchOptions, { bookText: true, wholeWord: true });
      const whole = await page.run(searchFor, 'kettle', 30_000);
      expect(
        whole.length > 0 && whole.length + capital.length <= anyCase.length,
        `with Whole word, "kettle" found ${whole.length}; without it ${anyCase.length}, of which ${capital.length} Kettleby`
      );
      await page.run(setSearchOptions, {});
      await page.run(closeBooks);
    },
  },
];
