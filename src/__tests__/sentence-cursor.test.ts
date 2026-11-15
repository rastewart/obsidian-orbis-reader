import { describe, expect, it } from 'vitest';
import {
  firstVisible,
  nextSpan,
  paragraphSpan,
  sentenceAt,
  sentencesIn,
  shiftArrowDoes,
} from '../reader/sentence-cursor';

/** A selection of whole sentences. */
const sel = (from: number, to: number) => ({ from, to, collapsed: false });
/** A caret: a position, not a selection — which is what lets one command serve three states. */
const caret = (at: number) => ({ from: at, to: at, collapsed: true });

const parse = (html: string): Document => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

describe('where a keystroke lands', () => {
  // Nothing selected: every move starts from the page in front of the reader, not the top of the chapter.
  it('starts from the first visible sentence, whichever key was pressed', () => {
    for (const move of ['sentence', 'previous', 'extend', 'shrink'] as const) {
      expect(nextSpan(move, 10, null, 4)).toEqual({ from: 4, to: 4 });
    }
  });

  it('SELECTS THE SENTENCE THE CARET IS IN, and only then moves on', () => {
    // The rule that lets one command do the work of two. Click in a paragraph and press it: you get the sentence you
    // clicked in, not the one after it. Press again — now there is a selection — and it advances.
    expect(nextSpan('sentence', 10, caret(3), 0)).toEqual({ from: 3, to: 3 });
    expect(nextSpan('sentence', 10, sel(3, 3), 0)).toEqual({ from: 4, to: 4 });
  });

  it('does nothing when the page holds no sentences at all', () => {
    expect(nextSpan('sentence', 10, null, -1)).toBeNull();
    expect(nextSpan('sentence', 0, sel(0, 0), 0)).toBeNull();
  });

  it('moves one sentence at a time, collapsing a multi-sentence selection', () => {
    // Forward from the END of the selection and back from its START, so a three-sentence selection continues
    // where it finished rather than where it began.
    expect(nextSpan('sentence', 10, sel(2, 4), 0)).toEqual({ from: 5, to: 5 });
    expect(nextSpan('previous', 10, sel(2, 4), 0)).toEqual({ from: 1, to: 1 });
  });

  it('extends and shrinks from the end, keeping the sentence it started on', () => {
    expect(nextSpan('extend', 10, sel(2, 2), 0)).toEqual({ from: 2, to: 3 });
    expect(nextSpan('shrink', 10, sel(2, 4), 0)).toEqual({ from: 2, to: 3 });
    // Shrinking to nothing would clear a selection the reader is building; there is a command for that.
    expect(nextSpan('shrink', 10, sel(2, 2), 0)).toEqual({ from: 2, to: 2 });
  });

  it('stops at both ends of the section rather than wrapping', () => {
    // A book is not a carousel: the sentence after the last one is in the next chapter, which is a different move.
    expect(nextSpan('sentence', 5, sel(4, 4), 0)).toBeNull();
    expect(nextSpan('extend', 5, sel(3, 4), 0)).toBeNull();
    expect(nextSpan('previous', 5, sel(0, 0), 0)).toBeNull();
  });
});

describe('what Shift+arrow does', () => {
  it('starts a selection when there is none, rather than doing nothing', () => {
    // No editor has a "begin selecting" key: you hold Shift and move. Requiring a separate command first would be
    // a mode nobody can see.
    expect(shiftArrowDoes(false, true, false)).toBe('seed');
  });

  it('adjusts a real selection', () => {
    expect(shiftArrowDoes(true, false, false)).toBe('adjust');
  });

  it('TAKES THE SENTENCE when the caret came from a click', () => {
    expect(shiftArrowDoes(true, true, false)).toBe('seed');
  });

  it('CARRIES ON THROUGH when the selection was shrunk to nothing', () => {
    // The two collapsed cases are identical in the DOM and want opposite things. Holding Shift+Left brings the
    // focus end back to the anchor; the press after that has to cross over and grow backwards, as every editor
    // does, rather than stopping and leaving the selection dead.
    expect(shiftArrowDoes(true, true, true)).toBe('adjust');
  });
});

describe('taking a paragraph whole', () => {
  // Vim's real idea, without its keys: a paragraph is a thing you can take hold of. The sentences already know
  // which block they came from, so a paragraph is the run of them sharing one.
  const A = new Range();
  const B = new Range();
  const units = [{ block: A }, { block: A }, { block: A }, { block: B }, { block: B }];

  it('takes every sentence of the block the reader is in, from any of them', () => {
    for (const at of [0, 1, 2]) expect(paragraphSpan(units, at, false)).toEqual({ from: 0, to: 2 });
    expect(paragraphSpan(units, 4, false)).toEqual({ from: 3, to: 4 });
  });

  it('moves to the next paragraph when this one is already selected whole', () => {
    expect(paragraphSpan(units, 0, true)).toEqual({ from: 3, to: 4 });
  });

  it('stops at the last paragraph rather than wrapping', () => {
    expect(paragraphSpan(units, 3, true)).toBeNull();
    expect(paragraphSpan(units, -1, false)).toBeNull();
  });
});

describe('reading the book into sentences', () => {
  it('splits a paragraph into sentences with ranges over its own text', () => {
    const doc = parse('<p>One thing happened. Then another thing. And a third.</p>');
    const units = sentencesIn(doc);
    expect(units.length).toBe(3);
    expect(units.map((u) => u.text.trim())).toEqual(['One thing happened.', 'Then another thing.', 'And a third.']);
    // The ranges have to slice back to the same text, or a selection built from them marks the wrong words.
    for (const unit of units) expect(unit.range.toString().trim()).toBe(unit.text.trim());
  });

  it('finds the sentence a point falls in', () => {
    const doc = parse('<p>First one. Second one. Third one.</p>');
    const units = sentencesIn(doc);
    const text = doc.querySelector('p')?.firstChild as Node;
    expect(sentenceAt(units, text, 2)).toBe(0);
    expect(sentenceAt(units, text, 14)).toBe(1);
  });

  it('answers with the sentence before a point that is in none of them', () => {
    // A selection in the furniture around the text — whitespace between blocks, a heading the segmenter skipped.
    const doc = parse('<p>Only sentence here.</p><h2>A heading</h2>');
    const units = sentencesIn(doc);
    const heading = doc.querySelector('h2')?.firstChild as Node;
    expect(sentenceAt(units, heading, 1)).toBeGreaterThanOrEqual(0);
  });

  it('reports -1 when nothing on the page is a sentence', () => {
    const doc = parse('<p>A sentence.</p>');
    expect(firstVisible(sentencesIn(doc), () => false)).toBe(-1);
  });

  it('picks the first sentence the reader can actually see', () => {
    const doc = parse('<p>One. Two. Three. Four.</p>');
    const units = sentencesIn(doc);
    // Everything before the third is off the top of the page.
    expect(firstVisible(units, (r) => units.findIndex((u) => u.range === r) >= 2)).toBe(2);
  });
});
