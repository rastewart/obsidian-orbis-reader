// A book's keyword font sizes, made to scale with the font-size setting.
//
// **Why.** The setting scales text by writing a percentage on `html`, and everything sized in `em`, `rem` or `%`
// follows it. The ABSOLUTE keywords — `xx-small` to `xxx-large` — do not: they are fixed steps from the browser's own
// `medium`, which the root size never touches. Few books use them where it shows, but a publisher that sets every
// paragraph `small` leaves the font-size setting doing nothing to that book's body text, and its `x-large` headings
// staying put too.
//
// **How.** Each keyword becomes the same size in `rem`: identical at 100%, where `rem` and `medium` are both the
// browser's 16px, and scaling with the setting everywhere else. `rem` rather than `em` because a keyword ignores its
// parent's size and `rem` does too; `em` would compound inside an already-enlarged element. The relative keywords,
// `smaller` and `larger`, already scale and are left alone.
//
// **The factors are what browsers RENDER, not the CSS spec's ratios.** The spec's table has `small` at 8/9 of `medium`;
// Chromium (Obsidian on desktop and Android) and WebKit use a fixed size table — 9, 10, 13, 16, 18, 24, 32, 48px at a
// 16px default — so `small` is 13px, not 14.2. The spec's ratios would compute a `small` paragraph to 14.2px: 9% larger
// at 100% than the browser renders it, which is the one thing this must not do.
//
// **On the parsed stylesheets, not their text.** The book's stylesheets are inlined into the chapter, so the browser
// has parsed them and they can be edited rule by rule: a keyword inside a comment or a string cannot be mistaken for a
// size, and a `font:` shorthand is already expanded into the `font-size` this reads.
//
// **The `<font size>` tag as well.** An older MOBI has no stylesheet, so a converter writes a chapter heading as
// `<font size="5"><b>…</b></font>`, and the browser sizes that tag as it sizes `x-large`, from its own `medium`: at a
// large font-size setting the heading would be smaller than the text under it. Each tag gets its keyword's `rem` from
// a sheet placed before the book's own, inside `:where()`, so any rule of the book's still wins over it, as it wins
// over the tag.

/** Each absolute keyword as a multiple of the root size — the browsers' own table (9…48px) over its 16px `medium`. */
const KEYWORD_REM: Readonly<Record<string, number>> = {
  'xx-small': 0.5625,
  'x-small': 0.625,
  small: 0.8125,
  medium: 1,
  large: 1.125,
  'x-large': 1.5,
  'xx-large': 2,
  'xxx-large': 3,
};

/** An absolute-size keyword as `rem`, or `null` for anything else — a length, a percentage, `smaller`, `inherit`. */
export function remForKeyword(value: string): string | null {
  const factor = KEYWORD_REM[value.trim().toLowerCase()];
  return factor === undefined ? null : `${factor}rem`;
}

/** `<font size>`'s seven sizes, 1 to 7, as the keywords browsers give them. */
const FONT_SIZE_KEYWORD = ['x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large'];

/**
 * A `<font size>` value as `rem`, or `null` where the browser gives the tag no size. The HTML standard's rules: a
 * number, or `+n` and `-n` counted from 3, kept within 1 to 7.
 */
export function remForFontSize(value: string): string | null {
  const m = /^\s*([+-]?)(\d+)/.exec(value);
  if (!m) return null;
  const n = Number(m[2]);
  const size = m[1] === '+' ? 3 + n : m[1] === '-' ? 3 - n : n;
  return remForKeyword(FONT_SIZE_KEYWORD[Math.min(7, Math.max(1, size)) - 1]);
}

/** Size each `<font size>` tag in `rem`, below every rule of the book's. */
function scaleFontTags(doc: Document): void {
  const sizes = new Set<string>();
  for (const font of Array.from(doc.querySelectorAll<HTMLElement>('font[size]'))) {
    const rem = remForFontSize(font.getAttribute('size') ?? '');
    if (!rem) continue;
    font.dataset.orbisFontSize = rem;
    sizes.add(rem);
  }
  if (!sizes.size || !doc.head) return;
  const sheet = doc.createElement('style');
  sheet.textContent = [...sizes]
    .map((rem) => `:where(font[data-orbis-font-size="${rem}"]) { font-size: ${rem}; }`)
    .join('\n');
  doc.head.prepend(sheet);
}

/** Rewrite one declaration block's `font-size`, keeping its `!important`. */
function rewrite(style: CSSStyleDeclaration): void {
  const rem = remForKeyword(style.getPropertyValue('font-size'));
  if (rem) style.setProperty('font-size', rem, style.getPropertyPriority('font-size'));
}

/** Every rule in a list, and the rules inside `@media`, `@supports` and nested rules. */
function walk(rules: CSSRuleList): void {
  for (const rule of Array.from(rules)) {
    const r = rule as CSSRule & { style?: CSSStyleDeclaration; cssRules?: CSSRuleList };
    if (r.style) rewrite(r.style);
    if (r.cssRules) walk(r.cssRules);
  }
}

/** Make a chapter's keyword sizes scale — its stylesheets, its inline styles and its `<font size>` tags. Once per document. */
export function scaleKeywordSizes(doc: Document): void {
  const root = doc.documentElement;
  if (!root || root.dataset.orbisRemSizes) return;
  root.dataset.orbisRemSizes = '1';
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      /* a sheet the page may not read — nothing of the book's is ever one, since they are inlined */
    }
  }
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[style]'))) rewrite(el.style);
  scaleFontTags(doc);
}
