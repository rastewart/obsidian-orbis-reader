import { describe, expect, it } from 'vitest';
import { anchorAtFraction } from '../reader/tts/page-follow';

function parse(bodyHtml: string): Document {
  return new DOMParser().parseFromString(`<!DOCTYPE html><body>${bodyHtml}</body>`, 'text/html');
}

describe('anchorAtFraction — single-text-node fast path', () => {
  // "Hello world" = 11 chars: H(0)e(1)l(2)l(3)o(4) (5)w(6)o(7)r(8)l(9)d(10)
  function helloRange(): Range {
    const doc = parse('<p>Hello world</p>');
    const text = doc.querySelector('p')?.firstChild as Text;
    const r = doc.createRange();
    r.setStart(text, 0);
    r.setEnd(text, text.length);
    return r;
  }

  it('returns the first character at fraction 0', () => {
    expect(anchorAtFraction(helloRange(), 0)?.toString()).toBe('H');
  });

  it('returns the mid character at fraction 0.5', () => {
    // floor(0.5 * 11) = 5 → the space
    expect(anchorAtFraction(helloRange(), 0.5)?.toString()).toBe(' ');
  });

  it('clamps fraction 1 to the last character', () => {
    expect(anchorAtFraction(helloRange(), 1)?.toString()).toBe('d');
  });

  it('always returns a single-character range', () => {
    const a = anchorAtFraction(helloRange(), 0.3);
    expect(a?.toString()).toHaveLength(1);
  });
});

describe('anchorAtFraction — multi-node walker path', () => {
  // <p>ab<b>cd</b>ef</p> → text nodes 'ab','cd','ef'; 6 chars: a b c d e f
  function mixedRange(): Range {
    const doc = parse('<p>ab<b>cd</b>ef</p>');
    const p = doc.querySelector('p') as HTMLElement;
    const r = doc.createRange();
    r.selectNodeContents(p); // commonAncestorContainer is the <p> element → walker path
    return r;
  }

  it('walks into the nested node for a mid fraction', () => {
    // floor(0.5 * 6) = 3 → 4th char 'd' (inside <b>)
    expect(anchorAtFraction(mixedRange(), 0.5)?.toString()).toBe('d');
  });

  it('returns the first character at fraction 0', () => {
    expect(anchorAtFraction(mixedRange(), 0)?.toString()).toBe('a');
  });

  it('clamps fraction 1 to the last character', () => {
    expect(anchorAtFraction(mixedRange(), 1)?.toString()).toBe('f');
  });
});

describe('anchorAtFraction — edge cases', () => {
  it('returns null for an empty range', () => {
    const doc = parse('<p>x</p>');
    const text = doc.querySelector('p')?.firstChild as Text;
    const r = doc.createRange();
    r.setStart(text, 0);
    r.setEnd(text, 0); // collapsed → length 0
    expect(anchorAtFraction(r, 0.5)).toBeNull();
  });
});
