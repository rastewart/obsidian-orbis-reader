import { setIcon } from 'obsidian';
import { keyActivates, moveRowAmongRows, moveRowToIndex, setSvgIcon, syncReorderEnds, wireListDrag } from './ui-utils';

/**
 * The drag grip, as one picture.
 *
 * Two were in use: this, and lucide's `menu` — a hamburger, which in every other context means a menu. So the same
 * gesture wore two glyphs depending on whether the list was in settings or in a dialog.
 */
const GRIP =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

/**
 * The move-up, move-down and drag controls of a reorderable row — one implementation, for every list.
 *
 * **Why this exists.** Nine lists in the plugin let a reader reorder rows, and each had grown its own copy of these
 * three controls: the widgets in a dashboard, the fields in a widget, the sort levels and field values in a
 * collection, the keys and values on the Fields page, the marks, the chapters of an EPUB, the sections of a note
 * export. Every fix therefore had to be made nine times, and in one evening the same four defects were found in four
 * lists each — arrows that lost the keyboard, arrows built as divs that could not take focus back, tooltips
 * describing a different list's control, and handles sitting in the tab order with nothing to do. That is not nine
 * bugs; it is one bug copied nine times.
 *
 * **What is shared and what is not.** Not the row: a marks row is a table, a sort level is a strip of dropdowns, a
 * widget row carries a switch and a summary. The CONTROLS are identical everywhere, and so is the contract around
 * them — keyed for focus, disabled at the ends, a handle that is not a tab stop, Enter and Space handled directly.
 * So a caller draws its own row and calls this for the end of it.
 */
export interface ReorderControlsSpec {
  /** The row element. Moved among its siblings in `inPlace` mode, and what the drag reports on. */
  row: HTMLElement;
  /** Where the three controls are appended — a `Setting`'s `controlEl`, or the row itself. */
  into: HTMLElement;
  /** This row's identity, so the focus key travels with the row rather than with its position. */
  key: string;
  index: number;
  count: number;
  labels: { up: string; down: string; drag: string };
  /** One object per list, shared by its rows — `wireListDrag` uses it to know a drag is in progress. */
  drag: { from: number | null };
  /**
   * Persist a move. In `inPlace` mode the row has already moved on screen and the indices come from the DOM; in
   * rebuild mode the caller is expected to redraw, which is when the indices are its own render-time ones.
   */
  move: (from: number, to: number) => void;
  /**
   * **In place, or rebuilt.** A list on a settings page moves the row element and does not repaint, because
   * Obsidian's settings pane takes the keyboard when a page repaints (see `renderReorderList`). A list in a dialog
   * repaints itself, which is fine there so long as the repaint goes through `rebuildKeepingFocus` — the keys below
   * are what let it put the keyboard back.
   */
  inPlace?: boolean;
  /** Distinguishes one list's keys from another's when two share a container. Defaults to `order`. */
  keyPrefix?: string;
  /** Optional diagnostics — one line per press, including a press that does nothing. */
  log?: (msg: string) => void;
}

export function reorderControls(spec: ReorderControlsSpec): void {
  const prefix = spec.keyPrefix ?? 'order';
  const step = (up: boolean): void => {
    if (spec.inPlace) {
      const moved = moveRowAmongRows(spec.row, up);
      if (!moved) {
        spec.log?.(`press ${up ? 'up' : 'down'} on ${spec.key}: nowhere to go`);
        return;
      }
      spec.move(moved.from, moved.to);
      syncReorderEnds(spec.row);
      spec.log?.(`press ${up ? 'up' : 'down'} on ${spec.key}: ${moved.from}→${moved.to}`);
      return;
    }
    const to = up ? spec.index - 1 : spec.index + 1;
    if (to < 0 || to >= spec.count) {
      spec.log?.(`press ${up ? 'up' : 'down'} on ${spec.key}: nowhere to go`);
      return;
    }
    spec.move(spec.index, to);
    spec.log?.(`press ${up ? 'up' : 'down'} on ${spec.key}: ${spec.index}→${to}`);
  };

  /**
   * **A real `<button>`, and Enter handled here.** An `addExtraButton` is a div (focusable on 1.13.7, but a div), so a
   * rebuild could never put the keyboard back however good its key was. And a focused button in settings sometimes
   * never receives the click Chromium should synthesise from Enter, so the key handler does not wait for one.
   */
  const arrow = (icon: string, label: string, suffix: string, disabled: boolean, up: boolean): HTMLElement => {
    const btn = spec.into.createEl('button', { cls: 'clickable-icon orbis-reorder-btn' });
    setIcon(btn, icon);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-keyshortcuts', 'Enter');
    btn.dataset.orbisFocus = `${prefix}-${suffix}:${spec.key}`;
    btn.disabled = disabled;
    btn.addEventListener('click', () => step(up));
    keyActivates(btn, () => {
      if (!btn.disabled) step(up);
    });
    return btn;
  };
  const up = arrow('arrow-up', spec.labels.up, 'up', spec.index === 0, true);
  const down = arrow('arrow-down', spec.labels.down, 'down', spec.index === spec.count - 1, false);

  /** The handle is for a pointer only — `wireListDrag` takes it out of the tab order, since the arrows are the
   *  keyboard's way to reorder and a keyboard cannot drag. */
  const handle = spec.into.createEl('button', { cls: 'clickable-icon orbis-reorder-handle' });
  setSvgIcon(handle, GRIP);
  handle.setAttribute('aria-label', spec.labels.drag);
  wireListDrag({
    row: spec.row,
    handle,
    index: spec.index,
    state: spec.drag,
    onDrop: (from, to) => {
      /**
       * **In place, the drop has to move the element itself.** `wireListDrag` reports where the row was dropped and
       * touches nothing: it was written for a list that repaints, and a repaint is what put the row in its new place.
       * These lists deliberately do not repaint, so a drag saved the new order and left the screen showing the old
       * one — visible as a row snapping back, and as an order that changed the next time the page was built.
       * `moveRowToIndex` also re-reads `from` from the DOM, which is the honest number: the index the row was
       * rendered at is stale from the first move onwards.
       */
      if (spec.inPlace) {
        const moved = moveRowToIndex(spec.row, to);
        if (!moved) {
          spec.log?.(`drag ${spec.key}: nowhere to go`);
          return;
        }
        spec.move(moved.from, moved.to);
        syncReorderEnds(spec.row);
        spec.log?.(`drag ${spec.key}: ${moved.from}→${moved.to}`);
        return;
      }
      spec.move(from, to);
      spec.log?.(`drag ${spec.key}: ${from}→${to}`);
    },
  });

  /**
   * **Always the right-most controls, whatever order the caller built its row in.**
   *
   * Moving and dragging are what a row does to its POSITION; everything else — edit, switch on, delete — is what it
   * does to itself, and belongs to the left of them. Left to convention that held in most lists and not in the sort
   * levels, whose ✕ came last. So instead of asking every caller to call this at the right moment, the controls put
   * themselves at the end once the row is finished: a microtask runs after the caller's last append, and moving them
   * is the same three elements either way.
   *
   * The keyboard is carried over deliberately: re-appending an element blurs it, and on a rebuild the arrow that was
   * just restored can be the one being moved.
   */
  queueMicrotask(() => {
    if (!handle.isConnected || handle.nextElementSibling === null) return; // already last
    const held = spec.into.ownerDocument.activeElement;
    spec.into.append(up, down, handle);
    if (held === up || held === down) (held as HTMLElement).focus();
  });
}
