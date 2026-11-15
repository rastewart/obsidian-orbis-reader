// Picking up another device's changes to a book: its device file for marks, or its `.orbis`, arriving by sync.
//
// Two halves. The plugin watches every book's files and rebuilds a book's `.orbis` when another device's file for it
// arrives — so the Library and the exports see another device's marks without the book being opened. An open book
// listens for the announcement that follows and reloads if what it holds differs. See
// docs/design/book-annotation-sync.md, §Live updates.

import { type App, type EventRef, normalizePath, type TAbstractFile, TFile } from 'obsidian';
import {
  BOOK_CHANGED_EVENT,
  clearBook,
  marksFileParts,
  orbisFileBook,
  rebuildBookFromDevices,
} from '../book-marks-store';
import { getOrCreateDeviceId } from '../device-store';
import { isOwnOrbisWrite } from '../orbis-io';
import type { DebugCategory } from '../settings';

/** How long a burst of writes from the sync tool is left to finish before the book is rebuilt. */
const SETTLE_MS = 300;

interface Registers {
  app: App;
  /** Register an event so it is removed with its owner. */
  registerEvent(ref: EventRef): void;
}

/**
 * Watch every book's device files and `.orbis` for versions another device wrote, and rebuild the book.
 *
 * **Our own writes arrive here too** — every write to the vault is reported, whoever made it. A device file is told
 * apart by its name, which carries the device; a `.orbis` by its content — see `isOwnOrbisWrite`.
 */
export function watchBookFiles(
  plugin: Registers & { debug(msg: string, extra?: unknown, category?: DebugCategory): void }
): void {
  const timers = new Map<string, number>();

  /** Rebuild one book's `.orbis` from its device files, and tell an open view of it. True when the rebuild wrote. */
  const rebuild = async (bookPath: string): Promise<boolean> => {
    const book = plugin.app.vault.getAbstractFileByPath(bookPath);
    if (!(book instanceof TFile)) return false;
    // Logged only when the rebuild wrote: the catch-up at launch passes every book with Orbis data through here, and a
    // line per unchanged book said "changed" about nothing.
    const wrote = await rebuildBookFromDevices(plugin.app, book);
    if (wrote) plugin.debug(`book changed on another device — ${bookPath}, .orbis rebuilt`, undefined, 'annot');
    plugin.app.workspace.trigger(BOOK_CHANGED_EVENT, bookPath);
    return wrote;
  };

  const soon = (bookPath: string): void => {
    const pending = timers.get(bookPath);
    if (pending !== undefined) window.clearTimeout(pending);
    timers.set(
      bookPath,
      window.setTimeout(() => {
        timers.delete(bookPath);
        void rebuild(bookPath);
      }, SETTLE_MS)
    );
  };

  const changed = async (file: TAbstractFile): Promise<void> => {
    if (!plugin.app.workspace.layoutReady) return; // the vault reporting what it already holds: see `catchUp`
    const path = normalizePath(file.path);
    const marks = marksFileParts(path);
    if (marks) {
      if (marks.device !== getOrCreateDeviceId(plugin.app)) soon(marks.bookPath);
      return;
    }
    const bookPath = orbisFileBook(path);
    if (!bookPath) return;
    let text: string;
    try {
      text = await plugin.app.vault.adapter.read(path);
    } catch {
      return;
    }
    if (!isOwnOrbisWrite(path, text)) soon(bookPath);
  };

  /**
   * **A deleted `.orbis` clears its book** — what deleting it always did, and what it has to keep doing now that the
   * marks also live in device files, or they would all come back at the next save. See `clearBook`.
   *
   * Only while the book itself is still there. Deleting or renaming the BOOK takes its `.orbis` with it, and that is
   * not a request to clear anything: those files are being removed or moved, and nothing should be written for them.
   */
  const deleted = async (file: TAbstractFile): Promise<void> => {
    const bookPath = orbisFileBook(normalizePath(file.path));
    if (!bookPath) return;
    const book = plugin.app.vault.getAbstractFileByPath(bookPath);
    if (!(book instanceof TFile)) return;
    await clearBook(plugin.app, book);
    plugin.debug(`.orbis deleted — cleared ${bookPath}`, undefined, 'annot');
    plugin.app.workspace.trigger(BOOK_CHANGED_EVENT, bookPath);
  };

  /**
   * **What arrived while Obsidian was closed**, once the workspace is ready: every book with a `.orbis` or another
   * device's file for marks is rebuilt, one at a time.
   *
   * This was the vault's own doing. While it loads, Obsidian reports every file already in it as created, and each
   * one went through `changed`: every `.orbis` read, every such book rebuilt, all at once. On Android that was still
   * going on when a book reopened at launch read its own files, and the book waited behind it. The iPad showed no
   * such reports, so there a book whose marks arrived while Obsidian was closed was not rebuilt. Now the reports are
   * ignored until the workspace is ready, and this pass does the work once, on every device.
   */
  const catchUp = async (): Promise<void> => {
    const started = performance.now();
    const device = getOrCreateDeviceId(plugin.app);
    const books = new Set<string>();
    for (const file of plugin.app.vault.getFiles()) {
      const path = normalizePath(file.path);
      const marks = marksFileParts(path);
      const bookPath = marks ? (marks.device !== device ? marks.bookPath : null) : orbisFileBook(path);
      if (bookPath) books.add(bookPath);
    }
    let rebuilt = 0;
    for (const bookPath of books) {
      try {
        if (await rebuild(bookPath)) rebuilt++;
      } catch (err) {
        plugin.debug(`catch-up could not rebuild ${bookPath} — ${String(err)}`, undefined, 'annot');
      }
    }
    plugin.debug(
      `catch-up at launch — ${books.size} books with Orbis data, ${rebuilt} rebuilt, in ${Math.round(performance.now() - started)} ms`,
      undefined,
      'annot'
    );
  };

  plugin.registerEvent(plugin.app.vault.on('modify', (file) => void changed(file)));
  plugin.registerEvent(plugin.app.vault.on('create', (file) => void changed(file)));
  plugin.registerEvent(plugin.app.vault.on('delete', (file) => void deleted(file)));
  plugin.app.workspace.onLayoutReady(() => void catchUp());
}

/** What the listener needs of the reader view — which has all of it already. */
export interface BookChangesHost extends Registers {
  /** The open book, or null when none is. */
  readonly currentFile: TFile | null;
}

/**
 * Call `reload` whenever the open book's `.orbis` was written — by a save in this view, another view of the same
 * book, or a rebuild after another device's changes. `reload` compares and redraws only what differs, so the view
 * that just saved does nothing.
 */
export function watchBookChanges(view: BookChangesHost, reload: () => Promise<void>): void {
  // @ts-expect-error -- custom events are not typed in Obsidian's Workspace definition
  const ref: EventRef = view.app.workspace.on(BOOK_CHANGED_EVENT, (bookPath: string) => {
    if (view.currentFile && normalizePath(view.currentFile.path) === normalizePath(bookPath)) void reload();
  });
  view.registerEvent(ref);
}
