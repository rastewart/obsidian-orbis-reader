// Saying where a title stands: interested, reading, finished. See docs/design/library.md.
//
// **The field is the schema's.** `reading_status` is in the schema with five values, `parseStatus` reads it, and
// collection rules can filter on it — so "flag this for later" is that field set to `interested`, and the shelf of
// what you are reading is a collection with one condition. A second flag of our own would be a second answer to
// "am I reading this", which is the thing the schema exists to prevent.

import { type App, TFile } from 'obsidian';
import { isoToday } from './dates';
import type { ReadingStatus } from './record';

/** The statuses offered when the reader has declared nothing: the four, in the order a book moves through them. */
export const OFFERED_STATUSES: readonly ReadingStatus[] = ['interested', 'reading', 'read', 'abandoned'];

/**
 * Which statuses the menu offers, given how the reader has described the field.
 *
 * **Whatever the field offers, in the field's order.** `parseStatus` reads every value the field declares, so the set
 * is the reader's as well as the order and the names; filtering it to the four Orbis ships would leave a value with a
 * group, a name and an order, and no tick in the menu that sets it.
 *
 * The one value that stays out is the empty one. A collection grouping by status needs somewhere to put the books
 * nobody has flagged, so the Fields page can name and place that row — but offering it here would be an item meaning
 * "clear" beside values that already clear by being chosen again, and the modals spell clearing out with a row of
 * their own.
 *
 * A value the reader switched off never reaches here: `fieldValuesFor` drops disabled ones on the way past.
 */
export function offeredStatuses(listed: readonly { value: string }[] | undefined): readonly ReadingStatus[] {
  const ordered = (listed ?? []).map((entry) => entry.value.trim()).filter(Boolean);
  return ordered.length > 0 ? ordered : OFFERED_STATUSES;
}

/**
 * Write a status onto a title note, or clear it.
 *
 * **Choosing the status a note already has clears it**, which is what makes one flat menu enough: there is no
 * "none of the above" item to explain, and un-flagging is the same gesture as flagging. `unread` is the written
 * form of nothing, so the field is emptied rather than set to it.
 *
 * `date_read` follows `read` and nothing else. Finishing a book is the one transition with a date worth keeping,
 * and stamping one on any other move would put a date on a book nobody has read.
 */
export async function setReadingStatus(app: App, notePath: string, status: ReadingStatus | null): Promise<void> {
  const note = app.vault.getAbstractFileByPath(notePath);
  if (!(note instanceof TFile)) return;
  await app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
    fm.reading_status = status ?? '';
    if (status === 'read' && !fm.date_read) fm.date_read = isoToday();
  });
}

/** What choosing `status` means for a record that currently says `current`: set it, or clear it. */
export function nextStatus(current: ReadingStatus | null, chosen: ReadingStatus): ReadingStatus | null {
  return current === chosen ? null : chosen;
}
