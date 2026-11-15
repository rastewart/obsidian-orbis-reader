import { describe, expect, it } from 'vitest';
import { DEFAULT_DEVICE_SETTINGS } from '../device-settings';
import en from '../i18n/en';
import {
  asSkipSeconds,
  buildBookCss,
  DEFAULT_NOTE_STYLE_CONFIG,
  DEFAULT_PLUGIN_SETTINGS,
  type DisplaySettings,
  SKIP_SECONDS_OPTIONS,
} from '../settings';

const base: DisplaySettings = {
  theme: 'light',
  fontSize: 100,
  fontFamily: 'default',
  columns: 1,
  flow: 'paginated',
  brightness: 100,
  margins: 3,
  lineHeight: 1.5,
  textAlign: 'book',
};
// Which theme gives which colors is `reader-themes.test.ts`; here the colors are given.
const light = { bg: '#ffffff', fg: '#000000' };

describe('buildBookCss — theme colors', () => {
  it('paints the page in the colors it is given', () => {
    const css = buildBookCss(base, { bg: '#16213a', fg: '#cfd6e2' });
    expect(css).toContain('html, body { background: #16213a !important; color: #cfd6e2 !important; }');
  });

  it('colors links, and visited links, only when the theme names a color for them', () => {
    const css = buildBookCss(base, { ...light, link: '#7bb3f0', visited: '#a78bda' });
    expect(css).toContain('a { color: #7bb3f0 !important; }');
    expect(css).toContain('a:visited { color: #a78bda !important; }');
    expect(buildBookCss(base, light)).not.toMatch(/(^|\n)a[ :]/);
  });
});

describe('buildBookCss — typography', () => {
  it('includes font-size percentage', () => {
    expect(buildBookCss({ ...base, fontSize: 120 }, light)).toContain('font-size: 120%');
  });

  it('includes line-height value', () => {
    expect(buildBookCss({ ...base, lineHeight: 1.8 }, light)).toContain('line-height: 1.8');
  });

  it('aligns body text only — never every paragraph, which flattened centered ones', () => {
    const css = buildBookCss({ ...base, textAlign: 'justify' }, light);
    expect(css).toContain('.orbis-body-text { text-align: justify !important; }');
    expect(css).not.toMatch(/(^|\n)p \{ text-align/);
    expect(buildBookCss({ ...base, textAlign: 'left' }, light)).toContain(
      '.orbis-body-text { text-align: left !important; }'
    );
  });

  it('leaves alignment to the book when following the book', () => {
    expect(buildBookCss({ ...base, textAlign: 'book' }, light)).not.toContain('text-align');
  });

  it('puts line spacing on body text, where a book paragraph rule would otherwise win', () => {
    expect(buildBookCss({ ...base, lineHeight: 1.8 }, light)).toContain(
      '.orbis-body-text { line-height: 1.8 !important; }'
    );
  });

  it('carries a chosen font into body text and its spans, but not into code or the book’s special fonts', () => {
    const css = buildBookCss(base, light, 'Georgia, serif');
    expect(css).toContain('.orbis-body-text, .orbis-body-text :not(code, kbd, samp, tt, pre, .orbis-keep-font)');
    expect(buildBookCss(base, light)).not.toContain('.orbis-body-text, ');
  });

  it('injects custom font-family when resolvedFont is provided', () => {
    expect(buildBookCss(base, light, 'Georgia, serif')).toContain('font-family: Georgia, serif');
  });

  it('omits font-family rule when resolvedFont is empty', () => {
    expect(buildBookCss(base, light, '')).not.toContain('font-family');
  });
});

describe('DEFAULT_PLUGIN_SETTINGS', () => {
  it('defaults progress mode to book-percent', () => {
    // In the device store: which readout the chip shows is a fact about a screen — see `device-settings.ts`.
    expect(DEFAULT_DEVICE_SETTINGS.progressMode).toBe('book-percent');
  });

  it('does not hold what belongs to a device', () => {
    // These live in vault-scoped device storage so that `data.json` is exactly the set that travels — see
    // `device-settings.ts`. Their defaults are asserted there.
    const held = DEFAULT_PLUGIN_SETTINGS as unknown as Record<string, unknown>;
    for (const key of ['linkPreviewEnabled', 'ttsRate', 'skipBackSeconds', 'showTocButton', 'playbackSource'])
      expect(held[key]).toBeUndefined();
  });

  it('has per-chapter book export enabled by default', () => {
    expect(DEFAULT_PLUGIN_SETTINGS.bookExport.perChapter).toBe(true);
  });
});

describe('DEFAULT_NOTE_STYLE_CONFIG', () => {
  it('sectionOrder includes all three annotation types', () => {
    const { sectionOrder } = DEFAULT_NOTE_STYLE_CONFIG;
    expect(sectionOrder).toContain('bookmarks');
    expect(sectionOrder).toContain('highlights');
    expect(sectionOrder).toContain('notes');
  });

  it('includes highlights and bookmarks and notes by default', () => {
    expect(DEFAULT_NOTE_STYLE_CONFIG.includeBookmarks).toBe(true);
    expect(DEFAULT_NOTE_STYLE_CONFIG.includeHighlights).toBe(true);
    expect(DEFAULT_NOTE_STYLE_CONFIG.includeNotes).toBe(true);
  });
});

describe('canonical settings fingerprint', () => {
  // Mirrors main.ts's canonicalJson: object keys sorted so two devices writing the same settings in
  // a different key order aren't read as a foreign edit.
  const canonicalJson = (value: unknown): string =>
    JSON.stringify(value, (_k, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
        : v
    );

  it('is insensitive to top-level key order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('is insensitive to nested key order', () => {
    expect(canonicalJson({ x: { q: 1, p: 2 } })).toBe(canonicalJson({ x: { p: 2, q: 1 } }));
  });

  it('preserves array order — reordering lookup sections IS a real change', () => {
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it('detects a changed value', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });

  it('detects an added or removed key', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 1, b: 2 }));
  });

  it('treats a dropped undefined field as equal to its absence (JSON round-trip parity)', () => {
    // saveData → loadData drops undefined, so the fingerprint must not flag our own write.
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('is stable across repeated calls', () => {
    const v = { z: [1, { b: 2, a: 3 }], y: 'x' };
    expect(canonicalJson(v)).toBe(canonicalJson(v));
  });
});

