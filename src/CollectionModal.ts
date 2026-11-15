// Editing a collection, and one rule inside it.
//
// `RuleModal` travels with `CollectionModal` because it IS its sub-dialog: a collection is a set of rules, and a
// row of that set opens this.

import { App, DropdownComponent, Notice, Setting, setIcon } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { TranslationKey } from './i18n/en';
import {
  type FieldValue,
  type FieldValues,
  GROUP_NONE,
  type GroupKey,
  type GroupOrder,
  KEY_FOLDER,
  KEY_SERIES,
  KEY_TAG,
  KEY_TITLE,
  labelOf,
  NONE_VALUE,
  type SortKey,
  type SortSpec,
} from './library/arrange';
import { candidatesOfSpecies, distinctValues, keysOfSpecies, valueCounts } from './library/candidates';
import {
  DATE_OPERATORS,
  matchesCollection,
  matchesRule,
  NUMBER_OPERATORS,
  operatorsFor,
  operatorTakesValue,
  ruleValueKind,
} from './library/collection';
import type { TimeFrame } from './library/dates';
import { type FieldShape, fieldShapeOf, type OrderWords, orderWords } from './library/field-order';
import { fieldForKey, fieldsOfSpecies, fieldValuesFor, libraryFields } from './library/fields';
import { NAMED_KEYS } from './library/keys';
import { valueUsedText } from './library/value-count';
import { fieldOrderRows, type HeldValues, hasOwnOrder, orderSource, valueRows } from './library/value-rows';
import { OrbisModal } from './OrbisModal';
import { reorderControls } from './reorder-controls';
import {
  type CollectionRule,
  type CollectionRuleSet,
  type LibraryCollection,
  type NoteSpecies,
  RULE_FIELD_FOLDER,
  RULE_FIELD_TAG,
  type RuleOperator,
  type RulePeriod,
} from './settings';
import { openOnRowTap } from './settings-row-tap';
import { LIBRARY_SVG } from './system-glyphs';
import {
  createCollapsibleNote,
  folderOptionsWith,
  iconButton,
  keyActivates,
  opensOnFocus,
  pinModalAboveKeyboard,
  rebuildKeepingFocus,
  renderTabRow,
} from './ui-utils';
import { VALUE_PICKER_CAP, ValueModal } from './ValueModal';

/** The time frames a date field can be cut into, coarse to fine, then the two that drop part of the date, then
 *  the bands measured from today. */
const TIME_FRAME_LABELS: Array<[TimeFrame, TranslationKey]> = [
  ['year', 'library_page.time_frame_year'],
  ['quarter', 'library_page.time_frame_quarter'],
  ['month', 'library_page.time_frame_month'],
  ['week', 'library_page.time_frame_week'],
  ['day', 'library_page.time_frame_day'],
  ['month-of-year', 'library_page.time_frame_month_of_year'],
  ['decade', 'library_page.time_frame_decade'],
  ['aging', 'library_page.time_frame_aging'],
];

/** The words each operator is shown as. Kept beside the dialogs that render them, not in the pure matcher. */
const OPERATOR_LABELS: Record<RuleOperator, TranslationKey> = {
  under: 'library_page.op_under',
  'directly-in': 'library_page.op_directly_in',
  is: 'library_page.op_is',
  'is-not': 'library_page.op_is_not',
  contains: 'library_page.op_contains',
  exists: 'library_page.op_exists',
  'not-exists': 'library_page.op_not_exists',
  'in-last-days': 'library_page.op_in_last_days',
  'older-than-days': 'library_page.op_older_than_days',
  'in-period': 'library_page.op_in_period',
  before: 'library_page.op_before',
  after: 'library_page.op_after',
  'on-date-annually': 'library_page.op_on_date_annually',
  'greater-than': 'library_page.op_greater_than',
  'at-least': 'library_page.op_at_least',
  'less-than': 'library_page.op_less_than',
  'at-most': 'library_page.op_at_most',
};

/** The named periods, in the order the dropdown offers them: the current stretch, then the one before it. */
const PERIOD_LABELS: Array<[RulePeriod, TranslationKey]> = [
  ['this-week', 'library_page.period_this_week'],
  ['last-week', 'library_page.period_last_week'],
  ['this-month', 'library_page.period_this_month'],
  ['last-month', 'library_page.period_last_month'],
  ['this-quarter', 'library_page.period_this_quarter'],
  ['last-quarter', 'library_page.period_last_quarter'],
  ['this-year', 'library_page.period_this_year'],
  ['last-year', 'library_page.period_last_year'],
];

/** A rule as a sentence: `Folder is under Library`, `source is calibre`, `isbn has a value`. */
function describeRule(rule: CollectionRule): string {
  const field =
    rule.field === RULE_FIELD_FOLDER
      ? t('library_page.field_folder')
      : rule.field === RULE_FIELD_TAG
        ? t('library_page.field_tag')
        : rule.field;
  const op = t(OPERATOR_LABELS[rule.op]);
  const kind = ruleValueKind(rule.op);
  if (kind === 'none') return `${field} ${op}`;
  // The value reads as English rather than as what is stored: "in this month", not "in this-month". A number of
  // days carries its unit for the same reason — "in the last 30" is a sentence missing a word.
  if (kind === 'period') {
    const named = PERIOD_LABELS.find(([period]) => period === rule.value);
    return `${field} ${op} ${named ? t(named[1]) : rule.value}`;
  }
  if (kind === 'days') {
    // "is more than 365 days AGO" — the threshold reads backwards without it, and "is in the last 30 days" would
    // read wrongly with it.
    const days = rule.op === 'older-than-days' ? 'library_page.rule_days_ago' : 'library_page.rule_days';
    return `${field} ${op} ${t(days, { n: rule.value })}`;
  }
  return `${field} ${op} ${rule.value}`;
}

/**
 * The keys a collection can filter, group or sort by — in three groups, not one alphabetical run.
 *
 * **A flat list of every frontmatter key in the vault is unusable.** In a real vault it is eighty entries deep and
 * mixes three unrelated things: the fields the library reads, the keys a reader's own notes happen to carry, and
 * the machinery of other features (`cfi_sort`, `mark_badge`, `chapter_index`) that nothing here should be filtered
 * by. Sorted together, `authors` sits between `author_count` and `book`, which is where it is hardest to find.
 *
 * So: what the library reads, under its own headings and in schema order; then what a note itself has, which are
 * facts about the file rather than about the title; then everything else the vault holds, alphabetically.
 *
 * **Aliases are folded away.** A key the reader mapped onto a library field — `logos_link` onto `source_url` —
 * already answers as that field, so offering it separately offers two doors to one room and invites a rule that
 * reads only half a vault.
 */
