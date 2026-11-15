// Text alignment: three answers where there was a yes/no, and body text as what they apply to.
//
// Most books justify their own text, so the book's choice is an answer of its own, and Left/Justified apply to body
// text only, so a book that centers some paragraphs keeps them centered.

import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { BODY_TEXT, isBodyTextAlign, KEEP_FONT, keepsOwnFont, tagBodyText } from '../reader/body-text';
import {
  migrateStyleTextAlign,
  migrateTextAlignStorage,
  nextTextAlign,
  parseTextAlign,
  STORAGE_KEY_TEXT_ALIGN,
} from '../text-align';

describe('what a style that predates three answers becomes', () => {
  it('reads yes as Justified and no as the book’s, and drops the old field', () => {
    const on: Record<string, unknown> = { justifyText: true };
    const off: Record<string, unknown> = { justifyText: false };
    expect(migrateStyleTextAlign(on)).toBe(true);
    migrateStyleTextAlign(off);
    expect(on).toEqual({ textAlign: 'justify' });
    expect(off).toEqual({ textAlign: 'book' });
  });

  it('leaves a style already written with three answers alone, and says so', () => {
    const now: Record<string, unknown> = { textAlign: 'left' };
    expect(migrateStyleTextAlign(now)).toBe(false);
    expect(now).toEqual({ textAlign: 'left' });
  });

  it('carries this device’s live value to the new key once, and removes the old one', () => {
    const store = new Map<string, string>([['orbis-justify', 'true']]);
    const app = {
      loadLocalStorage: (k: string) => store.get(k) ?? null,
      saveLocalStorage: (k: string, v: string | null) => (v === null ? store.delete(k) : store.set(k, v)),
    } as unknown as App;
    migrateTextAlignStorage(app);
    expect(store.get(STORAGE_KEY_TEXT_ALIGN)).toBe('justify');
    expect(store.has('orbis-justify')).toBe(false);
    migrateTextAlignStorage(app);
    expect(store.get(STORAGE_KEY_TEXT_ALIGN)).toBe('justify');
  });

  it('reads anything unrecognised as the book’s', () => {
    expect(parseTextAlign('justify')).toBe('justify');
    expect(parseTextAlign(null)).toBe('book');
    expect(parseTextAlign('true')).toBe('book');
  });
});

describe('what counts as body text', () => {
  it('is text the book aligns left, justified or not at all — never centered or right', () => {
    for (const a of ['left', 'start', 'justify', '']) expect(isBodyTextAlign(a)).toBe(true);
    for (const a of ['center', 'right', 'end', '-webkit-center']) expect(isBodyTextAlign(a)).toBe(false);
  });

  it('keeps the book’s font for code, monospace and symbol fonts, and only those', () => {
    expect(keepsOwnFont('code', 'serif')).toBe(true);
    expect(keepsOwnFont('span', '"Courier New", monospace')).toBe(true);
    expect(keepsOwnFont('span', 'Symbol')).toBe(true);
    expect(keepsOwnFont('span', '"Times New Roman", serif')).toBe(false);
  });

  it('tags leaf paragraphs the book does not center, and marks code inside them', () => {
    // The page's own document: a parsed one has no window, and the pass reads the book's alignment through one, as a
    // chapter's iframe document does.
    const doc = document;
    delete doc.documentElement.dataset.orbisBodyText;
    const style = doc.createElement('style');
    style.textContent = '.c { text-align: center } .j { text-align: justify }';
    doc.head.replaceChildren(style);
    const page = new DOMParser().parseFromString(
      `<div><p class="j">Body text, justified by the book, with <code>code()</code> in it.</p>
      <p class="c">A centered title line</p><p>Plain body text.</p></div>`,
      'text/html'
    );
    doc.body.replaceChildren(...Array.from(page.body.childNodes).map((n) => doc.importNode(n, true)));
    tagBodyText(doc);
    const [j, c, plain] = Array.from(doc.querySelectorAll('p'));
    expect(j.classList.contains(BODY_TEXT)).toBe(true);
    expect(plain.classList.contains(BODY_TEXT)).toBe(true);
    expect(c.classList.contains(BODY_TEXT)).toBe(false);
    // The wrapper holds blocks, so it is not the paragraph the style lands on.
    expect(doc.querySelector('div')?.classList.contains(BODY_TEXT)).toBe(false);
    expect(doc.querySelector('code')?.classList.contains(KEEP_FONT)).toBe(true);
  });
});

// Cycle text alignment steps through all three, in the dropdown's order, so a reader on Left can get back to the book's.
describe('the next alignment', () => {
  it('goes Follow the book, Left, Justified, then round again', () => {
    expect(nextTextAlign('book')).toBe('left');
    expect(nextTextAlign('left')).toBe('justify');
    expect(nextTextAlign('justify')).toBe('book');
  });
});
