import { Platform } from 'obsidian';
import type { ReaderContext } from './ReaderContext';
import { type HeldPosition, SelectionHold } from './selection-hold';

// The foliate-paginator instance currently in use, captured via patched methods /
// the containerPosition getter. Module-level because installSelectionLock patches the
// GLOBAL custom-element prototype (there is only ever one live paginator), and the
// snapback listeners read it back.
let _livePaginator: Record<string, unknown> | null = null;

/**
 * Pressed alone, these are not an event anyone bound.
 *
 * `Dead` is deliberately NOT here. On macOS several Option chords produce a dead key — Option+N, Option+E,
 * Option+I, Option+U — so `e.key` is the string "Dead" and nothing else. Skipping those would make a hotkey bound
 * to one of them work everywhere except inside the book, which is the one place this code exists to serve. The
 * matcher reads `e.code` for exactly this reason, and a dead key still carries it.
 */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/**
 * The keys that turn a page, and which way.
 *
 * Up and down are left out on purpose: in a scrolled book they scroll, which is what a reader wants from them, and
 * taking that over to turn a page would be worse than doing nothing. They still END a selection, though — every
 * arrow does — which `turnPageFor` handles before consulting this.
 */
const PAGE_KEYS: Readonly<Record<string, 1 | -1 | undefined>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  PageDown: 1,
  PageUp: -1,
  ' ': 1,
};

/**
 * The unmodified keys worth taking notice of inside a book.
 *
 * Everything a reader reaches for to move around a page, and nothing that is also a letter: handing `a` and `1` to
 * the hotkey matcher from inside a book is how you make a reader fire commands by leaning on the keyboard.
 */
const READING_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Escape',
  'Enter',
  'Tab',
]);

/**
 * Low-level DOM / paginator patches the reader needs — mostly mobile, a couple
 * cross-platform:
 *  - selection lock: block page-turn/snap while a Range selection is active (patches
 *    the global foliate-paginator prototype once);
 *  - focusin suppressor: stop Foliate's focusin→scrollToAnchor during programmatic
 *    navigation (cross-platform; gated on NavSuppressor);
 *  - mobile selection snapback: pin the scroll position while iOS follows selection
 *    handles, plus leading-quote auto-expansion;
 *  - mobile height lock: freeze reader heights around the on-screen keyboard.
 *
 * Reads only `ReaderContext` (contentEl / hostEl / navSuppressor / debug) — no host
 * interface. `lockHeights`/`unlockHeights` back the view's `ReaderContext` members of
 * the same name (the view delegates). See docs/design/reader-architecture.md.
 */
export class ReaderDom {
  private lockedHeights = { contentH: '', contentMinH: '', contentMaxH: '', hostH: '', hostMinH: '', hostMaxH: '' };
  // Reference count so nested popups sharing this view as their host (e.g. the
  // "replace existing notes?" confirm dialog opened from inside Generate
  // Notes' own popup) don't stomp on each other: only the first lock actually
  // captures/pins heights, and only the last matching unlock actually
  // restores them. Without this, the nested popup's lock would overwrite
  // lockedHeights with the already-locked (pinned) value instead of the true
  // original, leaving the outer popup's contentEl permanently pinned to a
  // fixed pixel height instead of returning to auto-sizing once it closes.
  private mobileHeightsLockCount = 0;

  // Focus-mode selection-compensation state. See startFocusSelectionCompensation.
  private focusCompRafId: number | null = null;
  private focusCompBaseTop = 0;
  private focusCompOffset = 0;

  constructor(private readonly ctx: ReaderContext) {}

  /** Install per-section-document patches (focusin suppression + mobile snapback + key forwarding). */
  installForDoc(doc: Document): void {
    this.installFocusinSuppressor(doc);
    this.installMobileSelectionSnapback(doc);
    this.installKeyForwarder(doc);
  }

