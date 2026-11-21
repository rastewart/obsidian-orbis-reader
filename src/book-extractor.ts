import { App, normalizePath, TFile } from 'obsidian';
import { LEAD_IN_CHARS } from './book-chapters';
import { chapterNoteTitle } from './chapter-name';
import { ExportLinks, HeadingOrder, PieceNotes, singleNoteChapterHeadings } from './export-links';
import { t } from './i18n';
import { mobiPictureHref } from './kindle-resources';
import { isoToday } from './library/dates';
import { yamlString } from './library/record-note';
import { bookTextLine } from './markdown-line';
import { bookElement } from './reader/book-element';
import type { RawSection } from './reader/foliate-view';
import { createTurndownService, imageEmbed } from './turndown-rules';
import { isPictureOnly, namesOnlyTheBook } from './unlisted-sections';
import { sanitizeVaultName } from './vault-names';

export type { RawSection };

/** What `orbis_generated` says on the notes this file writes — the book's own text, not a record of the book. */
const GENERATED_BOOK_EXPORT = 'book-export';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

/** The extension for a picture's type, or `fallback`. Own keys only: a type of `constructor` is not a picture. */
const extensionFor = (type: string, fallback: string) => (Object.hasOwn(MIME_EXT, type) ? MIME_EXT[type] : fallback);

/** The export's link resolver, built the same way for a single note and a book folder. */
const exportLinksFor = (o: ExtractOptions, td: ReturnType<typeof createTurndownService>): ExportLinks =>
  new ExportLinks(
    o.sectionIndexForHref,
    o.deliver ? 'portable' : (o.imageFormat ?? 'wiki'),
    (html) => td.turndown(html),
    o.fragmentSectionIndex
  );

async function writeImage(app: App, fullPath: string, arrayBuffer: ArrayBuffer): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(normalizePath(fullPath));
  if (existing instanceof TFile) {
    await app.vault.modifyBinary(existing, arrayBuffer);
  } else {
    await app.vault.createBinary(fullPath, arrayBuffer);
  }
}

async function writeVaultFile(app: App, path: string, content: string): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(normalizePath(path));
  if (existing instanceof TFile) {
    await app.vault.process(existing, () => content);
  } else {
    await app.vault.create(normalizePath(path), content);
  }
}

