// A book is a file someone sent you, and EPUB/MOBI/FB2 all carry HTML.
//
// These assert the two layers separately, because they exist to cover each other: the CSP is what stops code we
// did not think to strip, and the stripping is what survives a document where a `<meta>` policy never applies.

import { describe, expect, it, vi } from 'vitest';
import {
  escapeStyleText,
  hardenBookDoc,
  hardenBookHtml,
  type PreparedChapter,
  plainTextChapter,
  prepareBookDoc,
  prepareBookHtml,
  SCRIPT_LINK_ATTR,
  serializeBookDoc,
  settleBookHtml,
} from '../reader/book-html-guard';

const doc = (body: string, head = ''): string => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

describe('the CSP', () => {
  it('forbids script, objects, base and form submission', () => {
    // `object-src` and the rest are still named although `default-src` would cover them: a reader of the policy should
    // not need to know the fallback rules to see that a book cannot run anything.
    const out = hardenBookHtml(doc('<p>Hello</p>'));
    expect(out).toContain('http-equiv="Content-Security-Policy"');
    expect(out).toContain("script-src 'none'");
    expect(out).toContain("object-src 'none'");
    expect(out).toContain("base-uri 'none'");
    expect(out).toContain("form-action 'none'");
  });

  /** A meta policy governs only what is parsed AFTER it, so its position is the whole of its effectiveness. */
  it('is the first thing in the head', () => {
    const out = hardenBookHtml(doc('<p>Hi</p>', '<title>Chapter</title><link rel="stylesheet" href="s.css">'));
    const csp = out.indexOf('Content-Security-Policy');
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(out.indexOf('<title>'));
    expect(csp).toBeLessThan(out.indexOf('<link'));
  });

  it('gives a document with no head one to put it in', () => {
    const out = hardenBookHtml('<p>No head, no html, just markup.</p>');
    expect(out).toContain('Content-Security-Policy');
    expect(out).toContain('No head');
  });

  /** Nothing loads from outside the book. A frame from inside it is the iPhone and iPad hole: foliate turns a nested
   *  `<iframe src>` into a `blob:` document that takes Obsidian's policy, not this one, and runs where the reader's
   *  frame allows scripts. */
  it('refuses everything by default, frames included', () => {
    const out = hardenBookHtml(doc('<p>x</p>'));
    expect(out).toContain("default-src 'none'");
    expect(out).toContain("frame-src 'none'");
    expect(out).toContain("child-src 'none'");
  });

  /** What foliate hands over is `blob:` and `data:` — it rewrites every resource inside the book to one — plus the
   *  inline styles Orbis writes. Those, and only those, are allowed: a remote image is a request to whoever made the
   *  book, sent when the reader turns to the page. A CSP that broke rendering would be turned off by the first person
   *  it inconvenienced, so the book's own pictures, styles and fonts must still load. */
  it("allows the book's own pictures, styles, fonts and media, and nothing from the network", () => {
    const out = hardenBookHtml(doc('<img src="blob:app://obsidian.md/1"><p style="color:red">x</p>'));
    const policy = /content="([^"]*)"/.exec(out)?.[1] ?? '';
    expect(policy).toContain('img-src blob: data:');
    expect(policy).toContain('font-src blob: data:');
    expect(policy).toContain('media-src blob: data:');
    expect(policy).toContain("style-src 'unsafe-inline' blob: data:");
    expect(policy).not.toMatch(/https?:|\*/);
    expect(out).toContain('blob:app://obsidian.md/1');
    expect(out).toContain('color:red');
  });
});

