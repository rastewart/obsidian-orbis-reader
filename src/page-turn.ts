// How a page turns in Paged mode: at once, as it always has, or sliding across. On the display style bar's Layout tab
// and in Settings → Appearance, at once by default, as Apple Books and Google Play Books offer it.

import type { TranslationKey } from './i18n/en';

/** This device's live Page turn. */
export const STORAGE_KEY_PAGE_TURN = 'orbis-page-turn';

export type PageTurn = 'none' | 'slide';

/** Each answer by the name its dropdown gives it, in the dropdown's order. */
export const PAGE_TURN_LABELS: Record<PageTurn, TranslationKey> = {
  none: 'appearance_page.page_turn_none',
  slide: 'appearance_page.page_turn_slide',
};

/** A stored value as an answer; anything else — a style saved before the setting — reading as none. */
export function parsePageTurn(v: string | null | undefined): PageTurn {
  return v === 'slide' ? 'slide' : 'none';
}

/**
 * Turn foliate's own slide on or off on its paginator (`renderer`).
 *
 * **foliate's, not Orbis's.** The paginator slides a page over 300ms when it has an `animated` attribute, for a
 * page turned by key, tap or button and for a swipe let go; without it, it jumps. Into another chapter it always
 * jumps, since the next chapter is a new document.
 *
 * **Paged mode only**: a scrolled book has no pages to slide, so the setting is hidden there and the attribute kept
 * off. **Not where the device asks for less motion** (`prefers-reduced-motion`), whatever the setting says.
 */
export function applyPageTurn(renderer: Element | null | undefined, pageTurn: PageTurn, flow: string): void {
  if (!renderer) return;
  const lessMotion = renderer.win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  renderer.toggleAttribute('animated', pageTurn === 'slide' && flow !== 'scrolled' && !lessMotion);
}
