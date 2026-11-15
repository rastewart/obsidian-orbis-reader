// Make a book's HTML safe to render, before it is handed to an iframe.
//
// **foliate-js's own README says not to render a book without a CSP**, and it is right: EPUB, MOBI and FB2 all
// carry HTML, HTML carries script, and a book is a file someone sent you. Orbis's own patches make that warning
// sharper rather than softer — `installFoliateSrcdocPatch` deliberately loads chapters as `srcdoc` so the document
// is SAME-ORIGIN with the host page (a blob: iframe gets an opaque origin on WKWebView, and our listeners never
// fire). Same-origin plus scripting means a `<script>` in a book can reach `parent`, which is the Obsidian window
// with the vault API on it.
//
// **Two layers, because they fail differently.** The CSP is the real mechanism: declarative, enforced by the
// engine, and it covers what markup-stripping cannot — a `javascript:` URL assembled at runtime, an inline handler
// spelled in a way we did not think of. Stripping is the backstop for the case where the CSP does not apply at
// all: a `<meta>` policy only governs what is parsed after it, and a malformed book with markup before `<head>`
// is a real thing. Neither is sufficient; together they cover each other's failure.
//
// **Not defense against a determined attacker reading their own book.** It is defense against a book doing
// something its reader did not ask for.
//
// **Cost, and the optimization deliberately not taken.** The parse is the expensive half. The worst real case to hand
// is an EPUB that is one 1.07 MB document (a novel with no chapter files) — about 20x a normal chapter — at roughly
// 180-230 ms a pass in jsdom against 14 ms for 60 KB. Opening a book is unaffected on any device; changing a display
// setting on that one book lags slightly, because `reinjectAllDocs` re-loads the document. A token pre-scan would cut
// that to 7 ms for the overwhelming majority of books, which contain nothing executable — and it was deferred on
// purpose, because one code path verified on three devices is worth more than a second path that is faster. If it is
// ever added: the CSP stays UNCONDITIONAL (so a scan miss costs the second layer, never the first) and nothing is
// cached (a per-book verdict is invalidated by sync replacing the file, by foliate handing us a processed blob rather
// than the file's bytes, and by MOBI/FB2 HTML not existing until load time). See docs/design/dependency-security.md.
//
// **Settling doubles that, and is cheap anyway.** `settleBookHtml` parses and hardens the result once more to check it.
// Measured in Chrome, the check costs no more than the hardening itself, and an ordinary chapter settles at once. On
// devices a 3.1 MB chapter is prepared in 113 ms on the Mac, 120 ms on an iPhone and 240 ms on
// Android, the check included.

import { t } from '../i18n';

/**
 * What a book may do: draw what it carries, and nothing else.
 *
 * **Nothing by default, then the book's own resources.** foliate rewrites every resource inside a book to a `blob:`
 * URL (FB2 pictures are `data:`), and Orbis inlines the book's stylesheets and writes its own styles inline — so
 * `blob:`, `data:` and inline styles are everything a book legitimately loads. What that leaves out is the network: a
 * remote image, font or stylesheet is a request to whoever made the book, sent when the reader turns to the page.
 * An ordinary book loads nothing from outside itself and holds no frame.
 *
 * **Frames especially.** foliate turns `<iframe src="x.xhtml">` into a `blob:` document, and a `blob:` document takes
 * its policy from the window that made it — Obsidian's, not this one. On iPhone and iPad the reader's frame allows
 * scripts (see `installNoScriptSandboxPatch` for why only they keep them), so a nested document ran
 * its script and reached the chapter. `frame-src` stops the load here; `hardenBookDoc` also removes the element.
 *
 * The directives `default-src` already covers are still named, so the policy can be read without knowing CSP's
 * fallback rules. Orbis injects no scripts of its own into these documents.
 */
