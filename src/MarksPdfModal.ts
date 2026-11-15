// What the PDF is called, where it goes, and whose reading it represents.
//
// One line at the top saying what the file will hold, folds whose headers are the answers, and every other control
// describing only itself. Three export dialogs that look like three different features is a worse outcome than one
// more file sharing their idioms. See docs/design/marks-pdf.md.

import { type App, Setting } from 'obsidian';
import type { AnnotationMark } from './annotation-presets';
import { actionButton, actionRow, pickList, pickListHeader, pickRow } from './controls';
import { destinationGrid, type FilingState } from './folder-picker';
import { t } from './i18n';
import { chosenMarkNames, type MarkSelection } from './mark-filter';
import { renderMarkChips, renderMarkChoiceList } from './mark-filter-ui';
import {
  applyChapterScope,
  type ChapterChoice,
  countMarks,
  type MarkChapter,
  type MarksPdfOptions,
  type RegroupedMarks,
} from './marks-pdf';
import { openOrbisDialog } from './OrbisModal';
import type { OutsideRoute } from './outside-vault';
import { FONT_DOWNLOAD_MB } from './pdf-fonts';
import { annotationsSvg, CONVERSION_SVG } from './system-glyphs';
import {
  answerFold,
  captureFocus,
  createOrbisPopup,
  foldOpen,
  keyToggle,
  type OrbisPopupHost,
  scrollParent,
} from './ui-utils';
import { exportFileName } from './vault-names';

/** Where the PDF lands, as a path — the same line the EPUB dialogs show, for the same reason: the destination is
 *  readable without a control, which is what lets the folder picker live behind the pencil. */
export function marksPdfPath(opts: MarksPdfOptions): string {
  const dir = opts.folder && opts.folder !== '/' ? `${opts.folder}/` : '/';
  // A typed extension is stripped rather than doubled, exactly as `epubTargetPath` does it: the field shows `.pdf`
  // beside the input, and someone who types it anyway should not get `name.pdf.pdf`.
  const base = exportFileName(opts.fileName.replace(/\.pdf$/i, ''), 'book');
  return `${dir}${base}.pdf`;
}

/**
 * Which chapters a DIGEST covers — the same rows, showing only the ones that hold marks.
 *
 * **Not `renderChapters` with a filter.** That control is built around `chapterScope`, whose three answers are
 * `all`, `marked` and `custom` — and in a digest `all` and `marked` are the same set, because a chapter with no
 * marks contributes nothing to one. A three-state control where one state is a lie is worse than a second list.
 *
 * The rows the reader is shown move as the mark filter narrows, and the ticks live on the rows themselves rather
 * than on a copy of the visible list — so a chapter that drops out and comes back brings back the answer given
 * for it, instead of a default. Its count keeps reporting what it holds even while it is unticked, which is what
 * makes the row worth reading before giving it up.
 */
function renderDigestChapters(
  stage: HTMLElement,
  opts: MarksPdfOptions,
  fold: { open: boolean; scroll: number },
  repaint: () => void
): void {
  const rows = opts.chapters.filter((c) => c.marks > 0);
  /**
   * **Shown for one row too, unlike the document's picker**, whose list is the book's and does not move. This
   * one's holds the chapters carrying marks under the current filter, so narrowing can take it from four to one —
   * and hiding it then would STRAND the dialog: the ticks go on applying out of sight, so unticking a chapter and
   * filtering down to it leaves an empty export, Save disabled, and no way back except undoing the filter. Enabled
   * rather than disabled for the same reason — a grayed row in that state is still a dead end.
   */
  if (!rows.length) return;
  const included = rows.filter((c) => c.included).length;

  const { body: details } = answerFold(stage, {
    key: 'digest-chapters',
    label: t('marks_pdf.chapters_digest'),
    value: () => t('marks_pdf.chapters_value', { n: String(included), total: String(rows.length) }),
    open: fold,
    bare: true,
  });
  const setAll = (next: (wasOn: boolean) => boolean): void => {
    // Only the rows on screen: a chapter with no marks is not part of this question, and turning it on here would
    // change what the book's text exports without saying so.
    for (const chapter of rows) chapter.included = next(chapter.included);
    repaint();
  };
  const box = details.createDiv({ cls: 'orbis-list-box' });
  pickListHeader(box, {
    onSelectAll: () => setAll(() => true),
    onClear: () => setAll(() => false),
    onInvert: () => setAll((on) => !on),
  });
  const list = pickList(box, { plain: true });
  list.addEventListener('scroll', () => {
    fold.scroll = list.scrollTop;
  });
  for (const chapter of rows) {
    pickRow(list, {
      label: chapter.title || t('book_export_modal.section_n', { n: String((chapter.index ?? 0) + 1) }),
      note: t(chapter.marks === 1 ? 'marks_pdf.chapter_marks_one' : 'marks_pdf.chapter_marks', {
        n: String(chapter.marks),
      }),
      checked: chapter.included,
      // Keyed by the chapter, not by position: the list is filtered, so a row's index moves as the mark filter
      // changes and a position key would restore focus to whichever chapter had slid into that slot.
      key: `digest-chapter:${chapter.key}`,
      onChange: (on) => {
        chapter.included = on;
        repaint();
      },
    });
  }
  if (fold.open) list.scrollTop = fold.scroll;
}

