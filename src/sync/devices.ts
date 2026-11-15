// Who is in this vault: one record per device, holding its name and roughly when it was last here.
//
// **The only type where the item IS the device that writes it.** Every other type can be authored anywhere and
// republished by anyone; a device's own record is written by that device and nobody else, which makes it
// single-writer by construction rather than by rule.
//
// It exists because the merge speaks in ids and people do not. A scan that adopts something can now say "updated from
// the Mac" rather than naming `tce0313qaamb`, the Undo notice the design calls for has something to put in a
// sentence, and a reader can see which devices are participating without opening a folder.
//
// **The `lastSeen` date is a DATE, not a timestamp**, and that is the whole reason this type does not spoil the
// design's best property. A timestamp would change on every scan, so the record's hash would change on every scan, so
// every device would publish a file on every scan and the folder would never go quiet — the steady state this design
// exists to keep. A day is as precise as "which devices are still in use" needs, and it means one write per device
// per day at most.
//
// See docs/design/multi-device-sync.md §A device should be able to name another device.

/** One device, as the vault knows it. The id is both the item id and the author. */
export interface DeviceInfo {
  id: string;
  /** What the reader called it, or '' if they never did. */
  name: string;
  /** `YYYY-MM-DD` in UTC — see the file header for why this is not a timestamp. */
  lastSeen: string;
}

/** The day part of an ISO timestamp, which is all this type keeps. */
export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * The roster with this device's own entry brought up to date.
 *
 * Only our own entry: another device's record is that device's to write, and rewriting it here would be two devices
 * claiming one item. Nothing else in the list is touched, so a roster that already agrees comes back unchanged and
 * the stamping stays quiet.
 */
export function rosterWithSelf(roster: readonly DeviceInfo[], self: DeviceInfo): DeviceInfo[] {
  const rest = roster.filter((device) => device.id !== self.id);
  const held = roster.find((device) => device.id === self.id);
  // Same values, same object: `stampType` compares payloads, and handing it a fresh object with identical contents
  // would be fine — but keeping the original makes it obvious in a debugger that nothing moved.
  const ours = held && held.name === self.name && held.lastSeen === self.lastSeen ? held : self;
  return [...rest, ours].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * A device's name, or its id when it has none.
 *
 * The id is the honest fallback: a device nobody named has no name to show, and inventing one ("Unknown device") would
 * be worse than the string a reader can at least match against the Devices page.
 */
export function nameOf(roster: readonly DeviceInfo[], id: string): string {
  const found = roster.find((device) => device.id === id);
  return found?.name.trim() ? found.name.trim() : id;
}

/** The roster as lines for the dev status command, newest first — "who is in this vault, and when were they last here". */
export function describeRoster(roster: readonly DeviceInfo[], selfId: string): string[] {
  if (roster.length === 0) return ['devices: none published yet'];
  return [...roster]
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.id.localeCompare(b.id))
    .map((device) => {
      const name = device.name.trim() || '(unnamed)';
      return `device ${device.id}${device.id === selfId ? ' (this one)' : ''} — ${name}, last seen ${device.lastSeen}`;
    });
}
