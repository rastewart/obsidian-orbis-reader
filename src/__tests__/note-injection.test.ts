// Book metadata and book text reaching a note, and the two structures they could break.
//
// A title, an author and a passage all come from a file someone else made. Orbis builds structure by hand around
// them — frontmatter for the title note and every export, and the marker dividing a record's regenerated half from
// the reader's own — and hand-built structure is what untrusted text gets to break.
//
// Reading-record PROPERTIES are not tested here and do not need to be: they go through Obsidian's own
// `processFrontMatter`, which serializes the YAML itself.

import { describe, expect, it } from 'vitest';
import { bookFrontmatter, chapterFrontmatter } from '../book-extractor';
import { recordFrontmatter, yamlScalar, yamlString } from '../library/record-note';
import { derivedBody, mergeRecordBody, RECORD_MARKER, readerWroteInRecord } from '../reader/annotation-records';
import { buildMocContent } from '../reader/export-format';

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const TAB = String.fromCharCode(9);
const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(127);

describe('yamlString', () => {
  it('escapes the two structural characters', () => {
    expect(yamlString('He said "hi"')).toBe('"He said \\"hi\\""');
    expect(yamlString('back\\slash')).toBe('"back\\\\slash"');
  });

  /**
   * A `dc:title` may split a title from its subtitle across lines. Left raw, the value continues at column 0 — less
   * indented than its key, so the whole frontmatter block is invalid and Obsidian drops every property in it.
   */
  it('escapes a newline rather than letting the value continue at column 0', () => {
    expect(yamlString(`Sample Book${NL}A Subtitle`)).toBe('"Sample Book\\nA Subtitle"');
    expect(yamlString(`Book${CR}${NL}x`)).toBe('"Book\\r\\nx"');
  });

  it('escapes tabs and other control characters', () => {
    expect(yamlString(`a${TAB}b`)).toBe('"a\\tb"');
    expect(yamlString(`a${NUL}b`)).toBe('"a\\x00b"');
    // DEL sits above the C0 range rather than inside it, so it is a separate comparison in the scan and the only
    // one no other case reaches — the escaping is a character-by-character walk, not a regex range.
    expect(yamlString(`a${DEL}b`)).toBe('"a\\x7fb"');
  });

  /** These are ordinary in titles and must survive untouched — escaping that mangled them would be worse than none. */
  it('leaves the punctuation a real title uses alone', () => {
    expect(yamlString('Another Book: A Subtitle # 1')).toBe('"Another Book: A Subtitle # 1"');
    expect(yamlString('--- and [brackets] {braces}')).toBe('"--- and [brackets] {braces}"');
    expect(yamlString('Le Livre Échantillon — Tome I')).toBe('"Le Livre Échantillon — Tome I"');
  });
});

describe('a title cannot inject a property', () => {
  const fields = (title: string) => ({
    title,
    type: 'book',
    authors: ['A'],
    added: '2026-09-07',
  });

  it('keeps a crafted title inside its own value', () => {
    const out = recordFrontmatter(fields(`Sample Book${NL}tags: [owned]${NL}type: weapon`));
    // One `type:` line, the real one — the injected pair is inside the quoted title.
    expect(out.match(/^type:/gm)).toHaveLength(1);
    expect(out).toContain('type: book');
    expect(out).not.toMatch(/^tags:/m);
    expect(out).toContain('\\ntags: [owned]');
  });

  it('cannot close the block early', () => {
    const out = recordFrontmatter(fields(`Sample Book${NL}---${NL}# heading`));
    // Exactly the opening and closing fences, no third.
    expect(out.match(/^---$/gm)).toHaveLength(2);
  });

  it('cannot inject a property through an author either', () => {
    const out = recordFrontmatter({ ...fields('Sample Book'), authors: [`Tester${NL}  - INJECTED`] });
    expect(out).not.toContain('- INJECTED\n');
    expect(out).toContain('\\n  - INJECTED');
  });
});

/**
 * YAML 1.2 does not allow these raw, and a YAML 1.1 reader takes the last three of the group as line breaks. Measured:
 * Obsidian reads every one back unchanged, quoted or bare — but js-yaml, the parser behind many tools that read a
 * vault's notes, rejects the whole block over a bare C1 character or U+FFFE.
 */
const C1 = String.fromCharCode(0x80);
const NEL = String.fromCharCode(0x85);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const NONCHAR = String.fromCharCode(0xfffe);
const LONE_SURROGATE = String.fromCharCode(0xd800);

