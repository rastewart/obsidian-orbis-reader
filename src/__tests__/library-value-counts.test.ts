import { afterEach, describe, expect, it } from 'vitest';
import { valueCounts } from '../library/candidates';
import type { CatalogCandidate } from '../library/catalog';
import { setLibraryFields } from '../library/fields';

const note = (frontmatter: Record<string, unknown>, path = 'x.md'): CatalogCandidate => ({
  path,
  frontmatter,
  tags: [],
});

afterEach(() => setLibraryFields([]));

describe('valueCounts', () => {
  it('counts how many records hold each value', () => {
    const counted = valueCounts([note({ type: 'book' }), note({ type: 'book' }), note({ type: 'dvd' })], 'type', 60);
    expect(counted?.counts.get('book')).toBe(2);
    expect(counted?.counts.get('dvd')).toBe(1);
    expect(counted?.none).toBe(0);
  });

  // The number under a value has to be the number of records that will land in that group, and grouping reads
  // aliases. Counting the canonical key alone would report nothing at all for a vault that writes `type_label`,
  // while every dashboard shows those values perfectly well.
  it('counts through the field’s aliases', () => {
    setLibraryFields([{ key: 'type', keys: ['type_label'] }]);
    const counted = valueCounts([note({ type_label: 'Commentary' }), note({ type: 'book' })], 'type', 60);
    expect(counted?.counts.get('Commentary')).toBe(1);
    expect(counted?.counts.get('book')).toBe(1);
    expect(counted?.none).toBe(0);
  });

  // One record, one answer: a note that spells it both ways is not two books.
  it('counts a record once however many spellings it carries', () => {
    setLibraryFields([{ key: 'type', keys: ['type_label'] }]);
    const counted = valueCounts([note({ type: 'book', type_label: 'Book' })], 'type', 60);
    expect(counted?.counts.get('book')).toBe(1);
    expect(counted?.counts.has('Book')).toBe(false);
  });

  it('counts every value of a list, since a record joins each of those groups', () => {
    const counted = valueCounts([note({ tags: ['owned', 'gift'] })], 'tags', 60);
    expect(counted?.counts.get('owned')).toBe(1);
    expect(counted?.counts.get('gift')).toBe(1);
  });

  // What the "no value" row counts. An empty string is an absent answer, not a value — otherwise 2,791 notes
  // written with `reading_status: ""` would report a value nobody can see.
  it('counts records that answer with nothing, blanks included', () => {
    const counted = valueCounts(
      [note({ reading_status: '' }), note({}), note({ reading_status: 'read' })],
      'reading_status',
      60
    );
    expect(counted?.none).toBe(2);
    expect(counted?.counts.get('read')).toBe(1);
  });

  // Past the cap the answer is "these values are data, not vocabulary" — which is what the caller asks in order
  // to decide whether the field is worth listing at all.
  it('gives up past the cap rather than building a map to throw away', () => {
    const many = Array.from({ length: 30 }, (_, i) => note({ title: `T${i}` }, `${i}.md`));
    expect(valueCounts(many, 'title', 10)).toBeNull();
    expect(valueCounts(many, 'title', 60)?.counts.size).toBe(30);
  });
});
