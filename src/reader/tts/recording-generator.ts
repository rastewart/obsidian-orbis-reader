// Book-scoped recording generation: runs generateChapterAudio over a list of the book's CHAPTERS,
// one at a time, cancellable. Book-tied — the owning view cancels it on book close. Resume is
// implicit: the caller passes only the chapters that still need generating (a chapter is
// all-or-nothing, so an interrupted one has no file/manifest entry and is simply re-passed).
//
// A chapter is a contents entry, which on most books is also a spine section — but on a book that keeps eighty
// devotional Days inside seven files it is one of eighty, and this loop records eighty MP3s rather than seven.
// See `book-chapters` for the list itself.

import type { App } from 'obsidian';
import type { ChapterPart } from '../../book-chapters';
import type { RawSection } from '../foliate-view';
import {
  type ChapterSynth,
  classifyChapter,
  generateChapterAudio,
  type SynthFailure,
  writeEditionPlaylist,
} from './recording';
import type { EditionMeta } from './recording-editions';

export interface GenProgress {
  /**
   * `paused` / `resumed` are run-level and can arrive at any point mid-chapter: a pause takes effect at the next
   * sentence boundary, so the phase changes while a chapter is still open. Neither ends the run.
   */
  phase: 'chapter-start' | 'chapter-progress' | 'chapter-done' | 'run-done' | 'cancelled' | 'paused' | 'resumed';
  /** Chapter currently generating, by its ordinal in the book's chapter list (absent for run-level phases). */
  chapterIndex?: number;
  chapterLabel?: string;
  /** Chapters completed / total in THIS run. */
  chaptersDone: number;
  chaptersTotal: number;
  /**
   * Chapters that produced no audio — every sentence failed.
   *
   * **Reported, not silent.** `generateChapterAudio` returns what it managed, and without this count a chapter whose
   * sentences all failed — a voice the server rejects, say — would count as done, and the dialog would report a
   * "success" with no recording behind it.
   */
  chaptersFailed?: number;
  /**
   * Chapters passed over because they hold no text — counted apart from failures.
   *
   * A cover page producing no audio is the correct outcome, not a fault, and calling it a failure would tell the
   * reader their run had broken when it had done exactly the right thing. See `RecordingSectionStatus.hasText`.
   */
  chaptersSkipped?: number;
  /** Why they produced nothing, when they did — carried to the dialog so it can say so. */
  failure?: SynthFailure | null;
  /**
   * Why the run paused itself, when it was not the reader who paused it.
   *
   * - `background` — the app is not on screen. Lifts itself the moment it is, so this is a WAIT, and the dialog
   *   says as much rather than asking for a tap that is not needed.
   * - `unreachable` — requests kept failing with nothing landing between them, so the run gave up rather than
   *   spending a track's worth of retries on a network it cannot reach. This one stays until the reader lifts it.
   *
   * Either way the dialog has to say something: a run that paused on its own with no explanation reads as a hang.
   */
  pausedReason?: 'background' | 'unreachable';
  /** Sentence progress within the current chapter (chapter-progress only). */
  sentenceDone?: number;
  sentenceTotal?: number;
  /** Wall-clock duration of the whole run in ms (run-done / cancelled only). */
  elapsedMs?: number;
}

/** Per-chapter generation status for the management modal. */
export interface RecordingSectionStatus {
  /** The chapter's ordinal in the book's chapter list. */
  index: number;
  label: string;
  generated: boolean;
  /** Seconds — real when generated, estimated from the word count otherwise. */
  durationSec: number;
  /** Bytes — real when generated, estimated otherwise. */
  fileBytes: number;
  /** True when durationSec/fileBytes are estimates (chapter not yet generated). */
  estimated: boolean;
  /**
   * Whether this chapter holds any text to record.
   *
   * **Because a cover page is not a recording.** Every book has chapters with nothing to say — a cover, a title
   * page, a copyright notice, a dedication, a blank file left by a converter's flow split — often several of
   * them. Offered as rows, they would be ticked by "Select all", handed to the generator, and counted as FAILURES
   * when they produced no audio, so a run on an ordinary book would end by reporting failures for its front matter.
   *
   * The chapter stays in the book's chapter list — the contents panel and ⏮/⏭ still visit it, which is what a
   * comic or a picture book needs — it is only absent from the recording surface.
   */
  hasText: boolean;
  /** Voice this chapter was generated with (per-chapter), when generated. */
  voice?: string;
  /** Mix only: display label of the source voice this chapter is assigned to (undefined = unassigned). */
  sourceVoice?: string;
  /** Mix only: whether this chapter plays from a file or is read aloud in real time. Explicit rather
   *  than inferred from `generated`, since a live chapter is assigned but has nothing generated. */
  sourceKind?: 'recorded' | 'live';
}
export interface RecordingStatus {
  sections: RecordingSectionStatus[];
  /** Total bytes of the generated chapters. */
  totalBytes: number;
  /** Model recorded across generated chapters. */
  model?: string;
  /** Distinct voices used across generated chapters (usually one; >1 → "Mixed" in the UI). */
  voicesUsed: string[];
  /** All editions of this book (each a full-book generation in one voice), for the picker. */
  editions: EditionMeta[];
  /** The edition these `sections` describe (the one the modal is currently showing). */
  viewedEditionKey: string | null;
  /** The edition that plays back (may differ from the viewed one only transiently). */
  activeEditionKey: string | null;
}

