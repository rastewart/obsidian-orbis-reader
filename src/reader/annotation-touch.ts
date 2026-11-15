// Touches on a book's page, on a phone or tablet. Two jobs, on `touchend`:
//
//  1. Text selection: when a long-press drag finishes, hand it to the selection path.
//  2. A tap on a mark or note: find it ourselves, rather than leaving it to foliate's own click listener, so a
//     finger — less exact than a pointer — can land a little beside it, and cancel the click that follows so it does
//     not open twice.
//
// A swipe, a pinch or a tap on a link is left to the book. Telling a tap from a swipe is tap.ts's.

import type { ReaderContext } from './ReaderContext';
import { TapTracker } from './tap';

type HitResult = [string, Range] | [];

/** The part of foliate's overlayer a touch needs: what is drawn at a point. */
export interface OverlayerLike {
  hitTest(p: { x: number; y: number }): HitResult;
}

/** Where to look when the touch itself found nothing: ±20px across, ±10px up and down — a mark can be a few
 *  characters wide. */
const NEAR: readonly [number, number][] = [
  [-20, 0],
  [20, 0],
  [0, -10],
  [0, 10],
  [-20, -10],
  [20, 10],
];

const isSearchHit = (value: string): boolean => value.startsWith('foliate-search:');

/**
 * The mark or note under a touch at (`x`, `y`), or near it — or null. A search result is never one: it is drawn on
 * the same overlayer, but a tap on it is a tap on the page.
 */
export function hitNear(overlayer: OverlayerLike, x: number, y: number): [string, Range] | null {
  let hit = overlayer.hitTest({ x, y });
  if (!hit[0]) {
    for (const [dx, dy] of NEAR) {
      const c = overlayer.hitTest({ x: x + dx, y: y + dy });
      if (c[0] && !isSearchHit(c[0])) {
        hit = c;
        break;
      }
    }
  }
  return hit[0] && !isSearchHit(hit[0]) ? (hit as [string, Range]) : null;
}

/**
 * Listen for touches on one section's document. `onSelection` is the selection path; `onTap` gets the mark or note
 * tapped, once foliate has settled the page and it is certain the touch did not turn it.
 */
export function watchAnnotationTouches(
  doc: Document,
  sectionIndex: number,
  ctx: Pick<ReaderContext, 'foliateView' | 'contentEl' | 'debug'>,
  on: { onSelection: () => void; onTap: (value: string, range: Range) => void }
): void {
  const tap = new TapTracker();
  // The paginator's scroll position: where the page is, for telling whether a touch turned it.
  const pageAt = (): number => (ctx.foliateView?.renderer as { start?: number } | undefined)?.start ?? 0;
  doc.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) tap.down(t.clientX, t.clientY, e.touches.length, pageAt());
    },
    { passive: true }
  );
  // passive:false is required to call e.preventDefault().
  doc.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      const sel = doc.defaultView?.getSelection();
      const selType = sel?.type ?? 'null';
      ctx.debug(`touchend selType:${selType} touches:${e.changedTouches.length}`, 'select');
      if (sel && !sel.isCollapsed && sel.rangeCount > 0 && sel.toString().trim()) {
        on.onSelection();
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) return;
      // A swipe that lifts over a mark is turning the page, not choosing the mark — see TapTracker. No click
      // either, or foliate's own click listener would open the mark instead.
      if (!tap.isTap(touch.clientX, touch.clientY)) {
        e.preventDefault();
        ctx.debug('touchend: the finger moved — a swipe, not a tap', 'select');
        return;
      }
      if ((touch.target as Element | null)?.closest?.('a,button,input,select,textarea')) return;

      type ContentLike = { index: number; overlayer?: OverlayerLike };
      const renderer = ctx.foliateView?.renderer as { getContents?: () => ContentLike[] } | undefined;
      const content = renderer?.getContents?.()?.find((c) => c.index === sectionIndex);
      if (!content?.overlayer) return;

      ctx.debug(`touchend hitTest x:${touch.clientX.toFixed(0)} y:${touch.clientY.toFixed(0)}`, 'select');
      const hit = hitNear(content.overlayer, touch.clientX, touch.clientY);
      ctx.debug(`touchend result: ${hit ? hit[0].slice(0, 30) : 'no hit'}`, 'select');
      if (!hit) return;

      // Suppress the synthetic click so foliate's own click listener doesn't also
      // fire show-annotation and double-open the popup.
      e.preventDefault();

      const [value, range] = hit;
      // Decided once foliate has snapped, which it does on the frame after the finger lifts: a short quick
      // flick turns the page too, and only the page having moved says so — see TapTracker.
      const win = ctx.contentEl.win;
      win.requestAnimationFrame(() =>
        win.requestAnimationFrame(() => {
          if (tap.turnedPage(pageAt())) {
            ctx.debug('touchend: the page turned — a swipe, not a tap', 'select');
            return;
          }
          on.onTap(value, range);
        })
      );
    },
    { passive: false }
  );
}
