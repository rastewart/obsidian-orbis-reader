import type { SettingDefinitionItem } from 'obsidian';
import { t } from './i18n';

/**
 * Where the user guide lives: the site that `.github/workflows/docs.yml` publishes from `docs/guide/`. See
 * docs/design/docs-site.md.
 *
 * **One address, stated once**, so every way into the guide from inside the plugin leads to the same place, and the
 * day the site moves is a one-line change.
 */
export const GUIDE_URL = 'https://guide.orbisreader.com/';

/** Open the guide in the system browser — on desktop and mobile alike. */
export function openGuide(): void {
  window.open(GUIDE_URL, '_blank');
}

/**
 * The last row of the settings start page: the plugin's name, its version, and a button that opens the guide.
 *
 * **The guide's button lives on this row**, because it is the row about the plugin itself rather than one of its
 * features — where a reader looks for "about" and "help". A button and not a link in the description: a link in
 * small grey text is easy to miss, and a button is a control the keyboard reaches. Found by searching settings for
 * "help" or "manual" too, which is what someone who is stuck types.
 */
export function aboutRow(name: string, version: string): SettingDefinitionItem {
  return {
    name,
    desc: t('settings.version', { version }),
    aliases: t('settings.guide_aliases')
      .split(',')
      .map((word) => word.trim()),
    render: (setting) => {
      setting.addButton((b) =>
        b
          .setButtonText(t('settings.guide'))
          .setTooltip(t('settings.guide_tooltip'))
          .onClick(() => openGuide())
      );
    },
  };
}