/**
 * The digest's chapters as the chapter picker leaves them.
 *
 * **A chapter the picker never offered is always kept.** The rows are top-level contents entries and unlisted
 * spine sections; a chapter whose marks carry no placeable href is keyed on its own title instead, so it has no
 * row and could never have been ticked. Dropping it because it is not in the selection would silently lose marks
 * over a control the reader was never shown.
 *
 * Exported because the export path has to narrow the same way the dialog reports — one rule, not two.
 */
export function digestSelection(opts: MarksPdfOptions, chapters: readonly MarkChapter[]): readonly MarkChapter[] {
  if (opts.scope !== 'digest') return chapters;
  const offered = new Set(opts.chapters.map((c) => c.key));
  const kept = new Set(opts.chapters.filter((c) => c.included).map((c) => c.key));
  return chapters.filter((c) => !offered.has(c.key) || kept.has(c.key));
}

export function openMarksPdfExport(
  app: App,
  /**
   * The reader this belongs to, as `createOrbisPopup`'s host.
   *
   * **A popup, not a `Modal`.** A `Modal` is the exception in this plugin, for dialogs opened from inside
   * Obsidian's own Settings window — which traps keyboard input for anything outside its DOM tree, so a popup
   * there is visible, focusable and silently unable to be typed into. Both of this one's entry points require a
   * reader with a book open (the pane menu, and a palette command gated on the active view), so a host is always
   * available and that reason never applies.
   *
   * `app` stays, separately: the folder picker needs the vault, not the reader.
   */
  host: OrbisPopupHost,
  initial: MarksPdfOptions,
  chapters: readonly MarkChapter[],
  /**
   * Do the export, saying how it is going and whether the dialog should close.
   *
   * **The dialog stays up while this runs.** Building a PDF of a whole book is not instant — a reader who
   * pressed Save and got their dialog dismissed has no way to tell a slow export from one that did nothing.
   * So Save disables itself, `report` writes under the buttons, and the dialog closes only on `true`.
   *
   * `false` means the export did not happen and the reader is still deciding — they cancelled the overwrite
   * prompt or the save dialog, or it failed — so the screen comes back exactly as they left it rather than vanishing.
   *
   * `destination` is which button was pressed: Save writes to the vault folder in the fold, and the other button —
   * Export on a computer, Share on a phone or tablet — sends the same PDF out of the vault. See `outsideRoute`.
   */
  onConfirm: (
    opts: MarksPdfOptions,
    report: (message: string) => void,
    destination: 'vault' | OutsideRoute
  ) => Promise<boolean>,
  /** False once the faces are cached, which is when the offer stops being worth making. */
  offerFonts = false,
  /**
   * Fill in the chapters the contents page could not name, once the dialog is up.
   *
   * Handed a repaint rather than returning names, because it writes them onto the choices in place and this
   * screen redraws from those on every tick — see `nameChapters`.
   *
   * `alive` is how it knows to stop. Naming a section means parsing it, so a dialog closed part-way through would
   * otherwise grind through the rest of a book nobody is looking at.
   */
  nameChapters?: (chapters: ChapterChoice[], onNamed: () => void, alive: () => boolean) => Promise<void>,
  /**
   * Everything the mark filter needs, or nothing to leave it out.
   *
   * **Handed in rather than derived here**, because grouping needs the whole annotation snapshot and this dialog
   * has deliberately never been given one — it takes the chapters already made. This keeps that true while letting
   * every number on screen answer to the filter: the summary line, the per-chapter counts, "only the chapters with
   * marks", and whether there is anything to write at all.
   *
   * `usage` is over the WHOLE book and does not move with the filter: the count beside a mark answers "how much of
   * this book carries it", which is what makes it useful for deciding, and a count that shrank as you chose would
   * be answering a different question every time you looked.
   */
  filter?: {
    marks: readonly AnnotationMark[];
    usage: ReadonlyMap<string, number>;
    regroup: (selection: MarkSelection) => RegroupedMarks;
  },
  /**
   * What this device can do instead of saving to the vault, or null for nothing — then the dialog has only Cancel and
   * Save, as it always had. Asked for by the caller, so a test can hand in either.
   */
  outside: OutsideRoute | null = null
): void {
  const opts: MarksPdfOptions = {
    ...initial,
    selection: { ...initial.selection, marks: new Set(initial.selection.marks) },
  };
  /** The digest as the filter currently leaves it. Starts as what was handed in, which is everything. */
  let marked: readonly MarkChapter[] = chapters;
  /**
   * Whether the chapter list is open, and how far down it is scrolled.
   *
   * **Kept out here, because every tick redraws the dialog.** Ticking a chapter changes the counts and the picker's
   * label, so the screen is rebuilt — and a fresh `<details>` is a closed one, which would shut the list the reader
   * is working through and take the box they just ticked out of reach with it.
   */
  const fold = { open: false, scroll: 0 };
  /**
   * Whether the destination fold is open, kept for the same reason: every control on this screen redraws it, and a
   * fresh `<details>` is a closed one — so changing the file name would have shut the form being typed into.
   */
  const filing: FilingState = { open: false };
  /** The same, for the byline's fold — see `renderAttribution`. */
  const attribution = { open: false };
  /** And for the filter's, which is shut on every open — a filter is a per-run decision, so it starts at none. */
  const marksFold = { open: false };
  const pillLabels = {
    sample: t('annotation_picker.mark_sample'),
    noMark: t('mark_filter.no_mark'),
    unnamed: t('presets.unnamed_mark'),
  };

  const { popupEl, close, reposition } = createOrbisPopup(host, {
    scrollsInside: true, // the buttons sit outside the scroll region — see below
    /**
     * **The dialog says which of the two it is**, because nothing else on the screen does.
     *
     * The only difference between the two screens is which rows are on them, and a reader who picked the wrong
     * menu item would otherwise have to infer that from an absence.
     *
     * `initial.scope` rather than `opts.scope`: the title is set once, when the popup is built, and the scope does
     * not change while the dialog is open. It is a fact about which command was run.
     */
    title: t(initial.scope === 'digest' ? 'marks_pdf.title_annotations' : 'marks_pdf.title_book'),
    // Badged by which command opened it, like the title above. The digest is an annotation export and wears the
    // Annotations mark; the book's text is a conversion and wears that one. One dialog, two systems — and the
    // badge is the fastest way a reader confirms which one they ran.
    icon: initial.scope === 'digest' ? annotationsSvg(16) : CONVERSION_SVG,
    // A chapter list halfway through being ticked is not something a stray click outside should throw away — the
    // same call the EPUB exports make.
    dismissOnOutsideClick: false,
    desktopWidth: 'min(620px, 90vw)',
    mobileMaxWidth: 420,
    // Content-heavy and nothing is auto-focused, so it takes the screen and scrolls rather than reserving the
    // upper half against a keyboard that only opens if you reach for the file name or the byline. As Export to
    // vault sets it.
    mobileFillHeight: true,
  });
  popupEl.addClass('orbis-form-dialog');
  /**
   * **The buttons sit outside the scroll region.**
   *
   * `createOrbisPopup` makes the popup itself the scroller, which would put Cancel and Save at the end of the
   * content — reachable only by scrolling past a forty-five-chapter list, which on a phone means not reachable.
   * So the popup `scrollsInside`: this body takes the space that is left and scrolls inside it, and the footer
   * beside it holds its ground. The same shape Generate Notes and the recordings dialog use.
   */
  const body = popupEl.createDiv({ cls: 'orbis-popup-scroll' });
  const stage = body.createDiv();
  /** Created once and emptied per render, because the buttons are rebuilt while the screen around them is. */
  const bar = actionRow(popupEl, { placement: 'footer' });
  /**
   * What the export is doing, beside the buttons rather than in the body.
   *
   * Outside `stage`, so it survives the redraws — and outside `bar`, so the row keeps its right-aligned
   * buttons while the status reads from the left. Empty and hidden until there is something to say.
   */
  const status = popupEl.createDiv({ cls: 'orbis-export-progress' });
  status.hide();
  // Above the buttons, not after them: appended last it would sit below the footer's own rule, outside the line
  // that separates the dialog from its actions, reading as something that had fallen off the bottom.
  popupEl.insertBefore(status, bar);

  /**
   * Re-derive everything the filter decides, then repaint.
   *
   * **Four things follow from a change here, and every one of them would be wrong if left alone.** The digest's
   * chapters are the summary line and the "nothing to write" guard; the per-chapter counts are what the list shows;
   * and *only the chapters with marks* is a rule whose answer just moved — a selection made under "every mark" is a
   * selection with no meaning once the filter narrows, exactly as it is when *Include marks* goes off.
   *
   * `custom` is left alone by `applyChapterScope`, which is right: ticks somebody placed by hand are not a rule to
   * re-derive.
   */
  const refilter = (): void => {
    if (!filter) return;
    const next = filter.regroup(opts.selection);
    marked = next.chapters;
    for (const chapter of opts.chapters) chapter.marks = next.perChapter.get(chapter.key) ?? 0;
    applyChapterScope(opts.chapters, opts.chapterScope);
    renderMain();
  };

  /** The filter's fold: what is chosen, and the two controls that change it. */
  const renderMarkFilter = (parent: HTMLElement): void => {
    if (!filter) return;
    const { usage } = filter;
    const allMarks = filter.marks;
    const inUse = allMarks.filter((m) => usage.has(m.id));
    const markById = new Map(allMarks.map((m) => [m.id, m]));
    // Nothing in the book carries a mark: a filter over an empty set can only ever produce nothing.
    if (!usage.size) return;
    const { body, paint } = answerFold(parent, {
      key: 'marks',
      label: t('marks_pdf.mark_filter'),
      value: () => {
        const names = chosenMarkNames(opts.selection.marks, allMarks, pillLabels);
        const kinds =
          opts.selection.passages && opts.selection.notes
            ? ''
            : opts.selection.passages
              ? t('marks_pdf.kind_passages')
              : t('marks_pdf.kind_notes');
        const marksPart = names.length ? names.join(', ') : t('marks_pdf.mark_filter_all');
        return kinds ? `${kinds} · ${marksPart}` : marksPart;
      },
      open: marksFold,
    });

    /**
     * Which kinds go in — two, not the advanced search's four.
     *
     * Search separates *Note selections* from *Note text* because they are two different places to MATCH text. An
     * export does no matching: a note either goes in or it does not, so the two collapse into one.
     */
    const kindRow = body.createDiv({ cls: 'orbis-adv-search-scopes' });
    const kind = (key: 'passages' | 'notes', label: string) => {
      const btn = kindRow.createEl('button', {
        cls: 'orbis-adv-scope-toggle',
        attr: {
          type: 'button',
          'aria-pressed': String(opts.selection[key]),
          'data-orbis-focus': `pdf-kind:${key}`,
        },
      });
      btn.createSpan({ cls: 'orbis-adv-scope-label', text: label });
      btn.toggleClass('is-active', opts.selection[key]);
      // At least one kind stays on: with both off the export is empty by construction. The last one on is locked,
      // with the reason below the pair — the rule every "at least one" list follows (settings.md); each change redraws
      // the dialog, so the lock moves with it.
      if (opts.selection[key] && !opts.selection[key === 'passages' ? 'notes' : 'passages']) btn.disabled = true;
      btn.addEventListener('click', () => {
        opts.selection = { ...opts.selection, [key]: !opts.selection[key] };
        refilter();
      });
    };
    kind('passages', t('marks_pdf.kind_passages'));
    kind('notes', t('marks_pdf.kind_notes'));
    if (opts.selection.passages !== opts.selection.notes) {
      body.createDiv({ cls: 'orbis-adv-mark-hint', text: t('marks_pdf.kind_min_one') });
    }

    body.createDiv({ cls: 'orbis-adv-mark-hint', text: t('marks_pdf.mark_filter_desc') });
    renderMarkChips(body, {
      chosen: opts.selection.marks,
      order: allMarks,
      marks: markById,
      labels: { ...pillLabels, remove: (name) => t('search_tab.remove_mark', { name }) },
      landing: { key: 'pick-marks', root: () => stage },
      onRemove: (id) => {
        const next = new Set(opts.selection.marks);
        next.delete(id);
        opts.selection = { ...opts.selection, marks: next };
        paint();
        refilter();
      },
    });

    const pick = body.createEl('button', {
      cls: 'orbis-adv-scope-toggle',
      attr: { type: 'button', 'data-orbis-focus': 'pick-marks' },
    });
    pick.createSpan({ cls: 'orbis-adv-scope-label', text: t('search_tab.select_marks') });
    // A child dialog, not a stage swap: this dialog is a form, and replacing it would take away the destination,
    // the chapter list and the button that runs the export. See the notes dialog for the same seam.
    pick.addEventListener('click', () => {
      const draft = new Set(opts.selection.marks);
      openOrbisDialog(app, { title: t('marks_pdf.mark_filter') }, (pickBody, closePick, _el, footer) => {
        const drawList = (): void => {
          pickBody.empty();
          renderMarkChoiceList(pickBody, {
            inUse,
            usage,
            marks: markById,
            chosen: draft,
            labels: {
              ...pillLabels,
              count: (n) => t('search_tab.mark_usage', { count: String(n) }),
              empty: t('search_tab.no_marks_in_book'),
            },
            onToggle: drawList,
          });
        };
        drawList();
        const btns = actionRow(footer(), { placement: 'inline', wrap: true });
        actionButton(btns, { label: t('action.cancel'), onClick: () => closePick() });
        actionButton(btns, {
          label: t('action.done'),
          cta: true,
          onClick: () => {
            closePick();
            opts.selection = { ...opts.selection, marks: draft };
            paint();
            refilter();
          },
        });
      });
    });
  };

  const renderMain = (): void => {
    // Read from the fold itself before this screen is thrown away — see `foldOpen` for why not from its event.
    const open = foldOpen(stage, 'chapters');
    if (open !== null) fold.open = open;
    // The same for the two folds above it: `foldOpen` reads the DOM rather than trusting the `toggle` event,
    // which on Android has not always fired by the time the repaint runs.
    const filingOpen = foldOpen(stage, 'filing');
    if (filingOpen !== null) filing.open = filingOpen;
    const byOpen = foldOpen(stage, 'attribution');
    if (byOpen !== null) attribution.open = byOpen;
    /**
     * **Where the reader was on the screen, kept across the redraw.**
     *
     * Every control here rebuilds the dialog, and a rebuilt dialog starts at the top — so turning the marks off,
     * which is a switch near the bottom, would throw the reader back to the title. Invisible on a desktop, where
     * the whole dialog fits; on a phone it is the length of the screen. The EPUB dialogs do the same.
     */
    const scroller = scrollParent(stage);
    const scrollTop = scroller?.scrollTop ?? 0;
    // Every control here redraws the screen — the scope buttons and the toggles all change what is below them — so
    // the keyboard has to be picked back up afterwards. See `captureFocus`.
    const restoreFocus = captureFocus(stage);
    stage.empty();

    const box = stage.createDiv({ cls: 'orbis-epub-summary' });
    const text = box.createDiv({ cls: 'orbis-epub-summary-text' });
    /**
     * The digest as BOTH controls leave it — the mark filter, then the chapters.
     *
     * `marked` is narrowed by the filter alone, because that is what the per-chapter counts have to report: a
     * chapter unticked must still say how much it holds, or the row that tells you what you are giving up empties
     * as you give it up. Everything the reader is told about the OUTPUT reads off this instead.
     */
    const shown = digestSelection(opts, marked);
    const counts = countMarks(shown);
    text.createDiv({
      cls: 'orbis-epub-summary-title',
      text: summaryLine(opts, counts.entries, shown.length),
    });
    /**
     * ── What to make ────────────────────────────────────────────────────
     *
     * **The command is the answer, so there is no control for it.** Everything below depends on the scope — the
     * byline fold appears only for the scopes that print one, and the chapter picker and the two switches exist
     * only for the book's text. All of that branches on `opts.scope`, which arrives fixed, from
     * `Save annotations as PDF` or `Save as PDF`, and nothing in the dialog can move it.
     *
     * The branching stays inline rather than splitting into two dialogs. Destination, chapter picking, the mark
     * filter, the fonts offer, progress and overwrite are common to both, and the differences are three rows —
     * two screens sharing one body.
     */
    renderDestination(stage, app, opts, initial, filing);

    /**
     * **Only where the byline is actually printed**, which is not the same as "wherever there are marks".
     *
     * A digest prints it unconditionally — `buildMarksPdf` puts the title, byline and legend inline at the top,
     * and has no cover sheet to turn off. The whole document prints it only on the cover sheet, and
     * `document-pdf.ts` draws that only when `coverSheet && includeMarks`. So with the document scope and the
     * cover sheet off, a name typed here would be written into a file that never shows it — a field that reads as
     * working and is not. The same holds for a book with nothing marked, where the cover sheet is never drawn.
     */
    if (opts.scope === 'digest' || (opts.includeMarks && opts.coverSheet && counts.entries > 0)) {
      renderAttribution(stage, opts, attribution);
    }

    /**
     * **Both scopes choose chapters, from one list.**
     *
     * A chapter with no marks contributes nothing to a digest already — which is true, and answers a different
     * question than the one people ask: "a PDF of just my notes on chapter 1". The digest's picker shows the
     * chapters that HOLD marks and nothing else, so the list is as long as your reading rather than as long as the
     * book.
     */
    if (opts.scope === 'digest') renderDigestChapters(stage, opts, fold, renderMain);
    if (opts.scope === 'document') {
      renderChapters(stage, opts, fold, renderMain);

      /**
       * Whether the marks are drawn at all.
       *
       * **Document mode only.** A digest is the marks; leaving them out of it produces nothing, so the switch
       * would be a control that empties the file. Here it is the difference between "here is your document back
       * with my comments" and "here is a PDF of this book", which are both things people want.
       *
       * Hidden entirely when the book has no marks — there is nothing to include, and a switch that changes
       * nothing invites the reader to wonder what it did.
       */
      if (counts.entries) {
        new Setting(stage)
          .setName(t('marks_pdf.include_marks'))
          .setDesc(t('marks_pdf.include_marks_desc'))
          .addToggle((tg) => {
            keyToggle(tg, 'include-marks');
            tg.setValue(opts.includeMarks).onChange((v) => {
              opts.includeMarks = v;
              // A selection made by "only the chapters with marks" is a selection with no meaning once the
              // marks are out, and leaving it would quietly export six chapters of a thirty-four chapter book.
              if (!v && opts.chapterScope === 'marked') {
                opts.chapterScope = 'all';
                applyChapterScope(opts.chapters, 'all');
              }
              renderMain();
            });
          });
      }

      /**
       * The cover sheet, asked only when there are marks to explain.
       *
       * **Hidden rather than disabled or inert.** Its content IS the legend, and the writer refuses to print one
       * with nothing to explain — so with the marks out this switch cannot do anything whatever it says. Disabling
       * it would decide for the reader; leaving it live would be worse, a switch that does nothing.
       * Hiding it is the same answer this dialog already gives twice: the marks switch above is absent when the
       * book has no marks, and the whole chapter section is absent for a digest. A question that cannot apply is
       * not asked.
       *
       * The reader's own answer is left alone while it is hidden, so putting the marks back brings back the choice
       * they made rather than a default. The value is the one the settings tab holds — one value with two places to
       * edit it beats a default and an override that have to be told apart.
       */
      if (opts.includeMarks && counts.entries) {
        new Setting(stage)
          .setName(t('marks_pdf.cover'))
          .setDesc(t('marks_pdf.cover_desc'))
          .addToggle((tg) => {
            keyToggle(tg, 'cover');
            tg.setValue(opts.coverSheet).onChange((v) => {
              opts.coverSheet = v;
              // Repaints, like every other control here: the byline's fold above is shown only where the byline
              // is actually printed, and in this scope that is on the cover sheet. The keyboard comes back to it
              // through `data-orbis-focus` — see `captureFocus`.
              renderMain();
            });
          });
      }
    }

    /**
     * ── Filter by mark ──────────────────────────────────────────────────
     *
     * **Offered wherever the marks are actually drawn.** A digest IS the marks, so it is always available there.
     * The whole document draws them only when *Include marks* is on, and a filter over marks that are not being
     * printed is a control with nothing to decide — so it goes with them.
     *
     * Shut by default, and its header states the answer, which is the safeguard rather than the decoration: a shut
     * fold over an active filter is how somebody exports a fraction of their marks and does not notice.
     */
    if (filter && (opts.scope === 'digest' || opts.includeMarks)) renderMarkFilter(stage);

    /**
     * The one-time font download, offered where the decision is made rather than in settings.
     *
     * Pre-checked because the answer is almost always yes: without it the page falls back to the built-in fonts,
     * which hold about 220 characters, and an arrow or a Greek word prints as `?`. It disappears for good once
     * the faces are cached.
     */
    if (offerFonts) {
      new Setting(stage)
        .setName(t('marks_pdf.fonts'))
        .setDesc(t('marks_pdf.fonts_desc', { size: String(FONT_DOWNLOAD_MB) }))
        .addToggle((tg) => {
          keyToggle(tg, 'fonts');
          tg.setValue(opts.downloadFonts).onChange((v) => {
            opts.downloadFonts = v;
          });
        });
    }

    // A digest needs something to digest; the whole document needs a chapter. Both are reachable states, and
    // neither is worth writing a file for.
    // Both scopes can be narrowed to nothing, and `counts` already follows the chapter selection for a digest.
    const nothingToWrite = opts.scope === 'document' ? !opts.chapters.some((c) => c.included) : !counts.entries;
    if (nothingToWrite) {
      stage.createDiv({
        cls: 'orbis-checklist-note-empty',
        text: t(opts.scope === 'document' ? 'marks_pdf.no_chapters' : 'marks_pdf.no_marks'),
      });
    }
    /**
     * In the FOOTER, not at the end of the body: that is where a dialog's buttons live across the plugin, and it
     * is what carries the separator, the spacing and the phone's safe-area inset. Emptied first, because this
     * screen is redrawn on every change and the footer is not part of what `stage.empty()` clears.
     */
    bar.empty();
    const actions = bar;
    /**
     * Run the export to `destination`, from the button the reader pressed.
     *
     * **The dialog stays, and says what it is doing.**
     *
     * A book's PDF takes long enough on a desktop to notice and longer on a phone, and a dialog that
     * vanished the instant Save was pressed would leave no way to tell a slow export from one that
     * silently did nothing. The buttons go quiet, the status line under them fills in, and the
     * screen closes only once the file is written or handed to the share sheet.
     *
     * Rebuilding the screen while it runs would replace the very buttons being disabled, so the
     * status is written straight into the DOM rather than through `renderMain`.
     */
    const run = (destination: 'vault' | OutsideRoute, pressed: HTMLButtonElement): void => {
      void (async () => {
        for (const b of Array.from(bar.querySelectorAll('button'))) b.disabled = true;
        status.show();
        status.setText(t('marks_pdf.working'));
        const done = await onConfirm(opts, (message) => status.setText(message), destination);
        if (done) {
          close();
          return;
        }
        /**
         * Not saved, and the reader is still deciding — they cancelled the overwrite prompt or the save dialog,
         * or it failed. The screen comes back exactly as they left it.
         *
         * **Whatever was reported last stays on screen**, because a failure has something to say and a
         * cancellation does not. The caller clears the line itself when there is nothing to report, so this
         * does not have to guess which of the two happened.
         */
        if (!status.textContent) status.hide();
        for (const b of Array.from(bar.querySelectorAll('button'))) b.disabled = false;
        /**
         * **This screen takes its own keyboard back**, onto the button that was pressed.
         *
         * A prompt closing hands focus to whatever opened it, and what opened this one was a button that is
         * DISABLED for the duration, so there is nothing there to hand it to and the keyboard would fall
         * through to the book. Leaving it to the prompt would also make the answer depend on how it was
         * dismissed. The dialog is still on screen and knows which control the reader was on, so it puts
         * the keyboard back itself, once the buttons can hold it.
         */
        (pressed.isConnected ? pressed : popupEl).focus();
      })();
    };
    /**
     * **Set apart at the start of the row**, the place `orbis-action-aside` gives an alternative: Cancel and Save stay
     * the pair every dialog ends with, and this reads as another destination rather than a third step. Named for
     * what the device does — Export opens the system save dialog, Share the share sheet — and absent where neither
     * route exists.
     */
    if (outside) {
      const aside = actionButton(actions, {
        label: t(outside === 'export' ? 'action.export' : 'action.share'),
        disabled: nothingToWrite,
        onClick: () => run(outside, aside),
      });
      aside.addClass('orbis-action-aside');
    }
    actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
    const save = actionButton(actions, {
      label: t('marks_pdf.save'),
      cta: true,
      disabled: nothingToWrite,
      onClick: () => run('vault', save),
    });
    // After the rebuild: the height has changed (rows appear and disappear), so this restores the position rather
    // than the exact pixel.
    if (scroller && scrollTop) scroller.scrollTop = scrollTop;
    // The mobile height cap is measured once, from the viewport, not from the content — so a screen that grows
    // (the chapter fold opening, the marks switch adding rows) has to say so or it is capped at the height it
    // had when it opened. See docs/design/dialog-system.md, "Dynamic content".
    reposition();
    restoreFocus();
  };

  renderMain();
  // After the screen exists, never before it: rendering sections to name them is the cost this dialog avoids by
  // not analysing anything up front.
  void nameChapters?.(
    opts.chapters,
    () => {
      if (stage.isConnected) renderMain();
    },
    () => stage.isConnected
  );
}

