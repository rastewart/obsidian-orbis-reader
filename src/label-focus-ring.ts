// The keyboard ring on a labeled checkbox or radio row: on the whole row, not on the 16px box.
//
// A label holding a checkbox or radio gets `is-focus-visible` while that input has keyboard focus, and loses it when
// focus leaves; styles.css rings `.orbis-modal`, `.orbis-popup` and `.orbis-settings` labels that carry it. The ring
// goes on the label because these dialogs are mostly labeled radio rows, and a ring on only the box would say the
// keyboard was on a small square rather than on "Merge · Review what's changed and merge into your existing notes".
//
// **A class, not `label:has(input:focus-visible)`.** That selector did this in CSS alone, and the Community
// directory's CSS lint reports every `:has()` as a performance risk. `:focus-within` is no substitute: it cannot tell
// a keyboard from a click, and would ring the row whenever anyone chose an option with the mouse. The input's own
// `:focus-visible` can, so it decides here, at the moment focus arrives.
import type { App, Component } from 'obsidian';

export const LABEL_FOCUS_CLASS = 'is-focus-visible';

/** The label to ring for `target`, when it is a checkbox or radio inside one. */
function ringedLabel(target: EventTarget | null): HTMLElement | null {
  // By tag name, not `instanceof`: an element in a popout window belongs to that window's realm.
  const el = target as HTMLInputElement | null;
  if (el?.tagName !== 'INPUT' || (el.type !== 'checkbox' && el.type !== 'radio')) return null;
  return el.closest('label');
}

function onFocusIn(evt: FocusEvent): void {
  const label = ringedLabel(evt.target);
  if (label && (evt.target as Element).matches(':focus-visible')) label.classList.add(LABEL_FOCUS_CLASS);
}

function onFocusOut(evt: FocusEvent): void {
  ringedLabel(evt.target)?.classList.remove(LABEL_FOCUS_CLASS);
}

/** Watch `doc` for focus moving onto and off labeled checkboxes and radios, for as long as `owner` is loaded. */
export function watchLabelFocus(owner: Component, doc: Document): void {
  owner.registerDomEvent(doc, 'focusin', onFocusIn, { capture: true });
  owner.registerDomEvent(doc, 'focusout', onFocusOut, { capture: true });
}

/** Watch every window Obsidian opens, for as long as `plugin` is loaded. */
export function installLabelFocusRing(plugin: Component & { app: App }): void {
  watchLabelFocus(plugin, window.document);
  plugin.registerEvent(plugin.app.workspace.on('window-open', (win) => watchLabelFocus(plugin, win.doc)));
}
