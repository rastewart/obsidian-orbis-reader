// Every list in the settings within its shape, so one damaged entry cannot stop the plugin loading.
// Each bad value here stopped the plugin loading on every launch.

import { describe, expect, it } from 'vitest';
import { DEFAULT_PLUGIN_SETTINGS, type OrbisPluginSettings } from '../settings';
import { settleSettingsShapes } from '../settings-shapes';

/** Settings as `loadSettings` builds them: the defaults, with what `data.json` held laid over them. */
const settingsWith = (raw: Record<string, unknown>): OrbisPluginSettings =>
  Object.assign({}, structuredClone(DEFAULT_PLUGIN_SETTINGS), raw);

describe('settleSettingsShapes', () => {
  it('leaves the default settings as they are', () => {
    const settings = settingsWith({});
    expect(settleSettingsShapes(settings)).toEqual([]);
    expect(settings).toEqual(DEFAULT_PLUGIN_SETTINGS);
  });

  it.each([
    ['a note style that is null', { noteStyles: [null] }, 'noteStyles', []],
    ['a pronunciation whose respelling is a number', { pronunciations: [{ word: 'x', say: 5 }] }, 'pronunciations', []],
    ['a collection that is a number', { libraryCollections: [5] }, 'libraryCollections', []],
    ['a dashboard without widgets', { libraryDashboards: [{ id: 'd', name: 'x' }] }, 'libraryDashboards', []],
    ['a preset without marks', { annotationPresets: [{ id: 'p', name: 'x' }] }, 'annotationPresets', []],
  ])('drops %s and keeps the rest of its list', (_what, raw, key, expected) => {
    const settings = settingsWith(raw);
    expect(settleSettingsShapes(settings).length).toBe(1);
    expect((settings as unknown as Record<string, unknown>)[key]).toEqual(expected);
  });

  it.each([
    ['annotationPresets', null],
    ['styles', null],
    ['bookSources', 'x'],
  ])('puts back the default for %s when it is %j, not a list', (key, value) => {
    const settings = settingsWith({ [key]: value });
    expect(settleSettingsShapes(settings)).toEqual([`${key}: not a list — the default instead`]);
    expect((settings as unknown as Record<string, unknown>)[key]).toEqual(
      (DEFAULT_PLUGIN_SETTINGS as unknown as Record<string, unknown>)[key]
    );
  });

  it('keeps the good entries beside a bad one, and clears a dashboard’s widgets that are not objects', () => {
    const widget = { id: 'w', kind: 'titles', collection: 'c' };
    const settings = settingsWith({
      pronunciations: [{ word: 'a', say: 'ay' }, null, { word: 'b' }],
      libraryDashboards: [{ id: 'd', name: 'x', widgets: [null, widget] }],
    });
    expect(settleSettingsShapes(settings)).toEqual([
      'pronunciations[1] dropped: not an object',
      'libraryDashboards[0].widgets: 1 entries that were not objects dropped',
    ]);
    expect(settings.pronunciations).toEqual([{ word: 'a', say: 'ay' }, { word: 'b' }]);
    expect(settings.libraryDashboards[0].widgets).toEqual([widget]);
  });
});
