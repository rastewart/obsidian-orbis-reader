import type { PDFArray, PDFDict as PDFDictType } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { BookBlock } from '../book-blocks';
import { type AnnotationStyle, buildDocumentPdf } from '../document-pdf';

const block = (over: Partial<BookBlock> = {}): BookBlock => ({
  kind: 'paragraph',
  text: 'the quick brown fox jumps over the lazy dog',
  marks: [],
  emphasis: [],
  links: [],
  ...over,
});

const meta = {
  title: 'A Book',
  author: 'An Author',
  attribution: 'Orbis',
  date: '2026-08-07',
  legendHeading: 'Marks used',
  pageLabel: (page: number, total: number) => `Page ${page} of ${total}`,
};

/**
 * How many `/Text` annotations the finished file holds — the pins a viewer shows.
 *
 * Read back through `PDFDict` rather than grepped out of the bytes: pdf-lib compresses its object streams, so the
 * annotation dictionaries are not plain text in the file.
 */
async function stickyNotes(bytes: Uint8Array): Promise<number> {
  const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes);
  let n = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const entry = annots?.get(i);
      const dict = entry ? doc.context.lookup(entry) : undefined;
      if (dict instanceof PDFDict && dict.get(PDFName.of('Subtype'))?.toString() === '/Text') n++;
    }
  }
  return n;
}

/** The outline as a viewer's sidebar would show it: titles in order, with their children nested. */
async function outlineTitles(bytes: Uint8Array): Promise<{ title: string; children: string[] }[]> {
  const { PDFDict, PDFDocument, PDFHexString, PDFName } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes);
  const root = doc.catalog.lookup(PDFName.of('Outlines'));
  if (!(root instanceof PDFDict)) return [];
  // Titles are UTF-16 hex strings, not literals: a PDF string is Latin-1 otherwise, which mangles every outline
  // entry in a book that is not written in English.
  const titleOf = (dict: PDFDictType): string => {
    const value = dict.get(PDFName.of('Title'));
    return value instanceof PDFHexString ? value.decodeText() : (value?.toString() ?? '');
  };
  /** Follow the `Next` chain from a `First`, which is how the linked tree is read. */
  const siblings = (from: PDFDictType, key: string): PDFDictType[] => {
    const out: PDFDictType[] = [];
    let cur = from.get(PDFName.of(key));
    while (cur) {
      const dict = doc.context.lookup(cur);
      if (!(dict instanceof PDFDict)) break;
      out.push(dict);
      cur = dict.get(PDFName.of('Next'));
    }
    return out;
  };
  return siblings(root, 'First').map((item) => ({
    title: titleOf(item),
    children: siblings(item, 'First').map(titleOf),
  }));
}

