// A book's own links, carried through Save as Markdown — the ones Obsidian can express, and no others.
//
// **The rule, which the guide states in the same words:** a link to the web, to a chapter, or to a heading Obsidian
// will land on — one that appears once in its note, or the first of its name there — comes over; any other link becomes
// its text. Obsidian can land on a note, a heading or a block, and an EPUB anchor sits on anything — a bare `<a id>`, a
// `<div>`, a `<p>` — so a link into the middle of a paragraph has nothing to point at, and a link to a later copy of a
// repeated heading lands on the first, silently, in the wrong place. Text is the honest outcome. In a typical book the
// contents page comes over whole; the links left as text are mostly chapter titles pointing back at the contents page,
// and footnotes, which are a separate question.
//
// **Two passes, because a link can point forward.** A section is converted before the sections after it have
// been opened, so while it is converted nothing knows what note a later chapter will be, or whether a heading
// will be unique. So conversion leaves a placeholder where each link was (`mark`), records where every `id` in
// the book lands (`index`), and the placeholders are filled in once every note's name and text exist (`render`).
// **Nothing is added to the book's text** — only a link's own markup is replaced.

import { linkKey } from './book-links';
import { BLOCK_BREAK, ExportFootnotes, FENCE_ONLY } from './export-footnotes';
import { decodeId, encodeId, fence } from './export-placeholders';
import { isExternalHref } from './pdf-writer';

/** Where one `id` in the book lands once the book is notes. */
interface Target {
  /** The chapter piece holding it — a contents href, or an unclaimed section's key. */
  piece: string;
  /** Nothing but whitespace between the start of its piece and it: a link here is a link to the chapter. */
  atStart: boolean;
  /** The heading it is on, or immediately above with no text between, as Markdown writes it. */
  heading: string | null;
  /**
   * Whether that heading is the first of its name — in its piece, and in the whole book. **Obsidian sends a link to a
   * repeated heading to the FIRST one**, so a link to the first is exactly right and only the later ones are unsafe.
   * A technical book's "Scripting the Service" has `### Hooks` and, under it, `#### Hooks`; the contents page links
   * the first.
   */
  firstInPiece?: boolean;
  firstInBook?: boolean;
  /** The heading's level, 1–6 — a heading path can only reach one below the chapter's own `#`. */
  level?: number;
}

/** A heading met in the walk: its text, its level, and whether it is the first of that name so far. */
interface HeadingSeen {
  text: string;
  level: number;
  firstInPiece: boolean;
  firstInBook: boolean;
}

/** What `render` needs to know about one exported piece. */
export interface PieceNote {
  /** The note it went into, without `.md`; `null` when every piece shares one note (a single-note export). */
  file: string | null;
  /** In a single note, the heading Orbis wrote for its chapter — what a link to the chapter lands on. */
  chapterHeading?: string;
  /**
   * Whether that heading is the first in the note with its name — see `HeadingOrder`. A link to the chapter is then
   * safe even when a later heading repeats the name, since Obsidian and GitHub both send a link to the first.
   */
  firstOfName?: boolean;
}

/**
 * Which of the chapter headings a single note is given come first of their name, fed in the order the note is written.
 *
 * **Why a chapter link needs it.** A guide's "Listening" chapter is followed, chapters later, by a settings page with a
 * "Listening" section; counting alone said the name repeats and left every link to the chapter as text. Both Obsidian
 * and GitHub send `#listening` to the FIRST heading of the name, matched without regard to case, so what decides is
 * whether anything earlier in the note has it.
 */
export class HeadingOrder {
  private readonly seen = new Set<string>();

  /** A chapter heading Orbis writes: true when no earlier heading in the note has its name. */
  chapter(heading: string): boolean {
    const key = headingKey(heading);
    const first = !this.seen.has(key);
    this.seen.add(key);
    return first;
  }

  /** The text written under it, whose headings all come before the next chapter's. */
  text(md: string): void {
    for (const m of md.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)) this.seen.add(headingKey(m[1]));
  }
}

