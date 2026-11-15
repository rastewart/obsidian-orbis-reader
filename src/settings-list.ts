import { type Setting, SettingGroup, setIcon } from 'obsidian';
import { t } from './i18n';
import { reorderControls } from './reorder-controls';
import { openOnRowTap } from './settings-row-tap';
import { iconButton, keyActivates } from './ui-utils';

/**
 * A reorderable list on a settings page, built and owned by us.
 *
 * **Why this exists rather than Obsidian's declarative list.** A `SettingDefinitionList` gives rows for free and a
 * drag handle, and takes the DOM in exchange: it paints from the definition tree stored at the last `update()` and
 * rebuilds on a schedule of its own, including after a settings write. Reordering from the keyboard cannot survive
 * that — the arrow you pressed is replaced mid-press, and restoring focus afterwards races the rebuild, lands the
 * keyboard on the wrong control, or leaves the saved order disagreeing with the screen. A list that nothing else can
 * rebuild is the one that works.
 *
 * So: a real `SettingGroup` (Obsidian's own card, public since 1.11) holding real `Setting` rows, on a page we
 * render ourselves. Moving a row moves the element among its siblings and tells the caller which positions changed;
 * nothing repaints, so the button under the reader's finger is never destroyed and there is nothing to restore.
 *
 * Every reorderable list in settings should come through here, so they behave identically.
 */
export interface ReorderAction {
  /**
   * The Lucide glyph. **The icon follows the verb, and the verb is in the label.**
   *
   * - `trash` for `action.delete` — it destroys something the vault holds.
   * - `x` for `action.remove` — it takes a thing out of a set, and the thing survives (a field out of a widget's
   *   columns, a sort level off a list).
   *
   * `x` is also the app's DISMISS glyph: a dialog's close, a notice's, a search box's clear. That is the whole
   * reason for the split — one glyph cannot mean both "put this away" and "destroy it".
   *
   * **Where delete lives** is the sibling rule, and it is the row: a list's editor is for editing, and routing
   * delete through the pencil would make "edit" the way to destroy something. An item that cannot be deleted keeps the
   * slot rather than dropping the button — see `hidden` below.
   */
  icon: string;
  label: string;
  run: () => void;
  /**
   * The focus key's suffix, when the icon is not a stable name for the control — an expander's glyph changes with
   * its state, and a key that changed with it would break the restore it exists for. Defaults to the icon.
   */
  key?: string;
  /**
   * Drawn as an empty slot: **an action a row cannot have keeps its place in the row.**
   *
   * The provided dashboard has no delete — it is rebuilt from code each load — and dropping the button would move every
   * control to its left along by one, so one row's chevron would sit a button's width from the others'. A column of
   * icons that shifts by row is read as a mistake before it is read as an absence.
   *
   * `visibility: hidden` rather than removed, so the slot is exactly the size of the button it stands in for and
   * cannot drift from it. That also keeps it out of the tab order: a hidden-by-visibility control is not focusable,
   * which is the one thing `display: none`'s cousins get wrong.
   */
  hidden?: boolean;
  /**
   * Shown but not available — the last of something that must keep one, as a row's switch is then. The row says why
   * in its description; the button only stands where it always does, and is skipped by Tab.
   */
  disabled?: boolean;
}

/**
 * The row itself, for a body that changes what the row says about it — a rename, a count.
 *
 * Two methods rather than the `Setting`: the body has no business reaching into the row it is under, and "set the
 * name" is the whole of what it needs. It also keeps the row and its body from repainting each other — the body
 * writes these two lines by hand precisely so the page does not have to be redrawn.
 */
export interface RowHandle {
  setName(name: string): void;
  setDesc(desc: string): void;
}

