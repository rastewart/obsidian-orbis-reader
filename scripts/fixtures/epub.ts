// A low-level EPUB writer for the generated fixtures.
//
// **Why not `src/epub-builder.ts`.** That builder writes the books Orbis makes from notes: one file per section and
// a contents two levels deep, which is right for its job. A fixture has to be able to be any book Orbis meets — a
// contents tree of any depth, entries out of spine order, files the contents never reaches, several entries in one
// file, EPUB 2 with only an NCX, a package document at the root the way Calibre writes it. So this takes every one of
// those as input instead of deriving them.
//
// **Byte-identical rebuilds.** Entries are stamped with the same fixed date `epub-builder.ts` uses (see `ZIP_EPOCH`
// there for why mid-1980), and `mimetype` is written first and stored — the spec requires both.

import { unzipSync, zipSync } from 'fflate';
import { FIXTURE_DESCRIPTION, FIXTURE_PUBLISHER } from './marker';
import { esc } from './prose';

/** Mid-1980, as in `src/epub-builder.ts`: fflate reads the local calendar and rejects anything before 1980. */
const ZIP_EPOCH = Date.UTC(1980, 6, 1, 12);

export interface EpubFile {
  /** Path relative to the package document's folder. */
  path: string;
  mediaType: string;
  content: string | Uint8Array;
  /** Manifest id; derived from the path when absent. */
  id?: string;
  /** EPUB 3 manifest `properties` — `cover-image`, `nav`. */
  properties?: string;
}

export interface NavEntry {
  label: string;
  /** Relative to the package document's folder, with an optional `#fragment`. */
  href: string;
  children?: NavEntry[];
}

export interface Creator {
  name: string;
  /** "Surname, Given", as Calibre writes `opf:file-as`. */
  fileAs?: string;
}

export interface EpubSpec {
  /** 3 writes a nav document (and an NCX too, like most real books); 2 writes only an NCX. */
  version: 2 | 3;
  /** The package document's folder: `OEBPS` for most books, `''` for Calibre's root layout. */
  opfDir: string;
  title: string;
  creators: Creator[];
  language?: string;
  identifier: string;
  publisher?: string;
  date?: string;
  /** Written as `calibre:series` / `calibre:series_index`. */
  series?: { name: string; index: number };
  files: EpubFile[];
  /** Paths of `files` in reading order, with `linear="no"` where asked. */
  spine: { path: string; linear?: boolean }[];
  nav: NavEntry[];
  /** The path of the cover image in `files`, if there is one. */
  coverImage?: string;
}

const idOf = (p: string) => `f-${p.replace(/[^A-Za-z0-9]+/g, '-')}`;
const join = (dir: string, p: string) => (dir ? `${dir}/${p}` : p);

