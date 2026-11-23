import {
  collapse as cfiCollapse,
  compare as cfiCompare,
  fake as cfiFake,
  fromRange as cfiFromRange,
  joinIndir as cfiJoinIndir,
} from 'foliate-js/epubcfi.js';
import { Overlayer } from 'foliate-js/overlayer.js';
// Static imports force esbuild to bundle foliate-js into main.js.
import * as FoliateViewMod from 'foliate-js/view.js';
import { App, FileView, Menu, Notice, normalizePath, Platform, TFile, WorkspaceLeaf } from 'obsidian';
import { AnnotationCleanupModal, removedMessage, repairedMessage } from './AnnotationCleanupModal';
import { openAnnotationPresets } from './AnnotationPresetsModal';
import {
  type AnnotationPreset,
  type BookPreset,
  type PromotedPreset,
  presetFromBookCopy,
  type RemapChoice,
} from './annotation-presets';
import { BookExportModal } from './BookExportModal';
import {
  type ChapterPart,
  type ChapterSource,
  chapterParts,
  chapterStepFromPage,
  groupFrontMatter,
  hasOneChapter,
  joinChapterLabels,
  LABEL_CHARS,
  mergeStubs,
  partIsLabelOnly,
  partStartHref,
  partWordCounts,
  splitLeadIns,
  splitLongParts,
} from './book-chapters';
import { openBookDataFile } from './book-data-file';
import { isBookExtension } from './book-formats';
import { describeOpenFailure } from './book-open-error';
import { catalogThisBook } from './catalog-this-book';
import { chapterName } from './chapter-name';
import { actionRow } from './controls';
import { DeviceLocationsModal } from './DeviceLocationsModal';
import { deviceSetting, deviceSettings, setDeviceSetting } from './device-settings';
import { getOrCreateDeviceId } from './device-store';
import {
  installFoliateSrcdocPatch,
  installNoScriptSandboxPatch,
  reportStaleRenderer,
  stampRenderer,
} from './foliate-patches';
import { GenerateNotesModal, NotesFilePickerModal, type PickerEntry } from './GenerateNotesModal';
import { parseGoToInput } from './goto-parser';
import { t } from './i18n';
import { type KindleBook, kindleResource } from './kindle-resources';
import { titleNoteFor } from './library/title-note';
import { openMarkRoles } from './MarkRolesPopup';
import type { MarksPdfScope } from './marks-pdf';
import { MarksPdfSource } from './marks-pdf-source';
import { dialogIsOpen } from './OrbisModal';
import { openNoteBeside } from './panes';
import {
  bookAudioFolderPath,
  DeviceLocationRecord,
  isolatedHere,
  NotesFileSet,
  progressFilePath,
  readAllDeviceLocations,
  readLocsCache,
  readNotesFiles,
  readReadingStats,
  readSavedLocation,
  saveBookInfo,
  saveLocation,
  TocEntry,
  writeLocationOnOpen,
} from './progress';
import { RecordingsModal } from './RecordingsModal';
import { AnnotationController } from './reader/AnnotationController';
import type { AnnotationHost } from './reader/AnnotationHost';
import { findRepairs, scanAnnotationData } from './reader/annotation-repair';
import { BookmarkController } from './reader/BookmarkController';
import { barOwnsKey } from './reader/bar-keys';
import { tagBodyText } from './reader/body-text';
import { hardenBookCopies } from './reader/book-copies';
import { bookElement } from './reader/book-element';
import { ClipboardExporter } from './reader/ClipboardExporter';
import { cfiSortKey } from './reader/cfi-sort';
import { repairChapterContrast } from './reader/contrast-repair';
import { DebugLog } from './reader/DebugLog';
import { hasMarksToExport, type NotesData } from './reader/export-format';
import { FocusMode, type FocusModeHost } from './reader/FocusMode';
import { flashTarget, LANDING_FLASH_COLOR } from './reader/flash-target';
import type { FoliateViewEl, RawSection } from './reader/foliate-view';
import { relayFrameFocus, relayFramePress } from './reader/frame-focus';
import { commandFor, type Hotkey } from './reader/hotkey-match';
import { ImageViewer } from './reader/ImageViewer';
import { scaleKeywordSizes } from './reader/keyword-sizes';
import { LinkCheck } from './reader/LinkCheck';
import { LinkPreview } from './reader/LinkPreview';
import type { LinkPreviewHost } from './reader/LinkPreviewHost';
import { LocationIndex } from './reader/LocationIndex';
import type { LocationIndexHost } from './reader/LocationIndexHost';
import { readLinkAddress } from './reader/link-address';
import { locAtCfi, locStartsOf } from './reader/loc-lookup';
import { LookupController } from './reader/lookup/LookupController';
import { metadataText } from './reader/metadata-text';
import { NavSuppressor } from './reader/NavSuppressor';
import { NotesExporter } from './reader/NotesExporter';
import { watchBookChanges } from './reader/orbis-file-watch';
import type { PanelsHost } from './reader/PanelsHost';
import { keepPictureAspect } from './reader/picture-aspect';
import type { AudioBookmarkTarget, ReaderContext } from './reader/ReaderContext';
import { ReaderDom } from './reader/ReaderDom';
import { ReaderPanels } from './reader/ReaderPanels';
import { ReadingStats } from './reader/ReadingStats';
import { RecordsController } from './reader/RecordsController';
import { restampLocs } from './reader/restamp-locs';
import { SearchController } from './reader/SearchController';
import { type ClosableBar, SecondaryBar, SecondaryBarRegistry } from './reader/SecondaryBar';
import { SentenceSelection } from './reader/SentenceSelection';
import type { StatsHost } from './reader/StatsHost';
import type { SentenceMove } from './reader/sentence-cursor';
import { TtsController } from './reader/TtsController';
import type { LiveVoiceOverride, TtsHost, VoiceInfo } from './reader/TtsHost';
import { observeTheme } from './reader/theme-watch';
import { type PassageEntry, tocEntryAt } from './reader/toc-entry';
import { installToolbarKeys } from './reader/toolbar-keys';
import { setReaderBottomSpace } from './reader/top-space';
import { orbisVoiceAsker } from './reader/tts/FirstVoiceModal';
import { genIdentity } from './reader/tts/gen-config';
import { estimateGenSeconds } from './reader/tts/gen-timing';
import { askForLiveVoice } from './reader/tts/live-voice-ask';
import { liveVoicePicker } from './reader/tts/live-voice-picker';
import { type PreviewHandle, resetPiperWarm } from './reader/tts/PiperEngine';
import { NARRATION_WPM } from './reader/tts/pacing';
import { openPronunciationEditorPopup } from './reader/tts/pronunciation-editor';
import { createPronunciationStore, type PronunciationStore, previewVoices } from './reader/tts/pronunciation-service';
import type { Pronouncer } from './reader/tts/pronunciations';
import type { RecordedChapter } from './reader/tts/recorded-audio';
import {
  createMix,
  listEditions,
  loadEditionChapter,
  type MixLiveVoice,
  readEditionManifest,
  readMix,
  setMixLive,
  setMixSource,
} from './reader/tts/recording-editions';
import { type GenProgress } from './reader/tts/recording-generator';
import { mixLiveVoiceFor, mixLiveVoiceOnDevice, mixVoiceOnDevice } from './reader/tts/recording-library';
import { type FinishedRun, RecordingRun } from './reader/tts/recording-run';
import { type ResolvedLiveVoice, resolveDeviceLiveVoice, type SpeakOnceDeps, speakOnce } from './reader/tts/speak-once';
import type { TtsEngineId } from './reader/tts/TtsEngine';
import { getReadingUnits } from './reader/tts/tts-blocks';
import { orbisVoiceOrDefault } from './reader/tts/voice-catalog';
import { chipSourceName } from './reader/tts/voice-chip';
import { type RecordingMethod, VoicePicker } from './reader/tts/voice-picker';
import {
  createPiperVoiceProvider,
  createSystemVoiceProvider,
  describeEditionVoice,
  shortVoiceLabel,
} from './reader/tts/voice-providers';
import { findSystemVoice, onVoicesChanged, WebSpeechEngine } from './reader/tts/WebSpeechEngine';
import { sampleSystemBar } from './reader/viewport-insets';
import { dimColor, MATCH_OBSIDIAN_MODE, paintPageColor, type ThemeColors, themeColors } from './reader-themes';
import type { RecordKinds } from './record-config';
import {
  asReadingHighlightMode,
  asSkipSeconds,
  buildBookCss,
  DebugCategory,
  DISPLAY_STYLE_APPLIED,
  DisplaySettings,
  Flow,
  IOrbisReaderPlugin,
  loadSettings,
  NoteStyle,
  ProgressMode,
  parseHyphenation,
  parseTextAlign,
  ReadingHighlightMode,
  readAheadMaxChars,
  STORAGE_KEY_BRIGHTNESS,
  STORAGE_KEY_COLUMNS,
  STORAGE_KEY_FLOW,
  STORAGE_KEY_FONT_FAMILY,
  STORAGE_KEY_FONT_SIZE,
  STORAGE_KEY_HYPHENATION,
  STORAGE_KEY_LINE_HEIGHT,
  STORAGE_KEY_MARGINS,
  STORAGE_KEY_TEXT_ALIGN,
  STORAGE_KEY_THEME,
  VoicePref,
} from './settings';
import { bindRealTimeSliderInput } from './slider-input';
import { ANNOTATIONS_ICON_ID, annotationsSvg, CONVERSION_ICON_ID } from './system-glyphs';
import { openRatingDialog, openStatusDialog } from './TitleFieldModal';
import {
  type FlatTocChapter,
  flattenTocWithDisambiguation,
  markTocSections,
  tocNeighbourHref,
  topLevelChapters,
} from './toc-utils';
import { createOrbisPopup, setSvgIcon } from './ui-utils';
import { continuationSections } from './unlisted-sections';
import { VoiceRecordingsModal } from './VoiceRecordingsModal';
import { VIEW_TYPE_ORBIS } from './view-types';

export { VIEW_TYPE_ORBIS };

/** Highlight color pulsed briefly over a bookmark's anchor lines when you navigate to it. */
const BOOKMARK_FLASH_COLOR = '#FFC107';
/** Overlay key for the transient bookmark-navigation flash. */
const FLASH_KEY = 'orbis-bookmark-flash';

/** How long to wait before re-offering the device-locations prompt, and how many times. Two minutes in total:
 *  long enough to outlast a glance at Settings, short enough that a reader who left a dialog open is not polled
 *  for the rest of the session. See `openDeviceModal`. */
const DEVICE_PROMPT_RETRY_MS = 2500;
const DEVICE_PROMPT_MAX_TRIES = 48;

/** A `data:` URL back to a Blob, for the cover cached in `.orbis`. Returns null for anything that
 *  isn't a well-formed base64 data URL (the file is hand-editable). */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

async function blobToDataUrl(blob: Blob, maxWidth = 400): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = objectUrl;
    });
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const canvas = createEl('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas context');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ── Notes file picker ─────────────────────────────────────────────────────────

// ── Generate Notes dialog ─────────────────────────────────────────────────────

interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[] | null;
}

interface FoliateViewModule {
  View?: CustomElementConstructor;
  makeBook(file: File): Promise<unknown>;
}

// As this file is first read — right after foliate registered its elements, if this load is the one that did.
stampRenderer((FoliateViewMod as unknown as FoliateViewModule).View);

/**
 * How long saved content has to be quiet before records are written.
 *
 * Long enough that a burst of edits — recolour, re-mark, retype — settles into one write, short enough that a
 * highlight you made is queryable by the time you go looking for it. The cost of being wrong in either direction
 * is small: too short writes a file twice, too long delays it.
 */

/**
 * How long after a save the `ask` prompt waits, then how often it re-checks, and how many times.
 *
 * Longer than the settle above: the question interrupts, so it should arrive once the reader has finished with
 * whatever they were doing rather than in the middle of it. The retry cap (~1 minute) stops a reader who leaves
 * a dialog open from being polled forever — their next save arms it again.
 */