/**
 * A row that opens INTO ITSELF rather than into a dialog.
 *
 * **Where a row's editor is a list of its own, it belongs under the row.** The dashboards are the case: a
 * dashboard is a name and an ordered list of widgets, so editing one in a dialog would mean a list inside a
 * dialog whose rows open a second dialog — two modals deep, which is where Obsidian's focus restore has nobody to
 * ask (see `docs/design/dialog-system.md`). Expanded in place, the widget list sits on a page we own, and the only
 * dialog left is the widget editor, opened from a page like every other editor here.
 *
 * The body is drawn on every expand rather than built once and hidden, for two reasons: it reads current state, and
 * a collapsed body left in the DOM is a run of controls a keyboard can still reach and an eye cannot see.
 */
export interface ReorderExpansion {
  /** Draws the row's editor into the body. */
  render: (body: HTMLElement, row: RowHandle) => void;
  /** The expander's label, closed and open. */
  label: string;
  collapseLabel: string;
}

export interface ReorderRow {
  /** Stable identity — the focus key travels with the row, not with its position. */
  key: string;
  name: string;
  /** Plain text, or a fragment when part of the line is formatted — a template shown as code. */
  desc?: string | DocumentFragment;
  /** Draws something of the row's own under its name and description — a theme's sample. */
  decorate?: (setting: Setting) => void;
  /** Drawn before the arrows, in the order given: a pencil, a copy. The optional ones go on the outside, so the
   *  arrows and the switch line up down the list whether a row has them or not. */
  actions?: ReorderAction[];
  /** The row's own switch, if it has one. */
  toggle?: { value: boolean; disabled?: boolean; onChange: (on: boolean) => void };
  /** Tapping the row itself does this — the same thing the pencil does, for a thumb. Defaults to expanding it. */
  openOnTap?: () => void;
  /** The row's editor, under the row — see `ReorderExpansion`. */
  expand?: ReorderExpansion;
}

export interface ReorderListSpec {
  /** Names the list, in the card's heading. */
  heading?: string;
  /** One line under the heading, inside the card, where a list's own description belongs. */
  desc?: string;
  /** The `+` in the heading. */
  add?: { label: string; run: () => void };
  /** Shown in place of rows when there are none — a list nobody can see is worse than an empty one. */
  emptyState?: string;
  rows: ReorderRow[];
  /**
   * Persist a move. Called after the row has already moved on screen, with positions read from the DOM — never with
   * the index a row was rendered at, which is stale the moment anything moves.
   *
   * **Omitted for a list that has no order of its own** — the collections are alphabetical, and a collection is a
   * file rather than a place in an array, so there is nowhere for an order to live. Such a list gets no arrows and no
   * drag handle: offering either would be offering to rearrange something that rearranges itself.
   */
  move?: (from: number, to: number) => void;
  /**
   * Which rows are expanded, by key — the caller's set, not ours.
   *
   * **It has to outlive the page.** Anything saved from inside an expanded row can redraw the whole page, and a
   * dashboard that collapsed every time one of its widgets was switched off would be unusable. The set lives on the
   * settings tab, which survives a redraw; a list that passes none simply opens closed every time.
   */
  expanded?: Set<string>;
  /** Optional diagnostics under the `settings` pill: one line per press, including a press that does nothing. */
  log?: (msg: string) => void;
}

/**
 * The card's title and its `+`, drawn by us.
 *
 * **Not `setHeading` and `addExtraButton`.** Obsidian's heading is a `.setting-item`, and
 * a `.setting-item` is laid out by a container query: at 340px and under, its control area takes a line of its own and
 * the full width. That is right for a settings row and wrong for a heading — and it fires on a card nested inside a
 * row whatever the screen, because the container being measured is the row. On a phone the `+` drops below the
 * title; forcing them back onto one line squeezes the title to "Wid…", and forcing the width squeezes it to nothing.
 *
 * The `+` is a real `<button>` for the reason every other control here is — see `iconButton` — and because
 * Obsidian's own is drawn faint enough to be missed on Android.
 */
