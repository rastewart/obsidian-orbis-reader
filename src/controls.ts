// The controls every dialog draws, drawn one way.
//
// **Why this file exists.** Every dialog draws the same few things: a row of buttons, a checkbox with a sentence under
// it, a list of chapters you tick. Drawn separately, they differ in the gap and the space above, which nobody chooses
// on purpose, and that is how a dialog comes to look subtly unlike its neighbor.
//
// Everything here is presentation. Behavior — focus, scroll, the tab trap, the keyboard's return — lives in
// `ui-utils.ts`.

import { t } from './i18n';

/**
 * Where a row of buttons sits, which is the only thing that genuinely differs between them.
 *
 * - `content` — the last thing in a dialog's scrolling body, with room above it.
 * - `inline` — inside a box that already has its own padding: a confirm panel, a banner. No room above.
 * - `footer` — a popup's own footer, outside the scroll region: it holds its ground and draws a line above itself.
 *   (`OrbisModal` dialogs get this from `footer()` and do not need it here.)
 */
export type ActionPlacement = 'content' | 'inline' | 'footer';

export interface ActionRowSpec {
  placement?: ActionPlacement;
  /**
   * `center` for a row that is a choice rather than a decision — the first-voice dialog offers two ways forward and
   * neither is "cancel". Everything else ends the row, where a reader's eye finishes.
   */
  align?: 'end' | 'center';
  /** Let the buttons wrap when their labels are long. Off by default: a wrapping action row usually means too many. */
  wrap?: boolean;
  /**
   * One action per line, each the full width of the dialog.
   *
   * **For a choice between two acts, not for too many buttons.** Where the labels are verbs that carry the
   * decision — *Open the annotated book* against *Create a new book from the updated note* — they cannot be
   * shortened without losing what makes the choice legible, and side by side they are wider than any sensible
   * dialog. Stacked they have equal weight, which also means neither is quietly the default. Pair it with a
   * separate row for Cancel: the way out is not a third choice.
   */
  stack?: boolean;
}

/**
 * A row of actions.
 *
 * Returns the row; the caller adds its own buttons, because what a button says and does is the caller's business and
 * only the spacing was ever shared.
 */
export function actionRow(parent: HTMLElement, spec: ActionRowSpec = {}): HTMLElement {
  const row = parent.createDiv({ cls: 'orbis-actions' });
  if (spec.placement === 'inline') row.addClass('orbis-actions-inline');
  if (spec.placement === 'footer') row.addClass('orbis-actions-footer');
  if (spec.align === 'center') row.addClass('orbis-actions-center');
  if (spec.wrap) row.addClass('orbis-actions-wrap');
  if (spec.stack) row.addClass('orbis-actions-stack');
  return row;
}

export interface ActionSpec {
  label: string;
  /** The primary action — `mod-cta`. One per row, or none. */
  cta?: boolean;
  /**
   * Destructive — `mod-destructive`, which is what `ButtonComponent.setDestructive` adds. Pair it with `cta` for a
   * destructive primary action, which is what the deprecated `setWarning()` was: `setDestructive().setCta()`.
   */
  destructive?: boolean;
  disabled?: boolean;
  /** `data-orbis-focus`, so a repaint can put the keyboard back on this button — see `captureFocus`. */
  key?: string;
  tooltip?: string;
  /**
   * The click handler, given the event — which a dialog over the reader needs: without
   * `stopPropagation` the click carries on into the book behind it.
   */
  onClick: (ev: MouseEvent) => void;
}

/**
 * One button in an action row.
 *
 * **A plain `<button>`, not `Setting.addButton`.** Obsidian's version wraps the button in a `.setting-item-control`,
 * and on a phone `.is-phone .modal .setting-item-control button:not(.clickable-icon)` gives it the full width of the
 * dialog — right for a settings row, wrong for a pair of actions.
 *
 * `type="button"` always: an untyped `<button>` is a submit button, and Chromium's default action for Enter then
 * activates whichever one it finds — so a dialog could dismiss itself on a keypress meant for a field.
 */
