// Builds a book whose own CSS decides what it says, so a device test can prove the book's stylesheets arrive.
//
// **Why a fixture and not a unit test.** The failure this guards against is three layers from anything a test can
// reach: foliate serves a book's resources as `blob:` URLs, `installFoliateSrcdocPatch` loads the chapter as
// `srcdoc` to make it same-origin (annotations need that), and the frame then inherits **Obsidian's** CSP, whose
// `style-src 'unsafe-inline' 'self'` refuses `blob:` — and a `blob:` document inherits the same policy anyway.
// Without `inlineBlobStylesheets` no EPUB renders with its publisher CSS, and nothing looks wrong, because Orbis
// injects typography of its own and the result looks deliberate. `inlineBlobStylesheets` is unit-tested; only a
// real book on a real device can show that it runs where it has to.
//
// **The book reports on itself, in CSS.** No script can help here — the hardening strips them, which is the
// point — so each check is a pair of spans: a FAIL that is visible in plain markup, and a PASS hidden by an
// inline `style`. The book's own stylesheet swaps them. Open it and read: a page of PASS means the CSS arrived.
// Two checks are inverted (they start at PASS and a stylesheet that should NOT apply would spoil them) and one
// needs eyes rather than words, and both say so on the page.
//
// **A third chapter carries fonts of its own**, because a font cannot report in CSS: it is seen or it is not. The
// book embeds Pacifico, a brush script no device has installed, once as a plain file and once obfuscated the way
// most publishers ship fonts. Each is a family name nothing else uses, falling back to plain serif, so a font that
// did not load looks like the paragraph above it. That chapter is also the check that the reader's **Default (use
// book fonts)** uses the book's font: any other choice turns the script into that font. Pacifico is under the SIL
// Open Font License; the license travels inside the book and sits beside the font in scripts/fixtures/fonts.
//
// Run: `pnpm build:stylesheet-epub` → test-vault/fixtures/stylesheet-checks.epub
//
// See src/reader/book-styles.ts and src/reader/book-html-guard.ts.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'fflate';
import { FIXTURE_DESCRIPTION, FIXTURE_PUBLISHER } from './fixtures/marker';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT = path.join(ROOT, 'test-vault', 'fixtures', 'stylesheet-checks.epub');
/**
 * The same content, as JSON a test can import.
 *
 * `src/` compiles for Obsidian and has no Node types — a test that reads the `.epub` with `node:fs` passes under
 * vitest and breaks the build (see `dialog-contract.test.ts`). So the generator
 * hands the test what it needs, the way `book-shapes.json` does for the chapter-row tests.
 */
const JSON_OUT = path.join(ROOT, 'src', '__tests__', 'fixtures', 'stylesheet-checks.json');
/** The second book: the same idea, but every sheet in it carries something that is fatal without patches 4 and 5. */
const HAZARD_OUT = path.join(ROOT, 'test-vault', 'fixtures', 'stylesheet-hazards.epub');
const FONT_DIR = path.join(SCRIPT_DIR, 'fixtures', 'fonts');
/** The date stamped on every zip entry, so the books rebuild byte for byte. */
const FIXED_MTIME = Date.UTC(1980, 6, 1, 12);

/** Escape text going into markup — every description here names a tag. Same trap as the hostile fixture. */
const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * One check.
 *
 * `id` is the class the stylesheets act on. **`startsAtPass` inverts the pair**: those checks are about a sheet
 * that must NOT apply, so plain markup has to be the passing state and the stylesheet is what would spoil it.
 */
interface Check {
  id: string;
  what: string;
  pass: string;
  fail: string;
  startsAtPass?: boolean;
}

const CHECKS: Check[] = [
  {
    id: 'linked',
    what: 'A <link rel="stylesheet"> in the head — the whole reason this fixture exists',
    pass: 'PASS — the book’s own stylesheet is applying',
    fail: 'FAIL — the stylesheet did not arrive (this is the CSP bug)',
  },
  {
    id: 'imported',
    what: 'A second sheet reached by @import from the first',
    pass: 'PASS — an @import inside the stylesheet resolved too',
    fail: 'FAIL — the outer sheet applied but its @import did not',
  },
  {
    id: 'order',
    what: 'Two linked sheets setting the same rule — the later one must win',
    pass: 'PASS — the second sheet overrode the first, so cascade order survived',
    fail: 'FAIL — the first sheet won, so the sheets were reordered',
  },
  {
    id: 'print',
    what: 'A sheet marked media="print", which must not apply on screen',
    pass: 'PASS — the print-only sheet stayed out of the way',
    fail: 'FAIL — a print stylesheet is applying on screen (its media query was dropped)',
    startsAtPass: true,
  },
  {
    id: 'script',
    what: 'A <script> trying to rewrite every line on this page to FAIL',
    pass: 'PASS — no script ran, so the hardening still holds on this path',
    fail: 'FAIL — a script executed',
    startsAtPass: true,
  },
];

