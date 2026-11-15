// Device-local storage is also VAULT-local, which is the whole point of this module: `window.localStorage` is shared
// by every vault on the machine, so values such as the recording server and the timing samples would leak between
// them.

import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllDeviceValues,
  clearDeviceValue,
  initDeviceStore,
  readDeviceValue,
  setDeviceStoreApp,
  writeDeviceValue,
} from '../device-store';

/** A stand-in for one vault's scoped storage — Obsidian prefixes the key with the vault's `appId`. */
function fakeVault(): { app: App; keys: Map<string, unknown> } {
  const keys = new Map<string, unknown>();
  const app = {
    loadLocalStorage: (key: string) => (keys.has(key) ? keys.get(key) : null),
    saveLocalStorage: (key: string, value: unknown) => {
      if (value) keys.set(key, value);
      else keys.delete(key);
    },
  } as unknown as App;
  return { app, keys };
}

function fakeRawStorage(): Map<string, string> {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    // `length` and `key(i)` as well as the accessors: `clearAllDeviceValues` ENUMERATES the store, which is the one
    // thing Obsidian's own helpers cannot do, and without them here the scan would silently find nothing — the same
    // shape of silence as the failure it is there to catch.
    value: {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
    writable: true,
  });
  return store;
}

describe('device store', () => {
  beforeEach(() => setDeviceStoreApp(null));

  it('reads and writes through the vault, not the machine', () => {
    const raw = fakeRawStorage();
    const { app, keys } = fakeVault();
    setDeviceStoreApp(app);
    writeDeviceValue('orbis-tts-gen-url', 'http://kokoro.local');
    expect(keys.get('orbis-tts-gen-url')).toBe('http://kokoro.local');
    expect(raw.has('orbis-tts-gen-url')).toBe(false); // NOT the shared store
    expect(readDeviceValue('orbis-tts-gen-url')).toBe('http://kokoro.local');
  });

  it('two vaults do not see each other', () => {
    fakeRawStorage();
    const one = fakeVault();
    const two = fakeVault();
    setDeviceStoreApp(one.app);
    writeDeviceValue('orbis-tts-gen-url', 'http://one');
    setDeviceStoreApp(two.app);
    expect(readDeviceValue('orbis-tts-gen-url')).toBeNull();
    writeDeviceValue('orbis-tts-gen-url', 'http://two');
    setDeviceStoreApp(one.app);
    expect(readDeviceValue('orbis-tts-gen-url')).toBe('http://one');
  });

  /**
   * **Init adopts NOTHING from the machine-wide store.**
   *
   * A copy-across migration would need an "already done" marker, and that marker would itself be a scoped value:
   * the factory reset would clear it and the next load would copy the machine-wide answers straight back in — a
   * reset undone by a migration running behind it. See `initDeviceStore`.
   */
  it('adopts nothing from the machine-wide store', () => {
    const raw = fakeRawStorage();
    raw.set('orbis-tts-server-url', 'http://old-shared');
    const { app, keys } = fakeVault();
    initDeviceStore(app);
    expect(keys.has('orbis-tts-server-url')).toBe(false);
    expect(readDeviceValue('orbis-tts-server-url')).toBeNull(); // scoped read, so the bare key is invisible
  });

  it("does not overwrite a vault's own answer with the shared one", () => {
    const raw = fakeRawStorage();
    raw.set('orbis-tts-gen-url', 'http://old-shared');
    const { app, keys } = fakeVault();
    keys.set('orbis-tts-gen-url', 'http://this-vault');
    initDeviceStore(app);
    expect(keys.get('orbis-tts-gen-url')).toBe('http://this-vault');
  });

  it('a value cleared stays cleared across a later load', () => {
    const raw = fakeRawStorage();
    raw.set('orbis-piper-pause-ms', '150'); // a bare leftover, which must not resurrect anything
    const { app, keys } = fakeVault();
    initDeviceStore(app);
    writeDeviceValue('orbis-piper-pause-ms', '150');
    clearDeviceValue('orbis-piper-pause-ms');
    initDeviceStore(app);
    expect(keys.has('orbis-piper-pause-ms')).toBe(false);
  });

  it('falls back to the shared store before it is initialised', () => {
    const raw = fakeRawStorage();
    raw.set('orbis-tts-gen-voice', 'af_heart');
    expect(readDeviceValue('orbis-tts-gen-voice')).toBe('af_heart');
  });

  it('treats a non-scalar as unset rather than stringifying it', () => {
    fakeRawStorage();
    const { app, keys } = fakeVault();
    setDeviceStoreApp(app);
    keys.set('orbis-tts-gen-timing', { rogue: true });
    expect(readDeviceValue('orbis-tts-gen-timing')).toBeNull();
  });
});