/**
 * How links are written. `portable` is for a single note sent OUT of the vault — exported or shared — where a wiki link
 * means nothing: a link inside the note is a standard Markdown link to a GitHub-style anchor (`githubSlug`), which most
 * Markdown editors follow, and what only Obsidian can follow — a block id, a heading path — falls to text.
 */
export type LinkFormat = 'wiki' | 'markdown' | 'portable';

/**
 * A heading as GitHub, GitLab and VS Code make it an anchor: lowercased, punctuation dropped, each space a hyphen.
 * "PART I – CHAPTER I" is `part-i--chapter-i`. Editors that slug differently may miss some links; the reader accepted
 * that for a copy made to leave Obsidian.
 */
export function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

const { open: OPEN, mid: MID, close: CLOSE, token: TOKEN } = fence(0xe000);

/** A link placeholder, with the `^…^` a superscript wrapped it in — which a footnote reference does not keep. */
const TOKEN_IN_SUP = new RegExp(`\\^(${TOKEN.source})\\^`, 'g');

/** The attribute `mark` sets and the Turndown rule reads. */
export const LINK_ATTR = 'data-orbis-link';

/** What the Turndown rule writes for a marked link: its content, fenced so `render` can find it. */
export function linkPlaceholder(id: string, content: string): string {
  return `${OPEN}${id}${MID}${content}${CLOSE}`;
}

const HEADING = /^h[1-6]$/i;
/** Elements Turndown drops, so an `id` inside one has nowhere to land. */
const DROPPED = /^(style|script|title|nav|aside)$/i;
/**
 * A heading Obsidian cannot link to, or that would need escaping this file cannot guarantee to match: `#`, `|`
 * and `^` end a link target, `[ ]` break one, and Markdown's own escapes and emphasis mean the heading's text in
 * the note is not the text a link would name.
 */
