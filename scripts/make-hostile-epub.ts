// Builds a book that tries to run code, so a device test can prove it doesn't.
//
// **The book reports on itself.** Every check is a paragraph that already says PASS, and a payload whose only job
// is to rewrite it to FAIL. So the test needs no devtools and no console: open the book on a device and read it.
// A page of PASS means nothing executed; a single FAIL names exactly which vector got through.
//
// The payloads are deliberately harmless — they rewrite text in their own document, and one sets a marker on the
// host page so a genuine same-origin escape is visible as ESCAPED rather than as nothing. Nothing here touches the
// vault, the network, or any Obsidian API.
//
// Run: `pnpm build:hostile-epub` → test-vault/fixtures/hostile-scripts.epub
//
// See docs/design/reader-architecture.md and src/reader/book-html-guard.ts.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { FIXTURE_DESCRIPTION, FIXTURE_PUBLISHER } from './fixtures/marker';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUT = path.join(ROOT, 'test-vault', 'fixtures', 'hostile-scripts.epub');

/**
 * Escape text that is going into markup.
 *
 * **Every description here names a tag**, so writing them raw would put real `<script>` and `<img>` elements into
 * the chapter: the first one swallows the rest of its paragraph, the hardening removes it, and the book renders as
 * truncated lines — demonstrating the guard by accident while failing to test it.
 */
const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One check: what it tries, and the markup that tries it. `id` is what the payload rewrites on success. */
interface Check {
  id: string;
  what: string;
  markup: string;
  /** What else the page shows when the check passes, for a tester who would otherwise take it for a failure. */
  expect?: string;
}

const fail = (id: string, how: string) =>
  `document.getElementById('${id}').textContent='FAIL — ${how} executed';` +
  `document.getElementById('${id}').className='fail';`;

/**
 * How long a refresh that got through waits before sending the chapter away, so its FAIL row can be read first.
 *
 * **Only Android shows it, and as a flicker, not a blank page.** The frame fails to load the address, ORBIS patch 12
 * takes that load for the browser reloading the frame and shows the chapter again, and the refresh starts over. On
 * the Mac, Windows, iPhone and iPad the page stays as it is, so there only a FAIL row shows the check failed.
 */
const REFRESH_SECONDS = 8;

/**
 * What a check that the hardening read as text leaves behind if the frame parses it as markup: a FAIL row and a
 * refresh. **The row is empty and its words come from the chapter's stylesheet** (`p.breakout::before`): foliate
 * rewrites the text of a `<style>` that has any, which would flatten this markup to text before the hardening ever
 * saw it, and an empty one it leaves alone.
 */
const breakout = (id: string): string =>
  `<p class="check fail breakout" data-check="${id}"/>` +
  `<meta http-equiv="refresh" content="${REFRESH_SECONDS};url=https://example.invalid/${id}"/>`;

/**
 * A breakout that is a failure only if the hardening never looked at it. The row carries a click handler, and is shown
 * only while the handler is still there (`p.unhardened`): the hardening strips every handler, so markup that reaches
 * the frame after the hardening has looked at it draws nothing, and markup that got past it draws the FAIL row. For a
 * check the settling catches, where the markup reaches the frame either way and only the hardening's look is at stake.
 */
const unhardenedBreakout = (id: string): string =>
  `<p class="check fail breakout unhardened" data-check="${id}" onclick="void 0"/>` +
  `<meta http-equiv="refresh" content="${REFRESH_SECONDS};url=https://example.invalid/${id}"/>`;

/**
 * An element whose text the serializer writes as it stands, placed where the frame's parser reads it differently.
 * The hardening's parse moves `<mglyph>` out in front of the `<table>` as an HTML element, so the element inside it
 * is HTML and its text is text. In the serialized chapter `<mglyph>` sits directly in `<mtext>`, where the frame's
 * parser makes it MathML, and in MathML that text is markup.
 */
