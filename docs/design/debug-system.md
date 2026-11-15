# Debug System

← [Design Docs](README.md)

## Overview

The debug system provides a category-filtered log panel inside the reader. It opens from a floating chip at the reader's bottom left, which is hidden by default and shown per device by the **Toggle debug button** command (`showDebugButton`); **Toggle debug log** opens the panel directly. The chip is not a toolbar button because a phone's toolbar has no room to spare. All debug state lives in `localStorage` so it is device-specific and never syncs.

It is the `DebugLog` collaborator (`src/reader/DebugLog.ts`). `OrbisReaderView` keeps thin `debug()`/`addDebugEntry()`/`toggleDebugLog()` delegators for its internal call sites; the real logic is `DebugLog.add()` / `DebugLog.render()` / `DebugLog.toggle()`.

Key design constraints: no debug flags in plugin settings; filtering happens inside the panel itself without reloading. **The filter gates recording, not rendering** — a categorized entry is dropped at `add()` time unless its category is enabled, and `render()` then draws every buffered entry unconditionally (newest-first). The rolling buffer is capped at 200 entries and persists across book opens (only DOM handles are released on `dispose()`).

---

## Build stamp

Every build is stamped so a debug session is never ambiguous about *which* artifact produced it — on a device, the log is the only way to tell whether the new build is the one running.

**Injection.** `esbuild.config.mjs` computes two values at build time and passes them through esbuild's `define`:

- `BUILD_TIME` — `new Date().toISOString()` to the second (UTC).
- `BUILD_COMMIT` — `git rev-parse --short HEAD`, plus a `-dirty` suffix when `git status --porcelain` is non-empty (uncommitted changes — the usual state while iterating).

