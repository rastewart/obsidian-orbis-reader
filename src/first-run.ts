// What a reader meets the first time — and, later, the first time after an update.
//
// **A version, not a boolean.** The flag started as "has this device been welcomed", which answers one question
// and forecloses the other: the same moment is where release notes belong, and a plugin that greets you once and
// then never speaks again has no way to say what changed. Storing the version last seen answers both from one
// value, and it is the only part of this that is expensive to change later.
//
// **Per device, not in `data.json`.** A synced value breaks in a way that is hard to see: device A updates and
// writes `0.2.0`; device B, still on 0.1.0, finds a version AHEAD of its own and says nothing; when B finally
// updates the two agree, so B never sees the notes at all. Same rule as every other consent here — it does not
// travel. See `multi-device.ts`.
//
// See docs/design/first-run.md.

import { readDeviceValue, writeDeviceValue } from './device-store';
import { CHANGELOG, nextUpdatedFrom, parseChangelog } from './release-notes';

const SEEN_VERSION_KEY = 'orbis-seen-version';

/** The plugin version this device was last told about, or null if it has never been told anything. */
export function seenVersion(): string | null {
  return readDeviceValue(SEEN_VERSION_KEY);
}

/**
 * Remembered when the greeting is SHOWN, not when it is answered.
 *
 * A flag set by "Open setup" would bring the greeting back on every launch until the reader gave in. Being shown is
 * the event; the Setup entry and its count are the standing reminder, which is quieter than anything that returns.
 */
export function markSeenVersion(version: string): void {
  writeDeviceValue(SEEN_VERSION_KEY, version);
}

const UPDATED_FROM_KEY = 'orbis-updated-from';

/**
 * The release this device was last updated from, or null on a device that has not been updated. What's new opens on
 * every release since it. Set as the plugin loads, by `nextUpdatedFrom` in `release-notes.ts`.
 *
 * **Its own value, not worked out from the seen version**, which is stamped with the current version at every load.
 * Once stamped, the version before it is gone, and What's new would lose its first page when the notice closed.
 */
export function updatedFrom(): string | null {
  return readDeviceValue(UPDATED_FROM_KEY);
}

export function markUpdatedFrom(version: string | null): void {
  writeDeviceValue(UPDATED_FROM_KEY, version);
}

/**
 * Store the release What's new counts from, as the plugin loads. Called before the seen version is stamped, while
 * `seen` still says where this device came from, and whether or not the notice is switched on, so What's new opened
 * from settings or the command palette shows the same thing.
 */
export function noteUpdatedFrom(seen: string | null, current: string): void {
  markUpdatedFrom(nextUpdatedFrom(updatedFrom(), seen, current, parseChangelog(CHANGELOG)));
}

/** For the dev resets: be a device that has never run Orbis. */
export function forgetSeenVersion(): void {
  writeDeviceValue(SEEN_VERSION_KEY, null);
  writeDeviceValue(UPDATED_FROM_KEY, null);
}

/** What, if anything, this device is owed. */
export type Greeting = 'welcome' | 'notes' | 'none';

export interface GreetingFacts {
  /** What `seenVersion()` says. */
  seen: string | null;
  /** `manifest.version`. */
  current: string;
  /** Whether there is anything written about `current` worth showing. */
  hasNotes: boolean;
}

/**
 * Decide once, from three facts, so the rule can be read rather than traced through a load sequence.
 *
 * - **Nothing seen** → this device has never been told what Orbis is: a new install, or a device the plugin reached
 *   inside a synced `.obsidian` folder, whose settings came with it. Whether `data.json` exists cannot tell those
 *   apart from a reader who has been here for months — and no such reader predates this flag, which every release
 *   has kept.
 * - **A different version** → an update. Inequality rather than "is it newer": a downgrade is rare and showing the
 *   installed version's notes is the right answer for it anyway.
 * - **No notes for this version** → say nothing. Notes are opt-in per release, so a bugfix does not earn a dialog —
 *   and the caller still stamps the version, or every launch would re-ask a question with the same answer.
 */
export function greetingFor(facts: GreetingFacts): Greeting {
  if (facts.seen === facts.current) return 'none';
  if (facts.seen === null) return 'welcome';
  return facts.hasNotes ? 'notes' : 'none';
}
