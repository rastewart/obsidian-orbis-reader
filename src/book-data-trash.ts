// What happens to a book's reading data when the book itself is deleted.

import { type App, normalizePath, type TFile } from 'obsidian';
import { bookAudioFolderPath, progressFolderPath } from './progress';
import { sidecarStem, sidecarSuffix } from './sidecar-names';

/**
 * Send a deleted book's reading data to the trash: its recordings, then every file in `!orbis-data` that is this
 * book's exactly. Returns how many went. Folders left empty are removed; nothing is lost with them.
 *
 * **The trash, not a deletion.** Through `fileManager`, so Obsidian's own trash setting decides where they go. A
 * book's marks, notes and recordings are real work, and a deletion is not always one the reader meant — Obsidian
 * reports a book moved outside it as deleted, and `BookMoveMatcher` recognises only a move that keeps the name.
 *
 * A file Obsidian has not indexed is left where it is rather than deleted outright.
 */
export async function trashBookData(
  app: App,
  book: TFile,
  log: (msg: string, extra?: unknown) => void
): Promise<number> {
  const adapter = app.vault.adapter;
  const trash = async (path: string): Promise<boolean> => {
    const found = app.vault.getAbstractFileByPath(normalizePath(path));
    if (!found) {
      log('not in the vault index — left in place', path);
      return false;
    }
    await app.fileManager.trashFile(found);
    log('trashed', path);
    return true;
  };

  let removed = 0;
  const folder = normalizePath(progressFolderPath(book));
  // The recordings are a FOLDER — `<!orbis-data>/audio/<book>.audio/`, one subfolder per voice edition — and the
  // file scan below sees only the top level.
  const audioFolder = bookAudioFolderPath(book);
  if ((await adapter.exists(normalizePath(audioFolder))) && (await trash(audioFolder))) removed++;
  if (!(await adapter.exists(folder))) return removed;

  const stem = sidecarStem(book.path);
  for (const path of (await adapter.list(folder)).files) {
    // This book's files exactly — not another format's, and not another book's whose name starts the same way.
    if (sidecarSuffix(stem, path.split('/').pop() ?? '') === null) continue;
    if (await trash(path)) removed++;
  }

  // `audio/` once the last book's recordings have gone from it, then the data folder once the last book's files have.
  const audioParent = `${folder}/audio`;
  for (const emptied of [audioParent, folder]) {
    if (!(await adapter.exists(emptied))) continue;
    const left = await adapter.list(emptied);
    if (left.files.length === 0 && left.folders.length === 0) {
      await adapter.rmdir(emptied, true);
      log('removed the empty folder', emptied);
    }
  }
  return removed;
}
