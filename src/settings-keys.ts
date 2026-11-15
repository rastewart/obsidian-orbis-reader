// Resolving a declarative setting's `control.key` against the settings object.
//
// Obsidian's declarative API binds a control to a FLAT string key and calls `getControlValue` /
// `setControlValue` on the tab to read and write it. Orbis's settings are not flat — `progressModes` and
// `progressModes` are arrays of `{ id, visible }` — so the key namespace uses a dotted path and this module is
// what walks it. Pure on purpose: the tab that owns the overrides cannot be constructed in a test, and the thing
// worth testing is the walking, not the mounting. See docs/design/settings.md.

import { asReadAhead, asReadingHighlightMode, asSkipSeconds } from './settings';

/**
 * Whatever object a dotted key is being walked over.
 *
 * **Not `OrbisPluginSettings` any more.** The same namespace now addresses two stores: `data.json` for the settings
 * that travel, and vault-scoped device storage for the ones that describe this device — see `device-settings.ts`.
 * This module is about walking a dotted key, not about which object it walks, and duplicating the array handling per
 * store is how the two would come to disagree about what `progressModes.book-locs` means.
 */
export type KeyedStore = object;

/** The store as a bag of keys. One cast, here, rather than one at every index. */
const bag = (store: KeyedStore): Record<string, unknown> => store as Record<string, unknown>;

/** An array of `{ id, visible }` addressed as `<field>.<id>` — the collections that are toggled per member
 *  rather than set as a whole. Order matters in some of them (`lookupSections` is display order), which the
 *  member key deliberately says nothing about: reordering moves the array, toggling addresses a member. */
const VISIBILITY_ARRAYS = ['progressModes', 'lookupSections'] as const;
type VisibilityArray = (typeof VISIBILITY_ARRAYS)[number];

function splitKey(key: string): { field: string; member: string | null } {
  const dot = key.indexOf('.');
  return dot < 0 ? { field: key, member: null } : { field: key.slice(0, dot), member: key.slice(dot + 1) };
}

function isVisibilityArray(field: string): field is VisibilityArray {
  return (VISIBILITY_ARRAYS as readonly string[]).includes(field);
}

/**
 * Narrow what a control hands back to what the setting actually stores.
 *
 * **A `dropdown` control always yields a string**, because its options are keyed by string — but
 * `skipBackSeconds` is a number union and `readingHighlight` is a mode union. Stored raw, the seconds become
 * `"15"`, which reads back as a number everywhere it is consumed only because those call sites coerce
 * defensively; the value in `data.json` would still be the wrong type, and the next thing to read it directly
 * would do arithmetic on a string.
 *
 * Unlisted keys pass through: a toggle stores a boolean and a text control stores a string, which is what those
 * settings hold anyway.
 *
 * **`epubSplitLevel` was the prediction above coming true.** It shipped bound to a dropdown and unlisted here, so
 * choosing "One section" wrote `"0"`; `resolveSplitLevel` then evaluated `"0" + 1` as `"01"` and walked from
 * there to Heading 3. Adding a numeric setting to a dropdown means adding it to this list — there is no inference
 * to lean on, because the control cannot know what the field holds.
 */
export function coerceSettingValue(key: string, value: unknown): unknown {
  if (key === 'skipBackSeconds' || key === 'skipForwardSeconds') return asSkipSeconds(value);
  if (key === 'readingHighlight') return asReadingHighlightMode(value);
  if (key === 'readAhead') return asReadAhead(value);
  if (key === 'epubSplitLevel') return asSplitLevel(value);
  return value;
}

/** `0`–`6`, and `2` for anything else — an out-of-range level is a value nothing can act on. */
function asSplitLevel(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 6 ? n : 2;
}

/**
 * Read the value a control should display.
 *
 * A member of a visibility array that is absent reads as **visible**, matching what the grid always did: a
 * config written before a panel or a progress mode existed has no entry for it, and defaulting a new one to
 * hidden would make it vanish for everyone who upgraded.
 */
export function readSettingKey(settings: KeyedStore, key: string): unknown {
  const { field, member } = splitKey(key);
  if (member !== null && isVisibilityArray(field)) {
    const list = bag(settings)[field] as { id: string; visible: boolean }[] | undefined;
    return list?.find((e) => e.id === member)?.visible ?? true;
  }
  const nested = member !== null ? asRecord(settings, field) : null;
  if (nested) return nested[member as string];
  return bag(settings)[key];
}

/**
 * `settings[field]` when it is a plain object — the shape a dotted key can reach into.
 *
 * Arrays are excluded deliberately: the visibility arrays above are also indexable by a dotted key, and they mean
 * something different (a member by `id`, not a property by name). Anything else nested — `bookExport` today — is
 * an ordinary object whose properties are settings in their own right.
 */
function asRecord(settings: KeyedStore, field: string): Record<string, unknown> | null {
  const value = bag(settings)[field];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Write a value back. Mutates in place — the caller persists.
 *
 * Returns whether anything was recognized, so an unknown key is a no-op the caller can report rather than a
 * silent write of a property nothing reads.
 */
export function writeSettingKey(settings: KeyedStore, key: string, value: unknown): boolean {
  const { field, member } = splitKey(key);
  if (member !== null && isVisibilityArray(field)) {
    const list = (bag(settings)[field] ?? []) as { id: string; visible: boolean }[];
    const entry = list.find((e) => e.id === member);
    if (entry) entry.visible = Boolean(value);
    else list.push({ id: member, visible: Boolean(value) });
    bag(settings)[field] = list;
    return true;
  }
  if (member !== null) {
    // A property of a nested settings object — `bookExport.imageFormat`. Only one that already exists: an
    // unknown property here is a typo, and writing it would create a field nothing reads.
    const nested = asRecord(settings, field);
    if (!nested || !(member in nested)) return false;
    nested[member] = value;
    return true;
  }
  if (!(key in settings)) return false;
  bag(settings)[key] = value;
  return true;
}

/**
 * How many members of a visibility array are on.
 *
 * The last visible one cannot be turned off — a content panel with no tabs, or a progress indicator with no mode
 * to show, is a control that does nothing — so the row that would empty the set disables itself.
 */
export function visibleCount(settings: KeyedStore, field: VisibilityArray, ids: readonly string[]): number {
  const list = (bag(settings)[field] ?? []) as { id: string; visible: boolean }[];
  return ids.filter((id) => list.find((e) => e.id === id)?.visible ?? true).length;
}
