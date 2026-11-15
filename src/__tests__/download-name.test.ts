import { describe, expect, it } from 'vitest';
import { alreadyDownloaded, downloadFileName, uniqueDownloadPath } from '../sources/download-name';

describe('downloadFileName', () => {
  /**
   * **Not the name the URL gives.** A real Gutenberg acquisition URL is `.../12345.epub.noimages`, and Calibre's is
   * `/get/EPUB/42/library` — neither is a filename anyone would recognize in a vault. Title and author is what a vault
   * is organized by, and the entry already told us both.
   */
  it('names a book by its title and author', () => {
    expect(downloadFileName('Sample', ['Orbis Tester'], 'epub')).toBe('Sample - Orbis Tester.epub');
  });

  // The first author only: four names give a filename nobody can read, and the note that describes the book carries
  // all four — the file is a file, the note is the record.
  it('uses the first author when there are several', () => {
    expect(downloadFileName('Another Book', ['Jane Doe', 'John Roe'], 'epub')).toBe('Another Book - Jane Doe.epub');
  });

  it('is just the title when the feed names no author', () => {
    expect(downloadFileName('Third Book', [], 'epub')).toBe('Third Book.epub');
    expect(downloadFileName('Third Book', ['  '], 'mobi')).toBe('Third Book.mobi');
  });

  /**
   * Sanitized by the same function that names a title note, so a book and its note cannot disagree about which
   * characters a filesystem tolerates — Obsidian rejects `\ / : * ? " < > |` outright.
   */
  it('takes out what a filesystem will not have', () => {
    expect(downloadFileName('Fourth Book: A Subtitle', ['Orbis Tester'], 'epub')).toBe(
      'Fourth Book A Subtitle - Orbis Tester.epub'
    );
    // The trailing space a replaced `?` leaves is trimmed, which matters: a filename ending in a space is rejected
    // outright on Windows and merely confusing everywhere else.
    expect(downloadFileName('What/Where?', [], 'cbz')).toBe('What Where.cbz');
  });

  it('always produces something openable', () => {
    expect(downloadFileName('', [], 'epub')).toBe('Untitled.epub');
  });
});

describe('uniqueDownloadPath', () => {
  it('is the plain path when nothing is in the way', () => {
    expect(uniqueDownloadPath('Library/Downloads', 'Sample.epub', new Set())).toBe('Library/Downloads/Sample.epub');
    expect(uniqueDownloadPath('', 'Sample.epub', new Set())).toBe('Sample.epub');
    expect(uniqueDownloadPath('/Books/', 'S.epub', new Set())).toBe('Books/S.epub');
  });

  /**
   * **Never overwrites.** A file already in the vault may be one the reader has started, with a position, marks and a
   * title note pointing at it — and replacing it with bytes from a server is the one mistake here that cannot be
   * undone. The number goes before the extension, so the file is still an EPUB.
   */
  it('steps aside rather than replacing a file', () => {
    const taken = new Set(['Books/Sample.epub', 'Books/Sample (2).epub']);
    expect(uniqueDownloadPath('Books', 'Sample.epub', taken)).toBe('Books/Sample (3).epub');
  });

  // `sample.epub` and `Sample.epub` are one file on macOS and two on Android: a name that collides on one
  // device has to collide on both, or a synced vault grows near-duplicates.
  it('compares names without regard to case', () => {
    expect(uniqueDownloadPath('Books', 'Sample.epub', new Set(['books/sample.epub']))).toBe('Books/Sample (2).epub');
  });

  it('handles a name with no extension at all', () => {
    expect(uniqueDownloadPath('Books', 'Sample', new Set(['Books/Sample']))).toBe('Books/Sample (2)');
  });
});

describe('alreadyDownloaded', () => {
  /**
   * **Skipping is the answer, not a second copy.** A reader who taps five books and already has three wants the two —
   * and with the library on, a second copy would mean a second title note for a book already cataloged.
   */
  it('finds the file that is already there, whatever its case', () => {
    const taken = new Set(['Books/Sample - Orbis Tester.epub']);
    expect(alreadyDownloaded('Books', 'Sample - Orbis Tester.epub', taken)).toBe('Books/Sample - Orbis Tester.epub');
    expect(alreadyDownloaded('books', 'sample - orbis tester.EPUB', taken)).toBe('Books/Sample - Orbis Tester.epub');
  });

  // A different edition of the same book has a different name — the size and format live in the name the feed's link
  // implies, not in this comparison — so this is deliberately an exact-name test rather than a guess at sameness.
  it('says nothing about a file that is not there', () => {
    expect(alreadyDownloaded('Books', 'Sample.epub', new Set(['Books/Other.epub']))).toBeNull();
    expect(alreadyDownloaded('Books', 'Sample.epub', new Set())).toBeNull();
  });
});

describe('downloadFileName with an edition', () => {
  it('names the edition after the author', () => {
    expect(downloadFileName('Moby Dick', ['Melville, Herman'], 'epub', 'no images')).toBe(
      'Moby Dick - Melville, Herman (no images).epub'
    );
  });

  // Cut off by the 120-character cap, two editions of a long title would share a name again.
  it('keeps the edition when the title is long enough to be cut', () => {
    const name = downloadFileName('A'.repeat(200), ['Author'], 'epub', 'no images');
    expect(name.endsWith(' (no images).epub')).toBe(true);
    expect(name.length).toBeLessThanOrEqual(120 + '.epub'.length);
  });
});
