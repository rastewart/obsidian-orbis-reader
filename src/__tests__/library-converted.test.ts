import { describe, expect, it } from 'vitest';
import { displayName } from '../library/record';

// The converter's own reading of a source note, and the library's reading of any note, meet here: a vault that
// keeps a note per author writes links where a name is expected, and a book whose author is a pair of brackets
// cannot be found by author anywhere.
describe('displayName', () => {
  it('takes the alias when a link has one', () => {
    expect(displayName('[[people/John Roe|Johnny]]')).toBe('Johnny');
  });

  // The basename, not the path: `linkTarget` answers which FILE this points at, which would file a book under a
  // folder when the value is a person.
  it('takes the basename when it does not', () => {
    expect(displayName('[[people/John Roe]]')).toBe('John Roe');
    expect(displayName('[[Jane Doe]]')).toBe('Jane Doe');
  });

  it('leaves plain text alone, trimmed', () => {
    expect(displayName('  Roe, John ')).toBe('Roe, John');
    expect(displayName('')).toBe('');
  });

  // An embed of a person's note is still that person.
  it('reads an embed the same way', () => {
    expect(displayName('![[people/John Roe]]')).toBe('John Roe');
  });

  // A heading reference names a section of the note, not a different person.
  it('drops a heading reference', () => {
    expect(displayName('[[people/John Roe#Bio]]')).toBe('John Roe');
  });
});
