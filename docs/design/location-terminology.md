# Location Terminology

← [Design Docs](README.md)

## What a location is

Orbis Reader says **"location" / "loc."**, never "page", wherever it shows or
accepts a position number: the progress indicator, Go To, bookmarks, the saved
pane, the Orbis DataView, notes export and the URI handler.

A location is **not a print page number**. It is a run of the book's text: the
text is cut into equal runs of characters, numbered from 1. How many there are
comes from foliate's own count — one for every 1 500 bytes of the book's
documents, as Amazon Kindle's locations are — so a book has the same total in
Orbis as foliate gives it. Concretely:

- The number of screen pages in a book changes with font size and window width;
  a location does not track a screen page.
- A "loc. 47" in Orbis is not page 47 in the print edition and is not page 47 in
  any other ebook reader.
- A reader who cites "page X" from Orbis in academic or classroom work would cite
  a meaningless number.

Go To accepts both location numbers and book percentages.

---

## One numbering

Every location number comes from the book's location index, by one rule
(`locAtChar` in `src/reader/location-math.ts`): location `L` starts at character
`round((L − 1) × charsPerLoc)` of the book's text, and a position is in the last
location that starts at or before it.

| Surface | The location of |
|---|---|
| Progress indicator, Stats tab **Location** | The top of the page (`lastCfi`) |
| A passage selection, an annotation note | Where it begins |
| A bookmark | Where its anchor begins — the lines at the top of the page, or the sentence being read (`bookmarkLocCfi`) |
| Chapter locations | The book's location, counted from the location the chapter begins in (`chapterLocs`) |
| Go to location, a `loc=` link | Goes to where the location starts |
| Device locations, the Orbis DataView | Each device's position, from the cache file |

