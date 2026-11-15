import { describe, expect, it } from 'vitest';
import { applyChapterScope, buildMarksPdf, countMarks, groupMarksByChapter } from '../marks-pdf';
import type { Highlight, Note } from '../progress';
import type { NotesData } from '../reader/export-format';

const hl = (over: Partial<Highlight> = {}): Highlight => ({
  id: 'h1',
  cfiRange: 'epubcfi(/6/4!/4/2/1:0)',
  text: 'a marked passage',
  color: '#FFEB3B',
  createdAt: 1,
  ...over,
});

const data = (over: Partial<NotesData> = {}): NotesData =>
  ({
    filePath: 'books/x.epub',
    fileBasename: 'x',
    meta: { title: 'A Book', author: 'An Author' },
    highlights: [],
    notes: [],
    bookmarks: [],
    tocItems: [
      { href: 'ch1.xhtml', label: 'One' },
      { href: 'ch2.xhtml', label: 'Two' },
    ],
    bookSectionCount: 2,
    frontmatterKeyLanguage: 'en',
    ...over,
  }) as unknown as NotesData;

describe('grouping', () => {
  it('orders chapters by the table of contents, not by first appearance', () => {
    // Chapter labels repeat across parts, so the href is the identity — the same rule reading records sort by.
    const chapters = groupMarksByChapter(
      data({
        highlights: [
          hl({ id: 'b', chapter: 'Two', chapterHref: 'ch2.xhtml' }),
          hl({ id: 'a', chapter: 'One', chapterHref: 'ch1.xhtml' }),
        ],
      })
    );
    expect(chapters.map((c) => c.title)).toEqual(['One', 'Two']);
  });

  it('orders entries within a chapter by CFI, which loc is too coarse to do', () => {
    const chapters = groupMarksByChapter(
      data({
        highlights: [
          hl({ id: 'late', cfiRange: 'epubcfi(/6/4!/4/48/1:0)', loc: 4, chapterHref: 'ch1.xhtml' }),
          hl({ id: 'early', cfiRange: 'epubcfi(/6/4!/4/2/1:0)', loc: 4, chapterHref: 'ch1.xhtml' }),
        ],
      })
    );
    expect(chapters[0].entries.map((e) => e.passage)).toHaveLength(2);
    expect(chapters[0].entries[0].sort < chapters[0].entries[1].sort).toBe(true);
  });

  it('puts a chapter the contents does not name after the ones it does', () => {
    const chapters = groupMarksByChapter(
      data({
        highlights: [
          hl({ id: 'stray', chapter: 'Appendix', chapterHref: 'zz.xhtml' }),
          hl({ id: 'known', chapter: 'One', chapterHref: 'ch1.xhtml' }),
        ],
      })
    );
    expect(chapters.map((c) => c.title)).toEqual(['One', 'Appendix']);
  });

  it('carries a note and its passage as one entry, and a bare highlight as another', () => {
    const note: Note = {
      id: 'n1',
      cfiRange: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'my comment',
      selectedText: 'the passage',
      createdAt: 1,
      chapterHref: 'ch1.xhtml',
    };
    const chapters = groupMarksByChapter(data({ highlights: [hl({ chapterHref: 'ch1.xhtml' })], notes: [note] }));
    expect(countMarks(chapters)).toEqual({ entries: 2, notes: 1 });
    expect(chapters[0].entries.some((e) => e.note === 'my comment' && e.passage === 'the passage')).toBe(true);
  });

  it('drops a chapter with nothing in it rather than printing an empty heading', () => {
    expect(groupMarksByChapter(data())).toEqual([]);
  });
});

/**
 * A mark is filed under the DEEPEST contents entry that matches it, which is right for placing one and wrong for
 * a heading: grouped by that key alone the digest would be a flat run of subheadings with nothing saying which chapter
 * each belonged to. The same fold a generated note set uses applies here, so the two cannot disagree.
 */
