# Settings

← [Design Docs](README.md)

The settings tab, built on Obsidian's declarative settings API: a drill-down tree of pages, every row indexed by
the global settings search, and a Setup page as the first thing you see — which is also the plugin's one first-run
experience.

Every page is declarative and every row of them indexed by Obsidian's settings search — with **one deliberate
exception per reorderable list**, see "A list you reorder from the keyboard cannot be Obsidian's" below. Four
surfaces stay imperative *inside* their pages, on purpose: the notes-style editor, the two voice pickers and the
pronunciation glossary, each reached through a `page:` entry.

---

## Why declarative

**Search.** Obsidian's settings search indexes declarative definitions. An imperative `display()` tab is invisible
to it — the documentation is explicit that inside imperative pages "you forfeit automatic indexing for global
settings search." There is no separate plumbing to add: the definitions *are* the plumbing.

**Updates in place.** A declarative page refreshes through `update()` and `refreshDomState()`, so a change to one
control does not rebuild the whole tree and throw the reader back to the top of a long page.

---

## The version floor, and why it is affordable

Declarative settings require **Obsidian 1.13.0**. The plugin's `minAppVersion` is 1.14.4. Mobile updates itself
through the App Store and Play Store, and desktop auto-updates, so the population on an older build is small.

---

## Navigation: drill-down pages

A top-level index; each entry opens a page with a back button. Three reasons, in order of weight:

1. **It is what `type: 'page'` does natively**, so the structure and the API agree instead of one wrapping the
   other.
2. **It works identically on a phone and a desktop.** Tabs crowd a narrow mobile pane, and making them more
   granular would make that worse.
3. **The index becomes a table of contents**, which is the discovery problem solved rather than relocated.

**Not a dropdown.** A dropdown is a good control for picking a value you know exists and a poor one for navigating
a space you do not: it hides the map, has no precedent anywhere in Obsidian, and turns a scrolling problem into a
"where was that" problem without shortening anything.

Two affordances carry real weight here:

- **`displayValue`** surfaces a page's current value on its entry — *"Recorded audio · Kokoro, 4 parallel"*. This
  is what makes it possible to keep every default in settings, visible in one place, without a long scroll: the
  index is a summary, not a menu.
- **`status: 'warning'`** flags an entry needing attention — a capability that is on and cannot work, such as a
  dictionary not downloaded under an enabled look-up, or an unreachable recording server. Orbis sets none. No
  voice downloaded is the state of every new install, and stays so for a reader who never listens, so a marker
  on Live voice would never clear for them.

---

## The map

**Ordered from inside the book outwards**, which is also frequency order: what you touch while a book is open comes
first, then what manages the collection around it, then what leaves Orbis, then the second-device feature. Three
stretches, without headings to announce them — group headings would be one more layer of abstraction over rows
that already say what they are. **Reading behavior and Listening are adjacent deliberately** — the two modes of
consuming a book, not a main one and an extra — and Annotations follows them because annotating is what you do
while doing either.

```
Setup ...................... N of 7

Appearance
   ├ Toolbar ............. which buttons appear · content panel tabs
   ├ Theme manager ...... one list: order · on/off · copy · your own   [our own list]
   style list — shared styles sync; one device default per device
   brightness · reading mode · two-column · text margins
   line spacing · text alignment · theme · font · font size
   live preview

Reading behavior
   turn pages with the keyboard · flash book text for results · link preview
   confirm before deleting notes
   ── Reading progress indicator ──   the switch and the six modes, one group
   ── Opening a book ──               how the book opens · open with
   └ Read in Orbis Reader ........... its own opening settings · type for new books

Listening
   ├ Live voice .......... the picker            [imperative sub-page] + preview
   ├ Recorded voice ...... engines, server URL, "Record with"
   │                                             [imperative sub-page] + preview
   ── Playback ──          rewind · forward · read ahead · highlight
                           always use the live voice · keep screen awake
   ── Full-screen player ──  how much the mark button marks
                             how much the note button captures
   └ Pronunciation ....... glossary + storage file  [imperative sub-page]

Annotations
   manage marks — colors, treatments, names     → presets modal, via an action row
   ├ Reading records ............. mode · folder · beside-the-book
   │                               kinds · all-books base folder
   ├ Notes styles ................ folder + name templates · default content
   │                               chapter headings · section order
   │                               frontmatter template     [imperative sub-page]
   └ Save annotations as PDF ..... marked up by

Look-up                                                              [imperative]
   dictionary (download / remove)
   ── Popup sections ──      order + visibility          [our own list]
   ── Web search ──          destinations, add/edit/delete/reorder  [our own list]

Library dashboards
   show the library · title-note folder · covers · status · uncataloged notice
   ── Dashboards ──          [our own list]

Book sources                                                         [imperative]
   OPDS feeds                [our own list]

Conversions
   ├ Save as Markdown ............ default folder · default format · images · link format
   ├ Save as PDF ................. marked up by · include marks · cover sheet
   │                               expanded character set · folder
   └ Save as EPUB ................ folder · fetch remote images · type for converted books
                                   chapter breaks

Devices
   more than one device · device name · device ID · share reading location
   share Orbis configuration · vault location for config files

Orbis Reader <version>     LAST, not first: nobody opens settings for a version
```

