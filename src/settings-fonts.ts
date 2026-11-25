// The Fonts page: where fonts are kept, importing them, and which ones the Font list offers.
//
// Its own file, like the display styles page, so the settings tab only has to say where the page goes. See
// docs/design/fonts.md.

import { type App, Notice, Setting } from 'obsidian';
import { askToConfirm } from './ConfirmModal';
import { faceNames, importFonts } from './FontImportModal';
import { folderPickerRow } from './folder-picker';
import { downloadFontPackage, FONT_PACKAGES, packageInstalled, packageMegabytes, packageOf } from './font-downloads';
import { FACE_SLOTS } from './font-file';
import {
  DEFAULT_FONTS_FOLDER,
  deleteFontFiles,
  fontsFolderOf,
  forgetFontFiles,
  knownFonts,
  moveFontsFolder,
  moveProblem,
  SYSTEM_FONTS,
  type SystemFontStatus,
  scanFonts,
  slotsOf,
  systemFontStatus,
  useFontFor,
  type VaultFont,
  vaultFontValue,
} from './fonts';
import { t } from './i18n';
import { forgetLegacyPdfFonts } from './pdf-fonts';
import { downloadFailedMessage } from './reader/tts/asset-integrity';
import type { OrbisPluginSettings } from './settings';

/** What the page needs from the settings tab. */
export interface FontsPageHost {
  app: App;
  settings: OrbisPluginSettings;
  save: () => Promise<void>;
  /** Draw the page again — after the folder moves, a font is imported, or one is deleted. */
  redraw: () => void;
  /** Tell open books the Font list has changed. */
  refreshViews: () => void;
}

export function buildFontsPage(el: HTMLElement, host: FontsPageHost): void {
  const { app, settings } = host;

  // ── Where ──
  const folderRow = new Setting(el).setName(t('fonts.folder')).setDesc(t('fonts.folder_desc'));
  folderPickerRow(folderRow, {
    app,
    focusKey: 'folder:fontsFolder',
    current: () => settings.fontsFolder ?? '',
    extra: { '': t('fonts.folder_default', { folder: DEFAULT_FONTS_FOLDER }) },
    onPick: (path) => void changeFolder(host, path),
  });
  folderRow.controlEl.addClass('orbis-folder-line');
  folderRow.settingEl.addClass('orbis-line-row');

  new Setting(el)
    .setName(t('fonts.import'))
    .setDesc(t('fonts.import_desc'))
    .addButton((b) =>
      b.setButtonText(t('fonts.import_choose')).onClick(() =>
        importFonts(
          app,
          () => settings.fontsFolder,
          el.doc,
          () => {
            host.refreshViews();
            host.redraw();
          }
        )
      )
    );

  // ── The vault's fonts ──
  // The empty note is the heading's own description, so it lines up with the rows' text rather than with their boxes.
  const fonts = knownFonts();
  const vaultHeading = new Setting(el).setName(t('fonts.in_vault')).setHeading();
  if (fonts.length === 0) vaultHeading.setDesc(t('fonts.none_in_vault'));
  for (const font of fonts) vaultFontRow(el, host, font);

  // ── The system's ──
  new Setting(el).setName(t('fonts.system')).setHeading();
  const system = SYSTEM_FONTS.map((option) => ({ ...option, name: t(option.labelKey) })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const option of system) {
    const status = systemFontStatus(option.value, el.doc);
    const row = new Setting(el).setName(option.name).setDesc(withSample(t(STATUS_TEXT[status]), option.value));
    shownToggle(row, host, option.value);
  }

  // ── To download ──
  // Last, since it is mostly used once, when setting up: the two lists a reader keeps coming back to come first.
  // Each font not in the vault, or not all of it, with what it is for and its size. A download lands in the fonts
  // folder, so the font is then in the vault's section only. See `font-downloads.ts`.
  const toGet = FONT_PACKAGES.filter((pkg) => !packageInstalled(pkg, fonts));
  new Setting(el)
    .setName(t('fonts.downloads'))
    .setHeading()
    .setDesc(toGet.length ? t('fonts.downloads_desc') : t('fonts.downloads_all'));
  for (const pkg of toGet) {
    new Setting(el)
      .setName(pkg.name)
      .setDesc(t('fonts.download_desc', { purpose: t(pkg.purpose), size: packageMegabytes(pkg.id) }))
      .addButton((b) =>
        b.setButtonText(t('fonts.download')).onClick(async () => {
          b.setDisabled(true).setButtonText(t('fonts.downloading'));
          try {
            await downloadFontPackage(app, pkg.id, fontsFolderOf(settings.fontsFolder));
            if (pkg.pdf) await forgetLegacyPdfFonts(app, settings.fontsFolder);
            new Notice(t('fonts.downloaded', { name: pkg.name }));
          } catch (err) {
            // A wrong file is not a connection problem, and trying again would fetch it again — see `WrongFileError`.
            new Notice(downloadFailedMessage(err));
          }
          host.refreshViews();
          host.redraw();
        })
      );
  }

  // A look at the folder in the background: a font synced in since the page opened shows on the next draw.
  void scanFonts().then((now) => {
    if (JSON.stringify(now) !== JSON.stringify(fonts) && el.isConnected) host.redraw();
  });
}

