// What "Recorded: N of M tracks" in Voice and source counts, against what the recordings list counts.
//
// The line used to divide by the book's FILES, so a long chapter cut into three tracks, or a cover page, made it
// disagree with the list beside it; and a mix, which has no manifest, always read as nothing recorded.

import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { MANIFEST_VERSION } from '../reader/tts/recording';
import { type RecordingLibraryCtx, recordingEditions, recordingLibrary } from '../reader/tts/recording-library';

const DIR = 'fixtures/!orbis-data/audio/long-chapter.epub.audio';

/** A vault holding one book's audio folder: a two-track recording and a mix of it and a live voice. */
function vaultWith(): App {
  const files: Record<string, string> = {
    [`${DIR}/editions.json`]: JSON.stringify({
      version: 1,
      active: 'amy',
      editions: [
        { key: 'amy', kind: 'voice', engine: 'piper-ondevice', voice: 'en_US-amy-medium', createdAt: 1 },
        { key: 'mix__1', kind: 'mix', engine: 'mix', voice: 'mix', label: 'Two voices', createdAt: 2 },
      ],
    }),
    [`${DIR}/amy/manifest.json`]: JSON.stringify({
      version: MANIFEST_VERSION,
      book: 'long-chapter.epub',
      engine: { kind: 'piper-ondevice', model: 'piper', voice: 'en_US-amy-medium', format: 'mp3' },
      createdAt: 1,
      chapters: [
        { index: 1, audioFile: 'ch0001.mp3', complete: true, segments: [{}] },
        { index: 5, audioFile: 'ch0005.mp3', complete: true, segments: [{}] },
      ],
    }),
    [`${DIR}/mix__1/mix.json`]: JSON.stringify({
      version: 2,
      chapters: [
        { index: 1, sourceKey: 'amy' },
        { index: 2, live: { kind: 'orbis', voiceId: 'en_US-joe-medium' } },
      ],
    }),
  };
  return {
    vault: {
      adapter: {
        exists: async (path: string) => path in files || Object.keys(files).some((f) => f.startsWith(`${path}/`)),
        read: async (path: string) => files[path],
        write: async (path: string, data: string) => {
          files[path] = data;
        },
        mkdir: async () => {},
        rmdir: async () => {},
      },
    },
  } as unknown as App;
}

/**
 * *Long Chapter*'s shape: a cover file with no text, then three files of text, the middle one long enough to be three
 * tracks — four files, six parts, five that can be recorded.
 */
function ctx(): RecordingLibraryCtx {
  return {
    app: vaultWith(),
    recordedAudioDir: () => DIR,
    chapterParts: () => [],
    chapterWords: () => [0, 466, 4077, 4077, 4077, 493],
    chapterWordsReady: () => true,
    ttsRate: () => 1,
    bookSections: [{ id: 'cover' }, { id: 'one' }, { id: 'two' }, { id: 'three' }],
    reloadPlayback: async () => {},
    activeRunKey: () => null,
  };
}

describe('the coverage line in Voice and source', () => {
  it('divides by the tracks that can be recorded, not by the files', async () => {
    expect((await recordingEditions(ctx())).totalChapters).toBe(5);
  });

  it('says the same total as the recordings list', async () => {
    const c = ctx();
    const [listed] = await recordingLibrary(c);
    expect((await recordingEditions(c)).totalChapters).toBe(listed.total);
  });

  it('counts a mix by the tracks it plays from a recording, not the ones pinned to a live voice', async () => {
    const { editions } = await recordingEditions(ctx());
    expect(editions.find((e) => e.key === 'amy')?.recorded).toBe(2);
    expect(editions.find((e) => e.key === 'mix__1')?.recorded).toBe(1);
  });
});

// Renaming a recording replaced its voice everywhere it was shown; the list row says it again.
describe('a recording’s voice in the recordings list', () => {
  it('is given for a named recording, and not for one named by its voice', async () => {
    const c = ctx();
    const listed = async () => (await recordingLibrary(c)).find((i) => i.key === 'amy')?.voice;
    expect(await listed()).toBeUndefined();
    const index = JSON.parse(await c.app.vault.adapter.read(`${DIR}/editions.json`)) as {
      editions: { key: string; label?: string }[];
    };
    for (const e of index.editions) if (e.key === 'amy') e.label = 'Night reads';
    await c.app.vault.adapter.write(`${DIR}/editions.json`, JSON.stringify(index));
    expect(await listed()).toBe('Amy');
  });
});
