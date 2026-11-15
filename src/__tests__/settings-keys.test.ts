import { describe, expect, it } from 'vitest';
import { DEFAULT_PLUGIN_SETTINGS, type OrbisPluginSettings, SKIP_SECONDS_OPTIONS } from '../settings';
import { coerceSettingValue, readSettingKey, visibleCount, writeSettingKey } from '../settings-keys';

const fresh = (): OrbisPluginSettings => structuredClone(DEFAULT_PLUGIN_SETTINGS);

/**
 * The dotted key namespace that declarative controls bind to.
 *
 * Obsidian hands `getControlValue`/`setControlValue` a flat string, and these settings are not flat — so this is
 * the layer where a mistyped key writes a property nothing reads, or a toggle silently reports the wrong state.
 * None of that is reachable from a test through the settings tab, which is why the walking lives in its own
 * module. See docs/design/settings.md.
 */
describe('readSettingKey', () => {
  it('reads a plain field', () => {
    const s = fresh();
    s.libraryEnabled = false;
    expect(readSettingKey(s, 'libraryEnabled')).toBe(false);
  });

  it('reads a member of a visibility array', () => {
    const bag = { progressModes: [{ id: 'book-locs', visible: false }] };
    expect(readSettingKey(bag, 'progressModes.book-locs')).toBe(false);
  });

  it('treats an absent member as visible', () => {
    // A config written before a mode existed has no entry for it. Defaulting to hidden would make a new readout
    // disappear for everyone who upgraded, which is the opposite of shipping it.
    const bag = { progressModes: [] };
    expect(readSettingKey(bag, 'progressModes.book-time')).toBe(true);
  });

  it('returns undefined for a key that is not a setting', () => {
    expect(readSettingKey(fresh(), 'notASetting')).toBeUndefined();
  });

  it('reads a property of a nested settings object', () => {
    const s = fresh();
    expect(readSettingKey(s, 'bookExport.imageFormat')).toBe(s.bookExport.imageFormat);
  });
});

describe('writeSettingKey', () => {
  it('writes a plain field', () => {
    const s = fresh();
    expect(writeSettingKey(s, 'libraryEnabled', false)).toBe(true);
    expect(s.libraryEnabled).toBe(false);
  });

  it('updates an existing array member', () => {
    const bag = { progressModes: [{ id: 'book-time', visible: true }] };
    writeSettingKey(bag, 'progressModes.book-time', false);
    expect(bag.progressModes).toEqual([{ id: 'book-time', visible: false }]);
  });

  it('adds a member that was never stored', () => {
    const bag: { progressModes: { id: string; visible: boolean }[] } = { progressModes: [] };
    writeSettingKey(bag, 'progressModes.chapter-time', false);
    expect(bag.progressModes).toEqual([{ id: 'chapter-time', visible: false }]);
  });

  it('refuses a key that is not a setting, rather than inventing one', () => {
    // The failure this prevents: a typo in a definition writes `settings.libraryEnabld`, nothing reads it, and
    // the toggle appears to work until the settings are reopened.
    const s = fresh();
    expect(writeSettingKey(s, 'libraryEnabld', false)).toBe(false);
    expect('libraryEnabld' in s).toBe(false);
  });

  /**
   * **Every folder a row can set has to be settable.** These are optional fields, and the refusal above — a key not
   * already in the settings object is a typo — treats an optional field with no default exactly like one: a folder
   * dropdown that changes on screen, saves nothing, and says nothing about it. A default of `''` is what makes the
   * key present; this is the test that notices when the next optional setting forgets one.
   */
  it.each([
    'libraryRecordsFolder',
    'libraryCoversFolder',
    'epubFolder',
    'marksPdfFolder',
    'recordsFolder',
    'syncFolder',
  ])('accepts a folder for %s', (key) => {
    const s = fresh();
    expect(writeSettingKey(s, key, 'Some/Folder')).toBe(true);
    expect(readSettingKey(s, key)).toBe('Some/Folder');
  });

  it('writes a property of a nested settings object', () => {
    // `bookExport` is an ordinary object whose properties are settings in their own right, and the Book export
    // page binds to them.
    const s = fresh();
    expect(writeSettingKey(s, 'bookExport.includeImages', false)).toBe(true);
    expect(s.bookExport.includeImages).toBe(false);
  });

  it('refuses an unknown property of a nested object rather than creating it', () => {
    // The same protection a plain key gets: an unknown name here is a typo, and writing it would add a field
    // nothing reads while the row appeared to work.
    const s = fresh();
    expect(writeSettingKey(s, 'bookExport.includeImaegs', false)).toBe(false);
    expect('includeImaegs' in s.bookExport).toBe(false);
  });

  it('refuses a dotted key on a field that is neither an object nor a visibility array', () => {
    const s = fresh();
    expect(writeSettingKey(s, 'confirmDeleteNote.somehow', false)).toBe(false);
  });
});

