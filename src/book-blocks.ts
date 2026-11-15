// A book's sections as blocks of text, with each mark's range resolved to character offsets in that text.
//
// The digest quotes passages the annotation data already carries, while the full document has to reproduce the book AND
// know which characters of it were marked. Both facts come out of the same walk, which is why they are one module.
//
// Pure DOM work, no PDF: given a `Document` and some ranges, it answers "what does this section say, in order,
// and where in that text do the marks fall". See docs/design/marks-pdf.md §Phase two.

import { LEAD_IN_CHARS } from './book-chapters';
import { mobiPictureHref } from './kindle-resources';

/** What a block is, which is all the layout needs to know to give it a font and an indent. */
export type BlockKind = 'heading' | 'paragraph' | 'list-item' | 'quote' | 'code' | 'image' | 'table';

/** Inline emphasis, as the page has to draw it. `code` wins over the others: a bold word inside `<code>` is still
 *  code, and a monospaced face has no bold in the standard PDF fonts. */
export type Emphasis = 'bold' | 'italic' | 'bold-italic' | 'code';

/**
 * A run of text with the marks and emphasis that fall inside it.
 *
 * Split out from `BookBlock` because a table cell is one of these too. Keeping the marks **per cell** is the whole
 * of what makes a table's highlights land correctly: offsets index into one string, so a table whose cells shared
 * a string would draw every mark in whichever cell the arithmetic happened to reach.
 */
export interface BlockText {
  /** The text, whitespace already collapsed — the string the offsets below index into. */
  text: string;
  /** Marked spans within `text`, by the id of the annotation that made them. */
  marks: { id: string; start: number; end: number }[];
  /**
   * Emphasized spans within `text`.
   *
   * The same offsets marks use, deliberately: a document's own emphasis and a reader's marks are two independent
   * things that both apply to a run of characters, and giving them one representation means the page draws them
   * with one mechanism instead of two that have to agree.
   */
  emphasis: { start: number; end: number; kind: Emphasis }[];
  /**
   * Linked spans within `text`, with the `href` as the document wrote it.
   *
   * Same offsets again, for the same reason: a link is another thing that applies to a run of characters, and one
   * representation means the page draws it with the machinery marks and emphasis already use. Resolving what an
   * `href` MEANS is left to the caller — this records what the book said. On an `image`, the picture itself is the
   * link: at most one entry, its offsets unused.
   */
  links: { start: number; end: number; href: string }[];
}

/** One cell. `header` is a `<th>`, which the page sets in bold. */
export interface TableCell extends BlockText {
  header: boolean;
}

export interface BookBlock extends BlockText {
  kind: BlockKind;
  /** What precedes a list item — `•`, or `1.` in an ordered list. Absent for every other kind. */
  marker?: string;
  /** Heading depth, 1–6. Only meaningful for `heading`. */
  level?: number;
  /** Vault-independent source of an image, for the layout to resolve. Only on `image`. */
  src?: string;
  /** Rows of cells, in document order. Only on `table`, where `text` is empty. */
  rows?: TableCell[][];
  /** How the book says this sits in the column. Absent when it does not say. Only on `image` so far. */
  align?: Align;
  /**
   * Ids this block defines — what a link inside the book can point AT.
   *
   * Taken from the element and everything inside it, because an `id` is usually on a heading's own `<a>` or `<span>`
   * rather than on the paragraph. Recorded as the document wrote them; making them unique across a book is the
   * caller's problem, since `#notes` in chapter two and chapter three are different places.
   */
  anchors?: string[];
}

/** The elements worth reproducing, and what each becomes. Anything not here is walked through — its text still
 *  arrives, inside whichever block contains it. */
const BLOCK_KIND: Readonly<Record<string, BlockKind>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  p: 'paragraph',
  li: 'list-item',
  blockquote: 'quote',
  pre: 'code',
  figcaption: 'paragraph',
  dd: 'paragraph',
  dt: 'paragraph',
  caption: 'paragraph',
};

/** What stops a container being collected as one run of text. `table` is here but not in `BLOCK_KIND` because it
 *  is built by hand below — without it, a table inside a blockquote would be flattened into the quotation. */
const BLOCK_TAGS = [...Object.keys(BLOCK_KIND), 'table'].join(',');

