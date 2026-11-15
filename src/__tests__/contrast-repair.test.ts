// Text a theme alone leaves unreadable — on a book's own background, or in a book's own color — is given a color that
// reads, and nothing else is touched. See src/reader/contrast-repair.ts and fixtures/contrast-checks.epub.

import { describe, expect, it } from 'vitest';
import {
  contrastOf,
  inFixedLayout,
  MIN_CONTRAST,
  parseColor,
  readableOn,
  repairContrast,
  type StyleOf,
} from '../reader/contrast-repair';

const DARK = { bg: '#1a2238', fg: '#d8dce6', link: '#8ab4f8' };
const LIGHT = { bg: '#ffffff', fg: '#1a1a1a' };

/**
 * A chapter, and a cascade small enough to trust: an element's text color is its own inline color or its parent's,
 * with the theme's on `body`; its background is its own inline one. That is what the browser computes for the markup
 * these tests write, without asking jsdom for a cascade it does not fully implement.
 */
function chapter(body: string, theme: { fg: string }): { doc: Document; styleOf: StyleOf } {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${body}</body></html>`, 'text/html');
  const styleOf: StyleOf = (el) => {
    let color = '';
    for (let e: Element | null = el; e && !color; e = e.parentElement) color = (e as HTMLElement).style.color;
    return {
      color: color || theme.fg,
      backgroundColor: (el as HTMLElement).style.backgroundColor || 'rgba(0, 0, 0, 0)',
      backgroundImage: (el as HTMLElement).style.backgroundImage || 'none',
      position: (el as HTMLElement).style.position || 'static',
    };
  };
  return { doc, styleOf };
}

const colorOf = (doc: Document, id: string) => (doc.getElementById(id) as HTMLElement).style.color;

describe('repairContrast', () => {
  it('gives a pale box’s inherited light text the dark theme’s page color', () => {
    const { doc, styleOf } = chapter('<div style="background: #f5eefa"><p id="t">Words</p></div>', DARK);
    expect(repairContrast(doc, DARK, styleOf).repaired).toBe(1);
    expect(parseColor(colorOf(doc, 't'))).toEqual(parseColor(DARK.bg));
  });

  it('gives a dark box’s inherited dark text the light theme’s page color', () => {
    const { doc, styleOf } = chapter('<div style="background: #1f2a44"><p id="t">Words</p></div>', LIGHT);
    repairContrast(doc, LIGHT, styleOf);
    expect(parseColor(colorOf(doc, 't'))).toEqual(parseColor(LIGHT.bg));
  });

  it('gives the book’s own dark gray on a dark page the theme’s text color', () => {
    const { doc, styleOf } = chapter('<p id="t" style="color: #555555">Words</p>', DARK);
    repairContrast(doc, DARK, styleOf);
    expect(parseColor(colorOf(doc, 't'))).toEqual(parseColor(DARK.fg));
  });

  it('leaves text that reads alone: the theme’s own, a box with its own colors, a soft gray above the line', () => {
    const { doc, styleOf } = chapter(
      '<p id="a">Theme text</p><div style="background: #fff59d; color: #222222"><p id="b">Own colors</p></div>' +
        '<p id="c" style="color: #777777">Caption</p>',
      LIGHT
    );
    expect(repairContrast(doc, LIGHT, styleOf).repaired).toBe(0);
    expect(colorOf(doc, 'a')).toBe('');
  });

  it('measures a see-through box over the page behind it', () => {
    const { doc, styleOf } = chapter(
      '<div style="background: rgba(255, 255, 255, 0.85)"><p id="t">Words</p></div>',
      DARK
    );
    expect(repairContrast(doc, DARK, styleOf).repaired).toBe(1);
  });

  it('leaves text over a gradient or picture as drawn, since what is behind it cannot be measured', () => {
    const { doc, styleOf } = chapter(
      '<div style="background-image: linear-gradient(#ffffff, #eeeeee)"><p id="t">Words</p></div>',
      DARK
    );
    expect(repairContrast(doc, DARK, styleOf).repaired).toBe(0);
  });

  it('leaves text the book positions over other content, such as white lettering over a dark picture', () => {
    const { doc, styleOf } = chapter(
      '<div style="position: relative"><svg width="10" height="10"></svg>' +
        '<p id="t" style="position: absolute; color: #ffffff">Over the picture</p></div>',
      LIGHT
    );
    expect(repairContrast(doc, LIGHT, styleOf).repaired).toBe(0);
    expect(parseColor(colorOf(doc, 't'))).toEqual(parseColor('#ffffff'));
  });

  it('leaves a fixed-layout book’s pages whole, since they are designed as pictures', () => {
    const fxl = document.createElement('foliate-fxl');
    const iframe = document.createElement('iframe');
    fxl.attachShadow({ mode: 'closed' }).append(iframe);
    document.body.append(fxl);
    const page = iframe.contentDocument as Document;
    page.body.innerHTML = '<p id="t" style="color: #ffffff">Lettering</p>';
    expect(inFixedLayout(page)).toBe(true);
    expect(repairContrast(page, LIGHT).repaired).toBe(0);
    fxl.remove();
    const { doc } = chapter('<p>Words</p>', LIGHT);
    expect(inFixedLayout(doc)).toBe(false);
  });

  it('puts back what it changed before reading again, so a theme change starts from the book and the theme', () => {
    const { doc, styleOf } = chapter(
      '<div style="background: #f5eefa"><p id="t" style="color: rgb(1, 2, 3)">Words</p></div>',
      DARK
    );
    // The book's own near-black reads on its pale box in any theme, so nothing changes...
    expect(repairContrast(doc, DARK, styleOf).repaired).toBe(0);
    // ...and a box whose text was repaired for a dark theme is read afresh in a light one.
    const pale = chapter('<div style="background: #f5eefa"><p id="t">Words</p></div>', DARK);
    repairContrast(pale.doc, DARK, pale.styleOf);
    expect(colorOf(pale.doc, 't')).not.toBe('');
    const light = { ...pale, styleOf: chapter('', LIGHT).styleOf };
    expect(repairContrast(light.doc, LIGHT, light.styleOf).repaired).toBe(0);
    expect(colorOf(light.doc, 't')).toBe('');
  });

  it('keeps an inline color the book wrote, and puts it back with its priority', () => {
    const { doc, styleOf } = chapter('<p id="t" style="color: #555555 !important">Words</p>', DARK);
    repairContrast(doc, DARK, styleOf);
    expect(parseColor(colorOf(doc, 't'))).toEqual(parseColor(DARK.fg));
    repairContrast(doc, LIGHT, chapter('', LIGHT).styleOf);
    const el = doc.getElementById('t') as HTMLElement;
    expect(parseColor(el.style.color)).toEqual(parseColor('#555555'));
    expect(el.style.getPropertyPriority('color')).toBe('important');
  });
});

describe('readableOn', () => {
  it('prefers the theme’s text color, then its page color, then black or white', () => {
    expect(readableOn(parseColor('#1f2a44') as never, DARK)).toBe(DARK.fg);
    expect(readableOn(parseColor('#f5eefa') as never, DARK)).toBe(DARK.bg);
    const grayTheme = { bg: '#808080', fg: '#909090' };
    expect(readableOn(parseColor('#5a5a5a') as never, grayTheme)).toBe('#ffffff');
  });

  it('always answers with a color that reads', () => {
    for (const bg of ['#000000', '#ffffff', '#f5eefa', '#1f2a44', '#777777', '#ff0000'])
      for (const theme of [DARK, LIGHT]) {
        const pick = parseColor(readableOn(parseColor(bg) as never, theme));
        expect(contrastOf(pick as never, parseColor(bg) as never)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
  });
});