const rawTextInMath = (tag: string, id: string): string =>
  `<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext><table><mglyph><${tag}>${breakout(id)}</${tag}>` +
  `</mglyph></table></mtext></math>`;

/**
 * A `<style>` holding nothing but a comment, whose text is a `</style>` and a breakout. In SVG a comment is a comment
 * and the serializer writes it as one; parsed as HTML, the `<style>` ends at that `</style>`. Written inside SVG so
 * the hardening's parse keeps it SVG — the checks below differ in how the frame comes to read it as HTML.
 */
const commentedStyle = (id: string): string => `<style><!--</style>${breakout(id)}--></style>`;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A stylesheet that is also markup, linked from the head of the text checks' chapter. */
const HOSTILE_CSS = `/* The chapter's linked stylesheet. If any of this is read as markup, the check has failed. */
body { }
</style>${breakout('cssbreak')}<style>
`;

/**
 * Markup that is text when the hardening runs, and markup again when the frame parses the hardened chapter — see
 * `neutralizeLiteralText` in book-html-guard.ts. Each fails the same way: a FAIL row naming the check appears, and a
 * refresh sends the chapter away.
 *
 * **They have a chapter of their own, and it must stay well-formed XHTML.** foliate reads a malformed chapter as HTML,
 * and on that path its serializer escapes the text of a `<style>` — so the MathML checks would pass whatever Orbis
 * did. The first chapter is not well-formed (its `<img>` is not closed), so it takes the HTML path.
 */
const TEXT_CHECKS: Check[] = [
  {
    id: 'cssbreak',
    what: 'A stylesheet whose text ends its <style> element and goes on as markup',
    markup: '', // the sheet is linked from the head — see HOSTILE_CSS
  },
  {
    id: 'mathstyle',
    what: 'A <style> inside MathML, holding markup the frame would parse as markup',
    markup: rawTextInMath('style', 'mathstyle'),
  },
  {
    id: 'mathxmp',
    what: 'An <xmp> inside MathML, holding markup the frame would parse as markup',
    markup: rawTextInMath('xmp', 'mathxmp'),
    expect:
      'If this is working, you see the hidden markup below as plain text, beginning <p class="check fail breakout". ' +
      'If it is not, that line is missing and a red row beginning FAIL appears instead.',
  },
  {
    id: 'noscript',
    what: 'A comment inside <noscript> that ends it, where the frame allows scripts (iPhone, iPad, Android)',
    markup: `<noscript><!--</noscript>${breakout('noscript')}--></noscript>`,
  },
  {
    id: 'svgxmp',
    what: 'An <xmp> inside SVG, holding a <style> that only a comment is in',
    // Turning this <xmp> into an HTML <pre> would take the <style> out of SVG, into HTML.
    markup: `<svg xmlns="${SVG_NS}" width="0" height="0"><xmp>${commentedStyle('svgxmp')}</xmp></svg>`,
  },
  {
    id: 'svgstyle',
    what: 'An SVG <style> holding a comment, placed where the frame parses it as HTML',
    // The hardening's parse keeps this <style> in SVG. The frame's parse makes <mglyph> MathML, the <svg> under it
    // MathML too, and its <mtext> a place where HTML starts again — so there the <style> is HTML.
    markup:
      `<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext><table><mglyph><svg xmlns="${SVG_NS}"><mtext>` +
      `${commentedStyle('svgstyle')}</mtext></svg></mglyph></table></mtext></math>`,
  },
];

