// The book's chapter list — the one ordering the contents panel, the player's ⏮/⏭ and the recording
// surface all count by. An entry is a chapter PART: one recordable stretch, one MP3, one ⏭ stop.
//
// Two books drive nearly every case here. A novel in parts and chapters puts one contents entry in each
// spine file, so recording per file and per entry are indistinguishable on it. A book
// of daily readings keeps 80 devotional Days inside 7 files, its NCX nests each Day under the PREVIOUS
// sermon title, and one of its flow splits lands between a Day's heading and the Day's own reading.

import { describe, expect, it } from 'vitest';
import {
  anchorCharOffsets,
  anchorTextStarts,
  bookChapterHref,
  type ChapterPart,
  type ChapterSource,
  chapterParts,
  frontMatterChapterHref,
  frontMatterMask,
  groupFrontMatter,
  hrefAnchor,
  joinChapterLabels,
  mergeStubs,
  partCharSpans,
  partIndexAt,
  partIsLabelOnly,
  partsOfChapter,
  partWordCounts,
  sectionChapterHref,
  splitLeadIns,
  splitLongParts,
} from '../book-chapters';
import { flattenTocWithDisambiguation, type TocItemLike, topLevelChapters } from '../toc-utils';

/** A source whose hrefs resolve by file name: "text.xhtml#day3" → the section named "text.xhtml". */
function source(files: string[], toc: Array<[string, string]>, over: Partial<ChapterSource> = {}): ChapterSource {
  return {
    sectionCount: files.length,
    toc: toc.map(([href, displayLabel]) => ({ href, displayLabel })),
    sectionIndexForHref: (h) => files.indexOf(h.split('#')[0]),
    sectionLabel: (i) => `Section ${i + 1}`,
    partLabel: (base, part, of) => `${base} ${part} of ${of}`,
    ...over,
  };
}

/** The shipped join rule, so these cases pin the real thing rather than a copy of it. */
const join = joinChapterLabels;

const rows = (parts: readonly ChapterPart[]): string[] => parts.map((p) => p.label);

describe('chapterParts', () => {
  // A Kindle book's entries are `kindle:pos:` links with no `#fragment`: the anchor is the id the reader resolved.
  it('anchors a part at the id the resolver gives an entry with no fragment', () => {
    const src = source(['f0', 'f1'], [], {
      toc: [
        { href: 'kindle:pos:fid:0001:off:0000000000', displayLabel: 'PARTS' },
        { href: 'kindle:pos:fid:0001:off:0000000023', displayLabel: 'NOTE' },
      ],
      sectionIndexForHref: () => 1,
      anchorForHref: (h) => (h.endsWith('0023') ? 'note' : null),
    });
    const anchors = chapterParts(src)
      .filter((p) => p.sectionIndex === 1)
      .map((p) => p.anchor);
    expect(anchors).toEqual([null, 'note']);
  });

  // The ordinary book: one file is one chapter, and nothing about it changes.
  it('gives an ordinary book one part per section', () => {
    const out = chapterParts(
      source(
        ['c1.html', 'c2.html'],
        [
          ['c1.html', 'One'],
          ['c2.html', 'Two'],
        ]
      )
    );
    expect(out.map((p) => [p.index, p.sectionIndex, p.chapterHref, p.part, p.partCount])).toEqual([
      [0, 0, 'c1.html', 1, 1],
      [1, 1, 'c2.html', 1, 1],
    ]);
  });

  it('splits a file that holds several contents entries', () => {
    const out = chapterParts(
      source(
        ['text.xhtml'],
        [
          ['text.xhtml#day1', 'Day 1'],
          ['text.xhtml#day2', 'Day 2'],
          ['text.xhtml#day3', 'Day 3'],
        ]
      )
    );
    expect(out.map((p) => p.anchor)).toEqual(['day1', 'day2', 'day3']);
    expect(out.every((p) => p.sectionIndex === 0)).toBe(true);
  });

  /**
   * A cover or a title page the contents never mention. Iterating the contents instead of the spine
   * would drop these entirely, and a ticked "Cover" row would export no file.
   */
  it('keeps a section the contents say nothing about, whole and under its own name', () => {
    const out = chapterParts(source(['cover.html', 'c1.html'], [['c1.html', 'One']]));
    expect(out[0].baseLabel).toBe('Section 1');
    expect(out[0].chapterHref).toBe(sectionChapterHref(0)); // stable identity without an href
    expect(out[0].hrefs).toEqual([]);
  });

  // Front matter belongs at the front, not wherever the contents page first mentions it.
  it('orders by the spine, not by the contents page', () => {
    const out = chapterParts(
      source(
        ['a.html', 'b.html'],
        [
          ['b.html', 'Second file'],
          ['a.html', 'First file'],
        ]
      )
    );
    expect(rows(out)).toEqual(['First file', 'Second file']);
  });

  it('makes one part of two contents entries with the same href', () => {
    const out = chapterParts(
      source(
        ['text.xhtml'],
        [
          ['text.xhtml#part2', 'Part II'],
          ['text.xhtml#part2', 'Part II – Chapter I'],
        ]
      )
    );
    expect(out).toHaveLength(1);
    expect(out[0].baseLabel).toBe('Part II'); // the first is the one a reader stepping forward arrives at
  });

  // MOBI/AZW3 number their sections, so a contents href borrowed from another format resolves to nothing.
  it('ignores a contents entry the format cannot place', () => {
    const out = chapterParts(
      source(
        ['c1.html'],
        [
          ['nowhere.html', 'Ghost'],
          ['c1.html', 'One'],
        ]
      )
    );
    expect(rows(out)).toEqual(['One']);
  });

  it('shows no part affix when a chapter has only one part', () => {
    const out = chapterParts(source(['c1.html'], [['c1.html', 'One']]));
    expect(out[0].label).toBe('One'); // never "One 1 of 1"
  });
});

