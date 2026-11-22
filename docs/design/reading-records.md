# Reading Records

One vault note per piece of saved content, plus `.base` views over the result — so everything you capture while
reading is queryable in Obsidian without an export step.

The schema, the batch exporter, the filesystem layout, both bases and the `recordsFolder` setting live in
`annotation-records.ts`, `RecordExporter.ts`, `cfi-sort.ts`, `records-base.ts` and `record-book-name.ts`. Two things
are **declined** — a cards view and per-group `summaries` — and have sections of their own below.

---

## Not the same thing as Notes Export

This is a separate capability, not a third output mode of [Notes Export](notes-export.md). Keeping them apart
is a design constraint, not a filing preference:

| | Notes Export | Reading records |
|---|---|---|
| Produces | A document you **read** — chapter headings, quoted passages, publishable | A database you **query** |
| When | On demand, once per export | Continuously, as you annotate |
| Scope | The book you ran it on | Configured once for the vault, and per book |
| Shape | One file, or one per chapter | One file per selection / note / bookmark |
| Machinery | Merge / replace / version, `NotesFileSet`, diff modal, line templates | Frontmatter and a marker. That is all |

So reading records have their **own settings section** and their **own folder setting**, and **none** of the
note-export apparatus: no merge modes, no file-set tracking, no line templates. The only things shared are
`buildDeepLink()` and the annotation data itself.

**Off by default, with no assumed folder.** This writes hundreds of notes into someone's vault, which is not
something to start doing because they installed a reader — so both the switch and the destination are explicit
choices. `recordsFolder` starts empty rather than defaulting to `Reading records`.

### The destination is asked, not assumed

An empty `recordsFolder` has no honest representation in a `<select>`: a dropdown cannot show a value that is not
one of its options, so it would fall back to the first, and **`/` would impersonate a decision nobody had made**.
The vault root is also a poor answer by accident: the records root grows `content/` and **one base per book**, so at
the vault root that is a `content/` folder and a `.base` for every book you read, at the top level.

So the emptiness is a *trigger*: `RecordsDestinationModal` asks the question once, and it fires when

- the mode leaves **Off** while the destination has not been answered (`recordsSetupDone` is false) — the mode is
  not applied until the question is answered, and dismissing leaves records off with a notice saying so, because a
  dropdown left reading "On" over a setting that stayed off would be a lie; and
- **a write is attempted** with a `global` location and no shared folder — which covers a vault where the mode never
  changes and settings' own first-run question never fires. The refusal becomes the question, the same move as
  opening the per-book dialog instead of complaining about an unanswered book.

The dialog asks the same three questions as the settings section, in the same order: where each book's reading
record goes (*In one folder for every book* or *Beside each book*), the folder for reading records (only when
the records use it), and the folder for the base covering every book, with *Don't create one* as an answer. The
folder proposed is `Reading records`; saving with it is a real answer, the point being that a choice was made.

**"Beside each book" still asks for the base's folder**, because there are two facts here and "where do the
records go" only settles one: the base that covers every book needs a folder **even when no records do**. Leaving
that implied would mean choosing this option silently declined the cross-book view — the whole reason Bases is in
this feature.

**The proposal is matched case-insensitively, and adopts the reader's casing.** A vault holding `Reading Records`
and a constant reading `Reading records` are the *same* folder on macOS and *different* folders on Android and
Linux — so insisting on our casing would reuse their folder on one device and create a near-duplicate beside it on
another. `proposedFolder()` looks for a case-insensitive match and uses its real path when there is one.

The every-book base is named `!Reading records.base` from the constant rather than from the folder, so adopting a
differently-cased folder does not change the filename — the same reason it survives the folder being renamed.

**The folder is created when the question is answered**, not lazily on the first write. The folder should exist
the moment Save is pressed: it appears in the explorer, the settings row shows it like any other, and nothing is
waiting on a highlight to make the choice real. `ensureVaultFolder` is awaited before the answer is handed back, so
the caller's re-render sees a folder that exists. The cost is an empty folder left behind if the reader immediately
turns records off again, which is trivially deletable.

**A picker must be able to display every state its setting can be in.** A `<select>` set to a value that is not one
of its options lands on `selectedIndex = -1` and renders **blank**, which reads as "nothing saved". So
`folderOptionsWith()` in `ui-utils` adds an entry for a folder that is named but absent — **"<name> (created when
first used)"** — and the notes, EPUB, book-export and pronunciation folder pickers use it too, since each can show a
blank control for a folder deleted after being configured. `/` stays selectable — it must never be the default, but
a reader may choose it.

**The pending entry's wording follows the caller, not the helper.** "Created when first used" is true of a settings
row, where the next export makes the folder. It is false in the destination dialog, which creates its folders on
Save. So `folderOptionsWith()` takes an optional key and the dialog passes one reading **"<name> (will be
created)"**.

**Both folder pickers in the dialog carry the "+" new-folder button** (`folderPickerRow`). Without it the only way
to answer with a folder that does not exist yet is to abandon a half-answered dialog, make the folder in the
explorer and start over. `NewFolderModal` lives in its own file, because the settings tab imports this dialog and
importing the settings class back would be a cycle. It stays a real `Modal` rather than an Orbis popup: it can open
from inside Obsidian's own Settings modal, which swallows keyboard input aimed at anything outside its DOM tree.

It has a text field, and Obsidian centers a Modal vertically and sizes it to content, which on Android puts the
field under the keyboard. So it uses the shared `pinModalAboveKeyboard` rather than a local `top`, because it opens
as a *second* modal over the destination dialog: the pin registry hides whatever is underneath while it is up,
since two stacked dialogs on a phone cannot both be readable and a repositioned parent paints over its own child on
Android. The reader-pane height lock it needs is threaded from whoever has the plugin — Settings and the reader's
write path both do — because this dialog can open with a book behind it.

### Plain Settings, and no custom layout

The section is ordinary `Setting` rows — the mode, the location, the folders and one per kind — with **no custom
layout CSS**. Long dropdown rows reuse the `orbis-setting-stacked` class that "Notes folder" and "Include images"
use, so each row is laid out by the same code as its neighbors and matches them by construction rather than by
resemblance.

A hand-built layout cannot match: **Obsidian renders a hidden measuring clone of every dropdown** —
`<select class="dropdown is-measuring" aria-hidden="true">` — and sizes the real one from it through
`--dropdown-fitted-width`. The clone is a flex item, so a folder row's geometry depends on an element that is
neither visible nor documented. **Obsidian's settings DOM contains elements that are not in the docs and not on
screen**; reusing its components is reliable, reproducing their layout is not.

---

## Vocabulary

**"Reading records"** is the working name for the collection.

"Annotations" is wrong here: an annotation is a remark *about* text, and a bookmark is a place. The word is also
already load-bearing in the code (`AnnotationMark`, `annotation-presets.ts`) as the umbrella for marks, so
reusing it for the vault artifact would collide.

**Three levels, and the difference between them is load-bearing:**

| Level | Term |
|---|---|
| One Obsidian note | a **reading record note** |
| One book's set of them | that book's **reading record** |
| Every book's | **reading records** |

A book has exactly **one** reading record, so the rule that falls out is: **count notes, never records.** Copy
that says "moves 12 records" is wrong; "moves 12 notes" is right. The vault-level setting is plural because its
subject is every book; the per-book dialog is titled "Reading record settings" because there it is singular.

**"Saved content" and "reading records" are different things, and both words stay.** Saved content is what lives
in the book, shown in the content panel whether or not this feature is on; a reading record is what the vault
holds because of it. Renaming the panel to match would make its label describe something that need not exist.
The sentence that keeps them straight: *a reading record writes your saved content into the vault as notes*.

### Selection is the genus; passage and note are the species

`kind` values are `passage selection | note | bookmark`.

"Highlight" is wrong whenever the treatment is an underline, a squiggle or a box — which the two-channel mark
system makes ordinary. "Mark" cannot be used for it: a mark is the *classification* applied to a selection, so
`kind: mark` beside `mark: "Follow up"` would be incoherent.

Advanced search uses "selection" for the passage a note hangs on, so "Selections" for highlights would sit beside
"Note selections" — incoherent, since a note selection *is* a selection. So **selection is the genus** — text
singled out of the book — and the two species are the passage that carries no note and the passage a note hangs on:

| Scope button | Result chip | `kind` |
|---|---|---|
| Book text | Book text | — |
| Passage selections | Passage selection | `passage selection` |
| Note selections | Note selection | `note` |
| Note text | Note text | `note` |

The four scopes are not 1:1 with three kinds — both note scopes search the same kind, different fields.

**`kind` is the two-word compound, not bare `passage`.** These values are user-visible — Bases shows them as
group headers and in the `Kind` column — and "passage" alone does not convey what it is. Nor can the value be
`selection`: with selection as the genus, using it for one species reclaims the shared word and recreates the
ambiguity this naming exists to remove.

**`{{selection}}` means selected text**, which is true of both species.

**Not renamed:** the `Highlight` TypeScript type and the `highlights` array in `.orbis` files. Those are on-disk
data with no user-visible name, so churning them buys nothing. "Highlighter" stays the word for a mark's **fill**
channel — that one really is a highlighter, and a mark drawn as an underline simply has no fill.

---

## Why Bases

Every reasonable grouping request — by chapter, by mark, by mark then chapter, filtered to one mark, sorted by date,
only the last month — would otherwise be code: a bespoke reporting engine, ours to write and maintain forever.

Bases is a core plugin that already does that job. Exporting one note per item with the right frontmatter moves
presentation out of the plugin entirely: the reader regroups their own content without us shipping a release.

It also settles a question a document cannot answer. Grouping by mark has to place things that **have no
mark** — bookmarks never do, and a note without a selection has none by design. In a document that needs an
invented "Unmarked" heading and a ruling on whether bookmarks belong under it; in a view an empty property is
simply an empty group.

Nothing here *calls* a Bases API; `.base` files are text we write, so an Obsidian without Bases sees a file it
cannot open rather than a broken plugin.

