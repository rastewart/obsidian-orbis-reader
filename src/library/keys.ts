// The grouping and sorting keys that are not plain frontmatter fields, and what to call them.
//
// **One table, because two would drift.** The collection editor offers these in its Group by and Sort dropdowns,
// and the library names a summary widget after the one its collection groups by — the same key has to read the
// same way in both, or the widget is named after something the editor calls something else.
//
// Translation KEYS rather than strings, so this stays a data table and the caller resolves them with `t()`.

import type { TranslationKey } from '../i18n/en';
import {
  KEY_AUTHOR,
  KEY_FOLDER,
  KEY_LAST_OPENED,
  KEY_LETTER_AUTHOR,
  KEY_LETTER_TITLE,
  KEY_RATING,
  KEY_SERIES,
  KEY_TAG,
  KEY_TITLE,
} from './arrange';

export const NAMED_KEYS: Array<{ key: string; label: TranslationKey }> = [
  // `kind` is deliberately absent: it is being folded into `type`, so offering it would invite collections built on a
  // field that is on its way out. Reading it still works — a record that says `kind: document` still labels its
  // row — but nothing new should come to depend on it. See the field manager in docs/design/library.md.
  { key: KEY_TITLE, label: 'library_page.key_title' },
  { key: KEY_AUTHOR, label: 'library_page.key_author' },
  { key: KEY_SERIES, label: 'library_page.key_series' },
  { key: KEY_RATING, label: 'library_page.key_rating' },
  { key: KEY_TAG, label: 'library_page.key_tag' },
  { key: KEY_FOLDER, label: 'library_page.key_folder' },
  { key: KEY_LETTER_TITLE, label: 'library_page.key_letter_title' },
  { key: KEY_LETTER_AUTHOR, label: 'library_page.key_letter_author' },
  { key: KEY_LAST_OPENED, label: 'library_page.key_last_opened' },
];

/**
 * What to call each library field where its NAME is shown — today, a table column heading.
 *
 * Humanising the key gets most of them right and four of them wrong: `isbn` reads as "Isbn", `source_url` as
 * "Source url". A table should be correct before anyone configures anything, so the fields Orbis defines carry
 * their own headings and the humanised key stays as the floor for fields it has never heard of.
 *
 * Plural where the field holds several — a column of `authors` is Authors, even though sorting by it is "Author".
 */
const FIELD_HEADINGS: Record<string, TranslationKey> = {
  title: 'field_heading.title',
  authors: 'field_heading.authors',
  series: 'field_heading.series',
  series_index: 'field_heading.series_index',
  type: 'field_heading.type',
  genre: 'field_heading.genre',
  publisher: 'field_heading.publisher',
  publication_date: 'field_heading.publication_date',
  language: 'field_heading.language',
  subjects: 'field_heading.subjects',
  tags: 'field_heading.tags',
  isbn: 'field_heading.isbn',
  rating: 'field_heading.rating',
  cover: 'field_heading.cover',
  files: 'field_heading.files',
  reading_status: 'field_heading.reading_status',
  date_read: 'field_heading.date_read',
  added: 'field_heading.added',
  source: 'field_heading.source',
  source_id: 'field_heading.source_id',
  source_url: 'field_heading.source_url',
  source_notes: 'field_heading.source_notes',
  // A reading record's own fields. Only the ones humanising gets wrong or says thinly: `book_title` is the book,
  // `loc` is a location, `note_text` is the note you wrote, and `kind` is which of highlight, note or bookmark this
  // is. `excerpt`, `mark`, `chapter`, `created` and `tags` humanise correctly and are left to.
  kind: 'field_heading.kind',
  excerpt: 'field_heading.excerpt',
  note_text: 'field_heading.note_text',
  mark: 'field_heading.mark',
  book_title: 'field_heading.book_title',
  author: 'field_heading.author',
  loc: 'field_heading.loc',
  orphaned: 'field_heading.orphaned',
};

/**
 * What to call this key, or null for a field Orbis has never heard of — which is called by its own name.
 *
 * A field's own heading wins over the grouping vocabulary: "Authors" heads a column, while "Author" is what you
 * sort by, and the two readings are both right in their own place.
 */
export function namedKeyLabel(key: string): TranslationKey | null {
  return FIELD_HEADINGS[key] ?? NAMED_KEYS.find((entry) => entry.key === key)?.label ?? null;
}
