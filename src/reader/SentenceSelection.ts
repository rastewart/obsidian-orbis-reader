// Selecting by sentence and paragraph from the keyboard.
//
// **Separate from `OrbisReaderView` because it is one capability:** the arrow keys growing a selection a sentence or
// a paragraph at a time inside the book's iframe, and the Shift-arrow behavior that seeds one when there is nothing
// selected yet. See docs/design/keyboard.md.
//
// It is a collaborator rather than a module of functions because it holds one piece of state — where the last
// adjustment left the caret — which is what tells a second Shift-arrow to extend rather than to start again.

import type { ReaderContext } from './ReaderContext';
import { ReaderDom } from './ReaderDom';
import {
  firstVisible,
  nextSpan,
  paragraphSpan,
  type SentenceMove,
  sentenceAt,
  sentencesIn,
  shiftArrowDoes,
} from './sentence-cursor';

/**
 * What this needs beyond `ReaderContext`, which already has `foliateView`, `hostEl` and `debug`.
 *
 * Four, all about the DOM of the book rather than the reading position: the document a selection lives in, the
 * map from a document to its spine index, the set of documents foliate has loaded, and `ReaderDom` for the
 * iframe plumbing.
 */
export interface SentenceSelectionHost {
  currentSectionDoc(): Document | undefined;
  readonly readerDom: ReaderDom;
  readonly docToSection: Map<Document, number>;
  readonly loadedDocs: Set<Document>;
}

/** Growing a selection by sentence or paragraph, from the keyboard. */
export class SentenceSelection {
  /**
   * Where the last adjustment left the caret.
   *
   * A second Shift-arrow extends the selection this one made; a Shift-arrow somewhere else starts a new one. The
   * comparison is against the focus node and offset, which is the only way to tell those apart — the selection
   * itself looks the same either way.
   */
  private lastAdjustAt: { node: Node; offset: number } | null = null;

  constructor(
    private readonly ctx: ReaderContext,
    private readonly host: SentenceSelectionHost
  ) {}

  /** The selection was dropped — the next Shift-arrow starts a new one rather than extending. */
  forget(): void {
    this.lastAdjustAt = null;
  }

  /** The document holding the reader's selection, which is the one Shift+arrow has to refine — not necessarily the
   *  one the index names. */
  private selectionDoc(): Document | undefined {
    for (const doc of this.host.loadedDocs) {
      const sel = doc.defaultView?.getSelection();
      if (sel?.rangeCount && !sel.isCollapsed) return doc;
    }
    return this.host.currentSectionDoc();
  }

  /** Does the selection already cover every sentence of the block it starts in? Then "select paragraph" moves on
   *  to the next one, rather than reselecting what is already selected. */
  private coversBlock(units: readonly { block?: Range }[], at: { from: number; to: number }): boolean {
    const block = units[at.from]?.block;
    let first = -1;
    let last = -1;
    for (const [i, unit] of units.entries()) {
      if (unit.block !== block) continue;
      if (first < 0) first = i;
      last = i;
    }
    return first >= 0 && at.from <= first && at.to >= last;
  }

