// A book's pictures keep their shape: Calibre's cover page stretches its picture to the page with
// `preserveAspectRatio="none"`, which pulls the cover sideways in one column across a wide pane.

import { describe, expect, it } from 'vitest';
import { keepPictureAspect, stretches } from '../reader/picture-aspect';

const XHTML = (body: string) =>
  new DOMParser().parseFromString(
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><body>${body}</body></html>`,
    'application/xhtml+xml'
  );

const SVG = 'xmlns="http://www.w3.org/2000/svg"';

describe('a preserveAspectRatio value', () => {
  it('stretches when its alignment is none, with or without defer', () => {
    for (const v of ['none', ' None ', 'defer none', 'none meet']) expect(stretches(v)).toBe(true);
  });

  it('keeps the shape otherwise, and when there is none at all', () => {
    for (const v of ['xMidYMid meet', 'xMinYMin slice', 'defer xMidYMid', '', null]) expect(stretches(v)).toBe(false);
  });
});

describe('the pictures in a section of a book', () => {
  it('keeps Calibre’s cover in its shape', () => {
    const doc = XHTML(
      `<div><svg ${SVG} width="100%" height="100%" viewBox="0 0 600 825" preserveAspectRatio="none">` +
        `<image width="600" height="825" xlink:href="cover.jpeg"/></svg></div>`
    );
    expect(keepPictureAspect(doc)).toBe(1);
    expect(doc.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('keeps an image that stretches itself in its shape', () => {
    const doc = XHTML(
      `<svg ${SVG} viewBox="0 0 100 100"><image width="100" height="50" preserveAspectRatio="none" href="a.png"/></svg>`
    );
    expect(keepPictureAspect(doc)).toBe(1);
    expect(doc.querySelector('image')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('leaves a drawing with no picture in it as the book drew it', () => {
    const doc = XHTML(
      `<svg ${SVG} width="100%" height="2" viewBox="0 0 100 1" preserveAspectRatio="none"><line x1="0" y1="0" x2="100" y2="0"/></svg>`
    );
    expect(keepPictureAspect(doc)).toBe(0);
    expect(doc.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('leaves a picture that already keeps its shape', () => {
    const doc = XHTML(
      `<svg ${SVG} viewBox="0 0 600 825" preserveAspectRatio="xMinYMin slice"><image width="600" height="825" href="c.jpg"/></svg>`
    );
    expect(keepPictureAspect(doc)).toBe(0);
    expect(doc.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('xMinYMin slice');
  });
});
