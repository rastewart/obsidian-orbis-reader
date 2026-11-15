// A book's frame taking focus tells its window it has focus, so Obsidian places the window's menus there; a press in
// it reaches the window while a menu is open, so the menu closes.

import { afterEach, describe, expect, it } from 'vitest';
import { relayFrameFocus, relayFramePress } from '../reader/frame-focus';

const g = globalThis as unknown as { activeWindow: Window };
const before = g.activeWindow;
afterEach(() => {
  g.activeWindow = before;
});

/** A chapter's frame, and the window the book is in, counting the focus events it is sent. */
function bookIn(): { frame: Window; host: Window; focused: () => number } {
  const frame = new EventTarget() as unknown as Window;
  const doc = { defaultView: frame } as unknown as Document;
  const host = new EventTarget() as unknown as Window;
  let count = 0;
  host.addEventListener('focus', () => count++);
  relayFrameFocus(doc, host, () => {});
  return { frame, host, focused: () => count };
}

describe('relayFrameFocus', () => {
  // The window brought forward by a click on its chrome: focus returns to the book's frame, not to the window.
  it('focuses the book’s window when its frame takes focus and Obsidian has another window as active', () => {
    const { frame, focused } = bookIn();
    g.activeWindow = {} as Window;
    frame.dispatchEvent(new Event('focus'));
    expect(focused()).toBe(1);
  });

  // One window — every phone and tablet, and a Mac with no second window — sends nothing.
  it('leaves a window that is already active alone', () => {
    const { frame, host, focused } = bookIn();
    g.activeWindow = host;
    frame.dispatchEvent(new Event('focus'));
    expect(focused()).toBe(0);
  });
});

/** A chapter's document and the view in the window's document, counting the presses the window hears of. */
function pressIn(): { chapter: Document; menuOpen: (open: boolean) => void; pressed: () => number } {
  const chapter = document.implementation.createHTMLDocument('chapter');
  const hostEl = document.body.appendChild(document.createElement('div'));
  Object.defineProperty(hostEl, 'doc', { value: document });
  let count = 0;
  document.addEventListener('mousedown', () => count++);
  relayFramePress(chapter, hostEl, () => {});
  let menu: HTMLElement | null = null;
  const menuOpen = (open: boolean) => {
    menu?.remove();
    menu = open ? document.body.appendChild(document.createElement('div')) : null;
    menu?.classList.add('menu');
  };
  return { chapter, menuOpen, pressed: () => count };
}

describe('relayFramePress', () => {
  // The iPad: a menu with no backdrop, and a press on the book that never reaches the window.
  it('passes a press in the book to the window while a menu is open', () => {
    const { chapter, menuOpen, pressed } = pressIn();
    menuOpen(true);
    chapter.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(pressed()).toBe(1);
    menuOpen(false);
  });

  it('keeps presses in the book to the book when no menu is open', () => {
    const { chapter, pressed } = pressIn();
    chapter.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(pressed()).toBe(0);
  });
});
