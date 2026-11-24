// Character, word and paragraph spacing: three sliders on the Spacing tab's More page and in Settings →
// Appearance, each in percent of the font size, where 0 leaves the book's own spacing.
//
// **Why these three.** With line spacing they are the four adjustments WCAG 1.4.12 (Text Spacing) names: letter
// spacing to 0.12 times the font size, word spacing to 0.16, paragraph spacing to 2, line height to 1.5. Each range
// reaches past its WCAG figure. Kindle's Layout tab and Apple Books' Customize sliders offer the same three.
//
// **0 is the book's.** A book can set its own spacing, and most set none; 0 adds no rule, so whatever the book does
// stands, as Follow the book does for alignment and hyphenation. Any other value replaces it on body text.

import type { TranslationKey } from './i18n/en';
import { BODY_TEXT, KEEP_FONT } from './reader/body-text';

export const STORAGE_KEY_LETTER_SPACING = 'orbis-letter-spacing';
export const STORAGE_KEY_WORD_SPACING = 'orbis-word-spacing';
export const STORAGE_KEY_PARAGRAPH_SPACING = 'orbis-paragraph-spacing';

export interface TextSpacing {
  /** Extra space between characters, in percent of the font size. */
  letterSpacing: number;
  /** Extra space between words, in percent of the font size. */
  wordSpacing: number;
  /** Space between paragraphs, in percent of the font size. */
  paragraphSpacing: number;
}

/** Each setting's display-settings name, its storage key and its range. Every range starts at 0, the book's. */
export const TEXT_SPACING = {
  letterSpacing: { key: STORAGE_KEY_LETTER_SPACING, max: 25 },
  wordSpacing: { key: STORAGE_KEY_WORD_SPACING, max: 50 },
  paragraphSpacing: { key: STORAGE_KEY_PARAGRAPH_SPACING, max: 200 },
} as const satisfies Record<keyof TextSpacing, { key: string; max: number }>;

/** Each setting's name, on the display style bar's More page and in Settings → Appearance. */
export const SPACING_LABELS: Record<keyof TextSpacing, TranslationKey> = {
  letterSpacing: 'appearance_page.character_spacing',
  wordSpacing: 'appearance_page.word_spacing',
  paragraphSpacing: 'appearance_page.paragraph_spacing',
};

/** What each does, as Settings → Appearance describes it. */
export const SPACING_DESCRIPTIONS: Record<keyof TextSpacing, TranslationKey> = {
  letterSpacing: 'appearance_page.character_spacing_desc',
  wordSpacing: 'appearance_page.word_spacing_desc',
  paragraphSpacing: 'appearance_page.paragraph_spacing_desc',
};

/** The book's spacing, which every new display style and every style saved before these settings starts on. */
export const TEXT_SPACING_DEFAULTS: TextSpacing = { letterSpacing: 0, wordSpacing: 0, paragraphSpacing: 0 };

/** A stored value as a whole percentage inside `name`'s range; anything missing or unreadable reads as the book's. */
export function parseSpacing(name: keyof TextSpacing, v: string | number | null | undefined): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(v ?? '');
  if (!Number.isFinite(n)) return 0;
  return Math.min(TEXT_SPACING[name].max, Math.max(0, Math.round(n)));
}

/** The three spacings as stored, each read as the book's when missing — see `parseSpacing`. */
export function readSpacing(ls: (key: string) => string | null): TextSpacing {
  const read = (name: keyof TextSpacing) => parseSpacing(name, ls(TEXT_SPACING[name].key));
  return {
    letterSpacing: read('letterSpacing'),
    wordSpacing: read('wordSpacing'),
    paragraphSpacing: read('paragraphSpacing'),
  };
}

/** A display style's three spacings as the storage keys hold them — see `displayStyleEntries`. */
export function spacingEntries(settings: Partial<TextSpacing>): [string, string][] {
  return (Object.keys(TEXT_SPACING) as (keyof TextSpacing)[]).map((name) => [
    TEXT_SPACING[name].key,
    String(parseSpacing(name, settings[name])),
  ]);
}

/** Each setting's name to its storage key, as the reader's `saveSetting` maps the values it saves. */
export function textSpacingKeys(): Record<keyof TextSpacing, string> {
  return {
    letterSpacing: STORAGE_KEY_LETTER_SPACING,
    wordSpacing: STORAGE_KEY_WORD_SPACING,
    paragraphSpacing: STORAGE_KEY_PARAGRAPH_SPACING,
  };
}

/** Which setting a storage key belongs to, or undefined for any other key. */
export function spacingForKey(key: string): keyof TextSpacing | undefined {
  return (Object.keys(TEXT_SPACING) as (keyof TextSpacing)[]).find((name) => TEXT_SPACING[name].key === key);
}

/**
 * Scripts whose letters join, which character spacing would pull apart: Arabic and the languages written in it,
 * Syriac, N'Ko and Mongolian. CSS Text asks a browser not to space them, and not every one obeys, so they are left
 * out by language.
 */
const JOINED_LANGUAGES = ['ar', 'fa', 'ur', 'ps', 'sd', 'ug', 'ckb', 'ks', 'syr', 'nqo', 'mn-Mong'];

const JOINED = JOINED_LANGUAGES.map((lang) => `:lang(${lang})`).join(', ');

/** Code inside a paragraph, and text in the fonts `keepsOwnFont` keeps. */
const CODE = `code, kbd, samp, tt, pre, .${KEEP_FONT}`;

/**
 * The rules that set `spacing` in a book's document, none for a value of 0.
 *
 * **On body text, as line spacing is** (`buildBookCss`): the paragraphs `tagBodyText` marks, so a centered title, a
 * heading or a block of code keeps the book's. Words and characters inherit into the paragraph's spans, except code and
 * (for characters) a joined script, which start from normal spacing again: in `:where`, so a book's own rule for them
 * wins. Paragraph spacing goes on
 * paragraphs only, `p` and the `div`s some books use for them, as a margin above and below that collapses to one gap
 * between two; a list item or a table cell keeps its own.
 */
export function textSpacingCss(spacing: TextSpacing): string[] {
  const em = (percent: number) => `${percent / 100}em`;
  const lines: string[] = [];
  if (spacing.letterSpacing) {
    lines.push(
      `.${BODY_TEXT}:not(${JOINED}) { letter-spacing: ${em(spacing.letterSpacing)} !important; }`,
      `:where(.${BODY_TEXT}:not(${JOINED})) :where(${CODE}, ${JOINED}) { letter-spacing: normal; }`
    );
  }
  if (spacing.wordSpacing) {
    lines.push(
      `.${BODY_TEXT} { word-spacing: ${em(spacing.wordSpacing)} !important; }`,
      `:where(.${BODY_TEXT}) :where(${CODE}) { word-spacing: normal; }`
    );
  }
  if (spacing.paragraphSpacing) {
    const gap = em(spacing.paragraphSpacing);
    lines.push(`p.${BODY_TEXT}, div.${BODY_TEXT} { margin-top: ${gap} !important; margin-bottom: ${gap} !important; }`);
  }
  return lines;
}
