// The store, over a fake vault. Two things here are worth a test rather than a device: that discovery does not depend
// on the folder, and that a write which MOVES a file sends only the copy it moved to the trash.

import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import type { SyncRecord } from '../sync/records';
import { folderToJoin, VaultSyncStore } from '../sync/store';

/** A vault as a flat map of path → contents, with an index that can be told to be cold. */
function fakeVault(files: Record<string, string>, opts: { indexed?: boolean } = {}) {
  const contents = new Map(Object.entries(files));
  const indexed = opts.indexed !== false;
  const trashed: string[] = [];
  const deleted: string[] = [];
  const made: string[] = [];
  const app = {
    fileManager: {
      trashFile: (file: { path: string }) => {
        trashed.push(file.path);
        contents.delete(file.path);
        return Promise.resolve();
      },
    },
    vault: {
      getFileByPath: (path: string) => (indexed && contents.has(path) ? { path } : null),
      getFiles: () =>
        indexed ? [...contents.keys()].map((path) => ({ path, name: path.slice(path.lastIndexOf('/') + 1) })) : [],
      adapter: {
        exists: (path: string) =>
          Promise.resolve(
            made.includes(path) || [...contents.keys()].some((p) => p === path || p.startsWith(`${path}/`))
          ),
        list: (folder: string) =>
          Promise.resolve({
            folders: [],
            files: [...contents.keys()].filter((p) => p.slice(0, p.lastIndexOf('/')) === folder),
          }),
        read: (path: string) => Promise.resolve(contents.get(path) ?? ''),
        write: (path: string, text: string) => {
          contents.set(path, text);
          return Promise.resolve();
        },
        mkdir: (path: string) => {
          made.push(path);
          return Promise.resolve();
        },
        remove: (path: string) => {
          deleted.push(path);
          contents.delete(path);
          return Promise.resolve();
        },
      },
    },
  } as unknown as App;
  return { app, contents, trashed, deleted, made };
}

const record = (id: string, device: string): SyncRecord<{ id: string; name: string }> => ({
  id,
  type: 'dashboards',
  device,
  version: { clock: 1, at: '2026-08-26T10:00:00.000Z' },
  deleted: false,
  item: { id, name: 'Shelf' },
});

const json = (id: string, device: string): string => JSON.stringify(record(id, device));

describe('finding copies', () => {
  it('reads the configured folder even when the index is cold — a phone at load', async () => {
    const { app } = fakeVault(
      { '!orbis-data/sync/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac') },
      {
        indexed: false,
      }
    );
    const store = new VaultSyncStore(app, () => '');
    const found = await store.list('dashboards');
    expect(found).toMatchObject([{ itemId: 'd1', deviceId: 'mac' }]);
  });

  it('finds a copy that is nowhere near the configured folder', async () => {
    const { app } = fakeVault({ 'Somewhere/Else/orbis-sync.dashboards.d1.phone.json': json('d1', 'phone') });
    const store = new VaultSyncStore(app, () => 'Orbis/Sync');
    expect(await store.list('dashboards')).toMatchObject([{ itemId: 'd1', deviceId: 'phone' }]);
  });

  it('answers with one type, and ignores everything that is not ours', async () => {
    const { app } = fakeVault({
      'a/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac'),
      'a/orbis-sync.collections.c1.mac.json': json('c1', 'mac'),
      'a/Sample.location.mac.json': '{"cfi":"x"}',
      'a/package.json': '{}',
      'a/note.md': '# hello',
    });
    const store = new VaultSyncStore(app, () => 'a');
    expect((await store.list('dashboards')).map((c) => c.itemId)).toEqual(['d1']);
    expect((await store.list('collections')).map((c) => c.itemId)).toEqual(['c1']);
  });

  it('skips a half-written file instead of failing the scan', async () => {
    const { app } = fakeVault({
      'a/orbis-sync.dashboards.d1.mac.json': '{"id": "d1", "vers',
      'a/orbis-sync.dashboards.d2.mac.json': json('d2', 'mac'),
    });
    const store = new VaultSyncStore(app, () => 'a');
    expect((await store.list('dashboards')).map((c) => c.itemId)).toEqual(['d2']);
  });

  it('skips a file that parses but says nothing — a JSON file that happens to be named like ours', async () => {
    const { app } = fakeVault({ 'a/orbis-sync.dashboards.d1.mac.json': '{"hello": true}' });
    const store = new VaultSyncStore(app, () => 'a');
    expect(await store.list('dashboards')).toEqual([]);
  });

  /** An adopted record is published again under its own `id`, so a file that names one item and carries another
   *  would choose where this device writes — and an id with a `..` in it chooses a folder outside the vault. */
  it('skips a copy whose record is not the item its name says', async () => {
    const { app } = fakeVault({
      'a/orbis-sync.dashboards.d1.phone.json': json('../../../escape', 'phone'),
      'a/orbis-sync.dashboards.d2.phone.json': json('d3', 'phone'),
      'a/orbis-sync.dashboards.d4.phone.json': json('d4', 'phone'),
    });
    const store = new VaultSyncStore(app, () => 'a');
    expect((await store.list('dashboards')).map((c) => c.itemId)).toEqual(['d4']);
  });
});

