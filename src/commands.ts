// Every command Orbis puts in the palette.
//
// **Outside `onload`**, which would otherwise be the longest function in the plugin by a wide margin and mostly
// command registration.
//
// It takes the plugin rather than an interface, and deliberately: a command IS the plugin's own surface, and every
// one of them is a `checkCallback` asking the plugin something and then telling it to do something. Narrowing that
// to a host would be inventing a seam where there is not one.
//
// What lives in `onload` is what a plugin load actually does — settings, migrations, views, the ribbon icons, the
// vault handlers, the deep-link handler.

import { App, FuzzySuggestModal, Notice } from 'obsidian';
import { openAboutDialog } from './AboutDialog';
import { openAnnotationPresets } from './AnnotationPresetsModal';
import { BookExportModal } from './BookExportModal';
import { openBookDataFile } from './book-data-file';
import { isBookExtension } from './book-formats';
import { confirmThen } from './ConfirmModal';
import { catalogThisBook } from './catalog-this-book';
import { deviceSetting, setDeviceSetting } from './device-settings';
import { getOrCreateDeviceId, readDeviceValue, writeDeviceValue } from './device-store';
import { displayStyleLabel } from './device-style';
import { stepBrightness, stepFontSize, stepLineHeight, stepMargins } from './display-commands';
import { forgetSeenVersion } from './first-run';
import { GenerateNotesModal } from './GenerateNotesModal';
import { t } from './i18n';
import { openLibraryView, refreshLibraryViews } from './LibraryView';
import { adoptNote } from './library/adopt';
import { noteKind, pickText } from './library/record';
import { titleNoteFor } from './library/title-note';
import type OrbisReaderPlugin from './main';
import { VIEW_TYPE_ORBIS } from './OrbisReaderView';
import { PronunciationsModal } from './PronunciationsModal';
import { openNoteBeside, splitLeaf } from './panes';
import { LS_DEVICE_NAME, updateDeviceNameInVault } from './progress';
import { openRecordsResetDialog } from './RecordsResetModal';
import { toggleNoteWriting } from './reader/DebugLog';
import { resetListenFirstRun } from './reader/tts/listen-first-run';
import { createPronunciationStore } from './reader/tts/pronunciation-service';
import { systemVoiceReport } from './reader/tts/WebSpeechEngine';
import type { DisplayStyle } from './settings';
import {
  DISPLAY_DEFAULTS,
  parseTextAlign,
  STORAGE_KEY_BRIGHTNESS,
  STORAGE_KEY_COLUMNS,
  STORAGE_KEY_FLOW,
  STORAGE_KEY_FONT_SIZE,
  STORAGE_KEY_LINE_HEIGHT,
  STORAGE_KEY_MARGINS,
  STORAGE_KEY_TEXT_ALIGN,
} from './settings';
import { registerShareProbe } from './share-probe';
import { describeRoster } from './sync/devices';
import { syncEnabled, syncSetupDone } from './sync/enabled';
import { syncFolderOf } from './sync/paths';
import { deletePublishedCopies, forgetPublishing, publishedCopyCount } from './sync/reset';
import { openRatingDialog, openStatusDialog } from './TitleFieldModal';
import { addTestFixturesCommand } from './test-fixtures';
import { nextTextAlign, TEXT_ALIGN_LABELS } from './text-align';
import { type OrbisPopupHost } from './ui-utils';

class SwitchStyleModal extends FuzzySuggestModal<DisplayStyle> {
  constructor(
    app: App,
    private plugin: OrbisReaderPlugin
  ) {
    super(app);
    this.setPlaceholder(t('quick_pick.switch_style_placeholder'));
  }

  getItems(): DisplayStyle[] {
    return this.plugin.stylesForThisDevice();
  }