export class OrbisReaderView
  extends FileView
  implements
    ReaderContext,
    FocusModeHost,
    AnnotationHost,
    StatsHost,
    PanelsHost,
    LinkPreviewHost,
    LocationIndexHost,
    TtsHost
{
  readonly allowNoFile = false as const;

  foliateView: FoliateViewEl | null = null;
  private saveTimer: number | null = null;
  /** CFI the debounced save timer is about to persist — may be a sentence CFI
   *  from the full-screen player, distinct from the view's parked `lastCfi`. */
  private pendingCfi: string | null = null;
  lastCfi: string | null = null;
  /** Active book-scoped recording generation run (book-tied), or null when idle. */
  /** Shared pronunciation-dictionary store (settings-backed; recompiles + resets engines on write).
   *  Assigned in the constructor, not as a field initializer — field initializers run before the
   *  constructor body sets `this.plugin`. */
  private readonly pronStore: PronunciationStore;
  private lastSavedCfi: string | null = null;
  /**
   * Where the book opened — the sentence listening last saved, when it was listening — until listening speaks again
   * or the reader moves (`resumeRangeOnPage`). Not the last SAVED place: opening relocates to the page and saves its
   * top within a second, which would replace the sentence before ▶ could ask for it.
   */
  private openedAtCfi: string | null = null;
  /** Bumped on each bookmark-navigation flash so a superseded blink chain bails. */
  private flashEpoch = 0;
  /** Set by a user navigation; consumed on the next relocate to resync the audio player to the
   *  landing spot. `userNavTargetCfi` is the precise destination (bookmark/highlight/note/search
   *  sentence) when known, so the player seeks to that sentence rather than the page top. */
  private userNavPending = false;
  private userNavTargetCfi: string | null = null;
  currentFile: TFile | null = null;
  plugin: IOrbisReaderPlugin;
  public settings: DisplaySettings;
  private themeObserver: MutationObserver | null = null;
  /** The colors last painted, as a key — so a style change that leaves them alone repaints nothing. See `refreshTheme`. */
  private paintedTheme = '';
  public hostEl: HTMLElement | null = null;
  public filterWrapperEl: HTMLElement | null = null;
  private tocBtn: HTMLButtonElement | null = null;
  private annotationsBtn: HTMLButtonElement | null = null;
  public displayStyleBtn: HTMLButtonElement | null = null;

  focusBtn: HTMLButtonElement | null = null;
  private focus!: FocusMode;
  // Normally lives inside filterWrapperEl (positioned relative to the book
  // content). Temporarily re-parented into focusOverlayEl while in focus
  // mode — see enterFocusMode()/exitFocusMode() — since filterWrapperEl has
  // `overflow: hidden` and can carry an active CSS `filter` (brightness),
  // and a `position: fixed` descendant of a filtered+clipped ancestor gets
  // its containing block hijacked by that ancestor instead of the true
  // viewport, which puts this pair in the wrong spot specifically when
  // the host's own top offset changes (search bar open).
  historyNavEl: HTMLElement | null = null;
  /** FocusModeHost: the mobile highlight drawer row, owned by AnnotationController.
   *  FocusMode re-parents it into its overlay and bottom-anchors it over the chip. */
  get highlightDrawerRow(): HTMLElement | null {
    return this.annot.drawerRow;
  }
  toolbarEl: HTMLElement | null = null;
  /** FocusModeHost: Foliate's renderer, whose `margin` focus mode narrows — see `FOCUS_PAGE_MARGIN`. */
  get foliateRenderer(): HTMLElement | null {
    return this.foliateView?.renderer ?? null;
  }
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  // All book iframe Documents handed to us via the 'load' event.
  // We keep these so re-injection works without needing shadow-DOM access.
  loadedDocs = new Set<Document>();
  // Spine sections from the book — used for section-level navigation in scrolled mode.
  bookSections: Array<{ id: string }> = [];
  private bookResources: { loadBlob: (href: string) => Promise<Blob>; getCover?: () => Promise<Blob | null> } | null =
    null;
  /** The loaded book's `getCover`, kept SEPARATE from `bookResources`. That field is deliberately gated on
   *  `loadBlob` (an EPUB resource loader its other consumers need), but MOBI and AZW3 expose
   *  `getCover` *without* `loadBlob` — so reading the cover off `bookResources` would silently lose it for those
   *  formats even though extraction works fine. Bound, since foliate's handlers use `this`. */
  private bookGetCover: (() => Promise<Blob | null>) | null = null;
  currentSectionIndex = 0;
  totalBookSize = 0; // sum of section.size values, used as fallback estimate
  private isNavigating = false;
  lastSection: { current: number; total: number } | null = null;
  lastLocation: { current: number; total: number } | null = null;
  private bookmarkCtl!: BookmarkController;
  private annot!: AnnotationController;
  private lookup!: LookupController;
  private stats!: ReadingStats;
  private panels!: ReaderPanels;
  private linkPreview!: LinkPreview;
  private linkCheck!: LinkCheck;
  private imageViewer!: ImageViewer;
  readerDom!: ReaderDom;
  private locIndex!: LocationIndex;

  // ── LocationIndex-owned data (StatsHost / LinkPreviewHost / ReaderContext reads) ──
  get sectionLocInfo(): Array<{ startLoc: number; locCount: number }> {
    return this.locIndex.sectionLocInfo;
  }
  get sectionWordCounts(): number[] {
    return this.locIndex.sectionWordCounts;
  }
  get sectionCharCounts(): number[] {
    return this.locIndex.sectionCharCounts;
  }
  get totalBookChars(): number {
    return this.locIndex.totalBookChars;
  }
  get totalBookWords(): number {
    return this.locIndex.totalBookWords;
  }
  get locWordCounts(): Map<number, number> {
    return this.locIndex.locWordCounts;
  }
  get sectionHrefMap(): Map<string, number> {
    return this.locIndex.sectionHrefMap;
  }
  get tocStartFractions(): Map<string, number> {
    return this.locIndex.tocStartFractions;
  }

  // ── LocationIndexHost ──
  setNavigating(v: boolean): void {
    this.isNavigating = v;
  }

  invalidateChapterBoundaries(): void {
    this.stats.invalidateChapterBoundaries();
  }

  indexReady(): void {
    // The page's number moves onto the index's locations, and so does every one stored before it was up.
    if (this.lastLocation && this.lastCfi) {
      const current = this.getLocForCfi(this.lastCfi);
      if (current != null) this.lastLocation = { ...this.lastLocation, current };
    }
    this.restampLocs();
    this.stats.updateLocLabel();
  }
  currentTocLabel: string | null = null;
  // CFI that was active when lastLocation was last updated — used to detect stale
  // lastLocation (foliate sometimes fires relocate with a new cfi but no location data).
  lastLocationCfi = '';
  // Set when navigating to a bookmark via the saved panel so the relocate handler
  // can calibrate bm.loc to what foliate actually reports for that CFI.
  // Suppresses Foliate's focusin→#scrollToAnchor re-scroll during navigation. Without this,
  // setSelectionTo() (called after every goTo) fires focusin on the caret's parent element;
  // if that element starts on the previous page its first clientRect lands there, overriding
  // the correct navigation target. Sticky: set before goTo(), cleared in the relocate handler
  // (not on focusin) so ALL focusin events in the navigation window are blocked.
  // Suppresses focusin-driven navigation while jumping to a target CFI, and holds
  // the target/post-nav state the relocate handler uses to correct the landing
  // position. Shared by search and annotation navigation. See NavSuppressor.
  navSuppressor = new NavSuppressor();
  // When navigating within the same section, goTo(cfi) can resolve the CFI to an anchor that
  // has a different rect.left than the annotation range (e.g. pointing to the element rather than
  // the specific text position). We bypass goTo in this case and use the annotation range from
  // draw-annotation directly. Set to the amber CFI before addAnnotation fires; cleared in handler.
  docToSection = new Map<Document, number>();
  // Go To location: a snapped secondary bar (like the search bar) rather than a
  // centered popup — it lives above the on-screen keyboard, which a centered dialog
  // fights with on mobile (black gap in portrait, cut off in landscape).
  private readonly barRegistry = new SecondaryBarRegistry();
  private displayMenuBar: ClosableBar | null = null;
  private goToBar: SecondaryBar | null = null;
  private goToInputEl: HTMLInputElement | null = null;
  private goToHintEl: HTMLElement | null = null;
  private search!: SearchController;
  private tts!: TtsController;
  /** Range at the current page's start, from the last relocate (for read-aloud). */
  private lastPageRange: Range | null = null;
  tocItems: TocItem[] = [];
  /** `bookChapters()`'s memo, and the input lengths it was built from — see `bookChapters`. */
  private bookChaptersCache: readonly ChapterPart[] | null = null;
  private bookChaptersKey = '';
  /** `sectionContinues`'s memo, keyed on the same kind of input lengths — see `chapterParts`. */
  private continuationsCache: { key: string; set: Set<number> } | null = null;
  private debugLog!: DebugLog;
  private notesExporter!: NotesExporter;
  private clipboardExporter!: ClipboardExporter;
  // New Display Style Toolbar Properties
  public displayMenuWrapper?: HTMLElement;
  public displayMenuOverlay: HTMLElement | null = null;
  public level2Toolbar: HTMLElement | null = null;
  public level3Container: HTMLElement | null = null;
  public displayTabBtns: Record<string, HTMLButtonElement> = {};
  public displayDrawers: Record<string, HTMLElement> = {};
  public syncDisplayMenu?: () => void;
  public activeDisplayTab: string | null = null;
  bookMeta = { title: '', author: '', publisher: '', language: '', pubdate: '', description: '' };

  constructor(leaf: WorkspaceLeaf, plugin: IOrbisReaderPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.settings = loadSettings(this.app, plugin.settings);
    this.debugLog = new DebugLog(this.app);
    this.search = new SearchController(this, this.barRegistry);
    this.tts = new TtsController(this, this);
    this.focus = new FocusMode(this);
    this.bookmarkCtl = new BookmarkController(this, this);
    this.annot = new AnnotationController(this, this);
    this.pronStore = createPronunciationStore(plugin);
    this.lookup = new LookupController(
      this,
      this.plugin.dictionaries,
      () => this.plugin.settings.lookupSections,
      () => this.plugin.settings.lookupWebDestinations,
      {
        speak: (text, onDone) => speakOnce(this.speakOnceDeps(true), text, onDone),
        // Verbatim: auditioning a respelling must not re-run it through the dictionary.
        speakLiteral: (text, onDone) => speakOnce(this.speakOnceDeps(false), text, onDone),
        // Pause only — the spoken selection deliberately doesn't resume narration afterwards.
        pauseAudio: () => this.tts.pauseIfPlaying(),
      },
      {
        find: (word) => this.pronStore.find(word),
        // Delegates to the shared editor so the reading-time flow and the Settings manager offer the
        // same fields, the same live/recording previews and the same validation.
        openEditor: (word, current, onChanged) =>
          openPronunciationEditorPopup(
            this,
            {
              voices: () => previewVoices(this.plugin),
              pauseAudio: () => this.tts.pauseIfPlaying(),
              upsert: (w, say, enabled) => this.pronStore.upsert(w, say, enabled),
              remove: (w) => this.pronStore.remove(w),
            },
            word,
            current,
            onChanged
          ),
      }
    );
    this.stats = new ReadingStats(this, this);
    this.linkPreview = new LinkPreview(this, this);
    this.linkCheck = new LinkCheck(this, (msg) => this.addDebugEntry(msg, 'display'));
    this.imageViewer = new ImageViewer(this);
    this.readerDom = new ReaderDom(this);
    this.locIndex = new LocationIndex(this, this);
    this.panels = new ReaderPanels(this, this, {
      search: this.search,
      stats: this.stats,
      bookmarks: this.bookmarkCtl,
      annot: this.annot,
    });
    this.notesExporter = new NotesExporter(this);
    this.recordsCtl = new RecordsController(this, this);
    this.clipboardExporter = new ClipboardExporter(this);
  }

  get bookToc(): TocItem[] {
    return this.tocItems;
  }
  get bookSectionsPublic(): Array<{ id: string }> {
    return this.bookSections;
  }
  getChapterForSection(sIdx: number): string {
    return this.chapterForSection(sIdx);
  }
  /** Like chapterForSection but returns '' when there is no exact TOC match — no proportional fallback. */
  exactChapterForSection(sIdx: number): string {
    // Return the disambiguated displayLabel, not the raw TOC label — chapter
    // labels repeat across parts in many books ("PART I > CHAPTER I", "PART
    // II > CHAPTER I"), and this feeds book-export chapter titles/filenames.
    return this.tocEntriesInSection(sIdx)[0]?.displayLabel ?? '';
  }

  /**
   * The contents entries that point into this section's file, in contents order: an href naming the section, or one
   * whose file name matches it. Empty when the section has no id or the book no contents.
   */
  private tocEntriesInSection(sIdx: number): FlatTocChapter[] {
    const sectionId = String(this.bookSections[sIdx]?.id ?? '');
    if (!sectionId || !this.tocItems.length) return [];
    const basename = (h: string) => h.split('#')[0].split('/').pop() ?? h;
    const sh = basename(sectionId);
    return flattenTocWithDisambiguation(this.tocItems).filter(
      (t) => basename(t.href) === sh || t.href.split('#')[0] === sectionId
    );
  }
  get focusMode(): boolean {
    return this.focus.isActive;
  }

  get showProgressIndicator(): boolean {
    return deviceSetting('showProgressIndicator');
  }

  onFocusModeChanged(active: boolean): void {
    this.search.onFocusModeToggled(active);
    this.tts.onFocusModeToggled(active);
  }

  debug(msg: string, category: DebugCategory): void {
    this.debugLog.add(msg, category);
  }

  get flow(): string {
    return this.settings.flow;
  }

  get keyboardPageTurn(): boolean {
    return deviceSetting('keyboardPageTurn');
  }

  get confirmDeleteNote(): boolean {
    return deviceSetting('confirmDeleteNote');
  }

  formatLocLabel(): string {
    return this.stats.formatLocLabel();
  }

  // ── LinkPreviewHost ──
  get linkPreviewEnabled(): boolean {
    return deviceSetting('linkPreviewEnabled');
  }

  sectionForDoc(doc: Document): number | undefined {
    return this.docToSection.get(doc);
  }

  /** Where a bare `#id` lands when the book's ids are book-wide (FB2) — see `LocationIndex.fragmentSectionIndex`. */
  fragmentSectionIndex(id: string): number | undefined {
    return this.locIndex.fragmentSectionIndex(id);
  }

  readerColors(): { bg: string; fg: string; filter: string } {
    const { bg, fg } = this.paintColors();
    return {
      bg,
      fg,
      filter: this.settings.brightness !== 100 ? `brightness(${this.settings.brightness}%)` : 'none',
    };
  }

  // ── PanelsHost ──
  /**
   * Put the keyboard back on the book.
   *
   * Navigating from a panel or a toolbar button leaves focus on the control that was clicked, which is right when
   * a panel is DISMISSED — the reader should get back the thing they opened it with — and wrong when it is
   * dismissed by going somewhere. Tab would then walk the toolbar instead of entering the text, and the reading
   * keys would have nothing to act on until the book was clicked.
   */
  focusReader(): void {
    this.hostEl?.focus({ preventScroll: true });
  }

  focusTocButton(): void {
    this.tocBtn?.focus();
  }

  // ── StatsHost ──
  get progressModeSetting(): ProgressMode | 'blank' {
    return deviceSetting('progressMode');
  }

  progressModesConfig(): Array<{ id: ProgressMode; visible: boolean }> | undefined {
    return deviceSetting('progressModes');
  }

  persistProgressMode(mode: ProgressMode | 'blank'): void {
    // Which readout the chip is showing is this device's own business — tapping it on a phone must not change what
    // the desktop shows. Beside the device, so there is nothing to save and nothing to publish.
    setDeviceSetting('progressMode', mode);
  }

  setFocusProgressText(text: string): void {
    this.focus.setProgressText(text);
  }

  get statsPaneEl(): HTMLElement | null {
    return this.panels.statsPaneEl;
  }

  isStatsPaneOpen(): boolean {
    return this.panels.isStatsOpen();
  }

  notesData(): NotesData {
    const f = this.currentFile;
    return {
      filePath: f?.path ?? '',
      fileBasename: f?.basename ?? '',
      meta: this.bookMeta,
      highlights: this.annot.highlights,
      notes: this.annot.notes,
      bookmarks: this.bookmarkCtl.all,
      tocItems: this.tocItems ?? [],
      bookSectionCount: this.bookSections.length,
      frontmatterKeyLanguage: this.plugin.settings.frontmatterKeyLanguage,
      // The BOOK's copy, not the library preset: an annotation's `markId` can name a mark this book owns
      // and no preset has, and the copy is also what the reader sees on screen. Resolving against the
      // library would silently drop the badge and name of every local mark.
      marks: this.annot.bookPresetCopy?.marks,
    };
  }

  invalidateBacklinks(path: string): void {
    this.panels.invalidateBacklinks(path);
  }

  openNoteView(noteId: string, opts?: { highlight?: string }): void {
    const note = this.annot.notes.find((n) => n.id === noteId);
    if (note) this.annot.openNoteView(note, opts);
  }

  closeNoteView(): void {
    this.annot.closeNoteView();
  }

  activeSearchTerm(): string {
    return this.search.activeQuery();
  }
  /**
   * The book's cover: extracted live, else the copy cached in the `.orbis` file.
   *
   * The cache matters because extraction isn't uniformly reliable across formats, and `.orbis` already
   * holds a cover for every book the data view has ever shown — so falling back keeps the player
   * consistent with what the reading-data view displays instead of showing nothing.
   */
  async getCoverBlob(): Promise<Blob | null> {
    try {
      const live = (await this.bookGetCover?.()) ?? null;
      if (live) return live;
    } catch {
      /* fall through to the cached copy */
    }
    return this.cachedCoverBlob();
  }

  /** The `coverImage` data URL saved in the book's `.orbis` file, as a Blob. Null when absent. */
  private async cachedCoverBlob(): Promise<Blob | null> {
    const file = this.file;
    if (!file) return null;
    try {
      const path = normalizePath(progressFilePath(file));
      if (!(await this.app.vault.adapter.exists(path))) return null;
      const raw = JSON.parse(await this.app.vault.adapter.read(path)) as { coverImage?: unknown };
      return typeof raw.coverImage === 'string' ? dataUrlToBlob(raw.coverImage) : null;
    } catch {
      return null;
    }
  }
  get bookTocFlat(): Array<{ label: string; href: string }> {
    // label here is the disambiguated displayLabel (see flattenTocWithDisambiguation) —
    // this flat list feeds book-export chapter titles/filenames, which must
    // distinguish same-labeled chapters that repeat across parts.
    return flattenTocWithDisambiguation(this.tocItems).map((e) => ({ label: e.displayLabel, href: e.href }));
  }
  /** A file inside the book, for the exports — through foliate's EPUB loader, else as a Kindle record (`kindle-resources`). */
  async loadBookBlob(href: string): Promise<Blob> {
    if (this.bookResources) return this.bookResources.loadBlob(href);
    const blob = await kindleResource((this.foliateView as { book?: KindleBook } | null)?.book, href);
    if (!blob) throw new Error(`No file ${href} in this book`);
    return blob;
  }

  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source);
    if (source === 'more-options') {
      /**
       * ── One group per feature, and nothing grouped by shape ────────────────
       *
       * Five groups: Orbis's own data file, then **Library**, **Listening**, **Annotations** and **Conversions**
       * — the same subjects, in a recognisable order, that a reader finds in settings. The rule is worth stating
       * because the tempting arrangements break it: grouping items because they all open something, or because two
       * of them both open a per-book settings dialog. Both are descriptions of what a row LOOKS like, and a reader
       * cannot navigate by that.
       *
       * Show reading data stands alone on purpose. It opens the `.orbis` file — Orbis's storage for this book —
       * which is not a feature and belongs to none of the four below it.
       *
       * **The icons follow the same rule: the mark names the SYSTEM, the label names the format.** Both annotation
       * exports wear the Annotations mark and both conversions wear the Conversions mark, because within each pair
       * the only difference is Markdown or PDF — which the label already says, and no icon can. It also means a row
       * here wears the badge of the dialog it opens.
       *
       * Approximating with whatever Lucide has would fight the grouping: `file-text` on three unrelated rows,
       * `refresh-cw` on a command that syncs nothing, and `download` on something writing INTO the vault. These
       * render on mobile only, so none of it is visible on a desktop.
       */
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle(t('pane_menu.show_reading_data'))
          .setIcon('book-open')
          .onClick(() => {
            if (this.file) void openBookDataFile(this.app, this.file);
          })
      );
      // The catalog entry for the book being read, when the library is on. Placed before the notes items because it
      // is about the BOOK rather than about what has been written on it.
      //
      // **The item says which of the two things it will do**, rather than offering one and reporting failure: the
      // lookup happens while the menu is built, so a book with a note offers to open it and a book without offers
      // to write one. That costs a pass over the vault's frontmatter per menu open, which is the price of an item
      // that never disappoints.
      const bookFile = this.file;
      if (this.plugin.settings.libraryEnabled && bookFile) {
        // The separator is INSIDE the conditional, with the three rows it heads. All three are the Library and all
        // three vanish together when it is off; a rule outside would survive them and sit against the next one.
        menu.addSeparator();
        // Timed: a pass over every note's properties, on every open of this menu.
        const started = performance.now();
        const note = titleNoteFor(this.app, bookFile.path);
        this.addDebugEntry(`⋯ menu: title note lookup in ${Math.round(performance.now() - started)} ms`, 'library');
        menu.addItem((item) =>
          item
            .setTitle(note ? t('library.open_title_note') : t('library.catalog_this_book'))
            .setIcon('library')
            .onClick(() => {
              if (note) void openNoteBeside(this.app, note);
              else void catalogThisBook(this.app, this.plugin, bookFile, () => this.plugin.refreshLibraryViews());
            })
        );
        // The two edits you make while reading, beside the note they are written on — which is where they belong:
        // a rule between them and the title note would have separated a value from the file it is written into.
        //
        // Offered whether or not there is a note yet — answering writes one — which is why they do not branch on
        // `note` the way the item above does. Same two dialogs the palette opens; a reader with the menu already
        // in their hand should not have to go looking for a command.
        //
        // Both end in an ellipsis, which is this menu's convention for an item that opens a dialog rather than
        // acting — hence their own strings rather than the command names, which carry no ellipsis.
        menu.addItem((item) =>
          item
            .setTitle(t('pane_menu.set_reading_status'))
            // **`flag`, not `book-open-check`.** The tick on an open book is about three pixels at menu size and
            // vanishes, leaving `book-open` — which is the icon on Show reading data two rows above, so the group
            // appeared to carry the same book icon twice and neither read. Every row here is already about a book
            // by context; what the icon has to say is WHICH fact, and a flag is a state. `LibraryView`'s row menu
            // wears the same one for the same action — change both or neither.
            .setIcon('flag')
            .onClick(() => openStatusDialog(this.app, this.plugin, bookFile))
        );
        menu.addItem((item) =>
          item
            .setTitle(t('pane_menu.rate_book'))
            .setIcon('star')
            .onClick(() => openRatingDialog(this.app, this.plugin, bookFile))
        );
      }
      /**
       * ── Listening ─────────────────────────────────────────────────────────
       *
       * **Mid-menu, not last.** The bottom, under everything else, is where a feature goes when it is an
       * extra — and listening is not an extra here, it is one of the two ways to consume a book. One row
       * is a whole group because Listening has exactly one per-book surface, not because the row is unimportant.
       */
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle(t('pane_menu.manage_recordings'))
          .setIcon('headphones')
          .onClick(() => this.openRecordingsModal())
      );
      /**
       * ── What you added to the book ────────────────────────────────────────
       *
       * Everything here is **Annotations**, and the group below is **Conversions** — the two settings categories,
       * in the order settings lists them. `Reading record settings…` is in here rather than off on its own: it
       * configures an annotation feature for this book, and grouping it by how often it is used would set a second
       * principle against the one the other four groups follow.
       *
       * **Nothing here is grayed except the PDF.** A notes style outlines
       * the WHOLE BOOK by default (`chapterScope: 'all'`), so generating on a book nobody has marked produces a
       * structured file with a place to write under every chapter — the point being that you can use it without
       * using Orbis's annotations at all. A disable rule on the first two would withhold a capability that is on
       * out of the box. The digest has no such mode: with nothing marked it would write an empty file.
       */
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle(t('pane_menu.open_notes'))
          .setIcon('file-text')
          .onClick(() => void this.openOrCreateNotesFile())
      );
      menu.addItem((item) =>
        item
          .setTitle(t('pane_menu.generate_notes'))
          .setIcon(ANNOTATIONS_ICON_ID)
          .onClick(() => void this.generateCompanionNotes())
      );
      menu.addItem((item) =>
        item
          .setTitle(t('pane_menu.save_annotations_as_pdf'))
          .setIcon(ANNOTATIONS_ICON_ID)
          // Marks and notes only — the digest has no bookmarks in it. See `hasMarksToExport`.
          .setDisabled(!this.hasMarksToExport())
          .onClick(() => this.saveAnnotationsAsPdf())
      );
      menu.addItem((item) =>
        item
          .setTitle(t('pane_menu.reading_record'))
          .setIcon('database')
          .onClick(() => this.openBookRecordsSettings())
      );
      // ── The book itself, in another format ─────────────────────────────────
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle(t('pane_menu.save_as_markdown'))
          .setIcon(CONVERSION_ICON_ID)
          .onClick(() => {
            if (!this.currentFile || !this.bookSections.length) {
              new Notice(t('notices.no_book_loaded'));
              return;
            }
            new BookExportModal(this.app, this).open();
          })
      );
      // No disable rule on either of these: a PDF or a Markdown copy of the book is a readable artifact before
      // anyone has marked anything.
      menu.addItem((item) =>
        item
          .setTitle(t('pane_menu.save_as_pdf'))
          .setIcon(CONVERSION_ICON_ID)
          .onClick(() => this.saveBookAsPdf())
      );
    }
  }

  getViewType() {
    return VIEW_TYPE_ORBIS;
  }
  getDisplayText() {
    return this.file ? this.file.name : 'Orbis Reader';
  }
  canAcceptExtension(ext: string) {
    return isBookExtension(ext);
  }
  getIcon() {
    return 'book-open';
  }

  // Called by the plugin when toolbar/export plugin settings change.
  // All reading display settings are vault-scoped (App#saveLocalStorage) and propagated on the workspace event
  // bus (`orbis:settings-change`), NOT via `StorageEvent`, because `App#saveLocalStorage` does not raise one.
  // See docs/design/display-styles.md.
  applyPluginSettings(): void {
    this.settings = loadSettings(this.app, this.plugin.settings);
    // A theme edited or deleted in the Theme manager moves the colors of a book already using it.
    if (!this.refreshTheme('settings saved')) this.applyHostBg();
    this.syncDisplayMenu?.();
    this.stats.applyProgressModeFromSettings();
    this.applyToolbarVisibility();
    this.tts.updateActionIcons();
    this.tts.applyHighlightMode(); // repaint now if the reading-highlight setting changed
    this.tts.refreshSkipLabels(); // jump sizes are settings-driven
    this.tts.resetEngine(); // pick up a voice change from Settings on the next playback
    // And say so now. `resetEngine` is about the NEXT playback; the chip is a statement about this moment, and
    // choosing a voice in Settings with the player open would leave it naming the old one until a chapter turns over.
    this.tts.refreshVoiceChip();
  }

  private applyToolbarVisibility(): void {
    // Which buttons this device shows is a fact about this screen, so it comes from beside the device rather than
    // from the settings that travel — see `device-settings.ts`.
    const d = deviceSettings();
    const show = (el: HTMLElement | null, visible: boolean) => {
      el?.toggle(visible);
    };
    show(this.tocBtn, d.showTocButton);
    show(this.search.toolbarButton, d.showSearchButton);
    show(this.bookmarkCtl.button, d.showBookmarkButton);
    show(this.displayStyleBtn, d.showDisplayStyleButton);
    show(this.annotationsBtn, d.showAnnotationsButton);
    show(this.annot.noteIcons.toggleButton, d.showNoteIconsButton);
    // Not display:none: the toolbar is a 3-column CSS grid (left / progress
    // label / right) and locLabel is the middle grid item. display:none would
    // drop it out of grid auto-placement entirely, so toolbarRight — the next
    // item in DOM order — would slide into the now-vacant middle `auto`
    // column instead of staying in its own right-hand `1fr` column, visually
    // pulling the right-side icons toward center. visibility:hidden keeps it
    // occupying its grid column (still non-interactive, still invisible).
    this.stats.setChipHidden(!d.showProgressIndicator);
    show(this.focusBtn, d.showFocusButton);
    show(this.tts.toolbarButton, d.showTtsButton);
    // A floating chip over the page rather than a toolbar button, but this is the pass that runs when
    // settings change, so its visibility belongs here with the rest.
    show(this.debugLog.chip, d.showDebugButton);
    // Faded out rather than removed: a hidden arrow still turns the page from where it was. See `.orbis-nav-hidden`.
    this.prevBtn?.toggleClass('orbis-nav-hidden', !d.showPageArrows);
    this.nextBtn?.toggleClass('orbis-nav-hidden', !d.showPageArrows);
  }

  toggleDisplayMenu() {
    const wrapper = this.displayMenuWrapper;
    const isOpen = wrapper?.style.display !== 'none';
    if (isOpen) {
      this.closeDisplayMenu();
    } else {
      this.openDisplayMenu();
    }
  }

  openDisplayMenu() {
    this.closePanel();
    if (this.displayMenuBar) this.barRegistry.closeOthers(this.displayMenuBar);

    const wrapper = this.displayMenuWrapper;
    // Shown and hidden only — their display when shown is styles.css's (`.orbis-display-menu-wrapper`, …).
    wrapper?.show();
    this.level2Toolbar?.show();
    this.displayStyleBtn?.classList.add('is-active');
    this.displayStyleBtn?.setAttribute('aria-expanded', 'true');
    this.barRegistry.changed();

    // Create overlay if not exists
    if (!this.displayMenuOverlay) {
      const parentEl = this.hostEl || this.contentEl;
      this.displayMenuOverlay = parentEl.createDiv({ cls: 'orbis-menu-overlay' });
      // A backdrop is not a control — Escape closes the menu, and a focusable dimmed area would be a tab stop
      // between the reader and the menu they opened.
      // keyboard-audit-disable-next-line -- a backdrop, dismissed by Escape
      this.displayMenuOverlay.addEventListener('click', () => this.closeDisplayMenu());
    }
    this.displayMenuOverlay.show();

    // Auto-open first tab if none active
    this.activeDisplayTab = null;
    Object.values(this.displayTabBtns).forEach((btn) => btn.classList.remove('is-active'));
    this.setLevel3Visible(false);

    // Sync menu values with current settings
    if (this.syncDisplayMenu) this.syncDisplayMenu();

    Object.values(this.displayTabBtns)[0]?.focus();
  }

  closeDisplayMenu() {
    const wrapper = this.displayMenuWrapper;
    // Focus is moved only to rescue it: from inside the menu it would be lost as the menu hides, so it goes to the book
    // (Escape's rule too). Closed by selecting another toolbar button, the keyboard stays on that button.
    const stranded = !!wrapper && wrapper.style.display !== 'none' && wrapper.contains(wrapper.doc.activeElement);
    wrapper?.hide();
    this.level2Toolbar?.hide();
    this.setLevel3Visible(false);
    if (stranded) this.focusReader();
    this.displayStyleBtn?.classList.remove('is-active');
    this.displayStyleBtn?.setAttribute('aria-expanded', 'false');
    this.barRegistry.changed();
    this.displayMenuOverlay?.hide();
    // Remove active state from all level 2 buttons
    Object.values(this.displayTabBtns).forEach((btn) => btn.classList.remove('is-active'));
  }

  /** Show/hide the level-3 drawer row, and tell the level-2 bar about it: while a drawer is open
   *  the two bars are stacked, so level 2's bottom border would read as a divider between them —
   *  the drawer's own bottom border is the one that should close off the stack. */
  private setLevel3Visible(visible: boolean): void {
    this.level3Container?.setCssStyles({ display: visible ? 'flex' : 'none' });
    this.level2Toolbar?.classList.toggle('orbis-l3-open', visible);
  }

  activateDisplayTab(tabId: string) {
    this.activeDisplayTab = tabId;
    this.setLevel3Visible(true);

    // Toggle button active states
    Object.entries(this.displayTabBtns).forEach(([id, btn]) => {
      const isActive = id === tabId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // Toggle drawer visibility
    Object.entries(this.displayDrawers).forEach(([id, drawer]) => {
      drawer.style.display = id === tabId ? 'flex' : 'none';
    });
  }

  saveSetting(key: string, value: unknown) {
    (this.settings as unknown as Record<string, unknown>)[key] = value;
    const keyMap: Record<string, string> = {
      fontSize: 'orbis-font-size',
      brightness: 'orbis-brightness',
      margins: 'orbis-margins',
      lineHeight: 'orbis-line-height',
      textAlign: STORAGE_KEY_TEXT_ALIGN,
      hyphenation: STORAGE_KEY_HYPHENATION,
      theme: 'orbis-theme',
      fontFamily: 'orbis-font-family',
      flow: 'orbis-flow',
      columns: 'orbis-columns',
    };
    const storageKey = keyMap[key];
    if (storageKey) {
      this.app.saveLocalStorage(storageKey, String(value));
      this.app.workspace.trigger('orbis:settings-change', storageKey, String(value));
    }
  }

  bindRealTimeSlider(
    inputEl: HTMLInputElement,
    sliderEl: HTMLInputElement,
    min: number,
    max: number,
    fallback: number,
    onChange: (val: number) => void,
    sliderToInput: (v: number) => number = (v) => v,
    inputToSlider: (v: number) => number = (v) => v
  ) {
    bindRealTimeSliderInput(inputEl, sliderEl, min, max, fallback, onChange, sliderToInput, inputToSlider);
    // Prevent the background from going black when the keyboard opens on mobile
    // (same fix as the search inputs). Covers all Display Style number inputs —
    // Brightness, Font size, Margins, Line spacing — since they all bind through here.
    inputEl.addEventListener('focus', () => {
      if (Platform.isMobile) this.lockMobileHeights();
    });
    inputEl.addEventListener('blur', () => {
      if (Platform.isMobile) {
        window.setTimeout(() => this.unlockMobileHeights(), 100);
      }
    });
  }

  /**
   * The colors this book is painted with. Read from this reader's own window, never `activeDocument`'s — see
   * `readTheme` — and from inside the leaf, where an Obsidian theme's note colors apply.
   */
  private paintColors(): ThemeColors {
    return themeColors(this.settings.theme, this.plugin.settings, this.contentEl);
  }

  /**
   * Repaint when the theme's colors have changed, and only then. Returns whether it did.
   *
   * **Compared, not assumed**: Obsidian reports a style change for a theme switch, a light/dark flip, a snippet or a
   * theme's own options, and a book on a fixed theme is unmoved by all of them. Repainting re-injects every section,
   * which the audio player has to pause for — see `theme-watch.ts` — so an unneeded one is not free.
   */
  private refreshTheme(reason: string): boolean {
    if (JSON.stringify(this.paintColors()) === this.paintedTheme) return false;
    this.addDebugEntry(`${reason} — theme colors changed, repainting`, 'display');
    this.applyHostBg();
    this.reinjectAllDocs();
    return true;
  }

  private resolveFont(): string {
    const { fontFamily } = this.settings;
    if (!fontFamily || fontFamily === 'default') return '';
    if (fontFamily === 'obsidian') {
      return getComputedStyle(this.contentEl.doc.body).getPropertyValue('--font-text').trim() || '';
    }
    return fontFamily;
  }

  private applyDocStyles(doc: Document): void {
    const colors = this.paintColors();
    let css = buildBookCss(this.settings, colors, this.resolveFont(), Platform.isIosApp);
    if (Platform.isMobile) {
      // iOS WkWebView only fires 'click' on non-interactive text when the element (or
      // an ancestor) has cursor:pointer. Foliate's show-annotation mechanism relies on
      // a click listener inside the book iframe; without this, tapping highlights and
      // notes does nothing. -webkit-tap-highlight-color suppresses the blue tap flash.
      css += '\nhtml, body { cursor: pointer; -webkit-tap-highlight-color: rgba(0,0,0,0); }';
    }
    this.addDebugEntry(
      `applyDocStyles theme:${this.settings.theme} size:${this.settings.fontSize} bg:${colors.bg} fg:${colors.fg} head:${!!doc.head} css:${css.slice(0, 50)}`,
      'display'
    );
    const existing = doc.getElementById('orbis-styles');
    if (existing) existing.remove();
    // A raw <style> in the section doc is intended: createEl('style') is banned by no-forbidden-elements, and
    // the section doc has no createEl (see bookElement).
    const style = bookElement(doc, 'style');
    style.id = 'orbis-styles';
    style.textContent = css;
    doc.head?.appendChild(style);
    paintPageColor(doc, colors.bg);
    repairChapterContrast(doc, colors, (msg) => this.addDebugEntry(msg, 'display')); // after the theme's styles
  }

  public applyHostBg(): void {
    if (!this.hostEl) return;
    const colors = this.paintColors();
    this.paintedTheme = JSON.stringify(colors);
    const { bg, fg } = colors;
    const bgDimmed = dimColor(bg, this.settings.brightness);
    this.addDebugEntry(`applyHostBg bg:${bg} brightness:${this.settings.brightness}`, 'display');
    this.filterWrapperEl?.setCssProps({
      '--orbis-host-bg': bg,
      '--orbis-host-fg': fg,
      '--orbis-host-filter': this.settings.brightness !== 100 ? `brightness(${this.settings.brightness}%)` : 'none',
    });
    this.filterWrapperEl?.addClass('orbis-host-bg');
    // Also set on contentEl (a shared ancestor of filterWrapperEl and the
    // focus-mode overlay) so the back/forward buttons and focus-exit button —
    // which live outside filterWrapperEl — can read the same colors via
    // inheritance. --orbis-host-filter is included too: in normal mode the
    // back/forward buttons live inside filterWrapperEl and get the brightness
    // filter applied to its whole subtree as a side effect, but the exit
    // button (and, in focus mode, the re-parented back/forward buttons — see
    // enterFocusMode()) sit outside that subtree and need the filter applied
    // directly to match. --orbis-host-bg-dimmed is the brightness-adjusted
    // color pre-computed as a value rather than a filter, specifically for
    // .orbis-focus-mode's own background (the strips above/below the host) —
    // see dimColor()'s doc comment for why a filter there would
    // double-dim content that already has the filter applied elsewhere.
    this.contentEl.setCssProps({
      '--orbis-host-bg': bg,
      '--orbis-host-fg': fg,
      '--orbis-host-bg-dimmed': bgDimmed,
      '--orbis-host-filter': this.settings.brightness !== 100 ? `brightness(${this.settings.brightness}%)` : 'none',
    });
    // Paint the foliate-view element and its internal renderer so gaps between
    // sections in scrolled mode (and any shadow-DOM chrome) use the theme color.
    // foliateView / renderer are native custom elements, not Obsidian HTMLElements.
    if (this.foliateView) this.foliateView.style.background = bg;
    const r = this.foliateView?.renderer;
    if (r) r.style.background = bg;
    // Last, once the new colors are in place. Annotations are SVG drawn with explicit colors, so they do
    // not follow CSS the way the page does — and a mark set to INK resolved the page's text color at the
    // moment it was drawn. Without this it keeps the color of whatever theme was active then, so an ink
    // line would stay white after switching from dark to sepia. Foliate's own `redraw()` cannot help: it
    // re-invokes the same closure, with the same color.
    this.annot?.redrawAnnotations();
  }

  private applyRenderer(): void {
    const r = this.foliateView?.renderer;
    if (!r) {
      this.addDebugEntry('applyRenderer — renderer not ready yet', 'display');
      return;
    }
    // A flow/columns/margins change re-lays-out (flow re-renders outright), which can kill the
    // audio player's live sentence Range — let it capture a CFI anchor + pause first, like the
    // reinjectAllDocs path does for font/theme/spacing. No-op unless audio is active.
    this.tts.onBeforeReRender();
    this.addDebugEntry(
      `applyRenderer flow:${this.settings.flow} columns:${this.settings.columns} margins:${this.settings.margins}`,
      'display'
    );
    r.setAttribute('flow', this.settings.flow);
    // Toggle scrolled mode works inside focus mode, and only a scrolled page needs the room — see the function.
    setReaderBottomSpace(r, this.focusMode);
    // One column while scrolling: the preference survives scroll mode, and foliate sizes a scrolled column by
    // `max-inline-size`, so a kept "two" would narrow scrolled text to 720px.
    const columns = this.settings.flow === 'scrolled' ? 1 : this.settings.columns;
    r.setAttribute('max-column-count', String(columns));
    // Single-column: override foliate's 720px cap so text fills the full pane width.
    // Double-column: keep the 720px default so foliate can fit two side-by-side columns.
    // foliate computes: divisor = min(maxColumnCount, ceil(containerWidth / maxInlineSize))
    // With 9999px the divisor is always 1, making double-column impossible.
    r.setAttribute('max-inline-size', columns === 1 ? '9999px' : '720px');
    // Map margins slider to renderer gap (outer whitespace around the reading area).
    // Horizontal only, deliberately: the vertical equivalent — foliate's `margin` — is not a setting and is not
    // set here. Normal mode keeps foliate's own 48px, which is what holds an open search bar off the first line;
    // focus mode narrows it on the way in and clears it on the way out. See `FOCUS_PAGE_MARGIN`.
    r.setAttribute('gap', `${this.settings.margins}%`);
  }

  // Map a TOC item href (may include #anchor) to a spine section index — Kindle `kindle:pos:` and MOBI `filepos:`
  // links through foliate's own lookup. See `LocationIndex.hrefToSectionIndex`.
  hrefToSectionIndex(href: string | undefined): number {
    return this.locIndex.hrefToSectionIndex(href);
  }
  /** The id a contents entry points at inside its section, or null — see `LocationIndex.anchorOf`. */
  anchorOf(href: string): string | null {
    return this.locIndex.anchorOf(href);
  }
  chapterStartLoc(href: string): number | null {
    return this.locIndex.chapterStartLoc(href);
  }
  sectionStartLoc(sIdx: number): number | null {
    return this.locIndex.sectionStartLoc(sIdx);
  }

  // Current TOC item href from the most recent relocate event (foliate tells us which chapter we're in).
  tocItemHref = '';

  private toggleColumns(): void {
    const next = String(this.settings.columns === 1 ? 2 : 1);
    this.app.saveLocalStorage(STORAGE_KEY_COLUMNS, next);
    this.app.workspace.trigger('orbis:settings-change', STORAGE_KEY_COLUMNS, next);
  }

  // Entering/exiting focus mode resizes and repositions the host, which forces
  // Foliate to reflow its columns. On mobile, installMobileSelectionSnapback()
  // pins containerPosition to a pre-reflow pixel value for as long as a Range
  // selection is active, which after the reflow no longer lines up with a page
  // boundary — leaving the view stuck mid-page. Clearing the selection (and any
  // annotation UI anchored to it) before the reflow avoids the stale pin.
  clearActiveSelectionAndAnnotationUI(): void {
    this.annot.hideAnnotationBar();
    const renderer = this.foliateView?.renderer as unknown as { getContents?: () => Array<{ doc: Document }> };
    for (const c of renderer?.getContents?.() ?? []) {
      if (c.doc?.getSelection()?.type === 'Range') c.doc.defaultView?.getSelection()?.removeAllRanges();
    }
  }

  toggleFocusMode(): void {
    // While the listening controls are locked, keep the reader in focus mode (pocket mode).
    if (this.focusMode && this.tts.isControlLockActive()) return;
    if (this.displayMenuWrapper?.style.display !== 'none') {
      this.closeDisplayMenu();
    }
    this.focus.toggle();
  }

  /** FocusModeHost: whether the listening controls are locked (blocks exiting focus mode). */
  listeningControlsLocked(): boolean {
    return this.tts.isControlLockActive();
  }

  // Hide or show the device's status bar via Capacitor. Focus mode's alone — a dialog leaves
  // the screen as it finds it.
  setNativeNavBar(visible: boolean): void {
    if (!Platform.isMobileApp) return;
    try {
      type CapacitorWindow = {
        Capacitor?: {
          Plugins?: {
            StatusBar?: {
              show?: () => void;
              hide?: () => void;
              setOverlaysWebView?: (opts: { overlay: boolean }) => void;
            };
          };
        };
      };
      const w = window as unknown as CapacitorWindow;
      const sb = w.Capacitor?.Plugins?.StatusBar;
      if (visible) {
        sb?.show?.();
        sb?.setOverlaysWebView?.({ overlay: false });
      } else {
        sb?.hide?.();
        sb?.setOverlaysWebView?.({ overlay: true });
      }
    } catch {
      /* not available on all platforms */
    }
  }

  async copyLocationLink(cfi: string | undefined | null, errorMsg: string): Promise<void> {
    const file = this.currentFile;
    if (!cfi || !file) {
      new Notice(errorMsg);
      return;
    }
    const link = `[${file.basename}](obsidian://orbis-nav?file=${encodeURIComponent(file.path)}&cfi=${encodeURIComponent(cfi)})`;
    await navigator.clipboard.writeText(link);
    new Notice(t('notices.link_copied_to_clipboard'));
  }

  copyLink(): void {
    void this.copyLocationLink(this.lastCfi, t('notices.current_location_unknown'));
  }

  // Both of these go through `saveSetting` — the METHOD, which announces the change — rather than writing
  // localStorage alone. A silent write would move the book while every other surface stayed where it was: nothing
  // would be told.
  private adjustFontSize(delta: number): void {
    // Applied by the announcement `saveSetting` makes, which this view hears too — see `installReactiveSettingsSync`.
    this.saveSetting('fontSize', Math.max(80, Math.min(300, this.settings.fontSize + delta)));
    this.addDebugEntry(`adjustFontSize → ${this.settings.fontSize} loadedDocs:${this.loadedDocs.size}`, 'display');
  }

  public adjustBrightness(value: number): void {
    this.saveSetting('brightness', value); // applied by its announcement, as `adjustFontSize`'s is
  }

  // Navigate to the start of a specific spine section by index (0-based).
  // CFI format for spine item N: epubcfi(/6/${(N+1)*2}!/4)
  // Even-numbered CFI steps correspond to element nodes; /6 is the spine in the OPF.
  private goToSection(index: number): void {
    if (index < 0 || index >= this.bookSections.length) return;
    const cfi = `epubcfi(/6/${(index + 1) * 2}!/4)`;
    this.addDebugEntry(`goToSection ${index} → CFI:${cfi}`, 'nav');
    void this.foliateView?.goTo(cfi);
  }

  /**
   * A page forward or back, whatever the flow.
   *
   * foliate's own `next`/`prev` already mean the right thing in both: a column in paginated mode, a screenful in
   * scrolled, rolling into the adjacent section at either end. The toolbar arrows deliberately jump a whole FILE in
   * scrolled mode instead — the stretch foliate loads and scrolls through — because an on-screen arrow you tap is a
   * coarser instrument than a key you hold. Which is why these are their own methods rather than a call into the
   * button handlers.
   */
  turnPage(direction: 1 | -1): void {
    void (direction === 1 ? this.foliateView?.next() : this.foliateView?.prev());
  }

  /**
   * A chapter forward or back, for the commands: the book's chapter list (`chapterStep`), the one the exports,
   * listening and the chapter counter use, landing where the Contents tab does. Not the next file, which may hold
   * several chapters. A book of one chapter steps its files instead, so the commands still move through it.
   */
  turnChapter(direction: 1 | -1): void {
    const parts = this.chapterParts();
    if (hasOneChapter(parts)) return direction === 1 ? this.nextSection() : this.prevSection();
    // From the page's END, not its top — see `chapterStepFromPage`.
    const to = chapterStepFromPage(parts, this.currentSectionIndex, this.tocItemHref || null, direction);
    this.addDebugEntry(`turnChapter ${direction} from ${this.tocItemHref || 'section start'} to part ${to}`, 'nav');
    if (to === null) return;
    this.markUserNavigation();
    const href = partStartHref(parts[to]);
    if (href) void this.foliateView?.goTo(href);
    else this.goToSection(parts[to].sectionIndex);
  }

  /**
   * Run whatever the reader bound to this keystroke.
   *
   * **Obsidian ignores a synthetic keyboard event**, so re-dispatching the book's keystrokes onto the outer
   * document does nothing the moment focus is inside the text. The plugin therefore
   * reads the bindings and calls the command itself.
   *
   * `hotkeyManager` and `commands` are internal APIs, used the same way `app.setting` already is. The matching is
   * in `hotkey-match.ts`, pure and tested; this is only the part that has to reach into the app.
   */
  runBoundCommand(e: KeyboardEvent): boolean {
    const app = this.app as unknown as {
      hotkeyManager?: { defaultKeys?: Record<string, Hotkey[]>; customKeys?: Record<string, Hotkey[]> };
      commands?: { executeCommandById(id: string): boolean };
    };
    const manager = app.hotkeyManager;
    const commands = app.commands;
    if (!manager || !commands) return false;
    const id = commandFor(e, manager.defaultKeys ?? {}, manager.customKeys ?? {}, Platform.isMacOS);
    if (!id) return false;
    this.addDebugEntry(`key ${e.key} → ${id}`, 'nav');
    return commands.executeCommandById(id);
  }

  /** Apply the Nth mark to the note being written, or to the selection. False when there is nothing to mark. */
  applyQuickMark(index: number): boolean {
    return this.annot.applyQuickMark(index);
  }

  /**
   * Step to the next annotation, and show it as a click would.
   *
   * The same shape as the sentence cursor, and the same reason for it: **what is on screen is the state.** The one
   * being shown — the note view's, or the bar's in edit mode — is where we are, so the next press moves on from
   * it; with nothing shown it starts from where the reader is in the book. Closing the popup or clicking elsewhere
   * resets that without anything needing to be told.
   *
   * Ordered by `cfiSortKey`, the ordering the saved panel and the reading records already use, so "next" means the
   * same thing wherever you ask.
   */
  async selectAnnotation(kind: 'any' | 'highlight' | 'note', back = false): Promise<void> {
    const list = this.annot.annotationsInOrder(kind);
    if (!list.length) {
      new Notice(t('notices.no_annotations_to_step'));
      return;
    }
    const shown = this.annot.shownAnnotationCfi();
    const from = shown ? cfiSortKey(shown) : cfiSortKey(this.lastCfi ?? '');
    /**
     * Strictly past the one on screen, or at-or-past where the reader is parked when none is.
     *
     * Backwards is the mirror and not a different rule: the last one before here rather than the first one after,
     * which is why it reads the list from the end. Both wrap, so a book is a ring in either direction — reaching
     * the last mark and pressing again should not simply stop, with nothing on screen to say why.
     */
    const ordered = back ? [...list].reverse() : list;
    const past = (key: string): boolean => (back ? key < from : key > from);
    const atOrPast = (key: string): boolean => (back ? key <= from : key >= from);
    const next =
      ordered.find((a) => (shown ? past(cfiSortKey(a.cfiRange)) : atOrPast(cfiSortKey(a.cfiRange)))) ?? ordered[0];

    const view = this.foliateView;
    if (!view) return;
    await view.goTo(next.cfiRange);
    // Resolved after the move, because that is when its section is the one on screen and its document exists.
    const target = view.resolveNavigation(next.cfiRange);
    const doc = target ? this.docForSection(target.index) : null;
    const range = doc && target ? target.anchor(doc) : null;
    if (!doc || !range || !('startContainer' in range)) {
      this.addDebugEntry(`annotation ${next.cfiRange.slice(0, 30)} would not resolve`, 'annot');
      return;
    }
    await this.annot.showAnnotation(next.cfiRange, range);
    this.addDebugEntry(
      `annotation ${next.isNote ? 'note' : 'mark'} ${next.cfiRange.slice(0, 34)} (${list.length} in book)`,
      'annot'
    );
  }

  /** Delete whichever annotation is on screen — a note asks first, if the setting says to. */
  deleteAnnotation(): boolean {
    return this.annot.deleteShownAnnotation();
  }

  /**
   * The **live** document for a spine index.
   *
   * A section re-rendered — a display change, a revisit — is a new `Document`, and the old entry stays in
   * `docToSection` because nothing removes it. Taking the first match would therefore hand back a dead document:
   * its ranges resolve, so nothing throws, and everything downstream quietly acts on a page nobody is looking at —
   * an annotation navigated to with no bar on screen, because the picker looked up for that document is not the one
   * displaying it.
   *
   * A detached document has no `defaultView`, which is the cheap test; the newest entry wins among the rest.
   */
  private docForSection(index: number): Document | undefined {
    let live: Document | undefined;
    for (const [doc, at] of this.docToSection) if (at === index && doc.defaultView) live = doc;
    return live;
  }

  /** No mark at all, on the note being written. False when no note editor is open. */
  clearQuickMark(): boolean {
    return this.annot.clearQuickMark();
  }

  /**
   * Drop the selection, and with it the annotation bar it raised.
   *
   * Reports whether there was anything to drop, so a page key can spend its first press on letting go — as an
   * arrow does in any editor — and turn the page on the next.
   */
  clearSelection(): boolean {
    this.sentenceSel.forget();
    const sel = this.currentSectionDoc()?.defaultView?.getSelection();
    const had = !!sel?.rangeCount && !sel.isCollapsed;
    sel?.removeAllRanges();
    return had;
  }

  /** Where the last Shift+arrow left the caret, so a selection shrunk to nothing can be told from a fresh click. */

  /**
   * Is this keystroke the reader's, made in this view, and not typing?
   *
   * A document-wide listener has to answer all three: another pane may be active, and a search box or a note
   * editor inside this one must keep every key it is given.
   */
  private readerHasKeyboard(e: KeyboardEvent): boolean {
    if (this.app.workspace.getActiveViewOfType(OrbisReaderView) !== this) return false;
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? '')) return false;
    /**
     * **Any dialog of ours takes the keyboard**, tested from the DOM rather than from where the event came.
     *
     * The target-based check is not enough on its own: pages stop turning but the arrow still reaches
     * `turnPageFor`, which spends its first press clearing the selection — so the highlight would vanish from under
     * an open note editor. `.orbis-popup-close-btn` is the same marker `busyForPrompt` uses: every `createOrbisPopup`
     * dialog has exactly one, and Obsidian's `.modal-container` covers its own.
     *
     * The annotation bar is deliberately not one of these — it has no close button, being a floating toolbar for
     * the selection rather than a dialog, and refining that selection with Shift+arrow while it is up is the point.
     */
    if (activeDocument.querySelector('.orbis-popup-close-btn, .modal-container')) return false;
    // Nor while a picture is open: a key then is for the picture — Escape closes it — not for the page behind.
    if (this.imageViewer.isOpen) return false;
    /**
     * **Not while one of our dialogs has the keyboard.**
     *
     * Tabbing off the textarea in the note editor lands on a button, which is not a field — so otherwise the
     * reading keys would fire and the pages turn behind the open dialog. The annotation bar is deliberately not
     * one of these: it is a floating toolbar for the selection, and refining that selection with Shift+arrow is
     * exactly what a reader wants while it is up.
     */
    /**
     * **The content panel takes the keyboard too.**
     *
     * It is not a `createOrbisPopup` and has no close button, so neither test above catches it — and without this,
     * Tab inside the Saved panel would run `seedLink` and be `preventDefault`ed, which looks exactly like a keyboard
     * that does nothing: focus never reaches a row, so Enter has nothing to activate. Space would turn the page
     * instead of opening the highlight under the cursor.
     *
     * Listed by class rather than by "is it a dialog", because this panel is a third shape: not a popup, not a modal,
     * but a place a reader is in until they leave it.
     */
    /**
     * **The annotation bar's controls take the keyboard; the bar itself still does not** — see `barOwnsKey`, which
     * holds the whole split and is where the reasoning for each half of it is written.
     */
    if (barOwnsKey(target, e.key, e.shiftKey)) return false;
    // The toolbars keep their keys — their arrows move between controls (`toolbar-keys.ts`), never the page.
    const bars =
      '.orbis-toolbar, .orbis-display-menu-wrapper, .orbis-secondary-bar, .orbis-tts-bar, .orbis-tts-player, .orbis-focus-topbar';
    return !target?.closest?.(`.orbis-popup, .orbis-toc-panel, ${bars}`);
  }

  /**
   * The section document the reader is looking at.
   *
   * **Chosen by what is on screen, not by `currentSectionIndex`.** Foliate keeps the neighboring sections loaded,
   * so several documents are live at once and the index can name one the reader is not looking at — selecting in
   * that one produces a real selection nobody can see, which is precisely as confusing as it sounds. The frame's
   * rect says which document is actually in the reading area; the index is the fallback for when it cannot.
   */
  currentSectionDoc(): Document | undefined {
    const host = this.hostEl;
    if (host) {
      const h = host.getBoundingClientRect();
      for (const doc of this.loadedDocs) {
        const frame = doc.defaultView?.frameElement as HTMLElement | null;
        if (!frame) continue;
        const f = frame.getBoundingClientRect();
        if (f.right > h.left && f.left < h.right && f.bottom > h.top && f.top < h.bottom) return doc;
      }
    }
    return this.docForSection(this.currentSectionIndex);
  }

  // A chapter step is the reader's own move, as choosing a chapter in the contents is — so listening follows it there
  // (`markUserNavigation`). A page turn is not: the audio drives the page, and page-follow brings it back.
  private prevSection(): void {
    this.addDebugEntry(`prevSection currentIndex:${this.currentSectionIndex} total:${this.bookSections.length}`, 'nav');
    this.stepSection(this.currentSectionIndex - 1);
  }

  private nextSection(): void {
    this.addDebugEntry(`nextSection currentIndex:${this.currentSectionIndex} total:${this.bookSections.length}`, 'nav');
    this.stepSection(this.currentSectionIndex + 1);
  }

  /** Only a step that goes somewhere is a move: a mark left set at either end would turn the next page-follow into one. */
  private stepSection(index: number): void {
    if (index < 0 || index >= this.bookSections.length) return;
    this.markUserNavigation();
    this.goToSection(index);
  }

  // Public: called by the URI handler. Returns false if the view isn't ready yet.
  navigateToCfi(cfi: string): boolean {
    if (!this.foliateView) return false;
    void this.foliateView.goTo(cfi);
    return true;
  }

  navigateToHref(href: string): boolean {
    if (!this.foliateView) return false;
    void this.foliateView.goTo(href);
    return true;
  }

  goToFraction(frac: number): boolean {
    if (!this.foliateView) return false;
    void this.foliateView.goToFraction(frac);
    return true;
  }

  // Public: navigate to a specific book page. Returns false if the view isn't ready.
  navigateToLoc(loc: number): boolean {
    return this.locIndex.navigateToLoc(loc);
  }

  toggleBookmark(): void {
    this.bookmarkCtl.toggle();
  }

  // Shared by chapterForSection/hrefForSection — label text repeats across
  // parts in many books ("PART I > CHAPTER I", "PART II > CHAPTER I"), so
  // callers that need a unique chapter identity should use the returned
  // .href, not .label.
  private findTocMatchForSection(sIdx: number): { label: string; href: string } | null {
    const flatToc: { label: string; href: string }[] = [];
    const flatten = (items: TocItem[]) => {
      for (const item of items) {
        flatToc.push(item);
        if (item.subitems?.length) flatten(item.subitems);
      }
    };
    flatten(this.tocItems);
    if (!flatToc.length) return null;
    const sectionHref = String(this.bookSections[sIdx]?.id ?? '');
    const basename = (h: string) => h.split('#')[0].split('/').pop() ?? h;
    const sh = basename(sectionHref);
    const match = flatToc.find((t) => {
      const th = basename(t.href);
      return th && sh && (th === sh || t.href === sectionHref);
    });
    if (match) return match;
    // Proportional fallback for books where TOC hrefs don't match section hrefs
    const fi = Math.min(
      flatToc.length - 1,
      Math.floor((sIdx * flatToc.length) / Math.max(1, this.bookSections.length))
    );
    return flatToc[fi] ?? null;
  }

  chapterForSection(sIdx: number): string {
    return this.findTocMatchForSection(sIdx)?.label ?? '';
  }

  /** Unique-identity counterpart to chapterForSection — see findTocMatchForSection. */
  hrefForSection(sIdx: number): string {
    return this.findTocMatchForSection(sIdx)?.href ?? '';
  }

  /**
   * The contents href that genuinely belongs to this section, or '' — never the proportional guess.
   *
   * `hrefForSection` answers "which contents entry covers this position", and always answers. That is the wrong
   * question for anything keyed on chapter IDENTITY: sections that guessed their way to the same entry come back
   * with the same href, so grouping by it folds unrelated chapters together under one heading. Here '' means
   * "no identity known", which a caller can turn into a per-section key instead of a shared one.
   */
  exactHrefForSection(sIdx: number): string {
    return this.tocEntriesInSection(sIdx)[0]?.href ?? '';
  }

  /** sectionIndex → disambiguated display label, built by resolving each flattened-TOC entry's href
   *  to its spine section through the authoritative href→section map (the same mapping the book
   *  export and reading-stats use). This is reliable where a basename match or a proportional guess
   *  drifts — books whose section ids don't share the TOC hrefs' basenames fall through to a guess
   *  that smears Parts across the wrong chapters.
   *  When several entries resolve to one spine section (e.g. an Epilogue whose "EPILOGUE" divider,
   *  "EPILOGUE – I" and "EPILOGUE – II" all live in one file), the first in document order wins —
   *  the section is one generated MP3 that *begins* there, so it reads "EPILOGUE", not the last
   *  sub-chapter's "EPILOGUE – II". */
  contentsEntriesInSection(sIdx: number): { href: string; label: string; fragment: string }[] {
    return flattenTocWithDisambiguation(this.tocItems)
      .filter((e) => this.locIndex.hrefToSectionIndex(e.href) === sIdx)
      .map((e) => ({ href: e.href, label: e.displayLabel, fragment: this.locIndex.anchorOf(e.href) ?? '' }));
  }

  private sectionLabelMap(): Map<number, string> {
    const map = new Map<number, string>();
    for (const e of flattenTocWithDisambiguation(this.tocItems)) {
      const si = this.locIndex.hrefToSectionIndex(e.href);
      if (si >= 0 && !map.has(si)) map.set(si, e.displayLabel); // first entry (section start) wins
    }
    return map;
  }

  /**
   * The name of one section, in descending order of how much the answer is actually *known*.
   *
   * 1. **The contents entry that resolves to this section**, disambiguated ("PART II – CHAPTER III" where
   *    labels repeat). Evidence, via the authoritative href→section map — see `sectionLabelMap`.
   * 2. **The section's own first heading**, measured off its parsed document — see `sectionHeadings`.
   * 3. **A contents entry whose href shares this section's basename.** Inference, but a narrow one.
   * 4. **Its number.**
   *
   * **Step 2 is what makes this correct on MOBI, AZW3 and FB2.** Their section ids are numbers, not paths, so step 1
   * cannot resolve and step 3 cannot match — and a proportional guess in their place would hand each section the
   * contents entry sitting at its own index, naming a section after a subtitle *inside* another section or listing
   * one short front-matter heading twice. Names that are wrong and confident are
   * worse than names that are plainly numbers, because nothing about them looks broken.
   *
   * The proportional guess still lives in `chapterForSection`, which answers a different question (which contents
   * entry covers this position) and is where stored annotation labels come from.
   */
  chapterDisplayForSection(sIdx: number): string {
    return chapterName(
      {
        tocLabel: this.sectionLabelMap().get(sIdx),
        heading: this.locIndex.sectionHeadings[sIdx],
        basenameLabel: this.basenameLabelForSection(sIdx),
      },
      sIdx,
      (n) => t('book_export_modal.section_n', { n: String(n) })
    );
  }

  /**
   * Whether a section has a name of its own, rather than just its number.
   *
   * The same three sources `chapterDisplayForSection` consults, in the same order — a contents entry, the section's
   * own first heading, or a contents entry sharing its file name. When none of them answers, the label it returns
   * is only the section's position, which is what makes untitled front matter worth naming for what it is.
   */
  private sectionHasOwnName(sIdx: number): boolean {
    return !!(
      this.sectionLabelMap().get(sIdx) ||
      this.locIndex.sectionHeadings[sIdx] ||
      this.basenameLabelForSection(sIdx)
    );
  }

  /** A contents entry whose href shares this section's file basename — the last inference before numbering.
   *  The LAST such entry wins: where a Part and its first chapter share a file, the chapter is the deeper name. */
  private basenameLabelForSection(sIdx: number): string {
    return this.tocEntriesInSection(sIdx).at(-1)?.displayLabel ?? '';
  }

  /** Disambiguated display label for a stored annotation chapter href — prefer an exact TOC-href
   *  match, else the deepest same-file entry (so a Part's first chapter reads "PART II – CHAPTER I",
   *  matching chapterDisplayForSection). '' when the href isn't found. */
  chapterDisplayForHref(href: string): string {
    if (!href || !this.tocItems.length) return '';
    const flat = flattenTocWithDisambiguation(this.tocItems);
    const exact = flat.find((tocEntry) => tocEntry.href === href);
    if (exact) return exact.displayLabel;
    const basename = (h: string) => h.split('#')[0].split('/').pop() ?? h;
    const bh = basename(href);
    const matches = flat.filter((tocEntry) => basename(tocEntry.href) === bh);
    return matches.length ? matches[matches.length - 1].displayLabel : '';
  }

  openSearchBar(): void {
    this.search.openBar();
  }

  /** Scan this book's highlights + notes for bad data (malformed ranges / duplicates) and open the
   *  cleanup preview; a repair or a removal happens only if the user confirms. */
  async openAnnotationCleanup(): Promise<void> {
    const problems = scanAnnotationData({ highlights: this.annot.highlights, notes: this.annot.notes });
    const repairs = await findRepairs(problems, {
      sections: this.bookSections as unknown as RawSection[],
      sectionOf: (cfi) => this.foliateView?.resolveNavigation(cfi)?.index,
      cfiForRange: (range, index) => this.annot.cfiForRange(range, index),
      debug: (msg) => this.addDebugEntry(msg, 'annot'),
    });
    new AnnotationCleanupModal(this.app, problems, {
      repairable: new Set(repairs.keys()),
      onRepair: (ids) => {
        const moved = this.annot.moveAnnotations(new Map([...repairs].filter(([id]) => ids.has(id))));
        new Notice(repairedMessage(moved.highlights, moved.notes));
      },
      onRemove: (ids) => {
        const removed = this.annot.removeAnnotationsByIds(ids);
        new Notice(removedMessage(removed.highlights, removed.notes));
      },
    }).open();
  }

  /** Toggle the read-aloud (TTS) control bar. Invoked by the command palette. */
  toggleTts(): void {
    this.tts.toggle();
  }

  /** Enter listen mode (open the bar, show the full player, start playing) or exit it. */
  toggleListenMode(): void {
    this.tts.toggleListenMode();
  }

  /** Enter listen mode without toggling it off — see `TtsController.startListenMode`. False means "not yet". */
  startListening(): boolean {
    return this.tts.startListenMode();
  }

  /**
   * Put the reader into the state a caller asked for when it opened this book. False means "not yet".
   *
   * **Every branch has to be idempotent**, because this is called twice by design: once from `onLoadFile` for a
   * book that had to be opened, and once from the retry loop that covers a book already open and a reader still
   * coming up. `toggleFocusMode` is the one that would not survive that — arriving twice would leave focus mode
   * off — so it is asked whether it is already there rather than told to toggle.
   *
   * The readiness signal is the listen bar's existence, which is what `startListenMode` uses: it is
   * built with the rest of the reader chrome, so a reader that has one has the search bar and the focus
   * machinery too.
   */
  applyOpenIntent(intent: BookOpenIntent): boolean {
    if (!this.tts.barReady()) return false;
    /**
     * **No bar under the full-screen player**, whatever the setting says — it covers the page a bar would sit on,
     * so the answer is moot rather than overridden. It is skipped rather than opened-and-covered for a reason
     * beyond tidiness: `openBar` runs the first-voice gate, and so does `startListenMode` below it, which would
     * put the download prompt up twice on a device with no voice.
     *
     * Otherwise the bar goes first, so focus mode reserves the right height for it in one pass.
     */
    if (intent.mode !== 'listen') {
      if (intent.bar === 'search') this.search.openBar();
      else if (intent.bar === 'listen') this.tts.openBar();
    }
    if (intent.mode === 'listen') return this.tts.startListenMode();
    if (intent.mode === 'focus' && !this.focusMode) this.focus.toggle();
    return true;
  }

  /** Pause listening playback if it's playing (e.g. before a voice preview in Settings). */
  pauseListening(): void {
    this.tts.pauseIfPlaying();
  }

  /** The spine-section index the Listen player currently has a sentence in (playing or paused), or
   *  null when nothing is loaded — used to guard regenerating/deleting the chapter being listened
   *  to (whose MP3 + manifest the live player may re-read). */
  listeningSectionIndex(): number | null {
    return this.tts.activeSentence()?.sectionIndex ?? null;
  }

  /** Whether the "Lock listening controls" command applies right now: while the listening bar or either full-screen
   *  player is open — and while locked, when it unlocks. */
  canLockListeningControls(): boolean {
    return this.tts.isBarOpen() || this.tts.isControlLockActive();
  }

  /** The command: lock, or unlock when locked — see `PocketMode`. */
  toggleListeningControlLock(): void {
    this.tts.togglePocketMode();
  }

  /**
   * Open the recording generation / management modal for the current book.
   *
   * `returnTo` is how a caller asks to be returned to — see the modal's constructor. Every other route here (pane
   * menu, palette, a run finishing) passes nothing, because closing the dialog from those means going back to the
   * book.
   */
  openRecordingsModal(returnTo?: () => void): void {
    if (!this.currentFile) {
      new Notice(t('notices.recording_no_book'));
      return;
    }
    new RecordingsModal(this, returnTo).open();
  }

  /** Live-voice sources (Orbis + System) for the "Add live voice" picker in a mix — same providers
   *  as the Listen live-voice picker. */
  liveVoiceMethods(): RecordingMethod[] {
    const adapter = this.app.vault.adapter;
    const dir = `${this.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
    const rate = () => this.ttsRate();
    const methods: RecordingMethod[] = [
      {
        method: 'orbis',
        label: t('listening_page.orbis_voices'),
        provider: createPiperVoiceProvider(adapter, dir, rate),
      },
    ];
    if (WebSpeechEngine.isSupported())
      methods.push({
        method: 'system',
        label: t('listening_page.system_voices'),
        provider: createSystemVoiceProvider(rate),
      });
    return methods;
  }

  /** Point the given chapters of a mix at a live voice. */
  async assignMixLive(mixKey: string, live: MixLiveVoice, indices: number[]): Promise<void> {
    const base = this.recordedAudioDir();
    if (!base) return;
    await setMixLive(this.app, base, mixKey, live, indices);
  }

  /** Create a new (empty) mix edition; returns its key. */
  async createMixEdition(name: string): Promise<string | null> {
    const base = this.recordedAudioDir();
    if (!base) return null;
    return (await createMix(this.app, base, name, Date.now())).key;
  }

  /** Point the given chapters of a mix at a source edition (only chapters the source has). */
  async assignMixChapters(mixKey: string, sourceKey: string, indices: number[]): Promise<void> {
    const base = this.recordedAudioDir();
    if (!base) return;
    await setMixSource(this.app, base, mixKey, sourceKey, indices);
  }

  /**
   * Speak a live-voice chapter's opening sentence in the voice its mix assigns it — the management
   * modal's ▶ for a live row, which has no file to preview. Only the first sentence: the point is to
   * audition the *voice*, and a live chapter has no rendered audio to scrub through.
   *
   * Rejects when the section has no readable text or no voice resolves, so the caller can say so.
   *
   * **`chapterIndex` is a PART**, which is what the modal's rows are, and it is not a section index: the two
   * agree only on books where a section holds one chapter. Passed straight to `openingSentenceOf`, auditioning the
   * voice for "CHAPTER III 2 of 4" — part 10 — would read the opening of spine section 10, a different part of the
   * book entirely. The part names its own section; that is what gets opened.
   *
   * A divided chapter still auditions its SECTION's opening sentence rather than the part's own, which for a
   * later slice is not where that slice begins. Left as it is on purpose: the point of this button is to hear
   * the voice, and finding a slice's first sentence means measuring the part boundaries just to speak one line.
   */
  async previewLiveChapter(
    chapterIndex: number,
    mixKey: string | undefined,
    onDone: () => void
  ): Promise<PreviewHandle> {
    const sectionIndex = this.chapterParts()[chapterIndex]?.sectionIndex ?? chapterIndex;
    const text = await this.openingSentenceOf(sectionIndex);
    if (!text) throw new Error(`section ${sectionIndex} has no readable text`);
    // Whether or not it is on this device: a voice that is not here is asked for first — see `speakOnce`.
    const pinned = await mixLiveVoiceFor(this, chapterIndex, mixKey);
    const voice = pinned ?? this.resolvedLiveVoice();
    // A voice the mix names is asked for by its download alone; choosing another would change the mix, not answer.
    const askForVoice = pinned
      ? orbisVoiceAsker(this.app, `${this.app.vault.configDir}/plugins/orbis-reader/piper-cache`)
      : undefined;
    return speakOnce(
      { ...this.speakOnceDeps(true), voice: () => voice, ...(askForVoice ? { askForVoice } : {}) },
      text,
      onDone
    );
  }

  /** First reading unit of a spine section, as plain text. Loads the section document on its own
   *  (the modal is open over the reader, which is parked on some other section). */
  private async openingSentenceOf(sectionIndex: number): Promise<string> {
    const section = (this.bookSections as unknown as RawSection[])[sectionIndex];
    if (!section?.createDocument) return '';
    const doc = await section.createDocument();
    try {
      return getReadingUnits(doc)[0]?.text ?? '';
    } finally {
      section.unload?.();
    }
  }

  /** TtsHost: load the active edition's chapter for playback (mix-aware), by its ordinal in `bookChapters`. */
  async loadActiveEditionChapter(chapterIndex: number): Promise<RecordedChapter | null> {
    const base = this.recordedAudioDir();
    if (!base) return null;
    const key = (await listEditions(this.app, base)).active ?? undefined;
    return key ? loadEditionChapter(this.app, base, key, chapterIndex) : null;
  }

  /** Repaint the Listen bar / player voice chip after something it displays changed name — see
   *  `TtsController.refreshVoiceChip`, which is deliberately not a playback reload. */
  refreshVoiceChip(): void {
    this.tts.refreshVoiceChip();
  }

  /** Open the Listen settings popup (playback source + edition). Invoked from the bar/player gear. */
  openListenSettings(): void {
    void new VoiceRecordingsModal(this).open();
  }
  /** The listening speed slider, for Voice and source's Speed block. */
  buildListeningSpeed(container: HTMLElement): void {
    this.tts.buildSpeedControl(container);
  }

  /** The chapter the Voice & source modal should describe (the one being read, else the one the current page
   *  is in) — delegates to the controller, which tracks the reading position. */
  describedChapterIndex(): number {
    return this.tts.describedChapterIndex();
  }

  /** Whether this device has a voice it can speak with right now — see `TtsController.canSpeakNow`. The chip and
   *  the Voice & source panel both ask, because a panel that names a voice the chip says is missing is the same
   *  fault one layer down. */
  canSpeakNow(): Promise<boolean> {
    return this.tts.canSpeakNow();
  }

  /**
   * The voice reading `sectionIndex`, where it came from, and why — the whole of what the chip and the popup say.
   *
   * **Four facts, and they are not derivable from each other**, which is why `VoiceInfo` carries four fields
   * rather than one string: which voice, whether it is a recorded track or a voice speaking now, which recording
   * or mix is selected for this book, and whether this chapter's voice actually came from that selection. The
   * first three are what a reader asked for; the fourth is what keeps the other three from lying on a book that
   * is only half recorded.
   */
  async currentVoiceInfo(sectionIndex: number): Promise<VoiceInfo> {
    const base = this.recordedAudioDir();
    const idx = base ? await listEditions(this.app, base) : null;
    const active = idx?.active ? (idx.editions.find((e) => e.key === idx.active) ?? null) : null;
    /**
     * The selection's name, for the chip's second half.
     *
     * Taken from the EDITION, not from the voice being spoken — on a coverage gap those are different, and the
     * selection is the one the reader chose. A recording nobody has renamed is named by its voice, so it hands
     * over that voice's short name and the caller drops it when it would just repeat the first half; a mix
     * without a name (which shouldn't exist, but the index is a file on disk) falls back to the word.
     */
    const source = active
      ? active.label ||
        (active.kind === 'mix'
          ? t('recordings_modal.tag_mix')
          : this.editionVoicePair(active.engine, active.voice).label)
      : undefined;
    /**
     * Live, and not from the selection: a gap, "None", a mix chapter left on default, or always-live.
     *
     * **The editions index is read even when always-live is on**, which is why that override does not return
     * first. That setting is precisely when a reader wonders why the recording they made is silent, and
     * `Amy · (Mix 1)` is the answer — the selection is still there, and still being overridden. The cost is one
     * small index read per chapter turn, not per sentence.
     */
    const live = (reason: string): VoiceInfo => this.deviceLiveInfo(reason, source, false);

    if (this.playbackSource() === 'live') return live(t('voice_and_source.reason_always_live'));
    if (!base || !idx || !idx.editions.length) return live(t('voice_and_source.reason_no_recordings'));
    // Editions exist but none is active → the "None" recording option: live voice for the book.
    if (!active) return live(t('voice_and_source.reason_none_selected'));

    if (active.kind === 'mix') {
      const mix = await readMix(this.app, base, active.key);
      const ptr = mix?.chapters.find((c) => c.index === sectionIndex);
      if (ptr?.sourceKey) {
        const sm = await readEditionManifest(this.app, base, ptr.sourceKey);
        const ch = sm?.chapters.find((c) => c.index === sectionIndex);
        if (ch)
          return this.recordedInfo(
            this.editionVoicePair(sm?.engine.kind ?? '', ch.voice ?? sm?.engine.voice ?? ''),
            source
          );
        return live(t('voice_and_source.reason_track_unrecorded')); // source lost the chapter
      }
      const pinned = ptr?.live;
      // A voice the mix names that this device does not have reads in the live voice instead — the same fallback,
      // and the same kind of reason line, as a recording's unrecorded track. See `mixLiveVoiceOnDevice`.
      if (pinned && pinned.kind !== 'default' && !(await mixVoiceOnDevice(this.app, pinned)))
        return live(t('voice_and_source.reason_mix_voice_not_here'));
      // **Live, but chosen.** The mix names this voice for this chapter, so it is no less "from the selection"
      // than a recorded track is — no parentheses, and the glyph says live because that is what it is.
      if (pinned && pinned.kind !== 'default')
        return this.selectedLiveInfo(
          pinned.kind === 'orbis' ? this.orbisVoicePair(pinned.voiceId) : this.systemVoicePair(pinned.voiceURI),
          source
        );
      return live(t('voice_and_source.reason_mix_default')); // default-live / unassigned
    }

    // Single-voice edition: recorded chapter → its voice; a gap (partial coverage) → the live voice.
    const sm = await readEditionManifest(this.app, base, active.key);
    if (sm?.chapters.some((c) => c.index === sectionIndex))
      return this.recordedInfo(this.editionVoicePair(active.engine, active.voice), source);
    return live(t('voice_and_source.reason_track_unrecorded'));
  }

  /** A recorded track from the selection: mic glyph, name unparenthesised. */
  private recordedInfo(pair: { label: string; fullLabel: string }, source?: string): VoiceInfo {
    return {
      ...pair,
      fromDeviceLive: false,
      reason: t('voice_and_source.reason_from_recording'),
      recorded: true,
      source: chipSourceName(pair.label, source),
      fromSelection: true,
    };
  }

  /** A live voice the selection names for this chapter: live glyph, but still unparenthesised. */
  private selectedLiveInfo(pair: { label: string; fullLabel: string }, source?: string): VoiceInfo {
    return {
      ...pair,
      fromDeviceLive: false,
      reason: t('voice_and_source.reason_from_recording'),
      recorded: false,
      source: chipSourceName(pair.label, source),
      fromSelection: true,
    };
  }

  private deviceLiveInfo(reason: string, source?: string, fromSelection = false): VoiceInfo {
    const pref = this.deviceVoicePref();
    const pair =
      pref?.source === 'system' && pref.systemVoiceURI
        ? this.systemVoicePair(pref.systemVoiceURI)
        : this.orbisVoicePair(
            (pref?.orbisSid ?? 0) > 0
              ? `${orbisVoiceOrDefault(pref?.orbisVoiceId).id}#${pref?.orbisSid}`
              : orbisVoiceOrDefault(pref?.orbisVoiceId).id
          );
    return {
      ...pair,
      fromDeviceLive: true,
      reason,
      recorded: false,
      source: chipSourceName(pair.label, source),
      fromSelection,
    };
  }

  // ── Voice labels: {label} = short name (bar chip), {fullLabel} = "Name — Locale, Gender" (modal
  //    + recording dropdown). Kept consistent across Orbis, server, and system voices. ──

  /** Short name = the part of a full "Name — …" label before the separator (drops locale/gender), so
   *  the chip shows just "Amy"/"Sky". A multi-speaker Piper voice KEEPS its "· N" speaker tag — the
   *  speaker matters — giving e.g. "Libritts · 6". */
  private shortVoiceName(full: string): string {
    return shortVoiceLabel(full);
  }

  private editionVoicePair(engine: string, voice: string): { label: string; fullLabel: string } {
    const fullLabel = describeEditionVoice(engine, voice);
    return { label: this.shortVoiceName(fullLabel), fullLabel };
  }

  private orbisVoicePair(voiceId: string): { label: string; fullLabel: string } {
    return this.editionVoicePair('piper-ondevice', voiceId);
  }

  private systemVoicePair(uri: string): { label: string; fullLabel: string } {
    const v = findSystemVoice(uri);
    if (!v) return { label: uri, fullLabel: uri };
    let lang = v.lang;
    try {
      lang = new Intl.DisplayNames([v.lang, 'en'], { type: 'language' }).of(v.lang) ?? v.lang;
    } catch {
      /* keep the raw tag */
    }
    return { label: v.name, fullLabel: `${v.name} — ${lang}` };
  }

  /** Open a popup with the shared live-voice picker (identical to Settings → Listening), bound to
   *  this device's voice preference. `onChanged` fires after each change (to refresh the chip/modal);
   *  changes also free the warm worker and re-seat any active listening. */
  openLiveVoicePicker(onChanged?: () => void, onClosed?: () => void): void {
    const { popupEl, close } = createOrbisPopup(this, {
      title: t('listening_page.voice'),
      dismissOnOutsideClick: false, // a download may be running inside — only Done or × closes it
      desktopWidth: 'min(460px, 92vw)',
      mobileMaxWidth: 480,
      mobileFillHeight: true, // the voice list needs room — use the full mobile height (no auto-focus)
      onClose: () => {
        unsub?.();
        picker.destroy();
        onClosed?.();
      },
    });
    const cacheDir = `${this.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
    const { host, methods } = liveVoicePicker({
      app: this.app,
      cacheDir,
      rate: () => this.ttsRate(),
      getPref: () => this.deviceVoicePref(),
      setPref: (patch) =>
        void this.setDeviceVoicePref(patch).then(() => {
          resetPiperWarm(); // free the old voice's worker
          void this.reloadListeningSource(); // re-seat an active live session onto the new voice
          onChanged?.();
        }),
      pauseAudio: () => this.pauseListening(),
    });
    const box = popupEl.createDiv({ cls: 'orbis-recording-voice' });
    const picker = new VoicePicker(box, host, methods);
    void picker.render();
    const unsub = onVoicesChanged(() => void picker.render()); // system voices load lazily
    /**
     * **Done, though there is nothing to confirm.**
     *
     * Choosing a voice applies at once, so the × in the chrome is a complete exit — but every other Orbis dialog ends
     * with a button row, and on a tall mobile panel the × is a long way from where the reader is working. A panel you
     * configure gets a Done; a preview (the link popup) or a launcher (look-up) does not.
     */
    const btnRow = actionRow(popupEl, { placement: 'footer' });
    btnRow.createEl('button', { cls: 'mod-cta', text: t('action.done') }).addEventListener('click', () => close());
  }

  playbackSource(): 'recorded' | 'live' {
    return deviceSetting('playbackSource');
  }

  /** Re-seat a live Listen session onto the current playback source (called after the Settings
   *  "always use the live voice" toggle changes it). No-op when not listening. */
  async reloadListeningSource(): Promise<void> {
    await this.tts.reloadForPlaybackChange();
  }

  /** The (engine, model, voice) identity of a recording for the current generation method. For the
   *  server method the voice is the passed/override server voice; for on-device Piper it's the
   *  configured Piper voice (+ speaker), and any server-voice override is ignored — the two methods
   *  have separate voice namespaces. Used for the edition key + manifest + timing samples. */
  /** Estimated seconds to generate these chapters with the current engine/model, from recorded
   *  generation-speed samples — or null when there's no data yet (first-ever run). */
  estimateGenerationSeconds(chapterIndices: number[]): number | null {
    const { engine, model } = genIdentity();
    const words = this.chapterWords();
    const totalWords = chapterIndices.reduce((sum, i) => sum + (words[i] ?? 0), 0);
    return estimateGenSeconds(engine, model, totalWords);
  }

  // ── TtsHost ────────────────────────────────────────────────────────────────
  currentPageRange(): Range | null {
    return this.lastPageRange;
  }

  /**
   * TtsHost: the sentence the book opened at, when it is on the page now showing — where a first ▶ after reopening
   * begins, rather than the top of that page.
   *
   * **Only while it is on this page.** Turning pages before pressing ▶ is choosing where to listen from, so a place
   * that is no longer on screen gives way to the page top, as it always did.
   */
  resumeRangeOnPage(doc: Document): Range | null {
    const cfi = this.openedAtCfi;
    const page = this.lastPageRange;
    if (!cfi || !page || page.startContainer.ownerDocument !== doc) return null;
    try {
      const target = this.foliateView?.resolveNavigation(cfi);
      if (!target || target.index !== this.currentSectionIndex) return null;
      const range = target.anchor(doc);
      if (!range || !('startContainer' in range)) return null;
      return page.comparePoint(range.startContainer, range.startOffset) === 0 ? range : null;
    } catch {
      return null;
    }
  }
  goToSectionStart(index: number): void {
    this.goToSection(index);
  }
  /** Base folder for this book's recording editions (each edition is a subfolder), or null when no
   *  book is open. Playback/status resolve the specific edition under this. */
  /**
   * `RecordingLibraryCtx` — the two members the reader has to supply that are not already public on it. Everything
   * else that interface wants (`app`, `recordedAudioDir`, the chapter shape, `ttsRate`, `bookSections`) the view
   * already had, which is why it can be passed as the context itself rather than wrapped in one.
   */
  /**
   * When this book's annotations become notes in the vault — see `RecordsController`.
   *
   * Public because it is also this view's `playerBusy`/`plugin` host: the controller asks the reader whether now
   * is a bad moment to interrupt, which is the one thing about records only the view can answer.
   */
  recordsCtl!: RecordsController;

  /** A recording run in flight — see `RecordingRun`. Opening the modal stays here; it takes this view. */
  readonly recordingRun = new RecordingRun(this, this);

  /** `RecordingRunHost.showRecordingsModal` — the run reopens it when one finishes with it closed. */
  showRecordingsModal(): void {
    this.openRecordingsModal();
  }

  /** What `RecordingsModal` asks about a run in flight. */
  isRecording(): boolean {
    return this.recordingRun.isRecording();
  }

  isRecordingPaused(): boolean {
    return this.recordingRun.isRecordingPaused();
  }

  currentRecordingProgress(): GenProgress | null {
    return this.recordingRun.currentRecordingProgress();
  }

  currentRecordingRunSections(): number[] | null {
    return this.recordingRun.currentRecordingRunSections();
  }

  currentRecordingRunEditionKey(): string | null {
    return this.recordingRun.currentRecordingRunEditionKey();
  }

  consumeRecordingLastRun(): FinishedRun | null {
    return this.recordingRun.consumeRecordingLastRun();
  }

  setRecordingProgressObserver(fn: ((p: GenProgress) => void) | null): void {
    this.recordingRun.setRecordingProgressObserver(fn);
  }

  startRecording(...args: Parameters<RecordingRun['startRecording']>): Promise<void> {
    return this.recordingRun.startRecording(...args);
  }

  cancelRecording(): void {
    this.recordingRun.cancelRecording();
  }

  pauseRecording(): void {
    this.recordingRun.pauseRecording();
  }

  resumeRecording(): void {
    this.recordingRun.resumeRecording();
  }

  /** Selecting by sentence and paragraph from the keyboard — see `SentenceSelection`. */
  private readonly sentenceSel = new SentenceSelection(this, this);

  /** The command palette's "extend selection by …" entries. */
  moveSentenceSelection(move: SentenceMove): void {
    this.sentenceSel.move(move);
  }

  /** `ReaderContext.extendSelection` — Shift+arrow inside the book. */
  extendSelection(key: string): boolean {
    return this.sentenceSel.extend(key);
  }

  /** Save as PDF — the dialog is `MarksPdfModal`; reading the book into what it needs is `MarksPdfSource`. */
  private openMarksPdf(scope: MarksPdfScope): Promise<void> {
    return new MarksPdfSource(this, this).open(scope);
  }

  /**
   * Whether this book has anything `Save annotations as PDF` could draw.
   *
   * **Highlights and notes, not bookmarks**: `marks-pdf.ts` groups the two and never reads `bookmarks`, so a book
   * carrying three bookmarks and nothing else would produce an empty digest.
   *
   * Synchronous, because a menu is built synchronously and `notesData()` is already in memory. That is the whole
   * reason this rule is affordable: no read of the vault, no await, on every open of the ⋯ menu.
   */
  hasMarksToExport(): boolean {
    return hasMarksToExport(this.notesData());
  }

  /** `RecordsHost.playerBusy` — the full player covers the view, and pocket mode blocks the controls. */
  playerBusy(): boolean {
    return this.tts.isFullPlayerShowing() || this.tts.isControlLockActive();
  }

  /** `ReaderContext.recordsChanged` — saved content moved; the controller decides whether to write. */
  recordsChanged(deleted?: readonly string[], kind?: keyof RecordKinds): void {
    this.recordsCtl.recordsChanged(deleted, kind);
  }

  /** Command-palette entry points, answered by the controller. */
  exportAnnotationRecords(opts?: { silent?: boolean }): Promise<void> {
    return this.recordsCtl.exportAnnotationRecords(opts);
  }

  cleanupAnnotationRecords(): Promise<void> {
    return this.recordsCtl.cleanupAnnotationRecords();
  }

  openBookRecordsSettings(): void {
    this.recordsCtl.openBookRecordsSettings();
  }

  reloadPlayback(): Promise<void> {
    return this.tts.reloadForPlaybackChange();
  }

  activeRunKey(): string | null {
    return this.recordingRun.activeRunKey();
  }

  /** `TtsHost.mixLiveVoiceOnDevice` — the interface's member, answered by the recording library. */
  mixLiveVoiceOnDevice(chapterIndex: number): Promise<{ voice: LiveVoiceOverride | null; unavailable?: string }> {
    // *Always use the live voice* means the device's own voice for every track — a mix's pinned voices included,
    // as its recordings are. Answered here, the one place playback and the voice check both ask.
    if (this.playbackSource() === 'live') return Promise.resolve({ voice: null });
    return mixLiveVoiceOnDevice(this, chapterIndex);
  }

  recordedAudioDir(): string | null {
    const file = this.currentFile;
    return file ? bookAudioFolderPath(file) : null;
  }
  ttsRate(): number {
    return deviceSetting('ttsRate');
  }
  persistTtsRate(rate: number): void {
    setDeviceSetting('ttsRate', rate);
    void this.plugin.saveSettings();
  }
  onEngineResolved(id: TtsEngineId): void {
    this.addDebugEntry(`tts engine resolved: ${id}`, 'display');
  }
  bookCover(): Promise<Blob | null> {
    return this.getCoverBlob();
  }
  bookTitle(): string {
    return this.bookMeta.title;
  }
  bookAuthor(): string {
    return this.bookMeta.author;
  }
  chapterLabel(sectionIndex: number): string {
    return this.chapterForSection(sectionIndex);
  }
  tocHrefForRange(range: Range, sectionIndex: number): string | null {
    try {
      return this.foliateView?.getProgressOf(sectionIndex, range)?.tocItem?.href ?? null;
    } catch {
      return null;
    }
  }
  tocNeighbourHref(fromHref: string, dir: 1 | -1): string | null {
    if (!this.tocItems.length) return null;
    return tocNeighbourHref(flattenTocWithDisambiguation(this.tocItems), fromHref, dir);
  }

  tocHrefs(): readonly string[] {
    return flattenTocWithDisambiguation(this.tocItems).map((t) => t.href);
  }

  goToTocHref(href: string): boolean {
    // The same two steps a contents-panel click makes: say it was the reader's doing, then go. The relocate that
    // follows is what carries the audio along — see `onUserNavigated`.
    this.markUserNavigation();
    return this.navigateToHref(href);
  }

  chapterDisplayLabel(sectionIndex: number, positionHref: string): string {
    if (positionHref && this.tocItems.length) {
      const flat = flattenTocWithDisambiguation(this.tocItems);
      const base = (h: string) => h.split('#')[0];
      const match = flat.find((t) => t.href === positionHref) ?? flat.find((t) => base(t.href) === base(positionHref));
      if (match) return match.displayLabel;
    }
    // No position href (read-ahead playback) or no match: the disambiguated section label.
    return this.exactChapterForSection(sectionIndex) || this.chapterForSection(sectionIndex);
  }
  sectionWords(): readonly number[] {
    return this.locIndex.sectionWordCounts;
  }

  /**
   * The book's chapter PARTS, as the player's ⏮/⏭ and the recording surface count them — one ordered list, and
   * one entry per MP3. See `book-chapters`; an entry is a part, and almost every chapter has exactly one.
   *
   * Built in three steps, and the order matters:
   * 1. `chapterParts` — the structural list, from the spine and the contents alone.
   * 2. `splitLeadIns` — a file's lead-in handed back to the chapter it continues, as that chapter's second part.
   * 3. `mergeStubs` — a contents entry holding only its own heading folded into the body below it. Runs LAST,
   *    because step 2 creates stubs that did not exist before it.
   *
   * **Steps 2 and 3 need the text measured**, which the location index does in the background on book open. Until
   * it lands only step 1 has run, so the list is the raw contents — one row per entry. The memo key carries that
   * readiness, so the list upgrades itself once rather than being stuck with the early answer.
   *
   * **Keyed on its inputs, not cleared on book change.** The inputs arrive asynchronously and at different moments
   * — `bookSections` when the book object lands, `tocItems` several steps later once the panel is built — so
   * anything that asks in between would cache an answer built from what had arrived so far and keep it. Clearing
   * the memo per book does not help: the stale answer is cached DURING the load, after the clear, and Record opens
   * on "No chapters" for a book that has them. A key over the input lengths
   * cannot go stale, because the thing that would make it stale is the thing that changes it.
   */
  /**
   * Whether a spine section is the chapter before it continuing, rather than a chapter of its own.
   *
   * **Asked here, once, by every list** — the recording list, Save as Markdown's dialog and extractor, and Save as
   * PDF — so a section the export folds into a chapter is never a separate track, or the other way round. The rule
   * is `continuationSections`; this supplies its inputs from what the location index measured. Before that
   * measurement lands, no section continues.
   */
  sectionContinues(sectionIndex: number): boolean {
    const headings = this.locIndex.sectionHeadings;
    const key = `${this.bookSections.length}:${this.tocItems.length}:${headings.length}`;
    if (this.continuationsCache?.key !== key) {
      // Listed means ANY contents entry lands in it, at any depth — a chapter nested under a part is still named.
      const listed = new Set<number>();
      for (const e of flattenTocWithDisambiguation(this.tocItems)) {
        const i = this.locIndex.hrefToSectionIndex(e.href);
        if (i >= 0) listed.add(i);
      }
      // Once, not per section: `sectionLabelMap` walks the whole contents each time it is asked.
      const labels = this.sectionLabelMap();
      const set = continuationSections({
        sectionCount: this.bookSections.length,
        listed: (i) => listed.has(i),
        heading: (i) => (headings.length ? (headings[i] ?? '') : undefined),
        listedName: (i) => labels.get(i),
        bookTitle: this.bookTitle(),
        chars: (i) => this.locIndex.sectionCharCounts[i] ?? 0,
        minChars: LABEL_CHARS,
      });
      this.continuationsCache = { key, set };
    }
    return this.continuationsCache.set.has(sectionIndex);
  }

  chapterParts(): readonly ChapterPart[] {
    const measured = this.chapterWordsReady();
    const key = `${this.bookSections.length}:${this.tocItems.length}:${measured ? 'm' : 'raw'}`;
    if (this.bookChaptersCache && this.bookChaptersKey === key) return this.bookChaptersCache;
    // Once, not twice: the flattened contents decide both the parts and whether the book's own title is used as a
    // fallback label, and the debug line below reports it.
    const flatToc = flattenTocWithDisambiguation(this.tocItems);
    /**
     * **A chapter is a TOP-LEVEL contents entry, covering everything under it** — see `topLevelChapters`, and the
     * note at the top of `book-chapters`. Passed instead of `flatToc` because a heading is not a track: a book
     * converted from a folder of notes would otherwise come to hundreds of MP3s of a few minutes each.
     *
     * `hrefs` carries the subtree, which is what keeps the finer contents entries usable — `partIndexAt` asks which
     * part COVERS an href, so a reader under a subheading is still named and placed correctly.
     */
    const branchToc = topLevelChapters(this.tocItems).map((b) => ({
      href: b.href,
      displayLabel: b.displayLabel,
      hrefs: b.hrefs,
    }));
    const src: ChapterSource = {
      sectionCount: this.bookSections.length,
      toc: branchToc,
      sectionIndexForHref: (href) => this.locIndex.hrefToSectionIndex(href),
      anchorForHref: (href) => this.locIndex.anchorOf(href),
      sectionLabel: (i) => this.chapterDisplayForSection(i),
      sectionHasOwnName: (i) => this.sectionHasOwnName(i),
      frontMatterLabel: t('recordings_modal.front_matter'),
      partLabel: (base, part, of) =>
        t('recordings_modal.part_of', { label: base, part: String(part), total: String(of) }),
      /**
       * Only when the book's contents name nothing usable. A book with real contents plus one unreferenced
       * three-hour section should not have that section claiming the book's title — "Section 7 1 of 6" is the
       * honest answer there.
       *
       * **Asked of the FLAT contents, deliberately, although the chapters come from the top level.** "Names nothing
       * usable" means the whole contents page holds one entry or none — a book with a single top-level entry and
       * fifty headings beneath it has plenty of structure, and reading `branchToc.length <= 1` would declare it
       * structureless and slice the entire book by length under one title.
       */
      bookLabel: flatToc.length <= 1 ? this.bookTitle() : undefined,
      // Only once the headings are measured, which is what the rule reads — see `sectionContinues`.
      continues: measured ? (i) => this.sectionContinues(i) : undefined,
    };
    const offsetOf = (href: string): number | undefined => this.locIndex.anchorCharOffsets.get(href);
    let parts = chapterParts(src);
    if (measured) {
      parts = splitLeadIns(parts, src, offsetOf);
      // The merge asks whether a part is a LABEL — too short to be a chapter — not whether it holds any text at
      // all, which is the Record list's question. A Day heading has five words and must still fold into its body.
      const isLabel = partIsLabelOnly(parts, this.locIndex.sectionCharCounts, offsetOf);
      parts = mergeStubs(parts, (i) => !(isLabel[i] ?? false), src, joinChapterLabels);
      // Untitled front matter, named once the text is known so an empty title page takes no number in the run.
      const frontWords = partWordCounts(
        parts,
        this.locIndex.sectionCharCounts,
        this.locIndex.sectionWordCounts,
        offsetOf
      );
      parts = groupFrontMatter(parts, src, (i) => (frontWords[i] ?? 0) > 0);
      // Last, because merging a label into a body lengthens it — a chapter's total is not known until then.
      const minutes = partWordCounts(
        parts,
        this.locIndex.sectionCharCounts,
        this.locIndex.sectionWordCounts,
        offsetOf
      ).map((w) => w / NARRATION_WPM);
      parts = splitLongParts(parts, src, (i) => minutes[i] ?? 0);
    }
    this.bookChaptersCache = parts;
    this.bookChaptersKey = key;
    /**
     * Every rebuild, with the inputs that decide the SHAPE of the list — because a wrong shape is only visible
     * downstream, as a label. The book's own title with a slice count is what a chapter gets when the contents
     * name nothing (`bookLabel`), so a list built while `tocItems` is still empty makes the whole book one chapter
     * and slices it by length. The key alone cannot show that; `toc` and `bookLabel` can.
     */
    this.addDebugEntry(
      `chapterParts rebuilt: ${parts.length} parts · key=${key} (sections:toc:measured)` +
        ` · toc=${branchToc.length} top-level of ${flatToc.length} entries` +
        ` · bookLabel=${src.bookLabel ? `"${src.bookLabel}"` : 'none'} · first="${parts[0]?.label ?? ''}"`,
      'index'
    );
    return parts;
  }

  /**
   * Whether chapter lengths are known yet.
   *
   * **Because "no text" and "not measured yet" are the same zero.** `chapterWords` reads the location index, which
   * builds in the background on book open — so before it lands every chapter measures zero, and a caller treating
   * zero as "nothing to record" would hide the whole book and announce it as pages of images. Asked explicitly so
   * that mistake cannot be made by accident.
   */
  chapterWordsReady(): boolean {
    return this.locIndex.isReady && this.locIndex.sectionWordCounts.length > 0;
  }

  /** Words per PART — the length shown beside each row in Record and Edit mix, and what the generation-speed
   *  estimates are measured against. Zero for every part until `chapterWordsReady()`. Not memoised: the
   *  location index fills in behind it, and a stale zero would read as "no text here". */
  chapterWords(): readonly number[] {
    return partWordCounts(this.chapterParts(), this.locIndex.sectionCharCounts, this.locIndex.sectionWordCounts, (h) =>
      this.locIndex.anchorCharOffsets.get(h)
    );
  }
  totalWords(): number {
    return this.locIndex.totalBookWords;
  }
  highlightRange(range: Range, sectionIndex: number): void {
    this.annot.highlightRange(range, sectionIndex);
  }
  addNoteForRange(range: Range, sectionIndex: number, onClose?: () => void): void {
    this.annot.addNoteForRange(range, sectionIndex, onClose);
  }
  toggleAudioBookmark(range: Range, sectionIndex: number): boolean {
    const anchorCfi = this.rangeToCfi(range, sectionIndex);
    const loc = this.getLocForCfi(anchorCfi) ?? undefined;
    return this.bookmarkCtl.toggleAudioBookmark(
      anchorCfi,
      this.chapterForSection(sectionIndex),
      this.hrefForSection(sectionIndex) || undefined,
      loc,
      range.toString()
    );
  }
  audioBookmarkTarget(): AudioBookmarkTarget | null {
    const s = this.tts.activeSentence();
    if (!s) return null;
    const anchorCfi = this.rangeToCfi(s.range, s.sectionIndex);
    return {
      anchorCfi,
      text: s.range.toString(),
      chapter: this.chapterForSection(s.sectionIndex),
      chapterHref: this.hrefForSection(s.sectionIndex) || undefined,
      loc: this.getLocForCfi(anchorCfi) ?? undefined,
    };
  }
  roleMarkColors(): { audio: string | null; note: string | null } {
    return this.annot.roleMarkColors();
  }

  /** Open the annotation-preset manager on This book — from the mark bar's list and the listening view. */
  openMarkRoles(): void {
    openMarkRoles(this, this.plugin);
  }

  openAnnotationPresets(onClosed?: () => void): void {
    openAnnotationPresets(this.app, this.plugin, 'book', onClosed);
  }
  /** Redraw any mark bar showing in this book — the plugin calls it when the Marks dialog closes. */
  repaintMarkBars(): void {
    this.annot.repaintMarkBars();
  }
  audioHighlightGranularity(): 'sentence' | 'paragraph' {
    return this.plugin.settings.audioHighlightGranularity;
  }
  audioNoteGranularity(): 'sentence' | 'paragraph' {
    return this.plugin.settings.audioNoteGranularity;
  }
  readAheadMaxChars(): number {
    return readAheadMaxChars(deviceSetting('readAhead'));
  }
  readingHighlight(): ReadingHighlightMode {
    return asReadingHighlightMode(deviceSetting('readingHighlight'));
  }
  /** Compiled pronunciation respellings. Owned and cached by the plugin, whose saveSettings()
   *  invalidates it — so any write path (settings tab, lookup editor, a future one) takes effect on
   *  the next sentence without needing to refresh anything itself. */
  pronouncer(): Pronouncer | null {
    return this.plugin.pronouncer();
  }
  skipBackSeconds(): number {
    return asSkipSeconds(deviceSetting('skipBackSeconds'));
  }
  skipForwardSeconds(): number {
    return asSkipSeconds(deviceSetting('skipForwardSeconds'));
  }
  keepScreenAwake(): boolean {
    return deviceSetting('keepScreenAwakeWhileListening');
  }
  /** Pocket-mode blackout: override the reader color vars to the dark theme's #000/#fff (no
   *  re-render, so audio isn't paused and nothing is persisted), and restore the real theme
   *  colors — recomputed from the user's setting via applyHostBg — when turned off. The book
   *  page is hidden behind the full-screen player while locked, so only these host vars matter. */
  setListeningBlackout(on: boolean): void {
    if (on) {
      const black = {
        '--orbis-host-bg': '#000000',
        '--orbis-host-fg': '#ffffff',
        '--orbis-host-bg-dimmed': '#000000',
        '--orbis-host-filter': 'none',
      };
      this.filterWrapperEl?.setCssProps(black);
      this.contentEl.setCssProps(black);
    } else {
      this.applyHostBg();
    }
  }
  setFullPlayerActive(active: boolean): void {
    // Toggle the class on historyNavEl itself, not an ancestor: focus mode (which the full player
    // uses) re-parents it out of filterWrapperEl, so an ancestor-scoped selector wouldn't match.
    // display:none !important beats the inline display set by updateHistoryNavBtns; removing the
    // class restores the buttons' own can-go-back/forward visibility.
    this.historyNavEl?.toggleClass('orbis-force-hidden', active);
    // Body class hides the focus-mode progress chip (bottom, outside the player) whenever the full
    // player is up — not just when pocket-locked. This reader's own window's body, which a popout has its own of.
    this.contentEl.doc.body.toggleClass('orbis-listen-fullplayer', active);
  }
  deviceVoicePref(): VoicePref | undefined {
    return this.plugin.getDeviceVoicePref();
  }
  setDeviceVoicePref(patch: Partial<Omit<VoicePref, 'deviceId'>>): Promise<void> {
    return this.plugin.setDeviceVoicePref(patch);
  }
  resolvedOrbisVoice(): { path: string; sid: number } {
    const pref = this.plugin.getDeviceVoicePref();
    const voice = orbisVoiceOrDefault(pref?.orbisVoiceId);
    return { path: voice.path, sid: voice.multiSpeaker ? (pref?.orbisSid ?? 0) : 0 };
  }
  resolvedSystemVoiceURI(): string | undefined {
    return this.plugin.getDeviceVoicePref()?.systemVoiceURI;
  }
  /** Deps for a one-shot utterance. `applyDictionary` off speaks the text verbatim, which is what
   *  auditioning a respelling needs. */
  private speakOnceDeps(applyDictionary: boolean): SpeakOnceDeps {
    return {
      adapter: this.app.vault.adapter,
      cacheDir: `${this.app.vault.configDir}/plugins/orbis-reader/piper-cache`,
      rate: () => this.ttsRate(),
      voice: () => this.resolvedLiveVoice(),
      pronouncer: applyDictionary ? () => this.pronouncer() : undefined,
      askForVoice: () => askForLiveVoice(this.app, this.plugin), // the live voice: the full prompt
    };
  }
  /**
   * The device's live voice for one-shot speech (look-up's Speak, an unpinned chapter preview). Ignores a mix
   * chapter's override: speaking a selection is a device action. **The shared rule, not a copy:** a copy here kept
   * "no preference means a system voice" after the rule changed, so Speak used a Windows voice while Listening said
   * Amy. See `live-voice-default.test.ts`.
   */
  resolvedLiveVoice(): ResolvedLiveVoice {
    return resolveDeviceLiveVoice(this.plugin.getDeviceVoicePref(), WebSpeechEngine.isSupported());
  }
  /** Persist the current listening position (sentence being read) as the book's last-read
   *  location. Only needed in the full-screen player where the reader isn't paging, so no
   *  `relocate` fires to save it; read-along mode is already covered by relocate. */
  saveListeningLocation(range: Range, sectionIndex: number): void {
    if (!this.currentFile) return;
    this.openedAtCfi = null; // listening has spoken since the book opened: its place is this sentence now
    try {
      const cfi = this.rangeToCfi(range, sectionIndex);
      this.addDebugEntry(`listen-loc: section=${sectionIndex} cfi=${cfi.slice(0, 48)}`, 'tts');
      this.persistLocation(cfi);
    } catch (err) {
      this.addDebugEntry(`listen-loc: cfi error — ${String(err)}`, 'tts');
    }
  }

  /** Build an indirection range CFI for a DOM range within a spine section. */
  private rangeToCfi(range: Range, sectionIndex: number): string {
    const rawSection = this.bookSections[sectionIndex] as unknown as { cfi?: string };
    const baseCFI = rawSection?.cfi ?? cfiFake.fromIndex(sectionIndex);
    return cfiJoinIndir(baseCFI, cfiFromRange(range));
  }

  cfiForRange(range: Range, sectionIndex: number): string | null {
    try {
      return this.rangeToCfi(range, sectionIndex);
    } catch {
      return null;
    }
  }

  async resolveCfi(cfi: string): Promise<{ sectionIndex: number; range: Range } | null> {
    return this.rangeAtCfi(cfi);
  }

  /**
   * ReaderContext: the contents entry holding the start of `cfi` — the passage's own entry, not the page's. See
   * `toc-entry.ts`. Null before the first entry, or when the CFI's section is not laid out.
   */
  tocEntryAt(cfi: string): PassageEntry | null {
    const at = this.rangeAtCfi(cfi);
    return at ? tocEntryAt(this.foliateView, at.sectionIndex, at.range) : null;
  }

  /** A range CFI resolved in its laid-out section, or null when it does not resolve or the section is not laid out. */
  private rangeAtCfi(cfi: string): { sectionIndex: number; range: Range } | null {
    const view = this.foliateView;
    if (!view) return null;
    try {
      const resolvedNav = view.resolveNavigation(cfi);
      if (!resolvedNav) return null;
      const { index, anchor } = resolvedNav;
      const doc = this.sectionDoc(index);
      if (!doc) return null;
      const resolved = anchor(doc);
      if (!resolved || !('startContainer' in resolved)) return null;
      return { sectionIndex: index, range: resolved };
    } catch {
      return null;
    }
  }

  /** Range CFI of the first ~two visible lines at the top of the current page, for a
   *  precise bookmark anchor. Anchored to the page top (not a sentence that may have
   *  begun on the previous page), so detection stays on this page. Null if unavailable. */
  topOfPageAnchor(): { cfi: string; text: string } | null {
    try {
      if (!this.lastPageRange) return null;
      const doc = this.sectionDoc(this.currentSectionIndex);
      if (!doc) return null;
      const range = this.firstLinesRange(doc, this.lastPageRange.startContainer, this.lastPageRange.startOffset, 2);
      return range ? { cfi: this.rangeToCfi(range, this.currentSectionIndex), text: range.toString() } : null;
    } catch (err) {
      this.addDebugEntry(`topOfPageAnchor error — ${String(err)}`, 'annot');
      return null;
    }
  }

  /** A range covering the first `maxLines` visible line-boxes of text starting at
   *  (`startNode`, `startOffset`). Extends character by character and watches the
   *  bounding box height: once it grows past `maxLines` line-heights we've entered the
   *  next line, so we stop at the previous character. Best-effort — returns a
   *  single-position range if nothing measurable is found. */
  private firstLinesRange(doc: Document, startNode: Node, startOffset: number, maxLines: number): Range | null {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    // Position the walker at the first text node at or after the page-top position.
    let node: Text | null;
    if (startNode.nodeType === Node.TEXT_NODE) {
      walker.currentNode = startNode;
      node = startNode as Text;
    } else {
      walker.currentNode = startNode;
      node = walker.nextNode() as Text | null;
    }
    if (!node) return null;
    const firstOffset = startNode.nodeType === Node.TEXT_NODE ? startOffset : 0;
    const range = doc.createRange();
    range.setStart(node, Math.min(firstOffset, node.nodeValue?.length ?? 0));
    range.setEnd(node, Math.min(firstOffset, node.nodeValue?.length ?? 0));
    let lineHeight = 0;
    let end: { node: Text; offset: number } | null = null;
    for (; node; node = walker.nextNode() as Text | null) {
      const len = node.nodeValue?.length ?? 0;
      for (let i = (node === range.startContainer ? range.startOffset : 0) + 1; i <= len; i++) {
        range.setEnd(node, i);
        const rect = range.getBoundingClientRect();
        if (rect.height === 0) continue;
        if (lineHeight === 0) lineHeight = rect.height;
        if (rect.height > lineHeight * (maxLines + 0.5)) {
          if (end) range.setEnd(end.node, end.offset);
          return range.collapsed ? null : range;
        }
        end = { node, offset: i };
      }
    }
    return range.collapsed ? null : range;
  }

  /** The rendered document for a spine section, or null if it isn't currently laid out. */
  private sectionDoc(index: number): Document | null {
    const renderer = this.foliateView?.renderer as unknown as {
      getContents?: () => Array<{ index: number; doc: Document }>;
    };
    return renderer?.getContents?.().find((c) => c.index === index)?.doc ?? null;
  }

  /** Flash a highlight over the anchored lines at `anchorCfi`, pulsing 3× — the landing
   *  cue when navigating to a bookmark. Pulses by toggling the overlay key on a timer
   *  rather than animating the SVG element: foliate's `Overlayer.redraw()` (fired on the
   *  layout settle after a cross-section jump) rebuilds each key's element from its map,
   *  which silently kills a WAAPI animation but leaves a key-driven blink intact. */
  flashAnchor(anchorCfi: string, color: string = BOOKMARK_FLASH_COLOR, outline = false): void {
    const view = this.foliateView;
    if (!view) return;
    // **The one gate for every source of a flash** — search, a bookmark, a link from a note, a row in the Library or
    // in the book's data view. Checked here rather than at each call site, because a check per caller is a promise to
    // remember it: the switch has to mean "no flashes", not "no flashes from the places we thought of".
    if (!deviceSetting('flashOnNavigation')) return;
    this.flashEpoch += 1;
    const epoch = this.flashEpoch;
    this.removeFlashOverlays(); // clear any leftover from a prior flash
    this.addDebugEntry(
      `flash: request epoch=${epoch} color=${color} outline=${outline} cfi=${anchorCfi.slice(0, 44)}`,
      'nav'
    );
    void (async () => {
      let index: number;
      let anchor: (doc: Document) => Range | Node | null;
      try {
        const resolvedNav = view.resolveNavigation(anchorCfi);
        if (!resolvedNav) throw new Error('unresolvable');
        ({ index, anchor } = resolvedNav);
      } catch (err) {
        this.addDebugEntry(`flash: resolve error — ${String(err)}`, 'nav');
        return;
      }
      if (epoch !== this.flashEpoch) return;

      const contentFor = () => {
        const renderer = view.renderer as unknown as {
          getContents?: () => Array<{ index: number; doc: Document; overlayer?: Overlayer }>;
        };
        return renderer?.getContents?.().find((c) => c.index === index);
      };
      const on = () => {
        const c = contentFor();
        if (!c?.overlayer || !c.doc) return false;
        const range = anchor(c.doc);
        if (!range || !('startContainer' in range)) return false;
        // Outline (a stroked border) stays visible over an existing highlight; the translucent
        // highlight fill (30% opacity) would just faintly tint an already-colored selection.
        if (outline) c.overlayer.add(FLASH_KEY, range, Overlayer.outline, { color, width: 3 });
        else c.overlayer.add(FLASH_KEY, range, Overlayer.highlight, { color });
        return true;
      };
      const off = () => {
        try {
          contentFor()?.overlayer?.remove(FLASH_KEY);
        } catch {
          /* overlay already gone */
        }
      };

      const ON_MS = 420;
      const OFF_MS = 240;
      const CYCLES = 3;
      let i = 0;
      const tick = () => {
        if (epoch !== this.flashEpoch) return; // a newer flash owns the key now
        if (i >= CYCLES) {
          this.removeFlashOverlays();
          return;
        }
        i += 1;
        const drew = on();
        if (i === 1) this.addDebugEntry(`flash: section ${index} on=${drew}`, 'nav');
        window.setTimeout(() => {
          if (epoch !== this.flashEpoch) return;
          off();
          window.setTimeout(tick, OFF_MS);
        }, ON_MS);
      };
      /**
       * **Wait for the section to exist before counting pulses.**
       *
       * Search and the bookmark panel flash inside a book that is already laid out, so the first `on()` always
       * draws. A link from a note lands in a book that may still be rendering: every
       * cycle then draws nothing, the three pulses pass in two seconds, and the reader sees no flash at all, which
       * looks like nothing rather than like a bug. So the pulse chain starts on the first frame that CAN be drawn.
       *
       * Bounded, because a CFI that resolves to a section the reader immediately navigates away from would otherwise
       * wait forever — and superseded by the epoch, so a second flash while this one waits abandons it.
       */
      const WAIT_EVERY_MS = 150;
      const WAIT_TRIES = 20;
      const waitThenPulse = (tries: number): void => {
        if (epoch !== this.flashEpoch) return;
        const c = contentFor();
        if (c?.overlayer && c.doc) {
          tick();
          return;
        }
        if (tries >= WAIT_TRIES) {
          this.addDebugEntry(`flash: gave up waiting for section ${index}`, 'nav');
          return;
        }
        window.setTimeout(() => waitThenPulse(tries + 1), WAIT_EVERY_MS);
      };
      waitThenPulse(0);
    })();
  }

  markUserNavigation(targetCfi?: string): void {
    // A picture open over the page belongs to the page being left: the move would happen out of sight behind it.
    if (this.imageViewer.isOpen) this.imageViewer.close();
    this.openedAtCfi = null; // the reader chose somewhere else to be — see `resumeRangeOnPage`
    // The reader has moved of their own accord, so stepping between annotations starts again from here rather
    // than carrying on from a chapter they have left. Stepping itself does not come through this path.
    this.annot.forgetShownAnnotation();
    // Listening put aside by search or Go to hears now: a hit on the page showing fires no relocate to deliver it.
    if (this.tts.isSuspended()) {
      this.tts.onUserNavigated(targetCfi ?? null);
      return;
    }
    this.userNavPending = true;
    this.userNavTargetCfi = targetCfi ?? null;
  }

  /** Remove the flash overlay from every section it may have landed on. */
  private removeFlashOverlays(): void {
    const renderer = this.foliateView?.renderer as unknown as {
      getContents?: () => Array<{ overlayer?: Overlayer }>;
    };
    for (const c of renderer?.getContents?.() ?? []) {
      try {
        c.overlayer?.remove(FLASH_KEY);
      } catch {
        /* overlay already gone */
      }
    }
  }

  /** Debounced save of the book's last-read location (shared by the relocate handler and
   *  listening playback, so they don't double-write). */
  private persistLocation(cfi: string): void {
    if (!cfi || !this.currentFile || this.isNavigating || cfi === this.lastSavedCfi) return;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.pendingCfi = cfi;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.pendingCfi = null;
      this.lastSavedCfi = cfi;
      this.addDebugEntry(`persist-loc: saved cfi=${cfi.slice(0, 48)}`, 'relocate');
      void saveLocation(this.app, this.currentFile!, cfi);
    }, 1000);
  }

  /** Flush a pending debounced save synchronously, before the view is torn down.
   *  Prefers the in-flight CFI (may be a full-player sentence position) over the
   *  view's parked page, which in the player sits at the section start. */
  private flushPendingSave(): void {
    if (this.saveTimer === null) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const cfi = this.pendingCfi ?? this.lastCfi;
    this.pendingCfi = null;
    if (cfi && this.currentFile) {
      this.lastSavedCfi = cfi;
      void saveLocation(this.app, this.currentFile, cfi);
    }
  }
  refreshAnnotations(): void {
    if (this.foliateView) this.annot.reapplyAnnotations(this.foliateView);
  }

  // Build the Go To bar once into the overlay container (alongside the search bar);
  // shown/hidden by openGoToBar / closeGoToBar. Two rows: a "Go to:" label + input +
  // Go + close, and a hint line that shows the loc-vs-page disclaimer (or an inline
  // error on bad input).
  private buildGoToBar(container: HTMLElement): void {
    this.goToBar = new SecondaryBar(this, this.barRegistry, {
      cls: 'orbis-goto-bar',
      onClose: () => {
        if (this.goToInputEl) this.goToInputEl.value = '';
        this.resetGoToHint();
      },
    });
    const bar = this.goToBar.build(container);

    const row = bar.createDiv({ cls: 'orbis-goto-bar-row' });
    row.createSpan({ cls: 'orbis-goto-bar-label', text: t('go_to.go_to_label') });
    const input = row.createEl('input', { type: 'text', cls: 'orbis-goto-bar-input' });
    input.placeholder = t('go_to.location_or_pct');
    this.goToInputEl = input;
    this.goToBar.registerInput(input); // mobile keyboard-lock
    const goBtn = row.createEl('button', { cls: 'orbis-search-go', text: t('go_to.go') });
    const closeBtn = row.createEl('button', { cls: 'orbis-ctrl-btn orbis-sb-close', text: '×' });
    closeBtn.setAttribute('aria-label', t('action.cancel'));

    this.goToHintEl = bar.createEl('p', {
      cls: 'orbis-goto-bar-hint',
      text: t('go_to.location_disclaimer'),
    });

    input.addEventListener('input', () => this.resetGoToHint());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitGoTo();
      } else if (e.key === 'Escape') {
        this.closeGoToBar();
      }
    });
    goBtn.addEventListener('click', () => this.submitGoTo());
    closeBtn.addEventListener('click', () => this.closeGoToBar());
  }

  openGoToBar(): void {
    if (!this.goToBar) return;
    this.closePanel();
    this.resetGoToHint();
    this.goToBar.open(); // closes the other secondary bars via the registry
    if (this.goToInputEl) {
      this.goToInputEl.value = '';
      // Plain focus (no preventScroll) — with preventScroll the reader host went
      // blank/black when the Android keyboard opened.
      window.setTimeout(() => this.goToInputEl?.focus(), 50);
    }
  }

  private closeGoToBar(): void {
    this.goToBar?.close();
  }

  /** Register search / read-aloud with the registry so opening any secondary bar closes the
   *  others (the Go To bar registers itself as a SecondaryBar). */
  private wireBarMutualExclusion(): void {
    // search + Go To are SecondaryBars and register themselves. Read-aloud isn't one, so
    // adapt its open/close into the registry.
    // When another top-strip surface displaces the audio bar, suspend it (pause + hide, keep the
    // engine + exact position) rather than tearing it down, so reopening resumes where you were.
    const tts: ClosableBar = { isOpen: () => this.tts.isBarOpen(), close: () => this.tts.suspendForOtherBar() };
    this.barRegistry.register(tts);
    this.tts.onBeforeOpenBar = () => this.barRegistry.closeOthers(tts);
    // Read-aloud opens and closes by its own paths, so it has to say when — a `SecondaryBar` does
    // this from the shared shell.
    this.tts.onBarStateChanged = () => this.barRegistry.changed();

    // The Display Styles menu isn't a bar, but it shares the same top space, so it
    // participates in the same "only one open" coordination (opening it closes the
    // bars; opening a bar closes it).
    this.displayMenuBar = {
      isOpen: () => !!this.displayMenuWrapper && this.displayMenuWrapper.style.display !== 'none',
      close: () => this.closeDisplayMenu(),
    };
    this.barRegistry.register(this.displayMenuBar);

    /**
     * **The one rule about the top of the reader: a bar and the floating history pair cannot share it.**
     *
     * The pair sits at `top: 8px` over the book, and the bars are of different heights by design — the
     * Display Styles bar is deliberately minimal to leave room for its third level. So a tall bar (search,
     * Go To) covers the pair completely and a short one (listening, Display Styles) clips it, leaving a
     * sliver of two buttons showing — so every bar hides the pair, not just one.
     *
     * Scoped to the host **on purpose**: focus mode re-parents `.orbis-history-nav` into
     * `.orbis-focus-topbar`, a sibling of the host, where the pair is a row item rather than a float and
     * overlaps nothing. So it keeps working there, and needs no exception to say so — see `styles.css`.
     */
    this.barRegistry.onChanged = () => this.syncBarOpenClass();
    this.syncBarOpenClass();
  }

  /** Reflect "is any second-level surface open" onto the host, for `.orbis-bar-open`. */
  private syncBarOpenClass(): void {
    this.hostEl?.toggleClass('orbis-bar-open', this.barRegistry.anyOpen());
  }

  private resetGoToHint(): void {
    if (!this.goToHintEl) return;
    this.goToHintEl.textContent = t('go_to.location_disclaimer');
    this.goToHintEl.removeClass('is-error');
  }

  private showGoToError(message: string): void {
    if (!this.goToHintEl) return;
    this.goToHintEl.textContent = message;
    this.goToHintEl.addClass('is-error');
  }

  private submitGoTo(): void {
    if (!this.goToInputEl) return;
    const totalLocs = this.getTotalLocs();
    const result = parseGoToInput(this.goToInputEl.value, totalLocs);
    if (!result.valid) {
      if (result.error === 'empty') return;
      if (result.error === 'pct_out_of_range') this.showGoToError(t('go_to.pct_out_of_range'));
      else this.showGoToError(t('go_to.enter_valid_location', { total: String(totalLocs ?? '...') }));
      return;
    }
    const target = result.target;
    // Go To relocates the book → the audio player follows. A CFI target is precise (seek the
    // player to that sentence); a loc/% is coarse → page top.
    this.markUserNavigation(target.startsWith('epubcfi(') ? target : undefined);
    if (target.startsWith('epubcfi(')) {
      this.navigateToCfi(target);
    } else if (target.endsWith('%')) {
      const pct = parseInt(target.slice(0, -1).trim(), 10);
      this.goToFraction(pct / 100);
    } else if (!this.navigateToLoc(parseInt(target, 10))) {
      new Notice(t('notices.locations_not_ready'));
      return;
    }
    this.closeGoToBar();
    // Same reason as the panels: the bar is a way of getting somewhere, so the keyboard belongs on the book once
    // it has. Only on success — a rejected location leaves the field focused so it can be corrected.
    this.focusReader();
  }

  // Re-inject styles into every book iframe Document — both tracked ones and any
  // found by walking the renderer shadow DOM (catches sections not delivered via 'load').
  // Re-inject styles into all tracked book iframe Documents, then force a one-frame
  // renderer reload so any adjacent sections (not captured via 'load') also update.
  //
  // Why the reload is necessary:
  // - foliate-view uses a CLOSED shadow DOM — external iframe access is impossible.
  // - foliate only fires 'load' for the focused section; adjacent pre-loaded sections
  //   in scrolled mode never appear in loadedDocs.
  // - Toggling the renderer's 'flow' attribute for one animation frame forces foliate
  //   to reload all visible sections, firing 'load' for each so they receive the new CSS.
  public reinjectAllDocs(): void {
    // A layout change (Display menu or Settings) is about to reload the sections, killing the live
    // Range the player is reading. Let it capture a CFI anchor + pause first, so it can re-seat.
    this.tts.onBeforeReRender();
    this.addDebugEntry(`reinjectAllDocs tracked:${this.loadedDocs.size}`, 'display');
    this.loadedDocs.forEach((doc) => {
      try {
        if (doc.head) this.applyDocStyles(doc);
      } catch (err) {
        this.addDebugEntry(`reinjectAllDocs error: ${String(err)}`, 'display');
      }
    });
    this.reloadAdjacentSections();
  }

  // Toggle the renderer flow attribute for one animation frame so foliate reloads
  // all visible section iframes and fires 'load' events for each.
  reloadAdjacentSections(): void {
    const r = this.foliateView?.renderer;
    if (!r) return;
    const current = this.settings.flow;
    const alt = current === 'scrolled' ? 'paginated' : 'scrolled';
    this.addDebugEntry(`reloadAdjacentSections flow ${current}→${alt}→${current}`, 'nav');
    r.setAttribute('flow', alt);
    this.contentEl.win.requestAnimationFrame(() => {
      r.setAttribute('flow', current);
    });
  }

  /** AnnotationHost: open the lookup popup for the selected text. */
  lookUp(text: string): void {
    void this.lookup.open(text);
  }

  openPanel(tab?: 'contents' | 'search' | 'saved' | 'backlinks' | 'stats'): void {
    this.closeDisplayMenu();
    this.panels.open(tab);
  }

  closePanel(): void {
    this.panels.close();
  }

  refreshSavedPanelIfOpen(): void {
    this.panels.refreshSavedIfOpen();
  }

  // ── Annotation preset (per book) ────────────────────────────────────────────
  // The preset manager can be opened while a book is open, so it offers assignment for that book; it
  // reaches the controller through the plugin and these two members.

  /** The global preset id this book is using, or null when unassigned. */
  get annotationPresetId(): string | null {
    return this.annot.presetId;
  }

  /** Assign a global preset to this book (null unassigns), rewriting `.orbis` and redrawing. */
  assignAnnotationPreset(preset: AnnotationPreset | null): Promise<void> {
    return this.annot.assignPreset(preset);
  }

  /**
   * A book with no preset of its own gets the default one, here, on open.
   *
   * Deliberately eager rather than waiting for a first annotation: it means EVERY annotation carries a
   * `markId` from the moment it is made, so meaning is never something an annotation acquires later by
   * color coincidence. What it rules out is "book with no MARKS" — NOT "book with no preset", which
   * detaching produces and which the guard below is here to respect.
   *
   * Cheap: it only writes when the key is absent, which for a new book coincides with the `saveBookInfo`
   * write already happening on first open. Run BEFORE the overlays exist, so the first draw of the book
   * already has its marks. An existing assignment always wins — a book assigned on another device keeps
   * that preset even if this device's default is something else.
   */
  private async ensureBookAnnotationPreset(): Promise<void> {
    const presets = this.plugin.settings.annotationPresets;
    // **Before every other question.** A detached book has no id and no template, which is indistinguishable
    // from "never assigned" if you only look at the id — so without this, the assign below would hand it the
    // default on the next open and the reader's choice would quietly undo itself. `BookPreset.detached` is what
    // tells the two apart.
    if (this.annot.presetDetached) return;
    const assigned = this.annot.presetId;
    if (!assigned) {
      const def = presets.find((p) => p.isDefault) ?? presets[0];
      if (def) await this.annot.assignPreset(def);
      return;
    }
    // A preset this device has never seen — a book assigned on another device, or a shared one. Import it
    // from the book's own copy rather than leaving the book in a state where nothing can track anything:
    // see `presetFromBookCopy` for why the missing template is the actual problem. Always, with no prompt:
    // the alternative is a decision nobody has information to make, on every device, forever.
    if (!presets.some((p) => p.id === assigned)) await this.importBookPreset();
    // Already assigned: catch the book's copy up with its template. Silent, because tracked marks are the
    // preset's to change and there is nothing local to lose — the merge never touches a mark the reader
    // made their own, and refuses to run at all if this device's template is the older of the two.
    await this.annot.mergeWithTemplate(this.plugin.settings.annotationPresets.find((p) => p.id === assigned));
  }

  /**
   * Add the open book's preset to this device's library, reconstructed from the book's own copy.
   *
   * A notice rather than a prompt. It is automatic, so there is nothing to decide — but it does add an entry
   * to the library, and a silent write that grows a list the reader will later see should say so once.
   *
   * **Because the library travels, this fires for a book from ANOTHER vault**, not for your own second
   * device. That is why the import arrives inactive (see `presetFromBookCopy`): the book gets the template
   * it needs to keep tracking, and somebody else's vocabulary does not join the list you assign from.
   */
  private async importBookPreset(): Promise<void> {
    const copy = this.annot.bookPresetCopy;
    if (!copy) return;
    const imported = presetFromBookCopy(copy, Date.now());
    if (!imported) return;
    this.plugin.settings.annotationPresets.push(imported);
    await this.plugin.saveSettings();
    new Notice(t('presets.imported', { name: imported.name || t('presets.book_missing') }));
    this.addDebugEntry(`imported preset ${imported.id} from the book's copy`, 'annot');
  }

  /**
   * Write one vault note per piece of saved content, plus the generated `.base` views and the book's cover.
   *
   * The root comes from the records setting, NOT from a note style: borrowing the default style's folder would put
   * two mechanisms with different lifecycles — one on-demand and merge-aware, one continuous and idempotent — into
   * the same directory. See docs/design/reading-records.md.
   */
  /**
   * Saved content changed — write records after it settles.
   *
   * **Debounced, not immediate.** A selection is created, recoloured, re-marked, then deleted twenty seconds
   * later; note text arrives a character at a time. Writing on each of those would put a file into the vault for
   * every keystroke and then delete it. Same pattern as the progress writer and `pendingCfi`.
   *
   * Silent: no notice, because this fires while the reader is reading and a toast per highlight is worse than no
   * feature. Failures go to the debug log.
   *
   * There is no separate backfill. The write is a full idempotent pass over the book, so the first fire after
   * switching the feature on catches up everything already in the book — which is exactly what a backfill is,
   * without a second code path that could disagree with this one.
   */
  get libraryEnabled(): boolean {
    return this.plugin.settings.libraryEnabled;
  }
  get recordKinds(): RecordKinds {
    return this.recordsCtl.records().kinds;
  }

  // ── Asking about a book (the `ask` mode) ──────────────────────────────────
  //
  // Nothing is lost by asking LATER. The export is a full idempotent pass over the book, so whenever the
  // answer arrives the first write catches up everything already saved — which is what makes it safe to wait
  // for a moment when the reader is not in the middle of something. See docs/design/reading-records.md.

  /**
   * Ask, then write a PDF of everything marked in this book.
   *
   * Runs off the annotation data alone — no EPUB parsing, no rendering — so it is available the moment a book is
   * open and costs nothing until it is asked for. `pdf-lib` is loaded on demand inside `buildMarksPdf`.
   */
  saveAnnotationsAsPdf(): void {
    void this.openMarksPdf('digest');
  }

  /**
   * The book itself as a PDF, with the marks drawn in where they were made.
   *
   * Always available, unlike its sibling: a PDF of the book is a readable artifact before anyone has annotated
   * anything, and refusing until they have would be the wrong order — you may well want the PDF first.
   */
  saveBookAsPdf(): void {
    void this.openMarksPdf('document');
  }

  /** A detached copy of the book's own preset, for editing in the manager's "This book" scope. */
  get annotationBookPreset(): BookPreset | null {
    return this.annot.bookPresetCopy;
  }

  /** Save marks edited for this book only — and repaint the player's two role buttons, which preview those marks. */
  async saveAnnotationBookPreset(next: BookPreset | null): Promise<void> {
    await this.annot.updateBookPreset(next);
    this.tts.updateActionIcons();
  }

  /** Catch this book up with a preset that just changed. */
  mergeAnnotationPreset(preset: AnnotationPreset): Promise<void> {
    return this.annot.mergeWithTemplate(preset);
  }

  /** Copy a preset mark into this book so it can be changed here. Returns the new mark's id. */
  copyMarkIntoBook(markId: string): Promise<string | undefined> {
    return this.annot.copyMarkIntoBook(markId);
  }

  /** Show or hide one of this book's marks. */
  setBookMarkHidden(markId: string, hidden: boolean): Promise<void> {
    return this.annot.setMarkHidden(markId, hidden);
  }

  /** Which marks this book's annotations depend on, and how many carry each. */
  bookMarkUsage(): { markId: string; count: number }[] {
    return this.annot.markUsage();
  }

  /** Point this book at a different preset, applying a decision per mark in use. */
  changeBookPreset(next: AnnotationPreset, plan: Map<string, RemapChoice>): Promise<void> {
    return this.annot.changePreset(next, plan);
  }

  /** Delete one of this book's own marks, remapping or removing what carries it — see `deleteLocalMark`. */
  deleteLocalMark(markId: string, choice: RemapChoice | 'remove'): Promise<void> {
    return this.annot.deleteLocalMark(markId, choice);
  }

  /** The library's copy of a preset by id — see `AnnotationHost.presetFor`. */
  presetFor(id: string): AnnotationPreset | undefined {
    return this.plugin.settings.annotationPresets.find((p) => p.id === id);
  }

  /** Stop this book following its preset — see `detachBookPreset`. */
  detachPreset(detached: { book: BookPreset; idMap: Map<string, string> }): Promise<void> {
    return this.annot.detachPreset(detached);
  }

  /** Store a promotion of this book's marks into a new preset — see `promoteBookToPreset`. */
  applyBookPromotion(promoted: PromotedPreset): Promise<void> {
    return this.annot.applyPromotion(promoted);
  }

  // ── Link preview ────────────────────────────────────────────────────────────

  lockMobileHeights(): void {
    this.readerDom.lockHeights();
  }

  unlockMobileHeights(): void {
    this.readerDom.unlockHeights();
  }

  releaseMobileHeightLock(): void {
    this.readerDom.releaseHeightLock();
  }

  private addDebugEntry(msg: string, category: DebugCategory): void {
    this.debugLog.add(msg, category);
  }

  toggleDebugLog(): void {
    this.debugLog.toggle();
  }

  writeNotesFile(
    notesPath: string,
    config: NoteStyle['config'],
    insertAtBottom: boolean,
    openAfter = true,
    /** The marks this run is narrowed to — empty or absent is every mark, which is the ordinary case. */
    marks?: ReadonlySet<string>,
    /** The chapters this run covers, by contents href — absent follows the style's own rule. */
    chapters?: ReadonlySet<string>
  ): Promise<void> {
    return this.notesExporter.writeNotesFile(notesPath, config, insertAtBottom, openAfter, marks, chapters);
  }

  async generateCompanionNotes(): Promise<void> {
    if (!this.currentFile) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }
    new GenerateNotesModal(this.app, this).open();
  }

  generatePerChapterNotes(
    folderPath: string,
    config: NoteStyle['config'],
    styleId: string,
    styleName: string,
    noteSetSlugOverride?: string,
    openAfter = true,
    marks?: ReadonlySet<string>,
    chapters?: ReadonlySet<string>
  ): Promise<NotesFileSet | null> {
    return this.notesExporter.generatePerChapterNotes(
      folderPath,
      config,
      styleId,
      styleName,
      noteSetSlugOverride,
      openAfter,
      marks,
      chapters
    );
  }

  recordNotesFileSet(set: NotesFileSet): Promise<void> {
    return this.notesExporter.recordNotesFileSet(set);
  }

  async openOrCreateNotesFile(): Promise<void> {
    if (!this.currentFile) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }

    // Hidden, never deleted: a set whose files are missing here may only not have arrived yet, and a deletion recorded
    // now would travel to the device that wrote them.
    const live = (await readNotesFiles(this.app, this.currentFile)).filter((s) => this.notesExporter.isSetLive(s));

    if (live.length === 0) {
      new GenerateNotesModal(this.app, this).open();
      return;
    }

    // For per-chapter sets, keep only the most-recently created record per unique folder.
    // Multiple generates of the same folder each produce a new record; only the latest matters.
    const newestPerFolder = new Map<string, NotesFileSet>();
    for (const set of live) {
      if (set.mode !== 'per-chapter') continue;
      const key = set.folder ?? set.id;
      const existing = newestPerFolder.get(key);
      if (!existing || set.createdAt > existing.createdAt) newestPerFolder.set(key, set);
    }
    const visibleSets = live.filter((s) => s.mode !== 'per-chapter' || newestPerFolder.get(s.folder ?? s.id) === s);

    // Folder portion of a vault path, trailing-slashed — just "/" at vault root.
    // The file name is already shown as the entry's own label, so the sublabel
    // doesn't need to repeat it.
    const folderOf = (path: string): string => {
      const idx = path.lastIndexOf('/');
      return idx === -1 ? '/' : `${path.slice(0, idx)}/`;
    };

    // Build picker entries
    const entries: PickerEntry[] = [];

    for (const set of visibleSets) {
      if (set.mode === 'per-chapter') {
        // Match by href first (unique — chapter labels repeat across parts in many
        // books), then by label for chapter files that carry no href, then fall
        // back to nearest sectionIndex.
        const chapterFile = (() => {
          if (!set.chapters || set.chapters.length === 0) return null;
          if (this.tocItemHref) {
            const exact = set.chapters.find((c) => c.href === this.tocItemHref);
            if (exact) return exact;
          }
          if (this.currentTocLabel) {
            const exact = set.chapters.find((c) => c.title === this.currentTocLabel);
            if (exact) return exact;
          }
          let best = set.chapters[0];
          let bestDist = Math.abs(best.sectionIndex - this.currentSectionIndex);
          for (const ch of set.chapters) {
            const dist = Math.abs(ch.sectionIndex - this.currentSectionIndex);
            if (dist < bestDist) {
              bestDist = dist;
              best = ch;
            }
          }
          return best;
        })();
        if (chapterFile) {
          entries.push({
            label: chapterFile.title || t('notes_file_picker_modal.chapter_n', { n: chapterFile.chapter }),
            sublabel: folderOf(chapterFile.path),
            tag: t('notes_file_picker_modal.current_chapter'),
            isCurrentChapter: true,
            openPath: chapterFile.path,
            set,
          });
        }
      } else {
        entries.push({
          label: (set.path ?? '').split('/').pop()?.replace(/\.md$/, '') ?? set.styleName,
          sublabel: folderOf(set.path ?? ''),
          openPath: set.path ?? '',
          set,
        });
      }
    }

    if (entries.length === 0) {
      new GenerateNotesModal(this.app, this).open();
    } else if (entries.length === 1) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(entries[0].openPath));
      if (file instanceof TFile) await openNoteBeside(this.app, file);
    } else {
      // Current chapter first, then MOC, then single-file entries
      entries.sort((a, b) => {
        const rank = (e: PickerEntry) => (e.isCurrentChapter ? 0 : e.sublabel.includes('map of contents') ? 1 : 2);
        return rank(a) - rank(b);
      });
      new NotesFilePickerModal(this, entries, (entry) => {
        void (async () => {
          const file = this.app.vault.getAbstractFileByPath(normalizePath(entry.openPath));
          if (file instanceof TFile) await openNoteBeside(this.app, file);
        })();
      }).open();
    }
  }

  toggleNoteIcons(): void {
    this.annot.noteIcons.toggle();
  }

  bookGoBack(): void {
    this.foliateView?.history.back();
  }

  bookGoForward(): void {
    this.foliateView?.history.forward();
  }

  clearNavigationHistory(): void {
    const history = this.foliateView?.history;
    if (!history?.canGoBack && !history?.canGoForward) {
      new Notice(t('notices.no_navigation_history_to_clear'));
      return;
    }
    history.clear();
    // history.clear() doesn't dispatch its own event; the floating back/
    // forward buttons' visibility listener is wired to 'index-change', so
    // dispatch it manually to hide them immediately.
    history.dispatchEvent(new Event('index-change'));
    new Notice(t('notices.navigation_history_cleared'));
  }

  cycleProgressMode(): void {
    this.stats.cycleProgressMode();
  }

  getTotalLocs(): number | null {
    return this.locIndex.getTotalLocs();
  }

  getLocForCfi(cfi: string): number | null {
    return this.locIndex.getLocForCfi(cfi);
  }

  copyHighlights(): void {
    this.clipboardExporter.copyHighlights();
  }

  copyNotes(): void {
    this.clipboardExporter.copyNotes();
  }

  copyBookmarks(): void {
    this.clipboardExporter.copyBookmarks();
  }

  async showDeviceLocations(): Promise<void> {
    if (!this.currentFile) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }
    const devices = await readAllDeviceLocations(this.app, this.currentFile);
    if (devices.length === 0) {
      new Notice(t('notices.no_reading_locations_found_for_this_book'));
      return;
    }
    const ownId = getOrCreateDeviceId(this.app);
    new DeviceLocationsModal(
      this,
      devices,
      (cfi) => this.getLocForCfi(cfi),
      (cfi) => this.navigateToCfi(cfi),
      ownId
    ).open();
  }

  recalculateLocations(): void {
    if (!this.locIndex.isReady || this.locIndex.sectionLocInfo.length === 0) {
      new Notice(t('notices.locations_not_ready_reload'));
      return;
    }
    const total = this.restampLocs();
    const one = total === 1;
    new Notice(
      t(one ? 'notices.locations_updated_for_n_annotations_one' : 'notices.locations_updated_for_n_annotations', {
        n: total,
      })
    );
  }

  /** Every passage, note and bookmark onto the index's locations — see `restampLocs`. How many changed. */
  private restampLocs(): number {
    if (!this.locIndex.isReady || this.locIndex.locNavCache.size === 0) return 0;
    const n = restampLocs((cfi) => this.getLocForCfi(cfi) ?? undefined, this.annot, this.bookmarkCtl);
    if (n) this.panels.renderSaved();
    return n;
  }

  async rebuildLocsCache(): Promise<void> {
    if (!this.currentFile) {
      new Notice(t('notices.no_book_loaded'));
      return;
    }
    if (!this.foliateView) {
      new Notice(t('notices.book_not_loaded'));
      return;
    }
    new Notice(t('notices.rebuilding_locations'));
    await this.locIndex.rebuild();
    new Notice(t('notices.locations_rebuilt'));
  }

  // Tear down all per-book state. Called at the top of onLoadFile before the new
  // book is opened, ensuring no stale references carry over between books.
  private resetFileState(): void {
    this.foliateView?.close?.();
    this.foliateView = null;
    this.panels.dispose();
    this.hostEl = null;
    this.filterWrapperEl = null;
    this.prevBtn = null;
    this.nextBtn = null;
    this.loadedDocs = new Set();
    this.bookSections = [];
    this.bookResources = null;
    this.bookGetCover = null;
    this.currentSectionIndex = 0;
    this.totalBookSize = 0;
    this.tocItemHref = '';
    this.lastSection = null;
    this.lastLocation = null;
    this.locIndex.reset();
    this.stats.reset();
    // Cleared here rather than only reloaded on open: if opening fails partway, the previous book's decision
    // must not be the one consulted for this one. Null falls back to the global default, which is safe.
    this.recordsCtl.dispose();
    this.annot.dispose();
    this.bookmarkCtl.dispose();
    this.currentTocLabel = null;
    this.lastLocationCfi = '';
    this.navSuppressor.dispose();
    this.closeGoToBar();
    this.docToSection = new Map();
    this.debugLog.dispose();
    this.bookMeta = { title: '', author: '', publisher: '', language: '', pubdate: '', description: '' };
    this.search.dispose();
    this.tts.dispose();
    this.recordingRun.dispose(); // book closing — stop any generation (in-flight chapter discarded), drop its chip
    this.tocItems = [];
    this.bookChaptersCache = null;
    this.bookChaptersKey = '';
    this.tocBtn = null;
    this.annotationsBtn = null;
    this.focusBtn = null;
    this.focus.dispose();
    this.toolbarEl = null;
  }

  private setLoadingStatus(s: string): void {
    this.stats.setChipText(s);
  }

  private teardownForNewFile(file: TFile): void {
    this.flushPendingSave();
    // While `currentFile` is still the book being left: the pass reads it, and its lists, as it starts.
    this.recordsCtl.flush();
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    if (this.focusMode) this.focus.toggle();
    this.currentFile = file;
    this.resetFileState();
    this.settings = loadSettings(this.app, this.plugin.settings);
    this.contentEl.empty();
    this.contentEl.addClass('orbis-container');
    this.contentEl.removeClass('orbis-open-failed');

    this.stats.initModeFromSettings();
  }

  private buildToolbar(): void {
    // Toolbar — three grid columns so the progress label stays centered
    // regardless of how many buttons are shown on either side: content
    // actions (TOC, Search, Bookmark) on the left, view/presentation toggles
    // (NoteIcons, DisplayStyle, Focus, Debug) on the right — Focus kept
    // rightmost for easy reach — and the progress label centered between them.
    const toolbar = this.contentEl.createDiv({ cls: 'orbis-toolbar' });
    this.toolbarEl = toolbar;

    this.toolbarEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (this.displayStyleBtn?.contains(target)) return;
      if (this.displayMenuWrapper?.contains(target)) return;
      if (this.displayMenuWrapper?.style.display !== 'none') {
        this.closeDisplayMenu();
      }
    });

    const toolbarLeft = toolbar.createDiv({ cls: 'orbis-toolbar-left' });

    // ☰ Contents / Search / Saved
    this.tocBtn = toolbarLeft.createEl('button', { cls: 'orbis-toc-btn' });
    this.tocBtn.setAttribute('aria-label', t('toolbar.navigator'));
    setSvgIcon(
      this.tocBtn,
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2.5" rx="1.25"/><rect x="3" y="10.75" width="18" height="2.5" rx="1.25"/><rect x="3" y="17.5" width="18" height="2.5" rx="1.25"/></svg>'
    );

    // Search — toggles the standalone search bar
    this.search.buildToolbarButton(toolbarLeft);

    // Bookmark (SVG, updated by updateBookmarkBtn)
    this.bookmarkCtl.buildButton(toolbarLeft);

    // Read aloud (TTS) — a "consume the book" action, grouped with the content actions.
    this.tts.buildToolbarButton(toolbarLeft);

    // Progress label — centered grid column
    this.stats.buildChip(toolbar);

    const toolbarRight = toolbar.createDiv({ cls: 'orbis-toolbar-right' });

    // Note icons (SVG pencil)
    this.annot.noteIcons.buildToggle(toolbarRight);

    this.displayStyleBtn = toolbarRight.createEl('button', {
      cls: 'orbis-ctrl-btn',
      attr: { 'data-orbis-opens': 'display' },
    });
    this.displayStyleBtn.setAttribute('aria-label', t('toolbar.display_style'));
    this.displayStyleBtn.setAttribute('aria-expanded', 'false');
    setSvgIcon(
      this.displayStyleBtn,
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>'
    );

    // Display Style Menu
    void import('./display-menu').then((m) => m.buildDisplayMenu(this, toolbar));

    // Annotation presets. Shown by default, because the marks are what every highlight and note in the
    // book MEANS and the manager is otherwise only reachable from Settings or the palette — but every
    // other button here can be turned off, and a reader who never edits a mark should not be the one
    // exception who cannot.
    //
    // Placed between display style and focus so that focus keeps the rightmost slot: on a phone that is
    // the easiest icon to reach with a thumb, and focus is the one most used while actually reading. It
    // also puts the two menu/modal openers side by side with an instant toggle at each end of the group.
    const presetsBtn = toolbarRight.createEl('button', { cls: 'orbis-ctrl-btn' });
    this.annotationsBtn = presetsBtn;
    presetsBtn.setAttribute('aria-label', t('toolbar.annotation_presets'));
    setSvgIcon(presetsBtn, annotationsSvg());
    presetsBtn.addEventListener('click', () => openAnnotationPresets(this.app, this.plugin, 'book'));

    // Focus button
    this.focusBtn = toolbarRight.createEl('button', { cls: 'orbis-ctrl-btn' });
    this.focusBtn.setAttribute('aria-label', t('toolbar.focus_mode'));
    setSvgIcon(
      this.focusBtn,
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3"/><path d="M16 3h3a2 2 0 012 2v3"/><path d="M21 16v3a2 2 0 01-2 2h-3"/><path d="M8 21H5a2 2 0 01-2-2v-3"/></svg>'
    );
    this.focusBtn.addEventListener('click', () => this.toggleFocusMode());

    // Debug button

    // Apply initial toolbar visibility from settings
    this.applyToolbarVisibility();
  }

  private buildSearchBar(): void {
    this.search.buildBar(this.contentEl);
  }

  /** True once the document-level key handling is in place — it belongs to the view, not to the book. */
  private keysInstalled = false;
  /** The listeners `installReactiveSettingsSync` registers for the view's lifetime are in: see there. */
  private viewListenersInstalled = false;

  private buildReaderHost(): void {
    // Host element for Foliate iframe
    const host = this.contentEl.createDiv({ cls: 'orbis-host' });
    this.hostEl = host;

    /**
     * The reader takes focus when a book opens, so the keys work before you touch anything.
     *
     * Without this the book's iframe holds no focus until it is clicked, and the first arrow press after opening
     * a book does nothing — which reads as broken rather than as unfocused, because there is nothing on screen to
     * say where the keyboard is pointing. `tabindex="-1"` makes the host focusable without putting it in the tab
     * order, where a reading surface has no business being.
     *
     * Focused HERE rather than on the iframe: a cross-document focus call is the fiddlier of the two, and once
     * the reader does click into the text the forwarder inside the book takes over anyway.
     */
    host.tabIndex = -1;
    /**
     * Listened for on the DOCUMENT, not on the host.
     *
     * Focus does not stay where it is put. Raising the annotation bar moves it there — and the bar is appended to
     * `document.body`, outside this view altogether — so a listener on the host would miss every keystroke made
     * while a selection is showing, which is precisely when a reader wants to refine one. The book's own document is
     * covered separately, by the forwarder.
     *
     * Guarded rather than narrowed: it acts only when this reader is the active view and the keystroke is not
     * going into a field somebody is typing in.
     */
    /**
     * **Once per view, not once per book.**
     *
     * `buildReaderHost` runs on every file load and `registerDomEvent` lives as long as the view — so without the
     * guard a second book would stack a second listener, a third a third, and every Shift+arrow would call `modify`
     * once per book ever opened in that pane. Vertical movement remembers the column it is traveling down, and
     * calling it twice in a row loses that: the selection hits an invisible wall.
     */
    if (!this.keysInstalled) {
      this.keysInstalled = true;
      installToolbarKeys(this); // the toolbars as rows of controls — see `toolbar-keys.ts`
      this.registerDomEvent(this.contentEl.ownerDocument, 'keydown', (e: KeyboardEvent) => {
        if (!this.readerHasKeyboard(e)) return;
        if (this.readerDom.turnPageFor(e)) return;
        if (this.readerDom.extendSelectionFor(e)) return;
        /**
         * Tab from OUT here has to reach into the book.
         *
         * This is where focus sits after opening a book, after navigating from a panel, and after clicking a nav
         * arrow — so it is the common case, not the edge one. Left to itself, Tab moves from the host to the next
         * tabbable thing, which is the iframe, and entering an iframe means its first link: the top of the chapter,
         * however many pages back that is.
         */
        if (e.key === 'Tab' && this.readerDom.seedLink(this.currentSectionDoc(), e.shiftKey)) e.preventDefault();
        // Escape out here cannot reach the annotation bar's own handler, but clearing the selection hides the bar
        // with it — so the second stage covers both from this side.
        if (e.key === 'Escape') {
          const sel = this.currentSectionDoc()?.defaultView?.getSelection();
          if (sel?.rangeCount && !sel.isCollapsed) {
            sel.removeAllRanges();
            e.preventDefault();
          } else if (this.displayMenuBar?.isOpen()) {
            // With nothing selected, the Display style toolbar is the next thing up — open with the mouse, it left the
            // keyboard here. So is a Listen bar with nothing playing.
            this.closeDisplayMenu();
            e.preventDefault();
          } else if (this.tts.closesOnEscape()) {
            this.tts.closeBar();
            this.focusReader(); // closing hands the keyboard to the Listen button
            e.preventDefault();
          }
        }
      });
    }

    this.filterWrapperEl = host.createDiv({ cls: 'orbis-filter-wrapper' });
    this.applyHostBg();

    // Container for overlay drawers (floats over the reader without taking up layout space).
    // Parented to `host`, NOT filterWrapperEl: filterWrapperEl carries the reading brightness
    // `filter`, which would dim the chrome bars (turning their theme background gray in light mode).
    // host fills the same box, so positioning is unchanged; focus mode re-applies the filter to
    // this container so the bars still match the dimmed book there (see the CSS rule).
    const overlayContainer = host.createDiv({ cls: 'orbis-overlay-container' });

    // Move search bar into the overlay container so it floats over the book instead of pushing it down
    overlayContainer.appendChild(this.search.barEl!);

    this.annot.buildDrawer(overlayContainer);
    this.buildGoToBar(overlayContainer);
    this.tts.buildBar(overlayContainer, this.filterWrapperEl);
    this.tts.refreshSkipLabels(); // bar + player skip buttons carry no number; labels state the amount
    this.wireBarMutualExclusion();

    this.prevBtn = this.filterWrapperEl.createEl('button', { cls: 'orbis-nav orbis-nav-prev', text: '‹' });
    this.nextBtn = this.filterWrapperEl.createEl('button', { cls: 'orbis-nav orbis-nav-next', text: '›' });
    /**
     * Out of the tab order, though not out of reach.
     *
     * They sit in the outer document, so they would answer the first two presses of Tab before the book saw one —
     * two stops on the way into the text, every time. For a keyboard reader they are a duplicate of a key that
     * already turns the page, and one that settings names; for a pointer they are unchanged.
     */
    this.prevBtn.tabIndex = -1;
    this.nextBtn.tabIndex = -1;
    this.annot.noteIcons.buildColumn(this.filterWrapperEl);

    /**
     * Debug log panel — on contentEl, not `host`, because focus mode makes `host` `position: fixed`, and that
     * opens a stacking context with no z-index at all. On `host` the panel would be sealed inside it at its auto
     * layer, under `.orbis-focus-overlay`, and no z-index on the panel could reach out: the focus-mode ✕ would draw
     * over the log. contentEl IS the focus-mode element, so there the two are compared directly — which is what the
     * panel's z-index is meant to decide. See `buildPanel`.
     */
    this.debugLog.buildPanel(this.contentEl);
    // The chip goes on contentEl, not host: contentEl IS `.orbis-container`, the positioned ancestor the
    // recording chip anchors to, so both floating chips share one coordinate space.
    this.debugLog.buildChip(this.contentEl);
    // The chip is built after buildToolbar()'s own visibility pass ran, so re-run it now that there is
    // something to hide. Idempotent — it only reads settings and toggles.
    this.applyToolbarVisibility();
  }

  private async loadBookAndMetadata(file: TFile): Promise<{ book: unknown; toc: TocItem[] }> {
    this.setLoadingStatus(t('loading_status.1_6_preparing'));
    // No script runs in the book's frame, except on iPhone and iPad, where WebKit would stop the frame's events
    // reaching Orbis — see `installNoScriptSandboxPatch`.
    if (!Platform.isIosApp) installNoScriptSandboxPatch();
    installFoliateSrcdocPatch(this.app);

    this.setLoadingStatus(t('loading_status.2_6_initializing'));
    const foliateModule = FoliateViewMod as unknown as FoliateViewModule;
    reportStaleRenderer(foliateModule.View, (msg) => this.addDebugEntry(msg, 'display'));

    this.setLoadingStatus(t('loading_status.3_6_reading_file'));
    const bytes = await this.app.vault.adapter.readBinary(file.path);

    this.setLoadingStatus(t('loading_status.4_6_reading_book'));
    // The MIME type is a deliberate fiction for all five formats, and harmless: foliate's makeBook()
    // sniffs ZIP magic bytes and MOBI headers rather than trusting `type`, and its CBZ/FB2 checks
    // accept `name.endsWith('.cbz')` / `'.fb2'` as an alternative to the MIME. Passing `file.name`
    // through unchanged is therefore load-bearing — those two formats are recognized by extension
    // alone here.
    const bookFile = new File([bytes], file.name, { type: 'application/epub+zip' });
    const book = await foliateModule.makeBook(bookFile);
    hardenBookCopies(book); // before the first chapter: see reader/book-copies.ts
    const bookObj = book as {
      toc?: TocItem[];
      sections?: Array<{ id: string }>;
      metadata?: Record<string, unknown>;
      loadBlob?: (href: string) => Promise<Blob>;
      getCover?: () => Promise<Blob | null>;
    };
    const toc = bookObj.toc ?? [];
    this.bookSections = bookObj.sections ?? [];
    this.locIndex.buildSectionHrefMap();
    this.bookResources = bookObj.loadBlob
      ? (bookObj as { loadBlob: (href: string) => Promise<Blob>; getCover?: () => Promise<Blob | null> })
      : null;
    this.bookGetCover = bookObj.getCover ? bookObj.getCover.bind(bookObj) : null;
    this.totalBookSize = this.bookSections.reduce((sum, s) => sum + ((s as unknown as { size?: number }).size ?? 0), 0);
    const s0 = this.bookSections[0] as unknown;
    this.addDebugEntry(
      `bookSections:${this.bookSections.length} section[0] keys:${s0 ? Object.keys(s0).join(',') : 'none'}`,
      'index'
    );
    this.addDebugEntry(`spine loaded — sections:${this.bookSections.length}`, 'index');
    this.addDebugEntry(`toc loaded — items:${toc.length}`, 'index');
    const rawMeta = bookObj.metadata ?? {};
    const strMeta = (key: string): string => metadataText(rawMeta[key]);
    this.bookMeta = {
      title: strMeta('title'),
      author: strMeta('creator') || strMeta('author'),
      publisher: strMeta('publisher'),
      language: strMeta('language'),
      pubdate: strMeta('pubdate') || strMeta('date'),
      description: strMeta('description'),
    };
    return { book, toc };
  }

  private async cacheBookInfo(file: TFile, book: unknown, toc: TocItem[]): Promise<void> {
    try {
      const orbisPath = progressFilePath(file);
      let existing: Record<string, unknown> = {};
      if (await this.app.vault.adapter.exists(normalizePath(orbisPath))) {
        try {
          existing = JSON.parse(await this.app.vault.adapter.read(orbisPath)) as Record<string, unknown>;
        } catch {
          /* ignore malformed orbis data file */
        }
      }
      // Save title/author first so they're available even if cover extraction fails.
      const metaInfo: { title?: string; author?: string } = {};
      if (!existing.title && this.bookMeta.title) metaInfo.title = this.bookMeta.title;
      if (!existing.author && this.bookMeta.author) metaInfo.author = this.bookMeta.author;
      if (metaInfo.title || metaInfo.author) await saveBookInfo(this.app, file, metaInfo);
      // Cover extraction is tried separately so a failure here doesn't prevent the above save.
      if (!existing.coverImage) {
        try {
          const coverBlob = await (book as { getCover?: () => Promise<Blob | null> }).getCover?.();
          if (coverBlob) await saveBookInfo(this.app, file, { coverImage: await blobToDataUrl(coverBlob) });
        } catch {
          /* cover extraction non-critical */
        }
      }
      // Save TOC — use this.tocItems (set by buildCombinedPanel, which runs
      // synchronously after this IIFE starts). By the time we reach this point
      // (after multiple awaits) it is guaranteed to be populated.
      const existingToc = existing.toc as Array<Record<string, unknown>> | undefined;
      const tocNeedsUpdate =
        !existingToc || existingToc.length === 0 || (existingToc[0] && !('href' in existingToc[0]));
      if (tocNeedsUpdate && toc.length > 0) {
        try {
          const sections = this.bookSections;
          const isMobi = sections.length > 0 && typeof (sections[0] as { id?: unknown }).id === 'number';
          const baseName = (h: string) => h.split('#')[0].split('/').pop() ?? h;
          const sectionIdxForHref = (href: string | number | undefined): number => {
            if (typeof href === 'number') return href;
            if (typeof href !== 'string' || !href) return -1;
            const bn = baseName(href);
            const clean = href.split('#')[0];
            return sections.findIndex((s) => {
              const rawId = (s as { id?: unknown }).id;
              const sId = typeof rawId === 'string' ? rawId : typeof rawId === 'number' ? String(rawId) : '';
              return baseName(sId) === bn || sId === clean;
            });
          };
          const mapItem = (item: TocItem): TocEntry => {
            const rawHref = item.href ?? '';
            let cfi: string;
            if (isMobi) {
              cfi = rawHref;
            } else {
              const idx = sectionIdxForHref(rawHref);
              cfi = idx >= 0 ? `epubcfi(/6/${(idx + 1) * 2}!/4)` : '';
            }
            return {
              label: item.label ?? '',
              cfi,
              href: rawHref || undefined,
              subitems: item.subitems?.filter((s): s is TocItem => Boolean(s)).map(mapItem),
            };
          };
          await saveBookInfo(this.app, file, { toc: toc.map(mapItem) });
        } catch {
          /* toc save non-critical */
        }
      }
    } catch {
      /* non-critical */
    }
  }

  private createFoliateView(): FoliateViewEl {
    // See the tag map in reader/foliate-view.ts. The class is what styles.css selects it by: a selector on the
    // tag name is one the Community directory's CSS lint does not know.
    const view = this.filterWrapperEl!.createEl('foliate-view', { cls: 'orbis-foliate-view' });
    this.foliateView = view;
    this.annot.noteIcons.applyVisibility(); // set right offset and column visibility
    this.applyHostBg();
    return view;
  }

  /**
   * A link from one book to another, in a converted set — opened here rather than through the operating system.
   *
   * foliate treats anything with a scheme as external and, uncancelled, calls `globalThis.open(href)`. For an
   * `https://` link that is exactly right. For `obsidian://orbis-nav` it means leaving the app to ask the OS to
   * come back to it: a round trip through a protocol registration, out of a WebView, on a phone. Cancelling the
   * event and opening the file directly is the same destination with none of that, and it makes the link behave
   * like navigation — same tab, so Obsidian's back arrow returns to the book you came from.
   *
   * Only `file` is read. Nothing this plugin generates puts a position in one of these links: the target's CFIs
   * do not exist when the link is written.
   */
  private openBookLink(href: string): void {
    let path: string | null;
    try {
      path = new URL(href).searchParams.get('file');
    } catch (err) {
      this.addDebugEntry(`book link — unparseable ${href} (${String(err)})`, 'display');
      return;
    }
    if (!path) {
      this.addDebugEntry(`book link — no file parameter in ${href}`, 'display');
      return;
    }
    const target = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(target instanceof TFile)) {
      this.addDebugEntry(`book link — no file at ${path}`, 'display');
      new Notice(t('notices.book_not_found_path', { path }));
      return;
    }
    this.addDebugEntry(`book link — opening ${target.path}`, 'display');
    void this.leaf.openFile(target);
  }

  private wireRelocationEvents(view: FoliateViewEl): void {
    // Always cancelled, which is what stops foliate handing the URL to the system: a book link opens here, and any
    // other is shown first and opened only if the reader says — see `LinkCheck`.
    view.addEventListener('external-link', (e: Event) => {
      const detail = (e as CustomEvent).detail as { a?: Element; href_?: string } | undefined;
      /**
       * **The anchor's own attribute, not the resolved href.**
       *
       * foliate resolves every href through `resolveURL`, which does `obj.search = ''` — it deletes the query
       * string, deliberately, because inside an EPUB a `?` means nothing and calibre is known to add junk. So
       * `obsidian://orbis-nav?file=…` would arrive as `obsidian://orbis-nav` with the destination gone. The raw
       * attribute is the only place the whole URL still exists.
       *
       * It is also the string foliate itself would have opened (its `href_`), so the address the reader is shown
       * is the one that opens.
       */
      const href = detail?.a?.getAttribute('href') || detail?.href_ || '';
      // Logged for every external link, not just ours: "nothing happened" on a link is otherwise indistinguishable
      // from the event never firing, which is the one thing worth knowing first.
      this.addDebugEntry(`external-link — ${href.slice(0, 120)}`, 'display');
      e.preventDefault();
      if (readLinkAddress(href).kind === 'book') this.openBookLink(href);
      else this.linkCheck.show(href, detail?.a ?? null);
    });

    view.addEventListener('load', (e: Event) => {
      this.setLoadingStatus(t('loading_status.restoring_position'));
      const detail = (e as CustomEvent).detail as { doc?: Document; index?: number } | undefined;
      const doc = detail?.doc;
      const sIdx = detail?.index ?? 0;
      this.addDebugEntry(`load sIdx:${sIdx} doc:${!!doc} head:${!!doc?.head}`, 'display');
      if (doc) {
        // A moved pane's frame is reloaded by the browser, and ORBIS patch 12 shows the section again; logged.
        const reloaded = () => this.addDebugEntry(`frame reloaded by the browser — section ${sIdx}`, 'display');
        doc.defaultView?.frameElement?.addEventListener('load', reloaded, { once: true });
        // A re-rendered section is a NEW document, and the old one lingers in both maps unless it is taken out —
        // where it goes on answering lookups with a page that is no longer displayed.
        for (const [known, at] of this.docToSection) {
          if (known === doc || known.defaultView) continue;
          this.docToSection.delete(known);
          this.loadedDocs.delete(known);
          // And the annotation bar's per-document map, which answers exactly the kind of lookup this comment
          // warns about — left out, it grows one entry per section ever rendered.
          this.annot.forgetDoc(known);
          this.addDebugEntry(`dropped a detached document for section ${at}`, 'display');
        }
        this.loadedDocs.add(doc);
        this.docToSection.set(doc, sIdx);
        this.addDebugEntry(`load — loadedDocs now:${this.loadedDocs.size}`, 'display');
        // Before the display styles, so both read and rewrite the book's own CSS — see `tagBodyText`,
        // `scaleKeywordSizes`.
        scaleKeywordSizes(doc);
        tagBodyText(doc);
        keepPictureAspect(doc, (msg) => this.addDebugEntry(msg, 'display'));
        this.applyDocStyles(doc);
        this.annot.setupHighlightUI(doc, sIdx);
        this.linkPreview.setup(doc, sIdx);
        this.linkCheck.watch(doc);
        this.imageViewer.setup(doc);
        this.readerDom.installForDoc(doc);
        relayFrameFocus(doc, this.contentEl.win, (msg) => this.addDebugEntry(msg, 'display'));
        relayFramePress(doc, this.contentEl, (msg) => this.addDebugEntry(msg, 'display'));
        this.tts.onSectionLoaded(doc, sIdx);
      }
    });

    view.addEventListener('relocate', (e: Event) => {
      type RelocateDetail = {
        cfi?: string;
        fraction?: number;
        startFraction?: number; // ORBIS patch 16: the page's top; `fraction` is its end
        location?: { current?: number; total?: number };
        section?: { current?: number; total?: number };
        tocItem?: { label?: string; href?: string };
        range?: Range;
      };
      const detail = ((e as CustomEvent).detail ?? {}) as RelocateDetail;
      /**
       * **Read the system bar while the reader is just reading**, which is the only moment it can be read.
       *
       * `systemBarBelow` measures Obsidian's `.mobile-navbar`, and both a soft keyboard and focus mode itself
       * hide that element — so asking at the moment focus mode starts would ask exactly when the answer is
       * unavailable. A page turn is the opposite: frequent, and never in either of those
       * states. Costs one `querySelector` and one rect; the reading is discarded unless it is positive.
       */
      sampleSystemBar(activeWindow);
      const cfi: string = detail.cfi ?? '';
      if (detail.range) this.lastPageRange = detail.range;
      const fraction = detail.startFraction ?? detail.fraction; // the top of the page, as every location is read
      if (fraction != null) this.stats.setFraction(fraction);
      this.locIndex.maybeBuild(detail);
      if (detail.section?.current != null) {
        this.currentSectionIndex = detail.section.current;
        if (detail.section.total != null) {
          this.lastSection = { current: detail.section.current, total: detail.section.total };
        }
      }
      // Update lastCfi first so currentBookmark() and calibrateBookmarkLoc() see
      // the current page's CFI, not the previous one.
      if (cfi) this.lastCfi = cfi;
      if (detail.location?.current != null && detail.location?.total) {
        // The index's location for the top of the page, so the indicator shows the number a passage, a bookmark and
        // Go to location use. Foliate's own counts bytes from 0; until the index is up it stands in, from 1.
        const current = this.getLocForCfi(cfi) ?? detail.location.current + 1;
        this.lastLocation = { current, total: detail.location.total };
        // Record which CFI was current when this location was reported.
        // addBookmark() uses this to detect stale lastLocation (cfi drifted without
        // a new location event — foliate sometimes fires relocate with cfi but no location).
        this.lastLocationCfi = cfi;
        this.stats.recordWpmSample(current);
      }
      // If navigating to a bookmark via the saved panel, calibrate bm.loc and bm.exactCfi
      // now that foliate has reported its actual position for that CFI.
      this.bookmarkCtl.calibrateOnRelocate();
      // Refresh the Listen bar's voice chip when idle paging crosses a chapter (a mix's voice is
      // per-chapter). No-op while playing/paused (the audio position drives the chip then).
      this.tts.onReaderRelocated();
      // Post-navigation correction for annotation panel taps on mobile.
      // Step 1 (CFI): compare annotation start against the page-end CFI.
      // Step 2 (text sanity): if CFI says we're on the right page, confirm the
      // annotation's opening text is actually visible. Catches the edge case where
      // the page boundary falls mid-text-node and CFI comparison gives a false pass.
      // At most one next() call is ever needed — the accumulated column error is
      // always < size, so navigation can only undershoot by exactly one page.
      const pendingTarget = this.navSuppressor.takePendingTarget();
      if (pendingTarget) {
        const { cfiRange: annotCfi } = pendingTarget;
        let correction: 'advance' | 'retreat' | null = null;
        this.addDebugEntry(`annot-nav: relocate — running CFI checks`, 'annot-nav');

        if (cfi) {
          try {
            const annotStart = cfiCollapse(annotCfi, false);
            const pageEnd = cfiCollapse(cfi, true);
            // Only correct for undershoots (annotation clearly past the page end).
            // Math.floor in #scrollToRect cannot genuinely overshoot — all LTR column
            // text starts at rect.left ≈ K×size, so Math.floor always maps to K.
            // "beforeStart" misfires for annotations whose first character sits in the
            // sub-pixel gap that getVisibleRange's bisect leaves at the column edge;
            // retreating in that case sends the user to the wrong column.
            const pastEnd = cfiCompare(annotStart, pageEnd) > 0;
            this.addDebugEntry(`annot-nav: pastEnd:${pastEnd}`, 'annot-nav');
            if (pastEnd) correction = 'advance';
          } catch (err) {
            this.addDebugEntry(`annot-nav: CFI check error — ${String(err)}`, 'annot-nav');
          }
        } else {
          this.addDebugEntry('annot-nav: CFI check skipped — no page cfi', 'annot-nav');
        }

        this.addDebugEntry(`annot-nav: correction:${correction ?? 'none'}`, 'annot-nav');
        if (correction === 'advance') {
          this.navSuppressor.markPostNav();
          void this.foliateView?.next();
        }
        // Clear the suppressor in a setTimeout(0) macrotask rather than immediately or
        // via rAF. focusView() fires focusin in a microtask after this relocate; the
        // paginator's focusin handler would schedule rAF(#scrollToAnchor) which navigates
        // to the wrong page. We need the suppressor active when that focusin fires.
        // Using rAF was insufficient: in Electron's renderer, rAFs can fire before pending
        // microtasks at certain async boundaries, clearing the suppressor too early.
        // setTimeout(0) always fires in a new macrotask, which is after all microtasks
        // (including focusView's focusin) drain, guaranteeing safe cleanup timing.
        this.navSuppressor.scheduleClear(() => {
          const _stRen = this.foliateView?.renderer as unknown as { containerPosition?: number };
          this.addDebugEntry(
            `annot-nav: suppressor cleared (setTimeout) cp:${(_stRen?.containerPosition ?? -1).toFixed(0)}`,
            'annot-nav'
          );
        });
        {
          const _prRen = this.foliateView?.renderer as unknown as { containerPosition?: number; size?: number };
          const _prCp = _prRen?.containerPosition ?? -1;
          const _prSz = _prRen?.size ?? 0;
          this.addDebugEntry(
            `annot-nav: post-reloc cp:${_prCp.toFixed(0)} sz:${_prSz.toFixed(0)} page:${_prSz > 0 ? Math.round(_prCp / _prSz) : '?'}`,
            'annot-nav'
          );
        }
      }
      if (this.navSuppressor.takePostNav()) {
        this.addDebugEntry(
          `annot-nav: post-correction relocate frac:${detail.fraction?.toFixed(3)} cfi:${cfi.slice(0, 50)}`,
          'annot-nav'
        );
      }
      this.addDebugEntry(
        `relocate section:${detail.section?.current}/${detail.section?.total} loc:${detail.location?.current}/${detail.location?.total} frac:${detail.fraction?.toFixed(3)}`,
        'relocate'
      );
      const newTocHref = detail.tocItem?.href ?? '';
      const chapterChanged = newTocHref !== this.tocItemHref;
      if (chapterChanged) this.tocItemHref = newTocHref;
      // Calibrate tocStartFractions so chapter % and page counts are accurate.
      this.locIndex.calibrateChapter(newTocHref, detail);
      if (detail.tocItem?.label) this.currentTocLabel = detail.tocItem.label;
      this.stats.updateLocLabel();
      this.panels.updateTocActive(detail.tocItem?.href);
      this.bookmarkCtl.updateBtn();
      this.annot.noteIcons.relocated();

      // A user content-panel navigation just landed — resync the audio player to it. Runs here,
      // after tocItemHref/currentTocLabel/currentSectionIndex are all refreshed above, so the
      // player's position AND chapter label reflect the new spot. Clear the flag BEFORE syncing:
      // the sync re-pages the view (scrollToAnchor), which fires a synchronous relocate that would
      // otherwise re-enter here while the flag is still set and recurse. A cross-section jump fires
      // several relocates before the target renders, so re-arm the flag if the sync isn't ready yet.
      if (this.userNavPending) {
        this.userNavPending = false;
        const target = this.userNavTargetCfi;
        this.userNavTargetCfi = null;
        // On the `tts` channel, not `relocate`: this is the seam where a navigation reaches the player, and
        // the flag survives relocates when the target isn't rendered yet — so a nav that never resolved can
        // be spent on an unrelated relocate later. Reading it next to the transport lines is what makes that
        // visible instead of inferred.
        this.addDebugEntry(`user-nav consumed target=${target?.slice(0, 40) ?? 'page-top'}`, 'tts');
        if (!this.tts.onUserNavigated(target)) {
          this.userNavPending = true;
          this.userNavTargetCfi = target;
          this.addDebugEntry('user-nav re-armed — destination not resolvable yet', 'tts');
        }
      }

      // While listening plays, the sentence being read is the place (`TtsController.syncToSentence`); the page
      // turned to follow it would save the top of that page instead. Paused or stopped, the page is the place again.
      if (!this.tts.isPlaying()) this.persistLocation(cfi);
    });
  }

  private wireAnnotationEvents(view: FoliateViewEl): void {
    // draw-annotation: dispatch to the note owner first, then search, then the
    // default highlight draw. Order matters — notes and search hits ride the same
    // overlay path and must claim the draw before the plain-highlight fallback.
    view.addEventListener('draw-annotation', (e: Event) => {
      const d = (e as CustomEvent).detail as {
        draw: (fn: typeof Overlayer.highlight, opts: unknown) => void;
        annotation: { value: string; color?: string };
        range: Range;
      };
      if (this.annot.tryDrawNote(d)) return;
      if (this.search.tryDrawHit(d)) return;
      this.annot.drawDefaultHighlight(d);
    });
    // show-annotation: user clicked/tapped a highlight or note.
    view.addEventListener('show-annotation', (e: Event) => {
      const { value, range } = (e as CustomEvent).detail as { value: string; range: Range };
      this.annot.handleShowAnnotation(value, range);
    });
    // create-overlay: section overlayer just created — re-apply saved annotations
    // (highlights + notes first, then search hits) onto the fresh overlay.
    view.addEventListener('create-overlay', () => {
      this.annot.reapplyAnnotations(view);
      this.search.reapplyAnnotations(view);
      this.tts.reapplyHighlight(view);
    });
  }

  private async openBookWithSync(view: FoliateViewEl, book: unknown, file: TFile): Promise<void> {
    this.setLoadingStatus(t('loading_status.6_6_opening_book'));
    const savedCfi = await readSavedLocation(this.app, file);
    this.lastSavedCfi = savedCfi ?? null;
    this.addDebugEntry(`sync read own — cfi:${savedCfi?.slice(0, 40) ?? 'none'}`, 'sync');

    // Read other device files BEFORE writing our own, so timestamps reflect actual read times.
    // writeLocationOnOpen is deferred until after the sync dialog resolves (or immediately if
    // no dialog is shown), ensuring our device doesn't falsely appear most-recently-accessed.
    const syncEnabled = !isolatedHere(this.app);
    const syncOwnId = syncEnabled ? getOrCreateDeviceId(this.app) : '';

    let stamped = false;
    const stampOnce = () => {
      if (stamped) return;
      stamped = true;
      void writeLocationOnOpen(this.app, file);
      this.addDebugEntry('sync write — stamped lastOpened', 'sync');
    };

    // Build the list shown in the modal: all non-isolated devices with a saved location,
    // sorted by lastOpened desc (readAllDeviceLocations already returns this order).
    const buildModalList = (all: DeviceLocationRecord[]): DeviceLocationRecord[] =>
      all.filter((d) => !!d.location && (d.deviceId === syncOwnId || !d.isolated));

    // Trigger is purely timestamp-based: show the modal if any other device was accessed
    // more recently than the last time this device saved its location for this book.
    const hasNewerDevice = (all: DeviceLocationRecord[], ownPreviousLastOpened: number): boolean =>
      all.some((d) => d.deviceId !== syncOwnId && !d.isolated && d.lastOpened > ownPreviousLastOpened);

    // Pre-load the locations cache so the modal can show locations before the live index is
    // ready (the live index requires the first relocate event, which fires after view.open).
    const locsCache = await readLocsCache(this.app, file);
    const cachedStarts = locsCache ? locStartsOf(locsCache.locNavCache) : [];
    const modalLocResolver = (cfi: string): number | null =>
      this.locIndex.isReady ? this.getLocForCfi(cfi) : locAtCfi(cachedStarts, cfi);

    const showDeviceModal = (devices: DeviceLocationRecord[]) => {
      new DeviceLocationsModal(
        this,
        devices,
        modalLocResolver,
        (cfi) => this.navigateToCfi(cfi),
        syncOwnId,
        stampOnce
      ).open();
    };

    /**
     * Ask, but not over the top of something else.
     *
     * **This prompt arrives at a moment the reader did not choose.** It fires when a book opens and another device
     * is further along — including when the book reopens by itself, which is every app reload. Reloading the app
     * is also how a plugin update is applied — on a phone the reader restores behind the settings window, the book
     * opens, and the dialog would land on top of Settings.
     *
     * Waiting is the whole answer. `dialogIsOpen` is the same test the reading-records prompt uses, retried on the
     * same shape of capped timer — one question deferred is one question asked later, and this one is worth
     * asking, so the wait is generous.
     *
     * **Giving up stamps.** `stampOnce` is deliberately withheld until the reader answers, because writing this
     * device's `lastOpened` first would erase the comparison the prompt is based on. But a reader who leaves a
     * dialog open for two minutes should not also lose their position from the other devices' view, so the offer
     * expires and the stamp happens anyway. The offer returns next time the book is opened, because nothing
     * durable was recorded about having asked.
     */
    let deviceTries = 0;
    const openDeviceModal = (devices: DeviceLocationRecord[]) => {
      if (!dialogIsOpen() && !this.playerBusy()) {
        showDeviceModal(devices);
        return;
      }
      if (++deviceTries > DEVICE_PROMPT_MAX_TRIES) {
        this.addDebugEntry('sync prompt dropped — something stayed on screen; stamping instead', 'sync');
        stampOnce();
        return;
      }
      this.addDebugEntry(`sync prompt deferred — a dialog is up (try ${deviceTries})`, 'sync');
      window.setTimeout(() => {
        // The book may have been closed or swapped while we waited; the prompt belongs to the file that opened.
        if (this.currentFile?.path === file.path) openDeviceModal(devices);
      }, DEVICE_PROMPT_RETRY_MS);
    };

    let devicesForModal: DeviceLocationRecord[] = [];
    let ownPreviousLastOpened = 0;
    if (syncEnabled) {
      const all = await readAllDeviceLocations(this.app, file);
      ownPreviousLastOpened = all.find((d) => d.deviceId === syncOwnId)?.lastOpened ?? 0;
      if (hasNewerDevice(all, ownPreviousLastOpened)) devicesForModal = buildModalList(all);
      this.addDebugEntry(
        `sync other devices — count:${all.length} ownTs:${ownPreviousLastOpened} show-modal:${devicesForModal.length}`,
        'sync'
      );
    }

    await view.open(book);
    this.readerDom.installSelectionLock(); // paginator.js is now loaded; safe to patch
    this.annot.noteIcons.follow(view.renderer); // the renderer exists only now
    this.addDebugEntry(`resume: init lastLocation cfi=${savedCfi?.slice(0, 56) ?? 'none'}`, 'relocate');
    this.openedAtCfi = savedCfi ?? null;
    await view.init({ lastLocation: savedCfi, showTextStart: !savedCfi });
    this.setLoadingStatus(t('loading_status.loading_content'));
    this.addDebugEntry(`open() returned children:${view.children.length}`, 'index');

    if (devicesForModal.length > 0) {
      // Sync dialog: stamp after user dismisses or selects.
      this.addDebugEntry(`sync prompt shown — devices:${devicesForModal.length}`, 'sync');
      openDeviceModal(devicesForModal);
    } else {
      // No immediate dialog. Stamp now and also run a deferred check in case sync delivers
      // other devices' files a few seconds after the book opens (common on mobile).
      stampOnce();
      if (syncEnabled) {
        window.setTimeout(async () => {
          if (!this.currentFile || this.currentFile.path !== file.path) return;
          const all = await readAllDeviceLocations(this.app, this.currentFile);
          if (!hasNewerDevice(all, ownPreviousLastOpened)) return;
          const deferred = buildModalList(all);
          this.addDebugEntry(`sync deferred prompt — devices:${deferred.length}`, 'sync');
          openDeviceModal(deferred);
        }, 5000);
      }
    }
  }

  private buildHistoryNav(view: FoliateViewEl): void {
    // Floating back/forward buttons — the pair appears only once some
    // in-session history exists (either direction). Once shown, each
    // button keeps its own fixed slot — hidden via visibility (which
    // preserves its layout box) rather than removed via display — so
    // neither button's screen position ever shifts depending on whether
    // the other is currently usable. Without this, e.g. back disappearing
    // at the start of history would slide forward into back's old spot,
    // and a reflexive repeat-click aimed at back would land on forward.
    // Grouped in one wrapper so they position and hide as a pair.
    // Must be inside filterWrapperEl so it shares the same stacking context
    // as the debug overlay; the wrapper creates a stacking context when a
    // CSS filter (brightness) is active, which would cause a host-level
    // z-index:100 element to paint over the wrapper's z-index:9000 overlay.
    const historyNavEl = this.filterWrapperEl!.createDiv({ cls: 'orbis-history-nav' });
    this.historyNavEl = historyNavEl;
    const backBtn = historyNavEl.createEl('button', {
      cls: 'orbis-back',
      text: '←',
      attr: { 'aria-label': t('command_palette.go_back') },
    });
    const forwardBtn = historyNavEl.createEl('button', {
      cls: 'orbis-forward',
      text: '→',
      attr: { 'aria-label': t('command_palette.go_forward') },
    });
    const setSlotVisible = (btn: HTMLButtonElement, visible: boolean) => {
      btn.style.visibility = visible ? 'visible' : 'hidden';
      btn.tabIndex = visible ? 0 : -1;
    };
    const updateHistoryNavBtns = () => {
      const canBack = !!view.history?.canGoBack;
      const canForward = !!view.history?.canGoForward;
      historyNavEl.toggle(canBack || canForward);
      setSlotVisible(backBtn, canBack);
      setSlotVisible(forwardBtn, canForward);
    };
    updateHistoryNavBtns();
    // Logged, with where the book was: a back button that appears with no jump behind it is otherwise untraceable.
    view.history.addEventListener('index-change', () => {
      updateHistoryNavBtns();
      this.addDebugEntry(`history changed — back:${!!view.history?.canGoBack} at ${this.lastCfi ?? '?'}`, 'nav');
    });
    // Mark as a user navigation so the ensuing relocate re-seats the audio player to the landing
    // spot (same path as chapter/bookmark/search jumps) — history jumps are coarse, so sync to the
    // page top (no precise target CFI).
    backBtn.addEventListener('click', () => {
      this.markUserNavigation();
      view.history?.back();
      this.focusReader();
    });
    forwardBtn.addEventListener('click', () => {
      this.markUserNavigation();
      view.history?.forward();
      this.focusReader();
    });
  }

  private installReactiveSettingsSync(): void {
    // Follow Obsidian's light/dark flips in this reader's own window. Through `observeTheme` rather than a raw
    // observer on body's class attribute — see that module for why watching the attribute wholesale would pause the
    // audio player every time the full-screen player opens.
    this.themeObserver = observeTheme(this.contentEl.doc.body, (theme) => {
      this.refreshTheme(`Obsidian switched to ${theme}`);
    });

    // **The rest once per view, not once per book**, as `keysInstalled` is: `registerEvent` lives as long as the view,
    // so the second book opened in a tab applied every display change twice. Each listener reads the book it finds.
    if (this.viewListenersInstalled) return;
    this.viewListenersInstalled = true;

    // And everything else that can move an Obsidian theme's note colors: another theme, a theme's own options, a
    // snippet. Only a book matching Obsidian's theme moves with them — `refreshTheme` compares before it repaints.
    this.registerEvent(this.app.workspace.on('css-change', () => this.refreshTheme('Obsidian styles changed')));

    // Listen for device-specific setting changes dispatched by the settings tab.
    const onStorage = (key: string, newValue: string | null) => {
      if (key === DISPLAY_STYLE_APPLIED) {
        // A whole display style at once: read every value, then lay out, restyle and repaint once each.
        this.settings = loadSettings(this.app, this.plugin.settings);
        this.applyRenderer();
        this.applyToolbarVisibility();
        this.reinjectAllDocs();
        this.applyHostBg();
      } else if (key === STORAGE_KEY_FONT_SIZE) {
        this.settings.fontSize = parseInt(newValue ?? '100');
        this.reinjectAllDocs();
      } else if (key === STORAGE_KEY_BRIGHTNESS) {
        this.settings.brightness = parseInt(newValue ?? '100');
        this.applyHostBg();
      } else if (key === STORAGE_KEY_MARGINS) {
        this.settings.margins = parseInt(newValue ?? '4');
        this.applyRenderer();
      } else if (key === STORAGE_KEY_LINE_HEIGHT) {
        this.settings.lineHeight = parseFloat(newValue ?? '1.5');
        this.reinjectAllDocs();
      } else if (key === STORAGE_KEY_TEXT_ALIGN) {
        this.settings.textAlign = parseTextAlign(newValue);
        this.reinjectAllDocs();
      } else if (key === STORAGE_KEY_HYPHENATION) {
        this.settings.hyphenation = parseHyphenation(newValue);
        this.reinjectAllDocs();
      } else if (key === STORAGE_KEY_THEME) {
        this.settings.theme = newValue ?? MATCH_OBSIDIAN_MODE;
        this.reinjectAllDocs();
        this.applyHostBg();
      } else if (key === STORAGE_KEY_FONT_FAMILY) {
        this.settings.fontFamily = newValue ?? 'default';
        this.reinjectAllDocs();
      } else if (key === STORAGE_KEY_FLOW) {
        this.settings.flow = (newValue ?? 'paginated') as Flow;
        this.applyRenderer();
        this.applyToolbarVisibility();
      } else if (key === STORAGE_KEY_COLUMNS) {
        this.settings.columns = parseInt(newValue ?? '2') as 1 | 2;
        this.applyRenderer();
      } else {
        return;
      }
      // Keep the Display Style toolbar's controls in sync if it's already open
      // when the change originates elsewhere (e.g. the plugin Settings tab).
      this.syncDisplayMenu?.();
    };
    // @ts-expect-error -- custom events are not typed in Obsidian's Workspace definition
    this.registerEvent(this.app.workspace.on('orbis:settings-change', onStorage));

    /**
     * **The annotation bar does not outlive the tab it belongs to.**
     *
     * It is parented to `document.body` — deliberately, so the book iframe's `position: fixed` quirks cannot move
     * it — which means it belongs to no leaf and nothing takes it down when one is left. Jump to a highlight from
     * the `.orbis` view, switch back to that view, and the bar would still be floating over it, offering to recolour a
     * passage on a page that is no longer on screen.
     *
     * The selection goes with it, through the method that already exists for "this UI must not outlive its
     * context". Keeping the selection while hiding its bar would leave a state with no affordance: a passage that
     * still looks selected and nothing to do with it.
     */
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        // **Only a view with something showing does any work.** This fires on every tab switch, in every open
        // book, and the clear below asks each of the book's documents for its selection — which can force that
        // document to lay itself out. Unguarded, switching tabs with several books open would pay that cost for all
        // of them, every time. A book with no bar up has nothing to put away.
        if (leaf !== this.leaf && this.annot.hasAnnotationUI()) this.clearActiveSelectionAndAnnotationUI();
      })
    );

    // The book's .orbis was written — by a save here, another view of it, or another device — see `watchBookChanges`.
    watchBookChanges(this, async () => {
      const file = this.currentFile;
      if (!file) return;
      await this.annot.reload(file);
      // A cleared book has no preset: it gets the default, as a book opened for the first time does.
      if (!this.annot.presetId) await this.ensureBookAnnotationPreset();
      await this.bookmarkCtl.reload();
      this.stats.loadReadingStats((await readReadingStats(this.app, file))?.wpmSamples ?? []);
      this.refreshSavedPanelIfOpen();
    });
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.teardownForNewFile(file);
    this.buildToolbar();
    this.buildSearchBar();
    this.buildReaderHost();

    /**
     * Opened a particular way — Library → headphones, a `listen` link, the command, and in time a converted
     * note. The page is kept out of sight until the mode is applied: for listening it is on its way to being
     * covered by the full player, and painting it and hiding it a moment later reads as a flash of a blank
     * book; for focus mode it would otherwise show the ordinary chrome for a frame and then rearrange.
     * Visibility only — the book still lays out, so pagination and the position the audio homes to are exactly
     * what they would have been.
     */
    /**
     * **A pending request wins; otherwise the reader's standing answer applies.**
     *
     * Three rules, and no merging of one into the other. A control that names a mode — the Library's headphones,
     * a `listen=1` link — left a record here, and an instruction beats a preference. *Read in Orbis Reader* left
     * one too, from its own settings or the base ones when it is set to follow. Everything else is a plain open,
     * and gets what the reader said any book should do: a click in the file explorer, a link, a workspace
     * restoring three books at startup.
     */
    const intent = pendingIntents.get(file.path) ?? baseOpenIntent();
    pendingIntents.delete(file.path);
    const maskWhileOpening = intent?.mode === 'listen' || intent?.mode === 'focus';
    if (maskWhileOpening) this.filterWrapperEl?.addClass('orbis-open-pending');

    const onUnhandled = (e: PromiseRejectionEvent) => {
      console.error('[Orbis] unhandled rejection:', e.reason);
    };
    // Once per view, like the listeners `installReactiveSettingsSync` registers, which sets the flag below.
    if (!this.viewListenersInstalled) this.registerDomEvent(activeWindow, 'unhandledrejection', onUnhandled);

    // Only when this is the pane the reader is actually looking at: a book opening in a background leaf must not
    // pull the keyboard out of whatever they are typing in.
    if (this.app.workspace.getActiveViewOfType(OrbisReaderView) === this) this.hostEl?.focus({ preventScroll: true });

    /**
     * **Offer multi-device setup, once, to a device that would otherwise never hear about it.**
     *
     * With the master switch defaulting off, a second device never prompts you to resume from the first — so this
     * stands in its place, at the same moment: a book opening, which is when the resume prompt would come.
     *
     * Any book, not one this vault has another position for: whether the OTHER devices read THIS book is
     * incidental. What matters is that the vault is used on more than one, which is a fact about the vault.
     *
     * Deliberately not awaited — the book has a page to lay out, and a dialog is not on its critical path.
     */
    void this.plugin.offerFirstRun();

    try {
      const { book, toc } = await this.loadBookAndMetadata(file);
      // Before the first page: the location index's build starts on it, and an empty list measures no chapter starts.
      this.tocItems = toc;

      // Cache cover image + metadata in .orbis file (non-blocking — errors are silently ignored).
      void this.cacheBookInfo(file, book, toc);

      this.setLoadingStatus(t('loading_status.5_6_starting_reader'));
      const view = this.createFoliateView();
      this.wireRelocationEvents(view);

      // Load highlights and register annotation events BEFORE view.open() so that
      // create-overlay already has data when the first section's overlayer is created.
      await this.annot.load(file);
      await this.ensureBookAnnotationPreset();
      await this.bookmarkCtl.load();
      // Before the first annotation can be made, since creating one consults it. Null when this book has never
      // been asked, which is what makes the global default apply.
      await this.recordsCtl.onBookLoaded(file);
      const readingStats = await readReadingStats(this.app, file);
      this.stats.loadReadingStats(readingStats?.wpmSamples ?? []);
      this.wireAnnotationEvents(view);

      await this.openBookWithSync(view, book, file);

      // Apply renderer attributes now that the renderer element exists
      this.applyRenderer();

      // Build combined Contents / Search / Saved / Backlinks panel
      this.tocItems = toc;
      // Which file each entry is in, once, for every surface that decides what a chapter is — see `containsChapters`.
      markTocSections(this.tocItems, (href) => this.hrefToSectionIndex(href));
      this.panels.build(this.hostEl!, toc, this.tocItemHref);
      this.tocBtn?.addEventListener('click', () => (this.panels.isOpen ? this.closePanel() : this.openPanel()));

      // Pre-scan backlinks in background so they're ready when the tab is opened
      this.panels.schedulePreScan();

      // One silent pass over this book's records, if it has them. This is what heals a book whose FILE was
      // renamed or moved while it was closed: the records themselves follow the book immediately (the rename
      // handler in main.ts), but each record's `link` and `link_url` embed the old path in an `obsidian://`
      // URL, and nothing but an export rebuilds those. Cheap enough to do unconditionally — `frontmatterMatches`
      // compares against the metadata cache, so a book with nothing stale writes nothing at all.
      //
      // Deliberately gated on `active` rather than going through recordsChanged() wholesale: an undecided book
      // in `ask` mode must be prompted by a SAVE, not by being opened.
      if (this.recordsCtl.records().active) this.recordsChanged();

      this.prevBtn!.addEventListener('click', () => {
        if (this.settings.flow === 'scrolled') this.prevSection();
        else void this.foliateView?.prev();
      });
      this.nextBtn!.addEventListener('click', () => {
        if (this.settings.flow === 'scrolled') this.nextSection();
        else void this.foliateView?.next();
      });

      this.buildHistoryNav(view);
      this.installReactiveSettingsSync();

      // After the history nav, which the player hides: entering listen mode before it was built would leave it
      // floating over the player. The mask comes off either way — a book that could not take the mode it was
      // asked for has to be readable, not invisible.
      if (intent) this.applyOpenIntent(intent);
      this.filterWrapperEl?.removeClass('orbis-open-pending');
    } catch (err) {
      this.filterWrapperEl?.removeClass('orbis-open-pending'); // a book that failed to open must not stay hidden
      // In the reader's words, not the engine's — see `describeOpenFailure`. The engine's go to the debug log.
      const msg = describeOpenFailure(err, file.extension);
      this.debug(`open failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`, 'index');
      new Notice(t('notices.orbis_reader_error_msg', { msg }));
      this.setLoadingStatus(t('loading_status.error_msg', { msg }));
      // In place of the reader, too: the notice fades, a blank page says nothing, and a toolbar over no book offers
      // controls with nothing to act on — on a phone, with the chip's message written across them.
      this.contentEl.addClass('orbis-open-failed');
      this.contentEl.createDiv({ cls: 'orbis-open-error', text: t('notices.orbis_reader_error_msg', { msg }) });
      console.error('[Orbis]', err);
    }
  }

  onunload(): void {
    if (this.focusMode) this.focus.toggle();
    this.panels.dispose();
    this.search.forgetAnnotations();
    this.flushPendingSave();
    // Before `annot.dispose` empties the lists the pass reads — and then nothing may fire on a closed book.
    this.recordsCtl.flush();
    this.recordsCtl.dispose();
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    this.linkPreview.dispose();
    this.linkCheck.dispose();
    this.imageViewer.dispose();
    this.annot.dispose();
    this.tts.dispose();
    this.goToBar?.dispose();
    this.goToBar = null;
    this.goToInputEl = null;
    this.goToHintEl = null;
    this.foliateView?.close?.();
    this.foliateView = null;
  }
}

