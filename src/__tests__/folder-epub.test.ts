import { describe, expect, it } from 'vitest';
import {
  type BookNote,
  bookTitleOf,
  crossNoteResolver,
  type FolderNote,
  findIndexNote,
  frontmatterSectionTitle,
  generatedTocMarkdown,
  orderNotes,
  sectionTitleOf,
  stripOrderPrefix,
} from '../folder-epub';

const note = (basename: string, folder = 'docs'): FolderNote => ({ path: `${folder}/${basename}.md`, basename });

describe('the index note', () => {
  it('is README, index or home — in that precedence', () => {
    expect(findIndexNote([note('roadmap'), note('index'), note('README')])?.basename).toBe('README');
    expect(findIndexNote([note('roadmap'), note('home'), note('index')])?.basename).toBe('index');
  });

  it('is matched case-insensitively, because nobody agrees on how to spell it', () => {
    expect(findIndexNote([note('Readme')])?.basename).toBe('Readme');
    expect(findIndexNote([note('INDEX')])?.basename).toBe('INDEX');
  });

  it('is absent from a folder that has none, which is not an error', () => {
    expect(findIndexNote([note('a'), note('b')])).toBeNull();
  });

  it('is found THROUGH the sorting prefix this feature encourages', () => {
    // An unrecognised `001-README.md` makes the ordering rule it exists to serve go quietly inert — filename order,
    // and a book titled after its folder.
    expect(findIndexNote([note('002-roadmap'), note('001-README')])?.basename).toBe('001-README');
  });

  it("is the contents note an Orbis export's chapters name, in a folder with no README", () => {
    // Missing it would turn an export of a book in parts and chapters back into an EPUB titled `parts-and-chapters`,
    // with no author, while the note that holds both is first in the list.
    const set = [note('001 - Cover', 'cp'), note('000 - Parts and Chapters', 'cp'), note('002 - PART I', 'cp')];
    expect(findIndexNote(set, 'cp/000 - Parts and Chapters.md')?.basename).toBe('000 - Parts and Chapters');
    // A note the chapters point at that is not in the folder is no index of it.
    expect(findIndexNote(set, 'elsewhere/000 - Parts and Chapters.md')).toBeNull();
  });

  it('is still the README when a folder has both, since that is the one a person wrote', () => {
    const both = [note('000 - Book'), note('README')];
    expect(findIndexNote(both, 'docs/000 - Book.md')?.basename).toBe('README');
  });
});

