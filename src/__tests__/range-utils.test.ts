import { describe, expect, it } from 'vitest';
import { tightenRange } from '../reader/range-utils';

/** Parse a trusted HTML string into a document (avoids innerHTML/createElement). */
function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function rangeIn(doc: Document, startNode: Node, startOffset: number, endNode: Node, endOffset: number): Range {
  const r = doc.createRange();
  r.setStart(startNode, startOffset);
  r.setEnd(endNode, endOffset);
  return r;
}

describe('tightenRange', () => {
  it('pulls a heading selection out of the trailing inter-element whitespace', () => {
    // Mirrors the phantom case: <div><h2><a/>…CHAPTER II…</h2>\n <p>…</p></div>. The selection starts
    // in the h2 text and spills into the whitespace text node after the h2.
    const doc = parse(
      '<div><h2><a></a>\n      CHAPTER II\n    </h2>\n    <p>Wren Pellow had never crossed the river.</p></div>'
    );
    const h2Text = doc.querySelector('h2')!.childNodes[1] as Text; // "\n      CHAPTER II\n    "
    const gap = doc.querySelector('div')!.childNodes[1] as Text; // "\n    " between h2 and p
    expect(gap.data.trim()).toBe(''); // sanity: it's whitespace

    const r = rangeIn(doc, h2Text, 0, gap, gap.data.length);
    expect(r.toString().trim()).toBe('CHAPTER II');
    expect(r.toString()).not.toBe('CHAPTER II'); // has surrounding whitespace before tightening

    tightenRange(r);

    expect(r.toString()).toBe('CHAPTER II');
    // End no longer sits in the whitespace gap node — it's back inside the h2 text.
    expect(r.endContainer).toBe(h2Text);
  });

  it('trims surrounding whitespace within a single text node', () => {
    const doc = parse('<p>  hello world  </p>');
    const t = doc.querySelector('p')!.firstChild as Text;
    const r = rangeIn(doc, t, 0, t, t.data.length);
    tightenRange(r);
    expect(r.toString()).toBe('hello world');
    expect(r.startContainer).toBe(t);
    expect(r.endContainer).toBe(t);
  });

  it('is a no-op on an already-tight range', () => {
    const doc = parse('<p>hello world</p>');
    const t = doc.querySelector('p')!.firstChild as Text;
    const r = rangeIn(doc, t, 0, t, 5); // "hello"
    tightenRange(r);
    expect(r.toString()).toBe('hello');
    expect(r.startOffset).toBe(0);
    expect(r.endOffset).toBe(5);
  });

  it('leaves an all-whitespace range unchanged (nothing to tighten to)', () => {
    const doc = parse('<p>   </p>');
    const t = doc.querySelector('p')!.firstChild as Text;
    const r = rangeIn(doc, t, 0, t, 3);
    tightenRange(r);
    expect(r.toString()).toBe('   ');
  });

  it('keeps a clean cross-element selection intact', () => {
    const doc = parse('<p>alpha <em>beta</em> gamma</p>');
    const p = doc.querySelector('p')!;
    const first = p.childNodes[0] as Text; // "alpha "
    const last = p.childNodes[2] as Text; // " gamma"
    const r = rangeIn(doc, first, 0, last, last.data.length);
    expect(r.toString()).toBe('alpha beta gamma');
    tightenRange(r);
    expect(r.toString()).toBe('alpha beta gamma');
  });

  it('moves the ends of a range made from an element onto its text', () => {
    // `selectNodeContents(p)`: both ends on the element itself. Left there, its CFI has the same start and end.
    const doc = parse('<div><p>Nobody in <em>Thistlecombe</em> could say why.</p></div>');
    const p = doc.querySelector('p')!;
    const r = doc.createRange();
    r.selectNodeContents(p);

    tightenRange(r);

    const first = p.firstChild as Text;
    const last = p.lastChild as Text;
    expect(r.startContainer).toBe(first);
    expect(r.startOffset).toBe(0);
    expect(r.endContainer).toBe(last);
    expect(r.endOffset).toBe(last.data.length);
    expect(r.toString()).toBe('Nobody in Thistlecombe could say why.');
  });

  it('moves element ends onto the text past whitespace at the edges of the element', () => {
    const doc = parse('<div><p>\n  <span>Wren</span> mended the weir.\n</p></div>');
    const r = doc.createRange();
    r.selectNodeContents(doc.querySelector('p')!);

    tightenRange(r);

    expect(r.startContainer.nodeType).toBe(Node.TEXT_NODE);
    expect(r.endContainer.nodeType).toBe(Node.TEXT_NODE);
    expect(r.toString()).toBe('Wren mended the weir.');
  });
});
