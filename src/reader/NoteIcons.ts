// The note icons: one beside each note's first line on the page being shown — in the strip beside the book, or on a
// two-column page's own gutter. The notes themselves are AnnotationController's; this owns only where their icons go,
// the toggle that shows or hides them, and the space the book gives up for the strip. The placement arithmetic is
// note-icon-place.ts's.

import { t } from '../i18n';
import type { Note } from '../progress';
import { setSvgIcon } from '../ui-utils';
import { columnsOf, noteIconLeft, placeNoteIcon } from './note-icon-place';
import type { ReaderContext } from './ReaderContext';
import { onTap } from './tap';

const NOTE_ICON_MARGIN = 36; // px — width of the note icons column
const NAV_BTN_WIDTH = 50; // px — width of the right nav button area

/** What the icons need of the reader view. */
export interface NoteIconsHost {
  applyHostBg(): void;
  reloadAdjacentSections(): void;
}

export class NoteIcons {
  private columnEl: HTMLElement | null = null;
  /** Over the book, for the note icons of a paginated page, each beside its own column — see `placeNoteIcon`. */
  private layerEl: HTMLElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private visible: boolean;
  // Live DOM Ranges for positioned notes — keyed by CFI. Stored from draw-annotation
  // events; getBoundingClientRect() on them gives current viewport position as the
  // paginator pages through the section.
  private ranges = new Map<string, Range>();
  private timer: number | null = null;
  /** The frame a refresh is waiting for — see `refreshNextFrame`. */
  private frame: number | null = null;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: NoteIconsHost,
    /** The book's notes as they are now — the controller replaces its list rather than editing it. */
    private readonly notes: () => readonly Note[],
    /** Open a note, for its icon. */
    private readonly open: (note: Note) => void
  ) {
    this.visible = ((ctx.app.loadLocalStorage('orbis-notes-visible') as string | null) ?? 'true') === 'true';
  }

  /** The note-icons toggle button, for visibility toggling by the toolbar. */
  get toggleButton(): HTMLButtonElement | null {
    return this.toggleBtn;
  }

  /** Where a note is drawn, from its draw-annotation event — and a refresh, since an icon may now have a place. */
  track(cfi: string, range: Range): void {
    this.ranges.set(cfi, range);
    this.scheduleRefresh();
  }

  /** A note that is gone, or no longer drawn: its range is not kept. */
  forget(cfi: string): void {
    this.ranges.delete(cfi);
  }

  /**
   * **Follow the renderer's scrolling — on the renderer, not on the view.** The paginator dispatches `scroll` on itself
   * for every tick of its container, and the event neither bubbles nor leaves the view's shadow root, so a listener on
   * the view never hears it. It fires on a page turn too, hence the flow check: a paginated page places its icons once
   * it settles (`relocated`).
   */
  follow(renderer: HTMLElement | undefined): void {
    renderer?.addEventListener('scroll', () => {
      if (this.ctx.flow === 'scrolled') this.refreshNextFrame({ quiet: true });
    });
  }

  /** The book settled at a new place. A scrolled book's icons have been following the scroll, so they are placed
   *  once more rather than cleared and redrawn. */
  relocated(): void {
    if (this.ctx.flow === 'scrolled') this.refreshNextFrame();
    else this.scheduleRefresh();
  }

  /**
   * Place the icons again on the next frame, at most once a frame, without clearing them first — for a scrolled book,
   * whose icons move with the text: every scroll tick (quiet), and the relocate as the scroll settles.
   *
   * `scheduleRefresh` would not do there: it clears the icons at once and places them 200 ms after the last call, so
   * they would vanish for the whole scroll, and blink out as it stopped.
   */
  private refreshNextFrame(opts: { quiet?: boolean } = {}): void {
    if (this.frame !== null) return;
    const win = this.ctx.contentEl.win;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = null;
      this.refresh(opts);
    });
  }

  private cancelPending(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.frame !== null) {
      this.ctx.contentEl.win.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  /** A section's overlay was made again: no icon stands, and draw-annotation will place them afresh. */
  reset(): void {
    this.cancelPending();
    this.clear();
  }

  /** Book close / leaf teardown. */
  dispose(): void {
    this.cancelPending();
    this.columnEl = null;
    this.layerEl = null;
    this.toggleBtn = null;
    this.ranges = new Map();
  }

  /** Build the note-icons toggle button into `container` (toolbar right group). */
  buildToggle(container: HTMLElement): void {
    this.toggleBtn = container.createEl('button', { cls: 'orbis-ctrl-btn' });
    this.toggleBtn.setAttribute('aria-label', t('toolbar.toggle_note_icons'));
    setSvgIcon(
      this.toggleBtn,
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>'
    );
    if (this.visible) this.toggleBtn.classList.add('is-active');
    this.toggleBtn.addEventListener('click', () => this.toggle());
  }

  /** Build the notes margin-icon column into `parent` (the filter wrapper). */
  buildColumn(parent: HTMLElement): void {
    this.columnEl = parent.createDiv({ cls: 'orbis-notes-col' });
    this.layerEl = parent.createDiv({ cls: 'orbis-notes-layer' });
  }

  /** Remove every note icon, from the strip beside the book and from the page. */
  private clear(): void {
    for (const el of [this.columnEl, this.layerEl]) {
      el?.querySelectorAll('.orbis-note-icon').forEach((icon) => icon.remove());
    }
  }

  // Apply foliate-view right offset and notes column visibility.
  // Called on load and when the toggle button is clicked.
  applyVisibility(): void {
    const v = this.visible;
    if (this.columnEl) this.columnEl.toggle(v);
    if (this.ctx.foliateView) {
      // Inset both sides by NAV_BTN_WIDTH so text never overlaps the prev/next buttons
      // even when the gap slider is at 0%. Right grows further when notes are visible.
      // foliateView is a native custom element, not an Obsidian HTMLElement.
      this.ctx.foliateView.style.left = `${NAV_BTN_WIDTH}px`;
      this.ctx.foliateView.style.right = v ? `${NOTE_ICON_MARGIN + NAV_BTN_WIDTH}px` : `${NAV_BTN_WIDTH}px`;
    }
    if (this.toggleBtn) this.toggleBtn.classList.toggle('is-active', v);
    this.host.applyHostBg();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.ctx.app.saveLocalStorage('orbis-notes-visible', String(this.visible));
    this.applyVisibility();
    // Let foliate reflow at the new width
    this.host.reloadAdjacentSections();
  }

  // Mirror of epub.js computeNotePositions(): clear all icons then re-add only the ones
  // visible on the current page.  Uses live DOM Ranges stored from draw-annotation events —
  // getClientRects() on them reflects the current paginator position without needing a
  // fresh CFI lookup.  The iframe fills the host so iframe-viewport Y = host-relative Y
  // (no iframeRect.top - containerRect.top correction needed).
  refresh(opts: { quiet?: boolean } = {}): void {
    // Quiet while following a scroll, which refreshes every frame and would fill the debug log in a second.
    const debug: ReaderContext['debug'] = opts.quiet ? () => {} : (msg, category) => this.ctx.debug(msg, category);
    debug(
      `refreshNoteIcons called colEl:${!!this.columnEl} hostEl:${!!this.ctx.hostEl} visible:${this.visible}`,
      'annot'
    );
    if (!this.columnEl || !this.ctx.hostEl) return;
    this.clear();
    if (!this.visible) return;
    const maxY = this.ctx.hostEl.offsetHeight;
    // In foliate's paginated mode content is laid out as horizontal CSS columns.
    // Rects from adjacent pages have left<0 (prev page) or left>=viewW (next page)
    // while still having valid top values — filter them out with a horizontal check.
    const viewW = this.ctx.hostEl.offsetWidth - NOTE_ICON_MARGIN - NAV_BTN_WIDTH;
    debug(`refreshNoteIcons maxY:${maxY} viewW:${viewW} notes:${this.notes().length}`, 'annot');
    for (const n of this.notes()) {
      const range = this.ranges.get(n.cfiRange);
      if (!range) {
        debug(`  note ${n.id.slice(0, 8)} — no range`, 'annot');
        continue;
      }
      try {
        // foliate-js paginates via #container.scrollLeft inside the renderer's closed shadow DOM.
        // Range.getClientRects() returns iframe-document coords (column-absolute).
        // expand() offsets the iframe by one page-width to the right inside the wrapper div
        // (it adds size*2 to the wrapper and flex-centers the iframe), so:
        //   visible iframe-x = [paginatorStart - paginatorSize, paginatorStart)
        // `start` and `size` are public getters on the foliate-paginator element.
        const paginator = this.ctx.foliateView?.renderer as unknown as { start?: number; size?: number };
        const paginatorStart = paginator?.start ?? 0;
        const paginatorSize = paginator?.size ?? viewW;

        const rects = Array.from(range.getClientRects());
        debug(
          `  note ${n.id.slice(0, 8)} "${n.text.slice(0, 20)}" pStart:${paginatorStart.toFixed(1)} pSize:${paginatorSize.toFixed(1)} rects:${rects.length} ${rects
            .slice(0, 2)
            .map((r) => `(l:${r.left.toFixed(0)} t:${r.top.toFixed(0)} b:${r.bottom.toFixed(0)})`)
            .join(' ')}`,
          'annot'
        );
        // To avoid picking up giant block-level bounding rectangles (like paragraph margins),
        // we create a precise range around just the FIRST non-empty text node in the highlight.
        let textRects = rects;
        const doc = range.startContainer.ownerDocument;
        if (doc) {
          const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
              if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
              return node.textContent && node.textContent.trim().length > 0
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP;
            },
          });
          let tn = walker.nextNode();
          while (tn) {
            const tr = doc.createRange();
            tr.selectNodeContents(tn);
            if (tn === range.startContainer) tr.setStart(tn, range.startOffset);
            if (tn === range.endContainer) tr.setEnd(tn, range.endOffset);

            // Only use this text node if the highlight actually covers non-whitespace characters in it.
            // This prevents snapping to the end of a previous paragraph if the user drag-selected loosely.
            if (tr.toString().trim().length > 0) {
              const trRects = Array.from(tr.getClientRects());
              if (trRects.length > 0) {
                textRects = trRects;
                break;
              }
            }
            tn = walker.nextNode();
          }
        }

        const isScrolled = this.ctx.flow === 'scrolled';

        // Compute iframe screen-Y relative to the notes column before the visibility
        // check.  In scrolled mode each section lives in its own iframe whose r.top
        // is local to that iframe's coordinate space, not the container's scrollTop.
        // iframeOffsetTop converts r.top into notes-column-relative screen space so
        // no paginatorStart arithmetic is needed — and the value updates automatically
        // as the container scrolls because getBoundingClientRect() is live.
        let iframeOffsetTop = 0;
        // The section document's x origin on screen, for placing an icon beside its column.
        let iframeScreenLeft: number | null = null;
        try {
          const iframeDoc = range.startContainer.ownerDocument;
          const frameEl = iframeDoc?.defaultView?.frameElement as HTMLElement;
          if (frameEl && this.columnEl) {
            const frameRect = frameEl.getBoundingClientRect();
            iframeOffsetTop = frameRect.top - this.columnEl.getBoundingClientRect().top;
            iframeScreenLeft = frameRect.left;
          }
        } catch {
          /* ignore */
        }

        let chosen: DOMRect | null = null;

        for (let i = 0; i < textRects.length; i++) {
          const r = textRects[i];
          if (r.width < 1 || r.height < 1) continue;
          const visible = isScrolled
            ? (() => {
                const screenY = iframeOffsetTop + r.top;
                return screenY >= 0 && screenY < paginatorSize;
              })()
            : (() => {
                const cx = r.left + r.width / 2;
                return cx >= paginatorStart - paginatorSize && cx < paginatorStart && r.top >= 0 && r.top < maxY;
              })();
          if (visible) {
            chosen = r;
            break;
          }
        }
        if (!chosen) {
          debug(`  chosen: null`, 'annot');
          continue; // note is on a different page — no icon
        }

        // Align to the vertical center of the FIRST line of the highlighted text.
        const iconTop = Math.round(
          isScrolled
            ? iframeOffsetTop + chosen.top + chosen.height / 2
            : chosen.top + chosen.height / 2 + iframeOffsetTop
        );
        debug(
          `  chosen: t:${chosen.top.toFixed(0)} iframeOff:${iframeOffsetTop.toFixed(0)} iconTop:${iconTop} maxY:${maxY}`,
          'annot'
        );

        // A scrolled book has no page edge, so its icons go in the strip beside the book.
        const cols = isScrolled || iframeScreenLeft === null ? null : columnsOf(range.startContainer.ownerDocument);
        const place = cols
          ? placeNoteIcon({
              lineCenterX: chosen.left + chosen.width / 2,
              pageEnd: paginatorStart,
              pageSize: paginatorSize,
              ...cols,
            })
          : null;
        const layer = place?.where === 'page' ? this.layerEl : null;
        const icon = (layer ?? this.columnEl).createEl('button');
        icon.className = 'orbis-note-icon';
        if (layer && place?.where === 'page' && iframeScreenLeft !== null) {
          const pageLeft = iframeScreenLeft + paginatorStart - paginatorSize;
          icon.classList.add('is-on-page');
          icon.style.left = `${noteIconLeft(pageLeft, place.x, layer.getBoundingClientRect().left)}px`;
        }
        icon.dataset.cfi = n.cfiRange;
        icon.setAttribute('aria-label', n.text);
        setSvgIcon(
          icon,
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="#E67E22"' +
            ' style="fill:#E67E22;display:block;flex-shrink:0">' +
            '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>'
        );
        icon.style.top = `${iconTop}px`;
        onTap(icon, () => this.open(n));
      } catch {
        /* range in detached document — section unloaded, skip */
      }
    }
  }

  scheduleRefresh(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    // Clear immediately (mirrors epub.js setNoteAnchorPositions([])), then refresh
    // after a short debounce + double-rAF so the paginator layout is fully committed.
    this.clear();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      const win = this.ctx.contentEl.win;
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => this.refresh()));
    }, 200);
  }
}
