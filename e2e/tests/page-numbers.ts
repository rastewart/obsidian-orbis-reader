// A printed edition's page numbers, as the location index finds them in a real book in the real reader: every page of
// the list placed, "of N", and the page at the top of a chapter. See docs/design/page-numbers.md; the books are in
// `scripts/fixtures/books.ts`. The unit tests (`page-index.test.ts`) check the same books under jsdom; this checks that
// foliate in Obsidian agrees, the top of the page included.

import { closeBooks, openBook, pageNumbers, turnTo } from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

const BOOK = 'fixtures/page-numbers.epub';

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
const NUMBERED = Array.from({ length: 41 }, (_, i) => String(i + 1)).filter((l) => l !== '17');

export const pageNumberTests: E2eTest[] = [
  {
    name: 'a book with page numbers has every page of its list, and the page at the top of each chapter',
    async run({ page }) {
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      const found = await page.run(pageNumbers, 30_000);
      expect(
        found.labels.join(' ') === [...ROMAN, ...NUMBERED, '[42]'].join(' '),
        `the pages were ${found.labels.join(' ')}`
      );
      expect(found.total === 41, `"of N" was ${found.total}, not 41`);
      // A chapter that opens a page, one that starts partway down page 24, and one wholly on page 31.
      for (const [file, label] of [
        ['chapter-1.xhtml', '1'],
        ['chapter-3.xhtml', '24'],
        ['chapter-4.xhtml', '31'],
        ['chapter-5.xhtml', '32'],
      ]) {
        await page.run(turnTo, file, 0);
        const { top } = await page.run(pageNumbers, 5_000);
        expect(top === label, `at the top of ${file} the page was ${top}, not ${label}`);
      }
      // Reopened, from the cache: the same pages.
      await page.run(closeBooks);
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      const again = await page.run(pageNumbers, 30_000);
      expect(again.labels.length === found.labels.length, `reopened, it had ${again.labels.length} pages`);
    },
  },
  {
    name: 'an EPUB 2 book has the page numbers of its NCX, and a broken page list gives none',
    async run({ page }) {
      await page.run(openBook, 'fixtures/page-numbers-ncx.epub', 30_000);
      await dismissDialogs(page);
      const ncx = await page.run(pageNumbers, 30_000);
      expect(ncx.labels.join(' ') === 'i ii 1 2 3 4 5 6 7 8', `the NCX book's pages were ${ncx.labels.join(' ')}`);
      expect(ncx.total === 8, `the NCX book's "of N" was ${ncx.total}`);
      await page.run(openBook, 'fixtures/broken-page-list.epub', 30_000);
      await dismissDialogs(page);
      const broken = await page.run(pageNumbers, 30_000);
      expect(broken.labels.length === 0, `the broken list gave ${broken.labels.length} pages`);
      expect(broken.total === null, `the broken list gave "of ${broken.total}"`);
    },
  },
];
