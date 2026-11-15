# Reader architecture

← [Design Docs](README.md)

The reader is one Obsidian `ItemView` — `OrbisReaderView` — that owns Foliate and delegates feature work to
collaborators under `src/reader/`, each constructed by the view and handed a narrow `ReaderContext` rather than the
whole view. This describes that shape, why it is that shape, and the rules that keep it.

## What lives outside the shell

Work that is not reader work lives in its own module, even when only the reader calls it:

| Module | What it owns |
|---|---|
| `reader/tts/recording-library.ts` | What recordings exist, and renaming or deleting one |
| `reader/tts/recording-run.ts` | A generation run in flight, its progress and its chip |
| `GenerateNotesModal.ts` | The Generate notes dialog |
| `DeviceLocationsModal.ts` | The device locations dialog |
| `reader/RecordsController.ts` | When annotations become notes, and where |
| `marks-pdf-source.ts` | Reading the book into what Save as PDF needs |
| `reader/SentenceSelection.ts` | Selecting by sentence and paragraph from the keyboard |

Two entry points stay on the view — `openOrCreateNotesFile` and `openRecordingsModal` — because they construct
dialogs that take the view itself. Moving them would hand the whole view to a collaborator that has only
`ReaderContext`, which is the coupling this shape exists to avoid.

---

## What the shape is for

- **The view is a lifecycle-and-coordination shell.** It owns Foliate and the Obsidian lifecycle; feature work
  belongs to a collaborator.
- **Each subsystem owns its own state and its own `dispose()`**, so cleanup lives next to the state it owns and
  `resetFileState()` is a list of `.dispose()` calls rather than a place to forget one.
- **Logic behind `this` cannot be unit-tested.** A collaborator's pure logic lives in its own module —
  `stats-math`, `bookmark-utils`, `panel-utils`, `export-format` and the rest — where tests can reach it.
- **The well-factored modules stay out of it** — `progress.ts`, `book-extractor.ts`, `settings.ts`,
  `turndown-rules.ts`, `toc-utils.ts`, `i18n/`.

---

## Strategy: owned collaborators behind a narrow context

Each subsystem is a class that **the view owns** and that takes a narrow,
explicit dependency on the view rather than reaching into `this`.

The pattern is the one `createOrbisPopup()` uses: it depends on
`OrbisPopupHost` — a small *structural* interface (`contentEl`,
`lockMobileHeights()`, `unlockMobileHeights()`) rather than on `OrbisReaderView`
directly, to avoid a circular import (see [Dialog System](dialog-system.md)).
The reader generalizes that same idea.

One `ReaderContext` interface exposes only what collaborators legitimately
need. Collaborators are constructed with it and never see the full view. It
**grows a member at a time, only when something needs it** — each addition a reviewed
decision, not a reflex. Add only what something actually consumes, confirm each
member's shape against its call site rather than guessing, and never add
speculatively. **`src/reader/ReaderContext.ts` is the source of truth** for its members.

`OrbisReaderView` implements `ReaderContext` (mostly via fields and getters it
already has) and passes `this` to each collaborator's constructor. If a collaborator
needs something not on it, that is a prompt to decide whether the dependency is
legitimate or a smell — not an automatic widening of the interface.

Each collaborator owns its own fields and exposes a `dispose()`:

```ts
// src/reader/SearchController.ts
export class SearchController {
  private results: SearchHit[] = [];
  private barEl: HTMLElement | null = null;
  // …all search-specific fields live here…

  constructor(private ctx: ReaderContext) {}

  openBar(): void { /* … */ }
  clear(): void { /* … */ }
  dispose(): void { /* this subsystem's share of resetFileState() */ }
}
```

`resetFileState()` is then a list of calls:

```ts
this.search.dispose();
this.annotations.dispose();
this.panels.dispose();
this.focusMode.dispose();
// …
```

---

## Subsystem map

How the concerns divide. The table names each collaborator by the work it owns; `src/reader/` is the source of
truth for what exists now, and there are many more files there than this table lists.

