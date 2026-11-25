// A page cursor over `pdf-lib`: fonts, margins, "draw this text and move down", and the marks drawn onto it.
//
// Shared by the two things this feature produces — the digest of marks and the whole marked-up document — because
// they differ in what they put on the page and in nothing about how a page works. Keeping the cursor in one place
// also keeps marks on the right page across a page break: a line is drawn and marked in the same step, on the page
// it landed on, and no caller can get that wrong by collecting boxes and decorating them later.
//
// See docs/design/marks-pdf.md.

import type { PDFDict, PDFDocument, PDFFont, PDFPage, PDFRef, RGB } from 'pdf-lib';
import type { Treatment } from './annotation-presets';
import { EMOJI_UNITS, EmojiFonts, type EmojiPictures } from './pdf-emoji';
import type { FontBytes } from './pdf-fonts';
import {
  closeGaps,
  columnWidths,
  type Measure,
  sanitizeForPdf,
  type WrappedLine,
  winAnsi,
  wrapLines,
} from './pdf-layout';
import { pdfUriHex } from './pdf-uri';

/** US Letter, in points. Not a setting: a page size nobody chose beats one more question on a dialog. */
export const PAGE = { width: 612, height: 792 };
export const MARGIN = { top: 64, bottom: 56, left: 64, right: 64 };
const LEADING = 1.35;
/** Link text. Dark enough to read as text on paper, blue enough to read as a link on screen. */
const LINK = { r: 0.11, g: 0.33, b: 0.6 };

export type FontName = 'body' | 'italic' | 'bodyBold' | 'bodyBoldItalic' | 'bold' | 'sans' | 'mono';

/** Inline emphasis, as the document carries it. Mirrors `book-blocks`'s `Emphasis` without importing it, so the
 *  writer stays a PDF concern. File-local on purpose: two exported types of the same name is a trip hazard for
 *  whoever imports one meaning to get the other. */
type Emphasis = 'bold' | 'italic' | 'bold-italic' | 'code';

/** An emphasized span, as offsets into the text being drawn. */
type EmphasisSpan = { start: number; end: number; kind: Emphasis };

/** What draws a run: one of the faces, or the emoji pictures (`pdf-emoji.ts`). */
type Face = FontName | 'picture';
type Run = { start: number; end: number; font: Face };
/** For a writer with no picture source: nothing is ever a picture. */
const NO_PICTURES: ReadonlyMap<number, number> = new Map();

/** A linked span, with the href as the book wrote it. */
export type LinkSpan = { start: number; end: number; href: string };

/**
 * Whether an href points OUT of the book.
 *
 * The two kinds become different annotations: an address gets a URI action, and anything else is treated as a
 * destination key naming a place inside this same PDF. Mirrors foliate's own test, deliberately, so the reading
 * surface and the export cannot disagree about what counts as leaving the book.
 */
export function isExternalHref(href: string): boolean {
  return /^(?!blob)\w+:/i.test(href.trim());
}

/**
 * One table cell, ready to draw: its text, the marks over it and its own emphasis.
 *
 * Marks arrive as `spans` rather than as annotation ids because the writer knows nothing about annotations — and
 * they are per cell for the reason that matters: offsets index into one string, so cells sharing a string would
 * draw every mark in whichever cell the arithmetic reached.
 *
 * File-local, like `Emphasis` above: `book-blocks` exports a `TableCell` of its own with a different shape, and the
 * export path converts between them.
 */
interface TableCell {
  text: string;
  /** A `<th>`: set in bold, and the row it belongs to repeats after a page break. */
  header?: boolean;
  spans?: readonly TextSpan[];
  emphasis?: readonly EmphasisSpan[];
  links?: readonly LinkSpan[];
}

/**
 * Which face draws a run: the block's own font, modified by the emphasis inside it.
 *
 * **A heading stays one face.** Bold inside an already-bold heading has nothing to say, and the standard PDF
 * fonts have no heavier weight to go to. `code` always wins, for the same reason it wins in the extractor.
 */
function fontFor(base: FontName, kind: Emphasis | undefined): FontName {
  if (!kind) return base;
  if (kind === 'code' || base === 'mono') return 'mono';
  if (base === 'bold' || base === 'sans') return base;
  const bold = kind === 'bold' || kind === 'bold-italic';
  const italic = kind === 'italic' || kind === 'bold-italic';
  // A quotation is italic already, so emphasis inside it reads as weight rather than as more slant.
  if (base === 'italic') return bold ? 'bodyBoldItalic' : 'italic';
  if (bold && italic) return 'bodyBoldItalic';
  if (bold) return 'bodyBold';
  return italic ? 'italic' : 'body';
}

/** How a mark looks: the wash behind the words, and the line over them. */
export interface MarkStyle {
  color?: string;
  treatment?: Treatment;
  treatmentColor?: string;
}

/** A marked span within the text being drawn, and the note attached to it if there is one. */
export interface TextSpan {
  start: number;
  end: number;
  style: MarkStyle;
  /** Present once per note; the writer places a sticky note at the first line the span touches. */
  note?: NoteAnnotation;
}

