// Replace on a book folder of chapter notes, run through the exporter against a vault held in memory.
//
// Replace used to take away every note in the folder it did not write this time: the reader's own notes, Save as
// Markdown's chapters, another book's set. It now takes away only this set's notes from an earlier run — see
// `earlierSetNotes` — and these tests drive the exporter itself, because the removal is its I/O, not the rule's.

import { type App, TFile, TFolder } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesExporter } from '../reader/NotesExporter';
import { earlierSetNotes } from '../reader/note-set-leftovers';
import type { ReaderContext } from '../reader/ReaderContext';
import { DEFAULT_NOTE_STYLE_CONFIG } from '../settings';

const notices = vi.hoisted(() => [] as unknown[]);
vi.mock('obsidian', async (load) => ({
  ...(await load<object>()),
  Notice: class {
    constructor(message: unknown) {
      notices.push(message);
    }
  },
}));

const BOOK = 'Books/Sample.epub';
const FOLDER = 'Notes/Sample';
const SLUG = 'notes-sample'; // what the exporter makes of FOLDER

/** Enough of `key: value` frontmatter for these notes: quoted values hold no escapes. */
function frontmatterOf(content: string): Record<string, unknown> | undefined {
  const block = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  if (block === undefined) return undefined;
  const fm: Record<string, unknown> = {};
  for (const line of block.split('\n')) {
    const m = /^(\w+): (.*)$/.exec(line);
    if (m) fm[m[1]] = m[2].startsWith('"') ? JSON.parse(m[2]) : m[2];
  }
  return fm;
}

function note(props: Record<string, string>): string {
  return `---\n${Object.entries(props)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')}\n---\n\nbody\n`;
}

/** A vault in memory: files, folders, the metadata cache over them, and the trash. */
function memoryVault(initial: Record<string, string>) {
  const contents = new Map<string, string>();
  const folders = new Map<string, TFolder>();
  const files = new Map<string, TFile>();
  const trashed: string[] = [];

  const folder = (path: string): TFolder => {
    let f = folders.get(path);
    if (!f) {
      f = Object.assign(new TFolder(), { path });
      folders.set(path, f);
    }
    return f;
  };
  const add = (path: string, content: string): TFile => {
    const slash = path.lastIndexOf('/');
    const name = path.slice(slash + 1);
    const file = Object.assign(new TFile(), {
      path,
      name,
      basename: name.replace(/\.[^.]+$/, ''),
      extension: name.slice(name.lastIndexOf('.') + 1),
      parent: { path: path.slice(0, slash) },
    });
    files.set(path, file);
    contents.set(path, content);
    folder(path.slice(0, slash)).children.push(file);
    return file;
  };
  for (const [path, content] of Object.entries(initial)) add(path, content);

  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => files.get(p) ?? folders.get(p) ?? null,
      createFolder: async (p: string) => folder(p),
      create: async (p: string, content: string) => add(p, content),
      process: async (f: TFile, fn: (s: string) => string) => {
        contents.set(f.path, fn(contents.get(f.path) ?? ''));
      },
    },
    metadataCache: {
      getFileCache: (f: TFile) => ({ frontmatter: frontmatterOf(contents.get(f.path) ?? '') }),
      getFirstLinkpathDest: (linkpath: string) => files.get(linkpath) ?? null,
    },
    fileManager: {
      trashFile: async (f: TFile) => {
        trashed.push(f.path);
        files.delete(f.path);
        const parent = folders.get(f.parent?.path ?? '');
        if (parent) parent.children = parent.children.filter((c) => c !== f);
      },
    },
  } as unknown as App;

  return { app, trashed, files, book: add(BOOK, '') };
}

function exporter(app: App, book: TFile): NotesExporter {
  const ctx = {
    app,
    currentFile: book,
    invalidateBacklinks: () => {},
    notesData: () => ({
      filePath: BOOK,
      fileBasename: 'Sample',
      meta: { title: 'The Sample', author: 'A. Writer', publisher: '', language: 'en', pubdate: '', description: '' },
      highlights: [],
      notes: [],
      bookmarks: [],
      tocItems: [
        { label: 'Chapter One', href: 'ch1.html' },
        { label: 'Chapter Two', href: 'ch2.html' },
      ],
      bookSectionCount: 2,
      frontmatterKeyLanguage: 'english',
    }),
  };
  return new NotesExporter(ctx as unknown as ReaderContext);
}

const config = { ...DEFAULT_NOTE_STYLE_CONFIG, chapterFilesScope: 'all' as const };
const setNote = (extra: Record<string, string> = {}) =>
  note({ orbis_generated: 'note-set', book: `[[${BOOK}]]`, note_set: SLUG, ...extra });

