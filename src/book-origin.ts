// Which note a book was made from, whether that note has changed since, and what to do about it.
//
// The lookup layer of *Read in Orbis Reader* — see docs/design/read-in-orbis-reader.md. Everything here is about
// answering one question on every invocation: **is there already a book for this note, and is it still the note?**
//
// **Derive by convention, confirm by the origin file.** The convention is the naming scheme below: a book sits
// beside its note and takes its name, and a second version takes a date. That narrows a folder listing to a few
// candidates; the origin file then decides, so an unrelated EPUB that merely shares the name is never mistaken
// for ours. One folder listing either way, and a wrong answer is impossible rather than unlikely.
//
// **Split pure from I/O on purpose.** `resolveNoteBooks` is the whole decision and touches no vault, because it
// is the layer a bug would live in and the only layer a test can reach — the alternative is proving a branch by
// converting a note and looking at what opened.

import type { App, TFile } from 'obsidian';
import { normalizePath } from 'obsidian';
import { stripFrontmatter } from './markdown-epub';
import { ensureDataFolderAt } from './orbis-io';
import { progressFolderPathFor } from './progress';
import { sha256Hex } from './reader/tts/asset-integrity';
import { sidecarStem } from './sidecar-names';

/**
 * Who wrote an origin file.
 *
 * A book carries one `<book>.origin.json`, so a later feature that also wants to record provenance would collide
 * on the filename. This is how a reader of the file knows the contents are ours to trust rather than something
 * else's with the same shape.
 */
export const ORIGIN_FEATURE = 'read-in-orbis-reader';

/**
 * What the origin file holds.
 *
 * **Not the `.orbis` file.** That one is written by the READER, so a book created and
 * never opened does not have one. Provenance has to exist from the moment the book is written, which is before
 * anyone has seen it.
 *
 * **Not named `source`** — a *source* in this product is where books come from, OPDS and its kin, and giving one
 * word two meanings in one vault is how a vocabulary stops being teachable.
 */
export interface BookOrigin {
  /** The note's vault path, as it was when the book was made. */
  note: string;
  /** `noteBodyHash` of that note at creation — see it for what is and is not hashed. */
  hash: string;
  /** When, ISO. Orders the versions; `resolveNoteBooks` opens the newest match. */
  created: string;
  /** Always `ORIGIN_FEATURE` in a file we wrote. */
  feature: string;
}

/** `<note folder>/!orbis-data/<book>.origin.json` — beside the annotations, the position and the audio. */
export function originFilePathFor(bookPath: string): string {
  return `${progressFolderPathFor(bookPath)}/${sidecarStem(bookPath)}.origin.json`;
}

/**
 * The identity of a note's content, for "has this changed?".
 *
 * **The body below the frontmatter, trimmed** — not the file, and not its modification time.
 *
 * - **Not the file.** A clipper that stamps `last-modified`, or Obsidian adding a property, would announce a
 *   change nobody would notice. A prompt that cries wolf is worse than no prompt.
 * - **Not mtime.** In a vault synced across devices, mtime is the first casualty.
 * - **Trimmed**, because trailing newlines are added and removed by everything that touches a Markdown file.
 *
 * Hashing the CONVERSION INPUT rather than the file also makes the answer the same on every device, which matters
 * because the book may have been made on one and opened on another. `stripFrontmatter` is the converter's own
 * function for the same reason: if the two ever disagreed about where the body starts, a note would look changed
 * on the device that converted it.
 */
export async function noteBodyHash(source: string): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(stripFrontmatter(source).trim()).buffer);
}

/**
 * How much of the note's name a book keeps.
 *
 * **Two limits, in two different units, because two different things are being protected.**
 *
 * `NAME_MAX_BYTES` is the filesystem's: a filename component may be 255 bytes on every platform Orbis runs on,
 * and the longest thing derived from a book's name is its per-device location sidecar,
 * `<base>.location.<12-char device id>.json` — 27 more. 228 is the ceiling; 200 leaves room.
 *
 * **Counting characters alone is the wrong unit, not merely a small number.** An en dash, a curly apostrophe and
 * every CJK character are three bytes each, so eighty characters of those is 240 — already over the ceiling with
 * the sidecar added. The byte cap is what makes a non-Latin name safe, and the risk is not theoretical: en dashes
 * are common in note names.
 *
 * `NAME_MAX_CHARS` is Windows': `MAX_PATH` is 260 for the WHOLE path, counted in characters. A vault shared
 * between a Mac and a Windows machine is one person with two computers, not a hypothetical user, and a name one
 * of them writes has to be a path the other can open.
 *
 * **80 rather than something longer, and it does not fully solve Windows.** Reading records in `book` mode puts
 * the base into one path twice — `<base>-reading-records/<base>.base` — so a deep folder exceeds `MAX_PATH` at 80
 * and would at any length worth having. That is true of every book in Orbis and not something this feature can
 * fix by naming its own files more shyly; it wants its own look. 80 is chosen because it is the number the rest
 * of Orbis already uses, so this is not a special case to remember, and because it is safe in a
 * shallow-to-moderate folder with records switched on.
 */
