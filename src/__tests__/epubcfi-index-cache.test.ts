import { fromRange, parse, toRange, withIndexCache } from 'foliate-js/epubcfi.js';
import { describe, expect, it } from 'vitest';

/**
 * **ORBIS patch 10 changes how fast a CFI is made, never which one.** The location index makes one per page of a
 * section, all in one unchanging document, and without the cache each rebuilt the child list of every ancestor — on
 * a section with thousands of children, a minute of frozen main thread on a first open. Saved positions are stored
 * as these strings, so a cached one that differed by a step would move every bookmark made from it.
 */
describe('withIndexCache', () => {
  /** A body of many children mixing the shapes CFI indexing treats specially: adjacent text nodes (one chunk),
   *  elements with no text between them (a virtual chunk), and nesting. */
  const book = (): Document => {
    const doc = document.implementation.createHTMLDocument('t');
    for (let i = 0; i < 300; i++) {
      const p = doc.createElement('p');
      p.append(`Verse ${i} `, doc.createElement('b'), doc.createElement('i'), 'and more');
      if (i % 3 === 0) p.append(doc.createTextNode(' split'), doc.createTextNode(' again'));
      doc.body.append(p);
      if (i % 5 === 0) doc.body.append(`loose text ${i}`);
    }
    return doc;
  };

  const points = (doc: Document): Range[] => {
    const out: Range[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const range = doc.createRange();
      range.setStart(n, Math.min(2, (n as Text).length));
      range.collapse(true);
      out.push(range);
    }
    return out;
  };

  it('makes the same CFI for every point as the uncached code', () => {
    const doc = book();
    const ranges = points(doc);
    const plain = ranges.map((r) => fromRange(r));
    const cached = withIndexCache(() => ranges.map((r) => fromRange(r)));
    expect(cached).toEqual(plain);
    expect(new Set(plain).size).toBe(plain.length);
  });

  it('resolves each cached CFI back to the point it was made from', () => {
    const doc = book();
    const ranges = points(doc);
    withIndexCache(() => {
      for (const r of ranges) {
        const back = toRange(doc, parse(fromRange(r)));
        expect(back.startContainer.textContent?.slice(0, back.startOffset + 4)).toBe(
          r.startContainer.textContent?.slice(0, r.startOffset + 4)
        );
      }
    });
  });

  it('caches nothing outside its call, so a changed document is indexed afresh', () => {
    const doc = book();
    const target = doc.body.lastElementChild!.firstChild!;
    const range = doc.createRange();
    range.setStart(target, 1);
    range.collapse(true);
    const before = withIndexCache(() => fromRange(range));
    doc.body.prepend(doc.createElement('div'));
    expect(fromRange(range)).not.toBe(before);
    expect(withIndexCache(() => fromRange(range))).toBe(fromRange(range));
  });
});
