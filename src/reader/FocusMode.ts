import { Platform } from 'obsidian';
import { t } from '../i18n';
import type { DebugCategory } from '../settings';
import { onActivate, setSvgIcon } from '../ui-utils';
import { FOCUS_PAGE_MARGIN, setReaderBottomSpace } from './top-space';
import { bottomClearance, rememberedSystemBar, sampleViewport } from './viewport-insets';

/**
 * The narrow host contract FocusMode needs from OrbisReaderView — the chrome DOM
 * it rearranges to go fullscreen, plus a few callbacks. A dedicated structural
 * interface (like ui-utils' OrbisPopupHost) rather than members on the shared
 * ReaderContext, because these are FocusMode-specific and used by nothing else. See docs/design/reader-architecture.md.
 */
export interface FocusModeHost {
  readonly containerEl: HTMLElement;
  readonly contentEl: HTMLElement;
  readonly hostEl: HTMLElement | null;
  readonly filterWrapperEl: HTMLElement | null;
  readonly historyNavEl: HTMLElement | null;
  readonly highlightDrawerRow: HTMLElement | null;
  readonly toolbarEl: HTMLElement | null;
  /** Foliate's renderer element, whose `margin` attribute focus mode narrows — see `FOCUS_PAGE_MARGIN`. */
  readonly foliateRenderer: HTMLElement | null;
  readonly focusBtn: HTMLButtonElement | null;
  readonly showProgressIndicator: boolean;
  formatLocLabel(): string;
  cycleProgressMode(): void;
  clearActiveSelectionAndAnnotationUI(): void;
  /** Notify other subsystems (currently search) that focus mode toggled. */
  onFocusModeChanged(active: boolean): void;
  /** Whether the listening controls are locked (pocket mode) — blocks exiting focus mode so an
   *  errant tap on the exit button can't drop the reader out of the full-screen player. */
  listeningControlsLocked(): boolean;
  /** Hide/show the native (Android) nav bar — shared with other reader popups. */
  setNativeNavBar(visible: boolean): void;
  /** One line into the reader's debug log — see `bottomClearance`, which is only diagnosable on a device. */
  debug(msg: string, category?: DebugCategory): void;
  /** Drop any mobile height lock outright — focus mode owns the layout while it is active. */
  releaseMobileHeightLock(): void;
}

/**
 * Fullscreen distraction-free reading: hides the Orbis toolbar and Obsidian's own
 * chrome (native toolbars, leaf header, ancestor transforms that trap position:
 * fixed), fills the safe area with the reader, and floats an exit button + progress
 * chip. The gnarly bits (the toolbar-hiding MutationObserver, ancestor style save/restore, the mobile keyboard chip
 * handling) live in one place.
 */
/**
 * Every property that makes an element a containing block for its `position: fixed` descendants, paired with the
 * value that switches it off.
 *
 * **Not just `transform` and `will-change`.** A fixed element inside an ancestor carrying any of these resolves against
 * that ancestor rather than the viewport — so focus mode's host, sized `top: 0; bottom: <inset>+30px`, would come out
 * as the ANCESTOR's height minus those offsets, and with the keyboard up that ancestor can be far shorter than the
 * viewport. Obsidian uses `contain` on workspace leaves, and a leaf shrinks for a keyboard.
 *
 * Camel-cased to read `getComputedStyle`, hyphenated again to write the property back.
 */
const CONTAINING_BLOCK_PROPS = [
  ['transform', 'none'],
  ['willChange', 'auto'],
  ['filter', 'none'],
  ['backdropFilter', 'none'],
  ['perspective', 'none'],
  ['contain', 'none'],
] as const satisfies readonly (readonly [keyof CSSStyleDeclaration & string, string])[];

