// What a scan WOULD do, without doing any of it.
//
// **Read-only, deliberately and completely.** The state worth looking at is the stuck one: a device that has files in
// its vault and has adopted nothing. A tool that scans in order to tell you about scanning destroys the evidence it
// was meant to collect, and if the scan happens to fix things you learn that a scan works without learning why one
// had not run. So this reads, decides, reports, and writes nothing — not a file, not a version, not the clock.
//
// It does not call `refresh` either, which means local edits that have not been stamped yet are not counted here.
// That is the honest reading: `held` is what this device would publish *right now*, and the difference between that
// and what it holds is what a scan's first step would fix.

import type { SyncBinding } from './engine';
import { decide, newestOf, type SyncRecord } from './records';
import type { SyncStore } from './store';

export interface TypeReport {
  type: string;
  /** Records this device holds versions for — see the note above about unstamped edits. */
  held: number;
  /** Copies found, split by whose file they are. */
  ours: number;
  theirs: number;
  wouldAdopt: string[];
  wouldPublish: string[];
  settled: number;
}

/** One line per type, for the debug log. */
export function describeReport(report: TypeReport): string {
  const verdicts = [
    `adopt ${report.wouldAdopt.length}`,
    `publish ${report.wouldPublish.length}`,
    `nothing ${report.settled}`,
  ].join(', ');
  return (
    `${report.type} — held ${report.held}, copies ${report.ours + report.theirs} ` +
    `(${report.ours} ours, ${report.theirs} from other devices) → ${verdicts}`
  );
}

/** What one type's next scan would decide. */
export async function describeType<T>(
  store: SyncStore,
  binding: SyncBinding<T>,
  deviceId: string
): Promise<TypeReport> {
  const copies = await store.list<T>(binding.type);
  const held = new Map(binding.held().map((r) => [r.id, r]));
  const misplaced = new Set(await store.misplaced?.(binding.type, deviceId));

  const grouped = new Map<string, { mine: SyncRecord<T> | null; theirs: SyncRecord<T>[] }>();
  let ours = 0;
  for (const copy of copies) {
    const slot = grouped.get(copy.itemId) ?? { mine: null, theirs: [] };
    if (copy.deviceId === deviceId) {
      slot.mine = copy.record;
      ours += 1;
    } else slot.theirs.push(copy.record);
    grouped.set(copy.itemId, slot);
  }

  const report: TypeReport = {
    type: binding.type,
    held: held.size,
    ours,
    theirs: copies.length - ours,
    wouldAdopt: [],
    wouldPublish: [],
    settled: 0,
  };

  for (const id of new Set<string>([...held.keys(), ...grouped.keys()])) {
    const slot = grouped.get(id) ?? { mine: null, theirs: [] };
    const mine = held.get(id) ?? null;
    const decision = decide(mine, slot.mine, newestOf(slot.theirs));
    if (decision.action === 'adopt') report.wouldAdopt.push(id);
    else if (decision.action === 'publish') report.wouldPublish.push(id);
    else if (mine && misplaced.has(id)) report.wouldPublish.push(`${id} (misplaced)`);
    else report.settled += 1;
  }
  return report;
}
