/**
 * Watch Obsidian's light/dark theme, and *only* that.
 *
 * Obsidian carries the active theme as a `theme-dark` / `theme-light` class on `document.body`. The obvious
 * way to follow it is a MutationObserver on that attribute — but body's class list is shared ground. This
 * plugin puts its own classes there (`orbis-listen-fullplayer` when the full player is up,
 * `orbis-listen-locked` in pocket mode), Obsidian puts several of its own there, and so does every other
 * plugin in the vault. An observer that treats any mutation as a theme change fires on all of them.
 *
 * That was not a harmless extra call: the reader answers a theme change by re-injecting styles into every
 * section, which reloads them — and the audio player has to capture a CFI anchor and PAUSE before that
 * happens, or the live Range it is reading dies underneath it. So toggling the full-screen player, which
 * sets a body class, paused the audio a millisecond later and showed a "Listening paused" toast.
 *
 * Hence: read the theme, compare it to the last one seen, and ignore everything else.
 */

/**
 * What Obsidian is currently showing, which is only ever one of two things.
 *
 * **`SystemTheme`, not `Theme`, and the distinction is real.** `settings.ts` exports a `Theme` too — `auto`,
 * `light`, `dark`, `sepia` — but that is what the READER chose for the book. This is what the app resolved to,
 * which is what a book styled `auto` has to follow. Two concepts sharing a name is how one gets imported for the
 * other.
 */
export type SystemTheme = 'dark' | 'light';

/**
 * **Pass the body of the window the reader is in — never `activeDocument.body`.** Obsidian's settings can be a window
 * of their own, and `activeDocument` is whichever window has focus. With settings focused, a theme flip was seen by
 * the watcher (on the reader's window) as light while the colors it rebuilt read the settings window as still dark,
 * so a book on Auto stayed dark until it was set to another theme and back.
 */
export function readTheme(body: HTMLElement): SystemTheme {
  return body.classList.contains('theme-dark') ? 'dark' : 'light';
}

/**
 * Call `onChange` when — and only when — the body's theme class actually flips.
 *
 * Deliberately not gated on the reader's own `auto` setting: the caller decides whether to act, and the
 * last-seen theme has to keep tracking either way, or switching away from `auto` and back would miss a
 * flip that happened in between and leave the book in the old theme's colors.
 */
export function observeTheme(body: HTMLElement, onChange: (theme: SystemTheme) => void): MutationObserver {
  let last = readTheme(body);
  const obs = new MutationObserver(() => {
    const theme = readTheme(body);
    if (theme === last) return;
    last = theme;
    onChange(theme);
  });
  obs.observe(body, { attributes: true, attributeFilter: ['class'] });
  return obs;
}
