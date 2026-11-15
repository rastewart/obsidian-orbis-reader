// A mix's live voice for a track, as THIS device can speak it.
//
// Mixes sync and voice files do not: a mix built on the Mac with Amy reaches a phone that only has Libritts. The engine
// fetches any model it is missing, which at the first play of a track would mean a pause before the sound and a
// 60 MB download nobody agreed to. So a voice this device lacks falls back to the device's own live voice, the way a
// recording's unrecorded track does, and says which voice it passed over.

import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { createMix, setActiveEdition, setMixLive } from '../reader/tts/recording-editions';
import { mixLiveVoiceOnDevice, type RecordingLibraryCtx } from '../reader/tts/recording-library';

const AUDIO = 'audio/book';
const CACHE = '.obsidian/plugins/orbis-reader/piper-cache';

/** An in-memory vault — files only, directories implied by the paths under them. */
function makeCtx(downloaded: string[] = []): RecordingLibraryCtx {
  const files = new Map<string, string>(downloaded.map((f) => [`${CACHE}/${f}`, 'model']));
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
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
    remove: async (p: string) => void files.delete(p),
  };
  const app = { vault: { adapter, configDir: '.obsidian' } } as unknown as App;
  return { app, recordedAudioDir: () => AUDIO } as unknown as RecordingLibraryCtx;
}

async function mixWith(ctx: RecordingLibraryCtx, live: Parameters<typeof setMixLive>[3]): Promise<void> {
  const mix = await createMix(ctx.app, AUDIO, 'Mix 1', 100);
  await setActiveEdition(ctx.app, AUDIO, mix.key); // creating a mix never selects it
  await setMixLive(ctx.app, AUDIO, mix.key, live, [3]);
}

describe('the voice a mix names for a track, on this device', () => {
  it('falls back to the live voice when the mix’s Orbis voice is not downloaded here, and names it', async () => {
    const ctx = makeCtx();
    await mixWith(ctx, { kind: 'orbis', voiceId: 'en_US-amy-medium' });
    const got = await mixLiveVoiceOnDevice(ctx, 3);
    expect(got.voice).toBeNull();
    expect(got.unavailable).toBe('Amy');
  });

  it('uses the mix’s voice when its model is already downloaded', async () => {
    const ctx = makeCtx(['en_US-amy-medium.onnx']);
    await mixWith(ctx, { kind: 'orbis', voiceId: 'en_US-amy-medium' });
    const got = await mixLiveVoiceOnDevice(ctx, 3);
    expect(got.voice).toMatchObject({ source: 'orbis', sid: 0 });
    expect(got.unavailable).toBeUndefined();
  });

  it('falls back from a system voice where there is no system speech (Android)', async () => {
    const ctx = makeCtx();
    await mixWith(ctx, { kind: 'system', voiceURI: 'com.apple.voice.Samantha' });
    const got = await mixLiveVoiceOnDevice(ctx, 3);
    expect(got.voice).toBeNull();
    // No system voices to look the name up in, so it is named by what the mix stored.
    expect(got.unavailable).toBe('com.apple.voice.Samantha');
  });

  it('passes nothing over for a track the mix leaves on the default, or does not assign', async () => {
    const ctx = makeCtx();
    await mixWith(ctx, { kind: 'default' });
    expect(await mixLiveVoiceOnDevice(ctx, 3)).toEqual({ voice: null });
    expect(await mixLiveVoiceOnDevice(ctx, 7)).toEqual({ voice: null });
  });
});
