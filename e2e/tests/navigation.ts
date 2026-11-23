// Moving through a book by command: a chapter or a page at a time, back and forward across a jump, to a location
// or a percentage, and back to a place by the link copied there. And which commands are offered where.

import {
  closeBooks,
  copiedText,
  goToLocation,
  jumpToContents,
  openBook,
  openInNewTab,
  openOrbisLink,
  orbisCommands,
  readingPos,
  runCommand,
  settledPlace,
  turnTo,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext } from '../runner';

const BOOK = 'fixtures/parts-and-chapters.epub';

/** Runs a command and returns where the book is once it has settled. */
async function after({ page }: TestContext, command: string) {
  expect(await page.run(runCommand, `orbis-reader:${command}`), `${command} was not offered`);
  await page.run(settledPlace, 15_000);
  return page.run(readingPos);
}

/** Whether `a` is further into the book than `b`. */
const later = (a: { section: number; pos: number }, b: { section: number; pos: number }) =>
  a.section > b.section || (a.section === b.section && a.pos > b.pos);

export const navigationTests: E2eTest[] = [
  {
    name: 'the chapter and page commands land where they say',
    async run(context) {
      const { page } = context;
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      await page.run(turnTo, 6, 1);
      const start = await page.run(readingPos);

      // A chapter's first page, as going to its section lands: the paginator keeps a page of padding before it, so
      // it is not at zero.
      const firstPage = async (section: number) => {
        await page.run(turnTo, section, 0);
        return (await page.run(readingPos)).pos;
      };

      const next = await after(context, 'orbis-go-to-next-chapter');
      expect(later(next, start), `Go to next chapter went from ${JSON.stringify(start)} to ${JSON.stringify(next)}`);
      expect(next.chapter !== start.chapter, `Go to next chapter stayed in "${start.chapter}"`);
      const nextFirst = await firstPage(next.section);
      expect(next.pos === nextFirst, `Go to next chapter landed ${(next.pos - nextFirst) / next.size} pages into it`);

      const back = await after(context, 'orbis-go-to-previous-chapter');
      expect(
        back.chapter === start.chapter,
        `Go to previous chapter went to "${back.chapter}", not "${start.chapter}"`
      );
      const backFirst = await firstPage(back.section);
      expect(
        back.pos === backFirst,
        `Go to previous chapter landed ${(back.pos - backFirst) / back.size} pages into it`
      );

      const page1 = await after(context, 'orbis-go-to-next-page');
      expect(later(page1, back), 'Go to next page did not turn forward');
      const page0 = await after(context, 'orbis-go-to-previous-page');
      expect(
        page0.section === back.section && page0.pos === back.pos,
        `Go to previous page did not turn back to where Go to next page started`
      );
    },
  },
  {
    name: 'back and forward return across a jump',
    async run(context) {
      const { page } = context;
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      await page.run(turnTo, 3, 0);
      const from = await page.run(readingPos);
      await page.run(jumpToContents, 12);
      await page.run(settledPlace, 15_000);
      const to = await page.run(readingPos);
      expect(to.section !== from.section, 'the contents entry did not move the book');
      expect(to.canGoBack, 'after a jump from the contents, there is no way back');

      const back = await after(context, 'orbis-go-back');
      expect(back.section === from.section, `Go back went to section ${back.section}, not ${from.section}`);
      expect(back.canGoForward, 'after Go back, there is no way forward');
      const forward = await after(context, 'orbis-go-forward');
      expect(forward.section === to.section, `Go forward went to section ${forward.section}, not ${to.section}`);

      // A new jump from a step back replaces what was ahead.
      await after(context, 'orbis-go-back');
      await page.run(jumpToContents, 20);
      await page.run(settledPlace, 15_000);
      expect(!(await page.run(readingPos)).canGoForward, 'a new jump kept the old way forward');
    },
  },
  {
    name: 'go to location goes there, and says what it cannot do',
    async run({ page }) {
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      await page.run(turnTo, 1, 0);
      const half = await page.run(goToLocation, '50%');
      expect(!half.open, 'the Go to location bar stayed open after going to 50%');
      await page.run(settledPlace, 15_000);
      const at = (await page.run(readingPos)).fraction ?? -1;
      expect(Math.abs(at - 0.5) < 0.1, `Go to 50% went to ${Math.round(at * 100)}% of the book`);

      const tooFar = await page.run(goToLocation, '999999');
      expect(tooFar.open, 'the bar closed on a location past the end');
      expect(
        /^Enter a location between 1 and \d+, or a percentage \(0–100%\)$/.test(tooFar.hint),
        `for a location past the end, the bar says "${tooFar.hint}"`
      );
      const tooMuch = await page.run(goToLocation, '150%');
      expect(tooMuch.hint === 'Enter a percentage between 0 and 100', `for 150%, the bar says "${tooMuch.hint}"`);
      await dismissDialogs(page);
    },
  },
  {
    name: 'a link copied to a place opens the book there',
    async run({ page }) {
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      const was = await page.run(turnTo, 9, 2);
      expect(
        await page.run(runCommand, 'orbis-reader:orbis-copy-link-to-current-location'),
        'Copy link was not offered'
      );
      await new Promise((r) => setTimeout(r, 500));
      const copied = await page.run(copiedText);
      // A Markdown link, `[name](url)`, whose address ends in the place's `epubcfi(…)`: balanced parentheses, so the
      // address runs to the link's last one.
      const url = /^\[[^\]]*\]\((obsidian:\/\/orbis-nav.*)\)$/.exec(copied.trim())?.[1];
      expect(!!url, `the copied link is not an Orbis link: ${copied}`);
      expect(copied.startsWith('[parts-and-chapters]('), `the copied link does not name the book's file: ${copied}`);
      await page.run(closeBooks);
      await page.run(openInNewTab, 'fixtures/README.md');
      await page.run(openOrbisLink, url ?? '');
      await dismissDialogs(page);
      const now = await page.run(settledPlace, 20_000);
      expect(now.section === was.section, `the link opened the book at section ${now.section}, not ${was.section}`);
    },
  },
  {
    name: 'the commands offered with a note in front, and with a book',
    async run({ page, golden }) {
      await page.run(closeBooks);
      await page.run(openInNewTab, 'fixtures/README.md');
      const withNote = (await page.run(orbisCommands)).map((c) => c.name).sort();
      await page.run(openBook, BOOK, 30_000);
      await dismissDialogs(page);
      const withBook = (await page.run(orbisCommands)).map((c) => c.name).sort();
      golden(
        'commands-offered.txt',
        `=== with a note in front\n${withNote.join('\n')}\n=== with a book in front\n${withBook.join('\n')}\n`
      );
    },
  },
];
