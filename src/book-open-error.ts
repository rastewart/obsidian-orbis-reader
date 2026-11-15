// What a reader is told when a book will not open.
//
// The reading engine's own messages describe the engine, not the file: a text file named `.epub` is "File type not
// supported", about a format that is; an empty file is "File not found", about a file that is right there; a cut-off
// download is "End of central directory not found". So the failure is told by its kind — foliate names each one,
// ORBIS patch 11 — in words a reader can act on, naming the format the file claims to be. The engine's own words go
// to the debug log.

import { t } from './i18n';

/**
 * One sentence for a book that failed to open, from what went wrong and the file it was.
 *
 * - `NotFoundError`: foliate's word for an empty file.
 * - `UnsupportedTypeError`: not recognisable as any book format, so not a valid one of the format its name claims.
 * - `DamagedBookError`: recognised, then unreadable inside.
 * - `UnprotectedReaderError`: not the book's fault — the reader could not put its protection against book content in
 *   place, so it opens nothing (`installFoliateSrcdocPatch`).
 * - Anything else keeps its own message, named as a failure to open: it may be a fault in Orbis rather than in the
 *   file, and the original words are what would find it.
 */
export function describeOpenFailure(err: unknown, extension: string): string {
  const format = extension.toUpperCase();
  const kind = err instanceof Error ? err.name : '';
  if (kind === 'NotFoundError') return t('book_open.empty');
  if (kind === 'UnsupportedTypeError') return t('book_open.not_valid', { format });
  if (kind === 'DamagedBookError') return t('book_open.damaged', { format });
  if (kind === 'UnprotectedReaderError') return t('book_open.protection_not_in_place');
  return t('book_open.could_not_open', { format, reason: err instanceof Error ? err.message : String(err) });
}
