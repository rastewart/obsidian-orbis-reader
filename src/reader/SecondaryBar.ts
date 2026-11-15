import { Platform } from 'obsidian';
import type { ReaderContext } from './ReaderContext';
import { setReaderTopSpace } from './top-space';

/** Anything the registry can close: the snapped secondary bars (and later, menus). */
export interface ClosableBar {
  isOpen(): boolean;
  close(): void;
}

/**
 * Keeps at most one secondary surface open at a time, from one registry rather than per-bar close-wiring, which would
 * grow O(n²) as bars are added. Anything with `isOpen()`/`close()` can register — SecondaryBar instances do so
 * automatically; other surfaces (search, audio, later the display menu) register a small adapter.
 */
export class SecondaryBarRegistry {
  private readonly bars = new Set<ClosableBar>();

  /**
   * Run after any registered surface opens or closes — see `anyOpen`, and `changed`.
   *
   * One consumer today: the floating history back/forward pair, which cannot share the top of the
   * reader with a bar and so hides while one is open.
   */
  onChanged: (() => void) | null = null;

  register(bar: ClosableBar): void {
    this.bars.add(bar);
  }

  unregister(bar: ClosableBar): void {
    this.bars.delete(bar);
  }

  /** Close every registered surface except `keep`. */
  closeOthers(keep: ClosableBar): void {
    for (const bar of this.bars) {
      if (bar !== keep && bar.isOpen()) bar.close();
    }
  }

  /**
   * Whether any registered surface is on screen.
   *
   * **Derived on every ask, never tracked.** The state it reports already exists — each surface's own `isOpen()` reads
   * its element or its engine — so a second copy could only be wrong: a host class toggled along each surface's
   * open/close paths stays set on any path that forgets to clear it, and the history buttons stay invisible for the
   * rest of the session. Asking instead of remembering makes that failure impossible — a missed `changed()` costs one
   * late update, not a wrong answer, because the next transition anywhere re-derives it.
   */
  anyOpen(): boolean {
    for (const bar of this.bars) if (bar.isOpen()) return true;
    return false;
  }

  /** Announce that a surface opened or closed, so `onChanged` can re-read `anyOpen`. */
  changed(): void {
    this.onChanged?.();
  }
}

export interface SecondaryBarOptions {
  /** Bar-specific content class, e.g. 'orbis-goto-bar' (added alongside the base). */
  cls: string;
  /** Reserve top space in the reader (focus mode) so the bar doesn't cover text. */
  reserveFocusSpace?: boolean;
  /** Run after the bar is shown. */
  onOpen?: () => void;
  /** Run after the bar is hidden (clear inputs, reset state). */
  onClose?: () => void;
}

/**
 * Shared shell for the snapped "secondary bars" (search, Go To, audio) that live in
 * the overlay slot below the toolbar. Owns the cross-cutting concerns — build/show/
 * hide, mobile keyboard-lock wiring, focus-mode top-space reservation, and mutual
 * exclusion via {@link SecondaryBarRegistry} — while bar-specific content and
 * behavior stay with the owner. See docs/design/toolbar-and-panels.md.
 */
export class SecondaryBar implements ClosableBar {
  private el: HTMLElement | null = null;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly registry: SecondaryBarRegistry,
    private readonly opts: SecondaryBarOptions
  ) {
    registry.register(this);
  }

  /** Build the (hidden) bar shell into `container` and return it for content. */
  build(container: HTMLElement): HTMLElement {
    const el = container.createDiv({ cls: `orbis-secondary-bar ${this.opts.cls}` });
    el.hide();
    this.el = el;
    return el;
  }

  get element(): HTMLElement | null {
    return this.el;
  }

  isOpen(): boolean {
    return !!this.el?.isShown();
  }

  /** Wire an input for mobile keyboard-lock (stops the reader going black on focus). */
  registerInput(input: HTMLInputElement): void {
    input.addEventListener('focus', () => {
      if (Platform.isMobile) this.ctx.lockMobileHeights();
    });
    input.addEventListener('blur', () => {
      if (Platform.isMobile) window.setTimeout(() => this.ctx.unlockMobileHeights(), 100);
    });
  }

  open(): void {
    if (!this.el) return;
    this.registry.closeOthers(this);
    this.el.show();
    // Authoritative: reserve if this bar reserves (in focus mode), otherwise clear —
    // so a non-reserving bar (e.g. Go To) never inherits a stale reservation left by
    // a previously-open reserving bar (search).
    this.setReaderTopSpace(this.opts.reserveFocusSpace === true && this.ctx.focusMode);
    this.opts.onOpen?.();
    this.registry.changed();
  }

  close(): void {
    if (!this.el) return;
    this.el.hide();
    this.setReaderTopSpace(false);
    this.opts.onClose?.();
    this.registry.changed();
  }

  /** Focus mode toggled: reserve/release the top space while this bar is open. */
  onFocusModeToggled(active: boolean): void {
    if (this.isOpen()) this.setReaderTopSpace(this.opts.reserveFocusSpace === true && active);
  }

  private setReaderTopSpace(reserved: boolean): void {
    setReaderTopSpace(this.ctx.foliateView?.renderer, this.el, reserved);
  }

  dispose(): void {
    this.registry.unregister(this);
    this.el = null;
  }
}
