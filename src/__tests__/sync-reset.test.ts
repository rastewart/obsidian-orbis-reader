// The dev reset. Worth a test for one reason: it deletes files, and the filter that decides WHICH is the same parse
// the scan uses — so a mistake here is a mistake that reaches a reader's notes.

import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import { markMultiDeviceAsked, multiDeviceAsked, multiDeviceEnabled, setMultiDeviceEnabled } from '../multi-device';
import { currentClock, nextVersion } from '../sync/clock';
import { markSyncSetupDone, setSyncEnabledHere, syncEnabled, syncSetupDone } from '../sync/enabled';
import { deletePublishedCopies, forgetPublishing, publishedCopyCount } from '../sync/reset';

function fakeVault(paths: string[]): { app: App; trashed: string[] } {
  const trashed: string[] = [];
  const keys = new Map<string, unknown>();
  const app = {
    vault: {
      getFiles: () => paths.map((path) => ({ path, name: path.slice(path.lastIndexOf('/') + 1) })),
    },
    fileManager: {
      trashFile: (file: { path: string }) => {
        trashed.push(file.path);
        return Promise.resolve();
      },
    },
    loadLocalStorage: (key: string) => (keys.has(key) ? keys.get(key) : null),
    saveLocalStorage: (key: string, value: unknown) => {
      if (value) keys.set(key, value);
      else keys.delete(key);
    },
  } as unknown as App;
  return { app, trashed };
}

const VAULT = [
  '!orbis-data/sync/orbis-sync.dashboards.d1.mac.json',
  '!orbis-data/sync/orbis-sync.dashboards.d1.phone.json',
  'Elsewhere/orbis-sync.collections.c1.mac.json',
  'Books/!orbis-data/Sample.location.mac.json', // reading locations are NOT ours
  'Library/orbis-collection-9x8y.json', // nor the library's own config files
  'Notes/reading.md',
];

describe('the sync reset', () => {
  beforeEach(() => setDeviceStoreApp(fakeVault([]).app));

  it('counts only published copies', () => {
    expect(publishedCopyCount(fakeVault(VAULT).app)).toBe(3);
  });

  it('trashes every published copy and nothing else', async () => {
    const { app, trashed } = fakeVault(VAULT);
    expect(await deletePublishedCopies(app)).toBe(3);
    expect(trashed).toEqual([
      '!orbis-data/sync/orbis-sync.dashboards.d1.mac.json',
      '!orbis-data/sync/orbis-sync.dashboards.d1.phone.json',
      'Elsewhere/orbis-sync.collections.c1.mac.json',
    ]);
  });

  it('leaves this device with nothing to remember', () => {
    const { app } = fakeVault([]);
    setDeviceStoreApp(app);
    setMultiDeviceEnabled(true);
    markMultiDeviceAsked();
    setSyncEnabledHere(true);
    markSyncSetupDone();
    nextVersion(Date.parse('2026-08-26T10:00:00.000Z'));
    nextVersion(Date.parse('2026-08-26T10:00:00.000Z'));
    expect(currentClock().c).toBe(1);

    forgetPublishing();

    expect(syncEnabled()).toBe(false);
    expect(syncSetupDone()).toBe(false);
    // Back before the MASTER switch, not just before publishing: the first-run dialogs this command exists to
    // see again are behind it, so leaving it on would reset to a state the device has never been in.
    expect(multiDeviceEnabled()).toBe(false);
    expect(multiDeviceAsked()).toBe(false); // so the offer can be seen again, which is what the command is for
    expect(currentClock()).toEqual({ l: 0, c: 0 }); // and this device's clock starts over
  });
});
