import { beforeEach, describe, expect, it } from 'vitest';
import { barOwnsKey, isDeleteKey } from '../reader/bar-keys';

/**
 * The annotation bar as the reader builds it: the bar itself is the focus target, with its buttons inside.
 *
 * Plain `document.createElement` because `createDiv()` is one of Obsidian's DOM augmentations and does not exist
 * under jsdom — the same reason the settings-row test builds its rows this way.
 */
function bar(): { root: HTMLElement; button: HTMLElement } {
  const root = document.createElement('div');
  root.id = 'orbis-picker';
  root.tabIndex = -1;
  const button = document.createElement('button');
  root.appendChild(button);
  document.body.appendChild(root);
  return { root, button };
}

describe('barOwnsKey', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  // Nothing to do with the bar: the reader keeps every key it has, including out on the reading host.
  it('claims nothing outside the bar', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    expect(barOwnsKey(host, 'Tab', false)).toBe(false);
    expect(barOwnsKey(host, 'ArrowRight', false)).toBe(false);
    expect(barOwnsKey(null, 'Tab', false)).toBe(false);
  });

  /**
   * A keystroke whose target is the document, not an element — what a key forwarded out of the book's frame carries.
   * A document has no `closest`, and calling it threw, so the reading keys stopped dead for that press.
   */
  it('claims nothing, and does not throw, when the target is not an element', () => {
    expect(barOwnsKey(document, 'ArrowRight', false)).toBe(false);
    expect(barOwnsKey(window, 'Tab', false)).toBe(false);
  });

  /**
   * Tab is how a reader gets into the toolbar, so it is the bar's from the bar itself as well as from its buttons.
   *
   * With Tab left to the reader, `seedLink` would move focus to a link inside the book and swallow the press, so the
   * marks bar and the look-up bar could not be reached from the keyboard at all.
   */
  it('claims Tab from the bar and from its controls', () => {
    const { root, button } = bar();
    expect(barOwnsKey(root, 'Tab', false)).toBe(true);
    expect(barOwnsKey(button, 'Tab', false)).toBe(true);
    // Backwards too, or Shift+Tab walks out of a bar that is still open.
    expect(barOwnsKey(button, 'Tab', true)).toBe(true);
  });

  /**
   * The bar as a whole keeps only Tab: while it stands there unentered, an arrow still lets go of the selection and
   * takes the bar with it — the answer `turnPageFor` documents, and the one a reader who has just selected expects.
   */
  it('leaves the reading keys alone while the bar itself has focus', () => {
    const { root } = bar();
    expect(barOwnsKey(root, 'ArrowRight', false)).toBe(false);
    expect(barOwnsKey(root, ' ', false)).toBe(false);
    expect(barOwnsKey(root, 'Escape', false)).toBe(false);
  });

  /**
   * A control inside it is a different matter: an arrow along the marks must reach the mark walk and not the page-turn
   * handler as well, or a single press clears the selection the bar was raised on, or turns the page behind it.
   */
  it("claims a control's own keys once focus is inside the bar", () => {
    const { button } = bar();
    expect(barOwnsKey(button, 'ArrowRight', false)).toBe(true);
    expect(barOwnsKey(button, 'ArrowLeft', false)).toBe(true);
    expect(barOwnsKey(button, ' ', false)).toBe(true);
    expect(barOwnsKey(button, 'Enter', false)).toBe(true);
  });

  // Shift+arrow belongs to the selection wherever it is pressed — trimming what you selected is done with the bar up.
  it('leaves Shift+arrow to the selection, from a control as well as from the bar', () => {
    const { root, button } = bar();
    expect(barOwnsKey(button, 'ArrowRight', true)).toBe(false);
    expect(barOwnsKey(root, 'ArrowRight', true)).toBe(false);
  });
});

describe('isDeleteKey', () => {
  const press = (
    key: string,
    target: EventTarget | null,
    mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}
  ) => ({
    key,
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  it('takes both keys, since the Mac delete key sends Backspace', () => {
    const { button } = bar();
    expect(isDeleteKey(press('Backspace', button))).toBe(true);
    expect(isDeleteKey(press('Delete', button))).toBe(true);
    expect(isDeleteKey(press('x', button))).toBe(false);
  });

  it('takes a key forwarded out of the book, whose target is the document', () => {
    expect(isDeleteKey(press('Delete', document))).toBe(true);
  });

  it('leaves a text field its editing keys', () => {
    // The note editor's Backspace takes a character, never the note.
    for (const tag of ['textarea', 'input']) {
      const field = document.createElement(tag);
      expect(isDeleteKey(press('Backspace', field))).toBe(false);
      expect(isDeleteKey(press('Delete', field))).toBe(false);
    }
  });

  it('is the bare key only', () => {
    const { button } = bar();
    expect(isDeleteKey(press('Backspace', button, { metaKey: true }))).toBe(false);
    expect(isDeleteKey(press('Backspace', button, { ctrlKey: true }))).toBe(false);
    expect(isDeleteKey(press('Delete', button, { altKey: true }))).toBe(false);
    expect(isDeleteKey(press('Delete', button, { shiftKey: true }))).toBe(false);
  });
});
