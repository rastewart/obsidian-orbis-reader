// **The four exports pick between chapters from one list, and this is what says so.**
//
// Export to vault, Generate notes and both halves of Save as PDF all ask the same question — which chapters does
// this book have — and must answer it the same way. A list keyed on spine index would offer a book with its
// chapters many to a file as a few rows each holding several chapters, so one tick would take twelve and "only
// chapter 1" could not be asked for.
//
// "They agree" is not a property a reader can check by looking, so it is checked here, over the shapes of twenty-six
// books: the generated fixtures in test-vault/fixtures, read from their spine and nav by `pnpm build:fixtures`. Each
// one reproduces a contents shape found in real books (see scripts/fixtures/books.ts and findings.ts), so the two
// implementations are compared on structures they meet, not only on ones a unit test thought to write down.

import { describe, expect, it } from 'vitest';
import { exportRows } from '../BookExportModal';
import { sectionKeyOf } from '../book-extractor';
import { chapterRowsFrom } from '../marks-pdf';
import { markTocSections, type TocItemLike } from '../toc-utils';
import shapes from './fixtures/book-shapes.json';

type FlatEntry = { depth: number; label: string; href: string };
type Shape = { spine: { id: string; linear: boolean }[]; toc: FlatEntry[] };

/** The flat, depth-tagged nav a book carries, back into the nested shape both callers take. */
function nest(flat: readonly FlatEntry[]): TocItemLike[] {
  const roots: TocItemLike[] = [];
  const stack: { depth: number; node: TocItemLike }[] = [];
  for (const e of flat) {
    const node: TocItemLike = { label: e.label, href: e.href };
    while (stack.length && stack[stack.length - 1].depth >= e.depth) stack.pop();
    if (stack.length) (stack[stack.length - 1].node.subitems ??= []).push(node);
    else roots.push(node);
    stack.push({ depth: e.depth, node });
  }
  return roots;
}

/**
 * `hrefToSectionIndex`, as `LocationIndex` implements it — the resolver BOTH lists must use.
 *
 * The full path, then the basename, then a scan of the section ids; `kindle:pos:` refused outright because it is
 * calibrated at runtime. Not `sectionHrefMap.get(path)`, which resolves for an EPUB and for nothing else: MOBI, AZW3
 * and FB2 number their sections, so every chapter would fall through to being unlisted.
 */
function resolverFor(spine: readonly { id: string }[]) {
  const byPath = new Map(spine.map((s, i) => [s.id, i]));
  return (href: string | undefined): number => {
    if (!href) return -1;
    if (/^kindle:pos:/i.test(href)) return -1;
    const clean = href.split('#')[0];
    const basename = clean.split('/').pop() ?? clean;
    const fromMap = byPath.get(clean) ?? byPath.get(basename);
    if (fromMap !== undefined) return fromMap;
    return spine.findIndex((s) => s.id.split('/').pop() === basename || s.id === clean);
  };
}

/** The contents as the reader view holds it: nested, and each entry marked with its file — see `containsChapters`. */
function tocOf(shape: Shape): TocItemLike[] {
  const toc = nest(shape.toc);
  markTocSections(toc, resolverFor(shape.spine));
  return toc;
}

/** What Export to vault lists, through the real `exportRows`. */
function vaultRows(shape: Shape): { key: string; label: string; unlisted: boolean }[] {
  const toc = tocOf(shape);
  const sectionIndexOf = resolverFor(shape.spine);
  const view = {
    bookToc: toc,
    bookSectionsPublic: shape.spine.map((s) => ({ id: s.id })),
    hrefToSectionIndex: sectionIndexOf,
    // No headings are measured for these shapes, so nothing continues — which is what the view answers too, until
    // the location index has read the book. `continuationSections` has tests of its own.
    sectionContinues: () => false,
  } as unknown as Parameters<typeof exportRows>[0];
  return exportRows(view).rows.map((r) => ({ key: r.href, label: r.label, unlisted: r.unlisted }));
}

/** What Save as PDF lists, through the real `chapterRowsFrom`. */
function pdfRows(shape: Shape): { key: string; label: string; unlisted: boolean }[] {
  return chapterRowsFrom({
    toc: tocOf(shape),
    // `createDocument` present on every section: the fixtures record the spine, and a section that will not
    // render is a runtime fact no captured shape can carry. `linear` goes over as foliate hands it — the string
    // 'no', never `false` — so a list that started skipping non-linear sections would fail here (see
    // `RawSection.linear`).
    sections: shape.spine.map((s) => ({
      id: s.id,
      linear: s.linear ? undefined : 'no',
      createDocument: () => undefined,
    })),
    sectionIndexOf: resolverFor(shape.spine),
    sectionKey: sectionKeyOf,
  }).rows.map((r) => ({ key: r.key, label: r.title, unlisted: r.unlisted }));
}

