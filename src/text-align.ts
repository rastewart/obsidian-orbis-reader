// Text alignment's three answers — follow the book, left, justified — and carrying styles across from the yes/no.

import type { App } from 'obsidian';
import type { TranslationKey } from './i18n/en';

/** This device's live alignment. */
export const STORAGE_KEY_TEXT_ALIGN = 'orbis-text-align';
/** The yes/no this replaced — read once by `migrateTextAlignStorage`, then removed. */
const LEGACY_STORAGE_KEY_JUSTIFY = 'orbis-justify';

/**
 * How body text lines up: as the book sets it, left-aligned, or justified.
 *
 * **Three answers, not a yes/no.** Most books justify their own text, so a "Justify: off" that only stopped adding
 * justification would do nothing in them. The book's choice is an answer of its own, the default, the same shape as the
 * font's "use book fonts"; Left and Justified override it, on body text only (`body-text.ts`).
 */
export type TextAlign = 'book' | 'left' | 'justify';

const TEXT_ALIGNS: readonly TextAlign[] = ['book', 'left', 'justify'];

/** Each alignment by the name the Alignment dropdown gives it. */
export const TEXT_ALIGN_LABELS: Record<TextAlign, TranslationKey> = {
  book: 'appearance_page.text_align_book',
  left: 'appearance_page.text_align_left',
  justify: 'appearance_page.text_align_justify',
};

/**
 * A style's settings as they are now, from however they were written: `justifyText: true` was Justified, and `false`
 * was — in practice, since it added no rule — the book's. Idempotent, and returns whether anything changed.
 */
export function migrateStyleTextAlign(settings: Record<string, unknown>): boolean {
  const had = 'justifyText' in settings;
  if (!TEXT_ALIGNS.includes(settings.textAlign as TextAlign)) {
    settings.textAlign = settings.justifyText === true ? 'justify' : 'book';
  }
  delete settings.justifyText;
  return had;
}

/** The same carry for this device's live value, once: `orbis-justify` → `orbis-text-align`. */
export function migrateTextAlignStorage(app: App): void {
  const legacy = app.loadLocalStorage(LEGACY_STORAGE_KEY_JUSTIFY) as string | null;
  if (legacy === null) return;
  if (!TEXT_ALIGNS.includes(app.loadLocalStorage(STORAGE_KEY_TEXT_ALIGN) as TextAlign)) {
    app.saveLocalStorage(STORAGE_KEY_TEXT_ALIGN, legacy === 'true' ? 'justify' : 'book');
  }
  app.saveLocalStorage(LEGACY_STORAGE_KEY_JUSTIFY, null);
}

/** The alignment after `now`, in the order the Alignment dropdown lists them, wrapping round — see **Cycle text alignment**. */
export function nextTextAlign(now: TextAlign): TextAlign {
  return TEXT_ALIGNS[(TEXT_ALIGNS.indexOf(now) + 1) % TEXT_ALIGNS.length];
}

/** A stored value as an alignment, anything unrecognised reading as the book's. */
export function parseTextAlign(v: string | null | undefined): TextAlign {
  return TEXT_ALIGNS.includes(v as TextAlign) ? (v as TextAlign) : 'book';
}

/**
 * Every place alignment is stored, carried across at load: the named styles (synced in `data.json`) and this
 * device's live value. In place and idempotent — styles sync across devices, so nothing here keys off a version a
 * device still on the old build could disagree about. Returns whether a named style changed, so the caller saves.
 */
export function migrateTextAlign(app: App, styles: readonly { settings: object }[]): boolean {
  const changed = styles.map((s) => migrateStyleTextAlign(s.settings as Record<string, unknown>)).some(Boolean);
  migrateTextAlignStorage(app);
  return changed;
}
