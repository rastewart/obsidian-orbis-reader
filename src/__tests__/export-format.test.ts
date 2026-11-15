import { describe, expect, it } from 'vitest';
import type { Bookmark, Highlight, Note } from '../progress';
import {
  annotationVars,
  applyFrontmatterTemplate,
  buildAnnotationBuckets,
  buildChapterFileContent,
  buildChapterFrontmatterBlock,
  buildClipboardMarkdown,
  buildDeepLink,
  buildMocContent,
  buildNotesMarkdown,
  buildPerChapterAnnotBuckets,
  type ChapterPlan,
  chapterFilesToWrite,
  commonVars,
  hasMarksToExport,
  makeNoteSetSlug,
  markPrefix,
  type NotesData,
  renderAnnotationLine,
  renderChapterSection,
  resolveChapterFileName,
  resolveChapterFilePlans,
  resolveChapterOrder,
  selectionVars,
  sortByLoc,
} from '../reader/export-format';
import { DEFAULT_FRONTMATTER_TEMPLATE, DEFAULT_NOTE_STYLE_CONFIG, type NoteStyle } from '../settings';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const cfg = (over: Partial<NoteStyle['config']> = {}): NoteStyle['config'] => ({
  ...DEFAULT_NOTE_STYLE_CONFIG,
  ...over,
});

const hl = (over: Partial<Highlight> = {}): Highlight => ({
  id: 'h1',
  cfiRange: 'epubcfi(/6/4!/2)',
  text: 'a highlight',
  color: '#FFEB3B',
  createdAt: 1000,
  chapter: 'Chapter One',
  chapterHref: 'ch1.html',
  loc: 10,
  ...over,
});

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  cfiRange: 'epubcfi(/6/4!/6)',
  text: 'my thought',
  createdAt: 1000,
  chapter: 'Chapter One',
  chapterHref: 'ch1.html',
  loc: 12,
  ...over,
});

const bm = (over: Partial<Bookmark> = {}): Bookmark => ({
  id: 'b1',
  cfi: 'epubcfi(/6/4!/8)',
  label: 'Bookmark',
  createdAt: 1000,
  chapter: 'Chapter One',
  chapterHref: 'ch1.html',
  loc: 8,
  ...over,
});

const toc = [
  { label: 'Chapter One', href: 'ch1.html' },
  { label: 'Chapter Two', href: 'ch2.html' },
];

const data = (over: Partial<NotesData> = {}): NotesData => ({
  filePath: 'Books/Sample.epub',
  fileBasename: 'Sample',
  meta: {
    title: 'The Sample',
    author: 'A. Writer',
    publisher: 'Pub Co',
    language: 'en',
    pubdate: '2001',
    description: 'desc',
  },
  highlights: [],
  notes: [],
  bookmarks: [],
  tocItems: toc,
  bookSectionCount: 10,
  frontmatterKeyLanguage: 'english',
  ...over,
});

// ── markPrefix ──────────────────────────────────────────────────────────────

describe('markPrefix', () => {
  const marks = [
    {
      id: 'mk_follow',
      name: 'Follow up',
      highlightColor: '#FFEB3B',
      treatment: 'underline' as const,
      treatmentColor: '#000000',
      enabled: true,
    },
    { id: 'mk_bare', name: '', highlightColor: '#A5D6A7', enabled: true },
  ];

  it('emits badge, name and a colon', () => {
    // Markdown has no color, so the badge and the name are the whole of a mark that survives an export.
    expect(markPrefix({ markId: 'mk_follow', color: '#FFEB3B' }, marks)).toBe('🟡➖ Follow up: ');
  });

  it('omits the colon for an unnamed mark, since there is nothing to separate', () => {
    expect(markPrefix({ markId: 'mk_bare', color: '#A5D6A7' }, marks)).toBe('🟢 ');
  });

  it('falls back to the color for an annotation with no mark', () => {
    expect(markPrefix({ color: '#90CAF9' }, marks)).toBe('🔵 ');
  });

  it('falls back when the markId names a mark the book no longer has', () => {
    // A deleted mark, or one dropped by the survivor rule: the annotation still knows its color.
    expect(markPrefix({ markId: 'mk_gone', color: '#CE93D8' }, marks)).toBe('🟣 ');
  });

  it('gives every wash palette color a badge other than 🔖', () => {
    // The wash palette has nine colors, and each needs a badge distinct from the others and from any custom color.
    for (const hex of ['#EF9A9A', '#80CBC4', '#BCAAA4', '#B0BEC5']) {
      expect(markPrefix({ color: hex }, marks)).not.toContain('🔖');
    }
  });

  it('distinguishes two marks that share a color and differ by treatment', () => {
    // A color-only glyph is not enough: `(color, treatment)` is what makes a mark unique, and an export is where that
    // distinction travels furthest.
    const pair = [
      { id: 'a', name: 'A', highlightColor: '#FFEB3B', enabled: true },
      {
        id: 'b',
        name: 'B',
        highlightColor: '#FFEB3B',
        treatment: 'box' as const,
        treatmentColor: '#000000',
        enabled: true,
      },
    ];
    expect(markPrefix({ markId: 'a' }, pair)).not.toBe(markPrefix({ markId: 'b' }, pair));
  });

  it('emits nothing at all when there is neither a mark nor a color', () => {
    // The trailing space lives in the prefix, so an empty one must leave no double space in the line.
    expect(markPrefix({}, marks)).toBe('');
  });
});

describe('exported lines carry the mark', () => {
  const marks = [{ id: 'mk_1', name: 'Follow up', highlightColor: '#FFEB3B', enabled: true }];

  it('renders badge, name and quote in a highlight line', () => {
    const md = buildNotesMarkdown(
      { ...DEFAULT_NOTE_STYLE_CONFIG },
      data({
        marks,
        highlights: [
          {
            id: 'h1',
            cfiRange: 'cfi(/6/4)',
            text: 'the thing he said',
            color: '#FFEB3B',
            markId: 'mk_1',
            createdAt: 1,
            loc: 5,
            chapterHref: 'c1.html',
          },
        ],
      }),
      false
    );
    expect(md).toContain('🟡 Follow up: "the thing he said"');
  });

  it('leaves the line unprefixed when the template drops {{mark}}', () => {
    // Removing the token IS how a style stops exporting marks — no boolean beside it that would make the
    // token silently resolve to nothing.
    const md = buildNotesMarkdown(
      { ...DEFAULT_NOTE_STYLE_CONFIG, highlightLineTemplate: '- "{{selection}}" — {{link}}' },
      data({
        marks,
        highlights: [
          {
            id: 'h1',
            cfiRange: 'cfi(/6/4)',
            text: 'the thing he said',
            color: '#FFEB3B',
            markId: 'mk_1',
            createdAt: 1,
            loc: 5,
            chapterHref: 'c1.html',
          },
        ],
      }),
      false
    );
    expect(md).toContain('- "the thing he said"');
    expect(md).not.toContain('Follow up');
  });
});