/**
 * A book whose contents name nothing usable has no chapter structure to represent, so the book IS the chapter.
 *
 * A Calibre novel can be this case: a single nav link to its title page, and the novel arriving as a few splits,
 * one of them nearly the whole book. "Section 2" is a name Orbis invents for something the book never names — it
 * appears in no contents panel and no heading — so the three belong to one chapter numbered continuously.
 */
describe('chapterParts — a book with no contents', () => {
  const src = source(['title.html', 'a.html', 'b.html'], [['title.html', 'Start']], {
    bookLabel: 'Third Book',
  });

  it('gives every unnamed section one chapter named after the book', () => {
    const out = chapterParts(src);
    expect(rows(out)).toEqual(['Start', 'Third Book 1 of 2', 'Third Book 2 of 2']);
    expect(out[1].chapterHref).toBe(bookChapterHref);
    expect(out[2].chapterHref).toBe(bookChapterHref);
  });

  // The named section keeps its name — it is genuinely named, and it is not the book.
  it('leaves a section the contents DO name alone', () => {
    expect(chapterParts(src)[0].baseLabel).toBe('Start');
  });

  // Numbering runs across the book, so slicing the long section continues the same run.
  it('numbers tracks continuously across the book, slices included', () => {
    const parts = splitLongParts(chapterParts(src), src, (i) => (i === 2 ? 90 : 2));
    expect(rows(parts)).toEqual([
      'Start',
      'Third Book 1 of 4',
      'Third Book 2 of 4',
      'Third Book 3 of 4',
      'Third Book 4 of 4',
    ]);
  });

  /**
   * An unnamed section inside a book that DOES have contents is not the book. "Section 3" is the honest answer
   * there — claiming the book's title for one of its sections would be a lie.
   */
  it('does not claim the book’s title when the book has real contents', () => {
    const withContents = source(
      ['c1.html', 'orphan.html', 'c2.html'],
      [
        ['c1.html', 'One'],
        ['c2.html', 'Two'],
      ]
    );
    expect(rows(chapterParts(withContents))).toEqual(['One', 'Section 2', 'Two']);
  });
});

/**
 * Untitled sections at the front of a book, named for what they are.
 *
 * Most books have more spine files than contents entries, so a nameless section is the norm. The case here: a
 * second spine file holding the book's contents list as plain text, with no heading and no contents entry, would
 * show as `Section 2` at row 1 — with no Section 1 or 3 in sight, because the title page above it holds no text
 * and is hidden.
 */
/**
 * The rule on its own, shared by the recording list and *Export to vault* so the two cannot disagree about a
 * book: `Front matter` in one dialog, `Section 2` in the other.
 */
describe('frontMatterMask', () => {
  type Row = { named?: boolean; own?: boolean; text?: boolean };
  const mask = (rows: Row[]): boolean[] =>
    frontMatterMask(rows, {
      named: (r) => !!r.named,
      hasOwnName: (r) => !!r.own,
      hasText: (r) => r.text !== false,
    });

  it('takes the unnamed run before the first row the contents names', () => {
    expect(mask([{}, {}, { named: true }, {}])).toEqual([true, true, false, false]);
  });

  /** Front matter is a position, not a kind: a trailing unnamed section keeps its number. */
  it('never takes a row after the first named one', () => {
    expect(mask([{ named: true }, {}, {}])).toEqual([false, false, false]);
  });

  /** `Cover` has already said what it is, and is a better label than `Front matter`. */
  it('leaves a section that carries its own heading alone', () => {
    expect(mask([{ own: true }, {}, { named: true }])).toEqual([false, true, false]);
  });

  /** Or `Front matter 2 of 2` ends up sitting alone with no `1 of 2` above it. */
  it('skips an empty section, which takes no place in the run', () => {
    expect(mask([{ text: false }, {}, { named: true }])).toEqual([false, true, false]);
  });

  it('finds none when the contents names nothing', () => {
    expect(mask([{}, {}])).toEqual([false, false]);
  });

  it('finds none when the very first row is named', () => {
    expect(mask([{ named: true }, { named: true }])).toEqual([false, false]);
  });
});

