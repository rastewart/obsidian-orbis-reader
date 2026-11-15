import { describe, expect, it, vi } from 'vitest';
import { openOnce, openOnRowTap } from '../settings-row-tap';

/**
 * A settings row: the element, plus the control area Obsidian puts its buttons in.
 *
 * Plain `document.createElement`, which the lint rule would rather were `createDiv()` — that is one of Obsidian's
 * augmentations of the DOM and does not exist under jsdom, so a test building its own row has no other option.
 */
function row(): { settingEl: HTMLElement; control: HTMLElement } {
  const settingEl = document.createElement('div');
  const control = document.createElement('div');
  control.className = 'setting-item-control';
  const button = document.createElement('button');
  control.appendChild(button);
  settingEl.appendChild(control);
  document.body.appendChild(settingEl);
  return { settingEl, control: button };
}

const click = (el: HTMLElement): void => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

/**
 * Wait out the one-gesture window between tests.
 *
 * `openOnce` holds a module-level timestamp, deliberately — see there — so two tests clicking inside 50ms of each
 * other are one gesture as far as it is concerned, which is exactly right in a settings page and a trap in a suite.
 */
const nextGesture = (): Promise<unknown> => new Promise((resolve) => window.setTimeout(resolve, 60));

describe('openOnRowTap', () => {
  it('opens the editor when the row is tapped', async () => {
    await nextGesture();
    const open = vi.fn();
    const { settingEl } = row();
    openOnRowTap({ settingEl }, open);
    click(settingEl);
    expect(open).toHaveBeenCalledTimes(1);
  });

  // The control area holds toggles, reorder arrows and the drag handle. A tap meant for one of those must not
  // also open a dialog behind it.
  it('ignores a tap on the row’s own controls', () => {
    const open = vi.fn();
    const { settingEl, control } = row();
    openOnRowTap({ settingEl }, open);
    click(control);
    expect(open).not.toHaveBeenCalled();
  });

  // The bug: Obsidian's declarative settings re-run a row's `render` callback against the SAME element whenever
  // the page refreshes, and every refresh registered another listener. One tap then opened one editor per
  // refresh — stacked, and saving the stale one underneath wrote its old state back over the change.
  it('registers once however many times the row is rendered', async () => {
    await nextGesture();
    const open = vi.fn();
    const { settingEl } = row();
    for (let i = 0; i < 4; i++) openOnRowTap({ settingEl }, open);
    click(settingEl);
    expect(open).toHaveBeenCalledTimes(1);
  });

  // Re-registering is how a row gets a fresh closure over re-rendered state, so the LATEST one has to win —
  // keeping the first would edit whatever the collection looked like when the page first painted.
  it('runs the newest handler, not the one it was first given', async () => {
    await nextGesture();
    const stale = vi.fn();
    const fresh = vi.fn();
    const { settingEl } = row();
    openOnRowTap({ settingEl }, stale);
    openOnRowTap({ settingEl }, fresh);
    click(settingEl);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});

/**
 * A row that opens into itself, and the tap that must not close it again.
 *
 * The dashboards are the case: a dashboard row expands to show its widgets, so every click on a widget — and on the
 * body's own labels and whitespace — bubbles up to the dashboard row's listener. Both were live bugs: opening a widget
 * collapsed the dashboard it sat in, and clicking beside the name field collapsed it for nothing.
 */
describe('openOnRowTap with an expanded body', () => {
  it('ignores a tap inside the row body', async () => {
    await nextGesture();
    const open = vi.fn();
    const { settingEl } = row();
    const body = document.createElement('div');
    body.className = 'orbis-row-body';
    const label = document.createElement('div');
    body.appendChild(label);
    settingEl.appendChild(body);
    openOnRowTap({ settingEl }, open);
    click(label);
    expect(open).not.toHaveBeenCalled();
  });

  it('lets a row inside the body open its own editor', async () => {
    await nextGesture();
    const outer = vi.fn();
    const inner = vi.fn();
    const { settingEl } = row();
    const body = document.createElement('div');
    body.className = 'orbis-row-body';
    const nested = document.createElement('div');
    body.appendChild(nested);
    settingEl.appendChild(body);
    openOnRowTap({ settingEl }, outer);
    openOnRowTap({ settingEl: nested }, inner);
    click(nested);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});

// **A backstop for whatever puts a second listener there.** The per-element guard above stops a row registering
// twice; this stops one gesture opening two editors when something else — a row rendered twice into a container
// nobody cleared, a pencil and a row tap both firing — has produced two callers. Two copies of one editor is the
// shape that loses work: the stale one underneath saves its old state over the change.
describe('openOnce', () => {
  it('opens once however many callers ask within the gesture', async () => {
    await nextGesture();
    const open = vi.fn();
    openOnce(open);
    openOnce(open);
    openOnce(open);
    expect(open).toHaveBeenCalledTimes(1);
  });

  // Two rows both wired to the same click, which is what a page rendered twice produces.
  it('lets one click through when two elements carry a listener', async () => {
    await nextGesture();
    const open = vi.fn();
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.appendChild(inner);
    document.body.appendChild(outer);
    openOnRowTap({ settingEl: outer }, open);
    openOnRowTap({ settingEl: inner }, open);
    click(inner);
    expect(open).toHaveBeenCalledTimes(1);
  });

  // A second, deliberate tap a moment later is a reader asking for the dialog again — swallowing that would be a
  // new bug wearing this one's clothes.
  it('opens again once the gesture is over', async () => {
    await nextGesture();
    const open = vi.fn();
    openOnce(open);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    openOnce(open);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
