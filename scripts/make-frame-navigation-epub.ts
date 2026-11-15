// Builds a book of links the reader's link handler cannot see, so a device test can show that a tap on one leaves
// the chapter where it is — and that no document the frame could be sent to runs a script.
//
// **What it probes.** foliate finds a tapped link by walking up from the tap's target to an `<a>`, `<area>` or MathML
// element with an `href` written on it (ORBIS patch 23, `findLink` in src/vendor/foliate-js/view.js). Two SVG shapes
// get past that: a `<use>` copy of a link, whose tap lands on the `<use>`, and a link whose address comes from an
// animation, which has no `href` written on it. Without the protections, the browser followed such a link in the
// chapter's frame, with no **Open this link?** and no guard; on iPhone and iPad a script in the book's own document
// then ran in Obsidian's window. Three rows aim at a document holding a script: one outside the reading order, a
// chapter, and an SVG file — foliate gives each a `blob:` address of Obsidian's own origin.
//
// **Every row should do nothing.** The chapter refuses every navigation it starts (`keepChapterInPlace`), a tap
// inside SVG with no readable link does nothing (ORBIS patch 27), and the copies foliate makes of the book's files
// run nothing (`book-copies.ts`). With the debug log's `display` pill on, a device with the Navigation API logs
// "kept the chapter in its frame" for each row that tried to leave.
//
// **A failure has to outlast the chapter.** When the frame loads anything else, ORBIS patch 12 shows the chapter
// again, so a result written inside the frame is gone in a moment. So each payload reports in Obsidian's window: a
// red banner across the top, which only a script that reached that window can draw. The banner is the payload's only
// effect; it touches no file and no Obsidian API, and selecting it removes it.
//
// Every address is a reserved name (`example.com`) or an Obsidian search. Nothing here writes to the vault.
//
// Run: `pnpm build:frame-navigation-epub` → test-vault/fixtures/frame-navigation.epub
//
// See docs/design/security.md, "A chapter stays in its frame" and "Copies of a book's files".

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { FIXTURE_DESCRIPTION, FIXTURE_PUBLISHER } from './fixtures/marker';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT = path.join(ROOT, 'test-vault', 'fixtures', 'frame-navigation.epub');

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** Escape text going into markup. */
const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A square to select, 96 px, with a name a screen reader and the row's text can both use. */
const square = (fill: string, name: string): string =>
  `<title>${esc(name)}</title><rect width="48" height="48" fill="${fill}" />`;

/**
 * A link that exists only as a `<use>` copy. The `<a>` sits in `<defs>`, which draws nothing, and the `<use>` draws a
 * copy of it. A tap on the copy has the `<use>` as its target, and the `<use>` has no `<a>` above it.
 *
 * The `<use>` names its source with `href` and with `xlink:href`, for engines that know only one. With `href` written
 * on it, foliate leaves it alone (`[*|href]:not([href])`); the `<a>` it copies has only `xlink:href`, so foliate gives
 * an address inside the book a `blob:` one, as it does for any SVG link.
 */
const useCopy = (id: string, href: string, fill: string, name: string): string =>
  `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" width="96" height="96" viewBox="0 0 48 48">` +
  `<defs><a id="${id}" xlink:href="${esc(href)}">${square(fill, name)}</a></defs>` +
  `<use href="#${id}" xlink:href="#${id}" /></svg>`;

/** A link whose address an animation supplies, so no `href` is written on it. */
const animatedLink = (href: string, fill: string, name: string): string =>
  `<svg xmlns="${SVG_NS}" width="96" height="96" viewBox="0 0 48 48">` +
  `<a><set attributeName="href" to="${esc(href)}" begin="0s" fill="freeze" />${square(fill, name)}</a></svg>`;

interface Row {
  title: string;
  markup: string;
  expect: string;
}

/** What a tap on a row should do. */
const PASS = 'PASS: nothing happens.';
/** What a row that sends the frame away looks like when it gets through. */
const LEFT_THE_CHAPTER = 'A failure: the chapter flickers, goes blank, or is replaced, and may come back.';
/** What a row aimed at a script looks like when the script runs. */
const ESCAPED =
  'The failure this book exists to find: a red banner across the top of Obsidian beginning ESCAPED. Select the banner to remove it.';

