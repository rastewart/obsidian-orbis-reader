import {
  type App,
  type ButtonComponent,
  Platform,
  type Setting,
  setIcon,
  setTooltip,
  TFolder,
  type ToggleComponent,
  Vault,
} from 'obsidian';
import { isInk, type MarkAppearance } from './annotation-presets';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { insertIndexAt, isDragIntent } from './list-drag';

/**
 * Parse one SVG icon for `doc` without using `innerHTML` (satisfies `@microsoft/sdl/no-inner-html`), imported into
 * that document so it is popout-window safe.
 *
 * **Made inert before it is imported.** The icon lands in Obsidian's own window, where an event handler runs with
 * everything the plugin can do. Every caller passes constant markup, so nothing is lost by dropping what can run —
 * `on*` attributes, `<script>`, `<foreignObject>` (which hosts HTML) and `javascript:` links — and a slip in some
 * future caller draws an icon instead of running code. A value that is not ours, such as a mark's color, still goes
 * in through `setTintedSvgIcon`, never through the markup.
 */
export function parseSvgIcon(doc: Document, svg: string): SVGElement | null {
  // Parse as text/html, not image/svg+xml: the latter is strict XML and fails on SVG
  // literals lacking an xmlns declaration (most of ours). The HTML parser handles <svg>
  // as foreign content in the correct SVG namespace regardless.
  const parsed = new DOMParser().parseFromString(`<body>${svg}</body>`, 'text/html').querySelector('svg');
  if (!parsed) return null;
  for (const el of Array.from(parsed.querySelectorAll('script, foreignObject'))) el.remove();
  for (const el of [parsed, ...Array.from(parsed.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (name.endsWith('href') && /^\s*javascript:/i.test(attr.value))) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return doc.importNode(parsed, true);
}

/** Render one constant SVG icon into `el`, replacing what it held — see `parseSvgIcon`. */
export function setSvgIcon(el: HTMLElement, svg: string): void {
  el.empty();
  const icon = parseSvgIcon(el.ownerDocument, svg);
  if (icon) el.appendChild(icon);
}

/**
 * Render a constant SVG icon with its `data-tint` shapes filled in `color`.
 *
 * The color is set as an attribute value, never written into the markup: it comes from a mark, and a mark can come
 * from a `.orbis` file or a synced preset that someone else wrote. As an attribute value a hostile string is only a
 * fill that does not paint; spliced into markup it could close the attribute and add an element of its own.
 */
export function setTintedSvgIcon(el: HTMLElement, svg: string, color: string): void {
  setSvgIcon(el, svg);
  for (const shape of Array.from(el.querySelectorAll('[data-tint]'))) shape.setAttribute('fill', color);
}

/**
 * Set an inline style with `!important` — which `el.setCssStyles()` cannot express — for the
 * few cases that must override theme/Obsidian rules (e.g. hiding native mobile toolbars).
 * Routing the value through a parameter (not a literal) keeps `no-static-styles-assignment`
 * satisfied. TRUSTED values only.
 */
export function setImportantStyle(el: HTMLElement, prop: string, value: string): void {
  el.style.setProperty(prop, value, 'important');
}

/**
 * Size a swatch button to the 44px touch target, inline and `!important`.
 *
 * It MUST be inline: Obsidian's `.is-mobile button` rule out-specifies a stylesheet class and otherwise collapses or
 * stretches the button in a flex row. Background, border and shadow are fine to leave to the class — only sizing and
 * appearance need to win. Every swatch in the app goes through here, so a fix lands everywhere at once.
 */
export function sizeSwatchButton(btn: HTMLElement): void {
  for (const [prop, val] of [
    ['-webkit-appearance', 'none'],
    ['appearance', 'none'],
    ['width', '44px'],
    ['height', '44px'],
    ['min-width', '44px'],
    ['min-height', '44px'],
    ['flex-shrink', '0'],
    ['padding', '0'],
  ] as const) {
    setImportantStyle(btn, prop, val);
  }
}

export interface ColorSwatchHandle {
  btn: HTMLButtonElement;
  /** Toggle the selection ring. `ringColor` overrides the default (--text-normal) — pass the reader
   *  fg in focus mode so the ring contrasts with the book theme. */
  setSelected: (selected: boolean, ringColor?: string) => void;
}

/**
 * A mark chip for the reader's mark bar: the mark's color AND its treatment, on a 44px target.
 *
 * A color dot does not say enough — two marks can share a color and differ only by treatment, and a reader who cannot
 * tell the colors apart is relying on the shape. So the chip shows a two-letter sample wearing the treatment, which is
 * the same visual language the preset manager uses (`.orbis-mark-preview`, shared deliberately: the thing you pick
 * should look like the thing you configured).
 *
 * Same inline `!important` sizing as `createColorSwatch` and for the same reason — Obsidian's
 * `.is-mobile button` rule out-specifies any class and otherwise collapses the button in a flex row.
 */
/**
 * Style a preview span for an appearance: the wash, the line, or both.
 *
 * Two CSS variables rather than one, because the two channels have independent colors — `is-fill` paints
 * from `--orbis-mark-fill`, the line classes stroke from `--orbis-mark-line`, and a mark with both wears
 * both classes at once. Shared by every preview in the app (chips, list rows, the editor sample, the
 * overflow list) so they can never drift apart.
 */
export function applyMarkPreview(el: HTMLElement, a: MarkAppearance): void {
  el.addClass('orbis-mark-preview');
  if (a.highlightColor) {
    el.addClass('is-fill');
    el.style.setProperty('--orbis-mark-fill', a.highlightColor);
  }
  if (a.treatment) {
    el.addClass(`is-${a.treatment}`);
    // `currentColor` for ink: in a preview the surrounding text IS the page's text, whether that preview
    // sits on the reading surface or on chrome — so the sentinel needs no resolution here.
    const line = isInk(a.treatmentColor) ? 'currentColor' : (a.treatmentColor ?? a.highlightColor);
    el.style.setProperty('--orbis-mark-line', line ?? 'currentColor');
  }
}

export function createMarkSwatch(
  parent: HTMLElement,
  opts: { appearance: MarkAppearance; label: string; sample: string; textColor?: string }
): ColorSwatchHandle {
  const btn = parent.createEl('button', {
    cls: 'orbis-color-swatch',
    attr: { type: 'button', 'aria-label': opts.label },
  });
  // **Asked for, not assumed.** `title` + `aria-label` alone leave the tooltip to whatever Obsidian makes of them —
  // which shows on the selection bar over the book and shows nothing in the note editor, from identical markup. A
  // mark's name is the feature; a row nobody can read is colored squares you must memorize.
  setTooltip(btn, opts.label);
  sizeSwatchButton(btn);
  const box = btn.createDiv({ cls: 'orbis-mark-swatch-box' });
  const sample = box.createSpan({ text: opts.sample });
  applyMarkPreview(sample, opts.appearance);
  // The sample is TEXT, so it needs a text color. In focus mode the bar is themed to the book and lives outside the
  // reader's subtree, so the book's fg has to be handed in; without it the sample inherits --text-normal and goes white
  // on a light page.
  if (opts.textColor) sample.style.color = opts.textColor;
  return {
    btn,
    setSelected: (selected, ringColor) => {
      box.classList.toggle('is-selected', selected);
      box.style.borderColor = selected && ringColor ? ringColor : '';
    },
  };
}

/**
 * A color swatch with a large (44px) transparent tap target wrapping a small (~26px) colored dot —
 * so it reads small but meets the 44px touch-target guideline. Shared by every swatch row (note
 * editor, selection/highlight picker, mobile drawer, advanced-search filter). The visible dot is a
 * `div`, so Obsidian's mobile `button` styling can't stretch it into an oval. `fill` = hex color, or
 * null for a "no color" swatch (`noneStyle`: 'x' = ×, 'check' = checkerboard).
 */
export function createColorSwatch(
  parent: HTMLElement,
  opts: { fill: string | null; label: string; noneStyle?: 'x' | 'check' }
): ColorSwatchHandle {
  const btn = parent.createEl('button', {
    cls: 'orbis-color-swatch',
    attr: { type: 'button', 'aria-label': opts.label },
  });
  setTooltip(btn, opts.label); // see `createMarkSwatch`
  sizeSwatchButton(btn);
  const dot = btn.createDiv({ cls: 'orbis-color-swatch-dot' });
  if (opts.fill) dot.style.background = opts.fill;
  else if (opts.noneStyle === 'check') dot.classList.add('orbis-color-swatch-dot--check');
  else {
    dot.classList.add('orbis-color-swatch-dot--x');
    dot.setText('×');
  }
  return {
    btn,
    setSelected: (selected, ringColor) => {
      dot.classList.toggle('is-selected', selected);
      dot.style.borderColor = selected && ringColor ? ringColor : '';
    },
  };
}

// Narrow structural type instead of importing OrbisReaderView directly, to avoid a
// circular import (OrbisReaderView.ts imports createOrbisPopup from this file).
export interface OrbisPopupHost {
  contentEl: HTMLElement;
  lockMobileHeights(): void;
  unlockMobileHeights(): void;
}

/**
 * Keep an Obsidian `Modal` clear of the mobile keyboard.
 *
 * Obsidian Modals are vertically centered and sized to content, so once the keyboard opens, anything
 * below the focused input (an Add row, a button row) ends up underneath it. There are two answers, and
 * which one is right depends on how much dialog there is:
 *
 * - **lift** (the default): pin the modal near the top and cap its height to the keyboard-safe zone.
 *   Right for a dialog that is one field and two buttons, where the cap costs nothing.
 * - **`reserve`**: leave the dialog's shape alone and reserve the keyboard's share as padding under the
 *   last field. Right for a FORM — several fields, worked down one after another — where the cap is the
 *   bug: it halves the dialog on first focus and, since the keyboard cannot be detected, never gives the
 *   space back. See `applyReserve`.
 *
 * A dialog opened with `fullScreenOnMobile` already holds its own shape from CSS, so `reserve` is what it
 * wants: lifting would fight that CSS and shrink it.
 *
 * ONLY WHILE A TEXT FIELD IS FOCUSED, or while a stacked child modal is itself pinned. Applied at open, the height cap
 * (66% of a tablet's screen) would leave the bottom third of Obsidian's own modal container exposed — an opaque black
 * band, present before any keyboard appears. createOrbisPopup does not face this because it builds and positions its
 * own element and backdrop rather than reshaping Obsidian's modal chrome. Pinning on focusin and releasing on focusout
 * means the dialog is an ordinary centered modal until the moment the keyboard is actually coming.
 *
 * Uses the same reserve estimate as createOrbisPopup's positionMobilePopup, and for the same reason:
 * Obsidian's WkWebView does not resize when the keyboard appears — visualViewport and innerHeight
 * both keep reporting the full height with the keyboard overlapping the bottom — so the keyboard's
 * share has to be assumed rather than measured. A tablet keyboard takes a smaller share than a
 * phone's, hence the split.
 *
 * `heightLock` MATTERS as much as the positioning. When the keyboard opens, Obsidian's mobile WebView
 * reflows and the reader pane behind collapses, leaving a black gap for the dialog's lifetime — the
 * exact failure ReaderDom.lockHeights() exists to prevent, and which createOrbisPopup already avoids by
 * calling OrbisPopupHost.lockMobileHeights(). A Modal has no popup host, so any Modal with a text field
 * must pass one here. Optional only because a Modal can be opened with no book behind it.
 *
 * No-op on desktop. Returns a cleanup that detaches the resize listener, releases the lock and restores
 * the styles; call it from the modal's onClose.
 */
interface KeyboardPin {
  evaluate(): void;
}

/**
 * Every live pin, in creation order — which is also stacking order, since a child dialog is always
 * registered after its parent.
 *
 * Only the TOPMOST is shown. Two stacked dialogs on a phone-sized screen cannot both be readable, and neither
 * alternative keeps both positioned sensibly: releasing the parent drops it to center underneath the child, and holding
 * it lifted leaves the parent painted OVER the child on Android, because modal stacking is Obsidian's to decide and a
 * repositioned `fixed` parent does not reliably lose to a later sibling. Hiding the parent removes the question — and
 * drilling into one thing at a time is what a mobile master-detail flow does anyway.
 */
const keyboardPins: KeyboardPin[] = [];

/**
 * How a dialog answers the keyboard.
 *
 * - `lift` — pin it near the top and cap its height. For one field and two buttons.
 * - `reserve` — keep the dialog's shape and reserve the keyboard's share as padding. For a form.
 * - `none` — change nothing, and only join the stack, so a child dialog opening on top still hides this one.
 *   For a dialog whose fields are all near its top (the keyboard covers nothing that matters) or one that owns
 *   its own scrolling layout, where either treatment fights CSS it did not write.
 */
/**
 * How much of the screen the on-screen keyboard takes, as a fraction.
 *
 * **Assumed, because it cannot be measured.** Obsidian's WkWebView does not resize when the keyboard appears —
 * `visualViewport` and `innerHeight` both keep reporting the full height with the keyboard overlapping the
 * bottom — so every dialog that has to clear the keyboard works from this estimate. A tablet keyboard takes a
 * smaller share of a bigger screen than a phone's does.
 *
 * **One table, so the estimate has one home.** `applyLift`, `applyReserve` and `positionMobilePopup` all read it, twice
 * as the keyboard's share and once as its complement (0.58 = 1 - 0.42). Three copies of one estimate would be three
 * chances for a future correction to land in two of them.
 */
function keyboardShare(): number {
  const vp = activeWindow.visualViewport;
  const h = vp?.height ?? activeWindow.innerHeight;
  const w = vp?.width ?? activeWindow.innerWidth;
  return Platform.isPhone ? (h > w ? 0.42 : 0.52) : h > w ? 0.34 : 0.44;
}

/**
 * Put the focused field's top at the top of its scroller — by assigning `scrollTop`, not by asking.
 *
 * **`scrollIntoView` is not the only thing that scrolls a focused field.** The browser scrolls one itself, and on
 * Android it aims at where it believes the visual viewport is, which is not where the keyboard actually is (Obsidian's
 * WebView never resizes). The two together overshoot to the end of the scroll, leaving the field somewhere above the
 * fold. Measuring the two rects and assigning the difference cannot overshoot, and it is idempotent — so it can be
 * re-run to correct whatever the browser did afterwards.
 */
function alignFocusedToTop(root: HTMLElement, scroller: HTMLElement): void {
  const active = root.ownerDocument.activeElement;
  if (!active?.instanceOf(HTMLElement) || !scroller.contains(active)) return;
  const gap = active.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop = Math.max(0, scroller.scrollTop + gap - 4);
}

/** Only fields that summon a keyboard. A checkbox or color swatch focusing must not move a dialog. */
function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !['checkbox', 'radio', 'color', 'button', 'range', 'submit'].includes((el as HTMLInputElement).type);
}

/**
 * The field being typed into, brought into what is left above the keyboard.
 *
 * **A textarea is aligned by its TOP, an input by its middle.** Centring a tall field puts its first line off
 * the top of the visible strip — you start typing at a caret you cannot see — while centring a one-line input
 * is exactly right. The height of the thing is what decides, and a `textarea` is the tall one by definition.
 */
function scrollFocusedIntoView(root: HTMLElement): void {
  window.setTimeout(() => {
    const active = root.ownerDocument.activeElement;
    if (!active?.instanceOf(HTMLElement) || !root.contains(active)) return;
    active.scrollIntoView({ block: active.tagName === 'TEXTAREA' ? 'start' : 'center' });
  }, 0);
}

/**
 * **How far below the top of the screen a dialog opens on a phone — both families, one number.**
 *
 * `--orbis-pin-inset` is the same idea off a phone, and it is a proportion (8vh) because a large display has room to
 * spare and a dialog stuck to the ceiling of one reads as broken. A phone has no room to spare: 8vh of a phone screen
 * is another ~64px gone from a list that is already scrolling, so a dialog on a phone opens here, just clear of the
 * status bar. The modal takes it from the same constant rather than from a matching literal in the stylesheet, which is
 * how two numbers meant to be one drift apart.
 *
 * The bottom is NOT symmetrical on a phone, where the pinned modal stops above Obsidian's navbar instead — see
 * `--orbis-pin-bottom` in `OrbisModal`.
 */
export const MOBILE_DIALOG_TOP_PX = 30;

/**
 * `--orbis-pin-inset` in pixels.
 *
 * Measured off a probe because a custom property reads back as its own token — `getPropertyValue` returns the
 * string `"8vh"`, and resolving that here would mean a second copy of the unit arithmetic that could disagree
 * with the stylesheet. An empty fixed div of that height is the browser doing the conversion. `readSafeAreaInset`
 * reads `env()` the same way, for the same reason.
 *
 * Re-read on each placement rather than cached: `vh` moves when the device rotates, and rotation is exactly when
 * a popup re-places itself.
 */
function pinInsetPx(doc: Document): number {
  const probe = doc.body.createDiv({ cls: 'orbis-pin-inset-probe' });
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

export type KeyboardLayout = 'lift' | 'reserve' | 'none';

export function pinModalAboveKeyboard(
  modalEl: HTMLElement,
  heightLock?: { lockMobileHeights(): void; unlockMobileHeights(): void },
  opts: { layout?: KeyboardLayout } = {}
): () => void {
  const layout = opts.layout ?? 'lift';
  if (!Platform.isMobile) return () => {};

  /**
   * **Anchored in `.modal-container` rather than fixed to the viewport — which is what makes the caret visible on
   * iPadOS.** The container is already full-screen fixed, so every number below means the same thing either way; what
   * changes is that a focused field's ancestors do not include a fixed element. See `docs/design/dialog-system.md` for
   * the two conditions the bug takes and what must not regress.
   *
   * Its top padding then matters: `.orbis-modal-pin-top` pads the container by `--orbis-pin-inset`, and `top` on an
   * out-of-flow child is measured from the PADDING edge — so the same `top` would sit a whole inset below where `fixed`
   * puts it. Zeroed while pinned (`.orbis-fullscreen-modal` does the same, for the same reason) and restored on
   * release.
   *
   * Read on each apply rather than once, since these styles are re-applied as the viewport moves. Every caller passes
   * an Obsidian `Modal`'s element, so the container is always there; `fixed` is the fallback for a caller that ever
   * passes something else, rather than a broken absolute.
   */
  const containerOf = (): HTMLElement | null => modalEl.closest<HTMLElement>('.modal-container');
  const anchoring = (): 'absolute' | 'fixed' => (containerOf() ? 'absolute' : 'fixed');

  const vp = activeWindow.visualViewport;
  let pinned = false;

  /**
   * The element that scrolls. `reserve` needs one: padding under the last field only buys anything if that
   * padding can be scrolled into.
   */
  const scrollerOf = (): HTMLElement => modalEl.querySelector<HTMLElement>('.modal-content') ?? modalEl;

  /**
   * Reserve the keyboard's share at the bottom of the scroll, and change nothing else.
   *
   * **The dialog keeps its shape.** Filling the screen as well would change the frame: a dialog opened at its natural
   * size would become the whole screen the moment a field is tapped — on an iPad, where there is room to spare, for no
   * visible gain.
   *
   * The reserve is the half that does the work. `lift` caps the dialog to clear the keyboard, and because the keyboard
   * cannot be detected — Obsidian's WebView never resizes, so `everFocused` latches rather than tracking focus — that
   * cap stays for the dialog's life: type once and a full form is half a screen until you close it. Padding under the
   * last field has neither failure: every field can be scrolled clear of the keyboard, nothing is cut off, and the
   * frame never moves because it is never touched.
   *
   * **The reserve goes INSIDE the scroll, never on the dialog — including when there is a footer.** Shrinking the
   * dialog by the keyboard's share to hold its Cancel and Save above the keyboard is wrong twice over: the estimate is
   * a guess, so an Android keyboard taller than the guess (a suggestion strip adds a row) hides the buttons anyway, and
   * with the keyboard dismissed but the field still focused the whole dialog sits at 58% of the screen with the actions
   * floating in the middle of it and black below. Padding inside the scroll cannot be wrong in either direction: too
   * much is slack at the end of a scroll nobody notices, too little only costs a field its centring.
   *
   * The scroll frame is the dialog's own — `.orbis-modal-pinned` makes `.modal-content` a `min-height: 0` flex item
   * inside a capped column, on every screen, phones included. So this supplies the room and lets the existing layout
   * hold the shape.
   */
  const applyReserve = () => {
    const availH = vp?.height ?? activeWindow.innerHeight;
    // `orbis-keyboard-reserve` makes it scroll; see styles.css.
    scrollerOf().addClass('orbis-keyboard-reserve');
    scrollerOf().setCssStyles({ paddingBottom: `${Math.round(availH * keyboardShare())}px` });
    scrollFocusedIntoView(modalEl);
  };

  const applyLift = () => {
    const availH = vp?.height ?? activeWindow.innerHeight;
    const viewTop = vp?.offsetTop ?? 0;
    const contentFrac = 1 - keyboardShare();
    // The container's top padding goes (`orbis-keyboard-lifted-container`), and the modal's other three offsets and
    // its centring are fixed by `orbis-keyboard-lifted` — all four offsets, not just `top`: going out of flow takes
    // the modal out of the flex container that was centring it, and a half-positioned element keeps its remaining
    // offsets from the layout it just left. Both in styles.css.
    containerOf()?.addClass('orbis-keyboard-lifted-container');
    modalEl.addClass('orbis-keyboard-lifted');
    modalEl.setCssStyles({
      position: anchoring(),
      top: `${viewTop + 24}px`,
      maxHeight: `${Math.max(160, availH * contentFrac - 24)}px`,
    });
  };

  const applyStyles = () => {
    if (layout === 'reserve') applyReserve();
    else if (layout === 'lift') applyLift();
    // 'none' applies nothing — the registration in `keyboardPins` is the whole point of it.
  };

  const releaseStyles = () => {
    modalEl.setCssStyles({
      position: '',
      top: '',
      maxHeight: '',
      left: '',
      right: '',
      bottom: '',
      marginInline: '',
      width: '',
      maxWidth: '',
      margin: '',
      height: '',
      borderRadius: '',
      display: '',
      flexDirection: '',
      paddingBottom: '',
    });
    modalEl.removeClass('orbis-keyboard-lifted');
    scrollerOf().removeClass('orbis-keyboard-reserve');
    scrollerOf().setCssStyles({ flex: '', overflowY: '', paddingBottom: '', maxHeight: '' });
    containerOf()?.removeClass('orbis-keyboard-lifted-container');
    containerOf()?.setCssStyles({ paddingTop: '' });
  };

  let everFocused = false;
  let hidden = false;
  let locked = false;

  /**
   * Freeze the reader pane once, for this dialog's whole life.
   *
   * Tying it to the PIN would mean releasing and re-acquiring on every hide and unpin — and in those gaps the WebView
   * reflows while the keyboard is up, so the next lock would capture an already-collapsed pane and leave a black band
   * below. The lock is about the reader, not about where this dialog sits, so it is taken at first focus (before any
   * reflow) and released only when the dialog closes. ReaderDom ref-counts, so nested dialogs each holding one is fine.
   */
  const ensureLocked = () => {
    if (locked) return;
    locked = true;
    heightLock?.lockMobileHeights();
  };
  const setHidden = (next: boolean) => {
    if (next === hidden) return;
    hidden = next;
    // The CONTAINER, not the modal. Hiding `.modal` collapses the dialog to 0×0 but leaves its `.modal-container
    // mod-dim` parent full-screen, so the backdrop remains and the screen is dimmed twice over, which reads as the
    // parent dialog still being there. The container holds both the dialog and its backdrop, so hiding it removes them
    // together.
    // !important via setImportantStyle: Obsidian declares modal display with !important, which a plain
    // inline value loses to.
    const target = modalEl.parentElement ?? modalEl;
    if (next) setImportantStyle(target, 'display', 'none');
    else target.style.removeProperty('display');
  };

  const setPinned = (next: boolean) => {
    if (next === pinned) return;
    pinned = next;
    if (next) {
      applyStyles();
      vp?.addEventListener('resize', applyStyles);
    } else {
      vp?.removeEventListener('resize', applyStyles);
      releaseStyles();
    }
    // This state change may change what every other stacked pin should do.
    notifyOthers();
  };

  const hasFocusedField = (): boolean => {
    const active = modalEl.ownerDocument.activeElement;
    return !!active && modalEl.contains(active) && isTextField(active);
  };

  const notifyOthers = () => {
    for (const other of keyboardPins) if (other !== self) other.evaluate();
  };

  const self: KeyboardPin = {
    evaluate: () => {
      const idx = keyboardPins.indexOf(self);
      // Already unregistered (a closing dialog can still be notified) — nothing to decide, and acting on
      // idx === -1 would hide a modal on its way out.
      if (idx < 0) return;
      const isTop = idx === keyboardPins.length - 1;
      // Hidden rather than repositioned while something is stacked above: no overlap to arbitrate, and
      // the pin below is released so an invisible dialog is not also holding the reader's heights.
      setHidden(!isTop);
      // Latched on first focus, held for the dialog's lifetime. Releasing on focus loss would drop the dialog from the
      // top back to center mid-edit — Android does not reliably keep a dialog's input focused, and the keyboard cannot
      // be detected directly (Obsidian's WebView never resizes), so "focused right now" is not a usable proxy for
      // "keyboard is up". Staying lifted is safe because the pin also holds the reader's heights, so the space below is
      // dimmed page rather than a black gap.
      if (hasFocusedField()) {
        everFocused = true;
        ensureLocked();
      }
      const wasPinned = pinned;
      setPinned(isTop && everFocused);
      // Moving from one field to the next does not change the pin, so nothing above would have scrolled — but
      // the next field still has to be brought above the keyboard, which is what `applyReserve` ends with.
      // Re-applied on every focus change while reserved, not only when the pin itself flips.
      if (layout === 'reserve' && pinned && wasPinned) applyReserve();
    },
  };
  keyboardPins.push(self);
  notifyOthers();

  const onFocusIn = () => self.evaluate();
  // Deferred: moving between two fields fires focusout before the next focusin, and re-evaluating in
  // between would drop the modal and lift it again on every tab.
  const onFocusOut = () => window.setTimeout(() => self.evaluate(), 60);

  modalEl.addEventListener('focusin', onFocusIn);
  modalEl.addEventListener('focusout', onFocusOut);

  return () => {
    modalEl.removeEventListener('focusin', onFocusIn);
    modalEl.removeEventListener('focusout', onFocusOut);
    // Removed BEFORE unpinning, so the notification that follows sees no child above the parent — which
    // is what lets a parent settle back to center once its child closes.
    const at = keyboardPins.indexOf(self);
    if (at >= 0) keyboardPins.splice(at, 1);
    setPinned(false);
    setHidden(false);
    notifyOthers();
  };
}

// Open Orbis popups' close functions, most-recently-opened last. Escape and
// outside-click are handled per-popup via a listener on document, but each
// listener only acts if its own popup is the topmost one currently open —
// otherwise, with two popups open (e.g. the "replace existing notes?"
// confirm dialog on top of Generate Notes), a single Escape press or an
// outside click would fire every open popup's listener and cascade-close
// all of them instead of just the topmost.
const openPopupStack: Array<{ close: () => void; el: HTMLElement }> = [];

/**
 * Is one of our popups on screen right now?
 *
 * For a real `Modal` opened FROM a popup — "Create folder" from the export dialog. A popup is a `div` on the body at
 * `z-index: 100000`, which it has to be to clear focus mode; Obsidian's modal container sits far below that, so a modal
 * opened over a popup would render *underneath* it.
 *
 * Asked rather than assumed, because the stack runs both ways: the presets manager is a Modal that opens popups of
 * its own, and raising every modal above every popup would bury those instead. See `OrbisModal.onOpen`.
 */
export function popupIsOpen(): boolean {
  return openPopupStack.length > 0;
}

/**
 * The popup nearest the top of the stack, or null.
 *
 * **So a closing `Modal` can hand the keyboard back to a POPUP underneath it.** `OrbisModal` keeps its own register of
 * open modals and returns focus into the last one; a popup is not in that register, so a modal opened over one — the
 * replace-or-cancel prompt over Save as PDF — would find nothing beneath it and leave Obsidian's default to drop focus
 * on the book behind everything. Cancelling a prompt should give the keyboard back to the dialog that asked.
 */
export function topmostPopupEl(): HTMLElement | null {
  const top = openPopupStack[openPopupStack.length - 1]?.el;
  return top?.isConnected ? top : null;
}

/**
 * What dialogs are on screen right now, by their headings — for the debug log.
 *
 * **Names rather than a count, because a count is not an answer.** A line reading `dialogs=1` at the moment a
 * question was answered could be the dialog on its way out or a second copy of the same question hidden behind the
 * first (`pinModalAboveKeyboard` shows only the topmost), and those need opposite fixes. The heading tells them
 * apart.
 */
export function liveDialogTitles(): string[] {
  return Array.from(activeDocument.querySelectorAll<HTMLElement>('.orbis-modal')).map(
    (el) => el.querySelector('.orbis-dialog-title')?.textContent?.trim() || '(untitled)'
  );
}

/**
 * Should a closing popup hand the keyboard back to whatever opened it?
 *
 * Told from two numbers: where the popup sat in the open stack, and how many popups are left once it has been taken
 * out. Anything remaining at or above its old index was opened *after* it and is on screen now — that is a handover,
 * and the popup behind must not pull focus out of it. Anything remaining below it is its own parent, still open and
 * still owed the keyboard.
 *
 * Its own line and its own test because the coarse version of this rule — "any popup still open means a handover" —
 * drops focus entirely every time a confirm closes over the dialog that raised it.
 */
export function popupHandedOver(stackIdx: number, remaining: number): boolean {
  if (stackIdx === -1) return false; // already off the stack: nothing was handed anywhere
  return remaining > stackIdx;
}

export interface OrbisPopupHandle {
  popupEl: HTMLElement;
  /** The heading's TEXT span, for a dialog whose title tracks what it is showing (the recordings
   *  master-detail). Not the row: writing to that would take the icon with it. */
  titleEl: HTMLElement;
  close: () => void;
  // Re-runs mobile position/size calculation (top + keyboard-safe maxHeight).
  // Callers whose content changes height after open — e.g. an expanding
  // "Advanced" section — should call this afterward so the popup's maxHeight
  // ceiling reflects current content instead of whatever was measured at open
  // time. No-op on desktop, where the popup isn't height-capped the same way.
  reposition: () => void;
}

// Shared scaffolding for Orbis's custom (non-Modal) floating popups — backdrop,
// background, corner radius, title, close button, Escape-to-dismiss, and
// keyboard-aware positioning (desktop: centered on the reader pane; mobile: pinned
// below the toolbar, tracking visualViewport since Obsidian's mobile WebView doesn't
// resize when the keyboard opens). Every Orbis popup dialog should build on this instead of hand-rolling its own copy:
// a hand-rolled dialog quietly drifts from the others, and one shared implementation prevents that by construction.
//
// Returns the popup element (append whatever dialog-specific content is needed to
// it, after the title/close button this already adds) and a close() function. The
// caller owns its own single-instance tracking (a `xPopupEl`/`xPopupCleanup` field
// guarding re-entrant opens, as OrbisReaderView already does for each popup type) —
// this only manages one popup's own DOM/listener lifecycle, not whether more than
// one can be open at once.
export function createOrbisPopup(
  host: OrbisPopupHost,
  opts: {
    title: string;
    /**
     * An inline SVG string to sit before the title — the glyph of the control that OPENED this dialog, so
     * the thing you tapped and the thing that opened wear the same mark. Decoration is not the point:
     * only a dialog with a persistent launcher gets one, and it is that launcher's own glyph. A confirm or
     * a name prompt has no launcher and takes no icon. See docs/design/dialog-system.md.
     *
     * Rendered at 16px whatever the caller passes — CSS pins it, so the size cannot drift between dialogs.
     */
    icon?: string;
    // Some dialogs (the note editor) deliberately don't want this — accidentally
    // dismissing mid-note would lose unsaved text. Default true for dialogs with
    // nothing to lose (go-to, link preview).
    dismissOnOutsideClick?: boolean;
    desktopWidth?: string;
    mobileMaxWidth?: number;
    // Target a fraction of the available width on mobile (0–1) instead of a fixed max, so the popup
    // uses the space on wide screens (e.g. iPad). Still clamped by `mobileMaxWidth` (if set) and the
    // usable width. Omit for the fixed-width default.
    mobileWidthPct?: number;
    // By default the mobile popup is capped to the upper ~half of the screen,
    // permanently reserving room for a keyboard that might open — needed for
    // dialogs like go-to and the note editor, which auto-focus a field the
    // instant they open, so the *entire* popup must already fit above the
    // keyboard by the time it appears. Set this for content-heavy dialogs that
    // don't auto-focus anything (generate notes, export): the popup uses nearly
    // the full screen, scrolling internally like an ordinary mobile web form —
    // if the user later taps a field, the keyboard may cover part of it, but
    // that's the normal type → dismiss keyboard → scroll pattern, not a case
    // that needs defending against with a permanent height cap.
    /**
     * `'landscape'` takes the whole height only when the screen is wider than it is tall.
     *
     * For a dialog with fixed chrome — a title and a footer — the space above a landscape phone keyboard is
     * about 200px, and roughly 90px of that is the chrome. Nothing useful fits in what is left, at any dialog
     * height, so landscape has to scroll while portrait has room to be a complete dialog. The note editor is
     * the case: see the note at its `createOrbisPopup` call.
     */
    mobileFillHeight?: boolean | 'landscape';
    // Like the default (keyboard-safe height cap), but also stretches the popup TO that height on
    // mobile — so a flex child (e.g. the note editor's textarea, flex:1) grows to fill the space
    // instead of the dialog sitting content-short with a big gap above the keyboard.
    mobileFillAvailable?: boolean;
    // Off for the link preview popup — it's a lightweight, non-blocking preview
    // anchored next to a link, not meant to dim the whole reading view.
    showBackdrop?: boolean;
    // The mobile height-lock freezes the reader to its height at open time so it
    // doesn't reflow while a dialog with a text field opens the on-screen keyboard.
    // Dialogs with NO input should turn it off: the lock does nothing for them, and
    // when launched from the command palette (keyboard dismissing) it can snapshot a
    // keyboard-reduced height and freeze the reader short. Default on.
    lockMobileHeights?: boolean;
    zIndex?: number;
    /** Desktop: place the popup just BELOW this rect (centered on it) instead of centered in the window.
     *  **The one exception to window-centring**, and the test for earning it is narrow: the dialog acts on a
     *  specific thing you just pointed at, and losing the pointer's position costs you. The marks overflow off
     *  the annotation bar is the only one — it is a continuation of that bar, and reads as detached when it
     *  lands in the middle of the page. Ignored on mobile, where the popup is pinned near the top for keyboard
     *  reasons and there is no room to be choosy. */
    anchorRect?: DOMRect;
    onClose?: () => void;
    /**
     * Intercept a DISMISS gesture — the ×, Escape, a click outside. Return true to say the gesture was handled
     * and the popup should stay open; false (or omit the option) to close as usual.
     *
     * **For a dialog that navigates within itself.** Recordings & mixes is one popup with a library and two
     * detail screens, each detail reached from the library and offering a Back button out of it. The × on such
     * a screen is the same request as that Back button — the reader is dismissing the screen they opened, not the
     * dialog they opened it from — and closing outright would throw away the list they are working through.
     *
     * Deliberately not consulted by the `close()` this returns: a programmatic close means close.
     */
    onDismiss?: () => boolean;
    /**
     * **The popup does not scroll; a body inside it does.** By default the popup itself is the scroller, which puts a
     * footer's buttons at the end of the content, reachable only by scrolling past it. With this the popup is a column
     * that never scrolls: the caller's `.orbis-popup-scroll` body takes the space left and scrolls inside it, and a
     * footer beside it holds its ground. `.orbis-popup-scroll` is also where the keyboard's share is reserved.
     */
    scrollsInside?: boolean;
  }
): OrbisPopupHandle {
  const dismissOnOutsideClick = opts.dismissOnOutsideClick ?? true;
  const showBackdrop = opts.showBackdrop ?? true;
  const lockHeights = opts.lockMobileHeights ?? true;

  if (Platform.isMobile && lockHeights) host.lockMobileHeights();

  const backdrop = showBackdrop ? activeDocument.body.createDiv({ cls: 'modal-bg' }) : null;
  if (backdrop) {
    Object.assign(backdrop.style, { zIndex: '99998' });
  }

  /**
   * Whatever had the keyboard when this opened — see the note in `close`. Read before anything is built.
   *
   * **Its KEY as well as the element**, because the surface behind can be rebuilt while this is open: change a voice
   * in the picker and the panel that opened it redraws to show the new name, so the button that was remembered is
   * detached by the time the picker closes. The key finds the replacement.
   */
  const focusedAtOpen = activeDocument.activeElement;
  const opener = focusedAtOpen?.instanceOf(HTMLElement) ? focusedAtOpen : null;
  const openerKey = opener?.dataset.orbisFocus ?? null;
  const popupEl = activeDocument.body.createDiv({ cls: 'orbis-popup' });
  /**
   * A class on the root, though everything here is styled inline: two things need to ask "is this inside one of our
   * dialogs" — the focus trap below, and the reader's own keys, which must not turn pages behind an open note editor.
   */
  let removeVpResizeListener: (() => void) | null = null;
  let reposition: () => void = () => {};

  trapTab(popupEl);
  /**
   * **The dialog takes the keyboard as it opens**, or the trap above holds nothing.
   *
   * A popup is appended to `document.body`, so it is last in the tab order: with focus left wherever it was — the
   * reading host, a toolbar button, the book itself — Tab would walk the whole app before arriving.
   *
   * The ROOT rather than the first control: it is focusable but not tabbable, so the first Tab moves to the first
   * thing in the dialog, and a dialog that wants a field focused instead still gets it — those calls happen in the
   * builder, after this. The reader's own keys stand down for `.orbis-popup`, so holding focus here turns no pages.
   *
   * The focus itself is taken a tick later, once the caller's content exists — see the deferred block near the end of
   * this function. Every popup takes it, the link preview included: one that declined would leave its *Go* button out
   * of the keyboard's reach while Tab carried on through the links in the book behind it.
   */
  popupEl.tabIndex = -1;

  if (Platform.isMobile) {
    Object.assign(popupEl.style, {
      position: 'fixed',
      background: 'var(--background-primary)',
      border: '1px solid var(--background-modifier-border)',
      borderRadius: 'var(--radius-m, 6px)',
      padding: '10px',
      zIndex: String(opts.zIndex ?? 100000),
      boxShadow: '0 4px 12px rgba(0,0,0,.25)',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      boxSizing: 'border-box',
      overflowY: opts.scrollsInside ? 'hidden' : 'auto',
      overflowX: 'hidden',
    });

    // Position popup just below the toolbar rather than deriving its top from its
    // own height: that requires knowing the popup's rendered height, which isn't
    // available until its content exists, and produces a vertically-centered-
    // looking position rather than a fixed one pinned near the top. Height is
    // capped to the keyboard-safe zone; the popup itself scrolls if content
    // doesn't fit.
    // Obsidian's WkWebView does not resize when the keyboard appears — visualViewport
    // and window.innerHeight both report the full WkWebView height with the keyboard
    // overlapping the bottom. Typical keyboard heights: ~36% of height in portrait,
    // ~47% in landscape. We reserve 42% (portrait) and 52% (landscape) as keyboard territory.
    /**
     * The keyboard reserve: padding under the last field so it can be scrolled clear.
     *
     * **Applied from inside `positionMobilePopup`, not once on focus.** Set once, it would keep the pixel count from
     * whichever orientation was current when the field was tapped — so rotating would leave a landscape popup holding a
     * reserve computed from the portrait height, pushing its content and its buttons below the visible area. Anything
     * derived from the viewport has to be re-derived when the viewport changes, and this function is already what runs
     * on that.
     */
    let reserved = false;
    /** The element the reserve was last applied to, so it is the only one ever cleared. */
    let reserveOn: HTMLElement | null = null;
    const popupScroller = (): HTMLElement => popupEl.querySelector<HTMLElement>('.orbis-popup-scroll') ?? popupEl;

    const positionMobilePopup = () => {
      const vv = activeWindow.visualViewport;
      const availW = vv?.width ?? activeWindow.innerWidth;
      const availH = vv?.height ?? activeWindow.innerHeight;
      const viewTop = vv?.offsetTop ?? 0;

      // Keyboard-safe content fraction. A tablet keyboard (iPad) takes a smaller share of the
      // screen than a phone's, so reserve less there — the popup (e.g. the note editor) gets more
      // height without pushing its buttons under the keyboard.
      const contentFrac = 1 - keyboardShare();
      // Resolved per pass, not once: `'landscape'` is a question about the CURRENT orientation, and this
      // function is what re-runs when that changes.
      const fillHeight = opts.mobileFillHeight === true || (opts.mobileFillHeight === 'landscape' && availW > availH);
      const safeH = fillHeight ? availH : availH * contentFrac;
      // Percentage-based when mobileWidthPct is set (uses the space on tablets), else a fixed cap.
      // Always clamped by the usable width and mobileMaxWidth.
      const w = Math.min(availW - 16, availW * (opts.mobileWidthPct ?? 1), opts.mobileMaxWidth ?? 360);
      popupEl.style.width = `${w}px`;
      popupEl.style.left = `${Math.max(8, (availW - w) / 2)}px`;
      /**
       * **One height for every dialog on the device.**
       *
       * A phone takes `MOBILE_DIALOG_TOP_PX`, just clear of the status bar, because 8vh of a phone screen is room a
       * scrolling list needs. Anything larger takes `--orbis-pin-inset`, where a Modal opens.
       *
       * **Every popup covers the reader's toolbar.** The ~50-60px that frees is the difference between a lower field
       * clearing the keyboard or not, and a per-dialog opt-in for the common case is a judgment call to get wrong on
       * each new dialog — the drift shows up as dialogs that open at different heights on one screen. Look-up gains
       * too: below the toolbar it would read as anchored to the selection, which it is not.
       */
      const top = viewTop + (Platform.isPhone ? MOBILE_DIALOG_TOP_PX : pinInsetPx(popupEl.doc));
      const maxH = Math.max(120, viewTop + safeH - top - 10);
      popupEl.style.top = `${top}px`;
      popupEl.style.maxHeight = `${maxH}px`;
      /**
       * A DEFINITE height, so a flex column inside can distribute space: a `flex: 1` child of an auto-height column has
       * no free space to grow into, so a note field asking for `flex: 1 1 auto` would sit at its minimum with the
       * dialog empty below it.
       *
       * **Phones included.** A phone keyboard is taller than the reserve estimate, so filling would push the buttons
       * under it in a dialog whose buttons are the last thing in its scroll — but the callers that ask for this put
       * their buttons in a footer beside the scroll, and `safeH` has already kept the whole dialog clear of the
       * keyboard.
       */
      const definiteHeight = !!opts.mobileFillAvailable;
      popupEl.style.height = definiteHeight ? `${maxH}px` : '';
      /**
       * The reserve belongs only where the dialog extends behind the keyboard. A capped dialog is already clear
       * of it, so padding there is dead space — and it is cleared on rotation into portrait rather than left
       * behind, because `fillHeight` can change under a dialog that is already open.
       *
       * **Only ever written on the element it was applied to.** This function runs once from inside `createOrbisPopup`,
       * BEFORE the caller has created its `.orbis-popup-scroll` body, so `popupScroller()` falls back to the popup
       * itself — and clearing `paddingBottom` there unconditionally would wipe the popup's own `padding: 10px`
       * shorthand, leaving every popup with a footer with its buttons flush against the bottom edge.
       */
      if (reserved && fillHeight) {
        reserveOn = popupScroller();
        reserveOn.setCssStyles({ paddingBottom: `${Math.round(availH * keyboardShare())}px` });
      } else if (reserveOn) {
        reserveOn.setCssStyles({ paddingBottom: '' });
        reserveOn = null;
      }
    };
    positionMobilePopup();
    reposition = positionMobilePopup;

    /**
     * **Room to scroll a field out from under the keyboard.**
     *
     * The height cap above is supposed to keep the whole popup clear of the keyboard, and for a short popup it
     * does. It cannot for the three big ones — Save as PDF, Export to vault and Generate notes all pass
     * `mobileFillHeight`, which sets `safeH` to the WHOLE height on purpose (a form that needs the room), so
     * they extend behind the keyboard by design. With the content ending exactly where the content ends, a field
     * near the bottom is then unreachable: there is nothing below it to scroll into.
     *
     * The estimate cannot save this either. A phone keyboard with a predictive-text strip is taller than
     * `keyboardShare()` assumes, so the cap is a guess in a direction that costs a field, while padding is a guess in a
     * direction that costs nothing: too much is slack at the end of a scroll nobody notices.
     *
     * So the reserve is padding, added on the first focus of a text field and kept while the popup lives, for
     * the reason `pinModalAboveKeyboard` latches its own: the keyboard cannot be detected, so "focused right
     * now" is not a usable proxy for "the keyboard is up". This is the popup half of `applyReserve`, and it
     * reads the same estimate so the two families cannot drift.
     */
    // **Only for a popup that opted OUT of the cap.** `mobileFillHeight` is the option that says "give me the
    // whole height", and taking the whole height is what puts content behind the keyboard. A popup without it is
    // already capped to the keyboard-safe zone by `safeH` above, so it clears the keyboard already and padding
    // would be dead space — a third of the note editor, whose `mobileFillAvailable` textarea is meant to grow
    // into that height rather than sit above a gap.
    if (opts.mobileFillHeight) {
      // Latched whenever this dialog can EVER fill; whether the reserve applies is decided per layout pass.
      popupEl.addEventListener('focusin', (evt) => {
        if (!isTextField(evt.target)) return;
        if (!reserved) {
          reserved = true;
          positionMobilePopup(); // one place computes it, so rotation recomputes it
        }
        /**
         * Every focus change, not only the first: the next field has to come out from under the keyboard too.
         * Twice — once now, and once after the browser has done its own focus scroll, which happens later and
         * would otherwise be the last word.
         */
        const align = () => alignFocusedToTop(popupEl, popupScroller());
        window.setTimeout(align, 0);
        window.setTimeout(align, 250);
      });
      /**
       * **Released when nothing is being typed into — unlike the modal pin, which latches.**
       *
       * `pinModalAboveKeyboard` holds its layout for the dialog's life because releasing a FRAME mid-edit would drop
       * the dialog from the top back to center, and Android does not reliably keep an input focused. Padding has no
       * such cost: taking it off restores the space and putting it back is invisible. Keeping it is actively wrong in a
       * dialog whose middle is a `flex: 1` field — the note editor would give the reserve 42% of the screen and the
       * field would shrink by exactly that, leaving a permanent void under it once you had typed once.
       *
       * Deferred a tick because focusout fires before the next focusin: moving between two fields must not
       * drop the reserve and put it straight back.
       */
      popupEl.addEventListener('focusout', () => {
        window.setTimeout(() => {
          const active = popupEl.ownerDocument.activeElement;
          if (active?.instanceOf(HTMLElement) && popupEl.contains(active) && isTextField(active)) return;
          if (!reserved) return;
          reserved = false;
          if (reserveOn) {
            reserveOn.setCssStyles({ paddingBottom: '' });
            reserveOn = null;
          }
        }, 0);
      });
    }

    /**
     * **Positioned again once the rotation has settled, not only while it is happening.**
     *
     * Every number here comes off `visualViewport`, and iOS fires `resize` DURING a rotation, when `offsetTop`,
     * `height` and `width` can all still be mid-flight. A popup placed only from those transitional numbers would stay
     * where they put it — the note editor at the bottom of the screen after a rotate-and-rotate-back, *sometimes*,
     * since it is a race with the animation. The trailing pass costs one timer and makes the final geometry the one
     * that wins.
     */
    const vp = activeWindow.visualViewport;
    let settle: number | null = null;
    const repositionAndSettle = () => {
      positionMobilePopup();
      if (settle !== null) window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = null;
        positionMobilePopup();
      }, 250);
    };
    vp?.addEventListener('resize', repositionAndSettle);
    removeVpResizeListener = () => {
      vp?.removeEventListener('resize', repositionAndSettle);
      if (settle !== null) window.clearTimeout(settle);
    };
  } else {
    /**
     * **The window, not the reader pane.**
     *
     * Centring on `host.contentEl` would keep clear of the sidebar, but it is the wrong rule beside the other family:
     * Obsidian centers a `Modal` on the window, and confirmations exist in BOTH — so the same kind of question would
     * land in two different places depending on which route reached it. A dialog that moves according to how you got
     * there is worse than one that overlaps a sidebar.
     *
     * The backdrop settles it. A popup already draws Obsidian's own `.modal-bg` across the whole window (below), so
     * centring on the pane would dim everything and then center on a fraction of what it dimmed. Overlapping the
     * sidebar is not a trespass for a surface that has already claimed the window.
     *
     * `activeWindow` rather than the pane's, so a popup opened in a popped-out window centers on THAT window.
     */
    const win = host.contentEl.win ?? activeWindow;
    const centerX = win.innerWidth / 2;
    const anchor = opts.anchorRect;
    Object.assign(popupEl.style, {
      position: 'fixed',
      /**
       * **A fixed inset from the top, not centered.** Centring means the top moves by half of every height
       * change, so a fold that opens or a control that appears drags whatever sits above it — including the
       * thing just clicked. Look-up manages it without being touched at all: it opens saying "Looking up…" and
       * grows when the senses arrive.
       *
       * `--orbis-pin-inset` is the same variable `.orbis-modal-pin-top` pads by, so a popup confirm and a modal
       * confirm open at the same height. Nothing is measured — the popup's content is built by its caller after
       * this returns, so there is no height to read here, and a placement that waited a frame to measure would
       * be wrong for every dialog that fills itself asynchronously.
       */
      top: anchor ? `${anchor.bottom + 6}px` : 'var(--orbis-pin-inset)',
      left: anchor ? `${anchor.left + anchor.width / 2}px` : `${centerX}px`,
      transform: 'translateX(-50%)',
      background: 'var(--background-primary)',
      border: '1px solid var(--background-modifier-border)',
      borderRadius: 'var(--radius-l, 8px)',
      padding: '16px',
      zIndex: String(opts.zIndex ?? 100000),
      width: opts.desktopWidth ?? '320px',
      // Capped to what is left below the top edge, so a long list scrolls inside the dialog instead of running
      // off the bottom of the window. The inset above plus `--orbis-pin-bottom` below — the arithmetic
      // `.orbis-modal-pinned` does, from the same two variables, which on a desktop are the same number.
      maxHeight: anchor
        ? `calc(100vh - ${Math.round(anchor.bottom + 6)}px - 16px)`
        : 'calc(100vh - var(--orbis-pin-inset) - var(--orbis-pin-bottom))',
      overflowY: opts.scrollsInside ? 'hidden' : 'auto',
      // Explicit, like the mobile branch: `visible` on the other axis computes to `auto` beside `overflow-y: auto`, so
      // one child a pixel too wide grows a horizontal scrollbar across the foot of the dialog. Same trap as
      // `.orbis-presets-modal .modal-content`.
      overflowX: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,.4)',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    });
  }

  const titleRow = popupEl.createDiv({ cls: 'orbis-dialog-title' });
  if (opts.icon) setSvgIcon(titleRow.createSpan({ cls: 'orbis-title-icon' }), opts.icon);
  const titleTextEl = titleRow.createSpan({ text: opts.title });

  const closeX = popupEl.createEl('button', { cls: 'orbis-popup-close-btn', attr: { type: 'button' } });
  setIcon(closeX, 'x');
  closeX.setAttribute('aria-label', t('action.close'));
  /** Every way the USER asks for this popup to go away. `close()` itself stays the unconditional teardown. */
  const requestClose = (): void => {
    if (opts.onDismiss?.()) return;
    close();
  };
  closeX.addEventListener('click', () => requestClose());

  const isTopmost = () => openPopupStack[openPopupStack.length - 1]?.close === close;
  const onOutsideClick = (ev: MouseEvent) => {
    // **A click in a dialog above is not a click outside.** A `Modal` opened over this popup — Listen needs a voice,
    // over Look up — is part of what the popup is doing; closing the popup under it took the Speak that was waiting
    // on the download, so the voice arrived and the word was never said.
    if ((ev.target as HTMLElement | null)?.closest?.('.modal-container')) return;
    if (isTopmost() && !popupEl.contains(ev.target as Node)) requestClose();
  };
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    /**
     * **Somebody above us already answered this Escape.**
     *
     * `isTopmost` compares this popup against the other POPUPS; a real `Modal` keeps a register of its own, so a popup
     * with a modal on top of it still believes itself topmost, and one Escape would close both — the replace-or-cancel
     * prompt over Save as PDF would take the whole export dialog with it.
     *
     * Obsidian closes a `Modal` from its own keymap, registered at app startup — so it runs before any
     * listener a popup adds, in either phase, and the modal is out of the document before this handler or a
     * capture-phase watcher of ours ever sees the key. Asking whether a modal is on screen therefore cannot
     * work; it is always answered too late.
     *
     * What survives is the event itself. Focus lives inside a modal while it is open, so the keydown's target
     * is one of its elements — and once that modal is torn down, the target is no longer in the document. A
     * detached target means this keystroke has already closed something on top of us, and closing again would
     * take two dialogs for one press.
     */
    const target = e.target;
    const consumed = target instanceof Node && !target.isConnected;
    if (isTopmost() && !consumed) requestClose();
  };

  const close = () => {
    const stackIdx = openPopupStack.findIndex((p) => p.close === close);
    if (stackIdx !== -1) openPopupStack.splice(stackIdx, 1);
    /**
     * **How many popups were on screen once this one had gone**, so a claim below can tell whether something has opened
     * since. `popupHandedOver` catches the case where the replacement was already open when this closed; this catches
     * the other order, where it opens a moment AFTER. Pressing Save in "Generate notes file" does exactly that: the
     * dialog closes, the note is read and diffed, and the merge review opens — and the focus claim's last attempt lands
     * 60ms later, by which time the review has taken the keyboard, so without this it would pull the keyboard straight
     * back out to the button behind. It is a race with however long the diff takes.
     */
    const popupsAfter = openPopupStack.length;
    /** Stand down if a popup has opened since: whatever it is, it is in front of us and it owns the keyboard. */
    const stillOurs = (): boolean => openPopupStack.length <= popupsAfter;
    /**
     * **Hand the keyboard back to whatever opened this.**
     *
     * Obsidian does this for a `Modal` and nothing does it for a popup, so closing one would leave focus on `body` —
     * from where Tab walks the page behind and the next keystroke belongs to whoever is listening. Saving a respelling
     * in the glossary editor, which the look-up popup opens from its pronunciation button, should put the reader back
     * on that button.
     *
     * Only when focus is still INSIDE the popup (or already lost): a reader who clicked away has chosen where they
     * are, and dragging them back would be the popup arguing with them. And only to an element still in the
     * document — the surface behind may have been rebuilt while this was open.
     */
    const doc = popupEl.ownerDocument;
    const inside = !!doc.activeElement?.instanceOf(Node) && popupEl.contains(doc.activeElement);
    const stray = doc.activeElement === null || doc.activeElement === doc.body;
    popupEl.remove();
    backdrop?.remove();
    removeVpResizeListener?.();
    removeVpResizeListener = null;
    activeDocument.removeEventListener('keydown', onKeydown);
    if (dismissOnOutsideClick) activeDocument.removeEventListener('click', onOutsideClick, true);
    // Delay height unlock until after the keyboard has fully dismissed. Unlocking
    // immediately (while the keyboard is still visible) shrinks the container,
    // which causes Foliate to re-render at keyboard-height column widths; when the
    // keyboard then dismisses and the container grows back, the scroll offset from
    // the shrunken layout doesn't map correctly and the view lands one page back.
    if (Platform.isMobile && lockHeights) {
      window.setTimeout(() => host.unlockMobileHeights(), 100);
    }
    /**
     * **Not when this popup handed over to another one — but a child closing over its parent is not a handover.**
     *
     * A dialog that opens a second dialog and closes itself — "Manage recordings & mixes" does exactly that — would
     * otherwise put the keyboard back on the button that opened IT, behind the dialog now on screen, which then cannot
     * be tabbed until it is clicked.
     *
     * The stack position is what tells the two apart; asking only whether *any* popup is still open conflates them: a
     * confirm opened FROM this dialog sits above it, so when the confirm closed the guard would fire and focus go
     * nowhere at all — from where Tab restarts at the top of the app and walks the reader's own toolbar. So: skip the
     * restore only when a popup opened AFTER this one is still on screen (an index at or above the one this occupied),
     * never when the survivor is beneath it.
     */
    if (popupHandedOver(stackIdx, openPopupStack.length)) return;
    if (inside || stray) {
      const again =
        opener?.isConnected === true
          ? opener
          : openerKey
            ? doc.querySelector<HTMLElement>(`[data-orbis-focus="${CSS.escape(openerKey)}"]`)
            : null;
      if (again) claimFocusSoon(again, stillOurs);
      /**
       * **And if the opener is gone by the time the claim lands, the dialog behind catches the keyboard.**
       *
       * `claimFocusSoon` gives up on a detached element, which is exactly what the button that opened this popup often
       * becomes: confirming a recording run replaces *Generate* with *Stop*, so all three attempts would find nothing
       * and focus would stay on the document — where Tab restarts at the top of the app and walks the reader's toolbar.
       * The same rule `captureFocus` follows for one surface, applied across two: landing on the dialog itself is
       * imperfect, landing outside every dialog on screen is a different window.
       *
       * Withdraws the moment anything else holds focus, so the opener claim above always wins when it can.
       */
      const behind = openPopupStack[openPopupStack.length - 1]?.el;
      if (behind) {
        claimFocusSoon(behind, () => {
          if (!stillOurs()) return false; // a newer popup is in front of this surface
          const now = behind.ownerDocument.activeElement;
          return now === null || now === behind.ownerDocument.body;
        });
      }
    }
    opts.onClose?.();
  };

  openPopupStack.push({ close, el: popupEl });
  activeDocument.addEventListener('keydown', onKeydown);
  if (dismissOnOutsideClick) {
    // Deferred registration: the click that opened this popup (e.g. a toolbar
    // button) is still propagating when this runs; a capture-phase listener added
    // synchronously would not normally re-fire for that same event, but this
    // mirrors the already-proven defer used by the link preview popup rather than
    // relying on that timing assumption.
    window.setTimeout(() => activeDocument.addEventListener('click', onOutsideClick, true), 0);
  }

  /**
   * Taken a frame later, not here: the click that opened this dialog is still propagating, and on mobile the tap that
   * raised it can hand focus back afterwards. A dialog that focuses a field of its own does so in the builder, which
   * runs after this function returns and before this fires — so it wins, which is what we want.
   */
  window.setTimeout(() => {
    if (!popupEl.isConnected) return;
    /**
     * **The × goes last in the tab order**, though it is drawn first and sits top-right.
     *
     * It is `position: absolute`, so where it lives in the DOM costs its appearance nothing — and created early it
     * would be the first thing Tab reaches in every dialog. "Close" is not the first thing anybody wants to be offered
     * on entering a dialog; it is the last resort, and Escape already covers it. Moved after the content, which the
     * caller adds once this function has returned — hence a frame's wait.
     */
    popupEl.appendChild(closeX);
    const active = activeDocument.activeElement;
    if (active && popupEl.contains(active)) return;
    popupEl.focus();
  }, 0);

  return { popupEl, titleEl: titleTextEl, close, reposition };
}

