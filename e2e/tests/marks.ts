// Marks are kept, however quickly they are made and through Orbis reloading, and what is made of them lists them in
// book order: the clipboard copy, and notes written one file per chapter.

import {
  copiedText,
  markParagraphs,
  markPositions,
  openBook,
  pickInDialog,
  readVaultFile,
  reloadOrbis,
  runCommand,
  saveDialog,
  vaultFiles,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

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
      const texts: string[] = [];
      for (const path of written) texts.push(`=== ${path}\n${await page.run(readVaultFile, path)}`);
      golden('generate-notes-per-chapter.md', undated(texts.join('\n')));
    },
  },
];
