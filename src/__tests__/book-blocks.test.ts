import { describe, expect, it } from 'vitest';
import { alignmentRules, blocksFromDocument, leadInGoesTo, sliceAtAnchors } from '../book-blocks';

/** Parse the way a section document arrives — `DOMParser`, never `innerHTML`, the idiom the rest of the suite
 *  uses. Indented on purpose: EPUB source is indented, which is the whole reason offsets are computed against
 *  collapsed text. */
const parse = (html: string): Document => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

/** A range over the Nth text node of the document, by character offsets within it. */
function rangeOver(doc: Document, nth: number, start: number, end: number): Range {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  for (let i = 0; i < nth && node; i++) node = walker.nextNode();
  const range = doc.createRange();
  range.setStart(node!, start);
  range.setEnd(node!, end);
  return range;
}

describe('blocks', () => {
  // An old MOBI's picture has no `src` until foliate lays its page out; the PDF loads it by its record.
  it('points an old MOBI picture at its recindex', () => {
    const doc = parse('<p>Before.</p><img recindex="00001"><p>After.</p>');
    const image = blocksFromDocument(doc, []).find((b) => b.kind === 'image');
    expect(image?.src).toBe('recindex:00001');
  });

  // A technical book captions a table `<div><span>Table 2-1.</span><div>Record fields</div></div>`. The wrapper was walked
  // child by child and the loose span read by nobody: the PDF printed "Record fields" without its number.
  it('keeps loose text beside the blocks of a wrapper, as a paragraph in its place', () => {
    const doc = parse('<div class="caption"><span class="number">Table 2-1.</span><div>Record fields</div></div>');
    expect(blocksFromDocument(doc, []).map((b) => [b.kind, b.text])).toEqual([
      ['paragraph', 'Table 2-1.'],
      ['paragraph', 'Record fields'],
    ]);
  });

  it('keeps each run of loose text between blocks apart, and ignores the blank space between them', () => {
    const doc = parse('<div>\n  Before <em>it</em>.\n  <p>Middle.</p>\n  <p>Next.</p>\n  After.\n</div>');
    expect(blocksFromDocument(doc, []).map((b) => b.text)).toEqual(['Before it.', 'Middle.', 'Next.', 'After.']);
  });

  // A book links its small plate to the full-size one; printed only as a picture, the PDF lost the way there.
  it('gives a picture inside a link that link', () => {
    const doc = parse(
      '<div><a href="plate-big.xhtml" id="id-1"><img alt="" src="plate.png"/></a></div><img src="b.png"/>'
    );
    expect(blocksFromDocument(doc, []).map((b) => [b.kind, b.links.map((l) => l.href)])).toEqual([
      ['image', ['plate-big.xhtml']],
      ['image', []],
    ]);
  });

  it('puts a mark over loose text on the paragraph made of it', () => {
    const doc = parse('<div><span>Table 2-1.</span><div>Record fields</div></div>');
    const [caption] = blocksFromDocument(doc, [{ id: 'm', range: rangeOver(doc, 0, 0, 5) }]);
    expect(caption.marks).toEqual([{ id: 'm', start: 0, end: 5 }]);
  });

  it('emits one block per paragraph, in document order', () => {
    const doc = parse('<h1>Title</h1>\n  <p>First.</p>\n  <p>Second.</p>');
    expect(blocksFromDocument(doc, []).map((b) => [b.kind, b.text])).toEqual([
      ['heading', 'Title'],
      ['paragraph', 'First.'],
      ['paragraph', 'Second.'],
    ]);
  });

  it('collapses the indentation EPUB source is full of', () => {
    const doc = parse('<p>\n      one   two\n      three\n    </p>');
    expect(blocksFromDocument(doc, [])[0].text).toBe('one two three');
  });

  it('does not flatten a container that holds blocks of its own', () => {
    // Taking a blockquote's text would run its paragraphs together into one line.
    const doc = parse('<blockquote><p>One.</p><p>Two.</p></blockquote>');
    expect(blocksFromDocument(doc, []).map((b) => b.text)).toEqual(['One.', 'Two.']);
  });

  it('keeps a table as rows of cells', () => {
    const doc = parse('<table><tr><th>Mark</th><th>Meaning</th></tr><tr><td>Blue</td><td>Follow up</td></tr></table>');
    const [table] = blocksFromDocument(doc, []);
    expect(table.kind).toBe('table');
    expect(table.rows?.map((row) => row.map((c) => [c.text, c.header]))).toEqual([
      [
        ['Mark', true],
        ['Meaning', true],
      ],
      [
        ['Blue', false],
        ['Follow up', false],
      ],
    ]);
  });

  it('reads thead and tbody as one sequence of rows', () => {
    const doc = parse(
      '<table><thead><tr><th>H</th><th>I</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
    );
    expect(blocksFromDocument(doc, [])[0].rows?.length).toBe(2);
  });

  it('lays a one-column table out as paragraphs, because it is not tabular', () => {
    // EPUBs use single-column tables to center a poem or a title. Ruling that off as a grid draws a box around
    // something that was never a table.
    const doc = parse('<table><tr><td>A line</td></tr><tr><td>Another</td></tr></table>');
    expect(blocksFromDocument(doc, []).map((b) => [b.kind, b.text])).toEqual([
      ['paragraph', 'A line'],
      ['paragraph', 'Another'],
    ]);
  });

  it('puts a caption above the table rather than in it', () => {
    const doc = parse('<table><caption>What the marks mean</caption><tr><td>A</td><td>B</td></tr></table>');
    const blocks = blocksFromDocument(doc, []);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table']);
    expect(blocks[0].text).toBe('What the marks mean');
  });

  it('does not steal a nested table’s rows', () => {
    // The outer table has one row, not two. The inner table's text comes through inside the cell that contains it,
    // run together as any nested markup's text is — a nested table is rare enough not to be worth a second grid.
    const doc = parse('<table><tr><td>outer<table><tr><td>x</td><td>y</td></tr></table></td><td>B</td></tr></table>');
    const [outer] = blocksFromDocument(doc, []);
    expect(outer.rows?.length).toBe(1);
    expect(outer.rows?.[0].map((c) => c.text)).toEqual(['outerxy', 'B']);
  });

  it('does not flatten a table inside a blockquote into the quotation', () => {
    const doc = parse('<blockquote><table><tr><td>A</td><td>B</td></tr></table></blockquote>');
    expect(blocksFromDocument(doc, []).map((b) => b.kind)).toEqual(['table']);
  });

  it('keeps an image that is wrapped in a paragraph', () => {
    // `<p class="illustration"><img/></p>` is how a great many EPUBs wrap a picture, and the paragraph is
    // collected rather than descended into — so the image would be reached by nobody. With `alt=""`, which is
    // usual, nothing would appear on the page to notice.
    const doc = parse('<p class="illustration"><img src="plate.jpg" alt="A plate"/></p>');
    expect(blocksFromDocument(doc, []).map((b) => [b.kind, b.src])).toEqual([['image', 'plate.jpg']]);
  });

  it('keeps an image inside a list item, and one inside a paragraph of text', () => {
    const doc = parse('<ul><li><img src="icon.png" alt=""/></li></ul><p>Before <img src="in.png" alt=""/> after</p>');
    expect(blocksFromDocument(doc, []).map((b) => [b.kind, b.src ?? b.text])).toEqual([
      ['image', 'icon.png'],
      ['image', 'in.png'],
      ['paragraph', 'Before after'],
    ]);
  });

  it('takes the cover out of an svg wrapper', () => {
    // A Gutenberg cover page is `<svg><image xlink:href="cover.png"/></svg>`, and skipping `svg` whole would drop
    // the book's cover, on the first page of the export.
    const doc = parse('<div><svg viewBox="0 0 1600 2400"><image width="1600" xlink:href="cover.png"/></svg></div>');
    expect(blocksFromDocument(doc, []).map((b) => [b.kind, b.src])).toEqual([['image', 'cover.png']]);
  });

  it('still ignores an svg that is a drawing rather than a wrapper', () => {
    // Its text content is markup, not prose: without the earlier `SKIP` it would have printed as a run of
    // coordinates.
    const doc = parse('<p>Before</p><svg><title>A chart</title><path d="M0 0 L10 10"/></svg><p>After</p>');
    expect(blocksFromDocument(doc, []).map((b) => b.text)).toEqual(['Before', 'After']);
  });

  it('records the heading level and an image source', () => {
    const doc = parse('<h3>Deep</h3><img src="images/x.png" alt="A picture"/>');
    const blocks = blocksFromDocument(doc, []);
    expect(blocks[0].level).toBe(3);
    expect(blocks[1]).toMatchObject({ kind: 'image', src: 'images/x.png', text: 'A picture' });
  });

  it('skips markup that is not the book', () => {
    const doc = parse('<style>p{}</style><script>x()</script><p>Real.</p>');
    expect(blocksFromDocument(doc, []).map((b) => b.text)).toEqual(['Real.']);
  });
});

