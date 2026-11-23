// Another device's marks arriving by sync, simulated as the Sync test plan's first run does: a device file written
// under another device's id. The open book shows the mark without being opened again, on the text it was made on.

import {
  copyVaultFile,
  heldAnnotations,
  markParagraphs,
  openBook,
  vaultFiles,
  vaultText,
  writeVaultFile,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, until } from '../runner';

const DATA = 'fixtures/resilience/!orbis-data';

export const syncTests: E2eTest[] = [
  {
    name: "another device's mark appears in the open book",
    async run({ page }) {
      // The other device's mark is made in a copy of the same book, and its file then given to this one.
      for (const name of ['Sync Theirs', 'Sync Mine'])
        await page.run(copyVaultFile, 'fixtures/annotation-workhorse.epub', `fixtures/resilience/${name}.epub`, null);
      await page.run(openBook, 'fixtures/resilience/Sync Theirs.epub', 30_000);
      await dismissDialogs(page);
      await page.run(markParagraphs, [1], 300);
      const theirs = await until(
        () => page.run(vaultFiles).then((f) => f.find((p) => p.startsWith(`${DATA}/Sync Theirs.epub.marks.`))),
        (p) => !!p,
        10_000,
        'the mark was not written to a device file'
      );
      const marks = await until(
        () => page.run(vaultText, theirs ?? ''),
        (t) => !!t && t.includes('cfiRange'),
        10_000,
        'the device file does not hold the mark'
      );

      await page.run(openBook, 'fixtures/resilience/Sync Mine.epub', 30_000);
      await dismissDialogs(page);
      expect((await page.run(heldAnnotations)).length === 0, 'the book had marks before any arrived');
      await page.run(writeVaultFile, `${DATA}/Sync Mine.epub.marks.othertest1.json`, marks ?? '');
      const held = await until(
        () => page.run(heldAnnotations),
        (h) => h.length === 1,
        15_000,
        "the other device's mark did not appear in the open book"
      );
      expect(held[0].shown === held[0].stored, `the arriving mark covers "${held[0].shown}", not "${held[0].stored}"`);
    },
  },
];
