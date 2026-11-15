// Whether THIS device takes part in multi-device use at all.
//
// **The switch above both capabilities**, and the reason they are on one page: sharing your reading position and
// sharing your Orbis configuration are two answers to one situation — you use this vault on more than one machine.
// A device that does not is being asked two questions with no consequences, and shown a name and an id that appear
// nowhere it can see them.
//
// **Per device, like `sync/enabled`, and for the same reason.** Consent does not travel: a reader who syncs
// `.obsidian` as well would otherwise have one machine's answer turn features on everywhere. `device-store` scopes
// it per device AND per vault, so switching it on in a test vault says nothing about the real one.
//
// **It governs rather than reveals.** Turning it off has to stop the features, not just hide their switches — see
// `syncEnabled` and `progress.isolatedHere`. A master switch that only hides is a lie the next reader has to
// discover by looking at their vault.
//
// Off until asked, and asked once. See docs/design/multi-device-sync.md.

import type { App } from 'obsidian';
import { getOrCreateDeviceId, readDeviceValue, writeDeviceValue } from './device-store';

const MULTI_DEVICE_KEY = 'orbis-multi-device';

/** Whether this device shares anything with, or reads anything from, the others. */
export function multiDeviceEnabled(): boolean {
  return readDeviceValue(MULTI_DEVICE_KEY) === 'true';
}

export function setMultiDeviceEnabled(on: boolean): void {
  writeDeviceValue(MULTI_DEVICE_KEY, on ? 'true' : null);
}

const ASKED_KEY = 'orbis-multi-device-asked';

/** Whether this device has answered the multi-device offer with "Don't ask again". "Not now" lasts the session. */
export function multiDeviceAsked(): boolean {
  return readDeviceValue(ASKED_KEY) === 'true';
}

export function markMultiDeviceAsked(): void {
  writeDeviceValue(ASKED_KEY, 'true');
}

export function forgetMultiDeviceAsked(): void {
  writeDeviceValue(ASKED_KEY, null);
  askedThisSession = false;
}

/**
 * Declined for now, in memory only.
 *
 * **"Later" means the next session, and nothing has to decide how long that is.** The check runs on every book
 * open, so a persisted "ask me in a while" would need a duration picked out of the air, and an unpersisted one that
 * lasted a single open would be a nag. Closing the offer quiets it until Obsidian starts again; the tick beside it
 * is what makes the answer permanent.
 */
let askedThisSession = false;

export function askedMultiDeviceThisSession(): boolean {
  return askedThisSession;
}

export function markAskedThisSession(): void {
  askedThisSession = true;
}

/**
 * Has some OTHER device used this vault?
 *
 * **Reading-position files are the reliable signal**, and the reason is that every device writes one whether or not
 * it is taking part: the file is also how a device remembers its own place. So two machines that have never enabled
 * anything still leave evidence of each other, which is exactly the case worth noticing — a reader who would get no
 * resume prompt, and no hint that one was possible.
 *
 * A name match rather than a read: the device id is in the FILE NAME, so this is a scan of the vault's index rather
 * than opening anything. Cheap enough to run on a book open.
 */
export function vaultUsedElsewhere(app: App): boolean {
  const mine = getOrCreateDeviceId(app);
  return app.vault.getFiles().some((file) => {
    const found = LOCATION_FILE.exec(file.name);
    return !!found && found[1] !== mine;
  });
}

/** `<book>.location.<deviceId>.json` — the device id is in the NAME, which is what makes the scan above a scan of
 *  Obsidian's index rather than a read of every sidecar. */
const LOCATION_FILE = /\.location\.([a-z0-9]+)\.json$/;

/**
 * Trash every device's reading-position file. Returns how many went.
 *
 * **For the factory-reset dev command, and it is the one thing there that touches the vault.** A device's reading
 * position is the evidence `vaultUsedElsewhere` reads, so a reset that left them behind would produce a vault that
 * was fresh in every respect except the one being tested: the greeting would be skipped for a device that had just been
 * told it was new. Every device's, not only this one's — after a reset this device has a new id anyway, so its own
 * files are indistinguishable from a stranger's.
 *
 * Trashed rather than deleted, and through `fileManager` so Obsidian's own trash preference decides where they go —
 * the same route `deletePublishedCopies` takes, for the same reason: a reading position is real work, and a dev
 * command should not be the only place in the plugin that destroys some.
 */
export async function trashLocationFiles(app: App): Promise<number> {
  const files = app.vault.getFiles().filter((file) => LOCATION_FILE.test(file.name));
  for (const file of files) await app.fileManager.trashFile(file);
  return files.length;
}