| Module | Representative methods | State it owns |
|---|---|---|
| `reader/SearchController.ts` | `openSearchBar`, `closeSearchBar`, `searchGoTo`, `searchNext/Prev`, `renderSearchResults`, `clearSearch`, `updateSearchUI` | `searchResults`, `searchActiveIndex`, `searchQuery`, `searchBar*`, `search*Btn`, `pendingSearchNavCfi` (~18 fields) |
| `reader/ReaderPanels.ts` | `openPanel`, `closePanel`, `activatePanelTab`, `buildCombinedPanel`, `renderSavedPanel`, `renderBacklinksPane`, `renderStatsPane`, `updatePanelTabVisibility` | `tocPanel`, `tocActiveTab`, `tocTabBtns/Panes`, `savedItemsEl`, `savedCollapsed`, `backlinks*` (~15 fields) |
| `reader/AnnotationController.ts` | highlights (`setupHighlightUI`, `addHighlight`, `changeHighlightColor`, `removeHighlight`, `openHighlightDrawer`); notes (`openNoteEditor`, `saveNote`, `deleteNote`); bookmarks (`addBookmark`, `removeBookmark`, `calibrateBookmarkLoc`, `toggleBookmark`) | `highlights`, `notes`, `bookmarks`, `notePopup*`, `highlightDrawer`, `hlDrawerState` (~15 fields) |
| `reader/NoteIcons.ts` | `refresh`, `scheduleRefresh`, `track`, `toggle`, `applyVisibility`, `buildColumn`, `buildToggle` | the icon strip and in-page layer, the toggle button, each note's live `Range`, the refresh timer |
| `reader/annotation-touch.ts` (functions) | `watchAnnotationTouches`, `hitNear` | per section document: one `TapTracker` |
| `reader/FocusMode.ts` | `enterFocusMode`, `exitFocusMode`, `toggleFocusMode`, `setNativeNavBar`, `setFocusModeSearchSpace` | `focusMode`, `focusModeObserver`, `focusModeAncestorStyles`, `focusOverlayEl`, `focusProgressEl`, `focusBtn` (~7 fields) |
| `reader/ReadingStats.ts` | `getSectionProgress`, `getChapterProgress`, `getChapterBoundaries`, `recordWpmSample`, `effectiveWpm`, `wordsRemaining*`, `buildSectionLocInfo`, `rebuildPageWordCounts`, `cycleProgressMode`, `formatLocLabel` | `wpmSamples`, `paceTimer*`, `sectionWord/CharCounts`, `pageWordCounts`, `locMode`, `sectionLocInfo`, `chapterBoundaryCache`, `locationIndex*` (~25 fields) |
| `reader/NotesExporter.ts` | `buildNotesMarkdown`, `generateCompanionNotes`, `generatePerChapterNotes`, `writeNotesFile`, `buildAnnotationBuckets`, `resolveChapterFilePlans`, `openOrCreateNotesFile`, `buildDeepLink` | mostly stateless; reads annotations via `ReaderContext` |
| `reader/ClipboardExporter.ts` | `copyLink`, `copyHighlights`, `copyNotes`, `copyBookmarks`, `buildClipboardMarkdown` | stateless |
| `reader/LinkPreview.ts` | `setupLinkPreview`, `extractLinkPreviewText`, `showLinkPreviewPopup` | `linkPreviewCleanup` |
| `reader/DebugLog.ts` | `addDebugEntry`, `renderDebugEntries`, `toggleDebugLog` | `debugLog`, `debugPanel*`, `debugBtn` (~5 fields) |
| `reader/MobileDom.ts` (helpers, not necessarily a class) | `installSelectionLock`, `installFocusinSuppressor`, `installMobileSelectionSnapback` | selection/keyboard workaround listeners |

**Stays in `OrbisReaderView.ts`** — the coordination shell: Obsidian lifecycle
(`onLoadFile`, `onUnloadFile`, `onload`, `onunload`, `resetFileState`), Foliate
setup and rendering (`renderReader`, `applyDocStyles`, `applyHostBg`,
`applyRenderer`, `reinjectAllDocs`), the navigation primitives
(`navigateToCfi/Href/Loc`, `goToFraction`) that back the `ReaderContext`, and the
`relocate`/`loaded`/`book-error` event routing that fans out to the collaborators.

The display menu / toolbar logic (`openDisplayMenu`, `activateDisplayTab`,
`bindRealTimeSlider`, etc.) has a companion file, `display-menu.ts` — display-menu
work belongs there rather than in a new `reader/` module.

---

## Rules that keep this shape

- **A collaborator imports the `ReaderContext` interface, never `OrbisReaderView` the class.** This is the same
  discipline `OrbisPopupHost` enforces for dialogs, and it is what stops the import graph closing on itself. Keep
  `ReaderContext` in its own file. `fallow dead-code` reports circular dependencies, and a cycle is usually one
  function living in the wrong file.
- **Where ownership is ambiguous, the owner is whoever *mutates* it.** Some state feeds several concerns —
  `tocItems` reaches panels, search and export. Everyone else reads it through `ReaderContext` or an accessor;
  nobody keeps a second copy.
- **`relocate` fan-out order is load-bearing.** It updates the progress bar, page label, stats and annotation
  overlays in a fixed order; changing it causes timing regressions that do not look like ordering bugs.
- **`ReaderContext` grows a member at a time, and only when something consumes it.** It is the shared-reading
  surface. If a collaborator wants something not on it, that is a prompt to decide whether the dependency is
  legitimate, not an automatic widening.
- **New feature work goes beside the shell, not inside it.** The test: if the code does not touch the Foliate
  handle or the Obsidian lifecycle, it does not belong in `OrbisReaderView`.

  The shell is where the Foliate handle and the lifecycle are, so it is always the path of least resistance.
  **`pnpm lint:size` holds this file to a number** in `scripts/size-budget.json`: growth past it fails, and
  shrinking below it fails too until the budget is tightened, so an extraction cannot leave slack for the next
  feature to spend. See [Code Standards](code-standards.md#the-size-ratchet).

- **A dialog gets its own file.** A dialog that shares the view's file makes the view look like the place a dialog
  goes.

See the [Architecture Extension Guide](architecture-extension-guide.md) for how to add one.
