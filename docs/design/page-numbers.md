# Page Numbers

← [Design Docs](README.md)

**NOT BUILT.** This is the agreed design; its status is in the [Roadmap](roadmap.md).

A book that carries the page numbers of a printed edition shows them: in the progress indicator, the Stats tab, the
contents, Go to, annotations, reading records and notes. A book without them looks and works as it does now, except
for three things every book gets: the indicator labels a location `loc.`, the two location modes are renamed for what
they now show, and the `{{loc}}` placeholder includes its abbreviation.

---

## What a page number is

Some EPUBs carry a **page list**: the page numbers of one printed edition, each pointing at the place in the text where
that page begins. EPUB 3 puts it in the navigation document (`<nav epub:type="page-list">`), usually with page-break
markers in the text (`epub:type="pagebreak"`, `role="doc-pagebreak"`). EPUB 2 puts it in the NCX (`<pageList>`).
foliate parses both into `book.pageList`, a list of `{ label, href }` in reading order.

**A page number is the label of a page-list entry.** It is not a location, and it is not a screen page. A screen page
changes with the font and the window; a page number is the printed edition's, the same on every device and in every
reader. A location is still a run of the book's text ([Location terminology](location-terminology.md)), and every book
has locations. Only some books have page numbers.

**Which books have them.** A book has page numbers when its page list has at least one entry whose target exists in
the book. A page list whose targets are all missing counts as none, so a broken list hides everything about pages
rather than showing numbers that go nowhere.

**Which formats.** EPUB 3 and EPUB 2. MOBI and AZW3 keep page numbers in a separate file (APNX) that foliate does not
read, and FB2 has none, so those books have none. CBZ is left out: its pages are images, and what a comic's "page"
should mean is its own decision.

**Which edition.** An EPUB can name the printed edition its page numbers come from (`a11y:pageBreakSource`, or
`dc:source`). Reading data shows it when the book names it, for a reader who cites page numbers.

---

## Labels

**A label is kept as the book writes it.** Front matter is often numbered in roman numerals (`xii`), some books
number appendix pages `A-3`, and a list can skip pages or repeat one. So a page number is text, everywhere: on an
annotation, in a reading record, in a placeholder. Nothing parses it as a number except the total.

**Counting is by position in the list, not by label.** "Page 3 of the chapter" is the third entry from the chapter's
first page, whatever the labels are, so roman numerals and gaps never make a count go wrong.

**"Of N" is the highest-numbered page.** N is the largest label that is a plain number. An index numbered on from the
text counts; unnumbered pages after the last number do not. A book whose labels include no plain number at all uses
the number of entries in its list. On a page before the first numbered one, or after the last, the indicator still
shows that page's label: `p. xii of 340`.

---

## The term

| Context | Term | Example |
|---|---|---|
| Prose, settings, the guide | page number | "This book has page numbers." |
| Compact UI: indicator, annotation rows, link text, the `{{page}}` placeholder | `p.` | `p. 12 of 340`, `p. 12` |
| Full-width UI: Stats tab, Go to | Page | `Page: 12 of 340` |
| Chapter-scoped | Chapter page | `Chapter page: 3 of 12` |
| A reading-record property | the bare label | `12`, `xii` |

**"Page" alone still means a screen page**: **Paged mode**, a page turn, the page buttons, the top of the page. A
printed edition's page is always a **page number** in prose. `p.` is the abbreviation citation styles use, so a page
copied into a paper reads the way the paper expects.

**`loc.` gets the same shape.** The indicator shows `loc. 3 of 99` for locations, beside `p. 12 of 340`, so the two can
never be mistaken for each other, in a book that shows both or between two books.

---

## The page you are on

**The page at the top of the view**, as for locations and chapters: the page whose start is the last one at or before
the first visible character. With two columns, or in **Scrolled mode**, more than one page can begin on screen, and
the top decides.

foliate reports a page with each `relocate` (`pageItem`), but it is the last page that begins before the view's END,
as its chapter is (see "So is the chapter" in [Location terminology](location-terminology.md)). So Orbis resolves the
page itself, from the page index, by the position at the top (`lastCfi`).

### The page index

Each page-list target is resolved to a CFI once, in the location index's measuring pass, which already loads every
section of the book. The result is cached in the book's `.pages.json` beside the locations, as an ordered list of
`{ label, cfi }`, and `LOCS_CACHE_VERSION` goes up so every book's cache is rebuilt once.

