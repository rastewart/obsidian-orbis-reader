// What "~N left" adds up while a recorded track plays — see `bookSecondsAfter`.

import { describe, expect, it } from 'vitest';
import { bookSecondsAfter } from '../reader/tts/book-left';

// *Long Chapter*: a textless cover, Chapter One, three slices of the long chapter, Chapter Three.
const WORDS = [0, 465, 4650, 4650, 4650, 465];

describe('the time left in the book on a recorded track', () => {
  it('counts the unrecorded tracks too, at the live estimate', () => {
    // Chapter One playing from a recording; Chapter Three recorded (120 s); the long chapter not recorded.
    const left = bookSecondsAfter(1, new Map([[5, 120]]), WORDS, 155);
    expect(left).toBe(120 + 3 * 1800);
  });

  it('uses a recorded track’s real length rather than its estimate', () => {
    expect(bookSecondsAfter(4, new Map([[5, 200]]), WORDS, 155)).toBe(200);
  });

  it('is nothing after the last track', () => {
    expect(bookSecondsAfter(5, new Map(), WORDS, 155)).toBe(0);
  });
});