describe('groupFrontMatter', () => {
  /** title page (no text), contents-as-text, a section named by its own heading, then the real chapters. */
  const src = source(['t.html', 'toc.html', 'half.html', 'c1.html'], [['c1.html', 'CHAPTER I']], {
    sectionHasOwnName: (i) => i === 2, // only half.html has a heading of its own
    frontMatterLabel: 'Front matter',
  });
  /** Everything but the title page holds text. */
  const hasText = (i: number): boolean => i !== 0;

  it('names an untitled front section for what it is', () => {
    const out = groupFrontMatter(chapterParts(src), src, hasText);
    expect(rows(out)).toEqual(['Section 1', 'Front matter', 'Section 3', 'CHAPTER I']);
    expect(out[1].chapterHref).toBe(frontMatterChapterHref);
  });

  /**
   * The gap this guards against. The title page holds no text and is hidden from the recording list, so
   * counting it would leave "Front matter 2 of 2" sitting alone with no 1 of 2 above it.
   */
  it('does not give an empty section a number in the run', () => {
    const out = groupFrontMatter(chapterParts(src), src, hasText);
    expect(out[1].label).toBe('Front matter'); // not "2 of 2"
    expect(out[1].partCount).toBe(1);
  });

  it('numbers several untitled front sections as one run', () => {
    const many = source(['a.html', 'b.html', 'c.html', 'c1.html'], [['c1.html', 'CHAPTER I']], {
      sectionHasOwnName: () => false,
      frontMatterLabel: 'Front matter',
    });
    expect(rows(groupFrontMatter(chapterParts(many), many, () => true))).toEqual([
      'Front matter 1 of 3',
      'Front matter 2 of 3',
      'Front matter 3 of 3',
      'CHAPTER I',
    ]);
  });

  // A section with a heading of its own is named, and is not front matter however far forward it sits.
  it('leaves a section that has its own name alone', () => {
    expect(rows(groupFrontMatter(chapterParts(src), src, hasText))[2]).toBe('Section 3');
  });

  /**
   * Only the front. A publisher who includes an appendix or a license almost always lists it, so a trailing
   * untitled section is rare enough not to be worth a term readers know less well.
   */
  it('leaves a trailing untitled section numbered', () => {
    const trailing = source(['c1.html', 'colophon.html'], [['c1.html', 'CHAPTER I']], {
      sectionHasOwnName: () => false,
      frontMatterLabel: 'Front matter',
    });
    expect(rows(groupFrontMatter(chapterParts(trailing), trailing, () => true))).toEqual(['CHAPTER I', 'Section 2']);
  });

  it('does nothing to a book whose first section is already named', () => {
    const named = source(
      ['c1.html', 'c2.html'],
      [
        ['c1.html', 'One'],
        ['c2.html', 'Two'],
      ],
      { sectionHasOwnName: () => true, frontMatterLabel: 'Front matter' }
    );
    expect(rows(groupFrontMatter(chapterParts(named), named, () => true))).toEqual(['One', 'Two']);
  });
});

describe('splitLeadIns', () => {
  /**
   * The daily-readings book's Tenth Day: its heading sits at the tail of one file and its seventeen minutes of
   * reading at the head of the next, above that file's own first anchor. Unsplit, the Day would measure one
   * second while its reading was filed under the Eleventh Day's name.
   */
  const DAILY = source(
    ['h1.xhtml', 'h2.xhtml'],
    [
      ['h1.xhtml#day10', 'Tenth Day'],
      ['h2.xhtml#day11', 'Eleventh Day'],
    ]
  );

  it('hands a file’s lead-in back to the chapter it belongs to, as a second part', () => {
    const out = splitLeadIns(chapterParts(DAILY), DAILY, (h) => (h === 'h2.xhtml#day11' ? 9000 : 0));
    expect(rows(out)).toEqual(['Tenth Day 1 of 2', 'Tenth Day 2 of 2', 'Eleventh Day']);
    // The reading lives in the SECOND file, but it is still the Tenth Day.
    expect(out[1].sectionIndex).toBe(1);
    expect(out[1].chapterHref).toBe('h1.xhtml#day10');
    expect(out[1].anchor).toBeNull(); // it starts where the file starts
    expect(out[1].hrefs).toEqual([]); // no contents entry points at it
  });

  // The ordinary case, and the parts-and-chapters novel's: a file opening at its own first chapter.
  it('does nothing when a file opens at its own first anchor', () => {
    const out = splitLeadIns(chapterParts(DAILY), DAILY, () => 0);
    expect(rows(out)).toEqual(['Tenth Day', 'Eleventh Day']);
  });

  // The book's first section has no previous chapter for its lead-in to belong to.
  it('leaves the first section alone', () => {
    const src = source(['h1.xhtml'], [['h1.xhtml#a', 'A']]);
    const out = splitLeadIns(chapterParts(src), src, () => 5000);
    expect(rows(out)).toEqual(['A']);
  });

  /**
   * A running header or a page-number artifact above the anchor is page furniture, not a chapter continuing.
   * Reassigning it would make a junk row — see `LEAD_IN_CHARS`.
   */
  it('ignores a lead-in too small to be prose', () => {
    const out = splitLeadIns(chapterParts(DAILY), DAILY, (h) => (h === 'h2.xhtml#day11' ? 300 : 0));
    expect(rows(out)).toEqual(['Tenth Day', 'Eleventh Day']);
  });

  /**
   * The daily-readings book's cover is an unreferenced section, and the file after it opens with Project Gutenberg's
   * boilerplate header. That header is unclaimed front matter, not the cover continuing — a part with no anchor
   * already owns its whole file, so nothing of it can be in the next one.
   */
  it('never hands a lead-in to an unanchored part', () => {
    const src = source(
      ['cover.html', 'h1.xhtml'],
      [['h1.xhtml#a', 'Title page']] // cover is unreferenced → one whole-file part, no anchor
    );
    const out = splitLeadIns(chapterParts(src), src, () => 4000);
    expect(rows(out)).toEqual(['Section 1', 'Title page']);
  });

  it('leaves a whole unreferenced section alone — it has no anchor to lead in to', () => {
    const src = source(['cover.html', 'c1.html'], [['c1.html', 'One']]);
    const out = splitLeadIns(chapterParts(src), src, () => 5000);
    expect(rows(out)).toEqual(['Section 1', 'One']);
  });
});

