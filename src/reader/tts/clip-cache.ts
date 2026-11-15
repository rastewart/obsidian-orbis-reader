// The Piper engine's cache of prepared clips: the current one, a few ahead, a couple behind, and pinned
// chapter starts. Pulled out of `PiperEngine` so a test can drive the keep-or-drop rule.

/** Why a clip left the cache — written to the debug log, so a re-synthesis can be traced to what caused it. */
export type DropReason = 'evicted' | 'unpinned' | 'stale' | 'rate';

/**
 * Least recently used first out, pinned clips exempt.
 *
 * **Asking for a clip that is already here counts as using it** (`touch`). Prefetch asks for the current clip and
 * the ones ahead each time a clip starts, and finds them here. Were that asking to leave their place unchanged, a
 * clip prepared well ahead would be the oldest in the cache by its turn, and preparing the one three ahead would evict
 * it — the clip about to play, prepared again behind the two after it (24.6 s of silence, measured on an iPhone).
 * Touched each time, the clips around the cursor are always the newest, and what goes is something already played.
 */
export class ClipCache<V> {
  private readonly clips = new Map<string, V>();
  private readonly pins = new Set<string>();

  constructor(
    private readonly max: number,
    private readonly maxPins: number,
    private readonly onDrop: (key: string, reason: DropReason) => void = () => {}
  ) {}

  has(key: string): boolean {
    return this.clips.has(key);
  }

  get(key: string): V | undefined {
    return this.clips.get(key);
  }

  /** Mark a clip used, if it is here — see the class comment. */
  touch(key: string): boolean {
    const v = this.clips.get(key);
    if (v === undefined) return false;
    this.clips.delete(key);
    this.clips.set(key, v);
    return true;
  }

  /** Add or replace a clip as the newest, then evict the oldest unpinned ones beyond `max`. */
  set(key: string, value: V): void {
    this.clips.delete(key);
    this.clips.set(key, value);
    let unpinned = 0;
    for (const k of this.clips.keys()) if (!this.pins.has(k)) unpinned++;
    for (const k of this.clips.keys()) {
      if (unpinned <= this.max) break;
      if (this.pins.has(k)) continue;
      this.drop(k, 'evicted');
      unpinned--;
    }
  }

  /** Exempt a key from eviction; past `maxPins` the oldest pin goes, with its clip. */
  pin(key: string): void {
    this.pins.add(key);
    while (this.pins.size > this.maxPins) {
      const oldest = this.pins.values().next().value;
      if (oldest === undefined) break;
      this.pins.delete(oldest);
      this.drop(oldest, 'unpinned');
    }
  }

  delete(key: string, reason: DropReason): void {
    this.drop(key, reason);
  }

  /** Everything, pins included. */
  clear(reason: DropReason): void {
    for (const k of [...this.clips.keys()]) this.drop(k, reason);
    this.pins.clear();
  }

  private drop(key: string, reason: DropReason): void {
    if (this.clips.delete(key)) this.onDrop(key, reason);
  }
}