### Why the tree is shaped this way

**Appearance and Reading behavior are separate top-level entries** because they are different kinds of thing. The
display properties belong *to a style* — every edit lands on the selected one, whether it is made here or in the
book's display menu; Reading behavior holds global preferences that belong to no style.

**Annotations holds everything a reader adds, and what becomes of it.** An annotation is a passage selection with
marks, a note with or without one, or a bookmark, and naming that is the whole argument for the page. It is
ordered from what you make to what you get out of it: the marks you annotate with, the records written as you
read, then the two on-demand exports. Reading records sits above those because it is the bigger commitment — turn
it on and every selection, note and bookmark becomes a note by itself, where a notes style shapes a file you ask
for. `confirmDeleteNote` stays on Reading behavior: it guards deleting the note attached to a highlight, which is a
question about how careful a tap should be rather than about the marks you curate.

**There is no Notes page and no Export page.** An Export page would answer *what do I do with what I wrote* and
*what format do I want this book in* from one list, and Reading records answers neither, being a standing
arrangement rather than an export at all.

**Conversions, not Export, because the direction varies.** Save as EPUB reads Obsidian notes and writes a book;
Save as Markdown and Save as PDF read a book and write into the vault. Save as PDF follows Save as Markdown in the
order a reader meets the two artifacts: Markdown is what a book becomes inside Obsidian, PDF is what it becomes to
send.

**Developer options are revealed by a command, not by a setting** — `Toggle developer options` in the palette
flips the per-device `showDevOptions`. Deliberately a little hidden: someone who notices it gets more, and everyone
else never has to read past it. What it reveals is the developer commands in the palette and the technical rows
that only help a GPU server (audio request parallelization). A page of developer settings would be
`visible: () => showDevOptions`, so that while hidden its rows are excluded from settings search too and "debug"
cannot be stumbled into.

### Two settings named for the amount, not the mark

The full-screen player's two rows set **sentence versus paragraph** — how much the mark button marks and how much
the note button captures. They are named for the amount because a name like "Mark the passage" or "Note button"
reads as choosing *which mark* is used, which is a different setting entirely: the mark **roles** (`noteMarkId` /
`audioMarkId`), which live in the presets manager.

The roles are **not global**. In `annotation-presets.ts` they are per-preset, copied into each book and
overridable there. A single global row would misrepresent them, which is why they stay in the presets manager
beside the preset they modify. With one preset and no overrides they behave as global, which is why they read
that way.

---

## Where settings actually live

Three stores:

| Store | Holds | Scope |
|---|---|---|
| `data.json` | the synced settings, including the `styles` array | synced |
| localStorage | the live display values, active style, all recording config (`serverUrl`, parallelization), device name | **per device** |
| `.orbis` files | per-book overrides — records mode, mark roles, editions | per book |

`getControlValue` / `setControlValue` are overridable on the tab, so a dotted key (`export.pdf.coverSheet`,
`display.fontSize`) can resolve into any of them. They are the single save point.

**Per-device rows do not say so.** Labeling a dozen rows "this device only" is noise for someone who uses one
device, and unexplainable for someone who does not know whether their vault syncs. What a second device needs to
know is said where it is decided: the Devices page, and the Appearance page's line that this device's own style
cannot be shared.

**Global defaults versus per-book overrides** need saying on two pages. Records mode and the mark roles are
explicitly overridable per book, so changing a global default and opening a book that overrides it looks like a
broken setting.

**A damaged `data.json` costs nothing.** Every successful read and save also writes `data.backup.json` beside it.
Obsidian's `loadData` answers null for a file it cannot parse, the same as for no file, so `readSettingsFile`
(`settings-recovery.ts`) looks: a file that is there but unreadable is moved aside as `data.unreadable-<time>.json`,
never saved over, and the backup put back, with a notice saying so. Without a backup Orbis starts from its defaults,
and the moved-aside file is still there. The backup follows every save, so it is not a snapshot to roll back to: it
recovers a file that cannot be read, not a change the reader regrets. Before this, a file cut short by a crash or a
sync conflict was replaced by defaults: the Library switched off, the sync folder cleared, presets and dashboards
gone. Then every list is checked against the shape the code reads it in (`settleSettingsShapes`), on load and on every
adoption from another device, and an entry that does not fit is dropped and logged; one bad entry used to stop the
plugin loading on every launch. Each startup step after that is guarded the same way.

---

## Rows that are not ordinary rows

### A list you reorder from the keyboard cannot be Obsidian's

