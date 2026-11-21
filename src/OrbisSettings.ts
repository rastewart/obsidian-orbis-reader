import {
  App,
  ButtonComponent,
  DropdownComponent,
  ExtraButtonComponent,
  Notice,
  PluginSettingTab,
  Setting,
  type SettingDefinition,
  type SettingDefinitionItem,
  type SettingDefinitionPage,
  type SettingDefinitionRender,
  SettingPage,
  setIcon,
  TextComponent,
  ToggleComponent,
} from 'obsidian';
import { openAnnotationPresets } from './AnnotationPresetsModal';
import { BookSourceModal } from './BookSourceModal';
import { openBookSourcesSetupDialog } from './BookSourcesSetupModal';
import { byName } from './by-name';
import { openCatalogReview } from './CatalogModal';
import { CollectionModal } from './CollectionModal';
import { confirmThen } from './ConfirmModal';
import { DestinationModal } from './DestinationModal';
import {
  deviceSetting,
  deviceSettings,
  isDeviceSettingField,
  isDeviceSettingKey,
  readDeviceSettingKey,
  setDeviceSetting,
  setDeviceSettingValue,
  writeDeviceSettingKey,
} from './device-settings';
import { getOrCreateDeviceId, LS_DEVICE_ID } from './device-store';
import { displayStyleLabel } from './device-style';
import { openDownloadedVoicesDialog } from './downloaded-voices-dialog';
import { FieldModal, fieldPurpose } from './FieldModal';
import { folderPickerRow } from './folder-picker';
import { aboutRow } from './guide';
import { t } from './i18n';
import { TranslationKey } from './i18n/en';
import { openLibrarySetupDialog } from './LibrarySetupModal';
import { refreshLibraryViews } from './LibraryView';
import { adoptable } from './library/adopt';
import { frontmatterKeys, keysOfSpecies, recordCandidates, vaultCandidates } from './library/candidates';
import { coversFolderFor, uncatalogedBooks } from './library/cataloging';
import { countRules } from './library/collection';
import { collectionsOfSpecies, speciesOf } from './library/collection-species';
import { dashboardOffered, enabledDashboards } from './library/dashboard';
import { dashboardEnabled, movedInOrder, orderedDashboards, settledOrder } from './library/dashboard-order';
import {
  readActiveDashboard,
  readDashboardOrder,
  writeActiveDashboard,
  writeDashboardOrder,
} from './library/dashboard-place';
import { type FieldDefinition, keysFor, LIBRARY_FIELDS, mergeFields, RECORD_FIELDS } from './library/fields';
import { type LibraryRecord, parseRecord } from './library/record';
import { multiDeviceEnabled, setMultiDeviceEnabled } from './multi-device';
import { whenDialogsClose } from './OrbisModal';
import { PronunciationsModal } from './PronunciationsModal';
import { downloadFonts, FONT_DOWNLOAD_MB, fontsInstalled, removeFonts } from './pdf-fonts';
import { LS_DEVICE_NAME, LS_IGNORE_OTHERS } from './progress';
import { applyRecordsDestination, openRecordsDestinationDialog, recordsDestinationOf } from './RecordsDestinationModal';
import { logToLibrary } from './reader/DebugLog';
import type { DictionaryService } from './reader/lookup/DictionaryService';
import { dictionaryName, totalDictionaryMb } from './reader/lookup/DictionaryService';
import type { DictionarySource } from './reader/lookup/dictionary-sources';
import { allBooksBaseRoot } from './reader/record-paths';
import { downloadFailedMessage } from './reader/tts/asset-integrity';
import { orbisVoiceAsker } from './reader/tts/FirstVoiceModal';
import {
  enabledGenMethods,
  type GenConfig,
  genMethodIsAChoice,
  readGenConfig,
  setGenConfig,
} from './reader/tts/gen-config';
import { askForLiveVoice } from './reader/tts/live-voice-ask';
import { liveVoicePicker } from './reader/tts/live-voice-picker';
import { isOrbisVoiceDownloaded, type PreviewHandle, resetPiperWarm } from './reader/tts/PiperEngine';
import { glossarySvg } from './reader/tts/pronunciation-editor';
import { createPronunciationStore, orbisDisplayName, systemDisplayName } from './reader/tts/pronunciation-service';
import {
  describeVoice,
  fetchServerVoices,
  isEnglishLang,
  languageLabel,
  previewServerVoice,
  sortVoices,
  voiceGender,
  voiceLang,
} from './reader/tts/server-voices';
import { resolveDeviceLiveVoice, speakOnce, VoiceNotHereError } from './reader/tts/speak-once';
import { orbisVoiceById, orbisVoiceOrDefault, splitPiperVoice } from './reader/tts/voice-catalog';
import { VOICE_LIVE_SVG, VOICE_RECORDED_SVG } from './reader/tts/voice-glyphs';
import { VoicePicker, voiceFiltersFold } from './reader/tts/voice-picker';
import { createPiperVoiceProvider, describeEditionVoice, shortVoiceLabel } from './reader/tts/voice-providers';
import { onVoiceReadinessChanged } from './reader/tts/voice-readiness';
import { onVoicesChanged, WebSpeechEngine } from './reader/tts/WebSpeechEngine';
import type { RecordsMode } from './record-config';
import { renameThisDevice, runSyncSetup } from './SyncSetupModal';
import {
  DEFAULT_RECORDS_FOLDER,
  DISPLAY_STYLE_APPLIED,
  DisplayStyle,
  generateStyleId,
  IOrbisReaderPlugin,
  type LibraryCollection,
  type LibraryDashboard,
  LOOKUP_SECTION_LABELS,
  type NoteSpecies,
  PROGRESS_MODE_DISPLAY_ORDER,
  PROGRESS_MODE_GRID_LABELS,
  SKIP_SECONDS_OPTIONS,
  STORAGE_KEY_ACTIVE_STYLE,
} from './settings';
import { DisplayStylesPage } from './settings-display-styles';
import { coerceSettingValue, readSettingKey, visibleCount, writeSettingKey } from './settings-keys';
import { type ReorderRow, renderReorderList } from './settings-list';
import { NoteStylesPage } from './settings-note-styles';
import { openOnce } from './settings-row-tap';
import { logSettings, PAGE_I18N_KEYS } from './settings-rows';
import { buildThemeManagerPage } from './settings-themes';
import {
  resolveSetupItems,
  SETUP_ITEMS,
  type SetupItemId,
  type SetupItemStatus,
  type SetupState,
  setupProgress,
} from './setup-items';
import { setupProbe } from './setup-probe';
import { openSetupVoiceDialog } from './setup-voice-dialog';
import { forgetCredential } from './sources/sources';
import { syncEnabled, syncSetupDone } from './sync/enabled';
import { annotationsSvg, HEADPHONES_SVG } from './system-glyphs';
import { watchTooltipElement } from './tooltip-gap';
import { liveDialogTitles, rebuildKeepingFocus, setSvgIcon } from './ui-utils';
import { renderDashboardBody } from './WidgetModal';

/** Sentinel `previewingVoiceId` for the generation-voice audition (vs the catalog voice ids). */
const GEN_PREVIEW_ID = '__gen_voice__';

/**
 * What each Setup task is called, what it gives you, and what its button says.
 *
 * **Spelled out rather than assembled from the id.** `` t(`setup.${id}_name`) `` would be shorter and would hide
 * every one of these keys from `lint:i18n`, which reads literals — the audit that exists to stop exactly the drift
 * a table like this would otherwise accumulate. The button verb differs because the act does: a download is not a
 * setup, and a row that calls it one is asking for a folder nobody will be asked for.
 */
const SETUP_COPY: Record<
  // Appearance is absent deliberately: it is not a task and has no state, so it is built by hand from the same
  // rows the Appearance page uses rather than from a name, a sentence and a button.
  Exclude<SetupItemId, 'appearance'>,
  { name: TranslationKey; desc: TranslationKey; action: TranslationKey }
> = {
  book: { name: 'setup.book_name', desc: 'setup.book_desc', action: 'setup.action_set_up' },
  lookup: { name: 'setup.lookup_name', desc: 'setup.lookup_desc', action: 'setup.action_download' },
  library: { name: 'setup.library_name', desc: 'setup.library_desc', action: 'setup.action_set_up' },
  records: { name: 'setup.records_name', desc: 'setup.records_desc', action: 'setup.action_set_up' },
  listening: { name: 'setup.listening_name', desc: 'setup.listening_desc', action: 'setup.action_choose' },
  'pdf-fonts': { name: 'setup.pdf_name', desc: 'setup.pdf_desc', action: 'setup.action_download' },
  devices: { name: 'setup.devices_name', desc: 'setup.devices_desc', action: 'setup.action_set_up' },
};

// Kept as a real Modal rather than createOrbisPopup: this opens from inside
// Obsidian's own Settings window, which is itself a Modal. Obsidian's Modal
// traps/blocks keyboard input for anything outside its own recognized DOM
// tree while open, so a custom position:fixed popup appended to body (as
// createOrbisPopup does) can render on top but never actually receive
// keystrokes — on desktop it is visible and focusable, but cannot be typed into.
// The reading view's own popups never hit this because nothing else is
// layered above them there.
/** Nearest scrollable element at or above `el`, or null. Used to preserve scroll position across the
 *  wholesale DOM rebuilds the settings UI does on every mutation.
 *
 *  Starts at `el` itself, not its parent: a PluginSettingTab's own containerEl (.vertical-tab-content)
 *  IS the scroller, so skipping it would miss the only element that matters. Callers passing a plain
 *  child div are unaffected, since a non-scrolling element just falls through to the walk up. */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let n: HTMLElement | null = el;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return null;
}

/**
 * Add or edit a Library collection.
 *
 * The same dialog-not-inline-row reasoning as `DestinationModal` below, for the same reason: a collection is several
 * fields and a list row has space for none of them. Delete lives here too, behind the pencil, so the list itself
 * carries no button that could remove a collection by a mis-tap.
 *
 * **Validation is here so add and edit cannot disagree** about what a collection is: a name, and at least one of a
 * folder, a tag or a property. A collection with none of them gathers every note in the vault, which is not a
 * collection.
 *
 * **It counts as you type.** "Why is my collection empty" is otherwise answered by saving, leaving, opening the
 * Library and looking — and the answer is usually one wrong word in a property value. The count runs over
 * `metadataCache`, so it costs no file reads.
 */
/**
 * The keys that mean more than "read this frontmatter field", with the words they are shown as.
 *
 * Everything else a collection can group or sort by is a frontmatter field, labeled with its own name — so this table
 * is the exceptions, not the menu. Kept beside the dialog that renders them rather than in the pure arranger.
 */

/**
 * What a field's row says beneath its name: its aliases, and how many values it offers.
 *
 * **The aliases, not the read order.** The field's own key leads that order and is not an alias of itself, so
 * naming it here would put `source_url` in a list headed "Aliases" on the strength of being the field.
 */
function describeField(fields: readonly FieldDefinition[], field: FieldDefinition): string {
  const parts: string[] = [];
  const aliases = keysFor(fields, field.key).filter((key) => key !== field.key);
  if (aliases.length > 0) parts.push(t('properties_page.alias_list', { keys: aliases.join(', ') }));
  const values = field.values?.length ?? 0;
  if (values > 0) parts.push(t('properties_page.values_count', { count: String(values) }));
  return parts.join(' · ') || field.key;
}

/**
 * A definition line under a section heading: what this list IS, before the rows say what is in it.
 *
 * A row rather than a section property, because a list section has no description of its own — see the note at its
 * one call site. Nameless, and styled to read as a caption rather than as a setting with an empty label.
 */
const TOOLBAR_BUTTON_SVGS: Record<string, string> = {
  // Shared with the toolbar button itself rather than copied, so the two can never drift apart.
  annotations: annotationsSvg(),
  // Likewise: the reader's Listen button wears this, and so do the two recordings dialogs. A row here with no glyph
  // would read as an oversight beside nine rows that have one.
  listen: HEADPHONES_SVG,
  toc: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="2.5" rx="1.25"/><rect x="3" y="10.75" width="18" height="2.5" rx="1.25"/><rect x="3" y="17.5" width="18" height="2.5" rx="1.25"/></svg>',
  search:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  bookmark:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-3.5L5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1z"/></svg>',
  column:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="3" width="9" height="18" rx="1"/><rect x="13" y="3" width="9" height="18" rx="1"/></svg>',
  brightness:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  fontsize:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  displayStyle:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  noteicons:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  progress:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  focus:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3"/><path d="M16 3h3a2 2 0 012 2v3"/><path d="M21 16v3a2 2 0 01-2 2h-3"/><path d="M8 21H5a2 2 0 01-2-2v-3"/></svg>',
  debug:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
};

/**
 * A settings page that renders one of the imperative page builders.
 *
 * `getSettingDefinitions()` cannot be adopted for half a page — it either renders the whole page or `display()` does
 * — but a page MAY be imperative, so a page that is not declarative is one whose `display()` calls its builder.
 * See docs/design/settings.md.
 *
 * `hide()` is where the cleanup belongs: Obsidian calls it when you navigate away, not only when the modal closes,
 * so a voice preview does not keep playing after you leave the page that started it.
 */
class ImperativePage extends SettingPage {
  constructor(
    title: string,
    private readonly owner: OrbisSettings,
    private readonly render: (el: HTMLElement) => void,
    private readonly cleanup?: () => void
  ) {
    super();
    this.title = title;
  }

  /** Obsidian calls this when the page opens; the builders call it again through `renderSettings()` when they
   *  change their own shape. Empty first, or a re-render appends a second copy of the whole section. */
  display(): void {
    // A hook for our own rules in a container Obsidian owns — the focus rings for checkbox/radio ROWS and for the
    // `onActivate` headers need a scope, and "inside the Orbis settings tab" is the honest one.
    this.containerEl.addClass('orbis-settings');
    this.owner.pageOpened(this);
    this.containerEl.empty();
    this.render(this.containerEl);
  }

  hide(): void {
    this.owner.pageClosed(this);
    this.cleanup?.();
    super.hide();
  }
}

/**
 * The two species of collection, and what each list calls itself.
 *
 * Both lists are always shown, even before a vault has a single reading record: a list that appears only once you
 * have used a feature cannot be found by someone looking for the feature. The empty state says what would go there.
 */
const COLLECTION_SPECIES: Array<{
  species: NoteSpecies;
  heading: TranslationKey;
  desc: TranslationKey;
  empty: TranslationKey;
  add: TranslationKey;
}> = [
  {
    species: 'title',
    heading: 'library_page.title_collections',
    desc: 'library_page.collections_desc',
    empty: 'library_page.no_collections',
    add: 'library_page.add_title_collection',
  },
  {
    species: 'reading_record',
    heading: 'library_page.record_collections',
    desc: 'library_page.record_collections_desc',
    empty: 'library_page.no_record_collections',
    add: 'library_page.add_record_collection',
  },
];

export class OrbisSettings extends PluginSettingTab {
  plugin: IOrbisReaderPlugin;
  private selectedPresetId: string | null = null;
  /** Currently-playing voice preview (Listening page), so a new preview stops the previous one. */
  private voicePreview: PreviewHandle | null = null;
  private previewingVoiceId: string | null = null;
  /** The generation-voice Preview button, so it can show a "Generating…" busy state. */
  private genPreviewBtn: ButtonComponent | null = null;
  /** Container the generation-voice picker renders into, so "Refresh voices" can re-render it. */
  private genVoiceContainer: HTMLElement | null = null;
  /** Called when the server generation voice changes, to refresh the model row's summary. */
  private genVoiceOnChange: (() => void) | null = null;
  /** The shared VoicePicker for the on-device (Piper) default voice, so it can be torn down on close. */
  private genPiperPicker: VoicePicker | null = null;
  /** The shared VoicePicker for the live-listen voice (Orbis / System), torn down on close. */
  private livePicker: VoicePicker | null = null;
  /** Bumped whenever a preview starts/stops; a slow in-flight preview whose epoch is stale on
   *  resolve is discarded (so rapid ‹ › taps never let an older clip play over a newer one). */
  private previewEpoch = 0;
  /** Unsubscribe from speechSynthesis 'voiceschanged' (system voices load lazily). */
  private voicesUnsub: (() => void) | null = null;
  /** The page on screen, so a builder asking to re-render redraws that page rather than the whole tab. */
  private openPage: ImperativePage | null = null;
  /**
   * The rows opened into themselves, by key — see `ReorderExpansion`.
   *
   * On the tab rather than in the list, because it has to survive the list: saving from inside an expanded dashboard
   * can redraw the page, and a dashboard that closed every time one of its widgets was switched off would be
   * unusable. Cleared when the tab is closed, which is when "still open" stops meaning anything.
   */
  private readonly expandedRows = new Set<string>();
  /** The dashboards list's own container, so a change to it redraws one card rather than the page. */
  private dashboardsHostEl: HTMLElement | null = null;
  /** The vault's frontmatter keys, cached for one visit to a page. Cleared in `pageOpened`. */
  private vaultKeyCache: Set<string> | null = null;
  /** The same, per species — what a Fields list asks of each of its rows. Cleared alongside it. */
  private readonly speciesKeyCache = new Map<NoteSpecies, Set<string>>();
  /** Last known status line per dictionary. A definition is built synchronously; the answer needs two awaits. */
  private readonly dictionaryState = new Map<DictionarySource['id'], string>();
  /** The preview row currently sounding, so its button can show pause while the others show play. */
  private previewPlaying: 'live' | 'recorded' | null = null;
  private readonly previewButtons: { live?: ExtraButtonComponent; recorded?: ExtraButtonComponent } = {};
  /** Last known PDF-font status line, cached for the same reason `dictionaryState` is. */
  private fontState: string | null = null;
  /**
   * What Setup last found, and whether it is looking again.
   *
   * Cached for the same reason the two above are — three of the seven answers are `await`s on the vault adapter and
   * `getSettingDefinitions()` is synchronous — but ALSO because the entry on the start page carries the count. A
   * `displayValue` that had to wait would show nothing on the one screen this page exists to be noticed from.
   */
  private setupStatus: SetupItemStatus[] | null = null;
  private setupResolving = false;
  /**
   * Whether this device can actually speak with the live voice it has chosen — `null` until the first look
   * answered.
   *
   * Cached for the same reason as `setupStatus`: the answer is an `await` on the vault adapter and
   * `displayValue` is synchronous. An entry that named the CHOSEN voice without asking whether its model is on
   * disk would go on saying `Libritts · 1` after that model is deleted, under a player that has already fallen
   * back to *No voice* — so it says *Libritts · 1 · not downloaded*. A preference is not a capability.
   */
  private liveVoiceReady: boolean | null = null;
  private liveVoiceResolving = false;
  /** The same answer for the voice the next recording would use. A server voice is always "here". */
  private recordedVoiceReady: boolean | null = null;
  private recordedVoiceResolving = false;
  constructor(app: App, plugin: IOrbisReaderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    // Registered once for the plugin's lifetime (not per-render) so the Appearance page's
    // controls stay live-synced when a value changes elsewhere (e.g. the Display Style
    // toolbar) while this settings tab is open.
    this.plugin.registerEvent(
      // @ts-expect-error -- custom events are not typed in Obsidian's Workspace definition
      this.plugin.app.workspace.on('orbis:settings-change', (key: string, value: string) => {
        if (key === DISPLAY_STYLE_APPLIED) this.displayStyles.syncAllStyleControls();
        else this.displayStyles.syncStyleControl(key, value);
      })
    );
    // A voice arriving or being deleted is NOT a setting, so it never comes through the event above. It can also
    // happen somewhere else entirely — the reader's own picker, with this tab open behind it — and without this the
    // Listening entry and the full-screen player would disagree. Registered for the plugin's lifetime for the
    // same reason as the event above: the answer can move while no page of this tab is on screen.
    this.plugin.register(onVoiceReadinessChanged(() => this.refreshLiveVoiceReadiness()));
  }

  /**
   * The settings tree: a version row, then one page per section.
   *
   * Returning a non-empty array is what switches Obsidian from `display()` to rendering these — there is no flag
   * to set. It is called on every `update()` and once when the tab is registered, for search indexing, so it must
   * stay cheap: no I/O, no awaits, nothing but building this array.
   */
  /** The Note styles page — see `settings-note-styles.ts`. It owns which style is selected. */
  private readonly noteStyles = new NoteStylesPage(this);

  /** The Display styles page — see `settings-display-styles.ts`. It owns the live control handles. */
  private readonly displayStyles = new DisplayStylesPage(this);

  getSettingDefinitions(): SettingDefinitionItem[] {
    // Orbis's tooltips here as everywhere: the class marks this as an Orbis surface, and the listener goes on the
    // page itself, since Settings can be moved into a window of its own after this is built — see `tooltip-gap.ts`.
    this.containerEl.addClass('orbis-settings');
    watchTooltipElement(this.containerEl);
    // Asked here, one page before it is needed, so the Listening entry is right on its FIRST paint. The probe is a
    // filesystem read: started when Listening builds, it resolves a moment after the page is already on screen,
    // and that moment is one in which the live preview button looks pressable and the answer behind it is unknown.
    this.refreshLiveVoiceReadiness();
    // Every entry carries a line saying what is inside, so the start page is a map rather than a list of doors —
    // and because a page's `desc` is searched too, the words someone types are often the ones in that line.
    return [
      /**
       * **Ordered from inside the book outwards**, which is also frequency order: what you touch while a book is open
       * comes first, then what manages the collection around it, then what leaves Orbis, then the second-device
       * feature. Appearance leads because it is what a reader opens settings for; Library and Book sources are set up
       * once and then largely left alone, which belongs below.
       *
       * Three stretches, without headings to announce them: the book in front of you (appearance, reading behavior,
       * listening, annotations, look-up), then what you have (library, sources), then what leaves and where it goes
       * (conversions, devices). Flat deliberately — group headings would read as one more layer of abstraction over
       * ten rows that already say what they are.
       *
       * **Reading behavior and Listening are adjacent on purpose**, being the two modes of consuming a book rather
       * than a main one and an extra; Annotations follows them because annotating is what you do while doing either.
       */
      /**
       * **First, permanently.** It doubles as an index of what the plugin can do, which a flat eight-page tree
       * otherwise lacks — and the count on the entry is where a reader is told there is anything left to turn on.
       * `displayValue` is read as a function so `update()` refreshes it without rebuilding the page underneath.
       *
       * **No `status: 'warning'`, deliberately.** One would be wrong three ways. Obsidian offers no
       * milder status, so the triangle it draws is the one that means *something is broken* — and "0 of 7" on a
       * fresh install is the correct state of an entirely optional list. It would also never clear for the reader
       * who has simply not decided yet, which is the permanent badge the dismissal rule exists to prevent. And it
       * spends a signal that is needed elsewhere: a warning belongs on a capability that is ON and cannot work — a
       * missing dictionary under an enabled look-up, an unreachable recording server — which is actionable and
       * clears when fixed. A page wearing a triangle forever makes those unnoticeable.
       *
       * The count alone says "there is more in here" without claiming a fault, and this entry is the first on the
       * page, so nothing has to shout to be found.
       */
      {
        type: 'page',
        name: t('settings_pages.setup'),
        desc: t('settings_pages.setup_desc'),
        displayValue: () => this.setupProgressLabel(),
        items: this.setupPageItems(),
      },
      {
        type: 'page',
        name: t('settings_pages.display_styles'),
        desc: t('settings_pages.display_styles_desc'),
        items: this.displayStyles.displayStyleItems(),
      },
      {
        type: 'page',
        name: t('settings_pages.reading'),
        desc: t('settings_pages.reading_desc'),
        items: this.readingItems(),
      },
      {
        type: 'page',
        name: t(PAGE_I18N_KEYS.Listening),
        desc: t('settings_pages.listening_desc'),
        items: this.listeningItems(),
      },
      {
        type: 'page',
        name: t('settings_pages.annotations'),
        desc: t('settings_pages.annotations_desc'),
        items: this.annotationItems(),
      },
      // After Annotations, being the other thing a selection can lead to: mark the passage, or look the word up.
      // Imperative, because both of its lists reorder — see `buildLookupPage`.
      this.subPage(t(PAGE_I18N_KEYS.Lookup), t('settings_pages.lookup_desc'), (el) => this.buildLookupPage(el)),
      {
        type: 'page',
        name: t('settings_pages.library'),
        desc: t('settings_pages.library_desc'),
        items: this.libraryItems(),
      },
      // Beside the Library, being the other page about what you have rather than how a book behaves once open — and
      // where a reader with an empty vault goes to get something to read.
      // Imperative, because its source list reorders — see `renderReorderList`.
      this.subPage(t('settings_pages.sources'), t('settings_pages.sources_desc'), (el) => this.buildSourcesPage(el)),
      {
        type: 'page',
        name: t('settings_pages.conversions'),
        desc: t('settings_pages.conversions_desc'),
        items: this.conversionItems(),
      },
      {
        type: 'page',
        name: t(PAGE_I18N_KEYS.Devices),
        desc: t('settings_pages.devices_desc'),
        items: this.deviceItems(),
      },
      // LAST, not first: nobody opens settings to read a version number, and at the top it would push the row a
      // reader actually came for into second place. It also carries the guide's button — see `aboutRow`.
      aboutRow(this.plugin.manifest.name, this.plugin.manifest.version),
    ];
  }

