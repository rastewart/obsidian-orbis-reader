// What lands in one chapter's MP3 — the stretch of a shared file it owns, and whether it has anything to say.
//
// Two failures live in this decision. A chapter taken as a whole spine file turns a book keeping 80
// devotional Days in 7 files into seven MP3s you cannot skip within. And a chapter with no text —
// a cover, a title page, a converter's blank split file — produces no audio, and counting that as a FAILED
// chapter makes a run over an ordinary book end by reporting failures for its front matter.

import { describe, expect, it } from 'vitest';
import { chapterUnits, classifyChapter, type GenerateResult } from '../reader/tts/recording';
import { getReadingUnits } from '../reader/tts/tts-blocks';

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/** A file holding three Days, each anchored on its own heading — the shape a chapter smaller than a file takes. */
const THREE_DAYS = `<!DOCTYPE html><html lang="en"><body>
<p>A preface, sitting above the first Day.</p>
<h2 id="d1">Day 1</h2>
<p>The first day's reading.</p>
<h2 id="d2">Day 2</h2>
<p>The second day's reading.</p>
<h2 id="d3">Day 3</h2>
<p>The third day's reading.</p>
</body></html>`;

const texts = (html: string, opts: { sectionAnchors?: (string | null)[]; anchorAt?: number }): string[] => {
  const doc = parse(html);
  return chapterUnits(getReadingUnits(doc, 0), doc, opts).map((u) => u.text);
};

describe('chapterUnits — which sentences belong to this chapter', () => {
  // An ordinary book: one file is one chapter, and it records the whole file.
  it('records the whole file when the file holds one chapter', () => {
    const out = texts(THREE_DAYS, {});
    expect(out).toHaveLength(7);
    expect(out[0]).toBe('A preface, sitting above the first Day.');
  });

  it('records only its own Day when the file holds several', () => {
    expect(texts(THREE_DAYS, { sectionAnchors: ['d1', 'd2', 'd3'], anchorAt: 1 })).toEqual([
      'Day 2',
      "The second day's reading.",
    ]);
  });

  // Content above the file's first anchor belongs to the chapter that opens the file, not to nobody.
  it('gives the first chapter everything above its own anchor', () => {
    expect(texts(THREE_DAYS, { sectionAnchors: ['d1', 'd2', 'd3'], anchorAt: 0 })).toEqual([
      'A preface, sitting above the first Day.',
      'Day 1',
      "The first day's reading.",
    ]);
  });

  it('runs the last chapter to the end of the file', () => {
    expect(texts(THREE_DAYS, { sectionAnchors: ['d1', 'd2', 'd3'], anchorAt: 2 })).toEqual([
      'Day 3',
      "The third day's reading.",
    ]);
  });

  /**
   * The heading is the chapter's FIRST sentence, not the previous chapter's last.
   *
   * `selectNodeContents(el)` starts a range before the element's first child, while a reading unit starts inside
   * the text node — so the plain last-unit-at-or-before rule answers with the paragraph above the heading, and
   * every chapter's MP3 would open on the closing sentence of the one before it.
   */
  it('opens on its own heading, not on the end of the previous chapter', () => {
    const out = texts(THREE_DAYS, { sectionAnchors: ['d1', 'd2', 'd3'], anchorAt: 1 });
    expect(out[0]).toBe('Day 2');
    expect(out).not.toContain("The first day's reading.");
  });

  it('covers the file exactly once across all its chapters', () => {
    const anchors = ['d1', 'd2', 'd3'];
    const all = [0, 1, 2].flatMap((anchorAt) => texts(THREE_DAYS, { sectionAnchors: anchors, anchorAt }));
    expect(all).toEqual(texts(THREE_DAYS, {}));
  });

  // An anchor the contents page points at but the document does not have. The chapter records nothing rather
  // than swallowing its neighbor's text — see `chapterBoundaries`.
  it('records nothing for an anchor that resolved to nothing', () => {
    expect(texts(THREE_DAYS, { sectionAnchors: ['d1', 'gone', 'd3'], anchorAt: 1 })).toEqual([]);
  });
});

describe('chapterUnits — a chapter with nothing to say', () => {
  // Most books have several of these: covers, title pages, copyright notices, blank split files.
  it('is empty for a cover page of nothing but an image', () => {
    expect(texts('<!DOCTYPE html><html lang="en"><body><img src="cover.jpg" alt=""/></body></html>', {})).toEqual([]);
  });

  it('is empty for a blank file a converter left behind', () => {
    expect(texts('<!DOCTYPE html><html lang="en"><body>\n  <div></div>\n</body></html>', {})).toEqual([]);
  });

  it('is empty for whitespace-only markup', () => {
    expect(texts('<!DOCTYPE html><html lang="en"><body><p> </p><p>\n</p></body></html>', {})).toEqual([]);
  });

  // A title page DOES have text, so it records — the rule is "no text", not "short".
  it('is not empty for a title page, which has words on it', () => {
    const out = texts('<!DOCTYPE html><html lang="en"><body><h1>Sample Book</h1><p>Orbis Tester</p></body></html>', {});
    expect(out).toEqual(['Sample Book', 'Orbis Tester']);
  });
});

/**
 * Telling apart the four ways a chapter finishes with no new audio.
 *
 * Asking only whether any segments came back counts a cover page — which produces nothing because there is nothing
 * to produce — the same as a chapter whose every sentence the server rejected. A run over an ordinary book would
 * then end by reporting failures for its front matter, which reads as the plugin being broken.
 */
describe('classifyChapter', () => {
  const result = (over: Partial<GenerateResult>): GenerateResult => ({
    segments: 0,
    failed: 0,
    durationSec: 0,
    fileBytes: 0,
    ...over,
  });

  it('calls a chapter that recorded audio recorded', () => {
    expect(classifyChapter(result({ segments: 42, durationSec: 900 }))).toBe('recorded');
  });

  // Nothing to say is its own verdict, not a fault.
  it('calls a chapter with no text empty, not failed', () => {
    expect(classifyChapter(result({ noText: true }))).toBe('empty');
  });

  it('calls a chapter whose every sentence failed failed', () => {
    expect(classifyChapter(result({ failed: 438, failure: 'voice-rejected' }))).toBe('failed');
  });

  /**
   * **A track missing ONE sentence is a failed track.** Counting any segments at all as `recorded` would write a
   * thirty-minute chapter that lost a sentence to a server stall to disk and report it as done, and the only way to
   * discover it would be to listen to the whole thing.
   */
  it('calls a chapter that recorded almost every sentence failed', () => {
    expect(classifyChapter(result({ segments: 437, failed: 1, durationSec: 1800 }))).toBe('failed');
  });

  it('still calls a chapter that recorded every sentence recorded', () => {
    expect(classifyChapter(result({ segments: 438, failed: 0, durationSec: 1800 }))).toBe('recorded');
  });

  // A cancellation is the reader's decision and outranks the failure count it leaves behind.
  it('reads cancellation before a partial failure', () => {
    expect(classifyChapter(result({ segments: 200, failed: 1, cancelled: true }))).toBe('cancelled');
  });

  it('calls a cancelled chapter cancelled, so the run stops rather than counting a fault', () => {
    expect(classifyChapter(result({ cancelled: true, failed: 3 }))).toBe('cancelled');
  });

  it('calls a section that would not open unreadable', () => {
    expect(classifyChapter(null)).toBe('unreadable');
  });

  // Cancelling inside a chapter that also had nothing to say is still a cancellation: the run must stop.
  it('reads cancellation before emptiness', () => {
    expect(classifyChapter(result({ cancelled: true, noText: true }))).toBe('cancelled');
  });
});
