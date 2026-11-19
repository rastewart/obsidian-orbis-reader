// foliate's MOBI reader decodes character references in metadata and contents labels (ORBIS patch 32). Upstream
// did it by setting a <textarea>'s HTML and reading its value; the patch parses the text in an inert document instead.
// Each must give what the textarea gave, so the textarea is kept here as the reference.

import { unescapeHTML } from 'foliate-js/mobi.js';
import { describe, expect, it } from 'vitest';

/** Upstream's version, unchanged. */
function upstream(str: string): string {
  if (!str) return '';
  const textarea = document.createElement('textarea');
  // eslint-disable-next-line no-unsanitized/property -- upstream's code, kept as the reference the patch must match
  textarea.innerHTML = str;
  return textarea.value;
}

/** A seeded generator, so a failure names a string that comes back on the next run. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('unescapeHTML (ORBIS patch 32)', () => {
  const CASES = [
    '',
    'Plain title',
    'Pride &amp; Prejudice',
    'Caf&eacute; &#233; &#xE9; &#XE9;',
    'Tom &amp Jerry',
    '&notin; &not &noti &notit;',
    'AT&T & friends;',
    '<b>bold</b> &lt;i&gt;',
    '</textarea><script>alert(1)</script>',
    '<!-- a comment --> <![CDATA[x]]>',
    '\nleading line feed',
    '  spaces  ',
    'line\r\nbreaks\rhere',
    'nul\0here &amp;\0',
    '&#0; &#x110000; &#128; &#xD800;',
    '&amp&lt;&',
    '&;&#;&#x;',
  ];
  it.each(CASES)('gives what upstream gave for %j', (str) => {
    expect(unescapeHTML(str)).toBe(upstream(str));
  });

  it('gives what upstream gave for 5,000 random strings', () => {
    const alphabet = [
      '&',
      '&',
      ';',
      '#',
      'x',
      'amp',
      'lt',
      'not',
      'in',
      '12',
      '9',
      '<',
      '>',
      '/',
      'b',
      'textarea',
      ' ',
      '\n',
      '\r',
      '\0',
      'é',
      'a',
    ];
    const rnd = seeded(32);
    for (let n = 0; n < 5000; n++) {
      const s = Array.from(
        { length: Math.floor(rnd() * 16) },
        () => alphabet[Math.floor(rnd() * alphabet.length)]
      ).join('');
      expect(unescapeHTML(s), JSON.stringify(s)).toBe(upstream(s));
    }
  });

  it('makes no element from the text', () => {
    const before = document.querySelectorAll('*').length;
    expect(unescapeHTML('<img src=x onerror="globalThis.hit=1">&amp;')).toBe('<img src=x onerror="globalThis.hit=1">&');
    expect((globalThis as { hit?: number }).hit).toBeUndefined();
    expect(document.querySelectorAll('*').length).toBe(before);
  });
});
