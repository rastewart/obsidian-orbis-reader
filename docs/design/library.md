# Library

← [Design Docs](README.md)

A catalog of everything you have, whether or not it is in the vault. One view, opened from the ribbon into the
main window, built on ordinary Obsidian notes: a note per title, collections that gather them, files as optional
attachments, and **Read** and **Listen** as equal ways in.

---

## The problem

The file explorer shows files by folder: no cover, no author, no progress, and books scattered across folders never
appear together. Any surface keyed to book files has the same limit — **it can only describe files that are
present**, and a sizeable ebook collection is not something anyone keeps whole inside a synced vault. Ebooks are
binaries of a few megabytes each, so a thousand of them is gigabytes replicated to every device on the account. The
realistic pattern is a large catalog with a handful of titles present at any moment — which means a library keyed
to files describes the handful and hides the catalog.

A per-book scan of the vault's `!orbis-data` folders, parsing every location file and sidecar, is also wrong for a
view that renders on open, on every vault change, and on every filter keystroke.

Two consequences set the design targets:

| Target | Why |
|---|---|
| **Thousands of records, most with no local file** | The common case, not an edge case. A file-keyed index would hide the majority of a collection |
| **Records whose metadata came from elsewhere** | Collections are usually already cataloged in another tool, and that metadata should not have to be re-entered |

---

## Why the record is a note

**A library item is a note. A file is an attachment of that item, and it is optional.**

Five things follow, and together they are the argument:

1. **The catalog is not limited to what is present.** In a collection of any size most titles have no local file,
   and those are records with no local copy rather than absences.
2. **Tags become real Obsidian tags.** Global search, Bases, Dataview and the Properties editor all work on them.
   A private tag namespace that nothing else could see is avoided entirely.
3. **Duplicate editions stop being a problem.** An `azw3` and an `epub` of one title are two entries in one
   record's `files`, not two rows.
4. **A record can precede its file.** Browse a catalog, save the record, download later or never. A wishlist is
   impossible when a record requires a file.
5. **The index gets smaller.** Frontmatter is in `metadataCache`, parsed and in memory, so reading it is an API
   call rather than a reconciliation against file mtimes.

**And the value stops depending on Orbis being your reader.** A title read on a dedicated e-reader, a resource
held in another application, a book owned in print — all are records the library shows, filters and rummages
through. That is deliberate: a tool that only catalogs what it can open is a feature of a reader; a tool that
catalogs what you have is worth using on its own.

### Books first, other media not prohibited

The mechanism is media-agnostic — items are notes, `type` is a string — and the *experience* is built for books.
Other types work because nothing stops them, not because we designed screens for them. A record with `type: DVD`
shows its cover, its tags and its collections, and offers neither Read nor Listen, because there is nothing to read or
play.

That line is where a general-purpose collection browser usually goes wrong: committing to everything and being
mediocre at each. We commit to books and refuse to build a wall.

---

## Who owns which part of the UX

The catalog lives in frontmatter, which means **Obsidian can already render most of it** — a `.base` built over
these notes does cards grouped by reading status with cover images, a table sorted by author, and an "added in the
last year" view. A custom view has to say what it adds.

| Capability | Owner | Why |
|---|---|---|
| Tables, sorted and grouped, over frontmatter | **Bases** | It has a filter language, formulas and saved views. We will not out-build it |
| Cover cards, group by any property | **Bases** | `image: note.cover` already does this |
| Editing a property by hand | **Obsidian Properties** | Native, familiar, and works on every note |
| Full-text search across records | **Obsidian search** | Because the store is notes and tags, this is free |
| **Reading progress, last opened, resume point** | **Library** | Lives in `.orbis` and location files, which Bases cannot see |
| **Whether a file is present, and which formats** | **Library** | A frontmatter link says nothing about whether its target exists |
| **Whether a recording exists** | **Library** | Derived from the audio folder, not from the note |
| **Read / Listen as one tap** | **Library** | A link in a Base opens the *note*; only a plugin can open the reader or start the player |
| **Covers for books with no cover image** | **Library** | Requires unzipping the file |
| **Browsing and downloading catalogs** | **Library** | Network, credentials, acquisition links |
| **Rummage** | **Library** | A seeded pick is not a filter |

Three rules keep the boundary from blurring:

1. **The library never becomes a table.** No column configuration, no formula language, no saved query views.
   Anyone who wants that has Bases, reading the same frontmatter.
2. **The library links out, not around.** A facet chip for an author opens that author's note when one exists. A
   record row links to its note, and to its [`.orbis` data view](orbis-data-view.md) when the book has one, so
   the reader can see highlights, notes, bookmarks and stats in the view already built for it.
3. **Actions are addressable, so every surface can trigger them.** The `orbis-nav` protocol handler takes
   `file`, `cfi`, `loc`, `pct` and `listen`, so a generated note body can carry **Read** and **Listen** links that
   work from a Base card, a hover preview, a Canvas, or the note itself — without the library being open. That is
   the cheapest way to make Orbis reachable from surfaces we do not own.

---

## Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Where catalog metadata lives | **A note's frontmatter** | The catalog must describe titles the vault does not hold, and tags must be Obsidian's own |
| 2 | Where reading state lives | The `.orbis` sidecar | It belongs to a file, is per-device-heavy, and must work with no note anywhere |
| 3 | Progress in frontmatter | **Never** | A page turn would dirty a markdown file and flood sync |
| 4 | What a collection is | A source: a folder, a tag, a frontmatter property, or any combination | Folder and tag cannot express the ordinary case — a catalog imported from one tool, in one folder, untagged, distinguished only by a field like `source`. Rules built by picking, not a query language |
| 5 | Field names | Chosen on merit; an alias map for other people's variants | A generator's names can be broken, or encode sort order |
| 6 | Notes we did not write | Edited surgically via `processFrontMatter`, inside a marked region | A record may be authored by the reader's own script |
| 7 | Cataloging | Discovery + one-tap and bulk generation | Without it a vault of books shows an empty library |
| 8 | Taxonomy notes | **Not generated** | One note per author across a large catalog is a lot of vault to own a facet a collection and a summary widget already provide |
| 9 | Where the view opens | An `ItemView` in the **main window**, from a ribbon button | Covers and filters need width; the mobile sidebar is a drawer that closes on tap |
| 10 | The index | `metadataCache`, plus an in-memory projection | Frontmatter is already parsed and in memory; no database earns its place |
| 11 | Reading and listening | **Equal primary actions** | Listening is a first-class way to consume a book, not a submenu of reading |
| 12 | Filtering | Facets plus free text | A query language is a second thing to learn and a parser to maintain |
| 13 | The name | **Library** | It holds documents and other media, not only books |
| 14 | OPDS formats | See [Book Sources](book-sources.md) | Parse OPDS 1.2 (Atom) first, behind an interface — it is what Calibre speaks, and Gutenberg's XML feeds are expected to sunset in 2027 |
| 15 | OPDS credentials | See [Book Sources](book-sources.md) | `app.secretStorage`: credentials never enter `data.json`, which syncs |
| 16 | Reading another application's database directly | **No** | Desktop plugins *can* reach outside the vault (`require('fs')`, ungated) but mobile cannot, and a library manager that offers OPDS is reachable from both |
| 17 | Where a cover lives | **A file in the vault**, one folder, shared with reading records | A cover only Orbis can see undercuts the reason for notes-as-records; `image: note.cover` in a Base is the test |
| 18 | The view's shape | **Dashboards of widgets** | Continue, Rummage and Not-cataloged are collections wearing special clothes; making them ordinary is a simplification |
| 19 | `type` | **A managed list that offers, never validates** | A blank box gets three spellings of one type; an exporter's types are not ours to reject. `type` is the medium, `genre` the work |
| 20 | Where field settings live | **One field manager**, absorbing the type list and the alias map | Three pages about fields is two too many, and declaring a field must add affordances rather than permission |

---

## The record

A library record is a note whose frontmatter describes a title. Nothing else about the note matters — the body
is the reader's.

```yaml
---
orbis_note: title             # THE test — a note without this line is not a record, however good its title
title: "Sample Book: A Subtitle"
aliases:
  - "Sample Book: A Subtitle"
type: book                    # the medium: book, dvd, audiobook, whitepaper — cataloging writes `book`
genre: ""                     # what sort of work it is: novel, commentary, reference, documentary
authors:
  - "Tester, Orbis"
publisher: "Sample Press"
publication_date: "2026-03-28"
language: en
series: ""
series_index: ""
subjects: []                  # normalized list
isbn: ""
asin: ""
tags: [fiction, adventure]
rating:                       # 1–5, absent when unrated
cover: "[[covers/sample-book.jpg]]"
files:                        # zero or more; one title, several editions or formats
  - "[[epub/Sample Book.epub]]"
source: import                # where the record came from: import | opds | markdown-note | vault | a tool's name
source_id: ""                 # that source's own identifier, when it has one
source_url: ""                # any URI scheme, including application-specific ones
source_notes: []              # links to the notes a converted book was made from — see Cataloging
reading_status: ""            # interested | reading | read | abandoned; absent is the fifth answer
date_read: ""
added: 2026-05-03
---
```

**A value may be a link, and reads as its name.** A vault that keeps a note per author writes
`authors: ["[[people/Jane Doe|Jane]]"]`, and the library shows the **display name** — the alias where there
is one, otherwise the basename — rather than the path. Not the same helper `cover` and `files` use: those answer
"which file does this point at", which for an author would file a book under a folder. The same reading applies to
`series`, `publisher` and `subjects`, because a vault that links one of those probably links the others.

