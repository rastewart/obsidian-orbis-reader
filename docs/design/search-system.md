# Search System

← [Design Docs](README.md)

## Overview

Full-text search scans every section of the open book and presents results with excerpt context. It is the **`SearchController`** collaborator (`src/reader/SearchController.ts`); `OrbisReaderView` keeps only a thin `openSearchBar` host delegate. The pure `sectionIndexFromCfi` helper lives in `src/reader/search-utils.ts` (unit-tested).

Two UI surfaces share the same search state: the **Search tab** in the content panel (for entering queries and browsing results) and a **standalone search bar** that appears when the panel is closed and a search is active (for quick navigation and re-querying without reopening the panel).

---

## Data model

```typescript
interface SearchHit {
  cfi:          string;  // CFI of the matched text node range
  excerpt:      string;  // ~50 chars before + match + ~50 chars after
  chapterTitle: string;  // from chapterForSection(sIdx)
}
```

Key state fields (private to `SearchController`):

| Field | Type | Description |
|---|---|---|
| `results` | `SearchHit[]` | Full result list from the last completed search |
| `activeIndex` | `number` | Index of the currently navigated result |
| `query` | `string` | Current input value (live, not yet searched) |
| `lastQuery` | `string` | Query that produced `results` |
| `loading` | `boolean` | True while `run()` is in progress |
| `activeCfi` | `string \| null` | CFI of the active result's annotation overlay |
| `secondaryAnnotations` | `string[]` | CFIs of same-section secondary highlight overlays |

---

## Search algorithm (`run`)

1. Clears previous annotations and resets `results`.
2. Sets `loading = true` and updates the UI.
3. Iterates over `bookSections` using a `for` loop (sequential, not parallel — keeps memory usage bounded).
4. For each section with a `createDocument()` method:
   a. Calls `section.createDocument()` to get the HTML DOM.
   b. Walks all text nodes via `TreeWalker(body, SHOW_TEXT)`.
   c. For each text node, searches `textLower.indexOf(queryLower, pos)` in a loop — case-insensitive, substring match.
   d. For each match: constructs a DOM `Range`, converts it to a CFI via `cfiJoinIndir(baseCFI, cfiFromRange(range))`, builds an excerpt (50 chars of context either side), pushes a `SearchHit`.
   e. Calls `section.unload?.()` to free memory.
5. After all sections: sets `loading = false`, stores results, calls `renderResults()`.
6. If results exist, navigates to the first hit (`goTo(0)`). The panel remains open showing the results list.

**Complexity:** O(total characters in book) per search. For long books this is noticeable; the progress indicator shows `…` while loading.

---

## Highlight colors

| Color | Hex | Usage |
|---|---|---|
| Amber | `#FF9500` | `SEARCH_HIT_COLOR` — the currently active result |
| Cyan | `#5BC4D4` | `SEARCH_OTHER_COLOR` — other results visible in the same section |

When `goTo(idx)` is called:
1. Removes all existing search annotations.
2. Finds all hits whose CFI maps to the same section index as `hit.cfi`.
3. Adds cyan annotations for those same-section hits.
4. Adds an amber annotation for `hit.cfi`.
5. **If same section as current**: mobile focusin suppression is handled by the shared **`NavSuppressor`** collaborator (`ctx.navSuppressor`) — calls `ctx.navSuppressor.suppressThenClearSoon()` and records `pendingNavCfi = hit.cfi`. Navigation happens via the `draw-annotation` event — when it fires for the amber annotation, the handler reads the range's `getClientRects()`, computes the target page, and calls `renderer.scrollToAnchor(range, false)` if the current page differs. The suppressor blocks the `focusin→#scrollToAnchor` rAF that otherwise undoes the navigation. This is skipped if the annotation is already on the current page.
6. **If different section**: calls `ctx.navSuppressor.beginTargetNav(hit.cfi)`, then navigates via `foliateView.goTo(hit.cfi)`. The suppressor blocks Foliate's `focusin→#scrollToAnchor` rAF for the navigation window, then checks whether the annotation's start lies past the current page end and advances one page if so (undershoot correction).

Results in other sections are not annotated until navigated to.

---

## Dual UI surfaces

### Search tab (content panel)

- `searchInputEl` — text input in the panel tab.
- `searchGoBtn` — triggers `handleEnter()`.
- `searchResultsEl` — scrollable results list, built by `renderResults()`.
- Results are grouped by `chapterTitle`. Each result shows the excerpt with the match text highlighted.
- Clicking a result calls `goTo(idx)`, then closes the panel and opens the standalone bar.

### Standalone search bar (`div.orbis-search-bar`)

- Positioned between the toolbar and the reader host element.
- Visibility is managed **explicitly** — not derived automatically from state:
  - **Shown** when `closePanel()` is called while `lastQuery` is non-empty (covers clicking the backdrop, the × button, or selecting a result).
  - **Hidden** when `openPanel()` is called — the panel provides its own search input.
  - **Closed explicitly** via the × button or Escape key (`closeBar()`).
