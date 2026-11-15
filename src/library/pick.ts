// Choosing a title at random, repeatably. See docs/design/library.md.
//
// **A random pick has to be stable, or it is not a suggestion.** The Library repaints whenever the vault changes,
// and a widget that reshuffled on every repaint would swap the book out from under a reader deciding whether to
// start it. So the pick is a function of the pool and a seed: the same seed picks the same book, and the reroll
// button is a new seed rather than a new roll.
//
// The seed itself is random and lives on the view. An earlier version derived it from the date, so that a
// suggestion survived a restart — which reads as broken, because reopening the Library and pressing Pick another
// walked the identical books in the identical order every time. Stable within a sitting is the property worth
// having; stable across sittings is just predictable.

import type { PickPool } from '../settings';

/** Anything with a stable identity to pick from — the note path, in practice. */
interface Pickable {
  notePath: string;
}

/**
 * Order the pool by a hash of each item's path and the seed, and take the first `count`.
 *
 * Hashing per item rather than shuffling with a seeded generator, because this has to be stable under a pool that
 * CHANGES: catalog a book and the pool grows by one, and a shuffle would deal an entirely new hand. Here every
 * other title keeps its place and the new one slots in wherever its hash puts it.
 */
export function pickTitles<T extends Pickable>(pool: T[], seed: number, count: number): T[] {
  return (
    pool
      // Seed FIRST: FNV-1a mixes each byte into the accumulator in turn, so a seed appended at the END shifts every
      // item's hash by nearly the same amount and leaves the ORDER intact — rerolling then picked the same book
      // forever. Fed in first, it diffuses through the whole path.
      .map((item) => ({ item, order: pickHash(`${seed}#${item.notePath}`) }))
      .sort((a, b) => a.order - b.order || a.item.notePath.localeCompare(b.item.notePath))
      .slice(0, Math.max(0, count))
      .map((entry) => entry.item)
  );
}

/** FNV-1a over the path and seed. Nothing here is a hash in the security sense; it only needs to scatter. */
function pickHash(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** What a title has to say for itself before a pick will suggest it. */
export interface PickFacts {
  /** Its reading status, as the note has it — `null` when it says nothing. */
  status: string | null;
  /** Whether one of its files resolves to something in the vault. */
  hasFile: boolean;
}

/**
 * The titles a pick may suggest, given how the widget is set.
 *
 * **Separate from the pick itself**, because these are two different rules with two different failure modes: which
 * books are eligible is a question about the catalog, and which of them comes up is a question about the seed.
 *
 * `pool: 'no-status'` excludes a title with ANY status, including one flagged for later — see `pickPool`. It is
 * deliberately not "not started": a book you opened once and put down is exactly what a suggestion is for, and a
 * book you are part way through says so by having a status, which is two taps from inside the book.
 */
export function pickable<T>(
  items: readonly T[],
  rules: { pool?: PickPool; requiresFile?: boolean },
  facts: (item: T) => PickFacts
): T[] {
  return items.filter((item) => {
    const fact = facts(item);
    if (rules.requiresFile && !fact.hasFile) return false;
    // Absent means the status rule, which is what a pick did before either of these was a setting.
    return (rules.pool ?? 'no-status') === 'any' || fact.status === null;
  });
}
