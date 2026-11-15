// Which voice reads aloud here — kept beside the device, not in `data.json`.
//
// **Per-device data inside a synced document is a fault, not a feature.** It lived in `data.json` as an array keyed by
// device id, on the reasoning that keying it made it safe to sync. It does not: if `data.json` is synced wholesale —
// Obsidian can, and a file-sync tool will whether asked or not — the Mac's copy lands on the phone entire, the phone's
// entry is not in it, the phone loses its voice, writes its own back, and the two trade the file forever. An array
// keyed by device only hides the collision.
//
// So it moves to `device-store`, which is scoped to this device AND this vault. That second half is a change worth
// knowing: two vaults on one machine now choose voices independently, which is right — a test vault's voice has
// nothing to say about the real one's.
//
// See docs/design/multi-device-sync.md § Making `data.json` fit to sync directly.

import { clearDeviceValue, readDeviceValue, writeDeviceValue } from './device-store';
import type { VoicePref } from './settings';

const VOICE_PREF_KEY = 'orbis-voice-pref';

/** This device's voice preference, or undefined if it has never chosen one. */
export function readVoicePref(deviceId: string): VoicePref | undefined {
  const raw = readDeviceValue(VOICE_PREF_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<VoicePref>;
    if (!parsed || typeof parsed !== 'object') return undefined;
    // The device id is implicit in where this is stored; it is filled in so callers see the shape they always saw.
    return { ...parsed, deviceId, source: parsed.source === 'system' ? 'system' : 'orbis' };
  } catch {
    return undefined; // a value we did not write, or a truncated one: no voice chosen is a safe answer
  }
}

export function writeVoicePref(pref: VoicePref): void {
  const { deviceId: _ignored, ...rest } = pref;
  writeDeviceValue(VOICE_PREF_KEY, JSON.stringify(rest));
}

export function clearVoicePref(): void {
  clearDeviceValue(VOICE_PREF_KEY);
}

/**
 * Carry this device's entry out of a `data.json` that still has one, once.
 *
 * Returns the pref it adopted, or undefined if there was nothing to take. Never overwrites a choice already stored
 * here: if this device has chosen a voice since, that choice is newer than anything the old array holds.
 */
export function migrateVoicePref(prefs: readonly VoicePref[] | undefined, deviceId: string): VoicePref | undefined {
  if (readDeviceValue(VOICE_PREF_KEY)) return undefined; // already moved
  const mine = prefs?.find((p) => p.deviceId === deviceId);
  if (!mine) return undefined;
  writeVoicePref(mine);
  return mine;
}
