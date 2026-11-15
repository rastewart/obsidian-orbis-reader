// A book-shaped thing for a book with no cover art, drawn in the DOM.
//
// **One definition for three surfaces** — the Library's tile, the reading-data view and the full-screen player —
// so they cannot disagree. The look is a hue taken from the title, a gradient, white type ranged left, title from
// the top and author from the bottom, and `cover-render.ts` draws the same thing to a JPEG so it reaches Obsidian's
// own surfaces. A gray box with centered text reads as a gap where a cover should be rather than as a cover.
//
// So this is the DOM half, and it is deliberately the same recipe the canvas half uses — `tileHue`, the same two
// gradient stops, the same white — so a shelf of generated covers and a generated cover FILE look like one thing.
// Change either and change both; the values are named in `cover-render.ts` too.
//
// It stays a rendered element rather than a generated image at these call sites: caching a placeholder into a
// book's data would block a real cover from ever being saved (see `TtsController.showCoverFallback`).

import { tileHue } from './tile';

/**
 * Fill `host` with a generated cover for this title.
 *
 * `host` owns the footprint — the Library's tile is 2:3, the player's is bounded by the viewport, the data view's
 * is 90px wide — and this fills whatever it is given. Existing children are cleared, so a caller can swap a
 * broken `<img>` for this without tidying up first.
 */
export function renderGeneratedCover(host: HTMLElement, title: string, author?: string): void {
  host.empty();
  /**
   * **A child that fills the host, never the host itself.** The artwork rules carry `width: 100%; height: 100%`,
   * and put on the host they beat its own sizing — same specificity, later in the stylesheet — so the reading-data
   * header's 90px box and the player's `max-width` would be overridden and the cover would fill the pane.
   *
   * The host also gets a marker class, because a box sized for an image has no height to give a div: the artwork
   * has no intrinsic size, so each footprint states the 2:3 proportions under that class.
   */
  host.addClass('orbis-has-generated-cover');
  const art = host.createDiv({ cls: 'orbis-generated-cover' });
  art.setCssProps({ '--orbis-tile-hue': String(tileHue(title)) });
  art.createDiv({ cls: 'orbis-generated-cover-title', text: title });
  if (author) art.createDiv({ cls: 'orbis-generated-cover-author', text: author });
}
