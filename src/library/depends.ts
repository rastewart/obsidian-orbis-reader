// Whether a change to one field could change what a dashboard shows. See docs/design/library.md.
//
// The Library repaints on every metadata event, which is right — frontmatter is the store, so a note changing IS a
// record changing. But a repaint rebuilds every row and every cover, and setting a reading status from the menu
// produced one for a field nothing on screen was using: a visible flash on a tablet, in exchange for nothing.
//
// Pure, because it is a question about configuration rather than about the vault: given these collections, does any
// of them so much as mention this field?

import type { LibraryCollection, PickPool } from '../settings';
import { fieldForKey, keysFor, libraryFields } from './fields';

/**
 * Whether any of these collections reads `field` — as a condition, a grouping, a sort, or a value order.
 *
 * **Aliases count.** A collection filtering on `type` is affected by a change to `type_label`, because that is the
 * key the record actually read. Missing that would be the worst kind of wrong here: a widget that quietly stops
 * following the vault.
 *
 * Conservative by construction: anything not understood is treated as a dependency, so the answer is only ever
 * "definitely not needed" or "repaint".
 */
export function collectionsDependOn(collections: LibraryCollection[], field: string): boolean {
  // Both directions, through the table in force: the changed key, whatever field it feeds, and every other key
  // that feeds it. A collection filtering on `type` is affected by a change to `type_label`, because that is the
  // key the record actually read.
  const fields = libraryFields();
  const canonical = fieldForKey(fields, field);
  const names = new Set([field, canonical, ...keysFor(fields, canonical)]);
  return collections.some((collection) => {
    if (collection.groupBy && names.has(collection.groupBy)) return true;
    if (collection.sort?.some((spec) => names.has(spec.key))) return true;
    if (collection.fieldValues && Object.keys(collection.fieldValues).some((key) => names.has(key))) return true;
    return (collection.ruleSets ?? []).some((set) => set.rules.some((rule) => names.has(rule.field)));
  });
}

/**
 * Whether any widget on screen shows this field.
 *
 * **The static list below is not enough now that a widget chooses its own fields.** Which fields a row shows was
 * fixed when `DISPLAYED_FIELDS` was written; today a widget can be told to show `rating`, `publisher` or a field of
 * the reader's own, and a change to one of those changes what is on screen. Setting a rating from the row menu was
 * skipped as "nothing shows this" while a table column showed exactly that.
 *
 * Aliases count, for the reason they count in `collectionsDependOn`: the key the note actually answered with is the
 * one that changed.
 */
/**
 * The frontmatter a widget reads to decide WHICH titles it holds, as opposed to which it shows.
 *
 * A pick filtering on reading status is the first widget whose population depends on a field nothing displays: set a
 * status from inside a book and the suggestion has to stop offering it, even on a dashboard where no row shows the
 * status anywhere. Answered per widget so a dashboard without one pays nothing.
 */
export function widgetPoolFields(widget: { kind: string; pickPool?: PickPool }): string[] {
  // Absent means the status rule — see `pickPool`.
  if (widget.kind !== 'pick') return [];
  return (widget.pickPool ?? 'no-status') === 'any' ? [] : ['reading_status'];
}

export function widgetsDisplay(shown: readonly string[], field: string): boolean {
  if (shown.length === 0) return false;
  const fields = libraryFields();
  const canonical = fieldForKey(fields, field);
  const names = new Set([field, canonical, ...keysFor(fields, canonical)]);
  return shown.some((key) => names.has(key));
}

/**
 * The frontmatter keys whose values differ between two versions of a note.
 *
 * Compared as JSON, because a frontmatter value is anything YAML can hold and a list that was rewritten in the
 * same order has not changed. A key that appeared or vanished counts, which is what makes "cover was added"
 * something the caller can act on.
 */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) out.push(key);
  }
  return out;
}

/**
 * The fields a row shows, which every collection depends on whether it says so or not.
 *
 * A title, an author, a series, a cover: change one and the rows change, even for a collection that filters on a
 * folder and sorts by title. The list is what `metaLine` and the tile draw, plus what `capabilitiesOf` reads to
 * decide what a row can do.
 */
export const DISPLAYED_FIELDS: readonly string[] = [
  'title',
  'authors',
  'author',
  'series',
  'series_index',
  'type',
  'type_label',
  'kind',
  'cover',
  'files',
  'epub_link',
  'source',
  'source_url',
  'logos_link',
  'added',
  'import_date',
];
