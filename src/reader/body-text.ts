// Which text in a chapter is BODY TEXT — the paragraphs the display style's alignment, line spacing and font apply to.
//
// **Why the display style needs to know.** A setting written as a rule on `body` loses to any rule the book writes for
// the paragraph itself, since a declaration on an element beats one it inherits, `!important` or not. Most books
// justify their own text, often with a rule on the paragraph, and many set line-height or a font there or wrap most of
// their words in spans that set one. So the style has to be applied to the paragraphs themselves — and not to all of
// them, because many books center or right-align some: title lines, verse, a signature. Plain CSS cannot tell those
// apart, so this reads the book's own alignment once, when the chapter loads, and tags what is body text. The display
// CSS then styles the tag (`buildBookCss`).
//
// **Read before Orbis overrides anything.** The tagging asks the browser for the book's computed alignment and fonts,
// which the display CSS never touches except through these classes — so the answer is the book's, whenever it runs.

/** On every body-text block. */
export const BODY_TEXT = 'orbis-body-text';
/** On an element inside body text whose font is the book's to keep: code, monospace, a symbol font. */
export const KEEP_FONT = 'orbis-keep-font';

/** The elements a paragraph of text is written in. Headings are not body text: they keep the book's own spacing. */
const BLOCKS =
  'p, div, li, dd, dt, blockquote, td, th, figcaption, section, article, aside, pre, h1, h2, h3, h4, h5, h6';
const BODY_TEXT_TAGS = new Set(['p', 'div', 'li', 'dd', 'dt', 'blockquote', 'td', 'th', 'section', 'article', 'aside']);

/**
 * Whether a block the book aligns this way is body text: left, justified, or left to the default.
 *
 * Centered and right-aligned blocks are the book's layout — a title line, verse, a dateline, a signature — and keep it.
 * `start` is the default in a left-to-right book; `end` is its right. A right-to-left book's default is `start` too,
 * so it counts, and its explicit `right` would read as "not body text", which for Hebrew or Arabic body text is wrong —
 * no right-to-left book has been tested, so that is left for when one arrives.
 */
export function isBodyTextAlign(align: string): boolean {
  return /^(left|start|justify|auto|-webkit-auto|match-parent|)$/.test(align.trim().toLowerCase());
}

/**
 * Whether an element inside body text keeps the book's font rather than the display style's.
 *
 * Code, and anything the book sets in monospace or a symbol/dingbat font: overriding those changes what the text SAYS
 * (a table of symbols, a code sample), not how it looks.
 */
export function keepsOwnFont(tag: string, family: string): boolean {
  if (/^(code|kbd|samp|tt|pre|var)$/i.test(tag)) return true;
  return /mono|courier|consol|menlo|symbol|dingbat|wingding|webdings|zapf|emoji/i.test(family);
}

/**
 * Tag a chapter's body text. Once per document — the tags stay true for the life of the page, and a settings change
 * re-renders the section as a new document anyway.
 *
 * A block is body text when it holds text, holds no other block (so the tag lands on the paragraph, not on a
 * wrapper around forty of them), and the book aligns it left, justified or not at all.
 */
export function tagBodyText(doc: Document): void {
  const root = doc.documentElement;
  const win = doc.defaultView;
  if (!root || !win || root.dataset.orbisBodyText) return;
  root.dataset.orbisBodyText = '1';
  const body = doc.body;
  if (!body) return;
  // Every read first, every write after: a class added mid-walk would make the next read re-cascade the page.
  const blocks: Element[] = [];
  const keep: Element[] = [];
  for (const el of Array.from(body.getElementsByTagName('*'))) {
    if (!BODY_TEXT_TAGS.has(el.localName)) continue;
    if (!el.textContent?.trim() || el.querySelector(BLOCKS)) continue;
    if (!isBodyTextAlign(win.getComputedStyle(el).textAlign)) continue;
    blocks.push(el);
    for (const d of Array.from(el.getElementsByTagName('*'))) {
      if (keepsOwnFont(d.localName, win.getComputedStyle(d).fontFamily)) keep.push(d);
    }
  }
  for (const el of blocks) el.classList.add(BODY_TEXT);
  for (const el of keep) el.classList.add(KEEP_FONT);
}