describe('mergeStubs', () => {
  /** The daily-readings shape: each Day's heading and its body are separate contents entries in one file. */
  const DAYS = source(
    ['h1.xhtml'],
    [
      ['h1.xhtml#d1', '[p11] First Day. Contents'],
      ['h1.xhtml#d1b', '[p11] First Day. Contents – ANOTHER BOOK.'],
      ['h1.xhtml#d2', '[p19] Second Day. Contents'],
      ['h1.xhtml#d2b', '[p19] Second Day. Contents – ANOTHER BOOK.'],
    ]
  );

  it('folds a heading-only entry into the body below it', () => {
    const parts = chapterParts(DAYS);
    const out = mergeStubs(parts, (i) => i % 2 === 1, DAYS, join); // the bodies have text, the headings don't
    expect(rows(out)).toEqual([
      '[p11] First Day. Contents – ANOTHER BOOK.',
      '[p19] Second Day. Contents – ANOTHER BOOK.',
    ]);
  });

  it('keeps the earlier entry’s identity and the absorbed href as an alias', () => {
    const out = mergeStubs(chapterParts(DAYS), (i) => i % 2 === 1, DAYS, join);
    expect(out[0].chapterHref).toBe('h1.xhtml#d1'); // the one ⏭ arrives at
    expect(out[0].hrefs).toEqual(['h1.xhtml#d1', 'h1.xhtml#d1b']);
    expect(out[0].anchor).toBe('d1'); // the merged part starts where the stub did
  });

  // Without the alias, a position resolved to the body would fall through to the section's first part.
  it('is findable by the href it absorbed', () => {
    const out = mergeStubs(chapterParts(DAYS), (i) => i % 2 === 1, DAYS, join);
    expect(partIndexAt(out, 0, 'h1.xhtml#d2b')).toBe(1);
  });

  it('joins names, unless the later one already contains the earlier', () => {
    const notes = source(
      ['n.xhtml'],
      [
        ['n.xhtml#a', 'NOTE A.'],
        ['n.xhtml#ab', 'Patience as Ownership.'],
      ]
    );
    const out = mergeStubs(chapterParts(notes), (i) => i === 1, notes, join);
    expect(rows(out)).toEqual(['NOTE A. – Patience as Ownership.']);
  });

  /**
   * The parts-and-chapters novel's front matter: a half-title and `PART I` share a file and both hold almost
   * nothing, with `CHAPTER I` in the next file. The run folds into one short part, and it stays a part
   * — the publisher put it in a file of its own, which is the book saying the divider stands alone.
   */
  it('folds a run of stubs into one, and leaves it standing when its file holds nothing else', () => {
    const cp = source(
      ['h2.xhtml', 'h3.xhtml'],
      [
        ['h2.xhtml#half', 'SAMPLE BOOK'],
        ['h2.xhtml#p1', 'PART I'],
        ['h3.xhtml#c1', 'PART I – CHAPTER I'],
      ]
    );
    const out = mergeStubs(chapterParts(cp), (i) => i === 2, cp, join);
    expect(rows(out)).toEqual(['SAMPLE BOOK – PART I', 'PART I – CHAPTER I']);
    expect(out[0].hrefs).toEqual(['h2.xhtml#half', 'h2.xhtml#p1']);
  });

  it('never merges across a file boundary', () => {
    const src = source(
      ['a.xhtml', 'b.xhtml'],
      [
        ['a.xhtml#stub', 'Divider'],
        ['b.xhtml#c1', 'Chapter One'],
      ]
    );
    const out = mergeStubs(chapterParts(src), (i) => i === 1, src, join);
    expect(rows(out)).toEqual(['Divider', 'Chapter One']);
  });

  /**
   * The ordering constraint. `splitLeadIns` creates stubs that did not exist before it: once the Tenth
   * Day's reading is taken back, the Eleventh Day's heading is left holding nothing but itself. So the
   * merge must run second, and this is the whole daily-readings boundary end to end.
   */
  it('runs after splitLeadIns, and absorbs the stub the split creates', () => {
    const src = source(
      ['h1.xhtml', 'h2.xhtml'],
      [
        ['h1.xhtml#d10', 'Tenth Day'],
        ['h1.xhtml#d10b', 'Tenth Day – ANOTHER BOOK.'],
        ['h2.xhtml#d11', 'Eleventh Day'],
        ['h2.xhtml#d11b', 'Eleventh Day – ANOTHER BOOK.'],
      ]
    );
    const split = splitLeadIns(chapterParts(src), src, (h) => (h === 'h2.xhtml#d11' ? 9000 : 0));
    // After the split: [Tenth hd, Tenth body, Tenth part2 (the reading), Eleventh hd, Eleventh body].
    // Everything holds nothing except the reclaimed reading and the Eleventh Day's own body.
    const withText = new Set([split.findIndex((p) => p.hrefs.length === 0), split.length - 1]);
    const out = mergeStubs(split, (i) => withText.has(i), src, join);
    expect(rows(out)).toEqual([
      'Tenth Day – ANOTHER BOOK. 1 of 2',
      'Tenth Day – ANOTHER BOOK. 2 of 2',
      'Eleventh Day – ANOTHER BOOK.',
    ]);
    expect(partsOfChapter(out, out[0].chapterHref)).toHaveLength(2);
  });
});