function addFieldOptions(
  dd: DropdownComponent,
  vaultKeys: readonly string[],
  /**
   * Which species' schema heads the list — a record's own fields for a record collection, a title's for a title one.
   *
   * The keys already come from the right notes; this is the other half of the same question. Offering `authors` and
   * `series` above a record's keys would let someone build a condition on a field a reading record has never had, under
   * a heading claiming the library reads it.
   */
  species: NoteSpecies,
  opts: { extras?: Array<{ key: string; label: string }>; seriesLabel?: string } = {}
): void {
  const fields = libraryFields();
  const group = (label: string): HTMLElement => dd.selectEl.createEl('optgroup', { attr: { label } });

  const schema = fieldsOfSpecies(species);
  const ours = group(t('library_page.properties_library'));
  for (const key of schema) {
    // **The key, as the note writes it** — what Obsidian's Properties and Bases show, what the Fields page lists, and
    // what a condition's row says. A friendly name gave one field three: `publication_date` in the note,
    // "Published" here, and a Column heading on top — and a rule has to be written against the one in the note.
    // Words are kept for what is not a field of the note (Folder, Tag, Last opened), which has no key to show.
    const label = key === KEY_SERIES && opts.seriesLabel ? opts.seriesLabel : key;
    ours.createEl('option', { value: key, text: label });
  }

  if (opts.extras?.length) {
    const about = group(t('library_page.properties_note'));
    for (const extra of opts.extras) about.createEl('option', { value: extra.key, text: extra.label });
  }

  // Whatever else the vault holds: the reader's own fields, another tool's leftovers, another feature's
  // plumbing. Named by their key, because that is all anyone knows about them.
  const mine = new Set<string>(schema);
  const rest = vaultKeys.filter((key) => !mine.has(key) && fieldForKey(fields, key) === key);
  if (rest.length === 0) return;
  const other = group(t('library_page.properties_other'));
  for (const key of rest) other.createEl('option', { value: key, text: key });
}

/**
 * Edit one rule.
 *
 * **A dialog rather than three controls in a row**, and the reason is the phone: a rule row inline would mean a text
 * field somewhere in the middle of a dialog that grows with every rule, so the keyboard would cover whatever you were
 * typing into. `pinModalAboveKeyboard` fixes exactly one shape — a small dialog whose field is near its top — and
 * this is that shape. It is also the shape the rest of these settings already use: a list, a pencil, and an
 * editor.
 *
 * The value control is a **picker when the field has few distinct values** across the vault (`source` has two,
 * `type` a few dozen) and a text box when it does not. Most rules therefore never summon a keyboard at all, and
 * the ones that do are the ones where typing is genuinely the answer.
 */
class RuleModal extends OrbisModal {
  private field: string;
  private op: RuleOperator;
  private value: string;
  private unpin: () => void = () => {};
  private bodyEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private countTimer = 0;

  constructor(
    app: App,
    private readonly existing: CollectionRule | null,
    private readonly fieldKeys: string[],
    /** Which species the collection gathers, so the value pickers and the live count ask the same notes it will. */
    private readonly species: NoteSpecies,
    private readonly onConfirm: (rule: CollectionRule) => void
  ) {
    super(app, { compact: true, icon: LIBRARY_SVG });
    this.field = existing?.field ?? RULE_FIELD_FOLDER;
    this.op = existing?.op ?? 'under';
    this.value = existing?.value ?? '';
  }

  protected dialogTitle(): string {
    return this.existing ? t('library_page.edit_rule') : t('library_page.new_rule');
  }

  protected onDialogClose(): void {
    this.unpin();
    window.clearTimeout(this.countTimer);
  }

  protected renderDialog() {
    const { contentEl } = this;
    this.modalEl.addClass('orbis-form-dialog');
    this.unpin = pinModalAboveKeyboard(this.modalEl);
    this.bodyEl = contentEl.createDiv();
    this.renderBody();
    this.countEl = contentEl.createDiv({ cls: 'orbis-collection-match-count' });
    this.recount();

    // In the footer rather than at the end of the body: a dialog whose fields can grow otherwise puts its own Save out
    // of reach at Obsidian's default window size.
    // **No Delete here** — it is the row's trash, like every other list in settings. See `renderRule`.
    //
    // `actionRow`, not `new Setting(...).addButton()`: Obsidian's setting row stretches each button across the dialog
    // on a phone, so this pair would look nothing like the compact right-aligned Cancel/Save every other dialog in the
    // plugin ends with — including the collection editor this one opens from, directly behind it.
    const actions = actionRow(this.footer());
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(actions, {
      label: t('action.save'),
      cta: true,
      onClick: () => {
        this.onConfirm({
          field: this.field,
          op: this.op,
          value: operatorTakesValue(this.op) ? this.value.trim() : '',
        });
        this.close();
      },
    });
  }

  /** What shape this rule's field holds — see `fieldShapeOf`. */
  private fieldShape(): FieldShape {
    return fieldShapeOf(this.app, this.species, this.field);
  }