describe('marks in a table', () => {
  it('lands in the cell it was made in, at that cell’s own offsets', () => {
    // The reason cells keep their own text and their own marks: offsets index into ONE string, so cells sharing a
    // string would draw every highlight in whichever cell the arithmetic reached.
    const doc = parse('<table><tr><td>first cell</td><td>second cell</td></tr></table>');
    const [table] = blocksFromDocument(doc, [{ id: 'm1', range: rangeOver(doc, 1, 0, 6) }]);
    expect(table.rows?.[0][0].marks).toEqual([]);
    expect(table.rows?.[0][1].marks).toEqual([{ id: 'm1', start: 0, end: 6 }]);
  });

  it('keeps a cell’s emphasis with the cell', () => {
    const doc = parse('<table><tr><td>plain</td><td>a <strong>bold</strong> word</td></tr></table>');
    const [table] = blocksFromDocument(doc, []);
    expect(table.rows?.[0][1].emphasis).toEqual([{ start: 2, end: 6, kind: 'bold' }]);
  });
});

describe('how the book says an image sits', () => {
  // Project Gutenberg's own stylesheet, which is where the answer actually lives.
  const CSS = `
    .figcenter { margin: auto; text-align: center }
    .figleft { float: left; clear: left; text-align: center }
    .figright { float: right; text-align: center }
    @media screen { .narrow { text-align: right } }
  `;
  const rules = alignmentRules(CSS);
  const alignOf = (html: string): string | undefined => blocksFromDocument(parse(html), [], rules)[0]?.align;

  it('reads the class the book put the image in', () => {
    expect(alignOf('<div class="figcenter"><img src="a.jpg" alt=""/></div>')).toBe('center');
    expect(alignOf('<div class="figleft"><img src="a.jpg" alt=""/></div>')).toBe('left');
    expect(alignOf('<div class="figright"><img src="a.jpg" alt=""/></div>')).toBe('right');
  });

  it('says nothing when the book says nothing', () => {
    // Which the page draws left, where the text flow puts an inline image — not centered on the guess that books
    // center plates, which is right for `.figcenter` by accident and wrong for `.figleft`.
    expect(alignOf('<div class="plain"><img src="a.jpg" alt=""/></div>')).toBeUndefined();
    expect(alignOf('<p><img src="a.jpg" alt=""/></p>')).toBeUndefined();
  });

  it('lets inline style beat the stylesheet, as CSS does', () => {
    expect(alignOf('<div class="figleft" style="text-align: right"><img src="a.jpg" alt=""/></div>')).toBe('right');
  });

  it('reads the legacy align attribute and a center element', () => {
    expect(alignOf('<div align="center"><img src="a.jpg" alt=""/></div>')).toBe('center');
    expect(alignOf('<center><img src="a.jpg" alt=""/></center>')).toBe('center');
  });

  it('takes margin auto on the image itself as centring', () => {
    expect(alignOf('<div><img style="display:block;margin:auto" src="a.jpg" alt=""/></div>')).toBe('center');
  });

  it('takes the nearest ancestor that says anything, because text-align inherits', () => {
    expect(alignOf('<div class="figright"><div class="figleft"><img src="a.jpg" alt=""/></div></div>')).toBe('left');
  });

  it('finds rules nested inside an at-rule, and is not confused by its prelude', () => {
    expect(alignOf('<div class="narrow"><img src="a.jpg" alt=""/></div>')).toBe('right');
  });

  it('survives a stylesheet with a selector the DOM cannot parse', () => {
    const odd = alignmentRules(
      '@page { text-align: center } ::weird--thing { float: right } .ok { text-align: center }'
    );
    expect(blocksFromDocument(parse('<div class="ok"><img src="a.jpg" alt=""/></div>'), [], odd)[0].align).toBe(
      'center'
    );
  });
});

