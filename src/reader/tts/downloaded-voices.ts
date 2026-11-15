// Which Orbis voices are on this device, and which one of them can't be deleted — for Settings → Listening →
// *Downloaded voices*, the only place a voice is deleted.
//
// **Deleting moved out of the voice pickers** because there it acted on the selected voice, and selecting a voice
// makes it the live voice: the one voice the trash could reach was the one in use, and deleting any other meant
// choosing it first. Deleting your live voice left the device with nothing to read in.

import type { DataAdapter } from 'obsidian';
import type { VoicePref } from '../../settings';
import { isOrbisVoiceDownloaded } from './PiperEngine';
import { resolveDeviceLiveVoice } from './speak-once';
import { ORBIS_VOICES, type OrbisVoice } from './voice-catalog';

export interface DownloadedVoice {
  voice: OrbisVoice;
  /** This device's live voice — the one thing that can't be deleted. */
  live: boolean;
}

/**
 * The model file this device speaks with, or null when it speaks with a system voice.
 *
 * By `resolveDeviceLiveVoice`, the rule that picks the voice that actually speaks — so the lock and the voice can't
 * disagree: no preference is the default Orbis voice, and a system preference on a device without system speech is
 * an Orbis voice too. Compared by FILE: a multi-speaker model is one download whichever of its speakers is chosen.
 */
function liveVoiceFile(pref: VoicePref | undefined, systemSupported: boolean): string | null {
  const live = resolveDeviceLiveVoice(pref, systemSupported);
  return live.source === 'orbis' ? live.path : null;
}

/** Every catalog voice downloaded to `cacheDir`, in catalog order, the live one marked. */
export async function downloadedVoices(
  adapter: DataAdapter,
  cacheDir: string,
  pref: VoicePref | undefined,
  systemSupported: boolean
): Promise<DownloadedVoice[]> {
  const liveFile = liveVoiceFile(pref, systemSupported);
  const here = await Promise.all(ORBIS_VOICES.map((v) => isOrbisVoiceDownloaded(adapter, cacheDir, v.path)));
  return ORBIS_VOICES.filter((_, i) => here[i]).map((voice) => ({ voice, live: voice.path === liveFile }));
}
