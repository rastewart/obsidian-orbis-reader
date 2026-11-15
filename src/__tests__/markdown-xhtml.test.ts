import { describe, expect, it } from 'vitest';
import {
  anchorBlockIds,
  buildAnchorMap,
  domToXhtml,
  slugify,
  splitAtHeadings,
  stableFootnoteIds,
} from '../markdown-xhtml';

/** Build a DOM the way Obsidian's renderer would leave one. `DOMParser` rather than `innerHTML`: it parses without
 *  ever assigning markup to a live node, which is both safer and what the lint rule is asking for. */
function dom(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
}
const out = (html: string): string => domToXhtml(dom(html)).xhtml;

describe('what passes through', () => {
  it('keeps prose structure', () => {
    expect(out('<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em>.</p>')).toBe(
      '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em>.</p>'
    );
  });

  it('keeps lists, tables and blockquotes', () => {
    expect(out('<ul><li>One</li><li>Two</li></ul>')).toBe('<ul><li>One</li><li>Two</li></ul>');
    expect(out('<table><tr><th colspan="2">H</th></tr></table>')).toContain('<th colspan="2">H</th>');
    expect(out('<blockquote><p>Quoted.</p></blockquote>')).toBe('<blockquote><p>Quoted.</p></blockquote>');
  });

  it('keeps code blocks intact', () => {
    expect(out('<pre><code>const a = 1;</code></pre>')).toBe('<pre><code>const a = 1;</code></pre>');
  });

  it('keeps heading ids, which the anchor map will need', () => {
    expect(out('<h2 id="the-amazon-contract">The Amazon contract</h2>')).toContain('id="the-amazon-contract"');
  });

  it('keeps callout classes and drops every other one', () => {
    // Those two are structure the reader wrote and the EPUB stylesheet explains. `is-collapsed` describes app
    // chrome that nothing inside the book defines.
    const r = out('<div class="callout is-collapsed"><div class="callout-title mod-x">Note</div></div>');
    expect(r).toContain('class="callout"');
    expect(r).toContain('class="callout-title"');
    expect(r).not.toContain('is-collapsed');
    expect(r).not.toContain('mod-x');
  });
});

