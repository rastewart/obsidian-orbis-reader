import { describe, expect, it } from 'vitest';
import { collectionsOfSpecies, speciesOf } from '../library/collection-species';
import type { LibraryCollection } from '../settings';

const titles = (id: string): LibraryCollection => ({ id, name: id, ruleSets: [], enabled: true });
const records = (id: string): LibraryCollection => ({ ...titles(id), species: 'reading_record' });

describe('speciesOf', () => {
  // Every collection that existed before reading records did is a title collection, so absent has to mean titles —
  // which is also what lets the field be written only when it differs, and an old `data.json` stay correct.
  it('reads a collection with nothing to say as a title collection', () => {
    expect(speciesOf(titles('a'))).toBe('title');
    expect(speciesOf({ ...titles('a'), species: 'title' })).toBe('title');
    expect(speciesOf(records('a'))).toBe('reading_record');
  });
});

describe('collectionsOfSpecies', () => {
  const all = [titles('a'), records('b'), titles('c')];

  it('is each list, by name', () => {
    expect(collectionsOfSpecies(all, 'title').map((c) => c.id)).toEqual(['a', 'c']);
    expect(collectionsOfSpecies(all, 'reading_record').map((c) => c.id)).toEqual(['b']);
  });

  // **Alphabetical, not the order they were added.** A collection is a file of its own now, and a folder of files
  // has nowhere to keep an array's order — see the note on `collectionsOfSpecies`.
  it('sorts by name rather than by when they were made', () => {
    const jumbled = [titles('zeta'), titles('alpha'), titles('Mid')];
    expect(collectionsOfSpecies(jumbled, 'title').map((c) => c.name)).toEqual(['alpha', 'Mid', 'zeta']);
  });

  // What the widget picker offers. A widget pointed at the other species would paint nothing and say nothing about
  // why, so the wrong answer is not offered rather than warned about.
  it('is empty rather than absent when a vault has none of one', () => {
    expect(collectionsOfSpecies([titles('a')], 'reading_record')).toEqual([]);
  });
});
