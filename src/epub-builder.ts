// An EPUB 3 archive, assembled from parts: pure, no I/O, no clock.
//
// Everything that varies — the identifier, the modified timestamp — is passed IN rather than generated here, so the
// same input always produces the same bytes. That is what makes the package testable at all, and it is the same
// rule the record shaper follows for the same reason.
//
// See docs/design/markdown-to-epub.md.

import { unzipSync, zipSync } from 'fflate';

/** Where the reader's own writing goes, and what the nav calls it. */
export interface EpubSection {
  /** `sect1` — the manifest id and the basis of the file name. Must be unique and XML-name safe. */
  id: string;
  /** Nav label. */
  title: string;
  /** A complete XHTML document. Build it with `xhtmlDocument`. */
  xhtml: string;
  /** Sub-headings inside this section, as nested nav entries. */
  children?: readonly EpubNavChild[];
}

/** A heading below the split level: a nav entry pointing into the middle of a section file. */
export interface EpubNavChild {
  /** The `id` of the heading element inside the section's XHTML. */
  anchor: string;
  title: string;
}

export interface EpubImage {
  /** Path inside the archive, relative to the OPF — e.g. `images/diagram.png`. */
  href: string;
  mediaType: string;
  data: Uint8Array;
}

/**
 * A font embedded in the book: its family, and a file per face. The book's text is set in it, and a reading app that
 * honors the publisher's font draws it — Orbis among them, when the display style's font is the book's own.
 */
export interface EpubFont {
  family: string;
  faces: readonly EpubFontFace[];
}

export interface EpubFontFace {
  /** Path inside the archive, relative to the OPF — e.g. `fonts/Literata-Regular.ttf`. */
  href: string;
  /** `font/ttf` or `font/otf`, the EPUB 3.3 core media types. */
  mediaType: string;
  data: Uint8Array;
  weight: number;
  italic: boolean;
}

export interface EpubMeta {
  title: string;
  author: string;
  /** BCP 47. Required by EPUB, so it always has a value — see the design doc on why it is never guessed. */
  language: string;
  /** Any stable unique string; a UUID in practice. Passed in, never generated here. */
  identifier: string;
  /** `dcterms:modified`, which EPUB 3 requires: `YYYY-MM-DDTHH:MM:SSZ`. Passed in for determinism. */
  modified: string;
  /** Optional, and written only when present — an empty `dc:publisher` says something false about the book. */
  publisher?: string;
  /** `dc:date`, the publication date. Same rule: written only when there is one. */
  publicationDate?: string;
}

/** Everything inside the archive lives under here, so the OPF's own relative hrefs stay short. */
const ROOT = 'OEBPS';

/**
 * XML text, escaped.
 *
 * Titles and author names carry `&` and quotes often enough that this is not defensive — "Sense & Sensibility"
 * would produce an OPF that no reader can parse, and the failure looks like a corrupt book rather than a bad title.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * A complete XHTML document around a body fragment.
 *
 * **XHTML, not HTML**: an EPUB's content documents are XML, so the declaration and namespace are required and the
 * body fragment has to be well-formed — every element closed, every attribute quoted. Producing that is the
 * sanitizing pass's job (chunk 2); this only wraps it.
 */
