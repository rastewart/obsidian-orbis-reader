// A book's footnotes and endnotes, as Obsidian footnotes.
//
// **What counts as a footnote:** a reference is a short link — a number, a letter or a mark, or one the book types
// as `noteref` — that does not open its own paragraph (the ones that do are a notes list's labels pointing back into
// the text). It becomes a footnote only with evidence that what it
// points at is its note: the note links back to it, the note opens with the reference's own label, or the book
// types either end as a note. Without evidence it stays an ordinary link, and the note stays where it was.
//
// **Two passes, like the links.** A note usually sits in a later section than its reference — a chapter's end, or a
// Notes chapter at the back — so conversion only fences each note's text (`mark`), `gather` reads every fence once
// all the text exists and decides which references are footnotes, and `ExportLinks.render` writes `[^label]` and
// appends the definitions to the note holding the reference. Where the book's own copy of a note ends up is
// `gather`'s to decide.

import { decodeId, encodeId, fence } from './export-placeholders';

const { open: OPEN, mid: MID, close: CLOSE, token: NOTE_TOKEN, chars: FENCE_CHARS } = fence(0xe003);

const LIFTABLE = new RegExp(`(^[ \\t]*(?:[-*+]|\\d+\\.)[ \\t]+)?${NOTE_TOKEN.source}`, 'gm');

/**
 * Text that is only fence characters — which `ExportLinks.index` must not count as the book's text, or a fence at a
 * piece's top would make every target after it look partway down.
 */
export const FENCE_ONLY = new RegExp(`^[${FENCE_CHARS}\\s]*$`);

const BLOCK = /^(p|li|dd|dt|div|aside|section|blockquote|td|body|h[1-6]|table|ol|ul)$/i;
const HEADING = /^h[1-6]$/i;
/** A reference's text: `12`, `[12]`, `(a)`, `*`, `†`. */
const NOTE_SHAPED = /^[[(]?(\d{1,3}|[*†‡§¶]+|[a-z])[\])]?\.?$/i;
const NOTE_TYPES = /\b(footnote|endnote|rearnote|note)\b/;

