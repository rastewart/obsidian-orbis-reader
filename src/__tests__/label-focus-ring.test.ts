// The keyboard ring on a labeled checkbox or radio: the label carries `is-focus-visible` while its input has keyboard
// focus, and only then.

import type { Component } from 'obsidian';
import { afterEach, describe, expect, it } from 'vitest';
import { LABEL_FOCUS_CLASS, watchLabelFocus } from '../label-focus-ring';

/** The part of a Component the ring uses: listeners it adds, and removes when it unloads. */
class Owner {
  private off: (() => void)[] = [];
  registerDomEvent(
    target: Document,
    type: 'focusin' | 'focusout',
    fn: (evt: FocusEvent) => void,
    options?: AddEventListenerOptions
  ): void {
    target.addEventListener(type, fn, options);
    this.off.push(() => target.removeEventListener(type, fn, options));
  }
  load(): void {}
  unload(): void {
    for (const off of this.off.splice(0)) off();
  }
}
const fake = new Owner();
const owner = fake as unknown as Component & Owner;
afterEach(() => {
  fake.unload();
  document.body.replaceChildren();
});

/** A labeled input whose `:focus-visible` is `keyboard`, as the browser would decide it. */
function labeled(type: string, keyboard: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
  const parsed = new DOMParser().parseFromString(`<label><input type="${type}"> Merge</label>`, 'text/html');
  const label = document.adoptNode(parsed.body.firstElementChild as HTMLLabelElement);
  document.body.append(label);
  const input = label.querySelector('input') as HTMLInputElement;
  const matches = input.matches.bind(input);
  Object.defineProperty(input, 'matches', {
    value: (selector: string) => (selector === ':focus-visible' ? keyboard : matches(selector)),
  });
  return { label, input };
}

describe('the label focus ring', () => {
  it('rings the label of a checkbox or radio focused from the keyboard, and clears it when focus leaves', () => {
    owner.load();
    watchLabelFocus(owner, document);
    for (const type of ['checkbox', 'radio']) {
      const { label, input } = labeled(type, true);
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(label.classList.contains(LABEL_FOCUS_CLASS), type).toBe(true);
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(label.classList.contains(LABEL_FOCUS_CLASS), type).toBe(false);
    }
  });

  it('leaves the label alone when the input was clicked, or is not a checkbox or radio', () => {
    owner.load();
    watchLabelFocus(owner, document);
    const clicked = labeled('checkbox', false);
    clicked.input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(clicked.label.classList.contains(LABEL_FOCUS_CLASS)).toBe(false);
    const text = labeled('text', true);
    text.input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(text.label.classList.contains(LABEL_FOCUS_CLASS)).toBe(false);
  });

  it('stops when its owner unloads', () => {
    owner.load();
    watchLabelFocus(owner, document);
    owner.unload();
    const { label, input } = labeled('radio', true);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(label.classList.contains(LABEL_FOCUS_CLASS)).toBe(false);
  });
});