// Fetches/decodes each <img> in doc, writes binary files to assetsFolder, and
// replaces the img src in-place so the serialized innerHTML has vault paths.
// hrefCache persists across sections so the same in-book image is only fetched once.
async function collectImages(
  doc: Document,
  assetsFolder: string,
  app: App,
  nextIdx: () => number,
  onDebug: (msg: string) => void,
  resolveHref: (href: string) => string,
  loadBookBlob: (href: string) => Promise<Blob>,
  hrefCache: Map<string, string>
): Promise<void> {
  // Cover pages commonly wrap the raster image in <svg><image href="..."/></svg>
  // for aspect-ratio scaling instead of a plain <img>. Swap each one for a plain
  // <img> up front so the rest of this function (and turndown's 'images' rule)
  // handles it exactly like any other image.
  for (const svgImage of Array.from(doc.querySelectorAll('svg image'))) {
    const href = svgImage.getAttribute('href') || svgImage.getAttribute('xlink:href');
    if (!href) continue;
    // Made in `doc`, the foliate-parsed section document, and detached (see bookElement).
    const replacement = bookElement(doc, 'img');
    replacement.setAttribute('src', href);
    (svgImage.closest('svg') ?? svgImage).replaceWith(replacement);
  }

  const imgs = Array.from(doc.querySelectorAll('img'));
  if (!imgs.length) return;

  type ImgTask = { img: HTMLImageElement; absHref: string | null; src: string };
  const tasks: ImgTask[] = imgs.map((img) => {
    // An old MOBI picture has no `src` until foliate lays its page out — see `kindle-resources`.
    const src = img.getAttribute('src') || mobiPictureHref(img) || '';
    return { img, absHref: src && !src.startsWith('data:') ? resolveHref(src) : null, src };
  });

  // Load unique in-book hrefs in parallel (skip already-cached)
  const uniqueHrefs = [
    ...new Set(tasks.map((t) => t.absHref).filter((h): h is string => h !== null && !hrefCache.has(h))),
  ];

  if (uniqueHrefs.length) onDebug(`images: loading ${uniqueHrefs.length} unique image(s) in parallel`);

  await Promise.all(
    uniqueHrefs.map(async (absHref) => {
      try {
        const blob = await loadBookBlob(absHref);
        const ext = extensionFor(blob.type, 'jpg');
        const arrayBuffer = await blob.arrayBuffer();
        const fullPath = `${assetsFolder}/img-${String(nextIdx()).padStart(3, '0')}.${ext}`;
        await writeImage(app, fullPath, arrayBuffer);
        hrefCache.set(absHref, fullPath);
        onDebug(`image saved: ${fullPath}`);
      } catch (e) {
        onDebug(`image error (${absHref}): ${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );

  // Apply cached paths; handle data URIs inline
  for (const { img, absHref, src } of tasks) {
    if (absHref !== null) {
      img.setAttribute('src', hrefCache.get(absHref) ?? '');
    } else if (src.startsWith('data:')) {
      try {
        const commaIdx = src.indexOf(',');
        const mime = src.slice(5, commaIdx).split(';')[0];
        const ext = extensionFor(mime, 'bin');
        const binary = atob(src.slice(commaIdx + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const fullPath = `${assetsFolder}/img-${String(nextIdx()).padStart(3, '0')}.${ext}`;
        await writeImage(app, fullPath, bytes.buffer);
        img.setAttribute('src', fullPath);
      } catch (e) {
        onDebug(`image error (data URI): ${e instanceof Error ? e.message : String(e)}`);
        img.setAttribute('src', '');
      }
    }
  }
}

// Fetches the book's cover (via options.getCoverBlob, the same foliate-js API
// used for library thumbnails) and writes it into assetsFolder. Returns an
// embed line to place near the top of the export, or null if there's no
// cover / images are disabled / the fetch fails.
async function writeCoverImage(
  app: App,
  assetsFolder: string,
  options: ExtractOptions,
  dbg: (msg: string) => void
): Promise<string | null> {
  if (!options.includeImages || !options.getCoverBlob) return null;
  try {
    const blob = await options.getCoverBlob();
    if (!blob) return null;
    const ext = extensionFor(blob.type, 'jpg');
    const fullPath = `${assetsFolder}/cover.${ext}`;
    await writeImage(app, fullPath, await blob.arrayBuffer());
    dbg(`cover image saved: ${fullPath}`);
    return imageEmbed(fullPath, options.imageFormat ?? 'wiki');
  } catch (e) {
    dbg(`cover image error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// Strips the first paragraph of content if it closely matches the chapter title.
// Only call for the first section of a chapter (ebooks commonly repeat the title as a styled <p>).
export function stripLeadingDuplicateTitle(content: string, chapterTitle: string): string {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normTitle = normalize(chapterTitle);
  const firstNonEmpty = content.split('\n').find((l) => l.trim());
  // A picture is never the title, whatever its path says: an export folder or a file named "cover" read as a cover
  // page's title, and the picture — all that page holds — was dropped with it.
  if (!firstNonEmpty || /^\s*!\[/.test(firstNonEmpty)) return content;
  const normFirst = normalize(firstNonEmpty);
  if (normFirst.length >= 4 && (normFirst.includes(normTitle) || normTitle.includes(normFirst))) {
    return content.slice(content.indexOf(firstNonEmpty) + firstNonEmpty.length).trim();
  }
  /**
   * **A heading broken over lines is one heading.** Gutenberg's daily readings write `[p11]<br/>First Day.` in the
   * heading, which Turndown ends with a hard break, so its first line alone — `[p11]` — matched nothing, and the
   * Day's note held only its own heading where a heading in the contents note belonged. Tried second, so a heading
   * that matches on its own line keeps the image after it.
   */
  const at = content.indexOf(firstNonEmpty);
  const block =
    /^#{1,6}[ \t]/.test(firstNonEmpty) && /( {2}|\\)$/.test(firstNonEmpty) ? content.slice(at).split(/\n\s*\n/)[0] : '';
  const normBlock = normalize(block);
  if (normBlock.length >= 4 && normBlock === normTitle) return content.slice(at + block.length).trim();
  return content;
}

/**
 * A chapter title as a filename. 80 characters, because these carry a `NNN - ` prefix and sit in a folder listing
 * where a runaway subtitle pushes everything else off the edge.
 *
 * The rules are shared with note names — see `sanitizeVaultName`, which is also where the leading-dot strip comes
 * from.
 */
export function sanitizeName(name: string): string {
  return sanitizeVaultName(name, { max: 80 });
}

export interface BookMeta {
  title: string;
  author: string;
  publisher: string;
  language: string;
  pubdate: string;
}

export interface TocAnchor {
  label: string;
  href: string; // may include anchor, e.g. "chapter01.xhtml#sec2"
}

export interface ExtractOptions {
  onProgress: (msg: string) => void;
  chapterForSection?: (sIdx: number) => string;
  // Unique-identity counterpart to chapterForSection — chapter labels repeat
  // across parts in many books, so grouping/selection must key on this, not label.
  hrefForSection?: (sIdx: number) => string;
  tocEntries?: TocAnchor[]; // flat ToC for anchor-aware per-chapter splitting
  /**
   * A contents href to a spine index, `-1` when it cannot be placed.
   *
   * **A whole href, fragment included** — not a basename, which is only an identity in an EPUB: MOBI, AZW3 and
   * FB2 number their sections, so a basename comparison matches nothing there. Named for what it takes so the next
   * caller does not hand it a file name.
   */
  sectionIndexForHref?: (href: string) => number;
  /**
   * The id a contents href points at inside its section, or null when it starts the section — its own `#fragment`
   * when absent. The reader's (`anchorOf`) also knows the element a Kindle `kindle:pos:` or MOBI `filepos:` entry
   * points at, so a chapter partway down such a file is cut where it starts.
   */
  anchorForHref?: (href: string) => string | null;
  /** Where a bare `#id` lands when the book's ids are book-wide — FB2's notes body; see `linkKey`. */
  fragmentSectionIndex?: (id: string) => number | undefined;
  onDebug?: (msg: string) => void;
  includeImages?: boolean;
  imageFormat?: 'wiki' | 'markdown';
  loadBookBlob?: (href: string) => Promise<Blob>;
  perChapter?: boolean;
  selectedChapterHrefs?: Set<string>; // keyed by href, not label; undefined = all chapters
  /** The book's own title, so `headingOf` can refuse a `<title>` that is only the packager's boilerplate. */
  bookTitle?: string;
  /** The book's vault path, for the `book` link each chapter note carries back to it. */
  bookPath?: string;
  /**
   * Hand the finished single note here instead of writing it to the vault — Export or Share. Its links are then
   * `portable` (see `LinkFormat`), and `book` names the book's file in plain text, since a link to a vault path means
   * nothing outside it. The caller turns images off: they are separate files, and this is one.
   */
  deliver?: (content: string) => Promise<void>;
  /**
   * Whether an unlisted section is the chapter before it continuing — the reader view's one answer, which the
   * dialog's list and the recording list use too (see `continuationSections`). Its text joins that chapter.
   */
  continuesSection?: (sectionIndex: number) => boolean;
  /** "Section 4", worded by the caller — this file holds no user-facing strings. See `unclaimedLabelFor`. */
  sectionLabel?: (n: number) => string;
  /**
   * What the export dialog decided to call this spine section, if it decided anything.
   *
   * **Consulted before this file works a name out for itself, because the dialog knows more.** A name derived here
   * independently — `headingOf` with the book title, without it, or a last resort of the EPUB's own file name — can
   * disagree with the dialog's, which applies the front-matter rule on top. A row reading *Front matter* would then
   * write a file called `index_split_000`: the packager's build artifact, which is exactly what
   * `unclaimedLabelFor`'s own comment says a chapter must not be named after.
   *
   * The list is the authority. It has rendered the section, read its heading and grouped the prelude, so what
   * it shows is the best answer available — and handing it down means the row you tick and the file you get carry
   * one name by construction rather than by two derivations happening to agree. Undefined for a section the dialog
   * has no opinion about, which falls through to the reasoning below.
   */
  labelForSection?: (sectionIndex: number) => string | undefined;
  getCoverBlob?: () => Promise<Blob | null>;
}

export type ExtractionCtx = {
  options: ExtractOptions;
  td: ReturnType<typeof createTurndownService>;
  assetsFolder: string;
  app: App;
  imgCounterRef: { value: number };
  hrefCache: Map<string, string>;
  dbg: (msg: string) => void;
  total: number;
  /** The book's links, recorded as sections are converted and filled in once every note exists. */
  links: ExportLinks;
};

export async function extractBook(
  sections: Array<{ id: string }>,
  meta: BookMeta,
  outputPath: string,
  options: ExtractOptions,
  app: App
): Promise<void> {
  if (options.perChapter) {
    return extractBookPerChapter(sections, meta, outputPath, options, app);
  }

  const td = createTurndownService(options.includeImages ?? false, options.imageFormat ?? 'wiki');
  const rawSections = sections as unknown as RawSection[];
  const today = isoToday();

  const outputDir = outputPath.includes('/') ? outputPath.split('/').slice(0, -1).join('/') : '';
  const baseName = (outputPath.split('/').pop() ?? outputPath).replace(/\.md$/i, '');
  const assetsFolder = outputDir ? `${outputDir}/${baseName}-assets` : `${baseName}-assets`;
  const imgCounterRef = { value: 0 };
  const hrefCache = new Map<string, string>();

  if (options.includeImages) {
    const existing = app.vault.getAbstractFileByPath(normalizePath(assetsFolder));
    if (!existing) await app.vault.createFolder(normalizePath(assetsFolder));
  }

  const dbg = options.onDebug ?? (() => undefined);
  dbg(`extract: sections=${rawSections.length}`);

  const ctx: ExtractionCtx = {
    options,
    td,
    assetsFolder,
    app,
    imgCounterRef,
    hrefCache,
    dbg,
    total: rawSections.length,
    links: exportLinksFor(options, td),
  };
  const coverEmbed = await writeCoverImage(app, assetsFolder, options, dbg);
  const frontmatter = bookFrontmatter(meta, today, options.bookPath, !!options.deliver);

  const parts: string[] = [frontmatter];
  if (coverEmbed) parts.push(coverEmbed);
  let extracted = 0;
  let lastChapter = '';
  // The chapter's own name, which decides when a new heading starts; `lastChapter` is the heading written for it.
  let lastTitle = '';
  // A lone image on the very first section is almost always the cover page
  // itself (often wrapped in <svg> for scaling, which collectImages also
  // picks up) — skip it here since coverEmbed above already covers it.
  const isImageOnly = (md: string) => /^!\[\[[^\]]+\]\]$|^!\[[^\]]*\]\([^)]+\)$/.test(md.trim());

  /**
   * **Chapter selection reaches this path.** The dialog offers the chapter list for a single note too, so this
   * honors `selectedChapterHrefs` rather than walking every section.
   *
   * The unit is a PIECE, not a section: `collectPerChapterContent` gathers exactly what each chapter holds,
   * splitting inside a file at ToC anchors where the contents page points partway down, and keeping what no
   * chapter claims. Joining those pieces is the single-note file. One splitter for both formats, so the two
   * cannot come to contain different text.
   */
  const { chapterMap, chapterOrder } = await collectPerChapterContent(rawSections, ctx);

  /**
   * **A whole-spine fallback, for a contents page nothing can place.** A Kindle `kindle:pos:` or MOBI `filepos:`
   * entry is placed through foliate; a contents page whose entries neither the index nor foliate can place leaves
   * the collector above with nothing — which would write a file holding only its frontmatter. Walking the spine directly is exactly the right
   * behavior when chapters cannot be identified: the whole
   * book, which is what the export dialog promises when it cannot offer a list.
   */
  // Which piece went where, for the links: one note, so a piece is known by the chapter heading it sits under.
  const notes = new PieceNotes();
  if (!chapterOrder.length) {
    for (let i = 0; i < rawSections.length; i++) {
      const section = rawSections[i];
      if (!section.createDocument) continue;
      options.onProgress(t('book_export_modal.progress_extracting_n_of_n', { n: i + 1, total: rawSections.length }));
      const doc = await extractDocumentAndImages(section, i, ctx);
      if (!doc) continue;
      const pieceKey = `\u0000spine:${i}`;
      ctx.links.index(doc, i, { initial: pieceKey });
      const md = ctx.td
        .turndown(doc.body.innerHTML)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      section.unload?.();
      if (!md) continue;
      if (i === 0 && coverEmbed && isImageOnly(md)) continue;
      const chapterTitle = options.chapterForSection?.(i) ?? '';
      if (chapterTitle && chapterTitle !== lastChapter) {
        parts.push(`# ${bookTextLine(chapterTitle)}`);
        lastChapter = chapterTitle;
      }
      parts.push(stripLeadingDuplicateTitle(md, chapterTitle));
      notes.place(pieceKey, { file: null, chapterHeading: lastChapter || undefined });
      extracted++;
    }
  }

  // The chapters that will be written, in order, so their headings can be decided knowing the whole note — see
  // `singleNoteChapterHeadings`. A divider has no text and writes nothing; a lone opening image is the cover.
  const listedHrefs = new Set((options.tocEntries ?? []).map((e) => e.href));
  const chapters: { href: string; title: string; md: string }[] = [];
  for (const href of chapterOrder) {
    const data = chapterMap.get(href);
    if (!data) continue;
    const md = data.parts.join('\n\n').trim();
    if (!md) {
      chapters.push({ href, title: '', md: '' });
      continue;
    }
    // A lone image in the opening piece is almost always the cover, which `coverEmbed` has already placed.
    if (!chapters.some((c) => c.md) && extracted === 0 && coverEmbed && isImageOnly(md)) continue;
    chapters.push({ href, title: data.title, md });
  }
  const written = chapters.filter((c) => c.md);
  const headings = singleNoteChapterHeadings(
    written.map((c) => ({ title: c.title, listed: listedHrefs.has(c.href), md: c.md }))
  );
  const headingOfChapter = new Map(written.map((c, i) => [c.href, headings[i]]));
  const order = new HeadingOrder();
  let firstOfName = false;
  for (const { href, title, md } of chapters) {
    if (!md) {
      notes.divider(href);
      continue;
    }
    if (title && title !== lastTitle) {
      lastChapter = headingOfChapter.get(href) ?? title;
      firstOfName = order.chapter(lastChapter);
      parts.push(`# ${bookTextLine(lastChapter)}`);
      lastTitle = title;
    }
    parts.push(md);
    order.text(md);
    notes.place(href, { file: null, chapterHeading: lastChapter || undefined, firstOfName });
    extracted++;
  }

  options.onProgress(t('book_export_modal.progress_writing_file', { n: extracted }));
  const joined = parts.join('\n\n');
  notes.text(null, joined);
  const content = notes.render(ctx.links, joined);
  if (options.deliver) return options.deliver(content);

  const existing = app.vault.getAbstractFileByPath(normalizePath(outputPath));
  if (existing instanceof TFile) {
    await app.vault.process(existing, () => content);
  } else {
    const parentPath = outputPath.includes('/') ? outputPath.split('/').slice(0, -1).join('/') : '';
    if (parentPath && !app.vault.getAbstractFileByPath(normalizePath(parentPath))) {
      await app.vault.createFolder(normalizePath(parentPath));
    }
    await app.vault.create(normalizePath(outputPath), content);
  }
}

export type ChapterData = { title: string; parts: string[]; isFirstSection: boolean };

async function extractDocumentAndImages(
  section: RawSection,
  index: number,
  ctx: ExtractionCtx
): Promise<Document | null> {
  if (!section.createDocument) return null;
  try {
    const doc = await section.createDocument();
    // Before images, which rewrite `src` but not `href`, and before Turndown, which reads the marks.
    ctx.links.mark(doc, index, section.resolveHref);
    if (ctx.options.includeImages && ctx.options.loadBookBlob) {
      const resolveHref = section.resolveHref ?? ((h: string) => h);
      await collectImages(
        doc,
        ctx.assetsFolder,
        ctx.app,
        () => ++ctx.imgCounterRef.value,
        ctx.dbg,
        resolveHref,
        ctx.options.loadBookBlob,
        ctx.hrefCache
      );
    }
    return doc;
  } catch {
    return null;
  }
}

/**
 * The identity of content a section holds that no ToC entry claims.
 *
 * A sentinel rather than a derived href, so it can never collide with a real one — the same trick the EPUB
 * dialog's `CUSTOM_ORDER` uses. `\u0000` cannot appear in a path.
 */
function unclaimedHref(file: string): string {
  return `\u0000unclaimed:${file}`;
}

/**
 * A section's own heading, or its document title — what the BOOK calls this, as opposed to what the file is
 * called. The export dialog reads the same two, in the same order, so a row and the file it writes agree.
 *
 * Only ever used for a section the contents page does NOT name; a listed chapter takes its contents label. That
 * is what makes the two rules below safe, since neither can reach a chapter title someone chose.
 *
 * **`<title>` is metadata, and usually the packager's.** Every section but one of a Project Gutenberg novel carries
 * `<title><Title> | Project Gutenberg</title>` — the book's name and the publisher's, saying nothing about the section
 * and identical across all of them. So a document title that is, or starts with, the book's own title is refused: a
 * number is more honest than a name that is the same for everything. `bookTitle` is optional so a caller with nothing
 * to compare against still gets a heading.
 */
export function headingOf(doc: Document, bookTitle = '', sectionIndex?: number): string {
  const heading = tidyHeading(doc.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? '');
  if (heading) return heading;
  const title = tidyHeading(doc.title ?? '');
  // A book's first page holding only a picture is its cover — see `isPictureOnly`.
  if (!title) return sectionIndex === 0 && isPictureOnly(doc) ? t('book_export_modal.cover') : '';
  const book = bookTitle.trim().toLowerCase();
  return book && title.toLowerCase().startsWith(book) ? '' : title;
}

/**
 * Collapse the whitespace, and **unwrap a matched pair of quotes around the whole string**.
 *
 * Not a rule about punctuation — `"Hello," he said` keeps every mark it has, because it is not wrapped. This
 * undoes a wrapper, and it earns its place because the file being written has already lost it: `sanitizeName`
 * strips `"`, so a cover page whose `<title>` reads `"Cover"` would be listed as `"Cover"` and saved as `Cover.md`.
 * The row is the promise and the file is the delivery; they should say the same thing.
 */
function tidyHeading(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  const wrapped = /^(["'\u201c\u2018])(.*)(["'\u201d\u2019])$/s.exec(text);
  return wrapped ? wrapped[2].trim() : text;
}

/**
 * How a section is named in a selection — the same rule the export dialog uses, so a tick matches a piece.
 *
 * An id is a path in an EPUB and a bare number in MOBI, AZW3 and FB2, so a number is prefixed rather than used
 * raw: `0` is a plausible file name and `section:0` is not, which keeps a section key from colliding with a
 * contents href.
 */
export function sectionKeyOf(section: { id?: unknown } | undefined, index: number): string {
  const id = section?.id;
  return typeof id === 'string' && id ? id : `section:${index}`;
}

/**
 * Last resort when a section offers no heading at all: **"Section N", by its place in the book** — the words the
 * export dialog shows for the same row, so the row you tick and the note you get carry one name.
 *
 * **Never the file's name.** That belongs to whoever packaged the book — Calibre's `part0037`, Gutenberg's `wrap0000`,
 * this code's own `section:N` for a format that numbers its sections — and a note called after it names nothing.
 */
export function unclaimedLabelFor(index: number, sectionLabel?: (n: number) => string): string {
  return sectionLabel ? sectionLabel(index + 1) : `Section ${index + 1}`;
}

/** One piece of a section's markdown: a ToC chapter, or content no ToC entry claims. */
export interface SectionPiece {
  /** The chapter's href, or `null` for content the contents page does not mention. */
  href: string | null;
  label: string;
  md: string;
}

/**
 * Cut one section's converted markdown into its ToC chapters, plus whatever no chapter claims.
 *
 * **The unclaimed piece is why this is its own function.** When a file's FIRST ToC entry is anchored — the
 * contents page points partway down rather than at the top — everything above that anchor is sliced by nothing
 * and would be silently dropped. It is not the tail of the previous chapter (that lives in a different file, so
 * appending it there means deselecting one chapter puts a hole in the top of another) and it is not the head of
 * the next one (a chapter starts at its heading). It belongs to no chapter, so it is returned as a piece with no
 * href and the export lists it separately, where it can be kept or unticked like anything else.
 *
 * Pure, and separated from the DOM work above it, because the arithmetic is the part worth testing: the markers are
 * injected into a `Document` and this only reads where they landed in the text.
 *
 * `injected` names the chunks whose anchor actually resolved to an element. A chunk whose anchor the ToC declared
 * but the document does not contain has no marker, so it cannot be located — chunk 0 falls back to "everything up
 * to the first marker", and a later one is dropped.
 */
export function splitSectionMarkdown(opts: {
  fullMd: string;
  /** The marker token, without its index suffix. */
  split: string;
  chunks: readonly { label: string; href: string }[];
  injected: ReadonlySet<number>;
  /** What to call the unclaimed piece — the file's own name, since nothing else names it. */
  unclaimedLabel: string;
}): SectionPiece[] {
  const { fullMd, chunks, injected } = opts;
  const escaped = opts.split.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markerRe = new RegExp(`${escaped}(\\d+)`, 'g');
  const positions: { j: number; tokenStart: number; afterToken: number }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = markerRe.exec(fullMd)) !== null) {
    positions.push({ j: parseInt(mm[1]), tokenStart: mm.index, afterToken: mm.index + mm[0].length });
  }

  const tidy = (text: string): string => text.replace(/\n{3,}/g, '\n\n').trim();
  const pieces: SectionPiece[] = [];

  /**
   * Content above the first marker, when the first chunk claimed it. Emitted FIRST, so the pieces come back in
   * document order and a caller joining them writes the file the way it reads.
   */
  if (positions.length > 0 && injected.has(0)) {
    const lead = tidy(fullMd.slice(0, positions[0].tokenStart));
    if (lead) pieces.push({ href: null, label: opts.unclaimedLabel, md: lead });
  }

  for (let j = 0; j < chunks.length; j++) {
    const pIdx = positions.findIndex((p) => p.j === j);
    let md: string;
    if (pIdx >= 0) {
      // Anchored chunk: from after its marker to the start of the next one.
      const end = pIdx + 1 < positions.length ? positions[pIdx + 1].tokenStart : fullMd.length;
      md = tidy(fullMd.slice(positions[pIdx].afterToken, end));
    } else if (j === 0 && !injected.has(0)) {
      // First chunk with no anchor: it owns everything up to the first marker.
      md = tidy(fullMd.slice(0, positions.length > 0 ? positions[0].tokenStart : fullMd.length));
    } else {
      continue; // anchor declared in the ToC but not found in the section
    }
    if (md) pieces.push({ href: chunks[j].href, label: chunks[j].label, md });
  }

  return pieces;
}

/**
 * One whole section, as its own chapter — for a section the contents page does not mention.
 *
 * Shared by both collectors because both meet the case and must agree about it: skipping such sections would make a
 * ticked "Cover" row write nothing at all.
 *
 * **Named by `headingOf`, never by its file.** The file name is the packager's — Gutenberg writes `wrap0000` —
 * and the export dialog reads the same heading for its row, so the tick and the file carry one name.
 */
async function collectWholeSection(
  section: RawSection,
  index: number,
  key: string,
  ctx: ExtractionCtx,
  chapterMap: Map<string, ChapterData>,
  chapterOrder: string[]
): Promise<'kept' | 'left-out' | 'empty'> {
  if (ctx.options.selectedChapterHrefs && !ctx.options.selectedChapterHrefs.has(key)) return 'left-out';
  ctx.options.onProgress(t('book_export_modal.progress_extracting_n', { n: index + 1 }));
  const doc = await extractDocumentAndImages(section, index, ctx);
  if (!doc) return 'empty';
  ctx.links.index(doc, index, { initial: key });
  const cleaned = ctx.td
    .turndown(doc.body.innerHTML)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const title =
    ctx.options.labelForSection?.(index) ||
    headingOf(doc, ctx.options.bookTitle, index) ||
    unclaimedLabelFor(index, ctx.options.sectionLabel);
  section.unload?.();
  if (!cleaned) return 'empty';

  if (!chapterMap.has(key)) {
    chapterMap.set(key, { title, parts: [], isFirstSection: true });
    chapterOrder.push(key);
  }
  const data = chapterMap.get(key)!;
  let content = cleaned;
  if (data.isFirstSection) {
    data.isFirstSection = false;
    content = stripLeadingDuplicateTitle(cleaned, title);
  }
  if (content) data.parts.push(content);
  return 'kept';
}

/**
 * A section that continues the chapter before it — see `ExtractOptions.continuesSection`. Its text is appended to
 * that chapter.
 *
 * **Only a heading that repeats the chapter's name, or only the book's, is dropped** — the very line that made it a
 * continuation. A technical book opens each chapter in such a file under the chapter's own heading, and keeping it
 * would write the name twice: a second `# 1. First Steps` beside Orbis's in a single note, which makes every link to
 * the chapter a repeat and leaves it as text. Nothing looser than that: a continuation opens partway through, so a
 * first line of prose is the chapter's text, and `stripLeadingDuplicateTitle`'s near-match would eat it.
 */
async function collectContinuation(
  section: RawSection,
  index: number,
  key: string,
  ctx: ExtractionCtx,
  chapterMap: Map<string, ChapterData>
): Promise<void> {
  const data = chapterMap.get(key);
  if (!data) return;
  ctx.options.onProgress(t('book_export_modal.progress_extracting_n', { n: index + 1 }));
  const doc = await extractDocumentAndImages(section, index, ctx);
  if (!doc) return;
  ctx.links.index(doc, index, { initial: key, continuing: true });
  const md = ctx.td
    .turndown(doc.body.innerHTML)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  section.unload?.();
  const first = /^#{1,6}[ \t]+(.+?)[ \t]*(?:\n|$)/.exec(md);
  // Whitespace normalized, as `continuationSections` does: a technical book writes "1.&nbsp;First Steps" in its
  // heading and an ordinary space in its contents, so a plain comparison would let the rule call it a continuation
  // and this miss it.
  const same = (a: string, b: string): boolean =>
    a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
  const title = first?.[1] ?? '';
  const repeat = !!first && (same(title, data.title) || namesOnlyTheBook(title, ctx.options.bookTitle ?? ''));
  const text = repeat ? md.slice(first[0].length).trim() : md;
  if (text) data.parts.push(text);
}

export async function collectByTocAnchors(
  rawSections: RawSection[],
  ctx: ExtractionCtx,
  chapterMap: Map<string, ChapterData>,
  chapterOrder: string[]
): Promise<void> {
  const { tocEntries, sectionIndexForHref } = ctx.options;
  if (!tocEntries || !sectionIndexForHref) return;
  const hrefAnchor = ctx.options.anchorForHref ?? ((h: string) => (h.includes('#') ? h.split('#')[1] : null));

  /**
   * Contents entries grouped by the spine section that holds them, then each section's HTML split at the anchor
   * boundaries the contents page declares.
   *
   * **Grouped by resolved INDEX, not by file name.** A section id is a path only in an EPUB — MOBI, AZW3 and FB2
   * number theirs — so comparing a contents basename against a number would match nothing on three formats out
   * of four. `sectionIndexForHref` is the caller's resolver and takes a whole href.
   */
  type SectionChunk = { label: string; href: string; anchor: string | null };
  const chunksBySection = new Map<number, SectionChunk[]>();
  for (const entry of tocEntries) {
    const sIdx = sectionIndexForHref(entry.href);
    if (sIdx < 0) continue; // a contents entry this format cannot place — see `hrefToSectionIndex`
    if (!chunksBySection.has(sIdx)) chunksBySection.set(sIdx, []);
    chunksBySection.get(sIdx)!.push({ label: entry.label, href: entry.href, anchor: hrefAnchor(entry.href) });
  }

  /**
   * **The SPINE is walked, not the contents page.**
   *
   * Iterating only the sections a contents entry resolves to would never open a section nothing points at — a
   * cover, a title page — and since an EPUB takes this path, the export dialog would offer a ticked "Cover" row
   * that produces no file. Walking the spine also puts front matter where it belongs, at the top, rather than
   * wherever the contents page happens to mention it first.
   */
  /**
   * The chapter the last section's text went into, or null when that section was left out — which is where a
   * continuation's text goes, or whether it goes at all: it follows its chapter's tick rather than having its own.
   */
  let lastKey: string | null = null;
  /**
   * Whether the last piece, ticked or not, was a contents entry anchored partway down its file — the only kind a
   * lead-in can continue. Kept apart from `lastKey`, which is null for an unticked one: its lead-in goes with it.
   */
  let lastAnchored = false;
  for (let sIdx = 0; sIdx < rawSections.length; sIdx++) {
    const section = rawSections[sIdx];
    if (!section?.createDocument) continue;
    const file = sectionKeyOf(section as unknown as { id?: unknown }, sIdx);
    const chunks = chunksBySection.get(sIdx);

    // The chapter before it, continuing — see `ExtractOptions.continuesSection`.
    if (!chunks && ctx.options.continuesSection?.(sIdx)) {
      if (lastKey) await collectContinuation(section, sIdx, lastKey, ctx, chapterMap);
      continue;
    }

    // A section the contents page says nothing about: taken whole, under its own name and its own key.
    if (!chunks) {
      const outcome = await collectWholeSection(section, sIdx, file, ctx, chapterMap, chapterOrder);
      // An empty section changes nothing: the text after it still continues whatever came before it.
      if (outcome !== 'empty') {
        lastKey = outcome === 'kept' ? file : null;
        lastAnchored = false;
      }
      continue;
    }

    // A file none of whose chapters is ticked is skipped — unless its lead-in may be the ticked chapter before it,
    // continuing, which only opening it can tell.
    const sel = ctx.options.selectedChapterHrefs;
    const anyTicked = !sel || chunks.some((c) => sel.has(c.href));
    if (!anyTicked && !(lastKey && lastAnchored)) {
      lastKey = null;
      lastAnchored = hrefAnchor(chunks[chunks.length - 1].href) !== null;
      continue;
    }

    ctx.options.onProgress(t('book_export_modal.progress_extracting_file', { file }));
    let doc: Document;
    const maybeDoc = await extractDocumentAndImages(section, sIdx, ctx);
    if (!maybeDoc) continue;
    doc = maybeDoc;

    // Inject split markers into the DOM and convert the whole section in ONE
    // Turndown call, then slice the resulting markdown by marker positions.
    // This is much faster than calling turndown() once per chapter chunk.
    const SPLIT = `ZZORBISSPLIT${Date.now().toString(36).toUpperCase()}X`;
    const injectedJ = new Set<number>();
    const pieceAtMarker = new Map<Element, string>();
    for (let j = 0; j < chunks.length; j++) {
      const anchor = chunks[j].anchor;
      if (!anchor) continue;
      const el = doc.getElementById(anchor) ?? doc.querySelector(`[name="${CSS.escape(anchor)}"]`);
      if (!el) continue;
      // Made in the parsed `doc` (see bookElement).
      const span = bookElement(doc, 'span');
      span.textContent = `${SPLIT}${j}`;
      /**
       * **An anchor on `<body>` — or on anything holding it — is the start of the file.** Calibre writes every
       * chapter as `<body id="…">`, and inserting the marker BEFORE that element would put it outside the body,
       * where the Markdown never sees it; the chapter's text would then be dropped as an anchor that could not be
       * located.
       */
      const body = doc.body;
      if (body && (el === body || el.contains(body))) body.insertBefore(span, body.firstChild);
      else el.parentNode?.insertBefore(span, el);
      injectedJ.add(j);
      pieceAtMarker.set(span, chunks[j].href);
    }
    const fullMd = ctx.td.turndown(doc.body.innerHTML).replace(/\n{3,}/g, '\n\n');
    /**
     * **Text above the file's first anchor — the lead-in — goes where its words belong.** Three answers:
     *
     * - **The chapter before it, continuing**, when it is prose with no heading of its own and that chapter was
     *   anchored partway down its own file. A flow split can land mid-chapter: a heading ends one file and the
     *   chapter's prose opens the next. Named for the file's first heading, it was filed under the NEXT chapter's name
     *   — a note called "PART II" holding CHAPTER III, and CHAPTER III left an empty heading in the contents note.
     *   Listen's two conditions (`splitLeadIns`): the chapter before was anchored, since one that owns a whole file
     *   cannot be sitting in the next, and the text is longer than `LEAD_IN_CHARS`, since a running header is not a
     *   chapter.
     * - **A piece of its own**, when it opens with a heading of its own: named by the book, as a named unlisted file
     *   is — Project Gutenberg's boilerplate header above the title page.
     * - **The opening of the file's first chapter** otherwise — a running header, or a closing line such as "END OF
     *   THE EBOOK" above the license. As its own piece it took the name of the heading after it, and the license came
     *   out as two notes with one name. Listen reads it as the start of that chapter too.
     *
     * Save as PDF answers the same way (`leadInGoesTo`, book-blocks.ts).
     */
    const firstAt = fullMd.indexOf(SPLIT);
    const lead = injectedJ.has(0) && firstAt > 0 ? fullMd.slice(0, firstAt).trim() : '';
    const leadNamed = /^#{1,6}[ \t]/m.test(lead);
    const leadContinues = !!lead && !leadNamed && lastAnchored && lead.replace(/\s+/g, ' ').length > LEAD_IN_CHARS;

    /**
     * What to call a lead-in that is a piece of its own. **Its own heading**, read before the document is released —
     * Project Gutenberg's boilerplate header carries `<h2>The Project Gutenberg eBook of …</h2>`, where the file is
     * called something like `…_NNNN-h-0.htm` and naming a note that reads as a leak.
     *
     * `headingOf` is given no book title here: the heading above the first chapter of a file is very often the
     * book's own name, and refusing it would leave the file name as the only answer, which is the worse one.
     */
    const leadLabel =
      ctx.options.labelForSection?.(sIdx) ||
      headingOf(doc, '', sIdx) ||
      unclaimedLabelFor(sIdx, ctx.options.sectionLabel);
    let pieces = splitSectionMarkdown({
      fullMd,
      split: SPLIT,
      chunks,
      injected: injectedJ,
      unclaimedLabel: leadLabel,
    });
    const leadOpensNext = pieces[0]?.href === null && !leadContinues && !leadNamed && pieces.length > 1;
    if (leadOpensNext) pieces = [{ ...pieces[1], md: `${pieces[0].md}\n\n${pieces[1].md}` }, ...pieces.slice(2)];

    // The same cut, for the links: what the lead-in went into is where an id in it lands.
    ctx.links.index(doc, sIdx, {
      initial:
        leadContinues && lastKey
          ? lastKey
          : leadOpensNext && pieces[0].href
            ? pieces[0].href
            : injectedJ.has(0)
              ? unclaimedHref(file)
              : chunks[0].href,
      continuing: leadContinues,
      boundary: (el) => pieceAtMarker.get(el) ?? null,
    });
    section.unload?.();

    for (const piece of pieces) {
      /**
       * **A lead-in of its own is kept while any chapter of its file is ticked**, and it is the one thing on this
       * screen the reader cannot tick off individually: the dialog builds its list before anything is rendered, and
       * whether a file has content above its first anchor is only knowable once it HAS been rendered.
       */
      // The chapter before it, continuing: its text, under its tick — `lastKey` is null when that one is unticked.
      if (piece.href === null && leadContinues) {
        if (lastKey) chapterMap.get(lastKey)?.parts.push(piece.md);
        continue;
      }
      const key = piece.href ?? unclaimedHref(file);
      if (piece.href !== null ? sel && !sel.has(key) : !anyTicked) {
        lastKey = null;
        lastAnchored = piece.href !== null && hrefAnchor(piece.href) !== null;
        continue;
      }
      lastKey = key;
      lastAnchored = piece.href !== null && hrefAnchor(piece.href) !== null;

      if (!chapterMap.has(key)) {
        chapterMap.set(key, { title: piece.label, parts: [], isFirstSection: true });
        chapterOrder.push(key);
      }
      const data = chapterMap.get(key)!;
      let content = piece.md;
      if (data.isFirstSection) {
        data.isFirstSection = false;
        content = stripLeadingDuplicateTitle(piece.md, piece.label);
      }
      if (content) data.parts.push(content);
    }
  }
}

export async function collectBySectionFallback(
  rawSections: RawSection[],
  ctx: ExtractionCtx,
  chapterMap: Map<string, ChapterData>,
  chapterOrder: string[]
): Promise<void> {
  for (let i = 0; i < rawSections.length; i++) {
    const section = rawSections[i];
    if (!section.createDocument) continue;
    /**
     * **A section the contents page does not mention is still part of the book.** Skipping it on an empty title
     * would make a cover page, a copyright page or an afterword vanish from a book-folder export while a single-note
     * export of the same book keeps it — two formats quietly containing different text, with nothing saying so.
     * It keeps its own identity (the section's href) and its own row in the dialog, so it can be unticked like
     * anything else rather than being decided for you.
     */
    const tocTitle = ctx.options.chapterForSection?.(i) ?? '';
    const sectionId = sectionKeyOf(section as unknown as { id?: unknown }, i);
    // hrefForSection disambiguates chapters that share a label across parts;
    // fall back to the label itself if a caller doesn't supply it.
    const chapterHref = tocTitle ? (ctx.options.hrefForSection?.(i) ?? tocTitle) : sectionId;
    if (ctx.options.selectedChapterHrefs && !ctx.options.selectedChapterHrefs.has(chapterHref)) continue;

    ctx.options.onProgress(t('book_export_modal.progress_extracting_n_of_n', { n: i + 1, total: ctx.total }));
    const doc = await extractDocumentAndImages(section, i, ctx);
    if (!doc) continue;
    ctx.links.index(doc, i, { initial: chapterHref });
    const cleaned = ctx.td
      .turndown(doc.body.innerHTML)
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    /**
     * **An unlisted section is named by its own heading, never by its file.** The file name belongs to whoever
     * packaged the EPUB — Project Gutenberg writes `wrap0000`, `wrap0001` — so using it names a chapter file
     * after a build artifact. Read after the render because that is when there is a document to ask; the export
     * dialog reads the same heading, so the row you ticked and the file you get carry one name.
     */
    const chapterTitle =
      tocTitle ||
      ctx.options.labelForSection?.(i) ||
      headingOf(doc, ctx.options.bookTitle, i) ||
      unclaimedLabelFor(i, ctx.options.sectionLabel);
    section.unload?.();
    if (!cleaned) continue;

    if (!chapterMap.has(chapterHref)) {
      chapterMap.set(chapterHref, { title: chapterTitle, parts: [], isFirstSection: true });
      chapterOrder.push(chapterHref);
    }
    const chapterData = chapterMap.get(chapterHref)!;
    let sectionContent = cleaned;
    if (chapterData.isFirstSection) {
      chapterData.isFirstSection = false;
      sectionContent = stripLeadingDuplicateTitle(cleaned, chapterTitle);
    }
    if (sectionContent) chapterData.parts.push(sectionContent);
  }
}

async function collectPerChapterContent(
  rawSections: RawSection[],
  ctx: ExtractionCtx
): Promise<{ chapterMap: Map<string, ChapterData>; chapterOrder: string[] }> {
  const chapterMap = new Map<string, ChapterData>();
  const chapterOrder: string[] = [];
  const { tocEntries, sectionIndexForHref } = ctx.options;

  if (tocEntries?.length && sectionIndexForHref) {
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);
  } else {
    await collectBySectionFallback(rawSections, ctx, chapterMap, chapterOrder);
  }

  return { chapterMap, chapterOrder };
}

async function writePerChapterFile(
  app: App,
  baseFolder: string,
  meta: BookMeta,
  today: string,
  title: string,
  filename: string,
  content: string,
  prev: string,
  next: string,
  bookPath: string | undefined
): Promise<void> {
  const fm = chapterFrontmatter(meta, today, title, prev, next, bookPath);
  await writeVaultFile(app, `${baseFolder}/${filename}.md`, fm + '\n' + content);
}

/**
 * The frontmatter on one chapter note of a Save as Markdown export.
 *
 * Pulled out of the writer so it can be tested: the writer goes straight to the vault, and a test of
 * `chapterNoteTitle` alone proves the rule without proving this note uses it — and this note is the layer where a
 * chapter titled with only the book's own name would go wrong.
 */
/**
 * The same pair a reading record carries, on every note this file writes: `book` to open the book, `book_title` for
 * a Base to group on. A chapter note's title joins book and chapter, so it cannot be grouped on, and a Base grouping by
 * `book_title` should find the contents note and a single-note export beside the chapters.
 */
/**
 * The frontmatter of a note that stands for the whole book: the single-note export, and the contents note of a
 * chapter set. `plain` names the book rather than linking it, for a note delivered outside the vault.
 */
export function bookFrontmatter(meta: BookMeta, today: string, bookPath: string | undefined, plain = false): string {
  return [
    '---',
    // Says what this note IS, so the Library does not have to infer it from the fields below. A note holding a
    // book's text carries the book's title, and a catalog that took that at face value would list the chapters of
    // every export as if they were books.
    `orbis_generated: "${GENERATED_BOOK_EXPORT}"`,
    `title: ${yamlString(meta.title)}`,
    `author: ${yamlString(meta.author)}`,
    ...bookIdentity(meta, bookPath, plain),
    `publisher: ${yamlString(meta.publisher)}`,
    `language: ${yamlString(meta.language)}`,
    `export_date: "${today}"`,
    '---',
    '',
  ].join('\n');
}

function bookIdentity(meta: BookMeta, bookPath: string | undefined, plain = false): string[] {
  // Outside the vault the book is named, not linked: its file name, as text.
  const book = bookPath ? (plain ? (bookPath.split('/').pop() ?? bookPath) : `[[${bookPath}]]`) : null;
  return [...(book ? [`book: ${yamlString(book)}`] : []), `book_title: ${yamlString(meta.title)}`];
}

export function chapterFrontmatter(
  meta: BookMeta,
  today: string,
  title: string,
  prev: string,
  next: string,
  bookPath?: string
): string {
  const mocFilename = `000 - ${sanitizeName(meta.title) || 'Table of Contents'}`;
  return [
    '---',
    `orbis_generated: "${GENERATED_BOOK_EXPORT}"`,
    // The book AND the chapter — see `chapterNoteTitle`. The chapter alone stays in `chapter:`, which is what the
    // folder converter names the section by when this set goes back to an EPUB (`frontmatterSectionTitle`).
    `title: ${yamlString(chapterNoteTitle(meta.title, title))}`,
    `author: ${yamlString(meta.author)}`,
    `chapter: ${yamlString(title)}`,
    ...bookIdentity(meta, bookPath),
    `prev: ${yamlString(prev ? `[[${prev}]]` : '')}`,
    `next: ${yamlString(next ? `[[${next}]]` : '')}`,
    `toc: ${yamlString(`[[${mocFilename}]]`)}`,
    `export_date: "${today}"`,
    '---',
    '',
  ].join('\n');
}

/** One line of the contents note's list: a divider the contents lists, one it does not, or a chapter note. */
export type ContentsItem = { heading: string } | { label: string } | { file: string };

/**
 * The contents note's list, in reading order.
 *
 * **A divider the book's contents list is a heading** above the notes it covers — `##`, since the note's own `#` is the
 * book — and several in a row read as one, joined with ` · `. **One the contents do not list is a bold line in its
 * place**, never a heading: a Markdown heading covers everything to the next one, and an unlisted page saying only
 * "NOTES", before one novel's glossary, became a heading over the two novels after it. The book never says what such a
 * page covers, so the note does not either.
 */
export function contentsNoteList(items: readonly ContentsItem[]): string {
  const lines: string[] = [];
  let heading = '';
  const flush = () => {
    if (heading) lines.push(`${lines.length ? '\n' : ''}## ${bookTextLine(heading)}\n`);
    heading = '';
  };
  for (const item of items) {
    if ('heading' in item) {
      heading = heading ? `${heading} · ${item.heading}` : item.heading;
      continue;
    }
    flush();
    lines.push('label' in item ? `- **${bookTextLine(item.label)}**` : `- [[${item.file}]]`);
  }
  flush();
  return lines.join('\n');
}

async function writeExtractionMoc(
  app: App,
  baseFolder: string,
  meta: BookMeta,
  today: string,
  items: readonly ContentsItem[],
  coverEmbed: string | null,
  bookPath: string | undefined
): Promise<void> {
  const fm = bookFrontmatter(meta, today, bookPath);
  const mocLinks = contentsNoteList(items);
  const mocTitle = sanitizeName(meta.title) || 'Table of Contents';
  const coverLine = coverEmbed ? `${coverEmbed}\n\n` : '';
  await writeVaultFile(
    app,
    `${baseFolder}/000 - ${mocTitle}.md`,
    fm + `# ${bookTextLine(meta.title)}\n\n${coverLine}${mocLinks}\n`
  );
}

async function extractBookPerChapter(
  sections: Array<{ id: string }>,
  meta: BookMeta,
  baseFolder: string,
  options: ExtractOptions,
  app: App
): Promise<void> {
  const td = createTurndownService(options.includeImages ?? false, options.imageFormat ?? 'wiki');
  const rawSections = sections as unknown as RawSection[];
  const today = isoToday();
  const assetsFolder = `${baseFolder}/assets`;
  const imgCounterRef = { value: 0 };
  const hrefCache = new Map<string, string>();
  const dbg = options.onDebug ?? (() => undefined);

  if (!app.vault.getAbstractFileByPath(normalizePath(baseFolder)))
    await app.vault.createFolder(normalizePath(baseFolder));
  if (options.includeImages && !app.vault.getAbstractFileByPath(normalizePath(assetsFolder))) {
    await app.vault.createFolder(normalizePath(assetsFolder));
  }

  dbg(`extract: sections=${rawSections.length} mode=per-chapter`);

  const ctx: ExtractionCtx = {
    options,
    td,
    assetsFolder,
    app,
    imgCounterRef,
    hrefCache,
    dbg,
    total: rawSections.length,
    links: exportLinksFor(options, td),
  };
  const { chapterMap, chapterOrder } = await collectPerChapterContent(rawSections, ctx);

  /**
   * **A divider gets no file — it becomes a heading in the contents note.**
   *
   * "PART I", "EPILOGUE" and the rest are contents entries whose entire content is their own title, which
   * `stripLeadingDuplicateTitle` removes as a duplicate of the `chapter:` frontmatter. Correct, and as files they
   * would be notes holding nothing but frontmatter.
   *
   * **Detected, not guessed.** A divider is a piece with no content once its own title is out — never a label
   * that happens to start with "PART", which is an inference that fails on the first book phrased differently.
   * A title page with a byline has content and stays a file of its own.
   *
   * Merging it into the following chapter moves no text, since there is none; what it decides is where the name
   * goes. It goes to the contents note — a heading when the book's contents list it, a bold line when they do not
   * (`contentsNoteList`) — so the book's shape is still visible and the prev/next chain skips a note nobody wants to
   * open.
   */
  const pieces = chapterOrder.map((href) => {
    const data = chapterMap.get(href);
    return { key: href, title: data?.title ?? href, content: (data?.parts ?? []).join('\n\n').trim() };
  });

  const chapterFiles: Array<{ title: string; filename: string; content: string }> = [];
  const contents: ContentsItem[] = [];
  const listed = new Set((options.tocEntries ?? []).map((e) => e.href));
  // Which note each piece went into, for the links — see `PieceNotes` for what a divider's link lands on.
  const notes = new PieceNotes();
  for (const piece of pieces) {
    if (!piece.content) {
      contents.push(listed.has(piece.key) ? { heading: piece.title } : { label: piece.title });
      notes.divider(piece.key);
      continue;
    }
    const filename = `${String(chapterFiles.length + 1).padStart(3, '0')} - ${sanitizeName(piece.title)}`;
    chapterFiles.push({ title: piece.title, filename, content: piece.content });
    contents.push({ file: filename });
    notes.place(piece.key, { file: filename });
    notes.text(filename, piece.content);
  }

  const numChapters = chapterFiles.length;
  for (let i = 0; i < chapterFiles.length; i++) {
    const { title, filename } = chapterFiles[i];
    const content = notes.render(ctx.links, chapterFiles[i].content);
    options.onProgress(t('book_export_modal.progress_writing_chapter', { n: i + 1, total: numChapters, title }));
    const prev = i > 0 ? chapterFiles[i - 1].filename : '';
    const next = i < numChapters - 1 ? chapterFiles[i + 1].filename : '';
    await writePerChapterFile(app, baseFolder, meta, today, title, filename, content, prev, next, options.bookPath);
  }

  options.onProgress(t('book_export_modal.progress_toc'));
  const coverEmbed = await writeCoverImage(app, assetsFolder, options, dbg);
  await writeExtractionMoc(app, baseFolder, meta, today, contents, coverEmbed, options.bookPath);
  options.onProgress(
    t(numChapters === 1 ? 'book_export_modal.progress_done_one' : 'book_export_modal.progress_done', {
      count: numChapters,
    })
  );
}
