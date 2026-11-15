// A deleted book's reading data goes to the trash — this book's files only, and never past Obsidian's trash setting.

import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { trashBookData } from '../book-data-trash';

/** A vault whose files are all indexed unless listed in `unindexed`. Records what was trashed and what removed. */
function vault(paths: string[], unindexed: string[] = []) {
  const files = new Set(paths);
  const folders = new Set<string>();
  for (const p of paths) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'));
  }
  const trashed: string[] = [];
  const removedFolders: string[] = [];
  const under = (dir: string) => [...files, ...folders].filter((p) => p.startsWith(`${dir}/`));
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) =>
        (files.has(p) || folders.has(p)) && !unindexed.includes(p) ? { path: p } : null,
      adapter: {
        exists: async (p: string) => files.has(p) || folders.has(p),
        list: async (dir: string) => ({
          files: [...files].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/')),
          folders: [...folders].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/')),
        }),
        rmdir: async (dir: string) => {
          removedFolders.push(dir);
          folders.delete(dir);
        },
      },
    },
    fileManager: {
      trashFile: async (f: { path: string }) => {
        trashed.push(f.path);
        for (const p of under(f.path)) {
          files.delete(p);
          folders.delete(p);
        }
        files.delete(f.path);
        folders.delete(f.path);
      },
    },
  } as unknown as App;
  return { app, trashed, removedFolders };
}

const book = { path: 'books/A.epub', name: 'A.epub', basename: 'A', extension: 'epub', parent: { path: 'books' } };
const asBook = book as unknown as TFile;
const quiet = () => {};

describe('trashBookData', () => {
  it("trashes this book's data and recordings, and leaves another book's", async () => {
    const { app, trashed } = vault([
      'books/!orbis-data/A.epub.orbis',
      'books/!orbis-data/A.epub.location.dev1.json',
      'books/!orbis-data/A.epub.marks.dev1.json',
      'books/!orbis-data/A.epub.pages.json',
      'books/!orbis-data/audio/A.epub.audio/voice/manifest.json',
      'books/!orbis-data/A 2.epub.orbis',
    ]);
    expect(await trashBookData(app, asBook, quiet)).toBe(5);
    expect(trashed.sort()).toEqual([
      'books/!orbis-data/A.epub.location.dev1.json',
      'books/!orbis-data/A.epub.marks.dev1.json',
      'books/!orbis-data/A.epub.orbis',
      'books/!orbis-data/A.epub.pages.json',
      'books/!orbis-data/audio/A.epub.audio',
    ]);
  });

  it('removes the folders it leaves empty', async () => {
    const { app, removedFolders } = vault([
      'books/!orbis-data/A.epub.orbis',
      'books/!orbis-data/audio/A.epub.audio/voice/manifest.json',
    ]);
    await trashBookData(app, asBook, quiet);
    expect(removedFolders).toEqual(['books/!orbis-data/audio', 'books/!orbis-data']);
  });

  // Nothing is deleted outright: a file the trash cannot take stays where it is.
  it('leaves a file Obsidian has not indexed', async () => {
    const { app, trashed, removedFolders } = vault(
      ['books/!orbis-data/A.epub.orbis', 'books/!orbis-data/A.epub.pages.json'],
      ['books/!orbis-data/A.epub.pages.json']
    );
    expect(await trashBookData(app, asBook, quiet)).toBe(1);
    expect(trashed).toEqual(['books/!orbis-data/A.epub.orbis']);
    expect(removedFolders).toEqual([]);
  });
});