function buildListHeading(group: SettingGroup, spec: ReorderListSpec): void {
  if (!spec.heading && !spec.add) return;
  /**
   * **Inside the card, not above it.** Obsidian's heading sits in the group's root, which renders it outside the
   * card's background — on a phone, where the card fills the width and the headings stack up the page, a title and a
   * `+` floating above a box read as belonging to the page rather than to the list they name. In the list container
   * it is the card's first row: title and `+` on one line, the list's description under it.
   */
  /**
   * **Obsidian's row, our contents.**
   *
   * The row's classes are not decoration: the settings pane runs its own keyboard model, moving focus from one
   * `.setting-item` to the next and into the controls inside them — which is why rows carrying `tabindex="-1"` receive
   * focus at all. A heading of our own, however correct its markup, is invisible to that model, and its `+` cannot be
   * reached by Tab. So the element is a `.setting-item.setting-item-heading`, and takes Obsidian's heading spacing and
   * color with it.
   *
   * What stays ours is everything INSIDE: a name div and a real button, not `.setting-item-info` and
   * `.setting-item-control`. Those two class names are what the container query at 340px reaches for — and it reaches
   * for them as DESCENDANTS, so a card nested inside a row would have its heading stacked and squeezed whatever the
   * screen. Without those names in our subtree there is nothing for it to match.
   */
  const head = group.listEl.createDiv({ cls: 'setting-item setting-item-heading orbis-list-heading' });
  if (spec.heading) head.createDiv({ cls: 'setting-item-name orbis-list-heading-name', text: spec.heading });
  const add = spec.add;
  if (!add) return;
  const btn = head.createEl('button', { cls: 'clickable-icon orbis-list-add', attr: { type: 'button' } });
  setIcon(btn, 'plus');
  btn.setAttribute('aria-label', add.label);
  btn.setAttribute('aria-keyshortcuts', 'Enter');
  btn.addEventListener('click', add.run);
  keyActivates(btn, add.run);
}

/**
 * The chevron that opens a row into itself, and the body it opens.
 *
 * **The body is a child of the ROW, not a sibling of it.** Every list here reorders by moving the row element among
 * its siblings, and a body left beside the row would be counted as a row by that arithmetic and left behind by the
 * move. Inside, a dashboard's widgets travel with the dashboard and the indices stay honest — at the price of a
 * wrapping flex row, which is what `.orbis-expandable-row` is for.
 *
 * A real `<button>` with `keyActivates`, for the reason `iconButton` gives: `addExtraButton` builds a div, and a
 * button carries the role, the keys and a working `disabled` without depending on what the installed version adds.
 */
function buildExpander(
  setting: Setting,
  row: ReorderRow,
  expand: ReorderExpansion,
  expanded: Set<string> | undefined
): HTMLButtonElement {
  setting.settingEl.addClass('orbis-expandable-row');
  const body = setting.settingEl.createDiv({ cls: 'orbis-row-body' });
  const btn = setting.controlEl.createEl('button', { cls: 'clickable-icon orbis-row-expander' });
  btn.dataset.orbisFocus = `expand:${row.key}`;
  btn.setAttribute('aria-keyshortcuts', 'Enter');
  const paint = (open: boolean): void => {
    btn.empty();
    setIcon(btn, open ? 'chevron-down' : 'chevron-right');
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? expand.collapseLabel : expand.label);
    body.empty();
    // Emptied on the way down as well as up: a hidden body of live controls is unreachable by eye and reachable by
    // Tab, which is the fault the collapsed voice filters had.
    body.style.display = open ? '' : 'none';
    if (open) {
      expand.render(body, {
        setName: (name) => {
          setting.setName(name);
        },
        setDesc: (desc) => {
          setting.setDesc(desc);
        },
      });
    }
    if (open) expanded?.add(row.key);
    else expanded?.delete(row.key);
  };
  const flip = (): void => paint(btn.getAttribute('aria-expanded') !== 'true');
  btn.addEventListener('click', flip);
  keyActivates(btn, flip);
  paint(expanded?.has(row.key) === true);
  return btn;
}