const ROWS: Row[] = [
  {
    title: 'A <use> copy of a link to a document of this book, outside the reading order, that runs a script',
    markup: `<p>${useCopy('to-payload', 'payload.xhtml', '#6a1b9a', 'A purple square')}</p>`,
    expect: `Select the purple square. ${PASS} ${LEFT_THE_CHAPTER} ${ESCAPED}`,
  },
  {
    title: 'A <use> copy of a link to a chapter of this book that runs a script',
    markup: `<p>${useCopy('to-chapter', 'chapter2.xhtml', '#ad1457', 'A magenta square')}</p>`,
    expect:
      `Select the magenta square. ${PASS} ${LEFT_THE_CHAPTER} ${ESCAPED} ` +
      'The chapter itself, read normally, shows its text and runs nothing.',
  },
  {
    title: 'A <use> copy of a link to an SVG picture of this book that runs a script',
    markup: `<p>${useCopy('to-svg', 'payload.svg', '#4527a0', 'A violet square')}</p>`,
    expect: `Select the violet square. ${PASS} ${LEFT_THE_CHAPTER} ${ESCAPED}`,
  },
  {
    title: 'A <use> copy of a link to an Obsidian action',
    markup: `<p>${useCopy('to-search', 'obsidian://search?query=orbis-use-link', '#e65100', 'An orange square')}</p>`,
    expect: `Select the orange square. ${PASS} A failure: Obsidian’s search opens with orbis-use-link, with no dialog first.`,
  },
  {
    title: 'A <use> copy of a link to a web page',
    markup: `<p>${useCopy('to-web', 'https://example.com/use-link', '#00838f', 'A teal square')}</p>`,
    expect: `Select the teal square. ${PASS} ${LEFT_THE_CHAPTER}`,
  },
  {
    title: 'A link whose address is set by an animation (<set attributeName="href">), to an Obsidian action',
    markup: `<p>${animatedLink('obsidian://search?query=orbis-animated-link', '#2e7d32', 'A green square')}</p>`,
    expect: `Select the green square. ${PASS} A failure: Obsidian’s search opens with orbis-animated-link, with no dialog first.`,
  },
  {
    title: 'An animated link around HTML inside the drawing (<foreignObject>), to a web page',
    markup:
      `<p><svg xmlns="${SVG_NS}" width="192" height="48" viewBox="0 0 192 48"><a>` +
      `<set attributeName="href" to="https://example.com/foreign-object" begin="0s" fill="freeze" />` +
      `<foreignObject width="192" height="48"><div xmlns="${XHTML_NS}" style="background: #f9a825; color: #000; ` +
      `height: 48px; padding: 12px; box-sizing: border-box; font-family: sans-serif;">A yellow box of text</div>` +
      `</foreignObject></a></svg></p>`,
    expect: `Select the yellow box. ${PASS} ${LEFT_THE_CHAPTER}`,
  },
  {
    title: 'A <use> copy of a link inside a <label>, to a web page',
    markup: `<p><label>${useCopy('in-label', 'https://example.com/label-link', '#5d4037', 'A brown square')} A label</label></p>`,
    expect: `Select the brown square. ${PASS} ${LEFT_THE_CHAPTER}`,
  },
  {
    title: 'A <use> copy of a link inside a <summary>, to a web page',
    markup:
      `<details><summary>${useCopy('in-summary', 'https://example.com/summary-link', '#455a64', 'A grey square')} ` +
      'More</summary><p>The text a summary opens.</p></details>',
    expect:
      `Select the grey square. ${PASS} Selecting the word More opens and closes the text under it, as it should. ` +
      LEFT_THE_CHAPTER,
  },
  {
    title: 'A form whose button sends the frame to an Obsidian action',
    markup:
      '<form action="obsidian://search" method="get"><p><input type="hidden" name="query" value="orbis-form-check" />' +
      '<button type="submit">Search the vault</button></p></form>',
    expect:
      'Select Search the vault. PASS: nothing happens; the chapter’s policy refuses to send a form anywhere. A ' +
      'failure: Obsidian’s search opens with orbis-form-check.',
  },
];

const STYLE = `
body { font-family: Georgia, serif; line-height: 1.5; margin: 1em; }
h1 { font-size: 1.4em; }
div.row { margin: 0 0 1.4em; padding: 0.4em 0.6em; border-left: 4px solid #6a1b9a; background: #f5eefa; }
p { margin: 0.2em 0; }
p.what { font-family: monospace; font-size: 0.85em; color: #444; }
p.expect { font-size: 0.9em; }
`;

