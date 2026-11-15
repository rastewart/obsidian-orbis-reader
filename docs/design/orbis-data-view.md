# Orbis Data View

← [Design Docs](README.md)

## Overview

The Orbis Data View is a vault-native panel for a book's reading data — cover, metadata, reading activity, table of contents, highlights, notes, bookmarks, and linked notes — accessible from the Obsidian file explorer without opening the book in the reader.

It rests on three things:

1. **The folder**: a book's reading data lives in `!orbis-data/`, beside the book
2. **The extension**: the annotations file is `{book}.orbis` (the other files stay `.json`)
3. **A custom view**: clicking a `.orbis` file opens `OrbisDataView`

The `!` prefix on the folder name sorts it above all alphabetic entries in Obsidian's file explorer and is valid on Windows (NTFS), macOS (APFS), and Linux. It avoids the sync-visibility problems that dot-prefix names have with some self-hosted live sync tools.

There are four entry points for opening the data view:

- **`···` menu** — "Show reading data" in the pane more-options menu whenever a book is open.
- **Command palette** — `orbis-show-reading-data-for-this-book` / "Show reading data for this book" (reader checkCallback).
- **Library** — "Reading data" in a title's menu, once the book has a `.orbis` file (`caps.hasData`).
- **File explorer** — selecting the `.orbis` file directly.

---

## File System Layout

```
library/
  epub/
    Sample Book.epub
    !orbis-data/
      Sample Book.epub.orbis                 ← annotations (visible in file explorer)
      Sample Book.epub.location.abc123.json  ← per-device location (hidden — .json)
      Sample Book.epub.location.xyz789.json  ← per-device location (hidden — .json)
      Sample Book.epub.marks.abc123.json     ← per-device mark changes (hidden — .json)
      Sample Book.epub.pages.json            ← page cache (hidden — .json)
      Sample Book.epub.origin.json           ← source note, for a Read in Orbis Reader book only
      audio/Sample Book.epub.audio/          ← recordings, once the book has any
      !readme.md                             ← written when the folder is made; rewritten when out of date
```

Every name starts with the book's whole file name, extension included (`sidecarStem`), so two formats of one book in a folder keep separate data. `sidecarSuffix` matches a name to its book exactly — never by prefix, which would hand `Book 2.epub`'s files to `Book.epub`.

Location and page-cache files stay as `.json` — those extensions are not registered as custom view types, so Obsidian hides them from the file explorer by default.

---

## Data Model

The `.orbis` file is valid JSON. Top-level fields:

| Field | Type | Description |
|---|---|---|
| `highlights` | `Highlight[]` | All highlights |
| `bookmarks` | `Bookmark[]` | All bookmarks |
| `notes` | `Note[]` | All notes (highlight + user text) |
| `notesFiles` | `NotesFileSet[]` | Records of generated notes export files |
| `readingStats` | `ReadingStats` | WPM samples and last-updated timestamp |
| `title` | `string` | Book title (cached from metadata on first open) |
| `author` | `string` | Author (cached from metadata on first open) |
| `coverImage` | `string` | Base64 JPEG data URL of the cover, max 400 px wide |
| `toc` | `TocEntry[]` | Flattened TOC with CFI navigation targets (cached) |

Interfaces are defined in `progress.ts`.

---

## Migration

There is none: no other folder name or extension is read. See `docs/design/data-migration.md` for the general pattern (guard flag, `adapter.exists()` targeting, partial-destination merge) if a future format change needs one.

---

## Vault Event Handlers

Both handlers are registered in `main.ts` `onload()` via `this.registerEvent()`.

### Delete handler

Fires when any vault file is deleted.

```
vault.on('delete', async (file: TAbstractFile) => {
  if not TFile → return
  if file.extension not in SUPPORTED_EXTENSIONS → return

  movedTo = await bookMoves.deleted({ path, name, size })      // up to 5 s
  if movedTo → followBook(movedTo, file.path); return           // the rename handler's path

  trashBookData: audio/<book>.audio/, then every file whose sidecarSuffix(stem, name) matches
    → fileManager.trashFile, so Obsidian's trash setting decides; a file not in the index is left in place
  remove !orbis-data and audio/ if now empty
  if the Library is on: trash the title note, or keep it and say so
  if anything was removed → Notice: "Orbis: removed reading data for "{file.basename}"."
})
```

