// **On iOS, `focus()` on a `<select>` OPENS it.** Every dialog here redraws itself when a control changes and then
// puts the keyboard back where it was — so a dropdown that redraws its own dialog would reopen its own picker, and only
// on iOS: pick a preset in the Annotations dialog, or a treatment in the mark editor, and the wheel would slide away
// and straight back with a tick beside the choice, needing a second dismissal. The open picker IS the focus state on
// iOS, where elsewhere focus is a ring and nothing more.
//
// The guard lives with the RESTORE rather than with the dropdowns, because there are some sixty dropdowns, three
// quarters of them Obsidian's own — and not one of them is what calls `focus()`.

import { Platform } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rebuildKeepingFocus } from '../ui-utils';

/**
 * The three facilities the restore reads that jsdom does not provide: `instanceOf` is installed by the plugin's
 * runtime, `win` by Obsidian's DOM augmentation, and `offsetParent` is always null in jsdom — which would make every
 * element read as hidden and send the restore down its "not found" path for a reason that has nothing to do with the
 * rule under test.
 */
beforeEach(() => {
  const proto = HTMLElement.prototype as unknown as { instanceOf: (t: unknown) => boolean };
  proto.instanceOf = function (t: unknown) {
    return this instanceof (t as new () => unknown);
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'win', {
    configurable: true,
    get(this: HTMLElement) {
      return this.ownerDocument.defaultView;
    },
  });
});

afterEach(() => {
  (Platform as unknown as { isIosApp?: boolean }).isIosApp = undefined;
  document.body.replaceChildren();
});

const onIos = (yes: boolean): void => {
  (Platform as unknown as { isIosApp?: boolean }).isIosApp = yes;
};

/**
 * A dialog that redraws on change: `build` lays the same markup down twice, so the control the reader tapped is gone
 * and an identical one stands where it stood. That is the condition the restore exists for, and the condition in
 * which the picker would reopen.
 */
const dialog = (tags: string[]): { root: HTMLElement; build: () => void } => {
  const root = document.createElement('div');
  document.body.append(root);
  const build = (): void => {
    root.replaceChildren();
    for (const tag of tags) {
      const el = document.createElement(tag);
      if (tag === 'select') el.append(document.createElement('option'));
      root.append(el);
    }
  };
  build();
  return { root, build };
};

describe('restoring focus onto a dropdown', () => {
  it('does not put focus back on a select on iOS — that would reopen the picker', () => {
    onIos(true);
    const { root, build } = dialog(['select', 'button']);
    root.querySelector('select')?.focus();
    expect(document.activeElement?.tagName).toBe('SELECT');

    rebuildKeepingFocus(root, build);

    // Not the new select — and NOT the button either. The guard has to report the focus as landed, or the restore
    // falls through to "the first control in the surface" and moves the keyboard somewhere the reader never was.
    expect(document.activeElement?.tagName).not.toBe('SELECT');
    expect(document.activeElement?.tagName).not.toBe('BUTTON');
  });

  it('does put focus back on a select everywhere else', () => {
    onIos(false);
    const { root, build } = dialog(['select', 'button']);
    root.querySelector('select')?.focus();

    rebuildKeepingFocus(root, build);

    // The same control by position, not the same object: the one focus was captured from was thrown away.
    expect(document.activeElement).toBe(root.querySelector('select'));
  });

  it('still restores a button on iOS — the rule is about selects, not about touch', () => {
    onIos(true);
    const { root, build } = dialog(['button', 'button']);
    root.querySelectorAll('button')[1]?.focus();

    rebuildKeepingFocus(root, build);

    expect(document.activeElement).toBe(root.querySelectorAll('button')[1]);
  });
});
