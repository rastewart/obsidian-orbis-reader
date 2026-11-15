import { describe, expect, it } from 'vitest';
import { nextStop, ownStops, type RowStops } from '../reader/toolbar-keys';

const el = (name: string): HTMLElement => {
  const b = document.createElement('button');
  b.textContent = name;
  return b;
};

// The main toolbar, the Display style tabs with Spacing open, and the Spacing tab's controls.
const contents = el('contents');
const bookmark = el('bookmark');
const display = el('display style');
const focus = el('focus mode');
const theme = el('theme');
const spacing = el('spacing');
const font = el('font');
const margins = el('margins');
const align = el('alignment');
const rows: RowStops[] = [
  { stops: [contents, bookmark, display, focus] },
  { stops: [theme, spacing, font], entry: spacing, opener: display },
  { stops: [margins, align] },
];

describe('moving along a row', () => {
  it('steps left and right, wrapping at the ends', () => {
    expect(nextStop(rows, bookmark, 'right')).toBe(display);
    expect(nextStop(rows, bookmark, 'left')).toBe(contents);
    expect(nextStop(rows, focus, 'right')).toBe(contents);
    expect(nextStop(rows, contents, 'left')).toBe(focus);
  });

  it('goes to the ends with Home and End', () => {
    expect(nextStop(rows, display, 'home')).toBe(contents);
    expect(nextStop(rows, display, 'end')).toBe(focus);
  });
});

describe('moving between rows', () => {
  // Down lands on the open tab, not the first one; up from the tabs lands on the button that opened them.
  it('goes down to the open tab, and up to the button that opened the row', () => {
    expect(nextStop(rows, bookmark, 'down')).toBe(spacing);
    expect(nextStop(rows, font, 'up')).toBe(display);
  });

  it('goes down to a row with no starting point at its first control, and up to the row above’s', () => {
    expect(nextStop(rows, font, 'down')).toBe(margins);
    expect(nextStop(rows, align, 'up')).toBe(spacing);
  });

  it('goes nowhere above the top row or below the bottom one', () => {
    expect(nextStop(rows, contents, 'up')).toBeNull();
    expect(nextStop(rows, margins, 'down')).toBeNull();
  });

  it('knows nothing of a control outside the rows', () => {
    expect(nextStop(rows, el('stray'), 'right')).toBeNull();
  });
});

// The real shape: the Display style tabs are built inside the main toolbar's element.
describe('a row nested inside another', () => {
  it('belongs to itself alone, so moving down from a tab starts from the tab row', () => {
    const toolbar = document.createElement('div');
    const bookmarkBtn = toolbar.appendChild(el('bookmark'));
    const tabs = toolbar.appendChild(document.createElement('div'));
    const spacingTab = tabs.appendChild(el('spacing'));
    const drawer = document.createElement('div');
    const marginsField = drawer.appendChild(el('margins'));
    const [mainOwn, tabsOwn, drawerOwn] = ownStops([
      { el: toolbar, stops: [bookmarkBtn, spacingTab] },
      { el: tabs, stops: [spacingTab] },
      { el: drawer, stops: [marginsField] },
    ]);
    expect(mainOwn).toEqual([bookmarkBtn]);
    expect(tabsOwn).toEqual([spacingTab]);
    const rows = [{ stops: mainOwn }, { stops: tabsOwn }, { stops: drawerOwn }];
    expect(nextStop(rows, spacingTab, 'down')).toBe(marginsField);
    expect(nextStop(rows, spacingTab, 'up')).toBe(bookmarkBtn);
  });
});