describe('links', () => {
  it('records the href with the offsets of the text it covers', () => {
    const doc = parse('<p>See <a href="https://example.com/x">the site</a> for more.</p>');
    const [block] = blocksFromDocument(doc, []);
    expect(block.links).toEqual([{ start: 4, end: 12, href: 'https://example.com/x' }]);
    expect(block.text.slice(4, 12)).toBe('the site');
  });

  it('keeps one link whole across the markup inside it', () => {
    // `<a>Read <em>this</em></a>` is three text nodes and ONE destination. Two annotations over adjacent words is
    // two things to click, and the second one looks like a different link.
    const doc = parse('<p><a href="https://example.com">Read <em>this</em> now</a></p>');
    const [block] = blocksFromDocument(doc, []);
    expect(block.links).toEqual([{ start: 0, end: 13, href: 'https://example.com' }]);
  });

  it('does not merge two links that happen to touch', () => {
    const doc = parse('<p><a href="https://a.test">one</a><a href="https://b.test">two</a></p>');
    const [block] = blocksFromDocument(doc, []).slice(0, 1);
    expect(block.links.map((l) => l.href)).toEqual(['https://a.test', 'https://b.test']);
  });

  it('moves the offsets with the collapsed whitespace, as marks do', () => {
    const doc = parse('<p>\n   go   <a href="https://example.com">\n  there\n </a>\n  now\n</p>');
    const [block] = blocksFromDocument(doc, []);
    expect(block.text).toBe('go there now');
    const link = block.links[0];
    expect(block.text.slice(link.start, link.end)).toBe('there');
  });

  it('ignores an anchor with nothing to point at', () => {
    // A named anchor — `<a id="x">` with no href — is a destination, not a link.
    const doc = parse('<p><a id="top">Chapter one</a></p>');
    expect(blocksFromDocument(doc, [])[0].links).toEqual([]);
  });

  it('records a link inside a table cell against that cell', () => {
    const doc = parse('<table><tr><td>plain</td><td><a href="https://example.com">a link</a></td></tr></table>');
    const [table] = blocksFromDocument(doc, []);
    expect(table.rows?.[0][0].links).toEqual([]);
    expect(table.rows?.[0][1].links).toEqual([{ start: 0, end: 6, href: 'https://example.com' }]);
  });
});