  /**
   * Turn the page if this keystroke is one of the reading keys — or let go of the selection, if there is one.
   *
   * Someone who presses the right arrow in a book expects the page to turn, and has no way to discover that it
   * wants configuring first. This claims no chord and only ever applies while the reader is focused, so it cannot
   * shadow a binding anywhere else in Obsidian — and the setting exists for anyone who has bound these keys to
   * something they would rather keep.
   *
   * Shared by both surfaces: the book's own document, and the host around it. **Which one has focus depends on
   * whether the reader has clicked into the text yet**, and a freshly opened book must not need a click first.
   */
  turnPageFor(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    // The setting is about turning pages, not about letting go: an arrow still ends a selection either way.
    if (!this.ctx.keyboardPageTurn && !e.key.startsWith('Arrow')) return false;
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? '')) return false;
    const direction = PAGE_KEYS[e.key];
    // Up and down are not page keys — in a scrolled book they scroll — but they are still arrows, and an arrow
    // without Shift ends a selection whichever way it points.
    if (!direction && !e.key.startsWith('Arrow')) return false;
    /**
     * **The first press cancels; the second turns the page.**
     *
     * What every text editor does: with something selected, an arrow without Shift puts the caret at the end of
     * the selection rather than one character past it — the press is spent on letting go. Doing both at once is
     * wrong for the same reason it is wrong there: paging away is a move you have to be able to make
     * deliberately, and a selection you are still looking at should not vanish and take the page with it.
     *
     * The press is not a dead one: the highlight disappearing and the annotation bar closing is the answer.
     */
    if (this.ctx.clearSelection()) {
      e.preventDefault();
      return true;
    }
    // With nothing selected, up and down go back to being nobody's business but the book's — and with the setting
    // off, so do the arrows that turn pages: they were let this far only to end a selection.
    if (!direction || !this.ctx.keyboardPageTurn) return false;
    e.preventDefault();
    /**
     * A focused link is left focused across the page turn, deliberately.
     *
     * Blurring it would seem tidier — it is about to be off screen — but native tabbing resumes from wherever
     * focus is, and from nowhere it resumes at the FIRST link in the chapter. Keeping it means Tab carries on
     * from where the reader was.
     */
    this.ctx.turnPage(direction);
    return true;
  }

  /**
   * Is this element — or range — on the page the reader is looking at?
   *
   * **Not a test against the iframe's own viewport**, which is always true. Foliate
   * lays the section out in CSS columns and then **expands the iframe to the full width of all of them**,
   * scrolling a container that sits outside it (`paginator.js`, `#iframe.style[side] = expandedSize`). So inside
   * the book every column is within the iframe's viewport, and asking whether a link is in it counts the whole
   * chapter as visible.
   *
   * The frame's own rect is what carries the scroll: it slides negative as the container scrolls, so adding it to
   * the element's position gives a coordinate in the outer document that can be compared with the reading area.
   *
   * When the frame cannot be reached, it says yes: seeding to a link that turns out to be off-page is a smaller
   * failure than refusing to seed at all.
   */
  onScreen(el: { getBoundingClientRect(): DOMRect }, doc: Document): boolean {
    const r = el.getBoundingClientRect();
    // **Either dimension, not both.** A caret is a collapsed range: zero wide, a line high, and a perfectly real
    // place in the text — requiring both dimensions would make "select the sentence I just clicked in" ignore the
    // click. A zero-by-zero rect is still markup nobody can aim at.
    if (r.width <= 0 && r.height <= 0) return false;
    const frame = doc.defaultView?.frameElement as HTMLElement | null;
    const host = this.ctx.hostEl;
    if (!frame || !host) {
      // Saying yes here can report a sentence two pages away as visible. Logged rather
      // than left silent: if this fires, the geometry below never ran and the answer means nothing.
      this.ctx.debug(`onScreen: no ${frame ? 'host' : 'frame'} — cannot tell`, 'nav');
      return true;
    }
    const f = frame.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    const left = f.left + r.left;
    const top = f.top + r.top;
    return left + r.width > h.left && left < h.right && top + r.height > h.top && top < h.bottom;
  }

  /**
   * Start tabbing from the page in front of you.
   *
   * Native Tab resumes from wherever focus happens to be, and from nowhere it starts at the top of the document —
   * so a reader forty pages into a chapter presses Tab and is thrown back to the chapter's first link. The same
   * thing happens once focus has survived a few page turns: it is still on a link, just one several pages behind.
   *
   * So whenever the focused element is not on screen, the first press **seeds** from what is visible — the first
   * link on the page, or the last one when tabbing backwards. After that it does nothing, and Tab steps natively
   * through the section, which is the roaming behavior that reads better than locking to a page.
   *
   * Returns whether it seeded; `false` leaves Tab entirely alone, including on a page with no links, where it
   * should take the reader out of the book as native Tab does.
   */
  seedLink(doc: Document | undefined, backwards: boolean): boolean {
    if (!doc?.defaultView) return false;
    const active = doc.activeElement;
    // Already somewhere the reader can see: let native tabbing carry on from there.
    if (active && active !== doc.body && this.onScreen(active, doc)) return false;
    const onPage = Array.from(doc.querySelectorAll<HTMLElement>('a[href]')).filter((el) => this.onScreen(el, doc));
    const target = backwards ? onPage.at(-1) : onPage[0];
    if (!target) return false;
    target.focus();
    this.ctx.debug(`tab seeded to ${backwards ? 'last' : 'first'} of ${onPage.length} link(s) on this page`, 'nav');
    return true;
  }

  /**
   * Shift+arrow refines the selection, if there is one to refine.
   *
   * Shared by both surfaces for the same reason the page keys are: focus is in the book once it has been clicked
   * and on the host before that. Bare Shift only — `Mod+Shift+Arrow` stays the reader's to bind, and is.
   */
  extendSelectionFor(e: KeyboardEvent): boolean {
    // Arrows only, and Shift pressed on its own is not a request for anything.
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !e.key.startsWith('Arrow')) return false;
    if (!this.ctx.extendSelection(e.key)) return false;
    e.preventDefault();
    return true;
  }

  /**
   * Let the book's keystrokes do what the reader bound them to.
   *
   * **The book is an iframe, and a keystroke inside one never reaches the document Obsidian listens on.** So the
   * moment you click into the text you are reading — exactly when you want to turn a page — every hotkey would stop
   * working: this plugin's, Obsidian's, all of them. Nothing is wrong with the commands; the events never arrive.
   *
   * Re-dispatching a copy of the event out there does not work: **Obsidian ignores a synthetic keyboard event.** A
   * check with focus on the host passes anyway, because there the event is native. So the bindings are read and the
   * command is called directly — see `hotkey-match.ts`. The re-dispatch is kept after it as a last resort for
   * anything else out there that listens.
   *
   * **Nothing is hardcoded**: no combination is claimed and no default binding shipped. A key bound to nothing
   * does what it would do without this.
   *
   * Three things it deliberately leaves alone: bare letters, anything typed into a form inside the EPUB, and a
   * modifier pressed on its own.
   */
  private installKeyForwarder(doc: Document): void {
    const docEx = doc as unknown as Record<string, unknown>;
    if (docEx['__orbisKeyForwarderInstalled']) return;
    docEx['__orbisKeyForwarderInstalled'] = true;

    doc.addEventListener('keydown', (e: KeyboardEvent) => {
      // A dead key IS composing on macOS, so composition alone cannot disqualify a chord — only a bare one.
      if (MODIFIER_KEYS.has(e.key)) return;
      if (e.isComposing && !(e.ctrlKey || e.metaKey || e.altKey)) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? '')) return;
      const modified = e.ctrlKey || e.metaKey || e.altKey;
      // A plain letter inside a book is someone resting a hand on the keyboard, not a command.
      if (!modified && !READING_KEYS.has(e.key)) return;
      this.ctx.debug(`key ${e.key} (${e.code})${modified ? ' modified' : ''} in book`, 'nav');

      if (this.turnPageFor(e)) return;
      if (this.extendSelectionFor(e)) return;
      if (e.key === 'Tab' && this.seedLink(doc, e.shiftKey)) {
        e.preventDefault();
        return;
      }

      // Ask Obsidian to run the command the reader bound to this, if any.
      if (this.ctx.runBoundCommand(e)) {
        e.preventDefault();
        return;
      }

      const outer = this.ctx.contentEl.ownerDocument;
      const copy = new KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        repeat: e.repeat,
        bubbles: true,
        cancelable: true,
      });
      const handled = !outer.dispatchEvent(copy) || copy.defaultPrevented;
      const active = doc.activeElement;
      const on = active ? `${active.tagName.toLowerCase()}${this.onScreen(active, doc) ? '' : ' off-screen'}` : 'none';
      this.ctx.debug(`key ${e.key}${modified ? ' (modified)' : ''} forwarded, handled:${handled}, focus:${on}`, 'nav');
      // Only when something out there acted on it: otherwise a plain arrow would stop scrolling a scrolled book,
      // which is the one thing arrows already do.
      if (handled) e.preventDefault();
    });
  }

  installSelectionLock(): void {
    const PaginatorClass = customElements.get('foliate-paginator');
    if (!PaginatorClass) return;
    const proto = PaginatorClass.prototype as Record<string, unknown>;
    if (proto['__orbisSelectionLockInstalled']) return;
    proto['__orbisSelectionLockInstalled'] = true;

    const origNext = proto['next'] as (distance?: number) => Promise<void>;
    const origPrev = proto['prev'] as (distance?: number) => Promise<void>;
    const origSnap = proto['snap'] as (vx: number, vy: number) => void;
    const getContents = proto['getContents'] as () => Array<{ doc: Document }>;

    const hasRangeSelection = (p: Record<string, unknown>): boolean => {
      const doc = (getContents.call(p) as Array<{ doc: Document }>)[0]?.doc;
      return doc?.getSelection()?.type === 'Range';
    };

    /* eslint-disable @typescript-eslint/no-this-alias -- patched paginator methods must capture the live `this` into the module-level _livePaginator so snapback/lock code can read the active instance */
    proto['next'] = function (this: Record<string, unknown>, distance?: number): Promise<void> {
      _livePaginator = this;
      if (hasRangeSelection(this)) return Promise.resolve();
      return origNext.call(this, distance);
    };
    proto['prev'] = function (this: Record<string, unknown>, distance?: number): Promise<void> {
      _livePaginator = this;
      if (hasRangeSelection(this)) return Promise.resolve();
      return origPrev.call(this, distance);
    };
    proto['snap'] = function (this: Record<string, unknown>, vx: number, vy: number): void {
      _livePaginator = this;
      if (hasRangeSelection(this)) return;
      origSnap.call(this, vx, vy);
    };
    /* eslint-enable @typescript-eslint/no-this-alias -- re-enable after the paginator method patches */

    // Also capture via the containerPosition getter: #onScrollEnd reads it during
    // view.init(), so _livePaginator is populated before any user interaction.
    const posDesc = Object.getOwnPropertyDescriptor(proto, 'containerPosition');
    if (posDesc?.get) {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- capturing the descriptor getter to re-invoke it via .call(this) inside the wrapper
      const origGet = posDesc.get;
      Object.defineProperty(proto, 'containerPosition', {
        ...posDesc,
        get(this: Record<string, unknown>) {
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- capture the live paginator instance from the getter into the module-level _livePaginator
          _livePaginator = this;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- origGet returns the untyped foliate containerPosition value
          return origGet.call(this);
        },
      });
    }
  }

  // Installs a capture-phase focusin listener on the section document that blocks Foliate's
  // focusin→#scrollToAnchor(e.target) rAF whenever a suppressor flag is active. Capture fires
  // before Foliate's bubbling handler; stopImmediatePropagation() prevents the rAF entirely.
  // Installed for all platforms on every section load (search suppression is cross-platform;
  // mobile annotation suppression is also handled here to share a single listener).
  private installFocusinSuppressor(doc: Document): void {
    const docEx = doc as unknown as Record<string, unknown>;
    if (docEx['__orbisFocusinSuppressorInstalled']) return;
    docEx['__orbisFocusinSuppressorInstalled'] = true;

    doc.addEventListener(
      'focusin',
      (e: FocusEvent) => {
        if (this.ctx.navSuppressor.isSuppressing) {
          e.stopImmediatePropagation();
          this.ctx.debug(`focusin BLOCKED target:${(e.target as Element)?.tagName ?? '?'}`, 'annot-nav');
        } else {
          this.ctx.debug(`focusin NOT-BLOCKED target:${(e.target as Element)?.tagName ?? '?'}`, 'annot-nav');
        }
      },
      { capture: true }
    );
  }

  // On mobile, iOS natively scrolls the paginator's scroll container to follow selection
  // handles, leaving the view stuck between pages after the selection is cleared. This
  // method saves containerPosition when a Range selection starts and holds the view there
  // every frame while the selection lasts, so it never leaves the original page. The page
  // width is saved with it, so a rotation moves the hold rather than fighting the new
  // layout — see `SelectionHold`.
  private installMobileSelectionSnapback(doc: Document): void {
    if (!Platform.isMobile) return;
    // Guard against multiple installations on the same doc (font-size slider fires
    // reinjectAllDocs on every input event, which re-fires 'load' and calls this
    // method repeatedly; accumulated rAF loops cause a hang on mobile).
    const docEx = doc as unknown as Record<string, unknown>;
    if (docEx['__orbisSnapbackInstalled']) return;
    docEx['__orbisSnapbackInstalled'] = true;

    const hold = new SelectionHold();
    let wasRange = false;
    let lockRafId: number | null = null;
    let quoteTimerId: ReturnType<typeof setTimeout> | null = null;

    const OPENING_QUOTES = new Set(['“', '”', '‘', '’', '«', '»', '„', '‹', '"']);

    const where = (p: Record<string, unknown> | null): HeldPosition => ({
      pos: (p?.['containerPosition'] as number) ?? 0,
      size: (p?.['size'] as number) ?? 0,
    });

    /**
     * After a width change, put the page holding the selection on screen — its first line, for a selection longer
     * than a page. Left alone, foliate keeps the start of the page that was showing, and a selection lower on that
     * page ends up on the next one, out of sight of the marks bar acting on it.
     *
     * The WHOLE range and `select: true`, which foliate answers by setting the selection to the anchor uncollapsed —
     * the same range, so the selection survives. The navigation form collapses the selection to its start.
     */
    const showSelection = (p: Record<string, unknown>): void => {
      const sel = doc.getSelection();
      const scrollToAnchor = p['scrollToAnchor'];
      if (!sel?.rangeCount || typeof scrollToAnchor !== 'function') return;
      void (scrollToAnchor as (anchor: Range, select: boolean) => Promise<void>).call(
        p,
        sel.getRangeAt(0).cloneRange(),
        true
      );
      this.ctx.debug('selection hold: page width changed — showing the selection', 'select');
    };

    const lockPosition = (): void => {
      if (doc.getSelection()?.type === 'Range') {
        const p = _livePaginator;
        if (p) {
          const step = hold.frame(where(p));
          if (step.kind === 'hold') p['containerPosition'] = step.pos;
          else if (step.kind === 'relayout') showSelection(p);
          else if (step.kind === 'moved') {
            this.ctx.debug(
              `selection hold: page width ${step.from.size}→${step.to.size}, ` +
                `position ${step.from.pos}→${step.to.pos} after ${step.frames} frame(s)`,
              'select'
            );
          }
        }
        lockRafId = window.requestAnimationFrame(lockPosition);
      } else {
        lockRafId = null;
        hold.release();
      }
    };

    const cancelQuoteTimer = (): void => {
      if (quoteTimerId !== null) {
        window.clearTimeout(quoteTimerId);
        quoteTimerId = null;
      }
    };

    doc.addEventListener(
      'touchstart',
      () => {
        if (doc.getSelection()?.type !== 'Range') hold.save(where(_livePaginator));
      },
      { passive: true }
    );

    doc.addEventListener('selectionchange', () => {
      const isRange = doc.getSelection()?.type === 'Range';
      if (!wasRange && isRange) {
        this.startFocusSelectionCompensation(doc); // counteract the WebView viewport pan
        if (lockRafId === null) lockRafId = window.requestAnimationFrame(lockPosition);
        // Detect a leading quotation mark skipped by the long-press and expand
        // the selection to include it after a short delay. 50ms gives the OS one
        // task-queue tick to stabilize the selection, which is enough for the
        // picker to receive the correct text while the finger is still down.
        // Handles may not be visible until the user taps; that is acceptable
        // since the picker and highlight both work correctly without them.
        //   Case A: quote is in the same text node before the selection start.
        //     trimEnd() handles book HTML whitespace/newlines before the quote.
        //   Case B: quote is in a previous sibling (e.g. <span>...</span> sibling).
        //     Walk backward past whitespace-only text nodes to find it.
        const sel = doc.getSelection();
        const range = sel?.getRangeAt(0);
        if (range && sel && range.startContainer.nodeType === Node.TEXT_NODE) {
          let anchorNode: Node | null = null;
          let anchorOffset = 0;
          const text = range.startContainer.textContent ?? '';
          const beforeText = text.substring(0, range.startOffset);
          const trimmedBefore = beforeText.trimEnd();
          const lastChar = trimmedBefore.length > 0 ? trimmedBefore[trimmedBefore.length - 1] : '';
          const hasQuote = OPENING_QUOTES.has(lastChar);
          this.ctx.debug(
            `quote-detect: off=${range.startOffset} trimLen=${trimmedBefore.length} ` +
              `last=U+${lastChar.codePointAt(0)?.toString(16).toUpperCase() ?? 'none'} ` +
              `hasQuote=${hasQuote}`,
            'select'
          );
          if (hasQuote) {
            anchorNode = range.startContainer;
            anchorOffset = beforeText.lastIndexOf(lastChar);
          } else if (trimmedBefore.length === 0) {
            let prev: Node | null = range.startContainer.previousSibling;
            while (prev && prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? '').trim() === '') {
              prev = prev.previousSibling;
            }
            if (prev) {
              const prevText = prev.textContent ?? '';
              const trimmedPrev = prevText.trimEnd();
              const prevLast = trimmedPrev.length > 0 ? trimmedPrev[trimmedPrev.length - 1] : '';
              if (OPENING_QUOTES.has(prevLast)) {
                anchorNode = prev;
                anchorOffset = prevText.lastIndexOf(prevLast);
              }
            }
          }
          this.ctx.debug(`quote-detect: anchorSet=${anchorNode !== null} anchorOff=${anchorOffset}`, 'select');
          if (anchorNode) {
            const node = anchorNode;
            const offset = anchorOffset;
            cancelQuoteTimer();
            quoteTimerId = window.setTimeout(() => {
              quoteTimerId = null;
              const s = doc.getSelection();
              this.ctx.debug(`quote-expand: type=${s?.type} setBAE(off=${offset})`, 'select');
              if (s?.type === 'Range') s.setBaseAndExtent(node, offset, s.focusNode!, s.focusOffset);
            }, 50);
          }
        }
      } else if (wasRange && isRange) {
        // Selection changed (handle drag) -- cancel pending expansion.
        cancelQuoteTimer();
      } else if (wasRange && !isRange) {
        if (lockRafId !== null) {
          window.cancelAnimationFrame(lockRafId);
          lockRafId = null;
        }
        cancelQuoteTimer();
      }
      wasRange = isRange;
    });
  }

  /**
   * Focus-mode selection compensation. On Android, selecting text inside focus
   * mode's `position: fixed` reader makes the WebView pan its whole viewport to chase the
   * selection, displacing every fixed layer uniformly. The pan is invisible to
   * scrollTop / scrollY / visualViewport and can't be reversed with scrollTo — only
   * `getBoundingClientRect` sees it. So we measure the host's on-screen drift and counter
   * it with a `translateY` on the host + focus overlay, driving the host's top back to
   * where it belongs.
   *
   * It's a feedback loop that accumulates the residual error each frame, so it tracks the
   * pan as it grows and unwinds itself when the pan resets (e.g. on a page turn) or focus
   * mode exits. Runs only while a selection is active or a compensation is still applied.
   * No-op off mobile / outside focus mode.
   */
  private startFocusSelectionCompensation(doc: Document): void {
    if (!Platform.isMobile || !this.ctx.focusMode || !this.ctx.hostEl) return;
    if (this.focusCompRafId !== null) return; // already running (e.g. a persistent pan)
    // Base = the host's correct on-screen top, measured now — selection has just started,
    // before the pan — with no compensation applied.
    this.focusCompOffset = 0;
    this.applyFocusCompensation(0);
    this.focusCompBaseTop = this.ctx.hostEl.getBoundingClientRect().top;
    const tick = (): void => {
      const host = this.ctx.hostEl;
      if (!this.ctx.focusMode || !host) {
        this.resetFocusCompensation();
        return;
      }
      const error = this.focusCompBaseTop - host.getBoundingClientRect().top;
      if (Math.abs(error) > 0.5) {
        this.focusCompOffset += error;
        this.applyFocusCompensation(this.focusCompOffset);
      }
      const selectionActive = doc.getSelection()?.type === 'Range';
      if (selectionActive || Math.abs(this.focusCompOffset) > 0.5) {
        this.focusCompRafId = window.requestAnimationFrame(tick);
      } else {
        this.focusCompRafId = null; // settled and no selection → stop
      }
    };
    this.focusCompRafId = window.requestAnimationFrame(tick);
  }

  private applyFocusCompensation(offsetPx: number): void {
    const t = offsetPx === 0 ? '' : `translateY(${offsetPx}px)`;

    if (this.ctx.hostEl) this.ctx.hostEl.style.transform = t;
    const overlay = this.ctx.contentEl.querySelector<HTMLElement>('.orbis-focus-overlay');

    if (overlay) overlay.style.transform = t;
  }

  /** Stop the compensation loop and clear any applied transform (focus exit / teardown). */
  private resetFocusCompensation(): void {
    if (this.focusCompRafId !== null) {
      window.cancelAnimationFrame(this.focusCompRafId);
      this.focusCompRafId = null;
    }
    this.focusCompOffset = 0;
    this.applyFocusCompensation(0);
  }

  // ── Mobile height lock (backs ReaderContext.lockMobileHeights / unlockMobileHeights) ──

  lockHeights(retriesLeft = 10): void {
    if (!Platform.isMobile) return;
    if (this.mobileHeightsLockCount > 0) {
      this.mobileHeightsLockCount++;
      return;
    }
    const contentEl = this.ctx.contentEl;
    const hostEl = this.ctx.hostEl;
    const rect = contentEl.getBoundingClientRect();
    const hostRect = hostEl?.getBoundingClientRect();
    // hostEl reading a zero height means Foliate's renderer hasn't finished its
    // first layout yet (e.g. a popup opened immediately after the book loads) —
    // contentEl's own rect can't be trusted as "settled" either in that case, so
    // retry next frame instead of locking to a too-small snapshot that leaves a
    // black gap below the reader pane for the rest of the popup's lifetime.
    if (hostEl && (!hostRect || hostRect.height === 0) && retriesLeft > 0) {
      contentEl.win.requestAnimationFrame(() => this.lockHeights(retriesLeft - 1));
      return;
    }
    this.mobileHeightsLockCount = 1;
    // Nothing in a pinned reader scrolls — see `.orbis-heights-locked`.
    contentEl.addClass('orbis-heights-locked');
    if (rect.height > 0) {
      this.lockedHeights.contentH = contentEl.style.height;
      this.lockedHeights.contentMinH = contentEl.style.minHeight;
      this.lockedHeights.contentMaxH = contentEl.style.maxHeight;
      contentEl.style.height = `${rect.height}px`;
      contentEl.style.minHeight = `${rect.height}px`;
      contentEl.style.maxHeight = `${rect.height}px`;
    }
    if (hostEl && hostRect && hostRect.height > 0) {
      this.lockedHeights.hostH = hostEl.style.height;
      this.lockedHeights.hostMinH = hostEl.style.minHeight;
      this.lockedHeights.hostMaxH = hostEl.style.maxHeight;
      hostEl.style.height = `${hostRect.height}px`;
      hostEl.style.minHeight = `${hostRect.height}px`;
      hostEl.style.maxHeight = `${hostRect.height}px`;
    }
    this.logWidths('locked');
    contentEl.win.setTimeout(() => this.logWidths('keyboard up'), 500);
  }

  /**
   * The widths around the reader, on the `display` pill — for the page that re-flows on Android while the keyboard
   * is up. Each container from the host outwards: its inner width, a scrollbar's width where one takes room
   * (`+bar`), and whether it can scroll; then the page width foliate lays text out to, and the window's.
   */
  private logWidths(when: string): void {
    const parts: string[] = [];
    let el: HTMLElement | null = this.ctx.hostEl;
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      const cs = getComputedStyle(el);
      const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      const bar = el.offsetWidth - el.clientWidth - border;
      const scrolls = el.scrollHeight > el.clientHeight + 1;
      const name = String(el.className).split(' ')[0] || el.tagName.toLowerCase();
      parts.push(
        `${name}:${el.clientWidth}${bar > 0 ? `+bar${bar}` : ''}${scrolls ? ` scrolls(${cs.overflowY})` : ''}`
      );
    }
    const page = (this.ctx.foliateView?.renderer as { size?: number } | undefined)?.size;
    const win = this.ctx.contentEl.win;
    const vv = win.visualViewport;
    this.ctx.debug(
      `keyboard widths ${when} — page ${page?.toFixed(0) ?? '?'} · ${parts.join(' › ')} · window ${win.innerWidth}×${win.innerHeight}${vv ? ` visual ${Math.round(vv.width)}×${Math.round(vv.height)}` : ''}`,
      'display'
    );
  }

  /**
   * Drop the height lock outright — count, inline styles and remembered values.
   *
   * **For focus mode, which owns the layout while it is active and cannot share it.** The ordinary
   * lock/unlock pair is balanced and refcounted, and that is the problem here: a blur schedules its unlock 100ms
   * later, so focus mode clearing the inline heights on the way in has them restored underneath it a moment
   * after. Entering focus mode from the search field on Android would leave `contentEl` pinned at the
   * keyboard-shortened height, which the focus overlay then inherits for its own `inset: 0`, putting the progress
   * chip far above the bottom of the screen.
   *
   * Unbalanced on purpose: a pending `unlockHeights` finds a count of 0 and returns without restoring anything,
   * which is exactly what should happen to an unlock for a lock that no longer exists.
   */
  releaseHeightLock(): void {
    if (!Platform.isMobile) return;
    this.mobileHeightsLockCount = 0;
    const contentEl = this.ctx.contentEl;
    const hostEl = this.ctx.hostEl;
    contentEl.removeClass('orbis-heights-locked');
    for (const prop of ['height', 'min-height', 'max-height']) {
      contentEl.style.removeProperty(prop);
      hostEl?.style.removeProperty(prop);
    }
    this.lockedHeights = { contentH: '', contentMinH: '', contentMaxH: '', hostH: '', hostMinH: '', hostMaxH: '' };
  }

  unlockHeights(): void {
    if (!Platform.isMobile) return;
    if (this.mobileHeightsLockCount === 0) return;
    this.mobileHeightsLockCount--;
    if (this.mobileHeightsLockCount > 0) return;
    const contentEl = this.ctx.contentEl;
    const hostEl = this.ctx.hostEl;
    this.logWidths('before unlock');
    contentEl.win.setTimeout(() => this.logWidths('unlocked'), 500);
    contentEl.removeClass('orbis-heights-locked');
    contentEl.style.height = this.lockedHeights.contentH;
    contentEl.style.minHeight = this.lockedHeights.contentMinH;
    contentEl.style.maxHeight = this.lockedHeights.contentMaxH;
    if (hostEl) {
      hostEl.style.height = this.lockedHeights.hostH;
      hostEl.style.minHeight = this.lockedHeights.hostMinH;
      hostEl.style.maxHeight = this.lockedHeights.hostMaxH;
    }
  }
}
