// Reusable recording-voice picker: a dropdown of voices from a VoiceProvider (server discovery or the
// on-device Piper catalog), gender + group (language/accent) filters, a Preview button, and — for
// downloadable providers — download-on-select with progress. When more than one recording method is
// enabled it also shows a single-select method toggle (This device (Piper) / Server (Kokoro)) at the
// top, so a book can mix editions from either. The host owns where the chosen voice/method is stored
// and how to pause competing audio before a preview; the provider owns where voices come from.

import { ButtonComponent, DropdownComponent, TextComponent } from 'obsidian';
import { t } from '../../i18n';
import { captureFocus, setBusy } from '../../ui-utils';
import type { PreviewHandle } from './PiperEngine';
import type { VoiceProvider } from './voice-providers';
import { voiceReadinessChanged } from './voice-readiness';

/** A voice id may carry a `#N` speaker suffix (multi-speaker Piper models). These parse it; server
 *  voice ids never contain `#`, so both are safe no-ops there. */
const baseVoiceId = (v: string): string => v.split('#')[0];
const voiceSpeaker = (v: string): number => {
  const n = Number.parseInt(v.split('#')[1] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** One selectable voice source: its method id, the toggle label, and its provider. The method id is
 *  an opaque key ('piper'/'server' for recording, 'orbis'/'system' for live listening). */
export interface RecordingMethod {
  method: string;
  label: string;
  provider: VoiceProvider;
  /** Short description of this voice source, shown under the toggle when this method is active. */
  description?: string;
}

export interface VoicePickerHost {
  /** The selected voice id (initial value + persistence target). */
  getVoice(): string;
  setVoice(voice: string): void;
  /** Voices to omit from the dropdown (e.g. ones already recorded as another edition). Optional. */
  excludedVoices?(): readonly string[];
  /** Stop any competing audio (book playback, other previews) before a preview plays. */
  pauseAudio(): void;
  /** The active method — required when >1 method is offered (drives which side is shown). */
  getMethod?(): string;
  /** Switch the active method. Implementations should reset the voice to that method's default. */
  setMethod?(method: string): void;
  /** The speaker index to restore when a multi-speaker model is (re)selected — lets a host remember
   *  the last speaker per model. Optional; defaults to 0 (first speaker). */
  rememberedSpeaker?(baseVoiceId: string): number;
  /** Label shown directly above the dropdown, framing what selecting does (e.g. "Select live
   *  voice"). Optional — omitted where a surrounding Setting already names the control. */
  controlLabel?: string;
  /**
   * The Download button finished fetching `voice`, the one on screen. Optional: the live voice uses it to make the
   * voice shown as the default a stored choice — downloading a voice is choosing it. See `liveVoicePicker`.
   */
  voiceDownloaded?(voice: string): void;
}

/**
 * The collapsed "Voice filters" fold, returning the grid its rows go in.
 *
 * Two surfaces list voices with the same filters — this picker (live voice, on-device recording) and the server
 * voice in settings — so one builder serves both, and neither can drift out of keyboard reach: a `<summary>` is
 * focusable by nature, but not once we hide its marker and draw our own, so it needs `tabIndex` back explicitly,
 * and a fold nobody can reach hides every filter behind it. One builder, one tab stop. Collapsed by default — the
 * voice list is usually enough, and filters shouldn't eat vertical space.
 *
 * `before` puts it ahead of an existing child, which is how it lands above the dropdown rather than after it:
 * it decides what the list CONTAINS, so it belongs with the list and not after the buttons that act on what
 * you picked from it.
 */
export function voiceFiltersFold(parent: HTMLElement, before?: HTMLElement): HTMLElement {
  const filters = parent.createEl('details', { cls: 'orbis-voice-filters-inner' });
  if (before) parent.insertBefore(filters, before);
  const title = filters.createEl('summary', {
    cls: 'orbis-voice-filters-title',
    text: t('listening_page.gen_voice_filters'),
  });
  title.tabIndex = 0;
  // A 2-column grid (label | checks): the label column sizes to the widest label, so every row's checkboxes line up.
  // On the panel ground, like every other fold you act on rather than read — see `.orbis-fold-panel`.
  return filters.createDiv({ cls: 'orbis-voice-filters-grid orbis-fold-panel' });
}

export class VoicePicker {
  private genders = new Set(['f', 'm']);
  private groups = new Set<string>();
  private preview: PreviewHandle | null = null;
  private previewEpoch = 0;
  private previewBtn: ButtonComponent | null = null;
  private downloadEpoch = 0;
  /** The voice being downloaded by the button, while it is — the button shows its progress instead of a label. */
  private downloadingId: string | null = null;
  private renderEpoch = 0;
  /** Re-check the current voice's download state (set per render). Called after a Preview, which can download a
   *  model (so the "Download" hint clears). */
  private refreshReadiness: (() => void) | null = null;
  private readonly methods: RecordingMethod[];

  constructor(
    private readonly container: HTMLElement,
    private readonly host: VoicePickerHost,
    /** One method → the single-method form (no toggle); several → a method toggle picks the source. */
    methods: RecordingMethod | RecordingMethod[]
  ) {
    this.methods = Array.isArray(methods) ? methods : [methods];
  }

  /** The provider for the currently-active method. */
  private activeMethod(): RecordingMethod {
    const active = this.host.getMethod?.();
    return this.methods.find((m) => m.method === active) ?? this.methods[0];
  }

  destroy(): void {
    this.stopPreview();
    this.downloadEpoch++; // abandon any in-flight download's UI updates
    this.downloadingId = null;
  }

  /** Stop an in-flight voice preview (public so a competing preview can silence it). */
  stopPreview(): void {
    this.previewEpoch++;
    this.preview?.stop();
    this.preview = null;
    this.setBusy(false);
  }

  /** Render the method toggle (single-select) when more than one method is offered. A source-capable
   *  picker (host.setMethod present) with only one method shows that method's name as a static
   *  heading instead — e.g. "Orbis voices" on Android, where System voices don't exist. */
  private renderMethodToggle(): void {
    if (!this.host.setMethod) return;
    if (this.methods.length === 1) {
      this.container.createDiv({ cls: 'orbis-voice-method-heading', text: this.methods[0].label });
      return;
    }
    const active = this.activeMethod().method;
    const row = this.container.createDiv({ cls: 'orbis-voice-method-row' });
    for (const m of this.methods) {
      const btn = row.createEl('button', {
        cls: 'orbis-adv-scope-toggle orbis-voice-method-toggle',
        attr: { type: 'button', 'aria-pressed': String(m.method === active) },
      });
      btn.createSpan({ cls: 'orbis-adv-scope-label', text: m.label });
      btn.classList.toggle('is-active', m.method === active);
      if (m.method !== active)
        btn.addEventListener('click', () => {
          this.stopPreview();
          this.host.setMethod?.(m.method); // host resets the voice to this method's default
          this.groups = new Set(); // group keys differ per method → let the new provider's defaults apply
          this.genders = new Set(['f', 'm']);
          void this.render();
        });
    }
  }

  /** (Re)load voices and rebuild the picker. */
  async render(): Promise<void> {
    const epoch = ++this.renderEpoch; // guard against concurrent renders duplicating the tree
    /**
     * **The whole picker is rebuilt here, so the keyboard has to be carried across it.**
     *
     * The stepper's own restore is not enough: choosing a voice reaches the host, which reloads the listening source
     * and can bring this method back round — and a `render()` empties the container the stepper lives in, so the
     * row-level restore has nothing to restore into. Focus would fall to `body` behind the open dialog, where Tab
     * does not bring it back.
     *
     * Captured before the first `await`: `list()` is asynchronous, and by the time it resolves the element that had
     * the keyboard is gone.
     */
    const restoreFocus = captureFocus(this.container);
    this.container.empty();
    // The control label ("Select live voice") sits above the source toggle, framing the whole picker.
    if (this.host.controlLabel)
      this.container.createDiv({ cls: 'orbis-voice-select-label', text: this.host.controlLabel });
    this.renderMethodToggle();
    const active = this.activeMethod();
    // The active source's description, right under the toggle (or at the top when there's no toggle).
    if (active.description) this.container.createDiv({ cls: 'orbis-voice-method-desc', text: active.description });
    const provider = active.provider;
    const loading = this.container.createDiv({
      cls: 'orbis-gen-voice-note',
      text: t('listening_page.gen_voice_loading'),
    });
    const items = await provider.list();
    // A newer render() started while list() was in flight (e.g. the initial render + the immediate
    // onVoicesChanged fire) — it owns the container now; bail before touching the DOM.
    if (epoch !== this.renderEpoch) return;
    loading.remove();

    if (!items) {
      // Discovery failed (server offline / non-listing) — a plain text field + preview.
      const host = this.container.createDiv({ cls: 'orbis-gen-voice-control' });
      new TextComponent(host).setValue(this.host.getVoice()).onChange((v) => this.host.setVoice(v.trim()));
      this.previewBtn = new ButtonComponent(host)
        .setButtonText(t('listening_page.gen_voice_preview'))
        .onClick(() => this.doPreview());
      return;
    }

    if (!items.length) {
      // Provider has no voices at all (e.g. no system voices on this device) — a plain note.
      this.container.createDiv({ cls: 'orbis-gen-voice-note', text: t('listening_page.gen_voice_none_available') });
      return;
    }

    const groupsPresent = [...new Set(items.map((i) => i.group))];
    if (this.groups.size === 0) for (const g of provider.defaultGroups(groupsPresent)) this.groups.add(g);

    /**
     * **The filters go ABOVE the dropdown, because they decide what is in it.**
     *
     * Appended last, they would sit under Preview — everything else in this block acts on
     * the voice already chosen, so a fold arriving after them reads as a fourth thing you could do to that
     * voice. It is not: it narrows the list you choose FROM. A control placed after its own effect is
     * the wrong way round, and collapsed by default it costs one quiet line up here.
     *
     * Built now and filled in below, once `items` says which filters this provider's voices support.
     */
    const grid = voiceFiltersFold(this.container);

    const ctrl = this.container.createDiv({ cls: 'orbis-gen-voice-control' });
    const ddHost = ctrl.createDiv();
    // Multi-speaker models add a "Voice #N" stepper below the dropdown.
    const stepperHost = this.container.createDiv();
    // Preview on its own line — the voice labels are wide enough that an inline button crowds them.
    const previewRow = this.container.createDiv({ cls: 'orbis-gen-voice-preview-row' });
    // Its click is `press`, below — Download or Preview by what is on disk. Not set here as well: `onClick` adds a
    // listener rather than replacing one, and both would run.
    this.previewBtn = new ButtonComponent(previewRow).setButtonText(t('listening_page.gen_voice_preview'));
    /**
     * **No delete here.** It acted on the selected voice, and selecting one makes it the live voice — so the only voice
     * it could reach was the one in use. Voices are deleted from Settings → Listening → *Downloaded voices*, which
     * can't delete the live one (`downloaded-voices.ts`).
     */
    // Progress is on the button; this line is for what went wrong.
    const status = this.container.createDiv({ cls: 'orbis-gen-voice-note' });

    /**
     * **The button says what pressing it does.** A voice that is not on this device yet reads **Download · 60 MB**,
     * and pressing it downloads and then plays the sample; once the voice is here it reads **Preview**. Choosing a
     * voice in the list never downloads anything: a download is something the reader asks for, here and everywhere
     * else in Orbis. System voices and a speech server's voices have nothing to download, so they always preview.
     */
    const isReady = async (id: string): Promise<boolean> =>
      !provider.downloadable || !id || (await provider.isReady(id));
    const showState = async (id: string): Promise<void> => {
      const ready = await isReady(id);
      const size = items.find((i) => i.id === baseVoiceId(id))?.sizeMB ?? 0;
      if (this.downloadingId === null)
        this.previewBtn?.setButtonText(
          ready ? t('listening_page.gen_voice_preview') : t('listening_page.gen_voice_download', { size: String(size) })
        );
      renderStepper(
        items.find((i) => i.id === baseVoiceId(id)),
        ready
      );
    };

    const press = async (): Promise<void> => {
      const id = this.host.getVoice();
      if (await isReady(id)) return this.doPreview();
      if (!this.previewBtn || this.downloadingId !== null) return;
      const dl = ++this.downloadEpoch;
      this.downloadingId = id;
      status.empty();
      // Always the button on screen NOW: a redraw during the download replaces it, and progress written to the old
      // one would go nowhere.
      const progress = (pct: number): void => {
        if (dl !== this.downloadEpoch || !this.previewBtn) return;
        setBusy(this.previewBtn.buttonEl, true);
        this.previewBtn.setButtonText(t('listening_page.gen_voice_downloading', { pct: String(pct) }));
      };
      progress(0);
      try {
        await provider.download(id, (f) => progress(Math.round(f * 100)));
      } catch {
        if (dl !== this.downloadEpoch) return;
        this.downloadingId = null;
        this.unbusyPreview();
        // A download, so the advice is about the connection — not the speech server's words.
        status.setText(t('tts.voice_download_failed'));
        void showState(id);
        return;
      }
      if (dl !== this.downloadEpoch) return;
      this.downloadingId = null;
      this.unbusyPreview();
      this.host.voiceDownloaded?.(id); // before the redraw below, so a stored choice settles before the sample plays
      voiceReadinessChanged(); // the arrival this button exists to produce
      // A multi-speaker model's real speaker count is only readable once downloaded, so the whole picker redraws;
      // otherwise the button turns to Preview. Then the sample, which was the point of asking.
      if (items.find((i) => i.id === baseVoiceId(id))?.multiSpeaker) await this.render();
      else await showState(id);
      this.doPreview();
    };
    this.previewBtn.onClick(() => void press());

    // "Voice #N" stepper for a multi-speaker model (Piper libritts/vctk expose speakers only as
    // numbers — audition with ‹ ›/Preview). Hidden for single-speaker voices. Displayed 1-based
    // (Voice #1 is the first speaker) but stored 0-based to match Piper's internal speaker index.
    const renderStepper = (item: (typeof items)[number] | undefined, ready = true): void => {
      /**
       * **Stepping a voice rebuilds this row, so the keyboard has to be carried across.**
       *
       * ‹ and › audition as they step, and the row is redrawn to show the new number — which destroys the button the
       * reader was pressing. Unrestored, focus falls to `body`, from where Tab starts again outside the dialog. The
       * controls are keyed above.
       */
      const restoreFocus = captureFocus(stepperHost);
      stepperHost.empty();
      const speakers = item?.speakers ?? 1;
      if (!item || speakers <= 1) return;
      const row = stepperHost.createDiv({ cls: 'orbis-voice-speaker-row' });
      row.createSpan({ text: t('listening_page.gen_voice_speaker') });
      const input = row.createEl('input', {
        cls: 'orbis-voice-speaker-input',
        // Keyed, like the two chevrons: stepping a voice rebuilds this row, so a press has to be able to find its
        // own button again. See `captureFocus`.
        attr: { type: 'number', min: '1', max: String(speakers), step: '1', 'data-orbis-focus': 'voice-number' },
      });
      input.value = String(Math.min(voiceSpeaker(this.host.getVoice()), speakers - 1) + 1);
      // Set the shown (1-based) speaker, persist it (0-based), optionally auditioning it.
      const setShown = (shown: number, audition: boolean): void => {
        const clamped = Math.min(Math.max(shown, 1), speakers);
        input.value = String(clamped);
        this.host.setVoice(`${item.id}#${clamped - 1}`); // store 0-based
        if (audition) this.doPreview();
      };
      // ‹ prev — before the field; steps and auto-previews (tap to scan speakers).
      const prev = new ButtonComponent(row)
        .setIcon('chevron-left')
        .setTooltip(t('listening_page.voice_prev'))
        .onClick(() => setShown(Number.parseInt(input.value, 10) - 1, true));
      prev.buttonEl.addClass('orbis-voice-speaker-nav');
      prev.buttonEl.dataset.orbisFocus = 'voice-prev';
      input.before(prev.buttonEl); // move ‹ before the number field
      // › next — after the field; steps and auto-previews.
      const next = new ButtonComponent(row)
        .setIcon('chevron-right')
        .setTooltip(t('listening_page.voice_next'))
        .onClick(() => setShown(Number.parseInt(input.value, 10) + 1, true));
      next.buttonEl.addClass('orbis-voice-speaker-nav');
      next.buttonEl.dataset.orbisFocus = 'voice-next';
      row.createSpan({
        cls: 'orbis-gen-voice-note',
        text: t('listening_page.gen_voice_speaker_of', { n: String(speakers) }),
      });
      // Typing a number just selects it (no auto-preview) — Preview or ‹ › audition.
      input.addEventListener('change', () => setShown(Number.parseInt(input.value, 10) || 1, false));
      // ‹ › audition at once, so before the model is here they would download it unasked — the Download button
      // beside them is how it arrives. The count is known from the catalog, so "of 904" still shows.
      if (!ready) {
        prev.setDisabled(true);
        next.setDisabled(true);
        input.disabled = true;
      }
      restoreFocus();
    };

    // Compose the stored voice id for a freshly-selected model: single-speaker → bare id;
    // multi-speaker → `id#N`, restoring the host's remembered speaker for that model (clamped).
    const compose = (item: (typeof items)[number]): string => {
      const speakers = item.speakers ?? 1;
      if (speakers <= 1) return item.id;
      const remembered = this.host.rememberedSpeaker?.(item.id) ?? 0;
      return `${item.id}#${Math.min(Math.max(remembered, 0), speakers - 1)}`;
    };

    const rebuild = (): void => {
      ddHost.empty();
      stepperHost.empty();
      const excluded = new Set(this.host.excludedVoices?.() ?? []);
      // Exclusion matches the full stored id: single-speaker editions store the bare id (removes the
      // model), multi-speaker store `id#N` (leaves the model — other speakers are still available).
      const filtered = items.filter(
        (i) => (!i.gender || this.genders.has(i.gender)) && this.groups.has(i.group) && !excluded.has(i.id)
      );
      if (!filtered.length) {
        ddHost.createSpan({ cls: 'orbis-gen-voice-note', text: t('listening_page.gen_voice_none_match') });
        return;
      }
      let currentBase = baseVoiceId(this.host.getVoice());
      let currentItem = filtered.find((i) => i.id === currentBase);
      if (!currentItem) {
        currentItem = filtered[0];
        currentBase = currentItem.id;
        this.host.setVoice(compose(currentItem)); // filter/exclusion hid the pick → top match, speaker 0
      }
      const dd = new DropdownComponent(ddHost);
      for (const i of filtered) dd.addOption(i.id, i.label);
      dd.setValue(currentBase).onChange((id) => {
        const item = filtered.find((i) => i.id === id);
        if (item) this.host.setVoice(compose(item)); // new model → remembered/first speaker
        status.empty();
        void showState(this.host.getVoice());
      });
      void showState(this.host.getVoice());
      // After a preview, the button follows whatever is on disk now.
      this.refreshReadiness = (): void => {
        void showState(this.host.getVoice());
        // Preview is the other way a model lands — it downloads one to have something to play. Announced
        // unconditionally rather than only on a change, because a preview of an already-downloaded voice makes the
        // listeners repaint what they were already showing, and the alternative is this picker keeping its own
        // copy of readiness to compare against.
        voiceReadinessChanged();
      };
    };

    // Gender filter only when some voices actually carry a gender (system voices don't).
    if (items.some((i) => i.gender)) {
      const genderChecks = this.filterGroup(grid, t('listening_page.gen_voice_gender'));
      this.checkbox(genderChecks, t('listening_page.gender_female'), this.genders.has('f'), (on) => {
        on ? this.genders.add('f') : this.genders.delete('f');
        rebuild();
      });
      this.checkbox(genderChecks, t('listening_page.gender_male'), this.genders.has('m'), (on) => {
        on ? this.genders.add('m') : this.genders.delete('m');
        rebuild();
      });
    }
    const groupChecks = this.filterGroup(grid, provider.groupHeading);
    for (const g of groupsPresent) {
      const label = items.find((i) => i.group === g)?.groupLabel ?? g;
      this.checkbox(groupChecks, label, this.groups.has(g), (on) => {
        on ? this.groups.add(g) : this.groups.delete(g);
        rebuild();
      });
    }

    rebuild();
    // `retry: true`: a provider's list can resolve after this and paint again, so one more attempt a frame later is
    // the difference between landing and looking like it did nothing.
    restoreFocus({ retry: true });
  }

  private filterGroup(grid: HTMLElement, label: string): HTMLElement {
    grid.createSpan({ cls: 'orbis-voice-filter-group-label', text: label });
    return grid.createDiv({ cls: 'orbis-voice-filter-checks' });
  }

  private checkbox(parent: HTMLElement, label: string, checked: boolean, onChange: (on: boolean) => void): void {
    const wrap = parent.createEl('label', { cls: 'orbis-voice-filter-item' });
    const cb = wrap.createEl('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    wrap.createSpan({ text: label });
    cb.addEventListener('change', () => onChange(cb.checked));
  }

  /**
   * Preview is BUSY while a voice warms, not disabled.
   *
   * A disabled control loses its focus ring — and normally the focus with it — so pressing Preview from the keyboard
   * would leave the reader unable to see where they were, even with the button still holding it. The text already
   * says "Previewing…", which is the honest signal; `setBusy` adds `aria-busy` for a screen reader and dims it. A
   * second press is not refused: `doPreview` stops what is playing and starts again, which is what pressing it twice
   * means.
   */
  /** Take the busy state off the button on screen, after a download — see `press`. */
  private unbusyPreview(): void {
    const btn = this.previewBtn;
    if (btn !== null) setBusy(btn.buttonEl, false);
  }

  private setBusy(busy: boolean): void {
    if (this.previewBtn) setBusy(this.previewBtn.buttonEl, busy);
    this.previewBtn?.setButtonText(
      busy ? t('listening_page.gen_voice_previewing') : t('listening_page.gen_voice_preview')
    );
  }

  private doPreview(): void {
    this.stopPreview();
    this.host.pauseAudio();
    const epoch = ++this.previewEpoch;
    this.setBusy(true);
    const voice = this.host.getVoice();
    void this.activeMethod()
      .provider.preview(voice, voiceSpeaker(voice), () => {
        if (epoch === this.previewEpoch) this.preview = null;
      })
      .then((handle) => {
        if (epoch !== this.previewEpoch) {
          handle.stop();
          return;
        }
        this.preview = handle;
        this.setBusy(false);
        this.refreshReadiness?.(); // a Preview may have downloaded the model → clear the hint
      })
      .catch(() => {
        if (epoch !== this.previewEpoch) return;
        this.setBusy(false);
        // Only a server preview is about a server; an on-device one failed on this device.
        const failed =
          this.activeMethod().method === 'server'
            ? 'notices.gen_voice_preview_failed'
            : 'listening_page.preview_failed';
        this.container.createDiv({ cls: 'orbis-gen-voice-note', text: t(failed) });
      });
  }
}