describe('visibleCount', () => {
  const ids = ['book-percent', 'chapter-percent', 'book-locs'] as const;

  it('counts stored and defaulted members together', () => {
    const bag = { progressModes: [{ id: 'chapter-percent', visible: false }] };
    expect(visibleCount(bag, 'progressModes', ids)).toBe(2);
  });

  it('reaches one when everything else is off — which is what locks the last row', () => {
    const bag = { progressModes: ids.map((id) => ({ id, visible: id === 'book-locs' })) };
    expect(visibleCount(bag, 'progressModes', ids)).toBe(1);
  });
});

describe('lookupSections', () => {
  it('reads and writes a section by id, like the other visibility arrays', () => {
    // The look-up popup's sections are a declarative list with the same `{ id, visible }` shape as the panel tabs,
    // so the resolver needs a name on the list rather than new code — this is what proves it.
    const s = fresh();
    expect(readSettingKey(s, 'lookupSections.web')).toBe(true);
    writeSettingKey(s, 'lookupSections.web', false);
    expect(s.lookupSections.find((x) => x.id === 'web')?.visible).toBe(false);
  });

  it('leaves the order alone when a member is toggled', () => {
    // Order is display order in this one, and toggling must not disturb it: a section that switched off and on
    // again jumping to the end of the popup would be a strange thing to explain.
    const s = fresh();
    const before = s.lookupSections.map((x) => x.id);
    writeSettingKey(s, 'lookupSections.vault', false);
    expect(s.lookupSections.map((x) => x.id)).toEqual(before);
  });
});

describe('coerceSettingValue', () => {
  // A dropdown's options are keyed by string, so a dropdown control always hands back a string. Two settings
  // here are not strings, and storing the raw value puts "15" into data.json where 15 belongs.
  it('turns a skip dropdown back into a number', () => {
    expect(coerceSettingValue('skipBackSeconds', '30')).toBe(30);
    expect(coerceSettingValue('skipForwardSeconds', '5')).toBe(5);
  });

  it('falls back rather than storing a value the union does not allow', () => {
    expect(SKIP_SECONDS_OPTIONS).toContain(coerceSettingValue('skipBackSeconds', '999') as number);
    expect(coerceSettingValue('readingHighlight', 'nonsense')).not.toBe('nonsense');
  });

  it('turns the split-level dropdown back into a number', () => {
    // Unlisted here, choosing "One section" would store `"0"` — and `resolveSplitLevel` would evaluate `"0" + 1`
    // as `"01"` and walk to Heading 3. A numeric setting on a dropdown has to be named here; the
    // control cannot infer what the field holds.
    expect(coerceSettingValue('epubSplitLevel', '0')).toBe(0);
    expect(coerceSettingValue('epubSplitLevel', '3')).toBe(3);
  });

  it('keeps the split level inside the range a picker can offer', () => {
    expect(coerceSettingValue('epubSplitLevel', '9')).toBe(2);
    expect(coerceSettingValue('epubSplitLevel', 'nonsense')).toBe(2);
  });

  it('reads Read ahead’s retired Paragraph as A few sentences, and anything unknown as Sentence', () => {
    expect(coerceSettingValue('readAhead', 'paragraph')).toBe('few-sentences');
    expect(coerceSettingValue('readAhead', 'few-sentences')).toBe('few-sentences');
    expect(coerceSettingValue('readAhead', 'passage')).toBe('sentence');
    expect(coerceSettingValue('readAhead', undefined)).toBe('sentence');
  });

  it('leaves everything else alone', () => {
    expect(coerceSettingValue('keepScreenAwakeWhileListening', true)).toBe(true);
  });
});
