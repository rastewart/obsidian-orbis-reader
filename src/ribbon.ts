// Taking a ribbon icon away again, on every device — see `removeRibbonAction`.

import type { App } from 'obsidian';

/**
 * Remove a ribbon icon a plugin added: its element, AND its action.
 *
 * **On a phone the ribbon is not a bar of elements but a menu Obsidian draws from its list of actions** — every one not
 * marked hidden, its callback called unchecked — so a removed element left "Browse book sources" in that menu, doing
 * nothing, until the app was reloaded. Obsidian's own `removeRibbonAction` keeps the entry and deletes its callback,
 * which would leave it listed and failing; `hidden` is the reader's own setting and is saved. So the entry leaves the
 * list. Internal API, reached by name and skipped if it has gone. The price: switched back on, the icon is added at the
 * end of the ribbon rather than where it was.
 *
 * `id` is the one Obsidian gives it: `<plugin id>:<title>`.
 */
export function removeRibbonAction(app: App, el: HTMLElement, id: string): void {
  el.detach();
  const ribbon = (
    app.workspace as unknown as { leftRibbon?: { items?: Array<{ id: string }>; onChange?: (save: boolean) => void } }
  ).leftRibbon;
  const at = ribbon?.items?.findIndex((item) => item.id === id) ?? -1;
  if (!ribbon?.items || at < 0) return;
  ribbon.items.splice(at, 1);
  ribbon.onChange?.(true);
}
