import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_FIELDS,
  fieldForKey,
  fieldsOfSpecies,
  hasValueList,
  keysFor,
  LIBRARY_FIELDS,
  mergeFields,
  mergeValues,
  RECORD_FIELDS,
} from '../library/fields';
import { RECORD_PROPERTY_KEYS } from '../reader/annotation-records';

describe('mergeFields', () => {
  it('leaves the built-in table alone when the reader has said nothing', () => {
    expect(mergeFields([])).toEqual([...BUILT_IN_FIELDS.map((f) => ({ ...f }))]);
  });

  // No aliases ship: which keys mean which field is a statement about the reader's vault, not about Orbis.
  it('ships no aliases at all', () => {
    expect(BUILT_IN_FIELDS.every((field) => !field.keys)).toBe(true);
    expect(keysFor(mergeFields([]), 'files')).toEqual(['files']);
  });

  it('reads its own key first, then the aliases in the order given', () => {
    const merged = mergeFields([{ key: 'files', keys: ['epub_link', 'book_file'] }]);
    expect(keysFor(merged, 'files')).toEqual(['files', 'epub_link', 'book_file']);
  });

  // Every row the upgrade seeded lists the canonical key among the aliases. It reads the same either way, and the
  // dialog never shows a field as an alias of itself.
  it('never reads the field’s own key twice, however the row lists it', () => {
    const merged = mergeFields([{ key: 'type', keys: ['type_label', 'type'] }]);
    expect(keysFor(merged, 'type')).toEqual(['type', 'type_label']);
  });

  it('takes a field nobody built in, and what its owner says it is for', () => {
    const merged = mergeFields([
      { key: 'use_count', description: 'How many times I have read it', keys: ['use_count', 'times_read'] },
    ]);
    expect(keysFor(merged, 'use_count')).toEqual(['use_count', 'times_read']);
    expect(merged.find((f) => f.key === 'use_count')?.description).toBe('How many times I have read it');
  });

  // A description is not a display name — the field is still `type` in every picker and in the note. Kept when
  // the reader edits a row for some other reason, since it is theirs and nothing else here can restore it.
  it('keeps a description through a merge that changes something else', () => {
    const merged = mergeFields([{ key: 'type', description: 'Mine', values: [{ value: 'commentary' }] }]);
    expect(merged.find((f) => f.key === 'type')?.description).toBe('Mine');
  });

  it('keeps the reader’s order of values, with ours after', () => {
    const merged = mergeFields([{ key: 'type', values: [{ value: 'commentary', label: 'Commentary' }] }]);
    expect(merged.find((f) => f.key === 'type')?.values?.map((v) => v.value)).toEqual(['commentary', 'book']);
  });
});

// Whether a field's values are a vocabulary worth naming, or data. Ours to answer for a standard field, theirs
// for one they added — only they know whether `shelf` names six shelves or holds a serial number.
describe('hasValueList', () => {
  it('says yes for the standard fields whose values are a vocabulary', () => {
    expect(hasValueList(undefined, 'type')).toBe(true);
    expect(hasValueList(undefined, 'reading_status')).toBe(true);
  });

  it('says no for a standard field with as many values as there are records', () => {
    expect(hasValueList(undefined, 'title')).toBe(false);
    expect(hasValueList(undefined, 'cover')).toBe(false);
    expect(hasValueList(undefined, 'files')).toBe(false);
    expect(hasValueList(undefined, 'source_notes')).toBe(false);
  });

  // And never overridden for a standard field: the answer for `title` is not a matter of opinion.
  it('ignores a stored answer on a standard field', () => {
    expect(hasValueList({ key: 'title', hasValues: true }, 'title')).toBe(false);
  });

  it('leaves a field of the reader’s own to them, and starts off', () => {
    expect(hasValueList(undefined, 'shelf')).toBe(false);
    expect(hasValueList({ key: 'shelf' }, 'shelf')).toBe(false);
    expect(hasValueList({ key: 'shelf', hasValues: true }, 'shelf')).toBe(true);
  });
});

describe('mergeValues', () => {
  const built = [{ value: 'book' }, { value: 'document' }];

  // Disabled, never deleted: a value Orbis writes would be back the next time anything wrote one, so a list that
  // dropped it would be describing a value the vault is full of.
  it('takes a system value out of the offer without touching the records using it', () => {
    expect(mergeValues(built, [], ['document']).map((v) => v.value)).toEqual(['book']);
  });

  it('lets the reader re-place a system value rather than duplicating it', () => {
    const merged = mergeValues(built, [{ value: 'document', label: 'Paper' }], []);
    expect(merged.map((v) => v.value)).toEqual(['document', 'book']);
    expect(merged[0].label).toBe('Paper');
  });

  it('drops a disabled value even when the reader had placed it', () => {
    expect(mergeValues(built, [{ value: 'book' }], ['book']).map((v) => v.value)).toEqual(['document']);
  });
});

describe('keysFor and fieldForKey', () => {
  const fields = mergeFields([
    { key: 'added', keys: ['added', 'import_date'] },
    { key: 'source_url', keys: ['source_url', 'logos_link'] },
  ]);

  it('walks the keys in reading order', () => {
    expect(keysFor(fields, 'added')).toEqual(['added', 'import_date']);
  });

  it('answers for a field nobody has described', () => {
    expect(keysFor(fields, 'use_count')).toEqual(['use_count']);
    expect(fieldForKey(fields, 'use_count')).toBe('use_count');
  });

  // The direction a question about a CHANGE needs: `logos_link` changed, so which field did that change?
  it('maps a key back to the field it feeds', () => {
    expect(fieldForKey(fields, 'logos_link')).toBe('source_url');
    expect(fieldForKey(fields, 'import_date')).toBe('added');
    expect(fieldForKey(fields, 'source_url')).toBe('source_url');
  });
});

// Which schema a dialog offers. A record collection offering `authors` and `series` under "Fields the library
// reads" invites a condition on a field a reading record has never carried — and the collection then gathers
// nothing, with a picker that claimed otherwise.
describe('fieldsOfSpecies', () => {
  it('offers a record its own fields, and a title note the library schema', () => {
    expect(fieldsOfSpecies('reading_record')).toBe(RECORD_FIELDS);
    expect(fieldsOfSpecies('title')).toBe(LIBRARY_FIELDS);
  });

  it('shares nothing between them but tags', () => {
    const both = RECORD_FIELDS.filter((key) => LIBRARY_FIELDS.includes(key));
    expect(both).toEqual(['tags']);
  });
});

describe('RECORD_FIELDS', () => {
  // Every field offered is one an export actually writes — `RECORD_PROPERTY_KEYS` is the runtime list the record
  // builders are tested against, so a key invented here fails rather than becoming a condition that never matches.
  it('names only keys a record carries', () => {
    expect(RECORD_FIELDS.filter((key) => !RECORD_PROPERTY_KEYS.includes(key))).toEqual([]);
  });

  // The machinery an export writes for navigation and sorting is reachable under "Other keys in your notes" and
  // gets no heading here: `cfi_sort` is an opaque derived string, and a wikilink compares as its own markup.
  it('leaves out the plumbing and the links', () => {
    for (const key of [
      'cfi_sort',
      'orbis_cfi',
      'orbis_id',
      'chapter_index',
      'mark_badge',
      'book',
      'link',
      'link_url',
    ]) {
      expect(RECORD_FIELDS).not.toContain(key);
    }
  });

  // For the reason it is absent from every picker: every record carries it, so a rule on it matches all or none.
  it('leaves out the species key itself', () => {
    expect(RECORD_FIELDS).not.toContain('orbis_note');
  });
});
