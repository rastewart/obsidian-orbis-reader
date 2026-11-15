// Naming a display style.
//
// A real `Modal` rather than a `createOrbisPopup`, and that is worth the file saying: it opens from inside
// Obsidian's own Settings modal, where a popup renders but never receives a keystroke. See
// docs/design/dialog-system.md.

import { App, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';

export class StyleNameModal extends OrbisModal {
  private name: string;
  constructor(
    app: App,
    private initialValue: string,
    private title: string,
    private onConfirm: (name: string) => void
  ) {
    // `compact` because this dialog is one text field and two buttons: Obsidian centers a Modal vertically, so
    // on a phone the keyboard opens over the field being typed into and the Save below it. Top-anchored and
    // height-capped is the mode that exists for exactly this shape — the destination editor and New folder
    // already use it; this one was the odd one out.
    super(app, { compact: true });
    this.name = initialValue;
  }

  protected dialogTitle(): string {
    return this.title;
  }

  protected renderDialog() {
    const { contentEl } = this;
    new Setting(contentEl).setName(t('style_name_modal.name')).addText((t) => {
      t.setValue(this.initialValue);
      t.inputEl.addClass('orbis-input-full');
      t.onChange((v) => (this.name = v));
      t.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && this.name.trim()) {
          e.preventDefault();
          e.stopPropagation();
          this.close();
          this.onConfirm(this.name.trim());
        }
      });
      window.setTimeout(() => t.inputEl.focus(), 50);
    });
    // The footer, like every other dialog — and like New folder, this is the shape that needs it: a text field on
    // a phone puts the keyboard over whatever sits below it, and a footer takes the reserve that accounts for that.
    const row = actionRow(this.footer());
    actionButton(row, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(row, {
      label: t('action.save'),
      cta: true,
      onClick: () => {
        if (this.name.trim()) {
          this.onConfirm(this.name.trim());
          this.close();
        }
      },
    });
  }
}
