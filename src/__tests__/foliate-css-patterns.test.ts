// foliate's two stylesheet patterns, rewritten so crafted CSS cannot freeze the reader (ORBIS patches 25 and 26).
// Each must find exactly what upstream's pattern found, so the upstream patterns
// are kept here as the reference.

import { cssURLMatches } from 'foliate-js/epub.js';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from 'foliate-js/paginator.js';
import { describe, expect, it } from 'vitest';

const UPSTREAM_URL = /url\(\s*["']?([^'"\n]*?)\s*["']?\s*\)/gi;
const UPSTREAM_VW = /(\d*\.?\d+)vw/gi;
const UPSTREAM_VH = /(\d*\.?\d+)vh/gi;

/** Every match of a pattern as `offset|match|group`, one per line. */
function matchesOf(re: RegExp | { [Symbol.replace](s: string, fn: (...a: unknown[]) => string): string }, s: string) {
  const out: string[] = [];
  s.replace(re as RegExp, (m: string, g: string, i: number) => {
    out.push(`${i}|${m}|${g}`);
    return m;
  });
  return out.join('\n');
}
const urls = (s: string) =>
  cssURLMatches(s)
    .map((x) => `${x.index}|${x.match}|${x.url}`)
    .join('\n');

/** A seeded generator, so a failure names a string that comes back on the next run. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randomStrings = (alphabet: string[], count: number, seed: number) => {
  const rnd = seeded(seed);
  return Array.from({ length: count }, () =>
    Array.from({ length: Math.floor(rnd() * 24) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('')
  );
};

describe('cssURLMatches (ORBIS patch 25)', () => {
  const CASES = [
    'a { background: url(img/a.png) }',
    'a{background:url( "img/a b.png" )} b{background:URL(\'c.png\')}',
    '@font-face { src: url(fonts/x.woff2) format("woff2"), url( fonts/x.woff ) }',
    'url()',
    'url(  )',
    "url(')",
    'url("a"b")',
    "url('a)b')",
    'url(a\nb) url(c)',
    'url(a\n) url( "x" \n )',
    'url(url(url(a)',
    'url("x',
    'li { list-style: url(data:image/svg+xml;utf8,<svg/>) }',
  ];
  it.each(CASES)('finds what upstream found in %j', (css) => {
    expect(urls(css)).toBe(matchesOf(UPSTREAM_URL, css));
  });

  it('finds what upstream found in 50,000 random strings', () => {
    const alphabet = [
      'url(',
      'URL(',
      'u',
      'r',
      'l',
      '(',
      ')',
      ')',
      '"',
      "'",
      '\n',
      ' ',
      ' ',
      '\t',
      '\r',
      'a',
      '/',
      ' ',
    ];
    for (const s of randomStrings(alphabet, 50000, 25))
      expect(urls(s), JSON.stringify(s)).toBe(matchesOf(UPSTREAM_URL, s));
  });

  // Upstream took about 6 s here in V8; the time is a rough bound, far above what one pass takes.
  it('takes no time over a url( followed by 600 spaces and no )', () => {
    const css = `a{background:url(${' '.repeat(600)}`;
    const started = performance.now();
    expect(cssURLMatches(css)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('VIEWPORT_WIDTH and VIEWPORT_HEIGHT (ORBIS patch 26)', () => {
  const CASES = [
    'width: 50vw',
    'height:100.5vh',
    'margin: .5vw 2vw',
    '1.2.3vw',
    '12.vw 3VW 4Vh',
    'calc(100vw - 2em)',
    '5vwvw',
  ];
  it.each(CASES)('find what upstream found in %j', (css) => {
    expect(matchesOf(VIEWPORT_WIDTH, css)).toBe(matchesOf(UPSTREAM_VW, css));
    expect(matchesOf(VIEWPORT_HEIGHT, css)).toBe(matchesOf(UPSTREAM_VH, css));
  });

  it('find what upstream found in 50,000 random strings', () => {
    const alphabet = ['1', '2', '0', '.', '.', 'v', 'w', 'h', 'V', 'W', 'H', 'vw', 'vh', ' ', 'a', '-', '9'];
    for (const s of randomStrings(alphabet, 50000, 26)) {
      expect(matchesOf(VIEWPORT_WIDTH, s), JSON.stringify(s)).toBe(matchesOf(UPSTREAM_VW, s));
      expect(matchesOf(VIEWPORT_HEIGHT, s), JSON.stringify(s)).toBe(matchesOf(UPSTREAM_VH, s));
    }
  });

  // Upstream took about 4 s here in V8.
  it('take no time over 3,000 digits that end in neither', () => {
    const css = `/* ${'1'.repeat(3000)} */`;
    const started = performance.now();
    expect(css.replace(VIEWPORT_WIDTH, 'x').replace(VIEWPORT_HEIGHT, 'x')).toBe(css);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
