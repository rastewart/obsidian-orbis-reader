// A settings file that cannot be read is set aside, never saved over, and the backup put back in its place.
// Without this, Orbis started from its defaults and saved them over the damaged file.

import type { Plugin } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_FILE, keepBackup, readSettingsFile } from '../settings-recovery';

const notices = vi.hoisted(() => [] as unknown[]);
vi.mock('obsidian', async (load) => ({
  ...(await load<object>()),
  Notice: class {
    constructor(message: unknown) {
      notices.push(message);
    }
  },
}));

const DIR = '.obsidian/plugins/orbis-reader';
const DATA = `${DIR}/data.json`;
const BACKUP = `${DIR}/${BACKUP_FILE}`;

/** A plugin over an in-memory folder, whose `loadData` answers as Obsidian's does: null for a file it cannot parse. */
function fakePlugin(files: Map<string, string>): Plugin {
  const adapter = {
    exists: async (path: string) => files.has(path),
    read: async (path: string) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`not found: ${path}`);
      return text;
    },
    write: async (path: string, text: string) => void files.set(path, text),
    rename: async (from: string, to: string) => {
      files.set(to, files.get(from) as string);
      files.delete(from);
    },
  };
  const loadData = async (): Promise<unknown> => {
    try {
      return JSON.parse(files.get(DATA) ?? 'null') as unknown;
    } catch {
      return null;
    }
  };
  return {
    app: { vault: { adapter, configDir: '.obsidian' } },
    manifest: { dir: DIR, id: 'orbis-reader' },
    loadData,
  } as unknown as Plugin;
}

const setAside = (files: Map<string, string>) => [...files.keys()].filter((p) => /data\.unreadable-.+\.json$/.test(p));

beforeEach(() => {
  notices.length = 0;
});

describe('readSettingsFile', () => {
  it('reads a good file, and keeps it as the backup', async () => {
    const files = new Map([[DATA, '{"a":1}']]);
    expect(await readSettingsFile(fakePlugin(files))).toEqual({ data: { a: 1 } });
    expect(JSON.parse(files.get(BACKUP) as string)).toEqual({ a: 1 });
  });

  it('answers null on a first run, with nothing set aside', async () => {
    const files = new Map<string, string>();
    expect(await readSettingsFile(fakePlugin(files))).toEqual({ data: null });
    expect([...files.keys()]).toEqual([]);
  });

  it('sets an unreadable file aside and restores the backup over it', async () => {
    const files = new Map([
      [DATA, '{"a":1, "b":'],
      [BACKUP, '{"a":1,"b":2}'],
    ]);
    const read = await readSettingsFile(fakePlugin(files));
    expect(read.data).toEqual({ a: 1, b: 2 });
    expect(JSON.parse(files.get(DATA) as string)).toEqual({ a: 1, b: 2 });
    expect(setAside(files).map((p) => files.get(p))).toEqual(['{"a":1, "b":']);
    expect(notices).toHaveLength(1);
    expect(read.note).toMatch(/backup restored/);
  });

  it('sets an unreadable file aside and starts from the defaults when there is no backup', async () => {
    const files = new Map([[DATA, 'not json']]);
    const read = await readSettingsFile(fakePlugin(files));
    expect(read.data).toBeNull();
    expect(files.has(DATA)).toBe(false);
    expect(setAside(files).map((p) => files.get(p))).toEqual(['not json']);
    expect(notices).toHaveLength(1);
  });

  it('treats a file holding something other than an object as unreadable', async () => {
    const files = new Map([
      [DATA, '"x"'],
      [BACKUP, '{"a":1}'],
    ]);
    expect((await readSettingsFile(fakePlugin(files))).data).toEqual({ a: 1 });
    expect(setAside(files)).toHaveLength(1);
  });
});

describe('keepBackup', () => {
  it('writes the backup only when it differs', async () => {
    const files = new Map<string, string>();
    const plugin = fakePlugin(files);
    await keepBackup(plugin, { a: 1 });
    const written = files.get(BACKUP);
    await keepBackup(plugin, { a: 1 });
    expect(files.get(BACKUP)).toBe(written);
    await keepBackup(plugin, { a: 2 });
    expect(JSON.parse(files.get(BACKUP) as string)).toEqual({ a: 2 });
  });
});
