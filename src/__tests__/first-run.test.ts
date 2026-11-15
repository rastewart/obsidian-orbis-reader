// Who gets greeted, and with what.
//
// `greetingFor` is three facts in and one word out, which is the whole reason it is a function: the alternative is
// the same rule spread through a load sequence, where "why was I greeted?" can only be answered by re-running it.

import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDeviceStoreApp } from '../device-store';
import { forgetSeenVersion, type GreetingFacts, greetingFor, markSeenVersion, seenVersion } from '../first-run';

const facts = (over: Partial<GreetingFacts> = {}): GreetingFacts => ({
  seen: null,
  current: '0.2.0',
  hasNotes: false,
  ...over,
});

/** A vault whose local storage is its own — `device-store` needs one. */
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

describe('greetingFor', () => {
  /**
   * **A device that has never been told, whether or not settings exist.** A device the plugin reached inside a synced
   * `.obsidian` folder has a `data.json` from its first load, and a dev reset of this one value has to bring the
   * welcome back — so the file's presence is not asked.
   */
  // Being new outranks being told what changed.
  it('greets a device that has never seen a version, even with notes to show', () => {
    expect(greetingFor(facts({ seen: null }))).toBe('welcome');
    expect(greetingFor(facts({ seen: null, hasNotes: true }))).toBe('welcome');
  });

  it('says nothing on a version it has already spoken about', () => {
    expect(greetingFor(facts({ seen: '0.2.0', current: '0.2.0', hasNotes: true }))).toBe('none');
  });

  it('shows notes on an update, when there are any', () => {
    expect(greetingFor(facts({ seen: '0.1.0', hasNotes: true }))).toBe('notes');
  });

  // Notes are opt-in per release. A bugfix with nothing to say does not earn a dialog.
  it('stays quiet on an update with nothing written about it', () => {
    expect(greetingFor(facts({ seen: '0.1.0', hasNotes: false }))).toBe('none');
  });

  // Rare, and the installed version's notes are the right answer for it anyway.
  it('treats a downgrade as an update rather than as a special case', () => {
    expect(greetingFor(facts({ seen: '0.3.0', current: '0.2.0', hasNotes: true }))).toBe('notes');
  });
});

describe('the seen version', () => {
  beforeEach(() => {
    setDeviceStoreApp(fakeVault());
    forgetSeenVersion();
  });

  it('is unset until this device is told something', () => {
    expect(seenVersion()).toBeNull();
    markSeenVersion('0.2.0');
    expect(seenVersion()).toBe('0.2.0');
  });

  it('is forgotten by the dev reset, so the greeting can be met again', () => {
    markSeenVersion('0.2.0');
    forgetSeenVersion();
    expect(seenVersion()).toBeNull();
  });
});