**A record is a note that says `orbis_note: title` and has a title.** That is the whole rule. Everything else is
absent until something writes it — a note with the line, a title and a tag is a valid, useful record, the floor for
cataloging a book you own in print. See [Cataloging](#cataloging) for how notes without the line get it.

### Names chosen on merit

The schema's names are chosen on merit rather than taken from any one exporter, whose accidents would come along
with its conventions:

- **`type` is the medium and `genre` is the work.** These are two questions — a thriller can be a book or a DVD,
  a commentary can be a book or software — and one field forces compound values like "DVD thriller" that nothing
  can filter cleanly. Two synonyms such as `type` and `kind` would leave nobody able to remember which holds "DVD";
  `genre` is what a catalog calls the second question. Provenance stays `source`.
- **Orbis ships one value for `type`: `book`.** It is the only medium cataloging writes. A reader with a DVD
  shelf or a folder of whitepapers names those on the Fields page — a list of media we imagined would be a list
  of guesses. `genre` ships none at all.
- **No aliases ship for either.** A vault writing `type_label` says so once on the Fields page; reading that key on
  everyone's behalf would be a guess about a tool Orbis has never seen.
- **A format-specific link key becomes `files`, a list.** Something named for one format cannot hold an `azw3`, a
  `cbz`, two editions of a title — or an audio-only record.
- **Per-source keys are standardized** into `source`, `source_id`, `source_url` and `added`. A generator that
  emits `<tool>_id` and `added_to_<tool>` forces every facet, sort and filter to know about each tool by name, and
  a new one means touching all of them.
- **`subjects` is a single normalized list.** Generators often emit both a raw string, sometimes with delimiters
  left inside it, and a cleaned list of the same information. Only the cleaned one is worth keeping.

And one value convention: **reading status is a bare token**, not `01-reading` / `02-interested`.

A numeric prefix is how a Base would group statuses in reading order rather than alphabetically, since groups are
ordered by the value being grouped on. It is not needed: `groupBy` accepts `formula.X`, so the ordering can live in
the view rather than in every note. Group order still comes from the formula's *output*, so the number does not
disappear — it **moves out of the data into one view's label**. That is worth doing, because with prefixes in
frontmatter every consumer sees `01-reading` — facet chips, the Properties editor, global search, other Bases, other
scripts — whereas a formula decorates one view and leaves the note saying `reading`.

The library **tolerates both**: it strips an `NN-` prefix when reading a status and writes back whichever convention
the note already uses, so a facet chip reads "Reading" regardless. Orbis never *introduces* a prefix into a note it
generates, because a bare token can always be decorated by a formula and a decorated one cannot easily be
undecorated.

### The schema is the contract

**People generate these notes themselves.** A collection is often already cataloged in a library manager or a
reference application, and a script that reads that database and emits notes is a first-class way to populate the
library — not a workaround for a missing importer. So:

1. **We read what you wrote.** The Fields page holds an alias map — a `*_label` display name, a format-specific
   link key, a grouped-versus-raw list, per-tool ids and dates — with the same aliasing
   [Localization](localization.md) defines for template tokens and frontmatter keys. Aliases are read from the
   start, not left for later: without them a collection shows an exporter's raw type code, and a record whose file
   link has another name finds no file.

   **The map is the reader's, and no aliases ship.** Every entry Orbis could ship would be a guess about someone
   else's exporter. A field's own key is always read first, then its aliases in the reader's order. A vault whose
   keys nobody has mapped reads its canonical keys and says so on the Fields page, which is a smaller failure than
   reading `user_rating` on the assumption that it meant yours. `community_rating` is never a rating: the crowd's
   average is a different fact from your opinion, and showing it as yours is a lie the interface cannot walk back.

   **Aliases affect reading only** — writing always uses the canonical key, or Orbis would be writing into a field
   the reader's own script then overwrites.
2. **We never rewrite your note.** Every edit goes through `app.fileManager.processFrontMatter`, which touches
   the keys named and leaves the rest — unknown keys and the whole body — untouched.
3. **A new title note's body is the reader's, and empty.** Notes used to carry the book's embed in a marked region,
   `%%orbis:begin%%` … `%%orbis:end%%`. It said nothing `files` does not — a link in a property opens the book and
   counts for backlinks and the graph — and it was a second copy of the book's path that a rename could leave behind,
   so `recordNoteContent` writes the frontmatter alone. Notes that still have the region are handled: the cleanup takes
   it out before its emptiness test, and a rename re-points its links.
4. **Filenames are the title**, disambiguated only on collision. An id in the filename is noise in link
   autocomplete; `aliases` and `source_id` do that work in frontmatter.

### What is derived, and what is written

**Progress is never written to the note.** It is read at render time from the `.orbis` sidecar and location files
of whichever linked file is present. A percentage in frontmatter would dirty a markdown file on every page turn.

Status follows from what is known, with the note as an override:

| Status | Rule |
|---|---|
| `unread` | No location file for any linked file, and no override |
| `reading` | A linked file has a location, and is not read |
| `read` | `date_read` is set — by reaching the end, or by the reader saying so |
| *(anything)* | A record with no file keeps whatever status the note states; nothing can change it automatically |

`date_read` cannot be derived cleanly. Reaching 100% is a poor proxy: a reader who stops at the endnotes has
finished, and a scroll to the back cover has not. So it is explicit — set from the library, offered when a book is
closed near the end.

---

## The two stores

Two stores with different jobs, which is not the same as two sources of truth:

| | The note | The `.orbis` sidecar |
|---|---|---|
| Holds | What the title *is*: name, authors, tags, rating, where to get it | What reading it *did*: progress, highlights, notes, bookmarks, recordings, preset |
| Exists when | You cataloged it | A file is present and has been opened |
| Written by | You, your scripts, and Orbis | Orbis only |

Two rules keep them honest:

- **`.orbis` stays self-sufficient.** A book dragged into the vault and opened must work perfectly with no note
  anywhere. The catalog is a layer above the reader, never a dependency of it.
- **If a record exists, it wins for display.** The library shows the note's title and authors, not the sidecar's
  guesses, because the note is the one a person curated.

They meet in the interface: a record with a `.orbis` links to the [Orbis data view](orbis-data-view.md), which
already presents that book's highlights, notes, bookmarks and stats. The library does not re-render any of it.

### The join

A record points at files through `files:` as **wikilinks**, and **a rename re-points them**: `relinkTitleNotes()` in
`title-note-rename.ts` rewrites the `files` entries naming the old path, and the links inside Orbis's own region of
the body, as the rename handler moves the sidecars. Not left to Obsidian's link updating, which asks first, and the
answer is anyone's guess: with No, `files` kept naming the old file, so the Library no longer knew which book the
note was for. It writes only notes
that name the old file, so a rename does not rewrite and re-sync the library; text outside the region is the
reader's and follows Obsidian's answer.

The reverse direction — given an open book, find its record — is `metadataCache.resolvedLinks`, exactly as
`scanBacklinks()` does for the backlinks panel. The library builds that reverse map once and updates it from
`metadataCache.on('changed')`.

Where a link is missing, a **same-folder, same-basename** fallback matches a file to a record. It never guesses
across the vault: a wrong join silently attaches your progress to the wrong title, which is worse than no join.

**Orbis writes those links as the full vault path** — `recordLinkText`, used by cataloging and by the converter
alike. `metadataCache.fileToLinktext` is wrong for a record: it writes the shortest unambiguous form, so a book whose
name is unique today is recorded as `[[Book.epub]]`, and the day a second `Book.epub` lands in another folder that
link means a different file. Read would open the wrong book, and the delete cleanup could not tell the two records
apart — both silently.

The usual argument for the short form is that it survives the target moving. It costs nothing here, because
`resolveRecordFile` falls back to Obsidian's own linkpath search when no path matches: a full path resolves exactly
when it is right, and is still found by name when it has moved. The short form has no equivalent answer for
ambiguity, so the trade is one-way.

Both forms resolve, and the converter rewrites a record's links whenever it writes to it.

---

## Where configuration lives

Title notes, sidecars and covers are files in the vault, so every device sees the same catalog. The field table,
collections and dashboards travel through [Multi-device sync](multi-device-sync.md): each is published as versioned
records — one file per item per device, named `orbis-sync.<type>.<item>.<device>.json` and found by name wherever
they are — and merged by the newest version. This section holds the line between what is shared and what is
local, which the sync design takes and generalizes.

### The line: what is shared, and what is local

| | Where | Why |
|---|---|---|
| Field table (aliases, value names and order) | **Shared** | It changes what the library *reads*. A device without your aliases parses records differently — fields come back empty, groups vanish, counts differ. That is a correctness problem, not a preference |
| Collections | **Shared** | A saved query is right or wrong regardless of which device is asking, and widgets reference them by id |
| Dashboards — what they *are* | **Shared** | Built once, wanted everywhere |
| Dashboards — order, and whether this device uses them | Device storage | See below: this is the useful half of not syncing |
| Which dashboard is showing, dismissals, debug switches | Device storage | Statements about a device, not about a library |

**A dashboard is shared and used per device**, and that split is worth more than either half alone: build a
dashboard on the desktop, switch it off there, and it is live only on the phone. It also gives a draft state — a
dashboard that exists and is switched off everywhere — which is otherwise only expressible by not having built it
yet.

Widget-level `enabled` stays in the dashboard. A widget is part of what a dashboard IS, and making it per-device
too would produce a state nobody can hold in their head: this dashboard, on this device, with these four of its
seven widgets. The feature that already solves that is a second dashboard.

### One file per item

**A file each, not a file of everything.** One file per collection and one per dashboard means a sync collision
costs one item rather than the set, and it stops an edit to one thing from rewriting a file another device is also
touching — which is what makes collisions likely in the first place. Files are named by item id, not by name: a
widget references a collection by id, and renaming is then an edit rather than a delete plus a create.

They are `.json`, which Obsidian's file explorer does not list: it shows the types it can open, plus any a plugin
has registered. That is why a book's `.orbis` file IS listed and badged — Orbis registers the extension and gives
it a view — while the `.json` location files beside it are not. Nothing registers `.json`, and nothing should: it
would claim every JSON file in the vault. They sync like any other file.

Nothing else in the library reads them by path: cataloging, the candidates pass and the folder rules all walk
Markdown files, so a `.json` beside the notes is invisible to every one of them.

### Finding them on a device that has never been configured

A fresh device syncs the vault and needs to find this configuration — but any folder setting sits in the
`data.json` that did not sync. So **discovery is by name**: a device with nothing configured works from a cold
start, which neither a fixed setting nor a first-run question can manage.

### Order, and the first time a device sees a dashboard

Dashboard order and the on/off flag are both per device, and both live in one list in device storage
(`library/dashboard-place.ts`, ordered by `library/dashboard-order.ts`):

- **An id with no dashboard is dropped**, so the list cannot grow with the dead.
- **A dashboard with no entry is appended, enabled.** A dashboard that arrives switched off is one you go hunting
  for; one that arrives visible takes a single toggle to dismiss.
- **A device with no list at all** — the first run after a sync — orders by a `created` timestamp inside each
  dashboard. Without it the first order is whatever the filesystem returned, which is neither stable nor the same
  as the other device's. `created` is written once and never edited.

Reordering therefore publishes nothing. It is a cosmetic act, and making it rewrite synced files would invite
conflicts for no gain.

Collections need none of this: nothing displays them directly, so they are listed by name.

**List order carries no meaning once items are files.** A new widget asks for the provided All titles collection by
id (`defaultWidgetCollection`), falling back to the first title collection by name, rather than taking the first
collection read. Any code that treats the order of a synced list as meaningful gets whatever order the vault was
read in.

### One field table, not one per note kind

**Reading records and title notes share a vocabulary.** The two share exactly two keys, `cover` and `tags`, and
both mean the same thing in both places. Nothing shares a name while meaning something else. The near misses relate
correctly: a reading record's `author` really is the book's author.

The stronger reason is what the table is FOR. It maps *your existing keys* onto the fields Orbis reads, and it
names and orders a field's values. Reading records are **written by Orbis**, so there is no prior convention to
map: nobody has their own spelling of `cfi_sort`. Most of a record's keys are machine plumbing, and the values that
might want naming — the marks — arrive in the note already named.

So: one table, one file, no scope in the schema. `fieldKeys()` asks one question with no scope, which is what
parsing, collection rules, grouping and sorting all depend on. The Fields page keeps reading-record fields legible
by grouping them under a heading — a presentation choice, not a schema commitment.

### Never act on a partial view of the vault

Code that watches these files must not treat what it can see as the whole answer:

- **Empty is not "deleted".** Every file gone at once is a folder being moved, a sync mid-flight or someone tidying;
  a real delete arrives one file at a time.
- **Partial is not "all there is".** Writing one file per item fires an event per `create`, so a watcher must ignore
  events while our own writes are in flight, released on a short tail because Obsidian delivers those events after
  the write resolves.
- **Unread is not "empty".** Nothing is written until the vault has been read, or every item looks new and every
  file is rewritten with a fresh stamp — churn that sync carries.
- **`vault.getFiles()` answers with what the vault has INDEXED**, which at `onload` on Android can be nothing.
  Reading configuration early is right on a desktop and on a warm start; reading it again on `onLayoutReady` is what
  makes a cold start on a phone correct.

---

## Capabilities: read, listen, elsewhere

A record's actions come from what is actually attached to it, not from a single availability flag. Reading and
listening are **peers** — if you want to go straight to the player, that is one tap, the same as opening the text.

| Capability | Present when | Action |
|---|---|---|
| **Read** | A linked file is in the vault and Orbis can open it | Opens the reader, resuming where you were |
| **Listen** | The same, and the title has a recording or a live voice available | Opens the player directly, resuming the audio position |
| **Get** | An acquisition link exists | Downloads into the vault; the record then reads and listens. See [Book Sources](book-sources.md) |
| **Open source** | `source_url` is set — **any** URI scheme | Hands off to the OS. Applications that hold content commonly register their own scheme, and handing off to one is a first-class outcome, not a fallback. *Known limit: on macOS a desktop application's scheme can launch the application without landing on the resource, while the same links work on Windows — the URI shape is right and the fault is platform-side, in `window.open` or in how that application registers its scheme.* |
| *(none)* | A record with nothing attached | It is a catalog entry, which is a legitimate thing to be |

**Detecting a recording costs nothing.** Recorded audio lives under `!orbis-data/audio/<book file name>.audio/`, and
those files are vault files, so the same in-memory `vault.getFiles()` list that gives the index its mtimes gives
it the set of books with recordings. No directory probing per row.

Both actions are also addressable, so they work outside this view: `orbis-nav` takes a `listen` parameter
alongside `file`, `cfi`, `loc` and `pct`, and a generated note body carries both links inside its marked region.

### Audio-only titles

A record whose `files` hold only MP3s is *listenable and not readable* — and the model above already expresses
that without a special case, which is the point of listing capabilities rather than one state. Playing loose audio
the way a generated recording is played is real work (no spine, no CFIs, so position, chapter labels and the
scrubber all need another source of truth) and is **explicitly not in this design**. What this design owes it is
only that `files` is a list, capabilities are derived per file type, and nothing assumes a text spine exists.

---

## Collections

**A collection is a named question about the catalog**, not a container: filters over a note's folder, its tags and
its frontmatter, plus how the answer is grouped and ordered. Nothing moves to be collected, which is what lets one
title belong to several.

A collection is a definition; where and how it is shown is a separate thing, a widget, and naming them separately is
what stops the two from being confused — the same collection can appear twice on one dashboard in two
presentations. See [Dashboards](#dashboards).

A collection carries a name, its filters, a group-by, a sort, and an enabled flag. Collections are an ordered,
user-managed list — the same shape and the same drag-to-reorder list as the look-up destinations, deliberate reuse
of a pattern already built and tested on a phone.

**Every set condition must hold.** Folder and tag and property, narrowing — a filter with two conditions is
someone saying "the tagged ones in here", and one that matched either would quietly include the whole folder. A
collection with no conditions is rejected rather than gathering the vault.

The property condition earns itself on the ordinary case: a catalog imported from one tool lands in a **single
folder, untagged**, distinguished only by a field like `source`. Folder and tag cannot separate two such imports
from each other, so without it a real import cannot be gathered at all.

A note matching more than one collection appears in each. Identity is the note's path; there is no separate id to
keep unique. A folder-scoped collection is also how satellite notes stay out of the catalog: author and series
notes live elsewhere, so they never match.

**Two collections may differ only by their sort**, and that is fine rather than duplication to be designed away.
"Recently added" and "Everything" can carry identical filters and different ordering, because each then names a
thing a person means. The alternative — letting a widget override the collection's sort — makes the collection stop
describing what it shows.

### Types

`type` is read as free text — a catalog exported from someone else's tool has its own types, and none are ours to
reject — and written from a managed list, since a reader offered a blank box will spell the same type three ways.

The Fields page is that managed list, and it decides what is **offered**, never what is **allowed** — a record whose
type came from an exporter keeps it, appears in facets, and is never silently rewritten. That distinction is the
whole design.

Orbis ships **one** value, `book`, rather than a set of guesses about someone else's shelf; a reader who wants
`document` or `blog` adds it. `type` (the medium) sits beside `genre` (the work), and nothing reads `kind`.

**A key nothing reads is left where it is.** An older record may carry `kind: book` or `orbis_title_note: true`, and
its medium is blank until something writes `type`. All of it is inert: the parser ignores what it does not read, a
stale key costs a line of YAML, and a blank field costs a group heading nobody grouped by. So there is no migration
pass and no cleanup command — a rewrite over thousands of notes to delete two words is a large, risky act in
exchange for tidiness. Regenerating a catalog from its source fixes all of it as a side effect.

Converting a note to an EPUB asks for the type, and for where the record note goes, so the result lands in the
library as the thing it actually is rather than as a generic document.

### The field manager

The alias map (which keys mean the same thing), the type list (what values `type` offers) and the field manager
(user-added fields, which of them can group and sort a collection, and their defaults) are one page. Three settings
pages about fields is two too many, and someone looking for "where do I tell it about my `use_count` field" would
find the wrong one.

So one page lists every field the library knows about, each row carrying what there is to say about it: the keys it
is also known by, whether it offers a fixed set of values, whether it appears in the group-by and sort pickers, and
a default. The type list is a field whose values are managed; the alias map is a column.

Two things it must not become. **It cannot be a schema.** A record with a field nobody declared still works,
still shows, still filters — declaring a field adds affordances, never permission, which is the same rule the type
list follows and for the same reason: the vault is full of fields written by tools that never heard of us.
And **it cannot be required.** Everything works with no declarations at all; the page exists to make the pickers
shorter and the labels friendlier, so a reader who never opens it loses nothing.

### Rule sets

The filter grammar is a **rule set**:

- A **rule** is a property, an operator and a value: `source is calibre`, `isbn exists`, `title contains hand`.
- A **rule set** is a list of rules combined with **all** or **any**, chosen per set.
- A **collection** is a list of rule sets, combined with **any**.

That is sum-of-products — an OR of ANDs — and it is deliberately the whole grammar. Any flat boolean condition can
be written in that form, so **nesting buys nothing**, which is what keeps this a structure rather than a language:
no text expression to parse, no parentheses, no operator precedence, no error states. Email rules and Bases'
filter builder are the same shape for the same reason.

- **Folder and tag are rules too**, so the model is uniform: `folder is under Books`, `tag is scifi`,
  `source is calibre`. Special-casing two conditions while the rest are general is how a model starts to lie about
  itself.
- **Operators, minimum viable set**: is, is not, contains, exists, does not exist, plus the date and number
  operators below.
- **Rules read raw frontmatter keys, not canonical fields.** A rule is a statement about the note as written, and
  the key picker lists what the vault actually contains. Matching through the alias map as well would mean a rule
  on `source_url` silently also tested every key aliased to it, which is a double indirection nobody can see.
- **The live count is per rule.** One wrong value in one rule is the failure mode, and a set-level count cannot say
  which rule emptied it.

A rule is **read as a sentence with a pencil**, not three inline controls: an inline text field partway down a
dialog that grows a row at a time puts the keyboard over whatever is being typed, and a small dedicated editor is
the pattern these settings use everywhere else. The collection dialog goes **full screen on a phone** rather than
being pinned above the keyboard, because its only text field is at the top: capping its height to clear a keyboard
cuts off Save. When a field holds few enough distinct values, the rule editor offers them as a list, so most rules
never open a keyboard at all.

There is no query language and no second Bases — see [ownership](#who-owns-which-part-of-the-ux). Rules are built by
picking, never by typing an expression.

---

## Cataloging

A vault full of books and no notes must not show an empty library. That is the one way a note-keyed library is worse
than a file-keyed one, and it is fixed by making cataloging cheap, obvious and bulk.

**Discovery.** Every file in the vault that Orbis can open, which **no record links to**, is uncataloged. It is a
set difference over data already in memory — the vault's file list minus the reverse-link map — so it costs
nothing to keep current.

**It is a notice, not a section.** A short list of files is a section; a list of hundreds is the whole screen, and
either way it is a **job to be told about** rather than dashboard furniture. So the dashboard carries one line —
"12 books in your vault have no title note" — with a Review action, and settings carries the tool. A widget would be
the wrong shape: it would be the only widget that ACTED rather than showed, and a permanent slot for a job you
finish claims it is part of the library.

**Dismissing the notice remembers the SET, not the feature.** A flag would turn it off the first time it was
inconvenient, and a book added a month later would never be mentioned. What is stored is a hash of the paths that
were waved away, so the notice returns the moment the set changes. A separate switch turns it off for good, because
"not now" and "never" are different intentions.

**Generation, one title.** Read the EPUB's OPF and write a note: `dc:title`, `dc:creator`, `dc:publisher`,
`dc:date`, `dc:language`, `dc:identifier` and Calibre's `<meta name="calibre:series">` cover most of the schema,
so a cataloged book knows who wrote it without anyone typing. A format with no OPF falls back to the `.orbis`
sidecar of a book that has been opened, and then to the filename — which is a poor title and an honest one,
where an author guessed from a filename would be a fiction in the catalog.

**Attaching, rather than creating.** A stray file is often another copy or format of a title already cataloged,
and the honest action then is to add it to that record's `files` rather than write a second record. We can
suggest this, never decide it: a wrong attach corrupts a curated record and has to be noticed before it can be
undone, while a wrong create leaves a note you delete in seconds. Signals are ranked by how hard they are to get
wrong — same folder and basename with a different extension (the two-format case, needing no metadata at all), a
matching ISBN, then a matching normalized title with an author in common. Normalization folds case, diacritics,
punctuation and a leading article but **not** trailing parentheticals, because `(Sample Series Book #3)` is
exactly what distinguishes one book from the next. Titles are compared from the book's own metadata rather than
the filename, which is where an exporter's naming quirks live.

**A review, not a question per book.** A bulk run that only creates, skipping its matches, is a dead end: a matched
file could never be cataloged, and the skip is invisible once the notice fades. Asking once per file is no better;
each answer is given with no idea how many are left or whether the ones before it were right. So the matching pass
runs first and the whole intention goes on one screen, in two groups — **books with no title note** and **books
that may match one** — with the reason for each match visible, the count of each group, and **nothing selected to
begin with**, since both halves write to the vault and one of them edits notes someone curated — except a review of
the one book someone asked about from a menu, whose row starts ticked: that request is the tick. Reading a book's
metadata is an archive read per file, so the review scans before it can show a list — slowest for MOBI, whose
parser initializes the whole book to reach the header.

**Each matched row chooses what its tick means**: attach the file to the note it matched, or write a note of its
own. That choice has to exist, because two translations of one novel are two titles and the same book in epub and
azw3 is one, and nothing in the metadata can tell those apart. A control on the group sets every row at once,
including the rows not currently drawn — an imported vault often has many of these and they usually want the same
answer.

**It ends on a report, not a toast.** A run can touch hundreds of notes, and a count that vanishes in five seconds
is not something anyone can check. The dialog stays open on what was written and where, what was attached to which
note, and what failed with the reason it gave — failures first, since that is the part with something left to do
about it.

**Nothing is ever overwritten**: a name collision is resolved by disambiguating the new note, and a record's
existing cover is never replaced by whatever the attached file happened to carry.

### Attaching by hand

The review attaches a file to the note it **matched**. There is no gesture to attach one to a note you **pick
yourself** — for a file whose metadata matches nothing, an odd export, a title spelled differently by whoever wrote
it.

**The case is rare and it already has an answer.** Two files for one title is usually two formats of the same book
in the same folder, which the strongest signal catches without any metadata at all. What is left is a file the
matcher cannot place, and someone who wants that file on a particular note can open the note and add the path — the
`files` list is ordinary frontmatter, and a link typed there reads exactly like one the review wrote. A picker over
every title note in the vault, for a gesture used a handful of times, is not worth the surface.
`attachFileToRecord` is the function such a gesture would call.

**Documents catalog themselves.** Both EPUB generators are ours, so a converted book is not left to a scanner that
then guesses at what it is. Full design in [Markdown to EPUB](markdown-to-epub.md#the-library); what matters here is
what it means for the catalog.

- **A title note is written whenever the library is on**, and never when it is off. Writing is not optional: the
  scanner would then report a file you deliberately left uncataloged, and the fix for that is path exceptions the
  output may not even land in. Always-when-on has no failure mode.
- **The record is about the EPUB, so the EPUB is its identity.** Same output file means update that note; a new
  output file means a new note. Convert one source twice to two destinations and you get two books, two records,
  and one source note linked from both — which is honest, because they are two books with two reading positions.
- **`source_notes` is a standard field**: a list of links to the notes the book was made from. One entry for a
  single note, one per note for a folder converted into one book. It is what gives the source note a **backlink**
  from the book it became, which a URI in `source_url` could not.
- **The converter owns exactly the fields its dialog collects** — title, author, language, publisher, publication
  date, type — and touches nothing else. A rating, a reading status, tags and a hand-written body all survive a
  regeneration, because the dialog has no opinion about them. `aliases` follows the title, since it is a copy of
  it; the note's **filename does not**, because renaming a note to match a retitled book breaks every link into it.
- **`source` says what shape it came from**: `markdown-note` for a single note and for each book in the
  book-per-note mode, `markdown-folder` for a folder converted into one book.
- **The cover is already answered.** A converted EPUB carries no artwork, so it gets the drawn title-and-author
  tile like any other coverless book.

A record can therefore acquire `source_notes` without the converter having created it: regenerate onto a path some
other record already links and that record is updated, because the record is about the file and the file just
changed.

**What makes a note a record: one key with a value, `orbis_note: title`.** Every note Orbis generates carries a
`title`, so `title` alone would put a row per exported chapter into the catalog, and a list of exclusion markers
makes the rule a sentence nobody can finish: *any note with a title, unless…*. Not a family of booleans either — two
flags permit a note that claims to be both, and every new species would mean another key for the parser to know
about. One key is one question, and a collection can filter on it directly (`reading_record` is the other value).

The cost is taken deliberately: **a note nobody has stamped is invisible**. Silent-and-fixable beats found-and-wrong,
because the fix ships with it:

- Cataloging writes the line on everything it creates.
- The catalog review has a third group — every note that has a title and has never said what it is — with
  select-all and one write per note. A marker heuristic (`orbis_generated`, `book`, `chapter`, `note_set`,
  `open_chapter`, `export_date`, `generated`) decides only what to *offer* there: a wrong suggestion costs an
  unticked checkbox, where a wrong rule would cost a catalog full of chapter notes.
- A command stamps the note you are looking at.
- The Library settings page states the rule and counts what qualifies, so a template that stopped writing the line
  is visible rather than mysterious.

**There is no catalog entry without a download.** A book source writes **a title note for a download and nothing
else**: the alternative is a vault filling with notes about books nobody has, and a catalog whose entries mostly
cannot be opened teaches the reader to distrust all of them. See
[Book Sources](book-sources.md#what-the-library-adds-when-it-is-on).

**And your own script stays first-class.** None of the above is required. A record written by a Python script that
reads another application's database is the same record; discovery skips the files it already links, and Orbis
edits only the keys it owns.

---

## Taxonomy notes

An author page, a series page, a subject page — a note whose body holds a live query for everything matching it —
is useful in surfaces this view will never reach: graph, backlinks, mobile search, hover preview. Orbis does not
generate them: see [Taxonomy notes are out of scope](#taxonomy-notes-are-out-of-scope).

**Facets are collections.** Group one by author and a summary widget lists every author with a count, each row
opening the titles under it. Nothing is generated, nothing goes stale, and the rows carry the actions a query cannot.

---

## The index

**`metadataCache` is the index.** `getFileCache(file).frontmatter` is already parsed and in memory for every note
in the vault, so the library keeps only a projection: one row per record with the fields it sorts and filters on,
built on open and updated from `metadataCache.on('changed')` for the single note that changed.

A projection row is a few hundred bytes, so a catalog of several thousand records is well under a megabyte and
filtering it is a `.filter()` over an array. No database earns its place at this size. The projection is disposable
by construction, so adopting a store later costs nothing.

Two other things come free from the same in-memory file list: **which linked files exist** and **which books have
recordings** (a `!orbis-data/audio/<file name>.audio/` folder). Neither needs a filesystem probe per row. Each format of a
book has its own state, keyed by its whole file name, so "the edition you have been reading wins" can tell an EPUB
from the AZW3 beside it.

---

## Covers

**A cover is a real image file in the vault, in one place, and `cover:` points at it.**

A per-device cover cache renders a grid perfectly well and is invisible everywhere else: Properties, Bases cards,
hover previews and any device that has not built its cache yet all show nothing. Since the whole argument for
notes-as-records is that the catalog should work in Obsidian's own surfaces, a cover that only Orbis can see
undercuts it. `image: note.cover` in a Base is the test: it either works or the model leaks.

The cost is worth stating: an extracted cover is tens of kilobytes and the vault syncs, so a large catalog is
measured in tens of megabytes. Downscaling on extraction — longest edge 600px, JPEG — is what keeps that from being
hundreds. Extraction is **opt-in for a bulk run** and automatic for one book: paying it across a folder of hundreds
nobody has cataloged yet is a cost taken without being asked for, where one book is a deliberate act on a title
someone chose.

**Every format, by a different road**, because they have nothing in common. EPUB and CBZ are zips, so only the
entries needed are inflated — the manifest's cover for one, page one in natural order for the other. MOBI and AZW3
are Palm databases whose cover is reachable only by offset, read through the parser the reader already ships. FB2
keeps its cover as base64 inside the document. A PDF has none without rendering a page, and gets a drawn one.

**A book with no artwork gets a cover drawn for it** — title, author, and a hue derived from the title, matching
the tile the view renders for a record with no `cover` at all. Written as a file rather than left as a rendered
tile, because a tile exists only inside Orbis: an image in the vault shows up in Properties, in a Bases card, in a
hover preview, and on a device that has never opened the Library.

**One place, not two.** Reading records have no cover of their own: a record's `cover` is the image its title note
points at, and with the library off, or no title note, or no cover on it, a record simply has none. One JPEG per
book, never two under different names.

**Cataloging takes a cover once**, so two commands reach a record that already exists: take it again (for a book
cataloged before covers, or a file since replaced), and replace it with a drawn one (for a cover that turns out to
be a converter's generic device icon). The second is explicit and always will be — nothing in the bytes
distinguishes a placeholder from a deliberately plain cover. There is no bulk pass over every record that lacks a
cover.

Render order, first hit wins:

1. **The record's `cover`** — a vault image, through `getResourcePath()`. A catalog imported from another tool
   usually brings its covers with it, which makes this the common case and costs nothing.
2. **A remote cover URL** from a catalog record — fetched **only when book sources are enabled**, and saved to the
   covers folder rather than held per device, so it becomes case 1 from then on. The cover comes from the downloaded
   file, and the feed's URL is the fallback for a file that carries none — so the second request the
   one-request-per-action rule guards against happens only when there is nothing else to draw. See
   [Book Sources](book-sources.md#what-the-library-adds-when-it-is-on).
3. **A tile rendered in the view** — the same title, author and hue as the drawn file, for a record whose `cover`
   is missing or broken. Costs nothing and needs no write.

There is no per-device thumbnail cache: the vault file is the store, and a render cache is worth adding only if
the grid on a phone needs one.

The `coverImage` data URL inside `.orbis` is a separate thing: written per book on first open, used by the reader
and PDF export, and **not** what the Library renders.

---

## The view

### Where it lives

An `ItemView` in the **main window**, opened by a ribbon button and a command.

A cover grid, a filter row and a catalog browser all want width, and on a phone the sidebar is a drawer that closes
the moment you tap something in it. The main window gets the full screen on both platforms, and opening a title
replaces the library with the reader in the same leaf — what a browser does, and what the reader already expects. A
user who wants it in a sidebar can drag the tab there.

### Dashboards

A hardcoded list of sections would need a setting to remove one and code to add one. **Continue, a suggestion and a
recordings shelf are collections wearing special clothes.** Continue is "started, newest first, ten of them". A
suggestion is one title drawn from the unread pool. Making them ordinary is a simplification rather than an
addition — and it is what lets someone who never wants a suggestion remove it.

- A **dashboard** is an ordered list of widgets. The ribbon icon opens the active one.
- A **widget** shows a collection in a view. It carries everything about *this appearance* and nothing about the
  collection itself.
- **The collection says what; the widget says how.** That is the line to defend when someone asks why the view is
  not on the collection: one collection can appear twice on one dashboard, five titles as covers and all of them
  as a list. Group-by and sort stay on the collection, because they describe the answer rather than its
  presentation.

```jsonc
// A widget
{
  "kind": "titles",          // which slice of the collection — see below
  "label": "Recently added", // optional; falls back to the collection's name, then the kind's word
  "collection": "<id>",      // ALWAYS set; the system collection is every title in the vault
  "view": "covers",          // how it appears on the dashboard
  "count": 10,               // how many titles to show there
  "expandedView": "list"     // ABSENT means no expand button
}
```

**Every widget draws from a collection.** Collection is the population, kind is the question asked of it, view is
how the answer looks — three independent axes. That is what makes "search, but only inside this folder"
expressible: the one thing a large catalog most wants. The provided widgets point at the system collection.

**The kinds.** `titles` shows the collection itself; `search` is a box and its results; `continue` is what you have
opened, most recent first; `recordings` is what has generated audio beside it; `recent` is newest by the record's
own `added` date; `pick` suggests one title nobody has decided about — see
[What a pick suggests](#what-a-pick-suggests); `summary` counts the collection by its grouping — see below. Four of
those are derived from what sits beside the book on disk — location files, an audio folder — so no filter over
frontmatter could express them.

#### What a pick suggests

Two rows on the widget, and the split between them is the split the library draws everywhere: **a reading status is
data in the note, and whether a file exists is derived from the vault.**

- **Titles shown** — *any title*, or *titles with no reading status*. The second is expressible as a
  collection (`reading_status` **does not exist** matches an empty value as well as a missing key), and it is a row
  here anyway: the provided dashboard draws from **All titles**, which cannot be filtered, so without it the widget
  cannot do the thing it is for until someone builds a collection first.
- **Only titles with a book file** — off by default. This one *cannot* be a collection: a frontmatter link says
  nothing about whether its target exists.

**The rows say the rule and nothing else.** One short line sits on the first row, because there is exactly one fact
the row cannot be read to answer: flagging a book to read takes it OUT of the suggestions. Guidance belongs here and
in the settings reference rather than in a dialog that goes full screen on a phone, where two paragraphs cost a
third of the visible height. The fact stays out of the option label: "titles with no reading status, including want
to read" reads as though flagged books were included.

Two decisions inside the first row:

**A status of any kind takes a title out, `interested` included.** A status is a decision about a book, and a
suggestion is for the books nobody has decided about — a flagged book is one you have already picked. What you have
been meaning to read is a different question, and its answer is a collection of that status with a pick of its own.
Special-casing `interested` would also mean guessing at what a reader's own status values mean, which nothing else
in the library does.

**"Never opened" is not a rule.** It would exclude a book you opened for thirty seconds and put down, which is
exactly what a suggestion is for, and silently exclude the book you are part way through — a fact the book states by
carrying a status, two taps from inside it. The visible cost: until statuses are set, the book you are reading can
be suggested. Accepted, because a hidden clause would make the row's own description untrue.

**Titles with no file are not excluded on the reader's behalf.** A library item is a note and its file is optional —
a book owned in print or held in another app is worth being reminded of, and its row already behaves: the
capability model drops Read and Listen and leaves the title note.

**A pick's population depends on a field nothing displays.** The repaint skip asks "does anything on screen show
this key?", and a status set from inside a book shows nowhere on a dashboard of covers — so `widgetPoolFields` says
which fields a widget *filters* on, and the two are asked together.

#### The summary widget

One row per group with its count, and tapping a row opens that group's titles. It is `arrangeRecords` with the
records left out, so it reuses an arrangement that is already built and tested.

**The grouping is the collection's**, like every other kind's arrangement. So one collection grouped two ways is
two collections — and a collection that groups by nothing summarizes to a single row saying how much of it there
is, which still opens. `count` means rows on the dashboard, exactly as it means titles elsewhere, and the page
behind a row shows all of that category: having asked for one, you want the category rather than the first five
of it.

Two options a summary carries of its own:

- **A totals row** — off, the sum of the rows, or the items in the collection. The two totals differ only for a
  multi-valued grouping (a book with three authors is in three rows and is one item), so each is labeled for
  what it counts rather than both saying "Total".
- **Showing values nothing uses**, offered only where the grouping field HAS a list of values to be missing from.
  Group by author and there is no vocabulary to be absent from — the values ARE the records. An empty row is
  dimmed and does not open, because the page behind it would be empty; it is a report that you have none of
  these.

**Group order lives on the collection** (`groupOrder`: value order, most first, fewest first), not on the widget,
because a grouped list prints the same groups as headings and "biggest genre first" means the same thing in both.
Ties keep the order they arrived in, so a summary read every morning does not reshuffle itself.

A category page does not re-group: you are there because you picked that category, so printing it again as a
heading over the whole list is a tautology. **The widget's `view` says how those titles look** — a list, a shelf
of covers or a table. On a summary that field describes nothing on the dashboard, where the widget draws category
rows rather than titles, so it is free to mean the page a category opens into; the editor labels it *Category
view* there. The Fields tab applies to that page for the same reason. When the last title leaves a category the
page falls through to the summary — the category is gone, and the summary is where the answer now is.

**A kind that IS an ordering ignores the collection's ordering; a kind that is only a filter takes it.** Continue
means "most recently opened"; recently-added means "by the date the record carries"; a pick means "one, chosen".
A collection's sort applied to any of those would be a contradiction someone could configure and nobody could want.
`titles` and `recordings` are filters over a population, so grouping and sorting that population is exactly the
collection's business.

**Search gets a switch, because it is the one kind that generates an order of its own**: best match first, or the
collection's order. Its results are never grouped either way — a heading between search results subdivides an
answer nobody asked to have subdivided.

**A scoped widget says so in its heading** — "Search · Jane Doe" — unless its collection is the system one, which
is every title and so tells you nothing. Without it, a search over part of the catalog reads as a search that
failed the first time something is missing.

**A pick has to hold still.** The Library repaints on every vault change, and a suggestion that reshuffled each
time would be gone before it was considered. So it is a hash of the note path and a seed rather than a shuffle: the
same seed picks the same book, and Pick another draws a new seed. The seed is random per view, not the date: a
day-seeded pick shows the same books in the same order every time the view is opened.

**A widget can say what a tap means.** The recordings shelf opens the player rather than the text, because those
titles are there BECAUSE they have audio. It is a preference, not an override: a title with nothing to play falls
through the ordinary chain — read, else open where it lives, else its note.

Four decisions inside that shape:

**`expandedView` is one field, not two.** "Can it expand" and "how does it look expanded" as separate fields can
disagree — expansion on with no view, or a view set on a widget that never expands — and something then has to
decide what those mean. Absent means no expansion, and there is no inconsistent state to handle. The dialog can
still show a toggle that reveals a dropdown; that is a convenience, not a second fact.

**The expanded view has no count of its own.** Expanded means all of them, and a second number is a knob nobody
tunes. The consequence is a rendering one rather than a setting: a collection of several thousand titles rendered
in full on a phone wants virtualization or a cap.

**A widget has a `kind`, because not every widget shows a collection.** A pick is a kind rather than a view:
"choose one at random and hold it" is neither a sort nor a presentation. No kind lists a set of **files** rather
than title notes: that would be a widget that acted rather than showed — see [Cataloging](#cataloging).

**The expand button appears when the expanded view DIFFERS, not only when titles are held back.** A strip of covers
shows artwork and nothing else, so "see these as a list" is worth offering even when the list holds exactly the
same ten titles. Same view and nothing withheld is the one case with nothing to offer.

**A widget may carry its own label.** One collection can appear on a dashboard twice, and the two headings have to
differ; "Continue" also reads better as a heading than whatever its collection ends up called.

**System dashboards and widgets can be disabled, never deleted.** The default dashboard is what the icon opens on
a fresh install, so it has to exist; it can be copied, and set aside once another is active. The invariant is that
**at least one dashboard is active**, enforced by the UI rather than explained by it.

**Drill-in is navigation, and navigation needs a way back**, so the expanded view replaces the dashboard in place
and offers a back affordance rather than opening a tab nobody asked for. Repaints keep their scroll position, which
matters more than it sounds: this view repaints on every vault change, and a synced note arriving must not send a
half-read dashboard back to the top.

**The provided dashboard is rebuilt from code on every load**, and only its on/off flag is remembered. That is what
makes it safe for an update to change: there is no stored copy to migrate and no user edit to overwrite, because
editing it is not offered — copy it and the copy is yours forever. A dashboard someone has customized is
recognized by its widget ids and handed back to them as their own rather than replaced.

**It opens read-only.** It is the worked example — seven widgets, four kinds, a count, an expanded view, fields —
so it expands like any other dashboard and every control in it is frozen. What you learn there is where each setting
lives, and copying it then feels like the same screen rather than a new one. Its widget rows carry an eye rather
than a pencil: the icon is what says whether opening one will let you change anything.

**A dashboard is edited under its row, not in a dialog.** A dialog would put the widget editor two modals deep,
which is where Obsidian's focus restore runs out of anything to restore to — on Save the keyboard would leave both
dialogs for the settings window behind (see
[dialog-system.md](dialog-system.md#a-child-dialogs-save-must-not-rebuild-the-list-it-opened-from)). Expanded in
place, the widget list sits on a page we own, and the widget editor is opened from a page like every other editor in
these settings.

It is also less walking: changing what a widget shows means changing a collection, and the collections are on the
same page, one scroll away. The body has no Done button and no title, because every change in there is saved as it
is made. Deleting a dashboard is a ✕ on the row, with a confirmation, and renaming is the first field in the body.

**A frozen value still has to read as a value.** Obsidian dims a `disabled` control, which is right for a control you
are finished with and wrong for one that IS the content: a dimmed name reads as placeholder text, as though the
field were unset. `.orbis-frozen-dialog` gives frozen controls normal text and leaves the disabled background, which
is the part that says "not yours to change".

Frozen by a sweep — `disabled` on every `input`, `select`, `textarea` and `button` in the body — rather than by a
flag threaded through thirty controls, which grows a hole the first time a control is added. `disabled` rather than
`pointer-events: none`, so a keyboard cannot reach what a finger cannot. The tab row is marked `data-live` and left
alone: freezing it would put two thirds of the configuration out of reach, since Fields and View are where half the
settings are. What is not merely frozen but absent is anything that would change the shape — Add a widget, the move
arrows, the drag handle, Delete — because a disabled control that could never be enabled is furniture.

**On a dashboard, covers are a strip you swipe; expanded, they are a grid.** A widget on a dashboard is a sample
sitting above other widgets, so it has to stay one row tall whatever its count — ten covers wrapping into four rows
is what pushes everything below it off the screen.

### Which fields a widget shows

A table widget and columns on a list are one capability with two renderings. **A widget carries an ordered list of
fields**, and the view decides how they are drawn: under the title in a list, in the tooltip on a shelf of covers,
one column each in a table.

**One list for every view**, so switching a widget from list to table and back never loses the choice. It is a
built list rather than a ticked set, because order is half the setting: "author · series" and "series · author"
are different rows, and a checklist has nowhere to say which. The picker is a third tab on the widget editor,
between General and View.

Three states, and the difference between the last two matters:

| The list | What a title shows |
|---|---|
| Never chosen | The author and the series |
| Chosen, empty | Nothing beside the title, which is a real thing to want on a shelf of covers |
| Chosen | Those fields, in that order, skipping what a title has nothing for |

Skipping rather than spacing over is what keeps a row describing the record instead of the widget's configuration.

**The formatting rules are decisions, so they live in `library/display-fields.ts`** rather than inside a render
function where nobody can find them: a series carries its number (`Saga #2` — two frontmatter keys, one fact), a
rating says what it is out of (`4/5`, because a bare 4 in a column of numbers could be a page count or a year),
and `type`, `genre` and `reading_status` read as the reader named them — the same value names the group headings
use, so a status column and a status heading in one widget cannot disagree about what `read` is called.

`title` is not offerable: it is the row's own heading and the table's first column. `cover` and `files` are —
a table of titles and their EPUB paths is a reasonable thing to want, and refusing it because the value is a link
would be an artificial line.

#### A field's own name

A field has an optional caption, for the one place a field's NAME is shown: a column heading. Without such a place,
a display name would be a second name for something you only ever see as a frontmatter key, which only confuses.

It is a **caption, never a rename**: never written to a note, never matched against, never shown where a key is
meant. The Fields page leads with the key, with the caption quiet underneath it, so the page keeps saying what it
says everywhere — these are the keys your notes hold, and you cannot change them here.

**Every picker names a field by its key** — Look at, Group by and Sort by, as the condition rows, the widget's
field list and the Fields page already did, and as Obsidian's Properties and Bases do. The pickers used to show a
friendly word, which gave one field three names (`publication_date` in the note, "Published" in the picker, a
caption on top) when a rule has to be written against the one in the note. What is not a field of the note — Folder,
Tag, the two first-letter groupings, Last opened — has no key, and keeps its name. The dashboard is display, not
configuration, so its group and Summary headings still read in words.

Headings fall through four layers, and the bottom two mean a label is usually unnecessary:

```text
the reader's caption → the plugin's word for the field → the key humanized → the key
```

Orbis names its own fields because humanizing says "Isbn" and "Source url". `publication_date` heads as
**Published**, and `authors` as **Authors** even though sorting by it is "Author" — a column holds several, a sort
key means one, and both readings are right where they are.

### The table

A third view type beside list and covers: the same titles, the same fields, turned sideways.

**The title is the first column, always.** It carries the tap, the long-press menu and the row's identity — and
because a list and a table read one field list, making the leading column configurable would make every list
row's leading line configurable too. Less flexible, and deliberately so; the constraint is worth revisiting only
if something concrete needs it.

**Sorting from a heading is transient**, held on the view for as long as it is open: ascending, descending, then
back to the collection's own order. The collection owns the order, and a heading tapped while reading is a way of
looking rather than a change to the widget — one that silently rewrote its own configuration when you glanced at
a column would be a surprise with no undo. The third state exists so a heading tapped by accident has a way out
that does not require remembering what the order was.

It sorts on **what the column shows**, not on the raw frontmatter, so a status column sorts by the name it
displays. Numbers inside text compare as numbers, so `#2` precedes `#10`. Empty cells sort last **in both
directions** — a title with nothing to say about a column is not the top of the list, and flipping the arrow must
not make it so.

**One table per section, not one per group.** A table per group would auto-size to its own contents, so a column
would begin at a different place under every heading and could not be read down the page — which is the one thing a
table is for. Group headings are rows inside the table, spanning it, sticky to the left with the title column so
panning right never leaves a block nameless. The section owns one horizontal scroller, so on a phone every group
pans together.

The `⋯` is the last column, and it is the same button a list row ends with. A right-click or long press anywhere
on the row opens the same menu, which is the gesture a list row and a cover both already answer.

### Dates, grouped and filtered

**One derivation, used from both ends** — "added in the last 30 days" is a filter over a computed value and "added,
by month" is a grouping over the same one. Built separately there would be two answers to what a quarter is, and
they would disagree the first time anyone checked.

#### What parses, and in whose day

ISO forms only: `2026`, `2026-08`, `2026-08-16`, and full timestamps. `file.last-opened` joins them, being epoch
milliseconds from the sidecars — which is what makes "what have I actually READ this month" a grouping rather
than a widget of its own.

`08/16/2026` is deliberately refused. It is ambiguous by locale, and guessing wrong files a book in the wrong
month silently — the class of error nobody reports because it reads as their own misremembering.

**A date-only value is a LOCAL calendar date**, and a timestamp is converted to local before bucketing. Parsing
everything as UTC would put a book finished at 8pm on the 31st into the following month.

Anything unparseable joins the leftovers row — and so does anything that does not say enough for the frame being
asked. **That row is named for what is missing, not for the field**: a note dated `2017` grouped by month HAS a
date and no month, so calling that "No date" argues with the year printed beside it.

| The frame needs | The row reads |
|---|---|
| a year (year, decade, how long ago) | No date |
| a month (quarter, month, month of the year) | No month |
| a day (week, day) | No full date |

One row rather than two. Notes with no date at all and notes whose date stops at the year both genuinely lack the
month, so one honest label carries them — and splitting a leftovers row in two rarely changes what anyone does
next.

#### Calendar buckets

Chosen in a second dropdown under Group by, labeled **Time frame** and shown only when the field's values
actually look like dates — sampled from the collection, so a reader's own `purchase_date` qualifies and a fixed
list of ours would have missed it.

| Bucket | Heading | Sort key |
|---|---|---|
| Year | 2026 | `2026` |
| Quarter | 2026 Q3 | `2026-Q3` |
| Month | August 2026 | `2026-08` |
| Week | Week of 11 Aug 2026 | `2026-W33` |
| Day | 16 August 2026 | `2026-08-16` |
| Month of the year | August | `08` |
| Decade | 2020s | `2020` |

**A key beside every label**, because chronological order is not alphabetical order and a heading is written for a
reader. `RecordGroup` carries the raw value beside its label, so this needs no new machinery — the keys above sort
correctly as text.

Month-of-the-year and decade are the two that ignore part of the date on purpose: the first answers "do I buy
books in December", and the second is what makes a publication-date grouping usable at all, where by year it is
eighty groups of one.

**Weeks start on Monday** (ISO 8601), which also settles what "last week" means in a filter.

#### Aging bands

The same dropdown offers bands measured from today rather than positions in a calendar:

| Band | Days |
|---|---|
| Upcoming | dated after today |
| Last 30 days | 0–30 |
| 31–60 days | |
| 61–90 days | |
| 91–180 days | |
| 181–365 days | |
| Over a year | 366+ |

**Bands partition; filters threshold.** A grouping has to put each record in exactly one bucket, so "last 30" and
"last 60" cannot both be bands — but a filter saying "in the last 60 days" absolutely should include the last 30.
That is the division of labor: a filter selects, a grouping partitions.

**Upcoming is a band rather than leftovers.** A book published in 2027 has a date; a note with no date has none,
and filing them together would answer two questions with one row.

Bands are **relative to today and recomputed on every paint**, so a title at day 30 moves band tomorrow. That is
inherent to aging rather than a defect, but it does mean such a widget is not stable across a midnight.

The bands are fixed. Six boundaries cover the question people actually ask, and a per-collection band editor is a
lot of dialog for a rare want.

#### Ordering

Calendar buckets run oldest first and aging bands run Upcoming first, which is wrong as often as it is right: a
"by month" grouping usually wants the newest at the top. Group order has a fourth option, **reverse**, which
serves both — and Z–A for an ordinary field, which is why it is a general option rather than a date-only rule.
A date-only special case would mean one setting quietly meaning "oldest first" for one field and "newest first"
for another.

**Both directions are named for the field** (`orderWords`), in Group order and on Sort by's direction button alike:
Oldest first / Newest first for dates (Newest first leads under "how long ago", January to December under "month of
the year"), Lowest / Highest first for numbers, and A to Z / Z to A for text. A field with a value list says whose
list sets the order (`orderSource`): In the field's order, or In this collection's order once the collection has one
of its own — each with its reversed twin, "In … , reversed". "Groups in value order" and "Ascending" named no order a reader could predict — a reading
status in its value order is neither.

**The group with no value stays last** when the order is reversed or by size (`orderGroups`): it is not a value, so
it has no place in a value order read backwards — reversed years opened on "No date" above the newest. In value
order it stays where it is, because the Fields page lets a reader place "No value" themselves.

#### The five operators

Over the same parser:

| Operator | Value | Means |
|---|---|---|
| is in the last | `30` | days, counting back from today, inclusive |
| is more than … ago | `365` | days — the neglected-books filter |
| is in | `this month`, `last month`, `this quarter`, `this year`, `last year`, `this week`, `last week` | a named period |
| is before / is after | `2020-01-01` | a fixed date |
| is on this date, any year | — | the anniversary |

Boundaries are inclusive throughout, and the dropdown puts them under a **Dates** heading — "is in" beside
"contains" reads as a list of unrelated verbs until you notice half of them are about time.

#### And four over a number

**is more than**, **is at least**, **is less than**, **is at most**, offered where the field's values are numbers —
so `rating is at least 4` is one condition.

`contains` is not offered there. A number has no fragments — `rating contains 4` would match 14 and 40 — so a
numeric field gets the comparisons instead, the way a folder gets "under" rather than "contains".

**A field is one shape or the other, never both.** A `published` field of bare years samples as dates AND as
numbers, and offering both would put "is more than" in the dropdown twice meaning two different things: days ago,
or a plain comparison. Dates win, because a four-digit year in a field of years is a date and a rating of 4 is
not.

**Sorting is left out.** The Sort dropdown sorts a date field by its raw value, so "by month, then title within the
month" already works and a time frame there would only re-impose an order the grouping has.

### Filtering

**A search widget** exists because a large catalog is a thing you look INTO. It matches title, authors and series:
every term, in any order, anywhere, so "tester sample" and "sample tester" both find the book. A title that starts
with what you typed ranks first, or "sample" buries *Sample Book* under every other title that mentions samples.
Typing repaints the results and nothing else, and vault-event repaints are deferred while the box has focus — an
input rebuilt under a moving cursor loses the caret and eats the next keystroke.

### Advanced search

Advanced search is designed and not built; [Roadmap](roadmap.md) tracks it. Three capabilities, grouped under one
name because they are one decision:

1. **More fields in the text match.** `matchesQuery` builds its haystack from title, authors and series. Adding
   `subjects` and `tags` finds a book by what it is ABOUT — a subject word finds a book whose title never uses it,
   a tag finds every note that carries it — which is a different search.
2. **Facet chips**, derived from the results rather than fixed: search "history", and the chips are the authors,
   types and statuses actually present in the matches, with counts. That answers "what is in this pile" and lets
   someone drill without knowing what to type. Static chips only ever offer what we thought of.
3. **Why a row matched**, once a match can come from a field the row does not show.

**It is a widget setting, not a change to search.** Matching more fields makes every search broader for everyone,
and title-and-author is genuinely enough for some readers — on a large catalog a subject word goes from a handful of
titles to every book whose subjects mention it. So the search widget's editor carries the switches: which fields the
text matches, and whether the chips appear. The default stays title, authors and series, and the reader who wants
the broader search asks for it where they configure the widget that does it.

Three things to get right:

**The chips come from the Fields page.** Any field with a value list — `type`, `genre`, `reading_status`,
`language`, `source` — is a facet, and the chip labels are the names the reader gave those values.

**Chips within one facet OR together; facets AND across.** Two authors means either; an author plus a type means
both. Standard facet semantics, and the only ones anyone predicts correctly.

**Chips are not a collection.** A collection is a saved filter with a name; chips are ad-hoc narrowing that is
never saved, because a search is where you are rather than what you keep. Blur that and the plugin has two filter
languages, one of them hidden inside a search box.

Text stays substring, case-insensitive and diacritic-folded, so "every book with *hand* in the title" needs no
syntax and "everything by Jane Doe" is one chip.

**This is search *over* titles, not *inside* books.** The multi-scope search ([Search System](search-system.md))
searches text within a book, and the two must not become one box that sometimes means each. Adding `Library` as a
scope there is not part of this design.

### Empty and building states

- **No collections** — never happens: the provided **All titles** and its dashboard are rebuilt at every load, so a
  new user's Library already shows every title in the vault.
- **A collection with nothing in it** — says so, where its titles would be.
- **A search matching nothing** — says so.
- **Books with no title note** — the notice at the top of the dashboard counts them and offers **Review**, which
  opens cataloging.

### Keyboard and accessibility

The grid is a real focus surface: arrows move, Enter opens, and the a11y lint holds every control to a name. A
cover is an image with the title as its alternative text, never a bare tile. Status and capability must be legible
without color — a word, not only a dot. Read and Listen are separate named controls, not one control with a
modifier.

---

## OPDS

OPDS is [Book Sources](book-sources.md), a capability of its own. It does not need the library: what a reader has to
consent to is contacting servers off their device, not keeping title notes, and a download's product is a file in a
folder while the library's is a note. See that document for the sources, the parser, credentials, the
one-request-per-action rule and what downloading has to say out loud.

What stays the library's business: **with the library on, a download writes its title note** — cataloging is how a
title is found again, and a reader who keeps notes about their titles has already answered that. A download's cover
follows [Covers](#covers), and there is no title note for a book you have not downloaded — see
[Cataloging](#cataloging).

---

## Title notes, and where they live

The note that describes a title is called a **title note** in the interface. The code calls it a record, but
"record" is our word; a title note says what it is to someone who has never read this document.

If their folders get a section under Library, it keeps one deliberate asymmetry — see
[Library folders](#library-folders):

- **Where new title notes are written** is a setting, because writing needs a decision.
- **Where title notes already are** is *observed*, not configured: a read-only list of every folder that currently
  contains them, with counts. Collections already gather title notes from anywhere, so a list you maintained would
  be a second source of truth that goes stale the first time you move a folder. A list that watches cannot.

---

## Turning it off

The Library has a switch, and it governs everything: the ribbon icon, the palette command, its settings beyond the
switch itself, and the library fields on the note-to-EPUB dialog. Turning it off closes any open Library too, since
a switch that leaves one in a tab has not done what it says.

**Off by default**, like every capability here that writes to the vault — reading records, book sources,
multi-device sync are all off until someone answers for them. A switch that reads on while its setup is unanswered
offers a checklist task to turn on something already on.

The [Setup](settings.md#setup--the-first-page-and-the-one-first-run-experience) checklist carries the question, and
declining sets the flag, so a reader who never opens the Library toggle is still asked once.

## Turning it on — the first-run questions

**A switch that writes notes asks where they go before it writes any.** Reading records work the same way: turning
the mode on opens *"Where should reading records go?"*, and **cancelling leaves the feature off** — a dropdown
reading "On" over a setting that stayed off is the lie the dialog exists to remove.

`LibrarySetupModal` opens when the Library toggle goes on with `librarySetupDone` unset (`chooseLibraryOn`), and
asks two questions, in this order:

1. **Where new title notes go**, with a proposed folder. The one setting that must be answered before anything is
   written, so neither cataloging nor the note-to-EPUB converter has to invent an answer for the vault root.
2. **Whether to save cover images, and where.** About 40 KB a book, which is the number someone deciding wants.
   The folder defaults to a path derived from the answer above, so the second question usually answers itself.

Then an offer rather than a question: **"N books in your vault have no title note — review them now?"**, shown when
something is waiting, so the review is reachable from the end of setup instead of found later in settings.

**Not asked here:** aliases, which are mapped by hand on the Fields page when a vault needs them; the uncataloged
notice, which is a preference rather than a decision; and anything about dashboards, since a provided one is already
there.

**Asked once.** `librarySetupDone` carries a retroactive inference: a vault that already has a records folder, or a
collection or dashboard of the reader's own, has answered this and is not asked again. Turning the library off and
on does not re-ask either — the answers are still true. A dev command resets the flag for testing. In **Setup**,
`library` is one of the counted items in `SETUP_ITEMS`, and answering it there is the same `chooseLibraryOn` call.

---

## When a book is deleted

**A deleted book takes its title note with it, unless the reader has invested in the note.**

The rule is `titleNoteKeepReason` (`library/title-note-cleanup.ts`), deliberately the same shape as the reading
records' `recordKeepReason`, with one reason they do not have:

| Reason | The note stays because |
| --- | --- |
| `other-files` | The record still lists another file. One title, two editions: deleting the EPUB says nothing about the PDF. |
| `wrote` | There is prose below the frontmatter, **outside Orbis's own `%%orbis:begin%%` region**. |
| `properties` | It carries a key the library never writes — a reading status, a rating, a project tag. |
| `linked` | Another note links to it, and removing it would break that link somewhere nobody is looking. |

**Orbis's own region is not the reader's writing.** Older title notes carry the book's embed in
`%%orbis:begin%% … %%orbis:end%%`, so the region is taken out before the emptiness test, by the same constants that
wrote it, so the two cannot drift. A new note has no region, and an empty body: nothing to take out, nothing left. Anything *beside* the region still counts — which is why
this is markers rather than a heuristic — and an unterminated region takes everything after its opening marker with
it, since reading half of our own block as somebody's prose is the failure being avoided.

Checked in that order, since a note can qualify twice and the reader is told one reason. Nothing kept is silent:
each reason has its own notice, because "Orbis kept this" and "you did something Orbis respects" are different
messages and only the second is true.

**Trashed, not removed.** The `.orbis` sidecars bypass the trash — they are internal data the reader never sees —
but a title note is a note in their vault, so it goes where a deleted note goes and can be brought back. That
asymmetry inside one handler is intentional.

**A kept record loses the row for the book that left.** `files` is machine-read — Read and Listen are computed
from it, and so is this cleanup — so a row pointing at nothing is a claim the record cannot back up, and one that
can come true wrongly: a different book of that name added later satisfies the same link through the name
fallback. The note keeps the title; it does not keep the claim.

**The extracted cover goes with the note, when nothing else wants it.** Three conditions, all required: the image
is inside the covers folder (a file cataloging wrote — a `cover:` pointing at the reader's own attachment is
theirs and is never touched), nothing links or embeds it but the note being trashed, and it goes to the trash.

Canvas files are **read directly** rather than trusted to `resolvedLinks`. Obsidian documents that map as "all
resolved links" without saying what may be a source, and it belongs to a Markdown metadata cache — so whether a
canvas embedding an image appears there is undocumented and could change between versions. A few JSON parses on
the one occasion a cover is about to be trashed turns an assumption about Obsidian's internals into a fact about
the vault. An unreadable canvas keeps the image: the cost of a stray cover is a file in a folder, and the cost of
the other mistake is a picture that is gone.

---

## Reading records on dashboards

A **second species of note** joins the library: the reading records the reader export writes, one per highlight,
note or bookmark, carrying `excerpt`, `mark`, `book`, `chapter`, `orbis_cfi` and the rest of `RECORD_PROPERTY_KEYS`.
Dashboards offer them only while Reading Records is on — a dashboard that offers to gather something the reader has
switched off is a menu of nothing.

**They are not a variant of a title note. They are a different thing the library can gather**, and everything below
follows from refusing to blur the two.

### The species key is a requirement

`orbis_note: reading_record`, as `orbis_note: title` is for a title note. A record without it is not gathered;
regenerating the records adds it, and costs nothing but the run, since records are derived from the book's own
annotations.

**One key, one question.** Inferring a record from the presence of `orbis_cfi` is the heuristic the title notes
refuse, and it would make "is this a record" a guess in the one place the library cannot afford one.

### One projection, both species

The `metadataCache` pass that gathers title notes gathers records in the same walk. Every highlight is a note, so
records soon outnumber titles, and a second pass would double the cost of every repaint.

### Fields: three lists, one definition each

The Fields page has a level. Opening it offers:

| List | Holds | Editable |
|---|---|---|
| **Title note fields** | the fields the library reads on a title | configure only |
| **Reading record fields** | the fields it reads on a record | configure only |
| **Custom fields** | fields the reader added | add and delete |

**A custom field is defined once, not once per species.** One entry, one set of aliases, one value list — and it
appears in a species list when a note of that species actually carries it. Membership is derived from use rather
than declared, which means the third list is where you define a field before knowing where it will be used, and
nothing has to be told twice.

#### Declaring a field is not how a field comes to exist

This is the opposite of what a relational instinct expects. There is no schema to add a column to. **The vault is
the schema.**

Write `shelf: Study` into a note and the library reads it. Nothing has to be declared first, and three things
work immediately:

- It appears in the condition, Group by and Sort dropdowns, because those offer the keys the notes actually carry.
- It groups, sorts and filters like any other field.
- A collection can name and order its values, since the value list is offered for any plain frontmatter field.

**What the Fields page adds is naming — and one thing that is not naming:**

| What declaring buys | Cosmetic? |
|---|---|
| A description on the Fields row, so the list says what the field is for | yes |
| A column heading, for a table | yes |
| Value names and order at the FIELD level, inherited by every collection rather than named again in each | mostly |
| **Aliases** — `bookcase` and `shelf_name` reading as the same field as `shelf` | **no: this changes what is read** |

That last row is the exception to "a declaration is only a label". A vault that disagrees with itself — some notes
saying `bookcase`, some saying `shelf` — has two unrelated fields until one is declared with the other as an alias:
two conditions, two group headings, two counts. Declared, one condition matches both. It is the same machinery that
lets a reader's `resource_url` answer as `source_url`.

So: **notes create fields; the Fields page configures them.** A field with nothing declared is not misconfigured,
it is simply a field nobody has needed to name.

**A collection can order a field's values its own way** — touching its "Value names and order" list makes the list
the collection's — **and Reset order takes it back** (`fieldOrderRows`, `value-rows.ts`). Offered only while the
order differs from the field's, beside a line saying what it reverts to. Only the order: names given in the
collection stay, and a list that keeps none goes back to following the field outright. Not an option in the Group
order dropdown, which already asks a different question — direction or size — but which does say whose order is in
effect, relabelling its two direction options in place as values are dragged or reset.

That derivation is also what keeps field resolution unscoped: `fieldKeys()` asks one question with no species, so
parsing, conditions, grouping, sorting and display need no species threaded through them — see
[One field table](#one-field-table-not-one-per-note-kind). The storage is one file, and the split is in the UX
rather than in the model.

Two details that follow: **what a row says is asked of its own species** — "Not in your reading records" rather
than "Not in your notes", since a field the records carry and the titles do not is not missing but elsewhere, and
the field editor counts a field's values over that species too (a record's `mark` has none at all among the title
notes); and **add and delete belong to Custom alone**, since the two species lists hold what Orbis defines. A
delete there would have to mean "stop reading this for records but keep it for titles", which is a concept nobody
asked for.

**The alias picker stays vault-wide.** A key has to be nameable BEFORE the note carrying it is a record of either
kind — that is what adoption is — so offering only what a species already holds would hide exactly the keys someone
came to the page to map.

### Collections: two lists, not a species dropdown

A collection carries conditions, a grouping, a time frame, a sort and value names, and **every one of them is
species-specific**. Toggling a collection's species after the fact would not invalidate one setting, it would
invalidate all of them — so the dropdown would need either a "this clears your conditions" confirmation or a silent
mess.

**Two lists make the invalid state unrepresentable**, which is the better fix in the same way that a set with no
rules being a no-op beats a warning about it. So: one top-level Collections page, two lists underneath — title-note
collections and reading-record collections.

Three consequences:

- **The provided collection has a sibling.** "All titles" is rebuilt from code and uneditable; "All reading
  records" is on the same terms, so a record collection has something to copy.
- **The widget's collection picker is grouped** by species — which is also how a widget learns which species it
  draws, with no field of its own.
- **Widget kinds narrow.** `continue`, `recordings` and `pick` are questions about BOOKS: what am I part-way
  through, what has audio beside it, suggest one nobody has decided about. None means anything for a highlight. A
  record collection offers `records`, `search`, `recent` and `summary`, so the kind dropdown depends on the
  collection — another reason the editor asks for the collection first.

**Each species' fields are its own schema.** `LIBRARY_FIELDS` heads the pickers for a title collection and
`RECORD_FIELDS` for a record one — `kind`, `excerpt`, `note_text`, `mark`, `book_title`, `author`, `chapter`, `loc`,
`created`, `tags`, `orphaned`. That list is a *subset* of `RECORD_PROPERTY_KEYS`, and the omissions are deliberate:
the navigation and sorting machinery (`orbis_cfi`, `cfi_sort`, `orbis_id`, `chapter_index`, `mark_badge`) and the
link shapes (`book`, `link`, `link_url`, `cover`) are not facts anyone filters on — `cfi_sort` is opaque by
construction and a wikilink compares as its own markup. They stay reachable under "Other keys in your notes", the
same place a title collection finds its own leftovers. A test asserts every name against `RECORD_PROPERTY_KEYS`, so
an invented key fails rather than becoming a condition that can never match.

Everything downstream of the schema follows it: the derived keys a record can be arranged by are its folder and its
tags and nothing else (a first letter is a letter of a title; `file.last-opened` comes from a book's sidecar, and a
highlight has no reading position of its own), a record collection sorts by `book_title` until told otherwise, and
every count in the two editors is worded in the units the collection gathers. "Matches 29 titles" under a list of
highlights is a number that reconciles with nothing on screen — and the count exists to be reconciled with.

### What a record row does

**Its primary action opens the book at its own location.** A record carries `orbis_cfi`, so tapping a highlight
opens the reader exactly there — which no Base or Dataview table can do, and which is the same argument that
justifies the library over Bases in the first place. Read is to a title what open-at-this-passage is to a record.

The field capability comes along unchanged, with a record's own vocabulary on offer: `excerpt`, `mark`, `chapter`,
`book`, `created`. A table of highlights by chapter with the passage as a column is then a thing someone can build
without us designing it.

- **The row leads with the passage, then your own words, then where it is.** A highlight IS its passage; a standalone
  note has only what you wrote; a bookmark has neither, so the chapter identifies it — a row reading "Bookmark" in a
  list of bookmarks identifies nothing. Below that, the fields the widget chose, `book_title · chapter` by default.
- **The tap opens the book at the CFI**, through the same open-then-navigate-when-ready retry the `orbis-nav` deep
  link uses — one copy of that wait, because a book that has just opened has no rendered document to navigate yet
  and a tap that appears to do nothing is indistinguishable from a broken row. A record whose book has left the
  vault says so; the note is still readable, and the missing half is the book.
- **An orphaned record says so on the row.** The passage is gone from the book, so the CFI lands nearby rather than
  exactly — the one case where nothing is wrong with the record and the destination is still approximate.
- **`records` is a kind, not a reuse of `titles`.** A widget's kind is what says which species it draws, and a kind
  meaning "titles here, records there" would be a name that lies about half the dashboards it appears on. The
  species itself is still the collection's, never a field on the widget.
- **The record path is its own code, not a generic one over both species.** A record is not a thinner title: no
  cover, no reading status, no series, a sentence from the middle of a book for a heading, and a different thing
  under the tap. Code that had to ask which species it was holding at every step could get it wrong at any of them.
- **Search over records has no ranking.** A title search ranks a match in the title above one in the author; a
  record has no field that IS its name, so "matched in the title" means nothing — the hits come back in reading
  order, then through whatever sort the collection asked for.
- **Covers are title-only.** A record collection draws as a list or a table.

### One arranger, two species

The rules a collection is arranged by are not about titles: which group a value belongs to, where the records that
say nothing go, what a value is called and in what order, whether a number sorts as a number, whether an absent
value sorts last whichever way the arrow points. **Only the reading differs** — which field answers a key, and which
keys mean more than a frontmatter lookup.

So `arrange.ts` is generic over the record type with an `ArrangeAccess<T>` seam, and there are two implementations:
`titleAccess` (series positions, ratings, first letters, `file.last-opened` from the sidecars) and `recordAccess`
(the record's cells, with reading order as the tie-break). `compareSpecial` is handed the same `text` and `num`
helpers the general path uses, so an implementation gets direction, the reader's value order and missing-last for
free rather than restating them.

One arranger rather than two, for the reason the field table states: two would drift. A record collection gets
everything a title collection has — grouping on any of its fields, the leftovers row, value names and order, time
frames including year-month and the aging bands, `reverse`/`most`/`fewest`, and a summary widget with a category
that opens into the passages under it — and `record-arrange.ts` is only an access and two entry points.

Sort works the same way, over a record's own fields, with reading order as the tie-break — which for highlights is
most comparisons, since a location spans paragraphs and several passages in one chapter routinely share one.

**The table takes the same seam.** Its rules are not about titles either — one column model for every group, a
leading column that is the row's identity and the only one that acts, a heading tap that sorts transiently and
within each group, the `⋯` at the far end — so `renderTable` is generic over a `TableSpec<T>`: what leads, what it
says, which cells answer a key, what a tap does, and an optional hook for a cell that is a picture rather than a
word.

For a record the **passage leads**, the same rule the list obeys, and it carries the tap — so a table of highlights
opens the book at one exactly as a list of them does. There is no cover column, because `cover` on a record is the
BOOK's and is not one of a record's fields. Cells are named as the collection names them, so a `mark` column and a
`mark` grouping in one widget cannot disagree about what a value is called.

### The cost we accept

**Two extra clicks for a reader who never turns reading records on.** Fields and Collections both have a level that
exists to separate two species, and someone using only titles pays for a distinction they do not have.

The alternative is worse: a settings page whose navigation depends on a toggle. One shape when records are off and
another when they are on cannot be explained, documented or supported — "go to Fields, then Title notes" stops
being true for half the readers, and the half it is false for cannot tell what they are missing. **One navigation
scheme, always**, is the trade.

### Labels

Each section of the Library page names its species in the copy rather than leaving it inferred — the notes folder,
"what the library reads", the cataloging review, the uncataloged notice — and the sections that are genuinely
title-only say so.

### Bases stay first-class

**Reading records are usable through Bases without dashboards being on.** That is the position
[Who owns which part of the UX](#who-owns-which-part-of-the-ux) already takes — Bases own the tables and the
grouped views, and we do not out-build them. A reader who wants records as a table has one; the widgets are for
what a table cannot do, which is the CFI action and everything derived from outside frontmatter.

---

## Archiving and the palette commands

There is no archiving and no pre-library book list. The library's Continue widget is the list of books you are
reading, and a reading status says where you are with a title.

### Archive and reading status are not the same thing

- **`archived`** would be about A LIST — "stop showing me this in my recent books". It is only meaningful when that
  list is every book ever opened.
- **`reading_status`** is about the TITLE — interested, reading, read, abandoned — and is visible to collections,
  groupings, filters, widgets and Bases.

Most archiving means "finished" or "gave up", both of which a status says better. What a status cannot say is "keep
this out of my recent list although I have not finished it" — a reference book dipped into constantly.

### Archiving earns no place

**The reason is not that it is small; it is that it cannot be honest.** A built-in "archived" has to hide titles
from collections that never mentioned it, which means either a condition every collection carries invisibly — the
opposite of *a collection gathers the notes its filters describe* — or a field the reader has to filter on anyway,
which is a convention rather than a feature.

**And a convention is what it should be**, since a status can be any value you name: someone who wants archiving
adds an **Archived** status, or a tag, and puts one condition on the collections that should ignore it. That is
thirty seconds of work, visible in every picker, and it composes with everything else. The provided **All titles**
cannot be filtered, so anyone wanting everything-but-archived copies it, which is the existing model for making a
provided thing yours.

An `.orbis` file may still carry `archived: true`; nothing reads it and nothing cleans it up. Removing it would mean
a write to every book's sidecar to erase a flag that is already inert — a vault-wide rewrite in exchange for tidiness
nobody can see.

**Without the library there is no list of recent books.** Continue is the way back to a book you were reading, so
someone who turns the library off gives that up. Accepted: two ways to answer "what was I reading" drift.

### The two modals

- **Set reading status** — the statuses the field offers, including any value declared on the Fields page, in the
  field's order.
- **Rate this book** — 0 to 5 in halves.

**A pick-one list, not a dropdown and a Save.** The row menu already settled the idiom: a list with the current
value ticked, where one tap sets it and closes. A dropdown makes the same act two interactions and a second idiom
for one thing.

**Clearing is choosing the value again**, as it is in the row menu, and there is no clearing row. The tick is in
view — it is the row the dialog scrolls to — and a second way to clear would make one tap do different things
depending on which surface you were looking at.

**In the palette and in the reader's ⋯ menu**, both. The palette is where you reach for a command; the ⋯ is where
you already are when you finish a chapter. Neither is a reason to leave the other out.

**They write the title note, and create one if the book has none.** Status and rating live in frontmatter, so a
book nobody has cataloged has nowhere to put them — and refusing at that point would be refusing the one gesture
the commands exist for. Gated on the library being on, because a title note is a library object.

Three details that come with creating a note:

- **Where it goes** when no records folder is set: derived, as the configuration files are — beside the title notes
  the vault already has, and the vault root if it has none. Asking would turn "mark this Finished" into a setup
  flow.
- **What it costs**: writing a note from a book reads the book's metadata, which is an archive read — quick for
  EPUB, slow for MOBI, whose parser initializes the whole book to reach the header.
- **What it says**: the notice names both halves — "Cataloged *Sample Book*" above "Reading status set to Finished"
  — because a silent new note in someone's vault is exactly the kind of surprise that costs a plugin its credit.

**Two commands, not one dialog.** Status and rating are often set together and the temptation is a single dialog
that does both; a dialog offering two unrelated decisions invites the combination nobody wants. Two lists, one act
each, same component.

- **One list, two surfaces.** `library/choices.ts` holds what the pickers offer, and the library's row menu reads it
  too. The row menu and the dialogs are the same question in two places, and a second copy is how a status renamed
  on the Fields page would end up showing under its old name in one of them.
- **The ⋯ menu's two items end in an ellipsis** and the palette's two do not, which is the existing split between
  `pane_menu.*` and a command name: in a menu the ellipsis says "this opens a dialog", and a command palette entry
  says it by being a command.
- **Showing a note splits beside what you were looking at, and reveals the pane it is already in.** `getLeaf(false)`
  would replace whatever asked — the book you were reading, or the Library you were browsing — and a tab keeps the
  book loaded but puts the note in front of it, which loses the book one keystroke later. One helper,
  `openNoteBeside`, serves the reader's ⋯ menu, the explorer menu, the palette command, the Library's rows, Show
  reading data and the companion-notes flows.
- **Rows, not buttons.** Obsidian's mobile stylesheet reaches every `button` inside a plugin's dialog and sizes it
  for itself, so the list is divs with `role="button"` and the keyboard behavior spelled out — the same shape the
  summary widget's rows use.

A retired status reads as none, which is `fieldValuesFor` dropping disabled values on the way past: the note keeps
what it says, nothing is ticked, and setting a new status is what puts it right.

---

## Library folders

Orbis writes library things into several places: title notes, covers, downloaded books, generated EPUBs. Those
settings live on different pages, beside the feature that writes each one, which is where someone looks for them —
but it also means nobody can answer "where does Orbis put things" without opening four of them.

A page listing every folder the library writes to, by purpose, is not built. Folder pickers that offer the folders
already in use ahead of the rest buy nothing: a folder is chosen once, in settings, and every dialog that asks again
pre-fills from that answer.

The one part worth building: **when the records folder is unset and the vault already has title notes, default it
to where they are** — removing the choice rather than reordering it.

---

## The settings surface

A top-level `Library` page:

| Row | Scope | Notes |
|---|---|---|
| Show the library | Synced | The Library on or off |
| Folder for new title notes | Synced | Where generated notes are written |
| Save cover images | Synced | Extract a cover when a title note is written |
| Covers folder | Synced | Where extracted covers go |
| Library status | — | What the library holds, with a review of anything uncataloged |
| Show a notice when books are uncataloged | Per device | The discovery notice, on or off |
| Dashboards and collections | Synced | A page of its own: dashboards, widgets and collections |
| Fields | Synced | A page of its own: the field table and its aliases |

Book sources have their own page — see [Book Sources](book-sources.md).

### The key pickers are grouped

A collection's filter, grouping and sort dropdowns do not offer every frontmatter key in the vault in one
alphabetical run. That run mixes three unrelated things: the fields the library reads, the keys a reader's own notes
happen to carry, and the machinery of other features — `cfi_sort`, `mark_badge`, `chapter_index` — which nothing
here should filter by. Sorted together, `authors` sits between `author_count` and `book`, which is where it is
hardest to find.

Three groups: **the fields the library reads**, under their own headings and in schema order; **about the note** —
its folder, its tags, a first letter, when it was last opened, which are facts about the file rather than about the
title; then **everything else the vault holds**, alphabetically, named by its key because that is all anyone knows
about it.

**Aliases are folded away.** A key mapped onto a library field — `resource_url` onto `source_url` — already answers
as that field, so offering it separately offers two doors to one room and invites a rule that reads half a vault.

**And the keys come from the notes of the species being filtered, not from the vault.** A collection's conditions
run over one species and nothing else, so a key carried only by the other species, a daily note or a project page is
a rule that can never match. A record collection asks the records the same way, and heads its own list with
`RECORD_FIELDS`. The Fields page keeps the vault-wide scan on purpose: a key has to be nameable BEFORE the note
carrying it is a record, which is what adoption is, and a picker scoped to records would hide exactly the keys
someone is there to map.

### The editors have sections

A widget is a kind, a hint, a collection, a heading, a view, a count, an expanded view and — for search — an order;
a collection is a name, any number of condition sets, a grouping, the names and order of that field's values, and a
sort with as many levels as someone wants. In one scrolling column on a phone, the question you are answering is far
from the one that decides whether it applies, and the keyboard covers whatever is under it.

**They are tabbed, the way the annotation presets manager is** — and so is the field editor. A widget is *General* /
*View*, a collection is *Filters* / *Group by and sort*, and a field is *Field* / *Values*. Two rules.
**Identity and live feedback sit outside the strip** — the collection's name and its "matches N titles" count, the
widget's heading — because a name is what you are editing rather than one of its settings, and a count that answers
"did I get this right" must not be on a tab. And **a tab holding one control is a tab you land on and leave**: Group
by is one dropdown, so it shares with Sort by rather than getting a tab of its own.

The general conventions — tabs, read-only rows, the pencil — are written down in
[Dialog System](dialog-system.md#lists-inside-dialogs) rather than here, because they apply to every dialog in the
plugin.

**A dialog that grows takes the screen on a phone** (`fullScreenOnMobile`), because a capped one puts its own
buttons under the keyboard — and a dialog that does this must not ALSO pin itself above the keyboard, which jams it.
And **a sticky action row is not a footer**: it stays on screen by covering the field behind it, which is exactly the
field someone is filling in.

---

## What this replaces

The library is the one answer to "what was I reading": there is no second book list, and no per-book vault scan
behind one, because two ways to answer the same question drift.

### Destructive actions

**Nothing in this view deletes anything.**

Deleting a record is deleting a note, and must say so. Deleting the *title* — the note, the files, the `.orbis`, its
recordings and its reading records — must be a separate, clearly named action that counts what it will destroy
before asking. Anything less is a file manager wearing a library's clothes.

---

## Costs and risks

**The first-run cliff is the real risk.** A vault with books and no notes shows an empty library. Discovery and
bulk cataloging are not polish; they are what makes the model viable.

**Note count.** A thousand-title catalog is a thousand notes. Ordinary for Obsidian and awful if they land in the
wrong place, so the destination folder is a setting and the generator uses one folder by default. Taxonomy notes are
not generated, so title notes are the only notes cataloging multiplies.

**We are not building a database.** Bases renders frontmatter as tables better than we will. The
[ownership map](#who-owns-which-part-of-the-ux) is the mitigation, and it has to be defended in review, because
"just one more column" is how a library becomes a spreadsheet.

**The join is a soft link.** A record whose file link is missing or wrong shows nothing to read while the file sits
in the vault. The same-folder basename fallback catches the common case; a stricter guess would attach progress to
the wrong title, which is worse.

**Metadata quality varies.** Plenty of EPUBs carry a `dc:creator` of "Unknown" or a title in shouting caps. The
view reports what the file says — [source fidelity](roadmap.md) — and lets the reader fix it in the note; it does
not invent a tidier answer than the source supports.

**Generic versus good.** The mechanism allows any media; the experience is built for books. The mitigation is a
rule, not a promise: we ship no type-specific screens.

---

## Open questions

1. **Should the library be openable as a startup view** — the "start page" framing — or is that too opinionated to
   default on?
2. **Series grouping**: collapsing "book 1–7 of X" into one row is genuinely useful in a large catalog and
   genuinely more model.
3. **How does a document reach someone?** Documents get sent. Whether the library grows a share action or leaves
   that to [Marks to PDF](marks-pdf.md) is unanswered.
4. **Audio-only titles** need a position and chapter model that does not come from a spine. Named here, designed
   elsewhere.

## Rough ideas, not designed

Each is a sentence someone will have to turn into a design, and the shapes below are a first reading rather than a
decision.

### Printing and exporting a widget

**Two ideas, and only one of them has a motivation yet.**

**Print a widget.** Wanting a shelf list on paper is the same instinct that built
[Marks to PDF](marks-pdf.md) — and that machinery already exists, cover sheet, legend, page numbers and all. So
this does not have to go the indirect route of dumping markdown and printing the note: the same generator could take
a widget's rows. The indirect route is also lossier, since a markdown table's columns become whatever the theme does
with them.

**Export a widget.** A markdown or CSV snapshot, for getting the data somewhere else. Real but speculative, and it
carries the trap that a snapshot looks live: its titles are correct the day they are written and wrong a week later,
so it would have to stamp itself with a date and name the collection it came from.

**The view decides what can be exported.** A table has columns and becomes a table; a list becomes a list; a shelf
of covers is a page layout rather than a data shape, and would have to fall back to a list or not offer it.

**Not a Base.** Generating a `.base` from a collection is the harder half: conditions over frontmatter translate, but
nothing derived from outside it does — recorded audio, last opened, the aging bands, "in the last 30 days" against
today. A Base that quietly meant something narrower than the collection would be worse than no Base.

If only one of these is ever built, it should be the print: the motivation is real, the machinery is there, and it
leaves no artifact to decay.

---

## Out of scope

### Taxonomy notes are out of scope

Author, series, subject and type notes carrying a live `base` query, an index note, and facet chips that link to
them are not generated.

**A collection and a summary widget answer the same question, and answer it better.** Group a collection by author
and every author is a row with a count that opens; the same for series, subject and type. A widget also reaches
what a query cannot see — reading position from the sidecars, recordings on disk, extracted covers — and carries
the actions: Read, Listen, open a passage, set a status. Generating thousands of notes to duplicate the facet half
of that, with naming collisions (`Tester, Orbis` and `Orbis Tester`), queries going stale when a field is
mapped or a value renamed, and regeneration fighting whatever prose the reader added, is a large surface for a
smaller answer.

**The reading records bases are not a precedent for library bases.** They exist so records are usable **with the
library switched off entirely**, and because a table over frontmatter is the thing this design explicitly refuses
to out-build — see [Who owns which part of the UX](#who-owns-which-part-of-the-ux). Titles have no equivalent gap:
the library IS the surface for titles, and it is the only one that can open a book.

**What a note still does that a widget cannot is exist outside the Library tab** — in the graph, in backlinks, in a
hover preview, and at the end of a `[[link]]` in the reader's own writing. That is real, and it is one note at a
time: someone who wants a page ABOUT an author writes it and pastes a base query under their own paragraph. The
manual path costs nothing, stays theirs, and needs no feature.

### Alias detection is out of scope

Orbis does not find the keys nothing reads and offer them as mappings.

**The blocker is that a key's meaning is not knowable from outside.** `user_rating` and `community_rating` are the
same shape and one of them is a lie about your opinion; `epub_link` and `cover` are both wikilinks to files. Value
shape narrows a guess and never settles it, and key names are the tempting signal and the dangerous one. A feature
whose whole output is a suggestion has to be right often enough to be worth reading, and this one would not be.

**And the case it serves is narrow.** It exists for a vault that already holds thousands of notes written by
someone else's exporter, which few vaults are. Someone arriving with an empty vault gets title notes written by
cataloging, in Orbis's own keys, and never needs a mapping at all.

**What stays is enough for the people who do need it.** The Fields page maps any key onto any field by hand, and
a field row says "Not in your title notes" when nothing feeds it, which is the symptom that sends someone there.
Guessing the other half of that sentence is not worth the wrong answers.
