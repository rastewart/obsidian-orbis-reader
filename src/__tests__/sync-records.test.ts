// The merge, exercised as arithmetic rather than by dragging three devices around a room.
//
// The last block is the one that matters: two devices, an in-memory vault, and a loop. Convergence, tombstones,
// idempotence and a wrong clock are all statable here, and each is a way a sync design can fail.

import { describe, expect, it } from 'vitest';
import { parseSyncFileName, syncFilePath } from '../sync/paths';
import { compareVersions, decide, liftClock, newestOf, type SyncRecord } from '../sync/records';

const rec = (id: string, device: string, clock: number, at: string, item?: unknown, deleted = false): SyncRecord => ({
  id,
  type: 'dashboard',
  device,
  version: { clock, at },
  deleted,
  item,
});

const T1 = '2026-08-25T10:00:00.000Z';
const T2 = '2026-08-25T11:00:00.000Z';

describe('compareVersions', () => {
  it('prefers the later time, whatever the counters say', () => {
    // Comparing counters first would let the device that had edited MOST win every concurrent conflict regardless
    // of when, so the later edit would be the one that vanished.
    expect(compareVersions({ clock: 0, at: T2 }, { clock: 41, at: T1 })).toBeGreaterThan(0);
  });

  it('falls back to the counter when the times agree', () => {
    // Two edits inside one millisecond, or an edit made on a device carrying a time it read from someone else —
    // see `nextVersion`, where the counter is what keeps them distinguishable and ordered.
    expect(compareVersions({ clock: 8, at: T2 }, { clock: 7, at: T2 })).toBeGreaterThan(0);
  });

  it('breaks a dead heat by device, so both devices choose the same winner', () => {
    const a = { clock: 3, at: T1 };
    const b = { clock: 3, at: T1 };
    // Whichever way round it is asked, the answer names the same device — which is what makes a scan converge
    // instead of two devices each preferring their own copy forever.
    expect(compareVersions(a, b, 'aaa', 'bbb')).toBeLessThan(0);
    expect(compareVersions(b, a, 'bbb', 'aaa')).toBeGreaterThan(0);
  });

  it('is zero only for the same version from the same device', () => {
    expect(compareVersions({ clock: 3, at: T1 }, { clock: 3, at: T1 }, 'aaa', 'aaa')).toBe(0);
  });
});

describe('newestOf', () => {
  it('is null with nothing to choose from', () => {
    expect(newestOf([])).toBeNull();
  });

  it('picks the newest across devices', () => {
    // `ccc` is later in time; the counters belong to different devices and say nothing across them.
    const best = newestOf([rec('d1', 'aaa', 1, T1), rec('d1', 'bbb', 4, T1), rec('d1', 'ccc', 2, T2)]);
    expect(best?.device).toBe('ccc');
  });
});

describe('decide', () => {
  it('adopts an item this device has never seen', () => {
    const d = decide(null, null, rec('d1', 'bbb', 1, T1));
    expect(d.action).toBe('adopt');
    expect(d.record?.device).toBe('bbb');
  });

  it('publishes an item nobody else has', () => {
    expect(decide(rec('d1', 'aaa', 1, T1), null, null).action).toBe('publish');
  });

  it('adopts a newer copy from another device', () => {
    expect(decide(rec('d1', 'aaa', 1, T1), rec('d1', 'aaa', 1, T1), rec('d1', 'bbb', 2, T1)).action).toBe('adopt');
  });

  it('publishes when ours is newer than theirs', () => {
    expect(decide(rec('d1', 'aaa', 5, T2), rec('d1', 'aaa', 4, T1), rec('d1', 'bbb', 2, T1)).action).toBe('publish');
  });

  it('does nothing when the vault already says what we say', () => {
    const mine = rec('d1', 'aaa', 5, T2);
    expect(decide(mine, mine, rec('d1', 'bbb', 2, T1)).action).toBe('nothing');
  });

  it('publishes when our own file is stale, even with no other device involved', () => {
    // A fire-and-forget write that never landed — the durability fault this guards against.
    expect(decide(rec('d1', 'aaa', 9, T2), rec('d1', 'aaa', 3, T1), null).action).toBe('publish');
  });

  it('adopts a tombstone, because a delete has to be able to win', () => {
    const d = decide(rec('d1', 'aaa', 1, T1, { name: 'Shelf' }), null, rec('d1', 'bbb', 2, T1, undefined, true));
    expect(d.action).toBe('adopt');
    expect(d.record?.deleted).toBe(true);
  });

  it('keeps a local delete that is newer than their copy', () => {
    const mine = rec('d1', 'aaa', 4, T2, undefined, true);
    expect(decide(mine, null, rec('d1', 'bbb', 2, T1, { name: 'Shelf' })).action).toBe('publish');
  });
});

describe('liftClock', () => {
  it('carries our counter up to what we adopted, so the next edit is later than it', () => {
    expect(liftClock(0, 4)).toBe(4); // a device that has never edited, adopting version 4
    expect(liftClock(9, 4)).toBe(9); // ours is already ahead
  });
});

