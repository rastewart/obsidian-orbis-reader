// The one dialog Markdown → EPUB has: what the book is, where it goes, how it is cut, and what will not carry over.
//
// Its point is that choosing a split level is a decision you can SEE — the section list refreshes as you change it,
// so a forty-section book is obvious before you make one rather than after. See docs/design/markdown-to-epub.md.

import { type App, ButtonComponent, Setting, TFile, type TFolder } from 'obsidian';
import {
  actionButton,
  actionRow,
  fieldCell,
  fieldGrid,
  fieldInput,
  pickList,
  pickListHeader,
  pickRow,
} from './controls';
import { epubFontOptions, epubFontValue } from './epub-font';
import { orderNotes } from './folder-epub';
import { destinationGrid, type FilingState } from './folder-picker';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { recordCandidates, valueCounts } from './library/candidates';
import { fieldValuesFor } from './library/fields';
import {
  analyseFolder,
  analyseNote,
  type EpubConversion,
  epubDefaults,
  epubTargetPath,
  type FolderAnalysis,
  type FolderConversion,
  folderChapters,
  folderDefaults,
  indexLinkOrder,
  type NoteAnalysis,
  renderForAnalysis,
  type SeparateConversion,
  separateDefaults,
  separatePaths,
} from './markdown-epub';
import { openOrbisDialog } from './OrbisModal';
import { type OutsideRoute, type OutsideTarget, outsideButton } from './outside-vault';
import { reorderControls } from './reorder-controls';
import { offeredLevels, resolveSplitLevel, type SplitLevel } from './split-level';
import { CONVERSION_SVG } from './system-glyphs';
import {
  answerFold,
  captureFocus,
  createCollapsibleNote,
  foldOpen,
  pinModalAboveKeyboard,
  scrollParent,
} from './ui-utils';

/**
 * Where a conversion cuts its chapters — **a dropdown of the levels the content actually has**.
 *
 * Not a row of buttons wearing `.orbis-adv-scope-toggle`, which everywhere else in the plugin is an independent
 * on/off toggle: four search scopes, Match case, Whole word. Here the choice is "pick exactly one of five", and a
 * style built to read as on-or-off cannot make one option beat four others — a selected level would look like
 * nothing at all, and a selected level that was also DISABLED like less than nothing.
 *
 * Three things follow from a dropdown:
 *
 * - **Levels the content has none of are left out.** In a row of buttons the visible set reads as the whole set,
 *   so hiding H3 would raise "is that option missing?"; a dropdown is not read as an inventory. A note with one
 *   H3 offers two answers rather than six with four dead.
 * - **H5 and H6 are reachable.** A dropdown has no layout budget, where seven buttons wrap to three rows on a
 *   phone — and a cap is not a claim about how people organize books.
 * - **The selection can never be an option that is not offered**, which is what `resolveSplitLevel` guarantees
 *   and the round-trip test in `split-level.test.ts` pins.
 *
 * Returns nothing: `onPick` repaints, as every control on these screens does.
 */
function renderSplitPicker(opts: {
  stage: HTMLElement;
  headingCounts: readonly number[];
  level: SplitLevel;
  /** What `0` is called here: "One section" for a note, "One per note" or "Don't split" for the two folder ones. */
  noneLabel: TranslationKey;
  desc: TranslationKey;
  onPick: (level: SplitLevel) => void;
}): void {
  const levels = offeredLevels(opts.headingCounts);

  /**
   * **A statement, not a control, when there is nothing to split.** A dropdown with one option is a control that
   * cannot do anything, which invites the reader to wonder what it did — the same answer the PDF dialog gives
   * three times over for a question that cannot apply.
   */
  if (levels.length === 1) {
    new Setting(opts.stage).setName(t('epub_export.split_heading')).setDesc(t('epub_export.split_none_available'));
    return;
  }

  const row = new Setting(opts.stage).setName(t('epub_export.split_heading')).setDesc(t(opts.desc));
  row.settingEl.addClass('orbis-setting-stacked');
  row.addDropdown((d) => {
    // Keyed: picking a level redraws the whole screen, so a restore by position would land on whatever now sits
    // where this select was. See `captureFocus`.
    d.selectEl.dataset.orbisFocus = 'split-level';
    for (const level of levels) {
      d.addOption(
        String(level),
        level === 0
          ? t(opts.noneLabel)
          : // The count is headings at that level, not the sections it yields — a note with text before its first
            // heading gains a leading section. The list below reports the sections; this reports what you are
            // cutting at, which is the thing the label names.
            `${t('epub_export.split_level', { n: String(level) })} · ${plural(
              opts.headingCounts[level - 1] ?? 0,
              'epub_export.split_headings_n'
            )}`
      );
    }
    d.setValue(String(opts.level)).onChange((v) => opts.onPick(Number(v)));
  });
}

/**
 * How these three dialogs meet the on-screen keyboard.
 *
 * **Once, when the dialog opens** — not per render, and not per stage: the text fields live in folds on the main
 * screen.
 *
 * `reserve` rather than the default lift: capping the height puts a form into half a phone screen the moment the
 * first field is tapped, and leaves it there. The reserve keeps the
 * dialog's own shape and adds the keyboard's share as padding under the last field only while something is
 * focused — which suits a long dialog you work down. See `pinModalAboveKeyboard`.
 */
const pinForm = (modalEl: HTMLElement): (() => void) =>
  pinModalAboveKeyboard(modalEl, undefined, { layout: 'reserve' });

/** The value of the "(customized)" entry the order picker grows once rows have been moved. Not a vault path, so it
 *  cannot collide with one. */
const CUSTOM_ORDER = '\u0000custom';

/**
 * A counted string, with a real singular.
 *
 * `t()` has no plural machinery, and the convention in this codebase is a `_one` key picked at the call site — so
 * this is that convention, in one place, for the four counts on these screens. `1 note(s)` is the thing it exists
 * to stop: it reads as a placeholder someone forgot to finish.
 */
function plural(n: number, key: TranslationKey, vars: Record<string, string> = {}): string {
  return t(n === 1 ? (`${key}_one` as TranslationKey) : key, { n: String(n), ...vars });
}

/**
 * The note list both folder dialogs own: which notes, in what order, and the state of the control showing them.
 *
 * Both dialogs have the same order picker. The two screens differ in their vocabulary and in what the order MEANS —
 * a spine in one, a contents note in the other — and in nothing else about this, so two copies of the seeding, the
 * re-seeding and the fold bookkeeping would be two chances to fix a bug once.
 */
interface NoteListState {
  /** Every note in the folder, including excluded ones — a chapter you cannot see is one you cannot put back. */
  rows: ChapterRow[];
  drag: { from: number | null };
  fold: { open: boolean; scroll: number };
  reordered: boolean;
}

function createNoteListState(app: App, folder: TFolder): NoteListState {
  return {
    rows: folderChapters(app, folder).map((c) => ({ ...c, included: true })),
    drag: { from: null },
    fold: { open: false, scroll: 0 },
    reordered: false,
  };
}

/**
 * Re-seed the list from whatever the order now comes from.
 *
 * Changing the source is a request to start again from it, so a hand reorder is discarded along with the note it
 * was based on — silently keeping the old sequence under a new heading would be the worse surprise. `orderNotes` is
 * the same function the default came from, so picking a note here produces exactly what choosing it up front would
 * have.
 */