/**
 * What the file will hold, in one line — **the only place on this screen that reports an outcome**.
 *
 * Everything below it describes a CHOICE instead: the note under the picker says what the two artifacts are, the
 * chapter picker says how much of the book, the marks switch says whether they are drawn. Each control explains
 * itself and this line adds them up, so no fact is stated twice.
 *
 * A static note describing the output — "with your marks drawn where you made them" — would go on saying that with
 * the marks switched off; one that changed would put a paragraph near the top of the dialog that mutates when you
 * flip a switch near the bottom, saying the same thing this line already says. Reporting belongs in one place, above
 * everything that changes it.
 *
 * `markedChapters` is the count of chapters that HAVE marks — `groupMarksByChapter` drops the rest — which is the
 * number a digest is measured in. The whole-document line counts the spine instead, because that is what its picker
 * chooses from.
 */
export function summaryLine(opts: MarksPdfOptions, entries: number, markedChapters: number): string {
  // A digest is its marks, so scope has nothing to say about it. "0 marks and notes across 0 chapters" is a
  // sentence about nothing, which is why the empty book gets its own line.
  if (opts.scope === 'digest') {
    if (!entries) return t('marks_pdf.summary_none');
    const n = String(entries);
    const chapters = String(markedChapters);
    if (entries === 1)
      return markedChapters === 1 ? t('marks_pdf.summary_one_both') : t('marks_pdf.summary_one_mark', { chapters });
    return markedChapters === 1 ? t('marks_pdf.summary_one_chapter', { n }) : t('marks_pdf.summary', { n, chapters });
  }
  const included = opts.chapters.filter((c) => c.included).length;
  const whole = included === opts.chapters.length;
  const n = { n: String(included), total: String(opts.chapters.length) };
  // Nothing marked in the book at all: say nothing about marks. The switch that would decide it is hidden in that
  // state, and so is the cover sheet — a line announcing the absence of something you cannot ask for reads as a
  // fault rather than a description.
  if (!entries) return whole ? t('marks_pdf.summary_book') : t('marks_pdf.summary_some', n);
  if (opts.includeMarks) return whole ? t('marks_pdf.summary_book_marks') : t('marks_pdf.summary_some_marks', n);
  return whole ? t('marks_pdf.summary_book_plain') : t('marks_pdf.summary_some_plain', n);
}