const CHECKS: Check[] = [
  {
    id: 'inline',
    what: 'An inline <script> in the body',
    markup: `<script>${fail('inline', 'an inline script')}</script>`,
  },
  {
    id: 'external',
    what: 'An external <script src> pointing at a file inside the EPUB',
    markup: `<script src="payload.js"></script>`,
  },
  {
    id: 'head',
    what: 'A <script> in the <head>, before any of this markup was parsed',
    markup: '', // lives in the head — see chapterXhtml
  },
  {
    id: 'onload',
    what: 'An onload handler on <body>',
    markup: '', // lives on the body element — see chapterXhtml
  },
  {
    id: 'onerror',
    what: 'An <img> whose src cannot load, with an onerror handler',
    markup: `<img src="does-not-exist.png" alt="" onerror="${fail('onerror', 'an img onerror')}">`,
  },
  {
    id: 'svg',
    what: 'An <svg> with an onload handler',
    markup: `<svg width="1" height="1" onload="${fail('svg', 'an svg onload')}"></svg>`,
  },
  {
    id: 'object',
    what: 'An <object> pointing at an HTML document that scripts',
    markup: `<object data="payload.xhtml" type="application/xhtml+xml" width="1" height="1"></object>`,
  },
  {
    id: 'iframe',
    what: 'A nested <iframe> loading a document that scripts',
    markup: `<iframe src="payload.xhtml" width="1" height="1" title="nested"></iframe>`,
  },
  {
    id: 'srcdoc',
    what: 'An <iframe srcdoc> whose document scripts',
    markup: `<iframe width="1" height="1" title="inline" srcdoc="${esc(
      `<script>parent.document.getElementById('srcdoc').textContent='FAIL — a srcdoc frame executed';` +
        `parent.document.getElementById('srcdoc').className='fail';</script>`
    )}"></iframe>`,
  },
  {
    id: 'base',
    what: 'A <base> tag that would re-point every relative URL in the chapter',
    markup: '', // lives in the head — see chapterXhtml
  },
];

/** A link the reader selects by hand — the one check that cannot report itself automatically. */
const JS_LINK = `<p><a id="jslink" href="javascript:${fail('jslink-result', 'a javascript: link')}">Select this link.</a>
Orbis Reader should say it does not open links that run scripts, and nothing else. If the line below changes, it ran.</p>
<p id="jslink-result" class="pass">PASS — nothing has run from that link.</p>`;

/** A refresh in the head, read by eye like the link: it cannot report itself, because if it works the page reloads. */
const REFRESH = `<p class="check pass"><span class="what">${esc('A <meta http-equiv="refresh"> sending this chapter to a web page')}</span>
PASS if this page is still here, and not flickering, ${REFRESH_SECONDS} seconds after it opened. Only Android shows a refresh that got through; on other devices this row proves nothing.</p>`;

const STYLE = `
body { font-family: Georgia, serif; line-height: 1.5; margin: 1em; }
h1 { font-size: 1.4em; }
p.check { margin: 0 0 1.2em; padding: 0.4em 0.6em; border-left: 4px solid #2e7d32; background: #f1f8f1; color: #1b1b1b; }
p.fail { border-left-color: #c62828; background: #fdecea; font-weight: bold; }
.what { display: block; font-size: 0.85em; color: #555; font-family: monospace; margin-bottom: 0.2em; }
.expect { display: block; font-size: 0.85em; color: #555; margin-top: 0.3em; }
p.breakout::before { content: 'FAIL — the check "' attr(data-check) '" was parsed as markup after the hardening'; }
p.unhardened:not([onclick]) { display: none; }
`;

