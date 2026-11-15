import type { ChapterPart } from '../book-chapters';
import type { ReadingHighlightMode, VoicePref } from '../settings';
import type { Pronouncer } from './tts/pronunciations';
import type { RecordedChapter } from './tts/recorded-audio';
import type { TtsEngineId } from './tts/TtsEngine';

/** A resolved live-voice override for a mix chapter assigned a specific live voice — the live engine
 *  uses this instead of the user's device voice pref for that chapter. */
export type LiveVoiceOverride = { source: 'orbis'; path: string; sid: number } | { source: 'system'; uri: string };

/** The voice reading a given chapter, with its provenance — drives the Listen bar chip (label) and
 *  the Voice & source modal's VOICE block (reason + whether the live-voice picker applies). */
export interface VoiceInfo {
  /** Short voice name for the bar chip (e.g. "Amy", "Bryce") — consistent across all voice kinds. */
  label: string;
  /** Full "Name — Locale, Gender" for the modal's VOICE line + the recording dropdown. */
  fullLabel: string;
  /** True when this chapter's voice IS the device's live-voice preference (so changing that voice
   *  changes what's heard now) — the modal shows a "Change voice" button only then. False when the
   *  voice is fixed by the recording / mix selection. */
  fromDeviceLive: boolean;
  /** One-line provenance sentence for the modal ("From your recording selection.", …). */
  reason: string;
  /**
   * Whether what you hear for this chapter is a recorded track rather than a voice speaking now.
   *
   * **The chip's glyph, and the whole reason it is a glyph.** Live-or-recorded is a binary that changes per
   * chapter, and words for it — "Live", "Recording" — would eat the slot the reader actually wants for the
   * name of their mix. A shape says it in no space at all. See `voice-glyphs.ts`.
   */
  recorded: boolean;

  /**
   * The recording or mix selected for this book, named the way the library names it — or **undefined when there
   * is nothing selected** (no recordings exist, or "None — use the live voice"), and undefined when the name
   * would merely repeat `label`, which is the case for a recording nobody has renamed: a recording is named by
   * its voice, so `Heart · Heart` would say one thing twice.
   *
   * A **book-level** fact, unlike everything else here. That is the point: it stays on the chip even when
   * the current chapter falls back to the live voice, so a reader listening to Mix 1 all evening can see its name
   * somewhere other than one popup.
   */
  source?: string;

  /**
   * Whether `label` actually came from `source`. False means it did not, and the chip parenthesises the name.
   *
   * **The distinction a name alone cannot make.** On a partly recorded book with "Heart" selected, a chapter
   * Heart never recorded is read by the device voice — and `Amy · Heart` would be claiming Amy came from Heart.
   * `Amy · (Heart)` says Heart is selected and is not what you are hearing here. Same for always-live, which
   * overrides a real selection rather than clearing it.
   *
   * Not the inverse of `recorded`: a mix chapter pinned to a specific live voice is live *and* from the
   * selection, and is the case that stops the parentheses from being cosmetic.
   */
  fromSelection: boolean;
}

/**
 * The narrow host contract `TtsController` needs from `OrbisReaderView`, beyond
 * the shared `ReaderContext`. Single-consumer, so it stays off `ReaderContext`
 * (same rationale as the other `*Host` interfaces). See
 * docs/design/text-to-speech.md.
 */
