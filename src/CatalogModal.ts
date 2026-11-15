// Cataloging the books nothing describes yet: what will be written, what will be attached, and where. See
// docs/design/library.md.
//
// **A review, not a question per book.** Asking once per file does not survive a folder of three hundred: each answer
// is given with no idea how many are left or whether the ones before it were right. So the matching pass runs first and
// everything it intends to do is on one screen, with the reason for each match visible and every row switchable. One
// decision point.
//
// **Nothing is selected to begin with.** Both halves write to the vault, and one of them edits notes someone
// curated — so "apply" starts as a no-op and every book is a deliberate tick, with Select all for the common case.
// **Except a review of one book someone asked about** (*Catalog this book*): that request IS the tick, and making
// them tick the only row in the dialog asked them the same question twice.
//
// **A scan has to happen first, and it is not free.** Title and author live inside each file, which means an
// archive read per book, and matching needs the same data. So the dialog opens scanning, with a count and a way
// out, and only then can it show a list worth reading.

import {
  type App,
  type ButtonComponent,
  type DropdownComponent,
  Notice,
  Setting,
  type TFile,
  type ToggleComponent,
} from 'obsidian';
import { confirmThen } from './ConfirmModal';
import { actionButton, actionRow } from './controls';
import { folderPickerRow } from './folder-picker';
import { t } from './i18n';
import { type AdoptCandidate, adoptable, adoptNote } from './library/adopt';
import { vaultCandidates } from './library/candidates';
import { catalogResultSummary } from './library/catalog-summary';
import {
  attachFileToRecord,
  bookMetadata,
  catalogBook,
  coversFolderFor,
  matchCandidateFor,
  recordsWithFiles,
  takenNotePaths,
  uncatalogedBooks,
} from './library/cataloging';
import { isoToday } from './library/dates';
import { findMatches, type MatchReason, type RecordForMatch, type RecordMatch } from './library/match';
import type { OpfMetadata } from './library/opf';
import { type LibraryRecord, parseRecord } from './library/record';
import { OrbisModal } from './OrbisModal';
import type { IOrbisReaderPlugin } from './settings';
import { LIBRARY_SVG } from './system-glyphs';
import { claimFocusSoon, pinModalAboveKeyboard, rebuildKeepingFocus } from './ui-utils';

const REASON_LABELS: Record<MatchReason, Parameters<typeof t>[0]> = {
  sibling: 'library.match_reason_sibling',
  isbn: 'library.match_reason_isbn',
  'title-author': 'library.match_reason_title_author',
};

/** How many rows of a group are drawn at once. A modal holding eight hundred rows stutters on a phone. */
const PAGE = 50;

/**
 * Which half of the job this visit is about.
 *
 * **Two counts, two rows in settings, two visits.** They answer different questions — how many notes the library
 * cannot see, and how many book files nothing describes — and one button leading to both would make the number on
 * the row disagree with the number in the dialog. They are not independent, though: a note that becomes visible
 * usually links a book, so updating notes is what makes the book count fall.
 */
export type CatalogPhase = 'menu' | 'notes' | 'books';

