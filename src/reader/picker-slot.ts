// One annotation bar in the document at a time, owned by whoever is about to SHOW it.
//
// **Why the claim is made at show time.** `setupHighlightUI` runs once per section document, but selections are
// dispatched per document — the bar that opens is the one belonging to the document you selected in — and a section
// is not the last one set up for long: a neighbor gets rendered, or a reflow re-renders one. If each setup removed
// the previous section's bar and installed its own, the bar a section owns would be taken out of the DOM by a
// section you are not looking at: still positioned, still given `.visible`, and still invisible, because a detached
// element has no layout. Selecting text would then intermittently fail to open the marks bar.
//
// So whichever bar is about to be shown takes the slot.

/**
 * Put `wanted` in `body`, taking out whatever held the slot before it. Answers the new holder.
 *
 * `current` is the element believed to hold the slot — passing it rather than searching for one by id, because two
 * open books mean two elements carrying `id="orbis-picker"` and the wrong one would be removed.
 */
export function claimPickerSlot(body: HTMLElement, wanted: HTMLElement, current: HTMLElement | undefined): HTMLElement {
  if (current && current !== wanted) current.remove();
  // Checked rather than appended unconditionally: re-appending a node that is already in place is a move, which
  // would drop focus out of the bar every time it is re-shown.
  if (wanted.parentElement !== body) body.appendChild(wanted);
  return wanted;
}