/**
 * **`contain` is neutralized on mobile only, because on a phone the leaf IS the window and on a desktop it is
 * one pane of several.**
 *
 * Obsidian's containment on `.workspace-leaf` does two jobs at once: it makes the leaf the containing block for
 * `position: fixed` descendants, and (`contain: paint`) it gives the leaf a stacking context. Switching it off
 * everywhere would let focus mode out of the reading pane on a desktop and into the whole window, where it loses to
 * Obsidian's own chrome: the workspace's split divider paints a vertical line down the middle of the page (over a leaf
 * that no longer has a stacking context to hide it), and the debug chip and the debug log panel sit half off the left
 * edge (pinned 16px from the WINDOW, i.e. under the ribbon).
 *
 * So desktop keeps the leaf as the boundary. The other five are neutralized on both platforms: a transform between
 * `containerEl` and the leaf would otherwise trap the fixed chrome somewhere smaller still.
 *
 * **Filling the pane is the decision, not a limitation.** On a desktop the reader is one pane among several and focus
 * mode empties that pane; the window's own chrome is not the distraction it removes. So this is not a `contain`
 * workaround waiting for the ribbon, the split divider and the tab header to each be given a layer.
 */
function containingBlockProps(): readonly (typeof CONTAINING_BLOCK_PROPS)[number][] {
  if (Platform.isMobile) return CONTAINING_BLOCK_PROPS;
  return CONTAINING_BLOCK_PROPS.filter(([prop]) => prop !== 'contain');
}

/**
 * The app chrome focus mode hides on a phone or tablet, window-wide: the navbars and toolbars, and every row of tabs.
 *
 * **Not on a desktop**: there the screen is not short of room, and hiding the tabs would mean a book in focus mode
 * could not be left for another tab without leaving focus mode first. A desktop's focus mode hides the Orbis toolbar
 * and nothing of Obsidian's: the tab rows, the sidebars and this pane's own view header (its ← →, breadcrumb and ⋯
 * menu) all stay and keep working. The price is the header's row, and keeping Obsidian's navigation is worth it.
 */
const APP_CHROME = '.mobile-navbar, .mobile-toolbar, .app-toolbar, .mobile-action-bar, .workspace-tab-header-container';

/** Whether focus mode takes over the screen (a phone or tablet) or stays inside its pane below the view header. */
const hidesAppChrome = (): boolean => Platform.isMobile;

export class FocusMode {
  private active = false;
  /** Which ancestors had a containing-block property switched off, for the debug line. */
  private neutralised: string[] = [];
  private observer: MutationObserver | null = null;
  /** Each property `enter` overrode on an ancestor: what it set, and what was inline there before. */
  private ancestorStyles: { el: HTMLElement; prop: string; neutral: string; was: string; wasPriority: string }[] = [];
  private viewHeader: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private kbdCleanup: (() => void) | null = null;
  private drawerOriginalParent: HTMLElement | null = null;

  constructor(private readonly host: FocusModeHost) {}

