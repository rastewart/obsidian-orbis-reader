// Every path one book's records touch, for either layout. Pure path arithmetic, so both layouts can be
// pinned by tests rather than by opening a vault and looking.
//
// There are two layouts and three ways to choose one:
//
// **A root** (`global`, and `custom`) holds many books. Bases at the top level are the interface; `content/`
// is data you never browse:
//
// ```text
// Reading records/                 ← the reader names this
//   !Reading records.base          ← every book, filtered by tag alone
//   First-Open.base                ← this book
//   content/
//     First-Open/selection — … .md
// ```
//
// **Beside the book** (`book`) holds exactly one, and is the same shape scoped to n=1 — which is the point:
// the book, its `.orbis` sidecar and its records are then one folder to archive and one folder to restore.
//
// ```text
// Books/Fiction/Sample.epub
// Books/Fiction/!orbis-data/Sample.epub.orbis
// Books/Fiction/Sample-reading-records/
//   Sample.base
//   content/selection — … .md
// ```
//
// One difference from the root layout: **no per-book subfolder under `content/`**, because there is one book and
// so nothing to disambiguate.
//
// **Neither layout holds a cover.** A record's `cover` is the image its title note points at, so the library and the
// records show the same file instead of two copies under different names. See `RecordExporter.libraryCover`.
//
// And one thing that is NOT different: `recordBookName`'s shortest-unique-suffix disambiguation is only needed
// in a root, where two books' folders sit side by side. Two books in one vault folder cannot share a basename,
// so the book-local folder is named from the plain basename.

import { normalizePath } from 'obsidian';
import type { RecordLocation } from '../record-config';
import { DEFAULT_RECORDS_FOLDER } from '../settings';

/** Suffix for a book-local records folder. Spelled out rather than abbreviated: it sits in the reader's own
 *  book folder, next to their books, and has to say what it is without being opened. */
export const BOOK_RECORDS_SUFFIX = '-reading-records';

export interface RecordPaths {
  /** Folder holding the record notes. */
  records: string;
  /** This book's own base. */
  bookBase: string;
  /**
   * The folder that belongs to this book alone — `<book>-reading-records` — or null in a root layout, where the
   * root and its `content/` are shared with other books (the book's own `content/<book>/` is `records`).
   *
   * Exists so "clean up what we vacated" can be precise rather than careful: after a move, the book-local folder
   * is ours to trash when empty, and a root's folders never are. Deciding that from the base's parent would mean
   * reasoning about whether the shared root happens to be empty, and being wrong there deletes the reader's
   * records folder.
   */
  bookFolder: string | null;
  /**
   * The every-book base, which lives in the GLOBAL root whatever this book's location is — it filters on the
   * record tag alone, so one copy already finds records anywhere in the vault and a second would just be a
   * duplicate view of the same rows.
   *
   * Null when no global root is configured, which is a real state once a book can choose to keep its records
   * beside itself: that reader never had to name a shared folder.
   */
  globalBase: string | null;
}

/** Trailing slash off, and `/` (the vault root, as Obsidian writes it) to the empty prefix. */
function cleanRoot(root: string): string {
  const trimmed = root.trim();
  if (trimmed === '/' || !trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/** `a/b` — or just `b` when the parent is the vault root, since `/b` is not how Obsidian spells a path. */
const join = (parent: string, child: string): string => normalizePath(parent ? `${parent}/${child}` : child);

export interface RecordPathInput {
  location: RecordLocation;
  /** The book file's vault path — its folder is where a `book`-mode records folder goes. */
  bookPath: string;
  /** The book's disambiguated name (`recordBookName`), used in a root layout. */
  bookName: string;
  /** The book's name within its folder (`recordStem`), used in a book-local layout: the file name without its
   *  extension, with the format added when another format of the same name sits beside it. */
  bookStem: string;
  /** `recordsFolder` from settings. May be empty: only a `global` book actually needs it. */
  globalRoot: string;
  /** Where the base covering every book goes — `allBooksBaseRoot()`. Null when it is not written at all. */
  allBooksRoot: string | null;
}

/**
 * Where one book's records and base go.
 *
 * A `custom` location is laid out exactly like the global root rather than like a book-local folder,
 * deliberately: it is a *root*, so several books can point at one. Treating it as book-local would let two
 * books share a single `content/`, where each export's orphan pass would flag the other's records as deleted
 * and the cleanup action would offer to remove them — silent and destructive, from a path setting.
 */
export function recordPaths({
  location,
  bookPath,
  bookName,
  bookStem,
  globalRoot,
  allBooksRoot,
}: RecordPathInput): RecordPaths {
  const global = cleanRoot(globalRoot);
  // Its own root, which is usually the shared folder but need not be — and null when the reader has
  // declined it. Tested on the RAW value, not the cleaned one: `/` is how Obsidian spells the vault root, so
  // testing the cleaned value would read a deliberate choice as unset.
  const globalBase =
    allBooksRoot !== null && allBooksRoot.trim()
      ? join(cleanRoot(allBooksRoot), `!${DEFAULT_RECORDS_FOLDER}.base`)
      : null;

  if (location.mode === 'book') {
    const cut = bookPath.lastIndexOf('/');
    const dir = cut < 0 ? '' : bookPath.slice(0, cut);
    const root = join(dir, `${bookStem}${BOOK_RECORDS_SUFFIX}`);
    return {
      records: join(root, 'content'),
      bookBase: join(root, `${bookStem}.base`),
      bookFolder: root,
      globalBase,
    };
  }

  const root = location.mode === 'custom' ? cleanRoot(location.path) : global;
  const content = join(root, 'content');
  return {
    records: join(content, bookName),
    bookBase: join(root, `${bookName}.base`),
    // A root is shared; only `records`, this book's subfolder of it, is the book's own — see the field's own comment.
    bookFolder: null,
    globalBase,
  };
}

/**
 * Whether this location can be written to at all.
 *
 * Only a `global` book needs the shared folder to have been named — that setting starts empty on purpose, and a
 * book keeping its records beside itself must not be blocked by a folder it never uses.
 *
 * `/` counts as named. It is how Obsidian spells the vault root in a folder dropdown, so a reader who picked it
 * has chosen, and refusing would be refusing their answer.
 */
/**
 * Where the base covering every book goes, or null when it is not written at all.
 *
 * One folder, and **empty means declined** — the aggregate view is optional, since every book still gets its own
 * base. Named rather than inlined because that convention is worth stating once and testing: an empty string here
 * is an answer, not a missing value.
 */
export function allBooksBaseRoot(baseFolder: string): string | null {
  return baseFolder.trim() ? baseFolder : null;
}

export function recordLocationReady(location: RecordLocation, globalRoot: string): boolean {
  if (location.mode === 'global') return !!globalRoot.trim();
  if (location.mode === 'custom') return !!location.path.trim();
  return true;
}
