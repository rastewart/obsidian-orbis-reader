// The reader's themes: which exist, which are offered, in what order, and what colors each one paints a book with.
//
// **Two are always offered, first.** Match light or dark mode — Orbis's own black and white — and Match
// Obsidian's theme — the note colors of the Obsidian theme in use. Neither is in the Theme manager's list: one is
// what a deleted theme falls back to, and between them the dropdown can never be empty.
//
// **Everything else is one ordered list** (`readerThemes`), the way the look-up popup's web destinations are: Light,
// Sepia and Dark, seven more provided themes, and the reader's own, each with a switch. The dropdown lists the
// switched-on ones after the two, in the list's order. Provided themes can be switched off and moved, never edited or
// deleted; their colors live here, in code, and the list holds only where they go and whether they are on.
//
// **A theme that is switched off keeps working wherever it is already chosen.** Switching off takes it out of the
// lists; it does not reach into a display style and change how a book looks. The dropdown showing that style still
// lists it, so it shows what is in use rather than a blank. Only a DELETED theme stops resolving, and then the book
// falls back to following Obsidian's light or dark mode — see `resolveThemeId`.
//
// See docs/design/reader-themes.md.

import { t } from './i18n';
import type { TranslationKey } from './i18n/en';

/** Black or white by Obsidian's mode: what Auto always did, and what anything unresolvable falls back to. */
export const MATCH_OBSIDIAN_MODE = 'auto';
/** The background, text and link colors Obsidian's own theme gives a note. */
export const MATCH_OBSIDIAN_THEME = 'obsidian';

/** What a theme paints: every color a resolved `#rrggbb`, so brightness can scale it and contrast can be measured. */
export interface ThemeColors {
  bg: string;
  fg: string;
  /** Absent leaves a book's links the color the book gives them — for most books, `BOOK_LINK`. */
  link?: string;
  visited?: string;
}

/**
 * The browser's own link blue: what a page shows for a link when neither the book nor the theme colors it. Light
 * names no link color, so this is what its links look like in most books — and what its sample has to show.
 */
export const BOOK_LINK = '#0000ee';

/** A provided theme's place in the list: where it goes and whether it is on. Its colors are in `PROVIDED_THEMES`. */
export interface ProvidedThemeEntry {
  id: string;
  offered: boolean;
  builtin: true;
}

/** A theme the reader made, whole. */
export interface CustomTheme {
  id: string;
  offered: boolean;
  builtin: false;
  name: string;
  bg: string;
  fg: string;
  link: string;
}

export type ListedTheme = ProvidedThemeEntry | CustomTheme;

/** The one setting that decides which themes exist beyond the two, which are offered, and in what order. */
export interface ThemeSettings {
  readerThemes: ListedTheme[];
}

interface FixedTheme extends ThemeColors {
  id: string;
  nameKey: TranslationKey;
}

const LIGHT: FixedTheme = { id: 'light', nameKey: 'appearance_page.light', bg: '#ffffff', fg: '#000000' };
const DARK: FixedTheme = {
  id: 'dark',
  nameKey: 'appearance_page.dark',
  bg: '#000000',
  fg: '#ffffff',
  link: '#7bb3f0',
  visited: '#a78bda',
};

/**
 * The extras, all off until switched on.
 *
 * **Every pair clears 7 : 1 and every link 5 : 1** against its background, measured with `contrastRatio` — the
 * ones meant for fun as well as the quiet ones, since a theme nobody can read for an hour is not a theme. The test
 * holds them to it.
 */
export const PRESET_THEMES: readonly FixedTheme[] = [
  { id: 'paper', nameKey: 'themes.paper', bg: '#f7f3ea', fg: '#2e2a24', link: '#2f5d8a' },
  { id: 'gray', nameKey: 'themes.gray', bg: '#4b4b4f', fg: '#ececec', link: '#a8d0ff' },
  { id: 'charcoal', nameKey: 'themes.charcoal', bg: '#232323', fg: '#d6d6d6', link: '#7fb2ec' },
  { id: 'midnight', nameKey: 'themes.midnight', bg: '#16213a', fg: '#cfd6e2', link: '#8fb8f2' },
  { id: 'emerald', nameKey: 'themes.emerald', bg: '#0f3b2c', fg: '#d9f2e0', link: '#8fe0b4' },
  { id: 'sunset', nameKey: 'themes.sunset', bg: '#7a3412', fg: '#fff1c9', link: '#ffd27a' },
  { id: 'plum', nameKey: 'themes.plum', bg: '#2e1f3a', fg: '#ece0f5', link: '#d0a8f5' },
];

