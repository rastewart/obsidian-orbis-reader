// What the tab trap counts as a stop.
//
// The trap itself needs layout to test — it filters on `offsetParent`, which jsdom does not compute — but the part
// that was wrong is the selector, and a selector can be tested against elements alone. The fault it prevents:
// `<summary>` is a tab stop the browser stops on and no tag in the usual button/input list, so a trap built from
// that list wrapped past the folds at the top of a dialog and back to the third control down.

import { describe, expect, it } from 'vitest';
import { FOCUSABLE_SELECTOR } from '../ui-utils';

const matches = (tag: string, attrs: Record<string, string> = {}): boolean => {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return el.matches(FOCUSABLE_SELECTOR);
};

describe('FOCUSABLE_SELECTOR', () => {
  it('counts a details header, which the browser stops on', () => {
    expect(matches('summary')).toBe(true);
  });

  it('counts the ordinary controls', () => {
    expect(matches('button')).toBe(true);
    expect(matches('input', { type: 'text' })).toBe(true);
    expect(matches('input', { type: 'checkbox' })).toBe(true);
    expect(matches('select')).toBe(true);
    expect(matches('textarea')).toBe(true);
    expect(matches('a', { href: '#x' })).toBe(true);
  });

  it('counts an element made focusable by hand', () => {
    // `onActivate` gives rows and headers `tabIndex = 0`; a trap that skipped them would wrap past every one.
    expect(matches('div', { tabindex: '0' })).toBe(true);
  });

  it('does not count one taken OUT of the tab order', () => {
    // The annotation bar focuses itself as a whole this way, and the reorder handles are `-1` deliberately.
    expect(matches('div', { tabindex: '-1' })).toBe(false);
  });

  it('does not count what a reader cannot tab to', () => {
    expect(matches('div')).toBe(false);
    expect(matches('span')).toBe(false);
    expect(matches('a')).toBe(false);
    // A `<details>` is not a stop; its `<summary>` is the one.
    expect(matches('details')).toBe(false);
  });
});