describe('renderAnnotationLine', () => {
  it('substitutes tokens and drops unknown ones', () => {
    // Same contract as the frontmatter template: a typo loses a value, it never breaks the file.
    expect(renderAnnotationLine('- {{mark}}{{text}} {{nope}}| {{link}}', { mark: 'M ', text: 'T', link: 'L' })).toBe(
      '- M T | L'
    );
  });

  it('lets a template rearrange the parts', () => {
    // The point of the template: the format is the reader's to choose, not ours.
    expect(
      renderAnnotationLine('[{{mark_name}}] {{mark_badge}} {{selection}}', {
        mark_name: 'Follow up',
        mark_badge: '🟡',
        selection: 'T',
      })
    ).toBe('[Follow up] 🟡 T');
  });
});

describe('annotationVars', () => {
  const marks = [{ id: 'mk_1', name: 'Follow up', highlightColor: '#FFEB3B', enabled: true }];

  it('offers the composed prefix and its parts separately', () => {
    const v = annotationVars({ markId: 'mk_1', color: '#FFEB3B', loc: 12 }, 'the-link', marks);
    expect(v.mark).toBe('🟡 Follow up: ');
    expect(v.mark_badge).toBe('🟡');
    expect(v.mark_name).toBe('Follow up');
    expect(v.loc).toBe('12');
  });

  it('carries no text of its own — each kind adds the texts it has', () => {
    const v = annotationVars({ markId: 'mk_1' }, 'the-link', marks);
    expect('selection' in v).toBe(false);
    expect('note_text' in v).toBe(false);
  });
});

describe('commonVars', () => {
  it('offers where and when for every kind of saved content', () => {
    const v = commonVars({ loc: 51, chapter: 'CHAPTER IX.', createdAt: Date.UTC(2026, 7, 3) }, 'the-link');
    expect(v).toEqual({ link: 'the-link', loc: '51', chapter: 'CHAPTER IX.', date: '2026-08-03' });
  });

  it('resolves the ones a given annotation lacks to empty rather than to "undefined"', () => {
    expect(commonVars({}, 'the-link')).toEqual({ link: 'the-link', loc: '', chapter: '', date: '' });
  });
});

describe('bookmark lines', () => {
  const bm = (over: Partial<Bookmark> = {}): Bookmark => ({
    id: 'b1',
    cfi: 'cfi(/6/4)',
    label: 'CHAPTER IX. · loc. 51',
    createdAt: Date.UTC(2026, 7, 3),
    loc: 51,
    chapter: 'CHAPTER IX.',
    chapterHref: 'ch1.html',
    ...over,
  });

  it('defaults to the built-in line: a bookmark as a location link', () => {
    const buckets = buildAnnotationBuckets(cfg(), data({ bookmarks: [bm()] }));
    const lines = renderChapterSection(buckets.get('ch1.html'), cfg(), data({ bookmarks: [bm()] }));
    expect(lines.join('\n')).toContain('- [loc. 51](obsidian://orbis-nav?file=Books%2FSample.epub&cfi=cfi(%2F6%2F4))');
  });

  it('can say whether it was made while reading or while listening', () => {
    // The one thing about a bookmark that nothing else in an export can tell you.
    const bookmarks = [bm({ kind: 'audio' })];
    const buckets = buildAnnotationBuckets(cfg(), data({ bookmarks }));
    const lines = renderChapterSection(
      buckets.get('ch1.html'),
      cfg({ bookmarkLineTemplate: '- {{kind}} · {{chapter}} · {{date}} — {{link}}' }),
      data({ bookmarks })
    );
    expect(lines.join('\n')).toContain('- audio · CHAPTER IX. · 2026-08-03 —');
  });

  it('reads a legacy bookmark with no kind as one made while reading', () => {
    const bookmarks = [bm()];
    const buckets = buildAnnotationBuckets(cfg(), data({ bookmarks }));
    const lines = renderChapterSection(
      buckets.get('ch1.html'),
      cfg({ bookmarkLineTemplate: '{{kind}}' }),
      data({ bookmarks })
    );
    expect(lines.join('\n')).toContain('reading');
  });
});

describe('selectionVars', () => {
  it('offers the passage raw and as a block, under names that mean one thing each', () => {
    // The same pair on both templates: a highlight's passage and the passage a note hangs on are the same
    // thing. The block is a different SHAPE, so it is a different token rather than an overloaded one.
    expect(selectionVars('the passage')).toEqual({
      selection: 'the passage',
      selection_block: '> "the passage"\n\n',
    });
  });

  it('leaves no stray blockquote when there is no passage', () => {
    // Which is why the quoting lives in the token: a single-line template cannot say "this line only when
    // the value exists".
    expect(selectionVars(undefined)).toEqual({ selection: '', selection_block: '' });
  });

  it('keeps a heading and its paragraph as ONE blockquote', () => {
    // The weld: a passage flattened before it is handed over exports a highlight that began on a heading as `Settings
    // storage Plugin settings are an…`. A blockquote line without `> ` is not a blockquote line, so carrying the break
    // means marking it.
    expect(selectionVars('Settings storage\nPlugin settings are an object.').selection_block).toBe(
      '> "Settings storage\n> Plugin settings are an object."\n\n'
    );
  });

  it('marks the blank line between two quoted paragraphs, or the quote ends there', () => {
    expect(selectionVars('First para.\n\nSecond para.').selection_block).toBe(
      '> "First para.\n> \n> Second para."\n\n'
    );
  });

  it('flattens the same passage for the inline token, which is substituted mid-line', () => {
    expect(selectionVars('Settings storage\nPlugin settings are an object.').selection).toBe(
      'Settings storage Plugin settings are an object.'
    );
  });

  it('KEEPS every line break the book gave it, however it got there', () => {
    // No re-flowing of a passage whose newlines look like an editor's hard wrap: deciding which of an author's breaks
    // were meant is an inference about a book nobody here has read.
    const wrapped = [
      'There is no way to see what you have. The file explorer shows files in folders; the two palette modals —',
      'retired in the library slice, showed only books you had already opened. But the deeper limit is this.',
    ].join('\n');
    expect(selectionVars(wrapped).selection_block).toBe(
      '> "There is no way to see what you have. The file explorer shows files in folders; the two palette modals —\n' +
        '> retired in the library slice, showed only books you had already opened. But the deeper limit is this."\n\n'
    );
  });
});

// ── buildDeepLink ───────────────────────────────────────────────────────────

describe('buildDeepLink', () => {
  it('renders a loc label when a location is given', () => {
    expect(buildDeepLink('Books/A.epub', 'cfi(/6/4)', 42)).toBe(
      '[loc. 42](obsidian://orbis-nav?file=Books%2FA.epub&cfi=cfi(%2F6%2F4))'
    );
  });

  it('falls back to "View in book" without a location', () => {
    expect(buildDeepLink('A.epub', 'x')).toBe('[View in book](obsidian://orbis-nav?file=A.epub&cfi=x)');
  });

  it('url-encodes the file path and cfi', () => {
    const link = buildDeepLink('a b/c.epub', 'epubcfi(/6/4!/2)');
    expect(link).toContain('file=a%20b%2Fc.epub');
    expect(link).toContain('cfi=epubcfi(%2F6%2F4!%2F2)');
  });
});

