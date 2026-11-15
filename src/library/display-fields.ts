// Which fields a widget shows, and what each one reads as.
//
// **One capability, three views.** A list shows them under the title, a cover shows them in its tooltip, and a
// table gives each one a column — but "which fields" is one question with one answer, stored on the widget. Two
// lists would mean switching a widget from list to table lost the choice you made in the other.
//
// Pure, and separate from the views, because the formatting rules are the part worth pinning: a rating is `4/5`
// and not `4`, a status reads as the reader named it rather than as `read`, and a series carries its number.
// Those are decisions, and a decision made in a render function is one nobody can find later.

import type { NoteSpecies } from '../settings';
import type { FieldValue, GroupKey } from './arrange';
import { labelOf } from './arrange';
import { fieldKeys, fieldsOfSpecies } from './fields';
import type { LibraryRecord } from './record';
import { toStringList } from './record';

/**
 * The fields a widget can be asked to show.
 *
 * Everything the library reads, plus whatever the reader has added, minus `title` — which is the row's own
 * heading and the table's first column, so offering it would be offering a duplicate of the thing it labels.
 * `cover` and `files` ARE offered: a table of titles and their EPUB paths is a reasonable thing to want, and
 * refusing it because the value is a link would be an artificial line.
 */
export function displayableFields(custom: readonly string[] = [], species: NoteSpecies = 'title'): string[] {
  const schema = fieldsOfSpecies(species);
  // **The field the row leads with is not offered as one of the fields beside it.** For a title that is `title`;
  // for a record it is `excerpt`, the passage the row IS — see `recordHeadline`. Offering it would put the same
  // sentence on the row twice, once as its identity and once as a detail of itself.
  const lead = species === 'reading_record' ? 'excerpt' : 'title';
  return [...schema.filter((key) => key !== lead), ...custom.filter((key) => !schema.includes(key))];
}

/**
 * A field's key, made readable: `publication_date` → "Publication date".
 *
 * The floor of the heading chain, and the reason a label is optional rather than required — a table is legible
 * with nothing configured, so naming a field is for when you disagree with this, not for making it work.
 */
function humanizeFieldKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/**
 * What a column of this field is called: the reader's caption, else the plugin's own word for a named key, else
 * the key humanised.
 *
 * `named` is passed in rather than looked up, because resolving it needs `t()` and this stays pure.
 */
export function fieldHeading(key: string, label?: string, named?: string): string {
  return label?.trim() || named?.trim() || humanizeFieldKey(key);
}

/** A field's values on this record, as text, ready to show. Empty when the note says nothing. */
export function fieldCells(record: LibraryRecord, key: GroupKey, values?: FieldValue[]): string[] {
  const named = (list: readonly string[]): string[] => list.map((value) => labelOf(values, value)).filter(Boolean);
  switch (key) {
    case 'authors':
      return record.authors;
    case 'subjects':
      return record.subjects;
    case 'tags':
      return record.tags;
    case 'files':
      return record.files;
    case 'source_notes':
      return record.sourceNotes;
    case 'cover':
      return record.cover ? [record.cover] : [];
    // **A series carries its number.** "Saga" and "#2" are one fact in two frontmatter keys, and a row saying
    // only "Saga" is missing the half that tells you where you are in it.
    case 'series':
      return record.series ? [record.seriesIndex ? `${record.series} #${record.seriesIndex}` : record.series] : [];
    // Out of 5, said outright. A bare `4` in a column of numbers is a rating, a page count or a year.
    case 'rating':
      return record.rating === null ? [] : [`${record.rating}/5`];
    // Named as the reader named it — the same list the group headings use, so a status column and a status
    // heading cannot disagree about what `read` is called.
    case 'reading_status':
      return named(record.status ? [record.status] : []);
    case 'type':
      return named(record.type ? [record.type] : []);
    case 'genre':
      return named(record.genre ? [record.genre] : []);
    default:
      return named(raw(record, key));
  }
}

/** The reader's own field, read through whatever keys they said mean it. */
function raw(record: LibraryRecord, key: string): string[] {
  for (const alias of fieldKeys(key)) {
    const found = toStringList(record.raw[alias]);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Order records by one field, for a table heading someone tapped.
 *
 * **Text order, on what the column actually shows** — the cell, not the raw frontmatter, so a status column
 * sorts by the name it displays and a series sorts as "Saga #2" reads. Numbers inside the text are compared as
 * numbers, so #2 precedes #10 rather than following it, and an empty cell sorts last whichever direction is
 * asked for: a title with nothing to say about this column is not the top of the list, and flipping the arrow
 * should not make it so.
 */
export function sortedByField<T = LibraryRecord>(
  records: readonly T[],
  key: string,
  desc: boolean,
  cellsOf: (record: T, key: string) => string[],
  /**
   * The leading column, which is not one of the fields.
   *
   * A table's first column is the row's identity — a title, or the passage a record leads with — and it is the one
   * column whose text does not come from `cellsOf`. Absent means the leading column is `title`, which is what a
   * table of titles has always sorted by.
   */
  lead?: { key: string; text: (record: T) => string }
): T[] {
  const text = (record: T): string =>
    key === (lead?.key ?? 'title')
      ? lead
        ? lead.text(record)
        : (record as unknown as LibraryRecord).title
      : cellsOf(record, key).join(', ');
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...records].sort((a, b) => {
    const left = text(a).trim();
    const right = text(b).trim();
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return desc ? collator.compare(right, left) : collator.compare(left, right);
  });
}

/** What a widget shows when it has not been told: who wrote it, and where it sits in a series. */
export const DEFAULT_DISPLAY_FIELDS: readonly string[] = ['authors', 'series'];

/**
 * One line of text for a row or a tooltip: each chosen field, in order, skipping what a note does not have.
 *
 * Fields it lacks are skipped rather than spaced over, so a row is never a trail of separators — the line
 * describes this record, not the shape of the widget's configuration.
 */
export function metaLineFor(
  record: LibraryRecord,
  fields: readonly string[] | undefined,
  values: (key: string) => FieldValue[] | undefined
): string {
  const chosen = fields ?? DEFAULT_DISPLAY_FIELDS;
  return chosen
    .map((key) => fieldCells(record, key, values(key)).join(', '))
    .filter((text) => text.length > 0)
    .join(' · ');
}
