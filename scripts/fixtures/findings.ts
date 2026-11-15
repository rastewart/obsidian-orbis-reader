// Fixtures for individual findings — one book per shape a real book taught the code, reproduced from its structure.
//
// The books in `books.ts` cover what the automated tests and the manual test plans read. These are for checking a
// finding by hand: each reproduces the markup that exposed a bug or shaped a rule, and says above it what to look at.
// Every EPUB here is also in `book-shapes.json`, so `chapter-rows.test.ts` compares the export lists on it — which is
// what checks that non-linear sections are exported (see `RawSection.linear`).
//
// **Each chapter's heading names what it shows** — "Paragraphs set small", "Code keeps its font" — so a manual
// check can go straight to the case instead of hunting through invented prose for it.

import { AUTHOR, type Built, coverFiles, css, epub, page, titleFromFile } from './books';
import { type EpubFile, type NavEntry, xhtml } from './epub';
import { buildFb2 } from './fb2';
import { cover, png } from './png';
import { esc, proseFrom, ps } from './prose';

/**
 * A book that sizes its text with the absolute keywords — `small`, `x-large` — which the font-size setting cannot
 * reach until `reader/keyword-sizes.ts` rewrites them to `rem`. Few books use them where it shows, but a publisher can
 * set every paragraph `small`.
 *
 * **Check:** open it at 100% and note the size, then set Font size to 150%. Every chapter's text should grow — the
 * `small` paragraphs, the inline `large` line, the shorthand and `!important` ones, the rule inside `@media` — and at
 * 100% nothing should look different from before the rewrite (the sizes are the browser's rendered table: `small` is
 * 13px, not the spec's 14.2). The relative sizes (`smaller`, `2em`, `90%`) scaled already and must not change.
 */
export function keywordSizes(): Built {
  const p = proseFrom(1201);
  const TITLE = titleFromFile('keyword-sizes.epub');
  const stylesheet = [
    'p.para { font-size: small; margin: 0 0 0.6em; }',
    'h2 { font-size: x-large; text-align: center; }',
    '.shorthand { font: italic x-small Georgia, serif; }',
    '.important { font-size: large !important; }',
    '.smaller { font-size: smaller; }',
    '.twice { font-size: 2em; }',
    '.percent { font-size: 90%; }',
    '/* A keyword in a comment is not a size: font-size: xx-large */',
    '.quoted::before { content: "small "; }',
    '@media screen { .in-media { font-size: medium; } }',
    '@supports (display: block) { .in-supports { font-size: x-large; } }',
  ].join('\n');
  const para = (text: string, cls = 'para', style = '') =>
    `<p class="${cls}"${style ? ` style="${style}"` : ''}>${esc(text)}</p>`;
  const chapters: { name: string; body: string }[] = [
    {
      name: 'Paragraphs set small',
      body: p
        .paragraphsOf(2500)
        .map((t) => para(t))
        .join('\n'),
    },
    {
      name: 'Inline sizes',
      body: [
        para(p.paragraph(), 'para', 'font-size: large'),
        `<p class="para">${esc(p.sentence())} <span style="font-size: x-small">${esc(p.sentence())}</span> ${esc(p.sentence())}</p>`,
        ...p.paragraphsOf(1200).map((t) => para(t)),
      ].join('\n'),
    },
    {
      name: 'Shorthand and important',
      body: [
        para(p.paragraph(), 'shorthand'),
        para(p.paragraph(), 'important'),
        ...p.paragraphsOf(1000).map((t) => para(t)),
      ].join('\n'),
    },
    {
      name: 'Relative sizes are left alone',
      body: [
        para(p.paragraph(), 'smaller'),
        para(p.paragraph(), 'twice'),
        para(p.paragraph(), 'percent'),
        ...p.paragraphsOf(800).map((t) => para(t)),
      ].join('\n'),
    },
    {
      name: 'Keywords that are not sizes',
      body: [
        para(p.paragraph(), 'para quoted'),
        para(p.paragraph(), 'in-media'),
        para(p.paragraph(), 'in-supports'),
        ...p.paragraphsOf(800).map((t) => para(t)),
      ].join('\n'),
    },
  ];
  const files: EpubFile[] = [
    ...coverFiles(3, TITLE),
    css(),
    { path: 'sizes.css', mediaType: 'text/css', content: `${stylesheet}\n` },
  ];
  const link = '<link rel="stylesheet" type="text/css" href="sizes.css"/>';
  chapters.forEach((c, i) => {
    files.push({
      path: `chapter-${i + 1}.xhtml`,
      mediaType: 'application/xhtml+xml',
      content: xhtml(c.name, `<h2 id="ch">${esc(c.name)}</h2>\n${c.body}`, link),
    });
  });
  return epub(
    'keyword-sizes.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:keyword-sizes',
      files,
      spine: [{ path: 'cover.xhtml' }, ...chapters.map((_, i) => ({ path: `chapter-${i + 1}.xhtml` }))],
      nav: chapters.map((c, i) => ({ label: c.name, href: `chapter-${i + 1}.xhtml#ch` })),
      coverImage: 'cover.png',
    },
    3
  );
}

/**
 * A book that styles its own paragraphs — justified, line-spaced and set in a font by a rule ON the paragraph, which
 * beats any rule Orbis writes on `body` — beside the lines it deliberately centers or right-aligns, and the code and
 * symbols whose font is part of what they say. `reader/body-text.ts` tags the body text so the display style can reach
 * it and leave the rest alone. Most books justify their own text, and many center some of it or set line-height or
 * a font on the paragraph or in spans.
 *
 * **Check:** set Body text alignment to Left — the justified paragraphs go ragged-right, while the centered title
 * lines, the verse and the right-aligned signature do not move. Change Line spacing and Font: the paragraphs, list
 * items, quotations and table cells follow; the headings, the inline code, the monospace and symbol spans and the
 * code block keep the book's own. In "One wrapper, many paragraphs" every paragraph follows, not the wrapper around
 * them.
 */
export function bodyTextStyles(): Built {
  const p = proseFrom(1301);
  const TITLE = titleFromFile('body-text-styles.epub');
  const stylesheet = [
    'p { text-align: justify; line-height: 1.2; font-family: Georgia, "Times New Roman", serif; margin: 0 0 0.6em; }',
    'h2 { text-align: center; line-height: 1.6; }',
    'p.center { text-align: center; }',
    'p.right { text-align: right; }',
    'div.verse p { text-align: center; font-style: italic; }',
    'span.face { font-family: "Palatino Linotype", Palatino, serif; }',
    'span.mono { font-family: "Courier New", Courier, monospace; }',
    'span.symbol { font-family: Symbol, "Zapf Dingbats"; }',
    'pre { font-family: Menlo, Consolas, monospace; line-height: 1.3; }',
    'blockquote, li, td, dd { text-align: justify; }',
  ].join('\n');
  const chapters: { name: string; body: string }[] = [
    { name: 'Justified by the book', body: ps(p.paragraphsOf(2500)) },
    {
      name: 'Centered and right-aligned lines',
      body: [
        `<p class="center">${esc(p.sentence())}</p>`,
        `<p class="center">${esc(p.sentence())}</p>`,
        ps(p.paragraphsOf(900)),
        `<div class="verse">\n${Array.from({ length: 6 }, () => `<p>${esc(p.sentence())}</p>`).join('\n')}\n</div>`,
        ps(p.paragraphsOf(700)),
        `<p class="right">${esc(p.sentence())}</p>`,
      ].join('\n'),
    },
    {
      name: 'A font in spans',
      body: p
        .paragraphsOf(1800)
        .map((t) => `<p><span class="face">${esc(t)}</span></p>`)
        .join('\n'),
    },
    {
      name: 'Code and symbols keep their font',
      body: [
        `<p>${esc(p.sentence())} Run <code>orbis --check</code> before ${esc(p.sentence().toLowerCase())}</p>`,
        `<p>${esc(p.sentence())} <span class="mono">LEDGER-0042</span> ${esc(p.sentence())}</p>`,
        `<p>${esc(p.sentence())} <span class="symbol">abcde</span> ${esc(p.sentence())}</p>`,
        `<pre>let count = 0;\nfor (const lantern of lanterns) {\n  count += lantern.lit ? 1 : 0;\n}</pre>`,
        ps(p.paragraphsOf(900)),
      ].join('\n'),
    },
    {
      name: 'One wrapper, many paragraphs',
      body: [
        `<div class="wrapper">\n${ps(p.paragraphsOf(4000))}\n</div>`,
        `<ul>\n${Array.from({ length: 4 }, () => `<li>${esc(p.paragraph(2))}</li>`).join('\n')}\n</ul>`,
        `<blockquote>${esc(p.paragraph())}</blockquote>`,
        `<table>\n${Array.from({ length: 3 }, () => `<tr><td>${esc(p.sentence())}</td><td>${esc(p.sentence())}</td></tr>`).join('\n')}\n</table>`,
        `<dl><dt>${esc(p.sentence())}</dt><dd>${esc(p.paragraph(2))}</dd></dl>`,
      ].join('\n'),
    },
  ];
  const files: EpubFile[] = [
    ...coverFiles(4, TITLE),
    css(),
    { path: 'book.css', mediaType: 'text/css', content: `${stylesheet}\n` },
  ];
  const link = '<link rel="stylesheet" type="text/css" href="book.css"/>';
  chapters.forEach((c, i) => {
    files.push({
      path: `chapter-${i + 1}.xhtml`,
      mediaType: 'application/xhtml+xml',
      content: xhtml(c.name, `<h2 id="ch">${esc(c.name)}</h2>\n${c.body}`, link),
    });
  });
  return epub(
    'body-text-styles.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:body-text-styles',
      files,
      spine: [{ path: 'cover.xhtml' }, ...chapters.map((_, i) => ({ path: `chapter-${i + 1}.xhtml` }))],
      nav: chapters.map((c, i) => ({ label: c.name, href: `chapter-${i + 1}.xhtml#ch` })),
      coverImage: 'cover.png',
    },
    4
  );
}

/** A Calibre-style content document: its own `<title>`, the body tag given whole, a stylesheet one folder up. */
function calibreDoc(title: string, bodyTag: string, body: string, head = CALIBRE_HEAD): string {
  return xhtml(title, body, head).replace('<body>', bodyTag);
}
const CALIBRE_HEAD = '<link rel="stylesheet" type="text/css" href="../stylesheet.css"/>';

/** An image carrying a word — a chapter number, a part divider — as publishers set them, with the word in `alt`. */
function wordImage(word: string, width = 360, height = 200): Uint8Array {
  const text = word.toUpperCase();
  const scale = Math.max(2, Math.min(8, Math.floor((width - 40) / (text.length * 6 - 1))));
  return png(width, height, [250, 248, 242], [], 0, [
    { text, y: 0.5 - (7 * scale) / height / 2, scale, color: [40, 40, 40] },
  ]);
}

/** A 32-hex suffix shared by every body id, as Calibre writes them: `A1K00-<suffix>`. */
const BODY_ID_SUFFIX = '5f1e0c9a7b3d4e2f8a6b1c0d9e8f7a6b';

/**
 * A Calibre book whose every contents entry points at the `<body id>` of its file — the shape where a chapter marker
 * inserted BEFORE the anchor lands outside the body, and a whole-book export silently drops the chapter
 * (`collectByTocAnchors`, book-extractor.ts). Chapters have no heading element; their number is an image with the
 * number in `alt`, and their name comes from `<title>Chapter N, Calibre Body Anchors</title>`.
 *
 * It also adds the continuations Calibre writes:
 * - `part0011.html` — no id, no heading, `<title>Continued, …</title>`: Chapter 4 continuing. It should have no row of
 *   its own, and its text should follow Chapter 4's.
 * - `part0008_split_001.html` — **a probe**: the second half of a split, carrying the first half's `<title>` and body
 *   id, as Calibre copies them. The rule does not treat "Chapter 3, Calibre Body Anchors" as the book's name, so
 *   this may show as a row of its own. Whether it should is an open question. Around them: a front `Continued` file
 *   before the first entry and long back ones after the last, which must stay sections of their own; a split pair
 *   sharing one body id; a Contents page linking every entry by body id, with one junk `kindle:embed` href; and
 *   image-only title, part and excerpt pages.
 *
 * **Check:** Save as Markdown, whole book in one note — every "Chapter N" heading is there (a marker outside the body
 * leaves none, and no error), Chapter 4's text runs straight into the sentence "This file continues Chapter 4", and the
 * Contents page's links point at the chapters. One note per chapter: the continuation is inside Chapter 4's note. Then
 * note what the probe did, in the dialog and the Marks PDF picker, which must list the same rows.
 */