/**
 * A one-line note that expands to the rest of the explanation.
 *
 * For help text that earns its keep the first time and is in the way every time after. On a phone a
 * four-sentence paragraph can be taller than the controls it describes, which inverts the dialog: the
 * explanation dominates and the thing being explained is what scrolls away. `lead` must stand alone as
 * the actionable sentence, since collapsed is the default state.
 */
export function createCollapsibleNote(
  parent: HTMLElement,
  lead: string,
  more: string | ReadonlyArray<{ label: string; text: string }>
): HTMLDetailsElement {
  const details = parent.createEl('details', { cls: 'orbis-note-details' });
  const summary = details.createEl('summary', { cls: 'orbis-note-summary', text: lead });
  // **An explicit tab stop.** A `<summary>` is focusable by nature, but `list-style: none` plus a custom marker is
  // enough for it to stop behaving like one in some layouts — and a disclosure nobody can reach is a paragraph of
  // help nobody can read. Stated rather than assumed, since the whole point of these is being opened.
  summary.tabIndex = 0;
  // A list of definitions rather than one blob, for a fold that explains a set of choices: the labels have
  // to be scannable against the control they describe, which a paragraph cannot do.
  if (typeof more === 'string') {
    details.createDiv({ cls: 'orbis-note-more', text: more });
    return details;
  }
  const list = details.createDiv({ cls: 'orbis-note-more orbis-note-defs' });
  for (const d of more) {
    const item = list.createDiv();
    item.createSpan({ cls: 'orbis-note-def-label', text: d.label });
    item.createSpan({ text: ` — ${d.text}` });
  }
  return details;
}

