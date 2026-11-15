// Pocket mode: the full-screen player's on-screen controls, locked against stray touches, and the slide that
// unlocks them.
//
// Its own file because it is its own small machine — five pieces of state, one gesture, a document-wide touch guard
// — and the listening controller only ever asks it to lock, unlock, or say whether it is locked. Split out of
// `TtsController.ts`.

import { Platform } from 'obsidian';
import { t } from '../../i18n';
import { setSvgIcon } from '../../ui-utils';

// Open padlock — the button that locks, top right of the player (Lucide `lock-open`).
const LOCK_OPEN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';

// Padlock (closed) — the draggable handle on the unlock rail.
const LOCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

export class PocketLock {
  private locked = false;
  private player: HTMLElement | null = null;
  private railEl: HTMLElement | null = null;
  private handleEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  /** The document the touch guard went on, so it comes off the same one. */
  private guardedDoc: Document | null = null;

  constructor(
    /** Dark reader colors while locked — mostly black, for OLED. */
    private readonly setBlackout: (on: boolean) => void,
    /**
     * The slide reached the top. Asked of the view rather than done here, because unlocking also puts back what the
     * lock changed — Focus mode, and the text with the listening bar — and only the view knows what that was.
     */
    private readonly onSlidOpen: () => void
  ) {}

  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Pocket mode in one tap: an open padlock at the player's top right, mirroring the collapse chevron — on a phone or a
   * tablet, which is what a pocket is for; the command stays for a desktop. In Focus mode it sits below the ✕, since
   * the player starts under that row. `onLock` is the view's, which opens what locking needs (`PocketMode`).
   */
  buildButton(player: HTMLElement, onLock: () => void): void {
    if (!Platform.isMobile) return;
    const button = player.createEl('button', { cls: 'orbis-ctrl-btn orbis-tts-player-lock' });
    button.setAttribute('aria-label', t('tts.lock_the_controls'));
    setSvgIcon(button, LOCK_OPEN_SVG);
    button.addEventListener('click', onLock);
  }

  /** The directions shown above the cover while locked. Built where the player wants them, before the cover. */
  buildHint(player: HTMLElement): void {
    const hint = player.createDiv({ cls: 'orbis-tts-lock-hint' });
    hint.createDiv({ cls: 'orbis-tts-lock-hint-title', text: t('tts.controls_locked') });
    hint.createDiv({ cls: 'orbis-tts-lock-hint-sub', text: t('tts.drag_to_unlock') });
    hint.hide();
    this.hintEl = hint;
  }

  /** The unlock rail pinned to the player's right edge. While locked the player keeps showing
   *  read-only info (cover/title/author/live progress + times) with its controls hidden and the
   *  scrubber frozen (see the `.orbis-locked` CSS); this rail carries the lock the user slides up
   *  to unlock — a big, deliberate gesture errant taps and short swipes can't trigger. */
  buildRail(player: HTMLElement): void {
    this.player = player;
    const rail = player.createDiv({ cls: 'orbis-tts-lock-rail' });
    rail.hide();
    this.railEl = rail;
    // Swallow every stray pointer/click on the rail itself so nothing beneath reacts.
    for (const ev of ['click', 'pointerdown', 'touchstart'] as const) {
      rail.addEventListener(ev, (e) => {
        if (e.target === this.handleEl || this.handleEl?.contains(e.target as Node)) return;
        e.preventDefault();
        e.stopPropagation();
      });
    }
    const track = rail.createDiv({ cls: 'orbis-tts-lock-track' });
    const handle = track.createDiv({ cls: 'orbis-tts-lock-handle' });
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', t('tts.drag_to_unlock'));
    setSvgIcon(handle.createSpan(), LOCK_SVG);
    this.handleEl = handle;
    this.wireDrag(track, handle);
  }

