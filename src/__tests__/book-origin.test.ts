import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
  type BookOrigin,
  bookBaseForNote,
  bookNameForNote,
  findBooksFromNote,
  isBookNameForNote,
  type NoteBook,
  nextBookPath,
  noteBodyHash,
  ORIGIN_FEATURE,
  originFilePathFor,
  readBookOrigin,
  resolveNoteBooks,
  versionOfBookName,
  writeBookOrigin,
} from '../book-origin';

/** Byte length, the unit the name cap is measured in. */
const utf8 = (s: string): number => new TextEncoder().encode(s).length;

/**
 * The lookup layer of *Read in Orbis Reader* — see docs/design/read-in-orbis-reader.md.
 *
 * This layer is pinned by tests by design, rather than as a compromise: the decision below is where a bug would
 * live, and the alternative way to see a branch is to convert a note and look at what opened.
 */

const origin = (over: Partial<BookOrigin> = {}): BookOrigin => ({
  note: 'Clippings/Sample Book review.md',
  hash: 'h1',
  created: '2026-09-20T10:00:00.000Z',
  feature: ORIGIN_FEATURE,
  ...over,
});

/** Version is read from the path, exactly as `findBooksFromNote` does it, so a test that writes `- v002` into a
 *  name does not also have to remember to say which version that is. */
const book = (path: string, over: Partial<BookOrigin> = {}, annotations = 0): NoteBook => ({
  path,
  origin: origin(over),
  annotations,
  version: Number.parseInt(path.match(/ - v(\d{3,})\.epub$/)?.[1] ?? '1', 10),
});

describe('originFilePathFor', () => {
  it('sits in !orbis-data beside the other sidecars', () => {
    expect(originFilePathFor('Clippings/Sample Book review.epub')).toBe(
      'Clippings/!orbis-data/Sample Book review.epub.origin.json'
    );
  });

  it('handles a book at the vault root', () => {
    expect(originFilePathFor('Sample Book review.epub')).toBe('!orbis-data/Sample Book review.epub.origin.json');
  });

  it('keeps the whole file name, dots and extension included, like every other sidecar', () => {
    expect(originFilePathFor('books/My Book v1.2.epub')).toBe('books/!orbis-data/My Book v1.2.epub.origin.json');
  });
});

describe('noteBodyHash', () => {
  it('ignores the frontmatter, so a clipper stamping last-modified does not cry wolf', async () => {
    const before = '---\ntitle: Sample Book\nlast-modified: 2026-09-01\n---\n\nThe body.\n';
    const after = '---\ntitle: Sample Book\nlast-modified: 2026-09-20\n---\n\nThe body.\n';
    expect(await noteBodyHash(before)).toBe(await noteBodyHash(after));
  });

  it('ignores trailing whitespace, which everything that touches a Markdown file adds and removes', async () => {
    expect(await noteBodyHash('Body.')).toBe(await noteBodyHash('Body.\n\n\n'));
  });

  it('notices a real edit', async () => {
    expect(await noteBodyHash('The body.')).not.toBe(await noteBodyHash('The body, revised.'));
  });

  it('is the same answer for a note with no frontmatter at all', async () => {
    expect(await noteBodyHash('Just text.')).toBe(await noteBodyHash('Just text.'));
  });

  it('does not treat a horizontal rule mid-document as frontmatter', async () => {
    // `stripFrontmatter` only honors a block at the very start; a note whose body happens to contain `---` must
    // keep everything above it, or two notes differing only up there would hash the same.
    const a = 'Opening line.\n\n---\n\nClosing line.';
    const b = 'Different opening.\n\n---\n\nClosing line.';
    expect(await noteBodyHash(a)).not.toBe(await noteBodyHash(b));
  });
});