const UNLINKABLE = /[[\]#|^\\*_`<>]/;

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * A heading as Obsidian compares it when resolving a link — its `stripHeading`, read from the 1.13.7 bundle:
 * ASCII punctuation becomes a space, whitespace collapses, case is ignored (`resolveSubpath` lowercases both sides).
 *
 * **Every question about "the same heading" is asked this way**, because it is Obsidian's answer that decides where a
 * link lands. Compared any stricter, "Hooks" and "Hooks:" are two headings to us and one to Obsidian, and a link to
 * the second is sent to the first.
 */
const OBSIDIAN_PUNCTUATION = /[!"#$%&()*+,.:;<=>?@^`{|}~/[\]\\\r\n]/g;
export function headingKey(s: string): string {
  return s.replace(OBSIDIAN_PUNCTUATION, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export class ExportLinks {
  private readonly links: ({ external: string } | { key: string })[] = [];
  private readonly targets = new Map<string, Target>();
  /** Heading names already met, per piece and across the book, in reading order — see `Target.firstInPiece`. */
  private readonly seenInPiece = new Map<string, Set<string>>();
  private readonly seenInBook = new Set<string>();
  private readonly sectionIndexOf: (path: string) => number | undefined;
  /** The book's footnotes, as Obsidian footnotes — see `export-footnotes.ts`. */
  private readonly footnotes = new ExportFootnotes();

  /**
   * @param sectionIndexForHref the export's own section resolver: a spine index, or -1 when it is not a section.
   * @param format the export's link format — the same setting that decides how an image is written.
   * @param toMarkdown the export's Turndown, so a heading's text here is exactly what the note will contain.
   * @param fragmentSectionOf where a bare `#id` lands when the book's ids are book-wide (FB2) — see `linkKey`.
   */
  constructor(
    sectionIndexForHref: ((href: string) => number) | undefined,
    private readonly format: LinkFormat,
    private readonly toMarkdown: (html: string) => string,
    private readonly fragmentSectionOf?: (id: string) => number | undefined
  ) {
    this.sectionIndexOf = (path) => {
      const i = sectionIndexForHref?.(path) ?? -1;
      return i >= 0 ? i : undefined;
    };
  }

  /**
   * Mark every link in one section, so Turndown writes a placeholder instead of its text.
   *
   * **Not a link inside a heading.** A heading has to stay plain to be something a link can name, and a chapter
   * title that links back to the contents page — the commonest shape there is — reads perfectly well as text.
   */
  mark(doc: Document, index: number, resolveHref: ((href: string) => string) | undefined): void {
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      if (a.closest('h1, h2, h3, h4, h5, h6')) continue;
      const href = (a.getAttribute('href') ?? '').trim();
      if (!href) continue;
      const entry = isExternalHref(href)
        ? /^(https?|mailto|ftp):/i.test(href)
          ? { external: href }
          : null
        : (() => {
            const key = linkKey(href, index, resolveHref, this.sectionIndexOf, this.fragmentSectionOf);
            return key ? { key } : null;
          })();
      if (!entry) continue;
      if ('key' in entry) this.footnotes.candidate(a, this.links.length, entry.key, index);
      a.setAttribute(LINK_ATTR, encodeId(this.links.length));
      this.links.push(entry);
    }
    this.footnotes.mark(doc, index, (href) =>
      linkKey(href, index, resolveHref, this.sectionIndexOf, this.fragmentSectionOf)
    );
  }

  /** Read every note out of the finished text before any of it is rendered — see `ExportFootnotes.gather`. */
  gather(texts: readonly { file: string | null; text: string }[]): void {
    this.footnotes.gather(
      texts,
      (key) => this.targets.get(key)?.piece,
      (text) => Array.from(text.matchAll(TOKEN), (m) => decodeId(m[1]))
    );
  }

  /**
   * Record where every `id` in one section lands: which piece, whether at its start, and on what heading.
   *
   * Walked in document order, which is the order the Markdown is written in, so a piece here is the piece the
   * text went into. `boundary` names the split markers the anchor collector injects, and what piece each starts;
   * it mirrors `splitSectionMarkdown`, which cuts the Markdown at the same markers.
   */
  index(
    doc: Document,
    index: number,
    opts: {
      initial: string;
      boundary?: (el: Element) => string | null;
      /**
       * The section is the chapter before it continuing (`continuationSections`), so its top is partway through
       * that chapter: a link to it is not a link to the chapter's start.
       */
      continuing?: boolean;
    }
  ): void {
    const headingText = (el: Element): string => this.toMarkdown(el.outerHTML).replace(/^#+\s*/, '');
    const body = doc.body ?? doc.documentElement;
    let piece = opts.initial;
    let chars = opts.continuing ? 1 : 0;
    // Targets still waiting to learn whether a heading follows them with no text between.
    let pending: Target[] = [];
    // Targets in the current piece while it has no text yet: if the piece turns out empty they belong to the next.
    let unhomed: Target[] = [];
    const sectionStart: Target = { piece, atStart: !opts.continuing, heading: null };
    if (!opts.continuing) unhomed.push(sectionStart);
    this.set(`${index}#`, sectionStart);

    const walk = (node: Node, inHeading: HeadingSeen | null): void => {
      if (node.nodeType === 3) {
        if (norm(node.nodeValue ?? '') && !FENCE_ONLY.test(node.nodeValue ?? '')) {
          chars += 1;
          pending = [];
          unhomed = [];
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element;
      const next = opts.boundary?.(el) ?? null;
      if (next !== null) {
        // A piece that never got any text is not a place: whatever was recorded in it opens the next one.
        if (chars === 0) for (const t of unhomed) t.piece = next;
        piece = next;
        chars = 0;
        pending = [];
        return;
      }
      if (DROPPED.test(el.localName)) return;
      const isHeading = !inHeading && HEADING.test(el.localName);
      const heading = isHeading ? this.meet(norm(headingText(el)), Number(el.localName[1]), piece) : inHeading;
      if (isHeading && heading) {
        for (const t of pending) Object.assign(t, headingFields(heading));
        pending = [];
      }
      const ids = [el.getAttribute('id'), el.localName === 'a' ? el.getAttribute('name') : null];
      for (const id of ids) {
        if (!id) continue;
        const target: Target = { piece, atStart: chars === 0, ...headingFields(heading) };
        if (!heading) pending.push(target);
        if (chars === 0) unhomed.push(target);
        this.set(`${index}#${id}`, target);
      }
      for (const child of Array.from(el.childNodes)) walk(child, heading);
    };
    walk(body, null);
  }

  /** Record a heading as met, and say whether it is the first of its name in its piece and in the book. */
  private meet(text: string, level: number, piece: string): HeadingSeen {
    const key = headingKey(text);
    let inPiece = this.seenInPiece.get(piece);
    if (!inPiece) this.seenInPiece.set(piece, (inPiece = new Set()));
    const seen = { text, level, firstInPiece: !inPiece.has(key), firstInBook: !this.seenInBook.has(key) };
    inPiece.add(key);
    this.seenInBook.add(key);
    return seen;
  }

  private set(key: string, target: Target): void {
    if (!this.targets.has(key)) this.targets.set(key, target);
  }

  /**
   * Fill in one note's placeholders.
   *
   * @param noteOf the note each exported piece went into; `undefined` for a piece that was not exported.
   * @param headingCount how many times a heading occurs in a note (`null` = the single note). A repeated heading is
   *   linked only when the target is the FIRST of its name there, since that is where Obsidian sends the link.
   * @param isChapterHeading whether a name is one of the `#` chapter headings Orbis writes into a single note — which
   *   the book's own headings do not know about, so one of them sharing the name comes first and wins.
   * @param piecesUnder how many pieces a chapter heading stands above, in a single note — see the heading path.
   */
  render(
    md: string,
    noteOf: (piece: string) => PieceNote | undefined,
    headingCount: (file: string | null, heading: string) => number,
    isChapterHeading: (heading: string) => boolean = () => false,
    piecesUnder: (chapterHeading: string) => number = () => 0
  ): string {
    const fn = this.footnotes;
    // This note's footnotes, in the order first cited: note index → the label it is given here.
    const labels = new Map<number, string>();
    const used = new Set<string>();
    const labelFor = (link: number, note: number): string => {
      const had = labels.get(note);
      if (had) return had;
      const own = fn.labelFor(link);
      let label = /^[A-Za-z0-9]+$/.test(own) ? own : `n${labels.size + 1}`;
      for (let k = 2; used.has(label); k++) label = `${own || 'n'}-${k}`;
      used.add(label);
      labels.set(note, label);
      return label;
    };
    const renderLinks = (text: string): string =>
      text
        // A superscript that holds only a reference is the reference: its carets go first, and only then the rest,
        // so a link just before it — a chapter title's own link — cannot take the opening caret for its own.
        .replace(TOKEN_IN_SUP, (m, token: string, id: string) => (fn.noteFor(decodeId(id)) !== undefined ? token : m))
        .replace(TOKEN, (_m, id: string, content: string, at: number, whole: string) => {
          const n = decodeId(id);
          const note = fn.noteFor(n);
          if (note !== undefined) return `[^${labelFor(n, note)}]`;
          // In a table row a wiki link's `|` would end the cell — see `internal`.
          const inTable = whole
            .slice(whole.lastIndexOf('\n', at - 1) + 1)
            .trimStart()
            .startsWith('|');
          return this.one(n, content, noteOf, headingCount, isChapterHeading, piecesUnder, inTable);
        });
    // No block ids in a portable note: `^id` is Obsidian's, and anywhere else it is two stray characters.
    const blockId = (link: number) => (this.format === 'portable' ? undefined : fn.blockFor(link)?.id);
    const body = renderLinks(withBlockIds(fn.lift(md), blockId));
    if (!labels.size) return body;
    // Definitions after the text, each rendered in turn — a note can cite another, which joins the end of the list.
    const defs: string[] = [];
    for (let i = 0; i < labels.size; i++) {
      const [note, label] = [...labels][i];
      const text = renderLinks(stripNoteLabel(fn.partsOf(note), fn.noteLabel(note)));
      const [first = '', ...rest] = text.split('\n');
      defs.push(`[^${label}]: ${first}${rest.map((l) => (l ? `\n    ${l}` : '\n')).join('')}`);
    }
    return `${body.replace(/\s+$/, '')}\n\n${defs.join('\n\n')}\n`;
  }

  /** One link, as `render` writes it when it is not a footnote. */
  private one(
    n: number,
    content: string,
    noteOf: (piece: string) => PieceNote | undefined,
    headingCount: (file: string | null, heading: string) => number,
    isChapterHeading: (heading: string) => boolean,
    piecesUnder: (chapterHeading: string) => number,
    inTable = false
  ): string {
    {
      const link = this.links[n];
      if (!link) return content;
      if ('external' in link) return this.external(link.external, content);
      // A reference whose paragraph was given a block id — a Notes chapter's number linking back to the text.
      const block = this.footnotes.blockAt(link.key);
      if (block)
        return this.format === 'portable' ? content : this.internal(block.file, `^${block.id}`, content, inTable);
      // An `id` the book does not contain, or one in a section that was never exported: nowhere to go.
      const target = this.targets.get(link.key);
      if (!target) return content;
      const note = noteOf(target.piece);
      if (!note) return content;
      if (target.atStart) {
        if (note.file !== null) return this.internal(note.file, null, content, inTable);
        const h = note.chapterHeading;
        const lands = !!h && linkable(h) && (headingCount(null, h) === 1 || !!note.firstOfName);
        return lands ? this.internal(null, h, content, inTable) : content;
      }
      const h = target.heading;
      if (!h || !linkable(h)) return content;
      const count = headingCount(note.file, h);
      /**
       * Once is always safe. More than once, only the first — in a book folder the note is the piece, so first in
       * the piece; in a single note the note is the book plus Orbis's own chapter headings, so first in the book and
       * sharing no name with them. Anything uncertain (a heading stripped as a duplicate title, one in a chapter not
       * exported) can only make the target look LATER than it is, so it falls to text, never to a wrong link.
       */
      const first = note.file !== null ? target.firstInPiece : target.firstInBook && !isChapterHeading(h);
      if (count === 0) return content;
      if (count === 1 || first) return this.internal(note.file, h, content, inTable);
      /**
       * **A heading path, for a later copy in a single note: `[[#6. Github#Hooks]]`.** Obsidian's `resolveSubpath`
       * finds the first heading matching the first part, then the first DEEPER heading after it matching the next —
       * read from the 1.13.7 bundle. So the path lands exactly when the chapter's own `#` heading is unique, the
       * target is the first of its name under it, and the target is deeper than that `#`. A technical book's contents
       * page links a third "Hooks" and two more second copies of a name: each is first in its own chapter.
       *
       * "First under it" is "first in its piece" only while the heading stands above one piece; two pieces sharing a
       * chapter heading could hide an earlier copy in the other, so that case stays text.
       */
      const chapter = note.chapterHeading;
      const path =
        note.file === null &&
        !!chapter &&
        linkable(chapter) &&
        (headingCount(null, chapter) === 1 || !!note.firstOfName) &&
        piecesUnder(chapter) === 1 &&
        target.firstInPiece &&
        (target.level ?? 1) > 1 &&
        headingKey(chapter) !== headingKey(h);
      // A heading path is Obsidian's alone; a portable note has no way to name a later copy, so it is text there.
      return path && this.format !== 'portable' ? this.internal(null, `${chapter}#${h}`, content, inTable) : content;
    }
  }

  private external(url: string, content: string): string {
    const text = content.trim();
    const dest = linkDestination(url);
    // An address that is not one, the words alone.
    if (!dest) return content;
    if (!text) return `<${dest}>`;
    if (text.includes('\n\n') || /!\[/.test(text)) return content;
    return `[${text}](${dest})`;
  }

  /** `inTable`: the link sits in a table row, where the `|` before a wiki link's text has to be written `\\|`. */
  private internal(file: string | null, heading: string | null, content: string, inTable = false): string {
    const text = content.trim();
    // An image, a block, or nothing: there is no link text that would read as the book did.
    if (!text || text.includes('\n\n') || /!\[/.test(text)) return content;
    if (this.format === 'wiki') {
      const alias = plainText(text);
      if (!alias || alias.includes(']]') || alias.includes('[[')) return content;
      return `[[${file ?? ''}${heading ? `#${heading}` : ''}${inTable ? '\\|' : '|'}${alias}]]`;
    }
    if (this.format === 'portable') {
      // One note, so a link is to a heading in it or it is nothing a reader elsewhere could follow.
      return file === null && heading ? `[${text}](#${githubSlug(heading)})` : content;
    }
    const path = file === null ? '' : encodePath(`${file}.md`);
    return `[${text}](${path}${heading ? `#${encodePath(markdownSubpath(heading))}` : ''})`;
  }
}

/** The fields a target takes from the heading it sits on or under. */
function headingFields(seen: HeadingSeen | null): Pick<Target, 'heading' | 'firstInPiece' | 'firstInBook' | 'level'> {
  return seen
    ? { heading: seen.text, firstInPiece: seen.firstInPiece, firstInBook: seen.firstInBook, level: seen.level }
    : { heading: null, firstInPiece: false, firstInBook: false };
}

/**
 * Link text as plain words, for a wiki link's display text.
 *
 * **Obsidian renders no Markdown inside `[[target|text]]`**, so a novel's italic `_Title_` in a link's text showed
 * its underscores. Emphasis markers come off and Turndown's backslash escapes are undone — the italics are lost, which
 * the wiki form cannot show anyway. A Markdown link renders its text, so it keeps its formatting.
 */
function plainText(md: string): string {
  // Escaped characters set aside first — `a\_b\_c` is the book's own underscores, not emphasis — then restored.
  const held: string[] = [];
  const mark = String.fromCharCode(0xe0ff);
  const guarded = md.replace(/\\([\\`*_{}[\]()#+\-.!<>|~])/g, (_m, c: string) => `${mark}${held.push(c) - 1}${mark}`);
  return guarded
    .replace(/(\*\*|__|~~|==|\*|_|`)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(new RegExp(`${mark}(\\d+)${mark}`, 'g'), (_m, i: string) => held[Number(i)] ?? '')
    .trim();
}

/**
 * `md` with a block id on each paragraph that cites a note kept in a Notes chapter — the id its number links to.
 *
 * At the end of the paragraph, which is where Obsidian reads one. A list or quote is a block per line, so there it
 * goes on the line holding the reference; a table takes it on a line of its own after the table.
 */
function withBlockIds(md: string, idFor: (link: number) => string | undefined): string {
  return md
    .split(BLOCK_BREAK)
    .map((chunk, i) => {
      if (i % 2) return chunk;
      let id: string | undefined;
      for (const m of chunk.matchAll(TOKEN)) if ((id = idFor(decodeId(m[1])))) break;
      if (!id) return chunk;
      if (/^\s*\|/.test(chunk)) return `${chunk}\n\n^${id}`;
      if (/^\s*(?:[-*+]|\d+\.|>)\s/.test(chunk)) {
        const lines = chunk.split('\n');
        const at = lines.findIndex((l) => Array.from(l.matchAll(TOKEN)).some((m) => idFor(decodeId(m[1])) === id));
        lines[at] = `${lines[at].replace(/\s+$/, '')} ^${id}`;
        return lines.join('\n');
      }
      return `${chunk.replace(/\s+$/, '')} ^${id}`;
    })
    .join('');
}

/**
 * A note's text without the label it opens with — "1. Online Etymology…" is footnote 1 already — whether that label
 * is a link back to the reference (a placeholder here) or plain text. Blocks are joined as paragraphs.
 */
function stripNoteLabel(parts: readonly string[], label: string): string {
  const text = parts.join('\n\n').trim();
  // A note whose number is a heading: FB2 titles every note section — `<title><p>1</p></title>`, which foliate writes
  // as an `h1` — and a heading inside a footnote definition breaks it. Only a heading that is nothing BUT a label.
  const titled = /^#{1,6}[ \t]+\\?[[(]?[A-Za-z0-9*†‡§¶]{1,4}\\?[\])]?\\?\.?[ \t]*(?:\n+|$)/.exec(text);
  if (titled) return text.slice(titled[0].length);
  const lead = new RegExp(`^${TOKEN.source}\\\\?[.:)\\]]?\\s*`);
  const m = lead.exec(text);
  if (m && /^[[(]?[A-Za-z0-9*†‡§¶]{1,4}[\])]?\\?\.?$/.test(m[2].trim())) return text.slice(m[0].length);
  if (!label) return text;
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`^[[(]?${esc}[\\])]?\\\\?[.:]?\\s+`), '');
}

function linkable(heading: string): boolean {
  return !!heading && !UNLINKABLE.test(heading);
}

/**
 * A heading as a Markdown link names it: its colons as spaces.
 *
 * **Obsidian reads a destination with a colon in it as a web address**, whatever comes before it: a biography's
 * contents linked `(#CHAPTER%206:%20THE%20LONG%20FIELD)`, which drew the external-link icon and "Cannot open
 * location". Encoding the colon is no answer, since whether `%3A` is decoded before the heading is looked up is not
 * something we can see, but a space is exactly what Obsidian turns a colon into when it compares headings
 * (`headingKey`), so the link still lands. The wiki form needs none of this.
 */
function markdownSubpath(heading: string): string {
  return heading.replace(/:/g, ' ');
}

/**
 * A path or heading as a Markdown link destination: URI-encoded, and parentheses too, which would end it. A space
 * would end it as well — `encodeURI` makes it `%20`. Images use it too (`imageEmbed`).
 */
/**
 * A book's web address as a Markdown link's destination, or null when it is not an address at all.
 *
 * **Nothing in it can end the link.** Whitespace, control characters, `<`, `>`, parentheses, the backslash and the
 * backtick are percent-encoded, as a browser sends most of them anyway, and the address is written bare, never in
 * `<…>`. Each of those is a way out: the book's address once went in raw, and a `>` in it ended the `<…>` wrapper
 * early, so the rest was HTML in the note, an `<iframe>` or a picture fetched from anywhere each time the note was
 * shown; a trailing `\` escaped the wrapper's own `>`, so it never closed; and an address with a space, written alone
 * as `<…>`, was not a link at all, so whatever followed the space was live. Without them, a picture or a tag has
 * nothing to open with. Otherwise the address is the book's, as written.
 */
export function linkDestination(url: string): string | null {
  try {
    new URL(url);
  } catch {
    return null;
  }
  let safe = '';
  for (const c of url) {
    const code = c.charCodeAt(0);
    const ends = /[\s<>()\\`]/.test(c) || code <= 0x1f || code === 0x7f;
    // encodeURIComponent leaves parentheses alone, and gives a space beyond ASCII its UTF-8 bytes.
    safe += !ends ? c : c === '(' ? '%28' : c === ')' ? '%29' : encodeURIComponent(c);
  }
  return safe;
}

export function encodePath(s: string): string {
  return encodeURI(s).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * Which note each exported piece went into, and what headings each note holds — what `render` resolves against.
 *
 * One definition for both formats, because the rule about dividers is the same in both: a piece with no text of
 * its own — a part — writes no note and no heading, so a link to it lands on the chapter it opens.
 */
export class PieceNotes {
  private readonly notes = new Map<string, PieceNote>();
  private readonly headings = new Map<string | null, Map<string, number>>();
  /** The `#` headings Orbis writes above each chapter in a single note — see `ExportLinks.render`. */
  private readonly chapterHeadings = new Set<string>();
  /** How many pieces each of those headings stands above: more than one, and "first in its piece" is not first under it. */
  private readonly piecesUnder = new Map<string, number>();
  private pending: string[] = [];
  /** Every note's final text, in order, for the footnotes — see `render`. */
  private readonly texts: { file: string | null; text: string }[] = [];
  private gathered = false;

  /** A piece with no text, which becomes part of whatever is placed next. */
  divider(key: string): void {
    this.pending.push(key);
  }

  /** A piece written into `note` — and any dividers waiting before it. */
  place(key: string, note: PieceNote): void {
    for (const k of [...this.pending, key]) this.notes.set(k, note);
    this.pending = [];
    if (note.chapterHeading) {
      const k = headingKey(note.chapterHeading);
      this.chapterHeadings.add(k);
      this.piecesUnder.set(k, (this.piecesUnder.get(k) ?? 0) + 1);
    }
  }

  /** A note's final text (`null` = the single note), whose headings decide which heading links are safe. */
  text(file: string | null, md: string): void {
    this.headings.set(file, headingCounts(md));
    this.texts.push({ file, text: md });
  }

  /**
   * `md` with its links filled in.
   *
   * **The first render reads every note's footnotes first** (`ExportLinks.gather`), because a reference in chapter 3
   * needs its note from the Notes chapter at the back. It can, because every note's `text` is recorded before any
   * note is rendered — the heading counts above already need exactly that.
   */
  render(links: ExportLinks, md: string): string {
    if (!this.gathered) {
      links.gather(this.texts);
      this.gathered = true;
    }
    return links.render(
      md,
      (piece) => this.notes.get(piece),
      (file, heading) => this.headings.get(file)?.get(headingKey(heading)) ?? 0,
      (heading) => this.chapterHeadings.has(headingKey(heading)),
      (heading) => this.piecesUnder.get(headingKey(heading)) ?? 0
    );
  }
}

/**
 * How many times each heading occurs in a note, keyed case-insensitively — Obsidian matches a heading link
 * without regard to case, so two headings differing only in case are a repeat.
 */
function headingCounts(md: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of md.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)) {
    const key = headingKey(m[1]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * The `#` headings a single note gives its chapters — each chapter's name, or that name with the contents entry
 * before it when the book already uses it as a heading.
 *
 * **Because a chapter heading that repeats a heading of the book's is not linkable.** An unlisted section is named by
 * its own heading, and nothing at naming time knows that the book also uses that name somewhere earlier: a technical
 * book's "Secure Relay" section is a chapter of its own, and "The Transports" before it has a `#### Secure Relay`.
 * Obsidian sends `[[#Secure Relay]]` to the first, so the contents page's link — and every path through that chapter —
 * stayed text. `4. Running a Server – Secure Relay` names it once. The same prefix `qualifyRepeatedNames` gives
 * repeated chapter names, applied here because only the whole note shows the collision; the names are Orbis's own
 * headings, so the book's text is untouched, and a book folder — where each chapter is its own note — needs none of it.
 *
 * @param chapters in note order: each chapter's name, whether the contents lists it, and its text.
 */
export function singleNoteChapterHeadings(
  chapters: readonly { title: string; listed: boolean; md: string }[]
): string[] {
  const book = new Set<string>();
  for (const c of chapters) for (const m of c.md.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm)) book.add(headingKey(m[1]));
  const titles = new Set(chapters.map((c) => headingKey(c.title)));
  let lastListed = '';
  return chapters.map((c) => {
    const qualifier = lastListed;
    if (c.listed) lastListed = c.title;
    if (c.listed || !qualifier || !book.has(headingKey(c.title))) return c.title;
    const proposed = `${qualifier} – ${c.title}`;
    const key = headingKey(proposed);
    return book.has(key) || titles.has(key) ? c.title : proposed;
  });
}
