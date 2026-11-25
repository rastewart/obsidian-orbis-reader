// One Markdown note → one EPUB beside it. The I/O half; `epub-builder.ts` owns the packaging and stays pure.
//
// See docs/design/markdown-to-epub.md.

import {
  type App,
  Component,
  MarkdownRenderer,
  Notice,
  normalizePath,
  requestUrl,
  TFile,
  type TFolder,
} from 'obsidian';
import { sanitizeName } from './book-extractor';
import {
  buildEpub,
  type EpubFont,
  type EpubImage,
  type EpubMeta,
  type EpubSection,
  escapeXml,
  xhtmlDocument,
} from './epub-builder';
import { loadEpubFont } from './epub-font';
import {
  type BookNote,
  bookTitleOf,
  crossNoteResolver,
  findIndexNote,
  frontmatterSectionTitle,
  generatedTocMarkdown,
  isOrbisChapterSet,
  orderNotes,
  sectionTitleOf,
} from './folder-epub';
import { t } from './i18n';
import { resolveFrontmatterKey } from './i18n/index';
import { displayName } from './library/record';
import {
  anchorBlockIds,
  buildAnchorMap,
  domToXhtml,
  IMAGE_DIR,
  type NoteLinkResolver,
  type SectionNodes,
  splitAtHeadings,
  stableFootnoteIds,
  type XhtmlLosses,
} from './markdown-xhtml';
import { progressFilePathFor } from './progress';
import { buildDeepUrl } from './reader/export-format';
import { ensureVaultFolder } from './reader/record-move';
import { exportFileName } from './vault-names';

/** Everything the caller has to decide. The dialog fills these in; `epubDefaults` seeds them. */
export interface EpubConversion {
  /** Base name, no extension. `.epub` is appended, and illegal characters are stripped when the path is built. */
  fileName: string;
  /** Vault folder, `/` for the root. */
  folder: string;
  title: string;
  author: string;
  language: string;
  /** Heading level to cut sections at, or 0 for one section. The dialog picks it; the default is H2. */
  splitLevel: number;
  /**
   * Download images hosted elsewhere and package them.
   *
   * Off by default, because it turns a local operation into outbound requests to whatever hosts a note happens to
   * reference — they learn your IP and when you converted. Worth having for clipped articles, where the
   * illustrations are the point; pointless for notes you wrote yourself, which is why it is a setting rather than
   * a fixed behavior.
   */
  fetchRemoteImages: boolean;
  /** Written into the book as `dc:publisher`, and onto its title note. Optional — many notes have neither. */
  publisher: string;
  /** `dc:date` in the book, `publication_date` on its title note. */
  publicationDate: string;
  /**
   * The medium, for the title note the library writes: `book`, `blog post`, `whitepaper`.
   *
   * Not part of the EPUB — no `dc:` term means this — but asked here because this dialog is the only moment when
   * anyone knows what the result IS. Without it a converted book has no medium at all: nothing infers one from
   * provenance.
   */
  type: string;
  /**
   * The vault font the book is set in and carries, by family, or empty for none — see `epub-font.ts`. From the
   * settings' `epubFont`; the dialog may change it for one conversion.
   */
  font: string;
}

/**
 * Metadata defaults, read from the frontmatter [Book Export](book-export.md) writes.
 *
 * Reading those keys is what makes the two features compose: a book exported to Markdown and converted back keeps
 * its identity rather than acquiring a filename for a title.
 *
 * **`frontmatterKeyLanguage` decides whether those keys are English or native.** Ignoring it would find nothing on
 * a non-English vault and present every field as empty, which reads as "this note has no metadata" rather than "I
 * looked in the wrong place".
 */
export function epubDefaults(
  app: App,
  file: TFile,
  opts: {
    keyLang: string;
    sameFolderAsNote: boolean;
    folder: string;
    fetchRemoteImages: boolean;
    /** The type written onto a converted book's title note, from settings. */
    defaultType?: string;
    /** Preferred heading level, from settings. Resolved against the note's own headings by the dialog. */
    splitLevel?: number;
    /** The font to embed, from settings. */
    font?: string;
  }
): EpubConversion {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  const read = (canonical: string): string => frontmatterText(fm?.[resolveFrontmatterKey(canonical, opts.keyLang)]);
  return {
    // The note's own name, not its title: a title can be a whole sentence, and a filename is a filename.
    fileName: file.basename,
    folder: opts.sameFolderAsNote ? (file.parent?.path ?? '/') : opts.folder || '/',
    title: read('title') || file.basename,
    // Link syntax stripped: a vault that keeps a note per author writes `author: "[[John Roe]]"`, and a book
    // whose `dc:creator` is a pair of brackets cannot be found by author anywhere.
    author: displayName(read('author')),
    publisher: displayName(read('publisher')),
    // `published` too, which the Obsidian Web Clipper writes. A key read into a dialog the reader then looks at is
    // a guess they can correct before anything lands — which is why the converter may read keys the library never
    // would, and why no alias for it ships.
    publicationDate: read('publication_date') || frontmatterText(fm?.published),
    type: opts.defaultType || 'book',
    // Never the Obsidian locale: someone writing in a second language would silently get the wrong value.
    language: read('language') || 'en',
    // From settings, and a PREFERENCE rather than an instruction: the dialog resolves it against the headings this
    // note actually has, so a note of H3s opens on H3 rather than on an H2 it does not have. See `resolveSplitLevel`.
    splitLevel: opts.splitLevel ?? 2,
    // From settings, so a clipping workflow can have it on without toggling per note. The dialog still offers it,
    // and still only when a note actually has remote images.
    fetchRemoteImages: opts.fetchRemoteImages,
    font: opts.font ?? '',
  };
}

/**
 * The note's body, without its frontmatter block.
 *
 * Frontmatter is metadata — it becomes the book's title and author — so leaving it in the body prints it twice: once
 * as the book's identity and again as the opening page of text.
 *
 * Only a block at the very start counts. A `---` later in the document is a horizontal rule, and a note that opens
 * with one is not declaring frontmatter.
 */
export function stripFrontmatter(source: string): string {
  if (!source.startsWith('---')) return source;
  const end = source.indexOf('\n---', 3);
  if (end === -1) return source; // unterminated: not frontmatter, just a document starting with dashes
  const after = source.indexOf('\n', end + 1);
  return after === -1 ? '' : source.slice(after + 1);
}

/** Whether a link's note part names `path` itself — `[[Kitchen Sink#Notes]]` written inside Kitchen Sink. */
function linksToSelf(app: App, path: string): (linkpath: string) => boolean {
  return (linkpath) => {
    let name = linkpath;
    try {
      name = decodeURIComponent(linkpath); // a Markdown link's `003%20Trails.md`
    } catch {
      // not encoded after all: use it as written
    }
    return app.metadataCache.getFirstLinkpathDest(name, path)?.path === path;
  };
}

/** A note's text as the converter renders it: its block ids made anchors, its frontmatter removed. */
async function sourceForRender(app: App, file: TFile): Promise<string> {
  const source = await app.vault.read(file);
  return stripFrontmatter(anchorBlockIds(source, app.metadataCache.getFileCache(file)?.blocks));
}

