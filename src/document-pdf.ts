// The whole marked-up document: the book's text, the marks drawn where they were made, and the notes as pins a
// PDF viewer opens on a click.
//
// The digest answers "what did you mark"; this answers "here is your document back with my comments", which is
// what someone reviewing a draft actually wants to receive. Everything below the block loop is shared with the
// digest — the page cursor, the wrapping, the mark drawing, the sticky notes — so this file is the part that is
// genuinely different: which blocks exist, and what each one looks like.
//
// See docs/design/marks-pdf.md §Phase two.

import type { BlockText, BookBlock } from './book-blocks';
import { t } from './i18n';
import { drawLegend, type LegendEntry } from './marks-pdf';
import type { EmojiPictures } from './pdf-emoji';
import type { FontBytes } from './pdf-fonts';
import { sanitizeForPdf } from './pdf-layout';
import { createPdfWriter, type FontName, isExternalHref, type MarkStyle, type TextSpan } from './pdf-writer';

/** One section of the book, in reading order. */
export interface DocumentSection {
  /** The chapter's name, printed as a heading when the section does not open with one of its own. */
  title: string;
  blocks: BookBlock[];
  /** Image bytes for this section's `image` blocks, keyed by the block's `src`. Loaded by the caller: reading
   *  them out of the EPUB needs the book, which this file deliberately does not have. */
  images?: ReadonlyMap<string, { bytes: Uint8Array; kind: 'png' | 'jpg' }>;
}

/** What an annotation looks like, and what it said. Keyed by annotation id, which is what a block's marks carry. */
export interface AnnotationStyle extends MarkStyle {
  note?: string;
  markName?: string;
}

export interface DocumentPdfMeta {
  title: string;
  author: string;
  attribution: string;
  date: string;
  /** Heading above the legend, passed in so this file holds no user-facing strings. */
  legendHeading: string;
  /** `page 4 of 312`, formatted by the caller for the same reason. */
  pageLabel: (page: number, total: number) => string;
}

/** Heading sizes by depth. A book's `h1` is usually its title, so the ladder is shallow — the difference between
 *  levels only has to be visible, not dramatic. */
const HEADING_SIZE = [17, 14, 12.5, 11.5, 11, 11];
const BODY = 11;

const STYLE: Record<BookBlock['kind'], { font: FontName; size: number; indent: number; before: number }> = {
  heading: { font: 'bold', size: HEADING_SIZE[0], indent: 0, before: 14 },
  paragraph: { font: 'body', size: BODY, indent: 0, before: 7 },
  'list-item': { font: 'body', size: BODY, indent: 18, before: 3 },
  quote: { font: 'italic', size: BODY, indent: 20, before: 7 },
  // Monospaced and a size down, because code lines are long and wrapping one is worse than shrinking it.
  code: { font: 'mono', size: 9, indent: 12, before: 8 },
  image: { font: 'sans', size: 9, indent: 0, before: 8 },
  // A size down, because a table has to fit its columns across the page width that prose gets for one column.
  table: { font: 'body', size: 9.5, indent: 0, before: 8 },
};

/**
 * Draw the book, with every mark where it was made.
 *
 * The marks arrive already resolved to character offsets by `book-blocks.ts`, so nothing here has to know what a
 * CFI is: a block is text plus a list of `{id, start, end}`, and this turns each id into an appearance and a note.
 */