/**
 * Containers that hold a paragraph's text themselves when a book uses them in place of `<p>`.
 *
 * **A technical book writes every paragraph as `<div id="Par3" class="bookfrontmatter">…</div>`.** A walk that
 * emitted text only for the elements above and descended through anything else would read text sitting directly in
 * a `<div>` by nobody: the PDF would keep the headings, the figures and the lists, and lose every paragraph. Save as
 * Markdown reads them either way, because Turndown treats a `<div>` as a block.
 */
const TEXT_CONTAINERS = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'center']);
/** What makes a container a wrapper rather than a paragraph: a block, or another container, inside it. */
const WRAPPER_INSIDE = [BLOCK_TAGS, ...TEXT_CONTAINERS].join(',');

/** How a block sits in the column. Read from the book rather than chosen — see `alignmentRules`. */
export type Align = 'left' | 'center' | 'right';

/** One CSS rule that has something to say about alignment. */
export interface AlignRule {
  selector: string;
  align: Align;
}

/**
 * The alignment rules in a stylesheet, as selectors the DOM can test.
 *
 * **Why parse CSS at all.** An EPUB says how an illustration sits, and it usually says it in a class: Project
 * Gutenberg writes `.figcenter { text-align: center }` beside `.figleft { float: left }`, and the difference
 * between a centered plate and one the text runs beside is carried entirely there. Guessing instead — centring
 * every illustration because books center illustrations — is right about half the time and imposes a structure
 * the file did not ask for.
 *
 * Deliberately shallow. It finds `selector { … }` pairs and keeps the ones setting `text-align` or `float`; the
 * matching is then done by the DOM's own `matches()`, so there is no selector engine here. Specificity is not
 * computed — a later rule simply wins, which is the same answer as specificity for the flat, single-class
 * selectors these files actually use.
 *
 * At-rule preludes (`@media …`) are skipped because they contain `@`; the rules nested inside them are found on
 * their own, which is the behavior we want anyway.
 */
export function alignmentRules(css: string): AlignRule[] {
  const rules: AlignRule[] = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const body = match[2];
    if (!selector) continue;
    const text = /text-align\s*:\s*(left|center|right)/i.exec(body);
    const float = /float\s*:\s*(left|right)/i.exec(body);
    // `float` wins over `text-align`: `.figleft` sets both, and where it sits on the page is the float.
    const align = (float?.[1] ?? text?.[1])?.toLowerCase() as Align | undefined;
    if (align) rules.push({ selector, align });
  }
  return rules;
}

/** `el.matches` throws on a selector it cannot parse — an `@page` prelude, a pseudo-element — and one bad rule in
 *  a stylesheet should not cost the whole export. */
function matchesSafely(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

/**
 * How an image sits, according to the book.
 *
 * Walked from the image outwards, because `text-align` inherits: the nearest ancestor that says anything is the
 * one that decides. Inline style and the legacy `align` attribute beat a stylesheet at the same element, being
 * more specific in exactly the way CSS says they are.
 *
 * `undefined` when nothing says — which the page draws left, where the text flow puts an inline image.
 */
function alignOf(el: Element, rules: readonly AlignRule[]): Align | undefined {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const style = cur.getAttribute('style') ?? '';
    const inline = /text-align\s*:\s*(left|center|right)/i.exec(style);
    if (inline) return inline[1].toLowerCase() as Align;
    // `margin: auto` on the image itself is the other way a stylesheet centers one.
    if (cur === el && /margin(-left)?\s*:\s*auto/i.test(style)) return 'center';
    const attr = cur.getAttribute('align');
    if (attr && /^(left|center|right)$/i.test(attr)) return attr.toLowerCase() as Align;
    if (cur.tagName.toLowerCase() === 'center') return 'center';
    let fromCss: Align | undefined;
    for (const rule of rules) if (matchesSafely(cur, rule.selector)) fromCss = rule.align;
    if (fromCss) return fromCss;
  }
  return undefined;
}

/** Skipped whole: they carry no prose, and their text content is markup or navigation rather than the book. */
const SKIP = new Set(['script', 'style', 'head', 'nav']);

/** The image an element points at, whichever attribute it uses. An `<image>` inside `<svg>` takes `xlink:href`
 *  rather than `src`, which is how a Gutenberg cover page is built. */
function imageSrc(el: Element): string | undefined {
  return (
    el.getAttribute('src') ??
    el.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href') ??
    el.getAttribute('xlink:href') ??
    el.getAttribute('href') ??
    // An old MOBI picture has no `src` until foliate lays its page out — see `kindle-resources`.
    mobiPictureHref(el) ??
    undefined
  );
}

