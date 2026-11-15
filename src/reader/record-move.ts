// Move one book's records from one resolved layout to another.
//
// Shared, because the same operation happens for two different reasons: the reader changes a book's location in
// the per-book dialog, and the reader renames or moves the book file, which changes what its layout resolves to
// without them having chosen anything. Doing that twice would be two chances to get the order wrong.
//
// **The order is the point.** Move first, then let an export write. Exporting first produces a complete second
// set at the new location while the old set stays behind unflagged, and the every-book base — which filters on
// the record tag alone — then shows every annotation twice with nothing on screen to explain why. That is the
// hardest state in this feature to unpick by hand.
//
// Vault access but no reader: it takes an `App` and the two path sets, so the rename handler in main.ts can
// call it for a book that is not open. See docs/design/reading-records.md.

import { type App, normalizePath, TFile, TFolder } from 'obsidian';
import { RECORD_MARKER } from './annotation-records';
import { buildDeepLink, buildDeepUrl } from './export-format';
import type { RecordPaths } from './record-paths';
import { bookRecordsBaseYaml } from './records-base';

export interface RecordMoveDeps {
  app: App;
  log: (message: string) => void;
}

/** Every record note in a folder — a path-prefix filter, so no I/O. */
function recordsIn(app: App, folder: string): TFile[] {
  const prefix = `${folder}/`;
  return app.vault.getFiles().filter((f) => f.extension === 'md' && f.path.startsWith(prefix));
}

/**
 * Create `path` and every missing parent.
 *
 * Exported because the destination dialog creates the folder it has just promised — a fourth private copy of this
 * would be worse than sharing one. Segment by segment, since `createFolder` is not guaranteed to make intermediate
 * folders, and best-effort: the folder existing is all any caller needs, however it got there.
 */
export async function ensureVaultFolder(app: App, path: string): Promise<void> {
  const parts = normalizePath(path).split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (app.vault.getAbstractFileByPath(cur)) continue;
    await app.vault.createFolder(cur).catch(() => {
      /* a concurrent create is fine — the folder existing is all this needs */
    });
  }
}

/**
 * Move the records and the base from `before` to `after`. Returns how many records moved.
 *
 * **No cover moves with them.** Records keep none: a record's `cover` is the image its title note points at, which
 * lives in the library's own folder and is not this move's business.
 *
 * Records move **per file** rather than by renaming the folder: the destination may already exist, holding
 * records from an earlier stint at that location, and `renameFile` also updates any links pointing at them.
 *
 * The base is **replaced, not moved**. Its `file.inFolder()` filter is a stored path, so a moved one silently
 * matches nothing — and `writeIfAbsent` never touches a file that exists, so an export would not repair it.
 * Writing the new one here rather than leaving it to a later export matters for the rename case, where the book
 * may not be open and no export is coming.
 *
 * What is NOT done here: rewriting each record's `book`, `link` and `link_url` — a location change leaves the book
 * where it was, so they stay right. A rename moves the book, and `relinkRecords` follows it.
 */
export async function moveRecordFiles(deps: RecordMoveDeps, before: RecordPaths, after: RecordPaths): Promise<number> {
  const { app } = deps;
  if (before.records === after.records) return 0;

  const records = recordsIn(app, before.records);
  // Nothing to move means do nothing — emphatically including not writing a base at the destination. A book
  // that has no records yet must not acquire a folder and a base because its file was renamed.
  if (!records.length && !(app.vault.getAbstractFileByPath(before.bookBase) instanceof TFile)) return 0;
  if (records.length) await ensureVaultFolder(app, after.records);
  let moved = 0;
  for (const record of records) {
    const dest = normalizePath(`${after.records}/${record.name}`);
    if (app.vault.getAbstractFileByPath(dest)) continue; // already there — leave both alone
    try {
      await app.fileManager.renameFile(record, dest);
      moved++;
    } catch (e) {
      deps.log(`records: could not move ${record.path} — ${String(e)}`);
    }
  }

  if (before.bookBase !== after.bookBase) {
    const stale = app.vault.getAbstractFileByPath(before.bookBase);
    if (stale instanceof TFile) {
      await app.fileManager.trashFile(stale).catch(() => {
        /* a base left behind is untidy rather than broken — it simply matches nothing */
      });
    }
  }
  // Written whenever it is absent, which covers both a first move and a base the reader had deleted.
  if (!app.vault.getAbstractFileByPath(after.bookBase)) {
    await ensureVaultFolder(app, after.bookBase.slice(0, after.bookBase.lastIndexOf('/')));
    await app.vault.create(after.bookBase, bookRecordsBaseYaml(after.records)).catch((e) => {
      deps.log(`records: could not write base ${after.bookBase} — ${String(e)}`);
    });
  }

  // Only when it is ours and empty. A folder the reader put something else in is theirs, and an empty folder
  // left behind in their book folder is visible clutter — the one place tidiness is worth a call.
  await removeIfEmpty(app, before);

  deps.log(`records: moved ${moved} of ${records.length} to ${after.records}`);
  return moved;
}

