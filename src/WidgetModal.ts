// Editing a widget, and the dashboard body that lists them. See docs/design/library.md.
//
// The widget editor is a dialog for the same reason the filter conditions got one: a widget is a dozen fields, a
// list row has space for none of them, and on a phone a text field partway down a growing dialog ends up behind the
// keyboard. So a dashboard shows its widgets as sentences with a pencil, and the pencil opens a small dialog.
//
// **The dashboard itself is not a dialog.** A dialog listing widgets, whose rows open the widget editor on top of it,
// is two modals deep — which is where Obsidian's focus restore runs out of things to restore to: on Save the keyboard
// would leave the dialogs entirely for the settings window behind. `renderDashboardBody` draws the dashboard under its
// row on the settings page instead, so the widget editor opens from a page like every other editor here. See
// `docs/design/dialog-system.md`.

import { type App, Notice, Setting } from 'obsidian';
import { byName } from './by-name';
import { confirmThen } from './ConfirmModal';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { GROUP_NONE, labelOf } from './library/arrange';
import { collectionsOfSpecies, speciesOf } from './library/collection-species';
import { defaultKindFor, defaultWidgetCollection, widgetKindsFor, widgetViewsFor } from './library/dashboard';
import { DEFAULT_DISPLAY_FIELDS, displayableFields } from './library/display-fields';
import { fieldsOfSpecies, fieldValuesFor, libraryFields } from './library/fields';
import { DEFAULT_RECORD_FIELDS } from './library/record-row';
import { widgetHeading } from './library/widget-heading';
import { OrbisModal } from './OrbisModal';
import { reorderControls } from './reorder-controls';
import type {
  DashboardWidget,
  LibraryCollection,
  LibraryDashboard,
  LibraryViewType,
  NoteSpecies,
  PickPool,
  SummaryTotals,
  WidgetKind,
} from './settings';
import { type ReorderRow, renderReorderList } from './settings-list';
import { openOnce } from './settings-row-tap';
import { LIBRARY_SVG } from './system-glyphs';
import { iconButton, keyActivates, rebuildKeepingFocus, renderTabRow } from './ui-utils';

/**
 * The kinds, in the order the dropdown offers them, with the line that explains each.
 *
 * **Short names, and a hint that changes with the choice.** Names that were sentences — "A book you have not
 * started" — would explain themselves at the cost of a dropdown of paragraphs. A word or two each reads as a
 * list of options, and the sentence goes on a line under the control, where it has room to say what the label
 * cannot.
 */
const KIND_LABELS: Array<{ kind: WidgetKind; label: TranslationKey; hint: TranslationKey }> = [
  { kind: 'titles', label: 'library_page.widget_kind_titles', hint: 'library_page.widget_hint_titles' },
  // The record species' `titles`: the collection itself, as rows. Offered only where the collection gathers
  // records — see `widgetKindsFor`.
  { kind: 'records', label: 'library_page.widget_kind_records', hint: 'library_page.widget_hint_records' },
  { kind: 'search', label: 'library_page.widget_kind_search', hint: 'library_page.widget_hint_search' },
  { kind: 'continue', label: 'library_page.widget_kind_continue', hint: 'library_page.widget_hint_continue' },
  { kind: 'recent', label: 'library_page.widget_kind_recent', hint: 'library_page.widget_hint_recent' },
  { kind: 'recordings', label: 'library_page.widget_kind_recordings', hint: 'library_page.widget_hint_recordings' },
  { kind: 'pick', label: 'library_page.widget_kind_pick', hint: 'library_page.widget_hint_pick' },
  { kind: 'summary', label: 'library_page.widget_kind_summary', hint: 'library_page.widget_hint_summary' },
];

/** A copy of `list` with the item at `from` moved to `to` — the ordering every reorderable list here does. */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

/** How search results are ordered, for the one kind that produces an order of its own. */
const SEARCH_ORDERS: Array<{ value: 'match' | 'collection'; label: TranslationKey }> = [
  { value: 'match', label: 'library_page.widget_order_match' },
  { value: 'collection', label: 'library_page.widget_order_collection' },
];

/** What a pick draws from. Two, deliberately: anything more particular than this is a collection. */
const PICK_POOLS: Array<{ value: PickPool; label: TranslationKey }> = [
  { value: 'no-status', label: 'library_page.widget_pool_no_status' },
  { value: 'any', label: 'library_page.widget_pool_any' },
];

const VIEW_LABELS: Record<LibraryViewType, TranslationKey> = {
  list: 'library_page.widget_view_list',
  covers: 'library_page.widget_view_covers',
  table: 'library_page.widget_view_table',
};

/**
 * What a widget row says under its name: how many titles, and whether it can expand.
 *
 * Spelled "12 titles" and "all titles" rather than "12" and "All", which read as codes beside a name — a bare
 * number leaves you guessing whether it counts titles, columns or something else entirely.
 */
