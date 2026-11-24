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
const STROKE = '0.04em';

/**
 * The rule that makes the book's text bold, or none when off.
 *
 * **An outline, not a heavier weight.** Most book fonts come in two weights, regular and bold, so asking for 600
 * draws the body in bold — and then a word the book bolds for emphasis is no bolder than the words around it. A thin
 * outline in the text's own colour thickens every letter alike, so the book's bold stays bolder than its body.
 *
 * **On `body`, inherited by everything**: headings, captions and notes as well as paragraphs, since a reader who needs
 * heavier letters needs them everywhere. `currentColor` resolves per element, so a coloured link is outlined in its
 * own colour. `-webkit-text-stroke` is prefixed in Chromium and WebKit alike, and unprefixed in neither.
 */
export function boldTextCss(boldText: BoldText): string | null {
  if (boldText !== 'on') return null;
  return `body { -webkit-text-stroke-width: ${STROKE} !important; -webkit-text-stroke-color: currentColor !important; }`;
}
