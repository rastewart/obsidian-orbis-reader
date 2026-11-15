import { describe, expect, it } from 'vitest';
import { applyTooltipGap, disabledTooltipPlacement } from '../tooltip-gap';

const reader = () => {
  const view = document.createElement('div');
  view.className = 'workspace-leaf-content';
  view.dataset.type = 'orbis-reader';
  const btn = view.appendChild(document.createElement('button'));
  btn.setAttribute('aria-label', 'Display style');
  const icon = btn.appendChild(document.createElement('span'));
  return { btn, icon };
};

describe('applyTooltipGap', () => {
  it('gives an Orbis control the gap, found from whatever inside it the pointer is over', () => {
    const { btn, icon } = reader();
    applyTooltipGap(icon, 30);
    expect(btn.getAttribute('data-tooltip-gap')).toBe('30');
  });

  // Left at Obsidian's own gap, Orbis must look exactly like Obsidian.
  it('removes the gap at Obsidian’s own distance', () => {
    const { btn } = reader();
    applyTooltipGap(btn, 30);
    applyTooltipGap(btn, 8);
    expect(btn.hasAttribute('data-tooltip-gap')).toBe(false);
  });

  it('leaves Obsidian’s own controls alone', () => {
    const ribbon = document.createElement('button');
    ribbon.setAttribute('aria-label', 'Open graph view');
    applyTooltipGap(ribbon, 30);
    expect(ribbon.hasAttribute('data-tooltip-gap')).toBe(false);
  });
});

// The first hover of a control used to come too late: the gap goes on the whole surface as the pointer enters it.
describe('the whole surface at once', () => {
  it('gives every labeled control in the surface the gap, not only the one under the pointer', () => {
    const { btn } = reader();
    const other = btn.parentElement!.appendChild(document.createElement('button'));
    other.setAttribute('aria-label', 'Focus mode');
    applyTooltipGap(btn.parentElement, 30);
    expect(btn.getAttribute('data-tooltip-gap')).toBe('30');
    expect(other.getAttribute('data-tooltip-gap')).toBe('30');
  });
});

// A pointer hangs down and to the right, so only a tooltip below or to the right can be under it.
describe('a tooltip placed where the pointer cannot reach', () => {
  it('keeps Obsidian’s gap to the left and above, and takes the reader’s below and to the right', () => {
    const { btn } = reader();
    const at = (position: string) => {
      const el = btn.parentElement!.appendChild(document.createElement('button'));
      el.setAttribute('aria-label', position);
      el.setAttribute('data-tooltip-position', position);
      return el;
    };
    const [left, top, bottom, right] = ['left', 'top', 'bottom', 'right'].map(at);
    applyTooltipGap(btn, 30);
    expect(left.hasAttribute('data-tooltip-gap')).toBe(false);
    expect(top.hasAttribute('data-tooltip-gap')).toBe(false);
    expect(bottom.getAttribute('data-tooltip-gap')).toBe('30');
    expect(right.getAttribute('data-tooltip-gap')).toBe('30');
  });
});

// A disabled control's pointer is the "not allowed" one, whose badge covers a tooltip placed below.
describe('a disabled control’s tooltip', () => {
  it('goes above where there is room, else left where it fits, else below', () => {
    expect(disabledTooltipPlacement({ top: 200, left: 10 }, 'Move up')).toBe('top');
    expect(disabledTooltipPlacement({ top: 10, left: 400 }, 'Move up')).toBe('left');
    // At a window's left edge: nothing keeps a left tooltip on screen, so it stays below.
    expect(disabledTooltipPlacement({ top: 10, left: 20 }, 'Move up')).toBeNull();
  });

  it('needs room for a long label on the left', () => {
    const label = 'Select another live voice to delete this one';
    expect(disabledTooltipPlacement({ top: 10, left: 120 }, label)).toBeNull();
    expect(disabledTooltipPlacement({ top: 10, left: 400 }, label)).toBe('left');
  });

  const at = (el: Element, top: number, left: number) => {
    el.getBoundingClientRect = () => ({ top, left, bottom: top + 20, right: left + 20 }) as DOMRect;
  };

  it('moves while disabled, comes back when enabled, and keeps the gap off a moved tooltip', () => {
    const { btn } = reader();
    at(btn, 200, 300);
    applyTooltipGap(btn, 30);
    expect(btn.getAttribute('data-tooltip-gap')).toBe('30');
    btn.setAttribute('disabled', '');
    applyTooltipGap(btn, 30);
    expect(btn.getAttribute('data-tooltip-position')).toBe('top');
    expect(btn.hasAttribute('data-tooltip-gap')).toBe(false);
    btn.removeAttribute('disabled');
    applyTooltipGap(btn, 30);
    expect(btn.hasAttribute('data-tooltip-position')).toBe(false);
    expect(btn.getAttribute('data-tooltip-gap')).toBe('30');
  });

  it('leaves a placement the control chose itself', () => {
    const { btn } = reader();
    at(btn, 200, 300);
    btn.setAttribute('disabled', '');
    btn.setAttribute('data-tooltip-position', 'left');
    applyTooltipGap(btn, 30);
    expect(btn.getAttribute('data-tooltip-position')).toBe('left');
  });

  it('counts a control inside a switched-off panel as disabled', () => {
    const { btn } = reader();
    at(btn, 200, 300);
    btn.parentElement!.classList.add('is-disabled');
    applyTooltipGap(btn, 30);
    expect(btn.getAttribute('data-tooltip-position')).toBe('top');
  });
});