describe('marks mapped into a block', () => {
  it('lands on the characters that were marked, after collapsing', () => {
    // The offsets must index the COLLAPSED text — computing them on the raw string and collapsing afterwards
    // shifts every mark by however much indentation the source had, which for an EPUB is a lot.
    const doc = parse('<p>\n      the quick brown fox\n    </p>');
    const range = rangeOver(doc, 0, 7 + 4, 7 + 9); // "quick" within the raw text node
    const [block] = blocksFromDocument(doc, [{ id: 'h1', range }]);
    expect(block.text).toBe('the quick brown fox');
    const mark = block.marks[0];
    expect(block.text.slice(mark.start, mark.end)).toBe('quick');
  });

  it('clips a mark that spans two paragraphs into both of them', () => {
    const doc = parse('<p>first para</p><p>second para</p>');
    const range = doc.createRange();
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const a = walker.nextNode()!;
    const b = walker.nextNode()!;
    range.setStart(a, 6);
    range.setEnd(b, 6);
    const blocks = blocksFromDocument(doc, [{ id: 'h1', range }]);
    expect(blocks[0].text.slice(blocks[0].marks[0].start, blocks[0].marks[0].end)).toBe('para');
    expect(blocks[1].text.slice(blocks[1].marks[0].start, blocks[1].marks[0].end)).toBe('second');
  });

  it('leaves a block a mark does not touch alone', () => {
    const doc = parse('<p>marked</p><p>untouched</p>');
    const range = rangeOver(doc, 0, 0, 6);
    const blocks = blocksFromDocument(doc, [{ id: 'h1', range }]);
    expect(blocks[0].marks).toHaveLength(1);
    expect(blocks[1].marks).toEqual([]);
  });
});

