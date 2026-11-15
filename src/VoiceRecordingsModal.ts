// Voice & source popup (opened from the Listen bar / full-screen player voice chip). Three blocks:
//   VOICE  — read-only: the voice reading the CURRENT chapter + why it's that voice. A "Change
//            voice" button appears ONLY when the voice is the device live voice (so pressing it
//            always changes what's heard now); when the voice is fixed by the recording/mix there
//            is no button — you change it via the SOURCE block instead.
//   SPEED  — the listening speed: a slider and a number field, applied as either moves. It lives here rather than on
//            the listening bar, which keeps its room for the transport and the chip; the full player keeps its 1×.
//   SOURCE — pick which recording / mix plays (+ coverage), or open Recordings and mixes.
//
// **It is named for what it answers, not for what the other dialog manages.** A heading that repeats the title of
// the dialog it links to makes the pair read as one thing existing twice. This one is the question *what am I
// hearing*; that one is where recordings get built. The word SOURCE is Orbis's already, one scale down: in a mix it
// is where a chapter's audio comes from, and here it is where the book's comes from.
//
// The same two words are the two halves of the chip that opens this — `Amy · Mix 1`. See `VoiceInfo.source`.
// See docs/design/text-to-speech.md. Built on the shared createOrbisPopup scaffolding.

import { DropdownComponent } from 'obsidian';
import { actionRow } from './controls';
import { t } from './i18n';
import type { OrbisReaderView } from './OrbisReaderView';
import {
  clearActiveRecordingEdition,
  recordingEditions,
  setActiveRecordingEdition,
} from './reader/tts/recording-library';
import { voiceOriginSvg } from './reader/tts/voice-glyphs';
import { describeEditionVoice } from './reader/tts/voice-providers';
import { onVoiceReadinessChanged } from './reader/tts/voice-readiness';
import { openSettingsPage } from './settings-nav';
import { PAGE_I18N_KEYS } from './settings-rows';
import { HEADPHONES_SVG } from './system-glyphs';
import { captureFocus, createOrbisPopup, setSvgIcon } from './ui-utils';

export class VoiceRecordingsModal {
  /** Counts redraws, so only the newest one lands — see `render`. */
  private renderEpoch = 0;

  constructor(private readonly view: OrbisReaderView) {}

  async open(): Promise<void> {
    let unsub: (() => void) | null = null;
    const { popupEl, close } = createOrbisPopup(this.view, {
      title: t('voice_and_source.title'),
      icon: HEADPHONES_SVG,
      dismissOnOutsideClick: true,
      desktopWidth: 'min(420px, 92vw)',
      mobileMaxWidth: 460,
      mobileFillHeight: true, // content-heavy, no auto-focused field → use the full mobile height
      onClose: () => unsub?.(),
    });
    const body = popupEl.createDiv({ cls: 'orbis-listen-settings' });
    await this.render(body, close);
    // The VOICE block reports what this device can speak with, and the picker this panel opens can change that
    // without changing any preference — downloading the voice that was already chosen, or deleting it. See
    // `voice-readiness.ts`.
    unsub = onVoiceReadinessChanged(() => void this.render(body, close));
  }