describe('what does not', () => {
  it('closes void elements, without which the document is malformed XML', () => {
    expect(out('<p>a<br>b</p>')).toBe('<p>a<br/>b</p>');
  });

  it('drops scripts, styles and frames entirely', () => {
    expect(out('<p>Kept.</p><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe>')).toBe(
      '<p>Kept.</p>'
    );
  });

  it('strips every attribute not named, so a handler cannot reach the book by oversight', () => {
    const r = out('<p onclick="steal()" data-callout-fold="+" title="x">Text.</p>');
    expect(r).toBe('<p>Text.</p>');
  });

  it('KEEPS an external link, which a reader can open in a browser', () => {
    // Valid EPUB content: foliate emits `external-link` and Obsidian routes it to the system browser. An earlier
    // version stripped these by applying the wikilink rationale — no vault inside an EPUB — where it does not hold.
    const r = domToXhtml(dom('<p>See <a href="https://x.test/a" class="external-link">the source</a>.</p>'));
    expect(r.xhtml).toBe('<p>See <a href="https://x.test/a">the source</a>.</p>');
    expect(r.losses.links).toBe(0);
  });

  it('keeps mailto, and drops the class with everything else', () => {
    expect(out('<p><a href="mailto:a@b.test" class="external-link">write</a></p>')).toBe(
      '<p><a href="mailto:a@b.test">write</a></p>'
    );
  });

  it('flattens a wikilink to another note, which really is dead in a book', () => {
    const r = domToXhtml(dom('<p>See <a href="Other Note" class="internal-link">that</a>.</p>'));
    expect(r.xhtml).toBe('<p>See that.</p>');
    expect(r.losses.links).toBe(1);
  });

  it('flattens a scheme that only resolves on the machine that made the book', () => {
    // A link that works for its author and nobody else is worse than plain text.
    expect(out('<p><a href="obsidian://open?vault=x">here</a></p>')).toBe('<p>here</p>');
    expect(out('<p><a href="app://local/Users/x/a.pdf">here</a></p>')).toBe('<p>here</p>');
  });

  it('drops an UNPACKAGED image and inline SVG, and counts both', () => {
    // `app://` and vault paths are unresolvable inside an EPUB, and a broken-image box is worse than nothing.
    const r = domToXhtml(dom('<p><img src="app://x/Vault/a.png?1"/></p><p><svg><path/></svg>Math</p>'));
    expect(r.losses.images).toBe(1);
    expect(r.losses.svg).toBe(1);
    expect(r.xhtml).not.toContain('<img');
    expect(r.xhtml).not.toContain('<svg');
  });

  it('keeps a PACKAGED image, self-closed, with its alt text', () => {
    const r = domToXhtml(dom('<p><img src="images/diagram.png" alt="The diagram" title="x"/></p>'));
    expect(r.xhtml).toBe('<p><img src="images/diagram.png" alt="The diagram"/></p>');
    expect(r.losses.images).toBe(0);
  });

  it('UNWRAPS an unknown element rather than dropping it', () => {
    // Obsidian nests real writing inside wrappers that mean nothing here. Dropping them takes the writing too.
    expect(out('<section class="el-p"><p>Kept.</p></section>')).toBe('<p>Kept.</p>');
  });

  it('drops Obsidian collapse indicators whole, so their text does not leak', () => {
    expect(out('<h2>Title<div class="heading-collapse-indicator">▾</div></h2>')).toBe('<h2>Title</h2>');
  });

  it('counts a block that rendered to nothing — what a Dataview query does detached', () => {
    const r = domToXhtml(dom('<p>Real.</p><div class="block-language-dataview"></div>'));
    expect(r.losses.emptyBlocks).toBeGreaterThan(0);
    expect(r.xhtml).toBe('<p>Real.</p>');
  });

  it('keeps an empty table cell, which is a real cell', () => {
    expect(out('<table><tr><td>a</td><td></td></tr></table>')).toContain('<td></td>');
  });
});

/**
 * What the dialog's warnings count. Kitchen Sink's said four drawings or formulas (its callout icons), thirteen empty
 * blocks (icons, image wrappers, an embed's title bar) and a lost link that was a tag — while its formulas, the real
 * losses, were counted as empty.
 */
describe('what counts as lost', () => {
  const losses = (html: string) => domToXhtml(dom(html)).losses;

  it("drops a callout's icon as decoration, not a lost drawing", () => {
    const html =
      '<div class="callout"><div class="callout-title"><div class="callout-icon"><svg></svg></div><div>Note</div></div></div>';
    expect(losses(html)).toMatchObject({ svg: 0, emptyBlocks: 0 });
  });

  it('counts a formula as a formula, and leaves it out', () => {
    const r = domToXhtml(dom('<p>a <span class="math math-inline"><mjx-container></mjx-container></span> b</p>'));
    expect(r.losses).toMatchObject({ svg: 1, emptyBlocks: 0 });
    expect(r.xhtml).toBe('<p>a  b</p>');
  });

  it('counts only a plugin block as empty, not the wrapper of an image not yet packaged', () => {
    expect(losses('<p><span class="internal-embed"><img src="app://x/a.png"/></span></p>').emptyBlocks).toBe(0);
    expect(losses('<div class="block-language-dataview"></div>').emptyBlocks).toBe(1);
  });

  it('keeps a tag as its words, without counting a lost link', () => {
    const r = domToXhtml(dom('<p>A <a href="#sample/tag" class="tag">#sample/tag</a>.</p>'));
    expect(r.xhtml).toBe('<p>A #sample/tag.</p>');
    expect(r.losses.links).toBe(0);
  });

  it('counts a Mermaid diagram as a drawing, and never prints the prompt Obsidian shows in its place', () => {
    // The shape Obsidian 1.13 renders in a vault that has not allowed Mermaid.
    const guarded = domToXhtml(
      dom(
        '<div class="mermaid-wrapper is-guarded"><div class="mermaid-guard-header"><div class="mermaid-guard-text">' +
          '<div class="mermaid-guard-title">Display Mermaid diagrams in this vault?</div></div>' +
          '<div class="mermaid-guard-actions"><button>Allow</button></div></div>' +
          '<div class="mermaid-guard-source"><pre><code class="language-mermaid">graph TD; A--&gt;B;</code></pre></div></div>'
      )
    );
    expect(guarded.xhtml).toBe('');
    expect(guarded.losses.svg).toBe(1);
    // And in one that has, before Mermaid has drawn it.
    const trusted = domToXhtml(dom('<pre><code class="language-mermaid">graph TD; A--&gt;B;</code></pre>'));
    expect(trusted.xhtml).toBe('');
    expect(trusted.losses.svg).toBe(1);
  });

  it("leaves out Obsidian's message where an embed's file does not exist", () => {
    expect(
      out(
        '<p>Before <span class="internal-embed file-embed mod-empty-attachment" src="missing.png">“missing.png” could not be found.</span></p>'
      )
    ).toBe('<p>Before </p>');
  });

  it("gives a details element's summary a line of its own", () => {
    expect(out('<details><summary>A details element</summary>Its text.</details>')).toBe(
      '<p><b>A details element</b></p>Its text.'
    );
  });

  it("leaves out an embedded note's properties, which rendered as a YAML block", () => {
    expect(out('<pre class="frontmatter language-yaml"><code>title: x</code></pre><p>Body.</p>')).toBe('<p>Body.</p>');
  });
});

