import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { buildEpub, compareEpubs, type EpubMeta, type EpubSection, escapeXml, xhtmlDocument } from '../epub-builder';

const meta: EpubMeta = {
  title: 'Sample Book & Another Book',
  author: 'Orbis Tester',
  language: 'en',
  identifier: 'urn:uuid:11111111-2222-3333-4444-555555555555',
  modified: '2026-08-04T12:00:00Z',
};

const sections: EpubSection[] = [
  { id: 'sect1', title: 'Chapter One', xhtml: xhtmlDocument('Chapter One', 'en', '<h1>Chapter One</h1><p>Hi.</p>') },
  {
    id: 'sect2',
    title: 'Chapter Two',
    xhtml: xhtmlDocument('Chapter Two', 'en', '<h1>Chapter Two</h1><h2 id="a">Part A</h2>'),
    children: [{ anchor: 'a', title: 'Part A' }],
  },
];

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const open = (zip: Uint8Array) => unzipSync(zip);

describe('the archive', () => {
  const zip = buildEpub(meta, sections);

  it('writes mimetype FIRST and stored uncompressed', () => {
    // Both halves are required by the spec, and a reader may reject the archive for either. The local file header
    // starts at byte 0: the compression method is a u16 at offset 8, the name begins at offset 30.
    expect(text(zip.slice(30, 38))).toBe('mimetype');
    expect(zip[8] | (zip[9] << 8)).toBe(0);
  });

  it('holds exactly the parts a reader looks for', () => {
    const names = Object.keys(open(zip));
    expect(names).toContain('META-INF/container.xml');
    expect(names).toContain('OEBPS/content.opf');
    expect(names).toContain('OEBPS/nav.xhtml');
    expect(names).toContain('OEBPS/style.css');
    expect(names).toContain('OEBPS/sect1.xhtml');
  });

  it('points container.xml at the package document', () => {
    expect(text(open(zip)['META-INF/container.xml'])).toContain('full-path="OEBPS/content.opf"');
  });

  it('is byte-identical for the same input', () => {
    // Nothing inside generates an id or reads the clock — both are passed in. Without that this package could not
    // be tested at all, and a regeneration would differ from its predecessor for no reason.
    expect(buildEpub(meta, sections)).toEqual(zip);
  });

  /**
   * **The clock read one level down.** `fflate` stamps every zip entry with `Date.now()` unless given an `mtime`,
   * and a DOS timestamp has two-second resolution — so two unpinned builds that straddle a boundary differ, and the
   * assertion above would fail only intermittently.
   *
   * Moving the clock between the builds is what makes that failure deterministic: an unpinned rebuild differs once a
   * boundary passes, and a pinned one does not.
   */
  it('is byte-identical even when the clock moves between builds', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-18T09:00:00Z'));
      const first = buildEpub(meta, sections);
      vi.setSystemTime(new Date('2026-08-18T09:00:30Z'));
      expect(buildEpub(meta, sections)).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the package document', () => {
  const opf = text(open(buildEpub(meta, sections))['OEBPS/content.opf']);

  it('carries the three fields EPUB requires, and wires the identifier up', () => {
    expect(opf).toContain('unique-identifier="bookid"');
    expect(opf).toContain(`<dc:identifier id="bookid">${meta.identifier}</dc:identifier>`);
    expect(opf).toContain('<dc:language>en</dc:language>');
    expect(opf).toContain('<meta property="dcterms:modified">2026-08-04T12:00:00Z</meta>');
  });

  it('escapes the title, which would otherwise produce an unparseable package', () => {
    // A title with an ampersand is not an edge case; a bare `&` makes the whole book look corrupt rather than
    // badly titled.
    expect(opf).toContain('<dc:title>Sample Book &amp; Another Book</dc:title>');
    expect(opf).not.toContain('Sample Book & Another Book');
  });

  it('names the author when there is one', () => {
    expect(opf).toContain('<dc:creator>Orbis Tester</dc:creator>');
  });

  it('omits dc:creator entirely rather than writing an empty one', () => {
    const anon = text(open(buildEpub({ ...meta, author: '' }, sections))['OEBPS/content.opf']);
    expect(anon).not.toContain('dc:creator');
  });

  it('spines the sections in order', () => {
    const order = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['sect1', 'sect2']);
  });

  it('manifests the nav with the property a reader finds it by', () => {
    expect(opf).toContain('properties="nav"');
  });
});

describe('the nav', () => {
  const nav = text(open(buildEpub(meta, sections))['OEBPS/nav.xhtml']);

  it('declares the epub namespace its own epub:type needs', () => {
    expect(nav).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
    expect(nav).toContain('epub:type="toc"');
  });

  it('links each section', () => {
    expect(nav).toContain('<a href="sect1.xhtml">Chapter One</a>');
  });

  it('nests sub-headings inside their section, pointing at the anchor', () => {
    // A long section with no sub-entries is hard to move around in, and the reader's TOC panel handles nesting.
    expect(nav).toContain('<a href="sect2.xhtml#a">Part A</a>');
  });

  it('leaves a section with no children flat', () => {
    const first = nav.slice(nav.indexOf('sect1.xhtml'), nav.indexOf('sect2.xhtml'));
    expect(first).not.toContain('<ol>');
  });
});