// ── Opening a book from elsewhere ────────────────────────────────────────────
// The Library and the `orbis-nav` deep link both need "open this book, maybe start listening", and both need it
// to survive the book not being rendered yet. Kept here, beside the view they drive, so neither caller reinvents
// the retry.

/** The open reader tab showing this book, if there is one. */
function readerLeafFor(app: App, path: string): WorkspaceLeaf | null {
  return (
    app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS).find((l) => (l.view as OrbisReaderView).file?.path === path) ?? null
  );
}

/** How a book should look the moment it opens. Every field is optional: an absent one means "whatever the
 *  reader would do anyway", which is what makes this safe to hand round half-filled. */
export interface BookOpenIntent {
  /** `listen` is the full-screen player, `focus` is focus mode, `standard` is the plain reader. */
  mode?: 'standard' | 'focus' | 'listen';
  /** Which secondary bar opens with the book. `none` opens none. */
  bar?: 'listen' | 'search' | 'none';
}

/**
 * Books asked to open a particular way, by path, consumed as each one loads.
 *
 * **A module-level note rather than an argument, because the view does not exist when the request is made** —
 * `openFile` is what creates it. Consumed once, in `onLoadFile`, so a book that never opens leaves nothing
 * behind.
 *
 * **One record rather than a set per thing.** A `Set<string>` per mode would put one collection beside another,
 * and two collections describing the same book, read at the same moment, is how they come to disagree — and the
 * disagreement would be silent, because each would be right about its own half. One record, one read, one delete.
 *
 * It matters that this is applied BEFORE the page paints rather than after: `setReaderTopSpace` reserves a bar's
 * height in focus mode, so a bar arriving late reflows the book under the reader.
 */