function describeWidget(widget: DashboardWidget): string {
  const parts = [
    widget.count === undefined
      ? t('library_page.widget_titles_all')
      : widget.count === 1
        ? t('library_page.widget_titles_one')
        : t('library_page.widget_titles', { count: String(widget.count) }),
  ];
  parts.push(t(VIEW_LABELS[widget.view]));
  if (widget.expandedView) parts.push(t('library.show_all'));
  return parts.join(' · ');
}

/**
 * Make every control inside an element unusable, leaving what it says legible.
 *
 * **A sweep rather than a flag per control.** The provided dashboard exists to be READ — its widgets are the worked
 * examples of every setting the editor offers — so the read-only dialogs are the same dialogs, which is what makes
 * them worth opening: you learn where each thing lives, and copying it then feels like the same screen. A sweep also
 * cannot go stale, where a `disabled` threaded through thirty controls grows a hole the first time one is added.
 *
 * `disabled` rather than `pointer-events: none`, so a keyboard cannot reach what a finger cannot. Anything marked
 * `data-live` is left alone: the tab row has to keep working, or two thirds of the configuration is unreachable.
 */
function freezeControls(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('input, select, textarea, button'))) {
    if (el.closest('[data-live]')) continue;
    (el as HTMLInputElement).disabled = true;
    el.setAttribute('aria-disabled', 'true');
  }
}

/**
 * Add or edit one widget.
 *
 * The expanded view is one dropdown rather than a toggle plus a picker: "off, as a list, as covers" is three
 * states of one question, and splitting it into two controls invites the pair that cannot happen — expansion on
 * with no view to expand into.
 */
class WidgetModal extends OrbisModal {
  private kind: WidgetKind;
  private label: string;
  private collection: string;
  private searchOrder: 'match' | 'collection';
  private pickPool: PickPool;
  private pickRequiresFile: boolean;
  private count: string;
  private view: LibraryViewType;
  private expandedView: LibraryViewType | 'none';
  private fields: string[] | null;
  /** Shared by the field rows, as `wireListDrag` expects. */
  private readonly fieldDrag: { from: number | null } = { from: null };
  private totals: SummaryTotals;
  private showEmptyGroups: boolean;
  private bodyEl: HTMLElement | null = null;
  private tabEl: HTMLElement | null = null;
  private tab: 'general' | 'fields' | 'view' = 'general';

  constructor(
    app: App,
    private readonly existing: DashboardWidget | null,
    private readonly collections: LibraryCollection[],
    private readonly onConfirm: (values: Omit<DashboardWidget, 'id' | 'system'>) => void
  ) {
    // Full screen on a phone, like the dashboard and collection editors it sits between: a kind, its hint, a
    // collection, a heading, a view, a count and an expanded view do not fit in a capped dialog, where the action
    // buttons end up over the fields rather than under them.
    // Same as the dashboard editor it opens from: a widget is confirmed with Save, so a stray click outside
    // would throw away everything set in here.
    super(app, { compact: true, fullScreenOnMobile: true, dismissOnOutsideClick: false, icon: LIBRARY_SVG });
    this.kind = existing?.kind ?? 'titles';
    this.label = existing?.label ?? '';
    // The provided collection by default — every title in the vault — so a new widget asks one fewer question and
    // means what someone adding a "Continue" widget would have assumed it meant. Asked by id rather than taken from
    // the front of the list: see `defaultWidgetCollection`.
    this.collection = existing?.collection || defaultWidgetCollection(collections);
    this.searchOrder = existing?.searchOrder ?? 'match';
    // Absent means the status rule, so an existing widget and a new one answer the same way — see `pickPool`.
    this.pickPool = existing?.pickPool ?? 'no-status';
    this.pickRequiresFile = existing?.pickRequiresFile === true;
    this.count = existing?.count === undefined ? '' : String(existing.count);
    this.view = existing?.view ?? 'list';
    this.expandedView = existing?.expandedView ?? 'none';
    // `null` is "never chosen", which is not the same as "chosen none" — the first shows the default pair of
    // authors and series, the second shows nothing at all, and a shelf of covers may well want the second.
    this.fields = existing?.fields ? [...existing.fields] : null;
    this.totals = existing?.totals ?? 'off';
    this.showEmptyGroups = existing?.showEmptyGroups ?? false;
  }

  /** Provided widgets are read-only: they are rebuilt from code each load, so an edit would last until restart. */
  private get readOnly(): boolean {
    return this.existing?.system === true;
  }

  protected dialogTitle(): string {
    if (this.readOnly) return t('library_page.view_widget');
    return this.existing ? t('library_page.edit_widget') : t('library_page.add_widget');
  }