const BOOK_CSP = [
  "default-src 'none'", // anything not named below: fetches, workers, manifests, prefetches
  "script-src 'none'", // the whole point: no inline, no external, no eval
  "object-src 'none'", // <object>/<embed>, which can host script of their own
  "frame-src 'none'", // a nested document — see above
  "child-src 'none'", // the same, for engines that read frames from here
  "base-uri 'none'", // a <base> could re-point every relative URL in the document
  "form-action 'none'", // nothing in a book should be submitting anywhere
  'img-src blob: data:',
  'media-src blob: data:',
  'font-src blob: data:',
  "style-src 'unsafe-inline' blob: data:", // inline: the book's inlined sheets and Orbis's own styles
].join('; ');

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** `<link rel>` values that open a connection without loading anything a CSP would see — DNS prefetching is not a
 *  fetch, so no directive governs it. A stylesheet link is left alone. */
const CONNECTION_HINTS = new Set(['dns-prefetch', 'preconnect', 'prefetch', 'preload', 'prerender', 'modulepreload']);

/** Attributes that run code. Everything beginning `on` is an event handler in HTML; there is no allowlist to
 *  keep in sync, which is the point — a handler we have never heard of still starts with `on`. */
function isEventHandler(name: string): boolean {
  return name.toLowerCase().startsWith('on');
}

/**
 * `javascript:` in an href or src, seen the way the URL parser sees it.
 *
 * **A `startsWith('javascript:')` misses live URLs.** The parser discards ASCII whitespace and C0 control
 * characters before and *inside* the scheme, so `java<TAB>script:x()` and `  JaVaScRiPt:x()` both run. Filtering
 * those out and then comparing says what the parser says, without a regex full of control escapes that no reader
 * can check by eye.
 */
function isJavascriptUrl(value: string): boolean {
  let scheme = '';
  for (const ch of value) {
    if (ch.charCodeAt(0) <= 0x20) continue; // whitespace and C0 controls: the parser ignores them, so do we
    scheme += ch.toLowerCase();
    if (ch === ':') break;
    if (scheme.length >= 'javascript:'.length) return false; // longer than the scheme we care about
  }
  return scheme === 'javascript:';
}

/**
 * A chapter ready for the frame: hardened and settled, or its text alone.
 *
 * `plainText` says why a chapter is shown as text — it could not be parsed, it did not settle, or a step threw — so
 * the caller can log it. Absent, the chapter is the book's own markup, hardened.
 */
export interface PreparedChapter {
  html: string;
  plainText?: 'unparseable' | 'unsettled' | 'failed';
  /** Milliseconds spent hardening and settling, for the debug log. Absent when a step threw. */
  ms?: { harden: number; settle: number };
}

/**
 * How many times `settleBookHtml` parses and hardens its own output before giving up. An ordinary chapter settles
 * well inside it.
 */
export const SETTLING_PASSES = 3;

/**
 * Strip the executable parts of a book's HTML and prepend a CSP — `prepareBookHtml`, for a caller that wants only the
 * string.
 *
 * **Parsed as HTML, deliberately, even though EPUB content documents are XHTML.** The string is on its way to
 * `srcdoc`, and `srcdoc` is always parsed as HTML — so an HTML round-trip here comes closest to the DOM the browser
 * will build. Closest, not identical, which is why the result is settled: see `settleBookHtml`.
 */
export function hardenBookHtml(html: string): string {
  return prepareBookHtml(html).html;
}

/** Parse, harden and settle a chapter. Never throws: anything that goes wrong gives the chapter as plain text. */
export function prepareBookHtml(html: string): PreparedChapter {
  let doc: Document | null = null;
  try {
    doc = parseBookHtml(html);
  } catch {
    // handled below, as unparseable
  }
  if (!doc) return { html: plainTextChapter(html), plainText: 'unparseable' };
  return prepareBookDoc(doc, html);
}

/**
 * Harden a parsed chapter and settle it. Never throws.
 *
 * Separate from the parse for `installFoliateSrcdocPatch`, which inlines the book's stylesheets into the same
 * document first. `source` is what the chapter was parsed from, for the plain-text fallback; `passes` is for tests.
 */