**Obsidian reports a book moved OUTSIDE it as a delete and a create.** Its file watcher only sees one path vanish and another appear (`reconcileDeletion` → `file-removed` → vault `delete`); `rename` comes only from a rename Obsidian performs itself. `BookMoveMatcher` (`book-moves.ts`) pairs the two, in either order and within 5 s, by file name and size: a deleted book that turns up elsewhere was moved, and its data, records and title note follow it as they would a rename. Creations during startup are not recorded, since every file arrives as one then.

What it cannot see: a book also renamed outside Obsidian (a deletion — its data goes to the trash), and a move made while Obsidian was closed (no events — the data stays under the old name). **Trash, not deletion**, is what keeps the first recoverable.

Deleting the `.orbis` file itself re-fires the event, but `.orbis` is not in `SUPPORTED_EXTENSIONS` so the handler returns immediately — no loop.

### Rename handler

Fires when any vault file is renamed or moved.

```
vault.on('rename', async (file: TAbstractFile, oldPath: string) => {
  if not TFile → return
  if file.extension not in SUPPORTED_EXTENSIONS → return

  oldStem   = sidecarStem(oldPath)      // whole file name, extension included
  newStem   = sidecarStem(file.path)
  oldFolder = oldParent + '/!orbis-data'
  newFolder = progressFolderPath(file)

  if oldFolder does not exist → return
  for each file in oldFolder whose sidecarSuffix(oldStem, name) matches:
    skip it if newFolder + '/' + newStem + suffix already exists   // another book's, or a synced copy already here
    ensure newFolder exists
    rename it there
  rename audio/<oldStem>.audio/ to newFolder/audio/<newStem>.audio/, unless that exists

  if oldFolder is now empty and oldFolder ≠ newFolder → delete oldFolder
  then: reading records follow the book, and title notes are relinked
})
```

---

## OrbisDataView

### Registration

```typescript
// main.ts onload()
this.registerView(VIEW_TYPE_ORBIS_DATA, leaf => new OrbisDataView(leaf, this));
this.registerExtensions(['orbis'], VIEW_TYPE_ORBIS_DATA);
```

`VIEW_TYPE_ORBIS_DATA = 'orbis-data-view'`

`OrbisDataView extends FileView`. `canAcceptExtension` returns `true` for `'orbis'` only.

### Shared open logic

`openBookDataFile(app, bookFile)` in `book-data-file.ts`:

1. Compute the `.orbis` path via `progressFilePath(bookFile)`.
2. Ensure `!orbis-data/` exists (`ensureDataFolderAt`, which writes `!readme.md` into any folder it makes), then rewrite `!readme.md` if it is absent or its text is not the current text (`writeFolderReadme`). Opening a `.orbis` directly does the second part too, in `OrbisDataView.onLoadFile`.
3. If the `.orbis` file doesn't exist: write `{ "version": … }` and wait 100 ms for the vault cache to register it. If it still cannot be found: Notice "Could not open reading data file."
4. If a leaf already shows this file, focus it. Otherwise open it beside the current one, in a split (`openNoteBeside`).

### Live reload

`onload` registers one `vault.on('modify', ...)` for the life of the view, compared against `this.file` — not one per `onLoadFile`, which kept a listener for every file the tab had shown and redrew an earlier file's data into it. Any change to the file on show (a new mark, a reading-speed sample from a page turn) triggers a full re-render. A page turn alone writes only the location file, so the Reading activity table refreshes on the next write to `.orbis`.

### Book file resolution

The book is the `.orbis` name without `.orbis`, in the folder above `!orbis-data/` (`sidecarBookPath`), and must be a supported book format.

---

## Rendering

`render(file)` is called on load and on every modify event. It reads and parses the `.orbis` file, then renders the following sections in order.

