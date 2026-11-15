// A rendered Obsidian DOM tree, turned into XHTML fit for an EPUB. Pure: takes a node, returns a string.
//
// The counterpart to `turndown-rules.ts`, which goes the other way. That one converts a book's HTML into Markdown
// for the vault; this converts a note's rendered Markdown into XHTML for a book.
//
// **A whitelist, not a blacklist.** Obsidian's rendered output carries plugin markup, collapse indicators, icon
// SVGs, event handlers and classes that mean nothing outside the app — and the set of those grows with every
// plugin the reader installs. Naming what may pass is the only version of this that stays correct.
//
// See docs/design/markdown-to-epub.md.

import { escapeXml } from './epub-builder';

/**
 * Whether a node is an element, by `nodeType` rather than `instanceof`.
 *
 * Cross-window safe by construction — a number comparison cannot care which window's `HTMLElement` constructor a
 * node came from, which is the whole problem `instanceof` has and the reason Obsidian ships `Node.instanceOf`. Using
 * that here would give this module a runtime dependency on Obsidian, and being free of one is what lets it be unit
 * tested against a plain DOM.
 */
function isElement(node: Node): node is HTMLElement {
  return node.nodeType === 1;
}

/** What the conversion could not carry, for the analysis screen to report BEFORE someone makes a book. */
export interface XhtmlLosses {
  /** Links flattened to their text — external, and wikilinks with no target in this note. */
  links: number;
  /** Images dropped. Chunk 3 packages them instead. */
  images: number;
  /** Inline SVG dropped — icons, and the MathJax output behind `$…$`. */
  svg: number;
  /** Elements with no text at all, which is what a Dataview query renders to in a detached element. */
  emptyBlocks: number;
}

export interface XhtmlResult {
  xhtml: string;
  losses: XhtmlLosses;
}

/** Anchor id → the section file it ended up in. Both an element's real `id` and a heading's slug are keys. */
export type AnchorMap = ReadonlyMap<string, { file: string; id: string }>;

/**
 * Where a link that leaves THIS note lands, when the book holds its target — folder conversion only.
 *
 * A second resolver rather than more keys in the `AnchorMap`, because the two answer different questions and
 * pooling them would be wrong in a way that is hard to see: an anchor map is per note, and two notes that both
 * have a `## Overview` produce the same id. One map across thirty notes would resolve a link to whichever chapter
 * happened to be indexed last. Anchors stay per note; this maps *note → the section file it landed in*, and is
 * built by `folder-epub.ts`, which is the layer that knows the vault.
 *
 * Returning a `file` with no `id` is a deliberate outcome: the target note is in the book but the fragment could
 * not be placed inside it. Landing on the right chapter beats flattening the link to text.
 */
export type NoteLinkResolver = (href: string) => { file: string; id?: string } | null;

/** One section, before serialization: the nodes that belong to it and what the nav should call it. */
export interface SectionNodes {
  title: string;
  nodes: Node[];
  /** Headings BELOW the split level, as nav entries pointing inside this section. `level` is carried so a caller
   *  can trim the depth — folder conversion does, since a note that is one whole section would otherwise contribute
   *  every heading it has to the table of contents. */
  children: { anchor: string; title: string; level: number }[];
}

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/** Where packaged images live inside the archive. An `img` survives serialization only if its `src` points here. */
export const IMAGE_DIR = 'images';

/**
 * Link targets a reader can actually act on from inside a book.
 *
 * Not a general allow-list of schemes: `app://` and `obsidian://` would resolve to something only on the machine
 * that made the book, and a link that works for its author and nobody else is worse than plain text.
 */
const EXTERNAL_SCHEME = /^(https?:|mailto:)/i;

/**
 * A heading's anchor id: lowercase, spaces to dashes, punctuation gone.
 *
 * Generated rather than read, because **Obsidian's reading view does not put ids on headings** — so there is
 * nothing to link to unless we make it. It also gives internal links something stable to resolve against: a link
 * written `[[#The Amazon contract]]` slugifies to the same string as the heading it names.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The element that actually holds the content.
 *
 * Obsidian may wrap everything in a single container, and partitioning the host's children would then produce one
 * section containing the whole book. Descend through single-element wrappers until there is something to partition.
 */
