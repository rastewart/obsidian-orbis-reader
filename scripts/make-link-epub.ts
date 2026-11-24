// Builds a book of links, so a device test can see what Orbis shows before a link leaves the book — and what
// Obsidian and the system do after Open.
//
// **Read by eye, one row at a time.** Unlike the scripts fixture, nothing here can report itself: the dialog is in
// Obsidian's window and what happens after Open belongs to the system. So every row says what the dialog should show
// and what to watch for, and the device run records what actually happened.
//
// Every address is a reserved name (`example.com`, `example.net`, `example.org`, `.invalid`), a fictional phone
// number (555-0100), the filesystem root, or an Obsidian search. Nothing here writes to the vault. The `javascript:`
// links do nothing even if they run.
//
// Run: `pnpm build:link-epub` → test-vault/fixtures/link-checks.epub
//
// See src/reader/LinkCheck.ts and docs/design/security.md, "Links out of a book".

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { FIXTURE_DESCRIPTION, FIXTURE_PUBLISHER } from './fixtures/marker';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT = path.join(ROOT, 'test-vault', 'fixtures', 'link-checks.epub');

/** Escape text going into markup — several rows name tags or hold `&` in an address. */
const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Built from code points so this file holds no invisible or look-alike character of its own.
const RLO = String.fromCodePoint(0x202e);
const ZWSP = String.fromCodePoint(0x200b);
const CYRILLIC_A = String.fromCodePoint(0x0430);

interface Row {
  title: string;
  /** The link's address, exactly as it goes into `href`. */
  href: string;
  /** The link's content as markup — already escaped where it holds text. */
  content: string;
  /**
   * The whole link, for one that is not an `<a href>` — an image map, an SVG or a MathML link — written with `href`
   * where `content` would go. `content` is then unused.
   */
  markup?: string;
  /** What the reader should see, and do. */
  expect: string;
}

const LONG_PATH = Array.from({ length: 12 }, (_, i) => `section-${i + 1}-of-a-very-long-address`).join('/');