export function calibreBodyAnchors(): Built {
  const p = proseFrom(1501);
  const TITLE = `${titleFromFile('calibre-body-anchors.epub')} (Orbis Reader Fixtures)`;
  const SHORT = titleFromFile('calibre-body-anchors.epub');
  const bodyId = (n: number) => `${String.fromCharCode(65 + (n % 26))}${n}K00-${BODY_ID_SUFFIX}`;
  const para = (text: string, cls = 'para-p') => `<p class="${cls}">${esc(text)}</p>`;
  let page = 1;
  const pageBreak = () => {
    const n = page++;
    return `<span id="page_${n}" epub:type="pagebreak" title="${n}" class="calibre6"></span>`;
  };
  /** A chapter as such a book sets one: a page anchor, the number as an image, a first paragraph with a dropcap. */
  const chapterBody = (n: number, alt: string, chars: number) => {
    const [first, ...rest] = p.paragraphsOf(chars);
    return [
      `<a id="d1-d1e${400 + n}" class="calibre4"></a>`,
      `<div id="div1" class="page_top_padding">${pageBreak()}`,
      `<div id="div2" class="figure_medium"><div class="calibre7"><img alt="${esc(alt)}" src="../images/num-${n}.png" class="calibre8"/></div></div>`,
      `<p id="p1" class="para-pf"><span class="char-first">${esc(first.charAt(0))}</span>${esc(first.slice(1))}</p>`,
      ...rest.map((t, i) => `<p id="p${i + 2}" class="para-p">${esc(t)}</p>`),
      '</div>',
    ].join('\n');
  };
  const imageOnly = (src: string, cls: string) =>
    `<div class="${cls}"><img alt="" src="../images/${src}" class="calibre8"/></div>`;

  type Doc = { file: string; nav?: string; title: string; body: string; bodyTag: string; parent?: string };
  const docs: Doc[] = [];
  const add = (d: Omit<Doc, 'bodyTag'> & { id?: number | null; extra?: string; cls?: string }) =>
    docs.push({
      ...d,
      bodyTag: `<body${d.extra ? ` ${d.extra}` : ''}${d.id != null ? ` id="${bodyId(d.id)}"` : ''} class="${d.cls ?? 'calibre'}">`,
    });
  const t = (label: string) => `${label}, ${SHORT}`;

  add({
    file: 'part0000.html',
    title: 'Continued, ' + SHORT,
    id: null,
    body: `<div class="page_top_padding">${para('This front file has no id and no heading, and sits before the first contents entry, so it stays a section of its own.', 'right')}\n${p
      .paragraphsOf(700)
      .map((x) => para(x))
      .join('\n')}</div>`,
  });
  add({
    file: 'part0001_split_000.html',
    nav: 'Other Titles',
    title: t('Other Titles'),
    id: 1,
    body: `<h1 id="h1" class="para-ach">Other Titles</h1>\n${para(p.sentence())}`,
  });
  add({
    file: 'part0001_split_001.html',
    title: t('Other Titles'),
    id: 1,
    body: `<h1 id="h3" class="para-ach">More Titles</h1>\n${para('The second half of a split, with the first half’s body id.')}`,
  });
  add({
    file: 'part0002.html',
    nav: 'Title Page',
    title: t('Title Page'),
    id: 2,
    extra: 'epub:type="titlepage"',
    body: imageOnly('title.png', 'figure_fullpage'),
  });
  add({
    file: 'part0003.html',
    nav: 'Contents',
    title: t('Contents'),
    id: 3,
    body: '' /* filled in below, once every entry has its id */,
  });
  add({ file: 'part0004.html', nav: 'Prologue', title: t('Prologue'), id: 4, body: chapterBody(0, 'Prologue', 2000) });
  add({
    file: 'part0005.html',
    nav: 'Part One',
    title: t('Part One'),
    id: 5,
    body: imageOnly('part-one.png', 'figure_fullpage'),
  });
  add({
    file: 'part0006.html',
    nav: 'Chapter 1',
    parent: 'Part One',
    title: t('Chapter 1'),
    id: 6,
    body: chapterBody(1, '1', 3000),
  });
  add({
    file: 'part0007.html',
    nav: 'Chapter 2',
    parent: 'Part One',
    title: t('Chapter 2'),
    id: 7,
    body: chapterBody(2, '2', 3000),
  });
  add({
    file: 'part0008_split_000.html',
    nav: 'Chapter 3',
    parent: 'Part One',
    title: t('Chapter 3'),
    id: 8,
    body: chapterBody(3, '3', 3000),
  });
  add({
    file: 'part0008_split_001.html',
    title: t('Chapter 3'),
    id: 8,
    body: [
      para(
        'This file is the second half of Chapter 3, split the way Calibre splits: its title and body id are copied from the first half.'
      ),
      ...p.paragraphsOf(2000).map((x) => para(x)),
    ].join('\n'),
  });
  add({
    file: 'part0009.html',
    nav: 'Part Two',
    title: t('Part Two'),
    id: 9,
    body: imageOnly('part-two.png', 'figure_fullpage'),
  });
  add({
    file: 'part0010.html',
    nav: 'Chapter 4',
    parent: 'Part Two',
    title: t('Chapter 4'),
    id: 10,
    body: chapterBody(4, '4', 3000),
  });
  add({
    file: 'part0011.html',
    title: 'Continued, ' + SHORT,
    id: null,
    body: [
      para('This file continues Chapter 4: no id, no heading, and no contents entry of its own.'),
      ...p.paragraphsOf(1500).map((x) => para(x)),
    ].join('\n'),
  });
  add({
    file: 'part0012.html',
    nav: 'Chapter 5',
    parent: 'Part Two',
    title: t('Chapter 5'),
    id: 12,
    body: chapterBody(5, '5', 2500),
  });
  add({
    file: 'part0013.html',
    nav: 'Epilogue',
    parent: 'Part Two',
    title: t('Epilogue'),
    id: 13,
    body: chapterBody(6, 'Epilogue', 2500),
  });
  add({
    file: 'part0014.html',
    nav: 'Acknowledgments',
    title: t('Acknowledgments'),
    id: 14,
    body: `<h1 class="para-bmt-ack-pg">Acknowledgments</h1>\n${p
      .paragraphsOf(800)
      .map((x) => para(x))
      .join('\n')}`,
  });
  add({
    file: 'part0015.html',
    nav: 'About the Author',
    title: t('About the Author'),
    id: 15,
    body: `${para(p.paragraph(), 'para-ata')}\n<p class="para-ata"><a class="char-url" href="http://example.com/author">example.com/author</a></p>`,
  });
  add({
    file: 'part0016.html',
    nav: 'Excerpt',
    title: t('Excerpt'),
    id: 16,
    body: imageOnly('excerpt.png', 'figure_fullpage1'),
  });
  add({
    file: 'part0017.html',
    title: 'Continued, ' + SHORT,
    id: null,
    body: [
      para(
        'This back file follows the last contents entry, so it stays a section of its own rather than joining the excerpt.',
        'indent'
      ),
      ...p.paragraphsOf(3000).map((x) => para(x, 'indent')),
    ].join('\n'),
  });
  add({
    file: 'part0018.html',
    title: 'Continued, ' + SHORT,
    id: null,
    body: imageOnly('excerpt.png', 'figure_fullpage1'),
  });
  add({
    file: 'part0019_split_000.html',
    title: 'Continued, ' + SHORT,
    id: null,
    cls: 'calibre10',
    body: imageOnly('ad.png', 'figure_fullpage'),
  });
  add({
    file: 'part0019_split_001.html',
    title: 'Continued, ' + SHORT,
    id: null,
    cls: 'calibre10',
    body: `<h1 id="title" class="calibre12">Discover More</h1>\n<p><a class="calibre14 pcalibre1" href="http://example.com/more">example.com/more</a></p>`,
  });

  const listed = docs.filter((d) => d.nav);
  const hrefOf = (d: Doc) => `${d.file}#${/id="([^"]+)"/.exec(d.bodyTag)?.[1] ?? ''}`;
  const contents = docs.find((d) => d.file === 'part0003.html');
  if (contents) {
    contents.body = [
      '<h1 class="calibre9">Contents</h1>',
      '<div class="toc_chap">',
      ...listed.map(
        (d) =>
          `<p class="${d.parent ? 'toc_chap1' : 'toc_fm1'}"><a href="${hrefOf(d)}" class="calibre4">${esc(d.nav ?? '')}</a></p>`
      ),
      '<p class="toc_fm1"><a href="kindle:embed:0002?mime=image/jpg" class="calibre4">A link Calibre left behind</a></p>',
      '</div>',
    ].join('\n');
  }
  const nav: NavEntry[] = [];
  for (const d of listed) {
    const entry = { label: d.nav ?? '', href: `text/${hrefOf(d)}` };
    const parent = d.parent ? nav.find((e) => e.label === d.parent) : undefined;
    if (parent) (parent.children ??= []).push(entry);
    else nav.push(entry);
  }

  const images: EpubFile[] = [
    ...['Prologue', '1', '2', '3', '4', '5', 'Epilogue'].map((w, i) => ({
      path: `images/num-${i === 6 ? 6 : i}.png`,
      mediaType: 'image/png',
      content: wordImage(w),
    })),
    { path: 'images/title.png', mediaType: 'image/png', content: wordImage(SHORT, 400, 600) },
    { path: 'images/part-one.png', mediaType: 'image/png', content: wordImage('Part One', 400, 600) },
    { path: 'images/part-two.png', mediaType: 'image/png', content: wordImage('Part Two', 400, 600) },
    { path: 'images/excerpt.png', mediaType: 'image/png', content: wordImage('Excerpt', 400, 600) },
    { path: 'images/ad.png', mediaType: 'image/png', content: wordImage('More Books', 400, 600) },
  ];
  const coverImage = cover(0, SHORT, ['EPUB']);
  const files: EpubFile[] = [
    { path: 'cover.png', mediaType: 'image/png', content: coverImage },
    {
      path: 'titlepage.xhtml',
      mediaType: 'application/xhtml+xml',
      properties: 'svg',
      content: xhtml(
        'Cover',
        '<div><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100%" height="100%" viewBox="0 0 400 600" preserveAspectRatio="none"><image width="400" height="600" xlink:href="cover.png"/></svg></div>',
        '<meta name="calibre:cover" content="true"/>'
      ),
    },
    {
      path: 'stylesheet.css',
      mediaType: 'text/css',
      content: [
        '.calibre { display: block; margin: 0 5pt; }',
        '.calibre4 { text-decoration: none; }',
        '.calibre6, .calibre8 { display: inline; }',
        '.calibre10 { display: block; text-align: center; }',
        '.para-p { text-indent: 1.2em; margin: 0; }',
        '.para-pf { margin: 0; }',
        '.char-first { font-size: 1.6em; }',
        '.indent { text-indent: 1.5em; margin: 0; }',
        '.figure_medium, .figure_fullpage, .figure_fullpage1 { text-align: center; margin: 1em 0; }',
        '.toc_chap1 { margin: 0 0 0 1.5em; } .toc_fm1 { margin: 0; }',
        '.right { text-align: right; }',
      ].join('\n'),
    },
    ...images,
    ...docs.map((d) => ({
      path: `text/${d.file}`,
      mediaType: 'application/xhtml+xml',
      content: calibreDoc(d.title, d.bodyTag, d.body),
    })),
  ];
  return epub(
    'calibre-body-anchors.epub',
    {
      version: 3,
      opfDir: '',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:calibre-body-anchors',
      files,
      spine: [{ path: 'titlepage.xhtml' }, ...docs.map((d) => ({ path: `text/${d.file}` }))],
      nav,
      coverImage: 'cover.png',
    },
    0
  );
}

