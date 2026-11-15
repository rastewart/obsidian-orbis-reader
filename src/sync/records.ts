// What a synced item looks like, and which of two copies wins.
//
// The whole of multi-device sync rests on this file, and none of it touches a vault: a record is data, and the merge
// is arithmetic over two records. That is deliberate — every sync bug this design replaces was found by dragging three
// devices around a room, and the failures all looked like "it picked the wrong one" without saying why. Here a test
// can state each case.
//
// See docs/design/multi-device-sync.md.

/**
 * When a version was made — a hybrid logical clock, written as a time and a tiebreak.
 *
 * **The time is compared first, and it is not simply "what that device's clock said".** It is the latest time the
 * authoring device had seen anywhere, its own or on a record it had read, which is what lets the two halves of this
 * pair do different jobs:
 *
 * - `at` gives **recency**: of two independent edits, the later one wins, which is what a reader expects and what a
 *   plain counter got wrong — the device that had edited most won every conflict regardless of when.
 * - `clock` gives **causality** when `at` cannot: an edit made on a device whose clock is behind a version it has
 *   just read carries that version's time and a higher counter, so it still sorts after the thing it was made on.
 *
 * See `sync/clock.ts` for the two rules that maintain the pair, and never a file mtime: sync tools rewrite those.
 */
export interface SyncVersion {
  /** The tiebreak within one `at` — see `nextVersion`. Not a per-device edit count. */
  clock: number;
  /** UTC, ISO 8601. Logical time, which is usually the wall time of the edit and occasionally slightly ahead of it. */
  at: string;
}

/** One item as one device holds it. This is the file's whole contents. */
export interface SyncRecord<T = unknown> {
  /** The item's own id, which is what the merge is keyed by — never the file name. */
  id: string;
  /** Which kind of thing this is: `dashboard`, `collection`, `settings`. */
  type: string;
  /**
   * The device that **authored** this version — not the one that published this copy.
   *
   * The distinction is load-bearing. Adoption copies a record into our own file, and if that copy took our name the
   * version would change identity: two devices would each see "their copy differs from mine", adopt each other's, and
   * write forever. The author travels with the version; who published a copy is the file name's job.
   */
  device: string;
  version: SyncVersion;
  /** A tombstone keeps its record and loses its payload — an absent item is one the other device puts back. */
  deleted: boolean;
  item?: T;
}

/**
 * Which of two versions is later: `> 0` if `a` is, `< 0` if `b` is, `0` if they are the same version.
 *
 * The last tiebreak is the **device id**, and it is not decoration. Two devices with the same counter and the same
 * millisecond would otherwise each prefer their own copy, publish it, and disagree forever — a stable ordering both
 * arrive at independently is what makes the scan converge. Which device wins does not matter; that they agree does.
 */
export function compareVersions(a: SyncVersion, b: SyncVersion, aDevice = '', bDevice = ''): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1; // ISO 8601 sorts lexicographically
  if (a.clock !== b.clock) return a.clock - b.clock;
  if (aDevice === bDevice) return 0;
  return aDevice < bDevice ? -1 : 1;
}

/**
 * The newest of the copies other devices have published, or null if they have published none.
 *
 * Records from THIS device are excluded by the caller, not here: a scan reads its own file too — to notice that it is
 * missing or stale — and mixing the two comparisons in one function is how "am I behind?" and "have I published?"
 * came to be answered by the same wrong branch.
 */
export function newestOf<T>(records: readonly SyncRecord<T>[]): SyncRecord<T> | null {
  let best: SyncRecord<T> | null = null;
  for (const r of records) {
    if (!best || compareVersions(r.version, best.version, r.device, best.device) > 0) best = r;
  }
  return best;
}

/**
 * What a scan should do about one item.
 *
 * - `adopt` — someone else's copy is newer: take it into `data.json`, tombstone included, then publish it **under
 *   their version**. Not `now()`: an adopted copy is the same version, and stamping it fresh would make two devices
 *   hand the item back and forth forever.
 * - `publish` — ours is newer than what we last published, or we have never published it.
 * - `nothing` — the vault already says what we say.
 */
export type SyncAction = 'adopt' | 'publish' | 'nothing';

export interface SyncDecision<T> {
  action: SyncAction;
  /** For `adopt`: the record to take. For `publish`: the record to write. Absent for `nothing`. */
  record?: SyncRecord<T>;
}

/**
 * Decide, for one item, from three facts: what we hold, what we last published, and the best copy anyone else has.
 *
 * `mine` is the item as `data.json` holds it — including a tombstone for something deleted here. `published` is our
 * own file, which can be missing (never published) or stale (published before the last local change).
 */
export function decide<T>(
  mine: SyncRecord<T> | null,
  published: SyncRecord<T> | null,
  theirs: SyncRecord<T> | null
): SyncDecision<T> {
  // Nothing here and nothing anywhere: not an item at all.
  if (!mine && !theirs) return { action: 'nothing' };
  // Only they have it — which covers both a new item arriving and one this device has never seen.
  if (!mine) return { action: 'adopt', record: theirs ?? undefined };
  if (theirs && compareVersions(theirs.version, mine.version, theirs.device, mine.device) > 0) {
    return { action: 'adopt', record: theirs };
  }
  // Ours stands. Publish it if the vault does not already carry exactly this version from us.
  if (!published || compareVersions(published.version, mine.version, published.device, mine.device) !== 0) {
    return { action: 'publish', record: mine };
  }
  return { action: 'nothing' };
}

/**
 * The logical time this device is at after seeing someone else's — the `max` at the heart of the clock.
 *
 * **Seeing has to lift it, or causality breaks.** Read a version stamped a minute ahead of this device, edit the same
 * item, and without the lift the edit is stamped a minute BEHIND the thing it was made on top of. It then loses to
 * it, and the reader's change vanishes. Taking the maximum makes the next local edit strictly later than anything
 * this device has seen, which is what a reader means by "I changed it after that".
 *
 * A record is published verbatim: there is no `republish`, because nothing about a version changes when it is copied.
 * The file it is written to says who published it.
 */
export function liftClock(local: number, seen: number): number {
  return Math.max(local, seen);
}