A `SettingDefinitionList` gives rows and a drag handle and takes the DOM in exchange: it paints from the
definition tree stored at the last `update()` and rebuilds on a schedule of its own, including after a settings
write. Move-up/move-down buttons cannot survive that — the button being pressed is replaced mid-press — and no
focus-restoring strategy wins that race reliably: a losing one puts the keyboard on the neighboring control, or
leaves the saved order disagreeing with the screen, which is worse than either.

So a page with a reorderable list is **imperative**, and its list is built by `renderReorderList`
(`src/settings-list.ts`) inside Obsidian's own `SettingGroup`: real rows, in a card, in a page nothing else rebuilds.
Moving a row moves the element among its siblings and reports the positions the DOM gives; nothing repaints, so there
is no focus to restore. Look-up, Book sources and the Library dashboards use it.

### The last one that must stay on is locked, not refused

Where a set must keep one on — the look-up sections and destinations, the progress modes, a notes style's content
types, the reading-record kinds, the recording methods, Advanced search's scopes, the two kinds in Save annotations as
PDF — **the last switch on is disabled, and its row says why** in its description. It is never left pressable and then
refused with a notice: a notice answers after the press, in the corner of the screen, and a disabled switch says the
rule before anyone reaches for it. A delete that would take the last one goes the same way: disabled, not refused.

The reason is shown only while the lock holds, so a row with nothing to say stays quiet.

### Everything a keyboard can reach lives in a `.setting-item`

**The settings pane runs its own keyboard model, and a control outside a row does not exist to it.** A control can
be `tabIndex=0`, `visibility: visible`, have an `offsetParent` and come first in its card's DOM order, and still be
unreachable by Tab while clicking it works.

A focus trace shows why — **rows carrying `tabindex="-1"` receive focus**:

```text
focus → DIV.setting-item.mod-toggle
key Tab on DIV.setting-item.mod-toggle
focus → LABEL.checkbox-container.is-enabled
```

Native Tab cannot focus a `tabindex="-1"` element, so the pane is moving focus itself: `.setting-item` to
`.setting-item`, and into the controls each row contains. A heading drawn as a plain `div` — however correct its
markup, its `aria-label`, its key handler — is not in that walk. Obsidian's own `setHeading` + `addExtraButton` works
*because* the heading is a row.

So: **the row element must carry `.setting-item`** (plus `.setting-item-heading` for a card title). What goes inside
it is ours, and deliberately so — see `buildListHeading`. Our heading holds a name div and a real `<button>`, not
`.setting-item-info` and `.setting-item-control`, because those two class names are what Obsidian's
`@container (max-width: 340px)` query reaches for, and it reaches for them as **descendants**: a card nested inside a
row would have its heading stacked and its title squeezed to `Wid…` whatever the screen size. Obsidian's row for
the pane's keyboard model, our contents for the layout.

Two corollaries, which are the same rule from either side:

- **A row is a tab stop, so a row with nothing to do is a tab stop with nothing to do.** List prose is plain text in
  the card (`.orbis-reorder-note`), not a `Setting` with only a description.
- **A control is unreachable unless a row contains it.** Anything hand-drawn between cards — a heading, a hint with a
  button in it, a floating action — has to be a row or it is mouse-only.

**A row can open into itself.** Where a row's editor is a list of its own, it belongs under the row rather than in a
dialog: a dashboard expands to show its name and its widgets, and only the widget editor is still a dialog. The body
is a child of the ROW element, not a sibling of it, because these lists reorder by moving the row among its siblings —
a body beside the row would be counted as a row by that arithmetic and left behind by the move. Which rows are open
lives on the settings tab (`expandedRows`), so a save that redraws the page does not close what the reader was working
in, and a body is drawn on expand and emptied on collapse rather than built once and hidden — a hidden run of controls
is reachable by Tab and invisible to the eye.

**The price is search.** Those entries are not indexed — the page and its headings still are. A destination
called Wikipedia is found by going to Look-up, not by searching settings for it, and a list that works from a
keyboard is worth more than a row in a search index.

**A focused, enabled `<button>` in settings sometimes never receives the click Chromium should synthesize from
Enter.** `keyActivates` binds Enter and Space directly, with `preventDefault` so nothing runs twice.

The rule: **anything a reader would search for is a declarative row; anything they navigate to and manipulate can
be a page.** Nobody searches settings for "the font size preview"; they search for "font size", and that is a
declarative row.

**`render` callbacks** keep the row declarative — named, indexed, predicate-driven — while we build its innards.
They do not auto-save; the callback saves by hand. The four sliders with paired number inputs
(`bindRealTimeSliderInput`) are `render` rows.

**Imperative `SettingPage`s** are reached from a declarative parent entry via `page: () => SettingPage`: the two
voice pickers, the pronunciation glossary, the notes-style editor. The price is stated in the typings — an
imperative page's contents are not search-indexed — which is why the list is short and every item on it is an
editor rather than a setting.

**The annotation presets manager stays a modal**, opened by an `action` row. It is also opened from a palette
command, the reader's toolbar and the listening bar, and one manager beats a settings page plus a modal that have
to agree. Inside a page an action row is simply a row; at the root, Obsidian draws it in the accent color with no
chevron, which is the correct distinction (a chevron promises a page) — so a chevron is never added to it.

