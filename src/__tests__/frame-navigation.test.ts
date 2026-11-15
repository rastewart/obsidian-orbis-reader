// A chapter's frame holds its chapter, and the copies foliate makes of a book's files run nothing.
//
// Found with fixtures/frame-navigation.epub: a link `findLink` could not see — a `<use>` copy, an animated address —
// sent the chapter's frame to a document the guard never hardened, and on iPhone and iPad its script ran in
// Obsidian's window. Four layers answer it, each tested here on its own: the frame refuses every navigation
// (`keepChapterInPlace`), a tap inside SVG with no readable link does nothing (ORBIS patch 27), the copies cannot run
// anything (`hardenBookCopies`, `hardenSvgText`), and the stripping removes animated addresses. The sandbox change for
// Android is in foliate-patches.test.ts.

import { insideSvg } from 'foliate-js/view.js';
import { describe, expect, it } from 'vitest';
import { copyType, hardenBookCopies, PLAIN_TEXT_COPY } from '../reader/book-copies';
import { hardenBookHtml, hardenSvgText } from '../reader/book-html-guard';
import { keepChapterInPlace } from '../reader/chapter-navigation';

const SVG = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

/** A chapter as foliate reads a well-formed one: XHTML, so SVG elements are in their own namespace. */
function chapter(body: string): Document {
  return new DOMParser().parseFromString(
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>c</title></head><body>${body}</body></html>`,
    'application/xhtml+xml'
  );
}

describe('a tap inside SVG (ORBIS patch 27)', () => {
  it('is inside SVG on a <use> copy of a link, which findLink cannot read', () => {
    const doc = chapter(
      `<svg ${SVG}><defs><a id="l" xlink:href="x.xhtml"><rect/></a></defs><use id="t" href="#l"/></svg>`
    );
    expect(insideSvg(doc.getElementById('t'))).toBe(true);
  });

  it('is inside SVG on a shape in a link whose address an animation supplies', () => {
    const doc = chapter(`<svg ${SVG}><a><set attributeName="href" to="x"/><rect id="t"/></a></svg>`);
    expect(insideSvg(doc.getElementById('t'))).toBe(true);
  });

  it('is inside SVG on HTML in a <foreignObject>, though the tapped element is HTML', () => {
    const doc = chapter(
      `<svg ${SVG}><a><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" id="t">text</div></foreignObject></a></svg>`
    );
    expect(insideSvg(doc.getElementById('t'))).toBe(true);
  });

  it('is inside SVG when a <label> or <summary> holds the drawing: neither is an exception', () => {
    const doc = chapter(`<details><summary><svg ${SVG}><use id="t" href="#l"/></svg></summary></details>`);
    expect(insideSvg(doc.getElementById('t'))).toBe(true);
  });

  it('is not inside SVG on ordinary text, a checkbox or a summary, so their taps work as before', () => {
    const doc = chapter(
      '<p id="p">text</p><input id="c" type="checkbox"/><details><summary id="s">More</summary><p>hidden</p></details>'
    );
    for (const id of ['p', 'c', 's']) expect(insideSvg(doc.getElementById(id))).toBe(false);
  });
});

/** A window whose chapter fires `navigate` events, as the Navigation API does. */
function chapterWindow(): { win: Window; navigate: (url: string) => Event } {
  const navigation = new EventTarget();
  return {
    win: { navigation } as unknown as Window,
    navigate: (url: string) => {
      const event = new Event('navigate', { cancelable: true });
      Object.defineProperty(event, 'destination', { value: { url } });
      navigation.dispatchEvent(event);
      return event;
    },
  };
}

describe('keepChapterInPlace', () => {
  it('refuses a navigation to a copy of a book file, a web page or an Obsidian action, and says so', () => {
    const { win, navigate } = chapterWindow();
    const lines: string[] = [];
    expect(keepChapterInPlace(win, (msg) => lines.push(msg))).toBe(true);
    for (const url of ['blob:app://obsidian.md/0ab9', 'https://example.com/use-link', 'obsidian://search?query=x']) {
      expect(navigate(url).defaultPrevented).toBe(true);
    }
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('obsidian://search?query=x');
  });

  it('lets a chapter load from srcdoc, the one address Orbis loads chapters from', () => {
    const { win, navigate } = chapterWindow();
    keepChapterInPlace(win, () => {});
    expect(navigate('about:srcdoc').defaultPrevented).toBe(false);
  });

  it('says when the engine has no Navigation API, so the caller can report it', () => {
    expect(keepChapterInPlace({} as Window, () => {})).toBe(false);
    expect(keepChapterInPlace(null, () => {})).toBe(false);
  });
});

