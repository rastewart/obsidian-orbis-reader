// A book's pictures keep their shape.
//
// **Why.** Calibre writes a book's cover page as an SVG the size of the page, `width="100%" height="100%"`, with the
// picture inside it as an `<image>` and `preserveAspectRatio="none"` on the SVG. `none` tells the browser to stretch
// the picture to fill whatever box the SVG gets, both ways. On a phone, or in two columns, the page is roughly the
// cover's own shape and nobody notices. In one column across a wide pane the page is far wider than tall, and the
// cover is pulled sideways to fill it.
//
// **How.** `none` becomes `xMidYMid meet`, SVG's default: the whole picture, as large as fits, centred. Only for
// SVGs that hold a picture, an `<image>`. An SVG of lines and shapes may be drawn with `none` on purpose, such as a
// rule stretched across the page, and is left as the book drew it. An `<image>` whose own `preserveAspectRatio` is
// `none` gets the same change.
//
// An `<img>` needs nothing here: foliate gives every one `object-fit: contain`, so it keeps its shape whatever box the
// book's CSS gives it.

/** Whether a `preserveAspectRatio` value stretches: its alignment, after an optional `defer`, is `none`. */
export function stretches(value: string | null): boolean {
  const words = (value ?? '').trim().toLowerCase().split(/\s+/);
  return (words[0] === 'defer' ? words[1] : words[0]) === 'none';
}

/**
 * Keep each picture in one section of a book in its own shape: any page foliate loads, a cover page as much as a
 * chapter. Returns how many it changed, and says so on the debug log when there were any.
 */
export function keepPictureAspect(doc: Document, log?: (msg: string) => void): number {
  let changed = 0;
  for (const el of Array.from(doc.querySelectorAll('svg, image'))) {
    if (!stretches(el.getAttribute('preserveAspectRatio'))) continue;
    if (el.localName === 'svg' && !el.querySelector('image')) continue;
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    changed++;
  }
  if (changed) log?.(`pictures kept in shape: ${changed}`);
  return changed;
}
