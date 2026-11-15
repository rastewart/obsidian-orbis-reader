import { type App, Modal, Platform, setIcon } from 'obsidian';
import { t } from './i18n';
import { navbarClearance } from './reader/viewport-insets';
import { watchTooltipDocument } from './tooltip-gap';
import {
  claimFocusSoon,
  MOBILE_DIALOG_TOP_PX,
  popupIsOpen,
  setImportantStyle,
  setSvgIcon,
  topmostPopupEl,
  trapTab,
} from './ui-utils';

/**
 * The base class for every Orbis dialog that has to be a real Obsidian `Modal`.
 *
 * Most Orbis dialogs are not Modals at all — they use `createOrbisPopup`, which owns the backdrop, the
 * left-aligned heading, the close ×, Escape-to-dismiss and keyboard-aware positioning. But that helper
 * takes an `OrbisPopupHost`: the reader view, whose `contentEl` it positions over and whose mobile heights
 * it freezes. A dialog opened from the Settings screen has no reader view to host it, so the annotation
 * manager, the glossary and the compact settings dialogs have to be Modals — and Obsidian centers a
 * Modal's title, so on their own they do not look like the rest of the plugin.
 *
 * Styling each one individually drifts, each with its own spacing. This exists so the chrome comes from
 * being an Orbis dialog rather than from remembering to add it — the same argument `createOrbisPopup`'s
 * own comment makes for popups.
 *
 * Subclasses implement `dialogTitle()` and `renderDialog()` instead of overriding `onOpen()`. A dialog
 * whose heading changes while it is open calls `refreshTitle()`; one whose heading is more than text (the
 * mark editor's `badge · name`) renders into `titleRowEl` from its own override.
 *
 * The heading is Orbis's OWN element, not Obsidian's `titleEl`. Obsidian centers `.modal-title` on mobile,
 * and not with a rule a plugin can reliably outrank — higher specificity plus `!important` on the
 * alignment still comes out centered on Android, because the centring does not come from the property
 * being overridden. A heading element of our own sidesteps that. Using the same class as
 * `createOrbisPopup`'s title is the point — one rule styles both surfaces, so a popup and a modal cannot
 * drift apart.
 *
 * Obsidian's own header chrome — its close × and its header bar — is hidden and replaced with the popups'
 * flat ×; see `replaceModalChrome`, which finds it by shape rather than by class name.
 */
/**
 * How many dialogs of ours are open, and who wants to know when the last one closes.
 *
 * **Because a settings page must not redraw behind an open dialog.** These editors save as they go, and each save
 * would redraw the page underneath — where Obsidian's settings pane focuses ITSELF on redraw, taking the keyboard out
 * of the dialog and leaving the ring on a row behind it. A redraw nobody can see is worth nothing; deferring it until
 * the dialog closes costs nothing.
 */
const openModals = new Set<HTMLElement>();
const afterLastClose = new Set<() => void>();

/**
 * The dialogs actually on screen.
 *
 * **Elements, not a counter.** A counter is only as good as its decrements: one missed `onClose` — a dialog closed by
 * a route that does not run it, a throw inside it — and the plugin believes a dialog is open forever, at which point
 * every deferred redraw is deferred for good. A set of elements can be checked against the document, so anything
 * detached is gone by definition and the state cannot drift.
 */
function liveModals(): HTMLElement[] {
  for (const el of openModals) if (!el.isConnected) openModals.delete(el);
  return [...openModals];
}

/** True while any Orbis dialog is on screen. */
function orbisDialogOpen(): boolean {
  return liveModals().length > 0;
}

/** Run `fn` when the last open dialog closes — or now, if none is open. Registered once per callback. */
export function whenDialogsClose(fn: () => void): void {
  if (!orbisDialogOpen()) {
    fn();
    return;
  }
  afterLastClose.add(fn);
}

/**
 * Whether a dialog is on screen — ours or Obsidian's.
 *
 * **The moment a prompt must not choose.** Detected from the DOM, because a popup is not registered anywhere countable:
 * `.orbis-popup-close-btn` is ours (every `createOrbisPopup` dialog has exactly one) and `.modal-container` is
 * Obsidian's.
 *
 * **Asked of the window the prompt would open in** — `activeDocument`, which is where a new dialog goes. Obsidian 1.14
 * opens a modal with a window title, Settings among them, in a window of its own, and that window carries no
 * `.modal-container`: its body is marked `is-popout-modal` instead (app.js 1.14.4). Counting only the container, a
 * prompt raised with the Settings window focused opened inside it, over Settings. Counting Settings wherever it was
 * went wrong the other way: with Settings open in its own window and the book's window focused, every prompt waited
 * out its two minutes and was dropped — though it would have opened beside Settings, not over it.
 *
 * If a name drifts, the failure is a prompt appearing over a dialog once, which is mild. The alternative —
 * a prompt that never appears — would be invisible, and was, for the length of one test run.
 *
 * @param overSettings don't count Obsidian's Settings: its window, or on mobile its `.mod-settings` modal.
 */
