// What a row can actually do. See docs/design/library.md.
//
// A record's actions come from what is attached to it, not from a single availability flag — which is what keeps
// a catalog of present and absent titles coherent instead of a mixed bag, and what lets an audio-only record be
// listenable-but-not-readable later without a special case anywhere.

import type { BookState } from './book-state';
import type { LibraryRecord } from './record';

export interface Capabilities {
  /** Vault path of the file to open, or null when nothing readable is attached. */
  readPath: string | null;
  /** Reading and listening are peers: anything readable can be listened to, live if not recorded. */
  canListen: boolean;
  /** There is generated audio for it, as opposed to a live voice reading it aloud. */
  recorded: boolean;
  /** The book has a `.orbis`, so its data view has something to show. */
  hasData: boolean;
  /** Somewhere else to go when the title is not here — any URI scheme. */
  sourceUrl: string;
  /** Has been opened before, on some device. */
  started: boolean;
  lastOpened: number;
}

/**
 * Resolve a record to what it can do.
 *
 * `resolved` is the caller's job because turning a link into a file needs the vault: the view resolves through
 * `metadataCache.getFirstLinkpathDest`, which follows Obsidian's own shortest-path rules, and hands the answers
 * in here.
 *
 * **The edition you have been reading wins; otherwise the first one listed.** A record listing an `azw3` and an
 * `epub` is one title in two formats, and until you open one of them the order you wrote is the preference — but
 * once you have, that edition is what this record is about. Reading the first file's state regardless is what left
 * a book you had just read out of Continue, and pointed Read at the copy you were not in the middle of.
 *
 * Every derived fact comes from that one file rather than being merged across editions, so the row is coherent:
 * Read, Listen and the data view all act on the same copy the row is reporting on.
 */
export function capabilitiesOf(
  record: LibraryRecord,
  resolved: Array<{ path: string; readable: boolean }>,
  state: (bookPath: string) => BookState
): Capabilities {
  const readable = resolved.filter((f) => f.readable).map((f) => ({ path: f.path, state: state(f.path) }));
  const opened = readable.filter((f) => f.state.started);
  const active = opened.reduce<(typeof readable)[number] | null>(
    (best, f) => (best === null || f.state.lastOpened > best.state.lastOpened ? f : best),
    null
  );
  const book = active ?? readable[0] ?? null;
  const bookState = book?.state ?? null;
  return {
    readPath: book?.path ?? null,
    // Not gated on a recording: a live voice can read any book Orbis can open, so gating would hide the action
    // on almost every title. Whether a recording exists is information the row shows, not permission it needs.
    canListen: Boolean(book),
    recorded: bookState?.recorded ?? false,
    hasData: bookState?.hasData ?? false,
    sourceUrl: record.sourceUrl,
    started: bookState?.started ?? false,
    lastOpened: bookState?.lastOpened ?? 0,
  };
}

/** Is there anything at all to do with this record besides read its note? */
export function hasAnyAction(caps: Capabilities): boolean {
  return Boolean(caps.readPath || caps.sourceUrl);
}
