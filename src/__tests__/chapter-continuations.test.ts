import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { type ChapterPart, type ChapterSource, chapterParts, LABEL_CHARS } from '../book-chapters';
import {
  type ChapterData,
  collectByTocAnchors,
  type ExtractionCtx,
  type ExtractOptions,
  type RawSection,
} from '../book-extractor';
import { ExportLinks, PieceNotes } from '../export-links';
import { chapterRowsFrom } from '../marks-pdf';
import { createTurndownService } from '../turndown-rules';
import { continuationSections, namesOnlyTheBook, qualifyRepeatedNames } from '../unlisted-sections';

// An unlisted file between chapters with no name of its own is the chapter before it, continuing; and a repeated
// name gets the chapter it sits in — see `continuationSections`.

describe('namesOnlyTheBook', () => {
  it("is true of a running header, Calibre's generated titles, and nothing at all", () => {
    expect(namesOnlyTheBook('Sample Book', 'Sample Book')).toBe(true);
    expect(namesOnlyTheBook('Continued, Another Book', 'Another Book (Sample Series)')).toBe(true);
    expect(namesOnlyTheBook('Unknown', 'The Third Book')).toBe(true);
    expect(namesOnlyTheBook('', 'Anything')).toBe(true);
    // The part before a subtitle, and a truncation of the title — a drop cap reads "T".
    expect(namesOnlyTheBook('Fourth Book', 'Fourth Book: A Subtitle')).toBe(true);
    expect(namesOnlyTheBook('T', 'The Fifth Book')).toBe(true);
  });

  it('is false of a real name — including one that starts with the book and goes on', () => {
    expect(namesOnlyTheBook('CHAPTER ONE', 'Sixth Book')).toBe(false);
    expect(namesOnlyTheBook('Summary', 'Seventh Book')).toBe(false);
    expect(namesOnlyTheBook("The Eighth Book's Guide: Phase Three", "The Eighth Book's Guide")).toBe(false);
  });
});

describe('continuationSections', () => {
  // cover | ch1 | title-continuation | Summary | ch2 | title-at-the-back
  const heading = ['', 'Book One', 'Sample Book', 'Summary', 'Book Two', 'Sample Book'];
  const listed = new Set([1, 4]);
  const ask = (headingOf: (i: number) => string | undefined) =>
    continuationSections({
      sectionCount: 6,
      listed: (i) => listed.has(i),
      heading: headingOf,
      bookTitle: 'Sample Book',
      chars: () => 5000,
      minChars: LABEL_CHARS,
    });

  it('takes a nameless unlisted file between two chapters, and only that', () => {
    expect([...ask((i) => heading[i])]).toEqual([2]);
  });

  it('leaves the front and the back alone — an excerpt of another book at the back is not the last chapter', () => {
    const set = ask((i) => heading[i]);
    expect(set.has(0)).toBe(false);
    expect(set.has(5)).toBe(false);
  });

  it('keeps a file with a name of its own as a chapter', () => {
    expect(ask((i) => heading[i]).has(3)).toBe(false);
  });

  /** A devotional book's half-title, "NINTH SAMPLE BOOK", is 17 characters between two chapters. */
  it('leaves a scrap of page furniture alone rather than making it a one-second part of another chapter', () => {
    const scrap = continuationSections({
      sectionCount: 3,
      listed: (i) => i !== 1,
      heading: (i) => ['HOW TO READ THE FERRY TIMETABLE', 'NINTH SAMPLE BOOK', 'CHAPTER I'][i],
      bookTitle: "Ninth Sample Book From Wren Pellow's Notes",
      chars: (i) => (i === 1 ? 17 : 5000),
      minChars: LABEL_CHARS,
    });
    expect(scrap.size).toBe(0);
  });

  /**
   * A technical manual lists each chapter's title page — a copyright line — and opens the chapter in the next,
   * unlisted file under the same heading. As its own row it was called `1. First Steps – 1. First Steps`.
   */
  it("takes a file whose heading only repeats its chapter's name as that chapter going on", () => {
    const set = continuationSections({
      sectionCount: 4,
      listed: (i) => i === 0 || i === 3,
      heading: (i) => ['1. First Steps', '1. First Steps', 'About the Ferry', '2. Going Further'][i],
      listedName: (i) => ['1. First Steps', '', '', '2. Going Further'][i],
      bookTitle: 'Seventh Book',
      chars: () => 5000,
      minChars: LABEL_CHARS,
    });
    expect([...set]).toEqual([1]);
  });

  it('continues nothing until the headings have been read', () => {
    expect(ask(() => undefined).size).toBe(0);
  });

  it('never touches a book with one contents entry or none — a novel that is one listed file and one huge one', () => {
    const one = continuationSections({
      sectionCount: 2,
      listed: (i) => i === 0,
      heading: () => '',
      bookTitle: 'Tenth Book',
      chars: () => 994_616,
      minChars: LABEL_CHARS,
    });
    expect(one.size).toBe(0);
  });
});