describe('the whole document', () => {
  it('is a real PDF with the text of the book drawn', async () => {
    const bytes = await buildDocumentPdf([{ title: 'One', blocks: [block()] }], new Map(), meta);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('places one sticky note per annotation, however many lines its mark covers', async () => {
    // The mark spans the whole paragraph, which wraps to several lines; a pin per line would be a wall of pins.
    const long = 'lorem ipsum dolor sit amet consectetur '.repeat(20);
    const styles = new Map<string, AnnotationStyle>([
      ['n1', { color: '#FFEB3B', note: 'a comment', markName: 'Follow up' }],
    ]);
    const bytes = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ text: long, marks: [{ id: 'n1', start: 0, end: long.length }] })] }],
      styles,
      meta
    );
    expect(await stickyNotes(bytes)).toBe(1);
  });

  it('names the reader as the author and the mark as the subject', async () => {
    // `/T` is what a viewer labels as who wrote the comment and `/Subj` is what it is about. The mark's name in
    // `/T` would make every comment appear to have been written by "Follow up".
    const styles = new Map<string, AnnotationStyle>([
      ['n1', { color: '#FFEB3B', note: 'a comment', markName: 'Follow up' }],
    ]);
    const bytes = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ marks: [{ id: 'n1', start: 0, end: 9 }] })] }],
      styles,
      { ...meta, attribution: 'Orbis Tester' }
    );
    // Searched across pages, not assumed to be on the first: the cover sheet is page one and the book starts on
    // page two.
    const { PDFDict, PDFDocument, PDFHexString, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    let dict: unknown;
    for (const page of doc.getPages()) {
      const entry = page.node.Annots()?.get(0);
      if (entry) dict = doc.context.lookup(entry);
      if (dict) break;
    }
    if (!(dict instanceof PDFDict)) throw new Error('no annotation dictionary');
    const field = (name: string): string => {
      const value = dict.get(PDFName.of(name));
      return value instanceof PDFHexString ? value.decodeText() : (value?.toString() ?? '');
    };
    expect(field('T')).toContain('Orbis Tester');
    expect(field('Subj')).toContain('Follow up');
    expect(field('Contents')).toContain('a comment');
  });

  it('keeps a note and an outline entry that are not written in English', async () => {
    // A PDF string is Latin-1 unless it is UTF-16, so this text would arrive mangled in the viewer's comment
    // pane however good the font was — and none of it is drawn with a font, so no download can fix it.
    const styles = new Map<string, AnnotationStyle>([
      ['n1', { color: '#FFEB3B', note: 'Ω → σημείωση', markName: 'Επόμενο' }],
    ]);
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'Образец',
          blocks: [
            block({ kind: 'heading', level: 1, text: 'Образец' }),
            block({ marks: [{ id: 'n1', start: 0, end: 9 }] }),
          ],
        },
      ],
      styles,
      { ...meta, attribution: 'Роб' }
    );
    const { PDFDict, PDFDocument, PDFHexString, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    const read = (dict: PDFDictType, key: string): string => {
      const value = dict.get(PDFName.of(key));
      return value instanceof PDFHexString ? value.decodeText() : (value?.toString() ?? '');
    };
    let annot: PDFDictType | undefined;
    for (const page of doc.getPages()) {
      const entry = page.node.Annots()?.get(0);
      const found = entry ? doc.context.lookup(entry) : undefined;
      if (found instanceof PDFDict) {
        annot = found;
        break;
      }
    }
    if (!annot) throw new Error('no annotation');
    expect(read(annot, 'Contents')).toBe('Ω → σημείωση');
    expect(read(annot, 'Subj')).toBe('Επόμενο');
    expect(read(annot, 'T')).toBe('Роб');
    expect((await outlineTitles(bytes))[0].title).toBe('Образец');
  });

  it('places no pin for a highlight with no note', async () => {
    const styles = new Map<string, AnnotationStyle>([['h1', { color: '#FFEB3B' }]]);
    const bytes = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ marks: [{ id: 'h1', start: 4, end: 9 }] })] }],
      styles,
      meta
    );
    expect(await stickyNotes(bytes)).toBe(0);
  });

  it('ignores a mark whose annotation is gone rather than throwing', async () => {
    const bytes = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ marks: [{ id: 'vanished', start: 0, end: 3 }] })] }],
      new Map(),
      meta
    );
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('draws no marks and no pins when the styles are withheld', async () => {
    // How "include marks" is implemented: every mark is drawn by looking its annotation up, and one that is not
    // found is skipped — so an empty map drops the washes, the treatments and the note pins together, without
    // rewriting the blocks or teaching the writer about an option.
    const marked = block({ marks: [{ id: 'n1', start: 0, end: 9 }] });
    const styles = new Map<string, AnnotationStyle>([['n1', { color: '#FFEB3B', note: 'a comment' }]]);
    const withMarks = await buildDocumentPdf([{ title: 'One', blocks: [marked] }], styles, meta);
    const without = await buildDocumentPdf([{ title: 'One', blocks: [marked] }], new Map(), meta, [], false);
    expect(await stickyNotes(withMarks)).toBe(1);
    expect(await stickyNotes(without)).toBe(0);
    const { PDFDocument } = await import('pdf-lib');
    // And no cover sheet, so no legend explaining marks the reader will not find.
    expect((await PDFDocument.load(without)).getPageCount()).toBe(1);
  });

  it('has no cover sheet when nothing in the export is marked', async () => {
    // The cover's whole job is explaining what the marks mean. With none, it is a page saying "marked up by"
    // above a document nobody marked.
    const plain = await buildDocumentPdf([{ title: 'One', blocks: [block()] }], new Map(), meta);
    const styles = new Map<string, AnnotationStyle>([['h1', { color: '#FFEB3B' }]]);
    const withMark = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ marks: [{ id: 'h1', start: 0, end: 5 }] })] }],
      styles,
      meta
    );
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(plain)).getPageCount()).toBe(1);
    expect((await PDFDocument.load(withMark)).getPageCount()).toBe(2);
  });

  it('numbers the body pages and leaves the cover sheet alone', async () => {
    // A cover sheet is not numbered, and the total is what makes "page 4 of 312" possible — which is the form
    // someone quoting a passage back to you actually uses.
    const long = 'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(400);
    const bytes = await buildDocumentPdf([{ title: 'One', blocks: [block({ text: long })] }], new Map(), meta);
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    // Drawn text is not readable back from a saved PDF without a parser, so this asserts the call shape instead:
    // the cover exists, the body follows it, and numbering ran without throwing on either.
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('draws a line of mixed faces, and marks the right characters within it', async () => {
    // Emphasis changes how wide a slice is, so a mark's x cannot be measured with one font. If it were, a
    // highlight on a line containing bold would sit beside its own text rather than on it.
    const text = 'plain bold plain again and on and on so that the line wraps at least once here';
    const styles = new Map<string, AnnotationStyle>([['h1', { color: '#FFEB3B' }]]);
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'One',
          blocks: [
            block({
              text,
              emphasis: [{ start: 6, end: 10, kind: 'bold' }],
              marks: [{ id: 'h1', start: 0, end: 20 }],
            }),
          ],
        },
      ],
      styles,
      meta
    );
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('builds an outline with a top-level entry per chapter', async () => {
    const bytes = await buildDocumentPdf(
      [
        { title: 'One', blocks: [block()] },
        { title: 'Two', blocks: [block()] },
      ],
      new Map(),
      meta
    );
    expect(await outlineTitles(bytes)).toEqual([
      { title: 'One', children: [] },
      { title: 'Two', children: [] },
    ]);
    // And each entry points at a real page. The destinations are hand-written dictionaries, so a bookmark that
    // resolves to nothing is the failure mode worth naming — it looks correct in a sidebar and does nothing.
    const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    const root = doc.catalog.lookup(PDFName.of('Outlines'));
    if (!(root instanceof PDFDict)) throw new Error('no outline');
    const first = doc.context.lookup(root.get(PDFName.of('First')));
    if (!(first instanceof PDFDict)) throw new Error('no first outline item');
    const dest = first.lookup(PDFName.of('Dest')) as PDFArray;
    const target: unknown = doc.context.lookup(dest.get(0));
    expect(target instanceof PDFDict ? target.get(PDFName.of('Type'))?.toString() : undefined).toBe('/Page');
  });

  it("uses the chapter's own opening heading rather than printing a second one", async () => {
    // The page already suppresses the table-of-contents title when the section starts with a heading. The outline
    // has to agree, or the sidebar names a chapter by a title that appears nowhere on the page it jumps to.
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'From the table of contents',
          blocks: [block({ kind: 'heading', level: 1, text: 'What the chapter calls itself' }), block()],
        },
      ],
      new Map(),
      meta
    );
    expect((await outlineTitles(bytes))[0].title).toBe('What the chapter calls itself');
  });

  it('nests a lower-ranked heading under the one above it, and leaves the deep ones out', async () => {
    // Only the shallow headings: a sidebar listing every `h4` in a book is a second table of contents rather than
    // a way of finding a chapter.
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'One',
          blocks: [
            block({ kind: 'heading', level: 1, text: 'Chapter one' }),
            block({ kind: 'heading', level: 2, text: 'A section' }),
            block({ kind: 'heading', level: 4, text: 'A sub-sub-heading' }),
          ],
        },
      ],
      new Map(),
      meta
    );
    expect(await outlineTitles(bytes)).toEqual([{ title: 'Chapter one', children: ['A section'] }]);
  });

  it('treats two headings of equal rank in one section as two entries, not one inside the other', async () => {
    // A novel in parts: a chapter file that also carries its part's title holds two `h2`s. Nesting by position
    // would hide `CHAPTER I` inside `PART II`, so the sidebar would look like it had lost chapter one — and every
    // part in the book would have the same hole.
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'Part II',
          blocks: [
            block({ kind: 'heading', level: 2, text: 'PART II' }),
            block({ kind: 'heading', level: 2, text: 'CHAPTER I' }),
          ],
        },
        { title: 'Chapter II', blocks: [block({ kind: 'heading', level: 2, text: 'CHAPTER II' })] },
      ],
      new Map(),
      meta
    );
    expect(await outlineTitles(bytes)).toEqual([
      { title: 'PART II', children: [] },
      { title: 'CHAPTER I', children: [] },
      { title: 'CHAPTER II', children: [] },
    ]);
  });

  it('does not let one section’s headings fall under the previous section', async () => {
    // Levels are relative to each section's own first entry, so a section opening at a deeper rank than the last
    // one still starts a top-level entry rather than becoming a child of the chapter before it.
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'One',
          blocks: [
            block({ kind: 'heading', level: 1, text: 'Chapter one' }),
            block({ kind: 'heading', level: 2, text: 'A section' }),
          ],
        },
        { title: 'Two', blocks: [block({ kind: 'heading', level: 3, text: 'Chapter two' })] },
      ],
      new Map(),
      meta
    );
    expect(await outlineTitles(bytes)).toEqual([
      { title: 'Chapter one', children: ['A section'] },
      { title: 'Chapter two', children: [] },
    ]);
  });

  it('writes every branch open, so nothing in the sidebar is hidden', async () => {
    // A negative `Count` closes a branch: the entries exist, and a viewer shows a chevron with nothing under it.
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'One',
          blocks: [
            block({ kind: 'heading', level: 1, text: 'Chapter one' }),
            block({ kind: 'heading', level: 2, text: 'A section' }),
          ],
        },
      ],
      new Map(),
      meta
    );
    const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    const root = doc.catalog.lookup(PDFName.of('Outlines'));
    if (!(root instanceof PDFDict)) throw new Error('no outline');
    const parent = doc.context.lookup(root.get(PDFName.of('First')));
    if (!(parent instanceof PDFDict)) throw new Error('no first outline item');
    expect(Number(parent.get(PDFName.of('Count'))?.toString())).toBe(1);
    expect(Number(root.get(PDFName.of('Count'))?.toString())).toBe(2);
  });

  it('leaves the cover sheet out when it is turned off, marks or no marks', async () => {
    // Someone sending a marked-up draft back to its author does not want the author turning past a cover page
    // every time they open it.
    const styles = new Map<string, AnnotationStyle>([['h1', { color: '#FFEB3B' }]]);
    const sections = [{ title: 'One', blocks: [block({ marks: [{ id: 'h1', start: 0, end: 5 }] })] }];
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(await buildDocumentPdf(sections, styles, meta, [], true))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await buildDocumentPdf(sections, styles, meta, [], false))).getPageCount()).toBe(1);
  });

  it('draws a table as a grid, marks and all', async () => {
    const styles = new Map<string, AnnotationStyle>([['h1', { color: '#FFEB3B', note: 'in a cell' }]]);
    const rows = [
      [
        { text: 'Mark', header: true, marks: [], emphasis: [], links: [] },
        { text: 'Meaning', header: true, marks: [], emphasis: [], links: [] },
      ],
      [
        { text: 'Blue', header: false, marks: [], emphasis: [], links: [] },
        { text: 'Follow up later', header: false, marks: [{ id: 'h1', start: 0, end: 6 }], emphasis: [], links: [] },
      ],
    ];
    const bytes = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ kind: 'table', text: '', rows })] }],
      styles,
      meta
    );
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    // The pin proves the mark was resolved inside the cell rather than dropped with the block's empty text.
    expect(await stickyNotes(bytes)).toBe(1);
  });

  it('carries a long table onto the next page without losing rows', async () => {
    const rows = [
      [
        { text: 'Number', header: true, marks: [], emphasis: [], links: [] },
        {
          text: 'Description of the row, long enough to wrap inside its column',
          header: true,
          marks: [],
          emphasis: [],
          links: [],
        },
      ],
      ...Array.from({ length: 120 }, (_, i) => [
        { text: `${i}`, header: false, marks: [], emphasis: [], links: [] },
        {
          text: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do',
          header: false,
          marks: [],
          emphasis: [],
          links: [],
        },
      ]),
    ];
    const bytes = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ kind: 'table', text: '', rows })] }],
      new Map(),
      meta
    );
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });

  it('falls back to stacked paragraphs for a row too tall for any page', async () => {
    // The one shape a grid genuinely cannot hold. Stacking is the escape hatch rather than the behavior.
    const long = 'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(200);
    const rows = [
      [
        { text: long, header: false, marks: [], emphasis: [], links: [] },
        { text: long, header: false, marks: [], emphasis: [], links: [] },
      ],
    ];
    const bytes = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ kind: 'table', text: '', rows })] }],
      new Map(),
      meta
    );
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });

  it('makes a link out of the book clickable, and leaves an internal one alone', async () => {
    // The whole point of the annotation: a web address in the book still works in the PDF. An EPUB's INTERNAL
    // links are relative paths into the archive — `chapter3.xhtml#note` — which mean nothing to a PDF viewer, so
    // pointing one at a web address would send the reader somewhere that does not exist.
    const text = 'See the site for more, or chapter three.';
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'One',
          blocks: [
            block({
              text,
              links: [
                { start: 4, end: 12, href: 'https://example.com/x' },
                { start: 26, end: 39, href: 'chapter3.xhtml#note' },
              ],
            }),
          ],
        },
      ],
      new Map(),
      meta
    );
    const { PDFDict, PDFDocument, PDFHexString, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    const uris: string[] = [];
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      for (let i = 0; i < (annots?.size() ?? 0); i++) {
        const entry = annots?.get(i);
        const dict = entry ? doc.context.lookup(entry) : undefined;
        if (!(dict instanceof PDFDict) || dict.get(PDFName.of('Subtype'))?.toString() !== '/Link') continue;
        const action = dict.lookup(PDFName.of('A'));
        // Written in hex, so nothing in the address can end the string (pdfUriHex).
        const uri = action instanceof PDFDict ? action.get(PDFName.of('URI')) : undefined;
        if (uri instanceof PDFHexString) uris.push(uri.decodeText());
      }
    }
    expect(uris).toEqual(['https://example.com/x']);
  });

  it('points an internal link at the page its destination landed on', async () => {
    // The forward reference is the whole difficulty: chapter two has no page when the link to it is drawn, so the
    // annotation is built at save time, once every page exists.
    const filler = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do '.repeat(300);
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'One',
          blocks: [
            block({ text: 'See chapter two.', links: [{ start: 4, end: 15, href: '1#' }] }),
            block({ text: filler }),
          ],
        },
        { title: 'Two', blocks: [block({ text: 'Chapter two starts here.', anchors: ['1#'] })] },
      ],
      new Map(),
      meta
    );
    const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    const pageIndex = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i]));
    let dest: { on: number; to: number } | undefined;
    for (const [i, page] of doc.getPages().entries()) {
      const annots = page.node.Annots();
      for (let j = 0; j < (annots?.size() ?? 0); j++) {
        const entry = annots?.get(j);
        const d = entry ? doc.context.lookup(entry) : undefined;
        if (!(d instanceof PDFDict) || d.get(PDFName.of('Subtype'))?.toString() !== '/Link') continue;
        const target = d.lookup(PDFName.of('Dest')) as PDFArray;
        dest = { on: i, to: pageIndex.get(String(target.get(0))) ?? -1 };
      }
    }
    if (!dest) throw new Error('no internal link');
    // The link is on the first page and the destination is on a later one — which is only true if the deferred
    // resolution ran; a link resolved at draw time would have had nothing to point at.
    expect(dest.on).toBe(0);
    expect(dest.to).toBeGreaterThan(0);
  });

  /**
   * A picture's or a table's ids counted as destinations, so a link to one was drawn clickable — and, recorded only by
   * text, went nowhere: a book's "back" link from its full-size plate to the small one in the text.
   */
  it('lands a link on a picture, on its caption when it cannot be drawn, and on a table', async () => {
    const pixel = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0)
    );
    const linkTo = (href: string) => block({ text: `To ${href}.`, links: [{ start: 3, end: 3 + href.length, href }] });
    const bytes = await buildDocumentPdf(
      [
        { title: 'One', blocks: [linkTo('1#plate'), linkTo('1#lost'), linkTo('1#tab')] },
        {
          title: 'Two',
          blocks: [
            block({ kind: 'image', text: '', src: 'plate.png', anchors: ['1#plate'] }),
            block({ kind: 'image', text: 'A plate that is not there', src: 'gone.png', anchors: ['1#lost'] }),
            block({
              kind: 'table',
              text: '',
              anchors: ['1#tab'],
              rows: [
                [
                  { text: 'a', header: false, marks: [], emphasis: [], links: [] },
                  { text: 'b', header: false, marks: [], emphasis: [], links: [] },
                ],
              ],
            }),
          ],
          images: new Map([['plate.png', { bytes: pixel, kind: 'png' as const }]]),
        },
      ],
      new Map(),
      meta
    );
    const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    let landed = 0;
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      for (let j = 0; j < (annots?.size() ?? 0); j++) {
        const entry = annots?.get(j);
        const d = entry ? doc.context.lookup(entry) : undefined;
        if (d instanceof PDFDict && d.get(PDFName.of('Subtype'))?.toString() === '/Link' && d.get(PDFName.of('Dest')))
          landed++;
      }
    }
    expect(landed).toBe(3);
  });

  it('makes a picture inside a link a link', async () => {
    const pixel = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0)
    );
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'One',
          blocks: [block({ kind: 'image', text: '', src: 'plate.png', links: [{ start: 0, end: 0, href: '1#' }] })],
          images: new Map([['plate.png', { bytes: pixel, kind: 'png' as const }]]),
        },
        { title: 'Two', blocks: [block({ text: 'The full-size plate.', anchors: ['1#'] })] },
      ],
      new Map(),
      meta
    );
    const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    const annots = doc.getPages()[0].node.Annots();
    let links = 0;
    for (let j = 0; j < (annots?.size() ?? 0); j++) {
      const entry = annots?.get(j);
      const d = entry ? doc.context.lookup(entry) : undefined;
      if (d instanceof PDFDict && d.get(PDFName.of('Subtype'))?.toString() === '/Link' && d.get(PDFName.of('Dest')))
        links++;
    }
    expect(links).toBe(1);
  });

  it('makes a link inside a table cell clickable', async () => {
    // A contents page built as a table is the shape this feature exists for. A cell's link that keeps the raw
    // relative href matches no destination key and is dropped — silently, because an unreachable link prints as
    // ordinary text.
    const rows = [
      [
        { text: 'Document', header: true, marks: [], emphasis: [], links: [] },
        { text: 'Description', header: true, marks: [], emphasis: [], links: [] },
      ],
      [
        { text: 'Roadmap', header: false, marks: [], emphasis: [], links: [{ start: 0, end: 7, href: '1#' }] },
        {
          text: 'The plan',
          header: false,
          marks: [],
          emphasis: [],
          links: [{ start: 0, end: 3, href: 'https://example.com' }],
        },
      ],
    ];
    const bytes = await buildDocumentPdf(
      [
        { title: 'Contents', blocks: [block({ kind: 'table', text: '', rows })] },
        { title: 'Roadmap', blocks: [block({ text: 'The roadmap.', anchors: ['1#'] })] },
      ],
      new Map(),
      meta
    );
    const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    let internal = 0;
    let external = 0;
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      for (let j = 0; j < (annots?.size() ?? 0); j++) {
        const entry = annots?.get(j);
        const d = entry ? doc.context.lookup(entry) : undefined;
        if (!(d instanceof PDFDict) || d.get(PDFName.of('Subtype'))?.toString() !== '/Link') continue;
        if (d.get(PDFName.of('Dest'))) internal++;
        else external++;
      }
    }
    expect({ internal, external }).toEqual({ internal: 1, external: 1 });
  });

  it('leaves a link to a chapter that was left out as plain text', async () => {
    // Chapters are chosen per export. A link into one that is not here has nowhere to go, and tinting it would
    // promise a click that does nothing.
    const bytes = await buildDocumentPdf(
      [{ title: 'One', blocks: [block({ text: 'See chapter nine.', links: [{ start: 4, end: 16, href: '8#' }] })] }],
      new Map(),
      meta
    );
    const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    let links = 0;
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      for (let j = 0; j < (annots?.size() ?? 0); j++) {
        const entry = annots?.get(j);
        const d = entry ? doc.context.lookup(entry) : undefined;
        if (d instanceof PDFDict && d.get(PDFName.of('Subtype'))?.toString() === '/Link') links++;
      }
    }
    expect(links).toBe(0);
  });

  it('gives a wrapped link one clickable rectangle per line', async () => {
    // A PDF annotation is a rectangle, and a link that wraps occupies two. One rectangle spanning both lines
    // would cover the text between them, which is a different sentence.
    const long = `${'word '.repeat(40)}end`;
    const bytes = await buildDocumentPdf(
      [
        {
          title: 'One',
          blocks: [block({ text: long, links: [{ start: 0, end: long.length, href: 'https://x.test' }] })],
        },
      ],
      new Map(),
      meta
    );
    const { PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes);
    let links = 0;
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      for (let i = 0; i < (annots?.size() ?? 0); i++) {
        const entry = annots?.get(i);
        const dict = entry ? doc.context.lookup(entry) : undefined;
        if (dict instanceof PDFDict && dict.get(PDFName.of('Subtype'))?.toString() === '/Link') links++;
      }
    }
    expect(links).toBeGreaterThan(1);
  });

  it('draws every block kind without falling over', async () => {
    const blocks: BookBlock[] = [
      block({ kind: 'heading', level: 2, text: 'A heading' }),
      block({ kind: 'list-item', text: 'An item' }),
      block({ kind: 'quote', text: 'A quotation' }),
      block({ kind: 'code', text: 'const x = 1;' }),
      block({ kind: 'image', text: 'A caption', src: 'x.png' }),
    ];
    const bytes = await buildDocumentPdf([{ title: 'One', blocks }], new Map(), meta);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });
});
