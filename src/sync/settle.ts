// Rules that put a merged list back within its own invariants, before anything is compared.
//
// Named for the `settle` hook on a binding, which is the only thing that calls any of this. The merge itself knows
// nothing about a type beyond "items with ids and versions" — deliberately, since that is what makes it one merge
// rather than seven — so every rule of the form "at most one of these may be X" has to be applied afterwards, on
// every scan, by the type that has it.
//
// **On every scan, not only after adopting.** The state these fix can already be sitting in `data.json` from a merge
// that happened before the rule existed, and a device with nothing left to adopt would never look at it otherwise.
//
// See docs/design/multi-device-sync.md.

import { compareVersions } from './records';
import type { VersionMap } from './stamp';

/** Anything that can hold a role no more than one item may hold. */
type Defaultable = { id: string; isDefault: boolean };

/**
 * Leave the `isDefault` flag on one item — **the role is one per vault, and the merge does not know that.**
 *
 * Each device enforces "one default" in its own settings page, so each device's own list is fine. Merge two lists and
 * you have two items claiming it, which is not a tidy-later duplicate: `items.find((i) => i.isDefault)` then answers
 * by array order, and array order is a fact about how each device's merge happened to append things. Two devices
 * would disagree, silently. Seen on two devices, each having edited its own seeded default note style.
 *
 * **Decided by version, later wins** — the same rule the glossary's uniqueness uses, and for the same reason: a
 * version is the same fact on every device, so all of them clear the same flags without talking. An item with no
 * version yet was made here, this moment, and takes the role.
 *
 * Generic because two types have the rule and their reasons are identical: a note style decides what notes are
 * generated with, an annotation preset decides what a book gets without being assigned one. A second copy of this
 * would be a second chance for the two to disagree about what "later" means.
 */
export function settleDefault<T extends Defaultable>(items: readonly T[], versions: VersionMap | undefined): T[] {
  const claimants = items.filter((item) => item.isDefault);
  if (claimants.length < 2) return [...items];

  const laterOf = (a: T, b: T): T => {
    const va = versions?.[a.id];
    const vb = versions?.[b.id];
    if (!va) return a;
    if (!vb) return b;
    const order = compareVersions({ clock: va.clock, at: va.at }, { clock: vb.clock, at: vb.at }, va.device, vb.device);
    return order >= 0 ? a : b;
  };
  const winner = claimants.reduce(laterOf);
  return items.map((item) => (item.isDefault && item.id !== winner.id ? { ...item, isDefault: false } : item));
}
