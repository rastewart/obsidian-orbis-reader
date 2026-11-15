import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
  type ChapterData,
  collectByTocAnchors,
  type ExtractionCtx,
  type ExtractOptions,
  type RawSection,
} from '../book-extractor';
import {
  ExportLinks,
  githubSlug,
  HeadingOrder,
  LINK_ATTR,
  PieceNotes,
  singleNoteChapterHeadings,
} from '../export-links';
import { createTurndownService } from '../turndown-rules';

// A small book, converted the way Save as Markdown converts one, then linked the way it links one.

function section(html: string, id: string): RawSection {
  return {
    linear: true,
    id,
    createDocument: async () => new DOMParser().parseFromString(html, 'text/html'),
  } as unknown as RawSection;
}

async function convert(
  files: Record<string, string>,
  toc: { label: string; href: string }[],
  opts: Partial<ExtractOptions> = {}
) {
  const names = Object.keys(files);
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
    assetsFolder: 'assets',
    app: {} as App,
    imgCounterRef: { value: 0 },
    hrefCache: new Map(),
    dbg: () => undefined,
    total: names.length,
    // As `exportLinksFor` builds it: a note handed to `deliver` leaves the vault, so its links are `portable`.
    links: new ExportLinks(
      options.sectionIndexForHref,
      options.deliver ? 'portable' : (options.imageFormat ?? 'wiki'),
      (html) => td.turndown(html)
    ),
  };
  const chapterMap = new Map<string, ChapterData>();
  const chapterOrder: string[] = [];
  await collectByTocAnchors(
    names.map((n) => section(files[n], n)),
    ctx,
    chapterMap,
    chapterOrder
  );
  const text = (key: string) => (chapterMap.get(key)?.parts ?? []).join('\n\n');
  return { ctx, chapterMap, chapterOrder, text };
}

/** A book folder: each exported piece is its own note, named as the export names them. */
function asFolder(r: Awaited<ReturnType<typeof convert>>, names: Record<string, string>) {
  const notes = new PieceNotes();
  for (const [key, file] of Object.entries(names)) {
    notes.place(key, { file });
    notes.text(file, r.text(key));
  }
  return (key: string) => notes.render(r.ctx.links, r.text(key));
}

const BOOK = {
  'toc.xhtml': [
    '<h1>Contents</h1>',
    '<p><a href="one.xhtml">One</a></p>',
    '<p><a href="two.xhtml#c2">Two</a></p>',
    '<p><a href="two.xhtml#sub">The subsection</a></p>',
    '<p><a href="two.xhtml#mid">A paragraph</a></p>',
    '<p><a href="two.xhtml#nowhere">A missing anchor</a></p>',
    '<p>See <a href="https://example.com/about">the site</a> and <a href="javascript:alert(1)">this</a>.</p>',
  ].join(''),
  'one.xhtml': '<h1>One</h1><p>First chapter text.</p>',
  'two.xhtml':
    '<h1 id="c2">Two</h1><p>Second chapter.</p><p id="mid">A paragraph with an id.</p>' +
    '<h2 id="sub">Subsection</h2><p>More.</p>',
};
const TOC = [
  { label: 'Contents', href: 'toc.xhtml' },
  { label: 'One', href: 'one.xhtml' },
  { label: 'Two', href: 'two.xhtml' },
];
const FILES = { 'toc.xhtml': '001 - Contents', 'one.xhtml': '002 - One', 'two.xhtml': '003 - Two' };