function chapterXhtml(): string {
  const rows = CHECKS.map(
    (c) =>
      `<p class="check pass" id="${c.id}"><span class="what">${esc(c.what)}</span>PASS — nothing executed.</p>\n${c.markup}`
  ).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Script execution checks</title>
<base href="https://example.invalid/" />
<meta http-equiv="refresh" content="${REFRESH_SECONDS};url=https://example.invalid/" />
<script>${fail('head', 'a script in the head')}</script>
<script>document.documentElement.setAttribute('data-orbis-head-script','ran');</script>
<style>${STYLE}</style>
</head>
<body onload="${fail('onload', 'a body onload')}">
<h1>Script execution checks</h1>
<p>Every line below should say <strong>PASS</strong>. A single <strong>FAIL</strong> names the vector that got
through. The base tag in this chapter's head points at <code>example.invalid</code>: if relative links in the next
chapter break, <code>base-uri</code> is not holding.</p>
${rows}
${JS_LINK}
${REFRESH}
<p class="check pass" id="escape">
<span class="what">${esc('A script reaching the host page through same-origin access')}</span>
PASS — no escape attempted, because no script ran.</p>
<script>
try {
  parent.document.documentElement.setAttribute('data-orbis-escaped', '1');
  document.getElementById('escape').textContent = 'FAIL — ESCAPED to the host page';
  document.getElementById('escape').className = 'fail';
} catch (e) {
  document.getElementById('escape').textContent = 'FAIL — a script ran (blocked at the host page: ' + e.name + ')';
  document.getElementById('escape').className = 'fail';
}
</script>
</body>
</html>`;
}

function textChecksXhtml(): string {
  const rows = TEXT_CHECKS.map(
    (c) =>
      `<p class="check pass" id="${c.id}"><span class="what">${esc(c.what)}</span>PASS unless a FAIL row naming "${c.id}" appears on this page.${c.expect ? `<span class="expect">${esc(c.expect)}</span>` : ''}</p>\n${c.markup}`
  ).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Markup hidden as text</title>
<style>${STYLE}</style>
<link rel="stylesheet" href="hostile.css" />
</head>
<body>
<h1>Markup hidden as text</h1>
<p>Each check below hides markup where the hardening reads it as text. Every line should say <strong>PASS</strong>,
and no line should begin with <strong>FAIL</strong>. A check that gets through adds a FAIL row naming itself and a refresh
to a web page, which on Android makes this page flicker every ${REFRESH_SECONDS} seconds.</p>
${rows}
</body>
</html>`;
}

/** A second chapter, so paging works and relative navigation can be checked against the hostile <base>. */
const CHAPTER_TWO = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Ordinary chapter</title><style>${STYLE}</style></head>
<body>
<h1>An ordinary chapter</h1>
<p>Nothing here tries anything. It exists so the book has two chapters to page between, and so that
<a href="chapter1.xhtml">this link back to the first chapter</a> can be tapped: it must go there, not to
example.invalid.</p>
<p class="check pass">PASS — if you can read this, the book renders normally after hardening.</p>
</body>
</html>`;

/**
 * A chapter that has to appear, and as itself. Two checks:
 * - an `<xmp>` with an attribute named `=x`, which the HTML parser accepts and the DOM refuses to set by name: copying
 *   it by name threw, and a chapter whose hardening throws used to stay blank;
 * - a `<pre>` that opens with blank lines. Each reading of the chapter drops one, and writing it out does not put it
 *   back, so a settling check that compared the text never settled and showed the chapter as plain text. Eight, since
 *   foliate's own reading and the hardening's first drop two before settling starts.
 *
 * **Not well-formed on purpose**, unlike the text checks: `=x` is no XML attribute, so foliate reads the chapter as
 * HTML, which keeps both. The template trick from the same review is not here: written three ways — malformed, and
 * well-formed with the markup escaped or in a comment — it came out of foliate's serializer harmless before the
 * hardening saw it. The unit tests cover it.
 */
const CHAPTER_FOUR = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>A chapter that must appear</title><style>${STYLE}</style></head>
<body>
<h1>A chapter that must appear</h1>
<p class="check pass"><span class="what">${esc('An <xmp> with an attribute named "=x", which the DOM refuses')}</span>PASS — if you can read this, the chapter appeared. A failure shows nothing at all: the page stays blank or keeps showing the chapter before.</p>
<xmp =x>The text of that xmp, shown as written.</xmp>
<p class="check pass"><span class="what">${esc('A <pre> that opens with blank lines')}</span>PASS — if this chapter has its colored rows. A failure shows the whole chapter as plain paragraphs under the note "Orbis Reader shows this chapter as plain text".</p>
<pre>${'\n'.repeat(8)}The text of a listing that opens with blank lines.</pre>
</body>
</html>`;