describe('reading order', () => {
  const notes = [note('roadmap'), note('README'), note('accessibility'), note('search-system')];
  const readme = findIndexNote(notes);

  it('puts the index note first and then follows its links', () => {
    const { ordered } = orderNotes(notes, readme, [
      'docs/roadmap.md',
      'docs/search-system.md',
      'docs/accessibility.md',
    ]);
    expect(ordered.map((n) => n.basename)).toEqual(['README', 'roadmap', 'search-system', 'accessibility']);
  });

  it('APPENDS a note the index never linked to, rather than dropping it', () => {
    // The failure this exists to prevent is found three chapters into reading, long after the conversion.
    const { ordered, appended } = orderNotes(notes, readme, ['docs/roadmap.md']);
    expect(ordered.map((n) => n.basename)).toEqual(['README', 'roadmap', 'accessibility', 'search-system']);
    expect(appended).toBe(2);
  });

  it('ignores links that leave the book — out of the folder, or at an attachment', () => {
    const { ordered } = orderNotes(notes, readme, [
      'docs/../guide/troubleshooting.md',
      'docs/diagram.png',
      'docs/roadmap.md',
    ]);
    expect(ordered.map((n) => n.basename)).toEqual(['README', 'roadmap', 'accessibility', 'search-system']);
  });

  it('takes a note linked twice only once, at its first mention', () => {
    const { ordered } = orderNotes(notes, readme, [
      'docs/search-system.md',
      'docs/roadmap.md',
      'docs/search-system.md',
    ]);
    expect(ordered.map((n) => n.basename)).toEqual(['README', 'search-system', 'roadmap', 'accessibility']);
  });

  it('falls back to filename order with no index note, and reports nothing as appended', () => {
    // Every note would be "appended" there, which is a number that means nothing.
    const { ordered, index, appended } = orderNotes([note('b'), note('a'), note('c')]);
    expect(ordered.map((n) => n.basename)).toEqual(['a', 'b', 'c']);
    expect(index).toBeNull();
    expect(appended).toBe(0);
  });

  it('sorts numerically, so the tenth chapter is not second', () => {
    // The ordering rule encourages numeric prefixes; an unpadded folder must not look like they were ignored.
    const { ordered } = orderNotes([note('10-ten'), note('9-nine'), note('2-two')]);
    expect(ordered.map((n) => n.basename)).toEqual(['2-two', '9-nine', '10-ten']);
  });

  it('follows the links of whichever note the caller chose, whatever it is called', () => {
    // Chapter order in the dialog offers every note. Looking for a README itself and, finding none, dropping the
    // chosen note's links would give file-name order under a control naming a different one.
    const set = [note('a'), note('contents'), note('b'), note('c')];
    const chosen = set[1];
    const { ordered, index } = orderNotes(set, chosen, ['docs/c.md', 'docs/a.md', 'docs/b.md']);
    expect(ordered.map((n) => n.basename)).toEqual(['contents', 'c', 'a', 'b']);
    expect(index?.basename).toBe('contents');
  });

  it('ignores a link order when the index note itself is not among the notes', () => {
    // Defensive: the caller resolves links, and a stale path must not reorder anything.
    const { ordered } = orderNotes([note('a'), note('b')], null, ['docs/b.md']);
    expect(ordered.map((n) => n.basename)).toEqual(['a', 'b']);
  });
});

describe('stripOrderPrefix', () => {
  it('drops the sorting prefix a table of contents should never show', () => {
    expect(stripOrderPrefix('002-roadmap')).toBe('roadmap');
    expect(stripOrderPrefix('01_intro')).toBe('intro');
    expect(stripOrderPrefix('003 code-standards')).toBe('code-standards');
  });

  it('keeps a number that is the title, not a prefix', () => {
    // `2048` alone is a title, and a single digit is too short to be a prefix. (A year followed by a separator,
    // `1999-a-year-at-sea`, does lose its year — see `stripOrderPrefix`.)
    expect(stripOrderPrefix('2048')).toBe('2048');
    expect(stripOrderPrefix('7')).toBe('7');
  });

  it('never returns nothing', () => {
    expect(stripOrderPrefix('001-')).toBe('001-');
  });
});

/**
 * **Orbis's chapter notes, going back to a book.** Their `title` is "Book: Chapter", and a Save as Markdown export
 * has no heading of its own to win over it — so read naively, every section of a rebuilt book in parts and chapters
 * is named "Parts and Chapters: PART I – CHAPTER I".
 */
describe('frontmatterSectionTitle', () => {
  const fm = (over: Partial<Parameters<typeof frontmatterSectionTitle>[0]>) =>
    frontmatterSectionTitle({ generated: '', title: '', chapter: '', bookTitle: '', ...over });

  it("takes a Save as Markdown chapter's name from `chapter`, which holds it exactly", () => {
    expect(
      fm({
        generated: 'book-export',
        title: 'Parts and Chapters: PART I – CHAPTER I',
        chapter: 'PART I – CHAPTER I',
        bookTitle: 'Parts and Chapters',
      })
    ).toBe('PART I – CHAPTER I');
    // A chapter that already names the book is titled with itself alone, and must not lose the book's words.
    expect(
      fm({
        generated: 'book-export',
        title: 'Parts and Chapters: Epilogue',
        chapter: 'Parts and Chapters: Epilogue',
        bookTitle: 'Parts and Chapters',
      })
    ).toBe('Parts and Chapters: Epilogue');
  });

  it('takes the book back off the front of a Generate notes title, whose `chapter` is a number', () => {
    expect(fm({ generated: 'note-set', title: 'The Sample: Chapter Three', bookTitle: 'The Sample' })).toBe(
      'Chapter Three'
    );
  });

  it("leaves the reader's own notes alone, whatever their title looks like", () => {
    expect(fm({ title: 'Another Book: a reading', chapter: 'one', bookTitle: 'Another Book' })).toBe(
      'Another Book: a reading'
    );
    expect(fm({ generated: 'epub-index', title: 'Another Book: a reading', bookTitle: 'Another Book' })).toBe(
      'Another Book: a reading'
    );
  });

  it("keeps an Orbis note's title when there is nothing to read it back by", () => {
    expect(fm({ generated: 'note-set', title: 'The Sample: Chapter Three' })).toBe('The Sample: Chapter Three');
    expect(fm({ generated: 'book-export', title: 'Parts and Chapters' })).toBe('Parts and Chapters');
  });
});

