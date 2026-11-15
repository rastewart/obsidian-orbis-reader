import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
  deleteChapterAudio,
  MANIFEST_VERSION,
  type RecordingManifest,
  readRecordingManifest,
} from '../reader/tts/recording';
import {
  clearActiveEdition,
  createMix,
  deleteEdition,
  editionDir,
  editionKey,
  listEditions,
  type MixManifest,
  pruneEmptyEditions,
  pruneMixPointers,
  readEditionManifest,
  readMix,
  setActiveEdition,
  setMixLive,
  setMixSource,
  upsertEdition,
} from '../reader/tts/recording-editions';

// Minimal in-memory vault adapter — files only; directories are implicit (a path exists if it's a
// stored file or a prefix of one). Covers just the methods the editions module uses.
function makeApp(): { app: App; files: Map<string, string> } {
  const files = new Map<string, string>();
  const adapter = {
    exists: async (p: string) => files.has(p) || [...files.keys()].some((k) => k.startsWith(`${p}/`)),
    read: async (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT ${p}`);
      return v;
    },
    write: async (p: string, data: string) => void files.set(p, data),
    mkdir: async () => {},
    rename: async (from: string, to: string) => {
      const v = files.get(from);
      if (v === undefined) throw new Error(`ENOENT ${from}`);
      files.set(to, v);
      files.delete(from);
    },
    remove: async (p: string) => void files.delete(p),
    rmdir: async (p: string) => {
      for (const k of [...files.keys()]) if (k === p || k.startsWith(`${p}/`)) files.delete(k);
    },
  };
  return { app: { vault: { adapter } } as unknown as App, files };
}

function editionManifest(engineVoice: string): RecordingManifest {
  return {
    version: MANIFEST_VERSION,
    book: 'parts-and-chapters',
    engine: { kind: 'openai-compatible', model: 'kokoro', voice: engineVoice, format: 'mp3' },
    createdAt: 1000,
    chapters: [
      { index: 0, audioFile: 'ch0000.mp3', duration: 12, segments: [{ cfi: '', start: 0, dur: 12, text: 'hi' }] },
      { index: 3, audioFile: 'ch0003.mp3', duration: 20, segments: [{ cfi: '', start: 0, dur: 20, text: 'yo' }] },
    ],
  };
}

const AUDIO = 'audio/parts-and-chapters';

describe('editionKey', () => {
  it('joins slugged engine/model/voice with __', () => {
    expect(editionKey('openai-compatible', 'kokoro', 'af_sky')).toBe('openai-compatible__kokoro__af_sky');
    expect(editionKey('piper-ondevice', 'en_US-amy-medium', '')).toBe('piper-ondevice__en_us-amy-medium');
  });

  it('is stable and sanitizes unsafe characters', () => {
    const k1 = editionKey('OpenAI', 'kokoro/v1', 'af sky!');
    expect(k1).toBe(editionKey('OpenAI', 'kokoro/v1', 'af sky!')); // deterministic
    expect(k1).toMatch(/^[a-z0-9._-]+(__[a-z0-9._-]+)*$/); // folder-safe
  });

  it('distinguishes different voices of the same model', () => {
    expect(editionKey('openai-compatible', 'kokoro', 'af_sky')).not.toBe(
      editionKey('openai-compatible', 'kokoro', 'am_michael')
    );
  });

  it('falls back to "default" when everything is empty', () => {
    expect(editionKey('', '', '')).toBe('default');
  });
});

describe('edition index CRUD', () => {
  it('upsert adds editions and is idempotent; active follows only the first (playback stays put)', async () => {
    const { app } = makeApp();
    // First-ever edition becomes active (a sensible default when nothing plays yet).
    await upsertEdition(app, AUDIO, { engine: 'openai-compatible', model: 'kokoro', voice: 'af_sky', createdAt: 1 });
    expect((await listEditions(app, AUDIO)).active).toBe(editionKey('openai-compatible', 'kokoro', 'af_sky'));

    // A second recording does NOT hijack playback — active stays on the first edition (recording
    // target and playback active are independent fields).
    await upsertEdition(app, AUDIO, { engine: 'piper-ondevice', model: 'en_US-amy-medium', voice: '', createdAt: 2 });
    let idx = await listEditions(app, AUDIO);
    expect(idx.editions).toHaveLength(2);
    expect(idx.active).toBe(editionKey('openai-compatible', 'kokoro', 'af_sky'));

    // Re-upserting the first edition refreshes it in place (no duplicate) and leaves active alone.
    await upsertEdition(app, AUDIO, { engine: 'openai-compatible', model: 'kokoro', voice: 'af_sky', createdAt: 9 });
    idx = await listEditions(app, AUDIO);
    expect(idx.editions).toHaveLength(2);
    expect(idx.active).toBe(editionKey('openai-compatible', 'kokoro', 'af_sky'));
  });

  it('setActiveEdition switches playback; ignores unknown keys', async () => {
    const { app } = makeApp();
    const a = await upsertEdition(app, AUDIO, { engine: 'e', model: 'm', voice: 'a', createdAt: 1 });
    const b = await upsertEdition(app, AUDIO, { engine: 'e', model: 'm', voice: 'b', createdAt: 2 });
    await setActiveEdition(app, AUDIO, a.key);
    expect((await listEditions(app, AUDIO)).active).toBe(a.key);
    await setActiveEdition(app, AUDIO, 'nope');
    expect((await listEditions(app, AUDIO)).active).toBe(a.key); // unchanged
    expect(b.key).not.toBe(a.key);
  });

  it('clearActiveEdition nulls active (the "None" option) but keeps the editions', async () => {
    const { app } = makeApp();
    const a = await upsertEdition(app, AUDIO, { engine: 'e', model: 'm', voice: 'a', createdAt: 1 });
    expect((await listEditions(app, AUDIO)).active).toBe(a.key);
    await clearActiveEdition(app, AUDIO);
    const idx = await listEditions(app, AUDIO);
    expect(idx.active).toBeNull(); // plays live even though a recording exists
    expect(idx.editions).toHaveLength(1); // recordings untouched
  });

  it('recording another voice leaves None selected', async () => {
    const { app } = makeApp();
    await upsertEdition(app, AUDIO, { engine: 'e', model: 'm', voice: 'a', createdAt: 1 });
    await clearActiveEdition(app, AUDIO);
    await upsertEdition(app, AUDIO, { engine: 'e', model: 'm', voice: 'b', createdAt: 2 });
    expect((await listEditions(app, AUDIO)).active).toBeNull();
  });

  it('deleteEdition removes the folder + entry, and deleting the selected one selects None', async () => {
    const { app, files } = makeApp();
    const a = await upsertEdition(app, AUDIO, { engine: 'e', model: 'm', voice: 'a', createdAt: 1 });
    const b = await upsertEdition(app, AUDIO, { engine: 'e', model: 'm', voice: 'b', createdAt: 2 });
    files.set(`${AUDIO}/${b.key}/ch0000.mp3`, 'X');
    await setActiveEdition(app, AUDIO, b.key);

    await deleteEdition(app, AUDIO, b.key);
    const idx = await listEditions(app, AUDIO);
    expect(idx.editions.map((e) => e.key)).toEqual([a.key]);
    expect(idx.active).toBeNull(); // not the remaining edition, which the reader never chose
    expect(files.has(`${AUDIO}/${b.key}/ch0000.mp3`)).toBe(false); // folder wiped
  });
});

describe('readEditionManifest', () => {
  it('reads the active edition by default and a named one on request', async () => {
    const { app, files } = makeApp();
    const e = await upsertEdition(app, AUDIO, {
      engine: 'openai-compatible',
      model: 'kokoro',
      voice: 'af_sky',
      createdAt: 1000,
    });
    const key = e.key;
    files.set(`${editionDir(AUDIO, key)}/manifest.json`, JSON.stringify(editionManifest('af_sky')));

    const active = await readEditionManifest(app, AUDIO);
    expect(active?.engine.voice).toBe('af_sky');
    const named = await readEditionManifest(app, AUDIO, key);
    expect(named?.chapters).toHaveLength(2);
  });

  it('returns null when there are no editions', async () => {
    const { app } = makeApp();
    expect(await readEditionManifest(app, AUDIO)).toBeNull();
  });
});

describe('mixes', () => {
  // Register a voice edition and give it a manifest recording the listed chapter indices.
  async function seedVoice(app: App, files: Map<string, string>, voice: string, indices: number[]): Promise<string> {
    const e = await upsertEdition(app, AUDIO, { engine: 'e', model: 'm', voice, createdAt: 1 });
    const manifest: RecordingManifest = {
      version: MANIFEST_VERSION,
      book: 'b',
      engine: { kind: 'e', model: 'm', voice, format: 'mp3' },
      createdAt: 1,
      chapters: indices.map((i) => ({ index: i, audioFile: `ch000${i}.mp3`, duration: 10, segments: [] })),
    };
    files.set(`${editionDir(AUDIO, e.key)}/manifest.json`, JSON.stringify(manifest));
    return e.key;
  }

  it('createMix makes a mix edition without hijacking playback', async () => {
    const { app, files } = makeApp();
    const amy = await seedVoice(app, files, 'amy', [0, 1]); // first edition → active
    const mix = await createMix(app, AUDIO, 'My Mix', 100);
    const idx = await listEditions(app, AUDIO);
    expect(mix.kind).toBe('mix');
    expect(mix.label).toBe('My Mix');
    expect(idx.active).toBe(amy); // creating a mix does not steal playback focus
    expect((await readMix(app, AUDIO, mix.key))?.chapters).toEqual([]);
  });

  // What the Listening test page found: with None selected, a new mix became the selection.
  it('createMix leaves None selected', async () => {
    const { app, files } = makeApp();
    await seedVoice(app, files, 'amy', [0, 1]);
    await clearActiveEdition(app, AUDIO);
    await createMix(app, AUDIO, 'Two voices', 100);
    expect((await listEditions(app, AUDIO)).active).toBeNull();
  });

  it('setMixSource points only at chapters the source actually has, and re-points on overlap', async () => {
    const { app, files } = makeApp();
    const amy = await seedVoice(app, files, 'amy', [0, 1, 2]);
    const sky = await seedVoice(app, files, 'sky', [2, 3]);
    const mix = await createMix(app, AUDIO, 'Mix', 100);

    await setMixSource(app, AUDIO, mix.key, amy, [0, 1, 2]);
    await setMixSource(app, AUDIO, mix.key, sky, [2, 3, 5]); // ch2 re-pointed to sky; ch5 dropped (sky lacks it)
    const m = (await readMix(app, AUDIO, mix.key)) as MixManifest;
    expect(m.chapters).toEqual([
      { index: 0, sourceKey: amy },
      { index: 1, sourceKey: amy },
      { index: 2, sourceKey: sky },
      { index: 3, sourceKey: sky },
    ]);
  });

  it('pruneMixPointers drops references whose source lost the chapter', async () => {
    const { app, files } = makeApp();
    const amy = await seedVoice(app, files, 'amy', [0, 1]);
    const mix = await createMix(app, AUDIO, 'Mix', 100);
    await setMixSource(app, AUDIO, mix.key, amy, [0, 1]);

    // Amy loses chapter 1 (deleted); the mix's pointer to it must be pruned.
    files.set(
      `${editionDir(AUDIO, amy)}/manifest.json`,
      JSON.stringify({
        version: MANIFEST_VERSION,
        book: 'b',
        engine: { kind: 'e', model: 'm', voice: 'amy', format: 'mp3' },
        createdAt: 1,
        chapters: [{ index: 0, audioFile: 'ch0000.mp3', duration: 10, segments: [] }],
      })
    );
    await pruneMixPointers(app, AUDIO, mix.key);
    expect((await readMix(app, AUDIO, mix.key))?.chapters).toEqual([{ index: 0, sourceKey: amy }]);
  });

  /**
   * A mix built when a chapter meant a spine FILE. A novel in parts has 45 files and 54 chapters, so those
   * pointers now name different chapters — keeping them would quietly re-voice the wrong ones. The mix itself
   * survives, name and all; only its assignments go, which leaves it exactly as an unassigned mix behaves.
   */
  it('drops the assignments of a mix written against the old chapter list, keeping the mix', async () => {
    const { app, files } = makeApp();
    const mix = await createMix(app, AUDIO, 'Built by file', 5);
    files.set(
      `${editionDir(AUDIO, mix.key)}/mix.json`,
      JSON.stringify({ version: 1, chapters: [{ index: 6, live: { kind: 'default' } }] })
    );
    expect((await readMix(app, AUDIO, mix.key))?.chapters).toEqual([]);
    expect((await listEditions(app, AUDIO)).editions.map((e) => e.label)).toContain('Built by file');
  });

  it('setMixLive assigns any chapter to a live voice and replaces existing pointers', async () => {
    const { app, files } = makeApp();
    const amy = await seedVoice(app, files, 'amy', [0, 1]);
    const mix = await createMix(app, AUDIO, 'Mix', 100);
    await setMixSource(app, AUDIO, mix.key, amy, [0, 1]);

    // A live voice needs no recorded coverage — assign ch1 (over amy) and ch5 (amy lacks it).
    await setMixLive(app, AUDIO, mix.key, { kind: 'orbis', voiceId: 'en_US-amy-low#0' }, [1, 5]);
    const m = (await readMix(app, AUDIO, mix.key)) as MixManifest;
    expect(m.chapters).toEqual([
      { index: 0, sourceKey: amy },
      { index: 1, live: { kind: 'orbis', voiceId: 'en_US-amy-low#0' } },
      { index: 5, live: { kind: 'orbis', voiceId: 'en_US-amy-low#0' } },
    ]);
  });

  it('pruneMixPointers keeps live pointers (they have no file dependency)', async () => {
    const { app, files } = makeApp();
    const amy = await seedVoice(app, files, 'amy', [0]);
    const mix = await createMix(app, AUDIO, 'Mix', 100);
    await setMixSource(app, AUDIO, mix.key, amy, [0]);
    await setMixLive(app, AUDIO, mix.key, { kind: 'default' }, [3]);

    // Amy loses everything; the recorded pointer prunes, the live one survives.
    files.set(
      `${editionDir(AUDIO, amy)}/manifest.json`,
      JSON.stringify({
        version: MANIFEST_VERSION,
        book: 'b',
        engine: { kind: 'e', model: 'm', voice: 'amy', format: 'mp3' },
        createdAt: 1,
        chapters: [],
      })
    );
    await pruneMixPointers(app, AUDIO, mix.key);
    expect((await readMix(app, AUDIO, mix.key))?.chapters).toEqual([{ index: 3, live: { kind: 'default' } }]);
  });
});

/**
 * `editions.json`, `mix.json` and `manifest.json` sit in the vault beside the book, so a shared or synced vault can
 * hand over ones someone else wrote. Their keys and file names become paths that are read, deleted and recursively
 * removed — and on desktop a `..` segment really does leave the folder, and the vault.
 */
describe('names read from disk stay inside the audio folder', () => {
  const ESCAPE = '../../decoy';

  /** The app, plus every path it was asked to delete. */
  function watchedApp(): { app: App; files: Map<string, string>; deleted: string[] } {
    const { app, files } = makeApp();
    const deleted: string[] = [];
    const adapter = app.vault.adapter as unknown as Record<string, (p: string) => Promise<void>>;
    for (const name of ['rmdir', 'remove']) {
      const real = adapter[name];
      adapter[name] = async (p: string) => {
        deleted.push(p);
        await real(p);
      };
    }
    return { app, files, deleted };
  }

  const inside = (p: string): boolean => p.startsWith(`${AUDIO}/`) && !p.split('/').includes('..');

  function writeIndex(files: Map<string, string>, keys: string[], active: string | null = null): void {
    const editions = keys.map((key) => ({ key, engine: 'e', model: 'm', voice: 'v', createdAt: 1 }));
    files.set(`${AUDIO}/editions.json`, JSON.stringify({ version: 1, active, editions }));
  }

  it('drops an edition whose key would leave the folder, and never removes it', async () => {
    const { app, files, deleted } = watchedApp();
    writeIndex(files, [ESCAPE, 'e__m__v'], ESCAPE);

    const idx = await listEditions(app, AUDIO);
    expect(idx.editions.map((e) => e.key)).toEqual(['e__m__v']);
    expect(idx.active).toBeNull();

    // An empty edition is pruned — a recursive delete — when the Voice and source dialog opens.
    await pruneEmptyEditions(app, AUDIO);
    await deleteEdition(app, AUDIO, ESCAPE).catch(() => undefined);
    expect(deleted.filter((p) => !inside(p))).toEqual([]);
  });

  it('refuses to make a folder path from a key that is not one plain name', () => {
    for (const key of ['..', '.', '../x', 'a/b', 'a\\b', '.hidden', '', 'C:']) {
      expect(() => editionDir(AUDIO, key)).toThrow();
    }
    expect(editionDir(AUDIO, 'openai-compatible__kokoro__af_heart')).toBe(
      `${AUDIO}/openai-compatible__kokoro__af_heart`
    );
    expect(editionDir(AUDIO, 'mix__1761786098111')).toBe(`${AUDIO}/mix__1761786098111`);
  });

  it('drops a mix pointer whose source would leave the folder', async () => {
    const { app, files } = makeApp();
    writeIndex(files, ['mix__1']);
    files.set(
      `${AUDIO}/mix__1/mix.json`,
      JSON.stringify({
        version: 2,
        chapters: [
          { index: 0, sourceKey: ESCAPE },
          { index: 1, sourceKey: 'e__m__v' },
        ],
      })
    );
    expect((await readMix(app, AUDIO, 'mix__1'))?.chapters).toEqual([{ index: 1, sourceKey: 'e__m__v' }]);
  });

  it('drops a recorded chapter whose file name is not one of ours, so deleting it removes nothing outside', async () => {
    const { app, files, deleted } = watchedApp();
    const dir = `${AUDIO}/e__m__v`;
    const manifest = editionManifest('v');
    manifest.chapters[0].audioFile = '../../../secret.md';
    files.set(`${dir}/manifest.json`, JSON.stringify(manifest));
    files.set(`${dir}/ch0003.mp3`, 'X');

    expect((await readRecordingManifest(app, `${dir}/manifest.json`))?.chapters.map((c) => c.audioFile)).toEqual([
      'ch0003.mp3',
    ]);
    await deleteChapterAudio(app, dir, 0);
    await deleteChapterAudio(app, dir, 3);
    expect(deleted.filter((p) => !inside(p))).toEqual([]);
    expect(deleted).toContain(`${dir}/ch0003.mp3`);
  });
});
