// Saying what you thought of the book you are reading, without leaving it. See docs/design/library.md — slice 14a.
//
// **The two facts you form while reading are the two the reader can set from inside the book**: where you are with
// it, and what you thought of it. Everywhere else in the library they are set from a row's menu, which means finding
// the book in a grid you are not currently looking at — so the same two edits are a command and an item in the
// reader's ⋯ menu, over the book that is already open.
//
// **A title note is written if there isn't one.** Reading status lives on the title note, and a book you are part
// way through is exactly the kind of book somebody has not got round to cataloging — so the choice is offered first
// and the note follows from it, rather than the command refusing until the catalog has been run. The notice names
// both halves, because a note appearing in the vault is a thing that happened and nobody asked for it directly.

import { type App, Notice, type TFile } from 'obsidian';
import { openCatalogReview } from './CatalogModal';
import { singleBookCovers, singleBookFolder } from './catalog-this-book';
import { t } from './i18n';
import { catalogOneBook } from './library/cataloging';
import { type Pick, ratingPicks, statusChoices, statusPicks } from './library/choices';
import { nextRating, setRating } from './library/rating';
import { parseRecord, type ReadingStatus } from './library/record';
import { nextStatus, setReadingStatus } from './library/status';
import { titleNoteFor } from './library/title-note';
import { openOrbisDialog } from './OrbisModal';
import { logToLibrary } from './reader/DebugLog';
import type { IOrbisReaderPlugin } from './settings';
import { LIBRARY_SVG } from './system-glyphs';
import { onActivate } from './ui-utils';

/** Where the open book stands, as its title note has it — and the note, when there is one. */
function bookNow(
  app: App,
  book: TFile
): { note: TFile | null; title: string; status: ReadingStatus | null; rating: number | null } {
  const note = titleNoteFor(app, book.path);
  const record = note ? parseRecord(note.path, app.metadataCache.getFileCache(note)?.frontmatter) : null;
  return {
    note,
    // The catalog's title, which is the book's own rather than its filename's — falling back to the filename for a
    // book nothing describes yet, since that is all anybody knows about it.
    title: record?.title || book.basename,
    status: record?.status ?? null,
    rating: record?.rating ?? null,
  };
}

/**
 * Set the reading status of the open book, cataloging it first if nothing describes it yet.
 *
 * **Choosing the status the book already has clears it**, which is the rule the library's row menu follows — so the
 * tick is also the way to take it off, and there is no row to explain. A book with a status has a note by
 * definition, so clearing never writes one.
 */
export function openStatusDialog(app: App, plugin: IOrbisReaderPlugin, book: TFile): void {
  const now = bookNow(app, book);
  openPickDialog(app, t('library.set_reading_status'), now.title, statusPicks(now.status), async (chosen) => {
    const status = nextStatus(now.status, chosen);
    await withNote(app, plugin, book, now.note, async (path, cataloged) => {
      await setReadingStatus(app, path, status);
      const named = statusChoices().find((choice) => choice.status === status);
      report(cataloged, named ? t('library.status_now', { value: named.label }) : t('library.status_now_cleared'));
      plugin.refreshLibraryViews();
    });
  });
}

/** Rate the open book, cataloging it first if nothing describes it yet. Choosing its current rating clears it. */
export function openRatingDialog(app: App, plugin: IOrbisReaderPlugin, book: TFile): void {
  const now = bookNow(app, book);
  openPickDialog(app, t('library.rate_book'), now.title, ratingPicks(now.rating), async (chosen) => {
    const rating = nextRating(now.rating, chosen);
    await withNote(app, plugin, book, now.note, async (path, cataloged) => {
      await setRating(app, path, rating);
      report(
        cataloged,
        rating === null ? t('library.rating_now_cleared') : t('library.rating_now', { value: String(rating) })
      );
      plugin.refreshLibraryViews();
    });
  });
}

/** What was done, and — when a note was written to hold it — that too. Two lines, because they are two facts. */
function report(cataloged: string | null, what: string): void {
  new Notice(cataloged ? `${t('library.cataloged_first', { title: cataloged })}\n${what}` : what);
}

/**
 * Run `apply` on the book's title note: the one it has, or one written for it now — `cataloged` is the title of a
 * note written here, for the notice to say so.
 *
 * Cataloging here is *Catalog this book*'s own path (`catalogOneBook`), so a note written from inside a book is
 * indistinguishable from one written anywhere else. **A book that looks like a title already in the vault is asked
 * about first** — attach it to that note, or give it its own — in the review, and `apply` runs on whichever note the
 * review ends with; the review hands back the note it wrote, rather than leaving this to find it in a metadata cache
 * that has not caught up. Cancelled, nothing is set. Once, though the review reports both when its run finishes and
 * when it closes.
 */
async function withNote(
  app: App,
  plugin: IOrbisReaderPlugin,
  book: TFile,
  existing: TFile | null,
  apply: (path: string, cataloged: string | null) => Promise<void>
): Promise<void> {
  if (existing) return apply(existing.path, null);
  let result: Awaited<ReturnType<typeof catalogOneBook>>;
  try {
    result = await catalogOneBook(app, book, singleBookFolder(app, plugin), singleBookCovers(plugin));
  } catch (err) {
    new Notice(t('library.catalog_note_failed', { title: book.basename }));
    logToLibrary(plugin, `catalog from the reader failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (result !== 'matched') return apply(result.path, result.title);
  let done = false;
  openCatalogReview(
    app,
    plugin,
    (written) => {
      const path = written[0];
      if (done || !path) return;
      done = true;
      void apply(path, null);
    },
    [book]
  );
}

/**
 * One question, one column of answers: the values on offer, with a tick against the one the note already says.
 *
 * **Rows rather than buttons**, for the reason `renderSummaryRow` gives: Obsidian's mobile stylesheet reaches every
 * `button` in a plugin's dialog and sizes it as it pleases. A row is a div with the keyboard behavior spelled out,
 * which is also what the library's own lists are.
 */
function openPickDialog<T>(
  app: App,
  title: string,
  book: string,
  picks: Array<Pick<T>>,
  chosen: (value: T) => Promise<void>
): void {
  /**
   * **Badged with the Library's own glyph**, which is the rule every other Library dialog already followed — the
   * collection editor, the catalog, the field and value editors and the widget editor all wear it. These two were
   * the exception, and they are the ones a reader is most likely to meet FIRST, since they are reachable from
   * inside a book without ever having opened the Library.
   *
   * Both dialogs this serves are Library, so the badge belongs here rather than at the two call sites. Reading
   * status and a rating both live on the title note; a dialog that writes to the catalog should say so before its
   * title does.
   */
  openOrbisDialog(app, { title, icon: LIBRARY_SVG }, (body, close) => {
    // Which book this is about. The dialog can be opened from the palette with nothing else on screen naming it, and
    // "Rate this book" over the wrong book is a mistake nobody would catch.
    body.createDiv({ cls: 'orbis-pick-book', text: book });
    const list = body.createDiv({ cls: 'orbis-pick-list orbis-list-box' });
    for (const pick of picks) {
      const row = list.createDiv({ cls: `orbis-pick-row${pick.current ? ' is-current' : ''}` });
      row.createDiv({ cls: 'orbis-pick-label', text: pick.label });
      // The tick is a character rather than an icon so the row keeps its height whether or not it carries one.
      row.createDiv({ cls: 'orbis-pick-tick', text: pick.current ? '✓' : '' });
      onActivate(row, () => {
        close();
        void chosen(pick.value);
      });
    }
  });
}
