// What Orbis makes of a book and of notes: a book saved as Markdown or as a PDF, marks saved as a PDF, and notes made
// into a book and read in Orbis.

import {
  closeBooks,
  markParagraphs,
  openBook,
  openInNewTab,
  pdfInfo,
  readVaultFile,
  runCommand,
  saveDialog,
  shownBook,
  vaultFiles,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext } from '../runner';

/** The vault's text that changes from run to run: dates. */
const undated = (text: string) => text.replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, '<date>');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `command` with what is in front, presses its dialog's main button, and returns the files ending in `ext` it
 * wrote. A dialog can close before its files are written, so they are waited for until none has appeared for a second.
 */
async function saveWith({ page }: TestContext, command: string, ext: string): Promise<string[]> {
  const before = new Set(await page.run(vaultFiles));
  expect(await page.run(runCommand, `orbis-reader:${command}`), `${command} was not offered`);
  await page.run(saveDialog, 60_000);
  let written: string[] = [];
  for (let waited = 0, sameFor = 0; waited < 60_000 && !(written.length && sameFor >= 1000); waited += 250) {
    await sleep(250);
    const now = (await page.run(vaultFiles)).filter((p) => !before.has(p) && p.endsWith(ext));
    sameFor = now.length === written.length ? sameFor + 250 : 0;
    written = now;
  }
  return written;
}

/** A book saved as Markdown, a note per chapter as it is by default, compared with what it gave before. */
function markdownTest(path: string, goldenName: string): E2eTest {
  return {
    name: `save as Markdown: ${path.split('/').pop()}`,
    async run(context) {
      await context.page.run(openBook, path, 30_000);
      await dismissDialogs(context.page);
      const written = await saveWith(context, 'orbis-save-as-markdown', '.md');
      expect(written.length > 0, 'Save as Markdown wrote no notes');
      const texts: string[] = [];
      for (const note of written) texts.push(`=== ${note}\n${await context.page.run(readVaultFile, note)}`);
      context.golden(goldenName, undated(texts.join('\n')));
    },
  };
}

export const conversionTests: E2eTest[] = [
  // Chapters and footnotes in an EPUB, code and a diagram in a technical book, notes in an FB2, and a MOBI's
  // character references.
  markdownTest('fixtures/footnotes.epub', 'markdown-footnotes-epub.md'),
  markdownTest('fixtures/technical-book.epub', 'markdown-technical-book-epub.md'),
  markdownTest('fixtures/fb2-notes.fb2', 'markdown-fb2-notes-fb2.md'),
  markdownTest('fixtures/cafe-and-co.mobi', 'markdown-cafe-and-co-mobi.md'),
  {
    name: 'save as PDF writes the book',
    timeoutMs: 120_000,
    async run(context) {
      await context.page.run(openBook, 'fixtures/numbered-chapters.epub', 30_000);
      await dismissDialogs(context.page);
      const written = await saveWith(context, 'orbis-save-as-pdf', '.pdf');
      expect(written.length === 1, `Save as PDF wrote ${written.length} files, not one`);
      const pdf = await context.page.run(pdfInfo, written[0]);
      expect(pdf.isPdf, `${written[0]} is not a PDF`);
      expect(pdf.pages > 5, `the book's PDF has ${pdf.pages} pages`);
    },
  },
  {
    name: 'save annotations as PDF writes the marks',
    timeoutMs: 120_000,
    async run(context) {
      await context.page.run(openBook, 'fixtures/endnotes.epub', 30_000);
      await dismissDialogs(context.page);
      await context.page.run(markParagraphs, [0, 1], 700);
      const written = await saveWith(context, 'orbis-save-annotations-as-pdf', '.pdf');
      expect(written.length === 1, `Save annotations as PDF wrote ${written.length} files, not one`);
      const pdf = await context.page.run(pdfInfo, written[0]);
      expect(pdf.isPdf, `${written[0]} is not a PDF`);
      expect(pdf.pages >= 1, `the marks' PDF has ${pdf.pages} pages`);
    },
  },
  {
    name: 'save note as EPUB makes a book that opens',
    async run(context) {
      const { page } = context;
      await page.run(closeBooks);
      await page.run(openInNewTab, 'fixtures/notes-to-epub/Kitchen Sink.md');
      const written = await saveWith(context, 'orbis-save-note-as-epub', '.epub');
      expect(written.length === 1, `Save note as EPUB wrote ${written.length} books, not one`);
      const book = await page.run(openBook, written[0], 30_000);
      await dismissDialogs(page);
      expect(book.sections > 0, 'the book made from the note has no sections');
      const shown = await page.run(shownBook, 15_000);
      context.golden('note-as-epub-contents.txt', `${shown.contents.join('\n')}\n`);
    },
  },
  {
    name: 'read in Orbis Reader opens a note as a book',
    async run({ page }) {
      await page.run(closeBooks);
      await page.run(openInNewTab, 'fixtures/notes-to-epub/Clipped Article.md');
      const note = await page.run(readVaultFile, 'fixtures/notes-to-epub/Clipped Article.md');
      expect(await page.run(runCommand, 'orbis-reader:orbis-read-in-orbis'), 'Read in Orbis Reader was not offered');
      await dismissDialogs(page);
      const shown = await page.run(shownBook, 30_000);
      // A line of the note's own prose, past its properties and title, should be in the book.
      const line = note
        .replace(/^---[\s\S]*?---/, '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => /^[A-Z][^#*>|[`]{40,}/.test(l));
      expect(!!line, 'the note has no line of prose to look for');
      const words = (line ?? '').slice(0, 30);
      expect(shown.text.replace(/\s+/g, ' ').includes(words), `the book does not show "${words}" from the note`);
    },
  },
];