const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const epubType = (el: Element | null | undefined): string =>
  (el?.getAttribute('epub:type') ?? el?.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') ?? '').toLowerCase();
const labelOf = (text: string): string => norm(text).replace(/[[\]().]/g, '');

interface Ref {
  /** Where the reference points. */
  target: string;
  /** The keys a back-link to this reference could name: its own id and its inline ancestors'. */
  own: string[];
  label: string;
  noteref: boolean;
  /** The section it sits in, for when neither end has a piece to compare. */
  section: number;
}

interface Note {
  /** The keys of every id inside the note — what a reference can point at. */
  keys: string[];
  /** Where the note's own links point, one of which may be back at its reference. */
  links: string[];
  /** The label the note opens with — `1` for "1. Online Etymology…" — or empty. */
  label: string;
  typed: boolean;
  /** Its Markdown, block by block, filled in by `gather`. */
  parts: string[];
}

/** Where a reference ended up: the note it is in (`null` = the single note) and its paragraph's block id. */
export interface RefBlock {
  file: string | null;
  id: string;
}

export class ExportFootnotes {
  private readonly refs = new Map<number, Ref>();
  private readonly notes: Note[] = [];
  private readonly noteByKey = new Map<string, number>();
  /** Link index → note index, for each reference `gather` found evidence for. */
  private readonly footnoteOf = new Map<number, number>();
  /** Notes that became footnotes and leave the text: the ones in the same chapter as their reference. */
  private readonly lifted = new Set<number>();
  /** Reference link → the block id its paragraph was given, for a note kept in a Notes chapter to link back to. */
  private readonly blocks = new Map<number, RefBlock>();
  /** A reference's own key → the reference, so a note's back-link can find where it went. */
  private readonly refByOwn = new Map<string, number>();

  /**
   * Called by `ExportLinks.mark` for every internal link it marks: record it if it is shaped like a reference.
   *
   * @param key where it points, as `ExportLinks` keys it.
   */
  candidate(a: Element, link: number, key: string, index: number): void {
    const text = norm(a.textContent);
    let inSup = false;
    for (let e: Element | null = a; e && e.localName !== 'body'; e = e.parentElement)
      if (e.localName === 'sup') inSup = true;
    const noteref = epubType(a).includes('noteref');
    if (!noteref && !(inSup && text.length <= 6) && !NOTE_SHAPED.test(text)) return;
    const block = blockAround(a);
    // A link that opens its paragraph is a notes list's label, pointing back into the text.
    if (block && norm(block.textContent).startsWith(text) && !noteref) return;
    const own: string[] = [];
    for (let e: Element | null = a; e && e !== block; e = e.parentElement) {
      const id = e.getAttribute('id') ?? (e.localName === 'a' ? e.getAttribute('name') : null);
      if (id) own.push(`${index}#${id}`);
    }
    this.refs.set(link, { target: key, own, label: labelOf(text), noteref, section: index });
  }

  /**
   * Fence every block in one section that could be a note: one a reference already points at, or one that opens
   * with a link shaped like a label (so a note met before its reference is still found). Which of them ARE notes is
   * `gather`'s question; a fenced block nobody cites is put back as it was.
   *
   * @param keyFor where a link in this section points, as `ExportLinks` keys it.
   */
  mark(doc: Document, index: number, keyFor: (href: string) => string | undefined): void {
    const body = doc.body ?? doc.documentElement;
    const targets = new Set(Array.from(this.refs.values(), (r) => r.target));
    const starts = new Set<Element>();
    for (const el of Array.from(body.querySelectorAll('[id], a[name]'))) {
      const id = el.getAttribute('id') ?? el.getAttribute('name');
      if (id && targets.has(`${index}#${id}`)) {
        const b = noteBlock(el);
        if (b) starts.add(b);
      }
    }
    for (const a of Array.from(body.querySelectorAll('a[href]'))) {
      const text = norm(a.textContent);
      if (!NOTE_SHAPED.test(text)) continue;
      const b = blockAround(a);
      if (b && b.localName !== 'body' && norm(b.textContent).startsWith(text)) starts.add(b);
    }
    // Reading order, and never a block inside another note.
    const ordered = Array.from(body.querySelectorAll('*')).filter((e) => starts.has(e));
    const taken = new Set<Element>();
    for (const start of ordered) {
      if (taken.has(start) || ancestorIn(start, taken) || start.closest('h1, h2, h3, h4, h5, h6')) continue;
      if (norm(start.textContent).length > 20000) continue;
      const blocks = [start, ...continuation(start)];
      const n = this.notes.length;
      const note: Note = { keys: [], links: [], label: '', typed: false, parts: [] };
      // Read before the fences go in, which are text.
      const m = /^[[(]?([A-Za-z0-9*†‡§¶]{1,4})[\])]?[.:]?(\s|$)/.exec(norm(start.textContent));
      note.label = m ? m[1] : '';
      for (const b of blocks) {
        taken.add(b);
        // Fenced with text, not replaced by a Turndown rule, so a block nobody cites converts exactly as it would
        // unfenced — a list item keeps its number — and only the fence has to come out.
        b.insertBefore(doc.createTextNode(`${OPEN}${encodeId(n)}${MID}`), b.firstChild);
        b.appendChild(doc.createTextNode(CLOSE));
        for (const e of [b, ...Array.from(b.querySelectorAll('[id], a[name]'))]) {
          const id = e.getAttribute('id') ?? (e.localName === 'a' ? e.getAttribute('name') : null);
          if (id) note.keys.push(`${index}#${id}`);
        }
        for (const l of Array.from(b.querySelectorAll('a[href]'))) {
          const k = keyFor((l.getAttribute('href') ?? '').trim());
          if (k) note.links.push(k);
        }
      }
      // An empty anchor just before the block marks where the note starts.
      const prev = start.previousElementSibling;
      if (prev && prev.localName === 'a' && !norm(prev.textContent)) {
        const id = prev.getAttribute('id') ?? prev.getAttribute('name');
        if (id) note.keys.push(`${index}#${id}`);
      }
      note.typed = [start, start.parentElement, start.querySelector('[id]')].some((e) => NOTE_TYPES.test(epubType(e)));
      for (const k of note.keys) if (!this.noteByKey.has(k)) this.noteByKey.set(k, n);
      this.notes.push(note);
    }
  }

  /**
   * Read every note's Markdown out of the finished text, and decide which references are footnotes — before any
   * note is rendered, since a reference in chapter 3 needs a note from the Notes chapter at the back.
   *
   * **Where the note goes depends on where the book kept it.** A note in the same chapter as its reference — at the
   * chapter's end, as some books do it — becomes the footnote and leaves the text, because the
   * footnote list lands in the same place and the book's copy would sit a few lines above it. A note kept in a
   * Notes chapter elsewhere stays there too: that chapter is still the book's, and its number links back to the
   * paragraph that cites it, through a block id added to that paragraph — the one thing an export adds to the text.
   *
   * @param texts every note's text, with the note it will be written into.
   * @param pieceOf the piece an id landed in (`ExportLinks.index`), which is what "the same chapter" means.
   * @param tokensIn the link placeholders in a stretch of text, in order.
   */
  gather(
    texts: readonly { file: string | null; text: string }[],
    pieceOf: (key: string) => string | undefined,
    tokensIn: (text: string) => number[]
  ): void {
    for (const { text } of texts)
      for (const m of text.matchAll(NOTE_TOKEN)) this.notes[decodeId(m[1])]?.parts.push(m[2].trim());
    const kept = new Set<number>();
    for (const [link, ref] of this.refs) {
      const n = this.noteByKey.get(ref.target);
      if (n === undefined) continue;
      const note = this.notes[n];
      if (!note.parts.some((p) => p)) continue;
      const backLinks = ref.own.some((k) => note.links.includes(k));
      const labelled = !!ref.label && note.label === ref.label;
      if (!(backLinks || labelled || ref.noteref || note.typed)) continue;
      this.footnoteOf.set(link, n);
      const notePiece = note.keys.map(pieceOf).find((p) => p !== undefined);
      const refPiece = ref.own.map(pieceOf).find((p) => p !== undefined);
      /**
       * A different file AND a different chapter. The file alone is not enough: a Calibre split can put a chapter's
       * notes in the next file, which continues the same chapter. The chapter alone is not enough either: a book
       * can put each file's notes at its end with several contents entries in the file, so the notes land in the
       * last of them — kept there, they would be a list of other chapters' notes.
       */
      const otherFile = note.keys[0]?.split('#')[0] !== String(ref.section);
      const apart = otherFile && (notePiece === undefined || refPiece === undefined || notePiece !== refPiece);
      if (apart) {
        kept.add(link);
        for (const k of ref.own) this.refByOwn.set(k, link);
      } else this.lifted.add(n);
    }
    // One block id per paragraph that cites a kept note, numbered within the note it is written into. The text
    // is cut into paragraphs exactly as `ExportLinks.render` cuts it, so both find the same paragraph.
    for (const { file, text } of texts) {
      let count = 0;
      for (const para of paragraphs(text.replace(NOTE_TOKEN, ''))) {
        const cited = tokensIn(para).filter((l) => kept.has(l));
        if (!cited.length) continue;
        const id = `fn-${++count}`;
        for (const l of cited) this.blocks.set(l, { file, id });
      }
    }
  }

  /** The block id a reference's paragraph was given, when a kept note links back to it. */
  blockFor(link: number): RefBlock | undefined {
    return this.blocks.get(link);
  }

  /** Where a link to `key` should land instead, when `key` is a reference whose paragraph has a block id. */
  blockAt(key: string): RefBlock | undefined {
    const ref = this.refByOwn.get(key);
    return ref === undefined ? undefined : this.blocks.get(ref);
  }

  /** The note a link is a reference to, when it is a footnote. */
  noteFor(link: number): number | undefined {
    return this.footnoteOf.get(link);
  }

  /** The label the book gave a reference. */
  labelFor(link: number): string {
    return this.refs.get(link)?.label ?? '';
  }

  /** `md` without the notes that left the text; every other fenced block back as it was. */
  lift(md: string): string {
    // A list item's marker, written before the fence, goes with it.
    return md
      .replace(LIFTABLE, (m, marker: string | undefined, id: string, content: string) =>
        this.lifted.has(decodeId(id)) ? '' : m.slice(0, marker?.length ?? 0) + content
      )
      .replace(/\n{3,}/g, '\n\n');
  }

  /** A note's Markdown, block by block. */
  partsOf(note: number): readonly string[] {
    return this.notes[note]?.parts ?? [];
  }

  /** The label a note opens with, to strip from its text. */
  noteLabel(note: number): string {
    return this.notes[note]?.label ?? '';
  }
}

/** The block a node sits in. */
function blockAround(el: Element): Element | null {
  let e: Element | null = el;
  while (e && !BLOCK.test(e.localName)) e = e.parentElement;
  return e;
}

/** The block a reference's target stands for: its own block, or — for an empty anchor — the block after it. */
function noteBlock(el: Element): Element | null {
  if (el.localName === 'a' && !norm(el.textContent)) {
    const parent = el.parentElement;
    if (parent && BLOCK.test(parent.localName) && parent.localName !== 'body') return parent;
    let n = el.nextElementSibling;
    while (n && !BLOCK.test(n.localName)) n = n.nextElementSibling;
    if (n) return n;
  }
  const b = blockAround(el);
  return b && b.localName !== 'body' && !HEADING.test(b.localName) ? b : null;
}

/**
 * The blocks after a note's first that are still that note: up to the next note, a heading, or a blank — and only
 * blocks styled as the note is. A biography's Notes chapter names each chapter in a `<p class="h2b">`, not a
 * heading, and without the style check every chapter's name would become the last paragraph of the note before it.
 */
function continuation(start: Element): Element[] {
  const out: Element[] = [];
  let n = start.nextElementSibling;
  while (n && out.length < 20) {
    const startsNote = !!n.getAttribute('id') || !!n.querySelector('[id], a[href]');
    const sameStyle = n.localName === start.localName && n.getAttribute('class') === start.getAttribute('class');
    if (startsNote || !sameStyle || HEADING.test(n.localName) || !norm(n.textContent)) break;
    out.push(n);
    n = n.nextElementSibling;
  }
  return out;
}

function ancestorIn(el: Element, set: Set<Element>): boolean {
  for (let e = el.parentElement; e; e = e.parentElement) if (set.has(e)) return true;
  return false;
}

/** Where one block of Markdown ends and the next begins — captured, so a split keeps the separators. */
export const BLOCK_BREAK = /(\n{2,})/;

/** Text cut into its blocks. */
function paragraphs(text: string): string[] {
  return text.split(BLOCK_BREAK).filter((_, i) => i % 2 === 0);
}
