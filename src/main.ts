import {
  addIcon,
  type EventRef,
  Notice,
  normalizePath,
  Platform,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
  WorkspaceLeaf,
} from 'obsidian';
import {
  type AnnotationPreset,
  type BookPreset,
  BUILTIN_PRESET_REVISION,
  installBuiltinPreset,
  migrateMarks,
  type PromotedPreset,
  type RemapChoice,
  seedBuiltinPreset,
} from './annotation-presets';
import { BookSourcesModal } from './BookSourcesModal';
import { trashBookData } from './book-data-trash';
import { BOOK_EXTENSIONS, isBookExtension } from './book-formats';
import { BookMoveMatcher } from './book-moves';
import { byName } from './by-name';
import { askToConfirm, confirmReplace, confirmThen } from './ConfirmModal';
import { catalogThisBook } from './catalog-this-book';
import { registerCommands } from './commands';
import { deviceSetting, migrateDeviceSettings, renameLegacyProgressModes } from './device-settings';
import { clearAllDeviceValues, getOrCreateDeviceId, initDeviceStore } from './device-store';
import { migrateDeviceStyle, readDeviceStyle, writeDeviceStyle } from './device-style';
import { openEpubExport, openFolderEpubExport, openSeparateEpubExport } from './EpubExportModal';
import { checkReplace, setReplaceMessage, setSavedNotice } from './epub-replace';
import { greetingFor, markSeenVersion, seenVersion } from './first-run';
import { removeFoliatePatches } from './foliate-patches';
import { initI18n, t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { LibraryView, openLibraryView, refreshLibraryViews, VIEW_TYPE_ORBIS_LIBRARY } from './LibraryView';
import { installLabelFocusRing } from './label-focus-ring';
import { coversFolderFor, refreshCover } from './library/cataloging';
import { rulesFromLegacyCollection } from './library/collection';
import { writeConvertedTitleNote } from './library/converted';
import {
  DEFAULT_DASHBOARD_ID,
  defaultDashboard,
  SYSTEM_COLLECTION_ID,
  SYSTEM_RECORD_COLLECTION_ID,
  systemCollection,
  systemRecordCollection,
} from './library/dashboard';
import { type DashboardPlace, settledOrder } from './library/dashboard-order';
import {
  migrateDashboardPlaces,
  readActiveDashboard,
  readDashboardOrder,
  writeActiveDashboard,
  writeDashboardOrder,
} from './library/dashboard-place';
import { isoToday } from './library/dates';
import { type FieldDefinition, setLibraryFields } from './library/fields';
import { titleNoteFor } from './library/title-note';
import type { TitleNoteKeepReason } from './library/title-note-cleanup';
import { removeTitleNoteFor } from './library/title-note-delete';
import { relinkTitleNotes } from './library/title-note-rename';
import {
  buildFolderEpub,
  buildNoteEpub,
  buildSeparateEpubs,
  type EpubConversion,
  type FolderConversion,
  folderNotes,
  frontmatterText,
  type SeparateConversion,
  writeBuiltEpub,
  writeSeparateEpubs,
} from './markdown-epub';
import {
  askedMultiDeviceThisSession,
  markAskedThisSession,
  markMultiDeviceAsked,
  multiDeviceAsked,
  multiDeviceEnabled,
  trashLocationFiles,
  vaultUsedElsewhere,
} from './multi-device';
import { OrbisDataView, VIEW_TYPE_ORBIS_DATA } from './OrbisDataView';
import { dialogIsOpen, untilNoDialog } from './OrbisModal';
import {
  baseOpenIntent,
  navigateWhenReady,
  OrbisReaderView,
  startListeningTo,
  VIEW_TYPE_ORBIS,
} from './OrbisReaderView';
import { OrbisSettings } from './OrbisSettings';
import { ensureDataFolderAt } from './orbis-io';
import { clearShareFolder, type OutsideTarget, outsideRoute, sendOutside } from './outside-vault';
import { openNoteBeside } from './panes';
import {
  bookAudioFolderPathFor,
  LS_DEVICE_NAME,
  progressFolderPath,
  progressFolderPathFor,
  readBookRecords,
} from './progress';
import { readNoteInOrbis } from './read-in-orbis';
import { logToLibrary } from './reader/DebugLog';
import { registerCopiedImagePaste } from './reader/image-copy';
import { Dictionaries } from './reader/lookup/DictionaryService';
import { watchBookFiles } from './reader/orbis-file-watch';
import { recordBookName, recordStem } from './reader/record-book-name';
import { moveRecordFiles, relinkRecords } from './reader/record-move';
import { allBooksBaseRoot, recordLocationReady, recordPaths } from './reader/record-paths';
import { migrateGenConfigEnable, seedGenConfigFromLegacy } from './reader/tts/gen-config';
import { isOrbisVoiceDownloaded, probeOrbisVoice } from './reader/tts/PiperEngine';
import { compilePronouncer, normalizePronunciationSay, type Pronouncer } from './reader/tts/pronunciations';
import { normalizeForSpeech } from './reader/tts/tts-blocks';
import { ORBIS_VOICES } from './reader/tts/voice-catalog';
import { onVoiceReadinessChanged, voiceReadinessChanged } from './reader/tts/voice-readiness';
import { settleThemeList } from './reader-themes';
import { BOOK_LOCATION, GLOBAL_LOCATION, resolveRecords } from './record-config';
import { removeRibbonAction } from './ribbon';
import { runSyncSetup } from './SyncSetupModal';
import {
  applyStyleToLocalStorage,
  BUILTIN_LOOKUP_DESTINATIONS,
  DEFAULT_LOOKUP_SECTIONS,
  DEFAULT_NOTE_STYLE_CONFIG,
  DEFAULT_PLUGIN_SETTINGS,
  type DebugCategory,
  DisplayStyle,
  generateStyleId,
  type LibraryCollection,
  type LibraryDashboard,
  type LookupWebDestination,
  NoteStyle,
  OrbisPluginSettings,
  readCurrentDisplaySettings,
  STORAGE_KEY_ACTIVE_STYLE,
  VoicePref,
} from './settings';
import { coerceSettingValue } from './settings-keys';
import { openSettingsPage } from './settings-nav';
import { keepBackup, readSettingsFile } from './settings-recovery';
import { settleSettingsShapes } from './settings-shapes';
import { migrateSidecarNames } from './sidecar-migration';
import { sidecarStem, sidecarSuffix } from './sidecar-names';
import { forgetCredential, mergeBookSources, withUniqueSourceIds } from './sources/sources';
import { nextVersion } from './sync/clock';
import { type DeviceInfo, dayOf, nameOf, rosterWithSelf } from './sync/devices';
import { setSyncEnabledHere, syncEnabled } from './sync/enabled';
import type { SyncBinding } from './sync/engine';
import { dedupeByWord, type GlossaryItem, legacyPronunciationId } from './sync/glossary';
import { SyncManager } from './sync/manager';
import { settleDefault } from './sync/settle';
import { applyShared, pickShared, SHARED_SETTINGS_ITEM, type SharedSettings } from './sync/shared-settings';
import { applyAdopted, recordsFor, stampType, type VersionMap } from './sync/stamp';
import { folderToJoin, publishedFolder, VaultSyncStore } from './sync/store';
import {
  findShippedNoteStyle,
  isSeededDefault,
  publishableNoteStyles,
  SEEDED_NOTE_STYLE_ID,
  withoutSpentScaffolding,
} from './sync/styles';
import { CONVERSION_ICON_ID, registerOrbisIcons } from './system-glyphs';
import { migrateTextAlign } from './text-align';
import { installTooltipGap } from './tooltip-gap';
import { liveDialogTitles } from './ui-utils';
import { migrateVoicePref, readVoicePref, writeVoicePref } from './voice-pref';

/** Canonical JSON (object keys sorted) so a mere key-order difference between two devices' writes
 *  isn't mistaken for a foreign edit. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v
  );
}

/**
 * Which top-level settings keys differ between two canonical copies, and how.
 *
 * For the log line behind the "settings changed on another device" prompt. **The names of the keys are enough** — a
 * dump of two settings objects is unreadable and would carry a reader's folder names and respellings into a log they
 * may paste somewhere. `libraryDashboards` tells you where to look; the values do not.
 */
/** Which top-level keys differ between two canonical copies. */
function differingKeys(mine: string, disk: string): string[] {
  const parse = (raw: string): Record<string, unknown> => {
    try {
      return (JSON.parse(raw) ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const a = parse(mine);
  const b = parse(disk);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .filter((key) => canonicalJson(a[key]) !== canonicalJson(b[key]));
}

function firstDifference(mine: string, disk: string): string {
  const changed = differingKeys(mine, disk);
  if (!changed.length) return 'no key differs (the two parse the same — a formatting difference only)';
  return `differing keys: ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ` and ${changed.length - 8} more` : ''}`;
}

/**
 * The field table's item id.
 *
 * A constant because the table is a singleton: there is one per vault, it has no id of its own, and the merge needs
 * something to key by. `table` rather than a random id so the file name says what it holds — see `syncFileName`.
 */
const FIELD_TABLE_ITEM = 'table';

/** Why a title note outlived its book, as the reader is told it. One string per reason, because "it has your
 *  edits" is a different fact from "another note links to it" and only one of them is ever true. */
const TITLE_NOTE_KEPT_MESSAGE: Record<TitleNoteKeepReason, TranslationKey> = {
  wrote: 'notices.title_note_kept_wrote',
  properties: 'notices.title_note_kept_properties',
  linked: 'notices.title_note_kept_linked',
  'other-files': 'notices.title_note_kept_other_files',
};

/**
 * A diagnostic value as text — for the debug panel, which holds strings.
 *
 * An `Error` first, because `JSON.stringify` renders one as `{}`: the message is the whole point of logging it.
 * A cycle or a DOM node falls back to `String()` rather than throwing inside the logger, since a logger that can
 * take down the thing it is logging is worse than a vague line.
 */
function safeJson(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** One conversion, with the source and the settings that belong to it. Discriminated rather than a
 *  `TFile | TFolder` source, because only the folder conversion carries a note list. */
type EpubJob =
  | { kind: 'note'; file: TFile; conv: EpubConversion; target?: OutsideTarget }
  | { kind: 'folder'; folder: TFolder; conv: FolderConversion; target?: OutsideTarget }
  | { kind: 'separate'; folder: TFolder; conv: SeparateConversion };

export default class OrbisReaderPlugin extends Plugin {
  settings: OrbisPluginSettings = { ...DEFAULT_PLUGIN_SETTINGS };
  /** A first-run dialog is waiting for the screen to clear — see `offerFirstRun`. */
  private firstRunWaiting = false;
  /** The welcome has been shown this session — see `offerFirstRun`. */
  private welcomed = false;
  /** Pairs a deleted book with the same book appearing elsewhere: a move made outside Obsidian. */
  private readonly bookMoves = new BookMoveMatcher(5000);
  /** The offline dictionaries for word look-up (each downloaded on demand; see the Look-up settings page). */
  dictionaries!: Dictionaries;
  /** Cached compile of settings.pronunciations. `undefined` = recompile on next use. */
  private pronouncerCache: Pronouncer | null | undefined = undefined;
  /** Canonical data.json as of our last read or write. Lets a save notice that another device wrote
   *  the file in the meantime — Obsidian's onExternalSettingsChange normally catches that first, but
   *  it can't if the change lands between the hook firing and our write. */
  private settingsOnDisk: string | null = null;
  /** Multi-device sync, when the reader has turned it on — see `docs/design/multi-device-sync.md`. */
  sync: SyncManager | null = null;
  /** Stale-write checks start only once onload is done: migrations legitimately save during load. */
  private settingsGuardArmed = false;
  /** Suppresses re-entrant checks while the prompt is open (saves can queue up behind it). */
  /** Serializes saves — the check is read-then-write, which two concurrent savers could interleave. */
  private saveQueue: Promise<void> = Promise.resolve();
  /**
   * Books whose reading-records prompt has already been shown this session, by path.
   *
   * Dismissing the prompt deliberately leaves the book *undecided*, so it can be asked again in a later
   * session — this is what keeps that from becoming nagging in the current one. On the plugin rather than the
   * view so closing and reopening a book does not re-ask, and not persisted, because a decision that outlives
   * the session is exactly what the `.orbis` payload is for.
   */
  readonly recordsAsked = new Set<string>();

  /** Ask what to convert, then convert it. The dialog owns every choice; this only supplies the defaults. */
  saveNoteAsEpub(file: TFile): void {
    openEpubExport(
      this.app,
      file,
      {
        keyLang: this.settings.frontmatterKeyLanguage,
        sameFolderAsNote: this.settings.epubSameFolderAsNote,
        folder: this.settings.epubFolder,
        fetchRemoteImages: deviceSetting('epubFetchRemoteImages'),
        defaultType: this.settings.epubDefaultType,
        // Only the single-note conversion takes this. The two folder ones default to one section per note for a
        // correctness reason rather than a taste one — see `folderDefaults`.
        splitLevel: this.settings.epubSplitLevel,
        libraryOn: this.settings.libraryEnabled,
      },
      (conv, target) => {
        void this.writeEpub({ kind: 'note', file, conv, target });
      },
      outsideRoute(this.app)
    );
  }

  /**
   * Convert this note and open it, asking nothing — *Read in Orbis Reader*.
   *
   * The counterpart to `saveNoteAsEpub` above and deliberately unlike it: that one exists to be configured, and
   * opens a dialog to do it; this one exists to get you reading, so every choice comes from settings. See
   * `read-in-orbis.ts` and docs/design/read-in-orbis-reader.md.
   */
  readNoteInOrbis(file: TFile): void {
    void readNoteInOrbis(file, {
      app: this.app,
      keyLang: this.settings.frontmatterKeyLanguage,
      fetchRemoteImages: deviceSetting('epubFetchRemoteImages'),
      // This feature's own Type, not *Save note as EPUB*'s: a book made from a note you are about to read says
      // `obsidian-note` in the library without being told each time — and when the setting is emptied, not `book`.
      defaultType: this.settings.readInOrbisType.trim() || DEFAULT_PLUGIN_SETTINGS.readInOrbisType,
      // Still shared, and deliberately: how a note's headings become chapters is a statement about how you write
      // notes, not about which command converted one.
      splitLevel: this.settings.epubSplitLevel,
      /**
       * **Per-device, where the Type beside it travels.** Read on the tablet, listen on the phone: that is two
       * devices being used for what they are good at, not a disagreement to reconcile. See
       * `sync/shared-settings.ts` for the rule and docs/design/read-in-orbis-reader.md for the case behind it.
       *
       * One switch decides which of the two sets applies, so there is no half-state to resolve here — following
       * hands over the base settings whole.
       */
      openWith: deviceSetting('readInOrbisOwnSettings')
        ? { mode: deviceSetting('readInOrbisMode'), bar: deviceSetting('readInOrbisBar') }
        : baseOpenIntent(),
      debug: (msg, extra) => this.debug(msg, extra, 'library'),
      writeTitleNote: (epubPath, conv, note) =>
        this.writeTitleNoteFor(epubPath, {
          title: conv.title,
          author: conv.author,
          language: conv.language,
          publisher: conv.publisher,
          publicationDate: conv.publicationDate,
          type: conv.type,
          sourceNotes: [note],
          source: 'markdown-note',
        }),
    });
  }

  /**
   * Build the EPUB, compare it with the one already at its path, and write it — asking first only when that could
   * cost something.
   *
   * **Built before asking**, because what decides the question is the new book itself (`compareEpubs`). A rebuild
   * identical to the book there is not written at all; one whose text is unchanged cannot move a saved position, so
   * it is written without a word. Only a changed text with annotations in it — whose saved positions may
   * now point at the wrong words — is worth stopping for. Replace or cancel — no versioning, because two EPUBs of the
   * same book means two sets of annotations and no way to tell which is current.
   */
  private async writeEpub(job: EpubJob): Promise<void> {
    if (job.kind === 'separate') {
      const set = await buildSeparateEpubs(this.app, job.folder, job.conv, Date.now());
      if (!set) return;
      const checks = await Promise.all(set.built.map(({ epub }) => checkReplace(this.app, epub)));
      // One summarized confirmation, not thirty-four. Asking per book would train you to click through it, which is
      // exactly when the one with your highlights in it goes.
      const message = setReplaceMessage(checks);
      if (message && !(await this.confirmReplace(message, t('epub_overwrite.title_set')))) return;
      const same = new Set(set.built.filter((_, i) => checks[i].change === 'identical').map(({ epub }) => epub.path));
      const result = await writeSeparateEpubs(this.app, job.conv, set, same);
      // One title note per book, one type for all of them — the dialog asked once, and a folder is one kind of
      // thing. The contents note is not among them: it is `orbis_generated`, and it is not a book. A book left alone
      // as already up to date still gets its record: the dialog's type may be new.
      for (const { path, note } of result.kept) {
        await this.writeTitleNoteFor(path, {
          title: note.basename,
          author: job.conv.author,
          language: job.conv.language,
          publisher: job.conv.publisher,
          publicationDate: job.conv.publicationDate,
          type: job.conv.type,
          sourceNotes: [note],
          // Each book of a split IS one note, so it says what a single conversion says.
          source: 'markdown-note',
        });
      }
      const toc = this.app.vault.getAbstractFileByPath(result.toc);
      new Notice(setSavedNotice(result.books, set.built.length, result.folder));
      // The contents note is the entry point to the set, so it is opened rather than merely mentioned.
      if (toc instanceof TFile) await this.app.workspace.getLeaf(true).openFile(toc);
      return;
    }
    // A discriminated job rather than a `TFile | TFolder` source: the folder conversion carries its own note list,
    // and narrowing a union of sources would leave the conversion's type to a cast.
    const result =
      job.kind === 'note'
        ? await buildNoteEpub(this.app, job.file, job.conv, Date.now())
        : await buildFolderEpub(this.app, job.folder, job.conv, Date.now());
    if (!result) return;
    const name = result.path.split('/').pop() ?? result.path;
    // Out of the vault: no replace check and no title note, which are both about a book in the vault.
    if (job.target) {
      const written = await sendOutside(this.app, job.target, name, result.bytes).catch((e: unknown) => {
        new Notice(t('notices.epub_write_failed', { error: String(e) }));
        return undefined;
      });
      if (written) new Notice(t('notices.epub_saved', { name: written }));
      return;
    }
    const check = await checkReplace(this.app, result);
    // Two reasons to ask, and they are not equally serious. Saved content in a changed text is the one that costs
    // something. A different file at the path is worth one confirmation too, though — the name and folder are typed
    // by hand, so it could be any book.
    if (check.change === 'text-changed') {
      const message = check.annotated ? t('epub_overwrite.source_changed') : t('epub_overwrite.body_plain');
      if (!(await this.confirmReplace(message))) return;
    }
    if (check.change !== 'identical' && !(await writeBuiltEpub(this.app, result))) return;
    // After the book, never before: a record pointing at a file that failed to package is a broken Read button,
    // and cataloging orders its own writes the same way.
    await this.writeTitleNoteFor(result.path, {
      title: job.conv.title,
      author: job.conv.author,
      language: job.conv.language,
      publisher: job.conv.publisher,
      publicationDate: job.conv.publicationDate,
      type: job.conv.type,
      sourceNotes:
        job.kind === 'note'
          ? [job.file]
          : job.conv.notes
              .map((path) => this.app.vault.getAbstractFileByPath(path))
              .filter((f): f is TFile => f instanceof TFile),
      source: job.kind === 'note' ? 'markdown-note' : 'markdown-folder',
    });
    // The dialog reports losses BEFORE converting, which is where they belong — except this one, which cannot be
    // predicted: a remote image is only known to be unavailable once it has been asked for. Without this the book
    // silently has fewer images than the dialog said it would.
    const failed = job.conv.fetchRemoteImages ? result.losses.images : 0;
    new Notice(
      check.change === 'identical'
        ? t('notices.epub_up_to_date', { name })
        : failed
          ? t(failed === 1 ? 'notices.epub_images_failed_one' : 'notices.epub_images_failed', {
              name,
              n: String(failed),
            })
          : t('notices.epub_saved', { name })
    );
  }

  /** Convert a folder of notes into one book. The dialog owns every choice; this only supplies the defaults. */
  private saveFolderAsEpub(folder: TFolder): void {
    openFolderEpubExport(
      this.app,
      folder,
      {
        keyLang: this.settings.frontmatterKeyLanguage,
        sameFolderAsNote: this.settings.epubSameFolderAsNote,
        folder: this.settings.epubFolder,
        fetchRemoteImages: deviceSetting('epubFetchRemoteImages'),
        defaultType: this.settings.epubDefaultType,
        libraryOn: this.settings.libraryEnabled,
      },
      (conv, target) => {
        void this.writeEpub({ kind: 'folder', folder, conv, target });
      },
      outsideRoute(this.app)
    );
  }

  /**
   * The title note for a book the converter just wrote.
   *
   * **Only when the library is on.** A record for a feature that is switched off is a note with no purpose; turn
   * the library on later and the book turns up in the catalog review like any other. The type starts from the
   * settings row, so converting thirty blog posts is not thirty pickings of "blog".
   */
  private async writeTitleNoteFor(
    epubPath: string,
    book: {
      title: string;
      author: string;
      language: string;
      publisher: string;
      publicationDate: string;
      type: string;
      sourceNotes: TFile[];
      source: 'markdown-note' | 'markdown-folder';
    }
  ): Promise<void> {
    // **Every exit here is silent, so each one says which it was.** A conversion that writes no title note reports
    // nothing, and there would be no way afterwards to tell which of the four exits it took — library off, book not
    // indexed yet, an existing record updated instead, or a throw. The trace makes the occurrence name itself.
    const trace = (msg: string, extra?: unknown): void => {
      this.debug(`title note: ${msg}`, extra);
    };
    trace('converter finished', {
      epubPath,
      libraryEnabled: this.settings.libraryEnabled,
      recordsFolder: this.settings.libraryRecordsFolder,
      type: book.type,
    });
    if (!this.settings.libraryEnabled) {
      trace('stopped — the library is off');
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(epubPath);
    if (!(file instanceof TFile)) {
      trace('stopped — the EPUB is not in the vault index yet', epubPath);
      return;
    }
    const sourceNotes = book.sourceNotes;
    const from = sourceNotes[0];
    const clipped = from ? frontmatterText(this.app.metadataCache.getFileCache(from)?.frontmatter?.source) : '';
    try {
      const written = await writeConvertedTitleNote(
        this.app,
        {
          file,
          title: book.title,
          author: book.author,
          language: book.language,
          publisher: book.publisher,
          publicationDate: book.publicationDate,
          type: book.type,
          sourceNotes,
          source: book.source,
          // The Web Clipper writes the page's URL into `source`, where ours means provenance. Written only when
          // creating, since the reader may have corrected it on the record since.
          sourceUrl: /^[a-z][a-z0-9+.-]*:/i.test(clipped) ? clipped : undefined,
        },
        { folder: this.settings.libraryRecordsFolder, added: isoToday() }
      );
      trace('wrote the title note', written);
      // The type the dialog was given is NOT written back to `epubDefaultType`: the settings row is what spares
      // thirty pickings of "blog", and a conversion that silently rewrites a settings row is a surprise. See
      // `epubDefaultType` in `settings.ts`.
      refreshLibraryViews(this);
    } catch (e) {
      // The book is written and fine; only its record failed. Said rather than swallowed, and not fatal.
      trace('threw', e);
      new Notice(t('notices.title_note_failed', { error: String(e) }));
    }
  }

  /** Replace or cancel. The shape lives in `OrbisModal`, because the PDF export asks the same question. */
  private confirmReplace(message: string, title = t('epub_overwrite.title')): Promise<boolean> {
    return confirmReplace(this.app, {
      title,
      message,
      replace: t('epub_overwrite.replace'),
      cancel: t('action.cancel'),
    });
  }

  /** Convert a folder into one book per note, plus a contents note that links to them. */
  private saveFolderAsSeparateEpubs(folder: TFolder): void {
    openSeparateEpubExport(
      this.app,
      folder,
      {
        keyLang: this.settings.frontmatterKeyLanguage,
        sameFolderAsNote: this.settings.epubSameFolderAsNote,
        folder: this.settings.epubFolder,
        fetchRemoteImages: deviceSetting('epubFetchRemoteImages'),
        defaultType: this.settings.epubDefaultType,
        libraryOn: this.settings.libraryEnabled,
      },
      (conv) => {
        void this.writeEpub({ kind: 'separate', folder, conv });
      }
    );
  }

  getActiveView(): OrbisReaderView | null {
    return this.app.workspace.getActiveViewOfType(OrbisReaderView);
  }

  lsGet(key: string, defaultValue: number): number {
    const v = this.app.loadLocalStorage(key) as string | null;
    if (!v) return defaultValue;
    const n = parseFloat(v);
    return isNaN(n) ? defaultValue : n;
  }

  lsSet(key: string, value: number) {
    this.app.saveLocalStorage(key, String(value));
    this.app.workspace.trigger('orbis:settings-change', key, String(value));
  }

  /**
   * Give a device with no note styles one to start from.
   *
   * **A fixed id, not a fresh one** — see `SEEDED_NOTE_STYLE_ID`. Two devices seeding this independently must produce
   * one item rather than two, and the seeded copy is deliberately not published until a reader edits it.
   */
  private initializeDefaultNoteStyle(): void {
    if (this.settings.noteStyles.length > 0) return;
    const style: NoteStyle = {
      id: SEEDED_NOTE_STYLE_ID,
      name: t('notes_styles_page.default_style_name'),
      isDefault: true,
      createdAt: Date.now(),
      isSystem: true,
      config: { ...DEFAULT_NOTE_STYLE_CONFIG },
    };
    this.settings.noteStyles.push(style);
    void this.saveSettings();
  }

  /**
   * Make sure the built-in preset exists — on EVERY load, not just first run.
   *
   * "Present in every install" has to be maintained rather than assumed, because a library that already
   * holds presets would otherwise never get one: seeding only-when-empty would leave a device whose settings
   * predate the built-in able to acquire it only by hand-editing `data.json`, which on Android and iOS is
   * not a thing a user can reasonably do. Since the built-in is read-only and undeletable, this is
   * idempotent and converges every device on the same shared identity by itself.
   *
   * Inserted FIRST so it heads the library's list, and it claims `isDefault` only when nothing else
   * does — a library with a default the user chose keeps it.
   */
  /** Convert any preset in the library written before the wash/line split. Cheap and idempotent: a mark
   *  already in the new shape passes through `migrateMark` unchanged. */
  /**
   * Mark the style Orbis ships, and give it its current name.
   *
   * **One bootstrap, then the flag is the truth.** A vault written before `isSystem` has no flag, so the style has to
   * be recognized once from what the vault happens to hold — and that differs by how old the vault is. A device seeding
   * one today gives it `SEEDED_NOTE_STYLE_ID`; a vault set up before that id existed carries a generated one and has
   * only its name; and a vault that already took the rename has the new name and no flag. All three are looked for
   * here, in that order of confidence, and none of them is consulted ever again.
   *
   * The rename rides along: "Default" is a name Orbis wrote and no reader would type — it says two things at once
   * beside a list that suffixes the chosen style with "(default)". A reader who renamed it is not found by any of
   * the three lookups, which is the point: renaming it is how you say it is yours.
   *
   * No revision mechanism, unlike Orbis marks. Where the style is scaffolding it is never published; where it is a
   * real synced item this travels as an ordinary edit, and every device computes the same answer.
   */
  private adoptShippedNoteStyle(): void {
    const name = t('notes_styles_page.default_style_name');
    const shipped = findShippedNoteStyle(this.settings.noteStyles ?? [], name);
    if (!shipped) return;
    shipped.name = name;
    shipped.isSystem = true;
    void this.saveSettings();
  }

  private migrateAnnotationPresets(): void {
    let changed = false;
    for (const p of this.settings.annotationPresets) {
      const next = migrateMarks(p.marks);
      if (next.length !== p.marks.length || JSON.stringify(next) !== JSON.stringify(p.marks)) changed = true;
      p.marks = next;
    }
    if (changed) void this.saveSettings();
  }

  /**
   * The shipped preset, seeded if this vault has never had it and REPLACED if it is older than this version's.
   *
   * **The replacement is what lets Orbis rename its own marks.** Seeding only when absent would leave a vault that
   * already had the preset with whatever contents it was first given, for ever — so a change to the shipped marks could
   * only be seen by factory-resetting a device, which is no answer at all for a vault synced across several. Replacing
   * in place is safe precisely because the preset is read-only: there is no user edit under that id to overwrite. See
   * `BUILTIN_PRESET_REVISION`.
   *
   * Its POSITION and its two usage flags survive: `isDefault` and `inactive` are the vault's decisions about the
   * preset, not part of what the preset is, and a re-seed that reset them would be Orbis quietly answering a
   * question the reader had already answered.
   *
   * From here the rest is existing machinery. The hash moves, so the next sync scan stamps and publishes it and
   * the other devices adopt it; the revision moves, so `mergeBookPreset` runs forward and
   * every book carrying tracked marks picks up the new names on its next open.
   */
  private ensureBuiltinPreset(): void {
    const seed = seedBuiltinPreset(
      // No cast: TS infers this template literal as the union of the five real keys, so a typo
      // in BUILTIN_MARK_KEYS or a missing string fails the build.
      (key) => t(`presets.builtin_mark_${key}`),
      t('presets.builtin_name'),
      Date.now()
    );
    if (!installBuiltinPreset(this.settings.annotationPresets, seed)) return;
    this.debug(`presets: shipped preset installed at revision ${BUILTIN_PRESET_REVISION}`, undefined, 'annot');
    void this.saveSettings();
  }

  /**
   * This device's Listen voice preference, or undefined if none saved yet.
   *
   * Held in vault-scoped device storage rather than in `data.json` — see `voice-pref.ts` for why an array keyed by
   * device id is not safe to sync.
   */
  getDeviceVoicePref(): VoicePref | undefined {
    return readVoicePref(getOrCreateDeviceId(this.app));
  }

  /** Upsert this device's Listen voice preference. Async for its callers' sake; the write itself is synchronous. */
  setDeviceVoicePref(patch: Partial<Omit<VoicePref, 'deviceId'>>): Promise<void> {
    const deviceId = getOrCreateDeviceId(this.app);
    const existing = readVoicePref(deviceId);
    writeVoicePref({ deviceId, source: 'orbis', ...existing, ...patch });
    voiceReadinessChanged(); // the choice is per device and outside settings — see `voiceReadinessChanged`
    return Promise.resolve();
  }

  /**
   * Vet each downloaded Orbis voice for the short-input duration blow-up that garbles chapter
   * headings: compare samples-per-phoneme on short headings to the voice's own prose baseline. A
   * healthy voice is ~1×; a broken one (e.g. Norman) is several ×. Logs a per-voice line to the
   * in-app debug log and a summary Notice.
   */
  async vetVoices(): Promise<void> {
    const adapter = this.app.vault.adapter;
    const dir = `${this.app.vault.configDir}/plugins/orbis-reader/piper-cache`;
    const rate = deviceSetting('ttsRate') || 1;
    const LONG = [
      'It was the best of times, it was the worst of times, it was the age of wisdom.',
      'He walked slowly down the long and winding road toward the distant house on the hill.',
    ];
    // Arrow, not a bare reference: normalizeForSpeech's second parameter would otherwise receive
    // map's index argument. No pronouncer here on purpose — these are fixed timing-calibration
    // samples, so a user respelling must not change what's measured.
    const SHORT = ['Chapter 1.', 'Chapter 5.', 'Prologue.', 'Part 2.', 'Contents.'].map((s) => normalizeForSpeech(s));
    const view = this.getActiveView();
    const log = (m: string) => view?.debug(m, 'tts');
    const flagged: string[] = [];
    let checked = 0;

    for (const v of ORBIS_VOICES) {
      if (!(await isOrbisVoiceDownloaded(adapter, dir, v.path))) continue;
      checked++;
      try {
        const probes = await probeOrbisVoice(adapter, dir, v.path, [...LONG, ...SHORT], rate);
        const spp = (p: { samples: number; phonemes: number }) => p.samples / Math.max(p.phonemes, 1);
        const longSpp = probes.slice(0, LONG.length).map(spp);
        const baseline = longSpp.reduce((a, b) => a + b, 0) / Math.max(longSpp.length, 1);
        let worst = 0;
        let worstText = '';
        for (const p of probes.slice(LONG.length)) {
          const ratio = spp(p) / (baseline || 1);
          if (ratio > worst) {
            worst = ratio;
            worstText = p.text;
          }
        }
        // Good voices measured ≤2.0×; confirmed-garbling voices ≥3.5×. 2.5× sits in that gap.
        const pass = worst < 2.5;
        if (!pass) flagged.push(v.name);
        log(
          `vet ${v.name}: baseline=${baseline.toFixed(0)}spp worst=${worst.toFixed(1)}x (${worstText}) ${pass ? 'PASS' : 'FAIL'}`
        );
      } catch (e) {
        flagged.push(`${v.name}?`);
        log(`vet ${v.name}: ERROR ${String(e)}`);
      }
    }

    // i18n-audit-disable-next-line -- throwaway curation notice
    const msg =
      checked === 0
        ? 'No downloaded voices to vet — download some in Settings → Listening first.'
        : `Vetted ${checked} voice(s). ${flagged.length ? `Flagged: ${flagged.join(', ')}` : 'All passed.'} See debug log for details.`;
    new Notice(msg, 8000);
  }

  /**
   * Every style this device can choose from: the ones the reader named, and this device's own.
   *
   * One place, so no call site filters `styles` by `deviceId` itself — the device style is not in that array at all.
   * See `device-style.ts`.
   */
  /**
   * Every display style this device can choose: its own first, then the named ones by name.
   *
   * **Its own first**, as the universal choices head the reader-theme list: it is the one every device has. The named
   * ones sorted rather than as stored, because each device appends what it makes and what sync brings — see
   * `by-name.ts`. Every list of styles comes through here: the Appearance dropdown and Switch display style.
   */
  stylesForThisDevice(): DisplayStyle[] {
    const own = readDeviceStyle(getOrCreateDeviceId(this.app));
    const named = byName(this.settings.styles);
    return own ? [own, ...named] : named;
  }

  /** This device's own style, made on first load from whatever the reader was already looking at. */
  deviceStyle(): DisplayStyle | undefined {
    return readDeviceStyle(getOrCreateDeviceId(this.app));
  }

  private initDeviceStyle(): void {
    const deviceId = getOrCreateDeviceId(this.app);
    // Out of `data.json` if it is still there, once — and dropped from the array in the same breath, since the array
    // is about to become the set of styles that travel.
    const carried = migrateDeviceStyle(this.settings.styles, deviceId);
    if (carried) {
      this.settings.styles = this.settings.styles.filter((s) => s.id !== carried.id);
      void this.saveSettings();
    }
    const existing = readDeviceStyle(deviceId);
    if (existing) {
      if (!this.app.loadLocalStorage(STORAGE_KEY_ACTIVE_STYLE)) {
        this.app.saveLocalStorage(STORAGE_KEY_ACTIVE_STYLE, existing.id);
      }
      return;
    }
    const style: DisplayStyle = {
      id: generateStyleId(),
      name: 'device-default',
      deviceId,
      settings: readCurrentDisplaySettings(this.app),
      createdAt: Date.now(),
    };
    writeDeviceStyle(style);
    if (!this.app.loadLocalStorage(STORAGE_KEY_ACTIVE_STYLE)) {
      this.app.saveLocalStorage(STORAGE_KEY_ACTIVE_STYLE, style.id);
    }
  }

  updateActiveStyle(): void {
    const activeId = this.app.loadLocalStorage(STORAGE_KEY_ACTIVE_STYLE) as string | null;
    if (!activeId) return;
    // The device's own style is not in `settings.styles`, and it is the one being edited most of the time —
    // every change to a font size lands on it. It saves to its own storage; a named style still saves with the rest.
    const own = this.deviceStyle();
    if (own && own.id === activeId) {
      writeDeviceStyle({ ...own, settings: readCurrentDisplaySettings(this.app) });
      return;
    }
    const style = this.settings.styles.find((p) => p.id === activeId);
    if (!style) return;
    style.settings = readCurrentDisplaySettings(this.app);
    void this.saveSettings();
  }

  switchToStyle(styleId: string): void {
    const style = this.stylesForThisDevice().find((p) => p.id === styleId);
    if (!style) return;
    this.app.saveLocalStorage(STORAGE_KEY_ACTIVE_STYLE, styleId);
    // Every open book applies it from the one announcement `applyStyleToLocalStorage` makes; a style holds display
    // values only, so nothing else a view reads from settings has moved.
    applyStyleToLocalStorage(this.app, style.settings);
    // Which style is selected is announced too, not only its values: Settings' Display style row names it, and from
    // the palette's Switch display style it would otherwise go on naming the last one.
    this.app.workspace.trigger('orbis:settings-change', STORAGE_KEY_ACTIVE_STYLE, styleId);
  }

  /**
   * One line into the dashboard's debug panel, for work that happens on the plugin rather than in a view.
   *
   * **The panel a reader can open, not a console they cannot.** `console.warn` is a desktop devtools window and
   * nothing whatsoever on a phone — where these bugs are usually found and always hardest to describe. Anything
   * worth diagnosing goes here.
   *
   * `extra` is serialized rather than passed through: the panel holds strings, and a diagnostic that reads
   * `[object Object]` says nothing.
   */
  /** Every list in the settings within its shape (`settleSettingsShapes`), saying in the debug log what went. */
  private settleShapes(from: string): void {
    const changed = settleSettingsShapes(this.settings);
    if (changed.length) this.debug(`${from}: entries of the wrong shape left out`, changed);
  }

  debug(msg: string, extra?: unknown, category: DebugCategory = 'library'): void {
    const detail = extra === undefined ? '' : ` ${typeof extra === 'string' ? extra : safeJson(extra)}`;
    logToLibrary(this, `${msg}${detail}`, category);
  }

  /**
   * Put multi-device sync together, and look once.
   *
   * **Built whether or not the switch is on.** The manager asks `enabled()` on every scan, so an off switch costs a
   * function call and nothing else — no folder, no files, no listeners doing work. Building it only when the switch
   * is on would mean turning the switch on had to build it too, which is the kind of second path that goes stale.
   *
   * The first scan waits for the workspace: `vault.adapter.list` answers before the index is warm, but on a phone
   * everything else at load is competing for the same few seconds, and nothing on screen is waiting for this.
   */
  private startSync(): void {
    this.sync = new SyncManager({
      app: this.app,
      store: new VaultSyncStore(this.app, () => this.settings.syncFolder ?? ''),
      deviceId: () => getOrCreateDeviceId(this.app),
      deviceName: (id) => this.deviceName(id),
      enabled: () => syncEnabled(),
      debug: (message, data) => this.debug(message, data, 'sync'),
    });
    // **In this order, and the order matters.** A collection's rules are read through the field table, and a widget
    // names a collection: adopting them the other way round paints widgets pointing at collections this device has
    // not read yet, and matches conditions against keys it does not yet know the spelling of.
    // First of all, because everything else is written where these say — a folder adopted after the type that uses
    // it would mean one scan's worth of writes landing in the old place.
    this.sync.register(this.sharedSettingsBinding());
    this.sync.register(this.fieldsBinding());
    this.sync.register(this.glossaryBinding());
    this.sync.register(this.displayStyleBinding());
    this.sync.register(this.noteStyleBinding());
    this.sync.register(this.collectionBinding());
    this.sync.register(this.dashboardBinding());
    this.sync.register(this.presetBinding());
    // Last: nothing else waits on it, and it is the one type that says something about the OTHER records rather than
    // carrying any of the reader's work.
    this.sync.register(this.devicesBinding());
    this.sync.watch(
      (unregister) => this.register(unregister),
      (ref) => this.registerEvent(ref as EventRef)
    );
    this.app.workspace.onLayoutReady(() => void this.sync?.scan('load'));
  }

  /**
   * The dashboards, as multi-device sync sees them.
   *
   * **The provided dashboard is not published.** It is rebuilt from code on every load, so a copy of it traveling
   * between devices would be a copy of something both devices already have — and one built by an older version at
   * that. What a reader does with it, which is where it sits and whether it is on, is arrangement and stays here.
   *
   * See docs/design/multi-device-sync.md.
   */
  /**
   * A binding over a list of things `data.json` holds, for any type whose items have an id.
   *
   * One helper rather than one per type, because the differences between dashboards, collections and the field table
   * are two lines each — what this device would publish, and where an adopted list goes — and everything else is the
   * same three steps in the same order. Written out three times, the fourth type is where one of them gets forgotten.
   *
   * **`refresh` is where a local edit becomes a version.** Nothing tells us an item changed: a dashboard is edited
   * from the settings page, the widget editor, a drag, a rename that saves per keystroke, and a version bump at each
   * of those is a list that would be wrong within a week and wrong quietly. `stampType` derives it from the payload —
   * see `sync/stamp.ts`.
   */
  private itemsBinding<T extends { id: string }>(
    type: string,
    mine: () => T[],
    /** `items` is everything this device now holds; `arrived` is only what this scan adopted. */
    take: (items: T[], arrived: T[]) => void,
    /**
     * Put what this device holds back within its own rules, before anything is compared.
     *
     * For the two types that have a rule the merge cannot know about: one entry per word, one style holding the
     * default. **Run on every scan, not only after adopting** — the state it fixes can already be sitting in
     * `data.json` from a merge that happened before the rule existed, and a device with nothing left to adopt would
     * never look at it otherwise. Changes are noticed by the stamping below, which is what makes them travel.
     */
    settle?: () => void
  ): SyncBinding<T> {
    const versions = (): VersionMap | undefined => this.settings.syncVersions?.[type];
    return {
      type,
      refresh: async () => {
        settle?.();
        const stamped = stampType(mine(), versions(), {
          deviceId: getOrCreateDeviceId(this.app),
          // `Date.now()` per version rather than once per pass: the clock decides what to do with it, and giving it a
          // stale reading would hand two edits made a second apart the same time for no reason.
          version: () => nextVersion(Date.now()),
        });
        if (stamped.changed.length === 0) return;
        this.setVersions(type, stamped.versions);
        this.debug(`stamped ${type} changed here`, stamped.changed, 'sync');
        await this.saveSettings();
      },
      held: () => recordsFor(type, mine(), versions()),
      adopt: async (records) => {
        const taken = applyAdopted(records, mine(), versions());
        this.setVersions(type, taken.versions);
        take(
          taken.items,
          records.map((record) => record.item).filter((item): item is T => item !== undefined)
        );
        this.settleShapes(`${type} from another device`);
        // Again here, so a rule breached by what just arrived is fixed now rather than on the next scan — the reader
        // is looking at this list, and "settles a moment later" is a moment of showing them something wrong.
        settle?.();
        await this.saveSettings();
        refreshLibraryViews(this);
      },
    };
  }

  /**
   * Dashboards.
   *
   * **The provided dashboard is not published.** It is rebuilt from code on every load, so a copy traveling between
   * devices would be a copy of something both devices already have — and one built by an older version at that. What
   * a reader does with it, which is where it sits and whether it is on, is arrangement and stays here.
   */
  private dashboardBinding(): SyncBinding<LibraryDashboard> {
    return this.itemsBinding(
      'dashboards',
      () => this.myDashboards(),
      (items) => {
        const system = (this.settings.libraryDashboards ?? []).filter((dashboard) => dashboard.system);
        this.settings.libraryDashboards = [...system, ...items];
        this.ensureSystemLibrary();
        this.settleDashboardOrder();
      }
    );
  }

  /** The dashboards this device would publish — everything but the provided one. */
  private myDashboards(): LibraryDashboard[] {
    return (this.settings.libraryDashboards ?? []).filter((dashboard) => !dashboard.system);
  }

  /**
   * Collections.
   *
   * The provided pair is excluded for the reason the provided dashboard is: they are rebuilt from code each load, so
   * publishing them would put one version's idea of them into another version's vault.
   */
  private collectionBinding(): SyncBinding<LibraryCollection> {
    return this.itemsBinding(
      'collections',
      () => this.myCollections(),
      (items) => {
        const system = (this.settings.libraryCollections ?? []).filter((collection) => collection.system);
        this.settings.libraryCollections = [...system, ...items];
        this.ensureSystemLibrary();
      }
    );
  }

  /** The collections this device would publish — everything but the provided ones. */
  private myCollections(): LibraryCollection[] {
    return (this.settings.libraryCollections ?? []).filter((collection) => !collection.system);
  }

  /**
   * Devices — **one record per device, written by that device about itself.**
   *
   * The only type whose item IS its author, which makes it single-writer by construction. Its job is to let the merge
   * speak in names: everything else here identifies a device by id, and a reader does not. See `sync/devices.ts`,
   * including why `lastSeen` is a date rather than a timestamp — the difference between one write per device per day
   * and one per device per scan, forever.
   */
  private devicesBinding(): SyncBinding<DeviceInfo> {
    return this.itemsBinding(
      'devices',
      () => this.settings.syncDevices ?? [],
      (items) => {
        this.settings.syncDevices = items;
      },
      () => {
        this.settings.syncDevices = rosterWithSelf(this.settings.syncDevices ?? [], {
          id: getOrCreateDeviceId(this.app),
          name: ((this.app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '').trim(),
          lastSeen: dayOf(Date.now()),
        });
      }
    );
  }

  /** What another device is called, for anything that has only an id to go on. */
  deviceName(id: string): string {
    return nameOf(this.settings.syncDevices ?? [], id);
  }

  /**
   * Publish and take up changes shortly — for a change that does not go through `saveSettings`.
   *
   * **Almost everything sync cares about is in `data.json`, and that funnel asks for a scan by itself.** The device
   * NAME is the exception: it lives beside the device, so renaming it saves no settings and schedules no scan, and
   * without this the device's own record in the roster would carry its old name until something else triggered one —
   * which looks exactly like the rename not working.
   */
  syncSoon(reason: string): void {
    this.sync?.scanSoon(reason);
  }

  /**
   * Display styles — the named ones.
   *
   * **This device's own style is not among them.** It lives beside the device (`device-style.ts`), because a style is
   * about a screen: syncing it is how a phone ends up reading with a desktop's font size. A `deviceId` here is a
   * style written by an older version, and it is filtered out rather than published.
   */
  private displayStyleBinding(): SyncBinding<DisplayStyle> {
    return this.itemsBinding(
      'styles',
      () => (this.settings.styles ?? []).filter((style) => !style.deviceId),
      (items, arrived) => {
        const mine = (this.settings.styles ?? []).filter((style) => style.deviceId);
        this.settings.styles = [...items, ...mine];
        this.applyAdoptedActiveStyle(arrived);
      }
    );
  }

  /**
   * Put an adopted style on screen, when it is the one this device is using.
   *
   * **An adopted style that is not applied is an edit waiting to be undone.** A display style is a saved copy of the
   * live display settings, which live beside the device; adoption changes the copy and leaves the device reading with
   * the old values. Three things then go wrong at once: the reading view does not change, the settings page shows the
   * live values rather than the style's, and the next touch of any display control writes the stale live values back
   * into the style — overwriting what the other device sent.
   *
   * Only when the adopted style is the ACTIVE one: adopting a style a reader is not using must not move their screen.
   */
  private applyAdoptedActiveStyle(adopted: readonly DisplayStyle[]): void {
    const activeId = this.app.loadLocalStorage(STORAGE_KEY_ACTIVE_STYLE) as string | null;
    const arrived = activeId ? adopted.find((style) => style.id === activeId) : undefined;
    if (!arrived) return;
    applyStyleToLocalStorage(this.app, arrived.settings);
    this.debug(`applied the adopted style "${arrived.name}", which this device is using`, undefined, 'sync');
    this.refreshViews();
  }

  /**
   * Note export styles.
   *
   * The seeded default is scaffolding until a reader touches it — see `sync/styles.ts` for why publishing it would
   * let a device installed today overwrite the default everyone else has been using.
   */
  private noteStyleBinding(): SyncBinding<NoteStyle> {
    const seededName = (): string => t('notes_styles_page.default_style_name');
    return this.itemsBinding(
      'note-styles',
      () => publishableNoteStyles(this.settings.noteStyles ?? [], seededName()),
      (items) => {
        const held = this.settings.noteStyles ?? [];
        const scaffolding = held.filter((style) => isSeededDefault(style, seededName()));
        this.settings.noteStyles = [...items, ...scaffolding];
      },
      () => {
        const held = this.settings.noteStyles ?? [];
        const kept = withoutSpentScaffolding(held, seededName());
        // Two lists merged can hold two styles claiming to be the default — see `settleDefault`.
        this.settings.noteStyles = settleDefault(kept, this.settings.syncVersions?.['note-styles']);
      }
    );
  }

  /**
   * Annotation presets — **the marks you annotate with, which is vocabulary rather than chrome.**
   *
   * A library of marks is something a reader builds once and wants everywhere: the same argument that makes a
   * dashboard travel. A preset also rides along inside a book that uses it — see docs/design/annotation-presets.md
   * §Presets travel.
   *
   * **The built-in publishes like everything else.** Excluding it looks obviously right — every vault seeds a
   * byte-identical copy, so sending one would be telling a device what it already has. But `isDefault` is on the
   * preset, and *which preset is the default* is exactly the part another device does not know. Left unpublished it
   * would produce the silent divergence this whole design exists to stop: a device that seeds the built-in has a
   * default with no version, `settleDefault` reads "no version" as "made here just now" and lets it beat an adopted
   * real default — and making the built-in the default again on one device could never reach the others at all,
   * since the item carrying that fact would never travel.
   *
   * Publishing it is safe precisely because it is read-only: two devices' copies differ in nothing but the flag, so
   * adopting one can change nothing else. (Its name comes from `t()`, so a differently-localized device would
   * publish a different name — one vault settling on one name, which is the right answer anyway.)
   *
   * **A book's own copy is untouched by any of this.** It stays the truth for what that book renders, which is what
   * keeps a deleted preset from breaking a book and lets a book shared from another vault carry its own meaning.
   * What arrives here is the template those copies track, and an open book catches up on the next merge.
   */
  private presetBinding(): SyncBinding<AnnotationPreset> {
    return this.itemsBinding(
      'presets',
      () => this.settings.annotationPresets,
      (items, arrived) => {
        this.settings.annotationPresets = items;
        this.remergeOpenBooks(arrived);
      },
      () => {
        // Two lists merged can hold two presets claiming to be the default — see `settleDefault`.
        this.settings.annotationPresets = settleDefault(
          this.settings.annotationPresets,
          this.settings.syncVersions?.presets
        );
      }
    );
  }

  /**
   * Catch an open book up with a preset that just arrived from another device.
   *
   * **Because a template can change while a book is being read.** Opening the book is not trigger enough once
   * presets arrive from other devices: without this, a preset arriving mid-read would leave the book rendering the
   * old marks until it was closed and reopened.
   *
   * Only the presets this scan actually adopted, so a scan that changed nothing does no work. `mergeWithTemplate`
   * is a no-op unless the template genuinely moved forward, which makes a wrong guess here cost nothing.
   */
  private remergeOpenBooks(arrived: readonly AnnotationPreset[]): void {
    if (arrived.length === 0) return;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS)) {
      const view = leaf.view;
      if (!(view instanceof OrbisReaderView)) continue;
      const template = arrived.find((preset) => preset.id === view.annotationPresetId);
      if (template) void view.mergeAnnotationPreset(template);
    }
  }

  /**
   * The settings that describe the vault — **one item, merged whole.**
   *
   * The destinations and the flags that say a destination has already been asked about. See
   * `sync/shared-settings.ts` for the list, for why it is named rather than derived, and for the three kinds of
   * setting deliberately left out of it.
   */
  private sharedSettingsBinding(): SyncBinding<SharedSettings & { id: string }> {
    return this.itemsBinding(
      'settings',
      () => [{ id: SHARED_SETTINGS_ITEM, ...pickShared(this.settings) }],
      (items) => {
        const arrived = items.find((item) => item.id === SHARED_SETTINGS_ITEM);
        if (!arrived) return;
        // Read BEFORE the apply, which replaces the list: what a merge removed can only be seen against what this
        // device held a moment ago.
        const heldSources = (this.settings.bookSources ?? []).map((source) => source.id);
        const changed = applyShared(this.settings, arrived);
        if (changed.length === 0) return;
        this.settleShapes('settings from another device');
        this.debug('took settings from another device', changed, 'sync');
        // **Each of these reaches outside `data.json`, so each has to be told.** A destination that moved with nobody
        // told is a device writing where the reader no longer expects; the Library's switch owns a ribbon icon and a
        // command that a plain save does not touch.
        if (changed.includes('libraryEnabled')) this.applyLibraryEnabled();
        if (changed.includes('bookSources')) this.forgetDepartedCredentials(heldSources);
        this.refreshViews();
        refreshLibraryViews(this);
      }
    );
  }

  /**
   * Forget the credentials of sources this scan removed.
   *
   * **A delete travels; the credential it took with it did not.** The catalog list is on the shared whitelist, so
   * deleting a source on one device removes it everywhere — but `forgetCredential` runs only on the device where the
   * reader pressed Delete. Without this, every other device would keep an `orbis-book-source-<id>-username`/`-password`
   * pair named after a source that no longer exists: unreachable, unmatchable to anything, and exactly the litter
   * that function exists to prevent.
   *
   * **Only what this merge actually removed.** The alternative — sweeping the Keychain for entries with no matching
   * source — would catch more (a hand-edited `data.json`, a crash mid-delete) and would destroy every stored password
   * the first time a list arrived briefly empty. This can only act on a removal it just witnessed.
   *
   * `forgetCredential` is a no-op for a source nobody signed into, so a device that never authenticated does nothing
   * here.
   */
  private forgetDepartedCredentials(heldIds: readonly string[]): void {
    const kept = new Set((this.settings.bookSources ?? []).map((source) => source.id));
    for (const id of heldIds) {
      if (kept.has(id)) continue;
      const forgotten = forgetCredential(this.app, { id });
      if (forgotten.length > 0) this.debug(`forgot the credential of a source deleted elsewhere — ${id}`, 'sync');
    }
  }

  /**
   * The pronunciation glossary — **one item per entry**, not one item holding the lot.
   *
   * An entry is small, it is created one at a time as a book mispronounces something, and two devices adding
   * different words between syncs is the ordinary case rather than a rarity. Per entry, both survive; packaged as
   * one item, the newer copy of the whole glossary would win and the other device's word would go with it.
   *
   * The cost is file count — entries × devices — which is why it goes with a rule the other types do not need: a
   * word may appear once, and after any merge the later entry for a word wins and the rest are tombstoned. See
   * `sync/glossary.ts` for why that cannot be left to the reader to tidy.
   */
  private glossaryBinding(): SyncBinding<GlossaryItem> {
    return this.itemsBinding(
      'glossary',
      () => this.myGlossary(),
      (items) => {
        this.settings.pronunciations = items;
        // Sentences already synthesized carry the old respelling until the engine is dropped, so a glossary that
        // arrives mid-chapter has to reach the open readers, not only `data.json`.
        this.pronouncerCache = undefined;
        this.refreshViews();
      },
      () => {
        const { entries, dropped } = dedupeByWord(this.myGlossary(), this.settings.syncVersions?.glossary);
        if (!dropped.length) return;
        this.settings.pronunciations = entries;
        // The losers are tombstoned rather than dropped quietly: a delete that is not published is a delete the
        // other device puts back. `stampType` does the tombstoning from the items being gone.
        this.debug('one entry per word — dropped', dropped, 'sync');
        this.pronouncerCache = undefined;
      }
    );
  }

  /** The glossary as sync sees it: every entry has an id by now — see `loadSettings`. */
  private myGlossary(): GlossaryItem[] {
    return (this.settings.pronunciations ?? [])
      .filter((entry): entry is GlossaryItem => typeof entry.id === 'string' && !!entry.id)
      .map((entry) => ({ ...entry }));
  }

  /**
   * The field table — **one item, not one per field.**
   *
   * The table is edited as a whole and read as a whole: a field's aliases and its value order are only meaningful
   * beside the rest of it, and nobody edits two fields on two devices in the same minute. It is also the smallest
   * thing that can be wrong on its own — a device with half a table parses records differently — so it travels
   * whole or not at all. See docs/design/multi-device-sync.md §Granularity follows the count.
   *
   * Wrapped in an item with an id because that is what the machinery is shaped for; the id is a constant, and the
   * table cannot be deleted, only emptied, so no tombstone is ever stamped for it.
   */
  private fieldsBinding(): SyncBinding<{ id: string; fields: FieldDefinition[] }> {
    return this.itemsBinding(
      'fields',
      () => [{ id: FIELD_TABLE_ITEM, fields: this.settings.libraryFields ?? [] }],
      (items) => {
        const table = items.find((item) => item.id === FIELD_TABLE_ITEM);
        if (!table) return; // nothing published a table; ours stands
        this.settings.libraryFields = table.fields ?? [];
        // Into the parser as well as into settings — `saveSettings` does this too, but a reader whose records are
        // on screen when a table arrives should not have to wait for the save to land.
        setLibraryFields(this.settings.libraryFields);
      }
    );
  }

  /** One type's versions, into settings. */
  private setVersions(type: string, versions: VersionMap): void {
    this.settings.syncVersions = { ...(this.settings.syncVersions ?? {}), [type]: versions };
  }

  /**
   * Start publishing, or stop.
   *
   * **Turning it off leaves the files alone.** Deleting another device's copy of a dashboard on the way out is the
   * one thing an off switch must not do — see docs/design/multi-device-sync.md §Turning it on.
   *
   * The switch itself is per device (`sync/enabled.ts`), so this saves settings only when there is something in
   * settings to save: the folder setup answered, or the one this device joins — see `folderToJoin`.
   */
  async setSyncEnabled(on: boolean, answered?: string): Promise<void> {
    setSyncEnabledHere(on);
    const folder = on ? folderToJoin(answered, this.settings.syncFolder, publishedFolder(this.app)) : answered;
    if (folder !== undefined && folder !== (this.settings.syncFolder ?? '')) {
      this.settings.syncFolder = folder;
      await this.saveSettings();
    }
    this.debug(`turned ${on ? 'on' : 'off'}`, undefined, 'sync');
    if (on) await this.sync?.scan('the reader turned it on');
  }

  /**
   * Ask before the factory reset, and say what it costs in the units the answer is paid in.
   *
   * Not "are you sure": the reader of this dialog is testing a first run, and what they need to weigh is the
   * downloads to fetch again — the dictionaries, the PDF fonts and any voice — and the answers they will be asked for
   * again. The line about what survives is there
   * because it is the question anyone reading the word "factory" asks next.
   */
  confirmFactoryReset(): void {
    confirmThen(
      this.app,
      {
        title: t('factory_reset.title'),
        message: [
          t('factory_reset.settings'),
          t('factory_reset.downloads'),
          /**
           * **Named on its own line, because losing it does not look like losing a setting.**
           *
           * Field mappings are what let the library read frontmatter keys it does not ship — `epub_link` for
           * `files`, `calibre_id` for `source_id`. Reset them and every title note still parses but none of them
           * carries a file, so a cataloged vault reports hundreds of books "missing from your library". Nothing
           * was lost and nothing has to be re-cataloged, but a reader who was not told will believe otherwise,
           * and may well start fixing it.
           */
          t('factory_reset.properties'),
          // The one thing here that reaches into the vault, so it is named on its own line rather than tucked into
          // the list of what survives.
          t('factory_reset.locations'),
          t('factory_reset.kept'),
          t('factory_reset.reload'),
        ],
        confirmText: t('factory_reset.confirm'),
      },
      () => void this.factoryReset()
    );
  }

  /**
   * Put the plugin back to a new install: caches, reading positions, `data.json`, then this device's own storage.
   *
   * **In that order, and the order matters.** The caches are found through paths built from settings, so they have
   * to go before the settings do. Device storage goes LAST because everything above it reads from it — the device
   * id names the piper cache's neighbors, and clearing it first would leave a reset that could not find what it
   * was resetting.
   */
  private async factoryReset(): Promise<void> {
    const adapter = this.app.vault.adapter;
    const dir = `${this.app.vault.configDir}/plugins/orbis-reader`;
    for (const cache of [`${dir}/piper-cache`, `${dir}/font-cache`, `${dir}/dictionary`]) {
      // Each on its own: a cache that was never downloaded is not an error, and one that fails to delete must not
      // stop the two beside it.
      try {
        if (await adapter.exists(cache)) await adapter.rmdir(cache, true);
      } catch {
        /* nothing to do — the next launch will simply find it still there */
      }
    }
    /**
     * **The reading positions go too, and they are the only vault files this touches.**
     *
     * They are the evidence `vaultUsedElsewhere` reads, so leaving them behind would produce a vault fresh in
     * every respect except the one being tested — a device told it is brand new, and then offered the
     * multi-device setup on its first book because its own pre-reset position files carry a stranger's id.
     * Trashed, not deleted: a reading position is real work.
     */
    const positions = await trashLocationFiles(this.app);
    /**
     * **`data.json` is DELETED, not written back to its defaults**, and that distinction is the whole command.
     *
     * A file full of defaults is not what a new install looks like: a new install has no file, and every value
     * written here would be pinned at today's default rather than following the code's.
     *
     * In memory, not saved: `this.settings` goes back to the defaults so nothing running in the moment before the
     * reload reads the old values, and no save follows to recreate the file.
     */
    this.settings = { ...DEFAULT_PLUGIN_SETTINGS };
    try {
      const data = `${dir}/data.json`;
      if (await adapter.exists(data)) await adapter.remove(data);
    } catch {
      /* nothing to do — the reload will simply find the old settings */
    }
    // The seen-version flag goes with it — `forgetSeenVersion` is for the narrower reset. **Counted, and the count
    // is reported**: a reset that clears nothing shows only as a "fresh" vault that still has a recording server
    // switched on, so a reset that can do nothing has to say so.
    // The message goes to the debug log AND the notice: the log is the one that survives long enough to be pasted
    // into a bug report, and the notice is the one anybody actually sees.
    let detail = '';
    const forgotten = clearAllDeviceValues((msg) => {
      detail = msg;
      // `tts`, not `library`: almost everything the device store holds is recording and listening config, which is
      // where anyone chasing one of these values would look. (There is a `settings` category too, if this ever
      // grows to report on more than the store.)
      this.debug(msg, undefined, 'tts');
    });
    const done = t('factory_reset.done', { positions: String(positions), forgotten: String(forgotten), detail });
    new Notice(done, 12000);
    // A moment, so the notice is read rather than inferred from the screen going away.
    window.setTimeout(() => {
      const commands = (this.app as unknown as { commands?: { executeCommandById(id: string): boolean } }).commands;
      // `app:reload` is Obsidian's own command and not in the public typings — hence the cast, and hence the
      // fallback: if it is ever renamed, the reset still happened and the reader is told what is left to do.
      if (!commands?.executeCommandById('app:reload')) {
        new Notice(t('factory_reset.done_no_reload'), 8000);
      }
    }, 1200);
  }

  /**
   * The one unprompted dialog a book open is allowed to raise, and which one it is.
   *
   * **Whichever is owed, one at a time.** Two dialogs want this moment — the welcome, and the offer to join a vault
   * already used elsewhere — and stacking them is two dismissals for what reads as one interruption. The welcome
   * goes first because it is about the plugin rather than about this vault; the offer takes the next book open,
   * which costs it nothing (it is remembered until answered) and means neither is ever skipped. See `first-run.ts`.
   *
   * **Not over another dialog.** A book open also raises the device-locations and reading-records prompts, and both
   * wait for a clear screen; so does this, and one wait at a time — two views call it on every open, and a second
   * wait would show the offer the moment the welcome closed. A wait that gives up decides nothing: both are asked
   * again at the next book open.
   */
  async offerFirstRun(): Promise<void> {
    if (this.firstRunWaiting) return;
    this.firstRunWaiting = true;
    // Waiting behind the welcome itself — shown at load, with a book restored — counts as this open's one dialog.
    const behindWelcome = this.welcomed && dialogIsOpen();
    const clear = await untilNoDialog();
    this.firstRunWaiting = false;
    if (!clear || behindWelcome || this.offerWelcome()) return;
    await this.offerMultiDeviceSetup();
  }

  /**
   * Say hello, or say what changed — whichever this device is owed. Returns whether anything was said.
   *
   * **Called when the plugin loads, not when a book opens.** At a book open the reader's intent is explicit and
   * specific, and any dialog interrupts the one thing they came to do. At load — which on an install is the moment
   * they press Enable — their attention is already on Orbis, and they have no book yet, which is what makes the
   * first item on the Setup page (where to get one) worth reading. Still called from the book-open path too, as a
   * fallback for the cases load misses: a plugin arriving inside a synced `.obsidian` folder and never being
   * "enabled" here, or a greeting that failed to draw.
   */
  private offerWelcome(): boolean {
    const current = this.manifest.version;
    // No notes exist yet, and the flag that will carry them is what this stores. See docs/design/first-run.md —
    // release notes come later, deliberately: with no earlier release there is nothing to write.
    const greeting = greetingFor({ seen: seenVersion(), current, hasNotes: false });
    // Stamped whatever was decided, including 'none'. Without this, a version with nothing to say would re-ask the
    // same question on every launch — and the answer, being derived from a version that has not moved, cannot change.
    markSeenVersion(current);
    if (greeting !== 'welcome') return false;
    this.welcomed = true;
    confirmThen(
      this.app,
      {
        title: t('first_run.title'),
        message: [t('first_run.body_what'), t('first_run.body_start')],
        confirmText: t('first_run.open'),
        cancelText: t('first_run.close'),
        // The answer this one hopes for is yes, and there is nothing here to be talked out of.
        cta: true,
        // Nothing is destroyed by reading a settings page. Without this the button is red — the color that means
        // you are about to lose something — as the reader's first sight of the plugin.
        destructive: false,
        // It arrived on its own, so it says who is asking — and cannot stack a second copy behind itself.
        unprompted: true,
      },
      () => {
        // The Setup page itself. Where that cannot be reached, the start page, with Setup its first entry.
        openSettingsPage(this.app, this.manifest.id, [t('settings_pages.setup')]);
      }
    );
    return true;
  }

  /**
   * Offer multi-device setup, once, to a device that is not taking part in a vault that clearly is.
   *
   * **The prompt that replaces a silence.** With the master switch defaulting off, a second device never offers to
   * resume from the first, and nothing would ever mention why. So this asks — at a book open, which is when a resume
   * prompt would come.
   *
   * `unprompted`, because nobody asked for it: two books opened quickly must not stack two copies of one question.
   * "Not now" is remembered for the session, or a helpful offer becomes a thing you dismiss forever.
   *
   * Saying yes runs the ordinary setup dialog — it asks what this needs, and its joining line ("this
   * vault already has files in {{folder}}") covers exactly the case being detected here.
   */
  async offerMultiDeviceSetup(): Promise<void> {
    // Every consideration logged, not just the ones that prompt: this is called from two views on every open, and
    // "why did I see that twice" / "why have I never seen it" are both questions about which guard answered.
    const state = {
      enabled: multiDeviceEnabled(),
      asked: multiDeviceAsked(),
      thisSession: askedMultiDeviceThisSession(),
      elsewhere: vaultUsedElsewhere(this.app),
    };
    this.debug('multi-device offer considered', state, 'sync');
    if (state.enabled || state.asked || state.thisSession) return;
    if (!state.elsewhere) return;
    /**
     * **Three answers, three buttons.** Set up, Not now, and Don't ask again — see `ConfirmSpec.decline`. The × and
     * Escape mean Not now, as they do everywhere.
     *
     * Quiet for the session whatever the answer: this runs on every book open, so an offer that came back on the next
     * one would be a nag. Only Don't ask again is permanent.
     */
    markAskedThisSession();
    let dontAsk = false;
    const setUp = await askToConfirm(this.app, {
      title: t('multi_device.found_title'),
      message: t('multi_device.found_body'),
      confirmText: t('multi_device.found_set_up'),
      cancelText: t('multi_device.found_not_now'),
      decline: {
        label: t('multi_device.found_dont_ask'),
        onDecline: () => {
          dontAsk = true;
        },
      },
      // Not destructive, and the answer this one hopes for is yes — unlike every other confirm, which exists to
      // slow a tap down.
      cta: true,
      destructive: false,
      // **Nobody asked.** It arrives over a book, so it says who is asking — and cannot stack a second copy behind
      // itself, which the palette's reset makes reachable: forgetting the session's "asked" while this is still on
      // screen would let the next book open raise it again.
      unprompted: true,
    });
    if (dontAsk) markMultiDeviceAsked();
    // `dialogs` names what is already on screen, because a second copy of a dialog stacked behind the first is
    // invisible until the top one closes — see `pinModalAboveKeyboard`, which hides all but the topmost.
    this.debug('multi-device offer answered', { setUp, dontAsk, dialogs: liveDialogTitles() }, 'sync');
    if (!setUp) return;
    // **Nothing is turned on until the dialog is answered**, including the switch above it: the offer was
    // "set this up", and backing out of the setup is backing out of the offer.
    await runSyncSetup(this);
  }

  /**
   * Bring this device's order in line with the dashboards there are.
   *
   * Pruned of the dead, extended with the new — and seeded, once, from any `enabled` flag a dashboard still carries
   * from an older version. After this the list is the answer.
   */
  private settleDashboardOrder(): void {
    const dashboards = this.settings.libraryDashboards ?? [];
    const seeded = readDashboardOrder() ?? [
      ...dashboards
        .filter((dashboard) => dashboard.enabled === false)
        .map((dashboard) => ({
          id: dashboard.id,
          enabled: false,
        })),
    ];
    writeDashboardOrder(settledOrder(dashboards, seeded));
  }

  private registerVaultHandlers(): void {
    // Another device's changes to a book's marks, arriving by sync — see `watchBookFiles`.
    watchBookFiles(this);

    registerCopiedImagePaste(this);

    // Books moved outside Obsidian arrive as a creation and a deletion — see `BookMoveMatcher`. Not during startup,
    // when every file in the vault arrives as a creation.
    this.registerEvent(
      this.app.vault.on('create', (file: TAbstractFile) => {
        if (!(file instanceof TFile) || !isBookExtension(file.extension) || !this.app.workspace.layoutReady) return;
        this.bookMoves.created({ path: file.path, name: file.name, size: file.stat.size });
      })
    );

    this.registerEvent(
      this.app.vault.on('delete', async (file: TAbstractFile) => {
        if (!(file instanceof TFile)) return;
        if (!isBookExtension(file.extension)) return;
        const log = (msg: string, extra?: unknown): void => {
          this.debug(`delete: ${msg}`, extra);
        };
        log('book deleted', { path: file.path });
        // **A move first.** If the same book turns up elsewhere within a few seconds, it was moved in Finder or by a
        // sync tool, and its data goes with it as it would with a rename inside Obsidian.
        const movedTo = await this.bookMoves.deleted({ path: file.path, name: file.name, size: file.stat.size });
        const moved = movedTo ? this.app.vault.getAbstractFileByPath(movedTo) : null;
        if (moved instanceof TFile) {
          log('moved outside Obsidian — following it', moved.path);
          await this.followBook(moved, file.path);
          return;
        }
        try {
          let removed = await trashBookData(this.app, file, log);
          // The record describing the book, if the library is on and the note is still purely ours — see
          // `titleNoteKeepReason`. After the data, because a note kept for the reader's sake is the one thing
          // here worth reporting, and it reads better as the last word than as a preamble.
          if (this.settings.libraryEnabled) {
            const outcome = await removeTitleNoteFor(this.app, file.path, {
              coversFolder: coversFolderFor(this.settings),
            });
            if (outcome.status === 'trashed') {
              removed++;
              log('trashed the title note', outcome.path);
              if (outcome.coverTrashed) log('trashed the cover — nothing else used it', outcome.coverTrashed);
            } else if (outcome.status === 'kept' && outcome.kept) {
              log('kept the title note', { path: outcome.path, because: outcome.kept, trimmed: outcome.filesTrimmed });
              // Said out loud, and said WHY: a note that survives a deletion is a surprise otherwise, and the
              // reason is the difference between "Orbis decided" and "you did something Orbis respects".
              const name = outcome.path?.split('/').pop()?.replace(/\.md$/, '') ?? '';
              new Notice(t(TITLE_NOTE_KEPT_MESSAGE[outcome.kept], { name }));
            } else if (outcome.status === 'ambiguous') {
              // Two records naming one book: deleting either could be the wrong one, so neither goes.
              log('kept every title note — more than one names this book', outcome.paths);
            } else {
              log('no title note names this book');
            }
          }
          // **Only when something went.** Saying "removed reading data" over a folder we never found would report
          // success from a handler looking in the wrong place, and hide that it was.
          if (removed > 0) new Notice(t('notices.removed_reading_data', { basename: file.basename }));
          else log('nothing to remove');
        } catch (e) {
          log('failed', e);
        }
      })
    );

    // Right-click a Markdown note in the file explorer. The palette command stays as a second route — it works on
    // whatever is open, which is the natural entry when you are already reading the note rather than browsing for it.
    // A folder entry lands here too, which is the other reason this is the right home.
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFolder) {
          // Only when there is something to convert: an item that reports "no Markdown notes" on every folder in
          // the vault is noise on every folder in the vault.
          if (!folderNotes(file).length) return;
          menu.addItem((item) => {
            item
              .setTitle(t('command_palette.save_folder_as_epub'))
              .setIcon(CONVERSION_ICON_ID)
              .onClick(() => this.saveFolderAsEpub(file));
          });
          menu.addItem((item) => {
            item
              .setTitle(t('command_palette.save_folder_notes_as_epubs'))
              // Not `library`, which would put the Library's own badge on a conversion and say the wrong system.
              // All three of these are Save as EPUB.
              .setIcon(CONVERSION_ICON_ID)
              .onClick(() => this.saveFolderAsSeparateEpubs(file));
          });
          return;
        }
        if (!(file instanceof TFile)) return;
        // A book in the explorer, and a catalog that has something to say about it: the route from the file to the
        // note that describes it. Only when the note exists — an item that reports "no title note" on every book is
        // noise on every book — and only when the library is on, since it is the library's own idea.
        if (this.settings.libraryEnabled && isBookExtension(file.extension)) {
          const note = titleNoteFor(this.app, file.path);
          const book = file;
          menu.addItem((item) => {
            item
              .setTitle(note ? t('library.open_title_note') : t('library.catalog_this_book'))
              .setIcon('library')
              .onClick(() => {
                if (note) void openNoteBeside(this.app, note);
                else void catalogThisBook(this.app, this, book, () => refreshLibraryViews(this));
              });
          });
        }
        if (file.extension !== 'md') return;
        // **Reading comes first, configuring second.** This is the one someone reaches for repeatedly — clip an
        // article, read it — while *Save note as EPUB…* is the considered act you do once with a dialog open.
        menu.addItem((item) => {
          item
            .setTitle(t('command_palette.read_in_orbis_reader'))
            .setIcon('book-open')
            .onClick(() => this.readNoteInOrbis(file));
        });
        menu.addItem((item) => {
          item
            .setTitle(t('command_palette.save_note_as_epub'))
            .setIcon(CONVERSION_ICON_ID)
            .onClick(() => this.saveNoteAsEpub(file));
        });
      })
    );

    // Renaming or moving a book takes its sidecars and its records with it. Two operations, not one, and the
    // second has to run even when the first finds nothing: a book can have records without a `.orbis` file to
    // move (the sidecar block returns early when the old folder is absent).
    this.registerEvent(
      this.app.vault.on('rename', async (file: TAbstractFile, oldPath: string) => {
        if (!(file instanceof TFile)) return;
        if (!isBookExtension(file.extension)) return;
        await this.followBook(file, oldPath);
      })
    );
  }

  /** Take a book's data, records and title note to where the book went — after a rename, or a move outside Obsidian. */
  private async followBook(file: TFile, oldPath: string): Promise<void> {
    // Timed whole: the title-note relink walks the vault's notes, and the records each book's path.
    const started = performance.now();
    await this.moveOrbisSidecars(file, oldPath);
    await this.followBookWithRecords(file, oldPath);
    // Its title note too, whatever the reader told Obsidian about updating links — see `title-note-rename.ts`.
    await relinkTitleNotes(this.app, oldPath, file).catch((e) =>
      this.debug('library: could not relink the title note of a renamed book', e)
    );
    this.debug(
      `book renamed — its data, records and title note followed in ${Math.round(performance.now() - started)} ms`
    );
  }

  /**
   * Move `<book>.orbis` and its siblings to sit beside the book's new home, under its new name.
   *
   * **The recordings too.** They are a folder — `audio/<book>.audio/` — and the loop below sees only files, so without
   * this a renamed or moved book would leave its recordings behind under the old name, where nothing finds them.
   */
  private async moveOrbisSidecars(file: TFile, oldPath: string): Promise<void> {
    const oldStem = sidecarStem(oldPath);
    const newStem = sidecarStem(file.path);
    const oldFolder = progressFolderPathFor(oldPath);
    const newFolder = progressFolderPath(file);
    try {
      if (!(await this.app.vault.adapter.exists(normalizePath(oldFolder)))) return;
      const ensureNewFolder = () => ensureDataFolderAt(this.app, newFolder);
      const listed = await this.app.vault.adapter.list(normalizePath(oldFolder));
      for (const fp of listed.files) {
        const suffix = sidecarSuffix(oldStem, fp.split('/').pop() ?? '');
        if (suffix === null) continue;
        const target = normalizePath(`${newFolder}/${newStem}${suffix}`);
        // Never over a file already there: it is another book's data under the same name, or — when a sync tool
        // carries a rename made on another device — this book's, already arrived.
        if (await this.app.vault.adapter.exists(target)) continue;
        await ensureNewFolder();
        await this.app.vault.adapter.rename(normalizePath(fp), target);
      }
      const oldAudio = bookAudioFolderPathFor(oldPath);
      const newAudio = normalizePath(bookAudioFolderPathFor(file.path));
      if (
        (await this.app.vault.adapter.exists(normalizePath(oldAudio))) &&
        !(await this.app.vault.adapter.exists(newAudio))
      ) {
        const newAudioParent = `${newFolder}/audio`;
        await ensureNewFolder();
        if (!(await this.app.vault.adapter.exists(normalizePath(newAudioParent)))) {
          await this.app.vault.createFolder(normalizePath(newAudioParent));
        }
        await this.app.vault.adapter.rename(normalizePath(oldAudio), newAudio);
      }
      const remaining = await this.app.vault.adapter.list(normalizePath(oldFolder));
      if (remaining.files.length === 0 && remaining.folders.length === 0 && oldFolder !== newFolder) {
        await this.app.vault.adapter.rmdir(normalizePath(oldFolder), true);
      }
    } catch (e) {
      console.warn('Orbis: rename handler error', e);
    }
  }

  /**
   * Keep a book's records with the book when its file is renamed or moved.
   *
   * Without this, a drag in the file explorer strands them: the next export resolves the layout from the book's
   * NEW path, finds nothing there, and writes a fresh set — leaving the old one behind unflagged, so the
   * every-book base shows every annotation twice. Exactly the duplicate state the location-change move exists
   * to prevent, arriving through an ordinary file operation instead of a setting.
   *
   * It matters for both layouts. A book-local folder is named after the book, and a root layout's content
   * folder and base are named from `recordBookName`, which is derived from the path — so moving the book
   * changes those too.
   *
   * The records' own `book` and `cover` wikilinks are updated by Obsidian. `link` and `link_url` embed the path
   * in an `obsidian://` URL, which nothing but an export rebuilds — hence the heal-on-open pass in
   * OrbisReaderView, since a rename usually happens with the book closed.
   */
  private async followBookWithRecords(file: TFile, oldPath: string): Promise<void> {
    try {
      const stored = await readBookRecords(this.app, file);
      const { active, location } = resolveRecords(stored, {
        mode: this.settings.recordsMode,
        kinds: this.settings.recordKinds,
        location: this.settings.recordsSameFolderAsBook ? BOOK_LOCATION : GLOBAL_LOCATION,
      });
      const globalRoot = this.settings.recordsFolder;
      if (!active || !recordLocationReady(location, globalRoot)) return;

      // A root layout's name is the shortest suffix that distinguishes this book from every OTHER book, so the
      // OLD name has to be computed against the book list as it was — the new path swapped back to the old one.
      // A rename that changes some THIRD book's disambiguation is not handled here: that is what the design
      // doc's "relink this book's records" action would be for, and it is rare enough to leave as a note.
      const books = this.app.vault
        .getFiles()
        .filter((f) => isBookExtension(f.extension))
        .map((f) => f.path);
      const shared = {
        location,
        globalRoot,
        allBooksRoot: allBooksBaseRoot(this.settings.recordsAllBooksBaseFolder),
      };
      const booksBefore = books.map((p) => (p === file.path ? oldPath : p));
      const before = recordPaths({
        ...shared,
        bookPath: oldPath,
        bookName: recordBookName(oldPath, booksBefore),
        bookStem: recordStem(oldPath, booksBefore),
      });
      const after = recordPaths({
        ...shared,
        bookPath: file.path,
        bookName: recordBookName(file.path, books),
        bookStem: recordStem(file.path, books),
      });
      const deps = { app: this.app, log: (m: string) => this.debug(m, undefined, 'export') };
      await moveRecordFiles(deps, before, after);
      // Whatever the reader answered to Obsidian's "update links?", the records name the book where it now is.
      await relinkRecords(deps, after.records, oldPath, file.path);
    } catch (e) {
      this.debug('records: could not move reading records with the book', e, 'export');
    }
  }

  async onload() {
    // Timed: everything below runs before Obsidian finishes starting, and a large vault is where that would show.
    const loadStarted = performance.now();
    initI18n(window.moment.locale());
    // Before any menu is built: the ⋯ menu names these two by id. See `registerOrbisIcons`.
    registerOrbisIcons(addIcon);
    /**
     * **Before anything reads a device-local value.** `window.localStorage` is shared by every vault on the machine,
     * so the recording server, the timing samples and the Piper pause would leak between vaults — change the Kokoro
     * URL in one and it would change in all of them. This points those reads at Obsidian's own vault-scoped storage and
     * copies the old machine-wide values in once. See `device-store.ts`.
     */
    initDeviceStore(this.app);
    /**
     * **What this device can speak with, announced once and heard wherever it is shown.**
     *
     * A voice's files arriving or being deleted writes no setting, so nothing about it travels the way a
     * preference does — and the picker that changed it may not be the one the reader is looking at. See
     * `voice-readiness.ts`.
     */
    this.register(onVoiceReadinessChanged(() => this.refreshVoiceChip()));
    // **A step that throws is logged and passed over** — one damaged record must not cost the whole plugin, which it
    // did on every launch until `data.json` was repaired by hand.
    for (const [what, step] of [
      ['load the settings', () => this.loadSettings()],
      ['set up the default note style', () => this.initializeDefaultNoteStyle()],
      ['adopt the shipped note style', () => this.adoptShippedNoteStyle()],
      ['update the annotation presets', () => this.migrateAnnotationPresets()],
      ['add the built-in preset', () => this.ensureBuiltinPreset()],
      ['set up this device’s display style', () => this.initDeviceStyle()],
    ] as const) {
      try {
        await step();
      } catch (err) {
        console.error(`[Orbis] could not ${what} —`, err);
      }
    }

    /**
     * **Say hello once the app has a screen to say it on.**
     *
     * `onLayoutReady` rather than here, for the same reason the first sync scan waits for it: `onload` runs while
     * Obsidian is still assembling itself, and on a phone that is before there is anywhere for a dialog to be. On an
     * INSTALL this fires a moment after the reader presses Enable, with the Community plugins window still open — a
     * real `Modal` is the only surface that works over Obsidian's own settings, which is what `confirmThen` builds.
     * So it waits for any OTHER dialog, but not for Settings.
     */
    this.app.workspace.onLayoutReady(async () => {
      if (await untilNoDialog(true)) this.offerWelcome();
    });
    // A PDF shared last session waits in the plugin's folder until now — see `clearShareFolder`.
    this.app.workspace.onLayoutReady(() => void clearShareFolder(this.app));

    // Once per vault: sidecars named the old way (from a book's basename, shared by every format of it) move to names
    // built from the whole file name. After layout-ready, when the vault's file list is complete. See
    // `sidecar-migration.ts`.
    // The same pass gives each recordings folder its `.audio` suffix (`audioFolderName`), also once per vault.
    this.app.workspace.onLayoutReady(async () => {
      const done = {
        namedByFile: !!this.settings.sidecarsNamedByFile,
        audioSuffixed: !!this.settings.audioFoldersSuffixed,
      };
      if (done.namedByFile && done.audioSuffixed) return;
      await migrateSidecarNames(this.app, (msg) => this.debug(msg), done);
      this.settings.sidecarsNamedByFile = true;
      this.settings.audioFoldersSuffixed = true;
      await this.saveSettings();
    });

    this.dictionaries = new Dictionaries(
      this.app.vault.adapter,
      `${this.app.vault.configDir}/plugins/orbis-reader/dictionary`
    );

    // **What the library reads by is in `data.json`**, so nothing has to be adopted from the vault before a record
    // can be parsed — the field table is loaded with the settings, and the first scan brings any newer copy in behind
    // it. No startup pass reads the vault here: `vault.getFiles()` answers with what Obsidian has INDEXED, which at
    // `onload` on a phone can be nothing at all.
    this.startSync();

    this.addSettingTab(new OrbisSettings(this.app, this));

    // Orbis's tooltips, as far from their controls as this device's pointer needs — see `tooltip-gap.ts`.
    if (!Platform.isMobile) installTooltipGap(this);
    // The keyboard ring on a labeled checkbox or radio row — see `label-focus-ring.ts`.
    installLabelFocusRing(this);
    this.registerView(VIEW_TYPE_ORBIS, (leaf: WorkspaceLeaf) => new OrbisReaderView(leaf, this));
    this.registerExtensions([...BOOK_EXTENSIONS], VIEW_TYPE_ORBIS);

    this.registerView(VIEW_TYPE_ORBIS_DATA, (leaf: WorkspaceLeaf) => new OrbisDataView(leaf, this));
    this.registerExtensions(['orbis'], VIEW_TYPE_ORBIS_DATA);

    // The Library opens in the MAIN window rather than a sidebar: a cover grid and a filter row want width, and
    // on a phone the sidebar is a drawer that closes as soon as you tap something in it. The ribbon button is the
    // desktop way in; the command is the one that works everywhere, including a phone where the ribbon lives
    // inside the drawer.
    this.registerView(VIEW_TYPE_ORBIS_LIBRARY, (leaf: WorkspaceLeaf) => new LibraryView(leaf, this));
    // Both entry points are gated on the setting rather than registered conditionally: a command cannot be
    // unregistered once added, and `checkCallback` returning false is how Obsidian's own optional commands hide
    // themselves from the palette. The ribbon icon is an element we keep, so it can be hidden and shown again.
    // The icon is added BY `applyLibraryEnabled`, not added and then hidden — see `ribbonIcon`.
    this.applyLibraryEnabled();
    // Book sources get their own icon, and it opens the LIST of sources rather than a feed: which catalog you want is
    // the first question, and an icon that opened whichever source happened to be first would be a guess. Gated the
    // same way the Library's is — an icon we keep and hide, since a ribbon icon cannot be removed once added.
    this.applyBookSourcesEnabled();
    this.registerVaultHandlers();
    // Every command Orbis registers — see `commands.ts`.
    registerCommands(this);

    // Deep-link handler: obsidian://orbis-nav?file=…&cfi=…[&page=…][&href=…]
    this.registerObsidianProtocolHandler('orbis-nav', async (params) => {
      const filePath = params.file ? decodeURIComponent(params.file) : null;
      const cfi = params.cfi ? decodeURIComponent(params.cfi) : null;
      const href = params.href ? decodeURIComponent(params.href) : null;
      // `listen=1` starts the player once the book is up — the same action the Library's Listen button takes, so
      // a note, a Base card or a hover preview can offer it without the Library being open. See
      // docs/design/library.md on actions being addressable.
      const listen = params.listen === '1' || params.listen === 'true';
      const locRaw = params.loc ?? params.page;
      if (params.page) {
        console.warn("Orbis: 'page' URI parameter is deprecated. Use 'loc' instead.");
      }
      const loc = locRaw ? parseInt(locRaw, 10) : null;
      const pct = params.pct ? parseInt(params.pct, 10) : null;
      if (!filePath) return;

      const tfile = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
      if (!(tfile instanceof TFile)) {
        new Notice(t('notices.book_not_found_path', { path: filePath }));
        return;
      }

      const existing =
        this.app.workspace
          .getLeavesOfType(VIEW_TYPE_ORBIS)
          .find((l) => (l.view as OrbisReaderView).file?.path === filePath) ?? null;
      if (existing) {
        this.app.workspace.setActiveLeaf(existing, { focus: true });
      } else {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(tfile);
      }
      // The same retry a record row in the Library uses — see `navigateWhenReady`. A book that has just opened has
      // no rendered document to navigate yet, and one copy of that wait is enough.
      navigateWhenReady(this.app, filePath, { cfi, href, loc, pct });
      // After navigation is dispatched, not instead of it: a link may name both a position and listening, and
      // starting the player first would read from wherever the book happened to open.
      if (listen) void startListeningTo(this.app, tfile);
    });

    // Load is done: migrations and backfills above legitimately save, so only start policing
    // whole-object overwrites from here on.
    this.settingsGuardArmed = true;
    this.debug(`loaded in ${Math.round(performance.now() - loadStarted)} ms`);
    // The vault's size only once Obsidian has listed it — at load it has not, and the count reads 0.
    this.app.workspace.onLayoutReady(() =>
      this.debug(
        `vault ready ${Math.round(performance.now() - loadStarted)} ms after load began — ${this.app.vault.getFiles().length} files`
      )
    );
  }

  onunload() {
    // Intentionally do not detach leaves: detaching in onunload resets
    // leaf positions to default when the plugin reloads, even if the user
    // moved them. Obsidian handles cleanup automatically.
    // The browser patches are Orbis's to take off — they live in Obsidian's window, not in anything Obsidian unloads.
    removeFoliatePatches();
  }

  async onExternalSettingsChange() {
    await this.loadSettings();
    // Derived state: without this a synced respelling change wouldn't apply until a local save
    // happened to invalidate the cache.
    this.pronouncerCache = undefined;
    // A switch thrown on another device has to reach the ribbon here too. Without these, turning the Library or book
    // sources off on the desktop would leave its icon sitting on the phone until the plugin next loaded — an icon for a
    // feature that is off, which is exactly the state `ribbonIcon` exists to prevent.
    this.applyLibraryEnabled();
    this.applyBookSourcesEnabled();
    this.refreshViews();
  }

  /**
   * Put Orbis's own collection and dashboard back, exactly as this version defines them.
   *
   * **Rebuilt every load rather than migrated.** Nothing about them is read back from disk except whether the
   * dashboard is switched on, so an update changes what they mean by changing this code — no migration to write,
   * and no user edit to overwrite, because editing them is not offered.
   *
   * The one thing that needs care is a default dashboard written by an older version, built from the reader's
   * own collections and then edited. That is their work, so it becomes THEIRS: the system flag comes off, it takes
   * a new id, and the provided pair appears alongside it. Nobody loses a dashboard they arranged.
   */
  private ensureSystemLibrary(): void {
    const collections = (this.settings.libraryCollections ??= []);
    const dashboards = (this.settings.libraryDashboards ??= []);

    const provided = defaultDashboard(t('library.system_dashboard'));
    const stored = dashboards.findIndex((d) => d.id === DEFAULT_DASHBOARD_ID);
    if (stored >= 0) {
      const previous = dashboards[stored];
      const isThisVersions = previous.widgets.every((w) => provided.widgets.some((p) => p.id === w.id));
      if (isThisVersions) {
        // Ours, and untouched apart from its switch: replace it wholesale and keep only that.
        dashboards[stored] = { ...provided, enabled: previous.enabled };
      } else {
        // Theirs, in all but name. Keep every widget and count as they arranged it.
        const mine = `dashboard-${generateStyleId()}`;
        if (readActiveDashboard() === previous.id) writeActiveDashboard(mine);
        previous.id = mine;
        previous.system = undefined;
        for (const widget of previous.widgets) widget.system = undefined;
        dashboards.splice(stored + 1, 0, provided);
      }
    } else {
      dashboards.unshift(provided);
    }

    // Rebuilt from code every load, both species, so an edit to either is replaced rather than kept — which is
    // what makes them uneditable rather than merely discouraged.
    for (const provided of [
      { id: SYSTEM_COLLECTION_ID, built: systemCollection(t('library.system_collection')) },
      { id: SYSTEM_RECORD_COLLECTION_ID, built: systemRecordCollection(t('library.system_record_collection')) },
    ]) {
      const at = collections.findIndex((c) => c.id === provided.id);
      if (at >= 0) collections[at] = provided.built;
      else collections.push(provided.built);
    }
  }

  /**
   * The note describing whatever book is open, or null — including when the library is off or the file is not a book.
   *
   * One place, because two commands ask it and a `checkCallback` runs on every palette keystroke: the shape that
   * matters is that both of them answer from the same lookup rather than each doing its own.
   */
  titleNoteForActiveBook(): TFile | null {
    if (!this.settings.libraryEnabled) return null;
    const file = this.app.workspace.getActiveFile();
    if (!file || !isBookExtension(file.extension)) return null;
    return titleNoteFor(this.app, file.path);
  }

  /**
   * The open book, for a command that edits the library's record of it — or null when there is nothing to edit.
   *
   * **The library being on is the gate, not the book having a note.** Rating and reading status are the library's own
   * fields, so with it switched off the commands are not in the palette at all; with it on they are offered for any
   * book, and the note is written when an answer is given.
   */
  openBookForLibrary(): TFile | null {
    if (!this.settings.libraryEnabled) return null;
    const file = this.app.workspace.getActiveFile();
    return file && isBookExtension(file.extension) ? file : null;
  }

  /**
   * Both cover commands: available exactly when there is a book, a note describing it, and a library to hold the
   * image — and, when run, reporting where the cover went rather than leaving you to check the folder.
   */
  coverCommand(checking: boolean, opts: { drawOnly?: boolean }): boolean {
    const note = this.titleNoteForActiveBook();
    const book = this.app.workspace.getActiveFile();
    if (!note || !book) return false;
    if (!checking) {
      void refreshCover(this.app, book, note.path, coversFolderFor(this.settings), opts).then((path) => {
        new Notice(path ? t('library.cover_refreshed', { path }) : t('library.cover_refresh_failed'));
        refreshLibraryViews(this);
      });
    }
    return true;
  }

  /** The ribbon icon, present only while the Library is on — see `ribbonIcon`. */
  private libraryRibbonEl: HTMLElement | null = null;

  /** The same, for book sources. */
  private sourcesRibbonEl: HTMLElement | null = null;

  /**
   * Add or remove a ribbon icon, so its presence follows a switch.
   *
   * **The element goes, rather than being hidden.** An icon hidden with `toggle(false)` comes back: the ribbon is
   * Obsidian's to rebuild — a layout restore, a sidebar toggle — and a display style we set on load does not survive
   * that, so the icon would reappear on a vault where the feature was never switched on, offering a dialog whose every
   * route is closed.
   *
   * Re-added from scratch when the switch comes back, which is why the caller keeps the handle rather than the icon
   * keeping itself.
   *
   * **And the action goes, not just the element** — see `removeRibbonAction`, which a phone's ribbon menu needs.
   */
  private ribbonIcon(
    current: HTMLElement | null,
    on: boolean,
    icon: string,
    title: string,
    click: () => void
  ): HTMLElement | null {
    if (on) return current ?? this.addRibbonIcon(icon, title, click);
    if (current) removeRibbonAction(this.app, current, `${this.manifest.id}:${title}`);
    return null;
  }

  /**
   * Show or hide the book-sources entry points.
   *
   * Nothing to close: browsing is a dialog, and a dialog open when the switch goes off is a dialog whose next tap
   * would fetch — which the switch is entitled to prevent, and does, because every request goes through a source list
   * that is empty once the feature is off.
   */
  applyBookSourcesEnabled(): void {
    this.sourcesRibbonEl = this.ribbonIcon(
      this.sourcesRibbonEl,
      deviceSetting('bookSourcesEnabled'),
      'download-cloud',
      t('sources.browse'),
      () => this.openBookSources()
    );
  }

  /** Browse a catalog. The switch is checked here as well as on the way in: a stale ribbon icon must not fetch. */
  openBookSources(): void {
    if (!deviceSetting('bookSourcesEnabled')) return;
    new BookSourcesModal(this.app, this).open();
  }

  /**
   * Show or hide the Library's entry points, and close it if it is open.
   *
   * Detaching open Library leaves is deliberate: "turn the library off" that leaves one sitting in a tab has not
   * done what it says. Nothing is lost — the view holds no state of its own, only a painting of the vault.
   */
  applyLibraryEnabled(): void {
    const on = this.settings.libraryEnabled;
    this.libraryRibbonEl = this.ribbonIcon(
      this.libraryRibbonEl,
      on,
      'library',
      t('library.open'),
      () => void openLibraryView(this)
    );
    if (!on) {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS_LIBRARY)) leaf.detach();
    }
  }

  async loadSettings() {
    // Never null for a file that is there but damaged: it is set aside and the backup read instead.
    const read = await readSettingsFile(this);
    const raw = (read.data ?? {}) as Partial<OrbisPluginSettings>;
    this.settingsOnDisk = canonicalJson(raw);
    this.settings = Object.assign({}, DEFAULT_PLUGIN_SETTINGS, raw);
    if (read.note) this.debug(read.note);
    this.settleShapes('settings');
    // Recording-generation config moved to device-local storage (never synced). Seed it from any
    // legacy synced values (kept in data.json, untyped/ignored, so a device updating later can still
    // seed — deleting them would race across synced devices).
    // Respellings saved before they were lowercased on write: normalize so the glossary DISPLAYS what
    // is actually spoken (compilePronouncer already lowercases, so playback was correct either way).
    /**
     * This device's own chrome out of `data.json`, once.
     *
     * From the RAW settings rather than the merged object: a default cannot masquerade as an answer, so a device that
     * never touched a toolbar button carries nothing and simply takes the default from now on. See
     * `device-settings.ts` for why they leave — `data.json` has to be exactly the set that travels for a reader who
     * syncs it directly to get the same result as one who lets Orbis publish.
     */
    // The theme list within its own rules — see `settleThemeList`. The two settings it replaced on 2026-10-10 go: they
    // lived one day, in test vaults, and carrying them over would be code kept for nothing.
    this.settings.readerThemes = settleThemeList(this.settings.readerThemes);
    const replaced = this.settings as unknown as Record<string, unknown>;
    delete replaced.themePresetsOffered;
    delete replaced.customThemes;
    const movedToDevice = migrateDeviceSettings(raw);
    if (movedToDevice.length) this.debug('carried this device’s own settings out of data.json', movedToDevice);
    if (Array.isArray(this.settings.pronunciations)) {
      this.settings.pronunciations = this.settings.pronunciations.map((p) => ({
        ...p,
        // An id per entry, minted once: it is what sync merges by, and a word is not a stable key — see
        // `Pronunciation.id`. Given here rather than at each place an entry is created, so an entry written by an
        // older version gets one the first time this version loads — and DERIVED FROM THE WORD, so that every
        // device gives the same entry the same id without having to agree about it. See `legacyPronunciationId`.
        id: p.id || legacyPronunciationId(p.word ?? ''),
        say: normalizePronunciationSay(p.say ?? ''),
      }));
    }
    /**
     * The split level as a NUMBER, whatever `data.json` holds.
     *
     * An older version could store the string `"0"` here (a dropdown value written raw), and the resolver reads
     * `"0" + 1` as `"01"` and walks to Heading 3. This converts a value already on disk, which also travels, so a
     * device that never saw the bad write would otherwise inherit it from one that did.
     */
    this.settings.epubSplitLevel = coerceSettingValue('epubSplitLevel', this.settings.epubSplitLevel) as number;
    // Backfill note-style config fields added since a style was last saved. `Object.assign` above merges
    // the TOP level only, so a nested `config` written before a field existed keeps its old shape — and a
    // string field arriving as undefined is not a graceful degradation, it is a crash at the first
    // `.replace()`. This is that class of bug's home: any future config field gets its default here.
    for (const style of this.settings.noteStyles ?? []) {
      style.config = { ...DEFAULT_NOTE_STYLE_CONFIG, ...style.config };
    }
    // Collections were once stored under `libraryShelves`; renamed rather than migrated in place, so the key
    // carries over here once.
    const legacyShelves = (raw as { libraryShelves?: LibraryCollection[] }).libraryShelves;
    if (legacyShelves?.length && !this.settings.libraryCollections?.length) {
      this.settings.libraryCollections = legacyShelves;
    }
    // Collections predate rules: one saved with a folder, a tag and one property meant all three, narrowing, so it
    // becomes a single `all` set. Guarded on `ruleSets` being absent rather than empty — a collection someone
    // emptied on purpose must not be refilled from fields the editor no longer writes.
    for (const collection of this.settings.libraryCollections ?? []) {
      if (!collection.ruleSets) collection.ruleSets = rulesFromLegacyCollection(collection);
    }
    // An `uncataloged` widget from an older version is dropped — there is no such kind, since it acted rather than
    // showed. A dashboard someone built keeps everything else; the widget itself would otherwise render as a kind
    // nothing recognizes.
    //
    // And every widget draws from a collection. One written without one points at the system collection — every
    // title in the vault — which is exactly what it was already showing.
    for (const dashboard of this.settings.libraryDashboards ?? []) {
      dashboard.widgets = dashboard.widgets.filter((widget) => (widget.kind as string) !== 'uncataloged');
      for (const widget of dashboard.widgets) {
        if ((widget.kind as string) === 'collection') widget.kind = 'titles';
        if (!widget.collection) widget.collection = SYSTEM_COLLECTION_ID;
      }
    }
    // The alias table the record parser reads. Set here rather than passed around: reading a record is called from
    // a dozen places and this changes twice a session — see `setLibraryFields`.
    //
    // **From `data.json`, before anything parses a record.** A newer copy from another device arrives with the first
    // sync scan, which needs an await, and everything between here and there parses records. Setting the local copy
    // first means the worst case is a table that is one load behind, rather than a pass with no table at all.
    setLibraryFields(this.settings.libraryFields ?? []);
    this.ensureSystemLibrary();
    // Widgets carry the enabled flag; a collection's own flag, from an older version, is read once, so a
    // collection someone had switched off stays switched off — as a disabled widget — instead of reappearing.
    for (const collection of this.settings.libraryCollections ?? []) {
      if (collection.enabled === false) {
        for (const dashboard of this.settings.libraryDashboards ?? []) {
          for (const widget of dashboard.widgets) if (widget.collection === collection.id) widget.enabled = false;
        }
      }
      delete collection.enabled;
    }
    /**
     * This device's dashboard arrangement out of `data.json`, once — the same move the voice choice makes below, for
     * the same reason. Which dashboards this device shows, in what order, and which one is open are facts about the
     * device; `data.json` is the document that travels. See docs/design/multi-device-sync.md §An item travels.
     */
    // From the RAW file: these are not settings, so there is nothing on `this.settings` to read or delete —
    // only an older `data.json` that still carries them.
    const legacyPlaces = raw as { libraryDashboardOrder?: DashboardPlace[]; libraryActiveDashboard?: string };
    if (migrateDashboardPlaces(legacyPlaces.libraryDashboardOrder, legacyPlaces.libraryActiveDashboard ?? '')) {
      this.debug('dashboards: carried this device’s arrangement out of data.json');
    }
    if (!readActiveDashboard()) writeActiveDashboard(this.settings.libraryDashboards[0]?.id ?? '');
    /**
     * This device's voice choice out of `data.json` and into vault-scoped device storage, once.
     *
     * Per-device data in a synced document is the fault `voice-pref.ts` describes. Carried rather than dropped so
     * nobody re-picks a voice on every device — and only when nothing is stored here yet, since a choice made since
     * the move is newer than anything the old array holds.
     */
    migrateVoicePref((raw as { voicePrefs?: VoicePref[] }).voicePrefs, getOrCreateDeviceId(this.app));
    // Alignment's yes/no becomes three answers, in every style and this device's live value — see `migrateTextAlign`.
    if (migrateTextAlign(this.app, this.settings.styles ?? [])) void this.saveSettings();
    seedGenConfigFromLegacy(this.settings as unknown as Record<string, unknown>);
    // Turn the server method on for devices that already had a recording setup; fresh installs stay
    // Piper-only. Runs after the seed above so seeded server config counts as "had prior".
    migrateGenConfigEnable();
    // An older version stored the base's placement as a three-way mode ('shared' | 'folder' | 'none'). It folds
    // into the folder itself, where empty means declined.
    const legacyBase = (raw as { recordsAllBooksBase?: unknown }).recordsAllBooksBase;
    if (typeof legacyBase === 'string' && !this.settings.recordsAllBooksBaseFolder) {
      this.settings.recordsAllBooksBaseFolder = legacyBase === 'shared' ? (raw.recordsFolder ?? '') : '';
    }
    // A vault that already has a library set up has effectively answered its first-run questions, so it must not
    // be asked when the dialog arrives. Inferred once and then stored: a records folder is an explicit answer, and
    // so is a collection or dashboard of the reader's own — nobody makes either without having decided where the
    // library lives.
    if (!this.settings.librarySetupDone) {
      const own = (list: readonly { system?: boolean }[] | undefined) => (list ?? []).some((entry) => !entry.system);
      this.settings.librarySetupDone =
        !!this.settings.libraryRecordsFolder?.trim() ||
        own(this.settings.libraryCollections) ||
        own(this.settings.libraryDashboards);
    }
    // A vault that already has a records destination has effectively answered the first-run question, so it must
    // not be asked again. Inferred for the upgrade only: `recordsSetupDone` exists because the inference is
    // not reliable in general ("no folder, records beside the books, no aggregate base" is a legitimate answer),
    // but for a vault written before the flag existed it is sound — nothing could have set a folder without having
    // chosen one.
    if (!raw.recordsSetupDone && (raw.recordsFolder?.trim() || raw.recordsSameFolderAsBook)) {
      this.settings.recordsSetupDone = true;
    }
    // Reading records are three-valued (off / ask per book / on for every book). An older boolean maps onto the
    // two ends of that, so a reader who had it on keeps it on.
    const legacyRecords = (raw as { recordsEnabled?: unknown }).recordsEnabled;
    if (typeof legacyRecords === 'boolean' && !raw.recordsMode) {
      this.settings.recordsMode = legacyRecords ? 'on' : 'off';
    }
    // Old 'pages' progress modes are renamed 'locs'. Applied to the DEVICE store, which is where these live — and
    // after `migrateDeviceSettings` above, so a value carried out of `data.json` this very load is renamed too.
    renameLegacyProgressModes();

    // Lookup: ensure every section is present (append any missing, keeping the user's order +
    // visibility), and re-merge built-in web destinations by id. Preserve the user's ORDER (this
    // runs on every load — incl. the onExternalSettingsChange that a saveData() can trigger — so
    // forcing canonical order here would silently undo the user's reordering). For built-ins we
    // refresh the canonical name/url (so catalog fixes land) but keep the user's enabled flag and
    // position; user-added entries pass through untouched; brand-new built-ins append at the end.
    if (!Array.isArray(this.settings.lookupSections) || this.settings.lookupSections.length === 0) {
      this.settings.lookupSections = DEFAULT_LOOKUP_SECTIONS.map((s) => ({ ...s }));
    } else {
      // Drop ids this version does not know (such as a 'pronunciation' section, which is a button in the
      // popup's action row). Leaving a stale id would break the Settings section list, which labels
      // rows via LOOKUP_SECTION_LABELS[id] and would render `undefined`.
      const known = new Set(DEFAULT_LOOKUP_SECTIONS.map((s) => s.id));
      this.settings.lookupSections = this.settings.lookupSections.filter((s) => known.has(s.id));
      const have = new Set(this.settings.lookupSections.map((s) => s.id));
      for (const s of DEFAULT_LOOKUP_SECTIONS) if (!have.has(s.id)) this.settings.lookupSections.push({ ...s });
    }
    const stored = Array.isArray(this.settings.lookupWebDestinations) ? this.settings.lookupWebDestinations : [];
    const builtinById = new Map(BUILTIN_LOOKUP_DESTINATIONS.map((b) => [b.id, b]));
    const merged: LookupWebDestination[] = [];
    const seen = new Set<string>();
    for (const d of stored) {
      const b = builtinById.get(d.id);
      if (b) {
        merged.push({ ...b, enabled: d.enabled }); // built-in: refresh name/url, keep enabled + position
        seen.add(d.id);
      } else if (!d.builtin) {
        merged.push(d); // user-added: keep as-is
        seen.add(d.id);
      }
      // else: a stored entry claiming builtin but no longer in the catalog → dropped
    }
    for (const b of BUILTIN_LOOKUP_DESTINATIONS) if (!seen.has(b.id)) merged.push({ ...b });
    this.settings.lookupWebDestinations = merged;
    // The same reconciliation for book sources, and for the same reason — a catalog endpoint that moves is ours to
    // fix, and Gutenberg has a dated plan to move its feed. See `mergeBookSources` for the three rules.
    // **And no two sources may share a credential key**, which only a hand-edited id can bring about — see
    // `withUniqueSourceIds` for why the check compares the keys rather than judging the ids.
    this.settings.bookSources = withUniqueSourceIds(
      mergeBookSources(this.settings.bookSources),
      () => `catalog-${generateStyleId()}`
    );
  }

  async saveSettings(): Promise<void> {
    const run = this.saveQueue.then(() => this.saveSettingsChecked());
    this.saveQueue = run.catch(() => {}); // a failed save must not wedge the queue
    return run;
  }

  /**
   * Persist settings, first checking that nobody else wrote data.json since we last read it.
   *
   * Why the check: saveData() writes the WHOLE in-memory object, so a stale copy silently discards
   * another device's changes with no conflict marker. Obsidian's onExternalSettingsChange usually
   * reloads us before that can happen; this covers the remaining window (a change landing between the
   * hook and our write, or two devices editing at once).
   */
  private async saveSettingsChecked(): Promise<void> {
    // Invalidate the compiled pronouncer here rather than at each write site. This is the single
    // funnel every settings mutation already goes through, so a new write path can't forget to
    // refresh it and leave a respelling saved outside the settings tab (the lookup popup, say) doing
    // nothing until Obsidian is reloaded.
    this.pronouncerCache = undefined;
    // The same funnel, for the same reason: a field table edited in settings has to reach the record parser
    // without every write site remembering to say so.
    setLibraryFields(this.settings.libraryFields ?? []);
    // And out to the other devices, if the reader has any. Debounced: a rename saves per keystroke, and publishing
    // eight versions of a name being typed is eight files for one edit — see `scanSoon`.
    this.sync?.scanSoon('a local change');
    if (this.settingsGuardArmed && this.settingsOnDisk !== null) {
      const disk = canonicalJson((await this.loadData()) ?? {});
      // **No keys are forgiven.** Nothing in `data.json` drifts between disk and memory on its own, so a difference
      // here is a real difference.
      if (disk !== this.settingsOnDisk) {
        /**
         * **The other device's file wins, without asking.**
         *
         * A "use theirs" or "overwrite with mine" prompt would be a choice between two whole copies of the settings,
         * neither of which the reader can see, on a file that is one merge unit. Nothing device-shaped is in the file,
         * so taking theirs costs nothing that belongs to this device, and saving over it would silently discard however
         * much of theirs the difference covered. The asymmetry decides it without asking.
         *
         * It can still only fire for a reader syncing `data.json` itself: under this design that file is never
         * written by anyone else. See docs/design/multi-device-sync.md §Two ways to sync.
         *
         * **Say what changed**, not just that something did — the first difference tells "another device edited
         * this" from "our own bookkeeping drifted", which is the question worth answering in a log.
         */
        this.debug(
          `settings: the file on disk differs from what this device wrote — ${firstDifference(this.settingsOnDisk, disk)}`
        );
        await this.loadSettings(); // adopts the other device's file + refreshes the fingerprint
        this.pronouncerCache = undefined;
        this.refreshViews();
        // Said out loud, because the alternative is an edit vanishing with no account of itself.
        new Notice(t('stale_settings.taken'));
        return; // local change deliberately dropped
      }
    }
    await this.saveData(this.settings);
    await keepBackup(this, this.settings);
    // Fingerprint what actually landed rather than what we meant to write, so JSON round-tripping
    // (dropped undefined fields) can't make our own write look foreign on the next save.
    this.settingsOnDisk = canonicalJson((await this.loadData()) ?? {});
  }

  /** The user's respellings, compiled once and cached until settings change. Consulted for every
   *  sentence on both the playback and recording paths, hence the cache. */
  pronouncer(): Pronouncer | null {
    if (this.pronouncerCache === undefined) {
      this.pronouncerCache = compilePronouncer(this.settings.pronunciations ?? []);
    }
    return this.pronouncerCache;
  }

  /** `IOrbisReaderPlugin.refreshLibraryViews` — the interface's method, forwarding to the module function that
   *  every caller inside the plugin already uses directly. */
  refreshLibraryViews(): void {
    refreshLibraryViews(this);
  }

  refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS).forEach((leaf) => {
      if (leaf.view instanceof OrbisReaderView) leaf.view.applyPluginSettings();
    });
  }

  /** `IOrbisReaderPlugin.repaintMarkBars` — every open book, since the Marks dialog can be opened from anywhere. */
  repaintMarkBars(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS)) {
      if (leaf.view instanceof OrbisReaderView) leaf.view.repaintMarkBars();
    }
  }

  /**
   * The reader view the annotation-preset manager should offer per-book assignment for, or null.
   *
   * The active leaf first; failing that, the only open reader view — the manager is usually reached from
   * Settings or the command palette, and with one book open "this book" is unambiguous even when the
   * active leaf is a note. Two open books and neither active stays null rather than guessing.
   */
  /**
   * The reader an open preset dialog is about, held for that dialog's lifetime.
   *
   * **Because a modal takes the focus this would otherwise be resolved from.** `presetTargetView` asks the
   * workspace what is active, and with the Annotations dialog on screen the answer is the dialog — so it would
   * fall to the "exactly one book open" fallback, and with two books in tabs answer null. Every book-scope
   * operation in this dialog goes through here and every one of them optional-chains, so they would not fail:
   * they would silently do nothing. Changing a book's preset, hiding a mark, copying one into the book — all of
   * it a no-op, intermittently, depending on which leaf happened to be active when the dialog was opened.
   *
   * Pinned at open rather than snapshotting the book: the book's own preset changes WHILE the dialog is open —
   * that is most of what the dialog does — so the view is what must be remembered, and read afresh each render.
   */
  private pinnedPresetView: OrbisReaderView | null = null;

  /** Pin the current target for a dialog session; the returned function releases it. */
  pinPresetTarget(): () => void {
    this.pinnedPresetView = this.presetTargetView();
    return () => {
      this.pinnedPresetView = null;
    };
  }

  presetTargetView(): OrbisReaderView | null {
    // A pinned view still has to be alive: a book closed under an open dialog leaves a detached view, and
    // acting on it would write to a file nothing is showing.
    if (this.pinnedPresetView?.file) return this.pinnedPresetView;
    const active = this.getActiveView();
    if (active?.file) return active;
    const open = this.app.workspace
      .getLeavesOfType(VIEW_TYPE_ORBIS)
      .map((l) => l.view)
      .filter((v): v is OrbisReaderView => v instanceof OrbisReaderView && !!v.file);
    return open.length === 1 ? open[0] : null;
  }

  /** The open book and its own copy of a preset (null when it has none), for the manager's "This book"
   *  scope. One call rather than several accessors: the copy already carries id, revision and marks. */
  activeBookForPresets(): { name: string; preset: BookPreset | null } | null {
    const view = this.presetTargetView();
    if (!view?.file) return null;
    return { name: view.file.basename, preset: view.annotationBookPreset };
  }

  /**
   * Promote the open book's marks into a new library preset — see `promoteBookToPreset`.
   *
   * The library entry is written FIRST, deliberately. It touches two stores (`data.json` and the book's
   * `.orbis`), and if the second write is the one that fails, an unused preset in the library is a harmless
   * leftover while a book pointing at a preset that was never created is the state this whole feature exists
   * to eliminate.
   */
  async promoteActiveBook(promoted: PromotedPreset): Promise<void> {
    this.settings.annotationPresets.push(promoted.preset);
    await this.saveSettings();
    await this.presetTargetView()?.applyBookPromotion(promoted);
  }

  /** Assign a preset to the open book (null unassigns). No-op when no book is open. */
  async assignActivePreset(preset: AnnotationPreset | null): Promise<void> {
    await this.presetTargetView()?.assignAnnotationPreset(preset);
  }

  /** Catch the open book up with a preset that just changed. A per-mark merge, not a whole-copy re-push: it
   *  updates tracked marks in place and leaves anything the reader made their own alone. */
  async mergeActivePreset(preset: AnnotationPreset): Promise<void> {
    await this.presetTargetView()?.mergeAnnotationPreset(preset);
  }

  /** Copy a preset mark into the open book so it can be changed there. Returns the new mark's id. */
  async copyMarkIntoBook(markId: string): Promise<string | undefined> {
    return this.presetTargetView()?.copyMarkIntoBook(markId);
  }

  /** Show or hide one of the open book's marks. */
  async setBookMarkHidden(markId: string, hidden: boolean): Promise<void> {
    await this.presetTargetView()?.setBookMarkHidden(markId, hidden);
  }

  /** Which marks the open book's annotations depend on, and how many carry each. */
  bookMarkUsage(): { markId: string; count: number }[] {
    return this.presetTargetView()?.bookMarkUsage() ?? [];
  }

  /** Point the open book at a different preset, applying a decision per mark in use. */
  async deleteLocalMark(markId: string, choice: RemapChoice | 'remove'): Promise<void> {
    await this.presetTargetView()?.deleteLocalMark(markId, choice);
  }

  async detachBookPreset(detached: { book: BookPreset; idMap: Map<string, string> }): Promise<void> {
    await this.presetTargetView()?.detachPreset(detached);
  }

  async changeBookPreset(next: AnnotationPreset, plan: Map<string, RemapChoice>): Promise<void> {
    await this.presetTargetView()?.changeBookPreset(next, plan);
  }

  /** Save marks edited for the open book only — the in-book edit path. */
  async saveActiveBookPreset(next: BookPreset | null): Promise<void> {
    await this.presetTargetView()?.saveAnnotationBookPreset(next);
  }

  /** Re-seat listening playback in every open reader view onto the current playback source — used
   *  after the "always use the live voice" setting changes. */
  reloadListeningSource() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS).forEach((leaf) => {
      if (leaf.view instanceof OrbisReaderView) void leaf.view.reloadListeningSource();
    });
  }

  /** Pause listening playback in every open reader view — used before a voice preview so the book
   *  audio and the preview sample don't play at the same time. */
  lockMobileHeights() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS).forEach((leaf) => {
      if (leaf.view instanceof OrbisReaderView) leaf.view.lockMobileHeights();
    });
  }

  unlockMobileHeights() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS).forEach((leaf) => {
      if (leaf.view instanceof OrbisReaderView) leaf.view.unlockMobileHeights();
    });
  }

  pauseListening() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS).forEach((leaf) => {
      if (leaf.view instanceof OrbisReaderView) leaf.view.pauseListening();
    });
  }

  /** Repaint the Listen chip in every open reader view — used when a voice download arrives or is deleted from
   *  Settings, which changes what this device can speak with without changing any setting. */
  refreshVoiceChip() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS).forEach((leaf) => {
      if (leaf.view instanceof OrbisReaderView) leaf.view.refreshVoiceChip();
    });
  }
}
