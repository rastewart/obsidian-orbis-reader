// A book's shape — its spine and flat contents — as `src/__tests__/chapter-rows.test.ts` reads it.
//
// The shapes are read from the generated fixtures, so the test runs on books that are in the repository, and a change
// to a fixture changes the shape the test sees.
//
// **The same paths foliate uses.** A spine entry's `id` is the file's full path in the archive
// (`OEBPS/chapter-1.xhtml`, or `titlepage.xhtml` when the package document is at the root), and every contents `href`
// is resolved to that same form, with its fragment. That is what `hrefToSectionIndex` matches against.

import { strFromU8, unzipSync } from 'fflate';

export interface Shape {
  spine: { id: string; linear: boolean }[];
  toc: { depth: number; label: string; href: string }[];
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? '';
const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

function resolve(fromDir: string, href: string): string {
  const [path, frag] = href.split('#');
  const parts = (fromDir ? `${fromDir}/${path}` : path).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/') + (frag !== undefined ? `#${frag}` : '');
}

/** The spine and contents of an EPUB, from its bytes. EPUB 3's nav is preferred, the NCX used when there is none. */
export function shapeOf(epub: Uint8Array): Shape {
  const zip = unzipSync(epub);
  const text = (p: string) => strFromU8(zip[p]);
  const opfPath = attr(/<rootfile\b[^>]*>/.exec(text('META-INF/container.xml'))?.[0] ?? '', 'full-path');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const opf = text(opfPath);
  const items = new Map<string, { href: string; props: string; type: string }>();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    items.set(attr(m[0], 'id'), {
      href: attr(m[0], 'href'),
      props: attr(m[0], 'properties'),
      type: attr(m[0], 'media-type'),
    });
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*>/g)].map((m) => ({
    id: resolve(opfDir, unescapeXml(items.get(attr(m[0], 'idref'))?.href ?? '')),
    linear: attr(m[0], 'linear') !== 'no',
  }));

  const toc: Shape['toc'] = [];
  const nav = [...items.values()].find((i) => i.props.split(' ').includes('nav'));
  if (nav) {
    const navPath = resolve(opfDir, nav.href);
    const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/')) : '';
    const doc = text(navPath);
    const tocNav = /<nav\b[^>]*epub:type="toc"[^>]*>([\s\S]*?)<\/nav>/.exec(doc)?.[1] ?? '';
    let depth = 0;
    for (const m of tocNav.matchAll(/<ol\b[^>]*>|<\/ol>|<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      if (m[0].startsWith('<ol')) depth++;
      else if (m[0] === '</ol>') depth--;
      else
        toc.push({
          depth,
          label: unescapeXml(m[2].replace(/<[^>]+>/g, '').trim()),
          href: resolve(navDir, unescapeXml(m[1])),
        });
    }
  } else {
    const ncx = [...items.values()].find((i) => i.type === 'application/x-dtbncx+xml');
    if (!ncx) throw new Error('book has neither a nav document nor an NCX');
    const ncxPath = resolve(opfDir, ncx.href);
    const ncxDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/')) : '';
    let depth = 0;
    for (const m of text(ncxPath).matchAll(
      /<navPoint\b[^>]*>|<\/navPoint>|<text>([\s\S]*?)<\/text>|<content\b[^>]*src="([^"]*)"[^>]*\/?>/g
    )) {
      if (m[0].startsWith('<navPoint')) depth++;
      else if (m[0] === '</navPoint>') depth--;
      else if (m[1] !== undefined && depth > 0) toc.push({ depth, label: unescapeXml(m[1].trim()), href: '' });
      else if (m[2] !== undefined && depth > 0) toc[toc.length - 1].href = resolve(ncxDir, unescapeXml(m[2]));
    }
  }
  return { spine, toc };
}