/** The images an element is, or contains, as blocks. Document order. */
function imagesIn(el: Element, rules: readonly AlignRule[]): BookBlock[] {
  const tag = el.tagName.toLowerCase();
  const nodes = tag === 'img' || tag === 'image' ? [el] : Array.from(el.querySelectorAll('img, image'));
  const out: BookBlock[] = [];
  for (const node of nodes) {
    const src = imageSrc(node);
    if (!src) continue;
    const align = alignOf(node, rules);
    /**
     * **A picture inside a link is that link.** A book links its small plate to the full-size one — `<a href="…"><img/>
     * </a>` — and printed only as a picture, the PDF lost the way there. Carried as the block's one link, offsets
     * unused, so the rewriting every link goes through (`canonicalizeLinks`) turns it into a destination here too.
     */
    const href = node.closest('a[href]')?.getAttribute('href');
    out.push({
      kind: 'image',
      text: node.getAttribute('alt') ?? '',
      src,
      marks: [],
      emphasis: [],
      links: href ? [{ start: 0, end: 0, href }] : [],
      ...(align ? { align } : {}),
    });
  }
  return out;
}

/**
 * One section's blocks, in document order, with marks mapped into them.
 *
 * **Text is collapsed as it is gathered, and mark offsets are computed against the collapsed string.** Doing it
 * the other way — gather raw, collapse later — silently shifts every offset by however much whitespace the
 * document happened to contain, which in an EPUB is a great deal: source XHTML is usually indented, so a
 * paragraph's raw text starts with a newline and eight spaces.
 *
 * `ranges` are resolved CFI ranges, from `epubcfi.toRange` against this same document. A mark that spans two
 * blocks lands in both, clipped to each — which is what a highlight crossing a paragraph boundary should look
 * like on the page.
 */
export function blocksFromDocument(
  doc: Document,
  ranges: readonly { id: string; range: Range }[],
  /** Alignment rules from the section's own stylesheets, if the caller could load them. */
  rules: readonly AlignRule[] = []
): BookBlock[] {
  const root = doc.body ?? doc.documentElement;
  if (!root) return [];
  const blocks: BookBlock[] = [];
  /**
   * Ids on containers the walk is currently inside, waiting for a block to carry them.
   *
   * **A container's id belongs to the first block under it.** `collect` takes ids from the block element and its
   * descendants, which misses the commonest shape there is: Gutenberg wraps each chapter in
   * `<div class="chapter" id="pgepubid00005">` and the contents page points at that div. The div is not a block —
   * the walk descends through it — so without this its id would be recorded nowhere, every contents anchor in the
   * book would resolve to no block at all, and a novel in parts would cut into one piece per file instead of one per
   * chapter.
   */
  let pending: string[] = [];
  /** Give a block the ids of every container opened since the last block, then start collecting again. */
  const withPending = (block: BookBlock): BookBlock => {
    if (pending.length) {
      block.anchors = [...pending, ...(block.anchors ?? [])];
      pending = [];
    }
    return block;
  };

  const walk = (node: Node): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;

    // An `<svg>` is walked for the images inside it and for nothing else: its own text content is markup rather
    // than prose. A Gutenberg cover page is exactly that shape — `<svg><image xlink:href="cover.png"/></svg>` —
    // and dropping it whole would take the book's cover with it.
    if (tag === 'img' || tag === 'image' || tag === 'svg') {
      for (const image of imagesIn(el, rules)) blocks.push(withPending(image));
      return;
    }

    if (tag === 'table') {
      for (const b of tableBlocks(el, ranges)) blocks.push(withPending(b));
      return;
    }

    /**
     * A container is a paragraph when it holds text and nothing it could be wrapping — no block and no other
     * container. An outer `<div>` around several paragraph-`<div>`s is still descended through, so they stay separate
     * paragraphs rather than running together as one.
     */
    const kind =
      BLOCK_KIND[tag] ??
      (TEXT_CONTAINERS.has(tag) && el.textContent?.trim() && !el.querySelector(WRAPPER_INSIDE)
        ? 'paragraph'
        : undefined);
    // An ordered list's items are numbered, not bulleted: "1. First" and "• First" say different things, and a
    // numbered list flattened to bullets loses the sequence that was the reason for numbering it.
    const marker =
      kind === 'list-item' && el.parentElement?.tagName.toLowerCase() === 'ol'
        ? `${[...el.parentElement.children].indexOf(el) + 1}.`
        : undefined;
    // A blockquote holding paragraphs is a container, not a block: taking its text would flatten the paragraphs
    // inside it into one run. Only a block with no block children of its own is emitted.
    const hasBlockChildren = kind ? !!el.querySelector(BLOCK_TAGS) : false;
    if (kind && !hasBlockChildren) {
      /**
       * **Images inside the block come out first, then its text.**
       *
       * A block is collected rather than descended into, so an `<img>` within one is reached by nobody unless it
       * is taken out here — and `<p class="illustration"><img/></p>` is how a great many EPUBs wrap a picture.
       * With `alt=""`, which is usual, the loss would leave nothing on the page to notice.
       *
       * Images before text rather than interleaved: a paragraph that contains a picture is nearly always a
       * picture with a caption under it, and putting the caption first would invert that. A genuinely inline
       * image — one mid-sentence — moves to the head of its paragraph, which is the compromise.
       */
      for (const image of imagesIn(el, rules)) blocks.push(withPending(image));
      const block = collect(el, kind, ranges);
      if (marker) block.marker = marker;
      if (block.text || kind === 'code') blocks.push(withPending(block));
      return;
    }
    // Descending, not emitting: this element's own id has no block yet, so it waits for the next one.
    if (el.id) pending.push(el.id);
    /**
     * **Loose text beside the blocks is a paragraph of its own.** A wrapper is walked child by child, and a child
     * that is text, or an inline element, is no block — so it was read by nobody. A technical book captions a table
     * `<div><span>Table 2-1.</span><div>Record fields</div></div>`, and the PDF printed "Record fields" alone. Each
     * run of such children between the blocks is collected as one paragraph, read in place without moving a node,
     * since the marks are ranges over this document.
     */
    let run: Node[] = [];
    const flush = () => {
      if (run.some((n) => n.textContent?.trim())) {
        const block = collect(el, 'paragraph', ranges, run);
        if (block.text) blocks.push(withPending(block));
      }
      run = [];
    };
    for (const child of Array.from(el.childNodes)) {
      if (isLoose(child)) {
        run.push(child);
        continue;
      }
      flush();
      walk(child);
    }
    flush();
  };

  walk(root);
  return blocks;
}

