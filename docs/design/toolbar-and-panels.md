# Toolbar & Content Panel

← [Design Docs](README.md)

## Toolbar

The toolbar is a `div.orbis-toolbar` rendered at the top of `OrbisReaderView.contentEl`, laid out as a 3-column CSS grid (`grid-template-columns: 1fr auto 1fr`) so the progress label stays centered no matter how many buttons are visible on either side:

- **`div.orbis-toolbar-left`** (column 1, `1fr`) — content actions, left-aligned (default `justify-content`).
- **`span.orbis-loc-label`** (column 2, `auto`) — the progress indicator; a direct child of the toolbar (not inside either group div) so it lands in the centered column.
- **`div.orbis-toolbar-right`** (column 3, `1fr`) — view/presentation toggles, right-aligned (`justify-content: flex-end`).

Because both side columns are equal `1fr` tracks, the centering holds even if a user disables some buttons on one side via settings — it doesn't depend on both groups having the same number of visible buttons.

| Order | Element | Setting flag | Default | Notes |
|---|---|---|---|---|
| 1 | ☰ Contents button | `showTocButton` | true | Toggles the content panel (opens to last active tab) |
| 2 | Search button | `showSearchButton` | true | Toggles the standalone search bar |
| 3 | Bookmark button | `showBookmarkButton` | true | Toggles bookmark on current page; shows filled/outline state |
| — | *(centered)* Progress label | `showProgressIndicator` | true | Displays current progress mode; click cycles to the next enabled mode, plus an always-present 7th "blank" stop. See [Reading Progress & Sync](reading-progress-system.md). |
| 4 | Note icons button | `showNoteIconsButton` | true | Shows/hides margin note icons; state in `localStorage('orbis-notes-visible')` |
| 5 | Display style button | `showDisplayStyleButton` | true | Opens the Display Style menu — see below |
| 6 | Focus button | `showFocusButton` | true | Toggles focus mode (hides Obsidian UI chrome); kept rightmost intentionally, for easy reach |
| 7 | DBG button | `showDebugButton` | false | Toggles the debug log panel |

Buttons are grouped by kind: content actions (Contents, Search, Bookmark) on the left; view/presentation toggles (Notes, Display Style, Focus, Debug) on the right.

All flags live in `OrbisPluginSettings` (synced via `data.json`) and are applied by `applyToolbarVisibility()`, which toggles direct element references (`this.tocBtn`, `this.focusBtn`, etc.) — unaffected by which grid group a given button's element lives in.

### Display Style menu

The palette-icon button (`displayStyleBtn`) opens a two-level popup menu built by `buildDisplayMenu()` in `display-menu.ts`. The menu wrapper (`div.orbis-display-menu-wrapper`) is appended directly to the toolbar as an absolutely-positioned element (`position:absolute; top:100%; left:0; width:100%`), so it isn't part of the 3-column grid layout.

- **Level 2** (`div.orbis-level2-toolbar`, `role="tablist"`, arrow-key navigable) — four tabs, ordered general → specific: Theme, Layout, Spacing, Font.
- **Level 3** (`div.orbis-level3-container` → one `div.orbis-level3-drawer` per tab, `role="tabpanel"`) — the actual controls:

| Tab | Controls |
|---|---|
| Theme | Theme dropdown (the themes offered — see [Reader themes](reader-themes.md)); brightness slider (20–100%) |
| Layout | Reading mode dropdown (paginated / scrolled); "Enable two columns" checkbox (disabled when scrolled) |
| Spacing | Margins slider (0–12%); line spacing slider (1.0–3.0×); Alignment dropdown (Follow the book / Left / Justified) |
| Font | Font family dropdown; font size slider (80–300%) |

This edits the same `DisplaySettings` documented in [Display Styles System](display-styles.md) — the menu is simply the live-editing UI for the currently active style. Every control writes via `saveSetting()` and calls `reinjectAllDocs()` and/or `applyHostBg()` immediately, so open reader panes update live.

