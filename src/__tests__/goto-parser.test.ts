import { describe, expect, it } from 'vitest';
import { parseGoToInput } from '../goto-parser';

describe('parseGoToInput', () => {
  it('rejects empty input', () => {
    expect(parseGoToInput('', 500)).toEqual({ valid: false, error: 'empty' });
    expect(parseGoToInput('   ', 500)).toEqual({ valid: false, error: 'empty' });
  });

  it('passes an epubcfi straight through without validating against totalLocs', () => {
    const cfi = 'epubcfi(/6/4!/4/2)';
    expect(parseGoToInput(cfi, 10)).toEqual({ valid: true, target: cfi });
    expect(parseGoToInput(cfi, null)).toEqual({ valid: true, target: cfi });
  });

  it('accepts a valid percentage', () => {
    expect(parseGoToInput('34%', 500)).toEqual({ valid: true, target: '34%' });
    expect(parseGoToInput('0%', 500)).toEqual({ valid: true, target: '0%' });
    expect(parseGoToInput('100%', 500)).toEqual({ valid: true, target: '100%' });
  });

  it('accepts a percentage with internal whitespace before the % sign', () => {
    expect(parseGoToInput(' 34 %', 500)).toEqual({ valid: true, target: '34 %' });
  });

  it('rejects an out-of-range or non-numeric percentage', () => {
    expect(parseGoToInput('101%', 500)).toEqual({ valid: false, error: 'pct_out_of_range' });
    expect(parseGoToInput('-1%', 500)).toEqual({ valid: false, error: 'pct_out_of_range' });
    expect(parseGoToInput('abc%', 500)).toEqual({ valid: false, error: 'pct_out_of_range' });
  });

  it('percentage validation is independent of totalLocs', () => {
    expect(parseGoToInput('50%', null)).toEqual({ valid: true, target: '50%' });
  });

  it('accepts a valid location number within range', () => {
    expect(parseGoToInput('47', 500)).toEqual({ valid: true, target: '47' });
  });

  it('accepts any positive location number when totalLocs is unknown', () => {
    expect(parseGoToInput('99999', null)).toEqual({ valid: true, target: '99999' });
  });

  it('rejects a location number above totalLocs', () => {
    expect(parseGoToInput('501', 500)).toEqual({ valid: false, error: 'invalid_location' });
  });

  it('rejects zero, negative, or non-numeric locations', () => {
    expect(parseGoToInput('0', 500)).toEqual({ valid: false, error: 'invalid_location' });
    expect(parseGoToInput('-5', 500)).toEqual({ valid: false, error: 'invalid_location' });
    expect(parseGoToInput('abc', 500)).toEqual({ valid: false, error: 'invalid_location' });
  });

  it('accepts a location exactly at the totalLocs boundary', () => {
    expect(parseGoToInput('500', 500)).toEqual({ valid: true, target: '500' });
  });
});