export function prepareBookDoc(doc: Document, source: string, passes = SETTLING_PASSES): PreparedChapter {
  try {
    const started = performance.now();
    hardenBookDoc(doc);
    const hardened = serializeBookDoc(doc);
    const settling = performance.now();
    const settled = settleBookHtml(hardened, passes);
    const ms = { harden: settling - started, settle: performance.now() - settling };
    return settled === null ? { html: plainTextChapter(source), plainText: 'unsettled', ms } : { html: settled, ms };
  } catch {
    return { html: plainTextChapter(source), plainText: 'failed' };
  }
}

/**
 * The hardened chapter, checked against the document the frame will build from it.
 *
 * **The hardening approves one document and the frame builds another.** The frame parses the serialized chapter
 * again, and serializing and parsing again can move markup — `neutralizeLiteralText` describes the ways known so far.
 * So the serialized chapter is parsed here the way the frame will parse it, and hardened again. If the hardening
 * changes nothing in that document, the frame's document is one the hardening has already approved, whatever trick the
 * book used, and the chapter goes to the frame as it is. If it changes something, the changed document is checked the
 * same way, up to `SETTLING_PASSES` times; one that never stops changing gives null, and the caller shows the chapter
 * as text.
 *
 * **"Changes nothing" is watched for, not compared.** Writing a document out and reading it back is not exact even
 * when nothing is wrong — the parser drops a newline that opens a `<pre>`, and the serializer does not put it back — so
 * comparing the text would call a harmless chapter unsettled. A `MutationObserver` sees every change the hardening
 * makes to the document, and only those.
 *
 * **The parse here must be the frame's.** Two things could make it differ. Without a doctype, `DOMParser` nests some
 * markup the quirks way, and a frame need not: `serializeBookDoc` always writes one, so both parse in standards mode.
 * And the parse here has scripting off, where the frames on iPhone, iPad and Android have it on: the one
 * element that parses differently for that is `<noscript>`, and `neutralizeLiteralText` leaves none — which is why a
 * `<template>`, whose contents no query here reaches, is removed outright.
 */
export function settleBookHtml(html: string, passes = SETTLING_PASSES): string | null {
  let current = html;
  for (let pass = 0; pass < passes; pass++) {
    const doc = parseBookHtml(current);
    if (!doc) return null;
    const watch = new MutationObserver(() => {});
    watch.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
    hardenBookDoc(doc);
    const changed = watch.takeRecords().length > 0;
    watch.disconnect();
    if (!changed) return current;
    current = serializeBookDoc(doc);
  }
  return null;
}

/** Elements whose start and end break the text into a new paragraph. */
const TEXT_BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);

/** Elements whose text is not part of what the chapter says. */
const NOT_TEXT = new Set(['script', 'style', 'template', 'title']);

/**
 * The chapter's text, a paragraph to each block, with a note first saying why — for a chapter that could not be made
 * safe. Never throws.
 *
 * **Nothing in it can become markup.** It is built as a document holding only `<p>` elements and text, under the same
 * policy as any chapter, and serialized like one: text the serializer escapes, in elements that parse back the same
 * wherever they are. The text is read with an explicit stack rather than recursion, so a book nested deeply enough to
 * overflow the call stack still gives its text.
 *
 * What is lost is the styling, the pictures, and the place of any highlight in the chapter. An ordinary chapter
 * settles, so only a chapter built to get past the hardening is expected to end up here.
 */