// ── Two devices and a vault ───────────────────────────────────────────────────

/** The vault, as far as sync is concerned: a path → record map, which is what a sync tool hands about between them. */
type Vault = Map<string, SyncRecord>;

/**
 * One device: what it holds, and its own hybrid logical clock.
 *
 * The two rules are mirrored here rather than imported, because the real clock persists through this device's storage
 * and this simulation runs two devices in one process. `sync/clock.ts` has its own tests; what is being tested here is
 * the merge over a vault, with a clock that behaves the way the real one does.
 */
class Device {
  readonly held = new Map<string, SyncRecord>();
  /** The latest physical time this device has seen anywhere, and the tiebreak within it. */
  private l = 0;
  private c = 0;
  constructor(
    readonly id: string,
    private now: () => string
  ) {}

  /** `l' = max(l, now)`, and the counter carries when the wall clock has not moved — see `nextVersion`. */
  private stamp(): { clock: number; at: string } {
    const l = Math.max(this.l, Date.parse(this.now()));
    this.c = l === this.l ? this.c + 1 : 0;
    this.l = l;
    return { clock: this.c, at: new Date(l).toISOString() };
  }

  /** `l' = max(l, theirs, now)` — what makes an edit made on top of something sort after it. */
  private observe(version: { clock: number; at: string }): void {
    const theirs = Date.parse(version.at);
    const l = Math.max(this.l, theirs, Date.parse(this.now()));
    if (l === this.l && l === theirs) this.c = Math.max(this.c, version.clock) + 1;
    else if (l === this.l) this.c += 1;
    else if (l === theirs) this.c = version.clock + 1;
    else this.c = 0;
    this.l = l;
  }

  /** A local edit — the only thing that mints a version here. */
  edit(itemId: string, item: unknown): void {
    this.held.set(itemId, {
      id: itemId,
      type: 'dashboard',
      device: this.id,
      version: this.stamp(),
      deleted: false,
      item,
    });
  }

  remove(itemId: string): void {
    this.held.set(itemId, {
      id: itemId,
      type: 'dashboard',
      device: this.id,
      version: this.stamp(),
      deleted: true,
    });
  }

  /**
   * One scan: read every published copy, decide per item, adopt or publish. Returns what it wrote.
   *
   * **Which copy is ours is a question about the FILE, not about the record.** A record names its author, and after
   * adoption our file contains someone else's authorship — so "have I published this?" has to be asked of the path.
   * Asking the contents would make every settled scan write again, since no file would claim to be ours.
   */
  scan(vault: Vault): number {
    const ids = new Set<string>(this.held.keys());
    const byId = new Map<string, { mine: SyncRecord | null; theirs: SyncRecord[] }>();
    for (const [path, record] of vault) {
      const parsed = parseSyncFileName(path.slice(path.lastIndexOf('/') + 1));
      if (!parsed) continue;
      this.observe(record.version); // everything read moves the clock, not only what is adopted
      ids.add(parsed.itemId);
      const slot = byId.get(parsed.itemId) ?? { mine: null, theirs: [] };
      if (parsed.deviceId === this.id) slot.mine = record;
      else slot.theirs.push(record);
      byId.set(parsed.itemId, slot);
    }
    let writes = 0;
    for (const id of ids) {
      const slot = byId.get(id) ?? { mine: null, theirs: [] };
      const mine = this.held.get(id) ?? null;
      const published = slot.mine;
      const theirs = newestOf(slot.theirs);
      const { action, record } = decide(mine, published, theirs);
      if (action === 'adopt' && record) {
        this.held.set(id, record);
        vault.set(syncFilePath('', 'dashboards', id, this.id), record); // verbatim: the path says who published it
        writes += 1;
      } else if (action === 'publish' && record) {
        vault.set(syncFilePath('', 'dashboards', id, this.id), record);
        writes += 1;
      }
    }
    return writes;
  }

  name(itemId: string): string | undefined {
    const r = this.held.get(itemId);
    return r?.deleted ? undefined : (r?.item as { name: string } | undefined)?.name;
  }
}

