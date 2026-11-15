// What the library knows about a field: the keys it is also written as, and the values it offers. See
// docs/design/library.md.
//
// Three things are about fields — the alias map (which keys mean the same thing), the type list (what `type`
// offers), and declared fields (which of them can group and sort). Three settings pages about fields would be two
// too many, so they are one table, and this is its shape.
//
// **Declaring adds affordances, never permission.** A record with a field nobody declared still works, still shows
// and still filters; a value nobody listed is still a value. The vault is full of fields written by tools that
// never heard of us, and a table that decided what was allowed would be a schema — which this is not, and cannot
// become without breaking the thing the library is built on.

import type { NoteSpecies } from '../settings';
import type { FieldValue } from './arrange';

/**
 * One field, as the reader has described it.
 *
 * Everything but `key` is optional, because a row exists as soon as someone has something to say about a field —
 * a key it is also written as, an order for its values — and says nothing about the rest.
 *
 * **There is no display name for a field, deliberately.** A picker saying "Kind" where the note says `type` gives
 * the same thing three names — the key in the note, the alias beside it, and a word that appears nowhere in the
 * vault — and the reader has to hold all three to write a rule. Values are the opposite case and keep their labels:
 * `01-reading` is a sorting hack, "Reading" is prose, and nobody types a group heading into a query.
 */
export interface FieldDefinition {
  /** The canonical key: what a collection names, and what the library reads. */
  key: string;
  /**
   * What this field is for, in the reader's own words. Standard fields carry Orbis's description instead.
   *
   * Not a display name — see the note below. A description explains a field without renaming it, so `use_count`
   * is still `use_count` in every picker and in the note, and the list can still say what it counts.
   */
  description?: string;
  /**
   * A caption for the field, for the one place a field's NAME is shown: a table column heading.
   *
   * **It is a caption, never a rename.** The key is what the note holds, what a collection names and what every
   * picker shows; a label is what a column says above the values. It is never written to a note, never matched
   * against, and never shown where a key is meant.
   *
   * Absent is the normal state — a heading falls back to the plugin's own word for a named key, then to the key
   * humanised (`publication_date` → "Publication date"), so a table reads properly with nothing configured.
   */
  label?: string;
  /**
   * Other keys in the reader's notes that mean this field, in the order they are tried.
   *
   * **The field's own key is not in here and is always read first.** Listing it here would show `title` as an
   * alias of `title`, which is a puzzle rather than a setting. Placing an alias ahead of the canonical key buys
   * nothing, because a catalog writes one spelling or the other.
   */
  keys?: string[];
  /** The values this field offers, in the order they should appear. Empty means "whatever the vault holds". */
  values?: FieldValue[];
  /** A value Orbis provides and the reader has switched off. Kept rather than deleted — see `mergeValues`. */
  disabled?: string[];
  /**
   * Whether this field's values are worth naming — see `hasValueList`. Only ever set on a reader's own field;
   * for a standard one the answer is Orbis's and is not stored.
   */
  hasValues?: boolean;
}

/**
 * What Orbis knows without being told: its own vocabulary, and nothing about anyone else's.
 *
 * **No aliases ship.** `epub_link`, `calibre_id`, `logos_link`, `type_label` are not standards — they are what one
 * exporter or another happens to write, and a plugin that read them without being asked would be guessing about
 * tools it has never seen. The map from a vault's keys onto these fields belongs to the reader, on the Fields
 * page, and field detection is how a vault proposes it rather than us assuming it.
 *
 * The VALUES are a different matter and do ship: `reading_status` is what the row menu sets and `type` starts as
 * what cataloging writes, so they can be offered rather than typed from memory — and switched off rather than
 * deleted, since the records using them are real either way.
 */
export const BUILT_IN_FIELDS: readonly FieldDefinition[] = [
  // Only `book`, because it is the only medium Orbis ever writes. A reader with a DVD shelf, a magazine rack or
  // a folder of whitepapers names those themselves — a list of media we imagined would be a list of guesses.
  { key: 'type', values: [{ value: 'book' }] },
  {
    key: 'reading_status',
    values: [{ value: 'interested' }, { value: 'reading' }, { value: 'read' }, { value: 'abandoned' }],
  },
];

