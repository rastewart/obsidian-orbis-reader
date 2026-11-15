// Adding or editing a Look-up web destination — a name, and a URL carrying a `{{query}}` placeholder.

import { App, Notice, Setting, TextComponent } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';

/**
 * Add or edit a web-search destination: a name, and a URL with `{{query}}` where the word goes.
 *
 * A dialog rather than a pair of inline rows. The list is a declarative `type: 'list'`, and a list row is a row — it
 * has no room for two text fields, a Save and a Cancel, and an inline edit form that appears *in place of* a row loses
 * the reorder handle and the toggle while it is open. `compact` because both fields and both buttons have to clear the
 * on-screen keyboard.
 *
 * Validation lives here rather than at the call site so add and edit cannot disagree about what a destination
 * is: a name, and an http(s) URL that actually contains the token, or the destination silently searches for
 * nothing.
 *
 * **Deleting is NOT here.** The list is `renderReorderList`, whose actions are per row and which draws an absent
 * one as an empty slot (`ReorderAction.hidden`), so a built-in that cannot be deleted simply has no trash. A Delete
 * in this dialog would mean opening it with a pencil in order to delete something — two different verbs down one
 * path.
 */
export class DestinationModal extends OrbisModal {
  private name: string;
  private url: string;

  constructor(
    app: App,
    private readonly dest: { name: string; url: string } | null,
    private readonly onConfirm: (name: string, url: string) => void
  ) {
    super(app, { compact: true });
    this.name = dest?.name ?? '';
    this.url = dest?.url ?? '';
  }

  protected dialogTitle(): string {
    return this.dest ? t('lookup_page.edit_destination') : t('lookup_page.add_destination');
  }

  protected renderDialog() {
    const { contentEl } = this;
    // A column of fields, so each label sits ABOVE its input and the input takes the whole width. A search URL
    // runs to seventy characters and is the one field you most need to read while editing it; beside its own
    // label it would show about a third of one.
    this.modalEl.addClass('orbis-form-dialog');
    const field = (name: string, desc: string | undefined, build: (txt: TextComponent) => void): void => {
      const row = new Setting(contentEl).setName(name);
      if (desc) row.setDesc(desc);
      row.settingEl.addClass('orbis-setting-stacked');
      row.addText((txt) => {
        txt.inputEl.addClass('orbis-input-full');
        build(txt);
      });
    };
    field(t('lookup_page.destination_name'), undefined, (txt) => {
      txt.setValue(this.name).onChange((v) => (this.name = v));
      window.setTimeout(() => txt.inputEl.focus(), 50);
    });
    field(t('lookup_page.destination_url'), t('lookup_page.destination_url_desc', { ph: '{{query}}' }), (txt) => {
      // i18n-audit-disable-next-line -- example URL template, not translatable copy
      txt.setPlaceholder('https://example.com/search?q={{query}}');
      txt.setValue(this.url).onChange((v) => (this.url = v));
    });
    // In the footer rather than at the end of the body: a dialog whose fields can grow puts its own Save out of reach
    // otherwise.
    // **No Delete here** — it is the row's trash, like every other list in settings. See the destinations list.
    // `actionRow` rather than Obsidian's setting row, for the reason the rule editor gives: its buttons go
    // full-width on a phone and stop looking like every other dialog's.
    const actions = actionRow(this.footer());
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(actions, {
      label: t('action.save'),
      cta: true,
      onClick: () => {
        const name = this.name.trim();
        const url = this.url.trim();
        if (!name) {
          new Notice(t('lookup_page.invalid_name'));
          return;
        }
        if (!/^https?:\/\//i.test(url) || !url.includes('{{query}}')) {
          new Notice(t('lookup_page.invalid_url', { ph: '{{query}}' }));
          return;
        }
        this.onConfirm(name, url);
        this.close();
      },
    });
  }
}
