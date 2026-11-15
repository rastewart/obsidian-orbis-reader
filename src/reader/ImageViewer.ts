// Tap an image to open it, then zoom and pan it like a photo, or copy it.
//
// In a paginated column an image is bounded by the column, and opening it to fit the pane is only a real gain in a
// two-column layout — on a phone in one column the default 3% gap means the column is already ~94% of the pane, so
// fitting gives back a few percent and nothing more. The zoom is the feature; the overlay is only where it happens.
//
// **Every image opens, however small.** The viewer is also where an image is copied, and an icon or an inline glyph
// is as copyable as a plate. An accidental open costs one tap to close, because a tap on the page does nothing else.
//
// **Tap, not long-press.** Long-press raises the native save-image sheet in both WebViews, and it is touch-only, so a
// desktop reader would get nothing. Tap costs nothing here because the reader turns pages with explicit arrows rather
// than tap zones, so a tap on the page body does nothing today.
//
// **Zoom is implemented rather than inherited.** Obsidian mobile is a fixed-layout app with page zoom disabled, so
// there is no viewport pinch to fall back on: two pointers are tracked and a transform is applied.
//
// See docs/design/toolbar-and-panels.md.

import { Notice } from 'obsidian';
import { t } from '../i18n';
import { guardDragSwipe, setSvgIcon } from '../ui-utils';
import { copyImage, describe, isBookImage } from './image-copy';
import type { ReaderContext } from './ReaderContext';

/** 1 is fit-to-pane. The ceiling is generous because the point is reading detail in a chart, not admiring pixels. */
const MIN_SCALE = 1;
const MAX_SCALE = 8;

/** What a double-tap or double-click zooms to, when not already zoomed. */
const QUICK_ZOOM = 2.5;

