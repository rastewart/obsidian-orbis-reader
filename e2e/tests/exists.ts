// Saving again where a save already is: Save as new version writes a numbered copy beside it and leaves it alone,
// Replace writes over it. For notes made from marks, and for a book saved as Markdown.

import {
  closeBooks,
  copyVaultFile,
  locationIndexReady,
  markParagraphs,
  openBook,
  pickInDialog,
  readVaultFile,
  runCommand,
  saveAndConfirm,
  saveDialog,
  showBook,
  vaultFiles,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext } from '../runner';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `command`, picks `choice` in its dialog if given, saves, and returns the vault's new files once settled. */
async function save({ page }: TestContext, command: string, choice?: string): Promise<string[]> {
  const before = new Set(await page.run(vaultFiles));
  // The book in front: Generate notes opens what it wrote beside the book, which takes the focus.
  await page.run(showBook);
  expect(await page.run(runCommand, `orbis-reader:${command}`), `${command} was not offered`);
  if (choice) await page.run(pickInDialog, choice);
  // Replacing notes made from marks asks first, since what you wrote in them goes too.
  if (choice === 'Replace' && command === 'orbis-generate-notes') await page.run(saveAndConfirm, 'Replace', 60_000);
  else await page.run(saveDialog, 60_000);
  let written: string[] = [];
  for (let waited = 0, same = 0; waited < 30_000 && same < 1000; waited += 250) {
    await sleep(250);
    const now = (await page.run(vaultFiles)).filter((p) => !before.has(p));
    same = now.length === written.length ? same + 250 : 0;
    written = now;
  }
  return written.filter((p) => !p.includes('/!orbis-data/'));
}

/** Opens a fresh copy of a fixture, so the names it saves under are its own. */
async function openCopy({ page }: TestContext, from: string, name: string): Promise<string> {
  const path = `fixtures/resilience/${name}.epub`;
  await page.run(copyVaultFile, from, path, null);
  await page.run(openBook, path, 30_000);
  await dismissDialogs(page);
  return path;
}

export const existsTests: E2eTest[] = [
  {
    name: 'generating notes again makes a new version beside them, or replaces them',
    async run(context) {
      const { page } = context;
      await openCopy(context, 'fixtures/parts-and-chapters.epub', 'Exists Notes');
      await page.run(markParagraphs, [0], 300);
      const first = await save(context, 'orbis-generate-notes', 'Single Obsidian note');
      expect(first.length === 1 && first[0].endsWith('.md'), `Generate notes wrote ${JSON.stringify(first)}`);
      const original = await page.run(readVaultFile, first[0]);

      await page.run(markParagraphs, [1], 300);
      const version = await save(context, 'orbis-generate-notes', 'Save as new version');
      expect(version.length === 1, `Save as new version wrote ${JSON.stringify(version)}, not one new note`);
      expect(version[0] !== first[0], 'Save as new version wrote over the first note');
      expect((await page.run(readVaultFile, first[0])) === original, 'Save as new version changed the first note');

      await page.run(markParagraphs, [2], 300);
      const replaced = await save(context, 'orbis-generate-notes', 'Replace');
      expect(replaced.length === 0, `Replace wrote new notes: ${replaced.join(', ')}`);
      const now = await page.run(readVaultFile, first[0]);
      expect(now !== original, 'Replace left the first note as it was');
      await page.run(closeBooks);
    },
  },
  {
    name: 'saving a book as Markdown again makes a new version beside it, or replaces it',
    async run(context) {
      const { page } = context;
      await openCopy(context, 'fixtures/footnotes.epub', 'Exists Book');
      expect(await page.run(locationIndexReady, 60_000), 'the location index was not built');
      const folderOf = (files: string[]) => [...new Set(files.map((p) => p.split('/').slice(0, 3).join('/')))];
      const first = await save(context, 'orbis-save-as-markdown');
      expect(first.length > 0, 'Save as Markdown wrote nothing');
      const version = await save(context, 'orbis-save-as-markdown', 'Save as new version');
      expect(
        version.length === first.length && folderOf(version)[0] !== folderOf(first)[0],
        `Save as new version wrote ${folderOf(version).join(', ')}, beside ${folderOf(first).join(', ')}`
      );
      const replaced = await save(context, 'orbis-save-as-markdown', 'Replace');
      expect(replaced.length === 0, `Replace wrote new files: ${replaced.slice(0, 5).join(', ')}`);
      await page.run(closeBooks);
    },
  },
];