/** One book after the run: what became of it, and where to look. */
interface Outcome {
  kind: 'created' | 'attached' | 'adopted' | 'failed';
  title: string;
  detail: string;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * What ticking a row will do to a book that matched something.
 *
 * A matched book has two right answers and only the reader knows which: two translations of one novel are two
 * titles, and the same book in epub and azw3 is one. Offering only "attach or leave it" would make the second case
 * easy and the first impossible — an unticked row would simply stay uncataloged forever, with nowhere to say why.
 *
 * Attaching is the default because it is the common case, and creating is the safer mistake: a wrong new note is
 * deleted in seconds, while a wrong attach edits a record someone curated and has to be noticed first.
 */
type MatchedAction = 'attach' | 'create';

/** One book the scan looked at, with everything the row needs and the decision the reader has made about it. */
interface Reviewed {
  file: TFile;
  meta: OpfMetadata;
  matches: RecordMatch[];
  action: MatchedAction;
  selected: boolean;
}

interface CatalogPlan {
  folder: string;
  covers: boolean;
  /** Files to write new records for. */
  create: Array<{ file: TFile; meta: OpfMetadata }>;
  /** Files to add to a record that already exists. */
  attach: Array<{ file: TFile; notePath: string }>;
  /** Notes to stamp as title notes. Paths, because nothing else about them is being changed. */
  adopt: string[];
}

/**
 * Open the review over every book nothing describes yet.
 *
 * The one entry point, because two places need it — the notice on the dashboard and the row in settings — and the
 * work of assembling the question (which files, which records, where do covers go) should not be written twice.
 * `onDone` is the caller's, so the Library can repaint itself without this file having to know about the view.
 */
export function openCatalogReview(
  app: App,
  plugin: IOrbisReaderPlugin,
  /** Called once the run has written something, with the notes it wrote or attached a file to. */
  onDone: (written: readonly string[]) => void,
  only?: TFile[],
  phase: CatalogPhase = 'menu'
): void {
  const candidates = vaultCandidates(app);
  const records = candidates
    .map((note) => parseRecord(note.path, note.frontmatter))
    .filter((record): record is LibraryRecord => record !== null);
  // `only` is one book someone asked about from a menu. The same review either way — a single book still has a
  // folder to go in, a cover to take and possibly a record it belongs to, and a second dialog for the case of one
  // would be a second set of answers to keep in step with this one.
  const files = only ?? uncatalogedBooks(app, records);
  // Notes that look like titles and have never said so — the counterweight to a mandatory `orbis_note`. Not
  // offered when the review was opened about one particular book: that reader asked a question about a file, and
  // answering with a list of unrelated notes would be a different dialog wearing this one's clothes.
  const adopt = only ? [] : adoptable(candidates, plugin.settings.libraryRecordsFolder);
  // A question about ONE book is not a diagnosis of the vault. Asked from a file menu, the review goes straight
  // to that book rather than offering a choice between it and a list of notes it has nothing to do with.
  const opening: CatalogPhase = only ? 'books' : phase;
  if (files.length === 0 && adopt.length === 0) {
    new Notice(t('library.catalog_nothing'));
    return;
  }
  new CatalogModal(
    app,
    files,
    recordsWithFiles(app, records),
    adopt,
    opening,
    plugin,
    onDone,
    only !== undefined
  ).open();
}

class CatalogModal extends OrbisModal {
  private folder: string;
  private covers: boolean;
  private unpin: () => void = () => {};

  /** Whether anything was written, so closing an untouched dialog does not repaint the world for nothing. */
  private ran = false;
  private scanned: Reviewed[] = [];
  private scanning = true;
  private cancelled = false;
  private shownNew = PAGE;
  private shownMatched = PAGE;
  private shownAdopt = PAGE;
  /** Paths of the notes ticked for adoption. A set, because these rows have no object of their own to hold it. */
  private readonly adoptSelected = new Set<string>();
  private bodyEl: HTMLElement | null = null;
  /** Live controls, so ticking a row updates the counts without rebuilding the list under the reader's finger. */
  /** The primary button, held so `syncLabels` can restate what the ticks add up to. */
  private applyBtn: HTMLButtonElement | null = null;
  private selectAllBtns: Array<{ btn: ButtonComponent; entries: Reviewed[] }> = [];
  private adoptAllBtn: ButtonComponent | null = null;
  private adoptToggles: Array<{ tog: ToggleComponent; path: string }> = [];
  private toggles: Array<{ tog: ToggleComponent; entry: Reviewed }> = [];
  private actionDds: Array<{ dd: DropdownComponent; entry: Reviewed }> = [];

  /**
   * The notes this run wrote or attached a file to — handed to `onDone`, so a caller that opened the review about one
   * book can act on the note it ended with without waiting for Obsidian's metadata cache to find it.
   */
  private readonly written: string[] = [];

  constructor(
    app: App,
    private readonly files: TFile[],
    private readonly records: RecordForMatch[],
    private readonly adoptCandidates: AdoptCandidate[],
    private readonly phase: CatalogPhase,
    private readonly plugin: IOrbisReaderPlugin,
    private readonly onDone: (written: readonly string[]) => void,
    /** Rows start ticked — for a review of the one book someone asked about. See the file header. */
    private readonly preselect = false
  ) {
    // Two thousand rows ticked is not something to lose to a stray click at the edge of the dialog.
    super(app, { dismissOnOutsideClick: false, icon: LIBRARY_SVG });
    this.folder = plugin.settings.libraryRecordsFolder;
    this.covers = plugin.settings.libraryExtractCovers;
  }

  protected dialogTitle(): string {
    return t('library.catalog_title');
  }

  /**
   * A review of the ONE book someone asked about (*Catalog this book* that matched a note): no bulk controls, a
   * button named for the action, and a notice instead of a report when it is done.
   */
  private get single(): boolean {
    return this.preselect && this.files.length === 1 && this.adoptCandidates.length === 0;
  }

  protected onDialogClose(): void {
    this.cancelled = true; // stops a scan still in flight from painting into a dialog that is gone
    this.unpin();
    // Again on the way out, not only when the run finished. Obsidian's metadata cache catches up to two thousand
    // frontmatter writes over the following moment, so a count taken the instant the last one returned can still
    // be the old one — by the time the reader has read the report and closed it, the vault agrees.
    if (this.ran) this.onDone(this.written);
  }