  getItemText(item: DisplayStyle): string {
    return displayStyleLabel(item, (this.app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '');
  }

  onChooseItem(item: DisplayStyle): void {
    this.plugin.switchToStyle(item.id);
  }
}

export function registerCommands(plugin: OrbisReaderPlugin): void {
  plugin.addCommand({
    id: 'orbis-open-the-library',
    name: t('library.open'),
    checkCallback: (checking) => {
      if (!plugin.settings.libraryEnabled) return false;
      if (!checking) void openLibraryView(plugin);
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-browse-book-sources',
    name: t('sources.browse'),
    checkCallback: (checking) => {
      if (!deviceSetting('bookSourcesEnabled')) return false;
      if (!checking) plugin.openBookSources();
      return true;
    },
  });

  // The same route as the explorer's context menu, for whatever book is open or selected. `checkCallback` so it
  // leaves the palette entirely when the library is off or the book has no note — a command that only ever says
  // "there isn't one" is a command worth not offering.
  plugin.addCommand({
    id: 'orbis-open-title-note',
    name: t('library.open_title_note'),
    checkCallback: (checking) => {
      const note = plugin.titleNoteForActiveBook();
      if (!note) return false;
      if (!checking) void openNoteBeside(plugin.app, note);
      return true;
    },
  });

  // The one-note version of the catalog review's adopt list, for the note you are looking at. Offered exactly
  // when it would do something: the note has a title, and has not already said what it is.
  plugin.addCommand({
    id: 'orbis-mark-this-note-as-a-title-note',
    name: t('library.mark_title_note'),
    checkCallback: (checking) => {
      if (!plugin.settings.libraryEnabled) return false;
      const file = plugin.app.workspace.getActiveFile();
      if (!file || file.extension !== 'md') return false;
      const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
      if (!fm || noteKind(fm) || !pickText(fm, 'title')) return false;
      if (!checking) {
        void adoptNote(plugin.app, file.path).then(() => {
          new Notice(t('library.marked_title_note'));
          refreshLibraryViews(plugin);
        });
      }
      return true;
    },
  });

  // Take the cover again for a book that already has a note — the only route back to a cover, since cataloging
  // takes one once and never asks again.
  plugin.addCommand({
    id: 'orbis-take-the-cover-from-this-book-again',
    name: t('library.refresh_cover'),
    checkCallback: (checking) => plugin.coverCommand(checking, {}),
  });

  // Niche on purpose: this one throws away what the book carries and draws a title-and-author cover instead. The
  // case it exists for is a converter's generic device icon, which no rule can tell from a plain cover.
  plugin.addCommand({
    id: 'orbis-replace-the-cover-with-a-generated-one',
    name: t('library.generate_cover'),
    checkCallback: (checking) => plugin.coverCommand(checking, { drawOnly: true }),
  });

  // The other half of the same question, so the palette never offers an action that cannot happen: this one is
  // present exactly when the open book has no note yet.
  plugin.addCommand({
    id: 'orbis-catalog-this-book',
    name: t('library.catalog_this_book'),
    checkCallback: (checking) => {
      if (!plugin.settings.libraryEnabled) return false;
      const file = plugin.app.workspace.getActiveFile();
      if (!file || !isBookExtension(file.extension)) return false;
      if (titleNoteFor(plugin.app, file.path)) return false;
      if (!checking) void catalogThisBook(plugin.app, plugin, file, () => refreshLibraryViews(plugin));
      return true;
    },
  });

  // The two things you decide while reading, from inside the book. Unlike the two commands above, these do not ask
  // whether the book has a title note: they write one if it has none, so the answer to "what did you think of it"
  // is never "catalog it first". See TitleFieldModal.
  plugin.addCommand({
    id: 'orbis-set-reading-status',
    name: t('library.set_reading_status'),
    checkCallback: (checking) => {
      const file = plugin.openBookForLibrary();
      if (!file) return false;
      if (!checking) openStatusDialog(plugin.app, plugin, file);
      return true;
    },
  });
  plugin.addCommand({
    id: 'orbis-rate-this-book',
    name: t('library.rate_book'),
    checkCallback: (checking) => {
      const file = plugin.openBookForLibrary();
      if (!file) return false;
      if (!checking) openRatingDialog(plugin.app, plugin, file);
      return true;
    },
  });

  // ── Global commands (no active book required) ──────────────────────────

  plugin.addCommand({
    id: 'orbis-toggle-link-preview',
    name: t('command_palette.toggle_link_preview'),
    callback: () => {
      // A hover is a fact about a device, so this is stored beside it — see `device-settings.ts`. The reader views
      // read it live, so there is nothing to save and nothing to refresh.
      setDeviceSetting('linkPreviewEnabled', !deviceSetting('linkPreviewEnabled'));
    },
  });

  // Offered while a book is open in any tab, not only the active one: notes beside a book is the usual layout, and the
  // point of switching is to watch the book change. With no book there is nothing to see change, and Appearance in
  // settings does the same with a preview.
  plugin.addCommand({
    id: 'orbis-switch-display-style',
    name: t('command_palette.switch_display_style'),
    checkCallback: (checking) => {
      if (plugin.app.workspace.getLeavesOfType(VIEW_TYPE_ORBIS).length === 0) return false;
      if (!checking) new SwitchStyleModal(plugin.app, plugin).open();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-about',
    name: t('command_palette.about_orbis_reader'),
    callback: () => {
      // Use the active reader as the popup host for best positioning; otherwise
      // synthesize a minimal host so About works even with no book open.
      const host: OrbisPopupHost = plugin.getActiveView() ?? {
        contentEl: activeDocument.body,
        lockMobileHeights: () => {},
        unlockMobileHeights: () => {},
      };
      openAboutDialog(host, plugin.manifest.version);
    },
  });

  plugin.addCommand({
    id: 'orbis-open-book',
    name: t('command_palette.open_book'),
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (file && isBookExtension(file.extension)) {
        if (!checking) {
          const leaf = splitLeaf(plugin.app);
          void leaf.setViewState({ type: VIEW_TYPE_ORBIS, state: { file: file.path } });
        }
        return true;
      }
      return false;
    },
  });

  // ── Reader commands (only active when an EPUB view is focused) ─────────

  plugin.addCommand({
    id: 'orbis-toggle-scrolled-mode',
    name: t('command_palette.toggle_scrolled_mode'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) {
        const next =
          ((plugin.app.loadLocalStorage(STORAGE_KEY_FLOW) as string | null) ?? 'paginated') === 'scrolled'
            ? 'paginated'
            : 'scrolled';
        plugin.app.saveLocalStorage(STORAGE_KEY_FLOW, next);
        plugin.app.workspace.trigger('orbis:settings-change', STORAGE_KEY_FLOW, next);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-scan-annotation-data-for-problems',
    name: t('command_palette.scan_annotation_data_for_problems'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openAnnotationCleanup();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-toggle-column-layout',
    name: t('command_palette.toggle_column_layout'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking) {
        const next = String(
          ((plugin.app.loadLocalStorage(STORAGE_KEY_COLUMNS) as string | null) ?? '2') === '1' ? 2 : 1
        );
        plugin.app.saveLocalStorage(STORAGE_KEY_COLUMNS, next);
        plugin.app.workspace.trigger('orbis:settings-change', STORAGE_KEY_COLUMNS, next);
      }
      return true;
    },
  });

  /**
   * **The step commands read the same defaults the reader does.** A literal of their own for "nothing stored yet"
   * can disagree with the reader's default, and then an untouched device's first press steps from a value the book
   * was never using. Aliased to stay one line.
   */
  const { fontSize: FONT_SIZE_0, brightness: BRIGHTNESS_0 } = DISPLAY_DEFAULTS;
  const { margins: MARGINS_0, lineHeight: LINE_HEIGHT_0 } = DISPLAY_DEFAULTS;

  plugin.addCommand({
    id: 'orbis-increase-font-size',
    name: t('command_palette.increase_font_size'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking)
        plugin.lsSet(STORAGE_KEY_FONT_SIZE, stepFontSize(plugin.lsGet(STORAGE_KEY_FONT_SIZE, FONT_SIZE_0), 'up'));
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-decrease-font-size',
    name: t('command_palette.decrease_font_size'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking)
        plugin.lsSet(STORAGE_KEY_FONT_SIZE, stepFontSize(plugin.lsGet(STORAGE_KEY_FONT_SIZE, FONT_SIZE_0), 'down'));
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-increase-brightness',
    name: t('command_palette.increase_brightness'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking)
        plugin.lsSet(STORAGE_KEY_BRIGHTNESS, stepBrightness(plugin.lsGet(STORAGE_KEY_BRIGHTNESS, BRIGHTNESS_0), 'up'));
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-decrease-brightness',
    name: t('command_palette.decrease_brightness'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking)
        plugin.lsSet(
          STORAGE_KEY_BRIGHTNESS,
          stepBrightness(plugin.lsGet(STORAGE_KEY_BRIGHTNESS, BRIGHTNESS_0), 'down')
        );
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-cycle-text-alignment',
    name: t('command_palette.cycle_text_alignment'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking) {
        /**
         * The next of the three, as the Alignment dropdown lists them. **It says which**, unlike the other display
         * commands: in a book that sets its own text left, Follow the book and Left look the same on the page.
         */
        const now = parseTextAlign(plugin.app.loadLocalStorage(STORAGE_KEY_TEXT_ALIGN) as string | null);
        const next = nextTextAlign(now);
        plugin.app.saveLocalStorage(STORAGE_KEY_TEXT_ALIGN, next);
        plugin.app.workspace.trigger('orbis:settings-change', STORAGE_KEY_TEXT_ALIGN, next);
        new Notice(t('notices.text_alignment_now', { align: t(TEXT_ALIGN_LABELS[next]) }));
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-increase-line-spacing',
    name: t('command_palette.increase_line_spacing'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking) {
        const cur = parseFloat(
          (plugin.app.loadLocalStorage(STORAGE_KEY_LINE_HEIGHT) as string | null) ?? String(LINE_HEIGHT_0)
        );
        const next = String(stepLineHeight(cur, 'up'));
        plugin.app.saveLocalStorage(STORAGE_KEY_LINE_HEIGHT, next);
        plugin.app.workspace.trigger('orbis:settings-change', STORAGE_KEY_LINE_HEIGHT, next);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-decrease-line-spacing',
    name: t('command_palette.decrease_line_spacing'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking) {
        const cur = parseFloat(
          (plugin.app.loadLocalStorage(STORAGE_KEY_LINE_HEIGHT) as string | null) ?? String(LINE_HEIGHT_0)
        );
        const next = String(stepLineHeight(cur, 'down'));
        plugin.app.saveLocalStorage(STORAGE_KEY_LINE_HEIGHT, next);
        plugin.app.workspace.trigger('orbis:settings-change', STORAGE_KEY_LINE_HEIGHT, next);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-increase-text-margins',
    name: t('command_palette.increase_text_margins'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking) plugin.lsSet(STORAGE_KEY_MARGINS, stepMargins(plugin.lsGet(STORAGE_KEY_MARGINS, MARGINS_0), 'up'));
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-decrease-text-margins',
    name: t('command_palette.decrease_text_margins'),
    checkCallback: (checking) => {
      if (!plugin.getActiveView()) return false;
      if (!checking)
        plugin.lsSet(STORAGE_KEY_MARGINS, stepMargins(plugin.lsGet(STORAGE_KEY_MARGINS, MARGINS_0), 'down'));
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-toggle-listening-bar',
    name: t('command_palette.toggle_listening_bar'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.toggleTts();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-toggle-full-screen-audio-player',
    name: t('command_palette.toggle_full_screen_audio_player'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.toggleListenMode();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-lock-listening-controls',
    name: t('command_palette.lock_listening_controls'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view?.canLockListeningControls()) return false;
      if (!checking) view.toggleListeningControlLock();
      return true;
    },
  });

  // Always-visible gateway: toggles the developer options — the experimental commands below (which
  // checkCallback on the flag) and the technical settings rows that hide behind the same one.
  plugin.addCommand({
    id: 'orbis-toggle-developer-options',
    name: t('command_palette.toggle_developer_options'),
    callback: () => {
      // A palette is a device's own, so this never travels and there is nothing to save.
      const on = !deviceSetting('showDevOptions');
      setDeviceSetting('showDevOptions', on);
      new Notice(t(on ? 'notices.dev_options_on' : 'notices.dev_options_off'));
    },
  });

  plugin.addCommand({
    id: 'orbis-manage-recordings-and-mixes',
    name: t('command_palette.manage_recordings_and_mixes'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openRecordingsModal();
      return true;
    },
  });

  // The voice/recordings picker behind the Listen bar's voice chip.
  plugin.addCommand({
    id: 'orbis-choose-listening-voice',
    name: t('command_palette.choose_listening_voice'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openListenSettings();
      return true;
    },
  });

  // Like the glossary, presets are plugin-wide, so no open book is needed.
  plugin.addCommand({
    id: 'orbis-manage-annotation-presets',
    name: t('command_palette.manage_annotation_presets'),
    callback: () => openAnnotationPresets(plugin.app, plugin),
  });

  // The same thing the toolbar's Aa button does — opened on the book's own marks rather than the
  // library. Needs an open book, unlike the command above.
  plugin.addCommand({
    id: 'orbis-write-this-books-reading-record',
    name: t('command_palette.write_this_books_reading_record'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view?.file) return false;
      if (!checking) void view.exportAnnotationRecords();
      return true;
    },
  });

  // The same act as the context-menu item, for a note that is open rather than one being pointed at. Same
  // availability rule as its sibling below: a Markdown note, no book required.
  plugin.addCommand({
    id: 'orbis-read-in-orbis',
    name: t('command_palette.read_in_orbis_reader'),
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (file?.extension !== 'md') return false;
      if (!checking) plugin.readNoteInOrbis(file);
      return true;
    },
  });

  // Markdown → EPUB. Not a reader command: it acts on the active Markdown NOTE, so it is available whenever one
  // is open rather than requiring a book.
  plugin.addCommand({
    id: 'orbis-save-note-as-epub',
    name: t('command_palette.save_note_as_epub'),
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (file?.extension !== 'md') return false;
      if (!checking) void plugin.saveNoteAsEpub(file);
      return true;
    },
  });

  // Per book, so it needs one open — same shape as the export and cleanup commands either side of it. Also
  // the way to change an answer given to the prompt, which is why it is a command rather than only a prompt.
  plugin.addCommand({
    id: 'orbis-reading-record-for-this-book',
    name: t('command_palette.reading_record_for_this_book'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view?.file) return false;
      if (!checking) view.openBookRecordsSettings();
      return true;
    },
  });

  /**
   * The two PDFs, and the one rule that separates every annotation export from every book export.
   *
   * **An unavailable command is HIDDEN, not grayed** — `checkCallback` returning false removes the row from the
   * palette entirely, and Obsidian offers nothing milder. That is its own convention rather than a compromise: a
   * palette is a search over what you can do now. The ⋯ menu grays the same items instead, because a menu is a
   * fixed list where a missing row reads as a feature that was removed.
   *
   * **Only this one is gated.** `Generate notes` and `Open notes` are not, because a notes style outlines the
   * whole book by default and is useful on a book nobody has marked. The digest has no such mode — with nothing
   * marked it writes an empty file — which is the one place the rule earns itself.
   */
  plugin.addCommand({
    id: 'orbis-save-annotations-as-pdf',
    name: t('command_palette.save_annotations_as_pdf'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view?.file || !view.hasMarksToExport()) return false;
      if (!checking) view.saveAnnotationsAsPdf();
      return true;
    },
  });

  // No such gate: a PDF of the book is a readable artifact before anyone has marked anything, which is the
  // asymmetry the split exists to express.
  plugin.addCommand({
    id: 'orbis-save-as-pdf',
    name: t('command_palette.save_as_pdf'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view?.file) return false;
      if (!checking) view.saveBookAsPdf();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-remove-records-of-deleted-content',
    name: t('command_palette.remove_records_of_deleted_content'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view?.file) return false;
      if (!checking) void view.cleanupAnnotationRecords();
      return true;
    },
  });

  // The quick picker for this book's two role marks — the same dialog as the full-screen player's Aa button.
  plugin.addCommand({
    id: 'orbis-select-marks-for-listening-and-notes',
    name: t('command_palette.select_marks_for_listening_and_notes'),
    checkCallback: (checking) => {
      const view = plugin.presetTargetView();
      if (!view?.file) return false;
      if (!checking) view.openMarkRoles();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-annotation-marks-for-this-book',
    name: t('command_palette.annotation_marks_for_this_book'),
    checkCallback: (checking) => {
      if (!plugin.presetTargetView()?.file) return false;
      if (!checking) openAnnotationPresets(plugin.app, plugin, 'book');
      return true;
    },
  });

  // The glossary is plugin-wide, not per-book (it lives in settings), so
  // unlike every other listening command this one needs no open book — and without it the glossary
  // is reachable ONLY by digging into Settings → Listening.
  plugin.addCommand({
    id: 'orbis-show-pronunciation-glossary',
    name: t('command_palette.show_pronunciation_glossary'),
    callback: () => new PronunciationsModal(plugin, createPronunciationStore(plugin)).open(),
  });

  // Developer/experimental commands below — hidden from the Command Palette unless developer
  // commands are enabled via the toggle above (checkCallback returns false).

  // DEV: verify the offline dictionary end-to-end (download → load → define + stemming).
  plugin.addCommand({
    id: 'orbis-test-dictionary-lookup',
    // i18n-audit-disable-next-line -- dev-only diagnostic command
    name: 'Test dictionary lookup (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        void (async () => {
          // 'constructor' is in both books and comes back as Object's own unless read into a Map — the
          // prototype trap `parseAsset` avoids, so it belongs in the check that catches it.
          const words = ['book', 'running', 'mercies', 'constructor', 'obsidian', 'serendipity'];
          const lines: string[] = [];
          for (const w of words) {
            const hits = await plugin.dictionaries.define(w);
            const said = hits.map((h) => `${h.service.source.id}: ${h.senses[0].text.slice(0, 40)}`);
            lines.push(`${w} — ${said.length ? said.join(' | ') : '(no entry)'}`);
          }
          new Notice(lines.join('\n'), 10000);
        })();
      }
      return true;
    },
  });

  // DEV: see where focus mode thinks the bottom of the screen is.
  //
  // A red rule at the true viewport bottom, a green rule at the inset Orbis measured, and a magenta outline on the
  // progress chip. The whole problem is invisible on a desktop — `env(safe-area-inset-bottom)` is 0 there because
  // there is genuinely nothing in the way — so the only way to tell a correct measurement from a lucky one is to
  // photograph it on a phone, in both of Android's navigation modes.
  plugin.addCommand({
    id: 'orbis-show-focus-mode-insets',
    // i18n-audit-disable-next-line -- dev-only diagnostic command
    name: 'Show focus-mode insets (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        const on = activeDocument.body.classList.toggle('orbis-inset-debug');
        // i18n-audit-disable-next-line -- dev-only diagnostic notice
        new Notice(on ? 'Inset rules on: red = screen bottom, green = measured inset.' : 'Inset rules off.');
      }
      return true;
    },
  });

  // DEV: cycle the Piper inter-utterance pause to tune cadence.
  plugin.addCommand({
    id: 'orbis-cycle-piper-sentence-pause',
    // i18n-audit-disable-next-line -- dev-only experiment command
    name: 'Cycle Piper sentence pause (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        const steps = [0, 75, 150, 250, 400];
        const cur = Number.parseInt(readDeviceValue('orbis-piper-pause-ms') ?? '150', 10);
        const next = steps[(steps.indexOf(cur) + 1) % steps.length] ?? 150;
        writeDeviceValue('orbis-piper-pause-ms', String(next));
        // i18n-audit-disable-next-line -- dev-only experiment notice
        new Notice(`Piper sentence pause → ${next}ms`);
      }
      return true;
    },
  });

  // DEV: put reading records back to "never set up" on THIS device — a phone or a tablet included, where the
  // first-run flow most needs walking through.
  plugin.addCommand({
    id: 'orbis-reset-reading-records',
    // i18n-audit-disable-next-line -- dev-only reset command
    name: 'Reset reading records (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) openRecordsResetDialog(plugin);
      return true;
    },
  });

  // DEV: what this device offers for saving or sharing a file outside the vault.
  registerShareProbe(plugin);

  // DEV: vet downloaded Orbis voices for short-input duration blow-up (garbled headings).
  plugin.addCommand({
    id: 'orbis-vet-listen-voices',
    // i18n-audit-disable-next-line -- dev-only curation command
    name: 'Vet listen voices (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) void plugin.vetVoices();
      return true;
    },
  });

  // DEV: put the library back to never-set-up so the first-run dialog can be tested repeatedly. The folders go
  // with the flag deliberately — leaving them set would make the inference above answer the question again on
  // the next load, and the dialog would never appear twice.
  plugin.addCommand({
    id: 'orbis-reset-library-first-run',
    // i18n-audit-disable-next-line -- dev-only test command
    name: 'Reset library first-run (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        plugin.settings.librarySetupDone = false;
        plugin.settings.libraryEnabled = false;
        plugin.settings.libraryRecordsFolder = '';
        plugin.settings.libraryCoversFolder = '';
        void plugin.saveSettings();
        refreshLibraryViews(plugin);
        // i18n-audit-disable-next-line -- dev-only test notice
        new Notice('Library reset to first-run: switched off, folders cleared. Turn it on in settings to test.');
      }
      return true;
    },
  });

  /**
   * DEV: what a scan would do, without doing any of it.
   *
   * **Read-only on purpose.** The state worth looking at is a device that has files in its vault and has adopted
   * nothing, and a tool that scans in order to report on scanning destroys that state before anyone has seen it —
   * then reports success, having caused it. See `sync/diagnose.ts`.
   */
  plugin.addCommand({
    id: 'orbis-sync-status',
    // i18n-audit-disable-next-line -- dev-only diagnostic command
    name: 'Sync status (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        void (async () => {
          const report = [
            `setup answered: ${syncSetupDone() ? 'yes' : 'no'} | folder setting: ${syncFolderOf(plugin.settings.syncFolder)}`,
            ...((await plugin.sync?.status()) ?? ['sync was never started']),
            ...describeRoster(plugin.settings.syncDevices ?? [], getOrCreateDeviceId(plugin.app)),
          ];
          plugin.debug('── status ──', undefined, 'sync');
          for (const line of report) plugin.debug(`  ${line}`, undefined, 'sync');
          plugin.debug('── end ──', undefined, 'sync');
          // i18n-audit-disable-next-line -- dev-only diagnostic notice
          new Notice('Sync status written to the debug log — turn on the "sync" pill to read it.');
        })();
      }
      return true;
    },
  });

  /**
   * DEV: scan now, whatever the triggers have or have not done.
   *
   * The other half of the pair: run `Sync status` first to see the stuck state, then this to find out whether a
   * scan resolves it. If it does, the fault is in what asks for a scan rather than in what a scan decides.
   */
  plugin.addCommand({
    id: 'orbis-sync-now',
    // i18n-audit-disable-next-line -- dev-only test command
    name: 'Sync now (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        void (async () => {
          if (!syncEnabled()) {
            // i18n-audit-disable-next-line -- dev-only test notice
            new Notice('Publishing is off for this device — turn it on in Settings → Devices first.');
            return;
          }
          plugin.debug('── forced scan ──', undefined, 'sync');
          await plugin.sync?.scanNow('the dev command');
          for (const line of (await plugin.sync?.status()) ?? []) plugin.debug(`  ${line}`, undefined, 'sync');
          plugin.debug('── end ──', undefined, 'sync');
          // i18n-audit-disable-next-line -- dev-only test notice
          new Notice('Scan finished — see the debug log, "sync" pill, for what it did.');
        })();
      }
      return true;
    },
  });

  /**
   * DEV: put multi-device sync back to before this device had ever published.
   *
   * More than the switch and the setup flag, or the walk-through would be a fake: the versions this device stamped
   * live in `data.json`, the counter beside the device, and the copies themselves in the vault. Leave any of them
   * and the "first" run adopts what it finds and publishes nothing, which is not what a first run does.
   *
   * **The device name goes too**, so the setup dialog's suggestion can be seen. That is the one part of this reset
   * with a life outside sync — the name is what other devices show in the resume prompt — which is why the
   * confirmation says so rather than leaving it to be noticed later.
   */
  plugin.addCommand({
    id: 'orbis-reset-multi-device-sync-first-run',
    // i18n-audit-disable-next-line -- dev-only test command
    name: 'Reset multi-device sync first-run (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        const copies = publishedCopyCount(plugin.app);
        confirmThen(
          plugin.app,
          {
            // i18n-audit-disable-next-line -- dev-only test dialog
            title: 'Reset multi-device sync?',
            message:
              // i18n-audit-disable-next-line -- dev-only test dialog
              `Puts this device back before the multi-device switch: publishing off, setup forgotten, name, ` +
              `counter, folder setting and every stamped version cleared, and ${copies} published file(s) ` +
              `trashed — including other devices' copies. They republish their own the next time they scan.`,
            // i18n-audit-disable-next-line -- dev-only test dialog
            confirmText: 'Reset',
          },
          () => {
            void (async () => {
              const gone = await deletePublishedCopies(plugin.app);
              forgetPublishing();
              plugin.app.saveLocalStorage(LS_DEVICE_NAME, '');
              await updateDeviceNameInVault(plugin.app, getOrCreateDeviceId(plugin.app), '');
              plugin.settings.syncFolder = '';
              plugin.settings.syncVersions = undefined;
              await plugin.saveSettings();
              plugin.debug(`reset to first-run, ${gone} published file(s) trashed`, undefined, 'sync');
              // i18n-audit-disable-next-line -- dev-only test notice
              new Notice(`Sync reset to first-run: ${gone} file(s) trashed. Turn it on in settings to test.`);
            })();
          }
        );
      }
      return true;
    },
  });

  /**
   * DEV: put book sources back to first-run so the consent-and-folder dialog appears again.
   *
   * There is no `sourcesSetupDone` flag to clear: the dialog is skipped when a download folder is already set, so
   * the folder IS the record of having been asked. Clearing the switch alone would therefore turn the feature
   * straight back on without asking anything.
   *
   * The configured catalogs are deliberately left alone — the first run does not create them (they ship as
   * defaults) and it does not touch them, so wiping them would test a state the reader can never be in.
   */
  plugin.addCommand({
    id: 'orbis-reset-book-sources-first-run',
    // i18n-audit-disable-next-line -- dev-only test command
    name: 'Reset book sources first-run (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        setDeviceSetting('bookSourcesEnabled', false);
        plugin.settings.bookSourcesFolder = '';
        void plugin.saveSettings();
        plugin.applyBookSourcesEnabled(); // the ribbon icon goes with the switch
        plugin.refreshViews();
        // i18n-audit-disable-next-line -- dev-only test notice
        new Notice('Book sources reset to first-run: switched off, folder cleared. Turn it on in settings to test.');
      }
      return true;
    },
  });

  // DEV: this device's Listen back to first run, downloaded voices included — see `resetListenFirstRun`.
  plugin.addCommand({
    id: 'orbis-reset-listen-first-run',
    // i18n-audit-disable-next-line -- dev-only test command
    name: 'Reset listen first-run (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) void resetListenFirstRun(plugin.app, () => plugin.refreshViews());
      return true;
    },
  });

  /**
   * DEV: be a device that has never been greeted.
   *
   * **The cheap half of the pair below**, and the one that gets used. Both bring the welcome back and they are
   * not the same tool: this one forgets a single stored version — no downloads to fetch again, no
   * destinations to answer for a second time, no reload. The factory reset is for the once-a-session question of
   * what a reader who has never run Orbis actually finds.
   */
  plugin.addCommand({
    id: 'orbis-reset-the-welcome',
    // i18n-audit-disable-next-line -- dev-only test command
    name: 'Reset the welcome (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        forgetSeenVersion();
        // i18n-audit-disable-next-line -- dev-only test notice
        new Notice('Welcome forgotten for this device. Reload Obsidian to be greeted again.');
      }
      return true;
    },
  });

  /**
   * DEV: everything back to a fresh install, in one command.
   *
   * **One command, not eight.** Every capability has its own first-run reset, each right for the feature putting
   * its own house in order — but "what does a new reader see?" is not
   * eight questions, and running eight commands to answer it is how a first-run experience goes untested.
   *
   * **Configuration, never content.** `data.json` goes back to its defaults, this device's stored values are
   * forgotten, and the three per-device caches are deleted. NOT touched: books, notes, record notes, `.orbis`
   * files, published sync folders — the reader's own material, and anything another device may be relying on. A
   * dev command that deleted a vault's work in order to test a settings page would be the worst trade here.
   *
   * **A reload follows**, because half of the plugin lives in memory: styles were read at load, the device id is
   * cached, open views hold settings they were handed. A reset that left those running would show a page
   * agreeing with neither the disk nor the next launch.
   */
  plugin.addCommand({
    id: 'orbis-factory-reset-back-to-a-new-install',
    // i18n-audit-disable-next-line -- dev-only test command
    name: 'Factory reset — back to a new install (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) plugin.confirmFactoryReset();
      return true;
    },
  });

  // DEV: dump every OS system voice (and whether it's shown/suppressed) to the debug log.
  plugin.addCommand({
    id: 'orbis-dump-system-voices',
    // i18n-audit-disable-next-line -- dev-only diagnostic command
    name: 'Dump system voices (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        const view = plugin.getActiveView();
        const lines = systemVoiceReport();
        for (const line of lines) view?.debug(`sysvoice: ${line}`, 'tts');
        // i18n-audit-disable-next-line -- dev-only diagnostic notice
        new Notice(`${lines.length} system voice(s) logged — see debug log.`);
      }
      return true;
    },
  });

  /**
   * Reading with the keyboard starts here.
   *
   * **No default hotkeys, deliberately.** Obsidian's contract is that the user binds keys, and a plugin that
   * claims a combination the reader already uses is a bug to the very people this is for. What makes these
   * reachable at all is the forwarder in `ReaderDom`: the book is an iframe, and a keystroke inside one never
   * reaches the document Obsidian listens on, so without it a bound key stops working the moment you click into
   * the text you are reading.
   */
  for (const [id, name, kind, direction] of [
    ['orbis-go-to-next-page', 'command_palette.go_to_next_page', 'page', 1],
    ['orbis-go-to-previous-page', 'command_palette.go_to_previous_page', 'page', -1],
    ['orbis-go-to-next-chapter', 'command_palette.go_to_next_chapter', 'section', 1],
    ['orbis-go-to-previous-chapter', 'command_palette.go_to_previous_chapter', 'section', -1],
  ] as const) {
    plugin.addCommand({
      id,
      name: t(name),
      checkCallback: (checking) => {
        const view = plugin.getActiveView();
        if (!view) return false;
        if (!checking) {
          if (kind === 'page') view.turnPage(direction);
          else view.turnChapter(direction);
        }
        return true;
      },
    });
  }

  /**
   * Selecting a book from the keyboard, by the sentence.
   *
   * There is no caret in an iframe to extend from, so the unit is what the book can enumerate for itself. The
   * marks then apply to whatever is selected, which is how a passage gets marked without touching the mouse.
   */
  for (const [id, name, move] of [
    ['orbis-select-sentence', 'command_palette.select_sentence', 'sentence'],
    ['orbis-select-previous-sentence', 'command_palette.select_previous_sentence', 'previous'],
    ['orbis-select-paragraph', 'command_palette.select_paragraph', 'paragraph'],
    ['orbis-extend-selection-by-a-sentence', 'command_palette.extend_selection_by_a_sentence', 'extend'],
    ['orbis-shrink-selection-by-a-sentence', 'command_palette.shrink_selection_by_a_sentence', 'shrink'],
  ] as const) {
    plugin.addCommand({
      id,
      name: t(name),
      checkCallback: (checking) => {
        const view = plugin.getActiveView();
        if (!view) return false;
        if (!checking) view.moveSentenceSelection(move);
        return true;
      },
    });
  }

  /**
   * Marking without reaching for the mouse — the reason the sentence selection exists.
   *
   * Numbered rather than named, because a hotkey is a position: the key that marks a passage yellow should keep
   * marking it yellow whatever the mark is called. `checkCallback` reports false when there is nothing to mark,
   * so the command grays out in the palette rather than appearing to work.
   *
   * Unbound, like everything else here. `Mod+1`–`9` are Obsidian's own tab switches by default; binding one of
   * them to a mark is the reader's decision and their custom binding wins inside the book as it does outside.
   */
  for (let n = 1; n <= 9; n++) {
    plugin.addCommand({
      id: `orbis-apply-mark-${n}`,
      name: t('command_palette.apply_mark', { n: String(n) }),
      checkCallback: (checking) => {
        const view = plugin.getActiveView();
        if (!view) return false;
        if (!checking) return view.applyQuickMark(n);
        return true;
      },
    });
  }

  /**
   * Stepping between annotations, and acting on the one you land on.
   *
   * "Select" here means what clicking means: a note opens its view, a passage mark opens the bar in edit mode.
   * Same path as the mouse, so a keyboard reader gets the same thing rather than a second UI to keep in step.
   */
  for (const [id, name, kind, back] of [
    ['orbis-go-to-next-mark-or-note', 'command_palette.go_to_next_mark_or_note', 'any', false],
    ['orbis-go-to-next-passage-selection', 'command_palette.go_to_next_passage_selection', 'highlight', false],
    ['orbis-go-to-next-note', 'command_palette.go_to_next_note', 'note', false],
    ['orbis-go-to-previous-mark-or-note', 'command_palette.go_to_previous_mark_or_note', 'any', true],
    ['orbis-go-to-previous-passage-selection', 'command_palette.go_to_previous_passage_selection', 'highlight', true],
    ['orbis-go-to-previous-note', 'command_palette.go_to_previous_note', 'note', true],
  ] as const) {
    plugin.addCommand({
      id,
      name: t(name),
      checkCallback: (checking) => {
        const view = plugin.getActiveView();
        if (!view) return false;
        if (!checking) void view.selectAnnotation(kind, back);
        return true;
      },
    });
  }

  plugin.addCommand({
    id: 'orbis-delete-the-selected-mark-or-note',
    name: t('command_palette.delete_the_selected_mark_or_note'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking && !view.deleteAnnotation()) new Notice(t('notices.no_annotation_selected'));
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-apply-no-mark-note-editor',
    name: t('command_palette.apply_no_mark_note_editor'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) return view.clearQuickMark();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-clear-selection',
    name: t('command_palette.clear_selection'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.clearSelection();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-toggle-focus-mode',
    name: t('command_palette.toggle_focus_mode'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.toggleFocusMode();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-toggle-bookmark-on-current-location',
    name: t('command_palette.toggle_bookmark_on_current_location'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.toggleBookmark();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-toggle-note-icons',
    name: t('toolbar.toggle_note_icons'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.toggleNoteIcons();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-open-contents-tab',
    name: t('command_palette.open_contents_tab'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openPanel('contents');
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-open-search',
    name: t('command_palette.open_search'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openSearchBar();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-open-annotations-tab',
    name: t('command_palette.open_annotations_tab'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openPanel('saved');
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-open-linked-vault-notes-tab',
    name: t('command_palette.open_linked_vault_notes_tab'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openPanel('backlinks');
      return true;
    },
  });

  // Stats, like the other four content-panel tabs, has a command of its own.
  plugin.addCommand({
    id: 'orbis-open-stats-tab',
    name: t('command_palette.open_stats_tab'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openPanel('stats');
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-go-back',
    name: t('command_palette.go_back'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.bookGoBack();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-go-forward',
    name: t('command_palette.go_forward'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.bookGoForward();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-clear-navigation-history',
    name: t('command_palette.clear_navigation_history'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.clearNavigationHistory();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-cycle-reading-progress-display',
    name: t('command_palette.cycle_reading_progress_display'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.cycleProgressMode();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-go-to-location',
    name: t('go_to.go_to_location'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.openGoToBar();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-open-notes',
    name: t('command_palette.open_notes'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) void view.openOrCreateNotesFile();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-generate-notes',
    name: t('command_palette.generate_notes'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) new GenerateNotesModal(plugin.app, view).open();
      return true;
    },
  });

  // Book export from the palette, not only the pane menu, which is three clicks and easy to miss.
  plugin.addCommand({
    id: 'orbis-save-as-markdown',
    name: t('command_palette.save_as_markdown'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) new BookExportModal(plugin.app, view).open();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-copy-link-to-current-location',
    name: t('command_palette.copy_link_to_current_location'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.copyLink();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-copy-passage-selections-to-clipboard',
    name: t('command_palette.copy_passage_selections_to_clipboard'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.copyHighlights();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-copy-notes-to-clipboard',
    name: t('command_palette.copy_notes_to_clipboard'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.copyNotes();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-copy-bookmarks-to-clipboard',
    name: t('command_palette.copy_bookmarks_to_clipboard'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.copyBookmarks();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-show-reading-locations-on-all-devices',
    name: t('command_palette.show_reading_locations_on_all_devices'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) void view.showDeviceLocations();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-show-reading-data-for-this-book',
    name: t('command_palette.show_reading_data_for_this_book'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view?.file) return false;
      if (!checking) void openBookDataFile(plugin.app, view.file);
      return true;
    },
  });

  // Index-recovery commands — rarely needed, so hidden unless developer mode is on.
  plugin.addCommand({
    id: 'orbis-recalculate-locations',
    name: t('command_palette.recalculate_locations'),
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.recalculateLocations();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-rebuild-location-index-for-current-book',
    name: t('command_palette.rebuild_location_index_for_current_book'),
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) void view.rebuildLocsCache();
      return true;
    },
  });

  plugin.addCommand({
    id: 'orbis-toggle-debug-log',
    name: t('debug_panel.toggle'),
    checkCallback: (checking) => {
      const view = plugin.getActiveView();
      if (!view) return false;
      if (!checking) view.toggleDebugLog();
      return true;
    },
  });

  addTestFixturesCommand(plugin);
  plugin.addCommand({
    id: 'orbis-toggle-debug-button',
    name: t('command_palette.toggle_debug_button'),
    callback: () => {
      // Stored beside the device: no settings save, nothing to publish. Books and the Library both carry the chip.
      setDeviceSetting('showDebugButton', !deviceSetting('showDebugButton'));
      plugin.refreshViews();
      refreshLibraryViews(plugin);
    },
  });

  // No book needed: the line that matters may come from the Library, a dialog or startup, and this device's note is
  // the one log that survives the app being force-closed.
  plugin.addCommand({
    id: 'orbis-toggle-writing-the-debug-log-to-a-note',
    name: t('command_palette.toggle_writing_the_debug_log_to_a_note'),
    callback: () => toggleNoteWriting(plugin.app),
  });
}