  /** (Re)draw both blocks — re-run after a voice change or an edition switch so the VOICE line +
   *  coverage reflect the new state. */
  private async render(body: HTMLElement, close: () => void): Promise<void> {
    // Redrawn by the edition dropdown, which is inside what is being redrawn — so the keyboard has to be picked up
    // again afterwards. Captured before the awaits, for the reason `captureFocus` gives.
    const restoreFocus = captureFocus(body);
    /**
     * **Built off-screen, and swapped in only if no newer redraw has started.**
     *
     * Two can overlap: choosing a voice announces it (`voice-readiness.ts`) and the source dropdown redraws on its
     * own, and each redraw awaits the book's recordings on disk. Emptying `body` first and appending after the awaits
     * let both land — the panel showed every block twice, with two Done buttons.
     */
    const mine = ++this.renderEpoch;
    const next = createDiv();
    await this.renderVoiceBlock(next, close);
    // Under the voice: how it sounds, then where it comes from.
    const speed = next.createDiv({ cls: 'orbis-listen-block' });
    speed.createDiv({ cls: 'orbis-listen-block-title', text: t('voice_and_source.speed_heading') });
    this.view.buildListeningSpeed(speed);
    await this.renderRecordingBlock(next, close, body);
    if (mine !== this.renderEpoch) return;
    body.empty();
    body.append(...Array.from(next.childNodes));

    /**
     * **A button to the Listening page, not a link.** The two controls above it are buttons, and an underlined
     * accent link in an Obsidian dialog reads as "go to a note". It lands on the page itself — or, where Obsidian
     * cannot be asked for a page, on Orbis's settings, one selection short (see `openSettingsPage`).
     *
     * **A departure, not a detour**: this panel closes and does not come back, unlike *Change voice* and *Manage
     * recordings and mixes*. Settings is a window of its own, and closing it is not a return to anything.
     */
    const more = body.createDiv({ cls: 'orbis-listen-more' });
    more.createDiv({ cls: 'orbis-listen-settings-hint', text: t('voice_and_source.more_options') });
    more
      .createEl('button', { cls: 'orbis-listen-open-settings', text: t('voice_and_source.open_settings') })
      .addEventListener('click', () => {
        close();
        openSettingsPage(this.view.app, this.view.plugin.manifest.id, [t(PAGE_I18N_KEYS.Listening)]);
      });
    // Done, for the reason the voice picker has one: this panel applies every change as it is made, so there is
    // nothing to confirm — but a dialog that ends with prose and no button reads as unfinished.
    const btnRow = actionRow(body, { placement: 'footer' });
    btnRow.createEl('button', { cls: 'mod-cta', text: t('action.done') }).addEventListener('click', () => close());
    restoreFocus();
  }

  /** VOICE block: the voice reading the current chapter + its provenance, and a "Change voice"
   *  button when (and only when) that voice is the device live voice. */
  private async renderVoiceBlock(body: HTMLElement, close: () => void): Promise<void> {
    const info = await this.view.currentVoiceInfo(this.view.describedChapterIndex());
    /**
     * **The panel the chip opens must not contradict the chip.**
     *
     * `currentVoiceInfo` resolves the voice this chapter WOULD be read in, so on a device with nothing
     * downloaded it names the recommendation — `Amy — American English, Female` under a chip that says *No
     * voice*, reachable by selecting the thing that reported it.
     *
     * A recorded track needs no voice, so only the live answer is checked.
     */
    const missing = !info.recorded && !(await this.view.canSpeakNow());
    const block = body.createDiv({ cls: 'orbis-listen-block' });
    block.createDiv({ cls: 'orbis-listen-block-title', text: t('voice_and_source.voice_heading') });

    const row = block.createDiv({ cls: 'orbis-listen-voice-row' });
    /**
     * **This is where the chip's glyph gets explained**, and the only reason it can be a glyph anywhere else.
     *
     * The same mic-or-arcs that the reader just selected, sitting one line above a sentence that says in words what
     * it means — "Your live voice — this chapter has no recording." Nothing is labeled a legend and no key is
     * drawn; the pairing does it, at the moment someone came looking. Not a music note, which would be the same in
     * every state and belongs to a different kind of app.
     */
    setSvgIcon(row.createSpan({ cls: 'orbis-listen-voice-icon' }), voiceOriginSvg(info.recorded));
    const nameEl = row.createSpan({
      cls: 'orbis-listen-voice-name',
      text: missing ? t('voice_and_source.no_voice_name') : info.fullLabel, // full "Name — Locale, Gender"
    });
    nameEl.toggleClass('orbis-tts-voice-missing', missing);

    block.createDiv({
      cls: 'orbis-listen-voice-reason',
      text: missing ? t('voice_and_source.selected_voice_missing') : info.reason,
    });

    if (info.fromDeviceLive) {
      block
        .createEl('button', {
          cls: 'orbis-listen-change-voice',
          // "Change" assumes there is one. With nothing downloaded the button is the remedy rather than an
          // adjustment, and the picker it opens is where a voice is downloaded from.
          text: missing ? t('voice_and_source.choose_voice') : t('voice_and_source.change_voice'),
          // Keyed: the picker it opens redraws this popup when it closes, and this is where the reader was.
          attr: { 'data-orbis-focus': 'change-voice' },
        })
        .addEventListener('click', () => {
          /**
           * **One dialog at a time**: this panel closes, the picker opens, and the panel comes back when the picker
           * closes — as *Manage recordings and mixes* does below. Opened over this panel, the picker left two Done
           * buttons on a phone, its own and this panel's below it, and a voice change redrew a panel nobody could
           * see. Reopening re-reads everything, so the voice just chosen is what it comes back showing.
           */
          close();
          this.view.openLiveVoicePicker(undefined, () => this.view.openListenSettings());
        });
    }
  }