export interface TtsHost {
  /** Range at the current page's start (from the last relocate), or null. */
  currentPageRange(): Range | null;
  /** The sentence the book opened at, when it is still on the page showing — see `OrbisReaderView.resumeRangeOnPage`. */
  resumeRangeOnPage(doc: Document): Range | null;
  /** Navigate to the start of a spine section (for cross-section playback). */
  goToSectionStart(index: number): void;
  /**
   * The book's chapter PARTS, in reading order — the one list the player's ⏮/⏭ and the recording surface count by.
   * An entry is one recordable stretch: one MP3, one stop. Almost always a chapter has exactly one part; see
   * `book-chapters`.
   */
  chapterParts(): readonly ChapterPart[];
  /** Load the active edition's recorded audio for a PART (by its ordinal in `chapterParts`), or null when it
   *  has none — the controller prefers recorded (offline) audio when it exists. Edition-type-aware: a mix chapter
   *  resolves its audio + segments from the source (voice) edition it points at. */
  loadActiveEditionChapter(chapterIndex: number): Promise<RecordedChapter | null>;
  /** For a mix chapter assigned a SPECIFIC live voice this device has, the override the live engine should use;
   *  null for a normal chapter, an unassigned/"default live voice" mix chapter, a mix voice this device does not have
   *  (→ device voice pref, and `unavailable` names the one passed over), or when the active edition isn't a mix. */
  mixLiveVoiceOnDevice(chapterIndex: number): Promise<{ voice: LiveVoiceOverride | null; unavailable?: string }>;
  /** Global playback source: 'recorded' prefers generated recording audio, 'live' forces the live
   *  engine even when generated audio exists. Read on every chapter load (see loadRecordedFor). */
  playbackSource(): 'recorded' | 'live';
  /** Open the Listen settings popup (playback source + edition). Invoked from the bar/player gear. */
  openListenSettings(): void;
  /**
   * What the Listen bar's voice chip says about the given chapter: the short name of the voice reading it
   * ("Bryce", "Amy"), where that voice came from, and the sentence a screen reader gets. Mix-aware (resolves the
   * chapter's assigned source). Async — reads the editions index.
   *
   * The chip takes three of `VoiceInfo`'s fields rather than one, so it is handed the whole thing. Painting `label`
   * alone would leave a book playing "Mix 1" with nothing on screen saying so anywhere but inside a popup.
   */
  currentVoiceInfo(chapterIndex: number): Promise<VoiceInfo>;
  /** The persisted playback-rate multiplier. */
  ttsRate(): number;
  /** Persist a new playback-rate multiplier and save settings. */
  persistTtsRate(rate: number): void;
  /** Persist which engine was actually used (so 'auto' can be reported). */
  onEngineResolved?(id: TtsEngineId): void;
  /** This device's saved Listen voice preference (source + chosen voice), or undefined. */
  deviceVoicePref(): VoicePref | undefined;
  /** Upsert this device's voice preference (used by the first-run "use a system voice" action). */
  setDeviceVoicePref(patch: Partial<Omit<VoicePref, 'deviceId'>>): Promise<void>;
  /** The Live voice picker (the same one Settings → Listening shows) — `onChanged` after each choice, `onClosed` once. */
  openLiveVoicePicker(onChanged?: () => void, onClosed?: () => void): void;
  /** The selected Orbis (on-device) voice resolved to a model path + speaker id, with fallback
   *  to the catalog default when nothing is chosen. */
  resolvedOrbisVoice(): { path: string; sid: number };
  /** The chosen system (Web Speech) voice URI for this device, or undefined for the OS default. */
  resolvedSystemVoiceURI(): string | undefined;

