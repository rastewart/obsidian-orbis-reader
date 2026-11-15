// Finding the notes that link to a book, and reading a damaged data file.

import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { readProgressJson } from '../orbis-io';
import { scanBacklinks } from '../progress';

/** A vault of Markdown notes and nothing resolved — every match has to come from the content scan. */
function vaultOf(notes: Record<string, string>): App {
  const files = Object.entries(notes).map(
    ([path, text]) =>
      ({
        path,
        basename: (path.split('/').pop() ?? '').replace(/\.md$/, ''),
        stat: { size: text.length },
      }) as unknown as TFile
  );
  return {
    metadataCache: { resolvedLinks: {} },
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: () => null,
      cachedRead: async (file: TFile) => notes[file.path],
    },
  } as unknown as App;
}

describe('scanBacklinks', () => {
  // What Copy link to selection writes: the name without its extension as the text, and the path encoded. A note
  // holding only this never contains the raw file name `Sample Book.epub`.
  const copied =
    'From the book: [Sample Book](obsidian://orbis-nav?file=books%2FSample%20Book.epub&cfi=epubcfi(%2F6%2F4!%2F4))';

  it('finds a note whose only link is a copied deep link, for a book with a space in its name', async () => {
    const found = await scanBacklinks('books/Sample Book.epub', vaultOf({ 'Reading.md': copied }));
    expect(found.map((n) => n.notePath)).toEqual(['Reading.md']);
  });

  it('does not find a deep link to a different book', async () => {
    const found = await scanBacklinks('books/Other Book.epub', vaultOf({ 'Reading.md': copied }));
    expect(found).toEqual([]);
  });
});

describe('readProgressJson', () => {
  const appWith = (text: string): App =>
    ({ vault: { adapter: { exists: async () => true, read: async () => text } } }) as unknown as App;

  // Every caller reads fields off the result, so anything but an object would throw where they do.
  it.each(['null', '42', '[1, 2]', '"text"', '{ not json'])('reads %s as an empty object', async (text) => {
    expect(await readProgressJson(appWith(text), 'x.orbis')).toEqual({});
  });

  it('reads an object as itself', async () => {
    expect(await readProgressJson(appWith('{"version":1}'), 'x.orbis')).toEqual({ version: 1 });
  });
});
