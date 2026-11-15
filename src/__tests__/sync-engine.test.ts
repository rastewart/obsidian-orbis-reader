// The scan loop, over a fake vault. The two-device simulation in `sync-records.test.ts` proved the arithmetic; this
// proves the loop that applies it — including the things only a loop can get wrong: adopting in one batch, writing
// one file per item, and going quiet when there is nothing to do.

import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import { describeType } from '../sync/diagnose';
import { type SyncBinding, scanType } from '../sync/engine';
import { compareVersions, type SyncRecord } from '../sync/records';
import type { StoredCopy, SyncStore } from '../sync/store';

/** A vault that is a map: `type/itemId/deviceId` → record. */
class FakeStore implements SyncStore {
  readonly files = new Map<string, SyncRecord<unknown>>();
  writes = 0;
  /** Item ids this store says are in the wrong place — what a folder change produces. */
  wrongPlace = new Set<string>();
  /** Item ids whose write throws, for the one thing a scan must survive. */
  refuse = new Set<string>();

  misplaced(_type: string, _deviceId: string): Promise<string[]> {
    return Promise.resolve([...this.wrongPlace]);
  }

  async list<T>(type: string): Promise<StoredCopy<T>[]> {
    const out: StoredCopy<T>[] = [];
    for (const [key, record] of this.files) {
      const [t, itemId, deviceId] = key.split('/');
      if (t === type) out.push({ itemId, deviceId, record: record as SyncRecord<T> });
    }
    return Promise.resolve(out);
  }

  async write<T>(type: string, itemId: string, deviceId: string, record: SyncRecord<T>): Promise<void> {
    if (this.refuse.has(itemId)) throw new Error(`cannot write ${itemId}`);
    this.files.set(`${type}/${itemId}/${deviceId}`, record);
    this.wrongPlace.delete(itemId); // publishing is what moves it
    this.writes += 1;
    return Promise.resolve();
  }
}

interface Dash {
  name: string;
}

/** A device's `data.json`, and the binding that describes it to the engine. */
class Held {
  readonly items = new Map<string, SyncRecord<Dash>>();
  adoptCalls = 0;

  binding(): SyncBinding<Dash> {
    return {
      type: 'dashboards',
      held: () => [...this.items.values()],
      adopt: (records) => {
        this.adoptCalls += 1;
        for (const r of records) this.items.set(r.id, r);
        return Promise.resolve();
      },
    };
  }

  put(id: string, device: string, clock: number, at: string, name?: string): void {
    this.items.set(id, {
      id,
      type: 'dashboards',
      device,
      version: { clock, at },
      deleted: name === undefined,
      item: name === undefined ? undefined : { name },
    });
  }

  name(id: string): string | undefined {
    const r = this.items.get(id);
    return r?.deleted ? undefined : r?.item?.name;
  }
}

function fakeVault(): App {
  const keys = new Map<string, unknown>();
  return {
    loadLocalStorage: (key: string) => (keys.has(key) ? keys.get(key) : null),
    saveLocalStorage: (key: string, value: unknown) => {
      if (value) keys.set(key, value);
      else keys.delete(key);
    },
  } as unknown as App;
}

const T1 = '2026-08-25T10:00:00.000Z';
const T2 = '2026-08-25T11:00:00.000Z';

