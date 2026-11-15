// Settings → Listening → **Downloaded voices**: the Orbis voices on this device, and the one place a voice is deleted.
//
// Its own file because it is its own dialog, like `setup-voice-dialog.ts` beside it.

import { type App, ButtonComponent } from 'obsidian';
import { askToConfirm } from './ConfirmModal';
import { actionRow } from './controls';
import { t } from './i18n';
import { openOrbisDialog } from './OrbisModal';
import { type DownloadedVoice, downloadedVoices } from './reader/tts/downloaded-voices';
import { readGenConfig } from './reader/tts/gen-config';
import { deleteOrbisVoice, resetPiperWarm } from './reader/tts/PiperEngine';
import { splitPiperVoice } from './reader/tts/voice-catalog';
import { orbisVoiceLabel } from './reader/tts/voice-providers';
import { onVoiceReadinessChanged, voiceReadinessChanged } from './reader/tts/voice-readiness';
import { WebSpeechEngine } from './reader/tts/WebSpeechEngine';
import type { IOrbisReaderPlugin } from './settings';

/**
 * List this device's Orbis voices, each with its size and a delete button — except the live voice's, which is shown
 * disabled: the row says **Selected live voice**, and the button's tooltip says why (`downloaded-voices.ts` says why that is the one rule).
 *
 * A `Modal`, because it opens over Obsidian's Settings window. **Done**, not Cancel: each delete is confirmed and
 * happens at once, so there is nothing held back to cancel. Every other use of a voice — the voice for new
 * recordings, a voice a mix names for a track — asks before downloading it again, so deleting one is never more than
 * a question later.
 */
export function openDownloadedVoicesDialog(app: App, plugin: IOrbisReaderPlugin, cacheDir: string): void {
  let unsub: (() => void) | null = null;
  openOrbisDialog(
    app,
    {
      title: t('downloaded_voices.title'),
      onClose: () => unsub?.(),
    },
    (body, close, _modalEl, footer) => {
      body.createEl('p', { cls: 'setting-item-description', text: t('downloaded_voices.intro') });
      const listHost = body.createDiv();
      let epoch = 0;
      const render = async (): Promise<void> => {
        const mine = ++epoch;
        const voices = await downloadedVoices(
          app.vault.adapter,
          cacheDir,
          plugin.getDeviceVoicePref(),
          WebSpeechEngine.isSupported()
        );
        if (mine !== epoch) return; // a newer render owns the list
        listHost.empty();
        if (!voices.length) {
          listHost.createEl('p', { cls: 'orbis-saved-empty', text: t('downloaded_voices.none') });
          return;
        }
        const list = listHost.createDiv({ cls: 'orbis-list-box' });
        for (const item of voices) renderRow(list, item);
        const total = voices.reduce((sum, v) => sum + v.voice.sizeMB, 0);
        listHost.createDiv({
          cls: 'orbis-downloaded-voices-total',
          text: t('downloaded_voices.total', { size: String(total) }),
        });
      };

      const renderRow = (list: HTMLElement, { voice, live }: DownloadedVoice): void => {
        const row = list.createDiv({ cls: 'orbis-downloaded-voice-row' });
        const info = row.createDiv();
        const name = orbisVoiceLabel(voice);
        info.createDiv({ cls: 'orbis-downloaded-voice-name', text: name });
        const meta = t('downloaded_voices.size', { size: String(voice.sizeMB) });
        info.createEl('small', {
          cls: 'orbis-downloaded-voice-meta',
          text: live ? `${meta} · ${t('downloaded_voices.selected_live')}` : meta,
        });
        const del = new ButtonComponent(row)
          .setIcon('trash')
          // A disabled button's pointer is macOS's "not allowed" one, whose badge hangs below and right of the arrow —
          // further than the tooltip gap clears, so under a tooltip placed below. To the left, the pointer can't reach it.
          .setTooltip(
            live ? t('downloaded_voices.select_another_to_delete') : t('downloaded_voices.delete_named', { name }),
            live ? { placement: 'left' } : undefined
          )
          .setDisabled(live);
        del.buttonEl.addClass('orbis-cmd-btn');
        if (live) return;
        del.onClick(async () => {
          const message = [t('downloaded_voices.delete_confirm', { size: String(voice.sizeMB) })];
          // The one other use worth a word: the next recording would stop to ask for it.
          const gen = readGenConfig();
          if (gen.piperEnabled && splitPiperVoice(gen.piperVoice).id === voice.id)
            message.push(t('downloaded_voices.delete_recording_voice'));
          const ok = await askToConfirm(app, {
            title: t('downloaded_voices.delete_title', { name: voice.name }),
            message,
            confirmText: t('action.delete'),
          });
          if (!ok) return;
          await deleteOrbisVoice(app.vault.adapter, cacheDir, voice.path);
          resetPiperWarm(); // a mix may have had this voice warm in memory
          voiceReadinessChanged(); // the pickers' buttons go back to Download, and this list redraws
        });
      };

      // Redrawn on any download or delete, wherever it happened, and on a change of live voice — that moves the lock.
      unsub = onVoiceReadinessChanged(() => void render());
      void render();
      actionRow(footer())
        .createEl('button', { cls: 'mod-cta', text: t('action.done') })
        .addEventListener('click', close);
    }
  );
}