  /** Redrawn whole when the field or operator changes, because both decide what the value control even is. */
  private renderBody(): void {
    const parent = this.bodyEl;
    if (!parent) return;
    parent.empty();

    const fieldRow = new Setting(parent).setName(t('library_page.rule_field'));
    fieldRow.settingEl.addClass('orbis-setting-stacked');
    fieldRow.addDropdown((dd) => {
      addFieldOptions(dd, this.fieldKeys, this.species, {
        extras: [
          { key: RULE_FIELD_FOLDER, label: t('library_page.field_folder') },
          { key: RULE_FIELD_TAG, label: t('library_page.field_tag') },
        ],
      });
      // A field the vault no longer contains still belongs in its own dropdown, or opening this rule would
      // silently rewrite it to whatever happens to be first.
      if (
        this.field &&
        !this.fieldKeys.includes(this.field) &&
        this.field !== RULE_FIELD_FOLDER &&
        this.field !== RULE_FIELD_TAG
      ) {
        dd.addOption(this.field, this.field);
      }
      dd.setValue(this.field).onChange((v) => {
        this.field = v;
        // Keep the operator when it still applies, so correcting the field does not quietly reset the rest.
        const allowed = operatorsFor(this.field, this.fieldShape());
        if (!allowed.includes(this.op)) this.op = allowed[0];
        this.value = '';
        this.renderBody();
        this.recount();
      });
    });

    const opRow = new Setting(parent).setName(t('library_page.rule_operator'));
    opRow.settingEl.addClass('orbis-setting-stacked');
    opRow.addDropdown((dd) => {
      // The date operators only where the field holds dates, asked of the records as the Time frame row asks it —
      // and under a heading of their own, because "is in" beside "contains" reads as a list of unrelated verbs
      // until you notice half of them are about time.
      const shape = this.fieldShape();
      const offered = operatorsFor(this.field, shape);
      const special = offered.filter((op) => DATE_OPERATORS.includes(op) || NUMBER_OPERATORS.includes(op));
      const general = offered.filter((op) => !special.includes(op));
      if (special.length === 0) {
        for (const op of general) dd.addOption(op, t(OPERATOR_LABELS[op]));
      } else {
        const group = (label: string): HTMLElement => dd.selectEl.createEl('optgroup', { attr: { label } });
        const any = group(t('library_page.ops_general'));
        for (const op of general) any.createEl('option', { value: op, text: t(OPERATOR_LABELS[op]) });
        const kind = group(t(shape === 'dates' ? 'library_page.ops_dates' : 'library_page.ops_numbers'));
        for (const op of special) kind.createEl('option', { value: op, text: t(OPERATOR_LABELS[op]) });
      }
      dd.setValue(this.op).onChange((v) => {
        this.op = v as RuleOperator;
        this.renderBody(); // the value control appears, disappears, or changes shape with the operator
        this.recount();
      });
    });

    if (!operatorTakesValue(this.op)) return;

    const valueRow = new Setting(parent).setName(t('library_page.rule_value'));
    valueRow.settingEl.addClass('orbis-setting-stacked');
    if (this.field === RULE_FIELD_FOLDER) {
      valueRow.addDropdown((dd) => {
        for (const [path, label] of Object.entries(folderOptionsWith(this.app, this.value))) {
          dd.addOption(path === '/' ? '' : path, label);
        }
        dd.setValue(this.value).onChange((v) => {
          this.value = v;
          this.recount();
        });
      });
      return;
    }

    // The three shapes a date rule needs. A number of days, a named period and a fixed date are three different
    // questions, and a text box would make each of them a spelling test with one right answer.
    const kind = ruleValueKind(this.op);
    if (kind === 'number') {
      valueRow.addText((txt) => {
        txt.inputEl.type = 'number';
        txt.setValue(this.value).onChange((v) => {
          this.value = v.trim();
          this.recount();
        });
      });
      return;
    }
    if (kind === 'days') {
      valueRow.addText((txt) => {
        txt.inputEl.type = 'number';
        txt.inputEl.min = '0';
        txt.setPlaceholder('30');
        txt.setValue(this.value).onChange((v) => {
          this.value = v.trim();
          this.recount();
        });
      });
      return;
    }
    if (kind === 'period') {
      valueRow.addDropdown((dd) => {
        for (const [period, label] of PERIOD_LABELS) dd.addOption(period, t(label));
        // A rule whose period is not one of these — a hand-edited one — keeps its own value rather than being silently
        // rewritten to whatever is first.
        if (this.value && !PERIOD_LABELS.some(([period]) => period === this.value))
          dd.addOption(this.value, this.value);
        dd.setValue(this.value || PERIOD_LABELS[0][0]).onChange((v) => {
          this.value = v;
          this.recount();
        });
        // A dropdown with nothing chosen yet still has a value on screen; storing it means Save writes what the
        // reader is looking at rather than an empty rule.
        this.value = this.value || PERIOD_LABELS[0][0];
      });
      return;
    }
    if (kind === 'date') {
      valueRow.addText((txt) => {
        txt.inputEl.type = 'date';
        txt.setValue(this.value).onChange((v) => {
          this.value = v.trim();
          this.recount();
        });
      });
      return;
    }

    // `contains` is a fragment of a value, so a list of whole values cannot offer it — the picker is only right
    // when the rule is asking for one of the values that exist.
    const pickable =
      this.op === 'is' || this.op === 'is-not'
        ? distinctValues(candidatesOfSpecies(this.app, this.species), this.field, VALUE_PICKER_CAP)
        : [];
    if (pickable.length > 0) {
      valueRow.addDropdown((dd) => {
        dd.addOption('', t('library_page.rule_pick_value'));
        for (const value of pickable) dd.addOption(value, value);
        if (this.value && !pickable.includes(this.value)) dd.addOption(this.value, this.value);
        dd.setValue(this.value).onChange((v) => {
          this.value = v;
          this.recount();
        });
      });
      return;
    }

    valueRow.addText((txt) => {
      txt.inputEl.addClass('orbis-input-full');
      txt.setValue(this.value).onChange((v) => {
        this.value = v;
        this.scheduleRecount();
      });
      window.setTimeout(() => txt.inputEl.focus(), 50);
    });
  }

  private scheduleRecount(): void {
    window.clearTimeout(this.countTimer);
    this.countTimer = window.setTimeout(() => this.recount(), 200);
  }

  /** What this rule alone would gather. */
  private recount(): void {
    if (!this.countEl) return;
    const rule: CollectionRule = { field: this.field, op: this.op, value: this.value };
    const count = candidatesOfSpecies(this.app, this.species).filter((note) => matchesRule(rule, note)).length;
    // In the units this collection gathers — see the collection editor's own count.
    const records = this.species === 'reading_record';
    this.countEl.setText(
      count === 0
        ? t('library_page.rule_matches_none')
        : count === 1
          ? t(records ? 'library_page.rule_matches_record_one' : 'library_page.rule_matches_one')
          : t(records ? 'library_page.rule_matches_records' : 'library_page.rule_matches', { count: String(count) })
    );
  }
}

export class CollectionModal extends OrbisModal {
  private name: string;
  private ruleSets: CollectionRuleSet[];
  private groupBy: GroupKey;
  private groupOrder: GroupOrder;
  private groupBucket: TimeFrame | undefined;
  private fieldValues: FieldValues;
  private valuesEl: HTMLElement | null = null;
  /** Group order's dropdown, so dragging a value can rename its first two options without redrawing the tab. */
  private orderDd: DropdownComponent | null = null;
  private bodyEl: HTMLElement | null = null;
  private tab: 'filters' | 'arrangement' = 'filters';
  private readonly valueDrag: { from: number | null } = { from: null };
  private sort: SortSpec[];
  private rulesEl: HTMLElement | null = null;
  private sortEl: HTMLElement | null = null;
  /** Drag state shared by the sort levels, as `wireListDrag` expects. */
  private readonly sortDrag: { from: number | null } = { from: null };
  private matchCountEl: HTMLElement | null = null;
  private countTimer = 0;
  /** One entry per rule row, so counts can be refreshed without rebuilding the row the cursor is in. */
  private ruleCounts: Array<{ rule: CollectionRule; el: HTMLElement }> = [];
  /** Frontmatter keys in the vault, gathered once — the dialog asks for them on every rule row. */
  private readonly fieldKeys: string[];

  constructor(
    app: App,
    private readonly collection: LibraryCollection | null,
    /**
     * Which species this collection gathers — fixed by the list it was added from, and read-only here.
     *
     * The dialog needs it for the pickers rather than for a control: the conditions offer a record's keys for a
     * record collection and a title's for a title one, and the counts count against that species' notes.
     */
    private readonly species: NoteSpecies,
    private readonly onConfirm: (values: Omit<LibraryCollection, 'id' | 'enabled'>) => void
  ) {
    // Full screen rather than pinned: this dialog grows a row per rule, and capping its height to clear a
    // keyboard also cuts off Save. The only field you type into is Name, at the top, where a keyboard was never
    // going to reach it — so the height is the problem to solve, not the keyboard.
    // Typed values behind a Save button: a click at the edge of the dialog should not discard them.
    super(app, { compact: true, fullScreenOnMobile: true, dismissOnOutsideClick: false, icon: LIBRARY_SVG });
    this.name = collection?.name ?? '';
    this.groupBy = collection?.groupBy ?? GROUP_NONE;
    this.groupOrder = collection?.groupOrder ?? 'value';
    this.groupBucket = collection?.groupBucket;
    this.fieldValues = { ...(collection?.fieldValues ?? {}) };
    // At least one level, always: a collection with no ordering is a collection whose order is whatever the vault
    // listed files in, which looks like a bug every time.
    const saved = (collection?.sort ?? []).filter((s) => s.key);
    this.sort = saved.length > 0 ? saved.map((s) => ({ ...s })) : [{ key: this.defaultSortKey() }];
    // Deep-copied so Cancel means cancel: the rules are edited in place by every control below, and handing the
    // live objects over would apply each keystroke to the saved collection whether or not the dialog is confirmed.
    this.ruleSets = (collection?.ruleSets ?? []).map((set) => ({
      match: set.match,
      rules: set.rules.map((r) => ({ ...r })),
    }));
    if (this.ruleSets.length === 0) this.ruleSets = [{ match: 'all', rules: [] }];
    // **The title notes' keys, not the vault's.** A collection's rules run over records and nothing else, so a
    // key that only a reading record or a daily note carries is a rule that can never match.
    this.fieldKeys = keysOfSpecies(app, species);
  }

