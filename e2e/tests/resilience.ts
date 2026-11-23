// A book's reading data survives what happens to the book and to the data itself: the book renamed, moved or deleted,
// the data damaged, the `!orbis-data` folder emptied. The books are the copies in `fixtures/resilience`, which these
// tests are free to change, since every run starts from a fresh vault.

import {
  closeBooks,
  copyVaultFile,
  markParagraphs,
  markPositions,
  noticeCount,
  noticesSince,
  openBook,
  removeVaultPath,
  renameInVault,
  runCommand,
  settledPlace,
  trashInVault,
  turnTo,
  vaultFiles,
  vaultText,
  writeVaultFile,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext, until } from '../runner';

const DIR = 'fixtures/resilience';
const DATA = `${DIR}/!orbis-data`;

/** Closes every tab showing a book's reading data. */
function closeReadingData(): void {
  const app = (window as unknown as { app: { workspace: { getLeavesOfType(t: string): { detach(): void }[] } } }).app;
  for (const leaf of app.workspace.getLeavesOfType('orbis-data-view')) leaf.detach();
}

/** The files of a book's reading data in `folder`, by name: `First-Open.epub.orbis` and the rest. */
async function dataFiles({ page }: TestContext, folder: string, book: string): Promise<string[]> {
  return (await page.run(vaultFiles))
    .filter((p) => p.startsWith(`${folder}/!orbis-data/${book}.`))
    .map((p) => p.slice(`${folder}/!orbis-data/`.length));
}

/** The passage selections a book's `.orbis` holds, or null when it cannot be read as one. */
async function orbisMarks({ page }: TestContext, path: string): Promise<number | null> {
  const text = await page.run(vaultText, path);
  try {
    const data = JSON.parse(text ?? '') as { highlights?: unknown[] } | null;
    return Array.isArray(data?.highlights) ? data.highlights.length : null;
  } catch {
    return null;
  }
}

/** Opens `path`, marks one paragraph, then turns to a later place and returns it once saved. */
async function markAndRead(context: TestContext, path: string) {
  const { page } = context;
  await page.run(openBook, path, 30_000);
  await dismissDialogs(page);
  const { marks } = await page.run(markParagraphs, [0], 300);
  expect(marks === 1, `marking a paragraph left ${marks} marks`);
  return page.run(turnTo, 1, 1);
}

/** Opens `path` again and checks it holds `marks` marks and is at `section`. */
async function expectKept(context: TestContext, path: string, marks: number, section: number, when: string) {
  const { page } = context;
  await page.run(openBook, path, 30_000);
  await dismissDialogs(page);
  const held = (await page.run(markPositions)).length;
  expect(held === marks, `${when}, the book holds ${held} marks, not ${marks}`);
  const place = await page.run(settledPlace, 15_000);
  expect(place.section === section, `${when}, the book opened at section ${place.section}, not ${section}`);
}

