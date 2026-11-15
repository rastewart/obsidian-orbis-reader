// An emoji's picture for a PDF, drawn on a canvas in the device's own emoji font — Apple's on a Mac, an iPhone or an
// iPad; Google's or Samsung's on Android — so it looks in the PDF as it does on the screen. See pdf-emoji.ts for how a
// picture becomes a glyph.
//
// **96 pixels to the em.** Chromium draws 66; more is sharper zoomed or printed, and the test on all four devices put
// a 128-pixel emoji at 6–9 KB, so 96 keeps a page of them to a few KB each.

import type { EmojiGlyph, EmojiPictures } from './pdf-emoji';
import { EMOJI_UNITS } from './pdf-emoji';

const RASTER_PX = 96;
const EMOJI_FONTS = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif';

/** The device's emoji, or null where there is no canvas to draw them on. */
export function canvasEmojiPictures(): EmojiPictures | null {
  const canvas = createEl('canvas'); // detached — only its pixels are read
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = `${RASTER_PX}px ${EMOJI_FONTS}`;
  const scale = EMOJI_UNITS / RASTER_PX;

  /** The box in canvas pixels: the font's ascent and descent rather than the glyph's own, so every emoji sits on the
   *  same baseline at the same height. */
  const box = (emoji: string): { width: number; ascent: number; descent: number } => {
    ctx.font = font;
    const m = ctx.measureText(emoji);
    return {
      width: Math.max(1, Math.ceil(m.width)),
      ascent: m.fontBoundingBoxAscent || RASTER_PX * 0.95,
      descent: m.fontBoundingBoxDescent || RASTER_PX * 0.25,
    };
  };

  const measured = new Map<string, Omit<EmojiGlyph, 'text' | 'png'>>();
  return {
    measure: (emoji) => {
      const had = measured.get(emoji);
      if (had) return had;
      const b = box(emoji);
      const glyph = {
        advance: Math.round(b.width * scale),
        height: (b.ascent + b.descent) * scale,
        descent: b.descent * scale,
      };
      measured.set(emoji, glyph);
      return glyph;
    },
    draw: async (emoji) => {
      const b = box(emoji);
      canvas.width = b.width;
      canvas.height = Math.ceil(b.ascent + b.descent);
      // Resizing the canvas resets its context, so the font is set again before drawing.
      ctx.font = font;
      ctx.textBaseline = 'alphabetic';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText(emoji, 0, b.ascent);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The canvas gave no image');
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
}