/** The markup for one check: both outcomes present, one of them hidden by an inline style. */
function checkRow(c: Check): string {
  const hidden = c.startsAtPass ? c.fail : c.pass;
  const shown = c.startsAtPass ? c.pass : c.fail;
  const hiddenClass = c.startsAtPass ? `${c.id}-fail` : `${c.id}-pass`;
  const shownClass = c.startsAtPass ? `${c.id}-pass` : `${c.id}-fail`;
  return (
    `<p class="check" id="${c.id}">` +
    `<span class="what">${esc(c.what)}</span>` +
    `<span class="${shownClass} state">${esc(shown)}</span>` +
    `<span class="${hiddenClass} state" style="display:none">${esc(hidden)}</span>` +
    `</p>`
  );
}

/**
 * The sheet under test. Every rule here swaps a visible FAIL for a hidden PASS.
 *
 * `!important` throughout, because the losing half is hidden by an inline `style` attribute and nothing else
 * outranks that. Using the attribute rather than a `<style>` block is deliberate: an inline element style is the
 * one thing in the document that cannot itself be a blocked stylesheet, so a FAIL can never be an artifact of
 * the very bug being tested.
 */
const MAIN_CSS = `@import "imported.css";

.linked-fail { display: none !important; }
.linked-pass { display: inline !important; }

/* Loses to second.css, which comes after it in the head. */
.order-fail { display: inline !important; }
.order-pass { display: none !important; }

.check { margin: 0 0 1em 0; }
.what { display: block; font-size: 0.85em; opacity: 0.75; }
.state { font-weight: 700; }

/* The relative image reference below is rewritten by foliate into a blob: URL before Orbis ever sees the
   sheet, so this band also checks that inlining the text did not strand a path that no longer exists.
   NOTE: never write an empty CSS function call with the letters u-r-l in a comment here. Foliate's
   replaceCSS scans the raw text, comments included, and an empty one resolves to the stylesheet itself —
   which makes the sheet its own parent, sends it down the blob branch, and kills the chapter. That is a
   whole afternoon, recorded so nobody spends it twice. */
.swatch {
  display: block;
  height: 2em;
  margin: 0.4em 0 1.2em 0;
  background-image: url("green.png");
  background-size: cover;
}
`;

const IMPORTED_CSS = `.imported-fail { display: none !important; }
.imported-pass { display: inline !important; }
`;

const SECOND_CSS = `/* Later in the head than style.css, so these must win. */
.order-fail { display: none !important; }
.order-pass { display: inline !important; }
`;

const PRINT_CSS = `/* Linked with media="print". If this ever applies on screen, the media query was lost. */
.print-pass { display: none !important; }
.print-fail { display: inline !important; }
`;

const PAYLOAD_JS = `document.querySelectorAll('.state').forEach(function (el) { el.textContent = 'FAIL — a script ran'; });`;

/** A 1×1 green PNG, referenced from the stylesheet by a relative path. */
const GREEN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQ6w4HAAH7ARF0JhTpAAAAAElFTkSuQmCC',
  'base64'
);