/** A folder holding an earlier run of the set beside four notes that are not the set's. */
const folderWithEarlierRun = {
  // The earlier run: a contents note, the two chapters this run writes again, and two it does not.
  [`${FOLDER}/000 - The Sample.md`]: setNote(),
  [`${FOLDER}/001 - Chapter One.md`]: setNote({ chapter: '1' }),
  [`${FOLDER}/002 - Chapter Two.md`]: setNote({ chapter: '2' }),
  [`${FOLDER}/002 - Prologue.md`]: setNote({ chapter: '2' }),
  [`${FOLDER}/000 - An Earlier Title.md`]: setNote(),
  // Not the set's.
  [`${FOLDER}/My own thoughts.md`]: 'Written by the reader.\n',
  [`${FOLDER}/Chapter One.md`]: note({ orbis_generated: 'book-export', book: `[[${BOOK}]]` }),
  [`${FOLDER}/001 - Other Book.md`]: note({
    orbis_generated: 'note-set',
    book: '[[Books/Other.epub]]',
    note_set: SLUG,
  }),
  [`${FOLDER}/Unrelated set.md`]: note({ orbis_generated: 'note-set', book: `[[${BOOK}]]`, note_set: 'elsewhere' }),
};

describe('Replace on a book folder', () => {
  beforeEach(() => {
    notices.length = 0;
  });

  it("removes this set's notes from the earlier run that this run does not write again", async () => {
    const { app, trashed, book } = memoryVault(folderWithEarlierRun);
    await exporter(app, book).generatePerChapterNotes(FOLDER, config, 'default', 'Default', undefined, false);
    expect(trashed.sort()).toEqual([`${FOLDER}/000 - An Earlier Title.md`, `${FOLDER}/002 - Prologue.md`]);
  });

  it('leaves every other note in the folder where it is', async () => {
    const { app, files, book } = memoryVault(folderWithEarlierRun);
    await exporter(app, book).generatePerChapterNotes(FOLDER, config, 'default', 'Default', undefined, false);
    for (const kept of ['My own thoughts.md', 'Chapter One.md', '001 - Other Book.md', 'Unrelated set.md'])
      expect(files.has(`${FOLDER}/${kept}`)).toBe(true);
  });

  it('says what it wrote, and how many earlier notes it removed', async () => {
    const { app, book } = memoryVault(folderWithEarlierRun);
    await exporter(app, book).generatePerChapterNotes(FOLDER, config, 'default', 'Default', undefined, false);
    expect(notices).toEqual(['Wrote 2 chapter notes and the contents note. Removed 2 earlier chapter notes.']);
  });

  it('says nothing about removing when it removed nothing', async () => {
    const { app, book } = memoryVault({});
    await exporter(app, book).generatePerChapterNotes(FOLDER, config, 'default', 'Default', undefined, false);
    expect(notices).toEqual(['Wrote 2 chapter notes and the contents note.']);
  });

  /**
   * A merge writes its draft to a folder of its own, with the SAME `note_set` as the set it will merge into. Searched
   * across the vault, the draft run would take the real set's notes for its own leftovers.
   */
  it('building a merge draft leaves the set it will merge into alone', async () => {
    const { app, trashed, book } = memoryVault(folderWithEarlierRun);
    await exporter(app, book).generatePerChapterNotes(
      `${FOLDER}-merge-draft`,
      config,
      'default',
      'Default',
      SLUG,
      false
    );
    expect(trashed).toEqual([]);
  });
});

describe('earlierSetNotes', () => {
  const thisBook = (link: string) => link === `[[${BOOK}]]`;

  it('reads a set whose keys were written in the vault language, and the English names too', () => {
    const localized = (k: string) => ({ note_set: 'notizen_set', book: 'buch' })[k] ?? k;
    const notes = [
      { path: 'a.md', frontmatter: { orbis_generated: 'note-set', notizen_set: SLUG, buch: `[[${BOOK}]]` } },
      { path: 'b.md', frontmatter: { orbis_generated: 'note-set', note_set: SLUG, book: `[[${BOOK}]]` } },
    ];
    expect(earlierSetNotes(notes, SLUG, thisBook, localized)).toEqual(['a.md', 'b.md']);
  });

  it('takes nothing without properties to go on', () => {
    expect(earlierSetNotes([{ path: 'a.md', frontmatter: undefined }], SLUG, thisBook)).toEqual([]);
    expect(
      earlierSetNotes([{ path: 'b.md', frontmatter: { orbis_generated: 'note-set', note_set: SLUG } }], SLUG, thisBook)
    ).toEqual([]);
  });
});