/**
 * A `<table>`, as the blocks that reproduce it.
 *
 * Usually one `table` block, sometimes something else. **Two shapes are deliberately not drawn as a grid:**
 *
 * - **A caption** comes out as its own paragraph above the table, because it is a sentence about the table rather
 *   than a row of it.
 * - **A table with one column** is laid out as paragraphs. EPUBs use single-column tables for centring a poem or a
 *   title, and ruling those off as a grid would draw a box around something that was never tabular. A grid is what
 *   a table MEANS, so it should only appear where there is more than one column for it to relate.
 *
 * `colspan` is ignored: a spanning cell occupies one column, which keeps the rest of the row aligned and is a
 * smaller lie than shifting every cell after it.
 */
function tableBlocks(table: Element, ranges: readonly { id: string; range: Range }[]): BookBlock[] {
  const out: BookBlock[] = [];
  const caption = table.querySelector('caption');
  if (caption) {
    const block = collect(caption, 'paragraph', ranges);
    if (block.text) out.push(block);
  }

  const rows: TableCell[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    // A nested table's rows belong to the nested table, not to this one.
    if (tr.closest('table') !== table) continue;
    const cells: TableCell[] = [];
    for (const cell of Array.from(tr.children)) {
      const tag = cell.tagName.toLowerCase();
      if (tag !== 'td' && tag !== 'th') continue;
      const { text, marks, emphasis, links } = collect(cell, 'paragraph', ranges);
      cells.push({ text, marks, emphasis, links, header: tag === 'th' });
    }
    if (cells.length) rows.push(cells);
  }

  if (!rows.length) return out;
  if (rows.every((r) => r.length <= 1)) {
    for (const [cell] of rows) if (cell?.text) out.push({ kind: 'paragraph', ...cell });
    return out;
  }
  out.push({ kind: 'table', text: '', marks: [], emphasis: [], links: [], rows });
  return out;
}