describe('links in a book folder', () => {
  it('turns a contents page into links to the chapters', async () => {
    const r = await convert(BOOK, TOC);
    const md = asFolder(r, FILES)('toc.xhtml');
    expect(md).toContain('[[002 - One|One]]');
    // An `id` on the chapter's own opening heading is the chapter, not a heading inside it.
    expect(md).toContain('[[003 - Two|Two]]');
  });

  it('links a heading inside a chapter when it is the only one of its name', async () => {
    const md = asFolder(await convert(BOOK, TOC), FILES)('toc.xhtml');
    expect(md).toContain('[[003 - Two#Subsection|The subsection]]');
  });

  it('leaves a link into the middle of a paragraph, or to an id the book lacks, as its text', async () => {
    const md = asFolder(await convert(BOOK, TOC), FILES)('toc.xhtml');
    expect(md).toContain('A paragraph');
    expect(md).not.toContain('|A paragraph]]');
    expect(md).toContain('A missing anchor');
    expect(md).not.toContain('|A missing anchor]]');
  });

  it('keeps a web link, and never a script', async () => {
    const md = asFolder(await convert(BOOK, TOC), FILES)('toc.xhtml');
    expect(md).toContain('[the site](https://example.com/about)');
    expect(md).not.toContain('javascript');
    expect(md).toContain('and this.');
  });

  it('writes no placeholder into the text it hands back', async () => {
    const md = asFolder(await convert(BOOK, TOC), FILES)('toc.xhtml');
    // The placeholder alphabet is U+E000–U+E0FF; none of it may reach a note.
    expect(Array.from(md).some((c) => c.charCodeAt(0) >= 0xe000 && c.charCodeAt(0) <= 0xe0ff)).toBe(false);
  });

  it('leaves the link as text when the chapter it points at was not exported', async () => {
    const r = await convert(BOOK, TOC, { selectedChapterHrefs: new Set(['toc.xhtml', 'one.xhtml']) });
    const md = asFolder(r, { 'toc.xhtml': '001 - Contents', 'one.xhtml': '002 - One' })('toc.xhtml');
    expect(md).toContain('[[002 - One|One]]');
    expect(md).not.toContain('003 - Two');
    expect(md).toContain('Two');
  });

  /**
   * **Obsidian sends a link to a repeated heading to the FIRST one**, silently — in a book folder, a heading only
   * has to be unique in its own note, but a repeat inside that note is the wrong place, not a working link.
   */
  it('leaves a link to a repeated heading as text', async () => {
    const book = {
      'toc.xhtml': '<p><a href="two.xhtml#n2">Second notes</a></p>',
      'two.xhtml': '<h1>Two</h1><h2 id="n1">Notes</h2><p>a</p><h2 id="n2">Notes</h2><p>b</p>',
    };
    const r = await convert(book, [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Two', href: 'two.xhtml' },
    ]);
    const md = asFolder(r, { 'toc.xhtml': '001 - Contents', 'two.xhtml': '002 - Two' })('toc.xhtml');
    expect(md).toBe('Second notes');
  });

  /**
   * **But a link to the FIRST of a repeated heading is exactly right**, because that is where Obsidian sends it.
   * A technical book's "Scripting" section has `### Hooks` and `#### Hooks` under it, and its contents page links
   * the first.
   */
  it('links the first of a repeated heading, since that is where Obsidian lands', async () => {
    const book = {
      'toc.xhtml': '<p><a href="two.xhtml#h1">First hooks</a></p><p><a href="two.xhtml#h2">Inner hooks</a></p>',
      'two.xhtml': '<h1>Two</h1><h3 id="h1">Hooks</h3><p>a</p><h4 id="h2">Hooks</h4><p>b</p>',
    };
    const r = await convert(book, [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Two', href: 'two.xhtml' },
    ]);
    const md = asFolder(r, { 'toc.xhtml': '001 - Contents', 'two.xhtml': '002 - Two' })('toc.xhtml');
    expect(md).toContain('[[002 - Two#Hooks|First hooks]]');
    expect(md).not.toContain('|Inner hooks]]');
  });

  /**
   * **The cut has to be `splitSectionMarkdown`'s.** One file holding two chapters, split at contents anchors: a
   * link to the second anchor is the second chapter, and a link to the bare file — above the first anchor, where
   * there is no text of its own — is the first.
   */
  it('lands a link on the right chapter when one file holds several', async () => {
    const book = {
      'toc.xhtml': '<p><a href="both.xhtml">Whole file</a></p><p><a href="both.xhtml#b">Beta</a></p>',
      'both.xhtml': '<h1 id="a">Alpha</h1><p>Alpha text.</p><h1 id="b">Beta</h1><p>Beta text.</p>',
    };
    const r = await convert(book, [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Alpha', href: 'both.xhtml#a' },
      { label: 'Beta', href: 'both.xhtml#b' },
    ]);
    const md = asFolder(r, {
      'toc.xhtml': '001 - Contents',
      'both.xhtml#a': '002 - Alpha',
      'both.xhtml#b': '003 - Beta',
    })('toc.xhtml');
    expect(md).toContain('[[002 - Alpha|Whole file]]');
    expect(md).toContain('[[003 - Beta|Beta]]');
  });

  /** Obsidian compares headings with punctuation removed, so "Hooks:" is a second "Hooks" to it. */
  it('counts headings the way Obsidian compares them, punctuation and all', async () => {
    const book = {
      'toc.xhtml': '<p><a href="two.xhtml#b">Later hooks</a></p>',
      'two.xhtml': '<h1>Two</h1><h2 id="a">Hooks</h2><p>a</p><h2 id="b">Hooks:</h2><p>b</p>',
    };
    const r = await convert(book, [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Two', href: 'two.xhtml' },
    ]);
    const md = asFolder(r, { 'toc.xhtml': '001 - Contents', 'two.xhtml': '002 - Two' })('toc.xhtml');
    expect(md).toBe('Later hooks');
  });

  /** Obsidian renders no Markdown inside `[[target|text]]`: a novel's contents read "_Another Book_". */
  it("writes a wiki link's text as plain words, and a Markdown link's as the book set it", async () => {
    const book = {
      'toc.xhtml':
        '<p><a href="two.xhtml">Excerpt: <i>Another Book</i></a></p><p><a href="two.xhtml">snake_case_name</a></p>',
      'two.xhtml': '<h1>Two</h1><p>Text.</p>',
    };
    const toc = [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Two', href: 'two.xhtml' },
    ];
    const files = { 'toc.xhtml': '001 - Contents', 'two.xhtml': '002 - Two' };
    const wiki = asFolder(await convert(book, toc), files)('toc.xhtml');
    expect(wiki).toContain('[[002 - Two|Excerpt: Another Book]]');
    // The book's own underscores are text, not emphasis, and survive.
    expect(wiki).toContain('[[002 - Two|snake_case_name]]');
    const markdown = asFolder(await convert(book, toc, { imageFormat: 'markdown' }), files)('toc.xhtml');
    expect(markdown).toContain('[Excerpt: _Another Book_](002%20-%20Two.md)');
  });

  it('treats an empty anchor right before a heading as that heading', async () => {
    const book = {
      'toc.xhtml': '<p><a href="two.xhtml#x">Jump</a></p>',
      'two.xhtml': '<h1>Two</h1><p>Text.</p><a id="x"></a><h2>Landing</h2><p>After.</p>',
    };
    const r = await convert(book, [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Two', href: 'two.xhtml' },
    ]);
    const md = asFolder(r, { 'toc.xhtml': '001 - Contents', 'two.xhtml': '002 - Two' })('toc.xhtml');
    expect(md).toBe('[[002 - Two#Landing|Jump]]');
  });

  it('does not convert a link inside a heading, which has to stay plain to be linkable', async () => {
    const book = {
      'toc.xhtml': '<p><a href="two.xhtml">Two</a></p>',
      'two.xhtml': '<h1><a href="toc.xhtml">Two</a></h1><p>Text.</p>',
    };
    const r = await convert(book, [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Two', href: 'two.xhtml' },
    ]);
    const doc = await (section(book['two.xhtml'], 'two.xhtml').createDocument as () => Promise<Document>)();
    r.ctx.links.mark(doc, 1, undefined);
    expect(doc.querySelector('a')?.hasAttribute(LINK_ATTR)).toBe(false);
  });

  it('writes Markdown links when the export is set to', async () => {
    const r = await convert(BOOK, TOC, { imageFormat: 'markdown' });
    const md = asFolder(r, FILES)('toc.xhtml');
    expect(md).toContain('[One](002%20-%20One.md)');
    expect(md).toContain('[The subsection](003%20-%20Two.md#Subsection)');
  });

  it('writes a colon in a heading as a space, since Obsidian reads a destination with one as a web address', async () => {
    const book = {
      'toc.xhtml': '<h1>Contents</h1><p><a href="two.xhtml#l">Quiet harbors</a></p>',
      'two.xhtml': '<h1>Two</h1><p>Text.</p><h2 id="l">Chapter 6: Quiet Harbors</h2><p>More.</p>',
    };
    const toc = [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Two', href: 'two.xhtml' },
    ];
    const r = await convert(book, toc, { imageFormat: 'markdown' });
    const md = asFolder(r, { 'toc.xhtml': '001 - Contents', 'two.xhtml': '002 - Two' })('toc.xhtml');
    expect(md).toContain('[Quiet harbors](002%20-%20Two.md#Chapter%206%20%20Quiet%20Harbors)');
  });
});