  protected renderDialog() {
    const { contentEl } = this;
    this.modalEl.addClass('orbis-form-dialog');
    // Disabled controls are styled to look spent — gray text on a gray field — which for a value you opened the
    // dialog to READ is indistinguishable from an empty box with a placeholder in it. See `.orbis-frozen-dialog`.
    if (this.readOnly) this.modalEl.addClass('orbis-frozen-dialog');
    // **Not pinned above the keyboard, deliberately.** That helper fixes one shape — a small dialog whose only
    // field sits near its top — by taking the modal out of flow and capping it at about half the screen. Here it
    // would fight the phone instead: opening the keyboard on "How many titles" jams the dialog against the cap, and
    // dismissing the keyboard leaves it there. Full screen on mobile already answers the keyboard, which is how the
    // collection editor beside this one behaves, and the count has its own short tab, so the field is near the top
    // anyway.
    this.bodyEl = contentEl.createDiv();
    this.renderBody();

    const actions = actionRow(this.footer());
    // Nothing to save and nothing to delete, so Done is the only button: a Save that wrote nowhere would be the
    // dialog telling a lie about itself.
    if (this.readOnly) {
      // Close rather than Done: Done says you finished something, and nothing here can be finished.
      actionButton(actions, { label: t('action.close'), cta: true, onClick: () => this.close() });
      return;
    }
    // **No Delete here** — it is the row's trash, like every other list in settings. See `paintDashboardBody`.
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(actions, { label: t('action.save'), cta: true, onClick: () => this.save() });
  }

  /**
   * The heading, then whichever tab is showing.
   *
   * **The heading is above the tabs, not on one.** It is the widget's name — what the dashboard will call this
   * thing — and a name is the identity of what you are editing rather than one of its settings. Same reason the
   * collection editor puts its Name there.
   *
   * Redrawn whole when the kind changes, because a collection widget asks for a collection and the others do not.
   */
  private renderBody(): void {
    const parent = this.bodyEl;
    if (!parent) return;
    /**
     * **Through `rebuildKeepingFocus`, because the controls here redraw the dialog.** Choosing a collection or a kind
     * changes which questions the dialog asks, so the whole body is redrawn — and the dropdown that did it is
     * destroyed with it, which would drop the keyboard to the top of the dialog. Every control that carries a key is
     * keyed for this: a redraw puts the reader back on the control they just used, whatever moved around it.
     */
    rebuildKeepingFocus(parent, () => this.paintBody(parent));
  }

  private paintBody(parent: HTMLElement): void {
    parent.empty();

    // Said where the delete button would be, not on the row: it explains an absence, and a row is where you read
    // what a widget IS. On a row it would also run past the dialog's edge and clip the name it qualifies.
    if (this.existing?.system) parent.createDiv({ cls: 'orbis-rules-hint', text: t('library_page.widget_system') });

    // How it announces itself: shown for every kind, because every widget has a heading — the fallback differs, not
    // the field.
    const labelRow = new Setting(parent)
      .setName(t('library_page.widget_label'))
      .setDesc(t('library_page.widget_label_desc'));
    labelRow.settingEl.addClass('orbis-setting-stacked');
    labelRow.addText((txt) => {
      txt.inputEl.addClass('orbis-input-full');
      txt.inputEl.dataset.orbisFocus = 'heading';
      // **The heading it will get, as the placeholder** — the Library's own answer (`widgetHeading`), so "Search ·
      // Fixtures" or "Fixtures by Reading status" rather than a bare collection name that is right only for Titles.
      // Both dropdowns redraw this body, so it follows the collection and the kind as they change.
      txt.setPlaceholder(widgetHeading({ kind: this.kind, collection: this.collection }, this.collections));
      txt.setValue(this.label).onChange((v) => (this.label = v));
    });

    // **Two tabs for six rows, which is more than this dialog's length alone would justify** — the reason is the
    // count. It is the one box here that raises a keyboard, and on one page it would sit second from the bottom, right
    // where a phone keyboard covers it. On its own tab it is the second row on a short screen.
    renderTabRow(
      parent,
      [
        { id: 'general', label: t('library_page.widget_tab_general') },
        { id: 'fields', label: t('library_page.widget_tab_properties') },
        { id: 'view', label: t('library_page.widget_tab_view') },
      ],
      this.tab,
      (id) => {
        this.tab = id;
        this.renderTabBody();
      }
    );
    this.tabEl = parent.createDiv();
    this.renderTabBody();
    // Last, so it catches whatever the tab body just drew — and again on every tab switch, in `renderTabBody`.
    if (this.readOnly) freezeControls(parent);
  }

  /**
   * Whether the collection's grouping field has a list of possible values.
   *
   * The question behind "show unused values": a value can only be missing from something that enumerates its
   * values. `type`, `genre` and reading status do; author and series do not — their values ARE the records, so
   * there is no absent one to report.
   */
  private groupingHasValues(): boolean {
    const collection = this.collections.find((c) => c.id === this.collection);
    const groupBy = collection?.groupBy;
    if (!groupBy || groupBy === GROUP_NONE) return false;
    return (collection?.fieldValues?.[groupBy] ?? fieldValuesFor(groupBy))?.length ? true : false;
  }

