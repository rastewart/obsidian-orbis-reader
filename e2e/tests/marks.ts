// Marks are kept, however quickly they are made and through Orbis reloading, and what is made of them lists them in
// book order: the clipboard copy, and notes written one file per chapter.

import {
  barMarks,
  bookmarkList,
  changeAnnotations,
  closeBooks,
  copiedText,
  copyVaultFile,
  type HeldAnnotation,
  heldAnnotations,
  markParagraphs,
  markPositions,
  noteParagraph,
  notesProblems,
  noticeCount,
  noticesSince,
  openBook,
  orbisCommands,
  pickInDialog,
  readVaultFile,
  reloadOrbis,
  runCommand,
  saveDialog,
  turnTo,
  vaultFiles,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext } from '../runner';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The vault's text that changes from run to run: today's date. */
const undated = (text: string) =>
  text.replace(/^(import_date: ).*$/gm, '$1<date>').replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>');

export const marksTests: E2eTest[] = [
  {
    name: 'marks made in quick succession are all kept',
    async run({ page }) {
      await page.run(openBook, 'fixtures/First-Open.epub', 30_000);
      await dismissDialogs(page);
      // Five paragraphs at a time, a few milliseconds apart: faster than a person, as fast as a command repeated
      // from the keyboard. Each burst at another gap, since which gap meets a save in flight depends on the computer.
      const gaps = [5, 10, 15, 20];
      for (const [nth, gap] of gaps.entries()) await page.run(markParagraphs, [0, 1, 2, 3, 4], gap, nth);
      const made = gaps.length * 5;
      await sleep(3000);
      const held = (await page.run(markPositions)).length;
      expect(held === made, `of ${made} marks made a few milliseconds apart, ${held} were kept`);
      expect(await page.run(reloadOrbis, 30_000), 'the book was not shown again after Orbis reloaded');
      const saved = (await page.run(markPositions)).length;
      expect(saved === made, `of ${made} marks made a few milliseconds apart, ${saved} were saved`);
    },
  },
  {
    name: 'copy passage selections gives them in book order',
    async run({ page, golden }) {
      await page.run(openBook, 'fixtures/annotation-workhorse.mobi', 30_000);
      await dismissDialogs(page);
      const { starts, marks } = await page.run(markParagraphs, [2, 0, 1], 700);
      expect(marks === 3, `marking three paragraphs left ${marks} marks`);
      expect(
        await page.run(runCommand, 'orbis-reader:orbis-copy-passage-selections-to-clipboard'),
        'the copy command did not run'
      );
      await sleep(500);
      const copied = await page.run(copiedText);
      const at = starts.map((s) => copied.indexOf(s));
      expect(
        at.every((i) => i >= 0),
        `a marked passage is missing from what was copied: ${JSON.stringify(starts)}`
      );
      expect(at[0] < at[1] && at[1] < at[2], `the copied passages are out of book order: ${JSON.stringify(at)}`);
      golden('copy-passage-selections.md', undated(copied));
    },
  },
  {
    name: 'generate notes writes one file per chapter',
    async run({ page, golden }) {
      await page.run(openBook, 'fixtures/parts-and-chapters.azw3', 30_000);
      await dismissDialogs(page);
      await page.run(markParagraphs, [1, 0], 700, 0);
      await page.run(markParagraphs, [0, 2], 700, 1);
      const before = new Set(await page.run(vaultFiles));
      expect(await page.run(runCommand, 'orbis-reader:orbis-generate-notes'), 'Generate notes did not run');
      await page.run(pickInDialog, 'Book folder');
      await page.run(saveDialog, 30_000);
      const written = (await page.run(vaultFiles)).filter((p) => !before.has(p) && p.endsWith('.md'));
      expect(written.length >= 3, `Generate notes wrote ${written.length} notes, not a contents note and two chapters`);
      const problems = await page.run(notesProblems, written, 20_000);
      expect(!problems.length, `what Generate notes wrote has problems\n  ${problems.join('\n  ')}`);
      const texts: string[] = [];
      for (const path of written) texts.push(`=== ${path}\n${await page.run(readVaultFile, path)}`);
      golden('generate-notes-per-chapter.md', undated(texts.join('\n')));
    },
  },
  {
    name: 'marks and notes come back in MOBI and FB2, on the same text',
    async run(context) {
      for (const path of ['fixtures/cafe-and-co.mobi', 'fixtures/fb2-sample.fb2']) {
        await open(context, path);
        await context.page.run(markParagraphs, [0], 300);
        await context.page.run(noteParagraph, 1, 'A note that must come back.', null);
        await context.page.run(closeBooks);
        await open(context, path);
        const held = await context.page.run(heldAnnotations);
        const marks = held.filter((a) => a.kind === 'mark').length;
        const notes = held.filter((a) => a.kind === 'note');
        expect(marks === 1 && notes.length === 1, `${path} came back with ${marks} marks and ${notes.length} notes`);
        expect(notes[0].note === 'A note that must come back.', `${path}: the note came back as "${notes[0].note}"`);
        expectOnTheirText(path, held);
      }
    },
  },
  {
    name: 'a changed or removed mark stays changed through a reload',
    async run(context) {
      const { page } = context;
      const path = await freshCopy(context, 'fixtures/annotation-workhorse.epub', 'Marks Copy');
      await open(context, path);
      await page.run(markParagraphs, [0, 1, 2], 300);
      await page.run(noteParagraph, 3, 'A note to delete.', 0);
      const before = await page.run(heldAnnotations);
      const [first, second, third] = before.filter((a) => a.kind === 'mark');
      const note = before.find((a) => a.kind === 'note');
      expect(!!third && !!note, `marking left ${before.length} annotations, not three marks and a note`);
      const marks = await page.run(barMarks);
      const other = marks.findIndex((m) => m.id && m.id !== first.markId);
      expect(other >= 0, 'the bar has no other mark to change to');
      await page.run(changeAnnotations, {
        remark: [{ id: first.id, markIndex: other }],
        remove: [second.id],
        deleteNotes: [note?.id ?? ''],
      });
      await sleep(1500);
      expect(await page.run(reloadOrbis, 30_000), 'the book was not shown again after Orbis reloaded');
      const after = await page.run(heldAnnotations);
      const ids = after.map((a) => a.id);
      expect(!ids.includes(second.id), 'a removed mark came back after the reload');
      expect(!ids.includes(note?.id ?? ''), 'a deleted note came back after the reload');
      expect(ids.includes(third.id), 'a mark left alone was lost in the reload');
      const changed = after.find((a) => a.id === first.id);
      expect(
        changed?.markId === marks[other].id,
        `the changed mark came back as ${changed?.markId}, not ${marks[other].id} (${marks[other].name})`
      );
      expectOnTheirText('the reloaded book', after);
    },
  },
  {
    name: 'bookmarks are kept, and each copy command lists what the book holds',
    async run(context) {
      const { page, golden } = context;
      const path = await freshCopy(context, 'fixtures/annotation-workhorse.epub', 'Bookmarks Copy');
      await open(context, path);
      // With nothing in the book, each copy command says so, and copies nothing.
      const from = await page.run(noticeCount);
      for (const what of ['passage-selections', 'notes', 'bookmarks'])
        await page.run(runCommand, `orbis-reader:orbis-copy-${what}-to-clipboard`);
      const said = await page.run(noticesSince, from, 'No bookmarks', 3000);
      for (const expected of ['No passage selections', 'No notes', 'No bookmarks'])
        expect(said.includes(expected), `copying from a book with nothing in it said ${JSON.stringify(said)}`);

      // Two bookmarks from the command, kept through closing the book; the command again on the first removes it.
      await page.run(turnTo, 2, 0);
      expect(
        await page.run(runCommand, 'orbis-reader:orbis-toggle-bookmark-on-current-location'),
        'Toggle bookmark was not offered'
      );
      await page.run(turnTo, 4, 0);
      await page.run(runCommand, 'orbis-reader:orbis-toggle-bookmark-on-current-location');
      expect((await page.run(bookmarkList)).length === 2, 'the bookmark command did not add two bookmarks');
      await sleep(1000);
      await page.run(closeBooks);
      await open(context, path);
      const kept = await page.run(bookmarkList);
      expect(kept.length === 2, `after the book was closed, ${kept.length} bookmarks came back, not 2`);
      await page.run(turnTo, 2, 0);
      await page.run(runCommand, 'orbis-reader:orbis-toggle-bookmark-on-current-location');
      expect(
        (await page.run(bookmarkList)).length === 1,
        'the bookmark command on a bookmarked page did not remove it'
      );

      // A note and a mark, and the three copies.
      await page.run(noteParagraph, 1, 'A note for the copy.', null);
      await page.run(markParagraphs, [2], 300);
      const copies: string[] = [];
      for (const what of ['passage-selections', 'notes', 'bookmarks']) {
        await page.run(runCommand, `orbis-reader:orbis-copy-${what}-to-clipboard`);
        await sleep(500);
        copies.push(`=== ${what}`, await page.run(copiedText));
      }
      expect(/loc\. \d+/.test(copies[5]), `the copied bookmark names no location: ${copies[5]}`);
      // A bookmark is the page shown, whose extent and location depend on the window's size; the rest does not.
      copies[5] = copies[5].replace(/\[loc\. \d+\]\([^)]*\)\)/g, '[loc. N](the page)');
      golden('copy-annotations.md', `${undated(copies.join('\n')).replace(/loc\. \d+\]/g, 'loc. N]')}\n`);
    },
  },
  {
    name: 'save annotations as PDF is offered once a passage is marked',
    async run(context) {
      const { page } = context;
      const path = await freshCopy(context, 'fixtures/First-Open.epub', 'Unmarked');
      await open(context, path);
      const offered = async () =>
        (await page.run(orbisCommands)).some((c) => c.id === 'orbis-reader:orbis-save-annotations-as-pdf');
      expect(!(await offered()), 'Save annotations as PDF is offered for a book with nothing marked');
      await page.run(turnTo, 2, 0);
      await page.run(runCommand, 'orbis-reader:orbis-toggle-bookmark-on-current-location');
      expect(!(await offered()), 'Save annotations as PDF is offered for a book with only a bookmark');
      await page.run(markParagraphs, [0], 300);
      expect(await offered(), 'Save annotations as PDF is not offered once a passage is marked');
    },
  },
];

/** Opens a book and closes the dialogs it raises. */
async function open({ page }: TestContext, path: string): Promise<void> {
  await page.run(openBook, path, 30_000);
  await dismissDialogs(page);
}

/** A copy of a fixture with nothing marked in it, made for one test, so other tests' books are left as they are. */
async function freshCopy({ page }: TestContext, from: string, name: string): Promise<string> {
  const to = `fixtures/resilience/${name}.${from.split('.').pop()}`;
  await page.run(copyVaultFile, from, to, null);
  return to;
}

/** Every annotation's stored place still covers the passage it was made on. */
function expectOnTheirText(where: string, held: HeldAnnotation[]): void {
  for (const a of held)
    expect(
      a.shown === a.stored,
      `${where}: a ${a.kind} made on "${a.stored.slice(0, 50)}" now covers "${(a.shown ?? '(nothing)').slice(0, 50)}"`
    );
}
