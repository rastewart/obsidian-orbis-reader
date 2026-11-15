// ORBIS patch 12: a chapter frame the browser reloads is shown again at the place it was showing. The place is a
// Range in the discarded document, carried into the fresh copy by its path. The redisplay itself needs a real
// browser — moving a frame is what reloads it — so this checks the carrying.

import { fromRange, parse, toRange } from 'foliate-js/epubcfi.js';
import { describe, expect, it } from 'vitest';

const CHAPTER = `<html><head><title>c</title></head><body>
<h1>Chapter Three</h1>
<p>The ferry left the north shore a little after seven.</p>
<p>By the time it reached the weir, the light had gone.</p>
</body></html>`;

const parseDoc = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

describe('a position carried into a reloaded chapter', () => {
  it('lands on the same text in the fresh copy', () => {
    const before = parseDoc(CHAPTER);
    const text = before.querySelectorAll('p')[1].firstChild as Text;
    const range = before.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 20);

    const after = parseDoc(CHAPTER);
    const carried = toRange(after, parse(fromRange(range)));
    expect(carried.toString()).toBe(range.toString());
    expect(carried.startContainer.ownerDocument).toBe(after);
  });

  // The reader's own additions — a style in the head — do not move where the body's text is.
  it('lands on the same text when the old copy had a style added to its head', () => {
    const before = parseDoc(CHAPTER);
    before.head.append(before.createElement('style'));
    const text = before.querySelector('h1')?.firstChild as Text;
    const range = before.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 7);

    const carried = toRange(parseDoc(CHAPTER), parse(fromRange(range)));
    expect(carried.toString()).toBe('Chapter');
  });
});
