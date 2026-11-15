import { describe, expect, it } from 'vitest';
import { recordFrontmatter, recordLinkText } from '../library/record-note';
import { linkNamesFile, TITLE_NOTE_PROPERTY_KEYS, titleNoteKeepReason } from '../library/title-note-cleanup';

/** A vault where no link reads as the path of a file still in it. */
const nothing = () => false;

// The lookup has to work on a file that is ALREADY GONE — that is the whole point of it being textual. If
// resolution comes back empty for every record, nothing is logged about the title note, because "no record" is the
// silent case.
describe('linkNamesFile', () => {
  const note = 'fixtures/library/Sample Book.md';

  it('matches a link written as a full path', () => {
    expect(linkNamesFile('Books/Sample Book.epub', 'Books/Sample Book.epub', note, nothing)).toBe(true);
  });

  // The hard shape: the record sits in `fixtures/library`, the book in `aaa-book-notes`, and the link
  // is shortest-form. No path candidate can reach it, and with the file deleted Obsidian cannot either.
  it('matches a shortest-form link to a book in another folder', () => {
    expect(linkNamesFile('Sample Book.epub', 'aaa-book-notes/Sample Book.epub', note, nothing)).toBe(true);
  });

  it('matches a link written relative to the note’s folder', () => {
    expect(linkNamesFile('epub/Sample Book.epub', 'fixtures/library/epub/Sample Book.epub', note, nothing)).toBe(true);
  });

  it('ignores a heading reference on the end', () => {
    expect(linkNamesFile('Sample Book.epub#Chapter 1', 'Books/Sample Book.epub', note, nothing)).toBe(true);
  });

  it('does not match a different book', () => {
    expect(linkNamesFile('Sample Book Two.epub', 'Books/Sample Book.epub', note, nothing)).toBe(false);
    expect(linkNamesFile('', 'Books/Sample Book.epub', note, nothing)).toBe(false);
  });

  // Same name, different extension: an EPUB and a PDF of one title are two files, and deleting one is not
  // deleting the other.
  it('does not match the same title in another format', () => {
    expect(linkNamesFile('Sample Book.pdf', 'Books/Sample Book.epub', note, nothing)).toBe(false);
  });
});

const base = {
  body: '',
  frontmatter: { orbis_note: 'title', title: 'Sample Book', files: ['[[Sample Book.epub]]'] } as Record<
    string,
    unknown
  >,
  resolvedLinks: {} as Record<string, Record<string, number>>,
  path: 'Library/Titles/Sample Book.md',
  otherFiles: [] as string[],
};

describe('titleNoteKeepReason', () => {
  it('lets a note the converter wrote and nobody touched go', () => {
    expect(titleNoteKeepReason(base)).toBe(null);
  });

  it('keeps a note with the reader’s own writing in it', () => {
    expect(titleNoteKeepReason({ ...base, body: '\nI read this twice.\n' })).toBe('wrote');
  });

  // Whitespace is not writing — a trailing newline after the frontmatter is how a file ends, not an opinion.
  it('does not mistake blank space for writing', () => {
    expect(titleNoteKeepReason({ ...base, body: '\n\n  \n' })).toBe(null);
  });

  /**
   * **Orbis's own region is not the reader's writing.** `recordNoteContent` wraps the book's embed in
   * `%%orbis:begin%% … %%orbis:end%%`. Counted as writing, every note the cataloging review writes would read as
   * "you wrote in this": kept after its book is deleted, with `files` trimmed to nothing and a notice explaining a
   * decision nobody made. The converter is not the only writer of notes, and it does not write frontmatter alone.
   */
  it('does not mistake its own region for the reader’s writing', () => {
    const body = '\n%%orbis:begin%%\n![[ebooks/Third Book - Tester, Orbis.epub]]\n%%orbis:end%%\n';
    expect(titleNoteKeepReason({ ...base, body })).toBe(null);
  });

  // Anything OUTSIDE the region still counts, which is the whole point of having markers rather than a heuristic.
  it('keeps a note with writing beside the region', () => {
    const body = '%%orbis:begin%%\n![[Sample Book.epub]]\n%%orbis:end%%\n\nBought this in Lisbon.\n';
    expect(titleNoteKeepReason({ ...base, body })).toBe('wrote');
  });

  // A region someone edited into an odd state takes everything after its opening marker with it: reading half of our
  // own block as somebody's prose is the failure this exists to avoid.
  it('treats an unterminated region as ours', () => {
    expect(titleNoteKeepReason({ ...base, body: '%%orbis:begin%%\n![[Sample Book.epub]]\n' })).toBe(null);
  });

  it('keeps a note carrying a property the library never writes', () => {
    const frontmatter = { ...base.frontmatter, reading_status: 'read' };
    expect(titleNoteKeepReason({ ...base, frontmatter })).toBe('properties');
  });

  it('keeps a note another note links to', () => {
    const resolvedLinks = { 'Notes/Reading log.md': { 'Library/Titles/Sample Book.md': 1 } };
    expect(titleNoteKeepReason({ ...base, resolvedLinks })).toBe('linked');
  });

  // Its own links point outward — to the book, the cover, the source note — and must not read as an inbound one.
  it('ignores the note’s own links', () => {
    const resolvedLinks = { 'Library/Titles/Sample Book.md': { 'Library/Titles/Sample Book.md': 1 } };
    expect(titleNoteKeepReason({ ...base, resolvedLinks })).toBe(null);
  });

  // One title, two editions: deleting the EPUB says nothing about the PDF beside it.
  it('keeps a note that still lists another file', () => {
    expect(titleNoteKeepReason({ ...base, otherFiles: ['[[Sample Book.pdf]]'] })).toBe('other-files');
  });

  // Ranked, because a note can qualify twice and the reader is told one reason: the one that is most clearly
  // about them comes first.
  it('reports the remaining file before the reader’s writing', () => {
    expect(titleNoteKeepReason({ ...base, body: 'notes', otherFiles: ['[[Sample Book.pdf]]'] })).toBe('other-files');
  });
});

