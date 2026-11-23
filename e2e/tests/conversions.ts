// What Orbis makes of a book and of notes: a book saved as Markdown or as a PDF, marks saved as a PDF, and notes made
// into a book and read in Orbis.

import {
  closeBooks,
  copyVaultFile,
  deleteInVault,
  dialogsOpen,
  holdIndexBuilds,
  indexState,
  markParagraphs,
  noteParagraph,
  notesProblems,
  noticeCount,
  noticesSince,
  openBook,
  openInNewTab,
  pdfInfo,
  pickInDialog,
  readVaultFile,
  removeVaultPath,
  runCommand,
  saveDialog,
  setPluginSetting,
  shownBook,
  vaultFiles,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext } from '../runner';

/** The vault's text that changes from run to run: dates. */
const undated = (text: string) => text.replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, '<date>');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `command` with what is in front, presses its dialog's main button, and returns the files ending in `ext` it
 * wrote.
 */
async function saveWith(context: TestContext, command: string, ext: string, choice?: string): Promise<string[]> {
  const before = new Set(await context.page.run(vaultFiles));
  expect(await context.page.run(runCommand, `orbis-reader:${command}`), `${command} was not offered`);
  return pressSave(context, before, ext, choice);
}

/**
 * Presses the open dialog's main button, after `choice` if given, and returns the files ending in `ext` that were not
 * in `before`. A dialog can close before its files are written, so they are waited for until none has appeared for a
 * second.
 */