describe('block links', () => {
  const file = (i: number) => `sect${i + 1}.xhtml`;

  it('lands a link to ^id on the anchor the block was given, across sections', () => {
    const root = dom(
      '<h2>One</h2><p>The target.<span id="orbis-block-blk"></span></p><h2>Two</h2>' +
        '<p>See <a data-href="#^blk" href="#^blk" class="internal-link">^blk</a>.</p>'
    );
    const sections = splitAtHeadings(root, 2, 'Book');
    const map = buildAnchorMap(sections, file);
    expect(domToXhtml(sections[0].nodes, map).xhtml).toContain('<span id="orbis-block-blk"></span>');
    const r = domToXhtml(sections[1].nodes, map);
    expect(r.xhtml).toContain('<a href="sect1.xhtml#orbis-block-blk">^blk</a>');
    expect(r.losses.links).toBe(0);
  });

  it('keeps an anchor that stands alone, after a list or a table', () => {
    expect(out('<ul><li>a</li></ul><p><span id="orbis-block-list"></span></p>')).toBe(
      '<ul><li>a</li></ul><p><span id="orbis-block-list"></span></p>'
    );
  });
});

describe('task lists', () => {
  it('become box glyphs rather than vanishing', () => {
    // A checklist's only information is which items are done; bare items lose exactly that.
    expect(out('<li><input type="checkbox"/>Todo</li>')).toBe('<li>☐ Todo</li>');
    expect(out('<li><input type="checkbox" checked=""/>Done</li>')).toBe('<li>☑ Done</li>');
  });

  it('drops other inputs entirely', () => {
    expect(out('<p><input type="text"/>After</p>')).toBe('<p>After</p>');
  });
});

describe('escaping', () => {
  it('escapes text, so an ampersand cannot break the document', () => {
    expect(out('<p>Tom &amp; Jerry &lt;3</p>')).toBe('<p>Tom &amp; Jerry &lt;3</p>');
  });

  it('escapes attribute values too', () => {
    expect(out('<h2 id="a&amp;b">T</h2>')).toContain('id="a&amp;b"');
  });
});

const article = () =>
  dom(
    '<p>Opening prose.</p>' +
      '<h2>The Amazon contract</h2><p>One.</p><h3>Detail</h3><p>Two.</p>' +
      '<h2>What it means</h2><p>Three.</p>'
  );

describe('slugify', () => {
  it('makes a link target out of heading text', () => {
    expect(slugify('The Amazon contract')).toBe('the-amazon-contract');
  });

  it('drops punctuation and collapses runs', () => {
    expect(slugify('  Frontier lab economics: tax the exit!  ')).toBe('frontier-lab-economics-tax-the-exit');
  });

  it('keeps letters outside ASCII, so a non-English heading still gets an anchor', () => {
    expect(slugify('Café años')).toBe('café-años');
  });
});

