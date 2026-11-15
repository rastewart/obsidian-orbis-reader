// Builds a book of text that a theme alone leaves unreadable: a book's own backgrounds and text colors, to check that
// the reader repairs the text that fails and leaves the rest as the book drew it.
//
// **What it probes.** A theme colors the page and the text on `body`; the chapter inherits it. A book's shaded box
// keeps its own background and usually sets no text color, so in a dark theme it inherits light text on a pale box,
// and in a light theme dark text on a dark one. A book's own gray text fails the other way, on a dark page.
// `repairContrast` (src/reader/contrast-repair.ts) finds text below 3 : 1 against what is behind it and gives it a
// color that reads.
//
// **Switch themes while reading it.** Every row says what it should look like. With the debug log's `display` pill
// on, each chapter load and each theme change logs "contrast: N of M elements given a readable color".
//
// **And a page that must be left alone.** A second book, fixed-layout, is one page of white lettering over a dark
// illustration, with the words in the page's flow rather than positioned, so only the rule that leaves a fixed-layout
// book's pages whole keeps them white in a light theme.
//
// Run: `pnpm build:contrast-epub` → test-vault/fixtures/contrast-checks.epub and contrast-fixed-layout.epub
//
// See docs/design/reader-themes.md, "Text on a book's own background".

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { FIXTURE_DESCRIPTION, FIXTURE_PUBLISHER } from './fixtures/marker';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT = path.join(ROOT, 'test-vault', 'fixtures', 'contrast-checks.epub');
const FIXED_OUT = path.join(ROOT, 'test-vault', 'fixtures', 'contrast-fixed-layout.epub');

interface Row {
  title: string;
  /** The row's own markup: what the book draws. */
  markup: string;
  expect: string;
}

const ROWS: Row[] = [
  {
    title: 'A pale box that sets no text color',
    markup:
      '<div class="pale"><p>The ferry left the north landing at dawn, and the mill race was already loud with the ' +
      'night’s rain.</p></div>',
    expect:
      'Every theme: the sentence in the box is readable. In a dark theme it turns dark, the color of the theme’s page; ' +
      'in a light theme it keeps the theme’s text color.',
  },
  {
    title: 'A dark box that sets no text color',
    markup:
      '<div class="dark"><p>Wren counted the lanterns twice, and the numbers still did not agree with the ledger.</p>' +
      '</div>',
    expect:
      'Every theme: the sentence in the box is readable. In a light theme it turns light; in a dark theme it keeps the ' +
      'theme’s text color.',
  },
  {
    title: 'The book’s own gray text on the page',
    markup: '<p class="gray">Nobody in Larkspur Mill could say why the boathouse had been left so quiet.</p>',
    expect:
      'Every theme: readable. In a dark theme the gray turns to the theme’s text color; in a light theme it stays the ' +
      'book’s gray.',
  },
  {
    title: 'A link in a pale box',
    markup: '<div class="pale"><p>See <a href="#notes">the notes at the end</a> for the tide tables.</p></div>',
    expect: 'Every theme: the link’s words are readable, in the box’s repaired color or the theme’s link color.',
  },
  {
    title: 'A table with a shaded header and striped rows',
    markup:
      '<table><tr><th>Landing</th><th>Departs</th></tr><tr><td>North</td><td>06:10</td></tr>' +
      '<tr class="stripe"><td>Weir</td><td>06:40</td></tr><tr><td>South</td><td>07:15</td></tr></table>',
    expect: 'Every theme: every cell is readable, the shaded header and the striped row included.',
  },
  {
    title: 'A box with colors of its own that read',
    markup: '<div class="own"><p>Petra mended the footbridge and thought about the long road home.</p></div>',
    expect: 'Every theme: unchanged — dark text on yellow, exactly as the book drew it.',
  },
  {
    title: 'A caption in a soft gray',
    markup: '<p class="soft">Figure 1. The north landing, from the weir.</p>',
    expect: 'Light themes: unchanged, a soft gray the book chose. Dark themes: readable.',
  },
  {
    title: 'A box that is mostly see-through',
    markup: '<div class="glass"><p>Orrin said the ferry would not wait for anyone, not even the mayor.</p></div>',
    expect: 'Every theme: readable, measured against the box over the page.',
  },
  {
    title: 'A box with a gradient behind its text',
    markup: '<div class="gradient"><p>Una painted the footbridge as the rain eased.</p></div>',
    expect:
      'Left as drawn: a gradient cannot be measured, so its text is not repaired. In a dark theme it may be hard to ' +
      'read; that is expected.',
  },
  {
    title: 'White text the book places over a dark picture',
    markup:
      // The picture is sized in em, so it covers the words at any font size the reader chooses.
      '<div class="pictured"><svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 320 120" ' +
      'preserveAspectRatio="none"><rect width="320" height="120" fill="#2d3b2a" />' +
      '<circle cx="290" cy="24" r="12" fill="#e8d27a" /></svg>' +
      '<p class="over">Dusk over the north landing</p></div>',
    expect: 'Every theme: the white words stay white over the dark picture. In a light theme they must not turn dark.',
  },
];