export function xhtmlDocument(title: string, language: string, bodyXhtml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${bodyXhtml}
</body>
</html>
`;
}

/**
 * The stylesheet every generated book carries.
 *
 * **No color except `currentColor`, and relative units throughout.** Orbis styles the page itself — font family,
 * size, line height, margins, justification, theme — and anything declared here fights that. Color is the case
 * that matters: a book hardcoding dark-on-white reads badly in dark mode, and unlike a plugin bug it is baked into
 * every book already generated and cannot be fixed by updating the plugin.
 *
 * So this is only what keeps structure legible when the reader's own styles say nothing about it. The one exception
 * is a font the person making the book chose for it (`fontCss`): asked for, it is set, and Orbis still draws the
 * display style's own font over it unless that font is the book's.
 */
const EPUB_STYLESHEET = `/* Minimal by design — the reader supplies typography, colour and margins. */
/* Anything that cannot fit a column must BREAK, not overflow. The paginator lays the book out in CSS columns, so
   content wider than one column is painted over its neighbour — the text ends up superimposed rather than clipped
   or scrollable, so an overflow rule cannot help. Long URLs in prose and unwrapped code both hit this. */
body { overflow-wrap: break-word; }
/* Links take the page's own text colour. The UA stylesheet would otherwise paint them a fixed blue, which is
   exactly what the no-colour rule exists to prevent — on a dark theme it reads as low-contrast damage, baked into
   every book already generated. Underlined instead, so they stay distinguishable without a colour of their own. */
a { color: inherit; text-decoration: underline; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word; }
code { font-family: monospace; overflow-wrap: break-word; }
blockquote { margin-inline: 1.5em; padding-inline-start: 0.75em; border-inline-start: 2px solid currentColor; }
table { border-collapse: collapse; }
th, td { border: 1px solid currentColor; padding: 0.25em 0.5em; }
figure { margin-inline: 0; }
figcaption { font-size: 0.9em; }
.callout { border: 1px solid currentColor; border-radius: 0.35em; padding: 0.5em 0.75em; margin-block: 1em; }
.callout-title { font-weight: 600; }
`;

const CONTAINER_XML = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${ROOT}/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

const sectionHref = (id: string): string => `${id}.xhtml`;

/**
 * The stylesheet's rules for an embedded font: an `@font-face` per file, and the body set in it. Code keeps its
 * monospace rule above, which is more specific. The family is quoted as a CSS string; a family's name never holds a
 * quote or backslash (`readFontFile` takes them out).
 */
function fontCss(font: EpubFont): string {
  const family = `"${font.family}"`;
  const faces = font.faces.map(
    (f) =>
      `@font-face { font-family: ${family}; font-weight: ${f.weight}; font-style: ${f.italic ? 'italic' : 'normal'}; src: url("${f.href}"); }`
  );
  return `\n/* The font chosen when the book was made. A reading app may still offer its own. */\n${faces.join('\n')}\nbody { font-family: ${family}; }\n`;
}

function contentOpf(
  meta: EpubMeta,
  sections: readonly EpubSection[],
  images: readonly EpubImage[],
  font?: EpubFont
): string {
  const manifest = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="style" href="style.css" media-type="text/css"/>',
    ...sections.map(
      (s) =>
        `    <item id="${escapeXml(s.id)}" href="${escapeXml(sectionHref(s.id))}" media-type="application/xhtml+xml"/>`
    ),
    ...images.map(
      (img, i) => `    <item id="img${i}" href="${escapeXml(img.href)}" media-type="${escapeXml(img.mediaType)}"/>`
    ),
    ...(font?.faces ?? []).map(
      (f, i) => `    <item id="font${i}" href="${escapeXml(f.href)}" media-type="${escapeXml(f.mediaType)}"/>`
    ),
  ];
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(meta.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(meta.identifier)}</dc:identifier>
    <dc:title>${escapeXml(meta.title)}</dc:title>
    <dc:language>${escapeXml(meta.language)}</dc:language>
${meta.author ? `    <dc:creator>${escapeXml(meta.author)}</dc:creator>\n` : ''}${
  meta.publisher ? `    <dc:publisher>${escapeXml(meta.publisher)}</dc:publisher>\n` : ''
}${meta.publicationDate ? `    <dc:date>${escapeXml(meta.publicationDate)}</dc:date>\n` : ''}    <meta property="dcterms:modified">${escapeXml(meta.modified)}</meta>
  </metadata>
  <manifest>
${manifest.join('\n')}
  </manifest>
  <spine>
${sections.map((s) => `    <itemref idref="${escapeXml(s.id)}"/>`).join('\n')}
  </spine>
</package>
`;
}