The index stores where each location starts as a CFI (`locNavCache`, saved in
the book's `.pages.json`), and `locAtCfi` (`src/reader/loc-lookup.ts`) answers a
position's location by a binary search in reading order. The relocate handler
converts the page's number as foliate reports it, so everything downstream reads
the one value.

**Why one.** Foliate's own counter counts bytes from 0, so a book's first page
reads `loc. 0`. And bytes of markup and characters of text part ways where a
book's markup is heavy against its text — code listings, tables — so a byte
number and a text number for the same place can differ by tens of locations. With
two numberings, a passage, the page it is on and Go to that number disagree.

**Before the index is up** — the first open of a book, while the index is made —
the indicator shows foliate's number plus one, and a passage stores no location.
When the index comes up, every stored location is restamped by the rule
(`restampLocs`, `src/reader/restamp-locs.ts`): on every open, writing only what
changed. A book foliate gives no location total — some MOBI and AZW3 files —
has no locations, and nothing is restamped there.

**Percentages are read at the top of the page too.** foliate's `fraction` is the
END of the visible page, so a chapter's first page in a wide window read a quarter
of the way in. ORBIS patch 16 adds `startFraction`, the fraction at the page's top,
and the book percentage, the chapter percentage and the words-remaining estimates
all take it: a chapter's first page reads 0%, and the book's first page 0%.

**So is the chapter.** The chapter counters count the chapter at the top of the
page (`ReadingStats.chapterAtTop`), not foliate's page entry, which is the last
heading before the page's END. The top is its first visible character
(`firstTextPoint`, toc-entry.ts): a file Calibre made opens with an empty
page-break `<div>` and a line break before its heading, and the page's range
starts there, before the heading, so the page would count as the chapter before.
Bookmarks and passages are filed by the same lookup.

**Kindle contents entries.** Chapter locations need the location a chapter begins
in, found from its contents entry. A Kindle book's entries are `kindle:pos:`
links and a MOBI's `filepos:`, which `hrefToSectionIndex` does not place. foliate
does: `splitTOCHref` names the section, which is how foliate names the page's
chapter, and `resolveHref` finds the element the entry points at. The index asks
foliate for every entry its own lookup misses (`hrefToSectionIndex`), and the
measuring pass records where each one's text begins in `anchorCharOffsets`, beside
the EPUB anchors (`foliatePlacedAnchors`), and the id of the element it points at
in `tocAnchorIds`. Every element measured so far has one: the book's own id, or
the `filepos…` anchor foliate writes into a MOBI. `anchorOf` gives that id where
an EPUB entry has its `#fragment`, so every chapter split — chapter locations and
percentages, Listen, Save as Markdown, Save as PDF and the export dialogs — cuts a
Kindle chapter where it starts, as it cuts an EPUB one.

---

## Vocabulary standard

| Context | Term | Example |
|---|---|---|
| Compact UI (toolbar, saved pane chip) | `loc.` | `loc. 47` |
| Full-width UI (stats pane, Go to bar) | `Location` | `Location: 47 of 385` |
| Chapter-scoped location | `Chapter location` | `Chapter location: 12 of 38` |
| Percentage alternative | `%` | `34%` |

User-facing explanatory copy says that a location is not a print page number and
that navigation by location is approximate. The Go To hint
(`go_to.location_disclaimer`) carries it.

---

## The Go to location bar — dual input

The bar, under the toolbar, accepts:

- **Location number** — any integer in the range 1–total. Goes to the page where
  the location starts. That page's number is the location in progress at its top:
  the one asked for, or an earlier one when the location starts partway down the
  page. How much earlier depends on how many locations a page holds, which the
  window size, font size and margins decide.
- **Percentage** — an integer 0–100 followed by `%` (e.g. `34%`). Fraction is
  computed as `input / 100`. More portable across formats and devices.
- **CFI** — a raw `epubcfi(…)`, navigated to exactly.

Parsing is `parseGoToInput()` in `src/goto-parser.ts`, kept pure so it can be
tested without the bar.

### Parsing rules

| Input | Detected as | Navigation |
|---|---|---|
| `47` | Location | `navigateToLoc(47)` |
| `34%` | Percentage | `goToFraction(0.34)` |
| `epubcfi(…)` | CFI | `navigateToCfi(…)` |
| `34.5%` | Percentage, read as `34%` (`parseInt`) | `goToFraction(0.34)` |
| `0` | Invalid (loc. < 1) | Show error |
| `386` (> total) | Invalid | Show error |
| `101%` | Invalid (% > 100) | Show error |
| `-5` or `abc` | Invalid | Show error |

### Strings

| Key | English value |
|---|---|
| `go_to.go_to_location` | `Go to location` |
| `go_to.go_to_label` | `Go to:` |
| `go_to.location_or_pct` | `e.g. 47 or 34%` |
| `go_to.location_disclaimer` | `Locations do not match standard page numbers. Navigation is approximate.` |
| `go_to.enter_valid_location` | `Enter a location between 1 and {{total}}, or a percentage (0–100%)` |
| `go_to.pct_out_of_range` | `Enter a percentage between 0 and 100` |

The hint renders below the input in the bar (small/muted style), visible
before the user types, and is replaced by the error text when input is rejected.

---

## Where the vocabulary appears

### 1 — i18n keys in `en.ts`

| Key | English value |
|---|---|
| `stats_tab.location` | `Location` |
| `stats_tab.chapter_location` | `Chapter location` |
| `command_palette.recalculate_locations` | `Recalculate locations (dev)` |
| `command_palette.rebuild_location_index_for_current_book` | `Rebuild location index for current book (dev)` |
| `notices.locations_not_ready` | `Still building locations — try again in a moment` |
| `notices.locations_not_ready_reload` | `Locations not ready — wait for the book to fully load, then try again` |
| `notices.rebuilding_locations` | `Rebuilding locations…` |
| `notices.locations_rebuilt` | `Locations rebuilt` |
| `notices.locations_updated_for_n_annotations` | `Locations updated for {{n}} annotation(s)` |
| `orbis_data_view.last_location` | `Last location` |
| `toolbar.bookmark_this_location` | `Bookmark this location` |
| `toolbar.remove_bookmark` | `Remove bookmark` |

The command id is `orbis-go-to-location`.

### 2 — `loc.` labels in source code

Every position label is `loc. ${loc}`: bookmark labels (`bookmarkLabel()`), the
saved pane's bookmark, highlight and note
chips (`ReaderPanels`), the Orbis DataView chips, Save as PDF entries, and the link
text `buildDeepLink()` writes into notes export.

### 3 — Stats pane

Two rows in the stats panel:

| Label |
|---|
| `Location: X of Y` |
| `Chapter location: X of Y` |

They use `t('stats_tab.location')` and `t('stats_tab.chapter_location')`.

### 4 — URI handler (`main.ts`)

The `obsidian://orbis-nav` handler accepts:

- `loc=N` — the location parameter (location number, integer)
- `pct=N` — percentage, integer 0–100
- `page=N` — **deprecated alias** for `loc=N`; accepted without error but logged
  as a deprecation warning, so links written by other tools keep working

`loc` is read before `page`. When several targets are present, `navigateWhenReady()`
uses the first of `cfi`, `href`, `pct`, then `loc`.

```
obsidian://orbis-nav?file=…&cfi=…&loc=47
obsidian://orbis-nav?file=…&pct=34
obsidian://orbis-nav?file=…&cfi=…&page=47  ← still works, deprecated
```

### 5 — Orbis DataView

- Reading activity table column: `Last location` (`orbis_data_view.last_location`)
- Saved items chips: `loc. ${loc}` (§2 above)

### 6 — Notes export

`buildDeepLink()` generates the Markdown link text `loc. ${loc}`. The URL itself is
CFI-based; only the display label names the location:

```markdown
[loc. 47](obsidian://orbis-nav?file=…&cfi=…)
```

---

## Bookmark labels

A bookmark's `label` field holds text like `"Chapter 3 · loc. 47"`, displayed in
the saved pane and DataView. The label is cosmetic — the CFI (not the label) is
the authoritative navigation target.

---

## The Go to location bar — navigation logic

`navigateToLoc(N)` goes to `locNavCache.get(N)`, the location's own start. Before
the index is up it falls back to foliate's byte position, with `nudgeToLoc()`
paging forward when the renderer lands short. Percentage input takes its own
path:

```typescript
// Pseudo-logic for submitGoTo():
const raw = input.trim();
if (raw.endsWith('%')) {
    const pct = parseInt(raw.slice(0, -1), 10);
    // validate 0–100
    view.goToFraction(pct / 100);
} else {
    const loc = parseInt(raw, 10);
    // validate 1–total
    view.navigateToLoc(loc);
}
```

Percentage navigation calls `goToFraction` directly — no `nudgeToLoc` — because
the user explicitly chose approximate navigation and there is no "expected exact
location" to correct against.

---

## Internal identifiers

Internal identifiers that refer to a Foliate location use the `loc` / `location`
vocabulary too. Keeping "page" in code while the UI says "location" would make a
two-vocabulary codebase.

### Methods and functions

| Name |
|---|
| `navigateToLoc(loc: number): boolean` |
| `nudgeToLoc(target: number)` |
| `getLocForCfi(cfi: string)` / `locAtCfi(starts, cfi)` / `locAtChar(char, …)` |
| `chapterStartLoc(href)` / `sectionStartLoc(sIdx)` |
| `restampLocs(…)` |
| `buildLocNavCache(…)` |
| `buildSectionLocInfo(…)` |
| `rebuildLocsCache()` |
| `recalculateLocations()` |
| `buildLocationIndex()` / `loadOrBuildLocationIndex()` |
| `getSectionProgress()` / `getChapterProgress()` returning `{ loc, total, pct }` |
| `buildDeepLink(…, loc?: number)` |

### Instance variables

| Name |
|---|
| `locNavCache: Map<number, string>` |
| Go to bar `totalLocs` |
| `locWordCounts`, `paceTimerLoc` |

### Local variables

Totals are `totalLocs`; loop variables over locations are `loc`.

### `main.ts` URI handler locals

```typescript
// Handles both loc= and the deprecated page= alias
const locRaw = params.loc ?? params.page;
const loc = locRaw ? parseInt(locRaw, 10) : null;
const pct = params.pct ? parseInt(params.pct, 10) : null;
```

---

## Data model fields

The three annotation interfaces in `src/progress.ts` each carry a `loc?: number`
field, serialized into `.orbis` files on disk:

```typescript
// progress.ts
interface Bookmark { …; loc?: number; … }
interface Highlight { …; loc?: number; … }
interface Note      { …; loc?: number; … }
```

### `LocationsCache` interface and functions (`src/progress.ts`)

```typescript
export interface LocationsCache {
  version: number;
  totalLocs: number;
  sectionLocInfo: Array<{ startLoc: number; locCount: number }>;
  locNavCache: Record<string, string>;
  // …plus the optional per-section counts and offsets
}
export function readLocsCache(…): Promise<LocationsCache | null>
export function saveLocsCache(…, input: LocsCacheInput)
```

The cache file is stored in the vault (not localStorage). A cache whose version
doesn't match `LOCS_CACHE_VERSION` is rejected and rebuilt cleanly (a cache miss on
first open, no migration); see the version history in
[`data-migration.md`](data-migration.md). Read the constant in `progress.ts` for the
current value.

