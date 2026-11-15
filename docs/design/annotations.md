# Highlights, Notes & Bookmarks

← [Design Docs](README.md)

## Data model

All per-book annotations are persisted in a single JSON file alongside the epub:

```
<book-folder>/!orbis-data/<book>.orbis
```

Three annotation types share this file:

### Highlight (`progress.ts`)

```typescript
interface Highlight {
  id:          string;   // crypto.randomUUID()
  cfiRange:    string;   // EPUB CFI range (joinIndir of section base CFI + fromRange(DOM Range))
  text:        string;   // selected text
  color:       string;   // CSS hex color, e.g. '#FFEB3B'
  createdAt:   number;   // Date.now()
  chapter?:    string;   // TOC label at time of creation
  chapterHref?: string;  // unique chapter identity (labels repeat across parts; group/key on this)
  loc?:        number;   // foliate-reported location number at time of creation
}
```

### Note (`progress.ts`)

```typescript
interface Note {
  id:            string;
  cfiRange:      string;     // the range the note is anchored to
  text:          string;     // the note text (Markdown)
  selectedText?: string;     // the passage the note is attached to (may be absent)
  color?:        string;     // optional highlight color (hex) — null/undefined = no highlight
  createdAt:     number;
  chapter?:      string;
  chapterHref?:  string;     // unique chapter identity (see Highlight)
  loc?:          number;
}
```

Notes with no color still receive a synthetic `'transparent'` annotation so that `draw-annotation` fires and the margin icon can be positioned (see Overlayer section below).

### Bookmark (`progress.ts`)

```typescript
interface Bookmark {
  id:          string;
  cfi:         string;    // approximate CFI (from the current relocate event)
  exactCfi?:   string;    // ground-truth CFI reported by foliate when AT that location; used for navigation
  label:       string;    // auto-generated: "<chapter> · loc. <loc>" or "Bookmark"
  createdAt:   number;
  loc?:        number;
  chapter?:    string;
  chapterHref?: string;   // unique chapter identity (see Highlight)
}
```

A bookmark without `exactCfi` falls back to loc-number matching when navigating.

---

## Storage

All three types are stored as arrays under their respective keys in the single progress JSON:

```json
{
  "highlights": [ ... ],
  "notes":      [ ... ],
  "bookmarks":  [ ... ]
}
```

`readHighlights` / `saveHighlights`, `readNotes` / `saveNotes`, `readBookmarks` / `saveBookmarks` all use the shared `readProgressJson` helper which returns `{}` for missing or corrupt files. Every save function reads the current file first and updates only its own key, leaving others untouched.

