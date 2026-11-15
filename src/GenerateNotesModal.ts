import { App, Notice, normalizePath, Setting } from 'obsidian';
import { byName } from './by-name';
import { actionButton, actionRow, choiceGroup, pickList, pickListHeader, pickRow } from './controls';
import { destinationGrid, type FilingState } from './folder-picker';
import { t } from './i18n';
import { isoToday } from './library/dates';
import { chosenMarkNames, filterNotesDataByMarks, marksInUse, markUsage } from './mark-filter';
import { renderMarkChips, renderMarkChoiceList } from './mark-filter-ui';
import { FileDiffModal, PerChapterMergeModal } from './NotesDiffModal';
import { openOrbisDialog } from './OrbisModal';
import type { OrbisReaderView } from './OrbisReaderView';
import { type OutsideTarget, outsideButton, outsideRoute, sendOutside } from './outside-vault';
import { NotesFileSet } from './progress';
import { buildAnnotationBuckets, buildNotesMarkdown } from './reader/export-format';
import {
  DEFAULT_FILE_NAME_TEMPLATE,
  DEFAULT_FOLDER_NAME_TEMPLATE,
  DEFAULT_NOTE_STYLE_CONFIG,
  NoteStyle,
  type NotesSectionId,
} from './settings';
import { renderReorderList } from './settings-list';
import { annotationsSvg } from './system-glyphs';
import { selectedBranchCount, type TocBranch, topLevelChapters } from './toc-utils';
import {
  answerFold,
  createOrbisPopup,
  type OrbisPopupHost,
  onActivate,
  rebuildKeepingFocus,
  setSvgIcon,
} from './ui-utils';
import { exportFileName } from './vault-names';
import { baseNameOf, folderOf, joinVaultPath } from './vault-path';

/** The one type the save dialog offers. The format's own name, which is not translated. */
const MD_FILTER = { name: 'Markdown', extension: 'md' };

/** The chapters a run will write — see `GenerateNotesModal.chapterChoice`. */
interface ChapterChoice {
  branches: TocBranch[];
  heldIn: (branch: TocBranch) => number;
  ruleScope: 'all' | 'with-content';
  chosen: ReadonlySet<string>;
}

function resolveFileName(
  template: string,
  ctx: { title: string; author: string; filename: string; style: string }
): string {
  const today = isoToday();
  const name = template
    .replace(/\{\{title\}\}/g, ctx.title || ctx.filename)
    .replace(/\{\{author\}\}/g, ctx.author)
    .replace(/\{\{filename\}\}/g, ctx.filename)
    .replace(/\{\{style\}\}/g, ctx.style)
    .replace(/\{\{today\}\}/g, today);
  return exportFileName(name, `${ctx.filename} Notes`);
}

function resolveFolderName(
  template: string,
  ctx: { title: string; author: string; filename: string; style: string }
): string {
  const today = isoToday();
  const name = template
    .replace(/\{\{title\}\}/g, ctx.title || ctx.filename)
    .replace(/\{\{author\}\}/g, ctx.author)
    .replace(/\{\{filename\}\}/g, ctx.filename)
    .replace(/\{\{style\}\}/g, ctx.style)
    .replace(/\{\{today\}\}/g, today);
  return exportFileName(name, `${ctx.filename} Notes`);
}

function findUnusedPath(app: App, basePath: string): string {
  const withoutExt = basePath.endsWith('.md') ? basePath.slice(0, -3) : basePath;
  if (!app.vault.getAbstractFileByPath(normalizePath(`${withoutExt}.md`))) return `${withoutExt}.md`;
  let n = 1;
  while (app.vault.getAbstractFileByPath(normalizePath(`${withoutExt}-${n}.md`))) n++;
  return `${withoutExt}-${n}.md`;
}

function findUnusedFolderBase(app: App, folderPath: string): string {
  if (!app.vault.getAbstractFileByPath(normalizePath(folderPath))) return folderPath;
  let n = 1;
  while (
    app.vault.getAbstractFileByPath(normalizePath(`${folderPath}-${n}`)) ||
    app.vault.getAbstractFileByPath(normalizePath(`${folderPath}-${n}.md`))
  )
    n++;
  return `${folderPath}-${n}`;
}

export interface PickerEntry {
  label: string;
  sublabel: string;
  tag?: string; // translated, display-only — do not compare against for sorting/logic
  isCurrentChapter?: boolean;
  openPath: string; // vault path to open (chapter file or MOC or single file)
  set: NotesFileSet;
}

export class NotesFilePickerModal {
  constructor(
    private host: OrbisPopupHost,
    private entries: PickerEntry[],
    private onPick: (entry: PickerEntry) => void
  ) {}

  open(): void {
    const { popupEl, close } = createOrbisPopup(this.host, {
      title: t('pane_menu.open_notes'),
      dismissOnOutsideClick: true,
      desktopWidth: '420px',
      mobileFillHeight: true,
    });
    popupEl.createEl('p', {
      text: t('notes_file_picker_modal.prompt'),
      cls: 'orbis-open-notes-desc',
    });

    for (const entry of this.entries) {
      const row = popupEl.createDiv({ cls: 'orbis-open-notes-row' });
      const nameRow = row.createDiv({ cls: 'orbis-open-notes-name-row' });
      nameRow.createDiv({ text: entry.label, cls: 'orbis-open-notes-name' });
      if (entry.tag) {
        nameRow.createSpan({ text: entry.tag, cls: 'orbis-open-notes-tag' });
      }
      const meta = row.createDiv({ cls: 'orbis-open-notes-meta' });
      meta.textContent = entry.sublabel;
      onActivate(row, () => {
        close();
        this.onPick(entry);
      });
    }

    // Hand-built button — Setting's own addButton() wraps it in a full
    // .setting-item row (padding/background meant for a label+control
    // settings row), which reads as an out-of-place gray box with no label
    // to its left in a compact popup like this one.
    const btnRow = popupEl.createDiv();
    Object.assign(btnRow.style, { display: 'flex', justifyContent: 'flex-end', marginTop: '8px' });
    const cancelBtn = btnRow.createEl('button', { text: t('action.cancel') });
    cancelBtn.addEventListener('click', () => close());
  }
}

