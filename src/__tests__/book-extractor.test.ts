import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import type { ChapterData, ExtractionCtx, ExtractOptions, RawSection } from '../book-extractor';
import {
  chapterFrontmatter,
  collectBySectionFallback,
  collectByTocAnchors,
  contentsNoteList,
  headingOf,
  sanitizeName,
  sectionKeyOf,
  splitSectionMarkdown,
  stripLeadingDuplicateTitle,
  unclaimedLabelFor,
} from '../book-extractor';
import { ExportLinks } from '../export-links';
import { createTurndownService } from '../turndown-rules';

// A section whose createDocument() returns a fixed, pre-built HTML document —
// enough for collectByTocAnchors/collectBySectionFallback, which never touch
// images when ExtractOptions.includeImages is left false.
function mockSection(bodyHtml: string, id = ''): RawSection {
  return {
    linear: true,
    id,
    createDocument: async () => {
      return new DOMParser().parseFromString(bodyHtml, 'text/html');
    },
  } as unknown as RawSection;
}

function createCtx(options: Partial<ExtractOptions> = {}): ExtractionCtx {
  const full = { onProgress: () => undefined, ...options };
  const td = createTurndownService(false, 'wiki');
  return {
    options: full,
    td,
    assetsFolder: 'assets',
    app: {} as App,
    imgCounterRef: { value: 0 },
    hrefCache: new Map(),
    dbg: () => undefined,
    total: 0,
    links: new ExportLinks(full.sectionIndexForHref, 'wiki', (html) => td.turndown(html)),
  };
}

function collect(map: Map<string, ChapterData>, href: string) {
  const data = map.get(href);
  if (!data) throw new Error(`no chapter data for ${href}`);
  return { title: data.title, text: data.parts.join('\n\n') };
}

describe('sanitizeName', () => {
  it('removes illegal filename characters', () => {
    expect(sanitizeName('Chapter: One')).toBe('Chapter One');
  });

  /**
   * **Replaced with a space, not deleted.** `Part/One` should read as `Part One`, because deleting the separator
   * welds two words into one wherever there was no space beside it.
   */
  it('replaces forward and backward slashes with a space', () => {
    expect(sanitizeName('Part/One\\Two')).toBe('Part One Two');
  });

  it('replaces *, ?, ", <, >, |', () => {
    expect(sanitizeName('A*B?C"D<E>F|G')).toBe('A B C D E F G');
  });

  it('replaces # ^ [ ]', () => {
    expect(sanitizeName('A#B^C[D]')).toBe('A B C D');
  });

  /** The security-relevant half: a name that is a direction rather than a name. See `sanitizeVaultName`. */
  it('never returns a leading dot, so a title cannot name a parent folder or a hidden file', () => {
    expect(sanitizeName('..')).toBe('');
    expect(sanitizeName('../../evil')).toBe('evil');
    expect(sanitizeName('.hidden')).toBe('hidden');
  });

  it('collapses multiple spaces into one', () => {
    expect(sanitizeName('Chapter   One')).toBe('Chapter One');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeName('  Title  ')).toBe('Title');
  });

  it('truncates at 80 characters', () => {
    const long = 'A'.repeat(100);
    expect(sanitizeName(long)).toHaveLength(80);
  });

  it('returns the empty string for a name made entirely of illegal chars', () => {
    expect(sanitizeName('/**/')).toBe('');
  });
});

