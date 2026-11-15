import { describe, expect, it } from 'vitest';
import { chapterKey, flattenTocWithDisambiguation, TocItemLike, tocNeighbourHref } from '../toc-utils';

describe('flattenTocWithDisambiguation', () => {
  it('leaves labels unchanged when nothing collides', () => {
    const toc: TocItemLike[] = [
      { label: 'Introduction', href: 'intro.xhtml' },
      { label: 'Chapter One', href: 'ch1.xhtml' },
    ];
    const flat = flattenTocWithDisambiguation(toc);
    expect(flat.map((e) => e.displayLabel)).toEqual(['Introduction', 'Chapter One']);
  });

  it('qualifies colliding labels using their structural parent', () => {
    const toc: TocItemLike[] = [
      {
        label: 'PART I',
        href: 'part1.xhtml',
        subitems: [
          { label: 'CHAPTER I', href: 'part1.xhtml#c1' },
          { label: 'CHAPTER II', href: 'part1.xhtml#c2' },
        ],
      },
      {
        label: 'PART II',
        href: 'part2.xhtml',
        subitems: [{ label: 'CHAPTER I', href: 'part2.xhtml#c1' }],
      },
    ];
    const flat = flattenTocWithDisambiguation(toc);
    const byHref = new Map(flat.map((e) => [e.href, e.displayLabel]));
    expect(byHref.get('part1.xhtml#c1')).toBe('PART I – CHAPTER I');
    expect(byHref.get('part2.xhtml#c1')).toBe('PART II – CHAPTER I');
    // A non-colliding sibling still gets its Part, so a Part's chapters read consistently
    // (e.g. Part VI's unique CHAPTER VIII shouldn't drop the "PART VI –" its siblings have).
    expect(byHref.get('part1.xhtml#c2')).toBe('PART I – CHAPTER II');
    // The PART landmarks themselves are never re-qualified.
    expect(byHref.get('part1.xhtml')).toBe('PART I');
  });

  it('names every chapter under a parent the same way once any of them needs the parent’s name', () => {
    // An omnibus of novels: the first novel's "Chapter 01"–"Chapter 09" are unique, "Chapter 10" repeats in the next
    // novel. Qualified by collision alone the list read "Chapter 09" then "Sample Book – Chapter 10"; the whole novel
    // reads one way now.
    const flat = flattenTocWithDisambiguation([
      {
        label: 'Sample Book',
        href: 'd.xhtml',
        subitems: [
          { label: 'Chapter 09', href: 'd9.xhtml' },
          { label: 'Chapter 10', href: 'd10.xhtml' },
        ],
      },
      { label: 'Sample Book Two', href: 'm.xhtml', subitems: [{ label: 'Chapter 10', href: 'm10.xhtml' }] },
      { label: 'Glossary', href: 'g.xhtml', subitems: [{ label: 'Terms', href: 'g1.xhtml' }] },
    ]);
    const name = (href: string) => flat.find((e) => e.href === href)?.displayLabel;
    expect(name('d9.xhtml')).toBe('Sample Book – Chapter 09');
    expect(name('d10.xhtml')).toBe('Sample Book – Chapter 10');
    expect(name('m10.xhtml')).toBe('Sample Book Two – Chapter 10');
    // A parent none of whose children collides lends its name to none of them.
    expect(name('g1.xhtml')).toBe('Terms');
  });

  it('qualifies colliding flat siblings using the nearest preceding unique landmark', () => {
    // Many real EPUB NCX files declare "PART I", "CHAPTER I"..."CHAPTER VII",
    // "PART II", "CHAPTER I"... as a flat list of siblings with no real nesting.
    const toc: TocItemLike[] = [
      { label: 'PART I', href: 'p1.xhtml' },
      { label: 'CHAPTER I', href: 'p1c1.xhtml' },
      { label: 'PART II', href: 'p2.xhtml' },
      { label: 'CHAPTER I', href: 'p2c1.xhtml' },
    ];
    const flat = flattenTocWithDisambiguation(toc);
    const byHref = new Map(flat.map((e) => [e.href, e.displayLabel]));
    expect(byHref.get('p1c1.xhtml')).toBe('PART I – CHAPTER I');
    expect(byHref.get('p2c1.xhtml')).toBe('PART II – CHAPTER I');
  });

  const names = (toc: TocItemLike[]) => {
    const flat = flattenTocWithDisambiguation(toc);
    return (href: string) => flat.find((e) => e.href === href)?.displayLabel;
  };

  // A flat contents page: a repeated name takes the Part before it to tell it apart, and so does a unique one numbered
  // like it. A Part's name used to reach the first unique entry after it as well — the next novel, the Acknowledgments,
  // Chapter 1 after a Prologue — which is where the wrong names in real books came from.
  it('names a flat Part’s numbered chapters after it, and nothing after the last Part', () => {
    const name = names([
      { label: 'Prologue', href: 'pro' },
      { label: 'Chapter 1', href: 'c1' },
      { label: 'PART I', href: 'p1' },
      { label: 'CHAPTER I', href: 'p1c1' },
      { label: 'CHAPTER II', href: 'p1c2' },
      { label: 'PART II', href: 'p2' },
      { label: 'CHAPTER I', href: 'p2c1' },
      { label: 'Acknowledgments', href: 'ack' },
    ]);
    expect(['c1', 'p1c1', 'p1c2', 'p2c1', 'ack'].map(name)).toEqual([
      'Chapter 1',
      'PART I – CHAPTER I',
      'PART I – CHAPTER II',
      'PART II – CHAPTER I',
      'Acknowledgments',
    ]);
  });

  // A first Part longer than the rest: its last chapter repeats nowhere, and read `CHAPTER VI` between
  // `PART I – CHAPTER V` and `PART II – CHAPTER I` in the contents, the book folder's note names and the tracks.
  it('names a longer Part’s unrepeated last chapters like the rest of it', () => {
    const name = names([
      { label: 'PART I', href: 'p1' },
      { label: 'CHAPTER V', href: 'p1c5' },
      { label: 'Chapter 6: An Interval', href: 'p1c6' },
      { label: 'PART II', href: 'p2' },
      { label: 'CHAPTER V', href: 'p2c5' },
      { label: 'EPILOGUE', href: 'epi' },
      { label: 'Chapter 7', href: 'after' },
    ]);
    expect(['p1c5', 'p1c6', 'p2c5', 'after'].map(name)).toEqual([
      'PART I – CHAPTER V',
      'PART I – Chapter 6: An Interval',
      'PART II – CHAPTER V',
      // The run ends at the next structure word, and nothing there carries the Epilogue's name.
      'Chapter 7',
    ]);
  });

  // The two conditions that keep it from being the run-wide prefix that was refused: an entry needs a word before its
  // number, and that word must match a chapter that already carries the Part's name.
  it('leaves a flat Part’s unique entries alone when they are not named like its named chapters', () => {
    const name = names([
      { label: 'PART I', href: 'p1' },
      { label: 'Summary', href: 'p1s' },
      { label: 'Getting Started', href: 'p1g' },
      { label: 'PART II', href: 'p2' },
      { label: 'Summary', href: 'p2s' },
      { label: 'CHAPTER I', href: 'p2c1' },
      { label: 'PART III', href: 'p3' },
      { label: 'CHAPTER I', href: 'p3c1' },
      { label: 'Appendix I', href: 'a1' },
      { label: '2', href: 'two' },
    ]);
    expect(['p1s', 'p1g', 'p2c1', 'p3c1', 'a1', 'two'].map(name)).toEqual([
      'PART I – Summary',
      'Getting Started',
      'PART II – CHAPTER I',
      'PART III – CHAPTER I',
      'Appendix I',
      '2',
    ]);
  });

  // Flat "Book" parts whose chapters the contents never lists, then appendices: nothing repeats, so nothing is named
  // after a Part. It used to read `Book Three – Appendix I`.
  it('leaves unique entries after a flat Part alone', () => {
    const name = names([
      { label: 'Book One', href: 'b1' },
      { label: 'Book Two', href: 'b2' },
      { label: 'Appendix I', href: 'a1' },
    ]);
    expect(name('a1')).toBe('Appendix I');
  });

  // A trilogy in one volume whose novels' titles sit beside their parts in the contents, each part holding the
  // chapters. The next novel used to be named after the last part of the one before: `Part III – Second Novel`.
  it('never names an entry after a Part that holds its own chapters, or after an entry inside another', () => {
    const part = (label: string, href: string) => ({
      label,
      href,
      subitems: [
        { label: '1', href: `${href}-1` },
        { label: '2', href: `${href}-2` },
      ],
    });
    const name = names([
      { label: 'First Novel', href: 'n1' },
      part('Part I', 'n1p1'),
      {
        ...part('Part II', 'n1p2'),
        subitems: [...part('Part II', 'n1p2').subitems, { label: 'Epilogue', href: 'n1e' }],
      },
      { label: 'Second Novel', href: 'n2' },
      part('Part I', 'n2p1'),
      { label: 'Acknowledgments', href: 'ack' },
    ]);
    expect(name('n2')).toBe('Second Novel');
    expect(name('ack')).toBe('Acknowledgments');
    // A part's own chapters still carry its name.
    expect(name('n1p1-1')).toBe('Part I – 1');
  });

  // A structure word lends its name to its own children whatever they are called — the nesting says so.
  it('names a Part’s nested children after it even when their names are unique', () => {
    const name = names([{ label: 'EPILOGUE', href: 'e', subitems: [{ label: 'I', href: 'e1' }] }]);
    expect(name('e1')).toBe('EPILOGUE – I');
  });

  // The user guide: a page whose title is also a section of an earlier page. The page was named after the last section
  // of the page before it — `Pronunciation – Library dashboards`, `Setting keyboard shortcuts – Troubleshooting`.
  it('keeps a top-level entry’s own name when its twin is nested under a parent', () => {
    const name = names([
      {
        label: 'Settings Reference',
        href: 'settings',
        subitems: [
          { label: 'Overview', href: 'settings#overview' },
          { label: 'Library dashboards', href: 'settings#library' },
        ],
      },
      {
        label: 'Look up',
        href: 'lookup',
        subitems: [
          { label: 'Overview', href: 'lookup#overview' },
          { label: 'Pronunciation', href: 'lookup#pronunciation' },
        ],
      },
      { label: 'Library dashboards', href: 'library', subitems: [{ label: 'Overview', href: 'library#overview' }] },
    ]);
    expect(name('library')).toBe('Library dashboards');
    expect(name('settings#library')).toBe('Settings Reference – Library dashboards');
    expect(name('library#overview')).toBe('Library dashboards – Overview');
  });

  it('falls back to the plain label when qualifiers would not actually disambiguate', () => {
    // Two duplicate front-matter titles with no unique landmark before either —
    // both would get the same (empty) qualifier, so neither is qualified.
    const toc: TocItemLike[] = [
      { label: 'Preface', href: 'a.xhtml' },
      { label: 'Preface', href: 'b.xhtml' },
    ];
    const flat = flattenTocWithDisambiguation(toc);
    expect(flat.map((e) => e.displayLabel)).toEqual(['Preface', 'Preface']);
  });

  it('preserves href and label alongside displayLabel', () => {
    const toc: TocItemLike[] = [{ label: 'Chapter One', href: 'ch1.xhtml' }];
    const flat = flattenTocWithDisambiguation(toc);
    expect(flat[0]).toEqual({ href: 'ch1.xhtml', label: 'Chapter One', displayLabel: 'Chapter One' });
  });

  it('returns an empty array for an empty TOC', () => {
    expect(flattenTocWithDisambiguation([])).toEqual([]);
  });
});

