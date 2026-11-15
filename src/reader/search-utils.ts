// Pure search helpers, kept free of foliate-js/DOM imports so they're trivially
// unit-testable. See SearchController for the stateful, DOM-bound search logic.

/**
 * Map a spine CFI to its 0-based section index. Foliate spine CFIs look like
 * `epubcfi(/6/N…)` where N is `2 * (sectionIndex + 1)`, so section index is
 * `floor(N / 2) - 1`. Returns null when the CFI has no `/6/N` step.
 */
export function sectionIndexFromCfi(cfi: string): number | null {
  const m = cfi.match(/\/6\/(\d+)/);
  if (!m) return null;
  return Math.floor(parseInt(m[1]) / 2) - 1;
}

/**
 * Whether the first result in reading order can no longer be overtaken, once the book walk has searched every
 * section up to `walkedThrough`.
 *
 * Saved items are found at once and book text a section at a time, in order, so a saved item in section 3 is
 * first only until the walk finds a match ahead of it — in section 1, or earlier in section 3 itself. A result
 * is settled when the walk has finished its section. One with no section to read off cannot be placed, so it
 * does not hold the search back.
 */
export function firstResultSettled(results: readonly { cfi: string }[], walkedThrough: number): boolean {
  const first = results[0];
  if (!first) return false;
  const section = sectionIndexFromCfi(first.cfi);
  return section === null || section <= walkedThrough;
}

/** A contents entry inside one section: its href (for grouping), its label, and the id its anchor carries, if any. */
export interface SectionEntry {
  href: string;
  label: string;
  fragment: string;
}

/**
 * The contents entry a match in `doc` falls under — the last whose anchor comes at or before it, as the Contents tab
 * highlights the entry you are reading. An entry with no fragment starts the section. Null when no entry starts
 * before the match, or the section has none: the caller then names the section as a whole.
 *
 * **Not one heading per file.** Many books hold several chapters in a file, and naming every match in it after the
 * file's first entry put a whole book's results under its title page.
 */
export function entryAt(
  doc: Document,
  node: Node,
  offset: number,
  entries: readonly SectionEntry[]
): SectionEntry | null {
  let found: SectionEntry | null = null;
  for (const entry of entries) {
    if (!entry.fragment) {
      found = entry;
      continue;
    }
    const anchor = doc.getElementById(entry.fragment);
    if (!anchor) continue;
    // The anchor is at or before the match when the match does not come before the anchor.
    const range = doc.createRange();
    range.setStart(node, offset);
    if (range.comparePoint(anchor, 0) <= 0) found = entry;
    else break;
  }
  return found;
}

/**
 * A result row's text: the match with a little before it and plenty after, `…` where it is cut.
 *
 * **Little before, because the row is one line.** The Search tab shows as much as fits and cuts the rest, so 50
 * characters ahead of the match put the match past the edge in most rows — the highlight was there and nobody saw
 * it. Fifteen is enough to read the match in its sentence; the line carries on after it.
 */
export function excerptAround(text: string, at: number, length: number): string {
  const start = Math.max(0, at - 15);
  const end = Math.min(text.length, at + length + 100);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
