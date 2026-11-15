// Making or editing one of the reader's own themes: a name, three colors, and what they look like together.

import { type App, Notice, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';
import {
  BOOK_LINK,
  type CustomTheme,
  contrastRatio,
  READABLE_CONTRAST,
  settleThemeList,
  type ThemeColors,
  type ThemeSettings,
  themeColors,
  themeName,
} from './reader-themes';
import { type IOrbisReaderPlugin, readCurrentDisplaySettings } from './settings';

/**
 * A line of book text in a theme's colors, with a link in it — what the theme looks like, rather than what it is
 * called.
 */
export function drawThemeSample(parent: HTMLElement, colors: ThemeColors): HTMLElement {
  const sample = parent.createDiv({ cls: 'orbis-theme-sample' });
  sample.setCssProps({
    '--orbis-theme-bg': colors.bg,
    '--orbis-theme-fg': colors.fg,
    // A theme that leaves links to the book shows them as most books do — see `BOOK_LINK`.
    '--orbis-theme-link': colors.link ?? BOOK_LINK,
  });
  sample.appendText(`${t('themes.sample_text')} `);
  sample.createSpan({ cls: 'orbis-theme-sample-link', text: t('themes.sample_link') });
  return sample;
}

/** The two contrast figures, as a row says them: the text's, and the links'. */
export function contrastLine(colors: ThemeColors): string {
  const text = contrastRatio(colors.bg, colors.fg);
  const link = colors.link ? contrastRatio(colors.bg, colors.link) : text;
  const line = t('themes.contrast', { text: text.toFixed(1), link: link.toFixed(1) });
  return Math.min(text, link) < READABLE_CONTRAST ? `${line} · ${t('themes.contrast_low')}` : line;
}

/** What the dialog hands back: the theme's own fields, without its id or its switch. */
export type ThemeFields = Pick<CustomTheme, 'name' | 'bg' | 'fg' | 'link'>;

/**
 * A theme's own fields from a theme's colors. One with no link color of its own leaves links to the book; a made one
 * names one — the blue those links show in most books, so a copy of Light looks like Light, unless the page is dark,
 * where that blue would be unreadable.
 */
export function fieldsFrom(name: string, { bg, fg, link }: ThemeColors): ThemeFields {
  const onDark = contrastRatio(bg, '#ffffff') > contrastRatio(bg, '#000000');
  return { name, bg, fg, link: link ?? (onDark ? '#8fb8f2' : BOOK_LINK) };
}

/**
 * A dialog rather than rows in the list, for the reason `DestinationModal` gives — and because the colors have to be
 * seen together: the sample and the contrast line change as each color does, which a row cannot show.
 *
 * **A new theme starts from the colors being read with**, so making one is adjusting what is already on screen rather
 * than starting from white — unless it is a copy, which starts from what it copies (`start`). Either way nothing
 * exists until Save. Low contrast is said, not refused: it is the reader's page.
 */
export class ThemeModal extends OrbisModal {
  private fields: ThemeFields;

  constructor(
    app: App,
    private readonly plugin: IOrbisReaderPlugin,
    private readonly theme: CustomTheme | null,
    private readonly onConfirm: (fields: ThemeFields) => void,
    start?: ThemeFields
  ) {
    super(app, { compact: true });
    this.fields = theme
      ? { name: theme.name, bg: theme.bg, fg: theme.fg, link: theme.link }
      : { ...(start ?? this.readingWith()) };
  }

  private readingWith(): ThemeFields {
    const live = readCurrentDisplaySettings(this.app).theme;
    return fieldsFrom('', themeColors(live, this.plugin.settings, this.app.workspace.containerEl));
  }

  protected dialogTitle(): string {
    return this.theme ? t('themes.edit') : t('themes.new');
  }

  protected renderDialog(): void {
    const { contentEl } = this;
    this.modalEl.addClass('orbis-form-dialog');

    const name = new Setting(contentEl).setName(t('themes.name'));
    name.settingEl.addClass('orbis-setting-stacked');
    name.addText((txt) => {
      txt.inputEl.addClass('orbis-input-full');
      txt.setValue(this.fields.name).onChange((v) => {
        this.fields.name = v;
      });
      window.setTimeout(() => txt.inputEl.focus(), 50);
    });

    const preview = contentEl.createDiv({ cls: 'orbis-theme-preview' });
    const contrast = contentEl.createDiv({ cls: 'setting-item-description orbis-theme-contrast' });
    const repaint = (): void => {
      preview.empty();
      drawThemeSample(preview, this.fields);
      contrast.setText(contrastLine(this.fields));
    };

    const color = (label: string, key: 'bg' | 'fg' | 'link'): void => {
      new Setting(contentEl).setName(label).addColorPicker((picker) =>
        picker.setValue(this.fields[key]).onChange((value) => {
          this.fields[key] = value;
          repaint();
        })
      );
    };
    color(t('themes.background'), 'bg');
    color(t('themes.text'), 'fg');
    color(t('themes.links'), 'link');
    // The sample last, under the colors that make it — where the eye goes after changing one.
    contentEl.appendChild(preview);
    contentEl.appendChild(contrast);
    repaint();

    const actions = actionRow(this.footer());
    actionButton(actions, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(actions, {
      label: t('action.save'),
      cta: true,
      onClick: () => {
        const trimmed = this.fields.name.trim();
        if (!trimmed) {
          new Notice(t('themes.name_required'));
          return;
        }
        if (this.nameTaken(trimmed)) {
          new Notice(t('themes.name_taken', { name: trimmed }));
          return;
        }
        this.onConfirm({ ...this.fields, name: trimmed });
        this.close();
      },
    });
  }

  /** Two themes of one name would be two identical lines in a dropdown — provided ones included. */
  private nameTaken(name: string): boolean {
    return themeNameTaken(name, this.plugin.settings, this.theme?.id);
  }
}

/** Whether a theme other than `except` is already called `name`, ignoring case. */
export function themeNameTaken(name: string, s: ThemeSettings, except?: string): boolean {
  const lower = name.toLowerCase();
  return settleThemeList(s.readerThemes).some(
    (entry) => entry.id !== except && themeName(entry).toLowerCase() === lower
  );
}
