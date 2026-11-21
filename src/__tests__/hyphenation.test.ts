// Hyphenation's stored value and its dropdown — see src/hyphenation.ts. The CSS it makes is `settings.test.ts`.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { autoHyphenates, HYPHENATION_LABELS, parseHyphenation } from '../hyphenation';
import { displayStyleEntries, readCurrentDisplaySettings, STORAGE_KEY_HYPHENATION } from '../settings';
import { augmentDom } from './dom-augment';

describe('parseHyphenation', () => {
  it('reads the three answers, and anything else as the book’s', () => {
    expect(parseHyphenation('on')).toBe('on');
    expect(parseHyphenation('off')).toBe('off');
    expect(parseHyphenation('book')).toBe('book');
    expect(parseHyphenation(null)).toBe('book');
    expect(parseHyphenation(undefined)).toBe('book');
    expect(parseHyphenation('auto')).toBe('book');
  });

  it('lists the book’s answer first, then On, then Off', () => {
    expect(Object.keys(HYPHENATION_LABELS)).toEqual(['book', 'on', 'off']);
  });
});

describe('hyphenation in display styles', () => {
  it('reads as the book’s from a style saved before the setting existed', () => {
    const style = {
      theme: 'auto',
      fontFamily: 'default',
      fontSize: 100,
      lineHeight: 1.5,
      textAlign: 'book' as const,
      margins: 3,
      brightness: 100,
      flow: 'paginated' as const,
      columns: 2 as const,
    };
    expect(displayStyleEntries(style)).toContainEqual([STORAGE_KEY_HYPHENATION, 'book']);
    expect(displayStyleEntries({ ...style, hyphenation: 'off' })).toContainEqual([STORAGE_KEY_HYPHENATION, 'off']);
  });

  it('is part of this device’s current display values', () => {
    const store = new Map<string, string>([[STORAGE_KEY_HYPHENATION, 'on']]);
    const app = { loadLocalStorage: (k: string) => store.get(k) ?? null } as never;
    expect(readCurrentDisplaySettings(app).hyphenation).toBe('on');
  });
});

describe('autoHyphenates', () => {
  beforeAll(() => augmentDom());
  afterEach(() => vi.restoreAllMocks());

  /** Each probe box measures as tall as `heights` says for its class: the hyphenated one with `is-auto`. */
  const measure = (heights: { plain: number; auto: number }) =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.classList.contains('is-auto') ? heights.auto : heights.plain } as DOMRect;
    });

  it('is true where the hyphenated box breaks the words differently', () => {
    measure({ plain: 110, auto: 90 });
    expect(autoHyphenates(document)).toBe(true);
  });

  it('is false where both boxes break the same, as in Obsidian on Windows', () => {
    measure({ plain: 110, auto: 110 });
    expect(autoHyphenates(document)).toBe(false);
  });

  it('leaves nothing in the document', () => {
    measure({ plain: 1, auto: 1 });
    autoHyphenates(document);
    expect(document.querySelectorAll('.orbis-hyphen-probe')).toHaveLength(0);
  });
});
