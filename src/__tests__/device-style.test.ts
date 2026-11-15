import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import { migrateDeviceStyle, readDeviceStyle, writeDeviceStyle } from '../device-style';
import type { DisplayStyle } from '../settings';

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

const style = (id: string, deviceId?: string, fontSize = 18): DisplayStyle => ({
  id,
  name: deviceId ? 'device-default' : 'Evening',
  deviceId,
  settings: { fontSize } as unknown as DisplayStyle['settings'],
  createdAt: 1,
});

describe("a device's own display style", () => {
  beforeEach(() => setDeviceStoreApp(fakeVault()));

  it('is undefined until one is made', () => {
    expect(readDeviceStyle(MAC)).toBeUndefined();
  });

  it('round-trips, and carries the device it was read for', () => {
    writeDeviceStyle(style('sty-1', MAC, 21));
    const read = readDeviceStyle(MAC);
    expect(read?.id).toBe('sty-1');
    expect(read?.deviceId).toBe(MAC); // what the settings page uses to know it cannot be renamed
    expect((read!.settings as unknown as { fontSize: number }).fontSize).toBe(21);
  });

  it('does not store the device id, so a copied vault does not claim the wrong device', () => {
    writeDeviceStyle(style('sty-1', MAC));
    expect(readDeviceStyle(PHONE)?.deviceId).toBe(PHONE);
  });

  it('is separate in each vault — a test vault’s fonts say nothing about the real one’s', () => {
    const one = fakeVault();
    const two = fakeVault();
    setDeviceStoreApp(one);
    writeDeviceStyle(style('sty-one', MAC, 14));
    setDeviceStoreApp(two);
    expect(readDeviceStyle(MAC)).toBeUndefined();
    writeDeviceStyle(style('sty-two', MAC, 22));
    setDeviceStoreApp(one);
    expect((readDeviceStyle(MAC)!.settings as unknown as { fontSize: number }).fontSize).toBe(14);
  });

  it('survives a value it did not write', () => {
    const app = fakeVault();
    app.saveLocalStorage('orbis-device-style', 'not json');
    setDeviceStoreApp(app);
    expect(readDeviceStyle(MAC)).toBeUndefined();
  });

  describe('migration out of data.json', () => {
    const styles = [style('sty-named'), style('sty-mac', MAC), style('sty-phone', PHONE)];

    it("takes this device's, and leaves the named ones and other devices' alone", () => {
      const taken = migrateDeviceStyle(styles, MAC);
      expect(taken?.id).toBe('sty-mac');
      expect(readDeviceStyle(MAC)?.id).toBe('sty-mac');
      // The caller drops it from the array; the others are untouched by this function.
      expect(styles.map((s) => s.id)).toContain('sty-named');
    });

    it('takes nothing for a device with no style in the array', () => {
      expect(migrateDeviceStyle(styles, 'ipad-55b10d')).toBeUndefined();
    });

    it('never overwrites one already stored here', () => {
      writeDeviceStyle(style('sty-current', MAC, 30));
      expect(migrateDeviceStyle(styles, MAC)).toBeUndefined();
      expect(readDeviceStyle(MAC)?.id).toBe('sty-current');
    });
  });
});
