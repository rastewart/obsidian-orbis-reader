// The vault side of `titleNoteKeepReason`: find the record for a book that has just been deleted, and act on it.
//
// Split from the rule itself so the decision can be tested without a vault — see title-note-cleanup.ts for why a
// note is kept or removed.
//
// **This cannot reuse `recordForFile`.** That lookup resolves each record's links to a real file, which is the
// right test while the book is there and useless the moment it is not: at delete time the file is gone from the
// vault, every record resolves to nothing, and the answer is always "this book had no record". Matching here is
// textual — see `linkNamesFile`.

import { type App, TFile } from 'obsidian';
import { vaultCandidates } from './candidates';
import { linkTarget, parseRecord, toStringList } from './record';
import { resolveRecordFile } from './resolve';
import { linkNamesFile, type TitleNoteKeepReason, titleNoteKeepReason } from './title-note-cleanup';

/** What became of the title note. */
export interface TitleNoteOutcome {
  /** `none` when the book had no record — the common case, and worth saying so in the log. */
  status: 'trashed' | 'kept' | 'none' | 'ambiguous';
  path?: string;
  kept?: TitleNoteKeepReason;
  /** The extracted cover that went with the note, when nothing else was using it. */
  coverTrashed?: string;
  /** Rows taken out of a KEPT record's `files` because the book they named is gone. */
  filesTrimmed?: number;
  /** For `ambiguous`: every record that names this book. */
  paths?: string[];
}

/** The note's own text — everything below the frontmatter, which is what `wrote` is about. */
function bodyBelowFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

/**
 * Handle the title note of a book that has just been deleted.
 *
 * **Trashed, never removed outright.** The sidecars bypass the trash because they are internal data the reader
 * never sees; a title note is a note in their vault, so it goes where a deleted note goes and can be brought
 * back. This is the one asymmetry between the two halves of the cleanup, and it is deliberate.
 *
 * **Two records naming one book is a refusal, not a coin toss.** It means the vault has two files of that name
 * and the link was ambiguous, so deleting either note could be the wrong one. Reported and left alone.
 */
export async function removeTitleNoteFor(
  app: App,
  bookPath: string,
  opts: { coversFolder: string }
): Promise<TitleNoteOutcome> {
  const matches: Array<{ note: TFile; cover: string | null; otherFiles: string[] }> = [];
  const exists = (path: string) => app.vault.getFileByPath(path) !== null;
  for (const candidate of vaultCandidates(app)) {
    const record = parseRecord(candidate.path, candidate.frontmatter);
    if (!record) continue;
    const links = record.files.map((link) => ({ link, names: linkNamesFile(link, bookPath, candidate.path, exists) }));
    if (!links.some((entry) => entry.names)) continue;
    const note = app.vault.getAbstractFileByPath(candidate.path);
    if (!(note instanceof TFile)) continue;
    // Everything this record still lists — computed with the same rule, so the file that just left is not
    // mistaken for a second edition and used as a reason to keep the note.
    matches.push({
      note,
      cover: record.cover,
      otherFiles: links.filter((entry) => !entry.names).map((entry) => entry.link),
    });
  }
  if (matches.length === 0) return { status: 'none' };
  if (matches.length > 1) return { status: 'ambiguous', paths: matches.map((m) => m.note.path) };

  const { note, cover, otherFiles } = matches[0];
  const kept = titleNoteKeepReason({
    body: bodyBelowFrontmatter(await app.vault.read(note)),
    frontmatter: app.metadataCache.getFileCache(note)?.frontmatter,
    resolvedLinks: app.metadataCache.resolvedLinks,
    path: note.path,
    otherFiles,
  });
  if (kept) {
    // **The record keeps the title, not the claim.** `files` is machine-read — Read and Listen are computed from
    // it, and so is this cleanup — so a row pointing at a file that is gone is a claim the record cannot back up.
    // Worse, it is a claim that can come true wrongly: a different book of that name added later would satisfy
    // the same link through the name fallback. History is not what this field is for.
    const trimmed = await stripDeletedFile(app, note, bookPath);
    return { status: 'kept', path: note.path, kept, filesTrimmed: trimmed };
  }
  const coverTrashed = await trashCoverIfUnused(app, cover, note, opts.coversFolder);
  await app.fileManager.trashFile(note);
  return { status: 'trashed', path: note.path, coverTrashed };
}

/** Take the deleted book out of a kept record's `files`, and say how many rows went. */
async function stripDeletedFile(app: App, note: TFile, bookPath: string): Promise<number> {
  let removed = 0;
  await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
    const files = toStringList(fm.files);
    const exists = (path: string) => app.vault.getFileByPath(path) !== null;
    const left = files.filter((link) => !linkNamesFile(linkTarget(link), bookPath, note.path, exists));
    removed = files.length - left.length;
    if (removed > 0) fm.files = left;
  });
  return removed;
}

/**
 * The cover extracted for this book, when nothing else wants it.
 *
 * **Only a cover Orbis made.** Guarded on the covers folder, because `cover:` can point anywhere: an image the
 * reader chose lives in their attachments and is theirs, and deleting a book must not touch it. Inside the covers
 * folder the file exists only because cataloging put it there.
 *
 * **Canvases are scanned directly rather than trusted to the metadata cache.** `resolvedLinks` is documented as
 * "all resolved links" without saying what a source file can be, and the cache it belongs to is a Markdown cache
 * — so whether a canvas embedding an image registers there is undocumented and version-dependent. Reading the
 * canvas files is a few JSON parses on the one occasion a cover is about to go, and it turns an assumption about
 * Obsidian's internals into a fact about the vault.
 *
 * Trashed, like the note: an image is a file the reader can want back.
 */
async function trashCoverIfUnused(
  app: App,
  cover: string | null,
  note: TFile,
  coversFolder: string
): Promise<string | undefined> {
  if (!cover) return undefined;
  const file = resolveRecordFile(app, cover, note.path);
  if (!file) return undefined;
  const folder = coversFolder.replace(/^\/+|\/+$/g, '');
  if (!folder || !file.path.startsWith(`${folder}/`)) return undefined;
  for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
    if (source !== note.path && targets[file.path]) return undefined;
  }
  for (const canvas of app.vault.getFiles().filter((f) => f.extension === 'canvas')) {
    try {
      if ((await app.vault.cachedRead(canvas)).includes(file.path)) return undefined;
    } catch {
      // An unreadable canvas is a reason to keep the image, not to press on: the cost of keeping a cover nobody
      // wants is a file in a folder, and the cost of the other mistake is a picture that is gone.
      return undefined;
    }
  }
  await app.fileManager.trashFile(file);
  return file.path;
}
