// One-off speech never downloads a voice nobody asked for — see `speakOnce` and `askForOrbisVoice`.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const piper = vi.hoisted(() => ({
  isOrbisVoiceDownloaded: vi.fn(),
  previewOrbisVoice: vi.fn(),
}));
vi.mock('../reader/tts/PiperEngine', () => piper);
const previewSystemVoice = vi.hoisted(() => vi.fn(() => ({ stop: () => {} })));
vi.mock('../reader/tts/WebSpeechEngine', () => ({ previewSystemVoice }));

import type { DataAdapter } from 'obsidian';
import { type SpeakOnceDeps, speakOnce, VoiceNotHereError } from '../reader/tts/speak-once';
import { ORBIS_VOICES } from '../reader/tts/voice-catalog';

const ryan = ORBIS_VOICES.find((v) => v.name === 'Ryan');
const deps = (askForVoice?: SpeakOnceDeps['askForVoice']): SpeakOnceDeps => ({
  adapter: {} as DataAdapter,
  cacheDir: 'cache',
  rate: () => 1,
  voice: () => ({ source: 'orbis', path: ryan?.path ?? '', sid: 0 }),
  askForVoice,
});

beforeEach(() => {
  piper.isOrbisVoiceDownloaded.mockReset();
  piper.previewOrbisVoice.mockReset().mockResolvedValue({ stop: () => {} });
});

describe('speaking in an Orbis voice that is not on this device', () => {
  it('asks, and speaks once the voice has arrived', async () => {
    piper.isOrbisVoiceDownloaded.mockResolvedValue(false);
    const ask = vi.fn().mockResolvedValue(true);
    await speakOnce(deps(ask), 'lantern');
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ryan' }));
    expect(piper.previewOrbisVoice).toHaveBeenCalled();
  });

  it('speaks nothing — and so downloads nothing — when the reader declines', async () => {
    piper.isOrbisVoiceDownloaded.mockResolvedValue(false);
    await expect(
      speakOnce(
        deps(async () => false),
        'lantern'
      )
    ).rejects.toBeInstanceOf(VoiceNotHereError);
    expect(piper.previewOrbisVoice).not.toHaveBeenCalled();
  });

  it('speaks nothing when there is nobody to ask', async () => {
    piper.isOrbisVoiceDownloaded.mockResolvedValue(false);
    await expect(speakOnce(deps(), 'lantern')).rejects.toBeInstanceOf(VoiceNotHereError);
    expect(piper.previewOrbisVoice).not.toHaveBeenCalled();
  });

  // "Use a system voice", or Browse to another voice: the answer is a different voice, spoken in without a second ask.
  it('speaks in the voice chosen in answer, without asking again', async () => {
    piper.isOrbisVoiceDownloaded.mockResolvedValue(false);
    let chosen: SpeakOnceDeps['voice'] = () => ({ source: 'orbis', path: ryan?.path ?? '', sid: 0 });
    const ask = vi.fn(async () => {
      chosen = () => ({ source: 'system', uri: 'Samantha' });
      return true;
    });
    await speakOnce({ ...deps(ask), voice: () => chosen() }, 'lantern');
    expect(ask).toHaveBeenCalledOnce();
    expect(previewSystemVoice).toHaveBeenCalledWith('Samantha', 'lantern.', 1, undefined);
    expect(piper.previewOrbisVoice).not.toHaveBeenCalled();
  });

  it('does not ask about a voice already here', async () => {
    piper.isOrbisVoiceDownloaded.mockResolvedValue(true);
    const ask = vi.fn();
    await speakOnce(deps(ask), 'lantern');
    expect(ask).not.toHaveBeenCalled();
    expect(piper.previewOrbisVoice).toHaveBeenCalled();
  });
});
