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

/**
 * The element an empty range still names, for a range CFI whose start and end are the same element step:
 * `epubcfi(/6/10!/4,/4,/4)`. Such a CFI covers no text, but it was made from a range on that element — the
 * paragraph a mark was made on, before `tightenRange` moved element ends onto text — so it can be put back.
 *
 * `point` is the element's own CFI, `epubcfi(/6/10!/4/4)`, for the reader to find its section by; `steps` is the
 * path to it inside the section's document, `[4, 4]`. Null for any other CFI, including one whose ends are offsets
 * in text: those are not this mistake, and guessing at them could move a mark onto the wrong words.
 */
export function collapsedElementPath(cfi: string): { point: string; steps: number[] } | null {
  const m = /^epubcfi\((.+)\)$/.exec(cfi.trim());
  if (!m) return null;
  const parts = m[1].split(',');
  if (parts.length !== 3 || parts[1] !== parts[2]) return null;
  const [parent, end] = parts;
  // Element steps only: even numbers, an optional [id] after each, and no character offset.
  const elementSteps = /^(\/\d*[02468](\[[^\]]*\])?)+$/;
  const bang = parent.indexOf('!');
  if (bang < 0 || !elementSteps.test(end)) return null;
  const inside = parent.slice(bang + 1);
  if (inside && !elementSteps.test(inside)) return null;
  const steps = [...`${inside}${end}`.matchAll(/\/(\d+)/g)].map((s) => Number(s[1]));
  return { point: `epubcfi(${parent}${end})`, steps };
}

/** The element at `steps` (even CFI steps) from a document's root element, or null when the path leads nowhere. */
export function elementAtSteps(doc: Document, steps: readonly number[]): Element | null {
  let at: Element | null = doc.documentElement;
  for (const step of steps) {
    if (!at || step % 2 !== 0 || step < 2) return null;
    at = at.children[step / 2 - 1] ?? null;
  }
  return at;
}

/** A range over an element's text, from its first character that is not whitespace to its last. Null if it has none. */
export function textRangeOf(el: Element): Range | null {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.trim()) texts.push(n as Text);
  if (!texts.length) return null;
  const first = texts[0];
  const last = texts[texts.length - 1];
  const range = doc.createRange();
  range.setStart(first, first.data.length - first.data.trimStart().length);
  range.setEnd(last, last.data.trimEnd().length);
  return range;
}

/** Text as annotations store it: runs of whitespace as one space, none at the ends. */
export function storedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** What `findRepairs` needs of the open book. */
export interface RepairBook {
  /** The book's sections, each of which can load its document on its own. */
  sections: readonly { createDocument?: () => Promise<Document>; unload?: () => void }[];
  /** The section a CFI is in, or undefined when the book cannot place it. */
  sectionOf: (cfi: string) => number | undefined;
  /** The CFI a range in a section is stored under, as a mark made on it would be. */
  cfiForRange: (range: Range, sectionIndex: number) => string;
  debug: (message: string) => void;
}

/**
 * Where each broken range can be put back, by annotation id: the ones stored empty on the element they were made on
 * (`collapsedElementPath`), whose element's text is still the text the annotation stored. Anything else stays broken
 * and is offered for removal only — a place found by guessing could put a mark on the wrong words.
 *
 * Each section is loaded on its own rather than read from the screen, which shows one section at a time.
 */
export async function findRepairs(
  problems: readonly AnnotationProblem[],
  book: RepairBook
): Promise<Map<string, string>> {
  const repairs = new Map<string, string>();
  for (const problem of problems) {
    if (problem.reason !== 'malformed-range' || !problem.text) continue;
    const path = collapsedElementPath(problem.cfiRange);
    const index = path ? book.sectionOf(path.point) : undefined;
    const section = index === undefined ? undefined : book.sections[index];
    if (!path || index === undefined || !section?.createDocument) continue;
    try {
      const doc = await section.createDocument();
      const el = elementAtSteps(doc, path.steps);
      const range = el ? textRangeOf(el) : null;
      if (range && storedText(range.toString()) === storedText(problem.text)) {
        const cfi = book.cfiForRange(range, index);
        if (isForwardRangeCfi(cfi)) repairs.set(problem.id, cfi);
      }
    } catch (e) {
      book.debug(
        `repair: could not read section ${index} for ${problem.cfiRange}: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      section.unload?.();
    }
  }
  return repairs;
}
