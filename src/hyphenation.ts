// Hyphenation's three answers — follow the book, on, off — the same shape as text alignment's (`text-align.ts`).

import type { TranslationKey } from './i18n/en';

/** This device's live hyphenation. */
export const STORAGE_KEY_HYPHENATION = 'orbis-hyphenation';

/**
 * Whether words break across lines with a hyphen: as the book sets it, always, or never.
 *
 * **The book's choice is the default.** Many books set `hyphens: auto`, and many put soft hyphens in long words; most
 * set nothing. On turns automatic hyphenation on for body text; Off turns every kind off, soft hyphens included.
 *
 * **Off is also the way round an Android bug.** On Android, selecting the first word of a paragraph that has a
 * hyphenated line draws the selection handles in the wrong place: the start handle where the end one belongs, the end
 * handle at the paragraph's last hyphen. It is the WebView's own drawing — the selection itself is right — and it
 * happens only where a line ends in a hyphen the browser added, so Off is the reader's fix
 * (docs/guide/troubleshooting.md).
 *
 * **On does nothing in Obsidian on Windows and Linux.** Chromium hyphenates with dictionaries that Chrome downloads
 * there and Electron does not ship, so `hyphens: auto` breaks no words; on macOS, iOS and Android the system supplies
 * them. A book's own soft hyphens still work everywhere.
 */
export type Hyphenation = 'book' | 'on' | 'off';

const HYPHENATIONS: readonly Hyphenation[] = ['book', 'on', 'off'];

/** Each answer by the name the Hyphenation dropdown gives it, in the dropdown's order. */
export const HYPHENATION_LABELS: Record<Hyphenation, TranslationKey> = {
  book: 'appearance_page.hyphenation_book',
  on: 'appearance_page.hyphenation_on',
  off: 'appearance_page.hyphenation_off',
};

/** Three long words, which any dictionary that hyphenates English breaks inside a box four letters wide. */
const PROBE_TEXT = 'internationalization characteristically extraordinarily';

/**
 * Whether this device hyphenates words automatically: whether **On** can do anything here.
 *
 * **Measured, not decided by platform.** The same three words in two narrow hidden boxes, one with `hyphens: auto`
 * (styles.css, `.orbis-hyphen-probe`): a device that hyphenates breaks them inside the words, which changes the box's
 * height. Obsidian on Windows and Linux breaks nothing today, but Chromium can there, so a newer Obsidian that ships
 * the dictionaries is right the day it arrives. Under a millisecond, and only when a Hyphenation control is drawn.
 */
export function autoHyphenates(doc: Document): boolean {
  const boxes = [false, true].map((auto) =>
    doc.body.createDiv({
      cls: auto ? 'orbis-hyphen-probe is-auto' : 'orbis-hyphen-probe',
      text: PROBE_TEXT,
      attr: { lang: 'en' },
    })
  );
  const [plain, auto] = boxes.map((box) => box.getBoundingClientRect().height);
  for (const box of boxes) box.remove();
  return plain !== auto;
}

/** A stored value as an answer, anything unrecognised — a style saved before this setting, say — reading as the book's. */
export function parseHyphenation(v: string | null | undefined): Hyphenation {
  return HYPHENATIONS.includes(v as Hyphenation) ? (v as Hyphenation) : 'book';
}

/**
 * The rule that makes `hyphenation` so in a book's document, or none for the book's own.
 *
 * On reaches body text only (`bodyText`, the class `tagBodyText` puts on paragraphs), so a heading is not broken. Off
 * reaches everything: a heading the book hyphenates is a hyphen the reader asked not to see, and `none` also stops
 * the book's soft hyphens breaking a word. `-webkit-hyphens` too, for the WebKit on iOS.
 */
export function hyphenationCss(hyphenation: Hyphenation, bodyText: string): string | null {
  if (hyphenation === 'on') return `.${bodyText} { -webkit-hyphens: auto !important; hyphens: auto !important; }`;
  if (hyphenation === 'off') {
    return 'html, body, body * { -webkit-hyphens: none !important; hyphens: none !important; }';
  }
  return null;
}