function reseedNotes(app: App, state: NoteListState, source: string | null): void {
  const note = source ? app.vault.getAbstractFileByPath(source) : null;
  const linked = note instanceof TFile ? indexLinkOrder(app, note) : [];
  const index = state.rows.find((r) => r.path === source) ?? null;
  state.rows.splice(0, state.rows.length, ...orderNotes(state.rows, index, linked).ordered);
  state.reordered = false;
}

/** How many chosen notes the seed note does not link to — counted against whichever note that is, which is why it
 *  cannot come from the analysis. */
function appendedCount(app: App, chosen: readonly string[], source: string | null): number {
  const note = source ? app.vault.getAbstractFileByPath(source) : null;
  if (!(note instanceof TFile)) return 0;
  const linked = new Set(indexLinkOrder(app, note));
  return chosen.filter((p) => p !== note.path && !linked.has(p)).length;
}

/**
 * The order picker: file names, or a note whose links set the order — and, once rows have been moved, an extra
 * `(customized)` entry sitting after the seed it came from.
 *
 * An extra entry rather than a rename, so the untouched order is still in the list and one tap away. Renaming the seed
 * would leave "go back to how it was" with nowhere to click: the only entry that would restore it would be the one
 * already labeled as customized. Keeping the seed's name in the label is the whole point of the marker — a bare
 * "Custom order" answers "is this yours" and throws away "what did it start from".
 *
 * `name` and `desc`/`more` differ per dialog because the order means different things in them; everything else here
 * is identical, which is why it is one function.
 */
/** The chapter list's wiring: the same three callbacks in both dialogs, and the same repaint after each. */
function listOptions(state: NoteListState, applyRows: () => void, repaint: () => void): ChapterListOpts {
  return {
    rows: state.rows,
    drag: state.drag,
    fold: state.fold,
    reordered: state.reordered,
    move: (from, to) => {
      const [moved] = state.rows.splice(from, 1);
      state.rows.splice(to, 0, moved);
      state.reordered = true;
      applyRows();
      repaint();
    },
    toggle: (i, on) => {
      state.rows[i].included = on;
      applyRows();
      repaint();
    },
    setAll: (next) => {
      for (const row of state.rows) row.included = next(row.included);
      applyRows();
      repaint();
    },
  };
}

function renderOrderPicker(opts: {
  stage: HTMLElement;
  state: NoteListState;
  source: string | null;
  name: TranslationKey;
  desc: TranslationKey;
  more: TranslationKey;
  onPick: (source: string | null) => void;
}): void {
  const { stage, state } = opts;
  const row = new Setting(stage).setName(t(opts.name));
  row.settingEl.addClass('orbis-setting-stacked');
  // The first sentence stands alone; the rest is help that earns its keep once and is in the way every time after.
  createCollapsibleNote(row.descEl, t(opts.desc), t(opts.more));
  row.addDropdown((d) => {
    // Keyed: picking an order redraws the whole screen, and a restore by position would land on whatever now sits
    // where this select was. See `captureFocus`.
    d.selectEl.dataset.orbisFocus = 'order-source';
    d.addOption('', t('epub_export.order_by_filename'));
    // **File names, not titles.** This answers "which note", and a title cannot: two notes can share an `h1`, and
    // nothing in one tells you which file you got. It is also what the file explorer, the chapter list and the
    // generated EPUB names all call it.
    for (const r of state.rows) d.addOption(r.path, r.basename);
    const seed = opts.source ?? '';
    if (state.reordered) {
      const label = opts.source
        ? (state.rows.find((r) => r.path === opts.source)?.basename ?? seed)
        : t('epub_export.order_by_filename');
      const marker = d.selectEl.createEl('option', {
        text: t('epub_export.order_customized', { name: label }),
        attr: { value: CUSTOM_ORDER },
      });
      d.selectEl.querySelector<HTMLOptionElement>(`option[value="${CSS.escape(seed)}"]`)?.after(marker);
    }
    d.setValue(state.reordered ? CUSTOM_ORDER : seed).onChange((v) => {
      // Choosing the marker itself is a no-op: it describes the state rather than being a way into it.
      if (v === CUSTOM_ORDER) return;
      opts.onPick(v || null);
    });
  });

  /**
   * The chosen note's title, under the picker and **labeled**.
   *
   * Unlabelled it reads as a stray line of prose between two controls — the one thing a caption must not do.
   * `Title:` rather than `Heading:` because the value is not always a heading: it is the note's `h1`, then its
   * frontmatter `title`, then its file name, and a label wrong for two of those three is worse than one that is
   * general.
   */
  const chosen = state.rows.find((r) => r.path === opts.source);
  if (chosen) {
    const caption = stage.createDiv({ cls: 'orbis-epub-toc-title' });
    caption.createSpan({ cls: 'orbis-epub-toc-label', text: t('epub_export.toc_title_label') });
    caption.createSpan({ text: chosen.title });
  }
}

/** The one type the save dialog offers. The format's own name, which is not translated. */
const EPUB_FILTER = { name: 'EPUB', extension: 'epub' };
// Only the dialogs that write ONE book offer Export or Share (`outsideButton`). Separate books are a set and a
// contents note, which belong in the vault together, and Read in Orbis Reader shares this converter but never asks.

/**
 * Ask what to convert, then hand the answer back.
 *
 * `onConfirm` runs only on the confirm button; dismissing the dialog any other way is a cancel. The note is rendered
 * ONCE on open and re-partitioned as the level changes, because re-rendering to answer "what if H3" would make the
 * picker feel like the conversion.
 *
 * **Two stages**, as advanced search has: this screen, and a metadata editor that replaces it. Identical on every
 * platform — the phone is where the problem is most visible, not a case with its own behavior.
 */