describe('bookBaseForNote', () => {
  it('leaves an ordinary note name alone', () => {
    expect(bookBaseForNote('Sample Book review')).toBe('Sample Book review');
  });

  /**
   * **The book mirrors the note's name; it does not tidy it.**
   *
   * `sanitizeName` collapses runs of whitespace, which is right for its own input — an EPUB title, arriving as
   * words with arbitrary spacing. A note's filename is not words: Obsidian has already guaranteed it is a legal
   * name, so `Part  One` should get a book called `Part  One`. Collapsing here would also be a way for the lookup
   * and the converter to disagree.
   */
  it('keeps the spacing the note has, however odd', () => {
    expect(bookBaseForNote('Part  One')).toBe('Part  One');
    expect(bookBaseForNote('009 -   PART I –   CHAPTER   IV')).toBe('009 -   PART I –   CHAPTER   IV');
  });

  it('strips a leading dot or space, which is a direction rather than a name', () => {
    expect(bookBaseForNote('.hidden note')).toBe('hidden note');
    expect(bookBaseForNote('  leading spaces')).toBe('leading spaces');
  });

  it('still strips what a filename cannot hold, for a path that did not come from a rename here', () => {
    // Unreachable by typing a name into Obsidian, which refuses these itself, but a note path can arrive from
    // sync, from another platform, or from a plugin that writes files directly. The `#` becomes a space and the
    // doubled space it leaves is kept, because keeping the spacing is the rule above and a name with an odd gap
    // in it is still a name.
    expect(bookBaseForNote('Sample Book #1')).toBe('Sample Book  1');
  });

  /**
   * **Two limits in two units, because two different things are being protected.**
   *
   * Bytes are the filesystem's: a component may be 255, and `<base>.location.<device id>.json` adds 27.
   * Characters are Windows': `MAX_PATH` counts the whole path in characters, and a vault shared between a Mac and
   * a Windows machine is one person with two computers.
   */
  it('gives a Latin name the 80 characters the rest of Orbis allows', () => {
    expect(bookBaseForNote('A'.repeat(300))).toBe('A'.repeat(80));
  });

  it('counts an en dash as the three bytes it costs, so a non-Latin name stays inside the limit', () => {
    // What the byte limit exists for: 80 characters of these is 240 bytes, already over the 228 a component has
    // once the location sidecar's suffix is added. Note names are often full of en dashes.
    const base = bookBaseForNote('–'.repeat(300));
    expect(utf8(base)).toBeLessThanOrEqual(200);
    expect(base.length).toBe(66); // 198 bytes: the next one would not fit
  });

  it('never cuts a character in half, and counts an emoji as one', () => {
    // A string index is a UTF-16 unit, so slicing can land between the halves of a surrogate pair and produce a
    // lone surrogate — not a character, and not a filename.
    const base = bookBaseForNote('\u{1F4DA}'.repeat(100)); // 4 bytes, 2 UTF-16 units, 1 character
    expect([...base].length).toBe(50); // the byte limit binds first, at 200
    expect(base).toBe('\u{1F4DA}'.repeat(50));
  });

  /** The plain name must not pay for a version most notes never get. */
  it('does not shorten the plain name to make room for a version number', () => {
    const base = bookBaseForNote('A'.repeat(300));
    expect(bookNameForNote(base)).toBe(`${'A'.repeat(80)}.epub`);
  });

  it('shortens only the versioned head, and only as far as the suffix needs', () => {
    const base = bookBaseForNote('A'.repeat(300));
    const widest = bookNameForNote(base, 999).replace(/\.epub$/, '');
    expect(widest.length).toBe(80); // exactly the cap, nothing wasted
    expect(utf8(widest)).toBeLessThanOrEqual(200);
  });

  it('recognises both forms of a long name, whose heads differ', () => {
    const base = bookBaseForNote('A'.repeat(300));
    expect(isBookNameForNote(base, bookNameForNote(base))).toBe(true);
    expect(isBookNameForNote(base, bookNameForNote(base, 2))).toBe(true);
    expect(isBookNameForNote(base, bookNameForNote(base, 42))).toBe(true);
  });

  it('still refuses a name that merely starts the same way', () => {
    // The versioned pattern is anchored on its own head, not used as a prefix — another note's longer name must
    // not be claimed just because the first 73 characters agree.
    const base = bookBaseForNote('A'.repeat(300));
    expect(isBookNameForNote(base, `${'A'.repeat(75)} something else.epub`)).toBe(false);
  });

  it('falls back rather than producing an empty name', () => {
    expect(bookBaseForNote('###')).toBe('book');
  });
});

