// The Theme manager: every theme but the two that match Obsidian, in one ordered list.
//
// Its own module, like the Display styles page, so `OrbisSettings.ts` only links to it. Imperative, because the list
// is `renderReorderList` — the one list every settings page uses — and that draws on a page we own.
//
// See docs/design/reader-themes.md.

import { type App, Setting } from 'obsidian';
import { confirmThen } from './ConfirmModal';
import { t } from './i18n';
import {
  type CustomTheme,
  type ListedTheme,
  listedThemeColors,
  settleThemeList,
  type ThemeColors,
  themeName,
} from './reader-themes';
import type { IOrbisReaderPlugin } from './settings';
import { renderReorderList } from './settings-list';
import { contrastLine, drawThemeSample, fieldsFrom, type ThemeFields, ThemeModal, themeNameTaken } from './ThemeModal';

export interface ThemeManagerHost {
  readonly app: App;
  readonly plugin: IOrbisReaderPlugin;
  /** Redraw this page, after a theme is added, renamed or deleted. */
  renderSettings(): void;
  /** One move persisted, with no repaint — see `persistMove`. */
  persistMove<T>(list: T[], from: number, to: number): void;
}

/**
 * Below the row's name: the sample, kept out of the row's own description so the description stays a sentence. The
 * class lets a narrow list stack the row — see `.orbis-theme-list` in the stylesheet.
 */
const withSample =
  (colors: ThemeColors) =>
  (setting: Setting): void => {
    setting.settingEl.addClass('orbis-theme-row');
    drawThemeSample(setting.infoEl, colors);
  };

/** "Midnight copy", or "Midnight copy 2" when that is taken — a name Save will accept as it stands. */
function copyName(source: string, s: IOrbisReaderPlugin['settings']): string {
  const first = t('themes.copy_name', { name: source });
  if (!themeNameTaken(first, s)) return first;
  for (let n = 2; ; n++) {
    const next = `${first} ${n}`;
    if (!themeNameTaken(next, s)) return next;
  }
}

export function buildThemeManagerPage(el: HTMLElement, host: ThemeManagerHost): void {
  const { plugin } = host;
  // Settled before drawing, so the rows are exactly what the dropdowns list — see `settleThemeList`.
  plugin.settings.readerThemes = settleThemeList(plugin.settings.readerThemes);
  const save = async (): Promise<void> => {
    await plugin.saveSettings();
    plugin.refreshViews();
  };
  const saveAndRedraw = async (): Promise<void> => {
    await save();
    host.renderSettings();
  };

  // What the page is for, on the page — the Look-up page's description-only row, for the reason it gives.
  new Setting(el).setDesc(t('themes.enable_order_make_desc')).settingEl.addClass('orbis-setting-stacked');

  /** A made theme, put into the list: a new one at the end, a copy just after what it copies. */
  const place = (fields: ThemeFields, after?: ListedTheme): void => {
    const list = plugin.settings.readerThemes;
    const made: CustomTheme = { ...fields, id: `theme-${Date.now().toString(36)}`, offered: true, builtin: false };
    const at = after ? list.indexOf(after) + 1 : list.length;
    list.splice(at > 0 ? at : list.length, 0, made);
    void saveAndRedraw();
  };
  const edit = (theme: CustomTheme): void => {
    new ThemeModal(host.app, plugin, theme, (fields) => {
      Object.assign(theme, fields);
      void saveAndRedraw();
    }).open();
  };
  const copy = (entry: ListedTheme): void => {
    const start = fieldsFrom(copyName(themeName(entry), plugin.settings), listedThemeColors(entry));
    new ThemeModal(host.app, plugin, null, (fields) => place(fields, entry), start).open();
  };
  const remove = (theme: CustomTheme): void => {
    const using = plugin.stylesForThisDevice().filter((style) => style.settings.theme === theme.id).length;
    confirmThen(
      host.app,
      {
        title: t('themes.delete_title'),
        message:
          using === 0
            ? t('themes.delete_confirm', { name: theme.name })
            : using === 1
              ? t('themes.delete_confirm_used_one', { name: theme.name })
              : t('themes.delete_confirm_used', { name: theme.name, count: using }),
        confirmText: t('action.delete'),
      },
      () => {
        const list = plugin.settings.readerThemes;
        list.splice(list.indexOf(theme), 1);
        void saveAndRedraw();
      }
    );
  };

  /**
   * **One list, in the dropdowns' order, the web destinations' shape.** Every row has a switch and moves; every row
   * can be copied, which is how a provided theme becomes one of the reader's own to adjust. Only the reader's own can
   * be edited and deleted — a provided row keeps those two slots empty, so the icons line up down the list (see
   * `ReorderAction.hidden`). Nothing locks: the two that match Obsidian are always offered, so switching every theme
   * here off still leaves a dropdown with something in it.
   *
   * Deleting a theme a display style uses is allowed and said: that style then matches Obsidian's light or dark mode,
   * which `resolveThemeId` does by itself, so nothing has to be rewritten.
   */
  const list = renderReorderList(el, {
    heading: t('themes.list'),
    add: {
      label: t('themes.new'),
      run: () => new ThemeModal(host.app, plugin, null, (fields) => place(fields)).open(),
    },
    rows: plugin.settings.readerThemes.map((entry) => {
      const own = entry.builtin ? null : entry;
      return {
        key: entry.id,
        name: themeName(entry),
        desc: own ? contrastLine(own) : undefined,
        decorate: withSample(listedThemeColors(entry)),
        actions: [
          { icon: 'pencil', label: t('themes.edit'), hidden: !own, run: () => own && edit(own) },
          { icon: 'copy', label: t('themes.copy'), run: () => copy(entry) },
          { icon: 'trash', label: t('action.delete'), hidden: !own, run: () => own && remove(own) },
        ],
        openOnTap: own ? () => edit(own) : undefined,
        toggle: {
          value: entry.offered,
          onChange: (on: boolean) => {
            entry.offered = on;
            void save();
          },
        },
      };
    }),
    // The order is the dropdowns' order, so an open book's display menu is told as well as the file.
    move: (from, to) => {
      host.persistMove(plugin.settings.readerThemes, from, to);
      plugin.refreshViews();
    },
  });
  list.addClass('orbis-theme-list');
}