  // ── Full recording-player surface ──
  /** The book's cover image, or null if it has none / can't be loaded. */
  bookCover(): Promise<Blob | null>;
  /** Book title / author for the now-playing screen (may be empty strings). */
  bookTitle(): string;
  bookAuthor(): string;
  /** Chapter label for a spine section (via the TOC). */
  chapterLabel(sectionIndex: number): string;
  /** The TOC entry href at a range within a section (the deepest entry at that position), or null.
   *  Lets the player label by the sentence being READ, not the view's parked page — so a section
   *  that opens with a Part divider reads as "PART IV – CHAPTER I" once into the chapter. */
  tocHrefForRange(range: Range, sectionIndex: number): string | null;
  /**
   * The contents entry before or after `fromHref`, or null at either end.
   *
   * **What ⏮/⏭ count.** Moving by spine section is right only where one file is one chapter: a book with 80
   * contents entries inside 7 files would run out after a few presses while the panel beside it lists eighty.
   * The contents are the thing the reader is looking at, so they are the thing the buttons move through.
   */
  tocNeighbourHref(fromHref: string, dir: 1 | -1): string | null;
  /** Every contents entry's href, flattened into reading order — what the player measures a chapter by. */
  tocHrefs(): readonly string[];
  /**
   * Take the book to a contents entry, as a click in the contents panel does.
   *
   * Marked as a user navigation deliberately: that is what makes the audio follow through the reader's own
   * relocate path (`onUserNavigated`), which already knows how to pick recorded audio or the live engine by
   * destination — rather than the player inventing a second way to move itself.
   */
  goToTocHref(href: string): boolean;
  /** Disambiguated chapter label (e.g. "PART II – CHAPTER I", the Generate-Notes / export
   *  style) for the current position. `positionHref` is the current TOC entry's href (from a
   *  relocate) when known — it resolves the position-aware entry so a section that holds both a
   *  Part and a Chapter reads as the Chapter; empty falls back to the section's label. */
  chapterDisplayLabel(sectionIndex: number, positionHref: string): string;
  /** Per-section word counts and the book total, for duration estimates. */
  sectionWords(): readonly number[];
  /** Words per track (chapter part), zero until the location index is measured — see `OrbisReaderView.chapterWords`. */
  chapterWords(): readonly number[];
  totalWords(): number;
  /** Persist a highlight for a range being read aloud (sentence or paragraph).
   *  `sectionIndex` is the section being *read* (may differ from the on-screen one). */
  highlightRange(range: Range, sectionIndex: number): void;
  /** Open the note editor on a range being read aloud, in the given read section.
   *  `onClose` fires when the editor is saved or cancelled (used to resume playback). */
  addNoteForRange(range: Range, sectionIndex: number, onClose?: () => void): void;
  /** Bookmark (or un-bookmark) the sentence being read aloud, as an audio bookmark.
   *  Returns true if a bookmark was added, false if an existing one was removed. */
  toggleAudioBookmark(range: Range, sectionIndex: number): boolean;
  /** "Marks for listening and notes" — the listening view's marks button. See `MarkRolesPopup`. */
  openMarkRoles(): void;
  /** The colors of the book's two annotation ROLE marks, for the player's action-icon previews: the
   *  highlighter nib shows what the Highlight button will apply, the pencil what a new note will get.
   *  Either is null when the role resolves to no mark (a note gets none by default). */
  roleMarkColors(): { audio: string | null; note: string | null };
  /** Whether the listening Highlight/Note buttons act on the sentence or the paragraph. */
  audioHighlightGranularity(): 'sentence' | 'paragraph';
  audioNoteGranularity(): 'sentence' | 'paragraph';
  /** Chunk-size cap (chars) for grouping sentences into synthesis units — the Read-ahead
   *  setting mapped to a number (0 = per sentence). */
  readAheadMaxChars(): number;
  /** How much text the reading highlight spans while audio plays (Settings → Listening). */
  readingHighlight(): ReadingHighlightMode;
  /** The user's pronunciation respellings, compiled (and cached) by the host; null when empty. */
  pronouncer(): Pronouncer | null;
  /** Seconds the rewind / forward buttons jump. Independently configurable (Settings → Listening). */
  skipBackSeconds(): number;
  skipForwardSeconds(): number;
  /** Whether to hold a screen wake lock while audio plays (Settings → Listening). */
  keepScreenAwake(): boolean;
  /** Turn Focus mode on or off — Pocket mode needs it, and puts it back (`PocketMode`). */
  toggleFocusMode(): void;
  /** Black out the reader's colors (pocket mode) — a transient override to the dark reader theme's
   *  #000/#fff so the locked player is mostly-black (OLED); restores the real theme when off. */
  setListeningBlackout(on: boolean): void;
  /** Redraw all saved highlights/notes on the overlay — used when returning to the text
   *  after listening, so annotations made in the player appear without a reload. */
  refreshAnnotations(): void;
  /** The full-screen player is showing (text hidden) — hide the floating history back/forward
   *  buttons, which otherwise paint over the player (and would be tappable while pocket-locked). */
  setFullPlayerActive(active: boolean): void;
  /** Persist the sentence being read as the book's last-read location — used in the full-screen
   *  player, where the reader doesn't page (so no relocate fires to save it). */
  saveListeningLocation(range: Range, sectionIndex: number): void;
  /** Build an indirection range CFI for a DOM range in a section — a stable "resume anchor" the
   *  player keeps while a Display/Settings change re-renders the section (killing the live Range). */
  cfiForRange(range: Range, sectionIndex: number): string | null;
  /** Resolve a range CFI back to a live DOM range + its section index in the current layout —
   *  used to re-seat playback after a re-render. Null if it can't be resolved yet. */
  resolveCfi(cfi: string): Promise<{ sectionIndex: number; range: Range } | null>;
}
