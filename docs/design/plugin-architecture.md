# Plugin Architecture Overview

← [Design Docs](README.md)

## Source layout

```
src/
  main.ts               — OrbisReaderPlugin (Plugin subclass): registers view, commands, protocol handler
  OrbisReaderView.ts    — OrbisReaderView (FileView subclass): the reader lifecycle/coordination shell
                          (Foliate setup, the relocate orchestrator, display/rendering, toolbar,
                          navigation primitives, collaborator wiring). Feature logic lives in reader/.
  reader/               — the reader's owned collaborators (see Reader View Refactor doc)
    ReaderContext.ts      — the narrow interface collaborators depend on instead of the view class
    <X>Host.ts            — single-consumer host interfaces (AnnotationHost, StatsHost, PanelsHost,
                            LinkPreviewHost, LocationIndexHost, FocusModeHost) the view implements
    SearchController.ts, ReaderPanels.ts, AnnotationController.ts, BookmarkController.ts,
    ReadingStats.ts, LocationIndex.ts, FocusMode.ts, LinkPreview.ts, ReaderDom.ts,
    NavSuppressor.ts, DebugLog.ts, NotesExporter.ts, ClipboardExporter.ts   — the collaborators
    stats-math.ts, bookmark-utils.ts, panel-utils.ts, search-utils.ts, export-format.ts,
    note-set-leftovers.ts,
    foliate-view.ts       — pure/shared helpers extracted for unit testing
  OrbisSettings.ts      — OrbisSettings (PluginSettingTab subclass): settings UI (4 tabs)
  OrbisDataView.ts      — OrbisDataView (FileView subclass) for `.orbis` files; see Orbis Data View doc
  settings.ts           — types, constants, pure helpers (no Obsidian API calls); DebugCategory lives here
  progress.ts           — vault I/O for all per-book data (location, annotations, stats, notes files)
  book-extractor.ts     — epub→Markdown conversion (extractBook, extractBookPerChapter)
  turndown-rules.ts     — custom Turndown rules for epub HTML→Markdown
  toc-utils.ts          — TOC flattening / anchor resolution
  goto-parser.ts        — Go-to input parsing (location number vs. percent)
  display-commands.ts   — pure display-setting step helpers (font/line-height/brightness/margins)
  display-menu.ts       — the Display Style menu UI
  build-info.ts         — build stamp (BUILD_TIME / BUILD_COMMIT); see Debug System doc
  foliate-patches.ts    — browser patches foliate-js needs in Obsidian; all removed on unload
  runtime-patch.ts      — wrapMethod / wrapSetter: a patch that comes off without removing another plugin's
  foliate-js.d.ts       — TypeScript ambient declarations for foliate-js modules
  NotesDiffModal.ts     — FileDiffModal and PerChapterMergeModal (notes merge UI)
  BookExportModal.ts    — BookExportModal (export options UI)
  AboutDialog.ts        — the `Orbis: About` dialog (version + build stamp)
  ui-utils.ts           — createOrbisPopup shared dialog scaffolding; see Dialog System doc
  i18n/                 — t() framework and en.ts locale; see Localization doc
  __mocks__/obsidian.ts — empty stubs for the `obsidian` module used in vitest
  __tests__/            — vitest unit tests for pure functions (14 suites)
```

`OrbisReaderView` is a lifecycle-and-coordination shell: it owns Foliate and the Obsidian lifecycle, and the feature subsystems live under `reader/` as collaborators, each constructed by the view and given a narrow `ReaderContext` (or a dedicated single-consumer host interface) rather than the whole view. `pnpm lint:size` holds its size. See [Reader architecture](reader-architecture.md) and, for extending it, the [Architecture Extension Guide](architecture-extension-guide.md).

The build entry point is `src/main.ts`; esbuild produces `main.js` in the repo root.

---

## Plugin lifecycle

`OrbisReaderPlugin.onload()` runs once when the plugin is enabled:

1. **Loads settings** from `data.json` via `this.loadData()`, merged with `DEFAULT_PLUGIN_SETTINGS`.
2. **Migrates note styles** — if `noteStyles` is empty (first run after upgrade), constructs a `Default` `NoteStyle` from the old flat settings fields and saves it.
3. **Initializes device style** — if no `DisplayStyle` with the current `deviceId` exists, creates one capturing the current `localStorage` display settings and makes it active.
4. **Registers the setting tab**, the view type, and the file extensions `[epub, mobi, azw3, cbz, fb2]`.
5. **Registers all commands** (see below).
6. **Registers the `obsidian://orbis-nav` protocol handler** for deep-link navigation.

`onunload()` detaches all open `VIEW_TYPE_ORBIS` leaves.

---

