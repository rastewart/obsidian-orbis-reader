// Names come from books, and a book's metadata is written by whoever made the file.
//
// Most of this is about legibility — a title with a colon should still read as a title. The `..` cases are not:
// a name is written into a path, and a segment meaning "the parent folder" is how a file lands somewhere nobody
// chose. Both wrappers are asserted, because the failure this guards against is the two of them disagreeing.

import { describe, expect, it } from 'vitest';
import { sanitizeName } from '../book-extractor';
import { sanitizeNoteName } from '../library/record-note';
import { exportFileName, sanitizeVaultName } from '../vault-names';

describe('path segments that are directions, not names', () => {
  it('refuses to produce a bare parent-folder segment', () => {
    expect(sanitizeVaultName('..', { max: 80 })).toBe('');
    expect(sanitizeName('..')).toBe('');
    expect(sanitizeNoteName('..')).toBe('Untitled');
  });

  it('strips leading dots, which also hide a file on every Unix-alike', () => {
    expect(sanitizeName('.hidden')).toBe('hidden');
    expect(sanitizeNoteName('...Sample')).toBe('Sample');
  });

  /** The separators go first, so a traversal cannot survive as a path at all — the dot strip is the second line
   *  of defense for what is left over. */
  it('cannot produce a traversal from a title that tries', () => {
    const out = sanitizeName('../../../.obsidian/plugins/evil');
    expect(out).not.toContain('/');
    expect(out).not.toContain('\\');
    expect(out.startsWith('.')).toBe(false);
    // The leading run of dots and spaces goes entirely, rather than one dot run at a time.
    expect(out).toBe('obsidian plugins evil');
  });

  it('keeps interior dots, which are ordinary in a title', () => {
    expect(sanitizeName('Vol. 1')).toBe('Vol. 1');
    expect(sanitizeNoteName('R.J.T. Tester')).toBe('R.J.T. Tester');
  });
});

describe('legibility', () => {
  /** Deleting rather than replacing welds words together, so both wrappers replace. */
  it('replaces an illegal character with a space rather than deleting it', () => {
    expect(sanitizeName('Sample Book:A Subtitle')).toBe('Sample Book A Subtitle');
    expect(sanitizeNoteName('Another Book/Sequel')).toBe('Another Book Sequel');
  });

  it('does not double a space that was already there', () => {
    expect(sanitizeName('Sample Book: A Subtitle')).toBe('Sample Book A Subtitle');
  });

  it('removes every character Obsidian or a filesystem rejects', () => {
    expect(sanitizeName('a\\b/c:d*e?f"g<h>i|j#k^l[m]n')).toBe('a b c d e f g h i j k l m n');
  });
});

describe('the one difference that is a decision', () => {
  it('caps a chapter file at 80 and a note at 120', () => {
    const long = 'x'.repeat(200);
    expect(sanitizeName(long)).toHaveLength(80);
    expect(sanitizeNoteName(long)).toHaveLength(120);
  });

  it('gives a note a fallback and a chapter file none — the caller supplies its own', () => {
    expect(sanitizeNoteName('   ')).toBe('Untitled');
    expect(sanitizeName('   ')).toBe('');
  });

  /** A filename ending in a space is legal on a Mac and rejected on Windows, so the cut is trimmed after it is
   *  made. It does not truncate at a word boundary — that would be a nicer promise than the code makes. */
  it('never leaves a trailing space where it truncated', () => {
    const out = sanitizeVaultName(`${'a'.repeat(79)} tail`, { max: 80 });
    expect(out).toBe('a'.repeat(79));
    expect(sanitizeVaultName(`${'a'.repeat(78)} tail`, { max: 80 }).endsWith(' ')).toBe(false);
  });
});

describe('the name an export writes', () => {
  it('is the title with what a vault refuses replaced by spaces', () => {
    expect(exportFileName('Sample Book: A Subtitle', 'x')).toBe('Sample Book A Subtitle');
    expect(exportFileName('A*B?C"D<E>F|G#H^I[J]', 'x')).toBe('A B C D E F G H I J');
  });

  it('falls back when nothing usable is left, and never names a parent folder', () => {
    expect(exportFileName(':::', 'exported-book')).toBe('exported-book');
    expect(exportFileName('..', 'book')).toBe('book');
    expect(exportFileName('', '')).toBe('');
  });

  it('keeps a whole book title, up to 120 characters', () => {
    expect(exportFileName('a'.repeat(130), 'x')).toBe('a'.repeat(120));
  });
});
