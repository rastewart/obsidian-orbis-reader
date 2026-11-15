import { describe, expect, it } from 'vitest';
import { notesNamed, titleSearchQuery } from '../reader/lookup/vault-notes';

const files = (...names: string[]) => names.map((basename) => ({ basename }));

describe('notesNamed', () => {
  /**
   * **Every match, not the best one.** Two notes called `sample` in different folders: picking one with
   * `getFirstLinkpathDest` would show a single "Open note: sample", with nothing saying the other exists.
   */
  it('finds every note with the name, not the best one', () => {
    const found = notesNamed(files('sample', 'Sample Book Notes', 'sample', 'notes'), 'sample');
    expect(found).toHaveLength(2);
  });

  it('ignores case, which is how a capitalised word in a book finds a lowercase note', () => {
    expect(notesNamed(files('sample'), 'Sample')).toHaveLength(1);
    expect(notesNamed(files('Sample'), 'sample')).toHaveLength(1);
  });

  it('matches the whole name, never part of one', () => {
    expect(notesNamed(files('Sample Book Notes'), 'sample')).toHaveLength(0);
    expect(notesNamed(files('sample'), 'sample book')).toHaveLength(0);
  });

  it('trims the selection, since a selection carries whatever whitespace was dragged over', () => {
    expect(notesNamed(files('sample'), '  sample \n')).toHaveLength(1);
  });

  it('answers nothing for an empty selection rather than matching an empty basename', () => {
    expect(notesNamed(files(''), '   ')).toHaveLength(0);
  });

  it('keeps the vault order it was given, without ranking the notes', () => {
    const found = notesNamed(files('sample', 'other', 'SAMPLE'), 'sample');
    expect(found.map((f) => f.basename)).toEqual(['sample', 'SAMPLE']);
  });
});

describe('titleSearchQuery', () => {
  it('asks Obsidian for a filename search', () => {
    expect(titleSearchQuery('sample')).toBe('file:"sample"');
  });

  // A multi-word selection has to stay one term, or `file:point of view` searches for `file:point` and two
  // loose words.
  it('quotes a phrase', () => {
    expect(titleSearchQuery('point of view')).toBe('file:"point of view"');
  });
});