export function actionButton(row: HTMLElement, spec: ActionSpec): HTMLButtonElement {
  const btn = row.createEl('button', { text: spec.label, attr: { type: 'button' } });
  if (spec.cta) btn.addClass('mod-cta');
  if (spec.destructive) btn.addClass('mod-destructive');
  if (spec.disabled) btn.disabled = true;
  if (spec.key) btn.dataset.orbisFocus = spec.key;
  if (spec.tooltip) btn.setAttribute('aria-label', spec.tooltip);
  btn.addEventListener('click', spec.onClick);
  return btn;
}

// ── Pick lists ───────────────────────────────────────────────────────────────

export interface PickRowSpec {
  label: string;
  /**
   * A short column before the label: the chapter's number in the book, or an em dash for one left out. Inside the
   * label's hit area, because it describes the row rather than acting on it.
   */
  prefix?: string;
  /** The muted text at the end of the row: a mark count, a duration, a size. */
  note?: string;
  /** Dims the note when it says "none of these" rather than a quantity. */
  noteMuted?: boolean;
  checked: boolean;
  disabled?: boolean;
  /** `data-orbis-focus`, keyed by the THING rather than its position — these lists redraw on every tick. */
  key?: string;
  onChange: (checked: boolean) => void;
}

/** What a pick row hands back, so a caller can add its own columns — a play button, a status slot, arrows. */
export interface PickRow {
  row: HTMLElement;
  /** The `<label>` that covers the label and its note; extra controls go OUTSIDE it — see below. */
  hit: HTMLElement;
  check: HTMLInputElement;
}

/**
 * The scrolling box a pick list lives in.
 *
 * `plain` drops the list markers and the room kept for them — for a list that numbers itself, as the EPUB export's
 * does, where the browser's own "1." would sit beside a number the list has already drawn.
 */
export function pickList(parent: HTMLElement, opts: { plain?: boolean } = {}): HTMLElement {
  return parent.createEl('ul', { cls: opts.plain ? 'orbis-checklist orbis-checklist-plain' : 'orbis-checklist' });
}

/**
 * One row of a list you tick: a checkbox, a label, and an optional note at the end.
 *
 * **The whole row is the tap target, not the box.** A 16px checkbox looks right in a list of forty-five rows and
 * cannot be hit reliably with a thumb. A `<label>` around the
 * row gives the browser's own behavior: tap anywhere on the line and the box it contains toggles, with no handler
 * of ours in the way and the keyboard path unchanged. Anything a caller adds afterwards goes OUTSIDE the label, or
 * pressing it would also toggle the row.
 */
export function pickRow(list: HTMLElement, spec: PickRowSpec): PickRow {
  const row = list.createEl('li', { cls: 'orbis-checklist-row' });
  const hit = row.createEl('label', { cls: 'orbis-checklist-hit' });
  const check = hit.createEl('input', {
    cls: 'orbis-checklist-check',
    attr: { type: 'checkbox', 'aria-label': spec.label },
  });
  check.checked = spec.checked;
  if (spec.disabled) check.disabled = true;
  if (spec.key) check.dataset.orbisFocus = spec.key;
  check.addEventListener('change', () => spec.onChange(check.checked));
  if (spec.prefix !== undefined) hit.createSpan({ cls: 'orbis-checklist-n', text: spec.prefix });
  /**
   * **The name and its note share a block, so a phone can stack them.**
   *
   * On a narrow screen the two compete for one line and the name loses: `1. manu… 14 sub-headings` keeps the wrong
   * half of the row. Side by side on a desktop, one above the
   * other on a phone — the same shape the recordings chapter row uses, and the count stays, because "16
   * sub-headings" is what tells you a note will make a fat chapter.
   */
  const main = hit.createDiv({ cls: 'orbis-checklist-main' });
  main.createSpan({ cls: 'orbis-checklist-label', text: spec.label });
  if (spec.note) {
    main.createSpan({
      cls: spec.noteMuted ? 'orbis-checklist-note orbis-checklist-note-empty' : 'orbis-checklist-note',
      text: spec.note,
    });
  }
  return { row, hit, check };
}