export function dialogIsOpen(overSettings = false): boolean {
  if (!overSettings && activeDocument.body.hasClass('is-popout-modal')) return true;
  return [...activeDocument.querySelectorAll('.orbis-popup-close-btn, .modal-container')].some(
    (el) => !(overSettings && el.querySelector(':scope > .modal.mod-settings'))
  );
}

/**
 * Can a dialog that belongs over the book open now — is the book's window the active one, with nothing open in it?
 *
 * For a dialog that comes back by itself, like a finished recording's, and must come back where the book is. A new
 * dialog goes into `activeDocument`, so with Settings' own window in front it would open inside Settings, cut off
 * at that window's edge. No `is-popout-modal` test: that marks Settings' window, which this has already ruled out
 * by asking for the book's. Every open dialog counts, Settings' mobile modal included.
 */
export function bookWindowFree(bookDoc: Document, active: Document = activeDocument): boolean {
  return active === bookDoc && !bookDoc.querySelector('.orbis-popup-close-btn, .modal-container');
}

/**
 * Resolve once no dialog is in the way — `true` — or with `false` after about two minutes of one staying up.
 *
 * For a dialog nobody asked for, which must not land on top of one they did. The same shape as the device-locations
 * and reading-records prompts: polled, because nothing announces Obsidian's own dialogs closing, and capped, so one
 * left open is not polled forever.
 *
 * @param overSettings let Obsidian's Settings through — in its own window (desktop) or as `.mod-settings` (mobile).
 *   For the welcome at install, which arrives the moment the reader presses Enable there, on purpose.
 */
export function untilNoDialog(overSettings = false): Promise<boolean> {
  return new Promise((resolve) => {
    let tries = 0;
    const attempt = () => {
      if (!dialogIsOpen(overSettings)) resolve(true);
      else if (++tries > 48) resolve(false);
      else window.setTimeout(attempt, 2500);
    };
    attempt();
  });
}

export abstract class OrbisModal extends Modal {
  /** What had the keyboard when this dialog opened, if that was inside another dialog — see `onOpen`. */
  private opener: { el: HTMLElement; key: string | null } | null = null;
  /** Ends `keepFocusInside`; a no-op until it has started. */
  private releaseFocusKeep: () => void = () => {};

  protected constructor(
    app: App,
    private readonly chrome: {
      /** An inline SVG string to sit before the heading — `annotationsSvg()` and friends. */
      icon?: string;
      /**
       * Tight spacing, capped width and top-anchored on mobile.
       *
       * For dialogs whose fields and action buttons must ALL clear the on-screen keyboard: Obsidian
       * centers a modal vertically and sizes it to content, so the buttons below an input end up under
       * the keyboard. These dialogs cannot use `createOrbisPopup`'s keyboard handling (reader-coupled),
       * so they are pinned near the top and styled tight instead.
       */
      compact?: boolean;
      /**
       * Fill the screen on a phone.
       *
       * For a dialog that GROWS — a list you add rows to — where `compact` is the wrong answer: capping the
       * height to clear the keyboard also cuts off the buttons at the bottom, and a dialog you cannot save is
       * worse than one whose fields a keyboard might cover. Use it when the only text field is near the top, so
       * the keyboard was never the problem.
       */
      fullScreenOnMobile?: boolean;
      /**
       * Whether a click on the backdrop dismisses the dialog. Default true, as Obsidian does it.
       *
       * The same option `createOrbisPopup` takes, under the same name and with the same default, because it is
       * the same decision: a dialog holding work a stray click would throw away — two thousand rows ticked, a
       * list halfway through being reordered — sets it false and is dismissed by ×, Cancel or Escape instead.
       *
       * **Escape still closes it.** The point is not to trap anyone; it is that dismissing this much work should
       * be something you did on purpose rather than something that happened while you were aiming at the list.
       */
      dismissOnOutsideClick?: boolean;
      /**
       * This dialog appeared on its own — at startup, or when a sync landed — rather than because the reader asked
       * for it.
       *
       * Such a dialog says who is asking, above what is being asked. A reader who tapped a button knows which
       * plugin they are talking to; one who has just opened Obsidian and been handed "Settings changed on another
       * device" has no way to tell that from any of a dozen other plugins, and cannot answer a question they cannot
       * place.
       */
      unprompted?: boolean;
    } = {}
  ) {
    super(app);
  }

