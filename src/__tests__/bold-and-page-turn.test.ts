import { describe, expect, it } from 'vitest';
import { boldTextCss, parseBoldText } from '../bold-text';
import { applyPageTurn, parsePageTurn } from '../page-turn';

describe('Bold text', () => {
  it('reads anything but on as off, a style saved before the setting included', () => {
    expect(parseBoldText('on')).toBe('on');
    for (const v of ['off', 'true', '', null, undefined]) expect(parseBoldText(v)).toBe('off');
  });

  it('outlines the text of every element in its own color when on, and adds nothing when off', () => {
    expect(boldTextCss('off')).toBeNull();
    const css = boldTextCss('on') ?? '';
    expect(css).toMatch(/^body, body \* \{/);
    expect(css).toContain('-webkit-text-stroke-width: 0.04em !important');
    expect(css).toContain('-webkit-text-stroke-color: currentColor !important');
  });
});

describe('Page turn', () => {
  it('reads anything but slide as none', () => {
    expect(parsePageTurn('slide')).toBe('slide');
    for (const v of ['none', 'curl', '', null, undefined]) expect(parsePageTurn(v)).toBe('none');
  });

  /** A paginator stand-in, in a window that does or does not ask for less motion. */
  const paginator = (lessMotion: boolean) => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'win', {
      value: { matchMedia: (q: string) => ({ matches: lessMotion && q.includes('reduce') }) },
    });
    return el;
  };

  it('slides in paged mode only, and not where the device asks for less motion', () => {
    const el = paginator(false);
    applyPageTurn(el, 'slide', 'paginated');
    expect(el.hasAttribute('animated')).toBe(true);
    applyPageTurn(el, 'slide', 'scrolled');
    expect(el.hasAttribute('animated')).toBe(false);
    applyPageTurn(el, 'none', 'paginated');
    expect(el.hasAttribute('animated')).toBe(false);
    const still = paginator(true);
    applyPageTurn(still, 'slide', 'paginated');
    expect(still.hasAttribute('animated')).toBe(false);
  });
});