describe('stripping what loads another document', () => {
  it('removes iframes and frames, srcdoc included', () => {
    const out = hardenBookHtml(
      doc('<p>before</p><iframe src="blob:x"></iframe><iframe srcdoc="&lt;p&gt;x&lt;/p&gt;"></iframe><p>after</p>')
    );
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('srcdoc');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  /** An object's children are its fallback, which is what a blocked object shows anyway — a picture in place of an
   *  SVG it could not load — so they are kept. */
  it('replaces an object with its fallback, and removes an embed', () => {
    const out = hardenBookHtml(doc('<object data="a.svg"><img src="blob:fallback"></object><embed src="b.swf">'));
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<embed');
    expect(out).toContain('blob:fallback');
  });

  it('removes a meta refresh, which would send the chapter frame to a web page', () => {
    const out = hardenBookHtml(doc('<p>x</p>', '<meta http-equiv="Refresh" content="0;url=https://example.invalid/">'));
    expect(out).not.toContain('example.invalid');
  });

  /** DNS prefetching is not a fetch, so no CSP directive governs it. */
  it('removes prefetch and preconnect hints, and keeps stylesheets', () => {
    const hints = ['dns-prefetch', 'preconnect', 'prefetch', 'preload', 'prerender', 'modulepreload']
      .map((rel) => `<link rel="${rel}" href="https://${rel}.example.invalid/">`)
      .join('');
    const out = hardenBookHtml(doc('<p>x</p>', `${hints}<link rel="stylesheet" href="blob:s">`));
    expect(out).not.toContain('example.invalid');
    expect(out).toContain('blob:s');
  });
});

describe('stripping what executes', () => {
  it('removes inline scripts', () => {
    const out = hardenBookHtml(doc('<p id="a">safe</p><script>document.title = "ran"</script>'));
    expect(out).not.toContain('<script');
    expect(out).not.toContain('document.title');
    expect(out).toContain('safe');
  });

  it('removes external scripts', () => {
    const out = hardenBookHtml(doc('<script src="payload.js"></script><p>text</p>'));
    expect(out).not.toContain('payload.js');
    expect(out).toContain('text');
  });

  it('removes event handlers wherever they sit', () => {
    const out = hardenBookHtml(
      doc('<div onclick="a()">c</div><img src="x.png" onerror="b()"><svg onload="d()"></svg>', '')
    );
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('onload');
    // The elements themselves stay — only what runs is taken.
    expect(out).toContain('<div');
    expect(out).toContain('x.png');
  });

  it('removes a handler on body, which the parser moves out of a malformed head', () => {
    const out = hardenBookHtml('<html><body onload="go()"><p>t</p></body></html>');
    expect(out).not.toContain('onload');
    expect(out).toContain('<p>t</p>');
  });

  it('removes javascript: URLs', () => {
    const out = hardenBookHtml(doc('<a href="javascript:alert(1)">tap</a>'));
    expect(out).not.toContain('javascript:');
    expect(out).toContain('tap'); // the link's text is content, and content is kept
  });

  /**
   * The URL parser ignores leading whitespace and C0 controls, and tolerates them INSIDE the scheme, so
   * `java\tscript:` is a live URL that a naive `startsWith('javascript:')` waves through.
   */
  it('removes javascript: URLs hiding behind whitespace and control characters', () => {
    expect(hardenBookHtml(doc('<a href="  javascript:x()">a</a>'))).not.toContain('javascript');
    expect(hardenBookHtml(doc('<a href="java\tscript:x()">a</a>'))).not.toContain('script:');
    expect(hardenBookHtml(doc('<a href="JaVaScRiPt:x()">a</a>'))).not.toMatch(/javascript/i);
  });

  it('leaves ordinary links and anchors alone', () => {
    const out = hardenBookHtml(doc('<a href="chapter2.xhtml#top">next</a>'));
    expect(out).toContain('chapter2.xhtml#top');
    expect(out).not.toContain(SCRIPT_LINK_ATTR);
  });

  // Without its address the link is text to foliate, and selecting it would do nothing in silence; the marker is
  // what lets the reader say why. See `LinkCheck.watch`.
  it('marks a link whose script address it removed, however the scheme is spelled', () => {
    for (const href of ['javascript:x()', 'JAVASCRIPT:x()', 'java\tscript:x()']) {
      expect(hardenBookHtml(doc(`<a href="${href}">a</a>`))).toContain(`<a ${SCRIPT_LINK_ATTR}="">a</a>`);
    }
  });

  it('marks only links — a script address elsewhere is just removed', () => {
    const out = hardenBookHtml(doc('<img src="javascript:x()" alt="">'));
    expect(out).not.toContain('javascript');
    expect(out).not.toContain(SCRIPT_LINK_ATTR);
  });
});

/**
 * The hardened chapter is serialized and parsed again by the frame, and markup can come back from text on the way:
 * see `neutralizeLiteralText`. So these parse the output again and look there, because the hardened document itself
 * holds nothing to find — the payload is text in it.
 */
describe('text the serializer writes as it stands', () => {
  const reparse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
  const REFRESH = '<meta http-equiv="refresh" content="0;url=https://example.invalid/"><p id="payload">x</p>';
  const inMath = (tag: string) =>
    `<math><mtext><table><mglyph><${tag}>${REFRESH}</${tag}></mglyph></table></mtext></math>`;

  it('keeps markup in a <style> under MathML from coming back as markup', () => {
    const again = reparse(hardenBookHtml(doc(inMath('style'))));
    expect(again.querySelector('meta[http-equiv="refresh" i]')).toBeNull();
    expect(again.getElementById('payload')).toBeNull();
  });

  it('keeps markup in an <xmp> under MathML from coming back as markup, and still shows its text', () => {
    const out = hardenBookHtml(doc(inMath('xmp')));
    const again = reparse(out);
    expect(again.querySelector('meta[http-equiv="refresh" i]')).toBeNull();
    expect(again.getElementById('payload')).toBeNull();
    expect(out).not.toContain('<xmp');
    expect(again.querySelector('pre')?.textContent).toContain('<p id="payload">');
  });

  it('turns <plaintext> into <pre>, and removes <noembed> and <noframes>', () => {
    for (const tag of ['plaintext', 'noembed', 'noframes']) {
      const again = reparse(hardenBookHtml(doc(inMath(tag))));
      expect(again.querySelector('meta[http-equiv="refresh" i]'), tag).toBeNull();
      expect(again.querySelector(tag), tag).toBeNull();
    }
  });

  /** On iPhone, iPad and Android the frame allows scripts, and parses `<noscript>`'s contents as raw text up to the
   *  first `</noscript>` — a comment can hold one. This parse cannot run with scripting on, so the test is that no
   *  `<noscript>` is left to be parsed that way, and that what it held is still there. */
  it('replaces <noscript> with its contents', () => {
    const out = hardenBookHtml(doc(`<noscript><!--</noscript>${REFRESH}--><p>Shown without scripts</p></noscript>`));
    expect(out).not.toContain('<noscript');
    expect(out).toContain('<p>Shown without scripts</p>');
  });

  it('leaves a stylesheet with no "<" exactly as it was', () => {
    const css = 'p { color: red } a[href^="x"]::after { content: "→" }';
    expect(hardenBookHtml(doc('<p>x</p>', `<style>${css}</style>`))).toContain(`<style>${css}</style>`);
  });

  /** Not byte-for-byte idempotent here, and cannot be: parsing the output is what moves `<mglyph>` into MathML, so a
   *  second pass starts from a different tree. What must hold is that nothing gets through on that pass either. */
  it('lets nothing through when its own output is hardened again', () => {
    const once = hardenBookHtml(doc(`${inMath('style')}${inMath('xmp')}<noscript><p>n</p></noscript>`));
    const again = reparse(hardenBookHtml(once));
    expect(again.querySelector('meta[http-equiv="refresh" i]')).toBeNull();
    expect(again.getElementById('payload')).toBeNull();
    expect(again.querySelector('noscript')).toBeNull();
  });

  /**
   * The ways in from the second review of the fix. Each is checked against ONE pass of the hardening, without
   * `settleBookHtml`, because one pass is the layer each fix lives in: settling would catch most of them anyway, and a
   * test through it would pass with the fix taken out.
   */
  const onePass = (html: string): string => {
    const parsed = reparse(html);
    hardenBookDoc(parsed);
    return serializeBookDoc(parsed);
  };
  const expectNothingBack = (html: string, what: string) => {
    const again = reparse(html);
    expect(again.querySelector('meta[http-equiv="refresh" i]'), what).toBeNull();
    expect(again.getElementById('payload'), what).toBeNull();
  };
  const COMMENTED = `<style><!--</style>${REFRESH}--></style>`;

  it('leaves <xmp> and <plaintext> inside SVG or MathML alone, where their contents are markup already', () => {
    for (const wrap of ['svg', 'math']) {
      for (const tag of ['xmp', 'plaintext']) {
        const out = onePass(doc(`<${wrap}><${tag}>${COMMENTED}</${tag}></${wrap}>`));
        expectNothingBack(out, `${wrap} > ${tag}`);
        // The <style> rewrite stops this payload as well, so the element itself is checked: a <pre> in its place
        // would carry whatever it held out of SVG or MathML into HTML.
        expect(out, `${wrap} > ${tag}`).toContain(`<${tag}>`);
      }
    }
  });

  it("moves an <xmp>'s attributes to its <pre>, even one the DOM refuses by name", () => {
    const again = reparse(onePass(doc('<xmp =x class="kept">hi</xmp>')));
    expect(again.querySelector('pre.kept')?.textContent).toBe('hi');
  });

  it('removes <template>, whose contents nothing in the hardening reaches', () => {
    const inTemplate = `<template><math><mtext><table><mglyph><style></template>${REFRESH}</style></mglyph></table></mtext></math></template>`;
    expectNothingBack(onePass(doc(inTemplate)), 'MathML in a template');
    // The noscript form gets through only with scripting on, which this parse cannot do: so, nothing left to try.
    const out = onePass(doc(`<template><noscript><!--</noscript></template>${REFRESH}--></noscript></template>`));
    expect(out).not.toContain('<template');
    expect(out).not.toContain('<noscript');
  });

  it('rewrites an SVG <style> holding a comment, so the comment cannot end it', () => {
    const nested = `<math><mtext><table><mglyph><svg><mtext>${COMMENTED}</mtext></svg></mglyph></table></mtext></math>`;
    expectNothingBack(onePass(doc(nested)), 'svg style under mglyph');
  });
});

/**
 * `settleBookHtml` checks the hardened chapter against the document the frame will build from it. The input here is
 * written as if the hardening had missed a trick: as text it holds no refresh, and parsed once more it does.
 */
describe('settling', () => {
  const refreshIn = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html').querySelector('meta[http-equiv="refresh" i]');
  const missed = `<!DOCTYPE html><html><head></head><body><math><mtext><mglyph><style><meta http-equiv="refresh" content="0;url=https://example.invalid/"></style></mglyph></mtext></math><p>t</p></body></html>`;

  it('hardens what the frame would parse out of a chapter the hardening approved', () => {
    expect(refreshIn(missed)).not.toBeNull(); // the trick works on its own
    const settled = settleBookHtml(missed);
    expect(settled).not.toBeNull();
    expect(refreshIn(settled ?? '')).toBeNull();
  });

  it('gives null when the hardening is still changing it after the passes allowed', () => {
    expect(settleBookHtml(missed, 1)).toBeNull();
  });

  it('returns an ordinary hardened chapter as it is, at the first check', () => {
    const once = hardenBookHtml(doc('<h1>One</h1><p>Two</p>', '<style>p { margin: 0 }</style>'));
    expect(settleBookHtml(once, 1)).toBe(once);
  });

  /** Reading a chapter back is not exact even when nothing is wrong: the parser drops the newline that opens a <pre>,
   *  and the serializer does not write it back. Settling must not count that as the hardening finding something. */
  it('settles a chapter whose text changes harmlessly on the way back, such as a <pre> opening with blank lines', () => {
    const lines = '\n'.repeat(4);
    for (const html of [
      `<pre>${lines}code</pre>`,
      `<listing>${lines}code</listing>`,
      `<textarea>${lines}text</textarea>`,
      `<xmp>\n\n\ncode</xmp>`,
    ]) {
      expect(prepareBookHtml(doc(html)).plainText, html).toBeUndefined();
    }
  });

  it('makes no change at all to a chapter it has already hardened', () => {
    const parsed = new DOMParser().parseFromString(hardenBookHtml(doc('<p onclick="x()">t</p>')), 'text/html');
    const watch = new MutationObserver(() => {});
    watch.observe(parsed, { subtree: true, childList: true, attributes: true, characterData: true });
    hardenBookDoc(parsed);
    expect(watch.takeRecords()).toEqual([]);
    watch.disconnect();
  });

  /** A srcdoc frame is never in quirks mode; DOMParser is, without a doctype. Settling has to parse as the frame. */
  it('writes a doctype into every chapter, so settling parses as the frame does', () => {
    for (const html of [
      '<html><body><p>x</p></body></html>',
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "x"><p>x</p>',
    ]) {
      const out = hardenBookHtml(html);
      expect(out, html).toMatch(/^<!DOCTYPE html>\n/);
      expect(new DOMParser().parseFromString(out, 'text/html').compatMode, html).toBe('CSS1Compat');
    }
  });
});

describe('a chapter that cannot be made safe is shown as its text', () => {
  const NOTICE = 'Orbis Reader shows this chapter as plain text';
  const reparse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
  const paragraphs = (html: string) => Array.from(reparse(html).querySelectorAll('p'), (p) => p.textContent);

  it('leaves an ordinary chapter as its own markup', () => {
    const chapter = prepareBookHtml(doc('<p>x</p>'));
    expect(chapter.plainText).toBeUndefined();
    expect(chapter.html).toContain('<p>x</p>');
  });

  // No chapter known needs more than the first pass, so none is known that never settles: no passes forces the case.
  it('gives the text when the chapter does not settle', () => {
    const source = doc('<p>Before</p><p>After</p>');
    const chapter = prepareBookDoc(reparse(source), source, 0);
    expect(chapter.plainText).toBe('unsettled');
    expect(paragraphs(chapter.html)[0]).toContain(NOTICE);
    expect(paragraphs(chapter.html)).toContain('Before');
  });

  it('gives the text when a step throws', () => {
    const chapter = prepareBookDoc({} as Document, doc('<p>Some text</p>'));
    expect(chapter.plainText).toBe('failed');
    expect(paragraphs(chapter.html)).toEqual([expect.stringContaining(NOTICE), 'Some text']);
  });

  it('still gives the note when nothing can be parsed at all', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => {
      throw new Error('no parser');
    });
    let chapter: PreparedChapter;
    try {
      chapter = prepareBookHtml(doc('<p>t</p>'));
    } finally {
      parse.mockRestore();
    }
    expect(chapter.plainText).toBe('unparseable');
    expect(paragraphs(chapter.html)[0]).toContain(NOTICE);
    expect(settleBookHtml(chapter.html, 1)).toBe(chapter.html);
  });

  it('puts the note first, then a paragraph for each block, without scripts or styles', () => {
    const out = plainTextChapter(
      doc('<h1>One</h1><div><p>Two</p>Three <em>and</em> more</div><script>no()</script><style>p{}</style>')
    );
    expect(paragraphs(out)).toEqual([expect.stringContaining(NOTICE), 'One', 'Two', 'Three and more']);
  });

  it('holds nothing that can become markup, and settles at the first check', () => {
    const out = plainTextChapter(
      doc('<p>&lt;/p&gt;&lt;meta http-equiv="refresh" content="0"&gt;</p><xmp><meta http-equiv="refresh"></xmp>')
    );
    const again = reparse(out);
    expect(again.querySelector('meta[http-equiv="refresh" i]')).toBeNull();
    expect(Array.from(again.body.querySelectorAll('*'), (el) => el.localName)).toEqual(['p', 'p', 'p']);
    expect(settleBookHtml(out, 1)).toBe(out);
  });

  it('reads the text of a deeply nested chapter', () => {
    const deep = `${'<div>'.repeat(1000)}deep${'</div>'.repeat(1000)}`;
    expect(paragraphs(plainTextChapter(doc(deep)))).toContain('deep');
  });
});