/** Build the list into `parent`. Returns the group, for a caller that wants to add a row of its own after it. */
export function renderReorderList(parent: HTMLElement, spec: ReorderListSpec): SettingGroup {
  const group = new SettingGroup(parent);
  group.addClass('orbis-reorder-list');
  buildListHeading(group, spec);
  /**
   * The list's own prose is a LINE, not a row. A `Setting` with only a description is still a settings row, and the
   * settings pane makes rows tab stops — so the reader would have to Tab past a paragraph that does nothing on the way
   * to the first control. Plain text in the card says the same thing and is not a control.
   */
  if (spec.desc) group.listEl.createDiv({ cls: 'orbis-reorder-note', text: spec.desc });
  if (!spec.rows.length && spec.emptyState) {
    group.listEl.createDiv({ cls: 'orbis-reorder-empty', text: spec.emptyState });
    return group;
  }
  const dragState: { from: number | null } = { from: null };
  spec.rows.forEach((row, index) => {
    group.addSetting((setting) => {
      setting.setName(row.name);
      if (row.desc) setting.setDesc(row.desc);
      row.decorate?.(setting);
      // First of the controls, because it is what the row is FOR once it has one: everything else a row offers acts
      // on the thing the expander opens.
      const expander = row.expand ? buildExpander(setting, row, row.expand, spec.expanded) : null;
      for (const action of row.actions ?? []) {
        setting.addButton((b) => {
          if (action.hidden) {
            // The same button, made furniture: no handler, no key for a focus restore to find, no tab stop.
            iconButton(b, action.icon, action.label, () => {});
            b.buttonEl.addClass('orbis-action-gap');
            b.buttonEl.disabled = true;
            b.buttonEl.tabIndex = -1;
            b.buttonEl.setAttribute('aria-hidden', 'true');
            return;
          }
          iconButton(b, action.icon, action.label, action.run);
          if (action.disabled) {
            b.setDisabled(true);
            return;
          }
          keyActivates(b.buttonEl, action.run);
          b.buttonEl.dataset.orbisFocus = `${action.key ?? action.icon}:${row.key}`;
        });
      }
      /**
       * Tapping the row opens the same editor the pencil does — through `openOnRowTap`, not a listener of our own.
       * Skipping `button, input` is not the whole story: Obsidian's switch is a DIV around a checkbox, so a tap on
       * its padding is not "a control" by that test and would turn the switch AND open the editor. The shared helper
       * skips the entire control area, and guards one gesture opening two editors.
       *
       * **Registered before the arrows, not after them**, because of the early return below: a list with no order of
       * its own never gets past it, so registered after, tapping a collection would do nothing.
       */
      const onTap = row.openOnTap ?? (expander ? () => expander.click() : null);
      if (onTap) openOnRowTap(setting, onTap);
      /**
       * The row's own switch, BEFORE the reorder controls: moving and dragging are always the right-most things in a
       * row, so everything a row does to itself comes first.
       */
      if (row.toggle) {
        const tog = row.toggle;
        setting.addToggle((c) => {
          c.setValue(tog.value)
            .setDisabled(tog.disabled === true)
            .onChange((on) => tog.onChange(on));
          const box = c.toggleEl.querySelector('input');
          if (box) box.dataset.orbisFocus = `enabled:${row.key}`;
        });
      }
      if (!spec.move) return; // no order to change: no arrows, no handle
      const persist = spec.move;
      /**
       * The three controls come from `reorderControls`, shared with every other reorderable list in the plugin —
       * see there for why they are real buttons, keyed, and why the handle is not a tab stop. `inPlace` because a
       * settings page must not repaint to reorder: the pane takes the keyboard when it does.
       */
      reorderControls({
        row: setting.settingEl,
        into: setting.controlEl,
        key: row.key,
        index,
        count: spec.rows.length,
        labels: { up: t('lookup_page.move_up'), down: t('lookup_page.move_down'), drag: t('library_page.value_drag') },
        drag: dragState,
        move: persist,
        inPlace: true,
        log: spec.log,
      });
    });
  });
  return group;
}