### Header

Rendered by `renderHeader(container, data, file, bookFile)`:

1. **Cover + title block** — if `data.coverImage` is present, an `<img>` is placed left of the title/author block; when it is absent, a rendered **title + author stand-in** takes its place (`.orbis-cover-fallback`, shared with the full-screen player — see "Cover art" below). Title falls back to `file.basename`; `data.author` is cast to `String()` defensively (a file may hold author as an object).
2. **Annotation summary** — counts of bookmarks, highlights, and notes joined with ` · `.
3. **Reading stats** — if `readingStats.wpmSamples` has entries: average WPM; if `readingStats.lastUpdated` is set: "Last read: {date}", the last page turn that produced a speed sample.
4. **Reading activity table** — calls `readAllDeviceLocations()` and `readLocsCache()` in parallel. For each device, shows device name, last-opened date, and a clickable location link. Clicking the location link calls `doJumpTo(locItem.location, bookFile)`.

### Cover art

`coverImage` is written in one place and read in two.

Written by `cacheBookInfo()` (reader view, first open): it calls `getCover()` on the raw book object
returned by the format handler and stores a downscaled data URL — but **only when the field is absent**,
so the first successful extraction wins forever.

Read by this view (the `<img>` above) and by the full-screen audio player, via
`OrbisReaderView.getCoverBlob()`.

