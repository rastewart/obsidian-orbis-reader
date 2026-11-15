// Setting your rating from the library. See docs/design/library.md — slice 8.
//
// **The same shape reading status has**, deliberately: a pure rule for what choosing a value means, and a write
// that touches one key. Rating is the second field the library edits, and the second one is where a convention
// either forms or is lost.

import { type App, TFile } from 'obsidian';

/**
 * The ratings offered, low to high: half steps from nothing-at-all to five.
 *
 * **Zero is one of them.** It says "I really did not like it", which is a different fact from never having rated a
 * book — so it is offered as a value, and clearing is still what choosing the current value does.
 *
 * Halves because five buckets are too few to separate the books you liked from the ones you loved. Eleven items is
 * a longer menu than five, and this menu exists for nothing else.
 */
export const OFFERED_RATINGS: readonly number[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/**
 * What choosing `chosen` means for a note that currently says `current`: set it, or clear it.
 *
 * **Choosing the rating a note already has clears it**, exactly as choosing its current status does — so rating and
 * un-rating are one gesture and the menu needs no "no rating" item to explain. A reader who mis-taps 3 gets back to
 * nothing by tapping 3 again, without having to know what it was before.
 */
export function nextRating(current: number | null, chosen: number): number | null {
  // `=== null`, never falsiness: a rating of 0 is a rating, and `current || …` would treat it as unrated.
  return current === chosen ? null : chosen;
}

/**
 * Write a rating onto a title note, or clear it.
 *
 * **Always the canonical `rating` key**, whatever aliases the reader has mapped onto it. Writing through an alias
 * would mean writing into a field their own exporter owns and rewrites on its next run — so a vault that reads
 * `user_rating` gains a `rating` beside it, which is the value read from then on, since the canonical key is read
 * first. That is the same rule every write in the plugin follows.
 *
 * Cleared to empty rather than removed: `processFrontMatter` leaves what it is not given, and an empty value is a
 * field that says nothing, which is what a collection grouping by rating puts in its leftovers row.
 */
export async function setRating(app: App, notePath: string, rating: number | null): Promise<void> {
  const note = app.vault.getAbstractFileByPath(notePath);
  if (!(note instanceof TFile)) return;
  await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
    fm.rating = rating ?? '';
  });
}