describe('chapters and their subheadings', () => {
  /** One chapter with two subheadings, and a second chapter with none. */
  const nested = (over: Partial<NotesData> = {}): NotesData =>
    data({
      tocItems: [
        {
          href: 'ch1.xhtml',
          label: 'One',
          subitems: [
            { href: 'ch1.xhtml#a', label: 'One A' },
            { href: 'ch1.xhtml#b', label: 'One B' },
          ],
        },
        { href: 'ch2.xhtml', label: 'Two' },
      ],
      ...over,
    });

  it('files marks made under subheadings beneath their chapter, not beside it', () => {
    const chapters = groupMarksByChapter(
      nested({
        highlights: [
          hl({ id: 'b', chapter: 'One B', chapterHref: 'ch1.xhtml#b' }),
          hl({ id: 'a', chapter: 'One A', chapterHref: 'ch1.xhtml#a' }),
        ],
      })
    );
    // Flat, this would be ['One A', 'One B'] — two chapters that are not chapters.
    expect(chapters.map((c) => c.title)).toEqual(['One']);
    expect(chapters[0].sections.map((s) => s.title)).toEqual(['One A', 'One B']);
  });

  it('keeps a chapter whose only marks are in its subheadings — the ordinary case', () => {
    // Filtering on each chapter's own entries would delete this chapter's heading entirely.
    const chapters = groupMarksByChapter(nested({ highlights: [hl({ chapterHref: 'ch1.xhtml#a' })] }));
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('One');
    expect(chapters[0].entries).toEqual([]);
    expect(chapters[0].sections.map((s) => s.entries.length)).toEqual([1]);
  });

  it('leaves a mark made on the chapter itself directly under it', () => {
    const chapters = groupMarksByChapter(
      nested({
        highlights: [hl({ id: 'own', chapterHref: 'ch1.xhtml' }), hl({ id: 'sub', chapterHref: 'ch1.xhtml#b' })],
      })
    );
    expect(chapters[0].entries).toHaveLength(1);
    expect(chapters[0].sections.map((s) => s.title)).toEqual(['One B']);
  });

  it('counts the marks in subheadings — the number that also guards "nothing to write"', () => {
    const chapters = groupMarksByChapter(
      nested({
        highlights: [hl({ id: 'a', chapterHref: 'ch1.xhtml#a' }), hl({ id: 'b', chapterHref: 'ch1.xhtml#b' })],
        notes: [
          {
            id: 'n1',
            cfiRange: 'epubcfi(/6/4!/4/2/1:0)',
            text: 'my comment',
            selectedText: 'the passage',
            createdAt: 1,
            chapterHref: 'ch1.xhtml#a',
          },
        ],
      })
    );
    // Summing only each chapter's own entries reports 0 here, and 0 is what refuses the export.
    expect(countMarks(chapters)).toEqual({ entries: 3, notes: 1 });
  });

  it('counts CHAPTERS, not chapters and subheadings — the unit the summary line prints', () => {
    // "N marks and notes across M chapters" reads M off this array's length. Three marked subheadings under one
    // chapter is one chapter, which is the whole reason the sections are nested rather than flagged with a depth.
    const chapters = groupMarksByChapter(
      nested({
        highlights: [
          hl({ id: 'a', chapterHref: 'ch1.xhtml#a' }),
          hl({ id: 'b', chapterHref: 'ch1.xhtml#b' }),
          hl({ id: 'c', chapterHref: 'ch2.xhtml' }),
        ],
      })
    );
    expect(chapters).toHaveLength(2);
  });

  it('names a chapter from the contents, so a digest and a note set agree', () => {
    // The annotation carries its own stale copy of the chapter name; the contents is the authority, and is what
    // `flattenTocWithDisambiguation` has already disambiguated for repeated labels.
    const chapters = groupMarksByChapter(
      nested({ highlights: [hl({ chapter: 'what it was called then', chapterHref: 'ch1.xhtml' })] })
    );
    expect(chapters[0].title).toBe('One');
  });

  it('does not repeat the chapter name inside its own subheading', () => {
    // "Commands" appears in two documents, so `flattenTocWithDisambiguation` qualifies both with their parent —
    // right for a flat list, redundant once the parent is the heading directly above. The chapter keeps the
    // qualified form; it has nothing above it to be told apart by.
    const chapters = groupMarksByChapter(
      data({
        tocItems: [
          { href: 'a.xhtml', label: 'Architecture', subitems: [{ href: 'a.xhtml#c', label: 'Commands' }] },
          { href: 'r.xhtml', label: 'Roadmap', subitems: [{ href: 'r.xhtml#c', label: 'Commands' }] },
        ],
        highlights: [hl({ id: 'a', chapterHref: 'a.xhtml#c' }), hl({ id: 'r', chapterHref: 'r.xhtml#c' })],
      })
    );
    expect(chapters.map((c) => c.title)).toEqual(['Architecture', 'Roadmap']);
    expect(chapters.flatMap((c) => c.sections.map((s) => s.title))).toEqual(['Commands', 'Commands']);
  });

  it('leaves a flat contents page exactly as it was: chapters, no sections', () => {
    const chapters = groupMarksByChapter(
      data({ highlights: [hl({ id: 'a', chapterHref: 'ch1.xhtml' }), hl({ id: 'b', chapterHref: 'ch2.xhtml' })] })
    );
    expect(chapters.map((c) => c.title)).toEqual(['One', 'Two']);
    expect(chapters.every((c) => c.sections.length === 0)).toBe(true);
  });

  it('keeps two unnamed-in-contents chapters apart, though neither has an href to group by', () => {
    // These bucket by TITLE. Handing the fold an empty href for both would collapse them into one chapter.
    const chapters = groupMarksByChapter(
      nested({
        highlights: [hl({ id: 'p', chapter: 'Preface' }), hl({ id: 'q', chapter: 'Appendix' })],
      })
    );
    expect(chapters.map((c) => c.title).sort()).toEqual(['Appendix', 'Preface']);
  });
});

