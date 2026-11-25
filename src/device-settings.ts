// Settings that belong to THIS device, in this vault — kept out of `data.json` on purpose.
//
// **So that both ways of syncing work.** Orbis publishes each syncable item as a vault file, and `data.json` is this
// device's own copy of what travels. Some readers will instead sync `data.json` itself — Obsidian Sync can, and a
// file-sync tool will whether asked to or not — and that only behaves properly if the file holds *nothing but* the
// traveling set. Every device-shaped setting left in it is a decision made on one screen arriving on another: a
// phone inheriting a desktop's toolbar, a tablet inheriting a laptop's skip seconds.
//
// So the rule is the one the design already states: `data.json` is exactly the syncable set, and anything about this
// device lives here. `device-store` gives us per device AND per vault, which is the unit that actually makes sense —
// a test vault's toolbar has nothing to say about the real one's.
//
// **One JSON object, not one key per setting.** Thirty keys would be thirty reads, thirty writes and thirty
// migrations; a single object is one of each, and it keeps `localStorage` legible to anyone looking.
//
// **The cost, stated plainly: these are less durable than `data.json`.** The vault is backed up and synced; this is
// not. Clear the app's data, reinstall, or move to a new machine and these go back to their defaults, where a setting
// in `data.json` would have come back with the vault. That is the trade, and it is why only cheap-to-re-set things
// live here — nothing laborious, nothing a reader would mourn.
//
// See docs/design/multi-device-sync.md §Making `data.json` fit to sync directly.

import { readDeviceValue, writeDeviceValue } from './device-store';
import {
  DEFAULT_PROGRESS_MODES,
  type ProgressMode,
  type ProgressModeConfig,
  type ReadAhead,
  type ReadingHighlightMode,
  type SkipSeconds,
} from './settings';
import { readSettingKey, writeSettingKey } from './settings-keys';

const KEY = 'orbis-device-settings';

/**
 * What this device keeps for itself.
 *
 * The toolbar's buttons, to begin with: which of them a device shows is a statement about a screen — a phone with room
 * for four icons and a desktop with room for nine do not want the same toolbar, and neither is wrong.
 */