  /**
   * Named for the species it gathers, not just "collection".
   *
   * Two lists mean two kinds of thing, and the dialog is the same dialog either way — so the title is the only place
   * that says which one you are building. Someone who tapped Add on the wrong list finds out here rather than after
   * saving a collection of conditions that can never match.
   */
  protected dialogTitle(): string {
    if (this.species === 'reading_record') {
      return this.collection ? t('library_page.edit_record_collection') : t('library_page.new_record_collection');
    }
    return this.collection ? t('library_page.edit_title_collection') : t('library_page.new_title_collection');
  }

  protected onDialogClose(): void {
    window.clearTimeout(this.countTimer);
  }

  protected renderDialog() {
    const { contentEl } = this;
    this.modalEl.addClass('orbis-form-dialog');
    // **Name and the count sit outside the tabs, and everything else inside.** The name is the collection's
    // identity rather than one of its settings — a filename above a document, not a page of it — and the count is
    // the answer to "did I get this right", which changes when you edit a filter OR a grouping. On a tab it would
    // disappear at the moment it became worth reading.
    const nameRow = new Setting(contentEl).setName(t('library_page.collection_name'));
    nameRow.settingEl.addClass('orbis-setting-stacked');
    nameRow.addText((txt) => {
      txt.inputEl.addClass('orbis-input-full');
      txt.setValue(this.name).onChange((v) => (this.name = v));
      window.setTimeout(() => txt.inputEl.focus(), 50);
    });

    // Two tabs, not four. Group by is one dropdown, and a tab holding one control is a tab you land on and leave.
    // Grouping and sorting are one subject anyway: how this collection is arranged, sharing the value list that decides
    // both.
    //
    // Named for the two things in it rather than for the category they share. "Arrangement" is one word and fits
    // anywhere, and means nothing until you have opened it once; the long label is legible before it is clicked,
    // and two tabs leave room for it even on a phone.
    renderTabRow(
      contentEl,
      [
        { id: 'filters', label: t('library_page.tab_filters') },
        { id: 'arrangement', label: t('library_page.tab_arrangement') },
      ],
      this.tab,
      (id) => {
        this.tab = id;
        this.renderDialogBody();
      }
    );
    this.bodyEl = contentEl.createDiv();
    this.renderDialogBody();

    this.matchCountEl = contentEl.createDiv({ cls: 'orbis-collection-match-count' });
    this.recountInPlace();

    // **No Delete here** — it is the row's trash. See `collectionRow`.
    const actions = actionRow(this.footer());
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(actions, { label: t('action.save'), cta: true, onClick: () => this.save() });
  }

  /** Whichever tab is showing: the filters that gather the notes, or the arrangement that presents them. */
  private renderDialogBody(): void {
    const body = this.bodyEl;
    if (!body) return;
    body.empty();
    if (this.tab === 'filters') {
      // One line, with the rest behind a fold — the same shape the presets dialogs use. Three lines of
      // explanation above the thing being explained is read once and then scrolled past forever.
      createCollapsibleNote(body, t('library_page.rules_desc'), t('library_page.rules_desc_more'));
      this.rulesEl = body.createDiv();
      this.renderRuleSets();
      return;
    }

    // A heading with its control beneath, like Sort by below it. A labeled row and a heading would be two weights for
    // two halves of one tab, reading as one of them being a setting inside the other.
    body.createDiv({ cls: 'orbis-rules-heading', text: t('library_page.group_by') });
    const groupRow = body.createDiv({ cls: 'orbis-sort-level' });
    const groupDd = new DropdownComponent(groupRow);
    groupDd.addOption(GROUP_NONE, t('library_page.group_none'));
    this.addKeyOptions(groupDd, 'group');
    groupDd.setValue(this.groupBy).onChange((v) => {
      this.groupBy = v;
      // The whole tab, not just the values: which rows belong here depends on the field — a date field brings a
      // Time frame with it, and picking one from a collection that had no grouping has to make that row appear.
      this.renderDialogBody();
    });
    // **Only for a field that holds dates**, which is asked of the records rather than of a list of ours: a
    // reader's own `purchase_date` qualifies, and a fixed list would have missed it.
    if (this.groupBy !== GROUP_NONE && this.groupingIsDates()) {
      const frameRow = body.createDiv({ cls: 'orbis-sort-level' });
      const frameDd = new DropdownComponent(frameRow);
      frameDd.addOption('', t('library_page.time_frame_none'));
      for (const [frame, label] of TIME_FRAME_LABELS) frameDd.addOption(frame, t(label));
      frameDd.setValue(this.groupBucket ?? '').onChange((v) => {
        this.groupBucket = (v || undefined) as TimeFrame | undefined;
        // Same reason: choosing a time frame takes the value list away, and clearing it brings it back.
        this.renderDialogBody();
      });
    }

    // Beside Group by, because it is the same question continued: which groups, then in what order. Hidden when
    // there is no grouping, where it would be a control over nothing.
    if (this.groupBy !== GROUP_NONE) {
      const orderRow = body.createDiv({ cls: 'orbis-sort-level' });
      const orderDd = new DropdownComponent(orderRow);
      this.orderDd = orderDd;
      // Named for the field: "Oldest first" for years, "In the field's order" for reading status — see `orderWords`.
      // Relabelled in place as the value list below changes; see `relabelOrder`.
      const words = this.orderWordsFor(this.groupBy, this.groupBucket);
      orderDd.addOption('value', t(words.forward));
      orderDd.addOption('reverse', t(words.backward));
      orderDd.addOption('most', t('library_page.group_order_most'));
      orderDd.addOption('fewest', t('library_page.group_order_fewest'));
      orderDd.setValue(this.groupOrder).onChange((v) => {
        this.groupOrder = v as GroupOrder;
      });
    }
    this.valuesEl = body.createDiv();
    // **A bucketed field has no value list to name.** Its headings come from the calendar — "August 2026" is not
    // a value anyone can rename, and offering 29 published dates to reorder is a list that does nothing.
    if (!this.groupBucket) this.renderFieldValues();
    // A heading with its levels beneath, like the filters: an ordered list of levels is not one setting, and a
    // label with a control beside it says it is.
    body.createDiv({ cls: 'orbis-rules-heading', text: t('library_page.sort_by') });
    this.sortEl = body.createDiv();
    this.renderSortLevels();
  }

  /**
   * The rule sets, redrawn whole whenever their shape changes.
   *
   * Adding or removing a rule changes what every row below it is indexed by, so patching the DOM in place would
   * mean keeping indices in sync by hand — the classic source of "deleted the wrong row". Redrawing is cheap
   * here: a collection is a handful of rules, not a list.
   */
  private renderRuleSets(): void {
    const parent = this.rulesEl;
    if (!parent) return;
    // Through `rebuildKeepingFocus`, so the pencil or the add button that caused this is where the keyboard lands —
    // the rows below carry keys for it.
    rebuildKeepingFocus(parent, () => this.paintRuleSets(parent));
  }