export function openEpubExport(
  app: App,
  file: TFile,
  opts: {
    keyLang: string;
    sameFolderAsNote: boolean;
    folder: string;
    fetchRemoteImages: boolean;
    defaultType?: string;
    /** The font to embed, from settings — see `epub-font.ts`. */
    font?: string;
    splitLevel?: number;
    libraryOn?: boolean;
  },
  /** `target` is set when the book goes out of the vault rather than into it — see `outsideButton`. */
  onConfirm: (conv: EpubConversion, target?: OutsideTarget) => void,
  /** What this device can do instead of saving to the vault, or null to offer only Convert. */
  outside: OutsideRoute | null = null
): void {
  const conv: EpubConversion = epubDefaults(app, file, opts);
  // Opened once, open thereafter: a fold that shuts itself every time you use it is worse than no fold.
  const detailsOpen = { open: false };
  const filingOpen: FilingState = { open: false };
  // The rendered note outlives the first paint — it is re-partitioned on every level change — so it is released when
  // the dialog closes, however it closed.
  let host: HTMLElement | null = null;
  let unpin: () => void = () => {};

  openOrbisDialog(
    app,
    {
      title: t('epub_export.title'),
      icon: CONVERSION_SVG,
      onClose: () => {
        unpin();
        host?.remove();
        host = null;
      },
    },
    (body, close, modalEl, footer) => {
      // Left-aligned stacked controls — see the rule in styles.css.
      modalEl.addClass('orbis-form-dialog');
      const stage = body.createDiv();
      unpin = pinForm(modalEl);

      const renderMain = (): void => {
        // The folds' state, read from the elements before this screen goes — see `foldOpen`.
        const openDetails = foldOpen(stage, 'details');
        if (openDetails !== null) detailsOpen.open = openDetails;
        const openFiling = foldOpen(stage, 'filing');
        if (openFiling !== null) filingOpen.open = openFiling;
        // Every control on this screen repaints it — the level buttons and the image toggle both change what is
        // below them — and rebuilding the DOM resets the scroll. Without this, toggling images at the bottom of the
        // dialog throws you back to the title.
        const scroller = scrollParent(stage);
        const scrollTop = scroller?.scrollTop ?? 0;
        // And the keyboard: the chapter arrows carry keys, so a press keeps the reader on the chapter it moved
        // rather than dropping them at the top of the dialog. See `captureFocus`.
        const restoreFocus = captureFocus(stage);
        stage.empty();
        const title = renderSummary(stage, conv);
        renderDestination(stage, app, conv, file.basename, filingOpen, '.epub');
        renderBookDetails(app, stage, conv, file.basename, detailsOpen, opts.libraryOn, title, renderMain);

        if (host) {
          /**
           * **The preference meets the note here**, and only here — settings cannot know what a note contains.
           *
           * A second analysis when the level moves, because `analyseNote` partitions AT the level it is given: the
           * section list from the first pass describes a cut that is no longer the one being made. Cheap — it
           * queries a host that is already rendered — and it runs at most once per repaint, since the resolved
           * level is by construction one the content has.
           */
          let analysis = analyseNote(app, host, conv, file.path);
          const resolved = resolveSplitLevel(conv.splitLevel, analysis.headingCounts);
          if (resolved !== conv.splitLevel) {
            conv.splitLevel = resolved;
            analysis = analyseNote(app, host, conv, file.path);
          }
          renderAnalysis(stage, analysis, conv, renderMain);
        }
        // Everything below the folder needs the rendered note, which is async. Say so rather than showing a gap.
        else stage.createDiv({ cls: 'orbis-epub-note', text: t('epub_export.analysing') });

        // In the footer, which owns the padding, the separator and the phone's safe-area inset — see
        // `InlineOrbisModal.renderDialog`. Emptied first: this screen redraws on every change, and the footer is not
        // part of what `stage.empty()` clears.
        const bar = footer();
        bar.empty();
        const actions = actionRow(bar);
        outsideButton(actions, outside, {
          disabled: !host,
          name: () => epubTargetPath(conv).split('/').pop() ?? '',
          filter: EPUB_FILTER,
          onTarget: (target) => {
            onConfirm(conv, target);
            close();
          },
        });
        actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
        actionButton(actions, {
          label: t('epub_export.convert'),
          cta: true,
          disabled: !host, // nothing to convert until the note has been read
          onClick: () => {
            onConfirm(conv);
            close();
          },
        });

        // After the rebuild, not before: the height has changed (warnings appear and disappear), so this restores
        // the position rather than the exact pixel — which is the difference between a small shift and a jump home.
        if (scroller && scrollTop) scroller.scrollTop = scrollTop;
        restoreFocus();
      };

      renderMain();

      void (async () => {
        const rendered = await renderForAnalysis(app, file);
        // Dismissed while the note was rendering: `onClose` has already run, so clean up here instead of leaking.
        if (!stage.isConnected) {
          rendered.remove();
          return;
        }
        host = rendered;
        renderMain();
      })();
    }
  );
}

/**
 * The metadata editor, shared by the note and folder dialogs.
 *
 * One action for all four fields rather than a pencil each: four affordances for a task you will rarely do, and
 * fixing two of them would otherwise mean two round-trips. They are one concern — what this book is called — so they
 * belong together.
 *
 * **Done is the only exit, and edits apply as they are typed.** The dialog's own Cancel already means "none of
 * this"; a second level of undo inside it is a thing people get wrong.
 *
 * `fallbackName` is what an emptied title or file name falls back to — the note's basename, or the folder's name.
 * Returns the unpin, because only this stage raises the keyboard.
 */
/** Past this many distinct types the list stops being a picker; the text field is the answer then. */
const TYPE_PICKER_CAP = 60;

/**
 * Every type the vault already uses, plus every one configured on the Fields page.
 *
 * Both, because they answer different halves of "what have I got": the first is what your notes say, the second
 * is what you told the library to offer before writing any. A value typed here needs no registering — writing it
 * makes it a value in use, so it appears in this list by itself next time.
 */
function knownTypes(app: App): string[] {
  const counted = valueCounts(recordCandidates(app), 'type', TYPE_PICKER_CAP);
  const configured = (fieldValuesFor('type') ?? []).map((entry) => entry.value);
  return [...new Set([...(counted ? counted.counts.keys() : []), ...configured])].sort((a, b) => a.localeCompare(b));
}

/**
 * The font the book is set in and carries, a cell of the details grid like the type: from the settings, for this
 * conversion only. Every vault font a book can embed, switched on for reading or not — see `epub-font.ts`.
 */
function renderFontRow(grid: HTMLElement, conv: { font: string }, repaint: () => void): void {
  const cell = fieldCell(grid, t('epub_font.name'));
  const select = cell.createEl('select', { cls: 'dropdown' });
  for (const [value, text] of Object.entries(epubFontOptions(conv.font))) select.createEl('option', { value, text });
  select.value = epubFontValue(conv.font);
  select.setAttribute('aria-label', t('epub_font.name'));
  select.addEventListener('change', () => {
    conv.font = select.value;
    // The fold's header names the font, so it changes with it.
    repaint();
  });
}

/**
 * The medium, as a dropdown of what the vault already uses with a `+` to name one it does not.
 *
 * A dropdown rather than a text box: the answer is almost always one you have used before, and typing "blog post"
 * for the ninth time is nine chances to write "blog Post" and split the group. The `+` is the same escape hatch
 * the folder rows have, for the first time a type exists.
 */
function renderTypeRow(app: App, grid: HTMLElement, conv: EpubConversion, rerender: () => void): void {
  // A cell of the metadata grid, like every field beside it — the select and its "+" share the control column
  // the way the folder picker and its "+" do in the destination fold.
  const cell = fieldCell(grid, t('epub_export.field_type'));
  const select = cell.createEl('select', { cls: 'dropdown' });
  const known = knownTypes(app);
  // The current answer belongs in the list even when nothing else uses it yet — otherwise picking a new type and
  // reopening the fold would silently reset it to whatever happens to be first.
  for (const value of [...new Set([conv.type, ...known])].filter(Boolean)) {
    select.createEl('option', { value, text: value });
  }
  select.value = conv.type;
  select.setAttribute('aria-label', t('epub_export.field_type'));
  select.addEventListener('change', () => {
    conv.type = select.value;
  });
  const add = new ButtonComponent(cell);
  add
    .setButtonText('+')
    .setTooltip(t('epub_export.type_add'))
    .onClick(() =>
      openOrbisDialog(app, { title: t('epub_export.type_add') }, (body, close, _modalEl, footer) => {
        let typed = '';
        const input = new Setting(body).setName(t('epub_export.field_type'));
        input.settingEl.addClass('orbis-setting-stacked');
        input.addText((txt) => {
          txt.inputEl.addClass('orbis-input-full');
          txt.setPlaceholder(t('epub_export.type_placeholder')).onChange((v) => (typed = v.trim()));
        });
        const actions = actionRow(footer());
        actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
        actionButton(actions, {
          label: t('epub_export.type_add'),
          cta: true,
          onClick: () => {
            if (!typed) return;
            conv.type = typed;
            close();
            rerender();
          },
        });
      })
    );
}

