// Waiting for a book's location index before an export lists its chapters.
//
// **Why an export waits.** Which files continue the chapter before them (`OrbisReaderView.sectionContinues`) is read
// from the location index, which a book builds in the background the first time it is opened. Until it lands no
// file continues anything, so Save as Markdown and Save as PDF opened before then list a continuation as a chapter
// of its own and write it as one (`Section 13`). The recording list does not wait, since `chapterParts` works its
// list out again once the index is measured. An export writes what it listed, so the two exports wait here.
//
// **How long.** For as long as the index is being built, up to `maxMs`: a large book on a slow phone is the case this
// is for, so a short limit would cut off the very build it waits for. When nothing is building — the index failed,
// or has not started yet — it gives the build `graceMs` to start, then goes ahead as an export did before.

import { Notice } from 'obsidian';
import { t } from '../i18n';

export interface IndexProbe {
  ready(): boolean;
  building(): boolean;
}

export interface IndexWaitOptions {
  /** How long to wait for a build that has not started, or has stopped without finishing. */
  graceMs: number;
  /** The most it waits in all, a guard against a build that never ends. */
  maxMs: number;
  /** How often it looks. */
  stepMs: number;
}

export const INDEX_WAIT: IndexWaitOptions = { graceMs: 5_000, maxMs: 120_000, stepMs: 200 };

/** True once the index is ready; false if it gave up waiting and the export goes ahead without it. */
export async function waitForIndex(
  probe: IndexProbe,
  opts: IndexWaitOptions = INDEX_WAIT,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => window.setTimeout(r, ms))
): Promise<boolean> {
  let waited = 0;
  let idle = 0;
  while (!probe.ready()) {
    if (waited >= opts.maxMs || idle >= opts.graceMs) return false;
    await sleep(opts.stepMs);
    waited += opts.stepMs;
    idle = probe.building() ? 0 : idle + opts.stepMs;
  }
  return true;
}

/**
 * The book view's wait, before Save as Markdown or Save as PDF lists the chapters. Nothing is shown for a book already
 * measured, which is nearly every open; otherwise the notice *Preparing the chapter list…* stays while it waits.
 */
export class ChaptersWait {
  /** Whether an export is already waiting, so a second press does not open a second dialog. */
  private waiting = false;

  constructor(private readonly index: IndexProbe & { book(): unknown }) {}

  /** False when the export should not open: another is already waiting, or the book closed or changed meanwhile. */
  async known(): Promise<boolean> {
    if (this.index.ready()) return true;
    if (this.waiting) return false;
    this.waiting = true;
    const book = this.index.book();
    const notice = new Notice(t('notices.preparing_chapters'), 0);
    try {
      await waitForIndex(this.index);
    } finally {
      notice.hide();
      this.waiting = false;
    }
    return !!book && this.index.book() === book;
  }
}
