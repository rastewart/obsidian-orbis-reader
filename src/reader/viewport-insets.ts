// What the bottom of the screen is actually giving us, when the platform will not say.
//
// **Why this exists.** Focus mode calls Capacitor's `StatusBar.setOverlaysWebView({overlay: true})`, which puts the
// web view edge to edge — under the status bar at the top (which we also hide, so that space is genuinely free) and
// under Android's navigation bar at the bottom (which we cannot hide, and which is still drawn on top of us). The
// web platform's answer to that is `env(safe-area-inset-bottom)`, and **Android's WebView reports 0 for it**. So a
// chip anchored at `bottom: calc(env(safe-area-inset-bottom) + 20px)` sits 20px off the true bottom of the screen,
// under a navigation bar 48dp tall: in gesture mode the debug button is clipped, and in three-button mode the
// navigation bar covers the chip completely.
//
// The measurement here is the DIFFERENCE the overlay made, which is the one thing a web page can see: the layout
// viewport grows by exactly the bars it was handed. Taken across the transition rather than read from an API,
// because the API reports 0.

/** Everything worth knowing about the viewport at one moment. Plain numbers, so a caller can log or diff them. */
export interface ViewportSample {
  innerHeight: number;
  clientHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  safeTop: number;
  safeBottom: number;
}

/** Resolve one `env(safe-area-inset-*)` to a number, via a probe element — there is no way to read it directly. */
function readSafeAreaInset(doc: Document, side: 'top' | 'bottom'): number {
  const probe = doc.body.createDiv();
  probe.style.cssText = `position:fixed;visibility:hidden;height:env(safe-area-inset-${side},0px)`;
  const value = probe.getBoundingClientRect().height;
  probe.remove();
  return value;
}

export function sampleViewport(win: Window): ViewportSample {
  const doc = win.document;
  return {
    innerHeight: win.innerHeight,
    clientHeight: doc.documentElement.clientHeight,
    visualHeight: win.visualViewport?.height ?? 0,
    visualOffsetTop: win.visualViewport?.offsetTop ?? 0,
    safeTop: readSafeAreaInset(doc, 'top'),
    safeBottom: readSafeAreaInset(doc, 'bottom'),
  };
}

/**
 * The system navigation bar's height, read off Obsidian's own mobile navbar before focus mode hides it.
 *
 * **Read from the navbar, not from a change in the viewport.** Obsidian mobile is already edge to edge, so the
 * layout viewport does not grow when `setOverlaysWebView({overlay: true})` runs — it already reaches under the
 * navigation buttons in both navigation modes.
 *
 * So the bar cannot be seen by watching for a change; it has to be read from something positioned against it.
 * `.mobile-navbar` is exactly that — Obsidian keeps its own toolbar clear of the system bar, so the gap between
 * the bottom of that element and the bottom of the viewport IS the system bar. `ReaderPanels` already measures
 * the same element for the same kind of reason.
 *
 * **Must be called BEFORE the navbar is hidden**, which is the one constraint on the caller: focus mode's
 * `hideToolbars()` sets `display: none` on it, and a hidden element measures 0 in every direction.
 *
 * Returns 0 when there is no navbar (desktop), when it is already hidden, or when the gap is not credible — the
 * same bound the delta path uses, for the same reason.
 */
export function systemBarBelow(win: Window): number {
  const navbar = win.document.querySelector('.mobile-navbar');
  const rect = navbar?.getBoundingClientRect();
  if (!rect || rect.height <= 0) return 0;
  const gap = win.innerHeight - rect.bottom;
  if (gap <= 0 || gap > 160) return 0;
  return Math.round(gap);
}

/**
 * How much of the bottom of the screen Obsidian's own mobile navbar is standing on — the pill itself *and* the
 * system bar beneath it, since what a caller wants is a bottom edge to stop above.
 *
 * Distinct from `systemBarBelow`, which measures only the gap UNDER the navbar: that one exists to tell focus
 * mode how much screen it is being handed once Obsidian's chrome goes away, and this one to keep something clear
 * of chrome that is still there. Measured from the navbar's top rather than assumed, so it is right in both of
 * Android's navigation modes and on a phone with a home indicator, and comes out 0 where there is no navbar at
 * all — a desktop, or focus mode, where nothing needs the room.
 */
export function navbarClearance(win: Window): number {
  const navbar = win.document.querySelector('.mobile-navbar');
  const rect = navbar?.getBoundingClientRect();
  if (!rect || rect.height <= 0) return 0;
  return Math.max(0, Math.round(win.innerHeight - rect.top));
}

/**
 * The last height this device saw, because the reading can only be taken at moments the reader controls.
 *
 * **`systemBarBelow` has exactly one window, and it is routinely shut.** It measures `.mobile-navbar`, which
 * Obsidian hides while a soft keyboard is up — and focus mode hides it too, permanently, with a MutationObserver.
 * So the only chance is the instant before entry, and entering from the search field is precisely when the
 * keyboard has taken it away. On that path the navbar measures 0, and blurring the field and waiting does not bring
 * it back, because blurring does not reliably dismiss an Android keyboard inside a WebView.
 *
 * The bar's height is a property of the device and its navigation mode. It does not stop existing because we
 * asked at a bad moment, so a zero means "could not read it", never "there is none" — and the answer is to have
 * asked earlier, while the reader was just reading. `sampleSystemBar` is called on every relocate for that.
 *
 * Module-level: a second reader pane on the same device is looking at the same system bar. Switching Android
 * between gesture and three-button navigation corrects it on the next page turn outside focus mode.
 */
let lastKnownSystemBar = 0;

/** Take a reading if one is available, and remember it. Cheap enough for a page turn. */
export function sampleSystemBar(win: Window): void {
  const measured = systemBarBelow(win);
  if (measured > 0) lastKnownSystemBar = measured;
}

/** The best answer available: this moment's reading, or the last one that worked. */
export function rememberedSystemBar(win: Window): number {
  sampleSystemBar(win);
  return systemBarBelow(win) || lastKnownSystemBar;
}

/** Testing seam — the cache is module state, and a test that sets it must be able to clear it. */
export function forgetSystemBar(): void {
  lastKnownSystemBar = 0;
}

/**
 * How much room to keep clear at the bottom, given the viewport before and after going edge to edge.
 *
 * **The platform's own answer wins when it gives one.** An iPhone reports a real `safe-area-inset-bottom` for its
 * home indicator, and that number is better than anything derived here — this is a fallback for the platform that
 * says nothing, not a replacement for the one that speaks.
 *
 * Otherwise: the layout viewport grew by the bars the overlay handed us, and the status bar we hid is part of that
 * growth. Subtracting `before.safeTop` is wrong on Android (it is 0 there too), so the growth is attributed to the
 * bottom in full. That over-reserves by the height of a hidden status bar — which is the safe direction to be
 * wrong in, since the cost is a few pixels of page and the alternative is a control nobody can press.
 *
 * Returns 0 when the growth is not credible: nothing changed (a desktop, or an Android build that does not overlay
 * at all), or the numbers moved by more than a plausible pair of system bars, which means something other than the
 * overlay moved them — a keyboard, most likely — and a guess built on that would be worse than none.
 */
export function bottomClearance(before: ViewportSample, after: ViewportSample): number {
  if (after.safeBottom > 0) return after.safeBottom;
  const growth = after.innerHeight - before.innerHeight;
  if (growth <= 0) return 0;
  // A status bar and a navigation bar together are ~24–48 CSS px each. 160 is well clear of any real pair and well
  // under a keyboard, which is the other thing that resizes this viewport.
  if (growth > 160) return 0;
  return growth;
}