  /** Orbis's own heading element: a sibling of `.modal-content`, in the slot Obsidian's title occupies, so
   *  it aligns with the body. Subclasses with a structured title render into this. */
  protected titleRowEl!: HTMLElement;

  /** The dialog's heading. */
  protected abstract dialogTitle(): string;

  /** Build the dialog's body into `this.contentEl`. Runs with the chrome already in place. */
  protected abstract renderDialog(): void;

  /**
   * Deliberately not for subclasses to override — that is what `renderDialog()` is for. Overriding it
   * without calling `super.onOpen()` is precisely the drift this class exists to prevent.
   */
  /**
   * Hand the keyboard back to the dialog underneath, closest first: the control it came from, its replacement after a
   * rebuild, or the dialog itself. Never `body` while a dialog is still on screen.
   */
  /**
   * **Deliberately not for subclasses to override — that is what `onDialogClose()` is for.**
   *
   * This is where the register is kept and where anything waiting on "the last dialog closed" is run. An override
   * that forgets `super` silently breaks the deferred redraw: the edit saves, the page redraw is queued, and the
   * dialog closes without flushing the queue — so the list shows the old rows until you leave the page and come
   * back. That is the drift this class exists to prevent, so the hook a subclass wants has a name of its own and
   * this one cannot be missed. Emptying `contentEl` is done here too, since every subclass wants it.
   */
  onClose(): void {
    // The subclass first: it may resolve a result or notify a caller, and those expect to have run before anything
    // waiting on the last dialog closing.
    this.onDialogClose();
    this.releaseFocusKeep();
    openModals.delete(this.modalEl);
    /**
     * **Watched, not guessed.** Obsidian restores focus after `onClose`, and its restore can land later than a frame
     * and in the wrong place: it aims at whatever was focused when the dialog opened, which a save has usually
     * rebuilt. One attempt a frame later loses to it, and the keyboard ends up in the settings window behind —
     * where the next Enter navigates the settings tab.
     *
     * So for a short while after closing, any focus landing outside every open dialog is pulled back in. A key or
     * pointer press ends the watch at once, so it can never argue with the reader.
     */
    this.watchFocusBackIn();
    if (!orbisDialogOpen()) {
      // Copied first: a callback may open a dialog of its own, and iterating the live set would then run it twice.
      const waiting = [...afterLastClose];
      afterLastClose.clear();
      /**
       * **A macrotask, so these run after the host has put focus back.**
       *
       * What waits here is almost always a page redraw, and Obsidian restores focus to whatever was focused when the
       * dialog opened — the row's pencil — AFTER `onClose` returns. Run inside `onClose`, a redraw destroys that
       * pencil before the restore aims at it: focus falls to `body` and the rebuild has nothing to carry across.
       * Run a tick later, the restore has already landed on the pencil, so `rebuildKeepingFocus` sees it and puts the
       * keyboard on its replacement by key. Same rule as `docs/design/dialog-system.md` states for a list rebuilt by
       * its own editor; this is that rule for the page underneath.
       */
      this.modalEl.win.setTimeout(() => {
        for (const fn of waiting) fn();
      }, 0);
    }
    this.contentEl.empty();
  }

  /**
   * A subclass's own cleanup: a pin to release, a promise to settle, a caller to notify.
   *
   * The DOM is emptied for you afterwards, so a subclass that only wanted that needs nothing here.
   */
  protected onDialogClose(): void {}

  /**
   * Put the keyboard back where it was when something outside the dialog drops it — until the reader takes the mouse.
   *
   * **Obsidian drops it as a book opens.** Activating the new tab (`setActiveLeaf` → `focusLeaf` →
   * `setEphemeralState`) blurs whatever holds focus, and it lands on `body`. Measured over the multi-device offer,
   * which arrives as a book opens: the drop came at +46ms with a small book — after two of the three claims, before the
   * last, so the offer kept its starting control — and later than every claim with a large one, so the offer sat
   * there with nothing focused.
   *
   * Only a drop to NOTHING, of a control still on screen: Tab moving to the next button names where it went, and a
   * repaint that removes the focused control is the repaint's to restore. A pointer press ends it, so a click on the
   * dialog's empty space — which takes focus away, as it does in every browser dialog — is never argued with.
   */
  private keepFocusInside(): void {
    const doc = this.modalEl.ownerDocument;
    const keep = (e: FocusEvent): void => {
      const lost = e.target;
      if (e.relatedTarget || !(lost instanceof Node) || !lost.isConnected || !lost.instanceOf(HTMLElement)) return;
      this.modalEl.win.setTimeout(() => {
        const now = doc.activeElement;
        // Only the topmost: a dialog opened over this one is taking the keyboard on purpose.
        const topmost = [...openModals].at(-1) === this.modalEl;
        if ((!now || now === doc.body) && lost.isConnected && topmost) lost.focus();
      }, 0);
    };
    const stop = (): void => {
      this.modalEl.removeEventListener('focusout', keep);
      doc.removeEventListener('pointerdown', stop, true);
    };
    this.modalEl.addEventListener('focusout', keep);
    doc.addEventListener('pointerdown', stop, true);
    this.releaseFocusKeep = stop;
  }

