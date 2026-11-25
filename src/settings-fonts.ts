// The Fonts page: where fonts are kept, importing them, and which ones the Font list offers.
//
// Its own file, like the display styles page, so the settings tab only has to say where the page goes. See
// docs/design/fonts.md.

import { type App, Notice, Setting, TFile, TFolder } from 'obsidian';
import { askToConfirm } from './ConfirmModal';
import { faceNames, importFonts } from './FontImportModal';
import { folderPickerRow } from './folder-picker';
import { FACE_SLOTS } from './font-file';
import {
  DEFAULT_FONTS_FOLDER,
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
  const desc = faceNames(has);
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
    const { moved, skipped } = await moveFontsFolder(host.app, from, to);
    forgetFontFiles();
    await scanFonts();
    host.refreshViews();
    if (moved > 0) new Notice(moved === 1 ? t('fonts.moved_one', { to }) : t('fonts.moved', { count: moved, to }));
    if (skipped > 0) {
      new Notice(
        skipped === 1 ? t('fonts.move_skipped_one', { from }) : t('fonts.move_skipped', { count: skipped, from })
      );
    }
  }
  host.redraw();
}

/**
 * Move a family's files to the trash, after asking.
 *
 * A folder holding only this family goes as a whole, so its licence file goes with it; files of the family elsewhere
 * go one at a time. The trash is Obsidian's, so the reader's own trash setting decides where they land.
 */
async function deleteFont(host: FontsPageHost, font: VaultFont): Promise<void> {
  const ok = await askToConfirm(host.app, {
    title: t('fonts.delete_title', { name: font.family }),
    message: t('fonts.delete_message', { name: font.family }),
    confirmText: t('fonts.delete_confirm'),
  });
  if (!ok) return;
  const { app } = host;
  const paths = new Set(font.faces.map((f) => f.path));
  const folders = new Set<TFolder>();
  for (const path of paths) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile && file.parent) folders.add(file.parent);
  }
  const root = fontsFolderOf(host.settings.fontsFolder);
  for (const folder of folders) {
    const fontsHere = folder.children.filter((c) => c instanceof TFile && ['ttf', 'otf'].includes(c.extension));
    const onlyThisFamily = fontsHere.every((c) => paths.has(c.path));
    if (folder.path !== root && onlyThisFamily) {
      await app.fileManager.trashFile(folder);
      for (const c of fontsHere) paths.delete(c.path);
    }
  }
  for (const path of paths) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file) await app.fileManager.trashFile(file);
  }
  forgetFontFiles();
  await scanFonts();
  host.refreshViews();
  host.redraw();
}