describe('scanType', () => {
  beforeEach(() => setDeviceStoreApp(fakeVault()));

  it('publishes what this device holds and nobody has', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'Shelf');
    const result = await scanType(store, mac.binding(), 'mac');
    expect(result).toMatchObject({ adopted: 0, published: 1 });
    expect(store.files.get('dashboards/d1/mac')?.item).toEqual({ name: 'Shelf' });
  });

  it('adopts what another device published, and publishes it as ours verbatim', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'Shelf');
    await scanType(store, mac.binding(), 'mac');

    const phone = new Held();
    const result = await scanType(store, phone.binding(), 'phone');
    // `published` counts files written, and publishing the adopted copy as ours is a write like any other.
    expect(result).toMatchObject({ adopted: 1, published: 1, adoptedIds: ['d1'] });
    expect(phone.name('d1')).toBe('Shelf');
    // Our own file now exists — and still names the Mac as the author.
    expect(store.files.get('dashboards/d1/phone')?.device).toBe('mac');
  });

  it('adopts everything that arrived in ONE call, so data.json is saved once', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'One');
    mac.put('d2', 'mac', 2, T1, 'Two');
    mac.put('d3', 'mac', 3, T1, 'Three');
    await scanType(store, mac.binding(), 'mac');

    const phone = new Held();
    await scanType(store, phone.binding(), 'phone');
    expect(phone.adoptCalls).toBe(1);
    expect([phone.name('d1'), phone.name('d2'), phone.name('d3')]).toEqual(['One', 'Two', 'Three']);
  });

  it('writes nothing when the vault already says what we say', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'Shelf');
    await scanType(store, mac.binding(), 'mac');
    store.writes = 0;
    const again = await scanType(store, mac.binding(), 'mac');
    expect(again).toMatchObject({ adopted: 0, published: 0 });
    expect(store.writes).toBe(0);
  });

  it('republishes when our own file is missing — the fire-and-forget write that never landed', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'Shelf');
    await scanType(store, mac.binding(), 'mac');
    store.files.delete('dashboards/d1/mac'); // the file that did not survive
    const result = await scanType(store, mac.binding(), 'mac');
    expect(result.published).toBe(1);
    expect(store.files.has('dashboards/d1/mac')).toBe(true);
  });

  it('carries a tombstone across, and it stays dead', async () => {
    const store = new FakeStore();
    const mac = new Held();
    const phone = new Held();
    mac.put('d1', 'mac', 1, T1, 'Shelf');
    await scanType(store, mac.binding(), 'mac');
    await scanType(store, phone.binding(), 'phone');
    mac.put('d1', 'mac', 2, T2); // deleted here
    await scanType(store, mac.binding(), 'mac');
    await scanType(store, phone.binding(), 'phone');
    expect(phone.name('d1')).toBeUndefined();
    // And a further scan does not resurrect it from the phone's own older memory.
    await scanType(store, phone.binding(), 'phone');
    await scanType(store, mac.binding(), 'mac');
    expect(mac.name('d1')).toBeUndefined();
  });

  it('lifts this device’s clock past everything it read', async () => {
    const store = new FakeStore();
    const mac = new Held();
    // Stamped a year from now, so no real wall clock can reach it — this has to come from the record.
    const future = '2027-08-25T10:00:00.000Z';
    mac.put('d1', 'mac', 0, future, 'Shelf');
    await scanType(store, mac.binding(), 'mac');

    const phone = new Held();
    await scanType(store, phone.binding(), 'phone');
    const { currentClock, nextVersion } = await import('../sync/clock');
    expect(currentClock().l).toBe(Date.parse(future));
    // And the phone's next edit sorts after the thing it was made on top of, which is the whole point.
    const mine = nextVersion(Date.now());
    expect(compareVersions(mine, { clock: 0, at: future }, 'phone', 'mac')).toBeGreaterThan(0);
  });

  it('leaves other types alone', async () => {
    const store = new FakeStore();
    store.files.set('collections/c1/mac', {
      id: 'c1',
      type: 'collections',
      device: 'mac',
      version: { clock: 1, at: T1 },
      deleted: false,
    });
    const phone = new Held();
    const result = await scanType(store, phone.binding(), 'phone');
    expect(result).toMatchObject({ adopted: 0, published: 0 });
  });

  /**
   * **A folder change makes every copy misplaced and none of them changed**, so the merge says "nothing to do" and
   * the files sit in the old folder until something edits them — which for most items is never.
   */
  it('republishes a settled item whose file is in the wrong folder', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'Shelf');
    await scanType(store, mac.binding(), 'mac');
    store.writes = 0;

    store.wrongPlace.add('d1'); // the reader changed the folder
    const moved = await scanType(store, mac.binding(), 'mac');
    expect(moved.published).toBe(1);
    // And once it has moved, the scan goes quiet again.
    const after = await scanType(store, mac.binding(), 'mac');
    expect(after).toMatchObject({ published: 0, failed: 0 });
  });

  it('keeps publishing the rest when one file will not be written', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'One');
    mac.put('d2', 'mac', 2, T1, 'Two');
    mac.put('d3', 'mac', 3, T1, 'Three');
    store.refuse.add('d1'); // the first one, so a loop that stops on failure loses the other two

    const result = await scanType(store, mac.binding(), 'mac');
    expect(result).toMatchObject({ published: 2, failed: 1 });
    expect([...store.files.keys()].sort()).toEqual(['dashboards/d2/mac', 'dashboards/d3/mac']);

    // The next scan tries the one that failed again, which is what makes a lost write survivable.
    store.refuse.clear();
    expect(await scanType(store, mac.binding(), 'mac')).toMatchObject({ published: 1, failed: 0 });
  });

  it('two devices reach the same answer and then go quiet', async () => {
    const store = new FakeStore();
    const mac = new Held();
    const phone = new Held();
    mac.put('d1', 'mac', 1, T1, 'From the Mac');
    phone.put('d2', 'phone', 1, T1, 'From the phone');
    for (const [held, id] of [
      [mac, 'mac'],
      [phone, 'phone'],
      [mac, 'mac'],
      [phone, 'phone'],
    ] as const) {
      await scanType(store, held.binding(), id);
    }
    expect([mac.name('d1'), mac.name('d2')]).toEqual(['From the Mac', 'From the phone']);
    expect([phone.name('d1'), phone.name('d2')]).toEqual(['From the Mac', 'From the phone']);
    store.writes = 0;
    await scanType(store, mac.binding(), 'mac');
    await scanType(store, phone.binding(), 'phone');
    expect(store.writes).toBe(0);
  });
});

