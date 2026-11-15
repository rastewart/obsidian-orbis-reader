// Cutting a path into folder and name, and putting it back — for the generate-notes dialog, which stores whole paths
// and asks for them as two fields.
//
// The property that matters is the ROUND TRIP: whatever the dialog opens with has to survive being split apart to
// draw the controls and rejoined on the first keystroke. A book whose title contains a separator is where that fails
// silently, and silently is the whole problem — the reader sees a sensible name in a sensible folder, and the file
// lands somewhere else.

import { describe, expect, it } from 'vitest';
import { baseNameOf, folderOf, joinVaultPath } from '../vault-path';

describe('folderOf', () => {
  it('takes everything before the last separator', () => {
    expect(folderOf('notes/books/Sample Book Notes.md')).toBe('notes/books');
  });

  it('answers the vault root for a path with no folder', () => {
    // `/` rather than '': it is what the picker offers for the root, so the two agree without a special case.
    expect(folderOf('Sample Book Notes.md')).toBe('/');
    expect(folderOf('')).toBe('/');
  });

  it('cuts at the LAST separator, so a name containing one keeps it', () => {
    expect(folderOf('notes/Vol. 2 of 3.md')).toBe('notes');
  });
});

describe('baseNameOf', () => {
  it('takes everything after the last separator', () => {
    expect(baseNameOf('notes/books/Sample Book Notes.md', '.md')).toBe('Sample Book Notes');
  });

  it('drops the extension only when the path actually ends in it', () => {
    // A book called "Notes on R.md" — the extension is part of the name, not an extension.
    expect(baseNameOf('notes/Reading list.txt', '.md')).toBe('Reading list.txt');
  });

  it('leaves a folder path alone, which has no extension to drop', () => {
    expect(baseNameOf('notes/Sample Book Notes')).toBe('Sample Book Notes');
  });
});

describe('joinVaultPath', () => {
  it('puts the two halves back with the extension', () => {
    expect(joinVaultPath('notes', 'Sample Book Notes', '.md')).toBe('notes/Sample Book Notes.md');
  });

  it('writes no prefix at the vault root', () => {
    expect(joinVaultPath('/', 'Notes', '.md')).toBe('Notes.md');
    expect(joinVaultPath('', 'Notes', '.md')).toBe('Notes.md');
  });

  it('does not double the separator when the folder ends in one', () => {
    expect(joinVaultPath('notes/', 'Notes', '.md')).toBe('notes/Notes.md');
  });

  it('answers an empty path for an empty name, never a bare folder', () => {
    // "No name yet" is a state the dialog has to represent, and `notes/.md` is not it — the Save button reads this.
    expect(joinVaultPath('notes', '', '.md')).toBe('');
    expect(joinVaultPath('notes', '   ', '.md')).toBe('');
  });

  it('trims what the reader typed, since a trailing space in a file name is always a slip', () => {
    expect(joinVaultPath('notes', '  Notes  ', '.md')).toBe('notes/Notes.md');
  });
});

/**
 * The round trip, which is what the dialog actually does on every keystroke: split the stored path to fill the two
 * fields, then rejoin them.
 */
describe('splitting and rejoining', () => {
  const roundTrip = (path: string, ext: string) => joinVaultPath(folderOf(path), baseNameOf(path, ext), ext);

  it.each([
    ['notes/Sample Book Notes.md', '.md'],
    ['Sample Book Notes.md', '.md'],
    ['notes/books/deep/Notes.md', '.md'],
    ['notes/Vol. 2 of 3.md', '.md'],
    ['notes/Sample Book Notes', ''],
    ['Notes', ''],
  ])('returns %s unchanged', (path, ext) => {
    expect(roundTrip(path, ext)).toBe(path);
  });
});
