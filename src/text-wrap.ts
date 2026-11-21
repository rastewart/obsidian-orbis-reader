// Ordinary line breaking for body text on iPad and iPhone, where WebKit's `text-wrap: pretty` breaks paged text badly.
//
// **What the book asks for.** Some publishers set `text-wrap: pretty` on `body`. Chromium (Obsidian on
// computers and Android) reads it as "do not end a paragraph on one short word" and adjusts only the last few lines.
// WebKit (Obsidian on iOS and iPadOS) plans the breaks of the whole paragraph to even out its right edge, as if it
// were one unbroken block. A paged reader cuts paragraphs across pages, so a break that suits the paragraph lands on a
// page's last line and reads as a mistake: "…feel ashamed. He" / "was", with room on that line for five more words,
// on an iPad mini. With hyphenation off it has fewer places to break and does it more.
//
// **Only there, and only the style.** `text-wrap-style: auto` is ordinary greedy wrapping; `text-wrap-mode` — whether
// a line wraps at all — stays the book's, so a `nowrap` it sets is kept. Body text only (`tagBodyText`), as text
// alignment is: a centered heading the book balances keeps its balance. Chromium keeps the book's `pretty`, which
// does there what its name says.
//
// **No setting.** It is not a preference about how text looks but a way round how one engine renders a request in
// a paged layout; both engines' results then agree.

/** The rule for a book's document, or none where the engine's `pretty` is the paragraph-end kind. */
export function textWrapCss(webkit: boolean, bodyText: string): string | null {
  return webkit ? `.${bodyText} { text-wrap-style: auto !important; }` : null;
}
