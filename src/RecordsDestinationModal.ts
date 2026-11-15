// Asked once, before reading records write anything: where should they go?
//
// The destination is a consequential choice — hundreds of notes, a `content/` tree and a base per book — so it is
// made deliberately rather than inherited from a default nobody picked.
//
// **Three questions, and the same three as the settings section**, in the same order, so nothing has to be
// re-learned between the two surfaces. Two of them are folders that only some answers need, so each appears only
// when something uses it, rather than asking for a shared folder and then saying it need not be used. And the base
// covering every book is a *question*, not an assumption — asking "where does it go" while having already decided
// that it exists would silently decline the cross-book view for anyone keeping records beside their books.
//
// Dismissing it is not an answer. The caller decides what that means — settings reverts the mode to off, a write
// simply doesn't happen — which is the same rule the per-book prompt follows.
//
// See docs/design/reading-records.md §The destination is asked, not assumed.

import { type App, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { folderPickerRow } from './folder-picker';
import { t } from './i18n';
import { openOrbisDialog } from './OrbisModal';
import { ensureVaultFolder } from './reader/record-move';
import { DEFAULT_RECORDS_FOLDER } from './settings';
import { annotationsSvg } from './system-glyphs';
import { captureFocus, folderOptions } from './ui-utils';

/** What `pinModalAboveKeyboard` needs to freeze the reader pane behind a keyboard-aware child modal. The plugin
 *  satisfies it; it is threaded through because the folder dialog this opens has the text field, and this one can
 *  open with a book behind it (the reader's write path) as well as from Settings. */
type HeightLock = { lockMobileHeights(): void; unlockMobileHeights(): void };

/** The three vault settings this dialog owns, as one answer. `allBooksBaseFolder` empty = don't create one. */
export interface RecordsDestination {
  sameFolderAsBook: boolean;
  folder: string;
  allBooksBaseFolder: string;
}

/**
 * The folder to propose — matched **case-insensitively**, using the reader's own casing when it exists.
 *
 * Not pedantry: a vault with `Reading Records` and a constant reading `Reading records` are the same folder on
 * macOS and *different* folders on Android and Linux. Insisting on our casing would therefore reuse their folder
 * on one device and create a near-duplicate beside it on another — a platform-dependent outcome, which is the
 * worst kind. Adopting what exists makes every device agree.
 *
 * `folderOptions` already enumerates every folder in the vault, so this costs a lookup rather than a traversal.
 */
function proposedFolder(app: App): string {
  const want = DEFAULT_RECORDS_FOLDER.toLowerCase();
  return Object.keys(folderOptions(app)).find((p) => p.toLowerCase() === want) ?? DEFAULT_RECORDS_FOLDER;
}

/** The three settings this dialog owns, read off a settings object. */
export function recordsDestinationOf(s: {
  recordsSameFolderAsBook: boolean;
  recordsFolder: string;
  recordsAllBooksBaseFolder: string;
}): RecordsDestination {
  return {
    sameFolderAsBook: s.recordsSameFolderAsBook,
    folder: s.recordsFolder,
    allBooksBaseFolder: s.recordsAllBooksBaseFolder,
  };
}

/** …and written back. Shared by both callers (settings and the write path) so an answer cannot be applied two
 *  slightly different ways — including `recordsSetupDone`, which is what stops the question being asked twice. */
export function applyRecordsDestination(
  s: {
    recordsSameFolderAsBook: boolean;
    recordsFolder: string;
    recordsAllBooksBaseFolder: string;
    recordsSetupDone: boolean;
  },
  d: RecordsDestination
): void {
  s.recordsSameFolderAsBook = d.sameFolderAsBook;
  s.recordsFolder = d.folder;
  s.recordsAllBooksBaseFolder = d.allBooksBaseFolder;
  s.recordsSetupDone = true;
}

export function openRecordsDestinationDialog(
  app: App,
  opts: {
    initial: RecordsDestination;
    onSave: (d: RecordsDestination) => void;
    onCancel: () => void;
    heightLock?: HeightLock;
  }
): void {
  const proposal = proposedFolder(app);
  const answer: RecordsDestination = {
    sameFolderAsBook: opts.initial.sameFolderAsBook,
    folder: opts.initial.folder.trim() || proposal,
    // Preselected rather than left empty: the aggregate base is the feature's headline capability, so it is
    // offered rather than opted into — and empty is how you decline it.
    allBooksBaseFolder: opts.initial.allBooksBaseFolder.trim() || proposal,
  };
  let saved = false;

  openOrbisDialog(
    app,
    {
      title: t('records_dest.title'),
      icon: annotationsSvg(16),
      // Fires however the dialog closed, so it is where "dismissing is not an answer" is enforced — the X, the
      // backdrop and Escape all land here, and only Save sets the flag first.
      onClose: () => {
        if (!saved) opts.onCancel();
      },
    },
    (body, close, _modalEl, footer) => {
      const stacked = (row: Setting): void => row.settingEl.addClass('orbis-setting-stacked');

      const render = (): void => {
        // The keyboard stays on the control that redrew the dialog — see `captureFocus`.
        const restore = captureFocus(body);
        body.empty();
        body.createDiv({ cls: 'orbis-records-authority', text: t('records_dest.desc') });

        stacked(
          new Setting(body)
            .setName(t('records_dest.location'))
            // The same words as the settings row — what the answer makes, since the folder row below is hidden for one.
            .setDesc(
              t(
                answer.sameFolderAsBook
                  ? 'reading_records_page.location_desc_beside'
                  : 'reading_records_page.location_desc_folder'
              )
            )
            .addDropdown((d) => {
              d.addOption('shared', t('records_dest.opt_shared'))
                .addOption('book', t('records_dest.opt_beside'))
                .setValue(answer.sameFolderAsBook ? 'book' : 'shared')
                .onChange((v) => {
                  answer.sameFolderAsBook = v === 'book';
                  render();
                });
            })
        );

        // Only when the records themselves use it. Nothing else does — the base has its own folder below, so
        // this row cannot end up holding one file and being called "shared".
        if (!answer.sameFolderAsBook) {
          const folderRow = new Setting(body).setName(t('records_dest.folder'));
          folderPickerRow(folderRow, {
            app,
            // Picking here redraws the screen — the resolved path below follows the folder.
            focusKey: 'records-folder',
            current: () => answer.folder,
            pendingKey: 'folder_picker.pending_on_save',
            heightLock: opts.heightLock,
            onPick: (path) => {
              answer.folder = path;
              render();
            },
          });
          stacked(folderRow);
        }

        // One control: a folder, or none. No option refers to the row above it, which would be incoherent when the
        // records go beside their books.
        const baseRow = new Setting(body).setName(t('records_dest.base')).setDesc(t('records_dest.base_desc'));
        folderPickerRow(baseRow, {
          app,
          focusKey: 'records-base',
          extra: { '': t('records_dest.base_none') },
          current: () => answer.allBooksBaseFolder,
          pendingKey: 'folder_picker.pending_on_save',
          heightLock: opts.heightLock,
          onPick: (path) => {
            answer.allBooksBaseFolder = path;
            render();
          },
        });
        stacked(baseRow);

        // In the footer — see `InlineOrbisModal.renderDialog`. Emptied first: this screen redraws on every change.
        const bar = footer();
        bar.empty();
        const actions = actionRow(bar);
        actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
        actionButton(actions, {
          label: t('action.save'),
          cta: true,
          onClick: () => {
            saved = true;
            // Saving with the preselected options is a real answer — the point is that a choice was made, not
            // that something had to be changed.
            const dest: RecordsDestination = { ...answer };
            close();
            // Folders are created NOW, not lazily on the first write: they should exist the moment Save is
            // pressed, so the explorer shows them and the settings rows can display them like any other folder.
            // Awaited before handing the answer back so the caller's re-render sees folders that exist.
            void (async () => {
              if (!dest.sameFolderAsBook) await ensureVaultFolder(app, dest.folder);
              if (dest.allBooksBaseFolder) await ensureVaultFolder(app, dest.allBooksBaseFolder);
              opts.onSave(dest);
            })();
          },
        });
        restore();
      };

      render();
    }
  );
}
