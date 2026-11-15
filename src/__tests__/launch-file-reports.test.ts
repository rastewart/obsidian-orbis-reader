// While the vault loads, Obsidian reports every file already in it as created. On Android that was still going on
// when Orbis started, and two watchers took the reports for news: the sync manager scanned every sync file, and the
// book watcher read every `.orbis` and rebuilt every book, while a book reopened at launch waited behind them for its
// own few files — about six seconds. Both now ignore reports until the workspace is ready; the scan at load and the
// book catch-up do that work once, after it.

import { TFile } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchBookFiles } from '../reader/orbis-file-watch';
import { SyncManager } from '../sync/manager';
import type { SyncStore } from '../sync/store';

const rebuilt = vi.hoisted(() => [] as string[]);
vi.mock('../book-marks-store', async (load) => ({
  ...(await load<object>()),
  rebuildBookFromDevices: async (_app: unknown, book: { path: string }) => {
    rebuilt.push(book.path);
    return book.path === 'Books/Changed.epub';
  },
}));

const DEVICE = 'thisdevice01';

type Handler = (file: { path: string; name: string }) => void;

/** An app whose vault reports files, and whose workspace becomes ready when the test says so. */
function fakeApp(paths: string[]) {
  const handlers: Record<string, Handler[]> = {};
  const ready: Array<() => void> = [];
  const reads: string[] = [];
  const file = (path: string): TFile => Object.assign(new TFile(), { path, name: path.split('/').pop() ?? path });
  const app = {
    vault: {
      on: (name: string, fn: Handler) => {
        (handlers[name] ??= []).push(fn);
        return {};
      },
      getFiles: () => paths.map(file),
      getAbstractFileByPath: (path: string) => (paths.includes(path) ? file(path) : null),
      adapter: {
        read: async (path: string) => {
          reads.push(path);
          return '{}';
        },
      },
    },
    workspace: {
      layoutReady: false,
      onLayoutReady: (fn: () => void) => ready.push(fn),
      trigger: () => {},
    },
    loadLocalStorage: () => DEVICE,
    saveLocalStorage: () => {},
  };
  return {
    app,
    reads,
    report: (name: string, path: string) => {
      for (const fn of handlers[name] ?? []) fn({ path, name: path.split('/').pop() ?? path });
    },
    becomeReady: () => {
      app.workspace.layoutReady = true;
      for (const fn of ready) fn();
    },
  };
}

describe('the sync manager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function manager(vault: ReturnType<typeof fakeApp>) {
    const lines: string[] = [];
    const sync = new SyncManager({
      app: vault.app as never,
      store: {} as SyncStore,
      deviceId: () => DEVICE,
      deviceName: (id) => id,
      enabled: () => true,
      debug: (message) => lines.push(message),
    });
    sync.watch(
      () => {},
      () => {}
    );
    return lines;
  }

  it('takes no sync file the vault reports while it loads for one that arrived', async () => {
    const vault = fakeApp([]);
    const lines = manager(vault);
    vault.report('create', 'Orbis sync/orbis-sync.fields.title.otherdevice1.json');
    await vi.advanceTimersByTimeAsync(5000);
    expect(lines.filter((l) => l.includes('a file arrived'))).toEqual([]);
  });

  it('scans when a sync file arrives once the workspace is ready', async () => {
    const vault = fakeApp([]);
    const lines = manager(vault);
    vault.becomeReady();
    vault.report('create', 'Orbis sync/orbis-sync.fields.title.otherdevice1.json');
    await vi.advanceTimersByTimeAsync(5000);
    expect(lines.filter((l) => l.startsWith('scan (a file arrived)'))).toHaveLength(1);
  });
});

describe('watchBookFiles', () => {
  beforeEach(() => {
    rebuilt.length = 0;
  });

  const VAULT = [
    'Books/Changed.epub',
    'Books/!orbis-data/Changed.epub.orbis',
    'Books/!orbis-data/Changed.epub.marks.otherdevice1.json',
    'Books/Quiet.epub',
    'Books/!orbis-data/Quiet.epub.orbis',
    'Books/MarksOnly.epub',
    'Books/!orbis-data/MarksOnly.epub.marks.otherdevice2.json',
    'Books/MineOnly.epub',
    'Books/!orbis-data/MineOnly.epub.marks.thisdevice01.json',
    'Notes/A note.md',
  ];

  function watched() {
    const vault = fakeApp(VAULT);
    const lines: string[] = [];
    watchBookFiles({ app: vault.app as never, registerEvent: () => {}, debug: (msg) => lines.push(msg) });
    return { vault, lines };
  }

  it('reads and rebuilds nothing for what the vault reports while it loads', async () => {
    const { vault } = watched();
    for (const path of VAULT) vault.report('create', path);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(vault.reads).toEqual([]);
    expect(rebuilt).toEqual([]);
  });

  it('catches up once the workspace is ready: every book with a .orbis or another device’s marks, one at a time', async () => {
    const { vault, lines } = watched();
    vault.becomeReady();
    await vi.waitFor(() => expect(lines.some((l) => l.startsWith('catch-up at launch'))).toBe(true));
    expect(rebuilt.sort()).toEqual(['Books/Changed.epub', 'Books/MarksOnly.epub', 'Books/Quiet.epub']);
    expect(lines.at(-1)).toMatch(/^catch-up at launch — 3 books with Orbis data, 1 rebuilt, in \d+ ms$/);
  });

  it('rebuilds a book when another device’s marks arrive once the workspace is ready', async () => {
    const { vault, lines } = watched();
    vault.becomeReady();
    await vi.waitFor(() => expect(lines.some((l) => l.startsWith('catch-up at launch'))).toBe(true));
    rebuilt.length = 0;
    vault.report('modify', 'Books/!orbis-data/MarksOnly.epub.marks.otherdevice2.json');
    await vi.waitFor(() => expect(rebuilt).toEqual(['Books/MarksOnly.epub']));
  });
});