describe('one look per scan', () => {
  /** The fake vault, counting how often the folder is listed. */
  function counted(files: Record<string, string>) {
    const v = fakeVault(files);
    const adapter = (v.app.vault as unknown as { adapter: { list: (f: string) => Promise<unknown> } }).adapter;
    const list = adapter.list;
    let lists = 0;
    adapter.list = (folder: string) => {
      lists++;
      return list(folder);
    };
    return { ...v, lists: () => lists };
  }
  const files = {
    '!orbis-data/sync/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac'),
    '!orbis-data/sync/orbis-sync.presets.p1.mac.json': JSON.stringify({ ...record('p1', 'mac'), type: 'presets' }),
  };

  // Measured: one listing of the folder per TYPE was most of a scan's time, and the folder does not change between types.
  it('lists the folder once for every type in a scan', async () => {
    const { app, lists } = counted(files);
    const store = new VaultSyncStore(app, () => '');
    store.beginScan();
    const dashboards = await store.list('dashboards');
    const presets = await store.list('presets');
    store.endScan();
    expect(lists()).toBe(1);
    expect(dashboards.map((c) => c.itemId)).toEqual(['d1']);
    expect(presets.map((c) => c.itemId)).toEqual(['p1']);
  });

  // The dev status command lists outside any scan, and must see the folder as it is now.
  it('looks afresh outside a scan, and in the next scan', async () => {
    const { app, contents, lists } = counted(files);
    const store = new VaultSyncStore(app, () => '');
    store.beginScan();
    await store.list('dashboards');
    store.endScan();
    contents.set('!orbis-data/sync/orbis-sync.dashboards.d2.phone.json', json('d2', 'phone'));
    expect((await store.list('dashboards')).map((c) => c.itemId).sort()).toEqual(['d1', 'd2']);
    expect(lists()).toBe(2);
  });
});

describe('reading a type’s copies', () => {
  // Measured on Android: ~3 ms a file, nearly all of it waiting, one file after another — a second per scan.
  it('reads them overlapping, and still skips one that will not parse', async () => {
    const files: Record<string, string> = { '!orbis-data/sync/orbis-sync.dashboards.bad.mac.json': '{ half a fi' };
    for (let n = 0; n < 40; n++) files[`!orbis-data/sync/orbis-sync.dashboards.d${n}.mac.json`] = json(`d${n}`, 'mac');
    const { app, contents } = fakeVault(files);
    const adapter = (app.vault as unknown as { adapter: { read: (p: string) => Promise<string> } }).adapter;
    let inFlight = 0;
    let most = 0;
    adapter.read = async (path: string) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return contents.get(path) ?? '';
    };
    const copies = await new VaultSyncStore(app, () => '').list('dashboards');
    expect(copies).toHaveLength(40);
    expect(most).toBeGreaterThan(1);
  });
});