/**
 * Where the EPUB goes and what it is called — the same `answerFold` the PDF dialog uses, with `.epub` beside the
 * name instead of `.pdf`.
 */
function renderDestination(
  stage: HTMLElement,
  app: App,
  conv: EpubConversion,
  fallbackName: string,
  open: FilingState,
  ext: string
): void {
  const { paint, body } = answerFold(stage, {
    key: 'filing',
    label: t('epub_export.save_to_label'),
    value: () => destinationLabel(conv),
    path: true,
    open,
  });
  destinationGrid(body, {
    app,
    folder: () => conv.folder,
    onFolder: (v) => {
      conv.folder = v;
      paint();
    },
    name: () => conv.fileName,
    onName: (v) => {
      conv.fileName = v;
      paint();
    },
    nameKey: 'epub-file-name',
    fallback: () => fallbackName,
    held: open,
    ext,
  });
}

/**
 * What the book IS — title, author, language, publisher, date, medium.
 *
 * **One fold for all six**, because they are one concern and because five of them are usually already right: the
 * title and author come from the note's frontmatter, the language is effectively constant, and a personal note has
 * no publisher. As form rows they would fill the first screen and push the structure decision — the thing the
 * dialog exists for — below the fold.
 *
 * **The header lists what is filled in**, minus the title, which is the line above it. Empty fields are absent
 * rather than blank, so a note with no publisher does not advertise one.
 *
 * Editing the title repaints the summary line directly rather than rebuilding the screen: a rebuild on every
 * keystroke would take the cursor with it.
 */
function renderBookDetails(
  app: App,
  stage: HTMLElement,
  conv: EpubConversion,
  fallbackName: string,
  open: { open: boolean },
  libraryOn: boolean | undefined,
  titleEl: HTMLElement,
  rerender: () => void
): void {
  const { body, paint } = answerFold(stage, {
    key: 'details',
    label: t('epub_export.book_details'),
    /**
     * **What VARIES, not what is always set.** The header exists so the fold can stay shut when its contents are
     * already right, which only works for values that are sometimes absent — an author, a publisher, a date.
     *
     * Language and type are neither. Both are filled on every conversion (language falls back to `en`, type to the
     * settings default), so both would appear every time and distinguish nothing: a note with no author would read
     * `Book details en · book`. A value that is always there is not a summary of anything. They stay in the fold, where
     * they are edited.
     */
    value: () =>
      // The font too, when there is one: like an author, it is often absent, so its presence says something.
      [conv.author, conv.publisher, conv.publicationDate, conv.font]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(' \u00b7 '),
    // A header with nothing beside it reads as one that failed to render. Say the fold is empty instead — the
    // same muted italic the PDF byline fold uses for "No name".
    empty: t('epub_export.no_details'),
    open,
  });

  /**
   * **The same grid the destination fold above uses.** Stacked `Setting` rows — label, control, divider, margin,
   * six times over — under a fold that puts a label beside its field would be one modal laid out two ways, with the
   * tall half the one with more fields in it.
   */
  const grid = fieldGrid(body);
  const field = (label: TranslationKey, get: () => string, set: (v: string) => void): void => {
    fieldInput(grid, {
      label: t(label),
      value: get(),
      onInput: (v) => {
        set(v);
        paint();
      },
    });
  };

  field(
    'epub_export.field_title',
    () => conv.title,
    (v) => {
      conv.title = v || fallbackName;
      titleEl.setText(conv.title);
    }
  );
  field(
    'epub_export.field_author',
    () => conv.author,
    (v) => {
      conv.author = v;
    }
  );
  field(
    'epub_export.field_language',
    () => conv.language,
    (v) => {
      // Required by EPUB, so it can never be blank — falling back beats writing an invalid package.
      conv.language = v || 'en';
    }
  );
  field(
    'epub_export.field_publisher',
    () => conv.publisher,
    (v) => {
      conv.publisher = v;
    }
  );
  field(
    'epub_export.field_published',
    () => conv.publicationDate,
    (v) => {
      conv.publicationDate = v;
    }
  );
  // **The medium, and only when the library is on**, because it exists for the title note and there is no title
  // note otherwise.
  if (libraryOn) renderTypeRow(app, grid, conv, rerender);
  renderFontRow(grid, conv, paint);
}

/**
 * The book's title, as the line this dialog opens with.
 *
 * **The one thing that is neither a control nor an answer to a question below.** The author, language and the rest are
 * in the details fold's header — they are what that fold contains — and the path is in the destination fold's header
 * for the same reason. What is left is the identity of the thing being made, which is the right line to lead with and
 * belongs to nothing beneath it.
 *
 * **Full width and wrapping, not ellipsized.** This is the one chance to notice that a title came from the filename
 * because the note has no frontmatter, and a title cut at thirty characters cannot be checked.
 */
function renderSummary(stage: HTMLElement, conv: EpubConversion): HTMLElement {
  const box = stage.createDiv({ cls: 'orbis-epub-summary' });
  const text = box.createDiv({ cls: 'orbis-epub-summary-text' });
  const line = text.createDiv({ cls: 'orbis-epub-summary-title' });
  /**
   * **Labeled, because it is not the obvious thing.** A bare word at the top of a dialog about a folder reads as
   * the folder's name, and it usually is — but only as the LAST fallback: `bookTitleOf` takes the index note's
   * frontmatter title, then its first heading, then the folder. A folder called `Investing` whose README says
   * `title: The Investing Approach` shows the latter here and `/Investing.epub` in the fold below, which is
   * exactly the divergence worth noticing. Nothing else on screen carries it.
   *
   * The same muted-label idiom the `Location:` fold uses a row down.
   *
   * **Only where the line NAMES the book.** Save as PDF's equivalent line describes what the file will contain —
   * "The book, with your marks and notes" — and a `Title:` in front of that would be a lie.
   */
  line.createSpan({ cls: 'orbis-epub-toc-label', text: t('epub_export.title_label') });
  // Returned so the title field inside the details fold can keep it current without rebuilding the screen — the
  // same relationship the folds below have with their own headers.
  return line.createSpan({ text: conv.title });
}

/** Where the EPUB lands, as a path. `epubTargetPath` drops the leading slash at the vault root, which reads as a
 *  bare file name rather than as a location. */
function destinationLabel(conv: EpubConversion): string {
  const path = epubTargetPath(conv);
  return path.includes('/') ? path : `/${path}`;
}