function contentRoot(root: HTMLElement): HTMLElement {
  let el = root;
  while (el.children.length === 1 && isElement(el.children[0]) && !el.textContent?.trim().startsWith('#')) {
    const only = el.children[0];
    if (HEADINGS.includes(only.tagName.toLowerCase())) break; // a lone heading IS the content
    if (!only.querySelector(HEADINGS.join(','))) break; // no headings inside: nothing to gain by descending
    el = only;
  }
  return el;
}

/** Give every heading a unique id, and report them in document order. Deduped, because two chapters can share a name. */
function numberHeadings(root: HTMLElement): { el: HTMLElement; level: number; text: string; id: string }[] {
  const seen = new Map<string, number>();
  return Array.from(root.querySelectorAll<HTMLElement>(HEADINGS.join(','))).map((el) => {
    const text = el.textContent?.trim() ?? '';
    const base = slugify(text) || 'section';
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    if (!el.id) el.id = id;
    return { el, level: Number(el.tagName.slice(1)), text, id: el.id };
  });
}

/**
 * Cut the document into sections at `level`, in document order.
 *
 * `level` 0 means do not split — one section, the whole note. That is also what a note with no headings at the
 * chosen level produces, which is a valid book rather than an error.
 *
 * **Content before the first heading gets its own section**, titled with the book. Silently losing someone's
 * opening paragraphs is a bug, not a tradeoff.
 */
export function splitAtHeadings(root: HTMLElement, level: number, bookTitle: string): SectionNodes[] {
  const host = contentRoot(root);
  const headings = numberHeadings(host);
  const tag = `h${level}`;
  const isBreak = (n: Node): boolean => isElement(n) && n.tagName.toLowerCase() === tag;

  const sections: SectionNodes[] = [];
  let current: SectionNodes | null = null;
  for (const node of Array.from(host.childNodes)) {
    if (level > 0 && isBreak(node)) {
      current = { title: node.textContent?.trim() || bookTitle, nodes: [node], children: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      // Leading content, or no split at all.
      current = { title: bookTitle, nodes: [], children: [] };
      sections.push(current);
    }
    current.nodes.push(node);
  }
  if (!sections.length) sections.push({ title: bookTitle, nodes: [], children: [] });

  // Sub-headings become nav entries inside their section, so a long section is navigable.
  for (const section of sections) {
    const own = new Set(section.nodes);
    for (const h of headings) {
      if (h.level <= level) continue;
      if (![...own].some((n) => n === h.el || (isElement(n) && n.contains(h.el)))) continue;
      section.children.push({ anchor: h.id, title: h.text, level: h.level });
    }
  }
  return sections;
}

/**
 * Every anchor in the book, mapped to the file it landed in.
 *
 * This is what keeps two things alive across the split. **Internal links**, because a heading link's target may now
 * be in a different file than the link. And **footnotes**, for exactly the same reason and more sharply: Obsidian
 * renders footnote references pointing at a list at the END of the document, so after splitting that list is in the
 * last file and every footnote in the book is a dead link unless its `href` is rewritten.
 *
 * Both an element's real `id` and a heading's slug are keys, because a link may be written either way.
 */
export function buildAnchorMap(sections: readonly SectionNodes[], fileFor: (index: number) => string): AnchorMap {
  const map = new Map<string, { file: string; id: string }>();
  sections.forEach((section, i) => {
    const file = fileFor(i);
    for (const node of section.nodes) {
      if (!isElement(node)) continue;
      const withIds = [node, ...Array.from(node.querySelectorAll<HTMLElement>('[id]'))];
      for (const el of withIds) {
        if (!el.id) continue;
        map.set(el.id, { file, id: el.id });
        // A block link names its target `^id`, as Obsidian writes it.
        if (el.id.startsWith(BLOCK_ID_PREFIX)) map.set(`^${el.id.slice(BLOCK_ID_PREFIX.length)}`, { file, id: el.id });
        const text = el.textContent?.trim();
        if (text && HEADINGS.includes(el.tagName.toLowerCase())) {
          const slug = slugify(text);
          if (slug && !map.has(slug)) map.set(slug, { file, id: el.id });
        }
      }
    }
  });
  return map;
}

/**
 * Elements allowed through, and the attributes each may keep.
 *
 * `id` is allowed everywhere because chunk 3's anchor map needs heading ids to survive; nothing else is, so an
 * `onclick` or a `data-callout-fold` cannot reach the book by being overlooked.
 */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  p: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  ul: [],
  ol: ['start'],
  li: [],
  blockquote: [],
  pre: [],
  code: [],
  em: [],
  strong: [],
  i: [],
  b: [],
  u: [],
  s: [],
  del: [],
  ins: [],
  mark: [],
  small: [],
  sup: [],
  sub: [],
  br: [],
  hr: [],
  table: [],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
  figure: [],
  figcaption: [],
  span: [],
  div: [],
  // `src` only ever survives as a packaged, archive-relative path — see the `img` branch in `walk`.
  img: ['src', 'alt'],
};