describe('two devices', () => {
  const clockFrom = (start: number) => {
    let t = start;
    return () => new Date((t += 1000)).toISOString();
  };

  it('converges: what one makes, the other has', () => {
    const vault: Vault = new Map();
    const mac = new Device('mac', clockFrom(1_000_000));
    const phone = new Device('phone', clockFrom(1_000_000));
    mac.edit('d1', { name: 'Shelf' });
    mac.scan(vault);
    phone.scan(vault);
    expect(phone.name('d1')).toBe('Shelf');
  });

  it('two devices adding different items keep both — the reason for a file per item', () => {
    const vault: Vault = new Map();
    const mac = new Device('mac', clockFrom(1_000_000));
    const phone = new Device('phone', clockFrom(1_000_000));
    mac.edit('d1', { name: 'From the Mac' });
    phone.edit('d2', { name: 'From the phone' });
    mac.scan(vault);
    phone.scan(vault);
    mac.scan(vault);
    expect(mac.name('d1')).toBe('From the Mac');
    expect(mac.name('d2')).toBe('From the phone');
    expect(phone.name('d1')).toBe('From the Mac');
    expect(phone.name('d2')).toBe('From the phone');
  });

  it('settles: a second scan with nothing new writes nothing', () => {
    const vault: Vault = new Map();
    const mac = new Device('mac', clockFrom(1_000_000));
    const phone = new Device('phone', clockFrom(1_000_000));
    mac.edit('d1', { name: 'Shelf' });
    mac.scan(vault);
    phone.scan(vault);
    mac.scan(vault);
    expect(phone.scan(vault)).toBe(0);
    expect(mac.scan(vault)).toBe(0);
  });

  it('a delete stays deleted, and does not come back from the device that still had it', () => {
    const vault: Vault = new Map();
    const mac = new Device('mac', clockFrom(1_000_000));
    const phone = new Device('phone', clockFrom(1_000_000));
    mac.edit('d1', { name: 'Shelf' });
    mac.scan(vault);
    phone.scan(vault); // the phone now has it too
    mac.remove('d1');
    mac.scan(vault);
    phone.scan(vault);
    expect(phone.name('d1')).toBeUndefined();
    phone.scan(vault); // and again, in case the tombstone were treated as an absence
    mac.scan(vault);
    expect(mac.name('d1')).toBeUndefined();
  });

  it('a device with a wrong clock still wins with its own later edit', () => {
    const vault: Vault = new Map();
    const mac = new Device('mac', clockFrom(1_000_000));
    // The phone thinks it is a week ago.
    const phone = new Device('phone', clockFrom(1_000_000 - 7 * 24 * 3600 * 1000));
    mac.edit('d1', { name: 'From the Mac' });
    mac.scan(vault);
    phone.scan(vault);
    // The phone edits what it just adopted. Its clock is a week behind, so its edit carries the time it READ from the
    // Mac with a higher counter — which is the whole reason the counter is still in the pair.
    phone.edit('d1', { name: 'Edited on the phone' });
    phone.scan(vault);
    mac.scan(vault);
    expect(mac.name('d1')).toBe('Edited on the phone');
  });

  /**
   * Two devices editing the same item while apart, and the later edit winning.
   *
   * Under a counter-first rule the device that had done more editing would win regardless of when — the phone's
   * older rename would beat the Mac's newer one, and the reader would watch their change revert.
   */
  it('the later of two independent edits wins, however busy the other device has been', () => {
    const vault: Vault = new Map();
    const phone = new Device('phone', clockFrom(1_000_000));
    const mac = new Device('mac', clockFrom(1_000_000));
    // The phone has been used all day, so its counter would have been far ahead of the Mac's.
    for (let i = 0; i < 20; i++) phone.edit(`other-${i}`, { name: `busy ${i}` });

    phone.edit('d1', { name: 'Renamed on the phone' }); // at 1_000_000
    const macLater = new Device('mac-later', () => new Date(1_000_000 + 60_000).toISOString());
    macLater.edit('d1', { name: 'Renamed on the Mac, a minute later' });
    macLater.scan(vault);
    phone.scan(vault);
    mac.scan(vault);

    expect(phone.name('d1')).toBe('Renamed on the Mac, a minute later');
    expect(mac.name('d1')).toBe('Renamed on the Mac, a minute later');
  });

  it('a simultaneous edit resolves the same way on both devices', () => {
    const vault: Vault = new Map();
    const frozen = () => '2026-08-25T12:00:00.000Z'; // same millisecond, same counter
    const mac = new Device('mac', frozen);
    const phone = new Device('phone', frozen);
    mac.edit('d1', { name: 'Mac wins?' });
    phone.edit('d1', { name: 'Phone wins?' });
    mac.scan(vault);
    phone.scan(vault);
    mac.scan(vault);
    phone.scan(vault);
    expect(mac.name('d1')).toBe(phone.name('d1')); // whichever it is, they agree
  });

  it('three devices converge on the newest, and stop writing', () => {
    const vault: Vault = new Map();
    const mac = new Device('mac', clockFrom(1_000_000));
    const phone = new Device('phone', clockFrom(2_000_000));
    const pad = new Device('pad', clockFrom(3_000_000));
    mac.edit('d1', { name: 'First' });
    mac.scan(vault);
    phone.scan(vault);
    phone.edit('d1', { name: 'Second' });
    phone.scan(vault);
    for (const d of [mac, pad, phone, mac, pad]) d.scan(vault);
    expect([mac.name('d1'), phone.name('d1'), pad.name('d1')]).toEqual(['Second', 'Second', 'Second']);
    expect(mac.scan(vault) + phone.scan(vault) + pad.scan(vault)).toBe(0);
  });
});
