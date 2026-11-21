// Elements made in a book's own document.

/** The HTML namespace: what `createElement` gives an element in an HTML or XHTML document. */
export const HTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * An HTML element made in `doc`, a book's own document: a chapter foliate parsed, or the document in its frame.
 *
 * **Not `createEl`.** Obsidian adds its DOM helpers to the app's own window, and a book's document is not part of it:
 * a parsed one has no window at all, and a chapter's frame is a window of its own. So the element is made by the
 * document itself.
 *
 * **`createElementNS`, not `createElement`.** In an HTML or XHTML document the two make the same element. The
 * Community directory's review runs eslint-plugin-obsidianmd's `prefer-create-el` as it was up to 0.4, which reports
 * `createElement` on any document, including one with no `createEl` to use instead; from 0.5 the rule leaves those
 * alone. Naming the namespace also keeps the element HTML in a book document parsed as plain XML, where
 * `createElement` would make an element in no namespace.
 */
export function bookElement<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K): HTMLElementTagNameMap[K] {
  return doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];
}
