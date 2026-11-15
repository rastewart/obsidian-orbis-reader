/**
 * Suppresses the Foliate paginator's focusin-driven navigation while we jump to a
 * target CFI programmatically, then lets the relocate handler verify/correct the
 * landing position. Shared by search-hit navigation, annotation-tap navigation,
 * and the relocate handler — a cross-cutting concern that belongs to none of them
 * individually, extracted so Search and Annotations can each depend on it through
 * `ReaderContext` rather than poking shared view fields.
 *
 * See `docs/design/reader-architecture.md`.
 */
export class NavSuppressor {
  private suppressing = false;
  private clearTimerId: ReturnType<typeof setTimeout> | null = null;
  private pendingTarget: { cfiRange: string } | null = null;
  private postNavPending = false;

  /** True while the iframe's focusin-driven navigation should be blocked. */
  get isSuppressing(): boolean {
    return this.suppressing;
  }

  /**
   * Suppress focusin nav and record `cfiRange` as the target to verify/correct
   * against on the next relocate. Used when navigating across sections.
   */
  beginTargetNav(cfiRange: string): void {
    this.clearTimer();
    this.suppressing = true;
    this.pendingTarget = { cfiRange };
  }

  /**
   * Suppress focusin nav, auto-clearing in a fresh macrotask. Used for
   * same-section jumps where the relocate handler runs no correction. The
   * `setTimeout(0)` outlives the render-phase rAF that focusin schedules.
   */
  suppressThenClearSoon(): void {
    this.clearTimer();
    this.suppressing = true;
    this.scheduleClearInternal();
  }

  /** Consume the pending correction target, if any (called by the relocate handler). */
  takePendingTarget(): { cfiRange: string } | null {
    const t = this.pendingTarget;
    this.pendingTarget = null;
    return t;
  }

  /** Mark that a one-page correction `next()` was issued; caught by the next relocate. */
  markPostNav(): void {
    this.postNavPending = true;
  }

  /** Consume the post-correction flag. */
  takePostNav(): boolean {
    const p = this.postNavPending;
    this.postNavPending = false;
    return p;
  }

  /**
   * Clear suppression in a fresh macrotask — after `focusView()`'s focusin
   * microtasks drain. `onCleared` runs once the flag is cleared (debug logging).
   */
  scheduleClear(onCleared?: () => void): void {
    this.clearTimer();
    this.scheduleClearInternal(onCleared);
  }

  /** Full reset of suppression + pending target (e.g. clearing a search). */
  reset(): void {
    this.clearTimer();
    this.suppressing = false;
    this.pendingTarget = null;
  }

  /** Release on book close. */
  dispose(): void {
    this.reset();
    this.postNavPending = false;
  }

  private scheduleClearInternal(onCleared?: () => void): void {
    this.clearTimerId = window.setTimeout(() => {
      this.suppressing = false;
      this.clearTimerId = null;
      onCleared?.();
    }, 0);
  }

  private clearTimer(): void {
    if (this.clearTimerId !== null) {
      window.clearTimeout(this.clearTimerId);
      this.clearTimerId = null;
    }
  }
}
