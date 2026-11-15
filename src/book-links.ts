// Turning a section's links and anchors into keys that mean the same thing anywhere in the book.
//
// **The only code that knows what an EPUB path is.** An `href` inside a section is relative to that section's own
// place in the archive, and an `id` is unique only within its own document — `#notes` in chapter two and chapter
// three are different places. Both become `spineIndex#fragment` here, so everything downstream matches plain
// strings and never learns about archives, relative paths or fragments.
//
// Pure, and separated from the view for that reason: the mapping is the part worth testing, and testing it should
// not need a book open. See docs/design/marks-pdf.md §Links.

import type { BookBlock } from './book-blocks';
import { isExternalHref } from './pdf-writer';

/** Anything carrying linked spans — a block, or one cell of a table. */
interface Linked {
  links: { start: number; end: number; href: string }[];
}

/**
 * One link's destination as `spineIndex#fragment`, or `undefined` when it is not a section of this book.
 *
 * Shared by the PDF and Markdown exports, so a link resolves to the same place in both.
 */
export function linkKey(
  href: string,
  index: number,
  resolveHref: ((href: string) => string) | undefined,
  sectionIndexOf: (path: string) => number | undefined,
  fragmentSectionOf?: (id: string) => number | undefined
): string | undefined {
  const [path, fragment = ''] = href.split('#');
  // A bare `#id` points inside this same section, which no path resolution would tell us — unless the book's ids are
  // book-wide, as FB2's are: its note references point into the notes body (`fragmentSectionIndex` on the view).
  if (!path) return `${fragmentSectionOf?.(fragment) ?? index}#${fragment}`;
  const resolved = resolveHref?.(path) ?? path;
  const target = sectionIndexOf(resolved.split('#')[0]);
  return target === undefined ? undefined : `${target}#${fragment}`;
}

/**
 * Rewrite one section's links and anchors in place.
 *
 * @param index this section's spine index — the half of every key that makes an `id` unique across the book.
 * @param resolveHref foliate's own resolver for the section, which turns a relative href into an archive path.
 * @param sectionIndexOf the spine index for an archive path, or `undefined` if it is not a section of this book.
 * @param fragmentSectionOf where a bare `#id` lands when the book's ids are book-wide (FB2), else this section.
 *
 * A link whose target is not a section — a missing file, a resource outside the spine — loses its href and prints
 * as ordinary text, which is the honest outcome for a destination that does not exist.
 */
export function canonicalizeLinks(
  blocks: BookBlock[],
  index: number,
  resolveHref: ((href: string) => string) | undefined,
  sectionIndexOf: (path: string) => number | undefined,
  fragmentSectionOf?: (id: string) => number | undefined
): void {
  const keyFor = (href: string): string | undefined =>
    linkKey(href, index, resolveHref, sectionIndexOf, fragmentSectionOf);

  const rewrite = (runs: Linked): void => {
    if (!runs.links.length) return;
    runs.links = runs.links
      .map((link) => ({ ...link, href: isExternalHref(link.href) ? link.href : (keyFor(link.href) ?? '') }))
      .filter((link) => link.href);
  };

  for (const [at, block] of blocks.entries()) {
    const anchors = (block.anchors ?? []).map((id) => `${index}#${id}`);
    // The first block also carries the section's own start, so a link to the whole file — `chapter3.xhtml` with no
    // fragment — lands at the top of it rather than nowhere.
    if (at === 0) anchors.unshift(`${index}#`);
    block.anchors = anchors.length ? anchors : undefined;
    rewrite(block);
    /**
     * **And every cell.**
     *
     * A contents page built as a table is the shape this feature exists for, and cells were missed the first time:
     * their links kept the raw relative href, matched no destination key, and were dropped as unreachable. Silently,
     * because an unreachable link prints as ordinary text — so a table of thirty-four links looked exactly like a
     * table of thirty-four plain words.
     */
    for (const row of block.rows ?? []) for (const cell of row) rewrite(cell);
  }
}
