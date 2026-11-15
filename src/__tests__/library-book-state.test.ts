import { describe, expect, it } from 'vitest';
import { bookStateFor, bookStateKey, buildBookStates, readSidecar, sidecarFolderOf } from '../library/book-state';

describe('sidecarFolderOf / bookStateKey', () => {
  it('finds the sidecar folder beside the book', () => {
    expect(sidecarFolderOf('Books/Sample.epub')).toBe('Books/!orbis-data');
    expect(sidecarFolderOf('Sample.epub')).toBe('!orbis-data');
    expect(sidecarFolderOf('a/b/c/Sample.epub')).toBe('a/b/c/!orbis-data');
  });

  it('keys a book by folder and whole file name, so each format has a state of its own', () => {
    // Two formats sharing a key would report the same state, and `capabilitiesOf` — "the edition you have been
    // reading wins" — could never tell them apart. Each has its own sidecars, and its own state.
    expect(bookStateKey('Books/Sample.epub')).not.toBe(bookStateKey('Books/Sample.azw3'));
    expect(bookStateKey('Books/Sample.epub')).not.toBe(bookStateKey('Other/Sample.epub'));
  });
});

describe('readSidecar', () => {
  // Compared against `bookStateKey` rather than a literal, so these pin the RELATIONSHIP — a sidecar resolves to
  // its book — instead of the key's encoding, which is an implementation detail nothing outside the module sees.
  it('recognizes the three sidecar kinds, all pointing at the same book', () => {
    const book = bookStateKey('Books/Sample.epub');
    expect(readSidecar('Books/!orbis-data/Sample.epub.orbis')).toEqual({ key: book, kind: 'data' });
    expect(readSidecar('Books/!orbis-data/Sample.epub.location.abc123.json')).toEqual({ key: book, kind: 'location' });
    expect(readSidecar('Books/!orbis-data/audio/Sample.epub.audio/edition/ch1.mp3')).toEqual({
      key: book,
      kind: 'audio',
    });
    // A folder from before the `.audio` suffix, until the one-time rename has run, still belongs to its book.
    expect(readSidecar('Books/!orbis-data/audio/Sample.epub/edition/ch1.mp3')).toEqual({ key: book, kind: 'audio' });
  });

  it('handles a book at the vault root', () => {
    expect(readSidecar('!orbis-data/Sample.epub.orbis')?.key).toBe(bookStateKey('Sample.epub'));
  });

  // A greedy basename or the title loses everything after its first dot.
  it('keeps dots that are part of the book name', () => {
    expect(readSidecar('B/!orbis-data/My Book v1.2.epub.location.dev.json')?.key).toBe(
      bookStateKey('B/My Book v1.2.epub')
    );
    expect(readSidecar('B/!orbis-data/My Book v1.2.epub.orbis')?.key).toBe(bookStateKey('B/My Book v1.2.epub'));
  });

  it('ignores everything that is not a sidecar', () => {
    expect(readSidecar('Books/Sample.epub')).toBeNull();
    expect(readSidecar('Books/notes.md')).toBeNull();
    expect(readSidecar('Books/!orbis-data/!readme.md')).toBeNull();
    expect(readSidecar('Books/!orbis-data/Sample.epub.pages.json')).toBeNull();
    expect(readSidecar('Books/orbis-data/Sample.orbis')).toBeNull(); // no leading !
  });
});

describe('buildBookStates', () => {
  const entries = [
    { path: 'Books/Sample.epub', mtime: 1 },
    { path: 'Books/!orbis-data/Sample.epub.orbis', mtime: 100 },
    { path: 'Books/!orbis-data/Sample.epub.location.mac.json', mtime: 500 },
    { path: 'Books/!orbis-data/Sample.epub.location.phone.json', mtime: 900 },
    { path: 'Books/!orbis-data/audio/Sample.epub.audio/heart/ch1.mp3', mtime: 300 },
    { path: 'Books/Untouched.epub', mtime: 1 },
    { path: 'Books/!orbis-data/Started.epub.location.mac.json', mtime: 42 },
  ];

  it('reports what each book has', () => {
    const states = buildBookStates(entries);
    const sample = bookStateFor(states, 'Books/Sample.epub');
    expect(sample).toEqual({ started: true, lastOpened: 900, recorded: true, hasData: true });
  });

  // Read on two devices, so the newest wins — that is what "continue reading" means.
  it('takes the newest location file across devices', () => {
    expect(bookStateFor(buildBookStates(entries), 'Books/Sample.epub').lastOpened).toBe(900);
  });

  it('gives an empty state for a book with no sidecars, rather than undefined', () => {
    expect(bookStateFor(buildBookStates(entries), 'Books/Untouched.epub')).toEqual({
      started: false,
      lastOpened: 0,
      recorded: false,
      hasData: false,
    });
  });

  it('records a started book that has no .orbis yet', () => {
    const state = bookStateFor(buildBookStates(entries), 'Books/Started.epub');
    expect(state.started).toBe(true);
    expect(state.hasData).toBe(false);
  });
});
