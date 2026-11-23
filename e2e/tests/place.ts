// A book keeps the reader's place: closed and reopened, through Orbis reloading, behind another tab, and at its cover.

import {
  closeBooks,
  openBook,
  openInNewTab,
  type Place,
  reloadOrbis,
  settledPlace,
  showBook,
  turnTo,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

const BOOK = 'fixtures/parts-and-chapters.epub';

function expectSamePlace(now: Place, was: Place, when: string): void {
  expect(
    now.section === was.section && now.loc === was.loc,
    `${when} the book was at section ${now.section}, location ${now.loc}, not section ${was.section}, location ${was.loc}`
  );
  expect(now.onPage, `${when} the page was shifted sideways, off a page boundary`);
}

export const placeTests: E2eTest[] = [
  {
    name: 'a book reopens where the reader left it',
    async run({ page }) {
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      const was = await page.run(turnTo, 5, 1);
      await page.run(closeBooks);
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      expectSamePlace(await page.run(settledPlace, 15_000), was, 'reopened,');
    },
  },
  {
    name: 'a book keeps its place when Orbis reloads',
    async run({ page }) {
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      const was = await page.run(turnTo, 7, 1);
      expect(await page.run(reloadOrbis, 30_000), 'the book was not shown again after Orbis reloaded');
      await dismissDialogs(page);
      expectSamePlace(await page.run(settledPlace, 15_000), was, 'after the reload');
    },
  },
  {
    name: 'a book keeps its place behind another tab',
    // A freeze shows as a test that never finishes, so it is called sooner than the default.
    timeoutMs: 30_000,
    async run({ page }) {
      await page.run(openBook, 'fixtures/technical-book.epub', 30_000);
      await dismissDialogs(page);
      // The chapter with a bordered table. Hiding a book's tab shrinks its pane to nothing, and laying out a bordered
      // table at that size once froze Obsidian (foliate patch 8).
      const was = await page.run(turnTo, 'text/part0002_split_002.html', 0);
      await page.run(openInNewTab, 'fixtures/README.md');
      await new Promise((r) => setTimeout(r, 1500));
      await page.run(showBook);
      expectSamePlace(await page.run(settledPlace, 15_000), was, 'shown again,');
    },
  },
  {
    name: 'a book left at its cover reopens on the cover page',
    async run({ page }) {
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      // Away and back, so the cover is saved as the place rather than being where the book happened to open.
      await page.run(turnTo, 3, 0);
      const was = await page.run(turnTo, 0, 0);
      await page.run(closeBooks);
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      // A cover's saved place holds no text, and once left the page shifted when the pane settled (foliate patch 39).
      expectSamePlace(await page.run(settledPlace, 15_000), was, 'reopened at the cover,');
    },
  },
];