/** The level picker, the resulting section list, and the honest warnings. Repainted on every level change. */
function renderAnalysis(stage: HTMLElement, analysis: NoteAnalysis, conv: EpubConversion, repaint: () => void): void {
  const levels = stage.createDiv();
  renderSplitPicker({
    stage: levels,
    headingCounts: analysis.headingCounts,
    level: conv.splitLevel,
    noneLabel: 'epub_export.split_none',
    desc: 'epub_export.split_desc',
    onPick: (level) => {
      conv.splitLevel = level;
      repaint();
    },
  });

  const { sections, losses, images } = analysis;
  stage.createDiv({
    cls: 'orbis-epub-subhead',
    text: plural(sections.length, 'epub_export.sections_n'),
  });
  const list = stage.createEl('ol', { cls: 'orbis-checklist' });
  for (const section of sections) {
    const li = list.createEl('li', { text: section.title });
    // The nested nav entries this section will carry — the reason a long section is still navigable.
    if (section.children) {
      li.createSpan({ cls: 'orbis-checklist-note', text: plural(section.children, 'epub_export.subsections') });
    }
  }

  if (images.remote) {
    new Setting(stage)
      // The count belongs HERE, beside the switch it applies to, rather than in the warnings below.
      .setName(plural(images.remote, 'epub_export.remote_images_n'))
      .setDesc(t('epub_export.remote_images_desc'))
      .addToggle((tg) => {
        tg.toggleEl.querySelector('input')?.setAttribute('data-orbis-focus', 'remote-images');
        tg.setValue(conv.fetchRemoteImages).onChange((v) => {
          conv.fetchRemoteImages = v;
          repaint(); // switching it on removes the warning below, because nothing is lost then
        });
      });
  }

  // Only what will NOT carry over. Reassurance about the parts that work is noise on a screen whose job is to warn —
  // which is why images being downloaded is not listed here. That is the feature working, not a loss.
  const warnings: string[] = [];
  if (images.remote && !conv.fetchRemoteImages) {
    warnings.push(plural(images.remote, 'epub_export.remote_skipped'));
  }
  if (images.unresolvable) warnings.push(plural(images.unresolvable, 'epub_export.loss_images'));
  if (losses.links) warnings.push(plural(losses.links, 'epub_export.loss_links'));
  if (losses.svg) warnings.push(plural(losses.svg, 'epub_export.loss_svg'));
  if (losses.emptyBlocks) warnings.push(plural(losses.emptyBlocks, 'epub_export.loss_empty'));

  if (warnings.length) {
    stage.createDiv({ cls: 'orbis-epub-subhead', text: t('epub_export.losses_heading') });
    const ul = stage.createEl('ul', { cls: 'orbis-epub-losses' });
    for (const w of warnings) ul.createEl('li', { text: w });
  }
}

/**
 * The same dialog for a folder: what the book is, where it goes, what order the chapters are in.
 *
 * A sibling of `openEpubExport` rather than a mode inside it. The shell, the metadata editor and the summary are
 * shared functions; what differs is the whole middle of the screen, and a source parameter threaded through every
 * closure would be the kind of "one function, two behaviors" that reads fine and is edited wrongly later.
 *
 * **The analysis is async but cheap** — the metadata cache plus one read per note, no rendering — so unlike the note
 * dialog there is no "analysing…" state worth designing around. It still cannot be assumed instant on a phone with
 * a large folder, so Convert stays disabled until it arrives.
 */
export function openFolderEpubExport(
  app: App,
  folder: TFolder,
  opts: {
    keyLang: string;
    sameFolderAsNote: boolean;
    folder: string;
    fetchRemoteImages: boolean;
    defaultType?: string;
    /** The font to embed, from settings — see `epub-font.ts`. */
    font?: string;
    libraryOn?: boolean;
  },
  onConfirm: (conv: FolderConversion, target?: OutsideTarget) => void,
  outside: OutsideRoute | null = null
): void {
  const conv: FolderConversion = folderDefaults(app, folder, opts);
  const detailsOpen = { open: false };
  const filingOpen: FilingState = { open: false };
  let analysis: FolderAnalysis | null = null;
  let unpin: () => void = () => {};
  const state = createNoteListState(app, folder);
  const applyRows = (): void => {
    conv.notes = state.rows.filter((r) => r.included).map((r) => r.path);
  };

  openOrbisDialog(
    app,
    { title: t('epub_export.folder_title'), icon: CONVERSION_SVG, onClose: () => unpin() },
    (body, close, modalEl, footer) => {
      // Left-aligned stacked controls — see the rule in styles.css.
      modalEl.addClass('orbis-form-dialog');
      const stage = body.createDiv();
      unpin = pinForm(modalEl);

      const renderMain = (): void => {
        // The folds' state, read from the elements before this screen goes — see `foldOpen`.
        const openDetails = foldOpen(stage, 'details');
        if (openDetails !== null) detailsOpen.open = openDetails;
        const openFiling = foldOpen(stage, 'filing');
        if (openFiling !== null) filingOpen.open = openFiling;
        const openChapters = foldOpen(stage, 'chapters');
        if (openChapters !== null) state.fold.open = openChapters;
        // Every control here repaints the screen, and rebuilding the DOM resets the scroll — without this, toggling
        // images at the bottom throws you back to the title.
        const scroller = scrollParent(stage);
        const scrollTop = scroller?.scrollTop ?? 0;
        // And the keyboard, for the chapter arrows — see `captureFocus`.
        const restoreFocus = captureFocus(stage);
        stage.empty();
        const title = renderSummary(stage, conv);
        renderDestination(stage, app, conv, folder.name, filingOpen, '.epub');
        renderBookDetails(app, stage, conv, folder.name, detailsOpen, opts.libraryOn, title, renderMain);

        if (analysis) {
          // The same picker the set dialog has. The order means far more here — it IS the spine, and the table of
          // contents — so if anything it earns its place more.
          renderOrderPicker({
            stage,
            state,
            source: conv.orderSource,
            name: 'epub_export.chapter_order',
            desc: 'epub_export.chapter_order_desc',
            more: 'epub_export.chapter_order_more',
            onPick: (source) => {
              conv.orderSource = source;
              reseedNotes(app, state, source);
              applyRows();
              repaint();
            },
          });
          renderFolderAnalysis(
            stage,
            analysis,
            conv,
            (patch) => Object.assign(conv, patch),
            repaint,
            listOptions(state, applyRows, repaint)
          );
        } else stage.createDiv({ cls: 'orbis-epub-note', text: t('epub_export.analysing') });

        // In the footer — see the note in the single-note dialog above.
        const bar = footer();
        bar.empty();
        const actions = actionRow(bar);
        outsideButton(actions, outside, {
          disabled: !analysis || !conv.notes.length,
          name: () => epubTargetPath(conv).split('/').pop() ?? '',
          filter: EPUB_FILTER,
          onTarget: (target) => {
            onConfirm(conv, target);
            close();
          },
        });
        actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
        actionButton(actions, {
          label: t('epub_export.convert'),
          cta: true,
          // Nothing selected is a real state — unchecking everything is easier than it sounds — and converting it
          // would write a book with no chapters.
          disabled: !analysis || !conv.notes.length,
          onClick: () => {
            onConfirm(conv);
            close();
          },
        });

        if (scroller && scrollTop) scroller.scrollTop = scrollTop;
        restoreFocus();
      };

      /** Changing the split level changes the section counts, so the analysis is redone — cheap, by design. */
      const repaint = (): void => {
        renderMain();
        void refresh();
      };

      const refresh = async (): Promise<void> => {
        const next = await analyseFolder(app, folder, conv);
        if (!stage.isConnected) return; // dismissed while it ran
        /**
         * **The chosen level can stop existing while the dialog is open.** This analysis covers the SELECTED
         * notes, so unticking the only note with H3s takes "Heading 3" out of the picker — and a `<select>` set to
         * a value it has no option for silently shows the first one instead, which would leave the screen claiming
         * a split it is not making. Resolving here moves to the nearest level that survives.
         */
        const resolved = resolveSplitLevel(conv.splitLevel, next.headingCounts);
        if (resolved !== conv.splitLevel) {
          conv.splitLevel = resolved;
          // Re-run, because the section counts describe a cut that is no longer the one being made.
          const again = await analyseFolder(app, folder, conv);
          if (!stage.isConnected) return;
          analysis = again;
        } else analysis = next;
        renderMain();
      };

      renderMain();
      void refresh();
    }
  );
}