/** One answer in a {@link choiceGroup}: what it is called, and the sentence that lets you choose it. */
export interface ChoiceSpec<T extends string> {
  value: T;
  label: string;
  /** Why you would pick this one. The reason these are radios rather than a dropdown — see below. */
  desc: string;
  /**
   * A control this answer needs in order to be complete — "move them" has to say *where*.
   *
   * Drawn indented under its own option rather than below the whole group, because a control after the last
   * radio reads as belonging to the group, and the reader has to work out which answer it parameterises.
   *
   * **Outside the `<label>`, deliberately.** The row is a label so its text is part of the radio's hit target,
   * and a `<select>` inside one would toggle the radio on every click. It goes in a sibling after it.
   */
  detail?: (host: HTMLElement) => void;
}

/**
 * A small set of mutually exclusive answers, each with a sentence.
 *
 * **Radios, not a dropdown, and the rule is about the options rather than their number.** A dropdown is right when
 * the label IS the whole answer — "All 45 chapters", "Heading 3 · 1 heading" — and wrong when choosing needs a
 * sentence about each. A dropdown shows one description at a time, so comparing two forks in what a command
 * produces means picking, reading, picking back, reading again; and it costs no less room, since the control plus
 * its one description is as tall as two labeled radios.
 *
 * The whole row is a `<label>`, so the text is part of the hit target — a radio dot alone is a small thing to
 * hit on a phone.
 */
export function choiceGroup<T extends string>(
  parent: HTMLElement,
  spec: {
    /** Groups the inputs, so the browser enforces "one of these". Unique within a dialog. */
    name: string;
    /** The question, above the answers. Omitted where a caller has already drawn its own heading. */
    heading?: string;
    options: readonly ChoiceSpec<T>[];
    value: T;
    onPick: (value: T) => void;
    /** Restore key stem — each option takes `<key>:<value>`, since choosing one repaints these screens. */
    key?: string;
  }
): void {
  if (spec.heading) parent.createDiv({ cls: 'orbis-radio-heading', text: spec.heading });
  for (const option of spec.options) {
    const row = parent.createEl('label', { cls: 'orbis-radio-row' });
    const input = row.createEl('input', { type: 'radio', cls: 'orbis-radio-mt' });
    input.name = spec.name;
    input.checked = spec.value === option.value;
    if (spec.key) input.dataset.orbisFocus = `${spec.key}:${option.value}`;
    input.addEventListener('change', () => {
      if (input.checked) spec.onPick(option.value);
    });
    const text = row.createDiv();
    text.createSpan({ cls: 'orbis-radio-label', text: option.label });
    text.createDiv({ cls: 'orbis-radio-desc', text: option.desc });
    // **Inside the option's text block, so the indent is inherited rather than guessed.** As a sibling of the row
    // it would have to be pushed right by the radio's width plus the gap — numbers this file does not own, since
    // the input is sized by the platform. Here it simply starts where the label and the
    // description start, at any radio size.
    //
    // Inside the `<label>` is safe: the spec skips a label's activation behavior when the click lands on
    // interactive content, which a `<select>` is — and the control belongs to the option that is already
    // selected, so re-selecting it would be a no-op even if it did forward.
    option.detail?.(text.createDiv({ cls: 'orbis-radio-detail' }));
  }
}

