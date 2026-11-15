// Keyword font sizes scale with the font-size setting once they are `rem`.
//
// An absolute keyword (`small`, `x-large`) is a fixed step from the browser's `medium`, so the `html` percentage the
// setting writes never reaches it: a book that sets every paragraph `small` would ignore the setting entirely.

import { describe, expect, it } from 'vitest';
import { remForFontSize, remForKeyword, scaleKeywordSizes } from '../reader/keyword-sizes';

describe('an absolute keyword as rem', () => {
  it('uses the size browsers render (small = 13px of 16), so 100% looks exactly as it always did', () => {
    expect(remForKeyword('small')).toBe('0.8125rem');
    expect(remForKeyword('large')).toBe('1.125rem');
    expect(remForKeyword('medium')).toBe('1rem');
    expect(remForKeyword('X-Large')).toBe('1.5rem');
    expect(remForKeyword('xx-large')).toBe('2rem');
  });

  it('leaves everything that already scales, and everything that is not a keyword', () => {
    for (const v of ['smaller', 'larger', '1.2em', '90%', '12px', 'inherit', '']) expect(remForKeyword(v)).toBeNull();
  });
});

describe('a chapter’s keyword sizes', () => {
  it('are rewritten in its stylesheets — nested in @media too, and keeping !important — and its inline styles', () => {
    // The page's own document: a parsed one has no window, so no style sheets to walk.
    const doc = document;
    delete doc.documentElement.dataset.orbisRemSizes;
    const style = doc.createElement('style');
    style.textContent = `p.para { font-size: small }
      @media screen { h2 { font-size: x-large !important } }
      .big { font-size: 2em } .note { font-size: smaller }`;
    doc.head.replaceChildren(style);
    // A book's own inline style, as the chapter would arrive with it.
    const page = new DOMParser().parseFromString('<p style="font-size: large">A styled line.</p>', 'text/html');
    doc.body.replaceChildren(doc.importNode(page.body.firstChild as Node, true));
    const p = doc.body.firstChild as HTMLElement;

    scaleKeywordSizes(doc);

    const rules = Array.from((style.sheet as CSSStyleSheet).cssRules);
    const para = rules[0] as CSSStyleRule;
    const h2 = (rules[1] as CSSMediaRule).cssRules[0] as CSSStyleRule;
    expect(para.style.getPropertyValue('font-size')).toBe('0.8125rem');
    expect(h2.style.getPropertyValue('font-size')).toBe('1.5rem');
    expect(h2.style.getPropertyPriority('font-size')).toBe('important');
    expect((rules[2] as CSSStyleRule).style.getPropertyValue('font-size')).toBe('2em');
    expect((rules[3] as CSSStyleRule).style.getPropertyValue('font-size')).toBe('smaller');
    expect(p.style.fontSize).toBe('1.125rem');
  });
});

describe('a <font size> tag, as an older MOBI writes its headings', () => {
  it('takes the rem of the keyword browsers give each size, counting +n and -n from 3 and keeping within 1 to 7', () => {
    expect(remForFontSize('5')).toBe('1.5rem');
    expect(remForFontSize(' 3')).toBe('1rem');
    expect(remForFontSize('+1')).toBe('1.125rem');
    expect(remForFontSize('-2')).toBe('0.625rem');
    expect(remForFontSize('9')).toBe('3rem');
    expect(remForFontSize('-5')).toBe('0.625rem');
  });

  it('takes none where the browser gives the tag none', () => {
    for (const v of ['', 'big', '+', 'x5']) expect(remForFontSize(v)).toBeNull();
  });

  it('is sized from a sheet placed before the book’s own, which any rule of the book’s still wins over', () => {
    const doc = document;
    delete doc.documentElement.dataset.orbisRemSizes;
    const bookSheet = doc.createElement('style');
    bookSheet.textContent = 'p { margin: 0 }';
    doc.head.replaceChildren(bookSheet);
    const page = new DOMParser().parseFromString(
      '<p><font size="5"><b>A HEADING</b></font></p><p><font size="+1">Larger</font><font size="big">Not a size</font></p>',
      'text/html'
    );
    doc.body.replaceChildren(...Array.from(page.body.childNodes, (n) => doc.importNode(n, true)));

    scaleKeywordSizes(doc);

    const [heading, larger, notASize] = Array.from(doc.querySelectorAll<HTMLElement>('font'));
    expect(heading.dataset.orbisFontSize).toBe('1.5rem');
    expect(larger.dataset.orbisFontSize).toBe('1.125rem');
    expect(notASize.dataset.orbisFontSize).toBeUndefined();
    const first = doc.head.firstElementChild as HTMLStyleElement;
    expect(first).not.toBe(bookSheet);
    expect(first.textContent).toContain(':where(font[data-orbis-font-size="1.5rem"]) { font-size: 1.5rem; }');
    expect(first.textContent).toContain(':where(font[data-orbis-font-size="1.125rem"]) { font-size: 1.125rem; }');
  });
});
