// A book's own words — a title, a contents label — written into a note as one line of Markdown text.

/** A `<` that could open a tag: before a letter, `/`, `!`, `?`, or `%` (Templater's tag). */
const TAG_OPENER = /<(?=[A-Za-z/!?%])/g;

/**
 * `text` as one line of a note, shown as the book wrote it and never read as markup.
 *
 * **A heading or a list line is still Markdown, and a book chooses its titles.** A contents label holding
 * `<img src="https://…">` became a heading that fetched the picture each time the note was shown, and a line break in a
 * label ended the heading and started whatever followed. So whitespace collapses to single spaces, and three things
 * are escaped: a backslash first, so the book's own `\` cannot cancel the escape after it (`\<img>` would otherwise
 * become `\\<img>`, a shown backslash and a live tag); then `[` and `]`, which every link and picture
 * (`![x](https://…)`) needs; then a `<` that could open a tag. Each shows as the character the book has.
 *
 * **Links to the heading still land.** Obsidian compares a link with a heading after turning every ASCII punctuation
 * mark into a space (`stripHeading`, read from its 1.15 bundle), and GitHub's anchors drop them, so an escape changes
 * neither.
 */
export function bookTextLine(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\[\]]/g, '\\$&')
    .replace(TAG_OPENER, '\\<');
}

/** The same escape for running text, where line breaks are the text's own: see `createTurndownService`. */
export function escapeTagOpeners(text: string): string {
  return text.replace(TAG_OPENER, '\\<');
}
