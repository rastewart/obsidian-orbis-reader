// Asked once, before the library writes anything: where do title notes go, and do covers come with them?
//
// **A switch that writes notes should ask where they go before it writes any.** Reading records works this way too.
// An empty `libraryRecordsFolder` is the vault root, so without this every feature that writes a title note would
// have to invent an answer for a question nobody had been asked — the note-to-EPUB converter would have to ask
// inside a dialog about making an EPUB.
//
// **Dismissing is not an answer.** The caller decides what that means, and settings leaves the library off — a
// switch reading "on" over a feature that never got its folder is the lie this dialog exists to remove. Same rule
// as the records destination, and the same shape, so nothing has to be re-learned between the two.
//
// See docs/design/library.md §Turning it on — the first-run questions.

import { type App, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { folderPickerRow } from './folder-picker';
import { t } from './i18n';
import { openOrbisDialog } from './OrbisModal';
import { captureFocus, folderOptions } from './ui-utils';

/** The folder proposed when the reader has none: beside their notes, named for what it holds. */
const DEFAULT_TITLES_FOLDER = 'Library/Titles';

/** The two settings this dialog owns, as one answer. */
export interface LibrarySetup {
  recordsFolder: string;
  extractCovers: boolean;
  coversFolder: string;
}

/**
 * The folder to propose — matched **case-insensitively**, using the reader's own casing when it exists.
 *
 * The same rule the records destination follows, for the same reason: `Library/Titles` and `library/titles` are one
 * folder on macOS and two on Android, so insisting on our casing would reuse their folder on one device and create
 * a near-duplicate beside it on another.
 */
function proposedFolder(app: App): string {
  const want = DEFAULT_TITLES_FOLDER.toLowerCase();
  return Object.keys(folderOptions(app)).find((p) => p.toLowerCase() === want) ?? DEFAULT_TITLES_FOLDER;
}

/**
 * Two questions, in the order they depend on each other.
 *
 * The covers folder derives from the title-notes folder, so asking for the title notes first means the second
 * question is usually already answered — and the reader sees the derived path rather than an empty box that looks
 * like a decision they still owe.
 */
export function openLibrarySetupDialog(
  app: App,
  opts: {
    initial: LibrarySetup;
    onSave: (setup: LibrarySetup) => void;
    onCancel: () => void;
  }
): void {
  const proposal = proposedFolder(app);
  const answer: LibrarySetup = {
    recordsFolder: opts.initial.recordsFolder.trim() || proposal,
    extractCovers: opts.initial.extractCovers,
    coversFolder: opts.initial.coversFolder.trim(),
  };
  let saved = false;

  openOrbisDialog(
    app,
    {
      title: t('library_setup.title'),
      // Fires however the dialog closed — the ×, the backdrop and Escape all land here, and only Save sets the
      // flag first. This is where "dismissing is not an answer" is enforced.
      onClose: () => {
        if (!saved) opts.onCancel();
      },
    },
    (body, close, _modalEl, footer) => {
      const render = (): void => {
        // The keyboard stays on the control that redrew the dialog — see `captureFocus`.
        const restore = captureFocus(body);
        body.empty();
        body.createDiv({ cls: 'orbis-records-authority', text: t('library_setup.desc') });

        // The question is the heading and the control sits under it, rather than the question being the dialog's
        // title: the title names what pressing the button does, which is what someone reads first and what they
        // came here to decide. A row named "Folder for new title notes" beneath a heading asking where title
        // notes go would be the same sentence twice, so the row keeps only its explanation.
        body.createDiv({ cls: 'orbis-rules-heading', text: t('library_setup.q_folder') });
        const folderRow = new Setting(body).setDesc(t('library_setup.records_folder_desc'));
        folderRow.settingEl.addClass('orbis-setting-stacked');
        folderPickerRow(folderRow, {
          app,
          // The covers line below is derived from this one, so picking redraws.
          focusKey: 'library-records-folder',
          current: () => answer.recordsFolder,
          onPick: (path) => {
            answer.recordsFolder = path;
            // The covers path is derived from this one, so the line below it has to follow.
            render();
          },
        });

        new Setting(body)
          .setName(t('library_setup.covers'))
          .setDesc(t('library_setup.covers_desc'))
          .addToggle((tog) =>
            tog.setValue(answer.extractCovers).onChange((on) => {
              answer.extractCovers = on;
              render();
            })
          );

        // Only when something uses it. Being asked to name a covers folder and then told covers are off is a shape
        // the records dialog avoids, and the same rule applies here.
        if (answer.extractCovers) {
          const derived = answer.recordsFolder.replace(/^\/+|\/+$/g, '');
          const coversRow = new Setting(body)
            .setName(t('library_setup.covers_folder'))
            .setDesc(t('library_setup.covers_folder_desc'));
          coversRow.settingEl.addClass('orbis-setting-stacked');
          folderPickerRow(coversRow, {
            app,
            // Empty means "the one derived from the folder above", which is the answer almost everyone wants — so it
            // is the first option and it says what it resolves to rather than showing a blank. The same string the
            // settings row uses, naming the path because the covers live INSIDE the title-notes folder, not beside it.
            extra: {
              '': t('library_page.covers_folder_default', { path: derived ? `${derived}/covers` : 'covers' }),
            },
            // **Empty stays empty**, so the row shows the derived option above — the one labeled with the path it
            // resolves to. `derived` is the TITLE-NOTES folder, not the covers folder under it, so falling back to it
            // here would sit the dropdown on "Library/Titles" while the answer reads "Library/Titles/covers" — a
            // choice the reader has not made. `coversFolderFor` derives from an empty value correctly, and `onPick`
            // only fires on a change.
            current: () => answer.coversFolder,
            onPick: (path) => {
              answer.coversFolder = path;
            },
          });
        }

        // In the footer — see `InlineOrbisModal.renderDialog`. Emptied first: this screen redraws on every change.
        const bar = footer();
        bar.empty();
        const actions = actionRow(bar);
        actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
        actionButton(actions, {
          label: t('library_setup.turn_on'),
          cta: true,
          onClick: () => {
            saved = true;
            opts.onSave({ ...answer, recordsFolder: answer.recordsFolder.trim() });
            close();
          },
        });
        restore();
      };

      render();
    }
  );
}
