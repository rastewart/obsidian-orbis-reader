// Text layout for a generated PDF: word wrapping, and the character sanitizing a PDF's built-in fonts force on us.
//
// Pure, and deliberately free of `pdf-lib` — the caller passes a `measure` function, which in production is
// `font.widthOfTextAtSize` and in a test is a stub. That keeps the part most likely to be wrong (where the line
// breaks) testable without a PDF document, a font, or a canvas.
//
// See docs/design/marks-pdf.md.

import { graphemes } from './pdf-emoji';

/**
 * Measures a string at the size the caller is laying out in.
 *
 * `start` is where the slice begins in the string being wrapped, and it is not decoration: because a line can hold
 * **bold, italic and code runs**, a slice's width depends on where it sits, so measuring it without knowing that
 * would break every line containing emphasis. The digest passes a measurer that ignores it.
 */
export type Measure = (text: string, start: number) => number;

/**
 * A PDF's built-in fonts are **WinAnsi**, and `drawText` THROWS on anything they cannot encode.
 *
 * So a book with an emoji in it, or a CJK title, would not produce a worse PDF — it would produce no PDF, from
 * inside a library, with a message about a character code. Embedding a font that covers those is 1–10 MB per
 * script and cannot be the price of exporting one document, so unencodable characters degrade here instead.
 *
 * **Length-preserving, deliberately.** Marks are stored as ranges over the document's text, so the whole-document
 * export depends on a character's index surviving every transformation between the DOM and the page. Mapping `…`
 * to three dots, or dropping an emoji, would silently shift every mark after it. Each unencodable code point
 * becomes exactly as many replacement characters as it occupied.
 *
 * Most typographic characters need no mapping at all: WinAnsi is CP1252, which already carries the curly quotes,
 * both dashes, the ellipsis and the bullet a word processor inserts.
 */
export function winAnsi(code: number): boolean {
  if (code === 0x0a || code === 0x09) return true;
  if (code < 0x20) return false;
  if (code <= 0xff) return true;
  // CP1252's 0x80–0x9F window, which maps to these code points rather than to control characters.
  return '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.includes(String.fromCodePoint(code));
}

/**
 * @param supports which code points can be drawn. Defaults to WinAnsi, which is all the built-in fonts have; the
 *   writer passes the union of whatever faces are actually embedded, so an installed DejaVu widens what survives
 *   without changing anything else about this function.
 * @param keep a whole grapheme the writer will draw as a picture (`pdf-emoji.ts`), kept as it is — at its full
 *   length, so the offsets after it hold.
 */
export function sanitizeForPdf(
  text: string,
  supports: (code: number) => boolean = winAnsi,
  keep?: (cluster: string) => boolean
): string {
  if (keep) {
    let kept = '';
    for (const g of graphemes(text)) kept += keep(g) ? g : sanitizeForPdf(g, supports);
    return kept;
  }
  let out = '';
  for (const ch of text) {
    if (ch === '\n' || ch === '\t' || supports(ch.codePointAt(0) ?? 0)) {
      out += ch;
      continue;
    }
    // A pictograph leaves a space and anything else leaves a question mark — visible enough to say a font would
    // be needed, rather than a silent loss. `ch.length` keeps a surrogate pair two characters wide, so every
    // offset after it still points where it did.
    const filler = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(ch) ? ' ' : '?';
    out += filler.repeat(ch.length);
  }
  return out;
}

/**
 * Close up the hole `sanitizeForPdf` leaves where a pictograph was.
 *
 * **Only safe once nothing is counting characters.** The substitution above is one filler per code unit so that
 * every offset after it still points where it did, which is what keeps a highlight over the right words. Run this
 * on anything carrying `spans`, `emphasis` or `links` and those offsets all shift.
 *
 * A heading has no offsets into it, so there the guarantee buys nothing and the filler is pure cost:
 * `Phase 7: Accessibility ✅ (see §5.3)` would draw as `Accessibility␣␣␣(see §5.3)`, a hole mid-heading.
 */
export function closeGaps(text: string): string {
  return text.replace(/ {2,}/g, ' ').trim();
}

/**
 * One laid-out line, and **where in the source string it came from**.
 *
 * The offsets are what let a mark cover part of a line rather than all of it: a highlight is stored as a range
 * over the document's text, so drawing it accurately means knowing which characters of which line it covers.
 * Without them the only honest options are marking whole lines or not marking at all.
 */
export interface WrappedLine {
  text: string;
  /** Index into the string passed to `wrapLines`, inclusive. */
  start: number;
  /** Exclusive. */
  end: number;
}

