// Versions derived from what `data.json` holds, rather than from being told. The cases that matter are the two that
// would be silent in use: an edit nobody announced, and an adoption mistaken for one.

import { describe, expect, it } from 'vitest';
import type { SyncRecord, SyncVersion } from '../sync/records';
import { applyAdopted, hashItem, recordsFor, stampType, type VersionMap } from '../sync/stamp';

interface Dash {
  id: string;
  name: string;
  widgets?: string[];
}

const NOW = '2026-08-25T10:00:00.000Z';
const LATER = '2026-08-25T11:00:00.000Z';

/**
 * A stand-in for the clock: hands out versions at the time it is given, counting within it, and remembers how many
 * times it was asked. The real one is a hybrid logical clock — see `sync/clock.ts`; what matters here is only that a
 * version is asked for exactly when something changed.
 */
function counter(): { at: (when: string) => () => SyncVersion; used: () => number } {
  let n = 0;
  let used = 0;
  return {
    at: (when: string) => () => {
      used += 1;
      return { at: when, clock: n++ };
    },
    used: () => used,
  };
}

function stamp(items: Dash[], versions: VersionMap | undefined, now = NOW, clock = counter()) {
  return stampType(items, versions, { deviceId: 'mac', version: clock.at(now) });
}

describe('hashItem', () => {
  it('does not care what order the keys were written in', () => {
    expect(hashItem({ id: 'd1', name: 'Shelf' })).toBe(hashItem({ name: 'Shelf', id: 'd1' }));
  });

  it('does care about order inside an array — a reordered dashboard is a changed dashboard', () => {
    expect(hashItem({ id: 'd1', widgets: ['a', 'b'] })).not.toBe(hashItem({ id: 'd1', widgets: ['b', 'a'] }));
  });

  it('notices a change anywhere in the payload', () => {
    expect(hashItem({ id: 'd1', name: 'Shelf' })).not.toBe(hashItem({ id: 'd1', name: 'Shelves' }));
  });
});

describe('stampType', () => {
  it('gives a version to an item that has none', () => {
    const result = stamp([{ id: 'd1', name: 'Shelf' }], undefined);
    expect(result.changed).toEqual(['d1']);
    expect(result.versions.d1).toMatchObject({ clock: 0, at: NOW, device: 'mac' });
  });

  it('says nothing when nothing moved, and spends no clock doing it', () => {
    const clock = counter();
    const items = [{ id: 'd1', name: 'Shelf' }];
    const first = stamp(items, undefined, NOW, clock);
    const again = stamp(items, first.versions, LATER, clock);
    expect(again.changed).toEqual([]);
    expect(again.versions).toEqual(first.versions);
    expect(clock.used()).toBe(1); // the second pass asked for no counter at all
  });

  it('notices an edit nobody announced', () => {
    const clock = counter(); // one counter across both passes, as `nextClock` is across a device's life
    const first = stamp([{ id: 'd1', name: 'Shelf' }], undefined, NOW, clock);
    const after = stamp([{ id: 'd1', name: 'Shelves' }], first.versions, LATER, clock);
    expect(after.changed).toEqual(['d1']);
    expect(after.versions.d1).toMatchObject({ at: LATER, device: 'mac' });
    expect(after.versions.d1.clock).toBeGreaterThan(first.versions.d1.clock);
  });

  it('tombstones an item that is no longer held, and keeps the id', () => {
    const first = stamp([{ id: 'd1', name: 'Shelf' }], undefined);
    const after = stamp([], first.versions, LATER);
    expect(after.changed).toEqual(['d1']);
    expect(after.versions.d1).toMatchObject({ deleted: true, device: 'mac', at: LATER });
  });

  it('does not tombstone twice — a delete stays one version, not one per pass', () => {
    const first = stamp([{ id: 'd1', name: 'Shelf' }], undefined);
    const gone = stamp([], first.versions, LATER);
    const again = stamp([], gone.versions, '2026-08-25T12:00:00.000Z');
    expect(again.changed).toEqual([]);
    expect(again.versions).toEqual(gone.versions);
  });

  it('revives a tombstoned id when the item comes back', () => {
    const gone = stamp([], { d1: { clock: 4, at: NOW, device: 'phone', deleted: true, hash: '' } });
    expect(gone.changed).toEqual([]);
    const back = stamp([{ id: 'd1', name: 'Shelf' }], gone.versions, LATER);
    expect(back.changed).toEqual(['d1']);
    expect(back.versions.d1.deleted).toBeUndefined();
  });

  it('leaves the map it was given alone', () => {
    const held: VersionMap = { d1: { clock: 1, at: NOW, device: 'mac', hash: 'nope' } };
    stamp([{ id: 'd1', name: 'Shelf' }], held, LATER);
    expect(held.d1).toMatchObject({ clock: 1, hash: 'nope' });
  });
});

