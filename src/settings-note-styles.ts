// The Note styles settings page.
//
// The settings tab is one page per screen by design, and this takes that seam at the file level too.
//
// It owns the two pieces of state only this page has — which style is selected, and which template folds are
// open — and asks the tab for the four things it cannot answer itself.

import { App, Setting, setIcon } from 'obsidian';
import { byName } from './by-name';
import { confirmThen } from './ConfirmModal';
import { folderPickerControls } from './folder-picker';
import { t } from './i18n';
import { StyleNameModal } from './StyleNameModal';
import {
  BOOKMARK_LINE_VARIABLES,
  CHAPTER_FILE_VARIABLES,
  DEFAULT_BOOKMARK_LINE_TEMPLATE,
  DEFAULT_CHAPTER_FILE_TEMPLATE,
  DEFAULT_FILE_NAME_TEMPLATE,
  DEFAULT_FOLDER_NAME_TEMPLATE,
  DEFAULT_FRONTMATTER_TEMPLATE,
  DEFAULT_HIGHLIGHT_LINE_TEMPLATE,
  DEFAULT_NOTE_LINE_TEMPLATE,
  DEFAULT_NOTE_STYLE_CONFIG,
  FILE_NAME_VARIABLES,
  FOLDER_NAME_VARIABLES,
  FRONTMATTER_VARIABLES,
  generateNoteStyleId,
  HIGHLIGHT_LINE_VARIABLES,
  IOrbisReaderPlugin,
  NOTE_LINE_VARIABLES,
  NoteStyle,
  type NotesSectionId,
} from './settings';
import { renderReorderList } from './settings-list';
import { logSettings, PLACEHOLDER_HELP, placeholderChips, templateRow } from './settings-rows';
import { isShippedNoteStyle } from './sync/styles';
import { captureFocus, keepScroll } from './ui-utils';

/**
 * What the Note styles page needs from the settings tab.
 *
 * Four: the vault and the plugin's settings, the shared reorder helper (a note style's sections move the way a
 * collection's rules do), and the redraw, because changing a style changes what the rest of the page shows.
 */
export interface NoteStylesPageHost {
  readonly app: App;
  readonly plugin: IOrbisReaderPlugin;
  persistMove<T>(list: T[], from: number, to: number): void;
  renderSettings(): void;
}

/** A content row's template, as the row's description: **Template:** and the template in code style. */
function templateLine(template: string): DocumentFragment {
  const frag = createFragment();
  frag.appendText(`${t('notes_styles_page.template_label')} `);
  frag.createEl('code', { text: template });
  return frag;
}

export class NoteStylesPage {
  constructor(private readonly host: NoteStylesPageHost) {}

  /** Which note-content templates are open, by kind. Its own set: the keys are section ids, and it has to outlive a
   *  repaint for the same reason the dashboards' does — editing a template saves, which redraws the card. */
  private readonly noteTemplatesOpen = new Set<string>();
  private selectedNoteStyleId: string | null = null;

