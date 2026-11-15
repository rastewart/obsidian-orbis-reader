// A book's frame taking focus counts as its window taking focus, and a press in it as a press in its window.

/**
 * Re-send the window its `focus` event when a chapter's frame takes focus and Obsidian thinks another window is active.
 *
 * **Obsidian learns which window is active from that window's own `focus` event** (measured in 1.14.4's `app.js`),
 * and places what it shows — the view header's ⋯ menu among them, through `showAtPosition`'s default document —
 * in that window.
 *
 * **The reader keeps keyboard focus inside the book**, so the arrow keys turn pages — and that is where the browser
 * puts it back when the window is brought forward, by a click on its chrome as much as on the book. The `focus`
 * event then goes to the chapter's frame, a window of its own, and the book's window never has one. A note's window
 * gets its event because focus returns to its editor, on the window's own document. Without this, Obsidian goes on
 * believing the previous window active, and the next ⋯ pressed here opens its menu in that one, at this window's
 * coordinates.
 *
 * Dispatching the event runs Obsidian's own handler, so this window becomes active exactly as a note's would —
 * nothing of Obsidian's is set by hand. A no-op with one window, which is every phone and tablet.
 */
export function relayFrameFocus(doc: Document, host: Window, log: (msg: string) => void): void {
  doc.defaultView?.addEventListener('focus', () => {
    if (activeWindow === host) return;
    log('book frame took focus in a window Obsidian did not have as active — focusing the window');
    host.dispatchEvent(new Event('focus'));
  });
}

/**
 * Tell the book's window about a press in a chapter's frame while one of Obsidian's menus is open there, so the press
 * closes it as a press on a note does.
 *
 * **An open menu closes on a `mousedown` or `click` that reaches its window** (measured in 1.14.4's `app.js`), and a
 * press in the frame reaches only the frame's own window. A phone never needed this: its menu lays a backdrop over
 * the whole screen, book included, and the backdrop takes the press. The Mac's ⋯ menu is the system's own, which
 * closes itself. A tablet has neither — so on the iPad the menu stayed open over the book whatever was pressed.
 *
 * The `mousedown` is sent from `hostEl`, the view's element in the window's document: what Obsidian is told was
 * pressed is the view, outside the menu, and the menu's own handler closes it. Only while a menu is open, so nothing
 * else of Obsidian's hears of presses in the book.
 */
export function relayFramePress(doc: Document, hostEl: HTMLElement, log: (msg: string) => void): void {
  doc.addEventListener(
    'pointerdown',
    () => {
      if (!hostEl.doc.body.querySelector(':scope > .menu')) return;
      log('press in the book with a menu open — passing it to the window, which closes the menu');
      hostEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    },
    true
  );
}