describe('titles', () => {
  it('names a section by its heading, then its frontmatter, then its filename', () => {
    expect(sectionTitleOf({ heading: 'Roadmap', frontmatterTitle: 'The Plan', basename: '002-roadmap' })).toBe(
      'Roadmap'
    );
    expect(sectionTitleOf({ frontmatterTitle: 'The Plan', basename: '002-roadmap' })).toBe('The Plan');
    expect(sectionTitleOf({ basename: '002-roadmap' })).toBe('roadmap');
  });

  it('reads a heading as text, not as Markdown', () => {
    // A heading that opens with a jump back into a book, then the name, read as Markdown would produce a chapter
    // called "[↗](obsidian://orbis-nav?file=fixtures%2F…".
    expect(
      sectionTitleOf({
        heading:
          '[↗](obsidian://orbis-nav?file=fixtures%2Fannotation-workhorse.epub&href=OEBPS%2Fx.xhtml) ANNOTATION WORKHORSE',
        basename: '001 - ANNOTATION WORKHORSE',
      })
    ).toBe('ANNOTATION WORKHORSE');
    expect(sectionTitleOf({ heading: '**Bold** and `code`', basename: 'x' })).toBe('Bold and code');
    expect(sectionTitleOf({ heading: 'See [[002 - Chapter Two|Chapter Two]]', basename: 'x' })).toBe('See Chapter Two');
    // A heading that is ONLY a link falls through to the next answer rather than titling a chapter with nothing.
    expect(sectionTitleOf({ heading: '[](obsidian://x)', frontmatterTitle: 'Chapter One', basename: 'x' })).toBe(
      'Chapter One'
    );
  });

  it('names the BOOK by frontmatter first — the opposite precedence, on purpose', () => {
    // Frontmatter is metadata written for export (the same key Book Export writes); an index note's h1 is often
    // just a page heading.
    const heading = 'Orbis Reader — Design Documentation';
    expect(bookTitleOf({ frontmatterTitle: 'Orbis Design', heading, folderName: 'linked-notes-test' })).toBe(
      'Orbis Design'
    );
    expect(bookTitleOf({ heading, folderName: 'linked-notes-test' })).toBe(heading);
    expect(bookTitleOf({ folderName: 'linked-notes-test' })).toBe('linked-notes-test');
  });

  it('ignores whitespace-only values rather than titling a book with a space', () => {
    expect(sectionTitleOf({ heading: '   ', basename: '005-x' })).toBe('x');
    expect(bookTitleOf({ frontmatterTitle: ' ', heading: ' ', folderName: 'docs' })).toBe('docs');
  });
});