describe('recordsFor', () => {
  it('carries the author, not this device', () => {
    const versions: VersionMap = { d1: { clock: 7, at: NOW, device: 'phone', hash: hashItem({ id: 'd1' }) } };
    const [record] = recordsFor('dashboards', [{ id: 'd1', name: 'Shelf' }], versions);
    expect(record).toMatchObject({ id: 'd1', type: 'dashboards', device: 'phone', version: { clock: 7, at: NOW } });
  });

  it('publishes a tombstone with no payload', () => {
    const versions: VersionMap = { d1: { clock: 2, at: NOW, device: 'mac', deleted: true, hash: '' } };
    const [record] = recordsFor('dashboards', [], versions);
    expect(record).toMatchObject({ deleted: true });
    expect(record.item).toBeUndefined();
  });

  it('skips a version whose item is neither held nor tombstoned', () => {
    const versions: VersionMap = { d1: { clock: 1, at: NOW, device: 'mac', hash: 'x' } };
    expect(recordsFor('dashboards', [], versions)).toEqual([]);
  });
});

describe('applyAdopted', () => {
  const arriving = (over: Partial<SyncRecord<Dash>> = {}): SyncRecord<Dash> => ({
    id: 'd1',
    type: 'dashboards',
    device: 'phone',
    version: { clock: 5, at: LATER },
    deleted: false,
    item: { id: 'd1', name: 'From the phone' },
    ...over,
  });

  it('takes the payload and the version exactly as they arrived', () => {
    const first = stamp([{ id: 'd1', name: 'Shelf' }], undefined);
    const after = applyAdopted([arriving()], [{ id: 'd1', name: 'Shelf' }], first.versions);
    expect(after.items).toEqual([{ id: 'd1', name: 'From the phone' }]);
    expect(after.versions.d1).toMatchObject({ clock: 5, at: LATER, device: 'phone' });
  });

  it('does not read its own adoption as a local edit — the churn this design exists to avoid', () => {
    const after = applyAdopted([arriving()], [], undefined);
    const next = stamp(after.items, after.versions, '2026-08-25T12:00:00.000Z');
    expect(next.changed).toEqual([]);
    expect(next.versions.d1.device).toBe('phone'); // still the phone's version, not restamped as ours
  });

  it('appends an item this device has never seen', () => {
    const after = applyAdopted(
      [arriving({ id: 'd2', item: { id: 'd2', name: 'New' } })],
      [{ id: 'd1', name: 'A' }],
      {}
    );
    expect(after.items.map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it('removes what a tombstone says is gone, and remembers that it is', () => {
    const held = [{ id: 'd1', name: 'Shelf' }];
    const first = stamp(held, undefined);
    const after = applyAdopted([arriving({ deleted: true, item: undefined })], held, first.versions);
    expect(after.items).toEqual([]);
    expect(after.versions.d1).toMatchObject({ deleted: true, device: 'phone' });
    // And the next pass does not put it back or restamp the delete as ours.
    expect(stamp(after.items, after.versions, LATER).changed).toEqual([]);
  });

  it('leaves the items and versions it was given alone', () => {
    const held = [{ id: 'd1', name: 'Shelf' }];
    const versions = stamp(held, undefined).versions;
    applyAdopted([arriving()], held, versions);
    expect(held).toEqual([{ id: 'd1', name: 'Shelf' }]);
    expect(versions.d1.device).toBe('mac');
  });
});

/**
 * The field table is one item with a constant id — `stampType` over an array that always holds exactly one thing.
 *
 * Worth stating as tests because the contract is unusual: this item cannot be deleted, only emptied, and adopting it
 * replaces the whole table rather than merging fields. Both follow from the array never being empty, which is easy
 * to break by making the caller "helpfully" omit an empty table.
 */
describe('a singleton item — the field table', () => {
  interface Table {
    id: string;
    fields: string[];
  }
  const table = (fields: string[]): Table[] => [{ id: 'table', fields }];
  const stampTable = (fields: string[], versions: VersionMap | undefined, now = NOW, clock = counter()) =>
    stampType(table(fields), versions, { deviceId: 'mac', version: clock.at(now) });

  it('is one record, whatever the table holds', () => {
    const first = stampTable(['author', 'status'], undefined);
    const records = recordsFor('fields', table(['author', 'status']), first.versions);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 'table', type: 'fields', deleted: false });
  });

  it('never tombstones — an emptied table is a change, not a delete', () => {
    const clock = counter();
    const first = stampTable(['author'], undefined, NOW, clock);
    const emptied = stampTable([], first.versions, LATER, clock);
    expect(emptied.changed).toEqual(['table']);
    expect(emptied.versions.table.deleted).toBeUndefined();
    expect(recordsFor('fields', table([]), emptied.versions)[0]).toMatchObject({ deleted: false });
  });

  it('adopts the whole table, replacing what was here', () => {
    const mine = stampTable(['author'], undefined);
    const arriving: SyncRecord<Table> = {
      id: 'table',
      type: 'fields',
      device: 'phone',
      version: { clock: 9, at: LATER },
      deleted: false,
      item: { id: 'table', fields: ['status', 'series'] },
    };
    const after = applyAdopted([arriving], table(['author']), mine.versions);
    expect(after.items).toEqual([{ id: 'table', fields: ['status', 'series'] }]);
    // And the adoption is not read back as a local edit on the next pass.
    expect(stampTable(['status', 'series'], after.versions, '2026-08-26T12:00:00.000Z').changed).toEqual([]);
  });
});