/**
 * The reader's table laid over Orbis's, field by field.
 *
 * **Added to, not replaced.** A reader adding `my_rating` to `rating` must not lose `user_rating`, which is what a
 * replacing merge would do the moment anyone touched a row — and the aliases are how an imported catalog reads at
 * all. Order is the reader's first, then ours: an alias someone added deliberately outranks one
 * we guessed at.
 */
export function mergeFields(user: readonly FieldDefinition[]): FieldDefinition[] {
  const byKey = new Map<string, FieldDefinition>();
  for (const field of BUILT_IN_FIELDS) byKey.set(field.key, { ...field });
  for (const field of user) {
    const base = byKey.get(field.key);
    if (!base) {
      byKey.set(field.key, { ...field });
      continue;
    }
    byKey.set(field.key, {
      key: field.key,
      description: field.description ?? base.description,
      label: field.label ?? base.label,
      hasValues: field.hasValues ?? base.hasValues,
      keys: dedupe([...(field.keys ?? []), ...(base.keys ?? [])]),
      values: mergeValues(base.values ?? [], field.values ?? [], field.disabled ?? []),
      disabled: field.disabled,
    });
  }
  return [...byKey.values()];
}

/**
 * The values a field offers: the reader's order, with Orbis's own kept unless switched off.
 *
 * **System values are disabled, never deleted.** They are what cataloging writes, so a list that had dropped
 * `document` would still be full of documents — and the row would then be describing a value it claims not to
 * have. Switching one off takes it out of the pickers and leaves every record that uses it alone.
 */
export function mergeValues(
  built: readonly FieldValue[],
  user: readonly FieldValue[],
  disabled: readonly string[]
): FieldValue[] {
  const off = new Set(disabled);
  const seen = new Set(user.map((entry) => entry.value));
  const kept = built.filter((entry) => !seen.has(entry.value) && !off.has(entry.value));
  return [...user.filter((entry) => !off.has(entry.value)), ...kept];
}

/**
 * The table in force, and how it gets there.
 *
 * **Module state, deliberately.** Reading a record is called from a dozen places — the catalog build, the
 * candidates pass, cataloging, the settings counts — and threading a table through every one of them to configure
 * something that changes twice a session would be a worse trade than this. Set once at load and again when the
 * settings change; the built-in table is what it is until then, so nothing has to guard against being early.
 */
let inForce: FieldDefinition[] = mergeFields([]);

export function setLibraryFields(user: readonly FieldDefinition[]): void {
  inForce = mergeFields(user);
}

export function libraryFields(): readonly FieldDefinition[] {
  return inForce;
}

/**
 * The values a field offers under the table in force, or nothing when no one has listed any.
 *
 * **What makes naming a value worth doing once.** Labeling `01-reading` as "Reading" belongs to the value, not to
 * the collection that happens to group on it — described per collection, the same status reads three different
 * ways on three dashboards, and every new collection starts by retyping them. A collection can still place its own
 * list and that wins; this is what it starts from.
 */
export function fieldValuesFor(field: string): FieldValue[] | undefined {
  const found = inForce.find((entry) => entry.key === field);
  return found?.values && found.values.length > 0 ? found.values : undefined;
}

/**
 * Every key that feeds `field`, in reading order — what reading a record actually walks.
 *
 * **The field's own key first, then the aliases in the order they were given.** One rule, and it is the one the
 * dialog states: a note that spells it the standard way is read the standard way, and the aliases are what to try
 * when it does not. A stored list that also names the canonical key reads the same, since it
 * is deduplicated against the one already in front.
 */
export function keysFor(fields: readonly FieldDefinition[], field: string): string[] {
  const found = fields.find((entry) => entry.key === field);
  if (!found) return [field];
  return dedupe([found.key, ...(found.keys ?? [])]);
}

/**
 * The keys a field is read from under the table in force — the one lookup everything that reads a note shares.
 *
 * **Every reader of frontmatter goes through here, or the table is a lie.** Aliases applied only where a record is
 * parsed would let a row map `logos_link` onto `source_url` and show it while a collection filtering on that same
 * field saw nothing: what is displayed and what is matched would disagree about what the vault says, and nothing
 * would error — a rule would quietly match fewer books. So parsing, rules, grouping and sorting all ask here, and a
 * field nobody has described answers with itself.
 */
