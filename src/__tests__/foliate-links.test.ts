// Which element a tap in a chapter follows (ORBIS patch 23). Every link a chapter can hold must reach foliate's link
// handler, so that one leaving the book is shown in "Open this link?" first: an `<area>`, an SVG `xlink:href` and a
// MathML `href` went straight to their address in the chapter's frame.

import { findLink } from 'foliate-js/view.js';
import { describe, expect, it } from 'vitest';

declare const process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string, enc: 'utf8'): string } };

/** A chapter as foliate reads a well-formed one: XHTML, so SVG and MathML elements are in their own namespaces. */
function chapter(body: string): Document {
  return new DOMParser().parseFromString(
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>c</title></head><body>${body}</body></html>`,
    'application/xhtml+xml'
  );
}

const SVG = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
const MATH = 'xmlns="http://www.w3.org/1998/Math/MathML"';

describe('findLink', () => {
  it('follows an ordinary <a href>, from the text inside it', () => {
    const doc = chapter('<p><a href="https://example.com/a"><em id="t">here</em></a></p>');
    const link = findLink(doc.getElementById('t'));
    expect(link?.element.localName).toBe('a');
    expect(link?.href).toBe('https://example.com/a');
  });

  it('follows an image map <area>', () => {
    const doc = chapter(
      '<p><img src="p.png" usemap="#m" alt="p"/></p><map name="m"><area id="t" shape="default" href="https://example.com/area" alt="p"/></map>'
    );
    expect(findLink(doc.getElementById('t'))).toEqual({
      element: doc.getElementById('t'),
      href: 'https://example.com/area',
    });
  });

  it('follows an SVG link written with xlink:href, from the shape inside it', () => {
    const doc = chapter(
      `<svg ${SVG}><a xlink:href="https://example.com/svg"><rect id="t" width="9" height="9"/></a></svg>`
    );
    const link = findLink(doc.getElementById('t'));
    expect(link?.element.localName).toBe('a');
    expect(link?.href).toBe('https://example.com/svg');
  });

  it('follows an SVG link written with href', () => {
    const doc = chapter(`<svg ${SVG}><a href="https://example.com/svg2"><rect id="t" width="9" height="9"/></a></svg>`);
    expect(findLink(doc.getElementById('t'))?.href).toBe('https://example.com/svg2');
  });

  it('follows a MathML element with href, from the token inside it', () => {
    const doc = chapter(`<math ${MATH}><mrow href="https://example.com/math"><mi id="t">x</mi></mrow></math>`);
    const link = findLink(doc.getElementById('t'));
    expect(link?.element.localName).toBe('mrow');
    expect(link?.href).toBe('https://example.com/math');
  });

  it('follows nothing from a picture that is not a link, or an anchor without an address', () => {
    const doc = chapter(
      `<svg ${SVG}><image id="cover" xlink:href="cover.jpg" width="9" height="9"/></svg><p><a id="named">a target</a></p>`
    );
    expect(findLink(doc.getElementById('cover'))).toBeNull();
    expect(findLink(doc.getElementById('named'))).toBeNull();
  });

  it('is what foliate’s click handler asks, not a[href]', () => {
    const source = process.getBuiltinModule('node:fs').readFileSync('src/vendor/foliate-js/view.js', 'utf8');
    expect(source).toContain('const link = findLink(e.target)');
    expect(source).not.toContain("closest('a[href]')");
  });
});
