import { describe, expect, it } from 'vitest';
import { bookPathForOrbisFile, sidecarStem, sidecarSuffix } from '../sidecar-names';

describe('sidecarStem', () => {
  it('is the whole file name, extension included', () => {
    expect(sidecarStem('Books/sample.epub')).toBe('sample.epub');
    expect(sidecarStem('sample.azw3')).toBe('sample.azw3');
    expect(sidecarStem('a/b/My Book v1.2.epub')).toBe('My Book v1.2.epub');
  });
});

describe('sidecarSuffix', () => {
  const stem = 'sample.epub';

  it("recognizes each of a book's sidecar files", () => {
    expect(sidecarSuffix(stem, 'sample.epub.orbis')).toBe('.orbis');
    expect(sidecarSuffix(stem, 'sample.epub.pages.json')).toBe('.pages.json');
    expect(sidecarSuffix(stem, 'sample.epub.origin.json')).toBe('.origin.json');
    expect(sidecarSuffix(stem, 'sample.epub.location.abc123.json')).toBe('.location.abc123.json');
    // A device file for marks travels with its book like a location file, or a renamed book would lose its marks.
    expect(sidecarSuffix(stem, 'sample.epub.marks.abc123.json')).toBe('.marks.abc123.json');
  });

  it("does not take another format's sidecars", () => {
    expect(sidecarSuffix(stem, 'sample.azw3.orbis')).toBeNull();
    expect(sidecarSuffix(stem, 'sample.azw3.location.abc123.json')).toBeNull();
  });

  it('does not take a different book whose name starts the same way', () => {
    // The delete handler used a `basename + '.'` prefix, so deleting `My.epub` also removed `My.Book.orbis`.
    expect(sidecarSuffix('My.epub', 'My.epub.Book.orbis')).toBeNull();
    expect(sidecarSuffix('sample.epub', 'sample.epub2.orbis')).toBeNull();
  });

  it('ignores files in !orbis-data that are not sidecars', () => {
    expect(sidecarSuffix(stem, '!readme.md')).toBeNull();
    expect(sidecarSuffix(stem, 'sample.epub.orbis.bak')).toBeNull();
  });
});

// The `.orbis` view looked for `sample.epub.epub` from 2026-09-27, when the stem took the extension, until this was
// found running the Sync test page: its Reading activity table had been missing ever since.
describe('bookPathForOrbisFile', () => {
  it("is the book beside the data folder, named by the .orbis file's own stem", () => {
    expect(bookPathForOrbisFile('fixtures/!orbis-data/sample.epub.orbis')).toBe('fixtures/sample.epub');
    expect(bookPathForOrbisFile('a/b/!orbis-data/My Book v1.2.azw3.orbis')).toBe('a/b/My Book v1.2.azw3');
  });

  it('finds a book at the vault root', () => {
    expect(bookPathForOrbisFile('!orbis-data/sample.epub.orbis')).toBe('sample.epub');
  });

  it('is the inverse of sidecarStem', () => {
    const book = 'Books/Fiction/sample.mobi';
    expect(bookPathForOrbisFile(`Books/Fiction/!orbis-data/${sidecarStem(book)}.orbis`)).toBe(book);
  });

  it('answers nothing for a file that is not an .orbis file', () => {
    expect(bookPathForOrbisFile('fixtures/!orbis-data/sample.epub.pages.json')).toBeNull();
  });
});
