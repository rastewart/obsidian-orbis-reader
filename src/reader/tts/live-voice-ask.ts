// Asking for this device's live voice when something wants to speak in it and it is not here — the full prompt.
//
// **The full prompt, because the answer is about the voice being asked for.** Speak, Hear the live voice and the
// respelling editor's Live sample all speak in the device's live voice, so every answer the listening bar's prompt
// offers applies: download it, choose another (Browse voices), or use a system voice. A prompt about one specific
// voice — the recording default, a voice a mix names — offers only its download (`askForOrbisVoice`), since choosing
// another there would change a recording or a mix, not answer the question.
//
// **Browse opens Setup's *Choose a voice*** (`setup-voice-dialog.ts`): a Modal, so it works over the book and over
// Settings alike, where the reader's own picker popup does not exist.

import type { App } from 'obsidian';
import type { IOrbisReaderPlugin } from '../../settings';
import { openSetupVoiceDialog } from '../../setup-voice-dialog';
import { FirstVoiceModal } from './FirstVoiceModal';
import { downloadOrbisVoice, isOrbisVoiceDownloaded } from './PiperEngine';
import { resolveDeviceLiveVoice } from './speak-once';
import { orbisVoiceOrDefault } from './voice-catalog';
import { voiceReadinessChanged } from './voice-readiness';
import { WebSpeechEngine } from './WebSpeechEngine';

/** Ask for the device's live voice; resolves whether this device can speak in it now. */
export function askForLiveVoice(app: App, plugin: IOrbisReaderPlugin): Promise<boolean> {
  const cacheDir = `${app.vault.configDir}/plugins/orbis-reader/piper-cache`;
  const pref = plugin.getDeviceVoicePref();
  const voice = orbisVoiceOrDefault(pref?.orbisVoiceId);
  /** After Browse: whatever was chosen there, is it usable without fetching anything? */
  const readyNow = async (): Promise<boolean> => {
    const live = resolveDeviceLiveVoice(plugin.getDeviceVoicePref(), WebSpeechEngine.isSupported());
    return live.source !== 'orbis' || isOrbisVoiceDownloaded(app.vault.adapter, cacheDir, live.path);
  };
  return new Promise((resolve) => {
    new FirstVoiceModal(app, {
      voiceName: voice.name,
      sizeMB: voice.sizeMB,
      isRecommendation: !pref?.orbisVoiceId,
      download: (onProgress) =>
        downloadOrbisVoice(app.vault.adapter, cacheDir, voice.path, onProgress).then(() => voiceReadinessChanged()),
      onReady: () => resolve(true),
      onDismiss: () => resolve(false),
      onBrowse: () => openSetupVoiceDialog({ app, plugin, cacheDir }, () => void readyNow().then(resolve)),
      onUseSystem: WebSpeechEngine.isSupported()
        ? () =>
            void plugin.setDeviceVoicePref({ source: 'system' }).then(() => {
              plugin.refreshViews();
              resolve(true);
            })
        : undefined,
    }).open();
  });
}
