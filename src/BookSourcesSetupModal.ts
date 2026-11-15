// Asked once, before anything is fetched: may Orbis contact these servers, and where do the books land?
//
// **The acknowledgement is the switch, and it asks for the folder in the same breath.** Two dialogs before a feature
// can be used is one too many, and the two questions are not separable in practice: consenting to downloads without
// saying where they go leaves a switch reading "on" over a feature whose first act would be to write into the vault
// root. The Library's own setup dialog and the records destination take the same shape, so nothing has to be
// re-learned between the three.
//
// **Dismissing is not consent.** The × , the backdrop and Escape all leave the feature off — the caller decides, and
// settings does the honest thing with it.
//
// See docs/design/book-sources.md §Off until acknowledged.

import { type App, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { folderPickerRow } from './folder-picker';
import { t } from './i18n';
import { openOrbisDialog } from './OrbisModal';
import { folderOptions } from './ui-utils';

/** The folder proposed when the reader has none: named for what it holds, beside their books. */
const DEFAULT_DOWNLOADS_FOLDER = 'Library/Downloads';

/**
 * The folder to propose — matched **case-insensitively**, using the reader's own casing when it exists.
 *
 * The rule the Library's setup and the records destination both follow, for the same reason: `Library/Downloads` and
 * `library/downloads` are one folder on macOS and two on Android, so insisting on ours would reuse their folder on one
 * device and create a near-duplicate beside it on another.
 */
function proposedFolder(app: App): string {
  const want = DEFAULT_DOWNLOADS_FOLDER.toLowerCase();
  return Object.keys(folderOptions(app)).find((p) => p.toLowerCase() === want) ?? DEFAULT_DOWNLOADS_FOLDER;
}

/**
 * Ask, and report the answer — or that there wasn't one.
 *
 * `onSave` receives the folder to write downloads into; `onCancel` means the feature stays off. A folder that does not
 * exist yet is a legitimate answer: the "+" makes it, as it does in every other folder row.
 */
export function openBookSourcesSetupDialog(
  app: App,
  opts: { initialFolder: string; onSave: (folder: string) => void; onCancel: () => void }
): void {
  let folder = opts.initialFolder.trim() || proposedFolder(app);
  let saved = false;

  openOrbisDialog(
    app,
    {
      title: t('sources_setup.title'),
      onClose: () => {
        if (!saved) opts.onCancel();
      },
    },
    (body, close, _modalEl, footer) => {
      // What is being consented to, in the words that matter: this contacts machines that are not yours, and what it
      // brings back is replicated to every device on your account. Both facts belong before the button, not after the
      // first download.
      body.createDiv({ cls: 'orbis-records-authority', text: t('sources_setup.desc') });

      body.createDiv({ cls: 'orbis-rules-heading', text: t('sources_setup.q_folder') });
      const row = new Setting(body).setDesc(t('sources_setup.folder_desc'));
      row.settingEl.addClass('orbis-setting-stacked');
      folderPickerRow(row, {
        app,
        current: () => folder,
        onPick: (path) => {
          folder = path;
        },
      });

      // In the footer — see `InlineOrbisModal.renderDialog`.
      const actions = actionRow(footer());
      actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
      actionButton(actions, {
        label: t('sources_setup.turn_on'),
        cta: true,
        onClick: () => {
          saved = true;
          opts.onSave(folder.trim());
          close();
        },
      });
    }
  );
}
