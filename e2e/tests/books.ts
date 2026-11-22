// Every format Orbis reads opens and renders, without an error in the console.

import { firstText, openBook } from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

const BOOKS: { format: string; path: string; comic?: boolean }[] = [
  { format: 'EPUB', path: 'fixtures/parts-and-chapters.epub' },
  { format: 'MOBI', path: 'fixtures/cafe-and-co.mobi' },
  { format: 'AZW3', path: 'fixtures/parts-and-chapters.azw3' },
  { format: 'FB2', path: 'fixtures/parts-and-chapters.fb2' },
  { format: 'CBZ', path: 'fixtures/sample-comic.cbz', comic: true },
];

export const bookTests: E2eTest[] = BOOKS.map(({ format, path, comic }) => ({
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
}));
