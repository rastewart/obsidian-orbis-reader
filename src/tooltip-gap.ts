// The distance between an Orbis control and its tooltip, so a large pointer does not cover the text.
//
// Obsidian draws a tooltip for any element with an `aria-label`, a fixed 8px below it, and reads the gap from the
// element's `data-tooltip-gap` attribute as the pointer arrives (`pointerover`, delegated on the body). A web page
// cannot learn the pointer's size, so the gap is the reader's to set — a device setting, since a pointer belongs to
// a machine. One listener, in the capture phase so it runs before Obsidian's, gives whichever Orbis control the
// pointer has reached the chosen gap; no control sets its own.
//
// Orbis's controls only: Obsidian's own tooltips — the ribbon, the tab header, menus — keep Obsidian's spacing.

import type { App, Component } from 'obsidian';
import { deviceSetting } from './device-settings';
import { VIEW_TYPE_ORBIS, VIEW_TYPE_ORBIS_DATA, VIEW_TYPE_ORBIS_LIBRARY } from './view-types';

/** Obsidian's own gap. At this value Orbis adds nothing, so its tooltips sit exactly where Obsidian's do. */
export const OBSIDIAN_TOOLTIP_GAP = 8;
export const TOOLTIP_GAP_MAX = 64;

/**
 * What belongs to Orbis: its three views, its settings, its popups and modals, and the marks bar.
 *
 * The view types come from `view-types.ts`, not the views: `OrbisModal` imports this module, and importing a view
 * from here closed a cycle back to `OrbisModal`.
 */
const ORBIS_SURFACES = [
  `.workspace-leaf-content[data-type="${VIEW_TYPE_ORBIS}"]`,
  `.workspace-leaf-content[data-type="${VIEW_TYPE_ORBIS_LIBRARY}"]`,
  `.workspace-leaf-content[data-type="${VIEW_TYPE_ORBIS_DATA}"]`,
  '.orbis-settings',
  '.orbis-popup',
  '.orbis-modal',
  '#orbis-picker',
].join(', ');

/**
 * Give every labeled control in the Orbis surface under `target` the gap — the whole surface, not just the control
 * the pointer is over. At Obsidian's own gap the attribute is removed rather than written, so nothing differs from
 * Obsidian for anyone who leaves the setting alone.
 *
 * **Ahead of the control, because the control's own first hover is too late.** Written as the pointer reached a
 * button, the gap missed that first tooltip: Obsidian had already placed it at its own distance, and moved it on the
 * next pointer event — a jump, once per control. The pointer crosses its surface before it reaches a button, so
 * stamping the surface then has every button ready; one added since is caught on the next move. Only the controls
 * not already carrying this gap are touched.
 *
 * The same pass places disabled controls' tooltips clear of the pointer (`disabledTooltipPlacement`), for the same
 * reason it is done ahead of the hover.
 */
export function applyTooltipGap(target: EventTarget | null, gap: number): void {
  const surface = (target as Element | null)?.closest?.(ORBIS_SURFACES);
  if (!surface) return;
  placeDisabledTooltips(surface);
  // A control that moved its tooltip clear of the pointer gives back a gap it was stamped with before it did.
  for (const el of Array.from(surface.querySelectorAll(MOVED_WITH_GAP))) el.removeAttribute('data-tooltip-gap');
  if (gap > OBSIDIAN_TOOLTIP_GAP) {
    for (const el of Array.from(
      surface.querySelectorAll(`[aria-label]:not([data-tooltip-gap="${gap}"])${CLEAR_OF_POINTER}`)
    )) {
      el.setAttribute('data-tooltip-gap', String(gap));
    }
  } else {
    for (const el of Array.from(surface.querySelectorAll('[data-tooltip-gap]'))) el.removeAttribute('data-tooltip-gap');
  }
}

/**
 * **Only a tooltip the pointer can reach gets the gap.** A pointer hangs down and to the right of the spot it points
 * at, so a tooltip placed below a control (Obsidian's default) or to its right can be under it, and one placed to the
 * left or above cannot — pushed further off, it just reads as detached from its control. Obsidian keeps a placement in
 * `data-tooltip-position`; a control asks for one where even the gap is not enough, as a disabled button does, whose
 * "not allowed" pointer is bigger than the arrow the gap was set for (`downloaded-voices-dialog.ts`).
 */
const CLEAR_OF_POINTER = ':not([data-tooltip-position="left"]):not([data-tooltip-position="top"])';
const MOVED_WITH_GAP =
  '[data-tooltip-gap][data-tooltip-position="left"], [data-tooltip-gap][data-tooltip-position="top"]';