  /** Pull focus back into the dialog underneath for a moment after closing — see the note in `onClose`. */
  private watchFocusBackIn(): void {
    const doc = this.modalEl.ownerDocument;
    const pull = (): void => this.handOverFocus();
    const stop = (): void => {
      doc.removeEventListener('focusin', pull, true);
      doc.removeEventListener('keydown', stop, true);
      doc.removeEventListener('pointerdown', stop, true);
    };
    doc.addEventListener('focusin', pull, true);
    doc.addEventListener('keydown', stop, true);
    doc.addEventListener('pointerdown', stop, true);
    this.modalEl.win.setTimeout(stop, 600);
    // And once immediately, for the case where nothing focuses anything at all.
    this.modalEl.win.requestAnimationFrame(pull);
  }

  private handOverFocus(): void {
    const parents = liveModals();
    /**
     * **A popup counts as something underneath.**
     *
     * Looking only at the modal register, a Modal opened over a POPUP — the replace-or-cancel prompt over Save
     * as PDF — would find no parent and let Obsidian's own restore put the keyboard on the book behind
     * everything. Cancelling a prompt belongs back in the dialog that asked it.
     */
    const surfaces = [...parents, ...(topmostPopupEl() ? [topmostPopupEl() as HTMLElement] : [])];
    const parent = surfaces[surfaces.length - 1];
    if (!parent) return; // nothing underneath: Obsidian's own restore is right for the last one out
    const now = parent.ownerDocument.activeElement;
    if (now?.instanceOf(Node) && surfaces.some((el) => el.contains(now))) return; // already inside a dialog
    const byKey = this.opener?.key
      ? parent.querySelector<HTMLElement>(`[data-orbis-focus="${CSS.escape(this.opener.key)}"]`)
      : null;
    /**
     * **Connected is not the same as focusable.** The control that opened this may have disabled itself while
     * it waits for the answer — Save as PDF grays its buttons for the duration of the export — and `.focus()`
     * on a disabled element does nothing at all, silently, which leaves the keyboard exactly where it should
     * not be. So a disabled opener is no opener, and the surface itself takes the keyboard instead.
     */
    const usable = (el: HTMLElement | null | undefined): HTMLElement | null =>
      el?.isConnected && !(el.instanceOf(HTMLButtonElement) && el.disabled) ? el : null;
    const target = usable(byKey) ?? usable(this.opener?.el) ?? parent;
    // A popup is a plain div and holds focus only if it is allowed to — the same `tabIndex = -1` a modal
    // gives itself for exactly this, so that landing on the surface is at least landing somewhere.
    if (target === parent && !parent.hasAttribute('tabindex')) parent.tabIndex = -1;
    target.focus();
  }