/** Self-closing in XHTML. Writing `<br>` instead of `<br/>` makes the document malformed XML, not merely untidy. */
const VOID = new Set(['br', 'hr', 'img']);

/**
 * The only classes worth keeping.
 *
 * Callouts are structure the reader wrote deliberately, and the EPUB stylesheet styles these two. Every other
 * Obsidian class describes app chrome — `is-collapsed`, `markdown-rendered`, `cm-*` — and would be dead weight in
 * a book that no stylesheet inside it explains.
 */
const KEEP_CLASSES = new Set(['callout', 'callout-title']);

/** Blocks whose content is app-only. Dropped whole rather than unwrapped, because unwrapping leaks their text. */
const DROP_WHOLE = [
  '.heading-collapse-indicator',
  '.collapse-indicator',
  '.copy-code-button',
  '.callout-fold',
  // Decoration: a callout's icon is an SVG the reader did not write, and counted as a lost drawing it was not.
  '.callout-icon',
  // An embedded note's properties, which rendered into the book as a YAML code block.
  '.frontmatter',
  '.frontmatter-container',
  '.metadata-container',
  // What Obsidian puts where an embed's target does not exist — "“missing.png” could not be found." for an
  // attachment, an offer to create it for a note. A message to the vault's owner, not text of the note; the dialog
  // counts a missing image (`classifyImages`).
  '.file-embed.mod-empty-attachment',
  '.file-embed.mod-empty',
];

/**
 * Footnote ids that are the same on every render.
 *
 * Obsidian ends each footnote's id with the render's `docId` — sixteen hex characters from `Math.random()`, new every
 * render — so two builds of an unchanged note differed in every footnote, and a rebuild could never be found
 * identical to the book already there (`compareEpubs`). Each docId becomes its order of appearance instead: as
 * unique as before, since an embedded note renders with a docId of its own, and the same on every build.
 */
export function stableFootnoteIds(root: HTMLElement): void {
  const seen = new Map<string, string>();
  const stable = (value: string): string =>
    value.replace(/-([0-9a-f]{16})$/, (_, doc: string) => {
      if (!seen.has(doc)) seen.set(doc, `d${seen.size + 1}`);
      return `-${seen.get(doc)}`;
    });
  for (const el of Array.from(root.querySelectorAll('[data-footnote-id]'))) {
    el.setAttribute('data-footnote-id', stable(el.getAttribute('data-footnote-id') ?? ''));
    if (el.id) el.id = stable(el.id);
  }
  for (const a of Array.from(root.querySelectorAll('a[href^="#fn"]'))) {
    a.setAttribute('href', `#${stable((a.getAttribute('href') ?? '').slice(1))}`);
  }
}

/**
 * The id a block link's target is given — `^blk` becomes `<span id="orbis-block-blk">` before the note is rendered
 * (`anchorBlockIds`, below), and the anchor map answers `^blk` with it. An XHTML id cannot start with `^`.
 */
const BLOCK_ID_PREFIX = 'orbis-block-';

/**
 * Each block id the note declares — `^blk` at the end of a paragraph, or on a line after a list or table — as an
 * anchor the book can keep: an empty `<span id="orbis-block-blk">` where the marker was.
 *
 * **Before rendering, because the rendering keeps no trace of them.** Obsidian strips `^blk` from the text and marks
 * the paragraph with nothing, so `[[#^blk]]` had nowhere to land and came out as the words "^blk". The positions come
 * from Obsidian's own metadata cache, which knows where each id is — so a `^` inside a code block, or in prose, is
 * never mistaken for one.
 */