export interface RecordingGeneratorHost {
  app: App;
  sections: RawSection[];
  /** The book's chapter parts, in order — what `run` takes indices into. One part is one MP3. */
  chapters: readonly ChapterPart[];
  /** Absolute vault path of the book's audio dir. */
  audioDir: string;
  bookBasename: string;
  /** The per-sentence synthesizer (built by the caller for the chosen method); disposed at run end. */
  synth: ChapterSynth;
  /** Engine tag + voice + model recorded in each chapter's manifest entry. */
  engineKind: string;
  voice: string;
  model: string;
  /** Book-level ID3 metadata for the generated MP3s (title/author/cover/voice) + total spine count. */
  bookTitle: string;
  bookAuthor: string;
  voiceLabel: string;
  coverData: ArrayBuffer | null;
  trackTotal: number;
  chapterTitle: (chapterIndex: number) => string;
  log: (msg: string) => void;
  onProgress: (p: GenProgress) => void;
}

export class RecordingGenerator {
  private running = false;
  private cancelled = false;
  /**
   * Passed to generateChapterAudio and to the synth. `cancel()` flips `cancelled` so the in-flight chapter stops
   * and discards; `paused` is read by the synth before every request, so a pause takes effect at the next sentence
   * boundary — a request already in flight is waited out, since there is nothing to cancel it with.
   */
  private readonly signal = { cancelled: false, paused: false };
  /** Resolvers waiting on a resume — see `waitWhilePaused`, which the synth awaits. */
  private resumeWaiters: (() => void)[] = [];
  /**
   * Paused because the app went away, and therefore liftable without asking.
   *
   * Three pauses look the same from the outside and must not behave the same: the reader's own (stays until they
   * lift it), the app's absence (lifts itself the moment the app is back — a detour to copy a log should not need
   * a tap), and one the loss rule made STICK because the network is genuinely unreachable (stays, so the run does
   * not spend a track's retries discovering that again).
   *
   * Only ever true alongside `signal.paused`, and only `pauseForBackground` sets it: `resume` clears it, so a
   * reader lifting a wait and pausing again by hand owns that pause, and `pause` needs no clearing of its own —
   * it cannot run while something else already holds the run.
   */
  private autoPaused = false;
  /** The last progress the run reported, so a pause can re-state the run's counters instead of blanking a readout
   *  that was mid-chapter. */
  private lastProgress: GenProgress = { phase: 'chapter-progress', chaptersDone: 0, chaptersTotal: 0 };

