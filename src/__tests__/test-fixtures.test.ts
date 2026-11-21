// Where the test-fixtures command may write. See src/test-fixtures.ts.
//
// The zip is the repository's own release file, but its entry names are strings the command turns into vault paths:
// these are the names that must never leave `fixtures/`.

import { describe, expect, it } from 'vitest';
import { fixturePath, sameBytes, testFixturesUrl } from '../test-fixtures';

describe('fixturePath', () => {
  it('puts a fixture under fixtures/, keeping its folders and its name', () => {
    expect(fixturePath('annotation-workhorse.epub')).toBe('fixtures/annotation-workhorse.epub');
    expect(fixturePath('library/Volumes.md')).toBe('fixtures/library/Volumes.md');
    expect(fixturePath('notes-to-epub/Field Guide/001-README.md')).toBe(
      'fixtures/notes-to-epub/Field Guide/001-README.md'
    );
  });

  it('skips a folder entry', () => {
    expect(fixturePath('library/')).toBeNull();
  });

  it('refuses a path that would leave fixtures/', () => {
    for (const name of ['../escape.md', 'library/../../escape.md', '/etc/passwd', 'C:/escape.md', 'a\\..\\b.md']) {
      expect(fixturePath(name)).toBeNull();
    }
  });

  it('refuses a hidden folder or file, the vault configuration folder included', () => {
    for (const name of ['.obsidian/plugins/x/main.js', 'library/.hidden.md', './a.md']) {
      expect(fixturePath(name)).toBeNull();
    }
  });

  it('refuses an empty name, an empty folder name and a NUL', () => {
    for (const name of ['', 'library//a.md', 'a\0.md']) expect(fixturePath(name)).toBeNull();
  });
});

describe('sameBytes', () => {
  it('compares contents, not identity', () => {
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(sameBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('testFixturesUrl', () => {
  it("names the zip with the pinned digest's first twelve hex digits, in the test-fixtures release", () => {
    expect(testFixturesUrl('0123456789abcdef'.repeat(4))).toBe(
      'https://github.com/rastewart/obsidian-orbis-reader/releases/download/test-fixtures/orbis-test-fixtures-0123456789ab.zip'
    );
  });
});