/** What the Fonts page says about a system font on this device. */
const STATUS_TEXT: Record<SystemFontStatus, Parameters<typeof t>[0]> = {
  here: 'fonts.on_this_device',
  missing: 'fonts.not_on_this_device',
  serif: 'fonts.same_as_serif',
  'sans-serif': 'fonts.same_as_sans',
};

/**
 * A row's description, with a line of sample text in the font under it.
 *
 * **The sample, not the name, is drawn in the font.** A name in its own typeface is unreadable in a symbol or
 * decorative font, makes the rows uneven, and asks a reader who chose a font for its readability to read the list in
 * every other font. The name stays in Obsidian's font, like every other setting; the sample shows what the font
 * looks like, and only the sample suffers if the font cannot draw it.
 */
function withSample(text: string, value: string, vaultFont = false): DocumentFragment {
  return createFragment((frag) => {
    frag.appendText(text);
    const sample = frag.createDiv({ cls: 'orbis-font-sample', text: t('fonts.sample') });
    const apply = () => sample.style.setProperty('font-family', value);
    // A vault font has to be added to the Settings window's document, which the sample is only in once the page is
    // shown — see `useFontFor`.
    if (vaultFont) void useFontFor(sample, value).then(apply);
    else apply();
  });
}

/** One family in the vault: its name, which faces it has, a sample, its switch, and Delete. */
function vaultFontRow(el: HTMLElement, host: FontsPageHost, font: VaultFont): void {
  const slots = slotsOf(font);
  const has = FACE_SLOTS.filter((s) => slots[s]);
  // The faces it has, and nothing about those it lacks: the guide says how a missing face is drawn.
  // DejaVu's rows say what it is for here, and only here: the Font lists say nothing.
  const desc = packageOf(font.family)?.pdf ? t('fonts.pdf_note', { faces: faceNames(has) }) : faceNames(has);
  const value = vaultFontValue(font.family);
  const row = new Setting(el).setName(font.family).setDesc(withSample(desc, value, true));
  // Delete before the switch, so every switch on the page lines up at the right edge, as on the system fonts' rows.
  row.addExtraButton((b) =>
    b
      .setIcon('trash-2')
      .setTooltip(t('fonts.delete', { name: font.family }))
      .onClick(() => void deleteFont(host, font))
  );
  shownToggle(row, host, value);
}

/** The switch that puts a font in the Font list or leaves it out. */
function shownToggle(row: Setting, host: FontsPageHost, value: string): void {
  row.addToggle((tog) =>
    tog
      .setTooltip(t('fonts.show_in_list'))
      .setValue(!host.settings.hiddenFonts.includes(value))
      .onChange(async (on) => {
        const hidden = new Set(host.settings.hiddenFonts);
        if (on) hidden.delete(value);
        else hidden.add(value);
        host.settings.hiddenFonts = [...hidden];
        await host.save();
        host.refreshViews();
      })
  );
}

/**
 * Point the setting at a new folder, and take the fonts with it.
 *
 * Only this device moves anything: the others receive the new setting and the moved files through sync, and a
 * folder that is already empty there has nothing to move. See `moveFontsFolder`.
 */
async function changeFolder(host: FontsPageHost, path: string): Promise<void> {
  const from = fontsFolderOf(host.settings.fontsFolder);
  const to = fontsFolderOf(path);
  if (moveProblem(from, to)) {
    new Notice(t('fonts.move_inside', { from, to }));
    host.redraw();
    return;
  }
  host.settings.fontsFolder = path;
  await host.save();
  if (from !== to) {
    const { moved, skipped, failed } = await moveFontsFolder(host.app, from, to);
    forgetFontFiles();
    await scanFonts();
    host.refreshViews();
    if (moved > 0) new Notice(moved === 1 ? t('fonts.moved_one', { to }) : t('fonts.moved', { count: moved, to }));
    if (skipped > 0) {
      new Notice(
        skipped === 1 ? t('fonts.move_skipped_one', { from }) : t('fonts.move_skipped', { count: skipped, from })
      );
    }
    if (failed > 0) {
      new Notice(failed === 1 ? t('fonts.move_failed_one', { from }) : t('fonts.move_failed', { count: failed, from }));
    }
  }
  host.redraw();
}

/** Move a family's files to the trash, after asking. See `deleteFontFiles` for what goes with them. */
async function deleteFont(host: FontsPageHost, font: VaultFont): Promise<void> {
  const ok = await askToConfirm(host.app, {
    title: t('fonts.delete_title', { name: font.family }),
    // DejaVu's families say what deleting one costs the PDF export, which needs all seven of its files.
    message: t(packageOf(font.family)?.pdf ? 'fonts.delete_message_pdf' : 'fonts.delete_message', {
      name: font.family,
    }),
    confirmText: t('fonts.delete_confirm'),
  });
  if (!ok) return;
  await deleteFontFiles(host.app, fontsFolderOf(host.settings.fontsFolder), font);
  forgetFontFiles();
  await scanFonts();
  host.refreshViews();
  host.redraw();
}
