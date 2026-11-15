// The count beside a value on the Fields page and in a collection's value list.

import { describe, expect, it } from 'vitest';
import { valueUsedText } from '../library/value-count';

describe('valueUsedText', () => {
  // Was "In 1 titles", and "titles" for a reading record's field too.
  it('has a singular, and names what was counted', () => {
    expect(valueUsedText(1, 'title')).toBe('In 1 title');
    expect(valueUsedText(2, 'title')).toBe('In 2 titles');
    expect(valueUsedText(1, 'reading_record')).toBe('In 1 reading record');
    expect(valueUsedText(3, 'reading_record')).toBe('In 3 reading records');
    expect(valueUsedText(1, null)).toBe('In 1 note');
    expect(valueUsedText(1847, null)).toBe('In 1,847 notes');
  });
});