function chapterOne(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Stylesheet checks</title>
<link rel="stylesheet" type="text/css" href="style.css" />
<link rel="stylesheet" type="text/css" href="second.css" />
<link rel="stylesheet" type="text/css" media="print" href="print.css" />
</head>
<body>
<h1>Stylesheet checks</h1>
<p>Every line below should say <strong>PASS</strong>. Each one is two pieces of text, and the book&#8217;s own
CSS is what hides the wrong one &#8212; so if none of the stylesheets arrive, every line reads FAIL.</p>
${CHECKS.map(checkRow).join('\n')}
<p class="check"><span class="what">${esc('A relative url() inside the stylesheet, pointing at an image in the EPUB')}</span>
This one needs eyes: the band below should be a solid green stripe. A blank gap means the image behind
<code>background-image</code> did not resolve.</p>
<span class="swatch"></span>
<script>${PAYLOAD_JS}</script>
</body>
</html>`;
}

/** A second chapter, so the sheets can be checked again after a chapter change — each one is loaded separately. */
const CHAPTER_TWO = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>A second chapter</title><link rel="stylesheet" type="text/css" href="style.css" /></head>
<body>
<h1>A second chapter</h1>
<p>Every chapter is fetched and prepared on its own, so this page is a second run of the same machinery rather
than more of the first.</p>
<p class="check"><span class="what">${esc('The same <link rel="stylesheet">, in a different chapter')}</span>
<span class="linked-fail state">FAIL &#8212; the stylesheet did not arrive in this chapter</span>
<span class="linked-pass state" style="display:none">PASS &#8212; it arrived here too</span></p>
<p>Turn back and forth a few times. The lines must not change their minds: a chapter re-rendered after a display
setting changes goes through the same preparation again.</p>
</body>
</html>`;

/**
 * The two embedded faces. Family names no system has, so a face that did not load cannot be mistaken for one that
 * did, and a plain `serif` fallback, so the failure looks like ordinary text rather than like a different script.
 */
const FONTS_CSS = `@font-face {
  font-family: "Orbis Fixture Script";
  src: url("fonts/script.ttf");
}
@font-face {
  font-family: "Orbis Fixture Script Obfuscated";
  src: url("fonts/script-obfuscated.ttf");
}
.font-plain { font-family: "Orbis Fixture Script", serif; font-size: 1.4em; }
.font-obfuscated { font-family: "Orbis Fixture Script Obfuscated", serif; font-size: 1.4em; }
`;

const SAMPLE_LINE = 'Pack my box with five dozen liquor jugs.';

const CHAPTER_THREE = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Embedded fonts</title>
<link rel="stylesheet" type="text/css" href="style.css" />
<link rel="stylesheet" type="text/css" href="fonts.css" />
</head>
<body>
<h1>Embedded fonts</h1>
<p>This book carries a font of its own: a looping brush script that no computer or phone has installed. The two
sample lines below are set in it. If a sample line looks like this paragraph instead, that font did not load.</p>
<p class="what">${esc('A font file in the book, as it is')}</p>
<p class="font-plain">${SAMPLE_LINE}</p>
<p class="what">${esc('The same font obfuscated, as most publishers ship fonts (listed in META-INF/encryption.xml)')}</p>
<p class="font-obfuscated">${SAMPLE_LINE}</p>
<p>With the reader&#8217;s <strong>Font</strong> on <strong>Default (use book fonts)</strong>, both sample lines are
in the script. Any other font replaces it; set back to Default, the script returns.</p>
</body>
</html>`;

/** The IDPF algorithm: the obfuscated font's path, from the container root. */
const ENCRYPTION = `<?xml version="1.0" encoding="utf-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData><enc:CipherReference URI="OEBPS/fonts/script-obfuscated.ttf"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>`;

/**
 * IDPF font obfuscation (EPUB OCF, "Resource Obfuscation"): the first 1040 bytes XORed with the SHA-1 of the
 * package's unique identifier, whitespace removed. Its own inverse, which is how `main` checks it.
 */
function idpfObfuscate(font: Uint8Array, identifier: string): Uint8Array {
  const key = createHash('sha1')
    .update(identifier.replace(/[ \t\r\n]/g, ''))
    .digest();
  const out = new Uint8Array(font);
  for (let i = 0; i < Math.min(1040, out.length); i++) out[i] ^= key[i % key.length];
  return out;
}

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

/** The obfuscation key is derived from this, so the OPF and `idpfObfuscate` must read the same string. */
const BOOK_ID = 'urn:uuid:0rb15-5tyle5heet-check5-fixture';

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${BOOK_ID}</dc:identifier>
    <dc:title>Stylesheet checks (Orbis rendering fixture)</dc:title>
    <dc:creator>Orbis Tester</dc:creator>
    <dc:publisher>${FIXTURE_PUBLISHER}</dc:publisher>
    <dc:description>${FIXTURE_DESCRIPTION}</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-09-19T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml" properties="scripted"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="chapter3.xhtml" media-type="application/xhtml+xml"/>
    <item id="css1" href="style.css" media-type="text/css"/>
    <item id="css2" href="imported.css" media-type="text/css"/>
    <item id="css3" href="second.css" media-type="text/css"/>
    <item id="css4" href="print.css" media-type="text/css"/>
    <item id="css5" href="fonts.css" media-type="text/css"/>
    <item id="font1" href="fonts/script.ttf" media-type="font/ttf"/>
    <item id="font2" href="fonts/script-obfuscated.ttf" media-type="font/ttf"/>
    <item id="ofl" href="fonts/OFL.txt" media-type="text/plain"/>
    <item id="img" href="green.png" media-type="image/png"/>
    <item id="pay" href="payload.js" media-type="text/javascript"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
  </spine>
</package>`;

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="chapter1.xhtml">Stylesheet checks</a></li>
<li><a href="chapter2.xhtml">A second chapter</a></li>
<li><a href="chapter3.xhtml">Embedded fonts</a></li>
</ol></nav></body></html>`;

/**
 * **A book that cannot be opened at all without patches 4 and 5.**
 *
 * Both hazards here are ordinary things a real book can contain, and without the patches both end the same way:
 * `TypeError: s.replace is not a function`, section 0 never loads, `goTo` swallows it into `console.error`, and the
 * reader sits on "Loading content…" with nothing in Orbis's log. The whole book, unreadable, because of one line in
 * one stylesheet.
 *
 * - **An empty `url()`, including one inside a comment.** `replaceCSS` scans raw text, so the words "the url()
 *   below" in a comment match. Unpatched, the empty href resolves to the stylesheet itself, making the sheet its
 *   own parent and sending it down the blob branch. A comment explaining the hazard is enough to trigger it.
 * - **A circular `@import`.** Two sheets that import each other. The cycle guard is working as designed here —
 *   the second visit genuinely must not recurse — so patch 4 cannot help and patch 5 is what keeps the chapter
 *   alive.
 *
 * The book reports in CSS like its sibling: FAIL is what plain markup says, and a rule in each hazardous sheet
 * is what turns it into PASS. So a passing page proves both that the chapter survived AND that the sheet still
 * applied.
 */
const HAZARD_CSS = `/* This comment mentions url() on purpose — that is hazard one, and it is fatal to unpatched foliate. */
.comment-fail { display: none !important; }
.comment-pass { display: inline !important; }

/* Layout, so each check reads as a description above a verdict rather than one run-on line. It lives in the
   hazardous sheet on purpose: if the sheet does not apply, the page says FAIL *and* looks wrong. */
.check { margin: 0 0 1em 0; }
.what { display: block; font-size: 0.85em; opacity: 0.75; }
.state { font-weight: 700; }

/* And an empty one outside a comment, which no amount of comment-stripping would have caught. */
.empty-fail { background: url(); display: none !important; }
.empty-pass { display: inline !important; }
`;

const CYCLE_A_CSS = `@import "cycle-b.css";
.cycle-fail { display: none !important; }
.cycle-pass { display: inline !important; }
`;

const CYCLE_B_CSS = `@import "cycle-a.css";
.cycle-note { font-style: italic; }
`;

/**
 * Two sheets that froze the reader rather than breaking it (ORBIS patches 25 and 26).
 * Each holds, in a comment at its end, text that upstream foliate's patterns took far longer than linear time over
 * — `url(` and a thousand spaces, and eight thousand digits: tens of seconds to minutes, on every load of the chapter.
 * The comment keeps the CSS around it whole, and the rules come first so the sheet still reports.
 */
const SLOW_URL_CSS = `.slowurl-fail { display: none !important; }
.slowurl-pass { display: inline !important; }
/* url(${' '.repeat(1000)}
*/
`;
const SLOW_UNITS_CSS = `.slowunits-fail { display: none !important; }
.slowunits-pass { display: inline !important; }
/* ${'1'.repeat(8000)} */
`;

const HAZARD_ROW = (id: string, what: string, pass: string, fail: string): string =>
  `<p class="check" id="${id}">` +
  `<span class="what">${esc(what)}</span>` +
  `<span class="${id}-fail state">${esc(fail)}</span>` +
  `<span class="${id}-pass state" style="display:none">${esc(pass)}</span>` +
  `</p>`;

const HAZARD_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Stylesheet hazards</title>
<link rel="stylesheet" type="text/css" href="hazard.css" />
<link rel="stylesheet" type="text/css" href="cycle-a.css" />
<link rel="stylesheet" type="text/css" href="slow-url.css" />
<link rel="stylesheet" type="text/css" href="slow-units.css" />
</head>
<body>
<h1>Stylesheet hazards</h1>
<p>Reaching this page at all is most of the test: before the foliate patches, each of the first three hazards below
stopped the chapter loading and the reader showed &#8220;Loading content&#8230;&#8221; forever, and each of the last
two froze the reader for tens of seconds or more. The page should appear as quickly as any other book&#8217;s.</p>
${HAZARD_ROW(
  'comment',
  'A stylesheet whose comment contains the text url()',
  'PASS \u2014 an empty reference in a comment was ignored',
  'FAIL \u2014 the sheet did not apply'
)}
${HAZARD_ROW(
  'empty',
  'An empty url() in a real declaration, outside any comment',
  'PASS \u2014 an empty reference in a rule was ignored too',
  'FAIL \u2014 the sheet did not apply'
)}
${HAZARD_ROW(
  'cycle',
  'Two stylesheets that @import each other',
  'PASS \u2014 the circular import did not take the chapter down',
  'FAIL \u2014 the sheet did not apply'
)}
${HAZARD_ROW(
  'slowurl',
  'A stylesheet holding url( followed by a thousand spaces',
  'PASS \u2014 and the chapter opened without a pause',
  'FAIL \u2014 the sheet did not apply'
)}
${HAZARD_ROW(
  'slowunits',
  'A stylesheet holding eight thousand digits',
  'PASS \u2014 and the chapter opened without a pause',
  'FAIL \u2014 the sheet did not apply'
)}
</body>
</html>`;

const HAZARD_NAV = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="chapter1.xhtml">Stylesheet hazards</a></li>
</ol></nav></body></html>`;

const HAZARD_OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:0rb15-5tyle5heet-hazard5-fixture</dc:identifier>
    <dc:title>Stylesheet hazards (Orbis rendering fixture)</dc:title>
    <dc:creator>Orbis Tester</dc:creator>
    <dc:publisher>${FIXTURE_PUBLISHER}</dc:publisher>
    <dc:description>${FIXTURE_DESCRIPTION}</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-09-20T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="haz" href="hazard.css" media-type="text/css"/>
    <item id="cyca" href="cycle-a.css" media-type="text/css"/>
    <item id="cycb" href="cycle-b.css" media-type="text/css"/>
    <item id="slowurl" href="slow-url.css" media-type="text/css"/>
    <item id="slowunits" href="slow-units.css" media-type="text/css"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;

function main(): void {
  const enc = new TextEncoder();
  const font = new Uint8Array(fs.readFileSync(path.join(FONT_DIR, 'Pacifico-Regular.ttf')));
  const obfuscated = idpfObfuscate(font, BOOK_ID);
  // A key that did nothing would leave a plain font behind the encryption.xml entry, and the check would pass
  // without ever exercising the decoder.
  if (Buffer.from(obfuscated.subarray(0, 1040)).equals(Buffer.from(font.subarray(0, 1040))))
    throw new Error('obfuscation changed nothing');
  if (!Buffer.from(idpfObfuscate(obfuscated, BOOK_ID)).equals(Buffer.from(font)))
    throw new Error('obfuscation does not undo itself');
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    // Stored, not deflated, and first — the one part of the container spec a zip writer can get wrong invisibly.
    mimetype: [enc.encode('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': [enc.encode(CONTAINER), { level: 6 }],
    'META-INF/encryption.xml': [enc.encode(ENCRYPTION), { level: 6 }],
    'OEBPS/content.opf': [enc.encode(OPF), { level: 6 }],
    'OEBPS/nav.xhtml': [enc.encode(NAV), { level: 6 }],
    'OEBPS/chapter1.xhtml': [enc.encode(chapterOne()), { level: 6 }],
    'OEBPS/chapter2.xhtml': [enc.encode(CHAPTER_TWO), { level: 6 }],
    'OEBPS/chapter3.xhtml': [enc.encode(CHAPTER_THREE), { level: 6 }],
    'OEBPS/style.css': [enc.encode(MAIN_CSS), { level: 6 }],
    'OEBPS/imported.css': [enc.encode(IMPORTED_CSS), { level: 6 }],
    'OEBPS/second.css': [enc.encode(SECOND_CSS), { level: 6 }],
    'OEBPS/print.css': [enc.encode(PRINT_CSS), { level: 6 }],
    'OEBPS/fonts.css': [enc.encode(FONTS_CSS), { level: 6 }],
    'OEBPS/fonts/script.ttf': [font, { level: 6 }],
    'OEBPS/fonts/script-obfuscated.ttf': [obfuscated, { level: 6 }],
    'OEBPS/fonts/OFL.txt': [new Uint8Array(fs.readFileSync(path.join(FONT_DIR, 'OFL.txt'))), { level: 6 }],
    'OEBPS/green.png': [new Uint8Array(GREEN_PNG), { level: 6 }],
    'OEBPS/payload.js': [enc.encode(PAYLOAD_JS), { level: 6 }],
  };

  // A fixed date, as in make-hostile-epub.ts, so a rebuild with nothing changed writes the same bytes.
  const zipped = zipSync(files as unknown as Parameters<typeof zipSync>[0], { level: 6, mtime: FIXED_MTIME });

  /**
   * Read back what was just written, here rather than in a test.
   *
   * `mimetype` must be the first entry and stored rather than deflated — the one part of the container spec a zip
   * writer can get wrong invisibly, because a desktop reader opens the book anyway and a phone refuses it. A
   * fixture that only fails on the device it is meant to test is worse than no fixture.
   */
  const readBack = unzipSync(zipped);
  const firstEntry = Object.keys(readBack)[0];
  if (firstEntry !== 'mimetype') throw new Error(`mimetype must be the first zip entry, got "${firstEntry}"`);
  if (new TextDecoder().decode(readBack.mimetype) !== 'application/epub+zip') throw new Error('bad mimetype entry');
  for (const name of Object.keys(files)) {
    if (!readBack[name]) throw new Error(`${name} did not survive the round trip`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, zipped);

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(
    JSON_OUT,
    `${JSON.stringify(
      {
        note: 'Generated by pnpm build:stylesheet-epub — the same content as test-vault/fixtures/stylesheet-checks.epub.',
        chapter1: chapterOne(),
        chapter2: CHAPTER_TWO,
        chapter3: CHAPTER_THREE,
        opf: OPF,
        encryption: ENCRYPTION,
        css: {
          'style.css': MAIN_CSS,
          'imported.css': IMPORTED_CSS,
          'second.css': SECOND_CSS,
          'print.css': PRINT_CSS,
          'fonts.css': FONTS_CSS,
        },
        hazards: {
          opf: HAZARD_OPF,
          chapter1: HAZARD_CHAPTER,
          css: {
            'hazard.css': HAZARD_CSS,
            'cycle-a.css': CYCLE_A_CSS,
            'cycle-b.css': CYCLE_B_CSS,
            'slow-url.css': SLOW_URL_CSS,
            'slow-units.css': SLOW_UNITS_CSS,
          },
        },
      },
      null,
      2
    )}\n`
  );

  console.log(
    `Wrote ${path.relative(ROOT, OUT)} — ${CHECKS.length + 4} checks, ${(zipped.length / 1024).toFixed(1)} KB.`
  );
  const hazardFiles: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    mimetype: [enc.encode('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': [enc.encode(CONTAINER), { level: 6 }],
    'OEBPS/content.opf': [enc.encode(HAZARD_OPF), { level: 6 }],
    'OEBPS/nav.xhtml': [enc.encode(HAZARD_NAV), { level: 6 }],
    'OEBPS/chapter1.xhtml': [enc.encode(HAZARD_CHAPTER), { level: 6 }],
    'OEBPS/hazard.css': [enc.encode(HAZARD_CSS), { level: 6 }],
    'OEBPS/cycle-a.css': [enc.encode(CYCLE_A_CSS), { level: 6 }],
    'OEBPS/cycle-b.css': [enc.encode(CYCLE_B_CSS), { level: 6 }],
    'OEBPS/slow-url.css': [enc.encode(SLOW_URL_CSS), { level: 6 }],
    'OEBPS/slow-units.css': [enc.encode(SLOW_UNITS_CSS), { level: 6 }],
  };
  const hazardZip = zipSync(hazardFiles as unknown as Parameters<typeof zipSync>[0], { level: 6, mtime: FIXED_MTIME });
  if (Object.keys(unzipSync(hazardZip))[0] !== 'mimetype') throw new Error('hazards: mimetype must be first');
  fs.writeFileSync(HAZARD_OUT, hazardZip);

  console.log(`Wrote ${path.relative(ROOT, JSON_OUT)} for the tests.`);
  console.log(
    `Wrote ${path.relative(ROOT, HAZARD_OUT)} — 5 hazards that must not make a book unopenable or freeze it.`
  );
  console.log(
    'Open it in Orbis on each device. Every line should read PASS, the band should be green, and both sample lines ' +
      'in Embedded fonts should be in a brush script.'
  );
}

main();
