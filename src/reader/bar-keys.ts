/** The annotation bar — the floating toolbar a selection or a tapped mark raises. It lives in `document.body`. */
const ANNOTATION_BAR_SELECTOR = '#orbis-picker';

/**
 * Is this keystroke the annotation bar's rather than the reader's?
 *
 * The bar sits over the book and is focused as a whole when it opens — a neutral `tabindex="-1"` target — so a
 * document-wide reading-keys listener and a toolbar the reader is standing on are both live at once, and the split
 * between them is not obvious enough to leave written in a condition:
 *
 * - **The bar itself keeps nothing but Tab.** While the bar as a whole has focus the reading keys are still right: an
 *   arrow lets go of the selection and takes the bar with it, which is what `turnPageFor` documents. Tab is the
 *   exception because Tab is how a reader gets INTO the toolbar — left to the reader it seeds a link inside the book
 *   instead, which made the bar's buttons unreachable from the keyboard altogether.
 * - **A control inside the bar keeps its keys.** Arrowing along the marks was reaching the page-turn handler as well
 *   as the mark walk, so one press did two things: cleared the selection the bar was raised on, or turned the page
 *   behind it.
 * - **Except Shift+arrow, which is the selection's from anywhere in the bar.** Trimming the sentence you just
 *   selected is done with the bar in front of you, which is why the mark walk ignores Shift.
 *
 * `target` is the event's target; `shiftKey` its modifier. Nothing else about the event matters here.
 */
export function barOwnsKey(target: EventTarget | null, key: string, shiftKey: boolean): boolean {
  // Any event target, not only an element: a key forwarded out of the book's frame is the document's, which has no
  // `closest`. `typeof` rather than `instanceof Element`, which fails for an element of another window's realm.
  const el = target && typeof (target as Element).closest === 'function' ? (target as Element) : null;
  const bar = el?.closest(ANNOTATION_BAR_SELECTOR) ?? null;
  if (!bar) return false;
  if (key === 'Tab') return true;
  return target !== bar && !shiftKey;
}

/**
 * Is this keystroke the one that deletes the passage selection or note on screen?
 *
 * **Both keys, everywhere.** The key a Mac keyboard labels *delete* sends `Backspace`; a true `Delete` takes fn. Only
 * `Delete` would leave the Mac's own delete key doing nothing, so both count, on every device.
 *
 * **The bare key only.** Cmd/Ctrl/Alt+Backspace already mean something to someone — a word deleted, a line — and
 * Shift is not a different request. **Never in a text field**, where both keys edit text: the note editor's Backspace
 * must take a character, not the note.
 *
 * Whether there is anything to delete is the caller's question: a new selection has no saved passage behind it.
 */
export function isDeleteKey(e: {
  key: string;
  target: EventTarget | null;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  const el = e.target && typeof (e.target as Element).closest === 'function' ? (e.target as HTMLElement) : null;
  if (!el) return true;
  return !(el.closest('input, textarea, select') || el.isContentEditable);
}
