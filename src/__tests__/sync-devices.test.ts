// The device roster. Two properties matter more than the rest: a device only ever writes its OWN entry, and a roster
// that already agrees comes back unchanged — because anything else would publish a file on every scan and the folder
// would never go quiet, which is the property the whole design is built around.

import { describe, expect, it } from 'vitest';
import { type DeviceInfo, dayOf, describeRoster, nameOf, rosterWithSelf } from '../sync/devices';

const device = (id: string, name: string, lastSeen = '2026-08-27'): DeviceInfo => ({ id, name, lastSeen });

describe('dayOf', () => {
  it('keeps the date and drops the time — see why in the file header', () => {
    expect(dayOf(Date.parse('2026-08-27T23:14:52.812Z'))).toBe('2026-08-27');
  });
});

describe('rosterWithSelf', () => {
  const self = device('mac', 'Mac', '2026-08-27');

  it('adds this device when the roster has never heard of it', () => {
    expect(rosterWithSelf([], self)).toEqual([self]);
  });

  it('returns the same entry when nothing about it has changed', () => {
    // The point of the test: an unchanged payload means an unchanged hash, which means no version and no write.
    const roster = [device('phone', 'Pixel'), self];
    const after = rosterWithSelf(roster, { ...self });
    expect(after.find((d) => d.id === 'mac')).toBe(roster.find((d) => d.id === 'mac'));
  });

  it('updates this device’s name', () => {
    const after = rosterWithSelf([device('mac', 'Macbook')], { ...self, name: 'Mac Studio' });
    expect(after).toEqual([device('mac', 'Mac Studio')]);
  });

  it('updates this device’s day when it rolls over', () => {
    const after = rosterWithSelf([device('mac', 'Mac', '2026-08-26')], self);
    expect(after[0].lastSeen).toBe('2026-08-27');
  });

  it('never touches another device’s entry — that record is theirs to write', () => {
    const phone = device('phone', 'Pixel', '2026-01-01');
    const after = rosterWithSelf([phone], self);
    expect(after.find((d) => d.id === 'phone')).toBe(phone);
  });

  it('is ordered by id, so two devices publish the same list', () => {
    const one = rosterWithSelf([device('zzz', 'Last'), device('aaa', 'First')], self);
    const other = rosterWithSelf([device('aaa', 'First'), device('zzz', 'Last')], self);
    expect(one.map((d) => d.id)).toEqual(['aaa', 'mac', 'zzz']);
    expect(other.map((d) => d.id)).toEqual(one.map((d) => d.id));
  });
});

describe('nameOf', () => {
  it('answers with the name', () => {
    expect(nameOf([device('mac', 'Mac Studio')], 'mac')).toBe('Mac Studio');
  });

  it('falls back to the id for a device nobody named, rather than inventing one', () => {
    // "Unknown device" would be worse than the string a reader can match against the Devices page.
    expect(nameOf([device('mac', '   ')], 'mac')).toBe('mac');
    expect(nameOf([], 'tce0313qaamb')).toBe('tce0313qaamb');
  });
});

describe('describeRoster', () => {
  it('says who is here, most recent first, and marks this device', () => {
    const lines = describeRoster([device('mac', 'Mac', '2026-08-20'), device('pad', 'iPad', '2026-08-27')], 'mac');
    expect(lines[0]).toContain('iPad');
    expect(lines[1]).toContain('(this one)');
  });

  it('says so when nothing has been published', () => {
    expect(describeRoster([], 'mac')).toEqual(['devices: none published yet']);
  });
});
