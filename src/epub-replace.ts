// Whether replacing a book made from notes can move what has been saved in it — and, when it can, what to say.
//
// See docs/design/markdown-to-epub.md §Replacing a book.

import { type App, TFile } from 'obsidian';
import { compareEpubs, type EpubChange } from './epub-builder';
import { t } from './i18n';
import { type BuiltEpub, hasSavedContentFor } from './markdown-epub';
import { logToLibrary } from './reader/DebugLog';

/** What is at a built book's path now, compared with it — and whether anything saved there could move. */
export interface ReplaceCheck {
  change: 'new' | EpubChange;
  /** Only ever true for a changed text: a book whose text is unchanged cannot move a saved position. */
  annotated: boolean;
}

export async function checkReplace(app: App, epub: BuiltEpub): Promise<ReplaceCheck> {
  const existing = app.vault.getAbstractFileByPath(epub.path);
  if (!existing) return { change: 'new', annotated: false };
  // A folder at the path is not a book this could read; the write will say what went wrong.
  const { change, differs } =
    existing instanceof TFile
      ? compareEpubs(new Uint8Array(await app.vault.readBinary(existing)), epub.bytes)
      : { change: 'text-changed' as const, differs: '(a folder is at this path)' };
  // Named, so a book that should have been found identical says which of its files was not.
  logToLibrary({ app }, `replace ${epub.path}: ${change}${differs ? ` — first difference: ${differs}` : ''}`, 'export');
  return { change, annotated: change === 'text-changed' && (await hasSavedContentFor(app, epub.path)) };
}

/**
 * The one question before replacing a set's books, or null when there is nothing to ask.
 *
 * **Only a book whose text changed and that has something saved in it is asked about.** The set's folder is
 * Orbis's own output, so replacing a book there is what the command is for; the one thing worth stopping for is a
 * saved position that may now point at the wrong words. It names the cause, so the warning reads as a consequence of
 * a change rather than as something the reader did wrong.
 */
export function setReplaceMessage(checks: readonly ReplaceCheck[]): string | null {
  const n = checks.filter((c) => c.annotated).length;
  if (!n) return null;
  return n === 1
    ? t('epub_overwrite.set_source_changed_one')
    : t('epub_overwrite.set_source_changed', { n: String(n) });
}

/** What the set's notice says: how many were written, and that the rest needed nothing. */
export function setSavedNotice(written: number, total: number, folder: string): string {
  if (!written) return t('notices.epub_set_up_to_date', { folder });
  if (written < total) return t('notices.epub_set_saved_changed', { n: String(written), total: String(total), folder });
  return t(written === 1 ? 'notices.epub_set_saved_one' : 'notices.epub_set_saved', { n: String(written), folder });
}
