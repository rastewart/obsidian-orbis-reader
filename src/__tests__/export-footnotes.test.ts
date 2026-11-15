// A book's footnotes through Save as Markdown, end to end: sections in, the notes' text out.
//
// Each shape is one the 883-book measurement found, reduced to a few lines — the two books the samples were judged
// on (a book with notes at the end of each file; a biography with a Notes chapter at the back) and
// the bugs the samples turned up on the way.

import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { type ExtractOptions, extractBook, type RawSection } from '../book-extractor';

const html = (body: string) => `<html><head><title>t</title></head><body>${body}</body></html>`;

/** Export `files` (spine order) with `toc`, and return every note written, by path. */
async function exportBook(
  files: Record<string, string>,
  toc: { label: string; href: string }[],
  opts: Partial<ExtractOptions> = {}
): Promise<Map<string, string>> {
  const names = Object.keys(files);
  const written = new Map<string, string>();
  const app = {
    vault: {
      getAbstractFileByPath: () => null,
      create: async (path: string, content: string) => void written.set(path, content),
      createFolder: async () => undefined,
    },
  } as unknown as App;
  const sections = names.map(
    (n) =>
      ({
        id: n,
        linear: true,
        resolveHref: (h: string) => h,
        createDocument: async () => new DOMParser().parseFromString(html(files[n]), 'text/html'),
      }) as unknown as RawSection
  );
  const options: ExtractOptions = {
    onProgress: () => undefined,
    tocEntries: toc,
    sectionIndexForHref: (h) => names.indexOf(h.split('#')[0]),
    ...opts,
  };
  await extractBook(
    sections as unknown as { id: string }[],
    { title: 'Book', author: 'A', publisher: '', language: 'en', pubdate: '' },
    opts.perChapter ? 'out' : 'out.md',
    options,
    app
  );
  return written;
}

const note = (written: Map<string, string>, name: string): string => {
  const hit = [...written].find(([p]) => p.endsWith(`/${name}.md`) || p === `${name}.md`);
  if (!hit) throw new Error(`no note ${name} in ${[...written.keys()].join(', ')}`);
  return hit[1];
};

// A book with notes at the end of each file: each file's notes at its end, each note's number linking back to its reference.
const CHAPTER_END = {
  'one.xhtml':
    '<h1>One</h1><p>Born in Oakhallow.<span class="ref"><a id="r1" href="one.xhtml#n1">1</a></span> Then Larkspur Mill.</p>' +
    '<p>____________</p><div><p><a id="n1" href="one.xhtml#r1">1</a> Records suggest 1791–1793.</p></div>',
  'two.xhtml':
    '<h1>Two</h1><p>Later.<span class="ref"><a id="r1" href="two.xhtml#n1">1</a></span></p>' +
    '<div><p><a id="n1" href="two.xhtml#r1">1</a> A second chapter’s note.</p></div>',
};
const CHAPTER_END_TOC = [
  { label: 'One', href: 'one.xhtml' },
  { label: 'Two', href: 'two.xhtml' },
];

// A biography with a Notes chapter at the back: superscript references, and every note in a Notes chapter whose numbers link back.
const NOTES_CHAPTER = {
  'one.xhtml':
    '<h1>One</h1><p class="ct1"><a href="contents.xhtml">A Quiet Harbor</a><sup><a id="r1" href="notes.xhtml#n1">1</a></sup></p>' +
    '<p>Vantry meant a ferry.<sup><a id="r2" href="notes.xhtml#n2">2</a></sup> And more.<sup><a id="r3" href="notes.xhtml#n3">3</a></sup></p>',
  'notes.xhtml':
    '<h1>Notes</h1><p class="h2b">CHAPTER 1: A QUIET HARBOR</p>' +
    '<p class="ntx"><a id="n1" href="one.xhtml#r1">1</a>. Some material draws on an earlier essay.</p>' +
    '<p class="ntx"><a id="n2" href="one.xhtml#r2">2</a>. <i>A Sample Glossary</i>.</p>' +
    '<p class="ntx"><a id="n3" href="one.xhtml#r3">3</a>. Pellow, 1:354.</p>' +
    '<p class="h2b">CHAPTER 2: A HOUSE OF LANTERNS</p>',
};
const NOTES_TOC = [
  { label: 'One', href: 'one.xhtml' },
  { label: 'Notes', href: 'notes.xhtml' },
];

