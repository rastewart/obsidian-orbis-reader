// Opening a book's `.orbis` data file.
//
// **Its own module, to break a cycle.** `OrbisDataView` imports `navigateWhenReady` from `OrbisReaderView` — a
// reader is what a data row navigates INTO — while the reader needs this function, because "show me the data behind
// this book" is offered from the reader's own menu. Two modules that each legitimately need something from the other.
//
// The cut goes here rather than around `navigateWhenReady`, which cannot leave: it dispatches to methods on the
// reader view and would take the class with it wherever it went. This function takes nothing from the view at all
// — it makes the folder, refreshes its readme, ensures the file, and opens it — so nothing ties it to the data view.

import { App, Notice, TFile } from 'obsidian';
import { t } from './i18n';
import { ensureDataFolderAt } from './orbis-io';
import { writeFolderReadme } from './orbis-readme';
import { openNoteBeside } from './panes';
import { ensureOrbisFileExists, progressFilePath, progressFolderPath } from './progress';

export async function openBookDataFile(app: App, bookFile: TFile): Promise<void> {
  const folderPath = progressFolderPath(bookFile);
  const filePath = progressFilePath(bookFile);

  await ensureDataFolderAt(app, folderPath);
  // Brought up to date as well as made: this is a moment someone is looking. See `writeFolderReadme`.
  await writeFolderReadme(app, folderPath);

  let orbisFile = app.vault.getAbstractFileByPath(filePath);
  if (!(orbisFile instanceof TFile)) {
    await ensureOrbisFileExists(app, bookFile);
    await new Promise<void>((r) => window.setTimeout(r, 100));
    orbisFile = app.vault.getAbstractFileByPath(filePath);
  }

  if (!(orbisFile instanceof TFile)) {
    new Notice(t('orbis_data_view.could_not_open_reading_data_file'));
    return;
  }

  // Beside the book rather than in front of it, and the pane it is already in when it has one — the rule every
  // route to a note follows. See `openNoteBeside`, which holds the reveal-existing logic.
  await openNoteBeside(app, orbisFile);
}