describe('asSkipSeconds', () => {
  it('accepts every offered value', () => {
    for (const n of SKIP_SECONDS_OPTIONS) expect(asSkipSeconds(n)).toBe(n);
  });

  it('accepts the string form a <select> hands back', () => {
    expect(asSkipSeconds('45')).toBe(45);
    expect(asSkipSeconds('5')).toBe(5);
  });

  it('falls back to 15 for a value that is not offered', () => {
    // 15 is the default, so it is the safe fallback.
    expect(asSkipSeconds(20)).toBe(15);
    expect(asSkipSeconds(0)).toBe(15);
    expect(asSkipSeconds(-30)).toBe(15);
    expect(asSkipSeconds(999)).toBe(15);
  });

  it('falls back to 15 for junk', () => {
    expect(asSkipSeconds(undefined)).toBe(15);
    expect(asSkipSeconds(null)).toBe(15);
    expect(asSkipSeconds('')).toBe(15);
    expect(asSkipSeconds('abc')).toBe(15);
    expect(asSkipSeconds({})).toBe(15);
    expect(asSkipSeconds(Number.NaN)).toBe(15);
  });

  it('does not accept a value that merely starts with a valid number', () => {
    // parseInt('15abc') would be 15; the whole value has to be one of the options.
    expect(asSkipSeconds('15abc')).toBe(15); // parses to 15, which IS offered — fine
    expect(asSkipSeconds('45min')).toBe(45); // documented consequence of parseInt
  });

  it('offers a sensible ascending ladder', () => {
    expect([...SKIP_SECONDS_OPTIONS]).toEqual([5, 10, 15, 30, 45, 60]);
    expect(SKIP_SECONDS_OPTIONS.includes(15)).toBe(true); // the default stays available
  });

  it('is idempotent', () => {
    expect(asSkipSeconds(asSkipSeconds('30'))).toBe(30);
  });
});

/**
 * The settings tree is a tree of pages, and Obsidian navigates it by path.
 *
 * "Page names must be unique among their siblings at the same depth, or path-based navigation will misbehave" —
 * so two pages sharing a name is not a cosmetic duplicate, it is a navigation bug that only shows up when
 * someone opens the second one. Asserted over the locale because that is where the names live; extend the list
 * as pages are added, and add a sibling group per sub-page level. See docs/design/settings.md.
 */
describe('settings page names', () => {
  // Listed in the order they appear on the start page, so the test doubles as a record of it.
  const topLevel = [
    'settings_pages.setup',
    'settings_pages.display_styles',
    'settings_pages.reading',
    'settings_pages.listening',
    'settings_pages.annotations',
    'settings_pages.lookup',
    'settings_pages.library',
    'settings_pages.sources',
    'settings_pages.conversions',
    'settings_pages.devices',
  ] as const;

  /**
   * The two pages that have children of their own. Siblings, not cousins: the rule is uniqueness at one depth,
   * which is what lets "Save as PDF" sit under Conversions while "Save annotations as PDF" sits under
   * Annotations — two pages, two settings, one shared byline between them.
   */
  const annotations = [
    'presets.manage',
    'reading_records_page.heading',
    'notes_styles_page.heading',
    'annotations_pdf_page.heading',
  ] as const;
  const conversions = [
    'save_as_markdown_page.heading',
    'save_as_pdf_page.heading',
    'save_as_epub_page.heading',
  ] as const;

  it('names every page', () => {
    const missing = [...topLevel, ...annotations, ...conversions].filter((key) => !(en[key] ?? '').trim());
    expect(missing).toEqual([]);
  });

  it('gives no two siblings the same name', () => {
    for (const group of [topLevel, annotations, conversions]) {
      const names = group.map((key) => en[key]);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