/**
 * The order, the chapters, and the honest warnings.
 *
 * **The ordering rule is stated, not implied.** "In the order README links to them" is a surprising rule to meet
 * for the first time in a table of contents, and the one case that needs saying out loud is the note the index
 * missed: it is appended rather than dropped, and someone should learn that here rather than by finding chapter 34
 * where they did not expect it.
 */
function renderFolderAnalysis(
  stage: HTMLElement,
  analysis: FolderAnalysis,
  /** What this screen READS. It may be a copy — see `set`, which is how it writes. */
  conv: FolderConversion,
  /**
   * How a control here changes the conversion.
   *
   * **Because `conv` is not always the caller's own object.** The separate-EPUBs dialog holds a different shape and
   * hands this one a `FolderConversion` derived from it on every render, so a control assigning to it would write to
   * a copy thrown away before the repaint reads it, and do nothing at all. A render function that mutates its
   * argument cannot be given a derived view, so this one mutates nothing.
   */
  apply: (patch: Partial<FolderConversion>) => void,
  repaint: () => void,
  list: ChapterListOpts,
  /**
   * Which words this screen is entitled to.
   *
   * The two modes share every control and almost no vocabulary. In `book` mode a note is a **chapter** of one book
   * and splitting shifts every highlight after it *in the book*; in `set` mode a note **is** a book, there are no
   * chapters, and splitting shifts highlights inside that one book and no other. Reusing one set of strings would
   * have the second screen telling readers their notes were chapters.
   */
  /**
   * Present in `set` mode only, and carrying the two facts that mode answers differently.
   *
   * `tocName` is the note the contents note is being built from, which the reader can change and which is
   * therefore not the one the ordering rule found. `appended` is counted against THAT note rather than against the
   * rule's — otherwise picking a different contents note leaves a sentence on screen about a note nobody chose.
   */
  setInfo?: { tocName: string | null; appended: number }
): void {
  const set = !!setInfo;
  const tocName = setInfo?.tocName ?? null;
  const order = stage.createDiv({ cls: 'orbis-epub-note' });
  /**
   * **No sentence about where the order came from, in either dialog.**
   *
   * It would be a readback of the picker one line above it: you have just chosen `001-README`, and being told the
   * order follows `001-README` adds nothing. The one thing it could carry — that a hand reorder has overridden the
   * seed — lives IN the control, which reads `001-README (customized)`. A control that states
   * its own state needs no prose restating it, and cannot drift out of step with prose that says otherwise.
   */
  const named = set ? tocName : analysis.index;
  const appended = set ? setInfo.appended : analysis.appended;
  // Not a readback: a consequence you cannot see anywhere else. Suppressed once the list is reordered by hand,
  // because "so it is listed at the end" stops being true the moment a row moves — and the first clause on its own
  // is a fact about the index note that no longer says anything about this book.
  if (appended && named && !list.reordered) {
    // The index note is NAMED again rather than referred to as "it": the two lines are separate on screen, and a
    // pronoun reaching back across the break is work the reader should not have to do.
    order.createDiv({
      cls: 'orbis-checklist-note-empty',
      text: plural(appended, set ? 'epub_export.set_order_appended' : 'epub_export.order_appended', { name: named }),
    });
  }

  // The split picker, with the cost of using it stated where it is used. A note is one section by default, which is
  // what keeps an edit to one note from shifting every CFI after it in the book.
  const levels = stage.createDiv();
  renderSplitPicker({
    stage: levels,
    headingCounts: analysis.headingCounts,
    level: conv.splitLevel,
    noneLabel: set ? 'epub_export.set_split_none' : 'epub_export.split_per_note',
    desc: set ? 'epub_export.set_split_desc' : 'epub_export.split_folder_desc',
    onPick: (level) => {
      apply({ splitLevel: level });
      repaint();
    },
  });

  // Behind a fold, and **closed on first paint**, even for a short set: on a phone any open list pushes the warnings
  // and the buttons below the fold, and a control you have to scroll past is worse than one you have to open. The
  // summary carries the count while it is closed. Once opened it STAYS open, because the alternative is a list that
  // shuts itself every time you use it.
  // One number, not two. "N note(s) → N section(s)" says the same thing twice at the default level, and one `(s)`
  // cannot be right for both counts at once — a note can split into several sections.
  const count = set ? analysis.notes.length : analysis.sections;
  /**
   * Through `answerFold`, like the other folds on this screen — see the same conversion in `renderChapters`. One
   * string set straight on the summary would come out at the summary's own weight while the folds around it draw a
   * faint label and an answer. `bare`, because the list brings its own surface.
   */
  const { body: fold } = answerFold(stage, {
    key: 'chapters',
    label: t('epub_export.chapters_label'),
    value: () => plural(count, set ? 'epub_export.set_books_value' : 'epub_export.chapters_value'),
    open: list.fold,
    bare: true,
  });
  renderChapterList(fold, analysis, list);

  if (analysis.images.remote) {
    new Setting(stage)
      .setName(plural(analysis.images.remote, 'epub_export.remote_images_n'))
      .setDesc(t('epub_export.remote_images_desc'))
      .addToggle((tg) => {
        tg.toggleEl.querySelector('input')?.setAttribute('data-orbis-focus', 'remote-images');
        tg.setValue(conv.fetchRemoteImages).onChange((v) => {
          apply({ fetchRemoteImages: v });
          repaint();
        });
      });
  }

  const warnings: string[] = [];
  if (analysis.links.outside) warnings.push(plural(analysis.links.outside, 'epub_export.loss_links_outside'));
  if (analysis.images.remote && !conv.fetchRemoteImages) {
    warnings.push(plural(analysis.images.remote, 'epub_export.remote_skipped'));
  }
  if (analysis.images.unresolvable) warnings.push(plural(analysis.images.unresolvable, 'epub_export.loss_images'));

  if (warnings.length) {
    // "(estimated)" on the heading rather than a sentence of its own. These come from the metadata cache instead of
    // from rendering the notes — which is what makes opening this screen free — and the note dialog's numbers are
    // exact, so the difference has to be said. One word says it; a line of italics under a list of warnings reads
    // as another warning.
    stage.createDiv({ cls: 'orbis-epub-subhead', text: t('epub_export.losses_heading_est') });
    const ul = stage.createEl('ul', { cls: 'orbis-epub-losses' });
    for (const w of warnings) ul.createEl('li', { text: w });
  }
}

/**
 * Where a set of books is written, and what it is called — the destination fold for the separate dialog.
 *
 * **A folder, not a file**, so the name row has no extension beside it and the label says "New folder name". The
 * other difference from the two single-book dialogs: this folder does not exist yet, so the header says
 * *"will be created"* rather than showing a path that reads as one you are picking.
 */