During `readNotes`, the field `highlightColor` (the epub.js plugin's format) is normalized to `color` so the annotation drawing code always sees a consistent field.

---

## Selection & tap interaction model

Selecting text that overlaps an existing annotation has two plausible intents — *act on the
text I selected* vs *edit the annotation that's already here*. The model below disambiguates by
**gesture**.

### Two gestures, two intents

- **Tap** (a click/tap on an existing annotation, with **no** text selection) → **edit that
  annotation**.
- **Select** (a non-collapsed text selection) → **act on the selected text**. A live selection
  **suppresses the tap/edit path** (otherwise a drag over a highlight also fires Foliate's
  annotation-click and pops the edit UI mid-select).

### What each gesture offers

**Tap:**

| Tapped on | Result |
|---|---|
| Plain text (no annotation) | nothing |
| Highlight (no note) | picker bar: **change color · delete · copy link** |
| Note **with** a color | note dialog: **change color · edit text · delete · copy link** |
| Note **without** a color | nothing — it has no visible region to hit; open it via its **margin icon** |

**Select** — always offers **Look up + Copy link**; whether it also offers **Add highlight /
Add note** depends on overlap:

| Selection is on… | Offers |
|---|---|
| Fully un-annotated ("clean") text | **Add highlight · Add note · Look up · Copy link** |
| Text overlapping (fully **or** partially) any highlight or note | **Look up · Copy link** only |

### Why "no new annotation on overlap"

Highlights and notes are **separate entities**, and a "highlighted note" is a *note that carries
a color* (one Note entity) — **not** a highlight stacked on a note. So allowing "Add highlight"
over a note (or "Add note" over a highlight) would create **two entities on the same range** →
double rendering and an ambiguous tap target. Blocking new adds on any overlap prevents that by
construction. To edit what's already there, you **tap** it; to color a note, you edit the note
(its color lives on the Note).

### Consequences / rationale

- **Look up lives only on select** — you look up by selecting the words; tap is purely "edit."
- **Selecting noted text never auto-opens the note editor** — it shows the select actions
  (Look up / Copy link). Edit the note via its margin icon (tap).
- **Uncolored notes are invisible** — tap-on-text does nothing (no target); the margin icon is
  the entry point. Consequently, selecting such text offers only Look up + Copy link (you color
  it by editing the note, not by laying a separate highlight over it). This is consistent, though
  the note's invisibility is an inherent property of colorless notes, not a flaw in this model.
- **Copy link** is available everywhere a location exists: any selection, the highlight tap-bar,
  and the note dialog.

### Implementation notes

- Deciding "clean vs annotated" for a selection needs **range-overlap detection** (does the
  selection range intersect any highlight/note range?), not an exact-CFI match.
- The selection handler must **short-circuit the annotation-click (`show-annotation`) path**
  while a non-collapsed selection exists, so a drag over an annotation shows the select bar
  rather than the edit UI.

---

## Lifecycle (AnnotationController / BookmarkController)

Highlights and notes are owned by the **`AnnotationController`** collaborator
(`src/reader/AnnotationController.ts`) and bookmarks by **`BookmarkController`**
(`src/reader/BookmarkController.ts`). The view *registers* the Foliate overlay listeners
(they fire on the `<foliate-view>` element it owns), but each listener is a thin dispatcher
into these collaborators. `this.highlights` and the like below are controller fields.

### Load

On `onLoadFile`, `AnnotationController.load()` and `BookmarkController.load()` read
the three arrays from the vault into their own fields.

### foliate-js annotation events

foliate-js fires custom DOM events on the `<foliate-view>` element; the view routes each into `AnnotationController`:

**`create-overlay`** — fires whenever the paginator creates a new overlay for a section. Dispatches to `annot.reapplyAnnotations` (and `search.reapplyAnnotations`): clears stale note icons and calls `foliateView.addAnnotation` for every saved highlight and note. Annotations whose CFI doesn't belong to the currently loaded section are silently ignored by foliate-js.

**`draw-annotation`** — fires when foliate-js is ready to paint a specific annotation. The view dispatches in a fixed order — `annot.tryDrawNote(d)` → `search.tryDrawHit(d)` → `annot.drawDefaultHighlight(d)`:
- For **highlights**: calls `Overlayer.highlight({ color })` to paint the colored rectangle.
- For **notes with a color**: also calls `Overlayer.highlight({ color })`.
- For **notes (any color)**: hands the resolved `Range` to `noteIcons.track()` (`NoteIcons`, keyed by CFI), which schedules a refresh of the icons.

**`show-annotation`** — fires on click of an annotation. Dispatches to `annot.handleShowAnnotation`, which shows a context popup with options to edit or delete.

### Highlight picker placement

The color-picker toolbar (`#orbis-picker`) lives in the **outer Obsidian document** (`activeDocument.body`), not inside the epub iframe. This is necessary because:

- In paginated mode, Foliate renders all sections side-by-side in an extremely wide iframe. `position: fixed` inside that iframe is anchored to the layout viewport origin, not to the visible page, making reliable screen-relative positioning impossible.
- Moving the picker outside the iframe entirely sidesteps coordinate-system issues. `positionPicker()` uses `this.contentEl.getBoundingClientRect()` (outer-document coordinates) to center the picker below the Orbis toolbar.

`pickerEl` (an `AnnotationController` field) holds the reference; it is appended to `activeDocument.body` once per section load and cleaned up in `AnnotationController.dispose()`.

**`pendingRange`**: When `showNew()` fires (user has a text selection), the current `Range` is saved into `pendingRange` before the picker is shown. The outer-document picker gaining focus deactivates the iframe's selection, so swatch clicks read `pendingRange` rather than a live `getSelection()`.

**Choosing a mark closes the bar**, in both modes and on both platforms: a toolbar left sitting over the passage would cover the change it just made, and the mark drawn on the text is the confirmation. The bar's keyboard behavior (who gets which key, where focus goes when it closes) is [Accessibility § The annotation bar is a third shape](accessibility.md#the-annotation-bar-is-a-third-shape).

**Mobile**: `showNew` / `showEdit` return early on `Platform.isMobile` and delegate to `openHighlightDrawer` instead. The outer-document picker is desktop-only. The drawer normally sits at the **top** of the reader (in the overlay container), which is fine in normal mode because the toolbar occupies that band — but in **focus mode** (no toolbar, host filling from the top) it would cover the very text a top-line selection is on. So `FocusMode` re-parents the drawer row into its overlay on entry and CSS bottom-anchors it as a floating pill **over the progress chip**, clear of the text — see [Toolbar & Content Panel § Focus mode](toolbar-and-panels.md#focus-mode). (Focus mode also has to counteract an Android WebView viewport-pan that a text selection triggers inside its `position: fixed` host; that compensation lives in `ReaderDom` and is documented in the same section.)

### Selection lock in paginated mode

`installSelectionLock()` — part of the **`ReaderDom`** collaborator (`src/reader/ReaderDom.ts`) — patches the `foliate-paginator` custom-element prototype to prevent page turns while the user is dragging to select text. Without this, Foliate's swipe/drag detection would advance the page mid-selection.

- Called once after `view.open(book)`.
- Idempotency guard (`__orbisSelectionLockInstalled`) prevents double-patching across book reloads.
- `next()` and `prev()` check `doc.getSelection()?.type === 'Range'`; if true they return `Promise.resolve()` immediately.

### Creating a highlight

1. User selects text in the book iframe. A color-picker toolbar appears below the Orbis toolbar (outer document, centered on the content pane).
2. User picks a color. The swatch click handler reads `pendingRange` and calls `addHighlight(sectionIndex, pendingRange, text, color)`:
   - Constructs the CFI range: `cfiJoinIndir(sectionBaseCFI, cfiFromRange(selRange))`.
   - If the same CFI range already exists in `this.highlights`, updates its color instead.
   - Appends the new `Highlight` object to `this.highlights`.
   - Calls `saveHighlights` (async, non-blocking).
   - Calls `foliateView.addAnnotation({ value: cfiRange, color })` — triggers immediate rendering.

### Changing a highlight color

`changeHighlightColor(cfiRange, newColor)`:
1. Calls `foliateView.deleteAnnotation({ value: cfiRange })` to remove the old overlay.
2. Updates `this.highlights` (immutable replace).
3. Saves.
4. Calls `foliateView.addAnnotation` with the new color.

### Deleting a highlight

`removeHighlight(cfiRange)`:
1. Filters `this.highlights`.
2. Saves.
3. Calls `foliateView.deleteAnnotation`.

### Creating / editing a note

`saveNote({ cfiRange, text, selectedText?, color?, existingNote? })`:
- If `existingNote` is provided: updates it in place; if the annotation color changed, deletes and re-adds the annotation.
- If new: creates a `Note` object with `id: crypto.randomUUID()`.
- Saves `this.notes`.
- Calls `foliateView.addAnnotation({ value: cfiRange, color: color ?? 'transparent' })`.
- Refreshes the saved panel and adjacent sections.

### Deleting a note

`deleteNote(id)`:
1. Calls `foliateView.deleteAnnotation({ value: note.cfiRange })`.
2. Removes the note's CFI from `this.noteRanges` (clears its margin icon).
3. Filters `this.notes`.
4. Saves.

---

## Note margin icons

Notes that don't have colored highlights still need visible indicators in the reader. These appear as small icons beside the note's first line: in a narrow strip to the right of the reading area, or, on a two-column page, in the page's own gutter (`placeNoteIcon`). `NoteIcons` (`src/reader/NoteIcons.ts`) owns them; the notes themselves stay the controller's.

`NoteIcons.refresh()` runs on a debounced schedule whenever `draw-annotation` fires for a note CFI:
1. Clears all existing `.orbis-note-icon` elements from the strip and the page layer.
2. For each note with a stored `Range`, calls `getClientRects()` to get the current viewport position of the annotation's DOM Range. Since the iframe fills the host exactly, iframe Y === host-relative Y.
3. Creates a small icon element centered on the range's first line, selecting which opens the note.

Icon visibility is toggled globally by `orbis-toggle-note-icons` (command) and persisted in `localStorage('orbis-notes-visible')`.

---

## Bookmarks

Bookmarks are owned by the **`BookmarkController`** collaborator (`src/reader/BookmarkController.ts`); the view's `toggleBookmark()` command just delegates to `bookmarkCtl.toggle()`.

### Creating / removing

`toggle()` checks `current()`:
- **No bookmark**: `add()` creates a `Bookmark` with `cfi` from the current relocate data and `exactCfi` from `ctx.lastCfi`, saves, updates the toolbar button.
- **Existing bookmark**: calls `remove(id)`, saves, updates button.

`current()` delegates to the pure `findCurrentBookmark(...)` helper in `src/reader/bookmark-utils.ts` (unit-tested), which matches by: (1) `b.exactCfi === lastCfi`, (2) `b.cfi === lastLocationCfi`, (3) `b.loc === lastLocation.current` for old bookmarks without `exactCfi`.

### Calibration

When the user navigates to a bookmark via the saved panel, `BookmarkController.setPendingNav(id)` records it. On the next `relocate` event, `calibrateOnRelocate()` → `calibrate()` sets `bm.exactCfi` to the page foliate landed on, then saves. It leaves `bm.loc` alone: that is where the bookmark's anchor begins, which no layout moves, while the landed page's number follows the font size.

### Where a stored `loc` counts from

A passage selection and an annotation note store the location where they begin; a bookmark, where its anchor
begins — the lines at the top of the page, or the sentence being read (`bookmarkLocCfi`). All three come from the
location index (`getLocForCfi`), by the one numbering the indicator and Go to use — see
[Location terminology](location-terminology.md#one-numbering). So scrolled flow needs no exception: the number is
read off the text, not off whichever page the reader is on.

Before the index is up a passage stores no location, and a bookmark the indicator's number when it is fresh
(`lastLocationCfi === lastCfi`). When the index comes up, `restampLocs` corrects every stored one.

---

## Saved panel

The "Saved" tab in the content panel lists all three annotation types in configurable order. It is rendered by the **`ReaderPanels`** collaborator (`renderSavedPanel`; `src/reader/ReaderPanels.ts`), which holds direct refs to `BookmarkController`/`AnnotationController`. Each item shows location, chapter label, and text. Clicking a highlight or note navigates to its CFI; clicking a bookmark navigates using `exactCfi` if present, otherwise `cfi`.

---

## Notes files (export)

`buildNotesMarkdown` / `generatePerChapterNotes` produce Obsidian Markdown files from in-memory annotations. These are separate from the annotation storage — they are point-in-time exports, not live views. The build logic lives in `src/reader/export-format.ts` + the `NotesExporter` collaborator; see [`notes-export.md`](notes-export.md) for the export format.
