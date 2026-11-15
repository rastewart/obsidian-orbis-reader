// Drawing a cover for a book that has none. See docs/design/library.md.
//
// The Library already renders a tile like this in the DOM for a record with no `cover:`. This writes the same idea
// to a file, which is a different thing and worth the duplication: a rendered tile exists only inside Orbis, while
// an image in the vault shows up in Properties, in a Bases card, in a hover preview, and on a device that has
// never opened the Library. The whole argument for notes-as-records is that the catalog should work in Obsidian's
// own surfaces, and "except the covers" is a large exception.
//
// It is deliberately plain — a color, a title, an author. Not an attempt at artwork, just a book-shaped thing you
// can tell apart from the one beside it.

import { tileHue } from './tile';

/** Cover proportions and size, matching what extraction downscales to, so a shelf of both looks like one shelf. */
const WIDTH = 400;
const HEIGHT = 600;

/**
 * Break text into lines that fit, using the caller's measurer.
 *
 * The measurer is a parameter so this can be tested without a canvas: the hard part is the wrapping rule, not the
 * measuring. **A word longer than the line is broken rather than allowed to overflow** — one absurd German
 * compound or a URL in a title should not push the whole cover out of shape.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }
    // A single word wider than the cover: cut it where it stops fitting and carry the rest.
    let rest = word;
    while (measure(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length;
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A JPEG cover for a title with no artwork, or null if the canvas refuses.
 *
 * Written at cataloging time rather than rendered on demand, so the record has a real `cover:` like any other. The
 * hue comes from the title, exactly as the on-screen tile's does, so the file and the fallback tile are the same
 * color for the same book — which is what stops a folder half-covered in generated images from looking like two
 * different features.
 */
export async function renderCoverJpeg(title: string, author: string): Promise<ArrayBuffer | null> {
  try {
    const canvas = createEl('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const hue = tileHue(title);
    const bg = ctx.createLinearGradient(0, 0, WIDTH * 0.4, HEIGHT);
    bg.addColorStop(0, `hsl(${hue} 42% 38%)`);
    bg.addColorStop(1, `hsl(${hue} 46% 24%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const margin = 36;
    const maxWidth = WIDTH - margin * 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.textBaseline = 'top';

    // Title from the top, author from the bottom: the two ends a cover reads from, and it means a long title grows
    // downwards into empty space rather than colliding with the author.
    const titleSize = 40;
    ctx.font = `600 ${titleSize}px sans-serif`;
    const titleLines = wrapLines(title, maxWidth, (s) => ctx.measureText(s).width).slice(0, 8);
    let y = margin;
    for (const line of titleLines) {
      ctx.fillText(line, margin, y);
      y += titleSize * 1.25;
    }

    if (author) {
      const authorSize = 26;
      ctx.font = `400 ${authorSize}px sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      const authorLines = wrapLines(author, maxWidth, (s) => ctx.measureText(s).width).slice(0, 2);
      let ay = HEIGHT - margin - authorLines.length * authorSize * 1.3;
      for (const line of authorLines) {
        ctx.fillText(line, margin, ay);
        ay += authorSize * 1.3;
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? await blob.arrayBuffer() : null;
  } catch {
    // A cover is decoration: a book whose stand-in could not be drawn still gets its record.
    return null;
  }
}
