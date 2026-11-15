import { afterEach, describe, expect, it } from 'vitest';
import { observeTheme, readTheme } from '../reader/theme-watch';

/** MutationObserver callbacks are microtask-scheduled — let them drain. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

const observers: MutationObserver[] = [];
function watch(body: HTMLElement, onChange: (t: 'dark' | 'light') => void) {
  const obs = observeTheme(body, onChange);
  observers.push(obs);
  return obs;
}

afterEach(() => {
  for (const o of observers.splice(0)) o.disconnect();
});

describe('readTheme', () => {
  it('reads dark from the body class, light otherwise', () => {
    const body = document.createElement('div');
    expect(readTheme(body)).toBe('light');
    body.classList.add('theme-dark');
    expect(readTheme(body)).toBe('dark');
  });
});

describe('observeTheme', () => {
  it('reports an actual theme flip', async () => {
    const body = document.createElement('div');
    body.classList.add('theme-light');
    const seen: string[] = [];
    watch(body, (t) => seen.push(t));

    body.classList.remove('theme-light');
    body.classList.add('theme-dark');
    await settle();

    expect(seen).toEqual(['dark']);
  });

  /**
   * The bug this module exists for: the full-screen player toggles `orbis-listen-fullplayer` on body, the
   * old observer read that as a theme change and re-injected every section, and the audio player paused
   * itself (with a toast) to survive the reload. Any body-class churn must be invisible here.
   */
  it('ignores our own body classes — the full player and the pocket lock', async () => {
    const body = document.createElement('div');
    body.classList.add('theme-dark');
    const seen: string[] = [];
    watch(body, (t) => seen.push(t));

    body.classList.add('orbis-listen-fullplayer');
    await settle();
    body.classList.add('orbis-listen-locked');
    await settle();
    body.classList.remove('orbis-listen-fullplayer', 'orbis-listen-locked');
    await settle();

    expect(seen).toEqual([]);
  });

  it('ignores unrelated churn from Obsidian and other plugins', async () => {
    const body = document.createElement('div');
    body.classList.add('theme-light', 'mod-windows', 'is-focused');
    const seen: string[] = [];
    watch(body, (t) => seen.push(t));

    body.classList.remove('is-focused');
    await settle();
    body.classList.add('some-other-plugin-state');
    await settle();

    expect(seen).toEqual([]);
  });

  it('still sees a flip that happens amid unrelated churn', async () => {
    const body = document.createElement('div');
    body.classList.add('theme-light');
    const seen: string[] = [];
    watch(body, (t) => seen.push(t));

    body.classList.add('orbis-listen-fullplayer');
    await settle();
    body.classList.replace('theme-light', 'theme-dark');
    await settle();
    body.classList.remove('orbis-listen-fullplayer');
    await settle();

    expect(seen).toEqual(['dark']);
  });

  it('reports each flip once, and reports flipping back', async () => {
    const body = document.createElement('div');
    body.classList.add('theme-light');
    const seen: string[] = [];
    watch(body, (t) => seen.push(t));

    body.classList.replace('theme-light', 'theme-dark');
    await settle();
    body.classList.add('orbis-listen-fullplayer'); // no second 'dark'
    await settle();
    body.classList.replace('theme-dark', 'theme-light');
    await settle();

    expect(seen).toEqual(['dark', 'light']);
  });
});