/** What `<strong>`, `<em>` and `<code>` a node sits inside, as one value. */
function emphasisOf(node: Node, stopAt: Element): Emphasis | null {
  let bold = false;
  let italic = false;
  let cur = node.parentElement;
  while (cur) {
    const tag = cur.tagName.toLowerCase();
    // `code` short-circuits: a bold word inside code is code, and there is no bold monospaced standard font.
    if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') return 'code';
    if (tag === 'strong' || tag === 'b') bold = true;
    if (tag === 'em' || tag === 'i' || tag === 'cite' || tag === 'dfn') italic = true;
    if (cur === stopAt) break;
    cur = cur.parentElement;
  }
  if (bold && italic) return 'bold-italic';
  if (bold) return 'bold';
  return italic ? 'italic' : null;
}

/** The `href` of the nearest enclosing `<a>`, or nothing. Empty and fragment-only hrefs are not destinations. */
function hrefOf(node: Node, stopAt: Element): string | undefined {
  let cur = node.parentElement;
  while (cur) {
    if (cur.tagName.toLowerCase() === 'a') {
      const href = cur.getAttribute('href')?.trim();
      return href || undefined;
    }
    if (cur === stopAt) break;
    cur = cur.parentElement;
  }
  return undefined;
}

/** Gather one block's text, the marked spans, the emphasized ones and the linked ones, in a single pass. */
/**
 * Text, or an inline element with nothing a walk would treat as its own — the children `walk` gathers into a run
 * between a wrapper's blocks.
 */
function isLoose(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return true;
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag) || BLOCK_KIND[tag] || TEXT_CONTAINERS.has(tag)) return false;
  if (tag === 'table' || tag === 'img' || tag === 'image' || tag === 'svg') return false;
  return !el.querySelector(`${WRAPPER_INSIDE},img,svg`);
}

/**
 * One block's text, emphasis, links and marks — from `el`, or with `only`, from those children of it alone: a run of
 * loose text between a wrapper's blocks (see `walk`).
 */
function collect(
  el: Element,
  kind: BlockKind,
  ranges: readonly { id: string; range: Range }[],
  only?: readonly Node[]
): BookBlock {
  const doc = el.ownerDocument;
  // Only the run's own nodes are visited — a wrapper can be a whole chapter, and walking all of it once per run
  // between its blocks would grow with the square of its length.
  const textNodes = (root: Node): Node[] => {
    if (root.nodeType === Node.TEXT_NODE) return [root];
    const out: Node[] = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  };
  const queue = only ? only.flatMap(textNodes) : textNodes(el);
  let text = '';
  // Where each text node's content starts in `text`, so a range's node+offset can be translated.
  const starts = new Map<Node, number>();
  const emphasis: BookBlock['emphasis'] = [];
  const links: BookBlock['links'] = [];
  for (const node of queue) {
    starts.set(node, text.length);
    const value = node.nodeValue ?? '';
    const kindHere = emphasisOf(node, el);
    if (kindHere && value) {
      const last = emphasis.at(-1);
      // Adjacent text nodes with the same emphasis are one run: `<em>two <b>words</b></em>` is three nodes and
      // should not become three spans that the page then draws as three separately measured runs.
      if (last && last.kind === kindHere && last.end === text.length) last.end = text.length + value.length;
      else emphasis.push({ start: text.length, end: text.length + value.length, kind: kindHere });
    }
    const href = hrefOf(node, el);
    if (href && value) {
      const last = links.at(-1);
      // Merged the same way, and on the HREF rather than on the anchor element: one link broken across `<a>Read
      // <em>this</em></a>` is one destination, and two annotations over adjacent words is two things to click.
      if (last && last.href === href && last.end === text.length) last.end = text.length + value.length;
      else links.push({ start: text.length, end: text.length + value.length, href });
    }
    text += value;
  }

  const marks: BookBlock['marks'] = [];
  for (const { id, range } of ranges) {
    // `intersectsNode` is the cheap rejection; the offsets below only make sense once it passes.
    if (!rangeTouches(range, el, only)) continue;
    const start = pointIn(range.startContainer, range.startOffset, starts, 0);
    const end = pointIn(range.endContainer, range.endOffset, starts, text.length);
    if (end > start) marks.push({ id, start, end });
  }

  /**
   * **A code block keeps its whitespace.** Everywhere else, the line breaks and indentation in EPUB source are
   * layout the page redoes for itself; inside `<pre>` they are the content. Collapsing them would run a function and
   * its comment onto one line, which for code is not a formatting difference — a `//` comment swallows whatever
   * follows it.
   */
  // Ids on this block or anything inside it. `id` is what an internal link resolves to, and it sits on a
  // heading's anchor as often as on the block itself.
  const anchors = only
    ? only
        .flatMap((n) =>
          n.nodeType === Node.ELEMENT_NODE
            ? [(n as Element).id, ...Array.from((n as Element).querySelectorAll('[id]'), (e) => e.id)]
            : []
        )
        .filter(Boolean)
    : [el.id, ...Array.from(el.querySelectorAll('[id]'), (e) => e.id)].filter(Boolean);

  const collapsed =
    kind === 'code'
      ? { text: text.replace(/\s+$/, ''), marks: [...marks], emphasis: [...emphasis], links: [...links] }
      : collapseWithMarks(text, marks, emphasis, links);
  return {
    kind,
    ...collapsed,
    ...(anchors.length ? { anchors } : {}),
    ...(kind === 'heading' ? { level: headingLevel(el) } : {}),
  };
}

