// Cataloging the one book someone asked about — from the reader's ⋯ menu, a book's file menu, or the palette.
//
// Beside the review rather than in it: the review is for a vault's worth of books, and one book needs it only when
// it looks like a title note already there. See `catalogOneBook`.

import { type App, Notice, type TFile } from 'obsidian';
import { openCatalogReview } from './CatalogModal';
import { t } from './i18n';
import { catalogOneBook, coversFolderFor } from './library/cataloging';
import { destinationFolder } from './library/destination';
import { titleNoteFolders } from './library/title-note';
import { logToLibrary } from './reader/DebugLog';
import type { IOrbisReaderPlugin } from './settings';

/**
 * *Catalog this book* — from the reader's ⋯ menu, a book's file menu, or the palette.
 *
 * **No review for one book unless it needs one.** Written at once with the folder and cover settings, and a notice
 * saying so; only a book that looks like a title note already in the vault opens the review, for the one question
 * that matters — see `catalogOneBook`.
 */
export async function catalogThisBook(
  app: App,
  plugin: IOrbisReaderPlugin,
  book: TFile,
  onDone: (written: readonly string[]) => void
): Promise<void> {
  try {
    const result = await catalogOneBook(app, book, singleBookFolder(app, plugin), singleBookCovers(plugin));
    if (result === 'matched') {
      openCatalogReview(app, plugin, onDone, [book]);
      return;
    }
    new Notice(t('library.cataloged_first', { title: result.title }));
    onDone([result.path]);
  } catch (err) {
    new Notice(t('library.catalog_note_failed', { title: book.basename }));
    logToLibrary({ app }, `catalog this book failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Where a single book's note goes: the titles folder when set, else where most title notes are, else the root. */
export function singleBookFolder(app: App, plugin: IOrbisReaderPlugin): string {
  return destinationFolder(plugin.settings.libraryRecordsFolder, titleNoteFolders(app));
}

/** Where a single book's cover goes, or null when covers are not being saved. */
export function singleBookCovers(plugin: IOrbisReaderPlugin): string | null {
  return plugin.settings.libraryExtractCovers ? coversFolderFor(plugin.settings) : null;
}
