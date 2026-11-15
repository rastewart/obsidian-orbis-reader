// Which themes exist, which a dropdown offers, and what each paints a book with.

import { describe, expect, it } from 'vitest';
import {
  type CustomTheme,
  contrastRatio,
  defaultThemeList,
  dimColor,
  type ListedTheme,
  MATCH_OBSIDIAN_MODE,
  MATCH_OBSIDIAN_THEME,
  PRESET_THEMES,
  paintPageColor,
  resolveThemeId,
  settleThemeList,
  type ThemeSettings,
  themeChoices,
  themeColors,
} from '../reader-themes';

const none: ThemeSettings = { readerThemes: defaultThemeList() };
const mine: CustomTheme = {
  id: 'theme-1',
  offered: true,
  builtin: false,
  name: 'Harbor',
  bg: '#10202a',
  fg: '#e0e8ee',
  link: '#9cc8ee',
};
/** The default list with these changes: entries replaced by id, or added at the end. */
function listWith(...changes: ListedTheme[]): ThemeSettings {
  const list = defaultThemeList().map((entry) => changes.find((c) => c.id === entry.id) ?? entry);
  return { readerThemes: [...list, ...changes.filter((c) => !list.includes(c))] };
}

/** An element in a window whose Obsidian is light or dark, carrying a theme's note colors as Obsidian does. */
function scopeIn(mode: 'light' | 'dark', vars: Record<string, string> = {}): HTMLElement {
  document.body.className = `theme-${mode}`;
  const el = document.createElement('div');
  document.body.append(el);
  for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
  return el;
}
// The canvas that turns any CSS color into hex is the browser's; here a hex color is already one.
const hexOnly = (color: string): string | null => (/^#[0-9a-f]{6}$/i.test(color) ? color : null);

describe('Match Obsidian’s light or dark mode — what Auto always did', () => {
  it('is Orbis’s white page in light mode, links left to the book', () => {
    expect(themeColors(MATCH_OBSIDIAN_MODE, none, scopeIn('light'))).toEqual({ bg: '#ffffff', fg: '#000000' });
  });

  it('is Orbis’s black page in dark mode, with its link colors', () => {
    expect(themeColors(MATCH_OBSIDIAN_MODE, none, scopeIn('dark'))).toEqual({
      bg: '#000000',
      fg: '#ffffff',
      link: '#7bb3f0',
      visited: '#a78bda',
    });
  });

  it('keeps its stored id, so a vault already on Auto reads exactly as before', () => {
    expect(MATCH_OBSIDIAN_MODE).toBe('auto');
  });
});

describe('Match Obsidian’s theme', () => {
  it('takes the note’s background, text and link colors from the theme', () => {
    const scope = scopeIn('dark', {
      '--background-primary': '#1c1c1c',
      '--text-normal': '#dadada',
      '--link-color': '#a68af9',
    });
    expect(themeColors(MATCH_OBSIDIAN_THEME, none, scope, hexOnly)).toEqual({
      bg: '#1c1c1c',
      fg: '#dadada',
      link: '#a68af9',
    });
  });

  it('falls back to the mode’s colors when the theme’s background has no one color — see-through, say', () => {
    const scope = scopeIn('light', { '--background-primary': 'transparent', '--text-normal': '#222222' });
    expect(themeColors(MATCH_OBSIDIAN_THEME, none, scope, hexOnly)).toEqual({ bg: '#ffffff', fg: '#000000' });
  });
});

describe('fixed, provided and made themes', () => {
  it('paints Sepia as it always has, whatever Obsidian’s mode', () => {
    expect(themeColors('sepia', none, scopeIn('dark'))).toEqual({ bg: '#f4ecd8', fg: '#5b4636', link: '#8a4b20' });
  });

  it('paints a provided theme whether or not it is switched on — switched off only leaves the lists', () => {
    expect(themeColors('midnight', none, scopeIn('light'))).toEqual({
      bg: '#16213a',
      fg: '#cfd6e2',
      link: '#8fb8f2',
    });
  });

  it('paints a made theme in its own colors', () => {
    expect(themeColors('theme-1', listWith(mine), scopeIn('light'))).toEqual({
      bg: '#10202a',
      fg: '#e0e8ee',
      link: '#9cc8ee',
    });
  });

  it('falls back to matching Obsidian’s mode for a theme that was deleted', () => {
    expect(resolveThemeId('theme-gone', none)).toBe(MATCH_OBSIDIAN_MODE);
    expect(themeColors('theme-gone', none, scopeIn('light'))).toEqual({ bg: '#ffffff', fg: '#000000' });
  });

  // The Theme manager warns below 4.5 : 1, so no theme Orbis ships may fall below it — Sepia's links once did, at 4.0.
  it.each(['light', 'sepia', 'dark'])('%s clears 4.5 : 1 for text and links', (id) => {
    const { bg, fg, link } = themeColors(id, none, scopeIn('light'));
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(4.5);
    if (link) expect(contrastRatio(bg, link)).toBeGreaterThanOrEqual(4.5);
  });

  // The page's own promise: every provided theme reads comfortably, the fun ones included.
  it.each(PRESET_THEMES.map((p) => [p.id, p] as const))('%s clears 7 : 1 for text and 5 : 1 for links', (_, p) => {
    expect(contrastRatio(p.bg, p.fg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.bg, p.link as string)).toBeGreaterThanOrEqual(5);
  });
});

describe('themeChoices — what a dropdown lists', () => {
  const ids = (s: ThemeSettings, current?: string) => themeChoices(s, current).map((c) => c.id);
  const match = ['auto', 'obsidian'];

  it('lists the two that match Obsidian, then Light, Sepia and Dark, in a new vault', () => {
    expect(ids(none)).toEqual([...match, 'light', 'sepia', 'dark']);
  });

  it('lists the switched-on themes in the list’s order, whoever provided them', () => {
    const s: ThemeSettings = {
      readerThemes: [
        mine,
        { id: 'midnight', offered: true, builtin: true },
        { id: 'light', offered: false, builtin: true },
        { id: 'sepia', offered: true, builtin: true },
        { id: 'dark', offered: false, builtin: true },
        { ...mine, id: 'theme-2', name: 'Off', offered: false },
      ],
    };
    expect(ids(s)).toEqual([...match, 'theme-1', 'midnight', 'sepia']);
  });

  it('keeps the two that match Obsidian when every listed theme is off', () => {
    const allOff = { readerThemes: defaultThemeList().map((e) => ({ ...e, offered: false })) };
    expect(ids(allOff)).toEqual(match);
  });

  it('lists a switched-off theme while it is the one in use, and only then', () => {
    expect(ids(none, 'emerald')).toEqual([...match, 'light', 'sepia', 'dark', 'emerald']);
    const off = listWith({ ...mine, offered: false });
    expect(ids(off, 'theme-1')).toEqual([...match, 'light', 'sepia', 'dark', 'theme-1']);
    expect(ids(off, 'sepia')).toEqual([...match, 'light', 'sepia', 'dark']);
  });
});

describe('settleThemeList — the list as it arrives from data.json or another device', () => {
  const idsOf = (list: ListedTheme[]) => list.map((e) => e.id);

  it('starts a vault with every provided theme, Light, Sepia and Dark on', () => {
    const settled = settleThemeList(undefined);
    expect(idsOf(settled)).toEqual(['light', 'sepia', 'dark', ...PRESET_THEMES.map((p) => p.id)]);
    expect(settled.filter((e) => e.offered).map((e) => e.id)).toEqual(['light', 'sepia', 'dark']);
  });

  it('keeps the reader’s order and switches, and appends a provided theme the list does not have yet', () => {
    const stored: ListedTheme[] = [
      { id: 'dark', offered: false, builtin: true },
      mine,
      { id: 'light', offered: true, builtin: true },
    ];
    const settled = settleThemeList(stored);
    expect(idsOf(settled).slice(0, 4)).toEqual(['dark', 'theme-1', 'light', 'sepia']);
    expect(settled[0].offered).toBe(false);
    expect(settled.find((e) => e.id === 'sepia')?.offered).toBe(true);
    expect(settled.find((e) => e.id === 'plum')?.offered).toBe(false);
  });

  it('drops what it cannot use: a repeat, a provided theme no version has, a made theme without its colors', () => {
    const stored = [
      { id: 'light', offered: true, builtin: true },
      { id: 'light', offered: false, builtin: true },
      { id: 'neon', offered: true, builtin: true },
      { id: 'theme-x', offered: true, builtin: false, name: 'Broken' },
    ] as ListedTheme[];
    const settled = settleThemeList(stored);
    expect(settled.filter((e) => e.id === 'light')).toEqual([{ id: 'light', offered: true, builtin: true }]);
    expect(idsOf(settled)).not.toContain('neon');
    expect(idsOf(settled)).not.toContain('theme-x');
  });
});

describe('the arithmetic', () => {
  it('measures black on white as 21 : 1 and a color on itself as 1 : 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#16213a', '#16213a')).toBeCloseTo(1);
  });

  it('dims a color as `filter: brightness()` would', () => {
    expect(dimColor('#ffffff', 50)).toBe('#808080');
    expect(dimColor('#16213a', 100)).toBe('#16213a');
  });
});

/**
 * The reader chooses the page color. A book's own inline `!important` is the strongest thing it can write, and it
 * is what this replaces; a stylesheet rule, however specific, loses to an inline `!important` in the cascade.
 */
describe('paintPageColor', () => {
  it("puts the theme's color on <html> and <body> as an inline !important, over the book's own", () => {
    const doc = document.implementation.createHTMLDocument('chapter');
    const picture = 'url("data:image/png;base64,AAAA")';
    doc.documentElement.setAttribute('style', `background: red ${picture} !important`);
    doc.body.setAttribute('style', `background: red ${picture} !important`);
    paintPageColor(doc, '#f4ecd8');
    for (const el of [doc.documentElement, doc.body]) {
      expect(el.style.getPropertyPriority('background-color')).toBe('important');
      expect(el.style.getPropertyValue('background-color')).toBe('rgb(244, 236, 216)');
      expect(el.style.getPropertyValue('background-image')).not.toContain('url(');
    }
  });

  it('paints <html> when a chapter has no body', () => {
    const doc = document.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html', null);
    paintPageColor(doc, '#000000');
    expect(doc.documentElement.style.getPropertyPriority('background-color')).toBe('important');
  });
});