describe('chapterKey', () => {
  it('prefers chapterHref over chapter label', () => {
    expect(chapterKey({ chapterHref: 'ch1.xhtml', chapter: 'Chapter I' })).toBe('ch1.xhtml');
  });

  it('falls back to the label when chapterHref is missing (pre-chapterHref annotations)', () => {
    expect(chapterKey({ chapter: 'Chapter I' })).toBe('Chapter I');
  });

  it('falls back to empty string when both are missing', () => {
    expect(chapterKey({})).toBe('');
  });

  it('treats an empty-string chapterHref as missing', () => {
    expect(chapterKey({ chapterHref: '', chapter: 'Chapter I' })).toBe('Chapter I');
  });
});

/**
 * What the player's ⏮/⏭ move through.
 *
 * The book that forced this keeps 80 contents entries inside 7 files, so a step by FILE ran out
 * of book after four presses while the contents panel listed eighty. These entries share a file the same way.
 */
describe('tocNeighbourHref', () => {
  const flat = flattenTocWithDisambiguation([
    { label: 'Cover', href: 'cover.xhtml' },
    { label: 'Tenth Day', href: 'text.xhtml#day10' },
    { label: 'Eleventh Day', href: 'text.xhtml#day11' },
    { label: 'Twelfth Day', href: 'text.xhtml#day12' },
    { label: 'License', href: 'license.xhtml' },
  ]);

  it('steps between entries that share one file', () => {
    expect(tocNeighbourHref(flat, 'text.xhtml#day11', 1)).toBe('text.xhtml#day12');
    expect(tocNeighbourHref(flat, 'text.xhtml#day11', -1)).toBe('text.xhtml#day10');
  });

  it('crosses a file boundary in either direction', () => {
    expect(tocNeighbourHref(flat, 'cover.xhtml', 1)).toBe('text.xhtml#day10');
    expect(tocNeighbourHref(flat, 'text.xhtml#day12', 1)).toBe('license.xhtml');
  });

  it('stops at both ends rather than wrapping', () => {
    expect(tocNeighbourHref(flat, 'cover.xhtml', -1)).toBeNull();
    expect(tocNeighbourHref(flat, 'license.xhtml', 1)).toBeNull();
  });

  /**
   * A position often has no anchor of its own — the audio is mid-file, or the relocate reported the document
   * rather than the entry. Falling back to the first entry in the same FILE is the same two-step
   * `chapterDisplayLabel` uses to name that position, so the label and the buttons agree about where they are.
   */
  it('finds a bare file among anchored entries', () => {
    expect(tocNeighbourHref(flat, 'text.xhtml', 1)).toBe('text.xhtml#day11');
  });

  // A caller with no answer here moves a whole section instead, which is what a book with no usable contents needs.
  it('gives no answer for a position in no entry, or an empty contents', () => {
    expect(tocNeighbourHref(flat, 'nowhere.xhtml', 1)).toBeNull();
    expect(tocNeighbourHref([], 'cover.xhtml', 1)).toBeNull();
  });
});
