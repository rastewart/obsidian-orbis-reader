// Every note in the vault, in the shape collections and matching need. See docs/design/library.md.
//
// The one place that turns Obsidian's cache into candidates, because three callers want it — the view paints from
// it, and both settings dialogs count against it — and three copies of "path, tags, frontmatter" would drift the
// moment one of them started handling a case the others did not.
//
// **No file reads.** `metadataCache` already holds every note's parsed frontmatter and tags, which is the whole
// reason the Library needs no index of its own.

import { type App, getAllTags } from 'obsidian';
import type { NoteSpecies } from '../settings';
import type { CatalogCandidate } from './catalog';
import { fieldKeys } from './fields';
import { type LibraryRecord, NOTE_KIND_KEY, parseReadingRecord, parseRecord, type ReadingRecord } from './record';

/** Every markdown note, whether or not it is a record. */
export function vaultCandidates(app: App): CatalogCandidate[] {
  return app.vault.getMarkdownFiles().map((file) => {
    const cache = app.metadataCache.getFileCache(file);
    return {
      path: file.path,
      frontmatter: cache?.frontmatter ?? null,
      // Without the leading `#`, which is how rules and collections compare them.
      tags: (cache ? getAllTags(cache) : null)?.map((tag) => tag.replace(/^#/, '')) ?? [],
    };
  });
}

/**
 * Both species, from one walk of the vault.
 *
 * **One pass, deliberately.** `vaultCandidates` walks every markdown note and reads its cache entry, so filtering
 * it twice — once for titles, once for reading records — is two walks of the same vault on every repaint. A vault
 * with a year of active reading holds thousands of records, since every highlight is a note, so the second walk is
 * the one that would eventually be felt.
 *
 * The candidates come back too, because the callers that count and match want the raw notes as well as the parsed
 * records, and asking for those separately would be a third walk.
 */
export interface LibraryNotes {
  candidates: CatalogCandidate[];
  titles: LibraryRecord[];
  records: ReadingRecord[];
}

export function libraryNotes(app: App): LibraryNotes {
  const candidates = vaultCandidates(app);
  const titles: LibraryRecord[] = [];
  const records: ReadingRecord[] = [];
  for (const note of candidates) {
    // Asked in the order the vault is likeliest to answer, and mutually exclusive either way: a note says one
    // species or the other, never both, because `orbis_note` holds one value.
    const title = parseRecord(note.path, note.frontmatter);
    if (title) {
      titles.push(title);
      continue;
    }
    const record = parseReadingRecord(note.path, note.frontmatter);
    if (record) records.push(record);
  }
  return { candidates, titles, records };
}

/**
 * Only the notes that are records.
 *
 * What every count in the settings dialogs is against: a note with no title will never appear on a collection, so
 * counting notes would promise rows the Library then does not show.
 */
export function recordCandidates(app: App): CatalogCandidate[] {
  return vaultCandidates(app).filter((note) => parseRecord(note.path, note.frontmatter) !== null);
}

/**
 * Every frontmatter key the vault holds, sorted.
 *
 * What the pickers offer instead of a text box: a key is knowable, and typing `added_to_calibre` from memory is a
 * spelling test. Reads no files — `metadataCache` has parsed every note already.
 */
export function frontmatterKeys(app: App): string[] {
  const seen = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm) for (const key of Object.keys(fm)) seen.add(key);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Every key the TITLE NOTES hold, sorted.
 *
 * **What a collection can actually filter by.** Rules run over records and nothing else, so a key that lives only
 * on a reading record, a daily note or a project page is a rule that can never match — and offering it puts
 * `cfi_sort`, `mark_badge` and someone's `next` field in the same list as `publisher`. The vault-wide scan
 * remains for the Fields page, where a key has to be nameable BEFORE the note carrying it is a record: that is
 * what adoption is, and a picker scoped to records would hide exactly the keys someone is there to map.
 */
function recordKeys(app: App): string[] {
  return keysOf(recordCandidates(app));
}

/**
 * The notes of one species, for a dialog that is about that species.
 *
 * The pickers, the value lists and the live counts in a collection editor all have to ask the same population the
 * collection will gather — a record collection counting title notes would report a number nobody could reconcile
 * with what the widget shows.
 */
export function candidatesOfSpecies(app: App, species: NoteSpecies): CatalogCandidate[] {
  return species === 'reading_record'
    ? vaultCandidates(app).filter((note) => parseReadingRecord(note.path, note.frontmatter) !== null)
    : recordCandidates(app);
}

/**
 * Every key the READING RECORDS hold, sorted — the same question for the other species.
 *
 * A record collection's conditions run over records, so its pickers offer a record's keys: `excerpt`, `mark`,
 * `chapter`, `book_title` and whatever the reader has added to one. Offering a title's keys there would be the
 * mirror of the fault `recordKeys` guards against.
 */
function readingRecordKeys(app: App): string[] {
  return keysOf(candidatesOfSpecies(app, 'reading_record'));
}

/** The keys one species holds — what a collection editor offers, depending on what it gathers. */
export function keysOfSpecies(app: App, species: NoteSpecies): string[] {
  return species === 'reading_record' ? readingRecordKeys(app) : recordKeys(app);
}

/** The distinct keys a set of notes carries, minus the one that says what they are. */
function keysOf(notes: CatalogCandidate[]): string[] {
  const seen = new Set<string>();
  for (const note of notes) {
    if (note.frontmatter) for (const key of Object.keys(note.frontmatter)) seen.add(key);
  }
  // `orbis_note` is what MAKES these notes what they are, so every one carries it: a rule on it matches all of them
  // or none, which is not a filter.
  seen.delete(NOTE_KIND_KEY);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * The distinct values a field holds across the given notes, most common first.
 *
 * Feeds the rule editor's value picker: a field with a handful of values (`source`, `type`) becomes a list to
 * choose from, which is the difference between three taps and summoning a keyboard on a phone. Capped because a
 * field like `title` has as many values as there are records, and a dropdown of those is worse than typing —
 * the cap is how the editor decides which control to show.
 */
export function distinctValues(notes: CatalogCandidate[], field: string, cap: number): string[] {
  const counted = valueCounts(notes, field, cap);
  if (!counted) return [];
  return [...counted.counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
}

/** What a field holds across a set of notes: how many carry each value, and how many carry none. */
export interface ValueCounts {
  counts: Map<string, number>;
  /** Records whose answer is nothing — the group the `NONE_VALUE` row names. */
  none: number;
}

/**
 * How many records hold each value of a field, and how many hold none.
 *
 * **Through the field's aliases, like everything else that reads a note.** A count that read only the canonical
 * key would say `type` has no values at all in a vault that writes `type_label` — while the rows on every
 * dashboard show them. It is the same walk parsing does: the first key a note answers with wins, so a record is
 * counted once however many spellings it carries.
 *
 * `null` past the cap, which is the answer to "is this field worth listing values for": a field with more
 * distinct values than a dialog can show is one whose values are data, not vocabulary.
 */
/**
 * Up to `limit` values a field actually holds, for a question about their SHAPE rather than about which they are.
 *
 * **`valueCounts` cannot answer this.** It gives up once a field has more distinct values than its cap, which is
 * right for building a picker and exactly wrong here: a date field in a real vault has thousands of distinct
 * values, so the fields this exists to recognize are the ones that make it return nothing. Counting samples
 * instead of distinct values costs a walk of a few hundred notes and answers for any field at all.
 */
export function sampleFieldValues(notes: CatalogCandidate[], field: string, limit: number): string[] {
  const out: string[] = [];
  for (const note of notes) {
    for (const key of fieldKeys(field)) {
      const raw = note.frontmatter?.[key];
      const values = (Array.isArray(raw) ? raw : [raw])
        .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
        .map((v) => String(v).trim())
        .filter(Boolean);
      if (values.length === 0) continue;
      out.push(...values);
      break;
    }
    if (out.length >= limit) return out.slice(0, limit);
  }
  return out;
}

export function valueCounts(notes: CatalogCandidate[], field: string, cap: number): ValueCounts | null {
  const counts = new Map<string, number>();
  let none = 0;
  for (const note of notes) {
    let answered = false;
    for (const key of fieldKeys(field)) {
      const raw = note.frontmatter?.[key];
      const values = (Array.isArray(raw) ? raw : [raw])
        .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
        .map((v) => String(v).trim())
        .filter(Boolean);
      if (values.length === 0) continue;
      for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
        // Bail as soon as the answer cannot be a short list: counting every distinct title across thousands of
        // records to then throw the map away is work nobody asked for.
        if (counts.size > cap) return null;
      }
      answered = true;
      break;
    }
    if (!answered) none += 1;
  }
  return { counts, none };
}
