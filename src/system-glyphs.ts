// The glyphs that say which system a dialog belongs to.
//
// **A badge, not decoration.** A dialog wears one of these only when the same glyph already identifies its system
// somewhere a reader has been — a ribbon icon, a toolbar button, the player. That is what makes it worth looking
// at: the headphones over *Voice and source* is the headphones on the listen bar, so it answers "what am I working
// with" before the title does. A glyph on every dialog would distinguish nothing and would need inventing for
// things like *New folder*, which teaches a symbol that appears nowhere else.
//
// **So the rule is: a system badges its dialogs, a one-off dialog wears nothing.** New folder, Rename, and every
// confirmation stay bare.
//
// One system still draws its own glyph beside the code that owns it — `glossarySvg` (pronunciation-editor) —
// because it has one reader. `annotationsSvg` lives HERE because seven dialogs wear it, and importing a large modal
// for one pure function is how the import cycle this file exists to avoid gets built. `HEADPHONES_SVG` lives here for
// the same reason: *Listen needs a voice* wears it and is opened BY `TtsController`, so taking the glyph from there
// would be exactly that cycle.
//
// `LIBRARY_SVG` and `BOOK_SOURCES_SVG` are the ones whose identity is a RIBBON icon rather than a drawing of our
// own, which is why they need a copy in SVG: `setSvgIcon` takes markup, and the ribbon takes a Lucide name.
//
// **Copied from Lucide deliberately, and they must not drift.** `main.ts` registers the ribbon with the name;
// these are the same two icons as markup. If either ribbon icon changes, change it here — a badge that does not
// match the icon a reader pressed to get here is worse than no badge, which is the argument `PANEL_TAB_SVGS`
// makes about the toolbar's glyphs.

/**
 * Headphones — the listen bar's button that enters the full-screen player, and the badge of every Listen dialog:
 * Recordings and mixes, Voice and source, Listen needs a voice, and the Listening settings page.
 */
export const HEADPHONES_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z"/></svg>';

/** Lucide `library` — the Library ribbon icon, as markup. See `applyLibraryEnabled`. */
export const LIBRARY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"' +
  ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>';

/** Lucide `download-cloud` — the Book sources ribbon icon, as markup. See `applyBookSourcesEnabled`. */
export const BOOK_SOURCES_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"' +
  ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/>' +
  '<path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>';

/**
 * Conversions — one document becomes another.
 *
 * **Two pages side by side with the arrow ABOVE them, and the FILL is what says they differ.** Solid on the
 * left, outline on the right: the book you have, and the same content in another format. Nothing else at this size
 * can say "another format" — there is no glyph for Markdown or PDF, and the label names those anyway. What the
 * badge has to say is only that a thing came in and a different thing went out, and a filled shape beside an empty
 * one says it instantly.
 *
 * **The arrow is above the pages, not between them, and that is what makes it legible.** A 24-unit box holds about
 * three features at 16px; two pages and an arrow is already three, so an arrow squeezed into the gap between them
 * gets roughly three pixels and vanishes — whatever its proportions, because the shortage is in the composition.
 * Lifting it into the space above lets the pages have the full width and the arrow a real shaft and head. The pages
 * are then SHORT (11 units, not 16) so there is clear air under the arrow head: at full height the head's lower
 * point and the right page's top edge touch once both carry a 2-unit stroke.
 *
 * **Not `external-link`.** A box with an arrow escaping says the thing left.
 * A conversion is the same content in another form and it is still here — and two documents make that plain in a
 * way a single document cannot. Not a downward arrow either: Book sources owns `download-cloud`, and two
 * badges whose arrows point the same way would be worse than none.
 *
 * **It has to FILL the box, and that is the constraint everything else bends to.** At 10 of 24 vertical units it
 * draws visibly smaller than every Lucide icon beside it in the ⋯ menu — they span about 18 — so it reads as a
 * shrunken smudge and the arrow, having the least room of the three elements, disappears entirely. Check a new
 * glyph against a real Lucide icon at the same size; matching viewBox is not matching optical size.
 *
 * **Everything here was rendered rather than reasoned about**, and three shapes fail. A page with a channel cut
 * through it — one document, content passing out the far side — has the channel close up below 24px. Narrowing
 * the pages to buy the arrow more room takes the outlined one under two units of interior, at which point it
 * reads as solid and the fill distinction, which is the whole idea, is gone. And a bare chevron in place of the
 * arrow is ambiguous at 16px: the shaft is what makes it a direction.
 */
export const CONVERSION_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"' +
  ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="1.5" y="11" width="8.5" height="11" rx="1" fill="currentColor" stroke="none"/>' +
  '<rect x="14" y="11" width="8.5" height="11" rx="1"/>' +
  '<path d="M6 4h12"/><path d="m15.5 1.5 2.5 2.5-2.5 2.5"/></svg>';

