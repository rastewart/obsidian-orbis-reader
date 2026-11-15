// A name to propose for this device, and the names already in use.
//
// **A suggestion, not a detection.** Obsidian tells us what KIND of machine this is and nothing more — there is no API
// for the name the operating system knows it by — so the best we can do is "Mac" or "Android phone" and let the reader
// correct it. That is still worth doing: an empty text field is the step people skip.
//
// **A name is never how anything is identified.** Files are named with the device ID, and the plugin matches on it;
// the name exists for the places a device is named TO A PERSON — the resume prompt on another device, the device list
// in the reading data view. So two devices sharing a name are confusing rather than broken, which is why the
// suggestion is numbered rather than refused.

import { type App, Platform, TFile } from 'obsidian';

/** What kind of machine this is, in the words a reader would use for it. */
export function deviceKind(): string {
  if (Platform.isIosApp) return Platform.isTablet ? 'iPad' : 'iPhone';
  if (Platform.isAndroidApp) return Platform.isTablet ? 'Android tablet' : 'Android phone';
  if (Platform.isMacOS) return 'Mac';
  if (Platform.isWin) return 'Windows PC';
  if (Platform.isLinux) return 'Linux';
  return 'This device';
}

/**
 * `base`, or the first `base N` nobody has taken.
 *
 * Matched case-insensitively and ignoring surrounding space, because "mac" and "Mac " are the same name to the person
 * reading a list of them. Starts at 2: the second Mac is "Mac 2", which means the first one never has to be renamed.
 */
export function freeDeviceName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (!used.has(base.trim().toLowerCase())) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/**
 * Every device name the vault knows about, from the reading-location files.
 *
 * **One file per device, not one per book.** The device id is in the file name, so grouping by id and reading a single
 * file for each answers the question with as many reads as there are devices — where reading every location file in a
 * vault of five hundred books would be five hundred reads to learn three names.
 *
 * Best effort: an unreadable or nameless file contributes nothing. This decides what to put in a text field.
 */
export async function takenDeviceNames(app: App): Promise<string[]> {
  const byDevice = new Map<string, string>();
  for (const file of app.vault.getFiles()) {
    const deviceId = locationFileDevice(file);
    if (!deviceId || byDevice.has(deviceId)) continue;
    byDevice.set(deviceId, file.path);
  }
  const names: string[] = [];
  for (const path of byDevice.values()) {
    try {
      const held = JSON.parse(await app.vault.adapter.read(path)) as { deviceName?: unknown };
      if (typeof held.deviceName === 'string' && held.deviceName.trim()) names.push(held.deviceName.trim());
    } catch {
      // A half-written or hand-edited file says nothing about what names are taken.
    }
  }
  return names;
}

/** The device id out of `<book>.location.<deviceId>.json`, or null when the file is not one. */
function locationFileDevice(file: TFile): string | null {
  const match = /\.location\.([^.]+)\.json$/.exec(file.name);
  return match ? match[1] : null;
}