/**
 * Dividing a chapter too long to be one track.
 *
 * A book that names one contents entry or none arrives as a single chapter — a novel can be 19 hours in one
 * headingless file — and a chapter over an hour is common. Slices are even, so the shortest
 * one possible sits at the trigger: 60.1 minutes gives three of 20.0.
 */
describe('splitLongParts', () => {
  const src = source(
    ['a.html', 'b.html'],
    [
      ['a.html', 'Short chapter'],
      ['b.html', 'Long chapter'],
    ]
  );
  /** Minutes per part, by index — the estimate the trigger reads. */
  const split = (short: number, long: number): ChapterPart[] =>
    splitLongParts(chapterParts(src), src, (i) => (i === 0 ? short : long));

  it('leaves a chapter at or under an hour alone', () => {
    expect(rows(split(10, 60))).toEqual(['Short chapter', 'Long chapter']);
  });

  // Just past the trigger, and the reason no minimum-length rule is needed: three slices of 20 minutes.
  it('divides a 61-minute chapter into three', () => {
    const out = split(10, 61);
    expect(rows(out)).toEqual(['Short chapter', 'Long chapter 1 of 3', 'Long chapter 2 of 3', 'Long chapter 3 of 3']);
  });

  it('divides a 102-minute chapter into four', () => {
    expect(rows(split(10, 102)).filter((r) => r.startsWith('Long'))).toHaveLength(4);
  });

  // That novel: 19 hours in one chapter.
  it('divides a 19-hour chapter into 38', () => {
    const out = split(10, 19 * 60);
    expect(out.filter((p) => p.slice).length).toBe(38);
    expect(out[out.length - 1].label).toBe('Long chapter 38 of 38');
  });

  it('numbers slices from 1 and shares one chapter identity', () => {
    const out = split(10, 61).filter((p) => p.slice);
    expect(out.map((p) => p.part)).toEqual([1, 2, 3]);
    expect(new Set(out.map((p) => p.chapterHref)).size).toBe(1);
    expect(out.map((p) => p.slice?.index)).toEqual([0, 1, 2]);
  });

  /**
   * Only the first slice answers to the contents href. A position resolved to this chapter's entry should land at
   * its beginning, not forty minutes into it.
   */
  it('leaves the contents href on the first slice only', () => {
    const out = split(10, 61).filter((p) => p.slice);
    expect(out.map((p) => p.hrefs.length)).toEqual([1, 0, 0]);
    expect(partIndexAt(split(10, 61), 1, 'b.html')).toBe(1);
  });

  it('gives every slice an even share of the chapter', () => {
    const parts = split(10, 90);
    const spans = partCharSpans(parts, [1000, 9000], () => 0);
    const lengths = spans.slice(1).map((sp) => sp.end - sp.start);
    expect(lengths).toEqual([3000, 3000, 3000]);
  });

  /**
   * Slices share a start position, so the boundary arithmetic has to work over DISTINCT positions and then
   * subdivide. Treating each slice as its own boundary gives the first one the whole range and the rest nothing.
   */
  it('shares the range among slices rather than giving it all to the first', () => {
    const many = source(
      ['f.html'],
      [
        ['f.html#one', 'One'],
        ['f.html#two', 'Two'],
      ]
    );
    const offsets = new Map([
      ['f.html#one', 0],
      ['f.html#two', 4000],
    ]);
    const parts = splitLongParts(chapterParts(many), many, (i) => (i === 0 ? 100 : 5)); // 100 → 4 slices
    const spans = partCharSpans(parts, [6000], (h) => offsets.get(h));
    expect(spans.map((sp) => [sp.start, sp.end])).toEqual([
      [0, 1000],
      [1000, 2000],
      [2000, 3000],
      [3000, 4000],
      [4000, 6000],
    ]);
  });
});

describe('hrefAnchor', () => {
  it('reads the fragment', () => {
    expect(hrefAnchor('text.xhtml#day7')).toBe('day7');
  });
  it('is null for a whole file, and for a trailing hash', () => {
    expect(hrefAnchor('text.xhtml')).toBeNull();
    expect(hrefAnchor('text.xhtml#')).toBeNull();
  });
});

describe('anchorCharOffsets', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
  const offsets = (doc: Document, anchors: string[]): Array<number | undefined> =>
    anchors.map((a) => anchorCharOffsets(doc, anchors).get(a));

  it('counts the characters of text before each anchor', () => {
    const doc = parse('<p>12345</p><h2 id="two">Two</h2><p>abc</p><h2 id="three">Three</h2>');
    expect(offsets(doc, ['two', 'three'])).toEqual([5, 5 + 3 + 3]);
  });

  it('starts at zero for an anchor at the top of the file', () => {
    expect(offsets(parse('<h2 id="one">One</h2><p>rest</p>'), ['one'])).toEqual([0]);
  });

  // Older EPUBs anchor their contents with <a name="…"> rather than an id.
  it('accepts a name= anchor', () => {
    expect(offsets(parse('<p>1234</p><a name="ch1"></a><p>text</p>'), ['ch1'])).toEqual([4]);
  });

  // Absent rather than zero: a chapter with no offset measures from where the previous one ended,
  // which beats claiming it starts at the top of the file.
  it('leaves out an anchor that resolves to nothing', () => {
    expect(anchorCharOffsets(parse('<p>text</p>'), ['gone']).has('gone')).toBe(false);
  });

  it('gives both of two contents entries anchored at the same element the same offset', () => {
    const doc = parse('<p>12345</p><h2 id="part2"><span id="ch1">Part II</span></h2>');
    expect(offsets(doc, ['part2', 'ch1'])).toEqual([5, 5]);
  });
});