## Settings storage

Plugin settings are an `OrbisPluginSettings` object persisted to `data.json` via Obsidian's built-in sync mechanism (`loadData` / `saveData`). This means settings travel between devices through Obsidian Sync automatically.

**`saveData` writes the WHOLE in-memory object**, so a device holding a stale copy silently discards whatever another device wrote. That is why `onExternalSettingsChange` reconciles against the file rather than trusting memory, and why a save compares canonical JSON before writing — see the guard in `main.ts`. Anything added to `OrbisPluginSettings` inherits this hazard.

**Display settings** (font size, theme, brightness, flow, margins, columns, line height, text alignment) are stored in `localStorage`, not `data.json`. This keeps them device-local by design — different screens warrant different typography choices. Obsidian scopes `loadLocalStorage`/`saveLocalStorage` per vault, so these are per device *and* per vault: a test vault's typography says nothing about the real one's. The relevant keys all have the `orbis-` prefix:

| Key | Type | Default |
|---|---|---|
| `orbis-active-style-id` | string | (device style id) |
| `orbis-font-size` | number | 100 |
| `orbis-font-family` | string | 'default' |
| `orbis-theme` | string | 'auto' |
| `orbis-brightness` | number | 100 |
| `orbis-flow` | string | 'paginated' |
| `orbis-columns` | number | 2 |
| `orbis-line-height` | number | 1.5 |
| `orbis-margins` | number | 3 |
| `orbis-text-align` | `'book'` \| `'left'` \| `'justify'` | `'book'` |

Defaults live in one place, `DISPLAY_DEFAULTS` in `settings.ts`; the table above is a copy and the constant is the truth.

**Those keys are the live values, not the unit a reader manages.** That is a `DisplayStyle`, and there are two kinds, deliberately kept apart:

- **Named styles** live in `OrbisPluginSettings.styles[]`, so they travel with the vault. They snapshot the display settings at the moment one is saved (`readCurrentDisplaySettings()`) and are restored by `applyStyleToLocalStorage()`.
- **The device's own style** lives in vault-scoped device storage under `orbis-device-style` (`device-style.ts`), and must not travel. Every device makes one on first load from whatever the reader was already looking at; it cannot be renamed, deleted or shared.

It is not in `styles[]`: an array holding both cannot simply be published, and a device style inside a synced document means one device's typography landing on another — the same fault as a synced voice preference. See [Multi-device sync](multi-device-sync.md).

---

## View lifecycle

`OrbisReaderView` extends Obsidian's `FileView`. Obsidian constructs one per open leaf.

### Open sequence

1. `onload()` — attaches a `storage` event listener that forwards `localStorage` changes into the rendered iframe (`handleStorageEvent`). Registers resize observer.
2. `onLoadFile(file)` — called by Obsidian when a file is opened in this leaf:
   - Stores `this.currentFile`.
   - Loads all per-book data from the vault: location, bookmarks, highlights, notes, notes files, pages cache, reading stats.
   - Renders the reader iframe (`renderReader`).
3. **iframe ready** — foliate-js fires `loaded`, then `book-error` or `relocate` events back into the host via `postMessage`.
4. **`relocate`** — the view's relocate handler is the orchestrator: it fans out to the collaborators in a fixed order (location index build/calibration, reading-stats fraction + WPM sampling, bookmark calibration, annotation icon refresh) to update the progress chip, location display, reading stats, and bookmark/highlight overlays. Saves the new location to the vault.

### Close sequence

1. Obsidian calls `onUnloadFile()` then `onunload()`.
2. `onUnloadFile` saves the last location, flushes any pending stats, removes resize observer.
3. `onunload` removes the `storage` listener registered in `onload`.

---

## Commands

**All of them are registered in `src/commands.ts`**, by a single `registerCommands(plugin)` that `main.ts` calls
once during load. Nothing registers a command anywhere else.

They fall into three groups, and the grouping is a rule about `checkCallback` rather than about file order:

**Global** (no active epub required):
- `orbis-toggle-link-preview` — toggles `linkPreviewEnabled` in plugin settings
- `orbis-switch-display-style` — opens `SwitchStyleModal`
- `orbis-about` — opens the About dialog (version + build stamp)
- `orbis-open-book` — opens the active `.epub` file in a split leaf

