// Reading records: with them on, each passage selection and note in a book becomes a note of its own, kept up to date
// as the mark changes. A record the reader never touched goes when its passage does; one they wrote in stays, marked
// orphaned.

import {
  barMarks,
  changeAnnotations,
  copyVaultFile,
  heldAnnotations,
  markParagraphs,
  noteParagraph,
  openBook,
  readVaultFile,
  setPluginSetting,
  vaultFiles,
  vaultText,
  writeVaultFile,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext, until } from '../runner';

const ROOT = 'Reading records';

/** The record notes written so far, by path. */
async function records({ page }: TestContext): Promise<string[]> {
  return (await page.run(vaultFiles)).filter((p) => p.startsWith(`${ROOT}/content/`) && p.endsWith('.md'));
}

/** A record's frontmatter value for `key`, as written. */
const property = (text: string, key: string) =>
  new RegExp(`^${key}: *(.*)$`, 'm').exec(text)?.[1]?.replace(/^"|"$/g, '');

export const recordsTests: E2eTest[] = [
  {
    name: 'reading records follow the marks and notes, and keep what the reader wrote',
    timeoutMs: 120_000,
    async run(context) {
      const { page } = context;
      await page.run(async (folder: string) => {
        const vault = (
          window as unknown as {
            app: { vault: { createFolder(p: string): Promise<unknown>; getAbstractFileByPath(p: string): unknown } };
          }
        ).app.vault;
        if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
      }, ROOT);
      await page.run(setPluginSetting, 'recordsFolder', ROOT);
      await page.run(setPluginSetting, 'recordsSameFolderAsBook', false);
      await page.run(setPluginSetting, 'recordsAllBooksBaseFolder', ROOT);
      await page.run(setPluginSetting, 'recordsSetupDone', true);
      await page.run(setPluginSetting, 'recordsMode', 'on');

      const book = 'fixtures/resilience/Records Copy.epub';
      await page.run(copyVaultFile, 'fixtures/annotation-workhorse.epub', book, null);
      await page.run(openBook, book, 30_000);
      await dismissDialogs(page);

      // A passage selection: its record, a few seconds later, with what the plan names in it.
      await page.run(markParagraphs, [0], 300);
      const [passage] = await until(
        () => records(context),
        (r) => r.length === 1,
        20_000,
        'no record was written for the mark'
      );
      const text = await page.run(readVaultFile, passage);
      expect(property(text, 'kind') === 'passage selection', `the record's kind is ${property(text, 'kind')}`);
      expect(property(text, 'orphaned') === 'false', `a new record is orphaned: ${property(text, 'orphaned')}`);
      expect(/orbis-reading-record/.test(text), 'the record has no orbis-reading-record tag');
      const marker = '<!-- Orbis: everything above is regenerated from the book. Your own notes go below. -->';
      expect(text.includes(marker), "the record has no line marking where the reader's own notes go");
      const bases = (await page.run(vaultFiles)).filter((p) => p.endsWith('.base'));
      expect(bases.length >= 2, `the records came with ${bases.length} bases, not the book's and every book's`);

      // A note: its record carries what was written.
      await page.run(noteParagraph, 1, 'First test note', null);
      const both = await until(
        () => records(context),
        (r) => r.length === 2,
        20_000,
        'no record was written for the note'
      );
      const noteRecord = both.find((p) => p !== passage) ?? '';
      expect(
        property(await page.run(readVaultFile, noteRecord), 'note_text') === 'First test note',
        "the note's record does not carry what the note says"
      );

      // The reader writes below the marker; the mark changes: the record follows, and keeps the reader's line.
      await page.run(writeVaultFile, passage, `${text.trimEnd()}\nMy own line\n`);
      const held = (await page.run(heldAnnotations)).find((a) => a.kind === 'mark');
      const marks = await page.run(barMarks);
      const other = marks.findIndex((m) => m.id && m.id !== held?.markId);
      await page.run(changeAnnotations, { remark: [{ id: held?.id ?? '', markIndex: other }] });
      // Read as it may be between Orbis removing the old text and writing the new: absent, for a moment.
      const remarked = await until(
        () => page.run(vaultText, passage).then((t) => t ?? ''),
        (t) => property(t, 'mark') === marks[other].name,
        20_000,
        `the record's mark did not become ${marks[other].name}`
      );
      expect(remarked.includes('My own line'), 'changing the mark lost the line the reader wrote in its record');

      // A mark nobody wrote about: its record goes with it.
      await page.run(markParagraphs, [2], 300);
      const three = await until(
        () => records(context),
        (r) => r.length === 3,
        20_000,
        'no record was written for the third mark'
      );
      const third = three.find((p) => !both.includes(p)) ?? '';
      const thirdMark = (await page.run(heldAnnotations))
        .filter((a) => a.kind === 'mark')
        .find((a) => a.id !== held?.id);
      await page.run(changeAnnotations, { remove: [thirdMark?.id ?? ''] });
      await until(
        () => page.run(vaultText, third),
        (t) => t === null,
        20_000,
        'the record of a removed mark stayed'
      );

      // The mark the reader wrote about: its record stays, orphaned.
      await page.run(changeAnnotations, { remove: [held?.id ?? ''] });
      const kept = await until(
        () => page.run(vaultText, passage),
        (t) => !!t && property(t, 'orphaned') === 'true',
        20_000,
        'the record the reader wrote in was not kept as orphaned'
      );
      expect(kept?.includes('My own line') ?? false, 'the orphaned record lost the line the reader wrote');
    },
  },
];
