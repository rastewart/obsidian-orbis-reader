# Reading Progress & Sync System

← [Design Docs](README.md)

## File layout

Progress data for each epub lives in `!orbis-data/` adjacent to the book file:

```
<book-folder>/!orbis-data/
  <book>.orbis                           — main data: highlights, notes, bookmarks, reading stats, notes files index
  <book>.pages.json                      — pages cache (expensive to rebuild)
  <book>.location.<deviceId>.json        — per-device location record (one per device)
```

**`<book>` is the book's whole file name, extension included** (`sidecarStem` in `src/sidecar-names.ts`):
`sample.epub` writes `sample.epub.orbis`. Each format of a book keeps its own sidecars, because a position in one
means nothing in another: a CFI into an EPUB's XHTML does not address a KF8 section. Every writer and reader goes
through `sidecarStem`, and the delete and rename handlers match a book's files exactly with `sidecarSuffix`; a
`basename + '.'` prefix would also catch other formats and other books whose names begin the same way.
`sidecar-migration.ts` renames sidecars named from the basename, once per vault.

The recordings folder is the one sidecar that is a folder, and it is `<book>.audio` (`audioFolderName`): a folder
named `sample.epub` is an EPUB package to macOS, which Finder then shows as a book and hands to Apple Books. The same
once-per-vault pass gives older folders the suffix (`planAudioFolderSuffix`, guarded by `audioFoldersSuffixed`).

`progressFolderPath(bookFile)` returns `<parent>/!orbis-data` (or just `!orbis-data` at vault root).  
`progressFilePath(bookFile)` returns `<folder>/<book>.orbis`.  
`locsCacheFilePath(bookFile)` returns `<folder>/<book>.pages.json` (the file name says `pages`; the code calls them locations).

---

## Reading location (per-device)

Each device writes its current location to its own file:

```json
{
  "deviceId":   "abc123xyz789",
  "deviceName": "MacBook Pro",
  "location":   "/6/4[chap01]!/4/2/1:0",
  "lastOpened": 1718000000000,
  "isolated":   false
}
```

`deviceId` is a 12-char random alphanumeric ID created once and stored in `localStorage('orbis-device-id')`. `deviceName` comes from `localStorage('orbis-device-name')` (user-editable in settings). `isolated` is set when the user enables "Don't share my location" in settings.

### On book open (`writeLocationOnOpen`)

Stamps `lastOpened: Date.now()` and writes (or updates) the device location file. The existing saved CFI is preserved so other devices can still read it. Returns the previous `lastOpened` timestamp (before this open). This return value is informational; the calling code extracts the prior timestamp directly from `readAllDeviceLocations` before stamping, so the return value is not currently used.

### On relocate (`saveLocation`)

Writes the new CFI to the device location file (plus `deviceId`, `deviceName`, `lastOpened: Date.now()`, `isolated`). Guarded by a `lastSavedCfi` field on `OrbisReaderView`: if the incoming CFI equals `lastSavedCfi`, the write is skipped. This prevents spurious saves when foliate fires `relocate` events on background/refocus on mobile without actual navigation.

### Cross-device sync — Device Locations modal

On book open, the following sequence runs **before** stamping the current device's `lastOpened`:

1. **Read all device files** — `readAllDeviceLocations` scans `!orbis-data/` for `.location.<id>.json` files and returns them sorted by `lastOpened` descending.
2. **Extract own baseline** — `ownPreviousLastOpened = all.find(d => d.deviceId === ownId)?.lastOpened ?? 0`. This is the timestamp from this device's own last open, before the current session stamps it.
3. **Timestamp-only trigger** — If any non-isolated other device has `lastOpened > ownPreviousLastOpened`, the **Device Locations modal** is shown. The trigger is purely timestamp-based: the relative reading position (CFI) is not considered.
4. **Modal list** — All non-isolated devices that have a saved location are shown, including the current device. Sorted by `lastOpened` descending (most recently read at top).
5. **Deferred stamp (`stampOnce`)** — `writeLocationOnOpen` is not called until the user dismisses or selects from the modal. This prevents the current device from falsely appearing as the most-recently-read device in the list.
6. **Deferred 5-second check (mobile)** — If no modal is shown immediately (no other device is newer), `stampOnce` fires at once, and a 5-second timeout re-runs the check. This handles the case where sync delivers other devices' files a few seconds after the book opens, which is common on mobile.