/**
 * Where the EPUB will be written. Sanitized, because the name is typed by hand.
 *
 * A trailing `.epub` is dropped: the dialog shows the extension beside the field, but someone will type it anyway,
 * and `name.epub.epub` is not a thing anyone wants. Stripped HERE rather than in the field's setter — doing it as
 * the reader types would delete characters under them mid-word.
 */
export function epubTargetPath(conv: EpubConversion): string {
  const dir = conv.folder && conv.folder !== '/' ? `${conv.folder}/` : '';
  const base = exportFileName(conv.fileName.replace(/\.epub$/i, ''), 'book');
  return normalizePath(`${dir}${base}.epub`);
}

/** A note's frontmatter title as a section name — see `frontmatterSectionTitle` for why it is not just `title`. */
function sectionFrontmatterTitle(fm: Record<string, unknown> | undefined): string {
  return frontmatterSectionTitle({
    generated: frontmatterText(fm?.orbis_generated),
    title: frontmatterText(fm?.title),
    chapter: frontmatterText(fm?.chapter),
    bookTitle: frontmatterText(fm?.book_title),
  });
}

/**
 * A frontmatter value as plain text.
 *
 * **Frontmatter is not just strings**, and `author` is where that shows: Obsidian's list type gives an array, and a
 * web clipper writes each entry as a wikilink — `author:\n  - "[[Jane Doe]]"`. Accepting only
 * strings would leave the Author field empty on exactly the notes where it matters most.
 *
 * A list joins with a comma. EPUB does allow several `dc:creator` elements, but one editable field holding
 * "A, B" is a better trade than a repeating field for the rare multi-author case.
 */
export function frontmatterText(value: unknown): string {
  // `[[Name]]` and `[[Name|Display]]` both mean the person rather than the link; the alias wins when present.
  const flatten = (v: unknown): string =>
    typeof v === 'string'
      ? v.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => String(alias ?? target)).trim()
      : '';
  if (Array.isArray(value)) {
    return (value as unknown[]).map(flatten).filter(Boolean).join(', ');
  }
  return flatten(value);
}

/** `urn:uuid:…`. Generated per conversion and stored in the book, so two conversions are two distinct books. */
function newIdentifier(): string {
  return `urn:uuid:${crypto.randomUUID()}`;
}

/** `dcterms:modified` wants seconds precision and a literal `Z`. */
function isoSeconds(now: number): string {
  return `${new Date(now).toISOString().split('.')[0]}Z`;
}

/**
 * Whether the reader has saved content for this path already.
 *
 * The reason regeneration needs a warning is not the file — it is that Orbis keys annotations and progress to the
 * PATH, so the `.orbis` survives a rebuild while its CFIs point into the old text. Highlights can land in the wrong
 * place or stop resolving.
 */
export async function hasSavedContentFor(app: App, epubPath: string): Promise<boolean> {
  return (await savedAnnotationCount(app, epubPath)) > 0;
}

/**
 * How many annotations a book carries.
 *
 * **One reader of the file, two questions.** *Read in Orbis Reader* quotes the number — "That book has 12
 * annotations" — while the overwrite confirm only needs to know whether there are any, and two functions opening
 * the same `.orbis` are two chances to disagree about what counts as content. So the count is the definition and
 * the boolean is derived from it.
 *
 * `progressFilePathFor`, not a path built here: annotations live in `!orbis-data/`, not beside the book, and a
 * path built here would look in an empty place and answer "no annotations" for every book — so the overwrite
 * confirm would always show its plain wording, and the folder conversion would always count zero annotated books.
 */
export async function savedAnnotationCount(app: App, epubPath: string): Promise<number> {
  const orbis = normalizePath(progressFilePathFor(epubPath));
  if (!(await app.vault.adapter.exists(orbis))) return 0;
  try {
    const raw = JSON.parse(await app.vault.adapter.read(orbis)) as {
      highlights?: unknown[];
      notes?: unknown[];
      bookmarks?: unknown[];
    };
    return [raw.highlights, raw.notes, raw.bookmarks].reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
  } catch {
    return 0; // unreadable `.orbis` — nothing to warn about losing
  }
}

/**
 * Markdown → XHTML, via Obsidian's own renderer.
 *
 * `MarkdownRenderer` rather than a bundled CommonMark parser, because it is the only thing that understands what
 * people actually write in Obsidian — callouts, footnotes, tables, math. A parser would produce cleaner HTML and
 * silently lose all of it, which is the worst of the available outcomes.
 *
 * **Rendered into a detached element**, which has one consequence worth stating: a block a plugin renders (a
 * Dataview query, say) resolves to nothing, because the plugin never sees it attached. The returned `losses` count
 * those so the analysis screen can say so before someone makes a book out of it.
 *
 * The `Component` is unloaded in a `finally`: the renderer registers children on it, and leaking one leaks
 * everything it registered for as long as the plugin lives.
 */
async function renderNote(app: App, markdown: string, sourcePath: string): Promise<HTMLElement> {
  const host = createDiv();
  const component = new Component();
  try {
    await MarkdownRenderer.render(app, markdown, host, sourcePath, component);
    stableFootnoteIds(host);
    return host;
  } finally {
    // Unloaded even on success: the renderer registers children on it, and leaking one leaks everything it
    // registered for as long as the plugin lives. The DOM it produced outlives the component.
    component.unload();
  }
}

const sectionId = (i: number): string => `sect${i + 1}`;

/**
 * The media type of these bytes, or null if they are not an image at all.
 *
 * **Sniffed from the bytes, not taken from the URL or the `Content-Type` header** — both lie, and the URL lies in a
 * way that is easy to miss. A CDN transform URL ends in `.png` while `f_webp` in its parameters means the bytes are
 * webp; declaring `image/png` for webp content is something a strict reader may refuse to draw. A header can be
 * wrong or generic (`application/octet-stream`) for the same reason.
 *
 * It also catches the failure that matters most for free: an HTML error page is not an image, so a 404 never gets
 * written into the book as a broken-image box. `DictionaryService` guards its download the same way.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const at = (i: number, ...sig: number[]): boolean => sig.every((b, k) => bytes[i + k] === b);
  if (bytes.length < 12) return null;
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0x42, 0x4d)) return 'image/bmp';
  // ISO-BMFF: `ftyp` at 4 also covers mp4 and heic, so the brand at 8 is what distinguishes an AVIF.
  if (at(4, 0x66, 0x74, 0x79, 0x70) && (at(8, 0x61, 0x76, 0x69, 0x66) || at(8, 0x61, 0x76, 0x69, 0x73))) {
    return 'image/avif';
  }
  // SVG is text, so it has no signature — look for the markup instead, past any BOM or XML declaration.
  const head = new TextDecoder().decode(bytes.subarray(0, 256));
  if (/<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

const EXTENSION_FOR: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

/** One image this big is a scan or a mistake, not an illustration. Skipped and counted, never fatal. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** And a clipped article with a dozen hero images should not produce a book nobody wants to sync. */
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
/** `requestUrl` has no timeout of its own, so one unresponsive host would hang the whole conversion. */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetch one remote image, or null if it cannot be had.
 *
 * `requestUrl` rather than `fetch`, because it is not subject to CORS — a plain `fetch` for a third-party image
 * fails on exactly the hosts this exists to serve.
 *
 * Every failure is silent and per-image: a slow host, a 404, a non-image response, something too large. One bad
 * attachment must not fail a conversion.
 */