  /**
   * The fields shown beside a title, in the order they are shown.
   *
   * **A list you build, not a set you tick.** Order is half the setting — "author · series" and "series · author"
   * are different rows — and a checklist has nowhere to express it. So the rows here are the chosen fields, with
   * the same arrows and drag handle every other ordered list in the plugin has, and unchosen ones live behind
   * `Add a field`.
   */
  private renderFieldsTab(parent: HTMLElement): void {
    const records = this.species() === 'reading_record';
    // One line: where the fields show, and what happens when a title lacks one, are the guide's to explain.
    parent.createDiv({
      cls: 'orbis-rules-hint',
      text: t(records ? 'library_page.widget_properties_desc_records' : 'library_page.widget_properties_desc'),
    });
    const chosen = this.fields;
    if (chosen?.length === 0)
      parent.createDiv({ cls: 'orbis-rules-hint', text: t('library_page.widget_properties_none') });

    // The default pair differs by species: authors and series identify a title, while a record's row says which
    // book and which chapter the passage came from.
    const list = chosen ?? [...(this.species() === 'reading_record' ? DEFAULT_RECORD_FIELDS : DEFAULT_DISPLAY_FIELDS)];
    const commit = (next: string[]) => {
      this.fields = next;
      this.renderTabBody();
    };
    // In a box of their own: the Orbis list look, and one container for `wireListDrag` to scan.
    const box = list.length > 0 ? parent.createDiv({ cls: 'orbis-list-box' }) : parent;
    // Keyed by the field name, so an arrow press follows the row it moved — `renderTabBody` rebuilds this list, and
    // the rebuild goes through `rebuildKeepingFocus`.
    list.forEach((key, index) => {
      const row = new Setting(box).setName(key);
      row.settingEl.addClass('orbis-value-row');
      /**
       * A real button, not `addExtraButton`, which builds a div — see `iconButton` for what that costs. The div
       * carries no `tabindex`, so inside a dialog, where Tab follows plain DOM order, this ✕ could not be reached
       * from the keyboard at all.
       */
      const remove = () => commit(list.filter((_, i) => i !== index));
      row.addButton((b) => {
        iconButton(b, 'x', t('library_page.widget_property_remove'), remove);
        keyActivates(b.buttonEl, remove);
        b.buttonEl.dataset.orbisFocus = `remove:${key}`;
      });
      // The arrows and the handle, shared with every other reorderable list — see `reorderControls`.
      reorderControls({
        row: row.settingEl,
        into: row.controlEl,
        key,
        index,
        count: list.length,
        keyPrefix: 'field',
        labels: {
          up: t('library_page.property_up'),
          down: t('library_page.property_down'),
          drag: t('library_page.value_drag'),
        },
        drag: this.fieldDrag,
        move: (from, to) => commit(moved(list, from, to)),
      });
    });

    // Only what is not already shown: a field twice on one row is a row that says everything twice.
    const rest = displayableFields(this.customFields(), this.species()).filter((key) => !list.includes(key));
    const add = new Setting(parent);
    add.addDropdown((dd) => {
      dd.selectEl.dataset.orbisFocus = 'add-field';
      dd.addOption('', t('library_page.widget_properties_add'));
      for (const key of rest) dd.addOption(key, key);
      dd.setValue('').onChange((key) => key && commit([...list, key]));
    });
    /**
     * Back to "never chosen", which is not the same as removing every row — see the constructor.
     *
     * **A row of its own, saying what it reverts to.** Next to Add a field it was the destructive twin of the
     * additive control, styled the same and one slip away; and "Use the default" named nothing a reader could
     * predict. The row says what the fields go back to, so the button can stay two words — and the whole row is
     * hidden while the list already is the default, where it would describe a button that is not there.
     */
    if (this.fields !== null) {
      new Setting(parent)
        .setDesc(t(records ? 'library_page.widget_properties_revert_records' : 'library_page.widget_properties_revert'))
        .addButton((btn) =>
          btn.setButtonText(t('library_page.widget_properties_reset')).onClick(() => {
            this.fields = null;
            this.renderTabBody();
          })
        );
    }
  }

  /** The reader's own fields, offered by the picker alongside the ones Orbis reads. */
  private customFields(): string[] {
    const schema = fieldsOfSpecies(this.species());
    // Yours by name, after the built-in fields in their fixed order — as the Properties page lists them.
    return byName(
      libraryFields()
        .map((field) => field.key)
        .filter((key) => !schema.includes(key)),
      (key) => key
    );
  }

  /** Which species this widget draws — the species of the collection it points at, and nothing stored of its own. */
  private species(): NoteSpecies {
    const collection = this.collections.find((c) => c.id === this.collection);
    return collection ? speciesOf(collection) : 'title';
  }