export class GenerateNotesModal {
  private config: NoteStyle['config'];
  private selectedStyleId: string;
  private filePath: string;
  private folderPath: string;
  private readonly advancedFold = { open: false };
  /**
   * Whether the destination fold is open, held on the instance because `render()` rebuilds the whole popup — a
   * fresh `<details>` is a closed one, so without this, changing the file name would shut the form being typed
   * into. The same reason the PDF and EPUB dialogs hold theirs.
   */
  private readonly filingFold: FilingState = { open: false };
  /**
   * Which marks this run is narrowed to, and the fold's open state.
   *
   * **Per run, and deliberately not remembered.** It is not part of the note style — a style travels between books
   * and devices, while a mark id belongs to one book's copy of a preset, so a stored one would resolve on the book
   * it was chosen from and silently match nothing on the next. It is not remembered across openings either: a
   * filter left on from last week, quietly producing a partial export, is worse than picking it again. A fresh
   * instance per open is what makes both true, so there is nothing to reset.
   */
  private readonly markFilter = new Set<string>();
  private readonly markFold = { open: false };
  /** The chapter fold's open state and scroll, and the hand-made selection — `null` follows the style's rule. */
  private readonly chaptersFold = { open: false, scroll: 0 };
  private chapterPick: Set<string> | null = null;
  /**
   * What to do about a file or folder that is already there.
   *
   * **On the instance, because it outlives a redraw.** As a local in `build()`, every control that repaints this
   * dialog — any content switch, the mark filter — would quietly put it back to *Merge*. Choose *Replace*, change
   * one more thing, and the run would merge: a destructive choice silently un-made, with the radio showing the
   * answer the reader had just given until they looked again. The open-fold flags beside this are here for exactly
   * the same reason.
   */
  private existingAction: 'merge' | 'replace' | 'new-version' = 'merge';
  private outerPopupEl: HTMLElement | null = null;
  /** The action row, outside the scrolling body so it cannot be scrolled away. Emptied and rebuilt by `build`. */
  private genFooterEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private closePopup: (() => void) | null = null;
  private repositionPopup: (() => void) | null = null;

  constructor(
    private app: App,
    private view: OrbisReaderView
  ) {
    const styles = view.plugin.settings.noteStyles;
    const def = styles.find((s) => s.isDefault) ?? styles[0];
    this.selectedStyleId = def?.id ?? '';
    this.config = def
      ? { ...def.config, sectionOrder: [...def.config.sectionOrder] }
      : { ...DEFAULT_NOTE_STYLE_CONFIG, sectionOrder: [...DEFAULT_NOTE_STYLE_CONFIG.sectionOrder] };
    this.filePath = this.resolveFilePath();
    this.folderPath = this.resolveFolderPath();
  }

  private baseFolder(): string {
    const file = this.view.currentFile;
    if (!file) return '/';
    let folder = this.config.useSameFolder ? (file.parent?.path ?? '/') : this.config.notePath || '/';
    if (folder.length > 1 && folder.endsWith('/')) folder = folder.slice(0, -1);
    return folder;
  }

  /**
   * The folder half of the path in play, and the name half without its extension.
   *
   * **The dialog stores whole paths** — everything downstream reads `filePath` and `folderPath` — but edits them as
   * two halves, so a folder is picked rather than typed, as everywhere else in the plugin. Splitting them here rather
   * than in the state keeps the split to the controls: the two halves are cut apart to draw the pair and joined again
   * on every edit.
   *
   * The cut is at the LAST separator, so a book whose name contains one (`Vol. 2 of 3`) keeps it in the name.
   */
  private currentFolder(): string {
    return folderOf(this.config.perChapter ? this.folderPath : this.filePath);
  }

  private currentName(): string {
    return this.config.perChapter ? baseNameOf(this.folderPath) : baseNameOf(this.filePath, '.md');
  }

  /** The name the style gives this book in the current format — what an emptied name field stands for. */
  private defaultName(): string {
    return this.config.perChapter ? baseNameOf(this.resolveFolderPath()) : baseNameOf(this.resolveFilePath(), '.md');
  }

  /**
   * Put the two halves back together into whichever path the format uses — the name cleaned as every export's is
   * (`exportFileName`). The field never hands over an empty name (`destinationGrid`), so neither path is emptied.
   */
  private setPath(folder: string, typed: string): void {
    const name = exportFileName(typed, '');
    if (this.config.perChapter) this.folderPath = joinVaultPath(folder, name);
    else this.filePath = joinVaultPath(folder, name, '.md');
  }

  private resolveFilePath(): string {
    const file = this.view.currentFile;
    if (!file) return '';
    const folder = this.baseFolder();
    const prefix = folder === '/' ? '' : `${folder}/`;
    const styleName = this.view.plugin.settings.noteStyles.find((s) => s.id === this.selectedStyleId)?.name ?? '';
    const fileName = resolveFileName(this.config.fileNameTemplate?.trim() || DEFAULT_FILE_NAME_TEMPLATE, {
      title: this.view.bookMeta.title,
      author: this.view.bookMeta.author,
      filename: file.basename,
      style: styleName,
    });
    return `${prefix}${fileName}.md`;
  }

  private resolveFolderPath(): string {
    const file = this.view.currentFile;
    if (!file) return '';
    const folder = this.baseFolder();
    const prefix = folder === '/' ? '' : `${folder}/`;
    const styleName = this.view.plugin.settings.noteStyles.find((s) => s.id === this.selectedStyleId)?.name ?? '';
    const folderName = resolveFolderName(this.config.folderNameTemplate?.trim() || DEFAULT_FOLDER_NAME_TEMPLATE, {
      title: this.view.bookMeta.title,
      author: this.view.bookMeta.author,
      filename: file.basename,
      style: styleName,
    });
    return `${prefix}${folderName}`;
  }