describe('links in a table', () => {
  // A wiki link's `|` would end the table cell it sits in; Obsidian reads `\\|` there as the alias separator.
  it('escapes the pipe before a wiki link’s text inside a table row, and only there', async () => {
    const book = {
      'toc.xhtml':
        '<table><tr><td><a href="one.xhtml">One</a></td><td>first</td></tr></table><p><a href="one.xhtml">One</a></p>',
      'one.xhtml': '<h1>One</h1><p>Text.</p>',
    };
    const toc = [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'One', href: 'one.xhtml' },
    ];
    const md = asFolder(await convert(book, toc), { 'toc.xhtml': '001 - Contents', 'one.xhtml': '002 - One' })(
      'toc.xhtml'
    );
    expect(md).toContain('| [[002 - One\\|One]] | first |');
    expect(md).toContain('\n\n[[002 - One|One]]');
  });
});

describe('links in a single note', () => {
  /** The note as the single-note export assembles it: Orbis's `#` heading above each chapter's own text. */
  async function singleNote(
    book: Record<string, string>,
    toc: { label: string; href: string }[],
    opts: Partial<ExtractOptions> = {}
  ) {
    const r = await convert(book, toc, opts);
    const notes = new PieceNotes();
    // In note order, as `extractBook` writes it: each chapter's heading, then its text.
    const order = new HeadingOrder();
    for (const e of toc) {
      const firstOfName = order.chapter(e.label);
      order.text(r.text(e.href));
      notes.place(e.href, { file: null, chapterHeading: e.label, firstOfName });
    }
    const note = toc.map((e) => `# ${e.label}\n\n${r.text(e.href)}`).join('\n\n');
    notes.text(null, note);
    return notes.render(r.ctx.links, note);
  }

  const LONG = {
    'toc.xhtml': '<p><a href="one.xhtml">First</a></p><p><a href="two.xhtml#sub">Deeper</a></p>',
    'one.xhtml': '<h1>Chapter One</h1><p>Text.</p>',
    'two.xhtml': '<h1>Chapter Two</h1><p>Text.</p><h2 id="sub">Subsection</h2><p>More.</p>',
  };
  const LONG_TOC = [
    { label: 'Contents', href: 'toc.xhtml' },
    { label: 'Chapter One', href: 'one.xhtml' },
    { label: 'Chapter Two', href: 'two.xhtml' },
  ];

  /**
   * **A chapter whose name a LATER heading repeats is still linked**, since Obsidian and GitHub both send the link to
   * the first heading of the name — the guide's "Listening" chapter, and the settings page's "Listening" section after
   * it. One whose name came EARLIER stays text: the link would land on the earlier heading.
   */
  describe('a chapter whose name another heading repeats', () => {
    const book = {
      'toc.xhtml':
        '<p><a href="listen.xhtml">Listening</a></p><p><a href="settings.xhtml">Settings</a></p>' +
        '<p><a href="search.xhtml">Search</a></p>',
      'listen.xhtml': '<p>Listen to a book.</p>',
      'settings.xhtml': '<h2>Listening</h2><p>The listening settings.</p><h2>Search</h2><p>The search settings.</p>',
      'search.xhtml': '<p>Search a book.</p>',
    };
    const toc = [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Listening', href: 'listen.xhtml' },
      { label: 'Settings', href: 'settings.xhtml' },
      { label: 'Search', href: 'search.xhtml' },
    ];

    it('links it when it comes first, in the vault and out of it', async () => {
      expect(await singleNote(book, toc)).toContain('[[#Listening|Listening]]');
      expect(await singleNote(book, toc, { deliver: async () => undefined })).toContain('[Listening](#listening)');
    });

    it('leaves it as text when an earlier heading has the name', async () => {
      const md = await singleNote(book, toc, { deliver: async () => undefined });
      expect(md).not.toContain('[Search](#search)');
      expect(md).not.toContain('[[#Search');
    });
  });

  /**
   * **Sent out of the vault, the same note links the way other editors read it**: a standard Markdown link to a
   * GitHub-style anchor, never a wiki link, and text where only Obsidian could follow — a later copy of a heading.
   */
  describe('exported or shared', () => {
    const out = { deliver: async () => undefined };

    it('writes chapter and heading links as Markdown links to GitHub anchors', async () => {
      const md = await singleNote(LONG, LONG_TOC, out);
      expect(md).toContain('[First](#chapter-one)');
      expect(md).toContain('[Deeper](#subsection)');
      expect(md).not.toContain('[[');
    });

    it('links the first of a repeated heading, and leaves a later copy as text', async () => {
      const book = {
        'toc.xhtml': '<p><a href="one.xhtml#s1">First summary</a></p><p><a href="two.xhtml#s2">Second summary</a></p>',
        'one.xhtml': '<h1>Chapter One</h1><p>Text.</p><h2 id="s1">Summary</h2><p>More.</p>',
        'two.xhtml': '<h1>Chapter Two</h1><p>Text.</p><h2 id="s2">Summary</h2><p>More.</p>',
      };
      const toc = [
        { label: 'Contents', href: 'toc.xhtml' },
        { label: 'Chapter One', href: 'one.xhtml' },
        { label: 'Chapter Two', href: 'two.xhtml' },
      ];
      const md = await singleNote(book, toc, out);
      expect(md).toContain('[First summary](#summary)');
      expect(md).toContain('Second summary');
      expect(md).not.toContain('](#chapter-two#');
      expect(md).not.toContain('[Second summary]');
    });
  });

  it('lands a chapter link on the heading Orbis wrote for it, and a heading link on its heading', async () => {
    const md = await singleNote(LONG, LONG_TOC);
    expect(md).toContain('[[#Chapter One|First]]');
    expect(md).toContain('[[#Subsection|Deeper]]');
  });

  /**
   * **When the book's own chapter heading survives beside Orbis's, the chapter's heading repeats**, and the link
   * is text. The duplicate-title strip skips a first line under four characters, so a chapter called "One" keeps
   * its `# One` under Orbis's `# One`.
   */
  it('links the first of a repeated heading across the book, unless an Orbis chapter heading has its name', async () => {
    const book = {
      'toc.xhtml': '<p><a href="one.xhtml#s1">First summary</a></p><p><a href="two.xhtml#s2">Second summary</a></p>',
      'one.xhtml': '<h1>Chapter One</h1><p>Text.</p><h2 id="s1">Summary</h2><p>More.</p>',
      'two.xhtml': '<h1>Chapter Two</h1><p>Text.</p><h2 id="s2">Summary</h2><p>More.</p>',
    };
    const toc = [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Chapter One', href: 'one.xhtml' },
      { label: 'Chapter Two', href: 'two.xhtml' },
    ];
    const md = await singleNote(book, toc);
    expect(md).toContain('[[#Summary|First summary]]');
    // The later copy takes a heading path through its chapter — where Obsidian's resolver lands it exactly.
    expect(md).toContain('[[#Chapter Two#Summary|Second summary]]');
    // A chapter Orbis heads `# Summary` — here the book's closing chapter — takes the name first in the note.
    const withChapter = await singleNote({ ...book, 'three.xhtml': '<h1>Summary</h1><p>The whole book, again.</p>' }, [
      { label: 'Summary', href: 'three.xhtml' },
      ...toc,
    ]);
    expect(withChapter).not.toContain('[[#Summary|First summary]]');
    // …but a path through its own chapter is exact, since `resolveSubpath` looks for "Summary" after "Chapter One".
    expect(withChapter).toContain('[[#Chapter One#Summary|First summary]]');
  });

  it('takes no heading path to a top-level heading, which a path under a `#` chapter cannot reach', async () => {
    const book = {
      'toc.xhtml': '<p><a href="two.xhtml#s2">Second summary</a></p>',
      'one.xhtml': '<h1>Chapter One</h1><p>Text.</p><h1 id="s1">Summary</h1><p>More.</p>',
      'two.xhtml': '<h1>Chapter Two</h1><p>Text.</p><h1 id="s2">Summary</h1><p>More.</p>',
    };
    const md = await singleNote(book, [
      { label: 'Contents', href: 'toc.xhtml' },
      { label: 'Chapter One', href: 'one.xhtml' },
      { label: 'Chapter Two', href: 'two.xhtml' },
    ]);
    expect(md).toContain('Second summary');
    expect(md).not.toContain('|Second summary]]');
  });

  /**
   * The book's own `# One` survives under Orbis's `# One` — the duplicate-title strip skips a name under four characters
   * — so the name occurs twice. Orbis's heading is the first, and both Obsidian and GitHub land a link on the first, so
   * the chapter link is safe: it lands on the start of the chapter.
   */
  it("links a chapter whose heading the book repeats under it, since the link lands on Orbis's, the first", async () => {
    const md = await singleNote(BOOK, TOC);
    expect(md).toContain('[[#One|One]]');
    expect(md).toContain('[[#Subsection|The subsection]]');
  });
});