  /**
   * Bring the kind and the view back inside what the chosen collection can answer.
   *
   * Repointing a widget at the other species is a real thing to do — a shelf becomes a list of highlights — and
   * every setting that was about books has to go somewhere. Coerced to the species' default rather than refused:
   * the reader's intent is the collection they just picked, and a dialog that reverted the picker instead would be
   * arguing with them about the one thing they said.
   */
  private coerceToSpecies(): void {
    const species = this.species();
    const kinds = widgetKindsFor(species);
    if (!kinds.includes(this.kind)) this.kind = defaultKindFor(species);
    const views = widgetViewsFor(species);
    if (!views.includes(this.view)) this.view = views[0];
    if (this.expandedView !== 'none' && !views.includes(this.expandedView)) this.expandedView = 'none';
    // The fields are keys of the other species' schema — `authors` on a highlight — so they are dropped back to
    // the default rather than shown as rows that would read as blank cells.
    if (this.fields?.some((key) => !fieldsOfSpecies(species).includes(key))) this.fields = null;
  }

  /** What this widget shows, or how it shows it. */
  private renderTabBody(): void {
    const parent = this.tabEl;
    if (!parent) return;
    // Through `rebuildKeepingFocus`: the fields tab reorders by rebuilding this body, and the keyboard has to stay on
    // the arrow that did it. The arrows carry `field-up:`/`field-down:` keys.
    rebuildKeepingFocus(parent, () => this.paintTabBody(parent));
  }