- Contains: `searchBarInputEl`, `searchBarGoBtn`, `searchPrevBtn`, result count (`searchCountEl`), `searchNextBtn`, close (×) button.
- Count format: `N / total` while results exist; `0` if search returned nothing; `…` while loading.
- Clearing the input text does **not** clear the search or hide the bar — the user can type a new query and press Go/Enter to replace the results.

### State synchronization

`query` is the single source of truth. Both inputs write to it. `updateUI()` pushes `query` back to `searchBarInputEl` when it doesn't have focus, keeping them in sync. The bar's `input` event handler also syncs `searchInputEl` so the panel reflects bar text if reopened.

Pressing **Enter** in either input calls `handleEnter()`:
- If `query === lastQuery` and results exist → `next()` (advance).
- Otherwise → `run()` (fresh search, replaces results and annotations).

---

## Result grouping

`renderResults()` groups hits by `chapterTitle` before rendering:

```
Chapter One (3)
  "…the fox jumped over the…"
  "…over the lazy dog and…"
  "…dog, which was not…"
Chapter Three (1)
  "…a fox is sly by nature…"
```

Grouping preserves the order hits were found (reading order). If a section has no `chapterTitle`, it falls into an unlabelled group.

---

## Clearing search

`clear()` resets all search state:
1. Calls `clearAnnotations()` — removes the active amber annotation and all cyan secondary annotations from the current view.
2. Resets `results`, `activeIndex`, `lastQuery`.
3. Clears the results list in the panel.

Note: clearing the text from the standalone bar input does **not** call `clear()`. The bar stays open with any existing results still navigable. `clear()` is called only when closing the bar explicitly (× / Escape) or when a fresh search replaces the previous one.

Annotations are also re-applied from scratch when the reader navigates to a new section (the `create-overlay` event redraws all active annotations, including active search highlights).

## Scopes: one is expensive, three are free

Book-text search walks every spine document asynchronously — results stream in, which is the whole reason there is
a loading state. Highlights, note anchors and note text are **already in memory**, reachable from the controller
through `ctx.notesData()`, so searching them is a synchronous array filter with no new plumbing and no wait.

That asymmetry is why the scopes are worth having as separate switches rather than one "search everything" toggle:
turning the book text off makes the search instant, and a reader looking for something they wrote knows that.

## Filter by mark

Marks carry meaning; colors do not. Two marks can share a color and mean different things, which is the point of
a mark having a name — so the filter never asks "everything yellow". `markFilter` holds mark **ids** and matches on
identity.

**`No mark` is a filter entry, not an omission.** A note can be saved without a mark, so leaving it out would make
unmarked content unreachable through this filter. It sits first in the list.

**Only marks in use are offered, with counts.** A mark nothing carries can only ever return zero results, and the
count answers "which of these is worth filtering by" — the same reasoning the preset remap dialog's counts follow.
Two awkward cases fall out for free: a *hidden* mark that annotations still use stays filterable, and a mark the
preset no longer has never appears.

### Two stages, not two dialogs

Advanced search is a `createOrbisPopup`. Picking marks **replaces the dialog body** and Done swaps it back, rather
than opening a second dialog: a guard elsewhere refuses a popup over a popup. The stage also gives the mark list the
full dialog height it needs for names *and* counts, and it follows the change-preset flow in
`AnnotationPresetsModal`, which repaints a stage the same way.

Drafts live outside both renders, so a trip through the picker cannot lose the scope selection and **Cancel
discards everything** — Done commits to the draft, OK commits the draft.

### Layout

- **Scope labels break one word per line.** Every label is two words, and `white-space: nowrap` would turn overflow
  into an ellipsis ("Passage selec…" on a phone). Splitting on whitespace makes the break deterministic rather than
  a function of screen width, and all four buttons are the same shape. The grid stays two columns; a single column
  would cost four full rows.
- **Icon pinned left, label centered in the remainder.** Centering icon and label as one group puts each icon at a
  different offset, and the column reads as ragged.
- **`height: auto !important` on `.is-mobile`.** Obsidian's mobile button styling pins a height, so without it
  `padding-block` cannot grow the box — it only shrinks the content area, squeezing two lines against the borders.
  If one property is ignored while others on the same selector work, the selector is fine and the box cannot grow.

### Saved panel

Rows render the mark as itself (`applyMarkPreview`) rather than a color dot, which can show only one of a mark's two
channels — a black-underline-no-wash mark would be a dot of nothing. The name is in the tooltip; rows are too tight
for it. Unmarked items show a no-color swatch so every row's text starts in the same place.
`AnnotationController.markFor()` is the one resolution point, so `bookPreset` stays private.
