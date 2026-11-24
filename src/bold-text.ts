// Bold text: the whole book drawn a little heavier, for a reader who finds thin strokes hard to see. On the display
// style bar's Font tab and in Settings → Appearance, off by default, like Kindle's Bold and Apple Books' Bold Text.

/** This device's live Bold text, `on` or `off`. */
export const STORAGE_KEY_BOLD_TEXT = 'orbis-bold-text';

export type BoldText = 'on' | 'off';

/** A stored value as an answer; anything else — a style saved before the setting — reading as off. */
export function parseBoldText(v: string | null | undefined): BoldText {
  return v === 'on' ? 'on' : 'off';
}

/**
 * How much heavier: the width of the outline drawn around every letter, in ems so it grows with the text. Enough
 * to see at a glance on a phone, not so much that a small `e` or `a` fills in.
 */
export const BOLD_STROKE = '0.04em';

/**
 * The rule that makes the book's text bold, or none when off.
 *
 * **An outline, not a heavier weight.** Most book fonts come in two weights, regular and bold, so asking for 600
 * draws the body in bold — and then a word the book bolds for emphasis is no bolder than the words around it. A thin
 * outline in the text's own color thickens every letter alike, so the book's bold stays bolder than its body.
 *
 * **On every element, not inherited from `body`**: headings, captions and notes as well as paragraphs, since a reader
 * who needs heavier letters needs them everywhere. Inherited, the width would be `body`'s in pixels, and a heading twice
 * the size would be thickened half as much. `currentColor` resolves per element, so a colored link is outlined in its
 * own color. `-webkit-text-stroke` is prefixed in Chromium and WebKit alike, and unprefixed in neither.
 */
export function boldTextCss(boldText: BoldText): string | null {
  if (boldText !== 'on') return null;
  return `body, body * { -webkit-text-stroke-width: ${BOLD_STROKE} !important; -webkit-text-stroke-color: currentColor !important; }`;
}
