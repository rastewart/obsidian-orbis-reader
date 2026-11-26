import { Overlayer } from 'foliate-js/overlayer.js';
import { Notice, Platform, setIcon } from 'obsidian';
import { type ChapterPart, partIndexAt, partStartHref } from '../book-chapters';
import { t } from '../i18n';
import { renderGeneratedCover } from '../library/generated-cover';
import { annotationsSvg, HEADPHONES_SVG } from '../system-glyphs';
import { setSvgIcon, setTintedSvgIcon } from '../ui-utils';
import type { FoliateViewEl } from './foliate-view';
import type { ReaderContext } from './ReaderContext';
import type { LiveVoiceOverride, TtsHost } from './TtsHost';
import { setReaderTopSpace } from './top-space';
import { bookSecondsAfter } from './tts/book-left';
import { type EntryStart, entrySpanAt, normalizeEntryStarts, type UnitSpan } from './tts/entry-span';
import {
  buildDurationModel,
  formatDuration,
  type LiveReadout,
  livePreview,
  liveReadout,
  sectionPosition,
} from './tts/listen-duration';
import { MediaSessionBridge } from './tts/media-session';
import { PiperEngine } from './tts/PiperEngine';
import { interClipPauseMs, NARRATION_WPM, type PauseKind } from './tts/pacing';
import { type PageFollowRenderer, pageTowardFraction } from './tts/page-follow';
import { PocketLock, PocketMode, wantsScreenOn } from './tts/pocket-lock';
import { type ScrubMove, wireProgressScrub } from './tts/progress-scrub';
import type { Pronouncer } from './tts/pronunciations';
import {
  RecordedAudioPlayer,
  type RecordedChapter,
  seamOffsetSec,
  segmentIndexForCfi,
  skipLanding,
} from './tts/recorded-audio';
import type { RecordingSegment } from './tts/recording';
import { partUnitRange } from './tts/recording';
import { buildSpeedControl } from './tts/speed-control';
import type { TtsEngine } from './tts/TtsEngine';
import {
  cumCharBounds,
  enclosingBlockRange,
  getReadingUnits,
  getWordUnits,
  normalizeForSpeech,
  type ReadingUnit,
  unitIndexAtFraction,
  unitIndexForRange,
} from './tts/tts-blocks';
import { ChipSpeeds, chipSourceText } from './tts/voice-chip';
import { VoiceGate } from './tts/voice-gate';
import { VOICE_LIVE_SVG, voiceOriginSvg } from './tts/voice-glyphs';
import { WebSpeechEngine } from './tts/WebSpeechEngine';

const TTS_HL_COLOR = '#FFD166'; // warm yellow — the span being read aloud
// In word mode the sentence sits behind the word as a pale underlay, so the eye keeps its place
// between word steps (and while the word estimate drifts on voices without real boundaries).
const TTS_HL_UNDERLAY_COLOR = '#FFE9AD';
// Dedicated overlay keys for the reading highlight, so it stacks over user highlights/notes
// instead of sharing (and clobbering) their CFI-keyed annotation. Removing it never touches
// user annotations. Mirrors how foliate keeps search hits on their own key.
const READING_KEY = 'orbis-tts-reading';
const READING_UNDERLAY_KEY = 'orbis-tts-reading-underlay';

/** Whether two ranges cover the same span. Paragraph mode re-derives the block range per sentence
 *  (a fresh Range object each time for recorded audio), so identity won't do. */
function sameSpan(a: Range, b: Range): boolean {
  try {
    return a.compareBoundaryPoints(Range.START_TO_START, b) === 0 && a.compareBoundaryPoints(Range.END_TO_END, b) === 0;
  } catch {
    return false; // different documents — not comparable, treat as changed
  }
}

const PLAY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const SPEAKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>';
// Chevron-down — collapse the player back to read-along (show text).
const CHEVRON_DOWN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
// Small plus, paired with the highlighter/pencil glyphs to read as "add highlight/note".
const PLUS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
// Bookmark — mark the sentence being read (audio bookmark). Outline glyph, paired with PLUS.
const BOOKMARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-3.5L5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z"/></svg>';
// Highlighter — highlight what's being read. The nib (`data-tint`) is filled with the user's chosen audio
// highlight color as a live preview (and to make the icon read as a highlighter on small screens).
// Tinted through `setTintedSvgIcon`, never spliced in: the color comes from a mark, which a `.orbis` file can carry.
const HIGHLIGHTER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path data-tint d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>';
// Pencil — add a note on what's being read. The pencil body (`data-tint`) is filled with the default
// note-highlight color (a live preview of the color the note will be highlighted in; the
// setting allows "None", in which case the body stays unfilled).
const PENCIL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path data-tint d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
// Large transport glyphs for the full player.
const PLAY_BIG_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_BIG_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
// Previous/next chapter (track-skip). Split into separate <path> elements (no compound paths
// or <polyline>, which do not render in iPad WebKit) — matches the working icon pattern.
const PREV_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6z"/><path d="M20 6v12L9 12z"/></svg>';
const NEXT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2z"/><path d="M4 6l11 6L4 18z"/></svg>';
// Circular back/forward arrows (≈15s skip), path-only (lucide rotate-ccw/cw).
const SKIP_BACK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
const SKIP_FWD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
// Smaller variants for the compact read-aloud bar (its circular buttons are smaller than the player's).
const SKIP_BACK_SM_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
const SKIP_FWD_SM_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
// Seconds the ≈15s skip buttons jump (snapped to a sentence boundary via the word model).

// Playback-speed range for the slider popup.
const MIN_RATE = 0.5;
const MAX_RATE = 3;
// Rough narration speed (words/min) at 1× — turns word counts into ~duration estimates.
// Real-time TTS has no true duration until spoken, so shown times are approximate.

type PlayState = 'idle' | 'playing' | 'paused';
/** A rendered section's overlay surface (from foliate's renderer.getContents()). */
type SectionContent = { index: number; doc: Document; overlayer?: Overlayer };

/**
 * A 15-second skip that ran off one end of its track, carried into the neighboring one.
 *
 * `overshootSec` is what was left over after the current MP3 ran out: measured from the destination's END going
 * back, and from its START going forward, so the fifteen seconds are fifteen seconds either way.
 */
type SeamCrossing = { dir: 1 | -1; overshootSec: number };

/**
 * Read-aloud (text-to-speech). Iterates the book into sentence units, speaks
 * each through a pluggable engine (currently Web Speech / system voices — desktop
 * and iPad; unavailable on Android), highlights the sentence being read and pages
 * the reader to follow — across section boundaries. See docs/design/text-to-speech.md.
 *
 * Another engine (HTTP OpenAI-compatible / Kokoro) can be added by implementing
 * `TtsEngine`; the controller needs no changes.
 */
export class TtsController {
  private state: PlayState = 'idle';
  private engine: TtsEngine | null = null;
  /** The voice key (`resolvedVoiceKey()`) the current `engine` was built for — to detect a
   *  Settings voice change and rebuild instead of replaying old-voice clips. */
  private engineVoiceKey: string | null = null;
  private rate = 1;
  /** Live-voice override for the current section when playing a mix chapter pinned to a specific
   *  live voice (else null → the device voice pref). Recomputed once per section in speakUnit. */
  private liveOverride: LiveVoiceOverride | null = null;
  /** The PART `liveOverride` was resolved for, so it is recomputed when the part changes — not the section, which
   *  a divided chapter's parts all share. See the resolve in `speakUnit`. */
  private overridePart: number | null = null;
  /** The part a voice was last found for — see `speakUnit`. Null forces the check. */
  private voiceCheckedPart: number | null = null;
  /** The mix voices already reported as not on this device, so the notice comes once per voice per book open. */
  private readonly voicesNotHere = new Set<string>();

  // ── Recorded recording (pre-generated MP3, played offline) ──
  /** Active recorded player, or null when using a live engine. When set, transport routes to the
   *  MP3 element and highlighting is driven by manifest segments (not the speak-loop). */
  private recorded: RecordedAudioPlayer | null = null;
  /**
   * Which chapter the loaded MP3 IS, as an ordinal in `host.bookChapters()`; -1 when nothing is loaded.
   *
   * **Its own field, not `sectionIdx`.** A chapter is a contents entry, and a file can hold eighty of them — so the
   * section the highlight is in and the chapter the MP3 covers are different facts, and the transport needs both.
   */
  private recordedChapterIdx = -1;
  /** Manifest segments of the loaded recorded chapter (reading order) — for nav→segment seeking. */
  private recordedSegments: readonly RecordingSegment[] = [];
  /** Duration (s) of the loaded recorded chapter, and the summed duration of all later recorded
   *  chapters (for the book-remaining readout). */
  private recordedDurationSec = 0;
  private recordedLaterSec = 0;
  /** Latest play position (s) for the recorded scrubber/readouts. */
  private recordedCurSec = 0;
  /** CFI of the recorded segment currently highlighted — for re-resolving the highlight after a
   *  re-render, bookmarks/notes, and the read↔listen / search-hit handoff. */
  private recordedSegCfi: string | null = null;
  /** The recorded segment currently playing (its start/dur), for within-sentence page-follow. */
  private recordedCurSeg: RecordingSegment | null = null;

  private units: ReadingUnit[] = [];
  private unitIdx = 0;
  private sectionIdx = 0;
  /** The SENTENCE being read — the semantic position. Drives page-follow, the saved listening
   *  location, resume-exact, and the bookmark/note/highlight targets, so it stays the sentence
   *  regardless of how much text the highlight *draws* (see `drawnRange`). */
  /** Rewind / forward buttons (bar + full player). Held so their labels can be refreshed when the
   *  configured jump size changes — the buttons carry no visible number, so the accessible name and
   *  tooltip are the only place the amount is stated. */
  private readonly skipBackBtns: HTMLElement[] = [];
  private readonly skipFwdBtns: HTMLElement[] = [];
  private currentReadingRange: Range | null = null;
  /** What is actually painted on the overlay (a word, the sentence, or the whole paragraph) —
   *  only so an overlay rebuild can redraw the same thing. Never a navigation target. */
  private drawnRange: Range | null = null;
  /** The pale sentence underlay painted behind the word in word mode, for the same redraw. */
  private drawnUnderlayRange: Range | null = null;
  /** Page we've mid-sentence-paged to for the current sentence (-1 = none yet). */
  private lastPagedTo = -1;
  /** Sentence-level highlight tracking within the current (possibly multi-sentence) chunk. */
  private sentenceUnits: ReadingUnit[] = [];
  private sentenceCumChars: number[] = [0]; // cumulative char boundaries; last entry = total
  private curSentenceIdx = -1;
  /** Word-level tracking within the current sentence (word mode only; built lazily per sentence
   *  so sentence/paragraph/off modes never pay for segmentation). */
  private wordUnits: ReadingUnit[] = [];
  private wordCumChars: number[] = [0];
  private curWordIdx = -1;
  /** The sentence `wordUnits` was segmented from — so a sentence that yields no words is only
   *  segmented once, not on every progress tick. */
  private wordSentence: Range | null = null;
  /** Guards async continuations against stop()/skip so stale loops don't advance. */
  private epoch = 0;
  private sectionWaiter: { sIdx: number; resolve: () => void } | null = null;

  // ── Suspend/resume around Search / Go To / Display / Settings ──
  /** Bar was displaced by another surface (search/go-to/display): paused, chrome hidden, engine
   *  and position retained so reopening resumes exactly. */
  private suspended = false;
  /** Which chrome to restore when the bar reopens after a suspend. */
  private suspendMode: 'compact' | 'player' = 'compact';
  /** CFI of the sentence to resume at — captured before a re-render kills the live Range, used to
   *  re-seat the units afterward. Null when the retained live pointer is still usable. */
  private resumeAnchorCfi: string | null = null;
  /** A user navigation happened while suspended → resume from the book's new spot, not the anchor. */
  private navigatedWhileSuspended = false;
  /** The precise target of a navigation made while suspended (a bookmark/etc sentence), so the
   *  resume seeks there rather than the page top. */
  private suspendTargetCfi: string | null = null;
  /** Guards syncToView against re-entrancy: it re-pages the view (scrollToAnchor), whose relocate
   *  would otherwise call back into it. */
  private syncingToView = false;
  /** True while dragging the chapter progress bar — freezes the auto-updating fill so the drag
   *  preview isn't overwritten by playback; the seek fires on release. */
  private scrubbing = false;
  /** True while a runLoop is live (playing or frozen mid-utterance). False means the loop exited —
   *  e.g. paused during the inter-clip gap, when the gap timer resolved with state≠playing — so a
   *  resume must restart the loop rather than only resuming the (absent) clip. */
  private loopRunning = false;
  /**
   * Paused only because a pre-play skip or scrub chose where ▶ will begin — nothing has actually played yet.
   *
   * **Not the same as a paused player, and the difference decides which VOICE speaks.** Those gestures promote
   * idle to paused so the position they chose survives (see `seekToChapterFraction`), and that promotion alone
   * would carry the reader straight past `startAuto` — the one place that prefers a chapter's recording — into the
   * live resume path. Fast-forwarding to the end of a recorded track and pressing ▶ would then read on in the Orbis
   * voice, while the chip beside it went on naming the recorded one.
   */
  private preplayPaused = false;

  private toolbarBtn: HTMLButtonElement | null = null;
  private barEl_: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  /** The bar's leftmost control (headphones → the full player), which is where the keyboard lands on open. */
  private listenBtn: HTMLButtonElement | null = null;
  private playIconEl: HTMLElement | null = null;

  // Full-screen "now playing" player (shown when text is hidden).
  private textHidden = false;
  private coverContainer: HTMLElement | null = null;
  private playerEl: HTMLElement | null = null;
  /** Screen wake lock held while playing (Settings → Listening); null when not held. */
  private wakeLock: WakeLockSentinel | null = null;
  /** Re-acquire the wake lock when the app returns to the foreground (the sentinel auto-releases
   *  when the page is hidden). Registered once; removed on dispose. */
  private onVisibilityChange: (() => void) | null = null;
  /** The document `onVisibilityChange` is listening on — this reader's own, so it comes off the one it went on. */
  private visibilityDoc: Document | null = null;
  /** Pocket mode: the full-screen player's controls locked, and the slide that unlocks them — `pocket-lock.ts`. */
  private readonly lock = new PocketLock(
    (on) => {
      this.host.setListeningBlackout(on);
      void this.updateWakeLock(); // Pocket mode holds the screen on — see `updateWakeLock`
    },
    () => this.pocket.unlock()
  );
  /** Pocket mode from wherever listening is, and what unlocking puts back — `pocket-lock.ts`. */
  private readonly pocket = new PocketMode(
    {
      focusMode: () => this.ctx.focusMode,
      fullPlayerShowing: () => this.isFullPlayerShowing(),
      openFullPlayer: () => this.startListenMode(),
      toggleFocusMode: () => this.host.toggleFocusMode(),
      showText: () => this.setTextHidden(false),
      // Only over the full player; the rest of locking is `PocketMode`'s.
      setLocked: (locked) => (!locked || this.isFullPlayerShowing()) && this.lock.setLocked(locked),
    },
    () => this.lock.isLocked()
  );
  private playerCoverEl: HTMLImageElement | null = null;
  private playerCoverFallbackEl: HTMLElement | null = null;
  private playerTitleEl: HTMLElement | null = null;
  private playerAuthorEl: HTMLElement | null = null;
  private playerPlayBtn: HTMLButtonElement | null = null;
  private playerPlayIconEl: HTMLElement | null = null;
  private hlIconEl: HTMLElement | null = null;
  private noteIconEl: HTMLElement | null = null;
  private chapterLabelEl: HTMLElement | null = null;
  /** Voice-name spans of the chip in the compact bar + full-screen player (both show the active voice and open the
   *  Voice & source picker). */
  private voiceChipEls: HTMLElement[] = [];
  /** The second half of the same chips: the selected recording or mix, hidden when there is nothing to name. */
  private voiceChipSrcEls: HTMLElement[] = [];
  /** Each chip's speed, and whether it gives way to the names — `voice-chip.ts`. */
  private readonly chipSpeeds = new ChipSpeeds();
  /** Watches the bar chip's slot, whose width is the bar's — see `ChipSpeeds`. */
  private chipSlotObserver: ResizeObserver | null = null;
  /** What the chips' accessible name says, kept so a speed change can repaint it — see `paintChipAria`. */
  private chipAria: { voice: string; source?: string; reason: string; speakable: boolean } | null = null;
  /** The origin glyph on the same chips — mic when the audio was recorded, arcs when it is being spoken now. */
  private voiceChipIconEls: HTMLElement[] = [];
  private voiceChipBtns: HTMLElement[] = [];
  /** The section the chip currently shows the voice for — so a per-page relocate doesn't re-fetch
   *  unless the chapter actually changed (see updateVoiceChip). */
  private chipSection = -1;
  /** Monotonic id of the newest chip fetch, so an older one that finishes late doesn't paint over it. */
  private chipRequest = 0;
  private progressFillEl: HTMLElement | null = null;
  /**
   * The contents entry the transport last stepped to, or null when the position came from anywhere else.
   *
   * **Because the book cannot always say which entry you are in.** `tocHrefForRange` asks foliate, which answers
   * with the entry for the position — and in a book whose Days are nested INSIDE an outer element with its own
   * contents entry, every position inside them answers with the outer one. So ⏭ would read "you are in entry 1",
   * step to entry 2, and on the next press read "you are in entry 1" again: moving every time and never
   * advancing.
   *
   * Remembered rather than derived, and only for as long as the player owns the position. Anything that moves the
   * audio from outside — a relocate, a CFI seek, a scrub — clears it, so this can never disagree with the book
   * about where the reader actually is.
   */
  private tocStepHref: string | null = null;
  /**
   * A part the transport asked the READER to navigate to, still waiting to be landed on precisely.
   *
   * **Because the reader lands on a page, not on a position.** A step to another file goes through the reader's
   * own navigation, whose audio-follow seeks to the destination PAGE TOP — which is a few units short of the
   * part's start, and therefore inside the previous part's span, so the bar would arrive at a new chapter reading
   * 92% of the old one. Held until the destination's document exists, then spent on an exact landing.
   *
   * A part index rather than an href, because a slice of a divided chapter has no href: nothing in the contents
   * points eight hours into a file.
   */
  private pendingPart: number | null = null;
  /**
   * Where each contents entry begins in this section's reading units — the spans the player measures a chapter by.
   *
   * Rebuilt with the duration model, because it is part of it: the bar, the elapsed and remaining readouts and the
   * scrub all describe ONE entry, not the file it happens to share with seventy-nine others. Empty for a section
   * whose contents entry is the file itself, which is most books, and which measures the whole file.
   */
  private entryStarts: EntryStart[] = [];
  /** The scrub track itself — focusable, and the element carrying the slider's ARIA. See `paintScrub`. */
  private progressTrackEl: HTMLElement | null = null;
  private elapsedEl: HTMLElement | null = null;
  private remainingEl: HTMLElement | null = null;
  private bookLeftEl: HTMLElement | null = null;
  private coverObjectUrl: string | null = null;
  /** The OS media controls — media keys, the Now Playing card. See `media-session.ts`. */
  private readonly media = new MediaSessionBridge({
    isPlaying: () => this.state === 'playing',
    togglePlayPause: () => this.togglePlayPause(),
    skipTrack: (dir) => this.skipChapter(dir),
    skipSeconds: (sec) => this.skipSeconds(sec),
    skipBackSeconds: () => this.host.skipBackSeconds(),
    skipForwardSeconds: () => this.host.skipForwardSeconds(),
    trackDurationSec: () => this.chapterDurationSec(),
    seekToTrackFraction: (f) => this.seekToChapterFraction(f),
  });
  private coverLoadedForFile: string | null = null;

  // Duration model for the current section: words per unit + cumulative, plus the
  // word total of all later sections (for the whole-book estimate).
  private unitWords: number[] = [];
  private sectionCumWords: number[] = [0];
  private laterSectionWords = 0;
  /** Fraction (0..1) through the current unit, from the latest progress tick. */
  private unitFrac = 0;
  /** Flat sentence list for the section (across chunk boundaries) — the seek granularity
   *  for ≈15s skipping. Each entry maps a sentence to its unit + the fraction into that
   *  unit's text where the sentence starts (so a clip can begin partway through). */
  private sectionSentences: Array<{ unitIdx: number; startFraction: number }> = [];
  private sentenceCumWordsFlat: number[] = [0];
  /** Fraction into the next unit to begin at (set by a seek, consumed by speakUnit). */
  private pendingStartFraction = 0;
  /** Set when a skip happened while paused: the next resume restarts from the moved position
   *  rather than resuming the (now-abandoned) suspended clip. */
  private resumeFromPosition = false;
  /** True between a chapter skip and the first audio of the new chapter (loading indicator). */
  private loadingChapter = false;
  /** Section index whose adjacent chapters we've already scheduled for pre-caching. */
  private adjacentCachedFor = -1;
  /** Normalized clip texts waiting to be pin-cached (drained one per idle tick). */
  private chapterCacheQueue: string[] = [];

