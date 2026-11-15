import { describe, expect, it } from 'vitest';
import { recordStem } from '../reader/record-book-name';
import { allBooksBaseRoot, BOOK_RECORDS_SUFFIX, recordLocationReady, recordPaths } from '../reader/record-paths';

const ROOT = 'Reading records';
const BOOK = 'Books/Fiction/Sample.epub';

const inRoot = (over: Partial<Parameters<typeof recordPaths>[0]> = {}) =>
  recordPaths({
    location: { mode: 'global' },
    bookPath: BOOK,
    bookName: 'Sample',
    bookStem: 'Sample',
    globalRoot: ROOT,
    allBooksRoot: ROOT,
    ...over,
  });

const besideBook = (
  bookPath = BOOK,
  globalRoot = ROOT,
  allBooksRoot: string | null = globalRoot || null,
  allBookPaths: readonly string[] = [bookPath]
) =>
  recordPaths({
    location: { mode: 'book' },
    bookPath,
    bookName: '',
    bookStem: recordStem(bookPath, allBookPaths),
    globalRoot,
    allBooksRoot,
  });

describe('a root layout', () => {
  const p = inRoot();

  it('puts the records under content/, named for the book', () => {
    expect(p.records).toBe('Reading records/content/Sample');
  });

  it('puts both bases at the top level, where they are the interface', () => {
    expect(p.bookBase).toBe('Reading records/Sample.base');
    expect(p.globalBase).toBe('Reading records/!Reading records.base');
  });

  it('uses the disambiguated name throughout, so two sample.epub cannot collide', () => {
    const q = inRoot({ bookName: 'Fiction — Sample' });
    expect(q.records).toBe('Reading records/content/Fiction — Sample');
    expect(q.bookBase).toBe('Reading records/Fiction — Sample.base');
  });

  it('tolerates a trailing slash on the root', () => {
    expect(inRoot({ globalRoot: 'Reading records/' }).records).toBe('Reading records/content/Sample');
  });

  it('treats / as the vault root, the way Obsidian spells it in a folder dropdown', () => {
    // Both roots, because they are independent settings: the shared records folder and the folder holding the base
    // covering every book need not be the same value.
    const q = inRoot({ globalRoot: '/', allBooksRoot: '/' });
    expect(q.records).toBe('content/Sample');
    expect(q.bookBase).toBe('Sample.base');
    expect(q.globalBase).toBe('!Reading records.base');
  });
});

describe('a custom root', () => {
  const p = recordPaths({
    location: { mode: 'custom', path: 'Work/Reading' },
    bookPath: BOOK,
    bookName: 'Sample',
    bookStem: 'Sample',
    globalRoot: ROOT,
    allBooksRoot: ROOT,
  });

  it('is laid out exactly like the global root, so several books can share one', () => {
    // Not like a book-local folder, deliberately: two books pointing at one custom path would then share a
    // single content/, and each export's orphan pass would flag the other's records as deleted.
    expect(p.records).toBe('Work/Reading/content/Sample');
    expect(p.bookBase).toBe('Work/Reading/Sample.base');
  });

  it('claims no folder as its own, since a root is shared', () => {
    // `bookFolder` is what the post-move cleanup trashes when empty. Null here is the guard that stops a move
    // out of a root from deleting the reader's records folder.
    expect(p.bookFolder).toBeNull();
  });

  it('leaves the every-book base in the GLOBAL root', () => {
    // It filters on the tag alone, so one copy already finds records anywhere; a second in every custom root
    // would be a duplicate view of the same rows.
    expect(p.globalBase).toBe('Reading records/!Reading records.base');
  });
});

