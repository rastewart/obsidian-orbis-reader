// What order a field runs in: the shape its values have, and what "first" and "reversed" mean for it, in words for
// that field — for a condition's operators, Group order and Sort by's direction alike.
//
// **Named for the field, never "ascending" or "value order".** Each field runs in its own order — a date oldest
// first, a rating lowest first, a reading status in the order the Fields page gives it, text A to Z — so one pair of
// words for all of them was either vague ("Groups in value order") or wrong for most of them ("A–Z" on a year).

import type { App } from 'obsidian';
import type { TranslationKey } from '../i18n/en';
import { type NoteSpecies, RULE_FIELD_FOLDER, RULE_FIELD_TAG } from '../settings';
import { KEY_LAST_OPENED } from './arrange';
import { candidatesOfSpecies, sampleFieldValues } from './candidates';
import { parseRecordDate, type TimeFrame } from './dates';

/** What a field's values mostly are, sampled from the notes. */
export type FieldShape = 'text' | 'dates' | 'numbers';

/** How many values to look at before deciding what a field holds. */
const SHAPE_SAMPLE = 200;

/**
 * What shape a field holds, sampled from the notes: dates, numbers, or text. Asked by a condition's operators, by
 * Group by for whether a Time frame applies, and by Group order and Sort by for the words their directions use.
 *
 * **One shape, never both.** A `published` field of bare years samples as dates AND as numbers, and offering
 * both would put "is more than" in the dropdown twice meaning two different things — days ago under Dates, a
 * plain comparison under Numbers. Dates win, because a four-digit year in a field of years is a date; a rating
 * of `4` is not. Most of what is there has to parse: a field where a third of the notes say `unknown` is still a
 * date field, and one where three values in two hundred look like years is not.
 *
 * Sampled by how many values are SEEN, not by how many are distinct — `valueCounts` gives up past its cap, and a
 * date field in a real vault has thousands of distinct values; see `sampleFieldValues`.
 */
export function fieldShapeOf(app: App, species: NoteSpecies, field: string): FieldShape {
  if (!field || field === RULE_FIELD_FOLDER || field === RULE_FIELD_TAG) return 'text';
  // The sidecars' timestamps are dates by construction — there is nothing to sample.
  if (field === KEY_LAST_OPENED) return 'dates';
  const values = sampleFieldValues(candidatesOfSpecies(app, species), field, SHAPE_SAMPLE);
  if (values.length === 0) return 'text';
  const most = (n: number): boolean => n * 2 > values.length;
  if (most(values.filter((value) => parseRecordDate(value) !== null).length)) return 'dates';
  if (most(values.filter((value) => value.trim() !== '' && Number.isFinite(Number(value.trim()))).length)) {
    return 'numbers';
  }
  return 'text';
}

/** A field's order, and that order reversed. */
export interface OrderWords {
  forward: TranslationKey;
  backward: TranslationKey;
}

/**
 * The words for the order a field runs in, as grouping and sorting actually run it (`arrange.ts`).
 *
 * - **A time frame** decides it for a date grouping: calendar buckets run oldest first, "how long ago" runs from
 *   Upcoming back, and "month of the year" runs January to December.
 * - **A value list** — the field's own, from the Fields page, or one the collection made its own — is the order
 *   before anything else, as it is in the comparators, and the words say which of the two it is.
 * - Otherwise the values themselves: dates oldest first, numbers lowest first, text A to Z.
 */
export function orderWords(field: {
  shape: FieldShape;
  /** Where the value order comes from, if the field has one — see `orderSource`. */
  listed: 'field' | 'collection' | null;
  frame?: TimeFrame;
}): OrderWords {
  const pair = (forward: TranslationKey, backward: TranslationKey): OrderWords => ({ forward, backward });
  if (field.frame === 'aging') return pair('library_page.order_newest_first', 'library_page.order_oldest_first');
  if (field.frame === 'month-of-year') {
    return pair('library_page.order_january_first', 'library_page.order_december_first');
  }
  if (field.frame) return pair('library_page.order_oldest_first', 'library_page.order_newest_first');
  if (field.listed === 'field') return pair('library_page.order_property', 'library_page.order_property_reversed');
  if (field.listed === 'collection') {
    return pair('library_page.order_collection', 'library_page.order_collection_reversed');
  }
  if (field.shape === 'dates') return pair('library_page.order_oldest_first', 'library_page.order_newest_first');
  if (field.shape === 'numbers') return pair('library_page.order_lowest_first', 'library_page.order_highest_first');
  return pair('library_page.order_a_z', 'library_page.order_z_a');
}