/**
 * An omnibus: three novels in one book, each a contents entry holding its own chapters in files of their own, so each
 * opens into its chapters (`containsChapters`, toc-utils.ts) — the shape one level above a book whose title holds all
 * its chapters.
 *
 * What it exercises:
 * - **Names lent by the novel.** Novel One numbers its chapters "Chapter 01"–"Chapter 12"; Novels Two and Three use
 *   "Chapter 1" on. "Chapter 10"–"12" repeat across novels, so every row is qualified with its novel — Novel One's
 *   unique "Chapter 01"–"09" too, because a parent any of whose children needs its name lends it to all of them.
 *   "Book One: …" dividers and "Epilogue" are structure words and stay bare.
 * - **Nameless continuation files** (the shape of a novel whose chapter files are all unlisted and titled with the
 *   book's name): four unlisted files, each opening "This file continues …", with no name of their own — a
 *   `<title>` that is the book's title, "Continued, Omnibus", or a heading that is the book's title.
 * - **What stays a section of its own:** an unlisted divider with a real heading ("NOTES"), a nameless scrap too short
 *   to be a continuation (it reads "Section N"), unlisted front matter with a heading, and two back files after the
 *   last entry.
 * - **A probe:** an unlisted file whose heading is its chapter's BARE name, "Chapter 11", while the chapter's row is
 *   "Novel Two – Chapter 11". By the code as written it stays a row of its own; whether it should is open.
 * - Two top-level entries that are not novels: Reading Group Notes (two children in two files — it opens) and
 *   Acknowledgments (two children in its own file — it stays one row).
 *
 * **Check:** the contents panel shows the tree with bare labels. Save as Markdown and the Marks PDF picker list the
 * same rows: every novel's chapters as "Novel One – Chapter 01" …, no row for any file that opens "This file
 * continues", and that sentence at the start of the text after the chapter it names. Listen shows a continued chapter
 * as "1 of 2" and "2 of 2".
 */
export function omnibus(): Built {
  const p = proseFrom(1601);
  const TITLE = titleFromFile('omnibus.epub');
  type Doc = {
    title: string;
    body: string;
    cls?: string;
    extra?: string;
    /** The contents label, and the label of the entry it sits under. */
    nav?: string;
    under?: string;
    /** Extra entries pointing INTO this file, by fragment. */
    inner?: { label: string; id: string }[];
  };
  const docs: Doc[] = [];
  let pageNo = 1;
  const pageMark = () => {
    const n = pageNo++;
    return `<span id="page_${n}" title="${n}" class="calibre2"></span>`;
  };
  const t = (label: string) => `${label}, ${TITLE}`;
  /** A chapter with no heading, as such a book sets them; its epigraph says which chapter it is. */
  const chapter = (novel: string, label: string, style: 1 | 2) => {
    const [first, ...rest] = p.paragraphsOf(2000);
    const epigraph = `Epigraph for ${novel}, ${label}.`;
    if (style === 1) {
      return {
        cls: 'calibre',
        body: [
          `<div id="pg${pageNo}" class="block">${pageMark()}<p class="nonindent">${esc(epigraph)}</p><p class="copy1">${esc(p.sentence())}</p></div>`,
          `<p class="nonindent1"><span class="dropcaps">${esc(first.charAt(0))}</span>${esc(first.slice(1))}</p>`,
          ...rest.map((x) => `<p class="indent">${esc(x)}</p>`),
        ].join('\n'),
      };
    }
    return {
      cls: 'calibre3',
      body: [
        '<div class="calibre4">',
        `<p class="x03-chapter-epigraph">${esc(epigraph)}</p>`,
        `<p class="x03-chapter-epigraph-source"><span class="caps">${esc(p.sentence())}</span></p>`,
        `<p class="pcalibre x03-co-body-text">${pageMark()}${esc(first)}</p>`,
        ...rest.map((x) => `<p class="x04-body-text">${esc(x)}</p>`),
        '</div>',
      ].join('\n'),
    };
  };
  const continuation = (what: string, chars = 1200) =>
    [
      `<p class="indent">This file continues ${esc(what)}. Its text belongs at the end of that chapter.</p>`,
      ...p.paragraphsOf(chars).map((x) => `<p class="indent">${esc(x)}</p>`),
    ].join('\n');
  const heading = (label: string, extra = '') =>
    `<h1 class="calibre5">${esc(label)}</h1>\n${extra || `<p class="indent">${esc(p.paragraph())}</p>`}`;
  const novelCover = (image: string) => `<div class="h2"><img src="../images/${image}" alt="" class="calibre6"/></div>`;
  const chapters = (novel: string, labels: string[], style: 1 | 2) =>
    labels.map((label) => ({ ...chapter(novel, label, style), title: t(label), nav: label, under: novel }));
  const pad = (n: number) => String(n).padStart(2, '0');

  docs.push({
    title: t('Title Page'),
    nav: 'Title Page',
    body: heading(TITLE.toUpperCase(), `<p class="indent">${AUTHOR.name}</p>`),
  });
  docs.push({
    title: t('Contents'),
    nav: 'Contents',
    body: heading(
      'Contents',
      ['Novel One', 'Novel Two', 'Novel Three'].map((n) => `<p class="indent">${n}</p>`).join('\n')
    ),
  });
  docs.push({ title: t('Also by the Author'), nav: 'Also by the Author', body: heading('Also by the Author') });
  docs.push({
    title: t('Other Books'),
    body: heading(
      'Other Books',
      p
        .paragraphsOf(300)
        .map((x) => `<p class="indent">${esc(x)}</p>`)
        .join('\n')
    ),
  });

  // Novel One — padded numbers, two Book dividers beside its chapters, two continuations, an unlisted NOTES divider.
  const one = 'Novel One';
  docs.push({ title: t(one), nav: one, extra: 'epub:type="cover"', body: novelCover('novel-one.png') });
  docs.push({ title: t('Title Page'), nav: 'Title Page', under: one, body: heading(one.toUpperCase()) });
  docs.push({
    title: t('Copyright'),
    nav: 'Copyright',
    under: one,
    body: heading('Copyright', `<p class="indent">${esc(p.sentence())}</p>`),
  });
  docs.push({
    title: t('Book One: Beginnings'),
    nav: 'Book One: Beginnings',
    under: one,
    body: '<h1 class="part">Book One</h1>\n<h1 class="part_title">Beginnings</h1>',
  });
  docs.push(
    ...chapters(
      one,
      [1, 2, 3].map((n) => `Chapter ${pad(n)}`),
      1
    )
  );
  docs.push({ title: TITLE, body: continuation(`${one}, Chapter 03`) });
  docs.push(
    ...chapters(
      one,
      [4, 5, 6].map((n) => `Chapter ${pad(n)}`),
      1
    )
  );
  docs.push({
    title: t('Book Two: Crossings'),
    nav: 'Book Two: Crossings',
    under: one,
    body: '<h1 class="part">Book Two</h1>\n<h1 class="part_title">Crossings</h1>',
  });
  docs.push(
    ...chapters(
      one,
      [7, 8, 9].map((n) => `Chapter ${pad(n)}`),
      1
    )
  );
  docs.push({ title: `Continued, ${TITLE}`, body: continuation(`${one}, Chapter 09`) });
  docs.push(
    ...chapters(
      one,
      [10, 11, 12].map((n) => `Chapter ${pad(n)}`),
      1
    )
  );
  docs.push({ title: `Continued, ${TITLE}`, body: '<h1 class="part_title1">NOTES</h1>' });
  docs.push({ title: t('Glossary'), nav: 'Glossary', under: one, body: heading('Glossary') });

  // Novel Two — plain numbers, a continuation headed with the book's title, a short scrap, the probe, an Epilogue.
  const two = 'Novel Two';
  docs.push({ title: t(two), nav: two, extra: 'epub:type="cover"', body: novelCover('novel-two.png') });
  docs.push({ title: t('Title Page'), nav: 'Title Page', under: two, body: heading(two.toUpperCase()) });
  docs.push({ title: t('Contents'), nav: 'Contents', under: two, body: heading('Contents') });
  docs.push(
    ...chapters(
      two,
      [1, 2, 3, 4, 5].map((n) => `Chapter ${n}`),
      2
    )
  );
  docs.push({
    title: TITLE,
    cls: 'calibre3',
    body: `<h1 class="calibre5">${TITLE}</h1>\n${continuation(`${two}, Chapter 5`)}`,
  });
  docs.push(
    ...chapters(
      two,
      [6, 7, 8].map((n) => `Chapter ${n}`),
      2
    )
  );
  docs.push({
    title: TITLE,
    cls: 'calibre3',
    body: '<p class="x04-body-text">A scrap too short to continue anything.</p>',
  });
  docs.push(
    ...chapters(
      two,
      [9, 10, 11].map((n) => `Chapter ${n}`),
      2
    )
  );
  docs.push({
    title: TITLE,
    cls: 'calibre3',
    body: `<h2 class="calibre5">Chapter 11</h2>\n<p class="x04-body-text">This file continues ${two}, Chapter 11, under a heading that is the chapter's bare name — the probe.</p>\n${p
      .paragraphsOf(1200)
      .map((x) => `<p class="x04-body-text">${esc(x)}</p>`)
      .join('\n')}`,
  });
  docs.push(
    ...chapters(
      two,
      [12, 13, 14].map((n) => `Chapter ${n}`),
      2
    )
  );
  docs.push({ ...chapter(two, 'Epilogue', 2), title: t('Epilogue'), nav: 'Epilogue', under: two });

  // Novel Three — a continuation just before the last listed file of the novel.
  const three = 'Novel Three';
  docs.push({ title: t(three), nav: three, extra: 'epub:type="cover"', body: novelCover('novel-three.png') });
  docs.push({ title: t('Title Page'), nav: 'Title Page', under: three, body: heading(three.toUpperCase()) });
  docs.push({ title: t('Introduction'), nav: 'Introduction', under: three, body: heading('Introduction') });
  docs.push(
    ...chapters(
      three,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `Chapter ${n}`),
      2
    )
  );
  docs.push({ title: TITLE, cls: 'calibre3', body: continuation(`${three}, Chapter 10`) });
  docs.push({ title: t('About the Author'), nav: 'About the Author', under: three, body: heading('About the Author') });

  // Two top-level entries that are not novels, then the back files after the last entry.
  docs.push({ title: t('Reading Group Notes'), nav: 'Reading Group Notes', body: heading('Reading Group Notes') });
  docs.push({ title: t('Questions'), nav: 'Questions', under: 'Reading Group Notes', body: heading('Questions') });
  docs.push({
    title: t('Further Reading'),
    nav: 'Further Reading',
    under: 'Reading Group Notes',
    body: heading('Further Reading'),
  });
  docs.push({
    title: t('Acknowledgments'),
    nav: 'Acknowledgments',
    body: `<h1 class="calibre5">Acknowledgments</h1>\n<h2 id="ack-1" class="calibre5">To the Readers</h2>\n<p class="indent">${esc(p.paragraph())}</p>\n<h2 id="ack-2" class="calibre5">To the Printers</h2>\n<p class="indent">${esc(p.paragraph())}</p>`,
    inner: [
      { label: 'To the Readers', id: 'ack-1' },
      { label: 'To the Printers', id: 'ack-2' },
    ],
  });
  docs.push({ title: 'Discover more', body: heading('Discover More') });
  docs.push({
    title: `Continued, ${TITLE}`,
    body: p
      .paragraphsOf(300)
      .map((x) => `<p class="indent">${esc(x)}</p>`)
      .join('\n'),
  });

  const file = (i: number) => `text/part${String(i).padStart(4, '0')}.html`;
  const nav: NavEntry[] = [];
  const byLabel = new Map<string, NavEntry>();
  docs.forEach((d, i) => {
    if (!d.nav) return;
    const entry: NavEntry = { label: d.nav, href: `${file(i)}#p${i}` };
    if (d.inner) entry.children = d.inner.map((c) => ({ label: c.label, href: `${file(i)}#${c.id}` }));
    const parent = d.under ? byLabel.get(d.under) : undefined;
    if (parent) (parent.children ??= []).push(entry);
    else {
      nav.push(entry);
      byLabel.set(d.nav, entry);
    }
  });
  const files: EpubFile[] = [
    { path: 'cover.png', mediaType: 'image/png', content: cover(1, TITLE, ['EPUB']) },
    ...[
      ['novel-one.png', one],
      ['novel-two.png', two],
      ['novel-three.png', three],
    ].map(([name, label]) => ({ path: `images/${name}`, mediaType: 'image/png', content: wordImage(label, 400, 600) })),
    {
      path: 'titlepage.xhtml',
      mediaType: 'application/xhtml+xml',
      content: xhtml('Cover', '<div><img src="cover.png" alt=""/></div>', ''),
    },
    {
      path: 'stylesheet.css',
      mediaType: 'text/css',
      content: [
        '.calibre, .calibre3 { display: block; margin: 0 5pt; }',
        '.calibre2 { display: inline; }',
        '.indent, .x04-body-text { text-indent: 1.2em; margin: 0; }',
        '.nonindent, .nonindent1, .pcalibre { margin: 0; }',
        '.block, .x03-chapter-epigraph { font-style: italic; margin: 1em 2em; }',
        '.dropcaps { font-size: 2em; }',
        '.part, .part_title, .part_title1 { text-align: center; }',
      ].join('\n'),
    },
    ...docs.map((d, i) => ({
      path: file(i),
      mediaType: 'application/xhtml+xml',
      content: calibreDoc(
        d.title,
        `<body id="p${i}"${d.extra ? ` ${d.extra}` : ''} class="${d.cls ?? 'calibre'}">`,
        d.body
      ),
    })),
  ];
  return epub(
    'omnibus.epub',
    {
      version: 3,
      opfDir: '',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:omnibus',
      files,
      spine: [{ path: 'titlepage.xhtml' }, ...docs.map((_, i) => ({ path: file(i) }))],
      nav,
      coverImage: 'cover.png',
    },
    1
  );
}