/**
 * `nav.xhtml` — the table of contents, and the only one EPUB 3 needs.
 *
 * No NCX: that exists for EPUB 2 readers, and nothing we care about is one. Sub-headings nest inside their
 * section's entry, because a long section with no sub-entries is hard to move around in — and the reader's TOC
 * panel already handles nesting.
 */
function navXhtml(meta: EpubMeta, sections: readonly EpubSection[]): string {
  const entry = (s: EpubSection): string => {
    const kids = s.children?.length
      ? `\n<ol>\n${s.children
          .map(
            (c) => `<li><a href="${escapeXml(sectionHref(s.id))}#${escapeXml(c.anchor)}">${escapeXml(c.title)}</a></li>`
          )
          .join('\n')}\n</ol>\n`
      : '';
    return `<li><a href="${escapeXml(sectionHref(s.id))}">${escapeXml(s.title)}</a>${kids}</li>`;
  };
  const body = `<nav epub:type="toc" id="toc">
<h1>${escapeXml(meta.title)}</h1>
<ol>
${sections.map(entry).join('\n')}
</ol>
</nav>`;
  // The nav needs the epub namespace for `epub:type`, which the plain document wrapper does not declare.
  return xhtmlDocument(meta.title, meta.language, body).replace(
    '<html xmlns="http://www.w3.org/1999/xhtml"',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"'
  );
}

/**
 * What every entry in the archive is stamped with.
 *
 * **The zip's own clock is the last thing in here that was not passed in.** `fflate` stamps each entry with
 * `Date.now()` when no `mtime` is given, and a DOS timestamp has two-second resolution — so two builds of the same
 * book differed in a handful of bytes whenever they straddled a boundary, which is what made
 * `is byte-identical for the same input` fail about once in twenty-five runs with nothing to reproduce it.
 *
 * Pinned rather than threaded through as another parameter, because the stamp carries no information: EPUB 3
 * requires `dcterms:modified` in the package document and that IS passed in, so when the book was made is already
 * recorded where a reader can see it. What pinning buys is that **regenerating an unchanged book produces an
 * identical file** — nothing to re-sync, nothing to re-index, and a diff that says what actually changed.
 *
 * **Mid-1980, not 1 January 1980.** `fflate` derives the DOS fields from the LOCAL calendar — `getFullYear()` and
 * the rest — and rejects anything outside 1980–2099. The zip epoch itself is therefore unusable west of Greenwich:
 * 1980-01-01T00:00Z is 1979 in New York, and the builder threw `date not in range`. Noon on 1 July is 1980 in every
 * timezone on earth. (The bytes still differ between timezones, which is fine: what the test asks, and what a
 * regeneration needs, is that one machine builds the same book the same way twice.)
 */
const ZIP_EPOCH = Date.UTC(1980, 6, 1, 12);

/**
 * The finished archive.
 *
 * **`mimetype` is written first and stored uncompressed**, which the spec requires and a reader is entitled to
 * reject an archive for getting wrong. `zipSync` preserves key insertion order and takes per-entry options, so
 * both halves of that are expressible — verified, not assumed.
 */
export function buildEpub(
  meta: EpubMeta,
  sections: readonly EpubSection[],
  images: readonly EpubImage[] = [],
  /** A font to embed and set the book's text in — see `epub-font.ts`. */
  font?: EpubFont
): Uint8Array {
  const enc = new TextEncoder();
  const at = { mtime: ZIP_EPOCH };
  const files: Record<string, [Uint8Array, { level?: 0; mtime: number }]> = {
    mimetype: [enc.encode('application/epub+zip'), { level: 0, mtime: ZIP_EPOCH }],
    'META-INF/container.xml': [enc.encode(CONTAINER_XML), at],
    [`${ROOT}/content.opf`]: [enc.encode(contentOpf(meta, sections, images, font)), at],
    [`${ROOT}/nav.xhtml`]: [enc.encode(navXhtml(meta, sections)), at],
    [`${ROOT}/style.css`]: [enc.encode(EPUB_STYLESHEET + (font ? fontCss(font) : '')), at],
  };
  for (const s of sections) files[`${ROOT}/${sectionHref(s.id)}`] = [enc.encode(s.xhtml), at];
  for (const img of images) files[`${ROOT}/${img.href}`] = [img.data, at];
  for (const f of font?.faces ?? []) files[`${ROOT}/${f.href}`] = [f.data, at];
  return zipSync(files);
}

