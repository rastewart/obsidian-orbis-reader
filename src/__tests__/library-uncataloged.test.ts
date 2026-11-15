import { describe, expect, it } from 'vitest';
import { shouldAlert, uncatalogedSignature } from '../library/uncataloged';

describe('uncatalogedSignature', () => {
  it('is the same set whatever order it arrives in', () => {
    expect(uncatalogedSignature(['b.epub', 'a.epub'])).toBe(uncatalogedSignature(['a.epub', 'b.epub']));
  });

  it('changes when a book joins or leaves', () => {
    const two = uncatalogedSignature(['a.epub', 'b.epub']);
    expect(uncatalogedSignature(['a.epub', 'b.epub', 'c.epub'])).not.toBe(two);
    expect(uncatalogedSignature(['a.epub'])).not.toBe(two);
  });

  // Concatenating the paths would make these the same set, and a swap would go unnoticed.
  it('separates the paths it hashes', () => {
    expect(uncatalogedSignature(['ab', 'c'])).not.toBe(uncatalogedSignature(['a', 'bc']));
  });

  it('is empty for an empty set', () => {
    expect(uncatalogedSignature([])).toBe('');
  });
});

describe('shouldAlert', () => {
  const two = ['a.epub', 'b.epub'];

  it('says nothing when there is nothing waiting, or when the notice is off', () => {
    expect(shouldAlert([], '', true)).toBe(false);
    expect(shouldAlert(two, '', false)).toBe(false);
  });

  it('speaks up for a set nobody has dismissed', () => {
    expect(shouldAlert(two, '', true)).toBe(true);
  });

  // The point of hashing the set rather than setting a flag: waving these away is not switching the notice off.
  it('stays quiet for the set that was dismissed, and returns for a new book', () => {
    const dismissed = uncatalogedSignature(two);
    expect(shouldAlert(two, dismissed, true)).toBe(false);
    expect(shouldAlert([...two, 'c.epub'], dismissed, true)).toBe(true);
  });
});