describe('the naming convention', () => {
  it('gives the first book the note name, unadorned', () => {
    expect(bookNameForNote('Sample Book review')).toBe('Sample Book review.epub');
  });

  /**
   * **Numbering starts at two, because the plain name is version one.** A second file called `v001` would be a
   * "version 1" that is not the first — worse than the ambiguity numbering exists to prevent: `Sample Book review.epub`
   * beside `Sample Book review (2026-09-21).epub` says nothing about which came first unless you already know the
   * convention.
   */
  it('numbers from v002, because the plain name is version one', () => {
    expect(bookNameForNote('Sample Book review', 1)).toBe('Sample Book review.epub');
    expect(bookNameForNote('Sample Book review', 2)).toBe('Sample Book review - v002.epub');
    expect(bookNameForNote('Sample Book review', 3)).toBe('Sample Book review - v003.epub');
  });

  /** Zero-padded so they sort the way they read — `v010` after `v009`, not between `v001` and `v002`. */
  it('pads to three digits, and keeps going past a thousand', () => {
    expect(bookNameForNote('Sample Book review', 10)).toBe('Sample Book review - v010.epub');
    expect(bookNameForNote('Sample Book review', 1000)).toBe('Sample Book review - v1000.epub');
    const names = [2, 10, 9].map((v) => bookNameForNote('Sample Book review', v)).sort();
    expect(names).toStrictEqual([
      'Sample Book review - v002.epub',
      'Sample Book review - v009.epub',
      'Sample Book review - v010.epub',
    ]);
  });

  /** The pair has to agree or the lookup silently stops finding the books the converter writes. */
  it('recognises everything it can produce', () => {
    const base = 'Sample Book review';
    for (const name of [1, 2, 7, 42, 1000].map((v) => bookNameForNote(base, v))) {
      expect(isBookNameForNote(base, name), name).toBe(true);
    }
  });

  it('reads the version back out of a name', () => {
    const base = 'Sample Book review';
    expect(versionOfBookName(base, 'Sample Book review.epub')).toBe(1);
    expect(versionOfBookName(base, 'Sample Book review - v002.epub')).toBe(2);
    expect(versionOfBookName(base, 'Sample Book review - v017.epub')).toBe(17);
    expect(versionOfBookName(base, 'Something else - v002.epub')).toBeNull();
  });

  it('is anchored, so a longer name is not a candidate', () => {
    expect(isBookNameForNote('Sample Book review', 'Sample Book review notes.epub')).toBe(false);
    expect(isBookNameForNote('Sample Book review', 'Old Sample Book review.epub')).toBe(false);
    expect(isBookNameForNote('Sample Book review', 'Sample Book review.pdf')).toBe(false);
  });

  it('treats a note name containing regex characters as literal text', () => {
    // `What is C++ (really)?` is a legal note name and a broken regex.
    expect(isBookNameForNote('What is C++ (really)', 'What is C++ (really).epub')).toBe(true);
    expect(isBookNameForNote('What is C++ (really)', 'What is Cxx (really).epub')).toBe(false);
  });
});

describe('nextBookPath', () => {
  it('takes the plain name when the folder is empty', () => {
    expect(nextBookPath('Clippings', 'Sample Book review', new Set())).toBe('Clippings/Sample Book review.epub');
  });

  it('puts a root note’s book at the root', () => {
    expect(nextBookPath('/', 'Sample Book review', new Set())).toBe('Sample Book review.epub');
  });

  /** What remains after putting the book beside its note: a file of that name that is not ours. Never clobber
   *  it — answered the same way a second version is. */
  it('steps aside for a file that is not ours', () => {
    const taken = new Set(['Clippings/Sample Book review.epub']);
    expect(nextBookPath('Clippings', 'Sample Book review', taken)).toBe('Clippings/Sample Book review - v002.epub');
  });

  it('counts on from the versions already there', () => {
    const taken = new Set([
      'Clippings/Sample Book review.epub',
      'Clippings/Sample Book review - v002.epub',
      'Clippings/Sample Book review - v003.epub',
    ]);
    expect(nextBookPath('Clippings', 'Sample Book review', taken)).toBe('Clippings/Sample Book review - v004.epub');
  });

  /**
   * **One past the HIGHEST, not the lowest free.** Deleting v002 and making another version must not hand that
   * name back out: a number meaning two different readings at two different times is what numbering is for
   * preventing.
   */
  it('does not reuse the number of a deleted version', () => {
    const taken = new Set(['Clippings/Sample Book review.epub', 'Clippings/Sample Book review - v003.epub']);
    expect(nextBookPath('Clippings', 'Sample Book review', taken)).toBe('Clippings/Sample Book review - v004.epub');
  });

  it('ignores versions of a DIFFERENT note, and books in other folders', () => {
    const taken = new Set([
      'Clippings/Sample Book review.epub',
      'Clippings/Something else - v009.epub', // another note's ninth
      'Archive/Sample Book review - v009.epub', // ours, but not in this folder
    ]);
    expect(nextBookPath('Clippings', 'Sample Book review', taken)).toBe('Clippings/Sample Book review - v002.epub');
  });

  it('produces a path the lookup would recognise', () => {
    // The two halves of the convention, meeting: whatever this writes, `findBooksFromNote` has to find.
    const base = bookBaseForNote('Sample Book review');
    const taken = new Set(['Clippings/Sample Book review.epub']);
    const path = nextBookPath('Clippings', base, taken);
    expect(isBookNameForNote(base, path.split('/').pop() ?? '')).toBe(true);
  });
});