/**
 * Stop a horizontal touch-drag on `el` from also triggering Obsidian's mobile edge-swipe (which pulls
 * in the file / backlinks drawers) — a precise drag otherwise races the swipe gesture.
 *
 * While a touch is down on the element, a capture-phase `touchmove` on the document stops the event
 * reaching Obsidian's gesture handler (capture runs before its bubble-phase listener). Note that
 * `touch-action: none` is NOT sufficient on its own: it suppresses the browser's own panning, but
 * Obsidian's gesture is JavaScript on touch events, so the event still has to be stopped.
 *
 * We only stopPropagation, never preventDefault, so a range slider's native thumb drag and `input`
 * event — or a custom scrubber's pointer events — are untouched. No-op on desktop (no touch events).
 * Same approach as the pocket-mode lock guard.
 *
 * Used by the Display-settings sliders and the full-screen player's progress scrubber.
 */
export function guardDragSwipe(el: HTMLElement): void {
  const suppress = (e: Event) => e.stopPropagation();
  const detach = () => {
    activeDocument.removeEventListener('touchmove', suppress, true);
    activeDocument.removeEventListener('touchend', detach, true);
    activeDocument.removeEventListener('touchcancel', detach, true);
  };
  el.addEventListener(
    'touchstart',
    () => {
      activeDocument.addEventListener('touchmove', suppress, { capture: true, passive: true });
      activeDocument.addEventListener('touchend', detach, { capture: true, passive: true });
      activeDocument.addEventListener('touchcancel', detach, { capture: true, passive: true });
    },
    { passive: true }
  );
}

