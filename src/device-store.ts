// Device-local storage that is also VAULT-local.
//
// **`window.localStorage` is shared by every vault on the machine.** Obsidian's own helpers are not:
//
// ```js
// loadLocalStorage = function (key) { localStorage.getItem(this.appId + '-' + key) }
// ```
//
// `appId` is the vault's id, so `app.loadLocalStorage` / `app.saveLocalStorage` are scoped to one vault on one
// device — which is the unit that actually makes sense. A phone's recording server for a test vault has nothing to do
// with its recording server for the real one. Through the raw API a value leaks between vaults: change the Kokoro URL
// in one test vault and it changes in all of them, which reads as flakiness rather than as a fault. See
// `docs/design/multi-device-sync.md`.
//
// **Why a module rather than threading `app` through.** Forty call sites read this storage, in modules that have no
// reason to know about an `App` (`gen-config`, `gen-timing`, `pacing`). One initialization at load keeps those
// signatures and still gets the scoping. `appId` is not in Obsidian's public typings, so the prefixing has to come
// from its own helpers rather than being reproduced here.

import type { App } from 'obsidian';

let app: App | null = null;

/**
 * **No raw→scoped migration, on purpose.**
 *
 * Copying the machine-wide keys into the vault-scoped store at load would quietly undo the factory reset: the
 * migration's "already done" flag would itself be a scoped value, so the reset clears the flag and the next load
 * copies the legacy values straight back in. A reset is not a reset if a migration runs behind it and puts the
 * answers back.
 *
 * The bare keys are inert, since nothing reads them — `clearAllDeviceValues` sweeps them up so they do not sit there
 * looking meaningful. Reads still fall back to the unscoped store before `app` is set, which is a different thing.
 */

/** Called once, early in `onload`. Anything read before this falls back to the unscoped store. */
export function initDeviceStore(a: App): void {
  app = a;
}

function rawRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode, or storage disabled
  }
}

/** A device-and-vault-local string. `null` when unset. */
export function readDeviceValue(key: string): string | null {
  if (!app) return rawRead(key);
  // `loadLocalStorage` is typed as returning `any` — it JSON-parses whatever is there, and everything this module
  // stores is a string.
  const v: unknown = app.loadLocalStorage(key);
  // Strings only. Anything else is a value this module did not write — a stale key from another version, say — and
  // coercing an object to `[object Object]` would be worse than treating it as unset.
  return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
}

export function writeDeviceValue(key: string, value: string | null): void {
  if (!app) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      /* nothing to do — the setting simply will not persist */
    }
    return;
  }
  // Obsidian's own helper removes the key when handed a falsy value, which is what `null` means here.
  app.saveLocalStorage(key, value);
}

/** For tests and the dev reset commands: forget a value in this vault. */
export function clearDeviceValue(key: string): void {
  writeDeviceValue(key, null);
}

/**
 * Forget EVERY value this plugin holds for this device and vault. Returns how many went.
 *
 * **For the factory-reset dev command, and it has to enumerate.** Every other reset here names its keys, which is
 * right when a feature is putting its own house in order — but "what a new install looks like" is a question about
 * keys nobody listed, including ones a future version will add. So this reads the store rather than a list.
 *
 * Straight to `window.localStorage` because Obsidian's helpers can get and set but not enumerate. The prefix they
 * use is `${appId}-`, and `appId` is not in the public typings — hence the cast, the same one this module's opening
 * comment quotes. Scoped to our own `orbis-` names on top of that: everything in this store is ours, and a bug in
 * this function must not be able to reach another plugin's keys.
 */
export function clearAllDeviceValues(log?: (msg: string) => void): number {
  try {
    const prefix = scopePrefix();
    /**
     * **It reports what it saw.**
     *
     * A reset that quietly clears zero keys looks exactly like a reset that worked — the visible difference only
     * turns up later, as a "fresh" vault with a recording server still switched on. The prefix it derived and the
     * names it passed over are the two facts that separate "nothing to clear" from "looking in the wrong place",
     * and neither can be recovered after the fact.
     */
    if (prefix === null) {
      log?.('device store: no scope prefix found — nothing cleared');
      return 0;
    }
    const doomed: string[] = [];
    const spared: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      /**
       * This vault's values, AND the bare, unscoped ones.
       *
       * Every device value is supposed to be vault-scoped — that is what this module is for. A key with no prefix
       * sits in `window.localStorage` directly, and is therefore shared by every vault on the machine. Nothing reads
       * them, so leaving them behind means a reset that reports work while the store still holds the answers it was
       * asked to forget.
       *
       * `orbis-` is ours by construction, so this cannot reach another plugin's keys — and the ANOTHER VAULT case
       * is spared on purpose: a reset is about this vault, and wiping a sibling's Kokoro setup would be a reset
       * doing far more than it says.
       */
      if (key.startsWith(`${prefix}orbis-`) || key.startsWith('orbis-')) doomed.push(key);
      else if (key.includes('orbis-')) spared.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
    log?.(
      `device store: prefix "${prefix}", cleared ${doomed.length} of ${window.localStorage.length + doomed.length}` +
        (spared.length ? ` — passed over ${spared.length}: ${spared.slice(0, 12).join(', ')}` : '')
    );
    return doomed.length;
  } catch (e) {
    log?.(`device store: clear failed — ${String(e)}`);
    return 0; // private mode, or storage disabled — nothing was stored to forget
  }
}

/**
 * What Obsidian prefixes our keys with, discovered by ASKING IT rather than by reading `appId`.
 *
 * Not `app.appId`: that is a private field, and absent, the reset would return 0 and clear nothing — silently, which
 * is the worst property a reset can have. The visible result would be a factory reset that deletes `data.json` (so
 * the presets come back fresh and the welcome appears) while every device-local value survives.
 *
 * So: write a probe through Obsidian's own helper, find where it landed, and take everything in front of the name
 * as the prefix. Whatever the prefixing rule is, this is it by construction — and it cannot reach another plugin's
 * keys, because the prefix comes from a key of ours. `''` when the store is unscoped (no `app` yet), which is the
 * fallback `readDeviceValue` already uses.
 */
function scopePrefix(): string | null {
  if (!app) return ''; // unscoped fallback — our names are already `orbis-`-led
  // Namespaced like everything else here, and removed before the scan below reads the store — so it is never
  // counted among the keys cleared, and never left in someone's storage.
  const probe = 'orbis-scope-probe';
  app.saveLocalStorage(probe, '1');
  let found: string | null = null;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.endsWith(probe)) {
      found = key.slice(0, key.length - probe.length);
      break;
    }
  }
  app.saveLocalStorage(probe, null);
  return found;
}

/** Test seam: point the store at a fake `App`, or at nothing to fall back to `window.localStorage`. */
export function setDeviceStoreApp(a: App | null): void {
  app = a;
}

// ── Device identity ─────────────────────────────────────────────────────────

/**
 * This device's id: twelve random characters, kept in this vault's localStorage and never synced.
 *
 * **Here rather than in `progress.ts`.** Nothing about it is a reading position, and `multi-device` needs the id
 * while `progress` needs to ask whether multi-device is on, so having it in `progress` would make the two import
 * each other. This module is the vault's localStorage and imports nothing but `obsidian`, so identity can live here
 * without anything having to import back.
 */
export const LS_DEVICE_ID = 'orbis-device-id';

export function getOrCreateDeviceId(app: App): string {
  let id = app.loadLocalStorage(LS_DEVICE_ID) as string | null;
  if (!id) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    id = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    app.saveLocalStorage(LS_DEVICE_ID, id);
  }
  return id;
}
