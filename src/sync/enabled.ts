// Whether THIS device publishes, and whether it has been set up to.
//
// **Both are per device, and neither is in `data.json`.** Where the files go is a fact about the vault and travels
// with the other destinations; whether this device writes them is consent, and consent does not travel — the same line
// book sources draw around "may this device contact a server". Two consequences, and each is a bug avoided:
//
// - A reader who syncs `.obsidian` as well would otherwise have one device's opt-in turn publishing on everywhere,
//   silently, on machines they had not decided about.
// - The setup dialog asks for a **device name**, which is the one answer that must not travel. An "already asked" flag
//   in `data.json` would tell a second device it had been asked, and it would publish files identified by nothing but
//   a hex string.
//
// Per device here means per device AND per vault, which is what `device-store` gives us: turning publishing on in a
// test vault says nothing about the real vault on the same machine.
//
// See docs/design/multi-device-sync.md §Turning it on.

import { readDeviceValue, writeDeviceValue } from '../device-store';
import { multiDeviceEnabled } from '../multi-device';

const ENABLED_KEY = 'orbis-sync-enabled';
const SETUP_KEY = 'orbis-sync-setup-done';

/**
 * Whether this device publishes and scans. Off until the reader says otherwise.
 *
 * **And off whenever this device is not taking part at all.** The multi-device switch governs rather than
 * hides: asked here rather than by forcing this key off, so turning participation back on restores the answer
 * the reader gave instead of making them give it again.
 */
export function syncEnabled(): boolean {
  return multiDeviceEnabled() && readDeviceValue(ENABLED_KEY) === 'true';
}

export function setSyncEnabledHere(on: boolean): void {
  writeDeviceValue(ENABLED_KEY, on ? 'true' : null);
}

/**
 * Whether this device has answered the setup questions.
 *
 * Separate from the switch, so turning publishing off and on again does not ask twice — the answers are still true.
 */
export function syncSetupDone(): boolean {
  return readDeviceValue(SETUP_KEY) === 'true';
}

export function markSyncSetupDone(): void {
  writeDeviceValue(SETUP_KEY, 'true');
}

/** For the dev reset command: forget that this device was ever set up. */
export function forgetSyncSetup(): void {
  writeDeviceValue(SETUP_KEY, null);
  writeDeviceValue(ENABLED_KEY, null);
}
