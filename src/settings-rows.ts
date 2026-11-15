// Small pieces every settings page uses, in a file none of them owns.
//
// The note-styles page and the export pages both draw template rows, and both the display-styles page and the tab
// print a page's name. In `OrbisSettings.ts` they would have to be imported back OUT of it, which closes an import
// cycle — the exact fault the reader's collaborators are built to avoid.

import type { App } from 'obsidian';
import { Setting } from 'obsidian';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { logToLibrary } from './reader/DebugLog';
import { createCollapsibleNote } from './ui-utils';

/**
 * The pages other code finds by name — `openSettingsPage` navigates by the title a page shows, so a caller reads
 * the key from here rather than repeating it.
 *
 * **One list.** `satisfies` keeps the values checked as translation keys without a second copy of the names, and
 * every caller names a page by reading a property off this object.
 */
export const PAGE_I18N_KEYS = {
  Listening: 'settings_pages.listening',
  Lookup: 'settings_pages.lookup',
  Toolbar: 'settings_pages.toolbar',
  Devices: 'settings_pages.devices',
} as const satisfies Record<string, TranslationKey>;

/**
 * A row of placeholder chips that insert themselves into a template field, with an optional Reset beside them.
 *
 * **A line INSIDE the template's own row, and the chips are BUTTONS.** Loose markup between rows cannot be tabbed to
 * in a settings page at all (Obsidian navigates `.setting-item` rows); a `<code>` with a click listener has no tab
 * stop and no Enter; and a row of its own makes a template and the tokens that go into it two gray boxes for one
 * activity. In settings, a control has to be a control, it has to be in a row, and the row has to be the one the
 * reader is working in.
 */
export function placeholderChips(
  parent: HTMLElement,
  opts: {
    label: string;
    chips: ReadonlyArray<{ token: string; tip?: string }>;
    chipCls: string;
    insert: (token: string) => void;
    reset?: { label: string; onClick: () => void };
    /** Longer per-token text where a chip's tooltip is not enough — the line templates, whose tokens are compound. */
    help?: ReadonlyArray<{ label: string; text: string }>;
    /** One more line inside the fold, for something true of the set rather than of a token. */
    note?: string;
  }
): HTMLElement {
  const line = parent.createDiv({ cls: 'orbis-chip-line' });
  line.createSpan({ text: opts.label, cls: 'orbis-chip-line-label' });
  for (const { token, tip } of opts.chips) {
    const chip = line.createEl('button', { text: token, cls: opts.chipCls });
    if (tip) chip.setAttribute('aria-label', tip);
    chip.addEventListener('click', () => opts.insert(token));
  }
  if (opts.reset) {
    const btn = line.createEl('button', { text: opts.reset.label, cls: 'orbis-reset-chip-btn' });
    btn.addEventListener('click', opts.reset.onClick);
  }
  /**
   * **The fold comes from the same list as the chips**, so a template cannot offer a token its own help omits — and
   * every template row gets the fold. A chip can show a token's name and nothing else: no name conveys that
   * `{{mark}}` is a badge, a name, a colon AND a trailing space.
   */
  const help = opts.help ?? opts.chips.filter((c) => c.tip).map((c) => ({ label: c.token, text: c.tip as string }));
  if (help.length > 0) {
    const details = createCollapsibleNote(parent, t('notes_styles_page.placeholder_help'), help);
    if (opts.note) details.createDiv({ cls: 'orbis-note-more', text: opts.note });
  }
  return line;
}

/** A template row: the field, its chips and its help, in one `Setting` — see `placeholderChips`. */
export function templateRow(parent: HTMLElement, name: string, desc?: string): Setting {
  const row = new Setting(parent).setName(name);
  if (desc) row.setDesc(desc);
  row.settingEl.addClass('orbis-setting-stacked');
  row.controlEl.addClass('orbis-stacked-column');
  return row;
}

/** What each line-template placeholder contains. Keyed by the token itself so the fold in the note-style
 *  editor is generated from the same array that generates the chips. */
export const PLACEHOLDER_HELP: Record<string, TranslationKey> = {
  '{{mark}}': 'notes_styles_page.ph_mark',
  '{{mark_badge}}': 'notes_styles_page.ph_mark_badge',
  '{{mark_name}}': 'notes_styles_page.ph_mark_name',
  '{{selection}}': 'notes_styles_page.ph_selection',
  '{{selection_block}}': 'notes_styles_page.ph_selection_block',
  '{{note_text}}': 'notes_styles_page.ph_note_text',
  '{{link}}': 'notes_styles_page.ph_link',
  '{{loc}}': 'notes_styles_page.ph_loc',
  '{{chapter}}': 'notes_styles_page.ph_chapter',
  '{{date}}': 'notes_styles_page.ph_date',
  '{{kind}}': 'notes_styles_page.ph_kind',
};

/** Settings diagnostics — under the `settings` pill, not `library`, which is about library repaints. */
export function logSettings(host: { app: App }, msg: string): void {
  logToLibrary(host, `settings: ${msg}`, 'settings');
}