function renderSeparateDestination(
  app: App,
  stage: HTMLElement,
  conv: SeparateConversion,
  fallbackName: string,
  open: FilingState
): void {
  const resolved = (): string => {
    const { folder } = separatePaths(conv);
    return app.vault.getAbstractFileByPath(folder) ? folder : t('folder_picker.pending_on_save', { name: folder });
  };
  const { body, paint } = answerFold(stage, {
    key: 'filing',
    label: t('epub_export.save_to_label'),
    value: resolved,
    path: true,
    open,
  });
  destinationGrid(body, {
    app,
    folder: () => conv.parent,
    onFolder: (v) => {
      conv.parent = v;
      paint();
    },
    name: () => conv.outFolder,
    onName: (v) => {
      conv.outFolder = v;
      paint();
    },
    nameKey: 'separate-out-folder',
    fallback: () => fallbackName,
    held: open,
    ext: '',
    nameLabel: t('epub_export.out_folder'),
  });
}

/**
 * What every book in the set shares: an author for the notes that name none, a language, and one medium.
 *
 * **Three fields, not six.** A title and a file name belong to each book and come from its own note, so there is
 * nothing set-wide to say about them — which is the whole difference between this fold and `renderBookDetails`.
 */
function renderSeparateDetails(
  app: App,
  stage: HTMLElement,
  conv: SeparateConversion,
  open: { open: boolean },
  libraryOn: boolean | undefined,
  rerender: () => void
): void {
  const { body, paint } = answerFold(stage, {
    key: 'details',
    label: t('epub_export.book_details'),
    // Language and type left out for the reason `renderBookDetails` gives: both are set on every conversion, so
    // neither summarizes anything by being present. The author is the one value here that is often blank.
    value: () =>
      [conv.author, conv.font]
        .map((v) => v.trim())
        .filter(Boolean)
        .join(' \u00b7 '),
    empty: t('epub_export.no_details'),
    open,
  });

  /**
   * The same grid the destination fold above uses — see `renderBookDetails`.
   *
   * **Two grids rather than one**, so the author's line of help can sit under the field it explains instead of
   * under the whole fold. They line up because the column is a fixed width rather than sized to its own content,
   * which is the reason it is fixed.
   */
  const authorGrid = fieldGrid(body);
  fieldInput(authorGrid, {
    label: t('epub_export.field_author'),
    value: conv.author,
    onInput: (v) => {
      conv.author = v;
      paint();
    },
  });
  body.createDiv({ cls: 'orbis-epub-note', text: t('epub_export.author_desc') });

  const grid = fieldGrid(body);
  fieldInput(grid, {
    label: t('epub_export.field_language'),
    value: conv.language,
    onInput: (v) => {
      conv.language = v || 'en';
      paint();
    },
  });

  // One type for the whole set, and the same control the other two dialogs use — a dropdown of what the vault
  // already has, with `+` for one it does not. Thirty-four books from one folder are thirty-four of the same kind
  // of thing, so it is asked once.
  if (libraryOn) renderTypeRow(app, grid, conv as unknown as EpubConversion, rerender);
  renderFontRow(grid, conv, paint);
}

/** One row of the chapter list: a note in the folder, and whether it is in the book. */
interface ChapterRow {
  path: string;
  /** File name, for anything that has to identify WHICH note. See `folderChapters`. */
  basename: string;
  title: string;
  included: boolean;
}

interface ChapterListOpts {
  rows: ChapterRow[];
  /** Shared by every row — the index a drag started from. */
  drag: { from: number | null };
  /**
   * Whether the list is open, and how far it is scrolled — **held by the caller, because this is rebuilt.**
   *
   * Every move and every checkbox repaints the whole screen (the picker's `(customized)` marker and the
   * unlinked-notes line both depend on this list), so the fold and its scroller are destroyed and remade. Without
   * carrying these across, dropping a row would close the list under you, and dropping row twenty would scroll
   * you back to row one — both of which make the second move harder than the first.
   */
  fold: { open: boolean; scroll: number };
  /** Whether the reader has moved anything, which is what makes the ordering explanation stale. */
  reordered: boolean;
  move: (from: number, to: number) => void;
  toggle: (index: number, included: boolean) => void;
  /** Every row at once, given a rule — what the header's Select all, Clear and Invert each pass. */
  setAll: (next: (wasOn: boolean) => boolean) => void;
}

/**
 * The chapters, checkable and reorderable.
 *
 * The ordering rule gets a folder that is already laid out for this right. **This is for the folder that is not** —
 * a note that belongs at the front, a scratch file that belongs nowhere. Without it the only way to shape a book is
 * to rename files in the vault, which is a real edit to satisfy a dialog.
 *
 * **Excluded notes stay in the list**, grayed, keeping their place. Removing the row would mean the only way to put
 * a note back is to cancel and start again, and it would make the checkbox a one-way door.
 *
 * Reordering is ↑/↓ **and** drag, for the reason `wireListDrag` documents: dragging has no keyboard equivalent,
 * so the arrows are the only path for anyone not using a pointer. They are also the only practical path for a
 * long list on any device — a
 * note thirty rows down needs thirty presses, which is the honest limit of this control and the argument for getting
 * the index note right instead.
 */
function renderChapterList(stage: HTMLElement, analysis: FolderAnalysis, opts: ChapterListOpts): void {
  const { rows } = opts;
  const bySections = new Map(analysis.notes.map((n) => [n.path, n]));
  // The shared bulk buttons — see `pickListHeader`. Without them a folder of thirty notes takes thirty taps to
  // convert three of them. No label: the fold's summary above says the count.
  // The header and the rows on one surface — see `.orbis-list-box`.
  const box = stage.createDiv({ cls: 'orbis-list-box' });
  pickListHeader(box, {
    onSelectAll: () => opts.setAll(() => true),
    onClear: () => opts.setAll(() => false),
    onInvert: () => opts.setAll((on) => !on),
  });
  const list = pickList(box, { plain: true });
  // Restored after the rows are in, below — an empty element has nowhere to scroll to.
  list.addEventListener('scroll', () => {
    opts.fold.scroll = list.scrollTop;
  });
  // Numbered by POSITION IN THE BOOK, not by row: an excluded note in the middle must not consume a chapter number
  // and leave a gap where a reader would look for one.
  let chapter = 0;

  rows.forEach((row, i) => {
    if (row.included) chapter++;
    const note = bySections.get(row.path);
    /**
     * The tick, the number and the title share a `<label>`, so the whole line toggles the box — a 16px checkbox is
     * not a thumb target. **The tools do not**: the arrows and the drag handle sit outside it (they are appended to
     * `li` below), or moving a chapter would also include or exclude it.
     */
    const { row: li } = pickRow(list, {
      label: row.title,
      // An em dash rather than a blank for an excluded note: the column keeps its width, and "not in the book" is a
      // statement rather than something missing.
      prefix: row.included ? `${chapter}.` : '—',
      note:
        row.included && note
          ? note.sections > 1
            ? t('epub_export.note_sections', { n: String(note.sections) })
            : note.children
              ? plural(note.children, 'epub_export.subsections')
              : undefined
          : undefined,
      checked: row.included,
      // By path, not by position: ticking one redraws the screen and the numbering shifts around it.
      key: `note:${row.path}`,
      onChange: (on) => opts.toggle(i, on),
    });

    const tools = li.createDiv({ cls: 'orbis-checklist-row-tools' });
    // The arrows and the handle, shared with every other reorderable list — see `reorderControls`. Keyed by chapter
    // path, which is what this list rebuilds from, so a press keeps the keyboard on the chapter it moved.
    reorderControls({
      row: li,
      into: tools,
      key: row.path,
      index: i,
      count: rows.length,
      keyPrefix: 'chapter',
      labels: {
        up: t('epub_export.move_up'),
        down: t('epub_export.move_down'),
        drag: t('presets.drag_hint'),
      },
      drag: opts.drag,
      move: opts.move,
    });
  });

  // A closed `<details>` gives its children no layout, so this only takes while the list is on screen — which is
  // every case that matters, since a repaint can only come from using it.
  if (opts.fold.open) list.scrollTop = opts.fold.scroll;
}

