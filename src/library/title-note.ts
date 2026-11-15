// The other direction: from a book file to the note that describes it. See docs/design/library.md.
//
// Everything else in the library reads records and resolves their files. This asks the question backwards — "which
// record claims this book?" — which is what a menu on a book file needs, and what makes the catalog reachable from
// the file explorer rather than only from the Library.
//
// **No index.** The reverse map is rebuilt per call from `metadataCache`, because the callers are gestures: a
// right-click, a command, a pane menu. One pass over the vault's frontmatter is cheaper than keeping a map correct
// through every rename, move and edit — and a stale map here would send someone to the wrong note.

import { type App, TFile } from 'obsidian';
import { vaultCandidates } from './candidates';
import { type LibraryRecord, parseRecord } from './record';
import { resolveRecordFile } from './resolve';

/**
 * The note describing this book, or null.
 *
 * **The first record that claims it wins**, and several can: a title in two formats is one record with two files,
 * but two records can also point at the same file — a translation cataloged twice, or an import that ran twice.
 * There is no way to rank those from here, and offering a chooser for a case nobody has hit would be a dialog in
 * front of a gesture that should just work.
 */
export function titleNoteFor(app: App, bookPath: string): TFile | null {
  for (const note of vaultCandidates(app)) {
    const record = parseRecord(note.path, note.frontmatter);
    if (!record || record.files.length === 0) continue;
    if (!claims(app, record, bookPath)) continue;
    const found = app.vault.getAbstractFileByPath(note.path);
    if (found instanceof TFile) return found;
  }
  return null;
}

/** Whether any of the record's file links resolve to this exact path. */
function claims(app: App, record: LibraryRecord, bookPath: string): boolean {
  return record.files.some((link) => resolveRecordFile(app, link, record.notePath)?.path === bookPath);
}

/**
 * The folders this vault's title notes are in, one entry per note.
 *
 * Feeds the choice of where a note or a configuration file is created when no records folder is set: beside the
 * notes rather than in the vault root, and derived rather than asked about, because the answer is already visible in
 * the vault.
 */
export function titleNoteFolders(app: App): string[] {
  return vaultCandidates(app)
    .filter((note) => parseRecord(note.path, note.frontmatter) !== null)
    .map((note) => note.path.split('/').slice(0, -1).join('/'));
}