/**
 * Where the PDF goes, and what it is called — a fold whose header is its own answer, through `answerFold`.
 *
 * The two rows are a `90px 1fr` grid rather than stacked settings rows: three stacked rows with dividers fill a
 * screen for three short fields.
 */
function renderDestination(
  stage: HTMLElement,
  app: App,
  opts: MarksPdfOptions,
  initial: MarksPdfOptions,
  filing: FilingState
): void {
  const { body, paint } = answerFold(stage, {
    key: 'filing',
    label: t('epub_export.save_to_label'),
    value: () => marksPdfPath(opts),
    path: true,
    open: filing,
  });

  destinationGrid(body, {
    app,
    folder: () => opts.folder,
    onFolder: (v) => {
      opts.folder = v;
      paint();
    },
    name: () => opts.fileName,
    onName: (v) => {
      opts.fileName = v;
      paint();
    },
    nameKey: 'pdf-file-name',
    fallback: () => initial.fileName,
    held: filing,
    ext: '.pdf',
  });
}

/**
 * Whose marks these are — **a fold whose header is the name**, beneath the one whose header is the path.
 *
 * The same shape as the destination above it, for a field with the same property: it has an answer worth seeing at a
 * glance and controls worth hiding. Out in the open it would take the most prominent row in the dialog for the thing
 * least often filled in.
 *
 * Blank reads as *No name* in the header — the words the summary line uses for this, so an empty byline
 * is stated rather than left as a gap someone has to interpret.
 */