/**
 * A book laid out the way Project Gutenberg's Ebookmaker writes one — the layout of most public-domain EPUBs. Its
 * boilerplate names a placeholder publisher instead: no code matches Gutenberg's own words, only the shapes below.
 *
 * - `wrap0000.xhtml`: the cover as an `<svg><image xlink:href>`, titled `"Cover"` with the quotes, unlisted. Named
 *   "Cover" in the exports, never "wrap0000" (`headingOf`, book-extractor.ts; the svg walk in book-blocks.ts).
 * - `…-h-0.htm.xhtml` opens with the header (`<header id="pg-header">`, an `h2` naming the book) ABOVE the first
 *   contents anchor, then the title page: the header becomes a piece of its own, named by its heading.
 * - Every text file is titled `Gutenberg Style | Placeholder Press` — a `<title>` beginning with the book's title,
 *   which is refused as a name.
 * - Contents ids sit on `<div class="chapter" id="pgepubid…">`, not on the heading, and two chapters share a file: the
 *   id goes to the first block inside its container (book-blocks.ts).
 * - `PART I` alone in a file with the repeated title heading; `PART II` in the same file as its first chapter, where it
 *   folds into it (`mergeStubs`); `CHAPTER I`–`III` repeating in both parts, so rows read `PART II – CHAPTER I`.
 * - CHAPTER III's heading ends one file and over 2,000 characters of its prose open the next, above that file's first
 *   anchor — Listen shows it as "1 of 2" and "2 of 2" (`splitLeadIns`).
 * - An unlisted, heading-less file after CHAPTER I, opening "This file continues CHAPTER I": no row of its own.
 * - `EPILOGUE` with `I` and `II` in one file: one row. `.figcenter` and `.figleft` images; a linked full-size plate on
 *   its own unlisted page after the license.
 * - READINGS, in the order a book of daily readings uses: each Day's heading comes BEFORE the running title it hangs
 *   under in the contents, with a `[pN]` page marker and a "Contents" back-link inside the heading.
 * - The license in a file of its own at the end, with text above its anchor.
 *
 * **Check:** Save as Markdown — rows as above, the cover note embeds the cover, nothing is called wrap0000 or
 * `…-h-0.htm`; the "This file continues" text inside CHAPTER I. Save as PDF — the figcenter image centered, the figleft
 * one flush left. Listen — CHAPTER III in two parts, PART II and its CHAPTER I one row.
 */