#### Device Locations modal (`DeviceLocationsModal`)

An Obsidian `Modal` subclass. Each device gets a row with:

- **Device name** (from `deviceName` field, or `deviceId` as fallback)
- **"· This device"** badge on the current device's row
- **Timestamp** — `new Date(d.lastOpened).toLocaleString()`
- **Page number** — resolved via `modalPageResolver`, which uses the live page index if available (`locationIndexReady`) or falls back to a pre-loaded locations cache (`readLocsCache`). The cache is loaded before `view.open()` so page numbers appear immediately.
- **"Go to this location"** button — calls `navigateToCfi(d.location)` and closes the modal

Closing the modal (by any means: button click, Escape, overlay click) triggers `stampOnce` via an `onCloseCallback` passed to the constructor.

#### Sync opt-out

`localStorage('orbis-ignore-others') === 'true'` disables all sync dialog logic for the current device. When set, the device also writes `isolated: true` to its location file so other devices exclude it from their trigger check.

### Recent books

Nothing scans every book's `!orbis-data/` folder for a recent-books list. The library's **Continue** widget answers that question from `metadataCache` and file mtimes, not a read per book per device. See [the library](library.md).

---

## Locations cache

Because enumerating every page/location of a large epub is slow, the result is persisted to `<book>.pages.json` (the file name says `pages`; the interface, functions and fields are named after "locs" — see [Location terminology](location-terminology.md)).

```typescript
interface LocationsCache {
  version:            number;                 // must equal LOCS_CACHE_VERSION to be read
  totalLocs:          number;
  sectionLocInfo:     Array<{ startLoc: number; locCount: number }>;
  locNavCache:        Record<string, string>;  // location number string → CFI
  sectionWordCounts?: number[];                // per-section word counts, layout-independent
  sectionCharCounts?: number[];                // per-section char counts, layout-independent
  tocStartFractions?: Record<string, number>;  // href → fraction of total content (0–1)
}
```

`readLocsCache` returns `null` if `version !== LOCS_CACHE_VERSION` or `sectionLocInfo`/`totalLocs`/`locNavCache`/`sectionWordCounts` are missing or malformed. `saveLocsCache` stamps the current `LOCS_CACHE_VERSION` and serializes the `locNavCache` Map to a plain object (string keys for JSON compatibility). `LOCS_CACHE_VERSION` is a single constant in `progress.ts`; there is no separate read-vs-write version.

The cache is used by:
- **Location display**: `locNavCache` maps each location number to the CFI where it starts — Go to location goes there, and `locAtCfi` searches it for the location any position is in. See [Location terminology](location-terminology.md#one-numbering).
- **Time-remaining estimation**: `sectionWordCounts`/`sectionCharCounts` (per-section, layout-independent) are used by `wordsInFractionRange()` to estimate words remaining between the current position and a target fraction — this feeds the `book-time`/`chapter-time` progress modes. This is separate from `locWordCounts` (a live, per-rendered-location map rebuilt on every layout change), which feeds WPM *sampling* instead — see "Reading stats" below.
- **Total location display**: `totalLocs` drives "location N of M" progress modes.
- **Chapter boundaries on fraction-only formats**: `tocStartFractions` gives layout-independent chapter start positions, used when a book (e.g. AZW3/MOBI) has no usable `sectionLocInfo` and boundaries must be computed from content fraction instead.
- **Sync modal and the Orbis DataView**: `locNavCache` resolves a device's location before the live index is built (needed because the live index isn't ready until the first `relocate` event, which fires after `view.open()`), by the same search.

---

## Reading stats (WPM / pace)

### Sampling

On every `relocate` event a timer check runs:
1. Records `paceTimerTs = Date.now()` and `paceTimerLoc = current location`.
2. On the *next* relocate: `elapsed = (Date.now() - paceTimerTs) / 1000`. Words read = `locWordCounts.get(paceTimerLoc)`. WPM = `(words / elapsed) × 60`. (The accept/reject gate is the pure `computeWpmSample` in `stats-math.ts`.)
3. The sample is accepted only if `50 < wpm < 1000` and `words >= 20` (filters out idle time and ultra-short locations).
4. The sample is appended to `wpmSamples[]` (max 15 entries, oldest dropped with `shift()`).
5. Stats are saved to the vault after each accepted sample.