async function pressSave({ page }: TestContext, before: Set<string>, ext: string, choice?: string): Promise<string[]> {
  if (choice) await page.run(pickInDialog, choice);
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

/** What the Markdown tests exported, by folder or note, removed before the next one saves. */
const exported: string[] = [];

/**
 * A book saved as Markdown, a note per chapter as it is by default (or as one note), compared with what it gave
 * before. Every note written must be one Obsidian can read: frontmatter it parses, and links that lead somewhere.
 */
function markdownTest(path: string, goldenName: string, single = false): E2eTest {
  return {
    name: `save as Markdown: ${path.split('/').pop()}${single ? ' as one note' : ''}`,
    timeoutMs: 90_000,
    async run(context) {
      // What an earlier export wrote goes first: the same book in another format has the same title, and its folder
      // already there would make this one a numbered copy, named after which test happened to run before.
      for (const earlier of exported.splice(0)) await context.page.run(deleteInVault, earlier);
      await context.page.run(openBook, path, 30_000);
      await dismissDialogs(context.page);
      // Saved at once, before the book's location index may be built: the dialog waits for it, as
      // `savedBeforeMeasured` checks on purpose.
      const written = await saveWith(
        context,
        'orbis-save-as-markdown',
        '.md',
        single ? 'Single Obsidian note' : undefined
      );
      await checkMarkdown(context, path, written, goldenName, single);
    },
  };
}

/**
 * What Save as Markdown wrote for `path`: notes Obsidian can read, matching `goldenName`. Each export is remembered
 * so the next Markdown test removes it first.
 */
async function checkMarkdown(
  context: TestContext,
  path: string,
  written: string[],
  goldenName: string,
  single = false
): Promise<void> {
  expect(written.length > 0, 'Save as Markdown wrote no notes');
  expect(!single || written.length === 1, `as one note, Save as Markdown wrote ${written.length} notes`);
  // The folder or the note this export made, and a single note's images beside it, to remove before the next.
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  for (const root of new Set(written.map((p) => dir + p.slice(dir.length).split('/')[0])))
    exported.push(root, ...(root.endsWith('.md') ? [`${root.slice(0, -3)}-assets`] : []));
  const problems = await context.page.run(notesProblems, written, 20_000);
  expect(!problems.length, `what Save as Markdown wrote has problems\n  ${problems.join('\n  ')}`);
  const texts: string[] = [];
  for (const note of written) texts.push(`=== ${note}\n${await context.page.run(readVaultFile, note)}`);
  context.golden(goldenName, undated(texts.join('\n')));
}

/**
 * Save as Markdown asked for before the book's location index is built, as on a large book's first open on a slow
 * phone: the build is held, so this happens every run. The dialog waits for the index, saying so, and the notes are
 * the ones the book gives once it is measured (`markdown-omnibus-epub.md`), its continuing file included.
 */
const savedBeforeMeasured: E2eTest = {
  name: 'save as Markdown waits for a book being measured',
  timeoutMs: 120_000,
  async run(context) {
    const { page } = context;
    const path = 'fixtures/omnibus.epub';
    for (const earlier of exported.splice(0)) await page.run(deleteInVault, earlier);
    await page.run(openBook, path, 30_000);
    await dismissDialogs(page);
    expect(await page.run(holdIndexBuilds, true), 'no book was open to hold the location index of');
    let before: Set<string>;
    try {
      // Its saved index removed, so opening it again builds one, as a book's first open does.
      for (const cache of (await page.run(vaultFiles)).filter((p) => p.endsWith('/omnibus.epub.pages.json')))
        await page.run(removeVaultPath, cache);
      await page.run(closeBooks);
      await page.run(openBook, path, 30_000);
      await dismissDialogs(page);
      const index = await page.run(indexState);
      expect(!index.ready && index.building, `the location index was not being built: ${JSON.stringify(index)}`);
      before = new Set(await page.run(vaultFiles));
      const from = await page.run(noticeCount);
      expect(await page.run(runCommand, 'orbis-reader:orbis-save-as-markdown'), 'Save as Markdown was not offered');
      const notices = await page.run(noticesSince, from, 'Preparing the chapter list', 3000);
      expect(
        notices.some((n) => n.includes('Preparing the chapter list')),
        `no notice said the chapters were being prepared: ${JSON.stringify(notices)}`
      );
      await sleep(1000);
      expect((await page.run(dialogsOpen)) === 0, 'Save as Markdown opened before the book was measured');
    } finally {
      await page.run(holdIndexBuilds, false);
    }
    const written = await pressSave(context, before, '.md');
    await checkMarkdown(context, path, written, 'markdown-omnibus-epub.md');
  },
};

export const conversionTests: E2eTest[] = [
  // Chapters and footnotes in an EPUB, code and a diagram in a technical book, notes in an FB2, and a MOBI's
  // character references.
  markdownTest('fixtures/footnotes.epub', 'markdown-footnotes-epub.md'),
  markdownTest('fixtures/technical-book.epub', 'markdown-technical-book-epub.md'),
  markdownTest('fixtures/fb2-notes.fb2', 'markdown-fb2-notes-fb2.md'),
  markdownTest('fixtures/cafe-and-co.mobi', 'markdown-cafe-and-co-mobi.md'),
  // The books the Conversions test plan calls hard: notes at the back numbered again in each chapter, a Project
  // Gutenberg layout whose file breaks cut across the text, an omnibus of novels, Calibre's contents that point at
  // files rather than headings, and the same books as Kindle files.
  markdownTest('fixtures/endnotes.epub', 'markdown-endnotes-epub.md'),
  markdownTest('fixtures/endnotes.epub', 'markdown-endnotes-epub-single.md', true),
  markdownTest('fixtures/gutenberg-style.epub', 'markdown-gutenberg-style-epub.md'),
  markdownTest('fixtures/omnibus.epub', 'markdown-omnibus-epub.md'),
  savedBeforeMeasured,
  markdownTest('fixtures/calibre-body-anchors.epub', 'markdown-calibre-body-anchors-epub-single.md', true),
  markdownTest('fixtures/parts-and-chapters.azw3', 'markdown-parts-and-chapters-azw3.md'),
  markdownTest('fixtures/technical-book.azw3', 'markdown-technical-book-azw3.md'),
  markdownTest('fixtures/annotation-workhorse.mobi', 'markdown-annotation-workhorse-mobi.md'),
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
    name: 'save as PDF carries the marks, with a cover sheet and a comment per note',
    timeoutMs: 180_000,
    async run(context) {
      const { page } = context;
      const path = 'fixtures/resilience/PDF Copy.epub';
      await page.run(copyVaultFile, 'fixtures/footnotes.epub', path, null);
      await page.run(openBook, path, 30_000);
      await dismissDialogs(page);
      await page.run(markParagraphs, [0], 300);
      await page.run(noteParagraph, 1, 'A note for the PDF.', null);
      await page.run(noteParagraph, 2, 'Another note for the PDF.', 0);
      const save = async () => {
        const written = await saveWith(context, 'orbis-save-as-pdf', '.pdf');
        expect(written.length === 1, `Save as PDF wrote ${written.length} files, not one`);
        const pdf = await page.run(pdfInfo, written[0]);
        await page.run(removeVaultPath, written[0]);
        return pdf;
      };
      await page.run(setPluginSetting, 'bookPdfIncludeMarks', true);
      await page.run(setPluginSetting, 'bookPdfCoverSheet', true);
      const marked = await save();
      await page.run(setPluginSetting, 'bookPdfIncludeMarks', false);
      const clean = await save();
      expect(marked.comments === 2, `with the marks, the PDF carries ${marked.comments} comments, not one per note`);
      expect(clean.comments === 0, `without the marks, the PDF still carries ${clean.comments} comments`);
      expect(
        marked.pages === clean.pages + 1,
        `with the marks the PDF has ${marked.pages} pages, without them ${clean.pages}: the cover sheet should be the one more`
      );
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