/**
 * Where a display slider starts: the value its field shows, and the position its thumb takes.
 *
 * **Two units, which must not mix.** A slider's `min`/`max` are in SLIDER units — line spacing runs 10..30 so it can
 * step by 0.1 — while the stored value is in VALUE units, 1.0..3.0. An unset fallback of `unscale(min)` runs slider
 * units through the wrong transform: on a vault with nothing stored, line spacing would read **100.0** and pin its
 * thumb to the right. Without a `scale` the two units are the same number, so only a scaled slider shows the mistake.
 *
 * **And the fallback has to be the real default, not `min`.** Nothing is written to storage until a control is touched,
 * so a `min` fallback would show brightness 20, margins 0 and font size 80 on a fresh vault while the reader — and the
 * sample at the bottom of the same page — use 100, 3 and 100.
 *
 * `fallback` is in value units, from `DISPLAY_DEFAULTS`, which is what the book itself reads.
 */
export function sliderStart(
  raw: string | null,
  fallback: number,
  unscale: (v: number) => number
): { stored: number; shown: number } {
  const parsed = Number.parseFloat(raw ?? '');
  const stored = Number.isFinite(parsed) ? parsed : fallback;
  return { stored, shown: unscale(stored) };
}

/**
 * Every folder in the vault, as dropdown options, root first.
 *
 * **The root is a bare `/`, Obsidian's own convention** — its Attachment folder path dropdown lists exactly that,
 * first, above the named folders — so matching it beats inventing a friendlier word.
 */