/**
 * Break `text` into lines that fit `maxWidth`.
 *
 * Greedy, which is what every word processor does and what a reader expects; the alternative (Knuth-Plass) buys
 * even rags that nobody reviewing a document will notice.
 *
 * **A word longer than the line is broken rather than allowed to overflow.** A URL, a file path or a long
 * identifier is exactly the kind of thing that turns up in a quoted passage from technical writing, and a PDF
 * silently painting it off the edge of the page loses text with no sign that it happened.
 *
 * Existing newlines are honored: a passage that spans paragraphs keeps them.
 *
 * **Whitespace is not collapsed here.** Splitting on `/\s+/` would return text that no longer corresponds to
 * anything in the source, and lines carry offsets into it. Runs of spaces are instead skipped at the break, so a
 * line's `text` is always a real slice of the input.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: Measure,
  opts?: { keepIndent?: boolean }
): WrappedLine[] {
  const lines: WrappedLine[] = [];
  const isSpace = (i: number): boolean => /[^\S\n]/.test(text[i] ?? '');

  // Split on newlines first, so a blank line in the source is one blank line out — a newline ENDS a line, and only
  // a second consecutive one creates an empty one. Offsets stay absolute into `text` throughout.
  let base = 0;
  for (const paragraph of text.split('\n')) {
    const limit = base + paragraph.length;
    let i = base;
    if (i >= limit) {
      lines.push({ text: '', start: i, end: i });
      base = limit + 1;
      continue;
    }
    while (i < limit) {
      /**
       * **Leading whitespace is skipped, except in code.**
       *
       * A wrapped line of prose must not begin with the space it broke on. A line of code must begin with exactly
       * the spaces it was written with: preserving the newlines and then dropping the indentation gives you code
       * that is shaped like a paragraph, which is the one thing a code block exists not to be.
       */
      if (!opts?.keepIndent) while (i < limit && isSpace(i)) i++;
      if (i >= limit) break;
      const lineStart = i;
      let fit = -1; // end offset of the last word boundary that still fitted
      let j = i;
      while (j < limit) {
        let k = j;
        while (k < limit && !isSpace(k)) k++;
        if (measure(text.slice(lineStart, k), lineStart) > maxWidth) {
          if (fit > lineStart) break;
          // The first word alone does not fit: break it at the widest prefix that does.
          let cut = k;
          while (cut > lineStart + 1 && measure(text.slice(lineStart, cut), lineStart) > maxWidth) cut--;
          fit = cut;
          break;
        }
        fit = k;
        j = k;
        while (j < limit && isSpace(j)) j++;
      }
      if (fit <= lineStart) fit = limit;
      lines.push({ text: text.slice(lineStart, fit), start: lineStart, end: fit });
      i = fit;
    }
    base = limit + 1;
  }
  if (!lines.length) lines.push({ text: '', start: 0, end: 0 });
  return lines;
}

/**
 * How wide each column of a table should be.
 *
 * `natural` is what each column would take if nothing wrapped — the widest cell in it. When they all fit, that is
 * the answer: a table of short cells should not be stretched across the page to fill it, because even columns
 * suggest a relationship between the values that the widths were never claiming.
 *
 * When they do not fit, the columns are scaled **in proportion to what they asked for**, so a column of dates
 * stays narrow and a column of sentences takes the room.
 *
 * Proportional scaling alone starves the narrow ones, though. A `Meaning` column beside a column of sentences gets
 * a share too small for the word "Meaning", and then breaks it: `Meanin` / `g`. So each column carries its own
 * floor — `min[i]`, which the caller sets to that column's **longest word**, the width below which the column
 * cannot be drawn without breaking a word in half. The floors are paid for out of the columns that are over
 * theirs, in proportion, which never pushes one of those below its own floor.
 *
 * If the floors alone overflow — a table with more columns than the page can carry at any readable width — they
 * are scaled down together and words do break. That is the point at which no layout is right and the only choice
 * is which way to be wrong.
 */
export function columnWidths(natural: readonly number[], total: number, min: readonly number[]): number[] {
  if (!natural.length) return [];
  const sum = natural.reduce((a, b) => a + b, 0);
  if (sum <= total) return [...natural];

  const floors = natural.map((w, i) => Math.min(min[i] ?? 0, w));
  const floorSum = floors.reduce((a, b) => a + b, 0);
  if (floorSum >= total) return floors.map((f) => (f / floorSum) * total);

  // Scale, then lift anything under its floor and take the difference from the columns that are over theirs.
  const scaled = natural.map((w) => (w / sum) * total);
  const shortfall = scaled.reduce((a, w, i) => a + Math.max(0, floors[i] - w), 0);
  if (!shortfall) return scaled;
  const spare = scaled.reduce((a, w, i) => a + Math.max(0, w - floors[i]), 0);
  return scaled.map((w, i) => (w <= floors[i] ? floors[i] : w - ((w - floors[i]) / spare) * shortfall));
}

/**
 * Runs of whitespace to one space, for callers that want it.
 *
 * Not part of `wrapLines`, because a line's text has to be a real slice of the input, so collapsing has to happen
 * BEFORE wrapping, on the same string the offsets are measured against. The whole-document export's block
 * extractor collapses as it builds its offset map for exactly this reason.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n');
}