const pendingIntents = new Map<string, BookOpenIntent>();

/** How this device says any book should open, when nothing asked for something else — Settings → Reading
 *  behavior → Opening a book. Read at each open rather than cached: it is a setting, and settings change. */
export function baseOpenIntent(): BookOpenIntent {
  return { mode: deviceSetting('openBookMode'), bar: deviceSetting('openBookBar') };
}

/** Open a book in the reader, reusing its tab when it is already open rather than stacking duplicates. */
export async function openBookForReading(app: App, file: TFile): Promise<void> {
  const existing = readerLeafFor(app, file.path);
  if (existing) {
    app.workspace.setActiveLeaf(existing, { focus: true });
    return;
  }
  await app.workspace.getLeaf(false).openFile(file);
}

/** Where in a book to land: a CFI, a chapter's href, a location number, or a percentage through. */
export interface BookDestination {
  cfi?: string | null;
  href?: string | null;
  loc?: number | null;
  pct?: number | null;
}

/**
 * Open a book and navigate to a place in it, waiting for the reader to be able to go there.
 *
 * **The retry is the whole reason this exists.** A book that has just been opened has no rendered document yet, so
 * the navigation call has nothing to act on and answers `false`; a fresh reader on a phone can take a second or two.
 * Both callers — the `orbis-nav` deep link and a reading record's row in the Library — hit exactly that, and the
 * Library one arrives from a tap, where nothing happening is indistinguishable from a broken row.
 *
 * Nothing to go to means nothing to wait for: with an empty destination this is `openBookForReading`.
 */