function headingLevel(el: Element): number {
  const n = Number.parseInt(el.tagName.slice(1), 10);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 1;
}

/** `Range.intersectsNode` is not in every DOM implementation Obsidian runs on, so this is the portable form. */
function rangeTouches(range: Range, el: Element, only?: readonly Node[]): boolean {
  const doc = el.ownerDocument;
  const own = doc.createRange();
  if (only?.length) {
    own.setStartBefore(only[0]);
    own.setEndAfter(only[only.length - 1]);
  } else own.selectNodeContents(el);
  return (
    range.compareBoundaryPoints(Range.END_TO_START, own) < 0 && range.compareBoundaryPoints(Range.START_TO_END, own) > 0
  );
}

/** A span with the whitespace at either end taken off it. */
function trimSpan(
  text: string,
  start: number,
  end: number,
  href: string
): { start: number; end: number; href: string } {
  let from = start;
  let to = end;
  while (from < to && text[from] === ' ') from++;
  while (to > from && text[to - 1] === ' ') to--;
  return { start: from, end: to, href };
}

/** A range endpoint as an offset into the block's gathered text, or the given fallback when it lies outside. */
function pointIn(container: Node, offset: number, starts: ReadonlyMap<Node, number>, fallback: number): number {
  const base = starts.get(container);
  if (base !== undefined) return base + offset;
  // The endpoint is an element rather than a text node — a range that starts before the block's first character
  // or ends after its last. Clamping to the block's own bounds is what makes a mark spanning several paragraphs
  // draw correctly in each of them.
  return fallback;
}

/**
 * Collapse the whitespace and move the marks with it.
 *
 * Done together because doing them apart is the bug: EPUB source is indented, so a paragraph's raw text is full
 * of newlines and spaces that the page must not show — and every one removed before an offset shifts that offset.
 */
function collapseWithMarks(
  raw: string,
  marks: readonly { id: string; start: number; end: number }[],
  emphasis: readonly { start: number; end: number; kind: Emphasis }[],
  links: readonly { start: number; end: number; href: string }[]
): { text: string; marks: BookBlock['marks']; emphasis: BookBlock['emphasis']; links: BookBlock['links'] } {
  // ALL whitespace to one space, newlines included: inside a paragraph a line break in the source is just
  // indentation. (`collapseWhitespace` keeps newlines, which is right for text that is already laid out in lines
  // and wrong for a block being reflowed.)
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!marks.length && !emphasis.length && !links.length)
    return { text: collapsed, marks: [], emphasis: [], links: [] };

  // Map every raw offset to its collapsed one by replaying the same transformation.
  const map = new Array<number>(raw.length + 1);
  let out = 0;
  let pendingSpace = false;
  let seenNonSpace = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      pendingSpace = seenNonSpace;
      map[i] = out;
      continue;
    }
    // The pending space is emitted BEFORE this character's position is recorded, or every word that follows
    // collapsed whitespace maps one character early and a mark arrives with a leading space.
    if (pendingSpace) {
      out++;
      pendingSpace = false;
    }
    map[i] = out;
    seenNonSpace = true;
    out++;
  }
  map[raw.length] = out;
  const clamp = (n: number): number =>
    Math.max(0, Math.min(collapsed.length, map[Math.max(0, Math.min(raw.length, n))]));
  return {
    text: collapsed,
    marks: marks.map((m) => ({ id: m.id, start: clamp(m.start), end: clamp(m.end) })).filter((m) => m.end > m.start),
    emphasis: emphasis
      .map((e) => ({ kind: e.kind, start: clamp(e.start), end: clamp(e.end) }))
      .filter((e) => e.end > e.start),
    // Trimmed to the words themselves. EPUB source puts a newline and an indent inside the anchor, which after
    // collapsing leaves the span starting on a space — so the tinted text and the clickable rectangle would both
    // begin a character before the link's first letter.
    links: links.map((l) => trimSpan(collapsed, clamp(l.start), clamp(l.end), l.href)).filter((l) => l.end > l.start),
  };
}

