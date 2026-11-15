// How a book's sidecar files are named — the one derivation every writer and reader of them uses.
//
// Pure, no vault and no Obsidian import, so the Library's book-state scan (which reads thousands of paths) and the
// tests can use it as directly as `progress.ts` does.

/**
 * The name every sidecar of a book is built on: its whole file name, extension included.
 *
 * **The extension is part of it.** `book.epub` and `book.azw3` in one folder are two files with two sets of
 * positions, and a position in one means nothing in the other — a CFI into an EPUB's XHTML does not address a KF8
 * section. Named from the basename alone, both formats would share one `book.orbis`, one location, one page cache
 * and one audio folder, so reading either would move the other's place and show the other's highlights.
 *
 * One derivation for every writer and every reader: the `.orbis` file, the device locations, the page cache, the
 * origin record, the audio folder, the delete and rename handlers, and the Library's book state.
 */
export function sidecarStem(bookPath: string): string {
  return bookPath.split('/').pop() ?? '';
}

/**
 * The name of a book's recordings folder: its stem and `.audio` — `long-chapter.epub.audio`.
 *
 * **Never the bare stem.** The audio folder is the one sidecar that is a folder, and a folder named `….epub` is an
 * EPUB to macOS — Apple Books keeps EPUBs unpacked as folders — so Finder showed every book's recordings as a 2 MB
 * "EPUB" that double-clicking handed to Books, with the MP3s reachable only through *Show Package Contents*. `.audio`
 * is claimed by nothing, and keeps the whole file name in front of it so each format still has a folder of its own.
 */
export function audioFolderName(bookPath: string): string {
  return `${sidecarStem(bookPath)}.audio`;
}

/**
 * The vault path of the book an `.orbis` file belongs to: the folder above its data folder, and its own name less
 * `.orbis` — which, the stem being the whole file name, already IS the book's file name.
 *
 * **The inverse of `sidecarStem`, so it lives beside it.** The `.orbis` view kept its own copy that still added an
 * extension, from before the stem carried one: it looked for `book.epub.epub`, found nothing, and the page silently
 * lost everything that needs the book — the Reading activity table, the contents read from the book, the links.
 */
export function bookPathForOrbisFile(orbisPath: string): string | null {
  const parts = orbisPath.split('/');
  const name = parts.pop() ?? '';
  if (!name.endsWith('.orbis') || parts.length === 0) return null;
  parts.pop(); // the data folder the `.orbis` file sits in
  return [...parts, name.slice(0, -'.orbis'.length)].join('/');
}

/** What follows a book's stem in each of its sidecar files. The audio folder is the one sidecar that is a folder. */
const SIDECAR_SUFFIX = /^(\.orbis|\.pages\.json|\.origin\.json|\.location\.[a-z0-9]+\.json|\.marks\.[a-z0-9]+\.json)$/;

/**
 * The suffix of `fileName` if it is one of the sidecar files of the book whose stem is `stem`, else null.
 *
 * **An exact match, not a prefix.** Taking every file starting with `basename + '.'` would also take the sidecars of
 * a different book whose name merely begins that way — deleting `My.epub` would remove `My.Book.orbis`.
 */
export function sidecarSuffix(stem: string, fileName: string): string | null {
  if (!fileName.startsWith(stem)) return null;
  const rest = fileName.slice(stem.length);
  return SIDECAR_SUFFIX.test(rest) ? rest : null;
}
