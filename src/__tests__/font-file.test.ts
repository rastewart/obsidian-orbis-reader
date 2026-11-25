// What a font file says about itself — read from a minimal TrueType file built here, table by table, so each fact
// the reader depends on is set on purpose.

import { describe, expect, it } from 'vitest';
import { embeddingAllowed, facesCovered, readFontFile } from '../font-file';
import { fontBytes, type Spec } from './font-bytes';

const info = (spec: Spec) => {
  const r = readFontFile(fontBytes(spec));
  if (!r.ok) throw new Error(`refused: ${r.problem}`);
  return r.info;
};

describe('readFontFile', () => {
  it('reads the family, the face and the embedding bits', () => {
    expect(info({ weight: 700, fsSelection: 0x21, fsType: 8 })).toMatchObject({
      family: 'Test Sans',
      subfamily: 'Regular',
      weight: 700,
      italic: true,
      fsType: 8,
      weightRange: null,
      format: 'ttf',
    });
  });

  it('prefers the typographic family, so a Light face joins its family rather than one of its own', () => {
    const font = info({ names: { 1: 'Test Sans Light', 2: 'Regular', 16: 'Test Sans', 17: 'Light' }, weight: 300 });
    expect(font.family).toBe('Test Sans');
    expect(font.subfamily).toBe('Light');
  });

  it('counts oblique as italic', () => {
    expect(info({ fsSelection: 0x200 }).italic).toBe(true);
  });

  it('reads the style from the head table when there is no OS/2', () => {
    expect(info({ noOs2: true, macStyle: 3 })).toMatchObject({ weight: 700, italic: true });
  });

  it('reads a variable font’s weight axis', () => {
    expect(info({ wght: [100, 900] }).weightRange).toEqual([100, 900]);
  });

  it('reads an OpenType file', () => {
    expect(info({ tag: 'OTTO' }).format).toBe('otf');
  });

  it('refuses web fonts, collections and anything else, without throwing', () => {
    expect(readFontFile(fontBytes({ tag: 'wOF2' }))).toEqual({ ok: false, problem: 'web-font' });
    expect(readFontFile(fontBytes({ tag: 'wOFF' }))).toEqual({ ok: false, problem: 'web-font' });
    expect(readFontFile(fontBytes({ tag: 'ttcf' }))).toEqual({ ok: false, problem: 'collection' });
    expect(readFontFile(new TextEncoder().encode('%PDF-1.7 not a font'))).toEqual({ ok: false, problem: 'not-a-font' });
    expect(readFontFile(fontBytes().slice(0, 40))).toEqual({ ok: false, problem: 'not-a-font' });
  });
});

describe('facesCovered', () => {
  const face = (weight: number, italic = false, weightRange: [number, number] | null = null) => ({
    weight,
    italic,
    weightRange,
  });

  it('finds all four in a static family', () => {
    expect([...facesCovered([face(400), face(400, true), face(700), face(700, true)])].sort()).toEqual([
      'bold',
      'boldItalic',
      'italic',
      'regular',
    ]);
  });

  it('counts a SemiBold as bold, and a Light as neither', () => {
    expect([...facesCovered([face(400), face(600)])].sort()).toEqual(['bold', 'regular']);
    expect([...facesCovered([face(200)])]).toEqual([]);
  });

  it('lets a variable font cover regular and bold together', () => {
    expect([...facesCovered([face(400, false, [100, 900]), face(400, true, [100, 900])])].sort()).toEqual([
      'bold',
      'boldItalic',
      'italic',
      'regular',
    ]);
  });
});

describe('embeddingAllowed', () => {
  it('refuses only Restricted License embedding', () => {
    expect(embeddingAllowed(0)).toBe(true);
    expect(embeddingAllowed(2)).toBe(false);
    expect(embeddingAllowed(4)).toBe(true);
    expect(embeddingAllowed(8)).toBe(true);
    expect(embeddingAllowed(0x0102)).toBe(false);
  });
});
