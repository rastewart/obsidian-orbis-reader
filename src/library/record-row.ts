// What a reading record shows on a dashboard: the line it leads with, and the fields under it. See
// docs/design/library.md §Reading records on dashboards.
//
// Pure, like `display-fields.ts` next door and for the same reason: which line a bookmark with no passage leads
// with is a rule someone notices when it is wrong, and it is testable without a vault. Labels arrive resolved, so
// nothing here calls `t()`.

import { KEY_FOLDER, KEY_TAG } from './arrange';
import { fieldKeys } from './fields';
import type { ReadingRecord } from './record';
import { toStringList } from './record';

/** What a record row shows beneath its lead line when the widget has not said. */
export const DEFAULT_RECORD_FIELDS: readonly string[] = ['book_title', 'chapter'];

/** The words a headline falls back on, resolved by the caller. */
export interface RecordHeadlineLabels {
  /** A place in a book with nothing written at it — a bookmark in an unnamed chapter. */
  location: (loc: string) => string;
  /** A record that says nothing at all about where it is. */
  untitled: string;
}

/** A row's lead line, and which fields went into it — see `recordMetaLine` for why the caller wants both. */
export interface RecordHeadline {
  text: string;
  /** The field keys the line was built from, so the line beneath does not repeat them. */
  keys: string[];
}

/**
 * The line a record row leads with.
 *
 * **The passage, then your own words, then where it is.** A highlight IS its passage. A standalone note has only
 * what you wrote. **A bookmark has neither — an export writes no `excerpt` for one, by design, because a bookmark
 * is a place rather than an annotation about text.** So a bookmark is identified by where it is, and by BOTH parts
 * of where it is: three bookmarks in one chapter all reading "CHAPTER II." would be three identical rows, which is
 * the same as having no lead line at all. Chapter and location together tell them apart.
 *
 * The book title is the last resort before the fallback, because a row saying which book it came from is still a
 * row you can act on: tapping it opens the book at that spot either way.
 */
export function recordHeadline(record: ReadingRecord, labels: RecordHeadlineLabels): RecordHeadline {
  if (record.excerpt.trim()) return { text: record.excerpt.trim(), keys: ['excerpt'] };
  if (record.noteText.trim()) return { text: record.noteText.trim(), keys: ['note_text'] };
  // Where it is, as much of it as the record says.
  const place: string[] = [];
  const keys: string[] = [];
  if (record.chapter.trim()) {
    place.push(record.chapter.trim());
    keys.push('chapter');
  }
  if (record.loc.trim()) {
    place.push(labels.location(record.loc.trim()));
    keys.push('loc');
  }
  if (place.length > 0) return { text: place.join(' · '), keys };
  if (record.bookTitle.trim()) return { text: record.bookTitle.trim(), keys: ['book_title'] };
  return { text: labels.untitled, keys: [] };
}

/**
 * A field's values on this record, as text — the record species' answer to `fieldCells`.
 *
 * The named parts of a record are read from the parse rather than from the frontmatter, so a key the reader has
 * aliased still answers here; everything else is read through `fieldKeys`, exactly as a title's own fields are.
 */
export function recordCells(record: ReadingRecord, key: string): string[] {
  switch (key) {
    case 'excerpt':
      return present(record.excerpt);
    case 'note_text':
      return present(record.noteText);
    case 'mark':
      return present(record.mark);
    case 'kind':
      return present(record.kind);
    case 'book_title':
      return present(record.bookTitle);
    case 'author':
      return present(record.author);
    case 'chapter':
      return present(record.chapter);
    case 'loc':
      return present(record.loc);
    case 'created':
      return present(record.created);
    case 'tags':
    case KEY_TAG:
      return record.tags.filter((tag) => tag.trim().length > 0);
    case KEY_FOLDER:
      return present(record.notePath.split('/').slice(0, -1).join('/'));
    default:
      return raw(record, key);
  }
}

/**
 * The line under the headline: the fields this widget shows, in the order it lists them.
 *
 * **Never a second copy of the line above it — by KEY, and only by key.** A bookmark leads with its chapter, so a
 * row showing `chapter` as one of its fields would print the same words twice: once as the row's identity and once
 * as a detail of itself. That is one fact shown twice.
 *
 * **Matching text is NOT the same thing and is left alone.** An annotation on a chapter heading has the heading as
 * its passage, so the row reads "CHAPTER II" over "· CHAPTER II" — and those are two different facts that happen
 * to share their wording: what was selected, and which chapter it sits in. Dropping the second because it looked
 * like the first would make the row say less than it knows.
 */
export function recordMetaLine(
  record: ReadingRecord,
  fields: readonly string[] | undefined,
  separator: string,
  headline?: RecordHeadline
): string {
  const chosen = fields ?? DEFAULT_RECORD_FIELDS;
  return chosen
    .filter((key) => !headline?.keys.includes(key))
    .flatMap((key) => recordCells(record, key))
    .map((text) => text.trim())
    .filter(Boolean)
    .join(separator);
}

/**
 * As much of a passage as a column can hold, cut at a word.
 *
 * **The CSS cannot do this.** `-webkit-line-clamp` ends its last line at whichever CHARACTER overflows — "coming
 * into view ea…" — and `text-overflow: ellipsis` does the same; neither knows where a word is. And `max-width` on a
 * table cell is ignored in auto layout, so the column grew to whatever the longest passage wanted. Cutting the
 * text is what settles both: the column is bounded because its contents are.
 *
 * The whole passage is still on the row, in the tooltip and in the DOM — this decides what is drawn, not what is
 * known. A cut that would leave a stub of a line falls back to the hard cut: half a word is better than one word.
 */
export function clampToWords(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Past halfway, so a single very long word does not collapse the line to nothing.
  const head = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
  // Trailing punctuation before an ellipsis reads as a typo — "hesitation,…".
  return `${head.replace(/[\s,;:.!?—–-]+$/, '')}…`;
}

function present(text: string): string[] {
  return text.trim() ? [text.trim()] : [];
}

/** The reader's own field on a record, read through whatever keys they said mean it. */
function raw(record: ReadingRecord, key: string): string[] {
  for (const alias of fieldKeys(key)) {
    const found = toStringList(record.raw[alias]);
    if (found.length > 0) return found;
  }
  return [];
}