/**
 * A note, as a PDF comment.
 *
 * The three fields map onto what a viewer shows, and getting them the wrong way round is easy: `author` is the
 * label a viewer prints as who wrote the comment, and `subject` is the line above the body. The mark's name in the
 * author field would make every comment in a review copy appear to have been written by "Follow up" rather than
 * by the person who sent it.
 */
export interface NoteAnnotation {
  id: string;
  body: string;
  /** Who marked the document up. Falls back to a neutral label rather than to the mark. */
  author: string;
  /** The mark's name, which is what it is a note ABOUT. */
  subject?: string;
}

export interface TextOptions {
  font: FontName;
  size: number;
  /** Left inset from the margin. */
  indent?: number;
  color?: { r: number; g: number; b: number };
  /** Offsets into the text as passed in. Sanitizing preserves length, so they survive it. */
  spans?: readonly TextSpan[];
  /** Drawn once at the left of the first line — a list bullet, and nothing else so far. */
  prefix?: string;
  /** The document's own emphasis, as offsets into the text. Sorted and non-overlapping. */
  emphasis?: readonly { start: number; end: number; kind: Emphasis }[];
  /** The document's own links, as offsets into the text — a web address, or a destination key from `anchors`. */
  links?: readonly LinkSpan[];
  /** Keep the indentation each line was written with — code, and nothing else so far. */
  preserveIndent?: boolean;
  /**
   * Close the hole a character no face could draw leaves behind — see `closeGaps`, which says why. **Headings
   * only**: it moves every offset after the gap, so never with `spans`, `emphasis` or `links`. It belongs here
   * rather than in the caller because only the writer knows which faces are embedded.
   */
  collapseGaps?: boolean;
  /** Where the line sits in the column. Read from the book by the extractor, never chosen here. */
  align?: 'left' | 'center' | 'right';
  /**
   * Put this text in the PDF's outline, pointing at wherever its first line lands.
   *
   * Recorded from inside the drawing loop rather than by the caller beforehand, for the same reason the marks are:
   * the page a heading lands on is not known until it is drawn, and a bookmark taken before the break points at
   * the page the chapter is not on. `level` nests — 0 is a chapter, 1 a section inside it.
   */
  outline?: { title: string; level?: number };
  /**
   * Destination keys this text defines — what an internal link can point at.
   *
   * Recorded when the first line is DRAWN, exactly as the outline entry is, and for the same reason: the page a
   * paragraph lands on is not knowable until it is on one.
   */
  anchors?: readonly string[];
}