describe('inline emphasis', () => {
  it('records bold, italic and code as spans over the same offsets marks use', () => {
    const doc = parse('<p>plain <strong>bold</strong> and <em>italic</em> and <code>code()</code></p>');
    const [block] = blocksFromDocument(doc, []);
    const slice = (i: number) => block.text.slice(block.emphasis[i].start, block.emphasis[i].end);
    expect(block.emphasis.map((e) => e.kind)).toEqual(['bold', 'italic', 'code']);
    expect([slice(0), slice(1), slice(2)]).toEqual(['bold', 'italic', 'code()']);
  });

  it('combines nesting into one kind', () => {
    const doc = parse('<p><em>slanted <strong>and heavy</strong></em></p>');
    const [block] = blocksFromDocument(doc, []);
    const heavy = block.emphasis.find((e) => e.kind === 'bold-italic');
    expect(heavy && block.text.slice(heavy.start, heavy.end)).toBe('and heavy');
  });

  it('lets code win over weight, because a monospaced face has no bold', () => {
    const doc = parse('<p><code>const <b>x</b> = 1</code></p>');
    const [block] = blocksFromDocument(doc, []);
    expect(block.emphasis.every((e) => e.kind === 'code')).toBe(true);
  });

  it('survives collapsing with its offsets intact', () => {
    // The same trap marks have: EPUB source is indented, and collapsing after the offsets are taken moves them.
    const doc = parse('<p>\n   one   <strong>two</strong>\n   three\n  </p>');
    const [block] = blocksFromDocument(doc, []);
    expect(block.text).toBe('one two three');
    expect(block.text.slice(block.emphasis[0].start, block.emphasis[0].end)).toBe('two');
  });

  it('does not span two blocks', () => {
    const doc = parse('<p><strong>first</strong></p><p>second</p>');
    const blocks = blocksFromDocument(doc, []);
    expect(blocks[0].emphasis).toHaveLength(1);
    expect(blocks[1].emphasis).toEqual([]);
  });
});

describe('blocks that keep their shape', () => {
  it('preserves the whitespace inside a code block', () => {
    // Everywhere else the line breaks in EPUB source are layout the page redoes for itself. Inside `<pre>` they
    // are the content: collapsing them runs a function and its comment onto one line, and for code that is not a
    // formatting difference — a `//` comment swallows whatever follows it.
    const doc = parse('<pre><code>const a = 1;\n// a comment\nconst b = 2;</code></pre>');
    expect(blocksFromDocument(doc, [])[0].text).toBe('const a = 1;\n// a comment\nconst b = 2;');
  });

  it('numbers an ordered list and bullets an unordered one', () => {
    // "1. First" and "• First" say different things, and a numbered list flattened to bullets loses the sequence
    // that was the reason for numbering it.
    const doc = parse('<ol><li>One</li><li>Two</li></ol><ul><li>Loose</li></ul>');
    expect(blocksFromDocument(doc, []).map((b) => b.marker)).toEqual(['1.', '2.', undefined]);
  });
});

/**
 * Cutting a spine file into the chapters its contents page declares — the whole-document PDF's half of what
 * Save as Markdown does with markdown. The rules are that extractor's, so the two cut a book the same way.
 */