/**
 * **One walk, the same answer as a search per anchor.** The location index used to find each anchor's first text by
 * comparing the anchor with every text node in turn, which on a section of 73,000 text nodes was 32 s of a first
 * open. The search is kept here as the definition, so the fast answer is checked against it, edges included.
 */
describe('anchorTextStarts', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
  /** The old search: the start of the first text node inside or after the anchor's element. */
  const searched = (doc: Document, id: string): number | undefined => {
    const el = doc.getElementById(id);
    if (!el) return undefined;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let start = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const rel = el.compareDocumentPosition(n);
      if (rel & Node.DOCUMENT_POSITION_CONTAINED_BY || rel & Node.DOCUMENT_POSITION_FOLLOWING) return start;
      start += (n as Text).length;
    }
    return undefined;
  };

  it('agrees with the search for every anchor, including one on <body> and one with no text after it', () => {
    const doc = parse(
      '<body id="top"><p id="a">12345</p><div id="b"><h2 id="c"><span id="d">Two</span></h2>abc</div>' +
        '<p>x<b id="e"></b>yz</p><section id="f"><p>last</p></section><hr id="g"></body>'
    );
    const ids = ['top', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'missing'];
    const starts = anchorTextStarts(doc, ids);
    expect(ids.map((id) => starts.get(id))).toEqual(ids.map((id) => searched(doc, id)));
    expect(starts.get('top')).toBe(0);
    expect(starts.has('g')).toBe(false);
  });

  it('agrees with the search on a long flat document, the shape that made the search slow', () => {
    const verses = Array.from({ length: 400 }, (_, i) => `<p id="v${i}"><sup>${i}</sup> Verse ${i} text.</p>`);
    const doc = parse(`<body>${verses.join('')}</body>`);
    const ids = ['v0', 'v57', 'v200', 'v399'];
    const starts = anchorTextStarts(doc, ids);
    expect(ids.map((id) => starts.get(id))).toEqual(ids.map((id) => searched(doc, id)));
  });
});

/**
 * The merge's question, which is NOT the Record list's question.
 *
 * A row is hidden when it holds no text at all; a part is merged when it is too short to be a chapter. The
 * daily-readings book's Day headings hold about five words, so they pass the first test and have to fail this one.
 *
 * Deriving this from the markup instead does not work — see `LABEL_CHARS`. The spans below are the real ones: labels at
 * 27–42 characters, the smallest real chapter at 1,428.
 */
describe('partIsLabelOnly', () => {
  const src = source(
    ['h1.xhtml'],
    [
      ['h1.xhtml#dayHead', 'Tenth Day.'],
      ['h1.xhtml#dayBody', 'ANOTHER BOOK.'],
      ['h1.xhtml#notes', 'NOTE.'],
    ]
  );
  const offsets = new Map([
    ['h1.xhtml#dayHead', 0],
    ['h1.xhtml#dayBody', 27],
    ['h1.xhtml#notes', 11690],
  ]);
  const flags = partIsLabelOnly(chapterParts(src), [13917], (h) => offsets.get(h));

  it('calls a 27-character part a label', () => {
    expect(flags[0]).toBe(true);
  });

  it('calls an 11,663-character part a chapter', () => {
    expect(flags[1]).toBe(false);
  });

  /**
   * `NOTE.` is a five-character heading over 2,227 characters of note, and `[p9] CONTENTS.` a fifteen-character
   * one over 1,428 characters of list. Both are real chapters, and both sit far above the line.
   */
  it('calls a short-titled chapter a chapter', () => {
    expect(flags[2]).toBe(false);
  });

  /**
   * A book of topical daily readings labels its headings on EMPTY anchors — `<a id>` before the heading
   * text — so there is nothing to measure the label against and only its span distinguishes it. 31 characters.
   */
  it('calls a label on an empty anchor a label', () => {
    const labelSrc = source(
      ['s.xhtml'],
      [
        ['s.xhtml#topic', 'KEEPING WATCH: What Is a Ferry For?'],
        ['s.xhtml#day', 'January 7'],
      ]
    );
    const labelOffsets = new Map([
      ['s.xhtml#topic', 0],
      ['s.xhtml#day', 31],
    ]);
    expect(partIsLabelOnly(chapterParts(labelSrc), [1622], (h) => labelOffsets.get(h))).toEqual([true, false]);
  });

  /**
   * The daily-readings book's preface is anchored on a `<div>` wrapping 6,016 characters against a part spanning 4,469.
   * Subtracting the element's own text would make a five-minute chapter read as a bare heading; measuring the span
   * alone cannot make that mistake.
   */
  it('calls a chapter anchored on a container a chapter', () => {
    const divSrc = source(
      ['h1.xhtml'],
      [
        ['h1.xhtml#pref', '[p5] PREFACE.'],
        ['h1.xhtml#toc', '[p9] CONTENTS.'],
      ]
    );
    const divOffsets = new Map([
      ['h1.xhtml#pref', 92],
      ['h1.xhtml#toc', 4469],
    ]);
    expect(partIsLabelOnly(chapterParts(divSrc), [5897], (h) => divOffsets.get(h))).toEqual([false, false]);
  });
});