describe('the file it produces', () => {
  it('is a real PDF, with the text drawn rather than rasterised', async () => {
    const chapters = groupMarksByChapter(
      data({
        highlights: [hl({ chapter: 'One', chapterHref: 'ch1.xhtml', text: 'a marked passage' })],
      })
    );
    const bytes = await buildMarksPdf(chapters, {
      title: 'A Book',
      author: 'An Author',
      attribution: 'Orbis',
      date: '2026-08-07',
      legendHeading: 'Marks used',
      pageLabel: (page: number, total: number) => `Page ${page} of ${total}`,
    });
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    // A rasterised page of this would be hundreds of kilobytes; drawn text is a few.
    expect(bytes.byteLength).toBeLessThan(50_000);
  });

  it('marks a passage long enough to cross a page break', async () => {
    // Collecting the line boxes and decorating them afterwards would paint every wash and underline onto whichever page
    // is current at the end — so the marks for the lines above a page break would land on the page below it, over other
    // text. Each line is decorated on the page it landed on.
    const long = 'lorem ipsum dolor sit amet '.repeat(400);
    const chapters = groupMarksByChapter(
      data({ highlights: [hl({ chapter: 'One', chapterHref: 'ch1.xhtml', text: long })] })
    );
    const bytes = await buildMarksPdf(chapters, {
      title: 'A Book',
      author: '',
      attribution: '',
      date: 'x',
      legendHeading: 'Marks used',
      pageLabel: (page: number, total: number) => `Page ${page} of ${total}`,
    });
    // Read back rather than grepping the bytes: pdf-lib compresses its object streams, so the page dictionaries
    // are not plain text in the file.
    const { PDFDocument } = await import('pdf-lib');
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    expect(pages).toBeGreaterThan(2);
  });

  it('does not throw on characters a built-in font cannot encode', async () => {
    // `drawText` throws on an unencodable character, so this is the difference between a degraded PDF and none.
    const chapters = groupMarksByChapter(
      data({ highlights: [hl({ chapter: '日本語 🟡', chapterHref: 'ch1.xhtml', text: 'emoji 🟢 and “curly”' })] })
    );
    const bytes = await buildMarksPdf(chapters, {
      title: 'Ünïcode 🎉',
      author: '',
      attribution: '',
      date: 'x',
      legendHeading: 'Marks used',
      pageLabel: (page: number, total: number) => `Page ${page} of ${total}`,
    });
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  });
});

describe('chapter scope', () => {
  const chapters = () => [
    { key: 'a.xhtml', hrefs: ['a.xhtml'], title: 'One', marks: 3, included: true, unlisted: false },
    { key: 'b.xhtml', hrefs: ['b.xhtml'], title: 'Two', marks: 0, included: true, unlisted: false },
    { key: 'c.xhtml', hrefs: ['c.xhtml'], title: 'Three', marks: 1, included: true, unlisted: false },
  ];

  it('keeps every chapter under "all"', () => {
    const list = chapters();
    applyChapterScope(list, 'all');
    expect(list.map((c) => c.included)).toEqual([true, true, true]);
  });

  it('keeps only the marked ones under "marked"', () => {
    const list = chapters();
    applyChapterScope(list, 'marked');
    expect(list.map((c) => c.included)).toEqual([true, false, true]);
  });

  it('leaves a custom selection alone', () => {
    // `custom` IS the state the list is already in — re-deriving it from a rule would discard the ticks that
    // produced it, which is the whole thing the state exists to remember.
    const list = chapters();
    list[0].included = false;
    applyChapterScope(list, 'custom');
    expect(list.map((c) => c.included)).toEqual([false, true, true]);
  });
});
