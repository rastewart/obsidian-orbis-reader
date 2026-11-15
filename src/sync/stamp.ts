// Turning what `data.json` holds into versioned records — and noticing, without being told, that a reader changed one.
//
// **Nothing calls "I edited this".** A dashboard is edited from the settings page, from the dashboard view, from the
// widget editor, from a drag, from a rename that saves as you type; instrumenting every one of those with a version
// bump is a list that would be wrong within a week, and wrong quietly. So the version is derived instead: each item's
// payload is hashed when it is stamped, and an item whose hash no longer matches is one this device changed.
//
// That also gives deletes for free. An id this device has a version for, with no payload left to hash, was deleted
// here — which is exactly a tombstone, and it needs no more instrumentation than an edit does.
//
// See docs/design/multi-device-sync.md §The record.

import type { SyncRecord, SyncVersion } from './records';

/** What this device knows about one item's current version. Lives in `data.json`, beside the items themselves. */
export interface HeldVersion {
  clock: number;
  /** UTC ISO 8601. */
  at: string;
  /** The device that **authored** this version — see `SyncRecord.device`. Not necessarily this one. */
  device: string;
  /** A tombstone: the id keeps its version and loses its payload. */
  deleted?: boolean;
  /**
   * The payload as it stood when this version was stamped.
   *
   * Not for comparing two devices — a hash says nothing about which of two copies is newer. It answers one question,
   * on one device: *has this changed since I last gave it a version?*
   */
  hash: string;
}

/** Every item of one type, by id — tombstones included, which is why this outlives the payload array. */
export type VersionMap = Record<string, HeldVersion>;

/** The least an item must be for any of this to work. */
export interface Identified {
  id: string;
}

/**
 * A stable hash of a payload.
 *
 * FNV-1a over canonical JSON: object keys are sorted, so two devices that happen to write the same object in a
 * different key order do not read as different. 32 bits is plenty for the question being asked — a collision means
 * one edit is not noticed on one device, not a corrupted merge — and it keeps `data.json` readable.
 */
export function hashItem(item: unknown): string {
  const text = canonical(item);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, held: unknown) =>
    held && typeof held === 'object' && !Array.isArray(held)
      ? Object.fromEntries(Object.entries(held as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : held
  );
}

export interface StampOpts {
  deviceId: string;
  /**
   * A fresh version per change — see `nextVersion`. Called only when something actually changed, so a pass that finds
   * nothing costs nothing and, more importantly, does not move this device's clock for no reason.
   */
  version: () => SyncVersion;
}

export interface StampResult {
  versions: VersionMap;
  /** The ids that got a new version. Empty means nothing changed here, which is the normal case. */
  changed: string[];
}

/**
 * Give every item of one type the version it should have now.
 *
 * Three cases, and the third is the one that cannot be instrumented:
 *
 * - **An item with no version** is new to sync — either just built, or here since before the switch was turned on.
 * - **An item whose hash moved** was edited on this device.
 * - **A version whose item is gone** was deleted on this device, and becomes a tombstone.
 *
 * Returns a new map rather than editing the one passed in, so a caller can compare and decide whether to save.
 */
export function stampType<T extends Identified>(
  items: readonly T[],
  versions: VersionMap | undefined,
  opts: StampOpts
): StampResult {
  const out: VersionMap = { ...(versions ?? {}) };
  const changed: string[] = [];
  const live = new Set<string>();

  for (const item of items) {
    live.add(item.id);
    const hash = hashItem(item);
    const held = out[item.id];
    if (held && !held.deleted && held.hash === hash) continue;
    const version = opts.version();
    out[item.id] = { clock: version.clock, at: version.at, device: opts.deviceId, hash };
    changed.push(item.id);
  }

  for (const [id, held] of Object.entries(out)) {
    if (live.has(id) || held.deleted) continue;
    const version = opts.version();
    out[id] = { clock: version.clock, at: version.at, device: opts.deviceId, deleted: true, hash: '' };
    changed.push(id);
  }

  return { versions: out, changed };
}

/**
 * The records this device holds for one type — what a binding's `held()` answers with.
 *
 * A version with no payload and no tombstone is skipped: that is an item stamped and then removed from the array
 * without a pass in between, and publishing it with no `item` would look like a delete nobody asked for.
 */
export function recordsFor<T extends Identified>(
  type: string,
  items: readonly T[],
  versions: VersionMap | undefined
): SyncRecord<T>[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const out: SyncRecord<T>[] = [];
  for (const [id, held] of Object.entries(versions ?? {})) {
    const item = byId.get(id);
    if (held.deleted) {
      out.push({ id, type, device: held.device, version: { clock: held.clock, at: held.at }, deleted: true });
      continue;
    }
    if (!item) continue;
    out.push({ id, type, device: held.device, version: { clock: held.clock, at: held.at }, deleted: false, item });
  }
  return out;
}

export interface AdoptResult<T> {
  items: T[];
  versions: VersionMap;
}

/**
 * Take adopted records into what this device holds.
 *
 * **The adopted version is stored as it arrived** — author, counter and time — because it is the same version, and
 * the hash is recomputed from the adopted payload so the very next pass does not read the adoption as a local edit.
 * That is the whole point of hashing rather than instrumenting: an adoption is a change to `data.json` that must not
 * look like one.
 *
 * A tombstone removes the item. An adopted item that is new here is appended; where it lands in a list is a question
 * for this device's own order, not for the merge — see docs/design/multi-device-sync.md §An item travels.
 */
export function applyAdopted<T extends Identified>(
  records: readonly SyncRecord<T>[],
  items: readonly T[],
  versions: VersionMap | undefined
): AdoptResult<T> {
  const out = [...items];
  const nextVersions: VersionMap = { ...(versions ?? {}) };
  for (const record of records) {
    const at = out.findIndex((item) => item.id === record.id);
    if (record.deleted || !record.item) {
      if (at >= 0) out.splice(at, 1);
      nextVersions[record.id] = {
        clock: record.version.clock,
        at: record.version.at,
        device: record.device,
        deleted: true,
        hash: '',
      };
      continue;
    }
    if (at >= 0) out[at] = record.item;
    else out.push(record.item);
    nextVersions[record.id] = {
      clock: record.version.clock,
      at: record.version.at,
      device: record.device,
      hash: hashItem(record.item),
    };
  }
  return { items: out, versions: nextVersions };
}
