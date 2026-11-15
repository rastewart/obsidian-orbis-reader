import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import type { VoicePref } from '../settings';
import { clearVoicePref, migrateVoicePref, readVoicePref, writeVoicePref } from '../voice-pref';

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

const MAC = 'mac-7f3a91';
const PHONE = 'pixel-2c4e08';

describe('the voice preference', () => {
  beforeEach(() => setDeviceStoreApp(fakeVault()));

  it('is undefined before anything is chosen', () => {
    expect(readVoicePref(MAC)).toBeUndefined();
  });

  it('round-trips, and fills in the device it was read for', () => {
    writeVoicePref({ deviceId: MAC, source: 'orbis', orbisVoiceId: 'libritts', orbisSid: 5 });
    expect(readVoicePref(MAC)).toEqual({ deviceId: MAC, source: 'orbis', orbisVoiceId: 'libritts', orbisSid: 5 });
  });

  it('does not store the device id, so reading it from another device tells the truth', () => {
    // The id is implicit in WHERE this is stored. If it were stored too, a copied vault would claim the wrong device.
    writeVoicePref({ deviceId: MAC, source: 'system', systemVoiceURI: 'com.apple.voice.Alex' });
    expect(readVoicePref(PHONE)?.deviceId).toBe(PHONE);
  });

  it('two vaults choose independently', () => {
    const one = fakeVault();
    const two = fakeVault();
    setDeviceStoreApp(one);
    writeVoicePref({ deviceId: MAC, source: 'orbis', orbisVoiceId: 'amy' });
    setDeviceStoreApp(two);
    expect(readVoicePref(MAC)).toBeUndefined();
    writeVoicePref({ deviceId: MAC, source: 'orbis', orbisVoiceId: 'heart' });
    setDeviceStoreApp(one);
    expect(readVoicePref(MAC)?.orbisVoiceId).toBe('amy');
  });

  it('can be cleared, for the listen first-run dev command', () => {
    writeVoicePref({ deviceId: MAC, source: 'orbis', orbisVoiceId: 'amy' });
    clearVoicePref();
    expect(readVoicePref(MAC)).toBeUndefined();
  });

  it('survives a value it did not write rather than throwing', () => {
    const app = fakeVault();
    app.saveLocalStorage('orbis-voice-pref', '{ truncated');
    setDeviceStoreApp(app);
    expect(readVoicePref(MAC)).toBeUndefined();
  });

  describe('migration out of data.json', () => {
    const legacy: VoicePref[] = [
      { deviceId: MAC, source: 'orbis', orbisVoiceId: 'libritts', orbisSid: 3 },
      { deviceId: PHONE, source: 'system', systemVoiceURI: 'android.tts' },
    ];

    it("takes this device's entry and leaves the others alone", () => {
      const taken = migrateVoicePref(legacy, MAC);
      expect(taken?.orbisVoiceId).toBe('libritts');
      expect(readVoicePref(MAC)).toEqual({ deviceId: MAC, source: 'orbis', orbisVoiceId: 'libritts', orbisSid: 3 });
    });

    it('takes nothing when this device has no entry', () => {
      expect(migrateVoicePref(legacy, 'ipad-55b10d')).toBeUndefined();
      expect(readVoicePref('ipad-55b10d')).toBeUndefined();
    });

    it('never overwrites a choice made since the move', () => {
      writeVoicePref({ deviceId: MAC, source: 'orbis', orbisVoiceId: 'chosen-later' });
      expect(migrateVoicePref(legacy, MAC)).toBeUndefined();
      expect(readVoicePref(MAC)?.orbisVoiceId).toBe('chosen-later');
    });

    it('is a no-op with nothing to migrate', () => {
      expect(migrateVoicePref(undefined, MAC)).toBeUndefined();
      expect(migrateVoicePref([], MAC)).toBeUndefined();
    });
  });
});