### `ProgressMode` literal types (`src/settings.ts`)

```typescript
export type ProgressMode =
  | 'book-percent'
  | 'book-locs'
  | 'chapter-percent'
  | 'chapter-locs'
  | 'book-time'
  | 'chapter-time';
```

`renameLegacyProgressModes()` in `src/device-settings.ts` runs on every load and
renames a stored `'book-pages'` / `'chapter-pages'` to `'book-locs'` /
`'chapter-locs'`, because a stored id nothing recognizes is a progress chip that
shows nothing.

`PROGRESS_MODE_GRID_LABELS` and `PROGRESS_MODE_DISPLAY_ORDER` in `src/settings.ts`
use the same literals:

```typescript
'book-locs':    { main: '📖 Book locs.',    sub: 'current loc. / total locs. in book' },
'chapter-locs': { main: '📑 Chapter locs.', sub: 'current loc. / total locs. in chapter' },
```

### Location index cache

The `locNavCache` map is stored inside the `LocationsCache` file in the vault. The
cache version check covers it — a cache whose version doesn't match
`LOCS_CACHE_VERSION` is rejected and the index rebuilds automatically. No separate
migration is needed.

---

## What stays "page"

- `detail.location.current` / `.total` — Foliate's own property names on the
  `relocate` event. We cannot rename them. `lastLocation` keeps the shape, holding
  the index's location for the top of the page and foliate's total.
- The toolbar number display format itself — mode 1 shows bare numbers
  (`📖 47 / 385`) without the word "page"; only the stats-pane row names them.
- Genuine screen-pagination terms (`paginated`, "next page") stay "page".
- The on-disk `<book>.pages.json` filename keeps "pages".
- Book format support — no change to epub/mobi/azw3/fb2 handling.
