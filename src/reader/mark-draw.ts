// Treatment → how the overlay actually draws it. The reader-side half of annotation presets: the pure
// module (`annotation-presets.ts`) owns what a treatment MEANS, this owns what it looks like.
//
// Cheap by design. `Overlayer.add(key, range, draw, options)` takes the draw function as a PARAMETER,
// and Orbis's own `draw-annotation` plumbing already passes one through, so most treatments are a lookup
// rather than new rendering code — and the two that aren't (`double-underline`, which foliate lacks, and
// `box`, whose stroke has to stay inside the text rect) are ordinary functions passed the same way, with
// no fork. See docs/design/annotation-presets.md §Treatments.

import { type DrawFn, Overlayer, type OverlayRect } from 'foliate-js/overlayer.js';
import { type MarkAppearance, resolveInk, type Treatment } from '../annotation-presets';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Matches `overlayer.js`'s own `createSVGElement` — the host document, adopted on append into the
 *  book iframe's SVG, exactly as foliate's five statics do it. The active window's, so a popout's own. */
function createSVGElement(tag: string): SVGElement {
  return activeDocument.createElementNS(SVG_NS, tag);
}

/**
 * The one treatment foliate has no static for.
 *
 * The draw contract is only `(rects, options) => SVGElement`, so this is passed like any other — no
 * fork, no patch. Modeled line-for-line on `Overlayer.underline`, emitting two rects per line
 * fragment: the second offset by `strokeWidth + gap`, which is what keeps two thin lines reading as a
 * double rule rather than as one thick smudge.
 */
const doubleUnderline: DrawFn = (rects: OverlayRect[], options: Record<string, unknown> = {}) => {
  const color = (options.color as string) ?? 'red';
  const strokeWidth = (options.width as number) ?? 1.5;
  const padding = (options.padding as number) ?? 0;
  const gap = (options.gap as number) ?? 2;
  const writingMode = options.writingMode as string | undefined;
  const g = createSVGElement('g');
  g.setAttribute('fill', color);
  const vertical = writingMode === 'vertical-rl' || writingMode === 'vertical-lr';
  for (const offset of [0, strokeWidth + gap]) {
    if (vertical)
      for (const { right, top, height } of rects) {
        const el = createSVGElement('rect');
        el.setAttribute('x', String(right - strokeWidth / 2 + padding + offset));
        el.setAttribute('y', String(top));
        el.setAttribute('height', String(height));
        el.setAttribute('width', String(strokeWidth));
        g.append(el);
      }
    else
      for (const { left, bottom, width } of rects) {
        const el = createSVGElement('rect');
        el.setAttribute('x', String(left));
        el.setAttribute('y', String(bottom - strokeWidth / 2 + padding + offset));
        el.setAttribute('height', String(strokeWidth));
        el.setAttribute('width', String(width));
        g.append(el);
      }
  }
  return g;
};

/**
 * Coalesce client rects that sit on the same line into one rect each.
 *
 * `Range.getClientRects()` is NOT one-rect-per-line. It returns one per layout run, and WebKit splits runs
 * where Chromium does not — the same stored highlight gave 2 rects for 2 lines on macOS, 3 for 3 on
 * Android, and 7 for 5 on an iPad Mini. Any treatment drawing a CLOSED shape per rect then renders the
 * seams: boxed prose showed vertical rules through the middle of two lines, at run boundaries invisible in
 * the text (both fell just after punctuation + a space). Merging is engine-agnostic, which is the reason to
 * fix it here rather than to work around one engine's rect enumeration.
 *
 * Grouped by vertical overlap rather than by an exact `top`, since a line holding a larger glyph or an
 * inline element yields rects of slightly different heights that still belong to that line. Two rects join
 * when they overlap by more than half the shorter one: loose enough to tolerate a pixel of drift, strict
 * enough that consecutive lines never merge.
 */
export function mergeLineRects(rects: readonly OverlayRect[]): OverlayRect[] {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: OverlayRect[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    const overlap = last ? Math.min(last.bottom, r.bottom) - Math.max(last.top, r.top) : 0;
    if (!last || overlap <= Math.min(last.height, r.height) / 2) {
      lines.push({ ...r });
      continue;
    }
    const left = Math.min(last.left, r.left);
    const right = Math.max(last.right, r.right);
    const top = Math.min(last.top, r.top);
    const bottom = Math.max(last.bottom, r.bottom);
    lines[lines.length - 1] = { left, right, top, bottom, width: right - left, height: bottom - top };
  }
  return lines;
}

