// An annotation is filed under the heading its passage is in, not under the last heading on the page — run against
// foliate's own TOCProgress, which is where the page's answer comes from.

import { describe, expect, it } from 'vitest';
import { tocEntryAt } from '../reader/toc-entry';
import { TOCProgress } from '../vendor/foliate-js/progress.js';

type TocItem = { label?: string; href?: string };

/** One section: a lead-in before the first heading, then two headed sections — all of it one "page". */
async function setup() {
  document.body.replaceChildren();
  for (const [tag, id, text] of [
    ['p', 'lead', 'Before any heading.'],
    ['h2', 'a', 'A'],
    ['p', 'a1', 'The end of section A.'],
    ['h2', 'b', 'B'],
    ['p', 'b1', 'The start of section B.'],
  ]) {
    const el = document.createElement(tag);
    el.id = id;
    el.textContent = text;
    document.body.append(el);
  }
  const tp = new TOCProgress();
  await tp.init({
    toc: [
      { label: 'A', href: 's.xhtml#a' },
      { label: 'B', href: 's.xhtml#b' },
    ],
    ids: ['s.xhtml'],
    splitHref: (href: string) => href.split('#'),
    getFragment: (doc: Document, id: string) => doc.getElementById(id),
  });
  // foliate's JavaScript is untyped; this is the shape `getProgress` returns.
  const entryOf = (index: number, range: Range) => tp.getProgress(index, range) as TocItem | null | undefined;
  const view = { getProgressOf: (index: number, range: Range) => ({ tocItem: entryOf(index, range) }) };
  const textOf = (id: string) => document.getElementById(id)!.firstChild!;
  const span = (fromId: string, toId: string) => {
    const r = document.createRange();
    r.setStart(textOf(fromId), 0);
    r.setEnd(textOf(toId), 5);
    return r;
  };
  return { entryOf, view, span };
}

describe('tocEntryAt', () => {
  it('files a passage under its own heading when the next heading starts on the same page', async () => {
    const { entryOf, view, span } = await setup();
    const page = span('a1', 'b1');
    // foliate's answer for the page: the last heading on it.
    expect(entryOf(0, page)?.label).toBe('B');
    // The passage at the top of that page is in section A.
    expect(tocEntryAt(view, 0, span('a1', 'a1'))).toEqual({ href: 's.xhtml#a', label: 'A' });
  });

  it('files a passage that crosses into the next section under the section it starts in', async () => {
    const { view, span } = await setup();
    expect(tocEntryAt(view, 0, span('a1', 'b1'))?.label).toBe('A');
  });

  it('files a passage after the second heading under that heading', async () => {
    const { view, span } = await setup();
    expect(tocEntryAt(view, 0, span('b1', 'b1'))?.label).toBe('B');
  });

  it('has no entry for a passage before the first heading', async () => {
    const { view, span } = await setup();
    expect(tocEntryAt(view, 0, span('lead', 'lead'))).toBeNull();
  });
});

// A file Calibre made opens with an empty page-break `<div>` and a line break before its heading, and the page's range
// starts in them — before the heading. The chapter counter then showed the previous chapter's count over this heading.
describe('tocEntryAt on a page that begins before its heading', () => {
  async function chapterFile() {
    document.body.innerHTML =
      '<div id="pb"></div><div class="chapter">\n<h3 id="ch3">CHAPTER III.</h3><p id="p1">If it had really occurred.</p></div>';
    const tp = new TOCProgress();
    await tp.init({
      toc: [
        { label: 'CHAPTER II.', href: 's0.xhtml' },
        { label: 'CHAPTER III.', href: 's1.xhtml#ch3' },
      ],
      ids: ['s0.xhtml', 's1.xhtml'],
      splitHref: (href: string) => href.split('#'),
      getFragment: (doc: Document, id: string) => doc.getElementById(id),
    });
    return { getProgressOf: (index: number, range: Range) => ({ tocItem: tp.getProgress(index, range) as TocItem }) };
  }

  it('files a page that starts in the line break before the heading under that heading', async () => {
    const view = await chapterFile();
    const page = document.createRange();
    page.setStart(document.querySelector('.chapter')!.firstChild!, 0); // the "\n" before <h3>
    page.setEnd(document.getElementById('p1')!.firstChild!, 5);
    // foliate's own answer for the page's start: the chapter before, since the heading comes after it.
    const top = page.cloneRange();
    top.collapse(true);
    expect(view.getProgressOf(1, top).tocItem?.label).toBe('CHAPTER II.');
    expect(tocEntryAt(view, 1, page)?.label).toBe('CHAPTER III.');
  });

  it('files a page that starts at the empty page-break element under the heading after it', async () => {
    const view = await chapterFile();
    const page = document.createRange();
    page.setStart(document.body, 0);
    page.setEnd(document.getElementById('p1')!.firstChild!, 5);
    expect(tocEntryAt(view, 1, page)?.label).toBe('CHAPTER III.');
  });
});