  private paintRuleSets(parent: HTMLElement): void {
    parent.empty();
    this.ruleCounts = [];
    this.ruleSets.forEach((set, setIndex) => {
      // Sets are joined with OR, and the joiner is drawn BETWEEN them rather than labeled on each, so the
      // structure reads as one sentence instead of as a list of headings.
      if (setIndex > 0) parent.createDiv({ cls: 'orbis-rule-joiner', text: t('library_page.or') });
      const block = parent.createDiv({ cls: 'orbis-rule-set' });
      const head = block.createDiv({ cls: 'orbis-rule-set-head' });
      const matchSel = head.createEl('select', { cls: 'dropdown orbis-rule-match' });
      matchSel.createEl('option', { value: 'all', text: t('library_page.match_all') });
      matchSel.createEl('option', { value: 'any', text: t('library_page.match_any') });
      matchSel.value = set.match;
      matchSel.addEventListener('change', () => {
        set.match = matchSel.value === 'any' ? 'any' : 'all';
        this.scheduleCount();
      });
      if (this.ruleSets.length > 1) {
        const remove = head.createEl('button', { cls: 'clickable-icon orbis-rule-remove' });
        setIcon(remove, 'trash');
        remove.setAttribute('aria-label', t('library_page.remove_set'));
        remove.addEventListener('click', () => {
          this.ruleSets.splice(setIndex, 1);
          this.renderRuleSets();
        });
      }
      for (const [ruleIndex, rule] of set.rules.entries()) this.renderRule(block, set, rule, ruleIndex);
      if (set.rules.length === 0) block.createDiv({ cls: 'orbis-rules-hint', text: t('library_page.rule_no_rules') });
      const addRule = block.createEl('button', { cls: 'orbis-rule-add', text: t('library_page.add_rule') });
      // Keyed too: adding a condition redraws this block, and the button pressed to do it is where the keyboard
      // belongs — ready for the next one.
      addRule.dataset.orbisFocus = `add-rule:${this.ruleSets.indexOf(set)}`;
      addRule.addEventListener('click', () => this.openRuleEditor(set, null, -1));
    });
    const addSet = parent.createEl('button', { cls: 'orbis-rule-add', text: t('library_page.add_set') });
    addSet.addEventListener('click', () => {
      this.ruleSets.push({ match: 'all', rules: [] });
      this.renderRuleSets();
    });
    // Counts are filled straight after a redraw rather than waiting for the debounce, so a row never appears
    // blank. Guarded because the first render happens before the total exists.
    if (this.matchCountEl) this.recountInPlace();
  }

  /**
   * One rule, as a sentence you can read plus a pencil to change it.
   *
   * Read-only on purpose. Three controls inline would make the row a puzzle to parse and, on a phone, put a text field
   * in the middle of a dialog that grows with every rule — so the keyboard would cover whatever was being typed. The
   * editor is a dialog of its own, which is both the shape `pinModalAboveKeyboard` handles and the shape the rest of
   * these settings already use.
   */
  private renderRule(parent: HTMLElement, set: CollectionRuleSet, rule: CollectionRule, index: number): void {
    const row = parent.createDiv({ cls: 'orbis-rule' });
    // Keyed by where the rule sits, since a condition has no id of its own: a rebuild after the editor closes puts the
    // keyboard back on the row that was being edited. Position is enough here — the editor cannot reorder anything.
    const key = `${this.ruleSets.indexOf(set)}-${index}`;
    const edit = row.createEl('button', { cls: 'orbis-rule-text', text: describeRule(rule) });
    edit.dataset.orbisFocus = `rule:${key}`;
    edit.setAttribute('aria-label', t('library_page.edit_rule'));
    edit.addEventListener('click', () => this.openRuleEditor(set, rule, index));
    // What this rule alone matches. A collection-level count says the collection is empty; only a per-rule count says
    // which rule emptied it, and one wrong value in one rule is the whole failure mode.
    this.ruleCounts.push({ rule, el: row.createDiv({ cls: 'orbis-rule-count' }) });
    const pencil = row.createEl('button', { cls: 'clickable-icon orbis-rule-remove' });
    pencil.dataset.orbisFocus = `rule-pencil:${key}`;
    setIcon(pencil, 'pencil');
    pencil.setAttribute('aria-label', t('library_page.edit_rule'));
    pencil.addEventListener('click', () => this.openRuleEditor(set, rule, index));
    /**
     * **No confirmation, and that is the rule rather than an omission**: it asks first where a press destroys
     * something the vault already holds — a source, a collection, a widget. A condition lives in this dialog's
     * working copy until Save, so Cancel is its undo and a confirm would guard something already guarded.
     *
     * Named "Delete condition" rather than "Delete": in a column of conditions, the bare verb says nothing about
     * which of the row's two buttons a screen reader has landed on.
     */
    const remove = row.createEl('button', { cls: 'clickable-icon orbis-rule-remove' });
    remove.dataset.orbisFocus = `rule-trash:${key}`;
    setIcon(remove, 'trash');
    remove.setAttribute('aria-label', t('library_page.delete_rule'));
    remove.addEventListener('click', () => {
      set.rules.splice(index, 1);
      this.renderRuleSets();
    });
  }

  /**
   * Redraw the conditions once the editor that changed them has CLOSED.
   *
   * **Not during its save.** Obsidian restores focus to whatever was focused when a dialog opened — the pencil, or the
   * "Add a condition" button — and it does that after `onClose`. Rebuilding first would destroy that element, so the
   * restore would have nothing to aim at, focus would fall to `body`, and the settings window behind would quietly pick
   * the keyboard up and navigate itself. The same fault, and the same fix, as the widget editor: see
   * `docs/design/dialog-system.md`.
   */
  private afterEditor(): void {
    this.modalEl.win.setTimeout(() => this.renderRuleSets(), 0);
  }

  /** The editor, for a rule that exists or one being added. Deleting is the row's trash, as it is everywhere else. */
  private openRuleEditor(set: CollectionRuleSet, rule: CollectionRule | null, index: number): void {
    new RuleModal(this.app, rule, this.fieldKeys, this.species, (next) => {
      if (rule) set.rules[index] = next;
      else set.rules.push(next);
      this.afterEditor();
    }).open();
  }

