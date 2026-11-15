import type { Highlight, Note } from '../progress';
import { isForwardRangeCfi } from './bookmark-utils';

export type AnnotationProblemReason = 'malformed-range' | 'duplicate';

export interface AnnotationProblem {
  /** The annotation's id — used to remove it. */
  id: string;
  type: 'highlight' | 'note';
  reason: AnnotationProblemReason;
  /** A short text snippet for the preview (highlighted passage / note selection). */
  text: string;
  cfiRange: string;
}

/**
 * Scan a book's highlights + notes for un-usable data — malformed range CFIs (empty/backwards, so
 * they can't render or be navigated to) and exact duplicates (same type + range + text). Pure: no
 * DOM / rendered book needed. Bookmarks aren't range annotations and are left alone.
 */
export function scanAnnotationData(data: { highlights: Highlight[]; notes: Note[] }): AnnotationProblem[] {
  const problems: AnnotationProblem[] = [];
  const seen = new Set<string>();

  const consider = (id: string, type: 'highlight' | 'note', cfiRange: string, text: string) => {
    if (!cfiRange || !isForwardRangeCfi(cfiRange)) {
      problems.push({ id, type, reason: 'malformed-range', text, cfiRange });
      return; // a broken range can't also be a meaningful duplicate
    }
    const key = `${type}:${cfiRange}:${text}`;
    if (seen.has(key)) problems.push({ id, type, reason: 'duplicate', text, cfiRange });
    else seen.add(key);
  };

  for (const h of data.highlights) consider(h.id, 'highlight', h.cfiRange, h.text ?? '');
  for (const n of data.notes) consider(n.id, 'note', n.cfiRange, n.selectedText || n.text || '');

  return problems;
}
