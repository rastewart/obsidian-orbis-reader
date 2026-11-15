// Editing one field of the library's frontmatter schema, and the values it accepts.
//
// `fieldPurpose` is exported because the settings tab prints the same sentence beside each field in the list.

import { App, Notice, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { TranslationKey } from './i18n/en';
import { dedupeValues, type FieldValue, NONE_VALUE } from './library/arrange';
import { candidatesOfSpecies, type ValueCounts, valueCounts, vaultCandidates } from './library/candidates';
import { fieldHeading } from './library/display-fields';
import { BUILT_IN_FIELDS, type FieldDefinition, hasValueList, LIBRARY_FIELDS, mergeValues } from './library/fields';
import { namedKeyLabel } from './library/keys';
import { valueUsedText } from './library/value-count';
import { OrbisModal } from './OrbisModal';
import { reorderControls } from './reorder-controls';
import { type NoteSpecies } from './settings';
import { openOnRowTap } from './settings-row-tap';
import { LIBRARY_SVG } from './system-glyphs';
import { iconButton, keyActivates, rebuildKeepingFocus, renderTabRow } from './ui-utils';
import { VALUE_PICKER_CAP, ValueModal } from './ValueModal';

/**
 * What each standard field is FOR, in one line.
 *
 * A row nobody has touched says nothing about itself, which makes a list of twenty a list of twenty questions.
 * What the library does with `series_index` or `isbn` is knowable, and this is the only place it is ever asked.
 */
const FIELD_PURPOSE: Record<string, TranslationKey> = {
  title: 'properties_page.purpose_title',
  authors: 'properties_page.purpose_authors',
  series: 'properties_page.purpose_series',
  series_index: 'properties_page.purpose_series_index',
  type: 'properties_page.purpose_type',
  genre: 'properties_page.purpose_genre',
  publisher: 'properties_page.purpose_publisher',
  publication_date: 'properties_page.purpose_publication_date',
  language: 'properties_page.purpose_language',
  subjects: 'properties_page.purpose_subjects',
  tags: 'properties_page.purpose_tags',
  isbn: 'properties_page.purpose_isbn',
  rating: 'properties_page.purpose_rating',
  cover: 'properties_page.purpose_cover',
  files: 'properties_page.purpose_files',
  reading_status: 'properties_page.purpose_reading_status',
  date_read: 'properties_page.purpose_date_read',
  added: 'properties_page.purpose_added',
  source: 'properties_page.purpose_source',
  source_id: 'properties_page.purpose_source_id',
  source_url: 'properties_page.purpose_source_url',
  source_notes: 'properties_page.purpose_source_notes',
  // A reading record's own fields. `tags` is shared with the titles above: it means the same thing on both.
  kind: 'properties_page.purpose_kind',
  excerpt: 'properties_page.purpose_excerpt',
  note_text: 'properties_page.purpose_note_text',
  mark: 'properties_page.purpose_mark',
  book_title: 'properties_page.purpose_book_title',
  author: 'properties_page.purpose_author',
  chapter: 'properties_page.purpose_chapter',
  loc: 'properties_page.purpose_loc',
  created: 'properties_page.purpose_created',
  orphaned: 'properties_page.purpose_orphaned',
};

/** What this field is for, or nothing — a field someone added is theirs, and we have nothing to say about it. */
export function fieldPurpose(key: string): string {
  const purpose = FIELD_PURPOSE[key];
  return purpose ? t(purpose) : '';
}

/** Which section of the field editor is showing. */
type FieldTab = 'field' | 'values';

export class FieldModal extends OrbisModal {
  private tab: FieldTab = 'field';
  private key: string;
  private description: string;
  private label: string;
  private keys: string[];
  private values: FieldValue[];
  private disabled: string[];
  private hasValues: boolean;
  private readonly counted: ValueCounts | null;
  private bodyEl: HTMLElement | null = null;
  private readonly valueDrag: { from: number | null } = { from: null };
  private readonly keyDrag: { from: number | null } = { from: null };

  constructor(
    app: App,
    private readonly fixedKey: string | null,
    existing: FieldDefinition | null,
    /**
     * Which notes this field's values are counted over, or null for a field with no species yet.
     *
     * A field is described once and read by whichever species carries it — but the VALUES on screen have to come
     * from the notes the list you opened is about.
     */
    private readonly countedOver: NoteSpecies | null,
    private readonly vaultKeys: () => string[],
    private readonly onConfirm: (values: FieldDefinition) => void,
    private readonly onDelete?: { text: string; run: () => void }
  ) {
    // Typed values behind a Save button: a click at the edge of the dialog should not discard them.
    super(app, { compact: true, fullScreenOnMobile: true, dismissOnOutsideClick: false, icon: LIBRARY_SVG });
    this.key = existing?.key ?? fixedKey ?? '';
    this.description = existing?.description ?? '';
    this.label = existing?.label ?? '';
    // Never the field's own key: it is read first regardless, and a list showing `title` as an alias of `title`
    // is a puzzle to solve rather than a setting to change.
    this.keys = (existing?.keys ?? []).filter((key) => key !== this.key);
    this.values = (existing?.values ?? []).map((entry) => ({ ...entry }));
    this.disabled = [...(existing?.disabled ?? [])];
    this.hasValues = existing?.hasValues === true;
    // Counted once when the dialog opens: the rows are rebuilt on every keystroke that reorders them, and a
    // vault sweep per render would be a sweep per drag.
    // **Counted over the species this row belongs to**, or over the vault for a custom field, which has no species
    // until something carries it. A record's `mark` has no values at all among the title notes, so counting those
    // would show an empty list for a field every highlight carries.
    this.counted = valueCounts(
      countedOver === null ? vaultCandidates(app) : candidatesOfSpecies(app, countedOver),
      // A blank key counts nothing, which is what a field being added has: a space, since no frontmatter key is
      // one. (Not a literal NUL byte, which would work and make the whole file read as binary to grep.)
      this.key || ' ',
      VALUE_PICKER_CAP
    );
  }

  protected dialogTitle(): string {
    return this.fixedKey ? t('properties_page.edit') : t('properties_page.add');
  }

  protected renderDialog() {
    this.modalEl.addClass('orbis-form-dialog');
    // Not pinned above the keyboard — see the widget editor, which has the same problem. Full screen on mobile is
    // the answer for a dialog this size, and the tabs put every text field near the top of a short screen.
    this.bodyEl = this.contentEl.createDiv();
    this.renderBody();

    const actions = actionRow(this.footer());
    if (this.onDelete) {
      const { text, run } = this.onDelete;
      actionButton(actions, {
        label: text,
        destructive: true,
        onClick: () => {
          run();
          this.close();
        },
      });
    }
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(actions, { label: t('action.save'), cta: true, onClick: () => this.save() });
  }

  /**
   * Tabs, because on a phone this dialog is several lists at once.
   *
   * The value list of a field like `type` can run to sixty rows, and stacked under the aliases and the description
   * it would push everything above it off the top of the screen. Splitting by subject — what the field is and what
   * it is also called, then what its values read as — keeps each tab short enough to work with a keyboard up. Save
   * and Cancel stay below the tabs: they commit the field, not the tab.
   */
  private renderBody(): void {
    const parent = this.bodyEl;
    if (!parent) return;
    // Through `rebuildKeepingFocus`: this body holds the key list and the value list, both of which rebuild it when
    // their arrows move a row. Their arrows carry keys, so focus follows the row rather than the slot.
    rebuildKeepingFocus(parent, () => this.paintBody(parent));
  }

  private paintBody(parent: HTMLElement): void {
    parent.empty();

    // **Two tabs, and only when there are two.** A tab of their own for the aliases would leave a Field tab
    // holding a name and a sentence — a tab you land on with nothing to do, in front of the tab you wanted.
    // What the field IS and what it is also called are one subject; what its values read as is the other, and
    // the only one long enough to need its own screen. A field with no value list gets no strip at all.
    const showValues = hasValueList({ key: this.key, hasValues: this.hasValues }, this.key);
    if (!showValues) this.tab = 'field';
    if (showValues) {
      renderTabRow(
        parent,
        [
          { id: 'field', label: t('properties_page.tab_property') },
          { id: 'values', label: t('properties_page.tab_values') },
        ],
        this.tab,
        (id) => {
          this.tab = id;
          this.renderBody();
        }
      );
    }

    if (this.tab === 'field') this.renderFieldTab(parent);
    else this.renderValuesTab(parent);
  }

  /** What the field is: its key, what it is for, and the other keys it is written as. */
  private renderFieldTab(parent: HTMLElement): void {
    // The key is the field's identity, so it is chosen once. Offered from the vault's own frontmatter rather than
    // typed: what a field is CALLED is knowable, and spelling it from memory is a test nobody should sit.
    if (this.fixedKey) {
      // The key IS the name here, with what the library does with it underneath — a row headed "Field" over the
      // word `title` says only that this is the field called title, which the dialog you opened already said.
      // Ours only. A custom field's description is the editable row just below, and echoing it here would show a
      // stale copy of whatever they had typed a moment ago.
      new Setting(parent).setName(this.key).setDesc(fieldPurpose(this.key));
    } else {
      // **Typed, not picked.** A picker offers the keys the vault already holds, which is exactly the set a new
      // field is not in: you add `use_count` here and then go and write it into your notes. The list is still
      // offered underneath, because a field that DOES exist is one nobody should have to spell — but it fills the
      // box rather than being the only way in.
      const keyRow = new Setting(parent)
        .setName(t('properties_page.property'))
        .setDesc(t('properties_page.property_desc'));
      keyRow.settingEl.addClass('orbis-setting-stacked');
      keyRow.addText((txt) => {
        txt.inputEl.addClass('orbis-input-full');
        txt.setPlaceholder(t('properties_page.property_placeholder'));
        txt.setValue(this.key).onChange((v) => (this.key = v.trim()));
      });
      const pick = new Setting(parent);
      pick.addDropdown((dd) => {
        dd.addOption('', t('properties_page.property_pick'));
        for (const key of this.vaultKeys()) dd.addOption(key, key);
        dd.setValue('').onChange((v) => {
          if (!v) return;
          this.key = v;
          this.renderBody();
        });
      });
    }

    // **A caption for a column, offered for every field.** Unlike the description it applies to standard fields
    // too: `publication_date` is a fine key and a poor column heading. The placeholder shows what a table will
    // say with nothing typed, so the box reads as a disagreement with that rather than as a blank to fill.
    const labelRow = new Setting(parent).setName(t('properties_page.label')).setDesc(t('properties_page.label_desc'));
    labelRow.settingEl.addClass('orbis-setting-stacked');
    labelRow.addText((txt) => {
      txt.inputEl.addClass('orbis-input-full');
      const named = namedKeyLabel(this.key);
      txt.setPlaceholder(fieldHeading(this.key, '', named ? t(named) : ''));
      txt.setValue(this.label).onChange((v) => (this.label = v));
    });

    // Only for a field of the reader's own: a standard field already has a description, and one written over the
    // top of it would leave two answers to "what is this for" with no way to tell which was ours.
    if (!LIBRARY_FIELDS.includes(this.key)) {
      const descRow = new Setting(parent)
        .setName(t('properties_page.description'))
        .setDesc(t('properties_page.description_desc'));
      descRow.settingEl.addClass('orbis-setting-stacked');
      descRow.addText((txt) => {
        txt.inputEl.addClass('orbis-input-full');
        txt.setPlaceholder(t('properties_page.description_placeholder'));
        txt.setValue(this.description).onChange((v) => (this.description = v));
      });

      // A field of the reader's own says for itself whether its values are a vocabulary — only they know whether
      // `shelf` names half a dozen shelves or holds a serial number.
      const listRow = new Setting(parent)
        .setName(t('properties_page.has_values'))
        .setDesc(t('properties_page.has_values_desc'));
      listRow.addToggle((tog) =>
        tog.setValue(this.hasValues).onChange((on) => {
          this.hasValues = on;
          this.renderBody();
        })
      );
    }

    this.renderAliases(parent);
  }

  /** The other keys this field is written as, in the order they are tried. */
  private renderAliases(parent: HTMLElement): void {
    parent.createDiv({ cls: 'orbis-rules-heading', text: t('properties_page.aliases') });
    parent.createDiv({ cls: 'orbis-rules-hint', text: t('properties_page.aliases_desc') });
    // Each list gets its own container: `wireListDrag` finds the list it belongs to by scanning its parent's
    // children, so two draggable lists sharing one would each compute drop positions against both.
    const keysList = parent.createDiv({ cls: this.keys.length > 0 ? 'orbis-list-box' : undefined });
    const moveKey = (from: number, to: number) => {
      this.keys.splice(to, 0, ...this.keys.splice(from, 1));
      this.renderBody();
    };
    this.keys.forEach((key, index) => {
      const row = new Setting(keysList).setName(key);
      row.settingEl.addClass('orbis-value-row');
      // What this row DOES first, then the three controls that only move it — the same order the value rows
      // use, so a row of icons means the same thing in both lists.
      // A real button: `addExtraButton` is a div with a click listener, so in a dialog — where Tab is plain DOM order
      // — it would leave this ✕ unreachable from the keyboard.
      const removeKey = () => {
        this.keys.splice(index, 1);
        this.renderBody();
      };
      row.addButton((b) => {
        iconButton(b, 'x', t('action.remove'), removeKey);
        keyActivates(b.buttonEl, removeKey);
        b.buttonEl.dataset.orbisFocus = `remove-key:${key}`;
      });
      // Keyed by the field key, so the arrow follows the row — see `rebuildKeepingFocus` in `renderBody`.
      reorderControls({
        row: row.settingEl,
        into: row.controlEl,
        key,
        index,
        count: this.keys.length,
        keyPrefix: 'key',
        labels: {
          up: t('library_page.property_up'),
          down: t('library_page.property_down'),
          drag: t('library_page.value_drag'),
        },
        drag: this.keyDrag,
        move: moveKey,
      });
    });
    const addKey = new Setting(parent);
    addKey.addDropdown((dd) => {
      dd.addOption('', t('properties_page.add_alias'));
      for (const key of this.vaultKeys()) {
        if (key !== this.key && !this.keys.includes(key)) dd.addOption(key, key);
      }
      dd.onChange((v) => {
        if (!v) return;
        this.keys.push(v);
        this.renderBody();
      });
    });
  }

  /**
   * What this field's values read as, and in what order.
   *
   * **Read-only rows.** A text box on every row would mean sixty text boxes for a field like `type` — slow to
   * open, and on a phone the one you tapped would be under the keyboard. Editing happens in a dialog of its own,
   * the way the annotation presets do it, so this list can never raise a keyboard and never has to be scrolled out
   * from under one.
   *
   * **No paging and no filter.** Both fight the thing this list is for: the order IS
   * the setting, and a list showing ten of sixty rows, or four that matched a search, cannot be dragged into an
   * order that means anything. Long moves are handled in the editor instead — see `Move to top`.
   */
  private renderValuesTab(parent: HTMLElement): void {
    parent.createDiv({ cls: 'orbis-rules-hint', text: t('properties_page.values_desc') });
    const valuesList = parent.createDiv();
    const provided = new Set((BUILT_IN_FIELDS.find((f) => f.key === this.key)?.values ?? []).map((v) => v.value));
    // Everything the field can show a group for: what Orbis provides, what the reader has placed, what their
    // notes actually hold, and the row for the records that answer with nothing. A value in the vault is in this
    // list whether or not anyone has named it — that is what makes the counts mean something.
    const held = [...(this.counted?.counts.keys() ?? [])].sort((a, b) => a.localeCompare(b));
    const offered = mergeValues(
      // Deduped: a status Orbis provides is also a value the vault holds, so the two sources name it twice — and
      // both copies would otherwise be listed, one placed and one alphabetical among the scanned ones.
      dedupeValues([
        ...(BUILT_IN_FIELDS.find((f) => f.key === this.key)?.values ?? []),
        ...held.map((value) => ({ value })),
      ]),
      this.values,
      []
    );
    if (this.counted && this.counted.none > 0 && !offered.some((e) => e.value === NONE_VALUE)) {
      offered.push({ value: NONE_VALUE });
    }
    // The Orbis list look — a recessed ground with hairlines between rows — only around rows there are.
    if (offered.length > 0) valuesList.addClass('orbis-list-box');
    const commit = () => {
      // The none row is kept though its value is empty: it is the one blank that means something, and dropping it
      // would throw away the name and the position the reader gave the records that answer with nothing.
      this.values = offered
        .filter((e) => e.value.trim() || e.value === NONE_VALUE)
        .map((e) => ({
          value: e.value === NONE_VALUE ? NONE_VALUE : e.value.trim(),
          label: e.label?.trim() || undefined,
        }));
    };
    /**
     * `fromEditor` when the move was asked for by the value editor rather than by an arrow in this list.
     *
     * The editor closes as it asks, and Obsidian restores focus to the pencil it opened from **after** `onClose` — so
     * a redraw that happens first leaves that restore nothing to aim at and the keyboard ends up in the settings
     * window behind. See docs/design/dialog-system.md. An arrow in this list has no such problem: nothing is closing.
     */
    const move = (from: number, to: number, fromEditor = false) => {
      offered.splice(to, 0, ...offered.splice(from, 1));
      commit();
      if (fromEditor) this.modalEl.win.setTimeout(() => this.renderBody(), 0);
      else this.renderBody();
    };
    offered.forEach((entry, index) => {
      const row = new Setting(valuesList);
      row.settingEl.addClass('orbis-value-row');
      const used =
        entry.value === NONE_VALUE ? (this.counted?.none ?? 0) : (this.counted?.counts.get(entry.value) ?? 0);
      row.setName(entry.value === NONE_VALUE ? t('properties_page.none_value') : entry.value);
      // The count is the whole reason a value can be deleted or not, so it sits on the row rather than in a
      // tooltip: 2,000 titles is a different proposition from a value you typed a minute ago and never used. The
      // name it reads as is beside it, since that is what the row is for and the row shows no box.
      const parts = [
        entry.label?.trim() ? t('properties_page.shown_as_row', { label: entry.label.trim() }) : '',
        used > 0 ? valueUsedText(used, this.countedOver) : t('properties_page.value_unused'),
      ].filter(Boolean);
      row.setDesc(parts.join(' · '));
      // Edit first, then the ordering controls. What a value READS AS is what this row is mostly about, and the
      // arrows are three ways of saying one thing — burying the pencil at the end of them would put the common action
      // furthest from the row it belongs to.
      const openEditor = () =>
        new ValueModal(this.app, {
          value: entry.value,
          label: entry.label ?? '',
          // **Three cases, and the editor shows which one it is in.** A value Orbis provides is switched off
          // rather than deleted: cataloging writes it, so a list that dropped it would be describing a value
          // the vault is full of and it would be back within a minute. A value the notes hold cannot be
          // deleted either — that would drop nothing but the name and the position, and it would reappear the
          // moment this dialog reopened, which is a button that undoes itself. Only a value nobody uses is
          // really removable, and only that one is respellable, since the notes decide the others.
          editable: !provided.has(entry.value) && entry.value !== NONE_VALUE && used === 0,
          enabled: provided.has(entry.value) ? !this.disabled.includes(entry.value) : null,
          removable: !provided.has(entry.value) && entry.value !== NONE_VALUE && used === 0,
          onSave: (next) => {
            entry.value = next.value;
            entry.label = next.label;
            if (next.enabled !== null) {
              this.disabled = next.enabled
                ? this.disabled.filter((v) => v !== entry.value)
                : [...this.disabled.filter((v) => v !== entry.value), entry.value];
            }
            commit();
            // After the editor has closed, so Obsidian's restore still has the pencil it aimed at — see
            // `docs/design/dialog-system.md`.
            this.modalEl.win.setTimeout(() => this.renderBody(), 0);
          },
          // The move a long list actually needs. Arrows walk one row at a time and dragging across sixty of
          // them means dragging against a scroll, so promoting a value is one tap from where you were
          // already naming it.
          onMove: (where) => move(index, where === 'top' ? 0 : offered.length - 1, true),
          onRemove: () => {
            offered.splice(index, 1);
            commit();
            this.modalEl.win.setTimeout(() => this.renderBody(), 0);
          },
        }).open();
      // A real button, keyed by the value, so a repaint can put the keyboard back on it — see `iconButton`.
      row.addButton((b) => {
        iconButton(b, 'pencil', t('properties_page.value_edit'), openEditor);
        keyActivates(b.buttonEl, openEditor);
        b.buttonEl.dataset.orbisFocus = `value-pencil:${entry.value}`;
      });
      openOnRowTap(row, openEditor);
      // Keyed by the value, so the arrow follows the row — see `rebuildKeepingFocus` in `renderBody`.
      reorderControls({
        row: row.settingEl,
        into: row.controlEl,
        key: entry.value,
        index,
        count: offered.length,
        keyPrefix: 'offered',
        labels: {
          up: t('library_page.value_up'),
          down: t('library_page.value_down'),
          drag: t('library_page.value_drag'),
        },
        drag: this.valueDrag,
        move,
      });
    });
    // **Opens the editor rather than adding a row.** An empty row is the obvious way to do this and is wrong
    // twice over: an unfinished row has no name to show in a read-only list, and the empty string is already
    // taken — it is the value of the "no value" row — so a new value would arrive as a second copy of that one
    // and could not be respelled. Nothing joins this list until it has a value.
    new Setting(parent).addButton((btn) =>
      btn.setButtonText(t('properties_page.add_value')).onClick(() =>
        new ValueModal(this.app, {
          value: '',
          label: '',
          editable: true,
          title: t('properties_page.add_value'),
          enabled: null,
          removable: false,
          onSave: (next) => {
            if (!next.value) return;
            // A value the list already holds is renamed rather than duplicated: two rows for one value would
            // group the same records twice under two headings.
            const existing = offered.find((e) => e.value.toLowerCase() === next.value.toLowerCase());
            if (existing) existing.label = next.label;
            else offered.push({ value: next.value, label: next.label });
            commit();
            // After the dialog has closed — see `move` above.
            this.modalEl.win.setTimeout(() => this.renderBody(), 0);
          },
          onRemove: () => {},
        }).open()
      )
    );
  }

  private save(): void {
    if (!this.key.trim()) {
      new Notice(t('properties_page.property_needed'));
      return;
    }
    this.onConfirm({
      key: this.key.trim(),
      description: this.description.trim() || undefined,
      label: this.label.trim() || undefined,
      hasValues: this.hasValues || undefined,
      keys: this.keys.length > 0 ? this.keys : undefined,
      values: this.values.length > 0 ? this.values : undefined,
      disabled: this.disabled.length > 0 ? this.disabled : undefined,
    });
    this.close();
  }
}
