import { describe, expect, it } from 'vitest';
import { EMPTY_OPF_METADATA, metadataFromOpf, normalizeIsbn, opfPathFromContainer } from '../library/opf';
import { parseRecord } from '../library/record';
import {
  ORBIS_REGION_END,
  ORBIS_REGION_START,
  recordFrontmatter,
  recordNoteContent,
  sanitizeNoteName,
  uniqueNotePath,
  wikilink,
  yamlScalar,
  yamlString,
} from '../library/record-note';
import { candidatePaths } from '../library/resolve';
import { titleNoteKeepReason } from '../library/title-note-cleanup';

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Sample Book: A Subtitle</dc:title>
    <dc:creator>Tester, Orbis</dc:creator>
    <dc:creator>Someone Else</dc:creator>
    <dc:publisher>Sample Press</dc:publisher>
    <dc:date>2008-09-09</dc:date>
    <dc:language>en</dc:language>
    <dc:identifier id="uuid">urn:uuid:1b3f-99</dc:identifier>
    <dc:identifier>urn:isbn:978-1-23-456789-7</dc:identifier>
    <meta name="calibre:series" content="Sample Series"/>
    <meta name="calibre:series_index" content="2"/>
  </metadata>
</package>`;

describe('opfPathFromContainer', () => {
  it('reads the path rather than assuming the convention', () => {
    expect(opfPathFromContainer(CONTAINER)).toBe('OEBPS/content.opf');
  });

  it('is null for a container it cannot read', () => {
    expect(opfPathFromContainer('<container></container>')).toBeNull();
    expect(opfPathFromContainer('not xml at all <<<')).toBeNull();
    expect(opfPathFromContainer('')).toBeNull();
  });
});

describe('metadataFromOpf', () => {
  it('reads what the record schema wants', () => {
    const meta = metadataFromOpf(OPF);
    expect(meta.title).toBe('Sample Book: A Subtitle');
    expect(meta.publisher).toBe('Sample Press');
    expect(meta.published).toBe('2008-09-09');
    expect(meta.language).toBe('en');
    expect(meta.series).toBe('Sample Series');
    expect(meta.seriesIndex).toBe('2');
  });

  // An anthology or a translation names several, and `authors` is a list precisely so it need not choose.
  it('keeps every creator', () => {
    expect(metadataFromOpf(OPF).authors).toEqual(['Tester, Orbis', 'Someone Else']);
  });

  // A book's identifiers are usually a UUID and maybe an ISBN; only the second is a fact about the book.
  it('picks the ISBN out of the identifiers by shape', () => {
    expect(metadataFromOpf(OPF).isbn).toBe('9781234567897');
  });

  it('survives an OPF that is malformed or says nothing', () => {
    expect(metadataFromOpf('<<< broken')).toEqual(EMPTY_OPF_METADATA);
    expect(metadataFromOpf('<package><metadata/></package>')).toEqual(EMPTY_OPF_METADATA);
  });

  // Real books ship careless XML; matching on the local name is what makes this work across it.
  it('ignores namespace prefixes', () => {
    const odd = `<pkg:package xmlns:pkg="http://www.idpf.org/2007/opf" xmlns:x="http://purl.org/dc/elements/1.1/">
      <pkg:metadata><x:title>Bare</x:title></pkg:metadata></pkg:package>`;
    expect(metadataFromOpf(odd).title).toBe('Bare');
  });
});

describe('normalizeIsbn', () => {
  it('accepts the forms books actually write', () => {
    expect(normalizeIsbn('urn:isbn:978-1-23-456789-7')).toBe('9781234567897');
    expect(normalizeIsbn('ISBN 0-12-345678-9')).toBe('0123456789');
    expect(normalizeIsbn('123456713X')).toBe('123456713X');
  });

  it('rejects anything that is not one', () => {
    expect(normalizeIsbn('urn:uuid:1b3f-99')).toBe('');
    expect(normalizeIsbn('12345')).toBe('');
    expect(normalizeIsbn('')).toBe('');
  });
});

describe('yamlString', () => {
  // A bare title with a colon is a mapping; an apostrophe breaks a single-quoted scalar; a bare 2008 is a number.
  it('quotes and escapes so a parser reads back what was written', () => {
    expect(yamlString('Sample Book: A Subtitle')).toBe('"Sample Book: A Subtitle"');
    expect(yamlString('He said "hi"')).toBe('"He said \\"hi\\""');
    expect(yamlString('back\\slash')).toBe('"back\\\\slash"');
  });
});

describe('recordFrontmatter', () => {
  it('writes only the fields that have values', () => {
    const fm = recordFrontmatter({ title: 'Another-Book', authors: ['Doe, Jane'] });
    // Bare, as Obsidian writes them — see `yamlScalar`.
    expect(fm).toContain('title: Another-Book');
    expect(fm).toContain('  - Doe, Jane');
    expect(fm).not.toContain('publisher:');
    expect(fm).not.toContain('isbn:');
  });

  it('drops empty strings rather than writing empty keys', () => {
    const fm = recordFrontmatter({ title: 'T', publisher: '   ', authors: ['', ' '] });
    expect(fm).not.toContain('publisher:');
    expect(fm).not.toContain('authors:');
  });

  // The round trip is the point: whatever is written here has to come back through the reader unchanged.
  it('round-trips through the record parser', () => {
    const content = recordFrontmatter({
      title: 'Sample Book: A Subtitle',
      authors: ['Tester, Orbis'],
      files: ['epub/Sample.epub'],
      isbn: '9781234567897',
      seriesIndex: '2',
    });
    // Mirrors how Obsidian hands frontmatter over: parsed values, not raw text — including the line that makes it
    // a record at all, which `recordFrontmatter` writes first.
    const parsed = parseRecord('x.md', {
      orbis_note: 'title',
      title: 'Sample Book: A Subtitle',
      authors: ['Tester, Orbis'],
      files: ['[[epub/Sample.epub]]'],
      isbn: '9781234567897',
      series_index: '2',
    });
    expect(content).toContain('title: "Sample Book: A Subtitle"');
    expect(parsed?.title).toBe('Sample Book: A Subtitle');
    expect(parsed?.files).toEqual(['epub/Sample.epub']);
  });
});

// A bare path resolves too, so this looks cosmetic — until the file moves and Obsidian rewrites every link
// except the one that was not a link.
describe('wikilink', () => {
  it('brackets a plain path', () => {
    expect(wikilink('epub/Sample.epub')).toBe('[[epub/Sample.epub]]');
  });

  it('leaves an existing link alone rather than nesting brackets', () => {
    expect(wikilink('[[epub/Sample.epub]]')).toBe('[[epub/Sample.epub]]');
    expect(wikilink('![[covers/x.jpg]]')).toBe('![[covers/x.jpg]]');
    expect(wikilink('[label](epub/x.epub)')).toBe('[label](epub/x.epub)');
  });

  it('reaches the frontmatter, so a generated record links its file', () => {
    const fm = recordFrontmatter({ title: 'T', files: ['fixtures/annotation-workhorse.mobi'], cover: 'covers/t.jpg' });
    expect(fm).toContain('  - "[[fixtures/annotation-workhorse.mobi]]"');
    expect(fm).toContain('cover: "[[covers/t.jpg]]"');
  });
});

describe('recordNoteContent', () => {
  // `files` already names the book, and a second copy in the body was one a rename could leave behind.
  it('names the book in files, and writes no embed or region in the body', () => {
    const note = recordNoteContent({ title: 'T', files: ['epub/T.epub'] });
    expect(note).toContain('  - "[[epub/T.epub]]"');
    expect(note).not.toContain('![[');
    expect(note).not.toContain(ORBIS_REGION_START);
    expect(note).not.toContain(ORBIS_REGION_END);
    expect(note.endsWith('---\n')).toBe(true);
  });

  // The body a new note is written with is empty, so the deletion check reads it as nothing of the reader's.
  it('leaves a body the deletion check reads as unwritten', () => {
    const note = recordNoteContent({ title: 'T', files: ['epub/T.epub'] });
    const body = note.slice(note.lastIndexOf('---\n') + 4);
    expect(
      titleNoteKeepReason({ body, frontmatter: { title: 'T' }, resolvedLinks: {}, path: 'T.md', otherFiles: [] })
    ).toBe(null);
  });
});

describe('sanitizeNoteName', () => {
  it('replaces the characters a vault rejects with a space, not with nothing', () => {
    expect(sanitizeNoteName('Sample Book: A Subtitle')).toBe('Sample Book A Subtitle');
    expect(sanitizeNoteName('Who? What/Why|How')).toBe('Who What Why How');
    expect(sanitizeNoteName('Notes [draft] #2')).toBe('Notes draft 2');
  });

  it('refuses a leading dot, which would hide the note', () => {
    expect(sanitizeNoteName('.hidden')).toBe('hidden');
  });

  it('has something to fall back on', () => {
    expect(sanitizeNoteName('   ')).toBe('Untitled');
    expect(sanitizeNoteName('///')).toBe('Untitled');
  });

  it('keeps a filename within what a filesystem accepts', () => {
    expect(sanitizeNoteName('x'.repeat(300)).length).toBeLessThanOrEqual(120);
  });
});

describe('uniqueNotePath', () => {
  it('uses the title when nothing is in the way', () => {
    expect(uniqueNotePath('Library/Titles', 'Another-Book', new Set())).toBe('Library/Titles/Another-Book.md');
  });

  // Two books can legitimately share a title, and overwriting one would destroy whatever was written in it.
  it('never returns a path that is taken', () => {
    const taken = new Set(['Library/Titles/Another-Book.md', 'Library/Titles/Another-Book (2).md']);
    expect(uniqueNotePath('Library/Titles', 'Another-Book', taken)).toBe('Library/Titles/Another-Book (3).md');
  });

  it('compares case-insensitively, as the filesystem may', () => {
    const taken = new Set(['library/titles/another-book.md']);
    expect(uniqueNotePath('Library/Titles', 'Another-Book', taken)).toBe('Library/Titles/Another-Book (2).md');
  });

  it('handles the vault root and stray slashes', () => {
    expect(uniqueNotePath('', 'T', new Set())).toBe('T.md');
    expect(uniqueNotePath('/Books/', 'T', new Set())).toBe('Books/T.md');
  });
});

// A catalog written by a script says `epub/Book.epub` from a note in `Library/Titles/`, meaning
// `Library/epub/Book.epub` — relative to an ANCESTOR of the note, which is neither the vault root nor the
// note's own folder. Getting this order wrong leaves such books looking uncataloged.
describe('candidatePaths', () => {
  it("walks the note's ancestors, nearest first", () => {
    expect(candidatePaths('epub/Book.epub', 'Library/Titles/A Book [1] (Calibre).md')).toEqual([
      'Library/Titles/epub/Book.epub',
      'Library/epub/Book.epub',
      'epub/Book.epub',
    ]);
  });

  it('keeps a # that belongs to the filename', () => {
    expect(candidatePaths('epub/Book #3.epub', 'Library/Titles/x.md')).toContain('Library/epub/Book #3.epub');
  });

  it('handles a note at the vault root', () => {
    expect(candidatePaths('epub/Book.epub', 'x.md')).toEqual(['epub/Book.epub']);
  });

  it('ignores a leading slash and blank links', () => {
    expect(candidatePaths('/epub/Book.epub', 'x.md')).toEqual(['epub/Book.epub']);
    expect(candidatePaths('   ', 'x.md')).toEqual([]);
  });
});

/** A title note's values are bare where YAML reads them back as the same text, and quoted everywhere else. */
describe('yamlScalar', () => {
  it('writes ordinary text bare, as Obsidian does', () => {
    for (const value of [
      'Footnotes',
      'Doe, Jane',
      'book',
      'en',
      '2026-10-04',
      "Austen's Letters",
      '007 - Core Concepts',
    ]) {
      expect(yamlScalar(value)).toBe(value);
    }
  });

  it('quotes what YAML would read as something else, or could not read at all', () => {
    for (const value of [
      'true',
      'No',
      'null',
      '2011',
      '3.5',
      '1e3',
      '0x1F',
      '[[fixtures/footnotes.epub]]',
      '- dash first',
      '"quoted"',
      "'quoted'",
      'Key: value',
      'Title #3 is not a comment', // ` #` starts a comment
      'Ends with:',
      ' leading space',
      'Sample\ntags: [owned]',
      '',
    ]) {
      expect(yamlScalar(value)).toBe(yamlString(value));
    }
  });
});
