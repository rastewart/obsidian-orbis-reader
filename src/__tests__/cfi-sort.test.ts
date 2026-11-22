import { compare as cfiCompare } from 'foliate-js/epubcfi.js';
import { describe, expect, it } from 'vitest';
import { CFI_SORT_UNPLACEABLE, cfiSortKey, inReadingOrder, markCfi } from '../reader/cfi-sort';

/** Ordered as they appear in the book: two spine documents, deepening steps, then offsets in one text node. */
const IN_READING_ORDER = [
  'epubcfi(/6/4!/4/2/1:0)',
  'epubcfi(/6/4!/4/2/1:40)',
  'epubcfi(/6/4!/4/4/1:0)',
  'epubcfi(/6/4!/4/10/1:0)',
  'epubcfi(/6/4!/4/48/1:0)',
  'epubcfi(/6/4!/4/48/1:92)',
  'epubcfi(/6/6!/4/2/1:0)',
  'epubcfi(/6/6!/4/120/1:5)',
];

const shuffled = [...IN_READING_ORDER].reverse();

describe('cfiSortKey', () => {
  it('sorts CFIs into reading order', () => {
    expect([...shuffled].sort((a, b) => cfiSortKey(a).localeCompare(cfiSortKey(b)))).toEqual(IN_READING_ORDER);
  });

  it('agrees with foliate compare() on every pair', () => {
    for (const a of IN_READING_ORDER) {
      for (const b of IN_READING_ORDER) {
        const byKey = Math.sign(cfiSortKey(a).localeCompare(cfiSortKey(b)));
        expect(byKey, `${a} vs ${b}`).toBe(Math.sign(cfiCompare(a, b)));
      }
    }
  });

  it('orders multi-digit steps numerically, which a raw CFI string does not', () => {
    // The bug this exists to prevent: "/4/10" precedes "/4/2" as text.
    const two = 'epubcfi(/6/4!/4/2/1:0)';
    const ten = 'epubcfi(/6/4!/4/10/1:0)';
    expect(two.localeCompare(ten)).toBeGreaterThan(0);
    expect(cfiSortKey(two).localeCompare(cfiSortKey(ten))).toBeLessThan(0);
  });

  it('places a range CFI by where it starts', () => {
    const range = 'epubcfi(/6/4!/4/48,/1:0,/1:92)';
    expect(cfiSortKey(range)).toBe(cfiSortKey('epubcfi(/6/4!/4/48/1:0)'));
  });

  it('sorts a shallower CFI before a deeper one that extends it', () => {
    const shallow = cfiSortKey('epubcfi(/6/4!/4)');
    const deep = cfiSortKey('epubcfi(/6/4!/4/2/1:0)');
    expect(shallow.localeCompare(deep)).toBeLessThan(0);
  });

  it('sorts an unparseable CFI last rather than first', () => {
    expect(cfiSortKey('not a cfi')).toBe(CFI_SORT_UNPLACEABLE);
    expect(cfiSortKey('')).toBe(CFI_SORT_UNPLACEABLE);
    expect(CFI_SORT_UNPLACEABLE.localeCompare(cfiSortKey('epubcfi(/6/900!/4/2/1:0)'))).toBeGreaterThan(0);
  });

  it('uses a digit sentinel, because locale collation sorts punctuation before digits', () => {
    // The trap: '~' reads as "sorts last" and does the opposite under localeCompare.
    expect('~'.localeCompare('0')).toBeLessThan(0);
    expect(CFI_SORT_UNPLACEABLE).toMatch(/^\d+$/);
  });
});

describe('inReadingOrder', () => {
  const at = (cfi: string, createdAt: number, loc?: number) => ({ cfi, createdAt, loc });
  const ids = (items: { cfi: string; createdAt: number }[]) => items.map((i) => `${i.cfi}@${i.createdAt}`);

  it('orders by position in the book, not by location or when each was made', () => {
    // One location, marked out of order. Sorting by loc then createdAt would have kept this order.
    const items = [
      at('epubcfi(/6/4!/4/4/1:0)', 1, 5),
      at('epubcfi(/6/4!/4/8/1:0)', 2, 5),
      at('epubcfi(/6/4!/4/6/1:0)', 3, 5),
    ];
    expect(ids(inReadingOrder(items, (i) => i.cfi))).toEqual([
      'epubcfi(/6/4!/4/4/1:0)@1',
      'epubcfi(/6/4!/4/6/1:0)@3',
      'epubcfi(/6/4!/4/8/1:0)@2',
    ]);
  });

  it('breaks a tie at one position by when each was made', () => {
    const items = [at('epubcfi(/6/4!/4/4/1:0)', 9), at('epubcfi(/6/4!/4/4/1:0)', 2)];
    expect(inReadingOrder(items, (i) => i.cfi).map((i) => i.createdAt)).toEqual([2, 9]);
  });

  it('puts marks whose position cannot be read last, by location and then when each was made', () => {
    const items = [at('', 3, 7), at('epubcfi(/6/900!/4/2/1:0)', 9, 900), at('', 1), at('', 2, 7), at('', 4, 2)];
    expect(inReadingOrder(items, (i) => i.cfi).map((i) => i.createdAt)).toEqual([9, 4, 2, 3, 1]);
  });

  it('does not change the list it is given', () => {
    const items = [at('epubcfi(/6/6!/4/2/1:0)', 1), at('epubcfi(/6/4!/4/2/1:0)', 2)];
    inReadingOrder(items, (i) => i.cfi);
    expect(items[0].createdAt).toBe(1);
  });
});

describe('markCfi', () => {
  it('reads a passage selection or note by its range, and a bookmark by its exact place', () => {
    expect(markCfi({ cfiRange: 'epubcfi(/6/4!/4,/1:0,/1:9)' })).toBe('epubcfi(/6/4!/4,/1:0,/1:9)');
    expect(markCfi({ cfi: 'epubcfi(/6/4!/2)', exactCfi: 'epubcfi(/6/4!/4/2/1:0)' })).toBe('epubcfi(/6/4!/4/2/1:0)');
    expect(markCfi({ cfi: 'epubcfi(/6/4!/2)' })).toBe('epubcfi(/6/4!/2)');
  });
});