/** `#RRGGBB` → the 0–1 triple pdf-lib wants. Unparseable falls back to gray rather than throwing mid-document. */
function rgbOf(hex: string | undefined): { r: number; g: number; b: number } {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex ?? '');
  if (!m) return { r: 0.5, g: 0.5, b: 0.5 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

export interface PdfWriter {
  text(raw: string, opts: TextOptions): void;
  /** A table: real columns, wrapped cells, a repeating header row. `anchors` land on its top, as on text. */
  table(rows: readonly (readonly TableCell[])[], opts: { size: number; anchors?: readonly string[] }): void;
  /**
   * A drawn image, scaled to fit the column, with `anchors` landing on its top. Skipped when the bytes are a format
   * PDF cannot hold — and then answers false, so the caller can give the anchors to its caption instead.
   */
  image(
    bytes: Uint8Array,
    kind: 'png' | 'jpg',
    align?: 'left' | 'center' | 'right',
    anchors?: readonly string[],
    /** Where selecting the picture goes, when the book made it a link. */
    href?: string
  ): Promise<boolean>;
  /** Vertical space, in points. */
  space(points: number): void;
  /** Start a page, whatever is left on this one — for a cover sheet, which is the only thing so far that must
   *  stand alone. */
  newPage(): void;
  /** Start a new page unless `needed` points remain. */
  ensure(needed: number): void;
  width(font: FontName, size: number, text: string): number;
  /**
   * Number every page, at the foot, centered.
   *
   * Called at the END because a page's number is only knowable once the last one exists — and because the count
   * is what makes "page 4 of 312" possible, which is the form someone quoting a passage back to you actually
   * uses. `skipFirst` leaves a cover sheet unnumbered, as a cover sheet is.
   */
  numberPages(opts?: { skipFirst?: boolean; label?: (page: number, total: number) => string }): void;
  save(): Promise<Uint8Array>;
}

/**
 * @param embedded DejaVu bytes per face, when the reader has them. Without them the built-in fonts are used and
 *   the page is limited to WinAnsi — see `pdf-fonts.ts` for why that limit was worth lifting.
 * @param pictures where an emoji's picture comes from — see `pdf-emoji.ts`. Without it an emoji no face can draw is
 *   left as a gap, as it always was.
 */
export async function createPdfWriter(
  embedded?: FontBytes,
  pictures?: EmojiPictures
): Promise<PdfWriter & { doc: PDFDocument }> {
  const lib = await import('pdf-lib');
  const { PDFDocument, PDFHexString, PDFName, StandardFonts, rgb } = lib;
  const doc = await PDFDocument.create();

  /**
   * The book's own prose is serif and the reader's commentary is sans: one signal, costing nothing, saying on
   * every page which words are whose. The DejaVu faces are arranged the same way, so installing them changes what
   * can be drawn and nothing about how the page looks.
   *
   * `subset: true` is not optional at this size — embedding seven whole faces would add 3.1 MB to every exported
   * file. Subset, a document uses tens of KB.
   */
  const STANDARD: Record<FontName, (typeof StandardFonts)[keyof typeof StandardFonts]> = {
    body: StandardFonts.TimesRoman,
    italic: StandardFonts.TimesRomanItalic,
    bodyBold: StandardFonts.TimesRomanBold,
    bodyBoldItalic: StandardFonts.TimesRomanBoldItalic,
    bold: StandardFonts.HelveticaBold,
    sans: StandardFonts.Helvetica,
    mono: StandardFonts.Courier,
  };
  const SLOTS = Object.keys(STANDARD) as FontName[];

  let covers: (font: FontName, code: number) => boolean = (_f, code) => winAnsi(code);
  const fonts = {} as Record<FontName, PDFFont>;
  let drawsEmbedded = false;
  if (embedded) {
    const fontkit = (await import('@pdf-lib/fontkit')).default;
    doc.registerFontkit(fontkit);
    try {
      // fontkit is asked directly about coverage: pdf-lib's own font object cannot answer "do you have this
      // character", and the answer is what decides which face draws each run.
      const cmaps = {} as Record<FontName, { hasGlyphForCodePoint(code: number): boolean }>;
      // All read before any is embedded, so a file that is not a font leaves nothing half-done in the document.
      for (const slot of SLOTS) cmaps[slot] = fontkit.create(embedded[slot]);
      for (const slot of SLOTS) fonts[slot] = await doc.embedFont(embedded[slot], { subset: true });
      covers = (font, code) => cmaps[font].hasGlyphForCodePoint(code);
      drawsEmbedded = true;
    } catch (err) {
      // A font file that cannot be read is a plainer PDF, not a failed export.
      console.error('[Orbis] could not embed the expanded character set; drawing with the built-in fonts —', err);
    }
  }
  if (!drawsEmbedded) for (const slot of SLOTS) fonts[slot] = await doc.embedFont(STANDARD[slot]);

  /**
   * A character no face can draw is replaced; a character only ANOTHER face can draw switches face for that run.
   *
   * The second half is what makes the tick in a checklist survive: DejaVu's serif faces stop short of `✓ ✗ ☐ ☑`
   * and its sans carries them, so a run that needs one is drawn in sans rather than lost to a `?`.
   */
  const anyFaceHas = (code: number): boolean => SLOTS.some((slot) => covers(slot, code));

  /** The emoji this document draws as pictures, where no face can — see `EmojiFonts`. */
  const emojiFonts = pictures ? new EmojiFonts(lib, doc, pictures, anyFaceHas) : null;
  const encode = (text: string): string =>
    sanitizeForPdf(text, anyFaceHas, emojiFonts ? (g) => emojiFonts.isPicture(g) : undefined);
  /** Where each picture is in a cleaned string, start to end. */
  const picturesIn = (clean: string): ReadonlyMap<number, number> => emojiFonts?.rangesIn(clean) ?? NO_PICTURES;

  const contentWidth = PAGE.width - MARGIN.left - MARGIN.right;
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN.top;
  // One sticky note per note, however many lines its mark covers.
  const placed = new Set<string>();
  // Outline entries in reading order, each holding the page it landed on. Turned into a tree at save time,
  // because an item has to know its siblings and a sibling may not have been drawn yet.
  const bookmarks: { title: string; level: number; page: PDFPage; y: number }[] = [];
  /** Where each internal destination landed, filled in as the text is drawn. */
  const destinations = new Map<string, { page: PDFPage; y: number }>();
  /**
   * Internal links, held until every page exists.
   *
   * A link forward — to a chapter not yet drawn — has no page to point at when it is encountered, so the
   * annotation is built at save time instead. The rectangle and its page are captured now, because those are
   * facts about where the link IS rather than about where it goes.
   */
  const pendingLinks: { key: string; page: PDFPage; rect: [number, number, number, number] }[] = [];

  /**
   * Nothing has been drawn on this page yet.
   *
   * Without it, an element taller than a whole column — a full-page illustration — pushes itself onto a new page
   * from a page that is *already* empty, and the export gains a blank sheet before every plate. Nothing can be
   * gained by turning the page when the page is untouched, so the block draws here whatever its height.
   */
  let pristine = true;

  const ensure = (needed: number): void => {
    if (y - needed >= MARGIN.bottom || pristine) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN.top;
    pristine = true;
  };

  const stickyNote = (note: NoteAnnotation, top: number): void => {
    if (placed.has(note.id)) return;
    placed.add(note.id);
    /**
     * A `/Text` annotation: the pin a PDF viewer shows and opens on a click.
     *
     * The reason this feature is a PDF and not an HTML file. `Open: false` so a page of notes does not open as a
     * page of speech bubbles, and `F: 4` sets the Print flag — without it many viewers omit annotations when the
     * recipient prints, which loses exactly the commentary the document was sent for.
     */
    const annot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Name: 'Comment',
      // **The right margin.** The left one already carries list bullets and is where every marked line begins, so
      // a pin there sits against the text it refers to and on top of anything indented. The right margin is
      // otherwise empty, which is what a margin note wants.
      Rect: [PAGE.width - MARGIN.right + 8, top - 14, PAGE.width - MARGIN.right + 22, top],
      // **Hex strings, not literal ones.** A PDF string is Latin-1 unless it is UTF-16, so a note written in
      // Greek — or with a curly quote — would arrive mangled in the viewer's comment pane however good the font was.
      // `fromText` writes UTF-16BE, which every viewer reads, and none of this text is drawn with a font anyway.
      Contents: PDFHexString.fromText(note.body),
      T: PDFHexString.fromText(note.author || 'Note'),
      ...(note.subject ? { Subj: PDFHexString.fromText(note.subject) } : {}),
      C: [1, 0.85, 0.3],
      F: 4,
      Open: false,
    });
    const existing = page.node.Annots();
    const ref = doc.context.register(annot);
    if (existing) existing.push(ref);
    else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
  };

  /**
   * A clickable region over one line's worth of a link.
   *
   * One per line rather than one per link, because a link that wraps occupies two rectangles and a PDF annotation
   * is a rectangle. `Border: [0, 0, 0]` suppresses the box viewers draw by default — the text is already tinted,
   * and a black rectangle round every link would be the loudest thing on the page.
   */
  const attach = (to: PDFPage, annot: PDFDict): void => {
    const existing = to.node.Annots();
    const ref = doc.context.register(annot);
    if (existing) existing.push(ref);
    else to.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
  };

  const linkAnnotation = (href: string, box: { x: number; y: number; width: number; height: number }): void =>
    linkOver(href, [box.x, box.y - box.height * 0.25, box.x + box.width, box.y + box.height]);

  /** A link over exactly `rect` — a run of text's box, or a picture's own edges. */
  const linkOver = (href: string, rect: [number, number, number, number]): void => {
    // An address leaves the book; anything else is a place inside it, and cannot be resolved until the whole
    // document has been laid out.
    if (!isExternalHref(href)) {
      pendingLinks.push({ key: href, page, rect });
      return;
    }
    const uri = pdfUriHex(href);
    if (!uri) return;
    attach(
      page,
      doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: rect,
        Border: [0, 0, 0],
        A: doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFHexString.of(uri) }),
      })
    );
  };

  /** Turn the held-back internal links into annotations, now that every destination has a page. */
  const resolveInternalLinks = (): void => {
    for (const link of pendingLinks) {
      const target = destinations.get(link.key);
      // A destination that never got drawn — a chapter left out of this export — leaves the text unlinked rather
      // than pointing somewhere arbitrary. The caller drops those before drawing, so this is the belt to that
      // brace.
      if (!target) continue;
      attach(
        link.page,
        doc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: link.rect,
          Border: [0, 0, 0],
          Dest: [target.page.ref, 'XYZ', null, target.y, null],
        })
      );
    }
  };

  const width = (font: FontName, size: number, text: string): number => {
    const clean = encode(text);
    return measurer(clean, { font, size })(clean, 0);
  };

  /** A run of emoji, one glyph each — see `EmojiFonts.draw`. */
  const drawPictures = (clean: string, run: Run, x: number, baseline: number, size: number): void => {
    const pics = picturesIn(clean);
    for (let j = run.start; j < run.end; ) {
      const end = pics.get(j) ?? run.end;
      x += emojiFonts?.draw(page, clean.slice(j, end), x, baseline, size) ?? 0;
      j = end;
    }
  };

  /**
   * Cut `[from, to)` into runs that share one face.
   *
   * The one piece of machinery emphasis needs: everything else — wrapping, marking, page breaking — already works
   * in offsets, so once a run of characters can name its own font, mixed faces cost a loop rather than a rewrite.
   *
   * **Coverage cuts the runs a second time.** The face emphasis chose may not have the character: DejaVu's serif
   * faces stop short of `✓ ✗ ☐ ☑` and its sans carries them. A run that hits one is handed to a face that can draw
   * it. Doing it HERE rather than at the draw call is what keeps measuring and drawing in agreement — both go
   * through this function, so a substituted face changes the width the mark is drawn at too.
   */
  const runsIn = (
    text: string,
    from: number,
    to: number,
    base: FontName,
    emphasis: readonly { start: number; end: number; kind: Emphasis }[],
    links: readonly LinkSpan[] = []
  ): Run[] => {
    const cuts = new Set<number>([from, to]);
    for (const e of [...emphasis, ...links]) {
      if (e.start > from && e.start < to) cuts.add(e.start);
      if (e.end > from && e.end < to) cuts.add(e.end);
    }
    const points = [...cuts].sort((a, b) => a - b);
    const runs: Run[] = [];
    const pics = picturesIn(text);
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const kind = emphasis.find((e) => e.start <= start && e.end > start)?.kind;
      const font = fontFor(base, kind);
      // Walk the run, breaking it wherever the face has to change to keep drawing. A picture is a whole grapheme,
      // stepped over in one go: its code units are not characters any face is asked about.
      let at = start;
      let face: Face | undefined;
      for (let j = start; j < points[i + 1]; ) {
        const picEnd = pics.get(j);
        const here: Face = picEnd !== undefined ? 'picture' : faceFor(text, j, font);
        if (face === undefined) face = here;
        else if (here !== face) {
          runs.push({ start: at, end: j, font: face });
          at = j;
          face = here;
        }
        j = picEnd ?? j + 1;
      }
      runs.push({ start: at, end: points[i + 1], font: face ?? font });
    }
    return runs;
  };

  /** The face that will actually draw the character at `i`: the one asked for, or the first that has the glyph. */
  const faceFor = (text: string, i: number, want: FontName): FontName => {
    const code = text.codePointAt(i);
    if (code === undefined || covers(want, code)) return want;
    return SLOTS.find((slot) => covers(slot, code)) ?? want;
  };

  /**
   * A run's width, measured face by face — which is why `Measure` takes the offset the slice starts at.
   *
   * Once a line can hold bold, italic and code, a slice's width depends on WHERE it sits, so anything that
   * measures without knowing that gets every line containing emphasis wrong. Both the paragraph path and the
   * table path measure through this.
   */
  const measurer = (
    clean: string,
    opts: { font: FontName; size: number; emphasis?: readonly EmphasisSpan[] }
  ): Measure => {
    const emphasis = opts.emphasis ?? [];
    const font = fonts[opts.font];
    // A line holding a picture is measured run by run, like one holding emphasis: a face cannot measure an emoji.
    const byRuns = emphasis.length > 0 || picturesIn(clean).size > 0;
    return (slice, at) =>
      byRuns
        ? runsIn(clean, at, at + slice.length, opts.font, emphasis).reduce(
            (w, run) => w + runWidth(clean, run, opts.size),
            0
          )
        : font.widthOfTextAtSize(slice, opts.size);
  };

  /** One run's width: its face's measure of the text, or the pictures' advances, one emoji at a time. */
  const runWidth = (clean: string, run: Run, size: number): number => {
    if (run.font !== 'picture') return fonts[run.font].widthOfTextAtSize(clean.slice(run.start, run.end), size);
    const pics = picturesIn(clean);
    let w = 0;
    for (let j = run.start; j < run.end; ) {
      const end = pics.get(j) ?? run.end;
      w += ((emojiFonts?.advance(clean.slice(j, end)) ?? EMOJI_UNITS) / EMOJI_UNITS) * size;
      j = end;
    }
    return w;
  };

  /**
   * Draw one already-wrapped line at a given x and baseline, with its marks, emphasis and note pin.
   *
   * Everything that makes a line correct lives here, so a table cell is not a second implementation of it: the
   * wash goes behind the words, the treatment on top, and every x comes from the run-aware measure — which is what
   * stops a highlight on a line containing bold from sitting beside its own text rather than on it.
   */
  const drawLine = (
    line: WrappedLine,
    clean: string,
    x: number,
    baseline: number,
    opts: {
      font: FontName;
      size: number;
      color?: TextOptions['color'];
      spans?: readonly TextSpan[];
      emphasis?: readonly EmphasisSpan[];
      links?: readonly LinkSpan[];
    },
    measure: Measure
  ): void => {
    if (!line.text) return;
    pristine = false;
    const emphasis = opts.emphasis ?? [];
    // Clipped to this line: a link that wraps needs a rectangle per line. Both kinds are drawn — the caller has
    // already dropped any internal link whose destination is not part of this export.
    const links = (opts.links ?? []).filter((l) => l.start < line.end && l.end > line.start);
    const covering = (opts.spans ?? []).filter((s) => s.start < line.end && s.end > line.start);
    const boxes = covering.map((span) => {
      const from = Math.max(span.start, line.start);
      const to = Math.min(span.end, line.end);
      return {
        span,
        x: x + measure(clean.slice(line.start, from), line.start),
        y: baseline,
        width: measure(clean.slice(from, to), from),
        height: opts.size,
      };
    });
    for (const box of boxes) if (box.span.style.color) wash(page, box, box.span.style, rgb);

    const color = rgb(opts.color?.r ?? 0, opts.color?.g ?? 0, opts.color?.b ?? 0);
    let runX = x;
    for (const run of runsIn(clean, line.start, line.end, opts.font, emphasis, links)) {
      if (run.font === 'picture') {
        drawPictures(clean, run, runX, baseline, opts.size);
        runX += runWidth(clean, run, opts.size);
        continue;
      }
      const slice = clean.slice(run.start, run.end);
      // A link's text is tinted, because a clickable region nobody can see is a link nobody clicks. Color only,
      // no underline: underline is a MARK treatment here, and a link that looked like a mark would be read as one.
      const linked = links.some((l) => l.start <= run.start && l.end > run.start);
      page.drawText(slice, {
        x: runX,
        y: baseline,
        size: opts.size,
        font: fonts[run.font],
        color: linked ? rgb(LINK.r, LINK.g, LINK.b) : color,
      });
      runX += fonts[run.font].widthOfTextAtSize(slice, opts.size);
    }

    for (const link of links) {
      const from = Math.max(link.start, line.start);
      const to = Math.min(link.end, line.end);
      linkAnnotation(link.href, {
        x: x + measure(clean.slice(line.start, from), line.start),
        y: baseline,
        width: measure(clean.slice(from, to), from),
        height: opts.size,
      });
    }

    for (const box of boxes) {
      treat(page, box, box.span.style, rgb);
      if (box.span.note) stickyNote(box.span.note, baseline + opts.size);
    }
  };

  const text = (raw: string, opts: TextOptions): void => {
    const font = fonts[opts.font];
    const indent = opts.indent ?? 0;
    // Never with `spans`, `emphasis` or `links`: all three are offsets into this string, and closing a gap moves
    // every character after it. The option is documented for headings only for that reason.
    const encoded = encode(raw);
    const clean = opts.collapseGaps ? closeGaps(encoded) : encoded;
    const measure = measurer(clean, opts);
    const lines = wrapLines(clean, contentWidth - indent, measure, { keepIndent: opts.preserveIndent });
    const step = opts.size * LEADING;
    let first = true;
    for (const line of lines) {
      ensure(step);
      y -= step;
      const slack =
        opts.align && opts.align !== 'left' ? Math.max(0, contentWidth - measure(line.text, line.start)) : 0;
      const x = MARGIN.left + indent + (opts.align === 'center' ? slack / 2 : opts.align === 'right' ? slack : 0);
      // The destination sits a little above the baseline, so the heading itself is on screen rather than at the
      // very top edge when a viewer jumps to it.
      if (first && opts.outline?.title) {
        bookmarks.push({ title: opts.outline.title, level: opts.outline.level ?? 0, page, y: y + opts.size + 6 });
      }
      if (first) for (const key of opts.anchors ?? []) destinations.set(key, { page, y: y + opts.size + 6 });
      if (first && opts.prefix) {
        page.drawText(encode(opts.prefix), {
          x: x - font.widthOfTextAtSize(encode(opts.prefix), opts.size) - 4,
          y,
          size: opts.size,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });
      }
      first = false;
      drawLine(line, clean, x, y, opts, measure);
    }
  };

  /**
   * A table: real columns, wrapped cells, and marks that land in the cell they were made in.
   *
   * Columns are sized from what each one asks for and scaled to fit (`columnWidths`), then every cell wraps inside
   * its own column and the row is as tall as its tallest cell. Rules are horizontal only — a line under the header
   * and a hairline between rows. **No vertical rules and no box:** an EPUB's tables are often barely tabular, and
   * ruling every cell turns a loose list of values into something that claims more structure than it has. Rows
   * that fall off the page carry the header with them, so a table continued overleaf is still readable.
   *
   * A row taller than a whole page degrades to stacked paragraphs — the escape hatch for the one shape a grid
   * genuinely cannot hold.
   */
  const table = (
    rows: readonly (readonly TableCell[])[],
    opts: { size: number; anchors?: readonly string[] }
  ): void => {
    if (!rows.length) return;
    // A link into the table lands on its first row, wherever a page break put it — see `draw`.
    let anchorsLeft = opts.anchors;
    const columns = Math.max(...rows.map((r) => r.length));
    const size = opts.size;
    const step = size * LEADING;
    const PAD = 6;
    const cellOf = (row: readonly TableCell[], i: number): TableCell | undefined => row[i];
    const fontOf = (cell: TableCell | undefined): FontName => (cell?.header ? 'bodyBold' : 'body');

    /**
     * Two widths per column: what it would take unwrapped, and what it needs to avoid breaking a word.
     *
     * The second is the one that stops `Meaning` being drawn as `Meanin` / `g`. Both are capped at the content
     * width, so one runaway cell cannot claim more than a page.
     */
    const natural: number[] = [];
    const minimum: number[] = [];
    for (let i = 0; i < columns; i++) {
      let widest = 0;
      let longestWord = 0;
      for (const row of rows) {
        const cell = cellOf(row, i);
        if (!cell) continue;
        const clean = encode(cell.text);
        // Through the measurer, which knows a picture from a character a face can draw.
        const measure = measurer(clean, { font: fontOf(cell), size });
        widest = Math.max(widest, Math.min(measure(clean, 0) + PAD * 2, contentWidth));
        for (const word of clean.matchAll(/\S+/g)) {
          longestWord = Math.max(longestWord, measure(word[0], word.index ?? 0) + PAD * 2);
        }
      }
      natural.push(widest);
      minimum.push(Math.min(longestWord, contentWidth));
    }
    const widths = columnWidths(natural, contentWidth, minimum);
    const xs = widths.map((_, i) => MARGIN.left + widths.slice(0, i).reduce((a, b) => a + b, 0));

    /** One row's cells, wrapped into their columns. Returns the lines and how tall the row has to be. */
    const layout = (row: readonly TableCell[]) => {
      const cells = widths.map((width, i) => {
        const cell = cellOf(row, i);
        const clean = encode(cell?.text ?? '');
        const font = fontOf(cell);
        const measure = measurer(clean, { font, size, emphasis: cell?.emphasis });
        return { cell, clean, font, measure, lines: wrapLines(clean, width - PAD * 2, measure) };
      });
      return { cells, height: Math.max(1, ...cells.map((c) => c.lines.length)) * step + PAD };
    };

    const rule = (at: number, thickness: number, shade: number): void =>
      page.drawLine({
        start: { x: MARGIN.left, y: at },
        end: { x: MARGIN.left + contentWidth, y: at },
        thickness,
        color: rgb(shade, shade, shade),
      });

    const draw = (row: ReturnType<typeof layout>): void => {
      const top = y;
      if (anchorsLeft) for (const key of anchorsLeft) destinations.set(key, { page, y: top });
      anchorsLeft = undefined;
      for (const [i, c] of row.cells.entries()) {
        let baseline = top;
        for (const line of c.lines) {
          baseline -= step;
          const cellOpts = {
            font: c.font,
            size,
            spans: c.cell?.spans,
            emphasis: c.cell?.emphasis,
            links: c.cell?.links,
          };
          drawLine(line, c.clean, xs[i] + PAD, baseline, cellOpts, c.measure);
        }
      }
      y -= row.height;
    };

    const header = rows[0].some((c) => c.header) ? layout(rows[0]) : undefined;
    const body = header ? rows.slice(1) : rows;
    y -= 8;
    if (header) {
      ensure(header.height + step);
      draw(header);
      rule(y + 3, 0.8, 0.35);
    }
    for (const row of body) {
      const laid = layout(row);
      // Taller than any page can hold: fall back to stacked paragraphs rather than draw a row that overflows.
      if (laid.height > PAGE.height - MARGIN.top - MARGIN.bottom) {
        for (const cell of row) {
          if (cell.text) {
            text(cell.text, {
              font: fontOf(cell),
              size,
              spans: cell.spans,
              emphasis: cell.emphasis,
              links: cell.links,
            });
          }
        }
        continue;
      }
      if (y - laid.height < MARGIN.bottom) {
        newPage();
        // The header goes again at the top of the continuation: a column of numbers with no headings above it on
        // page two is a column of numbers nobody can read.
        if (header) {
          draw(layout(rows[0]));
          rule(y + 3, 0.8, 0.35);
        }
      }
      draw(laid);
      rule(y + 3, 0.4, 0.75);
    }
    y -= 6;
  };

  const newPage = (): void => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN.top;
    pristine = true;
  };

  const image = async (
    bytes: Uint8Array,
    kind: 'png' | 'jpg',
    align?: 'left' | 'center' | 'right',
    anchors?: readonly string[],
    href?: string
  ): Promise<boolean> => {
    try {
      const embedded = kind === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      // Never wider than the column, and never taller than a page can hold.
      // The 8 is the padding added below; leaving it out makes a full-height plate fail to fit the page it has
      // just been given.
      const scale = Math.min(
        contentWidth / embedded.width,
        (PAGE.height - MARGIN.top - MARGIN.bottom - 8) / embedded.height,
        1
      );
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      ensure(h + 8);
      pristine = false;
      // After `ensure`, so a link to a picture moved to the next page lands where it was drawn.
      for (const key of anchors ?? []) destinations.set(key, { page, y });
      y -= h + 4;
      // Where the BOOK says, not where a book usually puts a plate. An EPUB carries this in a class —
      // `.figcenter` beside `.figleft` — and centring everything is wrong for half of them.
      const slack = contentWidth - w;
      const dx = align === 'center' ? slack / 2 : align === 'right' ? slack : 0;
      page.drawImage(embedded, { x: MARGIN.left + dx, y, width: w, height: h });
      if (href) linkOver(href, [MARGIN.left + dx, y, MARGIN.left + dx + w, y + h]);
      y -= 4;
      return true;
    } catch {
      // An image PDF cannot hold is not worth failing an export over; the caption beside it still prints.
      return false;
    }
  };

  /**
   * The outline — what a PDF viewer shows in its sidebar, and the only navigation a 300-page export has.
   *
   * pdf-lib has no API for this, so the dictionaries are written by hand. The shape is a doubly-linked tree: each
   * item names its `Parent`, its `Prev` and `Next` siblings, and its `First`/`Last` children, which means every
   * reference exists before the object it points at is finished — hence `nextRef` to reserve an id and `assign` to
   * fill it in afterwards, rather than `register`.
   *
   * `Count` is signed: positive opens a branch with that many visible descendants, negative closes it. **Every
   * branch is written open.** With closed branches, a chapter file that also carries its part's title produces
   * `PART II` with `CHAPTER I` collapsed inside it, so the sidebar looks like it has simply lost chapter one. An
   * outline nobody can see is worse than a long one.
   *
   * `level` is a nesting depth the caller has already worked out — 0 is a top-level entry — so all this has to do
   * is turn a flat sequence into a tree.
   */
  const buildOutline = (): void => {
    if (!bookmarks.length) return;
    type Node = { title: string; page: PDFPage; y: number; children: Node[] };
    const roots: Node[] = [];
    const stack: { level: number; node: Node }[] = [];
    for (const mark of bookmarks) {
      const node: Node = { title: mark.title, page: mark.page, y: mark.y, children: [] };
      // Pop to the first entry shallower than this one. An entry at the same level as the one before it is its
      // SIBLING, which is the case a depth counter gets wrong: two headings of equal rank in one chapter file are
      // two chapters, not a chapter and its subsection.
      while (stack.length && stack[stack.length - 1].level >= mark.level) stack.pop();
      if (!stack.length) roots.push(node);
      else stack[stack.length - 1].node.children.push(node);
      stack.push({ level: mark.level, node });
    }

    const rootRef = doc.context.nextRef();
    /** Write one level, returning what the parent has to record about it. */
    const writeLevel = (nodes: Node[], parent: PDFRef): { first: PDFRef; last: PDFRef; count: number } => {
      const refs = nodes.map(() => doc.context.nextRef());
      let count = nodes.length;
      nodes.forEach((node, i) => {
        const children = node.children.length ? writeLevel(node.children, refs[i]) : undefined;
        count += children?.count ?? 0;
        doc.context.assign(
          refs[i],
          doc.context.obj({
            Title: PDFHexString.fromText(node.title),
            Parent: parent,
            ...(i > 0 ? { Prev: refs[i - 1] } : {}),
            ...(i < refs.length - 1 ? { Next: refs[i + 1] } : {}),
            ...(children ? { First: children.first, Last: children.last, Count: children.count } : {}),
            // `/XYZ left top zoom`: the top of the destination, left and zoom unchanged so a viewer keeps the
            // reader's own zoom rather than snapping to fit.
            Dest: [node.page.ref, 'XYZ', null, node.y, null],
          })
        );
      });
      return { first: refs[0], last: refs[refs.length - 1], count };
    };

    const top = writeLevel(roots, rootRef);
    // The root's count is every visible entry, not the number of top-level ones — everything is open.
    doc.context.assign(
      rootRef,
      doc.context.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: top.count })
    );
    doc.catalog.set(PDFName.of('Outlines'), rootRef);
    // Ask for the sidebar. A viewer that ignores it still has the outline; one that honors it opens on the
    // chapter list, which is the point of building it.
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  };

  return {
    doc,
    text,
    table,
    image,
    width,
    ensure,
    space: (points) => {
      y -= points;
    },
    numberPages: (opts) => {
      const pages = doc.getPages();
      const skip = opts?.skipFirst ? 1 : 0;
      const total = pages.length;
      for (let i = skip; i < total; i++) {
        const label = encode(opts?.label ? opts.label(i + 1, total) : String(i + 1));
        const w = fonts.sans.widthOfTextAtSize(label, 9);
        pages[i].drawText(label, {
          x: (PAGE.width - w) / 2,
          // Inside the bottom margin, not on top of the text it sits under.
          y: MARGIN.bottom - 24,
          size: 9,
          font: fonts.sans,
          color: rgb(0.45, 0.45, 0.45),
        });
      }
    },
    newPage,
    save: async () => {
      resolveInternalLinks();
      buildOutline();
      await emojiFonts?.embed();
      return doc.save();
    },
  };
}

