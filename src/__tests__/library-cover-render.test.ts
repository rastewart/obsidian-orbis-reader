import { describe, expect, it } from 'vitest';
import { wrapLines } from '../library/cover-render';

/** Ten units per character: enough to reason about, and the real measurer's shape (longer string, wider). */
const measure = (s: string) => s.length * 10;

describe('wrapLines', () => {
  it('fills each line and breaks at a space', () => {
    // "three four" is exactly 100 units, so it fits: the rule is fits-or-wraps, not stops-early.
    expect(wrapLines('one two three four', 100, measure)).toEqual(['one two', 'three four']);
    expect(wrapLines('one two three four', 90, measure)).toEqual(['one two', 'three', 'four']);
  });

  it('is empty for nothing, and ignores runs of whitespace', () => {
    expect(wrapLines('', 100, measure)).toEqual([]);
    expect(wrapLines('   ', 100, measure)).toEqual([]);
    expect(wrapLines('a\n\n  b', 100, measure)).toEqual(['a b']);
  });

  // A URL or a German compound in a title must not push the cover out of shape.
  it('breaks a word that cannot fit on any line', () => {
    expect(wrapLines('aaaaaaaaaaaa', 50, measure)).toEqual(['aaaaa', 'aaaaa', 'aa']);
  });

  it('breaks an over-long word without losing the words around it', () => {
    expect(wrapLines('hi aaaaaaaaaa there', 50, measure)).toEqual(['hi', 'aaaaa', 'aaaaa', 'there']);
  });

  // Real titles are the point: this is the shape of a long subtitled one.
  it('wraps a long title into readable lines', () => {
    const lines = wrapLines('1 & 2 Thessalonians: An Introduction and Study Guide', 200, measure);
    expect(lines.every((line) => measure(line) <= 200)).toBe(true);
    expect(lines.join(' ')).toBe('1 & 2 Thessalonians: An Introduction and Study Guide');
  });
});