/** A complete XHTML content document. `head` is extra markup for the head, such as a `<style>` or `<link>`. */
export function xhtml(
  title: string,
  body: string,
  head = '<link rel="stylesheet" type="text/css" href="style.css"/>'
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

function opf(spec: EpubSpec, navPath: string | null, ncxPath: string): string {
  const v3 = spec.version === 3;
  const creators = spec.creators
    .map((c, i) =>
      v3
        ? `<dc:creator id="creator${i}">${esc(c.name)}</dc:creator>${
            c.fileAs ? `\n    <meta refines="#creator${i}" property="file-as">${esc(c.fileAs)}</meta>` : ''
          }`
        : `<dc:creator opf:role="aut"${c.fileAs ? ` opf:file-as="${esc(c.fileAs)}"` : ''}>${esc(c.name)}</dc:creator>`
    )
    .join('\n    ');
  const meta = [
    `<dc:title>${esc(spec.title)}</dc:title>`,
    creators,
    `<dc:language>${esc(spec.language ?? 'en')}</dc:language>`,
    `<dc:identifier id="bookid">${esc(spec.identifier)}</dc:identifier>`,
    `<dc:publisher>${esc(spec.publisher ?? FIXTURE_PUBLISHER)}</dc:publisher>`,
    `<dc:description>${esc(FIXTURE_DESCRIPTION)}</dc:description>`,
    spec.date ? `<dc:date>${esc(spec.date)}</dc:date>` : '',
    v3 ? '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>' : '',
    spec.series ? `<meta name="calibre:series" content="${esc(spec.series.name)}"/>` : '',
    spec.series ? `<meta name="calibre:series_index" content="${spec.series.index}"/>` : '',
    spec.coverImage ? `<meta name="cover" content="${idOf(spec.coverImage)}"/>` : '',
  ]
    .filter(Boolean)
    .join('\n    ');
  const items = [
    ...spec.files.map((f) => {
      const props = [f.properties, f.path === spec.coverImage && v3 ? 'cover-image' : ''].filter(Boolean).join(' ');
      return `<item id="${f.id ?? idOf(f.path)}" href="${esc(f.path)}" media-type="${f.mediaType}"${
        props ? ` properties="${props}"` : ''
      }/>`;
    }),
    navPath ? `<item id="nav" href="${navPath}" media-type="application/xhtml+xml" properties="nav"/>` : '',
    `<item id="ncx" href="${ncxPath}" media-type="application/x-dtbncx+xml"/>`,
  ]
    .filter(Boolean)
    .join('\n    ');
  const spine = spec.spine
    .map((s) => {
      const f = spec.files.find((x) => x.path === s.path);
      if (!f) throw new Error(`spine names a file that is not in the book: ${s.path}`);
      return `<itemref idref="${f.id ?? idOf(f.path)}"${s.linear === false ? ' linear="no"' : ''}/>`;
    })
    .join('\n    ');
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${v3 ? '3.0' : '2.0'}" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    ${meta}
  </metadata>
  <manifest>
    ${items}
  </manifest>
  <spine toc="ncx">
    ${spine}
  </spine>
</package>
`;
}

function navDoc(spec: EpubSpec): string {
  const li = (e: NavEntry): string =>
    `<li><a href="${esc(e.href)}">${esc(e.label)}</a>${e.children?.length ? `<ol>${e.children.map(li).join('')}</ol>` : ''}</li>`;
  return xhtml(
    spec.title,
    `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${spec.nav.map(li).join('\n')}</ol></nav>`,
    ''
  );
}

function ncx(spec: EpubSpec): string {
  let order = 0;
  const point = (e: NavEntry): string => {
    order++;
    return `<navPoint id="np${order}" playOrder="${order}"><navLabel><text>${esc(e.label)}</text></navLabel><content src="${esc(
      e.href
    )}"/>${(e.children ?? []).map(point).join('')}</navPoint>`;
  };
  const depth = (es: NavEntry[]): number => Math.max(0, ...es.map((e) => 1 + depth(e.children ?? [])));
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${esc(spec.identifier)}"/><meta name="dtb:depth" content="${depth(spec.nav)}"/></head>
<docTitle><text>${esc(spec.title)}</text></docTitle>
<navMap>${spec.nav.map(point).join('\n')}</navMap>
</ncx>
`;
}

/** The finished archive. */
export function buildFixtureEpub(spec: EpubSpec): Uint8Array {
  const enc = new TextEncoder();
  const at = { mtime: ZIP_EPOCH };
  const navPath = spec.version === 3 ? 'nav.xhtml' : null;
  const ncxPath = 'toc.ncx';
  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${join(spec.opfDir, 'content.opf')}" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;
  const files: Record<string, [Uint8Array, { level?: 0; mtime: number }]> = {
    mimetype: [enc.encode('application/epub+zip'), { level: 0, mtime: ZIP_EPOCH }],
    'META-INF/container.xml': [enc.encode(container), at],
    [join(spec.opfDir, 'content.opf')]: [enc.encode(opf(spec, navPath, ncxPath)), at],
    [join(spec.opfDir, ncxPath)]: [enc.encode(ncx(spec)), at],
  };
  if (navPath) files[join(spec.opfDir, navPath)] = [enc.encode(navDoc(spec)), at];
  for (const f of spec.files) {
    files[join(spec.opfDir, f.path)] = [typeof f.content === 'string' ? enc.encode(f.content) : f.content, at];
  }
  return zipSync(files);
}

/**
 * The same archive with one entry's content swapped — `cover.png` in whichever folder the package sits — written the
 * same way, `mimetype` first and stored. For the Calibre sources, which differ from their book only in the cover.
 */
export function replaceEpubEntry(epub: Uint8Array, name: string, content: Uint8Array): Uint8Array {
  const entries: Record<string, Uint8Array> = unzipSync(epub);
  const target = Object.keys(entries).find((k) => k === name || k.endsWith(`/${name}`));
  if (!target) throw new Error(`replaceEpubEntry: no ${name} in the archive`);
  entries[target] = content;
  const files: Record<string, [Uint8Array, { level?: 0; mtime: number }]> = {
    mimetype: [entries.mimetype, { level: 0, mtime: ZIP_EPOCH }],
  };
  for (const [k, v] of Object.entries(entries)) if (k !== 'mimetype') files[k] = [v, { mtime: ZIP_EPOCH }];
  return zipSync(files);
}