/**
 * A dialog's fields as a label column and a control column, one line per field.
 *
 * **The alternative is a stacked `Setting` row each.** Stacked, six fields cost a label line, a control line, a divider
 * and a row of margin apiece, which is a phone screen of chrome for six short values.
 *
 * The label column is fixed rather than `max-content` so that two grids on one screen line up with each other; it
 * is sized for the longest label any of them uses. Below 460px the container query in `styles.css` stacks them,
 * because at that width the column is space the values need more.
 */
export function fieldGrid(parent: HTMLElement): HTMLElement {
  return parent.createDiv({ cls: 'orbis-field-grid' });
}

/** One labeled row of a {@link fieldGrid} — returns the cell to put the control in. */
export function fieldCell(grid: HTMLElement, label: string): HTMLElement {
  grid.createSpan({ cls: 'orbis-field-label', text: label });
  return grid.createDiv({ cls: 'orbis-folder-cell' });
}

/** A labeled text input in a {@link fieldGrid}, which is most of what these dialogs ask for. */
export function fieldInput(
  grid: HTMLElement,
  spec: { label: string; value: string; key?: string; onInput: (value: string) => void }
): HTMLInputElement {
  const cell = fieldCell(grid, spec.label);
  const input = cell.createEl('input', { type: 'text', cls: 'orbis-input-full' });
  input.value = spec.value;
  if (spec.key) input.dataset.orbisFocus = spec.key;
  input.setAttribute('aria-label', spec.label);
  input.addEventListener('input', () => spec.onInput(input.value.trim()));
  return input;
}

/** What a {@link pickListHeader} needs to drive a list's bulk selection. */
export interface PickListHeaderSpec {
  /**
   * The list's name and count — `Chapters · 51 of 51`. Omitted where a fold summary directly above already says
   * it, which is the case for every list that lives in a `<details>`; repeating it two lines apart is noise.
   */
  label?: string;
  /** How many rows exist and how many are ticked, read on every {@link PickListHeader.sync}. */
  count?: () => { selected: number; total: number };
  onSelectAll: () => void;
  onClear: () => void;
  /**
   * Swap what is ticked for what is not. Optional, because it is the one control here that is not obvious — see
   * `action.invert` for when it earns its place.
   */
  onInvert?: () => void;
}

export interface PickListHeader {
  el: HTMLElement;
  /** Re-read the count after a tick, without rebuilding the list. */
  sync: () => void;
}

/**
 * A list's title, its selected count, and the buttons that act on every row.
 *
 * **Separate buttons, never one that toggles.** A control whose label changes under the pointer — "Select all" becoming
 * "Select none" — is the worst answer: with a partial selection both labels are plausible, so one button has to guess
 * which you meant, and the thing you click is not the thing you read. Two buttons never guess.
 *
 * **This does not replace a rule picker.** Save as PDF also offers "Only the 6 with marks" — a content-aware
 * rule that re-applies as the content changes and that no bulk action can express. The rule stays above the fold
 * and these sit inside it: the dropdown answers "which ones", the buttons answer "all or none of them".
 */
export function pickListHeader(parent: HTMLElement, spec: PickListHeaderSpec): PickListHeader {
  const el = parent.createDiv({ cls: 'orbis-chapter-list-header' });
  const title = spec.label ? el.createSpan({ cls: 'orbis-chapter-list-title' }) : null;
  const btns = el.createDiv({ cls: 'orbis-chapter-list-btns' });

  const button = (label: string, onClick: () => void): void => {
    const btn = btns.createEl('button', { text: label, cls: 'orbis-chapter-text-btn' });
    btn.addEventListener('click', onClick);
  };
  button(t('action.select_all'), spec.onSelectAll);
  button(t('action.clear'), spec.onClear);
  if (spec.onInvert) button(t('action.invert'), spec.onInvert);

  const sync = (): void => {
    if (!title || !spec.label) return;
    const count = spec.count?.();
    title.setText(
      count
        ? t('action.list_count', {
            label: spec.label,
            n: String(count.selected),
            total: String(count.total),
          })
        : spec.label
    );
  };
  sync();
  return { el, sync };
}