  /**
   * The Marks & notes to Markdown page: note styles and the templates they carry.
   *
   * Stays imperative, and is the largest thing in settings that does — a style selector with create, rename,
   * duplicate and delete, a folder dropdown with its own "+", template textareas with variable-insertion chips,
   * and a section-order list. Every one of those is a control a definition cannot express, and there are enough
   * of them that a page of `render` rows would be the same code with more ceremony.
   */
  buildNoteStylesPage(N: HTMLElement): void {
    const noteStyles = this.host.plugin.settings.noteStyles;

    // Initialize selection: prefer persisted, fall back to default or first
    if (!this.selectedNoteStyleId || !noteStyles.find((s) => s.id === this.selectedNoteStyleId)) {
      this.selectedNoteStyleId = noteStyles.find((s) => s.isDefault)?.id ?? noteStyles[0]?.id ?? null;
    }

    /**
     * ── Style selector row ──────────────────────────────────────────
     *
     * **A real `Setting`, not a row of our own.** Loose content in a settings page is unreachable by keyboard:
     * Obsidian's settings navigation moves between `.setting-item` rows, so a `<select>` and three buttons sitting
     * between two gray boxes are skipped entirely by Tab — reachable only by clicking one first, after which native
     * tabbing takes over and walks them. Being outside a row is the whole problem. Anything that has to be operable
     * in settings belongs in a row.
     */
    /**
     * The page's intro is this row's description rather than a row of its own: a `Setting` with nothing but text in it
     * is a gray box Obsidian counts as a control row, so Tab would stop on a paragraph on the way in.
     *
     * **No name on the row.** "Style" under a page called "Note export styles" is the same word twice, so the heading
     * goes and the word survives where it is still needed: as the dropdown's accessible name.
     */
    const styleRow = new Setting(N).setDesc(t('notes_styles_page.styles_desc_page'));

    /**
     * **An ordinary row: text on the left, controls on the right.** Stacked and left-aligned would read as
     * non-standard beside every other row in settings — core Obsidian has no page that manages a NAMED SET, so there
     * is no pattern to copy, only one to borrow: label left, controls right, like everything else.
     *
     * What makes that fit is the icons. `New / Rename / Delete style` as words is ~250px of right column and would
     * force a stack; `+ ✎ 🗑` is ~110px and sits beside the selector at any width. Obsidian puts `clickable-icon`
     * buttons in its own settings rows (Custom CSS snippets, the plugin lists), and the marks list already uses ✎ and ✕
     * for these same two actions — so the two "named set" managers rhyme instead of each inventing a vocabulary.
     */
    styleRow.controlEl.addClass('orbis-style-controls');

    const noteStyleSel = styleRow.controlEl.createEl('select', { cls: 'dropdown orbis-style-select' });
    noteStyleSel.setAttribute('aria-label', t('notes_styles_page.style'));
    // Keyed, because choosing a style redraws the page into a different shape — a positional path would not find its
    // way back here.
    noteStyleSel.dataset.orbisFocus = 'note-style-select';
    // Sorted by name, the same on every device — see `by-name.ts`. The stored order is whatever each device appended.
    for (const s of byName(noteStyles)) {
      const opt = noteStyleSel.createEl('option', {
        value: s.id,
        text: s.name + (s.isDefault ? t('generate_notes_modal.default') : ''),
      });
      if (s.id === this.selectedNoteStyleId) opt.selected = true;
    }
    noteStyleSel.addEventListener('change', () => {
      this.selectedNoteStyleId = noteStyleSel.value;
      this.host.renderSettings();
    });

    /**
     * The three actions, grouped so they read as acting on the selection beside them rather than on the page — and so
     * they can drop below the selector on a phone, where the row has no width to share (see `.orbis-style-controls`).
     * Created here, before the style is resolved, because Rename and Delete join New in it further down.
     */
    const styleBtns = styleRow.controlEl.createDiv({ cls: 'orbis-style-btn-line' });
    /**
     * An icon button in Obsidian's own settings-row idiom: `clickable-icon`, named by `aria-label`, which is also
     * where its tooltip comes from.
     *
     * **No red on the trash.** A filled destructive button shouts before the reader has done anything, and the plugin
     * answers this question everywhere else with a confirmation instead — deleting a collection, a dashboard, a voice,
     * a mark. Delete asks; nothing about it needs coloring.
     */
    const styleIcon = (icon: string, label: string): HTMLButtonElement => {
      const btn = styleBtns.createEl('button', { cls: 'clickable-icon' });
      setIcon(btn, icon);
      btn.setAttribute('aria-label', label);
      return btn;
    };

    const newNoteStyleBtn = styleIcon('plus', t('action.new'));
    newNoteStyleBtn.addEventListener('click', () => {
      new StyleNameModal(this.host.app, '', t('style_name_modal.new_notes_style'), (name) => {
        void (async () => {
          const newStyle: NoteStyle = {
            id: generateNoteStyleId(),
            name,
            isDefault: noteStyles.length === 0,
            createdAt: Date.now(),
            config: {
              ...DEFAULT_NOTE_STYLE_CONFIG,
              sectionOrder: [...DEFAULT_NOTE_STYLE_CONFIG.sectionOrder],
            },
          };
          noteStyles.push(newStyle);
          await this.host.plugin.saveSettings();
          this.selectedNoteStyleId = newStyle.id;
          this.host.renderSettings();
        })();
      }).open();
    });

    const activeNoteStyle = noteStyles.find((s) => s.id === this.selectedNoteStyleId);

    if (activeNoteStyle) {
      // No "you are editing X, and here is where it is stored" line: the dropdown beside it already says which style
      // is open, and where the plugin keeps its settings is documentation rather than a fact this page has to carry.
      // Rename and Delete belong to the selector, so they share its row — and its button line, beside New.
      const renameNoteBtn = styleIcon('pencil', t('action.rename'));
      renameNoteBtn.addEventListener('click', () => {
        new StyleNameModal(this.host.app, activeNoteStyle.name, t('style_name_modal.rename_style'), (name) => {
          void (async () => {
            activeNoteStyle.name = name;
            await this.host.plugin.saveSettings();
            this.host.renderSettings();
          })();
        }).open();
      });

      /**
       * **Not offered for the default style at all**, rather than offered and disabled.
       *
       * The default is the one the generate dialog opens on, so deleting it would leave the plugin without an answer
       * to "which style?" — and the way out is to make another style the default first, which is a decision, not an
       * error to be reported. Hidden for the same reason the folder row is hidden when it does not apply: a control
       * that cannot be used still asks to be read. It follows that a lone style is never deletable either, since a
       * lone style is the default.
       */
      // And never the style Orbis ships: it is the baseline the others were built from, and nothing reseeds it
      // once other styles exist — `initializeDefaultNoteStyle` only fires on an empty list. The style says so
      // itself, in `isSystem`; duplicating it makes an ordinary style, which is the way to a copy you can delete.
      const deletable = !isShippedNoteStyle(activeNoteStyle) && !activeNoteStyle.isDefault && noteStyles.length > 1;
      const deleteNoteBtn = deletable ? styleIcon('trash', t('action.delete_style')) : null;
      // Asked, not assumed — the same `confirmThen` every other deletion in settings uses. A trash icon is easy to
      // hit, and one click must not remove a style and its templates.
      deleteNoteBtn?.addEventListener('click', () => {
        confirmThen(
          this.host.app,
          {
            title: t('notes_styles_page.delete_style_title'),
            message: t('notes_styles_page.delete_style_confirm', { name: activeNoteStyle.name }),
            // "Delete", not "Delete style": the title above it already names what is going. See `action.delete`.
            confirmText: t('action.delete'),
          },
          () => {
            void (async () => {
              const idx = noteStyles.findIndex((s) => s.id === activeNoteStyle.id);
              if (idx >= 0) noteStyles.splice(idx, 1);
              // No "promote another style to default" step: the default is never deletable, so one always survives.
              this.selectedNoteStyleId = noteStyles.find((s) => s.isDefault)?.id ?? noteStyles[0]?.id ?? null;
              await this.host.plugin.saveSettings();
              this.host.renderSettings();
            })();
          }
        );
      });

      // ── Style editor ──────────────────────────────────────────────
      const saveStyle = async () => {
        await this.host.plugin.saveSettings();
      };
      const editorEl = N.createDiv();

      const renderNoteEditor = () => {
        // Every control on this screen redraws it — Save as changes which rows exist below it, and each content
        // switch re-reads the set — and on its own none of them keeps the keyboard. See `captureFocus`; the controls
        // whose row can move are keyed below, because a path fallback aims at whatever now stands where they stood.
        const restoreFocus = captureFocus(editorEl);
        // And the scroll: emptying this block shortens the page, and toggling a content row near the foot of it would
        // throw the reader back to the top. See `keepScroll`, which every rebuild through `rebuildKeepingFocus` also
        // gets.
        const restoreScroll = keepScroll(editorEl);
        editorEl.empty();

        // Set as default
        new Setting(editorEl)
          .setName(t('notes_styles_page.set_as_default'))
          .setDesc(t('notes_styles_page.default_style_desc'))
          .addToggle((t) =>
            t.setValue(activeNoteStyle.isDefault).onChange(async (v) => {
              if (v) for (const s of noteStyles) s.isDefault = s.id === activeNoteStyle.id;
              else activeNoteStyle.isDefault = false;
              await saveStyle();
              this.host.renderSettings();
            })
          );

        /**
         * **Where the notes go: two rows, as Obsidian does it.** Its own pair is "Default location for new
         * attachments" with an "Attachment folder path" row that appears only when the folder option is chosen — so
         * the reveal is what carries the coupling, and a row that exists only when it is relevant says "these belong
         * together" better than a shared box does. Matching the host reads better than our own tidiness, and each
         * control sits on the right where every other row in settings puts it.
         */
        new Setting(editorEl)
          .setName(t('notes_styles_page.default_folder'))
          .setDesc(t('notes_styles_page.default_folder_desc'))
          .addDropdown((d) => {
            d.selectEl.dataset.orbisFocus = 'note-location';
            d.addOption('book', t('notes_styles_page.default_folder_book'))
              .addOption('folder', t('notes_styles_page.default_folder_folder'))
              .setValue(activeNoteStyle.config.useSameFolder ? 'book' : 'folder')
              .onChange(async (v) => {
                activeNoteStyle.config.useSameFolder = v === 'book';
                syncNotesFolder();
                await saveStyle();
              });
          });

        /**
         * The folder row: which folder, and a way to make one. No description — after "In the folder specified below"
         * a third sentence would say the same thing, and Obsidian's "Attachment folder path" has none either.
         *
         * The select is capped (`.orbis-folder-line`): a dropdown listing every folder in the vault gets wide, and
         * right-aligned at full width it squeezes the name into a sliver and overflows in portrait. Obsidian avoids the
         * problem by using a text field with a suggester, which we cannot: its folder control offers no way to CREATE a
         * folder, hence the dropdown and the "+".
         */
        const folderRow = new Setting(editorEl).setName(t('notes_styles_page.notes_folder'));
        const folderLine = folderRow.controlEl.createDiv({ cls: 'orbis-folder-line' });
        const folderSel = folderPickerControls(folderLine, {
          app: this.host.app,
          focusKey: 'note-folder',
          current: () => activeNoteStyle.config.notePath || '/',
          onPick: (path) => {
            void (async () => {
              activeNoteStyle.config.notePath = path;
              await saveStyle();
              this.host.renderSettings();
            })();
          },
        });
        folderSel.setAttribute('aria-label', t('notes_styles_page.notes_folder'));

        function syncNotesFolder(): void {
          folderRow.settingEl.toggle(!activeNoteStyle?.config.useSameFolder);
        }
        syncNotesFolder();

        /**
         * ── Per-chapter mode ────────────────────────────────────────────────
         *
         * **A dropdown row, where the dialog uses radios.** Two radio rows say more at a glance, and in a settings
         * page they cannot be reached at all: Obsidian navigates `.setting-item` rows, so loose controls between the
         * gray boxes are skipped. A dropdown is what Obsidian itself uses for a two-way choice here ("Default location
         * for new attachments"), and the description of whichever option is chosen keeps the sentence the radios
         * carried — the one thing a bare dropdown would have thrown away.
         */
        new Setting(editorEl)
          .setName(t('generate_notes_modal.save_as'))
          .setDesc(
            activeNoteStyle.config.perChapter
              ? t('generate_notes_modal.per_chapter_desc')
              : t('generate_notes_modal.single_note_desc')
          )
          .addDropdown((d) => {
            d.selectEl.dataset.orbisFocus = 'note-save-as';
            d.addOption('single', t('generate_notes_modal.single_obsidian_note'))
              .addOption('folder', t('generate_notes_modal.book_folder'))
              .setValue(activeNoteStyle.config.perChapter ? 'folder' : 'single')
              .onChange((v) => {
                void (async () => {
                  activeNoteStyle.config.perChapter = v === 'folder';
                  await saveStyle();
                  renderNoteEditor();
                })();
              });
          });

        if (activeNoteStyle.config.perChapter) {
          // Folder name template
          const folderRow = templateRow(
            editorEl,
            t('notes_styles_page.folder_name_template'),
            t('notes_styles_page.chapter_folder_desc')
          );
          const folderInputEl = folderRow.controlEl.createEl('input', { type: 'text', cls: 'orbis-input-full' });
          folderInputEl.value = activeNoteStyle.config.folderNameTemplate ?? DEFAULT_FOLDER_NAME_TEMPLATE;
          folderInputEl.setAttribute('aria-label', t('notes_styles_page.folder_name_template'));
          folderInputEl.placeholder = DEFAULT_FOLDER_NAME_TEMPLATE;
          folderInputEl.addEventListener('change', () => {
            activeNoteStyle.config.folderNameTemplate = folderInputEl.value;
            void saveStyle();
          });
          placeholderChips(folderRow.controlEl, {
            label: t('generate_notes_modal.placeholders'),
            chips: FOLDER_NAME_VARIABLES.map(({ token, labelKey }) => ({ token, tip: t(labelKey) })),
            chipCls: 'orbis-var-chip',
            insert: (token) => {
              const start = folderInputEl.selectionStart ?? folderInputEl.value.length;
              const end = folderInputEl.selectionEnd ?? start;
              folderInputEl.value = folderInputEl.value.slice(0, start) + token + folderInputEl.value.slice(end);
              folderInputEl.selectionStart = folderInputEl.selectionEnd = start + token.length;
              folderInputEl.focus();
              activeNoteStyle.config.folderNameTemplate = folderInputEl.value;
              void saveStyle();
            },
            reset: {
              label: t('generate_notes_modal.reset'),
              onClick: () => {
                folderInputEl.value = DEFAULT_FOLDER_NAME_TEMPLATE;
                activeNoteStyle.config.folderNameTemplate = DEFAULT_FOLDER_NAME_TEMPLATE;
                void saveStyle();
              },
            },
          });

          // Chapter file name template
          const chapterRow = templateRow(
            editorEl,
            t('notes_styles_page.chapter_file_name_template'),
            t('notes_styles_page.md_is_appended_automatically')
          );
          const chapterInputEl = chapterRow.controlEl.createEl('input', { type: 'text', cls: 'orbis-input-full' });
          chapterInputEl.value = activeNoteStyle.config.chapterFileTemplate ?? DEFAULT_CHAPTER_FILE_TEMPLATE;
          chapterInputEl.setAttribute('aria-label', t('notes_styles_page.chapter_file_name_template'));
          chapterInputEl.placeholder = DEFAULT_CHAPTER_FILE_TEMPLATE;
          chapterInputEl.addEventListener('change', () => {
            activeNoteStyle.config.chapterFileTemplate = chapterInputEl.value;
            void saveStyle();
          });
          placeholderChips(chapterRow.controlEl, {
            label: t('generate_notes_modal.placeholders'),
            chips: CHAPTER_FILE_VARIABLES.map(({ token, labelKey }) => ({ token, tip: t(labelKey) })),
            chipCls: 'orbis-var-chip',
            insert: (token) => {
              const start = chapterInputEl.selectionStart ?? chapterInputEl.value.length;
              const end = chapterInputEl.selectionEnd ?? start;
              chapterInputEl.value = chapterInputEl.value.slice(0, start) + token + chapterInputEl.value.slice(end);
              chapterInputEl.selectionStart = chapterInputEl.selectionEnd = start + token.length;
              chapterInputEl.focus();
              activeNoteStyle.config.chapterFileTemplate = chapterInputEl.value;
              void saveStyle();
            },
            reset: {
              label: t('generate_notes_modal.reset'),
              onClick: () => {
                chapterInputEl.value = DEFAULT_CHAPTER_FILE_TEMPLATE;
                activeNoteStyle.config.chapterFileTemplate = DEFAULT_CHAPTER_FILE_TEMPLATE;
                void saveStyle();
              },
            },
          });
        }

        // File name template — single-note mode only. In Book-folder mode the file names
        // come from folderNameTemplate + chapterFileTemplate + a hardcoded MOC name, so
        // fileNameTemplate is unused there and the field is hidden.
        if (!activeNoteStyle.config.perChapter) {
          const fnRow = templateRow(
            editorEl,
            t('notes_styles_page.file_name_template'),
            t('notes_styles_page.md_is_appended_automatically')
          );
          const fnInputEl = fnRow.controlEl.createEl('input', { type: 'text', cls: 'orbis-input-full' });
          fnInputEl.value = activeNoteStyle.config.fileNameTemplate ?? DEFAULT_FILE_NAME_TEMPLATE;
          fnInputEl.setAttribute('aria-label', t('notes_styles_page.file_name_template'));
          // An emptied template means the default one (`resolveFilePath`), so the field shows it rather than nothing —
          // the same hint the dialogs' name fields give. The folder and chapter templates above do the same.
          fnInputEl.placeholder = DEFAULT_FILE_NAME_TEMPLATE;
          fnInputEl.addEventListener('change', () => {
            activeNoteStyle.config.fileNameTemplate = fnInputEl.value;
            void saveStyle();
          });
          placeholderChips(fnRow.controlEl, {
            label: t('generate_notes_modal.placeholders'),
            chips: FILE_NAME_VARIABLES.map(({ token, labelKey }) => ({ token, tip: t(labelKey) })),
            chipCls: 'orbis-var-chip',
            insert: (token) => {
              const start = fnInputEl.selectionStart ?? fnInputEl.value.length;
              const end = fnInputEl.selectionEnd ?? start;
              fnInputEl.value = fnInputEl.value.slice(0, start) + token + fnInputEl.value.slice(end);
              fnInputEl.selectionStart = fnInputEl.selectionEnd = start + token.length;
              fnInputEl.focus();
              activeNoteStyle.config.fileNameTemplate = fnInputEl.value;
              void saveStyle();
            },
            reset: {
              label: t('generate_notes_modal.reset'),
              onClick: () => {
                fnInputEl.value = DEFAULT_FILE_NAME_TEMPLATE;
                activeNoteStyle.config.fileNameTemplate = DEFAULT_FILE_NAME_TEMPLATE;
                void saveStyle();
              },
            },
          });
        }

        // The frontmatter template sits with the naming templates above, not down among the content rows: it
        // describes every note this style writes, where everything below chooses what goes IN one.
        // Frontmatter template
        // One row: the heading, the box and its tokens. A `setHeading()` row above a box above a chip line was three
        // gray boxes for one field.
        const fmRow = templateRow(
          editorEl,
          t('generate_notes_modal.frontmatter_template'),
          t('notes_styles_page.frontmatter_desc')
        );
        const tmplArea = fmRow.controlEl.createEl('textarea', {
          cls: 'orbis-tmpl-area',
          attr: { 'aria-label': t('generate_notes_modal.frontmatter_template') },
        });
        tmplArea.rows = 12;
        tmplArea.value = activeNoteStyle.config.frontmatterTemplate;
        tmplArea.addEventListener('change', () => {
          activeNoteStyle.config.frontmatterTemplate = tmplArea.value;
          void saveStyle();
        });

        placeholderChips(fmRow.controlEl, {
          label: t('generate_notes_modal.placeholders'),
          chips: FRONTMATTER_VARIABLES.map(({ token, labelKey }) => ({ token, tip: t(labelKey) })),
          chipCls: 'orbis-var-chip-2',
          insert: (token) => {
            const start = tmplArea.selectionStart ?? tmplArea.value.length;
            const end = tmplArea.selectionEnd ?? start;
            tmplArea.value = tmplArea.value.slice(0, start) + token + tmplArea.value.slice(end);
            tmplArea.selectionStart = tmplArea.selectionEnd = start + token.length;
            tmplArea.focus();
            tmplArea.dispatchEvent(new Event('change'));
          },
          reset: {
            label: t('notes_styles_page.reset_to_default'),
            onClick: () => {
              tmplArea.value = DEFAULT_FRONTMATTER_TEMPLATE;
              activeNoteStyle.config.frontmatterTemplate = DEFAULT_FRONTMATTER_TEMPLATE;
              void saveStyle();
            },
          },
        });

        // The line templates. One per kind, because a note has a quoted passage and a highlight does not.
        // Single-line inputs rather than the frontmatter template's textarea: these ARE one line, and a
        // 12-row box would invite a newline that the renderer would faithfully export.
        //
        // Rendered into whatever host it is given — each kind's row opens into its own, so the template sits with the
        // kind it belongs to, rather than in a card of its own below the list, two blocks from the row it is about.
        // Nor is it shown or hidden with the switch, which would move everything under it when a kind is turned off.
        const lineTemplate = (
          host: HTMLElement,
          label: string,
          get: () => string,
          set: (v: string) => void,
          reset: string,
          vars: readonly string[]
        ): void => {
          const setting = templateRow(host, label);
          const input = setting.controlEl.createEl('input', { type: 'text', cls: 'orbis-input-full' });
          input.value = get();
          input.setAttribute('aria-label', label);
          input.addEventListener('change', () => {
            set(input.value);
            void saveStyle();
          });
          placeholderChips(setting.controlEl, {
            label: t('generate_notes_modal.placeholders'),
            chips: vars.map((v) => ({ token: v })),
            chipCls: 'orbis-var-chip-2',
            insert: (token) => {
              const start = input.selectionStart ?? input.value.length;
              const end = input.selectionEnd ?? start;
              input.value = input.value.slice(0, start) + token + input.value.slice(end);
              input.selectionStart = input.selectionEnd = start + token.length;
              input.focus();
              input.dispatchEvent(new Event('change'));
            },
            reset: {
              label: t('notes_styles_page.reset_to_default'),
              onClick: () => {
                input.value = reset;
                set(reset);
                void saveStyle();
              },
            },
            help: vars.map((v) => ({ label: v, text: t(PLACEHOLDER_HELP[v]) })),
            note: t('notes_styles_page.ph_empty_note'),
          });
        };

        // Content
        const defContentHeading = new Setting(editorEl).setName(t('notes_styles_page.note_content')).setHeading();
        defContentHeading.settingEl.addClass('orbis-subheading');

        /**
         * **The last one on locks.** A style with every kind switched off writes an empty note, so whichever switch
         * is the only one left on cannot be switched off — the rule the Look-up sections list already follows, said
         * in the row rather than shown by dimming alone.
         *
         * **Exactly one, not none.** A stored style can have everything off, and locking on "none
         * are on" would leave no way back: nothing is locked in that state, and the reader turns one on.
         *
         * The count spans two components — *Chapter headings* is a row of its own because it is not a section, while
         * the three kinds live in the card below — so it is computed here, over whatever this mode actually offers.
         *
         * **A book folder has no lock.** With every kind off it writes one chapter note per chapter, each with its
         * heading and its link into the book — for writing your own notes along the book's structure.
         */
        const headingsOffered = !activeNoteStyle.config.perChapter;
        const onCount =
          (headingsOffered && activeNoteStyle.config.includeChapterHeadings ? 1 : 0) +
          (activeNoteStyle.config.includeBookmarks ? 1 : 0) +
          (activeNoteStyle.config.includeHighlights ? 1 : 0) +
          (activeNoteStyle.config.includeNotes ? 1 : 0);
        /** Whether this switch is the only thing keeping the note from being empty. */
        const locked = (on: boolean): boolean => headingsOffered && on && onCount === 1;

        /**
         * **A toggle row per kind, not a grid of checkboxes.** A grid is compact and unreachable — see the note on
         * the Save-as dropdown above. One row each is what every other boolean in settings looks like, and the label
         * becomes the row's name rather than a word beside a box.
         */
        const mkCheck = (label: string, desc: string, get: () => boolean, set: (v: boolean) => void) => {
          const row = new Setting(editorEl).setName(label);
          // The lock message takes the description slot when it applies: a switch that will not move needs explaining
          // more than a switch that will.
          row.setDesc(locked(get()) ? t('notes_styles_page.content_min_one') : desc);
          row.addToggle((tg) =>
            tg
              .setValue(get())
              .setDisabled(locked(get()))
              .onChange((v) => {
                set(v);
                void (async () => {
                  await saveStyle();
                  renderNoteEditor();
                })();
              })
          );
        };
        if (headingsOffered) {
          mkCheck(
            t('generate_notes_modal.chapter_headings'),
            t('notes_styles_page.chapter_headings_desc'),
            () => activeNoteStyle.config.includeChapterHeadings,
            (v) => {
              activeNoteStyle.config.includeChapterHeadings = v;
            }
          );
        }
        /**
         * **What a note holds and the order it appears in, in one list.**
         *
         * Two blocks — three switches here, and a *Section order* list further down naming the same three kinds
         * again — would have nothing on screen connecting them: switching bookmarks off would leave a bookmarks row in
         * the order list, and deciding what a note contains would mean answering in two places. The Look-up page's
         * sections list does it as one card — the switch says whether, the arrows say where — and this is the same
         * component doing the same job.
         */
        /** Each kind: its switch, and the one-line template that renders it. */
        interface Kind {
          label: string;
          get: () => boolean;
          set: (v: boolean) => void;
          /** The template row's own name, which says what it is a template FOR. */
          templateLabel: string;
          template: { get: () => string; set: (v: string) => void; reset: string; vars: readonly string[] };
        }
        const kinds: Record<NotesSectionId, Kind> = {
          bookmarks: {
            label: t('annotations_tab.bookmarks'),
            get: () => activeNoteStyle.config.includeBookmarks,
            set: (v) => {
              activeNoteStyle.config.includeBookmarks = v;
            },
            templateLabel: t('notes_styles_page.bookmark_line'),
            template: {
              get: () => activeNoteStyle.config.bookmarkLineTemplate,
              set: (v) => {
                activeNoteStyle.config.bookmarkLineTemplate = v;
              },
              reset: DEFAULT_BOOKMARK_LINE_TEMPLATE,
              vars: BOOKMARK_LINE_VARIABLES,
            },
          },
          highlights: {
            label: t('annotations_tab.passage_selections'),
            get: () => activeNoteStyle.config.includeHighlights,
            set: (v) => {
              activeNoteStyle.config.includeHighlights = v;
            },
            templateLabel: t('notes_styles_page.highlight_line'),
            template: {
              get: () => activeNoteStyle.config.highlightLineTemplate,
              set: (v) => {
                activeNoteStyle.config.highlightLineTemplate = v;
              },
              reset: DEFAULT_HIGHLIGHT_LINE_TEMPLATE,
              vars: HIGHLIGHT_LINE_VARIABLES,
            },
          },
          notes: {
            label: t('annotations_tab.notes'),
            get: () => activeNoteStyle.config.includeNotes,
            set: (v) => {
              activeNoteStyle.config.includeNotes = v;
            },
            templateLabel: t('notes_styles_page.note_line'),
            template: {
              get: () => activeNoteStyle.config.noteLineTemplate,
              set: (v) => {
                activeNoteStyle.config.noteLineTemplate = v;
              },
              reset: DEFAULT_NOTE_LINE_TEMPLATE,
              vars: NOTE_LINE_VARIABLES,
            },
          },
        };
        renderReorderList(editorEl, {
          desc: t('notes_styles_page.content_order_desc'),
          rows: activeNoteStyle.config.sectionOrder.map((id) => ({
            key: id,
            name: kinds[id].label,
            /**
             * The template itself, as a line under the name — the fold holds the EDITOR, not the answer. A chevron
             * is less findable than a card on the page, so hiding the template as well as its editor would trade
             * space for something worth keeping: what this row is going to write.
             *
             * The lock message wins when it applies: it explains a switch that will not move, which is the more
             * pressing thing to say, and the template is one keystroke away inside the fold.
             *
             * **Labeled, and set as code.** Bare, `- {{mark}}"{{selection}}" — {{link}}` reads as a rendering bug
             * rather than a template.
             */
            desc: locked(kinds[id].get())
              ? t('notes_styles_page.content_min_one')
              : templateLine(kinds[id].template.get()),
            /**
             * **Open whether the kind is on or off.** The switch decides whether a note INCLUDES this kind; the
             * template is how it would be written, and setting one up before turning the kind on is a reasonable
             * order to work in.
             */
            expand: {
              label: t('notes_styles_page.show_template'),
              collapseLabel: t('notes_styles_page.hide_template'),
              render: (body: HTMLElement) => {
                const k = kinds[id];
                lineTemplate(body, k.templateLabel, k.template.get, k.template.set, k.template.reset, k.template.vars);
              },
            },
            toggle: {
              value: kinds[id].get(),
              disabled: locked(kinds[id].get()),
              onChange: (on) => {
                kinds[id].set(on);
                void (async () => {
                  await saveStyle();
                  // The lock moves with this: whichever switch is now the only one on cannot be turned off.
                  renderNoteEditor();
                })();
              },
            },
          })),
          expanded: this.noteTemplatesOpen,
          move: (from, to) => this.host.persistMove(activeNoteStyle.config.sectionOrder, from, to),
          log: (msg) => logSettings(this.host, `note sections ${msg}`),
        });

        const anyContent =
          activeNoteStyle.config.includeBookmarks ||
          activeNoteStyle.config.includeHighlights ||
          activeNoteStyle.config.includeNotes;

        // Chapter scope / chapter files scope. Only while a type is on, for either shape: with none, no chapter can hold
        // saved content, so every chapter is written whatever the toggle says (`chapterFilesToWrite`) and the row would
        // be a switch that changes nothing.
        if (activeNoteStyle.config.perChapter && anyContent) {
          // Both scope choices are dropdown ROWS for the same reason as Save as: a heading plus two loose radios put
          // the choice outside the tab order entirely.
          /**
           * **One toggle, not a two-option picker.** "All chapters" against "Only chapters with saved content" is the
           * same fact stated from both ends — one bit of information, which a checkbox carries without needing either
           * label.
           */
          new Setting(editorEl)
            .setName(t('notes_styles_page.include_chapters_without_annotations'))
            .setDesc(t('notes_styles_page.include_chapters_without_annotations_desc'))
            .addToggle((tg) =>
              tg.setValue((activeNoteStyle.config.chapterFilesScope ?? 'all') === 'all').onChange((v) => {
                activeNoteStyle.config.chapterFilesScope = v ? 'all' : 'with-content';
                void saveStyle();
              })
            );
        } else if (anyContent && activeNoteStyle.config.includeChapterHeadings) {
          // Only while headings are ON: this decides which chapters get one, so with headings off it would change
          // nothing.
          new Setting(editorEl)
            .setName(t('notes_styles_page.include_chapters_without_annotations'))
            .setDesc(t('notes_styles_page.include_chapters_without_annotations_desc'))
            .addToggle((tg) =>
              tg.setValue(activeNoteStyle.config.chapterScope === 'all').onChange((v) => {
                activeNoteStyle.config.chapterScope = v ? 'all' : 'with-content';
                void saveStyle();
              })
            );
        }

        restoreScroll();
        restoreFocus();
      };

      renderNoteEditor();
    }
  }
}