---

## Keyboard, focus and tab order

Every page is checked as it is built, not audited afterwards:

- **Tab order follows visual order**, including after a row rebuilds itself — `rebuildKeepingFocus` puts the focus
  back on the same control after a redraw.
- **Every focused control shows a ring**, in Obsidian's own idiom rather than three competing ones. The mark
  swatches are the known exception: `border` and `box-shadow` are forced off so the colored dot can carry the
  whole appearance, so the ring goes on the dot.

**Obsidian does the rest, for every page opened from a row** (app.js 1.14.4, `openPage` / `closePage` /
`onEscapeKey`): opening a page focuses the page, so Tab reaches its rows; Escape on a control moves the focus to its
row, and Escape on a row goes back one page; going back puts the focus on the row the page was opened from, not at
the top of the parent. None of it is reimplemented here, and an imperative page gets it too.

Declarative rows get the markup, the focus behavior and the ARIA from Obsidian as well.

The wider version of this — one surface, one focus ring, one radius, one spacing across every dialog — is
[Dialog System](dialog-system.md#backlog-one-pass-over-every-dialog). The work is concentrated in the imperative
pages and the `render` rows — which is another argument for keeping both lists short.

---

## Cross-platform

The concern is what these pages look like on Android and iOS against desktop. The reassuring part is structural:
**declarative rows are rendered by Obsidian's own settings machinery**, which is already responsible for looking
right on every platform, so the more that is declarative the less cross-platform surface we own. Orbis's settings
look like core Obsidian rather than like Orbis, and that is the trade being made deliberately.

What we still own, and therefore must check on each device: the imperative pages, every `render` row, and the
settings rules in `styles.css`. A settings change is verified on **macOS, Android and iPad**.

---

## Setup — the first page, and the one first-run experience

The first entry, permanently. It doubles as an index of what the plugin can do, which a flat tree otherwise lacks.
`displayValue` shows the count ("4 of 7").

**No `status: 'warning'`, deliberately.** Obsidian offers no milder status, so the triangle it draws is the one that
means *something is broken* — and "0 of 7" on a fresh install is the correct state of an entirely optional list. It
would never clear for the reader who has simply not decided yet, and it spends a signal needed elsewhere: a warning
belongs on a capability that is on and cannot work, which is actionable and clears when fixed. The count alone says
"there is more in here" without claiming a fault, and this entry is first on the page, so nothing has to shout to
be found.

**Named `Setup`, not "Getting started".** The page has two jobs and only one of them is onboarding: the other
happens a year in, when a reader decides to try Listening and wants to know what turning it on involves.
"Getting started" quietly says *this page was for when you were new*, and it is the wrong shelf to look on for
that second visit. The guide page keeps its own name — `docs/guide/getting-started.md` is a document, not a
control panel.

```
Appearance                     theme · font size · sample              [uncounted, not a task]
Book sources · Look-up · Library dashboards · Reading records · Listening · Save as PDF · Devices
```

**No headings, and no second section.** The page is called Setup, so a "Set up" heading over the tasks is a
stutter that tells a reader nothing they did not just read. Marks and the toolbar are not on it: choosing the
colors you highlight with is a preference, not setup. A checklist that includes preferences teaches a reader that
this page is where preferences live, which in a tree of pages is the opposite of what they need to learn.

**Each name is the capability's own name, spelled as its page spells it.** A description — "Books to read" for Book
sources, "More than one device" for Devices — reads well and teaches a second name for something the reader will
later have to find under the first.

### Three species of item, which is what decides the UI

The items are not one kind of thing, which is why the page is not a flat list of switches:

| Species | Items | What "enable" actually needs |
|---|---|---|
| Consent **and a destination** | library, reading records, book sources, devices | A dialog. Each already has one |
| A per-device **download or choice** | look-up dictionary, a voice, PDF fonts | Nothing to consent to; just do it |
| **Personalization** | appearance, marks, toolbar | Nothing to enable. A preference, never a task |

**A switch cannot answer the first species.** `LibrarySetupModal`, `RecordsDestinationModal`,
`BookSourcesSetupModal` and `SyncSetupModal` all exist for the same stated reason — *a switch reading "on" over a
feature that never got its folder is the lie this dialog exists to remove* — and each asks consent and a
destination in one breath. So an item of that species **opens its existing dialog**; it does not reimplement the
question, and it never writes the flag without asking.

That makes this page a **launcher** for four of its rows, which is the argument for a page over a modal: a
launcher you can return to beats one you meet once and dismiss.

### Appearance comes first, and is not counted

Adjusting the text is the thing a reader is most likely to want from settings, and it is not a task — so it takes
the top slot precisely *because* it is outside the "N of 7". No tick and no state — it cannot be "not done".

**It carries the real controls.** Theme, Font size and the Preview on the Appearance page are `render`
callbacks — a dropdown and a `sliderRow` — and Setup calls the same builders rather than copying them.

**Every one of them edits the SELECTED DISPLAY STYLE, and the item has to say which.** The localStorage keys
(`STORAGE_KEY_THEME`, `STORAGE_KEY_FONT_FAMILY`, `STORAGE_KEY_FONT_SIZE`) are the live view, not the record:
`dispatchStr` writes the key *and* calls `plugin.updateActiveStyle()`, which copies the live values into the
active style — `writeDeviceStyle` for this device's own, `settings.styles` plus a save for a named one.
`switchToStyle` runs it the other way with `applyStyleToLocalStorage`. So the two surfaces that drive these values
— the Appearance page and the in-book display menu — are both editing whichever style is selected, and controls
that never named it would be a trap.

So the item carries one line of context, not another control:

- **Name the active style in a line under the heading** — *These controls change this device's display style.*, or
  *These controls change the "<style>" display style.* for a shared one. Never the style's internal `name` field,
  which holds `device-default`, a label the reader has never seen and should not meet.
- **The style selector itself stays on Appearance.** Choosing among styles is style management; Setup's job is to
  make the text readable, and a second selector would make it a second Appearance page.
- **There is always an active style**, so the line is never empty: `initDeviceStyle` creates this device's own
  during load, and it is the fallback when the stored pointer names a style that has been deleted elsewhere.
- **A new reader is always on this device's own style**, which is why this line reassures rather than confuses in the
  common case, and warns exactly the reader who needs warning — someone with three styles, about to change one of
  them.
- **The line follows the display menu**, or it lies. It joins the path (`styleHandles` / `syncReadingTabControl`)
  that keeps the Appearance page's controls in step with the in-book menu, so it does not go stale the moment a
  style is switched in the book.

**Two rows, in the page's own order: theme, then font size** — an extract of that page, not a rearrangement of it.
Font size is what "make it readable" means. Theme earns its place for a different reason: nobody has to touch it,
since its default matches Obsidian's light or dark mode, but **sepia** is a real capability a reader has no way of
discovering — there is no Obsidian setting it corresponds to, so it is invisible until someone opens that dropdown.
**No font**: the list is eight ordinary faces with no accessibility face among them, so choosing one is taste, and
taste belongs on the page for it. Brightness, margins, line spacing and font are one page away, and the line under
the heading says where.

The sample sits under both and `applyPreview()` tracks every one of them, so the item shows its own effect
without a book open — which matters, because this is the item most likely to be read *before* the reader has
opened anything.

**And it names the gesture the settings page cannot teach.** The control a reader reaches for mid-book is the
toolbar's display menu (`openDisplayMenu()` — a three-level menu built from the reader's own chrome, so it exists
only inside an open book and cannot be opened from settings at all). The item says so, with the glyph inline. The
inline glyph earns its keep here where it does not on the Look-up page: that one describes a bar you have already
seen, this one points at a specific button you may never have noticed.

