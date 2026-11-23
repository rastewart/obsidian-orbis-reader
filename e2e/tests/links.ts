// Links in a book: one that leaves the book is shown in full before it opens, with what makes it look like something
// it is not; one that runs a script is refused; a note reference shows its note without moving the book.

import {
  closeBooks,
  goToSectionWith,
  noticeCount,
  noticesSince,
  openBook,
  popupShown,
  pressPopupButton,
  runCommand,
  shownSection,
} from '../in-page';
import { dismissDialogs, type E2eTest, expect, type TestContext } from '../runner';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Clicks the link in the `n`th row (from 1) of `link-checks.epub`'s first chapter, as a person's click on it does: an
 * `<a>`, an image map's `<area>`, an SVG link or a formula with an address.
 */
function clickRowLink(n: number): void {
  const app = (window as unknown as { app: { workspace: { getLeavesOfType(t: string): { view: unknown }[] } } }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as {
    foliateView?: { renderer: { getContents(): { doc: Document }[] } };
  };
  const doc = view.foliateView?.renderer.getContents().find((c) => c.doc.querySelector('.row'))?.doc;
  if (!doc) throw new Error('the rows are not on screen');
  const row = doc.querySelectorAll('.row')[n - 1];
  const link = row?.querySelector('area, a, [href]');
  if (!link) throw new Error(`row ${n} has no link`);
  const rect = (link as Element).getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, view: doc.defaultView, clientX: rect.x + 2, clientY: rect.y + 2 };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    link.dispatchEvent(new MouseEvent(type, init));
}

/** Clicks the `nth` note reference on the page shown: a short numbered link to a place in the book, `2` or `[2]`. */
function clickNoteRef(nth: number): string {
  const app = (window as unknown as { app: { workspace: { getLeavesOfType(t: string): { view: unknown }[] } } }).app;
  const view = app.workspace.getLeavesOfType('orbis-reader')[0]?.view as {
    foliateView?: { renderer: { getContents(): { doc: Document }[] } };
  };
  const refs: HTMLAnchorElement[] = [];
  for (const { doc } of view.foliateView?.renderer.getContents() ?? [])
    refs.push(
      ...Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="#"]')).filter((a) =>
        /^\[?\d{1,3}\]?$/.test((a.textContent ?? '').trim())
      )
    );
  const ref = refs[nth];
  if (!ref) throw new Error(`the page has no note reference #${nth}; it has ${refs.length}`);
  const rect = ref.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    view: ref.ownerDocument.defaultView,
    clientX: rect.x + 2,
    clientY: rect.y + 2,
  };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    ref.dispatchEvent(new MouseEvent(type, init));
  return (ref.textContent ?? '').trim();
}

/**
 * Rows of `link-checks.epub` to try, by number. Row 5 is left out, as its page says what it shows differs by device,
 * and row 18 opens another book in the tab.
 */
const ROWS = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23];

/** One book's first two note references: each previews its note without moving the book, and Go and back work. */
async function previewsIn({ page }: TestContext, path: string, chapter: string): Promise<string[]> {
  await page.run(openBook, path, 30_000);
  await dismissDialogs(page);
  const out: string[] = [];
  for (const nth of [0, 1]) {
    const at = await page.run(goToSectionWith, chapter, 60);
    const ref = await page.run(clickNoteRef, nth).catch((e: Error) => {
      throw new Error(`${path}: ${e.message}`);
    });
    const preview = await page.run(popupShown, 3000);
    expect(!!preview, `${path}: selecting note reference ${ref} showed no preview`);
    out.push(`${path} | ${ref} | ${preview?.lines.join(' / ')}`);
    expect((await page.run(shownSection)) === at, `${path}: the preview of note ${ref} moved the book`);
    if (nth === 0) {
      // Go reaches the note; back returns to the reference.
      await page.run(pressPopupButton, 'Go');
      await sleep(800);
      const there = await page.run(shownSection);
      expect(await page.run(runCommand, 'orbis-reader:orbis-go-back'), 'Go back was not offered after Go');
      await sleep(800);
      const back = await page.run(shownSection);
      expect(back === at, `${path}: back from note ${ref} (in section ${there}) went to section ${back}, not ${at}`);
    } else await dismissDialogs(page);
  }
  return out;
}

export const linkTests: E2eTest[] = [
  {
    name: 'a link out of the book is shown in full before it opens',
    timeoutMs: 120_000,
    async run({ page, golden }) {
      await page.run(openBook, 'fixtures/link-checks.epub', 30_000);
      await dismissDialogs(page);
      await page.run(goToSectionWith, 'Open this link', 10);
      const out: string[] = [];
      for (const n of ROWS) {
        const from = await page.run(noticeCount);
        await page.run(clickRowLink, n);
        const dialog = await page.run(popupShown, 1500);
        const notices = (await page.run(noticesSince, from, '', dialog ? 0 : 500)).filter(
          (t) => !/^Orbis Reader:/.test(t)
        );
        out.push(`--- row ${n}`);
        if (dialog) out.push(...dialog.lines, `buttons: ${dialog.buttons.join(', ')}`);
        else out.push('(no dialog)');
        for (const notice of notices) out.push(`notice: ${notice}`);
        // Never Open: Cancel, or Escape for a dialog without one, such as a note's preview.
        if (dialog?.buttons.some((b) => b.startsWith('Cancel'))) await page.run(pressPopupButton, 'Cancel');
        await dismissDialogs(page);
        expect(
          (await page.run(
            () =>
              (
                window as unknown as { app: { workspace: { getLeavesOfType(t: string): unknown[] } } }
              ).app.workspace.getLeavesOfType('orbis-reader').length
          )) === 1,
          `row ${n} opened something in place of the book`
        );
      }
      golden('link-checks.txt', `${out.join('\n')}\n`);
      await page.run(closeBooks);
    },
  },
  {
    name: 'a note reference shows its note, and Go and back work',
    async run(context) {
      const out = [
        ...(await previewsIn(context, 'fixtures/footnotes.epub', 'An InDesign-style reference')),
        ...(await previewsIn(context, 'fixtures/endnotes.epub', 'Two notes in one paragraph')),
        ...(await previewsIn(context, 'fixtures/fb2-notes.fb2', 'Two notes in one paragraph')),
      ];
      context.golden('note-previews.txt', `${out.join('\n')}\n`);
    },
  },
  {
    name: 'with link preview off, a note reference goes to its note',
    async run({ page }) {
      await page.run(openBook, 'fixtures/endnotes.epub', 30_000);
      await dismissDialogs(page);
      expect(
        await page.run(runCommand, 'orbis-reader:orbis-toggle-link-preview'),
        'Toggle link preview was not offered'
      );
      const at = await page.run(goToSectionWith, 'Two notes in one paragraph', 60);
      await page.run(clickNoteRef, 0);
      expect((await page.run(popupShown, 1000)) === null, 'with link preview off, a preview still opened');
      await sleep(800);
      const there = await page.run(shownSection);
      expect(there !== at, `with link preview off, the note reference left the book in section ${at}`);
    },
  },
];