/**
 * Cut one spine section's blocks into the chapters the contents page declares.
 *
 * **The boundary is an anchor, and `BookBlock.anchors` already records them** — it exists so an internal link has
 * something to point at. The markdown path (`splitSectionMarkdown`) has to inject marker tokens into the document
 * and find them again by regex, because converting to markdown loses element identity; blocks keep theirs, so
 * here it is a lookup.
 *
 * The rules are Export to vault's, so the two exports cut a book the same way:
 *
 * - **An entry with no fragment names the file**, so it starts at the top.
 * - **An entry whose fragment no block defines cannot be placed**, and is dropped: the piece before it simply
 *   keeps running. `splitSectionMarkdown` does the same with the same case.
 * - **Text above the first cut belongs to no chapter.** It comes back with `owner: null` rather than being
 *   attached to a neighbor — it is not the tail of the previous chapter, which lives in a different file, so
 *   attaching it there would put a hole in the top of this one when that chapter is deselected; and it is not the
 *   head of the next, because a chapter starts at its heading.
 * - **Two entries on the same block**: the LATER one takes it and the earlier contributes nothing, because the
 *   earlier one runs only as far as the next cut and that cut is in the same place. `splitSectionMarkdown` lands
 *   on the same answer for the same reason, and the two exports agreeing matters more than either reading.
 *
 * Pure, and separate from the reading, because which blocks land under which chapter is the part worth testing
 * and testing it should not need an EPUB.
 */
export function sliceAtAnchors(
  blocks: readonly BookBlock[],
  cuts: readonly { fragment: string; owner: string }[]
): { owner: string | null; from: number; to: number }[] {
  const located: { at: number; owner: string }[] = [];
  for (const cut of cuts) {
    if (!cut.fragment) {
      located.push({ at: 0, owner: cut.owner });
      continue;
    }
    const at = blocks.findIndex((b) => b.anchors?.includes(cut.fragment));
    if (at >= 0) located.push({ at, owner: cut.owner });
  }
  located.sort((a, b) => a.at - b.at);

  const pieces: { owner: string | null; from: number; to: number }[] = [];
  const first = located[0]?.at ?? blocks.length;
  if (first > 0) pieces.push({ owner: null, from: 0, to: first });
  for (let i = 0; i < located.length; i++) {
    const to = located[i + 1]?.at ?? blocks.length;
    if (to > located[i].at) pieces.push({ owner: located[i].owner, from: located[i].at, to });
  }
  return pieces;
}

/**
 * Where a file's lead-in goes — the blocks above its first anchor, `sliceAtAnchors`' unowned piece. The answer Save
 * as Markdown gives the same text (`collectByTocAnchors`, book-extractor.ts, which says why):
 *
 * - `before`, the chapter the file before it ended in, when that chapter was anchored partway down its file (the
 *   caller passes `undefined` otherwise) and the lead-in is prose — longer than `LEAD_IN_CHARS` — with no heading;
 * - `null`, a piece of its own, when it has a heading of its own;
 * - `next`, the file's first chapter, otherwise.
 */
export function leadInGoesTo(
  blocks: readonly BookBlock[],
  lead: { from: number; to: number },
  before: string | undefined,
  next: string | null | undefined
): string | null {
  const own = blocks.slice(lead.from, lead.to);
  if (own.some((b) => b.kind === 'heading')) return null;
  const text = (b: BookBlock): string =>
    b.rows ? b.rows.flatMap((row) => row.map((cell) => cell.text)).join(' ') : b.text;
  const chars = own.map(text).join(' ').replace(/\s+/g, ' ').trim().length;
  if (before && chars > LEAD_IN_CHARS) return before;
  return next ?? null;
}
