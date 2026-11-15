import { describe, expect, it } from 'vitest';
import type { BookBlock, TableCell } from '../book-blocks';
import { canonicalizeLinks } from '../book-links';

const block = (over: Partial<BookBlock> = {}): BookBlock => ({
  kind: 'paragraph',
  text: 'text',
  marks: [],
  emphasis: [],
  links: [],
  ...over,
});

const cell = (over: Partial<TableCell> = {}): TableCell => ({
  text: 'cell',
  header: false,
  marks: [],
  emphasis: [],
  links: [],
  ...over,
});

/** The book: `sect1.xhtml` is section 0, `sect3.xhtml` is section 2. Paths arrive already resolved. */
const sectionIndexOf = (path: string): number | undefined =>
  ({ 'sect1.xhtml': 0, 'sect2.xhtml': 1, 'sect3.xhtml': 2 })[path];
const resolveHref = (href: string): string => href;

describe('canonical link keys', () => {
  it('turns a relative href into the target section', () => {
    const blocks = [block({ links: [{ start: 0, end: 4, href: 'sect3.xhtml' }] })];
    canonicalizeLinks(blocks, 0, resolveHref, sectionIndexOf);
    expect(blocks[0].links).toEqual([{ start: 0, end: 4, href: '2#' }]);
  });

  it('keeps the fragment, and reads a bare one as this same section', () => {
    const blocks = [
      block({
        links: [
          { start: 0, end: 1, href: 'sect3.xhtml#notes' },
          { start: 2, end: 3, href: '#here' },
        ],
      }),
    ];
    canonicalizeLinks(blocks, 5, resolveHref, sectionIndexOf);
    expect(blocks[0].links.map((l) => l.href)).toEqual(['2#notes', '5#here']);
  });

  it('sends a bare fragment where the book says its id lives, when ids are book-wide', () => {
    // FB2: a note reference `#n1` points into the notes body, a section of its own. Keyed to the citing section it
    // matched nothing, and the PDF printed the reference as plain text. An id the lookup does not know stays here.
    const blocks = [
      block({
        links: [
          { start: 0, end: 1, href: '#n1' },
          { start: 2, end: 3, href: '#here' },
        ],
      }),
    ];
    canonicalizeLinks(blocks, 0, undefined, sectionIndexOf, (id) => (id === 'n1' ? 2 : undefined));
    expect(blocks[0].links.map((l) => l.href)).toEqual(['2#n1', '0#here']);
  });

  it('CANONICALISES LINKS INSIDE TABLE CELLS, which is where a contents page keeps them', () => {
    // The bug this test exists for: cells were missed, so their links kept the raw relative href, matched no
    // destination and were dropped. A contents table of thirty-four links printed as thirty-four plain words.
    const blocks = [
      block({
        kind: 'table',
        text: '',
        rows: [
          [
            cell({ links: [{ start: 0, end: 7, href: 'sect3.xhtml' }] }),
            cell({ links: [{ start: 0, end: 3, href: 'https://example.com' }] }),
          ],
        ],
      }),
    ];
    canonicalizeLinks(blocks, 0, resolveHref, sectionIndexOf);
    expect(blocks[0].rows?.[0][0].links[0].href).toBe('2#');
    // An address is left exactly as the book wrote it.
    expect(blocks[0].rows?.[0][1].links[0].href).toBe('https://example.com');
  });

  it('drops a link to something that is not a section of this book', () => {
    const blocks = [
      block({
        links: [
          { start: 0, end: 1, href: 'missing.xhtml' },
          { start: 2, end: 3, href: 'sect2.xhtml' },
        ],
      }),
    ];
    canonicalizeLinks(blocks, 0, resolveHref, sectionIndexOf);
    expect(blocks[0].links.map((l) => l.href)).toEqual(['1#']);
  });

  it('prefixes every anchor with the section, so two chapters can both have #notes', () => {
    const blocks = [block({ anchors: ['top'] }), block({ anchors: ['notes'] })];
    canonicalizeLinks(blocks, 7, resolveHref, sectionIndexOf);
    // The first block also carries the section's own start, for a link to the file with no fragment.
    expect(blocks[0].anchors).toEqual(['7#', '7#top']);
    expect(blocks[1].anchors).toEqual(['7#notes']);
  });

  it('gives the first block the section key even when it defines no ids', () => {
    const blocks = [block(), block()];
    canonicalizeLinks(blocks, 3, resolveHref, sectionIndexOf);
    expect(blocks[0].anchors).toEqual(['3#']);
    expect(blocks[1].anchors).toBeUndefined();
  });

  it('resolves through the resolver foliate gives for the section', () => {
    // Real hrefs are relative to the section's own place in the archive: `../Text/sect3.xhtml` from a section in
    // another folder is the same file as `sect3.xhtml` from the top.
    const blocks = [block({ links: [{ start: 0, end: 1, href: '../Text/sect3.xhtml' }] })];
    canonicalizeLinks(blocks, 0, (href) => href.replace('../Text/', ''), sectionIndexOf);
    expect(blocks[0].links[0].href).toBe('2#');
  });
});

/**
 * **Canonicalising REWRITES the anchors, and one caller has to run before it.**
 *
 * Namespacing an id is what lets a link from another section point at it unambiguously. The cost is that the
 * book's own ids are gone afterwards — and a contents href carries the bare id, so the whole-document PDF has to
 * cut its chapters BEFORE this runs. It did not, once: every cut looked for `pgepubid00005`, found only
 * `3#pgepubid00005`, and a novel in parts drew 45 sections — one per spine file — instead of its 52 chapters.
 */
describe('what canonicalising does to the anchors a chapter cut looks for', () => {
  const block = (anchors: string[]): BookBlock =>
    ({ kind: 'paragraph', text: 'x', marks: [], links: [], anchors }) as unknown as BookBlock;

  it('namespaces every id with its section index', () => {
    const blocks = [block(['pgepubid00005']), block(['later'])];
    canonicalizeLinks(blocks, 3, undefined, () => undefined);
    expect(blocks[0].anchors).toContain('3#pgepubid00005');
    expect(blocks[1].anchors).toContain('3#later');
  });

  it('leaves the bare id findable NOWHERE afterwards, which is the trap', () => {
    const blocks = [block(['pgepubid00005'])];
    canonicalizeLinks(blocks, 3, undefined, () => undefined);
    expect(blocks[0].anchors).not.toContain('pgepubid00005');
    // What the slicing does, and why it has to happen first.
    expect(blocks.findIndex((b) => b.anchors?.includes('pgepubid00005'))).toBe(-1);
  });

  it('gives the first block the section start as well, so a fragmentless link lands at the top', () => {
    const blocks = [block(['a'])];
    canonicalizeLinks(blocks, 7, undefined, () => undefined);
    expect(blocks[0].anchors).toContain('7#');
  });
});