export function gutenbergStyle(): Built {
  const p = proseFrom(1701);
  const TITLE = titleFromFile('gutenberg-style.epub');
  const PRESS = 'Placeholder Press';
  const P = '4242424242424242424_90001';
  const text = (n: number) => `${P}-h-${n}.htm.xhtml`;
  const head =
    '<link href="0.css" rel="stylesheet" type="text/css"/>\n<link href="1.css" rel="stylesheet" type="text/css"/>\n<link href="pgepub.css" rel="stylesheet" type="text/css"/>\n<meta name="generator" content="Ebookmaker 0.14.0 by Placeholder Press"/>';
  const doc = (body: string, title = `${TITLE} | ${PRESS}`) =>
    xhtml(title, body, head).replace('<body>', '<body class="x-ebookmaker x-ebookmaker-3">');
  const paras = (chars: number) => ps(p.paragraphsOf(chars));
  const chapterDiv = (id: string, anchor: string, heading: string, body: string) =>
    `<div class="chapter" id="${id}">\n<h2><a id="${anchor}"></a>${esc(heading)}</h2>\n${body}\n</div>`;

  const header = [
    '<header class="pg-boilerplate pgheader" id="pg-header" lang="en">',
    `<h2 id="pg-header-heading" title="">The ${PRESS} eBook of <span lang="en" id="pg-title-no-subtitle">${TITLE}</span></h2>`,
    `<div>This placeholder notice stands where a free-ebook header explains how the book may be used. It keeps the shape of one — a paragraph with a <a class="reference external" href="https://example.org">link</a> — and says nothing else. ${esc(p.paragraph(4))}</div>`,
    '<div class="container" id="pg-machine-header">',
    `<p><strong>Title</strong>: ${TITLE}</p>`,
    `<div id="pg-header-authlist"><p><strong>Author</strong>: ${AUTHOR.name}</p></div><br/>`,
    '<p><strong>Release date</strong>: April 2, 2026 [eBook #90001]<br/>Most recently updated: April 2, 2026</p>',
    '<p><strong>Language</strong>: English</p>',
    '<p><strong>Original publication</strong>: <a href="https://example.org/ebooks/90001">example.org</a></p>',
    '<p><strong>Credits</strong>: Produced for the Orbis Reader fixtures</p>',
    '</div><div id="pg-start-separator"><span>*** START OF THE PLACEHOLDER EBOOK GUTENBERG STYLE ***</span></div>',
    '</header><div></div>',
  ].join('\n');

  const listed: { label: string; href: string; children?: { label: string; href: string }[] }[] = [];
  const files: { name: string; body: string; id?: string; title?: string }[] = [];
  // 0 — header, a centered plate linked to its full-size page, the title page, an in-book contents list.
  files.push({
    name: text(0),
    id: 'pg-header',
    body: [
      header,
      `<div class="figcenter"><a href="${P}-plate1big.png.id-1.wrap-0.html.xhtml" id="id-1" title="linked image"><img alt="" src="images/${P}-plate1.png"/></a></div>`,
      `<h1 id="pgepubid00000">${TITLE.toUpperCase()}</h1>`,
      `<h3 id="pgepubid00001">By ${AUTHOR.name}</h3>`,
      '<p>CONTENTS</p>',
      ...[
        ['PREFACE', 1, 'link2H_PREF'],
        ['PART I', 2, 'link2H_PART1'],
        ['CHAPTER I', 3, 'link2HCH0001'],
        ['CHAPTER II', 5, 'link2HCH0002'],
        ['CHAPTER III', 5, 'link2HCH0003'],
        ['PART II', 6, 'link2H_PART2'],
        ['EPILOGUE', 7, 'link2H_EPIL'],
        ['READINGS', 8, 'link2H_READ'],
      ].map(([label, n, a]) => `<p><a class="pginternal" href="${text(n as number)}#${a}">${label}</a></p>`),
    ].join('\n'),
  });
  listed.push(
    { label: TITLE.toUpperCase(), href: `${text(0)}#pgepubid00000` },
    { label: `By ${AUTHOR.name}`, href: `${text(0)}#pgepubid00001` }
  );
  // 1 — the preface.
  files.push({ name: text(1), body: chapterDiv('pgepubid00002', 'link2H_PREF', 'PREFACE', paras(1500)) });
  listed.push({ label: 'PREFACE', href: `${text(1)}#pgepubid00002` });
  // 2 — the title again and PART I: headings and nothing else.
  files.push({
    name: text(2),
    body: `<div class="chapter" id="pgepubid00003"><h2>${TITLE.toUpperCase()}</h2></div>\n<div class="chapter" id="pgepubid00004"><h2><a id="link2H_PART1"></a>PART I</h2></div>`,
  });
  listed.push(
    { label: TITLE.toUpperCase(), href: `${text(2)}#pgepubid00003` },
    { label: 'PART I', href: `${text(2)}#pgepubid00004` }
  );
  // 3 — CHAPTER I, with a floated plate, a poem and an unindented paragraph.
  files.push({
    name: text(3),
    body: chapterDiv(
      'pgepubid00005',
      'link2HCH0001',
      'CHAPTER I',
      [
        paras(1500),
        `<div class="figleft"><img alt="" src="images/${P}-plate2.png"/></div>`,
        paras(1200),
        `<p class="poem">${Array.from({ length: 4 }, () => esc(p.sentence())).join('<br/>\n')}</p>`,
        `<p class="noindent">${esc(p.paragraph())}</p>`,
      ].join('\n')
    ),
  });
  listed.push({ label: 'CHAPTER I', href: `${text(3)}#pgepubid00005` });
  // 4 — unlisted, no heading: CHAPTER I continuing, split for size.
  files.push({
    name: text(4),
    body: `<p>This file continues CHAPTER I: no heading, no contents entry, and a title that only names the book.</p>\n${paras(1500)}`,
  });
  // 5 — CHAPTER II, then CHAPTER III's heading alone at the end of the file.
  files.push({
    name: text(5),
    body: `${chapterDiv('pgepubid00006', 'link2HCH0002', 'CHAPTER II', paras(2500))}\n<div class="chapter" id="pgepubid00007"><h2><a id="link2HCH0003"></a>CHAPTER III</h2></div>`,
  });
  listed.push(
    { label: 'CHAPTER II', href: `${text(5)}#pgepubid00006` },
    { label: 'CHAPTER III', href: `${text(5)}#pgepubid00007` }
  );
  // 6 — CHAPTER III's prose above the first anchor, then PART II and its CHAPTER I in one file.
  files.push({
    name: text(6),
    body: [
      '<p>This is CHAPTER III, whose heading ended the previous file. Its text opens this one, above the first anchor.</p>',
      paras(3200),
      '<div class="chapter" id="pgepubid00008"><h2><a id="link2H_PART2"></a>PART II</h2></div>',
      chapterDiv('pgepubid00009', 'link2HCH0004', 'CHAPTER I', paras(2500)),
    ].join('\n'),
  });
  listed.push(
    { label: 'PART II', href: `${text(6)}#pgepubid00008` },
    { label: 'CHAPTER I', href: `${text(6)}#pgepubid00009` }
  );
  // 7 — CHAPTER II of PART II, then the EPILOGUE and its two sections in one file.
  files.push({
    name: text(7),
    body: [
      chapterDiv('pgepubid00010', 'link2HCH0005', 'CHAPTER II', paras(2500)),
      '<div class="chapter" id="pgepubid00011">',
      '<h2><a id="link2H_EPIL"></a>EPILOGUE</h2>',
      `<h3 id="pgepubid00012">I</h3>\n${paras(1500)}`,
      `<h3 id="pgepubid00013">II</h3>\n${paras(1500)}`,
      '</div>',
    ].join('\n'),
  });
  listed.push({
    label: 'EPILOGUE',
    href: `${text(7)}#pgepubid00011`,
    children: [
      { label: 'I', href: `${text(7)}#pgepubid00012` },
      { label: 'II', href: `${text(7)}#pgepubid00013` },
    ],
  });
  // 8 — daily readings: each Day's heading BEFORE the running title it hangs under in the contents.
  const DAYS = ['First', 'Second', 'Third'];
  const pageMark = (n: number) =>
    `<a id="png.0${n}"></a><span class="ns">[p</span><span class="pgmark">${n}</span><span class="ns">]<br/></span>`;
  const readings = ['<div class="main" id="pgepubid00014">', '<h2 class="chap"><a id="link2H_READ"></a>READINGS.</h2>'];
  DAYS.forEach((day, i) => {
    const page = 11 + i * 6;
    readings.push(
      `<h3 class="chap" id="d${i + 1}">${pageMark(page)}${day} Day. <small class="toclink"><a href="${text(0)}#pgepubid00000" class="pginternal">Contents</a></small></h3>`,
      `<h2 class="chap" id="t${i + 1}">${TITLE.toUpperCase()}.<br/><img alt="" src="images/${P}-plate2.png"/></h2>`,
      paras(1800)
    );
  });
  readings.push('</div>');
  files.push({ name: text(8), body: readings.join('\n') });
  const dayLabel = (i: number) => `[p${11 + i * 6}] ${DAYS[i]} Day. Contents`;
  listed.push({
    label: 'READINGS.',
    href: `${text(8)}#pgepubid00014`,
    children: [{ label: dayLabel(0), href: `${text(8)}#d1` }],
  });
  DAYS.forEach((_, i) => {
    listed.push({
      label: `${TITLE.toUpperCase()}.`,
      href: `${text(8)}#t${i + 1}`,
      ...(i + 1 < DAYS.length ? { children: [{ label: dayLabel(i + 1), href: `${text(8)}#d${i + 2}` }] } : {}),
    });
  });
  // 9 — the license, with text above its heading's anchor.
  const lp = proseFrom(1702);
  const licence = [
    '<footer class="pg-boilerplate pgheader" id="pg-footer" lang="en">',
    '<div id="pg-end-separator"><span>*** END OF THE PLACEHOLDER EBOOK GUTENBERG STYLE ***</span></div>',
    `<div>${esc(lp.paragraph(6))}</div>`,
    `<div>${esc(lp.paragraph(6))}</div>`,
    `<div id="project-gutenberg-license">START: FULL LICENSE</div>`,
    `<h2 id="pg-footer-heading">THE FULL ${PRESS.toUpperCase()} LICENSE</h2>`,
    '<div class="agate">PLEASE READ THIS BEFORE YOU DISTRIBUTE OR USE THIS WORK</div>',
    ...Array.from({ length: 30 }, (_, i) =>
      i % 7 === 0
        ? `<div class="secthead">Section ${i / 7 + 1}. ${esc(lp.sentence())}</div>`
        : `<div>${esc(lp.paragraph(5))}</div>`
    ),
    `<blockquote><div>${esc(lp.paragraph(3))}</div></blockquote>`,
    `<ul>\n${Array.from({ length: 4 }, () => `<li>${esc(lp.sentence())}</li>`).join('\n')}\n</ul>`,
    '</footer>',
  ].join('\n');
  files.push({ name: text(9), id: 'pg-footer', body: licence });
  listed.push({ label: `THE FULL ${PRESS.toUpperCase()} LICENSE`, href: `${text(9)}#pg-footer-heading` });
  // 10 — the full-size plate, on a page of its own after the license, linking back.
  files.push({
    name: `${P}-plate1big.png.id-1.wrap-0.html.xhtml`,
    title: '"linked image"',
    body: `<div style="text-align: center"><img class="x-ebookmaker-wrapper" alt="" src="images/${P}-plate1big.png"/><br/><a href="${text(0)}#id-1" title="back">back</a></div>`,
  });

  const coverPage = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
<meta charset="utf-8"/>
<title>"Cover"</title>
<link href="pgepub.css" rel="stylesheet" type="text/css"/>
</head>
<body class="x-ebookmaker-coverpage"><div class="x-ebookmaker-cover"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 600" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"><image width="400" height="600" xlink:href="images/${P}-cover.png"/></svg></div></body>
</html>
`;
  const epubFiles: EpubFile[] = [
    { path: `images/${P}-cover.png`, mediaType: 'image/png', content: cover(2, TITLE, ['EPUB']) },
    { path: `images/${P}-plate1.png`, mediaType: 'image/png', content: wordImage('Plate 1', 300, 200) },
    { path: `images/${P}-plate1big.png`, mediaType: 'image/png', content: wordImage('Plate 1', 600, 400) },
    { path: `images/${P}-plate2.png`, mediaType: 'image/png', content: wordImage('Plate 2', 160, 220) },
    {
      path: 'wrap0000.xhtml',
      id: 'coverpage-wrapper',
      mediaType: 'application/xhtml+xml',
      properties: 'svg',
      content: coverPage,
    },
    {
      path: 'pgepub.css',
      mediaType: 'text/css',
      content:
        'section.pgheader, header.pgheader { margin: 2em 0; }\n.x-ebookmaker-cover { height: 100%; text-align: center; }\nh2 { page-break-before: always; }\ndiv.figcenter span.caption { display: block; }\n',
    },
    {
      path: '0.css',
      mediaType: 'text/css',
      content:
        '#pg-header div, #pg-footer div { margin: 0.5em 0; }\n#pg-machine-header p { text-indent: 0; }\n.xhtml_center { text-align: center; }\n',
    },
    {
      path: '1.css',
      mediaType: 'text/css',
      content:
        'div.chapter { page-break-before: always; margin-top: 4em; }\n.figcenter { margin: auto; text-align: center; }\n.figleft { float: left; clear: left; margin: 0.5em 1em 0.5em 0; text-align: center; }\np.poem { margin-left: 2em; text-indent: 0; }\np.noindent { text-indent: 0; }\n.ns { display: none; }\n',
    },
    ...files.map((f) => ({
      path: f.name,
      mediaType: 'application/xhtml+xml',
      ...(f.id ? { id: f.id } : {}),
      content: doc(f.body, f.title),
    })),
  ];
  return epub(
    'gutenberg-style.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:gutenberg-style',
      publisher: PRESS,
      files: epubFiles,
      spine: [{ path: 'wrap0000.xhtml' }, ...files.map((f) => ({ path: f.name }))],
      nav: listed,
      coverImage: `images/${P}-cover.png`,
    },
    2
  );
}

/**
 * A technical book, laid out the way a large programming book converted by Calibre is: every paragraph a `<div>`, code
 * one `<div class="para2">` per line, figures and tables captioned in divs, notes in gray boxes, and a printed contents
 * page linking chapters, sections and headings. There is one real `<pre>` block too, to compare against.
 *
 * - Each chapter is a listed title page (a copyright line, under 250 characters) and an unlisted opener repeating the
 *   chapter's name: the opener is the chapter continuing, and its repeated heading is dropped.
 * - Chapters 1–4 end in an unlisted "Summary" section, and two chapters have one called "Troubleshooting": repeated
 *   names get the contents entry before them — "1. First Steps – Summary" (`qualifyRepeatedNames`).
 * - "Secure Relay" is an h4 inside "The Transports" and, later in the same chapter, a section of its own: in a single
 *   note the chapter heading collides with the book's heading (`singleNoteChapterHeadings`).
 * - "Hooks" is an h3 in chapter 2, an h3 in chapter 3 and an h4 under that one; the printed contents links all three.
 * - Tag-like text — `<script type="text/javascript">`, `<div id="footer">`, `a < b` — printed in code lines and inline
 *   code, which must come out as text (turndown-rules.ts), with every heading after it still there.
 * - Links: to other chapters' title pages, to sections' wrappers, to headings, to a figure and a table by id (which
 *   become text), and to the web, inside a note box.
 * - A 120-character unbroken path, which the PDF must break rather than run off the page.
 *
 * **Check:** Save as Markdown — the rows above; one note per chapter holds the copyright line then the opener's text
 * with no second heading; the printed contents' links open their targets; the tag-like lines read literally and the
 * Outline pane still lists the headings after them. Save as PDF — div paragraphs are paragraphs, the table is ruled,
 * the `<pre>` block keeps its indentation, the long path wraps. In Markdown, Table 2-1 is a table under its own header
 * row, and the code lines are paragraphs with their columns collapsed (book-export.md). The caption
 * and list numbers in the PDF are where the research expects losses — note what they do.
 */
export function technicalBook(): Built {
  const p = proseFrom(1801);
  const TITLE = titleFromFile('technical-book.epub');
  const LINK = 'calibre3 pcalibre2 pcalibre pcalibre1';
  let par = 1;
  let sec = 1;
  let hid = 1;
  const div = (text: string, cls = 'simplepara') => `<div id="Par${par++}" class="${cls}">${text}</div>`;
  const prose = (chars: number, cls = 'simplepara') =>
    p
      .paragraphsOf(chars)
      .map((t) => div(esc(t), cls))
      .join('\n');
  const code = (t: string) => `<span class="emphasisfontcategorynonproportional">${t}</span>`;
  const codeLines = (lines: string[]) =>
    lines
      .map(
        (l) =>
          `<div id="Par${par++}" class="para2">\n  <span class="emphasisfontcategorynonproportional1">${l}</span>\n  </div>`
      )
      .join('\n');
  const link = (href: string, label: string) => `<span><a href="${href}" class="${LINK}">${label}</a></span>`;
  /** Where each linkable thing landed, for the printed contents and the cross-references. */
  const at = new Map<string, string>();

  type Section = { name: string; body: () => string };
  const CHAPTERS: { name: string; sections: Section[]; summary: boolean }[] = [
    {
      name: 'First Steps',
      summary: true,
      sections: [
        {
          name: 'Why Channels',
          body: () =>
            [
              prose(500, 'bookfrontmatter'),
              `<div id="Par${par++}" class="simplepara">${esc(p.sentence())} The layout is shown below.<div class="figure" id="Fig1"><div class="bookfrontmatter" id="MO1"><img src="../images/00001.png" alt="Fig1_HTML.png" class="calibre6"/></div><div class="caption"><div class="captioncontent"><span class="captionnumber">Figure 1-1.</span><div class="simplepara1">${esc(p.sentence())}</div></div></div></div></div>`,
              div(`As ${link('#Fig1', 'Figure 1-1')} shows, ${esc(p.sentence().toLowerCase())}`),
              `<div id="FPar1" class="formalpara"><div class="heading3">Note</div>${div(`${esc(p.sentence())} See ${link('https://example.com/docs', code('https://example.com/docs'))}, ${link('http://example.org/legacy', 'the older notes')} or ${link('mailto:help@example.com', 'write to us')}.`, 'bookfrontmatter')}</div>`,
              `<ul class="unorderedlistmarkbullet">${Array.from({ length: 3 }, () => `<li class="calibre7">${div(esc(p.sentence()), 'para1')}</li>`).join('')}</ul>`,
              prose(600),
            ].join('\n'),
        },
        {
          name: 'Installing',
          body: () =>
            [
              prose(400, 'bookfrontmatter'),
              `<div class="orderedlist">${[1, 2, 3].map((n) => `<div class="listitem"><span class="affiliationnumber">${n}.</span><div class="itemcontent">${div(esc(p.sentence()), 'bookfrontmatter')}</div></div>`).join('')}<div class="clearboth"></div></div>`,
              codeLines(['$ channel install --global', '$ channel --version', 'channel 2.4.1']),
              prose(500),
            ].join('\n'),
        },
      ],
    },
    {
      name: 'Core Concepts',
      summary: true,
      sections: [
        {
          name: 'Records and Fields',
          body: () =>
            [
              prose(500, 'bookfrontmatter'),
              `<div id="Sec${sec++}" class="bookfrontmatter"><h3 class="heading2" id="${(at.set('hooks-1', `h${hid}`), `h${hid++}`)}">Hooks</h3>\n${prose(400)}</div>`,
              `<div id="Par${par++}" class="simplepara">${esc(p.sentence())} The fields are listed in ${link('#Tab1', 'Table 2-1')}.<div class="table" id="Tab1"><div class="caption1"><div class="captioncontent"><span class="captionnumber">Table 2-1.</span><div class="simplepara1">Record fields</div></div></div><table border="1" class="calibre8"><colgroup class="calibre9"><col class="calibre10"/><col class="calibre10"/></colgroup><thead class="calibre11"><tr class="header"><th class="calibre12"><div class="simplepara2">Field</div></th><th class="calibre12"><div class="simplepara2">Meaning</div></th></tr></thead><tbody class="calibre13">${['name', 'owner', 'created'].map((f) => `<tr class="header"><td class="calibre14"><div class="simplepara3">${code(f)}</div></td><td class="calibre14"><div class="simplepara3">${esc(p.sentence())}</div></td></tr>`).join('')}</tbody></table></div></div>`,
              prose(500),
            ].join('\n'),
        },
        { name: 'Troubleshooting', body: () => prose(900) },
      ],
    },
    {
      name: 'Working with Services',
      summary: true,
      sections: [
        {
          name: 'Scripting the Service',
          body: () =>
            [
              prose(400, 'bookfrontmatter'),
              `<div id="Sec${sec++}" class="bookfrontmatter"><h3 class="heading2" id="${(at.set('hooks-2', `h${hid}`), `h${hid++}`)}">Hooks</h3>\n${prose(400)}`,
              `<div id="Sec${sec++}" class="bookfrontmatter"><h4 class="heading4" id="${(at.set('hooks-3', `h${hid}`), `h${hid++}`)}">Hooks</h4>\n${prose(400)}</div></div>`,
            ].join('\n'),
        },
        {
          name: 'Interactive Editing',
          body: () =>
            [
              prose(400, 'bookfrontmatter'),
              div(
                `A change to a web page, as the tool shows it — the ${code('&lt;script&gt;')} line is the one being added, and ${code('a &lt; b')} holds throughout:`
              ),
              codeLines([
                '@@ -12,7 +12,9 @@',
                '&lt;script type="text/javascript"&gt;',
                '-&lt;div id="footer"&gt;contact us&lt;/div&gt;',
                '+&lt;div id="footer"&gt;write to us&lt;/div&gt;',
                'name      owner     created',
                'north     mara      2026-01-04',
              ]),
              `<div id="Sec${sec++}" class="bookfrontmatter"><h3 class="heading2" id="h${hid++}">After the Change</h3>\n${div(`${esc(p.sentence())} Chapter 5 covers ${link('part0005_split_000.html#ch5-ctx', 'the plumbing')}.`)}</div>`,
              prose(400),
            ].join('\n'),
        },
      ],
    },
    {
      name: 'Running a Server',
      summary: true,
      sections: [
        {
          name: 'The Transports',
          body: () =>
            [
              prose(400, 'bookfrontmatter'),
              `<div id="Sec${sec++}" class="bookfrontmatter"><h3 class="heading2" id="h${hid++}">Local and Remote</h3>\n${prose(300)}`,
              `<div id="Sec${sec++}" class="bookfrontmatter"><h4 class="heading4" id="h${hid++}">Secure Relay</h4>\n${prose(400)}</div></div>`,
            ].join('\n'),
        },
        {
          name: 'Secure Relay',
          body: () =>
            [
              prose(400, 'bookfrontmatter'),
              `<div id="Sec${sec++}" class="bookfrontmatter"><h3 class="heading2" id="${(at.set('relay-h3', `h${hid}`), `h${hid++}`)}">Setting Up the Relay</h3>\n${prose(400)}</div>`,
            ].join('\n'),
        },
      ],
    },
    {
      name: 'Advanced Topics',
      summary: false,
      sections: [
        {
          name: 'Plumbing',
          body: () =>
            [
              prose(400, 'bookfrontmatter'),
              `<pre><code>channel plumb --dry-run\n    --from north\n    --to   south\n        # indented twice, and aligned</code></pre>`,
              div(
                `An element such as ${code('&lt;tag&gt;')} is written literally. The configuration lives at ${code('/srv/channel/configuration/services/north-relay/transports/secure/certificates/current/fullchain-and-private-key.pem')}.`
              ),
              div(`The layout is the one in ${link('part0001_split_002.html#Fig1', 'Figure 1-1')}.`),
              prose(500),
            ].join('\n'),
        },
        { name: 'Troubleshooting', body: () => prose(900) },
      ],
    },
  ];

  const docs: { file: string; title: string; body: string; bodyId?: string }[] = [];
  const nav: NavEntry[] = [];
  const sectionDoc = (name: string, inner: string) => {
    const id = `Sec${sec++}`;
    const h = `h${hid++}`;
    return {
      id,
      h,
      body: `<div class="bookfrontmatter">\n<div id="${id}" class="section"><h2 class="heading1" id="${h}">${esc(name)}</h2>\n${inner}\n</div>\n</div>`,
    };
  };
  // Front matter: a listed half-title, then three unlisted files titled with the book's name, one of them the
  // printed contents (filled in once every target has its place).
  docs.push({
    file: 'part0000_split_000.html',
    title: TITLE,
    bodyId: 'fm-body',
    body: `<div class="booktitlepage">${div(TITLE)}${div(AUTHOR.name)}</div>`,
  });
  docs.push({
    file: 'part0000_split_001.html',
    title: TITLE,
    body: `<div class="copyrightpage">${div(`© 2026 ${AUTHOR.name}`)}${prose(400)}</div>`,
  });
  docs.push({
    file: 'part0000_split_002.html',
    title: TITLE,
    body: `<div class="prefacetitle">Preface</div>\n${prose(900)}`,
  });
  const contentsDoc = { file: 'part0000_split_003.html', title: TITLE, body: '' };
  docs.push(contentsDoc);
  nav.push({ label: 'Frontmatter', href: 'text/part0000_split_000.html#fm-body' });
  const tocEntries: string[] = [];
  CHAPTERS.forEach((ch, c) => {
    const n = c + 1;
    const stem = `part000${n}`;
    const label = `${n}. ${ch.name}`;
    docs.push({
      file: `${stem}_split_000.html`,
      title: ch.name,
      body: `<div class="chaptercontextinformation" id="ch${n}-ctx"><div class="contextinformation" id="Chap${n}"><div class="chaptercopyright">© ${AUTHOR.name} 2026</div><span class="contextinformationauthoreditornames">${AUTHOR.name}</span></div></div>`,
    });
    nav.push({ label, href: `text/${stem}_split_000.html` });
    tocEntries.push(
      `<div class="tocentry"><span class="emphasistypebold"><span><a href="${stem}_split_000.html#ch${n}-ctx" class="${LINK}"><span>${esc(label)}</span></a></span></span><span class="tocpagenumber">${n * 20}</span></div>`
    );
    docs.push({
      file: `${stem}_split_001.html`,
      title: ch.name,
      body: `<div class="maintitlesection"><h1 class="chaptertitle" id="calibre_pb_${n}">${n}.&#160;${esc(ch.name)}</h1></div>\n<div class="authornames">${AUTHOR.name}</div>\n${prose(450, 'bookfrontmatter')}`,
    });
    let split = 2;
    const sections = ch.summary ? [...ch.sections, { name: 'Summary', body: () => prose(300) }] : ch.sections;
    for (const s of sections) {
      const file = `${stem}_split_${String(split++).padStart(3, '0')}.html`;
      const d = sectionDoc(s.name, s.body());
      docs.push({ file, title: ch.name, body: d.body });
      tocEntries.push(
        `<div class="tocsection"><div class="tocentry"><span><a href="${file}#${d.id}" class="${LINK}"><span>${esc(s.name)}</span></a></span><span class="tocpagenumber">${n * 20 + split}</span></div></div>`
      );
      for (const [key, h] of at)
        if (!at.has(`${key}@`) && d.body.includes(`id="${h}"`)) at.set(`${key}@`, `${file}#${h}`);
    }
  });
  docs.push({
    file: 'part0006.html',
    title: TITLE,
    body: `<div class="index"><div class="headings1"><div class="heading">Index</div></div><div class="headings2"><div class="heading7">A</div></div>${['access', 'addresses', 'aliases'].map((w) => `<div class="secondaryie">${w}, ${link('part0001_split_002.html#Sec1', '4')}</div>`).join('')}</div>`,
  });
  nav.push({ label: 'Backmatter', href: 'text/part0006.html' });
  // The printed contents, with the three "Hooks" headings and the relay's h3 among its entries.
  const headingLinks = [
    ['Hooks', 'hooks-1'],
    ['Hooks', 'hooks-2'],
    ['Hooks', 'hooks-3'],
    ['Setting Up the Relay', 'relay-h3'],
  ].map(
    ([label, key]) =>
      `<div class="tocsection"><div class="tocentry"><span><a href="${at.get(`${key}@`) ?? ''}" class="${LINK}"><span>${label}</span></a></span></div></div>`
  );
  contentsDoc.body = `<div class="toc" id="Toc"><div class="headings"><div class="heading">Contents</div></div>\n${[...tocEntries, ...headingLinks].join('\n')}\n</div>`;

  const files: EpubFile[] = [
    { path: 'cover.png', mediaType: 'image/png', content: cover(3, TITLE, ['EPUB']) },
    { path: 'images/00001.png', mediaType: 'image/png', content: wordImage('Figure 1-1', 480, 280) },
    {
      path: 'titlepage.xhtml',
      mediaType: 'application/xhtml+xml',
      properties: 'svg',
      content: xhtml(
        'Cover',
        '<div><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100%" height="100%" viewBox="0 0 400 600" preserveAspectRatio="none"><image width="400" height="600" xlink:href="cover.png"/></svg></div>',
        '<meta name="calibre:cover" content="true"/>'
      ),
    },
    {
      path: 'stylesheet.css',
      mediaType: 'text/css',
      content: [
        '.calibre { display: block; }',
        '.para2 { white-space: pre-wrap; margin: 0; }',
        '.simplepara { text-indent: 1.5em; }',
        '.formalpara { background: #bbb; border: 2px solid; padding: 0.5em; }',
        '.tocpagenumber { display: none; }',
        '.section { border-top: groove; }',
        '.figure { text-align: center; }',
      ].join('\n'),
    },
    { path: 'page_styles.css', mediaType: 'text/css', content: '@page { margin: 5pt; }\n' },
    ...docs.map((d) => ({
      path: `text/${d.file}`,
      mediaType: 'application/xhtml+xml',
      content: calibreDoc(
        d.title,
        `<body${d.bodyId ? ` id="${d.bodyId}"` : ''} class="calibre">`,
        d.body,
        `${CALIBRE_HEAD}\n<link rel="stylesheet" type="text/css" href="../page_styles.css"/>`
      ),
    })),
  ];
  return epub(
    'technical-book.epub',
    {
      version: 3,
      opfDir: '',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:technical-book',
      files,
      spine: [{ path: 'titlepage.xhtml' }, ...docs.map((d) => ({ path: `text/${d.file}` }))],
      nav,
      coverImage: 'cover.png',
    },
    3
  );
}

