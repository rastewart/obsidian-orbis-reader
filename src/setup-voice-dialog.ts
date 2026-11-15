// Setup's **Choose a voice**: the live voice picker in a dialog, with **Done** at its foot.
//
// Its own file because it is its own dialog: Setup opens it, and nothing else in the settings tab needs what is here.

import type { App } from 'obsidian';
import { actionRow } from './controls';
import { deviceSetting } from './device-settings';
import { t } from './i18n';
import { openOrbisDialog } from './OrbisModal';
import { liveVoicePicker } from './reader/tts/live-voice-picker';
import { resetPiperWarm } from './reader/tts/PiperEngine';
import { VoicePicker } from './reader/tts/voice-picker';
import { onVoicesChanged } from './reader/tts/WebSpeechEngine';
import type { IOrbisReaderPlugin } from './settings';

/** What the dialog needs from the settings tab that opens it. */
export interface SetupVoiceDeps {
  app: App;
  plugin: IOrbisReaderPlugin;
  /** Where Orbis voices are kept on this device. */
  cacheDir: string;
}

/**
 * Choosing a voice from Setup: the same picker the Listening page shows, in a dialog.
 *
 * **Because "Download" is not the task.** Fetching the recommended voice and nothing else — no list, no preview,
 * no choice — would skip the decision the task is for. The picker is not a page: `VoicePicker` renders into any
 * container and `liveVoicePicker` builds its bindings from plain dependencies, which is why the reader opens the
 * same control in a popup.
 *
 * A `Modal`, not `createOrbisPopup`, because this opens over Obsidian's own Settings window — see
 * docs/design/dialog-system.md. Everything inside is the shared component: the voice list with sizes, per-voice
 * download, and Preview.
 *
 * Choosing applies immediately, exactly as it does on the Listening page, and downloads nothing: the picker's own
 * button reads **Download · 60 MB** for a voice not on this device, and that is how one arrives. The footer is always
 * **Done**, which closes, as × does. Closing repaints Setup, whose Listening row is `Ready` once this device has a
 * usable voice — a downloaded Orbis one or a chosen system one.
 */
export function openSetupVoiceDialog(deps: SetupVoiceDeps, done: () => void): void {
  let picker: VoicePicker | null = null;
  const unsubs: (() => void)[] = [];
  openOrbisDialog(
    deps.app,
    {
      title: t('setup.listening_pick_title'),
      // A download may be running inside — only Done or × closes it, as in the reader's Live voice picker.
      dismissOnOutsideClick: false,
      onClose: () => {
        for (const unsub of unsubs) unsub();
        picker?.destroy();
        done();
      },
    },
    (body, close, _modalEl, footer) => {
      const { host, methods } = liveVoicePicker({
        app: deps.app,
        cacheDir: deps.cacheDir,
        rate: () => deviceSetting('ttsRate') || 1,
        getPref: () => deps.plugin.getDeviceVoicePref(),
        // The same side effects the Listening page runs: free the warm worker, and let an open reader rebuild
        // its engine on the next play. Without them a voice chosen here would not be the voice that speaks.
        setPref: (patch) =>
          void deps.plugin.setDeviceVoicePref(patch).then(() => {
            resetPiperWarm();
            deps.plugin.refreshViews();
          }),
        pauseAudio: () => deps.plugin.pauseListening(),
      });
      const box = body.createDiv({ cls: 'orbis-recording-voice' });
      picker = new VoicePicker(box, host, methods);
      void picker.render();
      // System voices arrive lazily on desktop, after the first render.
      unsubs.push(onVoicesChanged(() => void picker?.render()));
      // Always there, so the dialog has a way out that says what it does, like the others. It downloads nothing.
      actionRow(footer())
        .createEl('button', { cls: 'mod-cta', text: t('action.done') })
        .addEventListener('click', close);
    }
  );
}
