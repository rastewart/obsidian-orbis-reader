// Where a note's icon goes on a paginated page: centred on the edge after its own column.
//
// Pure, so the column arithmetic can be tested without a book: the caller measures the page and the note's first
// line, and places the icon wherever this says.

/** The icon's width — `.orbis-note-icon` in styles.css. A gap narrower than this cannot hold one clear of the text. */
const NOTE_ICON_WIDTH = 28;

export interface PageColumns {
  /** The x, in the section document, of the centre of the note's first line. */
  lineCenterX: number;
  /** The x where the visible page ends — foliate's `start`, in the same coordinates. */
  pageEnd: number;
  /** The page's width — foliate's `size`. */
  pageSize: number;
  /** The `column-width` and `column-gap` foliate set on the section document. */
  columnWidth: number;
  columnGap: number;
}

/** `page`: centre the icon `x` from the page's left edge. `margin`: the fallback strip at the right of the book. */
export type NoteIconPlace = { where: 'margin' } | { where: 'page'; x: number };

/**
 * **Every icon is centred on the edge after its own column, so each sits the same distance from its text.**
 *
 * Foliate pads each page by half a gap on either side (foliate patch 3b), so a column plus a gap is
 * exactly one step across the page, and the edge after column `i` is at `(i + 1) × (columnWidth + columnGap)`: the
 * middle of the gap between two columns, and — for the last column — the page's own edge, half a gap from the text
 * like the others. There the icon overhangs into the strip the reader keeps beside the book. With two columns, an
 * icon for the left column sat in that strip a whole column away from its passage, and one for the right column
 * sat twice as far from its text as one in the gap.
 *
 * The column count is read off the page rather than off the setting, because foliate drops to one column when the
 * page is too narrow for two whatever the setting says. A gap too narrow to hold the icon clear of the text falls
 * back to the strip.
 */
export function placeNoteIcon(page: PageColumns): NoteIconPlace {
  const step = page.columnWidth + page.columnGap;
  if (!(step > 0) || !(page.pageSize > 0)) return { where: 'margin' };
  if (page.columnGap < NOTE_ICON_WIDTH) return { where: 'margin' };
  const columns = Math.max(1, Math.round(page.pageSize / step));
  const fromLeft = page.lineCenterX - (page.pageEnd - page.pageSize);
  const column = Math.min(columns - 1, Math.max(0, Math.floor((fromLeft - page.columnGap / 2) / step)));
  return { where: 'page', x: (column + 1) * step };
}

/** The `column-width` and `column-gap` foliate set on a section document, or null when it has set none. */
export function columnsOf(doc: Document | null | undefined): Pick<PageColumns, 'columnWidth' | 'columnGap'> | null {
  const style = doc?.documentElement.style;
  if (!style) return null;
  const columnWidth = Number.parseFloat(style.getPropertyValue('column-width'));
  const columnGap = Number.parseFloat(style.getPropertyValue('column-gap'));
  return Number.isFinite(columnWidth) && Number.isFinite(columnGap) ? { columnWidth, columnGap } : null;
}

/** An icon's `left`, in its layer, centred `x` from the page's left edge — both edges on screen. */
export function noteIconLeft(pageScreenLeft: number, x: number, layerScreenLeft: number): number {
  return Math.round(pageScreenLeft + x - layerScreenLeft - NOTE_ICON_WIDTH / 2);
}