/**
 * Folder choices for a picker, plus `current` when it does not exist yet.
 *
 * `folderOptions` lists folders that EXIST, and a `<select>` set to a value that is not one of its options lands on
 * `selectedIndex = -1` and renders **blank** — so a setting naming a folder created on first use would show nothing at
 * all. So the control says what the setting holds, labeled so the reader knows the folder is not there yet.
 *
 * Same shape of problem as an empty value rendering as `/`: a picker must be able to display every state its
 * setting can be in, including the states no folder corresponds to.
 *
 * `pendingKey` exists because *when* the folder appears depends on the caller, and the label should not promise the
 * wrong one. A settings row names a folder that the next export will create — "created when first used". The
 * destination dialog creates its folders the moment Save is pressed, so there the same entry has to say "will be
 * created". Both take a `{{name}}`.
 */
export function folderOptionsWith(
  app: App,
  current: string,
  pendingKey: TranslationKey = 'folder_picker.pending'
): Record<string, string> {
  const options = folderOptions(app);
  if (!current || current in options) return options;
  // First, so it reads as the current answer rather than as a choice buried among the real folders.
  return { [current]: t(pendingKey, { name: current }), ...options };
}

/**
 * Drag-to-reorder for one row of a list, on **Pointer Events** — so it works with a finger.
 *
 * Not HTML5 drag-and-drop: `dragstart` never fires from a finger in WebKit or Chrome mobile.
 * `pointerdown`/`pointermove`/`pointerup` fire identically for mouse, touch and stylus, so one implementation covers
 * every input and the handle can show everywhere.
 *
 * **The arrows stay anyway.** Dragging has no keyboard equivalent whatever it is built on, so a list that can only be
 * dragged cannot be reordered from a keyboard at all.
 *
 * **Only the HANDLE starts a drag, never the row.** A row-wide gesture makes its own `<input>` children drag
 * initiators, so click-dragging to select text in a field moves the row instead — the drag wins before the input
 * sees the gesture. A handle already looks like the thing you grab.
 *
 * Three details that are easy to leave out and painful to debug:
 *
 * - **`touch-action: none` on the handle**, or the browser claims the gesture as a scroll before the second
 *   `pointermove` arrives and the row never follows the finger.
 * - **Pointer capture**, so a finger that strays outside the handle — which it does immediately, that being the
 *   point — keeps delivering moves rather than silently stopping.
 * - **A movement threshold** (`isDragIntent`), or every tap on the handle is a zero-distance drag.
 *
 * `state` is shared by every row in one list: the index the drag started from, so a row can tell whether the gesture in
 * flight belongs to it. In `onDrop(from, to)`, `to` is the row the pointer finished over.
 */
/**
 * The icon every drag handle wears.
 *
 * Obsidian's own declarative lists use this one, and a handle that looks like the host app's handle is recognized
 * without being learned. A `⋮⋮` text glyph would read as "ours" rather than as the control it is.
 */
export const DRAG_HANDLE_ICON = 'menu';