  private paintTabBody(parent: HTMLElement): void {
    parent.empty();
    // Every path out of here goes through the freeze, including the early returns below — a tab that came back live
    // would be an editable page inside a dialog that says nothing can be changed.
    const frozen = () => this.readOnly && freezeControls(parent);
    if (this.tab === 'fields') {
      this.renderFieldsTab(parent);
      frozen();
      return;
    }
    if (this.tab === 'view') {
      // **On a summary the view describes the page a category opens into**, not the widget: its own rows are
      // category rows, so the field has nothing else to mean and no reason to be hidden.
      new Setting(parent)
        .setName(t(this.kind === 'summary' ? 'library_page.widget_view_summary' : 'library_page.widget_view'))
        .setDesc(t(this.kind === 'summary' ? 'library_page.widget_view_summary_desc' : 'library_page.widget_view_desc'))
        .addDropdown((dd) => {
          dd.selectEl.dataset.orbisFocus = 'view';
          // Only the views this species can be drawn in — a strip of covers over records would be one book's
          // artwork repeated. See `widgetViewsFor`.
          for (const view of widgetViewsFor(this.species())) dd.addOption(view, t(VIEW_LABELS[view]));
          dd.setValue(this.view).onChange((v) => (this.view = v as LibraryViewType));
        });

      const countRow = new Setting(parent)
        .setName(t('library_page.widget_count'))
        .setDesc(t('library_page.widget_count_desc'));
      countRow.addText((txt) => {
        txt.inputEl.dataset.orbisFocus = 'count';
        txt.inputEl.type = 'number';
        txt.inputEl.min = '0';
        txt.setPlaceholder(t('library_page.widget_count_all'));
        txt.setValue(this.count).onChange((v) => (this.count = v));
      });

      if (this.kind === 'summary') {
        new Setting(parent)
          .setName(t('library_page.widget_totals'))
          .setDesc(t('library_page.widget_totals_desc'))
          .addDropdown((dd) => {
            dd.selectEl.dataset.orbisFocus = 'totals';
            dd.addOption('off', t('library_page.widget_totals_off'));
            dd.addOption('sum', t('library_page.widget_totals_sum'));
            dd.addOption('collection', t('library_page.widget_totals_collection'));
            dd.setValue(this.totals).onChange((v) => (this.totals = v as SummaryTotals));
          });
        // Only where the grouping field HAS a list of values to be missing from — group by author and there is no
        // universe to compare against, so the toggle would do nothing whatever it was set to.
        if (this.groupingHasValues()) {
          new Setting(parent)
            .setName(t('library_page.widget_empty_groups'))
            .setDesc(t('library_page.widget_empty_groups_desc'))
            .addToggle((tog) => {
              tog.toggleEl.querySelector('input')?.setAttribute('data-orbis-focus', 'empty-groups');
              tog.setValue(this.showEmptyGroups).onChange((v) => (this.showEmptyGroups = v));
            });
        }
        frozen();
        return;
      }

      new Setting(parent)
        .setName(t('library_page.widget_expand'))
        .setDesc(t('library_page.widget_expand_desc'))
        .addDropdown((dd) => {
          dd.selectEl.dataset.orbisFocus = 'expand';
          dd.addOption('none', t('library_page.widget_expand_none'));
          for (const view of widgetViewsFor(this.species())) dd.addOption(view, t(VIEW_LABELS[view]));
          dd.setValue(this.expandedView).onChange((v) => (this.expandedView = v as LibraryViewType | 'none'));
        });
      frozen();
      return;
    }

    // **What it draws from comes first, then what it does with it** — scope, then treatment. The other order
    // asks you to choose a kind of view over a set you have not named yet, which is how a widget ends up
    // labeled for one collection and pointed at another.
    // **Every kind draws from a collection**, not only the one that shows a collection outright: it is what makes
    // "search, but only this shelf" and "what I am part-way through, in this shelf" expressible at all.
    if (this.collections.length === 0) {
      parent.createDiv({ cls: 'orbis-rules-hint', text: t('library_page.widget_no_collections') });
    } else {
      new Setting(parent)
        .setName(t('library_page.widget_collection'))
        .setDesc(t('library_page.widget_collection_desc'))
        .addDropdown((dd) => {
          dd.selectEl.dataset.orbisFocus = 'collection';
          // **Grouped by species, because the collection is what says which species this widget draws.** A widget
          // has no species field of its own — one more thing to keep in step with the collection it points at —
          // so the two groups here are the only place the distinction is made, and the kinds below follow it.
          for (const species of ['title', 'reading_record'] as const) {
            const mine = collectionsOfSpecies(this.collections, species);
            if (mine.length === 0) continue;
            const group = dd.selectEl.createEl('optgroup', {
              attr: {
                label: t(species === 'title' ? 'library_page.title_collections' : 'library_page.record_collections'),
              },
            });
            for (const collection of mine) group.createEl('option', { value: collection.id, text: collection.name });
          }
          // A collection that has been deleted still belongs in its own dropdown, or opening this widget would
          // silently repoint it at whichever collection happens to be first.
          if (this.collection && !this.collections.some((c) => c.id === this.collection)) {
            dd.addOption(this.collection, this.collection);
          }
          dd.setValue(this.collection).onChange((v) => {
            this.collection = v;
            // A kind or a view the new species cannot answer is coerced rather than left to fail quietly — see
            // `coerceToSpecies`. The whole body redraws because both dropdowns below change with it.
            this.coerceToSpecies();
            this.renderBody();
          });
        });
    }

    new Setting(parent).setName(t('library_page.widget_kind')).addDropdown((dd) => {
      dd.selectEl.dataset.orbisFocus = 'kind';
      // Only the kinds this species can answer: "what am I part-way through" is a question about books, and a
      // dropdown offering it over a collection of highlights would be offering an empty widget.
      const offered = widgetKindsFor(this.species());
      // A widget whose stored kind this species cannot answer — a hand-edited `data.json`, a collection that
      // changed species out from under it — is corrected here rather than left showing the first option while
      // holding another: what the dialog shows has to be what Save writes.
      if (!offered.includes(this.kind)) this.kind = defaultKindFor(this.species());
      for (const entry of KIND_LABELS.filter((e) => offered.includes(e.kind))) dd.addOption(entry.kind, t(entry.label));
      dd.setValue(this.kind).onChange((v) => {
        this.kind = v as WidgetKind;
        // The whole body, not this tab: the heading's placeholder depends on the kind.
        this.renderBody();
      });
    });
    const hint = KIND_LABELS.find((entry) => entry.kind === this.kind)?.hint;
    if (hint) parent.createDiv({ cls: 'orbis-rules-hint', text: t(hint) });

    // What a pick may suggest. Two rows rather than one, because they are different kinds of rule: one reads the
    // note, the other asks whether a file is there — which is the half no collection can express.
    if (this.kind === 'pick') {
      new Setting(parent)
        .setName(t('library_page.widget_pool'))
        // The flag-to-read value by what the reader calls it — "want to read" was a status that never existed.
        .setDesc(
          t('library_page.widget_pool_desc', { status: labelOf(fieldValuesFor('reading_status'), 'interested') })
        )
        .addDropdown((dd) => {
          dd.selectEl.dataset.orbisFocus = 'pool';
          for (const entry of PICK_POOLS) dd.addOption(entry.value, t(entry.label));
          dd.setValue(this.pickPool).onChange((v) => (this.pickPool = v as PickPool));
        });
      new Setting(parent).setName(t('library_page.widget_requires_file')).addToggle((tog) => {
        tog.toggleEl.querySelector('input')?.setAttribute('data-orbis-focus', 'requires-file');
        tog.setValue(this.pickRequiresFile).onChange((v) => (this.pickRequiresFile = v));
      });
    }

    // Only search has an order to argue about: every other kind either IS an ordering or takes the collection's.
    if (this.kind === 'search') {
      new Setting(parent)
        .setName(t('library_page.widget_order'))
        .setDesc(t('library_page.widget_order_desc'))
        .addDropdown((dd) => {
          dd.selectEl.dataset.orbisFocus = 'order';
          for (const entry of SEARCH_ORDERS) dd.addOption(entry.value, t(entry.label));
          dd.setValue(this.searchOrder).onChange((v) => (this.searchOrder = v as 'match' | 'collection'));
        });
    }
    frozen();
  }