type Box = { x: number; y: number; width: number; height: number };

/** The wash: a translucent rectangle behind one run of text. A highlighter, not a fill — the words have to stay
 *  readable through it, which is the difference between marking a passage and covering it. */
function wash(page: PDFPage, box: Box, style: MarkStyle, rgb: (r: number, g: number, b: number) => RGB): void {
  const c = rgbOf(style.color);
  page.drawRectangle({
    x: box.x - 1,
    y: box.y - box.height * 0.22,
    width: box.width + 2,
    height: box.height * 1.15,
    color: rgb(c.r, c.g, c.b),
    opacity: 0.35,
  });
}

/**
 * The treatment: the line drawn over one run of text.
 *
 * Both channels are drawn, exactly as the reading surface draws them. Treatments are the channel that carries a
 * mark's meaning without color perception, so a PDF that flattened them to color would drop the accessible half
 * of a mark at the moment the document travels furthest from the person who made it.
 */
function treat(page: PDFPage, box: Box, style: MarkStyle, rgb: (r: number, g: number, b: number) => RGB): void {
  if (!style.treatment) return;
  const c = rgbOf(style.treatmentColor ?? style.color);
  const line = (dy: number, thickness: number): void =>
    page.drawLine({
      start: { x: box.x, y: box.y + dy },
      end: { x: box.x + box.width, y: box.y + dy },
      thickness,
      color: rgb(c.r, c.g, c.b),
    });
  if (style.treatment === 'underline') line(-2, 1);
  else if (style.treatment === 'double-underline') {
    line(-2, 0.8);
    line(-4.5, 0.8);
  } else if (style.treatment === 'strikethrough') line(box.height * 0.3, 1);
  else if (style.treatment === 'box') {
    page.drawRectangle({
      x: box.x - 2,
      y: box.y - box.height * 0.25,
      width: box.width + 4,
      height: box.height * 1.2,
      borderColor: rgb(c.r, c.g, c.b),
      borderWidth: 0.8,
      opacity: 0,
    });
  } else if (style.treatment === 'squiggle') {
    // Alternating segments rather than a path: at nine points nobody can tell a wave from a zigzag.
    for (let x = box.x; x < box.x + box.width; x += 4) {
      const mid = Math.min(x + 2, box.x + box.width);
      const end = Math.min(x + 4, box.x + box.width);
      page.drawLine({
        start: { x, y: box.y - 2 },
        end: { x: mid, y: box.y - 3.5 },
        thickness: 0.7,
        color: rgb(c.r, c.g, c.b),
      });
      page.drawLine({
        start: { x: mid, y: box.y - 3.5 },
        end: { x: end, y: box.y - 2 },
        thickness: 0.7,
        color: rgb(c.r, c.g, c.b),
      });
    }
  }
}
