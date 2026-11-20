// The boxes the paginator places an anchor by (ORBIS patch 39).
//
// A range around a picture alone has none of its own: getVisibleRange gives one for a cover page, from the start of
// the cover's `<div>` to a point inside its SVG `<image>`, and Orbis saves it as the reading location. With no boxes
// the paginator did nothing, so a book reopened at its cover stayed wherever the pane's first width put it once the
// pane settled. jsdom lays nothing out, so each box is given by hand.

import { anchorRects } from 'foliate-js/paginator.js';
import { describe, expect, it } from 'vitest';

const parse = (html: string): Document => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

const box = (left: number) => ({ left, right: left + 100, top: 0, bottom: 100, width: 100, height: 100 }) as DOMRect;

/** Give a node or range these boxes, by their left edges. */
function boxes<T extends object>(target: T, ...lefts: number[]): T {
  Object.defineProperty(target, 'getClientRects', { value: () => lefts.map(box) });
  return target;
}

/** The left edges of the boxes an anchor is placed by. */
const lefts = (anchor: unknown) => Array.from(anchorRects(anchor) ?? [], (r) => r.left);

/** A cover page as Calibre writes it, with the line breaks around the picture's `<div>`. */
function coverPage() {
  const doc = parse(
    '\n<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><image width="400" height="600"/></svg></div>\n'
  );
  const div = doc.querySelector('div') as HTMLDivElement;
  const svg = doc.querySelector('svg') as SVGSVGElement;
  const image = doc.querySelector('image') as SVGImageElement;
  return { doc, div, svg, image };
}

describe('anchorRects', () => {
  it('places a range by its own boxes when it has any', () => {
    const { doc, div, image } = coverPage();
    const range = boxes(doc.createRange(), 1440);
    range.setStart(div, 0);
    range.setEnd(image, 0);
    expect(lefts(range)).toEqual([1440]);
  });

  it('places a range around a picture alone by the element it starts at', () => {
    const { doc, div, svg, image } = coverPage();
    boxes(svg, 22);
    boxes(div, 0);
    const range = boxes(doc.createRange());
    range.setStart(div, 0);
    range.setEnd(image, 0);
    expect(lefts(range)).toEqual([22]);
  });

  it('falls back to the element it starts in when what it starts at is not an element', () => {
    const { doc, div } = coverPage();
    boxes(div, 30);
    boxes(doc.body, 5);
    const range = boxes(doc.createRange());
    range.setStart(doc.body, 0); // the line break before the div
    range.setEnd(div, 0);
    expect(lefts(range)).toEqual([5]);
  });

  it("uses a text node's own element when the range starts inside text", () => {
    const doc = parse('<p>Some words</p>');
    const p = boxes(doc.querySelector('p') as HTMLParagraphElement, 700);
    const range = boxes(doc.createRange());
    range.setStart(p.firstChild as Text, 2);
    range.setEnd(p.firstChild as Text, 2);
    expect(lefts(range)).toEqual([700]);
  });

  it('leaves an element, a fraction and nothing as they were', () => {
    const p = boxes(parse('<p>x</p>').querySelector('p') as HTMLParagraphElement, 9);
    expect(lefts(p)).toEqual([9]);
    expect(anchorRects(0.5)).toBeUndefined();
    expect(anchorRects(null)).toBeUndefined();
  });
});