/** Every theme Orbis provides, in its default order: Light, Sepia and Dark, then the extras. */
const PROVIDED_THEMES: readonly FixedTheme[] = [
  LIGHT,
  { id: 'sepia', nameKey: 'appearance_page.sepia', bg: '#f4ecd8', fg: '#5b4636', link: '#8a4b20' },
  DARK,
  ...PRESET_THEMES,
];

/** On in a new vault: the three Orbis has always offered. */
const ON_BY_DEFAULT: ReadonlySet<string> = new Set(['light', 'sepia', 'dark']);

function providedTheme(id: string): FixedTheme | undefined {
  return PROVIDED_THEMES.find((theme) => theme.id === id);
}

/** The list a new vault starts with. */
export function defaultThemeList(): ListedTheme[] {
  return PROVIDED_THEMES.map(({ id }) => ({ id, offered: ON_BY_DEFAULT.has(id), builtin: true }));
}

/**
 * The list within its own rules: every provided theme exactly once, every made theme whole and once.
 *
 * **Run on the way in, not trusted on the way through.** The list arrives from `data.json` and from other devices,
 * either of which can be older than this version or hand-edited. A provided theme this version adds is appended,
 * with its default switch; one a later version removed, or an entry missing its colors, is dropped.
 */
export function settleThemeList(list: readonly ListedTheme[] | undefined): ListedTheme[] {
  const seen = new Set<string>();
  const settled: ListedTheme[] = [];
  // Read as what it may really be — anything — rather than as what the type promises.
  const raw: readonly unknown[] = Array.isArray(list) ? (list as readonly unknown[]) : [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const { id, name, bg, fg, link } = entry;
    if (typeof id !== 'string' || seen.has(id)) continue;
    const offered = entry.offered === true;
    if (providedTheme(id)) {
      settled.push({ id, offered, builtin: true });
    } else if (entry.builtin === false && typeof name === 'string' && isHex(bg) && isHex(fg)) {
      settled.push({ id, offered, builtin: false, name, bg, fg, link: isHex(link) ? link : fg });
    } else {
      continue;
    }
    seen.add(id);
  }
  for (const entry of defaultThemeList()) if (!seen.has(entry.id)) settled.push(entry);
  return settled;
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** What a list or a dropdown calls a theme. */
export function themeName(entry: ListedTheme): string {
  if (!entry.builtin) return entry.name;
  const provided = providedTheme(entry.id);
  return provided ? t(provided.nameKey) : entry.id;
}

/** One entry in a theme dropdown. */
export interface ThemeChoice {
  id: string;
  label: string;
}

/**
 * The themes a dropdown lists: the two that match Obsidian, then the switched-on ones in the list's order.
 *
 * `current` is the theme in use, listed even when switched off — so a display style that uses one still shows it.
 */
export function themeChoices(s: ThemeSettings, current?: string): ThemeChoice[] {
  return [
    { id: MATCH_OBSIDIAN_MODE, label: t('appearance_page.match_light_dark_mode') },
    { id: MATCH_OBSIDIAN_THEME, label: t('appearance_page.match_obsidian_theme') },
    ...settleThemeList(s.readerThemes)
      .filter((entry) => entry.offered || entry.id === current)
      .map((entry) => ({ id: entry.id, label: themeName(entry) })),
  ];
}

/** The reader's own theme with this id, if there is one. */
function customTheme(id: string, s: ThemeSettings): CustomTheme | undefined {
  const entry = (s.readerThemes ?? []).find((e) => e.id === id);
  return entry && !entry.builtin ? entry : undefined;
}

/** The theme `id` names, or Match light or dark mode when it names nothing — a deleted theme. */
export function resolveThemeId(id: string, s: ThemeSettings): string {
  if (id === MATCH_OBSIDIAN_MODE || id === MATCH_OBSIDIAN_THEME || providedTheme(id)) return id;
  return customTheme(id, s) ? id : MATCH_OBSIDIAN_MODE;
}

/**
 * The colors a theme paints a book with.
 *
 * `scope` is an element in the reader's own window: its body says whether Obsidian is dark, and its computed style
 * holds the Obsidian theme's note colors. `toHex` turns a CSS color into `#rrggbb`, or null when it cannot — a
 * see-through background is the case — and Match Obsidian's theme then falls back to its light or dark mode.
 */
export function themeColors(
  id: string,
  s: ThemeSettings,
  scope: HTMLElement,
  toHex: (color: string) => string | null = cssColorToHex
): ThemeColors {
  const resolved = resolveThemeId(id, s);
  const dark = scope.ownerDocument.body.classList.contains('theme-dark');
  const byMode = dark ? DARK : LIGHT;
  if (resolved === MATCH_OBSIDIAN_MODE) return colorsOf(byMode);
  if (resolved === MATCH_OBSIDIAN_THEME) {
    const style = getComputedStyle(scope);
    const read = (name: string): string | null => {
      const value = style.getPropertyValue(name).trim();
      return value ? toHex(value) : null;
    };
    const bg = read('--background-primary');
    const fg = read('--text-normal');
    if (!bg || !fg) return colorsOf(byMode);
    const link = read('--link-color') ?? read('--text-accent');
    return link ? { bg, fg, link } : { bg, fg };
  }
  const provided = providedTheme(resolved);
  if (provided) return colorsOf(provided);
  const custom = customTheme(resolved, s);
  return custom ? { bg: custom.bg, fg: custom.fg, link: custom.link } : colorsOf(byMode);
}

/** The colors a listed theme paints, for the Theme manager's samples and its copies. */
export function listedThemeColors(entry: ListedTheme): ThemeColors {
  if (!entry.builtin) return { bg: entry.bg, fg: entry.fg, link: entry.link };
  return colorsOf(providedTheme(entry.id) ?? LIGHT);
}

function colorsOf({ bg, fg, link, visited }: ThemeColors): ThemeColors {
  return { bg, fg, ...(link ? { link } : {}), ...(visited ? { visited } : {}) };
}

/**
 * Any CSS color as `#rrggbb`, by painting one pixel.
 *
 * **Painted rather than parsed**, because an Obsidian theme may write its colors in any form the browser knows —
 * `rgb()`, `hsl()`, `oklch()`, `color-mix()` — and a canvas reads back every one of them as sRGB bytes. Null for
 * anything not fully opaque: a see-through background has no one color to paint a page with.
 */
function cssColorToHex(color: string): string | null {
  try {
    const canvas = createEl('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a !== 255) return null;
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
}

/**
 * A color with the brightness setting baked in, matching what `filter: brightness(N%)` does to a flat color.
 *
 * For the strips focus mode reserves above and below the book, which sit outside the filtered wrapper: a filter of
 * their own would dim twice what is already dimmed. See `applyHostBg`.
 */
export function dimColor(hex: string, brightness: number): string {
  if (brightness === 100) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const factor = brightness / 100;
  const channel = (i: number) => clamp(parseInt(hex.slice(i, i + 2), 16) * factor);
  return `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The page color of a chapter: the theme's, on its `<html>` and `<body>`, as an inline `!important` style.
 *
 * **The reader chooses the page color, not the book.** The theme's stylesheet says the same, but a book beats a
 * stylesheet rule with a more specific selector of its own or an `!important` in a `style` attribute; nothing in a book
 * beats an inline `!important` set after it loads. The whole `background` is set, so a book's background picture goes
 * too. Backgrounds inside the chapter — a shaded box, a table — are the book's content and keep their colors.
 *
 * Foliate no longer copies the book's background into Obsidian's window either (ORBIS patch 22), so this color, with
 * `applyHostBg` behind the frame, is the whole page.
 */
export function paintPageColor(doc: Document, color: string): void {
  for (const el of [doc.documentElement, doc.body]) el?.style.setProperty('background', color, 'important');
}

/** WCAG relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** The WCAG contrast ratio between two `#rrggbb` colors, from 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The usual minimum for body text: below it, a page is hard to read for long. */
export const READABLE_CONTRAST = 4.5;
