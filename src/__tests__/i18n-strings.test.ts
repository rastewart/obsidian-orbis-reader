import { describe, expect, it } from 'vitest';
import en from '../i18n/en';

/**
 * Checks over the base locale itself, rather than over the code that uses it.
 *
 * The audit script already answers "is this string externalised". These answer "is the string well formed" —
 * which is the failure that reaches a screen looking deliberate. A placeholder written with one brace is not
 * substituted and is not an error; it simply prints, and only a person looking at the dialog notices.
 */
describe('the English locale', () => {
  const entries = Object.entries(en) as [string, string][];

  it('writes every placeholder with two braces', () => {
    // `t()` substitutes /\{\{(\w+)\}\}/. `{size}` matches nothing, so a dialog would show "A one-time {size} MB
    // download".
    const wrong = entries.filter(([, value]) => /(^|[^{])\{\w+\}([^}]|$)/.test(value));
    expect(wrong.map(([key]) => key)).toEqual([]);
  });

  it('leaves no placeholder half-written', () => {
    const unbalanced = entries.filter(([, value]) => {
      const stripped = value.replace(/\{\{\w+\}\}/g, '');
      return stripped.includes('{') || stripped.includes('}');
    });
    expect(unbalanced.map(([key]) => key)).toEqual([]);
  });

  it('has no key whose value is empty or only whitespace', () => {
    expect(entries.filter(([, value]) => !value.trim()).map(([key]) => key)).toEqual([]);
  });
});
