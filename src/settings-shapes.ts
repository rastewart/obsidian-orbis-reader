// What each list in the settings must hold for the code that reads it not to throw.
//
// **Reliability, not a security check.** Settings are the reader's own (docs/design/security.md, "What Orbis trusts").
// But `data.json` and the sync records that feed it can be damaged with nobody meaning it — a sync that wrote half a
// value, a device on an older or newer version, a hand edit — and a list item of the wrong shape threw during loading,
// so the plugin failed to load on every launch until the file was repaired by hand. Here
// an entry of the wrong shape is dropped, the rest of the list is kept, and the debug log says what went.
//
// **Only what the code relies on.** Each rule names the fields some reader of that list uses without checking; an
// entry missing an optional field is left for the code that already fills it in.

import { DEFAULT_PLUGIN_SETTINGS, type OrbisPluginSettings } from './settings';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface Shape {
  /** Fields that must be strings. */
  strings?: string[];
  /** Fields that must be strings when present. */
  optionalStrings?: string[];
  /** Fields that must be objects. */
  objects?: string[];
  /** Fields that must be lists; an entry in one that is not an object is dropped from it. */
  lists?: string[];
}

/** The lists, and what an entry in each must be. `readerThemes` is settled by `settleThemeList`. */
const LISTS: Record<string, Shape> = {
  styles: { strings: ['id', 'name'], objects: ['settings'] },
  noteStyles: { strings: ['id', 'name'] },
  annotationPresets: { strings: ['id', 'name'], lists: ['marks'] },
  pronunciations: { strings: ['word'], optionalStrings: ['id', 'say'] },
  lookupSections: { strings: ['id'] },
  lookupWebDestinations: { strings: ['id', 'url'] },
  bookSources: { strings: ['id', 'url'] },
  libraryCollections: { strings: ['id'] },
  libraryFields: { strings: ['key'] },
  libraryDashboards: { strings: ['id'], lists: ['widgets'] },
  syncDevices: { strings: ['id'] },
};

/**
 * Why `entry` cannot be kept, or null when it can. An inner list keeps only its entries that are objects, and `note`
 * hears about any it lost.
 */
function fault(entry: unknown, shape: Shape, note: (line: string) => void): string | null {
  if (!isObject(entry)) return 'not an object';
  for (const key of shape.strings ?? []) if (typeof entry[key] !== 'string') return `${key} is not text`;
  for (const key of shape.optionalStrings ?? [])
    if (entry[key] !== undefined && typeof entry[key] !== 'string') return `${key} is not text`;
  for (const key of shape.objects ?? []) if (!isObject(entry[key])) return `${key} is not an object`;
  for (const key of shape.lists ?? []) {
    const list = entry[key];
    if (!Array.isArray(list)) return `${key} is not a list`;
    if (list.every(isObject)) continue;
    entry[key] = list.filter(isObject);
    note(`${key}: ${list.length - (entry[key] as unknown[]).length} entries that were not objects dropped`);
  }
  return null;
}

/**
 * Put every list in `settings` back within its shape, in place: a list that is not one becomes the default, and an
 * entry of the wrong shape is dropped. Returns what was changed, one line each, for the debug log; empty when nothing.
 */
export function settleSettingsShapes(settings: OrbisPluginSettings): string[] {
  const held = settings as unknown as Record<string, unknown>;
  const defaults = DEFAULT_PLUGIN_SETTINGS as unknown as Record<string, unknown>;
  const changed: string[] = [];
  for (const [key, shape] of Object.entries(LISTS)) {
    const value = held[key];
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      held[key] = structuredClone(defaults[key] ?? []);
      changed.push(`${key}: not a list — the default instead`);
      continue;
    }
    const kept = value.filter((entry, i) => {
      const why = fault(entry, shape, (line) => changed.push(`${key}[${i}].${line}`));
      if (why) changed.push(`${key}[${i}] dropped: ${why}`);
      return !why;
    });
    if (kept.length !== value.length) held[key] = kept;
  }
  return changed;
}
