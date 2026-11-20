// A minimal PNG writer, for the generated fixtures' covers and comic pages.
//
// Truecolour, 8 bits per channel, one IDAT, filter 0 on every row: the smallest valid PNG there is, compressed with
// fflate's zlib. Each image is a background, a border, a few bands and, on a cover, its title and format in a 5 × 7
// pixel font defined below — enough to tell `Parts and Chapters · EPUB` from `· FB2` in the Library, without shipping
// a font file.

import { zlibSync } from 'fflate';
import { FIXTURE_COVER_LINE } from './marker';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export type Rgb = readonly [number, number, number];

/** A band across the image: a color from `from` to `to` as fractions of the height. */
export interface Band {
  from: number;
  to: number;
  color: Rgb;
}

/**
 * Upper case, digits and the few marks the fixtures' titles and formats use; each glyph is seven rows of five. A
 * character missing here throws rather than drawing a gap, so a new fixture title cannot go out with a hole in it.
 */
const GLYPHS: Record<string, string> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '.###. #.... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ....# .###.',
  ' ': '..... ..... ..... ..... ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  "'": '..#.. ..#.. .#... ..... ..... ..... .....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  // For `cafe-and-co.epub`'s title, CAFÉ & CO.
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  É: '...#. ##### #.... ####. #.... #.... #####',
};

/** A line of text, centered across the image, its top at `y` (a fraction of the height), each font pixel `scale` px. */
export interface TextLine {
  text: string;
  y: number;
  scale: number;
  color: Rgb;
}

/** How wide a line is drawn: five pixels a glyph and one between them. */
const textWidth = (text: string, scale: number) => (text.length * 6 - 1) * scale;

/** An image `width` × `height`: a background, a border of `border` pixels, horizontal bands, and lines of text. */
export function png(
  width: number,
  height: number,
  background: Rgb,
  bands: readonly Band[] = [],
  border = 12,
  text: readonly TextLine[] = []
): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    const band = bands.find((b) => y >= b.from * height && y < b.to * height);
    for (let x = 0; x < width; x++) {
      const edge = x < border || y < border || x >= width - border || y >= height - border;
      const [r, g, b] = edge ? [30, 30, 30] : (band?.color ?? background);
      raw.set([r, g, b], row + 1 + x * 3);
    }
  }
  for (const line of text) {
    const left = Math.round((width - textWidth(line.text, line.scale)) / 2);
    const top = Math.round(line.y * height);
    [...line.text].forEach((ch, i) => {
      const glyph = GLYPHS[ch];
      if (!glyph) throw new Error(`png: no glyph for "${ch}" in "${line.text}"`);
      glyph.split(' ').forEach((bits, gy) => {
        for (let gx = 0; gx < 5; gx++) {
          if (bits[gx] !== '#') continue;
          for (let dy = 0; dy < line.scale; dy++) {
            for (let dx = 0; dx < line.scale; dx++) {
              const x = left + (i * 6 + gx) * line.scale + dx;
              const y = top + gy * line.scale + dy;
              if (x >= 0 && x < width && y >= 0 && y < height) raw.set(line.color, y * (width * 3 + 1) + 1 + x * 3);
            }
          }
        }
      });
    });
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolour, deflate, filter 0, no interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Words broken into lines of at most `max` characters, and the one scale at which every line fits `width` — a single
 * long word shrinks the whole block rather than overflowing the cover.
 */
export function wrapText(
  text: string,
  max: number,
  width: number,
  largest: number
): { lines: string[]; scale: number } {
  const lines: string[] = [];
  for (const word of text.toUpperCase().split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const widest = Math.max(...lines.map((l) => l.length));
  return { lines, scale: Math.min(largest, Math.floor(width / (widest * 6 - 1))) };
}

/**
 * A plate for a book's illustrations, 300 × 420: **PLATE N** across the top, a large figure in the middle, and a line
 * of small print along the bottom that can only be read by zooming in — something for the image viewer to show and
 * the zoom steps to check. `figure` is one glyph: the plate's number, or `+` for the market cross.
 */
export function plate(n: number, figure: string): Uint8Array {
  const grounds: [Rgb, Rgb][] = [
    [
      [236, 226, 204],
      [120, 70, 40],
    ],
    [
      [214, 228, 236],
      [40, 70, 110],
    ],
    [
      [222, 236, 214],
      [50, 100, 60],
    ],
    [
      [236, 218, 226],
      [110, 50, 80],
    ],
  ];
  const [bg, ink] = grounds[(n - 1) % grounds.length];
  const big = 28;
  return png(300, 420, bg, [{ from: 0.18, to: 0.2, color: ink }], 8, [
    { text: `PLATE ${n}`, y: 0.07, scale: 5, color: ink },
    { text: figure, y: 0.5 - (7 * big) / 420 / 2 + 0.03, scale: big, color: ink },
    { text: 'ZOOM IN TO READ THIS', y: 0.91, scale: 1, color: ink },
  ]);
}

/**
 * A portrait cover, 400 × 600 — the proportions a book cover has — in one of a few palettes, with the title across
 * the middle and the formats it stands for below: `EPUB`, or `EPUB + AZW3` on a title note that lists both. At the
 * foot, `FIXTURE_COVER_LINE`: what the book is.
 */
export function cover(palette: number, title: string, formats: readonly string[]): Uint8Array {
  const palettes: [Rgb, Rgb, Rgb][] = [
    [
      [52, 86, 120],
      [214, 180, 96],
      [230, 226, 214],
    ],
    [
      [120, 52, 58],
      [230, 210, 170],
      [60, 40, 40],
    ],
    [
      [48, 96, 72],
      [220, 220, 200],
      [140, 170, 110],
    ],
    [
      [90, 70, 120],
      [240, 200, 140],
      [200, 190, 220],
    ],
    [
      [150, 110, 60],
      [250, 240, 220],
      [80, 60, 40],
    ],
  ];
  const [bg, a, b] = palettes[palette % palettes.length];
  // The text sits between the bands: the title in the 0.34–0.60 gap, the formats in 0.68–0.78.
  const inner = 400 - 2 * 40;
  const heading = wrapText(title, 10, inner, 6);
  const lineHeight = 9 * heading.scale;
  const titleTop = 0.47 - (heading.lines.length * lineHeight) / 600 / 2;
  const label = formats.join(' + ').toUpperCase();
  const labelScale = Math.min(8, Math.floor(inner / textWidth(label, 1)));
  return png(
    400,
    600,
    bg,
    [
      { from: 0.18, to: 0.3, color: a },
      { from: 0.62, to: 0.66, color: b },
      { from: 0.8, to: 0.84, color: a },
    ],
    12,
    [
      ...heading.lines.map((text, i) => ({
        text,
        y: titleTop + (i * lineHeight) / 600,
        scale: heading.scale,
        color: a,
      })),
      { text: label, y: 0.73 - (7 * labelScale) / 600 / 2, scale: labelScale, color: a },
      // Below the last band: what the book is, wherever its cover shows.
      { text: FIXTURE_COVER_LINE, y: 0.89, scale: 2, color: a },
    ]
  );
}