  protected renderDialog() {
    const { contentEl } = this;
    this.modalEl.addClass('orbis-form-dialog');
    this.modalEl.addClass('orbis-catalog-dialog');
    // **This dialog has no text field, so the pin never engages** — it registers for the STACK, so that the
    // New folder dialog opening on top of it hides this one instead of painting through it. Neither `fill` nor
    // lifting is reachable here; converting it would read as a decision and change nothing.
    this.unpin = pinModalAboveKeyboard(this.modalEl);
    this.bodyEl = contentEl.createDiv();
    // Neither half is entered until it is chosen. The books half is minutes of unzipping every book in the vault,
    // so a dialog that started it before knowing which question was being asked would charge everyone for the
    // answer to one of them.
    if (this.phase === 'menu') this.renderMenu();
    else if (this.phase === 'notes' && this.adoptCandidates.length > 0) this.renderAdoptPhase();
    else void this.scan();
  }

  /**
   * What is wrong, and which to do first.
   *
   * **The two counts are one diagnosis.** As two rows in settings they would read as unrelated chores whose numbers
   * disagree — and the wrong one is far more expensive to get wrong, since writing hundreds of notes for books that
   * already have one is a mess you clean up by hand. So they are stated together, in order, with the reason the
   * order matters.
   */
  private renderMenu(): void {
    const parent = this.bodyEl;
    if (!parent) return;
    parent.empty();
    this.footer().empty();
    const both = this.adoptCandidates.length > 0 && this.files.length > 0;
    if (both) parent.createDiv({ cls: 'orbis-rules-hint', text: t('library.catalog_menu_intro') });

    if (this.adoptCandidates.length > 0) {
      // Two forward references — "counted as uncataloged below" and "Start here" — that are only true when there
      // is a below to point at.
      new Setting(parent)
        .setName(t('library.catalog_menu_notes'))
        .setDesc(
          both
            ? t('library.catalog_menu_notes_desc', { count: this.adoptCandidates.length.toLocaleString() })
            : t('library.catalog_menu_notes_only_desc', { count: this.adoptCandidates.length.toLocaleString() })
        )
        .addButton((btn) =>
          btn
            .setButtonText(t('library.catalog_menu_update'))
            .then((b) => {
              // Keyed so Back from the screen it opens returns the keyboard here — see `renderMenu`.
              b.buttonEl.dataset.orbisFocus = 'menu:update';
            })
            .setCta()
            .onClick(() => this.renderAdoptPhase())
        );
    }

    if (this.files.length > 0) {
      // The warning belongs on the second one only when there IS a first one — told to someone with no notes
      // waiting, "try the notes first" is advice about nothing.
      new Setting(parent)
        .setName(t('library.catalog_menu_books'))
        .setDesc(
          both
            ? t('library.catalog_menu_books_desc', { count: this.files.length.toLocaleString() })
            : t('library.catalog_menu_books_only_desc', { count: this.files.length.toLocaleString() })
        )
        .addButton((btn) => {
          btn.buttonEl.dataset.orbisFocus = 'menu:review';
          btn.setButtonText(t('library.catalog_menu_review')).onClick(() => void this.scan());
          if (!both) btn.setCta();
        });
    }

    const actions = actionRow(this.footer());
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
  }

  /** The notes half: this list, and nothing else. The books are a separate row in settings and a separate visit. */
  private renderAdoptPhase(): void {
    const parent = this.bodyEl;
    if (!parent) return;
    parent.empty();
    this.footer().empty();
    this.renderAdoptGroup(parent);

    const actions = actionRow(this.footer());
    this.addBackOrCancel(actions);
    // Its label is written by `syncLabels`, which restates what the ticks add up to.
    this.applyBtn = actionButton(actions, {
      label: '',
      cta: true,
      onClick: () => {
        const adopt = [...this.adoptSelected];
        if (adopt.length === 0) return;
        void this.run({ folder: '', covers: false, create: [], attach: [], adopt });
      },
    });
    this.syncLabels();
  }

