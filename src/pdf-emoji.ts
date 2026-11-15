// Color emoji in a pdf-lib PDF, the way Chromium's PDF writer does it.
//
// **What Chromium does** (read off an Obsidian Export to PDF, `Skia/PDF m150`): every emoji in the document is a glyph
// of a Type3 font — a font whose glyphs are little drawing programs — and each glyph's program draws one bitmap, with a
// soft mask for its edge. A `ToUnicode` map ties each glyph to its real character, so the emoji copies and searches as
// text while it is drawn as a picture. No color font is embedded, and no subsetter is involved: the reasons
// docs/design/marks-pdf.md gave for leaving emoji out were all about fonts.
//
// pdf-lib has no Type3 API, so the font's objects are written by hand: the glyph programs, the widths, the encoding,
// the images and the `ToUnicode` map. The pictures come from the caller — on a device, a canvas drawing each emoji in
// the device's own emoji font (`emoji-canvas.ts`). Nothing here touches Obsidian or the DOM.
//
// **By how the character is shown.** An emoji shown as one by default, or asked for as one, is a picture whatever
// fonts there are; a symbol shown as text by default is the font's glyph where a face has one, and a picture only where
// none does. Anything asked for as text stays text. See `EmojiFonts.isPicture`.

import type { PDFDocument, PDFPage, PDFRef } from 'pdf-lib';

/** Glyph space: 1000 units to the em, the usual for a Type3 font. */
export const EMOJI_UNITS = 1000;

/** One emoji as a picture, and where the picture sits in glyph space. */
export interface EmojiGlyph {
  text: string;
  png: Uint8Array;
  /** Advance width, in glyph units. */
  advance: number;
  /** The image's height, and how far it sits below the baseline, in glyph units. */
  height: number;
  descent: number;
}

/**
 * Where the pictures come from. `measure` answers at once, so a line can be laid out before anything is drawn;
 * `draw` runs when the PDF is saved, once for each distinct emoji in it.
 */
export interface EmojiPictures {
  /** The emoji's advance and its picture's box, in glyph units. */
  measure(emoji: string): Omit<EmojiGlyph, 'text' | 'png'>;
  draw(emoji: string): Promise<Uint8Array>;
}

/** Most glyphs one Type3 font can hold, since its codes are one byte and 0 is left unused. */
const EMOJI_PER_FONT = 255;

/** Whether one grapheme is an emoji: a pictograph, a flag's regional indicators, or a keycap. */
function isEmoji(cluster: string): boolean {
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(cluster);
}

/** Split text into graphemes, so a family joined by zero-width joiners, or a flag, is one glyph. */
export function graphemes(text: string): string[] {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
}

/**
 * Where in `text` each picture starts, and where it ends — a whole grapheme, so a family joined by zero-width
 * joiners, or a flag, is one picture. Offsets are UTF-16, the same ones every mark is stored in.
 */
function pictureRanges(text: string, isPicture: (cluster: string) => boolean): Map<number, number> {
  const ranges = new Map<number, number>();
  let at = 0;
  for (const g of graphemes(text)) {
    if (isPicture(g)) ranges.set(at, at + g.length);
    at += g.length;
  }
  return ranges;
}

/** A string as UTF-16 big-endian hex, which is what a `ToUnicode` map maps a glyph to. */
function utf16Hex(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return out;
}

/**
 * Add a Type3 font whose glyphs are `glyphs`, coded 1, 2, 3… in their order — at most `EMOJI_PER_FONT`. Show glyph
 * `n` with the one-byte string `n`. Given `ref`, the font is written there: a page can name a font reserved before
 * its pictures exist, which is how the writer sets a line before anything is drawn.
 */
async function embedEmojiFont(
  lib: typeof import('pdf-lib'),
  doc: PDFDocument,
  glyphs: readonly EmojiGlyph[],
  ref?: PDFRef
): Promise<PDFRef> {
  const { PDFName } = lib;
  const ctx = doc.context;
  const xobjects: Record<string, PDFRef> = {};
  const charProcs: Record<string, PDFRef> = {};
  const differences: (number | ReturnType<typeof PDFName.of>)[] = [1];
  let top = 0;
  let bottom = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const image = await doc.embedPng(g.png);
    xobjects[`E${i + 1}`] = image.ref;
    // `d0`: a color glyph — it paints in its own colors rather than taking the text's.
    const program = `${g.advance} 0 d0\n${g.advance} 0 0 ${g.height.toFixed(1)} 0 ${(-g.descent).toFixed(1)} cm\n/E${i + 1} Do\n`;
    charProcs[`e${i + 1}`] = ctx.register(ctx.flateStream(program));
    differences.push(PDFName.of(`e${i + 1}`));
    top = Math.max(top, g.height - g.descent);
    bottom = Math.min(bottom, -g.descent);
  }
  const cmap = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange <00> <FF> endcodespacerange',
    `${glyphs.length} beginbfchar`,
    ...glyphs.map((g, i) => `<${(i + 1).toString(16).padStart(2, '0').toUpperCase()}> <${utf16Hex(g.text)}>`),
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
  const font = ctx.obj({
    Type: 'Font',
    Subtype: 'Type3',
    FontBBox: [0, Math.floor(bottom), Math.max(...glyphs.map((g) => g.advance)), Math.ceil(top)],
    FontMatrix: [1 / EMOJI_UNITS, 0, 0, 1 / EMOJI_UNITS, 0, 0],
    CharProcs: ctx.obj(charProcs),
    Encoding: ctx.obj({ Type: 'Encoding', Differences: differences }),
    FirstChar: 1,
    LastChar: glyphs.length,
    Widths: glyphs.map((g) => g.advance),
    Resources: ctx.obj({ XObject: ctx.obj(xobjects) }),
    ToUnicode: ctx.register(ctx.flateStream(cmap)),
  });
  if (!ref) return ctx.register(font);
  ctx.assign(ref, font);
  return ref;
}

