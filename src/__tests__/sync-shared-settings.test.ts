// The traveling settings: the destinations and the flags that say a destination has already been asked about.
//
// Two properties carry the weight. The list is a WHITELIST — these payloads are files in a vault, so a hand-edited or
// foreign one must not be able to reach a key nobody agreed travels. And the apply answers WHICH keys moved, because
// several of them reach outside `data.json`: a ribbon icon, an open reader, a folder something is about to write to.

import { describe, expect, it } from 'vitest';
import { DEFAULT_PLUGIN_SETTINGS, type OrbisPluginSettings } from '../settings';
import { applyShared, pickShared, SHARED_SETTINGS_KEYS, type SharedSettings } from '../sync/shared-settings';

const fresh = (): OrbisPluginSettings => structuredClone(DEFAULT_PLUGIN_SETTINGS);

describe('pickShared', () => {
  it('takes the keys on the list and nothing else', () => {
    const s = fresh();
    const picked = pickShared(s) as Record<string, unknown>;
    expect(Object.keys(picked).sort()).toEqual([...SHARED_SETTINGS_KEYS].sort().filter((k) => k in picked));
    // A sample of what must never be in there: consent, a dismissal, and the reader's own respellings.
    for (const key of ['bookSourcesEnabled', 'epubFetchRemoteImages', 'libraryUncatalogedDismissed', 'pronunciations'])
      expect(picked[key]).toBeUndefined();
  });

  /**
   * **The split *Read in Orbis Reader* rests on**, which is the kind of rule that rots without a test: a setting
   * deciding what is WRITTEN INTO THE VAULT travels; one deciding what THIS DEVICE does with it does not.
   *
   * The Type lands in a title note every device reads, so a device-local answer would file the same book under
   * two Types depending on which device made it. How the book opens, and which bar comes with it, are the
   * opposite — read on the tablet, listen on the phone is two devices being used for what they are good at, not
   * a disagreement to reconcile.
   *
   * The per-device half lives in `DeviceSettings` and so cannot appear here by construction; the assertion is
   * that nobody later moves it across, which is a one-line change with no other symptom.
   */
  it('carries the converted-book Type and none of the per-device opening settings', () => {
    const picked = pickShared(fresh()) as Record<string, unknown>;
    expect(picked.readInOrbisType).toBe('obsidian-note');
    for (const key of ['readInOrbisMode', 'readInOrbisBar', 'readInOrbisNoticed'])
      expect(picked[key], key).toBeUndefined();
  });

  it('leaves out a key this device does not hold, rather than publishing undefined', () => {
    const s = fresh();
    delete s.librarySetupDone;
    expect('librarySetupDone' in (pickShared(s) as Record<string, unknown>)).toBe(false);
  });

  it('round-trips through apply', () => {
    const from = fresh();
    from.libraryRecordsFolder = 'Library/Titles';
    from.recordsMode = 'off';
    from.syncFolder = 'Orbis/Sync';
    const to = fresh();
    applyShared(to, pickShared(from));
    expect(to.libraryRecordsFolder).toBe('Library/Titles');
    expect(to.recordsMode).toBe('off');
    expect(to.syncFolder).toBe('Orbis/Sync');
  });
});

describe('applyShared', () => {
  it('answers only the keys that actually moved', () => {
    const to = fresh();
    const arriving: SharedSettings = { libraryRecordsFolder: 'Library/Titles', recordsFolder: to.recordsFolder };
    expect(applyShared(to, arriving)).toEqual(['libraryRecordsFolder']);
  });

  it('answers nothing when the two already agree, so no side effect fires', () => {
    // The caller repaints views and re-applies the ribbon on the strength of this list; an empty answer has to mean
    // "nothing to do" or every scan would flicker the Library.
    const to = fresh();
    expect(applyShared(to, pickShared(fresh()))).toEqual([]);
  });

  it('refuses a key that is not on the list, whatever the file says', () => {
    // The failure this prevents: a payload written by a version that shares more — or by hand — replacing the
    // glossary or granting this device permission to contact a server.
    const to = fresh();
    const hostile = {
      libraryRecordsFolder: 'Library/Titles',
      pronunciations: [{ word: 'x', say: 'y', enabled: true }],
      bookSourcesEnabled: true,
      // Not a settings key at all any more — it moved to device storage as consent — so it must land nowhere.
      epubFetchRemoteImages: true,
    } as unknown as SharedSettings;
    expect(applyShared(to, hostile)).toEqual(['libraryRecordsFolder']);
    expect(to.pronunciations).toEqual([]);
    // Both of these are consent, and consent lives beside the device — so neither is a settings key at all now, and
    // a payload naming them must land nowhere rather than granting this device permission it was never given.
    const bag = to as unknown as Record<string, unknown>;
    expect(bag.bookSourcesEnabled).toBeUndefined();
    expect(bag.epubFetchRemoteImages).toBeUndefined();
  });

  it('survives a payload that is missing, empty or not an object', () => {
    const to = fresh();
    expect(applyShared(to, undefined)).toEqual([]);
    expect(applyShared(to, {})).toEqual([]);
    expect(applyShared(to, 'nonsense' as unknown as SharedSettings)).toEqual([]);
  });

  it('carries a nested object whole — the book-export defaults', () => {
    const to = fresh();
    const changed = applyShared(to, {
      bookExport: { defaultExportFolder: 'Exports', perChapter: false, includeImages: false, imageFormat: 'markdown' },
    });
    expect(changed).toEqual(['bookExport']);
    expect(to.bookExport.defaultExportFolder).toBe('Exports');
    expect(to.bookExport.perChapter).toBe(false);
  });

  it('carries the look-up lists, order included', () => {
    const to = fresh();
    const reordered = [...to.lookupSections].reverse();
    expect(applyShared(to, { lookupSections: reordered })).toEqual(['lookupSections']);
    expect(to.lookupSections.map((s) => s.id)).toEqual(reordered.map((s) => s.id));
  });
});

/**
 * Book sources: the one item split three ways on purpose — the catalogs travel, the permission stays beside the
 * device, and the passwords are in `app.secretStorage`, which is per device by construction.
 */
describe('book sources', () => {
  it('carries the catalog list', () => {
    const from = fresh();
    from.bookSources = [
      { id: 'calibre-home', name: 'Calibre', url: 'http://nas.local:8080/opds', enabled: true, builtin: false },
    ];
    const to = fresh();
    expect(applyShared(to, pickShared(from))).toContain('bookSources');
    expect(to.bookSources[0]).toMatchObject({ id: 'calibre-home', url: 'http://nas.local:8080/opds' });
  });

  it('carries no credential, because a source holds none', () => {
    // Both halves live in the device's secret store (`passwordIdFor`, `usernameIdFor`), so a source arrives usable and
    // unauthenticated — the honest state, since this device has not been told who to sign in as.
    const from = fresh();
    from.bookSources = [{ id: 'x', name: 'X', url: 'https://x/opds', enabled: true, builtin: false }];
    const payload = JSON.stringify(pickShared(from));
    expect(payload).not.toContain('password');
    expect(payload).not.toContain('"user"');
  });
});