/**
 * Endnotes: every chapter's notes in a Notes chapter at the back, divided by chapter with `<p class="h2b">` — not a
 * heading — and each note one paragraph whose number links back to its reference. The shape of a Calibre-made
 * biography. Each note's text says which case it is.
 *
 * - References in `<sup>`, one bare `<a>` with no `<sup>`, two in one paragraph, one on the chapter's title line, one
 *   in a list item and one in a table cell; numbering restarts in every chapter, and one note is cited twice.
 * - Note 1-5 runs to a second paragraph of the same class, which joins it; note 2-2's second paragraph has another
 *   class and is cut off; note 3-2's has a link, which also cuts it off (`continuation`, export-footnotes.ts).
 * - A page anchor inside note 1-4, links inside note 2-3, and a decoy: a superscript "2" linking to a paragraph in
 *   chapter 1 that is not a note and does not link back.
 *
 * **Check:** Save as Markdown, one note per chapter — each chapter note ends in its definitions (`[^1]: …`), the
 * citing paragraphs end in `^fn-N`, and the Notes note stays whole with every number a link to its block. In a single
 * note, the repeated numbers become `[^1-2]`. The decoy stays text. Selecting a reference in the reader opens its note
 * in the link preview.
 */
export function endnotes(): Built {
  const p = proseFrom(1901);
  const TITLE = titleFromFile('endnotes.epub');
  const ref = (id: string, target: string, label: string) =>
    `<sup class="nr"><a id="${id}" href="notes.xhtml#${target}" class="calibre3">${label}</a></sup>`;
  const para = (html: string) => `<p class="tx">${html}</p>`;
  const say = () => esc(p.sentence());
  const chapters = [
    {
      file: 'ch1.xhtml',
      name: 'Chapter One',
      body: [
        `<p class="ct"><a id="cont_1" href="contents.xhtml#chap_1">CHAPTER ONE</a></p>`,
        `<p class="ct1"><a href="contents.xhtml#chap_1">The title line carries a note</a>${ref('fn_1', 'sn_1', '1')}</p>`,
        para(
          `${say()} Two notes in one paragraph${ref('fn_2', 'sn_2', '2')} share its block id${ref('fn_3', 'sn_3', '3')}. ${say()}`
        ),
        para(
          `${say()} This reference has no superscript <a id="fn_4" href="notes.xhtml#sn_4" class="calibre3">4</a>. ${say()}`
        ),
        `<p class="tx" id="fig1">${say()} This paragraph is the decoy's target: not a note, and it links nowhere.</p>`,
        para(`${say()} A note that runs to two paragraphs${ref('fn_5', 'sn_5', '5')}. ${say()}`),
        ...p.paragraphsOf(1200).map((x) => para(esc(x))),
      ],
    },
    {
      file: 'ch2.xhtml',
      name: 'Chapter Two',
      body: [
        `<p class="ct"><a id="cont_2" href="contents.xhtml#chap_2">CHAPTER TWO</a></p>`,
        para(`${say()} Numbering restarts here${ref('fn2_1', 'sn2_1', '1')}. ${say()}`),
        para(`${say()} A note whose second paragraph has another class${ref('fn2_2', 'sn2_2', '2')}. ${say()}`),
        para(`${say()} A note with links inside it${ref('fn2_3', 'sn2_3', '3')}. ${say()}`),
        ...p.paragraphsOf(800).map((x) => para(esc(x))),
        para(`${say()} The first note of this chapter, cited a second time${ref('fn2_1b', 'sn2_1', '1')}. ${say()}`),
      ],
    },
    {
      file: 'ch3.xhtml',
      name: 'Chapter Three',
      body: [
        `<p class="ct"><a id="cont_3" href="contents.xhtml#chap_3">CHAPTER THREE</a></p>`,
        para(`${say()} A reference in chapter three to a note at the back${ref('fn3_1', 'sn3_1', '1')}. ${say()}`),
        `<ul><li>${say()} A reference in a list item${ref('fn3_2', 'sn3_2', '2')}.</li><li>${say()}</li></ul>`,
        `<table><tr><td>${say()} A reference in a table cell${ref('fn3_3', 'sn3_3', '3')}.</td><td>${say()}</td></tr></table>`,
        para(
          `${say()} The decoy: a superscript that links to a paragraph in chapter one<sup><a href="ch1.xhtml#fig1">2</a></sup>. ${say()}`
        ),
        ...p.paragraphsOf(800).map((x) => para(esc(x))),
      ],
    },
  ];
  const note = (id: string, chapter: string, ref: string, label: string, text: string, pre = '') =>
    `<p class="ntx">${pre}<a id="${id}" href="${chapter}#${ref}" class="calibre3">${label}</a>. ${text}</p>`;
  const notesBody = [
    '<p class="h2b"><a id="page90"></a></p>',
    '<p class="ct"><a id="notes_top" href="contents.xhtml#notes_toc">NOTES</a></p>',
    '<p class="h2b">CHAPTER 1: THE TITLE LINE</p>',
    note('sn_1', 'ch1.xhtml', 'fn_1', '1', `Note 1-1, cited from the chapter's title line. ${say()}`),
    note('sn_2', 'ch1.xhtml', 'fn_2', '2', `Note 1-2, the first of two in one paragraph. ${say()}`),
    note('sn_3', 'ch1.xhtml', 'fn_3', '3', `Note 1-3, the second of two in one paragraph. ${say()}`),
    note(
      'sn_4',
      'ch1.xhtml',
      'fn_4',
      '4',
      `Note 1-4, with a page anchor before its number, cited without a superscript. ${say()}`,
      '<a id="page91"></a>'
    ),
    note('sn_5', 'ch1.xhtml', 'fn_5', '5', `Note 1-5, first of two paragraphs. ${say()}`),
    `<p class="ntx">Note 1-5, second paragraph: the same class and no id, so it joins the note. ${say()}</p>`,
    '<p class="h2b">CHAPTER 2: NUMBERING AGAIN</p>',
    note('sn2_1', 'ch2.xhtml', 'fn2_1', '1', `Note 2-1, numbered 1 again, and cited twice. ${say()}`),
    note('sn2_2', 'ch2.xhtml', 'fn2_2', '2', `Note 2-2, first paragraph. ${say()}`),
    `<p class="ntx-cont">Note 2-2, second paragraph in another class — cut off from the note, and left in the Notes chapter. ${say()}</p>`,
    note(
      'sn2_3',
      'ch2.xhtml',
      'fn2_3',
      '3',
      `Note 2-3, with <a href="https://example.org/">a web link</a> and <a href="ch1.xhtml">a link to chapter one</a> inside it. ${say()}`
    ),
    '<p class="h2b">CHAPTER 3: FROM A DISTANCE</p>',
    note('sn3_1', 'ch3.xhtml', 'fn3_1', '1', `Note 3-1, cited from a paragraph. ${say()}`),
    note('sn3_2', 'ch3.xhtml', 'fn3_2', '2', `Note 3-2, cited from a list item. ${say()}`),
    `<p class="ntx">Note 3-2, second paragraph, holding <a href="https://example.org/more">a link</a> — which cuts it off. ${say()}</p>`,
    note('sn3_3', 'ch3.xhtml', 'fn3_3', '3', `Note 3-3, cited from a table cell. ${say()}`),
  ].join('\n');
  const contents = [
    '<p class="ct"><a id="cont_top"></a>CONTENTS</p>',
    ...chapters.map((c, n) => `<p class="toc"><a id="chap_${n + 1}" href="${c.file}#cont_${n + 1}">${c.name}</a></p>`),
    '<p class="toc"><a id="notes_toc" href="notes.xhtml#notes_top">Notes</a></p>',
    '<p class="toc"><a href="about.xhtml">About the Author</a></p>',
  ].join('\n');
  const files: EpubFile[] = [
    ...coverFiles(0, TITLE),
    css(),
    page('contents.xhtml', 'Contents', contents),
    ...chapters.map((c) => page(c.file, c.name, c.body.join('\n'))),
    page('notes.xhtml', 'Notes', notesBody),
    page('about.xhtml', 'About the Author', `<p class="ct">ABOUT THE AUTHOR</p>\n${ps(p.paragraphsOf(400))}`),
  ];
  return epub(
    'endnotes.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:endnotes',
      files,
      spine: [
        { path: 'cover.xhtml' },
        ...['contents.xhtml', ...chapters.map((c) => c.file), 'notes.xhtml', 'about.xhtml'].map((path) => ({ path })),
      ],
      nav: [
        { label: 'Contents', href: 'contents.xhtml' },
        ...chapters.map((c, n) => ({ label: c.name, href: `${c.file}#cont_${n + 1}` })),
        { label: 'Notes', href: 'notes.xhtml#notes_top' },
        { label: 'About the Author', href: 'about.xhtml' },
      ],
      coverImage: 'cover.png',
    },
    0
  );
}