  private save(): void {
    const name = this.name.trim();
    if (!name) {
      new Notice(t('library_page.invalid_name'));
      return;
    }
    // Empty sets are dropped rather than saved: one is what a half-built collection looks like, and keeping it would
    // reopen the dialog with a set nobody asked for.
    const ruleSets = this.ruleSets
      .map((set) => ({ match: set.match, rules: set.rules.filter((r) => r.field) }))
      .filter((set) => set.rules.length > 0);
    // No guard on the conditions: a collection with none gathers every title, which is the only way to arrange the
    // whole library your own way — the provided All titles is rebuilt from code and cannot be edited. Requiring one
    // would drive people to write `file.folder under ""` instead, which says the same thing less clearly.
    this.onConfirm({
      name,
      ruleSets,
      groupBy: this.groupBy,
      // Stored only when it is not the default, like every other "and this is how it differs" field here.
      groupOrder: this.groupOrder === 'value' ? undefined : this.groupOrder,
      // Dropped when the field being grouped no longer holds dates, rather than kept as a setting for a field it
      // cannot apply to.
      groupBucket: this.groupingIsDates() ? this.groupBucket : undefined,
      sort: this.sort.filter((s) => s.key),
      // Kept for every field that has one, not only the field being grouped by today: changing the grouping and
      // changing it back should not lose the order someone arranged.
      fieldValues: Object.keys(this.fieldValues).length > 0 ? this.fieldValues : undefined,
    });
    this.close();
  }

  /**
   * A key the sort is not already using.
   *
   * A second level defaulting to the same field as the first is a level that decides nothing — it can only ever
   * tie — so a new one starts on something that could actually break a tie. Chosen rather than policed: picking a
   * duplicate by hand is harmless, and disabling options in every dropdown to prevent it would be a lot of
   * machinery to stop someone doing something merely pointless.
   */
  private firstUnusedSortKey(): SortKey {
    const used = new Set(this.sort.map((spec) => spec.key));
    // This species' schema first, then the derived keys, then whatever else its notes carry — the same order the
    // dropdown offers them in, so the level that appears is one someone can find in the list.
    const candidates = [...fieldsOfSpecies(this.species), ...this.namedKeys().map((n) => n.key), ...this.fieldKeys];
    return candidates.find((key) => !used.has(key)) ?? this.defaultSortKey();
  }

  /**
   * What a collection sorts by until someone says otherwise.
   *
   * A title, and for a record the book it came from — `title` is a field a reading record does not have, so a record
   * collection defaulting to it would open its editor showing a sort on nothing.
   */
  private defaultSortKey(): SortKey {
    return this.species === 'reading_record' ? 'book_title' : KEY_TITLE;
  }

  /**
   * Every key a collection can group or sort by: the named ones, then every frontmatter field in the vault.
   *
   * `series` is labeled differently in the two places, because it means something different in each: grouping by
   * it makes a heading per series, while sorting by it means READING order — the series name, then the position
   * within it. One label could only be right for one of them.
   */
  private addKeyOptions(dd: DropdownComponent, context: 'group' | 'sort'): void {
    addFieldOptions(dd, this.fieldKeys, this.species, {
      // Grouping by a series means a heading per series; sorting by it means READING order.
      seriesLabel: context === 'sort' ? t('library_page.key_series_sort') : undefined,
      extras: this.namedKeys().map((named) => ({ key: named.key, label: t(named.label) })),
    });
  }

  /**
   * The derived keys this species can be arranged by — the "About the note" group.
   *
   * A record's folder and its tags are facts about the file, so they apply to any note at all. The rest of the
   * grouping vocabulary is a title's: a first letter is a letter of a TITLE or an author, and `file.last-opened`
   * comes from a book's sidecar — a reading record has no reading position of its own to have been left at.
   */
  private namedKeys(): typeof NAMED_KEYS {
    const derived = NAMED_KEYS.filter((named) => !fieldsOfSpecies(this.species).includes(named.key));
    if (this.species !== 'reading_record') return derived;
    return derived.filter((named) => named.key === KEY_FOLDER || named.key === KEY_TAG);
  }

  /**
   * The sort, as many levels as someone wants.
   *
   * **The first level cannot be removed.** A collection with no ordering shows records in whatever order the vault
   * listed files in, which reads as a bug rather than as a choice — so there is always one level, and the rest
   * come and go.
   *
   * Direction is per level, because "author A–Z, newest first" is a real request that one flag cannot express.
   */
  /**
   * What this collection calls the values of the field it groups by, and the order it wants them in.
   *
   * **Only for a plain frontmatter field.** The named keys — author, series, rating, first letter — either have no
   * fixed set of values or already read as themselves; a table of every author in the vault would be a settings
   * page rather than a section of a dialog.
   *
   * The values come from the vault rather than from a list to fill in: what a field actually holds is knowable, and
   * typing `abandoned` from memory to name it is a chore and a spelling test. Values nobody has placed sit at the
   * end, alphabetically, and stay visible — a value that turned up this morning is not one to hide.
   */
  /**
   * Rename Group order's two direction options in place — "In the field's order" or "In this collection's order" —
   * rather than redrawing the tab, which would throw the keyboard back to its top mid-drag.
   */
  private relabelOrder(field: string, held: HeldValues): void {
    const select = this.orderDd?.selectEl;
    if (!select?.isConnected) return;
    const words = this.orderWordsFor(field, this.groupBucket, held);
    for (const option of Array.from(select.options)) {
      if (option.value === 'value') option.text = t(words.forward);
      if (option.value === 'reverse') option.text = t(words.backward);
    }
  }

  /**
   * The words a field's two directions are named with, here — see `orderWords`. Which list the order comes from is
   * `orderSource`'s answer; `held` refines it with the values the notes hold, where they have been counted.
   */
  private orderWordsFor(key: string, frame?: TimeFrame, held?: HeldValues): OrderWords {
    const listed = orderSource(this.fieldValues[key], fieldValuesFor(key) ?? [], held);
    return orderWords({ shape: fieldShapeOf(this.app, this.species, key), listed, frame });
  }

  /** Whether the grouped field holds dates — which brings a Time frame with it. See `fieldShapeOf`. */
  private groupingIsDates(): boolean {
    return this.groupBy !== GROUP_NONE && fieldShapeOf(this.app, this.species, this.groupBy) === 'dates';
  }

  private renderFieldValues(): void {
    const parent = this.valuesEl;
    if (!parent) return;
    // Through `rebuildKeepingFocus`, because the arrows in this list rebuild it: without it, one press on ↑ would send
    // the keyboard back to the top of the dialog. The arrows carry `value-up:`/`value-down:` keys, so focus follows the
    // row that moved rather than the position it left.
    rebuildKeepingFocus(parent, () => this.paintFieldValues(parent));
  }