describe('links between notes', () => {
  // Two notes that both have an "Overview" — the collision that keeps anchors per note. Pooled into one
  // map across the book, the second would overwrite the first and a link from either would land in one chapter.
  const readme: BookNote = {
    path: 'docs/001-README.md',
    file: 'sect1.xhtml',
    anchors: new Map([['overview', { file: 'sect1.xhtml', id: 'overview' }]]),
  };
  const roadmap: BookNote = {
    path: 'docs/002-roadmap.md',
    file: 'sect2.xhtml',
    anchors: new Map([
      ['overview', { file: 'sect2.xhtml', id: 'overview' }],
      ['the-plan', { file: 'sect2.xhtml', id: 'the-plan' }],
    ]),
  };
  const notes = new Map([
    [readme.path, readme],
    [roadmap.path, roadmap],
  ]);
  // Stands in for `getFirstLinkpathDest`: same-folder resolution, `.md` optional as a wikilink omits it.
  const resolvePath = (href: string, from: string): string | null => {
    const folder = from.slice(0, from.lastIndexOf('/'));
    const path = `${folder}/${href.endsWith('.md') ? href : `${href}.md`}`;
    return notes.has(path) ? path : null;
  };
  const resolve = crossNoteResolver({ from: 'docs/001-README.md', notes, resolvePath });

  it('sends a whole-note link to that note’s section', () => {
    // The single-note pipeline returns null here — no `#`, nothing in the book to point at — which is right for
    // one note and exactly wrong for a folder.
    expect(resolve('002-roadmap.md')).toEqual({ file: 'sect2.xhtml' });
  });

  it('resolves a fragment in the TARGET note, not in the linking one', () => {
    expect(resolve('002-roadmap.md#overview')).toEqual({ file: 'sect2.xhtml', id: 'overview' });
  });

  it('accepts a wikilink target, which omits the extension', () => {
    expect(resolve('002-roadmap')).toEqual({ file: 'sect2.xhtml' });
  });

  it('accepts a heading written as text, via its slug', () => {
    expect(resolve('002-roadmap.md#The Plan')).toEqual({ file: 'sect2.xhtml', id: 'the-plan' });
  });

  it('still links to the file when the fragment cannot be placed', () => {
    // A link landing at the top of the right chapter beats flattening it to text because a heading was renamed.
    expect(resolve('002-roadmap.md#gone')).toEqual({ file: 'sect2.xhtml' });
  });

  it('declines a target the book does not hold, so the caller flattens and counts it', () => {
    expect(resolve('../guide/troubleshooting.md')).toBeNull();
    expect(resolve('diagram.png')).toBeNull();
  });

  it('declines a bare anchor — that belongs to the note that wrote it', () => {
    expect(resolve('#overview')).toBeNull();
  });

  it('declines anything with a scheme', () => {
    expect(resolve('https://example.com/roadmap.md')).toBeNull();
    expect(resolve('mailto:someone@example.com')).toBeNull();
  });
});

describe('the contents note', () => {
  it('is a heading and a list of links, in the order given', () => {
    // Always generated, never adopted: the folder's own index note is itself converted, so its curation already
    // exists as a book. Plain on purpose — inventing structure would guess at an organization nobody expressed.
    expect(
      generatedTocMarkdown('My Docs', [
        { link: 'a.epub', title: 'A' },
        { link: 'b.epub', title: 'B' },
      ])
    ).toBe('---\norbis_generated: epub-index\n---\n\n# My Docs\n\n- [[a.epub|A]]\n- [[b.epub|B]]\n');
  });

  // It has a title and a list of links, which is exactly record-shaped — and it is not a book. The key every
  // generated note carries keeps it out of the catalog and out of the review's adopt list.
  it('says it was generated, so nothing takes it for a title note', () => {
    const out = generatedTocMarkdown('My Docs', [{ link: 'a.epub', title: 'A' }]);
    expect(out.startsWith('---\norbis_generated: epub-index\n---\n')).toBe(true);
  });

  it('carries the regeneration notice as an HTML comment, above everything else', () => {
    // Invisible in reading view, plain in edit mode — where someone about to type into this file will see it.
    const out = generatedTocMarkdown('My Docs', [{ link: 'a.epub', title: 'A' }], 'Regenerated on every run.');
    expect(out).toContain('<!-- Regenerated on every run. -->\n\n# My Docs');
  });
});
