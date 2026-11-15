// Which characters a PDF draws as a picture, and which stay text — by how Unicode says each is shown, which is how the
// reader saw it on screen. Found on the Kitchen Sink fixture: a footnote's `↩︎` back-link came out as an invisible
// picture, and DejaVu's black 😀 printed in place of the color one and did not copy back out.

import { describe, expect, it } from 'vitest';
import { EmojiFonts } from '../pdf-emoji';

const pictures = {
  measure: () => ({ advance: 1000, height: 1200, descent: 250 }),
  draw: async () => new Uint8Array(),
};

/** A document whose faces draw everything (`DejaVu`-like), or nothing beyond plain text. */
async function fonts(faceHasEverything: boolean): Promise<EmojiFonts> {
  const lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.create();
  return new EmojiFonts(lib, doc, pictures, () => faceHasEverything);
}

describe('EmojiFonts.isPicture', () => {
  it('never draws a character asked for as text, such as a footnote back-link', async () => {
    for (const all of [true, false]) expect((await fonts(all)).isPicture('↩︎')).toBe(false);
  });

  it('draws an emoji shown as one by default as a picture, even where a face has a plain glyph for it', async () => {
    const f = await fonts(true);
    for (const emoji of ['😀', '📚', '🟡', '✨']) expect(f.isPicture(emoji)).toBe(true);
  });

  it('draws a sequence or the emoji selector as a picture', async () => {
    const f = await fonts(true);
    for (const emoji of ['👍🏽', '👨‍👩‍👧', '🇯🇵', '1️⃣', '©️', '♥️']) expect(f.isPicture(emoji)).toBe(true);
  });

  it('leaves a symbol shown as text by default to the face that has it, and draws it only where none does', async () => {
    for (const symbol of ['♥', '©', '↩']) {
      expect((await fonts(true)).isPicture(symbol)).toBe(false);
      expect((await fonts(false)).isPicture(symbol)).toBe(true);
    }
  });

  // ✓ is a symbol but not an emoji at all: without a face for it, it falls back as plain text does.
  it('never draws plain text or a symbol that is not an emoji', async () => {
    const f = await fonts(false);
    for (const text of ['a', '→', 'é', '1', '✓']) expect(f.isPicture(text)).toBe(false);
  });
});