  /** RECORDING block: which recorded voice / mix plays (+ coverage), and Manage recordings. */
  private async renderRecordingBlock(body: HTMLElement, close: () => void, panel: HTMLElement): Promise<void> {
    const { editions, active, totalChapters } = await recordingEditions(this.view);
    const block = body.createDiv({ cls: 'orbis-listen-block' });
    block.createDiv({ cls: 'orbis-listen-block-title', text: t('voice_and_source.recording_heading') });

    const label = (e: { label?: string; engine: string; voice: string }): string =>
      e.label || describeEditionVoice(e.engine, e.voice);

    const pickerWrap = block.createDiv();
    const coverage = block.createDiv({ cls: 'orbis-listen-coverage' });
    const showCoverage = (recorded: number): void => {
      const partial = recorded > 0 && recorded < totalChapters;
      coverage.toggle(partial);
      if (partial)
        coverage.setText(t('voice_and_source.coverage', { done: String(recorded), total: String(totalChapters) }));
    };

    if (editions.length) {
      // Always offer "None — use the live voice" (active = null) alongside the recordings, so a book
      // can be listened to with the live voice even when it has recordings.
      const NONE = '__none__';
      const dd = new DropdownComponent(pickerWrap);
      // Keyed: choosing an edition redraws this popup, including this dropdown.
      dd.selectEl.dataset.orbisFocus = 'edition';
      dd.addOption(NONE, t('voice_and_source.none_option'));
      const sorted = [...editions].sort((a, b) => label(a).localeCompare(label(b)));
      for (const e of sorted) dd.addOption(e.key, label(e));
      dd.setValue(active ?? NONE);
      dd.onChange((k) => {
        const change = k === NONE ? clearActiveRecordingEdition(this.view) : setActiveRecordingEdition(this.view, k);
        // The PANEL, not `body`: this block is built off-screen and moved in (see `render`), so a redraw into `body`
        // went to a container no longer on screen — the choice was saved and the panel never showed it.
        void change.then(() => void this.render(panel, close));
      });
      showCoverage(active ? (editions.find((e) => e.key === active)?.recorded ?? 0) : 0);
      /**
       * **While *Always use the live voice* is on, the choice here plays nothing**, so the list is shown but not
       * offered, and a line says why and where to change it. The selection is kept, not cleared: turning the setting
       * off brings back what the reader chose, which is also why the chip still names it in parentheses.
       */
      if (this.view.playbackSource() === 'live') {
        dd.setDisabled(true);
        block.createDiv({ cls: 'orbis-listen-coverage', text: t('voice_and_source.always_live_note') });
      }
    } else {
      pickerWrap.createSpan({ cls: 'orbis-listen-none', text: t('voice_and_source.no_recordings') });
    }

    block
      .createEl('button', { cls: 'orbis-listen-manage', text: t('voice_and_source.manage') })
      .addEventListener('click', () => {
        // Closed, then reopened when the dialog it opens is done with — Orbis puts one dialog over a book at a
        // time, and this button is a detour rather than a departure. Reopening also re-reads the selection, so a
        // recording chosen or renamed in there is what this panel comes back showing.
        close();
        this.view.openRecordingsModal(() => this.view.openListenSettings());
      });
  }
}