**No check on the toolbar button.** `showDisplayStyleButton` is per device and can be off, and the line still names
the button. Setup is a first visit, made before anyone has switched a toolbar button off; a reader who has knows
where Appearance is. A row that offered the switch back would be a toolbar setting on a page that is not about the
toolbar.

### The items, and where each one's answer comes from

Ordered by what a new reader needs in order to read a book, not by feature age.

| Item | Action | How status is known |
|---|---|---|
| Appearance | Theme and font size for the selected style, over the sample | Not a task — no status, never counted |
| Book sources | Opens `BookSourcesSetupModal` | Live: acknowledged, and a download folder is set |
| Look-up | Dictionary download | Live: is it on disk — per device |
| Library dashboards | Opens `LibrarySetupModal` | Stored: `librarySetupDone` — declining is a real answer |
| Reading records | Opens `RecordsDestinationModal` | Stored: `recordsSetupDone` |
| Listening | Pick a voice; Piper downloads on first use | Live, per device |
| Save as PDF | Font download | Live, per device |
| Devices | Opens `SyncSetupModal` | Stored, per device |

**Devices goes last, not first.** It is the least relevant item to someone opening their first book, and the only
one that needs a second tool Orbis does not provide.

**The library item is a question, not a task**: "would you like a library — a catalog of everything you have, in
notes you own?", yes or no. It belongs here because it is the one item whose honest answer for many readers is
*no* — someone who opens books from the file explorer should never meet a collection — and because the cost (a
note per title) is worth saying before the icon appears rather than after.

### One shape for "is this set up?"

Underneath the page, the same question is stored four unrelated ways:

- `librarySetupDone` and `recordsSetupDone` — fields in `data.json`, so they **sync**
- sync's `setupDone` and multi-device's `asked` — `device-store`, so they **do not**
- Book sources — **no flag at all**, inferred from "a download folder is set" (see `main.ts`, the comment on
  there being no `sourcesSetupDone`)
- the three downloads — ask the filesystem

So a registry of items (`setup-items.ts`) returns each one's state and its action in one shape. It is testable as
data with no UI at all.