describe('splitAtHeadings', () => {
  it('cuts at the chosen level, in document order', () => {
    const s = splitAtHeadings(article(), 2, 'Book');
    expect(s.map((x) => x.title)).toEqual(['Book', 'The Amazon contract', 'What it means']);
  });

  it('gives content before the first heading its own section, titled with the book', () => {
    // Silently losing someone's opening paragraphs is a bug, not a tradeoff.
    const s = splitAtHeadings(article(), 2, 'Book');
    expect(domToXhtml(s[0].nodes).xhtml).toBe('<p>Opening prose.</p>');
  });

  it('nests sub-headings as nav entries inside their section', () => {
    const s = splitAtHeadings(article(), 2, 'Book');
    expect(s[1].children).toEqual([{ anchor: 'detail', title: 'Detail', level: 3 }]);
    expect(s[2].children).toEqual([]);
  });

  it('produces one section when nothing matches the level, which is a valid book', () => {
    expect(splitAtHeadings(article(), 5, 'Book')).toHaveLength(1);
  });

  it('produces one section for level 0 — do not split', () => {
    expect(splitAtHeadings(article(), 0, 'Book')).toHaveLength(1);
  });

  it('gives every heading an id, generated because Obsidian does not', () => {
    const root = article();
    splitAtHeadings(root, 2, 'Book');
    expect(root.querySelector('h2')?.id).toBe('the-amazon-contract');
    expect(root.querySelector('h3')?.id).toBe('detail');
  });

  it('dedupes repeated heading text, since two chapters can share a name', () => {
    const root = dom('<h2>Notes</h2><p>a</p><h2>Notes</h2><p>b</p>');
    splitAtHeadings(root, 2, 'Book');
    const ids = Array.from(root.querySelectorAll('h2')).map((h) => h.id);
    expect(ids).toEqual(['notes', 'notes-2']);
  });

  it('descends through a single wrapper, which would otherwise be the whole book', () => {
    const wrapped = dom('<div class="markdown-preview-sizer"><h2>One</h2><p>a</p><h2>Two</h2><p>b</p></div>');
    expect(splitAtHeadings(wrapped, 2, 'Book')).toHaveLength(2);
  });

  it('handles a note that is only a heading', () => {
    expect(splitAtHeadings(dom('<h2>Alone</h2>'), 2, 'Book').map((s) => s.title)).toEqual(['Alone']);
  });
});