export async function openBookAt(app: App, file: TFile, to: BookDestination): Promise<void> {
  await openBookForReading(app, file);
  navigateWhenReady(app, file.path, to);
}

/**
 * Ask the view to go there, and keep asking while it cannot yet.
 *
 * **The one copy of this wait.** Three places open a book at a place — the `orbis-nav` deep link, a reading record's
 * row in the Library, and a highlight, note or bookmark in the book's own data view — and a retry of its own in any
 * one of them, with its own interval, its own patience and its own idea of what to do on arrival, is how a flash
 * added to two of them would be missing from the third.
 *
 * Exported for the deep-link handler, which has already opened or revealed the leaf itself — it reveals an existing
 * tab rather than opening the file again, and would otherwise have to duplicate the retry to keep that.
 *
 * `onGiveUp` is for a caller that would rather say so than fail silently: the data view tells the reader its book
 * would not open, and a shared wait should not lose that.
 */
export function navigateWhenReady(
  app: App,
  path: string,
  to: BookDestination,
  opts: { onGiveUp?: () => void } = {},
  attempts = 0
): void {
  const { cfi, href, loc, pct } = to;
  if (!cfi && !href && (loc === null || loc === undefined) && (pct === null || pct === undefined)) return;
  const view = readerLeafFor(app, path)?.view as OrbisReaderView | undefined;
  const dispatched = !view
    ? false
    : cfi
      ? view.navigateToCfi(cfi)
      : href
        ? view.navigateToHref(href)
        : pct !== null && pct !== undefined
          ? view.goToFraction(pct / 100)
          : view.navigateToLoc(loc as number);
  const toFlash = flashTarget(to);
  if (dispatched && toFlash && view) {
    /**
     * **Arriving from outside flashes, exactly as a search hit does.**
     *
     * Only for a CFI: a flash outlines a range, and `href`, `loc` and `pct` name a chapter or a place on a page with
     * no passage in them to draw. Flashing a whole chapter would be noise, so those arrive unmarked — the honest
     * limit rather than an approximation.
     *
     * Outlined, and in the search color, for the reason search picked it: what you are usually landing on is a
     * highlight, and a translucent fill over an already-colored selection barely reads. The color is deliberately
     * not the annotation's own — this has a CFI, not an annotation, and a link into the middle of a chapter has no
     * annotation to ask.
     *
     * **Fired on the request, not on a relocate.** A link to where you already are moves nothing, and the reader who
     * clicked it is owed an answer all the same: "here" is what they asked to be shown.
     */
    view.flashAnchor(toFlash, LANDING_FLASH_COLOR, true);
  }
  if (!dispatched) {
    if (attempts < 25) window.setTimeout(() => navigateWhenReady(app, path, to, opts, attempts + 1), 200);
    else opts.onGiveUp?.();
  }
}