**Cover extraction does not go through `loadBlob`.** `this.bookResources` is assigned only when the book
object has `loadBlob`, an EPUB resource loader other consumers need; **MOBI and AZW3 expose `getCover`
without it**. So cover extraction hangs off its own ungated `bookGetCover` reference (bound, since
foliate's handlers use `this`).

`getCoverBlob()` then falls back to the cached `coverImage` (via `dataUrlToBlob`, the inverse of
`blobToDataUrl`, tolerant of malformed input since the file is hand-editable). So the player agrees
with this view even where live extraction is unreliable for a format.

**Why the stand-in is rendered, not generated and cached.** A generated placeholder written to
`coverImage` would be indistinguishable from a real cover to the `if (!existing.coverImage)` guard, so
it would **permanently block a real cover from ever being saved**. Rendering also tracks a later
title/author change for free. Writing a real image would need a `coverGenerated` flag so the guard could
tell "no cover yet" from "placeholder standing in".

### TOC extraction

If `data.toc` is missing or empty and a `bookFile` is found, the TOC is extracted and cached:

1. **From reader** (`extractTocFromReader`) — checks open `orbis-reader` leaves for one whose `.file.path` matches. Reads `bookToc` and `bookSectionsPublic` from the view. Maps each item to a `TocEntry` with a CFI navigation target (see Navigation below). Saves the result to the `.orbis` file non-blocking.
2. **Direct parse** (`extractTocFromBook`) — if the reader is not open: reads the ebook binary via `app.vault.adapter.readBinary`, calls `foliateModule.makeBook(blob)`, and extracts `toc` and `sections` from the returned book object. Maps to `TocEntry[]` and saves.

### TOC rendering (`renderToc`)

Renders inside a `<details>` element with no count badge, unlike the sections after it: theirs says whether there is anything to open, and nearly every book has contents. TOC rows are placed inside a scrollable `<div class="orbis-data-scroll">` (max-height 380 px). Each row is indented by `depth × 16 px`. Rows with a non-empty `cfi` get `cursor: pointer` and a click handler calling `doJumpTo`.

### Bookmarks, Highlights, Notes (`renderSection`)

Each type renders inside a `<details>` element. Items are `<div class="orbis-saved-item orbis-data-item">`. The full row is clickable when a CFI is available — `cursor: pointer` and `addEventListener('click', doJumpTo)`.

- **Bookmarks**: chapter label + location label (or fallback label).
- **Highlights**: color swatch + chapter + location + text excerpt (truncated to 100 chars).
- **Notes**: color swatch + chapter + location + note text (80 chars) + selected text excerpt (80 chars).

### Linked notes (`renderBacklinks`)

Calls the shared `scanBacklinks(bookFile.path, app)` utility from `progress.ts`, which detects two link types:

- **File links** (`[[book.epub]]` or `[text](path/to/book.epub)`) — found via `metadataCache.resolvedLinks`.
- **Deep links** (`obsidian://orbis-nav?file=…`) — found by content-scanning vault markdown files.

The section shows "Scanning…" while the async scan runs. Results are never cached here — the scan runs again each time the view redraws, so the list is always current. Each result is a clickable link that opens the note in a new tab. See [Toolbar & Panels — Backlinks tab](toolbar-and-panels.md) for the full algorithm.

---

## Navigation

`doJumpTo(cfi, bookFile)` handles all navigation from the data view to the reader:

1. Finds existing `orbis-reader` leaf open for `bookFile`; otherwise opens `bookFile` in a new tab.
2. Sets the leaf as active.
3. Polls every 200 ms (up to 20 attempts, 4.3 s total) for `view.navigateToCfi` and `view.foliateView` to be present (the reader is async).
4. On success: calls `view.navigateToCfi(cfi)`.
5. On timeout: shows a `Notice`.

### CFI mapping by format

**EPUB / AZW3 / FB2:**

TOC hrefs are relative file paths (e.g. `chapter03.xhtml`). `sectionIdxForHref` finds the matching spine section by comparing basenames and full paths. The CFI is `epubcfi(/6/${(idx + 1) * 2}!/4)`.

**MOBI:**

Section IDs are **numbers** (`0`, `1`, `2`, …), not strings. TOC hrefs are Kindle position URLs of the form `kindle:pos:fid:0001:off:000000021M`. These are passed through as-is as the `cfi` field — `foliateView.goTo()` handles them natively. No epubcfi conversion is attempted.

Detection: `typeof sections[0].id === 'number'`.

**`??` operator caveat:** `0 ?? ''` returns `0` (a number), not `''`, because `??` only catches `null`/`undefined`. Section IDs must be coerced with `String(s.id ?? '')` before any string operations to avoid `TypeError: split is not a function`.

---

## Debug Panel

When the device setting `showDebugButton` is true, the `···` pane menu includes a "Show/Hide debug log" item. The debug panel is a timestamped log of all internal events (render start, TOC extraction steps, navigation attempts). It supports copy-to-clipboard and clear. The log is capped at 300 entries (ring buffer).

---

## Degraded States

| State | Display |
|---|---|
| `.orbis` file is empty or all sections empty | Each section shows "None yet." |
| `.orbis` file is malformed JSON | Error paragraph: "Could not load reading data." |
| Book file not found | Header renders without activity table; TOC not extracted; navigation buttons absent |
| TOC not yet cached, reader not open | `makeBook()` parse attempted directly from the binary |
| `makeBook()` fails or returns empty TOC | TOC section shows "None yet." |
| CBZ (no text annotations) | Highlights/Notes sections show "None yet."; bookmarks may still appear |
| Navigation timeout (reader not ready in 4.3 s) | Notice: "Could not navigate — no book is open." |
| Book file not found, entry selected | Notice: "Book file not found." |

---

## Files

| File | Role |
|---|---|
| `src/OrbisDataView.ts` | `OrbisDataView` class |
| `src/book-data-file.ts` | `openBookDataFile` — the folder, the readme, the empty `.orbis`, and opening it beside the book |
| `src/main.ts` | View registration, extension registration, vault handlers, `orbis-show-reading-data-for-this-book` command |
| `src/OrbisReaderView.ts` | `onPaneMenu` "Show reading data" item; per-chapter notes `open_chapter` URL (no vault param) |
| `src/reader/LocationIndex.ts` | `buildSectionHrefMap` MOBI fallback (invoked via `this.locIndex.buildSectionHrefMap()`) |
| `src/progress.ts` | `progressFolderPath` returns `!orbis-data`; `progressFilePath` returns `.orbis` extension |
| `styles.css` | `.orbis-data-*` classes for header, table, TOC scroll container, annotation items, location link, debug panel |
| `docs/guide/orbis-file.md` | End-user guide |