describe('the anchor map', () => {
  const file = (i: number) => `sect${i + 1}.xhtml`;

  it('finds each anchor in the file it landed in', () => {
    const map = buildAnchorMap(splitAtHeadings(article(), 2, 'Book'), file);
    expect(map.get('the-amazon-contract')).toEqual({ file: 'sect2.xhtml', id: 'the-amazon-contract' });
    expect(map.get('detail')).toEqual({ file: 'sect2.xhtml', id: 'detail' });
  });

  it('keeps a heading link alive ACROSS the split', () => {
    // The whole point: the link is in section 3 and its target is in section 2, so without rewriting it is dead.
    const root = dom('<h2>One</h2><p>a</p><h2>Two</h2><p>See <a href="#One">the first</a>.</p>');
    const sections = splitAtHeadings(root, 2, 'Book');
    const map = buildAnchorMap(sections, file);
    const out = domToXhtml(sections[1].nodes, map).xhtml;
    expect(out).toContain('<a href="sect1.xhtml#one">the first</a>');
  });

  it('resolves a Note#Heading link by its slug, when the note it names is this one', () => {
    const root = dom('<h2>Deep Dive</h2><p><a href="MyNote#Deep Dive">back</a></p>');
    const sections = splitAtHeadings(root, 2, 'Book');
    const isSelf = (p: string) => p === 'MyNote';
    const out = domToXhtml(sections[0].nodes, buildAnchorMap(sections, file), undefined, isSelf).xhtml;
    expect(out).toContain('href="sect1.xhtml#deep-dive"');
  });

  it("never lands another note's heading on this note's heading of the same name", () => {
    // Getting Started and Trails both have an Overview; `[[003-Trails#Overview]]` went to Getting Started's own.
    const root = dom('<h2>Overview</h2><p><a data-href="003-Trails#Overview" href="003-Trails#Overview">x</a></p>');
    const sections = splitAtHeadings(root, 2, 'Book');
    const trails = () => ({ file: 'sect4.xhtml', id: 'overview' });
    const isSelf = (p: string) => p === '002-Getting Started';
    expect(domToXhtml(sections[0].nodes, buildAnchorMap(sections, file), trails, isSelf).xhtml).toContain(
      'href="sect4.xhtml#overview"'
    );
    // With nothing to resolve it against — one note on its own — it is a lost link, not a link to the wrong place.
    const alone = domToXhtml(sections[0].nodes, buildAnchorMap(sections, file), undefined, isSelf);
    expect(alone.xhtml).not.toContain('href=');
    expect(alone.losses.links).toBe(1);
  });

  it('keeps footnote references alive, which the split would otherwise break', () => {
    // Obsidian renders the footnote LIST at the end of the document, so after splitting it is in the last file and
    // every reference in the book is dead unless rewritten. Same map, no extra machinery.
    const root = dom(
      '<h2>One</h2><p>Claim<sup><a href="#fn-1">1</a></sup></p>' +
        '<h2>Notes</h2><ol><li id="fn-1">The source.</li></ol>'
    );
    const sections = splitAtHeadings(root, 2, 'Book');
    const out = domToXhtml(sections[0].nodes, buildAnchorMap(sections, file)).xhtml;
    expect(out).toContain('<a href="sect2.xhtml#fn-1">1</a>');
  });

  it('keeps an external link and flattens a cross-note one', () => {
    const root = dom('<h2>One</h2><p><a href="https://x.test">out</a> and <a href="OtherNote">across</a></p>');
    const sections = splitAtHeadings(root, 2, 'Book');
    const r = domToXhtml(sections[0].nodes, buildAnchorMap(sections, file));
    expect(r.xhtml).toContain('<a href="https://x.test">out</a>');
    expect(r.xhtml).not.toContain('OtherNote');
    expect(r.losses.links).toBe(1);
  });

  it('flattens an internal link whose target does not exist', () => {
    const root = dom('<h2>One</h2><p><a href="#nowhere">gone</a></p>');
    const sections = splitAtHeadings(root, 2, 'Book');
    expect(domToXhtml(sections[0].nodes, buildAnchorMap(sections, file)).xhtml).not.toContain('<a');
  });
});

describe('links to another note in the book', () => {
  // Folder conversion only: `domToXhtml` takes a second resolver for links that LEAVE the note. Built by
  // `folder-epub.ts`, which is the layer that knows the vault; here it is a stub.
  const link = (attrs: string): HTMLElement => dom(`<p><a ${attrs}>Roadmap</a></p>`);
  const toThePlan = () => ({ file: 'sect2.xhtml', id: 'the-plan' });

  it('rewrites a cross-note link, reading the target from data-href', () => {
    // `data-href` is the raw target the reader typed; `href` on the same element is the rendered one, which on
    // mobile is a `capacitor://` URL and on desktop an `app://` one.
    const el = link('data-href="002-roadmap.md" href="app://obsidian.md/002-roadmap.md"');
    const { xhtml, losses } = domToXhtml(el, undefined, toThePlan);
    expect(xhtml).toContain('<a href="sect2.xhtml#the-plan">Roadmap</a>');
    expect(losses.links).toBe(0);
  });

  it('links to the file alone when the resolver places no fragment', () => {
    const { xhtml } = domToXhtml(link('data-href="002-roadmap.md"'), undefined, () => ({ file: 'sect2.xhtml' }));
    expect(xhtml).toContain('<a href="sect2.xhtml">Roadmap</a>');
  });

  it('flattens and counts a link the resolver declines', () => {
    const { xhtml, losses } = domToXhtml(link('data-href="../guide/troubleshooting.md"'), undefined, () => null);
    expect(xhtml).toContain('<p>Roadmap</p>');
    expect(losses.links).toBe(1);
  });

  it('leaves an external link alone, resolver or not', () => {
    const { xhtml, losses } = domToXhtml(link('href="https://example.com"'), undefined, () => null);
    expect(xhtml).toContain('<a href="https://example.com">Roadmap</a>');
    expect(losses.links).toBe(0);
  });

  it('prefers an in-note anchor over the note resolver', () => {
    // A bare `#anchor` must resolve where it was written, not be handed to a resolver that would re-derive it.
    const anchors = new Map([['top', { file: 'sect1.xhtml', id: 'top' }]]);
    const { xhtml } = domToXhtml(link('data-href="#top"'), anchors, () => ({ file: 'sect9.xhtml' }));
    expect(xhtml).toContain('<a href="sect1.xhtml#top">Roadmap</a>');
  });
});