  open(): void {
    const { popupEl, close, reposition } = createOrbisPopup(this.view, {
      scrollsInside: true, // the buttons sit outside the scroll region — see below
      title: t('generate_notes_modal.title'),
      icon: annotationsSvg(16),
      dismissOnOutsideClick: false,
      desktopWidth: '460px',
      mobileMaxWidth: 420,
      mobileFillHeight: true,
      onClose: () => {
        this.outerPopupEl = null;
        this.bodyEl = null;
        this.genFooterEl = null;
        this.closePopup = null;
        this.repositionPopup = null;
      },
    });
    this.closePopup = close;
    this.repositionPopup = reposition;
    this.outerPopupEl = popupEl;
    /**
     * **The buttons sit outside the scroll region.**
     *
     * This dialog is the tallest in the plugin with *Advanced* open — a frontmatter box, a chip wall, a content list
     * and three conflict options — and on a phone the popup scrolls. With Cancel and Save at the end of the scrolling
     * content, the way to reach them would be to scroll past everything, and on Android they would simply not be on
     * screen. So the popup `scrollsInside`: the content scrolls inside it and a footer holds its ground, the same
     * shape the recordings dialog uses.
     */
    // `orbis-popup-scroll` as well as its own class: that is the name `createOrbisPopup` looks for when it
    // reserves the keyboard's share, and this element is the thing that scrolls. Without it the padding would
    // land on the popup — which does not scroll here, since the footer holds its own ground beside this body.
    this.bodyEl = popupEl.createDiv({ cls: 'orbis-popup-scroll orbis-gen-content' });
    this.genFooterEl = actionRow(popupEl, { placement: 'footer' });
    this.render();
  }

  close(): void {
    this.closePopup?.();
  }

  /**
   * Which chapters this run covers: a rule, and a list to depart from it with.
   *
   * **The same pair as Save as PDF, deliberately.** A scope dropdown states the rule and the checklist below it is
   * how you leave the rule behind — ticking anything makes the selection `custom`, so the dropdown stops claiming
   * something it no longer decides. The bulk buttons act on the rows as they stand, which is a different thing from
   * the rule and is why both exist.
   *
   * **The custom set lives on the dialog, not in the style.** `chapterScope` and `chapterFilesScope` are the style's
   * standing answer and travel between books; a list of this book's contents hrefs cannot. `null` means "follow the
   * rule", which is what a run starts on and what choosing a rule puts it back to.
   */
  /**
   * The chapters this run will write: the rows of the contents page, what each holds, and the set chosen — the
   * reader's own pick, or the style's rule when there is none. Null for a book with fewer than two rows, which has
   * no list to choose from and so can never choose nothing.
   *
   * **One answer for the Chapters summary and for Save**, so the dialog cannot read "0 of 5" with Save enabled.
   */
  private chapterChoice(anyContent: boolean): ChapterChoice | null {
    const data = this.view.notesData();
    /**
     * **The contents page's top level, each row owning its subtree** — see `topLevelChapters` for why the rows are
     * documents rather than every entry at every depth.
     *
     * Ticking one has to take everything under it, and the reason is local to this dialog: an annotation is filed
     * under foliate's DEEPEST matching entry, so a row naming only its own href would tick "Roadmap" and match
     * none of the notes taken under its phases. `chapterPick` still holds hrefs at every depth, so nothing
     * downstream changes.
     */
    const branches = topLevelChapters(data.tocItems ?? []);
    // Nothing to pick between: a book with no contents page has one implicit chapter, and a list of one is a
    // control that decides nothing.
    if (branches.length < 2) return null;
    /**
     * How much each chapter carries, UNDER the mark filter — so narrowing to one mark re-answers "only the ones
     * with content" and re-counts every row, exactly as it does in the PDF dialog.
     *
     * Summed over the subtree, because that is what the row stands for: a document whose own preamble holds
     * nothing but whose sections hold forty notes is not an empty chapter.
     */
    const buckets = buildAnnotationBuckets(this.config, filterNotesDataByMarks(data, this.markFilter));
    const held = (href: string): number => {
      const b = buckets.get(href);
      return b ? b.bookmarks.length + b.highlights.length + b.notes.length : 0;
    };
    const heldIn = (branch: TocBranch): number => branch.hrefs.reduce((sum, h) => sum + held(h), 0);
    /**
     * The style's rule — every chapter, or the ones with content. With no content kinds on there is nothing to have,
     * so the rule is every chapter whatever the style says, and the dropdown below does not offer the other.
     */
    const ruleScope =
      anyContent &&
      (this.config.perChapter ? this.config.chapterFilesScope : this.config.chapterScope) === 'with-content'
        ? 'with-content'
        : 'all';
    /** The rule's answer, for a run that has not departed from it. Whole subtrees, never a bare head. */
    const byRule = (): Set<string> =>
      new Set(branches.filter((b) => ruleScope === 'all' || heldIn(b) > 0).flatMap((b) => b.hrefs));
    return { branches, heldIn, ruleScope, chosen: this.chapterPick ?? byRule() };
  }

  private renderChapterPicker(contentEl: HTMLElement, choice: ChapterChoice | null, anyContent: boolean): void {
    if (!choice) return;
    const { branches, heldIn, ruleScope, chosen } = choice;
    const withContent = branches.filter((b) => heldIn(b) > 0).length;
    /**
     * A row is ticked when its own href is in the set.
     *
     * Sufficient because selection only ever moves whole subtrees: the head is present exactly when the branch
     * is. Testing "any descendant" instead would report a document as chosen on the strength of a leftover.
     */
    const picked = (branch: TocBranch): boolean => chosen.has(branch.href);
    const pickedCount = (): number => selectedBranchCount(branches, chosen);
    const scopeValue = this.chapterPick ? 'custom' : ruleScope;

    const { body, paint } = answerFold(contentEl, {
      key: 'note-chapters',
      label: t('marks_pdf.chapters'),
      // Counted in CHAPTERS, not hrefs: `chosen` holds a subtree per ticked row, and a count of hrefs would be
      // reporting an implementation detail at somebody who ticked nine documents.
      value: () => t('marks_pdf.chapters_value', { n: String(pickedCount()), total: String(branches.length) }),
      open: this.chaptersFold,
      // The list brings `.orbis-list-box` with it — see `bare`.
      bare: true,
      onToggle: () => this.repositionPopup?.(),
    });

    /**
     * **No visible label: the fold above it is the label.** Named here as well, the word "Chapters" would appear twice
     * three lines apart — as the fold's header and again as this row's name. The dropdown keeps an accessible name,
     * since a control announced as nothing is a control a screen reader cannot use.
     */
    const scopeRow = new Setting(body).addDropdown((d) => {
      d.selectEl.dataset.orbisFocus = 'note-chapter-scope';
      d.selectEl.setAttribute('aria-label', t('marks_pdf.chapters'));
      d.addOption('all', t('marks_pdf.chapters_all', { n: String(branches.length) }));
      // Only where it means something: with no content kinds switched on, "the ones with content" is every chapter.
      if (anyContent)
        d.addOption('with-content', t('generate_notes_modal.chapters_with_content', { n: String(withContent) }));
      if (scopeValue === 'custom') d.addOption('custom', t('marks_pdf.chapters_custom', { n: String(pickedCount()) }));
      d.setValue(scopeValue).onChange((v) => {
        // Choosing a rule discards the hand-made selection, which is what "follow the rule again" means.
        this.chapterPick = null;
        const next = v === 'with-content' ? 'with-content' : 'all';
        if (this.config.perChapter) this.config.chapterFilesScope = next;
        else this.config.chapterScope = next;
        this.render();
      });
    });
    scopeRow.settingEl.addClass('orbis-setting-stacked');

    const setAll = (next: (wasOn: boolean) => boolean): void => {
      this.chapterPick = new Set(branches.filter((b) => next(picked(b))).flatMap((b) => b.hrefs));
      this.render();
    };
    const box = body.createDiv({ cls: 'orbis-list-box' });
    pickListHeader(box, {
      onSelectAll: () => setAll(() => true),
      onClear: () => setAll(() => false),
      onInvert: () => setAll((on) => !on),
    });
    const list = pickList(box, { plain: true });
    list.addEventListener('scroll', () => {
      this.chaptersFold.scroll = list.scrollTop;
    });
    for (const branch of branches) {
      const n = heldIn(branch);
      pickRow(list, {
        label: branch.displayLabel,
        note: n ? t('generate_notes_modal.chapter_items', { n: String(n) }) : t('marks_pdf.chapter_none'),
        noteMuted: !n,
        checked: picked(branch),
        // Keyed by the chapter, since ticking one redraws the dialog and the box has to be findable again.
        key: `note-chapter:${branch.href}`,
        onChange: (on) => {
          const next = new Set(chosen);
          // The whole subtree moves together — see `topLevelChapters`.
          for (const href of branch.hrefs) {
            if (on) next.add(href);
            else next.delete(href);
          }
          // Ticking a box IS the custom selection, so the dropdown stops claiming a rule it no longer follows.
          this.chapterPick = next;
          this.render();
        },
      });
    }
    if (this.chaptersFold.open) list.scrollTop = this.chaptersFold.scroll;
    paint();
  }