/**
 * A chapter with no doctype. `DOMParser` reads one in quirks mode, where a `<table>` does not close an open `<p>`; in
 * standards mode it does, and the breakout here is hidden where only a standards reading finds it. The guard writes
 * `<!DOCTYPE html>` into every chapter, so its settling and the frame both read in standards mode, find it, and the
 * hardening strips it — which is why its row uses `unhardenedBreakout`. Measured: in Chrome a `srcdoc` frame without a
 * doctype also nests the quirks way, so there the guard and the frame agreed even before; WebKit's frame on iPhone and
 * iPad does not, and without the doctype this check failed there.
 *
 * A chapter of its own, so that a chapter shown as plain text cannot hide it, and malformed (the unclosed `<br>`) so
 * foliate reads it as HTML, which is the only way its doctype-less reading reaches the hardening.
 */
const CHAPTER_FIVE = `<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>A chapter with no doctype</title><style>${STYLE}</style></head>
<body>
<h1>A chapter with no doctype</h1>
<p class="check pass"><span class="what">${esc('<p><table> nests one way for the hardening, another for the frame')}</span>PASS unless a FAIL row naming "quirks" appears in this chapter.<span class="expect">${esc('A line reading <!-- below this row is expected: it is the start of the hidden markup, shown as text. Only a red row beginning FAIL is a failure.')}</span><br></p>
<math><mtext><p><table></table><mglyph><svg><mtext><xmp><!--</xmp>${unhardenedBreakout('quirks')}--></xmp></mtext></svg></mglyph></p></mtext></math>
</body>
</html>`;

/**
 * A chapter that tries to choose the page color: red, with FAIL written across it, by every route that beats the
 * theme's own `html, body { background: … !important }` — a more specific selector and an inline `!important`.
 * Orbis paints the theme's color as an inline `!important` on `<html>` and `<body>` (`paintPageColor`), which nothing
 * in a book can beat, and foliate no longer copies the book's background into Obsidian's window (ORBIS patch 22),
 * where a `url()` in it was fetched outside every book policy. The picture is a `data:` URL so the check needs no
 * network; a remote one is what the patch is for. The rows keep their own colors: backgrounds inside the chapter are
 * the book's content.
 */
const FAIL_PICTURE = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='90'><text x='16' y='58' font-family='sans-serif' font-size='40' font-weight='bold' fill='white'>FAIL</text></svg>"
)}`;
const PAGE_COLOR_CSS = `html:root, html body, body#page { background: #c62828 url("${FAIL_PICTURE}") repeat !important; }`;
const CHAPTER_SIX = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>A book cannot choose the page color</title><style>${STYLE}
${PAGE_COLOR_CSS}</style></head>
<body id="page" style="background: #c62828 url(&quot;${FAIL_PICTURE}&quot;) repeat !important">
<h1>A book cannot choose the page color</h1>
<p class="check pass"><span class="what">${esc('html body { background: red url(…) !important } and the same in a style attribute')}</span>PASS if the page behind these rows, margins included, is your reader theme's color.<span class="expect">A failure shows a red page with FAIL written across it. The rows keep their own pale colors either way: a background inside the chapter is the book's to choose.</span></p>
</body>
</html>`;

const PAYLOAD_JS = `${fail('external', 'an external script')}`;

/**
 * The document an `<object>` or `<iframe>` loads. Reaching the chapter is a failure; reaching the window above it —
 * Obsidian's, with the vault on it — is the one this whole guard exists to prevent, so it is tried and named.
 * `parent.parent` is the window holding the reader's frame: foliate's frames live in Obsidian's document.
 */
const PAYLOAD_XHTML = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>p</title></head><body>
<script>
var say = function (how) {
  ['object', 'iframe'].forEach(function (id) {
    try { var row = parent.document.getElementById(id); row.textContent = 'FAIL — ' + how; row.className = 'fail'; } catch (e) {}
  });
};
say('a nested document executed');
try {
  parent.parent.document.documentElement.setAttribute('data-orbis-escaped', '1');
  say('a nested document ESCAPED to the host page');
} catch (e) {}
</script>
</body></html>`;

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:0rb15-h05t1le-5cr1pt5-fixture</dc:identifier>
    <dc:title>Script execution checks (Orbis security fixture)</dc:title>
    <dc:creator>Orbis Tester</dc:creator>
    <dc:publisher>${FIXTURE_PUBLISHER}</dc:publisher>
    <dc:description>${FIXTURE_DESCRIPTION}</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-09-07T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml" properties="scripted"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="chapter3.xhtml" media-type="application/xhtml+xml"/>
    <item id="c4" href="chapter4.xhtml" media-type="application/xhtml+xml"/>
    <item id="c5" href="chapter5.xhtml" media-type="application/xhtml+xml"/>
    <item id="c6" href="chapter6.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="hostile.css" media-type="text/css"/>
    <item id="pay" href="payload.js" media-type="text/javascript"/>
    <item id="payx" href="payload.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c3"/>
    <itemref idref="c2"/>
    <itemref idref="c4"/>
    <itemref idref="c5"/>
    <itemref idref="c6"/>
  </spine>
