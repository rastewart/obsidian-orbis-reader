import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { hasSavedContentFor } from '../markdown-epub';
import { progressFilePathFor, progressFolderPathFor } from '../progress';

/**
 * **The question this answers is "would overwriting this book destroy annotations?"**, and the annotations live in
 * `!orbis-data/`, not beside the book.
 *
 * Asking about the wrong path throws nothing and logs nothing: the path simply does not exist, so every book looks
 * unannotated. The overwrite confirm shows its plain wording where it means to warn, and the folder conversion
 * counts zero annotated books however many there are. A guard that always says "nothing to lose" is worse than no
 * guard, because the dialog it feeds goes on looking like it checked.
 *
 * So what is asserted here is the PATH it asks about, not just its answer. A test over the answer alone passes
 * against a wrong path too — the file is missing either way.
 */
const fakeApp = (files: Record<string, string>): { app: App; asked: string[] } => {
  const asked: string[] = [];
  const app = {
    vault: {
      adapter: {
        exists: (p: string) => {
          asked.push(p);
          return Promise.resolve(p in files);
        },
        read: (p: string) => Promise.resolve(files[p] ?? ''),
      },
    },
  } as unknown as App;
  return { app, asked };
};

const ANNOTATED = JSON.stringify({ highlights: [{ id: 'a' }], notes: [], bookmarks: [] });

describe('progress path helpers', () => {
  it('puts a book in the !orbis-data folder beside it', () => {
    expect(progressFolderPathFor('fixtures/Crime.epub')).toBe('fixtures/!orbis-data');
    expect(progressFilePathFor('fixtures/Crime.epub')).toBe('fixtures/!orbis-data/Crime.epub.orbis');
  });

  it('handles a book at the vault root', () => {
    expect(progressFolderPathFor('Crime.epub')).toBe('!orbis-data');
    expect(progressFilePathFor('Crime.epub')).toBe('!orbis-data/Crime.epub.orbis');
  });

  it('keeps the whole file name, dots and extension included', () => {
    // `My Book v1.2.epub` is one book with dots in its name, and its sidecars are named from all of it — the same
    // reading `readSidecar` takes from the other end, and what keeps `My Book v1.2.azw3` beside it apart.
    expect(progressFilePathFor('books/My Book v1.2.epub')).toBe('books/!orbis-data/My Book v1.2.epub.orbis');
  });
});

describe('hasSavedContentFor', () => {
  it('looks inside !orbis-data, not beside the book', async () => {
    const { app, asked } = fakeApp({});
    await hasSavedContentFor(app, 'fixtures/Crime.epub');
    // The assertion that fails if it asks beside the book, for `fixtures/Crime.orbis`.
    expect(asked).toStrictEqual(['fixtures/!orbis-data/Crime.epub.orbis']);
  });

  it('finds annotations where they really live', async () => {
    const { app } = fakeApp({ 'fixtures/!orbis-data/Crime.epub.orbis': ANNOTATED });
    await expect(hasSavedContentFor(app, 'fixtures/Crime.epub')).resolves.toBe(true);
  });

  it('says no when the book has a data file holding nothing', async () => {
    const empty = JSON.stringify({ highlights: [], notes: [], bookmarks: [] });
    const { app } = fakeApp({ 'fixtures/!orbis-data/Crime.epub.orbis': empty });
    await expect(hasSavedContentFor(app, 'fixtures/Crime.epub')).resolves.toBe(false);
  });

  it('says no rather than throwing when the data file is unreadable', async () => {
    const { app } = fakeApp({ 'fixtures/!orbis-data/Crime.epub.orbis': 'not json' });
    await expect(hasSavedContentFor(app, 'fixtures/Crime.epub')).resolves.toBe(false);
  });
});