describe('stripLeadingDuplicateTitle', () => {
  // Found on an old MOBI saved to a folder called "… MOBI cover Test": the cover page's picture link contains "cover",
  // so it was stripped as the title "Cover" repeated, and the page, holding nothing else, was dropped.
  it('never strips a picture, whatever its path or file name says', () => {
    const wiki = '![[fixtures/Workhorse cover Test/assets/img-001.jpg]]';
    expect(stripLeadingDuplicateTitle(wiki, 'Cover')).toBe(wiki);
    const markdown = '![Cover](assets/cover.jpg)';
    expect(stripLeadingDuplicateTitle(markdown, 'Cover')).toBe(markdown);
  });

  // Gutenberg's daily readings break the heading — `[p11]<br/>First Day.` — and the first line alone matched nothing,
  // leaving a note that held only its own heading.
  it('strips a heading broken over lines when the whole of it is the title', () => {
    const content = '### \\[p11\\]  \nFirst Day. Contents';
    expect(stripLeadingDuplicateTitle(content, '[p11] First Day. Contents')).toBe('');
    // A heading that matches on its own first line keeps what follows the break — the running title's image.
    expect(stripLeadingDuplicateTitle('## GUTENBERG STYLE.  \n![[img.jpg]]\n\nText.', 'Gutenberg Style.')).toBe(
      '![[img.jpg]]\n\nText.'
    );
  });

  it('strips a first line that exactly matches the chapter title', () => {
    const content = 'Chapter One\n\nbody text here';
    expect(stripLeadingDuplicateTitle(content, 'Chapter One')).toBe('body text here');
  });

  it('normalises case and punctuation before comparing', () => {
    const content = 'CHAPTER ONE!\n\nbody';
    expect(stripLeadingDuplicateTitle(content, 'Chapter One')).toBe('body');
  });

  it('matches when title is a substring of the first line', () => {
    // normTitle='chapterone', normFirst='chapteroneprologue' — includes normTitle → strips
    const content = 'Chapter One Prologue\n\nbody';
    expect(stripLeadingDuplicateTitle(content, 'Chapter One')).toBe('body');
  });

  it('matches when first line is a substring of the title', () => {
    // normFirst='chapter', normTitle='chapterone' — normTitle.includes(normFirst)=true → strips
    const content = 'Chapter\n\nbody';
    expect(stripLeadingDuplicateTitle(content, 'Chapter One')).toBe('body');
  });

  it('does NOT strip when first line is unrelated to the title', () => {
    const content = 'Introduction\n\nbody';
    expect(stripLeadingDuplicateTitle(content, 'Chapter One')).toBe(content);
  });

  it('does NOT strip when first non-empty line is fewer than 4 normalised chars', () => {
    // 'Hi' → 'hi' = 2 chars < 4
    const content = 'Hi\n\nbody';
    expect(stripLeadingDuplicateTitle(content, 'Hi Chapter')).toBe(content);
  });

  it('returns content unchanged when content is empty', () => {
    expect(stripLeadingDuplicateTitle('', 'Chapter One')).toBe('');
  });

  it('returns content unchanged when all lines are whitespace', () => {
    const content = '   \n\n   ';
    expect(stripLeadingDuplicateTitle(content, 'Chapter One')).toBe(content);
  });

  it('skips leading blank lines to find the first non-empty line', () => {
    const content = '\n\nChapter One\n\nbody';
    expect(stripLeadingDuplicateTitle(content, 'Chapter One')).toBe('body');
  });
});

