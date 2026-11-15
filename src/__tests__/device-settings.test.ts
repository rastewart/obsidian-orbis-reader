// This device's own chrome, kept out of `data.json` so that syncing that file directly gives the same result as
// letting Orbis publish. The migration is where the care is: a default must not be able to masquerade as an answer.

import type { App } from 'obsidian';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_SETTINGS,
  deviceSetting,
  deviceSettings,
  forgetDeviceSettings,
  isDeviceSettingField,
  isDeviceSettingKey,
  migrateDeviceSettings,
  readDeviceSettingKey,
  renameLegacyProgressModes,
  setDeviceSetting,
  setDeviceSettingValue,
  writeDeviceSettingKey,
} from '../device-settings';
import { setDeviceStoreApp } from '../device-store';

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

const use = (app: App): void => {
  setDeviceStoreApp(app);
  forgetDeviceSettings();
};

describe('device settings', () => {
  beforeEach(() => use(fakeVault()));

  it('starts at the defaults', () => {
    expect(deviceSettings()).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(deviceSetting('showTocButton')).toBe(true);
    expect(deviceSetting('showDebugButton')).toBe(false);
  });

  it('round-trips one setting without disturbing the rest', () => {
    setDeviceSetting('showTocButton', false);
    expect(deviceSetting('showTocButton')).toBe(false);
    expect(deviceSetting('showSearchButton')).toBe(true);
  });

  it('survives a reload from storage', () => {
    const app = fakeVault();
    use(app);
    setDeviceSetting('showFocusButton', false);
    forgetDeviceSettings(); // as if the plugin had restarted
    expect(deviceSetting('showFocusButton')).toBe(false);
  });

  it('fills in a key written by an earlier version', () => {
    // `undefined` reaching `toggle(visible)` hides a button nobody asked to hide, so a partial blob is merged over
    // the defaults rather than trusted.
    const app = fakeVault();
    app.saveLocalStorage('orbis-device-settings', JSON.stringify({ showTocButton: false }));
    use(app);
    expect(deviceSetting('showTocButton')).toBe(false);
    expect(deviceSetting('showTtsButton')).toBe(true);
  });

  it('survives a value it did not write', () => {
    const app = fakeVault();
    app.saveLocalStorage('orbis-device-settings', 'not json');
    use(app);
    expect(deviceSettings()).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it('is separate in each vault', () => {
    const one = fakeVault();
    const two = fakeVault();
    use(one);
    setDeviceSetting('showSearchButton', false);
    use(two);
    expect(deviceSetting('showSearchButton')).toBe(true);
    use(one);
    expect(deviceSetting('showSearchButton')).toBe(false);
  });

  it('knows which keys are its own', () => {
    expect(isDeviceSettingKey('showTocButton')).toBe(true);
    expect(isDeviceSettingKey('libraryRecordsFolder')).toBe(false);
    expect(isDeviceSettingKey('nonsense')).toBe(false);
  });
});

describe('migrating out of data.json', () => {
  beforeEach(() => use(fakeVault()));

  it('carries the answers a reader gave', () => {
    expect(migrateDeviceSettings({ showTocButton: false, showDebugButton: true })).toEqual([
      'showTocButton',
      'showDebugButton',
    ]);
    expect(deviceSetting('showTocButton')).toBe(false);
    expect(deviceSetting('showDebugButton')).toBe(true);
  });

  it('carries nothing from a file that never held these', () => {
    // Which is the point of taking the RAW settings: a merged object always holds every key, so every device would
    // look as though it had answered, and a later change of default could never reach it.
    expect(migrateDeviceSettings({})).toEqual([]);
    expect(deviceSettings()).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it('ignores a value of the wrong shape', () => {
    expect(migrateDeviceSettings({ showTocButton: 'no' })).toEqual([]);
  });

  it('leaves untouched keys at their defaults rather than at false', () => {
    migrateDeviceSettings({ showTocButton: false });
    expect(deviceSetting('showSearchButton')).toBe(true);
  });

  it('never overwrites an answer given since the move', () => {
    setDeviceSetting('showTocButton', true);
    expect(migrateDeviceSettings({ showTocButton: false })).toEqual([]);
    expect(deviceSetting('showTocButton')).toBe(true);
  });
});

/**
 * Device settings include types other than booleans, and a declarative control hands back whatever its widget
 * yields — a dropdown's options are keyed by string, so a number setting arrives as `"15"`.
 */
describe('values that are not booleans', () => {
  beforeEach(() => use(fakeVault()));

  it('keeps a number a number', () => {
    setDeviceSettingValue('ttsRate', '1.5');
    expect(deviceSetting('ttsRate')).toBe(1.5);
  });

  it('keeps a numeric union numeric', () => {
    setDeviceSettingValue('skipBackSeconds', '30');
    expect(deviceSetting('skipBackSeconds')).toBe(30);
  });

  it('keeps a string union a string', () => {
    setDeviceSettingValue('playbackSource', 'live');
    expect(deviceSetting('playbackSource')).toBe('live');
  });

  it('coerces a boolean row through the same door', () => {
    setDeviceSettingValue('keyboardPageTurn', false);
    expect(deviceSetting('keyboardPageTurn')).toBe(false);
  });

  it('migrates values of every shape, and refuses ones of the wrong shape', () => {
    const moved = migrateDeviceSettings({ ttsRate: 1.25, playbackSource: 'live', skipBackSeconds: '30' });
    expect(moved.sort()).toEqual(['playbackSource', 'ttsRate']);
    expect(deviceSetting('ttsRate')).toBe(1.25);
    expect(deviceSetting('playbackSource')).toBe('live');
    expect(deviceSetting('skipBackSeconds')).toBe(15); // a string where a number belongs is not carried
  });
});

/**
 * The progress readouts use the dotted-key namespace: `progressModes.book-locs` names a member of a
 * visibility array, and the walker that reads it is the same one the traveling settings use — two implementations
 * of that would come to disagree about what a member key means.
 */
describe('the dotted keys', () => {
  beforeEach(() => use(fakeVault()));

  it('knows a member key belongs to a device setting', () => {
    expect(isDeviceSettingField('progressModes.book-locs')).toBe(true);
    expect(isDeviceSettingField('progressMode')).toBe(true);
    expect(isDeviceSettingField('lookupSections.web')).toBe(false); // that array still travels
  });

  it('reads an absent member as visible', () => {
    // A readout added in a later version has no entry, and defaulting it to hidden would make it vanish for
    // everyone who upgraded.
    writeDeviceSettingKey('progressModes.book-locs', false);
    expect(readDeviceSettingKey('progressModes.book-locs')).toBe(false);
    expect(readDeviceSettingKey('progressModes.book-time')).toBe(true);
  });

  it('persists a member write', () => {
    writeDeviceSettingKey('progressModes.chapter-time', false);
    forgetDeviceSettings();
    expect(readDeviceSettingKey('progressModes.chapter-time')).toBe(false);
  });

  it('does not edit the defaults when it pushes a member', () => {
    // The walker mutates in place, so a shared array would be the DEFAULTS being edited — and every later vault
    // would start with this device's answer.
    writeDeviceSettingKey('progressModes.book-locs', false);
    use(fakeVault());
    expect(readDeviceSettingKey('progressModes.book-locs')).toBe(true);
  });

  it('refuses a key nothing recognises', () => {
    expect(writeDeviceSettingKey('nonsense', true)).toBe(false);
  });
});

describe('renameLegacyProgressModes', () => {
  beforeEach(() => use(fakeVault()));

  it('renames the legacy page ids', () => {
    migrateDeviceSettings({
      progressMode: 'book-pages',
      progressModes: [
        { id: 'book-pages', visible: true },
        { id: 'chapter-pages', visible: false },
      ],
    });
    renameLegacyProgressModes();
    expect(deviceSetting('progressMode')).toBe('book-locs');
    expect(deviceSetting('progressModes').map((m) => m.id)).toEqual(['book-locs', 'chapter-locs']);
  });

  it('writes nothing when there is nothing to rename', () => {
    const before = JSON.stringify(deviceSettings());
    renameLegacyProgressModes();
    expect(JSON.stringify(deviceSettings())).toBe(before);
  });
});

/**
 * A notice and its dismissal, the palette's dev switch, and one CONSENT flag.
 *
 * `epubFetchRemoteImages` is the interesting one — it is not chrome. It is "may this plugin fetch images from the
 * web", and consent is a decision about a device on a network, which is the same line book sources' switch sits on.
 * Where the images LAND is a fact about the vault and travels with the other destinations.
 */
describe('the odds and ends', () => {
  beforeEach(() => use(fakeVault()));

  it('starts at its defaults', () => {
    expect(deviceSetting('libraryUncatalogedAlert')).toBe(true);
    expect(deviceSetting('libraryUncatalogedDismissed')).toBe('');
    expect(deviceSetting('showDevOptions')).toBe(false);
    expect(deviceSetting('epubFetchRemoteImages')).toBe(false);
  });

  it('keeps a dismissal signature, which is a string rather than a flag', () => {
    setDeviceSetting('libraryUncatalogedDismissed', 'sig:12:abc');
    forgetDeviceSettings();
    expect(deviceSetting('libraryUncatalogedDismissed')).toBe('sig:12:abc');
  });

  it('does not carry a dismissal between vaults', () => {
    // Waving away a notice in one vault must not tell another that a question it never asked was answered.
    const real = fakeVault();
    use(real);
    setDeviceSetting('libraryUncatalogedDismissed', 'sig:1');
    use(fakeVault());
    expect(deviceSetting('libraryUncatalogedDismissed')).toBe('');
  });

  it('migrates all four out of an older file', () => {
    const moved = migrateDeviceSettings({
      libraryUncatalogedAlert: false,
      libraryUncatalogedDismissed: 'sig:9',
      showDevOptions: true,
      epubFetchRemoteImages: true,
    });
    expect(moved.sort()).toEqual([
      'epubFetchRemoteImages',
      'libraryUncatalogedAlert',
      'libraryUncatalogedDismissed',
      'showDevOptions',
    ]);
    expect(deviceSetting('showDevOptions')).toBe(true);
    expect(deviceSetting('libraryUncatalogedDismissed')).toBe('sig:9');
  });
});