/** Obsidian's rendering strips `^blk` and marks nothing, so a block link had nowhere to land. */
describe('anchorBlockIds', () => {
  const block = (id: string, source: string, text: string) => {
    const start = source.indexOf(text);
    return { id, position: { start: { offset: start }, end: { offset: start + text.length } } };
  };

  it('turns a block id at the end of a paragraph into an anchor where the marker was', () => {
    const source = 'Intro.\n\nThe target paragraph. ^blk\n\nAfter.';
    const out = anchorBlockIds(source, { blk: block('blk', source, 'The target paragraph. ^blk') });
    expect(out).toBe('Intro.\n\nThe target paragraph. <span id="orbis-block-blk"></span>\n\nAfter.');
  });

  it('does the same for an id on a line of its own, after a list', () => {
    const source = '- one\n- two\n\n^list-1\n';
    const out = anchorBlockIds(source, { 'list-1': block('list-1', source, '- one\n- two\n\n^list-1') });
    expect(out).toBe('- one\n- two\n\n<span id="orbis-block-list-1"></span>\n');
  });

  it('leaves a ^ that is not one of the blocks alone — inside code, or in prose', () => {
    const source = '```\nx ^blk\n```\n\nPrices rose 5^2 times.';
    expect(anchorBlockIds(source, {})).toBe(source);
    expect(anchorBlockIds(source, undefined)).toBe(source);
  });
});

describe('stableFootnoteIds', () => {
  // The shape Obsidian 1.13 leaves: every id and href ends in the render's random docId.
  const rendered = (doc: string, embed: string) =>
    dom(
      `<p>Claim<sup data-footnote-id="fnref-1-${doc}" id="fnref-1-${doc}"><a href="#fn-1-${doc}" class="footnote-link">[1]</a></sup></p>` +
        `<div class="internal-embed"><sup data-footnote-id="fnref-1-${embed}" id="fnref-1-${embed}"><a href="#fn-1-${embed}">[1]</a></sup></div>` +
        `<ol><li data-footnote-id="fn-1-${doc}" id="fn-1-${doc}">Source. <a href="#fnref-1-${doc}">↩︎</a></li></ol>`
    );

  it('gives two renders of the same note the same ids', () => {
    const a = rendered('a279f57a4d4ab803', '0123456789abcdef');
    const b = rendered('9f0e1d2c3b4a5968', 'fedcba9876543210');
    stableFootnoteIds(a);
    stableFootnoteIds(b);
    expect(a.innerHTML).toBe(b.innerHTML);
    expect(a.querySelector('li')?.id).toBe('fn-1-d1');
    expect(a.querySelector('a')?.getAttribute('href')).toBe('#fn-1-d1');
  });

  it("keeps an embedded note's footnotes apart from the note's own", () => {
    const a = rendered('a279f57a4d4ab803', '0123456789abcdef');
    stableFootnoteIds(a);
    const ids = Array.from(a.querySelectorAll('[id]')).map((el) => el.id);
    expect(ids).toEqual(['fnref-1-d1', 'fnref-1-d2', 'fn-1-d1']);
  });
});