/**
 * Footnotes kept with their chapters, in each of the markups real books use for them. Each note's text says which
 * case it is.
 *
 * - Chapter 1 (two contents entries in one file): InDesign-style references in `<span class="footnotereference">`, the
 *   notes gathered at the end in `<div>`s with a back-link on the number; one reference with a bare `#` href; a note
 *   whose same-class second paragraph joins it and one whose other-class second paragraph does not.
 * - Chapter 2: `epub:type="noteref"` references and a `<section epub:type="footnotes">` of `epub:type="footnote"`
 *   containers — one of three paragraphs in mixed classes with a link, which comes over whole; a `[*2]` label; and a
 *   note typed on a `<span>` inside its paragraph.
 * - Chapter 3: a note in an `<aside epub:type="footnote">` — the research expects this one to be LOST from Markdown,
 *   since asides are dropped. And a reference into a `linear="no"` file, which is never exported.
 * - Chapter 4: the note in the NEXT file, an unlisted, heading-less continuation (a Calibre split), before a listed
 *   afterword.
 *
 * **Check:** Save as Markdown — each note becomes a definition at the end of its chapter's note and the book's copy is
 * gone; no `^fn` ids appear, since nothing is kept elsewhere. Note what happens to the aside note and the non-linear
 * one, and whether chapter 4's note, in the next file, is lifted into Chapter Four.
 */
