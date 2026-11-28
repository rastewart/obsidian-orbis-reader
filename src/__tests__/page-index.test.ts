// The page index, on the page-number fixtures as foliate reads them: which page targets are placed, where, and which
// page a position is on. See docs/design/page-numbers.md and `scripts/fixtures/books.ts` for what each book holds.
//
// The strongest check is the fixture's own index: each entry names the pages its words are printed on, so every place
// those words occur in the text must be on one of those pages, and on all of them between the occurrences.

import { unzipSync } from 'fflate';
import { EPUB } from 'foliate-js/epub.js';
import { fake as cfiFake, fromRange as cfiFromRange, joinIndir as cfiJoinIndir } from 'foliate-js/epubcfi.js';
import { describe, expect, it } from 'vitest';
import {
  type PageStart,
  pageAtCfi,
  pagesInOrder,
  pageTargetsBySection,
  pageTotal,
  placePageTargets,
} from '../reader/page-index';

// Node's file system, reached the way the other tests reach it: the plugin's types have no Node in them.
declare const process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string): Uint8Array } };
const fs = process.getBuiltinModule('node:fs');

/** Relative to the repository, where the tests run. */
const FIXTURES = 'test-vault/fixtures';

interface Section {
  id: string;
  cfi?: string;
  createDocument(): Promise<Document>;
}

interface Opened {
  pageList: Array<{ label?: string; href?: string }> | null;
  docs: Document[];
  bases: string[];
  sections: Section[];
}

async function open(file: string): Promise<Opened> {
  const entries = unzipSync(new Uint8Array(fs.readFileSync(`${FIXTURES}/${file}`)));
  const decoder = new TextDecoder();
  const book = (await new EPUB({
    loadText: async (name: string) => (entries[name] ? decoder.decode(entries[name]) : null),
    loadBlob: async (name: string) => (entries[name] ? new Blob([entries[name]]) : null),
    getSize: (name: string) => entries[name]?.length ?? 0,
  }).init()) as { pageList: Opened['pageList']; sections: Section[] };
  const docs = await Promise.all(book.sections.map((s) => s.createDocument()));
  const bases = book.sections.map((s, i) => s.cfi ?? cfiFake.fromIndex(i));
  return { pageList: book.pageList, docs, bases, sections: book.sections };
}

/** The page index as `LocationIndex` builds it, with a section lookup by path as its own does for an EPUB. */
function index(book: Opened): PageStart[] {
  const sectionOf = (href: string) => book.sections.findIndex((s) => s.id === href.split('#')[0]);
  const targets = pageTargetsBySection(book.pageList, sectionOf);
  const placed = new Map<number, string>();
  for (const [section, list] of targets) {
    for (const [i, cfi] of placePageTargets(book.docs[section], book.bases[section], list)) placed.set(i, cfi);
  }
  return pagesInOrder([...targets.values()].flat(), placed);
}

/** The CFI of a character in a section's text, counted from the start of its body. */
function cfiAt(book: Opened, section: number, char: number): string {
  const doc = book.docs[section];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = (n as Text).length;
    if (char < pos + len) {
      const range = doc.createRange();
      range.setStart(n, char - pos);
      range.collapse(true);
      return cfiJoinIndir(book.bases[section], cfiFromRange(range));
    }
    pos += len;
  }
  throw new Error(`no character ${char} in section ${section}`);
}

const sectionNamed = (book: Opened, name: string) => book.sections.findIndex((s) => s.id.endsWith(`/${name}`));
const textOf = (book: Opened, section: number) => book.docs[section].body.textContent ?? '';

/** The label of the page a character is on. */
function pageOf(book: Opened, pages: PageStart[], file: string, char: number): string | null {
  const at = pageAtCfi(pages, cfiAt(book, sectionNamed(book, file), char));
  return at === null ? null : pages[at].label;
}