`pageAtCfi` answers the page a position is in by a binary search in reading order, as `locAtCfi` does for locations.
One lookup serves the indicator, the Stats tab, annotations, bookmarks and the device locations.

**Before the index is up** (the first open of a book, while the index is made) the indicator shows foliate's
`pageItem` label, which can be one page ahead, and an annotation stores no page yet.

### Chapter pages

A chapter's pages are counted from the page the chapter begins in, which is page 1, to the page it ends in, as chapter
locations are counted from the location the chapter begins in. The chapter is the one at the top of the view
(`chapterAtTop`).

A chapter that starts partway down a printed page shares that page with the chapter before it, so the page counts in
both. A short chapter with no page break inside it reads `p. 1 of 1`.

---

## What the reader shows: one setting

Where a book has both page numbers and locations, one setting decides which the reader shows. A book without page
numbers always shows locations, whatever the setting says.

| Option | Progress indicator | Annotation rows | Go to opens on |
|---|---|---|---|
| **Page numbers** (default) | `p. 12 of 340` | `p. 12` | page |
| **Locations** | `loc. 3 of 99` | `loc. 51` | loc. |
| **Both** | Both, as separate stops in the cycle | `p. 12 · loc. 51` | page |

The setting decides what the reader shows, and the text of a link in a generated note. Reading records and notes
styles have both values to use, so the reader of a note chooses: see
[Everything that leaves the reader](#everything-that-leaves-the-reader). The Stats tab shows both whatever the setting
says.

**The setting.** A row in the **Reading progress indicator** section, before the mode toggles:

- **Name:** Page numbers or locations
- **Description:** What the reader shows for a book that has the page numbers of a printed edition. A book without
  them shows locations.
- **Options:** Page numbers · Locations · Both

It is a device setting, like the modes it governs (`progressModes`).

**Why one setting, not more modes.** The location modes become position modes: **Book locs.** and **Chapter locs.**
show page numbers or locations as the setting says. So:

- The cycle does not grow from six stops to eight.
- A book without page numbers has no page mode to skip, and the mode a reader chose is never overwritten by opening a
  book that lacks them.
- "At least one must stay on" needs no special case.

In **Both**, the cycle adds the two page stops after the two location stops, keeping its metric-major order (see
"Cycle order" in [Reading Progress & Sync](reading-progress-system.md)): the book's location, the chapter's location,
the book's page, the chapter's page. The mode IDs in the settings do not change, so no saved setting needs migrating.

**The modes' names** change with what they show: **Book locs.** becomes **📖 Book position**, "page number or location
in the book", and **Chapter locs.** becomes **📑 Chapter position**. The i18n keys are renamed with them.

**Screen readers.** The indicator is a live region. Its accessible label spells the words out, "page 12 of 340" and
"location 3 of 99", because `p.` and `loc.` are otherwise read out as letters, or as a word.

---

## In the reader

### Progress indicator

| Mode | A book with page numbers | A book without |
|---|---|---|
| 📖 Book position | `📖 p. 12 of 340` | `📖 loc. 3 of 99` |
| 📑 Chapter position | `📑 p. 3 of 12` | `📑 loc. 3 of 12` |

Percent and time modes are unchanged. The icons stay: a book position and a chapter position read the same without
them. The label is longer than today's `3 / 99`, so it is checked at phone width, where the toolbar's center is
narrowest.

### Stats tab

A **Page** row (`12 of 340`) and a **Chapter page** row (`3 of 12`) after **Location** and **Chapter location**,
shown only for a book with page numbers. The Stats tab shows both values whatever the setting says: it is where a
reader looks up the numbers, not a running display.

### Contents

Each entry in the Navigator's contents shows the page number its chapter begins on, right-aligned as in a printed
book's contents, when the setting is **Page numbers** or **Both**. Only page numbers: a location beside every entry
would be noise. With **Locations**, and in a book without page numbers, the contents are as now.

### Go to

A book with page numbers adds a dropdown before the field, **Page** or **Location**, which opens on the setting's
choice (**Page** for **Both**). The bar is full-width UI, so the words are written out, as the Stats tab writes them.

| Input | With **Page** | With **Location** |
|---|---|---|
| `12` | The page labeled `12` | Location 12 |
| `xii` | The page labeled `xii`, in any case | Invalid |
| `34%` | 34% of the book | 34% of the book |
| `epubcfi(…)` | That position | That position |

A page goes exactly to where it begins, so the hint *Locations do not match standard page numbers. Navigation is
approximate.* shows with **Location** only. A page label that is not in the book shows an error naming the first and
last page. A book without page numbers shows the bar as now, with no dropdown. `parseGoToInput` takes the chosen kind
and the book's labels, and stays pure.

### Annotations

A passage selection, an annotation note and a bookmark store the page they begin on, as `page?: string`, beside
`loc`. The rows of the Annotations tab show `p. 12`, `loc. 51` or both, as the setting says. The device locations
dialog shows each device's position the same way.

**The stored page is derived, never the source of truth.** The CFI is the annotation's position; the page is worked
out from it, as the location is. On every open, once the page index is up, every stored page is restamped from the CFI,
writing only what changed (`restampPages`, beside `restampLocs`). So annotations made before this existed gain their
page on the first open, a page list a later edition corrects is followed, and nothing is lost if an older version of
Orbis Reader on another device rewrites the `.orbis` file without the field. Whether an older version keeps an unknown
field when it rewrites the file is to be checked while building this; the design does not depend on the answer.

---

## Everything that leaves the reader

Each has the page number where the book has page numbers, and nothing about pages where it does not.

| Surface | Page number |
|---|---|
| Reading record | A `page` property, the bare label, written only when the annotation has one. Text, never a number: a book that mixes `xii` and `12` would otherwise give the property two types. Listed on the **Properties** page with its purpose. |
| Notes style | A `{{page}}` placeholder; see below. |
| A deep link's text (`{{link}}`) | `[p. 12](…)` when the setting shows page numbers, `[loc. 51](…)` otherwise; `[p. 12 · loc. 51](…)` with **Both**. It is the setting of the device that writes the note. The link itself is the CFI, so it is exact either way. |
| Save as Markdown, generated notes | Through the notes style. |
| Save annotations as PDF | `p. 12` beside each mark's location. |
| Reading data (`.orbis` view) | A page for each annotation and for each device's last position, and the printed edition when the book names it. |
| The library's record rows | In the app, so the setting decides, as for the annotation rows. |

### The `{{page}}` placeholder

`{{page}}` gives `p. 12`, with its abbreviation, or nothing at all for a book without page numbers. A template line
such as `- "{{selection}}" — {{page}}` then reads cleanly in both kinds of book, with no stray `p.` left behind.

**`{{loc}}` takes the same shape**, `loc. 51`, so the two placeholders behave alike: each says what it is, and each
gives nothing when the book has no such number. Some MOBI and AZW3 books have no locations, so `{{loc}}` can be empty
too. The reading record's `loc` property stays the bare number.

**The migration.** Today `{{loc}}` is the bare number, so a saved template that writes `loc. {{loc}}` would read
`loc. loc. 51`. A one-time settings migration, following the [Data Migration Guide](data-migration.md), rewrites the
abbreviation in front of the placeholder in every notes style's templates:

- `loc. {{loc}}` and `loc {{loc}}`, in any case, become `{{loc}}`;
- any other wording is left as it is: `Location {{loc}}` becomes `Location loc. 51`, which the reader can edit.

The rewrite finds nothing to change a second time, so it is safe on every device that receives the synced settings.
The built-in templates do not use `{{loc}}`, so only a reader's own templates change, and the release notes say so.

---

## Links

`obsidian://orbis-nav` takes:

| Parameter | Meaning |
|---|---|
| `cfi=` | An exact position. Wins over every other parameter. |
| `page=` | A page number, by its label. |
| `loc=` | A location. |
| `pct=` | A percentage. |

`page=` used to be an old name for `loc=`, with a deprecation warning. It now means a page number. In a book without
page numbers, `page=` is read as a location, so an old link into such a book still goes where it did. An old `page=`
link into a book that has page numbers now goes to that page number; links are not a promise worth a second parameter
name for.

---

## The test book

`page-numbers.epub`, built by `scripts/build-fixtures.ts` with invented text only:

- an EPUB 3 page list with page-break markers in the text;
- roman-numeral front matter (`i`–`xii`), then `1` onwards;
- a page break in the middle of a paragraph, and one in the middle of a sentence;
- a page missing from the list (a gap), and an unnumbered page after the last numbered one;
- a chapter that starts partway down a page, and a short chapter with no page break inside it;
- an index numbered on from the text, so "of N" is checked to include it;
- `a11y:pageBreakSource` naming an invented edition.

`page-numbers-ncx.epub`, a smaller book, carries an EPUB 2 NCX `<pageList>` and no nav document. In
`broken-page-list.epub`, every target of the page list is missing, some ids and one file, to show that a broken list
counts as none. The comment above each book in `scripts/fixtures/books.ts` gives its pages.

---

## What changes elsewhere

- [Location terminology](location-terminology.md): it says Orbis never says "page". It will say a page number is the
  printed edition's, and keep "page" alone for a screen page. Its row for `page=` changes.
- [Reading Progress & Sync](reading-progress-system.md): the progress modes, the cache's new field, and the device
  locations dialog. Its description of that dialog's row already says "page number" where it means a location, and
  it says `progressModes` syncs with the settings, where it is a device setting.
- [Plugin Architecture](plugin-architecture.md): the deep-link protocol's parameters.
- [Terminology](terminology.md) and the [Glossary](glossary.md): **page number**.
- The user guide: Reading Progress, Go to in Reading a Book, the troubleshooting line on locations and page numbers,
  the settings reference, the notes style placeholder table and Reading Records.
- The test plans for reading a book and for marks and notes.
- The CHANGELOG: page numbers under Added; the renamed modes and `{{loc}}`'s new shape, with the migration, under
  Changed.
- The [Roadmap](roadmap.md): an entry for this work, taken off when it ships.

---

## Decisions

| Decision | Choice | Why |
|---|---|---|
| The term | **page number**; `p.` when short | "Page" already means a screen page. `p.` is what citation styles use. |
| What a label is | Text, kept as the book writes it | Roman numerals, `A-3`, gaps and repeats. |
| Counting | By position in the page list | Labels cannot be counted. |
| "Of N" | The highest plain-number label | Matches the printed book, index included. |
| Chapter pages | Counted from the chapter's first page, as 1 | Parallels chapter locations. |
| The page you are on | The top of the view, resolved by Orbis | foliate's `pageItem` reports the end. |
| What the reader shows | One setting, **Page numbers or locations**: **Page numbers** (default), **Locations** or **Both** | A page number is the more useful of the two when a book has one. |
| Modes | The location modes become **📖 Book position** and **📑 Chapter position** | No mode to skip, no saved mode overwritten. |
| Stats tab | Both values, whatever the setting | Where a reader looks the numbers up. |
| Contents | Page numbers only, no locations, unless the setting is **Locations** | As in a printed contents. |
| Go to | A **Page** / **Location** dropdown when the book has page numbers; `%` works with either | One field, two kinds of number. |
| Annotation rows with **Both** | `p. 12 · loc. 51` | Both values, in the order of the setting's name. |
| A deep link's text | Follows the setting | It is what a reader sees in their note. |
| On annotations | Derived from the CFI and restamped on open | Never wrong for long, nothing lost to an older version. |
| `{{page}}` | `p. 12`, or nothing | No stray prefix in a book without page numbers. |
| `{{loc}}` | `loc. 51`, or nothing, with a migration for saved templates | The two placeholders behave alike. |
| Links | `page=` is a page number; `loc=` a location; `page=` reads as a location in a book without page numbers | Plain names; old links into such books keep working. |
| CBZ | No page numbers, for now | A comic's pages are images; a decision of its own. |
| MOBI, AZW3, FB2 | No page numbers | foliate does not read APNX; FB2 has none. |

---

## To check while building

1. Whether an older version keeps a field it does not know when it rewrites a `.orbis` file. The design does not
   depend on it, but the answer belongs in [Annotations](annotations.md).
2. The indicator's longest label, `📖 p. xviii of 1,204`, at phone width beside the toolbar's buttons.
3. ~~foliate's parsing of an EPUB 2 `<pageList>`.~~ Checked 2026-11-27: foliate reads all ten entries of
   `page-numbers-ncx.epub`'s NCX as `{ label, href }`, as it reads the 53 of `page-numbers.epub`'s nav document. It
   also keeps all four of `broken-page-list.epub`'s, so the page index has to find the targets missing itself.
