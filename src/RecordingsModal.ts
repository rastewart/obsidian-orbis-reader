// Recording generation + management dialog. An recording can exist as several EDITIONS — each a
// full-or-partial recording in one voice — plus MIXES (per-chapter blends of recorded + live
// voices); see recording-editions.ts. Master-detail: the LIBRARY list is the hub (one row per
// recording/mix, with a whole-item delete, plus Add recording / Add mix); tapping a row opens its
// detail (voice → record/generate; mix → compose) with a name label + Back to the library. The
// library is the landing whenever the dialog opens idle (empty is a valid state — you can add a
// recording or an all-live mix from there); a run in progress or a just-finished run instead opens
// straight to that recording's detail (progress / success panel). Lifecycle (create / delete) lives
// on the library; content editing lives in the detail — a detail can't empty/destroy its own item
// (per-chapter delete is disabled on the last recording). Built on the shared createOrbisPopup
// scaffolding so title/close/background/mobile match the other dialogs.

import { DropdownComponent, Notice, setIcon, TextComponent } from 'obsidian';
import { confirmThen } from './ConfirmModal';
import { actionRow, pickListHeader } from './controls';
import { t } from './i18n';
import type { OrbisReaderView } from './OrbisReaderView';
import { orbisVoiceAsker } from './reader/tts/FirstVoiceModal';
import { readGenConfig } from './reader/tts/gen-config';
import { isOrbisVoiceDownloaded, type PreviewHandle } from './reader/tts/PiperEngine';
import type { SynthFailure } from './reader/tts/recording';
import type { EditionMeta, MixLiveVoice } from './reader/tts/recording-editions';
import type { GenProgress, RecordingSectionStatus, RecordingStatus } from './reader/tts/recording-generator';
import type { RecordingLibraryItem } from './reader/tts/recording-library';
import {
  clearActiveRecordingEdition,
  deleteRecordingChapter,
  deleteRecordingEdition,
  describeLiveVoice,
  loadRecordingChapter,
  mixLiveVoices,
  mixSourceEditions,
  recordingEditionKeyForVoice,
  recordingLibrary,
  recordingMethods,
  recordingStatus,
  renameRecordingEdition,
  setActiveRecordingEdition,
} from './reader/tts/recording-library';
import type { FinishedRun } from './reader/tts/recording-run';
import { VoiceNotHereError } from './reader/tts/speak-once';
import { orbisVoiceById, splitPiperVoice } from './reader/tts/voice-catalog';
import { voiceOriginSvg } from './reader/tts/voice-glyphs';
import { VoicePicker } from './reader/tts/voice-picker';
import { describeEditionVoice } from './reader/tts/voice-providers';
import { HEADPHONES_SVG } from './system-glyphs';
import { captureFocus, claimFocusSoon, createOrbisPopup, setSvgIcon } from './ui-utils';

/** Stable Source-dropdown option id for a live voice (mirrors the parsing in selectedMixLive). */
function liveOptionId(lv: MixLiveVoice): string {
  if (lv.kind === 'default') return 'live:default';
  return lv.kind === 'orbis' ? `live:orbis:${lv.voiceId}` : `live:system:${lv.voiceURI}`;
}