  private paintFieldValues(parent: HTMLElement): void {
    parent.empty();
    const field = this.groupBy;
    if (!field || field === GROUP_NONE || NAMED_KEYS.some((n) => n.key === field)) return;

    // Counted rather than merely listed, and read-only rows with an editor behind a pencil — the same shape the Fields
    // page uses, because it is the same list. Inline text boxes cost too much: sixty values mean sixty inputs, and on a
    // phone the one you tapped is under the keyboard.
    //
    // **Counted over what the FILTERS admit, not over the vault.** This list is the collection's own ordering and
    // naming of a field, so a value no rule here can ever match is not one of its values — and counting the whole vault
    // would put a reader's abandoned `01-reading` convention in a list of reading statuses years after the last note
    // carrying it changed, permanently, since nothing here removes a value.
    const admitted = candidatesOfSpecies(this.app, this.species).filter((note) =>
      matchesCollection({ id: 'draft', name: this.name, ruleSets: this.ruleSets, enabled: true }, note)
    );
    const counted = valueCounts(admitted, field, VALUE_PICKER_CAP);
    const seen = [...(counted?.counts.keys() ?? [])].sort((a, b) => a.localeCompare(b));
    // The field's own list is what this starts from, so a value named on the Fields page arrives already named
    // here. Touching the list makes it this collection's, which is how one dashboard can order statuses its own
    // way without renaming them for every other.
    //
    // A stored value the collection can no longer contain is dropped, UNLESS the field declares it: a status
    // with nothing in it today is still one of the statuses, and its place in the order is worth keeping. That
    // is the difference between "you have none of these" and "this was never one of yours".
    const declared = fieldValuesFor(field) ?? [];
    const stored = this.fieldValues[field] ?? declared;
    const held = { seen, none: counted?.none ?? 0 };
    // Placed first, in their order; then whatever the collection holds that nobody placed; then the none row —
    // see `valueRows`, which also drops a placed value the collection can no longer contain.
    const rows = valueRows(stored, declared, held);
    // Written back, so the pruning is not just a trick of the light: the stored list is what the summary widget
    // and the dashboards read, and leaving strays in it would mean the dialog and the dashboard disagreed.
    const kept = stored.filter((entry) => rows.some((row) => row.value === entry.value));
    if (kept.length !== stored.length) this.commitFieldValues(field, kept);
    // Every repaint of this list — a drag, an arrow, Reset order — may have moved the order between the field's and
    // this collection's, so the dropdown above says which it is now.
    this.relabelOrder(field, held);
    if (rows.length === 0) return;

    parent.createDiv({ cls: 'orbis-rules-heading', text: t('library_page.values_heading') });
    parent.createDiv({ cls: 'orbis-rules-hint', text: t('library_page.values_desc') });

    // **The records answering with nothing are a row here too**, when this collection has any — the same row the
    // Fields page offers, for the same two reasons: it can be named ("Unfiled", "No status yet") and it can be
    // placed, since unflagged books belong at the top of a shelf ordered by reading status as often as at the
    // bottom. Unnamed it falls back to the library's own word for the leftovers. Last by default: leftovers with no
    // instruction are leftovers.
    // `fromEditor` for a move the value editor asked for as it closed — see the same helper in the field editor.
    const move = (from: number, to: number, fromEditor = false) => {
      rows.splice(to, 0, ...rows.splice(from, 1));
      this.commitFieldValues(field, rows);
      if (fromEditor) this.modalEl.win.setTimeout(() => this.renderFieldValues(), 0);
      else this.renderFieldValues();
    };
    // In a box of their own: the Orbis list look, and one container for `wireListDrag` to scan, apart from the
    // heading and hint that share `parent`.
    const box = parent.createDiv({ cls: 'orbis-list-box' });
    rows.forEach((entry, index) => {
      // The row for the records that answer with nothing arrives here from the Fields page like any other value,
      // and its own name is the empty string — so it says what it is rather than rendering as a blank line.
      const row = new Setting(box).setName(entry.value === NONE_VALUE ? t('properties_page.none_value') : entry.value);
      row.settingEl.addClass('orbis-value-row');
      const used = entry.value === NONE_VALUE ? (counted?.none ?? 0) : (counted?.counts.get(entry.value) ?? 0);
      // **What the row will actually read as, whoever named it.** Saying "Shown as" only for this collection's own
      // labels would go silent the moment a reader cleared one to inherit the field's — the heading would still say
      // "Finished reading" on the dashboard while the row here said nothing about it. Where the name comes from is the
      // editor's business, behind the pencil; this line answers "what will I see".
      const shownAs = entry.label?.trim() || labelOf(declared, entry.value);
      row.setDesc(
        [
          shownAs && shownAs !== entry.value ? t('properties_page.shown_as_row', { label: shownAs }) : '',
          used > 0 ? valueUsedText(used, this.species) : t('properties_page.value_unused'),
        ]
          .filter(Boolean)
          .join(' · ')
      );
      const openEditor = () =>
        new ValueModal(this.app, {
          value: entry.value,
          label: entry.label ?? '',
          // Nothing here is respellable or removable: these values come from the notes, and this dialog only
          // decides what THIS collection calls them and in what order it shows them.
          editable: false,
          enabled: null,
          removable: false,
          // What the Fields page calls it, so the dialog can say all three things at once — and so clearing the
          // box below reads as "use that" rather than as "leave it blank".
          inherited: labelOf(declared, entry.value) === entry.value ? '' : labelOf(declared, entry.value),
          onSave: (next) => {
            entry.label = next.label;
            this.commitFieldValues(field, rows);
            // **After the editor has closed, not during its save** — Obsidian restores focus to the pencil this
            // opened from, and a list rebuilt first leaves that restore nothing to aim at. See
            // `docs/design/dialog-system.md`.
            this.modalEl.win.setTimeout(() => this.renderFieldValues(), 0);
          },
          onMove: (where) => move(index, where === 'top' ? 0 : rows.length - 1, true),
          onRemove: () => {},
        }).open();
      /**
       * A real button, keyed by the value, so a rebuild can put the keyboard back on the pencil — see `iconButton` for
       * why a button rather than `addExtraButton`'s div.
       */
      row.addButton((b) => {
        iconButton(b, 'pencil', t('properties_page.value_edit'), openEditor);
        keyActivates(b.buttonEl, openEditor);
        b.buttonEl.dataset.orbisFocus = `value-pencil:${entry.value}`;
      });
      openOnRowTap(row, openEditor);
      // Keyed by the VALUE, so the arrow follows the row it moved rather than the position it left — see
      // `rebuildKeepingFocus`, which the re-render below goes through.
      // The arrows and the handle, shared with every other reorderable list — see `reorderControls`.
      reorderControls({
        row: row.settingEl,
        into: row.controlEl,
        key: entry.value,
        index,
        count: rows.length,
        keyPrefix: 'value',
        labels: {
          up: t('library_page.value_up'),
          down: t('library_page.value_down'),
          drag: t('library_page.value_drag'),
        },
        drag: this.valueDrag,
        move,
      });
    });

    // **The way back to the field's order**, once this collection has one of its own — the Reset fields pattern: a
    // row saying what it reverts to, shown only when there is something to revert. Only the ORDER: names given here
    // stay, and a list that keeps none goes back to following the field outright.
    if (hasOwnOrder(rows, declared, held)) {
      new Setting(parent).setDesc(t('library_page.values_revert')).addButton((btn) =>
        btn.setButtonText(t('library_page.values_reset')).onClick(() => {
          const reset = fieldOrderRows(rows, declared, held);
          if (reset.some((entry) => entry.label?.trim())) this.commitFieldValues(field, reset);
          else delete this.fieldValues[field];
          this.renderFieldValues();
        })
      );
    }
  }

  /**
   * Store the order and the labels — the whole list, exactly as it now reads.
   *
   * **Never only the part someone has "decided"**, truncating at the last row with a label: dragging sets no labels, so
   * that would keep one row and the re-render would put everything else back alphabetically.
   *
   * Touch the list and the list is yours, in the order shown. The consequence is that a value appearing in the vault
   * afterwards joins at the END rather than alphabetically among the rest — which is what "placed values first,
   * unplaced after" means, and is worth saying in the hint.
   */
  private commitFieldValues(field: string, rows: FieldValue[]): void {
    const kept = rows.map((row) => ({ value: row.value, label: row.label?.trim() || undefined }));
    if (kept.length > 0) this.fieldValues[field] = kept;
    else delete this.fieldValues[field];
  }

