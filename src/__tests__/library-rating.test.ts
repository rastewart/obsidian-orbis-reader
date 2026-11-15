import { describe, expect, it } from 'vitest';
import { nextRating, OFFERED_RATINGS } from '../library/rating';

describe('OFFERED_RATINGS', () => {
  it('is half steps from zero to five', () => {
    expect(OFFERED_RATINGS).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });

  // **Zero is offered as a value**, because "I really did not like it" is a rating and not the absence of one.
  it('offers zero', () => {
    expect(OFFERED_RATINGS).toContain(0);
  });
});

describe('nextRating', () => {
  it('sets the rating that was chosen', () => {
    expect(nextRating(null, 4)).toBe(4);
    expect(nextRating(2, 4)).toBe(4);
  });

  // **Choosing the rating a note already has clears it**, exactly as choosing its current status does — so rating
  // and un-rating are one gesture and the menu needs no "no rating" item to explain. A mis-tapped 3 is undone by
  // tapping 3 again, without having to remember what it was before.
  it('clears the rating that is already set', () => {
    expect(nextRating(3, 3)).toBeNull();
  });

  // The trap in the whole feature: 0 is falsy, so anything written with `||` or a bare truthiness test treats a
  // book you hated as one you never rated.
  it('treats a zero rating as a rating', () => {
    expect(nextRating(0, 1)).toBe(1);
    expect(nextRating(0, 0)).toBeNull();
    expect(nextRating(null, 0)).toBe(0);
  });

  it('sets and clears a half step', () => {
    expect(nextRating(null, 2.5)).toBe(2.5);
    expect(nextRating(2.5, 2.5)).toBeNull();
    expect(nextRating(2.5, 3)).toBe(3);
  });
});