/** `\3c ` is what CSS reads as `<`. The cases are the spellings where writing it naively changes what a sheet means. */
describe('escapeStyleText', () => {
  it('writes every bare "<" as the escape, with the space that ends it', () => {
    expect(escapeStyleText('a<b { content: "<" } x { background: url(a<b) }')).toBe(
      'a\\3c b { content: "\\3c " } x { background: url(a\\3c b) }'
    );
  });

  it('replaces the backslash of a "<" the book already escaped, rather than escaping the backslash', () => {
    expect(escapeStyleText('.a\\<b { content: "\\<" }')).toBe('.a\\3c b { content: "\\3c " }');
  });

  it('counts backslashes: an escaped backslash before a "<" leaves the "<" bare', () => {
    expect(escapeStyleText('p { content: "\\\\<" }')).toBe('p { content: "\\\\\\3c " }');
  });

  /** An older book's whole sheet can sit in `<!-- -->`. CSS ignores the opener; `\3c !--` would cost the next rule. */
  it('turns the "<!--" that wraps an old stylesheet into a space', () => {
    expect(escapeStyleText('<!--\np { color: red }\n-->')).toBe(' \np { color: red }\n-->');
  });

  it('leaves text with no "<" alone', () => {
    expect(escapeStyleText('p { color: red }')).toBe('p { color: red }');
  });
});

describe('what it does not damage', () => {
  it('keeps a doctype, so the book renders in standards mode as it would anyway in the frame', () => {
    expect(hardenBookHtml(doc('<p>x</p>'))).toMatch(/^<!DOCTYPE html>/);
  });

  it('keeps the text of a chapter intact', () => {
    const prose = 'On an unusually cold morning late in March a young woman walked down to the ferry.';
    expect(hardenBookHtml(doc(`<p>${prose}</p>`))).toContain(prose);
  });

  /** A book can declare its own policy. It cannot loosen ours — browsers intersect them — but leaving both makes
   *  the output non-idempotent and gives anyone debugging two policies to reason about. */
  it("drops the book's own CSP and keeps one policy", () => {
    const out = hardenBookHtml(
      doc('<p>x</p>', `<meta http-equiv="Content-Security-Policy" content="script-src * 'unsafe-inline'">`)
    );
    expect(out).not.toContain('script-src *');
    expect(out.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it('is idempotent — hardening an already-hardened chapter changes nothing further', () => {
    const once = hardenBookHtml(doc('<p onclick="x()">t</p><script>y()</script>'));
    expect(hardenBookHtml(once)).toBe(once);
  });
});