  /** Slide the lock handle UP its track (it rests at the bottom); releasing past ~70% unlocks,
   *  otherwise it snaps back. Up rather than down so the gesture doesn't collide with Android's
   *  swipe-down (which opens Obsidian's command palette); the resting spot sits above Android's
   *  bottom home-gesture zone. */
  private wireDrag(track: HTMLElement, handle: HTMLElement): void {
    let dragging = false;
    let startY = 0;
    let travel = 0; // px the handle can move (track height minus the handle)
    const setOffset = (px: number) => {
      handle.setCssProps({ '--orbis-lock-offset': `${px}px` });
    };
    // Upward drag → negative offset, clamped to [-travel, 0].
    const offsetFor = (e: PointerEvent) => Math.max(Math.min(0, e.clientY - startY), -travel);
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      travel = Math.max(0, track.clientHeight - handle.offsetHeight);
      handle.setPointerCapture(e.pointerId);
      handle.addClass('is-dragging');
      e.preventDefault();
      e.stopPropagation();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      setOffset(offsetFor(e));
      e.preventDefault();
    });
    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      handle.removeClass('is-dragging');
      if (travel > 0 && -offsetFor(e) >= travel * 0.7) this.onSlidOpen();
      setOffset(0); // snap back (harmless once unlocked/hidden)
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  setLocked(locked: boolean): void {
    if (locked === this.locked) return;
    this.locked = locked;
    this.player?.toggleClass('orbis-locked', locked); // hide controls, freeze the scrubber
    this.setBlackout(locked);
    // Body class so the focus-mode progress chip (bottom, outside the player) can be hidden too — on the player's
    // own window's body, which a popout has its own of.
    this.player?.doc.body.toggleClass('orbis-listen-locked', locked);
    this.railEl?.toggle(locked); // the right-edge unlock rail
    this.hintEl?.toggle(locked); // directions above the cover
    this.handleEl?.setCssProps({ '--orbis-lock-offset': '0px' });
    this.guardTouches(locked);
    // No notice either way: locked, the on-screen directions say what is happening; unlocked, the controls come back
    // and the reader returns to where it was before locking, which says it plainly enough.
  }

  /**
   * Pocket mode: swallow stray touch gestures so Obsidian's edge-swipe (open the file / backlinks drawers) can't fire
   * from a pocket touch. Capture phase on the document beats Obsidian's own handler; the unlock rail is exempted so
   * the slide-to-unlock still works.
   */
  private guardTouches(on: boolean): void {
    if (on && !this.guardedDoc) {
      this.guardedDoc = activeDocument;
      this.guardedDoc.addEventListener('touchstart', this.touchGuard, { capture: true, passive: false });
      this.guardedDoc.addEventListener('touchmove', this.touchGuard, { capture: true, passive: false });
    } else if (!on && this.guardedDoc) {
      this.guardedDoc.removeEventListener('touchstart', this.touchGuard, { capture: true });
      this.guardedDoc.removeEventListener('touchmove', this.touchGuard, { capture: true });
      this.guardedDoc = null;
    }
  }

  private touchGuard = (e: TouchEvent): void => {
    if (!this.locked) return;
    if (this.railEl?.contains(e.target as Node)) return; // allow the slide-to-unlock rail
    e.preventDefault();
    e.stopPropagation();
  };

  /** The view is going: take the body class and the touch guard with it. */
  dispose(): void {
    this.player?.doc.body.removeClass('orbis-listen-locked');
    this.guardTouches(false);
    this.locked = false;
    this.player = this.railEl = this.handleEl = this.hintEl = null;
  }
}

/** What the reader showed when Pocket mode was turned on — what unlocking puts back. */
export interface PocketReturn {
  focusMode: boolean;
  fullPlayer: boolean;
}

/** The reader, as far as turning Pocket mode on and off asks it. */
export interface PocketScene {
  focusMode(): boolean;
  fullPlayerShowing(): boolean;
  /** Open the full-screen player from the listening bar; false when it cannot open yet. */
  openFullPlayer(): boolean;
  toggleFocusMode(): void;
  showText(): void;
  setLocked(locked: boolean): void;
}

/**
 * Turn Pocket mode on from wherever listening is, and answer what to put back on unlocking — null when it could not.
 *
 * **Locked, the screen is always the full player in Focus mode**: the read-only now-playing view the blackout and the
 * slide are built for, and Focus mode is what hides the app's tabs and bars from a pocket. So this opens what is not
 * open, and records what it opened. It never starts or stops the audio.
 */
export function lockPocket(scene: PocketScene): PocketReturn | null {
  const back = { focusMode: scene.focusMode(), fullPlayer: scene.fullPlayerShowing() };
  if (!back.fullPlayer && !scene.openFullPlayer()) return null;
  if (!back.focusMode) scene.toggleFocusMode();
  scene.setLocked(true);
  return back;
}

/** Unlock, and put back what `lockPocket` changed: Focus mode off again, and the text with the listening bar. */
export function unlockPocket(scene: PocketScene, back: PocketReturn | null): void {
  scene.setLocked(false);
  if (!back) return;
  // Focus mode first: showing the text reserves room under a Focus mode bar, which leaving it would then have to undo.
  if (!back.focusMode && scene.focusMode()) scene.toggleFocusMode();
  if (!back.fullPlayer) scene.showText();
}

/** Pocket mode for one reader: locking from wherever listening is, and remembering what to put back. */
export class PocketMode {
  private back: PocketReturn | null = null;

  constructor(
    private readonly scene: PocketScene,
    private readonly isLocked: () => boolean
  ) {}

  lock(): void {
    if (!this.isLocked()) this.back = lockPocket(this.scene);
  }

  unlock(): void {
    unlockPocket(this.scene, this.back);
    this.back = null;
  }

  /** The command: lock, or unlock when locked. */
  toggle(): void {
    if (this.isLocked()) this.unlock();
    else this.lock();
  }

  /** A new book: nothing to put back. */
  reset(): void {
    this.back = null;
  }
}

/**
 * Whether listening wants the screen held on: while Pocket mode is locked, playing or paused, whatever the setting says;
 * otherwise while audio plays, when **Keep screen awake while listening** is on.
 *
 * **Pocket mode holds it because a phone needs it.** The audio stops when the screen goes off, so listening with the
 * phone in a pocket only works with the screen on — and that is what Pocket mode is for. It already dims the screen to
 * near black, which is what keeping it on costs least with.
 */
export function wantsScreenOn(o: { keepScreenAwake: boolean; playing: boolean; pocketLocked: boolean }): boolean {
  return o.pocketLocked || (o.keepScreenAwake && o.playing);
}
