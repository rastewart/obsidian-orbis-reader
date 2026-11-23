// Every format Orbis reads opens and renders, without an error in the console.

import { execFileSync } from 'node:child_process';
import { bookSummary, firstText, openBook } from '../in-page';
import { ROOT } from '../launch';
import { dismissDialogs, type E2eTest, expect } from '../runner';

const BOOKS: { format: string; path: string; comic?: boolean }[] = [
  { format: 'EPUB', path: 'fixtures/parts-and-chapters.epub' },
  { format: 'MOBI', path: 'fixtures/cafe-and-co.mobi' },
  { format: 'AZW3', path: 'fixtures/parts-and-chapters.azw3' },
  { format: 'FB2', path: 'fixtures/parts-and-chapters.fb2' },
  { format: 'CBZ', path: 'fixtures/sample-comic.cbz', comic: true },
];

/**
 * Every book in the fixtures git tracks, but the ones that cannot be opened (`checks.ts` opens those) and the copies
 * the resilience tests change.
 */
const ALL_FIXTURES = execFileSync('git', ['ls-files', '--', 'test-vault/fixtures'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((p) => /\.(epub|mobi|azw3|fb2|cbz)$/i.test(p) && !p.includes('/resilience/'))
  .map((p) => p.replace(/^test-vault\//, ''))
  .sort();

export const bookTests: E2eTest[] = [
  ...BOOKS.map(
    ({ format, path, comic }): E2eTest => ({
      name: `opens ${format}`,
      async run({ page }) {
        const book = await page.run(openBook, path, 30_000);
        await dismissDialogs(page);
        expect(book.sections > 0, `${path} has no sections`);
        if (comic) expect(book.images > 0, `${path} shows no page image`);
        else {
          expect(book.tocEntries > 0, `${path} has no contents`);
          const text = await page.run(firstText);
          expect(text.textLength > 0, `${path} shows no text in its first sections`);
        }
      },
    })
  ),
  {
    // Each fixture is a book made to try something hard: a split chapter, a Calibre layout, a MOBI's character
    // references. What Orbis reads of its title, author and contents is held to what it read before, and the book
    // must open without an error in the console.
    name: 'every fixture opens, with the contents it had before',
    timeoutMs: 180_000,
    async run({ page, golden }) {
      const out: string[] = [];
      for (const path of ALL_FIXTURES) {
        const book = await page.run(openBook, path, 30_000);
        await dismissDialogs(page);
        expect(book.sections > 0, `${path} has no sections`);
        const { title, author, contents } = await page.run(bookSummary);
        // Text that Orbis decoded wrongly: an entity left as written, or UTF-8 read as Latin-1.
        const garbled = [title, author, ...contents].find((s) => /&(amp|lt|gt|quot|#\d+);|Ã.|â€/.test(s));
        expect(!garbled, `${path} shows garbled text: "${garbled}"`);
        out.push(`=== ${path}`, `title: ${title}`, `author: ${author}`, ...contents.map((c) => `  ${c}`));
      }
      golden('fixture-contents.txt', `${out.join('\n')}\n`);
    },
  },
];