  private save(): void {
    if (!this.collection) {
      new Notice(t('library_page.widget_no_collections'));
      return;
    }
    const parsed = Number.parseInt(this.count, 10);
    this.onConfirm({
      kind: this.kind,
      // Empty label rather than a copy of the collection's name: a stored copy would stop following a rename.
      label: this.label.trim() || undefined,
      collection: this.collection,
      // Only meaningful on a search widget, and only stored when it is not the default.
      searchOrder: this.kind === 'search' && this.searchOrder === 'collection' ? 'collection' : undefined,
      // Stored only when it is not the default, like every other kind-specific option here.
      pickPool: this.kind === 'pick' && this.pickPool === 'any' ? 'any' : undefined,
      pickRequiresFile: this.kind === 'pick' && this.pickRequiresFile ? true : undefined,
      view: this.view,
      // Absent means all of them, so a blank box and a nonsense value both mean "all" rather than "zero".
      count: Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined,
      fields: this.fields ?? undefined,
      expandedView: this.expandedView === 'none' ? undefined : this.expandedView,
      // Only meaningful on a summary, and only stored when it is not the default — a widget carrying settings for
      // a kind it is not would answer questions about itself that nobody asked.
      totals: this.kind === 'summary' && this.totals !== 'off' ? this.totals : undefined,
      showEmptyGroups: this.kind === 'summary' && this.showEmptyGroups ? true : undefined,
      enabled: this.existing?.enabled ?? true,
    });
    this.close();
  }
}

/**
 * What a dashboard is, drawn under its row on the settings page: its name, and the widgets on it in order.
 *
 * **Every change is saved as it is made**, which is what lets this be a body rather than a dialog: there is no draft
 * to commit and so no Save to press, and the widget editor's own Save writes through to the same place. As a dialog
 * listing widgets, the alternative — edit a copy, commit on Save — would need TWO saves, and nothing on screen would
 * say so.
 *
 * A provided dashboard is drawn the same way and frozen: its widgets are the worked examples of every setting the
 * editor offers, and it is rebuilt from code on every load, so a change here would last until the next start.
 */
export interface DashboardBodySpec {
  app: App;
  dashboard: LibraryDashboard;
  collections: LibraryCollection[];
  newId: () => string;
  /** Persist, and repaint any open Library. Called after every change made in here. */
  save: () => void;
  /** The row above says how many widgets there are; adding or deleting one makes it say something else. */
  onCountChange?: () => void;
  /** Renaming here has to reach the row's own name, which is the copy anyone reads. */
  onRename?: (name: string) => void;
  log?: (msg: string) => void;
}

/**
 * How long a rename waits before it reaches the vault.
 *
 * Long enough to cover the gap between keystrokes at speed, short enough that a reader who types a name and looks
 * away has it saved before they have finished looking. Blur commits at once, so this is only ever the ceiling.
 */
const RENAME_SETTLE_MS = 600;

export function renderDashboardBody(parent: HTMLElement, spec: DashboardBodySpec): void {
  /**
   * Redrawn only for a change of SHAPE — a widget added, deleted, or saved with a new name. Moving one does not come
   * through here: `renderReorderList` moves the row element and leaves the page alone, because a settings page that
   * repaints takes the keyboard with it.
   */
  const repaint = (): void => rebuildKeepingFocus(parent, () => paintDashboardBody(parent, spec, repaint));
  paintDashboardBody(parent, spec, repaint);
}

