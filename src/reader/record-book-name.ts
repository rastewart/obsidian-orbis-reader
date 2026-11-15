// A stable, readable, collision-free name for one book's records: pure logic, no vault access.
//
// See docs/design/reading-records.md §Two books with the same filename.

import { sanitizeName } from '../book-extractor';

/** Matches the separator in a record's own filename (`kind — excerpt — shortid`), so a qualified book name
 *  reads as part of the same scheme rather than as a second convention. */
const SEP = ' — ';

const withoutExtension = (path: string) => path.replace(/\.[^./]+$/, '');

/** How many books share each path-without-extension: more than one means formats of one book in one folder. */
function twinCounts(allBookPaths: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of allBookPaths) counts.set(withoutExtension(p), (counts.get(withoutExtension(p)) ?? 0) + 1);
  return counts;
}

function stemOf(bookPath: string, twins: ReadonlyMap<string, number>): string {
  const name = bookPath.split('/').pop() ?? '';
  const stem = withoutExtension(name);
  if ((twins.get(withoutExtension(bookPath)) ?? 0) < 2) return stem;
  return `${stem} (${name.slice(stem.length + 1).toUpperCase()})`;
}

/**
 * The name a book's records are filed under within its folder: the file name without its extension, and the format
 * in brackets when another format of the same name sits beside it.
 *
 * ```text
 * sample.epub  (alone)            →  sample
 * sample.epub  +  sample.azw3    →  sample (EPUB)   /   sample (AZW3)
 * ```
 *
 * **Each format keeps its own records.** A record mirrors an annotation, and an annotation lives in its format's own
 * `.orbis` at a position that only means something in that format (see `sidecarStem`). One records folder for both
 * let each format's export flag the other's records as orphaned. The format is added only when it is needed, the
 * same way `recordBookName` adds folders only when they are: a book in one format keeps the plain name, and adding a
 * second format later renames the first one's folder — a move, not a loss.
 *
 * `allBookPaths` should be every book in the vault, including `bookPath` itself.
 */
export function recordStem(bookPath: string, allBookPaths: readonly string[]): string {
  return stemOf(bookPath, twinCounts(allBookPaths));
}

/** `Library/Fiction/sample.epub` → `['Library', 'Fiction', 'sample']` — the last segment is `recordStem`'s. */
function segmentsOf(path: string, twins: ReadonlyMap<string, number>): string[] {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return [...parts, stemOf(path, twins)];
}

const endsWith = (segments: readonly string[], suffix: readonly string[]): boolean =>
  segments.length >= suffix.length && suffix.every((s, i) => segments[segments.length - suffix.length + i] === s);

/**
 * The folder and base name for a book's records: its filename when that is unambiguous, otherwise the fewest
 * parent folders needed to tell it apart.
 *
 * ```text
 * Library/sample.epub  (alone)                       →  sample
 * Library/Fiction/sample.epub  +  Inbox/sample.epub →  Fiction — sample   /   Inbox — sample
 * ```
 *
 * **A basename alone is not unique, which an earlier draft of this design got wrong.** The argument was that
 * two files cannot share a name in one folder — true, and irrelevant across a vault. Two `sample.epub` in
 * different folders both wanted `content/sample/` and `sample.base`; the records would have interleaved in one
 * folder (no data lost — `orbis_id` keeps them distinct) and the second book would have got no base at all,
 * because a base is never overwritten.
 *
 * Why the shortest unique suffix rather than always slugifying the full path — which is what `noteSetSlug` does
 * for the per-chapter MOC, and would have been the boring safe answer:
 *
 * - The root folder **is** this feature's interface, so `Library-Fiction-sample.base` charges every reader for
 *   a problem most vaults never have.
 * - It is **deterministic and order-independent**: the name follows from the vault, not from which book was
 *   exported first, so two devices agree without coordinating.
 * - It is **symmetric** — when two books collide, both get qualified. Privileging whichever was seen first
 *   would make the name depend on history.
 *
 * The cost is that the name follows vault state, so adding a second `sample.epub` later renames the first
 * book's folder. That is a folder move, not data loss: a record's identity is `orbis_id`, and `book` is a link
 * Obsidian maintains. It wants the same reconcile action as [renaming a book](reading-records.md#open-questions),
 * which is the other way these names go stale.
 *
 * **Unique as written, not as named.** Each segment is compared as it will be written — sanitized, cut to 80
 * characters, and without regard to case, since the Mac's and Windows' file systems ignore it. Compared raw,
 * `Book: One` and `Book? One`, or two long titles alike for their first 80 characters, were two names that wrote one
 * folder, and each book's export flagged the other's records as orphaned.
 *
 * `allBookPaths` should be every book in the vault, including `bookPath` itself. A book whose whole path is written
 * the same as another's gets a short code from its own path on the end.
 */
export function recordBookName(bookPath: string, allBookPaths: readonly string[]): string {
  const twins = twinCounts(allBookPaths);
  const written = (p: string) => segmentsOf(p, twins).map((s) => sanitizeName(s));
  const segments = written(bookPath);
  const key = (s: readonly string[]) => s.map((x) => x.toLowerCase());
  const others = allBookPaths.filter((p) => p !== bookPath).map((p) => key(written(p)));
  for (let k = 1; k <= segments.length; k++) {
    const suffix = segments.slice(-k);
    if (!others.some((o) => endsWith(o, key(suffix)))) return suffix.join(SEP);
  }
  // Every suffix is shared, so the whole path; and if another book's whole path is written the same, only the raw
  // path tells them apart.
  const whole = key(segments).join('/');
  if (!others.some((o) => o.join('/') === whole)) return segments.join(SEP);
  return `${segments.join(SEP)}${SEP}${pathCode(bookPath)}`;
}

/** Six hex digits from a path (FNV-1a): the same path always gives the same code, on every device. */
function pathCode(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}
