// The hybrid logical clock. Every test here is one of the two properties it exists to hold at once — an edit sorts
// after anything the device had seen, and of two independent edits the later one wins — or one of the ways a device's
// own clock can be wrong.
//
// `now` is a parameter rather than a call to `Date.now()`, which is what makes a skewed clock a test rather than a
// story about two devices in a room.

import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import { currentClock, nextVersion, observeVersion, resetClock } from '../sync/clock';
import { compareVersions, type SyncVersion } from '../sync/records';

/** One vault's scoped storage. */
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

const T = (iso: string): number => Date.parse(iso);
const TEN = T('2026-08-26T10:00:00.000Z');
const later = (a: SyncVersion, b: SyncVersion): boolean => compareVersions(a, b, 'x', 'x') > 0;

describe('the hybrid logical clock', () => {
  beforeEach(() => setDeviceStoreApp(fakeVault()));

  it('takes the wall clock when it has moved on, and resets the tiebreak', () => {
    expect(nextVersion(TEN)).toEqual({ at: '2026-08-26T10:00:00.000Z', clock: 0 });
    expect(nextVersion(TEN + 1000)).toEqual({ at: '2026-08-26T10:00:01.000Z', clock: 0 });
  });

  it('counts within one millisecond, so two edits are never one version', () => {
    expect(nextVersion(TEN)).toMatchObject({ clock: 0 });
    expect(nextVersion(TEN)).toMatchObject({ clock: 1 });
    expect(nextVersion(TEN)).toMatchObject({ clock: 2 });
  });

  it('never hands out the same version twice, even standing still', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(JSON.stringify(nextVersion(TEN)));
    expect(seen.size).toBe(50);
  });

  /**
   * The property a plain wall clock cannot hold: an edit made on top of something must sort after it, even on a
   * device whose own clock is behind. Without it the reader's change loses to the version it was editing, silently.
   */
  it('carries a version from the future forward, so the next edit still wins', () => {
    const theirs: SyncVersion = { at: '2026-08-26T10:05:00.000Z', clock: 0 };
    observeVersion(theirs, TEN); // our clock reads 10:00; theirs says 10:05
    const mine = nextVersion(TEN); // still 10:00 by our reckoning
    expect(mine.at).toBe('2026-08-26T10:05:00.000Z'); // …but stamped with what we have seen
    expect(later(mine, theirs)).toBe(true);
  });

  it('is not dragged backwards by seeing something older', () => {
    nextVersion(TEN + 5000);
    observeVersion({ at: '2026-08-26T10:00:00.000Z', clock: 3 }, TEN + 5000);
    expect(currentClock().l).toBe(TEN + 5000);
  });

  it('keeps counting past a version that shares its time', () => {
    nextVersion(TEN); // ours: 10:00 #0
    observeVersion({ at: '2026-08-26T10:00:00.000Z', clock: 7 }, TEN);
    expect(nextVersion(TEN)).toMatchObject({ clock: 9 }); // past both, not merely past our own
  });

  /**
   * Two devices, one offline, each renaming the same dashboard. A plain edit counter would let the device that had
   * edited MOST win regardless of when, so the later edit would vanish.
   */
  it('lets the later edit win between two independent devices', () => {
    // The phone, offline, with a long history of edits behind it.
    setDeviceStoreApp(fakeVault());
    for (let i = 0; i < 20; i++) nextVersion(TEN - 60_000);
    const phone = nextVersion(T('2026-08-26T10:22:33.000Z'));

    // The Mac, barely used, renaming the same thing half a minute later.
    setDeviceStoreApp(fakeVault());
    const mac = nextVersion(T('2026-08-26T10:23:10.000Z'));

    expect(later(mac, phone)).toBe(true);
  });

  it('counts separately in each vault', () => {
    const one = fakeVault();
    const two = fakeVault();
    setDeviceStoreApp(one);
    nextVersion(TEN);
    setDeviceStoreApp(two);
    expect(currentClock()).toEqual({ l: 0, c: 0 }); // the other vault's counting says nothing here
    setDeviceStoreApp(one);
    expect(currentClock().l).toBe(TEN);
  });

  it('treats an unreadable clock as a fresh one rather than failing', () => {
    const app = fakeVault();
    app.saveLocalStorage('orbis-sync-clock', 'not a clock');
    setDeviceStoreApp(app);
    expect(currentClock()).toEqual({ l: 0, c: 0 });
    expect(nextVersion(TEN)).toMatchObject({ at: '2026-08-26T10:00:00.000Z', clock: 0 });
  });

  it('ignores a version whose time cannot be read', () => {
    nextVersion(TEN);
    observeVersion({ at: 'sometime last Tuesday', clock: 2 }, TEN);
    expect(currentClock().l).toBe(TEN); // not moved to NaN, and not to zero
  });

  it('can be reset, for the dev command', () => {
    nextVersion(TEN);
    resetClock();
    expect(currentClock()).toEqual({ l: 0, c: 0 });
  });
});