  onOpen(): void {
    // This dialog's window, which may be one the tooltip gap has not heard from yet — Settings, in a window of its own.
    watchTooltipDocument(this.modalEl.ownerDocument);
    /**
     * **Where the keyboard was, so closing can put it back.** A dialog opened from another dialog — a widget editor
     * over a dashboard, a value editor over a collection — leaves focus on `body` when it closes: Obsidian does not
     * return the keyboard to a parent dialog, and `body` is where the settings page behind quietly picks it up. The
     * key is remembered as well as the element, because the parent usually rebuilds the list that was clicked, so the
     * element is gone by then and its replacement carries the same key.
     */
    const before = this.modalEl.ownerDocument.activeElement;
    // `popupIsOpen()` as well as `orbisDialogOpen()`: the surface underneath may be a popup, and the control
    // that opened this one is worth remembering either way.
    if (before?.instanceOf(HTMLElement) === true && (orbisDialogOpen() || popupIsOpen())) {
      this.opener = { el: before, key: before.dataset.orbisFocus ?? null };
    }
    openModals.add(this.modalEl);
    this.modalEl.addClass('orbis-modal');
    /**
     * **Above the popup that opened this, when there is one.**
     *
     * A popup is a `div` on the body at `z-index: 100000` — it has to clear focus mode — and Obsidian's modal
     * container sits far below that. So "Create folder", opened from the export dialog, would render *underneath* it
     * and centered in the window while the popup sits off to one side: a dialog you can see the edge of and not use.
     *
     * Conditional, not blanket. The stack runs both ways — the presets manager is a Modal that opens popups of its
     * own — so raising every modal above every popup would bury those instead. The class goes on the container
     * Obsidian owns, and leaves with it when the modal closes.
     */
    if (popupIsOpen()) this.containerEl.addClass('orbis-modal-over-popup');
    // So it can hold focus itself when nothing better survives — a dialog is at least a place to be.
    this.modalEl.tabIndex = -1;
    if (this.chrome.compact) {
      this.modalEl.addClass('orbis-compact-modal');
      // Top-anchored rather than centered, so a keyboard cannot push the action buttons off the bottom.
      if (Platform.isMobile) this.containerEl.addClass('orbis-modal-compact-top');
    }
    /**
     * **Every dialog opens at the same distance from the top of the window, and stays there.**
     *
     * Obsidian centers a modal and sizes it to its content, so every change in height moves the top by half the
     * difference — and what moves is whatever sits at the top. Switching the presets dialog from five marks to
     * eleven would lift its tab row ~200px, taking the button just clicked out from under the pointer and putting
     * the way back somewhere else. A control that relocates as a RESULT of being used is the fault; the drifting
     * outline is only how you notice.
     *
     * **Unconditional, not a flag a dialog opts into.** Almost every Orbis dialog has folds or controls that come
     * and go, so a flag would be a judgment call to get wrong on each new one. A two-line confirm pinned too near
     * the top of a large display reads as broken, which is why `--orbis-pin-inset` is 8vh: far enough down to
     * read as placed rather than stuck to the ceiling, and the same for a confirm as for a dialog ten times its
     * height. Popups take the same inset from the same variable, so the two families cannot disagree.
     *
     * **A phone too.** A mobile modal is near-full-height, and so has nothing to center, only when it is long;
     * Marks is both long and short: its two tabs can hold eleven marks and one. Centered, the shorter tab would open
     * a third of the way down the screen while the longer one starts at the top and runs off the bottom under the
     * navbar — so the tab row, the only way between them, would move several hundred pixels on the tap that
     * switches tabs. The cap below is what keeps
     * the long tab on screen; `alignItems` is what keeps the short one from floating.
     *
     * The two mobile branches around it still win where they disagree, because their classes are more specific: a
     * compact dialog takes a smaller inset to clear the keyboard (`orbis-modal-compact-top`), a full-screen one none
     * (`orbis-modal-fill`).
     */
    this.containerEl.addClass('orbis-modal-pin-top');
    this.modalEl.addClass('orbis-modal-pinned');
    /**
     * **On a phone the gap above and the gap below are different numbers, because they answer different things.**
     *
     * Above is `MOBILE_DIALOG_TOP_PX` — the same 30px a popup over the toolbar opens at, so the two families land
     * together instead of the modal sitting visibly lower. 8vh is right where there is room to spare and wrong on
     * a phone, where it is ~64px taken off a list that is already scrolling.
     *
     * Below is whatever Obsidian's navbar is standing on, measured rather than guessed: the pill's height plus the
     * system bar under it differ between Android's two navigation modes and again on a phone with a home
     * indicator. `navbarClearance` reads 0 where there is no navbar — focus mode, a desktop — and the fallback in
     * the stylesheet is then the top inset, which is the symmetry the larger screens keep.
     *
     * Measured at open, which is the only honest moment: the navbar is hidden while a soft keyboard is up, and a
     * dialog that raises one has `pinModalAboveKeyboard` for that anyway.
     */
    if (Platform.isPhone) {
      this.containerEl.style.setProperty('--orbis-pin-inset', `${MOBILE_DIALOG_TOP_PX}px`);
      const clearance = navbarClearance(activeWindow);
      if (clearance > 0) this.containerEl.style.setProperty('--orbis-pin-bottom', `${clearance}px`);
    }
    // After `compact`, so it wins where they disagree: a full-screen dialog wants no inset at all.
    if (this.chrome.fullScreenOnMobile && Platform.isMobile) {
      this.modalEl.addClass('orbis-fullscreen-modal');
      this.containerEl.addClass('orbis-modal-fill');
    }
    // Obsidian closes on a click anywhere in the container outside the dialog. The listener is on the container
    // itself, so a capture-phase one added here runs first and can stop the event before it ever gets there —
    // and only for a click that landed on the backdrop, so nothing inside the dialog is affected.
    if (this.chrome.dismissOnOutsideClick === false) {
      this.containerEl.addEventListener(
        'click',
        (event) => {
          if (event.target === this.containerEl || (event.target as HTMLElement)?.hasClass?.('modal-bg')) {
            event.stopPropagation();
          }
        },
        true
      );
    }
    // Before `contentEl`, where Obsidian's own title sits — same horizontal alignment as the body, and it
    // survives a subclass emptying `contentEl` on every re-render.
    this.titleRowEl = createDiv({ cls: 'orbis-dialog-title' });
    this.modalEl.insertBefore(this.titleRowEl, this.contentEl);
    /**
     * Obsidian puts the modal's horizontal padding on `.modal-content`, not on `.modal`, so a sibling of the content
     * gets none: the heading would sit flush to the dialog's edge while the body below it starts ~30px further in —
     * left-aligned but not aligned with anything, which reads as "not the Orbis heading". Measured from the content
     * rather than guessed from Obsidian's spacing variables, so it stays right across themes and platforms.
     *
     * **Padding PLUS margin, because the two can cancel out.** `.modal-content` carries `padding: 4px; margin: -4px`
     * so a focus ring on a full-width row has room to paint; that leaves its children exactly where they were, while
     * the padding alone says 4px — which would put the heading 4px right of the rows it is supposed to line up with.
     * What matters is where the content's children START, which is padding and margin together.
     */
    const contentStyle = getComputedStyle(this.contentEl);
    const inset = Number.parseFloat(contentStyle.paddingLeft) + Number.parseFloat(contentStyle.marginLeft);
    this.titleRowEl.style.paddingLeft = `${Number.isFinite(inset) ? Math.max(0, inset) : 0}px`;
    // **Who is asking, above what is being asked.** A dialog the reader summoned needs no attribution — they tapped
    // the thing that opened it — but one arriving on its own, at startup or when a sync lands, is a question from
    // nowhere: "Settings changed on another device" could be any of a dozen plugins, and nobody can answer a
    // question they cannot place. A sibling ABOVE the heading rather than part of it, because the heading row is a
    // flex line that the icon and the title share.
    if (this.chrome.unprompted) {
      // Marked in the DOM, not in a variable: a plugin reload re-evaluates this module and forgets everything it
      // held, while the dialog the previous instance opened is still on screen. See `openOrbisDialog`.
      this.modalEl.dataset.orbisDialog = this.dialogTitle();
      const from = createDiv({ cls: 'orbis-dialog-from', text: t('dialog.from_orbis') });
      from.style.paddingLeft = this.titleRowEl.style.paddingLeft;
      this.modalEl.insertBefore(from, this.titleRowEl);
    }
    replaceModalChrome(this.modalEl, this.titleRowEl, () => this.close());
    /**
     * Tab stays in the dialog, as it does in every popup (`createOrbisPopup` traps it too).
     *
     * Obsidian does not wrap it for us: Shift+Tab off the first control walks out into the app behind the backdrop,
     * where the ring is invisible under the dim and the keyboard is somewhere the reader cannot see. Attached to the
     * dialog element rather than the content, so the × — which is a sibling of the body, inserted above the heading —
     * is inside the loop and is where a forward Tab off the last control lands.
     */
    trapTab(this.modalEl);
    this.refreshTitle();
    this.renderDialog();
    /**
     * **The keyboard starts inside the dialog, on its first real control.**
     *
     * Obsidian does not put it there. A dialog opened from another dialog inherits focus by accident — the opener was
     * inside a modal — but one opened from the command palette gets nothing: the palette closes, the keyboard goes
     * back to wherever it came from, and Tab in the new dialog does nothing a reader can see.
     *
     * **The first control, not the ×.** Obsidian focuses the × itself as the dialog opens, and that costs this:
     * Enter closes the dialog before the reader has read it, and Tab walks away from the only thing they came to
     * answer. The × is LAST in the tab order — `replaceModalChrome` appends it — so
     * landing on the first control gives the walk its natural shape: the content, then the actions, then Close.
     *
     * Withdraws if anything inside already holds the keyboard, so a dialog that focuses its own field (the style
     * name, New folder) keeps that choice.
     *
     * **And on a phone, never a field the on-screen keyboard follows.** Landing on the first control is right
     * until that control takes text: the keyboard opens unbidden and covers the rest of the dialog — a device name
     * asked for over two toggles and a pair of buttons nobody can see. The
     * dialogs that genuinely want typing straight away focus their own field and this withdraws for them — so
     * skipping text entry here costs those nothing, and the landing goes to the first control that does not
     * summon a keyboard.
     */
    // **Unless the dialog names its starting control** with `data-orbis-start`: the first control is not always the
    // safe one to stand on. An offer's "Don't ask again" leads its row, so landing there would put "never" one Enter
    // away — the confirm marks its way out instead.
    const named = this.modalEl.querySelector<HTMLElement>('[data-orbis-start]:not([disabled])');
    const TEXT_ENTRY = new Set(['text', 'password', 'email', 'number', 'search', 'tel', 'url']);
    const summonsKeyboard = (el: HTMLElement): boolean =>
      el.instanceOf(HTMLTextAreaElement) || (el.instanceOf(HTMLInputElement) && TEXT_ENTRY.has(el.type));
    const first = Array.from(
      this.modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).find((el) => !el.hasClass('orbis-popup-close-btn') && !(Platform.isMobile && summonsKeyboard(el)));
    this.keepFocusInside();
    // **The × does not count as holding the keyboard.** Obsidian focuses it on a schedule of its own, and a check
    // that only asked "is focus inside?" stepped aside for it — on some opens the × held focus through all three
    // attempts and the dialog started there, the one place this exists to avoid. Measured over the multi-device
    // offer: the × at the first frame, then the claim's own target — once the × no longer counts as an answer.
    claimFocusSoon(named ?? first ?? this.modalEl, () => {
      const now = this.modalEl.ownerDocument.activeElement;
      if (!now || !this.modalEl.contains(now)) return true;
      return now.hasClass('orbis-popup-close-btn');
    });
  }