const NAME_MAX_BYTES = 200;
const NAME_MAX_CHARS = 80;

/**
 * What a VERSIONED name's head gets, and only a versioned name.
 *
 * ` - v002` is seven of each unit that would otherwise push a name at the ceiling past it, landing version two
 * somewhere unintended. **Reserving them on the plain name too would be wrong**: it would shorten every book to
 * make room for a version most notes never get. Only the versioned head pays, which is why `isBookNameForNote`
 * matches two patterns rather than one.
 */
const VERSION_SUFFIX = ' - v002'.length;
const FULL: Limits = { chars: NAME_MAX_CHARS, bytes: NAME_MAX_BYTES };
const VERSIONED_HEAD: Limits = { chars: NAME_MAX_CHARS - VERSION_SUFFIX, bytes: NAME_MAX_BYTES - VERSION_SUFFIX };

interface Limits {
  chars: number;
  bytes: number;
}

const utf8 = (s: string): number => new TextEncoder().encode(s).length;

/**
 * Cut to fit BOTH limits, never mid-character, and never leaving a trailing space.
 *
 * Counted by code point rather than by `slice`, because a string index is a UTF-16 unit: slicing between the
 * halves of an emoji's surrogate pair produces a lone surrogate, which is not a character and not a filename.
 * That also makes "characters" mean what a person means by it — one emoji is one, not two.
 */
function cut(name: string, limits: Limits): string {
  const chars = [...name];
  if (chars.length <= limits.chars && utf8(name) <= limits.bytes) return name;
  let out = '';
  let bytes = 0;
  let count = 0;
  for (const ch of chars) {
    const size = utf8(ch);
    if (count + 1 > limits.chars || bytes + size > limits.bytes) break;
    out += ch;
    bytes += size;
    count += 1;
  }
  return out.trim();
}

/**
 * Characters no filesystem will take, and the leading-dot rule.
 *
 * **Deliberately NOT `sanitizeName`, and this is the interesting difference.** That function turns a book's own
 * WORDS into a vault name — an EPUB title, arriving with arbitrary whitespace and line breaks in it — so
 * collapsing runs of space is right for its input. This input is not words: it is a note's filename, which
 * Obsidian has already guaranteed to be a legal name. Mirroring it is the whole job, and `Part  One` deserves a
 * book called `Part  One`.
 *
 * What is left is what a filesystem genuinely refuses, plus the leading dot — `.` and `..` are directions rather
 * than names, and a leading dot hides the file on every Unix-alike. Unreachable by renaming a note in Obsidian,
 * which blocks these itself, but a note path can arrive from sync, another platform, or a plugin writing files
 * directly.
 */
function legalFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/^[\s.]+/, '')
    .trimEnd();
}

/**
 * The head of every book name this note produces.
 *
 * **Derived once and handed to both halves.** The lookup narrows a folder listing by name and the converter
 * writes by name; if those two ever disagreed about what a note is called, an annotated book would be silently
 * overwritten by a lookup that could not find it.
 */
export function bookBaseForNote(noteBasename: string): string {
  return cut(legalFileName(noteBasename), FULL) || 'book';
}

/**
 * The name a book made from this note takes, from the base `bookBaseForNote` derived.
 *
 * The first is the note's name, unadorned: `Sample Book review.epub`. A second version — which only exists because
 * someone asked for one at the prompt — is `Sample Book review - v002.epub`.
 *
 * **Numbered rather than dated, and starting at v002.** A date has to be read as an argument: with
 * `Sample Book review.epub` beside `Sample Book review (2026-09-21).epub`, nothing says which came first unless you
 * already know that the undated one is the older. A number says it outright — and starting the numbering at
 * **two** is what makes it true, because the plain name is version one. A second file called `v001` would be a
 * "version 1" that is not the first, which is worse than the ambiguity numbering exists to fix.
 *
 * **Zero-padded to three digits** so they sort the way they read: `v010` after `v009`, not between `v001` and
 * `v002` — the same device note names like `006 - PART I – CHAPTER I` use, for the same reason.
 *
 * **And the date is not lost.** It is in the origin file, which is where the dialog reads it from — a filename is
 * a name, and `created` is a fact about the book.
 *
 * Paired with `isBookNameForNote` below, which has to recognise everything this can produce — see the test that
 * holds them together.
 */