  /** Hook the view sets to close the search / Go To bars before this one opens
   *  (they share the top slot and are mutually exclusive). */
  onBeforeOpenBar?: () => void;
  /** Run after the listening bar opens or closes, so the bar registry can re-read what is on screen. */
  onBarStateChanged?: () => void;

  /** "Listen needs a voice", and whether it needs asking — `voice-gate.ts`. Built in the constructor: it reads
   *  `ctx`, which a field initializer would see before it is assigned. */
  private readonly voiceGate: VoiceGate;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: TtsHost
  ) {
    this.voiceGate = new VoiceGate({
      app: ctx.app,
      host,
      partIndex: () => this.currentChapterIndex(),
      deviceSource: () => this.deviceSource(),
      resolveSource: () => this.resolveSource(),
      resetEngine: () => this.resetEngine(),
    });
  }

  get toolbarButton(): HTMLButtonElement | null {
    return this.toolbarBtn;
  }

  // ── DOM construction ──────────────────────────────────────────────────────

  buildToolbarButton(container: HTMLElement): void {
    this.toolbarBtn = container.createEl('button', { cls: 'orbis-ctrl-btn', attr: { 'data-orbis-opens': 'listen' } });
    this.toolbarBtn.setAttribute('aria-label', t('toolbar.read_aloud'));
    setSvgIcon(this.toolbarBtn, SPEAKER_SVG);
    // A mouse click leaves the keyboard on the book (`toolbar-keys.ts`); Enter or Space — `detail` 0 — takes it into the bar.
    this.toolbarBtn.addEventListener('click', (e) => this.toggle(e.detail === 0));
  }

  buildBar(container: HTMLElement, coverContainer: HTMLElement): void {
    const bar = container.createDiv({ cls: 'orbis-tts-bar' });
    // Escape puts a bar with nothing in it away and the keyboard on the book, in one press — as the search and Go to
    // bars do. With audio in it the bar stays (`closesOnEscape`), and Escape only hands the keyboard back.
    bar.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.closesOnEscape()) return;
      e.preventDefault();
      this.closeBar();
      this.ctx.hostEl?.focus({ preventScroll: true });
    });
    // Focusable by script only, so opening the bar can put the keyboard AT it without claiming one of its controls —
    // see `doOpenBar`.
    bar.tabIndex = -1;
    bar.hide();
    this.barEl_ = bar;
    this.coverContainer = coverContainer;

    // Listen (headphones) — enter the full-screen player. Leftmost.
    const listenBtn = bar.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-listen' });
    this.listenBtn = listenBtn;
    listenBtn.setAttribute('aria-label', t('tts.show_player'));
    setSvgIcon(listenBtn.createSpan({ cls: 'orbis-tts-icon' }), HEADPHONES_SVG);
    listenBtn.addEventListener('click', () => this.setTextHidden(true));

    /**
     * Voice/source chip — shows the active voice and where it came from, and opens the Voice & source picker. Sits
     * on the left (upstream of transport) so "what am I listening to?" is visible and one tap to change.
     *
     * **In a slot, so the transport stays put.** The pill is sized by its contents — which change when you switch
     * source, or simply turn a page in a mix — and unslotted, everything downstream of it would slide along with
     * it. The slot holds a fixed width off the phone; the pill sizes to its text inside it, so its hover fill and
     * focus mode's themed pill still hug the words rather than stretching to a reserved width. See the CSS.
     */
    const voiceSlot = bar.createDiv({ cls: 'orbis-tts-bar-voice-slot' });
    this.buildVoiceChip(voiceSlot, 'orbis-tts-bar-voice', true);
    // The slot's width comes from the row, so this is the bar's width changing — see `ChipSpeeds`.
    this.chipSlotObserver = new ResizeObserver(() => this.chipSpeeds.fit());
    this.chipSlotObserver.observe(voiceSlot);

    // Transport: ⟲15 · play · 15⟳ (circular, mirroring the full player).
    const backBtn = bar.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-bar-skip' });
    setSvgIcon(backBtn.createSpan({ cls: 'orbis-tts-icon' }), SKIP_BACK_SM_SVG);
    this.skipBackBtns.push(backBtn);
    // Amount read at click time, not captured: it's configurable and can change mid-session.
    backBtn.addEventListener('click', () => this.skipSeconds(-this.host.skipBackSeconds()));

    this.playBtn = bar.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-play' });
    this.playIconEl = this.playBtn.createSpan({ cls: 'orbis-tts-icon' });
    this.playBtn.addEventListener('click', () => this.togglePlayPause());

    const fwdBtn = bar.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-bar-skip' });
    setSvgIcon(fwdBtn.createSpan({ cls: 'orbis-tts-icon' }), SKIP_FWD_SM_SVG);
    this.skipFwdBtns.push(fwdBtn);
    fwdBtn.addEventListener('click', () => this.skipSeconds(this.host.skipForwardSeconds()));

    // No speed here: it is in Voice and source, which the chip opens (`buildSpeedControl`), so the transport has the
    // room to be spaced for a thumb without the bar growing or the chip's names losing any.

    const closeBtn = bar.createEl('button', { cls: 'orbis-ctrl-btn orbis-sb-close', text: '×' });
    closeBtn.setAttribute('aria-label', t('tts.close'));
    closeBtn.addEventListener('click', () => this.closeBar());

    this.buildPlayer(coverContainer);

    this.rate = this.host.ttsRate() || 1;
    this.updateSpeedLabel();
    this.updatePlayButton();
  }

  /** The full-screen "now playing" player, shown over the reader when text is hidden. */
  private buildPlayer(coverContainer: HTMLElement): void {
    const player = coverContainer.createDiv({ cls: 'orbis-tts-player' });
    player.hide();
    this.playerEl = player;

    const showText = player.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-player-collapse' });
    showText.setAttribute('aria-label', t('tts.show_text'));
    setSvgIcon(showText, CHEVRON_DOWN_SVG);
    showText.addEventListener('click', () => this.setTextHidden(false));
    this.lock.buildButton(player, () => this.pocket.lock());

    // Lock directions, shown above the cover only while locked.
    this.lock.buildHint(player);

    this.playerCoverEl = player.createEl('img', { cls: 'orbis-tts-player-cover' });
    this.playerCoverEl.setAttribute('alt', '');
    this.playerCoverEl.hide(); // shown once a cover blob loads
    // Stand-in for books with no cover art, so the player isn't left with a hole where one belongs.
    // Rendered, not a generated image — see loadCover.
    this.playerCoverFallbackEl = player.createDiv({ cls: 'orbis-tts-player-cover' });
    this.playerCoverFallbackEl.hide();

    const meta = player.createDiv({ cls: 'orbis-tts-player-meta' });
    this.playerTitleEl = meta.createDiv({ cls: 'orbis-tts-player-title' });
    this.playerAuthorEl = meta.createDiv({ cls: 'orbis-tts-player-author' });

    this.chapterLabelEl = player.createDiv({ cls: 'orbis-tts-player-chapter-label' });

    // Voice/source chip under the chapter label — the player's gateway to the Voice & source
    // picker.
    this.buildVoiceChip(player, 'orbis-tts-player-voice', false);

    const progress = player.createDiv({ cls: 'orbis-tts-player-progress' });
    const track = progress.createDiv({ cls: 'orbis-tts-progress-track' });
    this.progressTrackEl = track;
    this.progressFillEl = track.createDiv({ cls: 'orbis-tts-progress-fill' });
    this.wireProgressScrub(track);
    const times = progress.createDiv({ cls: 'orbis-tts-player-times' });
    this.elapsedEl = times.createDiv();
    this.bookLeftEl = times.createDiv({ cls: 'orbis-tts-time-book' });
    this.remainingEl = times.createDiv();

    const transport = player.createDiv({ cls: 'orbis-tts-player-transport' });
    const controls = transport.createDiv({ cls: 'orbis-tts-player-controls' });
    const prevChapter = controls.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-player-chapter' });
    prevChapter.setAttribute('aria-label', t('tts.previous_track'));
    setSvgIcon(prevChapter.createSpan({ cls: 'orbis-tts-icon' }), PREV_SVG);
    prevChapter.addEventListener('click', () => this.skipChapter(-1));

    const skipBack = controls.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-player-skip' });
    setSvgIcon(skipBack.createSpan({ cls: 'orbis-tts-icon' }), SKIP_BACK_SVG);
    this.skipBackBtns.push(skipBack);
    skipBack.addEventListener('click', () => this.skipSeconds(-this.host.skipBackSeconds()));

    this.playerPlayBtn = controls.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-player-play' });
    this.playerPlayIconEl = this.playerPlayBtn.createSpan({ cls: 'orbis-tts-icon' });
    this.playerPlayBtn.addEventListener('click', () => this.togglePlayPause());

    const skipFwd = controls.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-player-skip' });
    setSvgIcon(skipFwd.createSpan({ cls: 'orbis-tts-icon' }), SKIP_FWD_SVG);
    this.skipFwdBtns.push(skipFwd);
    skipFwd.addEventListener('click', () => this.skipSeconds(this.host.skipForwardSeconds()));

    const nextChapter = controls.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-player-chapter' });
    nextChapter.setAttribute('aria-label', t('tts.next_track'));
    setSvgIcon(nextChapter.createSpan({ cls: 'orbis-tts-icon' }), NEXT_SVG);
    nextChapter.addEventListener('click', () => this.skipChapter(1));

    /**
     * **Configure to capture, left to right: marks, passage, note, bookmark.** The bookmark — the quickest "keep this
     * moment" while listening — is nearest a right thumb, and the marks button sits beside the two buttons whose marks
     * it picks. No speed button: speed is changed in Voice and source, and the chip above shows it.
     */
    const actions = transport.createDiv({ cls: 'orbis-tts-player-actions' });

    // Same glyph as the reader toolbar and the mark list. The two buttons beside it — Mark the passage and Note —
    // apply the book's two role marks, and this picks them in one step rather than opening the whole Marks
    // dialog. Manage marks in there reaches the rest.
    const marksBtn = actions.createEl('button', { cls: 'orbis-tts-player-action' });
    marksBtn.setAttribute('aria-label', t('mark_roles.title'));
    setSvgIcon(marksBtn.createSpan({ cls: 'orbis-tts-action-glyph' }), annotationsSvg(20));
    marksBtn.addEventListener('click', () => this.host.openMarkRoles());

    const hlBtn = actions.createEl('button', { cls: 'orbis-tts-player-action' });
    hlBtn.setAttribute('aria-label', t('tts.highlight'));
    const hlRow = hlBtn.createSpan({ cls: 'orbis-tts-action-iconrow' });
    setSvgIcon(hlRow.createSpan({ cls: 'orbis-tts-action-plus' }), PLUS_SVG);
    this.hlIconEl = hlRow.createSpan({ cls: 'orbis-tts-action-glyph' });
    hlBtn.addEventListener('click', () => this.doHighlight());

    const noteBtn = actions.createEl('button', { cls: 'orbis-tts-player-action' });
    noteBtn.setAttribute('aria-label', t('tts.add_note'));
    const noteRow = noteBtn.createSpan({ cls: 'orbis-tts-action-iconrow' });
    setSvgIcon(noteRow.createSpan({ cls: 'orbis-tts-action-plus' }), PLUS_SVG);
    this.noteIconEl = noteRow.createSpan({ cls: 'orbis-tts-action-glyph' });
    noteBtn.addEventListener('click', () => this.doAddNote());

    const bmBtn = actions.createEl('button', { cls: 'orbis-tts-player-action' });
    bmBtn.setAttribute('aria-label', t('tts.bookmark'));
    const bmRow = bmBtn.createSpan({ cls: 'orbis-tts-action-iconrow' });
    setSvgIcon(bmRow.createSpan({ cls: 'orbis-tts-action-plus' }), PLUS_SVG);
    setSvgIcon(bmRow.createSpan({ cls: 'orbis-tts-action-glyph' }), BOOKMARK_SVG);
    bmBtn.addEventListener('click', () => this.doBookmark());

    this.updateActionIcons();
    this.lock.buildRail(player);
  }

  // ── On-screen control lock (pocket mode) ────────────────────────────────────

  /** Whether the full-screen "now playing" player is currently showing. */
  isFullPlayerShowing(): boolean {
    return this.textHidden && !!this.playerEl?.isShown();
  }

  /** Whether the on-screen control lock is engaged (pocket mode). */
  isControlLockActive(): boolean {
    return this.lock.isLocked();
  }

  /** The command: Pocket mode on, or off when on — see `PocketMode`. */
  togglePocketMode(): void {
    this.pocket.toggle();
  }

  // ── Bar open/close ────────────────────────────────────────────────────────

  isBarOpen(): boolean {
    return !!this.barEl_?.isShown() || this.textHidden;
  }

  /** Put aside by search, Go to or the display menu — see `suspendForOtherBar`. */
  isSuspended(): boolean {
    return this.suspended;
  }

  /**
   * Whether listening is speaking now. While it is, the AUDIO decides where the book is — each sentence is saved as
   * the book's place — and a page the view turns to follow it is not; paused or stopped, the view decides again.
   */
  isPlaying(): boolean {
    return this.state === 'playing';
  }

  /**
   * Can Escape from the book put the bar away? Only when it is just a bar — open, nothing playing or paused, and not
   * the full player. Closing stops playback, and a reader pressing Escape to clear a selection must not lose the
   * audio they were listening to.
   */
  closesOnEscape(): boolean {
    return !!this.barEl_?.isShown() && !this.textHidden && this.state === 'idle';
  }

  /** Toggle the bar (and playback). Used by the toolbar button and command. */
  toggle(focusBar = true): void {
    if (this.isBarOpen()) this.closeBar();
    else this.openBar(focusBar);
  }

  /** Command entry: enter listen mode (open bar → full player), or exit it. Does NOT
   *  auto-play — the user presses ▶ when ready. */
  toggleListenMode(): void {
    if (this.textHidden) {
      this.closeBar(); // already listening → cancel + close the toolbar
      return;
    }
    if (!this.barEl_?.isShown()) this.openBar();
    this.setTextHidden(true);
  }

  /**
   * Enter listen mode, idempotently, reporting whether it could.
   *
   * `toggleListenMode` is the command's shape: arriving at it twice is a request to leave. Arriving HERE twice —
   * from the Library, or from a `listen` deep link that retries while the book renders — must not close what it
   * just opened, and must not hide the text before there is a player to replace it with. Hence the boolean: the
   * caller retries while the bar is still being built rather than leaving a blank page behind.
   */
  startListenMode(): boolean {
    if (this.textHidden) return true; // already listening — nothing to do, and nothing to undo
    if (!this.barEl_) return false; // the reader is still coming up; ask again
    if (!this.barEl_.isShown()) this.openBar();
    this.setTextHidden(true);
    return true;
  }

  /** Whether the reader's chrome has been built yet. The listen bar is the last of it, so a reader that has one
   *  has everything an open intent might ask for — see `OrbisReaderView.applyOpenIntent`. */
  barReady(): boolean {
    return !!this.barEl_;
  }

  openBar(focusBar = true): void {
    if (!this.barEl_) return;
    void this.maybeOnboardThenOpen(focusBar);
  }

  /** `focusBar`: whether the keyboard goes in with the bar — not after a mouse click, which left it on the book. */
  private doOpenBar(focusBar = true): void {
    if (!this.barEl_) return;
    this.onBeforeOpenBar?.();
    this.ctx.closePanel();
    if (this.suspended) {
      this.restoreFromSuspend();
      return;
    }
    // The bar's visibility is a function of listen mode, not of who opened it. Opening is ASYNC — the first-voice
    // gate has to be consulted before the bar can appear — so entering listen mode from the Library, a deep link
    // or the command hides the text FIRST and arrives here afterwards. Showing the bar unconditionally then paints
    // it over the full player, and over the chevron that gets you back to the text: listening with no way out.
    this.barEl_.toggle(!this.textHidden);
    this.onBarStateChanged?.();
    this.toolbarBtn?.classList.add('is-active');
    void this.updateVoiceChip(true); // reflect the active voice/recording each time the bar opens
    // Do NOT auto-play — the user presses ▶ when ready (they may want to set the
    // speed first). Show the bar in the idle/paused state.
    this.updatePlayButton();
    this.setReaderTopSpace(!this.textHidden && this.ctx.focusMode); // player covers text; compact bar mustn't
    /**
     * **The keyboard goes in with the bar.**
     *
     * These are real buttons, but they sit after the book in the DOM — and once focus is in the book, Tab is claimed
     * for link seeding (see `ReaderDom`), so a reader who opened the player from the toolbar could Tab all day and
     * never reach ▶. Moving focus in is what the content panel and the display menu already do on open; `closeBar`
     * already hands it back to the toolbar button.
     *
     * **The bar itself, not one of its buttons.** Landing on ▶ would put the keyboard in the middle of the row, so the
     * first Tab would go to the fourth icon. Landing on the leftmost button is no better in practice: after a mouse
     * click Chromium will not paint `:focus-visible` for a programmatic focus, so the button would hold the keyboard
     * invisibly and the first Tab would appear to start at the second control. Focusing the CONTAINER says "you are
     * here, nothing is chosen" — and Tab from it goes to the first control inside, which is what a toolbar should do.
     */
    if (this.barEl_.isShown() && focusBar) this.barEl_.focus();
    this.prewarm(); // warm the engine + synth the first unit so ▶ has little/no wait
  }

  /** Whether this device can speak right now — see `VoiceGate.canSpeakNow`. The chip and Voice and source ask too. */
  canSpeakNow(): Promise<boolean> {
    return this.voiceGate.canSpeakNow();
  }

  /** First-run gate (see FirstVoiceModal): the first time a device would Listen with an Orbis
   *  voice that isn't downloaded, prompt before the ~60 MB download instead of pulling it
   *  silently. On system voices, show a one-time hint. Otherwise open the bar normally. */
  private async maybeOnboardThenOpen(focusBar: boolean): Promise<void> {
    this.voiceGate.hintSystemVoiceOnce();
    /**
     * **A track with a recording needs no voice**, so opening on one does not ask for a download — a recorded book
     * plays on a device that has never had a voice. The question is asked where it applies: ▶ on a track that has
     * to be read live (`startAuto`).
     */
    if ((await this.host.currentVoiceInfo(this.describedChapterIndex())).recorded) {
      this.doOpenBar(focusBar);
      return;
    }
    await this.voiceGate.withVoice((justDownloaded) => {
      this.doOpenBar(focusBar);
      if (justDownloaded) this.togglePlayPause(); // "Download and listen" — they asked to listen
    });
  }

  /** Reserve/release top space in the reader so the overlaying compact bar doesn't cover text in focus mode.
   *  The full player covers everything, so no reservation is needed while text is hidden. Shared with the
   *  search and Go To bars — see `setReaderTopSpace`, the one definition for all three. */
  private setReaderTopSpace(reserved: boolean): void {
    setReaderTopSpace(this.ctx.foliateView?.renderer, this.barEl_ ?? null, reserved);
  }

  /** Focus mode toggled: reserve/release while the compact bar is showing. */
  onFocusModeToggled(active: boolean): void {
    if (this.barEl_?.isShown()) this.setReaderTopSpace(active);
    if (!active) this.lock.setLocked(false); // the lock only applies in focus mode
  }

  /** Create the engine (kicks off the model load on Piper) and pre-synthesize the first unit,
   *  so pressing play after opening the bar is near-instant. Best-effort; safe if not ready. */
  private prewarm(): void {
    if (this.state !== 'idle') return;
    // **Only a voice already on this device.** Warming loads the model, and an Orbis model that is not on disk is
    // downloaded to load it — so opening the bar fetched a deleted voice back, unasked, before anything was played.
    void this.voiceGate.deviceVoiceReady().then((ready) => {
      if (ready && this.state === 'idle') this.warm();
    });
  }

  private warm(): void {
    const doc = this.currentDoc();
    if (!doc || !this.ensureEngine()) return;
    this.sectionIdx = this.ctx.currentSectionIndex;
    this.units = getReadingUnits(doc, this.host.readAheadMaxChars());
    const pr = this.host.currentPageRange();
    const startAt = pr && pr.startContainer.ownerDocument === doc ? pr : null;
    // The sentence listening stopped at, when the book reopened there and it is still on screen; else the page top.
    this.unitIdx = unitIndexForRange(this.units, this.host.resumeRangeOnPage(doc) ?? startAt);
    this.computeDurationModel();
    const first = this.units[this.unitIdx]?.text;
    if (first) this.engine?.prime?.(normalizeForSpeech(first, this.pronouncer()));
  }

  /** Ensure the engine exists and is wired for rate + progress; returns it (null = no live
   *  engine on this platform). Reused across prewarm/start so the model stays warm. */
  private ensureEngine(): TtsEngine | null {
    this.dropEngineIfVoiceChanged(); // Settings changed the voice → rebuild with it
    if (!this.engine) {
      this.engine = this.makeEngine();
      if (!this.engine) return null;
      this.rate = this.host.ttsRate() || 1;
      this.engine.setRate(this.rate);
      this.engine.onProgress = (frac) => this.onSpeechProgress(frac);
      this.updateSpeedLabel();
    }
    return this.engine;
  }

  closeBar(): void {
    this.stop();
    this.suspended = false;
    this.resumeAnchorCfi = null;
    this.media.clear();
    // Drop the cached engine so reopening the bar rebuilds it with the current settings — this
    // is the reliable recovery path when the voice was changed in Settings (WARM stays warm at
    // module scope, so a same-voice reopen is still fast).
    this.resetEngine();
    this.setTextHidden(false);
    this.barEl_?.hide();
    this.onBarStateChanged?.();
    this.setReaderTopSpace(false);
    this.toolbarBtn?.classList.remove('is-active');
    this.toolbarBtn?.focus();
  }

  private currentSentenceCfi(): string | null {
    if (this.usingRecording) return this.recordedSegCfi;
    const r = this.currentSentenceRange();
    return r ? this.host.cfiForRange(r, this.sectionIdx) : null;
  }

  /** Another top-strip surface (search / go-to / display) is opening and displacing the audio
   *  bar. Instead of tearing playback down, pause and hide the chrome while keeping the engine and
   *  the exact position, so reopening resumes right where you were. Captures a CFI anchor first, in
   *  case the other action re-renders the section (Display) and kills the live Range. */
  suspendForOtherBar(): void {
    if (this.suspended || (this.state === 'idle' && !this.isBarOpen())) return;
    this.logTransport('suspend-for-other-bar');
    const wasPlaying = this.state === 'playing';
    this.resumeAnchorCfi = this.currentSentenceCfi();
    this.navigatedWhileSuspended = false;
    if (this.state === 'playing') {
      this.pausePlayback();
    }
    // Announce the pause only when the transport goes away mid-playback — the bar is now hidden,
    // so without this the user has no on-screen cue that (or why) audio stopped.
    if (wasPlaying) new Notice(t('tts.paused_notice'));
    this.suspendMode = this.textHidden ? 'player' : 'compact';
    this.suspended = true;
    this.textHidden = false; // so isBarOpen() reports closed while suspended
    this.host.setFullPlayerActive(false); // player hidden — restore history nav + focus chip
    this.playerEl?.hide();
    this.barEl_?.hide();
    this.onBarStateChanged?.();
    this.setReaderTopSpace(false);
    this.toolbarBtn?.classList.remove('is-active');
    this.ctx.debug(
      `tts suspend mode=${this.suspendMode} anchor=${this.resumeAnchorCfi?.slice(0, 40) ?? 'none'}`,
      'tts'
    );
  }

  /** Reopening the audio bar after a suspend: restore the chrome (paused). The playback cursor is
   *  settled lazily when the user presses ▶ (see the resume path), so a section re-rendered while
   *  suspended is re-seated at the CFI anchor then. */
  private restoreFromSuspend(): void {
    this.suspended = false;
    this.toolbarBtn?.classList.add('is-active');
    if (this.suspendMode === 'player') {
      this.textHidden = true;
      this.host.setFullPlayerActive(true); // full player back — hide history nav + focus chip
      this.playerEl?.show();
      this.barEl_?.hide();
      this.updatePlayerMeta();
      this.updateActionIcons();
      void this.loadCover();
    } else {
      this.textHidden = false;
      this.host.setFullPlayerActive(false);
      this.barEl_?.show();
      this.setReaderTopSpace(this.ctx.focusMode);
    }
    this.updateChapterLabel();
    this.updateDurationDisplay();
    this.updatePlayButton();
    this.onBarStateChanged?.();
    if (this.usingRecording) this.refreshRecordedHighlight(); // the live range may have died in a re-render
  }

  /** A Display-menu or Settings change is about to re-render the section, which will kill the live
   *  Range the player is on. Capture the CFI anchor and pause now, before the DOM is rebuilt. */
  onBeforeReRender(): void {
    if (this.state === 'idle') return;
    this.logTransport('pause-before-rerender');
    const wasPlaying = this.state === 'playing';
    if (!this.resumeAnchorCfi) this.resumeAnchorCfi = this.currentSentenceCfi();
    if (this.state === 'playing') {
      this.pausePlayback();
    }
    // Settings/Display re-render behind a covering modal/menu — announce the pause (the suspend
    // path already toasts when it hides the bar itself, and `wasPlaying` keeps it to one toast).
    if (wasPlaying && !this.suspended) new Notice(t('tts.paused_notice'));
  }

  /** Put the playback cursor in the right place before resuming: a navigation while suspended →
   *  follow the book; the live pointer died (a re-render) → re-seat at the CFI anchor; otherwise
   *  the retained pointer is fine (resume-exact). Returns true when the position was moved. */
  private async settleResumePosition(): Promise<boolean> {
    const anchor = this.resumeAnchorCfi;
    this.resumeAnchorCfi = null;
    if (this.navigatedWhileSuspended) {
      this.navigatedWhileSuspended = false;
      const target = this.suspendTargetCfi;
      this.suspendTargetCfi = null;
      if (target) await this.seekToCfi(target);
      else this.syncToView();
      return true;
    }
    if (this.currentReadingRange?.startContainer.isConnected) return false; // resume-exact
    // Live pointer is gone (Display/Settings re-rendered the section) — re-seat at the anchor.
    const loc = anchor ? await this.host.resolveCfi(anchor) : null;
    const doc = loc?.range.startContainer.ownerDocument ?? null;
    if (!loc || !doc) {
      this.syncToView();
      return true;
    }
    this.clearHighlight();
    this.sectionIdx = loc.sectionIndex;
    this.units = getReadingUnits(doc, this.host.readAheadMaxChars());
    this.unitIdx = unitIndexForRange(this.units, loc.range);
    this.pendingStartFraction = 0;
    this.computeDurationModel();
    this.updateChapterLabel();
    this.updateDurationDisplay();
    const unit = this.units[this.unitIdx];
    if (unit) this.beginUnitHighlight(unit, 0);
    this.ctx.debug(`tts reseat section=${this.sectionIdx} unit=${this.unitIdx}/${this.units.length}`, 'tts');
    return true;
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  /** The user's compiled pronunciation respellings, or null when the dictionary is empty. Fetched
   *  per call rather than cached here — the host owns the compile and its invalidation, so a
   *  settings change takes effect on the next sentence without the controller tracking it. */
  private pronouncer(): Pronouncer | null {
    return this.host.pronouncer();
  }

  private resolveSource(): 'orbis' | 'system' {
    return this.liveOverride?.source ?? this.deviceSource(); // a mix chapter's pinned live voice, else the device's
  }

  /** The device's own live voice source, whatever a mix says — what `resolveSource` falls to without an override:
   *  • 'system' pref → Web Speech, but fall back to Orbis if this device has no system voices
   *    (e.g. an Android device that synced a 'system' pref chosen on a Mac).
   *  • 'orbis' pref, or no pref at all → Piper, even where the OS has voices of its own. */
  private deviceSource(): 'orbis' | 'system' {
    const systemOk = WebSpeechEngine.isSupported();
    const pref = this.host.deviceVoicePref();
    if (pref?.source === 'system') return systemOk ? 'system' : 'orbis';
    if (pref?.source === 'orbis') return 'orbis';
    // Nothing chosen: an Orbis voice, even where the OS has its own. See `resolveDeviceLiveVoice` for why — and
    // note that this is what lets `maybeOnboardThenOpen` offer the first-run download on a desktop.
    return 'orbis';
  }

  private makeEngine(): TtsEngine | null {
    this.engineVoiceKey = this.resolvedVoiceKey(); // remember which voice this engine speaks
    const ov = this.liveOverride;
    if (ov?.source === 'system') return new WebSpeechEngine(ov.uri);
    const cacheDir = `${this.ctx.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
    if (ov?.source === 'orbis') {
      const p = new PiperEngine(this.ctx.app.vault.adapter, cacheDir, ov.path, ov.sid);
      p.setLogger((msg) => this.ctx.debug(msg, 'tts'));
      return p;
    }
    if (this.resolveSource() === 'system') return new WebSpeechEngine(this.host.resolvedSystemVoiceURI());
    const { path, sid } = this.host.resolvedOrbisVoice();
    const p = new PiperEngine(this.ctx.app.vault.adapter, cacheDir, path, sid);
    p.setLogger((msg) => this.ctx.debug(msg, 'tts'));
    return p;
  }

  /** The voice the current settings (or a mix chapter's live override) resolve to (source + model +
   *  speaker id), for detecting a mid-session voice change and rebuilding the engine. */
  private resolvedVoiceKey(): string {
    const ov = this.liveOverride;
    if (ov?.source === 'system') return `system:${ov.uri}`;
    if (ov?.source === 'orbis') return `orbis:${ov.path}#${ov.sid}`;
    if (this.resolveSource() === 'system') return `system:${this.host.resolvedSystemVoiceURI() ?? ''}`;
    const { path, sid } = this.host.resolvedOrbisVoice();
    return `orbis:${path}#${sid}`;
  }

  /** Drop the engine (and, with it, its in-memory synth cache) when Settings changed the resolved
   *  voice since it was built — so the next synth/resume rebuilds and re-synthesizes with the new
   *  voice rather than replaying old-voice clips. Returns true when it dropped the engine. */
  private dropEngineIfVoiceChanged(): boolean {
    if (!this.engine || this.engineVoiceKey === this.resolvedVoiceKey()) return false;
    this.engine.stop();
    this.engine.dispose();
    this.engine = null;
    this.ctx.debug('tts: voice changed in Settings — engine + synth cache dropped, re-synthesizing', 'tts');
    return true;
  }

  private currentDoc(): Document | null {
    const renderer = this.ctx.foliateView?.renderer as unknown as {
      getContents?: () => Array<{ index: number; doc: Document }>;
    };
    const contents = renderer?.getContents?.() ?? [];
    const match = contents.find((c) => c.index === this.ctx.currentSectionIndex);
    return (match ?? contents[0])?.doc ?? null;
  }

  /** `keepCursor`: a pre-play skip or scrub already chose a sentence, so start there rather than re-deriving the
   *  position from the page the reader happens to be showing. */
  private start(keepCursor = false): void {
    if (this.state !== 'idle' && !keepCursor) return;
    const doc = this.currentDoc();
    if (!doc) {
      new Notice(t('notices.tts_not_ready'));
      this.closeBar();
      return;
    }
    const engine = this.ensureEngine();
    if (!engine) {
      // No live engine on this platform (Android WebView has no speechSynthesis).
      new Notice(t('notices.tts_no_live_engine'));
      this.closeBar();
      return;
    }
    this.host.onEngineResolved?.(engine.id);

    const mc = this.host.readAheadMaxChars();
    const readAhead = mc === 0 ? 'sentence' : `few-sentences(${mc})`;
    if (!keepCursor) this.seatAtReadingPosition(doc);
    this.preplayPaused = false; // whatever a pre-play gesture chose has now been spent
    this.ctx.debug(`read-aloud start engine=${engine.id} readAhead=${readAhead} units=${this.units.length}`, 'tts');
    void this.loadCover();
    this.setupMediaSession(); // install OS media-control handlers on first play
    this.updateChapterLabel();

    this.state = 'playing';
    this.updatePlayButton();
    this.updateMediaMetadata();
    this.updateDurationDisplay();
    void this.runLoop(++this.epoch);
  }

  /**
   * Seat the reading units and the cursor where the reader is looking.
   *
   * Shared by the two first-play paths. The recorded one needs it BEFORE it picks an MP3: which part the reader is
   * parked in is a question about the POSITION, and the position is not answerable until the units are here.
   */
  private seatAtReadingPosition(doc: Document): void {
    this.sectionIdx = this.ctx.currentSectionIndex;
    this.units = getReadingUnits(doc, this.host.readAheadMaxChars());
    // A page range still pointing into the PREVIOUS section (a cross-section relocate mid-flight) would map to
    // unit 0 — the section top — so ignore it and take the start of the document we actually have.
    const pr = this.host.currentPageRange();
    const startAt = pr && pr.startContainer.ownerDocument === doc ? pr : null;
    // The sentence listening stopped at, when the book reopened there and it is still on screen; else the page top.
    this.unitIdx = unitIndexForRange(this.units, this.host.resumeRangeOnPage(doc) ?? startAt);
    this.computeDurationModel();
  }

  // ── Recorded recording (offline MP3) ────────────────────────────────────────

  /** True while playing a pre-generated chapter MP3 rather than a live engine. */
  private get usingRecording(): boolean {
    return this.recorded !== null;
  }

  /** The recorded audio for a CHAPTER, or null when the book has none for it — or when the user has chosen the
   *  live voice as the playback source (then generated audio is ignored). */
  private async loadRecordedFor(chapterIndex: number): Promise<RecordedChapter | null> {
    if (this.host.playbackSource() === 'live' || chapterIndex < 0) return null;
    try {
      // Edition-type-aware (the host resolves a mix chapter from its source edition's folder).
      return await this.host.loadActiveEditionChapter(chapterIndex);
    } catch {
      return null;
    }
  }

  /** Re-seat the current chapter under a just-changed playback source / active edition, preserving
   *  the position and play/pause state. No-op when not listening (the change takes effect on the next
   *  play). Drops the current recorded player first so navigateAudioToCfi does a fresh load rather
   *  than seeking within the now-stale MP3 (a different edition is the same section + cfi). */
  /**
   * Repaint the voice chip, without touching playback.
   *
   * **For a change to what the selection is CALLED rather than which one it is.** Renaming a recording changes the
   * chip's second half and nothing else — `reloadForPlaybackChange` would be wrong here, because re-seating the
   * audio to rewrite a label would interrupt what a reader is listening to. Without it, a rename would leave the
   * chip showing whatever it had computed earlier: an edition renamed to "Banana" would still read `Heart` (the
   * voice it falls back to when unnamed) until a chapter turned over.
   */
  refreshVoiceChip(): void {
    void this.updateVoiceChip(true);
  }

  async reloadForPlaybackChange(): Promise<void> {
    void this.updateVoiceChip(true); // the source/edition changed — refresh the chip even when idle
    // Only re-seat when audio is actually loaded (playing or paused). If the bar is open but idle
    // — e.g. the gear popup opened before pressing play — the new source/edition just applies on the
    // next play; don't start playback here.
    if (this.state === 'idle') return;
    const cfi = this.pageTopCfi();
    if (!cfi) return;
    this.overridePart = null; // the edition changed → re-resolve any mix live-voice override
    this.disposeRecorded();
    await this.navigateAudioToCfi(cfi);
    // Again, now the audio has settled: re-seating can land on a different chapter part, and whether THIS chapter
    // has a recorded track under the new selection is exactly what the glyph reports.
    void this.updateVoiceChip(true);
  }

  /** Start playback of the current chapter: prefer recorded audio when it exists (offline,
   *  device-local), else the live engine. Async because the recorded check reads the manifest + MP3. */
  private async startAuto(): Promise<void> {
    // `preplayPaused` is a first play too — see the field. Read it before the await, since the load can outlive it.
    const preplay = this.preplayPaused;
    if (this.state !== 'idle' && !preplay) return;
    const myEpoch = this.epoch;
    const chapter = await this.loadRecordedFor(this.partIndexForFirstPlay());
    // A stop, a close or a navigation raced the async load — each bumps the epoch. A `state === 'idle'` test cannot
    // see a stop, which leaves the state idle and so reads as "still fine to start".
    if (this.epoch !== myEpoch) return;
    if (!chapter) {
      /**
       * **The voice is required HERE, and nowhere earlier.**
       *
       * A chapter with recorded audio plays without any voice at all, so gating ▶ itself would block recorded
       * playback on a device that has never downloaded one. This is the single line where the live engine takes
       * over, which makes it the only place the question has to be asked.
       *
       * Without it, pressing ▶ with no voice would do nothing whatsoever — the engine has nothing to speak with
       * and says so to no one.
       */
      await this.voiceGate.withVoice(() => this.start(preplay));
      return;
    }
    /**
     * Where to begin — decided BEFORE the recorded player is installed.
     *
     * A pre-play skip or scrub chose a sentence, and that wins; otherwise the sentence the cursor was seated on — the
     * one listening stopped at, when the book reopened there and it is on screen (`resumeRangeOnPage`), else the
     * top of the page.
     *
     * **The order is the whole point.** `currentSentenceCfi` answers about the recorded SEGMENT as soon as a
     * recorded player exists, and `startRecorded` clears that segment on its way in — so asking afterwards would
     * return null, fall through to the page top (a view that never paged, so: the top of the chapter) and start
     * the track from its beginning, throwing away the scrub that had just chosen the spot.
     */
    const cfi = (preplay ? this.currentSentenceCfi() : null) ?? this.seatedCfi() ?? this.pageTopCfi();
    this.startRecorded(chapter);
    const idx = cfi ? segmentIndexForCfi(chapter.segments, cfi) : 0;
    this.ctx.debug(
      `first play: part=${chapter.chapterIndex} seg=${idx}/${chapter.segments.length} preplay=${preplay} from=${cfi?.slice(0, 44) ?? 'none'}`,
      'tts'
    );
    if (idx > 0) this.recorded?.seekToSegment(idx);
  }

  /**
   * Which part ▶ should begin, for a player that has not played anything yet.
   *
   * **The position, not the href.** `partIndexAt` answers by href, and every slice of a divided chapter shares
   * one — so by href, pressing ▶ two thirds of the way through a four-track chapter would load the first track and
   * throw the reader back an hour. Seating the units first is what makes the better question answerable: the entry
   * spans are the same arithmetic that decided what each MP3 holds, so they know which track the page is in.
   *
   * The href remains the fallback, for a position above the section's first entry (front matter in a file whose
   * contents entries begin partway down) and for a section whose document is not rendered.
   *
   * Seating here means `start()` seats again on the no-recording path. That is one extra pass over one section's
   * units on a button press, and it keeps both paths reading from a single seating method.
   */
  private partIndexForFirstPlay(): number {
    // A pre-play skip or scrub already chose a sentence — re-seating from the page would throw it away, and with
    // it the whole point of that gesture. Otherwise the book is the authority: seat from where the reader looks.
    if (!this.preplayPaused) {
      const doc = this.currentDoc();
      if (doc) this.seatAtReadingPosition(doc);
    }
    const fromSpan = this.currentSpan().partIndex;
    if (fromSpan >= 0) return fromSpan;
    return partIndexAt(this.host.chapterParts(), this.ctx.currentSectionIndex, this.ctx.tocItemHref);
  }

  /** Load a recorded chapter into a fresh player and begin playing (used for first play and
   *  cross-chapter switches). Preserves nothing — callers re-apply a paused state if needed. */
  private startRecorded(chapter: RecordedChapter): void {
    this.disposeRecorded();
    const player = new RecordedAudioPlayer({
      onSegment: (_i, seg) => void this.onRecordedSegment(seg),
      onTime: (cur) => this.onRecordedTime(cur),
      onEnded: () => void this.onRecordedEnded(),
    });
    this.recorded = player;
    this.recordedChapterIdx = chapter.chapterIndex;
    // The SECTION the chapter lives in — several chapters can share one, so this is not the chapter's own number.
    this.sectionIdx = this.host.chapterParts()[chapter.chapterIndex]?.sectionIndex ?? this.sectionIdx;
    this.preplayPaused = false; // whatever a pre-play gesture chose has now been spent
    this.recordedSegments = chapter.segments;
    this.recordedDurationSec = chapter.duration;
    // Every later track: recorded ones at their real length, the rest at the live estimate — see `bookSecondsAfter`.
    this.recordedLaterSec = bookSecondsAfter(
      chapter.chapterIndex,
      chapter.laterRecorded,
      this.host.chapterWords(),
      NARRATION_WPM * this.rate
    );
    this.recordedCurSec = 0;
    this.recordedSegCfi = null;
    // A recording plays at once, so nothing is loading. Without this, ⏮ onto a live track in another file (which
    // shows "Loading track…" until the voice speaks) and ⏮ again onto a recorded one left the label stuck there.
    this.loadingChapter = false;
    player.load(chapter);
    player.setRate(this.rate);
    this.setupMediaSession();
    this.updateChapterLabel();
    this.state = 'playing';
    this.updatePlayButton();
    this.updateMediaMetadata();
    this.updateDurationDisplay();
    void this.loadCover();
    this.ctx.debug(
      `recorded start chapter=${chapter.chapterIndex} dur=${chapter.duration.toFixed(1)}s segs=${chapter.segments.length}`,
      'tts'
    );
    void player.play();
  }

  /** Active segment changed — resolve its CFI to a live range and draw the reading highlight
   *  (which page-follows in read-along, or saves the listening location under the full player). */
  private async onRecordedSegment(seg: RecordingSegment): Promise<void> {
    if (!seg.cfi) return;
    this.recordedSegCfi = seg.cfi;
    let loc = await this.host.resolveCfi(seg.cfi);
    // A page turn left the file this track is in (see `returnToReadingSection`): bring it back, then look again.
    if (!loc && !this.textHidden && this.recorded && this.recordedSegCfi === seg.cfi) {
      await this.ctx.foliateView?.goTo(seg.cfi);
      loc = await this.host.resolveCfi(seg.cfi);
    }
    if (!this.recorded || this.recordedSegCfi !== seg.cfi) return; // stopped or superseded
    if (!loc) return;
    this.sectionIdx = loc.sectionIndex;
    this.highlight(loc.range); // draws + pages to the sentence start; resets lastPagedTo
    this.recordedCurSeg = seg; // for within-sentence page-follow as playback advances
    this.updateChapterLabel();
  }

  private onRecordedTime(cur: number): void {
    this.recordedCurSec = cur;
    this.updateDurationDisplay();
    this.recordedPageFollow(cur);
  }

  /** Step the word highlight and page the reader forward *within* the current sentence as the
   *  audio reaches the part on the next page — the recorded-audio counterpart of the live engine's
   *  onSpeechProgress, but driven by real playback time (the manifest's per-segment start/dur)
   *  rather than an elapsed estimate. No-op under the full player. */
  private recordedPageFollow(cur: number): void {
    if (this.textHidden) return; // player covers the view — nothing to page
    const seg = this.recordedCurSeg;
    const range = this.currentReadingRange;
    if (!seg || !range || seg.dur <= 0) return;
    const within = Math.max(0, Math.min(1, (cur - seg.start) / seg.dur));
    this.followWord(within);
    const renderer = this.ctx.foliateView?.renderer as unknown as PageFollowRenderer | undefined;
    if (!renderer) return;
    this.lastPagedTo = pageTowardFraction(renderer, range, within, this.lastPagedTo, (anchor) => {
      this.ctx.navSuppressor.suppressThenClearSoon(); // don't let foliate's focusin scroll fight ours
      try {
        void renderer.scrollToAnchor?.(anchor, false);
      } catch {
        /* ignore */
      }
    });
  }

  /** Chapter MP3 finished — auto-advance to the next recorded chapter, or stop at end-of-book /
   *  the first ungenerated chapter. */
  private async onRecordedEnded(): Promise<void> {
    // From the MP3's own chapter, not from the section it sits in — a file holding eighty chapters would otherwise
    // advance eighty times to the same place.
    const next = this.recordedChapterIdx + 1;
    if (next <= 0 || next >= this.host.chapterParts().length) {
      this.stop();
      return;
    }
    await this.goToChapter(next); // next recorded chapter, or fall back to the live engine
  }

  /** Re-resolve and redraw the highlight for the current segment — after a re-render killed the
   *  live range, or when returning to the text from the full player. */
  private refreshRecordedHighlight(): void {
    const cfi = this.recordedSegCfi;
    if (!cfi) return;
    void this.host.resolveCfi(cfi).then((loc) => {
      if (loc && this.recorded) {
        this.sectionIdx = loc.sectionIndex;
        this.highlight(loc.range);
      }
    });
  }

  /** Move the audio to a navigation target (bookmark / highlight / note / search / Go-To / history),
   *  choosing the method by the DESTINATION chapter: its recorded MP3 when it has one, else the live
   *  engine — so the two methods are fully interchangeable on navigation, not just chapter skips.
   *  Preserves play/pause. This is the "audio location follows the ebook location" primitive. */
  private async navigateAudioToCfi(cfi: string): Promise<void> {
    const loc = await this.host.resolveCfi(cfi);
    const target = loc?.sectionIndex ?? this.sectionIdx;
    const wasPaused = this.state === 'paused';
    const targetChapter = this.chapterIndexForLoc(target, loc?.range ?? null);
    const chapter = await this.loadRecordedFor(targetChapter);
    if (chapter) {
      // Destination has recorded audio.
      //
      // **No anchor landing here, and the pending one is dropped rather than carried.** The destination's own MP3
      // is what plays and seeking inside it is by segment, which is what the lines below do. Leaving the href
      // pending would spend it on a later navigation that never asked for it.
      this.pendingPart = null;
      if (this.recorded && targetChapter === this.recordedChapterIdx) {
        const idx = segmentIndexForCfi(this.recordedSegments, cfi);
        if (idx >= 0) this.recorded.seekToSegment(idx); // same MP3 — just seek within it
        return;
      }
      // Switch to the destination's MP3 (from the live engine, or a different recorded chapter).
      this.engine?.stop();
      this.epoch++; // cancel any in-flight live loop
      this.clearHighlight();
      this.startRecorded(chapter);
      const idx = segmentIndexForCfi(chapter.segments, cfi);
      if (idx >= 0) this.recorded?.seekToSegment(idx);
      if (wasPaused) this.pauseRecorded();
      return;
    }
    // Destination has no recorded audio — fall back to the live engine at the target.
    this.disposeRecorded();
    if (!this.ensureEngine()) {
      new Notice(t('notices.tts_no_live_engine'));
      this.stop();
      return;
    }
    await this.seekToCfi(cfi);
    this.landOnPendingEntry();
  }

  /**
   * Finish a cross-file chapter step on the anchor, now that its document is here.
   *
   * The reader has put the audio on the destination's page top, which is the right SECTION and the wrong place in
   * it — a page top sits a few units above the anchor, so the span containing it is the previous entry's and the
   * bar shows that entry nearly finished. This is the correction, and it runs after the follow rather than instead
   * of it: if the anchor cannot be found, the reader's landing is still where the reader wanted to be.
   */
  private landOnPendingEntry(): void {
    const idx = this.pendingPart;
    this.pendingPart = null;
    if (idx === null) return;
    const part = this.host.chapterParts()[idx];
    if (!part || !this.landOnPart(part)) {
      this.ctx.debug(`skip chapter: part ${idx} not in section ${this.sectionIdx} — kept the reader's spot`, 'tts');
    }
  }

  private pauseRecorded(): void {
    this.logTransport('pause-recorded');
    this.state = 'paused';
    this.updatePlayButton();
    this.recorded?.pause();
  }

  /**
   * Move playback to a chapter — by its ordinal in `host.bookChapters()` — preferring its recorded audio when it
   * exists and falling back to the live engine otherwise, so prev/next and end-of-chapter auto-advance cross
   * freely between generated and ungenerated chapters. That interchangeability is what a MIX is made of, and with
   * chapters inside shared files it is per contents entry rather than per file.
   *
   * `seam` is a 15-second skip that ran off one end of its track: it carries the leftover seconds so playback
   * lands that far inside the destination rather than at its edge, and it declines the move when the destination
   * has no recording — see `skipSeconds`.
   */
  private async goToChapter(target: number, seam?: SeamCrossing): Promise<void> {
    const chapters = this.host.chapterParts();
    const chapter = chapters[target];
    if (!chapter) return;
    const wasPaused = this.state === 'paused';
    const recorded = await this.loadRecordedFor(target);
    // A seam crossing is a small step across a boundary between two RECORDINGS. Falling back to the live engine
    // here would answer "go back fifteen seconds" by starting the previous track from its beginning, half an hour
    // earlier, in a different voice — so when the neighbor has no MP3 the skip stays where it is instead.
    if (seam && !recorded) return;
    if (recorded) {
      this.engine?.stop(); // leave the live engine if we were on it
      this.epoch++; // cancel any in-flight live loop
      this.pendingPart = null; // nothing to land on: seeking inside an MP3 is by segment
      // The reader goes to the part's own anchor when it has one. `goToSectionStart` alone would park it at the
      // top of a file that may hold eighty chapters, so the text and the audio would start in different places.
      // Position the reader without starting the live engine — the MP3 below is what reads from here.
      const startHref = partStartHref(chapter);
      if (this.showPartInView(chapter)) {
        // already there
      } else if (startHref) this.host.goToTocHref(startHref);
      else this.host.goToSectionStart(chapter.sectionIndex);
      this.clearHighlight();
      this.startRecorded(recorded);
      /**
       * Land the leftover seconds inside the destination: a backward skip measures them from its END, which is
       * where the reader is arriving from.
       *
       * By time, not snapped to a sentence. Snapping looks tidier and is wrong by up to a whole sentence in the
       * only direction that matters here — backwards, away from the seam — so three seconds before the end of the
       * previous track could land eighteen seconds before it. The seam is already an approximation; there is no
       * reason to add to it, and the highlight follows the position either way.
       */
      if (seam) this.recorded?.seek(seamOffsetSec(seam, this.recordedDurationSec || recorded.duration));
      if (wasPaused) this.pauseRecorded();
      return;
    }
    // No recorded audio for this chapter — the live engine, from the chapter's start.
    this.disposeRecorded();
    if (!this.ensureEngine()) {
      new Notice(t('notices.tts_no_live_engine'));
      this.stop();
      return;
    }
    // Already in this chapter's file: move the reading cursor to its anchor. Handing it to the reader instead
    // produces no usable relocate for a same-document jump — see `landOnPart`.
    // A part in the file already loaded is reached by moving the cursor to its start unit. Handing it to the
    // reader instead produces no usable relocate for a same-document jump — see `landOnPart`.
    if (this.landOnPart(chapter)) return;
    this.engine?.stop();
    this.clearHighlight();
    this.pendingStartFraction = 0;
    this.loadingChapter = true;
    if (!wasPaused) {
      this.state = 'playing';
      this.updatePlayButton();
    }
    this.updateChapterLabel();
    // A different file: the reader loads it and the audio follows to its page top, which is a few units above a
    // mid-file anchor — so the entry is remembered and landed on once the document is here.
    this.pendingPart = target;
    void this.runLoopFromSection(chapter.sectionIndex, ++this.epoch, wasPaused);
  }

  private disposeRecorded(): void {
    this.recorded?.dispose();
    this.recorded = null;
    this.recordedChapterIdx = -1;
    this.recordedSegments = [];
    this.recordedSegCfi = null;
    this.recordedCurSeg = null;
    this.recordedCurSec = 0;
    this.recordedDurationSec = 0;
    this.recordedLaterSec = 0;
  }

  /** The full-screen player readout for recorded audio (time-based, from the MP3), mirroring
   *  `updateDurationDisplay` but with real durations rather than word estimates. */
  private updateRecordedDuration(): void {
    if (this.scrubbing) return;
    this.updateRecordedPositionState();
    if (!this.textHidden || !this.playerEl) return;
    const dur = this.recordedDurationSec || this.recorded?.duration || 0;
    const cur = Math.min(this.recordedCurSec, dur);
    this.paintScrub(dur > 0 ? cur / dur : 0);
    if (this.elapsedEl) this.elapsedEl.textContent = formatDuration(cur);
    if (this.remainingEl) this.remainingEl.textContent = `-${formatDuration(dur - cur)}`;
    if (this.bookLeftEl) {
      this.bookLeftEl.textContent = t('tts.book_left', { time: formatDuration(dur - cur + this.recordedLaterSec) });
    }
  }

  private updateRecordedPositionState(): void {
    const duration = this.recordedDurationSec || this.recorded?.duration || 0;
    this.media.setPosition(duration, this.recordedCurSec, this.rate);
  }

  /** The user navigated the underlying book (a content-panel item: chapter, bookmark, highlight,
   *  note). Move the player to wherever the view landed — "go to the location and play from
   *  there" — for both the full-screen player and the compact bar (so a paused bar resumes at the
   *  new spot, not the old one). Returns true when handled/synced; false to retry on a later
   *  relocate (target section not rendered yet). */
  onUserNavigated(targetCfi: string | null): boolean {
    // Suspended (bar displaced by search/go-to): remember we moved (and where) so the resume
    // follows the book — to the precise target sentence when there is one.
    if (this.suspended) {
      this.navigatedWhileSuspended = true;
      this.suspendTargetCfi = targetCfi;
      this.clearHighlight(); // the book has moved on — the sentence it marked is not where ▶ will start
      return true;
    }
    if (!this.isBarOpen()) return true; // bar not open: nothing to reposition
    // Bar open but idle (opened, never played) — there's no audio to follow, and re-seating a
    // recorded chapter would auto-start it. The next Play picks up the current location.
    if (this.state === 'idle') return true;
    // Audio follows the ebook location. Use the precise target when there is one (bookmark /
    // highlight / note / search sentence), else the destination page top (coarse chapter / % jumps
    // and history back-forward). `navigateAudioToCfi` picks the method — recorded MP3 or live engine
    // — by the destination chapter. Page swipes / page buttons never reach here, so they don't move
    // the audio (page-follow snaps the view back to the playing sentence).
    const cfi = targetCfi ?? this.pageTopCfi();
    if (!cfi) return false; // destination not resolvable yet — retry on a later relocate
    void this.navigateAudioToCfi(cfi);
    return true;
  }

  /**
   * CFI of the sentence the cursor was seated on — `seatAtReadingPosition`'s answer, which is the reopened-at sentence
   * when there is one. Null when nothing is seated in this section.
   */
  private seatedCfi(): string | null {
    const unit = this.units[this.unitIdx];
    return unit && this.sectionIdx === this.ctx.currentSectionIndex
      ? this.host.cfiForRange(unit.range, this.sectionIdx)
      : null;
  }

  /** CFI of the sentence/range at the top of the current page, or null. */
  private pageTopCfi(): string | null {
    const pr = this.host.currentPageRange();
    return pr ? this.host.cfiForRange(pr, this.ctx.currentSectionIndex) : null;
  }

  /** Re-seat the player at the sentence containing `cfi` (a precise navigation target), preserving
   *  play/pause. Falls back to the page top if the CFI can't be resolved. */
  private async seekToCfi(cfi: string): Promise<void> {
    // A position from outside the transport — a contents-panel click, a bookmark, a search hit. The remembered
    // entry describes where the BUTTONS had gone, and keeping it here would leave the label naming a chapter the
    // reader had navigated away from, with ⏭ counting from it too.
    this.tocStepHref = null;
    const loc = await this.host.resolveCfi(cfi);
    const doc = loc?.range.startContainer.ownerDocument ?? null;
    if (!loc || !doc) {
      this.syncToView();
      return;
    }
    if (this.syncingToView) return;
    this.syncingToView = true;
    try {
      this.engine?.stop();
      this.clearHighlight();
      this.sectionIdx = loc.sectionIndex;
      this.units = getReadingUnits(doc, this.host.readAheadMaxChars());
      this.unitIdx = unitIndexForRange(this.units, loc.range);
      this.pendingStartFraction = 0;
      this.computeDurationModel();
      this.updateChapterLabel();
      this.updateDurationDisplay();
      this.epoch += 1;
      this.ctx.debug(
        `tts seekToCfi section=${this.sectionIdx} unit=${this.unitIdx}/${this.units.length} state=${this.state}`,
        'tts'
      );
      if (this.state === 'playing') {
        this.updatePlayButton();
        void this.runLoop(this.epoch);
      } else {
        const unit = this.units[this.unitIdx];
        if (unit) this.beginUnitHighlight(unit, 0);
        if (this.state === 'paused') this.resumeFromPosition = true;
      }
    } finally {
      this.syncingToView = false;
    }
  }

  /** The rendered document for the view's *current* section — exactly, no fallback to some
   *  other loaded section (unlike `currentDoc`). Null while the target is still rendering. */
  private currentSectionDoc(): Document | null {
    return this.sectionDoc(this.ctx.currentSectionIndex);
  }

  /**
   * The rendered document for one section.
   *
   * **By index, because "current" means two different things here.** `currentSectionDoc` asks for the VIEW's
   * section, which is right for syncing to what is on screen and wrong for anything measuring the audio: during a
   * cross-section move the two disagree, and a caller that wanted the audio's document would silently get the
   * other one — finding anchors from a file the reading units do not come from.
   */
  private sectionDoc(index: number): Document | null {
    const renderer = this.ctx.foliateView?.renderer as unknown as {
      getContents?: () => Array<{ index: number; doc: Document }>;
    };
    return renderer?.getContents?.().find((c) => c.index === index)?.doc ?? null;
  }

  /** Re-seat playback at the view's current position (section + top-of-page sentence),
   *  preserving play/pause state: playing keeps playing from here, paused stays parked here
   *  ready to resume, idle just re-homes so the next Play starts here. Returns false when the
   *  target section hasn't rendered yet, so the caller can retry on a later relocate — a
   *  cross-section jump fires several relocates before the new section is laid out. */
  private syncToView(): boolean {
    if (this.syncingToView) return true; // re-entrancy guard (highlight paging fires a relocate)
    // Re-derived from the book, so the book is the authority on which entry this is — see `seekToCfi`.
    this.tocStepHref = null;
    const doc = this.currentSectionDoc();
    if (!doc) {
      this.ctx.debug(`tts syncToView: section ${this.ctx.currentSectionIndex} not rendered yet`, 'tts');
      return false;
    }
    const pr = this.host.currentPageRange();
    // Cross-section jumps fire transient relocates where the section index has advanced but the
    // page range still points into the OLD section's document. Using it would map to unit 0 (the
    // section start), so retry on a later relocate instead.
    if (pr && pr.startContainer.ownerDocument !== doc) {
      this.ctx.debug(`tts syncToView: page range not in section ${this.ctx.currentSectionIndex} yet — retry`, 'tts');
      return false;
    }
    this.syncingToView = true;
    try {
      this.engine?.stop();
      this.clearHighlight();
      this.sectionIdx = this.ctx.currentSectionIndex;
      this.units = getReadingUnits(doc, this.host.readAheadMaxChars());
      this.unitIdx = unitIndexForRange(this.units, pr ?? null);
      this.preplayPaused = false; // re-seated from the book — any pre-play choice is gone
      this.pendingStartFraction = 0;
      this.computeDurationModel();
      this.updateChapterLabel();
      this.updateDurationDisplay();
      this.epoch++; // cancel any in-flight loop
      this.ctx.debug(
        `tts syncToView section=${this.sectionIdx} unit=${this.unitIdx}/${this.units.length} state=${this.state}`,
        'tts'
      );
      if (this.state === 'playing') {
        this.updatePlayButton();
        void this.runLoop(this.epoch);
      } else {
        // paused or idle: home the highlight/duration here; a paused player resumes from here.
        const unit = this.units[this.unitIdx];
        if (unit) this.beginUnitHighlight(unit, 0);
        if (this.state === 'paused') this.resumeFromPosition = true;
      }
    } finally {
      this.syncingToView = false;
    }
    return true;
  }

  private togglePlayPause(): void {
    if (this.state === 'idle') {
      this.logTransport('play-first');
      void this.startAuto(); // prefer recorded audio for this chapter, else the live engine
      return;
    }
    if (this.recorded) {
      if (this.state === 'playing') {
        this.pauseRecorded();
      } else {
        this.logTransport('play-resume-recorded');
        // A navigation while the bar was displaced (search/Go-To) should be followed on resume,
        // method-aware — the destination may even be a chapter served the other way.
        const navTarget = this.navigatedWhileSuspended ? (this.suspendTargetCfi ?? this.pageTopCfi()) : null;
        this.resumeAnchorCfi = null;
        this.navigatedWhileSuspended = false;
        this.suspendTargetCfi = null;
        this.state = 'playing';
        this.updatePlayButton();
        if (navTarget) {
          void this.navigateAudioToCfi(navTarget);
        } else {
          // The audio position itself survived a re-render; just re-resolve the (possibly stale)
          // highlight range and continue from where the MP3 was.
          void this.recorded.play();
          this.refreshRecordedHighlight();
        }
      }
      return;
    }
    if (this.state === 'playing') {
      this.logTransport('pause-live');
      this.state = 'paused';
      this.updatePlayButton();
      if (this.engine?.canPauseMidUtterance()) this.engine.pause();
      else this.engine?.stop();
      return;
    }
    // paused → resume.
    //
    // **Except when nothing has played yet.** A pre-play skip or scrub promoted idle to paused to keep the
    // position it chose, and ▶ from there is still a FIRST play: it has to pick its method the same way, or
    // choosing where to begin quietly commits the chapter to the live voice even where a recording exists.
    // There is no live pointer to re-seat either, so a stale suspend anchor is dropped rather than settled.
    // A navigation while suspended is left to the settle path below, which is what knows how to follow it.
    if (this.preplayPaused && !this.navigatedWhileSuspended) {
      this.logTransport('play-first-after-preplay');
      this.resumeAnchorCfi = null;
      void this.startAuto();
      return;
    }
    // If a suspend/re-render left a resume anchor or a navigation, settle the position first (async: it may
    // need to resolve a CFI), then play from there.
    if (this.resumeAnchorCfi || this.navigatedWhileSuspended) {
      this.logTransport('play-resume-settle');
      void this.resumeAfterSettle();
      return;
    }
    this.logTransport('play-resume-live');
    this.state = 'playing';
    this.updatePlayButton();
    if (this.resumeFromPosition) {
      // A skip happened while paused — start from the moved position, not the old clip.
      this.resumeFromPosition = false;
      void this.runLoop(++this.epoch);
    } else if (this.loopRunning && this.engine?.canPauseMidUtterance() && !this.dropEngineIfVoiceChanged()) {
      this.engine.resume(); // loop frozen mid-clip — continue it exactly (unless the voice changed)
    } else {
      // Loop exited (paused between clips), or the voice changed. stop() clears the engine's paused
      // flag so the fresh clip actually starts (otherwise speak() defers it via pendingStart) — then
      // re-speak (speakUnit rebuilds the engine with the new voice if it was dropped).
      this.engine?.stop();
      void this.runLoop(++this.epoch);
    }
  }

  private async resumeAfterSettle(): Promise<void> {
    const moved = await this.settleResumePosition();
    this.state = 'playing';
    this.updatePlayButton();
    if (moved) {
      void this.runLoop(++this.epoch); // fresh loop from the new/re-seated position
    } else if (this.loopRunning && this.engine?.canPauseMidUtterance() && !this.dropEngineIfVoiceChanged()) {
      this.engine.resume(); // resume-exact: the loop is frozen mid-clip — continue it (voice unchanged)
    } else {
      // Loop exited (paused between clips), or the voice changed — clear the engine's paused flag so
      // the fresh clip starts (otherwise speak() defers it via pendingStart), then re-speak the
      // current unit (speakUnit rebuilds the engine with the new voice if it was dropped).
      this.engine?.stop();
      void this.runLoop(++this.epoch);
    }
  }

  /**
   * The ⟲/⟳ buttons: move by `delta` seconds, ±.
   *
   * The two engines answer this differently because seconds mean different things to them. A recorded track is an
   * MP3, so it simply seeks — see the branch below. The live engine has no position inside a sentence at all, so
   * seconds are converted to words at the current rate, the sentence at that offset is found, and playback
   * restarts there (partway through its chunk when the sentence is mid-chunk), guaranteeing at least one sentence
   * of movement so the button always does something.
   */
  private skipSeconds(delta: number): void {
    if (this.recorded) {
      /**
       * **Five seconds means five seconds.**
       *
       * Not snapped to a sentence boundary, as the live engine is — it reads sentence by sentence and has no
       * notion of a position inside one. A recorded track does: it is an MP3, and half way through a sentence is
       * a perfectly good place to be.
       *
       * Snapping would make the button unusable on long sentences. Picking the segment containing `t + 5` and
       * seeking to that segment's START, which is BEHIND `t + 5`, lands a forward tap inside an eighteen-second
       * sentence back where it began. The floating-point edge makes it worse: at a segment start the element can
       * sit a hair before it (1271.199… for 1271.2s), so `segmentIndexAt` answers with the previous segment, and
       * "advancing" to the next one seeks to the same place for as many taps as the reader cares to make.
       *
       * Seeking by TIME has none of those edges, and the highlight still follows: `timeupdate` maps whatever
       * position we land on back to its segment, so the sentence being spoken is the sentence shown.
       */
      const dur = this.recordedDurationSec || this.recorded.duration;
      const landing = skipLanding(this.recorded.currentTime, delta, dur);
      // Ran off one end of this track — carry the leftover seconds into the neighboring one. Off the end of the
      // BOOK, or a position in no part at all, falls through to the clamp below, so the button still moves to the
      // edge of the track it is in rather than doing nothing.
      if (landing.kind === 'cross') {
        const at = this.currentChapterIndex();
        const neighbour = at + landing.dir;
        if (at >= 0 && neighbour >= 0 && neighbour < this.host.chapterParts().length) {
          this.ctx.debug(`skip ${delta}s: off the ${landing.dir < 0 ? 'start' : 'end'} → part ${neighbour}`, 'tts');
          void this.goToChapter(neighbour, landing);
          return;
        }
      }
      // Clamped to the track when the neighbor could not be reached (the ends of the book, or a position in no
      // part at all), so the button still moves to the edge rather than doing nothing.
      const to =
        landing.kind === 'within' ? landing.seconds : Math.max(0, Math.min(dur, this.recorded.currentTime + delta));
      // `t=` is the truth about the audio, and the only way to tell "the seek did not happen" from "it happened
      // and five seconds of a 26-minute track is a third of a percent of the bar".
      this.ctx.debug(
        `skip ${delta}s: t=${this.recorded.currentTime.toFixed(1)}s→${to.toFixed(1)}s of ${dur.toFixed(0)}s`,
        'tts'
      );
      this.recorded.seek(to); // fires timeupdate → segment/highlight/readout update
      return;
    }
    // The same promotion the chapter buttons and the scrubber make: skipping before playing is choosing where ▶
    // will begin. The engine is not needed for it — `moveTo` on a paused player only moves the highlight — but the
    // sentence model is, since that is what a skip in seconds is measured against.
    if (!this.sectionSentences.length) return;
    if (this.state === 'idle') {
      this.state = 'paused';
      this.preplayPaused = true; // ▶ from here is still a first play — see the field
      this.updatePlayButton();
    }
    const wpm = NARRATION_WPM * this.rate;
    const curWords = (this.sectionCumWords[this.unitIdx] ?? 0) + this.unitFrac * (this.unitWords[this.unitIdx] ?? 0);
    const target = curWords + (delta / 60) * wpm;

    // Sentence whose word-span contains `target`.
    let flat = 0;
    while (flat + 1 < this.sectionSentences.length && this.sentenceCumWordsFlat[flat + 1] <= target) flat++;
    // Guarantee movement of at least one sentence in the requested direction.
    const curFlat = this.currentFlatSentence();
    if (delta > 0 && flat <= curFlat) flat = curFlat + 1;
    else if (delta < 0 && flat >= curFlat) flat = curFlat - 1;
    flat = Math.max(0, Math.min(flat, this.sectionSentences.length - 1));

    const target2 = this.sectionSentences[flat];
    // The live counterpart of the recorded line above: a skip here is measured in WORDS at the current rate, so
    // the sentence it reaches — and whether it reached a different one at all — is what says the tap worked.
    this.ctx.debug(
      `skip ${delta}s (live): sentence ${curFlat}→${flat}/${this.sectionSentences.length} · unit ${this.unitIdx}→${target2.unitIdx}`,
      'tts'
    );
    this.moveTo(target2.unitIdx, target2.startFraction);
  }

  /** Scrub: jump to `frac` (0–1) of the way through the current chapter — the sentence whose
   *  word span contains that fraction of the chapter's words (matching the progress-bar model). */
  private seekToChapterFraction(frac: number): void {
    if (this.recorded) {
      /**
       * Against the SAME total the bar and the readouts use.
       *
       * Not the media element's own duration, which is not the number the bar is drawn from: everything on
       * screen uses the manifest's duration for this track. The two can disagree — an encoder's padding, a
       * manifest written by a different run — and then dropping the thumb halfway along would land somewhere
       * other than half way, so the position the reader chose and the position the
       * bar shows are already out of step before anything else happens.
       */
      const dur = this.recordedDurationSec || this.recorded.duration || 0;
      if (dur > 0) this.recorded.seek(Math.max(0, Math.min(1, frac)) * dur);
      return;
    }
    if (!this.sectionSentences.length) return; // duration model not built yet
    // Within the current contents entry, not the file: dragging the bar to its middle means the middle of the
    // chapter named above it. `at()` converts a unit boundary to words so the span's own start can be added back.
    const span = this.currentSpan();
    const at = (i: number): number =>
      this.sectionCumWords[Math.max(0, Math.min(i, this.sectionCumWords.length - 1))] ?? 0;
    const spanWords = Math.max(0, at(span.end) - at(span.start));
    const target = at(span.start) + Math.max(0, Math.min(1, frac)) * spanWords;
    let flat = 0;
    while (flat + 1 < this.sectionSentences.length && this.sentenceCumWordsFlat[flat + 1] <= target) flat++;
    const s = this.sectionSentences[flat];
    // Loaded but never started (opened the player, not yet played): treat the scrub as choosing the
    // start point — become paused so ▶ resumes at the scrubbed spot (start() would otherwise
    // re-derive the position from the current page).
    if (this.state === 'idle') {
      this.state = 'paused';
      this.preplayPaused = true; // ▶ from here is still a first play — see the field
      this.updatePlayButton();
    }
    this.moveTo(s.unitIdx, s.startFraction);
  }

  /** Move the reading cursor to a unit + start fraction. If playing, restart playback there;
   *  if paused, update the highlight/position only and stay paused (resume plays from here). */
  private moveTo(unitIdx: number, startFraction: number): void {
    // The book is the authority again: a scrub, a skip in seconds or a resume knows nothing about contents
    // entries, so a remembered one would go stale. `skipChapter` re-sets it immediately after.
    this.tocStepHref = null;
    const wasPaused = this.state === 'paused';
    this.engine?.stop();
    this.clearHighlight();
    this.unitIdx = unitIdx;
    this.pendingStartFraction = startFraction;
    this.epoch++; // cancel any in-flight loop
    if (wasPaused) {
      const unit = this.units[this.unitIdx];
      if (unit) this.beginUnitHighlight(unit, startFraction);
      this.updateDurationDisplay();
      this.resumeFromPosition = true;
      return;
    }
    this.state = 'playing';
    this.updatePlayButton();
    void this.runLoop(this.epoch);
  }

  /** Index into `sectionSentences` of the sentence currently being read. */
  private currentFlatSentence(): number {
    let flat = 0;
    for (let u = 0; u < this.unitIdx; u++) flat += (this.units[u].sentences ?? [this.units[u]]).length;
    return flat + Math.max(0, this.curSentenceIdx);
  }

  /**
   * Jump to the previous/next chapter.
   *
   * **Contents entries, not spine sections.**
   *
   * Moving by file is right only where one file is one chapter. A book can keep 80 contents entries inside 7 files
   * — anchors in shared documents — so by file, four presses would reach the end of the book while the panel beside
   * it listed eighty, and the label directly above the buttons would name an entry the buttons could not reach. The
   * contents are what a reader is looking at on every other surface, so they are what these count.
   *
   * It is one step through `host.bookChapters()`, which is also what the recording surface records into and what
   * the contents panel lists — so "the next chapter" means the same thing to the button, the MP3 on disk and the
   * row in the list.
   */
  private skipChapter(dir: 1 | -1): void {
    /**
     * **Opened but never started is a state these buttons work in.** Refusing when idle would look like a platform
     * bug and not be one: a player left open on a desktop is usually PAUSED — something was played and stopped —
     * while a player just opened on a phone is IDLE. Same build, same code, two different states, and the
     * difference would look exactly like touch versus mouse.
     *
     * The scrubber answers this question the same way, a few methods up: choosing a position before
     * playing is choosing where ▶ will begin, so it promotes idle to paused rather than refusing. Choosing a
     * chapter is the same act. `goToChapter` honors `paused` on both its paths — recorded and live — so the
     * chapter changes, the label and the estimate follow, and nothing starts speaking until asked.
     */
    if (this.state === 'idle') {
      this.state = 'paused';
      this.updatePlayButton();
    }
    const chapters = this.host.chapterParts();
    if (!chapters.length) return;
    const at = this.currentChapterIndex();
    // A position in no chapter at all (a section the list somehow skipped): step by section and take whatever
    // chapter opens the destination, so the button moves rather than doing nothing.
    const target = at >= 0 ? at + dir : partIndexAt(chapters, this.sectionIdx + dir);
    if (target < 0 || target >= chapters.length) return; // the ends of the book
    this.ctx.debug(`skip chapter ${dir > 0 ? 'next' : 'prev'}: ${at} → ${target} "${chapters[target].label}"`, 'tts');
    void this.goToChapter(target);
  }

  /**
   * Put the reading cursor at the start of a PART inside the section already loaded.
   *
   * **Because a slice has nowhere to navigate to.** Nothing in the contents points eight hours into a file, so a
   * part divided out of a longer one has no href and no anchor of its own — so ⏮/⏭ falling through to the section's
   * start would send the reader to the top of the book while the audio played from the middle. A part's start is
   * a reading unit, computed by the same `partUnitRange` that decided what its MP3 holds.
   */
  /**
   * Whether `this.units` were read from this section's document.
   *
   * **Not the same question as `sectionIdx === n`.** `startRecorded` moves the audio's section to the part it is
   * about to play without reloading units — recorded playback is driven by manifest segments and needs none — so
   * the two can disagree, and anything that indexes into `units` has to ask this rather than trust the index.
   */
  private unitsBelongTo(sectionIndex: number): boolean {
    const doc = this.sectionDoc(sectionIndex);
    return !!doc && this.units.length > 0 && this.units[0].range.startContainer.ownerDocument === doc;
  }

  private partStartUnit(part: ChapterPart): number {
    if (part.sectionIndex !== this.sectionIdx) return -1;
    /**
     * **The PART's own section, and units that actually came from it.**
     *
     * `currentSectionDoc()` is the document the READER is showing, which is not always the one the audio is in —
     * and `this.units` are whatever was last loaded, which after a recorded track is not the current section at
     * all: `startRecorded` moves `sectionIdx` to the part's section without reloading units, because recorded
     * playback is driven by manifest segments and needs none.
     *
     * Trusting either would let ⏭ out of a recorded part into a live one measure one section's anchors against
     * another's units and land the live engine on a sentence from the chapter before, read in the new voice — a
     * mix that looks like it ignored the hand-off when in fact it jumped backwards.
     *
     * So this asks for the part's own document and reloads the units when they are from another one — or when
     * there are none: ⏮ onto the cover, which has no text, empties them, and a later ⏭ from a recorded part into a
     * live one in an already-open file then found nothing to land on and waited for a load that never came. The
     * reload is safe here: every caller is about to move the reading cursor into these units.
     */
    const doc = this.sectionDoc(part.sectionIndex);
    if (!doc) return -1;
    if (!this.unitsBelongTo(part.sectionIndex)) {
      this.ctx.debug(`part ${part.index}: units not from section ${part.sectionIndex} — reloading`, 'tts');
      this.units = getReadingUnits(doc, this.host.readAheadMaxChars());
      this.computeDurationModel();
    }
    if (!this.units.length) return -1;
    const siblings = this.host
      .chapterParts()
      .filter((p) => p.sectionIndex === part.sectionIndex && !(p.slice && p.slice.index > 0));
    const anchorAt = siblings.findIndex((p) => p.chapterHref === part.chapterHref);
    const [from] = partUnitRange(this.units, doc, {
      sectionAnchors: siblings.map((p) => p.anchor),
      anchorAt: anchorAt < 0 ? 0 : anchorAt,
      slice: part.slice,
    });
    return from >= 0 && from < this.units.length ? from : -1;
  }

  /**
   * Put the reading cursor and the view on a part WITHOUT starting anything — for the recorded path.
   *
   * **Because `moveTo` starts the live loop.** That is right when the live engine is what will read on from here,
   * and wrong when an MP3 is about to: calling it just before `startRecorded` would leave both running, so a
   * chapter's second track would play the recording and the Orbis voice over the top of each other, the live one
   * reading page markers that are not in the recording at all.
   */
  private showPartInView(part: ChapterPart): boolean {
    const from = this.partStartUnit(part);
    if (from < 0) return false;
    this.unitIdx = from;
    this.tocStepHref = partStartHref(part) ?? '';
    this.bringViewTo(this.units[from].range);
    return true;
  }

  /** Move the reading cursor to a part and, when playing, read on from there with the live engine. */
  private landOnPart(part: ChapterPart): boolean {
    const from = this.partStartUnit(part);
    if (from < 0) return false;
    const range = this.units[from].range;
    this.moveTo(from, 0); // clears `tocStepHref` — it is a position change like any other
    this.tocStepHref = partStartHref(part) ?? '';
    this.ctx.debug(`skip chapter: part ${part.index} "${part.label}" → unit ${from}/${this.units.length}`, 'tts');
    this.bringViewTo(range);
    this.updateChapterLabel();
    return true;
  }

  /** Navigate to `target` section, wait for it to load, then run the loop from its start.
   *  When `staysPaused`, highlight the chapter start but don't play (resume plays from here). */
  private async runLoopFromSection(target: number, myEpoch: number, staysPaused = false): Promise<void> {
    this.host.goToSectionStart(target);
    // A file already on screen fires no load, so waiting for one would hang until the timeout stopped playback.
    const shown = this.sectionDoc(target);
    if (shown) this.adoptSection(shown, target);
    const ok = shown ? true : await this.waitForSection(target); // onSectionLoaded sets units + unitIdx=0
    if (this.epoch !== myEpoch) return;
    if (!ok) {
      this.stop();
      return;
    }
    // A track partway through the file: land on it now the file is here, BEFORE the loop reads from the top. Left to
    // a later relocate, which only a reader's own navigation produces, ⏮ into "3 of 3" read from "1 of 3" instead.
    const pending = this.pendingPart === null ? undefined : this.host.chapterParts()[this.pendingPart];
    this.pendingPart = null;
    if (pending?.sectionIndex === target) this.showPartInView(pending);
    if (staysPaused) {
      this.loadingChapter = false;
      this.updateChapterLabel();
      const unit = this.units[this.unitIdx];
      if (unit) this.beginUnitHighlight(unit, 0);
      this.updateDurationDisplay();
      this.resumeFromPosition = true;
      return;
    }
    if (this.state !== 'playing') return;
    await this.runLoop(myEpoch);
  }

  private stop(): void {
    this.logTransport('stop');
    this.disposeRecorded();
    this.state = 'idle';
    this.preplayPaused = false;
    this.epoch++;
    const waiter = this.sectionWaiter;
    this.sectionWaiter = null;
    waiter?.resolve();
    this.engine?.stop();
    this.clearHighlight();
    this.loadingChapter = false;
    this.resumeFromPosition = false;
    this.chapterCacheQueue = [];
    this.adjacentCachedFor = -1;
    this.updateChapterLabel();
    this.updatePlayButton();
  }

  private async runLoop(myEpoch: number): Promise<void> {
    this.loopRunning = true;
    try {
      while (this.state === 'playing' && this.epoch === myEpoch) {
        if (this.unitIdx >= this.units.length) {
          if (!(await this.advanceToNextSection(myEpoch))) return;
          continue;
        }
        if (await this.handOffAtChapterBoundary(myEpoch)) return;
        const unit = this.units[this.unitIdx];
        if (!unit.text) {
          this.unitIdx += 1;
          continue;
        }
        if (!(await this.speakUnit(unit, myEpoch))) return;
        this.unitIdx += 1;
      }
    } finally {
      // Don't clear if a newer loop (epoch bumped) has already taken over.
      if (this.epoch === myEpoch) this.loopRunning = false;
    }
  }

  /**
   * Reading live and about to cross into a chapter that HAS a recording: hand over to the MP3.
   *
   * **Because a mix's chapters can share files.** A handoff only at a section boundary is enough where a chapter is
   * a file: a mix reading chapter 3 live and chapter 4 recorded switches at the join between two documents. On a
   * book that keeps eighty Days in seven files, that join is inside a document — so a live-voiced Day would read
   * straight on through every recorded Day after it in the same file.
   *
   * Only at the boundary itself, and only when the destination differs from what is playing: the check is one
   * comparison per sentence against the entry starts already computed for this section, and it reaches the vault
   * only on the sentence that actually begins a new chapter.
   *
   * Returns true when the loop should end because the recorded player has taken over.
   */
  private async handOffAtChapterBoundary(myEpoch: number): Promise<boolean> {
    if (this.entryStarts.length < 2) return false; // one chapter per file: the section boundary is the only join
    const start = this.entryStarts.find((e) => e.unitIdx === this.unitIdx);
    if (!start) return false;
    /**
     * **The span's own part, not a lookup by its href.**
     *
     * Asking `partIndexAt` by `start.href` answers with the FIRST part of the chapter, because every part of a
     * divided chapter shares one contents entry — which is the whole reason `EntryStart` carries `partIndex`. By
     * href, stepping out of a recorded "CHAPTER III 1 of 4" into a live "2 of 4" would resolve the destination
     * back to the first part, load its MP3 again, and send the mix round in a circle: the reader would press ⏭
     * and hear the recorded voice restart the part they had just left.
     */
    const target = start.partIndex;
    if (target < 0 || target === this.recordedChapterIdx) return false;
    const chapter = await this.loadRecordedFor(target);
    if (this.epoch !== myEpoch || this.state !== 'playing') {
      if (chapter) URL.revokeObjectURL(chapter.audioUrl);
      return false;
    }
    if (!chapter) return false; // the next chapter is live too — keep reading
    this.ctx.debug(`live → recorded at chapter ${target} (unit ${this.unitIdx})`, 'tts');
    this.engine?.stop();
    this.epoch++;
    this.clearHighlight();
    this.startRecorded(chapter);
    return true;
  }

  /** At a section boundary: advance to the next section and wait for it to load. Returns
   *  false (loop should stop) at end-of-book, on load failure, or if playback was cancelled. */
  private async advanceToNextSection(myEpoch: number): Promise<boolean> {
    const next = this.sectionIdx + 1;
    if (next >= this.ctx.bookSections.length) {
      this.stop();
      return false;
    }
    // If the next chapter has recorded audio (e.g. a mix's recorded chapter following a live one, or
    // any partially-recorded edition), hand off to the recorded player instead of continuing live.
    const chapter = await this.loadRecordedFor(partIndexAt(this.host.chapterParts(), next));
    if (this.epoch !== myEpoch || this.state !== 'playing') {
      if (chapter) URL.revokeObjectURL(chapter.audioUrl);
      return false;
    }
    if (chapter) {
      this.engine?.stop();
      this.epoch++;
      this.host.goToSectionStart(next);
      this.clearHighlight();
      this.startRecorded(chapter); // recorded player drives from here → this live loop ends
      return false;
    }
    // No recorded audio for the next chapter → keep reading live into it.
    this.host.goToSectionStart(next);
    const ok = await this.waitForSection(next);
    if (this.epoch !== myEpoch || this.state !== 'playing') return false;
    if (!ok) {
      this.stop();
      return false;
    }
    return true;
  }

  /** Highlight, prefetch-ahead, and speak the current unit. Returns false (loop should stop)
   *  on a fatal engine failure or if playback was cancelled mid-utterance. */
  private async speakUnit(unit: ReadingUnit, myEpoch: number): Promise<boolean> {
    this.ctx.debug(
      `unit ${this.unitIdx}/${this.units.length} text="${unit.text.slice(0, 70)}" range="${unit.range.toString().trim().slice(0, 70)}"`,
      'tts'
    );
    /**
     * The live-voice override for the PART being read — the single point all live playback passes through.
     *
     * **A mix assigns voices per chapter, so this asks per part, not per section.** `mixLiveVoiceFor` takes a
     * chapter index and looks its pointer up by it; `sectionIdx` agrees with it only by coincidence, on books where
     * a section holds one chapter. On a divided chapter they diverge completely: stepping from a recorded
     * "CHAPTER III 1 of 4" into a live "2 of 4" never leaves the section, so a per-section cache would decide
     * nothing had changed, fetch no override, and let the device's own voice read a part the mix had assigned to
     * another — while the chip, which asks by part, named the right one.
     */
    const part = this.currentChapterIndex();
    // A live part is about to speak: is there a voice to speak with? Asked per part and whenever the engine is new,
    // because ▶'s own question is only asked on a first play — see `askForVoiceMidSession`.
    if (this.voiceCheckedPart !== part || !this.engine) {
      if (!(await this.canSpeakNow())) {
        this.askForVoiceMidSession();
        return false;
      }
      if (this.epoch !== myEpoch || this.state !== 'playing') return false;
      this.voiceCheckedPart = part;
    }
    if (this.overridePart !== part) {
      this.overridePart = part;
      const { voice, unavailable } = await this.host.mixLiveVoiceOnDevice(part);
      this.liveOverride = voice;
      if (unavailable && !this.voicesNotHere.has(unavailable)) {
        this.voicesNotHere.add(unavailable);
        new Notice(t('notices.mix_voice_not_here', { voice: unavailable }), 8000);
      }
      if (this.epoch !== myEpoch || this.state !== 'playing') return false; // a stop/skip raced the load
      this.dropEngineIfVoiceChanged(); // rebuild with the override (or back to the default voice)
    }
    const engine = this.ensureEngine(); // rebuilds if Settings changed the voice (before we prime it)
    if (!engine) {
      this.stop();
      return false;
    }
    const startFraction = this.pendingStartFraction;
    this.pendingStartFraction = 0;
    this.beginUnitHighlight(unit, startFraction);
    this.primeAhead();
    this.scheduleAdjacentCache();
    // Structure-aware pause after this unit: a beat longer at a paragraph break (the next unit
    // came from a different block), a clear rest at a chapter end (last unit of the section — the
    // loop advances to the next section after this). Same-block next unit → normal sentence gap.
    const next = this.units[this.unitIdx + 1];
    const pauseKind: PauseKind = !next ? 'chapter' : next.block !== unit.block ? 'paragraph' : 'sentence';
    try {
      await engine.speak(normalizeForSpeech(unit.text, this.pronouncer()), startFraction, interClipPauseMs(pauseKind));
    } catch (err) {
      // Fatal engine failure (e.g. Piper couldn't load the voice — offline first run).
      // Stop cleanly with a message rather than racing silently through the whole book.
      // The notice can't say why; the debug log must, or a runtime failure reads as a network one.
      this.ctx.debug(`engine failed to start: ${String(err)}`, 'tts');
      new Notice(t('notices.listening_stopped_voice_not_loaded'));
      this.stop();
      return false;
    }
    if (this.epoch !== myEpoch || this.state !== 'playing') return false;
    this.clearHighlight();
    return true;
  }

  /**
   * Pause where we are and ask for a voice, then carry on from the same sentence once there is one.
   *
   * **Every route into the live voice, not only the first ▶.** Resuming, or stepping from a recorded track into one
   * read live, used to go straight to the engine: with the voice deleted, a resume failed silently, and an engine
   * still holding the deleted model in memory read on as if nothing had happened — under a chip saying *No voice*.
   * So the copy in memory is dropped too, and the answer comes from `withVoice`, the prompt the first ▶ shows.
   */
  private askForVoiceMidSession(): void {
    this.logTransport('pause-no-voice');
    this.state = 'paused';
    this.updatePlayButton();
    this.engine?.dispose();
    this.engine = null;
    this.voiceCheckedPart = null;
    this.resumeFromPosition = true; // ▶ restarts this sentence rather than resuming a clip that is gone
    void this.voiceGate.withVoice(() => {
      if (this.state === 'paused') this.togglePlayPause();
    });
  }

  /** Prefetch on slow engines like Piper (no-op for Web Speech): queue the current sentence,
   *  then a short lookahead buffer, so synthesis overlaps playback and a sentence whose synth
   *  runs longer than its audio is absorbed by the buffer. */
  private primeAhead(): void {
    const engine = this.engine;
    if (!engine?.prime) return;
    // Current + a few ahead first (these hide synth latency during playback) — first because synthesis runs in the
    // order asked. Asking for one already prepared marks it used, so these are never what a new clip evicts (see
    // `ClipCache`)…
    engine.prime(normalizeForSpeech(this.units[this.unitIdx].text, this.pronouncer()));
    let primed = 0;
    for (let j = this.unitIdx + 1; j < this.units.length && primed < 3; j++) {
      if (this.units[j].text) {
        engine.prime(normalizeForSpeech(this.units[j].text, this.pronouncer()));
        primed++;
      }
    }
    // …then a couple behind, so skipping back replays without a re-synth pause. These
    // are mostly cache hits (recently played) — prime() only marks them used.
    for (let j = this.unitIdx - 1; j >= 0 && j >= this.unitIdx - 2; j--) {
      if (this.units[j]?.text) engine.prime(normalizeForSpeech(this.units[j].text, this.pronouncer()));
    }
  }

  /** Once per section, build the queue of adjacent-chapter start clips to pre-cache (the first
   *  couple of units of the next and previous chapters). Loads their docs off-screen. The queue
   *  is drained by pumpChapterCache() during idle windows, so this never blocks playback. */
  private scheduleAdjacentCache(): void {
    const engine = this.engine;
    if (!engine?.primePinned) return; // slow engine (Piper) only
    if (this.adjacentCachedFor === this.sectionIdx) return;
    this.adjacentCachedFor = this.sectionIdx;
    // Pins are bounded inside the engine (oldest-first), so the current chapter's own
    // pre-cached start clips are never dropped on arrival — no clearPinned() here.
    this.chapterCacheQueue = [];
    void this.enqueueChapterStart(this.sectionIdx + 1);
    void this.enqueueChapterStart(this.sectionIdx - 1);
  }

  /** Load a section's document off-screen and queue its first couple of units' text for pinning
   *  (the heading is a tiny clip; the first paragraph is the one worth pre-synthesizing). */
  private async enqueueChapterStart(sIdx: number): Promise<void> {
    if (sIdx < 0 || sIdx >= this.ctx.bookSections.length) return;
    const section = this.ctx.bookSections[sIdx] as unknown as {
      createDocument?: () => Promise<Document>;
    };
    if (!section.createDocument) return;
    try {
      const doc = await section.createDocument();
      let n = 0;
      for (const u of getReadingUnits(doc, this.host.readAheadMaxChars())) {
        if (!u.text) continue;
        this.chapterCacheQueue.push(normalizeForSpeech(u.text, this.pronouncer()));
        if (++n >= 2) break;
      }
    } catch {
      /* best-effort background cache */
    }
  }

  /** Pin one queued chapter-start clip, but only when the engine is idle (playback prefetch is
   *  caught up) — one at a time so an in-flight pre-synth never blocks the audio being heard. */
  private pumpChapterCache(): void {
    const engine = this.engine;
    if (!engine?.primePinned || !engine.isSynthIdle) return;
    if (!this.chapterCacheQueue.length || !engine.isSynthIdle()) return;
    const text = this.chapterCacheQueue.shift();
    if (text) {
      engine.primePinned(text);
      this.ctx.debug(`tts: pre-caching chapter clip (${this.chapterCacheQueue.length} left)`, 'tts');
    }
  }

  /** Resolve true once the next section's document arrives (via onSectionLoaded),
   *  or false if it doesn't within a timeout (load failure). */
  private waitForSection(sIdx: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        if (this.sectionWaiter?.sIdx === sIdx) {
          this.sectionWaiter = null;
          resolve(false);
        }
      }, 6000);
      this.sectionWaiter = {
        sIdx,
        resolve: () => {
          window.clearTimeout(timer);
          resolve(true);
        },
      };
    });
  }

  /** Called from the view's `load` handler for each newly rendered section. */
  onSectionLoaded(doc: Document, sIdx: number): void {
    if (this.sectionWaiter?.sIdx !== sIdx) return;
    this.adoptSection(doc, sIdx);
    const waiter = this.sectionWaiter;
    this.sectionWaiter = null;
    waiter.resolve();
  }

  /** Read on from the top of section `sIdx`, whose document is `doc`. */
  private adoptSection(doc: Document, sIdx: number): void {
    this.units = getReadingUnits(doc, this.host.readAheadMaxChars());
    this.sectionIdx = sIdx;
    this.unitIdx = 0;
    this.computeDurationModel();
    this.updateChapterLabel();
    this.updateDurationDisplay();
  }

  // ── Highlighting ──────────────────────────────────────────────────────────

  /** Rendered sections (each carries its overlay surface). */
  private sectionContents(): SectionContent[] {
    const renderer = this.ctx.foliateView?.renderer as unknown as {
      getContents?: () => SectionContent[];
    };
    return renderer?.getContents?.() ?? [];
  }

  /** Paint one span on the reading overlay in the current section. */
  private drawOn(key: string, range: Range, color: string): void {
    const obj = this.sectionContents().find((c) => c.index === this.sectionIdx);
    try {
      obj?.overlayer?.add(key, range, Overlayer.highlight, { color });
    } catch {
      /* best-effort */
    }
  }

  /** Paint `range` as the reading highlight, over an optional pale underlay (word mode). */
  private paint(range: Range, underlay: Range | null): void {
    this.drawnRange = range;
    this.drawnUnderlayRange = underlay;
    // Underlay first: the overlayer appends, so the later-added word key paints on top.
    if (underlay) this.drawOn(READING_UNDERLAY_KEY, underlay, TTS_HL_UNDERLAY_COLOR);
    this.drawOn(READING_KEY, range, TTS_HL_COLOR);
  }

  /** Erase the painted rects, leaving the reading *position* intact. */
  private erasePaint(): void {
    this.drawnRange = null;
    this.drawnUnderlayRange = null;
    for (const c of this.sectionContents()) {
      try {
        c.overlayer?.remove(READING_KEY);
        c.overlayer?.remove(READING_UNDERLAY_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Move the reading position to `sentence` and repaint.
   *
   * Two separate concerns, deliberately: `sentence` is always the SENTENCE (page-follow target,
   * saved listening location, bookmark/note target), while the mode decides what gets *painted*.
   * That's what lets paragraph mode highlight a whole block yet still page along sentence by
   * sentence, and word mode paint one word without every word triggering a page turn.
   */
  private highlight(sentence: Range): void {
    this.lastPagedTo = -1; // new sentence — reset mid-sentence paging
    this.currentReadingRange = sentence;
    this.repaint(sentence);
    this.syncToSentence(sentence);
  }

  /** Repaint for the current mode. A paragraph highlight already covering this sentence is left
   *  alone, so it doesn't blink off and on at every sentence inside the paragraph. */
  private repaint(sentence: Range): void {
    const mode = this.host.readingHighlight();
    if (mode === 'off') {
      this.erasePaint();
      return;
    }
    if (mode === 'paragraph') {
      const block = this.blockRangeFor(sentence) ?? sentence;
      // Still the same paragraph AND still on screen — leave the paint be. The isConnected check
      // matters: after a re-render the span still *compares* equal but its nodes are detached, so
      // skipping the repaint would silently lose the highlight (refreshRecordedHighlight's case).
      const live = this.drawnRange?.startContainer.isConnected === true;
      if (live && this.drawnRange && sameSpan(block, this.drawnRange)) return;
      this.erasePaint();
      this.paint(block, null);
      return;
    }
    this.erasePaint();
    this.resetWordTracking();
    if (mode === 'word') this.beginWordHighlight(sentence);
    else this.paint(sentence, null);
  }

  /**
   * Take the BOOK to a range, even when the full player is covering it.
   *
   * **Because a chapter jump is not page-follow.** `syncToSentence` deliberately does not page a view nobody can
   * see — it saves the location instead, which is right for continuous playback, where paging a hidden view on
   * every sentence would be work for no one. But stepping to a chapter is an explicit move, and the text has to
   * be there when the player is collapsed: the reader who steps forward four Days and then shows the text expects
   * the fourth Day, not the page they left.
   */
  private bringViewTo(range: Range): void {
    try {
      const renderer = this.ctx.foliateView?.renderer as unknown as {
        scrollToAnchor?: (anchor: unknown, select?: boolean) => Promise<void>;
      };
      void renderer?.scrollToAnchor?.(range, false);
    } catch {
      /* a view mid-render has nothing to scroll — the saved location still carries the position */
    }
    this.host.saveListeningLocation(range, this.sectionIdx);
  }

  /** Page-follow to the sentence (or save the location when the player covers the view). Always
   *  the sentence, never the painted span — a paragraph highlight must not scroll the reader back
   *  to the top of the paragraph when we're four sentences into it. */
  private syncToSentence(sentence: Range): void {
    // The sentence is the book's place while listening, in the bar as in the player — so reopening the book resumes
    // at this sentence rather than at the top of the page it was on. The page-follow below no longer saves its own
    // page while playing (see `isPlaying`), so the two cannot overwrite each other.
    this.host.saveListeningLocation(sentence, this.sectionIdx);
    if (this.textHidden) return; // the player covers the view: nothing to page
    // A file the reader has closed keeps its document but loses its window — `isConnected` stays true, so it cannot tell.
    if (!sentence.startContainer.ownerDocument?.defaultView) {
      void this.returnToReadingSection(sentence);
      return;
    }
    try {
      const renderer = this.ctx.foliateView?.renderer as unknown as {
        scrollToAnchor?: (anchor: unknown, select?: boolean) => Promise<void>;
      };
      void renderer?.scrollToAnchor?.(sentence, false);
    } catch {
      /* ignore */
    }
  }

  private returningToReading = false;

  /**
   * Bring back the file being read, after a page turn left it.
   *
   * **The reader holds one file at a time.** A page turn inside the file being read is undone by the next sentence's
   * page-follow; one that crosses into the neighboring file — ‹ on a chapter's first page — replaces the document the
   * reading's ranges live in. Scrolling to a range in a document that is gone does nothing, so the voice read on with
   * the page left behind, and coming back found the file rebuilt without its highlight.
   *
   * So the file is reopened by the sentence's CFI, and the reading units are read again from the new document: the
   * same text gives the same units, so `unitIdx` and `curSentenceIdx` still point at the sentence being spoken.
   */
  private async returnToReadingSection(sentence: Range): Promise<void> {
    if (this.returningToReading) return;
    const cfi = this.host.cfiForRange(sentence, this.sectionIdx);
    if (!cfi) return;
    this.returningToReading = true;
    try {
      this.ctx.debug(`tts: page left the reading file — returning to section ${this.sectionIdx}`, 'tts');
      await this.ctx.foliateView?.goTo(cfi);
      const loc = await this.host.resolveCfi(cfi);
      const doc = loc?.range.startContainer.ownerDocument;
      if (!loc || !doc || loc.sectionIndex !== this.sectionIdx) return;
      this.units = getReadingUnits(doc, this.host.readAheadMaxChars());
      const unit = this.units[this.unitIdx];
      if (unit) this.sentenceUnits = unit.sentences ?? [unit];
      this.highlight(this.sentenceUnits[this.curSentenceIdx]?.range ?? loc.range);
    } finally {
      this.returningToReading = false;
    }
  }

  /** The paragraph/block range for a sentence — the live unit's own `block` when we have it
   *  (live playback), else climbed from the DOM (recorded segments carry no block model). */
  private blockRangeFor(sentence: Range): Range | null {
    const unit = this.sentenceUnits[this.curSentenceIdx];
    if (unit && unit.range === sentence && unit.block) return unit.block;
    return enclosingBlockRange(sentence);
  }

  private clearHighlight(): void {
    this.currentReadingRange = null;
    this.resetWordTracking();
    this.erasePaint();
  }

  private resetWordTracking(): void {
    this.wordUnits = [];
    this.wordCumChars = [0];
    this.curWordIdx = -1;
    this.wordSentence = null;
  }

  /** Segment `sentence` into words and paint the one at `within` (0..1 through it), over the
   *  sentence as a pale underlay. Falls back to highlighting the whole sentence when word
   *  segmentation is unavailable (no `Intl.Segmenter`) or finds nothing highlightable. */
  private beginWordHighlight(sentence: Range, within = 0): void {
    this.wordSentence = sentence;
    this.wordUnits = getWordUnits(sentence);
    this.wordCumChars = cumCharBounds(this.wordUnits);
    if (!this.wordUnits.length) {
      this.curWordIdx = -1;
      this.paint(sentence, null); // no words to step through — behave like sentence mode
      return;
    }
    this.curWordIdx = this.wordIndexAt(within);
    this.paint(this.wordUnits[this.curWordIdx].range, sentence);
  }

  /** Index of the word at `within` (0..1 through the sentence), by cumulative character count. */
  private wordIndexAt(within: number): number {
    return unitIndexAtFraction(this.wordCumChars, this.wordUnits.length, within);
  }

  /** Step the word highlight to `within` (0..1 through the current sentence). Repaints only the
   *  word key — the sentence underlay stays put, so a word step is one small overlay swap. */
  private advanceWordTo(within: number): void {
    if (!this.wordUnits.length) return;
    const idx = this.wordIndexAt(within);
    if (idx === this.curWordIdx) return;
    this.curWordIdx = idx;
    this.drawnRange = this.wordUnits[idx].range;
    this.drawOn(READING_KEY, this.drawnRange, TTS_HL_COLOR);
  }

  /** Advance the word highlight when in word mode — called from both the live and recorded
   *  progress paths with a within-sentence fraction. */
  private followWord(within: number): void {
    if (this.host.readingHighlight() !== 'word') return;
    const sentence = this.currentReadingRange;
    if (!sentence) return;
    if (this.wordSentence !== sentence) {
      // Not segmented yet for this sentence — i.e. the mode was switched to word mid-sentence.
      this.beginWordHighlight(sentence, within);
      return;
    }
    this.advanceWordTo(within);
  }

  /** Label the rewind / forward buttons with the configured jump sizes. Called after building each
   *  surface and from applyPluginSettings, since the amounts are settings-driven. */
  refreshSkipLabels(): void {
    const label = (btns: HTMLElement[], text: string) => {
      for (const b of btns) {
        b.setAttribute('aria-label', text);
      }
    };
    label(this.skipBackBtns, t('tts.skip_back', { n: this.host.skipBackSeconds() }));
    label(this.skipFwdBtns, t('tts.skip_forward', { n: this.host.skipForwardSeconds() }));
  }

  /** Re-apply the reading highlight in the current mode — used when the setting changes so it
   *  takes effect on the sentence being read rather than at the next sentence boundary. */
  applyHighlightMode(): void {
    const sentence = this.currentReadingRange;
    if (!sentence) return;
    this.erasePaint();
    this.resetWordTracking();
    this.repaint(sentence);
  }

  /** Set up sentence-level highlighting for a unit (a single sentence, or a multi-sentence
   *  chunk) and highlight its first sentence. Even when a whole chunk is synthesized at once,
   *  the highlight tracks individual sentences via onSpeechProgress. */
  private beginUnitHighlight(unit: ReadingUnit, startFraction = 0): void {
    this.sentenceUnits = unit.sentences ?? [unit];
    this.sentenceCumChars = cumCharBounds(this.sentenceUnits);
    // Start on the sentence containing startFraction (0 for a normal unit start).
    const idx = unitIndexAtFraction(this.sentenceCumChars, this.sentenceUnits.length, startFraction);
    this.curSentenceIdx = idx;
    this.unitFrac = startFraction;
    this.highlight(this.sentenceUnits[idx].range);
    this.updateDurationDisplay();
    this.updateChapterLabel(); // the sentence's TOC entry may differ from the section start (Part divider)
  }

  /** Engine progress callback (0..1 through the current chunk). Moves the sentence highlight
   *  to the sentence being spoken (Web Speech: exact char index; Piper: elapsed-time estimate)
   *  and pages the reader forward within that sentence when it scrolls off the page. */
  private onSpeechProgress(frac: number): void {
    if (this.state !== 'playing') return;
    if (this.loadingChapter) {
      // First audio of the new chapter has started — clear the "Loading chapter…" state.
      this.loadingChapter = false;
      this.updateChapterLabel();
    }
    this.pumpChapterCache(); // use idle windows during playback to pre-cache adjacent chapters
    this.unitFrac = frac;
    this.updateDurationDisplay();
    const sentences = this.sentenceUnits;
    if (!sentences.length) return;
    // Advance the highlight to the sentence containing `frac` (char-proportional estimate).
    const idx = unitIndexAtFraction(
      this.sentenceCumChars,
      sentences.length,
      frac,
      this.curSentenceIdx < 0 ? 0 : this.curSentenceIdx
    );
    if (idx !== this.curSentenceIdx) {
      this.curSentenceIdx = idx;
      this.highlight(sentences[idx].range); // switches highlight + resets lastPagedTo
    }

    // Word highlight + page-follow both work off the fraction *within* the current sentence —
    // pointless while the player covers the view, and it self-corrects at the next sentence.
    if (this.textHidden) return;
    const pos = frac * this.sentenceCumChars[sentences.length];
    const spanLen = this.sentenceCumChars[idx + 1] - this.sentenceCumChars[idx];
    const within = spanLen > 0 ? (pos - this.sentenceCumChars[idx]) / spanLen : 0;
    this.followWord(within);
    const renderer = this.ctx.foliateView?.renderer as unknown as PageFollowRenderer | undefined;
    if (!renderer) return;
    this.lastPagedTo = pageTowardFraction(renderer, sentences[idx].range, within, this.lastPagedTo, (anchor) => {
      this.ctx.navSuppressor.suppressThenClearSoon(); // don't let foliate's focusin scroll fight ours
      try {
        void renderer.scrollToAnchor?.(anchor, false);
      } catch {
        /* ignore */
      }
    });
  }

  /** create-overlay: a section's overlayer was (re)built — re-add the active
   *  sentence highlight so it isn't lost when the overlay is recreated. */
  reapplyHighlight(_view: FoliateViewEl): void {
    // Overlay was rebuilt — re-draw whatever the current mode had painted (word + its underlay,
    // the sentence, or the paragraph). Nothing to do in 'off' mode, where drawnRange stays null.
    if (this.drawnRange) this.paint(this.drawnRange, this.drawnUnderlayRange);
  }

  // ── UI state ──────────────────────────────────────────────────────────────

  private updatePlayButton(): void {
    const playing = this.state === 'playing';
    const label = playing ? t('tts.pause') : t('tts.play');
    // Icons go on an inner .orbis-tts-icon span (not the button) so they render on iPad —
    // WebKit collapses SVGs that are direct children of small circular flex buttons.
    if (this.playIconEl) setSvgIcon(this.playIconEl, playing ? PAUSE_SVG : PLAY_SVG);
    if (this.playBtn) {
      this.playBtn.setAttribute('aria-label', label);
    }
    if (this.playerPlayIconEl) setSvgIcon(this.playerPlayIconEl, playing ? PAUSE_BIG_SVG : PLAY_BIG_SVG);
    if (this.playerPlayBtn) {
      this.playerPlayBtn.setAttribute('aria-label', label);
    }
    this.updateMediaPlaybackState(); // mirror play/pause to the OS media controls
    void this.updateWakeLock(); // hold/release the screen wake lock with the play state
  }

  // ── Screen wake lock — keep the screen on while playing (Settings → Listening; opt-in) ──

  /** Acquire the wake lock when the setting is on and audio is playing, or while Pocket mode is locked; release
   *  otherwise. The sentinel auto-releases when the page is hidden, so `onVisibilityChange` re-runs this on return to
   *  foreground. Feature-detected — a no-op where `wakeLock` is unavailable. When it is wanted: `wantsScreenOn`. */
  private async updateWakeLock(): Promise<void> {
    if (!this.onVisibilityChange && typeof document !== 'undefined') {
      const doc = this.ctx.contentEl.doc;
      this.visibilityDoc = doc;
      this.onVisibilityChange = () => {
        if (doc.visibilityState === 'visible') void this.updateWakeLock();
        else if (Platform.isIosApp && this.state === 'playing') {
          // iOS stops our audio whenever the page is hidden — the screen off, the side button, another app — and says
          // nothing, so the button went on showing Pause over silence. Pausing here keeps the position and tells the
          // truth: on return the reader sees Play. Not on Android, where nobody has seen the audio stop this way.
          this.ctx.debug('page hidden on iOS while playing — pausing', 'tts');
          this.pauseIfPlaying();
        }
      };
      doc.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    const want =
      'wakeLock' in navigator &&
      wantsScreenOn({
        keepScreenAwake: this.host.keepScreenAwake(),
        playing: this.state === 'playing',
        pocketLocked: this.lock.isLocked(),
      });
    if (want && !this.wakeLock) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      } catch {
        /* rejected (page not visible, low battery, unsupported) — leave it unheld */
      }
    } else if (!want && this.wakeLock) {
      const sentinel = this.wakeLock;
      this.wakeLock = null;
      try {
        await sentinel.release();
      } catch {
        /* already released */
      }
    }
  }

  /** The speed on the chips — `ChipSpeeds` decides when the bar's shows. */
  private updateSpeedLabel(): void {
    this.chipSpeeds.paint(formatRate(this.rate));
    this.paintChipAria();
  }

  private setRate(rate: number): void {
    this.rate = Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(rate * 10) / 10));
    this.engine?.setRate(this.rate);
    this.recorded?.setRate(this.rate);
    this.host.persistTtsRate(this.rate);
    this.updateSpeedLabel();
    this.updateDurationDisplay(); // times rescale with speed
  }

  /** The speed control, for Voice and source's Speed block (`speed-control.ts`). */
  buildSpeedControl(container: HTMLElement): void {
    buildSpeedControl(container, {
      rate: this.rate,
      range: [MIN_RATE, MAX_RATE],
      setRate: (rate) => this.setRate(rate),
      lockHeights: () => this.ctx.lockMobileHeights(),
      unlockHeights: () => this.ctx.unlockMobileHeights(),
    });
  }

  // ── Full player: hide/show text, cover, chapter + duration ──────────────────

  private setTextHidden(hidden: boolean): void {
    if (hidden === this.textHidden) return;
    this.textHidden = hidden;
    this.logTransport(hidden ? 'show-player' : 'show-text');
    this.playerEl?.toggle(hidden);
    this.barEl_?.toggle(!hidden); // the full player replaces the compact bar
    this.host.setFullPlayerActive(hidden); // hide the floating history back/forward over the player
    this.setReaderTopSpace(!hidden && this.ctx.focusMode); // player covers text; compact bar mustn't
    if (hidden) {
      // The full player replaces the bar, so the keyboard follows it — the same reasoning as `doOpenBar`.
      this.playerPlayBtn?.focus();
      this.updatePlayerMeta();
      this.updateActionIcons(); // reflect the current highlight/note color settings
      void this.loadCover();
      if (this.state === 'idle') {
        // Never played — home the player at the ebook's current spot so the first ▶ starts there.
        this.syncToView();
      } else {
        // Playing OR paused: the player already owns a position — preserve it (don't snap to the
        // page-top sentence). Just refresh the readouts. Content-panel navigation while collapsed
        // repositions via onUserNavigated; merely toggling the view must not move the audio.
        this.updateChapterLabel();
        this.updateDurationDisplay();
      }
    } else {
      // Back to read-along: the lock only applies to the full player, so drop it.
      this.lock.setLocked(false);
      // Redraw saved highlights/notes (any made in the player weren't on the live overlay yet),
      // then re-page to the sentence the audio is on.
      this.host.refreshAnnotations();
      if (this.state === 'idle') return; // closing from the player stops first — no sentence left to paint
      if (this.usingRecording) {
        this.refreshRecordedHighlight(); // re-resolve the segment CFI to a live range + page there
      } else {
        const s = this.sentenceUnits[Math.max(0, this.curSentenceIdx)] ?? this.sentenceUnits[0];
        if (s) this.highlight(s.range);
      }
    }
  }

  /** Refresh the highlight/note action-icon color previews from the current settings (the
   *  highlighter nib = audio-highlight color; the pencil body = default note-highlight color).
   *  Public so settings changes flow through live via the view's applyPluginSettings(). */
  updateActionIcons(): void {
    // Both previews come from the book's annotation ROLE marks rather than two global color settings,
    // so the player shows which mark each button will use. A null (notes default to no mark) previews as the
    // muted chrome color rather than as a color the button will not apply.
    const { audio, note } = this.host.roleMarkColors();
    if (this.hlIconEl) setTintedSvgIcon(this.hlIconEl, HIGHLIGHTER_SVG, audio ?? 'var(--text-muted)');
    if (this.noteIconEl) setTintedSvgIcon(this.noteIconEl, PENCIL_SVG, note ?? 'var(--text-muted)');
  }

  private updatePlayerMeta(): void {
    // `title` as well as the text, because a phone truncates these to one line — see the ellipsis rule in
    // `styles.css`. It costs nothing where they fit and is the only way to read the rest where they do not.
    if (this.playerTitleEl) {
      const title = this.host.bookTitle() || this.ctx.currentFile?.basename || '';
      this.playerTitleEl.textContent = title;
      this.playerTitleEl.setAttribute('aria-label', title);
    }
    const author = this.host.bookAuthor();
    if (this.playerAuthorEl) {
      this.playerAuthorEl.textContent = author;
      this.playerAuthorEl.setAttribute('aria-label', author);
      this.playerAuthorEl.toggle(!!author);
    }
  }

  /** Title + author in place of missing cover art.
   *
   *  Rendered rather than generated into an image and cached: `cacheBookInfo` only writes
   *  `coverImage` when the field is absent, so a cached placeholder would permanently block a real
   *  cover from ever being saved (e.g. after extraction improves). Rendering also tracks a metadata
   *  change for free. */
  private showCoverFallback(): void {
    const el = this.playerCoverFallbackEl;
    if (!el) return;
    const title = this.host.bookTitle() || this.ctx.currentFile?.basename || '';
    // One recipe for a coverless book, shared with the Library's tiles and the reading-data header — it empties
    // the host itself, which is what lets this be called again when the metadata changes.
    renderGeneratedCover(el, title, this.host.bookAuthor() || undefined);
    el.show();
  }

  private async loadCover(): Promise<void> {
    if (!this.playerCoverEl) return;
    const key = this.ctx.currentFile?.path ?? '';
    if (this.coverLoadedForFile === key) return; // already resolved for this book
    this.coverLoadedForFile = key;
    try {
      const blob = await this.host.bookCover();
      if (this.coverObjectUrl) {
        URL.revokeObjectURL(this.coverObjectUrl);
        this.coverObjectUrl = null;
      }
      if (blob && this.playerCoverEl) {
        this.coverObjectUrl = URL.createObjectURL(blob);
        this.playerCoverEl.src = this.coverObjectUrl;
        this.playerCoverEl.show();
        this.playerCoverFallbackEl?.hide();
      } else {
        this.playerCoverEl?.hide();
        this.showCoverFallback();
      }
    } catch {
      this.playerCoverEl?.hide();
      this.showCoverFallback();
    }
    this.updateMediaMetadata(); // artwork just resolved — refresh the OS controls
  }

  // ── OS media controls — the controller says what is playing; `media-session.ts` tells the OS ──

  private setupMediaSession(): void {
    this.media.install(this.ctx.contentEl);
  }

  private updateMediaMetadata(label = this.currentChapterLabel()): void {
    if (this.state === 'idle') return;
    this.media.setNowPlaying({
      title: this.host.bookTitle() || this.ctx.currentFile?.basename || 'Orbis',
      artist: this.host.bookAuthor() || '',
      album: label,
      artworkUrl: this.coverObjectUrl,
    });
  }

  private updateMediaPlaybackState(): void {
    this.media.setPlaybackState(this.state === 'playing' ? 'playing' : this.state === 'paused' ? 'paused' : 'none');
  }

  /** Estimated duration of the current chapter in seconds (words ÷ WPM), for the OS scrubber. */
  private chapterDurationSec(): number {
    if (this.usingRecording) return this.recordedDurationSec || this.recorded?.duration || 0;
    return this.sectionPosition().durationSec;
  }

  /** The OS scrubber for a live track: how far through the chapter's words, at the narration rate. */
  private updateMediaPositionState(): void {
    const { durationSec, positionSec } = this.sectionPosition();
    this.media.setPosition(durationSec, positionSec, this.rate);
  }

  private sectionPosition(): { durationSec: number; positionSec: number } {
    const model = { sectionCumWords: this.sectionCumWords, unitWords: this.unitWords };
    return sectionPosition(model, { unitIdx: this.unitIdx, unitFrac: this.unitFrac }, this.rate);
  }

  /** The disambiguated Part+Chapter label (Generate-Notes / export style, e.g. "PART II –
   *  CHAPTER I") for the sentence being READ — not the view's parked page, so a section that opens
   *  with a Part divider reads as "PART IV – CHAPTER I" once the audio is past the heading. */
  /**
   * What the transport, the Listen bar and the OS media controls call the current chapter.
   *
   * **Read off the part list, because that is the only thing that knows about parts.** `chapterDisplayLabel`
   * resolves a contents entry and knows nothing of parts, so it would announce every track of a chapter divided
   * into four as "CHAPTER III" while the row in the Record list said `1 of 4`. The list already composes the affix;
   * taking the label from there means the two cannot drift.
   *
   * Falls back to the contents entry when there is no part to read — a book still loading, or one whose list is
   * empty.
   */
  private currentChapterLabel(): string {
    if (this.loadingChapter) return t('tts.loading_track');
    const part = this.host.chapterParts()[this.currentChapterIndex()];
    return part?.label || this.host.chapterDisplayLabel(this.sectionIdx, this.currentPositionHref());
  }

  /**
   * Which contents entry the audio is in — the sentence being READ, not the view's parked page.
   *
   * Extracted because two things need it and they must agree: the label over the transport, and the buttons
   * beneath it. A player naming one chapter while ⏭ counts from another is the failure this prevents.
   */
  private currentPositionHref(): string {
    if (this.tocStepHref) return this.tocStepHref;
    const readRange = this.units[this.unitIdx]?.range ?? this.currentReadingRange;
    return (
      (readRange && this.host.tocHrefForRange(readRange, this.sectionIdx)) ||
      (this.sectionIdx === this.ctx.currentSectionIndex ? this.ctx.tocItemHref : '')
    );
  }

  private updateChapterLabel(): void {
    const label = this.currentChapterLabel();
    if (this.chapterLabelEl) {
      this.chapterLabelEl.textContent = label;
      this.chapterLabelEl.setAttribute('aria-label', label); // truncated to one line on a phone — see `updatePlayerMeta`
    }
    this.updateMediaMetadata(label); // keep the OS media controls' chapter in sync
    void this.updateVoiceChip(); // a mix's voice turns over per chapter — refresh the chip on change
  }

  /**
   * A voice/source chip — `[♪ Amy · Mix 1 ⚙]` — that opens the Voice & source picker. Registered so
   * `updateVoiceChip()` can refresh it. Used in both the compact bar and the full player.
   *
   * **Two spans, and only the second one truncates.** The voice is short and bounded; a mix name is neither, and a
   * long one on a phone must not squeeze the voice out of its own chip.
   */
  /** `speedYields`: the speed gives way to the names when the chip is tight — the bar's; see `ChipSpeeds`. */
  private buildVoiceChip(parent: HTMLElement, extraCls: string, speedYields: boolean): void {
    const chip = parent.createEl('button', { cls: `orbis-tts-voice-chip ${extraCls}` });
    // The origin glyph — a mic, or the live arcs. Not a music note, which would be identical in every state: a
    // decorated pixel budget that says nothing, in a plugin that is not about music. See `voice-glyphs.ts`.
    const icon = chip.createSpan({ cls: 'orbis-tts-voice-chip-icon' });
    setSvgIcon(icon, VOICE_LIVE_SVG);
    const label = chip.createSpan({
      cls: 'orbis-tts-voice-chip-label',
      text: t('tts.voice_chip_placeholder'),
    });
    const source = chip.createSpan({ cls: 'orbis-tts-voice-chip-source' });
    source.hide();
    const speed = chip.createSpan({ cls: 'orbis-tts-voice-chip-speed', text: formatRate(this.rate) });
    this.chipSpeeds.add(speed, speedYields, [label, source]);
    // A sliders/options glyph (not a dropdown caret) — the chip opens a panel, it isn't an inline select.
    setIcon(chip.createSpan({ cls: 'orbis-tts-voice-chip-opts' }), 'sliders-horizontal');
    chip.addEventListener('click', () => this.host.openListenSettings());
    this.voiceChipEls.push(label);
    this.voiceChipSrcEls.push(source);
    this.voiceChipIconEls.push(icon);
    this.voiceChipBtns.push(chip);
  }

  /** The chapter the chip/modal describes: the one being READ when playing/paused, else the page the reader is
   *  parked on. (Distinct from the view's nullable listeningSectionIndex, which is only set while a sentence is
   *  loaded.) A chapter ordinal, not a spine index — see `currentChapterIndex`. */
  describedChapterIndex(): number {
    if (this.state === 'idle') {
      /**
       * **The page the reader is on, not the contents entry it falls under.**
       *
       * The slices of a divided chapter share one href, so asking by href would name the voice assigned to part 1
       * when the listening bar opens while parked in "CHAPTER III 3 of 4". In a mix that is the wrong voice on the
       * chip and the wrong track in the dialog it opens.
       *
       * Through `chapterIndexForLoc` rather than a second copy of the rule: it is the same question a bookmark
       * or a search hit asks, and it already prefers the span and falls back to the href.
       */
      return this.chapterIndexForLoc(this.ctx.currentSectionIndex, this.host.currentPageRange());
    }
    return this.currentChapterIndex();
  }

  /**
   * Which chapter the audio is on, as an ordinal in `host.bookChapters()`.
   *
   * **The recorded player's own answer wins while it is playing.** A chapter MP3 IS a chapter, so its identity is
   * known exactly and must not be re-derived from the reading position: the highlight can sit anywhere inside the
   * chapter, and on a nested contents page `tocHrefForRange` answers with the outer entry.
   */
  private currentChapterIndex(): number {
    if (this.recordedChapterIdx >= 0) return this.recordedChapterIdx;
    /**
     * **The position, not the href, when the section holds several parts.** A chapter divided into four tracks has
     * one contents entry between them, so asking by href always answers with the first — the player would
     * announce "1 of 38" through all thirty-eight. The spans the bar already measures know which part the reading
     * position is in, and they carry the answer out.
     */
    const fromSpan = this.currentSpan().partIndex;
    if (fromSpan >= 0) return fromSpan;
    return partIndexAt(this.host.chapterParts(), this.sectionIdx, this.currentPositionHref());
  }

  /**
   * Which chapter a navigation target lands in — a bookmark, a search hit, a Go-To, a history entry.
   *
   * **Because the file is not the answer.** A file can hold eighty chapters, and jumping to a bookmark in the
   * fortieth of them must load the fortieth chapter's audio rather than the file's first. The book is asked which
   * contents entry the target range sits in — the same question the label over the transport answers — and that
   * entry names the chapter.
   *
   * Without a live range (a CFI in a document not loaded) the section's first chapter is the fallback, which is
   * where a section's start belongs anyway.
   *
   * **Position before href, for the same reason as everywhere else**: the slices of a divided chapter share one
   * contents entry, so `tocHrefForRange` cannot tell "3 of 4" from "1 of 4" and the href route would load the
   * chapter's first MP3 for a bookmark two hours into it. The spans can tell, but only for the section whose units
   * are loaded — a target in a document that is not laid out has to take the href and land at the chapter's start.
   */
  private chapterIndexForLoc(sectionIndex: number, range: Range | null): number {
    if (range && sectionIndex === this.sectionIdx && this.unitsBelongTo(sectionIndex)) {
      const at = unitIndexForRange(this.units, range);
      if (at >= 0) {
        const span = entrySpanAt(this.entryStarts, at, this.units.length);
        if (span.partIndex >= 0) return span.partIndex;
      }
    }
    /**
     * The href fallback, in the same order `currentPositionHref` uses: what the range sits under, else what the
     * reader's last relocate reported for the page it is on. The second half matters when there is no range to
     * ask about — the player idle on a book that has not been paged since it opened — and without it this would
     * answer with the section's first part where the contents know better.
     */
    const href =
      (range ? this.host.tocHrefForRange(range, sectionIndex) : null) ||
      (sectionIndex === this.ctx.currentSectionIndex ? this.ctx.tocItemHref : null);
    return partIndexAt(this.host.chapterParts(), sectionIndex, href);
  }

  /** The reader paged/navigated — when idle (so describedChapterIndex tracks the page), refresh the
   *  voice chip if the section changed. During playback the chapter-change path already refreshes it,
   *  and while paused the chip stays pinned to the audio's position. */
  onReaderRelocated(): void {
    if (this.state === 'idle' && this.barEl_?.isShown()) void this.updateVoiceChip();
  }

  /** Refresh the voice chip(s) to the voice reading the current chapter. Called when the bar opens,
   *  when the chapter changes (a mix's voice turns over per chapter), and after the source/edition
   *  changes. `force` re-fetches even when the section is unchanged (for a same-chapter edition
   *  switch); otherwise it skips when the section hasn't moved. */
  private async updateVoiceChip(force = false): Promise<void> {
    if (!this.voiceChipEls.length) return;
    const chapter = this.describedChapterIndex();
    if (!force && chapter === this.chipSection) return;
    this.chipSection = chapter;
    /**
     * **"A later call wins", counted rather than inferred.**
     *
     * Comparing the chapter a fetch started on against the chapter now, and dropping the paint if they differ, is
     * right when a reader turns a page mid-fetch and wrong in a common case. `reloadForPlaybackChange` repaints
     * the chip and *then* re-seats the audio, and re-seating calls `disposeRecorded`, which clears
     * `recordedChapterIdx` — the very field `describedChapterIndex` answers from while a recorded track is loaded.
     * So the index moves under a fetch that nothing has superseded, and switching from one mix to another would
     * leave the chip on the old one — only when the current chapter is recorded, which would make it look
     * arbitrary.
     *
     * A counter says what the guard actually means: this paint is stale only if another fetch has since started.
     */
    const request = ++this.chipRequest;
    const info = await this.host.currentVoiceInfo(chapter);
    if (request !== this.chipRequest) return;
    /**
     * **A chip that names a voice this device cannot speak with is worse than an empty one.**
     *
     * `currentVoiceInfo` resolves the voice this chapter WOULD be read in, falling back to the recommendation
     * when nobody has chosen — so on a fresh install the chip would read `Amy` while the prompt beside it said
     * *Listen needs a voice*. Two surfaces on one screen, disagreeing, and the confident one wrong.
     *
     * Only when the answer is the live engine: a recorded track needs no voice, so a chapter covered by one is
     * named as usual.
     */
    const speakable = info.recorded || (await this.canSpeakNow());
    if (request !== this.chipRequest) return; // the `canSpeakNow` read is a second await
    const voice = speakable ? info.label : t('tts.no_voice');
    const source = speakable ? chipSourceText(info.source, info.fromSelection) : '';
    for (const btn of this.voiceChipBtns) btn.toggleClass('orbis-tts-voice-missing', !speakable);
    for (const el of this.voiceChipEls) el.textContent = voice;
    for (const el of this.voiceChipSrcEls) {
      el.setText(source);
      el.toggle(!!source);
    }
    for (const el of this.voiceChipIconEls) setSvgIcon(el, voiceOriginSvg(info.recorded));
    this.chipAria = { voice, source: info.source, reason: info.reason, speakable };
    this.paintChipAria();
    this.chipSpeeds.fit();
  }

  /**
   * **The glyph is load-bearing, so the accessible name has to say in words what it says in a shape.** The reason
   * line already does — it is a whole sentence per state, written for the popup — so the label reads "Voice: Amy.
   * Speed: 1×. Your live voice — this chapter has no recording. Select to change." The selection is named separately
   * because no reason line mentions it. Repainted when the speed changes as well as the voice.
   */
  private paintChipAria(): void {
    const a = this.chipAria;
    if (!a) return;
    const speed = formatRate(this.rate);
    const label = !a.speakable
      ? t('tts.voice_chip_missing')
      : a.source
        ? t('tts.voice_chip_source', { voice: a.voice, source: a.source, reason: a.reason, speed })
        : t('tts.voice_chip', { voice: a.voice, reason: a.reason, speed });
    for (const btn of this.voiceChipBtns) btn.setAttribute('aria-label', label);
  }

  /** Per-unit word counts for the current section, cumulative totals, and the word count of all later sections —
   *  the basis for the ~duration estimates (`listen-duration.ts`). */
  private computeDurationModel(): void {
    const m = buildDurationModel(this.units, this.host.sectionWords(), this.sectionIdx);
    this.unitWords = m.unitWords;
    this.sectionCumWords = m.sectionCumWords;
    this.sectionSentences = m.sectionSentences;
    this.sentenceCumWordsFlat = m.sentenceCumWordsFlat;
    this.laterSectionWords = m.laterSectionWords;
    this.computeEntryStarts();
  }

  /**
   * Where this section's contents entries begin, in reading units.
   *
   * **Found by asking the document, not by trusting the contents list.** An entry's href names a file and an
   * anchor; the ones whose anchor exists in the section on screen are the ones in it. That is the same test
   * `landOnPart` makes for a single part, and it means a section needs no knowledge of which file it is — the
   * document answers.
   *
   * Entries with no fragment are skipped: an entry pointing at a whole file starts at its beginning, which is
   * where the section starts anyway, and `entrySpanAt` reads an empty list as one span over the section.
   */
  private computeEntryStarts(): void {
    this.entryStarts = [];
    // The AUDIO's section, not the view's — these spans measure `this.units`, which came from that document.
    const doc = this.sectionDoc(this.sectionIdx);
    if (!doc || !this.units.length) return;
    /**
     * **From the PART list, not the contents page.** Boundaries from `host.tocHrefs()` are right only while a
     * contents entry and a track are the same thing, and a divided chapter breaks that: a chapter of four
     * 26-minute tracks would be measured all at once — the row saying 26 minutes while the player beside it said
     * 1h 42m. Asking the part list
     * means the bar measures exactly what the MP3 holds, because `partUnitRange` is what decided both.
     *
     * Parts that start somewhere of their own only: later slices of one part share their parent's anchor and are
     * separated by the range arithmetic, not by an anchor.
     */
    const parts = this.host.chapterParts();
    const siblings = parts.filter((p) => p.sectionIndex === this.sectionIdx && !(p.slice && p.slice.index > 0));
    const anchors = siblings.map((p) => p.anchor);
    const found: EntryStart[] = [];
    for (const part of parts) {
      if (part.sectionIndex !== this.sectionIdx) continue;
      // One chapter has at most one anchored part per section, so its href locates it unambiguously.
      const anchorAt = siblings.findIndex((p) => p.chapterHref === part.chapterHref);
      const [from] = partUnitRange(this.units, doc, {
        sectionAnchors: anchors,
        anchorAt: anchorAt < 0 ? 0 : anchorAt,
        slice: part.slice,
      });
      found.push({ unitIdx: from, href: part.chapterHref, partIndex: part.index });
    }
    this.entryStarts = normalizeEntryStarts(found);
    if (this.entryStarts.length > 1) {
      this.ctx.debug(`entry spans: ${this.entryStarts.length} in section ${this.sectionIdx}`, 'tts');
    }
  }

  /** The stretch of this section the player is currently describing. */
  private currentSpan(): UnitSpan {
    return entrySpanAt(this.entryStarts, this.unitIdx, this.units.length);
  }

  /** The live readouts for the track being read — see `listen-duration.ts`. */
  private liveReadout(): LiveReadout {
    const model = {
      sectionCumWords: this.sectionCumWords,
      unitWords: this.unitWords,
      laterSectionWords: this.laterSectionWords,
    };
    return liveReadout(model, this.currentSpan(), { unitIdx: this.unitIdx, unitFrac: this.unitFrac }, this.rate);
  }

  /** Refresh the chapter progress bar + ~time readouts. Times are estimates
   *  (words ÷ [NARRATION_WPM × rate]); real-time TTS has no true duration until spoken. */
  private updateDurationDisplay(): void {
    if (this.usingRecording) {
      this.updateRecordedDuration(); // real MP3 durations, not word estimates
      return;
    }
    if (this.scrubbing) return; // don't fight the live drag preview (bar fill or OS scrubber)
    this.updateMediaPositionState(); // OS media scrubber — update regardless of which bar is visible
    if (!this.textHidden || !this.playerEl) return;
    const r = this.liveReadout();
    this.paintScrub(r.fraction);
    if (this.elapsedEl) this.elapsedEl.textContent = formatDuration(r.elapsedSec);
    if (this.remainingEl) this.remainingEl.textContent = `-${formatDuration(r.remainingSec)}`;
    if (this.bookLeftEl) this.bookLeftEl.textContent = t('tts.book_left', { time: formatDuration(r.bookLeftSec) });
  }

  /**
   * Paint the scrubber at `frac`, and tell a screen reader the same thing.
   *
   * One call for both, because a fill set from three places and ARIA set from none is how a slider ends up
   * announcing a position it is not in. `aria-valuetext` over the bare percentage — "3 minutes
   * 20 seconds" is the fact a listener wants, and a number out of a hundred is not.
   */
  private paintScrub(frac: number): void {
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    this.progressFillEl?.setCssStyles({ width: `${pct}%` });
    const track = this.progressTrackEl;
    if (!track) return;
    track.setAttribute('aria-valuenow', String(Math.round(pct)));
    const dur = this.chapterSeconds();
    if (dur > 0) track.setAttribute('aria-valuetext', formatDuration((pct / 100) * dur));
  }

  /** Where the scrubber sits now, 0–1 — from the recording's clock or the live word count. */
  private chapterFraction(): number {
    if (this.usingRecording) {
      const dur = this.recordedDurationSec || this.recorded?.duration || 0;
      return dur > 0 ? Math.min(1, this.recordedCurSec / dur) : 0;
    }
    return this.liveReadout().fraction;
  }

  /** How long this chapter runs, in seconds — a real duration when recorded, a word estimate when live. */
  private chapterSeconds(): number {
    if (this.usingRecording) return this.recordedDurationSec || this.recorded?.duration || 0;
    return this.liveReadout().trackSec;
  }

  /**
   * The scrubber from the keyboard.
   *
   * **A step in SECONDS, not in percent.** A percentage step means an arrow press moves four minutes in a long
   * chapter and twenty seconds in a short one — the same gesture doing different things depending on where you
   * are, which is exactly what a listener cannot predict. Ten seconds is the step every audio player uses, and it
   * stays ten seconds whatever the chapter.
   *
   * Home and End rather than only arrows, because the two ends are where a listener actually jumps to: the start
   * of a chapter they want again, and the end of one they are done with.
   */
  private nudgeScrub(seconds: ScrubMove): void {
    /**
     * **An arrow is a skip, not a fraction** — getting that wrong makes the keyboard look broken while the log
     * shows a seek on every press.
     *
     * Computing `here + 10s` as a fraction of the chapter and seeking there leaves the bar unmoved: a scrub SNAPS
     * to a sentence, and ten seconds is about twenty-six words, which on a long opening paragraph is still inside
     * the first sentence — so it lands back where it started, and the next press recomputes from the same place.
     * Dragging works only because a drag crosses whole sentences.
     *
     * `skipSeconds` is the primitive that already knows this: it guarantees movement of at least one sentence in
     * the direction asked, for recorded segments and live sentences alike. The arrows are the ⟲/⟳ buttons with a
     * smaller step, so they are the same code.
     *
     * Home and End keep the fraction path, where snapping is not merely harmless but wanted: both ends of a
     * chapter ARE sentence boundaries.
     */
    if (seconds === 'start' || seconds === 'end') {
      const frac = seconds === 'start' ? 0 : 1;
      this.paintScrub(frac);
      this.seekToChapterFraction(frac);
      return;
    }
    this.skipSeconds(seconds);
  }

  /** The progress bar's gestures and keys (`progress-scrub.ts`); what a position means is decided here. */
  private wireProgressScrub(track: HTMLElement): void {
    const preview = (frac: number): void => {
      const { elapsedSec, remainingSec } = this.usingRecording
        ? (() => {
            const dur = this.recordedDurationSec || this.recorded?.duration || 0;
            return { elapsedSec: frac * dur, remainingSec: (1 - frac) * dur };
          })()
        : livePreview(this.sectionCumWords, this.currentSpan(), frac, this.rate);
      this.paintScrub(frac);
      if (this.elapsedEl) this.elapsedEl.textContent = formatDuration(elapsedSec);
      if (this.remainingEl) this.remainingEl.textContent = `-${formatDuration(remainingSec)}`;
    };
    wireProgressScrub(track, {
      canScrub: () => this.usingRecording || this.sectionSentences.length > 0, // no model yet (live only)
      setScrubbing: (on) => {
        this.scrubbing = on;
      },
      preview,
      seek: (frac) => this.seekToChapterFraction(frac),
      nudge: (move, key) => {
        // What the key found: whether there is a duration to move through at all. A scrubber that ignores an arrow
        // does so for one of two reasons — the key never arrived, or the chapter has no measured length yet — and
        // the two look identical from the outside.
        this.ctx.debug(
          `scrub key ${key} step=${move} at=${this.chapterFraction().toFixed(3)} of ${this.chapterSeconds().toFixed(0)}s`,
          'tts'
        );
        this.nudgeScrub(move);
      },
    });
  }

  // ── Highlight / note what's being read ──────────────────────────────────────

  /** The range of the sentence currently being read aloud. */
  private currentSentenceRange(): Range | null {
    if (this.usingRecording) return this.currentReadingRange; // recorded: the segment's live range
    return this.sentenceUnits[Math.max(0, this.curSentenceIdx)]?.range ?? this.sentenceUnits[0]?.range ?? null;
  }

  /** The active sentence (range + its section) while audio is playing or paused — so the main
   *  toolbar bookmark can mark it like the full-screen player's bookmark button. Null when idle
   *  (bar closed, or open but nothing read yet). */
  activeSentence(): { range: Range; sectionIndex: number } | null {
    if (this.state === 'idle') return null;
    const range = this.currentSentenceRange();
    return range ? { range, sectionIndex: this.sectionIdx } : null;
  }

  /** The range of the paragraph/block the current sentence belongs to. */
  private currentParagraphRange(): Range | null {
    if (this.usingRecording) {
      // Recorded segments carry no block model — expand the sentence range to its enclosing block
      // (paragraph/heading), falling back to the sentence if there's no block ancestor.
      const r = this.currentReadingRange;
      return (r && enclosingBlockRange(r)) || r;
    }
    const s = this.sentenceUnits[Math.max(0, this.curSentenceIdx)] ?? this.sentenceUnits[0];
    return s?.block ?? s?.range ?? null;
  }

  /** Highlight the current sentence or paragraph (per the audio-highlight-granularity setting)
   *  in the configured audio-highlight color. The reading highlight lives on its own overlay
   *  key, so this persisted highlight does not collide with it. */
  private doHighlight(): void {
    const paragraph = this.host.audioHighlightGranularity() === 'paragraph';
    const r = paragraph ? this.currentParagraphRange() : this.currentSentenceRange();
    this.ctx.debug(`tts clip: highlight ${paragraph ? 'paragraph' : 'sentence'} ${r ? 'ok' : 'no-range'}`, 'tts');
    if (!r) return;
    this.host.highlightRange(r, this.sectionIdx);
    this.host.refreshAnnotations();
  }

  /** Add a note on the current sentence or paragraph (per the audio-note-granularity setting). */
  private doAddNote(): void {
    const paragraph = this.host.audioNoteGranularity() === 'paragraph';
    const r = paragraph ? this.currentParagraphRange() : this.currentSentenceRange();
    this.ctx.debug(`tts clip: note ${paragraph ? 'paragraph' : 'sentence'} ${r ? 'ok' : 'no-range'}`, 'tts');
    if (!r) return;
    // Pause playback while the note editor is open, then resume when it closes.
    const resume = this.state === 'playing';
    if (resume) this.pauseForNote();
    this.host.addNoteForRange(r, this.sectionIdx, () => {
      if (resume && this.state === 'paused') this.resumeFromNote();
    });
  }

  /** Bookmark the current sentence being read (audio bookmark). Toggles: a second tap on the
   *  same sentence removes it. Always the sentence (not the paragraph) so it lines up with the
   *  reading bookmark's top-of-page anchor. */
  private doBookmark(): void {
    const r = this.currentSentenceRange();
    this.ctx.debug(`tts clip: bookmark ${r ? 'ok' : 'no-range'}`, 'tts');
    if (!r) return;
    const added = this.host.toggleAudioBookmark(r, this.sectionIdx);
    new Notice(added ? t('tts.bookmark_added') : t('tts.bookmark_removed'));
  }

  private pauseForNote(): void {
    if (this.state !== 'playing') return;
    this.pausePlayback();
  }

  /**
   * Pause whichever audio is playing — a recording, or the live engine mid-utterance where it can pause there, else
   * stopped (the position stays, so ▶ resumes the sentence). Callers check that it is playing.
   */
  private pausePlayback(): void {
    this.state = 'paused';
    this.updatePlayButton();
    if (this.recorded) this.recorded.pause();
    else if (this.engine?.canPauseMidUtterance()) this.engine.pause();
    else this.engine?.stop();
  }

  private resumeFromNote(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.updatePlayButton();
    if (this.recorded) void this.recorded.play();
    else if (this.engine?.canPauseMidUtterance()) this.engine.resume();
    else void this.runLoop(++this.epoch);
  }

  /** Drop the cached engine (only when idle) so the next playback rebuilds it with the current
   *  settings — used when the selected voice changes in Settings → Listening. */
  resetEngine(): void {
    if (this.state !== 'idle') return;
    this.engine?.dispose();
    this.engine = null;
    this.liveOverride = null; // re-resolve any mix live-voice override on the next play
    this.overridePart = null;
  }

  /**
   * One line per transport transition, on the `tts` channel.
   *
   * Every path that pauses or stops goes through here. Without it a pause leaves nothing behind but a
   * gap between `listen-loc` entries, and the toast it shows ("Listening paused") is the same one three
   * different paths raise — so a report like "the audio pauses when I switch views" could not be checked.
   * The stack hint names the caller, since several of these are reached indirectly (a
   * re-render triggered by a layout change, a modal pausing on the way up).
   */
  private logTransport(why: string): void {
    const via = (new Error().stack ?? '')
      .split('\n')
      .slice(3, 5)
      .map(
        (f) =>
          f
            .trim()
            .replace(/^at\s+/, '')
            .split(' ')[0]
      )
      .filter(Boolean)
      .join(' ← ');
    this.ctx.debug(
      `transport ${why} state=${this.state} recorded=${!!this.recorded} textHidden=${this.textHidden} via=${via}`,
      'tts'
    );
  }

  /** Pause active playback (live or recorded) if playing — used before a voice preview so the book
   *  audio and the sample don't overlap. Leaves the position intact so the user can resume. */
  pauseIfPlaying(): void {
    if (this.state !== 'playing') return;
    this.logTransport('pause-if-playing');
    this.pausePlayback();
  }

  dispose(): void {
    this.stop();
    this.lock.dispose(); // don't leak the lock's body class or touch guard if disposed locked
    // The bar and its chips are built again for the next book, so these must not keep the old ones.
    this.chipSlotObserver?.disconnect();
    this.chipSlotObserver = null;
    this.voiceChipEls = [];
    this.voiceChipSrcEls = [];
    this.voiceChipIconEls = [];
    this.voiceChipBtns = [];
    this.chipSpeeds.clear();
    this.chipAria = null;
    this.pocket.reset(); // nothing to put back in the next book
    this.media.clear();
    void this.wakeLock?.release();
    this.wakeLock = null;
    if (this.onVisibilityChange) {
      this.visibilityDoc?.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
      this.visibilityDoc = null;
    }
    this.engine?.dispose();
    this.engine = null;
    this.units = [];
    if (this.coverObjectUrl) {
      URL.revokeObjectURL(this.coverObjectUrl);
      this.coverObjectUrl = null;
    }
    this.toolbarBtn = null;
    this.barEl_ = null;
    this.playBtn = null;
    this.playIconEl = null;
    this.playerEl = null;
    this.playerCoverEl = null;
    this.playerCoverFallbackEl = null;
    this.coverLoadedForFile = null; // else a player rebuilt for the SAME book skips its (hidden) cover — see loadCover
    this.playerTitleEl = null;
    this.playerAuthorEl = null;
    this.playerPlayBtn = null;
    this.playerPlayIconEl = null;
    this.hlIconEl = null;
    this.noteIconEl = null;
    this.chapterLabelEl = null;
    this.progressFillEl = null;
    this.progressTrackEl = null;
    this.elapsedEl = null;
    this.remainingEl = null;
    this.bookLeftEl = null;
    this.coverContainer = null;
    this.sectionWaiter = null;
  }
}

/** "1×", "1.5×", "0.5×" — trims a trailing .0 for whole multipliers. */
function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)}×`;
}
