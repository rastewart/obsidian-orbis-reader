import { describe, expect, it } from 'vitest';
import { planAudioFolderSuffix, planSidecarMigration } from '../sidecar-migration';

describe('planSidecarMigration', () => {
  it("moves a lone format's old sidecars to names built from its file name", () => {
    const plan = planSidecarMigration([
      'Books/sample.epub',
      'Books/!orbis-data/sample.orbis',
      'Books/!orbis-data/sample.pages.json',
      'Books/!orbis-data/sample.location.mac1.json',
      'Books/!orbis-data/sample.origin.json',
    ]);
    expect(plan).toEqual([
      { from: 'Books/!orbis-data/sample.orbis', to: 'Books/!orbis-data/sample.epub.orbis', folder: false },
      { from: 'Books/!orbis-data/sample.pages.json', to: 'Books/!orbis-data/sample.epub.pages.json', folder: false },
      {
        from: 'Books/!orbis-data/sample.location.mac1.json',
        to: 'Books/!orbis-data/sample.epub.location.mac1.json',
        folder: false,
      },
      { from: 'Books/!orbis-data/sample.origin.json', to: 'Books/!orbis-data/sample.epub.origin.json', folder: false },
    ]);
  });

  it('gives shared old sidecars to the EPUB when several formats sit together', () => {
    const plan = planSidecarMigration(['B/sample.azw3', 'B/sample.epub', 'B/sample.fb2', 'B/!orbis-data/sample.orbis']);
    expect(plan).toEqual([
      { from: 'B/!orbis-data/sample.orbis', to: 'B/!orbis-data/sample.epub.orbis', folder: false },
    ]);
  });

  it('gives them to the first format by name when there is no EPUB', () => {
    const plan = planSidecarMigration(['B/sample.mobi', 'B/sample.azw3', 'B/!orbis-data/sample.orbis']);
    expect(plan[0].to).toBe('B/!orbis-data/sample.azw3.orbis');
  });

  it("moves a book's recordings folder", () => {
    const plan = planSidecarMigration([
      'B/sample.epub',
      'B/!orbis-data/audio/sample/voice-1/01.mp3',
      'B/!orbis-data/audio/sample/voice-1/02.mp3',
    ]);
    expect(plan).toEqual([
      { from: 'B/!orbis-data/audio/sample', to: 'B/!orbis-data/audio/sample.epub.audio', folder: true },
    ]);
  });

  it('handles a book at the vault root, and keeps dots that are part of a name', () => {
    const plan = planSidecarMigration(['My Book v1.2.epub', '!orbis-data/My Book v1.2.orbis']);
    expect(plan).toEqual([
      { from: '!orbis-data/My Book v1.2.orbis', to: '!orbis-data/My Book v1.2.epub.orbis', folder: false },
    ]);
  });

  it('leaves new-style sidecars, orphans and anything already taken alone', () => {
    const plan = planSidecarMigration([
      'B/sample.epub',
      'B/!orbis-data/sample.epub.orbis', // already new-style
      'B/!orbis-data/sample.orbis', // old, but its new name is taken — not overwritten
      'B/!orbis-data/gone.orbis', // no book of that name any more
      'B/!orbis-data/!readme.md', // not a sidecar
    ]);
    expect(plan).toEqual([]);
  });
});

/**
 * A recordings folder named exactly like its book file is an EPUB to macOS — see `audioFolderName` — so each one
 * gets `.audio`, once.
 */
describe('planAudioFolderSuffix', () => {
  it('gives a recordings folder named like its book file the .audio suffix', () => {
    const plan = planAudioFolderSuffix([
      'B/sample.epub',
      'B/!orbis-data/audio/sample.epub/voice-1/ch0000.mp3',
      'B/!orbis-data/audio/sample.epub/voice-1/manifest.json',
      'B/!orbis-data/audio/sample.epub/editions.json',
    ]);
    expect(plan).toEqual([
      { from: 'B/!orbis-data/audio/sample.epub', to: 'B/!orbis-data/audio/sample.epub.audio', folder: true },
    ]);
  });

  it('works at the vault root, and for every book format', () => {
    const plan = planAudioFolderSuffix(['!orbis-data/audio/My Book v1.2.azw3/voice/ch0000.mp3']);
    expect(plan.map((r) => r.to)).toEqual(['!orbis-data/audio/My Book v1.2.azw3.audio']);
  });

  it('leaves folders already suffixed, folders not named like a book, and any whose new name is taken', () => {
    const plan = planAudioFolderSuffix([
      'B/!orbis-data/audio/done.epub.audio/voice/ch0000.mp3', // already moved
      'B/!orbis-data/audio/sample/voice/ch0000.mp3', // the older basename shape — the other plan's job
      'B/!orbis-data/audio/taken.epub/voice/ch0000.mp3',
      'B/!orbis-data/audio/taken.epub.audio/voice/ch0000.mp3', // never overwritten
    ]);
    expect(plan).toEqual([]);
  });
});