function formatBytes(n: number): string {
  if (n <= 0) return '';
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

function formatDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${Math.max(1, s)} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** The default recording voice for the active method (Piper vs server have separate namespaces). */
function defaultRecordVoice(method?: 'piper' | 'server'): string {
  const c = readGenConfig();
  return (method ?? c.method) === 'piper' ? c.piperVoice : c.voice;
}

const EMPTY_STATUS: RecordingStatus = {
  sections: [],
  totalBytes: 0,
  voicesUsed: [],
  editions: [],
  viewedEditionKey: null,
  activeEditionKey: null,
};

export class RecordingsModal {
  private status: RecordingStatus = EMPTY_STATUS;
  private readonly selected = new Set<number>();
  private running = false;
  private closed = false;
  /** null until the first status load decides the landing (see refresh). 'list' = the library of
   *  recordings/mixes (the hub when ≥2 items); 'view' = one voice edition's detail; 'mix' = a mix's
   *  compose detail; 'add' = the record-a-new-voice picker. */
  private mode: 'list' | 'view' | 'add' | 'mix' | null = null;
  /** Library rows (mode 'list'), fetched in refresh. */
  private libraryItems: RecordingLibraryItem[] = [];
  /** In view/mix mode, which edition is shown/played. */
  private selectedKey: string | null = null;
  /** Mix mode: available recorded source (voice) editions (with the chapters each has recorded). */
  private mixSources: { key: string; label: string; chapters: number[] }[] = [];
  /** Mix mode: NON-default live voices in the mix's source palette (default live is always offered).
   *  Seeded from the mix's existing live assignments + anything the user adds via "Add live voice". */
  private mixLive: MixLiveVoice[] = [];
  /** The currently-selected Source option id (see mixOptions): `rec:<key>` or `live:*`. */
  private mixSource: string | null = null;
  /** The viewed edition key last rendered — when it changes, the chapter selection re-defaults. */
  private renderedKey: string | null = null;
  /** The chapter currently generating + its sentence progress. */
  private active: { index: number; done: number; total: number } | null = null;
  /** Non-null while the run is held: `'user'` pressed Pause, `'background'` means the run paused itself. */
  private pausedReason: 'user' | 'background' | 'unreachable' | null = null;
  /** Chapters done / queued in THIS run (not the whole book) — drives the summary line. */
  private runProgress: { done: number; total: number } | null = null;
  /** The chapters queued for the current run — while running, the list narrows to just these. */
  private runSections: number[] | null = null;
  /** Last-rendered header shape (see headerSignature) so the header only rebuilds when it changes. */
  private headerSig: string | null = null;
  /** Set when a run finishes — shows a persistent "done in …" panel with a Continue button until the
   *  user dismisses it, instead of snapping straight back to the list. */
  /** The last run's outcome, kept until Continue. `failed` counts chapters that produced no audio at all. */
  private finished: FinishedRun | null = null;

  private body!: HTMLElement;
  private titleEl: HTMLElement | null = null;
  private noteEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private recordedEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private listEl!: HTMLElement;
  private footerEl!: HTMLElement;
  private closePopup: (() => void) | null = null;
  private readonly detailSpans = new Map<number, HTMLElement>();
  private readonly playBtns = new Map<number, HTMLElement>();

  // Preview playback of a generated chapter (independent of the reader's player). A live-voice mix
  // chapter has no file, so it previews as one-shot speech (`previewSpeech`) instead — either way
  // `previewIndex` is the single row that owns the preview.
  private previewAudio: HTMLAudioElement | null = null;
  private previewUrl: string | null = null;
  private previewIndex: number | null = null;
  private previewSpeech: PreviewHandle | null = null;
  private previewPending = false;

  // Voice that will be generated — the picker's choice in add/first-run mode, else the viewed
  // edition's voice (one voice per edition, so regeneration never mixes).
  /**
   * The engine THIS run records with.
   *
   * Seeded from the preferred engine in settings and changed only for the run in front of you: the toggle in
   * this dialog never writes `method` back to the config, so recording one chapter with the other engine does not
   * rewrite a standing preference. Settings states the default; this states the exception.
   */
  private runMethod: 'piper' | 'server' = readGenConfig().method;
  private runVoice: string = defaultRecordVoice();
  private picker: VoicePicker | null = null;

  /**
   * `returnTo` — where to go back to.
   *
   * **Set only when this dialog was opened from somewhere a reader was already standing.** Voice and source has to
   * close to open this one (two dialogs over a book at once is not a shape Orbis has), so without this, coming out
   * of here would drop you at the book rather than back where you pressed the button. Opened from the pane menu, the
   * command palette or a finished run, there is nowhere to return to and this stays undefined.
   */
  constructor(
    private readonly view: OrbisReaderView,
    private readonly returnTo?: () => void
  ) {}

  open(): void {
    const { popupEl, titleEl, close } = createOrbisPopup(this.view, {
      title: t('recordings_modal.title'),
      icon: HEADPHONES_SVG,
      dismissOnOutsideClick: false, // long-running job — only the X / Cancel / Close dismiss it
      desktopWidth: 'min(720px, 92vw)',
      mobileMaxWidth: 480,
      mobileFillHeight: true,
      onClose: () => this.onClosed(),
      /**
       * **The × on a detail screen is the Back button.**
       *
       * This dialog is four screens, not four dialogs: the library, a recording, a mix, and the add-a-voice
       * picker, each of the last three reached from the library and offering Back out of it. Dismissing one of
       * them is a request to leave that screen — the reader is closing what they opened, not the list they
       * opened it from — so the × (and Escape, which is the same gesture) returns to the library, and only
       * dismisses the dialog once there.
       */
      onDismiss: () => {
        if (this.mode === 'list') return false;
        this.goBack();
        return true;
      },
    });
    this.closePopup = close;
    this.running = this.view.isRecording();
    /**
     * Reopened while PAUSED — which is the likeliest way this dialog is opened, since a run that pauses itself
     * does so because the reader was elsewhere. Read from the generator rather than from the progress snapshot: a
     * pause is a transient event, so the last remembered progress is the chapter it happened during.
     *
     * The reason is not recoverable this way, so it reads as the reader's own pause. That understates a background
     * pause by one line of explanation; the notice said it at the time, and the run resumes the same either way.
     */
    this.pausedReason = this.view.isRecordingPaused() ? 'user' : null;
    // Reopened mid-run: seed the readout from the current snapshot so it isn't stuck on "Starting…".
    const cur = this.running ? this.view.currentRecordingProgress() : null;
    if (cur) {
      this.runProgress = { done: cur.chaptersDone, total: cur.chaptersTotal };
      this.runSections = this.view.currentRecordingRunSections(); // narrow the list to this run
      if (cur.chapterIndex != null)
        this.active = { index: cur.chapterIndex, done: cur.sentenceDone ?? 0, total: cur.sentenceTotal ?? 0 };
    } else if (!this.running) {
      // A run finished while the dialog was closed → open straight onto the success panel (once).
      this.finished = this.view.consumeRecordingLastRun();
    }
    this.view.setRecordingProgressObserver((p) => this.onProgress(p));

    // The popup title + intro note are tailored per view (see renderChrome).
    this.titleEl = titleEl;
    this.body = popupEl.createDiv({ cls: 'orbis-recording-body' });
    this.noteEl = this.body.createEl('p', { cls: 'orbis-recording-note', text: t('recordings_modal.note') });
    this.summaryEl = this.body.createDiv({ cls: 'orbis-recording-summary' });
    this.headerEl = this.body.createDiv();
    this.recordedEl = this.body.createDiv();
    this.progressEl = this.body.createDiv();
    this.listEl = this.body.createDiv({ cls: 'orbis-recording-list' });
    this.footerEl = actionRow(this.body, { placement: 'footer' });
    void this.refresh();
  }

  close(): void {
    this.closePopup?.();
  }

  private onClosed(): void {
    this.closed = true;
    this.stopPreview();
    this.picker?.destroy();
    this.view.setRecordingProgressObserver(null); // generation continues; notices resume
    /**
     * **Everything done in here can change what the chip says, so it is repainted once on the way out.**
     *
     * The chip caches per chapter and is refreshed by three things: the bar opening, the chapter turning over, and
     * the active selection changing. Nothing else in this dialog is on that list — deleting a chapter's audio
     * flips its glyph from mic to arcs, deleting the active recording drops the whole second half, assigning a mix
     * chapter changes both, and a run that records the chapter you are parked on changes it too. Catching them
     * one by one is a list that gets out of date; this is the single moment when all of them are already done.
     *
     * A rename also calls it directly, because on a desktop the bar chip sits in plain sight beside this dialog
     * and waiting until it closes is visibly too late.
     */
    this.view.refreshVoiceChip();
    this.closePopup = null;
    // Last, and after the chip: whatever sent us here gets the reader back, with this dialog's changes already
    // applied so the panel it reopens shows them.
    this.returnTo?.();
  }

  // ── Editions: header controls (voice picker vs edition selector) ──

  /** A human label for a voice, engine-aware (shared with the Listen settings popup). */
  private voiceLabelFor(engine: string, voice: string): string {
    return describeEditionVoice(engine, voice);
  }

  private editionLabel(e: EditionMeta): string {
    const base = e.label || this.voiceLabelFor(e.engine, e.voice);
    // When a book mixes engines, tag each edition with its model (Piper / Kokoro) so they're
    // distinguishable; when all editions share one engine, the tag would just be noise.
    const mixed = new Set(this.status.editions.map((x) => x.engine)).size > 1;
    if (mixed && e.model) return `${base} · ${e.model.charAt(0).toUpperCase()}${e.model.slice(1)}`;
    return base;
  }

  private voiceForKey(key: string | null): string {
    return this.status.editions.find((e) => e.key === key)?.voice ?? '';
  }

  /**
   * Take a recording's voice AND its engine, together.
   *
   * **A voice name only means something to the engine that made it.** Opening a recording took its voice and kept
   * the device's preferred engine — so extending an on-device Ryan recording on a phone that prefers the server sent
   * `en_US-ryan-medium` to the server, which refused every sentence (a 400) and the run reported the server
   * unreachable.
   */
  private adoptEdition(key: string | null): void {
    const edition = this.status.editions.find((e) => e.key === key);
    if (!edition?.voice) return;
    this.runVoice = edition.voice;
    this.runMethod = edition.engine === 'piper-ondevice' ? 'piper' : 'server';
  }

  /** Whether to show the voice picker (first run / adding a voice) vs the edition selector. Driven by
   *  mode, not edition count — so while generating a brand-new edition we stay in the selector, not
   *  the picker (which would exclude the just-registered voice and jump to another one). */
  private get showPicker(): boolean {
    return this.mode === 'add';
  }

  /** A short signature of what the header should show, so reconcileHeader only rebuilds it (and
   *  re-fetches voices, for the picker) when the shape actually changes — not on every data refresh. */
  private headerSignature(): string {
    const viewingReal = this.status.editions.some((e) => e.key === this.selectedKey);
    return [
      this.mode,
      this.status.editions.length,
      this.selectedKey ?? '',
      this.running,
      !!this.finished,
      viewingReal,
      // The mix header's "Use for selected (N)" counts the checked chapters, so the count belongs in
      // the signature — otherwise clearing the selection (as a successful assign does) leaves the
      // button still claiming the chapters it just assigned.
      this.selected.size,
    ].join('|');
  }

  private reconcileHeader(): void {
    if (this.headerSignature() === this.headerSig) return;
    this.renderHeader();
  }

  /** Tailor the popup title + intro note to the current view (library / recording / mix / add). */
  private renderChrome(): void {
    let title: string;
    let note: string;
    switch (this.mode) {
      case 'add':
        title = t('recordings_modal.title_add');
        note = t('recordings_modal.note_add');
        break;
      case 'mix':
        title = t('recordings_modal.title_mix');
        note = t('recordings_modal.note_mix');
        break;
      case 'view':
        title = t('recordings_modal.title_recording');
        note = t('recordings_modal.note_recording');
        break;
      default: // list
        title = t('recordings_modal.title');
        note = t('recordings_modal.note');
        break;
    }
    if (this.titleEl) this.titleEl.textContent = title;
    this.noteEl.setText(note);
  }

  /** Label for the voice currently in focus: the viewed edition's, or — while generating a brand-new
   *  voice whose edition isn't registered yet — the run voice's description. */
  private currentVoiceLabel(): string {
    const e = this.status.editions.find((x) => x.key === this.selectedKey);
    if (e) return this.editionLabel(e);
    return this.genVoiceLabel();
  }

  /**
   * What went wrong, in a sentence with something to do in it.
   *
   * **Named at the point of failure, said here.** The synth knows whether the server rejected the voice, refused the
   * request, failed on its own account or could not be reached at all — and a reader should never be told to open a
   * debug log to find that out. The voice and the server address are filled in because they are the two things a
   * reader would go and check.
   */
  private failureText(failure: SynthFailure | null | undefined): string {
    const voice = this.currentVoiceLabel();
    switch (failure) {
      case 'voice-rejected':
        return t('recordings_modal.failed_voice_rejected', { voice });
      case 'unauthorized':
        return t('recordings_modal.failed_unauthorized');
      case 'server-error':
        return t('recordings_modal.failed_server_error');
      case 'unreachable':
        return t('recordings_modal.failed_unreachable', { url: readGenConfig().serverUrl || '—' });
      case 'device-voice':
        return t('recordings_modal.failed_device_voice', { voice });
      case 'unreadable-audio':
        return t('recordings_modal.failed_unreadable');
      default:
        return t('recordings_modal.failed_unknown');
    }
  }

  /** Label for the voice a new run will actually use — always the picked run voice with the current
   *  method's engine (not the possibly-stale viewed edition). Used by the generate confirmation. */
  private genVoiceLabel(): string {
    const engine = this.runMethod === 'piper' ? 'piper-ondevice' : 'openai-compatible';
    return this.voiceLabelFor(engine, this.runVoice);
  }

  private renderHeader(): void {
    // Stamped here, not in reconcileHeader: the direct callers (selection changes, source change,
    // Add live voice) render the header too, and if they left the signature behind then whatever they
    // changed would be missing from it, and a stale "Use for selected (N)" would survive an assign. Set
    // before drawing because renderHeader has several early returns.
    this.headerSig = this.headerSignature();
    /**
     * The header restates the selection ("Use for selected (3)"), so pressing one of its buttons redraws it — and the
     * keyboard has to survive that. Its controls are keyed, because the labels change shape with the count.
     *
     * **The restore is here, not at the end of the drawing**: `paintHeader` returns early for four of its five
     * states, so a restore at the end would leave a mix, a picker, a run and the library list having captured focus
     * — which BLURS — and never put it back. Anything that captures has to restore on every path out, which is
     * easiest when there is only one.
     */
    const restoreFocus = captureFocus(this.headerEl);
    this.headerEl.empty();
    this.picker?.destroy();
    this.picker = null;
    this.paintHeader();
    restoreFocus();
  }

  /** The header's five states. Called only by `renderHeader`, which owns the capture and the restore around it. */
  private paintHeader(): void {
    // While generating (or on the finished panel), never show an interactive picker/dropdown/preview
    // — just the voice name.
    if (this.running || this.finished) {
      const row = this.headerEl.createDiv({ cls: 'orbis-recording-edition-row' });
      row.createSpan({ cls: 'orbis-recording-voice-title', text: t('recordings_modal.voice_heading') });
      row.createSpan({ cls: 'orbis-recording-voice-static', text: this.currentVoiceLabel() });
      return;
    }

    if (this.showPicker) {
      // Just a "Back" button row above the picker — no "Voice:" label (the title "Add recording" +
      // its description already frame the picker below).
      if (!this.running) {
        const row = this.headerEl.createDiv({ cls: 'orbis-recording-edition-row' });
        row
          .createDiv({ cls: 'orbis-recording-edition-btns' })
          .createEl('button', { text: t('action.back') })
          .addEventListener('click', () => this.goBack());
      }
      const box = this.headerEl.createDiv({ cls: 'orbis-recording-voice' });
      this.picker = new VoicePicker(
        box,
        {
          getVoice: () => this.runVoice,
          setVoice: (v) => {
            this.runVoice = v;
            void this.refresh(); // reflect this voice's edition (its progress, if it already exists)
          },
          // Don't offer a voice that's already an edition — each edition is a distinct voice. (Server
          // and Piper ids are different namespaces, so cross-method entries just never match.)
          excludedVoices: () => this.status.editions.map((e) => e.voice),
          pauseAudio: () => {
            this.stopPreview();
            this.view.pauseListening();
          },
          getMethod: () => this.runMethod,
          setMethod: (m) => {
            // This run only — the standing preference lives in settings and is not rewritten from here.
            this.runMethod = m === 'server' ? 'server' : 'piper';
            this.runVoice = defaultRecordVoice(this.runMethod); // separate namespaces → this method's default
            void this.refresh();
          },
        },
        recordingMethods(this.view) // enabled methods; >1 → the picker shows a Piper/server toggle
      );
      void this.picker.render();
      return;
    }

    if (this.mode === 'mix') {
      this.renderMixHeader();
      return;
    }

    // List mode: the library rows carry everything (the header stays empty; the Add / New mix / Close
    // actions live in the footer).
    if (this.mode === 'list') return;

    // View detail: the voice name as a LABEL (not a dropdown) + a rename pencil + Back to the library. Add
    // recording / Add mix and whole-recording delete all live on the library, so they're not repeated here.
    const row = this.headerEl.createDiv({ cls: 'orbis-recording-edition-row' });
    // "Recording:" once it carries a name of its own, because "Voice: Night reads" calls a name a voice.
    const named = !!this.status.editions.find((e) => e.key === this.selectedKey)?.label;
    row.createSpan({
      cls: 'orbis-recording-voice-title',
      text: t(named ? 'recordings_modal.name_heading' : 'recordings_modal.voice_heading'),
    });
    row.createSpan({ cls: 'orbis-recording-voice-static', text: this.currentVoiceLabel() });
    const renameRec = row.createEl('button', {
      cls: 'orbis-recording-mix-rename',
      attr: { 'aria-label': t('recordings_modal.rename_recording'), 'data-orbis-focus': 'header:rename' },
    });
    setIcon(renameRec, 'pencil');
    renameRec.addEventListener('click', () => void this.renameEdition());
    row
      .createDiv({ cls: 'orbis-recording-edition-btns' })
      .createEl('button', { text: t('action.back'), attr: { 'data-orbis-focus': 'header:back' } })
      .addEventListener('click', () => this.goBack());
  }

  /** Mix mode header: "Mix: <name>" + Back, then the Source bar (source dropdown + Add live voice +
   *  "Use for selected"). A mix source is a recorded voice edition OR a live voice. */
  private renderMixHeader(): void {
    const row = this.headerEl.createDiv({ cls: 'orbis-recording-edition-row' });
    const name = this.status.editions.find((e) => e.key === this.selectedKey)?.label ?? t('recordings_modal.new_mix');
    row.createSpan({ cls: 'orbis-recording-voice-title', text: t('recordings_modal.mix_heading', { name }) });
    // Pencil to rename the mix.
    const rename = row.createEl('button', {
      cls: 'orbis-recording-mix-rename',
      attr: { 'aria-label': t('recordings_modal.mix_rename'), 'data-orbis-focus': 'header:rename' },
    });
    setIcon(rename, 'pencil');
    rename.addEventListener('click', () => void this.renameEdition());
    row
      .createDiv({ cls: 'orbis-recording-edition-btns' })
      .createEl('button', { text: t('action.back'), attr: { 'data-orbis-focus': 'header:back' } })
      .addEventListener('click', () => this.goBack());

    const bar = this.headerEl.createDiv({ cls: 'orbis-recording-mix-bar' });
    bar.createSpan({ cls: 'orbis-recording-mix-source-label', text: t('recordings_modal.mix_source') });
    const opts = this.mixOptions();
    const dd = new DropdownComponent(bar);
    // Keyed: changing the source redraws this bar, and the button beside it changes its label with the count — so a
    // path-based restore aims at whatever now stands in that slot.
    dd.selectEl.dataset.orbisFocus = 'header:mix-source';
    for (const o of opts) dd.addOption(o.id, o.label);
    if (!this.mixSource || !opts.some((o) => o.id === this.mixSource)) this.mixSource = opts[0]?.id ?? null;
    if (this.mixSource) dd.setValue(this.mixSource);
    dd.onChange((id) => {
      this.mixSource = id;
      // A recorded source only offers the chapters it has; drop any now-unselectable picks, then
      // re-render the list (enable/disable checkboxes) and this bar (the count).
      const have = this.mixSourceChapters();
      if (have) for (const i of [...this.selected]) if (!have.has(i)) this.selected.delete(i);
      this.renderList();
      this.renderHeader();
    });
    const addLive = bar.createEl('button', {
      text: t('recordings_modal.mix_add_live'),
      attr: { 'data-orbis-focus': 'header:mix-add-live' },
    });
    addLive.addEventListener('click', () => void this.addLiveVoice());
    bar
      .createEl('button', {
        cls: 'mod-cta',
        text: t('recordings_modal.mix_use', { n: String(this.selected.size) }),
        attr: { 'data-orbis-focus': 'header:mix-use' },
      })
      .addEventListener('click', () => void this.useSourceForSelected());
  }

  /** The Source dropdown options: recorded voice editions (tagged "· recording" to mirror the "· live"
   *  suffix on live voices), then any specific live voices in the mix's palette, then the always-
   *  present "Default live voice" last. `chapters` = the assignable set (null → every chapter). */
  private mixOptions(): { id: string; label: string; chapters: Set<number> | null }[] {
    const recTag = t('recordings_modal.mix_recorded_tag');
    const opts: { id: string; label: string; chapters: Set<number> | null }[] = this.mixSources.map((s) => ({
      id: `rec:${s.key}`,
      label: `${s.label} · ${recTag}`,
      chapters: new Set(s.chapters),
    }));
    for (const lv of this.mixLive) opts.push({ id: liveOptionId(lv), label: describeLiveVoice(lv), chapters: null });
    opts.push({ id: 'live:default', label: describeLiveVoice({ kind: 'default' }), chapters: null });
    return opts;
  }

  /** Chapters assignable from the currently-selected source: a recorded source's recorded chapters,
   *  or null (every chapter) for a live source. */
  private mixSourceChapters(): Set<number> | null {
    return this.mixOptions().find((o) => o.id === this.mixSource)?.chapters ?? null;
  }

  /** The live voice the selected source represents, or null when it's a recorded source. */
  private selectedMixLive(): MixLiveVoice | null {
    const id = this.mixSource;
    if (!id || id.startsWith('rec:')) return null;
    if (id === 'live:default') return { kind: 'default' };
    return this.mixLive.find((lv) => liveOptionId(lv) === id) ?? null;
  }

  private enterAddMode(): void {
    this.mode = 'add';
    this.renderedKey = null; // force the one-time default-select on the first add refresh (see refresh)
    // Back to the preferred engine from settings for each new run, rather than to whatever the last run used — when
    // this device offers it. A preferred server that is switched on but has no address or voice is not offered, and
    // the picker shows on-device voices instead; recording with the server anyway sent it an on-device voice name.
    const offered = recordingMethods(this.view).map((m) => m.method);
    const preferred = readGenConfig().method;
    this.runMethod = offered.includes(preferred) ? preferred : offered[0] === 'server' ? 'server' : 'piper';
    this.runVoice = defaultRecordVoice(this.runMethod);
    this.stopPreview();
    void this.refresh(); // reconcileHeader (end of refresh) rebuilds the header for the new mode
  }

  /** The library hub — the list of recordings/mixes to pick from. */
  private enterListMode(): void {
    /**
     * **Back lands on the row you came in through**, not at the top of the library.
     *
     * The detail and the library are two screens of one dialog, so nothing restores focus between them: the reader
     * who opened the third recording from the keyboard came back to the first. The row carries the item's key; the
     * claim waits for the repaint, which is asynchronous here.
     */
    const wasOn = this.selectedKey;
    this.mode = 'list';
    this.selectedKey = null;
    this.selected.clear();
    this.stopPreview();
    void this.refresh().then(() => {
      const row = wasOn
        ? this.listEl.querySelector<HTMLElement>(`[data-orbis-focus="item:${CSS.escape(wasOn)}"]`)
        : null;
      if (row) claimFocusSoon(row);
    });
  }

  /** Open an item's detail from a click (voice → view, mix → compose), then refresh. */
  private openEditionDetail(key: string): void {
    void this.openEditionDetailInline(key)
      .then(() => this.refresh())
      .then(() => this.landOnDetail());
  }

  /**
   * **Where the keyboard goes when a detail opens: the top of the thing, not the first row of its list.**
   *
   * Without this it lands on the first chapter's checkbox — not chosen, but left over. The library row that was
   * pressed is destroyed by the mode change, so `captureFocus`'s "never leave the keyboard on `body`" fallback puts
   * focus on the first control in the rebuilt list. Right as a fallback, wrong as a landing.
   *
   * Either kind lands on its rename pencil — the first control in its header, and where its name is edited.
   */
  private landOnDetail(): void {
    if (this.mode !== 'mix' && this.mode !== 'view') return;
    const target = this.headerEl.querySelector<HTMLElement>('[data-orbis-focus="header:rename"]');
    if (target) claimFocusSoon(target);
  }

  /** Set the detail state for an item WITHOUT refreshing — used from inside refresh (initial land)
   *  and by openEditionDetail (which refreshes after). A mix seeds its source palette. */
  private async openEditionDetailInline(key: string): Promise<void> {
    this.stopPreview();
    this.selectedKey = key;
    if (this.status.editions.find((e) => e.key === key)?.kind === 'mix') {
      this.mode = 'mix';
      [this.mixSources, this.mixLive] = await Promise.all([
        mixSourceEditions(this.view),
        mixLiveVoices(this.view, key),
      ]);
      this.mixSource = null;
      this.selected.clear();
    } else {
      this.mode = 'view';
      this.adoptEdition(key);
    }
  }

  /** Leave a detail (or the add picker) → the library (valid even when empty). */
  private goBack(): void {
    this.enterListMode();
  }

  /** Open a mix's compose detail. Sets mix mode explicitly (doesn't infer kind from this.status,
   *  which is stale for a just-created mix — see the Add mix flow). */
  private async enterMixMode(key: string): Promise<void> {
    this.mode = 'mix';
    this.selectedKey = key;
    this.stopPreview();
    [this.mixSources, this.mixLive] = await Promise.all([mixSourceEditions(this.view), mixLiveVoices(this.view, key)]);
    this.mixSource = null;
    this.selected.clear();
    await this.refresh();
    this.landOnDetail();
  }

  /**
   * Rename the item being edited, from the pencil in its header — the one place a name is changed.
   *
   * **A recording can be renamed too.** An edition's key is its engine, model and voice, so a book can hold only
   * one recording per voice and the voice is a unique name for free — but the chip carries that name beside the
   * voice, and a mix has a pencil, so a recording without one would read as a missing feature rather than a
   * decision. The storage doesn't care: `setEditionLabel` is kind-agnostic and every label site reads
   * `label || <the voice>`.
   *
   * That fallback is what makes the two kinds differ here. **An empty name is a valid answer for a recording** —
   * it gives the name back to the voice, which is what the prompt's placeholder shows — and no answer at all for a
   * mix, which would be left with nothing to be called.
   */
  private async renameEdition(): Promise<void> {
    const key = this.selectedKey;
    if (!key) return;
    const e = this.status.editions.find((x) => x.key === key);
    if (!e) return;
    const isMix = e.kind === 'mix';
    const name = await this.promptText(
      t(isMix ? 'recordings_modal.mix_rename' : 'recordings_modal.rename_recording'),
      isMix ? t('recordings_modal.mix_name_placeholder') : this.voiceLabelFor(e.engine, e.voice),
      e.label ?? '',
      t('recordings_modal.mix_update')
    );
    if (name == null) return;
    const trimmed = name.trim();
    if (isMix && !trimmed) return;
    await renameRecordingEdition(this.view, key, trimmed);
    this.headerSig = null; // the name isn't part of headerSignature — force the header to rebuild
    // The chip behind this dialog shows the selection by name, so a rename is a change it has to hear about. It
    // caches per chapter and would otherwise keep the old name until the chapter turned over.
    this.view.refreshVoiceChip();
    await this.refresh();
  }

  /** Prompt for a name, create a mix edition, and open it for composing. */
  private async promptNewMix(): Promise<void> {
    const name = await this.promptText(t('recordings_modal.new_mix'), t('recordings_modal.mix_name_placeholder'));
    if (name == null) return;
    const key = await this.view.createMixEdition(name.trim() || t('recordings_modal.mix_default_name'));
    if (key) await this.enterMixMode(key);
  }

  /** Point the selected chapters at the current source — a live voice (any chapter) or a recorded
   *  voice edition (only chapters that source has recorded). */
  private async useSourceForSelected(): Promise<void> {
    if (this.mode !== 'mix' || !this.selectedKey || !this.mixSource || !this.selected.size) return;
    const count = this.selected.size;
    // Captured before the assign: mixOptions() is the dropdown's own label, so the notice names the
    // source exactly as the user picked it.
    const voice = this.mixOptions().find((o) => o.id === this.mixSource)?.label ?? '';
    const live = this.selectedMixLive();
    if (live) await this.view.assignMixLive(this.selectedKey, live, [...this.selected]);
    else await this.view.assignMixChapters(this.selectedKey, this.mixSource.replace(/^rec:/, ''), [...this.selected]);
    this.selected.clear();
    await this.refresh();
    // Without this, the most visible effect of a successful assign is the checkboxes emptying, which
    // reads as "it just cleared my selection" — the only other feedback is a subtitle changing on
    // rows that may be scrolled out of view.
    new Notice(
      count === 1
        ? t('recordings_modal.mix_assigned_one', { voice })
        : t('recordings_modal.mix_assigned', { count: String(count), voice })
    );
  }

  /** Open the live-voice picker; on confirm, add the chosen voice to the mix's Source palette and
   *  select it (ready to assign to the checked chapters). */
  private async addLiveVoice(): Promise<void> {
    const live = await this.promptLiveVoice();
    if (!live) return;
    const id = liveOptionId(live);
    if (!this.mixLive.some((lv) => liveOptionId(lv) === id)) this.mixLive.push(live);
    this.mixSource = id;
    this.renderHeader();
    this.renderList();
    // The picker's own restore aims at the button that opened it, and this repaint has just replaced that button —
    // so the claim is made again here, against the key its replacement carries.
    const addLive = this.headerEl.querySelector<HTMLElement>('[data-orbis-focus="header:mix-add-live"]');
    if (addLive) claimFocusSoon(addLive);
  }

  /** A small popup with the shared VoicePicker over the live (Orbis / System) voices — resolves the
   *  chosen live voice, or null if cancelled. */
  private promptLiveVoice(): Promise<MixLiveVoice | null> {
    return new Promise((resolve) => {
      const { popupEl, close } = createOrbisPopup(this.view, {
        title: t('recordings_modal.mix_add_live_title'),
        dismissOnOutsideClick: true,
      });
      const methods = this.view.liveVoiceMethods();
      let method = methods[0]?.method ?? 'orbis';
      let voice = '';
      let done = false;
      const finish = (val: MixLiveVoice | null): void => {
        if (done) return;
        done = true;
        this.view.pauseListening();
        close();
        resolve(val);
      };
      const box = popupEl.createDiv({ cls: 'orbis-recording-voice' });
      const picker = new VoicePicker(
        box,
        {
          getVoice: () => voice,
          setVoice: (v) => {
            voice = v;
          },
          pauseAudio: () => this.view.pauseListening(),
          getMethod: () => method,
          setMethod: (m) => {
            method = m;
            voice = ''; // new method → let the picker default to its first voice
            void picker.render();
          },
        },
        methods
      );
      void picker.render();
      const footer = actionRow(popupEl, { placement: 'footer' });
      footer.createEl('button', { text: t('action.back') }).addEventListener('click', () => finish(null));
      footer
        .createEl('button', { cls: 'mod-cta', text: t('recordings_modal.mix_add_live') })
        .addEventListener('click', () => {
          if (!voice) return finish(null);
          finish(method === 'system' ? { kind: 'system', voiceURI: voice } : { kind: 'orbis', voiceId: voice });
        });
    });
  }

  /** A tiny name-prompt popup (createOrbisPopup + text field). `placeholder` shows on an empty field;
   *  `value` (rename) prefills it; `confirmLabel` labels the primary button. Resolves the text, or null. */
  private promptText(
    title: string,
    placeholder: string,
    value = '',
    confirmLabel: string = t('recordings_modal.mix_create')
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const { popupEl, close } = createOrbisPopup(this.view, { title, dismissOnOutsideClick: true });
      const box = popupEl.createDiv({ cls: 'orbis-prompt-box' });
      // Create: placeholder only, so blank falls back to the default name (see promptNewMix).
      // Rename: prefilled with the current name.
      const input = new TextComponent(box.createDiv({ cls: 'orbis-gen-voice-control' }))
        .setPlaceholder(placeholder)
        .setValue(value);
      input.inputEl.addClass('orbis-input-full');
      let done = false;
      const finish = (val: string | null): void => {
        if (done) return;
        done = true;
        close();
        resolve(val);
      };
      input.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(input.getValue());
        }
      });
      const btns = actionRow(box, { placement: 'inline' });
      btns.createEl('button', { text: t('action.cancel') }).addEventListener('click', () => finish(null));
      btns
        .createEl('button', { cls: 'mod-cta', text: confirmLabel })
        .addEventListener('click', () => finish(input.getValue()));
      window.setTimeout(() => input.inputEl.focus(), 50);
    });
  }

  /** Confirm + delete a whole item (voice edition's audio, or a mix's pointers — source MP3s kept).
   *  Shared by the library rows, the single-item Delete files line, and the lone-mix footer button.
   *  Afterwards lands on the library (or the record view if nothing remains). */
  private confirmDeleteItem(key: string): void {
    if (this.running) return;
    const e = this.status.editions.find((x) => x.key === key);
    if (!e) return;
    const isMix = e.kind === 'mix';
    confirmThen(
      this.view.app,
      {
        title: t(isMix ? 'recordings_modal.mix_delete_title' : 'recordings_modal.delete_confirm_title'),
        message: isMix
          ? t('recordings_modal.mix_delete_confirm')
          : t('recordings_modal.delete_confirm', { name: this.editionLabel(e) }),
        confirmText: t('action.delete'),
      },
      () => void this.performDeleteItem(key)
    );
  }

  private async performDeleteItem(key: string): Promise<void> {
    this.pauseListeningIfAffected('all');
    this.stopPreview();
    await deleteRecordingEdition(this.view, key);
    if (this.closed) return;
    new Notice(t('recordings_modal.deleted'));
    this.enterListMode(); // refresh falls back to the record view when nothing remains
  }

  /**
   * Which rows this view will let you pick, which is not every row it shows.
   *
   * A normal run offers the ungenerated chapters — a generated one is not re-selectable. A mix offers whatever the
   * chosen source actually has, and everything when the source is a live voice, since a live voice can speak any
   * chapter. Extracted because *Select all* and *Invert* have to agree about it: an invert that flipped rows
   * *Select all* would not take would hand the generator chapters it is about to refuse.
   */
  private selectable(): (s: { index: number; generated: boolean }) => boolean {
    if (this.mode !== 'mix') return (s) => !s.generated;
    const have = this.mixSourceChapters(); // null → a live source: every chapter is assignable
    return (s) => (have ? have.has(s.index) : true);
  }

  /**
   * The three bulk buttons, on the list's own surface — the shared header every other pickable list here uses.
   *
   * **This is the list you work down forty rows of, so it most needs *Invert*.** Through `pickListHeader` it has
   * all three; the strings are the shared ones, so the three buttons cannot drift from the four other lists that
   * draw them.
   *
   * No label or count: the Generate button already carries the number, and a second one two inches away would be
   * the same fact twice. The chapter lists in the export dialogs pass none either.
   */
  private renderSelectionHeader(parent: HTMLElement): void {
    const pick = this.selectable();
    pickListHeader(parent, {
      onSelectAll: () => this.select(pick),
      onClear: () => this.select(() => false),
      // Against a snapshot, because `select` clears the set before it walks the rows — reading `this.selected`
      // inside the predicate would see the cleared one and turn every invert into a select-all.
      onInvert: () => {
        const before = new Set(this.selected);
        this.select((s) => pick(s) && !before.has(s.index));
      },
    });
  }

  /**
   * The chapters this dialog offers, which is not every chapter in the book.
   *
   * **A chapter with no text is not a recording.** Covers, title pages, copyright notices and a converter's blank
   * split files are chapters of the book — the contents panel lists them and ⏮/⏭ visit them — but there is
   * nothing to record, and most books have several. Offered as rows they would be ticked by "Select all", handed
   * to the generator, and counted as failures for producing no audio.
   *
   * Hidden rather than shown disabled: a comic can be 231 of them, and 231 grayed rows is worse than a sentence
   * saying so. A chapter that somehow HAS a recording stays visible whatever the estimate says, so an edition can
   * always be inspected and deleted.
   */
  private recordableRows(): RecordingSectionStatus[] {
    return this.status.sections.filter((s) => s.hasText || s.generated);
  }

  private select(pred: (s: { index: number; generated: boolean }) => boolean): void {
    if (this.running) return;
    this.selected.clear();
    for (const s of this.recordableRows()) if (pred(s)) this.selected.add(s.index);
    this.renderList();
    if (this.mode === 'mix')
      this.renderHeader(); // "Use for selected (N)" count lives in the mix header
    else this.renderFooter();
  }

  /** The edition key to request from the view for the current mode. */
  private requestKey(): string | undefined {
    // While a run is active, always view the recording's edition — the active playback edition is
    // now independent (the user may have changed it in the Listen gear), so don't follow it here.
    if (this.running) return this.view.currentRecordingRunEditionKey() ?? undefined;
    if (this.mode === 'add') return recordingEditionKeyForVoice(this.view, this.runVoice, this.runMethod);
    if (this.mode === 'view' || this.mode === 'mix') return this.selectedKey ?? undefined;
    // First load: a finished run's recording, whose tracks the success panel lists; otherwise the active edition. The
    // header follows the same key in `refresh`, so the two cannot name different recordings.
    return this.finished?.editionKey;
  }

  private async refresh(): Promise<void> {
    if (this.closed) return;
    this.status = await recordingStatus(this.view, this.requestKey());
    if (this.closed) return;

    // First load: mid-run/finished → the run edition's detail (progress / success panel); otherwise
    // always the library list (any item — recording or mix — is opened from there).
    if (this.mode === null) {
      if (this.running || this.finished) {
        // The recording the run wrote into, during it or after it: the one in use is only a fallback, for a result
        // that does not say.
        this.selectedKey =
          (this.running ? this.view.currentRecordingRunEditionKey() : (this.finished?.editionKey ?? null)) ??
          this.status.activeEditionKey ??
          this.status.editions[0]?.key ??
          null;
        this.mode = 'view';
        this.adoptEdition(this.selectedKey);
      } else {
        this.mode = 'list';
      }
    } else if (
      !this.running &&
      (this.mode === 'view' || this.mode === 'mix') &&
      this.selectedKey &&
      !this.status.editions.some((e) => e.key === this.selectedKey)
    ) {
      // The detail item disappeared — return to the library (empty is a valid state now).
      this.mode = 'list';
      this.selectedKey = null;
    }

    // Library rows for the list hub.
    if (this.mode === 'list') this.libraryItems = await recordingLibrary(this.view);

    // Re-default the chapter selection whenever the viewed edition changes (its generated set differs).
    // Mix mode: any chapter is (re)assignable, so don't auto-select or prune "generated" (=assigned).
    // List mode has no chapter selection at all.
    // Add mode uses a stable token (not the per-voice edition key) so switching the prospective voice
    // — including a speaker # change — does NOT wipe the user's manual selection; the default only
    // applies once, on first entering add (enterAddMode resets renderedKey).
    const editionToken = this.mode === 'add' ? '__add__' : this.status.viewedEditionKey;
    if (this.mode !== 'list' && editionToken !== this.renderedKey) {
      this.renderedKey = editionToken;
      this.selected.clear();
      // Add mode records a brand-new voice (existing voices are excluded from the picker), so every
      // chapter is recordable — select all. The status may momentarily reflect an existing edition
      // (the default voice can match one just recorded), but its "generated" flags don't apply here.
      // View mode: only ungenerated chapters are selectable.
      if (this.mode === 'add') for (const s of this.recordableRows()) this.selected.add(s.index);
      else if (this.mode !== 'mix') for (const s of this.recordableRows()) if (!s.generated) this.selected.add(s.index);
    }
    if (this.mode === 'view') {
      // Generated chapters aren't selectable, so keep the selection to ungenerated ones only — e.g.
      // drop the chapters that just finished a run, so "Generate (N)" doesn't keep counting them.
      // (Add mode's prospective voice is always new, so its "generated" flags don't apply.)
      for (const s of this.status.sections) if (s.generated) this.selected.delete(s.index);
    }

    this.renderChrome(); // tailor title + note to the current view
    this.reconcileHeader(); // rebuild the header only if its shape changed (fresh status)
    this.renderSummary();
    this.renderList();
    this.renderFooter();
    this.renderProgress();
  }

  /** "N chapters recorded · size" info line for the viewed voice. Whole-recording deletion lives on
   *  the library row, not here. Hidden while generating / on the finished panel, and when the voice
   *  has no recordings yet. */
  private renderRecorded(): void {
    this.recordedEl.empty();
    // Only in the voice detail (not the library, mix, generating, or finished panel).
    if (this.running || this.finished || this.mode !== 'view') return;
    const genCount = this.status.sections.filter((s) => s.generated).length;
    if (!genCount) return;
    const size = formatBytes(this.status.totalBytes) || '0 MB';
    const line = this.recordedEl.createDiv({ cls: 'orbis-recording-stored' });
    const recorded =
      genCount === 1
        ? t('recordings_modal.recorded_one', { size })
        : t('recordings_modal.recorded', { count: String(genCount), size });
    // A named recording's header says its name, so this line says its voice — nothing else on screen would. An
    // unnamed one's header IS its voice.
    const e = this.status.editions.find((x) => x.key === this.selectedKey);
    const voice = e ? this.voiceLabelFor(e.engine, e.voice) : '';
    line.createSpan({ text: e?.label && e.label !== voice ? `${voice} · ${recorded}` : recorded });
  }

  private renderSummary(): void {
    this.renderRecorded(); // keep the "N chapters recorded" line in sync with every summary render
    this.summaryEl.empty();
    // Persistent "done in …" banner after a run finishes, until the user hits Continue.
    if (this.finished) {
      const failed = this.finished.failed ?? 0;
      const line = this.summaryEl.createDiv({ cls: 'orbis-recording-summary-line orbis-recording-done' });
      /**
       * **A run that recorded nothing does not get a tick.** Every sentence of a chapter can fail — a voice the
       * server rejects, a server that is not there — and a failed chapter is not a done one, so this panel must not
       * say "finished in …" over an empty edition.
       */
      setIcon(line.createSpan({ cls: 'orbis-recording-done-icon' }), failed > 0 ? 'alert-circle' : 'check-circle');
      line.toggleClass('is-failed', failed > 0);
      const time = formatDuration(this.finished.secs);
      line.createSpan({
        text:
          failed > 0
            ? t('recordings_modal.finished_failed', {
                count: String(this.finished.count),
                failed: String(failed),
              })
            : this.finished.count === 1
              ? t('recordings_modal.finished_one', { time })
              : t('recordings_modal.finished', { count: String(this.finished.count), time }),
      });
      if (failed > 0) {
        this.summaryEl.createDiv({
          cls: 'orbis-recording-summary-line orbis-recording-hint',
          text: this.failureText(this.finished.failure),
        });
      }
      return;
    }
    // Live run readout of THIS run's queued chapters (not the whole book) — only while generating.
    if (this.running) {
      const done = this.runProgress?.done ?? this.status.sections.filter((s) => s.generated).length;
      // The fallback counts only what could be recorded — see `recordableRows`. Counting every chapter here would
      // make a fully recorded book read as partial.
      const total = this.runProgress?.total ?? this.recordableRows().length;
      this.summaryEl.createDiv({
        cls: 'orbis-recording-summary-line',
        text: t('recordings_modal.summary', { done: String(done), total: String(total) }),
      });
      /**
       * Paused states its own reason and replaces the keep-open note.
       *
       * A paused run is not doing anything, so telling the reader it continues in the background would be the
       * dialog contradicting itself — and a run that paused on its OWN has to say why, or the stopped progress bar
       * is indistinguishable from a hang.
       */
      if (this.pausedReason) {
        const line = this.summaryEl.createDiv({ cls: 'orbis-recording-summary-line is-paused' });
        setIcon(line.createSpan({ cls: 'orbis-recording-done-icon' }), 'pause-circle');
        line.createSpan({
          text: t(
            this.pausedReason === 'background'
              ? 'recordings_modal.paused_background'
              : this.pausedReason === 'unreachable'
                ? 'recordings_modal.paused_stuck'
                : 'recordings_modal.paused'
          ),
        });
        return;
      }
      // The background note lives here (not on the generate confirm, which stays concise).
      this.summaryEl.createDiv({
        cls: 'orbis-recording-summary-caveat',
        text: t('recordings_modal.confirm_keep_open'),
      });
    }
  }

  private renderList(): void {
    // The list redraws on nearly every action here — a tick, a play, a run finishing — so the keyboard has to be
    // picked back up. The per-chapter checkboxes are keyed below, which is what the restore aims at.
    const restoreFocus = captureFocus(this.listEl);
    this.listEl.empty();
    this.detailSpans.clear();
    this.playBtns.clear();
    // The hub grows with its contents; a track list is a bounded, scrolling box — see the CSS.
    this.listEl.toggleClass('is-hub', this.mode === 'list');
    // Library hub: rows of recordings/mixes, no chapter selection.
    if (this.mode === 'list') {
      // No selection header: the hub's rows are recordings to open, not chapters to tick.
      this.renderLibraryList();
      // **Restored here too.** Opening a detail changes mode, and `landOnDetail` claims the keyboard itself, but
      // choosing what plays redraws the hub in place, so without this the tick you just pressed is destroyed and the
      // keyboard falls back to the top of the list.
      restoreFocus();
      return;
    }
    // While generating (or on the finished panel), narrow the list to just the queued chapters and
    // drop the checkboxes — each row shows a status icon (✓ once done) plus the "Generating… %" /
    // length·size text.
    const runView = this.running || !!this.finished;
    const runFilter = runView && this.runSections ? new Set(this.runSections) : null;
    const offered = this.recordableRows();
    const rows = runFilter ? offered.filter((s) => runFilter.has(s.index)) : offered;
    const skipped = this.status.sections.length - offered.length;
    if (!rows.length) {
      // Every chapter is a cover, a plate or a page of art — a comic, a picture book, an image-driven cookbook.
      // Said plainly, because an empty list with no explanation reads as a fault in the plugin.
      this.listEl.createDiv({
        cls: 'orbis-recording-empty',
        text: skipped ? t('recordings_modal.nothing_to_record') : t('recordings_modal.no_tracks'),
      });
      return;
    }
    // The bulk buttons sit on the list's own surface, above the rows — and only where there is a selection to
    // make: mid-run and on the finished panel the ticks are gone, so buttons that act on them would act on nothing.
    if (!runView) this.renderSelectionHeader(this.listEl);
    const isMix = this.mode === 'mix';
    // In mix mode, a recorded source only offers the chapters it recorded; a live source (null) offers
    // every chapter.
    const sourceHas = isMix ? this.mixSourceChapters() : null;
    for (const s of rows) {
      const row = this.listEl.createDiv({ cls: 'orbis-recording-row' });
      /**
       * **The tick and the chapter share a `<label>`, so the whole line toggles the box.**
       *
       * The same hit area the export dialogs' pick rows have — see `pickRow`. Without it a 16px checkbox would
       * be the only target in a row forty-five deep, which on a phone is a tap you have to aim. The badge and the
       * play button stay OUTSIDE it, or pressing play would also select the chapter.
       */
      const hit = row.createEl('label', { cls: 'orbis-checklist-hit' });
      // A checkbox for selectable chapters — generation: ungenerated only (generated show ✓); mix:
      // every chapter (any can be (re)assigned) but disabled unless the current source has it. The
      // ✓ slot also marks run progress.
      if (!runView && (isMix || !s.generated)) {
        const cb = hit.createEl('input', { cls: 'orbis-checklist-check' });
        cb.dataset.orbisFocus = `chapter:${s.index}`;
        cb.type = 'checkbox';
        const assignable = !isMix || sourceHas === null || sourceHas.has(s.index);
        cb.disabled = !assignable;
        cb.checked = assignable && this.selected.has(s.index);
        if (!assignable) row.addClass('is-unassignable'); // source doesn't have this chapter
        cb.addEventListener('change', () => {
          cb.checked ? this.selected.add(s.index) : this.selected.delete(s.index);
          if (isMix)
            this.renderHeader(); // the "Use for selected (N)" count lives in the mix header
          else this.renderFooter();
        });
      } else {
        const icon = hit.createDiv({ cls: 'orbis-recording-status-icon' });
        if (s.generated) setIcon(icon, 'check'); // ✓ done; blank while pending / generating
      }

      const main = hit.createDiv({ cls: 'orbis-recording-row-main' });
      main.createDiv({
        cls: 'orbis-recording-row-label',
        text: s.label || t('recordings_modal.section_n', { n: String(s.index + 1) }),
      });
      const detail = main.createDiv({ cls: 'orbis-recording-row-detail' });
      this.detailSpans.set(s.index, detail);
      this.renderDetail(s.index);

      // Mix rows carry a RECORDED / LIVE badge of their own: the source-voice name alone doesn't say
      // whether a chapter plays from a file or is narrated in real time, and that's the thing you
      // scan a mix for.
      if (isMix && s.sourceKind) {
        const kind = row.createDiv({ cls: `orbis-recording-row-kind is-${s.sourceKind}` });
        // The glyph, then the word. Forty rows of it in one scroll is where the pair is actually learned — and the
        // word stays because it is the accessible name, which leaves the glyph redundant rather than load-bearing.
        setSvgIcon(
          kind.createSpan({ cls: 'orbis-recording-row-kind-icon' }),
          voiceOriginSvg(s.sourceKind === 'recorded')
        );
        kind.createSpan({
          text: t(s.sourceKind === 'recorded' ? 'recordings_modal.kind_recorded' : 'recordings_modal.kind_live'),
        });
      }

      const actions = row.createDiv({ cls: 'orbis-recording-row-actions' });
      // A live chapter has no file, but ▶ still means something: hear its opening sentence in the
      // voice the mix assigns it. Not offered mid-run, where the list is a progress report.
      const canPreviewLive = isMix && !runView && s.sourceKind === 'live';
      if (s.generated || canPreviewLive) {
        const play = actions.createEl('button', {
          cls: 'orbis-recording-row-play',
          attr: { 'aria-label': t(canPreviewLive ? 'recordings_modal.play_live' : 'recordings_modal.play') },
        });
        this.playBtns.set(s.index, play);
        play.addEventListener('click', () => void this.togglePreview(s.index));
        // No per-chapter delete in mix mode — a mix only points at a source's file, it doesn't own it.
        if (!runView && !isMix) {
          const del = actions.createEl('button', {
            cls: 'orbis-recording-row-del',
            attr: { 'aria-label': t('recordings_modal.delete_track') },
          });
          setIcon(del, 'trash');
          // Can't empty an edition from its detail — the last recording is deleted as a whole item
          // (library row / the single-item Delete files line), so an in-detail edition stays non-empty.
          if (this.status.sections.filter((x) => x.generated).length <= 1) {
            del.disabled = true;
            del.setAttribute('aria-label', t('recordings_modal.delete_track_last'));
          } else {
            const track = s.label || t('recordings_modal.section_n', { n: String(s.index + 1) });
            del.addEventListener('click', () => this.confirmDeleteChapter(s.index, track));
          }
        }
      }
    }
    // What the list is not showing, and why — one line rather than a screen of unusable rows.
    if (skipped > 0 && !runView) {
      this.listEl.createDiv({
        cls: 'orbis-recording-list-note',
        text:
          skipped === 1
            ? t('recordings_modal.no_text_tracks_one')
            : t('recordings_modal.no_text_tracks', { count: String(skipped) }),
      });
    }
    this.updatePlayButtons();
    restoreFocus();
  }

  /**
   * The library hub: one row per recording / mix — a tick to make it the one that plays, the row to open its
   * detail, trash to delete the whole item. Whole-item lifecycle (delete) lives here, not in the detail.
   *
   * **The tick column is why this list is not read-only.** Which recording plays is also set by a dropdown inside
   * Voice and source, but the dialog named after recordings has to show which one you are listening to. The option
   * set here is that dropdown's, "None" included, because they write the same stored value; two paths to one
   * setting is fine, two answers would not be.
   */
  private renderLibraryList(): void {
    if (!this.libraryItems.length) {
      this.listEl.createDiv({ cls: 'orbis-recording-empty', text: t('recordings_modal.lib_empty') });
      return;
    }
    this.renderPickRow(null, !this.libraryItems.some((i) => i.active), t('voice_and_source.none_option'));
    for (const item of this.libraryItems) {
      const row = this.listEl.createDiv({ cls: `orbis-recording-lib-row${item.active ? ' is-current' : ''}` });
      this.addPickButton(row, item.key, item.active, item.label);
      const open = row.createEl('button', { cls: 'orbis-recording-lib-open' });
      // Keyed by the item, so Back from its detail returns the keyboard to this row — see `enterListMode`.
      open.dataset.orbisFocus = `item:${item.key}`;
      open.addEventListener('click', () => this.openEditionDetail(item.key));
      const text = open.createDiv({ cls: 'orbis-recording-lib-text' });
      text.createDiv({ cls: 'orbis-recording-lib-name', text: item.label });
      const coverage = t('recordings_modal.lib_coverage', { done: String(item.count), total: String(item.total) });
      // A named recording says its voice first, since its name no longer does (`RecordingLibraryItem.voice`).
      const detail = item.kind === 'voice' ? [item.voice, coverage, formatBytes(item.bytes) || '0 MB'] : [coverage];
      text.createDiv({ cls: 'orbis-recording-lib-detail', text: detail.filter(Boolean).join(' · ') });
      // Type badge in its own fixed-width column so badges left-align uniformly + center vertically.
      const tagcol = open.createDiv({ cls: 'orbis-recording-lib-tagcol' });
      tagcol.createSpan({
        cls: `orbis-recording-lib-tag is-${item.kind}`,
        text: t(item.kind === 'mix' ? 'recordings_modal.tag_mix' : 'recordings_modal.tag_voice'),
      });
      /**
       * A pencil that OPENS the item — the same affordance, and the same job, as the pencil on the Library's
       * field rows: it says "there is something in here you can change" and takes you to where you change it.
       * Not a rename: either kind is renamed by the pencil in its own header, once you are inside it.
       *
       * It duplicates the row's own tap target on purpose, which is why the row keeps working: the target is the
       * separate full-width button beside this, and both trailing buttons stop propagation.
       */
      const edit = row.createEl('button', {
        cls: 'orbis-recording-lib-act',
        attr: { 'aria-label': t('lookup_page.edit') },
      });
      setIcon(edit, 'pencil');
      edit.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditionDetail(item.key);
      });
      const del = row.createEl('button', {
        cls: 'orbis-recording-lib-act',
        attr: { 'aria-label': this.running ? t('recordings_modal.delete_while_recording') : t('action.delete') },
      });
      setIcon(del, 'trash');
      del.disabled = this.running; // not while a run writes files — the label says so, as nothing else does
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmDeleteItem(item.key);
      });
    }
  }

  /**
   * The "None — use the live voice" row: the same geometry as an item row so the ticks line up, and nothing
   * trailing it, because there is no such thing to open or delete. Its whole width selects.
   */
  private renderPickRow(key: string | null, current: boolean, label: string): void {
    const row = this.listEl.createDiv({ cls: `orbis-recording-lib-row is-none${current ? ' is-current' : ''}` });
    this.addPickButton(row, key, current, label);
    const open = row.createEl('button', { cls: 'orbis-recording-lib-open' });
    open.createDiv({ cls: 'orbis-recording-lib-text' }).createDiv({ cls: 'orbis-recording-lib-name', text: label });
    open.addEventListener('click', () => void this.useEdition(key));
  }

  /**
   * The leading tick: press it and this is what plays.
   *
   * `aria-pressed` rather than `role="radio"`, deliberately. These buttons are mutually exclusive, but they sit in
   * rows that also carry a pencil and a trash — and a `radiogroup` whose children include those is a lie about the
   * structure. A pressed toggle is what a screen reader is actually looking at, and it is the same shape the
   * display menu's option buttons use.
   */
  private addPickButton(row: HTMLElement, key: string | null, current: boolean, label: string): void {
    const pick = row.createEl('button', {
      cls: 'orbis-recording-lib-pick',
      attr: {
        'aria-label': `${t('recordings_modal.use_for_listening')}: ${label}`,
        'aria-pressed': String(current),
        // Keyed so a re-render after the switch puts the keyboard back on the row just chosen, not on the list.
        'data-orbis-focus': `pick:${key ?? '__none__'}`,
      },
    });
    pick.title = t('recordings_modal.use_for_listening');
    // A character, not an icon, so an unticked row is exactly as tall as a ticked one — the same reason the
    // rating dialog's pick list uses one.
    pick.createSpan({ cls: 'orbis-recording-lib-tick', text: current ? '✓' : '' });
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!current) void this.useEdition(key);
    });
  }

  /** Make `key` the recording that plays — or the live voice, when it is null. Re-seats a live session either way
   *  (both helpers call `reloadPlayback`), so switching while listening takes effect on the next chapter load. */
  private async useEdition(key: string | null): Promise<void> {
    if (key) await setActiveRecordingEdition(this.view, key);
    else await clearActiveRecordingEdition(this.view);
    await this.refresh();
  }

  private renderDetail(index: number): void {
    const el = this.detailSpans.get(index);
    if (!el) return;
    if (this.active && this.active.index === index) {
      const pct = this.active.total ? Math.round((this.active.done / this.active.total) * 100) : 0;
      el.setText(t('recordings_modal.status_generating', { pct: String(pct) }));
      el.className = 'orbis-recording-row-detail is-active';
      return;
    }
    const s = this.status.sections.find((x) => x.index === index);
    if (!s) return;
    if (this.mode === 'mix') {
      // Every chapter has a source voice (unassigned = the default live voice) + a length.
      el.setText(`${s.sourceVoice ?? ''} · ${formatDuration(s.durationSec)}`);
      el.className = 'orbis-recording-row-detail';
      return;
    }
    const tilde = s.estimated ? '~' : '';
    el.setText(`${tilde}${formatDuration(s.durationSec)} · ${tilde}${formatBytes(s.fileBytes) || '0 MB'}`);
    el.className = s.estimated ? 'orbis-recording-row-detail is-est' : 'orbis-recording-row-detail';
  }

  private renderProgress(): void {
    this.progressEl.empty();
    if (!this.running) return;
    const label = this.active
      ? t('recordings_modal.progress_active', {
          label: this.status.sections.find((s) => s.index === this.active?.index)?.label ?? '',
          done: String(this.active.done),
          total: String(this.active.total || '…'),
        })
      : t('recordings_modal.progress_starting');
    this.progressEl.createDiv({ cls: 'orbis-recording-progress-label', text: label });
  }

  private continueFromFinished(): void {
    this.finished = null;
    this.runSections = null;
    this.runProgress = null;
    this.enterListMode(); // after a run, return to the library hub — not the recording's detail
  }

  private renderFooter(): void {
    // The buttons here redraw this row — ticking a chapter changes what the primary one says — so the keyboard has to
    // be picked back up. Keyed below, since the set of buttons changes with the panel.
    const restoreFocus = captureFocus(this.footerEl);
    this.footerEl.empty();
    // Finished panel: a single Continue button returns to the list.
    if (this.finished) {
      const cont = this.footerEl.createEl('button', { text: t('recordings_modal.continue'), cls: 'mod-cta' });
      cont.dataset.orbisFocus = 'footer:continue';
      cont.addEventListener('click', () => this.continueFromFinished());
    } else if (this.mode === 'list') {
      // Library hub: add a recording / mix, and Close. (Item deletion is on the rows.) A mix can be
      // all-live, so Add mix is always offered — no recording required first.
      const addVoice = this.footerEl.createEl('button', { text: t('recordings_modal.add_voice') });
      addVoice.dataset.orbisFocus = 'footer:add-voice';
      addVoice.addEventListener('click', () => this.enterAddMode());
      const addMix = this.footerEl.createEl('button', { text: t('recordings_modal.add_mix') });
      addMix.dataset.orbisFocus = 'footer:add-mix';
      addMix.addEventListener('click', () => void this.promptNewMix());
      const shut = this.footerEl.createEl('button', { text: t('action.close') });
      shut.dataset.orbisFocus = 'footer:close';
      shut.addEventListener('click', () => this.close());
    } else if (this.mode === 'mix') {
      // Mix detail: no footer actions — Back (header) leaves, ✕ closes, assignment is the Source bar,
      // and the whole-mix delete lives on the library row (a lone mix lands on the library too).
    } else if (this.running) {
      // Generating: Close backgrounds the run (floating chip reopens); Pause holds it; Stop ends it.
      const bg = this.footerEl.createEl('button', { text: t('action.close') });
      bg.dataset.orbisFocus = 'footer:close';
      bg.addEventListener('click', () => this.close());
      // Pause keeps everything recorded so far and asks for nothing back; Stop discards the open track. So it
      // needs no confirm, and unlike Stop it is the safe one of the two — hence no warning styling.
      const paused = this.view.isRecordingPaused();
      const hold = this.footerEl.createEl('button', {
        text: t(paused ? 'recordings_modal.resume' : 'recordings_modal.pause'),
      });
      hold.dataset.orbisFocus = 'footer:pause';
      hold.addEventListener('click', () => {
        if (this.view.isRecordingPaused()) this.view.resumeRecording();
        else this.view.pauseRecording();
        void this.refresh(); // the button is a toggle; the phase event repaints the readout
      });
      const stop = this.footerEl.createEl('button', { text: t('recordings_modal.stop'), cls: 'mod-warning' });
      stop.dataset.orbisFocus = 'footer:stop';
      stop.addEventListener('click', () => this.confirmStop());
    } else {
      // Recording detail (idle): just Generate — Back (header) / ✕ dismiss, so no redundant Cancel.
      const gen = this.footerEl.createEl('button', {
        text: t('recordings_modal.generate', { n: String(this.selected.size) }),
        cls: 'mod-cta',
      });
      gen.dataset.orbisFocus = 'footer:generate';
      gen.disabled = this.selected.size === 0;
      gen.addEventListener('click', () => this.requestGenerate());
    }
    this.footerEl.toggle(this.footerEl.childElementCount > 0); // hide an empty footer (e.g. a mix)
    restoreFocus();
  }

  /** Pause the reader's Listen player if it's on one of these chapters, so regenerating or deleting
   *  doesn't swap/remove the MP3 + manifest it's reading. No-op when paused or on an unaffected one. */
  private pauseListeningIfAffected(sections: readonly number[] | 'all'): void {
    const activeSec = this.view.listeningSectionIndex();
    if (activeSec == null) return;
    if (sections === 'all' || sections.includes(activeSec)) this.view.pauseListening();
  }

  /** Gate every generation with a confirm — the run is blocking and can take a long time. Shows the
   *  chapter count + voice, a rough time estimate when we have samples (else a generic warning), and
   *  what it will cost. `cta` because recording is what pressing Generate meant — this dialog slows the tap down
   *  to state the price, it does not try to talk the reader out of it — and `destructive: false` because nothing
   *  is being lost. */
  private requestGenerate(): void {
    if (!this.selected.size) return;
    void this.voiceReadyForRun().then((ready) => {
      if (ready) this.confirmGenerate();
    });
  }

  /**
   * An on-device voice is on this device before a run starts — asked for, never fetched unasked.
   *
   * Recording loads its Piper voice when the run begins, and a model that is not on disk was downloaded there, 60 MB
   * inside a Generate that said nothing about it. So the reader is asked first, with the prompt listening uses; the
   * picker above has its own Download button for the same voice. A server voice has nothing to download.
   */
  private async voiceReadyForRun(): Promise<boolean> {
    if (this.runMethod !== 'piper') return true;
    const voice = orbisVoiceById(splitPiperVoice(this.runVoice).id);
    if (!voice) return true;
    const dir = `${this.view.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
    if (await isOrbisVoiceDownloaded(this.view.app.vault.adapter, dir, voice.path)) return true;
    return orbisVoiceAsker(this.view.app, dir)(voice);
  }

  private confirmGenerate(): void {
    const sections = [...this.selected].sort((a, b) => a - b);
    if (!sections.length) return;
    const voice = this.genVoiceLabel(); // what the run will actually use (not a stale viewed edition)
    const est = this.view.estimateGenerationSeconds(sections);
    confirmThen(
      this.view.app,
      {
        title: t('recordings_modal.confirm_title'),
        message: [
          sections.length === 1
            ? t('recordings_modal.confirm_count_one', { voice })
            : t('recordings_modal.confirm_count', { count: String(sections.length), voice }),
          est != null
            ? t('recordings_modal.confirm_estimate', { time: formatDuration(est) })
            : t('recordings_modal.confirm_no_estimate'),
        ],
        confirmText: t('recordings_modal.confirm_go'),
        cta: true,
        destructive: false,
      },
      () => void this.onGenerate()
    );
  }

  private async onGenerate(): Promise<void> {
    const sections = [...this.selected].sort((a, b) => a - b);
    if (!sections.length) return;
    const voice = this.runVoice;
    /**
     * **The edition being extended, captured BEFORE anything below moves the selection.**
     *
     * An existing recording states its own engine, model and voice; adding a chapter to it must use those, not the
     * current default or this dialog's toggle. Read here because `selectedKey` is reassigned a few lines down for the
     * header, and reading it after that gives the identity of the run rather than of the thing being extended.
     */
    const target = this.status.editions.find((e) => e.key === this.selectedKey && e.kind !== 'mix');
    this.pauseListeningIfAffected(sections);
    this.stopPreview();
    this.running = true;
    this.active = null;
    this.runSections = sections;
    this.runProgress = { done: 0, total: sections.length };
    // View the edition we're generating from the start (it's created immediately), so the header
    // shows that voice as a static line — not the add-voice picker.
    this.mode = 'view';
    // The edition being extended keeps its own key; a new one takes the key its voice and method imply.
    this.selectedKey = target?.key ?? recordingEditionKeyForVoice(this.view, voice, this.runMethod);
    this.reconcileHeader();
    this.renderSummary();
    this.renderList();
    this.renderFooter();
    this.renderProgress();
    /**
     * **The keyboard follows the button through the change it caused.**
     *
     * Generate was pressed (in the confirm this run came from), and starting the run replaces it with Stop — so there
     * is nothing left for the confirm's own focus return to land on, and the keyboard would fall on the document.
     * Stop is what took Generate's place in the footer, so it is where the reader now is. Only from the floor: a
     * reader who has already tabbed on, or clicked something, keeps where they are.
     */
    const stop = this.footerEl.querySelector<HTMLElement>('[data-orbis-focus="footer:stop"]');
    if (stop) {
      const doc = stop.ownerDocument;
      // The dialog frame counts as the floor here. `createOrbisPopup` catches a lost keyboard on the surface itself,
      // and both claims are scheduled for the same tick — so a named successor has to be allowed to take it from the
      // frame, or the general net always wins and nobody lands on the button that did the work.
      const frame = this.footerEl.closest('.orbis-popup');
      claimFocusSoon(stop, () => {
        const now = doc.activeElement;
        return now === null || now === doc.body || now === frame;
      });
    }
    // `finally`, so the dialog cannot be left in its running state by a failure. It is started with
    // `void onGenerate()`, so anything that escapes `startRecording` would otherwise be an unhandled rejection —
    // leaving the progress line reading "Starting…" for ever, with no error anywhere.
    try {
      /**
       * **Extending a recording uses that recording's engine and voice.**
       *
       * An existing edition states its own engine, model and voice, and adding a chapter to it is not an occasion to
       * consult the current default or this dialog's toggle — a server synth extending a Piper recording rejects
       * every sentence. Only a NEW edition takes the dialog's choice, where there is nothing to inherit.
       */
      await this.view.startRecording(
        sections,
        target
          ? { edition: { engine: target.engine, model: target.model, voice: target.voice } }
          : { voice, method: this.runMethod }
      ); // resolves when the run ends/cancels
    } finally {
      if (!this.closed) {
        this.running = false;
        this.active = null;
        // The terminal run-done / cancelled event (onProgress) drives the finished panel or the return
        // to the list. Only fall back to a refresh here if no terminal event set that up.
        if (!this.finished) {
          this.runSections = null;
          void this.refresh();
        }
      }
    }
  }

  private onProgress(p: GenProgress): void {
    if (this.closed) return;
    this.runProgress = { done: p.chaptersDone, total: p.chaptersTotal }; // run-scoped, survives reopen
    if (p.phase === 'chapter-start') {
      this.running = true;
      this.active = { index: p.chapterIndex ?? -1, done: 0, total: 0 };
      this.renderSummary();
      this.renderList();
      this.renderFooter();
    } else if (p.phase === 'chapter-progress') {
      // Adopt the in-flight chapter if we don't have it yet (e.g. reopened mid-chapter) or it changed.
      if (!this.active || this.active.index !== p.chapterIndex) {
        this.active = { index: p.chapterIndex ?? -1, done: 0, total: 0 };
        this.renderSummary();
        this.renderList();
        this.renderFooter();
      }
      this.active.done = p.sentenceDone ?? 0;
      this.active.total = p.sentenceTotal ?? 0;
      this.renderDetail(this.active.index);
    } else if (p.phase === 'paused' || p.phase === 'resumed') {
      // Run-level, mid-chapter: the readout and the list are unchanged, only the state line and the Pause/Resume
      // button. A run that paused ITSELF says why — a pause nobody asked for reads as a hang otherwise.
      this.pausedReason = p.phase === 'paused' ? (p.pausedReason ?? 'user') : null;
      this.renderSummary();
      this.renderFooter();
      // Only for the pause that needs a tap. A background WAIT lifts itself the moment the app is back — which
      // is before the reader could read a notice about it — so announcing it would be noise about nothing.
      if (p.phase === 'paused' && p.pausedReason === 'unreachable')
        new Notice(t('notices.recording_paused_background'), 8000);
    } else if (p.phase === 'chapter-done') {
      void this.refresh(); // pick up the new file size for the finished chapter
    } else if (p.phase === 'run-done') {
      // Show the persistent "done in …" panel (keeps the checkmarked run list) until Continue.
      this.running = false;
      this.active = null;
      this.finished = {
        count: p.chaptersDone,
        secs: Math.round((p.elapsedMs ?? 0) / 1000),
        failed: p.chaptersFailed,
        failure: p.failure,
      };
      this.reconcileHeader();
      this.renderSummary();
      this.renderList();
      this.renderFooter();
      return;
    } else if (p.phase === 'cancelled') {
      this.running = false;
      this.active = null;
      this.runProgress = null;
      this.runSections = null;
      this.finished = null;
      void this.refresh();
      return;
    }
    this.renderProgress();
  }

  // ── Chapter preview playback ──
  private async togglePreview(index: number): Promise<void> {
    if (this.previewIndex === index) {
      // A recorded chapter pauses and resumes; a live preview is one synthesized utterance with no
      // seek — the second tap can only stop it.
      if (this.previewAudio) {
        if (this.previewAudio.paused) void this.previewAudio.play();
        else this.previewAudio.pause();
        this.updatePlayButtons();
        return;
      }
      if (this.previewSpeech || this.previewPending) {
        this.stopPreview();
        this.updatePlayButtons();
        return;
      }
    }
    // Silence everything else before starting: another chapter preview, the voice-sample preview,
    // and the book audio — only one thing plays at a time.
    this.stopPreview();
    this.picker?.stopPreview();
    this.view.pauseListening();
    const section = this.status.sections.find((x) => x.index === index);
    if (this.mode === 'mix' && section?.sourceKind === 'live') {
      await this.previewLiveChapter(index);
      return;
    }
    const chapter = await loadRecordingChapter(this.view, index, this.status.viewedEditionKey ?? undefined);
    if (this.closed || !chapter) return;
    this.previewUrl = chapter.audioUrl;
    this.previewIndex = index;
    const audio = new Audio(chapter.audioUrl);
    this.previewAudio = audio;
    audio.addEventListener('ended', () => {
      this.stopPreview();
      this.updatePlayButtons();
    });
    void audio.play();
    this.updatePlayButtons();
  }

  /** Speak a live chapter's opening sentence. Kept in a pending state until audio is actually under
   *  way — a cold Piper voice loads its model first, which can take seconds on a phone. */
  private async previewLiveChapter(index: number): Promise<void> {
    this.previewIndex = index;
    this.previewPending = true;
    this.updatePlayButtons();
    try {
      const handle = await this.view.previewLiveChapter(index, this.status.viewedEditionKey ?? undefined, () => {
        this.stopPreview();
        this.updatePlayButtons();
      });
      // Stopped or dismissed while the model loaded — the utterance is already unwanted.
      if (this.closed || this.previewIndex !== index || !this.previewPending) {
        handle.stop();
        return;
      }
      this.previewSpeech = handle;
    } catch (e) {
      if (this.previewIndex === index) this.previewIndex = null;
      if (!this.closed && !(e instanceof VoiceNotHereError)) new Notice(t('recordings_modal.preview_failed'));
      console.error('orbis: live chapter preview failed', e);
    } finally {
      this.previewPending = false;
      this.updatePlayButtons();
    }
  }

  private stopPreview(): void {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.removeAttribute('src');
      this.previewAudio.load();
    }
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
    this.previewSpeech?.stop();
    this.previewSpeech = null;
    this.previewPending = false; // an in-flight live preview discards itself when it sees this
    this.previewAudio = null;
    this.previewIndex = null;
  }

  private updatePlayButtons(): void {
    const audioPlaying = (i: number): boolean =>
      this.previewIndex === i && !!this.previewAudio && !this.previewAudio.paused;
    for (const [index, btn] of this.playBtns) {
      if (this.previewIndex === index && this.previewPending) setIcon(btn, 'loader');
      else if (this.previewIndex === index && this.previewSpeech) setIcon(btn, 'square');
      else setIcon(btn, audioPlaying(index) ? 'pause' : 'play');
      btn.toggleClass('is-pending', this.previewIndex === index && this.previewPending);
    }
  }

  /**
   * Ask before deleting one track's audio. A track can be an hour of recording, and getting it back means recording it
   * again for as long as it took the first time — the same reason a whole recording asks.
   */
  private confirmDeleteChapter(index: number, track: string): void {
    confirmThen(
      this.view.app,
      {
        title: t('recordings_modal.delete_track_title'),
        message: t('recordings_modal.delete_track_confirm', { track }),
        confirmText: t('action.delete'),
      },
      () => void this.deleteChapter(index)
    );
  }

  private async deleteChapter(index: number): Promise<void> {
    if (this.previewIndex === index) this.stopPreview();
    this.pauseListeningIfAffected([index]);
    await deleteRecordingChapter(this.view, index, this.status.viewedEditionKey ?? undefined);
    if (this.closed) return;
    new Notice(t('recordings_modal.deleted'));
    await this.refresh();
  }

  /** Confirm before stopping a run — the current chapter is discarded, but finished chapters stay. Its way out
   *  is "Keep recording" rather than Cancel, which is the one word that would be ambiguous here: cancelling is
   *  what the other button does. */
  private confirmStop(): void {
    confirmThen(
      this.view.app,
      {
        title: t('recordings_modal.stop_confirm_title'),
        message: t('recordings_modal.stop_confirm'),
        confirmText: t('recordings_modal.stop'),
        cancelText: t('recordings_modal.stop_keep'),
      },
      () => this.view.cancelRecording()
    );
  }
}
