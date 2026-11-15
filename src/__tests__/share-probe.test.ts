// The share probe's test PDF has to open in whatever app a phone hands it to, and a strict viewer refuses a PDF whose
// cross-reference table points at the wrong bytes.

import { describe, expect, it } from 'vitest';
import { tinyPdf } from '../share-probe';

describe('tinyPdf', () => {
  it('has a cross-reference entry that lands on each object', () => {
    const text = new TextDecoder().decode(tinyPdf());
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1]);
    expect(text.slice(startxref).startsWith('xref\n')).toBe(true);
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(5);
    entries.forEach((at, i) => {
      expect(text.slice(at).startsWith(`${i + 1} 0 obj\n`)).toBe(true);
    });
  });

  it('gives the content stream its true length', () => {
    const text = new TextDecoder().decode(tinyPdf());
    const m = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(text);
    expect(Number(m?.[1])).toBe(m?.[2].length);
  });
});