**Sync with the plugin Settings tab**: the same settings are also editable from **Settings → Orbis Reader → Reading**. Both UIs write through the same `orbis:settings-change` workspace event (see [Display Styles System § Change propagation](display-styles.md#change-propagation)), and both listen for it too, so they stay live-synced with each other even while both are open simultaneously — a change made in the toolbar menu updates the Settings tab's controls immediately, and vice versa. On the toolbar side this is `syncDisplayMenu()` (`display-menu.ts`), called both on menu open and on every incoming `orbis:settings-change` event. On the Settings tab side this is `OrbisSettings.syncReadingTabControl`, a listener registered once in the constructor (not per-render) that updates the relevant control in place via `setValue()`/direct `.value` assignment — never by re-dispatching or re-rendering the tab, which would interrupt an in-progress drag on either side.

**Alignment**: both levels use `justify-content: flex-end` on desktop, so the menu opens hugging the right edge, near the Display Style button's position in the right-hand group. Under `.is-mobile`, both revert to `justify-content: flex-start` — on mobile the toolbar (and this menu) already spans the full width, so right-justifying doesn't visually tie to the trigger the way it does on desktop, and just looks unbalanced once Level 3 wraps its controls onto multiple rows on a narrow screen.

### Special behavior

**Bookmark button state**: `BookmarkController.updateBtn()` sets the `is-active` class and updates the SVG/title when the current location has a bookmark. Called from the `relocate` event handler and after bookmark create/remove.

**Progress label**: `formatLocLabel()` (in `src/reader/stats-math.ts`, driven by the `ReadingStats` collaborator) computes the display string based on `locMode` (index into `LOC_MODE_MAP`, which has a 7th `'blank'` entry appended after the six real modes). See [Reading Progress & Sync](reading-progress-system.md) for the full mode list, cycle order, and the blank state.

### Commands for toolbar actions

Most toolbar buttons have corresponding keyboard commands registered in `main.ts`. These use `checkCallback` so they only activate when an `OrbisReaderView` is focused. Several display-related commands have no toolbar button of their own — their controls are in the Display Style menu — and the commands and their keyboard shortcuts work independently of the menu:

| Command ID | Toolbar equivalent |
|---|---|
| `orbis-toggle-scrolled-mode` | (no button; keyboard only) |
| `orbis-toggle-column-layout` | Display Style menu → Layout tab (two-column checkbox) |
| `orbis-increase-font-size` / `orbis-decrease-font-size` | Display Style menu → Font tab (size slider) |
| `orbis-increase-brightness` / `orbis-decrease-brightness` | Display Style menu → Theme tab (brightness slider) |
| `orbis-cycle-text-alignment` | Display Style menu → Spacing tab (Alignment dropdown) |
| `orbis-increase-line-spacing` / `orbis-decrease-line-spacing` | Display Style menu → Spacing tab (line spacing slider) |
| `orbis-increase-text-margins` / `orbis-decrease-text-margins` | Display Style menu → Spacing tab (margins slider) |
| `orbis-toggle-focus-mode` | Focus button |
| `orbis-toggle-bookmark-on-current-location` | Bookmark button |
| `orbis-toggle-note-icons` | Note icons button |
| `orbis-cycle-reading-progress-display` | Click on progress label |
| `orbis-toggle-debug-log` | DBG button |

### Standalone search bar

Between the toolbar and the reader host sits a separate `div.orbis-search-bar` (hidden by default). The bar, like all search state, is owned by the `SearchController` collaborator (`src/reader/SearchController.ts`); the view keeps only a thin `openSearchBar` delegate. It is shown automatically whenever the content panel closes while a search is active (`lastQuery` non-empty), and hidden whenever the panel opens. This means:

- Run a search in the panel → results appear in the panel list.
- Click a result or click/tap the backdrop to dismiss the panel → bar appears with the search text, allowing further navigation with ‹ › or a new query.
- Open the panel again → bar hides (panel has its own input).
- Press Escape or × in the bar → `closeBar()` clears state and hides the bar.

The bar contains `<input>`, Go, ‹ Prev, result count, › Next, and ×. Its input stays in sync with the panel's search input via the shared `query` field. Clearing the bar's text does not hide the bar or clear the results — the user can type a new query and press Go/Enter to replace them. See [Search System](search-system.md) for full details.

**Focus mode**: like the highlight drawer, the bar lives in `.orbis-overlay-container`, which deliberately floats over the host *without* taking up layout space, so opening it doesn't trigger repagination. That tradeoff is fine for the highlight drawer (small, appears briefly right at a text selection) but not for the search bar in focus mode: it's full-width and can stay open indefinitely while the reader works through results, so as a pure overlay it would permanently hide a line or two of text behind it.

Space for it is reserved by `setReaderTopSpace()` (`src/reader/top-space.ts`), which writes `padding-top` on Foliate's renderer element. The search bar, the Go To bar and the listening bar are all `SecondaryBar`s; one opened with `reserveFocusSpace` reserves space on `open()` when `ctx.focusMode` is true, releases it on `close()`, and re-checks on `onFocusModeToggled()` — which `FocusMode.enter()`/`exit()` trigger through `onFocusModeChanged`, so a bar already open when focus mode starts or ends gets its reservation set or cleared. A non-reserving bar (Go To) always clears, so it never inherits a stale reservation.

**Why the renderer's `padding-top`, and not `hostEl`'s own position.** `.orbis-overlay-container` is `position: absolute` *relative to `filterWrapperEl`*, not the viewport — and so is the box Foliate paginates text into. Moving `hostEl` shifts the bar and the text together, so it can never separate them; what's needed is to shrink the box Foliate paginates *into*. Foliate's own `margin` attribute would reserve space above *and below* the content row, and the bottom is already excluded from Foliate's layout by `hostEl`'s own `bottom` (the progress chip's strip), so a second bottom reservation would shrink every page for nothing. `padding-top` is one-sided: `paginator.js`'s shadow DOM sets `:host { box-sizing: border-box; width: 100%; height: 100% }`, so external padding shrinks its own content box (where pagination happens) without touching the bottom or changing its outer footprint.

**How much.** The bar's measured height plus a 12px gap, minus the page margin Foliate already leaves (`FOCUS_PAGE_MARGIN`) — only what the page is not already leaving, since the padding shrinks the box Foliate lays out in and its own top margin row starts *below* the reservation, so an unclamped reservation is paid twice. A bar with no height yet (its first frame) reserves a 96px fallback: reserving too much is a gap, reserving nothing puts the bar on the line you are reading.

**Focus mode sets Foliate's `margin` smaller, not larger.** Foliate's default leaves 48px above *and* below the text, and in focus mode both are waste: the bars reserve their own room through the `padding-top` above, and with none open nothing overlays the top at all. `FocusMode` writes `28px` (`FOCUS_PAGE_MARGIN`) on entry and removes the attribute on exit, so normal mode keeps the default — where it is load-bearing, since the bars float over the host rather than above it and that 48px is the only thing keeping an open search bar off the first line. The floor is the progress chip, not taste: see `FOCUS_PAGE_MARGIN`.

`.orbis-focus-mode .orbis-overlay-container` is `top: 0`: the host itself starts below `--orbis-focus-top-strip`, the band the exit button row floats in, so a bar at the host's own top edge already lands below that row. A second offset for the same row would push every bar down twice.

**Some additional gap above and below the text, beyond the reserved amount, is expected.** Foliate's pagination grid (`grid-template-rows: minmax(var(--_margin), 1fr) minmax(0, var(--_max-height)) minmax(var(--_margin), 1fr)` in `paginator.js`) vertically centers each page's content: the top/bottom margin rows are `1fr` (flexible), so they absorb whatever height is left over once a page's worth of text is laid out into the (non-flexible) content row, splitting it evenly between top and bottom. This happens on *every* page — focus mode or not, search bar or not — and `padding-top` only changes how much total height is available to the grid, not how the grid distributes leftover space. Eliminating it would mean another `// ORBIS patch` in the vendored `paginator.js` making the content row `1fr` and the margin rows fixed, which would remove vertical centering globally, not just in focus mode.

The bar's colors change only in focus mode: outside it, the plain Obsidian styling (`--background-primary`/`--text-normal`) is intentional — it reads as an extension of the main toolbar, the same treatment the Display Style menu gets. Inside focus mode, `.orbis-focus-mode .orbis-search-bar` (and its input/Go/control-button children, including `:hover`/`:focus` states) switch to `--orbis-host-bg`/`--orbis-host-fg`, matching the theme-matched back/forward/exit buttons it sits beside instead of standing out as a plain black bar. The input's hover/focus states need `!important`, as the buttons do, because Obsidian's generic input hover/focus styling otherwise wins on those states. The bar's own `‹ › ×` and Go buttons (`.orbis-ctrl-btn`, `.orbis-search-go`) also get the same bordered/boxed treatment (`border` + `background`) as the back/forward/exit buttons in focus mode — without it they read as flat icons/an accent-colored button next to clearly-boxed, theme-matched buttons. `.orbis-focus-mode .orbis-search-bar` also gets `padding-right: calc(env(safe-area-inset-right, 0px) + 14px)` so its own × aligns with the exit button's ×, which uses the same offset formula; with the bar's default 8px padding (and `hostEl` spanning edge-to-edge with no safe-area awareness on its own right side) the two ×'s land a few px apart.

The highlight drawer (`.orbis-highlight-drawer-row`, opened by `openHighlightDrawer()` when selecting text) gets the same color treatment in focus mode — `.orbis-focus-mode .orbis-highlight-drawer-row` switches to `--orbis-host-bg`, its `.orbis-note-btn` icons (note/copy-link/delete — plain, borderless icon buttons; `fill`/`stroke="currentColor"` SVGs, so setting the button's own `color` recolors them) switch to `--orbis-host-fg`, and its close button (`.orbis-ctrl-btn.orbis-sb-close`, the same classes the search bar's close button uses) gets the same bordered/boxed treatment as the search bar's `.orbis-ctrl-btn`s. `.orbis-note-btn` also needs `background: transparent !important` — `setupHighlightUI()` injects a runtime `<style id="orbis-hl-styles">` (for `#orbis-picker`, the separate desktop hover-selection popup, which shares some class names like `.orbis-note-btn`/`.orbis-swatch` with the mobile drawer since both are annotation UIs) that already sets `background: none` on `.orbis-note-btn`, but without `!important` that loses to Obsidian's own default `<button>` background. Unlike the search bar, the drawer's layout doesn't change: it deliberately stays a pure overlay with no reserved space (see the comment on `.orbis-overlay-container`) — it's small and appears briefly right at a text selection, so a moment of overlap is low cost, unlike the search bar which can stay open indefinitely. The color swatch buttons inside it (`.orbis-swatch-group`) are untouched — they're built with `setAttribute('style', ...)` carrying each highlight color directly, not a class, so this rule doesn't reach them, which is also correct: they need to show the actual highlight colors, not the book theme. The note-add/note-edit popup (`openNoteEditor()`, a separate Obsidian-native popup outside the epub iframe) is also untouched — it isn't part of the reading surface the way the search bar and highlight drawer are, so it is not themed.

### Floating back/forward buttons

`div.orbis-history-nav` is positioned `absolute; top:8px; right:8px` inside the reader host element (on top of the book content) in normal mode, and holds two buttons: `button.orbis-back` (`←`) and `button.orbis-forward` (`→`). Foliate's `history` object (`node_modules/foliate-js/view.js`) is a standard push/truncate stack — `goTo()` (used by TOC clicks, footnotes, search-result jumps, "go to location") always calls `history.pushState()`, which truncates any forward entries beyond the current index, exactly like browser back/forward. Ordinary page-turning (`next()`/`prev()`) never touches this stack, so it's specifically an in-book-link/jump history, not a page-position history.

**Focus mode re-parenting**: `historyNavEl`'s normal home, `filterWrapperEl`, has `overflow: hidden` and can carry an active CSS `filter` (brightness). A `position: fixed` descendant of a filtered+clipped ancestor gets its containing block hijacked by that ancestor instead of the true viewport — a well-known CSS pitfall, which would put the pair at the wrong position whenever the host's own offset changes. `FocusMode.enter()` moves `historyNavEl` into `.orbis-focus-topbar` inside the focus overlay — the same safe, unfiltered container the exit button lives in, appended to `contentEl` rather than nested inside the host — where it flows as a flex-row item beside the exit button. `FocusMode.exit()` moves it back into `filterWrapperEl` before removing the overlay. `.orbis-focus-topbar > *` re-enables pointer events, since `.orbis-focus-overlay` itself is `pointer-events: none`.

One side effect of the re-parenting: `.orbis-bar-open .orbis-history-nav { display: none; }` (the rule that hides the pair while a secondary bar is open in normal mode) requires `.orbis-history-nav` to be a *descendant* of the `.orbis-host.orbis-bar-open` element it's scoped under. Once `historyNavEl` lives in the focus overlay — a sibling of `.orbis-host`, not a descendant — that selector stops matching for as long as focus mode is active, which is the desired outcome: there the pair is an item in the topbar's row, not a float over the text, so a bar cannot overlap it.

The pair (`historyNavEl`) is shown/hidden as a whole via `display` — visible once either direction has history, fully collapsed when neither does. Within the pair, each button keeps a **fixed slot**: `orbis-back` is always the left/first child, `orbis-forward` always the right/second child, and whichever direction isn't currently usable is hidden via `visibility: hidden` (`tabIndex = -1` alongside it) rather than `display: none`. `visibility: hidden` still reserves the element's layout box, so the other button's on-screen position never shifts depending on whether its sibling is showing — with `display: none`, `back` disappearing at the start of history would slide `forward` into `back`'s screen position, and a reflexive repeat-click aimed at `back` would land on `forward` instead. Both slots are re-evaluated on the history's `index-change` event. Clicking calls `view.history.back()` / `view.history.forward()` respectively.

The buttons' background is `var(--orbis-host-bg, var(--background-secondary))` and their arrow color is `var(--orbis-host-fg, var(--text-normal))` — the current book theme's background and text color (not generic Obsidian UI colors) — so they blend into the page instead of standing out as an obvious overlay, and stay legible against it (e.g. sepia's dark-brown text, rather than a pale Obsidian UI gray that washes out against sepia's light background). Both `--orbis-host-bg` and `--orbis-host-fg` are set by `applyHostBg()`, from `themeColors()` (`reader-themes.ts`), on `contentEl` (a shared ancestor of the reader host and the focus-mode overlay, so these buttons and the focus-exit button below can all read the same values via CSS inheritance).

**Bar interaction**: `.orbis-bar-open` is set on the host while any secondary bar (search, Go To, listening) is open — derived from `SecondaryBarRegistry.anyOpen()` — and `.orbis-bar-open .orbis-history-nav { display: none; }` hides the pair then, since in normal mode the bar would otherwise sit on top of them. In focus mode this rule doesn't match — see the re-parenting note above — so the pair stays visible, with no separate override rule needed.

**Clearing history**: the `orbis-clear-navigation-history` command (`clearNavigationHistory()`) calls `foliateView.history.clear()` to empty foliate's in-session history stack, for users who'd rather not see either button at all after following a link. `clear()` doesn't dispatch its own event, so the method manually dispatches `index-change` on the same `history` object afterward — the existing listener that drives both buttons' visibility is wired to that event, so they disappear immediately rather than waiting for the next real navigation.

---

## Content Panel

The content panel (`div.orbis-toc-panel`) slides in from the left side of the reader. It is opened by the ☰ button, the `openPanel(tab)` method, or keyboard commands. Closed by the × button, clicking the backdrop, or `closePanel()`.

### Tab bar

Five icon tabs, always all five.

| Tab ID | Icon | Title |
|---|---|---|
| `contents` | ☰ | Table of contents |
| `search` | 🔍 | Search |
| `saved` | 🔖 | Saved — Bookmarks, Highlights & Notes |
| `backlinks` | ↩ | Backlinks |
| `stats` | 📊 | Reading stats |

**Tabs are not individually hidable.** Four commands open the panel on a named tab, so a hidden tab's pane could be
shown with no button in the strip to say where you were — and `open()` focuses that button, so the keyboard would land
on something not displayed. A hiding setting would also need a rule that one tab stay visible and a disabled row to
express it.

Hiding a *toolbar* button earns its keep: the top bar is one narrow row on a phone, so a button you do not use costs
you one you do. Five small icons inside a panel the reader deliberately opened compete with nothing, and an unused tab
costs nothing until it is clicked.

Clicking a tab calls `activatePanelTab(id)`, which shows its pane and hides others, then triggers any lazy-load for that tab (e.g. backlinks scan, stats render).

### Contents tab

Renders the flat/hierarchical TOC from `book.toc`. Each entry is a `button.orbis-toc-item`. Sub-items are indented by depth (`paddingLeft = 12 + depth × 16 px`). Clicking navigates to `item.href` via `foliateView.goTo()` and closes the panel.

### Search tab

Contains an input + Go button at top, scrollable results list below. Shares `searchQuery` state with the standalone search bar. `handleSearchEnter()` runs the search across all sections (sequential, section by section) and populates the results list grouped by chapter. Each result shows a text excerpt (~50 chars of context either side of the match). Clicking a result navigates to its CFI, closes the panel, and opens the standalone search bar so the user can continue navigating without the panel in the way. See [Search System](search-system.md) for the full algorithm.

### Saved tab

The content panel and all its tabs are owned by the `ReaderPanels` collaborator (`src/reader/ReaderPanels.ts`). `renderSavedPanel()` builds a list of three collapsible sections (Bookmarks, Highlights, Notes) in `config.sectionOrder` order. Each section header shows a count badge; clicking collapses/expands. Items show location, chapter label, and text excerpt. Clicking an item navigates to its CFI (or `exactCfi` for bookmarks). The × button on each item deletes the annotation inline.

`refreshSavedPanelIfOpen()` (reached via `AnnotationHost`/`BookmarkController`) is called after any annotation change so the list stays current without requiring the user to close and reopen the panel.

### Backlinks tab

#### What counts as a backlink

Two link types are recognized:

| Type | Example in a note | Detection method |
|---|---|---|
| **File link** | `[[Five-Little-Peppers.epub]]` or `[text](path/to/book.epub)` | `metadataCache.resolvedLinks` — Obsidian's own link index; instant, no file reads |
| **Deep link** | `[text](obsidian://orbis-nav?file=path%2Fto%2Fbook.epub&cfi=…)` | Content scan for `file=<encodeURIComponent(bookPath)>` in each markdown file |

A note using both link types appears only once (deduplicated by path).

#### Scanning algorithm (`scanBacklinks` in `progress.ts`)

`scanBacklinks(bookPath, app)` is a shared utility used by both the reader panel and the Orbis Data View. It is always run fresh — results are never persisted to the `.orbis` file, so they are never stale.

1. **File links**: iterates `metadataCache.resolvedLinks` to find markdown files whose link targets include `bookPath`. This is index-based and completes in microseconds.
2. **Deep links**: scans all markdown files in batches of 200 (parallel within each batch, sequential between batches to bound memory). For each file:
   - Skip if `file.stat.size < 50` (too small to contain any link).
   - Read content via `vault.cachedRead`.
   - Skip if content does not include `file=<encodeURIComponent(bookPath)>`. **No pre-filter on the book's raw file name**: a copied deep link carries the name only encoded (`Sample%20Book.epub`) and as link text without its extension, so a note holding nothing but one never contains `Sample Book.epub`, and a pre-filter on it would drop exactly those notes for any book with a space in its name.
3. Merges both result sets, deduplicates by file path, sorts alphabetically.

#### Pre-scan timer (reader panel only)

After a book loads, a `setTimeout(..., 5000)` fires to start `loadBacklinks()` (a `ReaderPanels` method) in the background. By the time the user opens the Backlinks tab, the scan is usually complete. `backlinksPreScanTimer` is cleared in `ReaderPanels.dispose()` (via the view's `onUnloadFile()`/`onunload()`) to avoid scanning a stale book.

The reader panel caches results in `backlinksCache: Map<string, …>` for the session lifetime (keyed by epub path) to avoid re-scanning on repeated tab opens. The Orbis Data View runs `scanBacklinks` (the shared `progress.ts` utility) fresh each time the file is opened — it shows "Scanning…" while it runs.

#### Rendering

`renderBacklinksPane()` shows "Scanning vault…" while `backlinksLoading` is true, "No notes link to this book yet" if the result list is empty, or a list of note-title rows each opening the note in the current leaf on click.

### Stats tab

The Stats tab is rendered by `ReadingStats` (`src/reader/ReadingStats.ts`) into the pane `ReaderPanels` provides (via `StatsHost.statsPaneEl`). It re-renders on `activatePanelTab('stats')` and on every `relocate` event while the tab is open. Sections rendered:

**Reading pace**
- Shows `effectiveWpm()` rounded to the nearest integer with the sample count in parentheses.
- While gathering data (fewer than `minSamples` — normally 8, lowered when `orbis-dbg-pace` is enabled): shows `"Gathering data… (N / 8 samples)"`.

**Time remaining** (only when `wpm` is non-null)
- `wordsRemainingInBook() / wpm` → formatted as hours/minutes.
- `wordsRemainingInChapter() / wpm` → same.

**Progress**
- Book %: `Math.round(lastFraction * 100)`.
- Location: `lastLocation.current` of `lastLocation.total` (omitted if `total` is not set).
- Chapter %: from `sectionProgress().pct`.
- Chapter location: from `sectionProgress().loc / .total` (omitted if cache not ready).

**Word counts** (only when `locWordCounts.size > 0`, i.e., the locations cache is complete)
- Book total: sum of all `locWordCounts` values.
- Book remaining: `wordsRemainingInBook()`.
- This chapter: sum of `locWordCounts` for locations in the current section's `sectionLocInfo` range.

---

## Link preview

`LinkPreview.setup(doc, sectionIndex)` (the `LinkPreview` collaborator, `src/reader/LinkPreview.ts`) is called for each rendered section. It attaches a `click` listener to the section document that intercepts `<a>` clicks before they navigate, and checks `linkPreviewEnabled` at click time (so toggling the setting off takes effect immediately).

### Flow

1. On `<a>` click: checks the href. External URLs (http/https) are passed through without a preview.
2. For internal epub links (`href` relative or same-origin): resolves the target section and optional anchor ID.
3. Calls `section.createDocument()` on the target section.
4. Calls `extractLinkPreviewText(targetDoc, anchorId)` to extract a short text snippet from near the anchor point.
5. Shows a floating popup over the reader with the extracted text.
6. The popup has a **Go** button to proceed to the link destination (`foliateView.goTo(href)`) and a dismiss button.

If `createDocument()` fails or the preview text is empty, the popup is skipped and the link navigates normally.

### Toggle

Controlled by `OrbisPluginSettings.linkPreviewEnabled` (default: `true`). Toggled via the **Toggle link preview** command or the **Link preview** setting in Settings → Reading. The toggle takes effect the next time a section is rendered (not immediately for already-open sections).

---

## Focus mode

The **`FocusMode`** collaborator (`src/reader/FocusMode.ts`) manages a reading mode that hides chrome to maximize the book content area. Public `toggle()` (routed from the `orbis-toggle-focus-mode` command via a thin view delegator) flips between private `enter()` / `exit()`. It takes a dedicated `FocusModeHost` interface for the ~10 single-consumer view internals it restyles.

**On a phone or tablet it takes the screen**: the Obsidian navbars, toolbars, tab rows and the pane's view header are hidden. **On a desktop it fills the pane** (`.orbis-focus-in-pane`): it hides the Orbis toolbar and nothing of Obsidian's — the tab rows, the sidebars and this pane's own view header stay and keep working, because on a desktop the reader is one pane among several and the window's own chrome is not the distraction focus mode removes.

### Entering focus mode

1. **Ancestor neutralization** — walks ancestors from `containerEl.parentElement` up to `body`. Any element with a property that would prevent `position: fixed` descendants from escaping to the viewport (a non-trivial `transform` or `will-change`, and on mobile `contain`) has those properties overridden via `style.setProperty(..., 'important')`. The original `cssText` of each affected element is saved for restoration.

2. **Obsidian leaf header** (mobile) — locates `.view-header` within the nearest `.workspace-leaf`, saves a reference, and hides it with `display: none !important`.

3. **App chrome** (mobile) — `hideToolbars()` queries `.mobile-navbar, .mobile-toolbar, .app-toolbar, .mobile-action-bar, .workspace-tab-header-container` and hides each with `display: none !important`. A `MutationObserver` on `body` re-calls `hideToolbars()` whenever anything tries to restore those elements. The Android navbar's height is measured before it is hidden, since `env(safe-area-inset-bottom)` reports 0 there; it becomes `--orbis-focus-bottom-inset`.

4. **Orbis toolbar** — `toolbarEl.hide()` removes it from the flex layout.

5. **Host positioning** — `.orbis-focus-mode .orbis-host` in `styles.css`, which applies once step 6 adds the class; `enter()` first removes any inline `height`, `min-height` and `max-height` left by `lockMobileHeights`, since inline would beat it:
   - `position: fixed`
   - `top: var(--orbis-focus-top-strip)` — below the device status bar *and* below the band the exit button floats in. The band is reserved so a swipe there reaches the app: Foliate registers `touchmove` on its paginator with `{passive: false}` and calls `preventDefault()` on every single-finger move, so without the band there is no surface a top-edge gesture could start from.
   - `left: 0; right: 0`
   - `bottom: calc(var(--orbis-focus-bottom-inset, env(safe-area-inset-bottom, 0px)) + 30px)` — stops 30 px above the gesture bar, reserving a strip for the progress chip. The chip sits at the bottom inset + 20px with about 30px of its own height, so its top edge is at the inset + 50; the last line of text sits at the inset + 30 + Foliate's margin, which is why `FOCUS_PAGE_MARGIN` has a floor. If this reserve ever needs to change, the constraint to watch is the chip overlapping the last line of text.
6. **contentEl class** — adds `orbis-focus-mode` which sets `position: fixed; inset: 0; z-index: 99999; background: var(--orbis-host-bg-dimmed, var(--orbis-host-bg, #000)) !important`. This fills any gap between the host edges and the viewport — e.g. the strip reserved below the host for the progress chip — with the book's theme color rather than Obsidian's own (usually dark) content background. `!important` is required because `contentEl` is Obsidian's own `.view-content` element, which Obsidian or the active theme may set a background on directly.

   `--orbis-host-bg-dimmed` (not `--orbis-host-bg`, and not a `filter: var(--orbis-host-filter)` on this rule) gives a brightness-adjusted color here without double-dimming: `contentEl` is an ancestor of `filterWrapperEl` (which already applies the brightness filter to its own subtree for the book content) and of the exit/back/forward buttons (which apply the filter to themselves directly, since they sit outside that subtree). A `filter` on `.orbis-focus-mode` itself would compound with both of those, over-dimming them, while leaving *other* content in the gap area under-dimmed relative to them. `resolveHostBgDimmed()` (`settings.ts`) pre-computes the brightness-adjusted color value in JS (the same linear per-channel scaling `filter: brightness()` does, applied directly to the theme's hex color) — a plain background color doesn't compound with anything.

7. **Native nav bar** — calls `setNativeNavBar(false)` via the Capacitor StatusBar plugin to hide the Android system navigation bar on the mobile app.

8. **Floating overlay** — creates `div.orbis-focus-overlay` (`position: fixed; inset: 0; z-index: 100001`, `pointer-events: none`) as a child of `contentEl`, not `body`. Ancestor neutralization (step 1) is what lets it still escape to the true viewport via `position: fixed`. The overlay contains:
   - **Top band** (`div.orbis-focus-topband`) — fills `--orbis-focus-top-strip`, the host's own `top` offset, in the dimmed book color. The band carries its own paint rather than relying on `.orbis-focus-mode`'s gap fill. No z-index, so the topbar's 100002 keeps the buttons above it, and it never takes a touch — which is the point of the strip.
   - **Topbar** (`div.orbis-focus-topbar`) — a fixed flex row at `top: var(--orbis-focus-chrome-top); right: calc(env(safe-area-inset-right) + 14px)`, `gap: 10px`, `z-index: 100002`, holding the back/forward pair (step 9) and the exit button, so a real `gap` separates all three buttons. Its children re-enable pointer events.
   - **Exit button** (`button.orbis-focus-exit-btn`), the topbar's last item — near where the focus button lives on the toolbar so the user knows where to tap. Its background is `var(--orbis-host-bg, var(--interactive-normal))`, icon color `var(--orbis-host-fg, var(--text-normal))`, plus `filter: var(--orbis-host-filter, none)` — the same book-theme colors and brightness treatment as the floating back/forward buttons, so it blends into the page instead of standing out. `--orbis-host-bg`, `--orbis-host-fg`, and `--orbis-host-filter` are all set on `contentEl` by `applyHostBg()` so this button (outside the `orbis-filter-wrapper` subtree) can inherit the same values.
   - **Progress chip** (`span.orbis-focus-progress`, only when `showProgressIndicator` is on): transparent background, monospace text color `var(--orbis-host-fg, var(--text-muted)) !important` (matches the book theme, not Obsidian's own muted-text color, since it sits on the theme-matched gap background from step 6), positioned in the reserved strip below the host, horizontally centered, 20px above the bottom inset. Tapping cycles the progress mode. Kept in sync via `focusProgressEl`, which `updateLocLabel()` writes to alongside the toolbar label.

9. **Back/forward buttons** — `.orbis-history-nav` is moved into the topbar, before the exit button, and flows in its flex row. Button order is unchanged from normal mode — `←` back, then `→` forward — so forward sits closest to the exit button. It is moved rather than switched to `position: fixed` in place inside `filterWrapperEl`, because `filterWrapperEl` has `overflow: hidden` and can carry an active CSS `filter` (brightness), either of which hijacks a `position: fixed` descendant's containing block away from the true viewport. Moved back into `filterWrapperEl` on exit, before the overlay is removed.

   Outside `filterWrapperEl` the pair no longer inherits the brightness filter, so `.orbis-focus-mode .orbis-history-nav` declares `filter: var(--orbis-host-filter, none)` directly — the same way the exit button handles being outside that subtree.

10. **Highlight drawer** — the mobile highlight color bar (`.orbis-highlight-drawer-row`, owned by `AnnotationController`) is re-parented into the focus overlay too, for the same containing-block reason as the back/forward pair (step 9). In normal mode the drawer sits at the **top** of the reader (in the overlay container), where the Orbis toolbar occupies that band — but in focus mode there is no toolbar and the host fills from the top, so a top-anchored drawer would land on the first text line, exactly on the text a top-line selection is highlighting. In the overlay it is CSS bottom-anchored as a floating pill (`position: fixed; bottom: calc(env(safe-area-inset-bottom) + 16px)`, centered, `z-index` above the chip) **over the progress chip** — covering no book text and reserving no layout space (so no repagination). It's brightness-matched via `filter: var(--orbis-host-filter)` like the other floating controls, and moved back to the overlay container on exit, where it stays top-anchored.

11. **Page margin** — writes `FOCUS_PAGE_MARGIN` (28px) into the renderer's `margin` attribute; see [Standalone search bar](#standalone-search-bar).

### Text selection in focus mode — Android viewport-pan compensation

On Android, selecting text **in focus mode** and dragging the handle toward the bottom makes the WebView **pan its visual viewport** to chase a selection that lives inside a `position: fixed` element. Every fixed layer — the host, the foliate view and the exit button — drifts upward by the same amount in lockstep, while every scroll offset (`scrollTop` on host/foliate-view/content/filter-wrapper, `window.scrollY`, `visualViewport.offsetTop`) stays exactly `0`. It happens only in focus mode because that's the only place the reader is `position: fixed` (step 5 / step 6); in normal mode the reader is in normal flow and the only selection auto-scroll is the paginator's own, which the mobile selection **snapback** in `ReaderDom` pins.

Because the pan is a visual-viewport shift with no DOM scroll behind it, it can't be pinned or reversed via `scrollTo`, and de-`fixed`-ing the host doesn't help (fullscreen *requires* a `position: fixed` ancestor, so the text is always inside one). `ReaderDom.startFocusSelectionCompensation()` compensates instead: while a selection is active in focus mode, a `requestAnimationFrame` loop measures the host's on-screen drift with `getBoundingClientRect` (the only thing that sees it) and applies a counter-`transform: translateY(...)` to the host **and** the focus overlay, accumulating the residual error each frame. This is a feedback loop that tracks the pan as it grows and unwinds itself when the pan resets (a page turn) or focus mode exits (`FocusMode.exit()` also clears any leftover transform as a safety net). It is mobile- and focus-mode-only and a no-op everywhere else. The counter-move could in principle fight the WebView's pan and jitter; if it does, the fallback is to replace focus mode's `position: fixed` fullscreen mechanism entirely.

### Exiting focus mode

1. Disconnects the chrome `MutationObserver`.
2. Restores all saved ancestor `style.cssText` values.
3. Removes `display: none` from each hidden chrome element and from the view header.
4. Removes the floating overlay (a child of `contentEl`); nulls `focusOverlayEl` and `focusProgressEl`.
5. Shows `toolbarEl`.
6. Clears any leftover selection-compensation `transform` from `hostEl`, the renderer's `margin` attribute (back to Foliate's own 48px) and `--orbis-focus-bottom-inset`. The host's placement goes with the `orbis-focus-mode` class in step 8.
7. Dispatches a `resize` event so foliate re-paginates to the restored host size.
8. Removes `orbis-focus-mode` class from `contentEl`.
9. Calls `setNativeNavBar(true)`.

### Key implementation notes

- The host's placement is a CSS rule, and `--orbis-focus-bottom-inset` moves its bottom when the measurement arrives. `lockMobileHeights()` writes inline `height`/`min-height`/`max-height` on `hostEl` when a soft keyboard opens; `enter()` removes those, and a height locked while focus mode is on governs the host whether its placement is inline or not, as `top` and `height` together outrank `bottom` on a fixed element.
- The 30 px bottom reserve is intentional: foliate's ResizeObserver sees the host shrink and repaginates, so text never runs under the progress chip.
- The overlay is a child of `contentEl`, not `body` — it stays unclipped because ancestor neutralization (step 1) strips the properties that would otherwise trap its `position: fixed` inside a local containing block.
