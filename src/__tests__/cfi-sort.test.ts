import { compare as cfiCompare } from 'foliate-js/epubcfi.js';
import { describe, expect, it } from 'vitest';
import { CFI_SORT_UNPLACEABLE, cfiSortKey } from '../reader/cfi-sort';

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