export interface DeviceSettings {
  // The toolbar: which buttons this screen has room for.
  showTocButton: boolean;
  showSearchButton: boolean;
  showBookmarkButton: boolean;
  showNoteIconsButton: boolean;
  showAnnotationsButton: boolean;
  showDisplayStyleButton: boolean;
  showFocusButton: boolean;
  showTtsButton: boolean;
  showDebugButton: boolean;
  /**
   * How the book behaves under your hands, and how listening sounds.
   *
   * Every one of these describes an input or an output rather than the vault: arrow keys mean nothing on a phone,
   * flash navigation is about how a screen feels, a hover is a hover, and a skip of fifteen seconds is a judgment
   * about your own thumb. `playbackSource` is here because a device that has downloaded a voice and one that has not
   * genuinely want different answers.
   */
  keyboardPageTurn: boolean;
  /**
   * The ‹ › at the edges of the page. Off hides the glyphs only: the edges still turn the page, so a reader who
   * knows where to select loses nothing but the clutter.
   */
  showPageArrows: boolean;
  /** Pixels between an Orbis control and its tooltip — for a large pointer that would cover it. See `tooltip-gap.ts`. */
  tooltipGap: number;
  flashOnNavigation: boolean;
  linkPreviewEnabled: boolean;
  readingHighlight: ReadingHighlightMode;
  confirmDeleteNote: boolean;
  skipBackSeconds: SkipSeconds;
  skipForwardSeconds: SkipSeconds;
  readAhead: ReadAhead;
  keepScreenAwakeWhileListening: boolean;
  playbackSource: 'recorded' | 'live';
  ttsRate: number;
  /**
   * The progress readouts: whether the chip is shown, which readout it is showing, and which ones it cycles through.
   *
   * **Which one is showing is the giveaway.** It changes by tapping the chip while reading, and what you want to see
   * on a phone in a pocket is not what you want on a desktop — so it is not a fact about the vault. The list is a
   * visibility array addressed member-wise (`progressModes.book-locs`), which is why the key walker does not care
   * which store it walks.
   */
  showProgressIndicator: boolean;
  progressMode: ProgressMode | 'blank';
  progressModes: ProgressModeConfig[];
  /**
   * Four that are none of the above, and each here for its own reason.
   *
   * - `libraryUncatalogedAlert` and `libraryUncatalogedDismissed` are a notice and the fact that somebody waved it
   *   away. "I have seen this" is a statement about a person at a screen; carrying a dismissal to another device
   *   would tell it a question had been answered that it never asked.
   * - `showDevOptions` reveals the developer options — diagnostic commands in the palette, and the technical
   *   settings rows that only help a GPU server. A palette is a device's own, and so is a diagnostic.
   * - `epubFetchRemoteImages` is **consent** — may this plugin fetch images from the web — and consent does not
   *   travel, for the reason book sources' switch does not: it is a decision about a device on a network. Where the
   *   images LAND is a fact about the vault, and that travels.
   */
  libraryUncatalogedAlert: boolean;
  libraryUncatalogedDismissed: string;
  showDevOptions: boolean;
  epubFetchRemoteImages: boolean;
  /**
   * **May this device contact the book-source catalogs?** Consent, so it stays here while the catalogs themselves
   * travel: a list of servers is a fact about a vault, and permission to reach them is a decision about a device on
   * a network. The passwords are elsewhere again — `app.secretStorage`, keyed by source id, which is per device by
   * construction — so a source that arrives from another device arrives usable but unauthenticated.
   */
  bookSourcesEnabled: boolean;
  /**
   * How ANY book opens on this device: the reading mode it arrives in, and which secondary bar comes with it.
   *
   * **Every open there is** — a click in the file explorer, a Library row, a link, a workspace restoring three
   * books at startup. The exception is a control that names a mode itself: the Library's headphones and a
   * `listen=1` link are instructions rather than preferences, and an instruction wins. See
   * `OrbisReaderView.onLoadFile`.
   *
   * **Defaulted to the plain open** — standard mode, no bar — because anything else would change how every book
   * opens for a reader who never asked for it.
   */
  openBookMode: 'standard' | 'focus' | 'listen';
  openBookBar: 'listen' | 'search' | 'none';
  /**
   * *Read in Orbis Reader*: how a converted note opens on THIS device, when it is not simply following the pair
   * above.
   *
   * **The case that decides which side of the line these fall: read on the tablet, listen on the phone.** That is
   * not a misconfiguration to be reconciled, it is two devices being used for what they are good at — so how a
   * book opens is a fact about a screen and a pair of hands, like the toolbar buttons and the skip seconds above
   * it. The default TYPE goes the other way and travels, because it is written into a title note every device
   * reads. See docs/design/read-in-orbis-reader.md § Which settings sync.
   */
  readInOrbisMode: 'standard' | 'focus' | 'listen';
  readInOrbisBar: 'listen' | 'search' | 'none';
  /**
   * Whether this command answers the two questions above for itself, or takes the same answers as any other open.
   *
   * **One switch, not a third option on each dropdown**: overriding the mode while following the bar is a
   * half-state that is hard to read at a glance and that nobody has wanted, so one decision replaces two.
   *
   * **Named for what turning it ON does, and off by default**, like every other toggle in these settings, where
   * turning something on is what makes more of it appear. A flag whose name is the opposite of the control bound to
   * it is a bug waiting for whoever reads it next.
   *
   * `readInOrbisType` is unaffected either way — it is not one of the answers being followed.
   */
  readInOrbisOwnSettings: boolean;
  /**
   * Whether a notice says so when an update with release notes is installed. The switch is in the What's new dialog.
   *
   * **Per device, like the version it is compared with** (`first-run.ts`): each device is updated on its own, so each
   * is told on its own. On by default, so a reader learns the dialog exists the first time there is something in it.
   */
  showWhatsNew: boolean;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  showTocButton: true,
  showSearchButton: true,
  showBookmarkButton: true,
  showNoteIconsButton: true,
  showAnnotationsButton: true,
  showDisplayStyleButton: true,
  showFocusButton: true,
  showTtsButton: true,
  showDebugButton: false,
  keyboardPageTurn: true,
  showPageArrows: true,
  tooltipGap: 8,
  flashOnNavigation: true,
  linkPreviewEnabled: true,
  readingHighlight: 'sentence',
  confirmDeleteNote: true,
  skipBackSeconds: 15,
  skipForwardSeconds: 15,
  readAhead: 'sentence',
  keepScreenAwakeWhileListening: false,
  playbackSource: 'recorded',
  ttsRate: 1,
  showProgressIndicator: true,
  progressMode: 'book-percent',
  progressModes: DEFAULT_PROGRESS_MODES.map((mode) => ({ ...mode })),
  libraryUncatalogedAlert: true,
  libraryUncatalogedDismissed: '',
  showDevOptions: false,
  epubFetchRemoteImages: false,
  bookSourcesEnabled: false,
  // The plain open. Anything else here would change every reader's mornings.
  openBookMode: 'standard',
  openBookBar: 'none',
  // **Following the pair above, by default.** A command that opened books differently from everything else would
  // need a message explaining itself on first use, which is a feature apologizing for its own special case. Behaving
  // like every other open needs no explanation. These two are what a reader gets the moment they decide
  // otherwise — the book as they would read it anyway, with the one bar that makes *read it to me* a tap away.
  readInOrbisMode: 'standard',
  readInOrbisBar: 'listen',
  readInOrbisOwnSettings: false,
  showWhatsNew: true,
};