describe('sliceAtAnchors', () => {
  /** Blocks numbered by their position, so an assertion can name ranges rather than text. */
  const blocks = (...anchors: (string | undefined)[]) =>
    anchors.map((a) => ({ kind: 'paragraph', text: '', marks: [], links: [], anchors: a ? [a] : undefined })) as never;

  it('cuts at each anchor, running each piece to the next', () => {
    const pieces = sliceAtAnchors(blocks('a', undefined, 'b', undefined, undefined), [
      { fragment: 'a', owner: 'one' },
      { fragment: 'b', owner: 'two' },
    ]);
    expect(pieces).toEqual([
      { owner: 'one', from: 0, to: 2 },
      { owner: 'two', from: 2, to: 5 },
    ]);
  });

  it('gives text above the first anchor to NO chapter', () => {
    // Unowned here: where it goes is a question about its text and its neighbors — `leadInGoesTo`.
    const pieces = sliceAtAnchors(blocks(undefined, undefined, 'a'), [{ fragment: 'a', owner: 'one' }]);
    expect(pieces).toEqual([
      { owner: null, from: 0, to: 2 },
      { owner: 'one', from: 2, to: 3 },
    ]);
  });

  it('starts an entry with no fragment at the top, leaving no lead-in', () => {
    const pieces = sliceAtAnchors(blocks(undefined, 'b'), [
      { fragment: '', owner: 'file' },
      { fragment: 'b', owner: 'two' },
    ]);
    expect(pieces).toEqual([
      { owner: 'file', from: 0, to: 1 },
      { owner: 'two', from: 1, to: 2 },
    ]);
  });

  it('drops an anchor no block defines, and the piece before it keeps running', () => {
    // The contents declared it; the document does not contain it. `splitSectionMarkdown` takes the same fallback.
    const pieces = sliceAtAnchors(blocks('a', undefined, undefined), [
      { fragment: 'a', owner: 'one' },
      { fragment: 'ghost', owner: 'two' },
    ]);
    expect(pieces).toEqual([{ owner: 'one', from: 0, to: 3 }]);
  });

  it('gives a block claimed by two entries to the LATER one', () => {
    // The earlier entry runs only as far as the next cut, which is in the same place — so it is empty. The
    // markdown splitter lands here too, and the two exports agreeing matters more than either reading.
    const pieces = sliceAtAnchors(blocks('a'), [
      { fragment: 'a', owner: 'one' },
      { fragment: 'a', owner: 'two' },
    ]);
    expect(pieces.filter((p) => p.to > p.from).map((p) => p.owner)).toEqual(['two']);
  });

  it('takes a file the contents says nothing about as one unclaimed piece', () => {
    expect(sliceAtAnchors(blocks(undefined, undefined), [])).toEqual([{ owner: null, from: 0, to: 2 }]);
  });

  it('orders the pieces by where they land, not by contents order', () => {
    // A contents page may list entries in an order the document does not follow; the page is what gets printed.
    const pieces = sliceAtAnchors(blocks('b', 'a'), [
      { fragment: 'a', owner: 'later' },
      { fragment: 'b', owner: 'earlier' },
    ]);
    expect(pieces.map((p) => p.owner)).toEqual(['earlier', 'later']);
  });
});

/**
 * A contents page points at whatever element the book wrapped the chapter in, and that is very often a container
 * rather than a block. Gutenberg writes `<div class="chapter" id="pgepubid00005">`; the walk descends through it,
 * so unless the first block inside takes its id, every chapter anchor in the book resolves to nothing.
 */