`src/build-info.ts` reads them behind a `typeof` guard so vitest and `pnpm dev` (which don't run the production `define`) fall back to `'dev'` instead of throwing on the undeclared global. `buildLabel()` joins them:

```
Orbis build 2026-07-11T13:13:57Z · a1b2c3d-dirty
```

> **Watch-mode caveat:** `define` is evaluated once when `pnpm dev` starts, so `BUILD_TIME` won't refresh on every hot rebuild. The production `build` (which `deploy.sh` runs) re-stamps fresh each time, so the deployed/tested artifact is always accurate.
>
> **`-dirty` needs a clean tree to mean anything:** the flag reads `git status`, so untracked noise (`.DS_Store`, stray files) keeps it permanently dirty. Gitignoring that noise keeps the flag a real signal.

**Two surfaces read the stamp:**

- **Debug-log header** — `DebugLog.render()` pins `buildLabel()` as the top line of the panel (an `.orbis-debug-build` div, *not* a log entry), so it **survives Clear** and is always visible; the panel's **Copy** button prepends it to the copied text. A pasted log therefore always names its own build.
- **`Orbis: About` command** — a `createOrbisPopup` dialog (`AboutDialog.ts`) showing version + build time + commit, with Copy and Close. It's a global command (works with no book open) and the only Orbis dialog launched from *outside* the reader view. It has no text field, so it opts out of the mobile height lock — see [Dialog System → Height locking](dialog-system.md#height-locking-and-the-wkwebview-quirk).

---

## Category system

### Type

`DebugCategory` is defined in `src/settings.ts`; `DebugLog.ts` holds the runtime
`DEBUG_CATEGORIES` array (source of the filter-bar pills). There are **16** categories:

```typescript
export type DebugCategory =
  | 'relocate'   // relocate events, fraction, location, section changes
  | 'index'      // buildLocationIndex, loadOrBuildLocationIndex, locations cache
  | 'pace'       // WPM sampling, reading time estimates
  | 'display'    // applyDocStyles, applyRenderer, brightness, font, theme
  | 'nav'        // goToSection, prevSection, nextSection, turnChapter, navigateToLoc
  | 'annot'      // highlights/notes/bookmarks create/edit/delete
  | 'search'     // search start/done, hit counts
  | 'export'     // book export chapter/image progress
  | 'backlinks'  // backlinks scan, cache hit/miss
  | 'sync'       // device location save/load, prompt shown
  | 'select'     // text-selection / mobile selection workarounds
  | 'annot-nav'  // annotation-tap navigation (mobile focusin suppression)
  | 'tts'        // listening: voices, playback, recording
  | 'library'    // the Library and its dashboards
  | 'sources'    // book sources and their feeds
  | 'settings';  // the settings pages
```

### localStorage keys

`orbis-dbg-<category>` → `'1'` when enabled. Disabling a category **removes** the key
(`saveLocalStorage(key, undefined)`), so a disabled category is *absent*, not `'0'`.

### `DebugLog.add` signature

```typescript
add(msg: string, category: DebugCategory): void
```

(`OrbisReaderView.addDebugEntry` / `.debug` are one-line delegators to this.)

- **Every entry has a category**, and the type requires one — on `add`, on `ReaderContext.debug` and on the view's
  delegators. An entry without one used to be recorded whatever pills were on, which is how the selection trace
  (`annot-ui`, `touchend`) and the note-icon layout (`refreshNoteIcons`) filled every log; they are `select` and `annot`.
- An entry is recorded only when its category's localStorage key is `'1'`, and the drop happens at record time —
  historical entries for a category you enable later never existed.
- Special: when `category` is `'pace'` and pace is enabled, `ReadingStats` lowers its
  minimum WPM-sample threshold so pace estimates appear immediately during debugging.

### Log format

Category-tagged entries are prefixed with `[cat]` for visual scanning:

```
20:51:14.158 [relocate] section:9/32 loc:20/298 frac:0.074
20:51:14.377 [annot] highlight add — cfi:... color:#FFEB3B section:9
```

### Writing to notes

**Write to note** in the panel's header, or the **Toggle writing the debug log to a note** command, turns on a copy
of the log in the vault, for this device only (`orbis-dbg-note` in local storage, beside the category switches). It is
for the log that a freeze or a crash takes with it: the entries live in memory, and a force-closed app loses them
with the line that would have explained the force-close. A note is on disk, and it syncs, so a phone's log can be
read on the desktop.

- **One note per launch**, in `Orbis debug logs/`, named after the device and the moment its first line was written:
  `Android phone 2026-10-11 09-36-12.md`. A note no other launch writes to cannot become a sync conflict, which a
  single note appended to after a crash did under Self-hosted LiveSync.
- The note is one `~~~log` block, opened with the build stamp, so a line reads as written rather than as Markdown.
- Each line is written at once, with whatever arrived during the previous write; there is no timer.
- **Lines not yet on disk are also held in local storage** (`orbis-dbg-note-unwritten`, with the note they belong
  to), because a note write needs the event loop and a hang stops it: the lines leading into a freeze are exactly the
  ones that would never be written. Local storage is written in the same call. The next launch puts them at the top
  of its own note, naming the note they never reached, then `This launch:`. The old note is not written to again.
- The categories gate the note as they gate the panel: it gets the lines the panel gets.

---

## Debug panel UI

The panel is an absolute overlay inside the reader host (`.orbis-debug-overlay`, in the z-index band above 99998 — see the comment in `DebugLog.ts`), shown and hidden by the chip or **Toggle debug log**. Structure:

**Header row 1:** `Debug log | Copy | Clear | Write to note | Close` — **Write to note** is highlighted while on; see
[Writing to notes](#writing-to-notes).

**Header row 2 (filter bar):** pill-style toggle buttons, one per category:
```
[relocate] [index] [pace] [display] [nav] [annot] [search] [export] [backlinks] [sync] [select] [annot-nav] [tts] [library] [sources] [settings]
```

- Active category: `data-active="1"`.
- Inactive: `data-active="0"`.
- Click toggles the `orbis-dbg-<cat>` localStorage key (setting `'1'` or removing it) and re-renders.

**Rendering model:** `render()` clears the list, pins the build stamp, then draws **every** buffered entry newest-first — there is no per-category render filter. What the pills actually control is **recording**: `add()` drops a categorized entry whose category is disabled, so toggling a category on affects only entries logged *from that point forward*; earlier entries for it were never stored. The buffer is capped at 200 entries, survives book opens, and is cleared by **Clear**.

Entries are stored as strings in the format `"HH:MM:SS.mmm [cat] message"`. **Copy** prepends the build stamp to a newest-first dump.

---

## Category assignments

These are stable call sites, not exhaustive — any `debug()`/`add()` call with the matching category is covered. The call sites live in the owning collaborators (navigation/index in `LocationIndex.ts`, annotations in `AnnotationController.ts`/`BookmarkController.ts`, search in `SearchController.ts`, pace in `ReadingStats.ts`), not in `OrbisReaderView.ts`.

| Area | Category | Representative messages |
|---|---|---|
| `applyDocStyles`, `applyHostBg` | `display` | theme, size, bg, brightness |
| `applyRenderer` | `display` | flow, columns |
| `adjustFontSize` | `display` | font size step |
| `goToSection`, `prevSection`, `nextSection`, `turnChapter`, `navigateToLoc` | `nav` | navigation steps |
| `buildLocationIndex`, `loadOrBuildLocationIndex` | `index` | cache hit/miss, done |
| `sectionHrefMap`, spine/TOC init | `index` | entries count, section count |
| `locsCache` save/load | `index` | pages, wordCounts, miss reason |
| `addBookmark`, `removeBookmark`, `calibrateBookmark` | `annot` | CFI, loc |
| Highlight / note create, update, delete, load | `annot` | CFI, color, count |
| `NoteIcons.refresh` | `annot` | icon positions |
| Search start / done | `search` | hit count |
| Backlinks scan / cache | `backlinks` | cache hit, count |
| Relocate event | `relocate` | section, loc, frac |
| MutationObserver theme change | `display` | theme class |
| Book export progress | `export` | chapter N/total, image path |
| Device location write / read / prompt | `sync` | CFI, device, count |
| WPM sample / effectiveWpm | `pace` | wpm, buffer size, trimmed mean |

---

## Instrumentation reference

### Annotations (`annot`)
- `highlight add — cfi:<> color:<> section:<>`
- `highlight color change — cfi:<> old:<> new:<>`
- `highlight delete — cfi:<>`
- `highlights load — count:<> file:<>`
- `highlights save — count:<>`
- `note create — cfi:<> section:<> text length:<>`
- `note update — id:<>`
- `note delete — id:<>`
- `notes load — count:<>`

### Pace (`pace`)
- `pace sample — page:<> words:<> elapsed:<>s wpm:<> buffer size:<>`
- `pace effectiveWpm — samples:<> trimmedMean:<>` — logged once per sample addition
- `pace insufficient data — samples:<> need:<>` — logged after a sample is added but before the threshold is met; not logged on every page turn

### Export (`export`)
- `export start — chapters:<> includeImages:<>`
- `export chapter <n>/<total> — "<title>" words:<>`
- `export image — section:<> src:<> format:<>`
- `export done — files written:<> elapsed:<>ms`
- `export error — <message>`

### Sync (`sync`)
- `sync write — cfi:<> device:<>`
- `sync read own lastOpened:<>`
- `sync other devices — count:<> newer:<>`
- `sync prompt shown — device:<> theirCfi:<>`

### Index / init (`index`)
- `toc loaded — items:<> depth:<>`
- `spine loaded — sections:<>`
- `sectionHrefMap — entries:<>`
- `buildLocationIndex done — pages:<> fractions:<> totalLocs:<>` (also triggers the locations-cache save)
- `locsCache load — pages:<> sections:<>`
- `locsCache load (fraction-only) — sections:<> fractions:<>` (AZW3/MOBI-style books with no page navigation)
- `locsCache miss — reason: no cache file | totalLocs mismatch (cached:<> current:<>) | missing sectionWordCounts | sectionLocInfo empty | fraction-only cache miss`
- `readingStats load — samples:<>`
- `readingStats save — samples:<>`
