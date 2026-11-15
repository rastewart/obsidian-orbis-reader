import { beforeAll, describe, expect, it } from 'vitest';
import { setSvgIcon, setTintedSvgIcon } from '../ui-utils';
import { augmentDom } from './dom-augment';

/**
 * Icons are parsed from markup and placed in Obsidian's own window, where an event handler would run with everything
 * the plugin can do. Most icons are constants; two are tinted with a mark's color, and a mark's color is read from a
 * `.orbis` file or a synced preset — a value someone else may have written.
 */
beforeAll(() => augmentDom());

const PEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 20h9"/><path data-tint d="M16.5 3.5 7 19l-4 1 1-4Z"/></svg>';

/** A color written to break out of a `fill="…"` attribute and add an element that runs code. */
const HOSTILE = 'red"/><image href="x" onerror="globalThis.__orbisRan = true"/><path d="';

function handlersIn(el: Element): string[] {
  return Array.from(el.querySelectorAll('*')).flatMap((node) =>
    Array.from(node.attributes)
      .map((a) => a.name)
      .filter((name) => name.toLowerCase().startsWith('on'))
  );
}

describe('setTintedSvgIcon', () => {
  it('paints the tinted shapes with the color', () => {
    const el = document.createElement('span');
    setTintedSvgIcon(el, PEN, '#FFEB3B');
    const tinted = el.querySelectorAll('[data-tint]');
    expect(tinted).toHaveLength(1);
    expect(tinted[0].getAttribute('fill')).toBe('#FFEB3B');
    expect(el.querySelector('path:not([data-tint])')?.hasAttribute('fill')).toBe(false);
  });

  it('keeps a hostile color a fill value: no new element, no handler', () => {
    const el = document.createElement('span');
    setTintedSvgIcon(el, PEN, HOSTILE);
    expect(el.querySelector('image')).toBeNull();
    expect(el.querySelectorAll('path')).toHaveLength(2);
    expect(handlersIn(el)).toEqual([]);
    expect(el.querySelector('[data-tint]')?.getAttribute('fill')).toBe(HOSTILE);
  });
});

describe('setSvgIcon', () => {
  it('drops event handlers, scripts and javascript: links from the markup it is given', () => {
    const el = document.createElement('span');
    setSvgIcon(
      el,
      '<svg onload="x()"><script>x()</script><foreignObject><div onclick="x()"></div></foreignObject>' +
        '<a href=" javascript:x()"><path d="M0 0" onmouseover="x()"/></a><image href="x" onerror="x()"/></svg>'
    );
    expect(el.querySelector('svg')).not.toBeNull();
    expect(handlersIn(el)).toEqual([]);
    expect(el.querySelector('svg')?.hasAttribute('onload')).toBe(false);
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('foreignObject')).toBeNull();
    expect(el.querySelector('a')?.hasAttribute('href')).toBe(false);
  });

  it('leaves an ordinary icon as it was', () => {
    const el = document.createElement('span');
    setSvgIcon(el, PEN);
    expect(el.querySelectorAll('path')).toHaveLength(2);
    expect(el.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
  });
});