  /**
   * Move the selection by whole sentences.
   *
   * The selection itself is the only state — which sentence you are on is read back from it each time — so a page
   * turn, a re-render or a click elsewhere cannot leave a cursor pointing at something that has gone.
   *
   * Selecting fires the book's own `selectionchange`, which is what raises the annotation bar; that is deliberate,
   * and how a sentence chosen from the keyboard becomes a mark without a second mechanism.
   */
  move(move: SentenceMove): void {
    const doc = this.host.currentSectionDoc();
    const sel = doc?.defaultView?.getSelection();
    if (!doc || !sel) return;
    const units = sentencesIn(doc);
    if (!units.length) return;

    /**
     * Visible means **starts** on this page, not "overlaps it somewhere".
     *
     * A sentence that straddles a column break has a bounding rect covering both columns, so it passes an overlap
     * test while beginning on the page before — and seeding from it starts the selection somewhere the reader is
     * not looking. Collapsing to the first character asks the question that was meant.
     */
    const startsHere = (r: Range): boolean => {
      const probe = doc.createRange();
      probe.setStart(r.startContainer, r.startOffset);
      probe.collapse(true);
      return this.host.readerDom.onScreen(probe, doc);
    };

    const live = sel.rangeCount ? sel.getRangeAt(0) : null;
    // A selection the reader cannot see is not where they are: it is where they were before the page turned.
    const usable = live && startsHere(live) ? live : null;
    const current = usable
      ? {
          from: sentenceAt(units, usable.startContainer, usable.startOffset),
          to: sentenceAt(units, usable.endContainer, usable.endOffset),
          collapsed: usable.collapsed,
        }
      : null;
    const at = current && current.from >= 0 ? current : null;
    const visible = firstVisible(units, startsHere);
    const span =
      move === 'paragraph'
        ? paragraphSpan(units, at ? at.from : visible, !!at && !at.collapsed && this.coversBlock(units, at))
        : nextSpan(move, units.length, at, visible);
    if (!span) {
      this.ctx.debug(`sentence ${move}: nowhere to go (${units.length} in section)`, 'nav');
      return;
    }

    const range = doc.createRange();
    range.setStart(units[span.from].range.startContainer, units[span.from].range.startOffset);
    range.setEnd(units[span.to].range.endContainer, units[span.to].range.endOffset);
    sel.removeAllRanges();
    /**
     * **`setBaseAndExtent`, not `addRange` — so the moving end is always the right-hand one.**
     *
     * A selection built with `addRange` has no direction, and Chromium settles that on the first `modify`: press
     * Left first and the START becomes the focus, press Right first and it is the END. The keys then mean
     * different things depending on which one you happened to press first, which is hidden state and reads as the
     * control being unpredictable.
     *
     * Naming the anchor and the focus fixes the answer up front: the caret nobody can see sits at the end of the
     * sentence, so Shift+Left always shrinks it and Shift+Right always grows it.
     */
    sel.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
    /**
     * **The book has to hold focus, or the selection is invisible.**
     *
     * Chromium paints a selection in an unfocused document with nothing at all, so a sentence selected from a
     * hotkey would look like it had failed — the annotation bar appears, because the selection is real, and no
     * highlight does. Focus lives on the HOST after opening a book or navigating, which is most of the time.
     *
     * It is also what makes Escape and Shift+arrow work afterwards: both are handled inside the book, and a
     * keystroke only reaches that document when it is the one focused.
     */
    doc.defaultView?.focus();
    const seen = startsHere(range);
    // The geometry travels with the verdict: "on screen" being wrong is the one failure that looks like the
    // feature simply not working, and only the numbers say which term is off.
    const frameLeft = (doc.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect().left;
    const hostBox = this.ctx.hostEl?.getBoundingClientRect();
    const px = (n: number | undefined): string => (n === undefined ? '?' : String(Math.round(n)));
    this.ctx.debug(
      `sentence ${move}: ${span.from}–${span.to} of ${units.length}, starts on screen:${seen}, ` +
        `range x:${px(range.getBoundingClientRect().left)}, frame x:${px(frameLeft)}, ` +
        `host x:${px(hostBox?.left)}..${px(hostBox?.right)}`,
      'nav'
    );

    // Off the page: let foliate do the moving, so a sentence that starts on the next page is reached the same way
    // every other navigation reaches it.
    if (!seen) {
      const index = this.host.docToSection.get(doc);
      const view = this.ctx.foliateView;
      if (index === undefined || !view) {
        this.ctx.debug('sentence: off screen and no way to page to it', 'nav');
        return;
      }
      const cfi = view.getCFI(index, range);
      this.ctx.debug(`sentence: paging to ${cfi.slice(0, 40)}`, 'nav');
      void view.goTo(cfi);
    }
  }

  /**
   * Shift+arrow, doing what it does everywhere else.
   *
   * There is no caret in a non-editable iframe, so the browser will not extend a selection with the arrows on its
   * own — `Selection.modify` is what makes it possible, and it is the same mechanism the browser uses, so the
   * result behaves as a reader expects: it moves the FOCUS end, which means Shift+Right grows and Shift+Left then
   * shrinks.
   *
   * `left`/`right` rather than `forward`/`backward` because the visual directions respect right-to-left text, and
   * foliate reads RTL books.
   *
   * **It also starts one.** Requiring a separate command first would be unusual: no editor has a "begin
   * selecting" key, you hold Shift and move, and the selection exists because you did. A first press takes the
   * sentence at the caret, or the first on the page — and takes it whole, without applying the direction, because
   * you have to see what you got before adjusting it.
   *
   * **And it does not die when it shrinks to nothing.** Holding Shift+Left eventually brings the focus end back to
   * the anchor; the press after that carries it through, and the selection grows backwards out of the other side,
   * which is what every editor does. A guard that stops exactly there leaves the selection dead.
   */
  extend(key: string): boolean {
    const doc = this.selectionDoc();
    const sel = doc?.defaultView?.getSelection() as (Selection & { modify?: (...a: string[]) => void }) | undefined;
    // Said out loud, because a key that does nothing is indistinguishable from a key that was never seen.
    if (!sel?.modify) {
      this.ctx.debug(`shift+${key}: no selection API (doc:${doc ? 'found' : 'none'})`, 'nav');
      return false;
    }
    const how: Record<string, [string, string] | undefined> = {
      ArrowRight: ['right', 'character'],
      ArrowLeft: ['left', 'character'],
      ArrowDown: ['forward', 'line'],
      ArrowUp: ['backward', 'line'],
    };
    const step = how[key];
    if (!step) return false;

    /**
     * A collapsed selection means two opposite things, and only we know which.
     *
     * Clicked in a sentence: take that sentence. Shrunk a selection down to nothing: keep going, out the other
     * side. The DOM cannot tell them apart, so where the last adjustment left the caret is remembered — still
     * there, and this is the same gesture continuing.
     */
    const collapsed = !sel.rangeCount || sel.isCollapsed;
    const atLast =
      !!this.lastAdjustAt && sel.focusNode === this.lastAdjustAt.node && sel.focusOffset === this.lastAdjustAt.offset;
    if (shiftArrowDoes(sel.rangeCount > 0, collapsed, atLast) === 'seed') {
      this.lastAdjustAt = null;
      this.move('sentence');
      this.ctx.debug(`shift+${key}: started a selection`, 'nav');
      return true;
    }

    /**
     * **Chromium sometimes refuses to move, and the answer is a coarser unit.**
     *
     * Moving a caret by `line` in a multi-column layout stalls at certain boundaries — the book is laid out in
     * columns and the line "above" may be in the previous one, which the engine will not step into. It reports
     * nothing; the selection simply stops growing, and holding the key does nothing at all.
     *
     * So the move is checked. If the focus did not shift, the same direction is tried by paragraph, then by
     * character — each coarser or finer step is a different way over the same obstacle, and a character move is
     * the one thing that always crosses a boundary. Falling back is silent to the reader and logged for us.
     */
    const moved = (): boolean => sel.focusNode !== was.node || sel.focusOffset !== was.offset;
    const was = { node: sel.focusNode, offset: sel.focusOffset };
    let used = step[1];
    sel.modify('extend', step[0], step[1]);
    for (const coarser of ['paragraph', 'character']) {
      if (moved()) break;
      used = coarser;
      sel.modify('extend', step[0], coarser);
    }
    this.lastAdjustAt = sel.focusNode ? { node: sel.focusNode, offset: sel.focusOffset } : null;
    const detail = used === step[1] ? `by ${used}` : `by ${used} (${step[1]} would not move)`;
    this.ctx.debug(`shift+${key}: ${collapsed ? 'crossed over, extending' : 'extended'} ${detail}`, 'nav');
    return true;
  }
}
