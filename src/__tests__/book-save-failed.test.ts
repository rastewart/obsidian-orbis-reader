// A book's marks and notes that could not be saved are said to be unsaved, once per book.
// Before, the failure went only to the debug log, and the mark looked saved until the book was opened again.

import type { App, TFile } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBookmarks } from '../progress';

const notices = vi.hoisted(() => [] as unknown[]);
vi.mock('obsidian', async (load) => ({
  ...(await load<object>()),
  Notice: class {
    constructor(message: unknown) {
      notices.push(message);
    }
  },
}));

/** A vault whose every write fails, as a full disk or a locked file does. */
function failingApp(): App {
  const storage = new Map<string, string>([['orbis-device-id', 'mac']]);
  return {
    vault: {
      adapter: {
        exists: async () => false,
        read: async () => {
          throw new Error('not found');
        },
        write: async () => {
          throw new Error('disk full');
        },
        mkdir: async () => {},
        list: async () => ({ files: [], folders: [] }),
      },
      getFiles: () => [],
    },
    workspace: { trigger: () => {} },
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: string) => void storage.set(key, value),
  } as unknown as App;
}

const book = (name: string) =>
  ({ basename: name, path: `Books/${name}.epub`, parent: { path: 'Books' } }) as unknown as TFile;

beforeEach(() => {
  notices.length = 0;
});

describe('a save of a book that fails', () => {
  it('is said once per book, and still rejects for the caller’s log', async () => {
    const app = failingApp();
    const bookmark = { id: 'b', cfi: 'c', label: 'b', createdAt: 1 };
    await expect(saveBookmarks(app, book('Unsaved One'), [bookmark])).rejects.toThrow('disk full');
    await expect(saveBookmarks(app, book('Unsaved One'), [bookmark])).rejects.toThrow('disk full');
    await expect(saveBookmarks(app, book('Unsaved Two'), [bookmark])).rejects.toThrow('disk full');
    expect(notices).toHaveLength(2);
  });
});