// ── sortByLoc ─────────────────────────────────────────────────────────────────

describe('sortByLoc', () => {
  it('sorts ascending by loc, undefined last, createdAt tiebreak', () => {
    const items = [
      { loc: undefined, createdAt: 1 },
      { loc: 5, createdAt: 3 },
      { loc: 5, createdAt: 2 },
      { loc: 1, createdAt: 9 },
    ];
    expect(sortByLoc(items).map((i) => `${i.loc ?? 'x'}:${i.createdAt}`)).toEqual(['1:9', '5:2', '5:3', 'x:1']);
  });

  it('does not mutate the input', () => {
    const items = [
      { loc: 2, createdAt: 1 },
      { loc: 1, createdAt: 1 },
    ];
    sortByLoc(items);
    expect(items[0].loc).toBe(2);
  });
});

// ── resolveChapterFileName ────────────────────────────────────────────────────

describe('resolveChapterFileName', () => {
  it('substitutes template tokens', () => {
    expect(
      resolveChapterFileName('{{index}} - {{chapter}} ({{title}}/{{style}})', {
        index: '001',
        chapter: 'Intro',
        title: 'Book',
        style: 'Default',
      })
      // A separator in a token becomes a space rather than vanishing, so `Book/Default` reads as two words — see
      // `sanitizeVaultName`.
    ).toBe('001 - Intro (Book Default)');
  });

  it('falls back when the template renders empty', () => {
    expect(resolveChapterFileName('###', { index: '002', chapter: 'X', title: 'T', style: 'S' })).toBe('002 - X');
  });
});

describe('makeNoteSetSlug', () => {
  it('slugifies the basename and appends the style id', () => {
    expect(makeNoteSetSlug('Pride & Prejudice!', 'abc123')).toBe('pride-prejudice--abc123');
  });
});

// ── applyFrontmatterTemplate ──────────────────────────────────────────────────