describe('ids on containers the walk descends through', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

  it("gives a wrapping div's id to the first block inside it", () => {
    const blocks = blocksFromDocument(
      parse('<div class="chapter" id="ch5"><h2>CHAPTER I</h2><p>Text.</p></div>'),
      [],
      []
    );
    expect(blocks[0].anchors).toContain('ch5');
  });

  it('does not give it to every block in the chapter', () => {
    const blocks = blocksFromDocument(parse('<div id="ch5"><p>One.</p><p>Two.</p></div>'), [], []);
    expect(blocks[0].anchors).toContain('ch5');
    expect(blocks[1].anchors ?? []).not.toContain('ch5');
  });

  it('keeps the ids a block already carries of its own', () => {
    const blocks = blocksFromDocument(parse('<div id="outer"><h2 id="inner">Title</h2></div>'), [], []);
    expect(blocks[0].anchors).toEqual(expect.arrayContaining(['outer', 'inner']));
  });

  it('collects nested containers onto the same first block', () => {
    const blocks = blocksFromDocument(parse('<div id="a"><section id="b"><p>Text.</p></section></div>'), [], []);
    expect(blocks[0].anchors).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('makes a chapter anchor findable, which is what the slicing needs', () => {
    // The end-to-end shape: two Gutenberg-style chapters in one file, cut at their own divs.
    const blocks = blocksFromDocument(
      parse('<div id="c1"><h2>One</h2><p>First.</p></div><div id="c2"><h2>Two</h2><p>Second.</p></div>'),
      [],
      []
    );
    const pieces = sliceAtAnchors(blocks, [
      { fragment: 'c1', owner: 'one' },
      { fragment: 'c2', owner: 'two' },
    ]);
    expect(pieces.map((p) => p.owner)).toEqual(['one', 'two']);
    // And nothing became an unclaimed lead-in, which is what a lost id produces.
    expect(pieces.some((p) => p.owner === null)).toBe(false);
  });
});

/**
 * **A paragraph written as a `<div>` is still a paragraph.** A technical manual may set every paragraph as
 * `<div id="Par3" class="bookfrontmatter">…</div>`, and a walk that emits text only for `<p>` and its kin, descending
 * through anything else, would keep its headings, figures and lists and lose every word of body text.
 */
describe('blocksFromDocument — paragraphs set as containers', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  it("reads a container holding only text as a paragraph, with its id for the book's links", () => {
    const doc = parse(
      '<div id="Sec1" class="section"><h2>Starting a Ferry Log</h2>' +
        '<div id="Par3">You can start a ferry log in one of two main ways.</div>' +
        '<div id="Par8">This creates a folder named <span>.log</span>.</div></div>'
    );
    const blocks = blocksFromDocument(doc, []);
    expect(blocks.map((b) => [b.kind, b.text])).toEqual([
      ['heading', 'Starting a Ferry Log'],
      ['paragraph', 'You can start a ferry log in one of two main ways.'],
      ['paragraph', 'This creates a folder named .log.'],
    ]);
    expect(blocks[1].anchors).toContain('Par3');
  });

  it('keeps paragraph-containers separate inside a wrapper with no heading of its own', () => {
    const doc = parse('<div class="wrap"><div>One.</div><div>Two.</div></div>');
    expect(blocksFromDocument(doc, []).map((b) => b.text)).toEqual(['One.', 'Two.']);
  });
});

/** A flow split strands a chapter's prose above the next file's first anchor — see `collectByTocAnchors`. */
describe('leadInGoesTo', () => {
  const para = (text: string) => ({ kind: 'paragraph', text, marks: [], links: [] }) as never;
  const heading = { kind: 'heading', text: 'CHAPTER II', marks: [], links: [] } as never;
  const prose = 'Chapter three goes on, sentence after sentence. '.repeat(50);

  it('gives prose with no heading to the chapter before it, when that one was anchored', () => {
    expect(leadInGoesTo([para(prose)], { from: 0, to: 1 }, 'three', 'part-two')).toBe('three');
  });

  it('keeps a lead-in with a heading of its own as a piece of its own', () => {
    expect(leadInGoesTo([heading, para(prose)], { from: 0, to: 2 }, 'three', 'part-two')).toBeNull();
  });

  it('opens the file’s first chapter with anything else — a running header, a closing line', () => {
    expect(leadInGoesTo([para('END OF THE EBOOK')], { from: 0, to: 1 }, 'three', 'license')).toBe('license');
    expect(leadInGoesTo([para(prose)], { from: 0, to: 1 }, undefined, 'license')).toBe('license');
  });
});