/** Beyond this a two-finger gesture is a pinch rather than a two-finger pan, and panning should not fight it. */
const PINCH_SLOP_PX = 8;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class ImageViewer {
  constructor(private readonly ctx: ReaderContext) {}

  private overlayEl: HTMLElement | null = null;
  private imgEl: HTMLImageElement | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  /** Live transform. `scale` 1 means fitted; translation is in CSS pixels of the overlay. */
  private scale = 1;
  private tx = 0;
  private ty = 0;

  /** Active pointers, so a pinch can be told from a drag without guessing. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { dist: number; scale: number; cx: number; cy: number; tx: number; ty: number } | null = null;
  private dragStart: { x: number; y: number; tx: number; ty: number } | null = null;
  /** Set once two fingers have moved far enough apart to be a pinch — a tap must not then be treated as a dismiss. */
  private gestured = false;
  private lastTapAt = 0;

  /**
   * Make the images in a freshly-loaded section document tappable.
   *
   * Called once per section as it loads, alongside the other per-document setup.
   */
  setup(doc: Document): void {
    doc.addEventListener('click', (e: MouseEvent) => {
      const target = e.target;
      if (!target || !(target as Element).matches?.('img')) return;
      const img = target as HTMLImageElement;
      // A tap on an image inside a LINK belongs to the link — that is a navigation the reader asked for, and
      // swallowing it to show a picture would be the wrong guess. Clipped articles do exactly this with avatars.
      if (img.closest('a')) return;
      // Only the book's own images: a remote one the chapter would not load is not loaded here either.
      const src = img.currentSrc || img.src;
      if (!isBookImage(src)) return;
      e.preventDefault();
      e.stopPropagation();
      this.open(src, img.alt);
    });
  }

  /**
   * Show one image over the reader.
   *
   * Themed from `readerColors()` rather than Obsidian's own variables: this sits on top of the page, so it has to
   * match the page. A white sheet dropped into a sepia or dark book is the jarring part, not the image.
   */
  private open(src: string, alt: string): void {
    this.close();
    // All three, `filter` included. The reader's brightness is a deliberate choice — at night especially — and a
    // full-pane image at 100% in a dimmed book is a flash bright enough to be a reason not to open one. It also
    // matches every other surface drawn over the page: the link preview's quote box and the mark drawing both take
    // the filter. If it reads too dark, the brightness slider is the control for that, not this overlay.
    const { bg, fg, filter } = this.ctx.readerColors();
    // Parented to the reader HOST, not `contentEl`. `.orbis-host` is `position: relative`, so `inset: 0` resolves
    // against the reader's own box — the same box `foliate-view` fills. `contentEl` is not positioned, so the inset
    // resolved against some further ancestor and left a strip of text showing above the overlay in focus mode.
    // Queried rather than passed in: `.orbis-host` is our own class, not Obsidian's, so it is ours to rely on.
    const host = this.ctx.contentEl.querySelector<HTMLElement>('.orbis-host') ?? this.ctx.contentEl;
    const overlay = host.createDiv({ cls: 'orbis-image-viewer' });
    overlay.setCssStyles({ background: bg, color: fg, filter });
    this.overlayEl = overlay;
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;

    const img = overlay.createEl('img', { cls: 'orbis-image-viewer-img' });
    img.src = src;
    // The alt text is the only description a reader has of an image they cannot see, so it survives into the viewer.
    img.alt = alt;
    img.draggable = false;
    this.imgEl = img;

    // Pinned to the bottom rather than sitting under the image as a flex sibling. A scaled image overflows its
    // layout box and paints over anything in the flow, so the caption ended up floating in the middle of a zoomed
    // chart. As chrome it stays out of the way — and it hides entirely once zoomed, because at that point the reader
    // is inspecting the image and a caption over it is noise.
    if (alt) overlay.createDiv({ cls: 'orbis-image-viewer-alt', text: alt });

    const close = overlay.createEl('button', {
      cls: 'orbis-image-viewer-close',
      attr: { type: 'button', 'aria-label': t('image_viewer.close') },
    });
    // The same 18px glyph the exit-focus ✕ uses, rather than `setIcon`, whose unsized SVG rendered large and thin
    // enough to look faint on a light page. These two buttons sit in the same corner and now match exactly.
    setSvgIcon(
      close,
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
    );
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    // Beside the ×, in the same chip. The viewer is where the image is the only thing on screen, so there is no
    // question of what is being copied.
    const copy = overlay.createEl('button', {
      cls: 'orbis-image-viewer-copy',
      attr: { type: 'button', 'aria-label': t('image_viewer.copy') },
    });
    setSvgIcon(
      copy,
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
    );
    copy.addEventListener('click', (e) => {
      e.stopPropagation();
      const log = (msg: string) => this.ctx.debug(msg, 'display');
      copyImage(src, log).then(
        () => new Notice(t('notices.image_copied_to_clipboard')),
        (err: unknown) => {
          log(`image copy: failed — ${describe(err)}`);
          new Notice(t('notices.image_copy_failed'));
        }
      );
    });

    this.installGestures(overlay);
    // A pan across the pane otherwise races Obsidian's mobile edge-swipe and pulls in the file drawer mid-gesture.
    // `touch-action: none` in the stylesheet is NOT enough on its own — that suppresses the browser's own panning,
    // while Obsidian's gesture is JavaScript on touch events, so the event has to be stopped as well. Same helper the
    // Display-settings sliders and the player's scrubber use.
    guardDragSwipe(overlay);

    this.onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    // On the document, not the overlay: focus is still inside the book's iframe, so a listener on this element would
    // never see the key.
    this.ctx.contentEl.ownerDocument.addEventListener('keydown', this.onKey);
    // Focus has to leave the book's iframe or Escape never reaches this document — the key event fires in the
    // iframe's own document, which is a different one, so the listener above would never see it. The close button is
    // the right thing to land on anyway: a keyboard reader arrives on the way out.
    close.focus({ preventScroll: true });
    // In focus mode the exit-focus ✕ sits at z-index 100002, top-right — the same corner as this viewer's own ✕ and
    // far above it, so a tap meant to close the image left focus mode instead. Hidden by a body class rather than by
    // out-bidding it: the same idiom pocket mode uses, and it does not depend on where each element's stacking
    // context happens to sit. Closing the image is the nearer intent, so it takes the corner.
    this.ctx.contentEl.ownerDocument.body.addClass('orbis-image-open');
  }

  /**
   * Pinch to zoom, drag to pan, double-tap to toggle, wheel to zoom.
   *
   * Pointer events rather than touch events, so one implementation covers finger, trackpad and mouse — the same
   * argument as tap over long-press.
   */
  private installGestures(overlay: HTMLElement): void {
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
    const two = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
      const [a, b] = [...this.pointers.values()];
      return a && b ? [a, b] : null;
    };

    overlay.addEventListener('pointerdown', (e: PointerEvent) => {
      // Not on the buttons. On the desktop, capture sends the click that follows to the overlay rather than to the
      // button under the pointer, and a click on the overlay closes the viewer — so Copy closed it instead of copying.
      if ((e.target as Element).closest('button')) return;
      overlay.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pair = two();
      if (pair) {
        // Second finger down: start a pinch and abandon any drag, so the two are never applied together.
        this.dragStart = null;
        this.pinchStart = {
          dist: dist(pair[0], pair[1]),
          scale: this.scale,
          cx: (pair[0].x + pair[1].x) / 2,
          cy: (pair[0].y + pair[1].y) / 2,
          tx: this.tx,
          ty: this.ty,
        };
      } else if (this.scale > 1) {
        // Panning only exists when there is somewhere to pan to.
        this.dragStart = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty };
      }
    });

    overlay.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pair = two();
      if (pair && this.pinchStart) {
        const d = dist(pair[0], pair[1]);
        if (Math.abs(d - this.pinchStart.dist) > PINCH_SLOP_PX) this.gestured = true;
        const next = clamp((d / this.pinchStart.dist) * this.pinchStart.scale, MIN_SCALE, MAX_SCALE);
        // Keep the point BETWEEN the fingers still, which is what makes a pinch feel like it grips the image rather
        // than scaling it about some other origin.
        const rect = overlay.getBoundingClientRect();
        const ox = this.pinchStart.cx - rect.left - rect.width / 2;
        const oy = this.pinchStart.cy - rect.top - rect.height / 2;
        const ratio = next / this.pinchStart.scale;
        this.scale = next;
        this.tx = ox - (ox - this.pinchStart.tx) * ratio;
        this.ty = oy - (oy - this.pinchStart.ty) * ratio;
        this.apply();
        return;
      }

      if (this.dragStart) {
        this.gestured = true;
        this.tx = this.dragStart.tx + (e.clientX - this.dragStart.x);
        this.ty = this.dragStart.ty + (e.clientY - this.dragStart.y);
        this.apply();
      }
    });

    const release = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchStart = null;
      if (this.pointers.size === 0) this.dragStart = null;
    };
    overlay.addEventListener('pointerup', release);
    overlay.addEventListener('pointercancel', release);

    /**
     * The tap is handled on CLICK, not on `pointerup`.
     *
     * Closing during `pointerup` removed the overlay before the browser dispatched the click that follows it, so the
     * click landed on whatever was now under the finger — on Android that was the toolbar's focus button, and
     * dismissing an image entered focus mode. Desktop hid it because pointer capture swallowed the click there.
     *
     * At click time the overlay still exists, so it consumes the event and nothing beneath it ever sees the tap.
     */
    overlay.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // A gesture is not a tap. Without this, letting go after a pinch or a pan closes the viewer, which is the most
      // annoying possible outcome of having zoomed in.
      const wasGesture = this.gestured;
      this.gestured = false;
      if (!wasGesture) this.onTap(e);
    });

    // Trackpad pinch arrives as a ctrl-wheel; a plain wheel zooms too, since nothing here scrolls.
    overlay.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        this.zoomAbout(this.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY, overlay);
      },
      { passive: false }
    );
  }

  /**
   * A tap with no gesture behind it: dismiss, or on a double tap, toggle the zoom.
   *
   * Double-tap is measured here rather than with `dblclick`, which does not fire reliably for touch — and the first
   * tap of a pair must not dismiss, hence the delay-free check on the interval instead.
   */
  private onTap(e: MouseEvent): void {
    const now = Date.now();
    const isDouble = now - this.lastTapAt < 300;
    this.lastTapAt = isDouble ? 0 : now;
    if (!isDouble) {
      // Anywhere dismisses when fitted; when zoomed it would be far too easy to lose your place, so a single tap
      // resets to fit first and only closes from there.
      if (this.scale > 1) this.reset();
      else this.close();
      return;
    }
    const overlay = this.overlayEl;
    if (!overlay) return;
    if (this.scale > 1) this.reset();
    else this.zoomAbout(QUICK_ZOOM, e.clientX, e.clientY, overlay);
  }

  /** Scale toward a point, keeping that point where it is. */
  private zoomAbout(target: number, clientX: number, clientY: number, overlay: HTMLElement): void {
    const next = clamp(target, MIN_SCALE, MAX_SCALE);
    const rect = overlay.getBoundingClientRect();
    const ox = clientX - rect.left - rect.width / 2;
    const oy = clientY - rect.top - rect.height / 2;
    const ratio = next / this.scale;
    this.tx = ox - (ox - this.tx) * ratio;
    this.ty = oy - (oy - this.ty) * ratio;
    this.scale = next;
    this.apply();
  }

  private reset(): void {
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.apply();
  }

  /**
   * Write the transform, and keep the image from being dragged off screen.
   *
   * The bound is the overflow the current scale actually produces, so at fit there is nothing to pan and further out
   * there is exactly as much slack as there is hidden image. Without it, one enthusiastic swipe leaves an empty pane.
   */
  private apply(): void {
    const img = this.imgEl;
    const overlay = this.overlayEl;
    if (!img || !overlay) return;
    const slackX = Math.max(0, (img.clientWidth * this.scale - overlay.clientWidth) / 2);
    const slackY = Math.max(0, (img.clientHeight * this.scale - overlay.clientHeight) / 2);
    this.tx = clamp(this.tx, -slackX, slackX);
    this.ty = clamp(this.ty, -slackY, slackY);
    img.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    overlay.toggleClass('is-zoomed', this.scale > 1);
  }

  close(): void {
    this.ctx.contentEl.ownerDocument.body.removeClass('orbis-image-open');
    if (this.onKey) {
      this.ctx.contentEl.ownerDocument.removeEventListener('keydown', this.onKey);
      this.onKey = null;
    }
    this.pointers.clear();
    this.pinchStart = null;
    this.dragStart = null;
    this.gestured = false;
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.imgEl = null;
  }

  /** True while an image is open, so other surfaces can decline to stack on top of it. */
  get isOpen(): boolean {
    return this.overlayEl !== null;
  }

  dispose(): void {
    this.close();
  }
}
