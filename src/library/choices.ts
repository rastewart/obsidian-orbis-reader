// What the rating and reading-status pickers offer, and what each row is called. See docs/design/library.md.
//
// **One list, two surfaces.** The library's row menu and the dialogs the reader opens over a book are the same
// question asked in two places, and a second copy of the list is how they drift: a status renamed on the Fields page
// showing under its new name in one and its old one in the other, or a value the reader added appearing in only one
// of them. The list lives here and both read it.
//
// **And they clear the same way**: choosing the value a note already has takes it off, in the dialogs as in the row
// menu. A dialog has room for a "No status" row, but it would be a second way to say what the tick already says —
// one gesture with two meanings depending on which surface you were looking at.

import { labelOf } from './arrange';
import { fieldValuesFor } from './fields';
import { OFFERED_RATINGS } from './rating';
import type { ReadingStatus } from './record';
import { offeredStatuses } from './status';

/**
 * The statuses on offer, in the reader's order and under the reader's names.
 *
 * **The Fields page is where a value is named, and this is what shows it.** Calling `read` "Finished" on that page
 * and having the menu still say `read` would mean the setting described a list nobody saw.
 *
 * **And Orbis names none of them.** A name translated here and nowhere else would give one value two names — the row
 * menu saying *Given up on* while the Fields page's own value list, the collection editor's Value dropdown and every
 * group heading on every dashboard said `abandoned` — and which one you saw would depend on which surface you were
 * looking at.
 *
 * So a status reads as what the note holds until the reader says otherwise, and `labelOf` is the whole chain:
 * their label, else the value. Nothing is special about the four Orbis ships — a status they add is offered on
 * exactly the same terms, which is what makes the Fields page's "Shown as" the one answer to "what is this called".
 */
export function statusChoices(): Array<{ status: ReadingStatus; label: string }> {
  const listed = fieldValuesFor('reading_status');
  return offeredStatuses(listed).map((status) => ({ status, label: labelOf(listed, status) }));
}

/** One row of a picker: the value it sets, what it is called, and whether the note already says it. */
export interface Pick<T> {
  value: T;
  label: string;
  current: boolean;
}

/**
 * The rows of the reading-status dialog, for a note that currently says `current`.
 *
 * **The values, and nothing else.** There is no row for clearing, because choosing the value a note already has is
 * what clears it — the rule the library's row menu follows. A dialog with a "No status" row as well
 * would be two ways to say one thing, and the two surfaces asking the same question would answer the same tap
 * differently. What the tick means is therefore "tap this to take it off".
 */
export function statusPicks(current: ReadingStatus | null): Array<Pick<ReadingStatus>> {
  return statusChoices().map(({ status, label }) => ({ value: status, label, current: status === current }));
}

/**
 * The rows of the rating dialog. Half steps from 0 to 5, as the row menu offers them.
 *
 * Zero is a rating — "I really did not like it" — so it is a row like any other, and `current` distinguishes a book
 * rated zero from one nobody has rated. Clearing is choosing the value again, as it is for a status.
 */
export function ratingPicks(current: number | null): Array<Pick<number>> {
  return OFFERED_RATINGS.map((value) => ({ value, label: String(value), current: value === current }));
}
