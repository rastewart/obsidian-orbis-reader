import { describe, expect, it } from 'vitest';
import { parseSpacing, STORAGE_KEY_WORD_SPACING, spacingForKey, textSpacingCss } from '../text-spacing';

describe('parseSpacing', () => {
  it('reads a stored percentage as a whole number inside its range', () => {
    expect(parseSpacing('letterSpacing', '12')).toBe(12);
    expect(parseSpacing('wordSpacing', '16.4')).toBe(16);
    expect(parseSpacing('letterSpacing', '80')).toBe(25);
    expect(parseSpacing('paragraphSpacing', '-5')).toBe(0);
  });

  it("reads anything missing or unreadable as the book's", () => {
    for (const v of [null, undefined, '', 'wide']) expect(parseSpacing('wordSpacing', v)).toBe(0);
  });
});

describe('spacingForKey', () => {
  it('names the setting a storage key holds, and nothing for any other key', () => {
    expect(spacingForKey(STORAGE_KEY_WORD_SPACING)).toBe('wordSpacing');
    expect(spacingForKey('orbis-margins')).toBeUndefined();
  });
});

describe('textSpacingCss', () => {
  it('writes nothing for the book’s spacing', () => {
    expect(textSpacingCss({ letterSpacing: 0, wordSpacing: 0, paragraphSpacing: 0 })).toEqual([]);
  });

  it('leaves the letters of joined scripts together', () => {
    const [rule] = textSpacingCss({ letterSpacing: 10, wordSpacing: 0, paragraphSpacing: 0 });
    for (const lang of ['ar', 'fa', 'ur', 'syr']) expect(rule).toContain(`:lang(${lang})`);
  });

  it('writes only the spacings that are set', () => {
    const rules = textSpacingCss({ letterSpacing: 0, wordSpacing: 25, paragraphSpacing: 0 });
    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain('word-spacing: 0.25em');
  });
});
