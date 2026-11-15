import type { App } from 'obsidian';
import { actionButton, actionRow } from '../../controls';
import { t } from '../../i18n';
import { OrbisModal } from '../../OrbisModal';
import { HEADPHONES_SVG } from '../../system-glyphs';
import { downloadOrbisVoice } from './PiperEngine';
import { voiceReadinessChanged } from './voice-readiness';

/**
 * First-run prompt shown the first time a device would Listen with an on-device (Orbis) voice
 * that isn't downloaded yet — so the ~60 MB download is consented to, not silent. Offers the
 * recommended voice, or browsing the full picker.
 *
 * **An `OrbisModal`, like every other dialog**, so it opens where the rest do rather than where Obsidian's own
 * `Modal` puts one. It wears the Listen badge in the standard header rather than drawing a glyph of its own.
 */
export class FirstVoiceModal extends OrbisModal {
  private busy = false;
  /** Answered — a voice arrived, or Browse or the system voice took over — so closing is not a dismissal. */
  private answered = false;

  constructor(
    app: App,
    private readonly opts: {
      voiceName: string;
      sizeMB: number;
      /** True = first-run default recommendation (Amy); false = restoring a voice already chosen. */
      isRecommendation: boolean;
      /** Download the voice; onProgress reports 0..1. */
      download: (onProgress: (fraction: number) => void) => Promise<void>;
      /** Called after a successful download (open the player and play). */
      onReady: () => void;
      /** Open the Live voice picker to choose a different voice. Absent where there is no picker to open — Settings. */
      onBrowse?: () => void;
      /** Closed without a voice arriving — by ×, Escape, Browse or the system-voice choice. */
      onDismiss?: () => void;
      /** Present only when this device has system voices: skip the download and use one. */
      onUseSystem?: () => void;
    }
  ) {
    super(app, { icon: HEADPHONES_SVG });
  }

  protected dialogTitle(): string {
    return t('onboarding.title');
  }

  protected renderDialog(): void {
    const { contentEl } = this;
    contentEl.createEl('p', { text: t('onboarding.body') });
    contentEl.createEl('p', {
      cls: 'orbis-first-voice-rec',
      text: t(this.opts.isRecommendation ? 'onboarding.recommended' : 'onboarding.your_voice', {
        name: this.opts.voiceName,
        size: String(this.opts.sizeMB),
      }),
    });
    const status = contentEl.createDiv({ cls: 'orbis-first-voice-status' });

    // The answer you came for last, in the slot a dialog's primary action takes — Save, in Save as Markdown.
    const row = actionRow(this.footer());
    const onBrowse = this.opts.onBrowse;
    const browse = onBrowse
      ? actionButton(row, {
          label: t('onboarding.browse'),
          onClick: () => {
            if (this.busy) return;
            this.answered = true;
            this.close();
            onBrowse();
          },
        })
      : null;
    const onUseSystem = this.opts.onUseSystem;
    if (onUseSystem) {
      actionButton(row, {
        label: t('onboarding.use_system'),
        onClick: () => {
          if (this.busy) return;
          this.answered = true;
          this.close();
          onUseSystem();
        },
      });
    }
    const dl = actionButton(row, {
      label: t('onboarding.download'),
      cta: true,
      onClick: () => {
        if (this.busy) return;
        this.busy = true;
        dl.disabled = true;
        if (browse) browse.disabled = true;
        void this.opts
          .download((f) => status.setText(t('onboarding.downloading', { pct: String(Math.round(f * 100)) })))
          .then(() => {
            this.answered = true;
            this.close();
            this.opts.onReady();
          })
          .catch(() => {
            status.setText(t('tts.voice_download_failed'));
            this.busy = false;
            dl.disabled = false;
            if (browse) browse.disabled = false;
          });
      },
    });
  }

  protected onDialogClose(): void {
    if (!this.answered) this.opts.onDismiss?.();
  }
}

/**
 * Ask for an Orbis voice that is not on this device, and say whether it arrived.
 *
 * **The one way a missing voice is fetched outside the player**: speaking a word, auditioning a respelling, hearing a
 * mix's voice. Each used to download the model silently to have something to play — 60 MB behind a Speak button.
 * Now they ask, with the prompt listening shows, and play once the reader has said yes. The player's own question
 * (`TtsController.withVoice`) offers more — Browse voices, a system voice — because it can act on the answer.
 */
function askForOrbisVoice(
  app: App,
  voice: { name: string; sizeMB: number },
  download: (onProgress: (fraction: number) => void) => Promise<void>
): Promise<boolean> {
  return new Promise((resolve) => {
    new FirstVoiceModal(app, {
      voiceName: voice.name,
      sizeMB: voice.sizeMB,
      isRecommendation: false,
      download,
      onReady: () => resolve(true),
      onDismiss: () => resolve(false),
    }).open();
  });
}

/** The `askForVoice` one-off speech is given (`SpeakOnceDeps`): ask, download into `cacheDir`, announce the arrival. */
export function orbisVoiceAsker(
  app: App,
  cacheDir: string
): (voice: { name: string; sizeMB: number; path: string }) => Promise<boolean> {
  return (voice) =>
    askForOrbisVoice(app, voice, (onProgress) =>
      downloadOrbisVoice(app.vault.adapter, cacheDir, voice.path, onProgress).then(() => voiceReadinessChanged())
    );
}
