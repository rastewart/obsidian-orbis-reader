// Consent, kept per device and per vault. The vault-separation test is the point of the file: a switch that leaked
// between vaults would have one machine's test vault publishing because its real vault does.

import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import { setMultiDeviceEnabled } from '../multi-device';
import { forgetSyncSetup, markSyncSetupDone, setSyncEnabledHere, syncEnabled, syncSetupDone } from '../sync/enabled';

function fakeVault(): App {
  const keys = new Map<string, unknown>();
  return {
    loadLocalStorage: (key: string) => (keys.has(key) ? keys.get(key) : null),
    saveLocalStorage: (key: string, value: unknown) => {
      if (value) keys.set(key, value);
      else keys.delete(key);
    },
  } as unknown as App;
}

describe('the sync switch', () => {
  // Publishing lives UNDER the multi-device switch, so every test that expects it on turns that on too. The one
  // below named for it is where that dependency is actually asserted.
  beforeEach(() => {
    setDeviceStoreApp(fakeVault());
    setMultiDeviceEnabled(true);
  });

  it('is off until this device says otherwise', () => {
    expect(syncEnabled()).toBe(false);
    expect(syncSetupDone()).toBe(false);
  });

  it('turns on and off', () => {
    setSyncEnabledHere(true);
    expect(syncEnabled()).toBe(true);
    setSyncEnabledHere(false);
    expect(syncEnabled()).toBe(false);
  });

  /**
   * **The master switch governs, it does not merely hide.** A device that has left multi-device use must stop
   * publishing, not keep publishing behind a hidden row — otherwise the only way to discover it is still running is
   * to go looking in the vault.
   *
   * And the answer survives: coming back turns publishing on again rather than asking a question already answered.
   */
  it('publishes nothing while this device is not taking part', () => {
    setSyncEnabledHere(true);
    setMultiDeviceEnabled(false);
    expect(syncEnabled()).toBe(false);
    setMultiDeviceEnabled(true);
    expect(syncEnabled()).toBe(true);
  });

  it('remembers being set up after being switched off — the answers are still true', () => {
    markSyncSetupDone();
    setSyncEnabledHere(true);
    setSyncEnabledHere(false);
    expect(syncSetupDone()).toBe(true);
  });

  it('is separate in each vault, so a test vault publishing says nothing about the real one', () => {
    const real = fakeVault();
    const test = fakeVault();
    setDeviceStoreApp(real);
    setMultiDeviceEnabled(true);
    setSyncEnabledHere(true);
    markSyncSetupDone();
    setDeviceStoreApp(test);
    expect(syncEnabled()).toBe(false);
    expect(syncSetupDone()).toBe(false); // and so the test vault is asked its own setup questions
    setDeviceStoreApp(real);
    expect(syncEnabled()).toBe(true);
  });

  it('can be forgotten entirely, for the dev reset', () => {
    setSyncEnabledHere(true);
    markSyncSetupDone();
    forgetSyncSetup();
    expect(syncEnabled()).toBe(false);
    expect(syncSetupDone()).toBe(false);
  });
});
