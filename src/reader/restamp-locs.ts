// Every stored location onto the index's numbering.
//
// A passage, a note or a bookmark stores the location it begins in. One stored before the book's index was up — or by
// an earlier numbering, when the indicator counted foliate's bytes from 0 and a bookmark its section's start — is off
// by a few. **Run on every open, once the index is up**, so those are corrected without anyone asking, and by the
// Recalculate locations command; only what changed is written, so an open with nothing to correct writes nothing.
//
// The caller guards a book whose index has no locations (some MOBI/AZW3): there it would erase every number.

import type { Bookmark } from '../progress';
import { bookmarkLabel, bookmarkLocCfi } from './bookmark-utils';

/** `AnnotationController`: gives each passage and note the location `getLoc` puts it in, and writes and counts only
 *  those that changed. */
interface Annotations {
  remapLocs(getLoc: (cfi: string) => number | undefined): number;
}

interface Bookmarks {
  readonly all: readonly Bookmark[];
  replaceAll(bookmarks: Bookmark[]): void;
}

/** Restamp every passage, note and bookmark; answer how many changed. */
export function restampLocs(
  getLoc: (cfi: string) => number | undefined,
  annotations: Annotations,
  bookmarks: Bookmarks
): number {
  const changed = annotations.remapLocs(getLoc);
  let moved = 0;
  const updated = bookmarks.all.map((b) => {
    const loc = getLoc(bookmarkLocCfi(b));
    if (loc === b.loc) return b;
    moved++;
    return { ...b, loc, label: bookmarkLabel(b.chapter, loc) };
  });
  if (moved) bookmarks.replaceAll(updated);
  return changed + moved;
}