export function fieldKeys(field: string): readonly string[] {
  return keysFor(inForce, field);
}

/**
 * The fields the library reads, in the order someone would look for them.
 *
 * What the Fields page offers to describe, and the reason it can offer anything at all: mapping `logos_link` onto
 * `source_url` means naming `source_url` — a key a vault full of Logos exports has never contained — so a picker
 * built from the vault's own keys could not express the mapping the page exists for.
 */
/**
 * The standard fields whose values are a vocabulary rather than data.
 *
 * A dozen mediums, a shelf of genres, four statuses, the languages you read in — those are worth naming, ordering
 * and heading a group with. A title has as many values as there are records, and `cover` and `files` are links;
 * offering to name those is offering to fill in a box per record. So the section simply is not there for them, rather
 * than being there and always empty.
 */
const VALUE_LIST_FIELDS: readonly string[] = ['type', 'genre', 'reading_status', 'language', 'source'];

/**
 * Whether the values of this field are worth naming and ordering.
 *
 * Orbis's answer for a standard field; the reader's own for a field they added, since only they know whether
 * `shelf` is a vocabulary or a serial number.
 */
export function hasValueList(field: FieldDefinition | undefined, key: string): boolean {
  if (VALUE_LIST_FIELDS.includes(key)) return true;
  if (LIBRARY_FIELDS.includes(key)) return false;
  return field?.hasValues === true;
}

export const LIBRARY_FIELDS: readonly string[] = [
  'title',
  'authors',
  'series',
  'series_index',
  'type',
  'genre',
  'publisher',
  'publication_date',
  'language',
  'subjects',
  'tags',
  'isbn',
  'rating',
  'cover',
  'files',
  'reading_status',
  'date_read',
  'added',
  'source',
  'source_id',
  'source_url',
  'source_notes',
];

/**
 * The fields a READING RECORD carries that are worth filtering, grouping and sorting by.
 *
 * The other species' `LIBRARY_FIELDS`, and offered in exactly the same place — so a record collection's conditions
 * lead with `mark` and `chapter` rather than with `authors` and `series`, which a record has never had.
 *
 * **A subset of `RECORD_PROPERTY_KEYS`, not all of it.** An export also writes the machinery that makes a record
 * navigable — `orbis_cfi`, `cfi_sort`, `orbis_id`, `chapter_index`, `mark_badge` — and the two link shapes
 * (`book`, `link`, `link_url`, `cover`). None of those is a fact anyone filters on: `cfi_sort` is an opaque derived
 * string by construction, and a wikilink compares as its own markup. They are still reachable under "Other keys in
 * your notes", the same place a title collection finds them; this is the list that gets a heading and a place near
 * the top.
 *
 * `orbis_note` is absent for the reason it is absent from every picker: every record carries it, so a rule on it
 * matches all of them or none.
 */
export const RECORD_FIELDS: readonly string[] = [
  'kind',
  'excerpt',
  'note_text',
  'mark',
  'book_title',
  'author',
  'chapter',
  'loc',
  'created',
  'tags',
  'orphaned',
];

/**
 * The schema of the species a dialog is about.
 *
 * One lookup, because everything that offers fields — the condition editor, Group by, Sort by — has to agree about
 * which species it is offering them for. A dialog that mixed the two would let someone group reading records by
 * `series`, save it, and get an empty widget with nothing to explain it.
 */
export function fieldsOfSpecies(species: NoteSpecies): readonly string[] {
  return species === 'reading_record' ? RECORD_FIELDS : LIBRARY_FIELDS;
}

/**
 * The canonical field a raw frontmatter key feeds, or the key itself.
 *
 * The other direction from `keysFor`, and the one a question about a CHANGE needs: `type_label` changed, so which
 * field did that change?
 */
export function fieldForKey(fields: readonly FieldDefinition[], key: string): string {
  return fields.find((entry) => entry.key === key || entry.keys?.includes(key))?.key ?? key;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
