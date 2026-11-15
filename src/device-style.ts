// The display style a device keeps for itself — beside the device, not in `data.json`.
//
// Every device has one, made on first load from whatever the reader was already looking at, and it cannot be renamed,
// deleted or shared. It lived in `settings.styles[]` beside the named styles, marked with a `deviceId`, and every
// reader of that array filtered it back out again: `styles.filter(p => !p.deviceId || p.deviceId === mine)`.
//
// **Two things are wrong with that.** The named styles are about to travel between devices (Phase 4 of the sync
// design) and this one must not — an array holding both is an array that cannot simply be published. And a device
// style inside a synced document is the same fault as the voice preference: sync the file wholesale and one device's
// style lands on another, or vanishes from it.
//
// So it lives in vault-scoped device storage, which also makes it per vault: a test vault's fonts have nothing to say
// about the real one's. `settings.styles[]` is left holding exactly what it says — the styles a reader named.
//
// See docs/design/multi-device-sync.md.

import { readDeviceValue, writeDeviceValue } from './device-store';
import { t } from './i18n';
import type { DisplayStyle } from './settings';
import { migrateStyleTextAlign } from './text-align';

const DEVICE_STYLE_KEY = 'orbis-device-style';

/**
 * A style as every list of styles names it: its own name, or — for this device's — the device's name with
 * "(this device)" after it, or just "This device" for a device nobody has named. One function for the Settings
 * dropdown and the palette's **Switch display style**, so the two lists cannot name it differently.
 */
export function displayStyleLabel(style: DisplayStyle, deviceName: string): string {
  if (!style.deviceId) return style.name;
  return deviceName
    ? t('appearance_page.style_named_this_device', { name: deviceName })
    : t('appearance_page.style_this_device');
}

/** This device's own style, or undefined before `initDeviceStyle` has made one. */
export function readDeviceStyle(deviceId: string): DisplayStyle | undefined {
  const raw = readDeviceValue(DEVICE_STYLE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as DisplayStyle;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') return undefined;
    // A style written before alignment had three answers — see `migrateStyleTextAlign`. It is rewritten the next time
    // the style is saved; until then it reads as the new shape.
    if (parsed.settings) migrateStyleTextAlign(parsed.settings);
    // The device id is implicit in where this is stored, and filled in on the way out so callers see the shape they
    // always saw — including the `deviceId` they use to decide that a style cannot be renamed.
    return { ...parsed, deviceId };
  } catch {
    return undefined;
  }
}

export function writeDeviceStyle(style: DisplayStyle): void {
  const { deviceId: _implicit, ...rest } = style;
  writeDeviceValue(DEVICE_STYLE_KEY, JSON.stringify(rest));
}

/**
 * Carry this device's style out of a `data.json` that still holds one, once.
 *
 * Returns it, so the caller can drop it from the array in the same breath. Never overwrites what is stored here
 * already: a style edited since the move is newer than anything the old array holds.
 */
export function migrateDeviceStyle(styles: readonly DisplayStyle[], deviceId: string): DisplayStyle | undefined {
  if (readDeviceValue(DEVICE_STYLE_KEY)) return undefined;
  const mine = styles.find((s) => s.deviceId === deviceId);
  if (!mine) return undefined;
  writeDeviceStyle(mine);
  return mine;
}
