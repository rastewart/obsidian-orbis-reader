import { describe, expect, it } from 'vitest';
import { cumCharBounds, getWordUnits, unitIndexAtFraction } from '../reader/tts/tts-blocks';

function parse(bodyHtml: string): Document {
  return new DOMParser().parseFromString(`<!DOCTYPE html><body>${bodyHtml}</body>`, 'text/html');
}

/** The whole contents of the first matching element, as a text-node range. */
function contentsRange(doc: Document, sel: string): Range {
  const el = doc.querySelector(sel);
  if (!el) throw new Error(`no ${sel}`);
  const r = doc.createRange();
  r.selectNodeContents(el);
  return r;
}

const texts = (units: { text: string }[]) => units.map((u) => u.text);
const drawn = (units: { range: Range }[]) => units.map((u) => u.range.toString());

describe('getWordUnits — single text node', () => {
  it('splits a sentence into its words', () => {
    const doc = parse('<p>The quick brown fox jumps.</p>');
    const units = getWordUnits(contentsRange(doc, 'p'));
    expect(texts(units)).toEqual(['The', 'quick', 'brown', 'fox', 'jumps']);
  });

  it('each unit range selects exactly its own word', () => {
    const doc = parse('<p>The quick brown fox jumps.</p>');
    const units = getWordUnits(contentsRange(doc, 'p'));
    expect(drawn(units)).toEqual(['The', 'quick', 'brown', 'fox', 'jumps']);
  });

  it('skips whitespace and punctuation so the highlight never lands on a gap', () => {
    const doc = parse('<p>Wait — really? Yes!</p>');
    const units = getWordUnits(contentsRange(doc, 'p'));
    expect(texts(units)).toEqual(['Wait', 'really', 'Yes']);
    // No unit is pure whitespace or punctuation.
    for (const u of units) expect(u.range.toString().trim()).not.toBe('');
  });

  it('keeps contractions and hyphenated-adjacent words as segmented', () => {
    const doc = parse("<p>It's a well-known fact.</p>");
    const units = getWordUnits(contentsRange(doc, 'p'));
    // Intl.Segmenter keeps "It's" whole and splits on the hyphen.
    expect(texts(units)).toContain("It's");
    expect(texts(units)).toContain('well');
    expect(texts(units)).toContain('known');
  });

  it('handles numbers', () => {
    const doc = parse('<p>Chapter 12 begins.</p>');
    expect(texts(getWordUnits(contentsRange(doc, 'p')))).toEqual(['Chapter', '12', 'begins']);
  });
});

describe('getWordUnits — a sentence range that starts and ends mid-node', () => {
  // The bug this guards: collectRangeTextNodes drops a start container the range enters
  // partway through, which silently lost the first word of every sentence but the first.
  it('includes the first word when the range starts mid-node', () => {
    const doc = parse('<p>First one. Second one here.</p>');
    const text = doc.querySelector('p')?.firstChild as Text;
    const full = text.nodeValue ?? '';
    const start = full.indexOf('Second');
    const r = doc.createRange();
    r.setStart(text, start);
    r.setEnd(text, full.length);
    expect(texts(getWordUnits(r))).toEqual(['Second', 'one', 'here']);
  });

  it('does not run past the range end', () => {
    const doc = parse('<p>Keep this. Drop that.</p>');
    const text = doc.querySelector('p')?.firstChild as Text;
    const r = doc.createRange();
    r.setStart(text, 0);
    r.setEnd(text, (text.nodeValue ?? '').indexOf(' Drop'));
    expect(texts(getWordUnits(r))).toEqual(['Keep', 'this']);
  });
});

describe('getWordUnits — words spanning inline markup', () => {
  it('collects words across <i>/<b> children', () => {
    const doc = parse('<p>A <i>very</i> odd <b>thing</b> happened</p>');
    expect(texts(getWordUnits(contentsRange(doc, 'p')))).toEqual(['A', 'very', 'odd', 'thing', 'happened']);
  });

  it('maps each word range into the right node', () => {
    const doc = parse('<p>A <i>very</i> odd <b>thing</b> happened</p>');
    const units = getWordUnits(contentsRange(doc, 'p'));
    expect(drawn(units)).toEqual(['A', 'very', 'odd', 'thing', 'happened']);
    const veryUnit = units.find((u) => u.text === 'very');
    expect(veryUnit?.range.startContainer.parentElement?.tagName.toLowerCase()).toBe('i');
  });

  it('handles a word split across two text nodes by markup', () => {
    // "foot" + "note" — one word to a reader, two nodes in the DOM.
    const doc = parse('<p>a foot<i>note</i> here</p>');
    const units = getWordUnits(contentsRange(doc, 'p'));
    // The segmenter sees "footnote" as one word; its range must span both nodes.
    const joined = units.find((u) => u.text === 'footnote');
    expect(joined).toBeDefined();
    expect(joined?.range.toString()).toBe('footnote');
    expect(joined?.range.startContainer).not.toBe(joined?.range.endContainer);
  });
});