export function anchorBlockIds(
  source: string,
  blocks:
    | Readonly<Record<string, { id: string; position: { start: { offset: number }; end: { offset: number } } }>>
    | undefined
): string {
  const found = Object.values(blocks ?? {})
    .map((b) => ({
      id: b.id,
      at: source.lastIndexOf(`^${b.id}`, b.position.end.offset),
      start: b.position.start.offset,
    }))
    .filter((b) => b.at >= b.start && /^[A-Za-z0-9-]+$/.test(b.id))
    .sort((a, b) => b.at - a.at);
  let out = source;
  for (const b of found) {
    out = `${out.slice(0, b.at)}<span id="${BLOCK_ID_PREFIX}${b.id}"></span>${out.slice(b.at + b.id.length + 1)}`;
  }
  return out;
}

function attrsFor(el: Element): string {
  const allowed = ALLOWED[el.tagName.toLowerCase()] ?? [];
  const parts: string[] = [];
  const id = el.getAttribute('id');
  if (id) parts.push(` id="${escapeXml(id)}"`);
  const kept = [...el.classList].filter((c) => KEEP_CLASSES.has(c));
  if (kept.length) parts.push(` class="${escapeXml(kept.join(' '))}"`);
  for (const name of allowed) {
    const v = el.getAttribute(name);
    if (v) parts.push(` ${name}="${escapeXml(v)}"`);
  }
  return parts.join('');
}

/**
 * Obsidian renders a task item as `<li><input type="checkbox">`, and `input` has no place in a book.
 *
 * A box glyph rather than nothing: the reader wrote a checklist, and a list of bare items loses the distinction
 * between done and not — which is the only information a checklist carries.
 */
function checkboxGlyph(el: Element): string | null {
  if (el.tagName.toLowerCase() !== 'input') return null;
  if (el.getAttribute('type') !== 'checkbox') return '';
  return el.hasAttribute('checked') || (el as HTMLInputElement).checked ? '☑ ' : '☐ ';
}

/**
 * A node tree as XHTML.
 *
 * Unknown elements are **unwrapped, not dropped** — their children still convert. Obsidian nests real content
 * inside wrappers that mean nothing here (`markdown-preview-sizer`, `el-p`, callout inner divs), and dropping
 * those would take the writing with them.
 */