  /**
   * The row the action buttons go in: a real footer, outside the scrolling body.
   *
   * **Not a sticky row inside the content.** Sticky keeps the buttons on
   * screen but leaves them overlapping whatever is behind them, and on a phone it fights the keyboard handling —
   * the dialog resizes, the bar lands mid-field, and the last question you were answering is underneath it. A
   * sibling of `.modal-content` in the dialog's own flex column cannot overlap anything: the body takes the space
   * that is left.
   *
   * Created on first use and reused, so a dialog that rebuilds its body does not grow a second one.
   */
  protected footer(): HTMLElement {
    this.footerEl ??= this.modalEl.createDiv({ cls: 'orbis-dialog-footer' });
    return this.footerEl;
  }

  private footerEl: HTMLElement | null = null;

  /** Rebuild the heading — for a dialog whose title tracks what it is showing. */
  protected refreshTitle(): void {
    this.titleRowEl.empty();
    if (this.chrome.icon) setSvgIcon(this.titleRowEl.createSpan({ cls: 'orbis-title-icon' }), this.chrome.icon);
    this.titleRowEl.createSpan({ text: this.dialogTitle() });
  }
}

/**
 * A one-off dialog — a confirm, a name prompt, a small picker — with the chrome guaranteed.
 *
 * Not a `new Modal(app)` plus a call to add the chrome: that pairing is the very pattern the base class
 * exists to escape, correct only while everyone remembers the second line. Here
 * there is no dialog to have without it, because the only way to reach the body is the callback that runs
 * after the chrome is in place.
 *
 * `close` is passed in rather than reached for, so a button handler never has to capture the dialog itself;
 * `onClose` fires on dismissal however it happened, which is what the promise-wrapped prompts resolve from.
 * `modalEl` is there for the one thing a body cannot do for itself — `pinModalAboveKeyboard`, which needs
 * the dialog element rather than its content.
 */