export function wireListDrag(opts: {
  row: HTMLElement;
  handle: HTMLElement;
  index: number;
  state: { from: number | null };
  onDrop: (from: number, to: number) => void;
}): void {
  const { row, handle, state } = opts;
  handle.addClass('orbis-drag-handle');
  /**
   * **Not a tab stop.** A handle is a pointer affordance: the arrows beside it are how a keyboard reorders, and a
   * keyboard cannot drag anything. Left focusable, it is one more press between the reader and the control they
   * wanted, on every row of every list — and it does nothing when they get there.
   */
  handle.tabIndex = -1;
  handle.setAttribute('aria-hidden', 'true');
  // The row marks itself as one, so the list can be found by shape rather than by "every child of the parent". A sort
  // level's parent also holds its "Add another level" button, and the value rows' parent holds a heading and a hint —
  // so `children` would have two extra entries at the front and one at the back, and every drop index would be computed
  // against the wrong list.
  row.addClass('orbis-drag-row');
  // The row carries a class too, so the drag feedback is defined once for every list rather than per list, and a new
  // list never gets the behavior with no visual at all.
  row.addClass('orbis-draggable-row');
  handle.addEventListener('pointerdown', (down: PointerEvent) => {
    if (down.pointerType === 'mouse' && down.button !== 0) return; // right-click is not a drag
    const startY = down.clientY;
    let dragging = false;
    let marked: HTMLElement | null = null;
    // The rows of this list, in order — which is what `index` counts, and not the same thing as the parent's
    // children.
    const siblings = (): HTMLElement[] =>
      Array.from(row.parentElement?.children ?? []).filter((el): el is HTMLElement => el.hasClass('orbis-drag-row'));
    /**
     * Where the row is NOW, not where it was rendered. A list that reorders without repainting (so the keyboard
     * survives) leaves `index` stale from the first move onwards, and every comparison against it then decides
     * wrongly: the drop indicator would not appear for a one-place move, and a drop could be refused as a no-op.
     */
    const currentIndex = (): number => siblings().indexOf(row);
    /** The row this drop would displace, in row terms — the slot between rows, resolved to an index. */
    const targetAt = (y: number): number => {
      const rows = siblings();
      const from = rows.indexOf(row);
      const slot = insertIndexAt(
        y,
        rows.map((el) => el.getBoundingClientRect())
      );
      return slot > from ? slot - 1 : slot;
    };

    const clearMark = (): void => {
      marked?.removeClass('is-drop-target');
      marked = null;
    };

    const move = (e: PointerEvent): void => {
      if (!dragging) {
        if (!isDragIntent(startY, e.clientY)) return;
        dragging = true;
        state.from = currentIndex();
        row.addClass('is-dragging');
      }
      const to = targetAt(e.clientY);
      clearMark();
      if (to >= 0 && to !== currentIndex()) {
        marked = siblings()[to] ?? null;
        marked?.addClass('is-drop-target');
      }
    };

    const finish = (e: PointerEvent, drop: boolean): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      clearMark();
      row.removeClass('is-dragging');
      state.from = null;
      if (!dragging) return;
      const from = currentIndex();
      const to = targetAt(e.clientY);
      if (drop && to >= 0 && from >= 0 && to !== from) opts.onDrop(from, to);
    };
    const up = (e: PointerEvent): void => finish(e, true);
    // The OS can take the gesture back — a system edge swipe, a phone call. Put the row down where it was.
    const cancel = (e: PointerEvent): void => finish(e, false);

    handle.setPointerCapture(down.pointerId);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancel);
  });
}

/**
 * Disable a settings row — the control AND the look of it.
 *
 * `Setting.setDisabled` disables the components inside the row but leaves its name, description and control at
 * full brightness. The result reads as a bug rather than as an inert control: a `<select>` that shows a value and
 * refuses to open is indistinguishable from a broken one. Obsidian's own `is-disabled` styling is not enough to carry
 * it either.
 *
 * So the two go together, always, and they go together HERE rather than at each call site, where a pairing is
 * remembered in one place and forgotten in another. `.orbis-setting-disabled` dims the whole `settingEl`, so the name
 * and description fade with the control.
 * `.orbis-setting-disabled` dims the whole `settingEl`, so the name and description fade with the control.
 *
 * **And it leaves the keyboard out too.** Obsidian's `setDisabled` blocks the mouse and dims the row, and stops there:
 * the control keeps its tab stop and its keys, so a switch that cannot be clicked can still be reached by Tab and
 * flipped with Space. A control that cannot be used is not a place for the keyboard to stop.
 *
 * Form controls take a real `disabled`; Obsidian's toggle is a `<label>` carrying the tab stop, so that loses its
 * `tabindex` instead — the switch inside it is disabled either way.
 */
export function setSettingDisabled(setting: Setting, disabled: boolean): void {
  setting.setDisabled(disabled);
  setting.settingEl.toggleClass('orbis-setting-disabled', disabled);
  for (const el of Array.from(
    setting.controlEl.querySelectorAll<HTMLElement>('input, select, textarea, button, .checkbox-container')
  )) {
    // By tag rather than `instanceof`: a popped-out window is a different realm, and `instanceof` is false there.
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button') {
      (el as HTMLInputElement).disabled = disabled;
    } else {
      el.tabIndex = disabled ? -1 : 0;
    }
  }
}

/**
 * The button that makes a folder, beside a picker that lists them. Pass the `ButtonComponent` an `addButton` hands
 * you; this dresses it and wires the click.
 *
 * **One look, in one place.** Seven rows across settings and four dialogs ask the same question, and two ways of
 * drawing the answer — a bordered button labeled `+`, and a flat `folder-plus` icon — read as two different controls
 * on a settings page that holds both. The icon wins: `+` beside a dropdown does not say what it adds, and the glyph
 * does, in less room (which matters on a phone, where the row is a column).
 *
 * A real `<button>` wearing `clickable-icon`, not `addExtraButton`: Obsidian's extra button is a div — focusable on
 * 1.13.7, but a div — the trap its `.modal-close-button` sets, and the reason ours is a button of our own.
 */
export function newFolderButton(btn: ButtonComponent, run: () => void): ButtonComponent {
  return iconButton(btn, 'folder-plus', t('action.create_new_folder'), () => {
    /**
     * **Afterwards the keyboard belongs on the picker, not back on this button.**
     *
     * Making a folder answers the question the picker beside this asks, so the reader's next move is with that
     * picker — and what it now says (the new path) is the thing they need to see. Obsidian would put focus back
     * here, on the `+`, which is a button they have finished with.
     *
     * The picker is found rather than passed: every one of these buttons sits in a row with one, at seven call
     * sites, and a parameter would be seven chances to forget. **Only if the value actually changed**, so
     * cancelling the folder dialog leaves focus where the host put it.
     */
    const picker = btn.buttonEl.closest('.setting-item')?.querySelector<HTMLSelectElement>('select');
    const before = picker?.value;
    run();
    if (picker) claimFocusSoon(picker, () => picker.value !== before);
  });
}

/**
 * Whether a named `<details>` in `root` is open, read from the DOM.
 *
 * **Because the `toggle` event is not to be relied on.** A fold's open state is remembered across the repaints that
 * surround it — tick a chapter and the whole screen is rebuilt. On desktop `toggle` arrives in time; on Android it has
 * not been seen by the time the repaint reads the state, so a fold remembered from it shuts on every tick. The element
 * itself is never wrong, so ask it instead, just before the DOM it lives in is thrown away.
 *
 * Returns null when there is no such fold, so a caller can keep whatever it already believed.
 */
export function foldOpen(root: HTMLElement, name: string): boolean | null {
  const fold = root.querySelector<HTMLDetailsElement>(`details[data-orbis-fold="${name}"]`);
  return fold ? fold.open : null;
}

/** A fold whose header shows the answer. See {@link answerFold}. */
export interface AnswerFoldSpec {
  /** Names the fold for `foldOpen`, and keys its header for `captureFocus`. */
  key: string;
  /** The muted caption before the value — `Location:`, `Marked up by`. */
  label: string;
  /** The answer, read on every repaint and again whenever a control inside changes it. */
  value: () => string;
  /** What an empty answer reads as, muted. Without one, an empty value simply shows nothing. */
  empty?: string;
  /** Monospaced and wrapped at separators, for a vault path. */
  path?: boolean;
  /** Open state, held by the CALLER: every control on these screens repaints, and a fresh `<details>` is closed. */
  open: { open: boolean };
  /**
   * Skip the recessed panel around the body, for a fold whose content brings its own surface.
   *
   * The chapter lists are the case: `.orbis-list-box` is already this ground, so a panel around it is a
   * border drawn twice — the rule `.orbis-fold-panel`'s own comment states. The body element is still created, so
   * the caller has somewhere to draw.
   */
  bare?: boolean;
  /**
   * Called after the fold opens or closes, for a host that has to react to its own new height.
   *
   * A popup sizes itself to its content, so opening a fold inside one leaves it measured against its earlier content,
   * which `<details>` does not handle for free.
   */
  onToggle?: () => void;
}

/**
 * A `<details>` whose summary states the answer the controls inside it produce.
 *
 * **The header is the reason the controls can hide.** A destination, a byline and a book's metadata are all things
 * you check far more often than you change, so a dialog that spends its top third on their input controls has its
 * priorities backwards — but hiding them behind a pencil means opening a form to answer "where is this going?".
 * A header that carries the answer is both: readable at a glance, editable in one click, and no second glyph to
 * explain.
 *
 * A separate edit STAGE would hide the dialog's own confirm button while you are in it, so changing a folder would mean
 * going in, coming back, and then saving; and its "Done" would name a commitment that is not happening, since the
 * fields write straight through and Cancel on the main screen discards everything anyway.
 *
 * Returns the body to draw controls into and a `paint` to call when one of them changes the answer — the header
 * does not know what is inside it, and a header that lags its own controls is worse than no header.
 */
export function answerFold(
  parent: HTMLElement,
  spec: AnswerFoldSpec
): { body: HTMLElement; head: HTMLElement; paint: () => void } {
  const details = parent.createEl('details', {
    cls: `orbis-note-details orbis-epub-fold${spec.path ? ' orbis-path-fold' : ''}`,
    attr: { 'data-orbis-fold': spec.key },
  });
  details.open = spec.open.open;
  details.addEventListener('toggle', () => {
    spec.open.open = details.open;
    spec.onToggle?.();
  });
  const head = details.createEl('summary', { cls: 'orbis-note-summary orbis-epub-subhead' });
  // Keyed: a fold a keyboard reader left open is where they are standing, and every control here repaints.
  head.dataset.orbisFocus = `${spec.key}-fold`;
  head.createSpan({ cls: 'orbis-epub-toc-label', text: spec.label });
  const value = head.createSpan({ cls: `orbis-fold-value${spec.path ? ' is-path' : ''}` });
  const paint = (): void => {
    const answer = spec.value();
    value.setText(answer || spec.empty || '');
    value.toggleClass('orbis-checklist-note-empty', !answer && !!spec.empty);
  };
  paint();
  // The body is a panel: what opens here is fields, not prose. See `.orbis-fold-panel` — and `bare`, for the folds
  // whose content already carries a surface of its own.
  return { body: details.createDiv({ cls: spec.bare ? '' : 'orbis-fold-panel' }), head, paint };
}

/**
 * Put the keyboard on an element once whatever is closing has finished closing.
 *
 * **Three attempts, not one.** A dialog closing hands focus back on its own schedule — Obsidian restores it after
 * `onClose`, a frame may pass, a repaint may follow — and a single claim either lands too early to stick or too late
 * to be believed. Each attempt is a no-op once the element holds focus, and `when` lets a caller withdraw entirely
 * (a folder dialog that was cancelled has nothing to move focus for).
 */
export function claimFocusSoon(el: HTMLElement, when: () => boolean = () => true): void {
  const claim = (): void => {
    if (!el.isConnected || !when()) return;
    // Not a control that would open itself — a picker unfolding as a dialog closes has nobody's tap behind it. See
    // `opensOnFocus`.
    if (opensOnFocus(el)) return;
    if (el.ownerDocument.activeElement !== el) el.focus();
  };
  el.win.setTimeout(claim, 0);
  el.win.requestAnimationFrame(claim);
  el.win.setTimeout(claim, 60);
}

/**
 * A flat icon control on a settings row or in a dialog — the pencil, the arrows, the trash, the copy.
 *
 * **This is what `addExtraButton` should have been.** Obsidian builds that one as `createDiv("clickable-icon
 * extra-setting-button", { attr: { tabIndex: 0 } })` — a div with a click listener. On 1.13.7 it does take focus, it
 * rings, and Enter and Space reach it.
 *
 * A real `<button>` is still worth having: it carries the role without a `tabindex` attribute to remember,
 * `setDisabled` genuinely disables it rather than dimming it (see `setSettingDisabled`, which has to reach past
 * Obsidian's version), and `.focus()` on it is a contract rather than a behavior of the version installed.
 */
export function iconButton(btn: ButtonComponent, icon: string, label: string, run: () => void): ButtonComponent {
  btn.setIcon(icon).setTooltip(label).onClick(run);
  btn.buttonEl.addClass('clickable-icon');
  btn.buttonEl.setAttribute('aria-label', label); // icon-only: a tooltip is not an accessible name
  return btn;
}

/**
 * The element that actually scrolls, so a repaint can put the reader back where they were.
 *
 * Found by walking up rather than named: the overflow belongs to Obsidian's modal content, not to anything a
 * dialog creates, and a class name there is not public API. Shared because two dialogs rebuild their body on
 * every control change — the EPUB conversion dialog and the per-book records dialog — and both would
 * otherwise throw the reader back to the top of the form.
 */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    if (node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null;
}

export function folderOptions(app: App): Record<string, string> {
  const paths: string[] = [];
  Vault.recurseChildren(app.vault.getRoot(), (f) => {
    if (f instanceof TFolder && f.path !== '/') paths.push(f.path);
  });
  paths.sort((a, b) => a.localeCompare(b));
  const options: Record<string, string> = { '/': '/' };
  for (const p of paths) options[p] = p;
  return options;
}

/**
 * A row of tabs across the top of a dialog, one section showing at a time.
 *
 * **For a dialog that has outgrown one screen**, not for one that merely has several settings: tabs hide
 * things, and hiding a control someone is looking for costs more than a scroll. The field editor earned them
 * by holding three lists at once on a phone; the annotation presets by holding a book's marks and the shared
 * library, which are different subjects rather than different parts of one.
 *
 * The caller re-renders on a pick — the tab strip does not own the body, because the body is the caller's and
 * every dialog that has one already knows how to draw itself.
 */
