// Selecting a book by the sentence, from the keyboard.
//
// **Why sentences and not a caret.** An iframe with no `contenteditable` has no insertion point, so Shift+Arrow
// has nothing to extend from — pressing it in a book does nothing at all, and caret browsing (F7) is off by
// default on Windows and absent on macOS. Imitating a caret would also be the wrong shape for the surface: on a
// phone there will never be one, and a reader marks passages rather than characters.
//
// So the unit is the sentence, which the book can enumerate for itself. `getReadingUnits` already does exactly
// that for the audio — one unit per sentence, each with a text-node Range, via `Intl.Segmenter` — and a sentence
// is the same thing whether it is being spoken or marked.
//
// **The selection is the state.** Nothing is remembered between calls: which sentence you are on is derived from
// the live selection each time. A page turn, a re-render or a click somewhere else cannot leave a cursor pointing
// at something that has gone, because there is no cursor to leave behind.
//
// See docs/design/keyboard.md.

import { getReadingUnits, type ReadingUnit } from './tts/tts-blocks';

/** What a keystroke asks of the cursor. */
export type SentenceMove = 'sentence' | 'previous' | 'extend' | 'shrink' | 'paragraph';

/** Where the reader is, in sentences. `collapsed` distinguishes a caret from a selection, which is the whole of
 *  what makes one "select sentence" command behave sensibly in all three states. */
export interface SentenceSpan {
  from: number;
  to: number;
  collapsed: boolean;
}

/** The sentences of a section, in reading order. */
export function sentencesIn(doc: Document): ReadingUnit[] {
  return getReadingUnits(doc, 0);
}

/**
 * Which sentence a point falls in, or the last one before it.
 *
 * `-1` when the point precedes every sentence, which is what a selection in the furniture around the text — a
 * heading the segmenter skipped, whitespace between blocks — comes out as.
 */
export function sentenceAt(units: readonly ReadingUnit[], node: Node, offset: number): number {
  let before = -1;
  for (const [i, unit] of units.entries()) {
    try {
      if (unit.range.comparePoint(node, offset) === 0) return i;
      if (unit.range.comparePoint(node, offset) > 0) before = i;
    } catch {
      // A point in another tree — comparePoint throws rather than answering. It is not in this sentence.
    }
  }
  return before;
}

/** The first sentence the reader can see, or `-1` if the page holds none of them. */
export function firstVisible(units: readonly ReadingUnit[], onScreen: (range: Range) => boolean): number {
  return units.findIndex((u) => onScreen(u.range));
}

/**
 * Where the selection should go, as a pair of sentence indices.
 *
 * Pure, and separated from the DOM work for the usual reason: which sentence a key lands on is the part worth
 * testing, and testing it should not need a book open.
 *
 * `null` means "nothing to do" — off either end, or a page with no sentences on it.
 */
export function nextSpan(
  move: SentenceMove,
  total: number,
  current: SentenceSpan | null,
  visible: number
): { from: number; to: number } | null {
  if (!total) return null;
  const clamp = (n: number): number => Math.max(0, Math.min(total - 1, n));

  // Nothing selected yet — every move starts from what is on the page rather than from the top of the chapter,
  // for the same reason Tab seeds from the page: a reader forty pages in did not ask to go back.
  if (!current) {
    if (visible < 0) return null;
    return { from: visible, to: visible };
  }

  switch (move) {
    /**
     * **One command, three states — and a caret is a position, not a selection.**
     *
     * There were two commands at first, "select this" and "select next", and the difference between them was too
     * fine to keep in a hotkey list. Merging them only works because of this rule: clicking in a paragraph and
     * pressing the key must select the sentence you clicked in, not the one after it. So a collapsed caret means
     * "where I am" and a real selection means "move on".
     */
    case 'sentence':
      if (current.collapsed) return { from: current.from, to: current.from };
      return current.to + 1 >= total ? null : { from: current.to + 1, to: current.to + 1 };
    case 'paragraph':
      // The block is chosen by the caller, which knows which sentences share one; this only says where to look.
      return { from: current.from, to: current.to };
    case 'previous':
      return current.from - 1 < 0 ? null : { from: current.from - 1, to: current.from - 1 };
    case 'extend':
      return current.to + 1 >= total ? null : { from: current.from, to: current.to + 1 };
    case 'shrink':
      // Never past the sentence it started on: shrinking to nothing would clear a selection the reader is
      // building, and there is a command for that.
      return { from: current.from, to: clamp(Math.max(current.from, current.to - 1)) };
  }
}

/**
 * The paragraph to select, as a range of sentence indices.
 *
 * Vim's real idea is not its keys, it is that a sentence and a paragraph are things you can take hold of whole.
 * The sentences already know which block they came from — `getReadingUnits` tags every unit of a paragraph with
 * the same `block` Range — so a paragraph is just the run of them that share one.
 *
 * Pressing it again moves on: when the selection already covers the whole block, the next press takes the next
 * paragraph, which is the same "seed then walk" shape the sentence command has.
 */
export function paragraphSpan(
  units: readonly { block?: Range }[],
  at: number,
  wholeBlockSelected: boolean
): { from: number; to: number } | null {
  if (at < 0 || at >= units.length) return null;
  const runOf = (i: number): { from: number; to: number } => {
    const block = units[i].block;
    let from = i;
    let to = i;
    while (from > 0 && units[from - 1].block === block) from--;
    while (to + 1 < units.length && units[to + 1].block === block) to++;
    return { from, to };
  };
  const here = runOf(at);
  if (!wholeBlockSelected) return here;
  return here.to + 1 >= units.length ? null : runOf(here.to + 1);
}

/**
 * What Shift+arrow should do, given what the selection looks like.
 *
 * Three states, and the awkward one is the middle: **a collapsed selection means two opposite things.** Click in a
 * sentence and it means "here, take this sentence"; shrink a selection down to nothing with Shift+Left and it
 * means "keep going, out the other side" — which is what every editor does, the focus end crossing the anchor and
 * the selection growing backwards. The DOM cannot tell them apart, so the caller remembers where its last
 * adjustment left the caret: still there, and this is the same gesture continuing.
 *
 * @param hasRange whether anything is selected at all.
 * @param collapsed whether that selection is empty — a caret.
 * @param atLastAdjustment whether the caret is exactly where the previous Shift+arrow left it.
 */
export function shiftArrowDoes(hasRange: boolean, collapsed: boolean, atLastAdjustment: boolean): 'seed' | 'adjust' {
  if (!hasRange) return 'seed';
  if (!collapsed) return 'adjust';
  return atLastAdjustment ? 'adjust' : 'seed';
}