export function openOrbisDialog(
  app: App,
  opts: {
    title: string;
    icon?: string;
    compact?: boolean;
    unprompted?: boolean;
    dismissOnOutsideClick?: boolean;
    onClose?: () => void;
  },
  build: (body: HTMLElement, close: () => void, modalEl: HTMLElement, footer: () => HTMLElement) => void
): void {
  // **One at a time, for a dialog nobody asked for.** An unprompted dialog can be raised again before the first is
  // answered — a plugin reload during development, a second sync event, a load that runs while the last one is
  // still on screen — and four copies of the same question stacked on top of each other is four dismissals for one
  // decision. Checked in the DOM because a reload re-evaluates this module: the flag would be gone, the dialog
  // would not.
  //
  // Declining still calls `onClose`, so a promise-wrapped prompt resolves — dismissing and never being opened mean
  // the same thing to the caller, which is "no answer given".
  if (opts.unprompted && activeDocument.querySelector(`[data-orbis-dialog="${CSS.escape(opts.title)}"]`)) {
    opts.onClose?.();
    return;
  }
  new InlineOrbisModal(app, opts, build).open();
}

class InlineOrbisModal extends OrbisModal {
  constructor(
    app: App,
    private readonly opts: {
      title: string;
      icon?: string;
      compact?: boolean;
      unprompted?: boolean;
      dismissOnOutsideClick?: boolean;
      onClose?: () => void;
    },
    private readonly build: (
      body: HTMLElement,
      close: () => void,
      modalEl: HTMLElement,
      footer: () => HTMLElement
    ) => void
  ) {
    // Every chrome option `opts` carries is forwarded, not a chosen few: one dropped here is silently lost for
    // every dialog that asks for it.
    super(app, {
      icon: opts.icon,
      compact: opts.compact,
      unprompted: opts.unprompted,
      dismissOnOutsideClick: opts.dismissOnOutsideClick,
    });
  }

  protected dialogTitle(): string {
    return this.opts.title;
  }