export function renderTabRow<T extends string>(
  parent: HTMLElement,
  tabs: ReadonlyArray<{ id: T; label: string }>,
  active: T,
  onPick: (id: T) => void
): HTMLElement {
  const row = parent.createDiv({ cls: 'orbis-tab-row' });
  // Marked live so a read-only dialog's freeze leaves it alone: a frozen tab row would put two thirds of what the
  // dialog shows out of reach — see `freezeControls`.
  row.dataset.live = 'true';
  // **The strip tracks which tab is showing, rather than trusting the argument it was built with.** A caller that
  // redraws only the body — the sensible thing, since the strip has not changed — would otherwise leave `active` frozen
  // at the tab the dialog opened on: the highlight would stay put, and clicking back to that tab would read as "already
  // there" and do nothing at all.
  let current = active;
  const buttons = new Map<T, HTMLElement>();
  for (const { id, label } of tabs) {
    const btn = row.createEl('button', { cls: 'orbis-ctrl-btn', text: label });
    buttons.set(id, btn);
    btn.addEventListener('click', () => {
      if (id === current) return;
      current = id;
      for (const [key, el] of buttons) {
        el.toggleClass('is-active', key === current);
        el.setAttribute('aria-pressed', String(key === current));
      }
      onPick(id);
    });
  }
  for (const [key, el] of buttons) {
    el.toggleClass('is-active', key === current);
    el.setAttribute('aria-pressed', String(key === current));
  }
  // Returned so a caller can add its own class: the strip is one thing everywhere, but the dialog around it
  // is not, and the mark editor's tabs sit in a tighter space than the presets' do.
  return row;
}

/**
 * Give a toggle a restore key — **on both of its tab stops**.
 *
 * Obsidian builds one as `createDiv("checkbox-container", { attr: { tabIndex: 0 } })` containing
 * `createEl("input", { attr: { type: "checkbox", tabIndex: 0 } })`: the container and the input are BOTH focusable,
 * so one switch is two stops and a reader tabbing to it lands on the container. Keying only the input leaves the stop
 * they are actually on nameless, so `captureFocus` falls back to the element's position in the tree.
 *
 * That fallback holds until the shape above the toggle changes, and then it puts the keyboard somewhere else entirely.
 *
 * Two keys rather than one, so each stop restores to itself: sharing a key would take a reader who was on the
 * container back to the input, which is a different stop wearing the same switch.
 */
export function keyToggle(toggle: ToggleComponent, key: string): void {
  toggle.toggleEl.dataset.orbisFocus = key;
  const box = toggle.toggleEl.querySelector('input');
  if (box) box.dataset.orbisFocus = `${key}-box`;
}

/**
 * Make a non-button element activate like one: focusable, and answering Enter and Space.
 *
 * **A `div` with a click listener is a control only a pointer can use.** It takes no focus, answers no key, and is
 * invisible to anyone driving Obsidian from the keyboard. The remedy is always the same three lines, which is exactly
 * why it should not be written by hand each time.
 *
 * `role="button"` unless the caller names another, because some of these are rows in a list and some are section
 * headers, and a screen reader should hear which. Space is prevented from scrolling the page, and Enter from
 * submitting whatever form the element happens to sit inside.
 *
 * Use a real `<button>` where the layout allows it; this is for the cases where it does not — a row that is a grid of
 * cells, a header that carries its own count, anything Obsidian's `.is-mobile button` rules would restyle.
 */
export function onActivate(el: HTMLElement, run: (evt: Event) => void, opts: { role?: string } = {}): void {
  el.setAttribute('role', opts.role ?? 'button');
  el.tabIndex = 0;
  el.addEventListener('click', run);
  el.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Enter' && evt.key !== ' ') return;
    evt.preventDefault();
    run(evt);
  });
}

/** Where an element sits under `root`, as child indices — the fallback identity for focus restoration. */
function pathTo(root: HTMLElement, el: HTMLElement): number[] | null {
  const path: number[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return node === root ? path : null;
}

/** The element at a path, or null if the rebuild produced a different shape. */
function elementAt(root: HTMLElement, path: number[]): HTMLElement | null {
  let node: HTMLElement | null = root;
  for (const i of path) {
    const next: Element | undefined = node?.children[i];
    node = next?.instanceOf(HTMLElement) ? next : null;
    if (!node) return null;
  }
  return node;
}

/**
 * Rebuild a surface and put the keyboard back where it was.
 *
 * **A dialog that redraws itself after every change costs a keyboard everything.** These dialogs render from state:
 * tick a checkbox, pick a color, press ↑, and the body is emptied and rebuilt — which destroys the control under the
 * cursor and drops focus onto `body`, so the next Tab starts again from the top of the dialog. With eight rows of five
 * controls that is thirty presses to get back to where one press left you. It is the same failure the mark bar faces
 * (see `renderMarkBar`), and the same answer: the element does not survive, so restore what identifies it.
 *
 * Two identities, in order:
 * - **`data-orbis-focus`**, when a control sets it. Required wherever a rebuild REORDERS things: after ↑ the row has
 *   moved, and a reader pressing ↑ again means "keep moving this mark", not "move whatever is now in that position".
 *   Key it by the thing, not the place — `up:mk_abc123`.
 * - **The child-index path**, otherwise. Free, and correct for the common case of a body that redraws in the same
 *   shape. A rebuild that produces a different shape simply finds nothing there and leaves focus alone.
 */
/**
 * Hold the page still across a rebuild.
 *
 * Emptying a block shortens whatever scrolls it, so the scroller clamps to the new height and the reader is somewhere
 * they did not ask to be: toggling *Bookmarks* near the foot of the note-styles editor would throw the page back to the
 * top.
 * **No control change should move the page** — the control is the thing the reader is looking at.
 *
 * Restore the scroll BEFORE the keyboard, never after. `focus()` scrolls its element into view when it has to, which
 * is right when a rebuild moved the control (a reorder) and wrong to then undo; doing it the other way round scrolls
 * the focused control back out of sight.
 */
export function keepScroll(el: HTMLElement): () => void {
  const sp = scrollParent(el);
  const top = sp?.scrollTop ?? 0;
  /** Whether a control is inside the scroller's visible box, which is what "the reader can see it" means here. */
  const inSight = (control: HTMLElement): boolean => {
    const box = sp?.getBoundingClientRect();
    if (!box) return true;
    const r = control.getBoundingClientRect();
    return r.bottom > box.top && r.top < box.bottom;
  };
  const put = (): void => {
    if (!sp?.isConnected) return;
    const before = sp.scrollTop;
    sp.scrollTop = top;
    /**
     * **Never at the cost of hiding the control that holds the keyboard.**
     *
     * Some claims scroll on purpose: adding a dashboard focuses the new row's name field and brings it into view,
     * because a new row is the last one on a long page (see `focusRowBody`). That claim runs on a macrotask, which
     * lands BEFORE the frame this defers to — so putting the old position back would scroll the field the reader was
     * just given straight off the screen. Holding the page still is the default, not a rule that outranks the reader.
     */
    const active = sp.ownerDocument.activeElement;
    if (active?.instanceOf(HTMLElement) && sp.contains(active) && !inSight(active)) sp.scrollTop = before;
  };
  return () => {
    if (!sp?.isConnected || top <= 0) return;
    put();
    // Twice: the height settles a frame later, and an assignment before that lands on the short page.
    el.win.requestAnimationFrame(put);
  };
}

export function rebuildKeepingFocus(root: HTMLElement, rebuild: () => void): void {
  const restore = captureFocus(root);
  const restoreScroll = keepScroll(root);
  rebuild();
  /**
   * **A tooltip outlives the control it describes.** Obsidian parents its tooltip to the body, anchored where the
   * hovered element was — so a rebuild leaves it floating over whatever row now occupies that spot, saying something
   * about a button that no longer exists. Reordering a long list makes it look like a label has attached itself to the
   * wrong row. It reappears on the next hover; nothing is lost by removing it.
   */
  for (const tip of Array.from(root.ownerDocument.body.querySelectorAll(':scope > .tooltip'))) tip.remove();
  restoreScroll();
  restore();
}

/**
 * The same restore, split in two, for a rebuild that is not one synchronous call.
 *
 * **Capture BEFORE the first `await`.** A settings write is queued and asynchronous, and Obsidian's `update()` can
 * paint a frame after it returns — so by the time the code that finishes the job runs, the control the reader pressed
 * may already be gone and `activeElement` is `body`. Reading the identity up front is the difference between knowing
 * where to go back to and having nothing to go on. `restore({ retry: true })` tries once more on the next frame, for
 * a rebuild whose paint has not landed yet; it does nothing when the first attempt worked.
 */
export function captureFocus(root: HTMLElement): (opts?: { retry?: boolean }) => void {
  // The surface's own document — `activeDocument` is the ACTIVE WINDOW's, which is a different thing whenever a
  // surface lives in a window of its own (a detached Settings window, a popped-out leaf).
  const doc = root.ownerDocument;
  const el = doc.activeElement;
  const active = el?.instanceOf(HTMLElement) && el !== root && root.contains(el) ? el : null;
  const key = active?.dataset.orbisFocus ?? null;
  const path = active && !key ? pathTo(root, active) : null;
  /**
   * **The blur belongs here, and only for this surface's own control.**
   *
   * Dropping focus before emptying is an iOS fix — removing the just-tapped button that holds focus snaps the dialog to
   * the top. Blurring whatever `activeElement` is, with no thought for whose it is, is a cross-surface bug the moment
   * two surfaces are on screen: committing in the mark editor re-renders the manager underneath it, whose blur would
   * wipe the keyboard out of the dialog on top, so the editor's own restore would find nothing to put back. Scoped
   * here, a surface can only ever blur its own.
   */
  active?.blur();
  return (opts) => {
    const landed = restoreFocus(root, key, path);
    /**
     * **Never leave the keyboard on `body`.** A rebuild that cannot find what it was standing on would otherwise give
     * up, and focus would fall to the document — where Tab walks the page BEHIND an open dialog (a trap can only hold
     * what is inside it) and Space scrolls it. Landing on the first control in the surface is imperfect; landing
     * outside it is a different window.
     */
    if (!landed && active) {
      /**
       * **Never the close ×.** It is a control like any other to a selector, and a dialog whose keyboard is resting on
       * Close is one Enter away from vanishing, so a repaint mid-keypress could dismiss it. The same reasoning already
       * keeps it last in the tab order: Close is the last resort, not the landing.
       */
      /**
       * **And never a control Tab cannot come back to.** An unchecked radio can be focused by script but is not a tab
       * stop — its checked group-mate holds the group's one stop — so landing here would leave the keyboard somewhere
       * Shift+Tab behaves from unpredictably. `isTabStop` is the same rule the trap uses.
       */
      const first = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not(.orbis-popup-close-btn), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        // And never a control that would open itself on being focused — a picker appearing with no tap behind it is
        // worse than the keyboard resting somewhere plain. See `opensOnFocus`.
      ).find((el) => isTabStop(root, el) && !opensOnFocus(el));
      first?.focus();
    }
    if (!opts?.retry || (!key && !path)) return;
    /**
     * **Obsidian renders again after we are finished, and takes the keyboard with it.**
     *
     * `update()` stores the definitions and paints on its own schedule: a frame after the call returns the row we put
     * focus back on is replaced, and then the settings pane focuses its own box — a keyboard walk through a settings
     * list that reorders ends on `.vertical-tab-content-container` every time. Neither half of that is ours to
     * schedule around, so this claims the control back twice over: on any rebuild of the surface (a mutation), and on
     * any focus landing somewhere else (a `focusin`, which is the only visible trace of a programmatic `focus()` —
     * moving the keyboard leaves no mark on the DOM for an observer to see).
     *
     * **Bounded, and the reader always wins.** A key or a pointer press stands the whole thing down at once — both
     * arrive before the focus change they cause — and it expires on its own regardless. Within that window the only
     * thing it can be fighting is the pane taking focus off a control the reader never left.
     */
    const claim = (): void => {
      const now = doc.activeElement;
      if (now?.instanceOf(HTMLElement) === true && isTheKeyed(now)) return;
      restoreFocus(root, key, path);
    };
    const isTheKeyed = (el: HTMLElement): boolean => !!key && el.dataset.orbisFocus === key;
    const obs = new MutationObserver(claim);
    const stop = (): void => {
      obs.disconnect();
      doc.removeEventListener('keydown', stop, true);
      doc.removeEventListener('pointerdown', stop, true);
      doc.removeEventListener('focusin', claim, true);
    };
    obs.observe(root, { childList: true, subtree: true });
    doc.addEventListener('keydown', stop, true);
    doc.addEventListener('pointerdown', stop, true);
    doc.addEventListener('focusin', claim, true);
    window.setTimeout(stop, 400); // long enough for a slow rebuild, short enough to be nobody's business
  };
}

/**
 * Can this element hold focus right now?
 *
 * `offsetParent` alone is not enough. **Obsidian's `DropdownComponent` leaves a hidden copy of its `<select>` in the
 * DOM** to measure its widest option, and that copy is laid out — so a query for "the control" can find two, and
 * `focus()` on the wrong one silently does nothing at all.
 */
function isVisible(el: HTMLElement): boolean {
  if (!el.offsetParent) return false;
  return el.win.getComputedStyle(el).visibility !== 'hidden';
}

