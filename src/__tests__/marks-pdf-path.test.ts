import { describe, expect, it } from 'vitest';
import { marksPdfPath } from '../MarksPdfModal';
import type { MarksPdfOptions } from '../marks-pdf';

const opts = (over: Partial<MarksPdfOptions>): MarksPdfOptions =>
  ({ folder: 'tests', fileName: 'A Book marks', ...over }) as MarksPdfOptions;

describe('where the PDF lands', () => {
  it('adds the extension the dialog shows beside the field', () => {
    expect(marksPdfPath(opts({}))).toBe('tests/A Book marks.pdf');
  });

  it('does not double an extension someone typed anyway', () => {
    // The field displays `.pdf` after the input, so typing it is a reasonable mistake — and `name.pdf.pdf` is the
    // kind of thing nobody notices until the file is already sent. The EPUB dialogs strip it the same way.
    expect(marksPdfPath(opts({ fileName: 'A Book marks.pdf' }))).toBe('tests/A Book marks.pdf');
    expect(marksPdfPath(opts({ fileName: 'A Book marks.PDF' }))).toBe('tests/A Book marks.pdf');
  });

  it('writes to the vault root without a doubled slash', () => {
    expect(marksPdfPath(opts({ folder: '/' }))).toBe('/A Book marks.pdf');
    expect(marksPdfPath(opts({ folder: '' }))).toBe('/A Book marks.pdf');
  });

  it('writes a book title Obsidian would refuse as a name it accepts', () => {
    // A biography whose title has a colon, and the dialog proposed it as it was: Obsidian refused the file only
    // when Save was selected. A name typed over the proposal goes through the same rule.
    const title = 'Sample Book: The Remarkable Life of Wren Pellow? Baker, Sailor, Mapmaker of Oakhallow';
    expect(marksPdfPath(opts({ fileName: title }))).toBe(
      'tests/Sample Book The Remarkable Life of Wren Pellow Baker, Sailor, Mapmaker of Oakhallow.pdf'
    );
    expect(marksPdfPath(opts({ fileName: 'a/b\\c' }))).toBe('tests/a b c.pdf');
    expect(marksPdfPath(opts({ fileName: ':::' }))).toBe('tests/book.pdf');
  });

  it('leaves a dot inside the name alone', () => {
    // Only a TRAILING extension is an extension; `v1.2 notes` is a file name.
    expect(marksPdfPath(opts({ fileName: 'v1.2 notes' }))).toBe('tests/v1.2 notes.pdf');
  });
});
