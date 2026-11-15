import { describe, expect, it } from 'vitest';
import { createPdfWriter, MARGIN, PAGE } from '../pdf-writer';

describe('the page cursor', () => {
  it('does not turn a page that nothing has been drawn on', async () => {
    /**
     * A full-page illustration asks for more room than a column has, every time. Without this guard it turns a
     * page that is ALREADY empty, and the export gains a blank sheet in front of every plate.
     * Nothing can be gained by turning an untouched page, so the block draws where it is whatever its height.
     */
    const w = await createPdfWriter();
    w.ensure(PAGE.height * 2);
    w.text('After asking for more room than any page has', { font: 'body', size: 11 });
    expect(w.doc.getPageCount()).toBe(1);
  });

  it('still turns the page once something is on it', async () => {
    const w = await createPdfWriter();
    w.text('A line', { font: 'body', size: 11 });
    w.ensure(PAGE.height);
    w.text('The next block', { font: 'body', size: 11 });
    expect(w.doc.getPageCount()).toBe(2);
  });

  it('treats a page it has just turned to as untouched', async () => {
    // Two oversized blocks in a row is one page each, not one page each plus a blank.
    const w = await createPdfWriter();
    for (let i = 0; i < 3; i++) {
      w.ensure(PAGE.height - MARGIN.top - MARGIN.bottom + 10);
      w.text(`Block ${i}`, { font: 'body', size: 11 });
    }
    expect(w.doc.getPageCount()).toBe(3);
  });
});

// ── Emoji as pictures ────────────────────────────────────────────────────────

/** A 1×1 transparent PNG: what each stand-in emoji is drawn as. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0)
);

/** Every emoji one em wide, and a record of which ones the writer asked about. */
function standIn() {
  const measured = new Set<string>();
  const drawn: string[] = [];
  return {
    measured,
    drawn,
    pictures: {
      measure: (emoji: string) => {
        measured.add(emoji);
        return { advance: 1000, height: 1200, descent: 250 };
      },
      draw: async (emoji: string) => {
        drawn.push(emoji);
        return PNG;
      },
    },
  };
}

/** Every Type3 font in a saved PDF, with its glyph count and its `ToUnicode` map as text. */
async function type3Fonts(bytes: Uint8Array) {
  const lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.load(bytes);
  const out: { glyphs: number; toUnicode: string }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof lib.PDFDict) || String(obj.lookup(lib.PDFName.of('Subtype'))) !== '/Type3') continue;
    const procs = obj.lookup(lib.PDFName.of('CharProcs'), lib.PDFDict);
    const cmap = obj.lookup(lib.PDFName.of('ToUnicode'));
    const text = cmap instanceof lib.PDFRawStream ? String.fromCharCode(...lib.decodePDFRawStream(cmap).decode()) : '';
    out.push({ glyphs: procs.entries().length, toUnicode: text });
  }
  return out;
}

describe('emoji as pictures', () => {
  it('draws an emoji no face has as a glyph that copies as itself', async () => {
    const { pictures, drawn } = standIn();
    const w = await createPdfWriter(undefined, pictures);
    w.text('Mark 😀 here, and 😀 again', { font: 'body', size: 11 });
    const fonts = await type3Fonts(await w.save());
    expect(fonts).toHaveLength(1);
    expect(fonts[0].glyphs).toBe(1);
    expect(fonts[0].toUnicode).toContain('<01> <D83DDE00>');
    // Drawn once, however often it appears.
    expect(drawn).toEqual(['😀']);
  });

  it('counts the emoji in a line’s width, so wrapping and marks stay where they belong', async () => {
    const w = await createPdfWriter(undefined, standIn().pictures);
    const expected = w.width('body', 10, 'a') + 10 + w.width('body', 10, 'b');
    expect(w.width('body', 10, 'a😀b')).toBeCloseTo(expected, 5);
  });

  it('draws a character asked to be shown as an emoji as a picture, and leaves the plain one as text', async () => {
    const { pictures, measured } = standIn();
    const w = await createPdfWriter(undefined, pictures);
    w.text('Plain © and the emoji ©️', { font: 'body', size: 11 });
    expect([...measured]).toEqual(['©️']);
  });

  it('keeps a family joined by zero-width joiners, a skin tone and a flag each one picture', async () => {
    const { pictures, measured } = standIn();
    const w = await createPdfWriter(undefined, pictures);
    w.text('👨‍👩‍👧 👍🏽 🇯🇵', { font: 'body', size: 11 });
    expect([...measured]).toEqual(['👨‍👩‍👧', '👍🏽', '🇯🇵']);
  });

  it('leaves the gap it always did without a picture source', async () => {
    const w = await createPdfWriter();
    expect(w.width('body', 10, 'a😀b')).toBeCloseTo(w.width('body', 10, 'a  b'), 5);
  });

  it('starts a second font past 255 emoji', async () => {
    const { pictures, measured } = standIn();
    const w = await createPdfWriter(undefined, pictures);
    // Some code points here are skin-tone modifiers, which join the space before them rather than standing alone,
    // so the count is whatever the writer found to draw.
    const many = Array.from({ length: 300 }, (_, i) => String.fromCodePoint(0x1f300 + i)).join(' ');
    w.text(many, { font: 'body', size: 11 });
    const fonts = await type3Fonts(await w.save());
    expect(measured.size).toBeGreaterThan(255);
    expect(fonts.map((f) => f.glyphs)).toEqual([255, measured.size - 255]);
  });
});