  /**
   * Read a control's value. Delegates to the pure resolver so a dotted key (`progressModes.book-locs`) reaches into
   * an array of `{ id, visible }` the same way a plain key reaches a field.
   */
  getControlValue(key: string): unknown {
    // `gen.` reaches the recording config, which lives in localStorage rather than in `data.json` — it is
    // per-device on purpose (a server URL is a LAN address, Piper voices are per-device downloads). The prefix is
    // how one flat key namespace addresses more than one store.
    if (key.startsWith('gen.')) return readGenConfig()[key.slice(4) as keyof GenConfig];
    // The same trick for the settings that describe this DEVICE — which toolbar buttons it shows, to begin with. One
    // flat key namespace, three stores behind it. See `device-settings.ts`.
    // `isDeviceSettingField`, not `isDeviceSettingKey`: `progressModes.book-locs` names a member of a device
    // setting, and the walker behind these reads it the same way it reads a member of a traveling one.
    // Narrowed on the way out as well as in: a value no control offers any more (Read ahead's `paragraph`) would
    // show as an empty dropdown.
    if (isDeviceSettingField(key)) return coerceSettingValue(key, readDeviceSettingKey(key));
    return readSettingKey(this.plugin.settings, key);
  }

  /**
   * Write, persist, and let the reader see it.
   *
   * The single save point: a toggle that calls `saveSettings()` and `refreshViews()` for itself can forget the
   * second, and that is a setting that appears to do nothing until you reopen the book. `refreshDomState()` re-runs
   * the `disabled` predicates, which is how the last visible panel tab locks itself.
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key.startsWith('gen.')) {
      setGenConfig({ [key.slice(4)]: value });
      this.renderSettings(); // the Recorded voice entry names the preferred engine's voice
      return;
    }
    if (isDeviceSettingField(key)) {
      // No settings save: this never reaches `data.json`, so there is nothing to write and nothing to publish. The
      // open readers still have to be told, since what they are showing is what just changed.
      if (isDeviceSettingKey(key)) setDeviceSettingValue(key, coerceSettingValue(key, value));
      else writeDeviceSettingKey(key, coerceSettingValue(key, value));
      if (key.startsWith('progressModes.')) this.keepProgressModeReachable();
      this.plugin.refreshViews();
      // A visibility array's last visible member disables its own row, which is a DESCRIPTION change — see the
      // traveling path below for why that needs a rebuild rather than a predicate re-run.
      if (key.includes('.')) this.renderSettings();
      else this.refreshDomState();
      return;
    }
    if (!writeSettingKey(this.plugin.settings, key, coerceSettingValue(key, value))) return;
    if (key.startsWith('progressModes.')) this.keepProgressModeReachable();
    // The Library switch reaches outside settings: the ribbon icon and any open Library have to follow it.
    if (key === 'libraryEnabled') this.plugin.applyLibraryEnabled();
    await this.plugin.saveSettings();
    this.plugin.refreshViews();
    // `refreshDomState()` re-runs the predicates in place and is what most writes need. The two visibility
    // arrays need more: the row that becomes the last one changes its DESCRIPTION to say so, and a description
    // is built in `getSettingDefinitions()`, so those rebuild.
    if (key.includes('.')) this.renderSettings();
    else this.refreshDomState();
  }

  /**
   * Move off a progress mode that was just hidden.
   *
   * The indicator cycles through the enabled modes on tap; leaving it pointed at one the reader has turned off
   * shows a readout they said they did not want, and no amount of tapping would clear it. `blank` is not a
   * toggleable mode, so it is exempt.
   */
  private keepProgressModeReachable(): void {
    const enabled = deviceSetting('progressModes')
      .filter((m) => m.visible)
      .map((m) => m.id);
    const current = deviceSetting('progressMode');
    if (current !== 'blank' && enabled.length > 0 && !enabled.includes(current)) {
      setDeviceSetting('progressMode', enabled[0]);
    }
  }

  /** Called by a page as it renders. Not a setter: `hide()` must only clear the page that is actually leaving,
   *  since Obsidian builds the next page before hiding the last one on some navigations. */
  pageOpened(page: ImperativePage): void {
    this.openPage = page;
    // Dropped rather than kept: a page opened after cataloging writes new notes must not describe the keys the
    // vault had last time.
    this.vaultKeyCache = null;
    this.speciesKeyCache.clear();
  }

  pageClosed(page: ImperativePage): void {
    if (this.openPage === page) this.openPage = null;
  }

  hide(): void {
    this.openPage = null;
    // A row is "still open" only for as long as the tab is: coming back to settings later should show the list, not
    // whatever was expanded last time.
    this.expandedRows.clear();
    // The Display-styles components are gone with the DOM; keeping references would have `syncStyleControl`
    // writing into detached elements the next time the display menu moved a value.
    this.displayStyles.styleHandles.preview = undefined;
    this.displayStyles.styleHandles.slider = {};
    this.releaseVoices();
    super.hide();
  }

  /** Stop an audition and tear down the voice pickers. Owned by the Audio page, and run again when the whole
   *  tab closes, since a page's `hide()` is not guaranteed if the host window goes away. */
  private releaseVoices(): void {
    this.stopVoicePreview(); // don't leave an audition playing after the settings close
    this.genPiperPicker?.destroy();
    this.genPiperPicker = null;
    this.livePicker?.destroy();
    this.livePicker = null;
    this.voicesUnsub?.();
    this.voicesUnsub = null;
  }

  /**
   * Re-render whatever page is open.
   *
   * The builders call this after a mutation that changes the shape of their own section — a style added, a note
   * style renamed — and it rebuilds one page, because that is all that is on screen: rendering every tab into
   * `this.containerEl` would paint over the page the reader is looking at.
   *
   * Scroll is captured and put back because a control near the bottom otherwise throws you to the top when you
   * touch it. The rAF second write is for the same reason the destinations list does it —
   * the restored height isn't final on the first frame, so one assignment gets clamped.
   */
  /**
   * **Through `rebuildKeepingFocus`, like every other self-redrawing surface.**
   *
   * A settings page redraws itself whenever one of its own controls changes something another control depends on —
   * picking a note style, switching a save-as format. Each redraw destroys every control on the page, so without
   * this the keyboard would drop on `body`: arrowing the style selector would change the style, lose the selector,
   * and the next arrow would do nothing at all, which reads exactly like a dropdown that cannot be operated.
   * Controls that must survive carry a `data-orbis-focus` key, since a page can come back a different shape
   * (per-chapter reveals a different set of rows) and a positional path would then land somewhere arbitrary.
   */
  /**
   * **Where a rebuild has to be rooted, and why it is not `containerEl`.**
   *
   * A drill-down page has a container of its own, mounted outside `PluginSettingTab.containerEl` — so rooting on the
   * tab would mean the focused control is never "inside" the rebuild, no key is ever read, and every redraw drops
   * the keyboard. `openPage` covers the pages we build; it is null for a declarative `type: 'page'`, which Obsidian
   * renders into a container of ITS making and never tells us about. So: the settings modal the focused control is
   * actually in, then the page, then the tab. The modal is a wide root, which costs nothing — the keys are per-row
   * identities, and what is being rebuilt is a whole page.
   */
  private rebuildRoot(): HTMLElement {
    /**
     * **From an element we own, not from `activeDocument`.** Asking the active document for the focused element
     * fails two ways: a detached Settings window is not Obsidian's active window, and even in the same window a
     * declarative `type: 'page'` renders OUTSIDE `containerEl` — so the root would either belong to the wrong
     * document or not contain the control, and either way `captureFocus` would record nothing and the repaint would
     * leave the keyboard wherever it fell. The settings modal contains every page of this tab by construction.
     */
    return this.containerEl.closest<HTMLElement>('.modal-container') ?? this.openPage?.containerEl ?? this.containerEl;
  }

  /**
   * Redraw the page that is showing, keeping the keyboard where it was — and NOT while a dialog of ours is open.
   *
   * **A page must not redraw behind an open dialog.** These editors save as they go, so every keystroke asks the
   * page underneath to rebuild — and Obsidian's settings pane focuses itself when it rebuilds, which would take the
   * keyboard out of the dialog and leave the ring on a row behind it. The reader sees nothing of the redraw either
   * way, so it waits for the dialog to close, which is also when the row's new name is worth painting.
   */
  renderSettings(): void {
    whenDialogsClose(() => rebuildKeepingFocus(this.rebuildRoot(), () => this.redraw()));
  }

  private redraw(): void {
    const page = this.openPage;
    // No imperative page open means the page asking to redraw is a declarative one, and rebuilding its
    // definitions is how that is done. Without this the call would be a silent no-op: the Display-styles selector
    // would switch style and nothing on screen would follow, because `openPage` is only set by a `ImperativePage`.
    if (!page) {
      this.update();
      return;
    }
    const sp = scrollParentOf(page.containerEl);
    const top = sp?.scrollTop ?? 0;
    page.display();
    if (sp && top > 0) {
      sp.scrollTop = top;
      page.containerEl.win.requestAnimationFrame(() => {
        sp.scrollTop = top;
      });
    }
  }