// The guard the reading records have, for the same reason: the runtime list is what decides whether a file is
// deleted, so a property added to `recordFrontmatter` without being listed here would make every converted note
// look reader-edited — and silently stop the cleanup working at all.
describe('TITLE_NOTE_PROPERTY_KEYS', () => {
  it('lists every key the library actually writes', () => {
    const written = recordFrontmatter({
      title: 'Sample Book',
      type: 'book',
      genre: 'science fiction',
      authors: ['Orbis Tester'],
      publisher: 'Sample Press',
      publicationDate: '2020',
      language: 'en',
      series: 'Sample Series',
      seriesIndex: '1',
      isbn: '9780000000002',
      cover: 'Library/Titles/covers/Sample Book.jpg',
      files: ['Books/Sample Book.epub'],
      source: 'markdown-note',
      sourceId: 'abc',
      sourceUrl: 'https://example.com',
      sourceNotes: ['Notes/Sample Book.md'],
      added: '2026-08-16',
    });
    const keys = written
      .split('\n')
      .map((line) => line.match(/^([a-z_]+):/)?.[1])
      .filter((key): key is string => !!key);
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) expect(TITLE_NOTE_PROPERTY_KEYS).toContain(key);
  });
});

// A record's links are identity, not prose: they say WHICH copy this is. `fileToLinktext` writes the shortest
// unambiguous form, so a book with a unique name today would become `[[Book.epub]]` — and mean a different file the
// day a second `Book.epub` appeared elsewhere.
describe('recordLinkText', () => {
  it('writes the full vault path for a book', () => {
    expect(recordLinkText({ path: 'aaa-book-notes/Sample Book.epub', extension: 'epub' })).toBe(
      'aaa-book-notes/Sample Book.epub'
    );
  });

  it('drops .md for a note, as Obsidian writes it', () => {
    expect(recordLinkText({ path: 'Notes/Sample Book.md', extension: 'md' })).toBe('Notes/Sample Book');
  });

  it('keeps a book at the vault root as its plain name', () => {
    expect(recordLinkText({ path: 'Sample Book.epub', extension: 'epub' })).toBe('Sample Book.epub');
  });
});

// Stripping the deleted book out of a KEPT record's `files` uses the same match as finding the record in the
// first place — a record that keeps a second edition must lose exactly one row, and the right one.
describe('the rows a kept record loses', () => {
  const note = 'fixtures/library/Sample Book.md';
  const strip = (links: string[], bookPath: string): string[] =>
    links.filter((link) => !linkNamesFile(link, bookPath, note, nothing));

  it('drops the deleted book and keeps the other edition', () => {
    expect(strip(['Books/Sample Book.epub', 'Books/Sample Book.pdf'], 'Books/Sample Book.epub')).toEqual([
      'Books/Sample Book.pdf',
    ]);
  });

  it('drops a shortest-form row naming the deleted book', () => {
    expect(strip(['Sample Book.epub', 'Books/Sample Book.pdf'], 'aaa/Sample Book.epub')).toEqual([
      'Books/Sample Book.pdf',
    ]);
  });

  it('leaves a record alone when the deleted book is not among its files', () => {
    const links = ['Books/Sample Book.pdf'];
    expect(strip(links, 'Books/Another Book.epub')).toEqual(links);
  });
});
