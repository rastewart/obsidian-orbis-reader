// Generating a recording: starting a run, reporting it, and stopping it.
//
// **The other half of the recording feature.** `recording-library.ts` answers what already exists; this owns a run
// in flight — the generator, the progress the management modal observes, the floating chip that reports it while
// that modal is closed, and the edition key that stops an unfinished run being pruned.
//
// Separate from `recording-library.ts` because it holds mutable state and a notice-and-cancel lifecycle, and it
// wants a wider surface than that module does — five members beyond `ReaderContext` — but the view is not the right
// owner for any of them.

import { Notice, setIcon } from 'obsidian';
import { type ChapterPart } from '../../book-chapters';
import { t } from '../../i18n';
import { bookWindowFree } from '../../OrbisModal';
import { bookAudioFolderPath } from '../../progress';
import type { RawSection } from '../foliate-view';
import type { ReaderContext } from '../ReaderContext';
import { type GenConfig, genIdentity, readGenConfig } from './gen-config';
import { recordGenSample } from './gen-timing';
import { createPiperGenerator } from './PiperEngine';
import type { Pronouncer } from './pronunciations';
import { type ChapterSynth, createPiperSynth, createServerSynth, type SynthFailure } from './recording';
import { editionDir, editionKey, pruneEmptyEditions, upsertEdition } from './recording-editions';

/** What a finished run reports on the dialog's panel: tracks recorded, how long, and any that produced nothing. */
export interface FinishedRun {
  count: number;
  secs: number;
  failed?: number;
  failure?: SynthFailure | null;
  /**
   * The recording the run wrote into, which the panel has to show — not the one in use. They differ whenever a
   * chapter is recorded in a voice other than the selected one, and the panel then reported the new track's count
   * under the other recording's name and tracks.
   */
  editionKey?: string;
}

import { type GenProgress, RecordingGenerator } from './recording-generator';
import { orbisVoiceOrDefault, splitPiperVoice } from './voice-catalog';
import { describeEditionVoice } from './voice-providers';

/** How often a finished run checks whether the book's window is free — the interval the waiting prompts use. */
const FINISHED_RECHECK_MS = 2500;

/**
 * What a run needs beyond `ReaderContext`, which already carries the vault, the open file, `contentEl`,
 * `bookSections`, `bookCover` and `debug`.
 *
 * Five, and they divide into two kinds: what the audio should SOUND like (the compiled respellings), and what the
 * book is (its chapter shape, its word counts, its title and author for the MP3 tags).

 */
export interface RecordingRunHost {
  pronouncer(): Pronouncer | null;
  chapterParts(): readonly ChapterPart[];
  chapterWords(): readonly number[];
  bookTitle(): string;
  bookAuthor(): string;
  /**
   * Open the management modal.
   *
   * A run reports into it while it is open and into a floating chip while it is not — and when a run finishes
   * with it closed, or the chip is tapped, it comes back. The modal takes the reader view itself, which is why
   * this is a call back to the host rather than something a run does for itself.
   */
  showRecordingsModal(): void;
}