  /**
   * Read every book, then group them.
   *
   * Sequential, and yielding to the frame every few books: this is an unzip per file, and eight hundred of them in
   * one tight loop is an app that stops answering. The count is the honest progress indicator — a percentage would
   * imply we know how long each book takes, and a MOBI takes far longer than an EPUB.
   */
  private async scan(): Promise<void> {
    const parent = this.bodyEl;
    if (!parent) return;
    /**
     * **Once per dialog, and showing the answer again is not scanning again.**
     *
     * Every book is pushed onto `scanned` and the list is never cleared, so scanning again after Back to the menu
     * and Review a second time would give two of everything: "Select all" counting every book twice, and a footer
     * counting the ones actually selected, because selection is keyed by path and deduplicates where the
     * array does not.
     *
     * Clearing it first would be wrong too — this is an unzip per book, minutes of work for a
     * list that cannot have changed, since `files` was decided when the dialog opened. `cancelled` is only set by
     * the dialog closing, so a non-empty `scanned` is always a COMPLETE scan.
     */
    if (this.scanned.length > 0) {
      this.scanning = false;
      this.renderReview();
      return;
    }
    parent.empty();
    this.footer().empty();
    const status = parent.createDiv({ cls: 'orbis-library-empty-body' });
    const bar = actionRow(this.footer());
    actionButton(bar, { label: t('action.cancel'), onClick: () => this.close() });

    for (const [index, file] of this.files.entries()) {
      if (this.cancelled) return;
      status.setText(t('library.catalog_scanning', { done: String(index + 1), total: String(this.files.length) }));
      const meta = await bookMetadata(this.app, file);
      this.scanned.push({
        file,
        meta,
        matches: findMatches(matchCandidateFor(file, meta), this.records),
        selected: this.preselect,
        action: 'attach',
      });
      // Every tenth book, so the count actually paints and a cancel can be heard.
      if (index % 10 === 9) await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    if (this.cancelled) return;
    this.scanning = false;
    this.renderReview();
  }

  private get newBooks(): Reviewed[] {
    return this.scanned.filter((entry) => entry.matches.length === 0);
  }

  private get matchedBooks(): Reviewed[] {
    return this.scanned.filter((entry) => entry.matches.length > 0);
  }

  /**
   * Redraw the review screen, keeping the keyboard where it was.
   *
   * The "Show more" buttons redraw this screen and then draw themselves again with a new count — so pressing one from
   * the keyboard would drop the reader at the top of a longer list. The buttons carry keys; this puts them back.
   */
  private repaintReview(): void {
    rebuildKeepingFocus(this.modalEl, () => this.renderReview());
  }

  private renderReview(): void {
    const parent = this.bodyEl;
    if (!parent || this.scanning) return;
    parent.empty();
    // The footer belongs to the phase: scanning offers Cancel, the review offers Catalog, the report offers Done.
    // Emptying it here is what stops one phase's buttons outliving it.
    this.footer().empty();
    this.selectAllBtns = [];
    this.toggles = [];
    this.actionDds = [];

    const folderRow: Setting = new Setting(parent).setName(t('library.catalog_folder'));
    folderRow.settingEl.addClass('orbis-setting-stacked');
    folderPickerRow(folderRow, {
      app: this.app,
      current: () => this.folder,
      // The vault root is '' here rather than '/', because that is what the writer takes.
      onPick: (path) => {
        this.folder = path === '/' ? '' : path;
      },
    });

    new Setting(parent)
      .setName(t('library.catalog_covers'))
      .setDesc(t('library.catalog_covers_desc'))
      .addToggle((tog) => tog.setValue(this.covers).onChange((v) => (this.covers = v)));

    this.renderGroup(parent, 'new');
    this.renderGroup(parent, 'matched');

    const actions = actionRow(this.footer());
    this.addBackOrCancel(actions);
    this.applyBtn = actionButton(actions, { label: '', cta: true, onClick: () => this.apply() });
    this.syncLabels();
  }

  /**
   * One group: its heading, a select-all that names how many it covers, its rows, and a way to see more of them.
   *
   * The two groups differ in what they will DO, so they say so in their descriptions rather than relying on the
   * reader to infer it from a heading.
   */
  private renderGroup(parent: HTMLElement, which: 'new' | 'matched'): void {
    const entries = which === 'new' ? this.newBooks : this.matchedBooks;
    if (entries.length === 0) return;
    const shown = which === 'new' ? this.shownNew : this.shownMatched;

    const head = new Setting(parent)
      .setName(which === 'new' ? t('library.catalog_group_new') : t('library.catalog_group_matched'))
      .setDesc(
        entries.length === 1
          ? t(which === 'new' ? 'library.catalog_group_new_desc_one' : 'library.catalog_group_matched_desc_one')
          : t(which === 'new' ? 'library.catalog_group_new_desc' : 'library.catalog_group_matched_desc', {
              count: entries.length.toLocaleString(),
            })
      );
    if (!this.single)
      head.addButton((btn) => {
        // Says what it covers: "Select all" beside fifty visible rows out of three hundred is ambiguous about which
        // it means.
        this.selectAllBtns.push({ btn, entries });
        btn.onClick(() => {
          const allOn = entries.every((entry) => entry.selected);
          for (const entry of entries) entry.selected = !allOn;
          for (const toggle of this.toggles) toggle.tog.setValue(toggle.entry.selected);
          this.syncLabels();
        });
      });

    // Set every row's action at once. A vault imported once has thirty of these and they usually want the same
    // answer; changing a dropdown thirty times to say one thing is data entry, not a decision.
    //
    // **Its own row, with a name.** Three unlabeled buttons in the heading would share a phone's width and clip
    // the first off the edge; a named row puts the control on its own line, where there is room for it.
    if (which === 'matched' && !this.single) {
      const setAll = new Setting(parent).setName(t('library.catalog_set_all'));
      setAll.addDropdown((dd) => {
        dd.addOption('', t('library.catalog_set_all_none'));
        dd.addOption('attach', t('library.catalog_action_attach'));
        dd.addOption('create', t('library.catalog_action_create'));
        dd.setValue('').onChange((v) => {
          if (v !== 'attach' && v !== 'create') return;
          this.setAllActions(entries, v);
          // Snapped back to neutral, because this is a command rather than a state: left showing "New note" while
          // a row had since been set back to Attach, it would be asserting something untrue.
          dd.setValue('');
        });
      });
    }

    /**
     * The rows on their own ground, with the heading and the bulk controls above staying on the dialog's.
     *
     * **The box is what makes three hundred rows read as one list.** Obsidian's `Setting` rows draw a hairline
     * between themselves wherever they are put, which is enough in a settings pane — the pane IS the list — and
     * not enough in a dialog, where the same lines look like rules left in above a footer. The box is the signal
     * every other list in Orbis uses; see `.orbis-list-box`.
     *
     * "Show more" goes inside it, because it belongs to the list rather than to the dialog.
     */
    const listEl = parent.createDiv({ cls: 'orbis-list-box' });
    for (const entry of entries.slice(0, shown)) {
      const row = new Setting(listEl).setName(entry.meta.title || entry.file.basename);
      row.settingEl.addClass('orbis-catalog-row');
      row.setDesc(this.rowDetail(entry, which));
      // What the tick MEANS, for a book that matched: the choice sits before the switch, because it changes what
      // switching it on does.
      if (which === 'matched') {
        row.addDropdown((dd) => {
          this.actionDds.push({ dd, entry });
          dd.addOption('attach', t('library.catalog_action_attach'));
          dd.addOption('create', t('library.catalog_action_create'));
          dd.setValue(entry.action).onChange((v) => {
            entry.action = v as MatchedAction;
            this.syncLabels();
          });
        });
      }
      // One book someone asked about is already ticked, and Cancel is how to say no — a switch beside it asks twice.
      if (!this.single)
        row.addToggle((tog) => {
          this.toggles.push({ tog, entry });
          tog.setValue(entry.selected).onChange((v) => {
            entry.selected = v;
            // Labels only. Redrawing the dialog on every tick would take the scroll position with it, halfway down a
            // list someone is working through.
            this.syncLabels();
          });
        });
    }

    if (entries.length > shown) {
      const more = new Setting(listEl);
      more.addButton((btn) =>
        btn
          .setButtonText(t('library.catalog_show_more', { count: String(Math.min(PAGE, entries.length - shown)) }))
          .then((btn2) => {
            btn2.buttonEl.dataset.orbisFocus = `more:${which}`;
          })
          .onClick(() => {
            if (which === 'new') this.shownNew += PAGE;
            else this.shownMatched += PAGE;
            this.repaintReview();
          })
      );
    }
  }

  /**
   * Author, the file itself, and — for a match — which record and why.
   *
   * **The path, not just the folder.** Two files can be the same book: `parts-and-chapters.epub` and
   * `parts-and-chapters.fb2` both read "Parts and Chapters" by the same author in the same folder, and two
   * identical rows with a switch each is a choice nobody can make. The path is the one thing that is never
   * ambiguous, and it costs no more room than the folder it replaces.
   *
   * **Two lines, not one wrapped run.** Author-and-path is what the book IS; the match is what we think about it.
   * Run together they read as one long sentence whose end nobody reaches; on separate lines the reason sits where a
   * label sits and is read as one.
   */
  private rowDetail(entry: Reviewed, which: 'new' | 'matched'): DocumentFragment {
    const frag = createFragment();
    const who = entry.meta.authors.join(', ');
    frag.createDiv({ text: who ? `${who} · ${entry.file.path}` : entry.file.path });
    if (which === 'matched') {
      const match = entry.matches[0];
      // The note's title only when it is not the row's own. It is the same string on a title-and-author match —
      // that is WHY the match fired — and repeating it on every row would teach the eye to skip the line where an
      // ISBN or a same-folder match names a note called something else entirely.
      const differs = match.record.title.trim() !== (entry.meta.title || entry.file.basename).trim();
      const why = t(REASON_LABELS[match.reason]);
      frag.createDiv({
        cls: 'orbis-catalog-why',
        text: differs ? t('library.catalog_matched', { title: match.record.title, why }) : why,
      });
    }
    return frag;
  }

  /**
   * Point every matched row the same way.
   *
   * Sets the rows that are not drawn too — the dropdowns visible are a window onto the group, and a button that
   * changed only what happened to be on screen would be a trap on a list of three hundred.
   */
  private setAllActions(entries: Reviewed[], action: MatchedAction): void {
    for (const entry of entries) entry.action = action;
    for (const { dd, entry } of this.actionDds) dd.setValue(entry.action);
    this.syncLabels();
  }

  /** Update everything that depends on how many rows are ticked, leaving the list — and the scroll — alone. */
  private syncLabels(): void {
    for (const { btn, entries } of this.selectAllBtns) {
      const allOn = entries.every((entry) => entry.selected);
      btn.setButtonText(
        allOn
          ? t('library.catalog_select_none', { count: entries.length.toLocaleString() })
          : t('library.catalog_select_all', { count: entries.length.toLocaleString() })
      );
    }
    if (this.adoptAllBtn) {
      const allOn = this.adoptCandidates.every((entry) => this.adoptSelected.has(entry.path));
      this.adoptAllBtn.setButtonText(
        allOn
          ? t('library.catalog_select_none', { count: this.adoptCandidates.length.toLocaleString() })
          : t('library.catalog_select_all', { count: this.adoptCandidates.length.toLocaleString() })
      );
    }
    const { create, attach, adopt } = this.plan();
    // **One book: the action, not a count.** "Attach 1" over the only book in the dialog counts nothing.
    if (this.single && this.applyBtn) {
      this.applyBtn.textContent = t(
        attach.length > 0 ? 'library.catalog_apply_attach_one' : 'library.catalog_apply_one'
      );
      this.applyBtn.disabled = create.length + attach.length === 0;
      return;
    }
    // One segment per thing that is going to happen, because "Catalog 15" over a run that also edits three
    // existing notes and stamps forty does not describe what the button does. Nothing ticked is a legitimate state
    // to sit in, and the button says so rather than pretending it will act.
    const parts = [
      create.length > 0 ? t('library.catalog_apply', { count: create.length.toLocaleString() }) : '',
      attach.length > 0 ? t('library.catalog_apply_attach', { count: attach.length.toLocaleString() }) : '',
      adopt.length > 0 ? t('library.catalog_apply_adopt', { count: adopt.length.toLocaleString() }) : '',
    ].filter(Boolean);
    if (this.applyBtn) {
      this.applyBtn.textContent = parts.join(' · ') || t('library.catalog_apply_nothing');
      this.applyBtn.disabled = parts.length === 0;
    }
  }

  /**
   * What the ticks add up to.
   *
   * A matched row can land in either half depending on what its dropdown says, which is why this is one function
   * rather than two filters: the button's label and the run itself must never disagree about what is about to
   * happen.
   */
  /**
   * Notes that have a title and have never said they are one.
   *
   * **Its own group, and its own verb.** The two above are about book FILES — what to write for them, or which
   * record to hang them on. This one touches nothing but frontmatter, on notes that are already whatever their
   * author made them, so it says exactly what it will add and adds only that.
   */
  private renderAdoptGroup(parent: HTMLElement): void {
    const entries = this.adoptCandidates;
    if (entries.length === 0) return;

    const head = new Setting(parent)
      .setName(t('library.catalog_group_adopt'))
      .setDesc(t('library.catalog_group_adopt_desc', { count: entries.length.toLocaleString() }));
    head.addButton((btn) => {
      this.adoptAllBtn = btn;
      btn.onClick(() => {
        const allOn = entries.every((entry) => this.adoptSelected.has(entry.path));
        this.adoptSelected.clear();
        if (!allOn) for (const entry of entries) this.adoptSelected.add(entry.path);
        for (const toggle of this.adoptToggles) toggle.tog.setValue(this.adoptSelected.has(toggle.path));
        this.syncLabels();
      });
    });

    this.adoptToggles = [];
    for (const entry of entries.slice(0, this.shownAdopt)) {
      const row = new Setting(parent).setName(entry.title);
      row.settingEl.addClass('orbis-catalog-row');
      // The path, because two notes can share a title and the only honest way to tell them apart is where they
      // live — the same reason the book rows show theirs.
      row.setDesc(entry.path);
      row.addToggle((tog) => {
        this.adoptToggles.push({ tog, path: entry.path });
        tog.setValue(this.adoptSelected.has(entry.path)).onChange((on) => {
          if (on) this.adoptSelected.add(entry.path);
          else this.adoptSelected.delete(entry.path);
          this.syncLabels();
        });
      });
    }

    if (entries.length > this.shownAdopt) {
      const more = new Setting(parent);
      more.addButton((btn) =>
        btn
          .setButtonText(
            t('library.catalog_show_more', { count: String(Math.min(PAGE, entries.length - this.shownAdopt)) })
          )
          .then((btn2) => {
            btn2.buttonEl.dataset.orbisFocus = 'more:adopt';
          })
          .onClick(() => {
            this.shownAdopt += PAGE;
            this.repaintReview();
          })
      );
    }
  }

  /**
   * The way out of a phase: back to the diagnosis, or straight out.
   *
   * Back only where there is something to go back to. A review opened about one book from a file menu never saw
   * a menu, and offering to send someone "back" to a page they have not visited is a door into a room they did
   * not come from.
   */
  private addBackOrCancel(actions: HTMLElement): void {
    if (this.phase === 'menu') {
      actionButton(actions, {
        label: t('action.back'),
        onClick: () => {
          // The menu button that opened this screen, so Back returns the keyboard to it rather than to the top of
          // the menu — the same rule the sources stack and the recordings library follow.
          const from = this.phase === 'notes' ? 'menu:update' : 'menu:review';
          this.renderMenu();
          const btn2 = this.modalEl.querySelector<HTMLElement>(`[data-orbis-focus="${from}"]`);
          if (btn2) claimFocusSoon(btn2);
        },
      });
      return;
    }
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
  }

  private plan(): { create: Reviewed[]; attach: Reviewed[]; adopt: string[] } {
    const selected = this.scanned.filter((entry) => entry.selected);
    return {
      create: selected.filter((entry) => entry.matches.length === 0 || entry.action === 'create'),
      attach: selected.filter((entry) => entry.matches.length > 0 && entry.action === 'attach'),
      adopt: this.adoptCandidates.filter((entry) => this.adoptSelected.has(entry.path)).map((entry) => entry.path),
    };
  }

  private apply(): void {
    const { create, attach, adopt } = this.plan();
    // **The one combination that writes hundreds of duplicates.** Matching ran before any of these notes were
    // records, so a note about to be adopted could not have matched anything — every book it describes is sitting
    // in "no title note" waiting to have a second one written for it. Adopting first and looking again turns that
    // into an attach.
    if (adopt.length > 0 && create.length > 0) {
      confirmThen(
        this.app,
        {
          title: t('library.catalog_adopt_first_title'),
          message: t('library.catalog_adopt_first', {
            adopt: adopt.length.toLocaleString(),
            create: create.length.toLocaleString(),
          }),
          confirmText: t('library.catalog_adopt_only', { count: adopt.length.toLocaleString() }),
        },
        () => void this.run({ folder: '', covers: false, create: [], attach: [], adopt })
      );
      return;
    }
    // Only when something is going to be written there: an attach-only run needs no folder, and demanding one
    // would be a question about a consequence that is not happening.
    if (create.length > 0 && !this.folder.trim()) {
      new Notice(t('library.catalog_pick_folder'));
      return;
    }
    const plan: CatalogPlan = {
      folder: this.folder.trim(),
      covers: this.covers,
      create: create.map((e) => ({ file: e.file, meta: e.meta })),
      attach: attach.map((e) => ({ file: e.file, notePath: e.matches[0].record.notePath })),
      adopt,
    };
    this.plugin.settings.libraryRecordsFolder = plan.folder || this.plugin.settings.libraryRecordsFolder;
    this.plugin.settings.libraryExtractCovers = plan.covers;
    void this.plugin.saveSettings();
    void this.run(plan);
  }

  /**
   * Do the work, in the dialog that asked for it.
   *
   * **Sequential, with a way out.** Each book is a read, an unzip, maybe an image and a note; firing hundreds at
   * once on a phone is how a background job becomes a frozen app. Cancelling stops before the next book rather
   * than undoing what is done — those are real notes now, and deleting them again would be the surprise.
   *
   * The dialog stays open for this rather than handing a progress bar back to whoever opened it, because it is the
   * same run: the review and its consequences belong in one place, and settings has nowhere to put a progress bar.
   */
  private async run(plan: CatalogPlan): Promise<void> {
    const parent = this.bodyEl;
    if (!parent) return;
    parent.empty();
    const total = plan.create.length + plan.attach.length + plan.adopt.length;
    const status = parent.createDiv({ cls: 'orbis-library-empty-body' });
    let stop = false;
    this.footer().empty();
    const bar = actionRow(this.footer());
    actionButton(bar, {
      label: t('library.catalog_cancel'),
      onClick: () => {
        stop = true;
      },
    });

    const taken = takenNotePaths(this.app);
    const added = isoToday();
    const covers = plan.covers ? coversFolderFor(this.plugin.settings) : null;
    const results: Outcome[] = [];
    let handled = 0;
    for (const { file, meta } of plan.create) {
      if (stop) break;
      status.setText(t('library.cataloging', { done: String(++handled), total: String(total) }));
      try {
        const notePath = await catalogBook(this.app, file, plan.folder, 'book', taken, added, meta, covers);
        results.push({ kind: 'created', title: meta.title || file.basename, detail: notePath });
        this.written.push(notePath);
      } catch (err) {
        // Recorded rather than counted: "3 failed" is not something anyone can act on, and the reason a book
        // failed is the only part of a run worth reading twice.
        results.push({ kind: 'failed', title: meta.title || file.basename, detail: message(err) });
      }
    }
    for (const { file, notePath } of plan.attach) {
      if (stop) break;
      status.setText(t('library.cataloging', { done: String(++handled), total: String(total) }));
      try {
        await attachFileToRecord(this.app, notePath, file, covers);
        results.push({ kind: 'attached', title: file.path, detail: notePath });
        this.written.push(notePath);
      } catch (err) {
        results.push({ kind: 'failed', title: file.path, detail: message(err) });
      }
    }
    // Last, and one frontmatter write each: these notes exist and are already right, so this is the cheap part of
    // a run whose expensive part is unzipping books.
    for (const path of plan.adopt) {
      if (stop) break;
      status.setText(t('library.cataloging', { done: String(++handled), total: String(total) }));
      try {
        await adoptNote(this.app, path);
        results.push({ kind: 'adopted', title: path, detail: '' });
      } catch (err) {
        results.push({ kind: 'failed', title: path, detail: message(err) });
      }
    }
    this.ran = true;
    this.onDone(this.written);
    // **One book, done: a notice, not a report.** The report is for a vault's worth of books; for one it repeats the
    // button just pressed. A failure still gets it, because the report is where the reason is shown.
    const only = results[0];
    if (this.single && !stop && results.length === 1 && only.kind !== 'failed') {
      new Notice(
        only.kind === 'attached'
          ? t('library.catalog_attached_one', {
              file: only.title.split('/').pop() ?? only.title,
              note: (only.detail.split('/').pop() ?? only.detail).replace(/\.md$/, ''),
            })
          : t('library.cataloged_first', { title: only.title })
      );
      this.close();
      return;
    }
    this.renderResults(results, stop ? total - handled : 0);
  }

  /**
   * What happened, as a list rather than a toast.
   *
   * A run can touch three hundred notes, and a notice saying "Cataloged 297" that vanishes in five seconds is not
   * something anyone can check. So the dialog stays open on a report: what was written and where, what was attached
   * to which note, and anything that failed with the reason it gave.
   */
  private renderResults(results: Outcome[], skipped: number): void {
    const parent = this.bodyEl;
    if (!parent) return;
    parent.empty();
    this.footer().empty();

    const failed = results.filter((r) => r.kind === 'failed');
    const created = results.filter((r) => r.kind === 'created');
    const attached = results.filter((r) => r.kind === 'attached');
    const adopted = results.filter((r) => r.kind === 'adopted');
    parent.createDiv({
      cls: 'orbis-library-row-title',
      text: catalogResultSummary(created.length, attached.length, adopted.length),
    });
    if (skipped > 0) {
      parent.createDiv({
        cls: 'orbis-library-empty-body',
        text: t('library.catalog_result_stopped', { count: String(skipped) }),
      });
    }

    // Failures first: everything else went the way it was asked to, and this is the part with something left to do
    // about it.
    for (const group of [
      { rows: failed, label: t('library.catalog_result_failed') },
      { rows: created, label: t('library.catalog_result_created') },
      { rows: attached, label: t('library.catalog_result_attached') },
      { rows: adopted, label: t('library.catalog_adopted') },
    ]) {
      if (group.rows.length === 0) continue;
      parent.createDiv({ cls: 'orbis-rules-heading', text: `${group.label} · ${group.rows.length}` });
      // A box per group, so a report of four failures and two hundred successes reads as four lists rather than
      // one long stripe of text under headings.
      const groupEl = parent.createDiv({ cls: 'orbis-list-box' });
      for (const row of group.rows.slice(0, PAGE)) {
        const line = groupEl.createDiv({ cls: 'orbis-library-row' });
        line.createDiv({ cls: 'orbis-library-row-title', text: row.title });
        line.createDiv({ cls: 'orbis-library-row-meta', text: row.detail });
      }
      if (group.rows.length > PAGE) {
        groupEl.createDiv({
          cls: 'orbis-library-empty-body',
          text: t('library.catalog_result_more', { count: String(group.rows.length - PAGE) }),
        });
      }
    }

    const actions = actionRow(this.footer());
    // Adopting changes the answer to "which books have no title note", and this dialog's answer was worked out
    // before it happened. Rather than let it show a stale one, the way back is a fresh review.
    if (adopted.length > 0) {
      actionButton(actions, {
        label: t('library.catalog_review_again'),
        onClick: () => {
          this.close();
          openCatalogReview(this.app, this.plugin, this.onDone);
        },
      });
    }
    actionButton(actions, { label: t('action.done'), cta: true, onClick: () => this.close() });
  }
}