export function bookNameForNote(base: string, version = 1): string {
  if (version <= 1) return `${base}.epub`;
  return `${cut(base, VERSIONED_HEAD)} - v${String(version).padStart(3, '0')}.epub`;
}

/** Everything `bookNameForNote` can produce from this base, and nothing else. **Two anchored patterns, not one
 *  loose one**: a long name's plain and versioned forms have different heads, and matching a prefix instead would
 *  claim another note's book — which the origin file would reject, but a listing that hands back half the folder
 *  makes every later step read like a coincidence. Below the cap the two heads are identical and this is one
 *  pattern written twice. */
export function isBookNameForNote(base: string, fileName: string): boolean {
  const literal = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plain = new RegExp(`^${literal(base)}\\.epub$`);
  const versioned = new RegExp(`^${literal(cut(base, VERSIONED_HEAD))} - v(\\d{3,})\\.epub$`);
  return plain.test(fileName) || versioned.test(fileName);
}

/** The version a book name carries: 1 for the plain name, N for `- vNNN`, or null when the name is not this
 *  note's at all. The reader of the convention that `nextBookPath` counts with. */
export function versionOfBookName(base: string, fileName: string): number | null {
  if (!isBookNameForNote(base, fileName)) return null;
  const n = fileName.match(/ - v(\d{3,})\.epub$/);
  return n ? Number.parseInt(n[1], 10) : 1;
}

/**
 * Where to write a new book for this note: the plain name if it is free, otherwise the next version number.
 *
 * **One past the highest that exists, not the lowest that is free.** Deleting `v002` and then making another
 * version would otherwise hand that name back out, and a number meaning two different readings at two different
 * times is the thing numbering exists to prevent. Monotonic instead: a version number, once used, is spent.
 *
 * **`taken` is every path already in the folder, not just ours.** What remains after putting the book beside its
 * note is a file of that name that simply is not ours — something the reader made, or an earlier export — and
 * never clobbering it is answered the same way a second version is, by taking the next number instead. The
 * origin file is what tells the two apart, so this only has to be handed a listing.
 */
export function nextBookPath(folder: string, base: string, taken: ReadonlySet<string>): string {
  const dir = folder && folder !== '/' ? `${folder}/` : '';
  const at = (name: string): string => `${dir}${name}`;
  const plain = at(bookNameForNote(base));
  if (!taken.has(plain)) return plain;

  let highest = 1; // the plain name is version one, and it is there
  for (const path of taken) {
    if (path.slice(0, dir.length) !== dir || path.slice(dir.length).includes('/')) continue;
    const version = versionOfBookName(base, path.slice(dir.length));
    if (version !== null && version > highest) highest = version;
  }
  /**
   * A name taken by a stranger is answered the same way, so the loop is a guard rather than an expectation:
   * `highest + 1` is free unless somebody else's file is sitting on it. Bounded, because an unbounded loop over
   * a set that cannot shrink is a hang rather than a fallback.
   */
  for (let version = highest + 1; version < highest + 1000; version++) {
    const candidate = at(bookNameForNote(base, version));
    if (!taken.has(candidate)) return candidate;
  }
  return at(bookNameForNote(base, highest + 1)); // a thousand strangers in one folder is not a real case
}

/** One book this note made: where it is, what it says about itself, and how much work is in it. */
export interface NoteBook {
  /** The EPUB's vault path. */
  path: string;
  /** What its origin file says. */
  origin: BookOrigin;
  /** How many annotations it carries — the number the prompt quotes, so a real count and not a flag. */
  annotations: number;
  /**
   * Which version it is: 1 for the plain name, N for `- vNNN`.
   *
   * **Read once, where the base name is known.** It is in the filename, and parsing it needs the note's base to
   * know where the name ends — so `findBooksFromNote` does it and everything downstream compares numbers. It is
   * also the ONE ordering this feature uses: newest, the list's order, and which version may be replaced are all
   * the same comparison, never `created` in some places and the name in others.
   */
  version: number;
}

/**
 * What to do, once the books are known.
 *
 * - `open` — a book whose recorded hash equals the note's hash right now. Silent.
 * - `replace` — no match and nothing to lose. `replacing` is the book to overwrite, or null for the first one.
 * - `ask` — no match, and someone's work is at stake. The only question this feature ever asks.
 */
export type NoteBookDecision =
  | { kind: 'open'; book: NoteBook }
  | { kind: 'replace'; replacing: NoteBook | null }
  | { kind: 'ask'; annotated: NoteBook[]; replacing: NoteBook | null };

/** Newest first, by version — ties broken by path so the order is total and a test can state it. Two books
 *  claiming one version number is not a real case; determinism is. */
function newestFirst(a: NoteBook, b: NoteBook): number {
  return b.version - a.version || a.path.localeCompare(b.path);
}

