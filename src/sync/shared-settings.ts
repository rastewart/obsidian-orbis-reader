// The settings that describe the VAULT rather than the device, carried as one item.
//
// **A folder is a fact about the vault.** If title notes go in `Library/Titles`, that is true from every device — and
// asking once per device is the plugin asking one question three times and keeping three answers that must not
// disagree. The "already asked" flags travel with the folders, which is the point of including them: a second device
// that inherits a destination must not then ask where that destination should be.
//
// **One item, merged whole.** These are small, they are edited together, and nobody edits two of them on two devices
// in the same minute. The cost, stated so it is not a surprise: two devices changing different keys between syncs
// means the later change wins the WHOLE set, and the other device's key goes with it. The field table took the same
// deal for the same reason. Per-key merging is a CRDT, and this is a reading app.
//
// **What is deliberately NOT here** is as much of the design as what is:
//
// - **Consent never travels.** `bookSourcesEnabled` (may this device contact those servers) and
//   `epubFetchRemoteImages` (may it fetch images from the web) are decisions about a device on a network, not about
//   where a file goes. The catalogs and the folder they download into travel; the permission and the passwords do
//   not.
// - **Dismissals stay.** `libraryUncatalogedDismissed` is "I have seen this and waved it away", which is a statement
//   about a person at a screen.
// - **Reading behavior stays.** Page-turn keys, flash navigation and link preview describe how a device feels to
//   read on. See docs/design/multi-device-sync.md §What participates.
//
// See docs/design/multi-device-sync.md §Where things are written.

import type { OrbisPluginSettings } from '../settings';

/** The single item's id: there is one shared-settings record per device, not one per key. */
export const SHARED_SETTINGS_ITEM = 'shared';

/**
 * Every key that travels, named one at a time.
 *
 * **Named, never derived.** A rule like "every key ending in Folder" would quietly enrol the next setting somebody
 * adds, and the failure would be a device changing a preference it was never asked about. Adding a key here is a
 * deliberate line in a diff.
 */
export const SHARED_SETTINGS_KEYS = [
  // Where the library writes, and whether it has asked.
  'libraryEnabled',
  'librarySetupDone',
  'libraryRecordsFolder',
  'libraryCoversFolder',
  'libraryExtractCovers',
  // Where reading records go, whether they are written at all, and WHICH KINDS are written — the last of those
  // belongs with the others: it is a decision about what lands in the vault, not about how a device feels to use.
  'recordsMode',
  'recordsSetupDone',
  'recordsFolder',
  'recordsSameFolderAsBook',
  'recordsAllBooksBaseFolder',
  'recordKinds',
  // How much text the player's mark and note buttons capture. Behavior-shaped at first glance, and content-shaped
  // on inspection: it decides how much of the book ends up in the note.
  'audioHighlightGranularity',
  'audioNoteGranularity',
  // **Which language frontmatter keys are written in, which is a correctness matter rather than a taste.** Two
  // devices disagreeing writes `author` into one note and the native-language key into the next, in one vault, and
  // nothing downstream can tell they meant the same field. The same argument the field table rests on.
  // Where each kind of export lands, and how it is shaped by default.
  'epubSameFolderAsNote',
  'epubFolder',
  'epubDefaultType',
  // *Read in Orbis Reader*'s own Type. Its two companions — how the book opens, and which bar comes with it —
  // are per device on purpose; this one travels because it lands in a title note every device reads.
  'readInOrbisType',
  'epubSplitLevel',
  'bookExport',
  'markdownSameFolderAsBook',
  'marksPdfSameFolderAsBook',
  'marksPdfFolder',
  'bookPdfSameFolderAsBook',
  'bookPdfFolder',
  'pdfAttribution',
  'pdfFont',
  'bookPdfCoverSheet',
  'bookPdfIncludeMarks',
  // Where downloaded books land, and WHICH CATALOGS there are. The list travels: a set of servers you have
  // configured is a fact about a vault, and re-entering three OPDS URLs on every device is the annoyance this
  // whitelist exists to remove. Consent does not travel with it — `bookSourcesEnabled` is per device — and neither
  // do the passwords, which live in `app.secretStorage` keyed by source id. A source arrives usable and
  // unauthenticated, which is the honest state: this device has not been told the password.
  'bookSourcesFolder',
  'bookSources',
  // Where sync's own published copies go. It can travel because nothing depends on it to FIND them.
  'syncFolder',
  // Where fonts are kept, and which the Font list leaves out. A display style that travels names a font, and the
  // folder its files are in and the list it is chosen from should be the same everywhere — like the reader themes.
  'fontsFolder',
  'hiddenFonts',
  // The look-up popup: which sections and destinations exist, their settings, and their order. Order travels here
  // where a dashboard's does not — the popup is one small stack of sections, and there is no reason for it to differ
  // by device.
  'lookupSections',
  'lookupWebDestinations',
  // The reader themes: every one but the two that match Obsidian, in order, each with its switch, and the reader's own
  // whole — the theme list's vocabulary, as the destinations are the popup's. A display style that travels names one,
  // and the list it is chosen from should be the same list everywhere.
  'readerThemes',
  'frontmatterKeyLanguage',
] as const satisfies readonly (keyof OrbisPluginSettings)[];

export type SharedSettingsKey = (typeof SHARED_SETTINGS_KEYS)[number];

/** The traveling subset of a settings object, as the record's payload. */
export type SharedSettings = Partial<Pick<OrbisPluginSettings, SharedSettingsKey>>;

/** What this device would publish. Keys it does not hold are left out rather than published as `undefined`. */
export function pickShared(settings: OrbisPluginSettings): SharedSettings {
  const out: SharedSettings = {};
  const held = settings as unknown as Record<string, unknown>;
  const into = out as unknown as Record<string, unknown>;
  for (const key of SHARED_SETTINGS_KEYS) {
    if (held[key] !== undefined) into[key] = held[key];
  }
  return out;
}

/**
 * Take an adopted set into the settings object, and answer which keys actually moved.
 *
 * **Only keys on the list, whatever the file says.** These records are files in a vault: hand-edited, half-written,
 * or written by a version that shares more than this one does. A payload naming `pronunciations` must not be able to
 * replace the glossary through the back door.
 *
 * The answer matters because the side effects do: the Library's ribbon icon follows `libraryEnabled`, and the reader
 * views have to be told when a destination moves. A caller that cannot tell what changed has to do all of it or none.
 */
export function applyShared(settings: OrbisPluginSettings, shared: SharedSettings | undefined): SharedSettingsKey[] {
  if (!shared || typeof shared !== 'object') return [];
  const changed: SharedSettingsKey[] = [];
  const held = settings as unknown as Record<string, unknown>;
  const arriving = shared as unknown as Record<string, unknown>;
  for (const key of SHARED_SETTINGS_KEYS) {
    if (!(key in arriving)) continue;
    const value = arriving[key];
    if (value === undefined) continue;
    if (JSON.stringify(held[key]) === JSON.stringify(value)) continue;
    held[key] = value;
    changed.push(key);
  }
  return changed;
}
