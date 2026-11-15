// Settings → Listening → Downloaded voices: which voices it lists, and the one it won't delete.
//
// The rule is "this device's live voice", decided by `resolveDeviceLiveVoice` — the function that picks the voice
// that actually speaks — so the lock can't protect one voice while another one reads.

import type { DataAdapter } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { downloadedVoices } from '../reader/tts/downloaded-voices';
import { orbisVoiceById } from '../reader/tts/voice-catalog';

const DIR = '.obsidian/plugins/orbis-reader/piper-cache';

/** A cache holding the models of these catalog voices. */
function cacheWith(...ids: string[]): DataAdapter {
  const files = new Set(ids.map((id) => `${DIR}/${orbisVoiceById(id)?.path.split('/').pop()}`));
  return { exists: async (p: string) => files.has(p) } as unknown as DataAdapter;
}

const listed = async (adapter: DataAdapter, pref: Parameters<typeof downloadedVoices>[2], system = true) =>
  (await downloadedVoices(adapter, DIR, pref, system)).map((d) => `${d.voice.id}${d.live ? ' (live)' : ''}`);

describe('Downloaded voices', () => {
  it('lists only the voices on this device', async () => {
    expect(await listed(cacheWith('en_US-joe-medium'), { deviceId: 'd', source: 'orbis', orbisVoiceId: 'x' })).toEqual([
      'en_US-joe-medium',
    ]);
  });

  it('locks the live voice and nothing else', async () => {
    const pref = { deviceId: 'd', source: 'orbis' as const, orbisVoiceId: 'en_US-ryan-medium' };
    expect(await listed(cacheWith('en_US-amy-medium', 'en_US-ryan-medium'), pref)).toEqual([
      'en_US-amy-medium',
      'en_US-ryan-medium (live)',
    ]);
  });

  // On a system voice, every Orbis voice can go.
  it('locks nothing when the live voice is a system voice', async () => {
    const pref = { deviceId: 'd', source: 'system' as const, systemVoiceURI: 'Samantha' };
    expect(await listed(cacheWith('en_US-amy-medium', 'en_US-ryan-medium'), pref)).toEqual([
      'en_US-amy-medium',
      'en_US-ryan-medium',
    ]);
  });

  // Android: a system preference can't be honored without system speech, so an Orbis voice speaks — and stays.
  it('locks the Orbis voice that speaks where a system voice cannot', async () => {
    const pref = {
      deviceId: 'd',
      source: 'system' as const,
      systemVoiceURI: 'Samantha',
      orbisVoiceId: 'en_US-joe-medium',
    };
    expect(await listed(cacheWith('en_US-joe-medium'), pref, false)).toEqual(['en_US-joe-medium (live)']);
  });

  it('locks the default voice on a device that never chose one', async () => {
    expect(await listed(cacheWith('en_US-amy-medium'), undefined)).toEqual(['en_US-amy-medium (live)']);
  });

  // One download, many speakers: speaker 12 being the live voice is the whole file being in use.
  it('locks a multi-speaker model whichever of its speakers is live', async () => {
    const pref = { deviceId: 'd', source: 'orbis' as const, orbisVoiceId: 'en_GB-vctk-medium', orbisSid: 11 };
    expect(await listed(cacheWith('en_GB-vctk-medium'), pref)).toEqual(['en_GB-vctk-medium (live)']);
  });
});