describe('getWordUnits — pretty-printed epub HTML', () => {
  it('maps offsets correctly across hard newlines', () => {
    // Newlines are normalized to spaces length-preservingly, so offsets still map.
    const doc = parse('<p>The quick\n  brown fox\n  jumps over</p>');
    const units = getWordUnits(contentsRange(doc, 'p'));
    expect(texts(units)).toEqual(['The', 'quick', 'brown', 'fox', 'jumps', 'over']);
    expect(drawn(units)).toEqual(['The', 'quick', 'brown', 'fox', 'jumps', 'over']);
  });
});

describe('getWordUnits — degenerate input', () => {
  it('returns [] for a whitespace-only range', () => {
    const doc = parse('<p>   \n  </p>');
    expect(getWordUnits(contentsRange(doc, 'p'))).toEqual([]);
  });

  it('returns [] for an empty element', () => {
    const doc = parse('<p></p>');
    expect(getWordUnits(contentsRange(doc, 'p'))).toEqual([]);
  });

  it('returns [] for a collapsed range', () => {
    const doc = parse('<p>Hello world</p>');
    const text = doc.querySelector('p')?.firstChild as Text;
    const r = doc.createRange();
    r.setStart(text, 3);
    r.setEnd(text, 3);
    expect(getWordUnits(r)).toEqual([]);
  });

  it('returns a single unit for a one-word range', () => {
    const doc = parse('<p>Solitude</p>');
    expect(texts(getWordUnits(contentsRange(doc, 'p')))).toEqual(['Solitude']);
  });

  it('yields words in document order', () => {
    const doc = parse('<p>one two three four five six seven</p>');
    const units = getWordUnits(contentsRange(doc, 'p'));
    for (let i = 1; i < units.length; i++) {
      expect(units[i - 1].range.compareBoundaryPoints(Range.START_TO_START, units[i].range)).toBeLessThan(0);
    }
  });
});

describe('cumCharBounds', () => {
  it('returns [0] for no units', () => {
    expect(cumCharBounds([])).toEqual([0]);
  });

  it('accumulates length + 1 per unit (the joining separator)', () => {
    expect(cumCharBounds([{ text: 'ab' }, { text: 'cde' }])).toEqual([0, 3, 7]);
  });

  it("last entry is the run's total", () => {
    const units = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];
    const bounds = cumCharBounds(units);
    expect(bounds[units.length]).toBe(3 + 1 + 3 + 1 + 5 + 1);
  });
});

describe('unitIndexAtFraction', () => {
  // Three words of 4 chars each → bounds [0, 5, 10, 15], total 15.
  const units = [{ text: 'aaaa' }, { text: 'bbbb' }, { text: 'cccc' }];
  const bounds = cumCharBounds(units);
  const at = (frac: number, from = 0) => unitIndexAtFraction(bounds, units.length, frac, from);

  it('maps fraction 0 to the first unit', () => {
    expect(at(0)).toBe(0);
  });

  it('maps the middle of the run to the middle unit', () => {
    expect(at(0.5)).toBe(1); // 0.5 * 15 = 7.5 → within [5, 10)
  });

  it('maps fraction 1 to the last unit', () => {
    expect(at(1)).toBe(2);
  });

  it('steps at each boundary', () => {
    expect(at(4 / 15)).toBe(0);
    expect(at(5 / 15)).toBe(1); // exactly on the boundary → the later unit
    expect(at(10 / 15)).toBe(2);
  });

  it('clamps out-of-range fractions instead of going out of bounds', () => {
    expect(at(-1)).toBe(0);
    expect(at(2)).toBe(2);
  });

  it('never moves backwards from `from` (forward-only during playback)', () => {
    // A jittery time estimate can report a fraction slightly behind the current word.
    expect(at(0.1, 2)).toBe(2);
    expect(at(0.5, 1)).toBe(1);
  });

  it('scans forward from `from`', () => {
    expect(at(1, 0)).toBe(2);
  });

  it('returns 0 for an empty run', () => {
    expect(unitIndexAtFraction([0], 0, 0.5)).toBe(0);
  });

  it('handles a zero-length run without dividing by zero', () => {
    expect(unitIndexAtFraction([0, 0], 1, 0.5)).toBe(0);
  });

  it('clamps `from` to the last index', () => {
    expect(at(0.5, 99)).toBe(2);
  });

  it('agrees with the word units it is used with', () => {
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><body><p>alpha bravo charlie delta</p></body>',
      'text/html'
    );
    const el = doc.querySelector('p');
    if (!el) throw new Error('no p');
    const r = doc.createRange();
    r.selectNodeContents(el);
    const words = getWordUnits(r);
    const wb = cumCharBounds(words);
    expect(words[unitIndexAtFraction(wb, words.length, 0)].text).toBe('alpha');
    expect(words[unitIndexAtFraction(wb, words.length, 1)].text).toBe('delta');
  });
});