/**
 * How a rebuilt book differs from the one already at its path — what the replace prompt is decided from.
 *
 * - `identical`: nothing to write.
 * - `same-text`: its details changed (author, title, an image's bytes) but not one word or element of its text, so
 *   every saved position still points where it did. Written without asking.
 * - `text-changed`: a chapter, or the order of chapters, differs. Annotations and reading progress are positions in
 *   that text, so those in or after a change may land in the wrong place. Also the answer for anything that is not
 *   an archive this could read — a file someone else made, with this name.
 *
 * **The book, not the notes' dates.** A note's date says nothing about whether the book has its text — a sync can
 * deliver an older edit after the book was made — and the same note converts to different text when the chapter
 * breaks change, a note it embeds changes, or the converter does. Comparing what the positions point into answers
 * all of those at once. Possible because a build is repeatable byte for byte (`ZIP_EPOCH`), apart from the two
 * fields stripped here.
 */
export type EpubChange = 'identical' | 'same-text' | 'text-changed';

/** A comparison, and — for the debug log — the first file in the book that made it what it is. */
export interface EpubComparison {
  change: EpubChange;
  differs?: string;
}

export function compareEpubs(old: Uint8Array, next: Uint8Array): EpubComparison {
  let before: Record<string, Uint8Array>;
  let after: Record<string, Uint8Array>;
  try {
    before = unzipSync(old);
    after = unzipSync(next);
  } catch {
    return { change: 'text-changed', differs: '(the file there is not a readable archive)' };
  }
  const dec = new TextDecoder();
  const opf = `${ROOT}/content.opf`;
  const spine = (files: Record<string, Uint8Array>): string =>
    /<spine>[\s\S]*<\/spine>/.exec(dec.decode(files[opf] ?? new Uint8Array()))?.[0] ?? '';
  // The text a position can point into: every chapter document, and their order. Not the contents page.
  const chapters = (files: Record<string, Uint8Array>): string[] =>
    Object.keys(files)
      .filter((k) => k.endsWith('.xhtml') && k !== `${ROOT}/nav.xhtml`)
      .sort();
  const names = chapters(after);
  if (!spine(after) || spine(before) !== spine(after)) return { change: 'text-changed', differs: 'the spine' };
  if (names.join('\n') !== chapters(before).join('\n')) return { change: 'text-changed', differs: 'the chapter files' };
  const chapter = names.find((k) => !sameBytes(before[k], after[k]));
  if (chapter) return { change: 'text-changed', differs: chapter };

  // Everything else, with the two fields that differ on every build taken out of the package document.
  const stamp = (files: Record<string, Uint8Array>): Record<string, Uint8Array> => ({
    ...files,
    [opf]: new TextEncoder().encode(
      dec
        .decode(files[opf])
        .replace(/<dc:identifier id="bookid">[^<]*</, '<dc:identifier id="bookid"><')
        .replace(/<meta property="dcterms:modified">[^<]*</, '<meta property="dcterms:modified"><')
    ),
  });
  const a = stamp(before);
  const b = stamp(after);
  const keys = Object.keys(b);
  const other = keys.length === Object.keys(a).length ? keys.find((k) => !sameBytes(a[k], b[k])) : '(the file list)';
  return other ? { change: 'same-text', differs: other } : { change: 'identical' };
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