const STYLE = `
body { font-family: Georgia, serif; line-height: 1.5; margin: 1em; }
h1 { font-size: 1.4em; }
div.row { margin: 0 0 1.6em; }
p.what { font-family: monospace; font-size: 0.85em; margin: 0 0 0.3em; }
p.expect { font-size: 0.85em; font-style: italic; margin: 0.3em 0 0; }
div.pale { background: #f5eefa; padding: 0.4em 0.6em; }
div.dark { background: #1f2a44; padding: 0.4em 0.6em; }
p.gray { color: #555555; }
table { border-collapse: collapse; }
th { background: #dddddd; padding: 0.2em 0.6em; }
td { padding: 0.2em 0.6em; }
tr.stripe td { background: #eeeeee; }
div.own { background: #fff59d; color: #222222; padding: 0.4em 0.6em; }
p.soft { color: #777777; font-size: 0.9em; }
div.glass { background: rgba(255, 255, 255, 0.85); padding: 0.4em 0.6em; }
div.gradient { background: linear-gradient(#ffffff, #e8e8e8); padding: 0.4em 0.6em; }
div.pictured { position: relative; height: 6em; }
p.over { position: absolute; left: 0.6em; right: 2.5em; top: 0.8em; margin: 0; color: #ffffff; font-weight: bold; }
`;

/** Escape text going into markup. */
const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
<head><title>Text on the book's own colors</title><style>${STYLE}</style></head>
<body>
<h1>Text on the book's own colors</h1>
<p>Read each row in a dark theme and in a light one. Every sentence should be readable in both, except row 9's,
which is left as the book drew it.</p>
${rows}
<h2 id="notes">Notes</h2>
<p>The tide tables are kept at the weir.</p>
</body>
</html>`;
}

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:0rb15-c0ntr45t-ch3ck5-fixture</dc:identifier>
    <dc:title>Text on the book's own colors (Orbis display fixture)</dc:title>
    <dc:creator>Orbis Tester</dc:creator>
    <dc:publisher>${FIXTURE_PUBLISHER}</dc:publisher>
    <dc:description>${FIXTURE_DESCRIPTION}</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-11T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="chapter1.xhtml">Text on the book's own colors</a></li>
</ol></nav></body></html>`;

/** One page, 600 × 800, as a fixed-layout book draws it: an illustration with white lettering over it. */
const FIXED_PAGE = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Lettering over a picture</title><meta name="viewport" content="width=600, height=800"/>
<style>
html, body { margin: 0; padding: 0; width: 600px; height: 800px; overflow: hidden; }
svg { display: block; }
p { margin: -760px 40px 0; color: #ffffff; font: bold 40px Georgia, serif; }
p.small { margin-top: 24px; font-size: 22px; font-weight: normal; }
</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<rect width="600" height="800" fill="#1f3326" />
<rect y="560" width="600" height="240" fill="#2e4a35" />
<circle cx="470" cy="150" r="60" fill="#e8d27a" />
</svg>
<p>The Night Ferry</p>
<p class="small">These words are white, over a dark picture, in every theme. In a light theme they must not turn
dark: a fixed-layout page is left as the book drew it.</p>
</body>
</html>`;

const FIXED_OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:0rb15-c0ntr45t-f1x3d-fixture</dc:identifier>
    <dc:title>Lettering over a picture (Orbis display fixture)</dc:title>
    <dc:creator>Orbis Tester</dc:creator>
    <dc:publisher>${FIXTURE_PUBLISHER}</dc:publisher>
    <dc:description>${FIXTURE_DESCRIPTION}</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-11T00:00:00Z</meta>
    <meta property="rendition:layout">pre-paginated</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="p1" href="page1.xhtml" media-type="application/xhtml+xml" properties="svg"/>
  </manifest>
  <spine><itemref idref="p1"/></spine>
</package>`;

const FIXED_NAV = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="page1.xhtml">Lettering over a picture</a></li>
</ol></nav></body></html>`;

/** An EPUB's files, zipped with a fixed date so a rebuild with nothing changed writes the same bytes. */
function epub(entries: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    // The mimetype entry must be first and STORED, not deflated.
    mimetype: [enc.encode('application/epub+zip'), { level: 0 }],
  };
  for (const [name, text] of Object.entries(entries)) files[name] = [enc.encode(text), { level: 6 }];
  return zipSync(files as unknown as Parameters<typeof zipSync>[0], { level: 6, mtime: Date.UTC(1980, 6, 1, 12) });
}

function main(): void {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const book = epub({
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': OPF,
    'OEBPS/nav.xhtml': NAV,
    'OEBPS/chapter1.xhtml': chapterXhtml(),
  });
  fs.writeFileSync(OUT, book);
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${ROWS.length} rows, ${(book.length / 1024).toFixed(1)} KB.`);
  const fixed = epub({
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': FIXED_OPF,
    'OEBPS/nav.xhtml': FIXED_NAV,
    'OEBPS/page1.xhtml': FIXED_PAGE,
  });
  fs.writeFileSync(FIXED_OUT, fixed);
  console.log(
    `Wrote ${path.relative(ROOT, FIXED_OUT)} — one fixed-layout page, ${(fixed.length / 1024).toFixed(1)} KB.`
  );
}

main();
