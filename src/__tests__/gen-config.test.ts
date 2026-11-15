import { beforeEach, describe, expect, it } from 'vitest';
import {
  enabledGenMethods,
  genMethodIsAChoice,
  migrateGenConfigEnable,
  readGenConfig,
  setGenConfig,
} from '../reader/tts/gen-config';

// This Node/jsdom env ships without a working localStorage; give the module an in-memory one.
function installFakeLocalStorage(): void {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  Object.defineProperty(window, 'localStorage', { value: fake, configurable: true, writable: true });
}

describe('gen-config enable flags', () => {
  beforeEach(() => installFakeLocalStorage());

  it('a fresh install is Piper-only', () => {
    migrateGenConfigEnable();
    const cfg = readGenConfig();
    expect(cfg.piperEnabled).toBe(true);
    expect(cfg.serverEnabled).toBe(false);
    expect(cfg.method).toBe('piper'); // coerced to the only enabled method
  });

  it('an existing server setup keeps the server on after migration', () => {
    // A pre-enable-flag device that had really been set up: it has an ADDRESS.
    window.localStorage.setItem('orbis-tts-server-url', 'http://kokoro.local:8880');
    window.localStorage.setItem('orbis-tts-gen-method', 'server');
    migrateGenConfigEnable();
    const cfg = readGenConfig();
    expect(cfg.serverEnabled).toBe(true);
    expect(cfg.piperEnabled).toBe(true); // Piper revealed too, per the upgrade decision
    expect(cfg.method).toBe('server');
  });

  /**
   * **A method key on its own is not a server**, and reading it as one would leave a freshly reset vault with
   * Kokoro switched on and pointed at nothing. `method` is stored merely by choosing which engine a recording
   * starts on; the URL is the one value that cannot be there by accident.
   */
  it('does not infer a server from a stray method key', () => {
    window.localStorage.setItem('orbis-tts-gen-method', 'server');
    migrateGenConfigEnable();
    const cfg = readGenConfig();
    expect(cfg.serverEnabled).toBe(false);
    expect(cfg.method).toBe('piper'); // coerced: the stored method is not one that is enabled
  });

  it('does not infer a server from a typed voice or model either', () => {
    window.localStorage.setItem('orbis-tts-server-voice', 'af_heart');
    window.localStorage.setItem('orbis-tts-server-model', 'kokoro');
    migrateGenConfigEnable();
    expect(readGenConfig().serverEnabled).toBe(false);
  });

  it('migration is one-time — later user toggles are not overwritten', () => {
    migrateGenConfigEnable(); // fresh → piper on, server off
    setGenConfig({ serverEnabled: true, piperEnabled: false, method: 'server' });
    migrateGenConfigEnable(); // must be a no-op now
    const cfg = readGenConfig();
    expect(cfg.piperEnabled).toBe(false);
    expect(cfg.serverEnabled).toBe(true);
  });

  it('coerces the active method away from a disabled one', () => {
    setGenConfig({ piperEnabled: true, serverEnabled: false, method: 'server' });
    // method is stored as 'server' but the server is disabled → read as 'piper'.
    expect(readGenConfig().method).toBe('piper');
  });
});

/**
 * **Which engines are on, as one question.** Asked inline, in a condition read once as the settings page is built,
 * the answer goes stale: switching one engine off would leave the "Default recording method" row on screen offering
 * a choice that no longer exists, until the page is rebuilt.
 */
describe('enabledGenMethods', () => {
  it('lists them in the order the page does', () => {
    expect(enabledGenMethods({ piperEnabled: true, serverEnabled: true })).toEqual(['piper', 'server']);
  });

  it('names just the one that is on', () => {
    expect(enabledGenMethods({ piperEnabled: true, serverEnabled: false })).toEqual(['piper']);
    expect(enabledGenMethods({ piperEnabled: false, serverEnabled: true })).toEqual(['server']);
  });

  /** A state the switches refuse to reach, but the config can hold it — a stored flag outlives what set it. */
  it('is empty when neither is on', () => {
    expect(enabledGenMethods({ piperEnabled: false, serverEnabled: false })).toEqual([]);
  });
});

describe('genMethodIsAChoice', () => {
  it('is a choice only when both engines are on', () => {
    expect(genMethodIsAChoice({ piperEnabled: true, serverEnabled: true })).toBe(true);
  });

  /** One engine on means there is nothing to pick between, so the row does not belong. */
  it('is not a choice with one engine, whichever it is', () => {
    expect(genMethodIsAChoice({ piperEnabled: true, serverEnabled: false })).toBe(false);
    expect(genMethodIsAChoice({ piperEnabled: false, serverEnabled: true })).toBe(false);
  });

  it('is not a choice with none', () => {
    expect(genMethodIsAChoice({ piperEnabled: false, serverEnabled: false })).toBe(false);
  });

  /** Reads the live config, since that is how the page asks it — and the answer has to move when the config does. */
  it('follows the stored config as it changes', () => {
    setGenConfig({ piperEnabled: true, serverEnabled: true });
    expect(genMethodIsAChoice(readGenConfig())).toBe(true);
    setGenConfig({ serverEnabled: false });
    expect(genMethodIsAChoice(readGenConfig())).toBe(false);
    setGenConfig({ serverEnabled: true });
    expect(genMethodIsAChoice(readGenConfig())).toBe(true);
  });
});
