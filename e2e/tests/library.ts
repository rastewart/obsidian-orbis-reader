// The Library, from the reader: a book with no title note is cataloged in one step, and its reading status and rating
// are set and cleared from the book, each written to its title note.

import {
  closeBooks,
  copyVaultFile,
  noticeCount,
  noticesSince,
  openBook,
  orbisCommands,
  pickRow,
  readVaultFile,
  runCommand,
  setPluginSetting,
  vaultFiles,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, until } from '../runner';

const TITLES = 'Library/Titles';

/** A title note's frontmatter value for `key`, as written, or undefined. */
const property = (text: string, key: string) =>
  new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(text)?.[1]?.trim().replace(/^"|"$/g, '');

export const libraryTests: E2eTest[] = [
  {
    name: 'a book is cataloged, and its status and rating set from the reader',
    async run({ page, golden }) {
      await page.run(async (folder: string) => {
        const vault = (
          window as unknown as {
            app: { vault: { createFolder(p: string): Promise<unknown>; getAbstractFileByPath(p: string): unknown } };
          }
        ).app.vault;
        if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
      }, TITLES);
      await page.run(setPluginSetting, 'libraryRecordsFolder', TITLES);
      await page.run(setPluginSetting, 'librarySetupDone', true);
      await page.run(setPluginSetting, 'libraryEnabled', true);

      const book = 'fixtures/resilience/Catalog Copy.epub';
      await page.run(copyVaultFile, 'fixtures/footnotes.epub', book, null);
      await page.run(openBook, book, 30_000);
      await dismissDialogs(page);

      // One step, no dialog: the title note is written in the folder for new title notes.
      let from = await page.run(noticeCount);
      expect(await page.run(runCommand, 'orbis-reader:orbis-catalog-this-book'), 'Catalog this book was not offered');
      const said = await page.run(noticesSince, from, 'Cataloged', 5000);
      expect(
        said.some((n) => n.startsWith('Cataloged ')),
        `cataloging said ${JSON.stringify(said)}`
      );
      const [note] = await until(
        () => page.run(vaultFiles).then((f) => f.filter((p) => p.startsWith(`${TITLES}/`) && p.endsWith('.md'))),
        (f) => f.length === 1,
        10_000,
        'cataloging wrote no title note'
      );
      // Asked of the palette, not run: once Obsidian has indexed the new note, the book is no longer uncataloged.
      await until(
        () => page.run(orbisCommands),
        (offered) => !offered.some((c) => c.id === 'orbis-reader:orbis-catalog-this-book'),
        10_000,
        'Catalog this book is still offered for a book that now has a title note'
      );
      const dates = (text: string) =>
        text
          .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, '<date>')
          .replace(/^(added|created|modified):.*$/gm, '$1: <date>');
      golden('catalog-title-note.md', dates(await page.run(readVaultFile, note)));

      // Reading status, from the book.
      from = await page.run(noticeCount);
      expect(await page.run(runCommand, 'orbis-reader:orbis-set-reading-status'), 'Set reading status was not offered');
      await page.run(pickRow, 'read');
      expect(
        (await page.run(noticesSince, from, 'Reading status set', 5000)).includes('Reading status set to read'),
        'setting the status said nothing'
      );
      await until(
        () => page.run(readVaultFile, note),
        (t) => property(t, 'reading_status') === 'read',
        5000,
        'the title note does not say the book was read'
      );

      // A rating, then the same rating again, which clears it.
      from = await page.run(noticeCount);
      expect(await page.run(runCommand, 'orbis-reader:orbis-rate-this-book'), 'Rate this book was not offered');
      await page.run(pickRow, '4');
      await until(
        () => page.run(readVaultFile, note),
        (t) => property(t, 'rating') === '4',
        5000,
        'the rating was not written'
      );
      await page.run(runCommand, 'orbis-reader:orbis-rate-this-book');
      await page.run(pickRow, '4');
      const notices = await page.run(noticesSince, from, 'Rating cleared', 5000);
      expect(
        notices.includes('Rated 4 out of 5') && notices.includes('Rating cleared'),
        `rating said ${JSON.stringify(notices)}`
      );
      await until(
        () => page.run(readVaultFile, note),
        (t) => !property(t, 'rating'),
        5000,
        'the rating was not cleared'
      );
      await page.run(closeBooks);
    },
  },
];