function renderAttribution(stage: HTMLElement, opts: MarksPdfOptions, fold: { open: boolean }): void {
  const { body, paint } = answerFold(stage, {
    key: 'attribution',
    label: t('marks_pdf.attribution'),
    value: () => opts.attribution,
    empty: t('marks_pdf.no_attribution'),
    path: true,
    open: fold,
  });

  body.createDiv({ cls: 'orbis-epub-note', text: t('marks_pdf.attribution_desc') });
  const input = body.createEl('input', { type: 'text', cls: 'orbis-input-full' });
  input.value = opts.attribution;
  input.dataset.orbisFocus = 'attribution';
  input.placeholder = t('marks_pdf.no_attribution');
  input.setAttribute('aria-label', t('marks_pdf.attribution'));
  input.addEventListener('input', () => {
    opts.attribution = input.value.trim();
    // The header is the answer, so it keeps up with the field under it — including the moment it goes empty again.
    paint();
  });
}

/**
 * Which chapters go in, and a list saying which ones have anything in them.
 *
 * **The picker gains "(customized)" the moment a box is ticked**, the same way the EPUB order picker does — a
 * control that still says "All" while three chapters are excluded is a control that lies. Choosing a rule again
 * re-applies it, which is also the way back from a custom selection.
 *
 * The list is behind a fold and closed: a book has as many rows as it has chapters, and on a phone an open list
 * pushes the buttons off the screen. The summary carries the count that matters — how many are going in.
 */