export async function buildDocumentPdf(
  sections: readonly DocumentSection[],
  styles: ReadonlyMap<string, AnnotationStyle>,
  meta: DocumentPdfMeta,
  legend: readonly LegendEntry[] = [],
  coverSheet = true,
  fonts?: FontBytes,
  /** How far through the drawing this is, for a dialog that stays open while it runs. */
  onProgress?: (done: number, total: number) => void,
  /** Where an emoji's picture comes from — see pdf-emoji.ts. */
  pictures?: EmojiPictures
): Promise<Uint8Array> {
  // Who the comments are from. Empty when nobody typed a name, and the writer falls back to a neutral label
  // rather than to the mark — a comment attributed to "Follow up" is a comment attributed to nobody.
  const author = meta.attribution;
  const w = await createPdfWriter(fonts, pictures);
  w.doc.setTitle(sanitizeForPdf(meta.title));
  if (meta.author) w.doc.setAuthor(sanitizeForPdf(meta.author));
  w.doc.setCreator('Orbis Reader');

  /**
   * A cover sheet, **only when the document actually carries marks.**
   *
   * Its whole job is explaining what the marks mean; on an unmarked export there is nothing to explain, and a page
   * saying "marked up by" above a document nobody has marked is a page that is wrong as well as empty. Judged on
   * what is being EXPORTED rather than on what the book holds, so selecting only unmarked chapters drops it too.
   *
   * See the fuller note below on why it is a page rather than a header.
   *
   * What it is, whose reading it represents, and — the part that earns the page — **what the marks mean**. A
   * marked-up document that does not explain its own marks asks the recipient to infer meaning from color, which
   * they cannot do and which the treatments exist precisely to avoid relying on.
   *
   * Its own page rather than a header, because the book starts on the next one: a title, a byline and a legend
   * sitting above chapter one reads as part of chapter one.
   */
  const grey = { r: 0.35, g: 0.35, b: 0.35 };
  // Two independent reasons not to print one: the reader turned it off, or there is nothing for it to explain.
  const marked = coverSheet && sections.some((s) => s.blocks.some((b) => b.marks.length));
  if (marked) {
    w.space(60);
    w.text(meta.title, { font: 'bold', size: 24 });
    const byline = [
      meta.author,
      meta.attribution && t('marks_pdf.attribution_byline', { name: meta.attribution }),
      meta.date,
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (byline) {
      w.space(8);
      w.text(byline, { font: 'sans', size: 10, color: grey });
    }
    drawLegend(w, legend, meta.legendHeading);
    w.newPage();
  }

  /**
   * Every destination this export contains, gathered before anything is drawn.
   *
   * A link to a chapter the reader left out has nowhere to go, and drawing it tinted would promise a click that
   * does nothing. Knowing the whole set up front is what lets those print as ordinary text instead — the pages
   * they would point at are not knowable yet, but whether they EXIST is.
   */
  const targets = new Set<string>();
  for (const section of sections) {
    for (const block of section.blocks) for (const key of block.anchors ?? []) targets.add(key);
  }
  const drawable = (links: BookBlock['links']): BookBlock['links'] =>
    links.filter((l) => isExternalHref(l.href) || targets.has(l.href));

  let drawn = 0;
  for (const section of sections) {
    if (onProgress) {
      onProgress(drawn, sections.length);
      /**
       * **A frame for the reporter to be seen in.**
       *
       * Drawing is synchronous from here down — pdf-lib laying out pages — so a status written on every turn
       * of this loop reached the DOM and never reached the screen: the browser has no chance to paint until
       * the whole book is drawn. Reading a book yields naturally on each `createDocument`, which is why that
       * half animated and this half sat still and then vanished.
       *
       * Only when somebody is watching. A caller with no reporter gets the tight loop it had before.
       */
      // `window.` and not `activeWindow.`: this module is pure enough to run under vitest, where the Obsidian
      // global does not exist. Popout safety is the rule's point and `window` is the popout's own here anyway.
      await new Promise((r) => window.setTimeout(r, 0));
    }
    drawn++;
    /**
     * The section's outline entries, nested by the book's own heading ranks.
     *
     * **Not by position.** The first version treated whatever came first in a section as the chapter and everything
     * after it as a subsection, which is wrong for a common shape: a chapter file that also carries its part's
     * title has two `h2`s, `PART II` and `CHAPTER I`, and they are two chapters — not a chapter and its
     * subsection. So an entry's depth comes from its heading level, and equal ranks are siblings.
     *
     * Levels are relative to the FIRST entry in the section, which makes each section's opening entry a top-level
     * one whatever rank the book happens to start at, and stops one section's headings nesting under the previous
     * section's. The writer takes them from here and does the tree.
     *
     * The entry itself is recorded when the line is drawn rather than beforehand, so it points at the page the
     * heading actually landed on rather than at the one it was about to land on before a page break moved it.
     */
    let base: number | undefined;
    const entry = (title: string, rank: number): { title: string; level: number } => {
      base ??= rank;
      return { title, level: Math.max(0, rank - base) };
    };

    // The chapter's name, unless the section already opens with a heading — printing both is the book restarting.
    if (section.title && section.blocks[0]?.kind !== 'heading') {
      w.ensure(40);
      w.space(12);
      // Rank 0: a table-of-contents title stands above any heading the section itself contains.
      w.text(section.title, { font: 'bold', size: HEADING_SIZE[1], outline: entry(section.title, 0) });
    }
    for (const block of section.blocks) {
      const style = STYLE[block.kind];
      const size = block.kind === 'heading' ? HEADING_SIZE[(block.level ?? 1) - 1] : style.size;
      w.space(style.before);
      if (block.kind === 'table') {
        // Each cell resolves its own marks, which is what keeps a highlight in the cell it was made in.
        w.table(
          (block.rows ?? []).map((row) =>
            row.map((cell) => ({
              text: cell.text,
              header: cell.header,
              emphasis: cell.emphasis,
              links: drawable(cell.links),
              spans: spansFor(cell, styles, author),
            }))
          ),
          { size, anchors: block.anchors }
        );
        continue;
      }
      if (block.kind === 'image') {
        const image = section.images?.get(block.src ?? '');
        /**
         * **A link to a picture lands on it.** Its ids were counted as destinations, so a link to one was drawn
         * clickable — and, recorded only by text, went nowhere: a book's "back" link from its full-size plate to the
         * small one in the text. The picture takes them; without a picture, its caption does.
         */
        const drawn = image
          ? await w.image(image.bytes, image.kind, block.align, block.anchors, drawable(block.links)[0]?.href)
          : false;
        // The alt text prints either way: with the picture it is a caption, without it, it is what the picture
        // would have said. An image PDF cannot hold is not worth failing an export over.
        // The caption sits under the picture, so it follows the picture's alignment rather than having its own.
        if (block.text) {
          w.text(block.text, {
            font: 'sans',
            size: 9,
            color: grey,
            align: block.align,
            anchors: drawn ? undefined : block.anchors,
          });
        }
        continue;
      }
      w.text(block.text, {
        font: style.font,
        size,
        indent: style.indent,
        spans: spansFor(block, styles, author),
        // The document's own emphasis, independent of the reader's marks: both are spans over the same offsets,
        // and a sentence can be bold AND highlighted without either knowing about the other.
        emphasis: block.emphasis,
        // The book's own links: out to the web, or to another page of this same PDF.
        links: drawable(block.links),
        anchors: block.anchors,
        // Code keeps the indentation it was written with; everything else re-wraps and re-indents itself.
        preserveIndent: block.kind === 'code',
        prefix: block.kind === 'list-item' ? (block.marker ?? '•') : undefined,
        // Only the shallow headings: an h4 is a paragraph's label, and a sidebar listing every one of them is a
        // second table of contents rather than a way of finding a chapter.
        outline:
          block.kind === 'heading' && (block.level ?? 1) <= 3 && block.text
            ? entry(block.text, block.level ?? 1)
            : undefined,
      });
    }
  }

  // The cover sheet is not numbered; the body is, with a total, because "page 4 of 312" is how someone quotes a
  // passage back to you. With no cover sheet there is no page to skip.
  w.numberPages({ skipFirst: marked, label: meta.pageLabel });
  return w.save();
}

/** A run of text's marks, resolved into appearances and notes for the writer to draw. Takes a block or a cell. */
function spansFor(block: BlockText, styles: ReadonlyMap<string, AnnotationStyle>, author: string): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const mark of block.marks) {
    const style = styles.get(mark.id);
    if (!style) continue;
    spans.push({
      start: mark.start,
      end: mark.end,
      style,
      // The note travels with the FIRST span of its annotation; the writer places one pin per id however many
      // lines or blocks the mark covers.
      note: style.note ? { id: mark.id, body: style.note, author, subject: style.markName } : undefined,
    });
  }
  return spans;
}
