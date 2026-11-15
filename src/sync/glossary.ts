// One rule the other synced types do not need: **a word may appear once.**
//
// Every other type is a bag of independent things — two dashboards can share a name and nothing breaks. The glossary
// is a lookup table, so two entries for one word is not a duplicate to tidy at leisure: it is an ambiguity about what
// the word is supposed to sound like, and `compilePronouncer` resolves it by array order, which two devices need not
// agree about. The same word could be spoken differently on each device, with nothing on screen to explain why.
//
// It happens without anyone doing anything strange: add "Nekrassov" on a phone that is offline and again on the Mac,
// and the two entries are different ITEMS — each minted its own id — so the merge keeps both, correctly, because
// nothing about them says they are the same thing. The word does.
//
// So the rule is applied after merging, not during it: whichever entry for a word has the later version stays, and
// the others are tombstoned. Both devices run it over the same versions and reach the same answer independently,
// which is what makes it converge rather than ping-pong.
//
// See docs/design/multi-device-sync.md §Sync owns the glossary.

import type { Pronunciation } from '../reader/tts/pronunciations';
import { compareVersions } from './records';
import { hashItem, type VersionMap } from './stamp';

/** A glossary entry as sync sees it: the entry, with the id it is merged by — see `Pronunciation.id`. */
export interface GlossaryItem extends Pronunciation {
  id: string;
}

export interface DedupeResult {
  /** What to keep, in the order they were given, minus the losers. */
  entries: GlossaryItem[];
  /** The ids that lost, for the caller to tombstone. Empty in the normal case. */
  dropped: string[];
}

/** Words are matched the way the editor matches them: trimmed and case-insensitive. */
const key = (word: string): string => word.trim().toLowerCase();

/**
 * Keep one entry per word — the one with the later version.
 *
 * **Version, not array order.** Array order is a fact about how the merge happened to append things, and it differs
 * between devices; a version is the same fact everywhere. An entry with no version yet (just created here, not yet
 * stamped) is treated as the newest, since it is the one the reader is looking at.
 */
export function dedupeByWord(entries: readonly GlossaryItem[], versions: VersionMap | undefined): DedupeResult {
  const best = new Map<string, GlossaryItem>();
  const dropped: string[] = [];

  const beats = (a: GlossaryItem, b: GlossaryItem): boolean => {
    const va = versions?.[a.id];
    const vb = versions?.[b.id];
    if (!va) return true; // unstamped: made here, this moment
    if (!vb) return false;
    return compareVersions({ clock: va.clock, at: va.at }, { clock: vb.clock, at: vb.at }, va.device, vb.device) > 0;
  };

  for (const entry of entries) {
    const k = key(entry.word);
    const held = best.get(k);
    if (!held) {
      best.set(k, entry);
      continue;
    }
    if (beats(entry, held)) {
      best.set(k, entry);
      dropped.push(held.id);
    } else {
      dropped.push(entry.id);
    }
  }

  const keep = new Set([...best.values()].map((e) => e.id));
  return { entries: entries.filter((e) => keep.has(e.id)), dropped };
}

/**
 * The id to give an entry that predates ids — **derived from the word, so every device derives the same one.**
 *
 * A new entry gets a random id, which is right: it is created once, on one device, and travels from there. An entry
 * that already exists is a different case entirely. It exists on every device already, and each of them reaches this
 * line separately, the first time it loads a version that has ids. Random ids there mean three devices minting three
 * ids for one word, and the merge — correctly, since nothing about them says they are the same thing — keeps all
 * three, until the uniqueness rule tombstones two. It converges, but it converges through a burst of adoptions and
 * tombstones for a glossary nobody touched. Observed on three devices: 16 words became 20 ids and 10 tombstones.
 *
 * Deriving it from the word makes the three devices agree without talking, which is the only way they CAN agree
 * about something that happened before any of them published.
 *
 * **Two hashes, not one.** A single 32-bit hash over a few hundred words carries a small but real chance that two
 * words collide, and a collision here is two words treated as one entry — one respelling silently lost. Sixty-four
 * bits makes that not worth thinking about.
 */
export function legacyPronunciationId(word: string): string {
  const k = key(word);
  return `pron-${hashItem(k)}${hashItem(`${k}\u0000orbis`)}`;
}