const ROWS: Row[] = [
  {
    title: 'A web link whose text is its address',
    href: 'https://example.com/',
    content: esc('https://example.com/'),
    expect:
      'Link type: Web page. Domain: example.com, in bold. Link text and Link address both read https://example.com/ in a code font, with example.com bold in the address and a copy button beside it. No orange lines. Open is in the theme accent color; with the keyboard, Cancel is highlighted. Select Open: example.com opens.',
  },
  {
    title: 'Text naming the same site, with and without www.',
    href: 'https://www.example.com/about',
    content: esc('example.com'),
    expect: 'Domain: www.example.com. No orange lines: www. and the page do not make a different site. Select Cancel.',
  },
  {
    title: 'Text that names one site, an address for another',
    href: 'https://example.org/sign-in',
    content: esc('https://example.com/account'),
    expect:
      'Domain: example.org. Under Link text, an orange line: The link text shows example.com. The link address goes to example.org. Above the buttons: This link may be unsafe. Open it only if you trust the book’s source. Open is red. Select the copy button beside Link address, then paste somewhere: https://example.org/sign-in. Select Cancel.',
  },
  {
    title: 'A user name that looks like a site',
    href: 'https://example.com@example.net/',
    content: esc('Sign in'),
    expect:
      'Domain: example.net. Under Link address, an orange line: The link address has a name before “@” (example.com). The domain is example.net. In the address, example.net is bold. Open is red. Select Cancel.',
  },
  {
    title: 'A look-alike letter in the address',
    href: `https://ex${CYRILLIC_A}mple.com/`,
    content: esc('https://example.com/'),
    expect: `Domain: xn--exmple-4nf.com. Under it, an orange line: the domain contains characters outside the basic Latin alphabet: ${CYRILLIC_A} (Cyrillic, U+0430). Under Link text: the link text shows example.com, the link address goes to xn--exmple-4nf.com. Write down exactly what the dialog shows on this device. Select Cancel.`,
  },
  {
    title: 'A site name the book wrote already encoded',
    href: 'https://xn--exmple-4nf.com/',
    content: esc('A shop'),
    expect: `Domain: xn--exmple-4nf.com. Under it, the same orange line as the row above: the domain contains characters outside the basic Latin alphabet: ${CYRILLIC_A} (Cyrillic, U+0430). Open is red. Select Cancel.`,
  },
  {
    title: 'A zero-width space hidden in the address',
    href: `https://exa${ZWSP}mple.com/`,
    content: esc('https://example.com/'),
    expect:
      'Domain: example.com, because the browser drops that character, and Link address reads https://example.com/. No orange line: under Link address, a grey note says the link address in the book has characters you can’t see, and is shown as it will be opened. Open is in the accent color. Select Cancel.',
  },
  {
    title: 'A direction override hidden in the link text',
    href: 'https://example.com/invoice',
    content: esc(`invoice${RLO}fdp.exe`),
    expect:
      'In the book the link reads as invoiceexe.pdf. Link text reads invoice[U+202E]fdp.exe, and under it a grey note: Characters you can’t see in the book are shown as codes, such as [U+202E]. No orange line, and Open is in the accent color. Select Cancel.',
  },
  {
    title: 'A very long address',
    href: `https://example.com/${LONG_PATH}?ref=link-check&n=1`,
    content: esc('A short label for a long address'),
    expect:
      'No orange lines. The whole address shows, wrapped over several lines, with no sideways scrolling. The buttons stay on screen. Select Cancel.',
  },
  {
    title: 'A link that is only a picture',
    href: 'https://example.com/picture',
    content: '<img src="square.svg" alt="A blue square" width="48" height="48" />',
    expect: 'Link text reads (a picture: A blue square). No orange lines. Select Cancel.',
  },
  {
    title: 'An email link',
    href: 'mailto:someone@example.com?subject=Orbis%20link%20check',
    content: esc('Write to someone@example.com'),
    expect:
      'Link type: Email. Domain: example.com. Select Open. On a computer, Obsidian shows its own warning first; select Open Link. Android shows the share sheet of email apps; iPhone and iPad open the email app. Discard the draft.',
  },
  {
    title: 'A phone link',
    href: 'tel:+15555550100',
    content: esc('Call 555-0100'),
    expect:
      'Link type: Phone number, and no Domain row. Select Open. On a computer, Obsidian shows its own warning; select Cancel there. Android opens the dialer, iPhone asks whether to call, and the iPad does nothing. Do not call.',
  },
  {
    title: 'An Obsidian link that is not a book link',
    href: 'obsidian://search?query=orbis-link-check',
    content: esc('Search the vault'),
    expect:
      'Link type: Obsidian link (search), and no Domain row. Select Open: Obsidian search opens with orbis-link-check, with no warning from Obsidian, on every device.',
  },
  {
    title: 'A file link',
    href: 'file:///',
    content: esc('Open the files on this device'),
    expect:
      'Link type: File on this device, and no Domain row. Select Open. On a computer, Obsidian shows its own warning; either answer is fine. On a phone or tablet, nothing happens.',
  },
  {
    title: 'A script link',
    href: 'javascript:void(0)',
    content: esc('Run this'),
    expect: 'No dialog. A notice says Orbis Reader doesn’t open links that run scripts. Nothing else happens.',
  },
  {
    title: 'A script link in capitals',
    href: 'JAVASCRIPT:void(0)',
    content: esc('Run this too'),
    expect: 'The same notice as the row above, and no dialog.',
  },
  {
    title: 'An address that cannot be opened',
    href: 'https://exa mple.com/',
    content: esc('A broken address'),
    expect:
      'Link type: Not a valid address, and no Domain row. Link address shows it as written. Above the buttons, a line says this address can’t be opened. There is no Open button, only Cancel, and the copy button beside the address.',
  },
  {
    title: 'A link to another book',
    href: 'obsidian://orbis-nav?file=fixtures%2Fhostile-scripts.epub',
    content: esc('Open the script checks book'),
    expect: 'No dialog. The script checks book opens in this tab. Use the back arrow to return here.',
  },
  {
    title: 'A link inside this book',
    href: 'chapter2.xhtml#target',
    content: esc('Go to the second chapter'),
    expect:
      'No Open this link dialog. With Link preview on, the usual preview opens with a Go button; with it off, the book goes to the second chapter.',
  },
  /*
   * Links that are not `<a href>`. Foliate listened only for `<a href>`, so before ORBIS patch 23 a tap on one of these
   * went straight to its address in the reader's frame, with no dialog. Each row's address
   * is one a failure makes visible: example.com's page in place of the chapter, or Obsidian's search opening.
   */
  {
    title: 'A link on part of a picture (an image map)',
    href: 'https://example.com/image-map',
    content: '',
    markup:
      '<p><img src="square.svg" usemap="#picture-map" alt="A blue square" width="96" height="96" /></p>\n' +
      '<map name="picture-map" id="picture-map"><area shape="default" href="{href}" alt="A blue square" /></map>',
    expect:
      'Select the blue square. Link type: Web page. Domain: example.com. Link address reads https://example.com/image-map, and Link text reads (a picture: A blue square). Select Cancel. A failure shows no dialog: the chapter turns into example.com’s page, an error or a blank page, or flickers.',
  },
  {
    title: 'An SVG link written with xlink:href',
    href: 'https://example.com/svg-link',
    content: '',
    markup:
      '<p><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="96" height="96" viewBox="0 0 48 48">' +
      '<a xlink:href="{href}"><title>A green square</title><rect width="48" height="48" fill="#2e7d32" /></a></svg></p>',
    expect:
      'Select the green square. Link type: Web page. Domain: example.com. Link address reads https://example.com/svg-link, and Link text reads A green square. Select Cancel. A failure shows no dialog: the chapter turns into example.com’s page, an error or a blank page, or flickers.',
  },
  {
    title: 'A link on a formula (MathML)',
    href: 'https://example.com/formula',
    content: '',
    markup:
      '<p><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow href="{href}"><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math></p>',
    expect:
      'Select the formula x + y. Link type: Web page. Domain: example.com. Link address reads https://example.com/formula. Select Cancel. Before the fix, Mac, Windows and Android do nothing at all, since their engine does not follow a link on a formula; a failure on iPhone or iPad shows no dialog, and the chapter turns into example.com’s page, an error or a blank page.',
  },
  {
    title: 'An image map to an Obsidian action',
    href: 'obsidian://search?query=orbis-image-map-check',
    content: '',
    markup:
      '<p><img src="square.svg" usemap="#action-map" alt="A blue square" width="96" height="96" /></p>\n' +
      '<map name="action-map" id="action-map"><area shape="default" href="{href}" alt="A blue square" /></map>',
    expect:
      'Select the blue square. Link type: Obsidian link (search), and no Domain row. Select Cancel: nothing opens. A failure is Obsidian’s search opening with orbis-image-map-check, with no dialog first.',
  },
];