async function fetchRemoteImage(url: string): Promise<{ mediaType: string; data: Uint8Array } | null> {
  try {
    const res = await Promise.race([
      requestUrl({ url, method: 'GET', throw: false }),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
    ]);
    if (!res || res.status !== 200) return null;
    const data = new Uint8Array(res.arrayBuffer);
    if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_BYTES) return null;
    const mediaType = sniffImageType(data);
    return mediaType ? { mediaType, data } : null;
  } catch {
    return null; // unreachable host, bad URL, refused connection
  }
}

/** Extension → media type, for VAULT images, where the extension is the truth rather than a guess. */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

/**
 * Package every image the note embeds, and point the DOM at the copies.
 *
 * **Resolved by filename through the metadata cache, not by parsing `src`.** Obsidian renders an embed to an
 * `app://` URL on desktop and a `capacitor://` one on mobile, both carrying an absolute path and a cache-busting
 * query — reading a vault file back out of that is guesswork that differs per platform. The basename plus
 * `getFirstLinkpathDest` is the same lookup Obsidian itself does, and it works for `![[wiki]]` and `![](path)`
 * alike.
 *
 * The mirror of `book-extractor`'s image pass, which walks a book's `<img>` tags the other way — out to the vault
 * rather than in from it.
 *
 * An image that will not resolve is left alone, so serialization drops it and counts it. Failing the whole
 * conversion over one missing attachment would be the wrong trade.
 */
interface ImageCollector {
  /** Package every image `host` embeds and point its `<img>` tags at the copies. Call once per note. */
  addFrom(host: HTMLElement, source: TFile): Promise<void>;
  /** Everything packaged so far, for `buildEpub`. */
  images(): EpubImage[];
}

/**
 * What to ask the metadata cache for, given a rendered `<img>`.
 *
 * **A basename is not an identity.** `ebooks/exports/another-book-assets/cover.jpg` resolved as `cover.jpg`
 * matches one file per book in a vault full of book exports — so one book would be packaged with another's cover,
 * whichever sorts first.
 *
 * Obsidian wraps an embed in a `.internal-embed` whose own `src` is **the link exactly as written**. Read it when it
 * is there; fall back to the basename when it is not, which is what a plain `![](…)` rendered outside a wrapper
 * still needs.
 */