function paintDashboardBody(parent: HTMLElement, spec: DashboardBodySpec, repaint: () => void): void {
  parent.empty();
  const { dashboard } = spec;
  const readOnly = dashboard.system === true;
  // Why nothing here can be changed, first — it is the answer to the question a page of frozen controls raises.
  if (readOnly) parent.createDiv({ cls: 'orbis-rules-hint', text: t('library_page.dashboard_provided_note') });

  const nameRow = new Setting(parent).setName(t('library_page.dashboard_name'));
  nameRow.settingEl.addClass('orbis-setting-stacked');
  nameRow.addText((txt) => {
    txt.inputEl.addClass('orbis-input-full');
    txt.inputEl.dataset.orbisFocus = `name:${dashboard.id}`;
    txt.setValue(dashboard.name);
    if (readOnly) {
      // Shown and disabled rather than replaced by text: the name is part of what someone opens this to read, and
      // the same row in the same place is what makes the provided dashboard a worked example.
      txt.inputEl.disabled = true;
      return;
    }
    /**
     * **The row's name follows every keystroke; the FILE waits until the typing stops.**
     *
     * A dashboard is published to the vault when it changes, and a save per character is a version per character:
     * every one of them a file, and every one of them stamped with a new counter for other devices to compare. The
     * publisher debounces too — see `scanSoon` — but the settings file is written per save regardless, and renaming
     * simply does not need a write per keystroke.
     */
    let pending = 0;
    const commit = (): void => {
      pending = 0;
      spec.save();
    };
    txt.onChange((v) => {
      // An empty name is refused by keeping the last one rather than by a message: there is nothing to block, and a
      // dashboard with no name is unfindable in its own list.
      const next = v.trim() ? v : dashboard.name;
      // **Nothing changed, nothing saved.** Clearing the box to type a new name keeps the old one by the line above,
      // so without this it would schedule a write of exactly what is already there — a file write, a vault read and
      // a clash check, all to say the same thing twice.
      if (next === dashboard.name) return;
      dashboard.name = next;
      // In memory and on the row at once: what a reader sees has no reason to wait for a file.
      spec.onRename?.(dashboard.name);
      parent.win.clearTimeout(pending);
      pending = parent.win.setTimeout(commit, RENAME_SETTLE_MS);
    });
    // Leaving the field is a full stop, so the write does not wait out the timer.
    txt.inputEl.addEventListener('blur', () => {
      if (!pending) return;
      parent.win.clearTimeout(pending);
      commit();
    });
  });

  /**
   * The editor, opened from a page — which is the whole point of this file's shape. `openOnce` at every entry, because
   * two copies of one editor open at once means the stale one saves over the change.
   */
  const openWidget = (widget: DashboardWidget | null): void => {
    spec.log?.(`open widget editor ${widget ? widget.id : 'new'} on ${dashboard.id}`);
    /** Both saves and the delete land here: change the array, persist, and redraw once the dialog has gone. */
    const after = (): void => {
      spec.save();
      spec.onCountChange?.();
      // **After the editor has closed, not during its save.** Obsidian restores focus to the pencil this opened
      // from, and it does that after `onClose` — so a list that rebuilt itself first would leave the restore nothing
      // to aim at and the keyboard outside the dialogs entirely. See docs/design/dialog-system.md.
      parent.win.setTimeout(repaint, 0);
    };
    new WidgetModal(
      spec.app,
      widget,
      // Both species: the picker groups them and the kinds, views and fields follow whichever is chosen.
      spec.collections,
      (values) => {
        // Unreachable from a provided dashboard, whose editor has no Save. Guarded anyway, because "the dialog does
        // not offer it" is a property of the dialog and this is where the write happens.
        if (readOnly) return;
        const at = widget ? dashboard.widgets.indexOf(widget) : -1;
        // By identity, never by a render-time index: this list reorders without repainting, so an index captured
        // when the row was drawn names a different widget from the first move onwards.
        if (widget && at >= 0) dashboard.widgets[at] = { ...widget, ...values };
        else dashboard.widgets.push({ id: spec.newId(), ...values });
        after();
      }
    ).open();
  };

  /**
   * Delete one widget, from its row.
   *
   * **By identity, never by a render-time index** — the same rule the save above obeys: this list reorders without
   * repainting, so an index captured when the row was drawn names a different widget from the first move onwards.
   *
   * Asked before doing, and by name: the row's trash is one press, and a widget is a collection, a kind, a view and
   * a set of fields somebody assembled.
   */
  const removeWidget = (widget: DashboardWidget): void =>
    confirmThen(
      spec.app,
      {
        title: t('library_page.delete_widget_title'),
        message: t('library_page.delete_widget_confirm', {
          name: widgetHeading(widget, spec.collections),
        }),
        confirmText: t('action.delete'),
      },
      () => {
        const at = dashboard.widgets.indexOf(widget);
        if (at >= 0) dashboard.widgets.splice(at, 1);
        spec.save();
        spec.onCountChange?.();
        parent.win.setTimeout(repaint, 0);
      }
    );

  renderReorderList(parent, {
    heading: t('library_page.widgets'),
    emptyState: t('library_page.dashboard_no_widgets'),
    // Nothing on a provided dashboard can be added, removed or moved: its widgets are this code's, rebuilt each load.
    add: readOnly ? undefined : { label: t('library_page.add_widget'), run: () => openOnce(() => openWidget(null)) },
    rows: dashboard.widgets.map((widget): ReorderRow => {
      const open = () => openWidget(widget);
      return {
        key: widget.id,
        name: widgetHeading(widget, spec.collections),
        desc: describeWidget(widget),
        actions: [
          {
            // An eye rather than a pencil where the dialog it opens has no Save — the icon is what says whether
            // opening it will let you change anything.
            icon: readOnly ? 'eye' : 'pencil',
            label: t(readOnly ? 'library_page.view_widget' : 'library_page.edit_widget'),
            run: () => openOnce(open),
          },
          // A provided dashboard's widgets are this code's, and a system widget can be switched off but not removed —
          // which is the reversible version of the same wish. Both keep the slot, so the pencils and switches line up
          // down the list either way; see `ReorderAction.hidden`.
          {
            icon: 'trash',
            label: t('action.delete'),
            hidden: readOnly || widget.system === true,
            run: () => removeWidget(widget),
          },
        ],
        // A system widget can be switched off but not removed, so its switch is the only control it needs beyond the
        // pencil. Frozen on a provided dashboard: which widgets it has switched off is part of what you read here.
        toggle: {
          value: widget.enabled,
          disabled: readOnly,
          onChange: (on) => {
            widget.enabled = on;
            spec.save();
          },
        },
        openOnTap: open,
      };
    }),
    move: readOnly
      ? undefined
      : (from, to) => {
          dashboard.widgets.splice(to, 0, ...dashboard.widgets.splice(from, 1));
          spec.save();
        },
    log: spec.log,
  });
}