/**
 * The whole decision, from the books and the note's hash right now.
 *
 * ```
 * Is there a match?
 * ├─ Yes → open the newest match                          silent
 * └─ No  → are any of the versions annotated?
 *          ├─ No  → replace it, open the new one          silent
 *          └─ Yes → ask
 * ```
 *
 * **"The newest match" handles a case that is easy to miss**: edit a note, keep a version, then undo the edit.
 * The note is now identical to a book that already exists — so that book *is* the note, and it opens. A match
 * always wins, even with an annotated version that no longer matches sitting beside it.
 *
 * **`replacing` is the LATEST version, and only when it has no annotations.** Once a version has been surpassed
 * by a newer one, it is ignored. "The newest unannotated version" would pick an older one the moment a reader
 * empties it — delete every annotation from v1 while v2 is annotated, and a create would overwrite v1, producing a
 * "Version 1" newer than Version 2. That breaks the thing the numbering exists to say. Only the latest can be
 * replaced, so the numbers stay in creation order by construction.
 *
 * The cost is an orphan: a surpassed version you have emptied is never reused and simply stays in the folder.
 * That is the right trade — an unused file is harmless, and recycling the wrong slot is not. Cleaning it up is
 * deliberately not offered; see the design doc on why old books are never removed automatically.
 */
export function resolveNoteBooks(books: readonly NoteBook[], hash: string): NoteBookDecision {
  const ordered = [...books].sort(newestFirst);
  const match = ordered.find((b) => b.origin.hash === hash);
  if (match) return { kind: 'open', book: match };
  const latest = ordered[0];
  const replacing = latest && latest.annotations === 0 ? latest : null;
  const annotated = ordered.filter((b) => b.annotations > 0);
  return annotated.length ? { kind: 'ask', annotated, replacing } : { kind: 'replace', replacing };
}

/** Read a book's origin file, or null when there is none, it will not parse, or another feature wrote it. */
export async function readBookOrigin(app: App, bookPath: string): Promise<BookOrigin | null> {
  const path = normalizePath(originFilePathFor(bookPath));
  try {
    if (!(await app.vault.adapter.exists(path))) return null;
    const raw = JSON.parse(await app.vault.adapter.read(path)) as Partial<BookOrigin>;
    if (raw.feature !== ORIGIN_FEATURE) return null;
    if (typeof raw.note !== 'string' || typeof raw.hash !== 'string' || typeof raw.created !== 'string') return null;
    return { note: raw.note, hash: raw.hash, created: raw.created, feature: raw.feature };
  } catch {
    return null; // an unreadable origin file is a book we cannot claim, which is the safe answer
  }
}

/** Record where a book came from. Written when the book is, not when it is first opened. */
export async function writeBookOrigin(app: App, bookPath: string, note: string, hash: string): Promise<void> {
  await ensureDataFolderAt(app, progressFolderPathFor(bookPath));
  const origin: BookOrigin = { note, hash, created: new Date().toISOString(), feature: ORIGIN_FEATURE };
  await app.vault.adapter.write(normalizePath(originFilePathFor(bookPath)), JSON.stringify(origin, null, 2));
}

/**
 * The books in this note's folder that this note made.
 *
 * The convention narrows the listing; the origin file decides. A candidate whose origin names a different note is
 * dropped — which is the case that matters, because `Sample Book.epub` sitting beside `Sample Book.md` is a file
 * someone may simply have put there.
 *
 * **Renaming or moving the note breaks the link**, and deliberately so for now: the next invocation makes a fresh
 * book and the old one keeps its annotations, orphaned but intact. Nothing is lost; nothing is connected either.
 * Obsidian fires a rename event and `moveOrbisSidecars` already follows a BOOK's rename, so following a note's is
 * a later job — written down because the derivation is weaker than it looks.
 */
export async function findBooksFromNote(app: App, note: TFile, countAnnotations: (path: string) => Promise<number>) {
  const folder = note.parent?.path ?? '';
  const dir = folder && folder !== '/' ? folder : '';
  const listing = await app.vault.adapter.list(normalizePath(dir || '/'));
  const base = bookBaseForNote(note.basename);
  const found: NoteBook[] = [];
  for (const filePath of listing.files) {
    const name = filePath.split('/').pop() ?? '';
    if (!isBookNameForNote(base, name)) continue;
    const origin = await readBookOrigin(app, filePath);
    if (!origin || origin.note !== note.path) continue;
    found.push({
      path: filePath,
      origin,
      annotations: await countAnnotations(filePath),
      // Never null: `isBookNameForNote` above is the same predicate `versionOfBookName` checks first.
      version: versionOfBookName(base, name) ?? 1,
    });
  }
  return found;
}