export function embedLinkpath(img: HTMLElement, raw: string): string {
  const wrapper = img.closest('.internal-embed')?.getAttribute('src');
  if (wrapper) return decodeURIComponent(wrapper.split(/[?#]/)[0]);
  return decodeURIComponent(raw.split(/[?#]/)[0]).split('/').pop() ?? '';
}

/**
 * A collector rather than a function, because a **folder** conversion is one book with one budget.
 *
 * Per-call state would give thirty notes thirty independent size ceilings and one copy of a shared diagram per note
 * that referenced it. Both belong to the book. The single-note path makes one of these and calls `addFrom` once, so
 * there is no second code path.
 */
function imageCollector(app: App, opts: { remote: boolean }): ImageCollector {
  const packaged = new Map<string, EpubImage>();
  const usedHrefs = new Set<string>();
  let total = 0;
  let remoteCount = 0;

  const add = (key: string, href: string, mediaType: string, data: Uint8Array): EpubImage | null => {
    if (total + data.byteLength > MAX_TOTAL_IMAGE_BYTES) return null;
    total += data.byteLength;
    const entry = { href: uniqueHref(href), mediaType, data };
    packaged.set(key, entry);
    return entry;
  };

  /**
   * Two different images can share a basename — `a/diagram.png` and `b/diagram.png` — and the archive has one
   * namespace. Deduped here rather than by hashing the path into the name, so the common case keeps a readable
   * filename.
   */
  const uniqueHref = (href: string): string => {
    if (!usedHrefs.has(href)) {
      usedHrefs.add(href);
      return href;
    }
    const dot = href.lastIndexOf('.');
    const stem = dot === -1 ? href : href.slice(0, dot);
    const ext = dot === -1 ? '' : href.slice(dot);
    for (let n = 2; ; n++) {
      const candidate = `${stem}-${n}${ext}`;
      if (!usedHrefs.has(candidate)) {
        usedHrefs.add(candidate);
        return candidate;
      }
    }
  };

  const addFrom = async (host: HTMLElement, source: TFile): Promise<void> => {
    for (const img of Array.from(host.querySelectorAll('img'))) {
      const raw = img.getAttribute('src') ?? '';
      if (!raw || raw.startsWith(`${IMAGE_DIR}/`)) continue;

      // Remote: anything with a real scheme. `app://` and `capacitor://` are how Obsidian renders a VAULT embed, so
      // they belong to the branch below rather than to the network.
      const isRemote = /^https?:\/\//i.test(raw);
      const cached = packaged.get(raw);
      if (isRemote) {
        if (!opts.remote) continue; // dropped and counted by serialization
        if (cached) {
          img.setAttribute('src', cached.href);
          continue;
        }
        const got = await fetchRemoteImage(raw);
        if (!got) continue;
        remoteCount++;
        const ext = EXTENSION_FOR[got.mediaType] ?? 'img';
        const entry = add(raw, `${IMAGE_DIR}/remote-${remoteCount}.${ext}`, got.mediaType, got.data);
        if (entry) img.setAttribute('src', entry.href);
        continue;
      }

      // A vault embed. Resolved through the metadata cache rather than by parsing `src`: Obsidian renders one to an
      // `app://` URL on desktop and `capacitor://` on mobile, each with an absolute path and a cache-busting query,
      // so recovering the vault file from that string is guesswork that differs per platform.
      // `getFirstLinkpathDest` is the lookup Obsidian itself does, and it handles `![[wiki]]` and `![](path)` alike.
      const linkpath = embedLinkpath(img, raw);
      const ext = linkpath.split('/').pop()?.split('.').pop()?.toLowerCase() ?? '';
      const mediaType = IMAGE_TYPES[ext];
      if (!mediaType) continue;
      const target = app.metadataCache.getFirstLinkpathDest(linkpath, source.path);
      if (!target) continue;
      const existing = packaged.get(target.path);
      if (existing) {
        img.setAttribute('src', existing.href);
        continue;
      }
      try {
        const data = new Uint8Array(await app.vault.readBinary(target));
        if (data.byteLength > MAX_IMAGE_BYTES) continue;
        const entry = add(target.path, `${IMAGE_DIR}/${sanitizeName(target.basename)}.${ext}`, mediaType, data);
        if (entry) img.setAttribute('src', entry.href);
      } catch {
        continue; // unreadable attachment: dropped and counted, not fatal
      }
    }
  };

  return { addFrom, images: () => [...packaged.values()] };
}

/**
 * Rendered DOM → the sections of a book.
 *
 * **Split first, then serialize.** The anchor map has to know which file each id landed in before any link can be
 * rewritten, and that is only knowable once the document is partitioned — so serialization is the last step, not
 * the first.
 */
function toSections(
  host: HTMLElement,
  conv: EpubConversion,
  isSelf: (linkpath: string) => boolean,
  resolveNote?: NoteLinkResolver
): { sections: EpubSection[]; losses: XhtmlLosses } {
  const split = splitAtHeadings(host, conv.splitLevel, conv.title);
  const anchors = buildAnchorMap(split, (i) => `${sectionId(i)}.xhtml`);
  const losses: XhtmlLosses = { links: 0, images: 0, svg: 0, emptyBlocks: 0 };
  const sections = split.map((section, i) => {
    const { xhtml, losses: own } = domToXhtml(section.nodes, anchors, resolveNote, isSelf);
    losses.links += own.links;
    losses.images += own.images;
    losses.svg += own.svg;
    losses.emptyBlocks += own.emptyBlocks;
    // The book's title heads the FIRST section only, and only when that section does not already open with a
    // heading of its own; otherwise a note that starts with `# Title` gets the title twice, one above the
    // other.
    const body = i === 0 && !opensWithHeading(section) ? `<h1>${escapeXml(conv.title)}</h1>\n${xhtml}` : xhtml;
    return {
      id: sectionId(i),
      title: section.title,
      xhtml: xhtmlDocument(section.title, conv.language, body),
      children: section.children,
    };
  });
  return { sections, losses };
}

/** What the reader is shown before converting: the shape of the book, and what will not carry over. */
export interface NoteAnalysis {
  /** One per section, in order, with how many nested nav entries it will have. */
  sections: { title: string; children: number }[];
  /** How many headings exist at each level, so the level picker is an informed choice. `[h1, h2, … h6]`. */
  headingCounts: number[];
  losses: XhtmlLosses;
  images: { vault: number; remote: number; unresolvable: number };
}

/**
 * Classify the images a note embeds, **without reading or fetching anything.**
 *
 * Counts only, because this runs while a dialog is open: reading every attachment to say "3 images" would make
 * opening the dialog as expensive as the conversion, and fetching the remote ones would put the network behind a
 * screen whose whole job is to tell you what is about to happen.
 */
function classifyImages(app: App, host: HTMLElement, sourcePath: string): NoteAnalysis['images'] {
  const seen = { vault: new Set<string>(), remote: new Set<string>(), unresolvable: 0 };
  for (const img of Array.from(host.querySelectorAll('img'))) {
    const raw = img.getAttribute('src') ?? '';
    if (!raw) continue;
    if (/^https?:\/\//i.test(raw)) {
      seen.remote.add(raw);
      continue;
    }
    const name = decodeURIComponent(raw.split(/[?#]/)[0]).split('/').pop() ?? '';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const target = IMAGE_TYPES[ext] ? app.metadataCache.getFirstLinkpathDest(name, sourcePath) : null;
    if (target) seen.vault.add(target.path);
    else seen.unresolvable++;
  }
  // An embed whose file does not exist renders no `<img>` at all, only Obsidian's "could not be found" message.
  for (const embed of Array.from(host.querySelectorAll('.file-embed.mod-empty-attachment'))) {
    const ext = (embed.getAttribute('src') ?? '').split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
    if (IMAGE_TYPES[ext]) seen.unresolvable++;
  }
  return { vault: seen.vault.size, remote: seen.remote.size, unresolvable: seen.unresolvable };
}

/**
 * What this note becomes at a given split level.
 *
 * Re-runnable on the same DOM as the level changes — `splitAtHeadings` only assigns ids that are missing, so
 * calling it repeatedly is idempotent and there is no need to re-render the note to answer "what if H3".
 *
 * The anchor map is built here too, even though nothing is written: without it every internal link and footnote
 * would count as flattened, and the report would warn about losses that are not going to happen.
 */
export function analyseNote(app: App, host: HTMLElement, conv: EpubConversion, sourcePath: string): NoteAnalysis {
  const split = splitAtHeadings(host, conv.splitLevel, conv.title);
  const anchors = buildAnchorMap(split, (i) => `${sectionId(i)}.xhtml`);
  const losses: XhtmlLosses = { links: 0, images: 0, svg: 0, emptyBlocks: 0 };
  for (const section of split) {
    const own = domToXhtml(section.nodes, anchors, undefined, linksToSelf(app, sourcePath)).losses;
    losses.links += own.links;
    losses.svg += own.svg;
    losses.emptyBlocks += own.emptyBlocks;
  }
  return {
    sections: split.map((s) => ({ title: s.title, children: s.children.length })),
    headingCounts: [1, 2, 3, 4, 5, 6].map((n) => host.querySelectorAll(`h${n}`).length),
    // `losses.images` is deliberately not carried through: nothing is packaged during analysis, so every image
    // would look lost. `classifyImages` is the honest answer.
    losses,
    images: classifyImages(app, host, sourcePath),
  };
}

/** Render a note for analysis. The caller owns the returned element and must remove it. */
export async function renderForAnalysis(app: App, file: TFile): Promise<HTMLElement> {
  return renderNote(app, await sourceForRender(app, file), file.path);
}

/**
 * Convert `file` and write `<basename>.epub` beside it.
 *
 * Sections are cut at the chosen heading level, internal links and footnotes are rewritten across them, and
 * embedded images are packaged into the archive.
 */
export async function saveNoteAsEpub(
  app: App,
  file: TFile,
  conv: EpubConversion,
  now: number,
  opts?: {
    /** Book-per-note conversion passes a resolver so links to the OTHER books become deep links. A single note
     *  has nothing to link to, so it passes nothing and the behavior is unchanged. */
    resolveNote?: NoteLinkResolver;
    /**
     * Write here instead of at `epubTargetPath(conv)`.
     *
     * **For a caller that has to find this file again.** `epubTargetPath` sanitizes the name on the way past,
     * which is right when a person typed it into a dialog — but *Read in Orbis Reader* derives the name from the
     * note and then looks for it by that name on every invocation, so a name changed in transit is a book it
     * cannot find and would silently overwrite. It owns the whole name, including how long it may be and what
     * whitespace it keeps, and passes the result here rather than hoping the two rules agree.
     */
    targetPath?: string;
  }
): Promise<{ path: string; losses: XhtmlLosses } | null> {
  const built = await buildNoteEpub(app, file, conv, now, opts);
  return (await writeBuiltEpub(app, built)) ? { path: built.path, losses: built.losses } : null;
}

/** A book made and not yet written — so it can be compared with the one already there before anyone is asked. */
export interface BuiltEpub {
  path: string;
  bytes: Uint8Array;
  losses: XhtmlLosses;
}

/** `saveNoteAsEpub` without the write. */
export async function buildNoteEpub(
  app: App,
  file: TFile,
  conv: EpubConversion,
  now: number,
  opts?: {
    resolveNote?: NoteLinkResolver;
    targetPath?: string;
    /** The font, already read for a set of books — read once, and its absence said once. */
    font?: EpubFont;
  }
): Promise<BuiltEpub> {
  const meta: EpubMeta = {
    ...conv,
    identifier: newIdentifier(),
    modified: isoSeconds(now),
  };
  const host = await renderNote(app, await sourceForRender(app, file), file.path);
  // Before serialization: `collectImages` rewrites each `src`, and serialization keeps only images whose `src`
  // points into the archive.
  const images = imageCollector(app, { remote: conv.fetchRemoteImages });
  await images.addFrom(host, file);
  const { sections, losses } = toSections(host, conv, linksToSelf(app, file.path), opts?.resolveNote);
  host.remove();
  const font = opts && 'font' in opts ? opts.font : await conversionFont(app, conv.font);
  const bytes = buildEpub(meta, sections, images.images(), font);
  return { path: opts?.targetPath ?? epubTargetPath(conv), bytes, losses };
}

/** Write a built book at its path. False, having said why, when the vault refused. */
export async function writeBuiltEpub(app: App, built: BuiltEpub): Promise<boolean> {
  const { path, bytes } = built;
  try {
    // `modifyBinary` rather than delete-and-create, so the path is stable and any `.orbis` beside it stays valid.
    if (app.vault.getAbstractFileByPath(path)) await app.vault.adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
    else await app.vault.createBinary(path, bytes.buffer as ArrayBuffer);
  } catch (e) {
    new Notice(t('notices.epub_write_failed', { error: String(e) }));
    return false;
  }
  return true;
}

/**
 * The font a conversion names, read for embedding, or undefined for none. A font this device does not have — not
 * synced yet, or deleted — makes a book without one, and a notice says so: the book is still the book.
 */
export async function conversionFont(app: App, family: string): Promise<EpubFont | undefined> {
  if (!family) return undefined;
  const font = await loadEpubFont(app, family);
  if (!font) new Notice(t('notices.epub_font_missing', { name: family }));
  return font;
}

// ── A folder of notes ─────────────────────────────────────────────────────────
//
// The same pipeline, once per note, plus the two things that only exist when there is more than one: an order, and
// links that cross from one note to another. See docs/design/markdown-to-epub.md §A folder of notes.

/** How deep the table of contents goes inside one chapter. A note is one section, so without a limit every heading
 *  it has would become a nav entry — a contents page longer than some of the chapters. */
const FOLDER_NAV_DEPTH = 2;

/** Top-level Markdown in the folder, in no particular order. Not recursive: "everything to be included is in this
 *  folder" is a rule someone can hold in their head and satisfy by dragging files. */
export function folderNotes(folder: TFolder): TFile[] {
  return folder.children.filter((c): c is TFile => c instanceof TFile && c.extension === 'md');
}

/**
 * The notes an index note links to, in the order it links to them.
 *
 * From `metadataCache`, not from the rendered DOM: this runs while a dialog is open, and the whole point of the
 * folder preview is that it costs nothing. `links` is in document order, which IS the reading order being read off.
 */
export function indexLinkOrder(app: App, index: TFile): string[] {
  const links = app.metadataCache.getFileCache(index)?.links ?? [];
  const paths: string[] = [];
  for (const link of links) {
    const target = app.metadataCache.getFirstLinkpathDest(link.link.split('#')[0], index.path);
    if (target) paths.push(target.path);
  }
  return paths;
}

/** The contents note an Orbis export's chapter notes name in their `toc`, when it is in the same folder. */
function orbisContentsNote(app: App, files: readonly TFile[]): string | null {
  const inFolder = new Set(files.map((f) => f.path));
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    if (!isOrbisChapterSet(frontmatterText(cache?.frontmatter?.orbis_generated))) continue;
    const toc = cache?.frontmatterLinks?.find((l) => l.key === 'toc');
    const target = toc ? app.metadataCache.getFirstLinkpathDest(toc.link, file.path) : null;
    if (target && inFolder.has(target.path)) return target.path;
  }
  return null;
}

/** The reading order for a folder, with the index note that decided it. */
function folderOrder(app: App, folder: TFolder): { notes: TFile[]; index: TFile | null; appended: number } {
  const files = folderNotes(folder);
  const index = findIndexNote(files, orbisContentsNote(app, files));
  const linked = index ? indexLinkOrder(app, index) : [];
  const order = orderNotes(files, index, linked);
  return { notes: order.ordered, index, appended: order.appended };
}

/** Book metadata read off the index note, which is the only note that speaks for the whole folder. */
export function folderDefaults(
  app: App,
  folder: TFolder,
  opts: {
    keyLang: string;
    sameFolderAsNote: boolean;
    folder: string;
    fetchRemoteImages: boolean;
    defaultType?: string;
    font?: string;
  }
): FolderConversion {
  const { notes, index } = folderOrder(app, folder);
  const cache = index ? app.metadataCache.getFileCache(index) : null;
  const read = (canonical: string): string =>
    frontmatterText(cache?.frontmatter?.[resolveFrontmatterKey(canonical, opts.keyLang)]);
  const heading = cache?.headings?.find((h) => h.level === 1)?.heading;
  const title = bookTitleOf({ frontmatterTitle: read('title'), heading, folderName: folder.name });
  return {
    fileName: folder.name,
    // Beside the FOLDER, i.e. in its parent — output inside its own source folder is the loop hazard.
    folder: opts.sameFolderAsNote ? (folder.parent?.path ?? '/') : opts.folder || '/',
    title,
    author: displayName(read('author')),
    publisher: displayName(read('publisher')),
    publicationDate: read('publication_date') || frontmatterText(cache?.frontmatter?.published),
    type: opts.defaultType || 'book',
    language: read('language') || 'en',
    // A note is a section. Splitting further is available but off: it is what makes an edit to one note shift every
    // CFI after it in the book.
    splitLevel: 0,
    fetchRemoteImages: opts.fetchRemoteImages,
    font: opts.font ?? '',
    notes: notes.map((n) => n.path),
    orderSource: index?.path ?? null,
  };
}

/** One note, rendered and partitioned, holding the section indices it claimed in the book. */
interface StagedNote {
  file: TFile;
  host: HTMLElement;
  parts: SectionNodes[];
  /** Index of this note's first section in the book — sections are numbered across the whole book, not per note. */
  first: number;
}

/**
 * Convert every note in `folder` into one EPUB.
 *
 * **Two passes over the notes, and that is the whole shape of it.** Every note's anchors have to exist before any
 * note is serialized, because note 1 can link to note 34 — so the first pass renders and partitions, and only the
 * second writes XHTML. The cost is that the rendered notes are all in memory at once, which is fine at the scale
 * this targets and is the thing that would have to change for a folder of hundreds.
 */
export async function buildFolderEpub(
  app: App,
  folder: TFolder,
  conv: FolderConversion,
  now: number
): Promise<(BuiltEpub & { sections: number; notes: number }) | null> {
  const notes = selectedNotes(app, conv);
  if (!notes.length) {
    new Notice(t('notices.epub_folder_empty'));
    return null;
  }

  // Pass 1: render, partition, claim section numbers, collect images against ONE budget.
  const images = imageCollector(app, { remote: conv.fetchRemoteImages });
  const staged: StagedNote[] = [];
  const book = new Map<string, BookNote>();
  let next = 0;
  for (const file of notes) {
    const cache = app.metadataCache.getFileCache(file);
    const title = sectionTitleOf({
      heading: cache?.headings?.find((h) => h.level === 1)?.heading,
      frontmatterTitle: sectionFrontmatterTitle(cache?.frontmatter),
      basename: file.basename,
    });
    const host = await renderNote(app, await sourceForRender(app, file), file.path);
    await images.addFrom(host, file);
    const parts = splitAtHeadings(host, conv.splitLevel, title);
    const first = next;
    next += parts.length;
    staged.push({ file, host, parts, first });
    // Per note, never pooled: two notes with a `## Overview` produce the same id, and one map across the book
    // would send a link to whichever was indexed last.
    const anchors = buildAnchorMap(parts, (i) => `${sectionId(first + i)}.xhtml`);
    book.set(file.path, { path: file.path, file: `${sectionId(first)}.xhtml`, anchors });
  }

  // Pass 2: serialize, now that every note's anchors are known.
  const losses: XhtmlLosses = { links: 0, images: 0, svg: 0, emptyBlocks: 0 };
  const sections: EpubSection[] = [];
  for (const note of staged) {
    const resolveNote = crossNoteResolver({
      from: note.file.path,
      notes: book,
      resolvePath: (href, from) => app.metadataCache.getFirstLinkpathDest(href, from)?.path ?? null,
    });
    const anchors = book.get(note.file.path)?.anchors;
    note.parts.forEach((part, i) => {
      const { xhtml, losses: own } = domToXhtml(part.nodes, anchors, resolveNote, linksToSelf(app, note.file.path));
      losses.links += own.links;
      losses.images += own.images;
      losses.svg += own.svg;
      losses.emptyBlocks += own.emptyBlocks;
      // Nothing prepends the BOOK title here, unlike single-note mode: every note brings its own heading, and the
      // index note's h1 is the book title — printing it twice is how that would show up. A note that opens with no
      // heading at all gets one, or it lands in the book as a section with nothing at the top of it.
      const body = i === 0 && !opensWithHeading(part) ? `<h1>${escapeXml(part.title)}</h1>\n${xhtml}` : xhtml;
      sections.push({
        id: sectionId(note.first + i),
        title: part.title,
        xhtml: xhtmlDocument(part.title, conv.language, body),
        // Trimmed: a whole note as one section would otherwise contribute every heading it has, and its own `h1`
        // is the chapter title — as a nav child that is the same entry twice, one indented under the other.
        children: part.children.filter((c) => c.level > 1 && c.level <= FOLDER_NAV_DEPTH),
      });
    });
    note.host.remove();
  }

  const meta: EpubMeta = { ...conv, identifier: newIdentifier(), modified: isoSeconds(now) };
  const bytes = buildEpub(meta, sections, images.images(), await conversionFont(app, conv.font));
  return { path: epubTargetPath(conv), bytes, losses, sections: sections.length, notes: notes.length };
}

/** The chosen notes as files, in the chosen order. A path that no longer resolves is skipped rather than fatal —
 *  a note can be renamed between opening the dialog and pressing Convert. */
function selectedNotes(app: App, conv: FolderConversion): TFile[] {
  return conv.notes.map((path) => app.vault.getAbstractFileByPath(path)).filter((f): f is TFile => f instanceof TFile);
}

/** Whether a section already starts with a heading, so a synthesized one would be a duplicate. */
function opensWithHeading(part: SectionNodes): boolean {
  const first = part.nodes.find((n) => n.nodeType === Node.ELEMENT_NODE) as HTMLElement | undefined;
  return !!first && /^h[1-6]$/i.test(first.tagName);
}

/**
 * A folder conversion: the shared fields, plus **which notes and in what order**.
 *
 * Explicit rather than re-derived at write time, because by then the reader may have reordered the list or
 * unchecked something, and a conversion that recomputed the order would quietly ignore both. `folderDefaults`
 * seeds it from the ordering rule; the dialog is free to replace it.
 */
export interface FolderConversion extends EpubConversion {
  /** Vault paths, in reading order. Notes the reader excluded are simply absent. */
  notes: string[];
  /** The note whose links seeded that order, or null for file name order. A default the reader can change; see
   *  `SeparateConversion.orderSource`, which means the same thing for a set. */
  orderSource: string | null;
}

/** Every note in the folder, in the default order, with the title each would carry. The dialog needs the excluded
 *  ones too — a note you cannot see is a note you cannot put back. */
export function folderChapters(app: App, folder: TFolder): { path: string; basename: string; title: string }[] {
  return folderOrder(app, folder).notes.map((file) => {
    const cache = app.metadataCache.getFileCache(file);
    return {
      path: file.path,
      // Carried alongside the title because the two answer different questions: a title says what a note is, a file
      // name says WHICH note it is — and picking one out of a folder is the second question.
      basename: file.basename,
      title: sectionTitleOf({
        heading: cache?.headings?.find((h) => h.level === 1)?.heading,
        frontmatterTitle: sectionFrontmatterTitle(cache?.frontmatter),
        basename: file.basename,
      }),
    };
  });
}

/** One chapter, as the preview describes it. */
export interface FolderNoteAnalysis {
  path: string;
  title: string;
  /** How many sections it becomes. Exactly 1 at the default split level, which is the case that matters. */
  sections: number;
  /** Sub-headings that will become nav entries under it. */
  children: number;
}

/** What a folder becomes, **without rendering anything**. */
export interface FolderAnalysis {
  /** The note that named the order, if one did. Its basename, for the line explaining the order. */
  index: string | null;
  /** Notes the index did not link to, appended in filename order. Stated, never silent. */
  appended: number;
  notes: FolderNoteAnalysis[];
  sections: number;
  /** Headings at each level across the whole folder, so the split picker is an informed choice. `[h1, … h6]`. */
  headingCounts: number[];
  /** Links between notes IN the book, and links whose target is not — the second flatten to text. */
  links: { internal: number; outside: number };
  images: { vault: number; remote: number; unresolvable: number };
}

/** `![](https://…)` and a raw `<img src="https://…">`. Counted from the source text because the metadata cache
 *  indexes vault linkpaths, and a URL is not one. */
const REMOTE_IMAGE_RE = /!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)|<img\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)/gi;

function countRemoteImages(text: string): Set<string> {
  const urls = new Set<string>();
  for (const m of text.matchAll(REMOTE_IMAGE_RE)) urls.add(m[1] ?? m[2]);
  return urls;
}

/**
 * What this folder becomes, from the metadata cache and the raw text — **nothing is rendered.**
 *
 * The single-note dialog renders its note once and re-partitions it as the level changes. For a folder that would
 * put a multi-second render behind the screen whose entire job is to say what is about to happen, and it would then
 * be paid again by the conversion. `getFileCache` already knows the headings, the links and the embeds; the only
 * thing it cannot know is a remote image, because a URL is not a vault linkpath, so those are counted from the
 * source text — a read, not a render.
 *
 * The honest cost: loss counts here are **estimates**. The single-note screen's are exact, because it has the DOM.
 */
export async function analyseFolder(app: App, folder: TFolder, conv: FolderConversion): Promise<FolderAnalysis> {
  const { index, appended } = folderOrder(app, folder);
  const notes = selectedNotes(app, conv);
  const inBook = new Set(conv.notes);
  const headingCounts = [0, 0, 0, 0, 0, 0];
  const links = { internal: 0, outside: 0 };
  const vaultImages = new Set<string>();
  const remote = new Set<string>();
  let unresolvable = 0;

  const analysed: FolderNoteAnalysis[] = [];
  for (const file of notes) {
    const cache = app.metadataCache.getFileCache(file);
    const headings = cache?.headings ?? [];
    for (const h of headings) if (h.level >= 1 && h.level <= 6) headingCounts[h.level - 1]++;

    for (const link of cache?.links ?? []) {
      const target = link.link.split('#')[0];
      // A bare `#anchor` stays inside the note it was written in, so it is internal by definition.
      if (!target) {
        links.internal++;
        continue;
      }
      const dest = app.metadataCache.getFirstLinkpathDest(target, file.path);
      if (dest && inBook.has(dest.path)) links.internal++;
      else links.outside++;
    }

    for (const embed of cache?.embeds ?? []) {
      // A URL is not a linkpath; those are counted from the text below and must not be re-counted as unresolvable.
      if (/^[a-z][a-z0-9+.-]*:/i.test(embed.link)) continue;
      const name = embed.link.split('#')[0];
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (!IMAGE_TYPES[ext]) continue; // a transcluded note, not an image — a different thing, not a loss here
      const dest = app.metadataCache.getFirstLinkpathDest(name, file.path);
      if (dest) vaultImages.add(dest.path);
      else unresolvable++;
    }

    const text = await app.vault.cachedRead(file);
    for (const url of countRemoteImages(text)) remote.add(url);

    const title = sectionTitleOf({
      heading: headings.find((h) => h.level === 1)?.heading,
      frontmatterTitle: sectionFrontmatterTitle(cache?.frontmatter),
      basename: file.basename,
    });
    // At the default level a note is exactly one section. Above it, one per heading at that level, plus one for
    // anything before the first — the same rule `splitAtHeadings` applies, counted rather than performed.
    const cuts = conv.splitLevel === 0 ? [] : headings.filter((h) => h.level === conv.splitLevel);
    const leading = cuts.length === 0 || headings[0]?.level !== conv.splitLevel ? 1 : 0;
    analysed.push({
      path: file.path,
      title,
      sections: Math.max(1, cuts.length + leading),
      children: headings.filter((h) => h.level > Math.max(1, conv.splitLevel) && h.level <= FOLDER_NAV_DEPTH).length,
    });
  }

  return {
    index: index?.basename ?? null,
    appended,
    notes: analysed,
    sections: analysed.reduce((n, a) => n + a.sections, 0),
    headingCounts,
    links,
    images: { vault: vaultImages.size, remote: remote.size, unresolvable },
  };
}

// ── A book per note ───────────────────────────────────────────────────────────

/** What a book-per-note conversion needs. The per-book title and author come from each note; these are the
 *  decisions that belong to the SET. */
export interface SeparateConversion {
  /** The new folder, beside the source one. Named, not derived, because it is a real folder someone will live with. */
  outFolder: string;
  /** What the SET is called — the contents note's name and its heading. Resolved like a book's title. */
  title: string;
  /**
   * The note whose links seed the order, or null for file name order.
   *
   * A **default**, not a source of content: the contents note is always generated, and this only decides what
   * order it starts in. Seeded from the ordering rule and then the reader's to change, because "the folder has a
   * README so that is your running order" is a guess, and a folder can hold a better index under another name.
   */
  orderSource: string | null;
  /** Where that folder is created — the source folder's parent by default. */
  parent: string;
  language: string;
  /** Applied to every book whose own note does not name one. Usually the only author there is. */
  author: string;
  /** Same rule as the author: the set's answer where a note has none of its own. */
  publisher: string;
  publicationDate: string;
  /** One type for every book in the set — the dialog asks once, and a folder is one kind of thing. */
  type: string;
  splitLevel: number;
  fetchRemoteImages: boolean;
  /** One font for every book in the set, like the type. */
  font: string;
  notes: string[];
}

export interface SeparateResult {
  folder: string;
  books: number;
  toc: string;
  losses: XhtmlLosses;
  /** Each book now current at its path — written, or left alone as already identical — with the note it came from:
   *  what the library needs to write one title note per book. A book the vault refused is not among them. */
  kept: { path: string; note: TFile }[];
}

/** `<folder>-EPUB`, beside the source folder. Never inside it: a re-run would ingest its own output, and the
 *  contents note would become a chapter of the next book. */
export function separateDefaults(
  app: App,
  folder: TFolder,
  opts: {
    keyLang: string;
    fetchRemoteImages: boolean;
    defaultType?: string;
    /** The same destination question the other two dialogs ask. */
    sameFolderAsNote: boolean;
    folder: string;
    font?: string;
  }
): SeparateConversion {
  const { notes, index } = folderOrder(app, folder);
  const cache = index ? app.metadataCache.getFileCache(index) : null;
  const read = (canonical: string): string =>
    frontmatterText(cache?.frontmatter?.[resolveFrontmatterKey(canonical, opts.keyLang)]);
  const heading = cache?.headings?.find((h) => h.level === 1)?.heading;
  return {
    outFolder: t('epub_export.out_folder_name', { name: folder.name }),
    title: bookTitleOf({ frontmatterTitle: read('title'), heading, folderName: folder.name }),
    orderSource: index?.path ?? null,
    // **From the same setting the other two dialogs read**, so a vault configured to put EPUBs in one folder gets
    // them there from all three commands — one question, one answer.
    parent: opts.sameFolderAsNote ? (folder.parent?.path ?? '/') : opts.folder || '/',
    language: read('language') || 'en',
    author: displayName(read('author')),
    publisher: displayName(read('publisher')),
    publicationDate: read('publication_date') || frontmatterText(cache?.frontmatter?.published),
    // One type for every book in the set: the dialog asks once, and thirty books from one folder are thirty of
    // the same kind of thing.
    type: opts.defaultType || 'book',
    splitLevel: 0,
    fetchRemoteImages: opts.fetchRemoteImages,
    font: opts.font ?? '',
    notes: notes.map((n) => n.path),
  };
}

/**
 * Where the set will be written, and where its contents note will land.
 *
 * **The contents note is named `!<title>`, and the `!` is load-bearing.** It sorts before digits, so the one file
 * that explains the folder sits at the top of it instead of alphabetically below thirty-four books named `001-`,
 * `002-`… The same trick, for the same reason, as `!orbis-data` and the generated `!Reading records.base`.
 *
 * Titled rather than named after the folder: `!Orbis Reader — Design Documentation` is what the set *is*, and is
 * what the quick switcher will show.
 */
export function separatePaths(conv: SeparateConversion): { folder: string; toc: string } {
  const dir = conv.parent && conv.parent !== '/' ? `${conv.parent}/` : '';
  const name = exportFileName(conv.outFolder, 'books');
  const folder = normalizePath(`${dir}${name}`);
  return { folder, toc: normalizePath(`${folder}/!${sanitizeName(conv.title) || name}.md`) };
}

/** The EPUB one note becomes. The note's own basename, so a numbered folder stays in reading order on disk and the
 *  number that made the ordering work is still there — the book's TITLE is the readable one. */
function bookPathIn(folder: string, note: TFile): string {
  return normalizePath(`${folder}/${sanitizeName(note.basename)}.epub`);
}

/**
 * One EPUB per note, plus a Markdown note that links to them all.
 *
 * The other half of the same idea, and a different answer to "what is a book". One EPUB is one reading position,
 * one set of highlights and one searchable unit; this gives each document its own. Right for a reference set you
 * dip into, wrong for something read front to back — which is why it is a second command rather than a setting.
 *
 * **Links between notes become `obsidian://orbis-nav` deep links**, which is what keeps the set navigable. Without
 * that, splitting into N books would throw away the thing that makes a folder a book. A fragment cannot survive —
 * the target's CFIs do not exist until it is built — so the link opens the book at its start.
 *
 * Each book is built independently, so editing one note and regenerating touches one EPUB and no other book's
 * annotations. That is this mode's strongest property, and the reason it is worth having at all.
 */
export async function buildSeparateEpubs(
  app: App,
  folder: TFolder,
  conv: SeparateConversion,
  now: number
): Promise<SeparateBuild | null> {
  const notes = conv.notes
    .map((path) => app.vault.getAbstractFileByPath(path))
    .filter((f): f is TFile => f instanceof TFile);
  if (!notes.length) {
    new Notice(t('notices.epub_folder_empty'));
    return null;
  }

  const { folder: outFolder, toc: tocPath } = separatePaths(conv);

  // Every note's destination is known before any book is written, because book one links to book thirty-four.
  const books = new Map<string, { path: string; title: string }>();
  for (const note of notes) {
    const cache = app.metadataCache.getFileCache(note);
    books.set(note.path, {
      path: bookPathIn(outFolder, note),
      title: sectionTitleOf({
        heading: cache?.headings?.find((h) => h.level === 1)?.heading,
        frontmatterTitle: sectionFrontmatterTitle(cache?.frontmatter),
        basename: note.basename,
      }),
    });
  }

  const losses: XhtmlLosses = { links: 0, images: 0, svg: 0, emptyBlocks: 0 };
  const built: { note: TFile; epub: BuiltEpub }[] = [];
  // Read once for the set, and its absence said once rather than once a book.
  const font = await conversionFont(app, conv.font);
  for (const note of notes) {
    const book = books.get(note.path);
    if (!book) continue;
    const cache = app.metadataCache.getFileCache(note);
    const conversion: EpubConversion = {
      fileName: note.basename,
      folder: outFolder,
      title: book.title,
      author: displayName(frontmatterText(cache?.frontmatter?.author)) || conv.author,
      language: frontmatterText(cache?.frontmatter?.language) || conv.language,
      // Each note's own where it has them, the set's answer where it does not. The type is the set's for every
      // book: one run, one answer, which is what the dialog asked for.
      publisher: displayName(frontmatterText(cache?.frontmatter?.publisher)) || conv.publisher,
      publicationDate:
        frontmatterText(cache?.frontmatter?.publication_date) ||
        frontmatterText(cache?.frontmatter?.published) ||
        conv.publicationDate,
      type: conv.type,
      splitLevel: conv.splitLevel,
      fetchRemoteImages: conv.fetchRemoteImages,
      font: conv.font,
    };
    // A deep link rather than an intra-book href: the target is a different EPUB, and Orbis already answers this
    // URL by opening the book. `id` is deliberately absent — see the note above about fragments.
    const resolveNote = (href: string): { file: string } | null => {
      if (!href || href.startsWith('#')) return null;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
      const target = app.metadataCache.getFirstLinkpathDest(href.split('#')[0], note.path);
      const dest = target ? books.get(target.path) : null;
      // A link to the note's OWN book would leave the book and come back to it: leave it as text.
      return dest && target?.path !== note.path ? { file: buildDeepUrl(dest.path, '') } : null;
    };
    // At `bookPathIn`'s path, not `epubTargetPath`'s: the contents note links to this file by `bookPathIn`, and the
    // two capped a long name at different lengths — a 100-character note's book was written whole and linked to cut
    // short.
    const epub = await buildNoteEpub(app, note, conversion, now, { resolveNote, targetPath: book.path, font });
    built.push({ note, epub });
    losses.links += epub.losses.links;
    losses.images += epub.losses.images;
    losses.svg += epub.losses.svg;
    losses.emptyBlocks += epub.losses.emptyBlocks;
  }
  return { folder: outFolder, toc: tocPath, books, notes, built, losses };
}

/** Every book of a set, made and not yet written — see `BuiltEpub`. */
export interface SeparateBuild {
  folder: string;
  toc: string;
  books: ReadonlyMap<string, { path: string; title: string }>;
  notes: readonly TFile[];
  built: { note: TFile; epub: BuiltEpub }[];
  losses: XhtmlLosses;
}

/** Write a built set, except the books whose paths are in `skip` — those already identical — and its contents note. */
export async function writeSeparateEpubs(
  app: App,
  conv: SeparateConversion,
  set: SeparateBuild,
  skip: ReadonlySet<string>
): Promise<SeparateResult> {
  await ensureVaultFolder(app, set.folder);
  const kept: { path: string; note: TFile }[] = [];
  let books = 0;
  for (const { note, epub } of set.built) {
    const written = !skip.has(epub.path) && (await writeBuiltEpub(app, epub));
    if (written) books++;
    if (written || skip.has(epub.path)) kept.push({ path: epub.path, note });
  }
  await writeTocNote(app, conv, set.toc, set.books, set.notes);
  return { folder: set.folder, books, toc: set.toc, losses: set.losses, kept };
}

/**
 * The contents note: a list of every EPUB, in the chosen order. **Always generated.**
 *
 * See `generatedTocMarkdown` for why an existing index note is not adopted. What is used of it is its *order*: the list
 * is seeded from the notes it links to, which is a far better default than file names for a curated folder and
 * costs one small function instead of a rewriting engine.
 *
 * Overwritten on every run, and it says so in an HTML comment at the top. A stale list pointing at half a set is
 * worse than losing a paragraph someone added to a generated file — but only just, which is why the file admits
 * what it is rather than passing for an ordinary note.
 */
async function writeTocNote(
  app: App,
  conv: SeparateConversion,
  tocPath: string,
  books: ReadonlyMap<string, { path: string; title: string }>,
  notes: readonly TFile[]
): Promise<void> {
  const markdown = generatedTocMarkdown(
    conv.title,
    notes.map((n) => {
      const book = books.get(n.path);
      // Full vault paths, not bare file names: converting one source folder twice leaves two sets whose books have
      // identical names, and a short link cannot say which set it means. Obsidian rewrites these if the folder moves.
      return { link: book?.path ?? '', title: book?.title ?? n.basename };
    }),
    t('epub_export.toc_notice')
  );

  const existing = app.vault.getAbstractFileByPath(tocPath);
  if (existing instanceof TFile) await app.vault.modify(existing, markdown);
  else await app.vault.create(tocPath, markdown);
}
