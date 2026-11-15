// Create a folder without leaving the picker you needed it for.
//
// Its own file rather than a private class in OrbisSettings, because the first-run destination dialog needs the same
// button and importing it from the settings tab would be a cycle — the settings tab imports that dialog. A shared
// "+" is worth more than a second implementation: a reader who has decided where reading records go should not have
// to close the dialog, make a folder in the explorer and start again.
//
// Kept as a real Modal rather than createOrbisPopup — same reason as StyleNameModal (it opens from inside
// Obsidian's own Settings Modal, which blocks keyboard input for anything outside its own DOM tree).
//
// It has a text field, so on a phone it is `pinModalAboveKeyboard`'d: Obsidian centers a Modal vertically and sizes
// it to content, which on Android put the name field itself under the keyboard — reported over the first-run
// destination dialog, where this opens as a SECOND modal. That stacking is why the shared pin matters rather than
// a local `top`: the pin registry hides the dialog underneath while this one is up, because two stacked dialogs on
// a phone cannot both be readable and a repositioned parent paints over its own child on Android.

import { type App, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';
import { folderOptions, pinModalAboveKeyboard } from './ui-utils';

export class NewFolderModal extends OrbisModal {
  private folderName = '';
  private parentPath: string;

  /** `heightLock` is the reader-pane freeze `pinModalAboveKeyboard` needs — the plugin, from any caller that has
   *  it. Optional because this also opens from Settings with no book behind it. */
  constructor(
    app: App,
    initialParent: string,
    private onCreated: (newPath: string) => void,
    private heightLock?: { lockMobileHeights(): void; unlockMobileHeights(): void }
  ) {
    super(app, { compact: true });
    this.parentPath = initialParent;
  }

  private unpin: () => void = () => {};

  protected dialogTitle(): string {
    return t('new_folder_modal.create_folder');
  }

  protected renderDialog() {
    const { contentEl } = this;
    this.unpin = pinModalAboveKeyboard(this.modalEl, this.heightLock);
    new Setting(contentEl).setName(t('new_folder_modal.parent_folder')).addDropdown((d) => {
      d.addOptions(folderOptions(this.app));
      d.setValue(this.parentPath);
      d.onChange((v) => {
        this.parentPath = v;
        updatePreview();
      });
    });

    new Setting(contentEl).setName(t('new_folder_modal.folder_name')).addText((t) => {
      t.inputEl.addClass('orbis-input-240');
      t.onChange((v) => {
        this.folderName = v;
        updatePreview();
      });
      t.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && this.folderName.trim()) {
          e.preventDefault();
          e.stopPropagation();
          void this.doCreate();
        }
      });
      window.setTimeout(() => t.inputEl.focus(), 50);
    });

    const previewEl = contentEl.createDiv({ cls: 'orbis-folder-preview' });

    const updatePreview = () => {
      const name = this.folderName.trim();
      if (!name) {
        previewEl.textContent = '';
        return;
      }
      const full = this.parentPath === '/' ? name : `${this.parentPath}/${name}`;
      const exists = !!this.app.vault.getAbstractFileByPath(full);
      previewEl.textContent = full;
      previewEl.toggleClass('is-existing', exists);
      previewEl.toggleClass('is-new', !exists);
      if (exists) previewEl.textContent += t('new_folder_modal.already_exists');
    };

    // In the footer, beside the body rather than inside it — the shape every other dialog uses, and here it is
    // more than consistency: a dialog WITH a footer takes a different mobile-keyboard reserve (see the note in
    // `ui-utils.applyKeyboardReserve`), and this one has the text field that reserve exists for.
    const row = actionRow(this.footer());
    actionButton(row, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(row, { label: t('new_folder_modal.create'), cta: true, onClick: () => void this.doCreate() });
  }

  private async doCreate() {
    const name = this.folderName.trim();
    if (!name) return;
    const full = this.parentPath === '/' ? name : `${this.parentPath}/${name}`;
    if (!this.app.vault.getAbstractFileByPath(full)) {
      await this.app.vault.createFolder(full);
    }
    this.close();
    this.onCreated(full);
  }

  protected onDialogClose(): void {
    this.unpin();
  }
}
