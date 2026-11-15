// Picking a value that already exists somewhere in the vault, rather than typing it again.
//
// Its own file rather than traveling with either dialog that opens it: a collection rule wants it for the right
// side of a comparison and a field's value list wants it for its own reasons, and neither owns it.
// `VALUE_PICKER_CAP` is exported for the same reason — three dialogs cap the same list the same way.

import { App, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';
import { LIBRARY_SVG } from './system-glyphs';

/** How many distinct values a field may have before its picker gives up and offers a text box instead. */
export const VALUE_PICKER_CAP = 60;

/**
 * One value of one field: what it reads as, whether it is offered, and where it sits.
 *
 * **Its own dialog so the list does not need text boxes.** Sixty values meant sixty inputs on one screen, and on
 * a phone the one you tapped was behind the keyboard — the same trap the annotation presets solved by making
 * their list read-only and letting the editor pay for the keyboard. It also gives the long moves somewhere to
 * live: arrows walk a row at a time, which is no way to promote a value out of a list of sixty.
 */
export class ValueModal extends OrbisModal {
  private value: string;
  private label: string;
  private enabled: boolean | null;

  constructor(
    app: App,
    private readonly opts: {
      value: string;
      label: string;
      /** Whether the value itself can be respelled — only one nobody has used and Orbis does not provide. */
      editable: boolean;
      /** What the dialog is called. Adding and editing are the same form and different acts. */
      title?: string;
      /** On/off for a value Orbis provides; `null` for one it does not, which has nothing to switch. */
      enabled: boolean | null;
      /**
       * What the Fields page calls this value, when this dialog is a collection's override of it.
       *
       * Shown as its own line and as the box's placeholder, so the three facts a reader needs are all here: what
       * the value IS, what it is called everywhere, and what this collection calls it. Clearing the box is how
       * you go back to the field's name — an empty override is not an override.
       */
      inherited?: string;
      removable: boolean;
      onSave: (next: { value: string; label: string; enabled: boolean | null }) => void;
      /** Absent while adding: a value that is not in the list yet has nowhere to be moved to. */
      onMove?: (where: 'top' | 'bottom') => void;
      onRemove: () => void;
    }
  ) {
    super(app, { compact: true, dismissOnOutsideClick: false, icon: LIBRARY_SVG });
    this.value = opts.value;
    this.label = opts.label;
    this.enabled = opts.enabled;
  }

  protected dialogTitle(): string {
    return this.opts.title ?? t('properties_page.value_edit');
  }

  protected renderDialog() {
    this.modalEl.addClass('orbis-form-dialog');
    const body = this.contentEl;

    if (this.opts.editable) {
      const row = new Setting(body).setName(t('properties_page.value_value'));
      row.settingEl.addClass('orbis-setting-stacked');
      row.addText((txt) => {
        txt.inputEl.addClass('orbis-input-full');
        txt.setPlaceholder(t('properties_page.value_placeholder'));
        txt.setValue(this.value).onChange((v) => (this.value = v));
      });
    } else {
      new Setting(body)
        .setName(t('properties_page.value_value'))
        .setDesc(this.value || t('properties_page.none_value'));
    }

    // What it is called outside this collection, when there is such a thing. Read-only: the Fields page is where
    // that is changed, and a second box for it here would be two doors to one setting.
    if (this.opts.inherited !== undefined) {
      new Setting(body)
        .setName(t('library_page.value_property_label'))
        .setDesc(this.opts.inherited || t('library_page.value_property_unnamed'));
    }

    const named = new Setting(body)
      .setName(
        t(this.opts.inherited === undefined ? 'properties_page.value_label' : 'library_page.value_collection_label')
      )
      .setDesc(
        t(this.opts.inherited === undefined ? 'properties_page.value_label_desc' : 'library_page.value_collection_desc')
      );
    named.settingEl.addClass('orbis-setting-stacked');
    named.addText((txt) => {
      txt.inputEl.addClass('orbis-input-full');
      // What it will read as if left alone: the field's name where one is inherited, the value itself otherwise.
      // Adding, there is nothing to echo.
      txt.setPlaceholder(
        this.opts.inherited || this.value || (this.opts.editable ? '' : t('properties_page.none_value'))
      );
      txt.setValue(this.label).onChange((v) => (this.label = v));
    });

    if (this.enabled !== null) {
      new Setting(body)
        .setName(t('properties_page.value_enabled'))
        .setDesc(t('properties_page.value_enabled_desc'))
        .addToggle((tog) => tog.setValue(this.enabled === true).onChange((on) => (this.enabled = on)));
    }

    // Applied as they are pressed, not on Save: a move is a change to the list rather than to this value, and
    // holding it until Save would mean two kinds of pending change in one dialog.
    const onMove = this.opts.onMove;
    if (onMove) {
      const moves = new Setting(body).setName(t('properties_page.move'));
      moves.addButton((btn) =>
        btn.setButtonText(t('properties_page.move_top')).onClick(() => {
          this.commit();
          onMove('top');
          this.close();
        })
      );
      moves.addButton((btn) =>
        btn.setButtonText(t('properties_page.move_bottom')).onClick(() => {
          this.commit();
          onMove('bottom');
          this.close();
        })
      );
    }

    const actions = actionRow(this.footer());
    if (this.opts.removable) {
      actionButton(actions, {
        label: t('action.remove'),
        destructive: true,
        onClick: () => {
          this.opts.onRemove();
          this.close();
        },
      });
    }
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(actions, {
      label: t('action.save'),
      cta: true,
      onClick: () => {
        this.commit();
        this.close();
      },
    });
  }

  private commit(): void {
    this.opts.onSave({ value: this.value.trim(), label: this.label.trim(), enabled: this.enabled });
  }
}