  /**
   * The Display styles page: the style being edited, its nine properties, and a live sample.
   *
   * Imperative. The selector is a `<select>` with New / Rename / Delete beside it, the four sliders each carry a
   * paired number input, and the sample restyles itself as you drag — none of which a `control` row expresses.
   */
  /**
   * What a style is called on screen.
   *
   * NOT the style's `name` field for this device's own: that holds "device-default", an internal label the reader
   * has never seen and should not meet. A method because the Setup page names the active style too — the three
   * rows it shows all write into it, and a control that edits something unnamed is the trap that section exists to
   * avoid.
   */
  styleLabel(style: DisplayStyle): string {
    return displayStyleLabel(style, (this.plugin.app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '');
  }

  /**
   * The style every display control is currently editing, or null if the pointer names nothing this device can see.
   *
   * The fallback repairs a stale pointer rather than reporting one: `initDeviceStyle` guarantees this device has a
   * style, so "none at all" is not reachable by using the plugin — but deleting a shared style on one device leaves
   * the other naming it.
   */
  private activeStyle(): DisplayStyle | undefined {
    const visible = this.plugin.stylesForThisDevice();
    const activeStyleId = (this.plugin.app.loadLocalStorage(STORAGE_KEY_ACTIVE_STYLE) as string | null) ?? '';
    const stored = visible.find((p) => p.id === activeStyleId);
    const fallback = visible.find((p) => p.deviceId === getOrCreateDeviceId(this.plugin.app));
    const style = stored ?? fallback;
    if (!stored && style) this.plugin.app.saveLocalStorage(STORAGE_KEY_ACTIVE_STYLE, style.id);
    return style;
  }

  /**
   * The nine properties of the style being edited, plus the live sample.
   *
   * **Every row is `render`, deliberately.** A `control` row would bind to a settings field, and these nine live
   * in localStorage against whichever style is active — but the real reason is behavior, not storage. Three
   * things have to survive, and a control row breaks all three: the sliders update the book and the sample as
   * you DRAG (a control row's value arrives when Obsidian decides it does); the four sliders carry paired number
   * inputs a `slider` control has no slot for; and `syncStyleControl` writes an outside change into the live
   * component without a re-render, so a value changed from the display menu does not steal focus mid-keystroke.
   *
   * `render` costs nothing here in exchange: it gives up automatic save (these save through the display-style
   * system, which also applies them to the book), `validate` (nothing here is free text) and `disabled` (the one
   * row that disables already does it by hand). And a `render` row is still indexed for search, which is the
   * whole point of converting the page.
   */
  private piperCacheDir(): string {
    return `${this.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
  }

  /** Stop any preview currently playing on the Listening page (Orbis or system). */
  private stopVoicePreview(): void {
    this.setPreviewPlaying(null); // every stop goes through here, so every stop repaints the buttons
    this.previewEpoch++; // invalidate any in-flight preview so it won't play when it resolves
    this.voicePreview?.stop(); // triggers the preview's onDone, which clears state + re-renders
    this.voicePreview = null;
    this.previewingVoiceId = null;
    if (WebSpeechEngine.isSupported()) window.speechSynthesis.cancel();
  }

  /** Start-of-preview housekeeping: stop any current audition and pause the book audio, so the
   *  preview sample and a playing book don't sound at the same time. */
  private beginVoicePreview(): void {
    this.stopVoicePreview();
    this.plugin.pauseListening();
  }

  /** Generation-voice picker: gender + language filter rows over a dropdown discovered from the
   *  server's /v1/audio/voices (a Kokoro extension), falling back to a text field. */
  private buildGenVoiceRow(A: HTMLElement): void {
    this.genVoiceContainer = A.createDiv();
    void this.renderGenVoicePicker(this.genVoiceContainer);
  }

  private async renderGenVoicePicker(container: HTMLElement): Promise<void> {
    container.empty();
    new Setting(container).setName(t('listening_page.gen_server_voice')).setDesc(t('listening_page.gen_voice_loading'));
    const all = await fetchServerVoices(readGenConfig().serverUrl);
    container.empty();
    // English only — non-English voices read English text poorly. (Fall back to all if a server has
    // no English voices at all, so it's still usable.)
    const english = all?.filter((v) => {
      const l = voiceLang(v);
      return !!l && isEnglishLang(l);
    });
    const voices = english?.length ? english : all;

    // No discovery (offline / non-Kokoro endpoint): a plain text field. (Refresh lives under the
    // Server URL; use it after fixing the URL.)
    if (!voices?.length) {
      const setting = new Setting(container)
        .setName(t('listening_page.gen_server_voice'))
        .setDesc(t('listening_page.gen_voice_desc'))
        .setClass('orbis-gen-voice-box');
      const host = setting.controlEl.createDiv({ cls: 'orbis-gen-voice-control' });
      setting.addButton((b) => {
        this.genPreviewBtn = b;
        b.setButtonText(t('listening_page.gen_voice_preview')).onClick(() => this.previewGenVoice());
      });
      // Placeholder, not a value — see `GEN_CONFIG_DEFAULTS`. A voice id is server-specific, so a pre-filled one is
      // wrong everywhere except Kokoro; as a hint it shows the shape of the answer and nothing more.
      new TextComponent(host)
        .setPlaceholder(t('listening_page.gen_voice_ph'))
        .setValue(readGenConfig().voice)
        .onChange((v) => {
          setGenConfig({ voice: v.trim() });
          this.genVoiceOnChange?.();
        });
      return;
    }

    // Filter state (not persisted): both genders; English variants present by default.
    const langsPresent = [...new Set(voices.map(voiceLang).filter((l): l is string => !!l))].sort(
      (a, b) =>
        Number(!isEnglishLang(a)) - Number(!isEnglishLang(b)) || languageLabel(a).localeCompare(languageLabel(b))
    );
    const genders = new Set(['f', 'm']);
    const langs = new Set(langsPresent.filter(isEnglishLang));
    if (langs.size === 0) for (const l of langsPresent) langs.add(l); // no English present → show all

    // Voice dropdown on top, Preview below (its own line), filters below — all in ONE box.
    const voiceSetting = new Setting(container)
      .setName(t('listening_page.gen_server_voice'))
      .setDesc(t('listening_page.gen_voice_desc'))
      .setClass('orbis-gen-voice-box');
    const ddHost = voiceSetting.controlEl.createDiv({ cls: 'orbis-gen-voice-control' });
    voiceSetting.addButton((b) => {
      this.genPreviewBtn = b;
      b.setButtonText(t('listening_page.gen_voice_preview')).onClick(() => this.previewGenVoice());
    });

    const rebuild = (): void => {
      ddHost.empty();
      const filtered = sortVoices(
        voices.filter((v) => {
          const g = voiceGender(v);
          const l = voiceLang(v);
          return (!g || genders.has(g)) && !!l && langs.has(l);
        })
      );
      if (!filtered.length) {
        ddHost.createSpan({ cls: 'orbis-gen-voice-note', text: t('listening_page.gen_voice_none_match') });
        return;
      }
      // If the filter hid the selected voice, fall back to the top match.
      let current = readGenConfig().voice;
      if (!filtered.includes(current)) {
        current = filtered[0];
        setGenConfig({ voice: current });
      }
      const dd = new DropdownComponent(ddHost);
      for (const v of filtered) dd.addOption(v, describeVoice(v));
      dd.setValue(current).onChange((value) => {
        setGenConfig({ voice: value });
        this.genVoiceOnChange?.();
      });
    };

    // The filters go inside the SAME box, from the same builder the shared picker uses — and ABOVE the
    // dropdown, because they decide what is in it. The box is a column, so `before` the control puts them
    // under the description and over the list, exactly where the picker has them.
    const grid = voiceFiltersFold(voiceSetting.settingEl, voiceSetting.controlEl);
    const genderChecks = this.addFilterGroup(grid, t('listening_page.gen_voice_gender'));
    this.addFilterCheckbox(genderChecks, t('listening_page.gender_female'), genders.has('f'), (on) => {
      on ? genders.add('f') : genders.delete('f');
      rebuild();
    });
    this.addFilterCheckbox(genderChecks, t('listening_page.gender_male'), genders.has('m'), (on) => {
      on ? genders.add('m') : genders.delete('m');
      rebuild();
    });
    const langChecks = this.addFilterGroup(grid, t('listening_page.gen_voice_language'));
    for (const l of langsPresent) {
      this.addFilterCheckbox(langChecks, languageLabel(l), langs.has(l), (on) => {
        on ? langs.add(l) : langs.delete(l);
        rebuild();
      });
    }

    rebuild();
  }

  /** Add a "label | checks" row to the filters grid: the label cell (grid col 1) and a wrapping
   *  checkbox container (grid col 2, returned). The grid aligns all rows' checkboxes. */
  private addFilterGroup(grid: HTMLElement, label: string): HTMLElement {
    grid.createSpan({ cls: 'orbis-voice-filter-group-label', text: label });
    return grid.createDiv({ cls: 'orbis-voice-filter-checks' });
  }

  private addFilterCheckbox(
    parent: HTMLElement,
    label: string,
    checked: boolean,
    onChange: (on: boolean) => void
  ): void {
    const wrap = parent.createEl('label', { cls: 'orbis-voice-filter-item' });
    const cb = wrap.createEl('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    wrap.createSpan({ text: label });
    cb.addEventListener('change', () => onChange(cb.checked));
  }

  /** Reflect preview state on the button: while the server synthesizes the sample (slow, esp. on a
   *  CPU box) show "Generating…" and disable it, so the tap clearly registered. */
  private setGenPreviewBusy(busy: boolean): void {
    this.genPreviewBtn?.setDisabled(busy);
    this.genPreviewBtn?.setButtonText(
      busy ? t('listening_page.gen_voice_previewing') : t('listening_page.gen_voice_preview')
    );
  }

  private previewGenVoice(): void {
    const cfg = readGenConfig();
    this.beginVoicePreview(); // stop any prior audition + pause the book audio; bumps previewEpoch
    this.previewingVoiceId = GEN_PREVIEW_ID;
    this.setPreviewPlaying('recorded');
    const epoch = this.previewEpoch;
    this.setGenPreviewBusy(true);
    void previewServerVoice(
      cfg.serverUrl,
      cfg.model,
      cfg.voice,
      t('listening_page.voice_preview_sample'),
      deviceSetting('ttsRate') || 1,
      () => {
        // Playback ended — clear state (unless a newer preview owns it now).
        if (epoch === this.previewEpoch && this.previewingVoiceId === GEN_PREVIEW_ID) {
          this.previewingVoiceId = null;
          this.voicePreview = null;
          this.setPreviewPlaying(null);
        }
      }
    )
      .then((handle) => {
        if (epoch !== this.previewEpoch) {
          handle.stop(); // a newer preview started during the (possibly slow) request
          return;
        }
        this.voicePreview = handle;
        this.setGenPreviewBusy(false); // sample ready → now playing
      })
      .catch(() => {
        if (epoch !== this.previewEpoch) return;
        this.previewingVoiceId = null;
        this.voicePreview = null;
        this.setPreviewPlaying(null);
        this.setGenPreviewBusy(false);
        new Notice(t('notices.gen_voice_preview_failed'));
      });
  }

  /** The live-listen voice picker: the shared VoicePicker with an [ Orbis voices | System voices ]
   *  method toggle, mapped onto this device's voice preference. Selecting a voice makes it active immediately and
   *  downloads nothing; voices are deleted from *Downloaded voices* (`downloadedVoicesRow`). */
  private buildVoicePicker(A: HTMLElement): void {
    /**
     * No heading: the page titlebar already says "Live voice", and repeating it would be a duplicate.
     *
     * **A real `Setting`, not a card of our own.** A card would look like a settings row — a gray box with a
     * description at the top — and behave like nothing: Obsidian's settings navigation moves between `.setting-item`
     * rows, so the source toggle, the voice dropdown, the speaker stepper, Preview and the filters fold would all be unreachable by Tab. Painting the picker into a row's control area makes every one of them
     * reachable without touching `VoicePicker`, which is shared with the in-reader "Change voice" popup where rows
     * would be wrong.
     */
    const card = new Setting(A).setDesc(t('listening_page.voice_desc'));
    card.settingEl.addClass('orbis-setting-stacked');
    card.controlEl.addClasses(['orbis-stacked-column', 'orbis-stacked-full']);

    // Persist a preference change AND run the reader-side side effects (free the old warm worker,
    // rebuild the reader's engine on next play). Passed to the shared live-voice binding as setPref.
    const applyPref = (patch: Parameters<IOrbisReaderPlugin['setDeviceVoicePref']>[0]): void => {
      void this.plugin.setDeviceVoicePref(patch).then(() => {
        resetPiperWarm(); // free the old voice's worker
        this.plugin.refreshViews(); // reader rebuilds its engine with the new voice on next play
      });
    };

    const box = card.controlEl.createDiv({ cls: 'orbis-recording-voice' });
    // The device live-voice binding is single-sourced in live-voice-picker.ts (shared with the
    // in-reader "Change voice" popup) so both surfaces drive the identical control.
    const { host, methods } = liveVoicePicker({
      app: this.app,
      cacheDir: this.piperCacheDir(),
      rate: () => deviceSetting('ttsRate') || 1,
      getPref: () => this.plugin.getDeviceVoicePref(),
      setPref: applyPref,
      pauseAudio: () => this.plugin.pauseListening(),
    });
    this.livePicker = new VoicePicker(box, host, methods);
    void this.livePicker.render();
    // System voices load lazily (Chrome/Electron); re-render when they arrive.
    this.voicesUnsub = onVoicesChanged(() => void this.livePicker?.render());
  }

  /**
   * The Recorded voice page: pre-record chapters to files (higher quality, lighter on the battery).
   *
   * Config is device-local — localStorage, never synced; see gen-config.ts. Models are an accordion, one open at
   * a time, so a new engine is just another entry rather than another section.
   */
  private buildRecordedVoicePage(A: HTMLElement): void {
    /**
     * Which engine a new recording starts on. Only asked when both are enabled — with one, there is no choice to
     * make and the row would be a dropdown of length one. The recordings dialog can still switch engines for a
     * single run; it does not write that choice back here, so this stays the standing preference rather than a
     * record of the last thing you did.
     *
     * **Built always and hidden, rather than built conditionally.** Creating it only when both engines are enabled
     * is a decision taken once — as the page is built — so switching an engine off below would leave this row on
     * screen offering a choice that no longer exists, until leaving the page and coming back rebuilt it. A row
     * whose visibility depends on
     * state has to be told when that state moves; `syncPreferredMethod` is that telling.
     */
    const preferredRow = new Setting(A)
      .setName(t('listening_page.preferred_method'))
      .setDesc(t('listening_page.preferred_method_desc'));
    let preferredDd: DropdownComponent | null = null;
    preferredRow.addDropdown((d) => {
      preferredDd = d;
      d.addOptions({
        piper: t('listening_page.gen_method_piper'),
        server: t('listening_page.gen_method_server'),
      })
        .setValue(this.preferredGenMethod())
        .onChange((v) => {
          setGenConfig({ method: v === 'server' ? 'server' : 'piper' });
          this.renderSettings(); // the parent entry names this engine's voice
        });
    });
    const syncPreferredMethod = (): void => {
      preferredRow.settingEl.toggle(genMethodIsAChoice(readGenConfig()));
      /**
       * Written onto the element rather than through `setValue`, for the reason the switch below documents: an
       * Obsidian component's `setValue` fires its own `onChange`, and this one calls `renderSettings()`. The value
       * needs syncing at all because `preferredGenMethod` falls back to whichever engine is still on — so it can
       * move without anyone touching this control.
       */
      if (preferredDd) preferredDd.selectEl.value = this.preferredGenMethod();
    };
    syncPreferredMethod();
    // Same as the live-voice page: the accordion is inside a real row, or none of it can be tabbed to. One row for
    // the whole list — each model is an expandable block rather than a control, so a row apiece would be a gray box
    // around a gray box.
    const genRow = new Setting(A);
    genRow.settingEl.addClass('orbis-setting-stacked');
    genRow.controlEl.addClasses(['orbis-stacked-column', 'orbis-stacked-full']);
    const genCard = genRow.controlEl;
    const cacheDir = `${this.plugin.app.vault.configDir}/plugins/orbis-reader/piper-cache`;

    // Each model's expanded body: its description + voice config. Rendered regardless of active
    // state, so a model can be set up before being switched on.
    const renderPiperBody = (body: HTMLElement, onVoiceChange: () => void): void => {
      body.createDiv({ cls: 'orbis-voice-method-desc', text: t('listening_page.gen_piper_voice_desc') });
      const box = body.createDiv({ cls: 'orbis-recording-voice' });
      this.genPiperPicker = new VoicePicker(
        box,
        {
          getVoice: () => readGenConfig().piperVoice,
          setVoice: (v) => {
            setGenConfig({ piperVoice: v });
            onVoiceChange();
          },
          pauseAudio: () => this.plugin.pauseListening(),
        },
        {
          method: 'piper',
          label: t('listening_page.gen_method_piper'),
          provider: createPiperVoiceProvider(
            this.plugin.app.vault.adapter,
            cacheDir,
            () => deviceSetting('ttsRate') || 1
          ),
        }
      );
      void this.genPiperPicker.render();
    };
    const renderServerBody = (body: HTMLElement, onVoiceChange: () => void): void => {
      this.genVoiceOnChange = onVoiceChange;
      new Setting(body)
        .setName(t('listening_page.gen_server_url'))
        .setDesc(t('listening_page.gen_server_url_desc'))
        .setClass('orbis-gen-server-url') // URLs are long — stack field + refresh full-width
        .addText((tx) =>
          tx
            .setPlaceholder(t('listening_page.gen_server_url_ph'))
            .setValue(readGenConfig().serverUrl)
            .onChange((value) => setGenConfig({ serverUrl: value.trim() }))
        )
        .addButton((b) =>
          b.setButtonText(t('listening_page.gen_refresh_voices')).onClick(() => {
            if (this.genVoiceContainer) void this.renderGenVoicePicker(this.genVoiceContainer);
          })
        );
      // Model is hardcoded ("kokoro") behind the scenes for now — only Kokoro is supported.
      this.buildGenVoiceRow(body);
      // Request parallelization is a technical knob (only helps a GPU server) — hide it unless
      // developer options are enabled.
      if (deviceSetting('showDevOptions')) {
        new Setting(body)
          .setName(t('listening_page.gen_concurrency'))
          .setDesc(t('listening_page.gen_concurrency_desc'))
          .addDropdown((dd) => {
            for (let n = 1; n <= 8; n++) dd.addOption(String(n), String(n));
            dd.setValue(String(readGenConfig().concurrency)).onChange((value) =>
              setGenConfig({ concurrency: Number(value) })
            );
          });
      }
    };

    // Collapsed-row summary of a model's current default voice.
    const piperSummary = (): string => {
      const { id, speaker } = splitPiperVoice(readGenConfig().piperVoice);
      const v = orbisVoiceById(id);
      if (!v) return readGenConfig().piperVoice;
      const accent = v.accent === 'US' ? t('listening_page.american_english') : t('listening_page.british_english');
      return v.multiSpeaker ? `${v.name} — ${accent} · ${speaker + 1}` : `${v.name} — ${accent}`;
    };
    /** One engine in the accordion. `blockedReason` is why it cannot be switched on yet, or null when it can. */
    interface GenModel {
      method: string;
      label: string;
      isActive: () => boolean;
      setActive: (on: boolean) => void;
      blockedReason?: () => string | null;
      summary: () => string;
      renderBody: (body: HTMLElement, onVoiceChange: () => void) => void;
    }
    const models: GenModel[] = [
      {
        method: 'piper',
        label: t('listening_page.gen_method_piper'),
        isActive: () => readGenConfig().piperEnabled,
        setActive: (on: boolean) => setGenConfig({ piperEnabled: on }),
        summary: piperSummary,
        renderBody: renderPiperBody,
      },
      {
        method: 'server',
        label: t('listening_page.gen_method_server'),
        isActive: () => readGenConfig().serverEnabled,
        setActive: (on: boolean) => setGenConfig({ serverEnabled: on }),
        // **Cannot be switched on until it has somewhere to go.** Expand the row, give it a URL and a voice, and
        // the switch works. Without this the switch would be the only gate, and a stored `true` is a claim that
        // outlives whatever made it true — a reset vault could offer a server it had never been told about.
        blockedReason: () => {
          const cfg = readGenConfig();
          if (!cfg.serverUrl) return t('notices.gen_server_needs_url');
          if (!cfg.voice) return t('notices.gen_server_needs_voice');
          return null;
        },
        // `describeVoice('')` is `''`, which would leave the row reading "Voice:" and nothing after it. With no
        // default voice, that is the state a fresh install is IN, so it needs words of its own.
        summary: () => {
          const { voice } = readGenConfig();
          return voice ? describeVoice(voice) : t('listening_page.gen_voice_unset');
        },
        renderBody: renderServerBody,
      },
    ];

    const list = genCard.createDiv();
    // One model open at a time; all collapsed when settings opens.
    let openMethod: string | null = null;
    /**
     * Expanding a model, or switching one off, redraws the whole list — so the keyboard has to be put back. Keyed by
     * METHOD rather than by position: the row you opened is the row you were standing on, whichever order they are in.
     */
    const renderModels = (): void => rebuildKeepingFocus(list, buildModels);
    const buildModels = (): void => {
      this.genPiperPicker?.destroy(); // rebuilt if Piper is the open model
      this.genPiperPicker = null;
      list.empty();
      for (const m of models) {
        const row = list.createDiv({ cls: 'orbis-record-model' });
        const head = row.createDiv({ cls: 'orbis-record-model-head' });
        /**
         * **A real `<button>`, not a `role="button"` div.** With a div, Tab reaches the whole of an expanded model and
         * then stops dead: from the last control inside it, the next model's header never comes, so the second half
         * of the page is unreachable whenever the first half is collapsed. A div can be focusable by every measure we
         * can check — `tabindex="0"`, visible, not inert — and Obsidian's settings pane walks straight past it
         * anyway. Its `.modal-close-button` and its extra buttons are divs and are not reachable there either, which
         * is the pattern: inside settings, be a real control or be skipped.
         *
         * It also gets the shape right. The switch is a SIBLING of the button rather than a child, so the row is a
         * disclosure and a switch side by side — two controls, honestly — instead of one control with another buried
         * in it, which would be invalid HTML and need a click-swallower to stop the switch from also opening the row.
         */
        const disc = head.createEl('button', { cls: 'orbis-record-model-disc' });
        disc.setAttribute('aria-expanded', String(openMethod === m.method));
        disc.dataset.orbisFocus = `record-head:${m.method}`;
        const chevron = disc.createSpan({ cls: 'orbis-record-model-chevron' });
        setIcon(chevron, openMethod === m.method ? 'chevron-down' : 'chevron-right');
        const textCol = disc.createDiv({ cls: 'orbis-record-model-text' });
        textCol.createDiv({ cls: 'orbis-record-model-name', text: m.label });
        const voiceEl = textCol.createDiv({
          cls: 'orbis-record-model-voice',
          text: t('listening_page.record_model_voice', { voice: m.summary() }),
        });
        disc.addEventListener('click', () => {
          openMethod = openMethod === m.method ? null : m.method;
          renderModels();
        });
        // Keep the collapsed-row summary in sync when the voice changes in the expanded picker.
        const refreshSummary = (): void =>
          voiceEl.setText(t('listening_page.record_model_voice', { voice: m.summary() }));
        // Active state + switch, beside the disclosure rather than inside it.
        const right = head.createDiv({ cls: 'orbis-record-model-state' });
        const stateEl = right.createSpan();
        const paintState = (): void => {
          stateEl.setText(t(m.isActive() ? 'listening_page.record_active' : 'listening_page.record_inactive'));
          stateEl.className = m.isActive() ? 'orbis-record-active' : 'orbis-record-inactive';
        };
        paintState();
        // The last way to record cannot be switched off: its switch is disabled and the row says why, as every
        // "at least one" list does — not offered and then refused with a notice.
        const lastOn = m.isActive() && enabledGenMethods(readGenConfig()).length <= 1;
        if (lastOn)
          textCol.createDiv({ cls: 'orbis-record-model-voice', text: t('listening_page.record_method_min_one') });
        const tg = new ToggleComponent(right);
        tg.setDisabled(lastOn);
        // The KEY GOES ON THE INPUT, not on the container: `rebuildKeepingFocus` reads the key off the element that
        // actually holds focus, and Obsidian's toggle is a div wrapping a checkbox.
        const box = tg.toggleEl.querySelector('input');
        if (box) box.dataset.orbisFocus = `record-active:${m.method}`;
        tg.setValue(m.isActive()).onChange((on) => {
          /**
           * **A refusal REDRAWS; it never calls `setValue`.**
           *
           * Obsidian's `ToggleComponent.setValue` fires the change callback, so putting the switch back from inside
           * this handler re-enters it. With one guard bouncing to `true` and the other to `false` the two would call
           * each other without end, freezing Obsidian and burying the screen in notices.
           *
           * Redrawing is both the safe and the simpler thing: the rebuilt switch reads `isActive()`, which is the
           * stored truth and has not changed, so it draws itself back to where it was with nobody telling it to.
           */
          const refuse = (why: string, open?: boolean): void => {
            new Notice(why);
            // The row holding the missing field, so the answer is on screen rather than behind a chevron.
            if (open) openMethod = m.method;
            renderModels();
          };
          // Turning something ON can be refused too, when the engine has nothing to reach.
          const blocked = on ? m.blockedReason?.() : null;
          if (blocked) return refuse(blocked, true);
          m.setActive(on);
          // The row above is only offered when BOTH engines are on, so switching one changes whether it belongs.
          syncPreferredMethod();
          // Redrawn, not repainted: switching one method changes whether the OTHER is the last one on, and the lock is
          // worked out as the rows are drawn — repainting only this row left the other unlocked, so both could go off.
          renderModels();
        });
        if (openMethod === m.method) m.renderBody(row.createDiv({ cls: 'orbis-record-model-body' }), refreshSummary);
      }
    };
    renderModels();
  }

  /**
   * The glossary: one row on the Listening page, not a page of its own.
   *
   * **A page with one row on it is a tap that buys nothing.** The row says what a glossary is for and opens the
   * editor, which is all such a page would do.
   */
  /**
   * **Downloaded voices** — the one place an Orbis voice is deleted.
   *
   * Beside the two voice entries because it is about the same files, and a row rather than a page: what it opens is a
   * list to work through, not settings to navigate. See `downloaded-voices-dialog.ts`.
   */
  private downloadedVoicesRow(): SettingDefinitionItem {
    return {
      name: t('downloaded_voices.row_name'),
      desc: t('downloaded_voices.row_desc'),
      render: (setting) => {
        setting.addButton((b) =>
          b
            .setButtonText(t('downloaded_voices.manage'))
            .onClick(() => openDownloadedVoicesDialog(this.app, this.plugin, this.piperCacheDir()))
        );
      },
    };
  }

  private glossaryRow(): SettingDefinitionItem {
    const count = (this.plugin.settings.pronunciations ?? []).length;
    return {
      type: 'group',
      heading: t('listening_page.pron_heading'),
      items: [
        {
          // What the glossary holds, rather than a label repeating the heading above it — the same shape the
          // library's status row has, where the number is the reason to open the thing.
          name:
            count === 0
              ? t('listening_page.pron_none')
              : count === 1
                ? t('listening_page.pron_one')
                : t('listening_page.pron_many', { count: String(count) }),
          desc: t('listening_page.pron_desc'),
          render: (setting) => {
            setting.addButton((b) => {
              b.setButtonText(t('listening_page.pron_manage')).onClick(() =>
                // The row above counts the glossary, so a change has to redraw it — deferred until the dialog
                // closes, as every redraw behind one of ours is (`renderSettings`).
                new PronunciationsModal(
                  this.plugin,
                  createPronunciationStore(this.plugin, () => this.renderSettings())
                ).open()
              );
              // The glyph the dialog itself wears, so the launcher and its destination match — rather than an
              // ellipsis doing the same job in punctuation.
              b.buttonEl.addClass('orbis-btn-with-icon');
              const glyph = createSpan({ cls: 'orbis-btn-icon' });
              setSvgIcon(glyph, glossarySvg(14));
              b.buttonEl.prepend(glyph);
            });
          },
        },
      ],
    };
  }
  /**
   * The Listening page: the two voices, how playback behaves, and what the player's buttons capture.
   *
   * **Three sub-pages and two groups.** The voice pickers and the glossary are editors — accordions, download
   * progress, a modal launcher — so they stay imperative behind `page:` entries. Playback and the player buttons
   * are ordinary rows, so they are groups on this page rather than another two taps away. Search reaches a row
   * either way; the split is about what is worth navigating to.
   *
   * **Pronunciation sits last**, below the player, because it is the least-visited thing here and the only one
   * that is a library rather than a preference.
   */
  private listeningItems(): SettingDefinitionItem[] {
    this.refreshLiveVoiceReadiness();
    this.refreshRecordedVoiceReadiness();
    const skipOptions = Object.fromEntries(
      SKIP_SECONDS_OPTIONS.map((n) => [String(n), t('listening_page.n_seconds', { n })])
    );
    return [
      // `displayValue` puts the chosen voice on the entry, so the page says which voice you have without being
      // opened. The preview rows do the other half: hearing the voice should not require going in either.
      {
        ...this.subPage(
          t('listening_page.voice'),
          this.glyphDesc(VOICE_LIVE_SVG, t('listening_page.voice_page_desc')),
          (el) => this.buildVoicePicker(el),
          () => this.releaseVoices()
        ),
        // *not downloaded* says it, with no warning marker. A new install has no voice downloaded, so a marker would
        // sit on the entry for every reader who never listens — and listening asks for a voice when first wanted.
        displayValue: () => this.liveVoiceSummary(),
      },
      this.previewRow('live'),
      {
        ...this.subPage(
          t('listening_page.generation_heading'),
          this.glyphDesc(VOICE_RECORDED_SVG, t('listening_page.generation_desc')),
          (el) => this.buildRecordedVoicePage(el),
          () => this.releaseVoices()
        ),
        // The voice the next recording would use. On-device recording is on by default and the last way of
        // recording on cannot be turned off, so *Nothing enabled* is a guard for a state the page does not allow.
        displayValue: () => this.recordedVoiceSummary(),
      },
      this.previewRow('recorded'),
      this.downloadedVoicesRow(),
      {
        type: 'group',
        heading: t('listening_page.playback_heading'),
        items: [
          {
            name: t('listening_page.skip_back'),
            // One caveat, on one row: repeating a shared lead-in verbatim under both would be two lines of identical
            // text for a pair of dropdowns that sit next to each other.
            desc: t('listening_page.skip_back_desc'),
            control: { type: 'dropdown', key: 'skipBackSeconds', options: skipOptions },
          },
          {
            name: t('listening_page.skip_forward'),
            desc: t('listening_page.skip_forward_desc'),
            control: { type: 'dropdown', key: 'skipForwardSeconds', options: skipOptions },
          },
          {
            name: t('listening_page.read_ahead'),
            desc: t('listening_page.read_ahead_desc'),
            control: {
              type: 'dropdown',
              key: 'readAhead',
              options: {
                sentence: t('listening_page.sentence'),
                'few-sentences': t('listening_page.a_few_sentences'),
              },
            },
          },
          {
            name: t('listening_page.reading_highlight'),
            desc: t('listening_page.reading_highlight_desc'),
            control: {
              type: 'dropdown',
              key: 'readingHighlight',
              options: {
                off: t('listening_page.off'),
                word: t('listening_page.word'),
                sentence: t('listening_page.sentence'),
                paragraph: t('listening_page.paragraph'),
              },
            },
          },
          {
            // A `render` row, not a control: the setting is `'recorded' | 'live'` and the row is a switch. Rather
            // than teach the key resolver a boolean alias for one row, the row does its own reading.
            name: t('voice_and_source.always_live_name'),
            desc: t('voice_and_source.always_live_desc'),
            render: (setting) => {
              /**
               * The live glyph beside the name of the switch that forces it.
               *
               * The fourth place the pair appears, and the one furthest from the book — flip this and every chip in
               * the app shows these arcs, so the row and the state it causes say the same thing in the same shape.
               * Set through `setName` with a fragment rather than drawn into the row: the layout stays Obsidian's.
               */
              const name = createFragment();
              setSvgIcon(name.appendChild(createSpan({ cls: 'orbis-setting-name-icon' })), VOICE_LIVE_SVG);
              name.append(t('voice_and_source.always_live_name'));
              setting.setName(name);
              setting.addToggle((tog) =>
                tog.setValue(deviceSetting('playbackSource') === 'live').onChange((value) => {
                  // Beside the device, not in `data.json`: a device with a voice downloaded and one without want
                  // different answers, so this never travels — and there is nothing to save.
                  setDeviceSetting('playbackSource', value ? 'live' : 'recorded');
                  this.plugin.reloadListeningSource(); // re-seat any live session onto the new source
                })
              );
            },
          },
          {
            name: t('listening_page.keep_screen_awake'),
            desc: t('listening_page.keep_screen_awake_desc'),
            control: { type: 'toggle', key: 'keepScreenAwakeWhileListening' },
          },
        ],
      },
      {
        type: 'group',
        heading: t('listening_page.full_screen_audio_player'),
        desc: t('listening_page.player_desc'),
        items: [
          {
            // Named for how much text the button takes. "Mark the passage" or "Note button" would read as though they
            // chose WHICH mark is used — a different setting entirely, and one that lives with the marks.
            name: t('listening_page.highlight_button'),
            control: {
              type: 'dropdown',
              key: 'audioHighlightGranularity',
              options: { sentence: t('listening_page.sentence'), paragraph: t('listening_page.paragraph') },
            },
          },
          {
            name: t('listening_page.note_button'),
            control: {
              type: 'dropdown',
              key: 'audioNoteGranularity',
              options: { sentence: t('listening_page.sentence'), paragraph: t('listening_page.paragraph') },
            },
          },
        ],
      },
      this.glossaryRow(),
    ];
  }

  /**
   * The live voice's name, as the Listen bar's chip and the glossary's preview list already say it.
   *
   * Through `pronunciation-service`'s own helpers rather than a fourth spelling of the same thing: a voice named
   * "Bella" in one place and "af_bella" in another is how a raw id ends up on screen.
   */
  private liveVoiceSummary(): string {
    // The entry exists to say which voice you HAVE without opening the page, and a bare name you cannot hear does
    // not answer that. Nor does *No voice*, which the Listen chip says for want of room: one IS selected, and this
    // page is where it is downloaded. So the name, and what it lacks. Only an Orbis voice can be missing — a system
    // voice the device cannot speak falls through to one.
    const pref = this.plugin.getDeviceVoicePref();
    if (this.liveVoiceReady === false)
      return t('listening_page.voice_not_downloaded', { voice: orbisDisplayName(pref) });
    const live = resolveDeviceLiveVoice(pref, WebSpeechEngine.isSupported());
    return live.source === 'orbis' ? orbisDisplayName(pref) : systemDisplayName(pref?.systemVoiceURI);
  }

  /**
   * Look on disk for the chosen live voice's model, and repaint the entry if the answer moved.
   *
   * Shaped like `refreshSetupStatus`, and guarded the same way: `update()` rebuilds every definition, which calls
   * this again, so it repaints only on a real change and the second pass ends it.
   */
  private refreshLiveVoiceReadiness(): void {
    if (this.liveVoiceResolving) return;
    this.liveVoiceResolving = true;
    const pref = this.plugin.getDeviceVoicePref();
    const live = resolveDeviceLiveVoice(pref, WebSpeechEngine.isSupported());
    // A system voice needs no download — it is there whenever Web Speech is. Same split as `canSpeakNow`.
    const probe =
      live.source === 'orbis'
        ? isOrbisVoiceDownloaded(
            this.plugin.app.vault.adapter,
            this.piperCacheDir(),
            orbisVoiceOrDefault(pref?.orbisVoiceId).path
          )
        : Promise.resolve(WebSpeechEngine.isSupported());
    void probe.then((ready) => {
      this.liveVoiceResolving = false;
      if (ready === this.liveVoiceReady) return;
      this.liveVoiceReady = ready;
      this.update();
    });
  }

  /** `refreshLiveVoiceReadiness` for the recording voice: an Orbis voice is looked for on disk, a server's is not. */
  private refreshRecordedVoiceReadiness(): void {
    if (this.recordedVoiceResolving) return;
    this.recordedVoiceResolving = true;
    const v =
      this.preferredGenMethod() === 'piper' ? orbisVoiceById(splitPiperVoice(readGenConfig().piperVoice).id) : null;
    const probe = v
      ? isOrbisVoiceDownloaded(this.plugin.app.vault.adapter, this.piperCacheDir(), v.path)
      : Promise.resolve(true);
    void probe.then((ready) => {
      this.recordedVoiceResolving = false;
      if (ready === this.recordedVoiceReady) return;
      this.recordedVoiceReady = ready;
      this.update();
    });
  }

  /** What recording would use: the enabled engines and their voices, or nothing if neither is on. */
  private recordedVoiceSummary(): string {
    const cfg = readGenConfig();
    if (!cfg.piperEnabled && !cfg.serverEnabled) return t('listening_page.record_none_enabled');
    // ONE voice, not both: the entry answers "what would the next recording use", and that is the preferred
    // engine's voice. Listing every enabled engine named two things and said which one leads about neither.
    if (this.preferredGenMethod() === 'server') return shortVoiceLabel(describeVoice(cfg.voice));
    const { id, speaker } = splitPiperVoice(cfg.piperVoice);
    const v = orbisVoiceById(id);
    if (!v) return cfg.piperVoice;
    const name = shortVoiceLabel(describeEditionVoice('piper-ondevice', v.multiSpeaker ? `${id}#${speaker}` : id));
    // Said as Live voice says it, so one voice missing from this device reads the same on both entries. Recording
    // asks before it downloads, so this is information rather than a fault.
    return this.recordedVoiceReady === false ? t('listening_page.voice_not_downloaded', { voice: name }) : name;
  }

  /** The engine a new recording starts on. Falls back to whichever is enabled when the stored preference names
   *  one that has since been switched off — a preference for something unavailable is not a preference. */
  private preferredGenMethod(): 'piper' | 'server' {
    const cfg = readGenConfig();
    if (cfg.method === 'server' && cfg.serverEnabled) return 'server';
    if (cfg.method === 'piper' && cfg.piperEnabled) return 'piper';
    return cfg.serverEnabled ? 'server' : 'piper';
  }

  /**
   * A row that auditions the voice named on the entry above it.
   *
   * Its own row because a page entry has no room for a control — `SettingDefinitionPage` carries a name, a
   * description and a value, and nothing that can be clicked except the entry itself. Reuses the same preview
   * machinery the pickers use, so an audition here stops the book audio and any other audition exactly as one
   * started inside the picker would.
   */
  private previewRow(which: 'live' | 'recorded'): SettingDefinitionItem {
    return {
      name: t(which === 'live' ? 'listening_page.preview_live' : 'listening_page.preview_recorded'),
      searchable: false, // the voice pages above are what someone searches for; this is an action on them
      render: (setting) => {
        setting.addExtraButton((b) => {
          // Held so the icon can follow what is playing. A button that looks identical before and after a tap
          // leaves you unsure the tap landed at all — and a voice can take a moment to start, or to download.
          this.previewButtons[which] = b;
          this.paintPreviewButtons();
          b.onClick(() => {
            // An ExtraButtonComponent is a div, so `setDisabled` dims it without stopping a click or an Enter
            // reaching this. The dimming is the message; this is what makes it true.
            if (which === 'live' && this.liveVoiceReady === false) return;
            // Tapping the one that is playing stops it; tapping the other switches, since a preview always
            // interrupts whatever was already sounding.
            if (this.previewPlaying === which) {
              this.stopVoicePreview();
              return;
            }
            if (which === 'live') this.previewLiveVoice();
            else this.previewRecordedVoice();
          });
        });
      },
    };
  }

  /**
   * Play on the idle rows, pause on the one sounding — and nothing to press when there is nothing to hear.
   *
   * **Disabled rather than hidden, which is the exception to the rule and not a drift from it.** Rows get hidden
   * here when they do not apply to how this device is set up; this one applies exactly as much as ever — a live
   * voice is chosen, its files are simply not here. So the row stays, dimmed, directly under the entry that says
   * *not downloaded*: the two read as one statement, and the page does not change shape when a download lands.
   *
   * Left enabled it would be worse than dead: `speakOnce` fetches the model it needs, so a play icon on a settings
   * page would be a 75 MB download nobody asked for.
   *
   * Painted here, in the one place that owns how these buttons look, rather than at the row that builds them —
   * `update()` rebuilds the definitions and this runs again, so there is one answer and no copy of it to go stale.
   */
  private paintPreviewButtons(): void {
    for (const which of ['live', 'recorded'] as const) {
      const btn = this.previewButtons[which];
      if (!btn) continue;
      const playing = this.previewPlaying === which;
      // Only the live row: a recording's own voice downloads when the recording runs, so previewing it here is
      // the documented way to fetch it and not a surprise.
      const silent = which === 'live' && this.liveVoiceReady === false;
      btn.setDisabled(silent);
      btn.extraSettingsEl.toggleClass('orbis-preview-silent', silent);
      btn.setIcon(playing ? 'pause' : 'play');
      btn.setTooltip(
        t(
          silent
            ? 'listening_page.preview_needs_voice'
            : playing
              ? 'listening_page.preview_stop'
              : 'listening_page.preview_play'
        )
      );
    }
  }

  /** Mark a preview row as sounding (or not) and repaint. */
  private setPreviewPlaying(which: 'live' | 'recorded' | null): void {
    this.previewPlaying = which;
    this.paintPreviewButtons();
  }

  /**
   * Audition the voice a new recording would use — which means asking WHICH ENGINE first.
   *
   * `previewGenVoice` serves the server body of the accordion and always goes to the server, so from a page-level
   * button it would play Kokoro while the entry beside it names a Piper voice. The label and the
   * sound have to come from the same answer, and that answer is `preferredGenMethod()`.
   */
  private previewRecordedVoice(): void {
    if (this.preferredGenMethod() === 'server') {
      this.previewGenVoice();
      return;
    }
    const { id, speaker } = splitPiperVoice(readGenConfig().piperVoice);
    // A recording voice not on this device is asked for, as every voice is — never fetched by a sample button.
    const missing = orbisVoiceById(id);
    void (async () => {
      if (missing && !(await isOrbisVoiceDownloaded(this.app.vault.adapter, this.piperCacheDir(), missing.path))) {
        if (!(await orbisVoiceAsker(this.app, this.piperCacheDir())(missing))) return;
      }
      this.auditionRecordedVoice(id, speaker);
    })();
  }

  private auditionRecordedVoice(id: string, speaker: number): void {
    this.beginVoicePreview(); // stop any prior audition and pause the book; bumps previewEpoch
    this.previewingVoiceId = GEN_PREVIEW_ID;
    this.setPreviewPlaying('recorded');
    const epoch = this.previewEpoch;
    const provider = createPiperVoiceProvider(this.plugin.app.vault.adapter, this.piperCacheDir(), () =>
      deviceSetting('ttsRate') ? deviceSetting('ttsRate') : 1
    );
    void provider
      .preview(id, speaker, () => {
        if (epoch === this.previewEpoch && this.previewingVoiceId === GEN_PREVIEW_ID) {
          this.previewingVoiceId = null;
          this.voicePreview = null;
          this.setPreviewPlaying(null);
        }
      })
      .then((handle) => {
        // Loading the voice can take a while — long enough for the reader to have started something else by the time
        // it resolves.
        if (epoch !== this.previewEpoch) handle.stop();
        else this.voicePreview = handle;
      })
      .catch(() => {
        this.setPreviewPlaying(null); // a voice that never downloaded is not playing
        new Notice(t('listening_page.preview_failed'));
      });
  }

  /** Audition the device's live voice with the same one-shot path the glossary's preview list uses. */
  private previewLiveVoice(): void {
    const pref = this.plugin.getDeviceVoicePref();
    const voice = resolveDeviceLiveVoice(pref, WebSpeechEngine.isSupported());
    this.beginVoicePreview(); // stop any prior audition and pause the book; bumps previewEpoch
    this.setPreviewPlaying('live');
    const epoch = this.previewEpoch;
    void speakOnce(
      {
        adapter: this.app.vault.adapter,
        cacheDir: this.piperCacheDir(),
        rate: () => deviceSetting('ttsRate') || 1,
        voice: () => voice,
        askForVoice: () => askForLiveVoice(this.app, this.plugin), // the live voice: the full prompt
      },
      t('listening_page.voice_preview_sample'),
      () => {
        if (epoch !== this.previewEpoch) return; // a newer preview owns the buttons now
        this.voicePreview = null;
        this.setPreviewPlaying(null);
      }
    )
      .then((handle) => {
        // A slow synthesis that resolves after the reader started something else must not play over it.
        if (epoch === this.previewEpoch) this.voicePreview = handle;
        else handle.stop();
      })
      .catch((err) => {
        // Without this the button stayed on Stop with nothing playing, and nothing said why.
        if (epoch !== this.previewEpoch) return;
        this.voicePreview = null;
        this.setPreviewPlaying(null);
        if (!(err instanceof VoiceNotHereError)) new Notice(t('listening_page.preview_failed'));
      });
  }

  /**
   * The Annotations page: what a reader adds to a book, and what becomes of it.
   *
   * **An annotation is everything a reader adds** — a passage selection with marks, a note with or without one, a
   * bookmark — and naming that is the whole argument for the page. "Export" is not a category but a shelf: it would
   * answer *what do I do with what I wrote* and *what format do I want this book in* from one list, and Reading
   * records answers neither, being a standing arrangement rather than an export at all.
   *
   * **Ordered from what you make to what you get out of it**: the marks you annotate with, the records written as
   * you read, then the two on-demand exports. Reading records sits above those because it is the bigger
   * commitment — turn it on and every selection, note and bookmark becomes a note by itself, where a note style
   * shapes a file you ask for.
   *
   * `confirmDeleteNote` deliberately lives on Reading behavior. It guards deleting the note attached to a
   * highlight, which is a question about how careful a tap should be rather than about the marks you curate — and
   * a lone checkbox under four rows that all open something is the worse page.
   */
  private annotationItems(): SettingDefinitionItem[] {
    return [
      /**
       * **First, because the page's name leads with it.** The manager is a dialog rather than a page — it is also
       * reached from a palette command, the reader's toolbar and the listening bar, so the settings entry is one
       * door of four — and a row that opens one is what Obsidian's `action` is for.
       *
       * Not at the ROOT: Obsidian draws an action in the accent color and with no chevron, which is the correct
       * distinction (a chevron promises a page) and reads as an oddity among rows that all navigate. Inside a page
       * it is simply a row. Adding the chevron ourselves would be the wrong fix — it would promise navigation and
       * open a modal.
       */
      {
        name: t('presets.manage'),
        desc: t('presets.desc'),
        action: () => openAnnotationPresets(this.app, this.plugin),
      },
      {
        type: 'page' as const,
        name: t('reading_records_page.heading'),
        desc: t('reading_records_page.desc'),
        items: this.recordsItems(),
      },
      this.subPage(t('notes_styles_page.heading'), t('notes_styles_page.desc'), (el) =>
        this.noteStyles.buildNoteStylesPage(el)
      ),
      {
        type: 'page' as const,
        name: t('annotations_pdf_page.heading'),
        desc: t('annotations_pdf_page.desc'),
        items: this.annotationsPdfItems(),
      },
    ];
  }

  /**
   * The Conversions page: a whole document turned into another format.
   *
   * **"Conversion", not "export", because the direction varies.** Save as EPUB reads Obsidian notes and writes a
   * book; the other two read a book and write into the vault. Calling both exports would keep the page from
   * reading as one idea — the second half of why "Export" is a shelf (the first is on `annotationItems` above).
   *
   * Save as PDF sits between them in the order a reader meets the two artifacts: Markdown is what a book becomes
   * inside Obsidian, PDF is what it becomes to send.
   */
  private conversionItems(): SettingDefinitionItem[] {
    return [
      {
        type: 'page' as const,
        name: t('save_as_markdown_page.heading'),
        desc: t('save_as_markdown_page.intro_desc'),
        items: this.bookExportItems(),
      },
      {
        type: 'page' as const,
        name: t('save_as_pdf_page.heading'),
        desc: t('save_as_pdf_page.desc'),
        items: this.bookPdfItems(),
      },
      {
        type: 'page' as const,
        name: t('save_as_epub_page.heading'),
        desc: t('save_as_epub_page.desc'),
        items: this.epubItems(),
      },
    ];
  }

  /**
   * How every book opens, and how a note read in Orbis Reader opens.
   *
   * **The same two questions asked twice**, which is why each set carries a heading — and why *Read in Orbis
   * Reader* is a drill-down rather than four loose rows: the group says what the answers are about before the
   * answers arrive. Settings search will show two rows called *How the book opens*; the heading and the page
   * title are what tell them apart.
   */
  private openingItems(): SettingDefinitionItem[] {
    const modes = {
      standard: t('read_in_orbis_page.opens_standard'),
      focus: t('read_in_orbis_page.opens_focus'),
      listen: t('read_in_orbis_page.opens_listen'),
    };
    const bars = {
      listen: t('read_in_orbis_page.bar_listen'),
      search: t('read_in_orbis_page.bar_search'),
      none: t('read_in_orbis_page.bar_none'),
    };
    return [
      {
        type: 'group',
        heading: t('reading_page.open_heading'),
        items: [
          {
            name: t('reading_page.open_mode'),
            desc: t('reading_page.open_mode_desc'),
            control: { type: 'dropdown', key: 'openBookMode', options: modes },
          },
          {
            name: t('reading_page.open_bar'),
            desc: t('reading_page.open_bar_desc'),
            // Hidden under the full-screen player, which covers the page a bar would sit on — the same rule the
            // feature's own page follows.
            visible: () => deviceSetting('openBookMode') !== 'listen',
            control: { type: 'dropdown', key: 'openBookBar', options: bars },
          },
          {
            type: 'page' as const,
            name: t('read_in_orbis_page.heading'),
            desc: t('read_in_orbis_page.desc'),
            items: this.readInOrbisItems(modes, bars),
            /**
             * **What it is set to, but only when that differs from the two rows above it.**
             *
             * Following, the answer is already on screen — it IS those rows — and repeating it here would be the
             * same fact twice, reading as a second setting that happens to agree rather than as the same one.
             * Empty says "nothing special", which is what following means. The value appears exactly when it
             * carries information.
             */
            displayValue: () => this.readInOrbisSummary(modes, bars),
          },
        ],
      },
    ];
  }

  /**
   * The mode and the bar this command is set to, or nothing while it is following the rows above.
   *
   * The player takes no bar — it covers the page one would sit on — so it names itself alone rather than
   * claiming a bar it will not show.
   */
  private readInOrbisSummary(modes: Record<string, string>, bars: Record<string, string>): string {
    if (!deviceSetting('readInOrbisOwnSettings')) return '';
    const mode = deviceSetting('readInOrbisMode');
    const modeText = modes[mode] ?? mode;
    return mode === 'listen' ? modeText : `${modeText} · ${bars[deviceSetting('readInOrbisBar')] ?? ''}`;
  }

  /**
   * *Read in Orbis Reader*: how a converted note arrives, and what it is called in the library.
   *
   * **Its own page beside Save as EPUB, sharing one converter.** The settings separate because once the
   * destination, the naming and the type all differ, sharing saves nothing and partial sharing is the worst of
   * both — a reader changes one and cannot predict what moved. `markdown-epub.ts` stays the single
   * implementation, which is where the sharing that matters actually is.
   *
   * **Where the book goes and what it is called are absent on purpose.** They are mechanism rather than
   * preference: the book sits beside its note and takes its name so the command can find it again on every
   * invocation, which no other conversion has to do. See docs/design/read-in-orbis-reader.md.
   */
  private readInOrbisItems(modes: Record<string, string>, bars: Record<string, string>): SettingDefinitionItem[] {
    return [
      {
        name: t('read_in_orbis_page.own'),
        desc: t('read_in_orbis_page.own_desc'),
        control: { type: 'toggle', key: 'readInOrbisOwnSettings' },
      },
      {
        name: t('read_in_orbis_page.opens'),
        desc: t('read_in_orbis_page.opens_desc'),
        // Hidden while following, for the same reason the bar row is hidden under the player: a control with no
        // possible effect should not be on screen.
        visible: () => deviceSetting('readInOrbisOwnSettings'),
        control: { type: 'dropdown', key: 'readInOrbisMode', options: modes },
      },
      {
        name: t('read_in_orbis_page.bar'),
        desc: t('read_in_orbis_page.bar_desc'),
        /**
         * **Hidden, not grayed, when the full-screen player is chosen.** A bar over a full-screen player is not a
         * choice with a wrong answer — it is a choice that does not exist there, and a hidden row says so where a
         * grayed one invites you to wonder what you did wrong.
         */
        visible: () => deviceSetting('readInOrbisOwnSettings') && deviceSetting('readInOrbisMode') !== 'listen',
        control: { type: 'dropdown', key: 'readInOrbisBar', options: bars },
      },
      // Only when the library is on, like its opposite number on the Save as EPUB page: it exists for the title
      // note, and there is no title note without a library.
      {
        name: t('read_in_orbis_page.type'),
        desc: t('read_in_orbis_page.type_desc'),
        visible: () => this.plugin.settings.libraryEnabled,
        control: { type: 'text', key: 'readInOrbisType', placeholder: 'obsidian-note' },
      },
    ];
  }

  /** A page entry whose body is still imperative — an editor rather than a list of settings. */
  private subPage(
    name: string,
    desc: string | DocumentFragment,
    render: (el: HTMLElement) => void,
    cleanup?: () => void
  ): SettingDefinitionPage {
    return { type: 'page', name, desc, page: () => new ImperativePage(name, this, render, cleanup) };
  }

  /**
   * A description with one of the origin glyphs in front of it.
   *
   * **The glyph belongs beside the row's NAME and cannot go there.** `SettingDefinitionPage.name` is typed
   * `string`, and the framework uses that string twice more — as the page's own title and as what search matches
   * against — so a `DocumentFragment` would not merely be unsupported, it would break searching for the row. `desc`
   * takes a fragment by design, which puts the glyph on the same row, at the head of the sentence that explains
   * it. See docs/design/text-to-speech.md § "The glyph pair" for why these two rows carry glyphs at all.
   */
  private glyphDesc(svg: string, text: string): DocumentFragment {
    const frag = createFragment();
    setSvgIcon(frag.appendChild(createSpan({ cls: 'orbis-setting-desc-icon' })), svg);
    frag.append(text);
    return frag;
  }

  /**
   * The Look-up page: the offline dictionary, what the popup shows, and where it searches the web.
   *
   * **The dictionary row is `render`, and it has to be.** Its label and its button depend on whether a ~30 MB
   * file is on disk and how big it is — two `await`s — and `getSettingDefinitions()` runs on every `update()`
   * and must not do I/O. So the row renders synchronously from a cached answer and asks again in the
   * background, which is also why `dictionaryState` exists rather than a local variable.
   *
   * **One ordered list of destinations, each row with a toggle**; the popup takes the enabled ones in list order.
   * With one list the order is simply the order — a disabled destination keeps its place and reappears where you
   * left it, instead of being sent to a second list and returning at the end.
   */
  /**
   * The Library page: the collections the view gathers from.
   *
   * One list and nothing else, on purpose. A collection is the only thing the library cannot work without — with no
   * collections the view has nothing to show — so this page is the shortest path from "empty library" to "full one".
   */
  /**
   * The Fields page: every field the library knows about, and what the reader has said about it.
   *
   * **One page, because three questions are all about fields** — which keys mean the same thing, what values a
   * field offers, and what to call it. Someone looking for "where do I tell it about my `use_count` field" would
   * otherwise find the wrong page twice.
   *
   * Rows are the merged table, so a field Orbis knows and a field someone declared read the same. Nothing here is
   * required: the library works with an empty table, and a row only makes a picker shorter or a label friendlier.
   */
  private buildFieldsPage(el: HTMLElement): void {
    this.plugin.settings.libraryFields ??= [];
    const schema = new Set([...LIBRARY_FIELDS, ...RECORD_FIELDS]);
    const custom = (this.plugin.settings.libraryFields ?? []).filter((f) => !schema.has(f.key));
    const row = (key: string, species: NoteSpecies | null): ReorderRow => ({
      key,
      name: key,
      desc: this.describeFieldRow(key, species),
      actions: [
        {
          icon: 'pencil',
          label: t('lookup_page.edit'),
          run: () => openOnce(() => this.openFieldEditor(key, species)),
        },
      ],
      openOnTap: () => this.openFieldEditor(key, species),
    });
    renderReorderList(el, {
      heading: t('properties_page.title_properties'),
      desc: t('properties_page.title_properties_desc'),
      rows: [
        ...LIBRARY_FIELDS.map((key) => row(key, 'title')),
        // **A custom field joins a species list by being USED, not by being declared for it.** One definition, one
        // set of aliases, one value list — and it shows up here the moment a title note carries it.
        ...this.customFieldsCarriedBy('title').map((key) => row(key, 'title')),
      ],
    });
    // A list of its own rather than a species column on one list: what the library reads on a title and what it reads
    // on a record are two different questions, and the same key can be in both without meaning the same thing.
    renderReorderList(el, {
      heading: t('properties_page.record_properties'),
      desc: t('properties_page.record_properties_desc'),
      rows: [
        ...RECORD_FIELDS.map((key) => row(key, 'reading_record')),
        ...this.customFieldsCarriedBy('reading_record').map((key) => row(key, 'reading_record')),
      ],
    });
    // **Add and delete belong here alone.** The two lists above hold what Orbis defines, where a delete would have to
    // mean "stop reading this for records but keep it for titles" — a concept nobody asked for.
    renderReorderList(el, {
      heading: t('properties_page.custom'),
      desc: t('properties_page.custom_desc'),
      emptyState: t('properties_page.custom_none'),
      add: { label: t('properties_page.add'), run: () => openOnce(() => this.openFieldEditor(null, null)) },
      rows: custom.map((field) => row(field.key, null)),
    });
  }

  /**
   * The reader's own fields that notes of this species actually carry.
   *
   * Through the aliases, like every other read: a field mapped onto `logos_link` is carried by a note holding that
   * key, whatever the field itself is called. A field nothing carries yet sits in the Custom list alone, which is
   * the honest place for it — it has been described, and nothing uses it.
   */
  private customFieldsCarriedBy(species: NoteSpecies): string[] {
    const fields = mergeFields(this.plugin.settings.libraryFields ?? []);
    const carried = new Set(keysOfSpecies(this.app, species));
    const schema = new Set([...LIBRARY_FIELDS, ...RECORD_FIELDS]);
    // By name: these rows have no arrows, so the stored order — each device appends as it learns a property — is no
    // order at all. See `by-name.ts`.
    return byName(
      (this.plugin.settings.libraryFields ?? [])
        .map((field) => field.key)
        .filter((key) => !schema.has(key) && keysFor(fields, key).some((alias) => carried.has(alias))),
      (key) => key
    );
  }

  /**
   * What a field's row says beneath its name, at the moment it is drawn.
   *
   * The absence marker earns its place: a standard field the vault never writes is where a catalog is thin, and
   * seeing `isbn` marked is the prompt to go and map whatever the exporter called it.
   */
  private describeFieldRow(key: string, species: NoteSpecies | null): string {
    const fields = mergeFields(this.plugin.settings.libraryFields ?? []);
    const field = fields.find((entry) => entry.key === key) ?? { key };
    // `describeField` falls back to the key when there is nothing to say, which under the key as a name would
    // just print it twice. A row nobody has described says nothing, which is itself the description.
    // Ours for a standard field, theirs for one of their own — the two never compete, since the editor only
    // offers the box on a field Orbis has nothing to say about.
    const purpose = fieldPurpose(key) || field.description || '';
    // The caption, said quietly and after the purpose. **The row is still the key** — that is the point of this
    // page, and a label that took the row's name would say the reader can rename a field they cannot rename.
    const heading = field.label?.trim() ? t('properties_page.column_row', { label: field.label.trim() }) : '';
    const parts = [purpose, heading, describeField(fields, field)].filter((part) => part && part !== key);
    // **Absent from WHAT.** In a species list, "Not in your notes" is ambiguous once there are two kinds of
    // note: a field the records carry and the titles do not is not missing, it is elsewhere. A custom field is
    // asked of the vault, since it has no species of its own until something carries it.
    const held =
      species === null ? (k: string) => this.vaultKeys().has(k) : (k: string) => this.speciesKeys(species).has(k);
    if (!keysFor(fields, key).some(held)) {
      parts.push(
        t(
          species === 'reading_record'
            ? 'properties_page.absent_records'
            : species === 'title'
              ? 'properties_page.absent_titles'
              : 'properties_page.absent'
        )
      );
    }
    return parts.join(' · ');
  }

  /** Every frontmatter key in the vault, scanned once per visit to a page rather than once per row. */
  private vaultKeys(): Set<string> {
    this.vaultKeyCache ??= new Set(frontmatterKeys(this.app));
    return this.vaultKeyCache;
  }

  /** The keys one species' notes hold, cached for the page: a Fields list asks this once per row. */
  private speciesKeys(species: NoteSpecies): Set<string> {
    const cached = this.speciesKeyCache.get(species);
    if (cached) return cached;
    const keys = new Set(keysOfSpecies(this.app, species));
    this.speciesKeyCache.set(species, keys);
    return keys;
  }

  /**
   * Edit one field — or describe a new one.
   *
   * What is stored is the reader's layer, not the merged row: writing the merged table back would freeze today's
   * built-in keys into their settings, and an alias Orbis added later would never reach them.
   */
  private openFieldEditor(key: string | null, species: NoteSpecies | null): void {
    const user = (this.plugin.settings.libraryFields ??= []);
    const existing = key ? user.find((entry) => entry.key === key) : null;
    // Seeded with the reading order in force rather than the stored fragment: a field reads its own key whether or
    // not the list names it, so an editor that showed only what was stored would hide the last key read — and hide
    // that it can be moved ahead of an alias.
    const opening = key ? { ...(existing ?? { key }), keys: keysFor(mergeFields(user), key) } : null;
    // The same act, under the name that is true of it. Throwing away what you said about a standard field leaves
    // the field — the library still reads it — so that is a reset; doing it to one of your own leaves nothing, so
    // that is a delete. One button called "forget" for both would be wrong in one list or the other.
    // Standard in EITHER schema: a record's `mark` is as much Orbis's as a title's `authors`, and forgetting
    // either leaves the field itself behind, because the library still reads it.
    const standard = key !== null && (LIBRARY_FIELDS.includes(key) || RECORD_FIELDS.includes(key));
    new FieldModal(
      this.app,
      key,
      opening,
      // **Counted against the species whose list this row is in.** A record's `mark` has no values at all among the
      // title notes, so a Values tab counting those would show an empty list for a field every highlight carries.
      // A custom field is counted across the vault, since it has no species until something carries it.
      species,
      // Only keys the vault actually holds, and never a standard field of either species: mapping one of those is
      // what its own row is for, and a second row claiming the same field would quietly shadow it.
      //
      // **Vault-wide, not scoped to the species.** A key has to be nameable BEFORE the note carrying it is a
      // record of any kind — that is what adoption is — so a picker that offered only what a species already
      // holds would hide exactly the keys someone came here to map.
      () => frontmatterKeys(this.app).filter((k) => !LIBRARY_FIELDS.includes(k) && !RECORD_FIELDS.includes(k)),
      (values) => {
        const at = user.findIndex((entry) => entry.key === values.key);
        if (at >= 0) user[at] = values;
        else user.push(values);
        void this.saveAndRefreshLibrary();
      },
      existing
        ? {
            text: standard ? t('properties_page.reset') : t('properties_page.forget'),
            run: () => {
              user.splice(user.indexOf(existing), 1);
              void this.saveAndRefreshLibrary();
            },
          }
        : undefined
    ).open();
  }

  /**
   * Turning the library on, which is a question the first time.
   *
   * The toggle is put back by hand when the dialog is dismissed, because Obsidian's component has already moved:
   * re-rendering the page would also work and would take the reader back to the top of it, which is a worse
   * answer to "I changed my mind" than the switch simply not moving.
   *
   * **`undo` rather than the toggle itself**, because Setup opens this same question from a row that has no toggle
   * to put back — see `setupItems`. What "dismissed" costs the caller is the caller's business; what it must never
   * do is leave a switch reading "on" over a feature that never answered.
   */
  private chooseLibraryOn(on: boolean, undo: () => void): void {
    if (!on || this.plugin.settings.librarySetupDone) {
      this.plugin.settings.libraryEnabled = on;
      void this.saveAndRefreshLibrary();
      return;
    }
    openLibrarySetupDialog(this.app, {
      initial: {
        recordsFolder: this.plugin.settings.libraryRecordsFolder,
        extractCovers: this.plugin.settings.libraryExtractCovers,
        coversFolder: this.plugin.settings.libraryCoversFolder,
      },
      onSave: (setup) => {
        this.plugin.settings.libraryRecordsFolder = setup.recordsFolder;
        this.plugin.settings.libraryExtractCovers = setup.extractCovers;
        this.plugin.settings.libraryCoversFolder = setup.coversFolder;
        this.plugin.settings.librarySetupDone = true;
        this.plugin.settings.libraryEnabled = true;
        void this.saveAndRefreshLibrary();
        // The next step rather than another question: the review exists, it knows what is waiting, and finding it
        // later in settings is how a reader concludes the library is empty.
        const waiting = this.uncatalogedCount() + adoptable(vaultCandidates(this.app), setup.recordsFolder).length;
        if (waiting > 0) {
          openCatalogReview(this.app, this.plugin, () => {
            refreshLibraryViews(this.plugin);
            this.renderSettings();
          });
        }
      },
      onCancel: undo,
    });
  }

  /** How many books in the vault no record describes — the number the review row promises. */
  private uncatalogedCount(): number {
    const records = recordCandidates(this.app)
      .map((note) => parseRecord(note.path, note.frontmatter))
      .filter((record): record is LibraryRecord => record !== null);
    return uncatalogedBooks(this.app, records).length;
  }

  /**
   * Look again at what is set up, and redraw if the answer moved.
   *
   * **Guarded against its own redraw.** `update()` rebuilds every definition, which calls this again — so it
   * repaints only when a state actually changed, which makes the second pass a no-op and ends the loop. The
   * in-flight flag stops a burst of rebuilds from queueing seven filesystem checks apiece.
   */
  private refreshSetupStatus(): void {
    if (this.setupResolving) return;
    this.setupResolving = true;
    void resolveSetupItems(setupProbe(this.plugin)).then((items) => {
      this.setupResolving = false;
      const before = this.setupStatus?.map((i) => i.state).join();
      this.setupStatus = items;
      if (before !== items.map((i) => i.state).join()) this.update();
    });
  }

  private setupStateOf(id: SetupItemId): SetupState | null {
    return this.setupStatus?.find((i) => i.id === id)?.state ?? null;
  }

  /** "4 of 7", or nothing at all until the first look has finished — a count that starts wrong is worse than none. */
  private setupProgressLabel(): string {
    if (!this.setupStatus) return '';
    const { done, total } = setupProgress(this.setupStatus);
    return t('setup.progress', { done: String(done), total: String(total) });
  }

  /**
   * The Setup page: what this plugin can do, and what each of those needs before it will do it.
   *
   * **A launcher, not a second copy of the settings tree.** Four of these items need consent AND a destination, and
   * each already has a dialog that asks both in one breath — so the row opens that dialog rather than reimplementing
   * the question, and never writes a flag without asking. The three downloads have nothing to consent to and are
   * done from here directly.
   *
   * See docs/design/settings.md §Setup — the first page.
   */
  private setupPageItems(): SettingDefinitionItem[] {
    this.refreshSetupStatus();
    return [
      ...this.appearanceSetupItems(),
      {
        type: 'group',
        // **No heading over the tasks: the page is already called Setup.** "Setup" over "Set up" is a stutter, and
        // a heading that repeats the title tells a reader nothing they did not just read. The group is a card, not
        // a section — there is no second section for it to be told apart from.
        //
        // The registry decides which items are tasks and in what order; this only draws them. `appearance` is the
        // one id with no task row, and the group it is in is what says so.
        items: [
          /**
           * **What the list is for, said before the list — in the entry's own words.**
           *
           * The same string the Setup entry carries on the settings start page, verbatim. A reader who just tapped
           * a line and arrived here should recognize the sentence rather than parse a second one saying the same
           * thing differently; it is the trick the setup dialog already uses for the switch that opens it.
           *
           * **Inside the group, not above it.** A top-level definition gets a card of its own, which put one
           * sentence in a box the size of the list below it. As the group's first row it shares the card, and the
           * border under it becomes the divider between the sentence and the tasks.
           *
           * A nameless `render` row dressed down by CSS: `name` is required by the type, and an empty one with the
           * info column hidden is what leaves the sentence alone on the line. Into the CONTROL area, never
           * `settingEl` — Obsidian clears the control area before re-running a render callback and leaves the row
           * alone, which is how the Appearance page once grew three preview samples side by side.
           */
          {
            name: '',
            searchable: false,
            render: (setting) => {
              setting.settingEl.addClass('orbis-setup-lead');
              setting.controlEl.createEl('p', { text: t('settings_pages.setup_desc') });
            },
          },
          ...SETUP_ITEMS.filter((i) => i.group === 'setup').map((i) =>
            this.setupTaskRow(i.id as Exclude<SetupItemId, 'appearance'>)
          ),
        ],
      },
    ];
  }

  /**
   * The megabytes a download row quotes, read from the thing that will actually be fetched.
   *
   * **Not typed into the sentence.** The voice's size lives in the catalog, the font pack's in `pdf-fonts`, the
   * dictionary's beside its URL; a number repeated in a translation table is a number that goes stale the first
   * time an asset changes, and "about 60 MB" over a 75 MB download is the kind of small lie a reader on a phone
   * data plan does not forgive.
   */
  private setupDescParams(id: Exclude<SetupItemId, 'appearance'>): Record<string, string> | undefined {
    if (id === 'listening') {
      return { size: String(orbisVoiceOrDefault(this.plugin.getDeviceVoicePref()?.orbisVoiceId).sizeMB) };
    }
    if (id === 'pdf-fonts') return { size: String(FONT_DOWNLOAD_MB) };
    // Both books, so both sizes. The task hands a reader a look-up that answers modern words and old ones alike;
    // choosing between them is a thing to do later on the Look-up page, not a question to open with.
    if (id === 'lookup') return { size: String(totalDictionaryMb()) };
    // The same sentence the Devices page and the setup dialog carry, rather than a second copy of it — see
    // `setup.devices_desc`. Orbis writes to the vault; something else moves it, and this row is where a new reader
    // meets that fact first.
    if (id === 'devices') return { caveat: t('multi_device.sync_caveat') };
    return undefined;
  }

  /**
   * Appearance, at the top of Setup: the two controls a reader actually reaches for, over the sample.
   *
   * **First, and not counted.** Adjusting the text is the most likely reason anyone opens settings at all, and it
   * is not a task — nothing here can be "not done". Being outside the count is precisely what lets it hold the top
   * slot without pretending to be work.
   *
   * **The real rows, from `styleValueRows`** — not copies. This is the one item where the design's "items carry
   * their own controls" rule costs nothing: theme and font size are plain per-device values with a live sample, so
   * showing them here and on the Appearance page cannot disagree.
   *
   * **Two rows, not nine** — see the note on them below. Brightness, margins, spacing, columns, justification and
   * font are one page away.
   *
   * The line under the heading names the style being edited and the button in the book — see
   * `setup.appearance_style_here` and `setup.appearance_style_named`. Both are things the rows cannot say for
   * themselves.
   */
  private appearanceSetupItems(): SettingDefinitionItem[] {
    const values = this.displayStyles.styleValueRows({ compactSample: true });
    const style = this.activeStyle();
    return [
      {
        type: 'group',
        heading: t('settings_pages.display_styles'),
        items: [
          {
            name: '',
            searchable: false,
            render: (setting) => {
              setting.settingEl.addClass('orbis-setup-lead');
              const p = setting.controlEl.createEl('p');
              /**
               * Which style, then where the rest are.
               *
               * The opener depends on whose style it is: this device's own has no name to quote — its label is the
               * phrase "This device" — while a shared one does. Only drawn when there IS a style: `activeStyle`
               * repairs a stale pointer rather than reporting one, so the absent case is a vault whose styles were
               * all deleted elsewhere, and a sentence naming nothing helps nobody.
               */
              if (style) {
                p.appendText(
                  style.deviceId
                    ? `${t('setup.appearance_style_here')} `
                    : `${t('setup.appearance_style_named', { style: this.styleLabel(style) })} `
                );
              }
              // Names the toolbar button whether or not this device shows it: Setup is a first visit, and a reader
              // who has switched the button off already knows where Appearance is.
              p.appendText(t('setup.appearance_elsewhere'));
            },
          },
          /**
           * **Theme and font size, and no font dropdown.** Two controls, because these are the two levers that
           * answer "I cannot comfortably read this": size for the obvious reason, theme for sepia, which no
           * Obsidian setting corresponds to and which a reader would never find by guessing. The font list is
           * eight ordinary faces — Georgia, Palatino, Times, Arial and so on, with no accessibility face among
           * them — so it is a matter of taste, and taste belongs on the page for it. The sentence above names
           * where that page is.
           */
          values.theme,
          values.size,
          values.sample,
        ],
      },
    ];
  }

  /**
   * One task: what it gives you, whether it is set up, and the one control that sets it up.
   *
   * **One control, and only while there is something to do.** A finished task says so and offers nothing —
   * managing a feature afterwards belongs to that feature's own page, and a control left on a finished row invites
   * undoing what was just done.
   *
   * No second "not for me" ×: × means close or delete, and beside a row named "Book sources" it would read as an
   * offer to delete the feature.
   */
  private setupTaskRow(id: Exclude<SetupItemId, 'appearance'>): SettingDefinition {
    const copy = SETUP_COPY[id];
    const state = this.setupStateOf(id);
    return {
      name: t(copy.name),
      desc: t(copy.desc, this.setupDescParams(id)),
      render: (setting) => {
        // Keeps the desktop shape on a phone: name and description on the left, one control on the right. See
        // `.orbis-setup-row` — seven full-width buttons stacked down a column is what this avoids.
        setting.settingEl.addClass('orbis-setup-row');
        if (state === null) {
          setting.controlEl.createSpan({ cls: 'orbis-setup-state', text: t('setup.checking') });
          return;
        }
        if (state === 'done') {
          setting.controlEl.createSpan({ cls: 'orbis-setup-state is-done', text: t('setup.done') });
          return;
        }
        setting.addButton((b) =>
          b
            .setButtonText(t(copy.action))
            .setCta()
            .onClick(() => this.runSetupAction(id, b))
        );
      },
    };
  }

  /**
   * Answer one task, by the shortest honest route.
   *
   * **Four open a dialog, three do the work here.** The four that need a destination as well as consent hand
   * straight to the dialog that already asks both — `chooseSourcesOn` and its neighbors take an `undo` callback
   * precisely so this page can pass one that repaints a row instead of putting a switch back. The three downloads
   * have nothing to ask, so the button becomes the download and reports into itself.
   */
  private runSetupAction(id: SetupItemId, btn: ButtonComponent): void {
    const done = (): void => {
      this.setupStatus = null;
      this.renderSettings();
    };
    switch (id) {
      case 'book':
        this.chooseSourcesOn(true, done);
        return;
      case 'library':
        this.chooseLibraryOn(true, done);
        return;
      case 'records':
        this.chooseRecordsMode('on');
        return;
      case 'devices':
        this.chooseMultiDeviceOn(true, done);
        return;
      // A voice is CHOSEN, and the dialog's own button downloads the one kept — see `setup-voice-dialog.ts`.
      case 'listening':
        openSetupVoiceDialog(
          {
            app: this.app,
            plugin: this.plugin,
            cacheDir: this.piperCacheDir(),
          },
          done
        );
        return;
      default:
        void this.runSetupDownload(id, btn, done);
    }
  }

  /**
   * The three items that are a download and nothing else.
   *
   * Reported into the button rather than a Notice: the row that asked is the row that should say how it is going,
   * and on a phone a toast over a settings page is gone before the download is.
   */
  private async runSetupDownload(id: SetupItemId, btn: ButtonComponent, done: () => void): Promise<void> {
    const adapter = this.app.vault.adapter;
    const dir = `${this.app.vault.configDir}/plugins/orbis-reader`;
    btn.setDisabled(true).setButtonText(t('lookup_page.downloading'));
    try {
      if (id === 'lookup') {
        // Sequentially, and only what is missing: a reader who already took one book from the Look-up page should
        // not re-fetch 21 MB to answer this row. One `await` chain rather than `Promise.all`, so two 21 MB
        // downloads do not contend on a phone connection.
        for (const service of this.plugin.dictionaries.all) {
          if (!(await service.isDownloaded())) await service.download();
        }
      } else if (id === 'pdf-fonts') await downloadFonts(adapter, `${dir}/font-cache`);
    } catch (err) {
      // A wrong file is not a connection problem, and trying again would fetch it again — see `WrongFileError`.
      new Notice(downloadFailedMessage(err));
    }
    done();
  }

  private libraryItems(): SettingDefinitionItem[] {
    // Everything below the switch is hidden when it is off, rather than shown and inert: a page of settings for a
    // feature that is not running is a page of questions with no consequences.
    const on = () => this.plugin.settings.libraryEnabled;
    return [
      {
        name: t('library_page.enabled'),
        desc: t('library_page.enabled_desc'),
        // Not a plain toggle: switching it on for the first time asks where title notes go before anything writes
        // one — and a dismissed dialog leaves the switch off, since a switch reading "on" over a feature that
        // never got its folder is the lie the dialog exists to remove. Same rule as reading records.
        render: (setting) => {
          setting.addToggle((tog) =>
            tog.setValue(this.plugin.settings.libraryEnabled).onChange((on) =>
              this.chooseLibraryOn(on, () => {
                tog.setValue(false);
              })
            )
          );
        },
      },
      // **Setup first, then health, then what you build with it.** The two settings the first-run dialog asks
      // together stay together here, so a reader who answered them in that dialog finds them side by side. These
      // four are the same two questions, in the same order, plus the covers toggle the dialogs also ask.
      {
        name: t('library_page.records_folder'),
        desc: t('library_page.records_folder_desc'),
        visible: on,
        render: (setting) => this.folderRow(setting, 'libraryRecordsFolder'),
      },
      // **The covers toggle lives on this page too**, not only in the first-run dialog and the catalog review:
      // otherwise someone who declined it would be left looking at a Covers folder row governing nothing, with no
      // way back to the answer.
      {
        name: t('library_page.extract_covers'),
        desc: t('library_page.extract_covers_desc'),
        visible: on,
        control: { type: 'toggle', key: 'libraryExtractCovers' },
      },
      {
        name: t('library_page.covers_folder'),
        // Says what happens when it is left alone, because that is the state it will be in for most readers.
        desc: t('library_page.covers_folder_desc'),
        visible: on,
        // The default is a PATH, and showing the path is the only version of it nobody has to decode: "beside your
        // title notes" reads as a sibling of that folder when it is a child of it, and neither phrasing survives
        // someone keeping their notes in `Library/Titles`. Computed when the page opens, so it follows the folder
        // above it.
        render: (setting) =>
          this.folderRow(
            setting,
            'libraryCoversFolder',
            t('library_page.covers_folder_default', { path: coversFolderFor(this.plugin.settings) })
          ),
      },
      /**
       * **One row for the whole answer.** A separate paragraph naming what a title note is and counting how many
       * qualify would be documentation with a tab stop and nothing to activate — the vocabulary belongs in the guide
       * — but its NUMBER is the useful half, so it lives here, beside the thing you would do about it.
       *
       * Two counts with two verbs would read as two unrelated chores whose numbers seem to contradict each other.
       * They have one relationship: a note the library cannot see is usually a note that links a book, so most of
       * those books are already described and updating the notes is what makes their count fall. The dialog says
       * which to do first; this row only has to get the reader there.
       */
      {
        name: t('library_page.status'),
        visible: on,
        // **Counted in `render`, not in the definition.** `getSettingDefinitions()` runs once at registration —
        // plugin load — when the vault has no file list yet, so a count taken there is always zero and stays zero.
        // `render` runs when the page opens, which is the only time the answer can be right.
        render: (setting) => {
          const notes = adoptable(vaultCandidates(this.app), this.plugin.settings.libraryRecordsFolder).length;
          const books = this.uncatalogedCount();
          // How many notes the library CAN see, which is the reassurance the other two numbers need beside them.
          const titles = recordCandidates(this.app).length.toLocaleString();
          // One string per case, rather than one string with both numbers in it. Written the other way, a vault
          // with every book cataloged would read "…and 0 books are not linked to a valid title note", which invites the
          // reader to doubt the number that does matter.
          setting.setDesc(
            notes > 0 && books > 0
              ? t('library_page.status_desc', {
                  titles,
                  notes: notes.toLocaleString(),
                  books: books.toLocaleString(),
                })
              : notes > 0
                ? t('library_page.status_notes_only', { titles, notes: notes.toLocaleString() })
                : books > 0
                  ? t('library_page.status_books_only', { titles, books: books.toLocaleString() })
                  : t('library_page.status_none', { titles })
          );
          setting.addButton((b) => {
            b.setButtonText(t('library_page.issues_review')).onClick(() =>
              // Both counts on this row are read from the vault when the page renders, so the page has to render
              // again — refreshing the library view alone would leave the reader looking at a count of notes missing
              // a required field immediately after updating all of them.
              openCatalogReview(this.app, this.plugin, () => {
                refreshLibraryViews(this.plugin);
                this.renderSettings();
              })
            );
            if (notes + books === 0) b.setDisabled(true);
          });
        },
      },
      {
        name: t('library_page.uncataloged_alert'),
        desc: t('library_page.uncataloged_alert_desc'),
        visible: on,
        control: { type: 'toggle', key: 'libraryUncatalogedAlert' },
      },
      // **Dashboards and collections together, one level down.** They are one editing loop: a widget draws from a
      // collection, so changing what a widget shows means changing a collection and coming straight back. Split
      // across two branches it would be a trip up and down twice for one edit. Imperative, because the dashboards list
      // reorders — see `renderReorderList`.
      {
        ...this.subPage(t('library_page.content_page'), t('library_page.content_page_desc'), (el) =>
          this.buildLibraryContentPage(el)
        ),
        visible: on,
      },
      // Last, and after collections: a field table is what you reach for once a collection did not gather what
      // you expected, which is not a thing anyone does on their first visit.
      {
        // Imperative, like Look up and Dashboards, and for the reasons `buildFieldsPage` gives.
        ...this.subPage(t('properties_page.page'), t('properties_page.page_desc'), (el) => this.buildFieldsPage(el)),
        visible: on,
      },
    ];
  }

  /** What a dashboard row says under its name: how many widgets, and whether it is the one that opens. */
  private dashboardDesc(dashboard: LibraryDashboard, activeId: string): string {
    const count =
      dashboard.widgets.length === 1
        ? t('library_page.dashboard_widgets_one')
        : t('library_page.dashboard_widgets', { count: String(dashboard.widgets.length) });
    const notes = [count];
    if (!dashboardOffered(dashboard, readDashboardOrder())) notes.push(t('library_page.dashboard_disabled'));
    else if (dashboard.id === activeId) notes.push(t('library_page.dashboard_active'));
    if (dashboard.system) notes.push(t('library_page.dashboard_system'));
    return notes.join(' · ');
  }

  /** The name of a dashboard with a widget pointing at this collection, or null. */
  private dashboardUsing(collectionId: string): string | null {
    for (const dashboard of this.plugin.settings.libraryDashboards ?? []) {
      if (dashboard.widgets.some((w) => w.collection === collectionId)) return dashboard.name;
    }
    return null;
  }

  /** Save, rebuild this page, and repaint any open Library — which reads collections from settings, not from here. */
  /**
   * Save, then put every surface the Library owns back in step with the setting.
   *
   * **`applyLibraryEnabled` belongs here, not at the call sites.** It is what creates and destroys the ribbon icon,
   * and changing `libraryEnabled` without it — from the toggle or the Getting started step — would leave no icon
   * after enabling the Library until the next reload, and a stale one after disabling it.
   *
   * Calling it on every save through here is the point rather than the cost: it is idempotent and cheap, so the
   * icon is DERIVED from the setting on any path that can change it, instead of each path remembering to.
   */
  private async saveAndRefreshLibrary(): Promise<void> {
    await this.saveAndRefresh();
    this.plugin.applyLibraryEnabled();
    refreshLibraryViews(this.plugin);
  }

  /**
   * The Book sources page: the switch, where downloads land, and the sources themselves.
   *
   * Everything below the switch is hidden when it is off rather than shown and inert — the shape the Library page
   * has, and for the same reason: a page of settings for a feature that is not running is a page of questions with
   * no consequences.
   */
  private buildSourcesPage(el: HTMLElement): void {
    new Setting(el)
      .setName(t('book_sources_page.enabled'))
      .setDesc(t('book_sources_page.enabled_desc'))
      // Not a plain toggle: turning it on is a consent, and it asks where downloads go in the same breath — a switch
      // reading "on" over a feature whose first act would be writing into the vault root is the lie the dialog exists
      // to remove. Same rule as the Library and reading records.
      .addToggle((tog) =>
        tog.setValue(deviceSetting('bookSourcesEnabled')).onChange((next) =>
          this.chooseSourcesOn(next, () => {
            tog.setValue(false);
          })
        )
      );
    if (!deviceSetting('bookSourcesEnabled')) return;

    this.folderRow(
      new Setting(el).setName(t('book_sources_page.folder')).setDesc(t('book_sources_page.folder_desc')),
      'bookSourcesFolder'
    );

    const sources = this.plugin.settings.bookSources;
    renderReorderList(el, {
      heading: t('book_sources_page.sources'),
      emptyState: t('book_sources_page.no_sources'),
      add: {
        label: t('book_sources_page.add_source'),
        run: () => {
          // **Minted here, before the dialog opens, not when it saves.** A credential is keyed by the source's id, so
          // a dialog with no id would have nowhere to put a username, and both rows would sit disabled telling the
          // reader to save and come back — see `BookSourceModal.username`. Nothing is written under this id unless
          // Save is pressed.
          //
          // `catalog-`, not `user-`: the id appears in this source's secret keys, and a key reading
          // `orbis-book-source-user-…-password` looks like it holds a username. See `passwordIdFor`.
          const id = `catalog-${generateStyleId()}`;
          new BookSourceModal(this.app, null, id, (values) => {
            this.plugin.settings.bookSources.push({
              id,
              name: values.name,
              url: values.url,
              language: values.language || undefined,
              enabled: true,
              builtin: false,
            });
            void this.saveSourcesAndRedraw();
            new Notice(t('book_sources_page.source_added'));
          }).open();
        },
      },
      rows: sources.map((source) => {
        // **A built-in has a pencil too**, unlike a look-up destination: its name and URL are frozen inside the
        // dialog, but its username and password are the reader's, and a source they cannot open is a source they
        // cannot authenticate.
        const edit = () =>
          new BookSourceModal(this.app, source, source.id, (values) => {
            if (!source.builtin) {
              source.name = values.name;
              source.url = values.url;
            }
            source.language = values.language || undefined;
            void this.saveSourcesAndRedraw();
          }).open();
        /**
         * **Delete is the row's, not the editor's** — in the dialog behind the pencil it would ask a reader to open
         * an editor in order to destroy something. Edit and delete are different verbs.
         *
         * Asked before doing, and by name, because the row's trash is one press: the credential goes with the source,
         * both halves — leaving it behind would be a secret nothing can reach, named after a catalog that no longer
         * exists. See `forgetCredential`.
         */
        const remove = () =>
          confirmThen(
            this.app,
            {
              title: t('book_sources_page.delete_source_title'),
              message: t('book_sources_page.delete_source_confirm', { name: source.name }),
              confirmText: t('action.delete'),
            },
            () => {
              forgetCredential(this.app, source);
              const list = this.plugin.settings.bookSources;
              list.splice(list.indexOf(source), 1);
              void this.saveSourcesAndRedraw();
            }
          );
        return {
          key: source.id,
          name: source.name,
          desc: source.url,
          // A provided catalog cannot be deleted, and **keeps the slot** — see `ReorderAction.hidden`. A column of
          // icons that shifts by row is read as a mistake before it is read as an absence.
          actions: [
            { icon: 'pencil', label: t('lookup_page.edit'), run: edit },
            { icon: 'trash', label: t('action.delete'), hidden: source.builtin, run: remove },
          ],
          openOnTap: edit,
          toggle: {
            value: source.enabled,
            onChange: (on) => {
              source.enabled = on;
              void this.saveSourcesAndRedraw();
            },
          },
        };
      }),
      move: (from, to) => {
        this.persistMove(this.plugin.settings.bookSources, from, to);
        this.plugin.applyBookSourcesEnabled(); // the reader's source list follows this order
      },
      log: (msg) => logSettings(this, `book sources ${msg}`),
    });
  }

  /** Save, apply, and redraw this page — the sources equivalent of `saveAndRedraw`. */
  private async saveSourcesAndRedraw(): Promise<void> {
    await this.plugin.saveSettings();
    this.plugin.applyBookSourcesEnabled();
    this.plugin.refreshViews();
    this.renderSettings();
  }

  /**
   * Turning book sources on: consent and a folder, together, before anything is fetched.
   *
   * Already answered — a folder is set, so the reader has been here before — goes straight through. Dismissing the
   * dialog leaves the switch where it was, which is what makes the toggle honest.
   */
  private chooseSourcesOn(next: boolean, undo: () => void): void {
    if (!next || this.plugin.settings.bookSourcesFolder.trim()) {
      // Consent is this device's own, so it is stored beside the device — the folder and the catalogs still travel.
      setDeviceSetting('bookSourcesEnabled', next);
      void this.saveSourcesAndRefresh();
      return;
    }
    openBookSourcesSetupDialog(this.app, {
      initialFolder: this.plugin.settings.bookSourcesFolder,
      onSave: (folder) => {
        this.plugin.settings.bookSourcesFolder = folder;
        setDeviceSetting('bookSourcesEnabled', true);
        void this.saveSourcesAndRefresh();
      },
      onCancel: () => {
        undo();
        setDeviceSetting('bookSourcesEnabled', false);
        void this.saveSourcesAndRefresh();
      },
    });
  }

  /** Save, redraw the page, and show or hide the ribbon icon — a switch that leaves the icon behind has not landed. */
  private async saveSourcesAndRefresh(): Promise<void> {
    await this.saveAndRefresh();
    this.plugin.applyBookSourcesEnabled();
  }

  /**
   * The Look-up page: the offline dictionary, which sections the popup shows, and where "Search the web" goes.
   *
   * **A page we render, not a declarative one.** Both of its lists reorder, and a declarative list cannot be
   * reordered from a keyboard reliably: Obsidian owns those rows and rebuilds them on a schedule of its own, which
   * destroys the arrow mid-press. See `renderReorderList`, which every reorderable list in settings goes
   * through. The cost is that the individual entries are not indexed by settings search — the page and its
   * headings still are — and that is the right trade for a list that works the same way every time.
   */
  private buildLookupPage(el: HTMLElement): void {
    /**
     * What this page is for, on the page.
     *
     * The description handed to `subPage` only ever renders on the list you came FROM, so without this, opening
     * the page would leave the dictionary row as the first thing you see and nothing saying why any of it exists. A
     * description-only row at the top is what the Live voice page does; no heading, because the titlebar
     * already says where you are.
     */
    new Setting(el).setDesc(t('lookup_page.page_desc')).settingEl.addClass('orbis-setting-stacked');
    // Heading only. Each row says what its book is FOR, which is the question a reader is answering here; how the
    // panel chooses between them is in the guide, where a paragraph does not sit between you and the buttons.
    new Setting(el).setName(t('lookup_page.dictionaries')).setHeading();
    for (const service of this.plugin.dictionaries.all) {
      this.renderDictionaryRow(el, service);
    }

    const sections = this.plugin.settings.lookupSections;
    const visibleSections = sections.filter((s) => s.visible).length;
    renderReorderList(el, {
      heading: t('lookup_page.sections'),
      desc: t('lookup_page.sections_desc'),
      rows: sections.map((section) => {
        // The last visible section locks on: a look-up popup with nothing in it is a gesture that opens an empty
        // box. Said in the row rather than shown by dimming, as on the Toolbar page.
        const locked = section.visible && visibleSections === 1;
        return {
          key: section.id,
          name: t(LOOKUP_SECTION_LABELS[section.id]),
          desc: locked ? t('lookup_page.section_min_one') : undefined,
          toggle: {
            value: section.visible,
            disabled: locked,
            onChange: (on) => {
              void this.setSectionVisible(section.id, on);
            },
          },
        };
      }),
      move: (from, to) => this.persistMove(this.plugin.settings.lookupSections, from, to),
      log: (msg) => logSettings(this, `sections ${msg}`),
    });

    const dests = this.plugin.settings.lookupWebDestinations;
    const enabledDests = dests.filter((d) => d.enabled).length;
    renderReorderList(el, {
      heading: t('lookup_page.web_search'),
      desc: t('lookup_page.web_destinations_desc'),
      emptyState: t('lookup_page.no_destinations'),
      add: {
        label: t('lookup_page.add_destination'),
        run: () => {
          new DestinationModal(this.app, null, (name, url) => {
            this.plugin.settings.lookupWebDestinations.push({
              // `catalog-`, not `user-`: the id appears in this source's secret keys, and a key reading
              // `orbis-book-source-user-…-password` looks like it holds a username. See `passwordIdFor`.
              id: `catalog-${generateStyleId()}`,
              name,
              url,
              enabled: true,
              builtin: false,
            });
            void this.saveAndRedraw();
            new Notice(t('lookup_page.destination_added'));
          }).open();
        },
      },
      rows: dests.map((dest) => {
        // Only the destinations you added can be edited, so the pencil is the OPTIONAL control and goes on the
        // outside — the arrows and the switch then line up down the list whether a row has one or not.
        const edit = () =>
          new DestinationModal(this.app, dest, (name, url) => {
            dest.name = name;
            dest.url = url;
            void this.saveAndRedraw();
          }).open();
        /**
         * **Delete is the row's**, as it is for book sources and the dashboards — not behind the pencil, which made
         * "edit" the way to destroy something.
         *
         * The last enabled destination can be neither switched off nor deleted — its switch and its trash are disabled
         * and the row says why, as every "at least one" list does: a look-up popup with no web search is a section
         * that draws nothing.
         */
        const locked = dest.enabled && enabledDests <= 1;
        const remove = () => {
          confirmThen(
            this.app,
            {
              title: t('lookup_page.delete_destination_title'),
              message: t('lookup_page.delete_destination_confirm', { name: dest.name }),
              confirmText: t('action.delete'),
            },
            () => {
              const list = this.plugin.settings.lookupWebDestinations;
              list.splice(list.indexOf(dest), 1);
              void this.saveAndRedraw();
            }
          );
        };
        return {
          key: dest.id,
          name: dest.name,
          desc: locked ? `${dest.url} · ${t('lookup_page.dest_min_one')}` : dest.url,
          // A provided destination has neither, and keeps both slots — see `ReorderAction.hidden`.
          actions: [
            { icon: 'pencil', label: t('lookup_page.edit'), hidden: dest.builtin, run: edit },
            { icon: 'trash', label: t('action.delete'), hidden: dest.builtin, disabled: locked, run: remove },
          ],
          openOnTap: dest.builtin ? undefined : edit,
          toggle: {
            value: dest.enabled,
            disabled: locked,
            onChange: (on) => {
              dest.enabled = on;
              void this.saveAndRedraw();
            },
          },
        };
      }),
      move: (from, to) => this.persistMove(this.plugin.settings.lookupWebDestinations, from, to),
      log: (msg) => logSettings(this, `destinations ${msg}`),
    });
  }

  /**
   * Save, tell the reader, and redraw THIS page.
   *
   * `saveAndRefresh()` rebuilds Obsidian's stored definition tree, which is how a declarative page redraws — and does
   * nothing at all for a page we render ourselves: adding, renaming or deleting a destination through it would save
   * and then leave the list showing what it showed before. A page of our own redraws through `renderSettings()`, which
   * keeps the keyboard where it was.
   */
  private async saveAndRedraw(): Promise<void> {
    await this.plugin.saveSettings();
    this.plugin.refreshViews();
    this.renderSettings();
  }

  /**
   * Persist a reorder: move the entry and save, with no repaint.
   *
   * The array is looked up by the caller at the moment of the move, never captured when the page was built — a save
   * can trigger a reload that REPLACES these arrays on `settings`, and a captured reference is orphaned from then on.
   */
  persistMove<T>(list: T[], from: number, to: number): void {
    list.splice(to, 0, ...list.splice(from, 1));
    void this.plugin.saveSettings();
  }

  /** A look-up section's visibility. `setControlValue` rebuilds the tab, which this page does not need. */
  private async setSectionVisible(id: string, visible: boolean): Promise<void> {
    const section = this.plugin.settings.lookupSections.find((s) => s.id === id);
    if (!section) return;
    section.visible = visible;
    await this.saveAndRedraw(); // the row that becomes the last visible one has to say so
  }

  /**
   * The Dashboards and collections page: the dashboards the library can open, and the two lists of collections their
   * widgets draw from.
   *
   * **One page for the pair.** A widget shows a collection, so changing what a dashboard shows means editing a
   * collection and coming straight back — and with the two a level apart in the tree, that would be a trip up and
   * down twice for one edit. Dashboards lead, being what the ribbon icon opens and therefore what anyone is looking
   * for.
   */
  private buildLibraryContentPage(el: HTMLElement): void {
    /**
     * **The dashboards list gets a container of its own, so it can be redrawn without the page.**
     *
     * Adding, copying, deleting or switching off a dashboard changes this list and nothing else on the page — and
     * `renderSettings()` would rebuild the whole drill-down page through Obsidian's own page machinery. That is
     * asynchronous and out of our hands: a new dashboard's name field could not be focused because the page it lives
     * on would not exist yet, and every such change would take the keyboard with it. Redrawing one card is
     * synchronous, keeps the collections below untouched, and leaves focus somewhere we can name.
     */
    this.dashboardsHostEl = el.createDiv({ cls: 'orbis-list-host' });
    this.paintDashboardsList();
    for (const entry of COLLECTION_SPECIES) this.renderCollectionList(el, entry);
  }

  /** Redraw just the dashboards card — see `buildLibraryContentPage`. */
  private repaintDashboards(): void {
    const host = this.dashboardsHostEl;
    if (!host?.isConnected) {
      // The page has gone since; the next visit builds it fresh.
      this.dashboardsHostEl = null;
      return;
    }
    rebuildKeepingFocus(host, () => this.paintDashboardsList());
  }

  /** Save the dashboards, repaint the Library, and redraw this one card. */
  private saveDashboards(): void {
    this.saveLibraryQuietly();
    this.repaintDashboards();
  }

  private paintDashboardsList(): void {
    const el = this.dashboardsHostEl;
    if (!el) return;
    el.empty();
    const dashboards = this.plugin.settings.libraryDashboards;
    const activeId = readActiveDashboard();
    renderReorderList(el, {
      heading: t('library_page.dashboards'),
      desc: t('library_page.dashboards_desc'),
      emptyState: t('library_page.no_dashboards'),
      add: {
        label: t('library_page.add_dashboard'),
        run: () => {
          // Created before it is edited, because the editor saves as it goes: there is no draft to commit, so there
          // has to be something for the first change to be written to.
          const created: LibraryDashboard = {
            id: `dashboard-${generateStyleId()}`,
            name: t('library_page.new_dashboard'),
            widgets: [],
          };
          dashboards.push(created);
          // Open, because a new dashboard is empty and the next thing anyone does is name it and add a widget.
          this.expandedRows.add(created.id);
          // One card, synchronously — so the name field exists to be focused on the very next line.
          this.saveDashboards();
          this.focusRowBody(created.id);
        },
      },
      rows: orderedDashboards(dashboards, readDashboardOrder()).map(
        (dashboard): ReorderRow => ({
          key: dashboard.id,
          name: dashboard.name,
          desc: this.dashboardDesc(dashboard, activeId),
          /**
           * **The dashboard opens into itself, not into a dialog.** Its name and its widgets are drawn under the row
           * — see `renderDashboardBody` — which leaves the widget editor as the only dialog in the loop. A dashboard
           * dialog listing widgets, each row opening the editor on top of it, would on Save send the keyboard out of
           * both to the settings window behind.
           */
          expand: {
            label: t('library_page.show_widgets'),
            collapseLabel: t('library_page.hide_widgets'),
            render: (body, handle) =>
              renderDashboardBody(body, {
                app: this.app,
                dashboard,
                collections: this.plugin.settings.libraryCollections,
                newId: () => `widget-${generateStyleId()}`,
                // Saved without redrawing the page: this body is ON the page, so a redraw would take the control
                // being used out from under the reader. The two lines a change can affect are repainted by hand.
                save: () => this.saveLibraryQuietly(),
                onCountChange: () => handle.setDesc(this.dashboardDesc(dashboard, readActiveDashboard())),
                onRename: (name) => handle.setName(name),
                log: (msg) => logSettings(this, `dashboard ${dashboard.id} ${msg}`),
              }),
          },
          actions: [
            // Copying is how the provided dashboard becomes yours: it cannot be edited away, but it can be a start.
            {
              icon: 'copy',
              label: t('library_page.dashboard_copy'),
              run: () => {
                const at = dashboards.indexOf(dashboard);
                dashboards.splice(at + 1, 0, {
                  id: `dashboard-${generateStyleId()}`,
                  name: t('library_page.dashboard_copy_suffix', { name: dashboard.name }),
                  // New widget ids, so reordering the copy cannot disturb the original.
                  widgets: dashboard.widgets.map((w) => ({
                    ...w,
                    id: `widget-${generateStyleId()}`,
                    system: undefined,
                  })),
                });
                this.saveDashboards();
                new Notice(t('library_page.dashboard_copied'));
              },
            },
            // **No delete on the provided dashboard, and none on the last one standing**: the first is rebuilt from
            // code each load, and the library has to have a dashboard to open. It keeps the SLOT either way — see
            // `hidden` — or one row's controls would sit a button's width from every other row's. Asked before
            // doing, and by name: a mis-tap on the wrong row is the mistake being guarded against.
            {
              icon: 'trash',
              hidden: dashboard.system === true || dashboards.length <= 1,
              label: t('action.delete'),
              run: () =>
                confirmThen(
                  this.app,
                  {
                    title: t('library_page.delete_dashboard_title'),
                    message: t('library_page.delete_dashboard_confirm', { name: dashboard.name }),
                    confirmText: t('action.delete'),
                  },
                  () => {
                    dashboards.splice(dashboards.indexOf(dashboard), 1);
                    if (readActiveDashboard() === dashboard.id) writeActiveDashboard(dashboards[0]?.id ?? '');
                    this.expandedRows.delete(dashboard.id);
                    this.saveDashboards();
                    new Notice(t('library_page.dashboard_deleted'));
                  }
                ),
            },
          ],
          // Available or not, rather than "which one opens": the Library's own switcher decides what is showing, so
          // the only thing left to say here is whether a dashboard is offered at all.
          toggle: {
            value: dashboardEnabled(dashboard.id, readDashboardOrder()),
            onChange: (on) => {
              // Into this device's list, not into the dashboard: switching one off here must leave it live on the
              // phone.
              const order = settledOrder(dashboards, readDashboardOrder());
              const at = order.findIndex((place) => place.id === dashboard.id);
              if (at >= 0) order[at] = { id: dashboard.id, enabled: on };
              writeDashboardOrder(order);
              // Switching off the one on screen would leave the Library painting a dashboard nobody can reach from
              // the switcher, so it moves to the first that is still available.
              if (!on && readActiveDashboard() === dashboard.id) {
                const next = enabledDashboards(dashboards, order).find((d) => d.id !== dashboard.id);
                writeActiveDashboard(next?.id ?? '');
              }
              // One card: "Showing now" may have moved to another row, and nothing else on the page changed.
              this.saveDashboards();
            },
          },
        })
      ),
      expanded: this.expandedRows,
      // **Reordering publishes nothing.** Order is per device — see `orderedDashboards` — so this moves an entry in
      // this device's own list and leaves what every device holds untouched.
      move: (from, to) => {
        writeDashboardOrder(movedInOrder(settledOrder(dashboards, readDashboardOrder()), from, to));
        refreshLibraryViews(this.plugin);
      },
      log: (msg) => logSettings(this, `dashboards ${msg}`),
    });
  }

  /**
   * One species' collections, as a list with no order of its own.
   *
   * Alphabetical, and not reorderable: a collection is a file, and an array's order has nowhere to live in a
   * folder of files — see `collectionsOfSpecies`. So no arrows and no drag handle, which is `renderReorderList` with
   * no `move`.
   */
  private renderCollectionList(
    el: HTMLElement,
    entry: {
      species: NoteSpecies;
      heading: TranslationKey;
      desc: TranslationKey;
      empty: TranslationKey;
      add: TranslationKey;
    }
  ): void {
    const collections = this.plugin.settings.libraryCollections;
    renderReorderList(el, {
      heading: t(entry.heading),
      desc: t(entry.desc),
      emptyState: t(entry.empty),
      add: {
        label: t(entry.add),
        run: () => {
          // The species is stamped at creation and never asked again — the whole point of two lists.
          new CollectionModal(this.app, null, entry.species, (values) => {
            collections.push({
              id: `collection-${generateStyleId()}`,
              ...values,
              species: entry.species === 'title' ? undefined : entry.species,
              enabled: true,
            });
            void this.saveLibraryAndRedraw();
            new Notice(t('library_page.collection_added'));
          }).open();
        },
      },
      rows: collectionsOfSpecies(collections, entry.species).map((collection) => this.collectionRow(collection)),
    });
  }

  /**
   * Save and repaint the Library, leaving this page alone.
   *
   * **What a change made INSIDE the page needs.** A widget switched off, a dashboard renamed, a widget moved: redraw
   * the page for any of those and the control being used is destroyed under the reader's finger — which is the whole
   * reason these lists are ours (see `renderReorderList`). The one or two lines such a change affects are repainted
   * by hand instead; see `RowHandle`.
   */
  private saveLibraryQuietly(): void {
    void this.plugin.saveSettings();
    refreshLibraryViews(this.plugin);
  }

  /**
   * Put the keyboard in a freshly expanded row's first field — the name of a dashboard that has just been created.
   *
   * **Tried several times, not once.** The page is rebuilt asynchronously and the settings pane focuses ITSELF when it
   * rebuilds, so a single claim on the next frame is made either before the field exists or just before the pane takes
   * it back. Each attempt checks whether the field already holds focus and stops as soon as it does; the last one is
   * late enough to be after anything the pane does of its own accord.
   */
  private focusRowBody(key: string): void {
    const win = this.containerEl.win;
    const claim = (where: string): boolean => {
      /**
       * **Searched from the card, not from the tab's container.** A drill-down page is rendered into a container of
       * Obsidian's own making, not inside `containerEl` — so searching there finds nothing at all and reports
       * `bodies=0` while the reader is looking at the list.
       */
      const scope = this.dashboardsHostEl ?? this.containerEl;
      const expander = scope.querySelector(`[data-orbis-focus="expand:${CSS.escape(key)}"]`);
      const row = expander?.closest('.setting-item');
      const field = row?.querySelector<HTMLInputElement>('.orbis-row-body input');
      const doc = scope.ownerDocument;
      const say = (el: Element | null | undefined): string =>
        el ? `${el.tagName}.${(el.className || '').toString().split(' ')[0]}` : 'none';
      if (!field) {
        // Kept, not temporary: a claim that finds no field is a claim aimed at the wrong root, and this line is what
        // names it. It only ever fires when something is wrong.
        logSettings(
          this,
          `${where}: expander=${say(expander)} row=${say(row)} field=none bodies=${scope.querySelectorAll('.orbis-row-body').length} expanded=${[...this.expandedRows].join(',')}`
        );
        return false;
      }
      if (doc.activeElement === field) return true;
      field.focus();
      // A new row is the last one on a long page, so it may well be below the fold.
      field.scrollIntoView({ block: 'center' });
      const landed = doc.activeElement === field;
      if (!landed) {
        logSettings(
          this,
          `${where}: focus() did not land — active=${say(doc.activeElement)} hasFocus=${doc.hasFocus()}`
        );
      }
      return landed;
    };
    win.requestAnimationFrame(() => {
      if (claim('frame')) return;
      for (const delay of [50, 150, 400]) {
        win.setTimeout(() => claim(`${delay}ms`), delay);
      }
    });
  }

  /** Save, refresh the library views, and redraw this page. */
  private async saveLibraryAndRedraw(): Promise<void> {
    await this.plugin.saveSettings();
    refreshLibraryViews(this.plugin);
    this.plugin.refreshViews();
    this.renderSettings();
  }

  /**
   * One collection's row, for either species.
   *
   * Shared by the two lists rather than written twice: a collection is the same thing whichever species it gathers,
   * and the only difference is which list it appears in.
   */
  private collectionRow(collection: LibraryCollection): ReorderRow {
    const collections = this.plugin.settings.libraryCollections;
    // What it gathers, in its own units: "Every title" under a collection of highlights would describe the wrong
    // species, as would "every title in the vault" beneath All reading records.
    const records = speciesOf(collection) === 'reading_record';
    /**
     * Copying is how one collection's arrangement — its conditions, its grouping, the names and order it gives a
     * field's values — becomes the starting point for the next instead of being built twice. It is also the only
     * thing offered on the provided collection, which is rebuilt from code each load and so cannot be edited.
     */
    const copy = () => {
      // Appended rather than placed after the original: the list is alphabetical, so "after" means nothing — the copy
      // lands next to its source by name anyway, which is where anyone would look for it.
      collections.push({
        ...structuredClone(collection),
        id: `collection-${generateStyleId()}`,
        name: t('library_page.collection_copy_suffix', { name: collection.name }),
        // A copy is the reader's, whatever it was copied from: one that claimed to be provided would be overwritten
        // at the next start.
        system: undefined,
      });
      void this.saveLibraryAndRedraw();
    };
    const openEditor = (): void =>
      new CollectionModal(this.app, collection, speciesOf(collection), (values) => {
        Object.assign(collection, values);
        void this.saveLibraryAndRedraw();
      }).open();
    /**
     * **Delete is the row's**, as it is everywhere else in settings — not inside the editor, which would make the
     * pencil the way to destroy a collection.
     *
     * Refused rather than cascaded when a widget uses it: deleting a collection out from under one leaves a dashboard
     * with a section that says "this points at nothing", and quietly deleting the widgets too would be a second,
     * larger action nobody asked for. Asked before doing, and by name — a collection is a set of conditions someone
     * assembled, there is no undo, and a mis-tap on the wrong row is the mistake being guarded against.
     */
    const remove = () => {
      const user = this.dashboardUsing(collection.id);
      if (user) {
        new Notice(t('library_page.collection_in_use', { name: user }));
        return;
      }
      confirmThen(
        this.app,
        {
          title: t('library_page.delete_collection_title'),
          message: t('library_page.delete_collection_confirm', { name: collection.name }),
          confirmText: t('action.delete'),
        },
        () => {
          collections.splice(collections.indexOf(collection), 1);
          void this.saveLibraryAndRedraw();
          new Notice(t('library_page.collection_deleted'));
        }
      );
    };
    /**
     * **Every way in goes through one gate and one trace.** The pencil and the tap on the row are two paths to the
     * same editor, and two editors open at once is the shape that loses work — the stale one saves over the change.
     * `openOnRowTap` gates its own path, so only the pencil is wrapped here.
     */
    const edit = (from: string) => () => {
      logSettings(this, `open collection editor (${from}) ${collection.id} ${collection.name}`);
      openEditor();
    };
    return {
      key: collection.id,
      name: collection.name,
      // How many conditions it carries, counted rather than stored, so the row cannot describe a stale collection.
      // None is not "unconfigured" any more — it is everything of that species, which the row says outright.
      desc: collection.system
        ? t(records ? 'library_page.record_collection_system' : 'library_page.collection_system')
        : countRules(collection) === 0
          ? t(records ? 'library_page.rules_none_records' : 'library_page.rules_none')
          : countRules(collection) === 1
            ? t('library_page.rules_count_one')
            : t('library_page.rules_count', { count: String(countRules(collection)) }),
      // The pencil leads, as it does in every list — and the provided collection has none: an edit that vanishes at
      // the next start is worse than an edit that was never offered. Copy is the one thing it does offer, which is
      // how you make a version that IS yours. No switch: whether a collection appears is a question about the widget
      // showing it, and with two switches for one thing "off" could mean either "not here" or "nowhere".
      // **The provided row keeps every slot it cannot use.** Without the pencil's slot its Copy would sit where every
      // other row's pencil is — the jaggedness `ReorderAction.hidden` exists to prevent.
      actions: [
        {
          icon: 'pencil',
          label: t('lookup_page.edit'),
          hidden: collection.system === true,
          run: () => openOnce(edit('pencil')),
        },
        { icon: 'copy', label: t('library_page.collection_copy'), run: copy },
        { icon: 'trash', label: t('action.delete'), hidden: collection.system === true, run: remove },
      ],
      openOnTap: collection.system ? undefined : edit('row'),
    };
  }

  /**
   * Save, then redraw whichever page is showing — a row's name, its description and its locked state are all built
   * from settings, so a write that changes one of those has to redraw to be seen.
   */
  private async saveAndRefresh(): Promise<void> {
    await this.plugin.saveSettings();
    /**
     * **And not while a dialog is open**, for the reason `renderSettings` gives — with one worse symptom here:
     * calling `display()` on a page the settings modal has navigated away from drops it back to its first tab, so
     * saving a widget would leave the reader looking at Obsidian's General settings behind their own dialog.
     */
    whenDialogsClose(() => {
      /**
       * **Focus is captured HERE, not before the save.** Read at the top of this method — while the dialog that
       * asked for the save is still open — it would record the dialog's own Save button, and restoring that after
       * the dialog closes would find nothing and fall back to the first control on the page. By the
       * time this runs the dialog has gone and the host has put the keyboard back on the row's pencil, which is the
       * thing the redraw has to carry across.
       */
      rebuildKeepingFocus(this.rebuildRoot(), () => this.redraw());
    });
  }

  /**
   * One dictionary's download/remove row.
   *
   * Rendered from `dictionaryState`, which caches a line per book rather than a promise because a definition is
   * built synchronously. The first render shows whatever was last known (nothing, on a fresh open), asks, and
   * repaints the description if the answer changed — so the row settles a frame later instead of blocking the page.
   *
   * **Downloading IS enabling.** There is no toggle beside the button: the panel offers whichever books are on the
   * disk, so a second control could only disagree with the first.
   */
  private renderDictionaryRow(el: HTMLElement, service: DictionaryService): void {
    const id = service.source.id;
    const about = id === 'webster' ? t('lookup_page.webster_desc') : t('lookup_page.wordnet_desc');
    const setting = new Setting(el).setName(dictionaryName(service.source));
    /**
     * The description, plus the line saying where the book came from.
     *
     * Rewritten together because `setDesc` replaces the whole description, and the credit has to outlive every
     * repaint: it is the one part of the row that does not depend on whether the file is on disk. A real link,
     * so it can be followed — a raw URL drawn under every definition in the look-up popup could not be.
     */
    const paintDesc = (text: string): void => {
      setting.setDesc(text);
      const { credit } = service.source;
      const link = setting.descEl.createEl('a', {
        cls: 'orbis-dictionary-credit',
        text: credit.text,
        href: credit.url,
      });
      link.setAttr('target', '_blank');
      link.setAttr('rel', 'noopener');
    };
    paintDesc(this.dictionaryState.get(id) ?? about);
    let btn: ButtonComponent;
    const describe = async (): Promise<void> => {
      const has = await service.isDownloaded();
      const next = has
        ? t('lookup_page.downloaded', { size: ((await service.sizeBytes()) / 1024 / 1024).toFixed(1) })
        : `${about} ${t('lookup_page.about_size', { size: String(service.source.sizeMb) })}`;
      btn.setButtonText(has ? t('action.remove') : t('lookup_page.download'));
      // **Cleared before either is applied.** Obsidian's setters only ADD their class, and this button changes role
      // in place: a row downloaded during the session would keep `mod-cta` under the `mod-warning` that follows it,
      // and the two together are a defined look — `setWarning()` IS `setDestructive().setCta()`, a destructive
      // PRIMARY action. So the row you had just downloaded would shout in solid red beside the one already there.
      btn.buttonEl.removeClasses(['mod-cta', 'mod-warning']);
      if (has) btn.setDestructive();
      else btn.setCta();
      btn.setDisabled(false);
      if (next !== this.dictionaryState.get(id)) {
        this.dictionaryState.set(id, next);
        paintDesc(next);
      }
    };
    setting.addButton((b) => {
      btn = b;
      b.onClick(async () => {
        b.setDisabled(true);
        try {
          if (await service.isDownloaded()) {
            await service.remove();
            new Notice(t('lookup_page.removed'));
          } else {
            b.setButtonText(t('lookup_page.downloading'));
            await service.download();
            new Notice(t('lookup_page.download_done'));
          }
        } catch (err) {
          new Notice(downloadFailedMessage(err));
        }
        await describe();
      });
    });
    void describe();
  }

  /**
   * The Toolbar page: which buttons the reader's toolbar shows, and what the two of them that open something can
   * open.
   *
   * **The button rows are `render`, not `control`, to keep their glyphs.** A declarative row's `name` is a plain
   * string with no icon slot, and the glyph beside each row is the button it governs — the fastest way to find
   * the one you mean. A `render` row is still a declarative row: named, indexed for search, and honoring
   * `visible`. What it gives up is the automatic save (done in the shared toggle helper below), `validate`
   * (nothing here to validate) and a `disabled` predicate (nothing here disables).
   *
   * **Ordinary rows, not compact grids of bare toggles.** Rows take more scrolling and give something back that
   * matters more — searching "backlinks" or "time remaining" finds that toggle instead of finding nothing. Their
   * disable rules are `disabled` predicates, evaluated on every render and re-run by `refreshDomState()` after any
   * write.
   */
  /**
   * The Reading behavior page: how the book behaves, as opposed to how it looks.
   *
   * Small, and kept as its own top-level entry rather than folded into Display styles, because the two are
   * different things — the nine display properties belong to a *style*, and these belong to nobody. It is also
   * where the arrow keys and the progress indicator belong — the Toolbar page is where you turn the indicator on,
   * not what it is.
   *
   * **The marks manager lives on Annotations.** What is here is one idea — nothing here is about what you add to a
   * book, only about what the reader does while you read it. `confirmDeleteNote` stays, for the reason on its own
   * row below.
   */
  private readingItems(): SettingDefinitionItem[] {
    const modeIds = PROGRESS_MODE_DISPLAY_ORDER;
    return [
      {
        name: t('reading_page.keyboard_page_turn'),
        desc: t('reading_page.keyboard_page_turn_desc'),
        control: { type: 'toggle', key: 'keyboardPageTurn' },
      },
      {
        name: t('reading_page.show_page_arrows'),
        desc: t('reading_page.show_page_arrows_desc'),
        control: { type: 'toggle', key: 'showPageArrows' },
      },
      {
        name: t('reading_page.flash_navigation'),
        desc: t('reading_page.flash_navigation_desc'),
        control: { type: 'toggle', key: 'flashOnNavigation' },
      },
      {
        name: t('reading_page.link_preview'),
        desc: t('reading_page.link_preview_desc'),
        control: { type: 'toggle', key: 'linkPreviewEnabled' },
      },
      {
        /**
         * **Here, not on Annotations.** It reads as a setting about
         * the marks you curate and is not: it guards deleting the note attached to a highlight, which is a
         * question about how careful a tap should be — the same family as the arrow keys and the flash above it.
         * Beside the exports it would also read as being about note FILES, which is a different feature. And it is
         * the only plain toggle in that set, so moving it would leave one checkbox under four rows that all open
         * something.
         */
        name: t('reading_page.confirm_delete_note'),
        desc: t('reading_page.confirm_delete_note_desc'),
        control: { type: 'toggle', key: 'confirmDeleteNote' },
      },
      /**
       * **After the four toggles, which stay unheaded at the top.** A headed card cannot lead this page: the four
       * rows above have no name that distinguishes them from *Reading behavior* itself — every row here is "while
       * you read" — so heading them would invent a category to solve a layout problem. Unheaded first and headed
       * groups after is what the Listening page does too.
       */
      ...this.openingItems(),
      /**
       * **The indicator and its modes are one thing, so they are one group.**
       *
       * Split into a toggle among the page's other rows and a separate headed card of modes, they would draw a line
       * through the middle of a single decision. The switch carries no toolbar glyph: it would be the only iconed row
       * on a page with no other icons, implying it was one of the buttons rather than the readout it governs.
       *
       * One card, no sub-heading. The six modes follow a line that names them, so a second heading between the
       * two would be another divider in the thing being undivided.
       */
      {
        type: 'group',
        heading: t('toolbar_page.progress_heading'),
        items: [
          {
            name: t('toolbar_page.show_reading_progress_indicator'),
            // Carries the "at least one" rule, rather than a `desc` on the GROUP — a property
            // `SettingDefinitionGroup` does not have (it has `heading`), so it would never render. It would still
            // type-check, because excess-property checking against a union accepts anything one member declares.
            desc: t('toolbar_page.progress_cycle_desc'),
            control: { type: 'toggle', key: 'showProgressIndicator' },
          },
          ...modeIds.map((id) => {
            // The last one left locks on, and says why: Obsidian marks a disabled row without dimming it, and a
            // sentence beats a gray toggle — gray leaves the reader to work out the rule for themselves.
            const locked =
              (readDeviceSettingKey(`progressModes.${id}`) as boolean) &&
              visibleCount(deviceSettings(), 'progressModes', modeIds) === 1;
            return {
              name: t(PROGRESS_MODE_GRID_LABELS[id].main),
              desc: locked ? t('toolbar_page.last_progress_mode') : t(PROGRESS_MODE_GRID_LABELS[id].sub),
              control: { type: 'toggle' as const, key: `progressModes.${id}`, disabled: locked },
              // Each mode goes when the indicator is off — there is nothing to choose about a readout that is
              // not shown, and dimming six rows says less than removing them. Per row rather than on the group,
              // since the switch shares the group and has to stay.
              visible: () => deviceSetting('showProgressIndicator'),
            };
          }),
        ],
      },
    ];
  }

  /** The Theme manager, on Appearance — see `settings-themes.ts`. */
  themeManagerPage(): SettingDefinitionItem {
    return this.subPage(t('themes.page'), t('themes.choose_make_desc'), (el) => buildThemeManagerPage(el, this));
  }

  toolbarItems(): SettingDefinitionItem[] {
    return [
      this.buttonToggle('showTocButton', t('toolbar_page.show_navigator'), 'toc'),
      this.buttonToggle('showSearchButton', t('toolbar_page.show_search_button'), 'search'),
      this.buttonToggle('showBookmarkButton', t('toolbar_page.show_bookmark_button'), 'bookmark'),
      this.buttonToggle('showTtsButton', t('toolbar_page.show_read_aloud_button'), 'listen'),
      this.buttonToggle('showNoteIconsButton', t('toolbar_page.show_note_icons_button'), 'noteicons'),
      this.buttonToggle('showDisplayStyleButton', t('toolbar_page.show_display_style_button'), 'displayStyle'),
      this.buttonToggle(
        'showAnnotationsButton',
        t('toolbar_page.show_annotations_button'),
        'annotations',
        t('toolbar_page.annotations_desc')
      ),
      this.buttonToggle(
        'showFocusButton',
        t('toolbar_page.show_focus_mode_button'),
        'focus',
        t('toolbar_page.focus_mode_desc')
      ),
    ];
  }

  /** One toolbar-button row: the button's own glyph, then a toggle that saves and refreshes open readers. */
  private buttonToggle(key: string, name: string, icon: string, desc?: string): SettingDefinitionRender {
    return this.glyphToggle({ key, name, svg: TOOLBAR_BUTTON_SVGS[icon], desc });
  }

  /**
   * A row that shows the glyph of the thing it turns on, then the toggle.
   *
   * A `render` row rather than a `control` one because the two are mutually exclusive in the API and only `render`
   * can reach `nameEl` — so `disabled` has to be applied by hand here (`setSettingDisabled` marks the row the way
   * Obsidian's own does) rather than declared.
   */
  private glyphToggle(o: { key: string; name: string; svg: string; desc?: string }): SettingDefinitionRender {
    return {
      name: o.name,
      desc: o.desc,
      render: (setting) => {
        setting.nameEl.addClass('orbis-label-row');
        const glyph = setting.nameEl.createSpan({ cls: 'orbis-icon-opacity' });
        setSvgIcon(glyph, o.svg);
        setting.nameEl.prepend(glyph);
        setting.descEl.addClass('orbis-icon-indent');
        setting.addToggle((toggle) =>
          // Through `getControlValue`, not `readSettingKey`: the key may name a device setting rather than one that
          // travels, and the row should not have to know which.
          toggle.setValue(this.getControlValue(o.key) as boolean).onChange(async (value) => {
            await this.setControlValue(o.key, value);
          })
        );
      },
    };
  }

  /**
   * Annotation presets live in their own dialog (AnnotationPresetsModal), not inline here — the list grows
   * without bound and each mark row needs more affordances than a settings pane can hold, and the same UI
   * has to be openable from a reader. Settings is just the front door, like "Manage glossary".
   *
   * Kept even though other doors open this dialog, because it is the only one that opens the
   * LIBRARY scope, and the only one that works with no book open: with no book there is no toolbar, and the
   * command palette only helps someone who already knows the command exists. Settings is the browsable
   * index, which is what a reader reaches for when they cannot find something.
   */
  /**
   * The Book to Markdown page: turning the book you are reading into notes in your vault.
   *
   * Its own page: it is the book itself becoming Markdown, which is a different job from taking your marks out of
   * it — the two would share a page only because both produce files.
   */
  private bookExportItems(): SettingDefinitionItem[] {
    const perChapter = this.plugin.settings.bookExport.perChapter;
    return [
      ...this.destinationRows('markdownSameFolderAsBook', 'bookExport.defaultExportFolder', {
        name: t('save_as_markdown_page.default_folder'),
        desc: t('save_as_markdown_page.default_folder_desc'),
        book: t('save_as_markdown_page.default_folder_book'),
        folder: t('save_as_markdown_page.default_folder_folder'),
        folderName: t('save_as_markdown_page.folder'),
        folderDesc: t('save_as_markdown_page.folder_desc'),
      }),
      {
        // A dropdown, not a radio pair. Two radios each carrying a sentence work as free-standing divs in a tab;
        // inside a `Setting` they land in the control area, which is a right-aligned flex row, and read as broken.
        //
        // The description covers BOTH states rather than the one selected. Describing the RESULT of the chosen
        // option is the control's own job — the dropdown already says which one you are in. A
        // description that varies with another setting is fine (see Include images below, which says where the
        // images land and depends on this row); one that varies with its OWN value is a label echoing itself.
        name: t('save_as_markdown_page.default_format'),
        desc: t('save_as_markdown_page.default_format_desc'),
        render: (setting) => {
          setting.addDropdown((d) => {
            d.addOption('single', t('generate_notes_modal.single_obsidian_note'))
              .addOption('folder', t('generate_notes_modal.book_folder'))
              .setValue(perChapter ? 'folder' : 'single')
              .onChange(async (v) => {
                this.plugin.settings.bookExport.perChapter = v === 'folder';
                await this.plugin.saveSettings();
                this.renderSettings(); // this row's description and the images row's both depend on the answer
              });
          });
        },
      },
      {
        name: t('book_export_modal.include_images'),
        // Where the images land depends on the format above, so this line is computed rather than fixed — which
        // is why choosing a format calls `update()` rather than `refreshDomState()`. Legitimately dynamic: it
        // describes the effect of ANOTHER control, not the state of the toggle beside it.
        desc: perChapter ? t('book_export_modal.assets_folder_desc') : t('book_export_modal.assets_alongside_desc'),
        control: { type: 'toggle', key: 'bookExport.includeImages' },
      },
      {
        name: t('save_as_markdown_page.link_format'),
        desc: t('save_as_markdown_page.link_format_desc'),
        control: {
          type: 'dropdown',
          key: 'bookExport.imageFormat',
          options: {
            wiki: t('save_as_markdown_page.wikilink_image_jpg'),
            markdown: t('save_as_markdown_page.standard_markdown_image_jpg'),
          },
        },
      },
      /**
       * **`frontmatterKeyLanguage` has no row, deliberately — it cannot do anything yet.**
       *
       * `src/i18n/` ships `en.ts` alone, and `en.ts` exports no `frontmatterAliases`, so
       * `activeFrontmatterAliases` is permanently `{}`. Both values of the setting then return the canonical key
       * from `resolveFrontmatterKey`: `english` short-circuits, and `native` searches an empty map and falls
       * through to the same answer. There is no input for which the two differ.
       *
       * A control with one effective value is worse than no control. It asks for a decision that cannot change a
       * file, and "Native" promises localized keys that do not exist — someone who picks it and then writes a
       * Dataview query against localized names is debugging a promise the product never made.
       *
       * **The setting itself stays**, along with both callers (`export-format.ts` writes keys, `markdown-epub.ts`
       * reads them) and its place in `shared-settings.ts`. The mechanism is right and costs nothing; only the row
       * is absent, so nothing migrates and nothing has to be rebuilt.
       *
       * **What brings it back: a second locale.** Ship a locale file exporting `frontmatterAliases` and this has
       * real values again. Do NOT put the row back here when that happens — it belongs to Generate notes and
       * Notes to EPUB, its only two callers, and Book export is the one export it never touches. A page shared by
       * several exports is the right home, named for what its members have in common
       * rather than "Advanced" or "Export settings" — see the Note content fold for why a name that says where
       * controls were put is not a name.
       *
       * Its description also cites `date_read` as the example, which `library/status.ts` writes as a plain
       * literal that never passes through `resolveFrontmatterKey`. Fix that before showing it again.
       */
    ];
  }

  /**
   * Its own section, not a mode under a note style — note export produces documents you read, on demand, for one
   * book; records produce a queryable database for every book, and they share no settings.
   *
   * **One plain `Setting` per control, and no custom layout CSS.** A single gray box with the folder row and the
   * kind toggles built by hand cannot match the folder pickers above it: stacking puts the enable toggle where no
   * other toggle sits, wrapping lets a long description push it onto its own line, `infoEl` centers things against a
   * narrower container, and declarations copied verbatim from the working rule STILL render differently.
   *
   * The reason is that Obsidian renders a hidden measuring clone of every dropdown —
   * `<select class="dropdown is-measuring" aria-hidden="true">` — and sizes the real one from it through
   * `--dropdown-fitted-width`. That clone is a flex item, so the geometry of a folder row depends on an element
   * that is not visible and not documented. Imitating it from the outside is guessing.
   *
   * So: no imitation. Each row is a real `Setting`, laid out by the same code that lays out "Notes folder" and
   * "Include images", and therefore identical to them by construction rather than by resemblance. The cost is
   * five gray boxes instead of one, which is what every other section on this tab already looks like.
   */
  /**
   * Where `Save note as EPUB` proposes writing the file.
   *
   * Shaped like Obsidian's own "Default location for new attachments": a two-option dropdown, and the folder row
   * appears only when it is needed. Hidden rather than disabled — a dimmed control still occupies a gray box and
   * still asks to be read, whereas Obsidian's convention is that the second choice reveals its own field.
   *
   * A default, not a rule: the conversion dialog shows the name and folder every time and either can be changed
   * for one conversion.
   */
  /**
   * The Save-note-as-EPUB page: where a converted note lands, and whether its remote images come with it.
   *
   * **The reveal is a `visible` predicate**, which says declaratively what a `hide()`/`show()` from the dropdown's
   * own handler would, and `update()` applies it.
   *
   * **The folder row is `render`.** Obsidian's `type: 'folder'` gives a suggester but no way to CREATE a folder,
   * and exporting to a folder that does not exist yet is the ordinary case — so the dropdown keeps its `+`. A
   * `render` row is still indexed by settings search.
   */
  private epubItems(): SettingDefinitionItem[] {
    return [
      {
        name: t('save_as_epub_page.default_folder'),
        desc: t('save_as_epub_page.default_folder_desc'),
        render: (setting) => {
          setting.addDropdown((d) => {
            d.addOption('note', t('save_as_epub_page.default_folder_note'))
              .addOption('folder', t('save_as_epub_page.default_folder_folder'))
              .setValue(this.plugin.settings.epubSameFolderAsNote ? 'note' : 'folder')
              .onChange(async (v) => {
                this.plugin.settings.epubSameFolderAsNote = v === 'note';
                await this.plugin.saveSettings();
                this.renderSettings(); // the folder row below appears or goes with this answer
              });
          });
        },
      },
      {
        name: t('save_as_epub_page.folder'),
        desc: t('save_as_epub_page.folder_desc'),
        visible: () => !this.plugin.settings.epubSameFolderAsNote,
        render: (setting) => this.folderRow(setting, 'epubFolder'),
      },
      {
        // A default, not a lock: the conversion dialog still offers the switch, and still only when a note
        // actually has images hosted elsewhere.
        name: t('save_as_epub_page.remote_images'),
        desc: t('save_as_epub_page.remote_images_desc'),
        control: { type: 'toggle', key: 'epubFetchRemoteImages' },
      },
      // **The same value the dialog's picker writes back to.** A default here and a dialog that "remembers the
      // last one" would be two answers to one question, guaranteed to disagree within a week. Only shown when the
      // library is on, since it exists for the title note the converter writes.
      {
        name: t('save_as_epub_page.default_type'),
        desc: t('save_as_epub_page.default_type_desc'),
        visible: () => this.plugin.settings.libraryEnabled,
        control: { type: 'text', key: 'epubDefaultType', placeholder: 'book' },
      },
      /**
       * Which heading level becomes a chapter — **a preference the dialogs resolve against real content.**
       *
       * Every level is offered here, including ones a given note has none of, because this is a statement about
       * how you organize notes rather than about any one of them. The dialog is where it meets reality: it lists
       * only the levels present and opens on the nearest one to this. See `resolveSplitLevel`.
       */
      {
        name: t('save_as_epub_page.split_level'),
        desc: t('save_as_epub_page.split_level_desc'),
        control: {
          type: 'dropdown',
          key: 'epubSplitLevel',
          options: {
            0: t('save_as_epub_page.split_none'),
            ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [n, t('epub_export.split_level', { n: String(n) })])),
          },
        },
      },
    ];
  }

  /**
   * A folder picker row: every existing folder, plus `+` to make a new one.
   *
   * Four pages ask this question, and each needs a dropdown, a `+` opening `NewFolderModal`, and the stacked class
   * so a wide `<select>` does not squeeze the description into a sliver. One helper, because four copies of a
   * picker is four places for the next fix to be forgotten.
   */
  private folderRow(setting: Setting, key: string, defaultLabel?: string): void {
    // With a default, an empty setting is a CHOICE and has to be selectable: `''` is its own option, and `/` goes
    // back to meaning only the vault root. Without one, an empty setting means "not chosen yet" and shows as `/`,
    // which is the shape every other folder row has. Treated alike, the two would be the same value on screen and
    // different values in storage — a covers folder set to the default would read as "vault root" and could not be
    // set back to the default.
    const raw = (): string => (readSettingKey(this.plugin.settings, key) as string) ?? '';
    const current = (): string => (defaultLabel !== undefined ? raw() : raw() || '/');
    folderPickerRow(setting, {
      app: this.app,
      // This row rebuilds the whole page when the folder changes, so the keyboard needs a name to come back to.
      focusKey: `folder:${key}`,
      current: () => (current() === '/' ? '' : current()),
      extra: defaultLabel !== undefined ? { '': defaultLabel } : undefined,
      heightLock: this.plugin,
      onPick: (path) => {
        void (async () => {
          await this.setControlValue(key, path);
          // A full redraw, not the `refreshDomState()` a plain key gets: a folder that did not exist when this
          // dropdown was built is not among its options, so re-running the predicates leaves the row showing `/`
          // and the new folder unlisted. Rebuilding re-reads the vault.
          this.renderSettings();
        })();
      },
    });
    /**
     * **Beside the label, not below it.** A `<select>` listing every folder in the vault sizes itself to its widest
     * option, which would force these rows to stack — and a stacked row reads as a different KIND of setting from
     * every row around it. Capping the select (`.orbis-folder-line`) removes the reason: the picker and its `+` sit
     * in the control column where Obsidian puts a control, and a long folder name is clipped rather than allowed to
     * push the row's name into a sliver.
     */
    setting.controlEl.addClass('orbis-folder-line');
    setting.settingEl.addClass('orbis-line-row'); // see `.orbis-line-row` in styles.css
  }

  /**
   * Where a PDF of your marks and notes goes, and who it says marked them.
   *
   * **Three rows, because nothing else is about this artifact.** Include marks, the cover sheet and the expanded
   * character set all belong to the book's text, and which of the two PDFs you want is answered by the command.
   * What is left is the destination and the byline.
   *
   * **Defaults, not memories.** The dialog does not write these BACK — that would make the settings and the dialog
   * two names for one value, and leave the page having to explain that reading it is not enough. Every other export
   * in the plugin treats its settings as a starting point the dialog may depart from for one export, and so does
   * this page.
   */
  private annotationsPdfItems(): SettingDefinitionItem[] {
    return [
      ...this.pdfDestinationRows('marksPdfSameFolderAsBook', 'marksPdfFolder'),
      {
        name: t('pdf_pages.name'),
        desc: t('pdf_pages.name_desc_annotations'),
        control: { type: 'text', key: 'pdfAttribution', placeholder: t('pdf_pages.name_placeholder') },
      },
    ];
  }

  /**
   * Every answer the Save-as-PDF dialog opens on, for the book itself.
   *
   * The rows are ordered structural-first: where the file goes and what is in it, then the refinements. The two
   * toggles need no `visible` predicate on the scope — this page only ever describes the book's text.
   *
   * **The expanded character set is here and not on both pages.** It is one download serving both commands, and a
   * second Download/Remove button would be a second answer to a question with one. This is the page whose artifact
   * draws whole pages of the author's prose, so it is where a missing glyph is noticed; the annotations dialog
   * still offers the download at the moment it matters, and Setup offers it before either.
   */
  private bookPdfItems(): SettingDefinitionItem[] {
    return [
      ...this.pdfDestinationRows('bookPdfSameFolderAsBook', 'bookPdfFolder'),
      {
        name: t('pdf_pages.name'),
        desc: t('pdf_pages.name_desc_book'),
        control: { type: 'text', key: 'pdfAttribution', placeholder: t('pdf_pages.name_placeholder') },
      },
      {
        name: t('pdf_pages.marks'),
        control: { type: 'toggle', key: 'bookPdfIncludeMarks' },
        desc: t('pdf_pages.marks_desc'),
      },
      {
        name: t('pdf_pages.cover'),
        desc: t('pdf_pages.cover_desc'),
        // The cover sheet names who marked the book up, so it has nothing to say about a PDF with no marks in it.
        // The export dialog hides it for the same reason; here the row simply goes.
        visible: () => this.plugin.settings.bookPdfIncludeMarks,
        control: { type: 'toggle', key: 'bookPdfCoverSheet' },
      },
      {
        name: t('pdf_pages.fonts'),
        // Built from a cached answer for the same reason the dictionary row is: knowing whether ~3 MB of fonts
        // are on disk takes an await, and `getSettingDefinitions()` must not.
        desc: this.fontState ?? t('pdf_pages.fonts_desc'),
        render: (setting) => this.buildPdfFontRow(setting),
      },
    ];
  }

  /** The PDF pair, for either PDF page: one set of strings, two settings behind it. */
  private pdfDestinationRows(sameFolderKey: 'marksPdfSameFolderAsBook' | 'bookPdfSameFolderAsBook', folderKey: string) {
    return this.destinationRows(sameFolderKey, folderKey, {
      name: t('pdf_pages.default_folder'),
      desc: t('pdf_pages.default_folder_desc'),
      book: t('pdf_pages.default_folder_book'),
      folder: t('pdf_pages.default_folder_folder'),
      folderName: t('pdf_pages.folder'),
      folderDesc: t('pdf_pages.folder_desc'),
    });
  }

  /**
   * The destination pair for an export of the book: beside it, or in one folder.
   *
   * **The same two rows the EPUB and reading-records pages carry**, because it is the same question: beside the
   * source, or in one folder? Taking the keys as arguments is what lets each page answer it separately — a digest
   * you send to someone and a book you keep are the two most likely to want different folders.
   *
   * The reveal is a `visible` predicate, not `hide()`/`show()`; the folder row stays `render` because Obsidian's
   * `type: 'folder'` suggests folders but cannot create one, and saving into a folder that does not exist yet is
   * the ordinary case.
   */
  private destinationRows(
    sameFolderKey: 'marksPdfSameFolderAsBook' | 'bookPdfSameFolderAsBook' | 'markdownSameFolderAsBook',
    folderKey: string,
    text: { name: string; desc: string; book: string; folder: string; folderName: string; folderDesc: string }
  ) {
    const sameFolder = (): boolean => this.plugin.settings[sameFolderKey];
    return [
      {
        name: text.name,
        desc: text.desc,
        render: (setting: Setting) => {
          setting.addDropdown((d) => {
            d.addOption('book', text.book)
              .addOption('folder', text.folder)
              .setValue(sameFolder() ? 'book' : 'folder')
              .onChange(async (v) => {
                this.plugin.settings[sameFolderKey] = v === 'book';
                await this.plugin.saveSettings();
                this.renderSettings(); // the folder row below appears or goes with this answer
              });
          });
        },
      },
      {
        name: text.folderName,
        desc: text.folderDesc,
        visible: () => !sameFolder(),
        render: (setting: Setting) => this.folderRow(setting, folderKey),
      },
    ] satisfies SettingDefinitionItem[];
  }

  /**
   * The expanded character set: whether it is on this device, and a way to change that.
   *
   * The export dialog offers the download at the moment it matters, which is the right place to be ASKED. This is
   * the place to check afterwards — and the only way to get the 3.1 MB back, which a settings tab should not make
   * someone hunt for.
   */
  private buildPdfFontRow(row: Setting): void {
    const dir = `${this.app.vault.configDir}/plugins/orbis-reader/font-cache`;
    const adapter = this.app.vault.adapter;
    let busy = false;

    const paint = (installed: boolean): void => {
      this.fontState = installed ? t('pdf_pages.fonts_installed') : t('pdf_pages.fonts_desc');
      row.setDesc(this.fontState);
      row.clear();
      row.addButton((btn) => {
        btn.setButtonText(installed ? t('action.remove') : t('pdf_pages.fonts_download'));
        btn.setDisabled(busy);
        btn.onClick(() => {
          void (async () => {
            if (busy) return;
            busy = true;
            btn.setDisabled(true);
            try {
              if (installed) await removeFonts(adapter, dir);
              else await downloadFonts(adapter, dir);
            } catch {
              // The reason does not change what the reader can do about it, and the row repaints either way.
              new Notice(t('notices.pdf_fonts_failed'));
            }
            busy = false;
            paint(await fontsInstalled(adapter, dir));
          })();
        });
      });
    };
    // Painted from the answer rather than assuming one: reading the cache is asynchronous, and a row that says
    // "download" for a moment on a device that already has them is a row that lies.
    void fontsInstalled(adapter, dir).then(paint);
  }

  private recordsItems(): SettingDefinitionItem[] {
    const kinds = [
      { key: 'passages', label: 'reading_records_page.kind_passages' },
      { key: 'notes', label: 'reading_records_page.kind_notes' },
      { key: 'bookmarks', label: 'reading_records_page.kind_bookmarks' },
    ] as const;
    // Nothing below the switch until the destination question has been answered. A vault that has never set this
    // up has nothing to show but the switch: every row would be an unanswered default ("Not chosen yet", "Don't
    // create one"), inviting configuration before the decision and duplicating the dialog about to ask it.
    //
    // Hiding, not disabling. A disabled control lies about being interactive; an absent one says "not yet". And
    // nothing is gated on the MODE, deliberately — these are defaults, so the sensible order is to choose the
    // folder and the layout and then switch records on. `recordLocationReady` is what stops a write with no
    // folder chosen, so no control needs to refuse.
    const configured = (): boolean =>
      this.plugin.settings.recordsSetupDone || this.plugin.settings.recordsMode !== 'off';
    const beside = (): boolean => this.plugin.settings.recordsSameFolderAsBook;
    // The same test `allBooksBaseRoot` applies, asked here so the switch and the exporter cannot disagree.
    const allBooksOn = (): boolean => allBooksBaseRoot(this.plugin.settings.recordsAllBooksBaseFolder) !== null;
    const kindsOn = (): number => kinds.filter((k) => this.plugin.settings.recordKinds[k.key]).length;
    return [
      {
        name: t('reading_records_page.enable'),
        desc: t('reading_records_page.desc'),
        render: (setting) => {
          setting.addDropdown((d) => {
            // Off, then the whole-vault answer, then the per-book one — the order someone works through rather
            // than the order the values happen to be declared in.
            d.addOption('off', t('reading_records_page.mode_off'))
              .addOption('on', t('reading_records_page.mode_on'))
              .addOption('ask', t('reading_records_page.mode_ask'))
              .setValue(this.plugin.settings.recordsMode)
              .onChange((v) => this.chooseRecordsMode(v as RecordsMode));
          });
          // Three spelled-out options make a wide <select>, which squeezes a long description into a sliver.
          setting.settingEl.addClass('orbis-setting-stacked');
        },
      },
      {
        // Two independent destinations, each named for what it holds and neither referring to the other.
        name: t('reading_records_page.location'),
        desc: t(beside() ? 'reading_records_page.location_desc_beside' : 'reading_records_page.location_desc_folder'),
        visible: configured,
        render: (setting) => {
          setting.addDropdown((d) => {
            d.addOption('folder', t('reading_records_page.location_folder'))
              .addOption('book', t('reading_records_page.location_beside'))
              .setValue(beside() ? 'book' : 'folder')
              .onChange(async (v) => {
                this.plugin.settings.recordsSameFolderAsBook = v === 'book';
                await this.plugin.saveSettings();
                this.renderSettings(); // the records-folder row appears or goes with this answer
              });
          });
          setting.settingEl.addClass('orbis-setting-stacked');
        },
      },
      {
        name: t('reading_records_page.folder'),
        desc: t('reading_records_page.folder_desc'),
        visible: () => configured() && !beside(), // only when the records themselves use it
        render: (setting) => this.folderRow(setting, 'recordsFolder'),
      },
      /**
       * **The switch that says whether there is an every-book base at all.**
       *
       * A toggle, not a `Don't create one` entry at the top of the folder dropdown below: a row named "Folder for…"
       * is read as "which folder", so an option answering "whether at all" would be invisible in it.
       *
       * **Still one stored value, not two.** `recordsAllBooksBaseFolder` is the single source of truth — empty
       * means declined, exactly as `allBooksBaseRoot` reads it — so there is no flag to fall out
       * of step with the folder. Switching on picks the shared records folder, or the default name when records
       * live beside their books; a folder that does not exist yet shows as "(created when first used)".
       *
       * The trade is that switching off forgets a CUSTOM folder, since the empty string is how "off" is spelled.
       * Turning it back on returns the default rather than the last choice — a rare cost against a decision nobody
       * could otherwise find.
       */
      {
        name: t('reading_records_page.allbooks_on'),
        desc: t('reading_records_page.allbooks_on_desc'),
        visible: configured,
        render: (setting) => {
          setting.addToggle((tg) =>
            tg.setValue(allBooksOn()).onChange((on) => {
              void (async () => {
                await this.setControlValue(
                  'recordsAllBooksBaseFolder',
                  on ? this.plugin.settings.recordsFolder || DEFAULT_RECORDS_FOLDER : ''
                );
                this.renderSettings(); // the folder row below appears or goes with this answer
              })();
            })
          );
        },
      },
      {
        name: t('reading_records_page.allbooks'),
        desc: t('reading_records_page.allbooks_desc'),
        visible: () => configured() && allBooksOn(),
        render: (setting) => {
          folderPickerRow(setting, {
            app: this.app,
            focusKey: 'folder:recordsAllBooksBaseFolder',
            current: () => this.plugin.settings.recordsAllBooksBaseFolder,
            heightLock: this.plugin,
            onPick: (path) => {
              void (async () => {
                await this.setControlValue('recordsAllBooksBaseFolder', path);
                this.renderSettings(); // a folder that did not exist is not among the options — see `folderRow`
              })();
            },
          });
          setting.settingEl.addClass('orbis-setting-stacked');
        },
      },
      {
        type: 'group',
        heading: t('reading_records_page.kinds'),
        desc: t('reading_records_page.kinds_desc'),
        visible: configured,
        items: kinds.map(({ key, label }) => {
          // The last kind standing cannot be switched off — the rule the panel tabs and progress readouts use.
          // All three off is a state with no meaning: "write a reading record, but nothing counts as content for
          // it", which would leave the setting reading On while producing a folder, a cover and two bases and no
          // notes. The honest way to say that is Off.
          const locked = this.plugin.settings.recordKinds[key] && kindsOn() === 1;
          return {
            name: t(label),
            desc: locked ? t('reading_records_page.kinds_last') : undefined,
            control: { type: 'toggle' as const, key: `recordKinds.${key}`, disabled: locked },
          };
        }),
      },
    ];
  }

  /**
   * Switching records on for the first time asks where the notes go before any are written.
   *
   * The mode is NOT applied until that is answered: dismissing the dialog leaves records off, and the page
   * rebuilds either way — a dropdown left showing "On" over a setting that stayed off would be the same lie the
   * dialog exists to remove.
   */
  private chooseRecordsMode(mode: RecordsMode): void {
    if (mode !== 'off' && !this.plugin.settings.recordsSetupDone) {
      openRecordsDestinationDialog(this.app, {
        heightLock: this.plugin,
        initial: recordsDestinationOf(this.plugin.settings),
        onSave: (dest) => {
          void (async () => {
            applyRecordsDestination(this.plugin.settings, dest);
            this.plugin.settings.recordsMode = mode;
            await this.plugin.saveSettings();
            this.renderSettings();
          })();
        },
        onCancel: () => {
          new Notice(t('notices.records_dest_off'));
          this.renderSettings();
        },
      });
      return;
    }
    void (async () => {
      this.plugin.settings.recordsMode = mode;
      await this.plugin.saveSettings();
      this.renderSettings(); // the rows below appear once records are on
    })();
  }

  /**
   * Turning publishing on: a name and a folder, together, before this device writes anything.
   *
   * **Already answered goes straight through**, the way book sources do — a device that has been set up and switched
   * off is not asked again, because the answers are still true. Dismissing the dialog leaves the switch where it was,
   * which is what makes the toggle honest.
   */
  /**
   * Turning multi-device use on, which is the one place every question on this page is asked.
   *
   * **Off is immediate; on asks first.** A switch reading "on" over a device that has not been named, and has not
   * said what it shares, is the state the dialog exists to prevent — the same rule the library switch and the
   * records destination follow. Dismissing leaves it off, because closing a question is not an answer to it.
   *
   * Asked once. Coming back later flips it, because the answers are still on the page underneath and can be changed
   * there; being re-interrogated for switching something off and on again is how a setup dialog becomes a toll.
   */
  private chooseMultiDeviceOn(next: boolean, undo: () => void): void {
    // Which surface opened the setup dialog, and what was already on screen when it did — the switch and the
    // detected-vault offer both open it, and a duplicate is only diagnosable if the log says which.
    logToLibrary(
      this,
      `multi-device switch: next=${next} setUpAlready=${syncSetupDone()} dialogs=[${liveDialogTitles().join(', ')}]`,
      'sync'
    );
    if (!next || syncSetupDone()) {
      setMultiDeviceEnabled(next);
      this.renderSettings();
      return;
    }
    void runSyncSetup(this.plugin, {
      onSaved: () => this.renderSettings(),
      onCancel: () => {
        undo();
        this.renderSettings();
      },
    });
  }

  /**
   * The Devices page: what this device is, and what it does with the others that open this vault.
   *
   * **The sync switch leads.** It is what a reader arrives here for from the signpost, and the name and the id below
   * it are what the setup dialog asks about, so they read as *changing* an answer rather than as a form to fill in
   * before anything works.
   *
   * One flat list rather than headed groups: five rows about one device do not need dividing into topics.
   */
  private deviceItems(): SettingDefinitionItem[] {
    getOrCreateDeviceId(this.plugin.app);
    /**
     * **Everything below the switch is hidden when it is off**, the way the Library page does it: a device that is
     * not taking part has no use for a name it will never see quoted, an id it will never compare, or two questions
     * about what to share with devices it is ignoring.
     *
     * The switch governs as well as hides — see `multiDeviceEnabled`, which `syncEnabled` and `isolatedHere` both
     * consult — so turning it off stops the features rather than merely tidying them away.
     */
    const on = () => multiDeviceEnabled();
    return [
      {
        name: t('multi_device.enabled'),
        /**
         * A fragment, not a string — `SettingDefinitionItem.desc` takes either, and the caveat wants a line of
         * its own. Two sentences run together read as one description; on its own line and in italics the
         * second reads as the aside it is: what Orbis does not do, said where the reader is deciding.
         */
        desc: createFragment((frag) => {
          frag.appendText(t('multi_device.enabled_desc'));
          frag.createEl('br');
          // Bold AND italic: the one thing on this page a reader can be wrong about, and being wrong about it
          // looks like the plugin is broken rather than like a setting they have not made.
          frag.createEl('strong').createEl('em', { text: t('multi_device.sync_caveat') });
        }),
        render: (setting) => {
          setting.addToggle((tog) =>
            tog.setValue(multiDeviceEnabled()).onChange((next) =>
              this.chooseMultiDeviceOn(next, () => {
                tog.setValue(false);
              })
            )
          );
        },
      },
      /**
       * **Identity first, then what this device shares.** Who this device is comes before what it does with the
       * others: the name and the id are facts about this machine, and both toggles below are decisions about the
       * rest. The folder sits under the switch that owns it rather than three rows above it.
       */
      {
        name: t('devices_page.device_name'),
        desc: t('devices_page.device_name_desc'),
        visible: on,
        render: (setting) => {
          setting.addText((txt) => {
            txt.setValue((this.plugin.app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '');
            txt.setPlaceholder(t('devices_page.enter_device_name'));
            txt.onChange((v) => renameThisDevice(this.plugin, v));
          });
          // A field, not a toggle: it needs room to show what is in it — see `.orbis-text-line`.
          setting.controlEl.addClass('orbis-text-line');
          setting.settingEl.addClass('orbis-line-row');
        },
      },
      {
        name: t('devices_page.device_id'),
        desc: t('devices_page.device_id_desc'),
        visible: on,
        /**
         * **A read-only field, not a line of text.** Someone comparing two devices needs to copy this, and text in a
         * `<div>` is only copyable with a mouse — there is no way to reach it from the keyboard, which on a phone
         * means no way to reach it at all. An input can be tabbed to, and selects itself when it gets focus, so
         * copying it is Tab then Cmd+C. Read-only rather than disabled: a disabled field is not focusable either.
         */
        render: (setting) => {
          setting.addText((txt) => {
            txt.setValue((this.plugin.app.loadLocalStorage(LS_DEVICE_ID) as string | null) ?? '');
            txt.inputEl.readOnly = true;
            txt.inputEl.addClass('orbis-readonly-field');
            txt.inputEl.setAttribute('aria-label', t('devices_page.device_id'));
            txt.inputEl.addEventListener('focus', () => txt.inputEl.select());
          });
          setting.controlEl.addClass('orbis-text-line');
          setting.settingEl.addClass('orbis-line-row');
        },
      },
      {
        name: t('devices_page.share_toggle'),
        desc: t('devices_page.sharing_desc'),
        visible: on,
        // Stored inverted — the flag is "ignore the others" — so the toggle reads the negation. Kept that way
        // because the absence of the key has to mean "sharing on" for a device that has never been asked.
        render: (setting) => {
          setting.addToggle((tog) =>
            tog
              .setValue(this.plugin.app.loadLocalStorage(LS_IGNORE_OTHERS) !== 'true')
              .onChange((v) => this.plugin.app.saveLocalStorage(LS_IGNORE_OTHERS, String(!v)))
          );
        },
      },
      {
        name: t('devices_page.enabled'),
        desc: t('devices_page.enabled_desc'),
        visible: on,
        // A plain toggle: the multi-device switch above asks the setup questions once, and the folder it answers
        // is the row directly below this one.
        render: (setting) => {
          setting.addToggle((tog) =>
            tog.setValue(syncEnabled()).onChange((next) => {
              void (async () => {
                await this.plugin.setSyncEnabled(next);
                this.renderSettings(); // the folder row appears and disappears with it
              })();
            })
          );
        },
      },
      {
        name: t('devices_page.folder'),
        desc: t('devices_page.folder_desc'),
        // **Hidden until publishing is on**, the way everything under the Library's switch is: a folder for files
        // nothing is writing is a question with no consequence. Setup answers it the first time; this is where it is
        // changed afterwards.
        visible: () => syncEnabled(),
        render: (setting) => this.folderRow(setting, 'syncFolder', t('devices_page.folder_default')),
      },
      // **No closing note about where the data lives.** Prose in a row is a tab stop whatever we do to it — a stop
      // with nothing to operate, at the end of the page, so the last thing a keyboard reader met here would do
      // nothing. The Library page follows the same rule for the same shape of row (see `library_page.status`): the
      // vocabulary belongs in the guide, and this statement lives there.
    ];
  }
}