  get isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) {
      this.exit();
      return;
    }
    /**
     * **Dismiss the keyboard, then enter.** A focused text field means a soft keyboard is up, and the blur is what
     * releases it — but the viewport never changes size on this platform. `innerHeight` reads the same with the
     * keyboard up and down, so there is nothing to wait for and nothing to poll.
     *
     * What the keyboard leaves behind is a height lock, and `enter` drops that outright — see
     * `releaseMobileHeightLock`. It does NOT wait for the keyboard: the viewport never changes size here, and
     * Obsidian's navbar may never come back, because `blur` does not reliably dismiss an Android keyboard inside a
     * WebView. The system-bar reading is taken from a moment the keyboard cannot spoil instead — see
     * `rememberedSystemBar`.
     */
    const focused = activeDocument.activeElement;
    if (focused?.instanceOf(HTMLElement) && focused.matches('input, textarea, [contenteditable]')) focused.blur();
    this.enter();
  }

  /** Update the floating progress chip text — the view calls this on each relocate. */
  setProgressText(text: string): void {
    if (this.progressEl) this.progressEl.textContent = text;
  }

  /**
   * Set an inline style with `!important` priority — the one thing setCssStyles
   * can't express. Routing the value through this parameter (rather than a bare
   * literal at each call site) is also what keeps it out of the static-styles rule.
   */
  private setImportant(el: HTMLElement, prop: string, value: string): void {
    el.style.setProperty(prop, value, 'important');
  }

  private enter(): void {
    /**
     * **Claimed before any of the work, not after it.** Set at the END of this method, `active` would let a second
     * toggle arriving before that line see `false` and run the whole entry again — over a reader the first one had
     * already rearranged. On a phone one tap readily delivers two events.
     *
     * The damage would be silent and total: the re-run measures the `.mobile-navbar` the first run has already hidden,
     * so the system-bar reading comes back 0 and the whole focus session loses its inset. See `systemBarBelow`, which
     * cannot tell "hidden" from "absent" and should not have to.
     */
    if (this.active) return;
    this.active = true;
    /**
     * **Release the height lock a keyboard left behind.** (Dismissing the keyboard itself is `toggle`'s job.)
     *
     * A text input taking focus calls `ReaderDom.lockHeights`, which pins `contentEl`'s height to the keyboard-reduced
     * viewport. Focus mode then gives `contentEl` `inset: 0` — and an explicit height beats that, so everything
     * anchored to its bottom lands short of the screen.
     *
     * The same keyboard hides Obsidian's `.mobile-navbar`, so `systemBarBelow` reads 0 at the same moment and the
     * session freezes a zero inset. Both symptoms have one cause, which is why the listening bar, having no text field
     * to focus, is unaffected.
     *
     * `hostEl`'s three properties are cleared below for the same reason; this covers `contentEl`'s.
     */
    this.host.releaseMobileHeightLock();
    this.host.clearActiveSelectionAndAnnotationUI();
    // Neutralize ancestor transform/will-change that would trap position:fixed
    this.ancestorStyles = [];
    this.neutralised = [];
    const props = containingBlockProps();
    let el: HTMLElement | null = this.host.containerEl.parentElement;
    while (el && el !== activeDocument.body) {
      const cs = getComputedStyle(el);
      const found = props.filter(([prop, neutral]) => {
        const value = cs[prop];
        return !!value && value !== neutral && value !== '';
      });
      if (found.length) {
        // !important required to override theme styles; cannot use a CSS class,
        // and the priority flag can't be expressed via setCssStyles.
        for (const [prop, neutral] of found) {
          const kebab = prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
          const was = el.style.getPropertyValue(kebab);
          this.ancestorStyles.push({ el, prop: kebab, neutral, was, wasPriority: el.style.getPropertyPriority(kebab) });
          this.setImportant(el, kebab, neutral);
        }
        this.neutralised.push(`${el.className.split(' ')[0] || el.tagName}:${found.map(([p]) => p).join('+')}`);
      }
      el = el.parentElement;
    }
    const takesScreen = hidesAppChrome();
    // Find the Obsidian leaf header via the leaf container — more reliable than
    // closest() on mobile where the DOM structure may differ. A desktop keeps it — see `APP_CHROME`.
    const viewHeader = takesScreen
      ? (this.host.containerEl.closest('.workspace-leaf')?.querySelector<HTMLElement>('.view-header') ?? null)
      : null;
    this.viewHeader = viewHeader;

    /**
     * **Measured here, because `hideToolbars()` is about to make it unmeasurable.** Obsidian keeps its own
     * `.mobile-navbar` clear of Android's system navigation bar, so the gap below it is that bar's height — and
     * once this hides the navbar, nothing on the page is positioned against the system bar any more. See
     * `systemBarBelow`.
     */
    const systemBar = rememberedSystemBar(activeWindow);

    const hideToolbars = () => {
      activeDocument.querySelectorAll<HTMLElement>(APP_CHROME).forEach((tb) => {
        if (tb.style.getPropertyValue('display') !== 'none') {
          // Native app-chrome elements; !important needed to override theme.
          this.setImportant(tb, 'display', 'none');
        }
      });
      // Keep the leaf header hidden even if something tries to restore it.
      if (viewHeader && viewHeader.style.getPropertyValue('display') !== 'none') {
        this.setImportant(viewHeader, 'display', 'none');
      }
    };
    /**
     * Watched because a phone puts its chrome back. A desktop hides none, so there is nothing to watch — and a
     * document-wide observer on a window of several panes would run on every style change in all of them.
     */
    if (takesScreen) hideToolbars();
    if (takesScreen && !this.observer) {
      this.observer = new MutationObserver(hideToolbars);
      this.observer.observe(activeDocument.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style'],
      });
    }

    // Hide the Orbis toolbar. The host fills the safe reading area by `.orbis-focus-mode .orbis-host` in styles.css;
    // the height lock's inline heights are taken off it here, since inline would beat that rule.
    this.host.toolbarEl?.hide();
    if (this.host.hostEl) {
      this.host.hostEl.style.removeProperty('height');
      this.host.hostEl.style.removeProperty('min-height');
      this.host.hostEl.style.removeProperty('max-height');
    }
    /**
     * **A narrower page, for as long as focus mode lasts.**
     *
     * Foliate's default leaves 48px above and below the text. Normal mode needs it — the bars float over the top
     * of the host rather than above it, and that 48 is the only thing keeping an open search bar off the first
     * line. Focus mode does not: the bars reserve their own room there, and with none open the blank is just
     * blank. On an iPhone in landscape the default leaves 62% of the screen to everything except text.
     *
     * The unit is required. `attributeChangedCallback` writes the raw value into `--_margin`, which is then read
     * both by CSS (`minmax(var(--_margin), 1fr)`, invalid without a unit, taking the whole `grid-template-rows`
     * declaration down with it) and by `#beforeRender` through `parseFloat`, which would not notice.
     *
     * Removed rather than reset on the way out, so normal mode keeps Foliate's own default instead of a second
     * copy of 48 here that could drift from it. Both transitions call `render()` inside Foliate — one more
     * re-layout in a method that already dispatches a resize for the same reason.
     */
    this.host.foliateRenderer?.setAttribute('margin', `${FOCUS_PAGE_MARGIN}px`);
    setReaderBottomSpace(this.host.foliateRenderer, true);
    activeWindow.dispatchEvent(new Event('resize'));

    this.host.contentEl.addClass('orbis-focus-mode');
    /**
     * **On a desktop the pane's content area stays in the flow, below the view header.** Everything focus mode
     * floats (the host, the band, the ×, the progress chip) is `position: fixed`, and on a desktop a fixed element
     * resolves against the leaf, which holds the header too: with the header kept, the book would cover it. This
     * class leaves `contentEl` where the leaf lays it out and makes it the containing block instead, so every one of
     * those positions measures from the top of the book's own area — see `.orbis-focus-in-pane`.
     */
    this.host.contentEl.toggleClass('orbis-focus-in-pane', !takesScreen);
    /**
     * **Measure across the overlay, because the platform will not tell us.** `setNativeNavBar(false)` hides the
     * status bar AND puts the web view edge to edge, so from here down we are drawing underneath Android's
     * navigation bar — which `env(safe-area-inset-bottom)` reports as 0, leaving the progress chip and the debug
     * button 20px off the true bottom of the screen and under a 48dp bar. See `bottomClearance`.
     *
     * The sample has to be taken BEFORE the call and read after it, on the next frame: the overlay resizes the
     * viewport asynchronously, and measuring in the same tick returns the numbers we already had.
     */
    const beforeOverlay = sampleViewport(activeWindow);
    this.host.setNativeNavBar(false);
    window.requestAnimationFrame(() => {
      if (!this.active) return;
      const after = sampleViewport(activeWindow);
      // The navbar reading first: it measures the bar itself, where `bottomClearance` can only infer one from a
      // resize that on this platform never happens. The inference stays as a second source for a device that has
      // no `.mobile-navbar` to read but does move its viewport.
      const clearance = systemBar || bottomClearance(beforeOverlay, after);

      // The host's bottom (`.orbis-focus-mode .orbis-host`) reads this, so it moves up with the system bar and keeps
      // the same reserve above it. Without it the page would paint down into the bar and the chip would sit on top of
      // its own last line of text.
      this.host.contentEl.style.setProperty('--orbis-focus-bottom-inset', `${clearance}px`);
      /**
       * The chip positions are logged with the inputs, because a photograph cannot settle where they landed: reasoning
       * from a screenshot's pixel heights means guessing at three scale factors at once. Each number here is the gap
       * between that control's bottom edge and the bottom of the viewport, so it can be compared directly against the
       * inset above it.
       */
      const gapBelow = (sel: string): string => {
        const el = this.host.contentEl.querySelector(sel);
        const rect = el?.getBoundingClientRect();
        return rect ? String(Math.round(activeWindow.innerHeight - rect.bottom)) : 'absent';
      };
      /**
       * The BOXES, not just the controls inside them: a chip that lands too high is pinned to whichever ancestor is
       * short. `t` is its top, `h` its height, `tf` a transform if it carries one — a transformed ancestor becomes the
       * containing block for `position: fixed` descendants, which is exactly how a chip pinned to the viewport ends up
       * pinned to something else.
       */
      const boxOf = (label: string, el: Element | null): string => {
        if (!el) return `${label}:absent`;
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        /**
         * **Every property that can make an element a containing block for `position: fixed`**, not just `transform`.
         * `hostEl` is fixed with `top: 0` and a `bottom` offset, so if its height comes out as `contentEl` minus those
         * offsets rather than the viewport minus them, something on `contentEl` is establishing that block. `filter`,
         * `contain`, `will-change`, `backdrop-filter` and `perspective` all do it too.
         *
         * `inline` is the whole `style` attribute, which settles inline-versus-stylesheet without another guess.
         */
        const blockers = (['transform', 'filter', 'backdropFilter', 'perspective', 'contain', 'willChange'] as const)
          .map((prop) => [prop, cs[prop]] as const)
          .filter(([, v]) => v && v !== 'none' && v !== 'auto' && v !== 'normal')
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
        const inline = (el as HTMLElement).style?.cssText ?? '';
        return `${label}:t${Math.round(rect.top)}/h${Math.round(rect.height)}/${cs.position}${blockers ? ` [${blockers}]` : ''}${inline ? ` inline{${inline}}` : ''}`;
      };
      this.host.debug(
        `focus mode bottom inset — ${clearance}px · navbar ${systemBar} · inner ${after.innerHeight} · visual ${Math.round(after.visualHeight)} · progress+${gapBelow('.orbis-focus-progress')} · debugChip+${gapBelow('.orbis-debug-chip')} · ${boxOf('content', this.host.contentEl)} · ${boxOf('overlay', this.overlayEl)} · ${boxOf('host', this.host.hostEl)} · neutralised[${this.neutralised.join(' ') || 'none'}]`,
        'display'
      );
    });
    if (this.host.focusBtn) {
      this.host.focusBtn.setAttribute('aria-label', t('toolbar.exit_focus_mode'));
      this.host.focusBtn.classList.add('is-active');
    }

    // Floating overlay appended to body so it's above all stacking contexts —
    // avoids z-index issues on Android where the leaf header can punch through.
    const overlay = this.host.contentEl.createDiv({ cls: 'orbis-focus-overlay' });
    this.overlayEl = overlay;

    /**
     * **The band paints itself.**
     *
     * `.orbis-focus-mode` puts the book's color on `contentEl` to fill the strips above and below the host, and the
     * fill does not reach the band above — left to it, the top of the screen goes black. So the band carries its own:
     * it is chrome, and chrome that depends on a background meant for gaps is the kind of thing that comes back the
     * next time either changes.
     *
     * `pointer-events: none` via the overlay, and no listeners — the whole point of the band is that a swipe
     * passes through it, which is what it is FOR. It paints under the buttons because the topbar carries an
     * explicit z-index and this does not.
     */
    overlay.createDiv({ cls: 'orbis-focus-topband' });

    // Top-right button cluster: the back/forward pair + the exit button live in one
    // flex row (`.orbis-focus-topbar`) so a real `gap` separates them, instead of each
    // being independently `position: fixed` with a hand-tuned `right` offset — that would guess the exit button's
    // width, and iPad renders the buttons wider (larger tap targets), leaving the forward arrow butted against the ×.
    const topbar = overlay.createDiv({ cls: 'orbis-focus-topbar' });

    // Re-parent the back/forward pair into the same safe overlay the exit button lives
    // in. Its normal home (inside filterWrapperEl) has `overflow: hidden` and can carry
    // an active CSS `filter` (brightness); a `position: fixed` descendant of a
    // filtered+clipped ancestor gets its containing block hijacked by that ancestor
    // instead of the viewport. In the flex topbar it flows normally. Moved back to
    // filterWrapperEl in exit().
    if (this.host.historyNavEl) topbar.appendChild(this.host.historyNavEl);

    // Re-parent the mobile highlight drawer into the same safe overlay, for the same
    // containing-block reason as the back/forward pair above (filterWrapperEl's
    // overflow:hidden + brightness filter would hijack/clip a fixed descendant). In the
    // overlay it is bottom-anchored over the progress chip (see styles.css) so it never
    // covers the top text lines a selection starts on. Restored in exit() before the
    // overlay is removed. Remember its original parent so it goes back exactly there.
    const drawerRow = this.host.highlightDrawerRow;
    if (drawerRow) {
      this.drawerOriginalParent = drawerRow.parentElement;
      overlay.appendChild(drawerRow);
    }

    const exitBtn = topbar.createEl('button', { cls: 'orbis-focus-exit-btn' });
    exitBtn.setAttribute('aria-label', t('toolbar.exit_focus_mode'));
    setSvgIcon(
      exitBtn,
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
    );
    // Blocked while the listening controls are locked (pocket mode) — the drag-to-unlock rail is
    // the only way out; a stray tap here must not exit focus mode.
    exitBtn.addEventListener('click', () => {
      if (this.host.listeningControlsLocked()) return;
      this.exit();
    });

    if (this.host.showProgressIndicator) {
      const prog = overlay.createSpan({ cls: 'orbis-focus-progress' });
      prog.textContent = this.host.formatLocLabel();
      prog.title = t('toolbar.select_to_cycle_progress_mode');
      prog.setAttribute('aria-live', 'polite');
      // The readout cycles what it shows, so it is a control, and a keyboard has to be able to reach it.
      onActivate(prog, () => this.host.cycleProgressMode());
      this.progressEl = prog;
    }

    // On mobile this chip is bottom-anchored in a fixed overlay, so when the keyboard
    // opens it rides up to sit above the keyboard instead of staying at the screen
    // bottom. Hide it whenever any input has focus (search, panel, or a popup like Go To)
    // — listen on the document, not just the reader, so popup inputs (appended to body)
    // count too. (A viewport-size check fails: some Android WebViews shrink innerHeight
    // and visualViewport together, defeating it.) The reader's heights are locked, so
    if (Platform.isMobile) {
      const isInput = (e: FocusEvent) => (e.target as HTMLElement | null)?.tagName === 'INPUT';
      const onFocusIn = (e: FocusEvent) => {
        if (isInput(e)) this.progressEl?.classList.add('orbis-focus-progress-hidden');
      };
      const onFocusOut = (e: FocusEvent) => {
        if (isInput(e)) this.progressEl?.classList.remove('orbis-focus-progress-hidden');
      };
      activeDocument.addEventListener('focusin', onFocusIn);
      activeDocument.addEventListener('focusout', onFocusOut);
      this.kbdCleanup = () => {
        activeDocument.removeEventListener('focusin', onFocusIn);
        activeDocument.removeEventListener('focusout', onFocusOut);
      };
    }

    // setFocusModeSearchSpace(true) is normally triggered by openSearchBar(),
    // but that only fires if the search bar is opened *while already* in
    // but that only fires if the search bar is opened *while already* in focus mode. If it is opened first and focus
    // mode entered afterward, this.focusMode is still false when openSearchBar() runs, so that call is a no-op —
    // re-check here so the already-open case is covered too.
    this.host.onFocusModeChanged(true);
  }

  private exit(): void {
    // The mirror of `enter`'s guard: nothing below is safe to run twice, and the exit button plus the command
    // plus the toolbar button are three ways to ask.
    if (!this.active) return;
    this.host.clearActiveSelectionAndAnnotationUI();
    this.kbdCleanup?.();
    this.kbdCleanup = null;
    this.observer?.disconnect();
    this.observer = null;
    this.host.onFocusModeChanged(false);
    /**
     * **Only what `enter` overrode, and only while it is still `enter`'s value.** This used to put back each
     * ancestor's whole `style` attribute as it was on entry — and an entry on a phone can come mid-way through
     * Obsidian closing its drawer (*Read in Orbis Reader* from the Files pane opens the book straight into focus
     * mode), so the exit put back the slide Obsidian had since rewritten on `.workspace-split`: the workspace sat
     * half off the screen.
     * A property something else has written since is that something's, and stays.
     */
    const restored: string[] = [];
    for (const { el, prop, neutral, was, wasPriority } of this.ancestorStyles) {
      const ours = el.style.getPropertyValue(prop) === neutral && el.style.getPropertyPriority(prop) === 'important';
      if (ours && was) el.style.setProperty(prop, was, wasPriority);
      else if (ours) el.style.removeProperty(prop);
      restored.push(`${el.className.split(' ')[0] || el.tagName}.${prop}:${ours ? `→'${was}'` : 'left (rewritten)'}`);
    }
    this.ancestorStyles = [];
    // Only where they were hidden — a desktop hid none.
    if (hidesAppChrome())
      activeDocument.querySelectorAll<HTMLElement>(APP_CHROME).forEach((tb) => {
        tb.style.removeProperty('display');
      });

    // Restore the Obsidian leaf header
    if (this.viewHeader) {
      this.viewHeader.style.removeProperty('display');
      this.viewHeader = null;
    }

    // Move the back/forward pair back to its normal home inside
    // filterWrapperEl before removing the overlay it was borrowed from —
    // otherwise .remove() below would delete it along with the overlay.
    if (this.host.historyNavEl && this.host.filterWrapperEl)
      this.host.filterWrapperEl.appendChild(this.host.historyNavEl);

    // Move the highlight drawer back to its original home (the overlay container) before
    // removing the overlay it was borrowed from — otherwise .remove() would take it too.
    if (this.host.highlightDrawerRow && this.drawerOriginalParent)
      this.drawerOriginalParent.appendChild(this.host.highlightDrawerRow);
    this.drawerOriginalParent = null;

    // Remove floating overlay, restore toolbar, and clear host inline styles.
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.progressEl = null;
    this.host.toolbarEl?.show();
    if (this.host.hostEl) {
      // Its placement goes with `.orbis-focus-mode`, below. Clear any leftover selection-compensation transform
      // (Issue 2, ReaderDom) so it can't linger into normal mode if focus exits mid-compensation.
      this.host.hostEl.style.removeProperty('transform');
    }
    // Back to Foliate's own 48px, which normal mode needs — see `FOCUS_PAGE_MARGIN`.
    this.host.foliateRenderer?.removeAttribute('margin');
    setReaderBottomSpace(this.host.foliateRenderer, false);
    activeWindow.dispatchEvent(new Event('resize'));

    this.host.contentEl.removeClass('orbis-focus-mode');
    this.host.contentEl.removeClass('orbis-focus-in-pane');
    // Cleared with the rest of it: the inset is a fact about being edge to edge, and the debug chip reads this
    // variable in normal mode too — left behind, it would push the chip up by a navigation bar that is no longer
    // overlapping anything.
    this.host.contentEl.style.removeProperty('--orbis-focus-bottom-inset');
    this.host.setNativeNavBar(true);
    this.active = false;
    // What the exit put back, and how the page sits a frame later — a shifted workspace on a phone names its cause.
    window.requestAnimationFrame(() => {
      const where = (sel: string): string => {
        const el = activeDocument.querySelector<HTMLElement>(sel);
        if (!el) return `${sel}:none`;
        const r = el.getBoundingClientRect();
        const tf = getComputedStyle(el).transform;
        return `${sel}:x${Math.round(r.left)}/w${Math.round(r.width)}${tf && tf !== 'none' ? ` t=${tf}` : ''} {${el.style.cssText}} .${el.className.split(' ').join('.')}`;
      };
      this.host.debug(
        `focus mode exit — restored[${restored.join(' ') || 'none'}] · ${where('.app-container')} · ${where('.workspace')} · ${where('.workspace-drawer.mod-left')} · host x${Math.round(this.host.hostEl?.getBoundingClientRect().left ?? -1)}`,
        'display'
      );
    });
    if (this.host.focusBtn) {
      this.host.focusBtn.setAttribute('aria-label', t('toolbar.focus_mode'));
      this.host.focusBtn.classList.remove('is-active');
    }
  }

  /** Reset state + DOM handles on book close (exit() should already have run if active). */
  dispose(): void {
    this.kbdCleanup?.();
    this.kbdCleanup = null;
    this.observer?.disconnect();
    this.observer = null;
    this.active = false;
    this.ancestorStyles = [];
    this.viewHeader = null;
    this.overlayEl = null;
    this.progressEl = null;
  }
}