function renderChapters(
  stage: HTMLElement,
  opts: MarksPdfOptions,
  fold: { open: boolean; scroll: number },
  repaint: () => void
): void {
  // A book with one chapter has nothing to pick between, and a list of one is a control that decides nothing —
  // the rule Generate notes' own picker follows. Reachable because a row is a contents entry: a book with no
  // contents page is one implicit chapter.
  if (opts.chapters.length < 2) return;
  const included = opts.chapters.filter((c) => c.included).length;
  const marked = opts.chapters.filter((c) => c.marks > 0).length;

  /**
   * **Through `answerFold`, like every other fold in these dialogs.** The label and the answer are drawn apart, so
   * the line does not inherit the summary's own weight and read as bold beside the faint-label folds either side.
   */
  const { body: details } = answerFold(stage, {
    key: 'chapters',
    label: t('marks_pdf.chapters'),
    value: () => t('marks_pdf.chapters_value', { n: String(included), total: String(opts.chapters.length) }),
    open: fold,
    // The list brings `.orbis-list-box` with it — see `bare`.
    bare: true,
  });
  /**
   * The shared bulk buttons — see `pickListHeader`. No label here: the fold's own summary directly above already
   * says `Chapters · 45 of 45`, and repeating it two lines apart is noise.
   *
   * These do not replace the rule picker above the fold. That offers "Only the 6 with marks", which is
   * content-aware and re-applies as the marks change; these are bulk actions on the rows as they stand. Every one
   * of them makes the selection a custom one, so the picker stops claiming a rule it no longer follows.
   */
  const setAll = (next: (wasOn: boolean) => boolean): void => {
    for (const chapter of opts.chapters) chapter.included = next(chapter.included);
    opts.chapterScope = 'custom';
    repaint();
  };
  /**
   * The rule, INSIDE the fold with the list it governs.
   *
   * Above the fold as a card of its own, it would put the word "Chapters" on screen twice — once naming the card,
   * once naming the fold three lines below it — and make the two say the same number twice over, `All 13
   * chapters` against `13 of 13`. One entry point instead: the header states the answer the rule produces, and
   * opening it shows the rule and the list that departs from it as the two halves of one question they are.
   *
   * **No visible label**, for the same reason: the fold above it is the label. The dropdown keeps an accessible
   * name, since a control announced as nothing is a control a screen reader cannot use.
   *
   * The cost, stated: changing the rule needs the fold open, rather than being always on screen. The header
   * still reports the answer while shut, and reading a rule is commoner than changing one.
   */
  const row = new Setting(details).addDropdown((d) => {
    d.selectEl.dataset.orbisFocus = 'chapter-scope';
    d.selectEl.setAttribute('aria-label', t('marks_pdf.chapters'));
    d.addOption('all', t('marks_pdf.chapters_all', { n: String(opts.chapters.length) }));
    // "Only the 6 with marks" is not a way of choosing chapters in a PDF that will not show the marks.
    if (opts.includeMarks) d.addOption('marked', t('marks_pdf.chapters_marked', { n: String(marked) }));
    if (opts.chapterScope === 'custom') d.addOption('custom', t('marks_pdf.chapters_custom', { n: String(included) }));
    d.setValue(opts.chapterScope).onChange((v) => {
      opts.chapterScope = v === 'marked' ? 'marked' : v === 'custom' ? 'custom' : 'all';
      applyChapterScope(opts.chapters, opts.chapterScope);
      repaint();
    });
  });
  row.settingEl.addClass('orbis-setting-stacked');

  // The header and the rows on one surface — see `.orbis-list-box`. Without the box this list would be bare
  // rows between the fold's summary and the toggle below it, with no edge saying where the scroll began.
  const box = details.createDiv({ cls: 'orbis-list-box' });
  pickListHeader(box, {
    onSelectAll: () => setAll(() => true),
    onClear: () => setAll(() => false),
    onInvert: () => setAll((on) => !on),
  });

  const list = pickList(box, { plain: true });
  // Where the reader was in the list, remembered across the redraw a tick causes. A closed fold gives its children
  // no layout, so this is only meaningful — and only read — while the list is on screen.
  list.addEventListener('scroll', () => {
    fold.scroll = list.scrollTop;
  });
  opts.chapters.forEach((chapter, i) => {
    pickRow(list, {
      // Numbered while the names are still arriving, and numbered for good if the section offers no heading —
      // the same words `nameChapters` writes, so a row goes from "Section 1" to a real name rather than from
      // "Untitled" to one. Only an unlisted row is ever nameless: a contents entry brings its own label.
      label: chapter.title || t('book_export_modal.section_n', { n: String((chapter.index ?? 0) + 1) }),
      note: chapter.marks
        ? t(chapter.marks === 1 ? 'marks_pdf.chapter_marks_one' : 'marks_pdf.chapter_marks', {
            n: String(chapter.marks),
          })
        : t('marks_pdf.chapter_none'),
      noteMuted: !chapter.marks,
      checked: chapter.included,
      // Keyed by chapter, not by position: ticking one redraws the whole dialog (the counts and the picker's label
      // both change), so the box has to be findable again afterwards.
      key: `chapter:${i}`,
      onChange: (on) => {
        opts.chapters[i].included = on;
        // Ticking a box IS the custom selection, so the picker above stops claiming a rule it no longer follows.
        opts.chapterScope = 'custom';
        repaint();
      },
    });
  });
  // After the rows exist, and only when the fold is open — a closed one has no scroll to restore.
  if (fold.open) list.scrollTop = fold.scroll;
}