describe('beside the book', () => {
  const p = besideBook();

  it('is one folder next to the book, named for it', () => {
    expect(p.records).toBe(`Books/Fiction/Sample${BOOK_RECORDS_SUFFIX}/content`);
    expect(p.bookBase).toBe(`Books/Fiction/Sample${BOOK_RECORDS_SUFFIX}/Sample.base`);
  });

  it('drops the `!` prefix, which only ever existed to sort above sibling book folders', () => {
    expect(p.records).not.toContain('!');
  });

  it('needs no per-book subfolder under content/, since there is one book', () => {
    expect(p.records.endsWith('/content')).toBe(true);
  });

  it("names the whole folder as this book's own, which is what the cleanup may trash", () => {
    expect(p.bookFolder).toBe(`Books/Fiction/Sample${BOOK_RECORDS_SUFFIX}`);
  });

  it('has its records and its base inside the folder it claims', () => {
    // The post-move cleanup walks records → the folder itself, so containment is the invariant that keeps it from
    // trashing something it was not given.
    expect(p.records.startsWith(`${p.bookFolder}/`)).toBe(true);
    expect(p.bookBase.startsWith(`${p.bookFolder}/`)).toBe(true);
  });

  it("ignores the root layout's name it was handed, and uses the stem", () => {
    // A root layout's name tells same-named books in different folders apart, which a folder of its own never needs;
    // what it can need is the format, and that is the stem's job (`recordStem`).
    const q = recordPaths({
      location: { mode: 'book' },
      bookPath: BOOK,
      bookName: 'Fiction — Sample',
      bookStem: 'Sample',
      globalRoot: '',
      allBooksRoot: null,
    });
    expect(q.bookBase).toBe(`Books/Fiction/Sample${BOOK_RECORDS_SUFFIX}/Sample.base`);
  });

  it('works for a book at the vault root', () => {
    const q = besideBook('Sample.epub');
    expect(q.records).toBe(`Sample${BOOK_RECORDS_SUFFIX}/content`);
    expect(q.bookBase).toBe(`Sample${BOOK_RECORDS_SUFFIX}/Sample.base`);
  });

  it('strips only the extension, keeping dots in the name', () => {
    const q = besideBook('Books/Vol. 2 - Sample.epub');
    expect(q.records).toBe(`Books/Vol. 2 - Sample${BOOK_RECORDS_SUFFIX}/content`);
  });

  it('has no every-book base when there is nowhere for it', () => {
    // A reader who keeps every record beside its book and never named a shared folder has not asked for an
    // aggregate view; inventing a folder to hold one would be writing into their vault uninvited.
    expect(besideBook(BOOK, '', null).globalBase).toBeNull();
  });

  it('still points at the every-book base when a shared folder exists', () => {
    expect(besideBook().globalBase).toBe('Reading records/!Reading records.base');
  });
});

describe('recordLocationReady', () => {
  it('requires the shared folder only for a global book', () => {
    expect(recordLocationReady({ mode: 'global' }, '')).toBe(false);
    expect(recordLocationReady({ mode: 'global' }, ROOT)).toBe(true);
  });

  it('accepts / as a chosen folder', () => {
    // It is how Obsidian spells the vault root in a folder dropdown, so a reader who picked it has answered.
    expect(recordLocationReady({ mode: 'global' }, '/')).toBe(true);
  });

  it('needs no setting at all for a book keeping records beside itself', () => {
    expect(recordLocationReady({ mode: 'book' }, '')).toBe(true);
  });

  it('requires a custom location to actually have a path', () => {
    expect(recordLocationReady({ mode: 'custom', path: '' }, ROOT)).toBe(false);
    expect(recordLocationReady({ mode: 'custom', path: '   ' }, ROOT)).toBe(false);
    expect(recordLocationReady({ mode: 'custom', path: 'Work/Reading' }, '')).toBe(true);
  });
});

describe('allBooksBaseRoot', () => {
  it('is the folder it is given', () => {
    expect(allBooksBaseRoot('Reading records')).toBe('Reading records');
    // Its own folder, deliberately: a mode whose first option said "in the shared folder" would be incoherent when the
    // records live beside their books and that folder holds only this one file.
    expect(allBooksBaseRoot('Bases')).toBe('Bases');
  });

  it('is null when declined, which is what empty means here', () => {
    // The aggregate view is optional: each book still gets its own base, so refusing this loses nothing else.
    // Empty is an ANSWER, not a missing value — `recordsSetupDone` is what records whether we have asked.
    expect(allBooksBaseRoot('')).toBeNull();
    expect(allBooksBaseRoot('   ')).toBeNull();
  });
});

describe('two formats of one book in one folder', () => {
  // Each keeps its own records, since each has its own annotations at positions only it understands. Sharing one folder
  // would let either format's export flag the other's records as orphaned.
  const both = ['Books/Fiction/Sample.epub', 'Books/Fiction/Sample.azw3'];
  const epub = besideBook(both[0], ROOT, ROOT, both);
  const azw3 = besideBook(both[1], ROOT, ROOT, both);

  it('get a folder each, told apart by format', () => {
    expect(epub.bookFolder).toBe(`Books/Fiction/Sample (EPUB)${BOOK_RECORDS_SUFFIX}`);
    expect(azw3.bookFolder).toBe(`Books/Fiction/Sample (AZW3)${BOOK_RECORDS_SUFFIX}`);
    expect(epub.bookBase).toBe(`Books/Fiction/Sample (EPUB)${BOOK_RECORDS_SUFFIX}/Sample (EPUB).base`);
  });

  it('leaves a book in one format with its plain name', () => {
    expect(besideBook(both[0]).bookFolder).toBe(`Books/Fiction/Sample${BOOK_RECORDS_SUFFIX}`);
  });
});
