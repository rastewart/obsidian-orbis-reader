import { describe, expect, it } from 'vitest';
import { segmentIndexAt, segmentIndexForCfi } from '../reader/tts/recorded-audio';

const segs = [{ start: 0 }, { start: 3.2 }, { start: 6.0 }, { start: 9.5 }];

describe('segmentIndexAt', () => {
  it('returns -1 for no segments', () => {
    expect(segmentIndexAt([], 5)).toBe(-1);
  });
  it('clamps to the first segment before the first start', () => {
    expect(segmentIndexAt(segs, -1)).toBe(0);
    expect(segmentIndexAt(segs, 0)).toBe(0);
  });
  it('picks the last segment whose start <= t', () => {
    expect(segmentIndexAt(segs, 3.1)).toBe(0);
    expect(segmentIndexAt(segs, 3.2)).toBe(1); // exact boundary belongs to that segment
    expect(segmentIndexAt(segs, 5.9)).toBe(1);
    expect(segmentIndexAt(segs, 6.0)).toBe(2);
    expect(segmentIndexAt(segs, 8)).toBe(2);
    expect(segmentIndexAt(segs, 9.5)).toBe(3);
  });
  it('clamps to the last segment after the last start', () => {
    expect(segmentIndexAt(segs, 1000)).toBe(3);
  });
});

// Range CFIs in reading order (same section, advancing element index): /4/2 → /4/4 → /4/6.
const cfiSegs = [
  { cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:5)' },
  { cfi: 'epubcfi(/6/4!/4/4,/1:0,/1:5)' },
  { cfi: 'epubcfi(/6/4!/4/6,/1:0,/1:5)' },
];

describe('segmentIndexForCfi', () => {
  it('returns -1 for no segments', () => {
    expect(segmentIndexForCfi([], 'epubcfi(/6/4!/4/4/1:0)')).toBe(-1);
  });
  it('picks the last segment at or before the target', () => {
    expect(segmentIndexForCfi(cfiSegs, 'epubcfi(/6/4!/4/4/1:2)')).toBe(1);
    expect(segmentIndexForCfi(cfiSegs, 'epubcfi(/6/4!/4/6/1:0)')).toBe(2);
  });
  it('clamps to the first segment when the target precedes them all', () => {
    expect(segmentIndexForCfi(cfiSegs, 'epubcfi(/6/4!/4/1/1:0)')).toBe(0);
  });
  it('returns the last segment when the target follows them all', () => {
    expect(segmentIndexForCfi(cfiSegs, 'epubcfi(/6/4!/4/8/1:0)')).toBe(2);
  });
});
