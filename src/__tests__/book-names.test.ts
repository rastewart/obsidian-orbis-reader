// A book's name, and the files named after it: a title note is only its own book's, two books never share a records
// folder, and a name a book chooses is one every device can write. Each answers a finding of the November security
// scan; see docs/design/security.md, "Book metadata reaching a file path".

import { describe, expect, it } from 'vitest';
import { linkNamesFile } from '../library/title-note-cleanup';
import { recordBookName } from '../reader/record-book-name';
import { sanitizeVaultName } from '../vault-names';

/** A vault where no link reads as the path of a file still in it. */
const nothing = () => false;

describe('a title note’s link names its own book', () => {
  const note = 'Library/Titles/Sample Book.md';

  it('does not match a book of the same name in another folder when the link names a path', () => {
    expect(linkNamesFile('Inbox/Sample Book.epub', 'Library/Sample Book.epub', note, nothing)).toBe(false);
  });

  it('still matches a shortest-form link by name, where Obsidian makes the name unique', () => {
    expect(linkNamesFile('Sample Book.epub', 'Library/Sample Book.epub', note, nothing)).toBe(true);
  });

  it('does not match a book at the top of the vault, whose link has no folder either', () => {
    const atTop = (path: string) => path === 'Sample Book.epub';
    expect(linkNamesFile('Sample Book.epub', 'Inbox/Sample Book.epub', note, atTop)).toBe(false);
    expect(linkNamesFile('Sample Book.epub', 'Sample Book.epub', note, atTop)).toBe(true);
  });
});

describe('two books never share a records folder', () => {
  it('tells apart names that are written the same once sanitized', () => {
    const all = ['A/Sample: Book.epub', 'B/Sample? Book.epub'];
    const names = all.map((p) => recordBookName(p, all));
    expect(names[0]).not.toBe(names[1]);
    expect(names).toEqual(['A — Sample Book', 'B — Sample Book']);
  });

  it('tells apart long titles that are the same for their first 80 characters', () => {
    const stem = 'A Very Long Series Title That Goes On And On Past Any Reasonable Length, Volume';
    const all = [`Books/${stem} One.epub`, `Books/${stem} Two.epub`];
    const [a, b] = all.map((p) => recordBookName(p, all));
    expect(a).not.toBe(b);
  });

  it('tells apart names that differ only in case, which the Mac and Windows treat as one', () => {
    const all = ['A/sample.epub', 'B/Sample.epub'];
    expect(all.map((p) => recordBookName(p, all))).toEqual(['A — sample', 'B — Sample']);
  });

  it('gives a code from the path when even the whole path is written the same', () => {
    const all = ['Shelf/Sample: Book.epub', 'Shelf/Sample? Book.epub'];
    const [a, b] = all.map((p) => recordBookName(p, all));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^Shelf — Sample Book — [0-9a-f]{6}$/);
    expect(recordBookName(all[0], all)).toBe(a); // the same on every device
  });
});

describe('a name a book chooses can be written on every device', () => {
  const name = (s: string) => sanitizeVaultName(s, { max: 80, fallback: 'Untitled' });

  it('loses a trailing dot or space, which Windows drops from a file name', () => {
    expect(name('And Then...')).toBe('And Then');
    expect(name('Sample Book. ')).toBe('Sample Book');
  });

  it('keeps a Windows device name from being the name', () => {
    expect(name('NUL')).toBe('_NUL');
    expect(name('con.notes')).toBe('_con.notes');
    expect(name('Lpt1')).toBe('_Lpt1');
    expect(name('Console')).toBe('Console');
  });

  it('loses control characters and the marks that reorder or hide text', () => {
    expect(name('Sample‮Book\u0007​')).toBe('Sample Book');
  });

  it('loses every other mark that shows as nothing: soft hyphen, Arabic letter mark, fillers, tag characters', () => {
    for (const hidden of ['\u00ad', '\u061c', '\u180e', '\u3164', '\u115f', '\uffa0', '\u{e0041}'])
      expect(name(`Sample${hidden}Book`)).toBe('Sample Book');
  });

  it('keeps the letters and marks a title is written in', () => {
    expect(name('Café — Ψυχή 東京 🎵')).toBe('Café — Ψυχή 東京 🎵');
  });

  it('falls back when nothing is left', () => {
    expect(name('...')).toBe('Untitled');
  });
});
