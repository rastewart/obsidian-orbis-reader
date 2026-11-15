import { describe, expect, it } from 'vitest';
import { FOCUS_PAGE_MARGIN, setReaderBottomSpace, setReaderTopSpace } from '../reader/top-space';

/**
 * The reservation is arithmetic over two numbers that live in different places — the bar's measured height and
 * the blank Foliate is already leaving — and getting it wrong is invisible on a desktop, because the padding is
 * only ever applied in focus mode on a device. It shipped wrong for exactly that reason: a 56px bar opened 116px
 * of blank above the text, and it took a photograph of a phone to notice.
 */
const barOf = (height: number): HTMLElement => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ height }) as DOMRect;
  return el;
};

describe('setReaderTopSpace', () => {
  it('reserves only what the page is not already leaving', () => {
    const renderer = document.createElement('div');
    // A 56px bar wants 12px of air under it. Foliate's own margin row supplies 28 of that 68, so 40 is left to
    // reserve — NOT 68, which is what the bar cost before the clamp and is the whole of the reported fault.
    setReaderTopSpace(renderer, barOf(56), true);
    expect(renderer.style.paddingTop).toBe(`${56 + 12 - FOCUS_PAGE_MARGIN}px`);
  });

  it('reserves nothing for a bar the page already has room for', () => {
    const renderer = document.createElement('div');
    // Shorter than the margin: the blank is already enough, so pushing the text down at all would be the same
    // double-count in miniature. Clamped at zero rather than going negative, which would pull text UP into the
    // bar — the failure the subtraction could have introduced.
    setReaderTopSpace(renderer, barOf(10), true);
    expect(renderer.style.paddingTop).toBe('0px');
  });

  it('releases the reservation outright when the bar closes', () => {
    const renderer = document.createElement('div');
    setReaderTopSpace(renderer, barOf(56), true);
    setReaderTopSpace(renderer, barOf(56), false);
    // Empty, not `0px`: the property has to leave the element so nothing of focus mode's geometry survives into
    // normal mode, where Foliate's own margin governs.
    expect(renderer.style.paddingTop).toBe('');
  });

  it('errs upward while the bar has no height to measure yet', () => {
    const renderer = document.createElement('div');
    // First frame: the bar exists but has not laid out. Reserving nothing would put it on top of the line being
    // read, so the fallback still errs high — and is clamped by the same margin as everything else.
    setReaderTopSpace(renderer, barOf(0), true);
    expect(renderer.style.paddingTop).toBe(`${96 - FOCUS_PAGE_MARGIN}px`);
  });
});

const rendererIn = (flow: 'paginated' | 'scrolled'): HTMLElement => {
  const el = document.createElement('div');
  el.setAttribute('flow', flow);
  return el;
};

describe('setReaderBottomSpace', () => {
  it('stops scrolled text where a page stops, in focus mode', () => {
    // Foliate's scroller covers its margin rows, so without this the text ran under the progress chip.
    const renderer = rendererIn('scrolled');
    setReaderBottomSpace(renderer, true);
    expect(renderer.style.paddingBottom).toBe(`${FOCUS_PAGE_MARGIN}px`);
  });

  it('adds nothing to a paged book, whose margin row already stops it', () => {
    // Padding here would be the margin paid twice: 28px more blank under every page.
    const renderer = rendererIn('paginated');
    setReaderBottomSpace(renderer, true);
    expect(renderer.style.paddingBottom).toBe('');
  });

  it('follows the flow when it changes inside focus mode', () => {
    const renderer = rendererIn('scrolled');
    setReaderBottomSpace(renderer, true);
    renderer.setAttribute('flow', 'paginated');
    setReaderBottomSpace(renderer, true);
    expect(renderer.style.paddingBottom).toBe('');
  });

  it('leaves nothing behind outside focus mode', () => {
    // Normal mode's indicator is on the toolbar; nothing floats over the bottom of the text there.
    const renderer = rendererIn('scrolled');
    setReaderBottomSpace(renderer, true);
    setReaderBottomSpace(renderer, false);
    expect(renderer.style.paddingBottom).toBe('');
  });
});
