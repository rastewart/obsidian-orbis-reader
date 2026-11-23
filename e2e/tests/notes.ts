// Generate notes writes what it wrote before, with passages in book order.

import { generateNotes, markParagraphs, openBook } from '../in-page';
import { dismissDialogs, type E2eTest, expect } from '../runner';

export const notesTests: E2eTest[] = [
  {
    name: 'generate notes lists passages in book order',
    async run({ page, golden }) {
      await page.run(openBook, 'fixtures/parts-and-chapters.epub', 30_000);
      await dismissDialogs(page);
      // First, third, then second, so the order they were made and the order they appear in differ. As far apart as
      // a person makes them.
      const { starts, marks } = await page.run(markParagraphs, [0, 2, 1], 700);
      expect(marks === 3, `marking three paragraphs left ${marks} marks`);
      const notes = await page.run(generateNotes, 'e2e-notes.md');
      const at = starts.map((s) => notes.indexOf(s));
      expect(
        at.every((i) => i >= 0),
        `a marked passage is missing from the notes: ${JSON.stringify(starts)}`
      );
      expect(at[0] < at[1] && at[1] < at[2], `passages are out of book order: ${JSON.stringify(at)}`);
      // The date the notes were made changes every day, and is not what this checks.
      golden('generate-notes.md', notes.replace(/^(import_date: ).*$/m, '$1<date>'));
    },
  },
];