describe('collectByTocAnchors', () => {
  it('keeps two same-labeled chapters in different files as separate, correctly attributed entries', async () => {
    // Why identity is keyed by href: "PART I > CHAPTER I" and "PART II > CHAPTER I"
    // share a label but must never merge.
    const rawSections = [
      mockSection('<p>Text of part 1 chapter 1.</p>'),
      mockSection('<p>Text of part 2 chapter 1.</p>'),
    ];
    const ctx = createCtx({
      tocEntries: [
        { label: 'Chapter I', href: 'part1.xhtml' },
        { label: 'Chapter I', href: 'part2.xhtml' },
      ],
      sectionIndexForHref: (h) => (h.startsWith('part1.xhtml') ? 0 : h.startsWith('part2.xhtml') ? 1 : -1),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['part1.xhtml', 'part2.xhtml']);
    expect(collect(chapterMap, 'part1.xhtml').text).toContain('Text of part 1 chapter 1.');
    expect(collect(chapterMap, 'part2.xhtml').text).toContain('Text of part 2 chapter 1.');
    expect(collect(chapterMap, 'part2.xhtml').text).not.toContain('part 1');
  });

  it('splits a single file into multiple chapters at ToC anchor boundaries', async () => {
    const rawSections = [
      mockSection(
        '<h1 id="c1">Alpha Heading</h1><p>Alpha content.</p><h1 id="c2">Beta Heading</h1><p>Beta content.</p>'
      ),
    ];
    const ctx = createCtx({
      tocEntries: [
        { label: 'Alpha', href: 'partA.xhtml#c1' },
        { label: 'Beta', href: 'partA.xhtml#c2' },
      ],
      sectionIndexForHref: (h) => (h.startsWith('partA.xhtml') ? 0 : -1),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['partA.xhtml#c1', 'partA.xhtml#c2']);
    expect(collect(chapterMap, 'partA.xhtml#c1').text).toContain('Alpha content.');
    expect(collect(chapterMap, 'partA.xhtml#c1').text).not.toContain('Beta content.');
    expect(collect(chapterMap, 'partA.xhtml#c2').text).toContain('Beta content.');
    expect(collect(chapterMap, 'partA.xhtml#c2').text).not.toContain('Alpha content.');
  });

  /**
   * **A contents anchor on `<body>` is the start of the file.** Calibre writes every chapter that way —
   * `<body id="7K4G0-…" class="calibre">` — and a split marker inserted BEFORE the anchored element lands, for
   * `<body>`, outside it. The body's Markdown would then hold no marker, and every chapter's text would be dropped
   * with nothing said.
   */
  it('keeps a chapter whose contents anchor is on the body itself', async () => {
    const html = '<html><body id="ch1"><p>First chapter text.</p></body></html>';
    const rawSections = [mockSection(html)];
    const ctx = createCtx({
      tocEntries: [{ label: 'Chapter 1', href: 'part0008.html#ch1' }],
      sectionIndexForHref: (h) => (h.startsWith('part0008.html') ? 0 : -1),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['part0008.html#ch1']);
    expect(collect(chapterMap, 'part0008.html#ch1').text).toContain('First chapter text.');
  });

  it('honours selectedChapterHrefs — same-labeled sibling chapter is excluded, not merged in', async () => {
    const rawSections = [
      mockSection('<p>Text of part 1 chapter 1.</p>'),
      mockSection('<p>Text of part 2 chapter 1.</p>'),
    ];
    const ctx = createCtx({
      tocEntries: [
        { label: 'Chapter I', href: 'part1.xhtml' },
        { label: 'Chapter I', href: 'part2.xhtml' },
      ],
      sectionIndexForHref: (h) => (h.startsWith('part1.xhtml') ? 0 : h.startsWith('part2.xhtml') ? 1 : -1),
      selectedChapterHrefs: new Set(['part2.xhtml']),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['part2.xhtml']);
    expect(chapterMap.has('part1.xhtml')).toBe(false);
  });

  /**
   * The collector walks the SPINE, not the contents page, so a section the contents page cannot account for is
   * still part of the book — which is what the export dialog claims by listing it.
   */
  it('keeps a section the contents page cannot account for', async () => {
    const rawSections = [mockSection('<h1>Cover</h1><p>content</p>', 'cover.xhtml')];
    const ctx = createCtx({
      tocEntries: [{ label: 'Ghost', href: 'missing.xhtml' }],
      sectionIndexForHref: () => -1,
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    // Keyed by the section, named by its own heading — never by the file, which is the packager's business.
    expect(chapterOrder).toEqual(['cover.xhtml']);
    expect(chapterMap.get('cover.xhtml')?.title).toBe('Cover');
  });

  it('takes a whole unlisted section while splitting its neighbour at anchors', async () => {
    // An EPUB whose cover is in the spine and in no contents entry. The dialog offers a ticked "Cover" row, so
    // this collector — the one an EPUB actually uses — has to write a file for it.
    const rawSections = [
      mockSection('<h1>Cover</h1>', 'cover.xhtml'),
      mockSection('<h1 id="c1">Alpha</h1><p>A.</p><h1 id="c2">Beta</h1><p>B.</p>', 'body.xhtml'),
    ];
    const ctx = createCtx({
      tocEntries: [
        { label: 'Alpha', href: 'body.xhtml#c1' },
        { label: 'Beta', href: 'body.xhtml#c2' },
      ],
      sectionIndexForHref: (h) => (h.startsWith('body.xhtml') ? 1 : -1),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    // Spine order, so front matter comes first rather than wherever the contents page mentions it.
    expect(chapterOrder).toEqual(['cover.xhtml', 'body.xhtml#c1', 'body.xhtml#c2']);
  });

  it('lets an unlisted section be unticked, like any chapter', async () => {
    const rawSections = [mockSection('<h1>Cover</h1>', 'cover.xhtml'), mockSection('<p>A.</p>', 'body.xhtml')];
    const ctx = createCtx({
      tocEntries: [{ label: 'Alpha', href: 'body.xhtml' }],
      sectionIndexForHref: (h) => (h.startsWith('body.xhtml') ? 1 : -1),
      selectedChapterHrefs: new Set(['body.xhtml']),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);
    expect(chapterOrder).toEqual(['body.xhtml']);
  });
});

describe('collectBySectionFallback', () => {
  it('without hrefForSection, same-labeled chapters collapse into one bucket (documented fallback)', async () => {
    // hrefForSection disambiguates chapters that share a label across parts; a
    // caller that doesn't supply it falls back to the label itself, so two
    // same-labeled chapters DO merge — this is the exact failure mode
    // chapterHref/hrefForSection exists to avoid in real callers.
    const rawSections = [mockSection('<p>Part 1 content.</p>'), mockSection('<p>Part 2 content.</p>')];
    const ctx = createCtx({ chapterForSection: () => 'Chapter I' });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectBySectionFallback(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['Chapter I']);
    const text = collect(chapterMap, 'Chapter I').text;
    expect(text).toContain('Part 1 content.');
    expect(text).toContain('Part 2 content.');
  });

  it('with hrefForSection, same-labeled chapters stay separate', async () => {
    const rawSections = [mockSection('<p>Part 1 content.</p>'), mockSection('<p>Part 2 content.</p>')];
    const ctx = createCtx({
      chapterForSection: () => 'Chapter I',
      hrefForSection: (i) => (i === 0 ? 'part1.xhtml#ch1' : 'part2.xhtml#ch1'),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectBySectionFallback(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['part1.xhtml#ch1', 'part2.xhtml#ch1']);
    expect(collect(chapterMap, 'part1.xhtml#ch1').text).toBe('Part 1 content.');
    expect(collect(chapterMap, 'part2.xhtml#ch1').text).toBe('Part 2 content.');
  });

  it('accumulates multiple sections into one chapter and strips the duplicate title only once', async () => {
    const rawSections = [mockSection('<p>Chapter I</p><p>First body.</p>'), mockSection('<p>Second body.</p>')];
    const ctx = createCtx({
      chapterForSection: () => 'Chapter I',
      hrefForSection: () => 'ch1.xhtml',
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectBySectionFallback(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['ch1.xhtml']);
    const data = chapterMap.get('ch1.xhtml')!;
    expect(data.parts).toEqual(['First body.', 'Second body.']);
  });

  /**
   * A section the contents page does not mention stays in a book-folder export, as it does in a single-note export
   * of the same book — otherwise two formats would contain different text, with nothing on screen saying so.
   */
  it('keeps a section the contents page does not mention, named by its place when it has no heading', async () => {
    const rawSections = [mockSection('<p>Front matter, no heading yet.</p>', 'text/copyright.xhtml')];
    const ctx = createCtx({ chapterForSection: () => '' });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectBySectionFallback(rawSections, ctx, chapterMap, chapterOrder);

    // Keyed by its own href, so the dialog can offer it as a row; named as the dialog names it, never for its file.
    expect(chapterOrder).toEqual(['text/copyright.xhtml']);
    expect(chapterMap.get('text/copyright.xhtml')?.title).toBe('Section 1');
    expect(chapterMap.get('text/copyright.xhtml')?.parts).toEqual(['Front matter, no heading yet.']);
  });

  it('lets an unlisted section be unticked like any chapter', async () => {
    const rawSections = [mockSection('<p>Cover.</p>', 'cover.xhtml'), mockSection('<p>Body.</p>', 'ch1.xhtml')];
    const ctx = createCtx({
      chapterForSection: (i) => (i === 0 ? '' : 'Chapter I'),
      hrefForSection: () => 'ch1.xhtml',
      selectedChapterHrefs: new Set(['ch1.xhtml']),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectBySectionFallback(rawSections, ctx, chapterMap, chapterOrder);
    expect(chapterOrder).toEqual(['ch1.xhtml']);
  });

  it('honours selectedChapterHrefs', async () => {
    const rawSections = [mockSection('<p>Part 1 content.</p>'), mockSection('<p>Part 2 content.</p>')];
    const ctx = createCtx({
      chapterForSection: () => 'Chapter I',
      hrefForSection: (i) => (i === 0 ? 'part1.xhtml#ch1' : 'part2.xhtml#ch1'),
      selectedChapterHrefs: new Set(['part2.xhtml#ch1']),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectBySectionFallback(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['part2.xhtml#ch1']);
    expect(chapterMap.has('part1.xhtml#ch1')).toBe(false);
  });
});

describe('splitSectionMarkdown', () => {
  // The markers the DOM pass injects, written by hand so the arithmetic can be tested without a Document.
  const SPLIT = 'ZZSPLITX';
  const chunks = [
    { label: 'Alpha', href: 'f.xhtml#a' },
    { label: 'Beta', href: 'f.xhtml#b' },
  ];

  it('cuts each chapter from its own marker to the next', () => {
    const pieces = splitSectionMarkdown({
      fullMd: `${SPLIT}0\n\nAlpha body.\n\n${SPLIT}1\n\nBeta body.`,
      split: SPLIT,
      chunks,
      injected: new Set([0, 1]),
      unclaimedLabel: 'f',
    });
    expect(pieces.map((p) => [p.href, p.md])).toEqual([
      ['f.xhtml#a', 'Alpha body.'],
      ['f.xhtml#b', 'Beta body.'],
    ]);
  });

  /**
   * **Nothing above the first anchor is dropped.** When a file's first ToC entry is anchored, everything above
   * that anchor is sliced by nothing. It belongs to no chapter — the one
   * before it is in a different file, and a chapter starts at its own heading — so it comes back as a piece with
   * no href, and the export lists it under the file's name.
   */
  it('returns content above the first anchor as an unclaimed piece, in document order', () => {
    const pieces = splitSectionMarkdown({
      fullMd: `PART TWO\n\n${SPLIT}0\n\nAlpha body.\n\n${SPLIT}1\n\nBeta body.`,
      split: SPLIT,
      chunks,
      injected: new Set([0, 1]),
      unclaimedLabel: 'part2',
    });
    expect(pieces.map((p) => [p.href, p.label, p.md])).toEqual([
      [null, 'part2', 'PART TWO'],
      ['f.xhtml#a', 'Alpha', 'Alpha body.'],
      ['f.xhtml#b', 'Beta', 'Beta body.'],
    ]);
  });

  it('gives the lead-in to the first chapter when that chapter has no anchor', () => {
    // The ordinary shape — the contents page points at the file, not into it — where nothing is unclaimed.
    const pieces = splitSectionMarkdown({
      fullMd: `Alpha body.\n\n${SPLIT}1\n\nBeta body.`,
      split: SPLIT,
      chunks,
      injected: new Set([1]),
      unclaimedLabel: 'f',
    });
    expect(pieces.map((p) => p.href)).toEqual(['f.xhtml#a', 'f.xhtml#b']);
    expect(pieces[0].md).toBe('Alpha body.');
  });

  it('emits nothing for an empty lead-in rather than a blank piece', () => {
    const pieces = splitSectionMarkdown({
      fullMd: `\n\n${SPLIT}0\n\nAlpha body.`,
      split: SPLIT,
      chunks: [chunks[0]],
      injected: new Set([0]),
      unclaimedLabel: 'f',
    });
    expect(pieces).toHaveLength(1);
    expect(pieces[0].href).toBe('f.xhtml#a');
  });

  it('drops a chapter whose declared anchor is not in the document', () => {
    // Pinned: the ToC promised an anchor the file does not have, so there is nothing to cut.
    const pieces = splitSectionMarkdown({
      fullMd: `${SPLIT}0\n\nAlpha body.`,
      split: SPLIT,
      chunks,
      injected: new Set([0]),
      unclaimedLabel: 'f',
    });
    expect(pieces.map((p) => p.href)).toEqual(['f.xhtml#a']);
  });
});

describe('contentsNoteList', () => {
  // An unlisted page saying only "NOTES", before one novel's glossary, was a heading over the two novels after it.
  it('writes a divider the contents do not list as a bold line in its place, never a heading', () => {
    expect(
      contentsNoteList([
        { file: '022 - Chapter 12' },
        { label: 'NOTES' },
        { file: '023 - Glossary' },
        { file: '024 - Novel Two' },
      ])
    ).toBe('- [[022 - Chapter 12]]\n- **NOTES**\n- [[023 - Glossary]]\n- [[024 - Novel Two]]');
  });

  it('writes a listed divider as a heading over what follows, joining several in a row', () => {
    expect(
      contentsNoteList([
        { file: '001 - Cover' },
        { heading: 'BOOK' },
        { heading: 'PART I' },
        { file: '002 - Chapter I' },
      ])
    ).toBe('- [[001 - Cover]]\n\n## BOOK · PART I\n\n- [[002 - Chapter I]]');
  });

  it('keeps a divider with nothing after it, so the book does not lose its last division', () => {
    expect(contentsNoteList([{ file: '001 - One' }, { heading: 'AFTERWORD' }])).toBe(
      '- [[001 - One]]\n\n## AFTERWORD\n'
    );
  });
});

describe('unclaimedLabelFor', () => {
  // A heading-less unlisted file in a Calibre book was a note called `part0037`, while the dialog listed it as
  // "Section 38": the packager's file name, and a row and a note that did not agree.
  it('names a section by its place in the book, one-based like the list, never by its file', () => {
    expect(unclaimedLabelFor(0)).toBe('Section 1');
    expect(unclaimedLabelFor(37)).toBe('Section 38');
  });

  it("takes the caller's wording, since this file holds no user-facing strings", () => {
    expect(unclaimedLabelFor(3, (n) => `Abschnitt ${n}`)).toBe('Abschnitt 4');
  });
});

describe('headingOf', () => {
  const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

  it("prefers the section's own heading", () => {
    expect(headingOf(doc('<h2>Translator\u2019s Preface</h2><p>x</p>'))).toBe('Translator\u2019s Preface');
  });

  it('falls back to the document title when there is no heading', () => {
    expect(headingOf(doc('<head><title>Colophon</title></head><body><p>x</p></body>'))).toBe('Colophon');
  });

  // An old MOBI's cover page is a picture with neither a heading nor a title; it was "Section 1" in every list.
  it('names a book’s first page Cover when it holds only a picture', () => {
    expect(headingOf(doc('<body><p><img recindex="00001"></p></body>'), '', 0)).toBe('Cover');
  });

  it('names no other page Cover for a picture alone, and no first page that has text', () => {
    expect(headingOf(doc('<body><p><img recindex="00004"></p></body>'), '', 5)).toBe('');
    expect(headingOf(doc('<body><p><img recindex="00001"></p></body>'))).toBe('');
    expect(headingOf(doc('<body><img src="a.jpg"><p>A dedication.</p></body>'), '', 0)).toBe('');
  });

  /**
   * Both shapes are Project Gutenberg's: a cover section with no heading and `<title>"Cover"</title>`, and every
   * other section carrying the same boilerplate title.
   */
  it('unwraps a matched pair of quotes around the whole title', () => {
    // `sanitizeName` strips `"` from the file name, so otherwise the list says `"Cover"` for a note saved `Cover.md`.
    expect(headingOf(doc('<head><title>"Cover"</title></head><body><p>x</p></body>'))).toBe('Cover');
    expect(headingOf(doc('<head><title>\u201cCover\u201d</title></head><body><p>x</p></body>'))).toBe('Cover');
  });

  it('leaves quotes that do not wrap the whole title alone', () => {
    expect(headingOf(doc('<h1>"Hello," he said</h1>'))).toBe('"Hello," he said');
  });

  it("refuses a document title that is only the book's own", () => {
    const packaged = doc('<head><title>Parts and Chapters | Project Gutenberg</title></head><body><p>x</p></body>');
    expect(headingOf(packaged, 'Parts and Chapters')).toBe('');
    // With nothing to compare against it is still better than no name at all.
    expect(headingOf(packaged)).toBe('Parts and Chapters | Project Gutenberg');
  });

  it('keeps a document title that merely mentions the book', () => {
    const d = doc('<head><title>About Parts and Chapters</title></head><body><p>x</p></body>');
    expect(headingOf(d, 'Parts and Chapters')).toBe('About Parts and Chapters');
  });

  it('collapses whitespace, so a heading broken across lines reads as one', () => {
    expect(headingOf(doc('<h1>PART I\n\n   CHAPTER I</h1>'))).toBe('PART I CHAPTER I');
  });
});

/**
 * Section identity across formats.
 *
 * foliate gives an EPUB section its href as its `id` and gives MOBI, AZW3 and FB2 sections a plain NUMBER.
 * Comparing file names would match nothing on three formats out of four — the chapter list would show every section
 * as "not in contents", and a resolver calling `.split` on a number throws.
 */
describe('sectionKeyOf', () => {
  it("uses an EPUB section's href, which is its identity", () => {
    expect(sectionKeyOf({ id: 'OEBPS/ch1.xhtml' }, 3)).toBe('OEBPS/ch1.xhtml');
  });

  it('prefixes a numeric id, so a section key can never look like a file name', () => {
    // MOBI, AZW3 and FB2 number their sections. `0` is a plausible href; `section:0` is not.
    expect(sectionKeyOf({ id: 0 }, 0)).toBe('section:0');
    expect(sectionKeyOf({ id: 12 }, 12)).toBe('section:12');
  });

  it('falls back to the index for a section with no id at all', () => {
    expect(sectionKeyOf({}, 4)).toBe('section:4');
    expect(sectionKeyOf(undefined, 7)).toBe('section:7');
  });
});

describe('collectByTocAnchors across formats', () => {
  it('groups by the resolved spine index, not by file name', async () => {
    // A MOBI-shaped book: numeric section ids, contents hrefs that share no basename with them. Comparing
    // `hrefBasename(entry.href)` against those ids would skip every section.
    const rawSections = [mockSection('<p>One.</p>'), mockSection('<p>Two.</p>')];
    const ctx = createCtx({
      tocEntries: [
        { label: 'Chapter I', href: 'filepos:0000000100' },
        { label: 'Chapter II', href: 'filepos:0000004200' },
      ],
      sectionIndexForHref: (href) => (href === 'filepos:0000000100' ? 0 : href === 'filepos:0000004200' ? 1 : -1),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['filepos:0000000100', 'filepos:0000004200']);
    expect(collect(chapterMap, 'filepos:0000000100').text).toContain('One.');
    expect(collect(chapterMap, 'filepos:0000004200').text).toContain('Two.');
  });

  // A Kindle chapter partway down its file: the link has no `#fragment`, so the cut comes from the id the reader's
  // index recorded for it (`anchorForHref`). Without it both entries claimed the file's top and NOTE held nothing.
  it('cuts a file at a Kindle entry that starts partway down it, by the id the reader resolved', async () => {
    const rawSections = [mockSection('<h1 id="t">PARTS</h1><p>Title page.</p><h3 id="note">NOTE</h3><p>A note.</p>')];
    const title = 'kindle:pos:fid:0001:off:0000000000';
    const note = 'kindle:pos:fid:0001:off:0000000023';
    const ctx = createCtx({
      tocEntries: [
        { label: 'PARTS', href: title },
        { label: 'NOTE', href: note },
      ],
      sectionIndexForHref: () => 0,
      anchorForHref: (href) => (href === note ? 'note' : null),
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual([title, note]);
    expect(collect(chapterMap, title).text).toContain('Title page.');
    expect(collect(chapterMap, title).text).not.toContain('A note.');
    expect(collect(chapterMap, note).text).toContain('A note.');
  });

  it('still yields the whole book when no contents entry can be placed', async () => {
    // A contents page whose entries neither the index nor foliate can place. Since the spine is what gets walked, every section comes through as one the contents page could not account for — named by
    // its own heading, which is the best name available when the contents page cannot be used at all.
    const rawSections = [mockSection('<h1>One</h1><p>1.</p>'), mockSection('<h1>Two</h1><p>2.</p>')];
    const ctx = createCtx({
      tocEntries: [{ label: 'Chapter I', href: 'kindle:pos:fid:0000:off:0000000000' }],
      sectionIndexForHref: () => -1,
    });
    const chapterMap = new Map<string, ChapterData>();
    const chapterOrder: string[] = [];
    await collectByTocAnchors(rawSections, ctx, chapterMap, chapterOrder);

    expect(chapterOrder).toEqual(['section:0', 'section:1']);
    expect(chapterMap.get('section:0')?.title).toBe('One');
  });
});

/**
 * **The title carries the chapter too.** Titled with the book's title alone, every chapter note of a novel's export
 * would look identical wherever a title shows. `chapter:` keeps the chapter alone, which is what the folder
 * converter names a section by on the way back to an EPUB (`frontmatterSectionTitle`), and the book has fields of
 * its own.
 */
describe('chapterFrontmatter', () => {
  const meta = {
    title: 'Parts and Chapters',
    author: 'Orbis Tester',
    publisher: '',
    language: 'en',
    pubdate: '',
  };
  const fm = chapterFrontmatter(
    meta,
    '2026-09-22',
    'PART I \u2013 CHAPTER V',
    '009 - IV',
    '011 - VI',
    'ebooks/Parts and Chapters.epub'
  );

  it('links the book and names it, as a reading record does', () => {
    expect(fm).toContain('book: "[[ebooks/Parts and Chapters.epub]]"');
    expect(fm).toContain('book_title: "Parts and Chapters"');
  });

  it('writes no empty link when the book has no path', () => {
    const bare = chapterFrontmatter(meta, '2026-09-22', 'I', '', '');
    expect(bare).not.toContain('book: ');
    expect(bare).toContain('book_title: "Parts and Chapters"');
  });

  it('titles the note with the book and the chapter', () => {
    expect(fm).toContain('title: "Parts and Chapters: PART I \u2013 CHAPTER V"');
  });

  it('leaves the chapter field as the chapter alone, for the round trip back to an EPUB', () => {
    expect(fm).toContain('chapter: "PART I \u2013 CHAPTER V"');
  });

  it('still links the contents note by the book title', () => {
    expect(fm).toContain('toc: "[[000 - Parts and Chapters]]"');
  });
});