describe('page-numbers.epub', async () => {
  const book = await open('page-numbers.epub');
  const pages = index(book);

  it('places every page of the list, in order: roman, 1 to 41 without 17, then [42]', () => {
    const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
    const numbered = Array.from({ length: 41 }, (_, i) => String(i + 1)).filter((l) => l !== '17');
    expect(pages.map((p) => p.label)).toEqual([...roman, ...numbered, '[42]']);
  });

  it('counts "of 41": the index counts, the unnumbered page after it does not', () => {
    expect(pageTotal(pages)).toBe(41);
  });

  it('has no page on the cover, which comes before page i', () => {
    expect(pageOf(book, pages, 'cover.xhtml', 0)).toBeNull();
  });

  it('starts a chapter that opens a page on that page, from its heading', () => {
    expect(pageOf(book, pages, 'chapter-1.xhtml', 0)).toBe('1');
    expect(pageOf(book, pages, 'chapter-2.xhtml', 0)).toBe('9');
    expect(pageOf(book, pages, 'chapter-5.xhtml', 0)).toBe('32');
    expect(pageOf(book, pages, 'title.xhtml', 0)).toBe('i');
  });

  it('puts a chapter that starts partway down a page on the page before it began', () => {
    expect(pageOf(book, pages, 'chapter-3.xhtml', 0)).toBe('24');
    const four = sectionNamed(book, 'chapter-4.xhtml');
    expect(pageOf(book, pages, 'chapter-4.xhtml', 0)).toBe('31');
    expect(pageOf(book, pages, 'chapter-4.xhtml', textOf(book, four).length - 1)).toBe('31');
  });

  it('turns the page inside a paragraph and inside a sentence, at the marker', () => {
    const one = sectionNamed(book, 'chapter-1.xhtml');
    const doc = book.docs[one];
    for (const label of ['3', '5']) {
      const marker = doc.getElementById(`page-${label}`);
      // The characters just before and just after the marker, in the same paragraph.
      const before = doc.createRange();
      before.setStart(doc.body, 0);
      before.setEndBefore(marker as Element);
      const at = before.toString().length;
      expect(pageOf(book, pages, 'chapter-1.xhtml', at - 1)).toBe(String(Number(label) - 1));
      expect(pageOf(book, pages, 'chapter-1.xhtml', at)).toBe(label);
    }
  });

  it('puts every word the index lists on the pages it lists', () => {
    const indexDoc = book.docs[sectionNamed(book, 'index.xhtml')];
    const entries = [...indexDoc.querySelectorAll('p')].map((p) => p.textContent ?? '');
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      const [term, ...cited] = entry.split(', ');
      const found: string[] = [];
      for (let s = 0; s < book.sections.length; s++) {
        if (book.sections[s].id.endsWith('/index.xhtml')) continue;
        const text = textOf(book, s);
        for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + 1)) {
          const page = pageAtCfi(pages, cfiAt(book, s, at));
          if (page !== null) found.push(pages[page].label);
        }
      }
      expect(found, term).toEqual(cited);
    }
  });
});

describe('page-numbers-ncx.epub', async () => {
  const book = await open('page-numbers-ncx.epub');
  const pages = index(book);

  it('places the NCX page list: i, ii, then 1 to 8', () => {
    expect(pages.map((p) => p.label)).toEqual(['i', 'ii', '1', '2', '3', '4', '5', '6', '7', '8']);
    expect(pageTotal(pages)).toBe(8);
  });

  it('puts a chapter heading on the page its anchor starts', () => {
    expect(pageOf(book, pages, 'chapter-2.xhtml', 0)).toBe('5');
  });
});

describe('broken-page-list.epub', async () => {
  const book = await open('broken-page-list.epub');

  it('keeps no page whose target is missing, so the book has no page numbers', () => {
    expect(book.pageList?.length).toBe(4);
    expect(index(book)).toEqual([]);
  });
});

describe('the page lookups', () => {
  const pages = (labels: string[]): PageStart[] =>
    labels.map((label, i) => ({ label, cfi: `epubcfi(/6/${2 * i + 2}!/4/2/1:0)` }));

  it('counts the entries when no label is a plain number', () => {
    expect(pageTotal(pages(['i', 'ii', 'A-1', '[4]']))).toBe(4);
    expect(pageTotal([])).toBe(0);
  });

  it('answers null with no pages, for a position before the first, and for a CFI it cannot read', () => {
    expect(pageAtCfi([], 'epubcfi(/6/2!/4/2/1:0)')).toBeNull();
    expect(
      pageAtCfi(
        pages(['1']).map((p) => ({ ...p, cfi: 'epubcfi(/6/4!/4/2/1:0)' })),
        'epubcfi(/6/2!/4/2/1:0)'
      )
    ).toBeNull();
    expect(pageAtCfi(pages(['1', '2']), '')).toBeNull();
  });

  it('answers the last page at or before a position, by its place in the list', () => {
    const list = pages(['1', '2', '2', '3']); // a label repeated: positions still count
    expect(pageAtCfi(list, 'epubcfi(/6/6!/4/2/1:0)')).toBe(2);
    expect(pageAtCfi(list, 'epubcfi(/6/6!/4/2/1:5)')).toBe(2);
    expect(pageAtCfi(list, 'epubcfi(/6/99!/4/2/1:0)')).toBe(3);
  });

  it('puts a page list out of reading order into reading order', () => {
    const targets = [
      { index: 0, label: '1', anchor: 'a' },
      { index: 1, label: '3', anchor: 'c' },
      { index: 2, label: '2', anchor: 'b' },
    ];
    const placed = new Map([
      [0, 'epubcfi(/6/2!/4/2/1:0)'],
      [1, 'epubcfi(/6/6!/4/2/1:0)'],
      [2, 'epubcfi(/6/4!/4/2/1:0)'],
    ]);
    expect(pagesInOrder(targets, placed).map((p) => p.label)).toEqual(['1', '2', '3']);
  });

  it('leaves out an entry with no label, no href or no section, and decodes an anchor', () => {
    const sectionOf = (href: string) => (href.startsWith('a.xhtml') ? 0 : -1);
    const targets = pageTargetsBySection(
      [
        { label: ' 1 ', href: 'a.xhtml#p%C3%A11' },
        { label: '', href: 'a.xhtml#p2' },
        { label: '3' },
        { label: '4', href: 'b.xhtml#p4' },
        { label: '5', href: 'a.xhtml' },
      ],
      sectionOf
    );
    expect(targets.get(0)).toEqual([
      { index: 0, label: '1', anchor: 'pá1' },
      { index: 4, label: '5', anchor: null },
    ]);
    expect(pageTargetsBySection(null, sectionOf).size).toBe(0);
  });
});