export type DeviceSettingKey = keyof DeviceSettings;

/** Whether a flat key names one of these — how one key namespace addresses two stores. */
export function isDeviceSettingKey(key: string): key is DeviceSettingKey {
  return key in DEFAULT_DEVICE_SETTINGS;
}

/**
 * Cached, because these are read on every toolbar repaint and a JSON parse per icon is a parse per icon.
 *
 * Dropped on write, and by `forgetDeviceSettings` when the store's `app` changes underneath us — which happens in
 * tests and would otherwise hand one vault's answers to another.
 */
let cache: DeviceSettings | null = null;

export function deviceSettings(): DeviceSettings {
  if (cache) return cache;
  const raw = readDeviceValue(KEY);
  if (!raw) {
    cache = { ...DEFAULT_DEVICE_SETTINGS };
    return cache;
  }
  try {
    const held = JSON.parse(raw) as Partial<DeviceSettings>;
    // Merged over the defaults rather than trusted: a key added in a later version is missing from a blob written by
    // an earlier one, and `undefined` reaching a `toggle(visible)` hides a button nobody asked to hide.
    cache = { ...DEFAULT_DEVICE_SETTINGS, ...(held && typeof held === 'object' ? held : {}) };
  } catch {
    cache = { ...DEFAULT_DEVICE_SETTINGS };
  }
  return cache;
}

export function deviceSetting<K extends DeviceSettingKey>(key: K): DeviceSettings[K] {
  return deviceSettings()[key];
}

export function setDeviceSetting<K extends DeviceSettingKey>(key: K, value: DeviceSettings[K]): void {
  const next = { ...deviceSettings(), [key]: value };
  cache = next;
  writeDeviceValue(KEY, JSON.stringify(next));
}

/** Test seam and vault switch: read from storage again next time. */
export function forgetDeviceSettings(): void {
  cache = null;
}

/**
 * Carry these out of a `data.json` that still holds them, once.
 *
 * Takes the RAW loaded settings rather than the merged object, so a default cannot masquerade as a reader's choice:
 * a device that never touched these keys has nothing to carry, and writing defaults here would be indistinguishable
 * from having answered.
 *
 * Answers which keys moved, for the log. Never overwrites what is stored here already — an answer given since the
 * move is newer than anything the old file holds.
 */