describe('resolveNoteBooks', () => {
  it('creates the first book when the note has none', () => {
    expect(resolveNoteBooks([], 'h1')).toStrictEqual({ kind: 'replace', replacing: null });
  });

  it('opens the book when nothing has changed', () => {
    const only = book('Clippings/Sample Book review.epub');
    expect(resolveNoteBooks([only], 'h1')).toStrictEqual({ kind: 'open', book: only });
  });

  it('replaces an unannotated book silently when the note changed', () => {
    const stale = book('Clippings/Sample Book review.epub');
    expect(resolveNoteBooks([stale], 'h2')).toStrictEqual({ kind: 'replace', replacing: stale });
  });

  it('asks when the stale book has work in it', () => {
    const annotated = book('Clippings/Sample Book review.epub', {}, 12);
    expect(resolveNoteBooks([annotated], 'h2')).toStrictEqual({
      kind: 'ask',
      annotated: [annotated],
      replacing: null,
    });
  });

  /**
   * Edit a note, keep a version, then undo the edit. The note is now identical to a book that already exists, so
   * that book IS the note — and it opens, even though an annotated book that no longer matches sits beside it.
   * This is the case the tree is shaped around, and the one a simpler "most annotations wins" would get wrong.
   */
  it('lets a match win over an annotated book that does not match', () => {
    const annotated = book('Clippings/Sample Book review.epub', { hash: 'h2' }, 12);
    const matching = book('Clippings/Sample Book review - v002.epub', {
      hash: 'h1',
      created: '2026-09-21T10:00:00.000Z',
    });
    expect(resolveNoteBooks([annotated, matching], 'h1')).toStrictEqual({ kind: 'open', book: matching });
  });

  it('opens the NEWEST match when two books both match', () => {
    const older = book('Clippings/Sample Book review.epub', { created: '2026-09-20T10:00:00.000Z' });
    const newer = book('Clippings/Sample Book review - v002.epub', { created: '2026-09-21T10:00:00.000Z' });
    expect(resolveNoteBooks([older, newer], 'h1')).toStrictEqual({ kind: 'open', book: newer });
  });

  it('offers every annotated version, newest first, when several have work in them', () => {
    const first = book('Clippings/Sample Book review.epub', { hash: 'x', created: '2026-09-18T10:00:00.000Z' }, 3);
    const second = book(
      'Clippings/Sample Book review - v002.epub',
      { hash: 'y', created: '2026-09-20T10:00:00.000Z' },
      9
    );
    const decision = resolveNoteBooks([first, second], 'h-new');
    expect(decision.kind).toBe('ask');
    if (decision.kind !== 'ask') return;
    expect(decision.annotated.map((b) => b.path)).toStrictEqual([second.path, first.path]);
  });

  /**
   * **Once a version has been surpassed by a newer one, it is ignored.**
   *
   * Create v1, annotate it, edit, create v2, annotate it, edit, then go back and delete every annotation from
   * v1. A rule of "the newest UNANNOTATED version" would pick v1 and overwrite it, producing a Version 1 newer
   * than Version 2 and breaking the one thing the numbering exists to say. Only the latest may be replaced.
   */
  it('never replaces a version that a newer one has surpassed', () => {
    const emptied = book('Clippings/Sample Book review.epub', { hash: 'old' }, 0);
    const current = book('Clippings/Sample Book review - v002.epub', { hash: 'v2' }, 5);
    const decision = resolveNoteBooks([emptied, current], 'note-changed-again');
    expect(decision).toStrictEqual({ kind: 'ask', annotated: [current], replacing: null });
  });

  it('does replace the latest version when that is the empty one', () => {
    // The ordinary case, and why `replacing` exists at all: saying create twice in a row must not leave a
    // trail of empty books behind.
    const annotated = book('Clippings/Sample Book review.epub', { hash: 'old' }, 5);
    const spare = book('Clippings/Sample Book review - v002.epub', { hash: 'stale' }, 0);
    const decision = resolveNoteBooks([annotated, spare], 'note-changed-again');
    expect(decision).toStrictEqual({ kind: 'ask', annotated: [annotated], replacing: spare });
  });

  it('orders by version, not by when the origin file says it was written', () => {
    // Two versions made in the same second must still come out in order.
    const one = book('Clippings/Sample Book review.epub', { created: '2026-09-21T10:00:00.000Z', hash: 'a' }, 1);
    const two = book('Clippings/Sample Book review - v002.epub', { created: '2026-09-21T10:00:00.000Z', hash: 'b' }, 1);
    const decision = resolveNoteBooks([one, two], 'changed');
    expect(decision.kind).toBe('ask');
    if (decision.kind !== 'ask') return;
    expect(decision.annotated.map((b) => b.version)).toStrictEqual([2, 1]);
  });

  it('does not depend on the order it is handed the books', () => {
    const a = book('Clippings/a.epub', { created: '2026-09-18T10:00:00.000Z', hash: 'x' }, 1);
    const b = book('Clippings/b.epub', { created: '2026-09-20T10:00:00.000Z', hash: 'y' }, 2);
    expect(resolveNoteBooks([a, b], 'z')).toStrictEqual(resolveNoteBooks([b, a], 'z'));
  });
});

