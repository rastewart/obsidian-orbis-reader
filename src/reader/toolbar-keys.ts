// The keyboard on the reader's toolbars: a grid of rows, the mouse handing the keyboard back to the book.
//
// - **Left and right** move between the controls of a row, wrapping; **Home** and **End** go to its ends.
// - **Up and down** move between rows, top to bottom as they are on screen: the main toolbar, the Display style tabs,
//   the open tab's controls, the search or Go to bar, the Listen bar. Up lands on the button that opened the row
//   you left; down lands on the row's own starting point — the open tab, or the first control.
// - **Escape** sends the keyboard to the book from any of them.
// - **A mouse click** on a toolbar button does its job and leaves the keyboard on the book, so the arrows turn the
//   page again. A click made with Enter or Space leaves it where it is. A click that put the keyboard somewhere it
//   is needed — a search field, the content panel, a dialog — is left alone.
//
// A slider, a number field or a dropdown keeps its own arrows: they are how it is used. Tab and Shift+Tab move off it.

import { type Component, Platform } from 'obsidian';
import type { DebugCategory } from '../settings';

/** One row of controls, and where the keyboard lands in it. */
interface ToolbarRow {
  /** The row's element, or null when the reader has not built it. A row not on screen is skipped. */
  el: HTMLElement | null | undefined;
  /** Where moving down into this row lands, if not its first control — the Display style tabs' open tab. */
  entry?: HTMLElement | null;
  /** The button in the row above that opened this one: where moving up out of it lands. */
  opener?: HTMLElement | null;
}

/** A row reduced to the controls that can take the keyboard, in order. */
export interface RowStops {
  stops: readonly HTMLElement[];
  entry?: HTMLElement | null;
  opener?: HTMLElement | null;
}

export type ToolbarMove = 'left' | 'right' | 'home' | 'end' | 'up' | 'down';

const MOVES: Readonly<Record<string, ToolbarMove>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'home',
  End: 'end',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * Each row's controls minus those of any row nested inside it — **a row's controls are its own.** The Display style
 * toolbar is built inside the main toolbar's element, so without this the main toolbar's row would hold every tab and
 * tab control as well, and moving down from a tab would start from the wrong row.
 */
export function ownStops(rows: readonly { el: HTMLElement; stops: readonly HTMLElement[] }[]): HTMLElement[][] {
  return rows.map(({ el, stops }) => {
    const nested = rows.map((r) => r.el).filter((other) => other !== el && el.contains(other));
    return stops.filter((s) => !nested.some((n) => n.contains(s)));
  });
}

/** Where `move` takes the keyboard from `from`, or null when there is nowhere to go. Pure: rows in, element out. */
export function nextStop(rows: readonly RowStops[], from: HTMLElement, move: ToolbarMove): HTMLElement | null {
  const i = rows.findIndex((r) => r.stops.includes(from));
  if (i < 0) return null;
  const { stops } = rows[i];
  const j = stops.indexOf(from);
  const n = stops.length;
  if (move === 'left') return stops[(j - 1 + n) % n];
  if (move === 'right') return stops[(j + 1) % n];
  if (move === 'home') return stops[0];
  if (move === 'end') return stops[n - 1];
  const to = rows[move === 'up' ? i - 1 : i + 1];
  if (!to) return null;
  const opener = move === 'up' ? rows[i].opener : null;
  if (opener && to.stops.includes(opener)) return opener;
  return to.entry && to.stops.includes(to.entry) ? to.entry : to.stops[0];
}

const STOP = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="tab"]';

const onScreen = (el: HTMLElement): boolean =>
  el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/** The controls of `row` a reader can reach, in order — enabled, and on screen. */
function stopsOf(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>(STOP)).filter(
    (el) => !(el as HTMLButtonElement).disabled && onScreen(el)
  );
}

/** Does this control use the arrows itself? A field, a dropdown or a slider does; a button or a tab does not. */
const keepsOwnArrows = (el: HTMLElement): boolean =>
  el.isContentEditable || /^(input|select|textarea)$/i.test(el.tagName);

/** A control as the log names it: its element and class, and its label — every toolbar button shares a class. */
const describe = (el: Element | null): string => {
  if (!el) return 'nothing';
  const cls = el.className ? `.${String(el.className).split(' ')[0]}` : '';
  const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30);
  return `${el.tagName.toLowerCase()}${cls}${label ? ` "${label}"` : ''}`;
};

/**
 * The reader's rows, as the classes its bars carry, and the button that opens each — marked `data-orbis-opens` where
 * it is built. Found in the DOM rather than handed over, so the reader view does not have to know them; only the
 * ones on screen count, so a closed bar or a hidden tab's controls drop out.
 */