  private renderSortLevels(): void {
    const parent = this.sortEl;
    if (!parent) return;
    // Keyed by LEVEL, and through `rebuildKeepingFocus`: pressing ↑ rebuilds this list, and without it the keyboard
    // would land back at the top of the dialog after one press. A level's identity is its position — it IS a precedence
    // — so the key is the position it moved to, which is where the reader is now standing.
    rebuildKeepingFocus(parent, () => this.paintSortLevels(parent));
  }

  private paintSortLevels(parent: HTMLElement): void {
    parent.empty();
    this.sort.forEach((spec, level) => {
      const row = parent.createDiv({ cls: 'orbis-sort-level' });
      // Obsidian's components, built straight into the row rather than into a `Setting`: a level is one line of
      // controls, and a Setting would give it a label column it has nothing to put in.
      const dd = new DropdownComponent(row);
      // Keyed like the arrows: adding a level lands here, and a rebuild (the dialog recounts as you type) must not
      // take it away again.
      dd.selectEl.dataset.orbisFocus = `sort-field:${spec.key || `level-${level}`}`;
      this.addKeyOptions(dd, 'sort');
      // A key the vault no longer has still belongs in its own dropdown, or opening this collection would silently
      // rewrite the sort to whatever happens to be first.
      if (spec.key && !NAMED_KEYS.some((n) => n.key === spec.key) && !this.fieldKeys.includes(spec.key)) {
        dd.addOption(spec.key, spec.key);
      }
      dd.setValue(spec.key).onChange((v) => {
        spec.key = v;
        // The direction is named for the field, so a new field renames it.
        paintDirection();
      });

      // **An arrow, not a toggle.** A bare switch beside a field reads as "use this field or not", while a sort field
      // is always in use and only ever has a direction. The arrow shows which way it currently runs and flips on tap.
      const direction = row.createEl('button', { cls: 'clickable-icon orbis-sort-direction' });
      const paintDirection = () => {
        setIcon(direction, spec.desc ? 'arrow-down-wide-narrow' : 'arrow-up-narrow-wide');
        const words = this.orderWordsFor(spec.key);
        direction.setAttribute(
          'aria-label',
          t('library_page.sort_direction', { order: t(spec.desc ? words.backward : words.forward) })
        );
      };
      paintDirection();
      direction.addEventListener('click', () => {
        spec.desc = !spec.desc;
        paintDirection();
      });

      // Order is precedence, so it has to be changeable. Arrows as well as the drag handle, because dragging has
      // no keyboard equivalent — the same reason the reorderable lists elsewhere in these settings keep both.
      const move = (to: number) => {
        this.sort.splice(to, 0, ...this.sort.splice(level, 1));
        this.renderSortLevels();
      };
      reorderControls({
        row,
        into: row,
        /**
         * Keyed by the FIELD, like every other list. Position might seem defensible — a sort level is a precedence —
         * but it makes the arrow stay put while the row moves out from under it, so a second press moves a different
         * field. What the reader is holding is "this field", and the keyboard should follow it.
         */
        key: spec.key || `level-${level}`,
        index: level,
        count: this.sort.length,
        keyPrefix: 'sort',
        labels: {
          up: t('library_page.sort_up'),
          down: t('library_page.sort_down'),
          drag: t('library_page.sort_drag'),
        },
        drag: this.sortDrag,
        move: (_from, to) => move(to),
      });

      if (this.sort.length > 1) {
        const remove = row.createEl('button', { cls: 'clickable-icon orbis-rule-remove' });
        setIcon(remove, 'x');
        remove.setAttribute('aria-label', t('library_page.remove_sort'));
        remove.addEventListener('click', () => {
          this.sort.splice(level, 1);
          this.renderSortLevels();
        });
      }
    });
    const add = parent.createEl('button', { cls: 'orbis-rule-add', text: t('library_page.add_sort') });
    add.addEventListener('click', () => {
      this.sort.push({ key: this.firstUnusedSortKey() });
      this.renderSortLevels();
      /**
       * **Land on the new level's field, not on Add.** A level arrives with a guessed key, and the first thing anyone
       * does is say which field they meant — so the keyboard belongs on that dropdown. Focus stays on Add otherwise,
       * which is the one control the reader has just finished with.
       */
      /**
       * A frame later, and the LAST VISIBLE select — not simply the last one.
       *
       * Obsidian's `DropdownComponent` leaves a hidden copy of its `<select>` in the row to measure its widest option,
       * so each level owns two selects and the one at the end of the list is the copy. `focus()` on a `visibility:
       * hidden` element does nothing and reports nothing.
       */
      parent.win.requestAnimationFrame(() => {
        const selects = Array.from(parent.querySelectorAll<HTMLSelectElement>('.orbis-sort-level select')).filter(
          (el) => !!el.offsetParent && el.win.getComputedStyle(el).visibility !== 'hidden'
        );
        const last = selects[selects.length - 1];
        // **Except on iOS, where focusing a select OPENS it** — pressing Add would unfold the new level's picker over
        // the settings page, which is a modal wheel nobody asked for. The reasoning above is about putting the KEYBOARD
        // on the field, and a device driven by taps has none to put. See `opensOnFocus`.
        if (last && !opensOnFocus(last)) last.focus();
      });
    });
  }

  /**
   * Recount after the current burst of typing rather than once per keystroke.
   *
   * **Counts are written into the existing rows, never by redrawing them.** Rebuilding the rules while someone is
   * typing destroys the input they are typing into: the field is replaced mid-keystroke, focus is lost, and the
   * characters that arrive before the next paint go nowhere. Structural changes — adding or removing a rule,
   * switching a field or an operator — redraw, and none of those happen from the keyboard.
   */
  private scheduleCount(): void {
    window.clearTimeout(this.countTimer);
    this.countTimer = window.setTimeout(() => this.recountInPlace(), 200);
  }

  /**
   * Every count on the dialog, from one pass over the records.
   *
   * The candidate list is built once and shared: gathering it per rule would mean walking the vault four times for a
   * three-rule collection, and the whole point of counting live is that it costs nothing noticeable.
   */
  private recountInPlace(): void {
    const candidates = candidatesOfSpecies(this.app, this.species);
    for (const { rule, el } of this.ruleCounts) {
      el.setText(rule.field ? String(candidates.filter((note) => matchesRule(rule, note)).length) : '');
    }
    if (!this.matchCountEl) return;
    const draft: LibraryCollection = {
      id: 'draft',
      name: this.name,
      ruleSets: this.ruleSets,
      enabled: true,
    };
    const count = candidates.filter((note) => matchesCollection(draft, note)).length;
    // Counted in the units the collection gathers: "Matches 29 titles" over a list of highlights is a number that
    // reconciles with nothing on screen, and the count is here precisely to be reconciled with.
    const records = this.species === 'reading_record';
    this.matchCountEl.setText(
      count === 0
        ? t('library_page.matches_none')
        : count === 1
          ? t(records ? 'library_page.matches_record_one' : 'library_page.matches_one')
          : t(records ? 'library_page.matches_records' : 'library_page.matches', { count: String(count) })
    );
  }
}