/** A vault with a `!orbis-data` folder and whatever files the test puts in it. */
function fakeApp(files: Record<string, string>) {
  const app = {
    vault: {
      adapter: {
        exists: (p: string) => Promise.resolve(p in files),
        read: (p: string) => Promise.resolve(files[p] ?? ''),
        write: (p: string, data: string) => {
          files[p] = data;
          return Promise.resolve();
        },
        mkdir: (p: string) => {
          files[`${p}/`] = '';
          return Promise.resolve();
        },
        // The root is asked for as `/` (what Obsidian's `normalizePath` turns an empty path into) and its files
        // come back with no slash in them at all — so the two spellings have to mean the same folder here, or
        // a note at the vault root looks like a note with no books.
        list: (dir: string) => {
          const want = dir === '/' ? '' : dir;
          const parentOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
          return Promise.resolve({
            files: Object.keys(files).filter((p) => !p.endsWith('/') && parentOf(p) === want),
            folders: [],
          });
        },
      },
    },
  } as unknown as App;
  return { app, files };
}

const noteFile = (path: string): TFile => {
  const name = path.split('/').pop() ?? '';
  return {
    path,
    basename: name.replace(/\.[^.]+$/, ''),
    parent: { path: path.split('/').slice(0, -1).join('/') },
  } as unknown as TFile;
};

describe('readBookOrigin', () => {
  const written = JSON.stringify(origin());

  it('reads what was written', async () => {
    const { app } = fakeApp({ 'Clippings/!orbis-data/Sample Book review.epub.origin.json': written });
    await expect(readBookOrigin(app, 'Clippings/Sample Book review.epub')).resolves.toStrictEqual(origin());
  });

  it('says nothing rather than throwing on a missing or unreadable file', async () => {
    const { app } = fakeApp({});
    await expect(readBookOrigin(app, 'Clippings/Sample Book review.epub')).resolves.toBeNull();
    const broken = fakeApp({ 'Clippings/!orbis-data/Sample Book review.epub.origin.json': 'not json' });
    await expect(readBookOrigin(broken.app, 'Clippings/Sample Book review.epub')).resolves.toBeNull();
  });

  it('refuses a file another feature wrote', async () => {
    // One `<book>.origin.json` per book, so a later feature recording its own provenance collides on the name.
    const { app } = fakeApp({
      'Clippings/!orbis-data/Sample Book review.epub.origin.json': JSON.stringify(
        origin({ feature: 'something-else' })
      ),
    });
    await expect(readBookOrigin(app, 'Clippings/Sample Book review.epub')).resolves.toBeNull();
  });

  it('refuses a file missing the fields it is trusted for', async () => {
    const { app } = fakeApp({
      'Clippings/!orbis-data/Sample Book review.epub.origin.json': JSON.stringify({
        feature: ORIGIN_FEATURE,
        note: 'n.md',
      }),
    });
    await expect(readBookOrigin(app, 'Clippings/Sample Book review.epub')).resolves.toBeNull();
  });
});