  constructor(private readonly host: RecordingGeneratorHost) {}

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.running && this.signal.paused;
  }

  cancel(): void {
    if (!this.running) return;
    this.cancelled = true;
    this.signal.cancelled = true;
    // A cancelled run must not stay parked on a resume that will never come.
    this.releaseResumeWaiters();
  }

  /**
   * Hold the run at the next sentence boundary.
   *
   * `reason` is absent when the reader pressed Pause and `'background'` when the run stopped itself — see
   * `GenProgress.pausedReason`. Idempotent: pausing an already-paused run is not an event.
   */
  pause(reason?: 'background' | 'unreachable'): void {
    if (!this.running || this.signal.paused) return;
    this.signal.paused = true;
    this.host.log(
      reason === 'background' ? 'run paused: the app kept losing requests in the background' : 'run paused'
    );
    this.reportTransient({ phase: 'paused', pausedReason: reason });
  }

  resume(): void {
    if (!this.running || !this.signal.paused) return;
    this.autoPaused = false; // lifted by hand: nothing may put it back on its own
    this.signal.paused = false;
    this.host.log('run resumed');
    this.reportTransient({ phase: 'resumed' });
    this.releaseResumeWaiters();
  }

  /** Report and remember — every phase the run itself moves through. */
  private report(p: GenProgress): void {
    this.lastProgress = p;
    this.host.onProgress(p);
  }

  /**
   * A run-level event that does NOT replace the remembered progress.
   *
   * A pause lands mid-chapter, so the readout has to return to exactly where it was when the run resumes — which
   * it cannot do if the pause overwrote what it was. Not storing is also what keeps `pausedReason` off a resume:
   * only a chapter phase is ever remembered, and those never carry one.
   */
  private reportTransient(patch: Partial<GenProgress> & { phase: GenProgress['phase'] }): void {
    this.host.onProgress({ ...this.lastProgress, ...patch });
  }

  private releaseResumeWaiters(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** The app went away: hold the run and SAY so, rather than letting the readout freeze with no explanation. */
  private readonly pauseForBackground = (): void => {
    if (!this.running || this.signal.paused) return;
    this.autoPaused = true;
    this.pause('background');
  };

  /**
   * The app is back: lift a pause the app's absence caused, and only that one.
   *
   * A pause the reader asked for, or one the loss rule made stick, is left alone — returning to the app is not an
   * instruction to carry on with either.
   */
  private readonly resumeFromBackground = (): void => {
    if (!this.autoPaused) return;
    this.resume();
  };

  /**
   * The loss rule tripped: make the current pause STICK.
   *
   * Requests keep dying with nothing landing between them, so the app being visible again is not evidence that
   * anything can reach the network. Waiting for the reader is the right answer, and it keeps the audio already
   * recorded rather than spending the rest of the track's retries to find out.
   */
  private readonly stickPause = (): void => {
    this.autoPaused = false;
    if (this.signal.paused) {
      // Already held as a WAIT: promote it, so the reason on screen stops promising it will lift itself.
      this.reportTransient({ phase: 'paused', pausedReason: 'unreachable' });
      return;
    }
    this.pause('unreachable');
  };

  /**
   * What the synth awaits before each request: resolves at once unless the run is paused, and on cancel as well as
   * on resume — a parked run that is then stopped has to fall through so the pipeline can discard and finish.
   */
  private readonly waitWhilePaused = async (): Promise<void> => {
    while (this.signal.paused && !this.signal.cancelled) {
      await new Promise<void>((resolve) => this.resumeWaiters.push(resolve));
    }
  };

  /** Generate the given chapters in order. Overwrites any that already exist (regenerate). */
  async run(chapterIndices: number[]): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    this.signal.cancelled = false;
    this.signal.paused = false;
    this.autoPaused = false;
    /**
     * The synth needs more than the chapter pipeline does, and gets it here rather than at construction because it
     * is built by the caller, before there is a run to cancel or pause:
     *
     * - `signal` so Stop reaches a synth parked waiting for the app to return, and so a pause is seen before the
     *   next request rather than after the chapter.
     * - `waitWhilePaused` so that parking actually happens where the synth can do it — between requests.
     * - `onStuck` so the synth can ask the RUN to pause when it keeps losing requests to the background, instead
     *   of spending a track's worth of retries on a network it cannot reach.
     */
    this.host.synth.signal = this.signal;
    this.host.synth.waitWhilePaused = this.waitWhilePaused;
    this.host.synth.onStuck = this.stickPause;
    this.host.synth.onHidden = this.pauseForBackground;
    this.host.synth.onVisible = this.resumeFromBackground;
    const total = chapterIndices.length;
    const startedAt = Date.now();
    let done = 0;
    /** Chapters that produced nothing — see `GenProgress.chaptersFailed`. */
    let failedChapters = 0;
    /** Chapters with nothing to say — see `GenProgress.chaptersSkipped`. */
    let skippedChapters = 0;
    /**
     * The denominator the reader sees, which shrinks as chapters turn out to hold no text.
     *
     * **Otherwise a run ends reading "3 of 5" and looks stalled.** A skipped chapter was never going to be
     * recorded, so counting it in the total promises work that will never be done. The modal already keeps
     * text-free chapters out of a run, so this normally never moves; it earns its place when the word-count
     * estimate behind that list and the units found at generation time disagree.
     */
    const denominator = (): number => total - skippedChapters;
    /** The reason the last empty chapter gave, for the dialog to state. */
    let failure: SynthFailure | null = null;
    try {
      this.host.log(`run: chapters ${chapterIndices.join(', ')}`);
      for (const cIdx of chapterIndices) {
        if (this.cancelled) break;
        const chapter = this.host.chapters[cIdx];
        if (!chapter) {
          this.host.log(`chapter ${cIdx}: not in this book's chapter list — skipped`);
          continue;
        }
        const label = this.host.chapterTitle(cIdx);
        this.host.log(`chapter ${cIdx} "${label}" begin`);
        this.report({
          phase: 'chapter-start',
          chapterIndex: cIdx,
          chapterLabel: label,
          chaptersDone: done,
          chaptersTotal: denominator(),
        });
        const chapterStart = Date.now();
        /**
         * Every part of this part's section that starts somewhere of its own, in order — how `generateChapterAudio`
         * finds where this one ends. Later slices of a divided chapter share their parent's start, so they are left
         * out here and the slice itself narrows the range instead.
         */
        const siblings = this.host.chapters.filter(
          (c) => c.sectionIndex === chapter.sectionIndex && !(c.slice && c.slice.index > 0)
        );
        const outcome = await generateChapterAudio({
          app: this.host.app,
          sections: this.host.sections,
          sectionIndex: chapter.sectionIndex,
          chapterIndex: cIdx,
          chapterHref: chapter.chapterHref,
          sectionAnchors: siblings.map((c) => c.anchor),
          anchorAt: siblings.findIndex((c) => c.chapterHref === chapter.chapterHref),
          slice: chapter.slice,
          partCount: chapter.partCount,
          bookBasename: this.host.bookBasename,
          audioDir: this.host.audioDir,
          chapterTitle: label,
          synth: this.host.synth,
          engineKind: this.host.engineKind,
          voice: this.host.voice,
          model: this.host.model,
          bookTitle: this.host.bookTitle,
          bookAuthor: this.host.bookAuthor,
          voiceLabel: this.host.voiceLabel,
          coverData: this.host.coverData,
          trackTotal: this.host.trackTotal,
          createdAt: Date.now(),
          signal: this.signal,
          onProgress: (sd, st) =>
            this.report({
              phase: 'chapter-progress',
              chapterIndex: cIdx,
              chapterLabel: label,
              chaptersDone: done,
              chaptersTotal: denominator(),
              sentenceDone: sd,
              sentenceTotal: st,
            }),
          log: this.host.log,
        });
        if (this.cancelled) break; // the partial chapter was discarded by generateChapterAudio
        // Four ways to finish with no new audio and only one of them is a fault — see `classifyChapter`.
        const verdict = classifyChapter(outcome);
        if (verdict === 'cancelled') break;
        if (verdict === 'empty') {
          // A cover, a title page. Not progress and NOT a failure: producing no audio here is the correct
          // outcome, and reporting it as a fault would make an ordinary book's run look broken.
          skippedChapters++;
          continue;
        }
        if (verdict !== 'recorded') {
          // Every sentence failed (a rejected voice, a server that is not there), or the section would not open.
          // Counted as a failure rather than as progress, so the run cannot claim to have recorded what it did not.
          failedChapters++;
          failure = outcome?.failure ?? failure;
          this.host.log(
            `chapter ${cIdx}: nothing recorded (${verdict}) — ${outcome?.failed ?? 0} sentence(s) failed${
              outcome?.failure ? ` (${outcome.failure})` : ''
            }`
          );
          continue;
        }
        done++;
        this.report({
          phase: 'chapter-done',
          chapterIndex: cIdx,
          chapterLabel: label,
          chaptersDone: done,
          chaptersTotal: denominator(),
          elapsedMs: Date.now() - chapterStart, // for the generation-speed samples (gen-timing)
        });
      }
    } finally {
      this.running = false;
      this.host.synth.dispose(); // free the synth (terminates the Piper worker)
      // Refresh the edition's M3U playlist to include whatever was just recorded (skip on cancel).
      if (!this.cancelled) {
        try {
          await writeEditionPlaylist(this.host.app, this.host.audioDir, this.host.bookBasename);
        } catch (e) {
          this.host.log(`playlist write failed: ${String(e)}`);
        }
      }
      this.report({
        phase: this.cancelled ? 'cancelled' : 'run-done',
        chaptersDone: done,
        chaptersTotal: denominator(),
        chaptersFailed: failedChapters,
        chaptersSkipped: skippedChapters,
        failure,
        elapsedMs: Date.now() - startedAt,
      });
    }
  }
}
