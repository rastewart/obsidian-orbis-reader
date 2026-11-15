// What focus mode hides of Obsidian's own chrome, per platform.
//
// A phone or tablet hands the book the whole screen: every tab row and this pane's view header go. A desktop hides
// the Orbis toolbar and nothing of Obsidian's, so a book in focus mode can be left for another tab
// and Obsidian's ← →, breadcrumb and ⋯ menu keep working above it.

import { Platform } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FocusMode, type FocusModeHost } from '../reader/FocusMode';
import { augmentDom } from './dom-augment';

augmentDom();
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
// Obsidian's `hide` is a display flip; the value goes through a parameter, as `FocusMode.setImportant` does it.
const setDisplay = (el: HTMLElement, value: string) => el.style.setProperty('display', value);
proto.hide ??= function hide(this: HTMLElement) {
  setDisplay(this, 'none');
};
proto.show ??= function show(this: HTMLElement) {
  this.style.removeProperty('display');
};
proto.setCssStyles ??= function setCssStyles(this: HTMLElement, styles: Record<string, string>) {
  Object.assign(this.style, styles);
};
const g = globalThis as unknown as Record<string, unknown>;
g.activeDocument = document;
g.activeWindow = window;

const platform = Platform as unknown as { isMobile?: boolean };

/** A leaf as Obsidian builds one — its view header above the view's content — with a row of tabs elsewhere. */
function setup() {
  document.body.replaceChildren();
  const tabs = document.body.createDiv({ cls: 'workspace-tab-header-container' });
  const leaf = document.body.createDiv({ cls: 'workspace-leaf' });
  const containerEl = leaf.createDiv({ cls: 'workspace-leaf-content' });
  const viewHeader = containerEl.createDiv({ cls: 'view-header' });
  const contentEl = containerEl.createDiv({ cls: 'view-content' });
  const toolbarEl = contentEl.createDiv({ cls: 'orbis-toolbar' });
  const hostEl = contentEl.createDiv({ cls: 'orbis-host' });
  const host = {
    containerEl,
    contentEl,
    hostEl,
    filterWrapperEl: null,
    historyNavEl: null,
    highlightDrawerRow: null,
    toolbarEl,
    foliateRenderer: null,
    focusBtn: null,
    showProgressIndicator: false,
    formatLocLabel: () => '',
    cycleProgressMode: () => undefined,
    clearActiveSelectionAndAnnotationUI: () => undefined,
    onFocusModeChanged: () => undefined,
    listeningControlsLocked: () => false,
    setNativeNavBar: () => undefined,
    debug: () => undefined,
    releaseMobileHeightLock: () => undefined,
  } as unknown as FocusModeHost;
  return { focus: new FocusMode(host), tabs, viewHeader, contentEl, toolbarEl };
}

const hidden = (el: HTMLElement) => el.style.display === 'none';

describe('focus mode on a desktop', () => {
  beforeEach(() => {
    platform.isMobile = false;
  });

  it('hides the Orbis toolbar and none of Obsidian’s chrome', () => {
    const { focus, tabs, viewHeader, toolbarEl } = setup();
    focus.toggle();
    expect(hidden(toolbarEl)).toBe(true);
    expect(hidden(tabs)).toBe(false);
    expect(hidden(viewHeader)).toBe(false);
  });

  it('stays in its pane below the view header, and leaves it on exit', () => {
    const { focus, contentEl, toolbarEl } = setup();
    focus.toggle();
    expect(contentEl.hasClass('orbis-focus-in-pane')).toBe(true);
    focus.toggle();
    expect(contentEl.hasClass('orbis-focus-in-pane')).toBe(false);
    expect(contentEl.hasClass('orbis-focus-mode')).toBe(false);
    expect(hidden(toolbarEl)).toBe(false);
  });
});

describe('focus mode on a phone or tablet', () => {
  beforeEach(() => {
    platform.isMobile = true;
  });
  afterEach(() => {
    platform.isMobile = false;
  });

  it('takes the whole screen: the tabs and the view header go too, and come back on exit', () => {
    const { focus, tabs, viewHeader, contentEl } = setup();
    focus.toggle();
    expect(hidden(tabs)).toBe(true);
    expect(hidden(viewHeader)).toBe(true);
    expect(contentEl.hasClass('orbis-focus-in-pane')).toBe(false);
    focus.toggle();
    expect(hidden(tabs)).toBe(false);
    expect(hidden(viewHeader)).toBe(false);
  });
});

/**
 * What focus mode puts back on the elements above the book when it exits. It overrides a `transform` there, which
 * would trap the full-screen book; it used to restore each one's whole `style` as it was on entry.
 */
describe('focus mode exit, above the book', () => {
  beforeEach(() => {
    platform.isMobile = true;
  });
  afterEach(() => {
    platform.isMobile = false;
  });

  /** Obsidian's drawer slides the workspace with an inline transform; the value goes through a parameter, as above. */
  const slide = (el: HTMLElement, value: string) => el.style.setProperty('transform', value);

  /** The workspace as a phone's drawer leaves it, mid-slide, wrapped around the leaf. `.workspace-split` is the
   *  element a phone's log named: `workspace-split.transform: left (rewritten)`. */
  function slid() {
    const parts = setup();
    const leaf = document.querySelector<HTMLElement>('.workspace-leaf');
    const workspace = document.body.createDiv({ cls: 'workspace-split' });
    if (leaf) workspace.appendChild(leaf);
    slide(workspace, 'translateX(300px)');
    return { ...parts, workspace };
  }

  it('does not put back a slide Obsidian finished while the book was in focus mode', () => {
    // Read in Orbis Reader from the Files drawer: the book enters focus mode while the drawer is still closing.
    const { focus, workspace } = slid();
    focus.toggle();
    expect(workspace.style.getPropertyValue('transform')).toBe('none');
    slide(workspace, ''); // the drawer finishes closing — an empty value removes the declaration, ours included
    focus.toggle();
    expect(workspace.style.getPropertyValue('transform')).toBe('');
  });

  it('puts back what was there when nothing else touched it', () => {
    const { focus, workspace } = slid();
    focus.toggle();
    focus.toggle();
    expect(workspace.style.getPropertyValue('transform')).toBe('translateX(300px)');
  });
});