**Reader** (use `checkCallback`; return `false` when no `OrbisReaderView` is active):
- Display: toggle scrolled view, toggle column layout, increase/decrease font size, increase/decrease brightness, toggle justify, increase/decrease line height, increase/decrease margins, toggle focus mode
- Navigation: go back, go to location (`orbis-go-to-location`), cycle reading progress display
- Annotations: toggle bookmark, toggle note icons
- Panels: open contents, open search, open saved, open backlinks
- Notes: open or create notes file, generate companion notes (`orbis-generate-notes`)
- Clipboard: copy link, copy highlights, copy notes, copy bookmarks
- Sync: show device locations
- Book: recalculate locations (`orbis-recalculate-locations`), rebuild locations cache (`orbis-rebuild-location-index-for-current-book`), open book data (`orbis-show-reading-data-for-this-book`)
- Library (only when it is on): set the reading status, rate this book, open or write the title note, refresh/generate the cover
- Debug: toggle debug log, toggle debug toolbar button

The lists above name what each group covers rather than every command in it; `commands.ts` is the register.

**Developer / experimental** (hidden unless developer options are switched on):
`orbis-toggle-developer-options` is the always-visible gateway — *Toggle developer options* — and every command below it in
the file `checkCallback`s on the `showDevOptions` **device** setting: a palette is a device's own, so the flag
never travels and there is nothing to save to `data.json`. The index-recovery commands sit behind the same flag,
being rarely needed rather than experimental. It gates one settings row too (audio request parallelization, which
only helps a GPU server), which is why the label says *options* rather than *commands*.

---

## Deep-link protocol

`obsidian://orbis-nav?file=<path>[&cfi=<cfi>][&href=<href>][&loc=<n>][&pct=<n>]`

The handler resolves the vault path, opens the leaf (or focuses an existing one), then polls with `setTimeout` up to 25 times (×200 ms = 5 s) until one of `navigateToCfi`, `navigateToHref`, `goToFraction` (for `pct`), or `navigateToLoc` (for `loc`) dispatches successfully — in that precedence order. The `page=` parameter is a deprecated alias for `loc=` (still accepted, logs a warning). Deep links are generated by `buildDeepLink()` (in `src/reader/export-format.ts`) and appear in exported notes files.

### Arriving somewhere flashes it

**`navigateWhenReady` is the one copy of that poll**, and the reason it matters is what happens on arrival. Three routes open a book at a place — this deep link, a reading record's row in the Library, and a highlight, note or bookmark in the book's own `.orbis` data view — and all three go through it, so a landing cue added there reaches every route, including the data view, the one a reader uses most while reading.

On arrival, a **CFI destination flashes**: `flashAnchor` pulses the passage three times, outlined, in the search hit's color. The reasoning:

- **Only a CFI.** A flash outlines a range; `href`, `loc` and `pct` land you on a page without saying which lines were the point. Outlining a chapter would be noise, and inferring a line from a percentage would be precision that is not there. `flashTarget` is that rule, on its own and tested, because it decides whether the reader gets an answer to "why am I here?".
- **Outlined, not filled.** What you land on is usually already highlighted, and a 30%-opacity fill over a colored selection barely reads — the same reason search uses an outline. The color is deliberately not the annotation's own: this has a CFI, not an annotation, and a link into the middle of a chapter has no annotation to ask.
- **Fired on the request, not on a relocate.** A link to where you already are moves nothing, and the reader who clicked it is owed an answer anyway — "here" is what they asked to be shown.
- **The pulse waits for the section.** A link can land in a book that is still rendering, where pulses counted from the request would draw nothing and the reader would see no flash. `flashAnchor` waits (up to 3 s) for the first frame it *can* draw before counting pulses, superseded by its epoch so a second flash abandons the first.

**The content panel flashes too.** Highlight and note rows in Saved both go through one `goToSaved`, which flashes
on arrival. Contents rows do not flash: a chapter is an `href`, and the rule above applies.

**One switch governs every flash** — search results, bookmarks, panel rows and arrivals alike — checked inside `flashAnchor` rather than at each call site, because a check per caller is a promise to remember it. `flashOnNavigation` in Reading, on by default: *Flash book text for navigation and search results*.

---

## File layout on disk

```
<vault>/
  <book-folder>/!orbis-data/
    <book>.orbis                       — main per-book data (bookmarks, highlights, notes, stats, TOC, cover, notes files index)
    <book>.pages.json                  — pages cache (expensive to rebuild; version-gated)
    <book>.location.<deviceId>.json    — per-device location record (one per device, for multi-device sync)
  <notes-folder>/
    <book> Notes.md                    — single-file notes output
    <book> Notes/                      — per-chapter folder (when perChapter is enabled)
      000 - index.md                   — MOC file
      001 - Chapter One.md
      002 - Chapter Two.md
      …
```

The `!orbis-data` folder sits alongside the epub file. The leading `!` sorts it to the top of the vault file explorer. If the epub is at the vault root, `!orbis-data` is also at the root. Notes folder placement is controlled by the active `NoteStyle.config.notePath` and `useSameFolder` settings.
