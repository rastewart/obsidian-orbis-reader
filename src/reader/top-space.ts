// Focus mode's vertical page metrics: how much blank sits above and below the book, and how much of it a bar
// overlaying the reader has to add to.
//
// **One definition, for every bar.** `SecondaryBar` (search, Go To) and `TtsController` (the listening bar) both
// reserve their room here; two private copies drift apart, which is visible as one bar sitting noticeably further
// from the text than the other.

/** Breathing room between a bar and the first line of the book. */
const BAR_TEXT_GAP = 12;

/**
 * Used only for the frame where the bar has no height yet.
 *
 * It is a guess at the tallest a bar might be, too tall for either of them to use as the rule — that would put a
 * band of dead space above the text. Reserving too much is a gap; reserving nothing puts the bar on top of the line
 * you are reading, so an unmeasurable bar still errs upward.
 */
const FALLBACK_TOP_SPACE = 96;

/**
 * **The blank Foliate leaves above and below the text while focus mode is on**, written into its renderer's
 * `margin` attribute by `FocusMode`. Outside focus mode the attribute is removed and Foliate's own default of
 * 48px applies.
 *
 * **Normal mode keeps the 48 because there it is load-bearing.** The search bar, the Go To bar, the listening
 * bar and the highlight drawer all live in `.orbis-overlay-container`, which is `position: absolute; top: 0`
 * *inside* the host — they float over the top of the book rather than taking layout space above it. Nothing
 * reserves room for them there, so the only thing keeping the first line out from under an open search bar is
 * that 48px. Narrowing it globally would put the bar over the text on every device.
 *
 * Focus mode is the case where it is waste rather than load: the bars reserve their own room explicitly below,
 * and with no bar open nothing overlays the top at all.
 *
 * **28, and the floor is the progress chip, not taste.** The chip sits at `--orbis-focus-bottom-inset + 20px`
 * and is about 30px tall, so its top edge is at `inset + 50`; the host's bottom is at `inset + 30`, which puts
 * the last line at `inset + 30 + margin`. Under 20px the text runs under the readout. 28 leaves 8px of hard
 * clearance, plus whatever Foliate's `1fr` rows add on top of the minimum.
 */
export const FOCUS_PAGE_MARGIN = 28;

/**
 * Reserve space at the top of the reader for `barEl`, or release it.
 *
 * `renderer` is Foliate's renderer element — padding there moves the text without moving the reader's own box,
 * so nothing repaginates around a bar that is only overlaying it.
 *
 * **Only what the page is not already leaving.** The padding shrinks the box Foliate lays out in, so its own top
 * margin row starts *below* whatever is reserved here — which means an unclamped reservation is paid twice: a flat
 * `bar + 12` for a 56px bar would open 116px of blank above the text, 68 reserved and then Foliate's 48 on top of
 * it. Subtracting the margin is sound because this is only ever called with `reserved` in focus mode —
 * `reserveFocusSpace === true && ctx.focusMode` at both call sites — so the margin in play is known.
 */
export function setReaderTopSpace(
  renderer: HTMLElement | null | undefined,
  barEl: HTMLElement | null,
  reserved: boolean
): void {
  if (!renderer) return;
  const measured = Math.round(barEl?.getBoundingClientRect().height ?? 0);
  const wanted = measured > 0 ? measured + BAR_TEXT_GAP : FALLBACK_TOP_SPACE;
  const space = Math.max(0, wanted - FOCUS_PAGE_MARGIN);
  // One assignment with a computed value, never a literal — see the no-static-styles rule.
  renderer.style.paddingTop = reserved ? `${space}px` : '';
}

/**
 * **The bottom blank a scrolled book does not leave by itself.** Paged, the last line stops `FOCUS_PAGE_MARGIN`
 * above the host's bottom, in Foliate's bottom margin row. Scrolled, Foliate stretches its scroller over every row,
 * margins included, so the text runs to the host's edge — 20px under the progress chip. Padding the renderer by the
 * same margin stops it where a page does.
 *
 * Reads the flow from the renderer's own attribute, so it is right whichever changed: called by `FocusMode` on the
 * way in and out, and by the view each time it sets the flow.
 */
export function setReaderBottomSpace(renderer: HTMLElement | null | undefined, focusMode: boolean): void {
  if (!renderer) return;
  const scrolled = renderer.getAttribute('flow') === 'scrolled';
  renderer.style.paddingBottom = focusMode && scrolled ? `${FOCUS_PAGE_MARGIN}px` : '';
}