export function domToXhtml(
  root: Node | readonly Node[],
  anchors?: AnchorMap,
  notes?: NoteLinkResolver,
  /** Whether a link's note part — `Note` in `Note#Heading` — names the note being converted. */
  isSelf?: (linkpath: string) => boolean
): XhtmlResult {
  const losses: XhtmlLosses = { links: 0, images: 0, svg: 0, emptyBlocks: 0 };

  /**
   * Where a link inside the book points, or null if it leaves it.
   *
   * Accepts `#anchor`, `#Heading Text` and `Note#Heading` — Obsidian writes all three, and the last resolves only
   * because the slug of the heading text is a key in the map alongside the real id.
   */
  const resolve = (href: string): { file: string; id: string } | null => {
    if (!anchors || !href) return null;
    const hash = href.indexOf('#');
    if (hash === -1) return null; // a whole-note link: nothing in this book to point at
    // **Only when the note part names THIS note.** `003-Trails#Overview` in a note with its own Overview landed on
    // that one: the fragment was looked up here and the note it named was never read. A link to another note's
    // heading is the resolver's (`notes`), and a web address's `#results` is the web page's.
    const path = href.slice(0, hash);
    if (path && !isSelf?.(path)) return null;
    const target = decodeURIComponent(href.slice(hash + 1)).trim();
    return anchors.get(target) ?? anchors.get(slugify(target)) ?? null;
  };

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeXml(node.textContent ?? '');
    if (!isElement(node)) return '';
    const el: Element = node;
    const tag = el.tagName.toLowerCase();

    if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') return '';
    if (tag === 'svg') {
      losses.svg++;
      return '';
    }
    if (tag === 'img') {
      // Kept only once the image has been PACKAGED — `collectImages` rewrites `src` to an archive-relative
      // `images/…` path as it adds the bytes to the zip. Anything still pointing at `app://`, a URL or a vault
      // path is unresolvable inside an EPUB, and a broken-image box is worse than nothing.
      const src = el.getAttribute('src') ?? '';
      if (!src.startsWith(`${IMAGE_DIR}/`)) {
        losses.images++;
        return '';
      }
      return `<img${attrsFor(el)}/>`;
    }
    /**
     * **A formula is left out, and counted as one.** Obsidian renders math with MathJax as custom elements rather
     * than SVG, which an EPUB reader cannot draw — and which unwrapped to nothing, so formulas were counted as
     * empty blocks while the callout icons were counted as the "drawings or formulas".
     */
    if (el.classList.contains('math')) {
      losses.svg++;
      return '';
    }
    /**
     * A Mermaid diagram is a drawing too. In a vault that has not allowed Mermaid, Obsidian renders a
     * `.mermaid-wrapper` holding a trust prompt and the source, which unwrapped into the book as "Display Mermaid
     * diagrams in this vault? … Allow"; in one that has, a `pre > code.language-mermaid` that Mermaid draws over
     * later — which a detached render may never reach.
     */
    if (
      el.classList.contains('mermaid-wrapper') ||
      (tag === 'pre' && el.querySelector(':scope > code.language-mermaid'))
    ) {
      losses.svg++;
      return '';
    }
    // A `<details>` is unwrapped, so its summary is made a line of its own rather than running into the text.
    if (tag === 'summary') return `<p><b>${kids(el)}</b></p>`;
    const box = checkboxGlyph(el);
    if (box !== null) return box;
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      // `data-href` is what Obsidian resolves an internal link by, and it is the raw target the reader typed —
      // `roadmap.md`, `[[roadmap]]`, `#Heading`. `href` on the same element is the rendered one, which on mobile
      // differs. External links carry no `data-href`, so this falls back for them.
      const target = el.getAttribute('data-href') ?? href;
      // Points INSIDE this note: rewritten to the file its target landed in. Covers heading links and footnote
      // references alike, which is why those are one piece of work.
      const to = resolve(target);
      if (to) return `<a href="${escapeXml(`${to.file}#${to.id}`)}">${kids(el)}</a>`;
      // Points at ANOTHER note in the same book — folder conversion. Second, so a bare `#anchor` always resolves
      // within the note that wrote it rather than being handed to a resolver that would have to re-derive that.
      const cross = notes?.(target);
      if (cross) {
        const dest = cross.id ? `${cross.file}#${cross.id}` : cross.file;
        return `<a href="${escapeXml(dest)}">${kids(el)}</a>`;
      }
      // Points OUT of it, at something a browser can open: kept verbatim.
      //
      // An earlier version stripped these, on the grounds that "a dead link in an ebook is worse than the words".
      // That is true of a wikilink — there is no vault inside an EPUB — and simply false here: an `https://` link is
      // valid EPUB content, and the plumbing already exists. foliate emits `external-link` and, with nothing
      // cancelling it, calls `globalThis.open(href, '_blank')`, which Obsidian routes to the system browser. The
      // rationale for one case had been applied to both.
      if (EXTERNAL_SCHEME.test(href)) return `<a href="${escapeXml(href)}">${kids(el)}</a>`;
      // A tag is a word with a `#` on it in the book, not a link that was lost.
      if (el.classList.contains('tag')) return kids(el);
      // Anything else — a wikilink to another note, a `#heading` with no match — flattens to its text.
      losses.links++;
      return kids(el);
    }
    if (DROP_WHOLE.some((sel) => el.matches(sel))) return '';

    const inner = kids(el);
    if (!(tag in ALLOWED)) return inner; // unwrap: keep the writing, discard the wrapper
    if (VOID.has(tag)) return `<${tag}${attrsFor(el)}/>`;
    if (!inner.trim() && tag !== 'td' && tag !== 'th') {
      /**
       * **An anchor is kept, empty or not** — a block link's target is an empty `<span id>` (see `BLOCK_ID_PREFIX`).
       * Anything else empty goes. **Only a plugin's block counts as a loss**: a Dataview query renders into a
       * `block-language-*` element and leaves it empty in a detached render. Everything else that comes out empty is
       * app chrome around something kept or dropped elsewhere — an image's wrapper before the image is packaged, an
       * embed's title bar — and counting it told a reader that thirteen pieces of their writing were lost.
       */
      if (el.id.startsWith(BLOCK_ID_PREFIX)) return `<span id="${escapeXml(el.id)}"></span>`;
      if ([...el.classList].some((c) => c.startsWith('block-language-'))) losses.emptyBlocks++;
      return '';
    }
    return `<${tag}${attrsFor(el)}>${inner}</${tag}>`;
  };

  const kids = (el: Node): string => Array.from(el.childNodes).map(walk).join('');

  const xhtml = Array.isArray(root) ? (root as readonly Node[]).map(walk).join('') : kids(root as Node);
  return { xhtml: xhtml.trim(), losses };
}