/**
 * The status command's half of the pair. Its whole value rests on one property — that looking changes nothing — so
 * that is what these assert, alongside the counts being the ones a scan would act on.
 */
describe('describeType', () => {
  beforeEach(() => setDeviceStoreApp(fakeVault()));

  it('reports what a scan would adopt and publish, and writes nothing', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'From the Mac');
    await scanType(store, mac.binding(), 'mac'); // the Mac has published; the phone has not seen it

    const phone = new Held();
    phone.put('d2', 'phone', 1, T1, 'From the phone');
    store.writes = 0;

    const report = await describeType(store, phone.binding(), 'phone');
    expect(report).toMatchObject({ type: 'dashboards', held: 1, ours: 0, theirs: 1, settled: 0 });
    expect(report.wouldAdopt).toEqual(['d1']);
    expect(report.wouldPublish).toEqual(['d2']);
    // Nothing moved: not a file, not the phone's memory of what it holds.
    expect(store.writes).toBe(0);
    expect(phone.adoptCalls).toBe(0);
    expect(phone.name('d1')).toBeUndefined();
  });

  it('says everything is settled once a scan has run', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'Shelf');
    await scanType(store, mac.binding(), 'mac');
    const report = await describeType(store, mac.binding(), 'mac');
    expect(report).toMatchObject({ held: 1, ours: 1, theirs: 0, settled: 1 });
    expect(report.wouldAdopt).toEqual([]);
    expect(report.wouldPublish).toEqual([]);
  });

  it('names a copy that is in the wrong folder as one to publish', async () => {
    const store = new FakeStore();
    const mac = new Held();
    mac.put('d1', 'mac', 1, T1, 'Shelf');
    await scanType(store, mac.binding(), 'mac');
    store.wrongPlace.add('d1');
    const report = await describeType(store, mac.binding(), 'mac');
    expect(report.wouldPublish).toEqual(['d1 (misplaced)']);
  });
});