describe('publishing', () => {
  it('writes into the configured folder, making it if it is not there', async () => {
    const { app, contents, made } = fakeVault({});
    const store = new VaultSyncStore(app, () => 'Orbis/Sync');
    await store.write('dashboards', 'd1', 'mac', record('d1', 'mac'));
    expect([...contents.keys()]).toEqual(['Orbis/Sync/orbis-sync.dashboards.d1.mac.json']);
    expect(made).toContain('Orbis/Sync');
  });

  it('refuses an id that would make the file name a path', async () => {
    const { app, contents } = fakeVault({});
    const store = new VaultSyncStore(app, () => 'Orbis/Sync');
    for (const id of ['../../x', 'a/b', 'a\\b', '']) {
      await expect(store.write('dashboards', id, 'mac', record(id, 'mac'))).rejects.toThrow();
    }
    expect([...contents.keys()]).toEqual([]);
  });

  it('moves our own copy when the folder setting changed, and trashes only that one', async () => {
    const { app, contents, trashed, deleted } = fakeVault({
      'Old/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac'),
      'Old/orbis-sync.dashboards.d1.phone.json': json('d1', 'phone'),
    });
    let folder = 'Old';
    const store = new VaultSyncStore(app, () => folder);
    await store.list('dashboards'); // the scan reads before it writes — that read is what finds the stray
    folder = 'New';
    await store.write('dashboards', 'd1', 'mac', record('d1', 'mac'));
    expect([...contents.keys()].sort()).toEqual([
      'New/orbis-sync.dashboards.d1.mac.json',
      'Old/orbis-sync.dashboards.d1.phone.json', // another device's copy, left where it is
    ]);
    expect(trashed).toEqual(['Old/orbis-sync.dashboards.d1.mac.json']);
    expect(deleted).toEqual([]); // to the trash, as the reader's Deleted files setting says — never deleted outright
  });

  /**
   * **A stray is found by name anywhere, so it can be a copy kept on purpose** — a backup of the sync folder inside the
   * vault. It used to be deleted beyond recovery; now it goes where the reader's deleted
   * files go, and one Obsidian has not indexed is left for a later scan rather than removed unseen.
   */
  it('leaves a stray Obsidian has not indexed, deleting nothing', async () => {
    const { app, contents, trashed, deleted } = fakeVault(
      {
        'Backup/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac'),
        'a/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac'),
      },
      { indexed: false }
    );
    const store = new VaultSyncStore(app, () => 'a');
    await store.list('dashboards');
    // A cold index lists only the configured folder, so give the scan the backup copy as the index would have.
    (store as unknown as { seen: Map<string, string[]> }).seen.set('orbis-sync.dashboards.d1.mac.json', [
      'Backup/orbis-sync.dashboards.d1.mac.json',
      'a/orbis-sync.dashboards.d1.mac.json',
    ]);
    await store.write('dashboards', 'd1', 'mac', record('d1', 'mac'));
    expect(trashed).toEqual([]);
    expect(deleted).toEqual([]);
    expect(contents.has('Backup/orbis-sync.dashboards.d1.mac.json')).toBe(true);
  });

  it('trashes nothing when the copy is already where it belongs', async () => {
    const { app, trashed } = fakeVault({ 'a/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac') });
    const store = new VaultSyncStore(app, () => 'a');
    await store.list('dashboards');
    await store.write('dashboards', 'd1', 'mac', record('d1', 'mac'));
    expect(trashed).toEqual([]);
  });

  it('does not chase a copy it has not seen — a write with no read before it only writes', async () => {
    const { app, contents, trashed } = fakeVault({ 'Old/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac') });
    const store = new VaultSyncStore(app, () => 'New');
    await store.write('dashboards', 'd1', 'mac', record('d1', 'mac'));
    expect(trashed).toEqual([]);
    expect([...contents.keys()].sort()).toEqual([
      'New/orbis-sync.dashboards.d1.mac.json',
      'Old/orbis-sync.dashboards.d1.mac.json',
    ]);
    // And the next scan tidies it: the read finds both, the write keeps the configured one.
    await store.list('dashboards');
    await store.write('dashboards', 'd1', 'mac', record('d1', 'mac'));
    expect([...contents.keys()]).toEqual(['New/orbis-sync.dashboards.d1.mac.json']);
  });
});

describe('misplaced copies', () => {
  /**
   * The fault this answers: when the folder changes after one dashboard has been published, that one can stay in
   * `!orbis-data/sync` while everything else moves. It is up to date, so the merge says "nothing to do" — and "up to
   * date" and "in the right place" are different questions.
   */
  it('names our own copies that are not in the configured folder', async () => {
    const { app } = fakeVault({
      'Old/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac'),
      'New/orbis-sync.dashboards.d2.mac.json': json('d2', 'mac'),
      'Old/orbis-sync.dashboards.d3.phone.json': json('d3', 'phone'),
      'New/orbis-sync.collections.c1.mac.json': json('c1', 'mac'),
    });
    const store = new VaultSyncStore(app, () => 'New');
    await store.list('dashboards'); // misplaced answers from what the scan just read
    expect(await store.misplaced('dashboards', 'mac')).toEqual(['d1']); // not d2 (right place), not d3 (not ours)
    expect(await store.misplaced('collections', 'mac')).toEqual([]);
  });

  it('says nothing before a scan has read anything', async () => {
    const { app } = fakeVault({ 'Old/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac') });
    expect(await new VaultSyncStore(app, () => 'New').misplaced('dashboards', 'mac')).toEqual([]);
  });

  it('forgets a path that has gone, so a later write does not chase it', async () => {
    const { app, contents, trashed } = fakeVault({ 'Old/orbis-sync.dashboards.d1.mac.json': json('d1', 'mac') });
    const store = new VaultSyncStore(app, () => 'New');
    await store.list('dashboards');
    contents.delete('Old/orbis-sync.dashboards.d1.mac.json'); // a sync tool took it away
    await store.list('dashboards');
    await store.write('dashboards', 'd1', 'mac', record('d1', 'mac'));
    expect(trashed).toEqual([]);
  });
});

// Found writing the Sync test page: a device set up with configuration left off, then turned on from the Devices page,
// was never asked where files go and wrote to the default folder beside the vault's.
describe('turning publishing on', () => {
  it("joins the vault's folder when this device has none of its own", () => {
    expect(folderToJoin(undefined, '', 'Shared/sync')).toBe('Shared/sync');
    expect(folderToJoin(undefined, undefined, 'Shared/sync')).toBe('Shared/sync');
  });

  it('keeps a folder this device already chose, however many files sit elsewhere', () => {
    expect(folderToJoin(undefined, 'Mine', 'Shared/sync')).toBeUndefined();
  });

  it("takes the setup dialog's answer over anything the vault holds", () => {
    expect(folderToJoin('Answered', '', 'Shared/sync')).toBe('Answered');
  });

  it('changes nothing in a vault where nothing is published yet', () => {
    expect(folderToJoin(undefined, '', null)).toBeUndefined();
  });
});