/**
 * The same folder, as **one book per note**.
 *
 * A separate command rather than a mode inside the folder dialog, because the metadata block means something
 * different here: each book takes its title and author from its own note, so the fields at the top of that screen
 * would be describing nothing. What is left at the set level is where the books go, the language, and an author for
 * the notes that do not name one.
 *
 * Everything below that is shared — the chapter list decides which notes become books and in what order, and the
 * order is what the contents note is written in.
 */
export function openSeparateEpubExport(
  app: App,
  folder: TFolder,
  opts: {
    keyLang: string;
    sameFolderAsNote: boolean;
    folder: string;
    fetchRemoteImages: boolean;
    defaultType?: string;
    /** The font to embed, from settings — see `epub-font.ts`. */
    font?: string;
    libraryOn?: boolean;
  },
  onConfirm: (conv: SeparateConversion) => void
): void {
  const conv: SeparateConversion = separateDefaults(app, folder, opts);
  // The analysis is the folder one, told which notes are in: the counts, the losses and the per-note section
  // numbers are all the same question.
  const asFolder = (): FolderConversion => ({
    fileName: conv.outFolder,
    folder: conv.parent,
    title: conv.title,
    author: conv.author,
    language: conv.language,
    publisher: conv.publisher,
    publicationDate: conv.publicationDate,
    type: conv.type,
    splitLevel: conv.splitLevel,
    fetchRemoteImages: conv.fetchRemoteImages,
    font: conv.font,
    notes: conv.notes,
    orderSource: conv.orderSource,
  });
  let analysis: FolderAnalysis | null = null;
  let unpin: () => void = () => {};
  const detailsOpen = { open: false };
  const filingOpen: FilingState = { open: false };
  // Taken before anything can change it: the `-EPUB` folder this opened with is what an emptied field stands for. The
  // source folder's own name is NOT — beside the notes, that names the folder they are in.
  const defaultOutFolder = conv.outFolder;
  const state = createNoteListState(app, folder);
  const applyRows = (): void => {
    conv.notes = state.rows.filter((r) => r.included).map((r) => r.path);
  };

  openOrbisDialog(
    app,
    { title: t('epub_export.separate_title'), icon: CONVERSION_SVG, onClose: () => unpin() },
    (body, close, modalEl, footer) => {
      // Left-aligned stacked controls — see the rule in styles.css.
      modalEl.addClass('orbis-form-dialog');
      const stage = body.createDiv();
      unpin = pinForm(modalEl);

      const renderMain = (): void => {
        // The folds' state, read from the elements before this screen goes — see `foldOpen`.
        const openChapters = foldOpen(stage, 'chapters');
        if (openChapters !== null) state.fold.open = openChapters;
        const openDetails = foldOpen(stage, 'details');
        if (openDetails !== null) detailsOpen.open = openDetails;
        const openFiling = foldOpen(stage, 'filing');
        if (openFiling !== null) filingOpen.open = openFiling;
        const scroller = scrollParent(stage);
        const scrollTop = scroller?.scrollTop ?? 0;
        // And the keyboard, for the chapter arrows — see `captureFocus`.
        const restoreFocus = captureFocus(stage);
        stage.empty();
        /**
         * What the command makes, in the slot the other dialogs give a book's title.
         *
         * **The same block, so all four export dialogs open the same way**: one statement, one rule, then the folds.
         * Loose muted text below the folds — no divider, different spacing — would draw the same structure two ways,
         * and open with nothing at all until the analysis finished. There is no title to put here because each note
         * keeps its own; what the command produces is the answer instead.
         *
         * Muted rather than the block's usual weight: it explains rather than announces, and a bold sentence in
         * a slot that is bold for a title reads as a warning.
         */
        const intro = stage.createDiv({ cls: 'orbis-epub-summary' });
        intro
          .createDiv({ cls: 'orbis-epub-summary-text' })
          .createDiv({ cls: 'orbis-epub-note', text: t('epub_export.separate_desc') });
        renderSeparateDestination(app, stage, conv, defaultOutFolder, filingOpen);
        renderSeparateDetails(app, stage, conv, detailsOpen, opts.libraryOn, renderMain);

        if (analysis) {
          renderOrderPicker({
            stage,
            state,
            source: conv.orderSource,
            name: 'epub_export.toc_source',
            desc: 'epub_export.toc_source_desc',
            more: 'epub_export.toc_source_more',
            onPick: (source) => {
              conv.orderSource = source;
              reseedNotes(app, state, source);
              applyRows();
              repaint();
            },
          });

          renderFolderAnalysis(
            stage,
            analysis,
            asFolder(),
            // Onto the dialog's OWN state, not the derived view above — the two share these field names.
            (patch) => Object.assign(conv, patch),
            repaint,
            listOptions(state, applyRows, repaint),
            {
              // The file name, matching the picker above — these sentences quote it mid-paragraph, where a title long
              // enough to wrap the line twice is what "001-README" avoids.
              tocName: state.rows.find((r) => r.path === conv.orderSource)?.basename ?? null,
              appended: appendedCount(app, conv.notes, conv.orderSource),
            }
          );
        } else {
          stage.createDiv({ cls: 'orbis-epub-note', text: t('epub_export.analysing') });
        }

        // In the footer — see the note in the single-note dialog above.
        const bar = footer();
        bar.empty();
        const actions = actionRow(bar);
        actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
        actionButton(actions, {
          label: t('epub_export.convert_separate', { n: String(conv.notes.length) }),
          cta: true,
          disabled: !analysis || !conv.notes.length,
          onClick: () => {
            onConfirm(conv);
            close();
          },
        });

        if (scroller && scrollTop) scroller.scrollTop = scrollTop;
        restoreFocus();
      };

      const repaint = (): void => {
        renderMain();
        void refresh();
      };

      const refresh = async (): Promise<void> => {
        const next = await analyseFolder(app, folder, asFolder());
        if (!stage.isConnected) return;
        // The same fallback the single-book folder dialog needs, and for the same reason — see the note there.
        const resolved = resolveSplitLevel(conv.splitLevel, next.headingCounts);
        if (resolved !== conv.splitLevel) {
          conv.splitLevel = resolved;
          const again = await analyseFolder(app, folder, asFolder());
          if (!stage.isConnected) return;
          analysis = again;
        } else analysis = next;
        renderMain();
      };

      renderMain();
      void refresh();
    }
  );
}
