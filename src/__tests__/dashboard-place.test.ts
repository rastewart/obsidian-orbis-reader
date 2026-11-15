// The dashboard arrangement, kept per device AND per vault — a test vault's layout says nothing about the real one's.

import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import {
  migrateDashboardPlaces,
  readActiveDashboard,
  readDashboardOrder,
  writeActiveDashboard,
  writeDashboardOrder,
} from '../library/dashboard-place';

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

describe('this device’s dashboard arrangement', () => {
  beforeEach(() => setDeviceStoreApp(fakeVault()));

  it('is undefined until this device has arranged anything', () => {
    expect(readDashboardOrder()).toBeUndefined();
    expect(readActiveDashboard()).toBe('');
  });

  it('round-trips an order', () => {
    writeDashboardOrder([
      { id: 'd1', enabled: true },
      { id: 'd2', enabled: false },
    ]);
    expect(readDashboardOrder()).toEqual([
      { id: 'd1', enabled: true },
      { id: 'd2', enabled: false },
    ]);
  });

  it('drops entries that are not places, rather than carrying them forever', () => {
    const app = fakeVault();
    app.saveLocalStorage('orbis-dashboard-order', JSON.stringify([{ id: 'd1', enabled: true }, 7, null, {}]));
    setDeviceStoreApp(app);
    expect(readDashboardOrder()).toEqual([{ id: 'd1', enabled: true }]);
  });

  it('survives a value it did not write', () => {
    const app = fakeVault();
    app.saveLocalStorage('orbis-dashboard-order', 'not json');
    setDeviceStoreApp(app);
    expect(readDashboardOrder()).toBeUndefined();
  });

  it('forgets the open dashboard when there is none', () => {
    writeActiveDashboard('d1');
    writeActiveDashboard('');
    expect(readActiveDashboard()).toBe('');
  });

  it('is separate in each vault', () => {
    const one = fakeVault();
    const two = fakeVault();
    setDeviceStoreApp(one);
    writeActiveDashboard('d-real');
    setDeviceStoreApp(two);
    expect(readActiveDashboard()).toBe('');
    setDeviceStoreApp(one);
    expect(readActiveDashboard()).toBe('d-real');
  });

  describe('migration out of data.json', () => {
    it('takes the order and the open dashboard', () => {
      expect(migrateDashboardPlaces([{ id: 'd1', enabled: false }], 'd1')).toBe(true);
      expect(readDashboardOrder()).toEqual([{ id: 'd1', enabled: false }]);
      expect(readActiveDashboard()).toBe('d1');
    });

    it('takes nothing when there was nothing to take', () => {
      expect(migrateDashboardPlaces(undefined, '')).toBe(false);
    });

    it('never overwrites an arrangement made since the move', () => {
      writeDashboardOrder([{ id: 'd9', enabled: true }]);
      expect(migrateDashboardPlaces([{ id: 'd1', enabled: true }], 'd1')).toBe(false);
      expect(readDashboardOrder()).toEqual([{ id: 'd9', enabled: true }]);
    });
  });
});