export function footnotes(): Built {
  const p = proseFrom(2001);
  const TITLE = titleFromFile('footnotes.epub');
  const say = () => esc(p.sentence());
  const paras = (chars: number) => ps(p.paragraphsOf(chars));
  const ch1 = [
    '<h2 id="c1">Chapter One</h2>',
    `<p>${say()} An InDesign-style reference<span class="footnotereference"><a class="calibre15" id="footnote-1-backlink" href="ch1.xhtml#footnote-1">1</a></span>. ${say()}</p>`,
    `<p>${say()} A reference with a bare fragment for its href<sup><a id="r1-2" href="#fn1-2">2</a></sup>. ${say()}</p>`,
    paras(800),
    '<h2 id="c1b">Chapter One, Continued</h2>',
    `<p>${say()} A second contents entry in the same file, and a note with a stray second paragraph<span class="footnotereference"><a class="calibre15" id="footnote-3-backlink" href="ch1.xhtml#footnote-3">3</a></span>. ${say()}</p>`,
    paras(800),
    '<p class="rule">* * *</p>',
    '<div class="fnblock">',
    `<div><p class="fn"><a class="_idfootnoteanchor" id="footnote-1" href="ch1.xhtml#footnote-1-backlink">1</a> Note 1-1, InDesign style, with a back-link on its number. ${say()}</p></div>`,
    `<div><p class="fn"><a id="fn1-2" href="#r1-2">2</a> Note 1-2, first paragraph. ${say()}</p><p class="fn">Note 1-2, second paragraph: same class, no id — it joins. ${say()}</p></div>`,
    `<div><p class="fn"><a class="_idfootnoteanchor" id="footnote-3" href="ch1.xhtml#footnote-3-backlink">3</a> Note 1-3, first paragraph. ${say()}</p><p class="fn-cont">Note 1-3, second paragraph in another class — left behind in the text. ${say()}</p></div>`,
    '</div>',
  ].join('\n');
  const ch2 = [
    '<h2 id="c2">Chapter Two</h2>',
    `<p>${say()} A typed reference<a epub:type="noteref" role="doc-noteref" id="ref2-1" href="#note2-1">1</a>. ${say()}</p>`,
    `<p>${say()} A typed reference with an unusual label<sup><a epub:type="noteref" id="ref2-2" href="#note2-2">[*2]</a></sup>. ${say()}</p>`,
    `<p>${say()} A note typed on a span inside its paragraph<a epub:type="noteref" id="ref2-3" href="#n2-3">3</a>. ${say()}</p>`,
    paras(1000),
    '<section epub:type="footnotes">',
    `<div id="note2-1" class="footnote" epub:type="footnote" role="doc-footnote"><p class="fn-first"><a role="doc-backlink" href="#ref2-1">1</a>. Note 2-1, first of three paragraphs. ${say()}</p><p class="fn-more">Note 2-1, second paragraph, in another class — inside the container, so it comes over. ${say()}</p><p class="fn-more">Note 2-1, third paragraph, with <a href="https://example.org/">a web link</a>. ${say()}</p></div>`,
    `<div id="note2-2" class="footnote" epub:type="footnote" role="doc-footnote"><p class="fn-first"><a role="doc-backlink" href="#ref2-2">[*2]</a> Note 2-2, labelled [*2]. ${say()}</p></div>`,
    `<p class="footnote"><a id="n2-3_aa" href="#ref2-3">3</a> <span epub:type="footnote" id="n2-3">Note 2-3, typed on the span that holds its text. ${say()}</span></p>`,
    '</section>',
  ].join('\n');
  const ch3 = [
    '<h2 id="c3">Chapter Three</h2>',
    `<p>${say()} A note in an aside<sup><a epub:type="noteref" id="ref3-1" href="#note3-1">1</a></sup>. ${say()}</p>`,
    `<p>${say()} A reference into a file that is not in the reading order<sup><a id="ref-nl" href="nonlinear.xhtml#nl-1">*</a></sup>. ${say()}</p>`,
    paras(1000),
    `<aside epub:type="footnote" id="note3-1"><p><a href="#ref3-1">1</a> Note 3-1, in an aside. ${say()}</p></aside>`,
  ].join('\n');
  const ch4 = [
    '<h2 id="c4">Chapter Four</h2>',
    `<p>${say()} The note for this reference is in the next file<span class="superscript"><span id="fnref4-1"><a href="ch4b.xhtml#fn4-1">1</a></span></span>. ${say()}</p>`,
    paras(1200),
  ].join('\n');
  const ch4b = [
    `<p>This file continues Chapter Four: no heading and no contents entry. ${say()}</p>`,
    paras(800),
    `<div id="fn4-1" epub:type="footnote"><p><a href="ch4.xhtml#fnref4-1">1</a>. Note 4-1, in the file after its reference. ${say()}</p></div>`,
  ].join('\n');
  const nonlinear = `<p id="nl-1">Note *, in a file outside the reading order. ${say()}</p>`;
  const files: EpubFile[] = [
    ...coverFiles(1, TITLE),
    css(),
    page('ch1.xhtml', 'Chapter One', ch1),
    page('ch2.xhtml', 'Chapter Two', ch2),
    page('ch3.xhtml', 'Chapter Three', ch3),
    page('ch4.xhtml', 'Chapter Four', ch4),
    page('ch4b.xhtml', TITLE, ch4b),
    page('afterword.xhtml', 'Afterword', `<h2 id="aw">Afterword</h2>\n${paras(500)}`),
    page('nonlinear.xhtml', 'Notes Apart', nonlinear),
  ];
  return epub(
    'footnotes.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:footnotes',
      files,
      spine: [
        { path: 'cover.xhtml' },
        ...['ch1.xhtml', 'ch2.xhtml', 'ch3.xhtml', 'ch4.xhtml', 'ch4b.xhtml', 'afterword.xhtml'].map((path) => ({
          path,
        })),
        { path: 'nonlinear.xhtml', linear: false },
      ],
      nav: [
        { label: 'Chapter One', href: 'ch1.xhtml#c1' },
        { label: 'Chapter One, Continued', href: 'ch1.xhtml#c1b' },
        { label: 'Chapter Two', href: 'ch2.xhtml#c2' },
        { label: 'Chapter Three', href: 'ch3.xhtml#c3' },
        { label: 'Chapter Four', href: 'ch4.xhtml#c4' },
        { label: 'Afterword', href: 'afterword.xhtml#aw' },
      ],
      coverImage: 'cover.png',
    },
    1
  );
}

/**
 * A trilogy in one volume whose contents list each novel's title BESIDE its parts rather than over them: the novel's
 * title, its Dedication and its Contents as top-level entries, then Part I–III as top-level entries each holding that
 * novel's numbered chapters ("1", "2", …, restarting in every novel). The last Part of the last novel ends in a nested
 * Epilogue, and Acknowledgments and About the Author follow at the top level. Every chapter is a file of its own.
 *
 * What it exercises: **names**, in `flattenTocWithDisambiguation` (toc-utils.ts). A structure word used to lend its
 * name to whatever unique entry came next, so the second novel read `Part III: “The Long Field” – The Harbor Wall`
 * and the Acknowledgments `Epilogue – Acknowledgments`. A Part still names its own chapters — `Part I: “The Lantern
 * Road” – 1` — because "1" repeats and the nesting says so. The repeated Dedication and Contents are told apart by the
 * novel before them.
 *
 * **Check:** Save as Markdown and the Marks PDF picker list the same rows: each novel's title is a row of its own,
 * plainly named, and so are Acknowledgments and About the Author; each Part opens into its chapters, named after the
 * Part; the second Dedication reads `The Harbor Wall – Dedication`.
 */
export function trilogyParts(): Built {
  const p = proseFrom(2201);
  const TITLE = titleFromFile('trilogy-parts.epub');
  const novels = [
    { name: 'The Lantern Road', parts: ['The Lantern Road', 'The Ferry Crossing', 'The Long Field'] },
    { name: 'The Harbor Wall', parts: ['The Tide Book', 'The Bell Tower', 'The Weir'] },
    { name: 'The Weir at Dusk', parts: ['The Mill Race', 'The Orchard', 'The Last Lantern'] },
  ];
  const ROMAN = ['I', 'II', 'III'];
  const files: EpubFile[] = [...coverFiles(2, TITLE), css()];
  const spine: { path: string }[] = [{ path: 'cover.xhtml' }];
  const nav: NavEntry[] = [];
  const add = (path: string, title: string, body: string) => {
    files.push(page(path, title, body));
    spine.push({ path });
  };
  add('title.xhtml', 'Title Page', `<h1>${esc(TITLE.toUpperCase())}</h1>`);
  nav.push({ label: 'Title Page', href: 'title.xhtml' });
  add('contents.xhtml', 'Contents', `<h2>Contents</h2>${ps(novels.map((n) => n.name))}`);
  nav.push({ label: 'Contents', href: 'contents.xhtml' });
  novels.forEach((novel, ni) => {
    const n = ni + 1;
    add(`n${n}-title.xhtml`, novel.name, `<h1>${esc(novel.name.toUpperCase())}</h1>`);
    nav.push({ label: novel.name, href: `n${n}-title.xhtml` });
    add(`n${n}-dedication.xhtml`, 'Dedication', `<p>For the readers of ${esc(novel.name)}.</p>`);
    nav.push({ label: 'Dedication', href: `n${n}-dedication.xhtml` });
    add(`n${n}-contents.xhtml`, 'Contents', `<h2>Contents</h2>${ps(novel.parts.map((part, i) => `Part ${ROMAN[i]}`))}`);
    nav.push({ label: 'Contents', href: `n${n}-contents.xhtml` });
    let chapter = 0;
    novel.parts.forEach((partName, pi) => {
      const label = `Part ${ROMAN[pi]}: “${partName}”`;
      const partFile = `n${n}-p${pi + 1}.xhtml`;
      add(partFile, label, `<h1>${esc(label)}</h1>`);
      const children: NavEntry[] = [];
      for (let c = 0; c < 3; c++) {
        chapter++;
        const file = `n${n}-c${chapter}.xhtml`;
        add(file, String(chapter), `<h2>${chapter}</h2>\n${ps(p.paragraphsOf(1500))}`);
        children.push({ label: String(chapter), href: file });
      }
      if (ni === novels.length - 1 && pi === novel.parts.length - 1) {
        add(`n${n}-epilogue.xhtml`, 'Epilogue', `<h2>Epilogue</h2>\n${ps(p.paragraphsOf(1200))}`);
        children.push({ label: 'Epilogue', href: `n${n}-epilogue.xhtml` });
      }
      nav.push({ label, href: partFile, children });
    });
  });
  add('acknowledgments.xhtml', 'Acknowledgments', `<h2>Acknowledgments</h2>\n${ps(p.paragraphsOf(500))}`);
  nav.push({ label: 'Acknowledgments', href: 'acknowledgments.xhtml' });
  add('about.xhtml', 'About the Author', `<h2>About the Author</h2>\n${ps(p.paragraphsOf(400))}`);
  nav.push({ label: 'About the Author', href: 'about.xhtml' });
  return epub(
    'trilogy-parts.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:trilogy-parts',
      files,
      spine,
      nav,
      coverImage: 'cover.png',
    },
    2
  );
}

/**
 * An FB2 with footnotes, kept where FB2 keeps them: a second `<body name="notes">`, one `<section id>` per note, and
 * references written `<a l:href="#n1" type="note">`. foliate makes that body one section of its own and marks it
 * non-linear (`linear: 'no'`) — which is why the exports include non-linear sections: skipping them would drop every
 * note here. Each note's text says which case it is.
 *
 * **Check:** open it and select a reference — the link preview shows the note. Save as Markdown: the notes still
 * arrive, either as definitions or as a Notes note the numbers link to; note which. The Save as Markdown dialog and
 * the Marks PDF picker list the same rows, the notes body among them.
 */
export function fb2Notes(): Built {
  const p = proseFrom(2101);
  const title = titleFromFile('fb2-notes.fb2');
  const c = cover(3, title, ['FB2']);
  const bytes = buildFb2({
    title,
    authors: [{ first: 'Orbis', last: 'Tester' }],
    year: '2026',
    sections: [
      {
        title: 'Chapter One',
        paragraphs: [
          `${p.sentence()} A first note{{note:n1|[1]}}. ${p.sentence()}`,
          `${p.sentence()} Two notes in one paragraph{{note:n2|[2]}}, and here the second{{note:n3|[3]}}.`,
          ...p.paragraphsOf(1500),
        ],
      },
      {
        title: 'Chapter Two',
        paragraphs: [
          `${p.sentence()} A note that runs to two paragraphs{{note:n4|[4]}}. ${p.sentence()}`,
          ...p.paragraphsOf(1500),
        ],
      },
      {
        title: 'Chapter Three',
        paragraphs: [
          `${p.sentence()} The first note cited again{{note:n1|[1]}}, and a last one{{note:n5|[5]}}. ${p.sentence()}`,
          ...p.paragraphsOf(1500),
        ],
      },
    ],
    notes: [
      {
        id: 'n1',
        label: '1',
        paragraphs: [`Note 1, cited from Chapter One and again from Chapter Three. ${p.sentence()}`],
      },
      { id: 'n2', label: '2', paragraphs: [`Note 2, the first of two in one paragraph. ${p.sentence()}`] },
      { id: 'n3', label: '3', paragraphs: [`Note 3, the second of two in one paragraph. ${p.sentence()}`] },
      {
        id: 'n4',
        label: '4',
        paragraphs: [`Note 4, first paragraph. ${p.sentence()}`, `Note 4, second paragraph. ${p.sentence()}`],
      },
      { id: 'n5', label: '5', paragraphs: [`Note 5, cited from Chapter Three. ${p.sentence()}`] },
    ],
    cover: c,
  });
  return { file: 'fb2-notes.fb2', bytes, shape: false, title, authors: [AUTHOR.name], cover: c, palette: 3 };
}

/** Every finding fixture, in build order. */
export const FINDINGS = [
  keywordSizes,
  bodyTextStyles,
  calibreBodyAnchors,
  omnibus,
  gutenbergStyle,
  technicalBook,
  endnotes,
  footnotes,
  fb2Notes,
  trilogyParts,
];