**Status is computed live, not stored**, except where declining is a real answer. Three items are per-device
downloads, so a second device legitimately has work to do again and a synced "done" flag would lie to it.
`recordsSetupDone` exists because "never asked" and "deliberately declined" look identical from the data.

**There is no per-item dismissal.** An × meaning "not for me" would mark an item as answered without setting
anything up, and there is no warning badge for it to clear. It would also read wrong: × means close or delete, so
beside a row named "Book sources" it would offer to delete the feature, which is the one thing it could not do.
The count says how much of Orbis this device is using rather than how many decisions have been made, and the lead
sentence at the top of the page says once what an icon would say seven times.

**Items carry their own controls** where they have any, built with `render` from the same code as the real row.
Linking out would keep one place to change a setting, but there is no way to come back (see
[No public deep links](#no-public-deep-links-and-this-page-is-the-mitigation)), and a checklist that
scatters you across the tree is worse than one that repeats a control. Repetition is only honest if the item calls
the *same builder*; hand-copied rows drift.

### First run — see [First run](first-run.md)

The greeting a new reader meets, and the release notes that share its moment, live in their own document: it fires
from `onload`, it competes with the multi-device offer, and it turns on a per-device value holding the version last
seen. What belongs here is only the consequence for this page — **Setup is where the greeting sends you**, and it
is the standing reminder afterwards, which is why the entry carries a count.

### No public deep links, and this page is the mitigation

`app.setting.openTabById()` — used in two places, both cast through `unknown` because it is not in the public
typings — lands on the plugin's **start page**, never a section. The public API has no navigation at all:
`SettingPage` renders and hides, `SettingDefinitionPage` declares an entry, `SettingGroup` is a rendering helper,
and nothing opens a page. So no item can send a reader to a row, which is exactly why items carry their own
controls, and why the four items that need consent and a destination open their existing dialog instead — a
dialog closes back onto where it was opened.

**One internal call, for pages.** In 1.14.4 the settings modal has `openPagePath(tabId, path)`, a list of page
ids, a page without one matched by its name; Obsidian's own *Configure toolbar* command and its settings search
use it. `openSettingsPage` (`settings-nav.ts`) wraps it, and two buttons outside settings use it: the welcome's **Open
setup** lands on Setup, and the Voice and source dialog's **Open Listening settings** on Listening. Where the
method is missing, each opens the start page instead — a reader one selection short, never a broken link.

Setup's items do not use it: the back arrow climbs the tree rather than retracing the trip, so a jump from Setup to
a row on Listening would come back to the Orbis page, not to the checklist. And none reaches a row: a page is as
deep as a link goes.

What does work: **settings search pinpoints a row inside a sub-page.** Searching "backlin" lists the
Backlinks row with its page path, and following it navigates into the page and highlights that row; nesting inside
a `group` does not hide it. A reader can reach any row by typing; we simply cannot send them there. So depth
costs nothing in findability, and the tree is free to be organized for browsing rather than for retrieval.

---

## What this costs

- **Async work stays out of the builders.** `getSettingDefinitions()` runs on every `update()` and must be cheap,
  so state that takes an `await` — whether the dictionary is downloaded, how big it is — is cached and refreshed
  by `update()`.
- **A description describes the setting, not its answer.** A row's description sits in the info area beside its
  name, so one that changes with the row's own value is a label echoing the control next to it — which already
  shows the answer. Varying with a DIFFERENT setting is fine and often useful — "Include images" says where the
  images land, which genuinely depends on the export format above it.
- **Naming is user-facing.** Search matches `name`, `desc` and `aliases`, stripped of the heading that gave a row
  its context, and aliases must be translatable — an English-only alias list makes search work in English and fail
  everywhere else.
- **Each imperative page owns its own `hide()`.** Tearing down the live voice picker, stopping a preview and
  unsubscribing from the voices store are each page's job; miss one and a preview keeps playing after you
  navigate away.

---

## Building on the declarative API

`getSettingDefinitions()` replaces `display()` wholesale — half a tab cannot be declarative. A page can still be
imperative: `page:` opens a `TabPage` whose `display()` builds into its container. `TabPage.display()` empties
first, or a re-render appends a second copy of the section, and `renderSettings()` re-renders the open page and
nothing else.

**Rows and controls:**

- **Icons force `render`.** A declarative row's `name` is a plain string with no icon slot, and toolbar rows carry
  the glyph of the button they govern. `render` keeps them and stays indexed for search; it gives up the automatic
  save, `validate`, and the `disabled` predicate. The rule: `control` for text, number and dropdown rows and for
  anything whose value can change from outside settings; `render` freely for toggles, custom layout and icons.
- **Grids are ordinary rows**, which is what makes "backlinks" and "time remaining" findable.
- **A disabled row is marked but not dimmed.** Obsidian sets `.setting-item.is-disabled`; nothing grays it.
  Rather than restyle the host app from a global stylesheet, the row that locks says why in its `desc` — better
  than a visual cue, which leaves the reader to guess the rule. That costs an `update()` rather than a
  `refreshDomState()` after those writes, because a `desc` is built in `getSettingDefinitions()`.
- **Groups can vanish.** The panel tabs go with the content panel and the readouts go with the indicator, rather
  than dimming five or six rows that silently refuse clicks.
- **A page entry can carry a value, and should.** The Listening entry names the chosen voice through
  `displayValue`; a voice not on this device reads *Amy · not downloaded*, with no warning marker (see
  `status` above), and Recorded voice names the voice the next recording would use, the same way. An entry holds a name, a
  description and a value and nothing clickable, so *hearing* the voice needs its own row beneath it.
- **A dropdown control always hands back a string.** `skipBackSeconds` is a number union, so a raw write would put
  `"15"` into `data.json`. `coerceSettingValue` narrows on the way in.
- **A `gen.` key prefix reaches localStorage.** Recording config is per-device on purpose (a server URL is a LAN
  address, Piper voices are per-device downloads), so `getControlValue`/`setControlValue` dispatch on the prefix.
- **The resolver handles nested objects**, so `bookExport.imageFormat` and `recordKinds.passages` bind as ordinary
  control rows.
- **`type: 'folder'` does not replace a folder picker.** It suggests existing folders and cannot create one, and
  exporting to a folder that does not exist yet is the ordinary case.
- **Sub-pages are for editors, groups are for settings.** Listening and Annotations both mix them: `page:` entries
  for the voice pickers, the glossary and the notes-style editor, groups for the rows that are only rows. Search
  reaches a row either way, so the split is about what is worth navigating to.
- **Adopting a host class means taking all of it.** A hand-rolled `.orbis-dropdown` that reproduces some of
  Obsidian's properties misses the chevron, which is how a select ends up looking nearly right. The `dropdown`
  class brings the chrome and its width, which out-specifies our own cap at equal specificity; taking one property
  back costs a more specific selector.

**A setting is a default the dialog opens on and may depart from for one run; nothing a dialog is given is written
back.** An export that rewrote a row on the settings page would surprise the reader who had just read it, and one
rule for every export setting is easier to learn than a rule plus exceptions. Each page says so in one line: *the
export dialog starts from these answers*. The default recording voice (`GenConfig.method`) follows the same rule:
settings state the default, and the recordings dialog keeps a per-run choice. The glossary's preview buttons pick a
text FRONTEND, not a preference, so they are labeled by engine.

**Build lifecycle:**

- **`getSettingDefinitions()` is a factory, not a one-shot.** It runs on every `update()` and once at
  registration. Anything the definitions close over that must survive *across* builds belongs on the instance — a
  handle bag created inside it leaves a sync callback pointing at one set of components while the ones on screen
  belong to another. The stronger form is not to store a callback at all: make it a method that reads an instance
  field, and there is no assignment to be stale and no order to get right.
- **Build into `controlEl`, never `settingEl`.** Obsidian clears a row's control area before re-running a `render`
  callback and leaves the row element alone, so anything appended to `settingEl` survives every rebuild and
  multiplies. Everything that goes in through `setting.addX()` is safe because that is the part which gets cleared.
- **`refreshDomState()` for state, `update()` for structure.** Predicates re-run in place; anything built *in*
  `getSettingDefinitions()` needs a rebuild. That includes a description that changes, and a dropdown's options —
  a folder created from a picker's `+` would otherwise be saved correctly and still show `/`, because its option
  list was built before the folder existed.

**Lists:**

- **Reordering needs arrows as well as drag.** A drag handle alone is unreachable from the keyboard, and
  `dragstart` never fires from a finger. Same contract either way — a handle for pointers, arrows for everyone.
- **Delete is not on every row.** Built-in destinations cannot be deleted, so delete lives in the edit dialog,
  which opens from a pencil that only exists on destinations you added. An affordance that only ever refuses is
  worse than no affordance.
- **Optional controls go on the outside.** Controls append left to right, so a pencil that only some rows have
  must come first, or it shifts that row's arrows and toggle out of line with every other row.
- **Destinations are one ordered list, a toggle per row** — not an active list and an inactive one. With one list
  the order simply is the order, and a destination you switch off keeps its place instead of returning at the end.
- **`wireListDrag` is built on Pointer Events**, so dragging works with a finger, for the lists that do not use
  `renderReorderList` — the preset marks, the EPUB chapters, the generate-notes order. The arithmetic is
  `list-drag.ts`, pure and tested: clamping past the ends, a gap resolving to the nearer row, a shared boundary
  always resolving the same way so a pointer on an edge does not flicker, and an empty list returning -1 rather
  than a valid-looking 0.
- **Three things each look like "drag does not work"**: without `touch-action: none` on the handle the browser
  claims the gesture as a scroll before the second `pointermove`; without pointer capture a finger leaving the
  handle stops delivering moves; and without a movement threshold every tap is a zero-distance drag.
- **The handle is a 40px box**, on the shared class, at the **trailing edge** with Obsidian's own glyph, matching
  the declarative lists. A handle of a few pixels of text makes a near-miss land on the ROW, where `touch-action`
  does not apply and the list scrolls — so a miss looks like the feature misbehaving rather than like a miss.
- **A note style's `sectionOrder` is edited from two places** — the settings page and the generate-notes dialog —
  so the two change together; one gaining a behavior the other lacks is how they drift apart.

**The presets dialog**, where each lesson has the same shape — a control placed after a list it makes longer:

- "Add mark" sits above the list, where Obsidian's own lists put their `+`; below it, a long list pushes it out of
  the dialog. Capping the list's height instead leaves the dialog its scrollbar and grows a second one inside it.
- The preset verbs have their own full-width row, which gives the same shape on every screen instead of wrapping by
  width into an accident per device.
- The default preset cannot be hidden. Hiding keeps a preset out of the list you assign from; the default is the
  one every book gets *without* being assigned, so a hidden default is a preset you can neither pick nor avoid.
  Promoting a hidden preset unhides it, closing the other way in.

**Orphan audits.** `pnpm lint:orphans` (`scripts/check-orphans.ts`), in the gate and in CI, finds i18n keys and
`orbis-*` CSS classes with no reference. `fallow` reads TypeScript exports, not stylesheets or translation tables,
so nothing else catches either drifting. The interesting part is the whitelist. A name assembled at runtime is a
real use no literal search can see: `` t(`presets.builtin_mark_${key}`) ``, the plural helper's `_one` variants,
`frontmatter.*` and `tokens.*` through their resolvers, `` `orbis-search-kind--${kind}` ``. The remaining findings
are baselined, so the audit's job is to stop the next one, not to force a cleanup. Adding a stem is the right fix
when the audit is wrong; deleting a live key because it said so is not.

### Checklist for a settings change

1. Full gate: `tsc`, `pnpm check`, `eslint src`, `lint:i18n`, `lint:a11y`, `lint:md`, `vitest run`.
2. Definition tests for the new page (below).
3. Keyboard pass: Tab order, focus ring, and focus kept across a redraw.
4. Device smoke test: macOS, Android, iPad.
5. Guide pages the change invalidates, updated in the same commit.

### Tests the tree makes possible

`getSettingDefinitions()` returns **data**, which a DOM-building tab cannot. A definition test can assert that
every `control.key` resolves through `getControlValue`, that no key is used twice, that page names are unique
among siblings (path navigation misbehaves otherwise), and that every row has a name. That is a whole class of
mistakes caught at no cost.

---

## Open

- **Documentation hosting** — `docs/guide/` published with GitHub Pages from the same repository that hosts
  releases, so a feature and its documentation land in one commit. `docs/design/` is never published: it is
  rationale for maintainers and would confuse a reader looking for instructions.

---

## Decisions

| Decision | Chosen | Why |
|---|---|---|
| Settings API | Declarative `getSettingDefinitions()` | The only route to Obsidian's settings search |
| `minAppVersion` | 1.14.4 | Declarative settings need 1.13.0; Obsidian updates itself on every platform |
| Dual support (`display()` beside definitions) | Rejected | Two implementations that must stay in sync |
| Navigation | Drill-down pages | Native to the API, works on a phone, index doubles as a map |
| Dropdown navigation | Rejected | Hides the map, no Obsidian precedent, does not shorten anything |
| Defaults in settings | Kept and surfaced | `displayValue` makes the index a summary; removing them would only fix burial |
| Notes and Export as categories | None — Annotations and Conversions instead | An annotation is everything a reader adds, and what becomes of it belongs with it; Reading records is not an export |
| Conversions | Its own page | The direction varies: EPUB reads notes and writes a book, the other two read a book |
| Developer options | Revealed by palette command | Hidden from those who do not need it; no row to explain |
| Per-device labels | Shown only when devices > 1 | Silent for single-device users, appears when it becomes true |
| First-run page | Named `Setup`, not "Getting started" | Its second job is the visit a year later, when you add a capability |
| Setup | A page, not an onboarding modal | Re-openable for free, no second UI to maintain |
| Setup status | Computed live where it can be | Per-device downloads make a synced "done" flag a lie |
| Per-item dismissal | None | There is no badge for it to clear, and × reads as delete |
| Setup items with consent | Open the dialog that already exists | A switch cannot ask where hundreds of notes go |
| Appearance on Setup | First, uncounted, real controls inline | Most-wanted from settings, and never a task |
| Which style those edit | The selected one — named in the item's `desc` | Every change lands on the active style; unnamed, that is a trap |
| First run | One welcome dialog, at load | See [First run](first-run.md) — trigger, flag and ordering live there |
| Setup entry status | No `status: 'warning'` | 0 of 7 is the correct state of an optional list; the triangle means broken |
| Make it yours group | None; marks and the toolbar are not on Setup | Choosing highlight colors is a preference, not setup |
| Mark roles | Stay in the presets manager | Per-preset with per-book override; not one global value |