  protected renderDialog(): void {
    /**
     * **The footer is offered, not assumed.** A dialog's buttons belong in it — that is where the padding, the
     * separator and the phone's safe-area inset live, and a row left at the end of the CONTENT gets none of them —
     * it sits flush against the bottom of an Android screen. It is created on first call, so a dialog with no
     * actions grows no empty band.
     */
    this.build(
      this.contentEl,
      () => this.close(),
      this.modalEl,
      () => this.footer()
    );
  }

  protected onDialogClose(): void {
    this.opts.onClose?.();
  }
}

/**
 * The parts of Obsidian's dialog chrome we replace, by the classes actually observed on a build:
 *
 *     div.modal-header-button mod-raised clickable-icon   ← the close ×
 *     div.modal-header                                    ← a header bar, empty for our dialogs
 *
 * `.modal-close-button` is the documented name and is here only for completeness — it matches nothing on
 * either platform, so a `display: none` rule on it alone is a no-op and leaves two ×s overlapping.
 */
const OBSIDIAN_CHROME = ['.modal-header', '.modal-header-button', '.modal-close-button'];

/**
 * Obsidian's own header chrome inside this dialog, or an empty list if we cannot identify it confidently.
 *
 * An empty list is a deliberate outcome, not a failure: the caller then leaves Obsidian's chrome alone and
 * skips adding ours. None of these class names is public API, and the documented one is already wrong here,
 * so this WILL eventually stop matching. What matters is which way it fails when it does — a dialog that
 * looks a little off, or one with no way to close it. Recognizing nothing has to mean "hands off".
 *
 * Known classes first. The fallback — the one icon-bearing child that is neither our heading nor the content
 * — covers a rename, but only when there is EXACTLY one candidate: two means Obsidian has grown chrome we
 * do not understand (a back chevron, a pin, a drag handle), and hiding a control we cannot name is the
 * failure this function exists to avoid. Scoped to the dialog, never its container, so the backdrop is not
 * a candidate at all.
 *
 * SYMPTOM IF THIS BREAKS: an Orbis dialog shows Obsidian's own × (a filled chip on mobile) instead of the
 * popups' flat one, and its heading sits below an empty bar. That means nothing matched — update the list
 * above from the live DOM rather than widening the fallback.
 */
function obsidianChrome(modalEl: HTMLElement, titleRowEl: HTMLElement): HTMLElement[] {
  const content = modalEl.querySelector('.modal-content');
  const ours = (el: Element): boolean => el === titleRowEl || el.contains(titleRowEl) || !!content?.contains(el);
  const known = OBSIDIAN_CHROME.flatMap((sel) =>
    Array.from(modalEl.querySelectorAll<HTMLElement>(sel)).filter((el) => !ours(el))
  );
  if (known.length) return [...new Set(known)];
  const candidates = Array.from(modalEl.children).filter(
    (el): el is HTMLElement =>
      el.instanceOf(HTMLElement) && !ours(el) && (el.tagName === 'BUTTON' || el.querySelector('svg') !== null)
  );
  return candidates.length === 1 ? candidates : [];
}

/**
 * Replace Obsidian's dialog chrome with the popups', so a Modal and a popup read as the same dialog.
 *
 * Hiding is by element REFERENCE, which is what makes a duplicate impossible: we hide the exact elements we
 * found rather than whatever a selector happens to match later. And our × goes in only if we hid theirs —
 * otherwise the dialog would end up with two, or with ours floating over their header bar.
 */
function replaceModalChrome(modalEl: HTMLElement, titleRowEl: HTMLElement, close: () => void): void {
  const chrome = obsidianChrome(modalEl, titleRowEl);
  if (!chrome.length) return;
  for (const el of chrome) setImportantStyle(el, 'display', 'none');

  // `type="button"` because a close button is not a submit button — an untyped `<button>` is one by default, which
  // would matter the day a dialog of ours holds a form.
  const closeX = createEl('button', { cls: 'orbis-popup-close-btn', attr: { type: 'button' } });
  setIcon(closeX, 'x');
  closeX.setAttribute('aria-label', t('action.close'));
  closeX.addEventListener('click', close);
  /**
   * **Appended, so it is LAST in the tab order** — though it is drawn top-right, over the heading.
   *
   * It is `position: absolute`, so its place in the DOM costs its appearance nothing. Inserted before the heading it
   * would be the first thing Tab reaches in every dialog: "Close" is not what a reader wants offered on arrival, it is
   * the last resort, and Escape already covers it. A frame's wait because the body and the footer are built after
   * this.
   */
  window.setTimeout(() => {
    if (modalEl.isConnected) modalEl.appendChild(closeX);
  }, 0);
  modalEl.insertBefore(closeX, titleRowEl);
}