export function plainTextChapter(source: string): string {
  const notice = t('book_page.chapter_shown_as_plain_text');
  try {
    const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><head></head><body></body></html>', 'text/html');
    const add = (text: string) => doc.body.appendChild(doc.createElement('p')).append(text);
    add(notice);
    for (const block of textBlocks(source)) add(block);
    hardenBookDoc(doc);
    return serializeBookDoc(doc);
  } catch {
    const escaped = notice.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!DOCTYPE html>\n<html><head><meta http-equiv="Content-Security-Policy" content="${BOOK_CSP}"></head><body><p>${escaped}</p></body></html>`;
  }
}

/** The text of a chapter's body, one string to each block. Empty when the source cannot be read at all. */
function textBlocks(source: string): string[] {
  const blocks: string[] = [];
  let current = '';
  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim();
    if (text) blocks.push(text);
    current = '';
  };
  try {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const root = doc.body ?? doc.documentElement;
    if (!root) return blocks;
    // Each entry is a node to read, or `null` for the end of a block whose start has been read.
    const stack: (Node | null)[] = Array.from(root.childNodes).reverse();
    while (stack.length) {
      const node = stack.pop();
      if (node === null) {
        flush();
        continue;
      }
      if (node === undefined) break;
      if (node.nodeType === Node.TEXT_NODE) {
        current += (node as Text).data;
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const name = (node as Element).localName;
      if (NOT_TEXT.has(name)) continue;
      if (TEXT_BLOCKS.has(name)) {
        flush();
        stack.push(null);
      }
      for (let child = node.lastChild; child; child = child.previousSibling) stack.push(child);
    }
  } catch {
    // whatever was read before the failure is still the chapter's text
  }
  flush();
  return blocks;
}

/** The one parse. Null when the string cannot be parsed at all. */
export function parseBookHtml(html: string): Document | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc?.documentElement ? doc : null;
}

/**
 * Everything `hardenBookHtml` does, in place.
 *
 * Separate from the parse so a caller that has other work to do on the same document — `inlineBlobStylesheets`,
 * which is async and cannot live inside a synchronous function — does not pay for a second parse. That parse is
 * the expensive half: a 1 MB chapter costs 180-230ms, and doubling it would be felt on every display change.
 */
export function hardenBookDoc(doc: Document): void {
  /**
   * The book's own policy goes, and ours goes FIRST in the head — a meta policy governs only what is parsed
   * after it.
   *
   * Dropping any existing one is not strictly required (browsers enforce multiple policies as an intersection,
   * so a book cannot loosen ours by declaring a permissive one) but it makes the result idempotent, which matters
   * because foliate re-renders a document on relayout, and it leaves exactly one policy for anyone debugging.
   *
   * A document whose only policy is already ours, first in the head, is left untouched: `settleBookHtml` reads any
   * change at all as the hardening finding something.
   *
   * `createElement`, not `createEl`: `doc` is the book's own parsed document, which Obsidian never augments. The
   * two prefer-create-el warnings stand; the plugin refuses a disable comment for its own rules.
   */
  const head = doc.head ?? doc.documentElement.insertBefore(doc.createElement('head'), doc.documentElement.firstChild);
  const policies = Array.from(doc.querySelectorAll('meta[http-equiv]')).filter(
    (meta) => meta.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy'
  );
  const ours = policies.length === 1 && policies[0] === head.firstChild && isOurPolicy(policies[0]);
  if (!ours) {
    for (const existing of policies) existing.remove();
    const meta = doc.createElement('meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', BOOK_CSP);
    head.insertBefore(meta, head.firstChild);
  }

  removeExecutable(doc);
  neutralizeLiteralText(doc);
}

/**
 * The stripping layer, shared by a chapter (`hardenBookDoc`) and an SVG file a chapter uses (`hardenSvgText`): every
 * element and attribute that runs code, loads a document of its own, or sends the page somewhere.
 */
function removeExecutable(doc: Document): void {
  // A template's contents are a separate fragment, which no query below reaches, and never drawn. Left in, they go to
  // the frame unexamined — see `settleBookHtml`.
  for (const template of Array.from(doc.querySelectorAll('template'))) template.remove();

  for (const script of Array.from(doc.querySelectorAll('script'))) script.remove();

  // A document inside the chapter is a document this guard never sees — see BOOK_CSP. An object's children are its
  // fallback, which is what a blocked object shows anyway, so they stay; an iframe's are never drawn.
  for (const frame of Array.from(doc.querySelectorAll('iframe, frame, embed'))) frame.remove();
  for (const object of Array.from(doc.querySelectorAll('object'))) object.replaceWith(...Array.from(object.childNodes));

  // A refresh sends the chapter's frame to a web page, and a connection hint reaches the network without a fetch.
  for (const meta of Array.from(doc.querySelectorAll('meta[http-equiv]'))) {
    if (meta.getAttribute('http-equiv')?.toLowerCase() === 'refresh') meta.remove();
  }
  for (const link of Array.from(doc.querySelectorAll('link[rel]'))) {
    const rels = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    if (rels.some((rel) => CONNECTION_HINTS.has(rel))) link.remove();
  }

  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (!isEventHandler(attr.name) && !isJavascriptUrl(attr.value)) continue;
      el.removeAttribute(attr.name);
      if (el.localName === 'a' && isJavascriptUrl(attr.value)) el.setAttribute(SCRIPT_LINK_ATTR, '');
    }
  }

  // An SVG animation can give an element an attribute that no attribute holds: `<set attributeName="href" to="…">`
  // makes a link whose address `findLink` cannot read, and a `values` list can end in a `javascript:` address the
  // attribute check above never sees, since it reads from the start of a value. No book animates a link's address.
  for (const animation of Array.from(doc.querySelectorAll('set, animate'))) {
    const target = (animation.getAttribute('attributeName') ?? '').toLowerCase().replace(/^xlink:/, '');
    if (target === 'href' || isEventHandler(target)) animation.remove();
  }
}

/**
 * An SVG file from the book, as foliate hands it to a chapter: a picture, which runs nothing, but also a document a
 * frame can be sent to, where its script would run under Obsidian's own origin (see `book-copies.ts`). So the copy
 * loses everything `removeExecutable` removes, and its processing instructions — an `xml-stylesheet` can name an XSLT
 * sheet whose output is a page of its own. No policy goes in: an SVG document has no `<meta>` for one.
 *
 * **Parsed and written as XML,** which reads back exactly as it was written, so there is no second parse to disagree
 * with the first, unlike a chapter. A file that does not parse comes back empty: as a picture it was already broken,
 * and as a page it can be nothing but an error.
 */
export function hardenSvgText(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (!doc.documentElement || doc.getElementsByTagName('parsererror').length > 0) return '';
  removeExecutable(doc);
  for (const node of Array.from(doc.childNodes)) {
    if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) node.remove();
  }
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Text the serializer writes as it stands, made unable to become markup.
 *
 * **The hardened document is serialized and parsed again, and the two parses need not agree.** `serializeBookDoc`
 * writes the text of a `<style>`, `<xmp>`, `<noembed>`, `<noframes>` or `<plaintext>` without escaping it, because
 * the parser reads that text raw. Whether the frame's parser reads it raw depends on where the element lands, and the
 * serialized chapter can put it somewhere this parse did not: an `<mglyph>` that this parse moved out in front of a
 * `<table>` is HTML here, and MathML to the frame, which finds it directly inside `<mtext>` — and in MathML an
 * element's text is markup. A `</style>` in a book's stylesheet ends its element anywhere. Either way the frame gets
 * markup the stripping above never saw: a `<meta http-equiv="refresh">`, which no CSP directive governs, sends the
 * chapter to a web page. `<noscript>` is the same problem from the other side: this parse runs with scripting off, so
 * its contents are elements here, and the frames on iPhone, iPad and Android allow scripts, so there they are raw
 * text up to the first `</noscript>` — which a comment inside can hold.
 *
 * So nothing is left whose text could be markup:
 * - a `<style>` keeps its text with every `<` written as a CSS escape (`escapeStyleText`). One in SVG or MathML can
 *   also hold elements and comments, which the serializer writes as markup; the frame can parse that `<style>` as HTML
 *   and read them as its text, so a `</style>` inside a comment ends it. Such a `<style>` is left with its text alone;
 * - `<xmp>` and `<plaintext>` become `<pre>`, which draws the same text and is escaped like any other. Only HTML ones:
 *   inside SVG or MathML their contents are ordinary markup, already escaped, and a `<pre>` put there would take
 *   them out into HTML. Their attributes move across as they are, since copying one by name throws on a name the
 *   parser accepts and the DOM does not, such as `=x`;
 * - `<noembed>` and `<noframes>` go, since browsers never draw their contents;
 * - `<noscript>` gives way to its contents, which are what desktop shows already, its frame running no scripts.
 *
 * These are the ways known so far. `settleBookHtml` catches the ones not yet known.
 */
function neutralizeLiteralText(doc: Document): void {
  for (const style of Array.from(doc.querySelectorAll('style'))) {
    const text = style.textContent ?? '';
    const onlyText = Array.from(style.childNodes).every((node) => node.nodeType === Node.TEXT_NODE);
    if (!onlyText || text.includes('<')) style.textContent = escapeStyleText(text);
  }
  for (const el of Array.from(doc.querySelectorAll('xmp, plaintext'))) {
    if (el.namespaceURI !== HTML_NS) continue;
    const pre = doc.createElement('pre');
    for (const attr of Array.from(el.attributes)) {
      el.removeAttributeNode(attr);
      pre.setAttributeNode(attr);
    }
    pre.append(...Array.from(el.childNodes));
    el.replaceWith(pre);
  }
  for (const el of Array.from(doc.querySelectorAll('noembed, noframes'))) el.remove();
  for (const el of Array.from(doc.querySelectorAll('noscript'))) el.replaceWith(...Array.from(el.childNodes));
}

/**
 * A stylesheet's text with no `<` left in it, meaning what it meant.
 *
 * `\3c ` is the CSS escape for `<`: the same character in a selector, a string or a `url()`. The trailing space ends
 * the escape, so a hex digit after it is not read into the code point. Two spellings need more care:
 * - **A `<` the book already escaped, `\<`,** has its backslash replaced rather than kept: `\\3c ` is an escaped
 *   backslash followed by the text `3c `. Backslashes are counted, since `\\<` is an escaped backslash and a bare `<`.
 * - **`<!--`**, which older books wrap whole stylesheets in, is a token CSS ignores, but `\3c !--` is not, and takes
 *   the rule after it down with it. It becomes a space. Inside a string that drops four characters, the one meaning
 *   given up.
 *
 * **Each `<` is found, then the backslashes before it counted** — a pattern that started at each backslash rescanned
 * a long run of them once per backslash, so a stylesheet of nothing else took minutes. Linear now in the text.
 */
export function escapeStyleText(css: string): string {
  let out = '';
  let from = 0;
  for (let lt = css.indexOf('<'); lt !== -1; lt = css.indexOf('<', from)) {
    let start = lt;
    while (start > from && css.charCodeAt(start - 1) === 0x5c) start--; // backslashes before it, since the last `<`
    const slashes = css.slice(start, lt);
    const cdo = css.startsWith('!--', lt + 1);
    out += css.slice(from, start);
    if (slashes.length % 2 === 1) out += `${slashes.slice(0, -1)}\\3c ${cdo ? '!--' : ''}`;
    else out += cdo ? `${slashes} ` : `${slashes}\\3c `;
    from = lt + 1 + (cdo ? 3 : 0);
  }
  return out + css.slice(from);
}

/**
 * Left on a link whose `javascript:` address was removed, so selecting it can say why nothing opens — see
 * `LinkCheck.watch`. Without an address it is text to foliate, and would otherwise do nothing in silence.
 */
export const SCRIPT_LINK_ATTR = 'data-orbis-script-link';

/** The policy element `hardenBookDoc` writes, and nothing else on it. */
function isOurPolicy(meta: Element): boolean {
  return (
    meta.attributes.length === 2 &&
    meta.getAttribute('http-equiv') === 'Content-Security-Policy' &&
    meta.getAttribute('content') === BOOK_CSP
  );
}

/**
 * Back to a string for `srcdoc`.
 *
 * **Always with `<!DOCTYPE html>`, whatever the book declared**, so that `settleBookHtml` parses exactly as the frame
 * does. Without one, `DOMParser` reads in quirks mode, where a `<table>` does not close an open `<p>`. Measured in
 * Chrome, a `srcdoc` frame without one reports standards mode yet nests the quirks way too — the two happen to agree —
 * and what WebKit does is not measured; with the doctype both read in standards mode on any engine. It changes how
 * nothing nests in ordinary chapters that have no doctype, only in the test book's check for it.
 */
export function serializeBookDoc(doc: Document): string {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}
