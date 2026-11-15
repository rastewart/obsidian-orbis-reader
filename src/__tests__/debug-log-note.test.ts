// The debug log copied into notes: one note per launch, and the lines a hung launch never wrote recovered into the
// next launch's note rather than appended to the old one — a note two launches write to is a sync conflict.

import type { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logToLibrary, setWritesToNote } from '../reader/DebugLog';

type Disk = { files: Map<string, string>; folders: Set<string>; keys: Map<string, unknown> };

/** One launch of Obsidian: a fresh `app` over the same vault and the same local storage. `stuck` writes never finish. */
function launch(disk: Disk, stuck = false): App {
  const never = new Promise<void>(() => {});
  return {
    loadLocalStorage: (key: string) => (disk.keys.has(key) ? disk.keys.get(key) : null),
    saveLocalStorage: (key: string, value: unknown) => {
      if (value) disk.keys.set(key, value);
      else disk.keys.delete(key);
    },
    vault: {
      adapter: {
        exists: async (path: string) => disk.files.has(path) || disk.folders.has(path),
        mkdir: async (path: string) => void disk.folders.add(path),
        write: (path: string, text: string) => (stuck ? never : Promise.resolve(void disk.files.set(path, text))),
        append: (path: string, text: string) =>
          stuck ? never : Promise.resolve(void disk.files.set(path, (disk.files.get(path) ?? '') + text)),
      },
    },
  } as unknown as App;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const log = (app: App, msg: string) => logToLibrary({ app }, msg);

describe('the debug log in notes', () => {
  let disk: Disk;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0, 0));
    disk = { files: new Map(), folders: new Set(), keys: new Map([['orbis-dbg-library', '1']]) };
  });
  afterEach(() => vi.useRealTimers());

  it('writes nothing while the switch is off', async () => {
    log(launch(disk), 'a line');
    await settle();
    expect(disk.files.size).toBe(0);
  });

  it("puts a launch's lines in one note of its own, in the folder", async () => {
    const app = launch(disk);
    setWritesToNote(app, true);
    log(app, 'first');
    await settle();
    log(app, 'second');
    await settle();
    expect([...disk.files.keys()]).toEqual(['Orbis debug logs/desktop 2026-10-11 09-00-00.md']);
    const text = [...disk.files.values()][0];
    expect(text.startsWith('~~~log\n')).toBe(true);
    expect(text).toMatch(/first\n.*second\n$/);
  });

  it('starts a new note on the next launch and recovers what a stuck launch never wrote', async () => {
    const stuck = launch(disk, true);
    setWritesToNote(stuck, true);
    log(stuck, 'before the hang');
    log(stuck, 'the last line');
    await settle();
    expect(disk.files.size).toBe(0);

    vi.setSystemTime(new Date(2026, 9, 11, 9, 5, 0));
    const next = launch(disk);
    log(next, 'after the restart');
    await settle();

    expect([...disk.files.keys()]).toEqual(['Orbis debug logs/desktop 2026-10-11 09-05-00.md']);
    const text = [...disk.files.values()][0];
    expect(text).toContain('never reached Orbis debug logs/desktop 2026-10-11 09-00-00.md:');
    expect(text.indexOf('the last line')).toBeLessThan(text.indexOf('This launch:'));
    expect(text.indexOf('This launch:')).toBeLessThan(text.indexOf('after the restart'));
    // Recovered once: nothing is left to recover a second time.
    expect(disk.keys.has('orbis-dbg-note-unwritten')).toBe(false);
  });
});