/**
 * Trash the folders the move vacated, innermost first, and only while each is genuinely empty.
 *
 * **The book's records folder, in every layout** — `<book>-reading-records/content/` beside the book, and
 * `<root>/content/<book>/` in a shared or chosen folder. Both belong to this book alone; the shared layout's used to be
 * skipped as though it were shared, so a renamed book left an empty folder under its old name. Then, beside the book,
 * the `<book>-reading-records` folder itself (`bookFolder`, null in a root layout). In a root, its `content/` too once
 * the last book's subfolder has left it — Orbis made it, and empty it holds nothing anyone made — but never the root,
 * which the reader chose and which can hold other things, the every-book base among them. A `cover/`
 * folder is left alone: an image someone may still be pointing at is not ours to bin on a rename.
 *
 * A folder the reader has put something else into is theirs and stays.
 */
async function removeIfEmpty(app: App, before: RecordPaths): Promise<void> {
  const parent = before.records.slice(0, before.records.lastIndexOf('/'));
  // Beside the book, `content/` is inside the book's own folder; in a root it is the shared `<root>/content/`.
  const vacated = before.bookFolder ? [before.records, before.bookFolder] : [before.records, parent];
  for (const path of vacated) {
    const folder = app.vault.getAbstractFileByPath(path);
    if (!(folder instanceof TFolder) || folder.children.length) continue;
    await app.fileManager.trashFile(folder).catch(() => {
      /* an empty folder left behind is untidy, not broken */
    });
  }
}

/**
 * Point a renamed book's records at its new path: `book`, `link` and `link_url`, and the location link in the body.
 *
 * **Not left to Obsidian.** Renaming a file asks whether to update links to it, and the reader's answer is anyone's
 * guess — with No, every record's `book` kept naming a file that no longer existed until the book was next opened.
 * These are Orbis's own properties, rebuilt from what each record already holds (its CFI and location) with the
 * builders the exporter uses, so the answer no longer matters.
 */
export async function relinkRecords(
  deps: RecordMoveDeps,
  folder: string,
  oldPath: string,
  bookPath: string
): Promise<number> {
  let relinked = 0;
  for (const record of recordsIn(deps.app, folder)) {
    try {
      // The body's copy of the link, above the marker. An export rewrites the body only when the properties change,
      // and once they are re-pointed below they no longer do — so a body left alone here stayed on the old path.
      const cached = await deps.app.vault.cachedRead(record);
      if (relinkGeneratedBody(cached, oldPath, bookPath) !== cached) {
        await deps.app.vault.process(record, (content) => relinkGeneratedBody(content, oldPath, bookPath));
      }
      await deps.app.fileManager.processFrontMatter(record, (fm: Record<string, unknown>) => {
        if (typeof fm.orbis_id !== 'string' || typeof fm.orbis_cfi !== 'string') return; // not one of ours
        fm.book = `[[${bookPath}]]`;
        fm.link = buildDeepLink(bookPath, fm.orbis_cfi, typeof fm.loc === 'number' ? fm.loc : undefined);
        fm.link_url = buildDeepUrl(bookPath, fm.orbis_cfi);
        relinked++;
      });
    } catch (e) {
      deps.log(`records: could not relink ${record.path} — ${String(e)}`);
    }
  }
  deps.log(`records: relinked ${relinked} to ${bookPath}`);
  return relinked;
}

/**
 * A record's text with the location links above the marker — the part Orbis regenerates — pointed from `oldPath` to
 * `newPath`. Below the marker is the reader's and is not touched; a record whose marker the reader removed is all theirs.
 * Matched as `buildDeepUrl` encodes the path, and only when the path ends there, so `a.epub` never rewrites `a.epub2`.
 */
export function relinkGeneratedBody(content: string, oldPath: string, newPath: string): string {
  const at = content.indexOf(RECORD_MARKER);
  if (at === -1) return content;
  const from = `orbis-nav?file=${encodeURIComponent(oldPath)}`;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = content
    .slice(0, at)
    .replace(new RegExp(`${escaped}(?=[&)\\s]|$)`, 'g'), `orbis-nav?file=${encodeURIComponent(newPath)}`);
  return head + content.slice(at);
}