describe('writeBookOrigin', () => {
  it('writes a file readBookOrigin accepts, creating the folder', async () => {
    const { app, files } = fakeApp({});
    await writeBookOrigin(app, 'Clippings/Sample Book review.epub', 'Clippings/Sample Book review.md', 'h1');
    expect(Object.keys(files)).toContain('Clippings/!orbis-data/Sample Book review.epub.origin.json');
    const back = await readBookOrigin(app, 'Clippings/Sample Book review.epub');
    expect(back?.note).toBe('Clippings/Sample Book review.md');
    expect(back?.hash).toBe('h1');
    expect(back?.feature).toBe(ORIGIN_FEATURE);
  });
});

describe('findBooksFromNote', () => {
  const note = noteFile('Clippings/Sample Book review.md');
  const none = () => Promise.resolve(0);

  it('finds the book it made, and ignores a stranger sharing the name', async () => {
    // The case the origin file exists for: someone put their own `Sample Book review.epub` in this folder, or an
    // earlier export left one. Convention alone would claim it.
    const { app } = fakeApp({
      'Clippings/Sample Book review.md': '# Sample Book',
      'Clippings/Sample Book review.epub': 'zip',
    });
    await expect(findBooksFromNote(app, note, none)).resolves.toStrictEqual([]);
  });

  it('keeps a candidate whose origin names this note', async () => {
    const { app } = fakeApp({
      'Clippings/Sample Book review.epub': 'zip',
      'Clippings/!orbis-data/Sample Book review.epub.origin.json': JSON.stringify(origin()),
    });
    const found = await findBooksFromNote(app, note, none);
    expect(found.map((b) => b.path)).toStrictEqual(['Clippings/Sample Book review.epub']);
  });

  it('drops a candidate whose origin names a DIFFERENT note', async () => {
    // `Clippings/Sample Book review.md` and `Archive/Sample Book review.md` both exist; the second one's book was moved
    // here. It is not this note's book, whatever it is called.
    const { app } = fakeApp({
      'Clippings/Sample Book review.epub': 'zip',
      'Clippings/!orbis-data/Sample Book review.epub.origin.json': JSON.stringify(
        origin({ note: 'Archive/Sample Book review.md' })
      ),
    });
    await expect(findBooksFromNote(app, note, none)).resolves.toStrictEqual([]);
  });

  it('finds the numbered versions too', async () => {
    const { app } = fakeApp({
      'Clippings/Sample Book review.epub': 'zip',
      'Clippings/!orbis-data/Sample Book review.epub.origin.json': JSON.stringify(origin()),
      'Clippings/Sample Book review - v002.epub': 'zip',
      'Clippings/!orbis-data/Sample Book review - v002.epub.origin.json': JSON.stringify(origin({ hash: 'h2' })),
      'Clippings/Unrelated.epub': 'zip',
    });
    const found = await findBooksFromNote(app, note, none);
    expect(found.map((b) => b.path).sort()).toStrictEqual([
      'Clippings/Sample Book review - v002.epub',
      'Clippings/Sample Book review.epub',
    ]);
  });

  it('carries the annotation count the prompt quotes', async () => {
    const { app } = fakeApp({
      'Clippings/Sample Book review.epub': 'zip',
      'Clippings/!orbis-data/Sample Book review.epub.origin.json': JSON.stringify(origin()),
    });
    const found = await findBooksFromNote(app, note, () => Promise.resolve(12));
    expect(found[0].annotations).toBe(12);
  });

  it('works for a note at the vault root', async () => {
    const { app } = fakeApp({
      'Sample Book review.epub': 'zip',
      '!orbis-data/Sample Book review.epub.origin.json': JSON.stringify(origin({ note: 'Sample Book review.md' })),
    });
    const found = await findBooksFromNote(app, noteFile('Sample Book review.md'), none);
    expect(found.map((b) => b.path)).toStrictEqual(['Sample Book review.epub']);
  });
});
