// The switch above both multi-device features, and the detector that offers it.
//
// `vaultUsedElsewhere` is the interesting one: it decides whether a reader is ever TOLD the feature exists, and it
// has to work on evidence a device leaves without having enabled anything.

import type { App, TFile } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import {
  askedMultiDeviceThisSession,
  forgetMultiDeviceAsked,
  markAskedThisSession,
  markMultiDeviceAsked,
  multiDeviceAsked,
  multiDeviceEnabled,
  setMultiDeviceEnabled,
  trashLocationFiles,
  vaultUsedElsewhere,
} from '../multi-device';

/** A vault whose local storage is its own, holding the given file names. */
function fakeVault(fileNames: string[] = [], deviceId = 'mydevice01'): App {
  const keys = new Map<string, unknown>([['orbis-device-id', deviceId]]);
  return {
    loadLocalStorage: (key: string) => (keys.has(key) ? keys.get(key) : null),
    saveLocalStorage: (key: string, value: unknown) => {
      if (value) keys.set(key, value);
      else keys.delete(key);
    },
    vault: { getFiles: () => fileNames.map((name) => ({ name }) as TFile) },
  } as unknown as App;
}

describe('the multi-device switch', () => {
  beforeEach(() => setDeviceStoreApp(fakeVault()));

  it('is off until this device says otherwise', () => {
    expect(multiDeviceEnabled()).toBe(false);
    expect(multiDeviceAsked()).toBe(false);
  });

  it('turns on and off', () => {
    setMultiDeviceEnabled(true);
    expect(multiDeviceEnabled()).toBe(true);
    setMultiDeviceEnabled(false);
    expect(multiDeviceEnabled()).toBe(false);
  });

  // Declining is an answer. Asking again on the next book open is how an offer becomes a nag.
  it('remembers having asked, separately from the answer', () => {
    markMultiDeviceAsked();
    expect(multiDeviceAsked()).toBe(true);
    expect(multiDeviceEnabled()).toBe(false);
  });

  /**
   * **"Later" is the session, and it is not written down.** The offer runs on every book open, so closing it has to
   * quiet it until Obsidian starts again — which an in-memory flag does without anyone choosing a duration. The
   * persistent one is for the tick beside the buttons, and the two must not be confused: a reader who declined for
   * now has not declined for good.
   */
  it('keeps "not now" apart from "never"', () => {
    forgetMultiDeviceAsked();
    markAskedThisSession();
    expect(askedMultiDeviceThisSession()).toBe(true);
    expect(multiDeviceAsked()).toBe(false); // nothing persisted, so a restart offers again
  });

  it('forgets the session decline too, for the dev reset', () => {
    markAskedThisSession();
    markMultiDeviceAsked();
    forgetMultiDeviceAsked();
    expect(askedMultiDeviceThisSession()).toBe(false);
    expect(multiDeviceAsked()).toBe(false);
  });
});

describe('noticing that a vault is used elsewhere', () => {
  /**
   * **Another device's reading-position file is the signal**, and it is left whether or not that device ever
   * enabled anything: the file is also how a device remembers its own place. So two machines that have both
   * declined still leave evidence of each other — which is exactly the reader worth telling.
   */
  it('sees another device from its position file alone', () => {
    const app = fakeVault(['Sample Book.location.otherdev99.json']);
    setDeviceStoreApp(app);
    expect(vaultUsedElsewhere(app)).toBe(true);
  });

  it('does not count this device', () => {
    const app = fakeVault(['Sample Book.location.mydevice01.json']);
    setDeviceStoreApp(app);
    expect(vaultUsedElsewhere(app)).toBe(false);
  });

  it('is quiet in a vault nothing else has touched', () => {
    const app = fakeVault(['Sample Book.epub', 'Sample Book.orbis', 'notes.md']);
    setDeviceStoreApp(app);
    expect(vaultUsedElsewhere(app)).toBe(false);
  });

  // The id is read from the NAME, so a book whose own title contains ".location." must not be mistaken for one.
  it('ignores a file that merely looks like one', () => {
    const app = fakeVault(['My.location.notes.md', 'location.json']);
    setDeviceStoreApp(app);
    expect(vaultUsedElsewhere(app)).toBe(false);
  });
});

/**
 * The factory reset's one reach into the vault. It shares the detector's pattern deliberately: what it clears has
 * to be exactly what `vaultUsedElsewhere` looks at, or a reset leaves a vault that still says it has been used.
 */
describe('trashing the reading positions', () => {
  it("takes every device's, this one included", async () => {
    const trashed: string[] = [];
    const app = fakeVault([
      'Sample Book.location.otherdev99.json',
      'Sample Book.location.mydevice01.json',
      'Sample Book.epub',
    ]);
    (app as unknown as { fileManager: unknown }).fileManager = {
      trashFile: (f: TFile) => {
        trashed.push(f.name);
        return Promise.resolve();
      },
    };
    setDeviceStoreApp(app);
    expect(await trashLocationFiles(app)).toBe(2);
    expect(trashed).toEqual(['Sample Book.location.otherdev99.json', 'Sample Book.location.mydevice01.json']);
  });

  it('leaves a vault with no positions untouched, and says so', async () => {
    const app = fakeVault(['Sample Book.epub', 'Sample Book.orbis', 'My.location.notes.md']);
    (app as unknown as { fileManager: unknown }).fileManager = {
      trashFile: () => Promise.reject(new Error('nothing here should be trashed')),
    };
    setDeviceStoreApp(app);
    expect(await trashLocationFiles(app)).toBe(0);
  });
});