/** Marks a placement this module chose, so it can be taken back — never one a control asked for itself. */
const AUTO_PLACED = 'data-orbis-tooltip-placed';

/** How a control says it is disabled: natively, for assistive tech, or by sitting in a panel switched off. */
const isDisabled = (el: Element): boolean =>
  el.matches(':disabled, [aria-disabled="true"]') || el.closest('.is-disabled') !== null;

/**
 * Where a disabled control's tooltip goes: above it, else to its left, else where Obsidian puts it (null).
 *
 * **A disabled control's pointer is not the arrow.** It is the "not allowed" one, whose badge hangs below and right of
 * the arrow — further than the gap reaches, so over a tooltip placed below, the one that says why the control is off.
 * Above is preferred: Obsidian keeps an above or below tooltip on screen sideways, but nothing keeps a LEFT one on
 * screen, so near a window's left edge it would run off — left only where it fits. Neither fits only in a corner, where
 * below is all there is. Sizes are estimated from the label against Obsidian's tooltip: 300px at most, a small font.
 */
export function disabledTooltipPlacement(rect: { top: number; left: number }, label: string): 'top' | 'left' | null {
  const ARROW = 5; // Obsidian's tooltip arrow, added to the gap above
  const width = Math.min(label.length * 7 + 20, 300);
  const lines = Math.ceil((label.length * 7 + 20) / 300);
  const height = lines * 16 + 12;
  if (rect.top - OBSIDIAN_TOOLTIP_GAP - ARROW - height >= 0) return 'top';
  if (rect.left - OBSIDIAN_TOOLTIP_GAP - width >= 0) return 'left';
  return null;
}

/**
 * Move each disabled control's tooltip clear of the pointer, and put back any whose control is enabled again. A
 * placement the control chose itself (`setTooltip(…, { placement })`) is left alone.
 */
function placeDisabledTooltips(surface: Element): void {
  for (const el of Array.from(surface.querySelectorAll('[aria-label]'))) {
    const mine = el.hasAttribute(AUTO_PLACED);
    if (!mine && el.hasAttribute('data-tooltip-position')) continue;
    const place = isDisabled(el)
      ? disabledTooltipPlacement(el.getBoundingClientRect(), el.getAttribute('aria-label') ?? '')
      : null;
    if (place) {
      el.setAttribute('data-tooltip-position', place);
      el.setAttribute(AUTO_PLACED, '');
    } else if (mine) {
      el.removeAttribute('data-tooltip-position');
      el.removeAttribute(AUTO_PLACED);
    }
  }
}

let owner: (Component & { app: App }) | null = null;
const watched = new WeakSet<Document>();
const onPointer = (e: PointerEvent): void => applyTooltipGap(e.target, deviceSetting('tooltipGap'));

/**
 * Listen in `doc` too, once. **Every window has a document of its own** — the main one, a pop-out pane, and Settings,
 * which Obsidian can show in a window of its own — and a listener in one hears nothing in another. Obsidian announces
 * pop-out panes, not the Settings window, so every Orbis dialog calls this as it opens (`OrbisModal.onOpen`): a dialog
 * opened from Settings lands in that window's body, outside the settings page `watchTooltipElement` listens on, and
 * its buttons had Obsidian's gap.
 */
export function watchTooltipDocument(doc: Document): void {
  if (!owner || watched.has(doc)) return;
  watched.add(doc);
  owner.registerDomEvent(doc, 'pointerover', onPointer, { capture: true });
}

const watchedEls = new WeakSet<HTMLElement>();

/**
 * Listen on `el` itself, once — for a surface that may be MOVED into another window after it is built, as the
 * settings page is when Settings opens in a window of its own. A listener on an element goes where the element goes;
 * one on a document stays in that document. Capture, so it still runs before Obsidian's handler on the body.
 */
export function watchTooltipElement(el: HTMLElement): void {
  if (!owner || watchedEls.has(el)) return;
  watchedEls.add(el);
  owner.registerDomEvent(el, 'pointerover', onPointer, { capture: true });
}

/** Install the listener on every window Obsidian opens, for as long as `plugin` is loaded. Desktop only: no hover. */
export function installTooltipGap(plugin: Component & { app: App }): void {
  owner = plugin;
  // The main window's document, named as such: every popout arrives through `window-open`, below.
  watchTooltipDocument(window.document);
  plugin.registerEvent(plugin.app.workspace.on('window-open', (win) => watchTooltipDocument(win.doc)));
  plugin.register(() => {
    owner = null;
  });
}