describe('copyType', () => {
  it('keeps the type of what can only be drawn, played or used: pictures, sound, video, fonts, stylesheets', () => {
    for (const type of [
      'image/jpeg',
      'image/png',
      'audio/mpeg',
      'video/mp4',
      'font/woff2',
      'application/vnd.ms-opentype',
      'application/font-woff',
      'application/octet-stream',
      'text/css',
      'image/svg+xml',
    ]) {
      expect(copyType(type)).toBe(type);
    }
  });

  it('serves as plain text anything a frame would show as a page: HTML, XHTML and every XML type', () => {
    for (const type of [
      'application/xhtml+xml',
      'text/html',
      'application/xml',
      'text/xml',
      'application/x-dtbncx+xml',
      'application/mathml+xml',
      'text/xsl',
      'text/javascript',
      'application/x-something-new',
    ]) {
      expect(copyType(type)).toBe(PLAIN_TEXT_COPY);
    }
  });

  it('serves a copy with no type as plain text, rather than leave it to be sniffed', () => {
    expect(copyType('')).toBe(PLAIN_TEXT_COPY);
    expect(copyType(undefined)).toBe(PLAIN_TEXT_COPY);
  });

  it('reads the type without its parameters or case', () => {
    expect(copyType('Image/PNG')).toBe('Image/PNG');
    expect(copyType('Application/XHTML+XML; charset=utf-8')).toBe(PLAIN_TEXT_COPY);
  });
});

/** A book with foliate's `data` event, and a copy made through it, as `createURL` makes one. */
async function copyOf(data: unknown, type: string): Promise<{ data: unknown; type: string }> {
  const transformTarget = new EventTarget();
  expect(hardenBookCopies({ transformTarget })).toBe(true);
  const detail = { data, type };
  transformTarget.dispatchEvent(new CustomEvent('data', { detail }));
  return { data: await detail.data, type: detail.type };
}

describe('hardenBookCopies', () => {
  it('turns a chapter’s copy into plain text, keeping its words for the reader to read', async () => {
    const xhtml = '<html><body><p>Words</p><script>parent.x=1</script></body></html>';
    expect(await copyOf(xhtml, 'application/xhtml+xml')).toEqual({ data: xhtml, type: PLAIN_TEXT_COPY });
  });

  it('takes the script out of an SVG copy, whether foliate hands over text, a Blob or bytes', async () => {
    const svg = `<svg ${SVG}><script>parent.x=1</script><rect width="4" height="4"/></svg>`;
    for (const data of [svg, new Blob([svg]), new TextEncoder().encode(svg)]) {
      const copy = await copyOf(data, 'image/svg+xml');
      expect(copy.type).toBe('image/svg+xml');
      expect(copy.data).not.toContain('script');
      expect(copy.data).toContain('<rect');
    }
  });

  it('leaves a picture’s bytes and type alone', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    expect(await copyOf(bytes, 'image/jpeg')).toEqual({ data: bytes, type: 'image/jpeg' });
  });

  it('says so for a format with no data event', () => {
    expect(hardenBookCopies({})).toBe(false);
    expect(hardenBookCopies(null)).toBe(false);
  });
});

describe('hardenSvgText', () => {
  it('removes scripts, in SVG and in XHTML inside a foreignObject', () => {
    const out = hardenSvgText(
      `<svg ${SVG}><script>a()</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><script>b()</script></div></foreignObject></svg>`
    );
    expect(out).not.toContain('a()');
    expect(out).not.toContain('b()');
  });

  it('removes handlers, script addresses and frames', () => {
    const out = hardenSvgText(
      `<svg ${SVG} onload="a()"><a xlink:href="javascript:b()"><rect/></a><foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" src="x"/></foreignObject></svg>`
    );
    expect(out).not.toContain('onload');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('iframe');
  });

  it('removes an animation that writes a link address or a handler, and keeps one that moves a shape', () => {
    const out = hardenSvgText(
      `<svg ${SVG}><a><set attributeName="href" to="x"/><animate attributeName="xlink:href" values="a;javascript:b()"/><animate attributeName="onclick" to="c()"/><rect><animate attributeName="x" to="9"/></rect></a></svg>`
    );
    expect(out).not.toContain('<set');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('onclick');
    expect(out).toContain('attributeName="x"');
  });

  it('removes processing instructions, such as an xml-stylesheet naming an XSLT sheet', () => {
    const out = hardenSvgText(`<?xml-stylesheet type="text/xsl" href="x.xsl"?><svg ${SVG}><rect/></svg>`);
    expect(out).not.toContain('xml-stylesheet');
    expect(out).toContain('<rect');
  });

  it('keeps an ordinary picture as it was drawn', () => {
    const out = hardenSvgText(`<svg ${SVG} viewBox="0 0 4 4"><image xlink:href="blob:x"/><rect fill="#123"/></svg>`);
    expect(out).toContain('viewBox="0 0 4 4"');
    expect(out).toContain('xlink:href="blob:x"');
    expect(out).toContain('fill="#123"');
  });

  it('gives back nothing for a file that does not parse, which as a page could only be an error', () => {
    expect(hardenSvgText('<svg><unclosed></svg>')).toBe('');
  });
});

describe('a chapter’s animated link addresses', () => {
  it('are removed by the stripping, so a link has no address the link handler cannot read', () => {
    const out = hardenBookHtml(
      `<!DOCTYPE html><html><head></head><body><svg ${SVG}><a><set attributeName="href" to="obsidian://search"/><rect/></a></svg></body></html>`
    );
    expect(out).not.toContain('<set');
    expect(out).not.toContain('obsidian://');
    expect(out).toContain('<rect');
  });
});
