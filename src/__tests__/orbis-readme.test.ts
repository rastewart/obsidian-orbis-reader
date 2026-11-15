// Every `!orbis-data` folder Orbis makes explains itself, and the explanation is kept current.

import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { ensureDataFolderAt } from '../orbis-io';
import { readmeContent, writeFolderReadme } from '../orbis-readme';

function vault(existing: Record<string, string> = {}, folders: string[] = []) {
  const files = new Map(Object.entries(existing));
  const dirs = new Set(folders);
  const app = {
    vault: {
      adapter: {
        exists: async (p: string) => files.has(p) || dirs.has(p),
        read: async (p: string) => files.get(p) ?? '',
        write: async (p: string, text: string) => void files.set(p, text),
        mkdir: async (p: string) => void dirs.add(p),
      },
    },
  } as unknown as App;
  return { app, files, dirs };
}

const README = 'Books/!orbis-data/!readme.md';

describe('ensureDataFolderAt', () => {
  it('writes the readme into a folder it makes', async () => {
    const { app, files, dirs } = vault();
    await ensureDataFolderAt(app, 'Books/!orbis-data');
    expect(dirs.has('Books/!orbis-data')).toBe(true);
    expect(files.get(README)).toBe(readmeContent());
  });

  // A folder that is already there is left alone: making folders is on every save's path, and the readme is
  // brought up to date where someone is looking — see `writeFolderReadme`.
  it('does not touch a folder that is already there', async () => {
    const { app, files } = vault({}, ['Books/!orbis-data']);
    await ensureDataFolderAt(app, 'Books/!orbis-data');
    expect(files.has(README)).toBe(false);
  });
});

describe('writeFolderReadme', () => {
  it('puts back a readme that was deleted', async () => {
    const { app, files } = vault({}, ['Books/!orbis-data']);
    await writeFolderReadme(app, 'Books/!orbis-data');
    expect(files.get(README)).toBe(readmeContent());
  });

  it('rewrites a readme that was changed', async () => {
    const { app, files } = vault({ [README]: `${readmeContent()}\nA line of my own.\n` }, ['Books/!orbis-data']);
    await writeFolderReadme(app, 'Books/!orbis-data');
    expect(files.get(README)).toBe(readmeContent());
  });
});