export function migrateDeviceSettings(raw: Record<string, unknown>): DeviceSettingKey[] {
  if (readDeviceValue(KEY) !== null) return [];
  const moved: DeviceSettingKey[] = [];
  const next = { ...DEFAULT_DEVICE_SETTINGS } as Record<string, unknown>;
  const defaults = DEFAULT_DEVICE_SETTINGS as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_DEVICE_SETTINGS) as DeviceSettingKey[]) {
    const held = raw[key];
    // **Matched by type, not merely by presence.** These come from a JSON file that a person may have edited and an
    // older version may have written differently; a string where a number belongs would reach a slider.
    if (held === undefined || typeof held !== typeof defaults[key]) continue;
    next[key] = held;
    moved.push(key);
  }
  if (moved.length === 0) return [];
  cache = next as unknown as DeviceSettings;
  writeDeviceValue(KEY, JSON.stringify(next));
  return moved;
}

/**
 * Store a value that arrived as `unknown` — from a declarative control, which hands back whatever its widget yields.
 *
 * Coerced to the shape of the default: a dropdown's options are keyed by string, so a number setting comes back as
 * `"15"` and would be stored as a string that arithmetic later treats as text. The unions are narrowed by their own
 * guards at the READ sites (`asSkipSeconds`, `asReadingHighlightMode`), which is where a value from a hand-edited
 * store has to be caught anyway.
 */
export function setDeviceSettingValue(key: DeviceSettingKey, value: unknown): void {
  const shape = typeof (DEFAULT_DEVICE_SETTINGS as unknown as Record<string, unknown>)[key];
  const coerced = shape === 'boolean' ? Boolean(value) : shape === 'number' ? Number(value) : String(value);
  setDeviceSetting(key, coerced as never);
}

/**
 * The dotted-key namespace, over this store — `progressModes.book-locs` and the like.
 *
 * The same walker the traveling settings use (`settings-keys.ts`), handed a copy of this blob: the visibility-array
 * handling is subtle enough that two implementations would come to disagree about what a member key means.
 */
export function isDeviceSettingField(key: string): boolean {
  const dot = key.indexOf('.');
  return isDeviceSettingKey(dot < 0 ? key : key.slice(0, dot));
}

export function readDeviceSettingKey(key: string): unknown {
  return readSettingKey(deviceSettings(), key);
}

/** Answers whether the key was recognized, so an unknown one is a no-op the caller can report. */
export function writeDeviceSettingKey(key: string, value: unknown): boolean {
  // A copy, because the walker mutates in place and the cache must not change unless the write is kept — and because
  // a member push into a shared array would edit the defaults themselves.
  const next = structuredClone(deviceSettings());
  if (!writeSettingKey(next, key, value)) return false;
  cache = next;
  writeDeviceValue(KEY, JSON.stringify(next));
  return true;
}

/**
 * Rename the stored progress-mode ids `book-pages` and `chapter-pages` to their `-locs` equivalents.
 *
 * The readouts count locations, not pages, and a stored id nothing recognizes is a chip that shows nothing, so the
 * rename is applied on every load. It runs here rather than over `data.json`, and after the migration, so a value
 * carried across on this very load is renamed too.
 */
export function renameLegacyProgressModes(): void {
  const held = deviceSettings();
  const renamed = (id: string): string =>
    id === 'book-pages' ? 'book-locs' : id === 'chapter-pages' ? 'chapter-locs' : id;
  const mode = renamed(held.progressMode);
  const modes = held.progressModes.map((entry) => ({ ...entry, id: renamed(entry.id) as ProgressMode }));
  if (mode === held.progressMode && modes.every((entry, at) => entry.id === held.progressModes[at]?.id)) return;
  const next: DeviceSettings = { ...held, progressMode: mode as ProgressMode | 'blank', progressModes: modes };
  cache = next;
  writeDeviceValue(KEY, JSON.stringify(next));
}