</package>`;

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="chapter1.xhtml">Script execution checks</a></li>
<li><a href="chapter3.xhtml">Markup hidden as text</a></li>
<li><a href="chapter2.xhtml">An ordinary chapter</a></li>
<li><a href="chapter4.xhtml">A chapter that must appear</a></li>
<li><a href="chapter5.xhtml">A chapter with no doctype</a></li>
<li><a href="chapter6.xhtml">A book cannot choose the page color</a></li>
</ol></nav></body></html>`;

function main(): void {
  const enc = new TextEncoder();
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    // The mimetype entry must be first and STORED, not deflated — the one part of the container spec that a
    // zip writer can get wrong invisibly.
    mimetype: [enc.encode('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': [enc.encode(CONTAINER), { level: 6 }],
    'OEBPS/content.opf': [enc.encode(OPF), { level: 6 }],
    'OEBPS/nav.xhtml': [enc.encode(NAV), { level: 6 }],
    'OEBPS/chapter1.xhtml': [enc.encode(chapterXhtml()), { level: 6 }],
    'OEBPS/chapter2.xhtml': [enc.encode(CHAPTER_TWO), { level: 6 }],
    'OEBPS/chapter3.xhtml': [enc.encode(textChecksXhtml()), { level: 6 }],
    'OEBPS/chapter4.xhtml': [enc.encode(CHAPTER_FOUR), { level: 6 }],
    'OEBPS/chapter5.xhtml': [enc.encode(CHAPTER_FIVE), { level: 6 }],
    'OEBPS/chapter6.xhtml': [enc.encode(CHAPTER_SIX), { level: 6 }],
    'OEBPS/hostile.css': [enc.encode(HOSTILE_CSS), { level: 6 }],
    'OEBPS/payload.js': [enc.encode(PAYLOAD_JS), { level: 6 }],
    'OEBPS/payload.xhtml': [enc.encode(PAYLOAD_XHTML), { level: 6 }],
  };

  // A fixed date, as in scripts/fixtures/epub.ts, so a rebuild with nothing changed writes the same bytes.
  const zipped = zipSync(files as unknown as Parameters<typeof zipSync>[0], {
    level: 6,
    mtime: Date.UTC(1980, 6, 1, 12),
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, zipped);
  // + the javascript: link, the refresh, the escape check, the two in the chapter that must appear, the quirks one,
  // and the page color
  const checks = CHECKS.length + TEXT_CHECKS.length + 7;
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${checks} checks, ${(zipped.length / 1024).toFixed(1)} KB.`);
  console.log('Open it in Orbis on each device. Every line should read PASS.');
}

main();