describe('content documents', () => {
  it('are XHTML — declaration, namespace, and the language declared both ways', () => {
    const doc = xhtmlDocument('T', 'fr', '<p>Bonjour.</p>');
    expect(doc.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(doc).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(doc).toContain('xml:lang="fr"');
    expect(doc).toContain('lang="fr"');
  });

  it('link the stylesheet as a sibling, since everything sits flat in OEBPS/', () => {
    expect(xhtmlDocument('T', 'en', '')).toContain('href="style.css"');
  });
});

describe('the stylesheet', () => {
  const css = text(open(buildEpub(meta, sections))['OEBPS/style.css']);

  it('declares NO colour but currentColor', () => {
    // Orbis styles the page. A color hardcoded here is baked into every book already generated and cannot be
    // fixed by updating the plugin — so this is a one-way door, and the test is the door.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|hsl)a?\(/);
    expect(css).not.toMatch(/:\s*(white|black|gray|grey|red|blue|green)\b/);
    expect(css).toContain('currentColor');
  });

  it('lets links inherit the page colour rather than the UA blue', () => {
    // A fixed link color is the same one-way door as any other: unreadable on a dark theme and baked into every
    // book already made. The underline is what keeps them distinguishable without one.
    expect(css).toContain('a { color: inherit; text-decoration: underline; }');
  });

  it('makes unfittable content BREAK rather than overflow', () => {
    // The paginator lays the book out in CSS columns, so anything wider than a column is painted over its
    // neighbor — text superimposed on text, not clipped and not scrollable. `overflow-x` does nothing there.
    expect(css).toContain('body { overflow-wrap: break-word; }');
    expect(css).toContain('word-break: break-word');
    expect(css).not.toContain('overflow-x');
  });
});

describe('images', () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const zip = buildEpub(meta, sections, [{ href: 'images/d.png', mediaType: 'image/png', data: png }]);

  it('land in the archive and are manifested with their media type', () => {
    expect(open(zip)['OEBPS/images/d.png']).toEqual(png);
    expect(text(open(zip)['OEBPS/content.opf'])).toContain('href="images/d.png" media-type="image/png"');
  });
});

describe('an embedded font', () => {
  const ttf = new Uint8Array([0, 1, 0, 0]);
  const font = {
    family: 'Literata',
    faces: [
      { href: 'fonts/Literata-Regular.ttf', mediaType: 'font/ttf', data: ttf, weight: 400, italic: false },
      { href: 'fonts/Literata-BoldItalic.ttf', mediaType: 'font/ttf', data: ttf, weight: 700, italic: true },
    ],
  };
  const files = open(buildEpub(meta, sections, [], font));
  const css = text(files['OEBPS/style.css']);

  it('lands in the archive, manifested as a core font type', () => {
    expect(files['OEBPS/fonts/Literata-Regular.ttf']).toEqual(ttf);
    const opf = text(files['OEBPS/content.opf']);
    expect(opf).toContain('<item id="font0" href="fonts/Literata-Regular.ttf" media-type="font/ttf"/>');
    expect(opf).toContain('<item id="font1" href="fonts/Literata-BoldItalic.ttf" media-type="font/ttf"/>');
  });

  it('is declared face by face, and sets the body', () => {
    expect(css).toContain(
      '@font-face { font-family: "Literata"; font-weight: 400; font-style: normal; src: url("fonts/Literata-Regular.ttf"); }'
    );
    expect(css).toContain('font-weight: 700; font-style: italic; src: url("fonts/Literata-BoldItalic.ttf");');
    expect(css).toContain('body { font-family: "Literata"; }');
  });

  it('still declares no colour, and leaves code monospace', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toContain('code { font-family: monospace;');
  });

  it('is left out entirely when none is chosen', () => {
    const plain = open(buildEpub(meta, sections));
    expect(Object.keys(plain).some((k) => k.includes('fonts/'))).toBe(false);
    expect(text(plain['OEBPS/style.css'])).not.toContain('@font-face');
  });

  it('changes the book without moving a saved position', () => {
    // Positions point into the chapters, which a font does not touch: replacing the book need not ask.
    expect(compareEpubs(buildEpub(meta, sections), buildEpub(meta, sections, [], font)).change).toBe('same-text');
  });
});

describe('escapeXml', () => {
  it('covers all five, so an attribute value is safe too', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});

/** Whether rebuilding a book can move the positions saved in it — which decides whether replacing it asks first. */
describe('compareEpubs', () => {
  const rebuilt = {
    ...meta,
    identifier: 'urn:uuid:99999999-2222-3333-4444-555555555555',
    modified: '2026-10-03T12:00:00Z',
  };
  const change = (old: Uint8Array, next: Uint8Array) => compareEpubs(old, next).change;

  it('calls a rebuild identical when only the identifier and the modified stamp differ', () => {
    expect(compareEpubs(buildEpub(meta, sections), buildEpub(rebuilt, sections))).toEqual({ change: 'identical' });
  });

  it('calls a changed author the same text, since no position can move', () => {
    const r = compareEpubs(buildEpub(meta, sections), buildEpub({ ...rebuilt, author: 'Someone Else' }, sections));
    expect(r).toEqual({ change: 'same-text', differs: 'OEBPS/content.opf' });
  });

  it('calls one changed word a changed text, and names the chapter', () => {
    const edited = sections.map((s) =>
      s.id === 'sect1' ? { ...s, xhtml: xhtmlDocument('Chapter One', 'en', '<h1>Chapter One</h1><p>Hello.</p>') } : s
    );
    expect(compareEpubs(buildEpub(meta, sections), buildEpub(rebuilt, edited))).toEqual({
      change: 'text-changed',
      differs: 'OEBPS/sect1.xhtml',
    });
  });

  it('calls a chapter more, or chapters in another order, a changed text', () => {
    const before = buildEpub(meta, sections);
    expect(change(before, buildEpub(rebuilt, sections.slice(0, 1)))).toBe('text-changed');
    expect(change(before, buildEpub(rebuilt, [sections[1], sections[0]]))).toBe('text-changed');
  });

  it('calls a file it cannot read a changed text, so replacing it still asks', () => {
    expect(change(new TextEncoder().encode('not a zip'), buildEpub(meta, sections))).toBe('text-changed');
  });
});
