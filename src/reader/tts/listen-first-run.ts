// A dev tool: put this device's Listen back to first run.

import { type App, Notice } from 'obsidian';
import { clearDeviceValue } from '../../device-store';
import { clearVoicePref } from '../../voice-pref';
import { deleteOrbisVoice, isOrbisVoiceDownloaded } from './PiperEngine';
import { ORBIS_VOICES } from './voice-catalog';
import { voiceReadinessChanged } from './voice-readiness';

/**
 * Forget this device's voice choice and first-run flags, and delete every downloaded Orbis voice.
 *
 * **The voices go too.** With no choice stored, Listen picks an Orbis voice and asks only when that voice is not on
 * disk, so a reset that left a voice downloaded would bring no prompt back at all. And on a phone there is no
 * reaching into the plugin folder. The speech runtime (`.wasm`, `.data`) stays: the prompt does not ask about it, and
 * it is 29 MB nobody needs to fetch again to test a dialog.
 */
export async function resetListenFirstRun(app: App, refreshViews: () => void): Promise<void> {
  clearVoicePref();
  clearDeviceValue('orbis-listen-system-hinted');
  clearDeviceValue('orbis-piper-live');
  const adapter = app.vault.adapter;
  const dir = `${app.vault.configDir}/plugins/orbis-reader/piper-cache`;
  const removed: string[] = [];
  for (const voice of ORBIS_VOICES) {
    if (!(await isOrbisVoiceDownloaded(adapter, dir, voice.path))) continue;
    await deleteOrbisVoice(adapter, dir, voice.path);
    removed.push(voice.name);
  }
  // A model went, so every surface that shows whether a voice is ready has to hear about it — see `voice-readiness`.
  if (removed.length) voiceReadinessChanged();
  refreshViews();
  const what = removed.length ? `Removed ${removed.join(', ')}.` : 'No voices were downloaded.';
  // i18n-audit-disable-next-line -- dev-only test notice
  new Notice(`Listen reset to first run on this device. ${what} The next Listen asks for a voice.`);
}