/**
 * The factory reset's clear, against a vault that behaves like the real one: Obsidian's helpers prefix the key with
 * the vault's id and put it in the shared `window.localStorage`.
 *
 * **The app object deliberately has no `appId`.** A clear that read that private field would clear nothing, silently,
 * when it is absent — a factory reset that deletes `data.json` (so the presets come back fresh) while leaving every
 * device value in place, such as a recording server switched on and pointed at an address that no longer answers.
 * The prefix is discovered by probe, so no private field can decide whether the reset happens.
 */
function realisticVault(id: string, raw: Map<string, string>): App {
  return {
    loadLocalStorage: (key: string): unknown => {
      const v = raw.get(`${id}-${key}`);
      // `JSON.parse` is `any`; the annotation narrows it to what Obsidian's own signature promises, which is what
      // the caller treats it as anyway.
      return v === undefined ? null : (JSON.parse(v) as unknown);
    },
    saveLocalStorage: (key: string, value: unknown) => {
      if (value) raw.set(`${id}-${key}`, JSON.stringify(value));
      else raw.delete(`${id}-${key}`);
    },
  } as unknown as App;
}

describe('clearAllDeviceValues', () => {
  beforeEach(() => setDeviceStoreApp(null));

  it('forgets this vault’s Orbis values and says how many', () => {
    const raw = fakeRawStorage();
    const app = realisticVault('abc123', raw);
    setDeviceStoreApp(app);
    writeDeviceValue('orbis-tts-server-enabled', 'true');
    writeDeviceValue('orbis-tts-gen-method', 'server');
    expect(raw.get('abc123-orbis-tts-server-enabled')).toBe('"true"');

    expect(clearAllDeviceValues()).toBe(2);
    expect(readDeviceValue('orbis-tts-server-enabled')).toBeNull();
    expect(readDeviceValue('orbis-tts-gen-method')).toBeNull();
  });

  it('leaves another vault and another plugin alone', () => {
    const raw = fakeRawStorage();
    const mine = realisticVault('abc123', raw);
    const other = realisticVault('def456', raw);
    setDeviceStoreApp(other);
    writeDeviceValue('orbis-tts-server-enabled', 'true'); // the same plugin, a different vault
    raw.set('abc123-someone-elses-setting', '"keep me"'); // this vault, a different plugin
    setDeviceStoreApp(mine);
    writeDeviceValue('orbis-tts-server-enabled', 'true');

    expect(clearAllDeviceValues()).toBe(1);
    expect(raw.get('def456-orbis-tts-server-enabled')).toBe('"true"');
    expect(raw.get('abc123-someone-elses-setting')).toBe('"keep me"');
  });

  /**
   * Bare keys are values written to `window.localStorage` directly, so shared by every vault on the machine, and a
   * clear that only knows this vault's prefix leaves them in place — keeping, say, the recording server alive across
   * a factory reset. Every device value is meant to be per-vault, so a key with no prefix is a leftover — and one
   * the reset is supposed to forget.
   */
  it('sweeps the bare pre-scoping keys as well as this vault’s', () => {
    const raw = fakeRawStorage();
    raw.set('orbis-tts-server-enabled', 'true'); // machine-wide leftover
    raw.set('orbis-tts-server-url', 'http://gone');
    setDeviceStoreApp(realisticVault('abc123', raw));
    writeDeviceValue('orbis-theme', 'dark');

    expect(clearAllDeviceValues()).toBe(3);
    expect(raw.has('orbis-tts-server-enabled')).toBe(false);
    expect(raw.has('orbis-tts-server-url')).toBe(false);
  });

  it('leaves no probe of its own behind', () => {
    const raw = fakeRawStorage();
    setDeviceStoreApp(realisticVault('abc123', raw));
    writeDeviceValue('orbis-theme', 'dark');
    clearAllDeviceValues();
    expect([...raw.keys()]).toEqual([]);
  });
});
