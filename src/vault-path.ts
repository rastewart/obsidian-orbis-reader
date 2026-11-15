// Cutting a vault path into the two halves a dialog asks for, and putting it back together.
//
// **The cut is at the LAST separator.** A book called `Vol. 2 of 3` has one in its name; splitting at the first would
// file it under a folder called `Vol. 2 of 3` and call it `3`. That is the whole reason this is here rather than
// inline: it is two lines of string arithmetic whose failure is silent, on a value the reader typed.
//
// Extracted for the generate-notes dialog, which stores whole paths and now edits them as a folder and a name —
// its own methods are private to a class that cannot be built without Obsidian, so the rules could not be tested
// where they lived.

/** Everything before the last separator, or `/` when the path names something at the vault root. */
export function folderOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at <= 0 ? '/' : path.slice(0, at);
}

/**
 * Everything after the last separator, with `ext` removed if the path ends in it.
 *
 * The extension goes because it is not the reader's to change — a note is `.md` whatever they call it — and a field
 * that shows it invites editing it away. The preview line under the field carries the real path.
 */
export function baseNameOf(path: string, ext = ''): string {
  const withoutExt = ext && path.endsWith(ext) ? path.slice(0, -ext.length) : path;
  return withoutExt.slice(withoutExt.lastIndexOf('/') + 1);
}

/**
 * Folder and name back into one path, with `ext` appended.
 *
 * **An empty name answers with an empty path**, never a bare folder or a stray extension: "no name yet" is a state
 * the dialog has to be able to represent, and `notes/.md` is not it.
 */
export function joinVaultPath(folder: string, name: string, ext = ''): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const prefix = !folder || folder === '/' ? '' : `${folder.replace(/\/$/, '')}/`;
  return `${prefix}${trimmed}${ext}`;
}
