import { describe, expect, it } from 'vitest';
import { recordBookName, recordStem } from '../reader/record-book-name';

describe('recordBookName', () => {
  it('uses the filename when it is unambiguous', () => {
    const all = ['Library/Fiction/sample.epub', 'Library/another.epub'];
    expect(recordBookName('Library/Fiction/sample.epub', all)).toBe('sample');
  });

  it('qualifies BOTH books when two share a filename, so neither depends on export order', () => {
    const all = ['Library/Fiction/sample.epub', 'Inbox/sample.epub'];
    expect(recordBookName('Library/Fiction/sample.epub', all)).toBe('Fiction — sample');
    expect(recordBookName('Inbox/sample.epub', all)).toBe('Inbox — sample');
  });

  it('adds only as many parent folders as it takes', () => {
    const all = ['a/shelf/sample.epub', 'b/shelf/sample.epub'];
    // One parent is not enough — both are "shelf" — so it reaches for the second.
    expect(recordBookName('a/shelf/sample.epub', all)).toBe('a — shelf — sample');
    expect(recordBookName('b/shelf/sample.epub', all)).toBe('b — shelf — sample');
  });

  it('separates a root-level book from a nested one of the same name', () => {
    const all = ['sample.epub', 'Library/sample.epub'];
    // The root book has no parent to borrow, so it keeps the bare name and the nested one qualifies.
    expect(recordBookName('sample.epub', all)).toBe('sample');
    expect(recordBookName('Library/sample.epub', all)).toBe('Library — sample');
  });

  it('separates a book whose whole path is a suffix of another’s', () => {
    const all = ['shelf/sample.epub', 'Library/shelf/sample.epub'];
    expect(recordBookName('shelf/sample.epub', all)).toBe('shelf — sample');
    expect(recordBookName('Library/shelf/sample.epub', all)).toBe('Library — shelf — sample');
  });

  it('gives every book in a vault a distinct name', () => {
    const all = [
      'sample.epub',
      'shelf/sample.epub',
      'Library/shelf/sample.epub',
      'Inbox/sample.epub',
      'Library/another.epub',
    ];
    const names = all.map((p) => recordBookName(p, all));
    expect(new Set(names).size).toBe(all.length);
  });

  it('drops the extension for a book in one format', () => {
    expect(recordBookName('Library/sample.azw3', ['Library/sample.azw3'])).toBe('sample');
  });

  it('adds the format when two formats of one book sit together, and only then', () => {
    // Each format keeps its own records, since each has its own annotations at positions only it understands — one
    // shared folder let either format's export flag the other's records as orphaned. See `recordStem`.
    const both = ['Library/sample.epub', 'Library/sample.azw3'];
    expect(recordBookName(both[0], both)).toBe('sample (EPUB)');
    expect(recordBookName(both[1], both)).toBe('sample (AZW3)');
    expect(recordStem(both[0], both)).toBe('sample (EPUB)');
  });

  it('adds folders and format independently', () => {
    // Folders tell same-named books in different places apart; the format tells formats in one place apart.
    const all = ['Fiction/sample.epub', 'Fiction/sample.azw3', 'Inbox/sample.epub'];
    const names = all.map((p) => recordBookName(p, all));
    expect(names).toEqual(['sample (EPUB)', 'sample (AZW3)', 'sample']);
    expect(new Set(names).size).toBe(3);
  });

  it('strips characters a path cannot hold, per segment', () => {
    // Needs a collision to force a parent folder into the name — that is the case where per-segment
    // sanitizing matters, since sanitizing the JOINED string would eat the separator too.
    const all = ['My: Books/what?.epub', 'Inbox/what?.epub'];
    const name = recordBookName('My: Books/what?.epub', all);
    expect(name).not.toMatch(/[:?]/);
    expect(name).toContain(' — ');
  });
});