/**
 * `box`, ours rather than `Overlayer.outline`, for two reasons: the rects have to be merged per line first
 * (see `mergeLineRects`), and the stroke has to stay INSIDE the text rect horizontally.
 *
 * Foliate draws at `x = left - padding` with the stroke centered on that edge, so it lands ~1.75px to the
 * left of the text. With Appearance margins at 0 the text rect starts at x = 0, which puts that edge
 * off-canvas — and the overlay `<svg>` is `width: 100%` with the default `overflow: hidden`, so it is
 * simply cut off. Justified text makes the right edge the same story on every line but the last.
 *
 * Clamping against the viewport would be the other fix, and is wrong here: in paginated mode the columns
 * live in one wide document, so a rect in the second column legitimately has `left` beyond the visible
 * width and there is nothing safe to clamp to. Insetting needs no knowledge of the layout at all.
 *
 * Vertical padding is kept — a line box is taller than its glyphs, so there is room to sit off the text —
 * and it is symmetric, so the stroke stays within `top - padding … bottom + padding`.
 */
const boxOutline: DrawFn = (rects: OverlayRect[], options: Record<string, unknown> = {}) => {
  const color = (options.color as string) ?? 'red';
  const strokeWidth = (options.width as number) ?? 1.5;
  const padding = (options.padding as number) ?? 0;
  const radius = (options.radius as number) ?? 3;
  const g = createSVGElement('g');
  g.setAttribute('fill', 'none');
  g.setAttribute('stroke', color);
  g.setAttribute('stroke-width', String(strokeWidth));
  // Half the stroke sits either side of the path, so inset by that to keep all of it within the rect.
  const inset = strokeWidth / 2;
  for (const { left, top, width, height } of mergeLineRects(rects)) {
    const el = createSVGElement('rect');
    el.setAttribute('x', String(left + inset));
    el.setAttribute('width', String(Math.max(0, width - strokeWidth)));
    el.setAttribute('y', String(top - padding + inset));
    el.setAttribute('height', String(Math.max(0, height + padding * 2 - strokeWidth)));
    el.setAttribute('rx', String(radius));
    g.append(el);
  }
  return g;
};

/**
 * The line half of an appearance: which foliate draw function, with what options.
 *
 * Stroke widths are deliberately lighter than foliate's defaults (2 for the rules, 3 for `outline`). The
 * wash renders at ~30% opacity with a blend mode; every line strokes at FULL opacity, so a width tuned for
 * a solid red debug stroke is shouting when the color is a Material 200 tone.
 */
function lineDraw(treatment: Treatment, color: string): { fn: DrawFn; options: Record<string, unknown> } {
  switch (treatment) {
    case 'double-underline':
      return { fn: doubleUnderline, options: { color, width: 1.5, gap: 2 } };
    case 'squiggle':
      // Amplitude is `width * 1.5` BELOW the baseline, so a thinner stroke is also a shallower wave —
      // which is what keeps it clear of the next line's descenders at a large book font size.
      return { fn: Overlayer.squiggly, options: { color, width: 1.5 } };
    case 'strikethrough':
      return { fn: Overlayer.strikethrough, options: { color, width: 2 } };
    case 'box':
      // Rounded, with vertical breathing room only — see boxOutline for why the horizontal padding went.
      // One box per LINE fragment, not one around the selection — fine for a phrase, noisy for a paragraph.
      return { fn: boxOutline, options: { color, width: 1.5, padding: 1, radius: 3 } };
    default:
      return { fn: Overlayer.underline, options: { color, width: 2 } };
  }
}

/**
 * One draw function for a whole appearance — wash, line, or both.
 *
 * Both channels compose into a single `<g>` rather than becoming two overlay entries. `Overlayer.add` keys
 * by the annotation's CFI, so two entries would mean two keys for one annotation: two things to remove, two
 * hit-test results, and the note-icon range bookkeeping doubled. Foliate's own draw functions each return a
 * `<g>` and the contract is `(rects, options) => SVGElement`, so nesting them is free — and each keeps its
 * own styling, which matters because the wash carries opacity and blend-mode on its group.
 *
 * The colors ride in the closure rather than in `options`, since one options object cannot carry two.
 */
export function drawForAppearance(a: MarkAppearance, textColor: string): DrawFn {
  return (rects, options) => {
    const g = createSVGElement('g');
    // Wash first so the line draws over it, which is the order a person would use a highlighter and a pen.
    if (a.highlightColor) g.append(Overlayer.highlight(rects, { ...options, color: a.highlightColor }));
    if (a.treatment) {
      // `textColor` is the page's own foreground — what the INK sentinel resolves to, so a line set to ink
      // is legible on whatever theme the reader is using rather than on the one it was chosen under.
      const color = resolveInk(a.treatmentColor ?? a.highlightColor, textColor);
      const { fn, options: lineOpts } = lineDraw(a.treatment, color);
      g.append(fn(rects, { ...options, ...lineOpts }));
    }
    return g;
  };
}
