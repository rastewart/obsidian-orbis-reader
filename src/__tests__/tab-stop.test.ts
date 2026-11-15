import { beforeEach, describe, expect, it } from 'vitest';
import { FOCUSABLE_SELECTOR, isTabStop } from '../ui-utils';

/** Obsidian's `instanceOf` helper, which `isTabStop` uses — the real one is installed by the plugin's runtime. */
beforeEach(() => {
  (HTMLElement.prototype as unknown as { instanceOf: (t: unknown) => boolean }).instanceOf = function (t: unknown) {
    return this instanceof (t as new () => unknown);
  };
});

/** Markup in, element out. Parsed rather than assigned to `innerHTML`, which the lint gate refuses even in a test. */
const dialog = (html: string): HTMLElement => {
  const root = document.createElement('div');
  root.append(...new DOMParser().parseFromString(html, 'text/html').body.childNodes);
  return root;
};

/** Every element the trap would consider, in order — the list `first` and `last` come off. */
const stops = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => isTabStop(root, el))
    .map((el) => el.getAttribute('data-id') ?? el.tagName.toLowerCase());

describe('isTabStop', () => {
  /**
   * The export dialogs' shape: a close ×, then a Format group, then the rest. The browser tabs to the checked radio
   * and passes over the other, so a trap counting both has its ends in the wrong place.
   */
  it('counts a radio group as one stop, at the checked option', () => {
    const root = dialog(`
      <button data-id="close"></button>
      <input type="radio" name="format" data-id="single">
      <input type="radio" name="format" data-id="folder" checked>
      <button data-id="export"></button>
    `);
    expect(stops(root)).toEqual(['close', 'folder', 'export']);
  });

  it('follows the checked option when the choice changes', () => {
    const root = dialog(`
      <input type="radio" name="format" data-id="single" checked>
      <input type="radio" name="format" data-id="folder">
    `);
    expect(stops(root)).toEqual(['single']);
    root.querySelector<HTMLInputElement>('[data-id="single"]')!.checked = false;
    root.querySelector<HTMLInputElement>('[data-id="folder"]')!.checked = true;
    expect(stops(root)).toEqual(['folder']);
  });

  // Nothing checked yet: the browser stops at the first option, so the group still has exactly one stop.
  it('falls back to the first option when none is checked', () => {
    const root = dialog(`
      <input type="radio" name="format" data-id="single">
      <input type="radio" name="format" data-id="folder">
    `);
    expect(stops(root)).toEqual(['single']);
  });

  it('keeps two separate groups apart, one stop each', () => {
    const root = dialog(`
      <input type="radio" name="format" data-id="single">
      <input type="radio" name="format" data-id="folder" checked>
      <input type="radio" name="exists" data-id="version" checked>
      <input type="radio" name="exists" data-id="replace">
    `);
    expect(stops(root)).toEqual(['folder', 'version']);
  });

  // A roving stop writes tabIndex in script, where the selector's `:not([tabindex="-1"])` never sees it.
  it('drops a control given a negative tabIndex in script', () => {
    const root = dialog('<button data-id="a"></button><button data-id="b"></button>');
    root.querySelector<HTMLElement>('[data-id="a"]')!.tabIndex = -1;
    expect(stops(root)).toEqual(['b']);
  });

  it('leaves ordinary controls and a details summary alone', () => {
    const root = dialog(`
      <button data-id="btn"></button>
      <details><summary data-id="fold"></summary></details>
      <input type="checkbox" data-id="check">
      <select data-id="pick"></select>
    `);
    expect(stops(root)).toEqual(['btn', 'fold', 'check', 'pick']);
  });

  // A radio with no name is not in a group, so nothing else can take its stop.
  it('treats an ungrouped radio as its own stop', () => {
    const root = dialog('<input type="radio" data-id="lonely">');
    expect(stops(root)).toEqual(['lonely']);
  });
});
