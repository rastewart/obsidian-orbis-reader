// Notes made into books: converting again when nothing changed writes nothing, Read in Orbis Reader keeps one book
// per note, and a folder of notes becomes one book or a set of books, in the order its index note gives.

import {
  closeBooks,
  modifiedTime,
  notesProblems,
  noticeCount,
  noticesSince,
  openBook,
  openFolderConversion,
  openInNewTab,
  runCommand,
  saveDialog,
  shownBook,
  vaultFiles,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext, until } from '../runner';

const DIR = 'fixtures/notes-to-epub';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Files under `prefix` ending in `ext`. */
async function filesUnder({ page }: TestContext, prefix: string, ext: string): Promise<string[]> {
  return (await page.run(vaultFiles)).filter((p) => p.startsWith(prefix) && p.endsWith(ext));
}

/** Runs Save note as EPUB on `note` and presses Save. */
async function saveNoteAsEpub({ page }: TestContext, note: string): Promise<void> {
  await page.run(closeBooks);
  await page.run(openInNewTab, note);
  expect(await page.run(runCommand, 'orbis-reader:orbis-save-note-as-epub'), 'Save note as EPUB was not offered');
  await page.run(saveDialog, 60_000);
}

export const epubTests: E2eTest[] = [
  {
    name: 'converting a note again when nothing changed writes nothing',
    async run(context) {
      const { page } = context;
      const book = `${DIR}/Kitchen Sink.epub`;
      if ((await page.run(modifiedTime, book)) === null) {
        await saveNoteAsEpub(context, `${DIR}/Kitchen Sink.md`);
        await until(
          () => page.run(modifiedTime, book),
          (t) => t !== null,
          30_000,
          'Save note as EPUB wrote no book'
        );
      }
      const written = await page.run(modifiedTime, book);
      await sleep(1100); // a write now would show as a later time, even on a disk that keeps whole seconds
      const from = await page.run(noticeCount);
      await saveNoteAsEpub(context, `${DIR}/Kitchen Sink.md`);
      const said = await page.run(noticesSince, from, 'already up to date', 5000);
      expect(said.includes('Kitchen Sink.epub is already up to date.'), `saving again said ${JSON.stringify(said)}`);
      expect((await page.run(modifiedTime, book)) === written, 'saving an unchanged note again wrote the book again');
    },
  },
  {
    name: 'read in Orbis Reader keeps one book per note',
    async run(context) {
      const { page } = context;
      const read = async (note: string) => {
        await page.run(closeBooks);
        await page.run(openInNewTab, note);
        expect(
          await page.run(runCommand, 'orbis-reader:orbis-read-in-orbis'),
          `Read in Orbis Reader was not offered for ${note}`
        );
        await dismissDialogs(page);
        return page.run(shownBook, 30_000);
      };
      await read(`${DIR}/Clipped Article.md`);
      await read(`${DIR}/Clipped Article.md`);
      const books = await filesUnder(context, `${DIR}/Clipped Article`, '.epub');
      expect(books.length === 1, `reading the same note twice left ${books.length} books: ${books.join(', ')}`);

      // A note with a very long name gives a book whose name is cut to 80 characters.
      const long = (await filesUnder(context, `${DIR}/Field Guide/005-`, '.md'))[0];
      expect(!!long, 'the long Part Two note is missing');
      const shown = await read(long);
      const name =
        shown.path
          .split('/')
          .pop()
          ?.replace(/\.epub$/, '') ?? '';
      expect(name.length <= 80, `the book from the long note is named "${name}", ${name.length} characters`);
    },
  },
  {
    name: 'a folder of notes becomes one book, in its index note order',
    async run(context) {
      const { page, golden } = context;
      await page.run(closeBooks);
      await page.run(openFolderConversion, `${DIR}/Field Guide`, false);
      await page.run(saveDialog, 60_000);
      const book = `${DIR}/Field Guide.epub`;
      await until(
        () => page.run(modifiedTime, book),
        (t) => t !== null,
        30_000,
        'Save folder as EPUB wrote no book'
      );
      await page.run(openBook, book, 30_000);
      await dismissDialogs(page);
      const shown = await page.run(shownBook, 15_000);
      golden('folder-epub-contents.txt', `${shown.contents.join('\n')}\n`);
    },
  },
  {
    name: 'a folder of notes becomes a set of books with a contents note',
    async run(context) {
      const { page } = context;
      await page.run(closeBooks);
      const out = `${DIR}/Field Guide-EPUB/`;
      await page.run(openFolderConversion, `${DIR}/Field Guide`, true);
      await page.run(saveDialog, 60_000);
      const books = await until(
        () => filesUnder(context, out, '.epub'),
        (b) => b.length >= 6,
        60_000,
        'Save folder notes as EPUBs did not write six books'
      );
      expect(books.length === 6, `Save folder notes as EPUBs wrote ${books.length} books, not six`);
      const contents = await filesUnder(context, out, '.md');
      expect(contents.length === 1, `the set has ${contents.length} contents notes, not one`);
      const problems = await page.run(notesProblems, contents, 20_000);
      expect(!problems.length, `the contents note has problems\n  ${problems.join('\n  ')}`);

      // Again, with nothing changed: nothing is written.
      const from = await page.run(noticeCount);
      await page.run(openFolderConversion, `${DIR}/Field Guide`, true);
      await page.run(saveDialog, 60_000);
      const said = await page.run(noticesSince, from, 'already up to date', 5000);
      expect(
        said.some((n) => /^Every EPUB in .*Field Guide-EPUB.* is already up to date\.$/.test(n)),
        `saving the set again said ${JSON.stringify(said)}`
      );
    },
  },
];