  /**
   * Narrow this run to particular marks — a fold, shut by default, that says what it holds.
   *
   * **The header states the answer, and that is not decoration.** A fold shut over an active filter is how somebody
   * exports six highlights out of two hundred and does not notice; reading "Key point, Quote" on a closed fold is
   * the whole safeguard. `answerFold` exists for exactly this, and four other dialogs use it.
   *
   * **Only the two selection kinds are narrowed.** Bookmarks carry no mark, so they arrive whatever is chosen —
   * said in the description, because "filtered to Key point, still got every bookmark" reads as a fault otherwise.
   * And with both selection kinds switched off above, the filter decides nothing, so the whole section dims: the
   * same rule the advanced search follows when *Book text* is its only scope.
   */
  private renderMarkFilter(contentEl: HTMLElement): void {
    const data = this.view.notesData();
    const marks = data.marks ?? [];
    const byId = new Map(marks.map((m) => [m.id, m]));
    const usage = markUsage(data);
    const inUse = marksInUse(data);
    const pillLabels = {
      sample: t('annotation_picker.mark_sample'),
      noMark: t('mark_filter.no_mark'),
      unnamed: t('presets.unnamed_mark'),
    };
    // Nothing in the book carries a mark: a filter over an empty set is a control that can only ever produce
    // nothing, so it is not offered at all.
    if (!usage.size) return;
    const applies = this.config.includeHighlights || this.config.includeNotes;

    const { body, paint } = answerFold(contentEl, {
      key: 'marks',
      label: t('generate_notes_modal.mark_filter'),
      value: () => {
        const names = chosenMarkNames(this.markFilter, marks, pillLabels);
        return names.length ? names.join(', ') : t('generate_notes_modal.mark_filter_all');
      },
      open: this.markFold,
    });
    body.toggleClass('orbis-adv-mark-section', true);
    body.toggleClass('is-disabled', !applies);
    body.createDiv({
      cls: 'orbis-adv-mark-hint',
      text: applies ? t('generate_notes_modal.mark_filter_desc') : t('generate_notes_modal.mark_filter_off'),
    });

    renderMarkChips(body, {
      chosen: this.markFilter,
      order: marks,
      marks: byId,
      // No `any` line: this fold's header already reads "Every mark", and saying it twice four lines apart, in two
      // different words, is noise. The advanced search keeps its line; it has no header.
      labels: { ...pillLabels, remove: (name) => t('search_tab.remove_mark', { name }) },
      landing: { key: 'pick-marks', root: () => this.bodyEl },
      onRemove: (id) => {
        this.markFilter.delete(id);
        paint();
        this.render();
      },
    });

    const pick = body.createEl('button', {
      cls: 'orbis-adv-scope-toggle',
      attr: { type: 'button', 'data-orbis-focus': 'pick-marks' },
    });
    setSvgIcon(pick.createSpan({ cls: 'orbis-adv-scope-icon' }), annotationsSvg(14));
    pick.createSpan({ cls: 'orbis-adv-scope-label', text: t('search_tab.select_marks') });
    pick.disabled = !applies;
    /**
     * **A child dialog, where the search does this by swapping its own stage.**
     *
     * A stage is all the search dialog has, so replacing it costs nothing. This dialog is a form — the style, the
     * destination, the content switches — and swapping it out would take away everything the filter belongs to,
     * along with the button that runs it. The list itself is the same one, drawn into a different host.
     */
    pick.addEventListener('click', () => {
      openOrbisDialog(this.app, { title: t('generate_notes_modal.mark_filter') }, (pickBody, close, _el, footer) => {
        const drawList = (): void => {
          rebuildKeepingFocus(pickBody, () => {
            pickBody.empty();
            renderMarkChoiceList(pickBody, {
              inUse,
              usage,
              marks: byId,
              chosen: this.markFilter,
              labels: {
                ...pillLabels,
                count: (n) => t('search_tab.mark_usage', { count: String(n) }),
                empty: t('search_tab.no_marks_in_book'),
              },
              onToggle: drawList,
            });
          });
        };
        drawList();
        // Ticking writes straight through to the run's filter, so there is nothing to confirm — the same shape as
        // the destination fold, where the fields write as they are typed and Cancel on the main screen is the undo.
        const btns = actionRow(footer(), { placement: 'inline', wrap: true });
        actionButton(btns, {
          label: t('action.done'),
          cta: true,
          onClick: () => {
            close();
            paint();
            this.render();
          },
        });
      });
    });
  }

