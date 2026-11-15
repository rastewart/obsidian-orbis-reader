import { describe, expect, it } from 'vitest';
import { byName, compareNames } from '../by-name';
import { collectionsOfSpecies } from '../library/collection-species';
import type { LibraryCollection } from '../settings';

// Lists a reader cannot reorder are shown sorted by name, the same on every device. Before, they were shown in the
// order each device had stored them, which is the order it made or received them in — so the Notes styles dropdown
// read differently on the Mac and on Windows.
describe('byName', () => {
  it('gives the same order whatever order the items are stored in', () => {
    const onTheMac = [{ name: 'Test notes' }, { name: 'Another style' }, { name: 'Orbis style' }];
    const onWindows = [{ name: 'Orbis style' }, { name: 'Test notes' }, { name: 'Another style' }];
    const names = (list: { name: string }[]) => byName(list).map((s) => s.name);
    expect(names(onTheMac)).toEqual(['Another style', 'Orbis style', 'Test notes']);
    expect(names(onWindows)).toEqual(names(onTheMac));
  });

  it('ignores case and accents, and reads numbers as numbers', () => {
    expect(compareNames('apple', 'Apple')).toBe(0);
    expect(compareNames('Émile', 'Emile')).toBe(0);
    expect(byName([{ name: 'Style 10' }, { name: 'Style 2' }]).map((s) => s.name)).toEqual(['Style 2', 'Style 10']);
  });

  it('sorts by another key when given one, and leaves the list itself alone', () => {
    const words = ['weir', 'Esker', 'lantern'];
    expect(byName(words, (w) => w)).toEqual(['Esker', 'lantern', 'weir']);
    expect(words).toEqual(['weir', 'Esker', 'lantern']);
  });
});

describe('collectionsOfSpecies', () => {
  it('lists collections by name through the shared order', () => {
    const c = (name: string) => ({ id: name, name }) as unknown as LibraryCollection;
    const sorted = collectionsOfSpecies([c('to read'), c('Finished'), c('reading 2'), c('Reading 10')], 'title');
    expect(sorted.map((x) => x.name)).toEqual(['Finished', 'reading 2', 'Reading 10', 'to read']);
  });
});