describe('partWordCounts', () => {
  it('gives an ordinary book each section’s own count', () => {
    const src = source(
      ['a.html', 'b.html'],
      [
        ['a.html', 'One'],
        ['b.html', 'Two'],
      ]
    );
    expect(partWordCounts(chapterParts(src), [1000, 500], [200, 100], () => undefined)).toEqual([200, 100]);
  });

  // The fault this guards against: eighty Days in one file, each offered as the whole file's length.
  it('shares a file’s words out among the parts inside it', () => {
    const src = source(
      ['text.xhtml'],
      [
        ['text.xhtml#d1', 'Day 1'],
        ['text.xhtml#d2', 'Day 2'],
        ['text.xhtml#d3', 'Day 3'],
      ]
    );
    const offsets = new Map([
      ['text.xhtml#d1', 0],
      ['text.xhtml#d2', 400],
      ['text.xhtml#d3', 600],
    ]);
    expect(partWordCounts(chapterParts(src), [1000], [500], (h) => offsets.get(h))).toEqual([200, 100, 200]);
  });

  // Content above the file's first anchor belongs to the part that opens the file, not to nobody.
  it('gives the first part of a file everything above its own anchor', () => {
    const src = source(
      ['text.xhtml'],
      [
        ['text.xhtml#d1', 'Day 1'],
        ['text.xhtml#d2', 'Day 2'],
      ]
    );
    const offsets = new Map([
      ['text.xhtml#d1', 200],
      ['text.xhtml#d2', 600],
    ]);
    expect(partWordCounts(chapterParts(src), [1000], [500], (h) => offsets.get(h))).toEqual([300, 200]);
  });

  it('keeps the section’s total whole when an anchor did not resolve', () => {
    const src = source(
      ['text.xhtml'],
      [
        ['text.xhtml#d1', 'Day 1'],
        ['text.xhtml#gone', 'Day 2'],
        ['text.xhtml#d3', 'Day 3'],
      ]
    );
    const offsets = new Map([['text.xhtml#d3', 800]]);
    const out = partWordCounts(chapterParts(src), [1000], [500], (h) => offsets.get(h));
    expect(out).toEqual([400, 0, 100]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(500);
  });

  it('never gives a part a negative length from a stray offset', () => {
    const src = source(
      ['text.xhtml'],
      [
        ['text.xhtml#d1', 'Day 1'],
        ['text.xhtml#d2', 'Day 2'],
        ['text.xhtml#d3', 'Day 3'],
      ]
    );
    const offsets = new Map([
      ['text.xhtml#d2', 900],
      ['text.xhtml#d3', 100], // out of order — a book whose anchors do not run in document order
    ]);
    const out = partWordCounts(chapterParts(src), [1000], [500], (h) => offsets.get(h));
    expect(out.every((w) => w >= 0)).toBe(true);
  });

  /**
   * A reclaimed lead-in starts where its file starts, so it measures up to that file's first anchor.
   * Two Days in the first file, so the Tenth is not also its section's first part — which would make it
   * own the whole file, per the rule that a section's opening part takes everything above its anchor.
   */
  it('measures a lead-in part from the start of its file', () => {
    const src = source(
      ['h1.xhtml', 'h2.xhtml'],
      [
        ['h1.xhtml#d9', 'Ninth Day'],
        ['h1.xhtml#d10', 'Tenth Day'],
        ['h2.xhtml#d11', 'Eleventh Day'],
      ]
    );
    const offsets = new Map([
      ['h1.xhtml#d9', 0],
      ['h1.xhtml#d10', 900],
      ['h2.xhtml#d11', 8000], // a chapter's worth of prose above it, well past `LEAD_IN_CHARS`
    ]);
    const parts = splitLeadIns(chapterParts(src), src, (h) => offsets.get(h));
    const out = partWordCounts(parts, [1000, 10000], [500, 5000], (h) => offsets.get(h));
    // Ninth Day, the Tenth's heading tail, the Tenth's reclaimed reading, then the Eleventh Day.
    expect(out).toEqual([450, 50, 4000, 1000]);
  });
});

describe('partIndexAt', () => {
  const parts = chapterParts(
    source(
      ['front.html', 'text.xhtml'],
      [
        ['text.xhtml#day1', 'Day 1'],
        ['text.xhtml#day2', 'Day 2'],
      ]
    )
  );

  it('answers exactly when the position carries its contents href', () => {
    expect(partIndexAt(parts, 1, 'text.xhtml#day2')).toBe(2);
  });

  // A position read straight from the text carries no entry; a section's start is its first part.
  it('falls back to the section’s first part without an href', () => {
    expect(partIndexAt(parts, 1)).toBe(1);
  });

  it('is -1 for a section holding no part', () => {
    expect(partIndexAt(parts, 9)).toBe(-1);
  });
});

/**
 * **A chapter is a top-level contents entry, covering everything under it.**
 *
 * The caller says so by passing `hrefs` — the subtree — and every surface that picks between chapters does. A book
 * converted from a folder of notes is why: Orbis's own markdown converter writes a nav entry per heading, so a chapter
 * per entry would be a track per heading, most of them a few minutes long. A flat contents page passes no `hrefs` and
 * is untouched, which is every case above this one.
 */
describe('chapterParts over top-level entries', () => {
  /** Two documents, each with headings beneath it — the shape a folder of notes converts to. */
  const branchSource = (over: Partial<ChapterSource> = {}): ChapterSource => ({
    sectionCount: 2,
    toc: [
      {
        href: 'roadmap.xhtml',
        displayLabel: 'Orbis Reader — Roadmap',
        hrefs: ['roadmap.xhtml', 'roadmap.xhtml#open', 'roadmap.xhtml#phase-5'],
      },
      {
        href: 'security.xhtml',
        displayLabel: 'Security model',
        hrefs: ['security.xhtml', 'security.xhtml#trusts'],
      },
    ],
    sectionIndexForHref: (h) => ['roadmap.xhtml', 'security.xhtml'].indexOf(h.split('#')[0]),
    sectionLabel: (i) => `Section ${i + 1}`,
    partLabel: (base, part, of) => `${base} ${part} of ${of}`,
    ...over,
  });

  it('makes one chapter per document, not one per heading', () => {
    expect(rows(chapterParts(branchSource()))).toEqual(['Orbis Reader — Roadmap', 'Security model']);
  });

  /** The whole reason the aliases exist: a reader under a subheading still has to land on the right chapter. */
  it('is found by any href beneath it', () => {
    const parts = chapterParts(branchSource());
    expect(partIndexAt(parts, 0, 'roadmap.xhtml#phase-5')).toBe(0);
    expect(partIndexAt(parts, 0, 'roadmap.xhtml#open')).toBe(0);
    expect(partIndexAt(parts, 1, 'security.xhtml#trusts')).toBe(1);
    // And not by a heading belonging to the other document.
    expect(partIndexAt(parts, 0, 'security.xhtml#trusts')).not.toBe(0);
  });

  it('starts at the document, so its first paragraph is not stranded above the chapter', () => {
    expect(chapterParts(branchSource()).map((p) => p.anchor)).toEqual([null, null]);
  });

  /**
   * **Placed by the first href that resolves, not by its head.** A book is a file somebody else made: the head can
   * name a file the format cannot place while the headings under it place perfectly. Dropping the entry would leave
   * its section to report itself as `Section 1` — a chapter number the book never wrote.
   */
  it('is still listed when only a heading under it can be placed', () => {
    const src = branchSource({
      // The bare document href resolves to nothing; the anchored headings still do.
      sectionIndexForHref: (h) => (h.includes('#') ? ['roadmap.xhtml', 'security.xhtml'].indexOf(h.split('#')[0]) : -1),
    });
    const parts = chapterParts(src);
    expect(rows(parts)).toEqual(['Orbis Reader — Roadmap', 'Security model']);
    // Anchored where it could actually be placed, rather than at a section start it could not confirm.
    expect(parts[0].anchor).toBe('open');
    expect(parts[0].sectionIndex).toBe(0);
  });

  /** An entry that stands only for itself is the flat case, and covers only itself. */
  it('treats an entry with no subtree as covering only itself', () => {
    const parts = chapterParts(branchSource({ toc: [{ href: 'roadmap.xhtml#one', displayLabel: 'Chapter One' }] }));
    expect(parts).toHaveLength(2); // the chapter, plus the section the contents never mention
    expect(parts[0].hrefs).toEqual(['roadmap.xhtml#one']);
    expect(parts[0].label).toBe('Chapter One');
  });
});

/**
 * The composition `OrbisReaderView.chapterParts` performs: the real `topLevelChapters` feeding the real
 * `chapterParts`. Pinned together because the failure would be passing the FLAT contents, which type-checks
 * perfectly and quietly gives one track per heading.
 */
describe('the recording unit, end to end', () => {
  /** Two documents with three headings each — a folder of notes, in miniature. */
  const NAV: TocItemLike[] = [
    {
      label: 'Orbis Reader — Roadmap',
      href: 'roadmap.xhtml',
      subitems: [
        { label: 'What is open', href: 'roadmap.xhtml#open' },
        { label: 'Phase 5', href: 'roadmap.xhtml#phase-5', subitems: [{ label: 'Docs', href: 'roadmap.xhtml#docs' }] },
      ],
    },
    {
      label: 'Security model',
      href: 'security.xhtml',
      subitems: [{ label: 'What Orbis trusts', href: 'security.xhtml#trusts' }],
    },
  ];

  const partsFrom = (toc: ChapterSource['toc']): readonly ChapterPart[] =>
    chapterParts({
      sectionCount: 2,
      toc,
      sectionIndexForHref: (h) => ['roadmap.xhtml', 'security.xhtml'].indexOf(h.split('#')[0]),
      sectionLabel: (i) => `Section ${i + 1}`,
      partLabel: (base, part, of) => `${base} ${part} of ${of}`,
    });

  it('is the document, where the flat contents would have made it the heading', () => {
    const branches = topLevelChapters(NAV).map((b) => ({
      href: b.href,
      displayLabel: b.displayLabel,
      hrefs: b.hrefs,
    }));
    expect(rows(partsFrom(branches))).toEqual(['Orbis Reader — Roadmap', 'Security model']);
    // What the same book gives if the flat list is passed: a track per heading.
    const flat = flattenTocWithDisambiguation(NAV).map((e) => ({ href: e.href, displayLabel: e.displayLabel }));
    expect(partsFrom(flat)).toHaveLength(6);
  });

  it('still places a position taken under the deepest heading', () => {
    const branches = topLevelChapters(NAV).map((b) => ({
      href: b.href,
      displayLabel: b.displayLabel,
      hrefs: b.hrefs,
    }));
    // `roadmap.xhtml#docs` is two levels down and is not a chapter; the Roadmap owns it.
    expect(partIndexAt(partsFrom(branches), 0, 'roadmap.xhtml#docs')).toBe(0);
  });
});