/**
 * Open a book and start listening as soon as the reader can.
 *
 * The Library's headphones, the `listen` deep link and the palette command all arrive here. This is one line over
 * `openBookWith`, the same machinery generalized to carry a mode and a bar rather than only the fact of listening.
 */
export async function startListeningTo(app: App, file: TFile): Promise<void> {
  await openBookWith(app, file, { mode: 'listen' });
}

/**
 * Open a book and put the reader into the state the caller asked for.
 *
 * **Two mechanisms, because there are two cases.**
 * A book that has to be opened is told BEFORE it loads how it should look, so it can keep its page out of sight
 * while it renders and arrive in that state, with no poll interval and no flash of a page about to be covered.
 * A book already open has no load to hook, so it is asked directly; the retry covers a reader still coming up,
 * and asking twice is harmless because `applyOpenIntent` is idempotent by construction.
 *
 * The retry runs in both cases, including the one where `onLoadFile` has already applied the intent. That is
 * deliberate: it costs one no-op call and removes the need to know which case happened.
 */
export async function openBookWith(app: App, file: TFile, intent: BookOpenIntent): Promise<void> {
  if (!readerLeafFor(app, file.path)) pendingIntents.set(file.path, intent);
  await openBookForReading(app, file);
  const attempt = (n: number): void => {
    const view = readerLeafFor(app, file.path)?.view as OrbisReaderView | undefined;
    if (view?.applyOpenIntent(intent)) return;
    if (n < 25) window.setTimeout(() => attempt(n + 1), 200);
  };
  attempt(0);
}
