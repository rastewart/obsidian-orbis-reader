// Narrowing an export to particular marks: which marks a book actually uses, how much of it each one carries, and
// the operation that drops the rest.
//
// **One filter point serves every consumer**, which is why this is a module rather than three copies. The digest
// PDF (`groupMarksByChapter`), the whole marked-up document (`annotationStyles`) and the notes export
// (`buildNotesMarkdown`) all read the same two arrays off `NotesData` — so narrowing those arrays once, before any
// of them runs, needs no change in a single renderer. The document path is the clearest case: it draws a mark by
// looking its annotation up in the style map and skips anything absent, so withholding an annotation withholds its
// wash, its treatment and its note pin together.
//
// Pure, and free of Obsidian and of `t()`, so the rules can be tested by building a `NotesData` literal.

import type { AnnotationMark } from './annotation-presets';

/**
 * **These take the shape they READ, not `NotesData` itself.**
 *
 * All any of them looks at is `markId`, so asking for a whole `Highlight` would be a claim about fields they never
 * touch — and it would make the rules testable only by building two fully-populated annotations per case, which is
 * how a test ends up describing the type instead of the behavior. `filterNotesDataByMarks` stays generic, so it
 * still hands a real `NotesData` back to the callers that pass one.
 */
interface Marked {
  markId?: string;
}
interface MarkedContent {
  highlights: readonly Marked[];
  notes: readonly Marked[];
}

/**
 * The key standing for "carries no mark at all".
 *
 * Real annotations predate marks, and a reader can clear one — so "unmarked" is a group you can want on its own,
 * and one you must not silently drop when filtering to something else. A sentinel rather than `undefined` because
 * the chosen set is a `Set<string>` that has to be able to hold it.
 */
export const NO_MARK = 'none';

/** The mark an annotation counts under, with the sentinel standing in for none. */
export function markKeyOf(annot: Marked): string {
  return annot.markId ?? NO_MARK;
}

/**
 * How many annotations carry each mark, keyed by `markKeyOf`.
 *
 * Highlights and notes only: those are the two kinds a mark can be on. Bookmarks have none, which is why nothing
 * here touches them and why a filtered notes export still carries every bookmark it was going to.
 */
export function markUsage(data: MarkedContent): Map<string, number> {
  const usage = new Map<string, number>();
  for (const a of [...data.highlights, ...data.notes]) {
    const key = markKeyOf(a);
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }
  return usage;
}

/**
 * The book's marks that something actually carries, in the preset's order.
 *
 * **Only what is in use is offered.** A mark nothing carries can only ever narrow an export to nothing, and the
 * count beside each row is what answers "which of these is worth filtering by" — the same reasoning the
 * change-preset dialog's counts follow.
 */
export function marksInUse(data: MarkedContent & { marks?: readonly AnnotationMark[] }): AnnotationMark[] {
  const usage = markUsage(data);
  return (data.marks ?? []).filter((m) => usage.has(m.id));
}

/**
 * The same snapshot with its highlights and notes narrowed to the chosen marks.
 *
 * **An empty choice returns the snapshot itself, unchanged and un-copied.** "No filter" is the default and has to
 * cost nothing and change nothing — making it the identity here rather than a branch at each call site is what
 * keeps three consumers from each having to remember it.
 *
 * Bookmarks, the metadata and the contents are passed through: a bookmark carries no mark, so a filter has nothing
 * to say about it.
 */
export function filterNotesDataByMarks<T extends MarkedContent>(data: T, chosen: ReadonlySet<string>): T {
  if (chosen.size === 0) return data;
  const keep = (a: Marked): boolean => chosen.has(markKeyOf(a));
  return { ...data, highlights: data.highlights.filter(keep), notes: data.notes.filter(keep) };
}

/**
 * Everything an export is narrowed by: which KINDS of selection, and which marks on them.
 *
 * **Two axes, because they answer different questions.** A reader wanting only the passages they marked *Key point*
 * is narrowing twice — to passages, and to one mark — and neither axis can express the other. The notes export does
 * not carry this: it already has switches for what a note holds, and asking the same question twice three inches
 * apart is worse than not offering it. The PDF has no such switches, so it asks here.
 *
 * `passages` are the highlights — a marked passage with nothing written on it — and `notes` the annotations that
 * carry something the reader typed. The names match the words the reader sees.
 */
export interface MarkSelection {
  /** Empty means every mark, which is the default and has to cost nothing. */
  marks: ReadonlySet<string>;
  passages: boolean;
  notes: boolean;
}

/** The selection that narrows nothing — what an export starts on. */
export function everything(): MarkSelection {
  return { marks: new Set(), passages: true, notes: true };
}

/** Whether this selection would change anything, for a caller deciding whether to say so. */
export function narrowsAnything(sel: MarkSelection): boolean {
  return sel.marks.size > 0 || !sel.passages || !sel.notes;
}

/**
 * Both axes at once: the kinds first, then the marks on what is left.
 *
 * Kinds first because it is the cheaper question and because the order cannot matter — dropping every note and then
 * filtering by mark is the same set as the reverse. Stated anyway, so nobody has to work it out.
 *
 * Returns the snapshot itself when nothing is narrowed, for the reason `filterNotesDataByMarks` does.
 */
export function applySelection<T extends MarkedContent>(data: T, sel: MarkSelection): T {
  if (!narrowsAnything(sel)) return data;
  const kinds =
    sel.passages && sel.notes
      ? data
      : { ...data, highlights: sel.passages ? data.highlights : [], notes: sel.notes ? data.notes : [] };
  return filterNotesDataByMarks(kinds, sel.marks);
}

/**
 * The chosen marks' names, in the preset's order, for a fold header to state.
 *
 * **Order comes from the preset, not from the order they were ticked.** The same two marks must read the same way
 * however they were chosen, or a header that exists to be recognized at a glance changes between two runs that
 * produce identical files. `noMarkLabel` and the fallback for an unnamed mark are passed in, since the words belong
 * to the UI layer.
 */
export function chosenMarkNames(
  chosen: ReadonlySet<string>,
  marks: readonly AnnotationMark[] | undefined,
  labels: { noMark: string; unnamed: string }
): string[] {
  const names: string[] = [];
  if (chosen.has(NO_MARK)) names.push(labels.noMark);
  for (const m of marks ?? []) {
    if (chosen.has(m.id)) names.push(m.name.trim() || labels.unnamed);
  }
  return names;
}