/**
 * Every distinct emoji one document uses, and the Type3 font and code it was given.
 *
 * **Measured now, drawn at save.** A line is laid out as it is written, so an emoji's width has to be known then —
 * `EmojiPictures.measure` answers at once. Its picture is drawn once, when the PDF is saved, into a font object
 * reserved now so a page can name it before it exists. A font holds `EMOJI_PER_FONT`; a document with more takes
 * another.
 */
export class EmojiFonts {
  private readonly fonts: { ref: PDFRef; name: string; emoji: string[] }[] = [];
  private readonly placed = new Map<string, { font: number; code: number; advance: number }>();
  /** Kept for the strings in use, since a table measures every cell before it draws any. */
  private readonly ranges = new Map<string, Map<number, number>>();

  /** @param covers whether one of the document's faces can draw a code point, as text. */
  constructor(
    private readonly lib: typeof import('pdf-lib'),
    private readonly doc: PDFDocument,
    private readonly pictures: EmojiPictures,
    private readonly covers: (code: number) => boolean
  ) {}

  /**
   * Whether a grapheme is drawn as a picture — by how Unicode says it is SHOWN, which is how the reader saw it on screen.
   *
   * - **Asked for as text** — followed by U+FE0E, as a footnote's `↩︎` back-link is: never a picture.
   * - **Shown as an emoji** — by default (`Emoji_Presentation`: 😀, 📚, 🟡), with U+FE0F, or as a sequence (a skin tone,
   *   a joined family, a flag, a keycap): always a picture, even where a face has a plain glyph for it. DejaVu Sans has a
   *   black 😀, and it does not copy back out as 😀.
   * - **A symbol shown as text by default** — ♥ © ↩ ✓ ☐: the face's glyph where one has it, a picture only where none
   *   does.
   */
  isPicture(cluster: string): boolean {
    if (!isEmoji(cluster) || cluster.includes('\uFE0E')) return false;
    const points = [...cluster];
    if (points.length > 1 || /\p{Emoji_Presentation}/u.test(cluster)) return true;
    return !this.covers(points[0].codePointAt(0) ?? 0);
  }

  /** Where each picture is in `text`, start to end — see `pictureRanges`. */
  rangesIn(text: string): ReadonlyMap<number, number> {
    let ranges = this.ranges.get(text);
    if (!ranges) {
      if (this.ranges.size > 256) this.ranges.clear();
      ranges = pictureRanges(text, (g) => this.isPicture(g));
      this.ranges.set(text, ranges);
    }
    return ranges;
  }

  /** The emoji's advance width, in glyph units. */
  advance(emoji: string): number {
    return this.place(emoji).advance;
  }

  /**
   * Set `emoji` at `x` on the baseline, and answer how wide it was. In its own colors whatever the line's: a picture
   * glyph paints itself, which is also why a linked emoji is not tinted.
   */
  draw(page: PDFPage, emoji: string, x: number, baseline: number, size: number): number {
    const { lib } = this;
    const glyph = this.place(emoji);
    const font = this.fonts[glyph.font];
    page.node.setFontDictionary(lib.PDFName.of(font.name), font.ref);
    page.pushOperators(
      lib.beginText(),
      lib.setFontAndSize(font.name, size),
      lib.moveText(x, baseline),
      lib.showText(lib.PDFHexString.of(glyph.code.toString(16).padStart(2, '0'))),
      lib.endText()
    );
    return (glyph.advance / EMOJI_UNITS) * size;
  }

  /** Draw every picture the document used, and write each font where its pages already point. */
  async embed(): Promise<void> {
    for (const block of this.fonts) {
      const glyphs: EmojiGlyph[] = [];
      for (const emoji of block.emoji) {
        glyphs.push({ text: emoji, ...this.pictures.measure(emoji), png: await this.pictures.draw(emoji) });
      }
      await embedEmojiFont(this.lib, this.doc, glyphs, block.ref);
    }
  }

  private place(emoji: string): { font: number; code: number; advance: number } {
    const had = this.placed.get(emoji);
    if (had) return had;
    let block = this.fonts[this.fonts.length - 1];
    if (!block || block.emoji.length === EMOJI_PER_FONT) {
      block = { ref: this.doc.context.nextRef(), name: `OrbisEmoji${this.fonts.length + 1}`, emoji: [] };
      this.fonts.push(block);
    }
    block.emoji.push(emoji);
    const placed = {
      font: this.fonts.length - 1,
      code: block.emoji.length,
      advance: this.pictures.measure(emoji).advance,
    };
    this.placed.set(emoji, placed);
    return placed;
  }
}
