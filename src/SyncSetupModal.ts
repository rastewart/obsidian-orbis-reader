// Asked once, when this device joins a vault used on more than one: what is it called, and what does it share?
//
// **One dialog for the whole page.** A single switch sits above both features, so the setup behind it has to ask
// about both, in the order the page lists them: who this device is, then what it shares. Asking about config
// publishing alone would leave the other half, reading position, turned on by a default the reader is never shown.
//
// **The switch is the acknowledgement, and it asks every question in the same breath.** The shape book sources and
// the records destination already use — see `BookSourcesSetupModal` — because a switch reading "on" over a feature
// that has not been told where to write is the thing all three dialogs exist to prevent.
//
// **Dismissing is not consent.** The ×, the backdrop and Escape all leave the switch off; the caller decides what
// that means and settings does the honest thing with it.
//
// See docs/design/multi-device-sync.md §Turning it on.

import { type App, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { deviceKind, freeDeviceName, takenDeviceNames } from './device-name';
import { getOrCreateDeviceId } from './device-store';
import { folderPickerRow } from './folder-picker';
import { t } from './i18n';
import { setMultiDeviceEnabled } from './multi-device';
import { openOrbisDialog } from './OrbisModal';
import { LS_DEVICE_NAME, LS_IGNORE_OTHERS, updateDeviceNameInVault } from './progress';
import type { IOrbisReaderPlugin } from './settings';
import { markSyncSetupDone } from './sync/enabled';
import { syncFolderOf } from './sync/paths';
import { publishedFolder } from './sync/store';
import { pinModalAboveKeyboard } from './ui-utils';

interface SyncSetupAnswers {
  name: string;
  /** Whether this device reads the others' reading positions. On by default: it is the half with nothing to set up. */
  shareLocation: boolean;
  /** Whether this device publishes its Orbis configuration. Off by default — it writes files, so it is asked for. */
  shareConfig: boolean;
  folder: string;
}

/**
 * Ask, and report the answers — or that there weren't any.
 *
 * `joining` is the folder other devices already publish into, when the vault holds any: on a second device the folder
 * is a question that has already been answered, and asking it as though it were open invites a different answer.
 */
function openSyncSetupDialog(
  app: App,
  opts: {
    suggestedName: string;
    initialFolder: string;
    joining: string | null;
    onSave: (answers: SyncSetupAnswers) => void;
    onCancel: () => void;
  }
): void {
  let name = opts.suggestedName;
  let folder = opts.initialFolder;
  // Reading position on, configuration off. Not symmetry for its own sake: sharing a position needs nothing set up
  // and is what a second device is usually for, while publishing configuration writes a folder of files and is the
  // one here worth opting into.
  let shareLocation = true;
  let shareConfig = false;
  let saved = false;
  let unpin: () => void = () => {};

  openOrbisDialog(
    app,
    {
      title: t('multi_device_setup.title'),
      onClose: () => {
        unpin();
        if (!saved) opts.onCancel();
      },
    },
    (body, close, modalEl, footer) => {
      /**
       * **`reserve`, because this is a form you work down.** Tapping the name field raises the keyboard over
       * the two toggles and both buttons — everything the reader has yet to answer. The reserve is padding
       * under the last field, so any of them can be scrolled clear of the keyboard and nothing is cut off,
       * while the dialog keeps the shape it opened at. The default `lift` would instead cap this dialog at
       * half a phone screen and leave it there. The same call the EPUB export stages make, for the same
       * reason.
       */
      unpin = pinModalAboveKeyboard(modalEl, undefined, { layout: 'reserve' });
      /**
       * **What this does and does not do, before the button.** Orbis writes files; something else moves them. A
       * reader who expects the plugin itself to reach their other devices would be waiting for something that
       * never happens — so the caveat gets its own line and its own emphasis, as it does on the switch.
       *
       * The switch's own words, deliberately: this dialog is what that switch opens, and a reader who has just
       * read one sentence should recognize it rather than have to check whether it says something new.
       */
      const intro = body.createDiv({ cls: 'orbis-records-authority' });
      intro.appendText(t('multi_device.enabled_desc'));
      intro.createEl('br');
      intro.createEl('strong').createEl('em', { text: t('multi_device.sync_caveat') });

      body.createDiv({ cls: 'orbis-rules-heading', text: t('sync_setup.q_name') });
      const nameRow = new Setting(body).setDesc(t('devices_page.device_name_desc'));
      nameRow.settingEl.addClass('orbis-setting-stacked');
      nameRow.addText((txt) => {
        txt.setValue(name);
        txt.setPlaceholder(t('devices_page.enter_device_name'));
        txt.onChange((v) => {
          name = v;
        });
      });

      body.createDiv({ cls: 'orbis-rules-heading', text: t('multi_device_setup.q_share') });

      new Setting(body)
        .setName(t('multi_device_setup.location'))
        .setDesc(t('multi_device_setup.location_desc'))
        .addToggle((tog) =>
          tog.setValue(shareLocation).onChange((on) => {
            shareLocation = on;
          })
        );

      const configRow = new Setting(body)
        .setName(t('multi_device_setup.config'))
        .setDesc(t('multi_device_setup.config_desc'));

      // The folder is the config answer's second half, so it appears with it and not before: a destination for files
      // nothing is writing is a question with no consequence, which is the rule the settings page follows too.
      const folderWrap = body.createDiv();
      const paintFolder = (): void => {
        folderWrap.empty();
        if (!shareConfig) return;
        folderWrap.createDiv({ cls: 'orbis-rules-heading', text: t('sync_setup.q_folder') });
        const folderRow = new Setting(folderWrap).setDesc(
          opts.joining ? t('sync_setup.folder_joining', { folder: opts.joining }) : t('sync_setup.folder_desc')
        );
        folderRow.settingEl.addClass('orbis-setting-stacked');
        folderPickerRow(folderRow, {
          app,
          current: () => folder,
          onPick: (path) => {
            folder = path;
          },
        });
      };

      configRow.addToggle((tog) =>
        tog.setValue(shareConfig).onChange((on) => {
          shareConfig = on;
          paintFolder();
        })
      );
      configRow.settingEl.insertAdjacentElement('afterend', folderWrap);
      paintFolder();

      // In the footer — see `InlineOrbisModal.renderDialog`.
      const actions = actionRow(footer());
      actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
      actionButton(actions, {
        label: t('multi_device_setup.turn_on'),
        cta: true,
        onClick: () => {
          saved = true;
          opts.onSave({ name: name.trim(), shareLocation, shareConfig, folder: folder.trim() });
          close();
        },
      });
    }
  );
}

/**
 * Open the setup dialog with what the vault already answers filled in, and act on what comes back.
 *
 * **One path for both openers** — the multi-device switch, and the offer when a book opens in a vault another device
 * uses. They were two copies of the same save, already drifting: only one asked sync to publish the new name.
 *
 * Both prefills are read from the vault before the dialog opens: what this device might be called, and where the
 * others already publish. A second device should join what is there rather than be asked as if nothing were.
 *
 * **The folder is kept only when configuration is shared.** A device that leaves it off has answered nothing about
 * where files go, so it keeps no folder of its own — and turning sharing on later then joins the vault's folder
 * (`setSyncEnabled`) rather than a default this dialog wrote on its behalf.
 */
export async function runSyncSetup(
  plugin: IOrbisReaderPlugin,
  opts: { onSaved?: () => void; onCancel?: () => void } = {}
): Promise<void> {
  const { app } = plugin;
  const taken = await takenDeviceNames(app);
  const here = (app.loadLocalStorage(LS_DEVICE_NAME) as string | null) ?? '';
  const joining = publishedFolder(app);
  openSyncSetupDialog(app, {
    suggestedName: here.trim() || freeDeviceName(deviceKind(), taken),
    initialFolder: joining ?? syncFolderOf(plugin.settings.syncFolder),
    joining,
    onSave: (answers) => {
      void (async () => {
        setMultiDeviceEnabled(true);
        renameThisDevice(plugin, answers.name);
        markSyncSetupDone();
        // Stored inverted — the flag is "ignore the others" — so an answer of "share" clears it.
        app.saveLocalStorage(LS_IGNORE_OTHERS, String(!answers.shareLocation));
        await plugin.setSyncEnabled(answers.shareConfig, answers.shareConfig ? answers.folder : undefined);
        opts.onSaved?.();
      })();
    },
    onCancel: () => opts.onCancel?.(),
  });
}

/**
 * Name this device, here and in the vault.
 *
 * The name is what OTHER devices show in the resume prompt, so it has to reach the location files as well as this
 * device's own storage — one path for both, since a second one that skipped the vault would leave the two
 * disagreeing about what this machine is called.
 */
export function renameThisDevice(plugin: IOrbisReaderPlugin, name: string): void {
  const trimmed = name.trim();
  plugin.app.saveLocalStorage(LS_DEVICE_NAME, trimmed);
  void updateDeviceNameInVault(plugin.app, getOrCreateDeviceId(plugin.app), trimmed);
  // **And ask sync to look.** The name is the one thing sync publishes that does not live in `data.json`, so the
  // save that normally schedules a scan never happens — see `syncSoon`. Without this the device's own record keeps
  // its old name until something else triggers a scan, which reads as the rename having done nothing.
  plugin.syncSoon('the device was renamed');
}
