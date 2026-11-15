// This device's clock, kept where it belongs: beside the vault it counts for.
//
// **A hybrid logical clock**, because a timestamp here has to satisfy two demands that pull against each other:
//
// - **Causality.** An edit made on top of a version it just adopted must sort AFTER that version. Without it, a device
//   whose clock runs slow loses to the very thing it was editing, and the reader's change vanishes with no conflict
//   reported anywhere.
// - **Recency.** Of two edits made independently, the later one should win. Without it, which device wins is
//   arbitrary — and it was: a plain Lamport counter is compared first, so the device that had done the most editing
//   won every concurrent conflict regardless of when the edits happened. Found on two real devices, renaming one
//   dashboard on each; the phone had run more tests, so the phone won, and the later edit on the Mac disappeared.
//
// An HLC gets both. `l` is a physical time, but not "what my clock says" — it is **the latest physical time this
// device has seen anywhere**, its own or on a record it read, and it never moves backwards. `c` is a counter that
// breaks ties within one `l`, which is what keeps ordering strict while real time catches up.
//
// Persisted through `device-store`, so it is per device AND per vault: two vaults on one machine count independently,
// which is right, because a version in one has nothing to say about a version in the other.
//
// See docs/design/multi-device-sync.md §The record.

import { readDeviceValue, writeDeviceValue } from '../device-store';
import type { SyncVersion } from './records';

const CLOCK_KEY = 'orbis-sync-clock';

/** The pair this device is at: the latest physical time it has seen, and the tiebreak within it. */
export interface ClockState {
  /** Milliseconds since the epoch — see the file header for why this is not simply `Date.now()`. */
  l: number;
  c: number;
}

/**
 * What this device has counted to. `{ l: 0, c: 0 }` before it has ever seen or made a version.
 *
 * A clock that cannot be read starts over rather than crashing: the ordering is still consistent afterwards, and one
 * device starting from zero is survivable where a load failure is not. It costs that device the next few comparisons,
 * since `l` climbs back to real time on its first local edit.
 */
export function currentClock(): ClockState {
  const raw = readDeviceValue(CLOCK_KEY);
  if (!raw) return { l: 0, c: 0 };
  try {
    const held = JSON.parse(raw) as Partial<ClockState>;
    const l = typeof held.l === 'number' && held.l >= 0 ? held.l : 0;
    const c = typeof held.c === 'number' && held.c >= 0 ? held.c : 0;
    return { l, c };
  } catch {
    return { l: 0, c: 0 };
  }
}

function save(state: ClockState): ClockState {
  writeDeviceValue(CLOCK_KEY, JSON.stringify(state));
  return state;
}

/**
 * The version for a change being made **now**, persisted before it is handed out.
 *
 * ```
 * l' = max(l, now)
 * c' = l' === l ? c + 1 : 0
 * ```
 *
 * If real time has moved on since this device's last event, take real time and reset the counter. If it has not — two
 * edits inside one millisecond, or a clock that is behind something this device has already seen — keep `l` and bump
 * the counter instead. That counter is the carry digit that keeps two versions distinguishable and correctly ordered
 * while `l` waits for the wall clock.
 *
 * Written first on purpose: a crash between handing out a version and saving the item leaves a gap in the sequence,
 * which costs nothing — while handing out the same version twice would give two different edits one identity, and one
 * of them would silently lose.
 */
export function nextVersion(now: number): SyncVersion {
  const held = currentClock();
  const l = Math.max(held.l, now);
  const next = save({ l, c: l === held.l ? held.c + 1 : 0 });
  return { clock: next.c, at: new Date(next.l).toISOString() };
}

/**
 * Take account of a version this device has just read, whether or not it adopts it.
 *
 * ```
 * l' = max(l, incoming, now)
 * c' = the counter belonging to whichever won, plus one — or 0 if `now` did
 * ```
 *
 * **This is what makes causality hold.** After reading a version stamped a minute in this device's future, the next
 * edit made here is stamped later than it, because `l` has moved up to meet it. Called for everything a scan reads,
 * not only for what it adopts: a version this device decided to overwrite is still a version it has seen, and its own
 * reply has to sort after it or the other device will not take it.
 */
export function observeVersion(version: SyncVersion, now: number): ClockState {
  const held = currentClock();
  const incoming = Date.parse(version.at);
  // A record with an unreadable time cannot move our clock; it can still be compared, since comparison falls back to
  // the counter and the device id.
  const theirL = Number.isFinite(incoming) ? incoming : 0;
  const l = Math.max(held.l, theirL, now);
  if (l === held.l && l === theirL) return save({ l, c: Math.max(held.c, version.clock) + 1 });
  if (l === held.l) return save({ l, c: held.c + 1 });
  if (l === theirL) return save({ l, c: version.clock + 1 });
  return save({ l, c: 0 });
}

/** For the dev reset command: start this vault's counting again. */
export function resetClock(): void {
  writeDeviceValue(CLOCK_KEY, null);
}