---

## Filesystem layout

The root comes from the `recordsFolder` setting; the destination dialog proposes `Reading records`.

```text
Reading records/                      ← the user names this; the dialog proposes it
  !Reading records.base               ← global, every book
  First-Open.base                     ← one per book
  parts-and-chapters.base
  content/
    First-Open/
      passage selection — The weir was louder after the rain — 8f2c4a.md
      note — The lamps along the quay were lit early — 3d91f0.md
    parts-and-chapters/
      …
```

**The root folder is the feature's interface.** Bases are what you open; `content/` is data you never browse.
That is what justifies a base per book — those files are entry points, not clutter. Nesting each base inside
its own content folder would be tidier and useless.

**`!` sorts first.** Obsidian's explorer shows folders above files, so a global base sitting beside the book folders
would land at the *bottom*; the prefix fixes it. Locale collation sometimes ignores leading punctuation; Obsidian's
explorer does not.

**A book's folder and base name come from `recordBookName()`, not from its title.** Two editions of one book, or two
books both called *Sample Book*, produce one filename from a title. The name is derived from the book's own file
path, taken verbatim rather than lowercased, which keeps three names identical: `First-Open.epub`, its content
folder, and its base.

### Two books with the same filename

A basename is unique within a folder, not across a vault: `Library/Fiction/sample-book.epub` and
`Inbox/sample-book.epub` would both want `content/sample-book/` and `sample-book.base`. Sharing them would interleave
the two books' records in one folder, make the per-book `inFolder` filter cover both, leave the second book with
**no base at all** (a base is never overwritten), and merge them into one `book_title` group in the global base.

So the name is the **shortest unique path suffix**: the filename when it is unambiguous, otherwise the fewest parent
folders needed to tell the colliding books apart.

```text
Library/sample-book.epub  (alone)                            →  sample-book
Library/Fiction/sample-book.epub + Inbox/sample-book.epub    →  Fiction — sample-book  /  Inbox — sample-book
a/shelf/sample-book.epub + b/shelf/sample-book.epub          →  a — shelf — sample-book  /  b — shelf — sample-book
```

Rather than always slugifying the full path, as `noteSetSlug` does for the per-chapter MOC:

- The root folder **is** this feature's interface, so `Library-Fiction-sample-book.base` charges every reader for a
  problem most vaults never have.
- It is **deterministic and order-independent** — the name follows from the vault, not from which book was
  exported first, so two devices agree without coordinating.
- It is **symmetric**: when two books collide, both get qualified. Privileging whichever was seen first would
  make the name depend on history.

The separator is ` — `, matching a record's own filename, so a qualified book name reads as part of the same
scheme rather than a second convention. Each segment is sanitized on its own — sanitizing the joined string
would eat the separator.

**Two formats of one book keep two sets of records.** A record mirrors an annotation, and annotations live in the
book's `.orbis`, at positions only its own format understands; with one `.orbis` per format (see
[Reading progress](reading-progress-system.md)), one shared records folder would let either format's export flag
the other's records as orphaned. The format appears in the name **only when two formats sit together** —
`sample-book (EPUB)` and `sample-book (AZW3)`, while a book in one format keeps the plain `sample-book`.
`recordStem` decides it, and `recordBookName` builds on it, so folders and format qualify independently. Adding a
second format later renames the first one's records folder — a move, not a loss.

It terminates: a path that runs out of segments falls back to its whole path, and two distinct paths cannot
share one. A root-level book with no parent to borrow keeps the bare name while the nested one qualifies.