describe('qualifyRepeatedNames', () => {
  it("names each of a manual's summaries after the chapter it closes", () => {
    const out = qualifyRepeatedNames([
      { name: '1. First Steps', listed: true },
      { name: 'About the Ferry', listed: false },
      { name: 'Summary', listed: false },
      { name: '2. Going Further', listed: true },
      { name: 'Summary', listed: false },
    ]);
    expect(out).toEqual([
      '1. First Steps',
      'About the Ferry',
      '1. First Steps – Summary',
      '2. Going Further',
      '2. Going Further – Summary',
    ]);
  });

  it('changes nothing in a group it cannot make unique — two in one chapter, or one with no chapter before it', () => {
    const sameChapter = [
      { name: 'One', listed: true },
      { name: 'Notes', listed: false },
      { name: 'Notes', listed: false },
    ];
    expect(qualifyRepeatedNames(sameChapter)).toEqual(['One', 'Notes', 'Notes']);
    const noChapter = [
      { name: 'Notes', listed: false },
      { name: 'One', listed: true },
      { name: 'Notes', listed: false },
    ];
    expect(qualifyRepeatedNames(noChapter)).toEqual(['Notes', 'One', 'Notes']);
  });

  it('never writes a name twice over, like "1. First Steps – 1. First Steps"', () => {
    const out = qualifyRepeatedNames([
      { name: '1. First Steps', listed: true },
      { name: '1. First Steps', listed: false },
    ]);
    expect(out).toEqual(['1. First Steps', '1. First Steps']);
  });

  it("never renames a contents entry — the contents page's names are already its own", () => {
    const out = qualifyRepeatedNames([
      { name: 'Summary', listed: true },
      { name: 'Summary', listed: true },
    ]);
    expect(out).toEqual(['Summary', 'Summary']);
  });
});

describe('the recording list', () => {
  const source = (over: Partial<ChapterSource> = {}): ChapterSource => ({
    sectionCount: 5,
    toc: [
      { href: 'a.html', displayLabel: 'Book One' },
      { href: 'd.html', displayLabel: 'Book Two' },
    ],
    sectionIndexForHref: (h) => ['a.html', 'b.html', 'c.html', 'd.html', 'e.html'].indexOf(h.split('#')[0]),
    sectionLabel: (i) => ['', 'Sample Book', 'Summary', '', 'Summary'][i],
    partLabel: (base, part, of) => `${base} ${part} of ${of}`,
    ...over,
  });
  const rows = (parts: readonly ChapterPart[]) => parts.map((p) => p.label);

  it('makes a continuation another part of the chapter before it, not a track called "Sample Book"', () => {
    const out = chapterParts(source({ continues: (i) => i === 1 }));
    expect(rows(out)).toEqual([
      'Book One 1 of 2',
      'Book One 2 of 2',
      'Book One – Summary',
      'Book Two',
      'Book Two – Summary',
    ]);
    expect(out[1].chapterHref).toBe('a.html');
    expect(out[1].hrefs).toEqual([]);
  });

  it('is unchanged when nothing is known to continue', () => {
    expect(rows(chapterParts(source()))[1]).toBe('Sample Book');
  });
});