describe('notes at the end of their own chapter', () => {
  it('become footnotes, and leave the text, since the footnote list lands in the same place', async () => {
    const md = note(await exportBook(CHAPTER_END, CHAPTER_END_TOC, { perChapter: true }), '001 - One');
    expect(md).toContain('Born in Oakhallow.[^1] Then Larkspur Mill.');
    expect(md).toContain('[^1]: Records suggest 1791–1793.');
    expect(md.match(/Records suggest/g)).toHaveLength(1);
    // No block id: nothing links back to the text but the footnote's own ↩.
    expect(md).not.toMatch(/\^fn-/);
  });

  it('keep the book’s numbers in a book folder, where each chapter is its own note', async () => {
    const md = note(await exportBook(CHAPTER_END, CHAPTER_END_TOC, { perChapter: true }), '002 - Two');
    expect(md).toContain('Later.[^1]');
    expect(md).toContain('[^1]: A second chapter’s note.');
  });

  it('leave the text even when the file holds several chapters, and the notes follow the last of them', async () => {
    // The book with notes at the end of each file: one file, several contents entries, the file's notes at its end — so they land in the
    // last entry's piece. Counted as "another chapter", they were kept there as a list of other chapters' notes.
    const book = {
      'week.xhtml':
        '<h2 id="sun">Sunday</h2><p>Rain.<span><a id="r1" href="week.xhtml#n1">1</a></span></p>' +
        '<h2 id="mon">Monday</h2><p>The mill.<span><a id="r2" href="week.xhtml#n2">2</a></span></p>' +
        '<div><p><a id="n1" href="week.xhtml#r1">1</a> A note on Sunday.</p></div>' +
        '<div><p><a id="n2" href="week.xhtml#r2">2</a> A note on Monday.</p></div>',
    };
    const toc = [
      { label: 'Sunday', href: 'week.xhtml#sun' },
      { label: 'Monday', href: 'week.xhtml#mon' },
    ];
    const written = await exportBook(book, toc, { perChapter: true });
    const sunday = note(written, '001 - Sunday');
    const monday = note(written, '002 - Monday');
    expect(sunday).toContain('[^1]: A note on Sunday.');
    expect(monday).toContain('[^2]: A note on Monday.');
    expect(monday.match(/A note on Sunday/g)).toBeNull();
    expect(`${sunday}${monday}`).not.toMatch(/\^fn-/);
  });

  it('are relabelled in a single note, where two chapters both number from 1', async () => {
    const md = note(await exportBook(CHAPTER_END, CHAPTER_END_TOC), 'out');
    expect(md).toContain('Born in Oakhallow.[^1]');
    expect(md).toContain('Later.[^1-2]');
    expect(md).toContain('[^1]: Records suggest 1791–1793.');
    expect(md).toContain('[^1-2]: A second chapter’s note.');
  });
});

describe('notes in a Notes chapter at the back', () => {
  it('become footnotes in the chapter that cites them', async () => {
    const md = note(await exportBook(NOTES_CHAPTER, NOTES_TOC, { perChapter: true }), '001 - One');
    expect(md).toContain('[^2]: _A Sample Glossary_.');
    expect(md).toContain('[^3]: Pellow, 1:354.');
  });

  it('stay in the Notes chapter too, each number linking to the paragraph that cites it', async () => {
    const written = await exportBook(NOTES_CHAPTER, NOTES_TOC, { perChapter: true });
    const one = note(written, '001 - One');
    const notes = note(written, '002 - Notes');
    // One block id per paragraph: two references in one paragraph share it.
    expect(one).toContain('Vantry meant a ferry.[^2] And more.[^3] ^fn-2');
    expect(notes).toContain('[[001 - One#^fn-2|2]]. _A Sample Glossary_.');
    expect(notes).toContain('[[001 - One#^fn-2|3]]. Pellow, 1:354.');
  });

  it('link back within the note when the whole book is one note', async () => {
    const md = note(await exportBook(NOTES_CHAPTER, NOTES_TOC), 'out');
    expect(md).toContain('[[#^fn-1|1]]. Some material draws on an earlier essay.');
    expect(md).toContain('[^1]: Some material draws on an earlier essay.');
  });

  it('link back as Markdown links when the export is set to', async () => {
    const written = await exportBook(NOTES_CHAPTER, NOTES_TOC, { perChapter: true, imageFormat: 'markdown' });
    expect(note(written, '002 - Notes')).toContain('[2](001%20-%20One.md#%5Efn-2). _A Sample Glossary_.');
  });

  it('does not take the next chapter’s name as the last paragraph of a note', async () => {
    // The biography names each chapter in a styled paragraph, not a heading: a note continues only into
    // paragraphs styled as it is, or every chapter name became part of the note before it.
    const md = note(await exportBook(NOTES_CHAPTER, NOTES_TOC, { perChapter: true }), '001 - One');
    expect(md).toContain('[^3]: Pellow, 1:354.\n');
    expect(md).not.toContain('HOUSE OF LANTERNS');
  });

  it('writes a reference beside a chapter title’s own link without the superscript’s carets', async () => {
    // The title's link came first and took the superscript's opening `^` for its own: `A Quiet Harbor^[^1]`.
    const md = note(await exportBook(NOTES_CHAPTER, NOTES_TOC, { perChapter: true }), '001 - One');
    expect(md).toContain('A Quiet Harbor[^1] ^fn-1');
    expect(md).not.toContain('^[^');
  });
});

