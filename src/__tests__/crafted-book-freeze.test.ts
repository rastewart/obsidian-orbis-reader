// Patterns a crafted book could make slow enough to freeze Obsidian, rewritten to run in one pass (November security
// scan, M3, M4 and M6). Each is checked against the pattern it replaced, kept here as the reference, and on an input
// the old one took seconds or minutes over.

import { replaceSrcset } from 'foliate-js/epub.js';
import { describe, expect, it } from 'vitest';
import { fb2CoverBinary } from '../library/cover-source';
import { escapeStyleText } from '../reader/book-html-guard';

/** The time `run` takes, in ms. */
function timed(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

/** A string of `n` characters drawn from `alphabet`, the same for the same seed. */
function random(alphabet: string, n: number, seed: number): string {
  let x = seed;
  let out = '';
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out += alphabet[x % alphabet.length];
  }
  return out;
}

describe('escapeStyleText (the guard’s own stylesheet escaping)', () => {
  const UPSTREAM = (css: string) =>
    css.replace(/(\\*)<(!--)?/g, (_m, slashes: string, cdo: string | undefined) => {
      if (slashes.length % 2 === 1) return `${slashes.slice(0, -1)}\\3c ${cdo ?? ''}`;
      return cdo ? `${slashes} ` : `${slashes}\\3c `;
    });

  it('gives exactly what the pattern it replaced gave', () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const css = random('\\<!-a ', 1 + (seed % 40), seed);
      expect(escapeStyleText(css), JSON.stringify(css)).toBe(UPSTREAM(css));
    }
  });

  it('runs through a long run of backslashes at once (256 KB took 27 s)', () => {
    expect(timed(() => escapeStyleText(`${'\\'.repeat(262_144)}x<`))).toBeLessThan(500);
  });
});

describe('replaceSrcset (ORBIS patch 28)', () => {
  const load = async (url: string) => `blob:${url}`;

  it('replaces each address and keeps everything else as written', async () => {
    expect(await replaceSrcset('a.jpg 1x, b.jpg 2x', load)).toBe('blob:a.jpg 1x, blob:b.jpg 2x');
    expect(await replaceSrcset(' a.jpg  480w ,b.jpg 800w', load)).toBe(' blob:a.jpg  480w ,blob:b.jpg 800w');
    expect(await replaceSrcset('a.jpg,b.jpg', load)).toBe('blob:a.jpg,b.jpg');
    expect(await replaceSrcset('a.jpg, b.jpg', load)).toBe('blob:a.jpg, blob:b.jpg');
    expect(await replaceSrcset('only.jpg', load)).toBe('blob:only.jpg');
  });

  it('runs through a crafted srcset at once (64 KB took four seconds)', async () => {
    const crafted = `a${' '.repeat(65_536)}b`;
    const start = performance.now();
    await replaceSrcset(crafted, load);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('runs through a run of commas inside one address at once (64 KB took two seconds)', async () => {
    const crafted = `a${','.repeat(65_536)}b`;
    const start = performance.now();
    expect(await replaceSrcset(crafted, load)).toBe(`blob:${crafted}`);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('still keeps an address’s trailing commas out of it', async () => {
    expect(await replaceSrcset('a.jpg,,, b.jpg', load)).toBe('blob:a.jpg,,, blob:b.jpg');
  });
});

describe('fb2CoverBinary', () => {
  it('finds the cover its <coverpage> names', () => {
    const xml =
      '<FictionBook><description><coverpage><image l:href="#c.jpg"/></coverpage></description>' +
      '<binary id="other.jpg" content-type="image/jpeg">AAAA</binary>' +
      '<binary id="c.jpg" content-type="image/png">QUJD\nREVG</binary></FictionBook>';
    expect(fb2CoverBinary(xml)).toEqual({ base64: 'QUJDREVG', mime: 'image/png' });
  });

  it('falls back to a binary that calls itself a cover', () => {
    const xml = '<FictionBook><binary id="my-cover.jpg">QUJD</binary></FictionBook>';
    expect(fb2CoverBinary(xml)).toEqual({ base64: 'QUJD', mime: 'image/jpeg' });
  });

  it('runs through a crafted file at once (16 KB took 22 s, 64 KB about 24 minutes)', () => {
    const crafted = `${'<coverpage>'.repeat(2000)}${'<image abcdefgh'.repeat(4000)}`;
    // 2 s, not less: about 0.2 s alone, past 0.5 s under a full parallel run, and the pattern it replaced took 22 s.
    expect(timed(() => fb2CoverBinary(crafted))).toBeLessThan(2000);
    const binaries = `${'<binary '.repeat(20_000)}`;
    expect(timed(() => fb2CoverBinary(binaries))).toBeLessThan(2000);
  });
});