describe('Save as Markdown', () => {
  const files: Record<string, string> = {
    'one.xhtml': '<h1 id="one">One</h1><p>First chapter opens.</p>',
    'one-2.xhtml': '<p>First chapter goes on.</p><p id="deep">Deep in it.</p>',
    'two.xhtml': '<h1>Two</h1><p>Second chapter.</p>',
    'toc.xhtml': '<p><a href="one-2.xhtml">Continued part</a></p>',
  };
  async function convert(opts: Partial<ExtractOptions>) {
    const names = Object.keys(files);
    const options: ExtractOptions = {
      onProgress: () => undefined,
      tocEntries: [
        { label: 'One', href: 'one.xhtml' },
        { label: 'Two', href: 'two.xhtml' },
        { label: 'Contents', href: 'toc.xhtml' },
      ],
      sectionIndexForHref: (h) => names.indexOf(h.split('#')[0]),
      continuesSection: (i) => i === 1,
      ...opts,
    };
    const td = createTurndownService(false, 'wiki');
    const ctx: ExtractionCtx = {
      options,
      td,
      assetsFolder: 'a',
      app: {} as App,
      imgCounterRef: { value: 0 },
      hrefCache: new Map(),
      dbg: () => undefined,
      total: names.length,
      links: new ExportLinks(options.sectionIndexForHref, 'wiki', (html) => td.turndown(html)),
    };
    const map = new Map<string, ChapterData>();
    const order: string[] = [];
    const sections = names.map(
      (n) =>
        ({
          id: n,
          linear: true,
          createDocument: async () => new DOMParser().parseFromString(files[n], 'text/html'),
        }) as unknown as RawSection
    );
    await collectByTocAnchors(sections, ctx, map, order);
    return { ctx, map, order, text: (k: string) => (map.get(k)?.parts ?? []).join('\n\n') };
  }

  it("puts a continuation's text in the chapter before it, and gives it no note of its own", async () => {
    const r = await convert({});
    expect(r.order).toEqual(['one.xhtml', 'two.xhtml', 'toc.xhtml']);
    expect(r.text('one.xhtml')).toContain('First chapter opens.');
    expect(r.text('one.xhtml')).toContain('First chapter goes on.');
  });

  /**
   * A technical manual opens each chapter in a continuation under the chapter's own heading. Kept, it wrote the
   * name twice — a second `# 1. First Steps` beside Orbis's in a single note, so every link to the chapter was a
   * repeat.
   */
  it("drops a continuation's heading when it only repeats the chapter's name", async () => {
    // The listed file is only a copyright line; the chapter itself opens in the next, under the chapter's name.
    const saved = { ...files };
    files['one.xhtml'] = '<p>© The Authors 2014</p>';
    // A non-breaking space in the heading, as the manual writes it, against an ordinary one in the contents.
    files['one-2.xhtml'] = '<h1>Chapter\u00a0One</h1><p>First chapter goes on.</p>';
    try {
      const r = await convert({
        tocEntries: [
          { label: 'Chapter One', href: 'one.xhtml' },
          { label: 'Two', href: 'two.xhtml' },
          { label: 'Contents', href: 'toc.xhtml' },
        ],
      });
      expect(r.text('one.xhtml')).not.toMatch(/^# Chapter\sOne$/m);
      expect(r.text('one.xhtml')).toContain('First chapter goes on.');
    } finally {
      Object.assign(files, saved);
    }
  });

  it('leaves a continuation out when the chapter it continues is left out', async () => {
    const r = await convert({ selectedChapterHrefs: new Set(['two.xhtml', 'toc.xhtml']) });
    expect(r.order).toEqual(['two.xhtml', 'toc.xhtml']);
    expect(r.text('two.xhtml')).not.toContain('goes on');
  });

  it('does not make a link to a continuation a link to its chapter’s start, which is somewhere else', async () => {
    const r = await convert({});
    const notes = new PieceNotes();
    for (const [key, file] of [
      ['one.xhtml', '001 - One'],
      ['two.xhtml', '002 - Two'],
      ['toc.xhtml', '003 - Contents'],
    ]) {
      notes.place(key, { file });
      notes.text(file, r.text(key));
    }
    expect(notes.render(r.ctx.links, r.text('toc.xhtml'))).toBe('Continued part');
  });
});

describe("a file's lead-in", () => {
  /**
   * A flow split can land mid-chapter: Gutenberg's CHAPTER III heading ends one file and its prose opens the next,
   * above that file's first anchor. The prose was filed under the next file's first heading — a note called PART II
   * holding CHAPTER III — and CHAPTER III became an empty heading in the contents note.
   */
  const prose = (label: string) => `<p>${`${label} goes on, sentence after sentence. `.repeat(70)}</p>`;
  const files: Record<string, string> = {
    'a.xhtml': '<h2 id="c2">CHAPTER II</h2><p>Two.</p><h2 id="c3">CHAPTER III</h2>',
    'b.xhtml': `${prose('Chapter three')}<h2 id="p2">PART II</h2><h2 id="b1">CHAPTER I</h2><p>Part two opens.</p>`,
  };
  const toc = [
    { label: 'CHAPTER II', href: 'a.xhtml#c2' },
    { label: 'CHAPTER III', href: 'a.xhtml#c3' },
    { label: 'PART II', href: 'b.xhtml#p2' },
    { label: 'CHAPTER I', href: 'b.xhtml#b1' },
  ];
  async function convert(book: Record<string, string>, opts: Partial<ExtractOptions> = {}) {
    const names = Object.keys(book);
    const options: ExtractOptions = {
      onProgress: () => undefined,
      tocEntries: toc,
      sectionIndexForHref: (h) => names.indexOf(h.split('#')[0]),
      ...opts,
    };
    const td = createTurndownService(false, 'wiki');
    const ctx: ExtractionCtx = {
      options,
      td,
      assetsFolder: 'a',
      app: {} as App,
      imgCounterRef: { value: 0 },
      hrefCache: new Map(),
      dbg: () => undefined,
      total: names.length,
      links: new ExportLinks(options.sectionIndexForHref, 'wiki', (html) => td.turndown(html)),
    };
    const map = new Map<string, ChapterData>();
    const order: string[] = [];
    const sections = names.map(
      (n) =>
        ({
          id: n,
          linear: true,
          createDocument: async () => new DOMParser().parseFromString(book[n], 'text/html'),
        }) as unknown as RawSection
    );
    await collectByTocAnchors(sections, ctx, map, order);
    return { map, order, text: (k: string) => (map.get(k)?.parts ?? []).join('\n\n') };
  }

  it('is the chapter before it continuing, when it is prose with no heading of its own', async () => {
    const r = await convert(files);
    expect(r.text('a.xhtml#c3')).toContain('Chapter three goes on');
    expect(r.order).toEqual(['a.xhtml#c2', 'a.xhtml#c3', 'b.xhtml#p2', 'b.xhtml#b1']);
    expect(r.text('b.xhtml#p2')).not.toContain('Chapter three');
  });

  it('follows that chapter’s tick, whichever chapters of its own file are ticked', async () => {
    const without = await convert(files, { selectedChapterHrefs: new Set(['a.xhtml#c2', 'b.xhtml#p2', 'b.xhtml#b1']) });
    expect([...without.map.values()].some((d) => d.parts.join('').includes('Chapter three'))).toBe(false);
    const onlyIt = await convert(files, { selectedChapterHrefs: new Set(['a.xhtml#c3']) });
    expect(onlyIt.text('a.xhtml#c3')).toContain('Chapter three goes on');
  });

  // The book's contents skip Part II's Chapter II, whose text then opens the next file under its own heading.
  it('stays a piece of its own when it opens with a heading of its own', async () => {
    const r = await convert({
      ...files,
      'b.xhtml': `<h2>CHAPTER II</h2>${prose('Unlisted')}${files['b.xhtml'].slice(files['b.xhtml'].indexOf('<h2 id="p2">'))}`,
    });
    expect(r.text('a.xhtml#c3')).not.toContain('Unlisted');
    const own = [...r.map.entries()].find(([k]) => !k.includes('#'));
    expect(own?.[1].title).toBe('CHAPTER II');
  });

  // Too short to be prose, so not the chapter before it: the opening of its own file's first chapter, as Listen
  // reads it. As a piece of its own it took the next heading's name — the license came out as two notes, one name.
  it('opens the file’s first chapter when it is a running header or a closing line', async () => {
    const r = await convert({
      ...files,
      'b.xhtml': `<p>Running header</p>${files['b.xhtml'].slice(files['b.xhtml'].indexOf('<h2 id="p2">'))}`,
    });
    expect(r.text('a.xhtml#c3')).not.toContain('Running header');
    expect(r.text('b.xhtml#p2')).toContain('Running header');
    expect(r.order).toEqual(['a.xhtml#c2', 'a.xhtml#c3', 'b.xhtml#p2', 'b.xhtml#b1']);
  });
});

describe('Save as PDF', () => {
  it('lists no row for a continuation, and counts its marks toward the chapter before it', () => {
    const { rows, rowOfSection } = chapterRowsFrom({
      toc: [
        { label: 'One', href: 'one.xhtml' },
        { label: 'Two', href: 'two.xhtml' },
      ],
      sections: ['one.xhtml', 'one-2.xhtml', 'two.xhtml'].map((id) => ({ id, createDocument: () => undefined })),
      sectionIndexOf: (h) => ['one.xhtml', 'one-2.xhtml', 'two.xhtml'].indexOf(h.split('#')[0]),
      sectionKey: (s) => String(s?.id),
      continues: (i) => i === 1,
    });
    expect(rows.map((r) => r.key)).toEqual(['one.xhtml', 'two.xhtml']);
    expect(rowOfSection.get(1)).toBe('one.xhtml');
  });
});