/**
 * The one glyph for annotation presets, everywhere it can be reached: the reader toolbar, the foot of the
 * mark bar's list, the listening view, and this dialog's own title. Repeating it is what makes it learnable.
 *
 * A squiggle-underlined "Aa", because that is already the vocabulary of marks everywhere else in the
 * plugin — the mark bar's chips, the manager's rows and the note popup's badge are all an "Aa" wearing the
 * mark's formatting. An icon that is a monochrome echo of those chips says "this opens the thing they come
 * from" by recognition rather than by decoding. An abstract frame-and-two-lines would have to be
 * learned, and at 14px is hard to tell from the note-icons pencil beside it.
 *
 * The squiggle is doing specific work and is not decoration. A bare "Aa" is THE typography icon (Apple
 * Books, Kindle, Obsidian's own font controls) and this glyph sits two slots from the display-style
 * button, which is exactly the typography menu. A STRAIGHT rule underneath would not have helped — that is
 * the word processor's underline button, the same reading again. A wave is markup vocabulary, and nothing
 * else on the toolbar has that shape.
 *
 * Hand-drawn rather than a Lucide name, for reasons that each ruled one out:
 * - `tags` — Obsidian tags are a first-class vault concept, and note export may one day emit real ones.
 * - `highlighter` — the player's own Highlight button is a highlighter nib, and this glyph appears in that
 *   same view; one glyph meaning two things beats no glyph at all only in the abstract.
 * - `pencil` / `palette` — already the note-icons toggle and the display-style button on this toolbar.
 * - anything built from bare horizontal lines — at 14px that is the hamburger the contents button owns.
 *
 * The letters inherit the UI font rather than naming one, so they match the real chips on every platform.
 * `textLength` pins their width instead of trusting per-platform font metrics: the box is 24 units wide and
 * an SVG root clips, so a font that set "Aa" wider than expected would lose the second letter's edge.
 *
 * Sized by the caller: 14px matches the reader toolbar's other glyphs, the player's actions use 20px. The
 * letters are deliberately large for an icon — at a text size that merely fitted, the glyph read as much
 * smaller than the stroke icons beside it, because a cap height is a fraction of a font size while a
 * stroke icon fills its box. The wave is four shallow humps: it is doing semantic work, not carrying the
 * meaning, so it gets what vertical room is left rather than competing for it.
 */
export function annotationsSvg(size = 14): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    '<text x="12" y="16" text-anchor="middle" textLength="20.5" lengthAdjust="spacingAndGlyphs"' +
    ' font-size="18" font-weight="600" font-family="inherit" fill="currentColor">Aa</text>' +
    '<path d="M2.5 21 q2.375 -3.4 4.75 0 t4.75 0 t4.75 0 t4.75 0" fill="none" stroke="currentColor"' +
    ' stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>'
  );
}

/**
 * The two system marks as menu icons, registered with Obsidian once at load.
 *
 * **Why register rather than name a Lucide icon.** Obsidian's `Menu.setIcon` takes an icon id, not markup, so the
 * ⋯ menu could not wear the badges its dialogs wear. The alternative is to approximate each row with whatever
 * Lucide has, which puts `file-text` on three unrelated rows, `refresh-cw` reading as "sync" on a command that
 * syncs nothing, and `download` on something writing INTO the vault.
 *
 * **`addIcon` takes the INNER markup of a 0 0 100 100 box**, so both are the 24-unit drawings scaled by 100/24.
 * Scaling the group scales the stroke with it, which is what keeps the weight matching the Lucide icons beside
 * them — a stroke authored at 2 units in a 24 box and one authored at 8.33 in a 100 box are the same line.
 *
 * Menu icons render on mobile only, so these are invisible on a desktop and have to be checked on a phone.
 */
const SCALE_24_TO_100 = 'transform="scale(4.1667)"';

/** The Annotations mark, for `setIcon('orbis-annotations')`. */
export const ANNOTATIONS_ICON_ID = 'orbis-annotations';

/** The Conversions mark, for `setIcon('orbis-conversion')`. */
export const CONVERSION_ICON_ID = 'orbis-conversion';

/** Register both with Obsidian. Called once from `onload`, before any menu is built. */
export function registerOrbisIcons(addIcon: (id: string, svg: string) => void): void {
  addIcon(
    ANNOTATIONS_ICON_ID,
    `<g ${SCALE_24_TO_100}>` +
      '<text x="12" y="16" text-anchor="middle" textLength="20.5" lengthAdjust="spacingAndGlyphs"' +
      ' font-size="18" font-weight="600" font-family="inherit" fill="currentColor">Aa</text>' +
      '<path d="M2.5 21 q2.375 -3.4 4.75 0 t4.75 0 t4.75 0 t4.75 0" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round"/>' +
      '</g>'
  );
  addIcon(
    CONVERSION_ICON_ID,
    `<g ${SCALE_24_TO_100} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"` +
      ' stroke-linejoin="round">' +
      '<rect x="1.5" y="11" width="8.5" height="11" rx="1" fill="currentColor" stroke="none"/>' +
      '<rect x="14" y="11" width="8.5" height="11" rx="1"/>' +
      '<path d="M6 4h12"/><path d="m15.5 1.5 2.5 2.5-2.5 2.5"/>' +
      '</g>'
  );
}