```typescript
interface ReadingStats {
  wpmSamples:  number[];  // up to 15 recent samples
  lastUpdated: string;    // ISO date string
}
```

### Effective WPM

`effectiveWpm()` sorts `wpmSamples`, trims the top and bottom 10%, and returns the trimmed mean. Requires at least 8 samples (or 2 in debug mode via `localStorage('orbis-dbg-pace') = '1'`).

### Progress modes

Six real progress display modes exist as the `ProgressMode` type, plus an always-present 7th `'blank'` cycle stop that is intentionally *not* part of that type (see below). `OrbisPluginSettings.progressMode: ProgressMode | 'blank'` holds the currently-active one; it's persisted and syncs across devices via `data.json`, same as the rest of `OrbisPluginSettings`.

`LOC_MODE_MAP` (in `src/reader/stats-math.ts`, consumed by the `ReadingStats` collaborator) maps a numeric `locMode` (0–6) to these IDs, in this order:

| `locMode` | Mode ID | Display |
|---|---|---|
| 0 | `book-percent` | 📖 percentage through the whole book |
| 1 | `book-locs` | 📖 current location / total locations in the book |
| 2 | `chapter-percent` | 📑 percentage through the current chapter |
| 3 | `chapter-locs` | 📑 current location / total locations in the chapter |
| 4 | `book-time` | 📖 estimated time remaining for the book |
| 5 | `chapter-time` | 📑 estimated time remaining for the chapter |
| 6 | `blank` | *(empty — the indicator shows nothing)* |

**Cycle order.** Tapping the progress label (or running **Cycle reading progress display**) calls `cycleProgressMode()`, which steps through `OrbisPluginSettings.progressModes[]` (the six real modes, filtered to whichever are enabled in Settings → Appearance → Toolbar) in **metric-major** order — `book-percent → chapter-percent → book-locs → chapter-locs → book-time → chapter-time` — then appends `'blank'` unconditionally as the last stop, regardless of which of the six are enabled. This intentionally matches `PROGRESS_MODE_DISPLAY_ORDER` in `settings.ts` (the same order the Settings-tab toggle grid uses), so the cycle order and the settings-grid order never disagree. `locMode`'s own declaration order above is just an internal index↔id lookup table — it does not drive the cycle sequence.

**The blank stop.** `'blank'` is deliberately excluded from `ProgressMode`/`PROGRESS_MODE_DISPLAY_ORDER`/`PROGRESS_MODE_GRID_LABELS`, so it can never appear as a toggle in Settings — it's not one of the modes a user can disable, it's always the last cycle stop. Two "if current mode was just disabled, jump to the first enabled mode" safety checks (one in `applyPluginSettings()`, one in `OrbisSettings`'s `refreshProgressModeToggles()`) explicitly exempt `'blank'` from that reset, since it was never a toggleable mode to begin with. Like the other six, it persists across sessions — closing a book while blank and reopening it later starts blank again.

**Pending time estimates.** `formatLocLabel()`'s `book-time`/`chapter-time` cases return `'📖 ...'` / `'📑 ...'` (icon plus ellipsis, not a percentage) whenever `effectiveWpm()` is still `0` — i.e., before at least 8 pace samples have been collected. The ellipsis is the "not ready" convention the percent/locs cases use too; a substituted percentage would read as "0%" on a freshly-opened book.

Which of the six real modes appear in the cycle is configurable via `OrbisPluginSettings.progressModes[]` (synced the same way as the rest of the settings object — despite the name, this is not a per-device setting).

---

## Archive

The `.orbis` file has no archive flag: a flag there is invisible to every collection, grouping and widget. A reading
status — any value you name, including **Archived** — says the same thing where the rest of the library can see it.
An `archived` key in an `.orbis` file is ignored.

---

## Device ID and name

- **Device ID** (`LS_DEVICE_ID = 'orbis-device-id'`): generated once, stored in localStorage, used as the suffix of the per-device location file.
- **Device name** (`LS_DEVICE_NAME = 'orbis-device-name'`): optional human-readable label, set in settings. Changing the name calls `updateDeviceNameInVault` to rewrite the `deviceName` field in every location file in the vault for this device.
- **Isolated flag** (`LS_IGNORE_OTHERS = 'orbis-ignore-others'`): when `'true'`, the device writes `isolated: true` in its location file, preventing other devices from offering to jump to its location, and disables the sync dialog on this device entirely.
