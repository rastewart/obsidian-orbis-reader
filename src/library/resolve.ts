// Turning a record's file link into a file. See docs/design/library.md.
//
// **A `#` in a wikilink is a heading reference, and a `#` in a filename is a character.** Obsidian cannot tell
// them apart — `[[epub/Sample Series Book #3.epub]]` reads as a note called `epub/Sample Series Book `
// with a heading of `3.epub`, which is nothing — and generators write those links constantly, because the
// filename really does contain a hash. The link is genuinely broken in Obsidian; the file is genuinely there.
//
// **And a link is often a partial path.** A catalog written by a script says `epub/Book.epub` from a note in
// `Library/Titles/`, meaning `Library/epub/Book.epub` — a path relative to an ancestor of the note, which is
// neither the vault root nor the note's own folder.
//
// So resolution walks the note's ancestors trying the literal text first, and only then hands the question to
// Obsidian's own link rules. That order matters: an exact path hit is unambiguous, while linkpath resolution is a
// search that can land on a different file of the same name somewhere else in the vault.

import { type App, TFile } from 'obsidian';

/**
 * Every path a link could mean, nearest ancestor first.
 *
 * Pure, so the ordering can be pinned by tests: `epub/x.epub` from `Library/Titles/a.md` is
 * `Library/Titles/epub/x.epub`, then `Library/epub/x.epub`, then `epub/x.epub`. Nearest first because a link is
 * written relative to where it was written from.
 */
export function candidatePaths(link: string, fromPath: string): string[] {
  const clean = link.replace(/^\/+/, '').trim();
  if (!clean) return [];
  const parts = fromPath.split('/').slice(0, -1);
  const out: string[] = [];
  for (let i = parts.length; i >= 0; i--) {
    const prefix = parts.slice(0, i).join('/');
    out.push(prefix ? `${prefix}/${clean}` : clean);
  }
  return out;
}

/**
 * The file a record's link points at, or null.
 *
 * `fromPath` is the record note, which is what makes a relative or shortest-form link resolvable at all.
 */
export function resolveRecordFile(app: App, link: string, fromPath: string): TFile | null {
  for (const path of candidatePaths(link, fromPath)) {
    const found = app.vault.getAbstractFileByPath(path);
    if (found instanceof TFile) return found;
  }
  // Only now treat `#` as a heading and let Obsidian search: for a link that named no real path, the fragment is
  // the likelier reading, and a shortest-form link like `[[Sample Book]]` has no path to try at all.
  const withoutHeading = link.split('#')[0].trim();
  if (!withoutHeading) return null;
  return app.metadataCache.getFirstLinkpathDest(withoutHeading, fromPath);
}
