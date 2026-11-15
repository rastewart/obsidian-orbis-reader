// One scan: read what every device published, decide per item, adopt what is newer, publish what is ours.
//
// The decisions live in `records.ts` and the files in `store.ts`; this is the loop that puts them together, and it
// knows nothing about dashboards, collections or glossaries. What a type IS gets described by a `SyncBinding`, so
// adding the next one is a binding rather than another scan.
//
// See docs/design/multi-device-sync.md.

import { observeVersion } from './clock';
import { decide, newestOf, type SyncRecord } from './records';
import type { StoredCopy, SyncStore } from './store';

/**
 * What one kind of thing has to be able to say about itself.
 *
 * `held` returns what `data.json` holds, already as records — including tombstones for things deleted here, which is
 * why a binding cannot simply map over an array of live items.
 */
export interface SyncBinding<T> {
  type: string;
  /**
   * Bring the versions up to date with what `data.json` holds, before anything is compared.
   *
   * This is where a local edit becomes a version — see `stamp.ts`. Separate from `held()` because `held()` is asked
   * a question and this changes something: a scan that stamped inside the getter would be saving `data.json` from
   * inside a comparison.
   */
  refresh?(): Promise<void>;
  held(): SyncRecord<T>[];
  /** Take these records into `data.json`. Called once per scan with everything adopted, so one save covers them all. */
  adopt(records: SyncRecord<T>[]): Promise<void>;
}

export interface ScanResult {
  adopted: number;
  published: number;
  /** Writes that threw. The item stays unpublished and the next scan tries again — see `scanType`. */
  failed: number;
  /** Item ids adopted, for the debug log — a scan that changes what is on screen should be able to say what it did. */
  adoptedIds: string[];
  /** The devices that AUTHORED what was adopted, so the log can name them rather than printing ids. */
  adoptedFrom: string[];
}

/** Group by item, keeping "ours" (by file name) apart from "theirs" — see `newestOf` for why that split matters. */
function byItem<T>(
  copies: StoredCopy<T>[],
  deviceId: string
): Map<string, { mine: SyncRecord<T> | null; theirs: SyncRecord<T>[] }> {
  const out = new Map<string, { mine: SyncRecord<T> | null; theirs: SyncRecord<T>[] }>();
  for (const copy of copies) {
    const slot = out.get(copy.itemId) ?? { mine: null, theirs: [] };
    if (copy.deviceId === deviceId) slot.mine = copy.record;
    else slot.theirs.push(copy.record);
    out.set(copy.itemId, slot);
  }
  return out;
}

/**
 * Scan one type.
 *
 * **Adoption is applied in one batch, publication one file at a time.** The batch is so a binding saves `data.json`
 * once however many items arrived; the files are separate because they are separate files, and a failure to write one
 * must not lose the others — the next scan republishes whatever did not land, which is the property that makes the
 * derived files safe to lose.
 */
export async function scanType<T>(store: SyncStore, binding: SyncBinding<T>, deviceId: string): Promise<ScanResult> {
  await binding.refresh?.();
  const copies = await store.list<T>(binding.type);
  // **Everything read moves this device's clock, not only what it adopts.** A version we decline to take is still one
  // we have seen, and our own next edit has to sort after it or the other device will not take our reply — see
  // `observeVersion`. Done before any decision, so the decisions and the clock agree about what was on the table.
  const now = Date.now();
  for (const copy of copies) observeVersion(copy.record.version, now);
  const grouped = byItem(copies, deviceId);
  const held = new Map(binding.held().map((r) => [r.id, r]));
  // Answered after the read, because that is what it reads from — see `SyncStore.misplaced`.
  const misplaced = new Set(await store.misplaced?.(binding.type, deviceId));

  const ids = new Set<string>([...held.keys(), ...grouped.keys()]);
  const toAdopt: SyncRecord<T>[] = [];
  const toPublish: SyncRecord<T>[] = [];

  for (const id of ids) {
    const slot = grouped.get(id) ?? { mine: null, theirs: [] };
    const mine = held.get(id) ?? null;
    const decision = decide(mine, slot.mine, newestOf(slot.theirs));
    if (decision.action === 'adopt' && decision.record) toAdopt.push(decision.record);
    else if (decision.action === 'publish' && decision.record) toPublish.push(decision.record);
    // Settled, but our copy is in the wrong folder: publishing it is what moves it — see `SyncStore.misplaced`.
    else if (decision.action === 'nothing' && mine && misplaced.has(id)) toPublish.push(mine);
  }

  let published = 0;
  let failed = 0;
  /** One file's failure is that file's, not the scan's — the next scan republishes whatever did not land. */
  const put = async (record: SyncRecord<T>): Promise<void> => {
    try {
      await store.write(binding.type, record.id, deviceId, record);
      published += 1;
    } catch {
      failed += 1;
    }
  };

  if (toAdopt.length) {
    await binding.adopt(toAdopt);
    // Adopted records are published as ours, verbatim: the file says who published it, the record says who wrote it.
    // Under the record's own id, which `store.list` has already checked is the item its file was named for.
    for (const r of toAdopt) await put(r);
  }
  for (const r of toPublish) await put(r);

  return {
    adopted: toAdopt.length,
    published,
    failed,
    adoptedIds: toAdopt.map((r) => r.id),
    adoptedFrom: [...new Set(toAdopt.map((r) => r.device))],
  };
}
