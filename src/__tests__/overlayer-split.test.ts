// A passage selection across several blocks is drawn on every one of them — the heading and the list items as well as
// the paragraphs. Run against foliate's own split, which decides what the overlayer measures (ORBIS patch 15).

import { splitRangeForRects } from 'foliate-js/overlayer.js';
import { describe, expect, it } from 'vitest';

function setBody(html: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));
}

/** The guide's "Go to a chapter" page: a paragraph, a heading, a tight list, then two paragraphs. */
function page(): { first: Text; last: Text } {
  setBody(
    '<p id="first">To read the book as one long scroll, see <a href="#m">Paged mode and Scrolled mode</a>.</p>' +
      '<h2>Go to a chapter</h2>' +
      '<ol><li>On the toolbar, select the <strong>Navigator</strong> button.</li>' +
      '<li>If the <strong>Contents</strong> tab is not open, select it.</li>' +
      '<li>Select a chapter or section.</li></ol>' +
      '<p>The book goes to that place, and the Navigator closes.</p>' +
      '<p id="last">To go to the next chapter, run <strong>Next chapter</strong> from the command palette.</p>'
  );
  const first = document.getElementById('first')?.firstChild as Text;
  const last = document.getElementById('last')?.lastChild as Text;
  return { first, last };
}

function across(startNode: Text, startOffset: number, endNode: Text, endOffset: number): Range {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

describe('splitRangeForRects', () => {
  it('measures the heading and the list items, not only the paragraphs', () => {
    const { first, last } = page();
    const text = splitRangeForRects(across(first, 0, last, last.length))
      .map((r) => r.toString())
      .join('');
    expect(text).toContain('Go to a chapter');
    expect(text).toContain('On the toolbar, select the Navigator button.');
    expect(text).toContain('Select a chapter or section.');
    expect(text).toContain('The book goes to that place');
  });

  it('keeps the selection’s own start and end inside a block', () => {
    const { first } = page();
    const lastStart = document.getElementById('last')?.firstChild as Text;
    const pieces = splitRangeForRects(across(first, 8, lastStart, 10));
    const text = pieces.map((r) => r.toString()).join('');
    expect(text.startsWith('the book as one long scroll')).toBe(true);
    expect(text.endsWith('To go to t')).toBe(true);
  });

  it('never measures a whole block, whose box would cover its margins', () => {
    const { first, last } = page();
    for (const piece of splitRangeForRects(across(first, 0, last, last.length))) {
      const kids = piece.cloneContents().querySelectorAll('p, h2, ol, li');
      expect(kids.length).toBe(0);
    }
  });

  it('keeps an image inside the selection', () => {
    setBody('<p id="a">Before <img src="x.png" alt=""> after.</p><h2 id="b">Next</h2>');
    const a = document.getElementById('a')?.firstChild as Text;
    const b = document.getElementById('b')?.firstChild as Text;
    const pieces = splitRangeForRects(across(a, 0, b, b.length));
    expect(pieces.some((r) => r.cloneContents().querySelector('img'))).toBe(true);
  });

  it('leaves a selection inside one text node as it is', () => {
    const { first } = page();
    const range = across(first, 3, first, 12);
    expect(splitRangeForRects(range)).toEqual([range]);
  });
});