const STYLE = `
body { font-family: Georgia, serif; line-height: 1.5; margin: 1em; }
h1 { font-size: 1.4em; }
div.row { margin: 0 0 1.4em; padding: 0.4em 0.6em; border-left: 4px solid #1565c0; background: #eef4fb; }
p { margin: 0.2em 0; }
p.what { font-family: monospace; font-size: 0.85em; color: #444; }
p.expect { font-size: 0.9em; }
`;

function chapterXhtml(): string {
  const rows = ROWS.map(
    (r, i) => `<div class="row">
<p class="what">${i + 1}. ${esc(r.title)}</p>
${r.markup ? r.markup.replace('{href}', esc(r.href)) : `<p><a href="${esc(r.href)}">${r.content}</a></p>`}
<p class="expect">${esc(r.expect)}</p>
</div>`
  ).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Link checks</title><style>${STYLE}</style></head>
<body>
<h1>Link checks</h1>
<p>Select each link and compare what Orbis Reader shows with the line under it. Record what happens after Open on each
device: that part belongs to Obsidian and the system, and is what this book is for.</p>
${rows}
</body>
</html>`;
}

const CHAPTER_TWO = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>The second chapter</title><style>${STYLE}</style></head>
<body>
<h1>The second chapter</h1>
<p id="target">This is where the link inside the book leads. Nothing here leaves the book.</p>
<p><a href="chapter1.xhtml">Back to the link checks</a></p>
</body>
</html>`;

const SQUARE_SVG = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="#1565c0"/></svg>`;

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:0rb15-11nk5-check5-fixture</dc:identifier>
    <dc:title>Link checks (Orbis security fixture)</dc:title>
    <dc:creator>Orbis Tester</dc:creator>
    <dc:publisher>${FIXTURE_PUBLISHER}</dc:publisher>
    <dc:description>${FIXTURE_DESCRIPTION}</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-10-25T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="sq" href="square.svg" media-type="image/svg+xml"/>
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
<li><a href="chapter1.xhtml">Link checks</a></li>
<li><a href="chapter2.xhtml">The second chapter</a></li>
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
    'OEBPS/square.svg': [enc.encode(SQUARE_SVG), { level: 6 }],
  };

  // A fixed date, as in make-hostile-epub.ts, so a rebuild with nothing changed writes the same bytes.
  const zipped = zipSync(files as unknown as Parameters<typeof zipSync>[0], {
    level: 6,
    mtime: Date.UTC(1980, 6, 1, 12),
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, zipped);
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${ROWS.length} links, ${(zipped.length / 1024).toFixed(1)} KB.`);
  console.log('Open it in Orbis on each device and select each link in turn.');
}

main();