const books = Object.entries(shapes as Record<string, Shape>);

describe('the chapter list every export picks from', () => {
  it('has all twenty-six books to compare', () => {
    expect(books.length).toBe(26);
  });

  for (const [name, shape] of books) {
    it(`is the same list for both exports — ${name}`, () => {
      const vault = vaultRows(shape);
      const pdf = pdfRows(shape);
      // Keys first: a mismatch here is two different notions of what a row IS, which is the whole point.
      expect(pdf.map((r) => r.key)).toEqual(vault.map((r) => r.key));
      expect(pdf.map((r) => r.unlisted)).toEqual(vault.map((r) => r.unlisted));
    });
  }

  /**
   * The labels are allowed to differ in exactly one place and it is worth pinning which: Export to vault names an
   * unlisted row "Section N" up front and replaces it once the section has been read, while Save as PDF leaves it
   * empty for the same later pass to fill. Every row the contents page names carries the same text in both.
   */
  for (const [name, shape] of books) {
    it(`names every contents-page row identically — ${name}`, () => {
      const vault = vaultRows(shape).filter((r) => !r.unlisted);
      const pdf = pdfRows(shape).filter((r) => !r.unlisted);
      expect(pdf.map((r) => r.label)).toEqual(vault.map((r) => r.label));
    });
  }
});

describe('what the shapes actually contain, so the comparison is not vacuous', () => {
  it('covers a book whose chapters live many-to-a-file', () => {
    // `running-header`: 7 spine files, more than 30 top-level entries. The case a spine-keyed list cannot express.
    const rows = pdfRows((shapes as Record<string, Shape>)['running-header.epub']);
    expect(rows.filter((r) => !r.unlisted).length).toBeGreaterThan(30);
  });

  it('covers a book with spine sections the contents never reaches', () => {
    // `volumes`: four plate pages after the last entry, none of them listed.
    const rows = pdfRows((shapes as Record<string, Shape>)['volumes.epub']);
    expect(rows.some((r) => r.unlisted)).toBe(true);
  });

  it('opens an entry that contains the chapters, as both exports do', () => {
    // `annotation-workhorse`: 28 entries, 2 of them top-level, and all 26 chapters under the second — the title as a
    // heading. As "a top-level entry and its subtree" the whole book would be one row; the title heading contains
    // chapters spread over five files, so it opens, and keeps a row of its own that the exports treat as a divider.
    const shape = (shapes as Record<string, Shape>)['annotation-workhorse.epub'];
    expect(shape.toc.length).toBeGreaterThan(20);
    const rows = vaultRows(shape).filter((r) => !r.unlisted);
    expect(rows.length).toBe(28);
    expect(rows.map((r) => r.label)).toContain('THE NIGHT FERRY');
  });

  it('covers a contents page with no fragments at all', () => {
    const shape = (shapes as Record<string, Shape>)['hostile-scripts.epub'];
    expect(shape.toc.every((e) => !e.href.includes('#'))).toBe(true);
    expect(pdfRows(shape).length).toBeGreaterThan(0);
  });

  // `trilogy-parts`: each novel's title sits BESIDE its parts, which hold the chapters. A structure word used to lend
  // its name to the next unique entry, so the second novel was named after the first novel's last Part.
  it('names a novel beside its parts plainly, and the parts’ chapters after them', () => {
    const labels = vaultRows((shapes as Record<string, Shape>)['trilogy-parts.epub']).map((r) => r.label);
    expect(labels).toContain('The Harbor Wall');
    expect(labels).toContain('Acknowledgments');
    expect(labels).toContain('The Harbor Wall – Dedication');
    expect(labels).toContain('Part II: “The Bell Tower” – 4');
    expect(labels.some((l) => /^Part .* – (The Harbor Wall|The Weir at Dusk|Acknowledgments)$/.test(l))).toBe(false);
  });

  it('offers a non-linear section in both lists', () => {
    // `footnotes`: its last spine file is `linear="no"`. Foliate hands `linear` over as the string 'no', never
    // `false`, and skipping such a section would lose an FB2 book's notes body. Both offer it; see
    // `RawSection.linear`.
    const shape = (shapes as Record<string, Shape>)['footnotes.epub'];
    const nonLinear = shape.spine.find((s) => !s.linear)?.id ?? '';
    expect(nonLinear).toMatch(/nonlinear\.xhtml$/);
    expect(vaultRows(shape).map((r) => r.key)).toContain(nonLinear);
    expect(pdfRows(shape).map((r) => r.key)).toContain(nonLinear);
  });
});