describe('characters YAML does not allow raw', () => {
  it('are escaped in a quoted value', () => {
    expect(yamlString(`a${C1}b`)).toBe('"a\\x80b"');
    expect(yamlString(`a${NEL}b`)).toBe('"a\\x85b"');
    expect(yamlString(`a${LS}b${PS}c`)).toBe('"a\\u2028b\\u2029c"');
    expect(yamlString(`a${NONCHAR}b`)).toBe('"a\\ufffeb"');
    // Lost as U+FFFD when the note is written as UTF-8; escaped, the property keeps what the book held.
    expect(yamlString(`a${LONE_SURROGATE}b`)).toBe('"a\\ud800b"');
  });

  it('keep a value from being written bare', () => {
    for (const ch of [C1, NEL, LS, PS, NONCHAR, LONE_SURROGATE]) expect(yamlScalar(`Sample${ch}Book`)).toMatch(/^"/);
  });

  /** Characters beyond U+FFFF are ordinary text — a pair of surrogates in JavaScript, one character to YAML. */
  it('leave every other character alone', () => {
    const astral = String.fromCodePoint(0x1f4d6);
    expect(yamlString(`Book ${astral}`)).toBe(`"Book ${astral}"`);
    expect(yamlScalar(`Book ${astral}`)).toBe(`Book ${astral}`);
    expect(yamlScalar('Le Livre Échantillon')).toBe('Le Livre Échantillon');
  });
});

/**
 * Every exporter writes its own frontmatter, from the book's title, author, publisher and contents labels. Each line
 * must stay one property: a key, then a value quoted the way `yamlString` quotes it (or a bare number or boolean).
 */
function expectOnePropertyPerLine(note: string): void {
  const block = note.slice(note.indexOf('---\n') + 4, note.indexOf('\n---', 4));
  for (const line of block.split('\n')) expect(line).toMatch(/^[\w]+: (?:"(?:[^"\\\p{Cc}]|\\.)*"|true|false|\d+)$/u);
}

describe('an export cannot break its own frontmatter', () => {
  const awkward = {
    title: `Sample Book${NL}title: injected \\`,
    author: `Jo "Bud" Writer${NL}type: weapon`,
    publisher: `Back\\slash ${C1} Press`,
    language: `en"${NL}x: 1`,
    pubdate: '',
  };

  it('Save as Markdown: the book note', () => {
    expectOnePropertyPerLine(bookFrontmatter(awkward, '2026-10-25', 'Books/Sample.epub'));
    expectOnePropertyPerLine(bookFrontmatter(awkward, '2026-10-25', 'Books/Sample "x".epub', true));
  });

  it('Save as Markdown: a chapter note, whose chapter name comes from the contents', () => {
    const chapter = `Chapter One${NL}Part "Two" \\`;
    expectOnePropertyPerLine(chapterFrontmatter(awkward, '2026-10-25', chapter, 'Prev', 'Next', 'Books/Sample.epub'));
  });

  it('Export notes: the contents note', () => {
    const moc = buildMocContent({
      bookTitle: awkward.title,
      bookLinkPath: 'Books/Sample.epub',
      author: awkward.author,
      styleName: 'Default',
      noteSetSlug: 'sample--x',
    });
    expectOnePropertyPerLine(moc);
  });
});

describe('a passage cannot move the boundary a record is merged on', () => {
  const props = { link: '[[book]]', note_text: '' } as unknown as Parameters<typeof derivedBody>[0];

  it('strips the marker out of a selected passage', () => {
    const body = derivedBody(props, `a passage that quotes ${RECORD_MARKER} verbatim`);
    expect(body).not.toContain(RECORD_MARKER);
    expect(body).toContain('a passage that quotes');
  });

  it('strips it out of a note body too', () => {
    const withNote = { link: '[[book]]', note_text: `mine ${RECORD_MARKER} more` } as unknown as Parameters<
      typeof derivedBody
    >[0];
    expect(derivedBody(withNote, undefined)).not.toContain(RECORD_MARKER);
  });

  /**
   * Why it matters, spelled out: the reader's own writing is everything after the FIRST marker. A second copy
   * arriving from a book would make the merge treat Orbis's own output as the reader's, or the reader's as
   * Orbis's — and one of those two silently deletes their notes on the next regeneration.
   */
  it('leaves exactly one marker in a written record, so the split is unambiguous', () => {
    const derived = derivedBody(props, `quoting ${RECORD_MARKER} here`);
    const file = `${derived}${RECORD_MARKER}\nMy own thoughts.\n`;
    expect(file.split(RECORD_MARKER)).toHaveLength(2);
    expect(readerWroteInRecord(file)).toBe(true);
    const merged = mergeRecordBody(file, derivedBody(props, 'quoting nothing now'));
    expect(merged).toContain('My own thoughts.');
  });
});