describe('singleNoteChapterHeadings', () => {
  /** A technical book's "Fast Sync" section is a chapter of its own, and "The Transports" before it has a Fast Sync
   *  heading. */
  it("prefixes a chapter's name when the book already uses it as a heading", () => {
    const out = singleNoteChapterHeadings([
      { title: '4. Running a Server', listed: true, md: 'Intro.' },
      { title: 'The Transports', listed: false, md: '#### Fast Sync\n\nText.' },
      { title: 'Fast Sync', listed: false, md: 'More text.' },
    ]);
    expect(out).toEqual(['4. Running a Server', 'The Transports', '4. Running a Server – Fast Sync']);
  });

  it('compares the way Obsidian does, and never renames a contents entry', () => {
    const out = singleNoteChapterHeadings([
      { title: 'One', listed: true, md: '## Rewind:' },
      { title: 'Rewind', listed: false, md: 'x' },
      { title: 'Two', listed: true, md: '## Two' },
    ]);
    expect(out).toEqual(['One', 'One – Rewind', 'Two']);
  });

  it('leaves a name alone when nothing in the book shares it, or no contents entry comes before it', () => {
    expect(
      singleNoteChapterHeadings([
        { title: 'Front', listed: false, md: '## Front' },
        { title: 'One', listed: true, md: 'x' },
        { title: 'Summary', listed: false, md: 'y' },
      ])
    ).toEqual(['Front', 'One', 'Summary']);
  });
});

describe('githubSlug', () => {
  it('makes an anchor the way GitHub, GitLab and VS Code do', () => {
    expect(githubSlug('Chapter One')).toBe('chapter-one');
    // The en dash goes, and the two spaces around it each become a hyphen.
    expect(githubSlug('PART I – CHAPTER I')).toBe('part-i--chapter-i');
    expect(githubSlug("What's new? (2nd ed.)")).toBe('whats-new-2nd-ed');
    expect(githubSlug('Café au lait')).toBe('café-au-lait');
  });
});