export const resilienceTests: E2eTest[] = [
  {
    name: 'a renamed or moved book keeps its marks and place',
    async run(context) {
      const { page } = context;
      const was = await markAndRead(context, `${DIR}/First-Open.epub`);
      await page.run(closeBooks);

      // Renamed, as the Files pane renames it: every file of its data takes the new name.
      await page.run(renameInVault, `${DIR}/First-Open.epub`, `${DIR}/First-Open renamed.epub`);
      await until(
        () => dataFiles(context, DIR, 'First-Open'),
        (names) => names.length === 0,
        10_000,
        'the reading data kept the old name'
      );
      const renamed = await until(
        () => dataFiles(context, DIR, 'First-Open renamed'),
        (names) => names.some((n) => n.endsWith('.orbis')),
        10_000,
        'the reading data did not take the new name'
      );
      expect(renamed.length >= 2, `after the rename, only ${renamed.join(', ')} took the new name`);
      await expectKept(context, `${DIR}/First-Open renamed.epub`, 1, was.section, 'renamed');
      await page.run(closeBooks);

      // Moved to another folder: its data moves to that folder's `!orbis-data`.
      await page.run(renameInVault, `${DIR}/First-Open renamed.epub`, 'fixtures/First-Open moved.epub');
      await until(
        () => dataFiles(context, 'fixtures', 'First-Open moved'),
        (names) => names.length >= renamed.length,
        10_000,
        'the reading data did not move with the book'
      );
      expect(
        (await dataFiles(context, DIR, 'First-Open renamed')).length === 0,
        'the reading data was left behind in the old folder too'
      );
      await expectKept(context, 'fixtures/First-Open moved.epub', 1, was.section, 'moved');
      await page.run(closeBooks);
      await page.run(renameInVault, 'fixtures/First-Open moved.epub', `${DIR}/First-Open.epub`);
    },
  },
  {
    name: 'a deleted book takes its reading data with it',
    async run(context) {
      const { page } = context;
      await page.run(copyVaultFile, `${DIR}/First-Open.epub`, `${DIR}/Delete Me.epub`, null);
      await markAndRead(context, `${DIR}/Delete Me.epub`);
      await page.run(closeBooks);
      expect((await dataFiles(context, DIR, 'Delete Me')).length > 0, 'the book had no reading data to remove');
      const from = await page.run(noticeCount);
      await page.run(trashInVault, `${DIR}/Delete Me.epub`);
      const said = await page.run(noticesSince, from, 'removed reading data', 10_000);
      expect(
        said.includes('Orbis Reader: removed reading data for "Delete Me".'),
        `deleting the book said ${JSON.stringify(said)}`
      );
      await until(
        () => dataFiles(context, DIR, 'Delete Me'),
        (names) => names.length === 0,
        10_000,
        'the reading data stayed after the book was deleted'
      );
    },
  },
  {
    name: 'damaged reading data is written again from the marks',
    async run(context) {
      const { page } = context;
      const book = `${DIR}/Workhorse Copy.epub`;
      const orbis = `${DATA}/Workhorse Copy.epub.orbis`;
      await page.run(openBook, book, 30_000);
      await dismissDialogs(page);
      await page.run(markParagraphs, [0, 1], 300);
      await until(
        () => orbisMarks(context, orbis),
        (n) => n === 2,
        10_000,
        'the .orbis did not hold the two marks'
      );
      await page.run(closeBooks);

      // Emptied, and then not JSON at all: each time Orbis writes it again from this device's record of its marks.
      for (const damage of ['null', '{ not json']) {
        await page.run(writeVaultFile, orbis, damage);
        await until(
          () => orbisMarks(context, orbis),
          (n) => n === 2,
          10_000,
          `the .orbis was not written again after it was replaced with "${damage}"`
        );
      }
      await page.run(openBook, book, 30_000);
      await dismissDialogs(page);
      const held = (await page.run(markPositions)).length;
      expect(held === 2, `after the .orbis was mended, the book holds ${held} marks, not 2`);
      await page.run(closeBooks);

      // This device's place, damaged: the book opens at its beginning, without an error.
      const location = (await dataFiles(context, DIR, 'Workhorse Copy.epub')).find((n) => n.includes('.location.'));
      expect(!!location, 'the book has no location file for this device');
      await page.run(writeVaultFile, `${DATA}/${location}`, '{ not json');
      await page.run(openBook, book, 30_000);
      await dismissDialogs(page);
      const place = await page.run(settledPlace, 15_000);
      expect(place.section <= 1, `with its place damaged, the book opened at section ${place.section}`);
    },
  },
  {
    name: 'the reading data folder mends itself',
    timeoutMs: 90_000,
    async run(context) {
      const { page } = context;
      const book = `${DIR}/Workhorse Copy.epub`;
      const readme = `${DATA}/!readme.md`;
      await page.run(openBook, book, 30_000);
      await dismissDialogs(page);

      // The readme says what the folder holds, and is put right whenever a book's reading data is shown.
      const original = await page.run(vaultText, readme);
      expect(!!original, 'the reading data folder has no !readme.md');
      await page.run(writeVaultFile, readme, `${original}\nA line of my own.\n`);
      expect(
        await page.run(runCommand, 'orbis-reader:orbis-show-reading-data-for-this-book'),
        'Show reading data was not offered'
      );
      await until(
        () => page.run(vaultText, readme),
        (t) => t === original,
        10_000,
        'the readme kept a line added to it'
      );
      // Shown again in a tab of its own: with the first one still open, the command only brings it forward.
      await page.run(closeReadingData);
      await page.run(removeVaultPath, readme);
      await page.run(runCommand, 'orbis-reader:orbis-show-reading-data-for-this-book');
      await until(
        () => page.run(vaultText, readme),
        (t) => t === original,
        10_000,
        'the readme did not come back'
      );
      await page.run(closeReadingData);

      // The page index is rebuilt when the book next opens.
      const pages = `${DATA}/Workhorse Copy.epub.pages.json`;
      await until(
        () => page.run(vaultText, pages),
        (t) => !!t,
        30_000,
        'the book never wrote its page index'
      );
      await page.run(closeBooks);
      await page.run(removeVaultPath, pages);
      await page.run(openBook, book, 30_000);
      await dismissDialogs(page);
      await until(
        () => page.run(vaultText, pages),
        (t) => !!t,
        30_000,
        'the page index was not built again'
      );
      await page.run(closeBooks);

      // The whole folder deleted while Obsidian runs: it comes straight back, holding a record for each book.
      await page.run(removeVaultPath, DATA);
      const back = await until(
        () => page.run(vaultFiles).then((files) => files.filter((p) => p.startsWith(`${DATA}/`))),
        (files) => files.some((p) => p.includes('.marks.')),
        10_000,
        'the reading data folder did not come back'
      );
      expect(
        back.some((p) => p.startsWith(`${DATA}/Workhorse Copy.epub.marks.`)),
        `the folder came back without the book's record: ${back.join(', ')}`
      );
    },
  },
  {
    name: 'scan annotation data finds nothing wrong',
    async run({ page }) {
      await page.run(openBook, `${DIR}/Workhorse Copy.epub`, 30_000);
      await dismissDialogs(page);
      expect(
        await page.run(runCommand, 'orbis-reader:orbis-scan-annotation-data-for-problems'),
        'Scan annotation data was not offered'
      );
      const said = await page.run(async () => {
        for (let i = 0; i < 50; i++) {
          const text = document.querySelector('.modal-container, .orbis-popup')?.textContent ?? '';
          if (text.includes('Annotation data check') && text.length > 30) return text.replace(/\s+/g, ' ').trim();
          await new Promise((r) => setTimeout(r, 200));
        }
        return '';
      });
      expect(
        said.includes('No problems found — all selections and notes look healthy.'),
        `the scan said "${said.slice(0, 200)}"`
      );
    },
  },
];