**The name follows vault state**, so adding a second `sample-book.epub` later renames the first book's folder. That
is a folder move rather than data loss — a record's identity is `orbis_id`, and `book` is a link Obsidian
maintains — and it wants the same reconcile action as [renaming a book](#open-questions), which is the other way
these names go stale.

---

## Frontmatter schema

The durable commitment. Readers write their own views and formulas against these names, so renaming one later
breaks their work. Names reuse the line-template placeholder tokens wherever they mean the same thing.

| Property | Example | Notes |
|---|---|---|
| `kind` | `passage selection` | `passage selection` \| `note` \| `bookmark` |
| `excerpt` | `"Is nobody going to tell me where it went?" asked…` | The passage, readable, capped at 200 with an ellipsis; a bookmark's is the words at its anchor (`Bookmark.text`), or its label if it predates them |
| `mark` | `Follow up` | The mark's name. **Empty when there is none** — a valid permanent state, and the group Bases shows for it |
| `mark_badge` | `🟡➖` | Stands in for the mark where color cannot be shown |
| `book` | `"[[fixtures/annotation-workhorse.epub]]"` | A link, for navigation and backlinks |
| `book_title` | `Annotation Workhorse` | Plain text — grouping by a link would show link markup as the group name |
| `author` | `Orbis Tester` | |
| `chapter` | `CHAPTER IX.` | The readable one |
| `chapter_index` | `10` | Reading order of chapters. A position in the table of contents, not a chapter number |
| `loc` | `51` | Number, so it sorts numerically. Not a sort key — see [Reading order](#reading-order) |
| `cfi_sort` | `00006.00004.00004.00048.00001:000000` | Reading order **within** a chapter. Opaque, never displayed |
| `created` | `2026-08-04` | ISO, matching `{{today}}` rather than a second date format |
| `link` | `[loc. 51](obsidian://orbis-nav?…)` | Markdown — renders clickable in a **table** cell, and in the record's body |
| `link_url` | `obsidian://orbis-nav?…` | Bare, for an `html()` formula to build an `href`. See [Links](#links) |
| `note_text` | `Some note I'm adding.` | Notes only |
| `cover` | `"[[…/annotation-workhorse.jpg]]"` | The book's cover, for `image:` in a view of the reader's own. See [Covers](#covers) |
| `orbis_id` | `h_8f2c4a` | The item's id. Identity, never edited |
| `orbis_cfi` | `epubcfi(/6/4!/4/630,…)` | For re-resolution; not for reading |
| `orphaned` | `true` | Always written. `true` = the item is gone from the book and the record was kept anyway |
| `tags` | `[orbis-reading-record]` | **One** tag, not a taxonomy. Per-mark tags would explode and duplicate `mark` |

Two properties duplicate the body on purpose, because **Bases cannot read a note's body** and a column needs a
property: `excerpt` and `note_text`. Both are written in the same pass from the same source and cannot drift.

`excerpt` exists rather than a `file.name` formula because a filename must be sanitized:
`"Is nobody going to tell me where it went?" asked` arrives as `Is nobody going to tell me where it went asked`, and
punctuation stripped from mid-sentence reads as broken English. A filename has to be sanitized; a column does not.

---

## Reading order

`chapter_index` orders the chapters. `cfi_sort` orders items **within** one chapter. Both are hidden.

`loc` is **not good enough** as the second key. A location spans many paragraphs, so several selections in one
chapter routinely share one; when the sort ties, Bases falls back to `file.name`, which for a record begins with
the kind and then the passage — so the rows come back alphabetized.

`cfi_sort` (`cfi-sort.ts`) flattens a CFI into a string whose ordinary sort equals document order:

```text
epubcfi(/6/4!/4/48,/1:0,/1:92)  →  00006.00004.00004.00048.00001:000000
```

Fixed-width fields, because the entire trick is that lexical order equals numeric order — `"10"` precedes
`"2"` as text. Range CFIs collapse to their start, matching how reading order is decided everywhere else in the
plugin. The tests check it against foliate's own `compare()`, including the shallow-before-deep case, where a
shorter key is a prefix of the longer one and a prefix sorts first.

**Why a string and not a sequence number.** An integer 1..N per book would be readable, but *unstable*: insert a
selection in Chapter III and every later record's number changes, so one new annotation rewrites hundreds of files.
Live export is global and always on, and that is sync churn on every highlight across every device. `cfi_sort`
depends only on the item's own CFI, so **a new item writes exactly one file, forever**.

### Two collation traps

Both are in the tests.

- **A punctuation sentinel is not "last".** Under locale collation — what `localeCompare` and, as far as we can
  tell, Bases use — punctuation carries a variable weight: `'~'.localeCompare('0')` is **negative**, so `~` sorts
  *before* digits even though it follows them in code-unit order. The unplaceable-CFI key is therefore a digit run.
- **Fixed widths are what make the rest immune.** A collation that ignores the `.` and `:` separators entirely
  still compares the same digits at the same positions, so the key survives either sorting scheme.

---

## Body, and the marker

```md
> "The weir was louder after the rain, and nobody on the quay slept,"

The note I typed in the reader.

<!-- Orbis: everything above is regenerated from the book. Your own notes go below. -->

My commentary, safe from here down.
```

Everything **above** the marker is derived and rewritten when it changes. Everything **below** is the reader's
and never touched.

A marker is needed because the simpler rule — "the body is written once, thereafter only frontmatter" — is too
strict: note text is *derived*, edited in the reader, and that edit has to reach the file. So the body cannot be
wholly the reader's, and the boundary has to be explicit. Three properties make it safe:

- **An HTML comment, not visible text.** A line reading "do not edit above here" is the plugin talking inside
  someone's note; it renders in reading view and travels into anything built from it. A comment is invisible
  rendered and plain in edit mode — exactly when it matters — and carries its own explanation.
- **No marker means no body writes at all.** Someone will delete it. That must be an opt-out of updates, never
  a way to lose work, so the safe direction is to leave the body alone.
- **Rewrite only when the derived region differs.** Otherwise every run touches every file, for sync traffic
  and no change.

**Note text is one-way.** It lives above the line, so editing it *in the file* is overwritten on the next write.
The reader is the source of truth. Worth saying plainly in user docs, because the failure is silent.

---

## File naming

```text
passage selection — The weir was louder after the rain — 8f2c4a.md
note — The lamps along the quay were lit early — 3d91f0.md
```

**Kind first**, which groups the kinds in the file explorer — the reason to have it in the name at all. Then a
sanitized ~60-character excerpt, because paths have length limits and a passage can be 300 characters. Then a
short id, which is what actually makes the name unique and stable. The passage never changes, so the name never
needs to — which matters because renaming a file breaks every link into it.

Since sorting is explicit in the base, the filename carries no sort duty, so `kind` can lead it freely.

---

## Links

`buildDeepLink()` returns **markdown**, not a URL:

```ts
return `[${loc != null ? `loc. ${loc}` : 'View in book'}](${url})`;
```

**Bases renders markdown in a TABLE cell — and only there.** Putting `link` in a table view's `order:` gives a
working one-click jump with no formula at all. In a **list** or **cards** view the same property renders as its
raw string, and a percent-encoded CFI is about the ugliest thing that can land in a row.

So a record carries the destination twice:

| Property | Shape | Renders in |
|---|---|---|
| `link` | `[loc. 51](obsidian://…)` | Table cells, and the record's own body |
| `link_url` | `obsidian://…` | Nothing by itself — it is what a formula builds an `href` from |

That duplication is the same trade, for the same reason, as `book` beside `book_title`: one shape renders, the
other is machine-usable. `positionProps()` derives all four position fields — CFI, sort key, and both link
shapes — from one CFI, so they cannot diverge. `link` cannot serve as an `href`: it is already markdown, so an
anchor built from it points at the literal `[loc. 4](obsidian://…)` and does nothing.

**An `html()` formula renders in all three layouts**, which is how list and cards get a link at all:

```yaml
formulas:
  Open: html("<a href='" + escapeHTML(link_url) + "'>↗ Open</a>")
```

`escapeHTML` because the URL's `&` separators belong as `&amp;` inside an attribute; the escaped href navigates
exactly as the table's `link` column does, prompt included.

**A view uses one or the other, never both.** Tables use `link` — "loc. 51" tells you where you are going, "↗ Open"
does not — and lists use `formula.Open`. `link` in a list view puts a line of raw percent-encoded CFI directly
above the working `↗ Open`.

**Never put `excerpt` inside `html()` unescaped.** Book text is untrusted input, and a passage containing `<` would
inject into the cell.

**The permission prompt is Obsidian's.** Clicking an `obsidian://` link raises *"Run action from external
link?"*, with a **"Don't ask again for orbis-nav"** checkbox that makes it one-time per vault. Not suppressible
by a plugin, correctly, and not specific to Bases — the same prompt guards a deep link in a notes file. Worth
one line in user docs.

### A record is a navigation destination

Because a list or cards view cannot render a link, clicking a row there opens the **record note**. So the record
has to be somewhere worth landing: `derivedBody()` ends with the markdown link, below the passage and any note
text. Without it the two-click path dead-ends one step short of the book.

It also makes a record useful on its own, since live export writes them continuously.

---

## Bases syntax, as verified

The published key list is incomplete, so these are the facts the generated bases rely on, checked in Obsidian:

| Feature | Syntax | Note |
|---|---|---|
| Row order | `sort: [{property, direction}]` per view | **Undocumented.** `order` is *column* order and sorts nothing. An unsorted view defaults to `file.name` |
| List layout | `indentProperties: true`, `propertySeparator` | **Undocumented**, same as `sort`. Indent off gives run-on commas |
| Hidden sort keys | Any property, present in `sort`, absent from `order` | Which is what lets `chapter_index` and `cfi_sort` do their work invisibly |
| Formulas | top-level `formulas:`, `+` concatenates | `file.asLink(excerpt)` gives a clickable cell showing unsanitized text |
| Column labels | top-level `properties: { note.link: { displayName: … } }` | Works for real properties and formulas alike; `note.` prefix here |
| Cards | `type: cards`, `image: note.cover`, `imageAspectRatio`, `cardSize` | `image:` takes the `note.` prefix; `order:` and `groupBy:` do not |
| Column widths | `columnSize: { property: 469 }` per view | A 200-character excerpt column needs this |
| Per-view filters | view-level `filters:` with `and` / `or` | What makes the kind-split views possible |
| Emptiness, dates | `!prop.isEmpty()`, `created >= today() - "30d"` | Behind the mark and recency views |
| External URLs | **Not** via `link()` — it takes a path or file only | Markdown in the property (tables), or an `html()` anchor (everywhere) |
| Markdown in a property | Renders in **table** cells only | A list or cards view shows the raw string |
| `html()` | Renders in table, list **and** cards | Returns an object rather than a string, which is why it survives where markdown does not |

**Generated YAML must match Obsidian's canonical form**, or the reader's file is rewritten the moment they open
it: no `note.` prefix on property names in `order`/`groupBy`/`sort`, block-style lists, formulas as plain unquoted
scalars, top-level keys in the order `filters, formulas, properties, views`, and view keys in the order
`type, name, filters, groupBy, order, sort, columnSize`.

---

## The two bases

The same views at each scope. Both filter the tag; the per-book one adds a folder test:

- **Global** — `file.hasTag("orbis-reading-record")` alone, so it keeps working if the root folder is later moved
  or renamed. Named `!Reading records.base` from the default folder name rather than the reader's chosen one, so
  the filename stays stable when they rename the folder.
- **Per book** — the tag plus `file.inFolder("…/content/<book>")`. Folder-based because the folder is ours and
  cannot be broken by an edit to the book's metadata, which `book_title == "…"` can.

They cannot share view definitions, because "sorted by chapter" means different things:

| | Global | Per book |
|---|---|---|
| `groupBy` | `book_title` | `chapter` |
| Then sorts by | `chapter_index`, `cfi_sort` | `cfi_sort` |

Grouping the global base by chapter would interleave every book's Chapter I.

### Views

Ten views, each in two layouts — see [Layouts](#layouts--every-view-twice).

**The axis that matters is whether a mark is applied** — not whether a selection exists. Every note is created
from a selection (`openNoteEditor` takes a non-optional `selectedText`, and every creation path supplies it), so
every record that is not a bookmark **is** a selection.

Four views cut across kinds:

| View | Filter | Note |
|---|---|---|
| **All selections** | `kind != "bookmark"` | First, so the base opens on it — bookmarks are positional noise when you want content |
| **Selections with a mark** | + `!mark.isEmpty()` | Second: "what have I marked" is the question the mark bar exists to let you ask |
| **Recently added** | none | Grouped by `created`, descending |
| **All selections and bookmarks** | none | Last, and the only cross-kind view a bookmark reaches. Names both halves, because a bookmark is the only thing distinguishing it from `All selections` |

**The names carry their noun and spell out the qualifier.** "Unmarked" and "All" tell a reader nothing —
"unmarked *what*?", "all of *what*?" A view name is the only documentation a view has.

Five split on kind:

| View | Filter | Group by |
|---|---|---|
| Bookmarks | `kind == "bookmark"` | chapter / book |
| Passage selections | `kind == "passage selection"` | chapter / book |
| Passage selections by mark | `kind == "passage selection"` | `mark` |
| Notes | `kind == "note"` | chapter / book |
| Notes by mark | `kind == "note"` | `mark` |

**Split on `kind` first**, rather than filtering bookmarks out of a shared "by mark" view: a bookmark never has a
mark, so in a shared view it would swamp the empty-mark group.

And the triage view completes the notes triad: **Notes without a mark**, `kind == "note"` and `mark.isEmpty()`.
It is named for notes and filtered to notes because every markless record is a note: a note can be saved with no
mark (`choice: selected ?? selectedColor ?? undefined`), while a passage selection is created **by** tapping one.
The only way to reach a markless passage selection is data written before marks existed.

A bookmark is excluded from everything but *All selections and bookmarks* and *Bookmarks*: **a bookmark is a place,
not a selection.**

**A `kind` value is part of every generated base.** A generated base is never overwritten, so renaming a `kind`
value would leave a broken filter in every reader-owned base with no way to repair it.

**Bookmarks get one view, not two** — they cannot be grouped by a mark they never have. The row is its position —
under chapter headings, a column of clickable locations, which is exactly a bookmark index — and `created` earns a
column by being the one thing the position does not tell you.

**A bookmark's `excerpt` is the words it marks**: the page's opening lines, or the sentence being read for an audio
bookmark, kept on the bookmark as it is made (`Bookmark.text`). It used to be empty, as though a bookmark had no
words; in the views that mix bookmarks with selections, Obsidian's **list** layout then dropped the bookmark's entry
entirely, leaving its chapter heading over nothing. A bookmark from before the words were kept falls back to its
label, `"CHAPTER IX. · loc. 51"`.

**No view lists the property it groups by** — the group header already shows that value. Per book that removes the
`chapter` column, and `book_title` goes too for being the same on every row.

`note_text` is a column on the notes views, so what the reader wrote is visible beside the passage it hangs on.

**Twenty views is a lot, and that is the right side to err on.** A generated base is never overwritten, so
anything the reader deletes stays deleted. A generous starting set they prune once beats a guess at their
preferences that they cannot easily extend — and the view picker has a search box.

### Layouts — every view twice

Ten views, each generated as `Name (list)` then `Name (table)` — twenty per base.

**Obsidian has no per-device view setting.** A phone and a desktop cannot each prefer a layout unless both
layouts exist to be chosen: a five-column table on a phone either scrolls sideways or crushes every column, and a
list on a desktop wastes the width a table earns. Neither is right for both, so both ship.

List comes first, and is therefore what the base opens on, because it is the layout that is at least readable
everywhere. The suffix keeps each pair adjacent in the view picker, which has a search box — twenty views one
keystroke apart beats ten that are wrong on half your devices.

**The active view is NOT per device** — it is the same default everywhere, so switching on the phone switches on the
Mac. That makes list-first matter more, not less: everyone lands on whatever was last chosen, so the default has to
be the layout that is at least readable on every device. The table variants remain for a desktop session where you
deliberately want columns.

**A list gets fewer properties than its table.** Each renders on its own indented line, so a table's five columns
become five lines per row and the set reads as a wall. Three plus the link is the ceiling, and a test enforces it.

`indentProperties: true` on every list — without it the properties run together separated by commas.

**The link column follows the layout.** `link` for tables, `formula.Open` for lists, never both — markdown renders
in a table cell and nowhere else, so `link` in a list puts a line of raw percent-encoded CFI directly above the
working link. The link is the last column: an action, not a fact about the passage. `columnSize` is table-only; a
list has no columns to size.

### No per-group summaries

`summaries` is a published view key and a per-group count is one line of YAML, but the generated bases carry none:

- **The advanced-search mark picker already gives the per-mark census**, and better — `Test Yellow — 4 saved`,
  `Test Blue — 5 saved` for every mark in the book, on one screen, sorted together. Group headers spread the same
  numbers across a view you have to scroll.
- **The Reading Data view already gives per-book counts.** So "how much did I mark in each book", the other
  plausible summary, is covered too.

What remains is a count beside a group header whose rows are already on screen, in a view where Bases prints
**"N results"** at the top anyway.

**We generate defaults for things that are hard or non-obvious.** `sort` qualifies on both counts: undocumented, and
without it row order silently falls back to `file.name` — a reader would never guess that was the problem.
`chapter_index` and `cfi_sort` likewise. A summary is neither: it is discoverable (right-click a column header →
Summarize), two clicks, and persists in the reader's own file. Shipping one means shipping a guess about which
column somebody wants aggregated, across twenty views, most of which want none.

### No cards view

**A Bases view has one row per note**, so a book's records render one card each, every one carrying the same
cover — the group header already says which book it is, and the covers read as wallpaper.

Column choices cannot fix it: they change what is *on* a card, never how many there are. Neither can `groupBy`,
`unique()` or column summaries. Grouping creates a header per distinct value and leaves every member row in place;
`unique()` dedupes elements **within a list-valued property** on one note; a summary aggregates a group into a
summary cell. None of them removes a row.

One tile per book needs **one note per book** — a small index note holding the cover, title, author, counts and a
link to that book's base, with a base over *those*. That is a different artifact, not a view setting.

The `cover` property stays in the schema: it costs nothing and a reader can bind it in a view of their own.

### Staleness

A generated base is **never overwritten** — the reader owns the file from the moment it lands (`writeIfAbsent`).
Restoring the defaults is a deliberate, explicit overwrite with a warning naming the files, paired with release
notes when the shipped views change — never a silent rewrite. Bases are cheap to re-edit; a `(defaults)` twin left
beside each one is clutter that accumulates.

---

## Covers

A record's `cover` is the image the book's Library title note points at (`RecordExporter.libraryCover`), so the
Library and the records show the same file rather than two copies under different names. Records keep no image of
their own, and nothing about a cover moves with them. The property is absent when the Library is off or the title
note has no cover.

The link is resolved through the record's own link rules, so a cover written as a short link resolves the way the
Library resolves it — a path only Obsidian can find would show a broken image in a view.

---

## Live export

Records are written as saved content is created, so what you capture while reading is searchable immediately.

One note per item is what makes it tractable, and not only for simplicity. `.orbis` files sync while `data.json`
does not, so two devices annotating one book both want to write. Appending to a shared file is a guaranteed
conflict; one file per item means two devices produce **the same file with the same content** — a no-op collision
rather than a merge.

### One hook

`recordsChanged()` on `ReaderContext` is called from exactly three places: `persistHighlights()`,
`persistNotes()` and the bookmark controller's `persist()`. Those three are the *only* places saved content
reaches disk, so this is a single hook rather than many call sites that each have to remember one — the same
argument `OrbisModal` makes about dialog chrome.

### Debounced, and silent

A selection is created, recolored, re-marked, then deleted twenty seconds later; note text arrives a character at
a time. Writing on each of those would put a file in the vault for every keystroke and then delete it. So the
write happens **4 seconds after things go quiet** (`RECORDS_SETTLE_MS`) — long enough to coalesce a burst, short
enough that a highlight is queryable by the time you go looking for it. Same pattern as the progress writer and
`pendingCfi`.

No notice, because this fires while the reader is reading and a toast per highlight is worse than no feature.
Failures go to the debug log, and a run that changed nothing logs nothing.

### No separate backfill

The write is a **full idempotent pass** over the book, so the first fire after switching the feature on catches up
everything already in it. That *is* the backfill, without a second code path that could disagree with the first.

What makes that affordable is `frontmatterMatches()`: before touching a record it compares the desired properties
against `metadataCache.getFileCache()` — **cached, no file I/O**. A settle on an unchanged book therefore does
zero reads and zero writes. Without it, every highlight would rewrite every record's frontmatter, touching
hundreds of mtimes and syncing all of them for no change.

The body is not compared and does not need to be: it is built from the passage and the note text, both mirrored
into properties, so frontmatter agreeing implies the body agrees. The one gap is a passage edited beyond the
200-character `excerpt` cap, and passages are not edited — they are created.

A test pins the invariant this rests on: **the same annotation always shapes to the same properties.** A timestamp
or an id generated at write time would make every pass look like a change.

### What gets a record

Three toggles — passage selections, notes, bookmarks — with **bookmarks off by default**. See below.

The manual command, *Write this book's reading record…*, is the repair and catch-up tool for a book whose records
got out of step — both triggers write the same files to the same paths, which is what makes either one idempotent.

### Volume

Global, all books, forever is potentially thousands of notes, and they land in ordinary search results, the quick
switcher and the graph. That is either the entire point — content findable by normal Obsidian search — or noise in
every unrelated search.

`recordKinds` is the mitigation, and **bookmarks default off**: a bookmark is a location with almost no content of
its own, so it is the kind that adds the most files for the least searchable value. The three toggles are a group
under *What gets added to the vault*, and **the last one on cannot be switched off**: all three off would mean
"write a reading record, but nothing counts as content for it", which is what Off says properly.

---

## Per book, not only global

A reader may want records for the books they study and none for the ones they read on a train — and a book whose
records sit beside it can be archived and restored as one folder, which the shared root cannot offer. So a book
carries its own answer.

### The model, in one line

**Nothing writes unless the vault setting AND the book both allow it.** Either side can veto:

| Vault setting | Book undecided | Book said yes | Book said no |
|---|---|---|---|
| Off | — | — | — |
| Ask for each book | prompt, don't write | writes | — |
| On for every book | writes | writes | — |

`resolveRecords()` in `record-config.ts` is the only place this is expressed, so the live writer, the export
command and the cleanup action cannot drift apart. It returns `active` and `ask` (never both true) plus
`authority`, which says whether the answer came from the book or the vault — the dialog needs that to explain
itself.

**Off is absolute, and that is the point.** A feature writing hundreds of notes into someone's vault has to have a
switch that stops it; books still writing after Off would be *invisible* — no list, no indication, just files
appearing because of a decision made weeks earlier. The option is labeled Off and means it, so the settings copy
needs no footnote excusing an exception.

**The book's veto is equally absolute.** A book set to no stays off when the vault is set to every book —
someone who deliberately excluded a book would be surprised to find it tracked again. So the setting reads as
"which books: none, the ones I choose, or all of them", with no precedence to remember.

While the vault is off, an undecided book is **not prompted** either: "should this book track?" is moot when
nothing tracks.

### Stored in `.orbis`, not in settings

Two reasons. It travels with the book — a book copied to another vault arrives with its answer, and one moved
between folders keeps it — and it is a fact about the book rather than about this device, unlike the Listen voice,
which is deliberately device-local.

The payload is `records: { enabled, kinds?, location: { mode, path? } }`. What that shape commits to:

- **A mode plus an optional path, never a resolved absolute path.** Renaming the global records folder in
  settings moves every `global` book's records with it, and moving a book moves its `book`-mode folder, because
  both are derived at use time.
- **`kinds` absent means follow the vault**, and that is the normal state. They are stored only when the reader
  deliberately overrides them for one book — store the exception, not the rule. Writing them into every book
  would make Settings → "What gets added to the vault" a dead control the moment each book had been opened once.
- **`enabled` is optional, and its absence is a third state.** No `records` object = never asked; an object with
  no `enabled` = the reader chose to follow the vault; `enabled: true/false` = decided. The first two resolve
  identically, and exist as separate shapes only so the stamp can tell "you have not spoken" from "you said
  follow" — without that, the stamp would overwrite the choice on the book's next write and make *Follow the
  vault setting* a lie. An unreadable `enabled` also reads as "follows", because returning "never asked" would
  discard the kinds and location stored beside it.
- **`enabled` is stamped, `kinds` never are.** When the vault is set to every book, the first pass that actually
  writes something records `{ enabled: true }` for that book. Only on a real write, not on open — reading a book
  to look one thing up should not modify its sidecar and hand two other devices a sync object. What it buys:
  switching the vault to ask-me afterwards does not re-litigate books that were already tracking.
- **Anything unrecognizable reads as no decision** (`parseBookRecordConfig` returns null), so the book falls back
  to the default and can be asked again. Reading a corrupt payload as "off for this book" is the one direction
  with no way to tell it from a bug — the same reasoning `readBookPreset` uses. "Never asked" and "asked, said
  no" stay distinguishable, which is what the `ask` mode needs to not nag.
- **An absent `location` inherits; an unreadable one falls back to the shared folder**, so a garbled value cannot
  redirect where notes are written.

`saveBookRecords(app, file, null)` un-decides a book, via the same `undefined` trick as `saveBookPreset` — the
key leaves the file rather than lingering as a tombstone.

### Loaded once per book

`bookRecords` is read when the book opens and held in memory: it is consulted once per saved item, and
re-reading the `.orbis` file per highlight to learn a fact that rarely changes would be absurd. It is cleared in
`resetFileState()` as well as reloaded on open, so a failed open cannot leave the previous book's decision in place
for this one.

### Two layouts, three ways to choose one

`record-paths.ts` owns both, as pure path arithmetic — so each layout is pinned by tests rather than by opening a
vault and looking. `RecordExporter.layout()` adds only the part that cannot be pure: the book's disambiguated name.

**A root** — `global`, and `custom` — holds many books:

```text
Reading records/
  !Reading records.base          ← every book, filtered by tag alone
  First-Open.base
  content/
    First-Open/passage selection — … .md
```

**Beside the book** — `book` — holds exactly one, and is deliberately the same shape at n=1, so the book, its
`.orbis` sidecar and its records are one folder to archive and one folder to restore:

```text
Books/Fiction/Sample Book.epub
Books/Fiction/!orbis-data/Sample Book.epub.orbis
Books/Fiction/Sample Book-reading-records/
  Sample Book.base
  content/passage selection — … .md
```

One difference from the root layout: **no per-book subfolder under `content/`** — one book, so a level of nesting
with nothing to disambiguate. The suffix `-reading-records` is spelled out because the folder sits in the reader's
own book folder and has to say what it is without being opened.

And one thing that is *not* different: no disambiguation. `recordBookName`'s shortest-unique-suffix logic exists
because two books' folders sit side by side in a root; two books in one vault folder cannot share a basename, so
the book-local folder is named from the plain basename — and the vault scan that produces the disambiguated name
is skipped entirely for that mode.

**A custom location is a root, not a book-local folder.** So several books can point at one — "all my technical
books' records here". Treating it as book-local instead would let two books share a single `content/`, where each
export's orphan pass flags the other's records as deleted and the cleanup action offers to remove them. Silent
and destructive, from a path setting.

**The every-book base stays in its own folder** whatever a book's location is, because it filters on the record
tag alone: one copy already finds records anywhere in the vault, and a second in every custom root would be a
duplicate view of the same rows. It is `null` — not written at all — when the reader has declined it, and a folder
is never invented to hold a base they did not ask for.

For the same reason, **only a `global` book requires the shared folder to be set** (`recordLocationReady`). The
setting starts empty on purpose, and a location that needs no setting must not be blocked by one. `/` counts as
set — it is how Obsidian spells the vault root in a folder dropdown, so a reader who picked it has answered.

### The dialog, and moving what is already there

`BookRecordsModal.ts`, reachable from the palette (*Reading record for this book…*), plus
`RecordExporter.moveRecords()`.

Three questions on one screen — write records for this book, which kinds, where they go — seeded from
`seedBookConfig`. The kinds section starts from the vault's choice and, once saved as this book's own, stops
inheriting it.

The dialog never touches the vault. Where a location resolves to, and how many records are already there,
arrive through a `resolve` callback the reader view supplies, so path arithmetic stays in `record-paths.ts`
where it is tested and the dialog stays readable.

**The resolved folder is always on screen.** A location whose consequence you cannot see is a guess, and this
is where an accidental collision with a folder that already exists becomes visible before anything is written
into it. The dialog also says how many existing notes move ("Moves 12 existing notes here.").

**The location picker and the mover ship together.** A location picker without a mover is a duplicate-state
generator: the next export writes a complete second set at the new location, the old set stays behind unflagged,
and the every-book base — which filters on the tag alone — shows every annotation twice with nothing on screen to
explain why. That is the hardest state here to unpick by hand.

The order is load-bearing: **move, store the decision, then export.** The move (`moveRecordFiles()`) handles:

- **The records**, per file rather than by renaming the folder — the destination may already exist from an
  earlier stint at that location, and `renameFile` also updates links pointing at them. A record already at the
  destination is left alone.
- **The base**, which is *replaced* rather than moved: its `file.inFolder()` filter is a stored path, so a moved
  one would silently match nothing — and `writeIfAbsent` never touches a file that exists, so an export would not
  repair it. The old one is trashed and a fresh one written at the destination.

Everything else heals on the export that follows: `link`/`link_url` are rebuilt from the book path, and the two
wikilinks, `book` and `cover`, Obsidian updates itself.

**Turning records off writes the decision and stops.** It deletes nothing: the body below the marker may be the
reader's own writing, and removal lives in the cleanup command, which names what it is about to trash. The
dialog says so, with the count, rather than leaving it to be assumed.

`scrollParent` in `ui-utils` keeps the scroll position: the dialog rebuilds its body on every control change, and
would otherwise throw the reader back to the top of the form.

### The legacy tag

`RECORD_TAG` is `orbis-reading-record`. The earlier tag, `orbis-annotation` (`LEGACY_RECORD_TAGS`), predates the
vocabulary — a bookmark is not an annotation — and is replaced without a manual step:

- **Notes retag themselves.** `frontmatterMatches` compares `tags` element by element, so a note carrying the old
  tag fails the comparison, and `updateRecord` → `writeProps` rewrites it on the next export pass.
- **Bases cannot**, because they embed the tag as a literal and are written with `writeIfAbsent`, which never
  overwrites. `migrateBaseTag()` rewrites the filter text in place instead — gentler than deleting and
  regenerating, since it keeps any views the reader added by hand, and idempotent, since afterwards there is no
  legacy tag left to match. Scoped to the two paths the exporter computes; nothing else is touched.
- **Deleting the content folders would be the wrong fix.** Anything written under the marker is the reader's own
  prose, which is precisely what `removeOrphans` refuses to destroy — a tag rename must not either.

This runs **per book, when that book's records are next written**. A book whose record is off keeps its old base
until it is turned back on, so "some bases updated before others" is not a bug.

### The dialog says who owns each value

A toggle reading "on" is ambiguous between *this book decided* and *the vault does this to every book*, and
three toggles showing the vault's kinds are indistinguishable from three this book chose. Values without
provenance are how a settings page stops being trustworthy, so each section names its authority:

- **The on/off control is a PICKER, not a toggle** — *Follow the vault setting* · *On for this book* · *Off for
  this book*. The stored state has three values and a toggle has two. `follow` is the absence of a stored
  `enabled`, and it stays available *after* a decision — a one-way door is the trap the kinds switch and the
  location dropdown both exist to avoid.
- **The vault's own answer is stated first**, always: "Vault setting: on for every book" / "ask for each book" /
  "off for every book", the last with where to turn it on.
- **The resolved state is spelled out** beneath the picker: **Active**, or **Inactive** with the reason. Three
  vault states times three book answers is nine outcomes, which no control label can carry. Worded
  Active/Inactive precisely because every control above says On/Off — a fourth thing saying "Off" would read as
  another switch rather than as their consequence. Only three reasons exist: off for this vault · off for this
  book · waiting to be asked.
- **Kinds sit behind a "Follow vault settings" switch.** While it is on, the three toggles *display* the vault's
  answer and are disabled, with the description pointing at Settings. Turn it off and they become this book's.
  A switch, rather than letting an edit silently detach the book, because **inheritance is only trustworthy if
  you can get back to it** — with bare toggles, "follow the vault again" has no representation at all, and
  nudging one toggle would detach that book permanently and invisibly.
- **Location inherits too, but as a value rather than a switch.** Settings has a *default location* — the shared
  folder, or the same folder as each book — so a book's location can be inherited or overridden. The dropdown's
  first entry is "Follow vault default — beside the book" (naming what it resolves to, since "follow the
  default" alone says who decides without saying what was decided), and picking it deletes the stored location.
  Not a second Follow switch: kinds are three independent booleans, where a switch is the right shape, while
  location is one choice, where "Default (…)" belongs in the list. Same pattern as a theme picker's "Default
  (Light)".
- **The dialog opens on the book's real state, not on a default.** An undecided book shows *Follow the vault
  setting*, because that is what it is doing; showing *On for this book* would display a decision the book never
  made. The **ask-mode prompt** is the one caller that overrides this and defaults to *On for this book*: it is
  offering an answer, so Save has to mean yes rather than mean nothing. The override lives at that call site,
  which is also where "the export command on an unanswered book opens the dialog" points.
- **The kinds and location sections stay visible** whenever the book is not switched off, even when nothing is
  being written. They are this book's configuration either way, and hiding them would mean the only way to set a
  book up was to switch it on first.

Switching "Follow vault settings" back on **deletes** `kinds` from the payload rather than copying today's vault
values in, and choosing the inherit entry does the same for `location`. Copying looks identical on the day and
diverges the moment the vault setting next changes.

### The vault-level settings

```text
Write a reading record for each book as you read   Off / On for every book / Ask for each book
Where each book's reading record goes              In one folder for every book / Beside each book
  Folder for reading records                       <folder>        ← only when the records use it
Create one base covering every book                on / off
  Folder for the base covering every book          <folder>        ← only when that is on
What gets added to the vault                       Passage selections · Notes · Bookmarks
```

**Two destinations, two folders, neither referring to the other.** With the records beside their books, a records
folder holds nothing, so one folder serving both would exist only for the base's sake while the base's control
pointed back at it. Naming each folder for what it holds survives every combination of answers, with no
cross-reference and no forward reference. The cost: the base does not **follow** the records folder, so renaming
that folder leaves the base where it was pointed.

Both folder rows are named **"Folder for …"** and described as **"Holds …"**, because they are the same kind of
answer and reading them as a pair should not require noticing that they were phrased differently. The per-book base
is mentioned in the *records folder's* description — "each in its own subfolder with its own Obsidian base" —
because that is where those bases are written.

**A vault that has never set this up sees only the switch.** Every row below it would be an unanswered default,
inviting configuration before the decision and duplicating the dialog that is about to ask. They all appear once the
question is answered (`recordsSetupDone`) or the mode is on.

Hiding, not disabling: a disabled control lies about being interactive, while an absent one says "not yet". Nothing
is gated on the *mode* — these are defaults, so choosing the folder and the layout before switching records on is a
sensible order, and `recordLocationReady` is what stops a write with no folder chosen.

**The dependency runs choice → folder, so the choice comes first.** The records folder row appears only when the
records use it; asking someone to name a folder and then telling them they need not use it is worse than either
order's references.

**"Beside each book", not "Same folder as the book".** It reads like **Default location for new EPUB files** one
section down ("Same folder as the note"), but it is not the same answer: an EPUB file does go in the note's folder,
while a book's records go in a new folder made beside the book, `<book>-reading-records/`. The old label promised
the first. The row's description follows the choice and says what it makes — one folder with a subfolder per book,
or a folder next to each book named after it — since the folder row below is hidden for one of them.

**Two options here, three per book.** A *chosen folder* at the vault level IS the records folder, so offering it
again would be two names for one answer. The third option exists only in the per-book dialog, where it means
something this level cannot express: a different root from the vault's.

### The base covering every book is optional

It is the feature's headline capability — one view over every book's records, found by tag so it works wherever
they live — and it is still only *an* answer. Each book gets its own base regardless, so declining the aggregate
loses that view and nothing else.

Deleting the file cannot decline it: it is written with `writeIfAbsent`, so the next write would put it back, and a
plugin that restores a file you deleted is insisting it knows better. So declining is a setting: *Create one base
covering every book*, a switch of its own, with the folder row below it shown only while it is on. The decision is
a switch rather than an entry in the folder dropdown, because a row named "Folder for…" reads as "which folder",
and an option answering "whether at all" is invisible there. Switching it off stops the base being written; an
existing one is left in place rather than deleted, because a reader may have added views to it.

It is **one stored value, not two.** `recordsAllBooksBaseFolder` is the single source of truth, and
`allBooksBaseRoot(baseFolder)` resolves it to a path or null, where **empty means declined** — so there is no flag
to fall out of step with the folder. Switching on picks the shared records folder, or the default name when records
live beside their books. Switching off forgets a *custom* folder, since the empty string is how "off" is spelled.
The destination dialog offers the same answer as *Don't create one* in its folder picker.

### `recordsSetupDone`

A stored flag for "the destination question has been answered". An empty records folder cannot stand in for it,
because "no folder at all, records beside the books, no aggregate base" is a legitimate answer: two states that
look identical need something to tell them apart. A vault whose settings have no flag infers it once on load from a
records folder or `recordsSameFolderAsBook` being set — nothing could have set either without having chosen one.

### Following the book when it moves

`vault.on('rename')` in `main.ts` moves a book's `.orbis` sidecars to sit beside its new home, and moves the
book's records too. The two are separate calls, and the second has to run even when the first finds nothing — a
book can have records without a `.orbis` file to move, and the sidecar block returns early when the old folder is
absent.

Without this, a drag in the file explorer strands them: the next export resolves the layout from the book's NEW
path, finds nothing, and writes a fresh set — leaving the old one behind unflagged, so the every-book base shows
every annotation twice. The same duplicate state a location change would cause, arriving through an ordinary file
operation instead of a setting.

It matters for **both** layouts: a book-local folder is named after the book, and a root layout's content folder
and base are named from `recordBookName`, which is derived from the path.

The move itself is `moveRecordFiles()` in `record-move.ts`, shared with the dialog's location change — the same
operation for two different reasons, and doing it twice would be two chances to get the order wrong. It takes an
`App` and two path sets rather than a reader, so it works for a book that is not open.

Two guards in there earn their keep:

- **Nothing to move means nothing is written**, emphatically including the base at the destination. Otherwise
  renaming a book that has no records yet would give it a folder and a base it never asked for.
- **The vacated folders are trashed only when empty, and only the book's own.** Its records folder in every
  layout — `<root>/content/<book>/` in a shared folder is this book's alone, though it used to be kept as if shared,
  leaving an empty folder under a renamed book's old name — and, beside the book, the `<book>-reading-records` folder
  (`bookFolder`, null in a root layout). In a root, its `content/` too once it is empty — the last book's subfolder
  has left it, and anything else in it keeps it. Never the root itself, which the reader chose and which can hold
  other things: being wrong in that direction deletes the reader's records folder. A leftover `cover/` folder is left alone: an image someone
  may still point at is not ours to bin.

### Healing the deep links

Each record carries the book path three times — `book`, a wikilink, and `link`/`link_url`, which embed it in an
`obsidian://` URL — and they are Orbis's own properties, so **the rename rewrites them**: `relinkRecords()` in
`record-move.ts` runs after the move, rebuilding all three from what each record already holds (`orbis_cfi`, `loc`)
with the exporter's own builders, and re-pointing the same link where the body repeats it above the marker. The body
needs it separately: an export rewrites a body only when the properties change, and once they are re-pointed they
no longer do. It used to leave `book` to Obsidian's link updating, and Obsidian asks first: a
reader who answered No kept every record pointing at a file that no longer existed. It runs whether or not the
records folder moved — a book can change path without its records' folder changing.

Opening a book also runs **one silent export** when its records are active, which catches anything a rename on
another device left stale. It costs almost nothing: `frontmatterMatches` compares against the metadata cache, so a
book with nothing stale writes nothing at all. It is gated on `active` rather than routed through
`recordsChanged()` wholesale, because an undecided book in `ask` mode must be prompted by a **save**, not by
being opened.

### Closing a book with a pass still waiting

A pass reads the open book's passages, notes and bookmarks, and closing the tab empties the first two. So the view
calls `RecordsController.flush()` before it lets go of a book — closing the tab, or opening another in it — which
starts the waiting pass at once; the pass reads its lists before its first `await`, so it gets them whole. Left on
its four-second timer, a pass scheduled just before closing ran on the emptied book, found no passages or notes but
the bookmarks still there, and flagged every passage and note record orphaned — which the bases then hide.

### Asking, and when

The vault setting is a three-option dropdown — Off / On for every book / Ask for each book — and `ask` prompts on
the first saved item in a book that has never answered — **an item of a kind it would record.** Each save says what it
saved (`recordsChanged(deleted, kind)`), and a kind switched off asks nothing: with Bookmarks off, a bookmark asked
"record this book?", and a yes then wrote nothing for it. **"Never answered" is no `enabled`, not no stored
decision:** choosing *Follow the vault setting* stores kinds or a location without one, and the book is asked on its
next save exactly as one never asked is — the dialog says it will be, and counting any stored decision as an answer
meant it never was. A stored legacy boolean `recordsEnabled` reads as `on` or
`off` on load.

**Deferring is free, so the prompt waits.** The export is a full idempotent pass over the book, so whenever the
answer arrives the first write catches up everything already saved. That is what makes it safe to wait for a
moment when the reader is not mid-gesture — and waiting is necessary, because the trigger is a save, which means
the default moment is the worst one: a selection popup or the note editor still on screen, possibly with the
keyboard up.

`busyForPrompt()` defers while any Orbis popup or Obsidian modal is open, and while the full player or pocket
mode is showing — both of those being states the reader chose to be in. Detected from the DOM, because a popup
is not registered anywhere countable: `.orbis-popup-close-btn` is **ours** (every `createOrbisPopup` dialog has
exactly one) with `.modal-container` as a secondary check. If either name drifts, the failure is a prompt
appearing over a dialog once — mild, and visible. The alternative failure, no prompt ever, would not be.

**Retried on a timer, and capped.** One highlight and then nothing more is an ordinary session, so re-arming
only on the next save would mean never asking. It retries every 2.5 s (`RECORDS_PROMPT_RETRY_MS`) for about a
minute, then gives up; the next save arms it again. A reader who leaves a dialog open is not polled forever.

**Dismissing the prompt leaves the book undecided** — Escape and Cancel are not answers, so it is asked again in
a later session. Only "no" is durable. `recordsAsked` on the plugin (a set of paths, session-scoped, not
persisted) is what stops that from becoming nagging *within* a session; it lives on the plugin rather than the
view so closing and reopening a book does not re-ask, and it is marked before the dialog opens rather than after
it is answered, because the dialog **is** the asking.

**The export command asks rather than refusing.** Running *Write this book's reading record…* on a book that is
still waiting to be asked is itself the answer to the question, so it opens the dialog. Only on the explicit
path — the live writer must never open a dialog of its own accord.

---

## Deletion and cleanup

Deleting an annotation removes its record — **unless the reader has something invested in that record**, in which
case it is kept and flagged instead. The body below the marker may be the reader's own writing, so a record they
have written in is never deleted for them; a record nobody has touched is not worth keeping behind a flag.

### Two paths, and only one of them deletes

The distinction that makes deletion safe is **who says the annotation is gone**.

- **The reader just deleted it, in this session.** `recordsDeleted` removes the record. There is no inference to be
  wrong about: `removeHighlight`, `deleteNote`, `removeAnnotationsByIds` and the bookmark `remove` each hand their
  ids to the same persist seam that already tells records something changed, so no delete site has to remember a
  second hook. It runs immediately rather than on the settle timer — the note for something you just deleted should
  go now, and the pass that follows would otherwise flag it orphaned and then find it gone.
- **A comparison noticed it is missing.** `markOrphans` sets the flag and nothing else.

That asymmetry is the whole design. `markOrphans` diffs the folder against what is in memory, and **that set is empty
for a book whose `.orbis` has not synced yet** — every record in the book looks deleted. Flagging survives it: the
next pass unflags. Deleting would not, and the deletion syncs outward, and nothing unflags a file that no longer
exists. So a stale sidecar can never reach the code that deletes, because nobody pressed anything.

Reconciliation that deletes, however guarded ("never when the expected set is empty", "only if flagged in an
earlier pass", "never more than N%"), is not safe here: on the live path the next pass is seconds away, so a grace
period measured in passes is no grace at all, and the rest is a threshold nobody can pick.

### What counts as the reader's

`recordKeepReason` is the veto, and it is deliberately wider than "wrote below the marker":

| Reason | Test | Why it vetoes |
|---|---|---|
| `wrote` | Anything below `RECORD_MARKER` | Their prose. The main test |
| `properties` | A frontmatter key no export writes | Someone who put `status:` on a record is using it as a note of their own |
| `linked` | Another file links to it (`resolvedLinks`) | Removing it leaves a broken `[[link]]` in a note we never looked at — a failure discovered later and somewhere else |

`note_text` deliberately does **not** veto, even though the reader typed it. It mirrors the annotation's own text,
and the annotation is what was just deleted; keeping a copy of prose they deleted in the reader is clutter. Their
writing *in the note file* is what `wrote` covers.

`RECORD_PROPERTY_KEYS` is a literal list, not something derived, because `RecordProperties` is a type and types do
not exist at runtime — and it is the runtime set that decides whether a file is deleted. A test asserts it against
the keys the three builders actually produce, so a property added to the interface and not to the list fails the
suite instead of quietly making every record look reader-edited.

**One predicate, two callers.** The live delete and the cleanup action's removable/yours split read the same
function. They have to agree: a record the live path refuses to remove must not then be offered as removable by the
command an hour later.

### What is kept when a record is deleted

Nothing else is cleaned up. The book's folder and its base stay, even when the last record in them goes: a new
highlight recreates records into them, and the base is never overwritten precisely because it may hold views the
reader edited.

Silent, both ways. The reader initiated the deletion, and a toast per highlight is the noise the live export exists
to avoid — so it goes to the debug log and nowhere else.

### No confirmation, no undo

Deleting a highlight is one tap, with no confirmation and no undo, and its record goes with it. `trashFile` is the
only recovery, and it is weak — it honors the vault's *Deleted files* preference, which can be set to permanently
delete.

**Highlight deletion stays unconfirmed.** A highlight is cheap to recreate — select the passage again — so a
confirmation would tax the common case to protect against a loss that costs seconds to undo by hand. Notes keep
their own `confirmDeleteNote` setting, because a note carries prose that retyping does not recover. Do not
re-propose this without a new argument: the asymmetry between the two is the point.

### Marking orphans

Each export pass — manual or live — compares the record notes in the book's folder against the ids of everything
currently saved in it, and sets `orphaned` accordingly. Three details carry the weight:

- **`orphaned` is written on every record, always.** The views filter `orphaned != true`, and that has to mean
  something definite for every note. Were it absent on the normal ones, whether they passed would depend on how
  Bases treats a missing value in a comparison — and getting that wrong empties every view.
- **Expected ids come from all saved content, not from the enabled kinds.** Otherwise switching bookmarks off would
  mark every bookmark record as though its bookmark had been deleted, which is a different fact and a destructive
  one to get wrong. Records of a kind you switched off simply stop being updated.
- **The flag is cleared as well as set.** A book opened before its `.orbis` file has synced has no annotations to
  expect, so everything looks gone. The next pass with real data puts it back rather than leaving a permanent scar.

The filter lives at the **base** level, not per view — twenty views is twenty chances to forget one.

### The cleanup action

A command, per book: *Remove records of deleted content…* The live path already removes the untouched ones, so what
it sweeps is the flagged set: records deleted on another device, or ones the veto kept. It splits them with
`recordKeepReason`, the same predicate the live delete uses:

- **Nothing of theirs** → removable, and the button says how many.
- **Something of theirs** → listed by name, and **kept**.

There is no button that deletes the reader's prose. A blanket "are you sure" over a mixed set trains you to click
through it, which is exactly when the one file you had written in goes — so the mixed set is never offered as one
action. Deleting such a note by hand in the file explorer is always available and is the normal way to do it.

Removal uses `trashFile`, so Obsidian's own recovery still applies to a mistake here.

Inside that predicate, `readerWroteInRecord()` treats **a missing marker as the reader's** — the same safe direction
`mergeRecordBody` takes. Without the marker there is no way to know where their writing starts, so the whole file has
to be assumed to hold some. Erring the other way deletes prose.

### Resetting it, to test the first run again

Answering the destination dialog is a one-way door by design: it stores a folder, sets `recordsSetupDone`, creates
folders, and stamps a decision into each book's `.orbis`. Nothing in the UI undoes that, because a first run happens
once. Testing the flow therefore burns its own preconditions, so **"Reset reading records (dev)"** in the command
palette, behind the dev-commands flag, rebuilds them on any device, the phone and the tablet included, where the flow
most needs walking through. The dialog is the dry run: it lists every folder it would trash with note counts, and
names the ones it is leaving alone.

It refuses to delete a folder it cannot show is generated (empty, or holding a base or a `content/` tree), and it
clears the in-session "already asked" state as well as the stored one — otherwise the reset appears not to have
worked, because the prompt it exists to re-show is suppressed for the rest of the session.

## Open questions

**A rename that changes a THIRD book's name.** `recordBookName` is the shortest suffix that distinguishes a book
from every other, so renaming one book can in principle change what another book's name should be. The rename
handler moves the renamed book's own records but does not re-derive anyone else's. A "relink this book's records"
maintenance action is the answer if it is needed; it requires two books whose names collide on basename alone.

**Whether "reading records" is the name.** Working title.

**Link display text per consumer.** In a prose line — `— [loc. 14](…)` — the number *is* the information; in a
table cell a uniform "View in book" would read as a button, where a column of varying numbers looks like data you
are meant to compare. `buildDeepLink()` has no display-text parameter, so both consumers get `loc. N`. The text is
baked into the property value, but `writeProps()` rewrites frontmatter on every export, so changing it costs a
re-export, not a migration.

**Recreating the default bases.** The [staleness](#staleness) rule calls for an explicit command that overwrites
with a warning; there is no such command.

**One tile per book.** A cards view with one tile per book needs a note per book (see
[No cards view](#no-cards-view)).

---

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Records vs documents | A separate capability, not a Notes Export mode | One is read and produced on demand; the other is queried and written continuously |
| Umbrella name | "Reading records", not "annotations" | A bookmark is a place, not a remark; and `annotation` is already the code's word for marks |
| Panel wording | "Saved content" stays as it is | It names what is in the book, which exists whether or not records are on |
| `kind` for a marked passage | `passage selection` — the compound, not bare `passage` | "Highlight" is wrong for an underline; "mark" is the classification; the value is a Bases group header, "passage" alone does not convey it, and `selection` would reclaim the genus |
| Presentation | Obsidian Bases, not our code | Every reasonable regrouping request would otherwise be a release |
| Root layout | Bases at the root, records under `content/` | The root folder is the interface; a base per book is an entry point, not clutter |
| Global base ordering | `!` filename prefix | Obsidian shows folders above files, so it would otherwise sort last |
| Book folder and base name | Shortest unique path suffix (`recordBookName`) | A basename collides across folders; a full-path slug charges every reader for a rare case |
| Collision qualifier | Symmetric — both books get one | Privileging whichever was exported first makes the name depend on history |
| Extension in the name | Added as `(EPUB)` only when two formats share a name (`recordStem`) | Each format has its own `.orbis`, so a shared folder would let one format's export flag the other's records as orphaned |
| Per-book base filter | Tag + `file.inFolder()` | The folder is ours; `book_title` can be broken by a metadata edit |
| Global base filter | Tag only | Survives the reader moving or renaming the root folder |
| Global base filename | From the DEFAULT folder name, not the reader's | Stays stable when they rename the folder |
| Records folder setting | Its own, not a note style's | Two mechanisms with different lifecycles must not share a directory |
| Cover | The Library title note's cover, not a copy | One image for the Library and the records; nothing to move with a book |
| `kind` values in bases | Never renamed | A generated base is never overwritten, so a renamed value would leave a broken filter in every reader's base |
| Search scopes | Kept at four | Collapsing the two selection scopes would lose the ability to search noted passages only |
| `Highlight` type and `.orbis` field names | Not renamed | On-disk data with no user-visible name; churn for nothing |
| "Highlighter" for a mark's fill | Kept | It really is a highlighter; a mark drawn as an underline simply has no fill |
| Bookmarks view columns | `created` and the link, no excerpt | A bookmark's label is "CHAPTER IX. · loc. 51" — the other columns over again |
| The cross-kind slice | On whether a MARK is applied, not whether a selection exists | Every note is made from a selection, so "not a bookmark" already means "is a selection" |
| Triage view named and filtered for notes | `Notes without a mark` | Every markless record IS a note |
| View count | Generous — twenty | A base is never overwritten, so what the reader deletes stays deleted |
| Both layouts of every view | Shipped, list first | Obsidian has no per-device view setting, so both must exist for a phone to pick one |
| Active view per device | It is not — same default everywhere | Which is why list is first: everyone lands on the last choice made anywhere |
| View names | Noun always present, qualifier spelled out | A view name is the only documentation a view has |
| `note_text` | A column on the notes views | Otherwise every view shows the passage and hides the thought |
| Cards | Declined | One row per note means one card per record; `groupBy`/`unique()`/summaries do not remove rows |
| Per-group `summaries` | Declined | The mark picker and the Reading Data view already give the counts, and a summary is two discoverable clicks — generated defaults are for what is hard or non-obvious |
| Views split by | `kind` first, then chapter or mark | Bookmarks in a shared "by mark" view would swamp the meaningful empty group |
| Per-book decision vs a vault switch | An AND — either side vetoes | Off must actually stop everything; a book you excluded must stay excluded. No precedence to remember |
| Kinds | Follow the vault unless overridden per book | Stamping them everywhere would make the vault-level control dead after each book's first open |
| Stamping `enabled` in every-book mode | Yes, on the first real write | Makes the state visible per book, and stops a later switch to ask-me re-asking about books already tracking |
| Provenance in the dialog | Every section names its authority | A toggle reading "on" means different things when the book chose it and when the vault did |
| Getting back to following the vault | An explicit switch, not a reset link | Inheritance is only trustworthy if returning to it is a first-class action |
| The on/off control | A three-option picker | The stored state has three values; a toggle has two |
| "Follow the vault" after deciding | Still offered | A decision must not be a one-way door, here as much as for kinds and location |
| Never asked vs explicitly following | Different stored shapes, same behavior | Only the stamp needs to tell them apart, and it must not overwrite a real choice |
| The resolved state | Spelled out, worded Active/Inactive | Nine outcomes fit in no label, and On/Off would read as a fourth control |
| What the dialog opens on | The book's real state; the prompt alone defaults to on | A dialog showing an unstored value reads as a decision nobody made — but a prompt's Save must mean yes |
| A vault-level default location | Yes, two options, worded like the EPUB one | Same question as "where do converted notes go"; asking it differently would be a second vocabulary for one idea |
| Inheriting a location | An entry in the dropdown, not a second switch | One choice belongs in the list ("Default (…)"); three independent booleans need a switch |
| Absent vs unreadable `location` | Absent inherits; unreadable falls back to the shared folder | Inheriting a garbled value would let a typo redirect where notes are written |
| Where the decision lives | The book's `.orbis` file | It travels with the book and is a fact about the book, not about this device |
| Location stored as | A mode plus an optional path | Renaming the root, or moving the book, then moves its records with it |
| An unrecognizable `records` payload | Reads as "never asked" | Reading it as "off" is indistinguishable from the feature having silently broken |
| `kinds` absent from a stored decision | Inherit the vault's | Writing nothing looks like a bug; inheriting is visible and recoverable |
| Book-local layout | The root layout at n=1 | One shape to learn, one `layout()` to keep in step, and the folder archives as a unit |
| A custom location | A root, like the global one | Several books can share it; treating it as book-local would let two books' orphan passes delete each other's records |
| Book-local folder name | Plain basename, no disambiguation | Two books in one folder cannot share a basename, so the vault scan is skipped there |
| Every-book base | Its own folder, `null` when declined | It filters on the tag alone, so a second copy is a duplicate view — and a folder must not be invented to hold it |
| Which locations need the folder setting | `global` only | The setting starts empty by design; a location needing no setting must not be blocked by one |
| The base covering every book | Optional: a switch, then its folder; one stored value, empty = declined | Deleting the file cannot decline it, since the next write puts it back; a "whether" hidden in a "which folder" dropdown is not found |
| Two destinations | Two folders, named for what each holds | One folder serving both needs a cross-reference that is incoherent when records sit beside their books |
| "Have we asked yet?" | A stored flag (`recordsSetupDone`) | An empty folder is ambiguous once "no folder at all" is a valid answer |
| An unconfigured vault | Shows the switch alone | Rows of unanswered defaults invite configuring before deciding, and the dialog is about to ask anyway |
| Hidden vs disabled | Hidden | A disabled control lies about being interactive; an absent one says "not yet" |
| Row order in settings | Choice first, folder rows only when used | The dependency runs choice → folder; a folder row you might not need is worse than a forward reference |
| The vault destination | Asked once in a dialog, never defaulted | An empty setting would render as `/`, so the vault root would impersonate a decision; a default would lose the choice |
| Dismissing that dialog | Records stay off (settings) or nothing is written (a command) | Dismissal is not an answer, the same rule the per-book prompt follows |
| `/` in the folder dropdown | Still offered, never defaulted | A reader whose vault is a reading vault has the right to choose it deliberately |
| "Beside each book" | Still asks for the base's folder | Two facts, one of them unanswered: the every-book base needs a folder even when no records do |
| Creating the chosen folder | Immediately, on Save | A promise deferred to the first write shows as a blank picker and an absent folder |
| A picker whose value has no folder | An explicit option, labeled | A `<select>` renders a missing value as blank, which reads as "nothing saved" |
| The proposed folder | Matched case-insensitively, adopting the reader's casing | `Reading Records` and `Reading records` are one folder on macOS and two on Android; a name must not behave differently per platform |
| The location picker and the mover | Shipped together | A picker without a mover writes a second set and leaves the first, which shows every annotation twice |
| Save order on a location change | Move, store, export | Exporting first is what creates the duplicate set |
| The old per-book base on a move | Replaced, not moved | Its folder filter is a stored path, and `writeIfAbsent` would never rewrite it |
| Turning records off for a book | Writes the decision, deletes nothing | The body below the marker may be the reader's prose; removal belongs to the cleanup command |
| The resolved folder in the dialog | Always shown | A location whose consequence is invisible is a guess, and a collision with an existing folder should be seen first |
| When `ask` prompts | On the first saved item, deferred until nothing is open | The trigger is a save, so the default moment is mid-gesture — and deferring costs nothing, since the export catches up |
| Dismissing the prompt | Leaves the book undecided | Escape is not an answer; only "no" should be permanent |
| Not nagging within a session | A session-scoped set of paths on the plugin | Survives closing and reopening the book, without outliving the session — that is what `.orbis` is for |
| Prompt retries | Every 2.5 s, capped at ~1 minute | One highlight and nothing else is an ordinary session, so re-arming only on the next save would never ask |
| The export command on an unanswered book | Opens the dialog | Running it *is* the answer to the question it would otherwise refuse over |
| Records follow a renamed book | In the handler that moves `.orbis` | Otherwise an ordinary drag in the explorer produces the duplicate set |
| The mover | Shared by the dialog and the rename handler | One operation, two reasons; two copies would be two chances to get the order wrong |
| A rename with nothing to move | Writes nothing, including no base | A book with no records must not acquire a folder because its file was renamed |
| Trashing vacated folders | Only in book-local mode, only when empty, decided from `bookFolder` | In a root every folder is shared, and being wrong there deletes the records root |
| Stale `obsidian://` deep links | One silent export on book open | Nothing else rebuilds them, and a rename usually happens with the book closed |
| Within-chapter order | `cfi_sort`, a padded CFI string | `loc` ties across paragraphs, and a tie sends Bases to `file.name` and alphabetizes |
| Not a sequence number | Stability | A number shifts every later record on insert; live export cannot rewrite hundreds of files per highlight |
| Unplaceable-CFI sentinel | A digit run, not `~` | Locale collation sorts punctuation BEFORE digits |
| Deep link in a table | Markdown in the property, no formula | Bases renders markdown in a table cell; `link()` takes only a path or file |
| Deep link in list / cards | An `html()` formula over `link_url` | Markdown renders in tables ONLY; a formula needs an href, which markdown cannot give |
| Both link shapes stored | `link` and `link_url` | The same trade as `book`/`book_title`: one renders, one is machine-usable |
| `link` vs `formula.Open` in a view | `link` for tables, `formula.Open` for lists, never both | Both together puts a line of raw CFI above the working link |
| Link in the record body | Yes, below the passage | List and cards navigate to the record, and a landing page needs a way onward |
| `excerpt` in `html()` | Never unescaped | Book text is untrusted, and a `<` would inject into the cell |
| Generated YAML | Obsidian's canonical form | Otherwise the reader's file is rewritten the moment they open it |
| Column headers | `displayName` on every column and group-by property | A header reading `book_title` shows the reader the plugin's internals |
| Grouped-by property as a column | Never | The group header already carries the value; the rule reverses per book, where `chapter` groups |
| `link` column position | Last | An action, not a fact about the passage |
| Base YAML lives in a pure module | `records-base.ts`, tested | It encodes a dozen undocumented Bases facts; a screenshot is not a regression test |
| Regenerating views | Never overwrite silently; an explicit overwrite only | The reader owns the file; a `(defaults)` twin per base accumulates |
| Derived/user boundary | An HTML-comment marker | Note text is derived, so "body written once" cannot hold |
| Missing marker | Write no body at all | Deleting it must be an opt-out, never a way to lose work |
| Deleting an item in the reader | Trash the record, unless the reader has something in it | An untouched note kept forever behind a flag is clutter, and the flag then stops meaning anything |
| Deleting an item noticed by comparison | `orphaned: true`, never trash the file | An unsynced `.orbis` makes every record look deleted, and a deletion does not heal on the next pass |
| The veto | Wrote in it, added a property, or linked to it | All three are the reader investing in the file; `note_text` is not, since it mirrors what they just deleted |
| Highlight deletion | Unconfirmed; notes keep `confirmDeleteNote` | A highlight costs seconds to recreate; a note's prose does not come back |
| `orphaned` on every record | Always written, never absent | A `!= true` filter must not depend on how Bases reads a missing value |
| Orphan filter placement | Base level, not per view | Twenty views is twenty chances to forget one |
| Expected ids for the sweep | All saved content, ignoring the kind toggles | Switching bookmarks off is not the same fact as deleting a bookmark |
| The flag is cleared too | An unsynced `.orbis` makes everything look gone | Otherwise one bad open leaves a permanent scar |
| Cleanup of records you wrote in | Listed, never deleted for you | There is no button here that deletes prose |
| Removal method | `trashFile` | Obsidian's own recovery still applies |
| Cleanup confirmation | Split by `recordKeepReason` | A blanket warning over a mixed set trains you to click through it |
| Batch export beside live export | Kept, as repair and catch-up | Same files, same paths — which is what makes either trigger idempotent |
| Live write timing | Debounced 4s after quiet, silent | A burst of edits is one write; a toast per highlight is worse than no feature |
| Backfill | No separate path — the normal write is a full idempotent pass | A second path could disagree with the first |
| Repeat-write cost | `frontmatterMatches()` against the metadata cache | No I/O, so an unchanged settle writes nothing; otherwise every highlight rewrites every record |
| The change hook | One `recordsChanged()`, called from the three persist methods | Many call sites that each must remember a hook is the pattern this avoids |
| `recordKinds` | Bookmarks off by default | A bookmark adds the most files for the least searchable value |
| Settings layout | Plain Settings, no custom CSS | Obsidian's dropdowns carry a hidden measuring clone, so an imitated folder row cannot be made to match |
| Per-annotation tags | One (`orbis-reading-record`) | Per-mark tags explode and duplicate the `mark` property |
| Tag namespace | Kept the `orbis-` prefix | Both bases filter on it, so it is a query key — a bare `reading-record` would pull in the reader's own notes |
| The legacy tag | Notes heal themselves; bases are migrated in place | `frontmatterMatches` compares `tags`, so a note rewrites on the next pass; a base cannot, and rewriting its filter keeps views the reader added |
| All three kinds off | Not allowed — the last one locks | It would mean "keep a record, but nothing counts as content for it", which is what turning the record off says properly |
| Table column source | An `excerpt` property, not a `file.name` formula | A filename must be sanitized; punctuation stripped mid-sentence reads as broken English |
| Filename | `kind — excerpt — shortid` | Kind groups in the explorer; the id is what makes it stable |