describe('applyFrontmatterTemplate', () => {
  it('substitutes known tokens and strips wrapping fences', () => {
    const out = applyFrontmatterTemplate('---\ntitle: {{title}}\nby: {{author}}\n---', data());
    expect(out).toBe('title: The Sample\nby: A. Writer');
  });

  it('renders book_link and filename', () => {
    const out = applyFrontmatterTemplate('link: {{book_link}} file: {{filename}}', data());
    expect(out).toBe('link: [[Books/Sample.epub]] file: Sample');
  });

  it('falls back to the file basename when meta.title is empty', () => {
    const out = applyFrontmatterTemplate('{{title}}', data({ meta: { ...data().meta, title: '' } }));
    expect(out).toBe('Sample');
  });

  it('renders unknown tokens as empty strings', () => {
    expect(applyFrontmatterTemplate('x{{nope}}y', data())).toBe('xy');
  });

  it('renders today as an ISO date', () => {
    expect(applyFrontmatterTemplate('{{today}}', data())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── buildAnnotationBuckets ────────────────────────────────────────────────────

describe('buildAnnotationBuckets', () => {
  it('groups by chapterHref and tracks minLoc', () => {
    const buckets = buildAnnotationBuckets(
      cfg(),
      data({
        highlights: [hl({ loc: 20 }), hl({ id: 'h2', chapterHref: 'ch2.html', chapter: 'Chapter Two', loc: 3 })],
        bookmarks: [bm({ loc: 5 })],
      })
    );
    expect([...buckets.keys()].sort()).toEqual(['ch1.html', 'ch2.html']);
    expect(buckets.get('ch1.html')!.minLoc).toBe(5); // bookmark loc 5 < highlight loc 20
    expect(buckets.get('ch1.html')!.highlights).toHaveLength(1);
    expect(buckets.get('ch2.html')!.minLoc).toBe(3);
  });

  it('respects the include toggles', () => {
    const d = data({ highlights: [hl()], notes: [note()], bookmarks: [bm()] });
    const buckets = buildAnnotationBuckets(cfg({ includeHighlights: false, includeNotes: false }), d);
    const b = buckets.get('ch1.html')!;
    expect(b.highlights).toHaveLength(0);
    expect(b.notes).toHaveLength(0);
    expect(b.bookmarks).toHaveLength(1);
  });

  it('buckets uncategorized annotations under the empty key', () => {
    const buckets = buildAnnotationBuckets(
      cfg(),
      data({ notes: [note({ chapterHref: undefined, chapter: undefined })] })
    );
    expect(buckets.has('')).toBe(true);
    expect(buckets.get('')!.title).toBe('Uncategorized');
  });
});

// ── resolveChapterOrder ───────────────────────────────────────────────────────

describe('resolveChapterOrder', () => {
  it('includes all TOC chapters when chapterScope is "all"', () => {
    const buckets = buildAnnotationBuckets(cfg(), data({ highlights: [hl()] }));
    const { order, hadAllTitles } = resolveChapterOrder(cfg({ chapterScope: 'all' }), buckets, true, data());
    expect(order.map((o) => o.href)).toEqual(['ch1.html', 'ch2.html']);
    expect(hadAllTitles).toBe(true);
  });

  it('includes only chapters with content when scope is "with-content"', () => {
    const buckets = buildAnnotationBuckets(cfg(), data({ highlights: [hl()] }));
    const { order, hadAllTitles } = resolveChapterOrder(cfg({ chapterScope: 'with-content' }), buckets, true, data());
    expect(order.map((o) => o.href)).toEqual(['ch1.html']);
    expect(hadAllTitles).toBe(false);
  });

  /**
   * **The book's order, not the order the reader annotated in.**
   *
   * `buildAnnotationBuckets` returns a `Map`, and a Map's keys come out in insertion order — which is the order the
   * annotations are stored, i.e. when they were made. With `chapterScope: 'all'` the contents walk lays every chapter
   * down first; with *only chapters with content* the bucket order IS the order, so unsorted, a book annotated
   * back-to-front would export back-to-front: Chapter IV above Chapter III.
   */
  it('orders content-bearing chapters by the contents, not by when they were annotated', () => {
    const buckets = buildAnnotationBuckets(
      cfg(),
      // ch2 annotated first, ch1 second — the order they arrive in.
      data({ highlights: [hl({ id: 'h2', chapterHref: 'ch2.html', chapter: 'Chapter Two', loc: 86 }), hl()] })
    );
    const { order } = resolveChapterOrder(cfg({ chapterScope: 'with-content' }), buckets, true, data());
    expect(order.map((o) => o.href)).toEqual(['ch1.html', 'ch2.html']);
  });

  /** A chapter the contents does not name sorts after every one it does, on its first location. */
  it('puts a chapter the contents does not name last', () => {
    const buckets = buildAnnotationBuckets(
      cfg(),
      data({
        highlights: [
          hl({ id: 'hx', chapterHref: 'loose.html', chapter: 'Loose', loc: 1 }),
          hl({ id: 'h2', chapterHref: 'ch2.html', chapter: 'Chapter Two', loc: 50 }),
        ],
      })
    );
    const { order } = resolveChapterOrder(cfg({ chapterScope: 'with-content' }), buckets, true, data());
    expect(order.map((o) => o.href)).toEqual(['ch2.html', 'loose.html']);
  });

  /**
   * A hand-made selection outranks the rule, which is what makes it a selection — the same order the PDF's dialog
   * follows, where ticking a row sets the scope to `custom`.
   */
  it('keeps only the chosen chapters when a selection is given', () => {
    const buckets = buildAnnotationBuckets(cfg(), data({ highlights: [hl()] }));
    const { order } = resolveChapterOrder(cfg({ chapterScope: 'all' }), buckets, true, data(), new Set(['ch2.html']));
    expect(order.map((o) => o.href)).toEqual(['ch2.html']);
  });

  /**
   * **A chapter the contents does not name is always kept.** The picker lists what the contents names, so an
   * uncategorized bucket has no row to untick — excluding it would drop content nobody could see they were dropping.
   */
  it('keeps a chapter the contents does not name, which has no row to untick', () => {
    const buckets = buildAnnotationBuckets(
      cfg(),
      data({ notes: [note({ chapterHref: undefined, chapter: undefined })], highlights: [hl()] })
    );
    const { order } = resolveChapterOrder(cfg({ chapterScope: 'all' }), buckets, true, data(), new Set(['ch2.html']));
    expect(order.map((o) => o.href)).toEqual(['ch2.html', '']);
  });

  it('follows the rule when no selection is given', () => {
    const buckets = buildAnnotationBuckets(cfg(), data({ highlights: [hl()] }));
    const { order } = resolveChapterOrder(cfg({ chapterScope: 'all' }), buckets, true, data());
    expect(order.map((o) => o.href)).toEqual(['ch1.html', 'ch2.html']);
  });

  it('synthesizes an entry for a bucket-only (uncategorized) chapter', () => {
    const buckets = buildAnnotationBuckets(
      cfg(),
      data({ notes: [note({ chapterHref: undefined, chapter: undefined })] })
    );
    const { order } = resolveChapterOrder(cfg({ chapterScope: 'with-content' }), buckets, true, data());
    expect(order).toHaveLength(1);
    expect(order[0].displayLabel).toBe('Uncategorized');
  });
});

// ── renderChapterSection ──────────────────────────────────────────────────────

describe('renderChapterSection', () => {
  it('returns [] for a missing bucket', () => {
    expect(renderChapterSection(undefined, cfg(), data())).toEqual([]);
  });

  it('renders bookmarks, highlights and notes in configured order', () => {
    const buckets = buildAnnotationBuckets(cfg(), data({ highlights: [hl()], notes: [note()], bookmarks: [bm()] }));
    const lines = renderChapterSection(buckets.get('ch1.html'), cfg(), data());
    const text = lines.join('\n');
    expect(text.indexOf('### Bookmarks')).toBeLessThan(text.indexOf('### Passage selections'));
    expect(text.indexOf('### Passage selections')).toBeLessThan(text.indexOf('### Notes'));
  });

  it('prefixes a highlight with its color when the annotation has no mark', () => {
    const buckets = buildAnnotationBuckets(cfg(), data({ highlights: [hl({ color: '#90CAF9', text: 'blue one' })] }));
    const lines = renderChapterSection(buckets.get('ch1.html'), cfg(), data());
    expect(lines.join('\n')).toContain('🔵 "blue one"');
  });

  it('omits it when the template has no {{mark}}', () => {
    const buckets = buildAnnotationBuckets(cfg(), data({ highlights: [hl({ text: 'plain' })] }));
    const lines = renderChapterSection(
      buckets.get('ch1.html'),
      cfg({ highlightLineTemplate: '- "{{selection}}" — {{link}}' }),
      data()
    );
    expect(lines.join('\n')).toContain('- "plain"');
    expect(lines.join('\n')).not.toContain('🟡');
  });

  it('keeps a long highlight WHOLE, with no 300-character cut', () => {
    // No cap: a marks PDF prints the same passage in full and the note a highlight generates keeps it whole, so a note
    // set must not truncate the book's own words mid-word either.
    const long = 'x'.repeat(400);
    const buckets = buildAnnotationBuckets(cfg(), data({ highlights: [hl({ text: long })] }));
    const line = renderChapterSection(buckets.get('ch1.html'), cfg(), data()).find((l) => l.includes('"'))!;
    expect(line).toContain(long);
  });

  it('keeps the inline token on one line, because a newline there would end the list item', () => {
    const buckets = buildAnnotationBuckets(
      cfg(),
      data({ highlights: [hl({ text: 'A heading\nand the paragraph under it.' })] })
    );
    const line = renderChapterSection(buckets.get('ch1.html'), cfg(), data()).find((l) => l.includes('"'))!;
    expect(line).not.toContain('\n');
  });

  it('quotes a note selectedText above the note body', () => {
    const buckets = buildAnnotationBuckets(
      cfg(),
      data({ notes: [note({ selectedText: 'quoted src', text: 'comment' })] })
    );
    const text = renderChapterSection(buckets.get('ch1.html'), cfg(), data()).join('\n');
    expect(text).toContain('> "quoted src"');
    expect(text).toContain('comment — [loc. 12]');
  });
});

// ── buildNotesMarkdown ────────────────────────────────────────────────────────

describe('buildNotesMarkdown', () => {
  it("opens on the BOOK'S title, not the EPUB file's name", () => {
    // Not `fileBasename`, the weakest of the three identifiers to hand: not the book's title, not the note's own
    // filename, and already stated in the frontmatter as `filename`.
    const md = buildNotesMarkdown(
      cfg(),
      data({ fileBasename: 'design', meta: { ...data().meta, title: 'Orbis Reader — Design Documentation' } })
    );
    expect(md).toContain('\n# Orbis Reader — Design Documentation\n');
    expect(md).not.toContain('\n# design\n');
  });

  it("falls back to the file's name for a book whose metadata has no title", () => {
    const md = buildNotesMarkdown(cfg(), data({ fileBasename: 'design', meta: { ...data().meta, title: '  ' } }));
    expect(md).toContain('\n# design\n');
  });

  it('names the book in `book` and `book_title` from the default template, once each', () => {
    // The pair a chapter note and a reading record carry, so a Base grouping by `book_title` finds this note too.
    const count = (md: string, key: string) => md.split('\n').filter((l) => l.startsWith(`${key}:`)).length;
    const md = buildNotesMarkdown(cfg(), data());
    expect(md).toContain('book: "[[Books/Sample.epub]]"');
    expect(md).toContain('book_title: "The Sample"');
    expect(count(md, 'book')).toBe(1);
    expect(count(md, 'book_title')).toBe(1);
  });

  it('titles a single note by `{{subject}}`, which is the book, and "Notes"', () => {
    expect(buildNotesMarkdown(cfg(), data())).toContain('title: "The Sample Notes"');
  });

  /**
   * Template values are YAML-escaped, as title notes' are: an unescaped `"` ends the string early and a multi-line
   * `dc:title` continues at column 0 — invalid YAML either way, and Obsidian drops every property.
   */
  it("escapes the book's metadata where the template places it", () => {
    const md = buildNotesMarkdown(cfg(), data({ meta: { ...data().meta, title: 'The "Sample"\nPart Two' } }));
    expect(md).toContain('title: "The \\"Sample\\"\\nPart Two Notes"');
    expect(md).toContain('book_title: "The \\"Sample\\"\\nPart Two"');
  });

  it('produces frontmatter, a contents list, and chapter sections', () => {
    const md = buildNotesMarkdown(cfg(), data({ highlights: [hl({ text: 'quote A' })], bookmarks: [bm()] }));
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('# The Sample');
    expect(md).toContain('## Contents');
    expect(md).toContain('- [[#Chapter One]]');
    expect(md).toContain('### Passage selections');
    expect(md).toContain('quote A');
  });

  // Every note in a set carries the BOOK's title, so a catalog that trusted `title` alone would list each one as a book
  // of its own. The stamp sits outside the user's template, which they are free to rewrite.
  it('says what it is, whatever the frontmatter template says', () => {
    const md = buildNotesMarkdown(cfg({ frontmatterTemplate: 'title: "{{title}}"' }), data({ highlights: [hl()] }));
    expect(md).toContain('orbis_generated: "note-set"');
  });

  it('omits frontmatter when includeFrontmatter is false', () => {
    const md = buildNotesMarkdown(cfg(), data({ highlights: [hl()] }), false);
    expect(md.startsWith('---')).toBe(false);
    expect(md).not.toContain('# Sample');
  });

  it('renders headings-only when no content types are enabled', () => {
    const md = buildNotesMarkdown(
      cfg({ includeBookmarks: false, includeHighlights: false, includeNotes: false, includeChapterHeadings: true }),
      data()
    );
    expect(md).toContain('Chapter One');
    expect(md).toContain('Chapter Two');
    expect(md).not.toContain('###');
  });

  it('reports no content when there is nothing to export', () => {
    const md = buildNotesMarkdown(cfg({ includeChapterHeadings: false }), data());
    expect(md).toContain('*No content to export.*');
  });

  it('links each chapter back into the book on the line under its heading', () => {
    const md = buildNotesMarkdown(cfg(), data({ highlights: [hl()] }));
    expect(md).toContain(
      '\n## Chapter One\n\n[↗ Open in book](obsidian://orbis-nav?file=Books%2FSample.epub&href=ch1.html)\n'
    );
  });

  /**
   * **The Contents list has to land.** Obsidian compares a `[[#…]]` target with each heading's SOURCE text, both
   * through `stripHeading` (ASCII punctuation to a space, whitespace collapsed, case ignored — the 1.14.4 bundle). A
   * deep link inside the heading put its URL into that text, and every Contents entry silently went nowhere.
   */
  it('gives every Contents entry a heading Obsidian will resolve it to', () => {
    const stripHeading = (s: string) =>
      s
        .replace(/[!"#$%&()*+,.:;<=>?@^`{|}~/[\]\\\r\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const md = buildNotesMarkdown(
      cfg(),
      data({
        tocItems: [
          { label: 'Chapter One', href: 'ch1.html' },
          { label: 'Part #2 | The Weir: ^Again', href: 'ch2.html' },
        ],
        highlights: [hl(), hl({ id: 'h2', chapter: 'Part #2 | The Weir: ^Again', chapterHref: 'ch2.html' })],
      })
    );
    const headings = [...md.matchAll(/^#{1,6} (.+)$/gm)].map((m) => stripHeading(m[1].trim()));
    const targets = [...md.matchAll(/^- \[\[#([^\]|]+)\]\]$/gm)].map((m) => m[1]);
    expect(targets).toHaveLength(2);
    for (const target of targets) expect(headings).toContain(stripHeading(target));
  });
});

/**
 * **A note file has to say where a chapter starts.**
 *
 * An annotation is filed under the DEEPEST contents entry that matches it, so grouped by that key alone the file would
 * be a flat run of subheadings — `Settings storage`, `Phase 7: Accessibility` — with nothing marking which document
 * each came from or where one ended. On a book converted from a folder of notes, where the converter writes a nav entry
 * per heading, that would be the whole file. The chapter is the heading, its subheadings sit under it, and the kind
 * headings move one level down with them.
 */
describe('buildNotesMarkdown over a nested contents page', () => {
  /** Two documents, each with headings — and notes taken under the headings, never on the document itself. */
  const NESTED = [
    {
      label: 'Plugin Architecture Overview',
      href: 'sect2.xhtml',
      subitems: [
        { label: 'Settings storage', href: 'sect2.xhtml#settings-storage' },
        { label: 'Commands', href: 'sect2.xhtml#commands' },
      ],
    },
    {
      label: 'Orbis Reader — Roadmap',
      href: 'sect3.xhtml',
      subitems: [{ label: 'Phase 8', href: 'sect3.xhtml#phase-8' }],
    },
  ];

  const nested = (over: Partial<NotesData> = {}) =>
    data({
      tocItems: NESTED,
      notes: [
        note({ id: 'n1', chapter: 'Settings storage', chapterHref: 'sect2.xhtml#settings-storage', loc: 10 }),
        note({ id: 'n2', chapter: 'Commands', chapterHref: 'sect2.xhtml#commands', loc: 12 }),
        note({ id: 'n3', chapter: 'Phase 8', chapterHref: 'sect3.xhtml#phase-8', loc: 31 }),
      ],
      ...over,
    });

  /**
   * Every heading in the body, in order — asserted as one list because the STRUCTURE is the thing under test, and
   * because `toContain` cannot tell `## X` from `### X`: three hashes contain two.
   */
  const headings = (md: string): string[] =>
    md.split('\n').filter((line) => /^#{2,4} /.test(line) && line !== '## Contents');

  it('nests the file as chapter → subheading → kind', () => {
    expect(headings(buildNotesMarkdown(cfg(), nested()))).toEqual([
      '## Plugin Architecture Overview',
      '### Settings storage',
      '#### Notes',
      '### Commands',
      '#### Notes',
      '## Orbis Reader — Roadmap',
      '### Phase 8',
      '#### Notes',
    ]);
  });

  it('does not repeat the chapter name inside its own subheading', () => {
    // A label that repeats somewhere in the book is disambiguated with its parent — "Plugin Architecture
    // Overview – Commands" — which is what a FLAT list needs and what nesting makes redundant: under the heading
    // it qualifies with, it is the chapter's name twice. The chapter keeps the qualified form; it has no heading
    // above it to be told apart by.
    const collides = [
      {
        label: 'Plugin Architecture Overview',
        href: 'sect2.xhtml',
        subitems: [{ label: 'Commands', href: 'sect2.xhtml#commands' }],
      },
      {
        label: 'Orbis Reader — Roadmap',
        href: 'sect3.xhtml',
        subitems: [{ label: 'Commands', href: 'sect3.xhtml#roadmap-commands' }],
      },
    ];
    const md = buildNotesMarkdown(
      cfg(),
      nested({
        tocItems: collides,
        notes: [
          note({ id: 'n1', chapter: 'Commands', chapterHref: 'sect2.xhtml#commands', loc: 12 }),
          note({ id: 'n2', chapter: 'Commands', chapterHref: 'sect3.xhtml#roadmap-commands', loc: 31 }),
        ],
      })
    );
    expect(headings(md)).toEqual([
      '## Plugin Architecture Overview',
      '### Commands',
      '#### Notes',
      '## Orbis Reader — Roadmap',
      '### Commands',
      '#### Notes',
    ]);
  });

  it('links the chapter heading to the document, not to its first subheading', () => {
    const md = buildNotesMarkdown(cfg(), nested());
    expect(md).toContain(
      '\n## Plugin Architecture Overview\n\n[↗ Open in book](obsidian://orbis-nav?file=Books%2FSample.epub&href=sect2.xhtml)'
    );
    expect(md).toContain(
      '\n### Settings storage\n\n[↗ Open in book](obsidian://orbis-nav?file=Books%2FSample.epub&href=sect2.xhtml%23settings-storage)'
    );
  });

  it('lists the chapters in Contents, not every subheading', () => {
    const md = buildNotesMarkdown(cfg(), nested());
    expect(md).toContain('- [[#Plugin Architecture Overview]]');
    expect(md).toContain('- [[#Orbis Reader — Roadmap]]');
    expect(md).not.toContain('- [[#Settings storage]]');
  });

  /**
   * A mark made above a document's first heading belongs to the document, so it keeps the chapter's own depth.
   * Narrowed to the chapters that hold something, so the assertion is about depth rather than about which
   * chapters the `all` scope lays down.
   */
  it('writes a chapter’s own marks directly under it', () => {
    const md = buildNotesMarkdown(
      cfg({ chapterScope: 'with-content' }),
      nested({
        notes: [note({ id: 'n0', chapter: 'Plugin Architecture Overview', chapterHref: 'sect2.xhtml', loc: 5 })],
      })
    );
    expect(headings(md)).toEqual(['## Plugin Architecture Overview', '### Notes']);
  });

  it('nests the headings-only export the same way', () => {
    const md = buildNotesMarkdown(
      cfg({ includeBookmarks: false, includeHighlights: false, includeNotes: false, includeChapterHeadings: true }),
      nested()
    );
    expect(headings(md)).toEqual([
      '## Plugin Architecture Overview',
      '### Settings storage',
      '### Commands',
      '## Orbis Reader — Roadmap',
      '### Phase 8',
    ]);
  });

  /** A flat contents page has no subheadings to nest, so nesting must leave it exactly as it is. */
  it('leaves a flat contents page alone', () => {
    const flat = buildNotesMarkdown(cfg({ chapterScope: 'with-content' }), data({ highlights: [hl()] }));
    expect(headings(flat)).toEqual(['## Chapter One', '### Passage selections']);
  });
});

// ── buildClipboardMarkdown ────────────────────────────────────────────────────

describe('buildClipboardMarkdown', () => {
  it('formats highlights grouped by chapter with a "View in book" link', () => {
    const md = buildClipboardMarkdown(
      'highlights',
      data({ highlights: [hl({ text: 'hi there', color: '#FFEB3B', loc: undefined })] })
    );
    expect(md).toContain('## Chapter One');
    expect(md).toContain('🟡 "hi there"');
    // Same wording as the notes exporter's link.
    expect(md).toContain('View in book');
  });

  it('orders chapters by their minimum location', () => {
    const md = buildClipboardMarkdown(
      'highlights',
      data({
        highlights: [
          hl({ id: 'late', chapterHref: 'ch2.html', chapter: 'Chapter Two', loc: 50, text: 'late' }),
          hl({ id: 'early', loc: 2, text: 'early' }),
        ],
      })
    );
    expect(md.indexOf('Chapter One')).toBeLessThan(md.indexOf('Chapter Two'));
  });

  it('formats notes with a quoted source line', () => {
    const md = buildClipboardMarkdown(
      'notes',
      data({ notes: [note({ selectedText: 'src', text: 'body', color: undefined })] })
    );
    expect(md).toContain('> "src"');
    expect(md).toContain('body — [loc. 12]');
  });

  it('formats bookmarks as deep-link rows', () => {
    const md = buildClipboardMarkdown('bookmarks', data({ bookmarks: [bm({ loc: 7 })] }));
    expect(md).toContain('## Chapter One');
    expect(md).toContain('- [loc. 7]');
  });
});

// ── buildChapterFrontmatterBlock ──────────────────────────────────────────────

describe('buildChapterFrontmatterBlock', () => {
  const block = (over: Partial<Record<string, unknown>> = {}) =>
    buildChapterFrontmatterBlock(
      (over.chapterNum as number) ?? 3,
      (over.title as string) ?? 'Chapter Three',
      (over.sectionIndex as number) ?? 5,
      (over.noteSetSlug as string) ?? 'sample--x',
      (over.prevPath as string | null) ?? null,
      (over.nextPath as string | null) ?? null,
      (over.hasBookmarks as boolean) ?? true,
      (over.hasHighlights as boolean) ?? false,
      (over.hasNotes as boolean) ?? true,
      (over.userTemplate as string) ?? '',
      'Notes/003.md',
      (over.tocHref as string | undefined) ?? 'ch3.html',
      data()
    );

  it('emits the system keys with canonical names in english mode', () => {
    const fm = block();
    expect(fm.startsWith('---\n')).toBe(true);
    expect(fm).toContain('chapter: 3');
    expect(fm).toContain('book: "[[Books/Sample.epub]]"');
    expect(fm).toContain('book_title: "The Sample"');
    expect(fm).toContain('note_set: "sample--x"');
    expect(fm).toContain('has_bookmarks: true');
    expect(fm).toContain('has_passage_selections: false');
    expect(fm).toContain('has_notes: true');
    expect(fm).toContain('toc: "[[000 - The Sample]]"');
    expect(fm).toContain('open_chapter: "obsidian://orbis-nav?file=Books%2FSample.epub&href=ch3.html"');
  });

  it('includes prev/next wikilinks only when provided', () => {
    expect(block({ prevPath: null, nextPath: 'Notes/004 - Next.md' })).toContain('next: "[[004 - Next]]"');
    expect(block({ prevPath: null, nextPath: null })).not.toContain('next:');
  });

  it('titles the note from the template, with `{{subject}}` as the book AND the chapter', () => {
    // The chapter alone would read the same in every book's note set; and without "Notes", the same as the chapter note
    // Save as Markdown writes of the book's own text.
    const fm = block({ userTemplate: DEFAULT_FRONTMATTER_TEMPLATE });
    expect(fm).toContain('title: "The Sample: Chapter Three Notes"');
    expect(fm).toContain('book_title: "The Sample"');
    expect(fm.match(/^title: /gm)).toHaveLength(1);
    expect(fm.match(/^book_title: /gm)).toHaveLength(1);
  });

  it('writes no title when the template has none — the template owns it', () => {
    expect(block({ userTemplate: 'custom: keep-me' })).not.toMatch(/^title: /m);
  });

  it('escapes double quotes in the chapter title', () => {
    expect(block({ title: 'He said "hi"', userTemplate: 'title: "{{subject}}"' })).toContain(
      'title: "The Sample: He said \\"hi\\""'
    );
  });

  it('strips user-template keys that collide with system keys', () => {
    const fm = block({ userTemplate: 'chapter: 999\ncustom: keep-me' });
    expect(fm).toContain('custom: keep-me');
    expect(fm).not.toContain('chapter: 999');
    // the system chapter key is still present exactly once (^ avoids matching open_chapter:)
    expect(fm.match(/^chapter: /gm)).toHaveLength(1);
  });
});

// ── buildPerChapterAnnotBuckets ───────────────────────────────────────────────

describe('buildPerChapterAnnotBuckets', () => {
  it('keys by chapterHref and honors toggles', () => {
    const buckets = buildPerChapterAnnotBuckets(
      cfg({ includeBookmarks: false }),
      data({ highlights: [hl()], bookmarks: [bm()] })
    );
    expect(buckets.get('ch1.html')!.highlights).toHaveLength(1);
    expect(buckets.get('ch1.html')!.bookmarks).toHaveLength(0);
  });
});

// ── resolveChapterFilePlans ───────────────────────────────────────────────────

describe('resolveChapterFilePlans', () => {
  const entries = [
    { href: 'ch1.html', label: 'Intro', displayLabel: 'Intro', tocIndex: 0 },
    { href: 'ch2.html', label: 'Intro', displayLabel: 'Intro', tocIndex: 4 },
  ];

  it('names files from the template with a zero-padded index', () => {
    const plans = resolveChapterFilePlans(entries, 5, 'Notes/Sample', cfg(), 'Default', data());
    expect(plans[0].fileName).toBe('001 - Intro');
    expect(plans[0].filePath).toBe('Notes/Sample/001 - Intro.md');
  });

  it('disambiguates duplicate file names with a numeric suffix', () => {
    // Default template prefixes with the index, so same-label chapters stay distinct.
    const plans = resolveChapterFilePlans(entries, 5, 'Notes/Sample', cfg(), 'Default', data());
    expect(plans.map((p) => p.fileName)).toEqual(['001 - Intro', '002 - Intro']);
    // A template that ignores the index forces a real collision → numeric suffix.
    const plansSame = resolveChapterFilePlans(
      entries,
      5,
      'F',
      cfg({ chapterFileTemplate: '{{chapter}}' }),
      'D',
      data()
    );
    expect(plansSame.map((p) => p.fileName)).toEqual(['Intro', 'Intro-2']);
  });

  it('names chapters with the default template when the style emptied its own', () => {
    // The settings field shows the default as its hint, so an emptied or blank template has to mean exactly that.
    const named = (chapterFileTemplate: string) =>
      resolveChapterFilePlans(entries, 5, 'F', cfg({ chapterFileTemplate }), 'D', data()).map((p) => p.fileName);
    const byDefault = named('{{index}} - {{chapter}}');
    expect(named('')).toEqual(byDefault);
    expect(named('   ')).toEqual(byDefault);
  });

  it('computes a proportional sectionIndex', () => {
    // tocIndex 4 of T=5 over N-1=9 sections → round(4*9/4) = 9
    const plans = resolveChapterFilePlans(entries, 5, 'F', cfg(), 'D', data({ bookSectionCount: 10 }));
    expect(plans[1].sectionIndex).toBe(9);
  });
});

// ── buildChapterFileContent ───────────────────────────────────────────────────

describe('buildChapterFileContent', () => {
  const plan: ChapterPlan = {
    href: 'ch1.html',
    label: 'Chapter One',
    displayLabel: 'Chapter One',
    tocIndex: 0,
    fileName: '001 - Chapter One',
    filePath: 'Notes/001 - Chapter One.md',
    sectionIndex: 0,
  };

  it('renders frontmatter, a linked heading, and annotation sections', () => {
    const bucket = { bookmarks: [bm()], highlights: [hl({ text: 'hl text' })], notes: [] };
    const content = buildChapterFileContent(plan, 1, null, 'Notes/002.md', bucket, cfg(), 'slug', data());
    expect(content).toContain('---\n');
    expect(content).toContain(
      '\n# Chapter One\n\n[↗ Open in book](obsidian://orbis-nav?file=Books%2FSample.epub&href=ch1.html)\n'
    );
    expect(content).toContain('## Bookmarks');
    expect(content).toContain('## Passage selections');
    expect(content).toContain('hl text');
    expect(content).not.toContain('## Notes');
  });

  it('omits the nav link when the chapter has no href', () => {
    const content = buildChapterFileContent({ ...plan, href: '' }, 1, null, null, undefined, cfg(), 'slug', data());
    expect(content).toContain('# Chapter One');
    expect(content).not.toContain('↗');
  });

  /**
   * **A chapter file is a chapter, so its subheadings are headings inside it.**
   *
   * A file per contents entry at any depth would make a document's headings sibling FILES, with the document itself
   * nowhere.
   */
  describe('with subheadings beneath it', () => {
    const sections = [
      {
        entry: { href: 'ch1.html#a', label: 'Part A', displayLabel: 'Part A' },
        bucket: { bookmarks: [], highlights: [], notes: [note({ id: 'na' })] },
      },
      {
        entry: { href: 'ch1.html#b', label: 'Part B', displayLabel: 'Part B' },
        bucket: { bookmarks: [], highlights: [], notes: [note({ id: 'nb' })] },
      },
    ];
    const content = buildChapterFileContent(plan, 1, null, null, undefined, cfg(), 'slug', data(), sections);

    it('writes each subheading under the chapter, its marks one level deeper', () => {
      expect(content).toContain(
        '\n## Part A\n\n[↗ Open in book](obsidian://orbis-nav?file=Books%2FSample.epub&href=ch1.html%23a)\n'
      );
      expect(content).toContain('\n### Notes');
      // The chapter's own name stays the file's only `#`.
      expect(content.split('\n').filter((l) => /^# /.test(l))).toHaveLength(1);
    });

    it('keeps them in contents order', () => {
      expect(content.indexOf('Part A')).toBeLessThan(content.indexOf('Part B'));
    });

    /** The bases read these flags, and a chapter whose every note sits under a heading still HAS notes. */
    it('counts the subheadings’ marks in the frontmatter flags', () => {
      expect(content).toContain('has_notes: true');
    });

    it('leaves a chapter with no subheadings exactly as it was', () => {
      const plainBucket = { bookmarks: [], highlights: [], notes: [note()] };
      const plain = buildChapterFileContent(plan, 1, null, null, plainBucket, cfg(), 'slug', data());
      expect(plain).toContain('\n## Notes');
      expect(plain).not.toContain('### Notes');
    });
  });
});

// ── buildMocContent ───────────────────────────────────────────────────────────

describe('buildMocContent', () => {
  it('embeds the note-set filter and book metadata', () => {
    const moc = buildMocContent({
      bookTitle: 'The Sample',
      bookLinkPath: 'Books/Sample.epub',
      author: 'A. Writer',
      styleName: 'Default',
      noteSetSlug: 'sample--x',
    });
    expect(moc).toContain('orbis_generated: "note-set"');
    expect(moc).toContain('# The Sample — Notes');
    expect(moc).toContain('title: "The Sample Notes"');
    expect(moc).toContain('book: "[[Books/Sample.epub]]"');
    expect(moc).toContain('book_title: "The Sample"');
    expect(moc).toContain('- note_set == "sample--x"');
    // The set's id on the contents note too, so a Replace knows it as the set's — and the Base leaves it out.
    expect(moc).toContain('note_set: "sample--x"');
    expect(moc).toContain('- file.path != this.file.path');
    expect(moc).toContain('```base');
  });
});

/**
 * The gate on `Save annotations as PDF`, and the one case that is easy to get wrong.
 *
 * A bookmarks-only book must NOT offer it: the digest never reads `bookmarks`, so the command would write an
 * empty file. If this is ever widened to "anything the reader added", that is the case it breaks — and it breaks
 * as a menu item that quietly produces nothing, which nobody reports.
 */
describe('what Save annotations as PDF can draw', () => {
  const book = (h: number, n: number, b: number) => ({
    highlights: Array.from({ length: h }, () => ({}) as Highlight),
    notes: Array.from({ length: n }, () => ({}) as Note),
    bookmarks: Array.from({ length: b }, () => ({}) as Bookmark),
  });

  it('has nothing to draw on an untouched book', () => {
    expect(hasMarksToExport(book(0, 0, 0))).toBe(false);
  });

  it('HAS NOTHING TO DRAW on a book with only bookmarks', () => {
    expect(hasMarksToExport(book(0, 0, 3))).toBe(false);
  });

  it('has something once a passage or a note is saved', () => {
    for (const data of [book(1, 0, 0), book(0, 1, 0), book(1, 1, 1)]) expect(hasMarksToExport(data)).toBe(true);
  });
});

// A book folder with no annotation kinds is a folder of empty chapter notes — one per chapter — to take notes in.
describe('chapterFilesToWrite', () => {
  const groups = [{ chapter: { href: 'c1' } }, { chapter: { href: 'c2' } }, { chapter: { href: 'c3' } }];
  const content: Record<string, number> = { c1: 0, c2: 4, c3: 0 };
  const contentIn = (g: { chapter: { href: string } }) => content[g.chapter.href];
  const kinds = { includeBookmarks: true, includeHighlights: true, includeNotes: true };
  const none = { includeBookmarks: false, includeHighlights: false, includeNotes: false };
  const hrefs = (gs: { chapter: { href: string } }[]) => gs.map((g) => g.chapter.href);

  it('writes every chapter when the rule is every chapter', () => {
    expect(hrefs(chapterFilesToWrite(groups, { ...kinds, chapterFilesScope: 'all' }, null, contentIn))).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('writes only the chapters with content when the rule says so', () => {
    expect(
      hrefs(chapterFilesToWrite(groups, { ...kinds, chapterFilesScope: 'with-content' }, null, contentIn))
    ).toEqual(['c2']);
  });

  it('writes every chapter when no annotation kind is on, whatever the rule', () => {
    expect(hrefs(chapterFilesToWrite(groups, { ...none, chapterFilesScope: 'with-content' }, null, () => 0))).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('writes the hand-picked chapters over the rule', () => {
    const picked = new Set(['c3']);
    expect(hrefs(chapterFilesToWrite(groups, { ...none, chapterFilesScope: 'all' }, picked, contentIn))).toEqual([
      'c3',
    ]);
  });
});

// ── A single note leaving the vault ──────────────────────────────────────────

describe('buildNotesMarkdown, exported or shared', () => {
  const out = (d: NotesData) => buildNotesMarkdown(cfg(), d, true, undefined, true);
  const book = data({
    highlights: [hl()],
    notes: [
      note({
        text: 'see [[Other Note|the other]], [[Folder/Plan#Step two]] and [the site](https://example.com) ![[pic.png]]',
      }),
    ],
    bookmarks: [bm()],
  });

  it('links into nothing it cannot reach: no deep links, no wiki links, no Open in book', () => {
    const md = out(book);
    expect(md).not.toContain('obsidian://');
    expect(md).not.toContain('[[');
    expect(md).not.toContain('Open in book');
  });

  it('keeps each location as text, and names the book in plain text', () => {
    const md = out(book);
    expect(md).toContain('loc. 10');
    expect(md).toContain('book: "Sample.epub"');
  });

  it('writes the Contents as Markdown links to the chapters’ GitHub anchors', () => {
    expect(out(book)).toContain('- [Chapter One](#chapter-one)');
  });

  it('turns links to other notes in what you wrote into their words, and keeps web links', () => {
    const md = out(book);
    expect(md).toContain('see the other, Plan > Step two and [the site](https://example.com)');
    expect(md).not.toContain('pic.png');
  });

  /** GitHub numbers a repeated heading from the second: the chapter's own Notes section comes first. */
  it('finds a chapter’s anchor after a heading of the same name', () => {
    const md = out(
      data({
        tocItems: [
          { label: 'Chapter One', href: 'ch1.html' },
          { label: 'Notes', href: 'notes.html' },
        ],
        notes: [note()],
        highlights: [hl({ id: 'h2', chapter: 'Notes', chapterHref: 'notes.html', loc: 50 })],
      })
    );
    expect(md).toContain('- [Notes](#notes-1)');
    expect(md).toContain('- [Chapter One](#chapter-one)');
  });

  /**
   * **In the vault, the same chapter needs a block.** `[[#Notes]]` goes to the first heading called Notes — the
   * chapter's own section — and no heading path reaches a `##` past a deeper heading of its name. Its ↗ Open in book
   * line takes a block id, and the Contents links to that.
   */
  it('links a chapter whose name an earlier heading has to a block on its Open in book line, in the vault', () => {
    const md = buildNotesMarkdown(
      cfg(),
      data({
        tocItems: [
          { label: 'Chapter One', href: 'ch1.html' },
          { label: 'Notes', href: 'notes.html' },
        ],
        notes: [note()],
        highlights: [hl({ id: 'h2', chapter: 'Notes', chapterHref: 'notes.html', loc: 50 })],
      })
    );
    expect(md).toContain('- [[#Chapter One]]');
    expect(md).toContain('- [[#^orbis-chapter-2|Notes]]');
    expect(md).not.toContain('- [[#Notes]]');
    expect(md).toMatch(/## Notes\n\n\[↗ Open in book\]\([^)]*\) \^orbis-chapter-2\n/);
    // Chapter One's heading is the first of its name, so its jump line carries no block id.
    expect(md).not.toContain('^orbis-chapter-1');
  });

  it('is unchanged in the vault', () => {
    const md = buildNotesMarkdown(cfg(), book);
    expect(md).toContain('[[#Chapter One]]');
    expect(md).toContain('obsidian://orbis-nav');
    expect(md).toContain('book: "[[Books/Sample.epub]]"');
  });
});