describe('a note cited from a table cell', () => {
  // A table is one block, so the block id the Notes chapter links back to goes on a line under it — at the end of a
  // row it would be a cell's text, and the link back would land nowhere.
  it('becomes a footnote in the cell, and its link back lands on the table', async () => {
    const book = {
      'one.xhtml':
        '<h1>One</h1><table><tr><td>A cell that cites<sup><a id="r1" href="notes.xhtml#n1">1</a></sup></td><td>b</td></tr></table>',
      'notes.xhtml': '<h1>Notes</h1><p class="ntx"><a id="n1" href="one.xhtml#r1">1</a>. The note.</p>',
    };
    const written = await exportBook(book, NOTES_TOC, { perChapter: true });
    const one = note(written, '001 - One');
    expect(one).toContain('| A cell that cites[^1] | b |');
    expect(one).toMatch(/\| b \|\n\n\^fn-1\n/);
    expect(note(written, '002 - Notes')).toContain('[[001 - One#^fn-1|1]]');
  });
});

describe('a link shaped like a reference, with no evidence that it is one', () => {
  it('stays an ordinary link, and what it points at stays where it was', async () => {
    const book = {
      'one.xhtml': '<h1>One</h1><p>See figure<sup><a href="two.xhtml#x">2</a></sup> for details.</p>',
      'two.xhtml': '<h1>Two</h1><p>Text.</p><p id="x">An unrelated paragraph.</p>',
    };
    const toc = [
      { label: 'One', href: 'one.xhtml' },
      { label: 'Two', href: 'two.xhtml' },
    ];
    const written = await exportBook(book, toc, { perChapter: true });
    expect(note(written, '001 - One')).not.toContain('[^');
    expect(note(written, '002 - Two')).toContain('An unrelated paragraph.');
  });
});

// An FB2 book, as foliate renders one: the notes in a second body, one section of its own, each note a `<section id>`
// titled with its number, and every reference a bare `#id`. FB2's ids are book-wide, so `#n1` is not in the chapter
// that cites it — the reader view says where it is (`fragmentSectionIndex`).
const FB2 = {
  body: '<section><header class="title"><h1>Chapter One</h1></header><p>A first note<a href="#n1" epub:type="noteref">[1]</a>. Two<a href="#n2" epub:type="noteref">[2]</a>.</p></section>',
  notes:
    '<section class="title"><h1>Notes</h1></section><section id="n1"><header class="title"><h1>1</h1></header><p>Note 1 text.</p></section><section id="n2"><header class="title"><h1>2</h1></header><p>Note 2, first.</p><p>Note 2, second.</p></section>',
};
const FB2_TOC = [
  { label: 'Chapter One', href: 'body' },
  { label: 'Notes', href: 'notes' },
];
const FB2_IDS: Record<string, number> = { n1: 1, n2: 1 };

describe('an FB2 book’s notes, in its notes body', () => {
  it('become footnotes, found in the section the book-wide id lives in', async () => {
    // Without the lookup a bare `#n1` was keyed to the citing chapter, where no such id exists: the references came
    // out as escaped text, `\[1\]`, and the notes were never found.
    const md = note(
      await exportBook(FB2, FB2_TOC, { perChapter: true, fragmentSectionIndex: (id) => FB2_IDS[id] }),
      '001 - Chapter One'
    );
    expect(md).toContain('A first note[^1]. Two[^2].');
    expect(md).toContain('[^1]: Note 1 text.\n');
    expect(md).toContain('[^2]: Note 2, first.\n\n    Note 2, second.');
  });

  it('drop the heading each note is titled with, which is only its number', async () => {
    // FB2 titles every note section, and foliate writes the title as an `h1`: the definitions opened `[^1]: # 1`.
    const md = note(
      await exportBook(FB2, FB2_TOC, { perChapter: true, fragmentSectionIndex: (id) => FB2_IDS[id] }),
      '001 - Chapter One'
    );
    expect(md).not.toMatch(/\[\^\d\]: #/);
  });
});