function chapterXhtml(): string {
  const rows = ROWS.map(
    (r, i) => `<div class="row">
<p class="what">${i + 1}. ${esc(r.title)}</p>
${r.markup}
<p class="expect">${esc(r.expect)}</p>
</div>`
  ).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Links the reader cannot see</title><style>${STYLE}</style></head>
<body>
<h1>Links the reader cannot see</h1>
<p>Select each shape and compare what happens with the line under it, on each device. With the debug log's display
pill on, a device that has the Navigation API logs "kept the chapter in its frame" for each row that tried to leave.
If the chapter is left blank and does not come back, open it again from the contents.</p>
${rows}
</body>
</html>`;
}

/**
 * The script every payload runs: a banner in the window above the frame — Obsidian's — saying whether the vault was
 * within reach, without touching it. It holds no `<` or `&`, so it can sit in XHTML without escaping.
 */
const bannerScript = (what: string): string => `
var report = function (text) {
  var row = document.getElementById('result');
  if (row) row.textContent = text;
};
report('FAIL: a script ran in the frame after it left the chapter.');
try {
  var host = parent.document;
  var vault = false;
  try { vault = Boolean(parent.app.vault); } catch (e) {}
  var banner = host.createElement('div');
  banner.textContent = 'ESCAPED: a script from the book (${what}) ran in Obsidian’s own window' +
    (vault ? ', with the vault within its reach' : '') + '. Select this banner to remove it.';
  banner.setAttribute('style', 'position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; padding: 16px; ' +
    'background: #c62828; color: #fff; font: bold 16px sans-serif;');
  banner.addEventListener('click', function () { banner.remove(); });
  host.body.appendChild(banner);
} catch (e) {
  report('FAIL: a script ran in the frame, and was stopped at Obsidian’s window (' + e.name + ').');
}`;

/** Row 1's target: a document outside the reading order, so the only way to it is that link. */
const PAYLOAD_XHTML = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>The frame left the chapter</title></head><body>
<p id="result">The frame left the chapter for a document outside the reading order. No script has run in it.</p>
<script>${bannerScript('row 1, a document outside the reading order')}</script>
</body></html>`;

/** Row 2's target: a chapter, read normally like any other, whose copy is also a page the frame can be sent to. */
const CHAPTER_TWO = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>A chapter that holds a script</title></head><body>
<h1>A chapter that holds a script</h1>
<p id="result">This chapter holds a script. Read here, as a chapter, it has been hardened and nothing in it runs.</p>
<script>${bannerScript('row 2, a chapter')}</script>
</body></html>`;

/** Row 3's target: an SVG picture with a script, which runs only if the frame shows it as a page of its own. */
const PAYLOAD_SVG = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="${SVG_NS}" width="48" height="48" viewBox="0 0 48 48">
<rect width="48" height="48" fill="#4527a0" />
<script><![CDATA[${bannerScript('row 3, an SVG picture')}]]></script>
</svg>`;

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:0rb15-fr4me-n4v1g4t10n-fixture</dc:identifier>
    <dc:title>Links the reader cannot see (Orbis security fixture)</dc:title>
    <dc:creator>Orbis Tester</dc:creator>
    <dc:publisher>${FIXTURE_PUBLISHER}</dc:publisher>
    <dc:description>${FIXTURE_DESCRIPTION}</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-10T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml" properties="svg"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml" properties="scripted"/>
    <item id="payx" href="payload.xhtml" media-type="application/xhtml+xml" properties="scripted"/>
    <item id="pays" href="payload.svg" media-type="image/svg+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`;

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="chapter1.xhtml">Links the reader cannot see</a></li>
<li><a href="chapter2.xhtml">A chapter that holds a script</a></li>
</ol></nav></body></html>`;

function main(): void {
  const enc = new TextEncoder();
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    // The mimetype entry must be first and STORED, not deflated.
    mimetype: [enc.encode('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': [enc.encode(CONTAINER), { level: 6 }],
    'OEBPS/content.opf': [enc.encode(OPF), { level: 6 }],
    'OEBPS/nav.xhtml': [enc.encode(NAV), { level: 6 }],
    'OEBPS/chapter1.xhtml': [enc.encode(chapterXhtml()), { level: 6 }],
    'OEBPS/chapter2.xhtml': [enc.encode(CHAPTER_TWO), { level: 6 }],
    'OEBPS/payload.xhtml': [enc.encode(PAYLOAD_XHTML), { level: 6 }],
    'OEBPS/payload.svg': [enc.encode(PAYLOAD_SVG), { level: 6 }],
  };

  // A fixed date, as in make-hostile-epub.ts, so a rebuild with nothing changed writes the same bytes.
  const zipped = zipSync(files as unknown as Parameters<typeof zipSync>[0], {
    level: 6,
    mtime: Date.UTC(1980, 6, 1, 12),
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, zipped);
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${ROWS.length} rows, ${(zipped.length / 1024).toFixed(1)} KB.`);
  console.log('Open it in Orbis on each device and select each shape in turn. Every row should do nothing.');
}

main();