/** Put the keyboard on the control `captureFocus` remembered, if the rebuild has produced it. */
function restoreFocus(root: HTMLElement, key: string | null, path: number[] | null): boolean {
  /**
   * **The LAST match, not the first, and never a hidden one.** Mid-repaint both the old tree and the new one can be
   * in the document at once, and the old one comes first — focusing it means focusing something about to be thrown
   * away. Hidden matches have to be skipped too: Obsidian's dropdown keeps an invisible measuring COPY of itself, so
   * a query can find two of a control and only one of them can hold focus (`visibility: hidden` cannot).
   */
  const matches = key ? Array.from(root.querySelectorAll<HTMLElement>(`[data-orbis-focus="${CSS.escape(key)}"]`)) : [];
  const shown = matches.filter((el) => isVisible(el));
  const landing = shown.length ? shown[shown.length - 1] : path ? elementAt(root, path) : null;
  if (!landing) return false;
  /**
   * **Only a DISABLED control hands focus to its neighbor.** The rest of the reasons a control might not take focus
   * this instant — a rebuild still painting, a container not yet attached — are temporary, and the retry window is
   * there to cover them. Treating "not usable yet" as "not usable" would end every down-move on the up arrow: the arrow
   * is fine, just not ready, and the hop below would grab the first keyed control in the row instead.
   */
  if (landing.hasAttribute('disabled')) {
    /**
     * The control you were using is still there but can no longer be used — press ↑ until a row reaches the top and
     * its own ↑ goes disabled.
     *
     * **The OPPOSITE ARROW first, not merely the next keyed control.** "The first usable keyed control in this row" is
     * wrong wherever a row keys something else as well: in a sort level the field dropdown is keyed and comes first, so
     * reaching the top of the list would hand the keyboard to the dropdown instead of to ↓.
     * The counterpart of ↑ is ↓ — same row, same job, one key away from carrying on.
     */
    if (key) {
      const twin = key.includes('-up:') ? key.replace('-up:', '-down:') : key.replace('-down:', '-up:');
      const other = Array.from(root.querySelectorAll<HTMLElement>(`[data-orbis-focus="${CSS.escape(twin)}"]`)).find(
        (el) => !el.hasAttribute('disabled') && isVisible(el)
      );
      if (other) {
        other.focus();
        return true;
      }
    }
    const group = landing.parentElement?.querySelectorAll<HTMLElement>('[data-orbis-focus]') ?? [];
    const next = Array.from(group).find(
      (el) => el !== landing && !el.hasAttribute('disabled') && isVisible(el) && !opensOnFocus(el)
    );
    next?.focus();
    return !!next;
  }
  if (!isVisible(landing)) return false; // still painting, or a measuring copy — let the retry window try again
  if (opensOnFocus(landing)) return true;
  landing.focus();
  return true;
}

/**
 * **A `<select>` on iOS, where `focus()` OPENS the picker instead of merely ringing the control.**
 *
 * A dropdown that redraws its own dialog would reopen its own picker on an iPad and nowhere else: pick a preset in the
 * Annotations dialog, or a treatment in the mark editor, and the wheel slides away and straight back with a tick beside
 * the choice, needing a second dismissal. The redraw is not the cause — it is what iOS makes of `focus()` on a select,
 * where the open picker IS the focus state, while on a desktop and on Android focus is a ring and nothing more. So: tap
 * an option, `change` rebuilds the dialog, the restore focuses the select that replaced the one you tapped, and iOS
 * reads that as "open me".
 *
 * The caller still reports the focus as landed. The alternative is falling through to "the first control in the
 * surface", which moves the keyboard somewhere the reader never was — and nothing is lost by staying put, because the
 * select is where the tap already is, and a device whose dropdown is a modal wheel is not one being driven by Tab.
 */
export function opensOnFocus(el: Element): boolean {
  // `instanceOf`, not `instanceof`: a popped-out leaf is a different window with its own constructors, and this
  // helper is reached from surfaces that live in one.
  return Platform.isIosApp && el.instanceOf(HTMLSelectElement);
}

/**
 * Move a list row to a given position among its fellow rows, in the DOM. The companion to `moveRowAmongRows`, for a
 * drop rather than a press.
 *
 * **Returns the real `from`, read from the DOM.** `wireListDrag` reports the index the row was RENDERED at, which is
 * stale the moment anything has moved — and a list that reorders without repainting moves a lot. It also does not touch
 * the DOM itself: it assumes the caller redraws, and a caller that deliberately does not redraw (so the keyboard
 * survives) has to do the move here instead.
 */
export function moveRowToIndex(row: HTMLElement, to: number): { from: number; to: number } | null {
  const parent = row.parentElement;
  const rows = reorderRowsAround(row);
  const from = rows.indexOf(row);
  const target = rows[to];
  if (!parent || from < 0 || !target || to === from) return null;
  parent.insertBefore(row, to > from ? target.nextSibling : target);
  return { from, to };
}

/**
 * Make Enter and Space run a real button's action, rather than trusting the click the browser would synthesise.
 *
 * **A focused, enabled `<button>` in Obsidian's settings sometimes swallows Enter**: something upstream cancels the
 * synthesised click (the settings pane has keyboard handling of its own, and a search field one Tab away). A key
 * handler on the button does not care: it runs the same action, and
 * `preventDefault` stops the native activation so nothing runs twice.
 *
 * For a real button only. A div needs `onActivate`, which adds the role and the tab stop as well.
 */
export function keyActivates(el: HTMLElement, run: () => void): void {
  el.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Enter' && evt.key !== ' ') return;
    evt.preventDefault();
    evt.stopPropagation();
    run();
  });
}

/**
 * The rows of ONE reorderable list, in the order they are on screen: the row elements around `row` that carry move
 * arrows of their own.
 *
 * Read from the DOM rather than assumed. A list's rows share a parent with other furniture — a heading, an "add" row, a
 * divider — so "the element next door" is not necessarily a row to swap with, and taking one anyway would move a row
 * past a divider while the array moves past a row.
 */
export function reorderRowsAround(row: HTMLElement): Element[] {
  const parent = row.parentElement;
  if (!parent) return [];
  /**
   * **`data-orbis-list` says WHICH list, and it is not optional.** Two reorderable lists can share a parent — the
   * look-up page's Popup sections and Search destinations do — and "a sibling with move arrows" cannot tell them
   * apart. A row in the second list then reports a position that counts the first list's rows too, so a caller
   * moving its own array rewrites an entry several places off. Rows without the attribute are their own group, which
   * keeps a single-list page working while making the mixed page correct.
   */
  const list = row.dataset.orbisList ?? '';
  return Array.from(parent.children).filter(
    (el) => !!el.querySelector('[data-orbis-focus^="order-"]') && ((el as HTMLElement).dataset.orbisList ?? '') === list
  );
}

/**
 * After a row moves, say again which arrows are at the ends — and keep the keyboard usable when the one just pressed
 * is the one that went dead.
 *
 * A disabled button cannot hold focus, so reaching the top or the bottom would drop the keyboard out of the list
 * entirely. The other arrow in the same row is the honest landing: still the row you were moving, one key away from
 * moving it back. **Only when the pressed arrow actually went disabled.**
 */
export function syncReorderEnds(row: HTMLElement): void {
  const held = row.ownerDocument.activeElement;
  const rows = reorderRowsAround(row);
  rows.forEach((r, i) => {
    const up = r.querySelector<HTMLButtonElement>('[data-orbis-focus^="order-up:"]');
    const down = r.querySelector<HTMLButtonElement>('[data-orbis-focus^="order-down:"]');
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === rows.length - 1;
  });
  if (!held || !(held as HTMLButtonElement).disabled) return;
  /**
   * The opposite arrow in the same row — by its key rather than "the first `order-` control in the row", for the
   * reason `restoreFocus` gives: a row may key other things, and the first of them is not the counterpart of the
   * arrow that just went dead.
   */
  const key = (held as HTMLElement).dataset?.orbisFocus;
  const twin = key?.includes('-up:') ? key.replace('-up:', '-down:') : key?.replace('-down:', '-up:');
  const row2 = held.closest('.setting-item');
  const target = twin
    ? row2?.querySelector<HTMLElement>(`[data-orbis-focus="${CSS.escape(twin)}"]:not([disabled])`)
    : null;
  (target ?? row2?.querySelector<HTMLElement>('[data-orbis-focus^="order-"]:not([disabled])'))?.focus();
}

/**
 * Move a list row one place up or down among its fellow rows, in the DOM.
 *
 * **The row that moves is always the row you pressed.** Moving the row BELOW it for "down" is the same rearrangement on
 * paper and not the same thing on screen: up repaints, down does not, and the list quietly disagrees with the order
 * that was saved. Symmetry is the whole point of this function existing, and the reason it is here with tests rather
 * than inline in a settings page.
 *
 * **Returns the positions it moved between, read from the DOM**, or null when there is no row that way. Those indices
 * are the whole point: a caller reordering a model alongside this cannot use the index a row was rendered at, because
 * the row may have been moved several times since. After two moves down from the top, the rendered index still says
 * position 0 while the row sits at position 2 — the model would rewrite the wrong entry, and the next press up would
 * compute a negative index. The DOM is where the order now lives, so the DOM is what the model follows.
 */
export function moveRowAmongRows(row: HTMLElement, up: boolean): { from: number; to: number } | null {
  const parent = row.parentElement;
  const rows = reorderRowsAround(row);
  const at = rows.indexOf(row);
  const other = rows[up ? at - 1 : at + 1];
  if (!parent || at < 0 || !other) return null;
  /**
   * **Moving the row drops the keyboard, so pick it back up.** `insertBefore` is a remove and an insert, and a
   * browser blurs a focused element when it is taken out of the document — even for the instant it takes to put it
   * back. The arrow is the same object and is still on the page; it only has to be asked for focus again. Cheaper
   * and surer than the identity-and-restore dance a re-render needs, because nothing here was ever rebuilt.
   */
  const held = row.ownerDocument.activeElement;
  // A select is the exception: asking one for focus back on iOS opens its picker instead of ringing it, so a row
  // moved with a dropdown in it would unfold the dropdown. See `opensOnFocus`.
  const regain =
    !!held && row.contains(held) && typeof (held as HTMLElement).focus === 'function' && !opensOnFocus(held);
  parent.insertBefore(row, up ? other : other.nextSibling);
  if (regain) (held as HTMLElement).focus();
  return { from: at, to: up ? at - 1 : at + 1 };
}

/**
 * Keep Tab inside a surface, wrapping at its ends.
 *
 * **A dialog is a place you are in until you leave it.** Without this, Tab walks out into the page behind — invisible
 * stops on a reader nobody can see, and several presses before Save comes round again.
 *
 * Only the ends are caught: in between, the browser's own order is the right one, and re-implementing it is how a trap
 * starts disagreeing with the DOM. `offsetParent` filters what is hidden, which matters for a panel whose tabs are all
 * built and only one shown.
 *
 * Shared by `createOrbisPopup` and the content panel, whose focusable Saved rows would otherwise let Tab walk off into
 * Obsidian's sidebar.
 */
/**
 * What the browser will stop on, as a selector.
 *
 * **`summary` is here because the browser focuses one.** A `<details>` header is a tab stop with no `tabindex` and no
 * tag in the usual list, so a trap built from buttons and inputs cannot see it: Tab walks onto the folds natively, but
 * wrapping from the last control would jump past them to the first control the SELECTOR can see.
 *
 * Exported so the rule can be tested without a browser: everything else here needs layout, which jsdom has none of.
 */
export const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/**
 * Whether Tab will actually STOP here — which is not the same as matching {@link FOCUSABLE_SELECTOR}.
 *
 * Two things that selector cannot express, both of which put elements in the list that Tab skips:
 *
 * - **A radio group is one stop, not one per option.** The browser tabs to the CHECKED radio (or the first, when
 *   none is checked) and passes over its group-mates. `input` in the selector is unqualified, so all of them would
 *   be counted — which moves `first` and `last` off the real ends whenever a group sits at either end of a dialog.
 *   The export dialogs open with one.
 * - **A negative `tabIndex`.** The selector's `:not([tabindex="-1"])` guards only its own `[tabindex]` branch; a
 *   `button` or `input` given `tabIndex = -1` in script — as a roving tab stop does — still matches.
 *
 * Exported so the rule can be tested without a browser.
 */
export function isTabStop(root: HTMLElement, el: HTMLElement): boolean {
  if (el.tabIndex < 0) return false;
  const radio = el.instanceOf(HTMLInputElement) && el.type === 'radio' ? el : null;
  if (!radio?.name) return true;
  // Matched by name in script rather than in the selector: a group name is caller-supplied, and a selector built by
  // interpolating one is a quoting bug waiting for the first name with a space or a bracket in it.
  const group = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
    (option) => option.name === radio.name
  );
  return radio === (group.find((option) => option.checked) ?? group[0]);
}

export function trapTab(root: HTMLElement): void {
  root.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null && isTabStop(root, el)
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = activeDocument.activeElement;
    if (e.shiftKey && active === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && active === last) {
      first.focus();
      e.preventDefault();
    }
  });
}

/**
 * Mark a control busy while something it started is still starting, WITHOUT disabling it.
 *
 * **A disabled button cannot hold focus.** Setting `disabled` on the focused element blurs it — the browser moves
 * focus to `body` — and re-enabling does not bring it back: press the look-up popup's speak button from the keyboard
 * and the keyboard would be gone by the time the voice arrived.
 *
 * So the button stays enabled and says it is busy: `aria-busy` for a screen reader, a class for the eye, and the
 * caller's own handler ignores a second press. A control that must not be pressed twice can decline the second press
 * instead of becoming unreachable.
 */
export function setBusy(el: HTMLElement, busy: boolean): void {
  el.toggleClass('is-busy', busy);
  el.setAttribute('aria-busy', String(busy));
}

/**
 * Every option in a group is its own tab stop.
 *
 * **The opposite of a roving tab stop, and right on a toolbar.** A roving stop — one stop for the group, arrows
 * inside it — is the ARIA pattern for a set of mutually exclusive choices, and it is correct in a form. On the
 * annotation bar it is not: every other button on that bar is a tab stop, so a group that silently was not would read
 * as the other marks being unreachable, and nothing on a toolbar suggests that arrows are the way in. A bar of icons is
 * not a radio row, whatever its roles say.
 *
 * The roles stay `radio`/`radiogroup`, because that is still what they MEAN — one mark at a time, `aria-checked`
 * saying which — and the arrow keys keep working for anyone who expects them. What changes is that Tab reaches all
 * of them. The count is small and bounded by the marks a reader has defined.
 */
export function setAllTabStops(group: HTMLElement): void {
  for (const option of Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))) {
    option.tabIndex = 0;
  }
}