  /** Every redraw goes through here, so a change does not throw the keyboard back to the top — see
   *  `rebuildKeepingFocus`. Rooted on the popup, not the body, so a footer button keeps its place too. */
  private render(): void {
    const root = this.outerPopupEl ?? this.bodyEl;
    if (!root) return;
    rebuildKeepingFocus(root, () => this.build());
  }

  private build(): void {
    const contentEl = this.bodyEl;
    if (!contentEl) return;
    contentEl.empty();

    const styles = this.view.plugin.settings.noteStyles;

    // ── Style selector ──────────────────────────────────────────────────────
    if (styles.length > 1) {
      // Reuse the path-grid layout (like "Save to") rather than a raw .setting-item,
      // which on mobile picks up Obsidian's gray card background and truncates the label.
      const styleRow = contentEl.createDiv({ cls: 'orbis-gen-path-grid' });
      styleRow.createSpan({ text: t('generate_notes_modal.notes_style'), cls: 'orbis-gen-path-label' });
      const sel = styleRow.createEl('select', { cls: 'dropdown orbis-gen-style-select' });
      // By name, as the style page lists them — see `by-name.ts`.
      for (const s of byName(styles)) {
        const label = s.name + (s.isDefault ? t('generate_notes_modal.default') : '');
        sel.createEl('option', { value: s.id, text: label });
      }
      sel.value = this.selectedStyleId;
      sel.addEventListener('change', () => {
        const s = styles.find((x) => x.id === sel.value);
        if (!s) return;
        this.selectedStyleId = s.id;
        this.config = { ...s.config, sectionOrder: [...s.config.sectionOrder] };
        this.filePath = this.resolveFilePath();
        this.folderPath = this.resolveFolderPath();
        // Both names are the new style's now, so the field shows the one in play rather than a hint.
        this.filingFold.nameCleared = false;
        this.render();
      });
    }

    // ── Format ──────────────────────────────────────────────────────────────
    choiceGroup(contentEl, {
      name: 'notesFormat',
      heading: t('generate_notes_modal.format'),
      key: 'notes-format',
      options: [
        {
          value: 'single',
          label: t('generate_notes_modal.single_obsidian_note'),
          desc: t('generate_notes_modal.single_note_desc'),
        },
        {
          value: 'folder',
          label: t('generate_notes_modal.book_folder'),
          desc: t('generate_notes_modal.per_chapter_desc'),
        },
      ],
      value: this.config.perChapter ? 'folder' : 'single',
      onPick: (value) => {
        this.config.perChapter = value === 'folder';
        this.folderPath = this.resolveFolderPath();
        // The field now edits the other format's name, which the reader did not empty.
        this.filingFold.nameCleared = false;
        this.render();
      },
    });

    /**
     * ── Where it goes, and what it is called ────────────────────────────────
     *
     * **A fold whose header is the resolved path**, the same shape Save as PDF and the three EPUB dialogs use.
     * A label, a folder picker, a name field and a preview line, all in the open, would be four rows spent on an
     * answer that is usually already right, at the top of the tallest dialog in the plugin. The header states that
     * answer, so opening this is for the times it is wrong.
     *
     * No preview line either: the folder and the name are two halves nobody should have to assemble in their head,
     * and the header assembles them.
     *
     * The style still supplies the default, exactly as Book Export's defaults do.
     */
    {
      const { body, paint } = answerFold(contentEl, {
        key: 'filing',
        label: t('epub_export.save_to_label'),
        // Per-chapter writes a FOLDER, so the trailing separator says which of the two it is.
        value: () => (this.config.perChapter ? (this.folderPath ? `${this.folderPath}/` : '') : this.filePath || ''),
        path: true,
        open: this.filingFold,
      });
      // A popup, not a modal: it sizes to its content, so opening a fold has to tell it to measure again.
      body.parentElement?.addEventListener('toggle', () => this.repositionPopup?.());
      destinationGrid(body, {
        app: this.app,
        folder: () => this.currentFolder(),
        onFolder: (value) => {
          this.setPath(value, this.currentName());
          paint();
          renderFileExists();
        },
        name: () => this.currentName(),
        onName: (value) => {
          this.setPath(this.currentFolder(), value);
          paint();
          renderFileExists();
        },
        nameKey: 'gen-notes-name',
        fallback: () => this.defaultName(),
        held: this.filingFold,
        // Per chapter the target is a folder, which has no extension to show.
        nameLabel: this.config.perChapter ? t('generate_notes_modal.book_folder') : t('book_export_modal.file_name'),
        ext: this.config.perChapter ? '' : '.md',
      });
    }

    /**
     * ── Advanced ───────────────────────────────────────────────────────────
     *
     * Content options, chapter scope and formatting choices all live in here, so the buttons are reachable
     * without scrolling on a phone.
     *
     * **A real `<details>`.** A div with a `▸`/`▾` span, a hand-managed `aria-expanded` and an `onActivate` is three
     * things a browser does for free, and one thing it does better: `<summary>` is a native tab stop, which a div
     * only becomes by being given a `tabIndex`. Every other fold in the plugin is a
     * `<details>`, and the machinery that reads them (`foldOpen`, the tab trap's selector) knows that shape.
     */
    /**
     * **And through `answerFold`, so it states what it holds.**
     *
     * A bare label set straight on the summary would come out at the summary's own weight while `Location:` and
     * `Filter by mark` either side of it draw a faint label and a value — and shut, it would say nothing at all,
     * which is the fault the answer-carrying header exists to fix everywhere else.
     *
     * Unlike the other two it has no answer of its own to state, so one is composed: what the note will hold. `All
     * chapters` leads when the chapters-without-content rule is on, because that is a statement about scope rather than
     * about content, and the kinds follow **in the reader's own section order** — the order they will appear in the
     * file, and the order the list inside the fold shows them in. Words taken from the switches themselves, so the
     * header and the controls under it cannot disagree.
     */
    const kindLabel: Record<NotesSectionId, string> = {
      bookmarks: t('generate_notes_modal.bookmarks'),
      highlights: t('generate_notes_modal.highlights'),
      notes: t('generate_notes_modal.notes'),
    };
    /**
     * What the note will hold. **The chapters are not part of this**: they have a fold of their own, as in the
     * other three export dialogs — so this says what goes IN a chapter and the fold below says which chapters.
     */
    const advValue = (): string => {
      const parts: string[] = [];
      /**
       * Headings lead.
       *
       * It is a content decision like the kinds below it, and the one switch in here the header would otherwise not
       * report. Only in single-note mode, for the same reason the switch itself is: per chapter, every file already
       * opens with its own title, so there is no heading to decide about.
       */
      if (!this.config.perChapter && this.config.includeChapterHeadings) {
        parts.push(t('generate_notes_modal.chapter_headings'));
      }
      for (const id of this.config.sectionOrder) {
        const on =
          id === 'bookmarks'
            ? this.config.includeBookmarks
            : id === 'highlights'
              ? this.config.includeHighlights
              : this.config.includeNotes;
        if (on) parts.push(kindLabel[id]);
      }
      return parts.join(' · ');
    };
    /**
     * `paint` is kept, because TWO of the controls in here deliberately do not repaint the dialog.
     *
     * Most of them do — the kind switches and the chapter-headings toggle each call `render()`, which rebuilds the
     * header along with everything else. The exceptions are the chapters-without-content toggle, which changes
     * nothing else on screen, and a reorder, which must NOT repaint: `renderReorderList` has already moved the row
     * and a rebuild would fight the drag. Both feed this header, so both call `paint` instead — it rewrites the one
     * span and leaves the list alone.
     */
    const { body: advBody, paint: paintAdvanced } = answerFold(contentEl, {
      key: 'advanced',
      /**
       * **"Note content", not "Advanced".**
       *
       * `Advanced` would name a drawer rather than its contents, and the drawer holds nothing miscellaneous: the
       * headings switch and which annotation kinds go in. A name that says where controls were put, rather than what
       * they are, tells the reader nothing.
       *
       * These are the note-styles page's own words for this block: this dialog is that style, applied once, so the
       * two have to say the same thing.
       */
      label: t('notes_styles_page.note_content'),
      value: advValue,
      open: this.advancedFold,
      // A popup is sized to what it held a moment ago, so opening this has to make it measure again.
      onToggle: () => this.repositionPopup?.(),
    });

    /**
     * **The frontmatter template is NOT here**, and the note style is the only place it lives.
     *
     * `this.config` is a COPY of the style and this dialog never writes back — so a YAML template reworked here
     * would be used for one run and silently discarded, with the style's version back next time.
     *
     * That is survivable for the switches below, which are one tap to re-set and plausibly a per-run choice.
     * A template is expensive to edit and never a per-run decision, so the same behavior makes it a trap. The
     * note-style editor has the same control and persists it.
     *
     */
    // ── Content ─────────────────────────────────────────────────────────────
    // **No heading here: the fold above IS the heading.** A heading inside it would repeat the fold's header three
    // lines apart, naming one thing twice. The fold carries the words.

    /**
     * **The last one on locks**, exactly as the note-styles page does it: a note with every kind switched off has
     * nothing in it, so the only switch still on cannot be turned off. Save is still guarded — a stored style
     * can arrive here with everything off, and then nothing is locked and Save stays dead until the reader
     * turns something on.
     *
     * Counted over what this mode offers: *Chapter headings* is not offered per chapter, where every chapter is its
     * own file.
     *
     * **A book folder has no lock.** With every kind off it is still a folder of chapter notes — one per chapter, each
     * with its heading and its link into the book — for writing your own notes along the book's structure.
     */
    const headingsOffered = !this.config.perChapter;
    const onCount =
      (headingsOffered && this.config.includeChapterHeadings ? 1 : 0) +
      (this.config.includeBookmarks ? 1 : 0) +
      (this.config.includeHighlights ? 1 : 0) +
      (this.config.includeNotes ? 1 : 0);
    const locked = (on: boolean): boolean => headingsOffered && on && onCount === 1;

    /**
     * **A switch, not a checkbox.** A checkbox says "this item is one of a set" — which is right for the chapter
     * lists in the export dialogs and wrong here, where each of these is a feature being turned on. The content list
     * below already uses switches, so a checkbox grid would make one dialog disagree with itself.
     */
    if (headingsOffered) {
      const headingsRow = new Setting(advBody).setName(t('generate_notes_modal.chapter_headings'));
      // Same rule as settings: the lock message takes the slot when it applies, the explanation holds it otherwise.
      headingsRow.setDesc(
        locked(this.config.includeChapterHeadings)
          ? t('notes_styles_page.content_min_one')
          : t('notes_styles_page.chapter_headings_desc')
      );
      headingsRow.addToggle((tg) =>
        tg
          .setValue(this.config.includeChapterHeadings)
          .setDisabled(locked(this.config.includeChapterHeadings))
          .onChange((v) => {
            this.config.includeChapterHeadings = v;
            this.render();
          })
      );
    }
    /**
     * **What the note holds and the order it appears in, as one list** — the same card the note-styles page uses, so
     * the run and the style it came from look like one thing.
     *
     * As a checkbox grid and a separate *Section order* list naming the same three kinds again, turning bookmarks off
     * would leave a bookmarks row in the order list, and nothing on screen would say the two were about the same
     * thing. The switch says whether, the arrows say where.
     */
    const kinds: Record<NotesSectionId, { label: string; get: () => boolean; set: (v: boolean) => void }> = {
      bookmarks: {
        label: t('generate_notes_modal.bookmarks'),
        get: () => this.config.includeBookmarks,
        set: (v) => {
          this.config.includeBookmarks = v;
        },
      },
      highlights: {
        label: t('generate_notes_modal.highlights'),
        get: () => this.config.includeHighlights,
        set: (v) => {
          this.config.includeHighlights = v;
        },
      },
      notes: {
        label: t('generate_notes_modal.notes'),
        get: () => this.config.includeNotes,
        set: (v) => {
          this.config.includeNotes = v;
        },
      },
    };
    renderReorderList(advBody, {
      // Not the settings page's line: that one ends by naming the template each row shows, and these rows have none.
      desc: t('generate_notes_modal.content_desc'),
      rows: this.config.sectionOrder.map((id) => ({
        key: id,
        name: kinds[id].label,
        desc: locked(kinds[id].get()) ? t('notes_styles_page.content_min_one') : undefined,
        toggle: {
          value: kinds[id].get(),
          disabled: locked(kinds[id].get()),
          onChange: (on) => {
            kinds[id].set(on);
            // The whole dialog reads this: the Save button disables with nothing selected, and the chapter-scope
            // question only applies while something is.
            this.render();
          },
        },
      })),
      // `renderReorderList` has already moved the row on screen and reports where it landed, so this only records it
      // — and repaints the fold's header, which names the kinds in this order.
      move: (from, to) => {
        this.config.sectionOrder.splice(to, 0, ...this.config.sectionOrder.splice(from, 1));
        paintAdvanced();
      },
    });

    const anyContent = this.config.includeBookmarks || this.config.includeHighlights || this.config.includeNotes;

    /**
     * ── Chapters ───────────────────────────────────────────────────────────
     *
     * **The same pair the other three export dialogs offer**: a rule, and a list to depart from it with. A single
     * *Include chapters without annotations* toggle would be the rule half and nothing else, with no way to say
     * *these six chapters*. That toggle's two states are the first two options in the dropdown; the list adds the
     * ability to pick.
     *
     * Above the mark filter, because it is the coarser question: which chapters, then which marks inside them.
     */
    const chapters = this.chapterChoice(anyContent);
    this.renderChapterPicker(contentEl, chapters, anyContent);

    this.renderMarkFilter(contentEl);

    // ── Existing file ───────────────────────────────────────────────────────
    const fileExistsContainer = contentEl.createDiv();

    const renderFileExists = () => {
      fileExistsContainer.empty();
      // No path, no check: `normalizePath('')` is `/`, the vault root, which always "already exists".
      const target = this.config.perChapter ? this.folderPath : this.filePath;
      if (!target || !this.app.vault.getAbstractFileByPath(normalizePath(target))) return;

      // Resume detection: show banner if a draft is already in progress
      const draftPath = this.config.perChapter
        ? this.folderPath + '-merge-draft'
        : this.filePath.replace(/\.md$/, '') + '-merge-draft.md';
      const draftAbstract = this.app.vault.getAbstractFileByPath(normalizePath(draftPath));
      if (draftAbstract) {
        fileExistsContainer.createEl('p', {
          text: t('file_exists_states.a_merge_is_already_in_progress'),
          cls: 'orbis-gen-warn',
        });
        const bannerBtns = actionRow(fileExistsContainer, { placement: 'inline' });
        const resumeBtn = bannerBtns.createEl('button', { text: t('file_exists_states.resume_merge') });
        resumeBtn.addClass('mod-cta');
        resumeBtn.addEventListener('click', () => {
          this.close();
          if (this.config.perChapter) {
            void new PerChapterMergeModal(this.app, this.view, this.folderPath, draftPath).open();
          } else {
            void new FileDiffModal(this.app, this.view, this.filePath, draftPath, () => {}, true).open();
          }
        });
        const discardBtn = bannerBtns.createEl('button', { text: t('file_exists_states.discard_draft') });
        discardBtn.addEventListener('click', () => {
          void (async () => {
            await this.app.fileManager.trashFile(draftAbstract);
            renderFileExists();
          })();
        });
        return;
      }

      fileExistsContainer.createEl('p', {
        text: this.config.perChapter
          ? t('file_exists_states.folder_already_exists')
          : t('file_exists_states.file_already_exists'),
        cls: 'setting-item-name orbis-gen-warn',
      });
      const mkRadio = (label: string, value: GenerateNotesModal['existingAction'], desc?: string) => {
        const row = fileExistsContainer.createEl('label', { cls: 'orbis-radio-row' });
        const rb = row.createEl('input', { type: 'radio' });
        rb.name = 'existingAction';
        rb.value = value;
        rb.checked = this.existingAction === value;
        const textWrap = row.createDiv();
        textWrap.createSpan({ text: label });
        if (desc) textWrap.createDiv({ text: desc, cls: 'orbis-radio-desc' });
        rb.addEventListener('change', () => {
          if (rb.checked) this.existingAction = value;
        });
      };
      mkRadio(
        t('file_exists_states.merge'),
        'merge',
        this.config.perChapter ? t('file_exists_states.merge_desc') : t('file_exists_states.merge_notes_desc')
      );
      mkRadio(
        t('file_exists_states.save_as_new_version'),
        'new-version',
        this.config.perChapter ? t('file_exists_states.new_folder_desc') : t('file_exists_states.new_file_desc')
      );
      mkRadio(
        t('file_exists_states.replace'),
        'replace',
        this.config.perChapter
          ? t('file_exists_states.removes_earlier_chapter_notes')
          : t('file_exists_states.rewrites_the_entire_file')
      );
    };
    renderFileExists();

    // ── Buttons ─────────────────────────────────────────────────────────────
    // In the footer, outside the scrolling body — see `open`. Emptied because `build` runs on every change.
    const btnRow = this.genFooterEl ?? contentEl;
    btnRow.empty();
    // A single note needs something in it; a book folder of empty chapter notes is a thing to make — see `locked`.
    // Neither is made from no chapters at all: the export would stop with a notice. The Chapters summary above
    // already reads "0 of N", so the disabled buttons need no tooltip to say why — as in Save as Markdown.
    const noChapters = !!chapters && selectedBranchCount(chapters.branches, chapters.chosen) === 0;
    const noContent = (!this.config.perChapter && !this.config.includeChapterHeadings && !anyContent) || noChapters;

    // Export… or Share…, set apart at the start of the row — see `outsideRoute`. A single note only: a book folder is
    // a note per chapter and a contents note, which belong in the vault together.
    if (!this.config.perChapter) {
      outsideButton(btnRow, outsideRoute(this.app), {
        disabled: noContent || !this.filePath,
        name: () => this.filePath.split('/').pop() ?? '',
        filter: MD_FILTER,
        onTarget: (target) => void this.exportOutside(target),
      });
    }

    const cancelBtn = btnRow.createEl('button', { text: t('action.cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const generateBtn = btnRow.createEl('button', { text: t('action.save') });
    generateBtn.addClass('mod-cta');
    generateBtn.disabled =
      noContent || (!this.config.perChapter && !this.filePath) || (this.config.perChapter && !this.folderPath);
    generateBtn.addEventListener('click', () => {
      void (async () => {
        try {
          // Confirmation required for Replace unless the user has suppressed it
          if (this.existingAction === 'replace' && !this.app.loadLocalStorage('orbis-suppress-replace-warning')) {
            const confirmed = await new Promise<boolean>((resolve) => {
              // Generate Notes' own controls aren't behind a real Modal's
              // backdrop here, so nothing stops the user from still clicking
              // them while this confirm dialog is open on top — freeze the
              // whole outer popup (title bar and close X included, not just
              // its content) for the duration, matching what a real nested
              // Modal would do. filter:brightness (not opacity) so the popup's
              // own solid background stays opaque instead of turning
              // translucent and letting the reader/toolbar bleed through it.
              const genPopupEl = this.outerPopupEl;
              if (genPopupEl) Object.assign(genPopupEl.style, { pointerEvents: 'none', filter: 'brightness(0.6)' });
              const unfreezeGenContent = () => {
                if (genPopupEl) Object.assign(genPopupEl.style, { pointerEvents: '', filter: '' });
              };

              // Nested inside Generate Notes' own popup (not a real Modal), so
              // this is safe to build on createOrbisPopup too — unlike the
              // Settings-tab dialogs, there's no outer Modal here trapping
              // keyboard input, and this dialog has no text field anyway.
              const { popupEl, close } = createOrbisPopup(this.view, {
                title: t('confirm_replace_modal.replace_existing_notes'),
                dismissOnOutsideClick: false,
                // Higher than the default (Generate Notes' own popup below it
                // uses the default) so it's unambiguously on top rather than
                // relying on DOM-order tiebreaking between two same-z-index
                // siblings, which can render this one behind Generate Notes.
                zIndex: 100010,
                // Covers Escape/X too, not just the Cancel button — otherwise
                // the promise dangles forever if dismissed any way other
                // than clicking Cancel.
                onClose: () => {
                  unfreezeGenContent();
                  resolve(false);
                },
              });
              popupEl.createEl('p', {
                text: this.config.perChapter
                  ? t('confirm_replace_modal.earlier_chapter_notes_will_be_replaced')
                  : t('confirm_replace_modal.edits_to_this_file_will_be_lost'),
              });
              const cbRow = popupEl.createEl('label', { cls: 'orbis-gen-cb-row' });
              const cb = cbRow.createEl('input', { type: 'checkbox' });
              cbRow.createSpan({ text: t('confirm_replace_modal.dont_warn_again') });
              const btnRow = actionRow(popupEl, { placement: 'footer' });
              btnRow.createEl('button', { text: t('action.cancel') }).addEventListener('click', () => {
                resolve(false);
                close();
              });
              const confirmBtn = btnRow.createEl('button', { text: t('confirm_replace_modal.replace') });
              confirmBtn.addClass('mod-warning');
              confirmBtn.addEventListener('click', () => {
                if (cb.checked) this.app.saveLocalStorage('orbis-suppress-replace-warning', '1');
                // Must resolve(true) before close() — close() synchronously
                // triggers onClose's resolve(false), and only the first
                // resolve() call on a Promise has any effect.
                resolve(true);
                close();
              });
            });
            if (!confirmed) return;
          }
          const styleName =
            this.view.plugin.settings.noteStyles.find((x) => x.id === this.selectedStyleId)?.name ??
            t('notes_styles_page.default_style_name');
          const conflictExists = this.config.perChapter
            ? !!this.app.vault.getAbstractFileByPath(normalizePath(this.folderPath))
            : !!this.app.vault.getAbstractFileByPath(normalizePath(this.filePath));
          if (this.existingAction === 'merge' && conflictExists) {
            if (this.config.perChapter) {
              const draftFolderPath = this.folderPath + '-merge-draft';
              const origSlug =
                this.folderPath
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '') || undefined;
              await this.view.generatePerChapterNotes(
                draftFolderPath,
                this.config,
                this.selectedStyleId,
                styleName,
                origSlug,
                false,
                this.markFilter,
                this.chapterPick ?? undefined
              );
              this.close();
              void new PerChapterMergeModal(this.app, this.view, this.folderPath, draftFolderPath).open();
            } else {
              const draftPath = this.filePath.replace(/\.md$/, '') + '-merge-draft.md';
              await this.view.writeNotesFile(
                draftPath,
                this.config,
                false,
                false,
                this.markFilter,
                this.chapterPick ?? undefined
              );
              this.close();
              void new FileDiffModal(this.app, this.view, this.filePath, draftPath, () => {}, true).open();
            }
            return;
          }
          if (this.config.perChapter) {
            const effectiveFolderPath =
              this.existingAction === 'new-version' ? findUnusedFolderBase(this.app, this.folderPath) : this.folderPath;
            const set = await this.view.generatePerChapterNotes(
              effectiveFolderPath,
              this.config,
              this.selectedStyleId,
              styleName,
              undefined,
              true,
              this.markFilter,
              this.chapterPick ?? undefined
            );
            if (set) await this.view.recordNotesFileSet(set);
          } else {
            const effectivePath =
              this.existingAction === 'new-version' ? findUnusedPath(this.app, this.filePath) : this.filePath;
            await this.view.writeNotesFile(
              effectivePath,
              this.config,
              false,
              true,
              this.markFilter,
              this.chapterPick ?? undefined
            );
            const record: NotesFileSet = {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2),
              styleName,
              styleId: this.selectedStyleId,
              createdAt: Date.now(),
              mode: 'single',
              path: effectivePath,
            };
            await this.view.recordNotesFileSet(record);
          }
          this.close();
        } catch (err) {
          new Notice(
            t('notices.error_generating_notes_msg', { msg: err instanceof Error ? err.message : String(err) })
          );
          console.error('[GenerateNotesModal]', err);
        }
      })();
    });
  }

  /**
   * The single note, sent out of the vault rather than written into it — Export or Share.
   *
   * **Nothing in the vault is touched**, so none of what guards a note there applies: no Merge, Save as new version or
   * Replace, no replace warning, and no record of a notes set, which points at a note in the vault. The note is written
   * to work elsewhere — see portable-markdown.ts.
   */
  private async exportOutside(target: OutsideTarget): Promise<void> {
    try {
      const data = filterNotesDataByMarks(this.view.notesData(), this.markFilter);
      const md = buildNotesMarkdown(this.config, data, true, this.chapterPick ?? undefined, true);
      const name = this.filePath.split('/').pop() ?? '';
      const written = await sendOutside(this.app, target, name, new TextEncoder().encode(md));
      // A share says nothing: the share sheet is on screen, and it is the answer.
      if (written) new Notice(t('notices.saved_to_path', { path: written }));
      this.close();
    } catch (err) {
      new Notice(t('notices.error_generating_notes_msg', { msg: err instanceof Error ? err.message : String(err) }));
    }
  }
}