const READER_ROWS: readonly { row: string; opens?: string; entry?: string }[] = [
  { row: '.orbis-toolbar' },
  { row: '.orbis-level2-toolbar', opens: 'display', entry: '[aria-selected="true"]' },
  { row: '.orbis-level3-drawer' },
  { row: '.orbis-secondary-bar.orbis-search-bar', opens: 'search' },
  { row: '.orbis-secondary-bar.orbis-goto-bar' },
  { row: '.orbis-tts-bar', opens: 'listen' },
];

/** The reader's rows under `root`, top to bottom as they are in the document. */
function readerToolbarRows(root: HTMLElement): ToolbarRow[] {
  const rows: ToolbarRow[] = [];
  for (const spec of READER_ROWS) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(spec.row))) {
      rows.push({
        el,
        entry: spec.entry ? el.querySelector<HTMLElement>(spec.entry) : null,
        opener: spec.opens ? root.querySelector<HTMLElement>(`[data-orbis-opens="${spec.opens}"]`) : null,
      });
    }
  }
  // Document order, which is screen order here: the toolbars, then the bars over the book.
  return rows.sort((a, b) =>
    a.el && b.el && a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  );
}

interface ToolbarKeysOptions {
  /** The rows, top to bottom, read each time a key is pressed — bars open and close. */
  rows(): readonly ToolbarRow[];
  /** Put the keyboard on the book. */
  toBook(): void;
  /** Whether a mouse click hands the keyboard back to the book — the desktop; a touch device has no keyboard. */
  pointerReturnsToBook: boolean;
  /** Register a listener so it is removed with its owner. */
  listen<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void): void;
  debug(msg: string): void;
}

/** Install the toolbar keyboard on `root`, the element holding every row. */
function wireToolbarKeys(root: HTMLElement, o: ToolbarKeysOptions): void {
  const rowsNow = (): (RowStops & { el: HTMLElement })[] => {
    const shown = o.rows().filter((r): r is ToolbarRow & { el: HTMLElement } => !!r.el && onScreen(r.el));
    const own = ownStops(shown.map((r) => ({ el: r.el, stops: stopsOf(r.el) })));
    return shown
      .map((r, i) => ({ stops: own[i], entry: r.entry, opener: r.opener, el: r.el }))
      .filter((r) => r.stops.length > 0);
  };
  const inARow = (rows: readonly (RowStops & { el?: HTMLElement })[], el: HTMLElement): boolean =>
    rows.some((r) => r.el?.contains(el));

  o.listen(root, 'keydown', (e) => {
    // A control that answered the key itself — the Display style tabs, a search field — has had its say.
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const rows = rowsNow();
    if (!inARow(rows, target)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      o.toBook();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const move = MOVES[e.key];
    if (!move || keepsOwnArrows(target)) return;
    e.preventDefault();
    nextStop(rows, target, move)?.focus();
  });

  o.listen(root, 'click', (e) => {
    // `detail` counts the clicks of a pointer; a click made with Enter or Space has none.
    if (!o.pointerReturnsToBook || e.detail === 0) return;
    const rows = rowsNow();
    const target = e.target as HTMLElement;
    if (!target.closest('button, [role="tab"]') || !inARow(rows, target)) return;
    const now = target.ownerDocument.activeElement as HTMLElement | null;
    // Only when the keyboard is still on a toolbar control: a click that moved it to a field, the content panel or a
    // dialog put it where it is needed.
    if (now && inARow(rows, now) && !keepsOwnArrows(now)) o.toBook();
  });

  // Where the keyboard goes, for tracing a jump nobody asked for — the `nav` pill.
  o.listen(root, 'focusin', (e) => o.debug(`focus → ${describe(e.target as Element)}`));
}

/** What a reader view offers for its toolbars to be wired — it has all of it already. */
export interface ToolbarKeysView extends Component {
  readonly contentEl: HTMLElement;
  /** Put the keyboard on the book. */
  focusReader(): void;
  debug(msg: string, category?: DebugCategory): void;
}

/** Wire a reader view's toolbars, once per view. A mouse click hands the keyboard back only on the desktop. */
export function installToolbarKeys(view: ToolbarKeysView): void {
  wireToolbarKeys(view.contentEl, {
    rows: () => readerToolbarRows(view.contentEl),
    toBook: () => view.focusReader(),
    pointerReturnsToBook: !Platform.isMobile,
    listen: (el, type, fn) => view.registerDomEvent(el, type, fn),
    debug: (msg) => view.debug(msg, 'nav'),
  });
}
