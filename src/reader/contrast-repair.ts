// Text the theme cannot reach on its own: a book's own background, or a book's own text color, that leaves the words
// unreadable in the reader's theme.
//
// **Why the theme alone is not enough.** A theme colors the page and the text on `body`, and the chapter inherits it.
// A book's shaded box, table cell or callout keeps the background the book gave it — those are its content — but
// usually sets no text color, trusting the default black. In a dark theme the box inherits the theme's light text:
// light on light. The reverse happens too: a book's own gray text on a dark theme's page. A stylesheet cannot ask what
// color sits behind an element, so this reads the chapter as drawn, and repairs only the text that fails.
//
// **Only what fails, and with the theme's own colors where they read.** Text whose contrast with what is behind it is
// below `MIN_CONTRAST` gets a color set on it: the theme's text color if that reads there, else the theme's page color
// (dark text in a pale box, in a dark theme), else black or white. Everything else is left as the book and the theme
// drew it, so a mildly gray caption or a tinted heading keeps its look.
//
// **Never over a picture.** What is behind text is measured from background colors, and a picture laid under text as
// an image is not one: white lettering over a dark illustration would read as white on the page, and in a light theme
// be turned black, over the dark picture. So two kinds of text are left as the book drew them. A fixed-layout book's
// pages are designed as pictures with exact colors, often lettered over an illustration, and none of it is repaired.
// In a reflowable book, text the book positions (`absolute` or `fixed`) is how it lays words over another element,
// and that text is left too.
//
// **Undone and done again on every theme change.** Each repair records what the element's own `color` was, and is put
// back before the chapter is read again, so a repair made for one theme never decides the next.

import type { ThemeColors } from '../reader-themes';

/**
 * Below this, text is hard to read at all: WCAG's minimum for large text. Ordinary body text should reach 4.5 : 1, but
 * holding a book to that would recolor captions and notes it deliberately set in a softer gray; this catches the text
 * that cannot be read.
 */
export const MIN_CONTRAST = 3;

/** On an element whose color this changed, holding its own inline `color` before: `""` when it had none. */
const REPAIRED = 'data-orbis-contrast';
/** The same element's inline `color` priority before, so an inline `!important` the book wrote comes back as it was. */
const REPAIRED_PRIORITY = 'data-orbis-contrast-priority';

type Rgba = [number, number, number, number];

/** A computed color, `rgb(…)` or `rgba(…)`, as channels 0–255 and alpha 0–1; null for anything else. */
export function parseColor(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value.trim());
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number.parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
}

/** `top` drawn over the opaque `under`. */
function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
}

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgba): number {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG contrast ratio of two opaque colors, from 1 to 21. */
export function contrastOf(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The color to give text on `background`: the theme's text color if it reads there, else the theme's page color, else
 * whichever of black and white reads better.
 */
export function readableOn(background: Rgba, colors: ThemeColors): string {
  for (const candidate of [colors.fg, colors.bg]) {
    const c = parseColor(candidate);
    if (c && contrastOf(c, background) >= MIN_CONTRAST) return candidate;
  }
  return contrastOf([0, 0, 0, 1], background) >= contrastOf([255, 255, 255, 1], background) ? '#000000' : '#ffffff';
}

/** The parts of a computed style this reads. Injected so the walk can be tested without a browser's cascade. */
export interface StyleOf {
  (el: Element): { color: string; backgroundColor: string; backgroundImage: string; position: string };
}

/** Whether `doc` is a page of a fixed-layout book: its frame is in foliate's fixed-layout renderer, `foliate-fxl`. */
export function inFixedLayout(doc: Document): boolean {
  const frame = doc.defaultView?.frameElement;
  const root = frame?.getRootNode();
  return !!root && 'host' in root && (root as ShadowRoot).host.localName === 'foliate-fxl';
}

const XHTML = 'http://www.w3.org/1999/xhtml';

/** Whether `el` has words of its own: a text node child that is not only whitespace. */
function hasOwnText(el: Element): boolean {
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.nodeValue ?? '')) return true;
  return false;
}

/** Put back every color an earlier repair set, so the chapter is read as the book and the theme draw it. */
function undoContrastRepairs(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[${REPAIRED}]`))) {
    const before = el.getAttribute(REPAIRED) ?? '';
    const priority = el.getAttribute(REPAIRED_PRIORITY) ?? '';
    if (before) el.style.setProperty('color', before, priority);
    else el.style.removeProperty('color');
    el.removeAttribute(REPAIRED);
    el.removeAttribute(REPAIRED_PRIORITY);
  }
}

/**
 * Give readable colors to the text in `doc` that its background leaves unreadable. Returns how many elements it read,
 * how many it changed and how long it took, for the debug log.
 *
 * Call after the theme's styles are in the chapter. A background with a picture or gradient in it cannot be measured,
 * so text over one is left as the book drew it, and so is text the book positions, which it lays over other content,
 * and SVG, whose text is drawn with `fill`. A fixed-layout book's pages are left whole: see the head of this file.
 */
export function repairContrast(
  doc: Document,
  colors: ThemeColors,
  styleOf: StyleOf = (el) => (doc.defaultView as Window).getComputedStyle(el)
): { read: number; repaired: number; ms: number } {
  const started = performance.now();
  undoContrastRepairs(doc);
  const page = parseColor(colors.bg);
  if (!doc.body || !page || inFixedLayout(doc)) return { read: 0, repaired: 0, ms: 0 };
  let read = 0;
  const changes: [HTMLElement, string][] = [];

  // Read everything first, then write: a write between reads would make the browser restyle the chapter each time.
  const walk = (el: Element, behind: Rgba | null): void => {
    if (el.namespaceURI !== XHTML) return;
    read++;
    const style = styleOf(el);
    let here = behind;
    // Over a picture, or laid over another element: what is behind it cannot be measured from colors.
    if (style.position === 'absolute' || style.position === 'fixed') here = null;
    else if (style.backgroundImage && style.backgroundImage !== 'none') here = null;
    else if (here) {
      const own = parseColor(style.backgroundColor);
      if (own && own[3] > 0) here = over(own, here);
    }
    if (here && hasOwnText(el)) {
      const text = parseColor(style.color);
      if (text && contrastOf(over(text, here), here) < MIN_CONTRAST)
        changes.push([el as HTMLElement, readableOn(here, colors)]);
    }
    for (const child of Array.from(el.children)) walk(child, here);
  };
  walk(doc.body, page);

  for (const [el, color] of changes) {
    el.setAttribute(REPAIRED, el.style.getPropertyValue('color'));
    el.setAttribute(REPAIRED_PRIORITY, el.style.getPropertyPriority('color'));
    el.style.setProperty('color', color, 'important');
  }
  return { read, repaired: changes.length, ms: Math.round(performance.now() - started) };
}

/** `repairContrast` for a chapter on screen, saying what it did on the debug log: see `applyDocStyles`. */
export function repairChapterContrast(doc: Document, colors: ThemeColors, log: (msg: string) => void): void {
  if (inFixedLayout(doc)) {
    undoContrastRepairs(doc);
    log('contrast: a fixed-layout page, left as the book drew it');
    return;
  }
  const { read, repaired, ms } = repairContrast(doc, colors);
  log(`contrast: ${repaired} of ${read} elements given a readable color, in ${ms} ms`);
}
