// Two-column layout decides one page or two in a CBZ book or a fixed-layout EPUB (ORBIS patch 38). foliate's
// fixed-layout renderer showed a two-page spread whenever the pane was wider than tall, and never read the
// `max-column-count` that Orbis sets from the setting.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type Fxl = HTMLElement & {
  open(book: unknown): void;
  goToSpread(index: number, side: string): Promise<void>;
  next(): Promise<void>;
};

/** Every shadow root made, with its element, so the test can see inside the renderer's closed one. */
const attached = vi.spyOn(Element.prototype, 'attachShadow');
const roots = {
  get: (el: Element): ShadowRoot | undefined => {
    const i = attached.mock.contexts.indexOf(el);
    return i < 0 ? undefined : (attached.mock.results[i]?.value as ShadowRoot);
  },
};

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await import('foliate-js/fixed-layout.js');
});

afterEach(() => {
  document.body.replaceChildren();
});

/** A renderer in a pane `width` × `height`, holding a five-page book, at its second spread (pages 2 and 3). */
async function renderer(width: number, height: number, columns?: string) {
  const el = document.createElement('foliate-fxl') as Fxl;
  el.getBoundingClientRect = () => ({ width, height }) as DOMRect;
  if (columns) el.setAttribute('max-column-count', columns);
  document.body.append(el);
  el.open({
    rendition: { layout: 'pre-paginated' },
    sections: Array.from({ length: 5 }, () => ({ load: () => 'about:blank' })),
  });
  await el.goToSpread(1, 'left');
  return el;
}

/** How many pages are on screen. */
function shown(el: Element): number {
  const pages = Array.from(roots.get(el)?.children ?? []) as HTMLElement[];
  return pages.filter((p) => p.style.display !== 'none').length;
}

describe('pages side by side in a fixed-layout book', () => {
  it('are two in a wide pane, as before, with two columns', async () => {
    expect(shown(await renderer(1200, 600, '2'))).toBe(2);
    expect(shown(await renderer(1200, 600))).toBe(2);
  });

  it('are one in a wide pane with one column', async () => {
    expect(shown(await renderer(1200, 600, '1'))).toBe(1);
  });

  it('are one in a tall pane, as before, either way', async () => {
    expect(shown(await renderer(600, 1200, '2'))).toBe(1);
    expect(shown(await renderer(600, 1200, '1'))).toBe(1);
  });

  it('follow the setting as it changes, without reopening the book', async () => {
    const el = await renderer(1200, 600, '2');
    el.setAttribute('max-column-count', '1');
    expect(shown(el)).toBe(1);
    el.setAttribute('max-column-count', '2');
    expect(shown(el)).toBe(2);
  });

  it('turn to the other page of the spread first, one page at a time', async () => {
    const el = await renderer(1200, 600, '1');
    const visible = () =>
      (Array.from(roots.get(el)?.children ?? []) as HTMLElement[]).findIndex((p) => p.style.display !== 'none');
    expect(visible()).toBe(0);
    await el.next();
    expect(shown(el)).toBe(1);
    expect(visible()).toBe(1);
  });
});