/** A recording run in flight. */
export class RecordingRun {
  private recordingGen: RecordingGenerator | null = null;
  /** Progress observer (the open management modal), or null → progress falls back to notices. */
  private recordingProgress: ((p: GenProgress) => void) | null = null;
  /** Latest generation progress, so a floating chip can show it while the modal is closed. */
  private recordingGenProgress: GenProgress | null = null;
  /** The floating "Recording…" chip shown while generating with the modal closed (tap to reopen). */
  private recordingChip: HTMLElement | null = null;
  /** Result of the last run that finished while the modal was closed, so reopening shows the success
   *  panel once (consumed on read). */
  private recordingLastRun: FinishedRun | null = null;
  /** A finished run waiting for the book's window to be free, with what the chip says meanwhile — see
   *  `offerFinishedRun`. Null when nothing is waiting. */
  private finishedWaiting: { done: number; total: number } | null = null;
  private finishedTimer: number | null = null;
  /** Edition key of the in-progress run, so empty-edition pruning skips it before ch1 lands. */
  private recordingRunKey: string | null = null;
  /** Section indices queued in the in-progress run, so a reopened modal narrows its list to them. */
  private recordingRunSections: number[] | null = null;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: RecordingRunHost
  ) {}

  /** The book closed — stop anything generating and drop the chip with it. */
  dispose(): void {
    this.recordingGen?.cancel();
    this.recordingGen = null;
    this.stopWaitingForBook();
    this.recordingChip?.remove();
    this.recordingChip = null;
  }

  /** The edition a run is writing into, for `RecordingLibraryCtx.activeRunKey`. */
  activeRunKey(): string | null {
    return this.recordingRunKey;
  }

  /**
   * Record these sections.
   *
   * **An existing recording is recorded into on ITS terms.** `edition` is what the reader is adding chapters to, and
   * it already states its engine, model and voice — so nothing about the current default, or the dialog's method
   * toggle, has any business in that decision: it should not matter which engine is default. Adding one chapter to a
   * Piper recording while the saved default is the server would otherwise build a server synth and POST Piper voice
   * ids to it — 400 on every sentence, and an empty chapter.
   *
   * `voice`/`method` are for a NEW edition, where there is nothing to inherit and the dialog's own choice is the
   * answer.
   */
  async startRecording(
    chapterIndices: number[],
    run: {
      voice?: string;
      method?: GenConfig['method'];
      edition?: { engine: string; model: string; voice: string };
    } = {}
  ): Promise<void> {
    const file = this.ctx.currentFile;
    if (!file) {
      new Notice(t('notices.recording_no_book'));
      return;
    }
    if (this.recordingGen?.isRunning()) {
      new Notice(t('notices.recording_already'));
      return;
    }
    if (!chapterIndices.length) {
      new Notice(t('notices.recording_nothing_to_do'));
      return;
    }
    // A new run supersedes the last one's result still waiting to be shown.
    this.stopWaitingForBook();
    const base = bookAudioFolderPath(file);
    const startedAt = Date.now();
    let lastSentenceNotice = 0;
    // One edition = one voice. Register (or refresh) the edition for this voice, make it active, and
    // generate into its own folder — so a second voice becomes a separate edition, never a mixed one.
    // The edition's own identity when extending one; otherwise the run's choice — see the note above.
    const { engine, model, voice } = run.edition ?? genIdentity(run.voice, run.method);
    // The method follows the identity, so the synth cannot disagree with the voice it is given.
    const method: GenConfig['method'] = engine === 'piper-ondevice' ? 'piper' : 'server';
    const key = editionKey(engine, model, voice);
    // Step markers, because the dialog says "Starting…" for everything up to the first finished sentence —
    // registering the edition, building the synth, fetching the cover, then the generator's own work. Any one
    // of those hanging looks the same from outside, and only the last of them logs anything of its own.
    const recLog = (m: string): void => this.ctx.debug(`[recording] ${m}`, 'tts');
    recLog(`start: ${chapterIndices.length} chapter(s) · ${engine} · ${model} · ${voice}`);
    // Guarded like the synth build below it. `startRecording` is called as `void onGenerate()`, so an unguarded
    // rejection here would go unhandled, the modal would never leave its running state, and "Starting…" would be
    // all anyone ever saw.
    try {
      await upsertEdition(this.ctx.app, base, { engine, model, voice, createdAt: startedAt });
    } catch (e) {
      recLog(`edition registration failed: ${String(e)}`);
      new Notice(t('notices.recording_failed'));
      return;
    }
    recLog(`edition registered (${Date.now() - startedAt}ms)`);
    const audioDir = editionDir(base, key);
    this.recordingRunKey = key; // protect this edition from empty-edition pruning until it has chapters
    this.recordingRunSections = [...chapterIndices]; // so a reopened modal narrows its list to this run

    // Build the per-sentence synthesizer for the chosen method (Piper warms a worker + downloads the
    // model here, which can take a moment). A failure aborts before the run starts.
    let synth: ChapterSynth;
    try {
      synth = await this.buildRecordingSynth(voice, method, model);
    } catch (e) {
      this.ctx.debug(`[recording] synth init failed: ${String(e)}`, 'tts');
      new Notice(t('notices.recording_failed'));
      return;
    }
    recLog(`synth ready (${Date.now() - startedAt}ms)`);

    // Book-level ID3 metadata for the generated MP3s (fetched once for the whole run).
    const coverBlob = await this.ctx.bookCover().catch(() => null);
    const coverData = coverBlob ? await coverBlob.arrayBuffer().catch(() => null) : null;
    recLog(`cover ${coverData ? `${coverData.byteLength}B` : 'none'} (${Date.now() - startedAt}ms)`);

    const chapters = this.host.chapterParts();
    const chapterWords = this.host.chapterWords();
    this.recordingGen = new RecordingGenerator({
      app: this.ctx.app,
      sections: this.ctx.bookSections as unknown as RawSection[],
      chapters,
      audioDir,
      bookBasename: file.basename,
      synth,
      engineKind: engine,
      voice,
      model,
      bookTitle: this.host.bookTitle(),
      bookAuthor: this.host.bookAuthor(),
      voiceLabel: describeEditionVoice(engine, voice),
      coverData,
      trackTotal: chapters.length,
      chapterTitle: (i) => chapters[i]?.label ?? '', // the contents label, Part-disambiguated
      log: recLog,
      onProgress: (p) => {
        // Record generation speed (seconds/word) for future estimates — regardless of observer.
        if (p.phase === 'chapter-done' && p.chapterIndex != null && p.elapsedMs) {
          recordGenSample(engine, model, chapterWords[p.chapterIndex] ?? 0, p.elapsedMs);
        }
        // Track the latest progress for the floating chip (cleared on terminal phases).
        this.recordingGenProgress = p.phase === 'run-done' || p.phase === 'cancelled' ? null : p;
        if (this.recordingProgress) {
          this.recordingProgress(p); // the modal is observing — it shows progress inline
          this.refreshRecordingIndicator(); // (no chip while the modal is open)
          return;
        }
        this.refreshRecordingIndicator(); // modal closed → the chip mirrors progress
        // No observer (modal closed): keep the user informed with notices.
        if (p.phase === 'chapter-start') {
          lastSentenceNotice = 0;
          new Notice(
            t('notices.recording_chapter_start', {
              n: String(p.chaptersDone + 1),
              total: String(p.chaptersTotal),
              label: p.chapterLabel ?? '',
            })
          );
        } else if (p.phase === 'chapter-progress' && p.sentenceDone && p.sentenceTotal) {
          if (p.sentenceDone === p.sentenceTotal || p.sentenceDone - lastSentenceNotice >= 25) {
            lastSentenceNotice = p.sentenceDone;
            new Notice(
              t('notices.recording_progress', { done: String(p.sentenceDone), total: String(p.sentenceTotal) })
            );
          }
        } else if (p.phase === 'run-done') {
          const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
          new Notice(t('notices.recording_run_done', { count: String(p.chaptersDone), secs }));
          // Finished with the dialog closed → reopen it on the success panel.
          // The failures too: the panel this reopens is where a track that produced nothing is reported, and without
          // them a run that recorded nothing reopened on a tick and "Recorded 0 tracks".
          this.recordingLastRun = {
            count: p.chaptersDone,
            secs: Math.round((p.elapsedMs ?? 0) / 1000),
            failed: p.chaptersFailed,
            failure: p.failure,
            editionKey: key,
          };
          this.offerFinishedRun({ done: p.chaptersDone, total: p.chaptersTotal });
        } else if (p.phase === 'cancelled') {
          new Notice(t('notices.recording_cancelled', { count: String(p.chaptersDone) }));
        }
      },
    });
    try {
      await this.recordingGen.run(chapterIndices);
    } catch (e) {
      this.ctx.debug(`[recording] error: ${String(e)}`, 'tts');
      new Notice(t('notices.recording_failed'));
    } finally {
      this.recordingGenProgress = null;
      this.recordingRunKey = null;
      this.recordingRunSections = null;
      this.refreshRecordingIndicator();
      // A run cancelled before its first chapter leaves an empty edition folder — clean it up.
      await pruneEmptyEditions(this.ctx.app, base);
    }
  }

  /**
   * A run finished with its dialog closed: bring the dialog back on its result — over the book, never elsewhere.
   *
   * **Not into whatever window is in front.** A new dialog goes into the active window, and with Settings' own window
   * focused the result opened inside Settings, cut off at its edge. So it opens only when the book's window is in
   * front with nothing open over it (`bookWindowFree`), and until then the chip stays where it was, saying the run is
   * done, and selecting it opens the result at once.
   *
   * **No time limit.** The prompts that wait like this give up after about two minutes because each holds something
   * back while it waits; this holds nothing back — the result is kept until the dialog is next opened, by any route —
   * so it waits for as long as the reader is elsewhere. The check runs every 2.5 seconds, the prompts' interval, and
   * stops when the dialog opens, a new run starts or the book closes.
   */
  private offerFinishedRun(counts: { done: number; total: number }): void {
    const bookDoc = this.ctx.contentEl.ownerDocument;
    if (bookWindowFree(bookDoc)) {
      this.host.showRecordingsModal();
      return;
    }
    this.ctx.debug('[recording] finished with the book window busy — the chip waits', 'tts');
    this.finishedWaiting = counts;
    this.refreshRecordingIndicator();
    this.finishedTimer = window.setInterval(() => {
      if (bookWindowFree(bookDoc)) this.showFinishedRun();
    }, FINISHED_RECHECK_MS);
  }

  /** Open the finished run's result, and stop waiting to. */
  private showFinishedRun(): void {
    this.stopWaitingForBook();
    this.host.showRecordingsModal();
  }

  private stopWaitingForBook(): void {
    if (this.finishedTimer !== null) window.clearInterval(this.finishedTimer);
    this.finishedTimer = null;
    if (!this.finishedWaiting) return;
    this.finishedWaiting = null;
    this.refreshRecordingIndicator();
  }

  /** Show/update/hide the floating chip. Visible while generating with the modal closed (when open, the modal shows
   *  progress), and after a run that finished with the book's window busy (`offerFinishedRun`); selecting it opens
   *  the modal. The two states are two chips: a spinner and the count, or a tick and what was recorded. */
  private refreshRecordingIndicator(): void {
    const p = this.recordingGenProgress;
    const running = !!p && this.isRecording() && !this.recordingProgress;
    const finished = this.recordingProgress ? null : this.finishedWaiting;
    const done = finished !== null;
    const counts = finished ?? (p ? { done: p.chaptersDone, total: p.chaptersTotal } : null);
    if (!counts || (!running && !done)) {
      this.recordingChip?.remove();
      this.recordingChip = null;
      return;
    }
    if (this.recordingChip && this.recordingChip.hasClass('is-done') !== done) {
      this.recordingChip.remove();
      this.recordingChip = null;
    }
    if (!this.recordingChip) {
      const chip = this.ctx.contentEl.createDiv({
        cls: done ? 'orbis-recording-chip is-done' : 'orbis-recording-chip',
      });
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('aria-label', t(done ? 'recording_chip.view_done' : 'recording_chip.reopen'));
      if (done) setIcon(chip.createDiv({ cls: 'orbis-recording-chip-icon' }), 'check');
      else chip.createDiv({ cls: 'orbis-recording-spinner' });
      chip.createSpan({ cls: 'orbis-recording-chip-text' });
      chip.addEventListener('click', () => (done ? this.showFinishedRun() : this.host.showRecordingsModal()));
      this.recordingChip = chip;
    }
    const text = { done: String(counts.done), total: String(counts.total) };
    this.recordingChip
      .querySelector('.orbis-recording-chip-text')
      ?.setText(t(done ? 'recording_chip.done' : 'recording_chip.progress', text));
  }

  /** Cancel an in-progress generation run (the current chapter's partial is discarded). */
  cancelRecording(): void {
    if (this.recordingGen?.isRunning()) {
      this.recordingGen.cancel();
      new Notice(t('notices.recording_cancelling'));
    }
  }

  isRecording(): boolean {
    return this.recordingGen?.isRunning() ?? false;
  }

  /** Hold a run at the next sentence boundary; the audio already recorded is kept. */
  pauseRecording(): void {
    this.recordingGen?.pause();
  }

  resumeRecording(): void {
    this.recordingGen?.resume();
  }

  isRecordingPaused(): boolean {
    return this.recordingGen?.isPaused() ?? false;
  }

  /** The latest generation progress, so a reopened modal can seed its readout mid-run. */
  currentRecordingProgress(): GenProgress | null {
    return this.recordingGenProgress;
  }

  /** The in-progress run's queued section indices, so a reopened modal narrows its list to them. */
  currentRecordingRunSections(): number[] | null {
    return this.recordingRunSections;
  }

  /** The in-progress run's edition key, so the modal views the recording (independent of the active
   *  playback edition, which the user may have changed via the Listen gear). */
  currentRecordingRunEditionKey(): string | null {
    return this.recordingRunKey;
  }

  /** The result of a run that finished while the modal was closed — returned once, then cleared, so a
   *  freshly-opened modal shows the success panel exactly one time. */
  consumeRecordingLastRun(): FinishedRun | null {
    // The dialog is opening, by whatever route: nothing is left to wait for.
    this.stopWaitingForBook();
    const r = this.recordingLastRun;
    this.recordingLastRun = null;
    return r;
  }

  /** Subscribe to generation progress (the modal). Pass null to unsubscribe → notices + chip resume. */
  setRecordingProgressObserver(cb: ((p: GenProgress) => void) | null): void {
    this.recordingProgress = cb;
    this.refreshRecordingIndicator(); // modal opened → hide chip; closed → show it if still running
  }

  /** Build the per-sentence synthesizer for the current method + voice (async: Piper warms/downloads). */
  private async buildRecordingSynth(
    voiceId: string,
    methodOverride?: GenConfig['method'],
    /** The edition's model, when recording into one: its identity, not the current default. */
    modelOverride?: string
  ): Promise<ChapterSynth> {
    const cfg = readGenConfig();
    const log = (m: string): void => this.ctx.debug(`[recording] ${m}`, 'tts');
    // The run's method, not the stored one — see `startRecording`. A synth built for the wrong side of that choice
    // sends Piper voice ids to a Kokoro server.
    if ((methodOverride ?? cfg.method) === 'piper') {
      const cacheDir = `${this.ctx.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
      const { id, speaker } = splitPiperVoice(voiceId); // voiceId may carry a `#N` speaker suffix
      const catalog = orbisVoiceOrDefault(id);
      const generator = await createPiperGenerator(this.ctx.app.vault.adapter, cacheDir, catalog.path, speaker, 1);
      // Respellings are baked into the recording, so a change needs a re-record to take effect.
      return createPiperSynth(generator, log, this.host.pronouncer());
    }
    return createServerSynth(
      cfg.serverUrl,
      voiceId,
      modelOverride ?? cfg.model,
      cfg.concurrency,
      log,
      this.host.pronouncer()
    );
  }
}
